// =============================================================================
// PRO SCREEN - Cámara PRO con Video + Foto
// Incluye: Filtros, Spotify sync, Overlay de datos, Compartir a redes
// Formato: 9:16 (vertical)
// Compatibilidad: Nativo (cámara completa) + PWA (solo galería)
// =============================================================================

import { View, Text, TouchableOpacity, ActivityIndicator, Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import {
  RotateCcw,
  Zap,
  ZapOff,
  Music,
  Lock,
  Camera,
  Image as ImageIcon,
} from 'lucide-react-native';
import { PWAGuard } from '../../../components/auth/PWAGuard';
import * as Haptics from '../../../lib/haptics';
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from 'expo-router';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  Easing,
} from 'react-native-reanimated';

// Imports condicionales para nativo
const isWeb = Platform.OS === 'web';
let CameraView: any = null;
let useCameraPermissions: any = null;
let Audio: any = null;

if (!isWeb) {
  // Solo importar expo-camera en nativo
  const cameraModule = require('expo-camera');
  CameraView = cameraModule.CameraView;
  useCameraPermissions = cameraModule.useCameraPermissions;
  const audioModule = require('expo-av');
  Audio = audioModule.Audio;
}
import { compressVideo, compressImage } from '../../../lib/webCamera';
import { useUserRoleContext } from '../../../context/UserRoleContext';
import { useProContext } from '../../../context/ProContext';
import { useProRecording } from '../../../context/ProRecordingContext';
import { useHank } from '../../../context/HankContext';
import { useSaveGuard } from '../../_layout';
import { ProUpgradeModal } from '../../../components/pro/ProUpgradeModal';
import { ProMediaEditor, MediaData, SpotifyMetadata } from '../../../components/pro/ProMediaEditor';
import { ShareSuccessModal } from '../../../components/pro/ShareSuccessModal';

import spotify from '../../../services/spotify/spotify';
import cloudflareStream from '../../../services/cloudflare/stream';
import cloudflareR2 from '../../../services/cloudflare/r2';

// ============================================================================
// MAIN COMPONENT
// ============================================================================

