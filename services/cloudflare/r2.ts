// ============================================================================
// CLOUDFLARE R2 SERVICE - TRENS
// Storage para fotos y videos cortos de ejercicios (máx 15s)
// Usa crypto-js para AWS Signature V4 compatible con React Native
// ============================================================================

import * as FileSystem from 'expo-file-system/legacy';
import CryptoJS from 'crypto-js';

// ============================================================================
// CONFIGURACIÓN
// ============================================================================
const ACCOUNT_ID = process.env.EXPO_PUBLIC_CLOUDFLARE_ACCOUNT_ID;
const ACCESS_KEY_ID = process.env.EXPO_PUBLIC_CLOUDFLARE_R2_ACCESS_KEY_ID;
const SECRET_ACCESS_KEY = process.env.EXPO_PUBLIC_CLOUDFLARE_R2_SECRET_ACCESS_KEY;
const BUCKET_NAME = process.env.EXPO_PUBLIC_CLOUDFLARE_R2_BUCKET_NAME || 'trens-exercise-media';
const PUBLIC_URL = process.env.EXPO_PUBLIC_CLOUDFLARE_R2_PUBLIC_URL || 'https://media.trens.app';

// R2 API endpoint
const R2_ENDPOINT = `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`;

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
// UTILIDADES - AWS Signature V4 con crypto-js (HMAC real)
// ============================================================================

const sha256 = (message: string): string => {
  return CryptoJS.SHA256(message).toString(CryptoJS.enc.Hex);
};

const hmacSha256 = (
  key: string | CryptoJS.lib.WordArray,
  message: string
): CryptoJS.lib.WordArray => {
  return CryptoJS.HmacSHA256(message, key);
};

const getSignatureKey = (
  secretKey: string,
  dateStamp: string,
  region: string,
  service: string
): CryptoJS.lib.WordArray => {
  const kDate = hmacSha256('AWS4' + secretKey, dateStamp);
  const kRegion = hmacSha256(kDate, region);
  const kService = hmacSha256(kRegion, service);
  const kSigning = hmacSha256(kService, 'aws4_request');
  return kSigning;
};

// ============================================================================
// SERVICIO PRINCIPAL
// ============================================================================
class CloudflareR2Service {
  // --------------------------------------------------------------------------
  // SUBIR ARCHIVO A R2 usando FileSystem.uploadAsync
  // --------------------------------------------------------------------------
  async uploadFile(fileUri: string, key: string, contentType: string): Promise<R2UploadResult> {
    try {
      const uploadUrl = `${R2_ENDPOINT}/${BUCKET_NAME}/${key}`;

      // Preparar headers de autenticación AWS4
      const now = new Date();
      const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
      const dateStamp = amzDate.substring(0, 8);
      const region = 'auto';
      const service = 's3';

      // Usar UNSIGNED-PAYLOAD para evitar calcular hash del contenido
      const contentHash = 'UNSIGNED-PAYLOAD';

      // Headers canónicos
      const host = `${ACCOUNT_ID}.r2.cloudflarestorage.com`;
      const canonicalHeaders =
        `content-type:${contentType}\n` +
        `host:${host}\n` +
        `x-amz-content-sha256:${contentHash}\n` +
        `x-amz-date:${amzDate}\n`;

      const signedHeaders = 'content-type;host;x-amz-content-sha256;x-amz-date';

      // Request canónico
      const canonicalRequest =
        `PUT\n` +
        `/${BUCKET_NAME}/${key}\n` +
        `\n` +
        `${canonicalHeaders}\n` +
        `${signedHeaders}\n` +
        `${contentHash}`;

      // String to sign
      const algorithm = 'AWS4-HMAC-SHA256';
      const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
      const canonicalRequestHash = sha256(canonicalRequest);

      const stringToSign = `${algorithm}\n${amzDate}\n${credentialScope}\n${canonicalRequestHash}`;

      // Calcular firma con HMAC real
      const signingKey = getSignatureKey(SECRET_ACCESS_KEY!, dateStamp, region, service);
      const signature = hmacSha256(signingKey, stringToSign).toString(CryptoJS.enc.Hex);

      // Authorization header
      const authorization =
        `${algorithm} ` +
        `Credential=${ACCESS_KEY_ID}/${credentialScope}, ` +
        `SignedHeaders=${signedHeaders}, ` +
        `Signature=${signature}`;

      // Subir usando FileSystem.uploadAsync (maneja archivos binarios correctamente)
      const response = await FileSystem.uploadAsync(uploadUrl, fileUri, {
        httpMethod: 'PUT',
        uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
        headers: {
          'Content-Type': contentType,
          'x-amz-content-sha256': contentHash,
          'x-amz-date': amzDate,
          Authorization: authorization,
        },
      });

      if (response.status !== 200 && response.status !== 201) {
        console.error('❌ R2 Upload Error:', response.status, response.body);
        return { success: false, error: `Upload failed: ${response.status} - ${response.body}` };
      }

      const publicUrl = `${PUBLIC_URL}/${key}`;

      return {
        success: true,
        url: publicUrl,
        key,
      };
    } catch (error) {
      console.error('💥 R2 Upload Exception:', error);
      return { success: false, error: String(error) };
    }
  }

