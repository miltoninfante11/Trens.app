// ============================================================================
// INSTAGRAM OAUTH - Supabase Edge Function
// Manejo seguro de tokens OAuth de Instagram
// ============================================================================
// Acciones soportadas:
//   exchange-code  → Intercambiar código por Short-Lived → Long-Lived Token
//   disconnect     → Eliminar integración de un usuario
// ============================================================================
// El intercambio de tokens DEBE hacerse server-side porque requiere el
// App Secret de Instagram, que nunca debe exponerse en el cliente.
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

const IG_APP_ID = Deno.env.get('IG_APP_ID') || '';
const IG_APP_SECRET = Deno.env.get('IG_APP_SECRET') || '';

const IG_TOKEN_URL = 'https://api.instagram.com/oauth/access_token';
const IG_GRAPH_API = 'https://graph.instagram.com';

// ============================================================================
// HELPERS
// ============================================================================

/** Paso 1: Intercambiar código de autorización por Short-Lived Token */
async function exchangeCodeForShortToken(
  code: string,
  redirectUri: string
): Promise<{ access_token: string; user_id: number } | null> {
  console.log('🔑 Step 1: Exchanging code for short-lived token...');

  const formData = new URLSearchParams();
  formData.append('client_id', IG_APP_ID);
  formData.append('client_secret', IG_APP_SECRET);
  formData.append('grant_type', 'authorization_code');
  formData.append('redirect_uri', redirectUri);
  formData.append('code', code);

  const response = await fetch(IG_TOKEN_URL, {
    method: 'POST',
    body: formData,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });

  const data = await response.json();

  if (!response.ok || data.error_message) {
    console.error('❌ Short-lived token error:', data);
    return null;
  }

  console.log(`✅ Got short-lived token for IG user: ${data.user_id}`);
  return { access_token: data.access_token, user_id: data.user_id };
}

/** Paso 2: Intercambiar Short-Lived por Long-Lived Token (60 días) */
async function exchangeForLongLivedToken(
  shortToken: string
): Promise<{ access_token: string; expires_in: number } | null> {
  console.log('🔑 Step 2: Exchanging for long-lived token...');

  const url =
    `${IG_GRAPH_API}/access_token` +
    `?grant_type=ig_exchange_token` +
    `&client_secret=${IG_APP_SECRET}` +
    `&access_token=${shortToken}`;

  const response = await fetch(url);
  const data = await response.json();

  if (!response.ok || data.error) {
    console.error('❌ Long-lived token error:', data);
    return null;
  }

  console.log(
    `✅ Got long-lived token (expires in ${data.expires_in}s = ~${Math.round(data.expires_in / 86400)} days)`
  );
  return { access_token: data.access_token, expires_in: data.expires_in };
}

/** Paso 3: Obtener perfil del usuario de Instagram */
async function getIGUserProfile(
  accessToken: string
): Promise<{ id: string; username: string } | null> {
  console.log('👤 Step 3: Fetching IG user profile...');

  const url = `${IG_GRAPH_API}/me?fields=id,username&access_token=${accessToken}`;
  const response = await fetch(url);
  const data = await response.json();

  if (!response.ok || data.error) {
    console.error('❌ Profile fetch error:', data);
    return null;
  }

  console.log(`✅ IG Profile: @${data.username} (${data.id})`);
  return { id: data.id, username: data.username };
}

// ============================================================================
// ACTION: exchange-code
// Flujo completo: Code → Short Token → Long Token → Save to DB
// ============================================================================

async function handleExchangeCode(
  supabaseAdmin: any,
  userId: string,
  code: string,
  redirectUri: string
): Promise<{ success: boolean; username?: string; error?: string }> {
  // Paso 1: Code → Short-Lived Token
  const shortResult = await exchangeCodeForShortToken(code, redirectUri);
  if (!shortResult) {
    return {
      success: false,
      error: 'No se pudo obtener el token de Instagram. Verifica el código.',
    };
  }

  // Paso 2: Short-Lived → Long-Lived Token
  const longResult = await exchangeForLongLivedToken(shortResult.access_token);
  if (!longResult) {
    return { success: false, error: 'No se pudo obtener el token de larga duración.' };
  }

  // Paso 3: Obtener perfil de IG
  const profile = await getIGUserProfile(longResult.access_token);
  if (!profile) {
    return { success: false, error: 'No se pudo obtener tu perfil de Instagram.' };
  }

  // Paso 4: Calcular expiración y guardar en DB
  const expiresAt = new Date();
  expiresAt.setSeconds(expiresAt.getSeconds() + longResult.expires_in);

  const integrationData = {
    user_id: userId,
    provider: 'instagram',
    ig_user_id: profile.id,
    ig_username: profile.username,
    access_token: longResult.access_token,
    token_expires_at: expiresAt.toISOString(),
    scopes: ['instagram_business_basic'],
  };

  // Upsert: si ya existe una integración, la actualiza
  const { error: upsertError } = await supabaseAdmin
    .from('user_integrations')
    .upsert(integrationData, {
      onConflict: 'user_id,provider',
    });

  if (upsertError) {
    console.error('❌ DB upsert error:', upsertError);
    return { success: false, error: 'Error al guardar la integración en la base de datos.' };
  }

  console.log(`🎉 Instagram linked: @${profile.username} → user ${userId}`);
  return { success: true, username: profile.username };
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

    console.log(`\n🔐 Instagram OAuth: action=${action}`);

    // Autenticar usuario desde JWT
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ success: false, error: 'No authorization header' }), {
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
      return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 401,
      });
    }

    // Cliente admin (bypass RLS)
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    switch (action) {
      // ---- EXCHANGE CODE ----
      case 'exchange-code': {
        const { code, redirect_uri } = body;

        if (!code || !redirect_uri) {
          return new Response(
            JSON.stringify({ success: false, error: 'Missing code or redirect_uri' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
          );
        }

        if (!IG_APP_ID || !IG_APP_SECRET) {
          return new Response(
            JSON.stringify({ success: false, error: 'Instagram App not configured on server' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
          );
        }

        const result = await handleExchangeCode(supabaseAdmin, user.id, code, redirect_uri);

        return new Response(JSON.stringify(result), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: result.success ? 200 : 400,
        });
      }

      // ---- DISCONNECT ----
      case 'disconnect': {
        const { error: delError } = await supabaseAdmin
          .from('user_integrations')
          .delete()
          .eq('user_id', user.id)
          .eq('provider', 'instagram');

        if (delError) {
          return new Response(JSON.stringify({ success: false, error: delError.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 500,
          });
        }

        // Desactivar posts del usuario en el feed
        await supabaseAdmin
          .from('trens_feed')
          .update({ is_active: false })
          .eq('user_id', user.id)
          .eq('is_official', false);

        return new Response(JSON.stringify({ success: true, message: 'Instagram desvinculado' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      default:
        return new Response(
          JSON.stringify({ success: false, error: `Unknown action: ${action}` }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
    }
  } catch (error: any) {
    console.error('💥 Instagram OAuth error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message || 'Internal server error' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
