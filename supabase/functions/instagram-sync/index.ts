// ============================================================================
// INSTAGRAM SYNC - Supabase Edge Function
// Sincronización de Reels desde Instagram Graph API
// ============================================================================
// Acciones soportadas:
//   sync-official  → Sincronizar Reels de la cuenta oficial TRENS (cron)
//   sync-user      → Sincronizar Reels de un usuario vinculado
//   refresh-tokens → Refrescar tokens próximos a expirar (cron)
// ============================================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ============================================================================
// CONFIG
// ============================================================================

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

// Instagram Official Account
const IG_OFFICIAL_TOKEN = Deno.env.get('IG_OFFICIAL_TOKEN') || '';
const IG_OFFICIAL_USER_ID = Deno.env.get('IG_OFFICIAL_USER_ID') || '';

const IG_GRAPH_API = 'https://graph.instagram.com';

// ============================================================================
// TYPES
// ============================================================================

interface IGMedia {
  id: string;
  media_type: 'IMAGE' | 'VIDEO' | 'CAROUSEL_ALBUM';
  media_url?: string;
  thumbnail_url?: string;
  caption?: string;
  permalink?: string;
  timestamp?: string;
  like_count?: number;
  comments_count?: number;
}

interface IGMediaResponse {
  data: IGMedia[];
  paging?: {
    cursors: { before: string; after: string };
    next?: string;
  };
}

interface SyncResult {
  success: boolean;
  synced: number;
  skipped: number;
  errors: string[];
  source: 'official' | 'user';
}

// ============================================================================
// HELPERS
// ============================================================================

/** Extrae hashtags de un caption */
function extractHashtags(caption: string | null | undefined): string[] {
  if (!caption) return [];
  const matches = caption.match(/#[\w\u00C0-\u024F]+/g);
  return matches ? matches.map((h: string) => h.toLowerCase()) : [];
}

/** Fetch a Instagram Graph API con manejo de errores */
async function igFetch<T>(url: string): Promise<{ ok: boolean; data: T | null; error?: string }> {
  try {
    console.log(`📸 IG Fetch: ${url.substring(0, 100)}...`);
    const response = await fetch(url);
    const text = await response.text();

    let data: any;
    try {
      data = JSON.parse(text);
    } catch {
      return { ok: false, data: null, error: `Invalid JSON: ${text.substring(0, 200)}` };
    }

    if (!response.ok) {
      const errMsg = data?.error?.message || `HTTP ${response.status}`;
      const errCode = data?.error?.code;
      console.error(`❌ IG API Error [${errCode}]: ${errMsg}`);

      // Token expirado
      if (errCode === 190 || data?.error?.error_subcode === 463) {
        return { ok: false, data: null, error: `TOKEN_EXPIRED: ${errMsg}` };
      }
      return { ok: false, data: null, error: errMsg };
    }

    return { ok: true, data: data as T };
  } catch (error: any) {
    return { ok: false, data: null, error: error.message };
  }
}

/**
 * Fetch Reels de un usuario de Instagram CON PAGINACIÓN COMPLETA.
 * maxPages controla cuántas páginas fetchar (default 10 = hasta ~250 items).
 * Para sync oficial usamos todas las páginas; para usuarios, 1-2 páginas.
 */
async function fetchReels(
  accessToken: string,
  igUserId: string,
  limit = 50,
  maxPages = 10
): Promise<{ reels: IGMedia[]; error?: string }> {
  const fields =
    'id,media_type,media_url,thumbnail_url,caption,permalink,timestamp,like_count,comments_count';
  let url: string | null =
    `${IG_GRAPH_API}/${igUserId}/media?fields=${fields}&limit=${limit}&access_token=${accessToken}`;

  const allVideos: IGMedia[] = [];
  let page = 0;

  while (url && page < maxPages) {
    page++;
    console.log(`📄 Fetching page ${page}...`);

    const result = await igFetch<IGMediaResponse>(url);

    if (!result.ok || !result.data) {
      // Si es la primera página y falla, retornar error
      if (page === 1) return { reels: [], error: result.error };
      // Si falla en páginas posteriores, retornar lo que tenemos
      console.warn(`⚠️ Page ${page} failed, returning ${allVideos.length} reels so far`);
      break;
    }

    const videos = result.data.data.filter((m) => m.media_type === 'VIDEO');
    allVideos.push(...videos);

    console.log(
      `📹 Page ${page}: ${videos.length} videos / ${result.data.data.length} total media`
    );

    // Avanzar a la siguiente página
    url = result.data.paging?.next || null;
  }

  console.log(`📹 Total: ${allVideos.length} videos across ${page} pages`);
  return { reels: allVideos };
}

/** Upsert de Reels en trens_feed */
async function upsertReels(
  supabaseAdmin: any,
  reels: IGMedia[],
  userId: string | null,
  isOfficial: boolean,
  syncSource: string,
  hashtagFilter?: string
): Promise<{ synced: number; skipped: number; errors: string[] }> {
  let synced = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const reel of reels) {
    try {
      // Filtro por hashtag (opcional)
      if (hashtagFilter) {
        const hashtags = extractHashtags(reel.caption);
        if (!hashtags.includes(hashtagFilter.toLowerCase())) {
          skipped++;
          continue;
        }
      }

      // No guardar si no tiene URL de video
      if (!reel.media_url) {
        skipped++;
        continue;
      }

      const feedItem = {
        user_id: userId,
        ig_media_id: reel.id,
        ig_permalink: reel.permalink || null,
        video_url: reel.media_url,
        thumbnail_url: reel.thumbnail_url || null,
        caption: reel.caption || null,
        hashtags: extractHashtags(reel.caption),
        is_official: isOfficial,
        media_type: 'VIDEO',
        ig_timestamp: reel.timestamp || null,
        sync_source: syncSource,
        like_count: reel.like_count || 0,
        comment_count: reel.comments_count || 0,
        is_active: true,
      };

      const { error } = await supabaseAdmin
        .from('trens_feed')
        .upsert(feedItem, { onConflict: 'ig_media_id' });

      if (error) {
        console.error(`❌ Upsert error for ${reel.id}:`, error.message);
        errors.push(`${reel.id}: ${error.message}`);
      } else {
        synced++;
      }
    } catch (err: any) {
      errors.push(`${reel.id}: ${err.message}`);
    }
  }

  return { synced, skipped, errors };
}

