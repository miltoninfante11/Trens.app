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
}

interface TodayWorkout {
  routineName: string;
  exercises: Exercise[];
  isRestDay: boolean;
  isExternalMode?: boolean; // True si es modo personalizado (sin ejercicios detallados)
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
  const [nextMeal, setNextMeal] = useState<MealItem | null>(null);
  const [nextStack, setNextStack] = useState<StackItemData | null>(null);

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
      const dayNames = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
      const todayName = dayNames[today];

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
          setWorkout({
            routineName: cleanSaved || cleanTraining,
            exercises: externalExercises,
            isRestDay: false,
            isExternalMode: true,
          });
        } else {
          setWorkout({
            routineName: 'DESCANSO',
            exercises: externalExercises,
            isRestDay: true,
            isExternalMode: true,
          });
        }
      } else {
        // =====================================================================
        // 1B. MODO GYM MODULE - Cargar ejercicios del día actual
        // =====================================================================
        const { data: profileData } = await supabase
          .from('profiles')
          .select('training_current_day, training_routine_names, training_frequency, plan_source')
          .eq('id', userId)
          .single();

        const currentTrainingDay = profileData?.training_current_day ?? 0;
        const routineNames = profileData?.training_routine_names || {};
        // Limpiar prefijo "Día X:" si ya viene incluido
        const rawRoutineName = routineNames[String(currentTrainingDay)] || 'ENTRENAMIENTO';
        const routineName = rawRoutineName.replace(/^Día\s*\d+\s*:\s*/i, '');
        const frequency = profileData?.training_frequency ?? 0;
        const planSource = profileData?.plan_source;

        // Detectar si es plan personalizado (creado manualmente o sin template de Hank)
        // Si tiene días pero training_mode no es 'external', sincronizar automáticamente
        const isManualPlan = frequency > 0 && (planSource === 'custom' || !planSource);

        // Fetch ejercicios del día actual con su media
        const { data: exerciseConfigs } = await supabase
          .from('user_exercise_config')
          .select(
            `
          id,
          training_days,
          custom_media_url,
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

        // Filtrar ejercicios del día actual (misma lógica que PLAN)
        const todayExercises: Exercise[] = [];

        // Helper para verificar si es video
        const isVideoUrl = (url: string) => {
          if (!url) return false;
          const videoExtensions = ['.mp4', '.mov', '.avi', '.webm', '.m4v'];
          return videoExtensions.some((ext) => url.toLowerCase().includes(ext));
        };

        exerciseConfigs?.forEach((config: any) => {
          const days = config.training_days || [0];
          if (days.includes(currentTrainingDay) && config.exercises) {
            const ex = config.exercises;

            // Mapear igual que PLAN
            const mediaUrl =
              config.custom_media_url || ex.default_media_url || ex.thumbnail_url || '';
            const explicitVideoUrl = ex.video_url || '';

            // Priorizar video_url explícito, luego verificar si media_url es video
            let imageUrl: string | undefined = undefined;
            let videoUrl: string | undefined = undefined;

            if (explicitVideoUrl) {
              // Tiene video_url explícito
              videoUrl = explicitVideoUrl;
              imageUrl = mediaUrl || undefined; // media_url como thumbnail
            } else if (isVideoUrl(mediaUrl)) {
              // media_url es un video
              videoUrl = mediaUrl;
            } else {
              // Es imagen
              imageUrl = mediaUrl || undefined;
            }

            todayExercises.push({
              id: config.id,
              name: ex.name,
              imageUrl,
              videoUrl,
            });
          }
        });

        const isRestDay = todayExercises.length === 0 && frequency === 0;

        // Si tiene días configurados pero sin ejercicios, mostrar como personalizado (no descanso)
        const hasConfiguredDays = frequency > 0;
        const showAsPersonalized = isManualPlan && hasConfiguredDays;

        setWorkout({
          routineName: isRestDay ? 'DESCANSO' : routineName,
          exercises: todayExercises,
          isRestDay,
          isExternalMode: showAsPersonalized, // Mostrar como personalizado si es plan manual
        });
      } // Fin del else (modo GYM MODULE)

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
        .select('id, name, dose, time, type, days_of_week, is_pre_workout, is_post_workout')
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

      stacksData?.forEach((stack) => {
        // Solo stacks que:
        // - Tienen hora
        // - NO son pre/post workout
        // - Están programados para hoy
        if (
          stack.time &&
          !stack.is_pre_workout &&
          !stack.is_post_workout &&
          (stack.days_of_week?.includes(today) ?? true)
        ) {
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
      {/* CARD 1: ENTRENAMIENTO DE HOY - Con slider de ejercicios           */}
      {/* ================================================================== */}
      <Pressable
        onPress={handleWorkoutPress}
        className="mb-3 rounded-xl overflow-hidden"
        style={{
          backgroundColor: '#0a0505',
          borderWidth: 1,
          borderColor: workout?.isRestDay ? '#3f3f46' : '#DC262660',
        }}
      >
        {/* Header */}
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
              <View className="px-2 py-1 rounded-md" style={{ backgroundColor: '#DC262620' }}>
                <Text className="text-fire-red text-[10px] font-mono font-bold">
                  {workout.exercises.length} ejercicios
                </Text>
              </View>
            )}
            {!workout?.isRestDay && workout?.isExternalMode && (
              <View className="px-2 py-1 rounded-md" style={{ backgroundColor: '#a855f720' }}>
                <Text className="text-purple-400 text-[10px] font-mono font-bold">
                  ⚡ PERSONALIZADO
                </Text>
              </View>
            )}
            <ChevronRight size={14} color="#52525b" />
          </View>
        </View>

        {/* Slider de Ejercicios (ambos modos: GYM y personalizado) */}
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

        {/* Modo personalizado sin ejercicios - Opción de agregar */}
        {!workout?.isRestDay &&
          workout?.isExternalMode &&
          (!workout?.exercises || workout.exercises.length === 0) && (
            <View className="px-4 pb-3">
              <Text className="text-zinc-400 text-xs font-mono">
                ⚡ Toca para agregar ejercicios a tu rutina
              </Text>
            </View>
          )}

        {/* Día de descanso */}
        {workout?.isRestDay && (
          <View className="px-4 pb-3">
            <Text className="text-zinc-600 text-xs font-mono">
              ⚡ Recuperación activa recomendada
            </Text>
          </View>
        )}
      </Pressable>

      {/* ================================================================== */}
      {/* CARD 2: PRÓXIMA COMIDA - Con ingredientes                         */}
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
      {/* CARD 3: PRÓXIMO STACK - Sub-tarjeta compacta                      */}
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
