// ============================================================================
// SPOTIFY NATIVE SERVICE - TRENS
// SDK Nativo de Spotify para iOS/Android
// Permite despertar Spotify sin que el usuario abra la app
// ============================================================================

import { Platform } from 'react-native';

// Tipos del SDK nativo
export interface SpotifySession {
  accessToken: string;
  refreshToken?: string;
  expirationDate?: string;
}

export interface SpotifyPlayerState {
  track: {
    uri: string;
    name: string;
    artist: { name: string; uri: string };
    album: { name: string; uri: string };
    duration: number;
    saved: boolean;
    imageIdentifier?: string;
  } | null;
  isPaused: boolean;
  playbackPosition: number;
  playbackSpeed: number;
  playbackRestrictions: {
    canSkipNext: boolean;
    canSkipPrevious: boolean;
    canRepeatTrack: boolean;
    canRepeatContext: boolean;
    canToggleShuffle: boolean;
  };
}

export interface SpotifyNativeConfig {
  clientID: string;
  redirectURL: string;
  scopes: number[];
  playURI?: string;
  showDialog?: boolean;
}

// ============================================================================
// DETECCIÓN DE DISPONIBILIDAD
// ============================================================================

let SpotifyAuth: any = null;
let SpotifyRemote: any = null;
let ApiScope: any = null;
let isNativeAvailable = false;
let loadAttempted = false;

/**
 * Intentar cargar el SDK nativo de Spotify
 * Solo funciona en builds nativos (no Expo Go, no Web)
 */
async function loadNativeSDK(): Promise<boolean> {
  // Si ya intentamos cargar, retornar el resultado anterior
  if (loadAttempted) {
    return isNativeAvailable;
  }
  loadAttempted = true;

  // En web, NUNCA intentar cargar el SDK nativo
  if (Platform.OS === 'web') {
    isNativeAvailable = false;
    return false;
  }

  try {
    // Importar dinámicamente para evitar errores en web/Expo Go
    const spotifyModule = await import('react-native-spotify-remote');
    SpotifyAuth = spotifyModule.auth;
    SpotifyRemote = spotifyModule.remote;
    ApiScope = spotifyModule.ApiScope;
    isNativeAvailable = true;
    console.warn('🔌 SpotifyNative: ✅ SDK nativo cargado');
    return true;
  } catch {
    console.warn('🔌 SpotifyNative: SDK nativo no disponible');
    isNativeAvailable = false;
    return false;
  }
}

// ============================================================================
// SPOTIFY NATIVE SERVICE
// ============================================================================

class SpotifyNativeService {
  private isInitialized = false;
  private isConnected = false;
  private session: SpotifySession | null = null;
  private config: SpotifyNativeConfig | null = null;

  // Client ID de Spotify (mismo que Web API)
  private readonly SPOTIFY_CLIENT_ID = 'b0c64eb73f1a4f5bab9509ba19f37217';
  private readonly REDIRECT_URL = 'trensdev://spotify-callback';

  /**
   * Verificar si el SDK nativo está disponible
   */
  async checkAvailability(): Promise<boolean> {
    // En web, siempre retornar false inmediatamente
    if (Platform.OS === 'web') {
      return false;
    }
    if (isNativeAvailable) return true;
    return await loadNativeSDK();
  }

  /**
   * Verificar si está conectado al SDK nativo
   */
  isNativeConnected(): boolean {
    if (Platform.OS === 'web') return false;
    return isNativeAvailable && this.isConnected;
  }

  /**
   * Obtener la disponibilidad del SDK
   */
  isAvailable(): boolean {
    if (Platform.OS === 'web') return false;
    return isNativeAvailable;
  }

  /**
   * Configurar el SDK nativo
   */
  private getConfig(): SpotifyNativeConfig {
    if (!ApiScope) {
      throw new Error('SDK nativo no cargado');
    }

    return {
      clientID: this.SPOTIFY_CLIENT_ID,
      redirectURL: this.REDIRECT_URL,
      scopes: [
        ApiScope.AppRemoteControlScope,
        ApiScope.UserReadPlaybackStateScope,
        ApiScope.UserModifyPlaybackStateScope,
        ApiScope.UserReadCurrentlyPlayingScope,
        ApiScope.PlaylistReadPrivateScope,
        ApiScope.UserLibraryReadScope,
        ApiScope.UserLibraryModifyScope,
      ],
      showDialog: false, // Autenticación silenciosa cuando sea posible
    };
  }

  /**
   * 🔥 AUTORIZAR Y CONECTAR - Despierta Spotify automáticamente
   *
   * Esta es la magia del SDK nativo: puede despertar la app de Spotify
   * en segundo plano sin que el usuario tenga que abrirla manualmente.
   *
   * @param playURI - URI opcional para reproducir al conectar
   */
  async authorize(playURI?: string): Promise<boolean> {
    const available = await this.checkAvailability();
    if (!available || !SpotifyAuth || !SpotifyRemote) {
      console.warn('🔌 SpotifyNative: SDK no disponible para autorizar');
      return false;
    }

    try {
      console.warn('🔌 SpotifyNative: Iniciando autorización...');

      const config: SpotifyNativeConfig = {
        ...this.getConfig(),
        playURI: playURI || '', // '' = reanudar reproducción anterior
      };

      // Autorizar con Spotify (abre la app de Spotify si es necesario)
      const session = await SpotifyAuth.authorize(config);

      if (!session?.accessToken) {
        console.warn('🔌 SpotifyNative: No se obtuvo token');
        return false;
      }

      this.session = session;
      console.warn('🔌 SpotifyNative: ✅ Autorización exitosa');

      // Conectar al Remote (esto despierta Spotify)
      await SpotifyRemote.connect(session.accessToken);
      this.isConnected = true;
      this.isInitialized = true;

      console.warn('🔌 SpotifyNative: ✅ Conectado al Remote');
      return true;
    } catch (error: any) {
      console.error('🔌 SpotifyNative: Error de autorización:', error?.message || error);
      this.isConnected = false;
      return false;
    }
  }

