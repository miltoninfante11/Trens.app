// ============================================================================
// WEB CAMERA - Solución universal para cámara en PWA/Web
// Usa <input type="file" capture> para máxima compatibilidad
// También soporta getUserMedia para preview en tiempo real
// ============================================================================

import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { isPWA } from './pwaDetection';

export interface CameraResult {
  success: boolean;
  uri?: string;
  base64?: string;
  width?: number;
  height?: number;
  error?: string;
  type?: 'photo' | 'video'; // Tipo de media
  file?: File; // Archivo original para upload (solo web)
}

export interface CameraPermissionStatus {
  granted: boolean;
  canAskAgain: boolean;
}

/**
 * Solicita permisos de cámara en web/PWA
 * Retorna true si el permiso fue concedido
 */
export async function requestWebCameraPermission(): Promise<CameraPermissionStatus> {
  if (Platform.OS !== 'web') {
    // En nativo, usar expo-image-picker
    const { status, canAskAgain } = await ImagePicker.requestCameraPermissionsAsync();
    return { granted: status === 'granted', canAskAgain };
  }

  if (typeof navigator === 'undefined' || !navigator.mediaDevices) {
    return { granted: false, canAskAgain: false };
  }

  try {
    // Intentar obtener acceso a la cámara para solicitar permisos
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    // Detener el stream inmediatamente - solo queríamos verificar permisos
    stream.getTracks().forEach((track) => track.stop());
    return { granted: true, canAskAgain: true };
  } catch (error: any) {
    if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
      return { granted: false, canAskAgain: false };
    }
    // Otros errores (ej: no hay cámara)
    return { granted: false, canAskAgain: true };
  }
}

/**
 * Verifica el estado actual de los permisos de cámara
 */
export async function getCameraPermissionStatusWeb(): Promise<CameraPermissionStatus> {
  if (Platform.OS !== 'web') {
    const { status, canAskAgain } = await ImagePicker.getCameraPermissionsAsync();
    return { granted: status === 'granted', canAskAgain };
  }

  if (typeof navigator === 'undefined' || !navigator.permissions) {
    // Si no hay API de permisos, asumir que podemos preguntar
    return { granted: false, canAskAgain: true };
  }

  try {
    const result = await navigator.permissions.query({ name: 'camera' as PermissionName });
    return {
      granted: result.state === 'granted',
      canAskAgain: result.state !== 'denied',
    };
  } catch {
    // Algunos navegadores no soportan query para camera
    return { granted: false, canAskAgain: true };
  }
}

/**
 * Abre la cámara usando el método más compatible según la plataforma
 * - Nativo: usa expo-image-picker
 * - PWA/Web: usa input file con capture (100% compatible)
 */
export async function openCamera(options?: {
  quality?: number;
  allowsEditing?: boolean;
  aspect?: [number, number];
  base64?: boolean;
}): Promise<CameraResult> {
  const isWeb = Platform.OS === 'web';

  // En web/PWA usar el método HTML nativo
  if (isWeb) {
    return openCameraWeb(options);
  }

  // En nativo usar expo-image-picker
  return openCameraNative(options);
}

/**
 * Abre la galería de forma universal
 */
export async function openGallery(options?: {
  quality?: number;
  allowsEditing?: boolean;
  aspect?: [number, number];
  base64?: boolean;
}): Promise<CameraResult> {
  const isWeb = Platform.OS === 'web';

  if (isWeb) {
    return openGalleryWeb(options);
  }

  return openGalleryNative(options);
}

// ============================================================================
// WEB IMPLEMENTATIONS
// ============================================================================

/**
 * Abre la cámara en web usando input file con capture
 * Esto funciona en TODOS los navegadores incluyendo Safari iOS
 */
function openCameraWeb(options?: { quality?: number; base64?: boolean }): Promise<CameraResult> {
  return new Promise((resolve) => {
    // Crear input file oculto
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.capture = 'environment'; // Cámara trasera por defecto

    // Estilo para ocultarlo
    input.style.position = 'fixed';
    input.style.top = '-9999px';
    input.style.left = '-9999px';

    const cleanup = () => {
      document.body.removeChild(input);
    };

    input.onchange = async (event) => {
      const target = event.target as HTMLInputElement;
      const file = target.files?.[0];

      if (!file) {
        cleanup();
        resolve({ success: false, error: 'No se seleccionó ninguna imagen' });
        return;
      }

      try {
        const result = await processImageFile(file, options);
        cleanup();
        resolve(result);
      } catch (error) {
        cleanup();
        resolve({ success: false, error: 'Error procesando la imagen' });
      }
    };

    input.oncancel = () => {
      cleanup();
      resolve({ success: false, error: 'Cancelado por el usuario' });
    };

    // Agregar al DOM y disparar click
    document.body.appendChild(input);
    input.click();
  });
}

