import React, { useState, useEffect, useCallback, useRef, memo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  FlatList,
  ViewToken,
  RefreshControl,
  ScrollView,
  useWindowDimensions,
  AppState,
  Platform,
  Modal,
} from 'react-native';
import { PWAGuard } from '../../../components/auth/PWAGuard';
import { Alert } from '../../../lib/alert';
import { useFocusEffect, router } from 'expo-router';
import { Lock } from 'lucide-react-native';
import { Image } from 'expo-image';
import {
  Heart,
  MessageCircle,
  Share2,
  Music,
  Bookmark,
  Play,
  Volume2,
  VolumeX,
  ListVideo,
  PlusCircle,
  CheckCircle,
  Dumbbell,
  X,
} from 'lucide-react-native';
import * as Haptics from '../../../lib/haptics';
import { VideoView, useVideoPlayer } from 'expo-video';
import { Audio } from 'expo-av';
import { LinearGradient } from 'expo-linear-gradient';
import { supabase } from '../../../lib/supabase';
import { useUserRoleContext } from '../../../context/UserRoleContext';
import { useHank } from '../../../context/HankContext';
import spotify from '../../../services/spotify/spotify';
import { spotifyModalEvent, SpotifyNowPlaying } from '../../../lib/spotifyModalEvent';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// ============================================================================
// TIPOS
// ============================================================================
type FeedSource = 'pro_video' | 'instagram_reel';

interface FeedVideo {
  id: string;
  user_id: string;
  video_url: string;
  thumbnail_url: string;
  media_type?: 'video' | 'photo';
  exercise_name: string | null;
  weight_kg: number | null;
  reps: number | null;
  free_text: string | null;
  spotify: {
    enabled: boolean;
    trackUri?: string;
    trackName?: string;
    artist?: string;
    albumArt?: string;
    positionMs?: number;
  } | null;
  created_at: string;
  // Usuario
  user_display_name: string;
  user_avatar_url: string | null;
  // Métricas
  likes_count: number;
  comments_count: number;
  is_liked: boolean;
  is_saved: boolean;
  // Fuente del video
  source: FeedSource;
  ig_permalink?: string | null;
  is_official?: boolean;
}

// ============================================================================
// TRAINING CHIP TYPES
// ============================================================================
interface TrainingExerciseAlternative {
  id: string;
  name: string;
  image_url: string;
}

interface TrainingExercise {
  id: string;
  exercise_id: string;
  name: string;
  image_url: string;
  sets: string;
  series: { type: string; reps: number | string; weight?: number | string }[];
  alternatives: TrainingExerciseAlternative[];
}

// Series type colors (same as GYM module)
const SERIES_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  CALENTAMIENTO: { bg: '#1e3a5f', text: '#60a5fa', label: 'C' },
  APROXIMACION: { bg: '#422006', text: '#fbbf24', label: 'A' },
  EFECTIVA: { bg: '#052e16', text: '#4ade80', label: 'E' },
  FALLO: { bg: '#450a0a', text: '#f87171', label: 'F' },
  WARMUP: { bg: '#1e3a5f', text: '#60a5fa', label: 'C' },
  FEEDER: { bg: '#422006', text: '#fbbf24', label: 'A' },
  EFFECTIVE: { bg: '#052e16', text: '#4ade80', label: 'E' },
  INTENSITY: { bg: '#450a0a', text: '#f87171', label: 'I' },
};

