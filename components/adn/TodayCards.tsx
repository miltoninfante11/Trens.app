import React, { useState, useCallback } from 'react';
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
  Gauge,
  TrendingUp,
} from 'lucide-react-native';
import { router, useFocusEffect } from 'expo-router';
import * as Haptics from '../../lib/haptics';
import { supabase } from '../../lib/supabase';

// ============================================================================
// TYPES
// ============================================================================
interface Exercise {
  id: string;
  name: string;
  imageUrl?: string;
  videoUrl?: string;
  sessionIndex?: number; // 0=A, 1=B
}

interface TodayWorkout {
  routineName: string;
  exercises: Exercise[];
  isRestDay: boolean;
  isExternalMode?: boolean;
}

interface SessionWorkout {
  name: string;
  sessionIndex: number; // 0=A, 1=B
  exercises: Exercise[];
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
  workout_session_index?: number; // 0=A, 1=B, 2=AMBAS
}

interface MealItem {
  id: string;
  name: string;
  time: string;
  timeUntil: string;
  minutesUntil: number;
  ingredients: string[];
}

interface StackItemData {
  id: string;
  name: string;
  dose: string;
  time: string;
  timeUntil: string;
  minutesUntil: number;
  type: 'pill' | 'syringe' | 'powder' | 'liquid';
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

interface TodayCardsProps {
  userId: string;
}

// ============================================================================
// HELPERS - Misma lógica de PLAN para calcular tiempos
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

const getStackTypeIcon = (type: string) => {
  const iconProps = { size: 12, color: '#A855F7' };
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

// ============================================================================
// EXERCISE MINI CARD - Thumbnail del ejercicio
// ============================================================================
interface ExerciseMiniCardProps {
  exercise: Exercise;
}

const ExerciseMiniCard: React.FC<ExerciseMiniCardProps> = ({ exercise }) => {
  // Si tiene video, crear player pausado para mostrar primer frame (igual que WorkoutBlock)
  const videoPlayer = useVideoPlayer(exercise.videoUrl || null, (player) => {
    player.loop = false;
    player.muted = true;
    player.pause();
  });

  return (
    <View className="mr-2 items-center">
      <View
        className="w-14 h-14 rounded-lg items-center justify-center overflow-hidden"
        style={{
          backgroundColor: '#1a0505',
          borderWidth: 1,
          borderColor: '#DC262640',
        }}
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
// MAIN COMPONENT
// ============================================================================
export const TodayCards: React.FC<TodayCardsProps> = ({ userId }) => {
  const [loading, setLoading] = useState(true);
  const [workout, setWorkout] = useState<TodayWorkout | null>(null);
  const [sessions, setSessions] = useState<SessionWorkout[]>([]);
  const [hasDualSession, setHasDualSession] = useState(false);
  const [cardioItems, setCardioItems] = useState<CardioItem[]>([]);
  const [nextMeal, setNextMeal] = useState<MealItem | null>(null);
  const [nextStack, setNextStack] = useState<StackItemData | null>(null);
  const [workoutStacks, setWorkoutStacks] = useState<WorkoutStackItem[]>([]);

  // -------------------------------------------------------------------------
  // FETCH DATA - Usando lógica de PLAN para calcular próximos items
  // -------------------------------------------------------------------------
  const fetchTodayData = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }

    try {
      const currentMinutes = getCurrentMinutes();
      const today = new Date().getDay();
      let currentDayForCardio = 0; // training day index para cardio fetch

      // =====================================================================
      // 0. DETECT TRAINING MODE - Verificar si usa módulo GYM o modo personalizado
      // =====================================================================
      const { data: userProfile } = await supabase
        .from('user_profiles')
        .select('training_mode, external_schedule')
        .eq('user_id', userId)
        .single();

      const trainingMode = userProfile?.training_mode || 'none';
      const externalSchedule = userProfile?.external_schedule || {};

      // Cargar nombres guardados (fuente de verdad para renombramientos)
      const { data: profileNames } = await supabase
        .from('profiles')
        .select('training_routine_names')
        .eq('id', userId)
        .single();
      const routineNames = profileNames?.training_routine_names || {};

      // =====================================================================
      // 1A. SI ES MODO PERSONALIZADO - Usa el sistema rotativo de TRENS
      // =====================================================================
      if (trainingMode === 'external' && Object.keys(externalSchedule).length > 0) {
        // TRENS usa sistema ROTATIVO: training_current_day (0, 1, 2...)
        // NO basado en día de la semana (Lunes, Martes)
        // El external_schedule se convierte a días rotativos
        const { data: profileData } = await supabase
          .from('profiles')
          .select('training_current_day')
          .eq('id', userId)
          .single();

        const currentDayIndex = profileData?.training_current_day ?? 0;
        // Filtrar entradas válidas (que tengan muscleGroup definido)
        const scheduleEntries = Object.entries(externalSchedule).filter(
          ([, muscle]) => muscle && String(muscle).trim() !== ''
        );
        const totalDays = scheduleEntries.length;

        // Si no hay días válidos, mostrar descanso
        if (totalDays === 0) {
          console.warn('🏋️ ADN [PERSONALIZADO]: Sin días válidos configurados');
          setWorkout({
            routineName: 'SIN CONFIGURAR',
            exercises: [],
            isRestDay: true,
            isExternalMode: true,
          });
          setLoading(false);
          return;
        }

        // Obtener el día de entrenamiento actual (rotativo) - asegurar índice válido
        const safeIndex = Math.min(currentDayIndex, totalDays - 1) % totalDays;
        const [dayName, muscleGroup] = scheduleEntries[safeIndex] || ['', ''];
        const todayTraining = muscleGroup ? String(muscleGroup).trim() : null;

        console.warn(
          `🏋️ ADN [PERSONALIZADO]: Día ${safeIndex + 1}/${totalDays} → ${dayName}: ${todayTraining || 'DESCANSO'}`
        );
        console.warn('   Schedule:', scheduleEntries.map(([d, m]) => `${d}:${m}`).join(', '));

        // ===== CARGAR EJERCICIOS DEL DÍA ACTUAL (igual que modo GYM) =====
        const { data: exerciseConfigs } = await supabase
          .from('user_exercise_config')
          .select(
            `
            id,
            training_days,
            custom_media_url,
            session_index,
            exercises (
              id,
              name,
              default_media_url,
              thumbnail_url,
              video_url
            )
          `
          )
          .eq('user_id', userId)
          .order('display_order', { ascending: true });

        // Helper para verificar si es video
        const isVideoUrl = (url: string) => {
          if (!url) return false;
          const videoExtensions = ['.mp4', '.mov', '.avi', '.webm', '.m4v'];
          return videoExtensions.some((ext) => url.toLowerCase().includes(ext));
        };

        const externalExercises: Exercise[] = [];
        exerciseConfigs?.forEach((config: any) => {
          const days = config.training_days || [0];
          if (days.includes(currentDayIndex) && config.exercises) {
            const ex = config.exercises;
            const mediaUrl =
              config.custom_media_url || ex.default_media_url || ex.thumbnail_url || '';
            const explicitVideoUrl = ex.video_url || '';

            let imageUrl: string | undefined = undefined;
            let videoUrl: string | undefined = undefined;

            if (explicitVideoUrl) {
              videoUrl = explicitVideoUrl;
              imageUrl = mediaUrl || undefined;
            } else if (isVideoUrl(mediaUrl)) {
              videoUrl = mediaUrl;
            } else {
              imageUrl = mediaUrl || undefined;
            }

            externalExercises.push({
              id: config.id,
              name: ex.name,
              imageUrl,
              videoUrl,
              sessionIndex: config.session_index ?? 0,
            });
          }
        });

        console.warn(
          `🏋️ ADN [PERSONALIZADO]: ${externalExercises.length} ejercicios para día ${currentDayIndex}`
        );

        if (todayTraining) {
          // Usar training_routine_names (fuente de verdad) > external_schedule > default
          const savedName = routineNames[String(safeIndex)];
          const cleanSaved = savedName ? savedName.replace(/^Día\s*\d+\s*:\s*/i, '') : null;
          const cleanTraining = todayTraining.replace(/^Día\s*\d+\s*:\s*/i, '');
          const finalName = cleanSaved || cleanTraining;

          // Detectar dual session
          const hasSessionB = externalExercises.some((ex) => ex.sessionIndex === 1);
          setHasDualSession(hasSessionB);

          if (hasSessionB) {
            // Cargar nombres de sesiones
            const { data: profSessions } = await supabase
              .from('profiles')
              .select('training_session_names')
              .eq('id', userId)
              .single();
            const sNames =
              (profSessions?.training_session_names as Record<string, Record<string, string>>) ||
              {};
            const daySessionNames = sNames[String(safeIndex)] || {};

            const sessA: SessionWorkout = {
              name: daySessionNames['0'] || 'SESIÓN A',
              sessionIndex: 0,
              exercises: externalExercises.filter((ex) => (ex.sessionIndex ?? 0) === 0),
            };
            const sessB: SessionWorkout = {
              name: daySessionNames['1'] || 'SESIÓN B',
              sessionIndex: 1,
              exercises: externalExercises.filter((ex) => ex.sessionIndex === 1),
            };
            setSessions([sessA, sessB]);
          } else {
            setSessions([]);
          }

          setWorkout({
            routineName: finalName,
            exercises: externalExercises,
            isRestDay: false,
            isExternalMode: true,
          });
          // Set currentDayForCardio for later
          currentDayForCardio = safeIndex;
        } else {
          setWorkout({
            routineName: 'DESCANSO',
            exercises: externalExercises,
            isRestDay: true,
            isExternalMode: true,
          });
          setSessions([]);
          currentDayForCardio = safeIndex;
        }
      } else {
        // =====================================================================
        // 1B. MODO GYM MODULE - Cargar ejercicios del día actual
        // =====================================================================
        const { data: profileData } = await supabase
          .from('profiles')
          .select(
            'training_current_day, training_routine_names, training_frequency, plan_source, training_session_names'
          )
          .eq('id', userId)
          .single();

        const currentTrainingDay = profileData?.training_current_day ?? 0;
        const routineNamesGym = profileData?.training_routine_names || {};
        const rawRoutineName = routineNamesGym[String(currentTrainingDay)] || 'ENTRENAMIENTO';
        const routineName = rawRoutineName.replace(/^Día\s*\d+\s*:\s*/i, '');
        const frequency = profileData?.training_frequency ?? 0;
        const planSource = profileData?.plan_source;
        const sessionNamesMap =
          (profileData?.training_session_names as Record<string, Record<string, string>>) || {};

        const isManualPlan = frequency > 0 && (planSource === 'custom' || !planSource);

        // Fetch ejercicios del día actual con su media + session_index
        const { data: exerciseConfigs } = await supabase
          .from('user_exercise_config')
          .select(
            `
          id,
          training_days,
          custom_media_url,
          session_index,
          exercises (
            id,
            name,
            default_media_url,
            thumbnail_url,
            video_url
          )
        `
          )
          .eq('user_id', userId)
          .order('display_order', { ascending: true });

        const todayExercises: Exercise[] = [];

        const isVideoUrl = (url: string) => {
          if (!url) return false;
          const videoExtensions = ['.mp4', '.mov', '.avi', '.webm', '.m4v'];
          return videoExtensions.some((ext) => url.toLowerCase().includes(ext));
        };

        exerciseConfigs?.forEach((config: any) => {
          const days = config.training_days || [0];
          if (days.includes(currentTrainingDay) && config.exercises) {
            const ex = config.exercises;
            const mediaUrl =
              config.custom_media_url || ex.default_media_url || ex.thumbnail_url || '';
            const explicitVideoUrl = ex.video_url || '';

            let imageUrl: string | undefined = undefined;
            let videoUrl: string | undefined = undefined;

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
        const hasConfiguredDays = frequency > 0;
        const showAsPersonalized = isManualPlan && hasConfiguredDays;

        // Detectar dual session para este día
        const daySessionNames = sessionNamesMap[String(currentTrainingDay)] || {};
        const hasSessionB =
          todayExercises.some((ex) => ex.sessionIndex === 1) || !!daySessionNames['1'];
        setHasDualSession(hasSessionB);

        if (hasSessionB) {
          const sessA: SessionWorkout = {
            name: daySessionNames['0'] || 'SESIÓN A',
            sessionIndex: 0,
            exercises: todayExercises.filter((ex) => (ex.sessionIndex ?? 0) === 0),
          };
          const sessB: SessionWorkout = {
            name: daySessionNames['1'] || 'SESIÓN B',
            sessionIndex: 1,
            exercises: todayExercises.filter((ex) => ex.sessionIndex === 1),
          };
          setSessions([sessA, sessB]);
        } else {
          setSessions([]);
        }

        setWorkout({
          routineName: isRestDay ? 'DESCANSO' : routineName,
          exercises: todayExercises,
          isRestDay,
          isExternalMode: showAsPersonalized,
        });
        currentDayForCardio = currentTrainingDay;
      } // Fin del else (modo GYM MODULE)

      // =====================================================================
      // 1C. FETCH CARDIO BLOCKS - Para el día de entrenamiento actual
      // =====================================================================
      const { data: cardioData } = await supabase
        .from('cardio_blocks')
        .select('*')
        .eq('user_id', userId);

      if (cardioData && cardioData.length > 0) {
        const todayCardios = cardioData.filter((c: any) => {
          // Filtrar por día de la semana
          const matchesDay = c.days_of_week?.includes(today) ?? true;
          return matchesDay;
        });
        setCardioItems(todayCardios as CardioItem[]);
      } else {
        setCardioItems([]);
      }

      // =====================================================================
      // 2. FETCH MEALS - Usando lógica de PLAN
      // =====================================================================
      const { data: mealsData } = await supabase
        .from('meals')
        .select('id, name, scheduled_time, ingredients')
        .eq('user_id', userId)
        .order('scheduled_time', { ascending: true });

      // Procesar comidas y encontrar la próxima
      interface MealCandidate {
        id: string;
        name: string;
        time: string;
        minutes: number;
        diff: number;
        ingredients: string[];
      }

      const mealCandidates: MealCandidate[] = [];

      mealsData?.forEach((meal) => {
        if (meal.scheduled_time) {
          const timeStr = meal.scheduled_time.slice(0, 5);
          const minutes = parseTimeToMinutes(timeStr);
          const diff = minutes - currentMinutes;

          // Extraer nombres de ingredientes
          const ingredientsList: string[] = [];
          if (Array.isArray(meal.ingredients)) {
            meal.ingredients.forEach((ing: any) => {
              if (ing?.name) ingredientsList.push(ing.name);
            });
          }

          mealCandidates.push({
            id: meal.id,
            name: meal.name || 'COMIDA',
            time: timeStr,
            minutes,
            diff,
            ingredients: ingredientsList,
          });
        }
      });

      // Encontrar próxima comida (misma lógica que getCurrentTimelineIndex de PLAN)
      // Ordenar: primero los que aún no pasaron, luego los que ya pasaron
      const futureMeals = mealCandidates.filter((m) => m.diff >= 0).sort((a, b) => a.diff - b.diff);
      const pastMeals = mealCandidates.filter((m) => m.diff < 0).sort((a, b) => b.diff - a.diff);

      // Tomar el próximo que no ha pasado, o el más reciente que pasó
      const selectedMeal = futureMeals[0] || pastMeals[0] || null;

      if (selectedMeal) {
        setNextMeal({
          id: selectedMeal.id,
          name: selectedMeal.name,
          time: selectedMeal.time,
          timeUntil: formatTimeUntil(selectedMeal.minutes, currentMinutes),
          minutesUntil: selectedMeal.diff,
          ingredients: selectedMeal.ingredients.slice(0, 4), // Max 4 ingredientes para preview
        });
      } else {
        setNextMeal(null);
      }

      // =====================================================================
      // 3. FETCH STACKS - Próximo compuesto (NO pre/post workout)
      // =====================================================================
      const { data: stacksData } = await supabase
        .from('supplement_stack')
        .select('id, name, dose, time, type, days_of_week, is_pre_workout, is_post_workout, workout_session_index')
        .eq('user_id', userId)
        .eq('is_active', true);

      interface StackCandidate {
        id: string;
        name: string;
        dose: string;
        time: string;
        type: 'pill' | 'syringe' | 'powder' | 'liquid';
        minutes: number;
        diff: number;
      }

      const stackCandidates: StackCandidate[] = [];
      const prePostStacks: WorkoutStackItem[] = [];

      stacksData?.forEach((stack) => {
        const matchesToday = stack.days_of_week?.includes(today) ?? true;
        if (!matchesToday) return;

        // Collect pre/post workout stacks
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

        // Regular timed stacks
        if (stack.time) {
          const timeStr = stack.time.slice(0, 5);
          const minutes = parseTimeToMinutes(timeStr);
          const diff = minutes - currentMinutes;

          stackCandidates.push({
            id: stack.id,
            name: stack.name,
            dose: stack.dose || '',
            time: timeStr,
            type: (stack.type as any) || 'pill',
            minutes,
            diff,
          });
        }
      });

      // Encontrar próximo stack (misma lógica)
      const futureStacks = stackCandidates
        .filter((s) => s.diff >= 0)
        .sort((a, b) => a.diff - b.diff);
      const pastStacks = stackCandidates.filter((s) => s.diff < 0).sort((a, b) => b.diff - a.diff);

      const selectedStack = futureStacks[0] || pastStacks[0] || null;

      if (selectedStack) {
        setNextStack({
          id: selectedStack.id,
          name: selectedStack.name,
          dose: selectedStack.dose,
          time: selectedStack.time,
          type: selectedStack.type,
          timeUntil: formatTimeUntil(selectedStack.minutes, currentMinutes),
          minutesUntil: selectedStack.diff,
        });
      } else {
        setNextStack(null);
      }

      setWorkoutStacks(prePostStacks);
    } catch (error) {
      console.error('Error fetching today data:', error);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  // Refetch cuando la pantalla obtiene foco
  useFocusEffect(
    useCallback(() => {
      fetchTodayData();
    }, [fetchTodayData])
  );

  // -------------------------------------------------------------------------
  // HANDLERS
  // -------------------------------------------------------------------------
  const handleWorkoutPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push('/(tabs)/gym');
  };

  const handlePlanPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push('/(tabs)/plan');
  };

  // -------------------------------------------------------------------------
  // RENDER: Loading
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

  // -------------------------------------------------------------------------
  // HELPERS: Cardio grouping
  // -------------------------------------------------------------------------
  const preCardios = cardioItems.filter((c) => c.is_pre_workout);
  const postCardios = cardioItems.filter((c) => c.is_post_workout);
  const scheduledCardios = cardioItems.filter(
    (c) => !c.is_pre_workout && !c.is_post_workout && c.scheduled_time
  );

  // HELPERS: Stack grouping
  const preStacks = workoutStacks.filter((s) => s.is_pre_workout);
  const postStacks = workoutStacks.filter((s) => s.is_post_workout);

  // Filter cardio/stacks by session
  const getSessionPreCardios = (sessionIdx: number) =>
    preCardios.filter(
      (c) =>
        c.workout_session_index === sessionIdx ||
        c.workout_session_index === 2 ||
        c.workout_session_index == null
    );
  const getSessionPostCardios = (sessionIdx: number) =>
    postCardios.filter(
      (c) =>
        c.workout_session_index === sessionIdx ||
        c.workout_session_index === 2 ||
        c.workout_session_index == null
    );
  const getSessionPreStacks = (sessionIdx: number) =>
    preStacks.filter(
      (s) =>
        s.workout_session_index === sessionIdx ||
        s.workout_session_index === 2 ||
        s.workout_session_index == null
    );
  const getSessionPostStacks = (sessionIdx: number) =>
    postStacks.filter(
      (s) =>
        s.workout_session_index === sessionIdx ||
        s.workout_session_index === 2 ||
        s.workout_session_index == null
    );

  // Get cardio color by type
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

  // Current time for scheduled cardio countdown
  const currentMinutesNow = getCurrentMinutes();

  // -------------------------------------------------------------------------
  // RENDER: Stack pill (compact inline)
  // -------------------------------------------------------------------------
  const renderStackPill = (stack: WorkoutStackItem) => {
    return (
      <View
        key={stack.id}
        className="flex-row items-center gap-1.5 px-3 py-1.5 rounded-full mr-2"
        style={{
          backgroundColor: '#A855F710',
          borderWidth: 1,
          borderColor: '#A855F725',
        }}
      >
        {getStackTypeIcon(stack.type)}
        <Text className="text-purple-400 text-[10px] font-bold" numberOfLines={1}>
          {stack.name}
        </Text>
        {stack.dose ? (
          <Text className="text-purple-400/60 text-[9px] font-mono">{stack.dose}</Text>
        ) : null}
      </View>
    );
  };

  // -------------------------------------------------------------------------
  // RENDER: Cardio mini card
  // -------------------------------------------------------------------------
  const renderCardioCard = (cardio: CardioItem, label: string, sessionLabel?: string) => {
    const color = getCardioColor(cardio.cardio_type);
    // Countdown for scheduled cardios
    let countdown: string | undefined;
    if (cardio.scheduled_time) {
      const targetMin = parseTimeToMinutes(cardio.scheduled_time.slice(0, 5));
      countdown = formatTimeUntil(targetMin, currentMinutesNow);
    }
    return (
      <Pressable
        key={cardio.id}
        onPress={handleWorkoutPress}
        className="rounded-xl overflow-hidden"
        style={{
          backgroundColor: '#080808',
          borderWidth: 1,
          borderColor: `${color}25`,
        }}
      >
        <View className="flex-row items-center justify-between px-4 py-3">
          <View className="flex-row items-center gap-3 flex-1">
            <View
              className="w-8 h-8 rounded-full items-center justify-center"
              style={{ backgroundColor: `${color}15` }}
            >
              <Flame size={14} color={color} />
            </View>
            <View className="flex-1">
              <View className="flex-row items-center gap-2">
                <Text
                  className="text-[10px] font-bold font-mono tracking-widest uppercase"
                  style={{ color }}
                >
                  {label}
                </Text>
                {sessionLabel && (
                  <View className="px-1.5 py-0.5 rounded" style={{ backgroundColor: '#A855F715' }}>
                    <Text className="text-purple-400 text-[8px] font-bold font-mono">
                      {sessionLabel}
                    </Text>
                  </View>
                )}
              </View>
              <Text
                className="text-white font-bold text-sm uppercase tracking-tight"
                numberOfLines={1}
              >
                {cardio.cardio_type.replace('_', ' ')} · {cardio.activity}
              </Text>
            </View>
          </View>

          <View className="flex-row items-center gap-3">
            <View className="items-end gap-1">
              <View className="flex-row items-center gap-1">
                <Clock size={9} color={color} />
                <Text className="text-[10px] font-mono font-bold" style={{ color }}>
                  {cardio.duration_minutes} MIN
                </Text>
              </View>
              {countdown && (
                <Text
                  className="text-[9px] font-bold font-mono"
                  style={{
                    color: countdown === 'AHORA' ? color : '#71717a',
                  }}
                >
                  {countdown}
                </Text>
              )}
              <View className="flex-row items-center gap-2">
                {cardio.target_heart_rate ? (
                  <View className="flex-row items-center gap-0.5">
                    <Activity size={8} color="#DC2626" />
                    <Text className="text-zinc-500 text-[8px] font-mono">
                      {cardio.target_heart_rate}
                    </Text>
                  </View>
                ) : null}
                {cardio.speed ? (
                  <View className="flex-row items-center gap-0.5">
                    <Gauge size={8} color="#F97316" />
                    <Text className="text-zinc-500 text-[8px] font-mono">{cardio.speed} km/h</Text>
                  </View>
                ) : null}
                {cardio.incline ? (
                  <View className="flex-row items-center gap-0.5">
                    <TrendingUp size={8} color="#8B5CF6" />
                    <Text className="text-zinc-500 text-[8px] font-mono">{cardio.incline}%</Text>
                  </View>
                ) : null}
              </View>
            </View>
            <ChevronRight size={14} color="#52525b" />
          </View>
        </View>

        {/* Badges row */}
        {(cardio.is_fasted || cardio.intensity) && (
          <View className="flex-row gap-1.5 px-4 pb-2.5">
            <View className="px-2 py-0.5 rounded-full" style={{ backgroundColor: `${color}10` }}>
              <Text
                className="text-[8px] font-mono font-bold tracking-wider"
                style={{ color: `${color}99` }}
              >
                {cardio.intensity}
              </Text>
            </View>
            {cardio.is_fasted && (
              <View className="px-2 py-0.5 rounded-full" style={{ backgroundColor: '#22C55E10' }}>
                <Text className="text-green-600 text-[8px] font-mono font-bold tracking-wider">
                  EN AYUNAS
                </Text>
              </View>
            )}
          </View>
        )}
      </Pressable>
    );
  };

  // -------------------------------------------------------------------------
  // RENDER: Session block (session + its pre/post cardio + stacks)
  // -------------------------------------------------------------------------
  const renderSessionBlock = (session: SessionWorkout, isSecondary: boolean = false) => {
    const accentColor = isSecondary ? '#A855F7' : '#DC2626';
    const bgColor = isSecondary ? '#0a050f' : '#0a0505';
    const borderColor = isSecondary ? '#A855F740' : '#DC262660';
    const sessionIdx = session.sessionIndex;

    const sessionPreCardios = getSessionPreCardios(sessionIdx);
    const sessionPostCardios = getSessionPostCardios(sessionIdx);
    const sessionPreStacks = getSessionPreStacks(sessionIdx);
    const sessionPostStacks = getSessionPostStacks(sessionIdx);

    const hasPreContent = sessionPreCardios.length > 0 || sessionPreStacks.length > 0;
    const hasPostContent = sessionPostCardios.length > 0 || sessionPostStacks.length > 0;

    return (
      <View
        key={`session-block-${sessionIdx}`}
        className="mb-3 rounded-2xl overflow-hidden"
        style={{
          backgroundColor: '#050505',
          borderWidth: 1,
          borderColor: `${accentColor}20`,
        }}
      >
        {/* Session header */}
        <Pressable
          onPress={handleWorkoutPress}
          className="rounded-xl overflow-hidden mx-1 mt-1"
          style={{ backgroundColor: bgColor, borderWidth: 1, borderColor }}
        >
          <View className="flex-row items-center justify-between px-4 pt-3 pb-2">
            <View className="flex-row items-center gap-2">
              <View
                className="w-7 h-7 rounded-full items-center justify-center"
                style={{ backgroundColor: `${accentColor}20` }}
              >
                <Dumbbell size={12} color={accentColor} />
              </View>
              <View>
                <Text
                  className="text-[10px] font-bold uppercase tracking-widest"
                  style={{ color: accentColor }}
                >
                  {session.name}
                </Text>
                <Text
                  className="font-bold text-sm text-white uppercase tracking-tight"
                  numberOfLines={1}
                >
                  {session.exercises.length} ejercicios
                </Text>
              </View>
            </View>
            <ChevronRight size={14} color="#52525b" />
          </View>

          {session.exercises.length > 0 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              className="pb-3"
              contentContainerStyle={{ paddingHorizontal: 16 }}
            >
              {session.exercises.map((ex) => (
                <ExerciseMiniCard key={ex.id} exercise={ex} />
              ))}
            </ScrollView>
          )}
        </Pressable>

        {/* PRE-workout items for this session */}
        {hasPreContent && (
          <View className="px-2 pt-2">
            <Text className="text-zinc-600 text-[9px] font-mono tracking-widest px-2 mb-1.5">
              PRE-ENTRENO
            </Text>
            {sessionPreStacks.length > 0 && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                className="mb-2"
                contentContainerStyle={{ paddingHorizontal: 8 }}
              >
                {sessionPreStacks.map(renderStackPill)}
              </ScrollView>
            )}
            {sessionPreCardios.map((c) => (
              <View key={c.id} className="px-1 mb-1">
                {renderCardioCard(c, 'CARDIO PRE')}
              </View>
            ))}
          </View>
        )}

        {/* POST-workout items for this session */}
        {hasPostContent && (
          <View className="px-2 pt-2 pb-1">
            <Text className="text-zinc-600 text-[9px] font-mono tracking-widest px-2 mb-1.5">
              POST-ENTRENO
            </Text>
            {sessionPostStacks.length > 0 && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                className="mb-2"
                contentContainerStyle={{ paddingHorizontal: 8 }}
              >
                {sessionPostStacks.map(renderStackPill)}
              </ScrollView>
            )}
            {sessionPostCardios.map((c) => (
              <View key={c.id} className="px-1 mb-1">
                {renderCardioCard(c, 'CARDIO POST')}
              </View>
            ))}
          </View>
        )}

        {!hasPreContent && !hasPostContent ? null : <View className="h-1" />}
      </View>
    );
  };

  // -------------------------------------------------------------------------
  // RENDER: Main
  // -------------------------------------------------------------------------
  return (
    <View className="px-4 py-3">
      {/* Header */}
      <View className="flex-row items-center gap-2 mb-3">
        <Flame size={14} color="#DC2626" />
        <Text className="text-fire-red text-xs font-bold uppercase tracking-widest">HOY</Text>
      </View>

      {/* ================================================================== */}
      {/* TRAINING BLOCK: Sessions + Cardio + Stacks agrupados              */}
      {/* ================================================================== */}

      {hasDualSession && sessions.length > 0 ? (
        <>
          {/* ============================================================ */}
          {/* DUAL SESSION MODE: Sesión A y B como bloques independientes  */}
          {/* ============================================================ */}
          {renderSessionBlock(sessions[0], false)}
          {sessions.length > 1 && renderSessionBlock(sessions[1], true)}
        </>
      ) : (
        <>
          {/* ============================================================ */}
          {/* SINGLE SESSION MODE: Un bloque con todo                      */}
          {/* ============================================================ */}
          <View
            className="mb-3 rounded-2xl overflow-hidden"
            style={{
              backgroundColor: '#050505',
              borderWidth: 1,
              borderColor: workout?.isRestDay ? '#27272a20' : '#DC262620',
            }}
          >
            {/* PRE stacks + cardio */}
            {(preStacks.length > 0 || preCardios.length > 0) && (
              <View className="px-2 pt-2">
                <Text className="text-zinc-600 text-[9px] font-mono tracking-widest px-2 mb-1.5">
                  PRE-ENTRENO
                </Text>
                {preStacks.length > 0 && (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    className="mb-2"
                    contentContainerStyle={{ paddingHorizontal: 8 }}
                  >
                    {preStacks.map(renderStackPill)}
                  </ScrollView>
                )}
                {preCardios.map((c) => (
                  <View key={c.id} className="px-1 mb-1">
                    {renderCardioCard(c, 'CARDIO PRE')}
                  </View>
                ))}
              </View>
            )}

            {/* Main workout card */}
            <Pressable
              onPress={handleWorkoutPress}
              className="rounded-xl overflow-hidden mx-1 mt-1"
              style={{
                backgroundColor: '#0a0505',
                borderWidth: 1,
                borderColor: workout?.isRestDay ? '#3f3f46' : '#DC262660',
              }}
            >
              <View className="flex-row items-center justify-between px-4 pt-3 pb-2">
                <View className="flex-row items-center gap-2">
                  <View
                    className="w-7 h-7 rounded-full items-center justify-center"
                    style={{
                      backgroundColor: workout?.isRestDay ? '#27272a' : '#DC262620',
                    }}
                  >
                    {workout?.isRestDay ? (
                      <Zap size={12} color="#71717a" />
                    ) : (
                      <Dumbbell size={12} color="#DC2626" />
                    )}
                  </View>
                  <View>
                    <Text className="text-fire-red text-[10px] font-bold uppercase tracking-widest">
                      🔥 BLOQUE ENTRENO
                    </Text>
                    <Text
                      className="font-bold text-sm uppercase tracking-tight"
                      style={{ color: workout?.isRestDay ? '#71717a' : '#ffffff' }}
                      numberOfLines={1}
                    >
                      {workout?.routineName || 'SIN RUTINA'}
                    </Text>
                  </View>
                </View>

                <View className="flex-row items-center gap-2">
                  {!workout?.isRestDay && !workout?.isExternalMode && workout?.exercises && (
                    <View
                      className="px-2 py-1 rounded-md"
                      style={{ backgroundColor: '#DC262620' }}
                    >
                      <Text className="text-fire-red text-[10px] font-mono font-bold">
                        {workout.exercises.length} ejercicios
                      </Text>
                    </View>
                  )}
                  {!workout?.isRestDay && workout?.isExternalMode && (
                    <View
                      className="px-2 py-1 rounded-md"
                      style={{ backgroundColor: '#a855f720' }}
                    >
                      <Text className="text-purple-400 text-[10px] font-mono font-bold">
                        ⚡ PERSONALIZADO
                      </Text>
                    </View>
                  )}
                  <ChevronRight size={14} color="#52525b" />
                </View>
              </View>

              {!workout?.isRestDay && workout?.exercises && workout.exercises.length > 0 && (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  className="pb-3"
                  contentContainerStyle={{ paddingHorizontal: 16 }}
                >
                  {workout.exercises.map((ex) => (
                    <ExerciseMiniCard key={ex.id} exercise={ex} />
                  ))}
                </ScrollView>
              )}

              {!workout?.isRestDay &&
                workout?.isExternalMode &&
                (!workout?.exercises || workout.exercises.length === 0) && (
                  <View className="px-4 pb-3">
                    <Text className="text-zinc-400 text-xs font-mono">
                      ⚡ Toca para agregar ejercicios a tu rutina
                    </Text>
                  </View>
                )}

              {workout?.isRestDay && (
                <View className="px-4 pb-3">
                  <Text className="text-zinc-600 text-xs font-mono">
                    ⚡ Recuperación activa recomendada
                  </Text>
                </View>
              )}
            </Pressable>

            {/* POST stacks + cardio */}
            {(postStacks.length > 0 || postCardios.length > 0) && (
              <View className="px-2 pt-2 pb-1">
                <Text className="text-zinc-600 text-[9px] font-mono tracking-widest px-2 mb-1.5">
                  POST-ENTRENO
                </Text>
                {postStacks.length > 0 && (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    className="mb-2"
                    contentContainerStyle={{ paddingHorizontal: 8 }}
                  >
                    {postStacks.map(renderStackPill)}
                  </ScrollView>
                )}
                {postCardios.map((c) => (
                  <View key={c.id} className="px-1 mb-1">
                    {renderCardioCard(c, 'CARDIO POST')}
                  </View>
                ))}
              </View>
            )}

            <View className="h-1" />
          </View>
        </>
      )}

      {/* SCHEDULED CARDIO (con hora específica, no PRE/POST) */}
      {scheduledCardios.map((c) =>
        renderCardioCard(c, `🏃 CARDIO · ${formatTime12h(c.scheduled_time || '')}`)
      )}

      {/* ================================================================== */}
      {/* CARD: PRÓXIMA COMIDA                                              */}
      {/* ================================================================== */}
      <Pressable
        onPress={handlePlanPress}
        className="mb-3 rounded-xl p-4"
        style={{
          backgroundColor: '#050a05',
          borderWidth: 1,
          borderColor: nextMeal ? '#22c55e40' : '#3f3f46',
        }}
      >
        <View className="flex-row items-center justify-between mb-2">
          <View className="flex-row items-center gap-2">
            <View
              className="w-7 h-7 rounded-full items-center justify-center"
              style={{
                backgroundColor: nextMeal ? '#22c55e20' : '#27272a',
              }}
            >
              <Utensils size={12} color={nextMeal ? '#22c55e' : '#71717a'} />
            </View>
            <View>
              <Text className="text-green-500 text-[10px] font-bold uppercase tracking-widest">
                PRÓXIMA COMIDA
              </Text>
              <Text
                className="font-bold text-sm text-white uppercase tracking-tight"
                numberOfLines={1}
              >
                {nextMeal?.name || 'SIN PLAN'}
              </Text>
            </View>
          </View>

          <View className="flex-row items-center gap-2">
            {nextMeal && (
              <View className="items-end">
                <View className="flex-row items-center gap-1">
                  <Clock size={10} color="#22c55e" />
                  <Text className="text-green-500 text-[10px] font-mono">
                    {formatTime12h(nextMeal.time)}
                  </Text>
                </View>
                <Text
                  className="text-[10px] font-bold"
                  style={{
                    color:
                      nextMeal.minutesUntil >= 0 && nextMeal.minutesUntil <= 30
                        ? '#22c55e'
                        : '#71717a',
                  }}
                >
                  {nextMeal.timeUntil}
                </Text>
              </View>
            )}
            <ChevronRight size={14} color="#52525b" />
          </View>
        </View>

        {/* Ingredientes Preview */}
        {nextMeal && nextMeal.ingredients.length > 0 && (
          <View className="flex-row flex-wrap gap-1 mt-1">
            {nextMeal.ingredients.map((ing, idx) => (
              <View
                key={idx}
                className="px-2 py-0.5 rounded-full"
                style={{ backgroundColor: '#22c55e15' }}
              >
                <Text className="text-zinc-400 text-[9px]">{ing}</Text>
              </View>
            ))}
            {nextMeal.ingredients.length === 4 && (
              <Text className="text-zinc-600 text-[9px] ml-1">+más</Text>
            )}
          </View>
        )}

        {!nextMeal && (
          <Text className="text-zinc-600 text-xs font-mono">Configura tu plan de comidas</Text>
        )}
      </Pressable>

      {/* ================================================================== */}
      {/* CARD: PRÓXIMO STACK                                               */}
      {/* ================================================================== */}
      {nextStack && (
        <Pressable
          onPress={handlePlanPress}
          className="rounded-xl p-3 flex-row items-center justify-between"
          style={{
            backgroundColor: '#0a0510',
            borderWidth: 1,
            borderColor: '#a855f740',
          }}
        >
          <View className="flex-row items-center gap-3">
            <View
              className="w-8 h-8 rounded-full items-center justify-center"
              style={{ backgroundColor: '#a855f720' }}
            >
              {getStackTypeIcon(nextStack.type)}
            </View>
            <View>
              <Text className="text-purple-400 text-[10px] font-bold uppercase tracking-widest">
                💊 PRÓXIMO STACK
              </Text>
              <Text className="font-bold text-sm text-white" numberOfLines={1}>
                {nextStack.name}
                {nextStack.dose && (
                  <Text className="text-purple-400 font-normal"> · {nextStack.dose}</Text>
                )}
              </Text>
            </View>
          </View>

          <View className="flex-row items-center gap-2">
            <View className="items-end">
              <View className="flex-row items-center gap-1">
                <Clock size={10} color="#a855f7" />
                <Text className="text-purple-400 text-[10px] font-mono">
                  {formatTime12h(nextStack.time)}
                </Text>
              </View>
              <Text
                className="text-[10px] font-bold"
                style={{
                  color:
                    nextStack.minutesUntil >= 0 && nextStack.minutesUntil <= 30
                      ? '#a855f7'
                      : '#71717a',
                }}
              >
                {nextStack.timeUntil}
              </Text>
            </View>
            <ChevronRight size={14} color="#52525b" />
          </View>
        </Pressable>
      )}
    </View>
  );
};

export default TodayCards;
