// ============================================================================
// CLOUDFLARE STREAM SERVICE - TRENS
// Video upload, transcoding y delivery con adaptive bitrate
// ============================================================================

import * as FileSystem from 'expo-file-system/legacy';

// ============================================================================
// CONFIGURACIÓN
// ============================================================================
const ACCOUNT_ID = process.env.EXPO_PUBLIC_CLOUDFLARE_ACCOUNT_ID;
const API_TOKEN = process.env.EXPO_PUBLIC_CLOUDFLARE_STREAM_TOKEN;
const STREAM_SUBDOMAIN = process.env.EXPO_PUBLIC_CLOUDFLARE_STREAM_SUBDOMAIN || 'videodelivery.net';

const API_BASE = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/stream`;

// Validar configuración
const isStreamConfigured = (): boolean => {
  return !!(ACCOUNT_ID && API_TOKEN && STREAM_SUBDOMAIN);
};

const validateStreamConfig = (): void => {
  if (!isStreamConfigured()) {
    console.warn('⚠️ Cloudflare Stream no está configurado. Verifica las variables de entorno:');
    console.warn('   - EXPO_PUBLIC_CLOUDFLARE_ACCOUNT_ID');
    console.warn('   - EXPO_PUBLIC_CLOUDFLARE_STREAM_TOKEN');
    console.warn('   - EXPO_PUBLIC_CLOUDFLARE_STREAM_SUBDOMAIN');
  }
};

// ============================================================================
// TIPOS
// ============================================================================
export interface StreamVideo {
  uid: string;
  thumbnail: string;
  thumbnailTimestampPct: number;
  readyToStream: boolean;
  status: {
    state: 'queued' | 'inprogress' | 'ready' | 'error';
    pctComplete?: string;
    errorReasonCode?: string;
    errorReasonText?: string;
  };
  meta: {
    name?: string;
    [key: string]: any;
  };
  created: string;
  modified: string;
  size: number;
  preview: string;
  allowedOrigins: string[];
  requireSignedURLs: boolean;
  uploaded: string;
  uploadExpiry: string | null;
  maxSizeBytes: number | null;
  maxDurationSeconds: number | null;
  duration: number;
  input: {
    width: number;
    height: number;
  };
  playback: {
    hls: string;
    dash: string;
  };
}

export interface UploadResult {
  success: boolean;
  videoId?: string;
  hlsUrl?: string;
  dashUrl?: string;
  thumbnailUrl?: string;
  error?: string;
}

export interface TusUploadResponse {
  success: boolean;
  uploadUrl?: string;
  videoId?: string;
  error?: string;
}

// ============================================================================
// SERVICIO PRINCIPAL
// ============================================================================
class CloudflareStreamService {
  private headers = {
    Authorization: `Bearer ${API_TOKEN}`,
    'Content-Type': 'application/json',
  };

  constructor() {
    // Validar configuración al inicializar el servicio
    validateStreamConfig();
  }

  // --------------------------------------------------------------------------
  // UPLOAD DIRECTO (Para videos pequeños < 200MB)
  // --------------------------------------------------------------------------
  async uploadVideo(
    videoUri: string,
    metadata?: {
      name?: string;
      exerciseName?: string;
      userId?: string;
      isPublic?: boolean;
    }
  ): Promise<UploadResult> {
    try {
      // Validar credenciales antes de intentar subir
      if (!isStreamConfigured()) {
        return {
          success: false,
          error: 'Cloudflare Stream no está configurado. Verifica las variables de entorno.',
        };
      }

      // 1. Leer el archivo como base64
      const fileInfo = await FileSystem.getInfoAsync(videoUri);
      if (!fileInfo.exists) {
        return { success: false, error: 'El archivo de video no existe' };
      }

      // 2. Crear FormData para upload
      const formData = new FormData();

      // Agregar el archivo de video
      formData.append('file', {
        uri: videoUri,
        type: 'video/mp4',
        name: `${Date.now()}.mp4`,
      } as any);

      // Agregar metadata
      if (metadata) {
        formData.append(
          'meta',
          JSON.stringify({
            name: metadata.name || `TRENS_${Date.now()}`,
            exerciseName: metadata.exerciseName,
            userId: metadata.userId,
            isPublic: metadata.isPublic,
            uploadedAt: new Date().toISOString(),
          })
        );
      }

      // 3. Subir a Cloudflare Stream
      const response = await fetch(API_BASE, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${API_TOKEN}`,
        },
        body: formData,
      });

      const data = await response.json();

      if (!data.success) {
        console.error('Error Cloudflare Stream:', data.errors);
        return {
          success: false,
          error: data.errors?.[0]?.message || 'Error subiendo video',
        };
      }

      const video: StreamVideo = data.result;

      return {
        success: true,
        videoId: video.uid,
        hlsUrl: video.playback.hls,
        dashUrl: video.playback.dash,
        thumbnailUrl: video.thumbnail,
      };
    } catch (error) {
      console.error('Error en uploadVideo:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Error desconocido',
      };
    }
  }

  // --------------------------------------------------------------------------
  // UPLOAD CON TUS (Para videos grandes, resumible)
  // --------------------------------------------------------------------------
  async createTusUpload(
    fileSizeBytes: number,
    metadata?: {
      name?: string;
      exerciseName?: string;
      userId?: string;
    }
  ): Promise<TusUploadResponse> {
    try {
      const response = await fetch(API_BASE, {
        method: 'POST',
        headers: {
          ...this.headers,
          'Tus-Resumable': '1.0.0',
          'Upload-Length': fileSizeBytes.toString(),
          'Upload-Metadata': this.encodeMetadata(metadata),
        },
      });

      if (!response.ok) {
        const error = await response.text();
        return { success: false, error };
      }

      const location = response.headers.get('Location');
      const streamMediaId = response.headers.get('stream-media-id');

      return {
        success: true,
        uploadUrl: location || undefined,
        videoId: streamMediaId || undefined,
      };
    } catch (error) {
      console.error('Error creando TUS upload:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Error desconocido',
      };
    }
  }

  // --------------------------------------------------------------------------
  // OBTENER VIDEO POR ID
  // --------------------------------------------------------------------------
  async getVideo(videoId: string): Promise<StreamVideo | null> {
    try {
      const response = await fetch(`${API_BASE}/${videoId}`, {
        method: 'GET',
        headers: this.headers,
      });

      const data = await response.json();

      if (!data.success) {
        console.error('Error obteniendo video:', data.errors);
        return null;
      }

      return data.result;
    } catch (error) {
      console.error('Error en getVideo:', error);
      return null;
    }
  }

  // --------------------------------------------------------------------------
  // VERIFICAR SI VIDEO ESTÁ LISTO
  // --------------------------------------------------------------------------
  async isVideoReady(videoId: string): Promise<boolean> {
    const video = await this.getVideo(videoId);
    return video?.readyToStream === true;
  }

  // --------------------------------------------------------------------------
  // ESPERAR A QUE VIDEO ESTÉ LISTO (con polling)
  // --------------------------------------------------------------------------
  async waitForReady(
    videoId: string,
    maxWaitMs: number = 120000, // 2 minutos máximo
    pollIntervalMs: number = 3000 // cada 3 segundos
  ): Promise<StreamVideo | null> {
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitMs) {
      const video = await this.getVideo(videoId);

      if (!video) return null;

      if (video.readyToStream) {
        return video;
      }

      if (video.status.state === 'error') {
        console.error('Error procesando video:', video.status.errorReasonText);
        return null;
      }

      // Esperar antes del siguiente poll
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }

    console.warn('Timeout esperando video listo');
    return null;
  }

  // --------------------------------------------------------------------------
  // ELIMINAR VIDEO
  // --------------------------------------------------------------------------
  async deleteVideo(videoId: string): Promise<boolean> {
    try {
      const response = await fetch(`${API_BASE}/${videoId}`, {
        method: 'DELETE',
        headers: this.headers,
      });

      // Cloudflare puede retornar 200 con JSON o 204 sin contenido
      if (response.status === 204 || response.ok) {
        // Éxito - video eliminado
        return true;
      }

      // Si hay error, intentar leer el body
      const text = await response.text();
      if (text) {
        try {
          const data = JSON.parse(text);
          console.error('Error de Cloudflare:', data.errors);
        } catch {
          console.error('Respuesta de Cloudflare:', text);
        }
      }
      return false;
    } catch (error) {
      console.error('Error eliminando video:', error);
      return false;
    }
  }

  // --------------------------------------------------------------------------
  // LISTAR VIDEOS
  // --------------------------------------------------------------------------
  async listVideos(limit: number = 50): Promise<StreamVideo[]> {
    try {
      const response = await fetch(`${API_BASE}?limit=${limit}`, {
        method: 'GET',
        headers: this.headers,
      });

      const data = await response.json();

      if (!data.success) {
        console.error('Error listando videos:', data.errors);
        return [];
      }

      return data.result || [];
    } catch (error) {
      console.error('Error en listVideos:', error);
      return [];
    }
  }

  // --------------------------------------------------------------------------
  // GENERAR URLs DE REPRODUCCIÓN
  // --------------------------------------------------------------------------
  getPlaybackUrls(videoId: string) {
    return {
      hls: `https://${STREAM_SUBDOMAIN}/${videoId}/manifest/video.m3u8`,
      dash: `https://${STREAM_SUBDOMAIN}/${videoId}/manifest/video.mpd`,
      thumbnail: `https://${STREAM_SUBDOMAIN}/${videoId}/thumbnails/thumbnail.jpg`,
      thumbnailGif: `https://${STREAM_SUBDOMAIN}/${videoId}/thumbnails/thumbnail.gif`,
      // Thumbnail en tiempo específico (segundos)
      thumbnailAt: (seconds: number) =>
        `https://${STREAM_SUBDOMAIN}/${videoId}/thumbnails/thumbnail.jpg?time=${seconds}s`,
      // Iframe embed
      iframe: `https://${STREAM_SUBDOMAIN}/${videoId}/iframe`,
      // MP4 download (si está habilitado)
      mp4: `https://${STREAM_SUBDOMAIN}/${videoId}/downloads/default.mp4`,
    };
  }

  // --------------------------------------------------------------------------
  // HELPERS
  // --------------------------------------------------------------------------
  private encodeMetadata(metadata?: Record<string, any>): string {
    if (!metadata) return '';

    return Object.entries(metadata)
      .filter(([_, value]) => value !== undefined)
      .map(([key, value]) => {
        const encodedValue = Buffer.from(String(value)).toString('base64');
        return `${key} ${encodedValue}`;
      })
      .join(',');
  }
}

// ============================================================================
// EXPORTAR INSTANCIA SINGLETON
// ============================================================================
const cloudflareStream = new CloudflareStreamService();
export default cloudflareStream;

// También exportar la clase por si se necesita instanciar
export { CloudflareStreamService };