/**
 * Abre la galería en web usando input file sin capture
 * Soporta imágenes y videos
 */
function openGalleryWeb(options?: { quality?: number; base64?: boolean }): Promise<CameraResult> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*,video/*'; // Aceptar imágenes y videos
    // Sin capture = abre selector de archivos

    input.style.position = 'fixed';
    input.style.top = '-9999px';
    input.style.left = '-9999px';

    const cleanup = () => {
      document.body.removeChild(input);
    };

    input.onchange = async (event) => {
      const target = event.target as HTMLInputElement;
      const file = target.files?.[0];

      if (!file) {
        cleanup();
        resolve({ success: false, error: 'No se seleccionó ninguna imagen' });
        return;
      }

      try {
        const result = await processImageFile(file, options);
        cleanup();
        resolve(result);
      } catch (error) {
        cleanup();
        resolve({ success: false, error: 'Error procesando la imagen' });
      }
    };

    input.oncancel = () => {
      cleanup();
      resolve({ success: false, error: 'Cancelado por el usuario' });
    };

    document.body.appendChild(input);
    input.click();
  });
}

/**
 * Procesa un archivo de imagen/video y retorna URI como blob URL + File original
 * El File original se usa para upload confiable, el blob URL para preview
 */
async function processImageFile(
  file: File,
  options?: { quality?: number; base64?: boolean }
): Promise<CameraResult> {
  return new Promise((resolve) => {
    const isVideo = file.type.startsWith('video/');
    const blobUrl = URL.createObjectURL(file);

    // Para videos, crear elemento video para obtener dimensiones
    if (isVideo) {
      const video = document.createElement('video');
      video.onloadedmetadata = () => {
        resolve({
          success: true,
          uri: blobUrl,
          width: video.videoWidth,
          height: video.videoHeight,
          type: 'video',
          file: file, // Guardar archivo original para upload
        });
      };
      video.onerror = () => {
        URL.revokeObjectURL(blobUrl);
        resolve({ success: false, error: 'Error cargando el video' });
      };
      video.src = blobUrl;
      return;
    }

    // Para imágenes, crear img para obtener dimensiones
    const img = document.createElement('img');
    img.onload = () => {
      let base64: string | undefined;

      // Si se requiere base64, leer el archivo
      if (options?.base64) {
        const reader = new FileReader();
        reader.onload = (e) => {
          const dataUrl = e.target?.result as string;
          base64 = dataUrl.replace(/^data:image\/\w+;base64,/, '');
          resolve({
            success: true,
            uri: blobUrl,
            base64,
            width: img.width,
            height: img.height,
            type: 'photo',
            file: file, // Guardar archivo original para upload
          });
        };
        reader.onerror = () => {
          resolve({
            success: true,
            uri: blobUrl,
            width: img.width,
            height: img.height,
            type: 'photo',
            file: file,
          });
        };
        reader.readAsDataURL(file);
      } else {
        resolve({
          success: true,
          uri: blobUrl,
          width: img.width,
          height: img.height,
          type: 'photo',
          file: file, // Guardar archivo original para upload
        });
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(blobUrl);
      resolve({ success: false, error: 'Error cargando la imagen' });
    };
    img.src = blobUrl;
  });
}

// ============================================================================
// NATIVE IMPLEMENTATIONS
// ============================================================================

/**
 * Abre la cámara nativa usando expo-image-picker
 */
async function openCameraNative(options?: {
  quality?: number;
  allowsEditing?: boolean;
  aspect?: [number, number];
  base64?: boolean;
}): Promise<CameraResult> {
  // Solicitar permisos
  const { status } = await ImagePicker.requestCameraPermissionsAsync();
  if (status !== 'granted') {
    return { success: false, error: 'Permiso de cámara denegado' };
  }

  try {
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: options?.quality ?? 0.8,
      allowsEditing: options?.allowsEditing ?? true,
      aspect: options?.aspect,
      base64: options?.base64 ?? false,
    });

    if (result.canceled || !result.assets[0]) {
      return { success: false, error: 'Cancelado por el usuario' };
    }

    const asset = result.assets[0];
    return {
      success: true,
      uri: asset.uri,
      base64: asset.base64 ?? undefined,
      width: asset.width,
      height: asset.height,
    };
  } catch (error) {
    console.error('Error abriendo cámara nativa:', error);
    return { success: false, error: 'Error accediendo a la cámara' };
  }
}

