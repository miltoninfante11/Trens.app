import React, { useState, useCallback, useRef, useEffect } from 'react';
import { View, Text, ActivityIndicator, ScrollView, Pressable, Image } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import {
  Dumbbell,
  Utensils,
  Pill,
  Clock,
  ChevronRight,
  Flame,
  Zap,
  Syringe,
  FlaskConical,
  Droplets,
  Activity,
  Volume2,
  VolumeX,
  GitlabIcon,
} from 'lucide-react-native';
import { router, useFocusEffect } from 'expo-router';
import * as Speech from 'expo-speech';
import * as Haptics from '../../lib/haptics';
import { supabase } from '../../lib/supabase';
import { hankSpeakState } from '../../lib/hankSpeakState';
import { speakSavage, stopSavage, prefetchSavage } from '../../services/tts/savageTTS';
import { setHankChatOpen } from '../../lib/hankChatState';

// ============================================================================
// TYPES
// ============================================================================
interface Exercise {
  id: string;
  name: string;
  imageUrl?: string;
  videoUrl?: string;
  sessionIndex?: number;
}

interface CardioItem {
  id: string;
  cardio_type: string;
  activity: string;
  duration_minutes: number;
  intensity: string;
  is_pre_workout: boolean;
  is_post_workout: boolean;
  is_fasted: boolean;
  scheduled_time?: string;
  target_heart_rate?: number | null;
  speed?: number | null;
  incline?: number | null;
  workout_session_index?: number;
}

interface WorkoutStackItem {
  id: string;
  name: string;
  dose: string;
  type: 'pill' | 'syringe' | 'powder' | 'liquid';
  is_pre_workout: boolean;
  is_post_workout: boolean;
  workout_session_index?: number;
}

// Unified timeline item
type TimelineItemType = 'meal' | 'workout' | 'stack' | 'cardio';

interface TimelineItem {
  id: string;
  type: TimelineItemType;
  time: string; // HH:MM
  minutes: number;
  label: string;
  subtitle?: string;
  data: any;
}

interface TodayCardsProps {
  userId: string;
}

// ============================================================================
// HELPERS
// ============================================================================
const getCurrentMinutes = (): number => {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
};

const parseTimeToMinutes = (time: string): number => {
  if (!time) return 0;
  const [hours, minutes] = time.split(':').map(Number);
  return (hours || 0) * 60 + (minutes || 0);
};

const formatTimeUntil = (targetMinutes: number, currentMinutes: number): string => {
  const diff = targetMinutes - currentMinutes;
  if (diff >= -30 && diff <= 0) return 'AHORA';
  if (diff < -30) {
    const absDiff = Math.abs(diff);
    const hours = Math.floor(absDiff / 60);
    const mins = absDiff % 60;
    if (hours > 0) return `hace ${hours}h ${mins}m`;
    return `hace ${mins}m`;
  }
  const hours = Math.floor(diff / 60);
  const mins = diff % 60;
  if (hours > 0 && mins > 0) return `en ${hours}h ${mins}m`;
  if (hours > 0) return `en ${hours}h`;
  return `en ${mins}m`;
};

const formatTime12h = (time24: string): string => {
  if (!time24) return '';
  const [hours, minutes] = time24.split(':').map(Number);
  const period = hours >= 12 ? 'PM' : 'AM';
  const hours12 = hours % 12 || 12;
  return `${hours12}:${(minutes || 0).toString().padStart(2, '0')} ${period}`;
};

const getStackTypeIcon = (type: string, size = 12, color = '#A855F7') => {
  const iconProps = { size, color };
  switch (type) {
    case 'pill':
      return <Pill {...iconProps} />;
    case 'syringe':
      return <Syringe {...iconProps} />;
    case 'liquid':
      return <Droplets {...iconProps} />;
    case 'powder':
      return <FlaskConical {...iconProps} />;
    default:
      return <Pill {...iconProps} />;
  }
};

const getCardioColor = (type: string): string => {
  switch (type) {
    case 'HIIT':
    case 'SPRINT':
    case 'TABATA':
      return '#DC2626';
    case 'LISS':
      return '#22C55E';
    case 'EMOM':
      return '#3B82F6';
    default:
      return '#F97316';
  }
};

// ============================================================================
// EXERCISE MINI CARD
// ============================================================================
const ExerciseMiniCard: React.FC<{ exercise: Exercise }> = ({ exercise }) => {
  const videoPlayer = useVideoPlayer(exercise.videoUrl || null, (player) => {
    player.loop = false;
    player.muted = true;
    player.pause();
  });

  return (
    <View className="mr-2 items-center">
      <View
        className="w-14 h-14 rounded-lg items-center justify-center overflow-hidden"
        style={{ backgroundColor: '#1a0505', borderWidth: 1, borderColor: '#DC262640' }}
      >
        {exercise.imageUrl ? (
          <Image source={{ uri: exercise.imageUrl }} className="w-full h-full" resizeMode="cover" />
        ) : exercise.videoUrl ? (
          <VideoView
            player={videoPlayer}
            style={{ width: 56, height: 56 }}
            contentFit="cover"
            nativeControls={false}
            allowsFullscreen={false}
          />
        ) : (
          <Dumbbell size={20} color="#DC2626" />
        )}
      </View>
      <Text className="text-zinc-500 text-[8px] text-center mt-1 w-14" numberOfLines={1}>
        {exercise.name}
      </Text>
    </View>
  );
};

// ============================================================================
// TIMELINE ITEM RENDERERS
// ============================================================================

