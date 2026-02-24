// ============================================================================
// INSTAGRAM API TYPES
// Tipado completo para la Graph API de Meta/Instagram
// ============================================================================

// --------------------------------------------------------------------------
// Graph API Response Types
// --------------------------------------------------------------------------

/** Tipos de media que devuelve la Graph API */
export type IGMediaType = 'IMAGE' | 'VIDEO' | 'CAROUSEL_ALBUM';

/** Un media individual de la Graph API */
export interface IGMedia {
  id: string;
  media_type: IGMediaType;
  media_url?: string;
  thumbnail_url?: string;
  caption?: string;
  permalink?: string;
  timestamp?: string;
  like_count?: number;
  comments_count?: number;
}

/** Respuesta paginada de la Graph API */
export interface IGMediaResponse {
  data: IGMedia[];
  paging?: {
    cursors: {
      before: string;
      after: string;
    };
    next?: string;
    previous?: string;
  };
}

/** Error de la Graph API */
export interface IGApiError {
  error: {
    message: string;
    type: string;
    code: number;
    error_subcode?: number;
    fbtrace_id?: string;
  };
}

// --------------------------------------------------------------------------
// OAuth Token Types
// --------------------------------------------------------------------------

/** Respuesta al intercambiar el código por Short-Lived Token */
export interface IGShortLivedTokenResponse {
  access_token: string;
  user_id: number;
}

/** Respuesta al intercambiar por Long-Lived Token */
export interface IGLongLivedTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number; // seconds (típicamente 5184000 = 60 días)
}

/** Respuesta al refrescar un Long-Lived Token */
export interface IGRefreshTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

/** Info del usuario de Instagram */
export interface IGUserProfile {
  id: string;
  username: string;
  account_type?: 'BUSINESS' | 'MEDIA_CREATOR' | 'PERSONAL';
  media_count?: number;
  name?: string;
  profile_picture_url?: string;
}

// --------------------------------------------------------------------------
// Supabase DB Types (mirrors de las tablas)
// --------------------------------------------------------------------------

/** Row de la tabla user_integrations */
export interface UserIntegration {
  id: string;
  user_id: string;
  provider: string;
  ig_user_id: string | null;
  ig_username: string | null;
  access_token: string;
  token_expires_at: string;
  scopes: string[];
  created_at: string;
  updated_at: string;
}

/** Row de la tabla trens_feed */
export interface TrensFeedItem {
  id: string;
  user_id: string | null;
  ig_media_id: string;
  ig_permalink: string | null;
  video_url: string;
  thumbnail_url: string | null;
  caption: string | null;
  hashtags: string[];
  is_official: boolean;
  media_type: string;
  ig_timestamp: string | null;
  sync_source: 'cron' | 'manual' | 'oauth_sync';
  like_count: number;
  comment_count: number;
  view_count: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/** Insert payload para trens_feed */
export interface TrensFeedInsert {
  user_id?: string | null;
  ig_media_id: string;
  ig_permalink?: string | null;
  video_url: string;
  thumbnail_url?: string | null;
  caption?: string | null;
  hashtags?: string[];
  is_official?: boolean;
  media_type?: string;
  ig_timestamp?: string | null;
  sync_source?: 'cron' | 'manual' | 'oauth_sync';
  like_count?: number;
  comment_count?: number;
  view_count?: number;
}

// --------------------------------------------------------------------------
// Service Types
// --------------------------------------------------------------------------

/** Estado de conexión de Instagram para la UI */
export interface InstagramConnectionStatus {
  connected: boolean;
  username: string | null;
  expiresAt: string | null;
  isExpiringSoon: boolean; // < 7 días para expirar
}

/** Resultado de sincronización */
export interface SyncResult {
  success: boolean;
  synced: number;
  skipped: number;
  errors: string[];
  source: 'official' | 'user';
}

/** Config del servicio Instagram */
export interface InstagramConfig {
  appId: string;
  appSecret?: string;
  redirectUri: string;
  scopes: string[];
}

/** Parámetros de OAuth */
export interface InstagramOAuthParams {
  clientId: string;
  redirectUri: string;
  scope: string;
  responseType: 'code';
  state?: string;
}