/**
 * Abre la galería nativa usando expo-image-picker
 */
async function openGalleryNative(options?: {
  quality?: number;
  allowsEditing?: boolean;
  aspect?: [number, number];
  base64?: boolean;
}): Promise<CameraResult> {
  // Solicitar permisos
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (status !== 'granted') {
    return { success: false, error: 'Permiso de galería denegado' };
  }

  try {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: options?.quality ?? 0.8,
      allowsEditing: options?.allowsEditing ?? true,
      aspect: options?.aspect,
      base64: options?.base64 ?? false,
    });

    if (result.canceled || !result.assets[0]) {
      return { success: false, error: 'Cancelado por el usuario' };
    }

    const asset = result.assets[0];
    return {
      success: true,
      uri: asset.uri,
      base64: asset.base64 ?? undefined,
      width: asset.width,
      height: asset.height,
    };
  } catch (error) {
    console.error('Error abriendo galería nativa:', error);
    return { success: false, error: 'Error accediendo a la galería' };
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Verifica si la cámara está disponible
 */
export function isCameraAvailable(): boolean {
  if (Platform.OS !== 'web') {
    return true; // En nativo siempre está disponible
  }

  // En web, verificar si hay soporte para input capture
  if (typeof document === 'undefined') return false;

  // Input file con capture funciona en prácticamente todos los navegadores móviles
  const isIOSOrAndroid = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

  return isIOSOrAndroid;
}

/**
 * Detecta si estamos en un entorno que requiere el método web
 */
export function shouldUseWebCamera(): boolean {
  if (Platform.OS !== 'web') return false;
  return isPWA() || typeof window !== 'undefined';
}

/**
 * Información sobre permisos de cámara en web
 */
export async function getCameraPermissionStatus(): Promise<'granted' | 'denied' | 'prompt'> {
  if (Platform.OS !== 'web') {
    const { status } = await ImagePicker.getCameraPermissionsAsync();
    return status === 'granted' ? 'granted' : 'denied';
  }

  // En web con input file no se necesitan permisos previos
  // El navegador los solicita automáticamente al abrir la cámara
  return 'granted';
}

// ============================================================================
// COMPRESSION UTILITIES
// ============================================================================

/**
 * Comprime una imagen a un tamaño máximo y calidad específica
 * @param file - Archivo de imagen original
 * @param maxSize - Tamaño máximo del lado más largo (default: 1080px)
 * @param quality - Calidad JPEG 0-1 (default: 0.7)
 * @returns Blob comprimido
 */
export async function compressImage(
  file: File | Blob,
  maxSize: number = 1080,
  quality: number = 0.7
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = document.createElement('img');
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);

      const origW = img.width;
      const origH = img.height;

      // Crop cuadrado centrado
      const cropSide = Math.min(origW, origH);
      const sx = Math.round((origW - cropSide) / 2);
      const sy = Math.round((origH - cropSide) / 2);

      // Tamaño final: cuadrado limitado a maxSize
      const finalSize = Math.min(cropSide, maxSize);

      // Crear canvas cuadrado
      const canvas = document.createElement('canvas');
      canvas.width = finalSize;
      canvas.height = finalSize;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('No se pudo crear contexto canvas'));
        return;
      }

      // Fondo negro para transparencias
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, finalSize, finalSize);

      // Dibujar imagen con crop cuadrado centrado
      ctx.drawImage(img, sx, sy, cropSide, cropSide, 0, 0, finalSize, finalSize);

      // Convertir a blob JPEG comprimido
      canvas.toBlob(
        (blob) => {
          if (blob) {
            console.log(
              `📸 Image compressed: ${Math.round(file.size / 1024)}KB → ${Math.round(blob.size / 1024)}KB (${finalSize}x${finalSize})`
            );
            resolve(blob);
          } else {
            reject(new Error('Error comprimiendo imagen'));
          }
        },
        'image/jpeg',
        quality
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Error cargando imagen para comprimir'));
    };

    img.src = url;
  });
}

