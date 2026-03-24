// ============================================================================
// PLAN MODULE - Agenda Metabólica Adaptable
// Línea de tiempo con Comidas, Stacks y Bloque de Entrenamiento
// ============================================================================

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { View, Text, ScrollView, Pressable, RefreshControl } from 'react-native';
import { PWAGuard } from '../../../components/auth/PWAGuard';
import { Alert } from '../../../lib/alert';
import Animated, { useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { Plus, Pill, Sparkles, ShoppingCart, StickyNote } from 'lucide-react-native';
import * as Haptics from '../../../lib/haptics';
import { useRouter, useFocusEffect } from 'expo-router';

import { MealCard } from '../../../components/plan/MealCard';
import { StackCard } from '../../../components/plan/StackCard';
import { DraggableWorkoutBlock } from '../../../components/plan/DraggableWorkoutBlock';
import { AddMealModal } from '../../../components/plan/AddMealModal';
import { EditMealModal } from '../../../components/plan/EditMealModal';
import { TimePickerModal } from '../../../components/plan/TimePickerModal';
import { StackManagerModal } from '../../../components/plan/StackManagerModal';
import { AddOptionModal } from '../../../components/plan/AddOptionModal';
import { ShoppingListModal } from '../../../components/plan/ShoppingListModal';
import { PlanNotesModal } from '../../../components/plan/PlanNotesModal';
import { supabase } from '../../../lib/supabase';
import { useHank } from '../../../context/HankContext';
import { useSaveGuard } from '../../_layout';
import { useSport } from '../../../context/SportContext';
import { useNotifications } from '../../../context/NotificationContext';
import {
  calculateMacrosWithAI,
  calculateUserDailyMacros,
  recalculateAllMealsForNewCount,
  calculateMealWithUserMacros,
  calculateNutritionFromQuantities,
  convertGramsPortions,
} from '../../../services/hank/nutrition';

// Import sport-specific screens
import RaceScreen from '../race';
import SpotScreen from '../spot';

// ============================================================================
// ANIMATED WRAPPER - Para animar items durante drag
// ============================================================================
interface AnimatedTimelineItemProps {
  children: React.ReactNode;
  offset: number;
}

const AnimatedTimelineItem: React.FC<AnimatedTimelineItemProps> = ({ children, offset }) => {
  const animatedStyle = useAnimatedStyle(
    () => ({
      transform: [{ translateY: withSpring(offset, { damping: 20, stiffness: 300 }) }],
    }),
    [offset]
  );

  return <Animated.View style={animatedStyle}>{children}</Animated.View>;
};

// ============================================================================
// TYPES
// ============================================================================
interface Ingredient {
  id: string;
  name: string;
  quantity: string;
  portion?: string;
  nutritionInfo?: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    suggestedGrams?: number;
  };
}

interface MealOption {
  id: string;
  name: string;
  ingredients: Ingredient[];
}

interface Meal {
  id: string;
  name: string; // Nombre guardado en DB
  time: string;
  options: MealOption[];
  selectedOption: number;
  targetMacros?: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
  };
  actualMacros?: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
  };
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
}