// ============================================================================
// TRAINING DAY CHIP COMPONENT
// ============================================================================
const TrainingDayChip = memo(({ userId }: { userId: string | undefined }) => {
  const [trainingDays, setTrainingDays] = useState<{ name: string; index: number }[]>([]);
  const [currentDayIdx, setCurrentDayIdx] = useState(0);
  const [selectedDayIdx, setSelectedDayIdx] = useState(0);
  const [exercises, setExercises] = useState<TrainingExercise[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [loadingExercises, setLoadingExercises] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [activeAlternatives, setActiveAlternatives] = useState<Record<string, number>>({});

  // Fetch training days (called on mount + when refreshKey changes)
  const fetchTrainingDays = useCallback(async () => {
    if (!userId) return;
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('training_current_day, training_frequency, training_routine_names')
        .eq('id', userId)
        .single();

      if (!profile || !profile.training_frequency) return;

      const freq = profile.training_frequency;
      const names = profile.training_routine_names || {};
      const days = Array.from({ length: freq }, (_, i) => ({
        name: names[String(i)] || `DÍA ${i + 1}`,
        index: i,
      }));

      setTrainingDays(days);
      const current = profile.training_current_day || 0;
      setCurrentDayIdx(current);
      setSelectedDayIdx(current);
    } catch (e) {
      console.error('TrainingChip fetch error:', e);
    }
  }, [userId]);

  // Initial fetch + refetch on refreshKey
  useEffect(() => {
    fetchTrainingDays();
  }, [fetchTrainingDays, refreshKey]);

  // Subscribe to Supabase realtime changes on profiles and user_exercise_config
  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel('training-chip-sync')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'profiles',
          filter: `id=eq.${userId}`,
        },
        () => {
          // Profile changed (frequency, routine names, current day)
          setRefreshKey((k) => k + 1);
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_exercise_config',
          filter: `user_id=eq.${userId}`,
        },
        () => {
          // Exercises changed (added, removed, reordered, config changed)
          // Reload exercises for the currently selected day
          if (modalVisible) {
            loadDayExercises(selectedDayIdx);
          }
          setRefreshKey((k) => k + 1);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, modalVisible, selectedDayIdx]);

  // Load exercises for a day (including alternatives)
  const loadDayExercises = useCallback(
    async (dayIdx: number) => {
      if (!userId) return;
      setLoadingExercises(true);
      try {
        const { data: configs } = await supabase
          .from('user_exercise_config')
          .select(
            `id, exercise_id, training_days, display_order, config, custom_media_url,
            exercises (id, name, default_media_url, thumbnail_url, alternatives)`
          )
          .eq('user_id', userId)
          .order('display_order', { ascending: true });

        // Load persistent media
        const exerciseIds = configs?.map((c: any) => c.exercise_id) || [];
        let mediaMap: Record<string, string> = {};
        if (exerciseIds.length > 0) {
          const { data: media } = await supabase
            .from('user_exercise_media')
            .select('exercise_id, custom_media_url')
            .eq('user_id', userId)
            .in('exercise_id', exerciseIds);
          media?.forEach((m: any) => {
            if (m.custom_media_url) mediaMap[m.exercise_id] = m.custom_media_url;
          });
        }

        // Collect all alternative IDs across all exercises for this day
        const filteredConfigs = (configs || []).filter((c: any) =>
          c.training_days?.includes(dayIdx)
        );
        const allAltIds: string[] = [];
        filteredConfigs.forEach((c: any) => {
          const altIds = (c.exercises as any)?.alternatives || [];
          altIds.forEach((id: string) => {
            if (id && !allAltIds.includes(id)) allAltIds.push(id);
          });
        });

        // Fetch alternative exercise details in one batch
        let altMap: Record<string, { name: string; image_url: string }> = {};
        if (allAltIds.length > 0) {
          const { data: altData } = await supabase
            .from('exercises')
            .select('id, name, thumbnail_url, default_media_url')
            .in('id', allAltIds);

          // Also check for user custom media on alternatives
          const { data: altConfigs } = await supabase
            .from('user_exercise_config')
            .select('exercise_id, custom_media_url')
            .eq('user_id', userId)
            .in('exercise_id', allAltIds)
            .not('custom_media_url', 'is', null);

          const altCustomMedia: Record<string, string> = {};
          altConfigs?.forEach((ac: any) => {
            if (ac.custom_media_url) altCustomMedia[ac.exercise_id] = ac.custom_media_url;
          });

          // Also check user_exercise_media for persistent media
          const { data: altMedia } = await supabase
            .from('user_exercise_media')
            .select('exercise_id, custom_media_url')
            .eq('user_id', userId)
            .in('exercise_id', allAltIds);
          altMedia?.forEach((am: any) => {
            if (am.custom_media_url && !altCustomMedia[am.exercise_id]) {
              altCustomMedia[am.exercise_id] = am.custom_media_url;
            }
          });

          altData?.forEach((a: any) => {
            altMap[a.id] = {
              name: a.name,
              image_url: altCustomMedia[a.id] || a.default_media_url || a.thumbnail_url || '',
            };
          });
        }

        const dayExercises: TrainingExercise[] = filteredConfigs.map((c: any) => {
          const ex = c.exercises as any;
          const seriesByDay =
            c.config?.series_by_day?.[String(dayIdx)] || c.config?.custom_series || [];
          const altIds: string[] = ex?.alternatives || [];
          const alternatives: TrainingExerciseAlternative[] = altIds
            .filter((id: string) => altMap[id])
            .map((id: string) => ({
              id,
              name: altMap[id].name,
              image_url: altMap[id].image_url,
            }));

          return {
            id: c.id,
            exercise_id: c.exercise_id,
            name: ex?.name || 'Sin nombre',
            image_url:
              c.custom_media_url ||
              mediaMap[c.exercise_id] ||
              ex?.default_media_url ||
              ex?.thumbnail_url ||
              '',
            sets: c.config?.sets || '4x10',
            series: seriesByDay.map((s: any) => ({
              type: s.type || 'EFECTIVA',
              reps: s.reps || 0,
              weight: s.weight || 0,
            })),
            alternatives,
          };
        });

        setExercises(dayExercises);
      } catch (e) {
        console.error('Load exercises error:', e);
      } finally {
        setLoadingExercises(false);
      }
    },
    [userId]
  );

  // Open modal and load current day exercises (always fresh)
  const handleOpenModal = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    fetchTrainingDays(); // Refresh day names in case they changed
    setModalVisible(true);
    loadDayExercises(selectedDayIdx);
  }, [selectedDayIdx, loadDayExercises, fetchTrainingDays]);

  // Select a day inside the modal → save as current day to Supabase
  const handleSelectDay = useCallback(
    async (dayIdx: number) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setSelectedDayIdx(dayIdx);
      setCurrentDayIdx(dayIdx); // Update locally immediately
      setActiveAlternatives({}); // Reset alternative scroll positions
      loadDayExercises(dayIdx);

      // Persist to Supabase so GYM module picks it up
      if (userId) {
        try {
          await supabase
            .from('profiles')
            .update({
              training_current_day: dayIdx,
              training_last_access: new Date().toISOString(),
            })
            .eq('id', userId);
        } catch (e) {
          console.error('Save training day error:', e);
        }
      }
    },
    [loadDayExercises, userId]
  );

  if (trainingDays.length === 0) return null;

  const day = trainingDays[selectedDayIdx];
  const isCurrentDay = selectedDayIdx === currentDayIdx;

  return (
    <>
      {/* Purple training chip - simple press to open */}
      <TouchableOpacity
        onPress={handleOpenModal}
        activeOpacity={0.7}
        className="self-end mt-1 flex-row items-center rounded-full px-3 py-1.5"
        style={{
          backgroundColor: isCurrentDay ? 'rgba(147, 51, 234, 0.15)' : 'rgba(255, 255, 255, 0.06)',
          borderWidth: 1,
          borderColor: isCurrentDay ? '#9333ea' : 'rgba(255, 255, 255, 0.12)',
          maxWidth: 220,
        }}
      >
        <Dumbbell size={12} color={isCurrentDay ? '#a855f7' : '#71717a'} />
        <Text
          numberOfLines={1}
          className={`ml-1.5 text-xs font-bold ${
            isCurrentDay ? 'text-purple-400' : 'text-zinc-500'
          }`}
        >
          {day?.name || 'REST'}
        </Text>
      </TouchableOpacity>

      {/* Exercises Modal */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setModalVisible(false)}
      >
        <View className="flex-1" style={{ backgroundColor: 'rgba(0,0,0,0.75)' }}>
          {/* Backdrop press to close */}
          <TouchableOpacity
            activeOpacity={1}
            onPress={() => setModalVisible(false)}
            className="flex-1"
          />

          {/* Modal content - anchored to center-bottom area */}
          <View
            className="mx-4 mb-8 rounded-2xl overflow-hidden"
            style={{
              backgroundColor: 'rgba(24, 24, 27, 0.96)',
              borderWidth: 1,
              borderColor: 'rgba(147, 51, 234, 0.3)',
              maxHeight: '70%',
            }}
          >
            {/* Modal Header */}
            <View className="flex-row items-center justify-between px-4 pt-4 pb-2">
              <View className="flex-row items-center">
                <View
                  className="w-8 h-8 rounded-lg items-center justify-center mr-3"
                  style={{ backgroundColor: 'rgba(147, 51, 234, 0.2)' }}
                >
                  <Dumbbell size={16} color="#a855f7" />
                </View>
                <Text className="text-white font-bold text-base">ENTRENAMIENTO</Text>
              </View>
              <TouchableOpacity
                onPress={() => setModalVisible(false)}
                className="w-8 h-8 rounded-full items-center justify-center"
                style={{ backgroundColor: 'rgba(255,255,255,0.08)' }}
              >
                <X size={16} color="#71717a" />
              </TouchableOpacity>
            </View>

            {/* Day selector chips - horizontal scroll */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              className="px-4 py-2"
              contentContainerStyle={{ gap: 8 }}
            >
              {trainingDays.map((d) => {
                const isSelected = d.index === selectedDayIdx;
                const isCurrent = d.index === currentDayIdx;
                return (
                  <TouchableOpacity
                    key={d.index}
                    onPress={() => handleSelectDay(d.index)}
                    activeOpacity={0.7}
                    className="rounded-full px-3 py-1.5 flex-row items-center"
                    style={{
                      backgroundColor: isSelected
                        ? 'rgba(147, 51, 234, 0.25)'
                        : 'rgba(255, 255, 255, 0.06)',
                      borderWidth: 1,
                      borderColor: isSelected
                        ? '#9333ea'
                        : isCurrent
                          ? 'rgba(147, 51, 234, 0.3)'
                          : 'rgba(255, 255, 255, 0.08)',
                    }}
                  >
                    {isCurrent && (
                      <View
                        className="w-1.5 h-1.5 rounded-full mr-1.5"
                        style={{ backgroundColor: '#a855f7' }}
                      />
                    )}
                    <Text
                      numberOfLines={1}
                      className="text-xs font-bold"
                      style={{
                        color: isSelected ? '#c084fc' : isCurrent ? '#a855f7' : '#71717a',
                        maxWidth: 120,
                      }}
                    >
                      {d.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Day info subtitle */}
            <View className="px-4 pb-2">
              <Text className="text-zinc-500 text-xs font-mono">
                DÍA {selectedDayIdx + 1} • {exercises.length} ejercicios
                {selectedDayIdx === currentDayIdx ? ' • HOY' : ''}
              </Text>
            </View>

            {/* Divider */}
            <View className="h-px mx-4" style={{ backgroundColor: 'rgba(147, 51, 234, 0.15)' }} />

            {/* Exercises list */}
            {loadingExercises ? (
              <View className="py-12 items-center">
                <ActivityIndicator size="small" color="#a855f7" />
              </View>
            ) : exercises.length === 0 ? (
              <View className="py-12 items-center">
                <Dumbbell size={32} color="#3f3f46" />
                <Text className="text-zinc-500 text-sm mt-3">Sin ejercicios asignados</Text>
              </View>
            ) : (
              <ScrollView className="px-4 py-3" showsVerticalScrollIndicator={false}>
                {exercises.map((ex, idx) => {
                  // Build variations array: main + alternatives
                  const allVariations = [
                    { id: ex.exercise_id, name: ex.name, image_url: ex.image_url, isMain: true },
                    ...ex.alternatives.map((alt) => ({
                      id: alt.id,
                      name: alt.name,
                      image_url: alt.image_url,
                      isMain: false,
                    })),
                  ];
                  const hasAlternatives = allVariations.length > 1;
                  const activeAltIdx = activeAlternatives[ex.id] || 0;
                  const safeIdx = Math.min(activeAltIdx, allVariations.length - 1);
                  const currentVariation = allVariations[safeIdx];

                  return (
                    <View
                      key={ex.id}
                      className="mb-3 rounded-xl overflow-hidden"
                      style={{
                        backgroundColor: 'rgba(255, 255, 255, 0.04)',
                        borderWidth: 1,
                        borderColor: hasAlternatives
                          ? 'rgba(251, 146, 60, 0.15)'
                          : 'rgba(255, 255, 255, 0.06)',
                      }}
                    >
                      {/* Horizontal scroll for alternatives */}
                      {hasAlternatives ? (
                        <View>
                          <ScrollView
                            horizontal
                            pagingEnabled
                            showsHorizontalScrollIndicator={false}
                            scrollEventThrottle={16}
                            onMomentumScrollEnd={(event) => {
                              const cardWidth = event.nativeEvent.layoutMeasurement.width;
                              const newIdx = Math.round(
                                event.nativeEvent.contentOffset.x / cardWidth
                              );
                              if (newIdx !== safeIdx) {
                                setActiveAlternatives((prev) => ({
                                  ...prev,
                                  [ex.id]: newIdx,
                                }));
                                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                              }
                            }}
                          >
                            {allVariations.map((variation, vIdx) => (
                              <View
                                key={variation.id}
                                className="flex-row items-center"
                                style={{ width: '100%' }}
                              >
                                {/* Thumbnail */}
                                <View className="w-16 h-16">
                                  {variation.image_url ? (
                                    <Image
                                      source={{ uri: variation.image_url }}
                                      className="w-full h-full"
                                      contentFit="cover"
                                    />
                                  ) : (
                                    <View className="w-full h-full bg-zinc-800 items-center justify-center">
                                      <Dumbbell size={20} color="#3f3f46" />
                                    </View>
                                  )}
                                </View>

                                {/* Exercise info */}
                                <View className="flex-1 px-3 py-2">
                                  <View className="flex-row items-center">
                                    <Text
                                      className="text-white font-bold text-sm flex-1"
                                      numberOfLines={1}
                                    >
                                      {idx + 1}. {variation.name}
                                    </Text>
                                  </View>

                                  {!variation.isMain && (
                                    <View className="flex-row items-center mt-0.5">
                                      <View className="w-1.5 h-1.5 bg-orange-400 rounded-full mr-1" />
                                      <Text
                                        className="font-bold uppercase"
                                        style={{
                                          color: '#fb923c',
                                          fontSize: 8,
                                          letterSpacing: 1,
                                        }}
                                      >
                                        Alternativa
                                      </Text>
                                    </View>
                                  )}

                                  {/* Sets summary */}
                                  <Text className="text-zinc-500 text-xs font-mono mt-0.5">
                                    {ex.sets}
                                  </Text>

                                  {/* Series pills */}
                                  {ex.series.length > 0 && (
                                    <View className="flex-row flex-wrap mt-1.5 gap-1">
                                      {ex.series.map((s, sIdx) => {
                                        const color =
                                          SERIES_COLORS[s.type] || SERIES_COLORS.EFECTIVA;
                                        return (
                                          <View
                                            key={sIdx}
                                            className="flex-row items-center rounded-md px-1.5 py-0.5"
                                            style={{ backgroundColor: color.bg }}
                                          >
                                            <Text
                                              className="font-bold mr-0.5"
                                              style={{ color: color.text, fontSize: 9 }}
                                            >
                                              {color.label}
                                            </Text>
                                            <Text
                                              className="font-mono"
                                              style={{ color: color.text, fontSize: 9 }}
                                            >
                                              {s.reps}r{s.weight ? ` ${s.weight}kg` : ''}
                                            </Text>
                                          </View>
                                        );
                                      })}
                                    </View>
                                  )}
                                </View>
                              </View>
                            ))}
                          </ScrollView>

                          {/* Dot indicators */}
                          <View className="flex-row items-center justify-center py-1.5 gap-1">
                            {allVariations.map((_, dotIdx) => (
                              <View
                                key={dotIdx}
                                className="rounded-full"
                                style={{
                                  width: dotIdx === safeIdx ? 16 : 5,
                                  height: 5,
                                  backgroundColor:
                                    dotIdx === safeIdx ? '#fb923c' : 'rgba(255, 255, 255, 0.2)',
                                }}
                              />
                            ))}
                          </View>
                        </View>
                      ) : (
                        /* Single exercise - no alternatives */
                        <View className="flex-row items-center">
                          {/* Thumbnail */}
                          <View className="w-16 h-16">
                            {ex.image_url ? (
                              <Image
                                source={{ uri: ex.image_url }}
                                className="w-full h-full"
                                contentFit="cover"
                              />
                            ) : (
                              <View className="w-full h-full bg-zinc-800 items-center justify-center">
                                <Dumbbell size={20} color="#3f3f46" />
                              </View>
                            )}
                          </View>

                          {/* Exercise info */}
                          <View className="flex-1 px-3 py-2">
                            <Text className="text-white font-bold text-sm" numberOfLines={1}>
                              {idx + 1}. {ex.name}
                            </Text>

                            {/* Sets summary */}
                            <Text className="text-zinc-500 text-xs font-mono mt-0.5">
                              {ex.sets}
                            </Text>

                            {/* Series pills */}
                            {ex.series.length > 0 && (
                              <View className="flex-row flex-wrap mt-1.5 gap-1">
                                {ex.series.map((s, sIdx) => {
                                  const color = SERIES_COLORS[s.type] || SERIES_COLORS.EFECTIVA;
                                  return (
                                    <View
                                      key={sIdx}
                                      className="flex-row items-center rounded-md px-1.5 py-0.5"
                                      style={{ backgroundColor: color.bg }}
                                    >
                                      <Text
                                        className="font-bold mr-0.5"
                                        style={{ color: color.text, fontSize: 9 }}
                                      >
                                        {color.label}
                                      </Text>
                                      <Text
                                        className="font-mono"
                                        style={{ color: color.text, fontSize: 9 }}
                                      >
                                        {s.reps}r{s.weight ? ` ${s.weight}kg` : ''}
                                      </Text>
                                    </View>
                                  );
                                })}
                              </View>
                            )}
                          </View>
                        </View>
                      )}
                    </View>
                  );
                })}
                <View className="h-4" />
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </>
  );
});

// ============================================================================
// DIMENSIONS - Se calculan dinámicamente en cada componente con hooks
// para adaptarse a PWA iPhone (notch, Dynamic Island, rotación)
// ============================================================================

// ============================================================================
// VIDEO ITEM COMPONENT (Memoizado para performance)
// ============================================================================
const FeedVideoItem = memo(
  ({
    item,
    isActive,
    onLike,
    onComment,
    onShare,
    onSave,
    onUserPress,
    spotifyPremium,
    spotifyConnected,
    isPro,
    onSpotifyToggle,
    isMuted,
    autoScrollEnabled,
    onVideoEnd,
    contextReady,
    videoHeight,
    screenWidth,
    savedTrackIds,
    onToggleSaveTrack,
    currentPlayingTrackUri,
    spotifyPlayingFromFeed,
  }: {
    item: FeedVideo;
    isActive: boolean;
    onLike: (videoId: string) => void;
    onComment: (videoId: string) => void;
    onShare: (video: FeedVideo) => void;
    onSave: (videoId: string) => void;
    onUserPress: (userId: string) => void;
    spotifyPremium: boolean;
    spotifyConnected: boolean;
    isPro: boolean;
    onSpotifyToggle: (trackUri: string) => void;
    isMuted: boolean;
    autoScrollEnabled: boolean;
    onVideoEnd: () => void;
    contextReady: boolean;
    videoHeight: number;
    screenWidth: number;
    savedTrackIds: Set<string>;
    onToggleSaveTrack: (trackId: string) => void;
    currentPlayingTrackUri: string | null;
    spotifyPlayingFromFeed: boolean;
  }) => {
    // Helper: Arreglar URLs de Cloudflare Stream incompletas
    const fixCloudflareUrl = (url: string): string => {
      if (!url) return url;
      // Si es una URL de Cloudflare Stream y no tiene el path HLS, agregarlo
      if (url.includes('cloudflarestream.com') && !url.includes('/manifest/')) {
        return `${url}/manifest/video.m3u8`;
      }
      return url;
    };

    const videoUrl = fixCloudflareUrl(item.video_url);

    // =====================================================================
    // AUDIO: Controlado por botón MUTE global del feed
    // =====================================================================

    // El video se mutea según el toggle global del usuario
    const shouldMuteVideo = isMuted;

    // Debug log
    console.log('🎵 Feed Audio State:', {
      videoId: item.id.substring(0, 8),
      state: isMuted ? '🔇 MUTED' : '🔊 AUDIO ON',
      isMuted,
    });

    // Para fotos, no hay loading de video
    const [isVideoLoading, setIsVideoLoading] = useState(item.media_type !== 'photo');
    const [videoError, setVideoError] = useState<string | null>(null);
    const [isManuallyPaused, setIsManuallyPaused] = useState(false);
    const [isTextExpanded, setIsTextExpanded] = useState(false);
    const hasBeenReady = useRef(item.media_type === 'photo'); // Para fotos ya está listo

    const player = useVideoPlayer(videoUrl, (p) => {
      // Si autoscroll activo → no loop, el video termina y avanza
      p.loop = !autoScrollEnabled;
      p.muted = shouldMuteVideo;
    });

    // Detectar cuando el video está listo o tiene error
    useEffect(() => {
      if (player) {
        // Listener para el estado del player
        const statusSub = player.addListener('statusChange', (statusEvent: any) => {
          const status = typeof statusEvent === 'string' ? statusEvent : statusEvent?.status;

          if (status === 'readyToPlay') {
            hasBeenReady.current = true;
            setIsVideoLoading(false);
            setVideoError(null);
          } else if (status === 'error') {
            setIsVideoLoading(false);
            setVideoError('Error al cargar video');
            console.error('🎥 FEED Player error:', item.id);
          }
          // NO volvemos a loading si ya estuvo ready
        });

        // Check inicial por duration
        if (player.duration > 0) {
          hasBeenReady.current = true;
          setIsVideoLoading(false);
        }

        return () => {
          statusSub.remove();
        };
      }
    }, [player, videoUrl]);

    // Autoscroll: detectar cuando el video termina para avanzar al siguiente
    useEffect(() => {
      if (!player || !isActive || !autoScrollEnabled) return;

      const endSub = player.addListener('playToEnd', () => {
        console.log('⏭️ Video terminó, avanzando al siguiente...');
        onVideoEnd();
      });

      return () => {
        endSub.remove();
      };
    }, [player, isActive, autoScrollEnabled, onVideoEnd]);

    // Actualizar loop cuando cambia autoScrollEnabled
    useEffect(() => {
      player.loop = !autoScrollEnabled;
    }, [player, autoScrollEnabled]);

    // Control de reproducción basado en isActive
    useEffect(() => {
      // Video mute controlado por toggle global
      player.muted = shouldMuteVideo;

      if (isActive && !isManuallyPaused) {
        player.play();
      } else if (!isActive) {
        player.pause();
        setIsManuallyPaused(false);
      }
    }, [isActive, player, shouldMuteVideo]);

    // Handler para tap en el video (pausar/reanudar solo video, NO Spotify)
    const handleVideoTap = useCallback(() => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setIsManuallyPaused((prev) => {
        const newPaused = !prev;
        if (newPaused) {
          player.pause();
        } else {
          player.play();
        }
        return newPaused;
      });
    }, [player]);

    const formatDate = (dateStr: string) => {
      const date = new Date(dateStr);
      const now = new Date();
      const diff = now.getTime() - date.getTime();
      const hours = Math.floor(diff / (1000 * 60 * 60));
      const days = Math.floor(hours / 24);

      if (hours < 1) return 'Ahora';
      if (hours < 24) return `${hours}h`;
      if (days < 7) return `${days}d`;
      return date.toLocaleDateString('es', { day: '2-digit', month: 'short' });
    };

    return (
      <View style={{ width: screenWidth, height: videoHeight }} className="bg-black">
        {/* Photo or Video */}
        {item.media_type === 'photo' ? (
          <Image
            source={{ uri: item.video_url || item.thumbnail_url }}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: screenWidth,
              height: videoHeight,
            }}
            contentFit="cover"
          />
        ) : (
          <VideoView
            player={player}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: screenWidth,
              height: videoHeight,
            }}
            contentFit="cover"
            nativeControls={false}
          />
        )}

        {/* Tap zone para pausar/reanudar video (solo para videos) */}
        {item.media_type !== 'photo' && (
          <TouchableOpacity
            activeOpacity={1}
            onPress={handleVideoTap}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: screenWidth,
              height: videoHeight,
              zIndex: 1,
            }}
          >
            {/* Icono de Play cuando está pausado manualmente */}
            {isManuallyPaused && (
              <View className="absolute inset-0 items-center justify-center">
                <View className="w-20 h-20 rounded-full bg-black/50 items-center justify-center">
                  <Play size={40} color="#FFFFFF" fill="#FFFFFF" />
                </View>
              </View>
            )}
          </TouchableOpacity>
        )}

        {/* Thumbnail como fondo mientras carga (solo videos) */}
        {item.media_type !== 'photo' && item.thumbnail_url && isVideoLoading && (
          <Image
            source={{ uri: item.thumbnail_url }}
            style={{ position: 'absolute', width: '100%', height: '100%', zIndex: 1 }}
            contentFit="cover"
          />
        )}

        {/* Loading indicator mientras carga el video (solo videos) */}
        {item.media_type !== 'photo' && isVideoLoading && !videoError && (
          <View
            className="absolute inset-0 justify-center items-center bg-black/50"
            style={{ zIndex: 2 }}
          >
            <ActivityIndicator size="large" color="#DC2626" />
            <Text className="text-zinc-400 text-sm mt-2">Cargando video...</Text>
          </View>
        )}

        {/* Error indicator */}
        {videoError && (
          <View
            className="absolute inset-0 justify-center items-center bg-black/80"
            style={{ zIndex: 2 }}
          >
            <Text className="text-red-500 text-lg font-bold">⚠️</Text>
            <Text className="text-zinc-400 text-sm mt-2">{videoError}</Text>
            <Text className="text-zinc-600 text-xs mt-1">URL: {videoUrl?.substring(0, 50)}...</Text>
          </View>
        )}

        {/* Gradiente inferior */}
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.8)']}
          className="absolute bottom-0 left-0 right-0 h-64"
          style={{ zIndex: 2 }}
          pointerEvents="none"
        />

        {/* Info del usuario y video */}
        <View className="absolute bottom-4 left-4 right-20" style={{ zIndex: 10 }}>
          {/* Usuario */}
          <TouchableOpacity
            onPress={() => {
              if (item.source === 'instagram_reel' && item.ig_permalink) {
                // Para Reels de IG, abrir el permalink en Instagram
                import('expo-web-browser').then((wb) => wb.openBrowserAsync(item.ig_permalink!));
              } else {
                onUserPress(item.user_id);
              }
            }}
            className="flex-row items-center mb-3"
          >
            <View
              className="w-10 h-10 rounded-full mr-3 overflow-hidden"
              style={
                item.is_official
                  ? {
                      backgroundColor: '#DC2626',
                      shadowColor: '#DC2626',
                      shadowOffset: { width: 0, height: 0 },
                      shadowOpacity: 0.8,
                      shadowRadius: 10,
                      elevation: 8,
                    }
                  : { backgroundColor: '#27272a' }
              }
            >
              {item.user_avatar_url ? (
                <Image
                  source={{ uri: item.user_avatar_url }}
                  style={{ width: 40, height: 40 }}
                  contentFit="cover"
                />
              ) : (
                <View className="w-full h-full items-center justify-center">
                  <Text
                    className="text-white font-bold"
                    style={item.is_official ? { fontSize: 11, letterSpacing: 1 } : {}}
                  >
                    {item.is_official ? 'T' : item.user_display_name.charAt(0)}
                  </Text>
                </View>
              )}
            </View>
            <View className="flex-1">
              <View className="flex-row items-center gap-1.5">
                <Text
                  className="text-white font-bold"
                  style={
                    item.is_official
                      ? {
                          textShadowColor: '#DC2626',
                          textShadowOffset: { width: 0, height: 0 },
                          textShadowRadius: 8,
                        }
                      : {}
                  }
                >
                  {item.user_display_name}
                </Text>
                {item.is_official && (
                  <View
                    className="px-1.5 py-0.5 rounded"
                    style={{ backgroundColor: 'rgba(220, 38, 38, 0.3)' }}
                  >
                    <Text className="text-red-500 text-[9px] font-bold tracking-wider">
                      OFICIAL
                    </Text>
                  </View>
                )}
                {item.source === 'instagram_reel' && !item.is_official && (
                  <View
                    className="px-1.5 py-0.5 rounded"
                    style={{ backgroundColor: 'rgba(225, 48, 108, 0.2)' }}
                  >
                    <Text className="text-pink-400 text-[9px] font-bold">IG</Text>
                  </View>
                )}
              </View>
              <Text className="text-zinc-500 text-xs">{formatDate(item.created_at)}</Text>
            </View>
          </TouchableOpacity>

          {/* Ejercicio y métricas - ED HARDY FIRE STYLE */}
          {item.exercise_name && (
            <View className="mb-2">
              <Text
                className="text-white text-lg font-bold"
                style={{
                  textShadowColor: '#F97316',
                  textShadowOffset: { width: 0, height: 0 },
                  textShadowRadius: 8,
                }}
              >
                {item.exercise_name}
              </Text>
              {(item.weight_kg || item.reps) && (
                <Text
                  className="text-fire-orange text-2xl font-bold font-mono"
                  style={{
                    textShadowColor: '#DC2626',
                    textShadowOffset: { width: 0, height: 0 },
                    textShadowRadius: 15,
                  }}
                >
                  {item.weight_kg ? `${item.weight_kg}kg` : ''}
                  {item.weight_kg && item.reps ? ' × ' : ''}
                  {item.reps ? `${item.reps}` : ''} 🔥
                </Text>
              )}
              {item.free_text && (
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={(e) => {
                    e.stopPropagation();
                    setIsTextExpanded((prev) => !prev);
                  }}
                >
                  {isTextExpanded ? (
                    <ScrollView
                      style={{ maxHeight: videoHeight * 0.4, marginTop: 4 }}
                      showsVerticalScrollIndicator={true}
                      nestedScrollEnabled
                    >
                      <Text className="text-zinc-300 text-sm">{item.free_text}</Text>
                    </ScrollView>
                  ) : (
                    <Text className="text-zinc-300 text-sm mt-1" numberOfLines={2}>
                      {item.free_text}
                    </Text>
                  )}
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* Texto libre (cuando NO hay ejercicio) */}
          {item.free_text && !item.exercise_name && (
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={(e) => {
                e.stopPropagation();
                setIsTextExpanded((prev) => !prev);
              }}
              className="mb-2"
            >
              {isTextExpanded ? (
                <ScrollView
                  style={{ maxHeight: videoHeight * 0.45 }}
                  showsVerticalScrollIndicator={true}
                  nestedScrollEnabled
                >
                  <Text className="text-white text-base">{item.free_text}</Text>
                </ScrollView>
              ) : (
                <Text className="text-white text-base" numberOfLines={2}>
                  {item.free_text}
                </Text>
              )}
            </TouchableOpacity>
          )}

          {/* Spotify info - play/pause toggle, save to liked, open Spotify */}
          {item.spotify?.enabled &&
            item.spotify?.trackUri &&
            (() => {
              const thisTrackUri = item.spotify.trackUri;
              const trackId = thisTrackUri?.split(':').pop() || '';
              const isThisPlaying =
                spotifyPlayingFromFeed && currentPlayingTrackUri === thisTrackUri;
              const isSaved = savedTrackIds.has(trackId);

              return (
                <View className="flex-row items-center self-start mt-1 gap-1.5">
                  {/* Song chip - play/pause toggle */}
                  <TouchableOpacity
                    onPress={() => {
                      if (spotifyConnected && thisTrackUri) {
                        onSpotifyToggle(thisTrackUri);
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      } else {
                        spotifyModalEvent.open();
                      }
                    }}
                    className="flex-row items-center rounded-full px-3 py-1.5"
                    style={{
                      backgroundColor: isThisPlaying
                        ? 'rgba(30, 215, 96, 0.15)'
                        : 'rgba(255, 255, 255, 0.08)',
                      borderWidth: 1,
                      borderColor: isThisPlaying ? '#1DB954' : 'rgba(255, 255, 255, 0.15)',
                      maxWidth: '70%',
                    }}
                  >
                    {/* Play/Pause icon */}
                    {isThisPlaying ? (
                      <View style={{ flexDirection: 'row', gap: 2, alignItems: 'center' }}>
                        <View
                          style={{
                            width: 3,
                            height: 12,
                            backgroundColor: '#1DB954',
                            borderRadius: 1,
                          }}
                        />
                        <View
                          style={{
                            width: 3,
                            height: 12,
                            backgroundColor: '#1DB954',
                            borderRadius: 1,
                          }}
                        />
                      </View>
                    ) : (
                      <Play size={14} color="#FFFFFF" fill="#FFFFFF" />
                    )}
                    {/* Album art */}
                    {item.spotify.albumArt ? (
                      <Image
                        source={{ uri: item.spotify.albumArt }}
                        style={{ width: 18, height: 18, borderRadius: 3, marginLeft: 6 }}
                      />
                    ) : (
                      <Music
                        size={14}
                        color={isThisPlaying ? '#1DB954' : '#FFFFFF'}
                        style={{ marginLeft: 6 }}
                      />
                    )}
                    <Text
                      className="text-xs ml-2 flex-shrink"
                      style={{ color: isThisPlaying ? '#1DB954' : '#FFFFFF' }}
                      numberOfLines={1}
                    >
                      {item.spotify.trackName} – {item.spotify.artist}
                    </Text>
                  </TouchableOpacity>

                  {/* Add/Remove from Spotify liked */}
                  <TouchableOpacity
                    onPress={() => {
                      if (!spotifyConnected) {
                        spotifyModalEvent.open();
                        return;
                      }
                      if (trackId) {
                        onToggleSaveTrack(trackId);
                      }
                    }}
                    className="w-8 h-8 rounded-full items-center justify-center"
                    style={{
                      backgroundColor: isSaved
                        ? 'rgba(30, 215, 96, 0.35)'
                        : 'rgba(30, 215, 96, 0.2)',
                      borderWidth: 1,
                      borderColor: isSaved ? '#1DB954' : 'rgba(30, 215, 96, 0.4)',
                    }}
                  >
                    {isSaved ? (
                      <CheckCircle size={16} color="#1DB954" />
                    ) : (
                      <PlusCircle size={16} color="#1DB954" />
                    )}
                  </TouchableOpacity>
                </View>
              );
            })()}
        </View>

        {/* Acciones laterales - ED HARDY FIRE GLOW */}
        <View className="absolute right-3 bottom-20 items-center gap-5" style={{ zIndex: 10 }}>
          {/* Like - Fire Heart */}
          <TouchableOpacity
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              onLike(item.id);
            }}
            className="items-center"
          >
            <View
              className={`w-12 h-12 rounded-full items-center justify-center`}
              style={
                item.is_liked
                  ? {
                      backgroundColor: '#DC2626',
                      shadowColor: '#DC2626',
                      shadowOffset: { width: 0, height: 0 },
                      shadowOpacity: 1,
                      shadowRadius: 15,
                      elevation: 10,
                    }
                  : {
                      backgroundColor: 'rgba(0,0,0,0.5)',
                      borderWidth: 1,
                      borderColor: 'rgba(249,115,22,0.3)',
                    }
              }
            >
              <Heart
                size={24}
                color={item.is_liked ? '#FFFFFF' : '#F97316'}
                fill={item.is_liked ? '#FFFFFF' : 'transparent'}
              />
            </View>
            <Text className="text-fire-orange text-xs mt-1 font-mono">{item.likes_count}</Text>
          </TouchableOpacity>

          {/* Comentar */}
          <TouchableOpacity
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onComment(item.id);
            }}
            className="items-center"
          >
            <View
              className="w-12 h-12 rounded-full items-center justify-center"
              style={{
                backgroundColor: 'rgba(0,0,0,0.5)',
                borderWidth: 1,
                borderColor: 'rgba(249,115,22,0.3)',
              }}
            >
              <MessageCircle size={24} color="#F97316" />
            </View>
            <Text className="text-zinc-400 text-xs mt-1 font-mono">{item.comments_count}</Text>
          </TouchableOpacity>

          {/* Guardar */}
          <TouchableOpacity
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onSave(item.id);
            }}
            className="items-center"
          >
            <View
              className={`w-12 h-12 rounded-full items-center justify-center`}
              style={
                item.is_saved
                  ? {
                      backgroundColor: '#F97316',
                      shadowColor: '#F97316',
                      shadowOffset: { width: 0, height: 0 },
                      shadowOpacity: 0.8,
                      shadowRadius: 10,
                    }
                  : {
                      backgroundColor: 'rgba(0,0,0,0.5)',
                      borderWidth: 1,
                      borderColor: 'rgba(249,115,22,0.3)',
                    }
              }
            >
              <Bookmark
                size={24}
                color={item.is_saved ? '#000000' : '#F97316'}
                fill={item.is_saved ? '#000000' : 'transparent'}
              />
            </View>
          </TouchableOpacity>

          {/* Compartir */}
          <TouchableOpacity
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onShare(item);
            }}
            className="items-center"
          >
            <View
              className="w-12 h-12 rounded-full items-center justify-center"
              style={{
                backgroundColor: 'rgba(0,0,0,0.5)',
                borderWidth: 1,
                borderColor: 'rgba(249,115,22,0.3)',
              }}
            >
              <Share2 size={24} color="#F97316" />
            </View>
          </TouchableOpacity>
        </View>
      </View>
    );
  }
);

