import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Pressable,
  Image,
  RefreshControl,
  ActivityIndicator,
  Modal,
  Dimensions,
  Share,
} from 'react-native';
import { PWAGuard } from '../../../components/auth/PWAGuard';
import { Alert } from '../../../lib/alert';
import { router, useFocusEffect } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Grid,
  Lock,
  Plus,
  Play,
  Eye,
  EyeOff,
  X,
  Music,
  Trash2,
  Share2,
  MoreVertical,
  Volume2,
  Trophy,
  ImageIcon,
  Pencil,
  Crown,
  BadgeCheck,
} from 'lucide-react-native';
import * as Haptics from '../../../lib/haptics';

import { VideoView, useVideoPlayer } from 'expo-video';
import { supabase } from '../../../lib/supabase';
import cloudflareStream from '../../../services/cloudflare/stream';

import { useUserRoleContext } from '../../../context/UserRoleContext';
import { useHank } from '../../../context/HankContext';
import { useSaveGuard } from '../../_layout';
import spotify from '../../../services/spotify/spotify';
import TrensID from '../../../components/adn/TrensID';
import RecordCard from '../../../components/adn/RecordCard';
import InstagramConnectButton from '../../../components/adn/InstagramConnectButton';
import SelectRecordVideoModal from '../../../components/adn/SelectRecordVideoModal';
import { GuestModuleLanding } from '../../../components/auth/GuestModuleLanding';
import { SportBadges } from '../../../components/adn/SportBadges';
import { TodayCards } from '../../../components/adn/TodayCards';
import { ProUpgradeModal } from '../../../components/pro/ProUpgradeModal';
import { ShareModal } from '../../../components/share/ShareModal';
import AccountModal from '../../../components/account/AccountModal';
import { SavageBackground } from '../../../components/ui/SavageBackground';
import { calculateUserDailyMacros } from '../../../services/hank/nutrition';

// ============================================================================
// TIPOS
// ============================================================================
interface UserProfile {
  id: string;
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  height: string;
  weight: string;
  goal: string;
  injuries: string;
  allergies: string;
  // Campos de ultra personalización
  age?: number;
  sex?: string;
  body_fat_percentage?: number;
  muscle_mass?: number;
  activity_level?: string;
  training_experience?: string;
  metabolic_rate?: string;
  training_days_per_week?: number;
  is_elite?: boolean;
  // Campos CALCULADOS (vienen de GYM y PLAN)
  training_frequency?: number;
  meal_count?: number;
  // Macros diarios cacheados (objetivo/target)
  cached_daily_macros?: {
    totalCalories: number;
    totalProtein: number;
    totalCarbs: number;
    totalFat: number;
    perMeal: {
      calories: number;
      protein: number;
      carbs: number;
      fat: number;
    };
  } | null;
  // Macros reales computados desde ingredientes del plan
  actual_daily_macros?: {
    totalCalories: number;
    totalProtein: number;
    totalCarbs: number;
    totalFat: number;
  } | null;
}

interface Measurement {
  id: string;
  name: string;
  value: string;
  is_dominant: boolean;
}

interface PersonalRecord {
  id: string;
  exercise_name: string;
  weight_kg: number;
  reps: number;
  video_id?: string;
  achieved_at?: string;
}

interface Video {
  id: string;
  title: string;
  thumbnail_url: string;
  video_url?: string;
  cloudflare_video_id?: string;
  is_public: boolean;
  views?: number;
  created_at: string;
  source: 'asset' | 'pro';
  media_type?: 'video' | 'photo';
  exercise_name?: string;
  weight_kg?: number;
  reps?: number;
  free_text?: string;
  spotify?: {
    enabled: boolean;
    trackUri?: string;
    trackName?: string;
    artist?: string;
    positionMs?: number;
  };
}

