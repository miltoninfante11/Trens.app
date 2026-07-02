// =============================================================================
// PRO SCREEN - Cámara PRO con Video + Foto
// Incluye: Filtros, Spotify sync, Overlay de datos, Compartir a redes
// Formato: 9:16 (vertical)
// Compatibilidad: Nativo (cámara completa) + PWA (solo galería)
// =============================================================================

import { View, Text, TouchableOpacity, ActivityIndicator, Platform, Modal } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import {
  RotateCcw,
  Zap,
  ZapOff,
  Lock,
  Camera,
  Image as ImageIcon,
  LogIn,
  Share2,
  Film,
} from 'lucide-react-native';
import { PWAGuard } from '../../../components/auth/PWAGuard';
import * as Haptics from '../../../lib/haptics';
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
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

import spotify from '../../../services/spotify/spotify';
import cloudflareStream from '../../../services/cloudflare/stream';
import cloudflareR2 from '../../../services/cloudflare/r2';
import { ProBrandOverlay } from '../../../components/pro/ProBrandOverlay';
import { supabase } from '../../../lib/supabase';

// ============================================================================
// MAIN COMPONENT
// ============================================================================

function ProScreenContent() {
  const { user, isPro, spotifyPremium, spotifyConnected, isAuthenticated } = useUserRoleContext();
  const { context: proContext, clearContext } = useProContext();
  const { registerHandlers, setRecordingState, setSpotifyState, setExerciseState } =
    useProRecording();
  const { triggerRefresh, setScreenContext } = useHank();
  const { canSave } = useSaveGuard();
  const router = useRouter();

  // Modal invitado (al intentar compartir sin sesión)
  const [showGuestShareModal, setShowGuestShareModal] = useState(false);

  // ÉLITE status
  const [isElite, setIsElite] = useState(false);

  useEffect(() => {
    if (user) {
      supabase
        .from('user_profiles')
        .select('is_elite')
        .eq('user_id', user.id)
        .maybeSingle()
        .then(({ data }) => {
          if (data?.is_elite) setIsElite(true);
        });
    }
  }, [user]);

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

  // Audio Setup - No interrumpir música al entrar, solo configurar para mix
  useEffect(() => {
    const setupAudio = async () => {
      try {
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: false,
          playsInSilentModeIOS: true,
          staysActiveInBackground: false,
          interruptionModeIOS: 1, // MixWithOthers - no para la música
          shouldDuckAndroid: true,
          interruptionModeAndroid: 1, // DuckOthers
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
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: { ideal: 30 },
        },
        audio: false,
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
    if (webAudioStreamRef.current) {
      webAudioStreamRef.current.getTracks().forEach((track) => track.stop());
      webAudioStreamRef.current = null;
    }
    if (webStreamRef.current) {
      webStreamRef.current.getTracks().forEach((track) => track.stop());
      webStreamRef.current = null;
    }
    if (webVideoRef.current) {
      webVideoRef.current.srcObject = null;
    }
    setWebCameraReady(false);
  }, []);

  // Auto-start web camera on focus, cleanup on blur
  useFocusEffect(
    useCallback(() => {
      if (!isWeb) return;
      const timer = setTimeout(() => startWebCamera(), 300);
      return () => {
        clearTimeout(timer);
        cleanupWebCamera();
      };
    }, [startWebCamera, cleanupWebCamera])
  );

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

  const webAudioStreamRef = useRef<MediaStream | null>(null);

  const webStartRecording = async () => {
    if (!webStreamRef.current || isRecording) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    webChunksRef.current = [];
    setIsRecording(true);
    setRecordingTime(0);
    recordingTimeRef.current = 0;

    // No pedimos audio del micrófono para no interrumpir la música
    // El video se graba sin audio del mic — la música de Spotify se captura como metadata

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
        'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
        'video/mp4;codecs=avc1',
        'video/mp4',
        'video/webm;codecs=vp9,opus',
        'video/webm;codecs=vp9',
        'video/webm;codecs=vp8',
        'video/webm',
      ];
      const selectedMimeType =
        mimeTypes.find((t) => MediaRecorder.isTypeSupported(t)) || 'video/webm';

      const recorder = new MediaRecorder(webStreamRef.current, {
        mimeType: selectedMimeType,
        videoBitsPerSecond: 16_000_000,
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
          mimeType: selectedMimeType,
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
      'image/png',
      1.0
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
        codec: 'avc1' as any,
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
        quality: 1,
        skipProcessing: true,
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

    try {
      // Pedir permisos en nativo
      if (Platform.OS !== 'web') {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
          console.warn('Gallery permission denied');
          return;
        }
      }

      // Filtrar por tipo si se especifica
      let mediaTypes: ('images' | 'videos')[] = ['images', 'videos'];
      if (preferredType === 'video') {
        mediaTypes = ['videos'];
      } else if (preferredType === 'photo') {
        mediaTypes = ['images'];
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes,
        allowsEditing: false,
        quality: 1,
        videoQuality: ImagePicker.UIImagePickerControllerQualityType.High,
        ...(Platform.OS === 'ios'
          ? { presentationStyle: ImagePicker.UIImagePickerPresentationStyle.FULL_SCREEN }
          : {}),
      });

      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];

        // Detect video robustly: check type, mimeType, and file extension
        const isVideoByType = asset.type === 'video';
        const isVideoByMime = asset.mimeType?.startsWith('video/') ?? false;
        const isVideoByExt = /\.(mp4|mov|avi|webm|mkv|3gp|m4v)$/i.test(asset.uri);
        const isVideo = isVideoByType || isVideoByMime || isVideoByExt;

        // Duration: expo-image-picker returns ms on most platforms
        let durationSec: number | undefined;
        if (isVideo && asset.duration) {
          // expo-image-picker returns duration in ms
          durationSec = Math.ceil(asset.duration / 1000);
          // Sanity: if way too small, it might already be seconds
          if (durationSec === 0 && asset.duration > 0) durationSec = Math.ceil(asset.duration);
        }

        // Determine mimeType reliably
        const mimeType = asset.mimeType || (isVideo ? 'video/mp4' : 'image/jpeg');

        setCapturedMedia({
          uri: asset.uri,
          type: isVideo ? 'video' : 'photo',
          duration: durationSec,
          width: asset.width,
          height: asset.height,
          mimeType,
        });
        setEditorVisible(true);
      }
    } catch (error) {
      console.error('Error picking from gallery:', error);
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
  // SAVE HANDLER — intercepta compartir para invitados sin sesión
  // -------------------------------------------------------------------------

  const handleEditorSave = async () => {
    if (!isAuthenticated) {
      setShowGuestShareModal(true);
      return;
    }
    discardMedia();
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

          {/* Brand Overlay — Pills + TRENS branding */}
          <ProBrandOverlay hideGuides />

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
            exerciseName={
              (proContext as any).type === 'tactical' ? (proContext as any).exerciseName : null
            }
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

          {/* MODAL INVITADO — web version */}
          <Modal
            visible={showGuestShareModal}
            transparent
            animationType="fade"
            onRequestClose={() => setShowGuestShareModal(false)}
          >
            <View className="flex-1 bg-black/80 items-center justify-center px-6">
              <View
                className="w-full rounded-3xl overflow-hidden"
                style={{ backgroundColor: '#111' }}
              >
                <LinearGradient colors={['#1a0a00', '#000']} className="p-6 items-center">
                  <View
                    className="w-16 h-16 rounded-2xl items-center justify-center mb-4"
                    style={{ backgroundColor: '#DC262620', borderWidth: 1, borderColor: '#DC2626' }}
                  >
                    <Share2 size={32} color="#DC2626" />
                  </View>
                  <Text className="text-white text-2xl font-bold mb-1">PRO Share</Text>
                  <Text className="text-zinc-400 text-sm text-center mb-6">
                    Comparte tus clips con overlay de datos, canción de Spotify y marca TRENS a tus
                    redes.
                  </Text>
                  <TouchableOpacity
                    onPress={() => {
                      setShowGuestShareModal(false);
                      router.push('/(auth)/login' as any);
                    }}
                    className="w-full py-4 rounded-2xl items-center mb-3"
                    style={{ backgroundColor: '#DC2626' }}
                  >
                    <View className="flex-row items-center gap-2">
                      <LogIn size={18} color="#fff" />
                      <Text className="text-white font-bold text-base">Iniciar sesión</Text>
                    </View>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setShowGuestShareModal(false)} className="py-3">
                    <Text className="text-zinc-500 text-sm">Seguir explorando</Text>
                  </TouchableOpacity>
                </LinearGradient>
              </View>
            </View>
          </Modal>
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
            pictureSize="max"
            videoQuality="2160p"
          />
        )}

        {/* HUD SUPERIOR */}
        <LinearGradient
          colors={['rgba(10,0,0,0.85)', 'transparent']}
          className="absolute top-0 left-0 right-0 h-28"
        />

        {/* Brand Overlay — TRENS branding */}
        <ProBrandOverlay hideGuides />

        {/* Herramientas Rápidas */}
        <View className="absolute top-14 right-4 z-10">
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
          exerciseName={
            (proContext as any).type === 'tactical' ? (proContext as any).exerciseName : null
          }
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

        {/* MODAL INVITADO — aparece al intentar compartir sin sesión */}
        <Modal
          visible={showGuestShareModal}
          transparent
          animationType="fade"
          onRequestClose={() => setShowGuestShareModal(false)}
        >
          <View className="flex-1 bg-black/80 items-center justify-center px-6">
            <View
              className="w-full rounded-3xl overflow-hidden"
              style={{ backgroundColor: '#111' }}
            >
              <LinearGradient colors={['#1a0a00', '#000']} className="p-6 items-center">
                <View
                  className="w-16 h-16 rounded-2xl items-center justify-center mb-4"
                  style={{ backgroundColor: '#DC262620', borderWidth: 1, borderColor: '#DC2626' }}
                >
                  <Share2 size={32} color="#DC2626" />
                </View>
                <Text className="text-white text-2xl font-bold mb-1">PRO Share</Text>
                <Text className="text-zinc-400 text-sm text-center mb-6">
                  Comparte tus clips con overlay de datos, canción de Spotify y marca TRENS
                  directamente a tus redes sociales.
                </Text>

                <View className="w-full gap-3 mb-6">
                  {[
                    { icon: Film, label: 'Overlay de datos en tiempo real' },
                    { icon: Share2, label: 'Comparte directo a IG, TikTok y más' },
                    { icon: Zap, label: 'Canción de Spotify sincronizada' },
                  ].map(({ icon: Icon, label }) => (
                    <View key={label} className="flex-row items-center gap-3">
                      <View
                        className="w-8 h-8 rounded-xl items-center justify-center"
                        style={{ backgroundColor: '#DC262615' }}
                      >
                        <Icon size={16} color="#DC2626" />
                      </View>
                      <Text className="text-zinc-300 text-sm flex-1">{label}</Text>
                    </View>
                  ))}
                </View>

                <TouchableOpacity
                  onPress={() => {
                    setShowGuestShareModal(false);
                    router.push('/(auth)/login' as any);
                  }}
                  className="w-full py-4 rounded-2xl items-center mb-3"
                  style={{ backgroundColor: '#DC2626' }}
                >
                  <View className="flex-row items-center gap-2">
                    <LogIn size={18} color="#fff" />
                    <Text className="text-white font-bold text-base">Iniciar sesión</Text>
                  </View>
                </TouchableOpacity>

                <TouchableOpacity onPress={() => setShowGuestShareModal(false)} className="py-3">
                  <Text className="text-zinc-500 text-sm">Seguir explorando</Text>
                </TouchableOpacity>
              </LinearGradient>
            </View>
          </View>
        </Modal>
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
