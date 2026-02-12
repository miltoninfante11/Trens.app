// ============================================================================
// CLOUDFLARE R2 SERVICE - TRENS
// Storage para fotos y videos cortos de ejercicios
// Usa Worker proxy para uploads (más seguro y funciona en web + móvil)
// ============================================================================

import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';

// ============================================================================
// CONFIGURACIÓN
// ============================================================================
const PUBLIC_URL = process.env.EXPO_PUBLIC_CLOUDFLARE_R2_PUBLIC_URL || 'https://media.trens.app';

// Worker URL para uploads (funciona en web y móvil)
const R2_WORKER_URL =
  process.env.EXPO_PUBLIC_CLOUDFLARE_R2_WORKER_URL ||
  'https://trens-r2-upload.trens-app.workers.dev';

// ============================================================================
// TIPOS
// ============================================================================
export interface R2UploadResult {
  success: boolean;
  url?: string;
  key?: string;
  error?: string;
}

export interface R2DeleteResult {
  success: boolean;
  error?: string;
}

// ============================================================================
// UTILIDADES
// ============================================================================

/**
 * Convierte un URI de archivo a Blob (funciona en móvil y web)
 */
async function uriToBlob(uri: string): Promise<Blob> {
  // Si es una URL blob o data URL, hacer fetch directamente
  if (uri.startsWith('blob:') || uri.startsWith('data:')) {
    const response = await fetch(uri);
    return response.blob();
  }

  // En web, intentar fetch directo
  if (Platform.OS === 'web') {
    const response = await fetch(uri);
    return response.blob();
  }

  // En móvil, leer como base64 y convertir a blob
  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });

  // Detectar tipo MIME del archivo
  const mimeType = uri.toLowerCase().endsWith('.mp4')
    ? 'video/mp4'
    : uri.toLowerCase().endsWith('.png')
      ? 'image/png'
      : 'image/jpeg';

  return base64ToBlob(base64, mimeType);
}

/**
 * Convierte base64 a Blob
 */
function base64ToBlob(base64: string, mimeType: string): Blob {
  const byteCharacters = atob(base64);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  return new Blob([byteArray], { type: mimeType });
}

// ============================================================================
// SERVICIO PRINCIPAL
// ============================================================================
class CloudflareR2Service {
  constructor() {
    console.log('☁️ Cloudflare R2 Service initialized');
    console.log('   Worker URL:', R2_WORKER_URL);
    console.log('   Public URL:', PUBLIC_URL);
  }

  // --------------------------------------------------------------------------
  // MÉTODO PRINCIPAL: SUBIR VIA WORKER (funciona en web y móvil)
  // --------------------------------------------------------------------------
  private async uploadViaWorker(
    blob: Blob,
    key: string,
    contentType: string
  ): Promise<R2UploadResult> {
    try {
      const workerUrl = `${R2_WORKER_URL}/upload`;

      console.log('📤 R2 Upload iniciando...', {
        workerUrl,
        key,
        contentType,
        blobSize: blob.size,
        blobType: blob.type,
      });

      const response = await fetch(workerUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': contentType,
          'X-File-Key': key,
          'X-Content-Type': contentType,
        },
        body: blob,
      });