// ============================================================================
// ACTION: sync-official (Cron Job)
// Sincroniza los Reels de la cuenta oficial de TRENS
// ============================================================================

async function handleSyncOfficial(supabaseAdmin: any): Promise<SyncResult> {
  console.log('🏢 Starting official TRENS sync...');

  if (!IG_OFFICIAL_TOKEN || !IG_OFFICIAL_USER_ID) {
    return {
      success: false,
      synced: 0,
      skipped: 0,
      errors: ['IG_OFFICIAL_TOKEN or IG_OFFICIAL_USER_ID not configured'],
      source: 'official',
    };
  }

  // Fetch TODOS los Reels con paginación completa (hasta 10 páginas)
  const { reels, error } = await fetchReels(IG_OFFICIAL_TOKEN, IG_OFFICIAL_USER_ID, 50, 10);

  if (error) {
    return { success: false, synced: 0, skipped: 0, errors: [error], source: 'official' };
  }

  const result = await upsertReels(supabaseAdmin, reels, null, true, 'cron');

  console.log(`✅ Official sync: ${result.synced} synced, ${result.skipped} skipped`);

  return {
    success: result.errors.length === 0,
    synced: result.synced,
    skipped: result.skipped,
    errors: result.errors,
    source: 'official',
  };
}

// ============================================================================
// ACTION: sync-user
// Sincroniza los Reels de un usuario PRO vinculado con Instagram
// ============================================================================

async function handleSyncUser(
  supabaseAdmin: any,
  userId: string,
  hashtagFilter?: string
): Promise<SyncResult> {
  console.log(`👤 Starting user sync for ${userId}...`);

  // 1. Obtener token del usuario
  const { data: integration, error: intError } = await supabaseAdmin
    .from('user_integrations')
    .select('*')
    .eq('user_id', userId)
    .eq('provider', 'instagram')
    .single();

  if (intError || !integration) {
    return {
      success: false,
      synced: 0,
      skipped: 0,
      errors: ['Instagram no vinculado. Conecta tu cuenta primero.'],
      source: 'user',
    };
  }

  // 2. Verificar que el token no esté expirado
  const expiresAt = new Date(integration.token_expires_at);
  if (expiresAt <= new Date()) {
    return {
      success: false,
      synced: 0,
      skipped: 0,
      errors: ['Token expirado. Reconecta tu cuenta de Instagram.'],
      source: 'user',
    };
  }

  // 3. Fetch Reels del usuario (2 páginas máx = ~100 reels)
  const { reels, error: fetchError } = await fetchReels(
    integration.access_token,
    integration.ig_user_id,
    50,
    2
  );

  if (fetchError) {
    // Si el token expiró en Meta, marcar como expirado
    if (fetchError.startsWith('TOKEN_EXPIRED')) {
      await supabaseAdmin
        .from('user_integrations')
        .update({ token_expires_at: new Date().toISOString() })
        .eq('id', integration.id);
    }

    return { success: false, synced: 0, skipped: 0, errors: [fetchError], source: 'user' };
  }

  // 4. Upsert con filtro de hashtag
  const result = await upsertReels(
    supabaseAdmin,
    reels,
    userId,
    false,
    'oauth_sync',
    hashtagFilter
  );

  console.log(`✅ User sync: ${result.synced} synced, ${result.skipped} skipped`);

  return {
    success: result.errors.length === 0,
    synced: result.synced,
    skipped: result.skipped,
    errors: result.errors,
    source: 'user',
  };
}