interface TimelineItem {
  type: 'meal' | 'stack' | 'workout';
  data: Meal | Stack | WorkoutBlockData;
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
 * Calcula los macros REALES de una comida sumando la nutritionInfo de cada ingrediente
 * de la opción seleccionada. Retorna undefined si no hay datos de nutrición.
 */
const computeActualMacros = (
  options: MealOption[],
  selectedOption: number
): { calories: number; protein: number; carbs: number; fat: number } | undefined => {
  const opt = options[selectedOption];
  if (!opt) return undefined;

  let cal = 0,
    pro = 0,
    car = 0,
    fat = 0;
  let hasNutrition = false;

  for (const ing of opt.ingredients) {
    if (ing.nutritionInfo) {
      hasNutrition = true;
      cal += ing.nutritionInfo.calories || 0;
      pro += ing.nutritionInfo.protein || 0;
      car += ing.nutritionInfo.carbs || 0;
      fat += ing.nutritionInfo.fat || 0;
    }
  }

  return hasNutrition
    ? {
        calories: Math.round(cal),
        protein: Math.round(pro),
        carbs: Math.round(car),
        fat: Math.round(fat),
      }
    : undefined;
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

  // Modals
  const [showAddMeal, setShowAddMeal] = useState(false);
  const [showEditMeal, setShowEditMeal] = useState(false);
  const [editingMeal, setEditingMeal] = useState<Meal | null>(null);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [timePickerMealId, setTimePickerMealId] = useState<string | null>(null);
  const [timePickerCurrentTime, setTimePickerCurrentTime] = useState('12:00');
  const [timePickerMode, setTimePickerMode] = useState<'meal' | 'stack'>('meal');
  const [timePickerStackTime, setTimePickerStackTime] = useState<string | null>(null);
  const [showStackManager, setShowStackManager] = useState(false);
  const [showShoppingList, setShowShoppingList] = useState(false);
  const [showPlanNotes, setShowPlanNotes] = useState(false);
  const [showAddOption, setShowAddOption] = useState(false);
  const [addOptionMealId, setAddOptionMealId] = useState<string | null>(null);
  const [addOptionMealName, setAddOptionMealName] = useState('');
  const [mealMacros, setMealMacros] = useState<{
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
  } | null>(null);
  // Macros diarios totales (para calcular por comida cuando el usuario agrega comidas)
  const [dailyMacroTotals, setDailyMacroTotals] = useState<{
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
  } | null>(null);
  const [newMealMacros, setNewMealMacros] = useState<{
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isAdjustingMacros, setIsAdjustingMacros] = useState(false);
  const [isDraggingWorkout, setIsDraggingWorkout] = useState(false);
  const [dragTargetIndex, setDragTargetIndex] = useState<number | null>(null);

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
  // HELPER: Obtener perfil completo con medidas corporales Y macros cacheados
  // ============================================================================
  const getFullProfileWithMeasurements = async (userId: string) => {
    // Obtener perfil (incluyendo macros cacheados)
    const { data: profile } = await supabase
      .from('user_profiles')
      .select(
        'weight, height, goal, age, sex, body_fat_percentage, muscle_mass, activity_level, training_experience, metabolic_rate, training_days_per_week, cached_daily_macros, cached_macros_meal_count, cached_macros_updated_at'
      )
      .eq('user_id', userId)
      .single();

    // Obtener medidas corporales
    const { data: measurements } = await supabase
      .from('body_measurements')
      .select('name, value, is_dominant')
      .eq('user_id', userId);

    return {
      profile,
      bodyMeasurements: measurements || [],
    };
  };

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
          meal_options (
            id,
            name,
            ingredients,
            position,
            is_selected
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
        // Calcular macros objetivo por comida
        let perMealMacros: {
          calories: number;
          protein: number;
          carbs: number;
          fat: number;
        } | null = null;

        // Obtener perfil con macros cacheados
        const { profile, bodyMeasurements } = await getFullProfileWithMeasurements(user.id);

        // Verificar si podemos usar macros cacheados de la DB
        const dbCachedMacros = profile?.cached_daily_macros as any;
        const dbCachedMealCount = profile?.cached_macros_meal_count as number;
        const canUseDBCache =
          dbCachedMacros && dbCachedMacros.perMeal && dbCachedMealCount === mealsData.length;

        if (canUseDBCache) {
          // Usar macros de la base de datos
          if (__DEV__) {
            console.log('💾 PLAN: Usando macros cacheados de DB');
          }
          perMealMacros = dbCachedMacros.perMeal;
          // Guardar totales en estado para uso al agregar comidas
          if (dbCachedMacros.totalCalories) {
            setDailyMacroTotals({
              calories: dbCachedMacros.totalCalories,
              protein: dbCachedMacros.totalProtein,
              carbs: dbCachedMacros.totalCarbs,
              fat: dbCachedMacros.totalFat,
            });
          }
        } else {
          // Calcular nuevos macros con IA
          if (__DEV__) {
            console.log('🧠 PLAN: Calculando macros con IA...');
          }
          try {
            if (profile) {
              const dailyMacros = await calculateUserDailyMacros({
                weight: profile.weight || '75 KG',
                height: profile.height || '1.75 M',
                goal: profile.goal || 'MANTENER',
                mealCount: mealsData.length || 3,
                // Datos adicionales para ultra personalización
                age: profile.age || undefined,
                sex: profile.sex || undefined,
                bodyFatPercentage: profile.body_fat_percentage || undefined,
                muscleMass: profile.muscle_mass || undefined,
                activityLevel: profile.activity_level || 'MODERADO',
                trainingExperience: profile.training_experience || undefined,
                metabolicRate: profile.metabolic_rate || undefined,
                trainingDaysPerWeek: profile.training_days_per_week || undefined,
                // Medidas corporales
                bodyMeasurements: bodyMeasurements,
              });
              perMealMacros = dailyMacros.perMeal || null;

              // Guardar macros totales en estado para uso al agregar comidas
              setDailyMacroTotals({
                calories: dailyMacros.totalCalories,
                protein: dailyMacros.totalProtein,
                carbs: dailyMacros.totalCarbs,
                fat: dailyMacros.totalFat,
              });

              // Guardar en DB para próximas cargas
              await supabase
                .from('user_profiles')
                .update({
                  cached_daily_macros: dailyMacros,
                  cached_macros_meal_count: mealsData.length,
                  cached_macros_updated_at: new Date().toISOString(),
                })
                .eq('user_id', user.id);

              if (__DEV__) {
                console.log('💾 PLAN: Macros guardados en DB para cache');
              }
            }
          } catch (error) {
            console.error('Error calculating daily macros:', error);
          }
        }

        const formattedMeals: Meal[] = mealsData.map((meal: any) => {
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
              ingredients: jsonIngredients.map((ing: any, idx: number) => {
                // Normalizar nutritionInfo: soportar formato anidado y top-level
                const nutrition = ing.nutritionInfo
                  ? ing.nutritionInfo
                  : ing.calories != null || ing.protein != null
                    ? {
                        calories: ing.calories || 0,
                        protein: ing.protein || 0,
                        carbs: ing.carbs || 0,
                        fat: ing.fat || 0,
                      }
                    : undefined;
                return {
                  id: ing.id || `ing-${idx}`,
                  name: ing.name,
                  quantity: ing.quantity || '~100g',
                  portion: ing.portion,
                  ...(nutrition ? { nutritionInfo: nutrition } : {}),
                };
              }),
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
                ingredients: (opt.ingredients || []).map((ing: any, idx: number) => {
                  // Normalizar nutritionInfo: soportar formato anidado y top-level
                  const nutrition = ing.nutritionInfo
                    ? ing.nutritionInfo
                    : ing.calories != null || ing.protein != null
                      ? {
                          calories: ing.calories || 0,
                          protein: ing.protein || 0,
                          carbs: ing.carbs || 0,
                          fat: ing.fat || 0,
                        }
                      : undefined;
                  return {
                    id: ing.id || `opt-ing-${idx}`,
                    name: ing.name,
                    quantity: ing.quantity || '~100g',
                    portion: ing.portion,
                    ...(nutrition ? { nutritionInfo: nutrition } : {}),
                  };
                }),
              });
            });
          }

          // Validar selected_option: si excede el número de opciones, usar 0
          // Esto maneja el caso donde se eliminó una alternativa
          const savedSelection = meal.selected_option ?? 0;
          const validSelection =
            options.length > 0 ? Math.min(Math.max(0, savedSelection), options.length - 1) : 0;

          // Calcular macros reales desde nutritionInfo de ingredientes
          const actual = computeActualMacros(options, validSelection);

          return {
            id: meal.id,
            name: meal.name || 'Comida',
            time: meal.scheduled_time?.slice(0, 5) || '12:00',
            selectedOption: validSelection,
            targetMacros: perMealMacros || undefined,
            actualMacros: actual,
            options,
          };
        });

        // Sincronizar nombres con lógica inteligente en DB si no coinciden
        const total = formattedMeals.length;
        for (let i = 0; i < formattedMeals.length; i++) {
          const expectedName = getSmartMealName(i, total);
          if (formattedMeals[i].name !== expectedName) {
            formattedMeals[i].name = expectedName;
            // Actualizar en DB silenciosamente
            supabase
              .from('meals')
              .update({ name: expectedName, position: i })
              .eq('id', formattedMeals[i].id)
              .then(() => {});
          }
        }

        setMeals(formattedMeals);

        // Guardar macros por comida en el estado para uso posterior
        if (perMealMacros) {
          setMealMacros(perMealMacros);
        }
      }

      // Fetch supplement stack
      const { data: stackData } = await supabase
        .from('supplement_stack')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_active', true);

      if (stackData) {
        const formattedStack: StackItem[] = stackData.map((item) => ({
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
        }));
        setStackItems(formattedStack);
      }

      // Fetch workout block position
      const { data: posData, error: posError } = await supabase
        .from('workout_block_position')
        .select('position')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false })
        .limit(1);

      console.warn('🏋️ PLAN: Posición cargada:', posData, posError);
      if (posData && posData.length > 0) {
        setWorkoutPosIndex(posData[0].position);
      }

      // Fetch current training day from profiles
      // IMPORTANTE: Usar el día guardado directamente, sin avanzar automáticamente
      // GYM es quien maneja el avance de días, PLAN solo lee
      const { data: profileData } = await supabase
        .from('profiles')
        .select(
          'training_current_day, training_routine_names, training_last_access, training_frequency'
        )
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
      // MODO PERSONALIZADO: Usa el sistema rotativo de TRENS
      // ===========================================================================
      if (trainingMode === 'external' && Object.keys(externalSchedule).length > 0) {
        // TRENS usa sistema ROTATIVO: training_current_day (0, 1, 2...)
        // NO basado en día de la semana (Lunes, Martes)
        const currentDayIndex = profileData?.training_current_day ?? 0;
        const scheduleEntries = Object.entries(externalSchedule);
        const totalDays = scheduleEntries.length;

        // Obtener el día de entrenamiento actual (rotativo)
        const safeIndex = currentDayIndex % totalDays;
        const [dayName, muscleGroup] = scheduleEntries[safeIndex] || ['', ''];
        const todayMuscle = muscleGroup ? String(muscleGroup) : null;
        setIsExternalMode(true);

        console.warn(
          `🏋️ PLAN [PERSONALIZADO]: Día ${safeIndex + 1}/${totalDays} → ${dayName}: ${todayMuscle || 'DESCANSO'}`
        );
        console.warn('   Schedule:', scheduleEntries.map(([d, m]) => `${d}:${m}`).join(', '));

        if (todayMuscle) {
          // Limpiar prefijo "Día X:" si ya viene incluido en el valor
          const cleanMuscle = todayMuscle.replace(/^Día\s*\d+\s*:\s*/i, '');
          setTodayRoutine(cleanMuscle);
          setTodayExercises([]); // Modo personalizado - ejercicios pendientes de agregar
          console.warn(`🏋️ PLAN [PERSONALIZADO]: Mostrando ${cleanMuscle}`);
        } else {
          setTodayRoutine('DESCANSO');
          setTodayExercises([]);
          console.warn('🏋️ PLAN [PERSONALIZADO]: Sin entrenamiento configurado');
        }
      } else {
        // ===========================================================================
        // MODO GYM MODULE: Cargar ejercicios del día actual
        // ===========================================================================
        setIsExternalMode(false);

        // Usar el día guardado en la base de datos
        const currentTrainingDay = profileData?.training_current_day ?? 0;

        // Leer nombres de rutinas directamente de la base de datos
        // Si no hay, mostrará "ENTRENAMIENTO" para indicar que GYM no ha sincronizado
        const routineNames = profileData?.training_routine_names || {};

        console.warn(
          `🏋️ PLAN: Día: ${currentTrainingDay}, Rutina: ${routineNames[String(currentTrainingDay)] || 'NO SINCRONIZADO'}`
        );

        // Fetch exercises for current training day
        // ARQUITECTURA: user_exercise_config + exercises (igual que GYM)
        const { data: userConfigs, error: exercisesError } = await supabase
          .from('user_exercise_config')
          .select(
            `
            id,
            exercise_id,
            training_days,
            display_order,
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
                item.custom_media_url ||
                exercise?.default_media_url ||
                exercise?.thumbnail_url ||
                '',
              video_url: exercise?.video_url || '',
              training_days: item.training_days || [0],
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
              .map((e: any) => `${e.name}: [${(e.training_days || [0]).join(',')}]`)
              .join(' | ')
          );
        }

        // Filtrar por día de entrenamiento
        const todayExercisesFiltered = exercisesData.filter((item: any) => {
          const itemDays = item.training_days || [0];
          return itemDays.includes(currentTrainingDay);
        });

        console.warn(
          `🏋️ PLAN: Ejercicios para día ${currentTrainingDay}: ${todayExercisesFiltered.length}`
        );

        // Si no hay ejercicios para el día actual = DESCANSO
        // (igual que ADN - no mostrar todos los ejercicios)

        if (todayExercisesFiltered.length > 0) {
          // Usar nombre de rutina guardado de la base de datos
          const savedRoutineName = routineNames[String(currentTrainingDay)];

          // Limpiar prefijo "Día X:" si ya viene incluido
          const cleanRoutineName = savedRoutineName
            ? savedRoutineName.replace(/^Día\s*\d+\s*:\s*/i, '')
            : null;

          // Si no hay nombre guardado, usar 'ENTRENAMIENTO' simple
          const finalRoutineName = cleanRoutineName || 'ENTRENAMIENTO';

          setTodayRoutine(finalRoutineName);

          // Helper para verificar si es video
          const isVideoUrl = (url: string) => {
            if (!url) return false;
            const videoExtensions = ['.mp4', '.mov', '.avi', '.webm', '.m4v'];
            return videoExtensions.some((ext) => url.toLowerCase().includes(ext));
          };

          // Formatear ejercicios para el slider
          const formattedExercises = todayExercisesFiltered.map((item: any, idx: number) => {
            const mediaUrl = item.media_url || '';
            const explicitVideoUrl = item.video_url || '';

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

            return {
              id: item.id || `ex-${idx}`,
              name: item.name,
              imageUrl,
              videoUrl,
            };
          });

          console.warn('🏋️ Rutina:', finalRoutineName);
          console.warn('🏋️ Ejercicios formateados:', formattedExercises.length);
          setTodayExercises(formattedExercises);
        } else {
          // No hay ejercicios para hoy - día de descanso
          console.warn('🏋️ Sin ejercicios para hoy - DESCANSO');
          setTodayRoutine('DESCANSO');
          setTodayExercises([]);
        }
      } // Fin del else (modo GYM MODULE)

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

  // Guardar nueva hora desde el modal
  const handleSaveTime = async (newTime: string) => {
    isInternalUpdate.current = true;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    if (timePickerMode === 'meal' && timePickerMealId) {
      // Update meal time
      const updated = meals
        .map((m) => (m.id === timePickerMealId ? { ...m, time: newTime } : m))
        .sort((a, b) => a.time.localeCompare(b.time));

      setMeals(updated);
      await supabase.from('meals').update({ time: newTime }).eq('id', timePickerMealId);
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

          // Recalcular macros diarios sumando las comidas restantes (bottom-up)
          // NO tocamos cantidades de otras comidas
          await recalculateDailyMacrosFromMeals();
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

  // ============================================================================
  // SYNC: Actualizar cached_daily_macros en Supabase para sincronización
  // ============================================================================
  const updateCachedDailyMacros = async (mealCount: number) => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      // Obtener perfil completo
      const { profile, bodyMeasurements } = await getFullProfileWithMeasurements(user.id);
      if (!profile) return;

      // Calcular macros diarios con IA
      const dailyMacros = await calculateUserDailyMacros({
        weight: profile.weight || '75 KG',
        height: profile.height || '1.75 M',
        goal: profile.goal || 'MANTENER',
        mealCount: mealCount,
        age: profile.age || undefined,
        sex: profile.sex || undefined,
        bodyFatPercentage: profile.body_fat_percentage || undefined,
        muscleMass: profile.muscle_mass || undefined,
        activityLevel: profile.activity_level || 'MODERADO',
        trainingExperience: profile.training_experience || undefined,
        metabolicRate: profile.metabolic_rate || undefined,
        trainingDaysPerWeek: profile.training_days_per_week || undefined,
        bodyMeasurements: bodyMeasurements,
      });

      // Guardar en Supabase para sincronización entre dispositivos
      await supabase
        .from('user_profiles')
        .update({
          cached_daily_macros: dailyMacros,
          cached_macros_meal_count: mealCount,
          cached_macros_updated_at: new Date().toISOString(),
        })
        .eq('user_id', user.id);

      console.log('💾 SYNC: Macros guardados en Supabase para sincronización');

      // Actualizar estado local
      setMealMacros(dailyMacros.perMeal || null);
    } catch (error) {
      console.error('Error updating cached daily macros:', error);
    }
  };

  // ============================================================================
  // RECALCULAR MACROS DIARIOS DESDE COMIDAS REALES (bottom-up)
  // Suma la nutritionInfo de todos los ingredientes de todas las comidas.
  // NO modifica cantidades ni porciones — solo calcula los totales reales.
  // ============================================================================
  const recalculateDailyMacrosFromMeals = async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      // Obtener TODAS las comidas del usuario con ingredientes JSONB
      const { data: allMeals } = await supabase
        .from('meals')
        .select('id, ingredients, selected_option, meal_options(id, ingredients, is_selected)')
        .eq('user_id', user.id);

      if (!allMeals || allMeals.length === 0) {
        // Sin comidas: limpiar macros
        setDailyMacroTotals(null);
        setMealMacros(null);
        await supabase
          .from('user_profiles')
          .update({
            cached_daily_macros: null,
            cached_macros_meal_count: 0,
            cached_macros_updated_at: new Date().toISOString(),
          })
          .eq('user_id', user.id);
        console.log('🗑️ SYNC: Macros limpiados (sin comidas)');
        return;
      }

      // Sumar nutritionInfo de la opción seleccionada de cada comida
      let totalCal = 0,
        totalPro = 0,
        totalCarbs = 0,
        totalFat = 0;
      let hasAnyNutrition = false;

      for (const meal of allMeals) {
        // Determinar los ingredientes de la opción seleccionada
        let activeIngredients: any[] = meal.ingredients || [];

        // Si hay opciones (meal_options), usar la seleccionada
        const options = (meal as any).meal_options;
        if (options && options.length > 0) {
          const selectedOpt = options.find((o: any) => o.is_selected);
          if (selectedOpt && selectedOpt.ingredients) {
            activeIngredients = selectedOpt.ingredients;
          }
        }

        // Sumar nutritionInfo de cada ingrediente
        for (const ing of activeIngredients) {
          if (ing.nutritionInfo) {
            hasAnyNutrition = true;
            totalCal += ing.nutritionInfo.calories || 0;
            totalPro += ing.nutritionInfo.protein || 0;
            totalCarbs += ing.nutritionInfo.carbs || 0;
            totalFat += ing.nutritionInfo.fat || 0;
          }
        }
      }

      if (!hasAnyNutrition) {
        console.log('⚠️ Ninguna comida tiene nutritionInfo, no se puede recalcular');
        return;
      }

      const realDailyTotals = {
        calories: Math.round(totalCal),
        protein: Math.round(totalPro),
        carbs: Math.round(totalCarbs),
        fat: Math.round(totalFat),
      };

      const mealCount = allMeals.length;
      const perMealAvg = {
        calories: Math.round(totalCal / mealCount),
        protein: Math.round(totalPro / mealCount),
        carbs: Math.round(totalCarbs / mealCount),
        fat: Math.round(totalFat / mealCount),
      };

      // Actualizar estado local
      setDailyMacroTotals(realDailyTotals);
      setMealMacros(perMealAvg);

      // Guardar en Supabase para sincronización
      const cachedMacros = {
        totalCalories: realDailyTotals.calories,
        totalProtein: realDailyTotals.protein,
        totalCarbs: realDailyTotals.carbs,
        totalFat: realDailyTotals.fat,
        perMeal: perMealAvg,
      };

      await supabase
        .from('user_profiles')
        .update({
          cached_daily_macros: cachedMacros,
          cached_macros_meal_count: mealCount,
          cached_macros_updated_at: new Date().toISOString(),
        })
        .eq('user_id', user.id);

      console.log('📊 SYNC: Macros diarios recalculados desde comidas reales:', realDailyTotals);
    } catch (error) {
      console.error('❌ Error recalculando macros desde comidas:', error);
    }
  };

  // Recalcular macros de todas las comidas cuando cambia la cantidad
  const recalculateAllMealsAfterChange = async (newMealCount: number, mealIds?: string[]) => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      // Obtener perfil del usuario
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('weight, height, goal')
        .eq('user_id', user.id)
        .single();

      if (!profile) return;

      // Usar mealIds proporcionados o obtenerlos de la base de datos
      let targetMealIds = mealIds;
      if (!targetMealIds) {
        const { data: currentMeals } = await supabase
          .from('meals')
          .select('id')
          .eq('user_id', user.id);
        targetMealIds = currentMeals?.map((m) => m.id) || [];
      }

      if (targetMealIds.length === 0) return;

      // Obtener todas las comidas con sus ingredientes (JSONB)
      const { data: allMeals } = await supabase
        .from('meals')
        .select('id, ingredients')
        .in('id', targetMealIds);

      if (!allMeals || allMeals.length === 0) return;

      // Preparar datos para recálculo - usar ingredientes JSONB de cada comida
      const mealsToRecalculate = allMeals
        .filter((m) => m.ingredients && m.ingredients.length > 0)
        .map((m) => ({
          optionId: m.id, // Usamos el ID de la comida como optionId
          ingredients: (m.ingredients as any[]).map((ing) => ({
            name: ing.name,
          })),
        }));

      if (mealsToRecalculate.length === 0) {
        console.log('⚠️ No hay comidas con ingredientes para recalcular');
        return;
      }

      console.log(
        `🔄 Recalculando ${mealsToRecalculate.length} comidas para ${newMealCount} comidas/día...`
      );

      // Recalcular con IA
      const recalculated = await recalculateAllMealsForNewCount(mealsToRecalculate, {
        weight: profile.weight || '75 KG',
        height: profile.height || '1.75 M',
        goal: profile.goal || 'MANTENER',
        mealCount: newMealCount,
      });

      // Actualizar cada comida en la base de datos (JSONB) - preservar nutritionInfo
      for (const option of recalculated) {
        const ingredientsJsonb = option.ingredients.map((ing: any) => ({
          name: ing.name,
          quantity: ing.quantity,
          portion: ing.portion || '',
          ...(ing.nutritionInfo ? { nutritionInfo: ing.nutritionInfo } : {}),
        }));

        await supabase
          .from('meals')
          .update({ ingredients: ingredientsJsonb })
          .eq('id', option.optionId);
      }

      console.log('✅ Recálculo completado, actualizando cached_daily_macros...');

      // Actualizar cached_daily_macros en user_profiles
      await updateCachedDailyMacros(newMealCount);

      // Refrescar datos para actualizar la UI
      await fetchData();

      console.log('✅ UI y cache actualizados');
    } catch (error) {
      console.error('❌ Error recalculando comidas:', error);
    }
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
    _editModes?: string[]
  ) => {
    isInternalUpdate.current = true;
    const isAlternative = !optionId.startsWith('main-');

    try {
      if (isAlternative) {
        // ═══════════════════════════════════════════════════════════════
        // FLUJO ALTERNATIVA: Recalcular cantidades según macros de la comida principal
        // ═══════════════════════════════════════════════════════════════

        // Obtener macros actuales de la comida principal
        const meal = meals.find((m) => m.id === mealId);
        const mainMacros = meal?.actualMacros || meal?.targetMacros;

        if (!mainMacros || mainMacros.calories <= 0) {
          Alert.alert('Error', 'No se encontraron macros de la comida principal para recalcular');
          return;
        }

        console.log('🔄 Guardando alternativa con recálculo de macros:', mainMacros);

        // Recalcular cantidades de los ingredientes para que coincidan con los macros de la principal
        const recalced = await calculateMealWithUserMacros(
          ingredients.map((ing, idx) => ({
            id: ing.id || `alt-${idx}`,
            name: ing.name,
            quantity: ing.quantity || '',
            portion: ing.portion || '',
          })),
          mainMacros
        );

        const ingredientsToSave = recalced.map((ing) => ({
          name: ing.name,
          quantity: ing.quantity || '~100g',
          portion: ing.portion || '',
          ...(ing.nutritionInfo ? { nutritionInfo: ing.nutritionInfo } : {}),
        }));

        const { error } = await supabase
          .from('meal_options')
          .update({ ingredients: ingredientsToSave })
          .eq('id', optionId);

        if (error) throw error;

        console.log('✅ Alternativa guardada con cantidades recalculadas');
      } else {
        // ═══════════════════════════════════════════════════════════════
        // FLUJO COMIDA PRINCIPAL: Sincronizar, calcular y guardar
        // ═══════════════════════════════════════════════════════════════

        // PASO 1: Sincronizar gramos ↔ porciones
        let synced = ingredients;
        try {
          const converted = await convertGramsPortions(
            ingredients.map((ing) => ({
              name: ing.name,
              quantity: ing.quantity?.trim() || undefined,
              portion: ing.portion?.trim() || undefined,
            }))
          );
          synced = converted.map((c, i) => ({
            ...ingredients[i],
            name: c.name,
            quantity: c.quantity || ingredients[i].quantity || '~100g',
            portion: c.portion || ingredients[i].portion || '',
          }));
        } catch (convError) {
          console.warn('Error sincronizando gramos/porciones:', convError);
        }

        // PASO 2: Calcular nutritionInfo desde las cantidades sincronizadas
        let finalIngredients = synced;
        try {
          const ingredientsWithIds = synced.map((ing, i) => ({
            id: ing.id || `edit-${i}`,
            name: ing.name,
            quantity: ing.quantity || '~100g',
            portion: ing.portion || '',
          }));
          const calculated = await calculateNutritionFromQuantities(ingredientsWithIds);
          finalIngredients = calculated.map((cal, i) => ({
            ...synced[i],
            quantity: cal.quantity || synced[i].quantity,
            portion: cal.portion || synced[i].portion || '',
            nutritionInfo: cal.nutritionInfo || synced[i].nutritionInfo,
          }));
        } catch (calcError) {
          console.warn('Error calculando nutrición:', calcError);
        }

        // PASO 3: Guardar ingredientes
        const ingredientsToSave = finalIngredients.map((ing) => ({
          name: ing.name,
          quantity: ing.quantity || '~100g',
          portion: ing.portion || '',
          ...(ing.nutritionInfo ? { nutritionInfo: ing.nutritionInfo } : {}),
        }));

        const { error } = await supabase
          .from('meals')
          .update({ ingredients: ingredientsToSave })
          .eq('id', mealId);

        if (error) throw error;

        // PASO 4: Recalcular alternativas (meal_options) con los nuevos macros
        try {
          const newMealMacros = finalIngredients.reduce(
            (acc, ing) => {
              if (ing.nutritionInfo) {
                acc.calories += ing.nutritionInfo.calories || 0;
                acc.protein += ing.nutritionInfo.protein || 0;
                acc.carbs += ing.nutritionInfo.carbs || 0;
                acc.fat += ing.nutritionInfo.fat || 0;
              }
              return acc;
            },
            { calories: 0, protein: 0, carbs: 0, fat: 0 }
          );

          if (newMealMacros.calories > 0) {
            const { data: options } = await supabase
              .from('meal_options')
              .select('id, ingredients')
              .eq('meal_id', mealId);

            if (options && options.length > 0) {
              console.log(
                `🔄 Recalculando ${options.length} alternativas con nuevos macros:`,
                newMealMacros
              );
              for (const opt of options) {
                const optIngredients = (opt.ingredients as any[]) || [];
                if (optIngredients.length === 0) continue;

                try {
                  const recalced = await calculateMealWithUserMacros(
                    optIngredients.map((ing: any, idx: number) => ({
                      id: `opt-${idx}`,
                      name: ing.name,
                      quantity: ing.quantity || '',
                      portion: ing.portion || '',
                    })),
                    newMealMacros
                  );

                  const optIngredientsToSave = recalced.map((ing) => ({
                    name: ing.name,
                    quantity: ing.quantity,
                    portion: ing.portion || '',
                    ...(ing.nutritionInfo ? { nutritionInfo: ing.nutritionInfo } : {}),
                  }));

                  await supabase
                    .from('meal_options')
                    .update({ ingredients: optIngredientsToSave })
                    .eq('id', opt.id);
                } catch (optError) {
                  console.warn(`Error recalculando alternativa ${opt.id}:`, optError);
                }
              }
            }
          }
        } catch (optionsError) {
          console.warn('Error recalculando alternativas:', optionsError);
        }
      }

      // Recalcular macros diarios sumando TODAS las comidas reales (bottom-up)
      await recalculateDailyMacrosFromMeals();

      // Refresh data para actualizar la UI
      await fetchData();
    } catch (error) {
      console.error('Error saving ingredients:', error);
      Alert.alert('Error', 'No se pudieron guardar los cambios');
      throw error;
    }
  };

  // Calcular macros con IA usando targetMacros (preserva nutritionInfo)
  const handleCalculateMacros = async (
    ingredients: Ingredient[],
    targetMacros?: { calories: number; protein: number; carbs: number; fat: number }
  ): Promise<Ingredient[]> => {
    try {
      // Si hay targetMacros, usar la función precisa
      if (targetMacros) {
        const calculated = await calculateMealWithUserMacros(ingredients, targetMacros);
        return calculated.map((ing) => ({
          id: ing.id,
          name: ing.name,
          quantity: ing.quantity,
          portion: ing.portion,
          nutritionInfo: ing.nutritionInfo,
        }));
      }

      // Fallback a la función genérica
      const calculated = await calculateMacrosWithAI(ingredients);
      return calculated.map((ing) => ({
        id: ing.id,
        name: ing.name,
        quantity: ing.quantity,
        portion: ing.portion,
        nutritionInfo: ing.nutritionInfo,
      }));
    } catch (error) {
      console.error('Error calculating macros:', error);
      throw error;
    }
  };

  const handleAddMeal = async (
    ingredients: { name: string; quantity: string; portion: string }[],
    time: string
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

      // Formatear hora correctamente (acepta "7", "07", "7:30", "07:30")
      let formattedTime = time.trim();
      if (!formattedTime.includes(':')) {
        formattedTime = formattedTime.padStart(2, '0') + ':00';
      } else {
        const [hours, minutes] = formattedTime.split(':');
        formattedTime = hours.padStart(2, '0') + ':' + (minutes || '00').padStart(2, '0');
      }

      // Calcular nutritionInfo SIN cambiar cantidades del usuario
      let finalIngredients: {
        name: string;
        quantity: string;
        portion: string;
        nutritionInfo?: {
          calories: number;
          protein: number;
          carbs: number;
          fat: number;
          suggestedGrams?: number;
        };
      }[] = ingredients;

      setIsAdjustingMacros(true);
      try {
        const ingredientsWithIds = ingredients.map((ing, i) => ({
          id: `temp-${i}`,
          name: ing.name,
          quantity: ing.quantity || '',
          portion: ing.portion || '',
        }));

        const calculated = await calculateNutritionFromQuantities(ingredientsWithIds);
        finalIngredients = calculated.map((ing) => ({
          name: ing.name,
          quantity: ing.quantity, // Preservar cantidad original del usuario
          portion: ing.portion || '',
          nutritionInfo: ing.nutritionInfo,
        }));
      } catch (error) {
        console.warn('Error calculando nutrición, guardando sin nutritionInfo:', error);
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
        ingredients: finalIngredients.map((ing) => ({
          name: ing.name,
          quantity: ing.quantity || '~100 gr',
          portion: ing.portion || '',
          ...(ing.nutritionInfo ? { nutritionInfo: ing.nutritionInfo } : {}),
        })),
        position: newPosition,
        is_completed: false,
      });

      if (mealError) {
        console.error('Error creating meal:', mealError);
        throw mealError;
      }

      // Recalcular macros diarios sumando TODAS las comidas reales (bottom-up)
      // NO tocamos cantidades de otras comidas
      await recalculateDailyMacrosFromMeals();
      await fetchData();
    } catch (error) {
      console.error('Error adding meal:', error);
      Alert.alert('Error', 'No se pudo agregar la comida');
    } finally {
      setIsAdjustingMacros(false);
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

      console.warn('📦 STACK: Insertando compuesto:', item.name, 'Hora:', parsedTime);

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

    // PRIORIDAD: actualMacros (macros reales calculados) > targetMacros > mealMacros
    const macros = meal.actualMacros || meal.targetMacros || mealMacros;

    setAddOptionMealId(mealId);
    setAddOptionMealName(displayName);
    setMealMacros(macros || null);
    setShowAddOption(true);
  };

  // Guardar nueva opción/platillo (alternativa) - CON cálculo de macros
  const handleSaveOption = async (
    mealId: string,
    optionName: string,
    ingredients: Ingredient[]
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

      // Preparar ingredientes como JSONB (preservando nutritionInfo si existe)
      const ingredientsJsonb = ingredients.map((ing) => ({
        name: ing.name,
        quantity: ing.quantity || '~100g',
        portion: ing.portion || '',
        ...(ing.nutritionInfo ? { nutritionInfo: ing.nutritionInfo } : {}),
      }));

      // Crear la opción en meal_options con ingredients JSONB
      const { error: optionError } = await supabase.from('meal_options').insert({
        meal_id: mealId,
        user_id: user.id,
        name: optionName,
        ingredients: ingredientsJsonb,
        position: newOptionIndex,
        is_selected: false,
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

  const handleMoveWorkout = async (direction: 'up' | 'down') => {
    isInternalUpdate.current = true;
    const newIndex = direction === 'up' ? Math.max(0, workoutPosIndex - 1) : workoutPosIndex + 1;
    await saveWorkoutPosition(newIndex);

    // Auto-scroll al bloque de entreno después de moverlo
    setTimeout(() => {
      const workoutLayout = itemLayouts.current[newIndex];
      if (workoutLayout && workoutLayout.y > 0 && scrollViewRef.current) {
        scrollViewRef.current.scrollTo({
          y: Math.max(0, workoutLayout.y - 100),
          animated: true,
        });
      }
    }, 300);
  };

  // Handler for drag & drop
  const handleDragEnd = async (newIndex: number) => {
    isInternalUpdate.current = true;
    setDragTargetIndex(null);
    setIsDraggingWorkout(false);
    await saveWorkoutPosition(newIndex);

    // Auto-scroll al bloque de entreno después de moverlo
    // Esperar a que los layouts se actualicen
    setTimeout(() => {
      const workoutLayout = itemLayouts.current[newIndex];
      if (workoutLayout && workoutLayout.y > 0 && scrollViewRef.current) {
        scrollViewRef.current.scrollTo({
          y: Math.max(0, workoutLayout.y - 100), // 100px de margen arriba
          animated: true,
        });
      }
    }, 300);
  };

  // Shared function to save position
  const saveWorkoutPosition = async (newIndex: number) => {
    setWorkoutPosIndex(newIndex);
    console.warn('🏋️ PLAN: Nueva posición:', newIndex);

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      // Primero intentar actualizar
      const { data: existing } = await supabase
        .from('workout_block_position')
        .select('id')
        .eq('user_id', user.id)
        .limit(1)
        .single();

      if (existing) {
        // Actualizar el existente
        const { error } = await supabase
          .from('workout_block_position')
          .update({ position: newIndex, updated_at: new Date().toISOString() })
          .eq('id', existing.id);
        console.warn(
          '🏋️ PLAN: Actualizando posición:',
          newIndex,
          error ? `Error: ${error.message}` : 'OK'
        );
      } else {
        // Insertar nuevo
        const { error } = await supabase
          .from('workout_block_position')
          .insert({ user_id: user.id, position: newIndex });
        console.warn(
          '🏋️ PLAN: Insertando posición:',
          newIndex,
          error ? `Error: ${error.message}` : 'OK'
        );
      }

      // Calcular y guardar hora estimada del entrenamiento en user_profiles
      // Esto permite que Hank y otros módulos sepan cuándo entrena el usuario
      const mealTimes = meals.map((m) => ({ time: m.time, name: m.name }));
      const estimate = calculateWorkoutTime(newIndex, mealTimes);

      await supabase
        .from('user_profiles')
        .update({
          estimated_workout_time: estimate.estimatedTime,
          is_fasted_training: estimate.isFasted,
          workout_time_description: estimate.description,
        })
        .eq('user_id', user.id);

      console.log(
        `🏋️ PLAN: Hora estimada guardada: ${estimate.estimatedTime} - ${estimate.description}`
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

    // Create timeline with meals and stacks
    const timeline: TimelineItem[] = [
      ...meals.map((m) => ({ type: 'meal' as const, data: m, time: m.time })),
      ...groupedStacks.map((s) => ({ type: 'stack' as const, data: s, time: s.time })),
    ].sort((a, b) => (a.time || '').localeCompare(b.time || ''));

    // Insert workout block at position
    const preStack = stackItems.filter(
      (i) => i.isPreWorkout && (i.daysOfWeek?.includes(today) ?? true)
    );
    const postStack = stackItems.filter(
      (i) => i.isPostWorkout && (i.daysOfWeek?.includes(today) ?? true)
    );

    const workoutBlock: WorkoutBlockData = {
      id: 'workout-block',
      routineName: todayRoutine,
      preStack,
      postStack,
      exercises: todayExercises,
      isExternalMode: isExternalMode, // Indica si es modo personalizado
      // Workout time estimation
      estimatedTime: workoutTimeEstimate.estimatedTime,
      isFasted: workoutTimeEstimate.isFasted,
      timeDescription: workoutTimeEstimate.description,
    };

    const safeIndex = Math.min(Math.max(0, workoutPosIndex), timeline.length);
    const finalTimeline = [
      ...timeline.slice(0, safeIndex),
      { type: 'workout' as const, data: workoutBlock },
      ...timeline.slice(safeIndex),
    ];

    return finalTimeline;
  };

  const timeline = buildTimeline();

  // ============================================================================
  // MACROS REALES: Sumar actualMacros de todas las comidas
  // ============================================================================
  const computedDailyMacros = useMemo(() => {
    let cal = 0,
      pro = 0,
      car = 0,
      fat = 0;
    let hasAny = false;

    for (const meal of meals) {
      if (meal.actualMacros) {
        hasAny = true;
        cal += meal.actualMacros.calories;
        pro += meal.actualMacros.protein;
        car += meal.actualMacros.carbs;
        fat += meal.actualMacros.fat;
      }
    }

    return hasAny
      ? {
          calories: Math.round(cal),
          protein: Math.round(pro),
          carbs: Math.round(car),
          fat: Math.round(fat),
        }
      : null;
  }, [meals]);

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
          borderBottomColor: 'rgba(220, 38, 38, 0.3)',
          shadowColor: '#DC2626',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.15,
          shadowRadius: 12,
        }}
      >
        {/* Línea decorativa superior - Savage Red */}
        <View
          className="absolute top-0 left-0 right-0 h-[2px]"
          style={{
            backgroundColor: '#DC2626',
            shadowColor: '#DC2626',
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
                  backgroundColor: '#DC2626',
                  shadowColor: '#DC2626',
                  shadowOffset: { width: 0, height: 0 },
                  shadowOpacity: 1,
                  shadowRadius: 4,
                }}
              />
              <Text
                className="text-white text-2xl font-black tracking-tight uppercase"
                style={{
                  textShadowColor: 'rgba(220, 38, 38, 0.5)',
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
            {/* Shopping List Button */}
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setShowShoppingList(true);
              }}
              className="items-center px-3 py-2.5 rounded-xl active:scale-95"
              style={{
                backgroundColor: 'rgba(34, 197, 94, 0.08)',
                borderWidth: 1.5,
                borderColor: 'rgba(34, 197, 94, 0.4)',
                shadowColor: '#22C55E',
                shadowOffset: { width: 0, height: 0 },
                shadowOpacity: 0.3,
                shadowRadius: 12,
              }}
            >
              <View
                className="w-8 h-8 rounded-full items-center justify-center"
                style={{ backgroundColor: 'rgba(34, 197, 94, 0.2)' }}
              >
                <ShoppingCart size={14} color="#22C55E" />
              </View>
              <Text className="text-green-400 text-[9px] font-bold tracking-widest mt-1">
                COMPRAS
              </Text>
            </Pressable>

            {/* Stack Button Premium */}
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
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

        {/* Daily Stats Badges - Macros REALES si disponibles, target como fallback */}
        <View className="flex-row flex-wrap gap-3 mt-3">
          <View className="flex-row items-center gap-1">
            <View className="w-1.5 h-1.5 rounded-full bg-savage-red" />
            <Text className="text-zinc-500 text-[10px] font-mono">{meals.length} COMIDAS</Text>
          </View>
          {(computedDailyMacros || mealMacros) && (
            <>
              <View className="flex-row items-center gap-1">
                <View className="w-1.5 h-1.5 rounded-full bg-orange-500" />
                <Text className="text-zinc-500 text-[10px] font-mono">
                  {computedDailyMacros
                    ? computedDailyMacros.calories
                    : mealMacros!.calories * meals.length}{' '}
                  KCAL
                </Text>
              </View>
              <View className="flex-row items-center gap-1">
                <View className="w-1.5 h-1.5 rounded-full bg-purple-500" />
                <Text className="text-zinc-500 text-[10px] font-mono">
                  {computedDailyMacros
                    ? computedDailyMacros.protein
                    : mealMacros!.protein * meals.length}
                  P
                </Text>
              </View>
              <View className="flex-row items-center gap-1">
                <View className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                <Text className="text-zinc-500 text-[10px] font-mono">
                  {computedDailyMacros
                    ? computedDailyMacros.carbs
                    : mealMacros!.carbs * meals.length}
                  C
                </Text>
              </View>
              <View className="flex-row items-center gap-1">
                <View className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                <Text className="text-zinc-500 text-[10px] font-mono">
                  {computedDailyMacros ? computedDailyMacros.fat : mealMacros!.fat * meals.length}G
                </Text>
              </View>
            </>
          )}
        </View>
      </View>

      {/* Timeline */}
      <ScrollView
        ref={scrollViewRef}
        className="flex-1 px-5"
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#DC2626" />
        }
      >
        <View className="pt-6 gap-2 relative">
          {/* Timeline Line - Premium Savage Line - Solo dentro del contenedor de items */}
          {timeline.length > 0 && (
            <View
              className="absolute left-[18px] top-0 bottom-0 w-[2.5px] rounded-full"
              style={{
                backgroundColor: 'rgba(220, 38, 38, 0.25)',
                shadowColor: '#DC2626',
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
                  backgroundColor: 'rgba(220, 38, 38, 0.12)',
                  borderWidth: 1,
                  borderColor: 'rgba(220, 38, 38, 0.25)',
                }}
              >
                <Plus size={32} color="#DC2626" />
              </View>
              <Text className="text-white font-bold text-lg mb-1">Sin comidas configuradas</Text>
              <Text className="text-zinc-400 text-sm text-center font-mono max-w-[240px]">
                Agrega tu primera comida para comenzar tu plan metabólico
              </Text>
            </View>
          ) : (
            timeline.map((item, timelineIndex) => {
              // Altura del bloque de entrenamiento comprimido (para crear espacio)
              const WORKOUT_COMPRESSED_HEIGHT = 85;

              // Calcular offset de animación basado en la posición del drag
              const getAnimatedOffset = () => {
                if (!isDraggingWorkout || dragTargetIndex === null) return 0;
                if (item.type === 'workout') return 0;

                const workoutCurrentPos = workoutPosIndex;
                const workoutTargetPos = dragTargetIndex;

                // Si el bloque se mueve hacia abajo
                if (workoutTargetPos > workoutCurrentPos) {
                  // Los items entre current+1 y target deben subir para abrir espacio abajo
                  if (timelineIndex > workoutCurrentPos && timelineIndex <= workoutTargetPos) {
                    return -WORKOUT_COMPRESSED_HEIGHT;
                  }
                }
                // Si el bloque se mueve hacia arriba
                else if (workoutTargetPos < workoutCurrentPos) {
                  // Los items entre target y current-1 deben bajar para abrir espacio arriba
                  if (timelineIndex >= workoutTargetPos && timelineIndex < workoutCurrentPos) {
                    return WORKOUT_COMPRESSED_HEIGHT;
                  }
                }
                return 0;
              };

              if (item.type === 'meal') {
                const meal = item.data as Meal;
                const mealIndex = meals.findIndex((m) => m.id === meal.id);
                const offset = getAnimatedOffset();
                // Usar nombre de DB si existe, sino lógica inteligente
                const displayName = meal.name || getSmartMealName(mealIndex, meals.length);
                return (
                  <View
                    key={meal.id}
                    onLayout={(e) => handleItemLayout(timelineIndex, e.nativeEvent.layout.y)}
                  >
                    <AnimatedTimelineItem offset={offset}>
                      <MealCard
                        meal={meal}
                        mealName={displayName}
                        onSwap={handleSwap}
                        onTimeChange={handleTimeChange}
                        onDelete={handleDeleteMeal}
                        onDeleteOption={handleDeleteOption}
                        onEdit={handleEditMeal}
                        onAddOption={handleAddOption}
                        isCompressed={isDraggingWorkout}
                      />
                    </AnimatedTimelineItem>
                  </View>
                );
              }

              if (item.type === 'stack') {
                const stack = item.data as Stack;
                const offset = getAnimatedOffset();
                return (
                  <View
                    key={stack.id}
                    onLayout={(e) => handleItemLayout(timelineIndex, e.nativeEvent.layout.y)}
                  >
                    <AnimatedTimelineItem offset={offset}>
                      <StackCard
                        stack={stack}
                        onTimeChange={handleStackTimeChange}
                        onItemDelete={handleRemoveStackItem}
                        isCompressed={isDraggingWorkout}
                      />
                    </AnimatedTimelineItem>
                  </View>
                );
              }

              if (item.type === 'workout') {
                const workout = item.data as WorkoutBlockData;
                return (
                  <View
                    key="workout-block"
                    onLayout={(e) => handleItemLayout(timelineIndex, e.nativeEvent.layout.y)}
                  >
                    <DraggableWorkoutBlock
                      data={workout}
                      currentIndex={workoutPosIndex}
                      totalItems={timeline.length}
                      onMoveUp={() => handleMoveWorkout('up')}
                      onMoveDown={() => handleMoveWorkout('down')}
                      onDragEnd={handleDragEnd}
                      onDragStart={() => {
                        isInternalUpdate.current = true;
                        setIsDraggingWorkout(true);
                        setDragTargetIndex(workoutPosIndex);
                      }}
                      onDragCancel={() => {
                        isInternalUpdate.current = true;
                        setIsDraggingWorkout(false);
                        setDragTargetIndex(null);
                      }}
                      onPositionChange={(targetIndex) => {
                        isInternalUpdate.current = true;
                        setDragTargetIndex(targetIndex);
                      }}
                      onPressRoutine={() => router.push('/(tabs)/gym')}
                      itemHeight={isDraggingWorkout ? 85 : 160}
                      scrollRef={scrollViewRef}
                    />
                  </View>
                );
              }

              return null;
            })
          )}
        </View>

        {/* Indicador de ajuste de macros con IA */}
        {isAdjustingMacros && (
          <View className="bg-zinc-900/80 border border-red-500/40 rounded-xl p-4 mt-4 mx-1">
            <View className="flex-row items-center gap-3">
              <View className="w-8 h-8 bg-red-600 rounded-full items-center justify-center">
                <Sparkles size={16} color="#fff" />
              </View>
              <View className="flex-1">
                <Text className="text-white font-bold text-sm">Personalizando tu comida...</Text>
                <Text className="text-zinc-400 text-xs mt-0.5">
                  Ajustando porciones según tus macros diarios
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* Add Meal Button - PREMIUM SAVAGE */}
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            const newMealCount = meals.length + 1;

            // Calcular macros objetivo para la nueva comida
            if (mealMacros && meals.length > 0) {
              // Si ya hay comidas, ajustar proporcionalmente
              const currentMealCount = meals.length;
              const adjustedMacros = {
                calories: Math.round((mealMacros.calories * currentMealCount) / newMealCount),
                protein: Math.round((mealMacros.protein * currentMealCount) / newMealCount),
                carbs: Math.round((mealMacros.carbs * currentMealCount) / newMealCount),
                fat: Math.round((mealMacros.fat * currentMealCount) / newMealCount),
              };
              setNewMealMacros(adjustedMacros);
            } else if (dailyMacroTotals) {
              // Si es la primera comida, dividir los totales diarios
              const newMealMacrosCalc = {
                calories: Math.round(dailyMacroTotals.calories / newMealCount),
                protein: Math.round(dailyMacroTotals.protein / newMealCount),
                carbs: Math.round(dailyMacroTotals.carbs / newMealCount),
                fat: Math.round(dailyMacroTotals.fat / newMealCount),
              };
              setNewMealMacros(newMealMacrosCalc);
            }
            setShowAddMeal(true);
          }}
          className="w-full py-5 mt-6 mb-28 rounded-2xl active:scale-[0.98]"
          style={{
            backgroundColor: 'rgba(39, 39, 42, 0.4)',
            borderWidth: 1.5,
            borderStyle: 'dashed',
            borderColor: 'rgba(220, 38, 38, 0.4)',
            shadowColor: '#DC2626',
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: 0.15,
            shadowRadius: 24,
          }}
        >
          <View className="items-center">
            <View
              className="w-12 h-12 rounded-xl items-center justify-center mb-2"
              style={{ backgroundColor: 'rgba(220, 38, 38, 0.15)' }}
            >
              <Plus size={24} color="#DC2626" />
            </View>
            <Text className="text-savage-red font-bold tracking-widest text-sm">
              AGREGAR COMIDA
            </Text>
            <Text className="text-zinc-500 text-[10px] font-mono mt-1">
              Nueva comida en tu plan
            </Text>
          </View>
        </Pressable>
      </ScrollView>

      {/* Modals */}
      <AddMealModal
        visible={showAddMeal}
        targetMacros={newMealMacros || undefined}
        onClose={() => {
          setShowAddMeal(false);
          setNewMealMacros(null);
        }}
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
        onCalculateMacros={handleCalculateMacros}
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
        onClose={() => setShowStackManager(false)}
        items={stackItems}
        onAddItem={handleAddStackItem}
        onRemoveItem={handleRemoveStackItem}
        onUpdateItem={handleUpdateStackItem}
      />

      <AddOptionModal
        visible={showAddOption}
        mealId={addOptionMealId || ''}
        mealName={addOptionMealName}
        targetMacros={mealMacros || undefined}
        onClose={() => {
          setShowAddOption(false);
          setAddOptionMealId(null);
          setAddOptionMealName('');
          setMealMacros(null);
        }}
        onSave={handleSaveOption}
        onCalculateMacros={handleCalculateMacros}
      />

      <ShoppingListModal
        visible={showShoppingList}
        onClose={() => setShowShoppingList(false)}
        meals={meals}
      />

      <PlanNotesModal visible={showPlanNotes} onClose={() => setShowPlanNotes(false)} />
    </View>
  );
}