// ============================================================================
// MAIN COMPONENT
// ============================================================================
function FeedScreenContent() {
  const insets = useSafeAreaInsets();
  const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = useWindowDimensions();

  // Altura exacta del video: desde borde superior de pantalla
  // hasta el borde superior de la tab bar (pixel-perfect, reactivo a PWA)
  const TAB_BAR_H = (Platform.OS === 'web' ? 70 : 56) + insets.bottom;
  const videoHeight = SCREEN_HEIGHT - TAB_BAR_H;

  const {
    user,
    spotifyPremium,
    spotifyConnected,
    isPro,
    loading: contextLoading,
  } = useUserRoleContext();
  const { setScreenContext } = useHank();

  const PAGE_SIZE = 15;
  const [videos, setVideos] = useState<FeedVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const offsetRef = useRef(0);
  const [activeIndex, setActiveIndex] = useState(0);
  // Estado para rastrear si el Feed está enfocado
  const [isFeedFocused, setIsFeedFocused] = useState(true);
  // Mute global del feed - iOS PWA no permite autoplay con audio,
  // Solo iOS PWA necesita empezar muteado para autoplay; Android web reproduce con audio
  const isIOSWeb =
    Platform.OS === 'web' &&
    typeof navigator !== 'undefined' &&
    /iPad|iPhone|iPod/.test(navigator.userAgent);
  const [isMuted, setIsMuted] = useState(isIOSWeb);
  // Spotify playing from feed chip
  const [spotifyPlayingFromFeed, setSpotifyPlayingFromFeed] = useState(false);
  const [currentPlayingTrackUri, setCurrentPlayingTrackUri] = useState<string | null>(null);
  // Track IDs already saved in user's Spotify library
  const [savedTrackIds, setSavedTrackIds] = useState<Set<string>>(new Set());
  // Autoscroll del feed (avanza cuando termina el video)
  const [autoScrollEnabled, setAutoScrollEnabled] = useState(false);
  // Now-playing track info (from modal or feed chip)
  const [nowPlayingTrack, setNowPlayingTrack] = useState<SpotifyNowPlaying | null>(null);

  const flatListRef = useRef<FlatList>(null);

  // -------------------------------------------------------------------------
  // TOGGLE MUTE - Also pauses Spotify when user unmutes video
  // -------------------------------------------------------------------------
  const handleToggleMute = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsMuted((prev) => {
      const newMuted = !prev;
      if (!newMuted) {
        // User unmuted video → pause Spotify and reset chip to "Spotify"
        if (spotifyPlayingFromFeed) {
          spotify.pause().catch(() => {});
          setSpotifyPlayingFromFeed(false);
        }
        setNowPlayingTrack(null);
      }
      return newMuted;
    });
  }, [spotifyPlayingFromFeed]);

  // -------------------------------------------------------------------------
  // TOGGLE AUTOSCROLL
  // -------------------------------------------------------------------------
  const handleToggleAutoScroll = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setAutoScrollEnabled((prev) => !prev);
  }, []);

  // -------------------------------------------------------------------------
  // AUTOSCROLL: Avanza al siguiente reel cuando el video actual termina
  // -------------------------------------------------------------------------
  const handleVideoEnd = useCallback(() => {
    if (!autoScrollEnabled) return;
    setActiveIndex((prev) => {
      const nextIndex = prev + 1 < videos.length ? prev + 1 : 0;
      flatListRef.current?.scrollToIndex({ index: nextIndex, animated: true });
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      return nextIndex;
    });
  }, [autoScrollEnabled, videos.length]);

  // -------------------------------------------------------------------------
  // HEADPHONE / MEDIA CONTROLS: next/prev track = next/prev reel
  // Use a real <audio> element (not just AudioContext) because browsers tie
  // the OS media-session to <audio>/<video> elements.  A looping silent
  // MP3 keeps the browser as the "active media app" so hardware media
  // buttons fire our handlers instead of Spotify's native app.
  // When the user leaves the Feed we pause + remove it → Spotify regains
  // the buttons.
  // -------------------------------------------------------------------------
  const silentAudioElRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    let isMounted = true;

    const setupAudioSession = async () => {
      try {
        if (Platform.OS === 'web') return;
        await Audio.setAudioModeAsync({
          staysActiveInBackground: false,
          playsInSilentModeIOS: true,
        });
      } catch (err) {
        console.warn('⚠️ Audio session setup error:', err);
      }
    };

    setupAudioSession();

    // Web: create a real <audio> element playing near-silent audio.
    // This makes the browser claim the OS media session robustly.
    // Data-URI = tiny valid MP3 of ~0.1 s silence (avoids network request).
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      try {
        const audio = document.createElement('audio');
        // Smallest valid MP3 frame - silence
        audio.src =
          'data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//tQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAABhgC7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7//////////////////////////////////////////////////////////////////8AAAAATGF2YzU4LjEzAAAAAAAAAAAAAAAAJAAAAAAAAAABhgIkdOAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';
        audio.loop = true;
        audio.volume = 0.01; // Near-silent but audible enough for OS
        audio.setAttribute('playsinline', 'true');
        // Play — must handle autoplay-policy by trying after user gesture
        const playPromise = audio.play();
        if (playPromise) {
          playPromise.catch(() => {
            // Autoplay blocked; retry on next user interaction
            const resume = () => {
              audio.play().catch(() => {});
              document.removeEventListener('touchstart', resume);
              document.removeEventListener('click', resume);
            };
            document.addEventListener('touchstart', resume, { once: true });
            document.addEventListener('click', resume, { once: true });
          });
        }
        silentAudioElRef.current = audio;
      } catch (err) {
        console.warn('⚠️ Silent audio element setup error:', err);
      }
    }

    // Web: MediaSession API handlers (Chrome, Edge, etc.)
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
      try {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: 'TRENS Feed',
          artist: 'TRENS',
        });
        navigator.mediaSession.playbackState = 'playing';

        navigator.mediaSession.setActionHandler('nexttrack', () => {
          if (!isMounted) return;
          setActiveIndex((prev) => {
            const nextIndex = prev + 1 < videos.length ? prev + 1 : 0;
            flatListRef.current?.scrollToIndex({ index: nextIndex, animated: true });
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            return nextIndex;
          });
        });

        navigator.mediaSession.setActionHandler('previoustrack', () => {
          if (!isMounted) return;
          setActiveIndex((prev) => {
            const prevIndex = prev - 1 >= 0 ? prev - 1 : videos.length - 1;
            flatListRef.current?.scrollToIndex({ index: prevIndex, animated: true });
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            return prevIndex;
          });
        });

        // Also claim play/pause to strengthen our session ownership
        navigator.mediaSession.setActionHandler('play', () => {
          silentAudioElRef.current?.play().catch(() => {});
          navigator.mediaSession.playbackState = 'playing';
        });
        navigator.mediaSession.setActionHandler('pause', () => {
          navigator.mediaSession.playbackState = 'paused';
        });
      } catch (err) {
        console.warn('⚠️ MediaSession setup error:', err);
      }
    }

    return () => {
      isMounted = false;
      // Remove silent audio → Spotify regains media buttons
      if (silentAudioElRef.current) {
        try {
          silentAudioElRef.current.pause();
          silentAudioElRef.current.src = '';
          silentAudioElRef.current.remove();
        } catch {}
        silentAudioElRef.current = null;
      }
      if (
        Platform.OS === 'web' &&
        typeof navigator !== 'undefined' &&
        'mediaSession' in navigator
      ) {
        try {
          navigator.mediaSession.playbackState = 'none';
          navigator.mediaSession.setActionHandler('nexttrack', null);
          navigator.mediaSession.setActionHandler('previoustrack', null);
          navigator.mediaSession.setActionHandler('play', null);
          navigator.mediaSession.setActionHandler('pause', null);
        } catch {}
      }
    };
  }, [videos.length]);

  // -------------------------------------------------------------------------
  // PAUSAR AL SALIR DEL FEED
  // -------------------------------------------------------------------------
  useFocusEffect(
    useCallback(() => {
      // Al entrar al Feed, marcar como enfocado
      setIsFeedFocused(true);

      // Sincronizar contexto con HANK
      setScreenContext({
        module: 'nucleo',
        viewMode: null,
        currentExerciseIndex: null,
        currentTrainingDay: 0,
      });

      // Fetch currently playing track for the header chip + warm up Spotify
      if (spotifyConnected) {
        // Warm up Spotify silenciosamente (deep link si es necesario)
        spotify.warmUp().catch(() => {});

        spotify
          .getPlaybackState()
          .then((playback) => {
            if (playback?.isPlaying && playback.track) {
              setNowPlayingTrack({
                trackName: playback.track.name,
                artist: playback.track.artist,
                trackUri: playback.track.uri,
              });
            }
          })
          .catch(() => {});
      }

      // Listener para refrescar playback al volver de Spotify
      let cleanup: (() => void) | undefined;
      if (spotifyConnected) {
        const refreshOnReturn = async () => {
          try {
            const playback = await spotify.getPlaybackState();
            if (playback?.isPlaying && playback.track) {
              // Spotify está reproduciendo → mutear el Feed
              setIsMuted(true);
              setNowPlayingTrack({
                trackName: playback.track.name,
                artist: playback.track.artist,
                trackUri: playback.track.uri,
              });
            } else {
              setNowPlayingTrack(null);
            }
          } catch {}
        };

        if (Platform.OS === 'web' && typeof document !== 'undefined') {
          const handleVisibility = () => {
            if (document.visibilityState === 'visible') refreshOnReturn();
          };
          document.addEventListener('visibilitychange', handleVisibility);
          cleanup = () => document.removeEventListener('visibilitychange', handleVisibility);
        } else {
          const sub = AppState.addEventListener('change', (state) => {
            if (state === 'active') refreshOnReturn();
          });
          cleanup = () => sub.remove();
        }
      }

      return () => {
        // Al salir del Feed, marcar como no enfocado (pausará videos)
        setIsFeedFocused(false);
        cleanup?.();
      };
    }, [spotifyConnected])
  );

  // -------------------------------------------------------------------------
  // FETCH FEED PAGE (RPC con scoring + paginación)
  // -------------------------------------------------------------------------
  const fetchFeedPage = useCallback(
    async (offset: number, isRefresh: boolean = false) => {
      try {
        if (!isRefresh && offset > 0) setLoadingMore(true);

        const { data, error } = await supabase.rpc('get_feed_page', {
          p_limit: PAGE_SIZE,
          p_offset: offset,
          p_user_id: user?.id || null,
        });

        if (error) throw error;

        const feedItems: FeedVideo[] = (data || []).map((item: any) => ({
          id: item.id,
          user_id: item.user_id,
          video_url: item.video_url,
          thumbnail_url: item.thumbnail_url || '',
          media_type: (item.media_type || 'video') as 'video' | 'photo',
          exercise_name: item.exercise_name,
          weight_kg: item.weight_kg,
          reps: item.reps,
          free_text: item.free_text,
          spotify: item.spotify || null,
          created_at: item.created_at,
          user_display_name: item.user_display_name || 'ATLETA',
          user_avatar_url: item.user_avatar_url || null,
          likes_count: item.likes_count || 0,
          comments_count: item.comments_count || 0,
          is_liked: item.is_liked || false,
          is_saved: item.is_saved || false,
          source: item.source as FeedSource,
          ig_permalink: item.ig_permalink,
          is_official: item.is_official || false,
        }));

        const total = data?.[0]?.total_count || 0;
        setHasMore(offset + PAGE_SIZE < total);

        if (isRefresh || offset === 0) {
          setVideos(feedItems);
          offsetRef.current = PAGE_SIZE;
        } else {
          // Deduplicar por id al agregar más páginas
          setVideos((prev) => {
            const existingIds = new Set(prev.map((v) => v.id));
            const newItems = feedItems.filter((v) => !existingIds.has(v.id));
            return [...prev, ...newItems];
          });
          offsetRef.current = offset + PAGE_SIZE;
        }
      } catch (err) {
        console.error('Error fetching feed:', err);
      } finally {
        setLoading(false);
        setLoadingMore(false);
        setRefreshing(false);
      }
    },
    [user]
  );

  // Cargar más videos al llegar al final
  const loadMore = useCallback(() => {
    if (loadingMore || !hasMore || loading) return;
    fetchFeedPage(offsetRef.current);
  }, [loadingMore, hasMore, loading, fetchFeedPage]);

  useEffect(() => {
    fetchFeedPage(0);
  }, [fetchFeedPage]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    // Disparar sync de IG en background (no bloqueamos la UI esperándolo)
    supabase.functions
      .invoke('instagram-sync', { body: { action: 'sync-official' } })
      .catch(() => {});
    // Pequeña espera para que el sync procese al menos el más reciente
    await new Promise((r) => setTimeout(r, 2000));
    fetchFeedPage(0, true);
  }, [fetchFeedPage]);

  // -------------------------------------------------------------------------
  // VIEWABILITY CONFIG
  // -------------------------------------------------------------------------
  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 80,
  }).current;

  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    if (viewableItems.length > 0) {
      const index = viewableItems[0].index ?? 0;
      setActiveIndex(index);
    }
  }).current;

  // -------------------------------------------------------------------------
  // HANDLERS
  // -------------------------------------------------------------------------

  const handleLike = useCallback(
    async (videoId: string) => {
      if (!user) return;

      // Los Reels de IG no soportan likes internos por ahora (optimistic only)
      const isIGReel = videoId.startsWith('ig_');

      // Obtener estado actual
      const video = videos.find((v) => v.id === videoId);
      if (!video) return;

      const wasLiked = video.is_liked;

      // Toggle like local (optimistic update)
      setVideos((prev) =>
        prev.map((v) =>
          v.id === videoId
            ? {
                ...v,
                is_liked: !v.is_liked,
                likes_count: v.is_liked ? v.likes_count - 1 : v.likes_count + 1,
              }
            : v
        )
      );

      // Para Reels de IG solo hacemos update visual
      if (isIGReel) return;

      try {
        if (wasLiked) {
          // Quitar like
          await supabase
            .from('video_likes')
            .delete()
            .eq('user_id', user.id)
            .eq('video_id', videoId);
        } else {
          // Agregar like
          await supabase.from('video_likes').insert({ user_id: user.id, video_id: videoId });
        }
      } catch (err) {
        console.error('Error toggling like:', err);
        // Revertir en caso de error
        setVideos((prev) =>
          prev.map((v) =>
            v.id === videoId
              ? {
                  ...v,
                  is_liked: wasLiked,
                  likes_count: wasLiked ? v.likes_count + 1 : v.likes_count - 1,
                }
              : v
          )
        );
      }
    },
    [user, videos]
  );

  const handleComment = useCallback((videoId: string) => {
    // TODO: Abrir modal de comentarios
    console.warn('Comment not implemented:', videoId);
  }, []);

  const handleShare = useCallback(async (video: FeedVideo) => {
    const { Share } = await import('react-native');
    if (video.source === 'instagram_reel' && video.ig_permalink) {
      await Share.share({
        message: `${video.free_text ? video.free_text.substring(0, 100) + '\n' : ''}${video.ig_permalink}`,
        url: video.ig_permalink,
      });
    } else {
      await Share.share({
        message: video.exercise_name
          ? `🏋️ ${video.exercise_name} ${video.weight_kg}kg × ${video.reps}\n#TRENS`
          : `💪 ${video.free_text || 'Check de entreno'}\n#TRENS`,
        url: video.video_url,
      });
    }
  }, []);

  const handleSave = useCallback(
    async (videoId: string) => {
      if (!user) return;

      const isIGReel = videoId.startsWith('ig_');

      // Obtener estado actual
      const video = videos.find((v) => v.id === videoId);
      if (!video) return;

      const wasSaved = video.is_saved;

      // Toggle save local (optimistic update)
      setVideos((prev) =>
        prev.map((v) => (v.id === videoId ? { ...v, is_saved: !v.is_saved } : v))
      );

      // Para Reels de IG solo hacemos update visual
      if (isIGReel) return;

      try {
        if (wasSaved) {
          // Quitar guardado
          await supabase
            .from('video_saves')
            .delete()
            .eq('user_id', user.id)
            .eq('video_id', videoId);
        } else {
          // Guardar video
          await supabase.from('video_saves').insert({ user_id: user.id, video_id: videoId });
        }
      } catch (err) {
        console.error('Error toggling save:', err);
        // Revertir en caso de error
        setVideos((prev) => prev.map((v) => (v.id === videoId ? { ...v, is_saved: wasSaved } : v)));
      }
    },
    [user, videos]
  );

  const handleUserPress = useCallback((userId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(`/profile/${userId}`);
  }, []);

  // Mute feed & reset chip when a song starts playing from the Spotify modal
  useEffect(() => {
    const unsub = spotifyModalEvent.onPlay((info) => {
      setIsMuted(true);
      // Modal took over playback → chip no longer controls it
      setSpotifyPlayingFromFeed(false);
      setCurrentPlayingTrackUri(null);
      // Update now-playing info for the header chip
      if (info) setNowPlayingTrack(info);
    });
    return unsub;
  }, []);

  // Clear now-playing when Spotify is paused from the modal
  useEffect(() => {
    const unsub = spotifyModalEvent.onPause(() => {
      setNowPlayingTrack(null);
    });
    return unsub;
  }, []);

  // -------------------------------------------------------------------------
  // SPOTIFY TOGGLE FROM FEED CHIP - play/pause toggle
  // -------------------------------------------------------------------------
  const handleSpotifyToggle = useCallback(
    async (trackUri: string) => {
      if (!spotifyConnected) {
        spotifyModalEvent.open();
        return;
      }
      try {
        if (currentPlayingTrackUri === trackUri && spotifyPlayingFromFeed) {
          // Same track playing → pause (keep trackUri for resume)
          await spotify.pause();
          setSpotifyPlayingFromFeed(false);
          setNowPlayingTrack(null);
        } else if (currentPlayingTrackUri === trackUri && !spotifyPlayingFromFeed) {
          // Same track paused → resume (not restart)
          await spotify.play();
          setIsMuted(true);
          setSpotifyPlayingFromFeed(true);
          // Restore now-playing header chip
          const activeVideo = videos[activeIndex];
          if (activeVideo?.spotify?.trackName) {
            setNowPlayingTrack({
              trackName: activeVideo.spotify.trackName,
              artist: activeVideo.spotify.artist || '',
              trackUri,
            });
          }
        } else {
          // Different track or first play → play new track
          await spotify.playTrack(trackUri);
          setIsMuted(true);
          setSpotifyPlayingFromFeed(true);
          setCurrentPlayingTrackUri(trackUri);
          // Update now-playing from the active video's spotify data
          const activeVideo = videos[activeIndex];
          if (activeVideo?.spotify?.trackName) {
            setNowPlayingTrack({
              trackName: activeVideo.spotify.trackName,
              artist: activeVideo.spotify.artist || '',
              trackUri,
            });
          }
        }
      } catch (err) {
        console.warn('Error toggling Spotify track:', err);
      }
    },
    [spotifyConnected, currentPlayingTrackUri, spotifyPlayingFromFeed, videos, activeIndex]
  );

  // -------------------------------------------------------------------------
  // CHECK SAVED TRACKS - verify which feed tracks are in user's Spotify library
  // -------------------------------------------------------------------------
  const checkSavedTracks = useCallback(
    async (feedVideos: FeedVideo[]) => {
      if (!spotifyConnected) return;
      const trackIds = feedVideos
        .filter((v) => v.spotify?.trackUri)
        .map((v) => v.spotify!.trackUri!.split(':').pop()!)
        .filter(Boolean);
      if (trackIds.length === 0) return;
      // Check in batches of 50 (Spotify API limit)
      const uniqueIds = [...new Set(trackIds)];
      for (let i = 0; i < uniqueIds.length; i += 50) {
        const batch = uniqueIds.slice(i, i + 50);
        try {
          const results = await spotify.checkSavedTracks(batch);
          setSavedTrackIds((prev) => {
            const next = new Set(prev);
            results.forEach((saved, id) => {
              if (saved) next.add(id);
            });
            return next;
          });
        } catch (err) {
          console.warn('Error checking saved tracks:', err);
        }
      }
    },
    [spotifyConnected]
  );

  // Check saved tracks whenever videos change
  useEffect(() => {
    if (videos.length > 0 && spotifyConnected) {
      checkSavedTracks(videos);
    }
  }, [videos.length, spotifyConnected]);

  // -------------------------------------------------------------------------
  // TOGGLE SAVE TRACK - add or remove from Spotify library
  // -------------------------------------------------------------------------
  const handleToggleSaveTrack = useCallback(
    async (trackId: string) => {
      if (!spotifyConnected || !trackId) return;
      const isSaved = savedTrackIds.has(trackId);
      try {
        let ok: boolean;
        if (isSaved) {
          ok = await spotify.removeTrack(trackId);
          if (ok) {
            setSavedTrackIds((prev) => {
              const next = new Set(prev);
              next.delete(trackId);
              return next;
            });
          }
        } else {
          ok = await spotify.saveTrack(trackId);
          if (ok) {
            setSavedTrackIds((prev) => new Set(prev).add(trackId));
          }
        }
        Haptics.notificationAsync(
          ok ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error
        );
      } catch (err) {
        console.warn('Error toggling saved track:', err);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
    },
    [spotifyConnected, savedTrackIds]
  );

  // -------------------------------------------------------------------------
  // RENDER KEY EXTRACTOR
  // -------------------------------------------------------------------------
  const keyExtractor = useCallback((item: FeedVideo) => item.id, []);

  // -------------------------------------------------------------------------
  // RENDER ITEM
  // -------------------------------------------------------------------------
  const renderItem = useCallback(
    ({ item, index }: { item: FeedVideo; index: number }) => (
      <FeedVideoItem
        item={item}
        isActive={index === activeIndex && isFeedFocused}
        onLike={handleLike}
        onComment={handleComment}
        onShare={handleShare}
        onSave={handleSave}
        onUserPress={handleUserPress}
        spotifyPremium={spotifyPremium}
        spotifyConnected={spotifyConnected ?? false}
        isPro={isPro}
        onSpotifyToggle={handleSpotifyToggle}
        isMuted={isMuted}
        autoScrollEnabled={autoScrollEnabled}
        onVideoEnd={handleVideoEnd}
        contextReady={!contextLoading}
        videoHeight={videoHeight}
        screenWidth={SCREEN_WIDTH}
        savedTrackIds={savedTrackIds}
        onToggleSaveTrack={handleToggleSaveTrack}
        currentPlayingTrackUri={currentPlayingTrackUri}
        spotifyPlayingFromFeed={spotifyPlayingFromFeed}
      />
    ),
    [
      activeIndex,
      isFeedFocused,
      handleLike,
      handleComment,
      handleShare,
      handleSave,
      handleUserPress,
      spotifyPremium,
      spotifyConnected,
      isPro,
      handleSpotifyToggle,
      isMuted,
      autoScrollEnabled,
      handleVideoEnd,
      contextLoading,
      videoHeight,
      SCREEN_WIDTH,
      savedTrackIds,
      handleToggleSaveTrack,
      currentPlayingTrackUri,
      spotifyPlayingFromFeed,
    ]
  );

  // -------------------------------------------------------------------------
  // RENDER: Loading
  // -------------------------------------------------------------------------
  if (loading) {
    return (
      <View className="flex-1 bg-black items-center justify-center">
        <ActivityIndicator size="large" color="#DC2626" />
        <Text className="text-zinc-500 mt-4">Cargando feed...</Text>
      </View>
    );
  }

  // -------------------------------------------------------------------------
  // RENDER: Empty
  // -------------------------------------------------------------------------
  if (videos.length === 0) {
    return (
      <View className="flex-1 bg-black items-center justify-center px-6">
        <Play size={64} color="#27272a" />
        <Text className="text-white text-xl font-bold mt-6 mb-2">Feed vacío</Text>
        <Text className="text-zinc-500 text-center">
          Sé el primero en compartir tu entrenamiento con la comunidad TRENS
        </Text>
      </View>
    );
  }

  // -------------------------------------------------------------------------
  // RENDER: Main Feed
  // -------------------------------------------------------------------------
  return (
    <View className="flex-1 bg-black">
      {/* Header flotante - usa insets.top para adaptarse al notch/Dynamic Island */}
      <View
        className="absolute top-0 left-0 right-0 z-10 px-4 pb-2"
        style={{ paddingTop: Math.max(insets.top, 20) + 8 }}
      >
        <LinearGradient colors={['rgba(0,0,0,0.8)', 'transparent']} className="absolute inset-0" />
        <View className="flex-row items-center justify-between">
          <Text className="text-white text-xl font-bold tracking-wider">TRENS</Text>
          <View className="flex-row items-center gap-2">
            {/* Toggle Autoscroll */}
            <TouchableOpacity
              onPress={handleToggleAutoScroll}
              className={`px-3 py-1.5 rounded-full flex-row items-center ${
                autoScrollEnabled ? 'bg-red-600/30' : 'bg-black/50'
              }`}
              style={
                autoScrollEnabled
                  ? { borderWidth: 1, borderColor: '#DC2626' }
                  : { borderWidth: 1, borderColor: 'rgba(113,113,122,0.3)' }
              }
            >
              <ListVideo size={14} color={autoScrollEnabled ? '#DC2626' : '#71717a'} />
              <Text
                className={`ml-1.5 text-xs font-bold ${
                  autoScrollEnabled ? 'text-red-500' : 'text-zinc-500'
                }`}
              >
                AUTO
              </Text>
            </TouchableOpacity>

            {/* Toggle Mute */}
            <TouchableOpacity
              onPress={handleToggleMute}
              className={`px-3 py-1.5 rounded-full flex-row items-center ${
                isMuted ? 'bg-black/50' : 'bg-white/10'
              }`}
              style={
                isMuted
                  ? { borderWidth: 1, borderColor: 'rgba(113,113,122,0.3)' }
                  : { borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' }
              }
            >
              {isMuted ? (
                <VolumeX size={14} color="#71717a" />
              ) : (
                <Volume2 size={14} color="#FFFFFF" />
              )}
              <Text
                className={`ml-1.5 text-xs font-bold ${isMuted ? 'text-zinc-500' : 'text-white'}`}
              >
                {isMuted ? 'MUTE' : 'ON'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Spotify Now-Playing chip */}
        {(() => {
          const activeVideo = videos[activeIndex];
          const assignedUri = activeVideo?.spotify?.trackUri;
          // If playing the same track assigned to the video, show just "Spotify" (no track name)
          const isSameAsAssigned =
            (nowPlayingTrack && assignedUri && nowPlayingTrack.trackUri === assignedUri) ||
            (spotifyPlayingFromFeed && currentPlayingTrackUri === assignedUri);

          // nowPlayingTrack is non-null only when Spotify is actively playing
          const isPlaying = !!nowPlayingTrack && !isSameAsAssigned;

          return (
            <TouchableOpacity
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                spotifyModalEvent.open();
              }}
              className="self-end mt-1.5 flex-row items-center rounded-full px-3 py-1.5"
              style={{
                backgroundColor: isPlaying
                  ? 'rgba(30, 215, 96, 0.12)'
                  : 'rgba(255, 255, 255, 0.06)',
                borderWidth: 1,
                borderColor: isPlaying ? '#1DB954' : 'rgba(255, 255, 255, 0.12)',
                maxWidth: '60%',
              }}
            >
              <Music size={12} color={isPlaying ? '#1DB954' : '#71717a'} />
              <Text
                numberOfLines={1}
                className={`ml-1.5 text-xs font-bold ${
                  isPlaying ? 'text-green-400' : 'text-zinc-500'
                }`}
              >
                {isPlaying ? `${nowPlayingTrack.trackName} — ${nowPlayingTrack.artist}` : 'Spotify'}
              </Text>
            </TouchableOpacity>
          );
        })()}

        {/* Training Day chip */}
        <TrainingDayChip userId={user?.id} />
      </View>

      {/* Feed vertical */}
      <FlatList
        ref={flatListRef}
        data={videos}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        pagingEnabled
        showsVerticalScrollIndicator={false}
        snapToInterval={videoHeight}
        snapToAlignment="start"
        decelerationRate="fast"
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#DC2626" />
        }
        getItemLayout={(_, index) => ({
          length: videoHeight,
          offset: videoHeight * index,
          index,
        })}
        removeClippedSubviews
        maxToRenderPerBatch={3}
        windowSize={5}
        initialNumToRender={2}
        onEndReached={loadMore}
        onEndReachedThreshold={1.5}
        ListFooterComponent={
          loadingMore ? (
            <View style={{ height: videoHeight }} className="bg-black items-center justify-center">
              <ActivityIndicator size="large" color="#DC2626" />
              <Text className="text-zinc-500 mt-3 text-sm">Cargando más videos...</Text>
            </View>
          ) : null
        }
      />
    </View>
  );
}

export default function FeedScreen() {
  return (
    <PWAGuard moduleName="FEED">
      <FeedScreenContent />
    </PWAGuard>
  );
}