      console.log('📤 R2 Response status:', response.status, response.statusText);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Worker Upload Error:', response.status, errorText);
        return { success: false, error: `Upload failed: ${response.status} - ${errorText}` };
      }

      const result = await response.json();
      console.log('📤 R2 Response body:', JSON.stringify(result));

      if (!result.success) {
        console.error('❌ Worker returned error:', result.error);
        return { success: false, error: result.error || 'Unknown error' };
      }

      console.log('✅ Upload Success:', result.url);

      return {
        success: true,
        url: result.url,
        key: result.key,
      };
    } catch (error) {
      console.error('💥 R2 Upload Exception:', error);
      // En producción también mostrar el error
      if (typeof window !== 'undefined') {
        console.error('💥 R2 Error details:', {
          name: (error as any)?.name,
          message: (error as any)?.message,
          stack: (error as any)?.stack,
        });
      }
      return { success: false, error: String(error) };
    }
  }

  // --------------------------------------------------------------------------
  // SUBIR ARCHIVO DESDE URI (funciona en web y móvil)
  // --------------------------------------------------------------------------
  async uploadFile(fileUri: string, key: string, contentType: string): Promise<R2UploadResult> {
    try {
      console.log('📁 uploadFile:', { fileUri: fileUri.substring(0, 50), key, contentType });

      const blob = await uriToBlob(fileUri);

      if (blob.size === 0) {
        return { success: false, error: 'Archivo vacío' };
      }

      return this.uploadViaWorker(blob, key, contentType);
    } catch (error) {
      console.error('💥 uploadFile Exception:', error);
      return { success: false, error: String(error) };
    }
  }

  // --------------------------------------------------------------------------
  // SUBIR DESDE BLOB DIRECTAMENTE
  // --------------------------------------------------------------------------
  async uploadFromBlob(blob: Blob, key: string, contentType: string): Promise<R2UploadResult> {
    if (blob.size === 0) {
      return { success: false, error: 'Blob vacío' };
    }
    return this.uploadViaWorker(blob, key, contentType);
  }

  // --------------------------------------------------------------------------
  // SUBIR DESDE BASE64
  // --------------------------------------------------------------------------
  async uploadFromBase64(
    base64Data: string,
    key: string,
    contentType: string
  ): Promise<R2UploadResult> {
    try {
      console.log('📝 uploadFromBase64:', { key, contentType });

      // Remover prefijo data URL si existe
      const cleanBase64 = base64Data.replace(/^data:[^;]+;base64,/, '');
      const blob = base64ToBlob(cleanBase64, contentType);

      if (blob.size === 0) {
        return { success: false, error: 'Base64 inválido o vacío' };
      }

      return this.uploadViaWorker(blob, key, contentType);
    } catch (error) {
      console.error('💥 uploadFromBase64 Exception:', error);
      return { success: false, error: String(error) };
    }
  }

  // --------------------------------------------------------------------------
  // ELIMINAR ARCHIVO VIA WORKER
  // --------------------------------------------------------------------------
  async deleteFile(key: string): Promise<R2DeleteResult> {
    try {
      console.log('🗑️ deleteFile:', key);

      const response = await fetch(`${R2_WORKER_URL}/${key}`, {
        method: 'DELETE',
      });

      if (!response.ok && response.status !== 404) {
        console.error('❌ Delete Error:', response.status);
        return { success: false, error: `Delete failed: ${response.status}` };
      }

      console.log('✅ Delete Success');
      return { success: true };
    } catch (error) {
      console.error('💥 deleteFile Exception:', error);
      return { success: false, error: String(error) };
    }
  }

  // --------------------------------------------------------------------------
  // HELPERS: SUBIR MEDIA DE EJERCICIO
  // --------------------------------------------------------------------------
  async uploadExerciseMedia(
    fileUri: string,
    userId: string,
    exerciseId: string,
    type: 'photo' | 'video'
  ): Promise<R2UploadResult> {
    const extension = type === 'photo' ? 'jpg' : 'mp4';
    const contentType = type === 'photo' ? 'image/jpeg' : 'video/mp4';
    const timestamp = Date.now();
    const key = `exercises/${userId}/${exerciseId}/${timestamp}.${extension}`;

    return this.uploadFile(fileUri, key, contentType);
  }

  // --------------------------------------------------------------------------
  // HELPER: SUBIR FOTO DE PROGRESO
  // --------------------------------------------------------------------------
  async uploadProgressPhoto(base64Data: string, userId: string): Promise<R2UploadResult> {
    const timestamp = Date.now();
    const key = `progress/${userId}/${timestamp}.jpg`;

    return this.uploadFromBase64(base64Data, key, 'image/jpeg');
  }

  // --------------------------------------------------------------------------
  // HELPER: SUBIR THUMBNAIL DE EJERCICIO
  // --------------------------------------------------------------------------
  async uploadExerciseThumbnail(base64Data: string, exerciseId: string): Promise<R2UploadResult> {
    const timestamp = Date.now();
    const key = `exercise-thumbnails/${exerciseId}/${timestamp}.jpg`;

    return this.uploadFromBase64(base64Data, key, 'image/jpeg');
  }

  // --------------------------------------------------------------------------
  // HELPER: SUBIR VIDEO DE EJERCICIO
  // --------------------------------------------------------------------------
  async uploadExerciseVideo(fileUri: string, exerciseId: string): Promise<R2UploadResult> {
    const timestamp = Date.now();
    const key = `exercise-videos/${exerciseId}/${timestamp}.mp4`;

    return this.uploadFile(fileUri, key, 'video/mp4');
  }

  // --------------------------------------------------------------------------
  // HELPER: SUBIR AVATAR
  // --------------------------------------------------------------------------
  async uploadAvatar(fileUri: string, userId: string): Promise<R2UploadResult> {
    const timestamp = Date.now();
    const key = `avatars/${userId}_${timestamp}.jpg`;

    return this.uploadFile(fileUri, key, 'image/jpeg');
  }

  // --------------------------------------------------------------------------
  // HELPER: EXTRAER KEY DE URL
  // --------------------------------------------------------------------------
  getKeyFromUrl(url: string): string | null {
    if (!url.startsWith(PUBLIC_URL)) return null;
    return url.replace(`${PUBLIC_URL}/`, '');
  }

  // --------------------------------------------------------------------------
  // HELPERS: ELIMINAR
  // --------------------------------------------------------------------------
  async deleteExerciseThumbnail(thumbnailUrl: string): Promise<R2DeleteResult> {
    const key = this.getKeyFromUrl(thumbnailUrl);
    if (!key) {
      return { success: false, error: 'URL inválida' };
    }
    return this.deleteFile(key);
  }

  async deleteProgressPhoto(photoUrl: string): Promise<R2DeleteResult> {
    const key = this.getKeyFromUrl(photoUrl);
    if (!key) {
      return { success: false, error: 'URL inválida' };
    }
    return this.deleteFile(key);
  }

  async deleteAvatar(avatarUrl: string): Promise<R2DeleteResult> {
    const key = this.getKeyFromUrl(avatarUrl);
    if (!key) {
      return { success: false, error: 'URL inválida' };
    }
    return this.deleteFile(key);
  }
}

// Singleton
const cloudflareR2 = new CloudflareR2Service();
export default cloudflareR2;