  // --------------------------------------------------------------------------
  // ELIMINAR ARCHIVO DE R2
  // --------------------------------------------------------------------------
  async deleteFile(key: string): Promise<R2DeleteResult> {
    try {
      const url = `${R2_ENDPOINT}/${BUCKET_NAME}/${key}`;
      const now = new Date();
      const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
      const dateStamp = amzDate.substring(0, 8);
      const region = 'auto';
      const service = 's3';

      // Hash de contenido vacío para DELETE (sha256 de string vacío)
      const contentHash = sha256('');
      const host = `${ACCOUNT_ID}.r2.cloudflarestorage.com`;

      const canonicalHeaders =
        `host:${host}\n` + `x-amz-content-sha256:${contentHash}\n` + `x-amz-date:${amzDate}\n`;

      const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';

      const canonicalRequest =
        `DELETE\n` +
        `/${BUCKET_NAME}/${key}\n` +
        `\n` +
        `${canonicalHeaders}\n` +
        `${signedHeaders}\n` +
        `${contentHash}`;

      const algorithm = 'AWS4-HMAC-SHA256';
      const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
      const canonicalRequestHash = sha256(canonicalRequest);

      const stringToSign = `${algorithm}\n${amzDate}\n${credentialScope}\n${canonicalRequestHash}`;

      // Calcular firma con HMAC real
      const signingKey = getSignatureKey(SECRET_ACCESS_KEY!, dateStamp, region, service);
      const signature = hmacSha256(signingKey, stringToSign).toString(CryptoJS.enc.Hex);

      const authorization =
        `${algorithm} ` +
        `Credential=${ACCESS_KEY_ID}/${credentialScope}, ` +
        `SignedHeaders=${signedHeaders}, ` +
        `Signature=${signature}`;

      const response = await fetch(url, {
        method: 'DELETE',
        headers: {
          'x-amz-content-sha256': contentHash,
          'x-amz-date': amzDate,
          Authorization: authorization,
        },
      });

      if (!response.ok && response.status !== 404) {
        console.error('❌ R2 Delete Error:', response.status);
        return { success: false, error: `Delete failed: ${response.status}` };
      }

      return { success: true };
    } catch (error) {
      console.error('💥 R2 Delete Exception:', error);
      return { success: false, error: String(error) };
    }
  }

  // --------------------------------------------------------------------------
  // SUBIR MEDIA DE EJERCICIO (HELPER)
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
  // EXTRAER KEY DE URL PÚBLICA
  // --------------------------------------------------------------------------
  getKeyFromUrl(url: string): string | null {
    if (!url.startsWith(PUBLIC_URL)) return null;
    return url.replace(`${PUBLIC_URL}/`, '');
  }

  // --------------------------------------------------------------------------
  // SUBIR DESDE BASE64 (guarda temporalmente y sube)
  // --------------------------------------------------------------------------
  async uploadFromBase64(
    base64Data: string,
    key: string,
    contentType: string
  ): Promise<R2UploadResult> {
    try {
      // Crear archivo temporal
      const tempUri = `${FileSystem.cacheDirectory}temp_upload_${Date.now()}.tmp`;

      // Escribir base64 a archivo temporal
      await FileSystem.writeAsStringAsync(tempUri, base64Data, {
        encoding: FileSystem.EncodingType.Base64,
      });

      // Subir usando el método existente
      const result = await this.uploadFile(tempUri, key, contentType);

      // Limpiar archivo temporal
      try {
        await FileSystem.deleteAsync(tempUri, { idempotent: true });
      } catch {
        // Ignorar errores de limpieza
      }

      return result;
    } catch (error) {
      console.error('💥 R2 Base64 Upload Exception:', error);
      return { success: false, error: String(error) };
    }
  }