// ============================================================================
// VIDEO THUMBNAIL
// ============================================================================
const VideoThumbnail = ({ videoUrl, size }: { videoUrl: string; size: number }) => {
  const player = useVideoPlayer(videoUrl, (p) => {
    p.loop = false;
    p.muted = true;
    p.pause();
  });

  return (
    <VideoView
      player={player}
      style={{ width: size, height: size * (16 / 9) }}
      contentFit="cover"
      nativeControls={false}
    />
  );
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================
function AdnScreenContent() {
  const { user, isPro, isAuthenticated, spotifyPremium } = useUserRoleContext();
  const { refreshTrigger, setScreenContext } = useHank();
  const { canSave } = useSaveGuard();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'legacy' | 'vault'>('legacy');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  // Video viewer state
  const [selectedVideo, setSelectedVideo] = useState<Video | null>(null);
  const [videoViewerVisible, setVideoViewerVisible] = useState(false);
  const [isVideoManuallyPaused, setIsVideoManuallyPaused] = useState(false);
  const { width: screenWidth } = Dimensions.get('window');
  const videoTileSize = screenWidth / 3;

  // Video options modal
  const [videoOptionsVisible, setVideoOptionsVisible] = useState(false);
  const [selectedVideoForEdit, setSelectedVideoForEdit] = useState<Video | null>(null);

  // Share modal state
  const [shareModalVisible, setShareModalVisible] = useState(false);

  // Edit profile modal state
  const [editProfileVisible, setEditProfileVisible] = useState(false);

  // Record viewer state
  const [recordViewerVisible, setRecordViewerVisible] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<PersonalRecord | null>(null);
  const [selectedRecordVideo, setSelectedRecordVideo] = useState<Video | null>(null);
  const [isRecordVideoManuallyPaused, setIsRecordVideoManuallyPaused] = useState(false);

  // Sincronizar contexto con HANK
  useFocusEffect(
    useCallback(() => {
      setScreenContext({
        module: 'adn',
        viewMode: activeTab,
        currentExerciseIndex: null,
        currentTrainingDay: 0,
      });
    }, [activeTab, setScreenContext])
  );

  // Video player para el viewer
  const videoSource = selectedVideo?.video_url || '';
  const videoPlayer = useVideoPlayer(videoSource, (player) => {
    player.loop = true;
    // Volumen se controla dinámicamente en el useEffect según Spotify
  });

  // Ref para rastrear si Spotify ya se sincronizó (evita re-sync al reanudar de pausa)
  const spotifySyncedRef = useRef(false);

  // Control de reproducción + Spotify sync (solo al ABRIR el modal)
  useEffect(() => {
    if (videoViewerVisible && videoPlayer) {
      // Determinar si hay Spotify para este video
      const hasSpotify = !!(selectedVideo?.spotify?.enabled && spotifyPremium);
      const trackUri = hasSpotify ? (selectedVideo?.spotify as any)?.trackUri : null;

      // MUTEAR el video si hay Spotify - solo se escuchará Spotify
      videoPlayer.volume = hasSpotify && trackUri ? 0 : 1;

      // Reproducir video si no está pausado manualmente
      if (!isVideoManuallyPaused) {
        videoPlayer.play();
      }

      // Solo sincronizar Spotify la PRIMERA vez que se abre el modal
      if (!spotifySyncedRef.current && hasSpotify && trackUri) {
        spotifySyncedRef.current = true;
        const positionMs = (selectedVideo?.spotify as any)?.positionMs || 0;
        console.log('🎵 ADN: Sincronizando Spotify (video muted)', trackUri, positionMs);
        spotify.syncWithVideo(trackUri, positionMs).catch(console.warn);
      } else if (!hasSpotify) {
        console.log('🔊 ADN: Reproduciendo audio ambiente del video');
      }
    } else if (videoPlayer && !videoViewerVisible) {
      videoPlayer.pause();
      setIsVideoManuallyPaused(false); // Reset al cerrar
      spotifySyncedRef.current = false; // Reset para próxima apertura
      // Pausar Spotify al cerrar el viewer
      if (selectedVideo?.spotify?.enabled && spotifyPremium) {
        spotify.pauseForSwipe().catch(console.warn);
      }
    }
  }, [videoViewerVisible, videoPlayer, selectedVideo, spotifyPremium]);

  // Handler para tap en el video (pausar/reanudar solo video, NO Spotify)
  const handleVideoTap = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIsVideoManuallyPaused((prev) => {
      const newPaused = !prev;
      if (newPaused) {
        videoPlayer.pause();
      } else {
        videoPlayer.play();
      }
      return newPaused;
    });
  }, [videoPlayer]);

  // Video player para el visor de RÉCORDS
  const recordVideoSource = selectedRecordVideo?.video_url || '';
  const recordVideoPlayer = useVideoPlayer(recordVideoSource, (player) => {
    player.loop = true;
  });

  // Ref para Spotify sync en visor de récords
  const recordSpotifySyncedRef = useRef(false);

  // Control de reproducción de récords + Spotify sync
  useEffect(() => {
    if (recordViewerVisible && recordVideoPlayer) {
      const hasSpotify = !!(selectedRecordVideo?.spotify?.enabled && spotifyPremium);
      const trackUri = hasSpotify ? (selectedRecordVideo?.spotify as any)?.trackUri : null;

      recordVideoPlayer.volume = hasSpotify && trackUri ? 0 : 1;

      if (!isRecordVideoManuallyPaused) {
        recordVideoPlayer.play();
      }

      if (!recordSpotifySyncedRef.current && hasSpotify && trackUri) {
        recordSpotifySyncedRef.current = true;
        const positionMs = (selectedRecordVideo?.spotify as any)?.positionMs || 0;
        spotify.syncWithVideo(trackUri, positionMs).catch(console.warn);
      }
    } else if (recordVideoPlayer && !recordViewerVisible) {
      recordVideoPlayer.pause();
      setIsRecordVideoManuallyPaused(false);
      recordSpotifySyncedRef.current = false;
      if (selectedRecordVideo?.spotify?.enabled && spotifyPremium) {
        spotify.pauseForSwipe().catch(console.warn);
      }
    }
  }, [recordViewerVisible, recordVideoPlayer, selectedRecordVideo, spotifyPremium]);

  // Handler para tap en video de récord
  const handleRecordVideoTap = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIsRecordVideoManuallyPaused((prev) => {
      const newPaused = !prev;
      if (newPaused) {
        recordVideoPlayer.pause();
      } else {
        recordVideoPlayer.play();
      }
      return newPaused;
    });
  }, [recordVideoPlayer]);

  // Data states
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [records, setRecords] = useState<PersonalRecord[]>([]);
  const [videos, setVideos] = useState<Video[]>([]);
  const [followersCount, setFollowersCount] = useState(0);

  const isOwner = true; // Para perfiles de otros usuarios, esto cambiaría

  // -------------------------------------------------------------------------
  // FETCH DATA
  // -------------------------------------------------------------------------
  const fetchData = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    try {
      // Fetch profile (desde user_profiles)
      const { data: profileData, error: profileError } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (profileError && profileError.code !== 'PGRST116') {
        console.error('Error fetching profile:', profileError);
      }

      // Fetch training_frequency desde profiles (calculado desde GYM)
      const { data: authProfile } = await supabase
        .from('profiles')
        .select('training_frequency')
        .eq('id', user.id)
        .single();

      // Fetch meals con ingredientes para calcular macros reales
      const { data: mealsWithIngredients, count: mealCount } = await supabase
        .from('meals')
        .select('ingredients', { count: 'exact' })
        .eq('user_id', user.id);

      // Computar macros REALES desde nutritionInfo de ingredientes
      let actualDailyMacros: {
        totalCalories: number;
        totalProtein: number;
        totalCarbs: number;
        totalFat: number;
      } | null = null;
      if (mealsWithIngredients && mealsWithIngredients.length > 0) {
        let cal = 0,
          pro = 0,
          car = 0,
          fat = 0;
        let hasNutrition = false;
        for (const meal of mealsWithIngredients) {
          const ings = (meal.ingredients as any[]) || [];
          for (const ing of ings) {
            // Soportar formato anidado (nutritionInfo) y top-level (calories, protein...)
            const ni = ing.nutritionInfo || (ing.calories != null ? ing : null);
            if (ni) {
              hasNutrition = true;
              cal += ni.calories || 0;
              pro += ni.protein || 0;
              car += ni.carbs || 0;
              fat += ni.fat || 0;
            }
          }
        }
        if (hasNutrition) {
          actualDailyMacros = {
            totalCalories: Math.round(cal),
            totalProtein: Math.round(pro),
            totalCarbs: Math.round(car),
            totalFat: Math.round(fat),
          };
        }
      }

      // Obtener foto de progreso más reciente con datos de snapshot
      const { data: latestProgressPhoto } = await supabase
        .from('progress_photos')
        .select('snapshot, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      // Si no existe perfil, crear uno
      if (!profileData) {
        const { data: newProfile, error: createError } = await supabase
          .from('user_profiles')
          .insert({
            user_id: user.id,
            display_name: user.email?.split('@')[0]?.toUpperCase() || 'ATLETA',
          })
          .select()
          .single();

        if (!createError) {
          // Agregar campos calculados
          setProfile({
            ...newProfile,
            training_frequency: authProfile?.training_frequency || 0,
            meal_count: mealCount || 0,
          });
        }
      } else {
        // Verificar si necesitamos calcular macros objetivo
        // Si no hay cached_daily_macros pero sí hay datos de perfil, calcular macros
        let cachedMacros = profileData.cached_daily_macros;
        const hasMeals = (mealCount || 0) > 0;

        if (!cachedMacros && profileData.weight && profileData.height && profileData.goal) {
          try {
            console.log('🧠 ADN: Calculando macros objetivo con toda la información disponible...');

            // Extraer datos de la foto de progreso si existe
            const progressSnapshot = latestProgressPhoto?.snapshot as any;
            let latestProgressPhotoData = undefined;
            if (progressSnapshot) {
              latestProgressPhotoData = {
                weight: progressSnapshot.weight || undefined,
                bodyFatPercentage: progressSnapshot.bodyFatPercentage || undefined,
                date: latestProgressPhoto?.created_at,
              };
            }

            // Obtener medidas corporales para incluir en el cálculo
            const { data: measurementsForCalc } = await supabase
              .from('body_measurements')
              .select('name, value, is_dominant')
              .eq('user_id', user.id);

            const dailyMacros = await calculateUserDailyMacros({
              weight: profileData.weight,
              height: profileData.height,
              goal: profileData.goal,
              mealCount: hasMeals ? mealCount! : undefined, // Solo si tiene comidas
              age: profileData.age || undefined,
              sex: profileData.sex || undefined,
              bodyFatPercentage: profileData.body_fat_percentage || undefined,
              muscleMass: profileData.muscle_mass || undefined,
              activityLevel: profileData.activity_level || 'MODERADO',
              trainingExperience: profileData.training_experience || undefined,
              metabolicRate: profileData.metabolic_rate || undefined,
              trainingDaysPerWeek: profileData.training_days_per_week || undefined,
              bodyMeasurements: measurementsForCalc || undefined,
              latestProgressPhoto: latestProgressPhotoData,
            });

            cachedMacros = dailyMacros;

            // Guardar en Supabase para sincronización
            await supabase
              .from('user_profiles')
              .update({
                cached_daily_macros: dailyMacros,
                cached_macros_meal_count: mealCount || 0,
                cached_macros_updated_at: new Date().toISOString(),
              })
              .eq('user_id', user.id);

            console.log('💾 ADN: Macros objetivo guardados en Supabase');
          } catch (error) {
            console.error('Error calculating default macros:', error);
          }
        }

        // Agregar campos calculados desde GYM y PLAN
        setProfile({
          ...profileData,
          cached_daily_macros: cachedMacros,
          actual_daily_macros: actualDailyMacros,
          training_frequency: authProfile?.training_frequency || 0,
          meal_count: mealCount || 0,
        });
      }

      // Fetch measurements
      const { data: measurementsData } = await supabase
        .from('body_measurements')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true });

      setMeasurements(measurementsData || []);

      // Fetch records - SOLO de videos públicos según MASTER
      const { data: recordsData } = await supabase
        .from('personal_records')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true });

      setRecords(recordsData || []);

      // Fetch followers count
      const { count } = await supabase
        .from('followers')
        .select('*', { count: 'exact', head: true })
        .eq('following_id', user.id);

      setFollowersCount(count || 0);

      // Fetch videos from user_assets (legacy)
      const { data: assetsData } = await supabase
        .from('user_assets')
        .select('*')
        .eq('user_id', user.id)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      // Fetch videos from pro_videos - SOLO los que tienen video_url
      const { data: proVideosData } = await supabase
        .from('pro_videos')
        .select('*')
        .eq('user_id', user.id)
        .not('video_url', 'is', null)
        .order('created_at', { ascending: false });

      // Map user_assets to videos format
      const assetVideos: Video[] = (assetsData || []).map((asset: any) => ({
        id: asset.id,
        title: asset.name || 'Sin título',
        thumbnail_url: asset.thumbnail_url || asset.uri,
        is_public: asset.is_public || false,
        created_at: asset.created_at,
        source: 'asset' as const,
      }));

      // Map pro_videos to videos format
      const proVideos: Video[] = (proVideosData || []).map((video: any) => ({
        id: video.id,
        title:
          video.exercise_name ||
          video.free_text ||
          (video.media_type === 'photo' ? 'Foto PRO' : 'Video PRO'),
        thumbnail_url: video.thumbnail_url || video.video_url,
        video_url: video.video_url,
        cloudflare_video_id: video.cloudflare_video_id,
        is_public: video.is_public,
        created_at: video.created_at,
        source: 'pro' as const,
        media_type: video.media_type || 'video',
        exercise_name: video.exercise_name,
        weight_kg: video.weight_kg,
        reps: video.reps,
        free_text: video.free_text,
        spotify: video.spotify,
      }));

      // Combinar y ordenar por fecha
      const allVideos = [...assetVideos, ...proVideos].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );

      setVideos(allVideos);
    } catch (err) {
      console.error('Error fetching ADN data:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Refrescar cuando HANK modifica datos
  useEffect(() => {
    if (refreshTrigger > 0) {
      fetchData();
    }
  }, [refreshTrigger, fetchData]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchData();
  }, [fetchData]);

  // -------------------------------------------------------------------------
  // OPEN ACCOUNT MODAL
  // -------------------------------------------------------------------------
  const openEditProfile = () => {
    setEditProfileVisible(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  // -------------------------------------------------------------------------
  // VIDEO VISIBILITY TOGGLE - Público ↔ Privado según MASTER
  // -------------------------------------------------------------------------
  const toggleVideoVisibility = async (video: Video) => {
    if (!user || !isPro) {
      setShowUpgradeModal(true);
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const newIsPublic = !video.is_public;

      if (video.source === 'pro') {
        const { error } = await supabase
          .from('pro_videos')
          .update({ is_public: newIsPublic })
          .eq('id', video.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('user_assets')
          .update({ is_public: newIsPublic })
          .eq('id', video.id);

        if (error) throw error;
      }

      // Si el video sale de público, eliminar del Top 3 según MASTER
      if (!newIsPublic) {
        // Eliminar de personal_records si está vinculado
        await supabase.from('personal_records').delete().eq('video_id', video.id);
      }

      // Actualizar estado local
      setVideos((prev) =>
        prev.map((v) => (v.id === video.id ? { ...v, is_public: newIsPublic } : v))
      );

      setVideoOptionsVisible(false);
      setSelectedVideoForEdit(null);

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      console.error('Error toggling visibility:', error);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  };

  // -------------------------------------------------------------------------
  // DELETE VIDEO
  // -------------------------------------------------------------------------
  const deleteVideo = async (video: Video) => {
    if (!user) return;

    Alert.alert(
      'Eliminar video',
      '¿Estás seguro de que quieres eliminar este video? Esta acción no se puede deshacer.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

            try {
              // 1. Eliminar de Cloudflare Stream si existe
              if (video.cloudflare_video_id) {
                console.warn(
                  '🗑️ Eliminando video de Cloudflare Stream:',
                  video.cloudflare_video_id
                );
                const deleted = await cloudflareStream.deleteVideo(video.cloudflare_video_id);
                if (deleted) {
                  console.warn('✅ Video eliminado de Cloudflare Stream');
                } else {
                  console.warn('⚠️ No se pudo eliminar de Cloudflare Stream');
                }
              }

              // 2. Eliminar de la base de datos
              if (video.source === 'pro') {
                const { error } = await supabase.from('pro_videos').delete().eq('id', video.id);

                if (error) throw error;
              } else {
                // Soft delete para assets
                const { error } = await supabase
                  .from('user_assets')
                  .update({ deleted_at: new Date().toISOString() })
                  .eq('id', video.id);

                if (error) throw error;
              }

              // 3. Eliminar de personal_records si está vinculado
              await supabase.from('personal_records').delete().eq('video_id', video.id);

              setVideos((prev) => prev.filter((v) => v.id !== video.id));
              setVideoOptionsVisible(false);
              setSelectedVideoForEdit(null);

              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            } catch (error) {
              console.error('Error deleting video:', error);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            }
          },
        },
      ]
    );
  };

  // -------------------------------------------------------------------------
  // SELECT VIDEO FOR RECORD - Desde videos públicos de la bóveda
  // -------------------------------------------------------------------------
  const getExerciseIcon = (exerciseName?: string): string => {
    if (!exerciseName) return '🏋️';

    const name = exerciseName.toUpperCase();
    if (name.includes('SENTADILLA') || name.includes('SQUAT')) return '🦵';
    if (name.includes('BANCA') || name.includes('BENCH') || name.includes('PRESS')) return '💪';
    if (name.includes('PESO MUERTO') || name.includes('DEADLIFT')) return '☠️';
    if (name.includes('MILITAR') || name.includes('OHP')) return '🏋️';
    if (name.includes('REMO') || name.includes('ROW')) return '🚣';
    if (name.includes('DOMINADA') || name.includes('PULL')) return '🧗';
    if (name.includes('CURL')) return '💪';
    if (name.includes('TRICEP')) return '💪';

    return '🏋️';
  };

  const handleSelectVideoForRecord = async (video: Video) => {
    // Guard: Verificar si puede guardar
    if (!canSave('save_record')) return;

    if (!user) return;

    // Validar que el video tenga los datos necesarios
    if (!video.exercise_name || !video.weight_kg || !video.reps) {
      Alert.alert(
        'Video incompleto',
        'Este video no tiene ejercicio, peso o reps definidos. Selecciona otro video.'
      );
      return;
    }

    try {
      const { data, error } = await supabase
        .from('personal_records')
        .insert({
          user_id: user.id,
          exercise_name: video.exercise_name,
          weight_kg: video.weight_kg,
          reps: video.reps,
          video_id: video.id,
        })
        .select()
        .single();

      if (error) {
        if (error.message.includes('Maximum of 3')) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          Alert.alert('Límite alcanzado', 'Máximo 3 récords permitidos');
        }
        throw error;
      }

      setRecords((prev) => [...prev, data]);
      setShowAddModal(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err) {
      console.error('Error adding record from video:', err);
    }
  };

  // -------------------------------------------------------------------------
  // REMOVE RECORD - Quitar récord de la lista (no elimina el video)
  // -------------------------------------------------------------------------
  const handleRemoveRecord = async (recordId: string) => {
    if (!user) return;

    Alert.alert(
      'Quitar Récord',
      '¿Estás seguro de que quieres quitar este récord de tu Top 3? El video seguirá en tu bóveda.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Quitar',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('personal_records')
                .delete()
                .eq('id', recordId)
                .eq('user_id', user.id);

              if (error) throw error;

              setRecords((prev) => prev.filter((r) => r.id !== recordId));
              setRecordViewerVisible(false);
              setSelectedRecord(null);
              setSelectedRecordVideo(null);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            } catch (err) {
              console.error('Error removing record:', err);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            }
          },
        },
      ]
    );
  };

  // -------------------------------------------------------------------------
  // HELPERS
  // -------------------------------------------------------------------------
  const formatFollowers = (count: number): string => {
    if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
    if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
    return count.toString();
  };

  // Videos públicos para el tab "Legado" (perfil público)
  const publicVideos = videos.filter((v) => v.is_public);

  // Videos privados para la "Bóveda"
  const vaultVideos = videos.filter((v) => !v.is_public);

  // -------------------------------------------------------------------------
  // RENDER: Invitado (no autenticado) — mini landing del módulo
  // -------------------------------------------------------------------------
  if (!isAuthenticated) {
    return <GuestModuleLanding module="adn" />;
  }

  // -------------------------------------------------------------------------
  // RENDER: Loading (solo si hay usuario y está cargando)
  // -------------------------------------------------------------------------
  if (loading && isAuthenticated) {
    return (
      <View className="flex-1 bg-black items-center justify-center">
        <ActivityIndicator size="large" color="#DC2626" />
      </View>
    );
  }

  // -------------------------------------------------------------------------
  // RENDER: Main (con datos reales o placeholders para visitantes)
  // -------------------------------------------------------------------------
  return (
    <View className="flex-1 bg-black">
      {/* SAVAGE AMBIENT BACKDROP — Landing-grade fire orbs + embers */}
      <SavageBackground variant="screen" />

      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#DC2626" />
        }
      >
        {/* HEADER (PÚBLICO) - ED HARDY FIRE STYLE */}
        <View className="relative pt-16 pb-8 px-6 items-center overflow-hidden">
          {/* Hero spotlight gradient (sits over the SavageBackground) */}
          <LinearGradient
            colors={['rgba(220, 38, 38, 0.22)', 'rgba(249, 115, 22, 0.05)', 'transparent']}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
          />

          {/* Diagonal fire shimmer */}
          <LinearGradient
            colors={['transparent', 'rgba(220, 38, 38, 0.08)', 'transparent']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
          />

          {/* Bottom hairline separator with fire glow */}
          <View
            className="absolute bottom-0 left-6 right-6 h-px"
            style={{
              backgroundColor: 'rgba(249, 115, 22, 0.4)',
              shadowColor: '#F97316',
              shadowOffset: { width: 0, height: 0 },
              shadowOpacity: 0.8,
              shadowRadius: 8,
            }}
          />

          {/* LAYOUT ESTILO INSTAGRAM: Avatar izquierda, Nombre+Pills derecha */}
          <View className="flex-row items-start w-full">
            {/* Columna izquierda: Avatar + Badge PRO */}
            <View className="items-center">
              {/* Avatar con Fire Ring - Tocable para editar */}
              <TouchableOpacity
                onPress={isOwner ? openEditProfile : undefined}
                activeOpacity={isOwner ? 0.8 : 1}
                className="w-24 h-24 rounded-full items-center justify-center"
                style={{
                  borderWidth: 3,
                  borderColor: profile?.is_elite ? '#A855F7' : '#F97316',
                  shadowColor: profile?.is_elite ? '#A855F7' : '#F97316',
                  shadowOffset: { width: 0, height: 0 },
                  shadowOpacity: 0.8,
                  shadowRadius: 15,
                  elevation: 10,
                }}
              >
                <View className="w-20 h-20 rounded-full bg-zinc-900 overflow-hidden">
                  {profile?.avatar_url ? (
                    <Image
                      source={{ uri: profile.avatar_url }}
                      className="w-full h-full"
                      resizeMode="cover"
                    />
                  ) : (
                    <LinearGradient
                      colors={['#DC2626', '#F97316']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      className="w-full h-full items-center justify-center"
                    >
                      <Text className="text-white text-3xl font-black">
                        {profile?.display_name?.charAt(0) || 'A'}
                      </Text>
                    </LinearGradient>
                  )}
                </View>
                {/* Icono de editar sobre el avatar */}
                {isOwner && (
                  <View className="absolute bottom-0 right-0 w-7 h-7 bg-fire-red rounded-full items-center justify-center border-2 border-black">
                    <Pencil size={12} color="#fff" />
                  </View>
                )}
              </TouchableOpacity>

              {/* Badge PRO/FREE — movido debajo del nombre */}
            </View>

            {/* Columna derecha: Nombre + PRO Badge */}
            <View className="flex-1 ml-4 justify-center">
              {/* Nombre con Fire Glow - Tocable para editar */}
              <TouchableOpacity
                onPress={isOwner ? openEditProfile : undefined}
                activeOpacity={isOwner ? 0.8 : 1}
                className="flex-row items-center"
              >
                <Text
                  className="text-2xl font-black text-white uppercase tracking-tight"
                  style={{
                    textShadowColor: profile?.is_elite ? '#A855F7' : '#F97316',
                    textShadowOffset: { width: 0, height: 0 },
                    textShadowRadius: 10,
                  }}
                >
                  {profile?.display_name || 'ATLETA'}
                </Text>
                {isOwner && <Pencil size={14} color="#71717a" className="ml-2" />}
              </TouchableOpacity>

              {/* PRO + ÉLITE Badges - debajo del nombre */}
              <View className="mt-2 flex-row items-center gap-2">
                <View
                  className={`px-3 py-1 rounded-full flex-row items-center gap-1.5 ${isPro ? '' : 'bg-zinc-900 border border-zinc-800'}`}
                  style={
                    isPro
                      ? {
                          backgroundColor: '#0a0000',
                          borderWidth: 1.5,
                          borderColor: '#F97316',
                          shadowColor: '#DC2626',
                          shadowOffset: { width: 0, height: 0 },
                          shadowOpacity: 0.6,
                          shadowRadius: 8,
                        }
                      : {}
                  }
                >
                  {isPro ? <Crown size={12} color="#F97316" /> : <Lock size={10} color="#71717a" />}
                  <Text
                    className={`text-[10px] font-bold tracking-widest ${isPro ? 'text-fire-orange' : 'text-zinc-500'}`}
                  >
                    {isPro ? 'PRO' : 'FREE'}
                  </Text>
                </View>
                {profile?.is_elite && (
                  <View
                    className="px-3 py-1 rounded-full flex-row items-center gap-1.5"
                    style={{
                      backgroundColor: '#0a000a',
                      borderWidth: 1.5,
                      borderColor: '#A855F7',
                      shadowColor: '#A855F7',
                      shadowOffset: { width: 0, height: 0 },
                      shadowOpacity: 0.6,
                      shadowRadius: 8,
                    }}
                  >
                    <BadgeCheck size={12} color="#A855F7" />
                    <Text className="text-[10px] font-bold tracking-widest text-purple-400">
                      ÉLITE
                    </Text>
                  </View>
                )}
              </View>
            </View>
          </View>
        </View>

        {/* TODAY CARDS - Entrenamiento y Próxima Comida/Stack */}
        {isOwner && user && (
          <View className="mt-6">
            <TodayCards userId={user.id} />
          </View>
        )}

        {/* TRENS ID (Solo visible para el dueño) */}
        <View className="px-4 mt-4">
          {isOwner && (
            <TrensID
              userId={user?.id || 'guest'}
              profileData={
                profile
                  ? {
                      goal: profile.goal,
                      weight: profile.weight,
                      height: profile.height,
                      injuries: profile.injuries,
                      allergies: profile.allergies,
                      // Biometría avanzada
                      age: profile.age,
                      sex: profile.sex,
                      body_fat_percentage: profile.body_fat_percentage,
                      muscle_mass: profile.muscle_mass,
                      activity_level: profile.activity_level,
                      training_experience: profile.training_experience,
                      metabolic_rate: profile.metabolic_rate,
                      training_days_per_week: profile.training_days_per_week,
                      // Campos CALCULADOS (no editables, vienen de GYM y PLAN)
                      training_frequency: profile.training_frequency,
                      meal_count: profile.meal_count,
                      // Macros diarios cacheados
                      cached_daily_macros: profile.cached_daily_macros,
                      actual_daily_macros: profile.actual_daily_macros,
                    }
                  : {
                      // Placeholder data para visitantes
                      goal: 'TU OBJETIVO',
                      weight: '0',
                      height: '0',
                      injuries: '',
                      allergies: '',
                      age: undefined,
                      sex: undefined,
                      body_fat_percentage: undefined,
                      muscle_mass: undefined,
                      activity_level: undefined,
                      training_experience: undefined,
                      metabolic_rate: undefined,
                      training_days_per_week: undefined,
                      training_frequency: undefined,
                      meal_count: undefined,
                      cached_daily_macros: null,
                      actual_daily_macros: null,
                    }
              }
              measurements={measurements}
              onUpdate={fetchData}
            />
          )}
        </View>

        {/* INSTAGRAM CONNECT — Oculto temporalmente
        {isOwner && isPro && (
          <View className="px-4 mt-4">
            <InstagramConnectButton />
          </View>
        )}
        */}

        {/* RECORDS (PÚBLICO) — Oculto temporalmente */}
        {false && (
          <View className={`px-4 ${!isOwner ? 'mt-8' : ''}`}>
            <View className="flex-row justify-between items-center mb-3 border-b border-fire-red/30 pb-2">
              <View className="flex-row items-center gap-2">
                <Text className="text-fire-orange text-sm">🔥</Text>
                <Text
                  className="text-fire-orange font-bold uppercase tracking-widest text-xs"
                  style={{
                    textShadowColor: '#F97316',
                    textShadowOffset: { width: 0, height: 0 },
                    textShadowRadius: 5,
                  }}
                >
                  Top 3 Récords
                </Text>
              </View>
              <Text className="text-zinc-600 text-xs font-mono">VIDEOS PÚBLICOS</Text>
            </View>

            <View className="flex-row gap-2">
              {records.slice(0, 3).map((rec) => {
                // Buscar el video asociado para obtener el thumbnail y spotify
                const associatedVideo = videos.find((v) => v.id === rec.video_id);
                const hasSpotify = !!associatedVideo?.spotify?.enabled;
                return (
                  <View key={rec.id} className="flex-1">
                    <RecordCard
                      record={rec}
                      thumbnailUrl={associatedVideo?.thumbnail_url}
                      hasSpotify={hasSpotify}
                      onPress={() => {
                        setSelectedRecord(rec);
                        setSelectedRecordVideo(associatedVideo || null);
                        setRecordViewerVisible(true);
                      }}
                    />
                  </View>
                );
              })}

              {/* Botón añadir (solo dueño y si hay espacio) - NO manual según MASTER */}
              {/* Los récords solo se eligen desde videos públicos, no ingreso manual */}
              {isOwner && records.length < 3 && publicVideos.length > 0 && (
                <TouchableOpacity
                  onPress={() => {
                    if (!isPro) {
                      setShowUpgradeModal(true);
                      return;
                    }
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    setShowAddModal(true);
                  }}
                  className="flex-1 min-h-[160px] rounded items-center justify-center"
                  style={{
                    borderWidth: 1,
                    borderColor: '#F97316',
                    borderStyle: 'dashed',
                    backgroundColor: '#0a0500',
                  }}
                >
                  <View
                    className="w-10 h-10 rounded-full items-center justify-center mb-2"
                    style={{
                      backgroundColor: '#1a0a00',
                      borderWidth: 1,
                      borderColor: '#F97316',
                    }}
                  >
                    <Plus size={18} color="#F97316" />
                  </View>
                  <Text className="text-[10px] font-bold text-fire-orange uppercase tracking-widest">
                    Elegir
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}

        {/* TABS LEGADO / BÓVEDA — Oculto temporalmente */}
        {false && (
          <View className="mt-12 border-t border-fire-red/20">
            <View className="flex-row">
              {/* LEGADO (Videos públicos) */}
              <TouchableOpacity
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setActiveTab('legacy');
                }}
                className={`flex-1 py-4 flex-row items-center justify-center gap-2 ${
                  activeTab === 'legacy' ? 'border-t-2 border-fire-orange' : ''
                }`}
                style={
                  activeTab === 'legacy'
                    ? {
                        backgroundColor: 'rgba(249, 115, 22, 0.1)',
                      }
                    : {}
                }
              >
                <Grid size={14} color={activeTab === 'legacy' ? '#F97316' : '#52525b'} />
                <Text
                  className={`text-[10px] font-bold uppercase tracking-[0.2em] ${
                    activeTab === 'legacy' ? 'text-fire-orange' : 'text-zinc-600'
                  }`}
                >
                  Legado
                </Text>
                <View
                  className={`px-1.5 py-0.5 rounded ${activeTab === 'legacy' ? 'bg-fire-red/30' : 'bg-zinc-800'}`}
                >
                  <Text
                    className={`text-[9px] font-bold font-mono ${activeTab === 'legacy' ? 'text-fire-orange' : 'text-zinc-500'}`}
                  >
                    {publicVideos.length}
                  </Text>
                </View>
              </TouchableOpacity>

              {/* BÓVEDA (Todos los videos, para gestión) - Solo dueño */}
              {isOwner && (
                <TouchableOpacity
                  onPress={() => {
                    if (!isPro) {
                      setShowUpgradeModal(true);
                      return;
                    }
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setActiveTab('vault');
                  }}
                  className={`flex-1 py-4 flex-row items-center justify-center gap-2 ${
                    activeTab === 'vault' ? 'border-t-2 border-fire-red' : ''
                  }`}
                  style={
                    activeTab === 'vault'
                      ? {
                          backgroundColor: 'rgba(220, 38, 38, 0.1)',
                        }
                      : {}
                  }
                >
                  <Lock size={14} color={activeTab === 'vault' ? '#DC2626' : '#52525b'} />
                  <Text
                    className={`text-[10px] font-bold uppercase tracking-[0.2em] ${
                      activeTab === 'vault' ? 'text-fire-red' : 'text-zinc-600'
                    }`}
                  >
                    Bóveda
                  </Text>
                  <View
                    className={`px-1.5 py-0.5 rounded ${activeTab === 'vault' ? 'bg-fire-red/30' : 'bg-zinc-800'}`}
                  >
                    <Text
                      className={`text-[9px] font-bold font-mono ${activeTab === 'vault' ? 'text-fire-red' : 'text-zinc-500'}`}
                    >
                      {vaultVideos.length}
                    </Text>
                  </View>
                </TouchableOpacity>
              )}
            </View>

            {/* CONTENIDO TABS */}
            <View className="bg-[#030000] min-h-[300px]">
              {/* LEGADO - Grid de videos públicos */}
              {activeTab === 'legacy' && (
                <View className="flex-row flex-wrap">
                  {publicVideos.length === 0 ? (
                    <View className="flex-1 items-center justify-center py-20">
                      <Grid size={40} color="#27272a" />
                      <Text className="text-zinc-600 text-xs uppercase tracking-widest mt-4">
                        Sin contenido público
                      </Text>
                      <Text className="text-zinc-700 text-xs text-center mt-2 px-8">
                        Graba videos y hazlos públicos para mostrar tu legado
                      </Text>
                    </View>
                  ) : (
                    publicVideos.map((vid) => (
                      <TouchableOpacity
                        key={vid.id}
                        className="w-1/3 bg-zinc-900 relative overflow-hidden"
                        style={{ aspectRatio: 9 / 16 }}
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          if (vid.video_url || vid.thumbnail_url) {
                            setSelectedVideo(vid);
                            setVideoViewerVisible(true);
                          }
                        }}
                      >
                        {vid.media_type === 'photo' ? (
                          <Image
                            source={{ uri: vid.video_url || vid.thumbnail_url }}
                            className="w-full h-full opacity-80"
                            resizeMode="cover"
                          />
                        ) : vid.video_url ? (
                          <View className="w-full h-full opacity-80">
                            <VideoThumbnail videoUrl={vid.video_url} size={videoTileSize} />
                          </View>
                        ) : (
                          <Image
                            source={{ uri: vid.thumbnail_url }}
                            className="w-full h-full opacity-80"
                            resizeMode="cover"
                          />
                        )}
                        <View className="absolute inset-0 items-center justify-center bg-black/20">
                          <View className="w-8 h-8 rounded-full bg-black/50 items-center justify-center">
                            {vid.media_type === 'photo' ? (
                              <ImageIcon size={14} color="#fff" />
                            ) : (
                              <Play size={14} color="#fff" fill="#fff" />
                            )}
                          </View>
                        </View>
                        {vid.spotify?.enabled && (
                          <View className="absolute top-1 right-1">
                            <Music size={10} color="#1DB954" />
                          </View>
                        )}
                      </TouchableOpacity>
                    ))
                  )}
                </View>
              )}

              {/* BÓVEDA - Lista de todos los videos con gestión */}
              {activeTab === 'vault' && isOwner && (
                <View className="p-2">
                  {/* Info box */}
                  <View className="p-3 bg-zinc-900/30 border border-zinc-800 rounded flex-row gap-3 mb-4">
                    <Lock size={16} color="#DC2626" />
                    <View className="flex-1">
                      <Text className="text-white text-xs font-bold mb-1">BÓVEDA PRIVADA</Text>
                      <Text className="text-zinc-400 text-[10px] leading-relaxed">
                        Gestiona la visibilidad de tu contenido. Los videos privados solo tú puedes
                        verlos.
                      </Text>
                    </View>
                  </View>

                  {videos.length === 0 ? (
                    <View className="items-center justify-center py-16">
                      <Lock size={40} color="#27272a" />
                      <Text className="text-zinc-600 text-xs uppercase tracking-widest mt-4">
                        Bóveda vacía
                      </Text>
                      <Text className="text-zinc-700 text-xs text-center mt-2 px-8">
                        Graba tu primer video con el botón PRO
                      </Text>
                    </View>
                  ) : (
                    videos.map((vid) => (
                      <Pressable
                        key={vid.id}
                        onLongPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
                          deleteVideo(vid);
                        }}
                        delayLongPress={500}
                        className="flex-row gap-3 p-3 bg-[#0a0a0a] border border-zinc-900 rounded-xl mb-2"
                      >
                        {/* Thumbnail */}
                        <TouchableOpacity
                          onPress={() => {
                            if (vid.video_url || vid.thumbnail_url) {
                              setSelectedVideo(vid);
                              setVideoViewerVisible(true);
                            }
                          }}
                          className="w-20 h-28 bg-zinc-800 rounded-lg overflow-hidden"
                        >
                          {vid.media_type === 'photo' ? (
                            <Image
                              source={{ uri: vid.video_url || vid.thumbnail_url }}
                              className="w-full h-full opacity-60"
                              resizeMode="cover"
                            />
                          ) : vid.video_url ? (
                            <VideoThumbnail videoUrl={vid.video_url} size={80} />
                          ) : (
                            <Image
                              source={{ uri: vid.thumbnail_url }}
                              className="w-full h-full opacity-60"
                              resizeMode="cover"
                            />
                          )}
                          <View className="absolute inset-0 items-center justify-center">
                            {vid.media_type === 'photo' ? (
                              <ImageIcon size={16} color="#fff" />
                            ) : (
                              <Play size={16} color="#fff" fill="#fff" />
                            )}
                          </View>
                        </TouchableOpacity>

                        {/* Info */}
                        <View className="flex-1 justify-center">
                          <Text className="text-sm font-bold text-white mb-1" numberOfLines={1}>
                            {vid.title}
                          </Text>

                          {/* Caption si existe */}
                          {vid.free_text && (
                            <Text className="text-zinc-400 text-xs italic mb-1" numberOfLines={1}>
                              {vid.free_text}
                            </Text>
                          )}

                          {/* Métricas si existen */}
                          {(vid.weight_kg || vid.reps) && (
                            <Text className="text-savage-red text-xs font-mono mb-1">
                              {vid.weight_kg && vid.reps
                                ? `${vid.weight_kg}kg × ${vid.reps} reps`
                                : vid.weight_kg
                                  ? `${vid.weight_kg}kg`
                                  : `${vid.reps} reps`}
                            </Text>
                          )}

                          {/* Estado + Fecha */}
                          <View className="flex-row items-center gap-2">
                            {vid.is_public ? (
                              <View className="flex-row items-center gap-1 border border-green-900 bg-green-900/10 px-2 py-0.5 rounded-full">
                                <Eye size={10} color="#22c55e" />
                                <Text className="text-[10px] text-green-500 font-bold uppercase">
                                  Público
                                </Text>
                              </View>
                            ) : (
                              <View className="flex-row items-center gap-1 border border-zinc-800 bg-zinc-900/50 px-2 py-0.5 rounded-full">
                                <Lock size={10} color="#71717a" />
                                <Text className="text-[10px] text-zinc-500 font-bold uppercase">
                                  Bóveda
                                </Text>
                              </View>
                            )}
                            <Text className="text-[10px] text-zinc-600">
                              {new Date(vid.created_at).toLocaleDateString('es', {
                                day: '2-digit',
                                month: 'short',
                              })}
                            </Text>
                          </View>

                          {/* Spotify */}
                          {vid.spotify?.enabled && (
                            <View className="flex-row items-center gap-1 mt-1">
                              <Music size={10} color="#1DB954" />
                              <Text className="text-[10px] text-zinc-500" numberOfLines={1}>
                                {vid.spotify.trackName}
                              </Text>
                            </View>
                          )}
                        </View>

                        {/* Acciones */}
                        <View className="justify-center gap-2">
                          {/* Toggle visibilidad */}
                          <TouchableOpacity
                            onPress={() => toggleVideoVisibility(vid)}
                            className={`w-10 h-10 rounded-full items-center justify-center ${
                              vid.is_public ? 'bg-green-900/20' : 'bg-zinc-800'
                            }`}
                          >
                            {vid.is_public ? (
                              <Eye size={16} color="#22c55e" />
                            ) : (
                              <EyeOff size={16} color="#71717a" />
                            )}
                          </TouchableOpacity>

                          {/* Más opciones */}
                          <TouchableOpacity
                            onPress={() => {
                              setSelectedVideoForEdit(vid);
                              setVideoOptionsVisible(true);
                            }}
                            className="w-10 h-10 rounded-full bg-zinc-800 items-center justify-center"
                          >
                            <MoreVertical size={16} color="#71717a" />
                          </TouchableOpacity>
                        </View>
                      </Pressable>
                    ))
                  )}
                </View>
              )}
            </View>
          </View>
        )}

        {/* Espaciado inferior */}
        <View className="h-20" />
      </ScrollView>

      {/* Modal Seleccionar Video para Récord */}
      <SelectRecordVideoModal
        visible={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSelect={handleSelectVideoForRecord}
        publicVideos={publicVideos}
        existingRecordVideoIds={records.map((r) => r.video_id).filter(Boolean) as string[]}
      />

      {/* Modal Video Viewer */}
      <Modal
        visible={videoViewerVisible}
        animationType="fade"
        transparent={true}
        onRequestClose={() => {
          setVideoViewerVisible(false);
          setSelectedVideo(null);
          // Pausar Spotify al cerrar el visor
          spotify.pauseForSwipe().catch(() => {});
        }}
      >
        <View className="flex-1 bg-black">
          {/* Header */}
          <View className="absolute top-0 left-0 right-0 z-10 pt-14 px-4 pb-4 bg-gradient-to-b from-black/80 to-transparent">
            <View className="flex-row items-center justify-between">
              <TouchableOpacity
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setVideoViewerVisible(false);
                  setSelectedVideo(null);
                  // Pausar Spotify al cerrar el visor
                  spotify.pauseForSwipe().catch(() => {});
                }}
                className="w-10 h-10 rounded-full bg-zinc-900/80 items-center justify-center"
              >
                <X size={20} color="#fff" />
              </TouchableOpacity>
              <View className="flex-1 mx-4">
                <Text className="text-white font-bold text-sm text-center" numberOfLines={1}>
                  {selectedVideo?.title || 'Video'}
                </Text>
                {selectedVideo?.free_text && (
                  <Text className="text-zinc-400 text-xs text-center italic" numberOfLines={1}>
                    {selectedVideo.free_text}
                  </Text>
                )}
                {(selectedVideo?.weight_kg || selectedVideo?.reps) && (
                  <Text className="text-savage-red text-xs text-center font-mono mt-0.5">
                    {selectedVideo.weight_kg && selectedVideo.reps
                      ? `${selectedVideo.weight_kg}kg × ${selectedVideo.reps}`
                      : selectedVideo.weight_kg
                        ? `${selectedVideo.weight_kg}kg`
                        : `${selectedVideo.reps} reps`}
                  </Text>
                )}
              </View>
              <View className="w-10" />
            </View>
          </View>

          {/* Video/Photo Player */}
          <TouchableOpacity
            activeOpacity={1}
            onPress={selectedVideo?.media_type === 'photo' ? undefined : handleVideoTap}
            className="flex-1 items-center justify-center"
          >
            {selectedVideo?.media_type === 'photo' ? (
              <Image
                source={{ uri: selectedVideo.video_url || selectedVideo.thumbnail_url }}
                style={{ width: screenWidth, height: screenWidth * (16 / 9) }}
                resizeMode="contain"
              />
            ) : selectedVideo?.video_url ? (
              <VideoView
                player={videoPlayer}
                style={{ width: screenWidth, height: screenWidth * (16 / 9) }}
                contentFit="contain"
                nativeControls={false}
              />
            ) : null}
            {/* Icono de Play cuando está pausado manualmente (solo para videos) */}
            {isVideoManuallyPaused && selectedVideo?.media_type !== 'photo' && (
              <View className="absolute inset-0 items-center justify-center">
                <View className="w-20 h-20 rounded-full bg-black/50 items-center justify-center">
                  <Play size={40} color="#FFFFFF" fill="#FFFFFF" />
                </View>
              </View>
            )}
          </TouchableOpacity>

          {/* Footer con info de Spotify */}
          {selectedVideo?.spotify?.enabled && (
            <View className="absolute bottom-0 left-0 right-0 pb-10 px-4 pt-4 bg-gradient-to-t from-black/80 to-transparent">
              <TouchableOpacity
                onPress={async () => {
                  // Premium: Puede reproducir desde posición exacta
                  if (spotifyPremium) {
                    const trackUri = (selectedVideo.spotify as any).trackUri;
                    const positionMs = (selectedVideo.spotify as any).positionMs || 0;
                    if (trackUri) {
                      await spotify.syncWithVideo(trackUri, positionMs);
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    }
                  } else {
                    // Sin Spotify Premium
                    Alert.alert(
                      '🎵 Spotify',
                      'Conecta Spotify Premium para escuchar la música con la que se grabó este levantamiento.',
                      [{ text: 'ENTENDIDO', style: 'default' }]
                    );
                  }
                }}
                className="flex-row items-center gap-2 bg-zinc-900/80 rounded-lg px-3 py-2"
              >
                <Music size={16} color="#1DB954" />
                <View className="flex-1">
                  <Text className="text-white text-xs font-bold" numberOfLines={1}>
                    {selectedVideo.spotify.trackName}
                  </Text>
                  <Text className="text-zinc-400 text-[10px]" numberOfLines={1}>
                    {selectedVideo.spotify.artist}
                  </Text>
                </View>
                {/* Indicador de play o lock */}
                {spotifyPremium ? (
                  <Volume2 size={16} color="#1DB954" />
                ) : (
                  <Lock size={14} color="#71717a" />
                )}
              </TouchableOpacity>
            </View>
          )}
        </View>
      </Modal>

      {/* Modal Video Options */}
      <Modal
        visible={videoOptionsVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => {
          setVideoOptionsVisible(false);
          setSelectedVideoForEdit(null);
        }}
      >
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => {
            setVideoOptionsVisible(false);
            setSelectedVideoForEdit(null);
          }}
          className="flex-1 bg-black/80 justify-end"
        >
          <View className="bg-zinc-950 rounded-t-3xl p-6 pb-10">
            <View className="w-12 h-1 bg-zinc-700 rounded-full self-center mb-6" />

            <Text className="text-white text-lg font-bold mb-4">{selectedVideoForEdit?.title}</Text>

            {/* Toggle Visibilidad */}
            <TouchableOpacity
              onPress={() => selectedVideoForEdit && toggleVideoVisibility(selectedVideoForEdit)}
              className="flex-row items-center p-4 bg-zinc-900 rounded-xl mb-3"
            >
              {selectedVideoForEdit?.is_public ? (
                <>
                  <Lock size={20} color="#71717a" />
                  <Text className="text-white ml-3 flex-1">Mover a la Bóveda</Text>
                  <Text className="text-zinc-500 text-xs">Privado</Text>
                </>
              ) : (
                <>
                  <Eye size={20} color="#22c55e" />
                  <Text className="text-white ml-3 flex-1">Hacer Público</Text>
                  <Text className="text-green-500 text-xs">Feed</Text>
                </>
              )}
            </TouchableOpacity>

            {/* Compartir */}
            <TouchableOpacity
              onPress={() => {
                setVideoOptionsVisible(false);
                setTimeout(() => setShareModalVisible(true), 300);
              }}
              className="flex-row items-center p-4 bg-zinc-900 rounded-xl mb-3"
            >
              <Share2 size={20} color="#DC2626" />
              <Text className="text-white ml-3 flex-1">Compartir</Text>
              <Text className="text-zinc-500 text-xs">🔗 Link</Text>
            </TouchableOpacity>

            {/* Eliminar */}
            <TouchableOpacity
              onPress={() => selectedVideoForEdit && deleteVideo(selectedVideoForEdit)}
              className="flex-row items-center p-4 bg-red-900/20 border border-red-900/30 rounded-xl"
            >
              <Trash2 size={20} color="#EF4444" />
              <Text className="text-red-400 ml-3 flex-1">Eliminar</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* PRO Upgrade Modal */}
      <ProUpgradeModal
        visible={showUpgradeModal}
        onClose={() => setShowUpgradeModal(false)}
        feature="vault"
      />

      {/* Share Modal */}
      <ShareModal
        visible={shareModalVisible}
        onClose={() => setShareModalVisible(false)}
        videoId={selectedVideoForEdit?.id || ''}
        title={selectedVideoForEdit?.title}
        exerciseName={selectedVideoForEdit?.exercise_name}
        weightKg={selectedVideoForEdit?.weight_kg}
        reps={selectedVideoForEdit?.reps}
        thumbnailUrl={selectedVideoForEdit?.thumbnail_url}
      />

      {/* Modal Visor de Récord */}
      <Modal
        visible={recordViewerVisible}
        animationType="fade"
        transparent={true}
        onRequestClose={() => {
          setRecordViewerVisible(false);
          setSelectedRecord(null);
          setSelectedRecordVideo(null);
          spotify.pauseForSwipe().catch(() => {});
        }}
      >
        <View className="flex-1 bg-black">
          {/* Header */}
          <View className="absolute top-0 left-0 right-0 z-10 pt-14 px-4 pb-4 bg-gradient-to-b from-black/80 to-transparent">
            <View className="flex-row items-center justify-between">
              <TouchableOpacity
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setRecordViewerVisible(false);
                  setSelectedRecord(null);
                  setSelectedRecordVideo(null);
                  spotify.pauseForSwipe().catch(() => {});
                }}
                className="w-10 h-10 rounded-full bg-zinc-900/80 items-center justify-center"
              >
                <X size={20} color="#fff" />
              </TouchableOpacity>
              <View className="flex-1 mx-4">
                <View className="flex-row items-center justify-center gap-2">
                  <Trophy size={16} color="#F97316" />
                  <Text className="text-fire-orange font-bold text-sm text-center uppercase">
                    Récord Personal
                  </Text>
                </View>
                <Text className="text-white font-bold text-center mt-1" numberOfLines={1}>
                  {selectedRecord?.exercise_name}
                </Text>
                <Text className="text-fire-orange text-xs text-center font-mono mt-0.5">
                  {selectedRecord?.weight_kg}kg × {selectedRecord?.reps}{' '}
                  {selectedRecord?.reps === 1 ? '(1RM)' : 'reps'}
                </Text>
              </View>
              <View className="w-10" />
            </View>
          </View>

          {/* Video Player */}
          <TouchableOpacity
            activeOpacity={1}
            onPress={handleRecordVideoTap}
            className="flex-1 items-center justify-center"
          >
            {selectedRecordVideo?.video_url && (
              <VideoView
                player={recordVideoPlayer}
                style={{ width: screenWidth, height: screenWidth * (16 / 9) }}
                contentFit="contain"
                nativeControls={false}
              />
            )}
            {/* Icono de Play cuando está pausado */}
            {isRecordVideoManuallyPaused && (
              <View className="absolute inset-0 items-center justify-center">
                <View className="w-20 h-20 rounded-full bg-black/50 items-center justify-center">
                  <Play size={40} color="#FFFFFF" fill="#FFFFFF" />
                </View>
              </View>
            )}
          </TouchableOpacity>

          {/* Footer con Spotify info + Quitar de Records */}
          <View className="absolute bottom-0 left-0 right-0 pb-10 px-4 pt-4 bg-gradient-to-t from-black to-transparent">
            {/* Spotify Info */}
            {selectedRecordVideo?.spotify?.enabled && (
              <TouchableOpacity
                onPress={async () => {
                  if (spotifyPremium) {
                    const trackUri = (selectedRecordVideo.spotify as any).trackUri;
                    const positionMs = (selectedRecordVideo.spotify as any).positionMs || 0;
                    if (trackUri) {
                      await spotify.syncWithVideo(trackUri, positionMs);
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    }
                  } else {
                    Alert.alert(
                      '🎵 Spotify',
                      'Conecta Spotify Premium para escuchar la música con la que se grabó este levantamiento.',
                      [{ text: 'ENTENDIDO', style: 'default' }]
                    );
                  }
                }}
                className="flex-row items-center gap-2 bg-zinc-900/80 rounded-lg px-3 py-2 mb-4"
              >
                <Music size={16} color="#1DB954" />
                <View className="flex-1">
                  <Text className="text-white text-xs font-bold" numberOfLines={1}>
                    {selectedRecordVideo.spotify.trackName}
                  </Text>
                  <Text className="text-zinc-400 text-[10px]" numberOfLines={1}>
                    {selectedRecordVideo.spotify.artist}
                  </Text>
                </View>
                {spotifyPremium ? (
                  <Volume2 size={16} color="#1DB954" />
                ) : (
                  <Lock size={14} color="#71717a" />
                )}
              </TouchableOpacity>
            )}

            {/* Botón Quitar de Records */}
            <TouchableOpacity
              onPress={() => selectedRecord && handleRemoveRecord(selectedRecord.id)}
              className="flex-row items-center justify-center gap-2 py-4 bg-zinc-900/80 rounded-xl border border-zinc-800"
            >
              <Trophy size={18} color="#EF4444" />
              <Text className="text-red-400 font-bold uppercase tracking-widest text-sm">
                Quitar de Records
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* MODAL: Cuenta / Perfil / Suscripción */}
      <AccountModal
        visible={editProfileVisible}
        onClose={() => setEditProfileVisible(false)}
        profile={profile}
        onProfileSaved={() => {
          setEditProfileVisible(false);
          fetchData();
        }}
      />
    </View>
  );
}

export default function AdnScreen() {
  return (
    <PWAGuard moduleName="ADN">
      <AdnScreenContent />
    </PWAGuard>
  );
}