/**
 * Comprime un video re-codificándolo con menor resolución y bitrate
 * NOTA: La compresión de video en navegador es lenta. Para archivos grandes,
 * se recomienda usar compresión del lado del servidor o Cloudflare Stream.
 * @param file - Archivo de video original
 * @param maxSize - Resolución máxima del lado más largo (default: 720px)
 * @param maxDuration - Duración máxima en segundos (default: 10)
 * @returns Blob de video (puede ser el original si falla la compresión)
 */
export async function compressVideo(
  file: File | Blob,
  maxSize: number = 720,
  maxDuration: number = 10
): Promise<Blob> {
  // Si el archivo es pequeño (menos de 10MB), no comprimir
  if (file.size < 10 * 1024 * 1024) {
    console.log('🎬 Video is small enough, skipping compression');
    return file;
  }

  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    const url = URL.createObjectURL(file);

    video.onloadedmetadata = async () => {
      try {
        // Calcular nuevas dimensiones
        const origVW = video.videoWidth;
        const origVH = video.videoHeight;
        const duration = Math.min(video.duration, maxDuration);

        // Crop cuadrado centrado
        const cropSide = Math.min(origVW, origVH);
        const sx = Math.round((origVW - cropSide) / 2);
        const sy = Math.round((origVH - cropSide) / 2);

        // Tamaño final cuadrado, limitado a maxSize
        let finalSize = Math.min(cropSide, maxSize);
        // Asegurar que sea par (requerido por algunos codecs)
        finalSize = finalSize % 2 === 0 ? finalSize : finalSize + 1;

        console.log(
          `🎬 Compressing video: ${origVW}x${origVH} → ${finalSize}x${finalSize} (square crop), duration: ${duration.toFixed(1)}s`
        );

        // Crear canvas cuadrado para capturar frames
        const canvas = document.createElement('canvas');
        canvas.width = finalSize;
        canvas.height = finalSize;
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          throw new Error('No se pudo crear contexto canvas');
        }

        // Configurar MediaRecorder con bitrate reducido
        const stream = canvas.captureStream(24); // 24 FPS

        // Encontrar el mejor formato soportado
        const mimeTypes = [
          'video/webm;codecs=vp9',
          'video/webm;codecs=vp8',
          'video/webm',
          'video/mp4',
        ];

        let mimeType =
          mimeTypes.find((type) => MediaRecorder.isTypeSupported(type)) || 'video/webm';

        const recorder = new MediaRecorder(stream, {
          mimeType,
          videoBitsPerSecond: 800000, // 800 Kbps
        });

        const chunks: Blob[] = [];

        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) {
            chunks.push(e.data);
          }
        };

        recorder.onstop = () => {
          URL.revokeObjectURL(url);

          const blob = new Blob(chunks, { type: mimeType });
          console.log(
            `🎬 Video compressed: ${Math.round(file.size / 1024)}KB → ${Math.round(blob.size / 1024)}KB`
          );
          resolve(blob);
        };

        recorder.onerror = () => {
          URL.revokeObjectURL(url);
          console.warn('⚠️ Video compression failed, using original');
          resolve(file); // Devolver original si falla
        };

        // Empezar grabación
        recorder.start(100); // Capturar cada 100ms
        video.currentTime = 0;
        video.muted = true;
        video.play();

        // Dibujar frames en el canvas
        const drawFrame = () => {
          if (video.currentTime < duration && !video.paused && !video.ended) {
            ctx.drawImage(video, sx, sy, cropSide, cropSide, 0, 0, finalSize, finalSize);
            requestAnimationFrame(drawFrame);
          } else {
            // Terminar grabación
            video.pause();
            setTimeout(() => {
              if (recorder.state === 'recording') {
                recorder.stop();
              }
            }, 200);
          }
        };

        video.onplay = () => {
          drawFrame();
        };

        // Timeout de seguridad (máximo 30 segundos de procesamiento)
        setTimeout(() => {
          if (recorder.state === 'recording') {
            console.warn('⚠️ Video compression timeout, stopping');
            video.pause();
            recorder.stop();
          }
        }, 30000);
      } catch (error) {
        URL.revokeObjectURL(url);
        console.warn('⚠️ Video compression error:', error);
        resolve(file); // Devolver original si falla
      }
    };

    video.onerror = () => {
      URL.revokeObjectURL(url);
      console.warn('⚠️ Video load error, using original');
      resolve(file); // Devolver original si falla
    };

    video.src = url;
    video.load();
  });
}