function ProScreenContent() {
  const { user, isPro, spotifyPremium, spotifyConnected } = useUserRoleContext();
  const { context: proContext, clearContext } = useProContext();
  const { registerHandlers, setRecordingState, setSpotifyState, setExerciseState } =
    useProRecording();
  const { triggerRefresh, setScreenContext } = useHank();
  const { canSave } = useSaveGuard();

  // Sincronizar contexto con HANK
  useFocusEffect(
    useCallback(() => {
      setScreenContext({
        module: 'pro',
        viewMode: proContext.type || 'free',
        currentExerciseIndex: null,
        currentTrainingDay: 0,
      });
    }, [proContext.type, setScreenContext])
  );

  // Upgrade Modal (para usuarios FREE)
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  // Camera State - Solo para nativo
  const nativePermissionHook =
    !isWeb && useCameraPermissions
      ? useCameraPermissions()
      : [{ granted: true }, () => Promise.resolve({ granted: true })];
  const [permission, requestPermission] = nativePermissionHook as [
    { granted: boolean } | null,
    () => Promise<{ granted: boolean }>,
  ];
  const [cameraFacing, setCameraFacing] = useState<'front' | 'back'>('back');
  const [flashMode, setFlashMode] = useState<'off' | 'on' | 'auto'>('off');
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const cameraRef = useRef<any>(null);

  // Web Camera Refs (PWA inline)
  const webVideoRef = useRef<HTMLVideoElement | null>(null);
  const webCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const webStreamRef = useRef<MediaStream | null>(null);
  const webRecorderRef = useRef<MediaRecorder | null>(null);
  const webChunksRef = useRef<Blob[]>([]);
  const [webCameraReady, setWebCameraReady] = useState(false);
  const [webCameraError, setWebCameraError] = useState<string | null>(null);
  const [webFacing, setWebFacing] = useState<'user' | 'environment'>('environment');

  // Media Data (video o foto)
  const [capturedMedia, setCapturedMedia] = useState<MediaData | null>(null);

  // Editor Modal State
  const [editorVisible, setEditorVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [keepSpotifyPlaying, setKeepSpotifyPlaying] = useState(false);

  // Spotify State
  const [spotifyMetadata, setSpotifyMetadata] = useState<SpotifyMetadata | null>(null);

  // Share Success Modal
  const [showShareModal, setShowShareModal] = useState(false);
  const [savedMediaInfo, setSavedMediaInfo] = useState<{
    mediaType: 'video' | 'photo';
    isPublic: boolean;
    localUri?: string;
  } | null>(null);

  // Timer ref
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordingTimeRef = useRef(0);

  // Capturar metadata de Spotify
  useEffect(() => {
    const captureSpotifyMetadata = async () => {
      if (spotifyConnected && spotifyPremium) {
        try {
          const playbackState = await spotify.getPlaybackState();
          if (playbackState?.isPlaying && playbackState.track) {
            const track = playbackState.track;
            setSpotifyMetadata((prev) => {
              if (prev?.trackUri !== track.uri) {
                return {
                  enabled: true,
                  trackUri: track.uri,
                  positionMs: track.positionMs || 0,
                  trackName: track.name,
                  artist: track.artist,
                  albumArt: track.albumArt,
                  durationMs: track.durationMs || 240000,
                };
              }
              return prev;
            });
          } else {
            setSpotifyMetadata(null);
          }
        } catch (error) {
          console.warn('No se pudo capturar metadata de Spotify:', error);
        }
      }
    };

    captureSpotifyMetadata();
    const interval = setInterval(captureSpotifyMetadata, 2000);
    return () => clearInterval(interval);
  }, [spotifyConnected, spotifyPremium]);

  // Animation - Breathing effect
  const shutterScale = useSharedValue(1);
  const pulseOpacity = useSharedValue(0.5);

  useEffect(() => {
    if (isRecording) {
      shutterScale.value = withRepeat(
        withSequence(
          withTiming(1.1, { duration: 800, easing: Easing.inOut(Easing.ease) }),
          withTiming(1, { duration: 800, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        true
      );
      pulseOpacity.value = withRepeat(
        withSequence(withTiming(1, { duration: 500 }), withTiming(0.5, { duration: 500 })),
        -1,
        true
      );
    } else {
      shutterScale.value = withTiming(1);
      pulseOpacity.value = withTiming(0.5);
    }
  }, [isRecording]);

  const shutterAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: shutterScale.value }],
  }));

  const pulseAnimatedStyle = useAnimatedStyle(() => ({
    opacity: pulseOpacity.value,
  }));

  // Audio Setup
  useEffect(() => {
    const setupAudio = async () => {
      try {
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: true,
          playsInSilentModeIOS: true,
          staysActiveInBackground: false,
          interruptionModeIOS: 2,
          shouldDuckAndroid: false,
          interruptionModeAndroid: 2,
          playThroughEarpieceAndroid: false,
        });
      } catch (error) {
        console.error('Error configurando audio:', error);
      }
    };
    setupAudio();
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, []);

  // -------------------------------------------------------------------------
  // WEB CAMERA INLINE - Iniciar cámara al montar (PWA)
  // -------------------------------------------------------------------------

  const startWebCamera = useCallback(async () => {
    if (!isWeb || typeof navigator === 'undefined' || typeof document === 'undefined') return;

    console.log('📷 PRO Web: Starting inline camera, facing:', webFacing);
    setWebCameraError(null);
    setWebCameraReady(false);

    try {
      // Limpiar stream anterior
      if (webStreamRef.current) {
        webStreamRef.current.getTracks().forEach((track) => track.stop());
        webStreamRef.current = null;
      }

      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: webFacing,
          width: { ideal: 1080 },
          height: { ideal: 1920 },
        },
        audio: true,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      webStreamRef.current = stream;

      if (webVideoRef.current) {
        webVideoRef.current.srcObject = stream;
        try {
          await webVideoRef.current.play();
        } catch (playError) {
          console.log('📷 Auto-play blocked:', playError);
        }
      }

      setWebCameraReady(true);
    } catch (err: any) {
      console.error('❌ Web camera error:', err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setWebCameraError(
          'Permiso de cámara denegado. Permite el acceso en la configuración del navegador.'
        );
      } else if (err.name === 'NotFoundError') {
        setWebCameraError('No se encontró ninguna cámara en este dispositivo.');
      } else {
        setWebCameraError(`Error al acceder a la cámara: ${err.message || err.name}`);
      }
    }
  }, [webFacing]);

  const cleanupWebCamera = useCallback(() => {
    if (webStreamRef.current) {
      webStreamRef.current.getTracks().forEach((track) => track.stop());
      webStreamRef.current = null;
    }
    if (webVideoRef.current) {
      webVideoRef.current.srcObject = null;
    }
    setWebCameraReady(false);
  }, []);

  // Auto-start web camera on mount
  useEffect(() => {
    if (isWeb) {
      const timer = setTimeout(() => startWebCamera(), 300);
      return () => {
        clearTimeout(timer);
        cleanupWebCamera();
      };
    }
  }, []);

  // Restart web camera when facing changes
  useEffect(() => {
    if (isWeb && webCameraReady) {
      startWebCamera();
    }
  }, [webFacing]);

  // Re-assign stream if video element remounts
  useEffect(() => {
    if (isWeb && webStreamRef.current && webVideoRef.current && !webVideoRef.current.srcObject) {
      webVideoRef.current.srcObject = webStreamRef.current;
      webVideoRef.current.play().catch(() => {});
    }
  });

  // -------------------------------------------------------------------------
  // WEB RECORDING HANDLERS
  // -------------------------------------------------------------------------

  const webStartRecording = () => {
    if (!webStreamRef.current || isRecording) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    webChunksRef.current = [];
    setIsRecording(true);
    setRecordingTime(0);
    recordingTimeRef.current = 0;

    // Capturar Spotify metadata
    if (spotifyConnected && spotifyPremium) {
      spotify
        .getPlaybackState()
        .then((playbackState) => {
          if (playbackState?.isPlaying && playbackState.track) {
            setSpotifyMetadata({
              enabled: true,
              trackUri: playbackState.track.uri,
              positionMs: playbackState.track.positionMs || 0,
              trackName: playbackState.track.name,
              artist: playbackState.track.artist,
              albumArt: playbackState.track.albumArt,
              durationMs: playbackState.track.durationMs || 240000,
            });
          }
        })
        .catch(() => {});
    }

    try {
      const mimeTypes = [
        'video/webm;codecs=vp9',
        'video/webm;codecs=vp8',
        'video/webm',
        'video/mp4',
      ];
      const selectedMimeType =
        mimeTypes.find((t) => MediaRecorder.isTypeSupported(t)) || 'video/webm';

      const recorder = new MediaRecorder(webStreamRef.current, {
        mimeType: selectedMimeType,
      });

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) webChunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(webChunksRef.current, { type: selectedMimeType });
        const uri = URL.createObjectURL(blob);
        const finalDuration = Math.max(1, recordingTimeRef.current);

        setCapturedMedia({
          uri,
          type: 'video',
          duration: finalDuration,
        });
        setEditorVisible(true);
        setIsRecording(false);
      };

      webRecorderRef.current = recorder;
      recorder.start(100);

      timerRef.current = setInterval(() => {
        recordingTimeRef.current += 1;
        setRecordingTime((prev) => {
          const next = prev + 1;
          if (next >= 60) {
            webStopRecording();
          }
          return next;
        });
      }, 1000);
    } catch (err) {
      console.error('Error starting web recording:', err);
      setIsRecording(false);
    }
  };

  const webStopRecording = () => {
    if (webRecorderRef.current && webRecorderRef.current.state === 'recording') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      webRecorderRef.current.stop();
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  };

  const webTakePhoto = () => {
    if (!webVideoRef.current || !webCanvasRef.current) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

    const video = webVideoRef.current;
    const canvas = webCanvasRef.current;

    // Crop 9:16 vertical
    const targetRatio = 9 / 16;
    let cropWidth: number;
    let cropHeight: number;

    if (video.videoWidth / video.videoHeight > targetRatio) {
      cropHeight = video.videoHeight;
      cropWidth = Math.round(cropHeight * targetRatio);
    } else {
      cropWidth = video.videoWidth;
      cropHeight = Math.round(cropWidth / targetRatio);
    }

    canvas.width = cropWidth;
    canvas.height = cropHeight;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const offsetX = (video.videoWidth - cropWidth) / 2;
    const offsetY = (video.videoHeight - cropHeight) / 2;

    if (webFacing === 'user') {
      ctx.translate(cropWidth, 0);
      ctx.scale(-1, 1);
    }

    ctx.drawImage(video, offsetX, offsetY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);

    canvas.toBlob(
      (blob) => {
        if (blob) {
          const uri = URL.createObjectURL(blob);
          setCapturedMedia({
            uri,
            type: 'photo',
            width: cropWidth,
            height: cropHeight,
          });
          setEditorVisible(true);
        }
      },
      'image/jpeg',
      0.9
    );
  };

  const webFlipCamera = () => {
    setWebFacing((prev) => (prev === 'environment' ? 'user' : 'environment'));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  // -------------------------------------------------------------------------
  // CAMERA HANDLERS
  // -------------------------------------------------------------------------

  const flipCamera = () => {
    setCameraFacing((prev) => (prev === 'back' ? 'front' : 'back'));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const toggleFlash = () => {
    setFlashMode((prev) => {
      if (prev === 'off') return 'on';
      if (prev === 'on') return 'auto';
      return 'off';
    });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  // -------------------------------------------------------------------------
  // VIDEO RECORDING - Solo disponible en nativo
  // -------------------------------------------------------------------------

  const startRecording = async () => {
    // No disponible en web
    if (isWeb || !cameraRef.current || isRecording) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setIsRecording(true);
    setRecordingTime(0);

    // Capturar Spotify metadata
    if (spotifyConnected && spotifyPremium) {
      try {
        const playbackState = await spotify.getPlaybackState();
        if (playbackState?.isPlaying && playbackState.track) {
          const capturedMetadata = {
            enabled: true,
            trackUri: playbackState.track.uri,
            positionMs: playbackState.track.positionMs || 0,
            trackName: playbackState.track.name,
            artist: playbackState.track.artist,
            albumArt: playbackState.track.albumArt,
            durationMs: playbackState.track.durationMs || 240000,
          };
          setSpotifyMetadata(capturedMetadata);
        }
      } catch (error) {
        console.warn('No se pudo capturar metadata de Spotify:', error);
      }
    }

    // Timer
    recordingTimeRef.current = 0;
    timerRef.current = setInterval(() => {
      recordingTimeRef.current += 1;
      setRecordingTime((prev) => prev + 1);
    }, 1000);

    try {
      const video = await cameraRef.current.recordAsync({
        maxDuration: 60,
      });

      if (timerRef.current) {
        clearInterval(timerRef.current);
      }

      const finalDuration = Math.max(1, recordingTimeRef.current);

      setCapturedMedia({
        uri: video.uri,
        type: 'video',
        duration: finalDuration,
      });
      setEditorVisible(true);
      setIsRecording(false);
    } catch (error) {
      console.error('Error recording:', error);
      setIsRecording(false);
      setSpotifyMetadata(null);
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    }
  };

  const stopRecording = () => {
    if (!isWeb && cameraRef.current && isRecording) {
      cameraRef.current.stopRecording();
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
  };

  // -------------------------------------------------------------------------
  // PHOTO CAPTURE - Solo disponible en nativo
  // -------------------------------------------------------------------------

  const takePhoto = async () => {
    // No disponible en web - usar pickFromGallery
    if (isWeb || !cameraRef.current) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.9,
        skipProcessing: false,
      });

      setCapturedMedia({
        uri: photo.uri,
        type: 'photo',
        width: photo.width,
        height: photo.height,
      });
      setEditorVisible(true);
    } catch (error) {
      console.error('Error taking photo:', error);
    }
  };

  // -------------------------------------------------------------------------
  // PICK FROM GALLERY
  // -------------------------------------------------------------------------

  const pickFromGallery = async (preferredType?: 'video' | 'photo') => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    // En web, podemos filtrar por tipo si se especifica
    let mediaTypes: ('images' | 'videos')[] = ['images', 'videos'];
    if (preferredType === 'video') {
      mediaTypes = ['videos'];
    } else if (preferredType === 'photo') {
      mediaTypes = ['images'];
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes,
      allowsEditing: false,
      quality: 0.9,
      videoMaxDuration: 60,
    });

    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      const isVideo = asset.type === 'video';

      setCapturedMedia({
        uri: asset.uri,
        type: isVideo ? 'video' : 'photo',
        duration: isVideo ? Math.ceil((asset.duration || 0) / 1000) : undefined,
        width: asset.width,
        height: asset.height,
      });
      setEditorVisible(true);
    }
  };

  // Refs para sync con contexto
  const startRecordingRef = useRef<() => void | Promise<void>>(startRecording);
  const stopRecordingRef = useRef<() => void | Promise<void>>(stopRecording);
  const takePhotoRef = useRef<() => void | Promise<void>>(isWeb ? webTakePhoto : takePhoto);

  useEffect(() => {
    startRecordingRef.current = isWeb ? webStartRecording : startRecording;
    stopRecordingRef.current = isWeb ? webStopRecording : stopRecording;
    takePhotoRef.current = isWeb ? webTakePhoto : takePhoto;
  });

  // Registrar handlers en contexto global
  useEffect(() => {
    registerHandlers({
      start: () => startRecordingRef.current(),
      stop: () => stopRecordingRef.current(),
      photo: () => takePhotoRef.current(),
    });
  }, [registerHandlers]);

  // Sync estado con contexto
  useEffect(() => {
    setRecordingState(isRecording, recordingTime);
  }, [isRecording, recordingTime, setRecordingState]);

  useEffect(() => {
    setSpotifyState(!!spotifyMetadata);
  }, [spotifyMetadata, setSpotifyState]);

  useEffect(() => {
    setExerciseState(null);
  }, [setExerciseState]);

  // -------------------------------------------------------------------------
  // EDITOR HANDLERS
  // -------------------------------------------------------------------------

  const discardMedia = () => {
    setCapturedMedia(null);
    setEditorVisible(false);
    setSpotifyMetadata(null);
    clearContext();
    setTimeout(() => setKeepSpotifyPlaying(false), 100);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  // -------------------------------------------------------------------------
  // SAVE HANDLER
  // -------------------------------------------------------------------------

  const handleEditorSave = async (data: {
    mediaType: 'video' | 'photo';
    videoTrimStart: number;
    videoTrimEnd: number;
    spotifyTrack: SpotifyMetadata | null;
    isPublic: boolean;
    weightKg: number | null;
    reps: number | null;
    caption: string | null;
    filter: string;
    showOverlay: boolean;
  }) => {
    console.log('🔥 handleEditorSave called with data:', JSON.stringify(data, null, 2));
    console.log('🔥 capturedMedia:', capturedMedia?.uri?.substring(0, 50));
    console.log('🔥 user:', user?.id);

    if (!canSave('save_video_pro')) {
      console.log('❌ canSave blocked');
      return;
    }
    if (!capturedMedia || !user) {
      console.log('❌ No capturedMedia or user');
      return;
    }

    console.log('✅ Starting save process...');
    setSaving(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      // Subir a Cloudflare Stream (video) o R2 (foto) para generar URL compartible
      if (data.mediaType === 'video') {
        let uploadResult;

        // En web, usar blob + compresión
        if (
          isWeb &&
          (capturedMedia.uri.startsWith('blob:') || capturedMedia.uri.startsWith('data:'))
        ) {
          console.log('🎬 Web: Fetching video blob...');
          const response = await fetch(capturedMedia.uri);
          let blob = await response.blob();
          console.log(`🎬 Original blob: ${Math.round(blob.size / 1024)}KB`);

          // Comprimir si es grande (> 10MB)
          if (blob.size > 10 * 1024 * 1024) {
            console.log('🎬 Compressing video...');
            blob = await compressVideo(blob, 1080, 60);
            console.log(`🎬 Compressed: ${Math.round(blob.size / 1024)}KB`);
          }

          uploadResult = await cloudflareStream.uploadVideoFromBlob(blob, {
            name: `TRENS_${user.id}_${Date.now()}`,
            userId: user.id,
            isPublic: data.isPublic,
          });
        } else {
          // Nativo: usar URI directo
          uploadResult = await cloudflareStream.uploadVideo(capturedMedia.uri, {
            name: `TRENS_${user.id}_${Date.now()}`,
            userId: user.id,
            isPublic: data.isPublic,
          });
        }

        if (!uploadResult.success || !uploadResult.videoId) {
          throw new Error(uploadResult.error || 'Error subiendo video');
        }
      } else {
        // Foto: subir a Cloudflare R2
        console.log('📸 Subiendo foto a Cloudflare R2...');
        const timestamp = Date.now();
        const key = `pro-photos/${user.id}/${timestamp}.jpg`;

        let blob: Blob;

        // En web, el URI puede ser un blob URL o data URL
        if (capturedMedia.uri.startsWith('blob:') || capturedMedia.uri.startsWith('data:')) {
          console.log('📸 Web: Fetching from blob/data URL');
          const response = await fetch(capturedMedia.uri);
          blob = await response.blob();

          // Comprimir imagen en web
          console.log(`📸 Original: ${Math.round(blob.size / 1024)}KB`);
          blob = await compressImage(blob, 1920, 0.85);
          console.log(`📸 Compressed: ${Math.round(blob.size / 1024)}KB`);
        } else {
          // En nativo, usar fetch normal
          console.log('📸 Native: Fetching from file URI');
          const response = await fetch(capturedMedia.uri);
          blob = await response.blob();
        }

        console.log('📸 Blob size:', blob.size, 'type:', blob.type);

        // Subir a R2 usando el método para web (blob)
        const r2Result = await cloudflareR2.uploadFromBlob(blob, key, 'image/jpeg');

        if (!r2Result.success || !r2Result.url) {
          console.error('❌ R2 Upload error:', r2Result.error);
          throw new Error(r2Result.error || 'Error subiendo foto a R2');
        }

        console.log('✅ R2 Upload success:', r2Result.url);
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      // Guardar info para share modal
      setSavedMediaInfo({
        mediaType: data.mediaType,
        isPublic: data.isPublic,
        localUri: capturedMedia.uri,
      });

      setKeepSpotifyPlaying(true);
      discardMedia();

      // Mostrar share modal para compartir en la app de preferencia
      setShowShareModal(true);
    } catch (error) {
      console.error('Error saving:', error);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setSaving(false);
    }
  };

  // -------------------------------------------------------------------------
  // HELPERS
  // -------------------------------------------------------------------------

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const getFlashIcon = () => {
    if (flashMode === 'on') return <Zap color="#FFCC00" size={24} fill="#FFCC00" />;
    if (flashMode === 'auto') return <Zap color="#FFFFFF" size={24} />;
    return <ZapOff color="#FFFFFF" size={24} />;
  };

  const getContextLabel = (): string => {
    return '🔥 PRO';
  };

  // -------------------------------------------------------------------------
  // RENDER - PWA VERSION (Cámara fullscreen inline, idéntica a nativo)
  // -------------------------------------------------------------------------

  if (isWeb) {
    // Pantalla de error de cámara
    if (webCameraError) {
      return (
        <GestureHandlerRootView style={{ flex: 1 }}>
          <View className="flex-1 bg-black items-center justify-center px-6">
            <View
              style={{
                shadowColor: '#F97316',
                shadowOffset: { width: 0, height: 0 },
                shadowOpacity: 0.8,
                shadowRadius: 20,
              }}
            >
              <Lock color="#F97316" size={64} />
            </View>
            <Text
              className="text-fire-orange text-xl font-bold mb-2 text-center mt-4"
              style={{
                textShadowColor: '#F97316',
                textShadowOffset: { width: 0, height: 0 },
                textShadowRadius: 10,
              }}
            >
              🔥 Acceso a Cámara Requerido
            </Text>
            <Text className="text-zinc-400 text-center mb-8">{webCameraError}</Text>
            <TouchableOpacity
              onPress={() => {
                setWebCameraError(null);
                startWebCamera();
              }}
              className="px-8 py-4 rounded-full"
              style={{
                backgroundColor: '#0a0000',
                borderWidth: 2,
                borderColor: '#F97316',
                shadowColor: '#DC2626',
                shadowOffset: { width: 0, height: 0 },
                shadowOpacity: 1,
                shadowRadius: 15,
              }}
            >
              <Text className="text-fire-orange font-bold">PERMITIR ACCESO 🔥</Text>
            </TouchableOpacity>
          </View>
        </GestureHandlerRootView>
      );
    }

    return (
      <GestureHandlerRootView style={{ flex: 1 }}>
        <View className="flex-1 bg-black">
          {/* CAMERA PREVIEW - Fullscreen via getUserMedia */}
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
            {/* @ts-ignore - HTML video element */}
            <video
              ref={(el: any) => {
                webVideoRef.current = el;
                if (el && webStreamRef.current) {
                  if (!el.srcObject) {
                    el.srcObject = webStreamRef.current;
                  }
                  el.play().catch(() => {});
                }
              }}
              autoPlay
              playsInline
              muted
              onLoadedMetadata={(e: any) => {
                const vid = e.target as HTMLVideoElement;
                vid.play().catch(() => {});
                setWebCameraReady(true);
              }}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                transform: webFacing === 'user' ? 'scaleX(-1)' : 'none',
                backgroundColor: '#000',
              }}
            />

            {/* Loading overlay */}
            {!webCameraReady && (
              <View
                className="absolute inset-0 justify-center items-center"
                style={{ backgroundColor: 'rgba(0,0,0,0.8)' }}
              >
                <ActivityIndicator size="large" color="#F97316" />
                <Text className="text-zinc-400 mt-4">Iniciando cámara...</Text>
              </View>
            )}
          </View>

          {/* Hidden canvas for photo capture */}
          {/* @ts-ignore */}
          <canvas
            ref={(el: any) => {
              webCanvasRef.current = el;
            }}
            style={{ display: 'none' }}
          />

          {/* HUD SUPERIOR */}
          <LinearGradient
            colors={['rgba(10,0,0,0.85)', 'transparent']}
            className="absolute top-0 left-0 right-0 h-28"
          />
          <View className="absolute top-14 left-0 right-0 px-4 flex-row justify-between items-center z-10">
            {/* Etiqueta de Contexto */}
            <View
              className="flex-row items-center px-3 py-1.5 rounded-full"
              style={{
                backgroundColor: 'rgba(10, 0, 0, 0.8)',
                borderWidth: 1,
                borderColor: '#F97316',
              }}
            >
              <Animated.View style={pulseAnimatedStyle}>
                <View
                  className="w-3 h-3 bg-fire-orange rounded-full mr-2"
                  style={{
                    shadowColor: '#F97316',
                    shadowOffset: { width: 0, height: 0 },
                    shadowOpacity: 1,
                    shadowRadius: 8,
                  }}
                />
              </Animated.View>
              <Text className="text-fire-orange font-bold text-sm tracking-wide">
                {getContextLabel()}
              </Text>
            </View>
          </View>

          {/* CONTADOR TIEMPO (Solo grabando) */}
          {isRecording && (
            <View className="absolute top-32 left-0 right-0 items-center z-10">
              <View
                className="px-5 py-2 rounded-full"
                style={{
                  backgroundColor: 'rgba(10, 0, 0, 0.85)',
                  borderWidth: 2,
                  borderColor: '#DC2626',
                  shadowColor: '#DC2626',
                  shadowOffset: { width: 0, height: 0 },
                  shadowOpacity: 1,
                  shadowRadius: 15,
                }}
              >
                <Text className="text-fire-orange font-mono font-bold text-lg">
                  🔥 {formatTime(recordingTime)}
                </Text>
              </View>
            </View>
          )}

          {/* SPOTIFY INDICATOR */}
          {spotifyMetadata && (
            <View className={`absolute ${isRecording ? 'top-44' : 'top-28'} left-4 right-4 z-10`}>
              <View
                className="rounded-xl p-3 flex-row items-center"
                style={{
                  backgroundColor: 'rgba(10, 0, 0, 0.85)',
                  borderWidth: 1,
                  borderColor: '#1DB954',
                }}
              >
                <View className="w-10 h-10 bg-green-500 rounded-lg items-center justify-center mr-3">
                  <Music color="#000" size={20} />
                </View>
                <View className="flex-1">
                  <Text className="text-white font-bold text-sm" numberOfLines={1}>
                    {spotifyMetadata.trackName}
                  </Text>
                  <Text className="text-zinc-400 text-xs" numberOfLines={1}>
                    {spotifyMetadata.artist}
                  </Text>
                </View>
                <View
                  className="px-2 py-1 rounded"
                  style={{
                    backgroundColor: isRecording
                      ? 'rgba(30, 215, 96, 0.2)'
                      : 'rgba(30, 215, 96, 0.1)',
                    borderWidth: 1,
                    borderColor: '#1DB954',
                  }}
                >
                  <Text className="text-green-500 text-xs font-bold">
                    {isRecording ? 'SYNC' : '🎵 DETECTADO'}
                  </Text>
                </View>
              </View>
            </View>
          )}

          {/* BOTTOM CONTROLS - Solo galería, grabación controlada desde tab bar */}
          <LinearGradient
            colors={['transparent', 'rgba(10,0,0,0.9)']}
            className="absolute bottom-0 left-0 right-0 h-32"
          />

          <View className="absolute bottom-8 left-6">
            <TouchableOpacity
              onPress={() => pickFromGallery()}
              className="w-14 h-14 rounded-2xl items-center justify-center"
              style={{
                backgroundColor: 'rgba(10, 0, 0, 0.8)',
                borderWidth: 1,
                borderColor: '#71717A',
              }}
            >
              <ImageIcon color="#A1A1AA" size={24} />
            </TouchableOpacity>
          </View>

          <View className="absolute bottom-8 right-6">
            <TouchableOpacity
              onPress={webFlipCamera}
              className="w-14 h-14 rounded-2xl items-center justify-center"
              style={{
                backgroundColor: 'rgba(10, 0, 0, 0.8)',
                borderWidth: 1,
                borderColor: '#71717A',
              }}
            >
              <RotateCcw color="#A1A1AA" size={24} />
            </TouchableOpacity>
          </View>

          {/* PRO MEDIA EDITOR */}
          <ProMediaEditor
            visible={editorVisible}
            mediaData={capturedMedia}
            spotifyMetadata={spotifyMetadata}
            spotifyConnected={spotifyConnected}
            exerciseName={(proContext as any).type === 'tactical' ? (proContext as any).exerciseName : null}
            isTactical={(proContext as any).type === 'tactical'}
            onClose={discardMedia}
            onSave={handleEditorSave}
            saving={saving}
            keepSpotifyPlaying={keepSpotifyPlaying}
          />

          {/* PRO Upgrade Modal */}
          <ProUpgradeModal
            visible={showUpgradeModal}
            onClose={() => setShowUpgradeModal(false)}
            feature="camera"
          />

          {/* SHARE SUCCESS MODAL */}
          <ShareSuccessModal
            visible={showShareModal}
            onClose={() => {
              setShowShareModal(false);
              setSavedMediaInfo(null);
            }}
            mediaType={savedMediaInfo?.mediaType || 'video'}
            isPublic={savedMediaInfo?.isPublic || false}
          />
        </View>
      </GestureHandlerRootView>
    );
  }

  // -------------------------------------------------------------------------
  // RENDER - NATIVE VERSION (Cámara completa)
  // -------------------------------------------------------------------------

  if (!permission) {
    return (
      <View className="flex-1 bg-black items-center justify-center">
        <ActivityIndicator size="large" color="#F97316" />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View className="flex-1 bg-black items-center justify-center px-6">
        <View
          style={{
            shadowColor: '#F97316',
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: 0.8,
            shadowRadius: 20,
          }}
        >
          <Lock color="#F97316" size={64} />
        </View>
        <Text
          className="text-fire-orange text-xl font-bold mb-2 text-center mt-4"
          style={{
            textShadowColor: '#F97316',
            textShadowOffset: { width: 0, height: 0 },
            textShadowRadius: 10,
          }}
        >
          🔥 Acceso a Cámara Requerido
        </Text>
        <Text className="text-zinc-400 text-center mb-8">
          PRO necesita acceso a tu cámara para grabar tus entrenamientos
        </Text>
        <TouchableOpacity
          onPress={requestPermission}
          className="px-8 py-4 rounded-full"
          style={{
            backgroundColor: '#0a0000',
            borderWidth: 2,
            borderColor: '#F97316',
            shadowColor: '#DC2626',
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: 1,
            shadowRadius: 15,
          }}
        >
          <Text className="text-fire-orange font-bold">PERMITIR ACCESO 🔥</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <View className="flex-1 bg-black">
        {/* CameraView SIEMPRE VISIBLE - Solo nativo */}
        {CameraView && (
          <CameraView
            ref={cameraRef}
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
            facing={cameraFacing}
            mode="video"
            flash={flashMode}
          />
        )}

        {/* HUD SUPERIOR */}
        <LinearGradient
          colors={['rgba(10,0,0,0.85)', 'transparent']}
          className="absolute top-0 left-0 right-0 h-28"
        />
        <View className="absolute top-14 left-0 right-0 px-4 flex-row justify-between items-center z-10">
          {/* Etiqueta de Contexto */}
          <View
            className="flex-row items-center px-3 py-1.5 rounded-full"
            style={{
              backgroundColor: 'rgba(10, 0, 0, 0.8)',
              borderWidth: 1,
              borderColor: '#F97316',
            }}
          >
            <Animated.View style={pulseAnimatedStyle}>
              <View
                className="w-3 h-3 bg-fire-orange rounded-full mr-2"
                style={{
                  shadowColor: '#F97316',
                  shadowOffset: { width: 0, height: 0 },
                  shadowOpacity: 1,
                  shadowRadius: 8,
                }}
              />
            </Animated.View>
            <Text className="text-fire-orange font-bold text-sm tracking-wide">
              {getContextLabel()}
            </Text>
          </View>

          {/* Herramientas Rápidas */}
          <View className="flex-row items-center gap-4">
            <TouchableOpacity
              onPress={toggleFlash}
              className="p-2 rounded-full"
              style={{
                backgroundColor: 'rgba(10, 0, 0, 0.8)',
                borderWidth: 1,
                borderColor: flashMode === 'on' ? '#FBBF24' : '#F97316',
              }}
            >
              {getFlashIcon()}
            </TouchableOpacity>
          </View>
        </View>

        {/* CONTADOR TIEMPO (Solo grabando) */}
        {isRecording && (
          <View className="absolute top-32 left-0 right-0 items-center z-10">
            <View
              className="px-5 py-2 rounded-full"
              style={{
                backgroundColor: 'rgba(10, 0, 0, 0.85)',
                borderWidth: 2,
                borderColor: '#DC2626',
                shadowColor: '#DC2626',
                shadowOffset: { width: 0, height: 0 },
                shadowOpacity: 1,
                shadowRadius: 15,
              }}
            >
              <Text className="text-fire-orange font-mono font-bold text-lg">
                🔥 {formatTime(recordingTime)}
              </Text>
            </View>
          </View>
        )}

        {/* SPOTIFY INDICATOR */}
        {spotifyMetadata && (
          <View className={`absolute ${isRecording ? 'top-44' : 'top-28'} left-4 right-4 z-10`}>
            <View
              className="rounded-xl p-3 flex-row items-center"
              style={{
                backgroundColor: 'rgba(10, 0, 0, 0.85)',
                borderWidth: 1,
                borderColor: '#1DB954',
              }}
            >
              <View className="w-10 h-10 bg-green-500 rounded-lg items-center justify-center mr-3">
                <Music color="#000" size={20} />
              </View>
              <View className="flex-1">
                <Text className="text-white font-bold text-sm" numberOfLines={1}>
                  {spotifyMetadata.trackName}
                </Text>
                <Text className="text-zinc-400 text-xs" numberOfLines={1}>
                  {spotifyMetadata.artist}
                </Text>
              </View>
              <View
                className="px-2 py-1 rounded"
                style={{
                  backgroundColor: isRecording
                    ? 'rgba(30, 215, 96, 0.2)'
                    : 'rgba(30, 215, 96, 0.1)',
                  borderWidth: 1,
                  borderColor: '#1DB954',
                }}
              >
                <Text className="text-green-500 text-xs font-bold">
                  {isRecording ? 'SYNC' : '🎵 DETECTADO'}
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* BOTTOM CONTROLS - Solo galería, grabación controlada desde tab bar */}
        <LinearGradient
          colors={['transparent', 'rgba(10,0,0,0.9)']}
          className="absolute bottom-0 left-0 right-0 h-32"
        />

        <View className="absolute bottom-8 left-6">
          <TouchableOpacity
            onPress={() => pickFromGallery()}
            className="w-14 h-14 rounded-2xl items-center justify-center"
            style={{
              backgroundColor: 'rgba(10, 0, 0, 0.8)',
              borderWidth: 1,
              borderColor: '#71717A',
            }}
          >
            <ImageIcon color="#A1A1AA" size={24} />
          </TouchableOpacity>
        </View>

        <View className="absolute bottom-8 right-6">
          <TouchableOpacity
            onPress={flipCamera}
            className="w-14 h-14 rounded-2xl items-center justify-center"
            style={{
              backgroundColor: 'rgba(10, 0, 0, 0.8)',
              borderWidth: 1,
              borderColor: '#71717A',
            }}
          >
            <RotateCcw color="#A1A1AA" size={24} />
          </TouchableOpacity>
        </View>

        {/* PRO MEDIA EDITOR */}
        <ProMediaEditor
          visible={editorVisible}
          mediaData={capturedMedia}
          spotifyMetadata={spotifyMetadata}
          spotifyConnected={spotifyConnected}
          exerciseName={(proContext as any).type === 'tactical' ? (proContext as any).exerciseName : null}
          isTactical={(proContext as any).type === 'tactical'}
          onClose={discardMedia}
          onSave={handleEditorSave}
          saving={saving}
          keepSpotifyPlaying={keepSpotifyPlaying}
        />

        {/* PRO Upgrade Modal */}
        <ProUpgradeModal
          visible={showUpgradeModal}
          onClose={() => setShowUpgradeModal(false)}
          feature="camera"
        />

        {/* SHARE SUCCESS MODAL */}
        <ShareSuccessModal
          visible={showShareModal}
          onClose={() => {
            setShowShareModal(false);
            setSavedMediaInfo(null);
          }}
          mediaType={savedMediaInfo?.mediaType || 'video'}
          isPublic={savedMediaInfo?.isPublic || false}
        />
      </View>
    </GestureHandlerRootView>
  );
}

export default function ProScreen() {
  return (
    <PWAGuard moduleName="PRO">
      <ProScreenContent />
    </PWAGuard>
  );
}