  /**
   * 🔥 WAKE UP SILENCIOSO - Despertar Spotify sin reproducir
   *
   * Esta es la función clave: despierta Spotify en segundo plano
   * para que esté listo para reproducir instantáneamente.
   */
  async wakeUp(): Promise<boolean> {
    const available = await this.checkAvailability();
    if (!available || !SpotifyRemote) {
      console.warn('🔌 SpotifyNative wakeUp: SDK no disponible');
      return false;
    }

    try {
      // Verificar si ya estamos conectados
      const connected = await SpotifyRemote.isConnectedAsync();

      if (connected) {
        console.warn('🔌 SpotifyNative wakeUp: ✅ Ya conectado');
        this.isConnected = true;
        return true;
      }

      // Si tenemos sesión previa, intentar reconectar
      if (this.session?.accessToken) {
        console.warn('🔌 SpotifyNative wakeUp: Reconectando con token existente...');
        await SpotifyRemote.connect(this.session.accessToken);
        this.isConnected = true;
        console.warn('🔌 SpotifyNative wakeUp: ✅ Reconectado');
        return true;
      }

      // Si no hay sesión, necesitamos autorizar (esto puede mostrar UI)
      console.warn('🔌 SpotifyNative wakeUp: Sin sesión, autorizando...');
      return await this.authorize();
    } catch (error: any) {
      console.error('🔌 SpotifyNative wakeUp: Error:', error?.message || error);
      this.isConnected = false;
      return false;
    }
  }

  /**
   * Verificar si está conectado (async)
   */
  async isConnectedAsync(): Promise<boolean> {
    if (!isNativeAvailable || !SpotifyRemote) return false;

    try {
      const connected = await SpotifyRemote.isConnectedAsync();
      this.isConnected = connected;
      return connected;
    } catch {
      return false;
    }
  }

  /**
   * Reproducir una URI
   */
  async playUri(uri: string): Promise<boolean> {
    if (!this.isConnected || !SpotifyRemote) return false;

    try {
      await SpotifyRemote.playUri(uri);
      return true;
    } catch (error) {
      console.error('🔌 SpotifyNative playUri error:', error);
      return false;
    }
  }

  /**
   * Pausar
   */
  async pause(): Promise<boolean> {
    if (!this.isConnected || !SpotifyRemote) return false;

    try {
      await SpotifyRemote.pause();
      return true;
    } catch (error) {
      console.error('🔌 SpotifyNative pause error:', error);
      return false;
    }
  }

  /**
   * Reanudar
   */
  async resume(): Promise<boolean> {
    if (!this.isConnected || !SpotifyRemote) return false;

    try {
      await SpotifyRemote.resume();
      return true;
    } catch (error) {
      console.error('🔌 SpotifyNative resume error:', error);
      return false;
    }
  }

  /**
   * Siguiente canción
   */
  async skipToNext(): Promise<boolean> {
    if (!this.isConnected || !SpotifyRemote) return false;

    try {
      await SpotifyRemote.skipToNext();
      return true;
    } catch (error) {
      console.error('🔌 SpotifyNative skipToNext error:', error);
      return false;
    }
  }

  /**
   * Canción anterior
   */
  async skipToPrevious(): Promise<boolean> {
    if (!this.isConnected || !SpotifyRemote) return false;

    try {
      await SpotifyRemote.skipToPrevious();
      return true;
    } catch (error) {
      console.error('🔌 SpotifyNative skipToPrevious error:', error);
      return false;
    }
  }

  /**
   * Buscar posición
   */
  async seek(positionMs: number): Promise<boolean> {
    if (!this.isConnected || !SpotifyRemote) return false;

    try {
      await SpotifyRemote.seek(positionMs);
      return true;
    } catch (error) {
      console.error('🔌 SpotifyNative seek error:', error);
      return false;
    }
  }

  /**
   * Obtener estado del reproductor
   */
  async getPlayerState(): Promise<SpotifyPlayerState | null> {
    if (!this.isConnected || !SpotifyRemote) return null;

    try {
      const state = await SpotifyRemote.getPlayerState();
      return state;
    } catch (error) {
      console.error('🔌 SpotifyNative getPlayerState error:', error);
      return null;
    }
  }

  /**
   * Desconectar
   */
  async disconnect(): Promise<void> {
    if (!SpotifyRemote) return;

    try {
      await SpotifyRemote.disconnect();
      this.isConnected = false;
      console.warn('🔌 SpotifyNative: Desconectado');
    } catch (error) {
      console.error('🔌 SpotifyNative disconnect error:', error);
    }
  }

  /**
   * Terminar sesión completamente
   */
  async endSession(): Promise<void> {
    if (!SpotifyAuth) return;

    try {
      await SpotifyAuth.endSession();
      this.session = null;
      this.isConnected = false;
      this.isInitialized = false;
      console.warn('🔌 SpotifyNative: Sesión terminada');
    } catch (error) {
      console.error('🔌 SpotifyNative endSession error:', error);
    }
  }

  /**
   * Obtener el token de acceso actual (para uso con Web API)
   */
  getAccessToken(): string | null {
    return this.session?.accessToken || null;
  }
}

// Exportar instancia única
export const spotifyNative = new SpotifyNativeService();
export default spotifyNative;
