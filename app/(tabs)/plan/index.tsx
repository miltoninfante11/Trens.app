// ============================================================================
// PLAN MODULE - Agenda Metabólica Adaptable
// Línea de tiempo con Comidas, Stacks y Bloque de Entrenamiento
// ============================================================================

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, ScrollView, Pressable, RefreshControl } from 'react-native';
import { PWAGuard } from '../../../components/auth/PWAGuard';
import { GuestModuleLanding } from '../../../components/auth/GuestModuleLanding';
import { useUserRoleContext } from '../../../context/UserRoleContext';
import { Alert } from '../../../lib/alert';
import Animated, { useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { Plus, Pill, ShoppingBag, StickyNote, Flame, Layers } from 'lucide-react-native';
import * as Haptics from '../../../lib/haptics';
import { useRouter, useFocusEffect } from 'expo-router';

import { MealCard } from '../../../components/plan/MealCard';
import { StackCard } from '../../../components/plan/StackCard';
// DraggableWorkoutBlock removed - workout blocks use time-based ordering only
import { WorkoutBlock } from '../../../components/plan/WorkoutBlock';
import { CardioBlockCard, CardioBlock } from '../../../components/plan/CardioBlockCard';
import { AddMealModal } from '../../../components/plan/AddMealModal';
import { EditMealModal } from '../../../components/plan/EditMealModal';
import { TimePickerModal } from '../../../components/plan/TimePickerModal';
import { StackManagerModal } from '../../../components/plan/StackManagerModal';
import { AddOptionModal } from '../../../components/plan/AddOptionModal';
import { hankToolsEvent } from '../../../lib/hankToolsEvent';
import { PlanNotesModal } from '../../../components/plan/PlanNotesModal';
import { AddCardioModal, AddCardioData } from '../../../components/plan/AddCardioModal';
import { supabase } from '../../../lib/supabase';
import { useHank } from '../../../context/HankContext';
import { useSaveGuard } from '../../_layout';
import { useSport } from '../../../context/SportContext';
import { useNotifications } from '../../../context/NotificationContext';

// Import sport-specific screens
import RaceScreen from '../race';
import SpotScreen from '../spot';

// ============================================================================
// ============================================================================
// TYPES
// ============================================================================
interface Ingredient {
  id: string;
  name: string;
  quantity: string;
  portion?: string;
  skipGrams?: boolean;
  weightType?: 'cocido' | 'crudo';
}

interface MealOption {
  id: string;
  name: string;
  ingredients: Ingredient[];
  notes?: string;
}

interface Meal {
  id: string;
  name: string; // Nombre guardado en DB
  time: string;
  options: MealOption[];
  selectedOption: number;
}

interface StackItem {
  id: string;
  name: string;
  dose: string;
  type: 'pill' | 'syringe' | 'powder' | 'liquid';
  notes?: string;
  time?: string;
  times?: string[]; // Múltiples horarios para suplementos que se toman varias veces al día
  isPreWorkout?: boolean;
  isPostWorkout?: boolean;
  daysOfWeek?: number[];
  workoutSessionIndex?: number; // 0 = Sesión A, 1 = Sesión B
  productId?: string; // FK opcional a shop_products
  productThumbnail?: string;
  productPrice?: number;
}

interface Stack {
  id: string;
  time: string;
  items: StackItem[];
}

interface WorkoutBlockData {
  id: string;
  routineName: string;
  preStack: StackItem[];
  postStack: StackItem[];
  exercises?: {
    id: string;
    name: string;
    sets?: number;
    reps?: string;
    imageUrl?: string;
    videoUrl?: string;
  }[];
  isExternalMode?: boolean; // True si usa modo personalizado (sin ejercicios detallados)
  // Workout time estimation
  estimatedTime?: string | null; // HH:MM format
  isFasted?: boolean; // True si entrenamiento en ayunas
  timeDescription?: string; // "Después de Desayuno, antes de Almuerzo"
  sessionLabel?: string; // "SESIÓN A" | "SESIÓN B" for dual session
  scheduledTime?: string | null; // User-assigned time for timeline ordering
}

interface TimelineItem {
  type: 'meal' | 'stack' | 'workout' | 'cardio';
  data: Meal | Stack | WorkoutBlockData | CardioBlock;
  time?: string;
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Genera nombre inteligente para comidas basado en cantidad total
 * Lógica: 2=Desayuno/Cena, 3=Des/Alm/Cena, 4=Comida 1-4, 5=Des/Med.Mañana/Alm/Med.Tarde/Cena, 6+=Comida N
 */
const getSmartMealName = (index: number, total: number): string => {
  if (total === 1) return 'COMIDA';
  if (total === 2) return index === 0 ? 'DESAYUNO' : 'CENA';
  if (total === 3) return ['DESAYUNO', 'ALMUERZO', 'CENA'][index] || `COMIDA ${index + 1}`;
  if (total === 4) return `COMIDA ${index + 1}`;
  if (total === 5) {
    return (
      ['DESAYUNO', 'MEDIA MAÑANA', 'ALMUERZO', 'MEDIA TARDE', 'CENA'][index] ||
      `COMIDA ${index + 1}`
    );
  }
  return `COMIDA ${index + 1}`;
};

/**
 * Convierte texto de hora a formato TIME válido (HH:MM)
 * Acepta: "7 pm", "7pm", "19:00", "7:30 am", "14:30", etc.
 */
const parseTimeToSQL = (timeStr: string): string | null => {
  if (!timeStr || !timeStr.trim()) return null;

  const input = timeStr.trim().toLowerCase();

  // Si ya está en formato HH:MM o HH:MM:SS, validar y retornar
  if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(input)) {
    const [hours, minutes] = input.split(':').map(Number);
    if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
      return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
    }
  }

  // Parsear formatos con AM/PM
  const ampmMatch = input.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?$/);
  if (ampmMatch) {
    let hours = parseInt(ampmMatch[1], 10);
    const minutes = ampmMatch[2] ? parseInt(ampmMatch[2], 10) : 0;
    const period = ampmMatch[3]?.replace('.', '');

    if (period === 'pm' && hours < 12) hours += 12;
    if (period === 'am' && hours === 12) hours = 0;

    if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
      return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
    }
  }

  return null;
};

/**
 * Calcula la hora estimada del entrenamiento basándose en la posición del bloque
 * y las comidas del timeline.
 *
 * Lógica:
 * - Si el bloque está al principio (posición 0) o no hay comidas antes: ENTRENAMIENTO EN AYUNAS
 * - Si hay una comida después del bloque: El entrenamiento es ~2 horas antes de esa comida
 * - Si hay una comida antes del bloque: El entrenamiento es ~1.5 horas después de esa comida
 *
 * @returns { estimatedTime: string | null, isFasted: boolean, description: string }
 */
interface WorkoutTimeEstimate {
  estimatedTime: string | null; // Formato HH:MM
  isFasted: boolean;
  description: string; // "En ayunas", "Antes de Almuerzo", "Después de Desayuno"
}

const calculateWorkoutTime = (
  workoutIndex: number,
  meals: { time: string; name: string }[]
): WorkoutTimeEstimate => {
  // Ordenar comidas por hora
  const sortedMeals = [...meals].filter((m) => m.time).sort((a, b) => a.time.localeCompare(b.time));

  if (sortedMeals.length === 0) {
    return {
      estimatedTime: null,
      isFasted: true,
      description: 'Sin comidas configuradas',
    };
  }

  // Contar cuántas comidas hay antes del workout
  const mealsBeforeWorkout = sortedMeals.slice(0, workoutIndex);
  const mealsAfterWorkout = sortedMeals.slice(workoutIndex);

  // Si no hay comidas antes del bloque de entrenamiento = ENTRENAMIENTO EN AYUNAS
  if (mealsBeforeWorkout.length === 0) {
    // Estimar hora: 2 horas antes de la primera comida, o 6:00 AM si no hay referencia
    if (mealsAfterWorkout.length > 0) {
      const firstMeal = mealsAfterWorkout[0];
      const [hours, minutes] = firstMeal.time.split(':').map(Number);
      const totalMinutes = hours * 60 + minutes;
      const workoutMinutes = Math.max(totalMinutes - 120, 5 * 60); // 2 horas antes, mínimo 5:00 AM
      const workoutHours = Math.floor(workoutMinutes / 60);
      const workoutMins = workoutMinutes % 60;
      const estimatedTime = `${workoutHours.toString().padStart(2, '0')}:${workoutMins.toString().padStart(2, '0')}`;

      return {
        estimatedTime,
        isFasted: true,
        description: `En ayunas (antes de ${firstMeal.name})`,
      };
    }

    return {
      estimatedTime: '06:00',
      isFasted: true,
      description: 'En ayunas',
    };
  }

  // Si hay comidas antes = calcular tiempo después de la última comida anterior
  const lastMealBefore = mealsBeforeWorkout[mealsBeforeWorkout.length - 1];
  const [hours, minutes] = lastMealBefore.time.split(':').map(Number);
  const totalMinutes = hours * 60 + minutes;

  // Entrenamiento aproximadamente 1.5-2 horas después de la última comida
  const workoutMinutes = totalMinutes + 90; // 1.5 horas después
  const workoutHours = Math.floor(workoutMinutes / 60);
  const workoutMins = workoutMinutes % 60;
  const estimatedTime = `${(workoutHours % 24).toString().padStart(2, '0')}:${workoutMins.toString().padStart(2, '0')}`;

  // Si hay comida después, ajustar descripción
  if (mealsAfterWorkout.length > 0) {
    const nextMeal = mealsAfterWorkout[0];
    return {
      estimatedTime,
      isFasted: false,
      description: `Después de ${lastMealBefore.name}, antes de ${nextMeal.name}`,
    };
  }

  return {
    estimatedTime,
    isFasted: false,
    description: `Después de ${lastMealBefore.name}`,
  };
};

// ============================================================================
// TAB 5 ROUTER - Renderiza el contenido correcto según el deporte activo
// ============================================================================
function Tab5RouterContent() {
  const { activeSport } = useSport();
  const sportCode = activeSport?.code || 'GYM';

  // Renderizar pantalla según deporte
  switch (sportCode) {
    case 'MOTO':
    case 'AUTO':
      return <RaceScreen />;
    case 'SURF':
      return <SpotScreen />;
    case 'GYM':
    default:
      return <PlanScreen />;
  }
}

export default function Tab5Router() {
  return (
    <PWAGuard moduleName="PLAN">
      <Tab5RouterContent />
    </PWAGuard>
  );
}