// --- MEAL CARD ---
const MealTimelineCard: React.FC<{
  item: TimelineItem;
  isNext: boolean;
  countdown: string;
}> = ({ item, isNext, countdown }) => {
  const ingredients: string[] = item.data.ingredients || [];
  return (
    <Pressable
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        router.push('/(tabs)/plan');
      }}
      className="rounded-xl p-3 active:scale-[0.98]"
      style={{
        backgroundColor: isNext ? '#050a05' : '#0a0a0a',
        borderWidth: 1,
        borderColor: isNext ? '#22c55e40' : '#27272a40',
      }}
    >
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center gap-2.5 flex-1">
          <View
            className="w-8 h-8 rounded-full items-center justify-center"
            style={{ backgroundColor: isNext ? '#22c55e20' : '#27272a' }}
          >
            <Utensils size={13} color={isNext ? '#22c55e' : '#71717a'} />
          </View>
          <View className="flex-1">
            <Text
              className="text-[10px] font-bold uppercase tracking-widest"
              style={{ color: isNext ? '#22c55e' : '#71717a' }}
            >
              {item.label}
            </Text>
            {ingredients.length > 0 && (
              <View className="flex-row flex-wrap gap-1 mt-1">
                {ingredients.slice(0, 3).map((ing: string, idx: number) => (
                  <View
                    key={idx}
                    className="px-2 py-0.5 rounded-full"
                    style={{ backgroundColor: isNext ? '#22c55e12' : '#27272a50' }}
                  >
                    <Text
                      className="text-[9px]"
                      style={{ color: isNext ? '#a1a1aa' : '#52525b' }}
                      numberOfLines={1}
                    >
                      {ing}
                    </Text>
                  </View>
                ))}
                {ingredients.length > 3 && (
                  <Text className="text-zinc-600 text-[9px] ml-1">+{ingredients.length - 3}</Text>
                )}
              </View>
            )}
          </View>
        </View>

        <View className="flex-row items-center gap-2">
          <View className="items-end">
            <View className="flex-row items-center gap-1">
              <Clock size={9} color={isNext ? '#22c55e' : '#52525b'} />
              <Text
                className="text-[10px] font-mono font-bold"
                style={{ color: isNext ? '#22c55e' : '#52525b' }}
              >
                {formatTime12h(item.time)}
              </Text>
            </View>
            <Text
              className="text-[9px] font-bold"
              style={{
                color: countdown === 'AHORA' ? '#22c55e' : '#52525b',
              }}
            >
              {countdown}
            </Text>
          </View>
          <ChevronRight size={12} color="#3f3f46" />
        </View>
      </View>
    </Pressable>
  );
};

// --- STACK CARD ---
const StackTimelineCard: React.FC<{
  item: TimelineItem;
  isNext: boolean;
  countdown: string;
}> = ({ item, isNext, countdown }) => {
  const stackItems: Array<{ name: string; dose: string; type: string }> = item.data.items || [];
  return (
    <Pressable
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        router.push('/(tabs)/plan');
      }}
      className="rounded-xl p-3 active:scale-[0.98]"
      style={{
        backgroundColor: isNext ? '#0a0510' : '#0a0a0a',
        borderWidth: 1,
        borderColor: isNext ? '#a855f740' : '#27272a40',
      }}
    >
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center gap-2.5 flex-1">
          <View
            className="w-8 h-8 rounded-full items-center justify-center"
            style={{ backgroundColor: isNext ? '#a855f720' : '#27272a' }}
          >
            {getStackTypeIcon(stackItems[0]?.type || 'pill', 13, isNext ? '#a855f7' : '#71717a')}
          </View>
          <View className="flex-1">
            <Text
              className="text-[10px] font-bold uppercase tracking-widest"
              style={{ color: isNext ? '#a855f7' : '#71717a' }}
            >
              STACK
            </Text>
            <View className="flex-row flex-wrap gap-1 mt-0.5">
              {stackItems
                .slice(0, 3)
                .map((s: { name: string; dose: string; type: string }, idx: number) => (
                  <View
                    key={idx}
                    className="flex-row items-center gap-1 px-2 py-0.5 rounded-full"
                    style={{ backgroundColor: isNext ? '#a855f712' : '#27272a50' }}
                  >
                    {getStackTypeIcon(s.type, 9, isNext ? '#a855f7' : '#52525b')}
                    <Text
                      className="text-[9px] font-bold"
                      style={{ color: isNext ? '#c084fc' : '#52525b' }}
                      numberOfLines={1}
                    >
                      {s.name}
                    </Text>
                  </View>
                ))}
              {stackItems.length > 3 && (
                <Text className="text-zinc-600 text-[9px] ml-1">+{stackItems.length - 3}</Text>
              )}
            </View>
          </View>
        </View>

        <View className="flex-row items-center gap-2">
          <View className="items-end">
            <View className="flex-row items-center gap-1">
              <Clock size={9} color={isNext ? '#a855f7' : '#52525b'} />
              <Text
                className="text-[10px] font-mono font-bold"
                style={{ color: isNext ? '#a855f7' : '#52525b' }}
              >
                {formatTime12h(item.time)}
              </Text>
            </View>
            <Text
              className="text-[9px] font-bold"
              style={{ color: countdown === 'AHORA' ? '#a855f7' : '#52525b' }}
            >
              {countdown}
            </Text>
          </View>
          <ChevronRight size={12} color="#3f3f46" />
        </View>
      </View>
    </Pressable>
  );
};

