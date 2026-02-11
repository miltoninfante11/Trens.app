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
  Upload,
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
import { supabase } from '../../../lib/supabase';
import { useUserRoleContext } from '../../../context/UserRoleContext';
import { useProContext } from '../../../context/ProContext';
import { useProRecording } from '../../../context/ProRecordingContext';
import { useHank } from '../../../context/HankContext';
import { useSaveGuard } from '../../_layout';
import { ProUpgradeModal } from '../../../components/pro/ProUpgradeModal';
import { ProMediaEditor, MediaData, SpotifyMetadata } from '../../../components/pro/ProMediaEditor';
import { PRNotificationModal } from '../../../components/pro/PRNotificationModal';
import { ShareSuccessModal } from '../../../components/pro/ShareSuccessModal';
import { FilterType } from '../../../components/pro/filters';
import spotify from '../../../services/spotify/spotify';
import cloudflareStream from '../../../services/cloudflare/stream';
import cloudflareR2 from '../../../services/cloudflare/r2';
import { detectRecordsForNewVideo } from '../../../services/records/recordDetection';
import type { RecordDetectionResult } from '../../../types/records';

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
    exerciseName?: string | null;
    weight?: number | null;
    reps?: number | null;
    isPublic: boolean;
    videoId?: string;
  } | null>(null);

  // PR Notification State
  const [prResult, setPrResult] = useState<RecordDetectionResult | null>(null);
  const [showPRModal, setShowPRModal] = useState(false);

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
  const startRecordingRef = useRef(startRecording);
  const stopRecordingRef = useRef(stopRecording);

  useEffect(() => {
    startRecordingRef.current = startRecording;
    stopRecordingRef.current = stopRecording;
  });

  // Registrar handlers en contexto global
  useEffect(() => {
    registerHandlers({
      start: () => startRecordingRef.current(),
      stop: () => stopRecordingRef.current(),
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
    const name = proContext.type === 'tactical' ? proContext.exerciseName || null : null;
    setExerciseState(name);
  }, [proContext, setExerciseState]);

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
    filter: FilterType;
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
      let videoUrl = '';
      let thumbnailUrl = '';
      let cloudflareVideoId = '';

      // Subir a Cloudflare Stream (video) o Storage (foto)
      if (data.mediaType === 'video') {
        const uploadResult = await cloudflareStream.uploadVideo(capturedMedia.uri, {
          name: `TRENS_${user.id}_${Date.now()}`,
          exerciseName: proContext.type === 'tactical' ? proContext.exerciseName : undefined,
          userId: user.id,
          isPublic: data.isPublic,
        });

        if (!uploadResult.success || !uploadResult.videoId) {
          throw new Error(uploadResult.error || 'Error subiendo video');
        }

        const playbackUrls = cloudflareStream.getPlaybackUrls(uploadResult.videoId);
        videoUrl = playbackUrls.hls;
        thumbnailUrl = playbackUrls.thumbnail;
        cloudflareVideoId = uploadResult.videoId;
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

        videoUrl = r2Result.url;
        thumbnailUrl = r2Result.url;
        console.log('📸 Public URL:', videoUrl);
      }

      // Guardar en tabla pro_videos
      const { data: insertedData, error: insertError } = await supabase
        .from('pro_videos')
        .insert({
          user_id: user.id,
          video_url: videoUrl,
          thumbnail_url: thumbnailUrl,
          cloudflare_video_id: cloudflareVideoId || null,
          duration_seconds:
            data.mediaType === 'video' ? Math.round(capturedMedia.duration || 0) : 0,
          media_type: data.mediaType,
          context_type: proContext.type,
          exercise_id: proContext.type === 'tactical' ? proContext.exerciseId : null,
          exercise_name: proContext.type === 'tactical' ? proContext.exerciseName : null,
          exercise_notes: proContext.type === 'tactical' ? proContext.exerciseNotes : null,
          tags: proContext.type === 'tactical' ? proContext.exerciseTags : null,
          weight_kg: data.weightKg,
          reps: data.reps,
          free_text: data.caption,
          spotify: data.spotifyTrack
            ? {
                enabled: true,
                trackUri: data.spotifyTrack.trackUri,
                positionMs: data.spotifyTrack.positionMs,
                trackName: data.spotifyTrack.trackName,
                artist: data.spotifyTrack.artist,
              }
            : { enabled: false },
          ambient_audio: true,
          is_public: data.isPublic,
          trim_start_percent: Math.round(data.videoTrimStart),
          trim_end_percent: Math.round(data.videoTrimEnd),
          filter: data.filter,
          show_overlay: data.showOverlay,
        })
        .select()
        .single();

      if (insertError) throw insertError;

      // Detectar PRs (solo video táctico con peso y reps)
      if (
        data.mediaType === 'video' &&
        proContext.type === 'tactical' &&
        proContext.exerciseId &&
        proContext.exerciseName &&
        data.weightKg &&
        data.reps
      ) {
        try {
          const recordResult = await detectRecordsForNewVideo(
            user.id,
            proContext.exerciseId,
            proContext.exerciseName,
            data.weightKg,
            data.reps
          );

          if (recordResult.hasRecord) {
            setPrResult(recordResult);
            setShowPRModal(true);
          }
        } catch (prError) {
          console.warn('Error detectando PRs:', prError);
        }
      }

      triggerRefresh();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      // Guardar info para share modal
      setSavedMediaInfo({
        mediaType: data.mediaType,
        exerciseName: proContext.type === 'tactical' ? proContext.exerciseName : null,
        weight: data.weightKg,
        reps: data.reps,
        isPublic: data.isPublic,
        videoId: insertedData?.id,
      });

      setKeepSpotifyPlaying(true);
      discardMedia();

      // Mostrar share modal
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
    if (proContext.type === 'tactical' && proContext.exerciseName) {
      return `🔥 ${proContext.exerciseName.toUpperCase()}`;
    }
    return '🔥 CÁMARA LIBRE';
  };

  // -------------------------------------------------------------------------
  // RENDER - PWA VERSION (Solo galería, sin cámara)
  // -------------------------------------------------------------------------

  if (isWeb) {
    return (
      <GestureHandlerRootView style={{ flex: 1 }}>
        <View className="flex-1 bg-black">
          {/* Background gradient */}
          <LinearGradient colors={['#0a0000', '#000000', '#0a0000']} className="absolute inset-0" />

          {/* Header */}
          <View className="pt-14 px-6 pb-4">
            <View
              className="flex-row items-center px-4 py-2 rounded-full self-start"
              style={{
                backgroundColor: 'rgba(10, 0, 0, 0.8)',
                borderWidth: 1,
                borderColor: '#F97316',
              }}
            >
              <View
                className="w-3 h-3 bg-fire-orange rounded-full mr-2"
                style={{
                  shadowColor: '#F97316',
                  shadowOffset: { width: 0, height: 0 },
                  shadowOpacity: 1,
                  shadowRadius: 8,
                }}
              />
              <Text className="text-fire-orange font-bold text-sm tracking-wide">
                {getContextLabel()}
              </Text>
            </View>
          </View>

          {/* Spotify Indicator (if playing) */}
          {spotifyMetadata && (
            <View className="px-6 mb-4">
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
                    backgroundColor: 'rgba(30, 215, 96, 0.1)',
                    borderWidth: 1,
                    borderColor: '#1DB954',
                  }}
                >
                  <Text className="text-green-500 text-xs font-bold">🎵 DETECTADO</Text>
                </View>
              </View>
            </View>
          )}

          {/* Main Content - Upload Area */}
          <View className="flex-1 px-6 justify-center items-center">
            <View
              className="w-full aspect-[9/16] max-h-[60vh] rounded-3xl items-center justify-center"
              style={{
                backgroundColor: 'rgba(10, 0, 0, 0.5)',
                borderWidth: 2,
                borderColor: '#27272A',
                borderStyle: 'dashed',
              }}
            >
              <View
                style={{
                  shadowColor: '#F97316',
                  shadowOffset: { width: 0, height: 0 },
                  shadowOpacity: 0.5,
                  shadowRadius: 30,
                }}
              >
                <Upload color="#F97316" size={64} strokeWidth={1.5} />
              </View>

              <Text
                className="text-fire-orange text-xl font-bold mt-6 text-center"
                style={{
                  textShadowColor: '#F97316',
                  textShadowOffset: { width: 0, height: 0 },
                  textShadowRadius: 10,
                }}
              >
                SUBE TU CONTENIDO
              </Text>

              <Text className="text-zinc-500 text-center mt-2 px-8">
                Selecciona un video o foto de tu galería
              </Text>

              {/* Action Buttons */}
              <View className="flex-row gap-4 mt-8">
                {/* Video Button */}
                <TouchableOpacity
                  onPress={() => pickFromGallery('video')}
                  className="px-6 py-4 rounded-2xl flex-row items-center"
                  style={{
                    backgroundColor: 'rgba(10, 0, 0, 0.8)',
                    borderWidth: 2,
                    borderColor: '#F97316',
                    shadowColor: '#F97316',
                    shadowOffset: { width: 0, height: 0 },
                    shadowOpacity: 0.5,
                    shadowRadius: 15,
                  }}
                >
                  <Camera color="#F97316" size={24} />
                  <Text className="text-fire-orange font-bold ml-2">VIDEO</Text>
                </TouchableOpacity>

                {/* Photo Button */}
                <TouchableOpacity
                  onPress={() => pickFromGallery('photo')}
                  className="px-6 py-4 rounded-2xl flex-row items-center"
                  style={{
                    backgroundColor: 'rgba(10, 0, 0, 0.8)',
                    borderWidth: 2,
                    borderColor: '#F97316',
                    shadowColor: '#F97316',
                    shadowOffset: { width: 0, height: 0 },
                    shadowOpacity: 0.5,
                    shadowRadius: 15,
                  }}
                >
                  <ImageIcon color="#F97316" size={24} />
                  <Text className="text-fire-orange font-bold ml-2">FOTO</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Info Text */}
            <Text className="text-zinc-600 text-xs text-center mt-6 px-4">
              💡 Para grabar directamente, usa la app nativa en tu móvil
            </Text>
          </View>

          {/* PRO MEDIA EDITOR */}
          <ProMediaEditor
            visible={editorVisible}
            mediaData={capturedMedia}
            spotifyMetadata={spotifyMetadata}
            spotifyConnected={spotifyConnected}
            exerciseName={proContext.type === 'tactical' ? proContext.exerciseName : null}
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

          {/* PR NOTIFICATION MODAL */}
          <PRNotificationModal
            visible={showPRModal}
            result={prResult}
            onClose={() => {
              setShowPRModal(false);
              setPrResult(null);
            }}
          />

          {/* SHARE SUCCESS MODAL */}
          <ShareSuccessModal
            visible={showShareModal}
            onClose={() => {
              setShowShareModal(false);
              setSavedMediaInfo(null);
            }}
            mediaType={savedMediaInfo?.mediaType || 'video'}
            exerciseName={savedMediaInfo?.exerciseName}
            weight={savedMediaInfo?.weight}
            reps={savedMediaInfo?.reps}
            isPublic={savedMediaInfo?.isPublic || false}
            videoId={savedMediaInfo?.videoId}
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
            <TouchableOpacity
              onPress={flipCamera}
              className="p-2 rounded-full"
              style={{
                backgroundColor: 'rgba(10, 0, 0, 0.8)',
                borderWidth: 1,
                borderColor: '#F97316',
              }}
            >
              <RotateCcw color="#F97316" size={24} />
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

        {/* BOTTOM CONTROLS */}
        <LinearGradient
          colors={['transparent', 'rgba(10,0,0,0.9)']}
          className="absolute bottom-0 left-0 right-0 h-48"
        />

        <View className="absolute bottom-8 left-0 right-0 px-6">
          {/* Control Buttons Row */}
          <View className="flex-row items-center justify-center gap-8">
            {/* Gallery Button */}
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

            {/* Main Shutter Button */}
            <Animated.View style={shutterAnimatedStyle}>
              <TouchableOpacity
                onPress={isRecording ? stopRecording : startRecording}
                onLongPress={takePhoto}
                delayLongPress={500}
                className="w-20 h-20 rounded-full items-center justify-center"
                style={{
                  backgroundColor: isRecording ? '#DC2626' : 'rgba(10, 0, 0, 0.8)',
                  borderWidth: 4,
                  borderColor: isRecording ? '#FCA5A5' : '#F97316',
                  shadowColor: isRecording ? '#DC2626' : '#F97316',
                  shadowOffset: { width: 0, height: 0 },
                  shadowOpacity: 1,
                  shadowRadius: 20,
                }}
              >
                {isRecording ? (
                  <View className="w-8 h-8 bg-white rounded-md" />
                ) : (
                  <Camera color="#F97316" size={32} />
                )}
              </TouchableOpacity>
            </Animated.View>

            {/* Photo Button */}
            <TouchableOpacity
              onPress={takePhoto}
              className="w-14 h-14 rounded-2xl items-center justify-center"
              style={{
                backgroundColor: 'rgba(10, 0, 0, 0.8)',
                borderWidth: 1,
                borderColor: '#F97316',
              }}
            >
              <Camera color="#F97316" size={24} />
            </TouchableOpacity>
          </View>

          {/* Hint Text */}
          <Text className="text-zinc-500 text-xs text-center mt-4">
            Tap para video • Mantén para foto • Izquierda para galería
          </Text>
        </View>

        {/* PRO MEDIA EDITOR */}
        <ProMediaEditor
          visible={editorVisible}
          mediaData={capturedMedia}
          spotifyMetadata={spotifyMetadata}
          spotifyConnected={spotifyConnected}
          exerciseName={proContext.type === 'tactical' ? proContext.exerciseName : null}
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

        {/* PR NOTIFICATION MODAL */}
        <PRNotificationModal
          visible={showPRModal}
          result={prResult}
          onClose={() => {
            setShowPRModal(false);
            setPrResult(null);
          }}
        />

        {/* SHARE SUCCESS MODAL */}
        <ShareSuccessModal
          visible={showShareModal}
          onClose={() => {
            setShowShareModal(false);
            setSavedMediaInfo(null);
          }}
          mediaType={savedMediaInfo?.mediaType || 'video'}
          exerciseName={savedMediaInfo?.exerciseName}
          weight={savedMediaInfo?.weight}
          reps={savedMediaInfo?.reps}
          isPublic={savedMediaInfo?.isPublic || false}
          videoId={savedMediaInfo?.videoId}
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