// ============================================================================
// PLAN SCREEN - Pantalla original de nutrición y plan
// ============================================================================
function PlanScreen() {
  const router = useRouter();
  const { refreshTrigger, setScreenContext } = useHank();
  const { canSave } = useSaveGuard();
  const { syncNotifications } = useNotifications();
  const { isAuthenticated } = useUserRoleContext();

  // Sincronizar contexto con HANK
  useFocusEffect(
    useCallback(() => {
      setScreenContext({
        module: 'plan',
        viewMode: null,
        currentExerciseIndex: null,
        currentTrainingDay: 0,
      });
    }, [setScreenContext])
  );

  // State
  const [planName, setPlanName] = useState('MI PLAN');
  const [meals, setMeals] = useState<Meal[]>([]);
  const [stackItems, setStackItems] = useState<StackItem[]>([]);
  const [workoutPosIndex, setWorkoutPosIndex] = useState(2);
  const [workoutScheduledTime, setWorkoutScheduledTime] = useState<string | null>(null);
  const [todayRoutine, setTodayRoutine] = useState<string>('SIN RUTINA');
  const [isExternalMode, setIsExternalMode] = useState(false); // Modo entrenamiento personalizado
  const [todayExercises, setTodayExercises] = useState<
    {
      id: string;
      name: string;
      sets?: number;
      reps?: string;
      imageUrl?: string;
      videoUrl?: string;
    }[]
  >([]);
  // Dual session B state
  const [hasDualSession, setHasDualSession] = useState(false);
  const [workoutPosIndexB, setWorkoutPosIndexB] = useState(4);
  const [workoutScheduledTimeB, setWorkoutScheduledTimeB] = useState<string | null>(null);
  const [todayRoutineB, setTodayRoutineB] = useState<string>('SESIÓN B');
  const [todayExercisesB, setTodayExercisesB] = useState<
    {
      id: string;
      name: string;
      sets?: number;
      reps?: string;
      imageUrl?: string;
      videoUrl?: string;
    }[]
  >([]);
  const [workoutTimeEstimateB, setWorkoutTimeEstimateB] = useState<WorkoutTimeEstimate>({
    estimatedTime: null,
    isFasted: false,
    description: '',
  });

  // Modals
  const [showAddMeal, setShowAddMeal] = useState(false);
  const [showEditMeal, setShowEditMeal] = useState(false);
  const [editingMeal, setEditingMeal] = useState<Meal | null>(null);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [timePickerMealId, setTimePickerMealId] = useState<string | null>(null);
  const [timePickerCurrentTime, setTimePickerCurrentTime] = useState('12:00');
  const [timePickerMode, setTimePickerMode] = useState<'meal' | 'stack' | 'workout'>('meal');
  const [timePickerStackTime, setTimePickerStackTime] = useState<string | null>(null);
  const [showStackManager, setShowStackManager] = useState(false);
  const [stackManagerInitialView, setStackManagerInitialView] = useState<'list' | 'add'>('list');
  const [showPlanNotes, setShowPlanNotes] = useState(false);
  const [showAddOption, setShowAddOption] = useState(false);
  const [addOptionMealId, setAddOptionMealId] = useState<string | null>(null);
  const [addOptionMealName, setAddOptionMealName] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Cardio blocks state
  const [cardioBlocks, setCardioBlocks] = useState<CardioBlock[]>([]);
  const [showAddCardio, setShowAddCardio] = useState(false);
  const [editingCardioId, setEditingCardioId] = useState<string | null>(null);
  const [editingCardioData, setEditingCardioData] = useState<AddCardioData | null>(null);

  // Workout time estimation - calcula dinámicamente basándose en posición del bloque
  const [workoutTimeEstimate, setWorkoutTimeEstimate] = useState<WorkoutTimeEstimate>({
    estimatedTime: null,
    isFasted: false,
    description: '',
  });
  // Ref para auto-scroll al elemento actual
  const scrollViewRef = useRef<ScrollView>(null);
  const itemLayouts = useRef<{ y: number; height: number }[]>([]);
  const hasScrolledToCurrentItem = useRef(false);
  const layoutsReady = useRef(0);
  // Flag para evitar auto-scroll durante actualizaciones internas
  const isInternalUpdate = useRef(false);
  // Flag para saber si el componente ya completó su carga inicial
  const hasCompletedInitialLoad = useRef(false);
  // Flag para evitar múltiples auto-scrolls en la misma sesión de focus
  const hasScrolledThisFocus = useRef(false);
  // Contador de veces que la pantalla recibió focus (para detectar navegación de regreso)
  const focusCount = useRef(0);

  // ============================================================================
  // DATA FETCHING
  // ============================================================================
  const fetchData = useCallback(async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      // Si no hay usuario, mostrar vista vacía
      if (!user) {
        setPlanName('MI PLAN');
        setMeals([]);
        setStackItems([]);
        setTodayRoutine('SIN RUTINA');
        setTodayExercises([]);
        setIsLoading(false);
        setRefreshing(false);
        return;
      }

      // Ya no usamos nutrition_plans, directamente cargamos meals
      setPlanName('MI PLAN');

      // Fetch meals - columnas reales de la tabla meals
      // Fetch meals con sus opciones (alternativas)
      const { data: mealsData, error: mealsError } = await supabase
        .from('meals')
        .select(
          `
          id, 
          name, 
          scheduled_time, 
          ingredients, 
          is_completed, 
          position,
          selected_option,
          notes,
          meal_options (
            id,
            name,
            ingredients,
            position,
            is_selected,
            notes
          )
        `
        )
        .eq('user_id', user.id)
        .order('scheduled_time', { ascending: true });

      console.warn('🍽️ PLAN: Meals query result:', {
        count: mealsData?.length || 0,
        error: mealsError?.message,
        meals: mealsData,
      });

      if (mealsData && mealsData.length > 0) {
        const formattedMeals: Meal[] = mealsData.map((meal: any, index: number) => {
          // Ingredientes principales de la comida (JSONB en meals.ingredients)
          const jsonIngredients = meal.ingredients || [];

          // Alternativas/opciones adicionales (de meal_options)
          const mealOptions = meal.meal_options || [];

          // Construir array de opciones
          const options: MealOption[] = [];

          // Opción principal: ingredientes JSONB de la comida
          if (jsonIngredients.length > 0) {
            options.push({
              id: `main-${meal.id}`,
              name: 'Principal',
              notes: meal.notes || undefined,
              ingredients: jsonIngredients.map((ing: any, idx: number) => ({
                id: ing.id || `ing-${idx}`,
                name: ing.name,
                quantity: ing.skipGrams ? '' : ing.quantity || '~100g',
                portion: ing.portion,
                skipGrams: ing.skipGrams || undefined,
                weightType: ing.weightType || undefined,
              })),
            });
          }

          // Agregar opciones alternativas de meal_options
          if (mealOptions.length > 0) {
            const sortedOptions = [...mealOptions].sort(
              (a: any, b: any) => (a.position || 0) - (b.position || 0)
            );
            sortedOptions.forEach((opt: any) => {
              options.push({
                id: opt.id,
                name: opt.name || 'Alternativa',
                notes: opt.notes || undefined,
                ingredients: (opt.ingredients || []).map((ing: any, idx: number) => ({
                  id: ing.id || `opt-ing-${idx}`,
                  name: ing.name,
                  quantity: ing.skipGrams ? '' : ing.quantity || '~100g',
                  portion: ing.portion,
                  skipGrams: ing.skipGrams || undefined,
                  weightType: ing.weightType || undefined,
                })),
              });
            });
          }

          // Validar selected_option: si excede el número de opciones, usar 0
          const savedSelection = meal.selected_option ?? 0;
          const validSelection =
            options.length > 0 ? Math.min(Math.max(0, savedSelection), options.length - 1) : 0;

          return {
            id: meal.id,
            name: meal.name || 'Comida',
            time:
              meal.scheduled_time?.slice(0, 5) ||
              `${String(7 + ((index * 3) % 15)).padStart(2, '0')}:00`,
            selectedOption: validSelection,
            options,
          };
        });

        // Sincronizar nombres con lógica inteligente en DB si no coinciden
        const total = formattedMeals.length;
        for (let i = 0; i < formattedMeals.length; i++) {
          const expectedName = getSmartMealName(i, total);
          if (formattedMeals[i].name !== expectedName) {
            formattedMeals[i].name = expectedName;
            supabase
              .from('meals')
              .update({ name: expectedName, position: i })
              .eq('id', formattedMeals[i].id)
              .then(() => {});
          }
        }

        setMeals(formattedMeals);
      }

      // Fetch supplement stack (con datos del producto vinculado si existe)
      const { data: stackData } = await supabase
        .from('supplement_stack')
        .select('*, product:shop_products(id, name, thumbnail_url, price)')
        .eq('user_id', user.id)
        .eq('is_active', true);

      if (stackData) {
        const formattedStack: StackItem[] = stackData.map((item: any) => ({
          id: item.id,
          name: item.name,
          dose: item.dose,
          type: item.type as StackItem['type'],
          notes: item.notes,
          time: item.time?.slice(0, 5),
          times: item.times || (item.time ? [item.time.slice(0, 5)] : undefined),
          isPreWorkout: item.is_pre_workout,
          isPostWorkout: item.is_post_workout,
          daysOfWeek: item.days_of_week,
          workoutSessionIndex: item.workout_session_index ?? 0,
          productId: item.product_id || undefined,
          productThumbnail: item.product?.thumbnail_url || undefined,
          productPrice:
            item.product?.price !== undefined && item.product?.price !== null
              ? Number(item.product.price)
              : undefined,
        }));
        setStackItems(formattedStack);
      }

      // Fetch cardio blocks for today's training day
      const { data: cardioData } = await supabase
        .from('cardio_blocks')
        .select('*')
        .eq('user_id', user.id)
        .order('display_order', { ascending: true });

      if (cardioData && cardioData.length > 0) {
        setCardioBlocks(cardioData as CardioBlock[]);
      } else {
        setCardioBlocks([]);
      }

      // Fetch workout block position (both sessions)
      const { data: posData, error: posError } = await supabase
        .from('workout_block_position')
        .select('position, session_index, scheduled_time')
        .eq('user_id', user.id)
        .order('session_index', { ascending: true });

      console.warn('🏋️ PLAN: Posiciones cargadas:', posData, posError);
      if (posData && posData.length > 0) {
        const posA = posData.find((p: any) => (p.session_index || 0) === 0);
        const posB = posData.find((p: any) => p.session_index === 1);
        if (posA) {
          setWorkoutPosIndex(posA.position);
          setWorkoutScheduledTime(posA.scheduled_time || null);
        }
        if (posB) {
          setWorkoutPosIndexB(posB.position);
          setWorkoutScheduledTimeB(posB.scheduled_time || null);
        }
      }

      // Fetch routine names (sistema weekday: 0=Dom..6=Sáb)
      const { data: profileData } = await supabase
        .from('profiles')
        .select('training_routine_names, training_session_names')
        .eq('id', user.id)
        .single();

      // ===========================================================================
      // DETECTAR MODO DE ENTRENAMIENTO (external vs gym_module)
      // ===========================================================================
      const { data: userProfileData } = await supabase
        .from('user_profiles')
        .select('training_mode, external_schedule')
        .eq('user_id', user.id)
        .single();

      const trainingMode = userProfileData?.training_mode || 'none';
      const externalSchedule = userProfileData?.external_schedule || {};
      const dayNames = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
      const todayName = dayNames[new Date().getDay()];

      // ===========================================================================
      // DETECTAR MODO Y NOMBRE DE RUTINA (sistema weekday)
      // ===========================================================================
      const todayWeekday = new Date().getDay();
      const currentTrainingDay = todayWeekday;
      const routineNames = profileData?.training_routine_names || {};
      let externalRoutineName: string | null = null;

      if (trainingMode === 'external' && Object.keys(externalSchedule).length > 0) {
        // Modo external (legacy): mapear weekday a posición secuencial dentro
        // del schedule original.
        const scheduleEntries = Object.entries(externalSchedule);
        const totalDays = scheduleEntries.length;
        const safeIndex = todayWeekday % totalDays;
        const [dayName, muscleGroup] = scheduleEntries[safeIndex] || ['', ''];
        const todayMuscle = muscleGroup ? String(muscleGroup) : null;
        setIsExternalMode(true);

        console.warn(
          `🏋️ PLAN [PERSONALIZADO]: Weekday ${todayWeekday} (${dayName}) → ${todayMuscle || 'DESCANSO'}`
        );

        if (todayMuscle) {
          externalRoutineName = todayMuscle.replace(/^Día\s*\d+\s*:\s*/i, '');
        }
      } else {
        setIsExternalMode(false);
      }

      console.warn(
        `🏋️ PLAN: Día: ${currentTrainingDay}, Rutina: ${routineNames[String(currentTrainingDay)] || externalRoutineName || 'NO SINCRONIZADO'}`
      );

      // ===========================================================================
      // CARGAR EJERCICIOS DEL DÍA ACTUAL (ambos modos)
      // ===========================================================================
      const { data: userConfigs, error: exercisesError } = await supabase
        .from('user_exercise_config')
        .select(
          `
          id,
          exercise_id,
          training_days,
          display_order,
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
        .eq('user_id', user.id)
        .order('display_order', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: true });

      // Mapear al formato simplificado
      const exercisesData =
        userConfigs?.map((item: any) => {
          const exercise = item.exercises;
          return {
            id: item.id,
            name: exercise?.name || 'UNNAMED',
            media_url:
              item.custom_media_url || exercise?.default_media_url || exercise?.thumbnail_url || '',
            video_url: exercise?.video_url || '',
            training_days: item.training_days || [0],
            session_index: item.session_index ?? 0,
          };
        }) || [];

      console.warn(`🏋️ PLAN: Total ejercicios encontrados: ${exercisesData.length}`);
      if (exercisesError) {
        console.error('Error fetching exercises:', exercisesError);
      }

      // Log detallado de ejercicios y sus días
      if (exercisesData.length > 0) {
        console.warn(
          '🏋️ PLAN: Ejercicios con días:',
          exercisesData
            .map(
              (e: any) => `${e.name}: [${(e.training_days || [0]).join(',')}] S${e.session_index}`
            )
            .join(' | ')
        );
      }

      // Filtrar por día de entrenamiento Y sesión
      const todayExercisesA = exercisesData.filter((item: any) => {
        const itemDays = item.training_days || [0];
        return itemDays.includes(currentTrainingDay) && (item.session_index ?? 0) === 0;
      });
      const todayExercisesB = exercisesData.filter((item: any) => {
        const itemDays = item.training_days || [0];
        return itemDays.includes(currentTrainingDay) && item.session_index === 1;
      });

      // Detectar dual session para este día
      const sessionNamesProfile = profileData?.training_session_names || {};
      const daySessionNames = sessionNamesProfile[String(currentTrainingDay)] || {};
      const dayHasDualSession = todayExercisesB.length > 0 || !!daySessionNames['1'];
      setHasDualSession(dayHasDualSession);

      // Session B routine name
      if (dayHasDualSession) {
        const sessionBName = daySessionNames['1'] || 'SESIÓN B';
        setTodayRoutineB(sessionBName);
      }

      console.warn(
        `🏋️ PLAN: Ejercicios Sesión A: ${todayExercisesA.length}, Sesión B: ${todayExercisesB.length}, DualSession: ${dayHasDualSession}`
      );

      // Helper para verificar si es video
      const isVideoUrl = (url: string) => {
        if (!url) return false;
        const videoExtensions = ['.mp4', '.mov', '.avi', '.webm', '.m4v'];
        return videoExtensions.some((ext) => url.toLowerCase().includes(ext));
      };

      // Formateador de ejercicios
      const formatExercises = (items: any[]) =>
        items.map((item: any, idx: number) => {
          const mediaUrl = item.media_url || '';
          const explicitVideoUrl = item.video_url || '';
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
          return { id: item.id || `ex-${idx}`, name: item.name, imageUrl, videoUrl };
        });

      if (todayExercisesA.length > 0 || todayExercisesB.length > 0) {
        // Usar nombre de rutina: training_routine_names > external_schedule > default
        const savedRoutineName = routineNames[String(currentTrainingDay)];
        const cleanRoutineName = savedRoutineName
          ? savedRoutineName.replace(/^Día\s*\d+\s*:\s*/i, '')
          : null;
        const finalRoutineName = dayHasDualSession
          ? daySessionNames['0'] || cleanRoutineName || externalRoutineName || 'SESIÓN A'
          : cleanRoutineName || externalRoutineName || daySessionNames['0'] || 'ENTRENAMIENTO';
        setTodayRoutine(finalRoutineName);
        setTodayExercises(formatExercises(todayExercisesA));
        setTodayExercisesB(formatExercises(todayExercisesB));

        console.warn('🏋️ Rutina A:', finalRoutineName);
        console.warn('🏋️ Ejercicios A:', todayExercisesA.length, 'B:', todayExercisesB.length);
      } else if (externalRoutineName || routineNames[String(currentTrainingDay)]) {
        // Modo externo sin ejercicios aún - mostrar nombre de rutina
        const savedName = routineNames[String(currentTrainingDay)];
        const cleanName = savedName ? savedName.replace(/^Día\s*\d+\s*:\s*/i, '') : null;
        setTodayRoutine(cleanName || externalRoutineName || 'ENTRENAMIENTO');
        setTodayExercises([]);
        setTodayExercisesB([]);
        console.warn(`🏋️ PLAN [PERSONALIZADO]: ${externalRoutineName} (sin ejercicios)`);
      } else {
        console.warn('🏋️ Sin ejercicios para hoy - DESCANSO');
        setTodayRoutine('DESCANSO');
        setTodayExercises([]);
        setTodayExercisesB([]);
        setHasDualSession(false);
      }

      // ===========================================================================
      // SYNC NOTIFICATIONS - Actualizar recordatorios basados en el plan actual
      // ===========================================================================
      try {
        await syncNotifications(user.id);
        console.log('🔔 PLAN: Notificaciones sincronizadas');
      } catch (notifError) {
        console.warn('⚠️ PLAN: Error sincronizando notificaciones:', notifError);
      }
    } catch (error) {
      console.error('Error fetching plan data:', error);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, [syncNotifications]);

  // Cargar datos inicialmente
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Recargar datos al volver a PLAN desde otro módulo
  useFocusEffect(
    useCallback(() => {
      // Recargar datos silenciosamente cada vez que PLAN recibe focus
      fetchData();
    }, [fetchData])
  );

  // RefreshTrigger from HANK
  useEffect(() => {
    if (refreshTrigger > 0) {
      console.log('🔄 PLAN: refreshTrigger cambió, recargando datos...');
      fetchData();
    }
  }, [refreshTrigger, fetchData]);

  // Calcular hora estimada del entrenamiento cuando cambia posición o comidas
  useEffect(() => {
    // Mapear meals a formato simple para el cálculo
    const mealTimes = meals.map((m) => ({ time: m.time, name: m.name }));
    const estimate = calculateWorkoutTime(workoutPosIndex, mealTimes);
    setWorkoutTimeEstimate(estimate);

    // Loggear para debug
    console.log(
      `🏋️ PLAN: Workout estimado @ ${estimate.estimatedTime || 'N/A'} - ${estimate.description}${estimate.isFasted ? ' (AYUNAS)' : ''}`
    );

    // Sincronizar con contexto de Hank para que tenga acceso a esta info
    setScreenContext({
      module: 'plan',
      viewMode: null,
      currentExerciseIndex: null,
      currentTrainingDay: 0,
      estimatedWorkoutTime: estimate.estimatedTime,
      isFastedTraining: estimate.isFasted,
      workoutTimeDescription: estimate.description,
    });
  }, [workoutPosIndex, meals, setScreenContext]);

  // Calcular hora estimada para sesión B cuando aplique
  useEffect(() => {
    if (!hasDualSession) return;
    const mealTimes = meals.map((m) => ({ time: m.time, name: m.name }));
    const estimateB = calculateWorkoutTime(workoutPosIndexB, mealTimes);
    setWorkoutTimeEstimateB(estimateB);
  }, [workoutPosIndexB, meals, hasDualSession]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  // ============================================================================
  // HANDLERS
  // ============================================================================
  const handleSwap = async (mealId: string, newOptionIndex: number) => {
    isInternalUpdate.current = true;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    // Optimistic update
    setMeals((prev) =>
      prev.map((m) => (m.id === mealId ? { ...m, selectedOption: newOptionIndex } : m))
    );

    // Persist to database
    await supabase.from('meals').update({ selected_option: newOptionIndex }).eq('id', mealId);
  };

  const handleTimeChange = (mealId: string) => {
    const meal = meals.find((m) => m.id === mealId);
    if (!meal) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setTimePickerMode('meal');
    setTimePickerMealId(mealId);
    setTimePickerCurrentTime(meal.time);
    setShowTimePicker(true);
  };

  // Handler para cambiar hora de un grupo de stacks
  const handleStackTimeChange = (currentTime: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setTimePickerMode('stack');
    setTimePickerStackTime(currentTime);
    setTimePickerCurrentTime(currentTime);
    setShowTimePicker(true);
  };

  // Handler para cambiar hora de un bloque de entrenamiento
  const timePickerWorkoutSession = useRef<number>(0);
  const handleWorkoutTimeChange = (currentTime: string, sessionIdx: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setTimePickerMode('workout');
    timePickerWorkoutSession.current = sessionIdx;
    setTimePickerCurrentTime(currentTime || '08:00');
    setShowTimePicker(true);
  };

  // Guardar nueva hora desde el modal
  const handleSaveTime = async (newTime: string) => {
    isInternalUpdate.current = true;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    if (timePickerMode === ('cardio' as any) && cardioTimePickerId.current) {
      // Update cardio block time
      const cardioId = cardioTimePickerId.current;
      await supabase.from('cardio_blocks').update({ scheduled_time: newTime }).eq('id', cardioId);
      setCardioBlocks((prev) =>
        prev.map((c) => (c.id === cardioId ? { ...c, scheduled_time: newTime } : c))
      );
      cardioTimePickerId.current = null;
    } else if (timePickerMode === 'meal' && timePickerMealId) {
      // Update meal time
      const updated = meals
        .map((m) => (m.id === timePickerMealId ? { ...m, time: newTime } : m))
        .sort((a, b) => a.time.localeCompare(b.time));

      // Recalcular nombres inteligentes según nueva posición
      const total = updated.length;
      for (let i = 0; i < updated.length; i++) {
        const expectedName = getSmartMealName(i, total);
        if (updated[i].name !== expectedName) {
          updated[i] = { ...updated[i], name: expectedName };
          // Sync en DB silenciosamente
          supabase
            .from('meals')
            .update({ name: expectedName, position: i })
            .eq('id', updated[i].id)
            .then(() => {});
        }
      }

      setMeals(updated);
      await supabase.from('meals').update({ scheduled_time: newTime }).eq('id', timePickerMealId);
      setTimePickerMealId(null);
    } else if (timePickerMode === 'stack' && timePickerStackTime) {
      // Find items that have this time (check both time and times array)
      const oldTime = timePickerStackTime;
      const itemsToUpdate = stackItems.filter((item) => {
        // Check single time field
        if (item.time === oldTime) return true;
        // Check times array
        if (item.times && item.times.includes(oldTime)) return true;
        return false;
      });

      for (const item of itemsToUpdate) {
        // Update times array if it exists
        if (item.times && item.times.length > 0) {
          const newTimes = item.times.map((t) => (t === oldTime ? newTime : t));
          await supabase
            .from('supplement_stack')
            .update({ times: newTimes, time: newTimes[0] })
            .eq('id', item.id);
        } else {
          // Fallback to single time update
          await supabase.from('supplement_stack').update({ time: newTime }).eq('id', item.id);
        }
      }

      // Update local state
      setStackItems((prev) =>
        prev.map((item) => {
          if (item.times && item.times.includes(oldTime)) {
            const newTimes = item.times.map((t) => (t === oldTime ? newTime : t));
            return { ...item, times: newTimes, time: newTimes[0] };
          }
          if (item.time === oldTime) {
            return { ...item, time: newTime };
          }
          return item;
        })
      );

      setTimePickerStackTime(null);
      console.warn('✅ STACK: Hora actualizada de', oldTime, 'a', newTime);
    } else if (timePickerMode === 'workout') {
      const sessionIdx = timePickerWorkoutSession.current;
      // Update local state
      if (sessionIdx === 0) {
        setWorkoutScheduledTime(newTime);
      } else {
        setWorkoutScheduledTimeB(newTime);
      }

      // Save to DB
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const { data: existing } = await supabase
          .from('workout_block_position')
          .select('id')
          .eq('user_id', user.id)
          .eq('session_index', sessionIdx)
          .limit(1)
          .single();

        if (existing) {
          await supabase
            .from('workout_block_position')
            .update({ scheduled_time: newTime, updated_at: new Date().toISOString() })
            .eq('id', existing.id);
        } else {
          await supabase.from('workout_block_position').insert({
            user_id: user.id,
            position: sessionIdx === 0 ? workoutPosIndex : workoutPosIndexB,
            session_index: sessionIdx,
            scheduled_time: newTime,
          });
        }
      }
      console.warn('✅ WORKOUT: Hora asignada S' + sessionIdx + ':', newTime);
    }
  };

  // Parsear input de hora flexible a formato 24h
  const parseTimeInput = (input: string): string | null => {
    const upper = input.toUpperCase().trim();

    // Detectar AM/PM
    const isPM = upper.includes('PM');
    const isAM = upper.includes('AM');
    const cleanTime = upper.replace(/\s*(AM|PM)\s*/g, '').trim();

    let hours: number;
    let minutes: number = 0;

    if (cleanTime.includes(':')) {
      const parts = cleanTime.split(':');
      hours = parseInt(parts[0], 10);
      minutes = parseInt(parts[1], 10) || 0;
    } else {
      hours = parseInt(cleanTime, 10);
    }

    if (isNaN(hours) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
      return null;
    }

    // Convertir a 24h si hay AM/PM
    if (isAM || isPM) {
      if (hours > 12) return null;
      if (isAM && hours === 12) hours = 0;
      if (isPM && hours !== 12) hours += 12;
    }

    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
  };

  // ============================================================================
  // CARDIO BLOCK HANDLERS
  // ============================================================================
  const handleAddCardio = async (data: AddCardioData) => {
    isInternalUpdate.current = true;
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      // Smart fasted detection: compare cardio time vs first meal
      const sortedMeals = [...meals]
        .filter((m) => m.time)
        .sort((a, b) => a.time.localeCompare(b.time));
      const firstMealTime = sortedMeals.length > 0 ? sortedMeals[0].time : null;
      let isFasted = false;

      if (data.is_pre_workout || data.is_post_workout) {
        // Pre/post workout: check if the linked workout is fasted
        const sessionIdx = data.workout_session_index;
        if (sessionIdx === 0 || sessionIdx === 2) {
          // Uses session A — check workoutTimeEstimate
          const estimate = calculateWorkoutTime(workoutPosIndex, meals);
          isFasted = estimate.isFasted;
        }
        if (sessionIdx === 1) {
          // Uses session B
          const estimateB = calculateWorkoutTime(workoutPosIndexB, meals);
          isFasted = estimateB.isFasted;
        }
        if (sessionIdx === 2) {
          // Both sessions: fasted if either is fasted
          const estimateA = calculateWorkoutTime(workoutPosIndex, meals);
          const estimateB = calculateWorkoutTime(workoutPosIndexB, meals);
          isFasted = estimateA.isFasted || estimateB.isFasted;
        }
      } else {
        // Time-based cardio: fasted if before first meal
        isFasted = !firstMealTime || data.scheduled_time < firstMealTime;
      }

      const newOrder = cardioBlocks.length;
      const { data: inserted, error } = await supabase
        .from('cardio_blocks')
        .insert({
          user_id: user.id,
          training_day: 0,
          scheduled_time: data.scheduled_time,
          cardio_type: data.cardio_type,
          activity: data.activity,
          duration_minutes: data.duration_minutes,
          intensity: data.intensity,
          notes: data.notes,
          is_fasted: isFasted,
          is_completed: false,
          display_order: newOrder,
          target_heart_rate: data.target_heart_rate,
          speed: data.speed,
          incline: data.incline,
          days_of_week: data.days_of_week,
          is_pre_workout: data.is_pre_workout,
          is_post_workout: data.is_post_workout,
          workout_session_index: data.workout_session_index,
        })
        .select()
        .single();

      if (error) {
        console.error('Error adding cardio:', error);
        return;
      }
      if (inserted) {
        setCardioBlocks((prev) => [...prev, inserted as CardioBlock]);
      }
    } catch (err) {
      console.error('Error adding cardio block:', err);
    }
  };

  const handleDeleteCardio = async (cardioId: string) => {
    isInternalUpdate.current = true;
    Alert.alert('Eliminar Cardio', '¿Estás seguro de que quieres eliminar este bloque de cardio?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: async () => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          await supabase.from('cardio_blocks').delete().eq('id', cardioId);
          setCardioBlocks((prev) => prev.filter((c) => c.id !== cardioId));
        },
      },
    ]);
  };

  const handleToggleCardioComplete = async (cardioId: string, completed: boolean) => {
    isInternalUpdate.current = true;
    await supabase.from('cardio_blocks').update({ is_completed: completed }).eq('id', cardioId);
    setCardioBlocks((prev) =>
      prev.map((c) => (c.id === cardioId ? { ...c, is_completed: completed } : c))
    );
  };

  const handleCardioTimeChange = (cardioId: string) => {
    const cardio = cardioBlocks.find((c) => c.id === cardioId);
    if (!cardio) return;
    setTimePickerMode('cardio' as any);
    setTimePickerCurrentTime(cardio.scheduled_time || '06:00');
    (cardioTimePickerId as any).current = cardioId;
    setShowTimePicker(true);
  };

  // Edit cardio: open modal with existing data
  const handleEditCardio = (cardioId: string) => {
    const cardio = cardioBlocks.find((c) => c.id === cardioId);
    if (!cardio) return;
    setEditingCardioId(cardioId);
    setEditingCardioData({
      cardio_type: cardio.cardio_type,
      activity: cardio.activity,
      duration_minutes: cardio.duration_minutes,
      intensity: cardio.intensity as any,
      target_heart_rate: cardio.target_heart_rate ?? null,
      speed: cardio.speed ?? null,
      incline: cardio.incline ?? null,
      scheduled_time: cardio.scheduled_time,
      notes: cardio.notes || '',
      days_of_week: cardio.days_of_week || [0, 1, 2, 3, 4, 5, 6],
      is_pre_workout: cardio.is_pre_workout || false,
      is_post_workout: cardio.is_post_workout || false,
      workout_session_index: cardio.workout_session_index ?? 0,
    });
    setShowAddCardio(true);
  };

  // Update cardio in DB
  const handleUpdateCardio = async (data: AddCardioData) => {
    if (!editingCardioId) return;
    isInternalUpdate.current = true;
    try {
      // Smart fasted detection (same logic as add)
      const sortedMeals = [...meals]
        .filter((m) => m.time)
        .sort((a, b) => a.time.localeCompare(b.time));
      const firstMealTime = sortedMeals.length > 0 ? sortedMeals[0].time : null;
      let isFasted = false;

      if (data.is_pre_workout || data.is_post_workout) {
        const sessionIdx = data.workout_session_index;
        if (sessionIdx === 0) {
          isFasted = calculateWorkoutTime(workoutPosIndex, meals).isFasted;
        } else if (sessionIdx === 1) {
          isFasted = calculateWorkoutTime(workoutPosIndexB, meals).isFasted;
        } else if (sessionIdx === 2) {
          const a = calculateWorkoutTime(workoutPosIndex, meals);
          const b = calculateWorkoutTime(workoutPosIndexB, meals);
          isFasted = a.isFasted || b.isFasted;
        }
      } else {
        isFasted = !firstMealTime || data.scheduled_time < firstMealTime;
      }

      const { data: updated, error } = await supabase
        .from('cardio_blocks')
        .update({
          scheduled_time: data.scheduled_time,
          cardio_type: data.cardio_type,
          activity: data.activity,
          duration_minutes: data.duration_minutes,
          intensity: data.intensity,
          notes: data.notes,
          is_fasted: isFasted,
          target_heart_rate: data.target_heart_rate,
          speed: data.speed,
          incline: data.incline,
          days_of_week: data.days_of_week,
          is_pre_workout: data.is_pre_workout,
          is_post_workout: data.is_post_workout,
          workout_session_index: data.workout_session_index,
        })
        .eq('id', editingCardioId)
        .select()
        .single();

      if (error) {
        console.error('Error updating cardio:', error);
        return;
      }
      if (updated) {
        setCardioBlocks((prev) =>
          prev.map((c) => (c.id === editingCardioId ? (updated as CardioBlock) : c))
        );
      }
    } catch (err) {
      console.error('Error updating cardio block:', err);
    } finally {
      setEditingCardioId(null);
      setEditingCardioData(null);
    }
  };

  // Ref for tracking which cardio is being time-edited
  const cardioTimePickerId = useRef<string | null>(null);

  // Eliminar comida
  const handleDeleteMeal = async (mealId: string) => {
    isInternalUpdate.current = true;
    Alert.alert('Eliminar Comida', '¿Estás seguro de que quieres eliminar esta comida?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: async () => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          await supabase.from('meals').delete().eq('id', mealId);
          const newMeals = meals.filter((m) => m.id !== mealId);
          setMeals(newMeals);

          // Renombrar comidas restantes con lógica inteligente
          const newTotal = newMeals.length;
          for (let i = 0; i < newMeals.length; i++) {
            const newName = getSmartMealName(i, newTotal);
            await supabase
              .from('meals')
              .update({ name: newName, position: i })
              .eq('id', newMeals[i].id);
          }

          await fetchData();
        },
      },
    ]);
  };

  // Eliminar solo una opción/platillo de una comida
  const handleDeleteOption = async (mealId: string, optionId: string) => {
    isInternalUpdate.current = true;
    const meal = meals.find((m) => m.id === mealId);
    if (!meal) return;

    const optionIndex = meal.options.findIndex((o) => o.id === optionId);
    const optionName = optionIndex >= 0 ? `Opción ${optionIndex + 1}` : 'esta opción';

    Alert.alert('Eliminar Platillo', `¿Estás seguro de que quieres eliminar ${optionName}?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: async () => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);

          // Eliminar la opción de la base de datos (cascade eliminará ingredientes)
          await supabase.from('meal_options').delete().eq('id', optionId);

          // Actualizar estado local
          const updatedMeals = meals.map((m) => {
            if (m.id === mealId) {
              const newOptions = m.options.filter((o) => o.id !== optionId);
              return {
                ...m,
                options: newOptions,
                selectedOption: Math.min(m.selectedOption, newOptions.length - 1),
              };
            }
            return m;
          });
          setMeals(updatedMeals);

          // Actualizar selected_option en la BD si es necesario
          const updatedMeal = updatedMeals.find((m) => m.id === mealId);
          if (updatedMeal) {
            await supabase
              .from('meals')
              .update({ selected_option: updatedMeal.selectedOption })
              .eq('id', mealId);
          }
        },
      },
    ]);
  };

  // Editar comida (abre modal)
  const handleEditMeal = (mealId: string, optionIndex?: number) => {
    const meal = meals.find((m) => m.id === mealId);
    if (meal) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      // Si se especificó un índice de opción, usarlo; sino usar el seleccionado
      const mealWithOption =
        optionIndex !== undefined ? { ...meal, selectedOption: optionIndex } : meal;
      setEditingMeal(mealWithOption);
      setShowEditMeal(true);
    }
  };

  // Guardar cambios de ingredientes (usando JSONB directo)
  // Soporta tanto comida principal (meals) como alternativas (meal_options)
  const handleSaveIngredients = async (
    mealId: string,
    optionId: string, // 'main-{id}' para principal, UUID real para alternativas
    ingredients: Ingredient[],
    notes?: string,
    _editModes?: string[]
  ) => {
    isInternalUpdate.current = true;
    const isAlternative = !optionId.startsWith('main-');

    try {
      const ingredientsToSave = ingredients.map((ing) => ({
        name: ing.name,
        quantity: ing.skipGrams ? '' : ing.quantity || '~100g',
        portion: ing.portion || '',
        ...(ing.skipGrams ? { skipGrams: true } : {}),
        ...(ing.weightType ? { weightType: ing.weightType } : {}),
      }));

      if (isAlternative) {
        const { error } = await supabase
          .from('meal_options')
          .update({
            ingredients: ingredientsToSave,
            ...(notes !== undefined ? { notes: notes || null } : {}),
          })
          .eq('id', optionId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('meals')
          .update({
            ingredients: ingredientsToSave,
            ...(notes !== undefined ? { notes: notes || null } : {}),
          })
          .eq('id', mealId);
        if (error) throw error;
      }

      await fetchData();
    } catch (error) {
      console.error('Error saving ingredients:', error);
      Alert.alert('Error', 'No se pudieron guardar los cambios');
      throw error;
    }
  };

  const handleAddMeal = async (
    ingredients: {
      name: string;
      quantity: string;
      portion: string;
      skipGrams?: boolean;
      weightType?: 'cocido' | 'crudo';
    }[],
    time: string,
    notes?: string
  ) => {
    isInternalUpdate.current = true;
    // Guard: Verificar si puede guardar
    if (!canSave('create_meal')) return;

    // Cerrar modal inmediatamente
    setShowAddMeal(false);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      // Formatear hora correctamente
      let formattedTime = time.trim();
      if (!formattedTime.includes(':')) {
        formattedTime = formattedTime.padStart(2, '0') + ':00';
      } else {
        const [hours, minutes] = formattedTime.split(':');
        formattedTime = hours.padStart(2, '0') + ':' + (minutes || '00').padStart(2, '0');
      }

      // Calcular posición (última + 1) y nombre inteligente
      const newPosition = meals.length;
      const newTotal = meals.length + 1;
      const mealName = getSmartMealName(newPosition, newTotal);

      // Crear meal directamente con ingredients como JSONB
      const { error: mealError } = await supabase.from('meals').insert({
        user_id: user.id,
        name: mealName,
        scheduled_time: formattedTime,
        ingredients: ingredients.map((ing) => ({
          name: ing.name,
          quantity: ing.skipGrams ? '' : ing.quantity || '~100 gr',
          portion: ing.portion || '',
          ...(ing.skipGrams ? { skipGrams: true } : {}),
          ...(ing.weightType ? { weightType: ing.weightType } : {}),
        })),
        position: newPosition,
        is_completed: false,
        ...(notes ? { notes } : {}),
      });

      if (mealError) {
        console.error('Error creating meal:', mealError);
        throw mealError;
      }

      await fetchData();
    } catch (error) {
      console.error('Error adding meal:', error);
      Alert.alert('Error', 'No se pudo agregar la comida');
    }
  };

  const handleAddStackItem = async (item: Omit<StackItem, 'id'>) => {
    isInternalUpdate.current = true;
    // Guard: Verificar si puede guardar
    if (!canSave('add_supplement')) return;

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        console.warn('⚠️ STACK: No hay usuario autenticado');
        return;
      }

      // Convertir hora a formato SQL válido
      const parsedTime = item.time ? parseTimeToSQL(item.time) : null;

      console.warn(
        '📦 STACK: Insertando compuesto:',
        item.name,
        'Hora:',
        parsedTime,
        'productId:',
        item.productId
      );

      const { error } = await supabase.from('supplement_stack').insert({
        user_id: user.id,
        name: item.name,
        dose: item.dose,
        type: item.type,
        notes: item.notes,
        time: parsedTime,
        is_pre_workout: item.isPreWorkout || false,
        is_post_workout: item.isPostWorkout || false,
        days_of_week: item.daysOfWeek || [0, 1, 2, 3, 4, 5, 6],
        workout_session_index: item.workoutSessionIndex ?? 0,
        product_id: item.productId || null,
      });

      if (error) {
        console.error('❌ STACK: Error insertando:', error.message);
        Alert.alert('Error', `No se pudo agregar: ${error.message}`);
        return;
      }

      console.warn('✅ STACK: Compuesto agregado exitosamente');
      fetchData();
    } catch (error) {
      console.error('Error adding stack item:', error);
      Alert.alert('Error', 'No se pudo agregar el compuesto');
    }
  };

  const handleRemoveStackItem = async (id: string) => {
    isInternalUpdate.current = true;
    try {
      await supabase.from('supplement_stack').delete().eq('id', id);
      setStackItems((prev) => prev.filter((item) => item.id !== id));
    } catch (error) {
      console.error('Error removing stack item:', error);
    }
  };

  // Handler para actualizar un compuesto del stack
  const handleUpdateStackItem = async (id: string, updates: Partial<Omit<StackItem, 'id'>>) => {
    isInternalUpdate.current = true;
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      // Preparar datos para la DB
      const dbUpdates: Record<string, any> = {};
      if (updates.name !== undefined) dbUpdates.name = updates.name;
      if (updates.dose !== undefined) dbUpdates.dose = updates.dose;
      if (updates.type !== undefined) dbUpdates.type = updates.type;
      if (updates.notes !== undefined) dbUpdates.notes = updates.notes || null;
      if (updates.time !== undefined) dbUpdates.time = updates.time || null;
      if (updates.times !== undefined) dbUpdates.times = updates.times || null;
      if (updates.isPreWorkout !== undefined) dbUpdates.is_pre_workout = updates.isPreWorkout;
      if (updates.isPostWorkout !== undefined) dbUpdates.is_post_workout = updates.isPostWorkout;
      if (updates.daysOfWeek !== undefined) dbUpdates.days_of_week = updates.daysOfWeek;
      if (updates.workoutSessionIndex !== undefined)
        dbUpdates.workout_session_index = updates.workoutSessionIndex;
      // Vinculación con producto de la tienda (puede setear o quitar)
      if (updates.productId !== undefined) dbUpdates.product_id = updates.productId || null;

      const { error } = await supabase.from('supplement_stack').update(dbUpdates).eq('id', id);

      if (error) {
        console.error('❌ STACK: Error actualizando:', error.message);
        Alert.alert('Error', `No se pudo actualizar: ${error.message}`);
        return;
      }

      // Actualizar estado local
      setStackItems((prev) =>
        prev.map((item) =>
          item.id === id
            ? {
                ...item,
                ...updates,
              }
            : item
        )
      );

      console.warn('✅ STACK: Compuesto actualizado exitosamente');
    } catch (error) {
      console.error('Error updating stack item:', error);
      Alert.alert('Error', 'No se pudo actualizar el compuesto');
    }
  };

  // Abrir modal para añadir opción/platillo a una comida
  const handleAddOption = async (mealId: string) => {
    const meal = meals.find((m) => m.id === mealId);
    if (!meal) return;

    const mealIndex = meals.findIndex((m) => m.id === mealId);
    const displayName = meal.name || getSmartMealName(mealIndex, meals.length);

    setAddOptionMealId(mealId);
    setAddOptionMealName(displayName);
    setShowAddOption(true);
  };

  // Guardar nueva opción/platillo (alternativa) - CON cálculo de macros
  const handleSaveOption = async (
    mealId: string,
    optionName: string,
    ingredients: Ingredient[],
    notes?: string
  ) => {
    isInternalUpdate.current = true;
    // Guard: Verificar si puede guardar
    if (!canSave('save_meal')) return;

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      // Obtener el índice de la nueva opción
      const meal = meals.find((m) => m.id === mealId);
      const newOptionIndex = meal ? meal.options.length : 0;

      // Preparar ingredientes como JSONB
      const ingredientsJsonb = ingredients.map((ing) => ({
        name: ing.name,
        quantity: ing.quantity || '~100g',
        portion: ing.portion || '',
      }));

      // Crear la opción en meal_options con ingredients JSONB
      const { error: optionError } = await supabase.from('meal_options').insert({
        meal_id: mealId,
        user_id: user.id,
        name: optionName,
        ingredients: ingredientsJsonb,
        position: newOptionIndex,
        is_selected: false,
        ...(notes ? { notes } : {}),
      });

      if (optionError) throw optionError;

      // Refrescar datos
      fetchData();
    } catch (error) {
      console.error('Error saving option:', error);
      Alert.alert('Error', 'No se pudo guardar el platillo');
      throw error;
    }
  };

  // Shared function to save position (supports session A and B)
  const saveWorkoutPosition = async (newIndex: number, sessionIdx: number = 0) => {
    if (sessionIdx === 0) {
      setWorkoutPosIndex(newIndex);
    } else {
      setWorkoutPosIndexB(newIndex);
    }
    console.warn(`🏋️ PLAN: Nueva posición S${sessionIdx}:`, newIndex);

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      // Buscar registro existente para esta sesión
      const { data: existing } = await supabase
        .from('workout_block_position')
        .select('id')
        .eq('user_id', user.id)
        .eq('session_index', sessionIdx)
        .limit(1)
        .single();

      if (existing) {
        const { error } = await supabase
          .from('workout_block_position')
          .update({ position: newIndex, updated_at: new Date().toISOString() })
          .eq('id', existing.id);
        console.warn(
          `🏋️ PLAN: Actualizando posición S${sessionIdx}:`,
          newIndex,
          error ? `Error: ${error.message}` : 'OK'
        );
      } else {
        const { error } = await supabase
          .from('workout_block_position')
          .insert({ user_id: user.id, position: newIndex, session_index: sessionIdx });
        console.warn(
          `🏋️ PLAN: Insertando posición S${sessionIdx}:`,
          newIndex,
          error ? `Error: ${error.message}` : 'OK'
        );
      }

      // Calcular y guardar hora estimada del entrenamiento en user_profiles
      const mealTimes = meals.map((m) => ({ time: m.time, name: m.name }));
      const estimate = calculateWorkoutTime(newIndex, mealTimes);

      const updateFields: Record<string, any> =
        sessionIdx === 0
          ? {
              estimated_workout_time: estimate.estimatedTime,
              is_fasted_training: estimate.isFasted,
              workout_time_description: estimate.description,
            }
          : {
              estimated_workout_time_b: estimate.estimatedTime,
              is_fasted_training_b: estimate.isFasted,
              workout_time_description_b: estimate.description,
            };

      await supabase.from('user_profiles').update(updateFields).eq('user_id', user.id);

      console.log(
        `🏋️ PLAN: Hora estimada S${sessionIdx} guardada: ${estimate.estimatedTime} - ${estimate.description}`
      );
    }
  };

  // ============================================================================
  // BUILD TIMELINE
  // ============================================================================
  const buildTimeline = (): TimelineItem[] => {
    const today = new Date().getDay();

    // Filter stacks for today and expand items with multiple times
    // Each time in the times array creates a separate entry in the timeline
    const groupedStacks: Stack[] = [];
    const stacksByTime: Record<string, StackItem[]> = {};

    stackItems.forEach((item) => {
      // Check if item is for today
      if (item.daysOfWeek && !item.daysOfWeek.includes(today)) return;

      // Pre/post workout items: only show in timeline if they have additional times
      // Their pre/post role is handled separately in the workout block
      const isPurePrePost = item.isPreWorkout || item.isPostWorkout;

      // Get all times for this item (support both times array and single time)
      const itemTimes =
        item.times && item.times.length > 0 ? item.times : item.time ? [item.time] : [];

      // Skip if pre/post with no additional times (only handled in workout block)
      if (isPurePrePost && itemTimes.length === 0) return;
      // Skip non-pre/post items with no times
      if (!isPurePrePost && itemTimes.length === 0) return;

      // Create an entry for each time
      itemTimes.forEach((time) => {
        if (!stacksByTime[time]) stacksByTime[time] = [];
        // Add item with this specific time for display
        stacksByTime[time].push({ ...item, time });
      });
    });

    Object.entries(stacksByTime).forEach(([time, items]) => {
      groupedStacks.push({
        id: `stack-${time}`,
        time,
        items,
      });
    });

    // Create timeline with meals, stacks, and cardio blocks
    // Separate cardio: pre/post workout vs regular (by time)
    const sortedMealTimes = [...meals]
      .filter((m) => m.time)
      .sort((a, b) => a.time.localeCompare(b.time));
    const firstMealTime = sortedMealTimes.length > 0 ? sortedMealTimes[0].time : null;
    const workoutEstA = calculateWorkoutTime(workoutPosIndex, meals);
    const workoutEstB = hasDualSession ? calculateWorkoutTime(workoutPosIndexB, meals) : null;

    // Recompute is_fasted dynamically for all cardio blocks
    const todayCardioRaw = cardioBlocks.filter((c) => c.days_of_week?.includes(today) ?? true);
    const todayCardio = todayCardioRaw.map((c) => {
      let fasted = false;
      if (c.is_pre_workout || c.is_post_workout) {
        const si = c.workout_session_index ?? 0;
        if (si === 0) fasted = workoutEstA.isFasted;
        else if (si === 1) fasted = workoutEstB?.isFasted ?? false;
        else if (si === 2) fasted = workoutEstA.isFasted || (workoutEstB?.isFasted ?? false);
      } else {
        fasted = !firstMealTime || c.scheduled_time < firstMealTime;
      }
      return { ...c, is_fasted: fasted };
    });

    const regularCardio = todayCardio.filter((c) => !c.is_pre_workout && !c.is_post_workout);

    const timeline: TimelineItem[] = [
      ...meals.map((m) => ({ type: 'meal' as const, data: m, time: m.time })),
      ...groupedStacks.map((s) => ({ type: 'stack' as const, data: s, time: s.time })),
      ...regularCardio.map((c) => ({ type: 'cardio' as const, data: c, time: c.scheduled_time })),
    ].sort((a, b) => (a.time || '').localeCompare(b.time || ''));

    // Insert workout block A at position
    // workoutSessionIndex: 0 = Session A, 1 = Session B, 2 = Both
    const preStack = stackItems.filter(
      (i) =>
        i.isPreWorkout &&
        (i.daysOfWeek?.includes(today) ?? true) &&
        ((i.workoutSessionIndex ?? 0) === 0 || i.workoutSessionIndex === 2)
    );
    const postStack = stackItems.filter(
      (i) =>
        i.isPostWorkout &&
        (i.daysOfWeek?.includes(today) ?? true) &&
        ((i.workoutSessionIndex ?? 0) === 0 || i.workoutSessionIndex === 2)
    );

    const workoutBlock: WorkoutBlockData = {
      id: 'workout-block',
      routineName: todayRoutine,
      preStack,
      postStack,
      exercises: todayExercises,
      isExternalMode: isExternalMode,
      estimatedTime: workoutTimeEstimate.estimatedTime,
      isFasted: workoutTimeEstimate.isFasted,
      timeDescription: workoutTimeEstimate.description,
      sessionLabel: hasDualSession ? 'SESIÓN A' : undefined,
      scheduledTime: workoutScheduledTime,
    };

    // Pre/post cardio for session A
    const preCardioA = todayCardio.filter(
      (c) =>
        c.is_pre_workout && ((c.workout_session_index ?? 0) === 0 || c.workout_session_index === 2)
    );
    const postCardioA = todayCardio.filter(
      (c) =>
        c.is_post_workout && ((c.workout_session_index ?? 0) === 0 || c.workout_session_index === 2)
    );

    let finalTimeline: TimelineItem[];

    if (workoutScheduledTime) {
      // Time-based: insert workout block sorted by its scheduled time
      finalTimeline = [
        ...timeline,
        ...preCardioA.map((c) => ({
          type: 'cardio' as const,
          data: c,
          time: workoutScheduledTime,
        })),
        { type: 'workout' as const, data: workoutBlock, time: workoutScheduledTime },
        ...postCardioA.map((c) => ({
          type: 'cardio' as const,
          data: c,
          time: workoutScheduledTime,
        })),
      ].sort((a, b) => (a.time || '').localeCompare(b.time || ''));
    } else {
      // Position-based: insert at index
      const safeIndex = Math.min(Math.max(0, workoutPosIndex), timeline.length);
      finalTimeline = [
        ...timeline.slice(0, safeIndex),
        ...preCardioA.map((c) => ({ type: 'cardio' as const, data: c, time: c.scheduled_time })),
        { type: 'workout' as const, data: workoutBlock },
        ...postCardioA.map((c) => ({ type: 'cardio' as const, data: c, time: c.scheduled_time })),
        ...timeline.slice(safeIndex),
      ];
    }

    // Insert workout block B if dual session is active
    if (hasDualSession) {
      const workoutBlockB: WorkoutBlockData = {
        id: 'workout-block-b',
        routineName: todayRoutineB,
        preStack: stackItems.filter(
          (i) =>
            i.isPreWorkout &&
            (i.daysOfWeek?.includes(today) ?? true) &&
            (i.workoutSessionIndex === 1 || i.workoutSessionIndex === 2)
        ),
        postStack: stackItems.filter(
          (i) =>
            i.isPostWorkout &&
            (i.daysOfWeek?.includes(today) ?? true) &&
            (i.workoutSessionIndex === 1 || i.workoutSessionIndex === 2)
        ),
        exercises: todayExercisesB,
        isExternalMode: isExternalMode,
        estimatedTime: workoutTimeEstimateB.estimatedTime,
        isFasted: workoutTimeEstimateB.isFasted,
        timeDescription: workoutTimeEstimateB.description,
        sessionLabel: 'SESIÓN B',
        scheduledTime: workoutScheduledTimeB,
      };

      // Pre/post cardio for session B
      const preCardioB = todayCardio.filter(
        (c) => c.is_pre_workout && (c.workout_session_index === 1 || c.workout_session_index === 2)
      );
      const postCardioB = todayCardio.filter(
        (c) => c.is_post_workout && (c.workout_session_index === 1 || c.workout_session_index === 2)
      );

      if (workoutScheduledTimeB) {
        // Time-based: insert sorted by time
        finalTimeline = [
          ...finalTimeline,
          ...preCardioB.map((c) => ({
            type: 'cardio' as const,
            data: c,
            time: workoutScheduledTimeB,
          })),
          { type: 'workout' as const, data: workoutBlockB, time: workoutScheduledTimeB },
          ...postCardioB.map((c) => ({
            type: 'cardio' as const,
            data: c,
            time: workoutScheduledTimeB,
          })),
        ].sort((a, b) => (a.time || '').localeCompare(b.time || ''));
      } else {
        const safeIndexB = Math.min(Math.max(0, workoutPosIndexB), finalTimeline.length);
        finalTimeline = [
          ...finalTimeline.slice(0, safeIndexB),
          ...preCardioB.map((c) => ({ type: 'cardio' as const, data: c, time: c.scheduled_time })),
          { type: 'workout' as const, data: workoutBlockB },
          ...postCardioB.map((c) => ({ type: 'cardio' as const, data: c, time: c.scheduled_time })),
          ...finalTimeline.slice(safeIndexB),
        ];
      }
    }

    return finalTimeline;
  };

  const timeline = buildTimeline();

  // ============================================================================
  // AUTO-SCROLL: Calcular y scrollear al elemento que corresponde a la hora actual
  // ============================================================================
  const getCurrentTimelineIndex = useCallback(() => {
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    let bestIndex = 0;
    let smallestPositiveDiff = Infinity; // Para items que aún no pasan
    let closestPastIndex = 0;
    let smallestNegativeDiff = -Infinity; // Para items que ya pasaron (el más reciente)

    timeline.forEach((item, index) => {
      let itemTime: string | undefined;

      if (item.type === 'meal') {
        itemTime = (item.data as Meal).time;
      } else if (item.type === 'stack') {
        itemTime = (item.data as Stack).time;
      }

      if (itemTime) {
        const [hours, minutes] = itemTime.split(':').map(Number);
        const itemMinutes = hours * 60 + minutes;
        const diff = itemMinutes - currentMinutes;

        if (diff >= 0 && diff < smallestPositiveDiff) {
          // Item que aún no ha pasado (próximo)
          smallestPositiveDiff = diff;
          bestIndex = index;
        } else if (diff < 0 && diff > smallestNegativeDiff) {
          // Item que ya pasó (buscar el más reciente)
          smallestNegativeDiff = diff;
          closestPastIndex = index;
        }
      }
    });

    // Si no hay items futuros, ir al más reciente que ya pasó
    if (smallestPositiveDiff === Infinity) {
      bestIndex = closestPastIndex;
    }

    return bestIndex;
  }, [timeline]);

  // Handler para guardar posición y disparar scroll cuando el último item se renderice
  const handleItemLayout = useCallback(
    (index: number, y: number) => {
      itemLayouts.current[index] = { y, height: 0 };
      layoutsReady.current++;

      // Marcar que la carga inicial está completa cuando todos los layouts están listos
      if (layoutsReady.current >= timeline.length && timeline.length > 0) {
        hasScrolledToCurrentItem.current = true;
        hasCompletedInitialLoad.current = true;
      }
    },
    [timeline.length]
  );

  // Ref para acceder al timeline actual sin causar re-creación del callback
  const timelineRef = useRef(timeline);
  timelineRef.current = timeline;

  // Ref para la función getCurrentTimelineIndex
  const getCurrentTimelineIndexRef = useRef(getCurrentTimelineIndex);
  getCurrentTimelineIndexRef.current = getCurrentTimelineIndex;

  // Scroll automático SOLO cuando la pantalla recibe focus desde otro módulo
  useFocusEffect(
    useCallback(() => {
      // Incrementar contador de focus
      focusCount.current++;

      // Si es una actualización interna, resetear flag y salir sin hacer scroll
      if (isInternalUpdate.current) {
        isInternalUpdate.current = false;
        return;
      }

      // Solo hacer auto-scroll si:
      // 1. Ya completamos la carga inicial (hasCompletedInitialLoad)
      // 2. Es al menos el segundo focus (focusCount > 1) - significa que navegamos de regreso
      // 3. No hemos hecho scroll en este focus
      // 4. Tenemos layouts y timeline disponibles
      const currentTimeline = timelineRef.current;
      const shouldAutoScroll =
        hasCompletedInitialLoad.current &&
        focusCount.current > 1 &&
        !hasScrolledThisFocus.current &&
        itemLayouts.current.length > 0 &&
        currentTimeline.length > 0;

      if (shouldAutoScroll) {
        const currentIndex = getCurrentTimelineIndexRef.current();
        const layout = itemLayouts.current[currentIndex];

        if (layout && layout.y > 0) {
          hasScrolledThisFocus.current = true; // Marcar que ya hicimos scroll
          setTimeout(() => {
            scrollViewRef.current?.scrollTo({
              y: Math.max(0, layout.y - 30),
              animated: true,
            });
          }, 200);
        }
      }

      // Cuando pierda focus, resetear el flag para el próximo focus
      return () => {
        hasScrolledThisFocus.current = false;
      };
    }, []) // Sin dependencias - usar refs para acceder a valores actuales
  );

  // ============================================================================
  // RENDER
  // ============================================================================
  if (!isAuthenticated) {
    return <GuestModuleLanding module="plan" />;
  }

  if (isLoading) {
    return (
      <View className="flex-1 bg-black items-center justify-center">
        <Text className="text-white">Cargando plan...</Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-black">
      {/* Header - PREMIUM SAVAGE EDITION */}
      <View
        className="px-5 pt-14 pb-5"
        style={{
          backgroundColor: '#000000',
          borderBottomWidth: 1,
          borderBottomColor: 'rgba(34, 197, 94, 0.3)',
          shadowColor: '#22C55E',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.15,
          shadowRadius: 12,
        }}
      >
        {/* Línea decorativa superior - Savage Red */}
        <View
          className="absolute top-0 left-0 right-0 h-[2px]"
          style={{
            backgroundColor: '#22C55E',
            shadowColor: '#22C55E',
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: 0.8,
            shadowRadius: 6,
          }}
        />

        <View className="flex-row justify-between items-start">
          <View className="flex-1">
            <Text className="text-zinc-600 text-[10px] tracking-[4px] uppercase mb-1 font-bold">
              AGENDA METABÓLICA
            </Text>
            <View className="flex-row items-center gap-2">
              <View
                className="w-2 h-2 rounded-full"
                style={{
                  backgroundColor: '#22C55E',
                  shadowColor: '#22C55E',
                  shadowOffset: { width: 0, height: 0 },
                  shadowOpacity: 1,
                  shadowRadius: 4,
                }}
              />
              <Text
                className="text-white text-2xl font-black tracking-tight uppercase"
                style={{
                  textShadowColor: 'rgba(34, 197, 94, 0.5)',
                  textShadowOffset: { width: 0, height: 0 },
                  textShadowRadius: 12,
                }}
              >
                {planName}
              </Text>
            </View>
          </View>

          {/* Action Buttons */}
          <View className="flex-row gap-2">
            {/* Tienda Button - Abre ShopModal */}
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                hankToolsEvent.open('shop');
              }}
              className="items-center px-3 py-2.5 rounded-xl active:scale-95"
              style={{
                backgroundColor: 'rgba(220, 38, 38, 0.08)',
                borderWidth: 1.5,
                borderColor: 'rgba(220, 38, 38, 0.4)',
                shadowColor: '#DC2626',
                shadowOffset: { width: 0, height: 0 },
                shadowOpacity: 0.3,
                shadowRadius: 12,
              }}
            >
              <View
                className="w-8 h-8 rounded-full items-center justify-center"
                style={{ backgroundColor: 'rgba(220, 38, 38, 0.2)' }}
              >
                <ShoppingBag size={14} color="#DC2626" />
              </View>
              <Text className="text-red-500 text-[9px] font-bold tracking-widest mt-1">
                TRENS SHOP
              </Text>
            </Pressable>

            {/* Stack Button Premium */}
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setStackManagerInitialView('list');
                setShowStackManager(true);
              }}
              className="items-center px-3 py-2.5 rounded-xl active:scale-95"
              style={{
                backgroundColor: 'rgba(168, 85, 247, 0.08)',
                borderWidth: 1.5,
                borderColor: 'rgba(168, 85, 247, 0.4)',
                shadowColor: '#A855F7',
                shadowOffset: { width: 0, height: 0 },
                shadowOpacity: 0.3,
                shadowRadius: 12,
              }}
            >
              <View
                className="w-8 h-8 rounded-full items-center justify-center"
                style={{ backgroundColor: 'rgba(168, 85, 247, 0.2)' }}
              >
                <Pill size={14} color="#A855F7" />
              </View>
              <Text className="text-purple-400 text-[9px] font-bold tracking-widest mt-1">
                STACK
              </Text>
              {stackItems.length > 0 && (
                <Text className="text-purple-500/60 text-[8px] font-mono">{stackItems.length}</Text>
              )}
            </Pressable>

            {/* Notes / Pizarra Button */}
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setShowPlanNotes(true);
              }}
              className="items-center px-3 py-2.5 rounded-xl active:scale-95"
              style={{
                backgroundColor: 'rgba(234, 179, 8, 0.08)',
                borderWidth: 1.5,
                borderColor: 'rgba(234, 179, 8, 0.4)',
                shadowColor: '#EAB308',
                shadowOffset: { width: 0, height: 0 },
                shadowOpacity: 0.3,
                shadowRadius: 12,
              }}
            >
              <View
                className="w-8 h-8 rounded-full items-center justify-center"
                style={{ backgroundColor: 'rgba(234, 179, 8, 0.2)' }}
              >
                <StickyNote size={14} color="#EAB308" />
              </View>
              <Text className="text-yellow-400 text-[9px] font-bold tracking-widest mt-1">
                NOTAS
              </Text>
            </Pressable>
          </View>
        </View>

        {/* Daily Stats Badges */}
        <View className="flex-row flex-wrap gap-3 mt-3">
          <View className="flex-row items-center gap-1">
            <View className="w-1.5 h-1.5 rounded-full bg-green-500" />
            <Text className="text-zinc-500 text-[10px] font-mono">{meals.length} COMIDAS</Text>
          </View>
        </View>
      </View>

      {/* Timeline */}
      <ScrollView
        ref={scrollViewRef}
        className="flex-1 px-5"
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#22C55E" />
        }
      >
        <View className="pt-6 gap-2 relative">
          {/* Timeline Line - Premium Savage Line - Solo dentro del contenedor de items */}
          {timeline.length > 0 && (
            <View
              className="absolute left-[18px] top-0 bottom-0 w-[2.5px] rounded-full"
              style={{
                backgroundColor: 'rgba(34, 197, 94, 0.25)',
                shadowColor: '#22C55E',
                shadowOffset: { width: 0, height: 0 },
                shadowOpacity: 0.4,
                shadowRadius: 6,
              }}
            />
          )}

          {timeline.length === 0 ? (
            <View className="items-center justify-center py-16">
              {/* Empty State Premium */}
              <View
                className="w-20 h-20 rounded-2xl items-center justify-center mb-4"
                style={{
                  backgroundColor: 'rgba(34, 197, 94, 0.12)',
                  borderWidth: 1,
                  borderColor: 'rgba(34, 197, 94, 0.25)',
                }}
              >
                <Plus size={32} color="#22C55E" />
              </View>
              <Text className="text-white font-bold text-lg mb-1">Sin comidas configuradas</Text>
              <Text className="text-zinc-400 text-sm text-center font-mono max-w-[240px]">
                Agrega tu primera comida para comenzar tu plan metabólico
              </Text>
            </View>
          ) : (
            timeline.map((item, timelineIndex) => {
              if (item.type === 'meal') {
                const meal = item.data as Meal;
                const mealIndex = meals.findIndex((m) => m.id === meal.id);
                // Usar nombre de DB si existe, sino lógica inteligente
                const displayName = meal.name || getSmartMealName(mealIndex, meals.length);
                return (
                  <View
                    key={meal.id}
                    onLayout={(e) => handleItemLayout(timelineIndex, e.nativeEvent.layout.y)}
                  >
                    <MealCard
                      meal={meal}
                      mealName={displayName}
                      onSwap={handleSwap}
                      onTimeChange={handleTimeChange}
                      onDelete={handleDeleteMeal}
                      onDeleteOption={handleDeleteOption}
                      onEdit={handleEditMeal}
                      onAddOption={handleAddOption}
                    />
                  </View>
                );
              }

              if (item.type === 'stack') {
                const stack = item.data as Stack;
                return (
                  <View
                    key={stack.id}
                    onLayout={(e) => handleItemLayout(timelineIndex, e.nativeEvent.layout.y)}
                  >
                    <StackCard
                      stack={stack}
                      onItemDelete={handleRemoveStackItem}
                      onBuyProduct={(productId) => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                        hankToolsEvent.open('shop', { productId });
                      }}
                    />
                  </View>
                );
              }

              if (item.type === 'workout') {
                const workout = item.data as WorkoutBlockData;
                const isSessionB = workout.id === 'workout-block-b';
                const sessionIdx = isSessionB ? 1 : 0;

                return (
                  <View
                    key={workout.id}
                    onLayout={(e) => handleItemLayout(timelineIndex, e.nativeEvent.layout.y)}
                  >
                    <WorkoutBlock
                      data={workout}
                      onMoveUp={() => {}}
                      onMoveDown={() => {}}
                      isFirst={true}
                      isLast={true}
                      onPressRoutine={() => router.push('/(tabs)/gym')}
                      onTimeChange={(time) => handleWorkoutTimeChange(time, sessionIdx)}
                    />
                  </View>
                );
              }

              if (item.type === 'cardio') {
                const cardio = item.data as CardioBlock;
                const cardioIndex = cardioBlocks.findIndex((c) => c.id === cardio.id);
                const cardioLabel =
                  cardioBlocks.length === 1 ? 'CARDIO' : `CARDIO ${cardioIndex + 1}`;
                return (
                  <View
                    key={cardio.id}
                    onLayout={(e) => handleItemLayout(timelineIndex, e.nativeEvent.layout.y)}
                  >
                    <CardioBlockCard
                      cardio={cardio}
                      cardioLabel={cardioLabel}
                      onTimeChange={handleCardioTimeChange}
                      onDelete={handleDeleteCardio}
                      onEdit={handleEditCardio}
                    />
                  </View>
                );
              }

              return null;
            })
          )}
        </View>

        {/* Add Meal Button - PREMIUM SAVAGE */}
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setShowAddMeal(true);
          }}
          className="w-full py-5 mt-6 rounded-2xl active:scale-[0.98]"
          style={{
            backgroundColor: 'rgba(39, 39, 42, 0.4)',
            borderWidth: 1.5,
            borderStyle: 'dashed',
            borderColor: 'rgba(34, 197, 94, 0.4)',
            shadowColor: '#22C55E',
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: 0.15,
            shadowRadius: 24,
          }}
        >
          <View className="items-center">
            <View
              className="w-12 h-12 rounded-xl items-center justify-center mb-2"
              style={{ backgroundColor: 'rgba(34, 197, 94, 0.15)' }}
            >
              <Plus size={24} color="#22C55E" />
            </View>
            <Text className="text-green-500 font-bold tracking-widest text-sm">AGREGAR COMIDA</Text>
            <Text className="text-zinc-500 text-[10px] font-mono mt-1">
              Nueva comida en tu plan
            </Text>
          </View>
        </Pressable>

        {/* Add Stack Button - PURPLE */}
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setStackManagerInitialView('add');
            setShowStackManager(true);
          }}
          className="w-full py-5 mt-3 rounded-2xl active:scale-[0.98]"
          style={{
            backgroundColor: 'rgba(39, 39, 42, 0.4)',
            borderWidth: 1.5,
            borderStyle: 'dashed',
            borderColor: 'rgba(168, 85, 247, 0.4)',
            shadowColor: '#A855F7',
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: 0.15,
            shadowRadius: 24,
          }}
        >
          <View className="items-center">
            <View
              className="w-12 h-12 rounded-xl items-center justify-center mb-2"
              style={{ backgroundColor: 'rgba(168, 85, 247, 0.15)' }}
            >
              <Layers size={24} color="#A855F7" />
            </View>
            <Text style={{ color: '#A855F7' }} className="font-bold tracking-widest text-sm">
              AGREGAR STACK
            </Text>
            <Text className="text-zinc-500 text-[10px] font-mono mt-1">
              Suplementos y compuestos
            </Text>
          </View>
        </Pressable>

        {/* Add Cardio Button - ZINC/PLOMO */}
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setShowAddCardio(true);
          }}
          className="w-full py-5 mt-3 mb-28 rounded-2xl active:scale-[0.98]"
          style={{
            backgroundColor: 'rgba(39, 39, 42, 0.4)',
            borderWidth: 1.5,
            borderStyle: 'dashed',
            borderColor: 'rgba(113, 113, 122, 0.4)',
            shadowColor: '#71717A',
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: 0.15,
            shadowRadius: 24,
          }}
        >
          <View className="items-center">
            <View
              className="w-12 h-12 rounded-xl items-center justify-center mb-2"
              style={{ backgroundColor: 'rgba(113, 113, 122, 0.15)' }}
            >
              <Flame size={24} color="#71717A" />
            </View>
            <Text style={{ color: '#71717A' }} className="font-bold tracking-widest text-sm">
              AGREGAR CARDIO
            </Text>
            <Text className="text-zinc-500 text-[10px] font-mono mt-1">Nuevo bloque de cardio</Text>
          </View>
        </Pressable>
      </ScrollView>

      {/* Modals */}
      <AddMealModal
        visible={showAddMeal}
        onClose={() => setShowAddMeal(false)}
        onSave={handleAddMeal}
      />

      <EditMealModal
        visible={showEditMeal}
        meal={editingMeal}
        onClose={() => {
          setShowEditMeal(false);
          setEditingMeal(null);
        }}
        onSave={handleSaveIngredients}
      />

      <TimePickerModal
        visible={showTimePicker}
        currentTime={timePickerCurrentTime}
        onClose={() => {
          setShowTimePicker(false);
          setTimePickerMealId(null);
        }}
        onSave={handleSaveTime}
      />

      <StackManagerModal
        visible={showStackManager}
        onClose={() => {
          setShowStackManager(false);
          setStackManagerInitialView('list');
        }}
        items={stackItems}
        onAddItem={handleAddStackItem}
        onRemoveItem={handleRemoveStackItem}
        onUpdateItem={handleUpdateStackItem}
        hasDualSession={hasDualSession}
        initialViewMode={stackManagerInitialView}
      />

      <AddOptionModal
        visible={showAddOption}
        mealId={addOptionMealId || ''}
        mealName={addOptionMealName}
        onClose={() => {
          setShowAddOption(false);
          setAddOptionMealId(null);
          setAddOptionMealName('');
        }}
        onSave={handleSaveOption}
      />

      <PlanNotesModal
        visible={showPlanNotes}
        onClose={() => setShowPlanNotes(false)}
        initialTab="nutricion"
      />

      <AddCardioModal
        visible={showAddCardio}
        onClose={() => {
          setShowAddCardio(false);
          setEditingCardioId(null);
          setEditingCardioData(null);
        }}
        onSave={editingCardioId ? handleUpdateCardio : handleAddCardio}
        hasDualSession={hasDualSession}
        editData={editingCardioData}
      />
    </View>
  );
}
