// ============================================================================
// SPOTIFY SERVICE - TRENS
// Control remoto de Spotify Premium
// Sistema HÍBRIDO: SDK Nativo (iOS/Android) + Web API (fallback)
// ============================================================================

import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import * as Crypto from 'expo-crypto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert } from '../../lib/alert';
import { spotifyNative } from './spotifyNative';
import { Linking, Platform } from 'react-native';

// IMPORTANTE: Debe ejecutarse a nivel global para interceptar el callback de OAuth
// Esto permite que WebBrowser.openAuthSessionAsync reciba la respuesta
WebBrowser.maybeCompleteAuthSession();

// ============================================================================
// CONFIGURACIÓN
// ============================================================================
const SPOTIFY_CLIENT_ID = 'b0c64eb73f1a4f5bab9509ba19f37217';
const SPOTIFY_SCOPES = [
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-read-currently-playing',
  'user-read-recently-played',
  'streaming',
  'app-remote-control',
  'playlist-read-private',
  'playlist-read-collaborative',
  'user-library-read',
  'user-library-modify',
].join(' ');

const STORAGE_KEY = '@trens_spotify_token';

// Discovery document for Spotify
const discovery = {
  authorizationEndpoint: 'https://accounts.spotify.com/authorize',
  tokenEndpoint: 'https://accounts.spotify.com/api/token',
};

// ============================================================================
// TIPOS
// ============================================================================
export interface SpotifyTrack {
  uri: string;
  name: string;
  artist: string;
  artistId: string; // ID del primer artista para obtener imagen
  album: string;
  albumArt: string;
  durationMs: number;
  positionMs: number;
}

export interface SpotifyPlaybackState {
  isPlaying: boolean;
  track: SpotifyTrack | null;
  deviceId: string | null;
  deviceName: string | null;
  hasActiveDevice: boolean;
  shuffleState: boolean;
  repeatState: 'off' | 'track' | 'context';
}

/**
 * Metadata de Spotify para guardar en videos (según MASTER)
 * Solo metadata, NO audio - 100% legal
 */
export interface SpotifyVideoMetadata {
  enabled: boolean;
  trackUri: string;
  positionMs: number;
  trackName: string;
  artist: string;
  albumArt?: string;
}

/**
 * Playlist de Spotify
 */
export interface SpotifyPlaylist {
  id: string;
  name: string;
  description: string;
  imageUrl: string | null;
  trackCount: number;
  owner: string;
}

/**
 * Track simplificado para listas
 */
export interface SpotifyPlaylistTrack {
  uri: string;
  id: string;
  name: string;
  artist: string;
  album: string;
  albumArt: string | null;
  durationMs: number;
  addedAt: string;
}

/**
 * Rol del usuario para control de Spotify
 */
export type SpotifyUserRole = 'pro' | 'free';

interface StoredToken {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

// ============================================================================
// SPOTIFY SERVICE CLASS
// ============================================================================
class SpotifyService {
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private expiresAt: number = 0;
  private isConnected: boolean = false;

  // 🔌 SDK Nativo - indica si estamos usando el SDK nativo
  private useNativeSDK: boolean = false;

  // Evitar mostrar alertas repetidas
  private lastAlertTime: number = 0;
  private readonly ALERT_COOLDOWN = 5000; // 5 segundos entre alertas

  // --------------------------------------------------------------------------
  // ESTADO
  // --------------------------------------------------------------------------

  /**
   * Verificar si está conectado y con token válido (sin recargar)
   */
  isTokenValid(): boolean {
    return this.isConnected && !!this.accessToken && this.expiresAt > Date.now();
  }

  /**
   * Verificar si necesita re-autenticación (tokens inválidos/revocados)
   */
  needsReauth(): boolean {
    return !this.isConnected && !this.refreshToken;
  }

  /**
   * Obtener estado de conexión para UI
   */
  getConnectionStatus(): { connected: boolean; needsReauth: boolean } {
    return {
      connected: this.isConnected,
      needsReauth: this.needsReauth(),
    };
  }

  /**
   * 🔥 Obtener estado de warm-up para UI
   */
  getWarmUpStatus(): {
    isWarmedUp: boolean;
    isReady: boolean;
    useNativeSDK: boolean;
    nativeAvailable: boolean;
  } {
    return {
      isWarmedUp: this.isWarmedUp,
      isReady: this.isReady(),
      useNativeSDK: this.useNativeSDK,
      nativeAvailable: spotifyNative.isAvailable(),
    };
  }

  /**
   * 🔌 Verificar si el SDK nativo está disponible
   */
  async checkNativeSDK(): Promise<boolean> {
    return await spotifyNative.checkAvailability();
  }

  // --------------------------------------------------------------------------
  // AUTENTICACIÓN
  // --------------------------------------------------------------------------