// ============================================================================
// ACTION: refresh-tokens (Cron Job)
// Refresca tokens que expirarán en los próximos 7 días
// ============================================================================

async function handleRefreshTokens(supabaseAdmin: any): Promise<{
  success: boolean;
  refreshed: number;
  failed: number;
  errors: string[];
}> {
  console.log('🔄 Starting token refresh...');

  // Buscar tokens que expiran en los próximos 7 días
  const sevenDaysFromNow = new Date();
  sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);

  const { data: expiring, error } = await supabaseAdmin
    .from('user_integrations')
    .select('*')
    .eq('provider', 'instagram')
    .lt('token_expires_at', sevenDaysFromNow.toISOString())
    .gt('token_expires_at', new Date().toISOString());

  if (error || !expiring) {
    return { success: false, refreshed: 0, failed: 0, errors: [error?.message || 'Query error'] };
  }

  console.log(`🔍 Found ${expiring.length} tokens to refresh`);

  let refreshed = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const integration of expiring) {
    try {
      const url =
        `${IG_GRAPH_API}/refresh_access_token` +
        `?grant_type=ig_refresh_token` +
        `&access_token=${integration.access_token}`;

      const result = await igFetch<{
        access_token: string;
        token_type: string;
        expires_in: number;
      }>(url);

      if (!result.ok || !result.data) {
        failed++;
        errors.push(`${integration.ig_username}: ${result.error}`);
        continue;
      }

      // Calcular nueva fecha de expiración
      const newExpiresAt = new Date();
      newExpiresAt.setSeconds(newExpiresAt.getSeconds() + result.data.expires_in);

      await supabaseAdmin
        .from('user_integrations')
        .update({
          access_token: result.data.access_token,
          token_expires_at: newExpiresAt.toISOString(),
        })
        .eq('id', integration.id);

      refreshed++;
      console.log(`✅ Refreshed token for ${integration.ig_username}`);
    } catch (err: any) {
      failed++;
      errors.push(`${integration.ig_username}: ${err.message}`);
    }
  }

  return { success: failed === 0, refreshed, failed, errors };
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

serve(async (req: Request) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { action } = body;

    console.log(`\n📸 Instagram Sync: action=${action}`);

    // Cliente admin de Supabase (service_role para bypass RLS)
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    switch (action) {
      // ---- SYNC OFICIAL (CRON) ----
      case 'sync-official': {
        const result = await handleSyncOfficial(supabaseAdmin);
        return new Response(JSON.stringify(result), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: result.success ? 200 : 500,
        });
      }

      // ---- SYNC USUARIO ----
      case 'sync-user': {
        // Autenticar usuario desde el JWT
        const authHeader = req.headers.get('Authorization');
        if (!authHeader) {
          return new Response(JSON.stringify({ error: 'No authorization header' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 401,
          });
        }

        const supabaseUser = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY') || '', {
          global: { headers: { Authorization: authHeader } },
        });

        const {
          data: { user },
          error: authError,
        } = await supabaseUser.auth.getUser();
        if (authError || !user) {
          return new Response(JSON.stringify({ error: 'Unauthorized' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 401,
          });
        }

        const result = await handleSyncUser(supabaseAdmin, user.id, body.hashtag_filter);

        return new Response(JSON.stringify(result), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: result.success ? 200 : 500,
        });
      }

      // ---- REFRESH TOKENS (CRON) ----
      case 'refresh-tokens': {
        const result = await handleRefreshTokens(supabaseAdmin);
        return new Response(JSON.stringify(result), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: result.success ? 200 : 500,
        });
      }

      default:
        return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        });
    }
  } catch (error: any) {
    console.error('💥 Instagram Sync error:', error);
    return new Response(JSON.stringify({ error: error.message || 'Internal server error' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
