// ============================================================================
// WEB CAMERA MODAL - Cámara con preview en tiempo real para PWA
// Usa getUserMedia para mostrar la cámara en vivo
// Compatible con React Native Web
// ============================================================================

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, Modal, ActivityIndicator, Platform } from 'react-native';
import { X, RotateCcw, Camera } from 'lucide-react-native';
import * as Haptics from '../../lib/haptics';

export interface WebCameraResult {
  success: boolean;
  uri?: string;
  type?: 'photo' | 'video';
  blob?: Blob;
  error?: string;
}

interface WebCameraModalProps {
  visible: boolean;
  onClose: () => void;
  onCapture: (result: WebCameraResult) => void;
  allowVideo?: boolean;
  exerciseName?: string;
}

type CameraMode = 'photo' | 'video';
type FacingMode = 'user' | 'environment';

export function WebCameraModal({
  visible,
  onClose,
  onCapture,
  allowVideo = true,
  exerciseName,
}: WebCameraModalProps) {
  const videoElementRef = useRef<HTMLVideoElement | null>(null);
  const canvasElementRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  const [mode, setMode] = useState<CameraMode>('photo');
  const [facing, setFacing] = useState<FacingMode>('environment');
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cameraReady, setCameraReady] = useState(false);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Limpiar recursos
  const cleanup = useCallback(() => {
    console.log('🧹 Cleaning up camera resources');
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (videoElementRef.current) {
      videoElementRef.current.srcObject = null;
    }
    setCameraReady(false);
  }, []);

  // Iniciar cámara
  const startCamera = useCallback(async () => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;

    console.log('📷 Starting camera, facing:', facing);
    setIsLoading(true);
    setError(null);
    setCameraReady(false);

    try {
      // Limpiar stream anterior
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }

      // Obtener stream
      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: facing,
          width: { ideal: 1280 },
          height: { ideal: 1280 },
        },
        audio: mode === 'video',
      };

      console.log('📷 Requesting getUserMedia with constraints:', constraints);
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      console.log(
        '📷 Got stream:',
        stream.getTracks().map((t) => t.label)
      );

      // Asignar stream al video element si existe
      if (videoElementRef.current) {
        videoElementRef.current.srcObject = stream;
        console.log('📷 Assigned stream to video element');

        // Forzar reproducción
        try {
          await videoElementRef.current.play();
          console.log('📷 Video play started');
        } catch (playError) {
          console.log('📷 Auto-play blocked, will retry on interaction:', playError);
        }
      }

      setHasPermission(true);
      setIsLoading(false);
      setCameraReady(true);
    } catch (err: any) {
      console.error('❌ Error accessing camera:', err);
      setIsLoading(false);

      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setHasPermission(false);
        setError(
          'Permiso de cámara denegado. Por favor, permite el acceso en la configuración del navegador.'
        );
      } else if (err.name === 'NotFoundError') {
        setError('No se encontró ninguna cámara en este dispositivo.');
      } else if (err.name === 'NotReadableError') {
        setError('La cámara está siendo usada por otra aplicación.');
      } else {
        setError(`Error al acceder a la cámara: ${err.message || err.name}`);
      }
    }
  }, [facing, mode]);

  // Iniciar/detener cámara cuando el modal se abre/cierra
  useEffect(() => {
    if (visible && Platform.OS === 'web') {
      const timer = setTimeout(() => {
        startCamera();
      }, 200);
      return () => clearTimeout(timer);
    } else {
      cleanup();
    }

    return cleanup;
  }, [visible]);

  // Reiniciar cámara al cambiar facing
  useEffect(() => {
    if (visible && hasPermission && Platform.OS === 'web') {
      startCamera();
    }
  }, [facing]);

  // Asignar stream cuando el video element está disponible
  useEffect(() => {
    if (streamRef.current && videoElementRef.current && !videoElementRef.current.srcObject) {
      videoElementRef.current.srcObject = streamRef.current;
      console.log('📷 Re-assigned stream to video element');
    }
  });

  // Cambiar cámara
  const flipCamera = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setFacing((prev) => (prev === 'environment' ? 'user' : 'environment'));
  };

  // Tomar foto
  const takePhoto = () => {
    if (!videoElementRef.current || !canvasElementRef.current) {
      console.error('Video or canvas not ready');
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

    const video = videoElementRef.current;
    const canvas = canvasElementRef.current;

    // Usar dimensiones cuadradas
    const size = Math.min(video.videoWidth, video.videoHeight);
    canvas.width = size;
    canvas.height = size;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Calcular offset para centrar el crop
    const offsetX = (video.videoWidth - size) / 2;
    const offsetY = (video.videoHeight - size) / 2;

    // Si es cámara frontal, voltear horizontalmente
    if (facing === 'user') {
      ctx.translate(size, 0);
      ctx.scale(-1, 1);
    }

    ctx.drawImage(video, offsetX, offsetY, size, size, 0, 0, size, size);

    canvas.toBlob(
      (blob) => {
        if (blob) {
          const uri = URL.createObjectURL(blob);
          cleanup();
          onCapture({
            success: true,
            uri,
            type: 'photo',
            blob,
          });
        }
      },
      'image/jpeg',
      0.9
    );
  };

  // Iniciar grabación
  const startRecording = () => {
    if (!streamRef.current) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    chunksRef.current = [];

    try {
      // Buscar un mimeType soportado
      const mimeTypes = [
        'video/webm;codecs=vp9',
        'video/webm;codecs=vp8',
        'video/webm',
        'video/mp4',
      ];

      let selectedMimeType = '';
      for (const mimeType of mimeTypes) {
        if (MediaRecorder.isTypeSupported(mimeType)) {
          selectedMimeType = mimeType;
          break;
        }
      }

      const options: MediaRecorderOptions = selectedMimeType ? { mimeType: selectedMimeType } : {};

      const mediaRecorder = new MediaRecorder(streamRef.current, options);

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, {
          type: selectedMimeType || 'video/webm',
        });
        const uri = URL.createObjectURL(blob);
        cleanup();
        onCapture({
          success: true,
          uri,
          type: 'video',
          blob,
        });
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);

      timerRef.current = setInterval(() => {
        setRecordingTime((prev) => {
          if (prev >= 10) {
            stopRecording();
            return prev;
          }
          return prev + 1;
        });
      }, 1000);
    } catch (err) {
      console.error('Error starting recording:', err);
      setError('Error al iniciar grabación');
    }
  };

  // Detener grabación
  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  };

  // Seleccionar de galería
  const pickFromGallery = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = mode === 'video' ? 'video/*' : 'image/*';
    input.style.display = 'none';

    input.onchange = (event) => {
      const target = event.target as HTMLInputElement;
      const file = target.files?.[0];

      if (file) {
        const uri = URL.createObjectURL(file);
        cleanup();
        onCapture({
          success: true,
          uri,
          type: file.type.startsWith('video') ? 'video' : 'photo',
          blob: file,
        });
      }
      document.body.removeChild(input);
    };

    document.body.appendChild(input);
    input.click();
  };

  // Solicitar permisos
  const requestPermission = () => {
    setIsLoading(true);
    setError(null);
    startCamera();
  };

  // Cerrar modal
  const handleClose = () => {
    cleanup();
    onClose();
  };

  // No renderizar en nativo
  if (Platform.OS !== 'web') {
    return null;
  }

  // Pantalla de permisos
  const renderPermissionScreen = () => (
    <View className="flex-1 justify-center items-center px-8">
      <View
        style={{
          shadowColor: '#DC2626',
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: 0.8,
          shadowRadius: 20,
        }}
      >
        <Camera color="#DC2626" size={64} />
      </View>
      <Text className="text-white text-xl font-bold text-center mt-6">📸 Permiso de Cámara</Text>
      <Text className="text-zinc-400 text-center mt-2 mb-8">
        {error || 'Necesitamos acceso a tu cámara para tomar fotos y videos de tus ejercicios.'}
      </Text>
      <TouchableOpacity
        onPress={requestPermission}
        className="px-8 py-4 rounded-full mb-4"
        style={{
          backgroundColor: '#DC2626',
          shadowColor: '#DC2626',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.5,
          shadowRadius: 10,
        }}
      >
        <Text className="text-white font-bold">PERMITIR CÁMARA 🔥</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={handleClose} className="px-8 py-4">
        <Text className="text-zinc-500 font-bold">CANCELAR</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={handleClose}>
      <View className="flex-1 bg-black">
        {isLoading ? (
          <View className="flex-1 justify-center items-center">
            <ActivityIndicator size="large" color="#DC2626" />
            <Text className="text-white mt-4">Iniciando cámara...</Text>
          </View>
        ) : hasPermission === false || error ? (
          renderPermissionScreen()
        ) : (
          <>
            {/* Header */}
            <View className="bg-black px-6 py-4 pt-12 border-b border-zinc-900">
              <View className="flex-row justify-between items-center">
                <TouchableOpacity onPress={handleClose}>
                  <X color="#FFFFFF" size={28} />
                </TouchableOpacity>
                <Text className="text-white font-bold text-lg">
                  {mode === 'photo' ? '📸 FOTO' : '🎬 VIDEO'}
                </Text>
                <TouchableOpacity onPress={flipCamera}>
                  <RotateCcw color="#FFFFFF" size={24} />
                </TouchableOpacity>
              </View>
              {exerciseName && (
                <Text className="text-zinc-500 text-center text-sm mt-2">{exerciseName}</Text>
              )}
            </View>

            {/* Mode Toggle */}
            {allowVideo && (
              <View className="flex-row justify-center py-4 bg-black border-b border-zinc-900">
                <TouchableOpacity
                  onPress={() => {
                    setMode('photo');
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  }}
                  className={`px-6 py-2 rounded-l-full ${mode === 'photo' ? 'bg-red-600' : 'bg-zinc-800'}`}
                >
                  <Text
                    className={`font-bold ${mode === 'photo' ? 'text-white' : 'text-zinc-400'}`}
                  >
                    📸 FOTO
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => {
                    setMode('video');
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  }}
                  className={`px-6 py-2 rounded-r-full ${mode === 'video' ? 'bg-red-600' : 'bg-zinc-800'}`}
                >
                  <Text
                    className={`font-bold ${mode === 'video' ? 'text-white' : 'text-zinc-400'}`}
                  >
                    🎬 VIDEO
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Camera Preview */}
            <View className="flex-1 justify-center items-center bg-black px-4">
              <View
                className="w-full overflow-hidden rounded-lg"
                style={{
                  aspectRatio: 1,
                  maxHeight: '60%',
                  backgroundColor: '#18181b',
                }}
              >
                {/* Video element for camera preview */}
                <video
                  ref={(el) => {
                    videoElementRef.current = el;
                    // Asignar stream si está disponible
                    if (el && streamRef.current) {
                      if (!el.srcObject) {
                        el.srcObject = streamRef.current;
                      }
                      // Forzar play
                      el.play().catch(() => {});
                    }
                  }}
                  autoPlay
                  playsInline
                  muted
                  onLoadedMetadata={(e) => {
                    const video = e.target as HTMLVideoElement;
                    console.log(
                      '📷 Video metadata loaded:',
                      video.videoWidth,
                      'x',
                      video.videoHeight
                    );
                    video.play().catch(() => {});
                    setCameraReady(true);
                  }}
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    transform: facing === 'user' ? 'scaleX(-1)' : 'none',
                    backgroundColor: '#000',
                    borderRadius: 8,
                  }}
                />

                {/* Recording indicator */}
                {isRecording && (
                  <View
                    className="absolute top-4 left-4 flex-row items-center px-3 py-1 rounded-full"
                    style={{ backgroundColor: '#DC2626' }}
                  >
                    <View className="w-3 h-3 rounded-full bg-white mr-2" />
                    <Text className="text-white font-bold font-mono">{recordingTime}s / 10s</Text>
                  </View>
                )}

                {/* Loading overlay */}
                {!cameraReady && (
                  <View
                    className="absolute inset-0 justify-center items-center"
                    style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
                  >
                    <ActivityIndicator size="large" color="#DC2626" />
                  </View>
                )}
              </View>
            </View>

            {/* Hidden canvas */}
            <canvas
              ref={(el) => {
                canvasElementRef.current = el;
              }}
              style={{ display: 'none' }}
            />

            {/* Controls */}
            <View className="bg-black py-6 border-t border-zinc-900 pb-12">
              {/* Gallery button */}
              <View className="flex-row justify-center mb-4">
                <TouchableOpacity
                  onPress={pickFromGallery}
                  className="px-6 py-3 rounded-full border border-zinc-700"
                  style={{ backgroundColor: '#18181b' }}
                  disabled={isRecording}
                >
                  <Text className="text-white font-bold">📁 GALERÍA</Text>
                </TouchableOpacity>
              </View>

              {/* Capture button */}
              <View className="items-center">
                {mode === 'photo' ? (
                  <>
                    <TouchableOpacity
                      onPress={takePhoto}
                      disabled={!cameraReady}
                      className="w-20 h-20 rounded-full border-4 border-white items-center justify-center"
                      style={{
                        backgroundColor: 'transparent',
                        opacity: cameraReady ? 1 : 0.5,
                      }}
                    >
                      <View className="w-16 h-16 rounded-full bg-white" />
                    </TouchableOpacity>
                    <Text className="text-zinc-500 text-xs mt-3">TOCA PARA FOTO</Text>
                  </>
                ) : (
                  <>
                    <TouchableOpacity
                      onPress={isRecording ? stopRecording : startRecording}
                      disabled={!cameraReady && !isRecording}
                      className={`w-20 h-20 rounded-full border-4 items-center justify-center ${
                        isRecording ? 'border-red-600' : 'border-white'
                      }`}
                      style={{ opacity: cameraReady || isRecording ? 1 : 0.5 }}
                    >
                      {isRecording ? (
                        <View className="w-8 h-8 rounded-sm bg-red-600" />
                      ) : (
                        <View className="w-16 h-16 rounded-full bg-red-600" />
                      )}
                    </TouchableOpacity>
                    <Text className="text-zinc-500 text-xs mt-3">
                      {isRecording ? 'TOCA PARA DETENER' : 'TOCA PARA GRABAR'}
                    </Text>
                  </>
                )}
              </View>
            </View>
          </>
        )}
      </View>
    </Modal>
  );
}