  /**
   * Convertir bytes a base64url (sin padding)
   */
  private base64URLEncode(bytes: Uint8Array): string {
    const base64 = btoa(String.fromCharCode(...bytes));
    return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  /**
   * Obtener la URL de redirección para la autenticación
   * - En WEB: Usa la URL actual del origen + path
   * - En DESARROLLO (Expo Go): Usa URI dinámica del tunnel
   * - En PRODUCCIÓN (build): Usa custom scheme trensdev://
   */
  getRedirectUri(): string {
    // En web, construimos la URI manualmente para mayor control
    if (typeof window !== 'undefined' && window.location) {
      const origin = window.location.origin;
      const webUri = `${origin}/spotify-callback`;
      if (__DEV__) {
        console.log('🎵 Spotify Web Redirect URI:', webUri);
        console.log(
          '🎵 IMPORTANTE: Agrega esta URI en Spotify Dashboard → Settings → Redirect URIs'
        );
      }
      return webUri;
    }

    // En desarrollo con Expo Go, necesitamos la URI del tunnel
    // En producción, usamos el custom scheme
    const uri = AuthSession.makeRedirectUri({
      scheme: 'trensdev',
      path: 'spotify-callback',
    });

    if (__DEV__) {
      console.log('🎵 Spotify Redirect URI:', uri);
      console.log('🎵 IMPORTANTE: Agrega esta URI en Spotify Dashboard → Settings → Redirect URIs');
    }

    return uri;
  }

  /**
   * Iniciar el flujo de autenticación OAuth
   * Usa WebBrowser.openAuthSessionAsync para evitar problemas con NavigationContext
   * En web, redirige directamente al usuario (sin popup)
   */
  async authenticate(): Promise<boolean> {
    try {
      // URI estable - siempre la misma
      const redirectUri = this.getRedirectUri();

      // Generar code verifier (string aleatorio de 43-128 caracteres)
      const randomBytes = await Crypto.getRandomBytesAsync(32);
      const codeVerifier = this.base64URLEncode(randomBytes);

      // Generar code challenge (SHA256 hash del verifier, base64url encoded)
      const digest = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        codeVerifier,
        { encoding: Crypto.CryptoEncoding.BASE64 }
      );
      const codeChallenge = digest.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

      // Construir URL de autorización manualmente
      const authUrl = new URL(discovery.authorizationEndpoint);
      authUrl.searchParams.set('client_id', SPOTIFY_CLIENT_ID);
      authUrl.searchParams.set('response_type', 'code');
      authUrl.searchParams.set('redirect_uri', redirectUri);
      authUrl.searchParams.set('scope', SPOTIFY_SCOPES);
      authUrl.searchParams.set('code_challenge_method', 'S256');
      authUrl.searchParams.set('code_challenge', codeChallenge);

      // En WEB: Guardar verifier y redirigir directamente
      if (typeof window !== 'undefined' && window.location) {
        console.log('🎵 Spotify Web: Guardando verifier y redirigiendo...');
        await AsyncStorage.setItem('@spotify_code_verifier', codeVerifier);
        await AsyncStorage.setItem('@spotify_redirect_uri', redirectUri);
        // Redirigir a Spotify (el callback procesará el código)
        window.location.href = authUrl.toString();
        return true; // El resultado real se procesará en el callback
      }

      // En NATIVE: Usar WebBrowser
      console.log('🎵 Spotify: Abriendo navegador para auth...');
      console.log('🎵 Spotify: redirectUri =', redirectUri);

      const result = await WebBrowser.openAuthSessionAsync(authUrl.toString(), redirectUri);

      console.log('🎵 Spotify: Resultado de auth:', JSON.stringify(result, null, 2));

      if (result.type === 'success' && result.url) {
        console.log('🎵 Spotify: URL de callback recibida:', result.url);
        // Parsear el código de la URL de respuesta
        const responseUrl = new URL(result.url);
        const code = responseUrl.searchParams.get('code');
        const error = responseUrl.searchParams.get('error');

        if (error) {
          console.error('🎵 Spotify: Error en callback:', error);
          return false;
        }

        if (code) {
          console.log('🎵 Spotify: Código recibido, intercambiando por tokens...');
          // Intercambiar código por tokens usando fetch (sin AuthSession)
          const tokenResponse = await fetch(discovery.tokenEndpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
              client_id: SPOTIFY_CLIENT_ID,
              grant_type: 'authorization_code',
              code,
              redirect_uri: redirectUri,
              code_verifier: codeVerifier,
            }).toString(),
          });

          if (!tokenResponse.ok) {
            const errorData = await tokenResponse.text();
            console.error('🎵 Spotify: Token exchange failed:', errorData);
            return false;
          }

          const tokenData = await tokenResponse.json();

          this.accessToken = tokenData.access_token;
          this.refreshToken = tokenData.refresh_token || null;
          this.expiresAt = Date.now() + (tokenData.expires_in || 3600) * 1000;
          this.isConnected = true;

          // Guardar tokens
          await this.saveTokens();

          console.warn('🎵 Spotify: Conectado exitosamente');
          return true;
        }
      } else if (result.type === 'cancel') {
        console.warn('🎵 Spotify: Usuario canceló la autenticación');
        return false;
      } else if (result.type === 'dismiss') {
        console.warn('🎵 Spotify: Navegador cerrado sin completar');
        return false;
      } else {
        console.warn('🎵 Spotify: Resultado inesperado:', result.type);
      }