  // --------------------------------------------------------------------------
  // SUBIR FOTO DE PROGRESO (HELPER)
  // --------------------------------------------------------------------------
  async uploadProgressPhoto(base64Data: string, userId: string): Promise<R2UploadResult> {
    const timestamp = Date.now();
    const key = `progress/${userId}/${timestamp}.jpg`;

    return this.uploadFromBase64(base64Data, key, 'image/jpeg');
  }

  // --------------------------------------------------------------------------
  // SUBIR THUMBNAIL DE EJERCICIO (ADMIN)
  // --------------------------------------------------------------------------
  async uploadExerciseThumbnail(base64Data: string, exerciseId: string): Promise<R2UploadResult> {
    const timestamp = Date.now();
    const key = `exercise-thumbnails/${exerciseId}/${timestamp}.jpg`;

    return this.uploadFromBase64(base64Data, key, 'image/jpeg');
  }

  // --------------------------------------------------------------------------
  // SUBIR VIDEO DE EJERCICIO (ADMIN)
  // --------------------------------------------------------------------------
  async uploadExerciseVideo(fileUri: string, exerciseId: string): Promise<R2UploadResult> {
    const timestamp = Date.now();
    const key = `exercise-videos/${exerciseId}/${timestamp}.mp4`;

    return this.uploadFile(fileUri, key, 'video/mp4');
  }

  // --------------------------------------------------------------------------
  // ELIMINAR THUMBNAIL DE EJERCICIO
  // --------------------------------------------------------------------------
  async deleteExerciseThumbnail(thumbnailUrl: string): Promise<R2DeleteResult> {
    const key = this.getKeyFromUrl(thumbnailUrl);
    if (!key) {
      return { success: false, error: 'URL inválida' };
    }
    return this.deleteFile(key);
  }

  // --------------------------------------------------------------------------
  // ELIMINAR FOTO DE PROGRESO
  // --------------------------------------------------------------------------
  async deleteProgressPhoto(photoUrl: string): Promise<R2DeleteResult> {
    const key = this.getKeyFromUrl(photoUrl);
    if (!key) {
      return { success: false, error: 'URL inválida' };
    }
    return this.deleteFile(key);
  }

  // --------------------------------------------------------------------------
  // SUBIR AVATAR DE USUARIO
  // --------------------------------------------------------------------------
  async uploadAvatar(fileUri: string, userId: string): Promise<R2UploadResult> {
    const timestamp = Date.now();
    const key = `avatars/${userId}_${timestamp}.jpg`;

    return this.uploadFile(fileUri, key, 'image/jpeg');
  }

  // --------------------------------------------------------------------------
  // ELIMINAR AVATAR DE USUARIO
  // --------------------------------------------------------------------------
  async deleteAvatar(avatarUrl: string): Promise<R2DeleteResult> {
    const key = this.getKeyFromUrl(avatarUrl);
    if (!key) {
      return { success: false, error: 'URL inválida' };
    }
    return this.deleteFile(key);
  }

  // --------------------------------------------------------------------------
  // SUBIR DESDE BLOB (para WEB)
  // Usa el Worker proxy para evitar CORS
  // --------------------------------------------------------------------------
  async uploadFromBlob(blob: Blob, key: string, contentType: string): Promise<R2UploadResult> {
    try {
      const workerUrl = 'https://trens-r2-upload.trens-app.workers.dev/upload';

      console.log('📤 Uploading via Worker:', key);

      const response = await fetch(workerUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': contentType,
          'X-File-Key': key,
          'X-Content-Type': contentType,
        },
        body: blob,
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Worker Upload Error:', response.status, errorText);
        return { success: false, error: `Upload failed: ${response.status} - ${errorText}` };
      }

      const result = await response.json();

      if (!result.success) {
        return { success: false, error: result.error || 'Unknown error' };
      }

      console.log('✅ Worker Upload Success:', result.url);

      return {
        success: true,
        url: result.url,
        key: result.key,
      };
    } catch (error) {
      console.error('💥 R2 Blob Upload Exception:', error);
      return { success: false, error: String(error) };
    }
  }
}

// Singleton
const cloudflareR2 = new CloudflareR2Service();
export default cloudflareR2;