// --- WORKOUT CARD ---
const WorkoutTimelineCard: React.FC<{
  item: TimelineItem;
  isNext: boolean;
  countdown: string;
}> = ({ item, isNext, countdown }) => {
  const exercises: Exercise[] = item.data.exercises || [];
  const isRestDay = item.data.isRestDay;
  const preStacks: WorkoutStackItem[] = item.data.preStacks || [];
  const postStacks: WorkoutStackItem[] = item.data.postStacks || [];
  const preCardios: CardioItem[] = item.data.preCardios || [];
  const postCardios: CardioItem[] = item.data.postCardios || [];

  return (
    <View>
      {/* PRE items */}
      {(preStacks.length > 0 || preCardios.length > 0) && (
        <View className="mb-1">
          {preStacks.length > 0 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              className="mb-1"
              contentContainerStyle={{ paddingHorizontal: 4 }}
            >
              {preStacks.map((s) => (
                <View
                  key={s.id}
                  className="flex-row items-center gap-1 px-2.5 py-1 rounded-full mr-1.5"
                  style={{ backgroundColor: '#a855f710', borderWidth: 1, borderColor: '#a855f720' }}
                >
                  <Zap size={9} color="#DC2626" />
                  {getStackTypeIcon(s.type, 9, '#a855f7')}
                  <Text className="text-purple-400 text-[9px] font-bold" numberOfLines={1}>
                    {s.name}
                  </Text>
                </View>
              ))}
            </ScrollView>
          )}
          {preCardios.map((c) => (
            <View
              key={c.id}
              className="flex-row items-center gap-2 px-3 py-1.5 rounded-lg mb-1"
              style={{ backgroundColor: `${getCardioColor(c.cardio_type)}08` }}
            >
              <Flame size={10} color={getCardioColor(c.cardio_type)} />
              <Text
                className="text-[9px] font-bold font-mono"
                style={{ color: getCardioColor(c.cardio_type) }}
              >
                PRE · {c.cardio_type} · {c.duration_minutes}min
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* Main workout card */}
      <Pressable
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          router.push('/(tabs)/gym');
        }}
        className="rounded-xl overflow-hidden active:scale-[0.98]"
        style={{
          backgroundColor: isNext ? '#0a0505' : '#0a0a0a',
          borderWidth: 1,
          borderColor: isNext ? '#DC262650' : '#27272a40',
        }}
      >
        <View className="flex-row items-center justify-between px-3 py-3">
          <View className="flex-row items-center gap-2.5 flex-1">
            <View
              className="w-8 h-8 rounded-full items-center justify-center"
              style={{ backgroundColor: isNext ? '#DC262620' : '#27272a' }}
            >
              {isRestDay ? (
                <Zap size={13} color="#71717a" />
              ) : (
                <Dumbbell size={13} color={isNext ? '#DC2626' : '#71717a'} />
              )}
            </View>
            <View className="flex-1">
              <Text
                className="text-[10px] font-bold uppercase tracking-widest"
                style={{ color: isNext ? '#DC2626' : '#71717a' }}
              >
                {item.data.sessionLabel || 'ENTRENO'}
              </Text>
              <Text
                className="font-bold text-sm uppercase tracking-tight"
                style={{ color: isRestDay ? '#71717a' : '#ffffff' }}
                numberOfLines={1}
              >
                {item.label}
              </Text>
            </View>
          </View>

          <View className="flex-row items-center gap-2">
            {item.time !== '99:99' && (
              <View className="items-end">
                <View className="flex-row items-center gap-1">
                  <Clock size={9} color={isNext ? '#DC2626' : '#52525b'} />
                  <Text
                    className="text-[10px] font-mono font-bold"
                    style={{ color: isNext ? '#DC2626' : '#52525b' }}
                  >
                    {formatTime12h(item.time)}
                  </Text>
                </View>
                <Text
                  className="text-[9px] font-bold"
                  style={{ color: countdown === 'AHORA' ? '#DC2626' : '#52525b' }}
                >
                  {countdown}
                </Text>
              </View>
            )}
            {!isRestDay && exercises.length > 0 && !item.data.isExternalMode && (
              <View className="px-2 py-1 rounded-md" style={{ backgroundColor: '#DC262615' }}>
                <Text
                  className="text-[9px] font-mono font-bold"
                  style={{ color: isNext ? '#DC2626' : '#52525b' }}
                >
                  {exercises.length} EJ
                </Text>
              </View>
            )}
            <ChevronRight size={12} color="#3f3f46" />
          </View>
        </View>

        {!isRestDay && exercises.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            className="pb-3"
            contentContainerStyle={{ paddingHorizontal: 12 }}
          >
            {exercises.slice(0, 8).map((ex) => (
              <ExerciseMiniCard key={ex.id} exercise={ex} />
            ))}
          </ScrollView>
        )}
      </Pressable>

      {/* POST items */}
      {(postStacks.length > 0 || postCardios.length > 0) && (
        <View className="mt-1">
          {postStacks.length > 0 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              className="mb-1"
              contentContainerStyle={{ paddingHorizontal: 4 }}
            >
              {postStacks.map((s) => (
                <View
                  key={s.id}
                  className="flex-row items-center gap-1 px-2.5 py-1 rounded-full mr-1.5"
                  style={{ backgroundColor: '#22c55e10', borderWidth: 1, borderColor: '#22c55e20' }}
                >
                  <Flame size={9} color="#22c55e" />
                  {getStackTypeIcon(s.type, 9, '#22c55e')}
                  <Text className="text-green-400 text-[9px] font-bold" numberOfLines={1}>
                    {s.name}
                  </Text>
                </View>
              ))}
            </ScrollView>
          )}
          {postCardios.map((c) => (
            <View
              key={c.id}
              className="flex-row items-center gap-2 px-3 py-1.5 rounded-lg mb-1"
              style={{ backgroundColor: `${getCardioColor(c.cardio_type)}08` }}
            >
              <Flame size={10} color={getCardioColor(c.cardio_type)} />
              <Text
                className="text-[9px] font-bold font-mono"
                style={{ color: getCardioColor(c.cardio_type) }}
              >
                POST · {c.cardio_type} · {c.duration_minutes}min
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
};

// --- CARDIO CARD ---
const CardioTimelineCard: React.FC<{
  item: TimelineItem;
  isNext: boolean;
  countdown: string;
}> = ({ item, isNext, countdown }) => {
  const cardio: CardioItem = item.data;
  const color = getCardioColor(cardio.cardio_type);

  return (
    <Pressable
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        router.push('/(tabs)/plan');
      }}
      className="rounded-xl p-3 active:scale-[0.98]"
      style={{
        backgroundColor: isNext ? '#080808' : '#0a0a0a',
        borderWidth: 1,
        borderColor: isNext ? `${color}40` : '#27272a40',
      }}
    >
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center gap-2.5 flex-1">
          <View
            className="w-8 h-8 rounded-full items-center justify-center"
            style={{ backgroundColor: `${color}15` }}
          >
            <Flame size={13} color={color} />
          </View>
          <View className="flex-1">
            <Text
              className="text-[10px] font-bold uppercase tracking-widest"
              style={{ color: isNext ? color : '#71717a' }}
            >
              CARDIO
            </Text>
            <Text
              className="text-white font-bold text-sm uppercase tracking-tight"
              numberOfLines={1}
            >
              {cardio.cardio_type} · {cardio.activity}
            </Text>
            <View className="flex-row items-center gap-2 mt-0.5">
              <Text className="text-zinc-500 text-[9px] font-mono">
                {cardio.duration_minutes} min · {cardio.intensity}
              </Text>
              {cardio.target_heart_rate ? (
                <View className="flex-row items-center gap-0.5">
                  <Activity size={8} color="#DC2626" />
                  <Text className="text-zinc-500 text-[8px] font-mono">
                    {cardio.target_heart_rate} bpm
                  </Text>
                </View>
              ) : null}
            </View>
          </View>
        </View>

        <View className="flex-row items-center gap-2">
          <View className="items-end">
            <View className="flex-row items-center gap-1">
              <Clock size={9} color={isNext ? color : '#52525b'} />
              <Text
                className="text-[10px] font-mono font-bold"
                style={{ color: isNext ? color : '#52525b' }}
              >
                {formatTime12h(item.time)}
              </Text>
            </View>
            <Text
              className="text-[9px] font-bold"
              style={{ color: countdown === 'AHORA' ? color : '#52525b' }}
            >
              {countdown}
            </Text>
          </View>
          <ChevronRight size={12} color="#3f3f46" />
        </View>
      </View>
    </Pressable>
  );
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================
export const TodayCards: React.FC<TodayCardsProps> = ({ userId }) => {
  const [loading, setLoading] = useState(true);
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [nextItemId, setNextItemId] = useState<string | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const speakingRef = useRef(false);
  const maleVoiceRef = useRef<string | null>(null);

  // Cargar voces del dispositivo y elegir una masculina en español
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const voices = await Speech.getAvailableVoicesAsync();
        if (cancelled) return;

        // Heurística para detectar voces masculinas en español
        const spanishVoices = voices.filter((v) => v.language?.toLowerCase().startsWith('es'));

        // Patrones conocidos de voces masculinas (iOS, Android, Web)
        const malePatterns = [
          /jorge/i,
          /diego/i,
          /carlos/i,
          /juan/i,
          /enrique/i,
          /miguel/i,
          /pablo/i,
          /paco/i,
          /\bmale\b/i,
          /-male/i,
          /hombre/i,
          // Google TTS
          /es-(es|us|mx)-x-[a-z]+m-/i, // codificación Google: ...m- = male
          /es-[A-Z]{2}-Standard-B/i, // Google Cloud Standard B suele ser masculina
          /es-[A-Z]{2}-Wavenet-B/i,
          /es-[A-Z]{2}-Neural2-B/i,
        ];

        const malePreferences = [/es-MX/i, /es-US/i, /es-ES/i, /es-419/i, /^es/i];

        let picked: string | null = null;

        // 1) Buscar voz masculina con preferencia regional
        for (const region of malePreferences) {
          const found = spanishVoices.find(
            (v) =>
              region.test(v.language || '') &&
              malePatterns.some((p) => p.test(v.identifier) || p.test(v.name || ''))
          );
          if (found) {
            picked = found.identifier;
            break;
          }
        }

        // 2) Cualquier voz masculina en español
        if (!picked) {
          const any = spanishVoices.find((v) =>
            malePatterns.some((p) => p.test(v.identifier) || p.test(v.name || ''))
          );
          if (any) picked = any.identifier;
        }

        if (picked) {
          maleVoiceRef.current = picked;
        }
      } catch {
        // Silencioso: si falla, usaremos pitch bajo como fallback
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const fetchTodayData = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }

    try {
      const currentMinutes = getCurrentMinutes();
      const today = new Date().getDay();
      const items: TimelineItem[] = [];

      // =====================================================================
      // 1. FETCH MEALS
      // =====================================================================
      const { data: mealsData } = await supabase
        .from('meals')
        .select('id, name, scheduled_time, ingredients')
        .eq('user_id', userId)
        .order('scheduled_time', { ascending: true });

      mealsData?.forEach((meal, idx) => {
        if (meal.scheduled_time) {
          const timeStr = meal.scheduled_time.slice(0, 5);
          const minutes = parseTimeToMinutes(timeStr);
          const ingredientNames: string[] = [];
          if (Array.isArray(meal.ingredients)) {
            meal.ingredients.forEach((ing: any) => {
              if (ing?.name) ingredientNames.push(ing.name);
            });
          }

          items.push({
            id: `meal-${meal.id}`,
            type: 'meal',
            time: timeStr,
            minutes,
            label: meal.name || `COMIDA ${idx + 1}`,
            data: { ingredients: ingredientNames },
          });
        }
      });

      // =====================================================================
      // 2. FETCH STACKS (timed, non pre/post)
      // =====================================================================
      const { data: stacksData } = await supabase
        .from('supplement_stack')
        .select(
          'id, name, dose, time, times, type, days_of_week, is_pre_workout, is_post_workout, workout_session_index'
        )
        .eq('user_id', userId)
        .eq('is_active', true);

      // Group stacks by time
      const stacksByTime: Record<
        string,
        Array<{ name: string; dose: string; type: string; id: string }>
      > = {};
      const prePostStacks: WorkoutStackItem[] = [];

      stacksData?.forEach((stack) => {
        const matchesToday = stack.days_of_week?.includes(today) ?? true;
        if (!matchesToday) return;

        if (stack.is_pre_workout || stack.is_post_workout) {
          prePostStacks.push({
            id: stack.id,
            name: stack.name,
            dose: stack.dose || '',
            type: (stack.type as any) || 'pill',
            is_pre_workout: stack.is_pre_workout || false,
            is_post_workout: stack.is_post_workout || false,
            workout_session_index: stack.workout_session_index ?? undefined,
          });
          return;
        }

        // Expand times array
        const allTimes: string[] = [];
        if (stack.times && Array.isArray(stack.times)) {
          stack.times.forEach((t: string) => allTimes.push(t.slice(0, 5)));
        } else if (stack.time) {
          allTimes.push(stack.time.slice(0, 5));
        }

        allTimes.forEach((t) => {
          if (!stacksByTime[t]) stacksByTime[t] = [];
          stacksByTime[t].push({
            id: stack.id,
            name: stack.name,
            dose: stack.dose || '',
            type: (stack.type as any) || 'pill',
          });
        });
      });

      Object.entries(stacksByTime).forEach(([time, stackItems]) => {
        items.push({
          id: `stack-${time}`,
          type: 'stack',
          time,
          minutes: parseTimeToMinutes(time),
          label: 'STACK',
          data: { items: stackItems },
        });
      });

      // =====================================================================
      // 3. FETCH CARDIO BLOCKS (scheduled, not pre/post)
      // =====================================================================
      const { data: cardioData } = await supabase
        .from('cardio_blocks')
        .select('*')
        .eq('user_id', userId);

      const prePostCardios: CardioItem[] = [];

      cardioData?.forEach((c: any) => {
        const matchesDay = c.days_of_week?.includes(today) ?? true;
        if (!matchesDay) return;

        if (c.is_pre_workout || c.is_post_workout) {
          prePostCardios.push(c as CardioItem);
          return;
        }

        if (c.scheduled_time) {
          const timeStr = c.scheduled_time.slice(0, 5);
          items.push({
            id: `cardio-${c.id}`,
            type: 'cardio',
            time: timeStr,
            minutes: parseTimeToMinutes(timeStr),
            label: 'CARDIO',
            data: c,
          });
        }
      });

      // =====================================================================
      // 4. FETCH WORKOUT
      // =====================================================================
      const { data: userProfile } = await supabase
        .from('user_profiles')
        .select('training_mode, external_schedule')
        .eq('user_id', userId)
        .single();

      const trainingMode = userProfile?.training_mode || 'none';
      const externalSchedule = userProfile?.external_schedule || {};

      const { data: profileData } = await supabase
        .from('profiles')
        .select(
          'training_current_day, training_routine_names, training_frequency, plan_source, training_session_names'
        )
        .eq('id', userId)
        .single();

      const currentDay = profileData?.training_current_day ?? 0;
      const routineNames = profileData?.training_routine_names || {};
      const frequency = profileData?.training_frequency ?? 0;
      const sessionNamesMap =
        (profileData?.training_session_names as Record<string, Record<string, string>>) || {};

      // Fetch exercises
      const { data: exerciseConfigs } = await supabase
        .from('user_exercise_config')
        .select(
          `id, training_days, custom_media_url, session_index, exercises (id, name, default_media_url, thumbnail_url, video_url)`
        )
        .eq('user_id', userId)
        .order('display_order', { ascending: true });

      const isVideoUrl = (url: string) => {
        if (!url) return false;
        return ['.mp4', '.mov', '.avi', '.webm', '.m4v'].some((ext) =>
          url.toLowerCase().includes(ext)
        );
      };

      let workoutDay = currentDay;
      let routineName = 'ENTRENAMIENTO';

      if (trainingMode === 'external' && Object.keys(externalSchedule).length > 0) {
        const scheduleEntries = Object.entries(externalSchedule).filter(
          ([, muscle]) => muscle && String(muscle).trim() !== ''
        );
        const totalDays = scheduleEntries.length;
        if (totalDays > 0) {
          const safeIndex = Math.min(currentDay, totalDays - 1) % totalDays;
          workoutDay = safeIndex;
          const [, muscleGroup] = scheduleEntries[safeIndex] || ['', ''];
          const savedName = routineNames[String(safeIndex)];
          routineName = (savedName || String(muscleGroup || ''))
            .replace(/^Día\s*\d+\s*:\s*/i, '')
            .trim();
          if (!routineName) routineName = 'DESCANSO';
        }
      } else {
        const rawName = routineNames[String(currentDay)] || 'ENTRENAMIENTO';
        routineName = rawName.replace(/^Día\s*\d+\s*:\s*/i, '');
      }

      const todayExercises: Exercise[] = [];
      exerciseConfigs?.forEach((config: any) => {
        const days = config.training_days || [0];
        if (days.includes(workoutDay) && config.exercises) {
          const ex = config.exercises;
          const mediaUrl =
            config.custom_media_url || ex.default_media_url || ex.thumbnail_url || '';
          const explicitVideoUrl = ex.video_url || '';
          let imageUrl: string | undefined;
          let videoUrl: string | undefined;
          if (explicitVideoUrl) {
            videoUrl = explicitVideoUrl;
            imageUrl = mediaUrl || undefined;
          } else if (isVideoUrl(mediaUrl)) {
            videoUrl = mediaUrl;
          } else {
            imageUrl = mediaUrl || undefined;
          }
          todayExercises.push({
            id: config.id,
            name: ex.name,
            imageUrl,
            videoUrl,
            sessionIndex: config.session_index ?? 0,
          });
        }
      });

      const isRestDay = todayExercises.length === 0 && frequency === 0;
      const hasSessionB = todayExercises.some((ex) => ex.sessionIndex === 1);
      const isExternalMode =
        trainingMode === 'external' ||
        (frequency > 0 && (!profileData?.plan_source || profileData?.plan_source === 'custom'));

      // Fetch workout scheduled time
      const { data: workoutPositions } = await supabase
        .from('workout_block_position')
        .select('session_index, scheduled_time')
        .eq('user_id', userId);

      const posA = workoutPositions?.find((p: any) => p.session_index === 0);
      const posB = workoutPositions?.find((p: any) => p.session_index === 1);

      // Filter pre/post stacks and cardios by session
      const getSessionPre = (sessionIdx: number) => ({
        preStacks: prePostStacks.filter(
          (s) =>
            s.is_pre_workout &&
            (s.workout_session_index === sessionIdx ||
              s.workout_session_index === 2 ||
              s.workout_session_index == null)
        ),
        preCardios: prePostCardios.filter(
          (c) =>
            c.is_pre_workout &&
            (c.workout_session_index === sessionIdx ||
              c.workout_session_index === 2 ||
              c.workout_session_index == null)
        ),
      });

      const getSessionPost = (sessionIdx: number) => ({
        postStacks: prePostStacks.filter(
          (s) =>
            s.is_post_workout &&
            (s.workout_session_index === sessionIdx ||
              s.workout_session_index === 2 ||
              s.workout_session_index == null)
        ),
        postCardios: prePostCardios.filter(
          (c) =>
            c.is_post_workout &&
            (c.workout_session_index === sessionIdx ||
              c.workout_session_index === 2 ||
              c.workout_session_index == null)
        ),
      });

      // Session A
      const daySessionNames = sessionNamesMap[String(workoutDay)] || {};
      const sessAExercises = hasSessionB
        ? todayExercises.filter((ex) => (ex.sessionIndex ?? 0) === 0)
        : todayExercises;
      const sessATime = posA?.scheduled_time?.slice(0, 5) || null;
      const sessAMinutes = sessATime ? parseTimeToMinutes(sessATime) : 9999;
      const { preStacks: preA, preCardios: preCA } = getSessionPre(0);
      const { postStacks: postA, postCardios: postCA } = getSessionPost(0);

      items.push({
        id: 'workout-a',
        type: 'workout',
        time: sessATime || '99:99',
        minutes: sessAMinutes,
        label: routineName || 'ENTRENAMIENTO',
        data: {
          exercises: sessAExercises,
          isRestDay: isRestDay && !hasSessionB,
          isExternalMode,
          sessionLabel: hasSessionB ? daySessionNames['0'] || 'SESIÓN A' : undefined,
          preStacks: preA,
          postStacks: postA,
          preCardios: preCA,
          postCardios: postCA,
        },
      });

      // Session B (if dual)
      if (hasSessionB) {
        const sessBExercises = todayExercises.filter((ex) => ex.sessionIndex === 1);
        const sessBTime = posB?.scheduled_time?.slice(0, 5) || null;
        const sessBMinutes = sessBTime ? parseTimeToMinutes(sessBTime) : 9999;
        const { preStacks: preB, preCardios: preCB } = getSessionPre(1);
        const { postStacks: postB, postCardios: postCB } = getSessionPost(1);

        items.push({
          id: 'workout-b',
          type: 'workout',
          time: sessBTime || '99:99',
          minutes: sessBMinutes,
          label: daySessionNames['1'] || 'SESIÓN B',
          subtitle: routineName,
          data: {
            exercises: sessBExercises,
            isRestDay: false,
            isExternalMode,
            sessionLabel: daySessionNames['1'] || 'SESIÓN B',
            preStacks: preB,
            postStacks: postB,
            preCardios: preCB,
            postCardios: postCB,
          },
        });
      }

      // =====================================================================
      // 5. FILTER: ITEMS IN THE NEXT 5 HOURS
      // =====================================================================
      items.sort((a, b) => a.minutes - b.minutes);

      const fiveHoursLater = currentMinutes + 5 * 60;
      // Show items from now (or up to 30min ago if in progress) to 5h ahead
      const filtered = items.filter(
        (i) => i.minutes >= currentMinutes - 30 && i.minutes <= fiveHoursLater
      );

      // If nothing in window, show the next upcoming item of each type as fallback
      if (filtered.length === 0) {
        const types: TimelineItemType[] = ['meal', 'stack', 'workout', 'cardio'];
        types.forEach((type) => {
          const upcoming = items.find((i) => i.type === type && i.minutes >= currentMinutes);
          if (upcoming) filtered.push(upcoming);
        });
        filtered.sort((a, b) => a.minutes - b.minutes);
      }

      // The overall next item is the first one >= now
      const nextItem = filtered.find((i) => i.minutes >= currentMinutes) || filtered[0];
      setNextItemId(nextItem?.id || null);

      setTimeline(filtered);
    } catch (error) {
      console.error('Error fetching today data:', error);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  // ===========================================================================
  // TTS — Narrar "Lo que viene"
  // ===========================================================================
  const buildNarrationText = useCallback((): string => {
    if (timeline.length === 0) return 'No tienes actividades pendientes.';

    const currentMinutes = getCurrentMinutes();
    const parts: string[] = ['Esto es lo que viene.'];

    timeline.forEach((item) => {
      const timeLabel = formatTime12h(item.time);
      const diff = item.minutes - currentMinutes;
      const isNow = diff >= -30 && diff <= 0;
      const timeContext = isNow
        ? 'ahora mismo'
        : diff > 0
          ? `en ${Math.floor(diff / 60) > 0 ? `${Math.floor(diff / 60)} hora${Math.floor(diff / 60) > 1 ? 's' : ''} y ` : ''}${diff % 60} minutos`
          : '';

      switch (item.type) {
        case 'meal': {
          const ingredients: string[] = item.data.ingredients || [];
          const ingText = ingredients.length > 0 ? `: ${ingredients.slice(0, 5).join(', ')}` : '';
          parts.push(
            `${item.label} a las ${timeLabel}${timeContext ? `, ${timeContext}` : ''}${ingText}.`
          );
          break;
        }
        case 'stack': {
          const stackItems: Array<{ name: string; dose: string }> = item.data.items || [];
          const stackText = stackItems
            .slice(0, 4)
            .map((s) => `${s.name}${s.dose ? ` ${s.dose}` : ''}`)
            .join(', ');
          parts.push(
            `Suplementos a las ${timeLabel}${timeContext ? `, ${timeContext}` : ''}: ${stackText}.`
          );
          break;
        }
        case 'workout': {
          const exercises: Exercise[] = item.data.exercises || [];
          const isRest = item.data.isRestDay;
          const sessionLabel = item.data.sessionLabel || item.label;
          const preStacks: WorkoutStackItem[] = item.data.preStacks || [];
          const postStacks: WorkoutStackItem[] = item.data.postStacks || [];
          const preCardios: CardioItem[] = item.data.preCardios || [];
          const postCardios: CardioItem[] = item.data.postCardios || [];

          if (isRest) {
            parts.push('Hoy es día de descanso.');
          } else {
            // Pre-workout supplements first
            if (preStacks.length > 0) {
              parts.push(`Pre-entreno: ${preStacks.map((s) => `${s.name} ${s.dose}`).join(', ')}.`);
            }
            // Pre-workout cardio
            if (preCardios.length > 0) {
              preCardios.forEach((c) => {
                const eq = c.activity || c.cardio_type || 'cardio';
                const dur = c.duration_minutes ? `, ${c.duration_minutes} minutos` : '';
                parts.push(`Cardio pre-entreno: ${eq}${dur}.`);
              });
            }
            // Session
            parts.push(
              `Entrenamiento ${sessionLabel} a las ${timeLabel}${timeContext ? `, ${timeContext}` : ''}, con ${exercises.length} ejercicio${exercises.length !== 1 ? 's' : ''}.`
            );
            // Post-workout cardio
            if (postCardios.length > 0) {
              postCardios.forEach((c) => {
                const eq = c.activity || c.cardio_type || 'cardio';
                const dur = c.duration_minutes ? `, ${c.duration_minutes} minutos` : '';
                parts.push(`Cardio post-entreno: ${eq}${dur}.`);
              });
            }
            // Post-workout supplements
            if (postStacks.length > 0) {
              parts.push(
                `Post-entreno: ${postStacks.map((s) => `${s.name} ${s.dose}`).join(', ')}.`
              );
            }
          }
          break;
        }
        case 'cardio': {
          const c = item.data as CardioItem;
          const equipment = c.activity || c.cardio_type || 'sesión';
          const duration = c.duration_minutes ? `${c.duration_minutes} minutos` : '';
          const intensity = c.intensity ? `, intensidad ${c.intensity}` : '';
          const context = c.is_pre_workout
            ? ' antes del entrenamiento'
            : c.is_post_workout
              ? ' después del entrenamiento'
              : '';
          parts.push(
            `Cardio${context} a las ${timeLabel}${timeContext ? `, ${timeContext}` : ''}: ${equipment}${duration ? `, ${duration}` : ''}${intensity}.`
          );
          break;
        }
      }
    });

    parts.push('Eso es todo por ahora. A darle.');
    return parts.join(' ');
  }, [timeline]);

  const handleSpeak = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    if (speakingRef.current) {
      await stopSavage();
      speakingRef.current = false;
      setIsSpeaking(false);
      hankSpeakState.set(false);
      return;
    }

    // Strip emojis and fix abbreviations for TTS
    const raw = buildNarrationText();
    const text = raw
      .replace(
        /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{200D}\u{20E3}\u{E0020}-\u{E007F}]/gu,
        ''
      )
      .replace(/\bgr\b/gi, 'gramos')
      .replace(/\bml\b/gi, 'mililitros')
      .replace(/\bmg\b/gi, 'miligramos')
      .replace(/\bkcal\b/gi, 'kilocalorías')
      .replace(/\s{2,}/g, ' ')
      .trim();

    speakingRef.current = true;
    setIsSpeaking(true);
    hankSpeakState.set(true);

    // Voz juvenil con energía (Google Cloud TTS Chirp3-HD-Charon vía Cloudflare Worker)
    // Preset 'hype': dinámica, fuerte, con cuerpo
    // Cae automáticamente a expo-speech con pitch bajo si la red falla
    await speakSavage(text, {
      preset: 'hype',
      lang: 'es-US',
      onDone: () => {
        speakingRef.current = false;
        setIsSpeaking(false);
        hankSpeakState.set(false);
      },
      onError: () => {
        speakingRef.current = false;
        setIsSpeaking(false);
        hankSpeakState.set(false);
      },
    });
  }, [buildNarrationText]);

  // -------------------------------------------------------------------------
  // PREFETCH TTS — pre-calienta el caché del worker para que el primer
  // tap en AUDIO reproduzca casi instantáneo (R2 cache HIT).
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!timeline || timeline.length === 0) return;
    const raw = buildNarrationText();
    const text = raw
      .replace(
        /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{200D}\u{20E3}\u{E0020}-\u{E007F}]/gu,
        ''
      )
      .replace(/\bgr\b/gi, 'gramos')
      .replace(/\bml\b/gi, 'mililitros')
      .replace(/\bmg\b/gi, 'miligramos')
      .replace(/\bkcal\b/gi, 'kilocalorías')
      .replace(/\s{2,}/g, ' ')
      .trim();
    if (!text) return;
    // Delay pequeño para no competir con el render inicial
    const t = setTimeout(() => {
      prefetchSavage(text, { preset: 'hype', lang: 'es-US' });
    }, 600);
    return () => clearTimeout(t);
  }, [timeline, buildNarrationText]);

  useFocusEffect(
    useCallback(() => {
      fetchTodayData();
    }, [fetchTodayData])
  );

  // -------------------------------------------------------------------------
  // RENDER
  // -------------------------------------------------------------------------
  if (loading) {
    return (
      <View className="px-4 py-3">
        <View className="h-40 bg-zinc-900/50 rounded-xl items-center justify-center">
          <ActivityIndicator size="small" color="#DC2626" />
        </View>
      </View>
    );
  }

  if (timeline.length === 0) {
    return (
      <View className="px-4 py-3">
        <View className="flex-row items-center gap-2 mb-3">
          <Flame size={14} color="#DC2626" />
          <Text className="text-red-600 text-xs font-bold uppercase tracking-widest">HOY</Text>
        </View>
        <View className="bg-zinc-900/30 rounded-xl p-6 items-center">
          <Text className="text-zinc-500 text-sm font-mono">Sin plan configurado</Text>
          <Pressable
            onPress={() => router.push('/(tabs)/plan')}
            className="mt-3 px-4 py-2 rounded-lg active:scale-95"
            style={{ backgroundColor: '#DC262620' }}
          >
            <Text className="text-red-600 text-xs font-bold">CONFIGURAR PLAN</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const currentMinutes = getCurrentMinutes();

  return (
    <View className="px-4 py-3">
      {/* Header */}
      <View className="flex-row items-center justify-between mb-3">
        <View className="flex-row items-center gap-2">
          <Flame size={14} color="#DC2626" />
          <Text className="text-red-600 text-xs font-bold uppercase tracking-widest">
            LO QUE VIENE
          </Text>
        </View>
        <View className="flex-row items-center gap-2">
          {/* Ver Plan */}
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push('/(tabs)/plan');
            }}
            className="px-3 py-1.5 rounded-lg active:scale-95"
            style={{ backgroundColor: '#DC262615' }}
          >
            <Text className="text-red-600 text-[10px] font-bold tracking-wider">VER PLAN</Text>
          </Pressable>
        </View>
      </View>

      {/* Timeline */}
      <View className="relative">
        {/* Timeline line */}
        <View
          className="absolute left-[15px] top-4 bottom-4 w-[1px]"
          style={{ backgroundColor: '#27272a' }}
        />

        {timeline.map((item) => {
          const isNext = item.id === nextItemId;
          const diff = item.minutes - currentMinutes;
          const isPast = diff < -30;
          const countdown =
            item.time === '99:99' ? '' : formatTimeUntil(item.minutes, currentMinutes);

          // Timeline dot color
          let dotColor = '#3f3f46';
          if (isNext) {
            dotColor =
              item.type === 'meal'
                ? '#22c55e'
                : item.type === 'stack'
                  ? '#a855f7'
                  : item.type === 'cardio'
                    ? getCardioColor((item.data as CardioItem)?.cardio_type || '')
                    : '#DC2626';
          } else if (isPast) {
            dotColor = '#27272a';
          }

          return (
            <View
              key={item.id}
              className="flex-row mb-2"
              style={{ opacity: isPast && !isNext ? 0.5 : 1 }}
            >
              {/* Timeline dot */}
              <View className="w-[30px] items-center pt-3.5 z-10">
                <View
                  className="w-3 h-3 rounded-full"
                  style={{
                    backgroundColor: dotColor,
                    borderWidth: isNext ? 2 : 1,
                    borderColor: isNext ? '#000' : '#18181b',
                    shadowColor: isNext ? dotColor : 'transparent',
                    shadowOffset: { width: 0, height: 0 },
                    shadowOpacity: isNext ? 0.8 : 0,
                    shadowRadius: isNext ? 6 : 0,
                  }}
                />
              </View>

              {/* Card */}
              <View className="flex-1 ml-1">
                {item.type === 'meal' && (
                  <MealTimelineCard item={item} isNext={isNext} countdown={countdown} />
                )}
                {item.type === 'stack' && (
                  <StackTimelineCard item={item} isNext={isNext} countdown={countdown} />
                )}
                {item.type === 'workout' && (
                  <WorkoutTimelineCard item={item} isNext={isNext} countdown={countdown} />
                )}
                {item.type === 'cardio' && (
                  <CardioTimelineCard item={item} isNext={isNext} countdown={countdown} />
                )}
              </View>
            </View>
          );
        })}
      </View>

      {/* Footer: píldora unificada AUDIO + Hank (bottom-left del bloque) */}
      <View className="flex-row items-center mt-3">
        <View
          className="flex-row items-center rounded-lg overflow-hidden"
          style={{
            backgroundColor: isSpeaking ? '#DC262625' : '#DC262610',
            borderWidth: 1,
            borderColor: isSpeaking ? '#DC262650' : '#DC262625',
          }}
        >
          {/* Lado izquierdo: AUDIO */}
          <Pressable
            onPress={handleSpeak}
            className="px-3 py-1.5 active:opacity-70 flex-row items-center gap-1.5"
          >
            {isSpeaking ? (
              <VolumeX size={12} color="#DC2626" />
            ) : (
              <Volume2 size={12} color="#DC2626" />
            )}
            <Text className="text-red-600 text-[10px] font-bold tracking-wider">
              {isSpeaking ? 'PARAR' : 'AUDIO'}
            </Text>
          </Pressable>
          {/* Divider */}
          <View className="w-[1px] h-4" style={{ backgroundColor: '#DC262640' }} />
          {/* Lado derecho: Hank (mismo icono que el header del modal de chat) */}
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setHankChatOpen(true);
            }}
            className="px-2 py-1 active:opacity-70 items-center justify-center"
          >
            <View className="w-6 h-6 rounded-full bg-red-600/20 items-center justify-center">
              <GitlabIcon size={14} color="#DC2626" strokeWidth={2.5} />
            </View>
          </Pressable>
        </View>
      </View>
    </View>
  );
};

export default TodayCards;