      console.warn('🎵 Spotify: Autenticación no completada');
      return false;
    } catch (error) {
      console.error('🎵 Spotify: Error de autenticación:', error);
      return false;
    }
  }

  /**
   * Procesar código OAuth recibido en web callback
   * Este método se llama desde spotify-callback.tsx en web
   */
  async processWebAuthCode(code: string): Promise<boolean> {
    try {
      console.log('🎵 Spotify Web: Procesando código OAuth...');

      // Recuperar verifier y redirect URI guardados
      const codeVerifier = await AsyncStorage.getItem('@spotify_code_verifier');
      const redirectUri = await AsyncStorage.getItem('@spotify_redirect_uri');

      if (!codeVerifier || !redirectUri) {
        console.error('🎵 Spotify Web: No se encontró verifier o redirectUri guardado');
        return false;
      }

      // Limpiar datos temporales
      await AsyncStorage.removeItem('@spotify_code_verifier');
      await AsyncStorage.removeItem('@spotify_redirect_uri');

      // Intercambiar código por tokens
      const tokenResponse = await fetch(discovery.tokenEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          client_id: SPOTIFY_CLIENT_ID,
          grant_type: 'authorization_code',
          code,
          redirect_uri: redirectUri,
          code_verifier: codeVerifier,
        }).toString(),
      });

      if (!tokenResponse.ok) {
        const errorData = await tokenResponse.text();
        console.error('🎵 Spotify Web: Token exchange failed:', errorData);
        return false;
      }

      const tokenData = await tokenResponse.json();

      this.accessToken = tokenData.access_token;
      this.refreshToken = tokenData.refresh_token || null;
      this.expiresAt = Date.now() + (tokenData.expires_in || 3600) * 1000;
      this.isConnected = true;

      // Guardar tokens
      await this.saveTokens();

      console.log('🎵 Spotify Web: ✅ Tokens guardados exitosamente');
      return true;
    } catch (error) {
      console.error('🎵 Spotify Web: Error procesando código:', error);
      return false;
    }
  }

  /**
   * Cargar tokens guardados
   * Si ya está conectado y el token es válido, no recarga
   */
  async loadStoredTokens(): Promise<boolean> {
    try {
      // Si ya está conectado y el token no ha expirado, no recargar
      if (this.isConnected && this.accessToken && this.expiresAt > Date.now()) {
        console.log('🎵 loadStoredTokens: Ya conectado con token válido');
        return true;
      }

      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      console.log('🎵 loadStoredTokens: stored=', stored ? 'EXISTS' : 'NULL');

      if (stored) {
        const tokens: StoredToken = JSON.parse(stored);
        const now = Date.now();
        const expiresIn = tokens.expiresAt - now;
        console.log(
          '🎵 loadStoredTokens: expiresAt=',
          tokens.expiresAt,
          'now=',
          now,
          'expiresIn=',
          Math.floor(expiresIn / 1000),
          'seg'
        );

        // Verificar si el token aún es válido
        if (tokens.expiresAt > Date.now()) {
          this.accessToken = tokens.accessToken;
          this.refreshToken = tokens.refreshToken;
          this.expiresAt = tokens.expiresAt;
          // Solo loguear si no estaba conectado antes
          if (!this.isConnected) {
            console.log('🎵 Spotify: Token cargado');
          }
          this.isConnected = true;
          return true;
        } else if (tokens.refreshToken) {
          // Token expirado - asignar refresh token ANTES de refrescar
          this.refreshToken = tokens.refreshToken;
          console.log('🎵 loadStoredTokens: Token expirado, intentando refrescar...');
          return await this.refreshAccessToken();
        } else {
          console.log('🎵 loadStoredTokens: Token expirado y sin refresh token');
        }
      }
      return false;
    } catch (error) {
      console.error('🎵 Spotify: Error cargando tokens:', error);
      return false;
    }
  }

  /**
   * Guardar tokens en almacenamiento
   */
  private async saveTokens(): Promise<void> {
    try {
      const tokens: StoredToken = {
        accessToken: this.accessToken!,
        refreshToken: this.refreshToken || '',
        expiresAt: this.expiresAt,
      };
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(tokens));
    } catch (error) {
      console.error('🎵 Spotify: Error guardando tokens:', error);
    }
  }

  /**
   * Refrescar el access token
   * Usa un flag para evitar múltiples refreshes concurrentes
   */
  private isRefreshing = false;

  async refreshAccessToken(): Promise<boolean> {
    console.log('🎵 refreshAccessToken: Iniciando...');

    if (!this.refreshToken) {
      console.log('🎵 refreshAccessToken: No hay refresh token');
      return false;
    }

    // Evitar múltiples refreshes concurrentes
    if (this.isRefreshing) {
      console.log('🎵 refreshAccessToken: Ya hay un refresh en curso, esperando...');
      // Esperar a que termine el refresh en curso
      await new Promise((resolve) => setTimeout(resolve, 1000));
      return this.isConnected && !!this.accessToken;
    }

    this.isRefreshing = true;

    try {
      console.log('🎵 refreshAccessToken: Llamando a AuthSession.refreshAsync...');
      const result = await AuthSession.refreshAsync(
        {
          clientId: SPOTIFY_CLIENT_ID,
          refreshToken: this.refreshToken,
        },
        discovery
      );

      console.log('🎵 refreshAccessToken: ✅ Token refrescado exitosamente');
      this.accessToken = result.accessToken;
      this.refreshToken = result.refreshToken || this.refreshToken;
      this.expiresAt = Date.now() + (result.expiresIn || 3600) * 1000;
      this.isConnected = true;

      await this.saveTokens();
      return true;
    } catch (error: any) {
      console.error('🎵 refreshAccessToken: ❌ Error:', error?.message || error);
      // Si el refresh token fue revocado, limpiar todo y forzar re-login
      const errorMessage = error?.message || '';
      if (errorMessage.includes('revoked') || errorMessage.includes('invalid')) {
        console.warn('🎵 Spotify: Token revocado - necesita re-autenticación');
        await this.disconnect();
      }
      this.isConnected = false;
      return false;
    } finally {
      this.isRefreshing = false;
    }
  }

  /**
   * Desconectar de Spotify
   */
  async disconnect(): Promise<void> {
    this.accessToken = null;
    this.refreshToken = null;
    this.expiresAt = 0;
    this.isConnected = false;
    this.resetWarmUpState(); // Reset warm-up al desconectar
    await AsyncStorage.removeItem(STORAGE_KEY);
    console.warn('🎵 Spotify: Desconectado');
  }

  // --------------------------------------------------------------------------
  // API CALLS
  // --------------------------------------------------------------------------

  /**
   * Hacer una llamada a la API de Spotify
   */
  private async apiCall<T>(
    endpoint: string,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
    body?: object
  ): Promise<T | null> {
    // Verificar y refrescar token si es necesario
    if (this.expiresAt < Date.now() + 60000) {
      await this.refreshAccessToken();
    }

    if (!this.accessToken) {
      // No mostrar error - puede que aún no se haya cargado el token
      return null;
    }

    try {
      const response = await fetch(`https://api.spotify.com/v1${endpoint}`, {
        method,
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: body ? JSON.stringify(body) : undefined,
      });

      // 204 = No Content (éxito pero sin respuesta)
      // 202 = Accepted (comando aceptado)
      if (response.status === 204 || response.status === 202) {
        return null;
      }

      // Si no hay contenido, retornar null
      const text = await response.text();
      if (!text || text.length === 0) {
        return null;
      }

      // Intentar parsear JSON
      try {
        const data = JSON.parse(text);

        if (!response.ok) {
          // Manejar errores específicos con alertas para el usuario
          const reason = data?.error?.reason;
          const now = Date.now();

          if (reason === 'NO_ACTIVE_DEVICE') {
            // No hay dispositivo activo - solo log, play() intentará activar uno
            console.log('🎵 Spotify: No hay dispositivo activo');
            return null;
          }
          if (reason === 'PREMIUM_REQUIRED') {
            if (now - this.lastAlertTime > this.ALERT_COOLDOWN) {
              this.lastAlertTime = now;
              Alert.alert(
                '⭐ SPOTIFY PREMIUM',
                'Se requiere Spotify Premium para controlar la reproducción desde TRENS.',
                [{ text: 'OK', style: 'default' }]
              );
            }
            return null;
          }

          // Silenciar errores comunes de "Restriction violated"
          // (ocurre cuando no hay dispositivo activo o no hay reproducción)
          if (reason === 'UNKNOWN' && data.error?.message?.includes('Restriction violated')) {
            // No mostrar error - es esperado cuando Spotify no está activo
            return null;
          }

          // Silenciar 404 "Not found" - ocurre cuando no hay dispositivo/reproducción activa
          if (data.error?.status === 404 || data.error?.message === 'Not found.') {
            return null;
          }

          // Solo mostrar error para otros casos
          console.error('🎵 Spotify API Error:', data);
          return null;
        }

        return data;
      } catch (e) {
        // Si no es JSON válido, retornar null silenciosamente
        // Esto es normal para algunas respuestas de Spotify
        return null;
      }
    } catch (error) {
      console.error('🎵 Spotify: Error en llamada API:', error);
      return null;
    }
  }

  // --------------------------------------------------------------------------
  // CONTROL DE REPRODUCCIÓN
  // --------------------------------------------------------------------------

  /**
   * Obtener el estado actual de reproducción
   */
  async getPlaybackState(): Promise<SpotifyPlaybackState | null> {
    const data = await this.apiCall<any>('/me/player');

    if (!data) {
      return {
        isPlaying: false,
        track: null,
        deviceId: null,
        deviceName: null,
        hasActiveDevice: false,
        shuffleState: false,
        repeatState: 'off',
      };
    }

    return {
      isPlaying: data.is_playing,
      track: data.item
        ? {
            uri: data.item.uri,
            name: data.item.name,
            artist: data.item.artists.map((a: any) => a.name).join(', '),
            artistId: data.item.artists?.[0]?.id || '', // ID del primer artista
            album: data.item.album.name,
            albumArt: data.item.album.images[0]?.url || '',
            durationMs: data.item.duration_ms,
            positionMs: data.progress_ms,
          }
        : null,
      deviceId: data.device?.id || null,
      deviceName: data.device?.name || null,
      hasActiveDevice: !!data.device,
      shuffleState: data.shuffle_state,
      repeatState: data.repeat_state,
    };
  }

  /**
   * Obtener la canción actual
   */
  async getCurrentTrack(): Promise<SpotifyTrack | null> {
    const state = await this.getPlaybackState();
    return state?.track || null;
  }

  /**
   * Reproducir una canción específica
   * @param trackUri - URI del track a reproducir
   * @param positionMs - Posición en ms donde empezar
   * @param contextUri - URI del contexto (playlist, album) para habilitar next/prev
   * @param trackUris - Array de URIs para reproducir en secuencia (para Liked Songs)
   */
  async play(
    trackUri?: string,
    positionMs?: number,
    contextUri?: string,
    trackUris?: string[]
  ): Promise<boolean> {
    try {
      // Verificar si hay dispositivo activo
      const state = await this.getPlaybackState();
      let deviceId = state?.deviceId;

      if (!deviceId) {
        // Buscar un dispositivo disponible
        const devices = await this.getDevices();
        let availableDevice = devices.find((d) => !d.is_restricted) || devices[0];

        if (!availableDevice) {
          // No hay dispositivo → abrir Spotify directamente con la canción
          if (trackUri) {
            console.log('🎵 play(): No devices → abriendo Spotify con deep link');
            await this.playViaDeepLink(trackUri);
          }
          return false;
        }

        deviceId = availableDevice.id as string;

        // Transferir reproducción al dispositivo
        await this.transferPlayback(deviceId);
        await new Promise((resolve) => setTimeout(resolve, 500));
      }

      const body: any = {};

      if (contextUri) {
        // Reproducir dentro de un contexto (playlist/album)
        body.context_uri = contextUri;
        if (trackUri) {
          body.offset = { uri: trackUri };
        }
      } else if (trackUris && trackUris.length > 0) {
        // Limitar a máximo 50 tracks para evitar límites de API
        // Centrado en la canción seleccionada
        const currentIndex = trackUri ? trackUris.indexOf(trackUri) : 0;
        const startIndex = Math.max(0, currentIndex - 25);
        const endIndex = Math.min(trackUris.length, startIndex + 50);
        const limitedUris = trackUris.slice(startIndex, endIndex);
        const newOffset = currentIndex - startIndex;

        body.uris = limitedUris;
        body.offset = { position: newOffset };
      } else if (trackUri) {
        // Reproducir solo un track (sin contexto - next/prev no funcionará)
        body.uris = [trackUri];
      }

      if (positionMs !== undefined) {
        body.position_ms = positionMs;
      }

      await this.apiCall(
        `/me/player/play?device_id=${deviceId}`,
        'PUT',
        Object.keys(body).length > 0 ? body : undefined
      );
      return true;
    } catch (error) {
      console.error('🎵 Spotify play() - ERROR:', error);
      return false;
    }
  }

  /**
   * Reproducir con contexto de playlist/liked songs
   * Esto habilita next/prev correctamente
   * Mantiene el estado actual de shuffle y repeat
   */
  async playWithContext(
    trackUri: string,
    trackUris: string[],
    positionMs?: number
  ): Promise<boolean> {
    // Reproducir sin modificar shuffle/repeat - el usuario controla eso manualmente
    return await this.play(trackUri, positionMs, undefined, trackUris);
  }

  /**
   * Pausar la reproducción
   */
  async pause(): Promise<boolean> {
    await this.apiCall('/me/player/pause', 'PUT');
    return true;
  }

  /**
   * Alternar play/pause
   */
  async togglePlayPause(): Promise<boolean> {
    const state = await this.getPlaybackState();
    if (state?.isPlaying) {
      return await this.pause();
    } else {
      return await this.play();
    }
  }

  /**
   * Siguiente canción
   */
  async next(): Promise<boolean> {
    try {
      const state = await this.getPlaybackState();

      if (!state?.hasActiveDevice) {
        console.log('🎵 Spotify next(): No hay dispositivo activo');
        return false;
      }

      // Si está en repeat one, cambiar a repeat context
      if (state.repeatState === 'track') {
        await this.apiCall('/me/player/repeat?state=context', 'PUT');
        await new Promise((resolve) => setTimeout(resolve, 200));
      }

      const endpoint = state.deviceId
        ? `/me/player/next?device_id=${state.deviceId}`
        : '/me/player/next';

      await this.apiCall(endpoint, 'POST');
      return true;
    } catch (error) {
      console.error('🎵 Spotify next() error:', error);
      return false;
    }
  }

  /**
   * Obtener la cola de reproducción
   */
  async getQueue(): Promise<SpotifyTrack[] | null> {
    try {
      const data = await this.apiCall<{ queue: any[] }>('/me/player/queue');
      if (!data?.queue) return null;

      return data.queue.map((item: any) => ({
        uri: item.uri,
        name: item.name,
        artist: item.artists?.map((a: any) => a.name).join(', ') || '',
        artistId: item.artists?.[0]?.id || '',
        album: item.album?.name || '',
        albumArt: item.album?.images?.[0]?.url || '',
        durationMs: item.duration_ms,
        positionMs: 0,
      }));
    } catch (error) {
      console.warn('🎵 Spotify getQueue() error:', error);
      return null;
    }
  }

  /**
   * Obtener canciones reproducidas recientemente
   * Útil para obtener la canción "anterior" en el carrusel
   */
  async getRecentlyPlayed(limit: number = 5): Promise<SpotifyTrack[] | null> {
    try {
      const data = await this.apiCall<{ items: any[] }>(
        `/me/player/recently-played?limit=${limit}`
      );
      if (!data?.items) return null;

      return data.items.map((item: any) => ({
        uri: item.track.uri,
        name: item.track.name,
        artist: item.track.artists?.map((a: any) => a.name).join(', ') || '',
        artistId: item.track.artists?.[0]?.id || '',
        album: item.track.album?.name || '',
        albumArt: item.track.album?.images?.[0]?.url || '',
        durationMs: item.track.duration_ms,
        positionMs: 0,
      }));
    } catch (error) {
      console.warn('🎵 Spotify getRecentlyPlayed() error:', error);
      return null;
    }
  }

  /**
   * Obtener álbumes adyacentes para el carrusel (anterior y siguiente)
   */
  async getAdjacentAlbums(): Promise<{ prev: string | null; next: string | null }> {
    try {
      // Obtener la cola para la siguiente canción
      const queue = await this.getQueue();
      const nextAlbum = queue?.[0]?.albumArt || null;

      // Obtener historial para la canción anterior
      const recent = await this.getRecentlyPlayed(2);
      // El primer elemento es la canción actual, el segundo es la anterior
      const prevAlbum = recent?.[1]?.albumArt || recent?.[0]?.albumArt || null;

      return { prev: prevAlbum, next: nextAlbum };
    } catch (error) {
      console.warn('🎵 Spotify getAdjacentAlbums() error:', error);
      return { prev: null, next: null };
    }
  }

  /**
   * Obtener info completa de canciones adyacentes (para mostrar nombre, artista, álbum)
   */
  async getAdjacentTracksInfo(): Promise<{
    prev: { name: string; artist: string; album: string; albumArt: string } | null;
    next: { name: string; artist: string; album: string; albumArt: string } | null;
  }> {
    try {
      // Obtener la cola para la siguiente canción
      const queue = await this.getQueue();
      const nextTrack = queue?.[0] || null;

      // Obtener historial para la canción anterior
      const recent = await this.getRecentlyPlayed(2);
      // El primer elemento es la canción actual, el segundo es la anterior
      const prevTrack = recent?.[1] || recent?.[0] || null;

      return {
        prev: prevTrack
          ? {
              name: prevTrack.name,
              artist: prevTrack.artist,
              album: prevTrack.album,
              albumArt: prevTrack.albumArt,
            }
          : null,
        next: nextTrack
          ? {
              name: nextTrack.name,
              artist: nextTrack.artist,
              album: nextTrack.album,
              albumArt: nextTrack.albumArt,
            }
          : null,
      };
    } catch (error) {
      console.warn('🎵 Spotify getAdjacentTracksInfo() error:', error);
      return { prev: null, next: null };
    }
  }

  /**
   * Canción anterior
   */
  async previous(): Promise<boolean> {
    try {
      console.log('🎵 Spotify previous(): Obteniendo estado actual...');
      const state = await this.getPlaybackState();

      if (!state?.hasActiveDevice) {
        console.log('🎵 Spotify previous(): No hay dispositivo activo');
        return false;
      }

      const endpoint = state.deviceId
        ? `/me/player/previous?device_id=${state.deviceId}`
        : '/me/player/previous';

      await this.apiCall(endpoint, 'POST');
      console.log('🎵 Spotify previous(): Comando enviado');
      return true;
    } catch (error) {
      console.error('🎵 Spotify previous() error:', error);
      return false;
    }
  }

  /**
   * Buscar posición en la canción
   */
  async seek(positionMs: number): Promise<boolean> {
    const position = Math.floor(positionMs);
    await this.apiCall(`/me/player/seek?position_ms=${position}`, 'PUT');
    return true;
  }

  /**
   * Establecer volumen (0-100)
   */
  async setVolume(volumePercent: number): Promise<boolean> {
    const volume = Math.max(0, Math.min(100, Math.round(volumePercent)));
    await this.apiCall(`/me/player/volume?volume_percent=${volume}`, 'PUT');
    return true;
  }

  /**
   * Activar/desactivar shuffle
   */
  async setShuffle(state: boolean): Promise<boolean> {
    try {
      await this.apiCall(`/me/player/shuffle?state=${state}`, 'PUT');
      return true;
    } catch (error) {
      console.warn('🎵 Spotify setShuffle error:', error);
      return false;
    }
  }

  /**
   * Establecer modo de repetición
   * @param state - 'off' | 'track' | 'context'
   */
  async setRepeat(state: 'off' | 'track' | 'context'): Promise<boolean> {
    try {
      await this.apiCall(`/me/player/repeat?state=${state}`, 'PUT');
      return true;
    } catch (error) {
      console.warn('🎵 Spotify setRepeat error:', error);
      return false;
    }
  }

  /**
   * Obtener dispositivos disponibles
   */
  async getDevices(): Promise<any[]> {
    const data = await this.apiCall<{ devices: any[] }>('/me/player/devices');
    return data?.devices || [];
  }

  /**
   * Transferir reproducción a un dispositivo
   */
  async transferPlayback(deviceId: string, play: boolean = true): Promise<boolean> {
    await this.apiCall('/me/player', 'PUT', {
      device_ids: [deviceId],
      play,
    });
    return true;
  }

  // =========================================================================
  // 🎬 VIDEO SYNC - Para sincronizar feed con Spotify
  // =========================================================================

  /**
   * Sincronizar reproducción con un video del feed
   * @param trackUri - URI de la canción de Spotify
   * @param positionMs - Posición donde empezar (capturada durante grabación)
   */
  async syncWithVideo(trackUri: string, positionMs: number): Promise<boolean> {
    console.log('🎵 syncWithVideo called:', { trackUri, positionMs });

    // Verificar que tenemos token válido antes de intentar
    if (!this.isTokenValid()) {
      console.log('🎵 syncWithVideo: Token no válido, intentando cargar...');
      // Intentar cargar token desde storage
      const loaded = await this.loadStoredTokens();
      if (!loaded) {
        console.log('🎵 syncWithVideo: No se pudo cargar token');
        return false;
      }
    }

    try {
      // Primero verificar si hay un dispositivo activo
      const devices = await this.getDevices();
      console.log('🎵 syncWithVideo: Dispositivos encontrados:', devices.length);
      const activeDevice = devices.find((d) => d.is_active) || devices[0];

      if (!activeDevice) {
        console.log('🎵 syncWithVideo: No hay dispositivo activo');
        // No mostrar alerta - play() intentará activar un dispositivo automáticamente
        return false;
      }

      // Transferir a dispositivo si no está activo
      if (!devices.find((d) => d.is_active)) {
        console.log('🎵 syncWithVideo: Transfiriendo playback a:', activeDevice.name);
        await this.transferPlayback(activeDevice.id, false);
      }

      // Iniciar reproducción en la canción y posición específica
      console.log('🎵 syncWithVideo: Iniciando reproducción...');
      await this.play(trackUri, positionMs);
      console.log('🎵 syncWithVideo: ✅ Reproducción iniciada');
      return true;
    } catch (error) {
      console.error('🎵 syncWithVideo error:', error);
      // Silenciar errores de sync - no es crítico
      return false;
    }
  }

  /**
   * Pausar para swipe del feed
   */
  async pauseForSwipe(): Promise<void> {
    try {
      await this.pause();
    } catch (e) {
      // Ignorar error si ya está pausado
    }
  }

  // =========================================================================
  // 📹 GRABACIÓN PRO - Capturar metadata durante grabación
  // =========================================================================

  /**
   * Capturar metadata de Spotify durante grabación (SOLO PRO)
   * Retorna la metadata para guardar con el video
   * NO graba audio - solo metadata (100% legal según MASTER)
   */
  async captureMetadataForRecording(): Promise<SpotifyVideoMetadata | null> {
    try {
      const state = await this.getPlaybackState();

      if (!state || !state.track || !state.isPlaying) {
        // No hay música reproduciéndose
        return null;
      }

      return {
        enabled: true,
        trackUri: state.track.uri,
        positionMs: state.track.positionMs,
        trackName: state.track.name,
        artist: state.track.artist,
        albumArt: state.track.albumArt,
      };
    } catch (error) {
      console.error('🎵 Error capturando metadata:', error);
      return null;
    }
  }

  /**
   * Crear metadata vacía (para videos sin música)
   */
  createEmptyMetadata(): SpotifyVideoMetadata {
    return {
      enabled: false,
      trackUri: '',
      positionMs: 0,
      trackName: '',
      artist: '',
    };
  }

  // =========================================================================
  // 🎮 CONTROL BASADO EN ROL (PRO vs FREE)
  // =========================================================================

  /**
   * Reproducir con control de rol
   * PRO: control completo
   * FREE: solo auto-play (sin control manual)
   */
  async playWithRole(
    role: SpotifyUserRole,
    trackUri?: string,
    positionMs?: number
  ): Promise<boolean> {
    // Ambos roles pueden hacer auto-play
    return await this.play(trackUri, positionMs);
  }

  /**
   * Pausar con control de rol
   * PRO: puede pausar
   * FREE: NO puede pausar (solo swipe del feed pausa)
   */
  async pauseWithRole(role: SpotifyUserRole): Promise<boolean> {
    if (role !== 'pro') {
      console.warn('🎵 Spotify: Control de pausa solo disponible para PRO');
      return false;
    }
    return await this.pause();
  }

  /**
   * Toggle play/pause con control de rol
   */
  async toggleWithRole(role: SpotifyUserRole): Promise<boolean> {
    if (role !== 'pro') {
      console.warn('🎵 Spotify: Control solo disponible para PRO');
      return false;
    }
    return await this.togglePlayPause();
  }

  /**
   * Siguiente canción con control de rol
   */
  async nextWithRole(role: SpotifyUserRole): Promise<boolean> {
    if (role !== 'pro') {
      Alert.alert(
        '⭐ FUNCIÓN PRO',
        'Cambia a PRO para controlar la música.\n\nCon PRO puedes pausar, saltar canciones y tener control total de Spotify.',
        [{ text: 'ENTENDIDO', style: 'default' }]
      );
      return false;
    }
    return await this.next();
  }

  /**
   * Canción anterior con control de rol
   */
  async previousWithRole(role: SpotifyUserRole): Promise<boolean> {
    if (role !== 'pro') {
      return false;
    }
    return await this.previous();
  }

  /**
   * Seek con control de rol
   */
  async seekWithRole(role: SpotifyUserRole, positionMs: number): Promise<boolean> {
    if (role !== 'pro') {
      return false;
    }
    return await this.seek(positionMs);
  }

  /**
   * Verificar si el usuario puede controlar Spotify
   */
  canControl(role: SpotifyUserRole): boolean {
    return role === 'pro';
  }

  /**
   * Obtener mensaje CTA para FREE
   */
  getFreeCTA(): string {
    return 'Conecta Spotify Premium para escuchar la música del entrenamiento';
  }

  /**
   * Obtener mensaje de upgrade para controles
   */
  getUpgradeCTA(): string {
    return 'Cambia a PRO para controlar la música';
  }

  // =========================================================================
  // 📚 PLAYLISTS - Navegar y reproducir desde playlists
  // =========================================================================

  /**
   * Obtener las playlists del usuario
   */
  async getMyPlaylists(limit: number = 50, offset: number = 0): Promise<SpotifyPlaylist[]> {
    const data = await this.apiCall<any>(`/me/playlists?limit=${limit}&offset=${offset}`);

    if (!data?.items) return [];

    return data.items.map((item: any) => ({
      id: item.id,
      name: item.name,
      description: item.description || '',
      imageUrl: item.images?.[0]?.url || null,
      trackCount: item.tracks?.total || 0,
      owner: item.owner?.display_name || 'Unknown',
    }));
  }

  /**
   * Obtener los tracks de una playlist
   * OPTIMIZADO: Usa thumbnails pequeños (64x64) para listas
   */
  async getPlaylistTracks(
    playlistId: string,
    limit: number = 20,
    offset: number = 0
  ): Promise<SpotifyPlaylistTrack[]> {
    const data = await this.apiCall<any>(
      `/playlists/${playlistId}/tracks?limit=${limit}&offset=${offset}&fields=items(added_at,track(id,uri,name,duration_ms,album(name,images),artists(name)))`
    );

    if (!data?.items) return [];

    return data.items
      .filter((item: any) => item.track) // Filtrar tracks eliminados
      .map((item: any) => ({
        uri: item.track.uri,
        id: item.track.id,
        name: item.track.name,
        artist: item.track.artists?.map((a: any) => a.name).join(', ') || 'Unknown',
        album: item.track.album?.name || 'Unknown',
        // Usar imagen pequeña (índice 2 = 64x64) para listas
        albumArt: item.track.album?.images?.[2]?.url || item.track.album?.images?.[1]?.url || null,
        durationMs: item.track.duration_ms || 0,
        addedAt: item.added_at,
      }));
  }

  /**
   * Obtener los "Liked Songs" del usuario
   * OPTIMIZADO: Usa thumbnails pequeños (64x64) para listas
   * Las canciones se devuelven ordenadas por fecha de agregado (más recientes primero)
   */
  async getLikedSongs(limit: number = 20, offset: number = 0): Promise<SpotifyPlaylistTrack[]> {
    const data = await this.apiCall<any>(`/me/tracks?limit=${limit}&offset=${offset}`);

    if (!data?.items) return [];

    return data.items
      .filter((item: any) => item.track)
      .map((item: any) => ({
        uri: item.track.uri,
        id: item.track.id,
        name: item.track.name,
        artist: item.track.artists?.map((a: any) => a.name).join(', ') || 'Unknown',
        album: item.track.album?.name || 'Unknown',
        // Usar imagen pequeña (índice 2 = 64x64) para listas, fallback a mediana
        albumArt: item.track.album?.images?.[2]?.url || item.track.album?.images?.[1]?.url || null,
        durationMs: item.track.duration_ms || 0,
        addedAt: item.added_at,
      }));
  }

  /**
   * Reproducir un track específico
   */
  async playTrack(trackUri: string): Promise<boolean> {
    return await this.play(trackUri, 0);
  }

  /**
   * Reproducir una playlist completa desde el inicio
   */
  async playPlaylist(playlistId: string): Promise<boolean> {
    const contextUri = `spotify:playlist:${playlistId}`;
    await this.apiCall('/me/player/play', 'PUT', {
      context_uri: contextUri,
    });
    return true;
  }

  /**
   * Reproducir una playlist desde un track específico
   */
  async playPlaylistFromTrack(playlistId: string, trackUri: string): Promise<boolean> {
    const contextUri = `spotify:playlist:${playlistId}`;
    await this.apiCall('/me/player/play', 'PUT', {
      context_uri: contextUri,
      offset: { uri: trackUri },
    });
    return true;
  }

  /**
   * Buscar tracks
   * OPTIMIZADO: Límite reducido a 15, usa thumbnails pequeños
   */
  async searchTracks(query: string, limit: number = 15): Promise<SpotifyPlaylistTrack[]> {
    if (!query.trim()) return [];

    const data = await this.apiCall<any>(
      `/search?q=${encodeURIComponent(query)}&type=track&limit=${limit}`
    );

    if (!data?.tracks?.items) return [];

    return data.tracks.items.map((track: any) => ({
      uri: track.uri,
      id: track.id,
      name: track.name,
      artist: track.artists?.map((a: any) => a.name).join(', ') || 'Unknown',
      album: track.album?.name || 'Unknown',
      // Usar imagen pequeña (índice 2 = 64x64) para listas
      albumArt: track.album?.images?.[2]?.url || track.album?.images?.[1]?.url || null,
      durationMs: track.duration_ms || 0,
      addedAt: '',
    }));
  }

  // =========================================================================
  // ARTISTA - Obtener imagen del artista
  // =========================================================================

  // Caché en memoria para imágenes de artistas
  private artistImageCache: Map<string, string> = new Map();

  /**
   * Obtener imagen del artista (con caché en memoria)
   * @param artistId - ID del artista de Spotify
   * @returns URL de la imagen o null si no existe
   */
  async getArtistImage(artistId: string): Promise<string | null> {
    if (!artistId) return null;

    // Verificar caché primero
    if (this.artistImageCache.has(artistId)) {
      return this.artistImageCache.get(artistId) || null;
    }

    try {
      const data = await this.apiCall<any>(`/artists/${artistId}`);

      if (data?.images && data.images.length > 0) {
        // Usar imagen mediana (índice 1) para mejor calidad sin ser muy pesada
        const imageUrl = data.images[1]?.url || data.images[0]?.url;

        // Guardar en caché
        if (imageUrl) {
          this.artistImageCache.set(artistId, imageUrl);
        }

        return imageUrl || null;
      }

      return null;
    } catch (error) {
      console.warn('Error fetching artist image:', error);
      return null;
    }
  }

  /**
   * Limpiar caché de imágenes de artistas (para liberar memoria)
   */
  clearArtistImageCache(): void {
    this.artistImageCache.clear();
  }

  // =========================================================================
  // BIBLIOTECA - Gestión de canciones guardadas (Me gusta)
  // =========================================================================

  /**
   * Verificar si un track está guardado en la biblioteca del usuario
   * @param trackId - ID del track (sin el prefijo spotify:track:)
   * @returns true si está guardado, false si no
   */
  async isTrackSaved(trackId: string): Promise<boolean> {
    if (!trackId) return false;

    try {
      const data = await this.apiCall<boolean[]>(`/me/tracks/contains?ids=${trackId}`);
      return data?.[0] ?? false;
    } catch (error) {
      console.warn('Error checking if track is saved:', error);
      return false;
    }
  }

  /**
   * Verificar si múltiples tracks están guardados en la biblioteca del usuario
   * @param trackIds - Array de IDs (sin prefijo spotify:track:), max 50 por llamada
   * @returns Map de trackId → boolean
   */
  async checkSavedTracks(trackIds: string[]): Promise<Map<string, boolean>> {
    const result = new Map<string, boolean>();
    if (!trackIds.length) return result;

    try {
      const ids = trackIds.join(',');
      const data = await this.apiCall<boolean[]>(`/me/tracks/contains?ids=${ids}`);
      if (data && Array.isArray(data)) {
        trackIds.forEach((id, idx) => {
          result.set(id, data[idx] ?? false);
        });
      }
    } catch (error) {
      console.warn('Error checking saved tracks batch:', error);
    }
    return result;
  }

  /**
   * Guardar un track en la biblioteca del usuario (Me gusta)
   * @param trackId - ID del track (sin el prefijo spotify:track:)
   * @returns true si se guardó correctamente
   */
  async saveTrack(trackId: string): Promise<boolean> {
    if (!trackId) return false;

    try {
      await this.apiCall(`/me/tracks?ids=${trackId}`, 'PUT');
      return true;
    } catch (error) {
      console.warn('🎵 Error guardando track:', error);
      return false;
    }
  }

  /**
   * Quitar un track de la biblioteca del usuario (Me gusta)
   * @param trackId - ID del track (sin el prefijo spotify:track:)
   * @returns true si se quitó correctamente
   */
  async removeTrack(trackId: string): Promise<boolean> {
    if (!trackId) return false;

    try {
      await this.apiCall(`/me/tracks?ids=${trackId}`, 'DELETE');
      return true;
    } catch (error) {
      console.warn('Error removing track:', error);
      return false;
    }
  }

  /**
   * Extraer el ID del track desde el URI
   * @param uri - URI de Spotify (spotify:track:XXXX)
   * @returns ID del track
   */
  getTrackIdFromUri(uri: string): string {
    if (!uri) return '';
    const parts = uri.split(':');
    return parts[parts.length - 1] || '';
  }

  // =========================================================================
  // 🔥 WAKE UP SILENCIOSO - Pre-calentar Spotify para reproducción instantánea
  // =========================================================================

  private isWarmedUp: boolean = false;
  private warmUpInProgress: boolean = false;
  private lastWarmUpAttempt: number = 0;
  private readonly WARM_UP_COOLDOWN = 30000; // 30 segundos entre intentos

  /**
   * Verificar si Spotify está "caliente" (listo para reproducir instantáneamente)
   */
  isReady(): boolean {
    return this.isWarmedUp && this.isTokenValid();
  }

  /**
   * 🔥 WARM UP - Despertar Spotify silenciosamente en segundo plano
   *
   * Este método intenta activar un dispositivo de Spotify sin reproducir música.
   * Esto permite que la próxima llamada a play() sea INSTANTÁNEA.
   *
   * Estrategia:
   * 1. Verifica si hay dispositivos disponibles
   * 2. Si hay un dispositivo activo, está listo ✅
   * 3. Si hay dispositivos pero ninguno activo, transfiere sin reproducir
   * 4. Si no hay dispositivos, intenta "despertar" con una técnica especial
   *
   * @returns true si Spotify está listo para reproducción instantánea
   */
  async warmUp(): Promise<boolean> {
    // Evitar warm-ups múltiples concurrentes
    if (this.warmUpInProgress) {
      console.log('🔥 Spotify warmUp: Ya hay un warm-up en curso');
      return this.isWarmedUp;
    }

    // Cooldown para evitar spam
    const now = Date.now();
    if (now - this.lastWarmUpAttempt < this.WARM_UP_COOLDOWN && this.isWarmedUp) {
      console.log('🔥 Spotify warmUp: Cooldown activo, ya está caliente');
      return true;
    }

    this.warmUpInProgress = true;
    this.lastWarmUpAttempt = now;

    try {
      console.log('🔥 Spotify warmUp: Iniciando pre-calentamiento...');

      // 🔌 ESTRATEGIA 1: Intentar con SDK Nativo (más efectivo)
      // El SDK nativo puede despertar Spotify incluso si no está abierto
      const nativeAvailable = await spotifyNative.checkAvailability();
      if (nativeAvailable) {
        console.log('🔥 Spotify warmUp: SDK nativo disponible, intentando wakeUp nativo...');
        const nativeWakeUp = await spotifyNative.wakeUp();
        if (nativeWakeUp) {
          console.log('🔥 Spotify warmUp: ✅ Despertado via SDK nativo');
          this.isWarmedUp = true;
          this.useNativeSDK = true;
          return true;
        }
        console.log('🔥 Spotify warmUp: SDK nativo falló, usando Web API fallback...');
      }

      // 📡 ESTRATEGIA 2: Web API (fallback)
      // Primero verificar que tenemos token válido
      if (!this.isTokenValid()) {
        const loaded = await this.loadStoredTokens();
        if (!loaded) {
          console.log('🔥 Spotify warmUp: No hay token válido');
          this.isWarmedUp = false;
          return false;
        }
      }

      // Obtener dispositivos disponibles
      const devices = await this.getDevices();
      console.log('🔥 Spotify warmUp: Dispositivos encontrados:', devices.length);

      if (devices.length === 0) {
        console.log('🔥 Spotify warmUp: No hay dispositivos - intentando técnica de despertar...');

        // Técnica de despertar: hacer una llamada "silenciosa" para activar
        const state = await this.getPlaybackState();

        if (state?.hasActiveDevice) {
          console.log('🔥 Spotify warmUp: ✅ Dispositivo activo detectado post-estado');
          this.isWarmedUp = true;
          return true;
        }

        // Técnica 2: Deep link para despertar la app de Spotify
        console.log('🔥 Spotify warmUp: Intentando deep link wake...');
        const woke = await this.wakeWithDeepLink();
        if (woke) {
          console.log('🔥 Spotify warmUp: ✅ Despertado via deep link');
          return true;
        }

        console.log('🔥 Spotify warmUp: ⚠️ Sin dispositivos activos - necesita abrir Spotify');
        this.isWarmedUp = false;
        return false;
      }

      // Verificar si ya hay un dispositivo activo
      const activeDevice = devices.find((d) => d.is_active);

      if (activeDevice) {
        console.log('🔥 Spotify warmUp: ✅ Ya hay dispositivo activo:', activeDevice.name);
        this.isWarmedUp = true;
        return true;
      }

      // Buscar el mejor dispositivo para activar (preferir smartphone)
      const smartphoneDevice = devices.find((d) => d.type === 'Smartphone');
      const targetDevice = smartphoneDevice || devices[0];

      if (targetDevice && !targetDevice.is_restricted) {
        console.log('🔥 Spotify warmUp: Activando dispositivo:', targetDevice.name);

        // Transferir reproducción SIN play (play: false)
        // Esto "despierta" el dispositivo sin reproducir música
        await this.apiCall('/me/player', 'PUT', {
          device_ids: [targetDevice.id],
          play: false, // ← IMPORTANTE: false = despertar sin reproducir
        });

        // Pequeña espera para que Spotify procese
        await new Promise((resolve) => setTimeout(resolve, 300));

        // Verificar que se activó
        const newDevices = await this.getDevices();
        const nowActive = newDevices.find((d) => d.is_active);

        if (nowActive) {
          console.log('🔥 Spotify warmUp: ✅ Dispositivo activado:', nowActive.name);
          this.isWarmedUp = true;
          return true;
        }
      }

      console.log('🔥 Spotify warmUp: ⚠️ No se pudo activar dispositivo');
      this.isWarmedUp = false;
      return false;
    } catch (error) {
      console.error('🔥 Spotify warmUp: Error:', error);
      this.isWarmedUp = false;
      return false;
    } finally {
      this.warmUpInProgress = false;
    }
  }

  /**
   * 🔥 WARM UP AGRESIVO - Intenta despertar con más fuerza
   *
   * Usa técnicas adicionales como:
   * - Obtener el estado de reproducción múltiples veces
   * - Intentar pausar/despausar silenciosamente
   *
   * Útil cuando el usuario está a punto de necesitar Spotify
   */
  async warmUpAggressive(): Promise<boolean> {
    console.log('🔥 Spotify warmUpAggressive: Modo agresivo...');

    // Primero intentar el warm-up normal
    const normalResult = await this.warmUp();
    if (normalResult) return true;

    // Si no funcionó, intentar técnicas más agresivas
    try {
      // Técnica 1: Verificar cola de reproducción (activa conexión)
      await this.apiCall<any>('/me/player/queue');

      // Técnica 2: Obtener canciones recientes (activa la sesión)
      await this.apiCall<any>('/me/player/recently-played?limit=1');

      // Verificar de nuevo los dispositivos
      const devices = await this.getDevices();
      if (devices.length > 0) {
        const target = devices.find((d) => !d.is_restricted) || devices[0];
        if (target) {
          await this.apiCall('/me/player', 'PUT', {
            device_ids: [target.id],
            play: false,
          });

          await new Promise((resolve) => setTimeout(resolve, 500));

          const newState = await this.getPlaybackState();
          if (newState?.hasActiveDevice) {
            console.log('🔥 Spotify warmUpAggressive: ✅ Éxito con técnica agresiva');
            this.isWarmedUp = true;
            return true;
          }
        }
      }
    } catch (error) {
      console.log('🔥 Spotify warmUpAggressive: Error en técnica agresiva:', error);
    }

    console.log(
      '🔥 Spotify warmUpAggressive: ❌ No se pudo despertar - necesita abrir Spotify manualmente'
    );
    return false;
  }

  /**
   * Reset del estado de warm-up (cuando el usuario desconecta Spotify)
   */
  resetWarmUpState(): void {
    this.isWarmedUp = false;
    this.lastWarmUpAttempt = 0;
  }

  // =========================================================================
  // 📡 DEEP LINK WAKE - Despertar Spotify sin abrir la app visualmente
  // =========================================================================

  /**
   * Despertar la app de Spotify usando deep links.
   *
   * Estrategia por plataforma:
   * - **Web/PWA**: Abre un iframe oculto con spotify: URI.
   *   El browser intenta resolver el intent, lo que despierta la app
   *   de Spotify en segundo plano si está instalada.
   * - **Nativo (iOS/Android)**: Usa Linking.openURL con spotify: URI.
   *   En iOS esto trae Spotify al frente brevemente.
   *
   * Después de abrir el deep link, espera y verifica si apareció un dispositivo.
   *
   * @param trackUri - Opcional: URI específica. Si no se da, abre la app genérica.
   * @returns true si después del intento hay un dispositivo disponible.
   */
  /**
   * ÚLTIMO RECURSO: Abre Spotify directamente con el track URI.
   * El usuario saldrá brevemente de la app pero la canción se reproducirá.
   * En web: window.open con el URI de Spotify.
   * En nativo: Linking.openURL con el URI del track.
   */
  async playViaDeepLink(trackUri: string): Promise<void> {
    try {
      console.log('📡 playViaDeepLink: Abriendo Spotify con:', trackUri);

      if (Platform.OS === 'web' && typeof document !== 'undefined') {
        // WEB/PWA: Usar solo el protocolo spotify: para abrir la app nativa
        // NO abrir open.spotify.com porque crea una pestaña que queda al volver
        window.location.href = trackUri;
      } else {
        // NATIVO: Abrir directamente la app con el track
        const canOpen = await Linking.canOpenURL(trackUri);
        if (canOpen) {
          await Linking.openURL(trackUri);
        }
      }
    } catch (error) {
      console.error('📡 playViaDeepLink error:', error);
    }
  }

  async wakeWithDeepLink(trackUri?: string): Promise<boolean> {
    try {
      console.log('📡 Spotify wakeWithDeepLink: Intentando despertar...');

      if (Platform.OS === 'web' && typeof document !== 'undefined') {
        // WEB/PWA: iframe oculto con intent de Spotify
        // Esto envía un intent al OS sin navegar la página actual
        const uri = trackUri || 'spotify:';

        // Crear un iframe invisible que dispara el deep link
        const iframe = document.createElement('iframe');
        iframe.style.display = 'none';
        iframe.src = uri;
        document.body.appendChild(iframe);

        // Limpiar después de 2 segundos
        setTimeout(() => {
          try {
            document.body.removeChild(iframe);
          } catch {}
        }, 2000);

        // También intentar con window.open como fallback para Android Chrome
        // Android Chrome a veces ignora iframe intents pero responde a window.open
        try {
          const w = window.open(uri, '_blank');
          if (w)
            setTimeout(() => {
              try {
                w.close();
              } catch {}
            }, 500);
        } catch {}

        // Esperar a que Spotify se despierte y registre dispositivo
        await new Promise((resolve) => setTimeout(resolve, 3000));
      } else {
        // NATIVO: Linking.openURL abre la app directamente
        const uri = trackUri || 'spotify:';
        const canOpen = await Linking.canOpenURL(uri);
        if (canOpen) {
          await Linking.openURL(uri);
          // Esperar a que Spotify arranque
          await new Promise((resolve) => setTimeout(resolve, 3000));
        } else {
          console.log('📡 wakeWithDeepLink: Spotify no instalado');
          return false;
        }
      }

      // Verificar si ahora hay un dispositivo disponible
      const devices = await this.getDevices();
      if (devices.length > 0) {
        console.log('📡 wakeWithDeepLink: ✅ Dispositivo encontrado:', devices[0].name);

        // Transferir sin reproducir para tenerlo listo
        const target = devices.find((d) => !d.is_restricted) || devices[0];
        if (target && !devices.find((d) => d.is_active)) {
          await this.transferPlayback(target.id, false);
          await new Promise((resolve) => setTimeout(resolve, 300));
        }

        this.isWarmedUp = true;
        return true;
      }

      console.log('📡 wakeWithDeepLink: ❌ No aparecieron dispositivos');
      return false;
    } catch (error) {
      console.error('📡 wakeWithDeepLink error:', error);
      return false;
    }
  }
}

// Exportar instancia única
export const spotify = new SpotifyService();
export default spotify;
