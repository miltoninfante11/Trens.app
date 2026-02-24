// ============================================================================
// INSTAGRAM SERVICE
// Cliente para la Graph API de Meta/Instagram + OAuth flow
// Singleton pattern (como SpotifyService)
// ============================================================================

import { Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { supabase } from '../../lib/supabase';
import { logger } from '../../lib/logger';
import type { InstagramConnectionStatus, TrensFeedInsert, SyncResult } from '../../types/instagram';

// ============================================================================
// CONSTANTES
// ============================================================================

const IG_OAUTH_URL = 'https://www.instagram.com/oauth/authorize';

// Instagram App Config (se configuran en app.json > extra o env)
const IG_APP_ID = Constants.expoConfig?.extra?.instagramAppId || '';

// Deep link scheme
const SCHEME = Constants.expoConfig?.scheme || 'trensdev';

// Storage keys
const STORAGE_KEYS = {
  RETURN_PATH: '@instagram_return_path',
  CONNECTION_CACHE: '@instagram_connection_cache',
} as const;

// Scopes para Instagram Graph API
const IG_BASIC_SCOPES = ['instagram_business_basic'].join(',');

// ============================================================================
// HELPERS
// ============================================================================

/** Extrae hashtags de un caption */
function extractHashtags(caption: string | null | undefined): string[] {
  if (!caption) return [];
  const matches = caption.match(/#[\w\u00C0-\u024F]+/g);
  return matches ? matches.map((h) => h.toLowerCase()) : [];
}

/** Verifica si un error de la API es por token expirado */
function isTokenExpiredError(error: {
  error?: { code?: number; error_subcode?: number };
}): boolean {
  const code = error?.error?.code;
  const subcode = error?.error?.error_subcode;
  // 190 = Invalid/expired token, 463 = Token expired, 467 = Invalid token
  return code === 190 || subcode === 463 || subcode === 467;
}

/**
 * Redirect URI canónico para OAuth de Instagram.
 * DEBE coincidir EXACTAMENTE con el configurado en Meta for Developers.
 * En web siempre usamos el dominio canónico (no window.location.origin)
 * para evitar mismatches con subdominios de Cloudflare Pages.
 */
const WEB_CANONICAL_ORIGIN = 'https://trens.app';

function getRedirectUri(): string {
  if (Platform.OS === 'web') {
    return `${WEB_CANONICAL_ORIGIN}/instagram-callback`;
  }
  // En native, usamos deep link
  return `${SCHEME}://instagram-callback`;
}

// ============================================================================
// INSTAGRAM SERVICE CLASS
// ============================================================================

class InstagramService {
  private static instance: InstagramService;

  private constructor() {}

  static getInstance(): InstagramService {
    if (!InstagramService.instance) {
      InstagramService.instance = new InstagramService();
    }
    return InstagramService.instance;
  }

  // ==========================================================================
  // OAUTH FLOW
  // ==========================================================================

  /**
   * Inicia el flujo OAuth de Instagram
   * Abre el navegador con la pantalla de autorización de Meta
   */
  async startOAuthFlow(returnPath?: string): Promise<void> {
    try {
      // Guardar path de retorno
      if (returnPath) {
        await AsyncStorage.setItem(STORAGE_KEYS.RETURN_PATH, returnPath);
      }

      const redirectUri = getRedirectUri();
      const state = Math.random().toString(36).substring(2, 15);

      const authUrl =
        `${IG_OAUTH_URL}` +
        `?client_id=${IG_APP_ID}` +
        `&redirect_uri=${encodeURIComponent(redirectUri)}` +
        `&scope=${encodeURIComponent(IG_BASIC_SCOPES)}` +
        `&response_type=code` +
        `&state=${state}`;

      logger.info('[Instagram] Starting OAuth flow', { redirectUri });

      if (Platform.OS === 'web') {
        // En web, redirigimos directamente
        window.location.href = authUrl;
      } else {
        // En native, usamos WebBrowser
        await WebBrowser.openBrowserAsync(authUrl);
      }
    } catch (error) {
      logger.error('[Instagram] OAuth flow error:', error);
      throw new Error('No se pudo iniciar la conexión con Instagram');
    }
  }

  /**
   * Procesa el código de autorización recibido del callback
   * Lo envía a la Edge Function para intercambiar por tokens de forma segura
   */
  async processAuthCode(code: string): Promise<{ success: boolean; username?: string }> {
    try {
      logger.info('[Instagram] Processing auth code...');

      const redirectUri = getRedirectUri();

      // Llamar a la Edge Function que maneja el intercambio de tokens
      const { data, error } = await supabase.functions.invoke('instagram-oauth', {
        body: {
          action: 'exchange-code',
          code,
          redirect_uri: redirectUri,
        },
      });

      if (error) {
        logger.error('[Instagram] Edge function error:', error);
        throw new Error(error.message || 'Error al procesar el código de Instagram');
      }

      if (!data?.success) {
        throw new Error(data?.error || 'Error desconocido al vincular Instagram');
      }

      // Limpiar caché de conexión
      await AsyncStorage.removeItem(STORAGE_KEYS.CONNECTION_CACHE);

      logger.info('[Instagram] Successfully linked:', data.username);
      return { success: true, username: data.username };
    } catch (error: any) {
      logger.error('[Instagram] processAuthCode error:', error);
      return { success: false };
    }
  }

  // ==========================================================================
  // CONNECTION STATUS
  // ==========================================================================

  /**
   * Verifica el estado de conexión de Instagram del usuario actual
   */
  async getConnectionStatus(): Promise<InstagramConnectionStatus> {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        return { connected: false, username: null, expiresAt: null, isExpiringSoon: false };
      }

      const { data, error } = await supabase
        .from('user_integrations')
        .select('ig_username, token_expires_at')
        .eq('user_id', user.id)
        .eq('provider', 'instagram')
        .single();

      if (error || !data) {
        return { connected: false, username: null, expiresAt: null, isExpiringSoon: false };
      }

      const expiresAt = new Date(data.token_expires_at);
      const now = new Date();
      const daysUntilExpiry = (expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
      const isExpired = daysUntilExpiry <= 0;
      const isExpiringSoon = daysUntilExpiry > 0 && daysUntilExpiry < 7;

      if (isExpired) {
        return {
          connected: false,
          username: data.ig_username,
          expiresAt: null,
          isExpiringSoon: false,
        };
      }

      return {
        connected: true,
        username: data.ig_username,
        expiresAt: data.token_expires_at,
        isExpiringSoon,
      };
    } catch (error) {
      logger.error('[Instagram] getConnectionStatus error:', error);
      return { connected: false, username: null, expiresAt: null, isExpiringSoon: false };
    }
  }

  /**
   * Desvincula la cuenta de Instagram
   */
  async disconnect(): Promise<boolean> {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return false;

      const { error } = await supabase
        .from('user_integrations')
        .delete()
        .eq('user_id', user.id)
        .eq('provider', 'instagram');

      if (error) {
        logger.error('[Instagram] Disconnect error:', error);
        return false;
      }

      await AsyncStorage.removeItem(STORAGE_KEYS.CONNECTION_CACHE);
      logger.info('[Instagram] Disconnected successfully');
      return true;
    } catch (error) {
      logger.error('[Instagram] disconnect error:', error);
      return false;
    }
  }

  // ==========================================================================
  // SYNC: USER REELS
  // ==========================================================================

  /**
   * Sincroniza los Reels del usuario actual
   * Llama a la Edge Function que lee el token y hace fetch a la Graph API
   */
  async syncMyReels(options?: { hashtagFilter?: string }): Promise<SyncResult> {
    try {
      logger.info('[Instagram] Syncing user reels...');

      const { data, error } = await supabase.functions.invoke('instagram-sync', {
        body: {
          action: 'sync-user',
          hashtag_filter: options?.hashtagFilter || '#trens',
        },
      });

      if (error) {
        logger.error('[Instagram] Sync error:', error);
        return { success: false, synced: 0, skipped: 0, errors: [error.message], source: 'user' };
      }

      return data as SyncResult;
    } catch (error: any) {
      return {
        success: false,
        synced: 0,
        skipped: 0,
        errors: [error.message || 'Error desconocido'],
        source: 'user',
      };
    }
  }

  // ==========================================================================
  // FEED: Queries de lectura
  // ==========================================================================

  /**
   * Obtiene el feed de Reels (oficial + comunidad)
   */
  async getFeed(options?: {
    limit?: number;
    offset?: number;
    officialOnly?: boolean;
  }): Promise<TrensFeedInsert[]> {
    const { limit = 20, offset = 0, officialOnly = false } = options || {};

    let query = supabase
      .from('trens_feed')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (officialOnly) {
      query = query.eq('is_official', true);
    }

    const { data, error } = await query;

    if (error) {
      logger.error('[Instagram] getFeed error:', error);
      return [];
    }

    return data || [];
  }

  /**
   * Obtiene los Reels de un usuario específico
   */
  async getUserReels(userId: string, limit = 10): Promise<TrensFeedInsert[]> {
    const { data, error } = await supabase
      .from('trens_feed')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      logger.error('[Instagram] getUserReels error:', error);
      return [];
    }

    return data || [];
  }

  // ==========================================================================
  // HELPERS
  // ==========================================================================

  /**
   * Obtiene el path de retorno guardado y lo limpia
   */
  async getReturnPath(): Promise<string> {
    try {
      const path = await AsyncStorage.getItem(STORAGE_KEYS.RETURN_PATH);
      await AsyncStorage.removeItem(STORAGE_KEYS.RETURN_PATH);
      return path || '/(tabs)/adn';
    } catch {
      return '/(tabs)/adn';
    }
  }

  /**
   * Verifica si el App ID está configurado
   */
  isConfigured(): boolean {
    return !!IG_APP_ID;
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

const instagram = InstagramService.getInstance();
export default instagram;
export { extractHashtags, isTokenExpiredError, getRedirectUri };
