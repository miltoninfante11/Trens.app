import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  RefreshControl,
  Modal,
  Image,
  ActivityIndicator,
} from 'react-native';
import { Alert } from '../../../lib/alert';
import {
  Search,
  Plus,
  Trash2,
  X,
  Check,
  ChevronRight,
  Calendar,
  Target,
  Users,
  Copy,
  Dumbbell,
  Clock,
  Minus,
} from 'lucide-react-native';
import { supabase } from '../../../lib/supabase';

// ============================================================================
// TYPES
// ============================================================================
interface TrainingTemplate {
  id: string;
  slug: string;
  name: string;
  description?: string;
  target_levels: string[];
  target_goals: string[];
  frequency: number;
  equipment: string[];
  days: TemplateDay[];
  is_active: boolean;
  sort_order: number;
  coach_notes?: string;
}

interface TemplateDay {
  dayIndex: number;
  name: string;
  focus?: string;
  notes?: string;
  exercises: TemplateDayExercise[];
  cardio?: TemplateCardio[];
  groups?: TemplateExerciseGroup[];
}

// Bloque de cardio dentro del día
interface TemplateCardio {
  id: string;
  activity: string; // "Caminadora", "Bicicleta"...
  cardio_type: 'LISS' | 'HIIT' | 'STEADY' | 'INTERVAL';
  duration_minutes: number;
  intensity?: string;
  is_pre_workout?: boolean;
  is_post_workout?: boolean;
  is_fasted?: boolean;
  notes?: string;
}

// Grupo de ejercicios (super-serie / circuito / drop-set)
interface TemplateExerciseGroup {
  id: string;
  type: 'SUPERSERIES' | 'CIRCUITO' | 'DROP_SET' | 'TRISERIES';
  exercise_ids: string[]; // exercise_id (no config_id porque es plantilla)
  rest_after?: number; // segundos
  rounds?: number;
  notes?: string;
}

// Tipo de serie para configuración detallada
type SeriesType = 'CALENTAMIENTO' | 'APROXIMACION' | 'EFECTIVA' | 'FALLO';

interface TemplateSeriesConfig {
  id: string;
  type: SeriesType;
  reps: number;
  note: string;
  weight?: string; // Peso sugerido (ej. "60kg", "BW", "-")
  tempo?: string; // Tempo (ej. "3-1-1-0")
  rpe?: string; // RPE 1-10 (ej. "8", "9.5")
}

interface TemplateDayExercise {
  exercise_id: string; // UUID del ejercicio en tabla exercises
  name: string;
  thumbnail_url?: string;
  rest: string;
  series: TemplateSeriesConfig[]; // Series detalladas
  notes?: string; // Instrucciones del coach al alumno
}

// Ejercicio de la DB
interface DBExercise {
  id: string;
  name: string;
  muscle_group: string;
  secondary_muscles: string[];
  thumbnail_url?: string;
  description?: string;
}

// ============================================================================
// COLORS
// ============================================================================
const COLORS = {
  black: '#000000',
  blue: '#3B82F6',
  red: '#DC2626',
  green: '#22C55E',
  purple: '#8B5CF6',
  orange: '#F97316',
  white: '#FFFFFF',
  zinc400: '#A1A1AA',
  zinc700: '#3f3f46',
  zinc800: '#27272a',
  zinc900: '#18181b',
};

// Opciones
const LEVELS = ['PRINCIPIANTE', 'INTERMEDIO', 'AVANZADO'];
const GOALS = ['HIPERTROFIA', 'FUERZA', 'DEFINICION', 'RECOMPOSICION', 'GENERAL'];
const EQUIPMENT = ['gym-completo', 'mancuernas', 'casa', 'calistenia', 'bandas'];

// Grupos musculares para selección de días
const MUSCLE_GROUPS = [
  // Superior - Pecho y Espalda
  { id: 'pecho', name: 'PECHO', color: '#ef4444', category: 'superior' },
  { id: 'espalda', name: 'ESPALDA', color: '#3b82f6', category: 'superior' },
  // Hombros divididos
  { id: 'hombro-frontal', name: 'HOMBRO FRONTAL', color: '#f59e0b', category: 'hombros' },
  { id: 'hombro-lateral', name: 'HOMBRO LATERAL', color: '#fbbf24', category: 'hombros' },
  { id: 'hombro-posterior', name: 'HOMBRO POSTERIOR', color: '#d97706', category: 'hombros' },
  // Brazos
  { id: 'biceps', name: 'BÍCEPS', color: '#10b981', category: 'brazos' },
  { id: 'triceps', name: 'TRÍCEPS', color: '#8b5cf6', category: 'brazos' },
  { id: 'antebrazos', name: 'ANTEBRAZOS', color: '#6366f1', category: 'brazos' },
  // Inferior
  { id: 'cuadriceps', name: 'CUÁDRICEPS', color: '#ec4899', category: 'piernas' },
  { id: 'femorales', name: 'FEMORALES', color: '#be185d', category: 'piernas' },
  { id: 'gluteos', name: 'GLÚTEOS', color: '#f97316', category: 'piernas' },
  { id: 'pantorrillas', name: 'PANTORRILLAS', color: '#84cc16', category: 'piernas' },
  // Core y especiales
  { id: 'core', name: 'CORE', color: '#06b6d4', category: 'core' },
  { id: 'cardio', name: 'CARDIO', color: '#ef4444', category: 'especial' },
  { id: 'fullbody', name: 'FULL BODY', color: '#a855f7', category: 'especial' },
];

// Sinónimos de grupos musculares: FEMORALES (UI) ↔ ISQUIOS (DB)
const MUSCLE_ALIASES: Record<string, string> = {
  FEMORALES: 'ISQUIOS',
  ISQUIOS: 'FEMORALES',
};
// Verifica si dos nombres de músculo son equivalentes (incluyendo aliases)
const musclesMatch = (a: string, b: string): boolean => {
  const au = a.toUpperCase();
  const bu = b.toUpperCase();
  return au === bu || MUSCLE_ALIASES[au] === bu || au === MUSCLE_ALIASES[bu];
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================
export default function AdminRutinasScreen() {
  const [templates, setTemplates] = useState<TrainingTemplate[]>([]);
  const [filteredTemplates, setFilteredTemplates] = useState<TrainingTemplate[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  // Modal states
  const [modalVisible, setModalVisible] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<TrainingTemplate | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    slug: '',
    description: '',
    frequency: 4,
    target_levels: ['INTERMEDIO'] as string[],
    target_goals: ['HIPERTROFIA'] as string[],
    equipment: ['gym-completo'] as string[],
    days: [] as TemplateDay[],
    coach_notes: '',
  });

  // Day editor modal
  const [dayModalVisible, setDayModalVisible] = useState(false);
  const [editingDayIndex, setEditingDayIndex] = useState<number | null>(null);
  const [dayFormData, setDayFormData] = useState({
    name: '',
    focus: '',
    notes: '',
    exercises: [] as TemplateDayExercise[],
    cardio: [] as TemplateCardio[],
    groups: [] as TemplateExerciseGroup[],
  });
  const [selectedMuscleGroups, setSelectedMuscleGroups] = useState<string[]>([]);

  // Exercise selector modal
  const [exerciseSelectorVisible, setExerciseSelectorVisible] = useState(false);
  const [dbExercises, setDbExercises] = useState<DBExercise[]>([]);
  const [exerciseSearchQuery, setExerciseSearchQuery] = useState('');
  const [loadingExercises, setLoadingExercises] = useState(false);
  const [selectedExerciseMuscleFilter, setSelectedExerciseMuscleFilter] = useState<string | null>(
    null
  );

  // Exercise series editor modal
  const [seriesEditorVisible, setSeriesEditorVisible] = useState(false);
  const [editingExerciseIndex, setEditingExerciseIndex] = useState<number | null>(null);
  const [currentExercise, setCurrentExercise] = useState<TemplateDayExercise | null>(null);

  // Series types config
  const SERIES_TYPES: { type: SeriesType; label: string; color: string; defaultReps: number }[] = [
    { type: 'CALENTAMIENTO', label: '🔥 CALENT.', color: '#f59e0b', defaultReps: 15 },
    { type: 'APROXIMACION', label: '📈 APROX.', color: '#3b82f6', defaultReps: 8 },
    { type: 'EFECTIVA', label: '💪 EFECTIVA', color: '#22c55e', defaultReps: 10 },
    { type: 'FALLO', label: '💀 FALLO', color: '#ef4444', defaultReps: 8 },
  ];

  // -------------------------------------------------------------------------
  // FETCH EXERCISES FROM DB
  // -------------------------------------------------------------------------
  const fetchExercisesFromDB = useCallback(async () => {
    setLoadingExercises(true);
    try {
      const { data, error } = await supabase
        .from('exercises')
        .select('id, name, muscle_group, secondary_muscles, thumbnail_url, description')
        .order('name', { ascending: true });

      if (error) throw error;
      setDbExercises(data || []);
    } catch (error) {
      console.error('Error fetching exercises:', error);
    } finally {
      setLoadingExercises(false);
    }
  }, []);

  // -------------------------------------------------------------------------
  // FETCH TEMPLATES
  // -------------------------------------------------------------------------
  const fetchTemplates = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('training_plan_templates')
        .select('*')
        .order('sort_order', { ascending: true });

      if (error) throw error;

      // Parse days JSON
      const parsed = (data || []).map((t) => ({
        ...t,
        days: typeof t.days === 'string' ? JSON.parse(t.days) : t.days || [],
      }));

      setTemplates(parsed);
      setFilteredTemplates(parsed);
    } catch (error) {
      console.error('Error fetching templates:', error);
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchTemplates();
    fetchExercisesFromDB();
  }, [fetchTemplates, fetchExercisesFromDB]);

  // -------------------------------------------------------------------------
  // SEARCH FILTER
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (searchQuery.trim() === '') {
      setFilteredTemplates(templates);
    } else {
      const query = searchQuery.toLowerCase();
      setFilteredTemplates(
        templates.filter(
          (t) =>
            t.name.toLowerCase().includes(query) ||
            t.target_goals?.some((g) => g.toLowerCase().includes(query)) ||
            t.target_levels?.some((l) => l.toLowerCase().includes(query))
        )
      );
    }
  }, [searchQuery, templates]);

  // -------------------------------------------------------------------------
  // GENERATE SLUG
  // -------------------------------------------------------------------------
  const generateSlug = (name: string) => {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  };

  // -------------------------------------------------------------------------
  // OPEN TEMPLATE MODAL
  // -------------------------------------------------------------------------
  const openModal = (template?: TrainingTemplate) => {
    if (template) {
      setEditingTemplate(template);
      setFormData({
        name: template.name,
        slug: template.slug,
        description: template.description || '',
        frequency: template.frequency,
        target_levels: template.target_levels || ['INTERMEDIO'],
        target_goals: template.target_goals || ['HIPERTROFIA'],
        equipment: template.equipment || ['gym-completo'],
        days: template.days || [],
        coach_notes: template.coach_notes || '',
      });
    } else {
      setEditingTemplate(null);
      setFormData({
        name: '',
        slug: '',
        description: '',
        frequency: 4,
        target_levels: ['INTERMEDIO'],
        target_goals: ['HIPERTROFIA'],
        equipment: ['gym-completo'],
        days: [],
        coach_notes: '',
      });
    }
    setModalVisible(true);
  };

  // -------------------------------------------------------------------------
  // SAVE TEMPLATE
  // -------------------------------------------------------------------------
  const saveTemplate = async () => {
    if (!formData.name.trim()) {
      Alert.alert('Error', 'El nombre es requerido');
      return;
    }

    if (formData.days.length === 0) {
      Alert.alert('Error', 'Debes agregar al menos un día');
      return;
    }

    try {
      const slug = formData.slug || generateSlug(formData.name);

      if (editingTemplate) {
        const { error } = await supabase
          .from('training_plan_templates')
          .update({
            name: formData.name.trim(),
            slug,
            description: formData.description.trim() || null,
            frequency: formData.frequency,
            target_levels: formData.target_levels,
            target_goals: formData.target_goals,
            equipment: formData.equipment,
            days: formData.days,
            coach_notes: formData.coach_notes.trim() || null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', editingTemplate.id);

        if (error) throw error;
        Alert.alert('✅ Éxito', 'Rutina actualizada');
      } else {
        const { error } = await supabase.from('training_plan_templates').insert({
          name: formData.name.trim(),
          slug,
          description: formData.description.trim() || null,
          frequency: formData.frequency,
          target_levels: formData.target_levels,
          target_goals: formData.target_goals,
          equipment: formData.equipment,
          days: formData.days,
          coach_notes: formData.coach_notes.trim() || null,
          is_active: true,
          sort_order: templates.length,
        });

        if (error) throw error;
        Alert.alert('✅ Éxito', 'Rutina creada');
      }

      setModalVisible(false);
      fetchTemplates();
    } catch (error) {
      console.error('Error saving template:', error);
      Alert.alert('Error', 'No se pudo guardar la rutina');
    }
  };

  // -------------------------------------------------------------------------
  // DELETE TEMPLATE
  // -------------------------------------------------------------------------
  const deleteTemplate = (template: TrainingTemplate) => {
    Alert.alert(
      'Eliminar Rutina',
      `¿Seguro que quieres eliminar "${template.name}"?\n\nEsta acción es permanente.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('training_plan_templates')
                .delete()
                .eq('id', template.id);

              if (error) throw error;
              Alert.alert('✅ Eliminado', 'Rutina eliminada permanentemente');
              fetchTemplates();
            } catch (error) {
              console.error('Error deleting template:', error);
              Alert.alert('Error', 'No se pudo eliminar la rutina');
            }
          },
        },
      ]
    );
  };

  // -------------------------------------------------------------------------
  // DUPLICATE TEMPLATE
  // -------------------------------------------------------------------------
  const duplicateTemplate = async (template: TrainingTemplate) => {
    try {
      const { error } = await supabase.from('training_plan_templates').insert({
        name: `${template.name} (Copia)`,
        slug: `${template.slug}-copy-${Date.now()}`,
        description: template.description,
        frequency: template.frequency,
        target_levels: template.target_levels,
        target_goals: template.target_goals,
        equipment: template.equipment,
        days: template.days,
        is_active: true,
        sort_order: templates.length,
      });

      if (error) throw error;
      Alert.alert('✅ Éxito', 'Rutina duplicada');
      fetchTemplates();
    } catch (error) {
      console.error('Error duplicating template:', error);
    }
  };

  // -------------------------------------------------------------------------
  // DAY MANAGEMENT
  // -------------------------------------------------------------------------
  const openDayModal = (dayIndex?: number) => {
    if (dayIndex !== undefined && formData.days[dayIndex]) {
      setEditingDayIndex(dayIndex);
      const muscleNames = formData.days[dayIndex].name.split(' + ').map((m) => m.trim());
      setSelectedMuscleGroups(muscleNames);
      setDayFormData({
        name: formData.days[dayIndex].name,
        focus: formData.days[dayIndex].focus || '',
        notes: formData.days[dayIndex].notes || '',
        exercises: formData.days[dayIndex].exercises || [],
        cardio: formData.days[dayIndex].cardio || [],
        groups: formData.days[dayIndex].groups || [],
      });
    } else {
      setEditingDayIndex(null);
      setSelectedMuscleGroups([]);
      setDayFormData({
        name: '',
        focus: '',
        notes: '',
        exercises: [],
        cardio: [],
        groups: [],
      });
    }
    setDayModalVisible(true);
  };

  const saveDay = () => {
    if (selectedMuscleGroups.length === 0) {
      Alert.alert('Error', 'Selecciona al menos un grupo muscular');
      return;
    }

    // Generar nombre automáticamente de los grupos seleccionados
    const generatedName = selectedMuscleGroups.join(' + ');

    const newDay: TemplateDay = {
      dayIndex: editingDayIndex ?? formData.days.length,
      name: generatedName,
      focus: undefined,
      notes: dayFormData.notes.trim() || undefined,
      exercises: dayFormData.exercises,
      cardio: dayFormData.cardio.length ? dayFormData.cardio : undefined,
      groups: dayFormData.groups.length ? dayFormData.groups : undefined,
    };

    if (editingDayIndex !== null) {
      const updatedDays = [...formData.days];
      updatedDays[editingDayIndex] = newDay;
      setFormData((prev) => ({ ...prev, days: updatedDays, frequency: updatedDays.length }));
    } else {
      const updatedDays = [...formData.days, newDay];
      setFormData((prev) => ({ ...prev, days: updatedDays, frequency: updatedDays.length }));
    }

    setDayModalVisible(false);
  };

  const deleteDay = (dayIndex: number) => {
    const updatedDays = formData.days
      .filter((_, i) => i !== dayIndex)
      .map((d, i) => ({ ...d, dayIndex: i }));
    setFormData((prev) => ({ ...prev, days: updatedDays, frequency: updatedDays.length }));
  };

  // -------------------------------------------------------------------------
  // EXERCISE IN DAY MANAGEMENT - NUEVA IMPLEMENTACIÓN
  // -------------------------------------------------------------------------

  // Abrir selector de ejercicios (conectado a DB)
  const openExerciseSelector = () => {
    setExerciseSearchQuery('');
    setExerciseSelectorVisible(true);
  };

  // Seleccionar ejercicio de la DB y agregarlo
  const selectExercise = (dbExercise: DBExercise) => {
    // Crear ejercicio con series por defecto (4 efectivas)
    const defaultSeries: TemplateSeriesConfig[] = [
      { id: '1', type: 'CALENTAMIENTO', reps: 15, note: '' },
      { id: '2', type: 'EFECTIVA', reps: 10, note: '' },
      { id: '3', type: 'EFECTIVA', reps: 10, note: '' },
      { id: '4', type: 'EFECTIVA', reps: 10, note: '' },
      { id: '5', type: 'FALLO', reps: 8, note: '' },
    ];

    const newExercise: TemplateDayExercise = {
      exercise_id: dbExercise.id,
      name: dbExercise.name,
      thumbnail_url: dbExercise.thumbnail_url,
      rest: '90s',
      series: defaultSeries,
    };

    setDayFormData((prev) => ({
      ...prev,
      exercises: [...prev.exercises, newExercise],
    }));

    setExerciseSelectorVisible(false);
  };

  // Abrir editor de series para un ejercicio
  const openSeriesEditor = (exerciseIndex: number) => {
    setEditingExerciseIndex(exerciseIndex);
    setCurrentExercise({ ...dayFormData.exercises[exerciseIndex] });
    setSeriesEditorVisible(true);
  };

  // Agregar serie
  const addSeries = (type: SeriesType) => {
    if (!currentExercise) return;
    const config = SERIES_TYPES.find((s) => s.type === type);
    const newSeries: TemplateSeriesConfig = {
      id: String(Date.now()),
      type,
      reps: config?.defaultReps || 10,
      note: '',
    };
    setCurrentExercise({
      ...currentExercise,
      series: [...currentExercise.series, newSeries],
    });
  };

  // Eliminar serie
  const removeSeries = (seriesIndex: number) => {
    if (!currentExercise) return;
    setCurrentExercise({
      ...currentExercise,
      series: currentExercise.series.filter((_, i) => i !== seriesIndex),
    });
  };

  // Actualizar reps de una serie
  const updateSeriesReps = (seriesIndex: number, reps: number) => {
    if (!currentExercise) return;
    const updated = [...currentExercise.series];
    updated[seriesIndex] = { ...updated[seriesIndex], reps };
    setCurrentExercise({ ...currentExercise, series: updated });
  };

  // Actualizar nota de una serie
  const updateSeriesNote = (seriesIndex: number, note: string) => {
    if (!currentExercise) return;
    const updated = [...currentExercise.series];
    updated[seriesIndex] = { ...updated[seriesIndex], note };
    setCurrentExercise({ ...currentExercise, series: updated });
  };

  // Actualizar peso sugerido de una serie
  const updateSeriesWeight = (seriesIndex: number, weight: string) => {
    if (!currentExercise) return;
    const updated = [...currentExercise.series];
    updated[seriesIndex] = { ...updated[seriesIndex], weight };
    setCurrentExercise({ ...currentExercise, series: updated });
  };

  // Actualizar tempo de una serie
  const updateSeriesTempo = (seriesIndex: number, tempo: string) => {
    if (!currentExercise) return;
    const updated = [...currentExercise.series];
    updated[seriesIndex] = { ...updated[seriesIndex], tempo };
    setCurrentExercise({ ...currentExercise, series: updated });
  };

  // Actualizar RPE de una serie
  const updateSeriesRpe = (seriesIndex: number, rpe: string) => {
    if (!currentExercise) return;
    const updated = [...currentExercise.series];
    updated[seriesIndex] = { ...updated[seriesIndex], rpe };
    setCurrentExercise({ ...currentExercise, series: updated });
  };

  // Actualizar notas/instrucciones del ejercicio
  const updateExerciseNotes = (notes: string) => {
    if (!currentExercise) return;
    setCurrentExercise({ ...currentExercise, notes });
  };

  // Actualizar descanso
  const updateRest = (rest: string) => {
    if (!currentExercise) return;
    setCurrentExercise({ ...currentExercise, rest });
  };

  // Guardar configuración de series
  const saveSeriesConfig = () => {
    if (editingExerciseIndex === null || !currentExercise) return;

    const updatedExercises = [...dayFormData.exercises];
    updatedExercises[editingExerciseIndex] = currentExercise;
    setDayFormData((prev) => ({ ...prev, exercises: updatedExercises }));

    setSeriesEditorVisible(false);
    setCurrentExercise(null);
    setEditingExerciseIndex(null);
  };

  // ---- CARDIO del día ----
  const addCardioBlock = () => {
    setDayFormData((prev) => ({
      ...prev,
      cardio: [
        ...prev.cardio,
        {
          id: String(Date.now()),
          activity: 'Caminadora',
          cardio_type: 'LISS',
          duration_minutes: 20,
          intensity: 'Moderada',
          is_pre_workout: false,
          is_post_workout: true,
          is_fasted: false,
        },
      ],
    }));
  };
  const updateCardioBlock = (idx: number, patch: Partial<TemplateCardio>) => {
    setDayFormData((prev) => {
      const updated = [...prev.cardio];
      updated[idx] = { ...updated[idx], ...patch };
      return { ...prev, cardio: updated };
    });
  };
  const removeCardioBlock = (idx: number) => {
    setDayFormData((prev) => ({ ...prev, cardio: prev.cardio.filter((_, i) => i !== idx) }));
  };

  // ---- SUPERSERIES / GRUPOS del día ----
  const addExerciseGroup = () => {
    if (dayFormData.exercises.length < 2) {
      Alert.alert('Atención', 'Necesitas al menos 2 ejercicios para crear una superserie');
      return;
    }
    setDayFormData((prev) => ({
      ...prev,
      groups: [
        ...prev.groups,
        {
          id: String(Date.now()),
          type: 'SUPERSERIES',
          exercise_ids: [],
          rest_after: 90,
          rounds: 3,
        },
      ],
    }));
  };
  const updateGroup = (idx: number, patch: Partial<TemplateExerciseGroup>) => {
    setDayFormData((prev) => {
      const updated = [...prev.groups];
      updated[idx] = { ...updated[idx], ...patch };
      return { ...prev, groups: updated };
    });
  };
  const toggleGroupExercise = (groupIdx: number, exerciseId: string) => {
    setDayFormData((prev) => {
      const updated = [...prev.groups];
      const current = updated[groupIdx];
      const has = current.exercise_ids.includes(exerciseId);
      updated[groupIdx] = {
        ...current,
        exercise_ids: has
          ? current.exercise_ids.filter((id) => id !== exerciseId)
          : [...current.exercise_ids, exerciseId],
      };
      return { ...prev, groups: updated };
    });
  };
  const removeGroup = (idx: number) => {
    setDayFormData((prev) => ({ ...prev, groups: prev.groups.filter((_, i) => i !== idx) }));
  };

  // Eliminar ejercicio del día
  const deleteExercise = (exerciseIndex: number) => {
    Alert.alert('Eliminar Ejercicio', '¿Estás seguro?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: () => {
          const updatedExercises = dayFormData.exercises.filter((_, i) => i !== exerciseIndex);
          setDayFormData((prev) => ({ ...prev, exercises: updatedExercises }));
        },
      },
    ]);
  };

  // Filtrar y ordenar ejercicios para el selector
  // Prioriza los que coinciden con los músculos seleccionados para el día
  const filteredDbExercises = (() => {
    let exercises = [...dbExercises];

    // Helper para verificar si un ejercicio es recomendado (match con músculos del día)
    const isExerciseRecommended = (ex: DBExercise) => {
      const exMuscle = ex.muscle_group?.toUpperCase() || '';
      const exSecondary = ex.secondary_muscles?.map((m) => m.toUpperCase()) || [];
      return selectedMuscleGroups.some((dayMuscle) =>
        musclesMatch(exMuscle, dayMuscle) ||
        exSecondary.some((s) => musclesMatch(s, dayMuscle))
      );
    };

    // Filtro especial "RECOMMENDED" - solo ejercicios que coinciden con músculos del día
    if (selectedExerciseMuscleFilter === 'RECOMMENDED') {
      exercises = exercises.filter(isExerciseRecommended);
    }
    // Filtro por grupo muscular específico
    else if (selectedExerciseMuscleFilter) {
      exercises = exercises.filter(
        (ex) =>
          musclesMatch(ex.muscle_group || '', selectedExerciseMuscleFilter) ||
          ex.secondary_muscles?.some((mg) => musclesMatch(mg, selectedExerciseMuscleFilter))
      );
    }

    // Luego aplicar búsqueda de texto
    if (exerciseSearchQuery) {
      const q = exerciseSearchQuery.toLowerCase();
      exercises = exercises.filter(
        (ex) => ex.name.toLowerCase().includes(q) || ex.muscle_group?.toLowerCase().includes(q)
      );
    }

    // Separar en recomendados (match con músculos del día) y otros
    const recommended: DBExercise[] = [];
    const others: DBExercise[] = [];

    exercises.forEach((ex) => {
      if (isExerciseRecommended(ex)) {
        recommended.push(ex);
      } else {
        others.push(ex);
      }
    });

    // Retornar recomendados primero, luego los demás
    return [...recommended, ...others];
  })();

  // -------------------------------------------------------------------------
  // TOGGLE ARRAY VALUE
  // -------------------------------------------------------------------------
  const toggleArrayValue = (
    field: 'target_levels' | 'target_goals' | 'equipment',
    value: string
  ) => {
    setFormData((prev) => ({
      ...prev,
      [field]: prev[field].includes(value)
        ? prev[field].filter((v) => v !== value)
        : [...prev[field], value],
    }));
  };

  // -------------------------------------------------------------------------
  // RENDER
  // -------------------------------------------------------------------------
  return (
    <View className="flex-1 bg-black">
      {/* Search Header */}
      <View className="px-4 py-3 bg-zinc-900 border-b border-zinc-800">
        <View className="flex-row items-center bg-zinc-800 rounded-lg px-3 py-2">
          <Search size={18} color={COLORS.zinc400} />
          <TextInput
            className="flex-1 text-white ml-2 font-mono"
            placeholder="Buscar rutina..."
            placeholderTextColor={COLORS.zinc400}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>

        <View className="flex-row items-center justify-between mt-3">
          <Text className="text-zinc-400 text-xs font-mono">
            {filteredTemplates.length} rutinas
          </Text>
          <TouchableOpacity
            className="flex-row items-center bg-blue-600 px-3 py-2 rounded-lg"
            onPress={() => openModal()}
          >
            <Plus size={16} color={COLORS.white} />
            <Text className="text-white text-sm font-bold ml-1">NUEVA</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Template List */}
      <ScrollView
        className="flex-1"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              fetchTemplates();
            }}
            tintColor={COLORS.blue}
          />
        }
      >
        {filteredTemplates.map((template) => (
          <TouchableOpacity
            key={template.id}
            className="bg-zinc-900 mx-4 my-1 p-4 rounded-lg border border-zinc-800"
            onPress={() => openModal(template)}
          >
            <View className="flex-row items-start justify-between">
              <View className="flex-1">
                <Text className="text-white font-bold text-lg">{template.name}</Text>
                {template.description && (
                  <Text className="text-zinc-400 text-sm mt-1" numberOfLines={2}>
                    {template.description}
                  </Text>
                )}
              </View>
              <View className="flex-row items-center gap-2">
                <TouchableOpacity
                  className="p-2 bg-zinc-800 rounded-lg"
                  onPress={() => duplicateTemplate(template)}
                >
                  <Copy size={16} color={COLORS.blue} />
                </TouchableOpacity>
                <TouchableOpacity
                  className="p-2 bg-zinc-800 rounded-lg"
                  onPress={() => deleteTemplate(template)}
                >
                  <Trash2 size={16} color={COLORS.red} />
                </TouchableOpacity>
              </View>
            </View>

            {/* Metadata */}
            <View className="flex-row flex-wrap gap-2 mt-3">
              <View className="flex-row items-center bg-zinc-800 px-2 py-1 rounded">
                <Calendar size={12} color={COLORS.blue} />
                <Text className="text-blue-400 text-xs font-mono ml-1">
                  {template.frequency} días
                </Text>
              </View>
              <View className="flex-row items-center bg-zinc-800 px-2 py-1 rounded">
                <Target size={12} color={COLORS.purple} />
                <Text className="text-purple-400 text-xs font-mono ml-1">
                  {template.target_goals?.join(', ')}
                </Text>
              </View>
              <View className="flex-row items-center bg-zinc-800 px-2 py-1 rounded">
                <Users size={12} color={COLORS.green} />
                <Text className="text-green-400 text-xs font-mono ml-1">
                  {template.target_levels?.join(', ')}
                </Text>
              </View>
            </View>

            {/* Days Preview */}
            <View className="flex-row flex-wrap gap-1 mt-3">
              {template.days?.map((day, i) => (
                <View key={i} className="bg-zinc-800 px-2 py-1 rounded">
                  <Text className="text-zinc-400 text-xs font-mono">{day.name}</Text>
                </View>
              ))}
            </View>
          </TouchableOpacity>
        ))}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Main Template Modal */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <View className="flex-1 bg-black/90 justify-end">
          <View className="bg-zinc-900 rounded-t-3xl p-4" style={{ maxHeight: '95%' }}>
            <View className="flex-row items-center justify-between mb-4">
              <Text className="text-white font-bold text-lg">
                {editingTemplate ? 'Editar Rutina' : 'Nueva Rutina'}
              </Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <X size={24} color={COLORS.zinc400} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Name */}
              <Text className="text-zinc-400 text-xs font-mono mb-1">NOMBRE</Text>
              <TextInput
                className="bg-zinc-800 text-white p-3 rounded-lg mb-3 font-mono"
                placeholder="Nombre de la rutina"
                placeholderTextColor={COLORS.zinc400}
                value={formData.name}
                onChangeText={(text) => {
                  setFormData((prev) => ({
                    ...prev,
                    name: text,
                    slug: generateSlug(text),
                  }));
                }}
              />

              {/* Description */}
              <Text className="text-zinc-400 text-xs font-mono mb-1">DESCRIPCIÓN</Text>
              <TextInput
                className="bg-zinc-800 text-white p-3 rounded-lg mb-3 font-mono"
                placeholder="Para qué tipo de usuario es este plan..."
                placeholderTextColor={COLORS.zinc400}
                value={formData.description}
                onChangeText={(text) => setFormData((prev) => ({ ...prev, description: text }))}
                multiline
                numberOfLines={3}
              />

              {/* Coach Notes — mensaje del coach al alumno */}
              <Text className="text-zinc-400 text-xs font-mono mb-1">
                📝 NOTAS DEL COACH (visible al alumno)
              </Text>
              <TextInput
                className="bg-zinc-800 text-white p-3 rounded-lg mb-3 font-mono"
                placeholder="Mensaje, recordatorios, técnica clave..."
                placeholderTextColor={COLORS.zinc400}
                value={formData.coach_notes}
                onChangeText={(text) => setFormData((prev) => ({ ...prev, coach_notes: text }))}
                multiline
                numberOfLines={3}
                maxLength={2000}
              />

              {/* Target Levels */}
              <Text className="text-zinc-400 text-xs font-mono mb-2">NIVEL OBJETIVO</Text>
              <View className="flex-row flex-wrap gap-2 mb-3">
                {LEVELS.map((level) => {
                  const isSelected = formData.target_levels.includes(level);
                  return (
                    <TouchableOpacity
                      key={level}
                      className={`px-3 py-2 rounded-lg border ${
                        isSelected ? 'bg-green-600 border-green-500' : 'bg-zinc-800 border-zinc-700'
                      }`}
                      onPress={() => toggleArrayValue('target_levels', level)}
                    >
                      <Text className={isSelected ? 'text-white' : 'text-zinc-400'}>{level}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Target Goals */}
              <Text className="text-zinc-400 text-xs font-mono mb-2">OBJETIVO</Text>
              <View className="flex-row flex-wrap gap-2 mb-3">
                {GOALS.map((goal) => {
                  const isSelected = formData.target_goals.includes(goal);
                  return (
                    <TouchableOpacity
                      key={goal}
                      className={`px-3 py-2 rounded-lg border ${
                        isSelected
                          ? 'bg-purple-600 border-purple-500'
                          : 'bg-zinc-800 border-zinc-700'
                      }`}
                      onPress={() => toggleArrayValue('target_goals', goal)}
                    >
                      <Text className={isSelected ? 'text-white' : 'text-zinc-400'}>{goal}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Equipment */}
              <Text className="text-zinc-400 text-xs font-mono mb-2">EQUIPAMIENTO</Text>
              <View className="flex-row flex-wrap gap-2 mb-4">
                {EQUIPMENT.map((eq) => {
                  const isSelected = formData.equipment.includes(eq);
                  return (
                    <TouchableOpacity
                      key={eq}
                      className={`px-3 py-2 rounded-lg border ${
                        isSelected ? 'bg-blue-600 border-blue-500' : 'bg-zinc-800 border-zinc-700'
                      }`}
                      onPress={() => toggleArrayValue('equipment', eq)}
                    >
                      <Text className={isSelected ? 'text-white' : 'text-zinc-400'}>{eq}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Days Section */}
              <View className="flex-row items-center justify-between mb-2">
                <Text className="text-zinc-400 text-xs font-mono">
                  DÍAS ({formData.days.length})
                </Text>
                <TouchableOpacity
                  className="flex-row items-center bg-blue-600 px-2 py-1 rounded"
                  onPress={() => openDayModal()}
                >
                  <Plus size={14} color={COLORS.white} />
                  <Text className="text-white text-xs font-bold ml-1">AGREGAR DÍA</Text>
                </TouchableOpacity>
              </View>

              {/* Days List */}
              {formData.days.map((day, index) => (
                <TouchableOpacity
                  key={index}
                  className="bg-zinc-800 p-3 rounded-lg mb-2 border border-zinc-700"
                  onPress={() => openDayModal(index)}
                >
                  <View className="flex-row items-center justify-between">
                    <View>
                      <Text className="text-white font-bold">
                        Día {index + 1}: {day.name}
                      </Text>
                      {day.focus && <Text className="text-zinc-400 text-xs">{day.focus}</Text>}
                      <Text className="text-blue-400 text-xs mt-1">
                        {day.exercises?.length || 0} ejercicios
                      </Text>
                    </View>
                    <View className="flex-row items-center gap-2">
                      <TouchableOpacity
                        onPress={() => deleteDay(index)}
                        className="p-2 bg-zinc-700 rounded"
                      >
                        <Trash2 size={14} color={COLORS.red} />
                      </TouchableOpacity>
                      <ChevronRight size={18} color={COLORS.zinc400} />
                    </View>
                  </View>
                </TouchableOpacity>
              ))}

              <View style={{ height: 100 }} />
            </ScrollView>

            {/* Save Button */}
            <TouchableOpacity
              className="bg-blue-600 py-4 rounded-lg flex-row items-center justify-center mt-4"
              onPress={saveTemplate}
            >
              <Check size={20} color={COLORS.white} />
              <Text className="text-white font-bold ml-2">GUARDAR RUTINA</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Day Editor Modal */}
      <Modal visible={dayModalVisible} animationType="slide" transparent>
        <View className="flex-1 bg-black/90 justify-end">
          <View className="bg-zinc-900 rounded-t-3xl p-4" style={{ maxHeight: '90%' }}>
            <View className="flex-row items-center justify-between mb-4">
              <Text className="text-white font-bold text-lg">
                {editingDayIndex !== null ? `Editar Día ${editingDayIndex + 1}` : 'Nuevo Día'}
              </Text>
              <TouchableOpacity onPress={() => setDayModalVisible(false)}>
                <X size={24} color={COLORS.zinc400} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Muscle Groups Selection */}
              <Text className="text-zinc-400 text-xs font-mono mb-2">GRUPOS MUSCULARES</Text>

              {/* Preview del nombre generado */}
              {selectedMuscleGroups.length > 0 && (
                <View className="bg-zinc-800 p-3 rounded-lg mb-3 border border-blue-500/50">
                  <Text className="text-blue-400 text-xs font-mono mb-1">NOMBRE GENERADO:</Text>
                  <Text className="text-white font-bold">{selectedMuscleGroups.join(' + ')}</Text>
                </View>
              )}

              {/* Superior - Pecho y Espalda */}
              <View className="mb-3">
                <Text className="text-red-500 text-xs font-mono mb-2">TORSO</Text>
                <View className="flex-row flex-wrap gap-2">
                  {MUSCLE_GROUPS.filter((g) => g.category === 'superior').map((group) => {
                    const isSelected = selectedMuscleGroups.includes(group.name);
                    return (
                      <TouchableOpacity
                        key={group.id}
                        className="px-3 py-2 rounded-lg"
                        style={{
                          backgroundColor: isSelected ? group.color : '#27272a',
                          borderWidth: 1,
                          borderColor: isSelected ? group.color : '#3f3f46',
                        }}
                        onPress={() => {
                          if (isSelected) {
                            setSelectedMuscleGroups((prev) => prev.filter((g) => g !== group.name));
                          } else {
                            setSelectedMuscleGroups((prev) => [...prev, group.name]);
                          }
                        }}
                      >
                        <Text
                          className="text-xs font-bold"
                          style={{ color: isSelected ? '#000' : '#a1a1aa' }}
                        >
                          {group.name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {/* Hombros */}
              <View className="mb-3">
                <Text className="text-amber-500 text-xs font-mono mb-2">HOMBROS</Text>
                <View className="flex-row flex-wrap gap-2">
                  {MUSCLE_GROUPS.filter((g) => g.category === 'hombros').map((group) => {
                    const isSelected = selectedMuscleGroups.includes(group.name);
                    return (
                      <TouchableOpacity
                        key={group.id}
                        className="px-3 py-2 rounded-lg"
                        style={{
                          backgroundColor: isSelected ? group.color : '#27272a',
                          borderWidth: 1,
                          borderColor: isSelected ? group.color : '#3f3f46',
                        }}
                        onPress={() => {
                          if (isSelected) {
                            setSelectedMuscleGroups((prev) => prev.filter((g) => g !== group.name));
                          } else {
                            setSelectedMuscleGroups((prev) => [...prev, group.name]);
                          }
                        }}
                      >
                        <Text
                          className="text-xs font-bold"
                          style={{ color: isSelected ? '#000' : '#a1a1aa' }}
                        >
                          {group.name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {/* Brazos */}
              <View className="mb-3">
                <Text className="text-green-500 text-xs font-mono mb-2">BRAZOS</Text>
                <View className="flex-row flex-wrap gap-2">
                  {MUSCLE_GROUPS.filter((g) => g.category === 'brazos').map((group) => {
                    const isSelected = selectedMuscleGroups.includes(group.name);
                    return (
                      <TouchableOpacity
                        key={group.id}
                        className="px-3 py-2 rounded-lg"
                        style={{
                          backgroundColor: isSelected ? group.color : '#27272a',
                          borderWidth: 1,
                          borderColor: isSelected ? group.color : '#3f3f46',
                        }}
                        onPress={() => {
                          if (isSelected) {
                            setSelectedMuscleGroups((prev) => prev.filter((g) => g !== group.name));
                          } else {
                            setSelectedMuscleGroups((prev) => [...prev, group.name]);
                          }
                        }}
                      >
                        <Text
                          className="text-xs font-bold"
                          style={{ color: isSelected ? '#000' : '#a1a1aa' }}
                        >
                          {group.name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {/* Inferior */}
              <View className="mb-3">
                <Text className="text-pink-500 text-xs font-mono mb-2">PARTE INFERIOR</Text>
                <View className="flex-row flex-wrap gap-2">
                  {MUSCLE_GROUPS.filter((g) => g.category === 'piernas').map((group) => {
                    const isSelected = selectedMuscleGroups.includes(group.name);
                    return (
                      <TouchableOpacity
                        key={group.id}
                        className="px-3 py-2 rounded-lg"
                        style={{
                          backgroundColor: isSelected ? group.color : '#27272a',
                          borderWidth: 1,
                          borderColor: isSelected ? group.color : '#3f3f46',
                        }}
                        onPress={() => {
                          if (isSelected) {
                            setSelectedMuscleGroups((prev) => prev.filter((g) => g !== group.name));
                          } else {
                            setSelectedMuscleGroups((prev) => [...prev, group.name]);
                          }
                        }}
                      >
                        <Text
                          className="text-xs font-bold"
                          style={{ color: isSelected ? '#000' : '#a1a1aa' }}
                        >
                          {group.name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {/* Core y Especiales */}
              <View className="mb-4">
                <Text className="text-cyan-500 text-xs font-mono mb-2">CORE / ESPECIALES</Text>
                <View className="flex-row flex-wrap gap-2">
                  {MUSCLE_GROUPS.filter(
                    (g) => g.category === 'core' || g.category === 'especial'
                  ).map((group) => {
                    const isSelected = selectedMuscleGroups.includes(group.name);
                    return (
                      <TouchableOpacity
                        key={group.id}
                        className="px-3 py-2 rounded-lg"
                        style={{
                          backgroundColor: isSelected ? group.color : '#27272a',
                          borderWidth: 1,
                          borderColor: isSelected ? group.color : '#3f3f46',
                        }}
                        onPress={() => {
                          if (isSelected) {
                            setSelectedMuscleGroups((prev) => prev.filter((g) => g !== group.name));
                          } else {
                            setSelectedMuscleGroups((prev) => [...prev, group.name]);
                          }
                        }}
                      >
                        <Text
                          className="text-xs font-bold"
                          style={{ color: isSelected ? '#000' : '#a1a1aa' }}
                        >
                          {group.name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {/* Notas del día */}
              <Text className="text-zinc-400 text-xs font-mono mb-1 mt-2">
                📝 NOTAS DEL DÍA (opcional)
              </Text>
              <TextInput
                className="bg-zinc-800 text-white p-3 rounded-lg mb-2 font-mono text-sm"
                placeholder="Calentamiento específico, foco del día, recordatorios..."
                placeholderTextColor={COLORS.zinc400}
                value={dayFormData.notes}
                onChangeText={(text) => setDayFormData((prev) => ({ ...prev, notes: text }))}
                multiline
                numberOfLines={2}
                maxLength={500}
              />

              {/* Exercises */}
              <View className="flex-row items-center justify-between mb-2 mt-2">
                <Text className="text-zinc-400 text-xs font-mono">
                  EJERCICIOS ({dayFormData.exercises.length})
                </Text>
                <TouchableOpacity
                  className="flex-row items-center bg-green-600 px-2 py-1 rounded"
                  onPress={openExerciseSelector}
                >
                  <Plus size={14} color={COLORS.white} />
                  <Text className="text-white text-xs font-bold ml-1">AGREGAR</Text>
                </TouchableOpacity>
              </View>

              {dayFormData.exercises.map((ex, i) => (
                <TouchableOpacity
                  key={i}
                  className="bg-zinc-800 p-3 rounded-lg mb-2 border border-zinc-700"
                  onPress={() => openSeriesEditor(i)}
                >
                  <View className="flex-row items-center">
                    {/* Thumbnail */}
                    <View className="w-12 h-12 bg-zinc-700 rounded-lg overflow-hidden mr-3">
                      {ex.thumbnail_url ? (
                        <Image
                          source={{ uri: ex.thumbnail_url }}
                          className="w-full h-full"
                          resizeMode="cover"
                        />
                      ) : (
                        <View className="w-full h-full items-center justify-center">
                          <Text className="text-zinc-500 text-lg">💪</Text>
                        </View>
                      )}
                    </View>

                    {/* Info */}
                    <View className="flex-1">
                      <Text className="text-white font-bold text-sm" numberOfLines={1}>
                        {ex.name}
                      </Text>
                      <Text className="text-zinc-400 text-xs font-mono">
                        {ex.series?.length || 0} series • {ex.rest} descanso
                      </Text>
                      {/* Mini preview de series */}
                      <View className="flex-row mt-1 gap-1">
                        {ex.series?.slice(0, 6).map((s, si) => {
                          const config = SERIES_TYPES.find((t) => t.type === s.type);
                          return (
                            <View
                              key={si}
                              className="px-1.5 py-0.5 rounded"
                              style={{ backgroundColor: config?.color || '#3f3f46' }}
                            >
                              <Text className="text-white text-[8px] font-bold">{s.reps}</Text>
                            </View>
                          );
                        })}
                        {(ex.series?.length || 0) > 6 && (
                          <Text className="text-zinc-500 text-[8px]">+{ex.series!.length - 6}</Text>
                        )}
                      </View>
                    </View>

                    {/* Delete */}
                    <TouchableOpacity
                      onPress={() => deleteExercise(i)}
                      className="p-2 bg-zinc-700 rounded ml-2"
                    >
                      <Trash2 size={14} color={COLORS.red} />
                    </TouchableOpacity>
                  </View>
                </TouchableOpacity>
              ))}

              {/* ===== SUPERSERIES / GRUPOS ===== */}
              <View className="flex-row items-center justify-between mb-2 mt-4">
                <Text className="text-zinc-400 text-xs font-mono">
                  🔗 SUPERSERIES / CIRCUITOS ({dayFormData.groups.length})
                </Text>
                <TouchableOpacity
                  className="flex-row items-center bg-purple-600 px-2 py-1 rounded"
                  onPress={addExerciseGroup}
                >
                  <Plus size={14} color={COLORS.white} />
                  <Text className="text-white text-xs font-bold ml-1">AGRUPAR</Text>
                </TouchableOpacity>
              </View>
              {dayFormData.groups.map((g, gi) => (
                <View
                  key={g.id}
                  className="bg-zinc-800 p-3 rounded-lg mb-2 border-l-4"
                  style={{ borderLeftColor: '#8B5CF6' }}
                >
                  <View className="flex-row items-center justify-between mb-2">
                    <View className="flex-row gap-1">
                      {(['SUPERSERIES', 'TRISERIES', 'CIRCUITO', 'DROP_SET'] as const).map((t) => (
                        <TouchableOpacity
                          key={t}
                          className="px-2 py-1 rounded"
                          style={{ backgroundColor: g.type === t ? '#8B5CF6' : '#3f3f46' }}
                          onPress={() => updateGroup(gi, { type: t })}
                        >
                          <Text className="text-white text-[9px] font-bold">{t}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    <TouchableOpacity onPress={() => removeGroup(gi)} className="p-1">
                      <Trash2 size={14} color={COLORS.red} />
                    </TouchableOpacity>
                  </View>

                  <Text className="text-zinc-500 text-[10px] font-mono mb-1">
                    EJERCICIOS DEL GRUPO ({g.exercise_ids.length})
                  </Text>
                  <View className="flex-row flex-wrap gap-1.5 mb-2">
                    {dayFormData.exercises.map((ex) => {
                      const selected = g.exercise_ids.includes(ex.exercise_id);
                      return (
                        <TouchableOpacity
                          key={ex.exercise_id}
                          className="px-2 py-1 rounded"
                          style={{
                            backgroundColor: selected ? '#8B5CF6' : '#3f3f46',
                          }}
                          onPress={() => toggleGroupExercise(gi, ex.exercise_id)}
                        >
                          <Text className="text-white text-[10px] font-bold">{ex.name}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  <View className="flex-row gap-2">
                    <View className="flex-1">
                      <Text className="text-zinc-500 text-[9px] font-mono mb-0.5">RONDAS</Text>
                      <TextInput
                        className="bg-zinc-700 text-white p-1.5 rounded text-xs font-mono"
                        keyboardType="numeric"
                        value={String(g.rounds ?? '')}
                        onChangeText={(v) =>
                          updateGroup(gi, { rounds: parseInt(v, 10) || undefined })
                        }
                        maxLength={3}
                      />
                    </View>
                    <View className="flex-1">
                      <Text className="text-zinc-500 text-[9px] font-mono mb-0.5">
                        DESCANSO (s)
                      </Text>
                      <TextInput
                        className="bg-zinc-700 text-white p-1.5 rounded text-xs font-mono"
                        keyboardType="numeric"
                        value={String(g.rest_after ?? '')}
                        onChangeText={(v) =>
                          updateGroup(gi, { rest_after: parseInt(v, 10) || undefined })
                        }
                        maxLength={4}
                      />
                    </View>
                  </View>
                  <TextInput
                    className="bg-zinc-700 text-white p-1.5 rounded mt-2 text-xs font-mono"
                    placeholder="Nota (opcional)..."
                    placeholderTextColor={COLORS.zinc400}
                    value={g.notes || ''}
                    onChangeText={(v) => updateGroup(gi, { notes: v })}
                  />
                </View>
              ))}

              {/* ===== CARDIO DEL DÍA ===== */}
              <View className="flex-row items-center justify-between mb-2 mt-4">
                <Text className="text-zinc-400 text-xs font-mono">
                  🏃 CARDIO ({dayFormData.cardio.length})
                </Text>
                <TouchableOpacity
                  className="flex-row items-center bg-orange-600 px-2 py-1 rounded"
                  onPress={addCardioBlock}
                >
                  <Plus size={14} color={COLORS.white} />
                  <Text className="text-white text-xs font-bold ml-1">AGREGAR</Text>
                </TouchableOpacity>
              </View>
              {dayFormData.cardio.map((c, ci) => (
                <View
                  key={c.id}
                  className="bg-zinc-800 p-3 rounded-lg mb-2 border-l-4"
                  style={{ borderLeftColor: '#F97316' }}
                >
                  <View className="flex-row items-center justify-between mb-2">
                    <View className="flex-row gap-1">
                      {(['LISS', 'HIIT', 'STEADY', 'INTERVAL'] as const).map((t) => (
                        <TouchableOpacity
                          key={t}
                          className="px-2 py-1 rounded"
                          style={{ backgroundColor: c.cardio_type === t ? '#F97316' : '#3f3f46' }}
                          onPress={() => updateCardioBlock(ci, { cardio_type: t })}
                        >
                          <Text className="text-white text-[9px] font-bold">{t}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    <TouchableOpacity onPress={() => removeCardioBlock(ci)} className="p-1">
                      <Trash2 size={14} color={COLORS.red} />
                    </TouchableOpacity>
                  </View>

                  <View className="flex-row gap-2 mb-2">
                    <View className="flex-1">
                      <Text className="text-zinc-500 text-[9px] font-mono mb-0.5">ACTIVIDAD</Text>
                      <TextInput
                        className="bg-zinc-700 text-white p-1.5 rounded text-xs font-mono"
                        placeholder="Caminadora"
                        placeholderTextColor={COLORS.zinc400}
                        value={c.activity}
                        onChangeText={(v) => updateCardioBlock(ci, { activity: v })}
                      />
                    </View>
                    <View className="w-20">
                      <Text className="text-zinc-500 text-[9px] font-mono mb-0.5">MIN</Text>
                      <TextInput
                        className="bg-zinc-700 text-white p-1.5 rounded text-xs font-mono"
                        keyboardType="numeric"
                        value={String(c.duration_minutes ?? '')}
                        onChangeText={(v) =>
                          updateCardioBlock(ci, { duration_minutes: parseInt(v, 10) || 0 })
                        }
                        maxLength={3}
                      />
                    </View>
                    <View className="flex-1">
                      <Text className="text-zinc-500 text-[9px] font-mono mb-0.5">INTENSIDAD</Text>
                      <TextInput
                        className="bg-zinc-700 text-white p-1.5 rounded text-xs font-mono"
                        placeholder="Moderada"
                        placeholderTextColor={COLORS.zinc400}
                        value={c.intensity || ''}
                        onChangeText={(v) => updateCardioBlock(ci, { intensity: v })}
                      />
                    </View>
                  </View>

                  <View className="flex-row gap-2 mb-2">
                    {(
                      [
                        { key: 'is_pre_workout', label: 'PRE' },
                        { key: 'is_post_workout', label: 'POST' },
                        { key: 'is_fasted', label: 'AYUNAS' },
                      ] as const
                    ).map((opt) => {
                      const active = !!c[opt.key];
                      return (
                        <TouchableOpacity
                          key={opt.key}
                          className="px-2 py-1 rounded"
                          style={{ backgroundColor: active ? '#F97316' : '#3f3f46' }}
                          onPress={() => updateCardioBlock(ci, { [opt.key]: !active })}
                        >
                          <Text className="text-white text-[9px] font-bold">{opt.label}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  <TextInput
                    className="bg-zinc-700 text-white p-1.5 rounded text-xs font-mono"
                    placeholder="Nota (opcional)..."
                    placeholderTextColor={COLORS.zinc400}
                    value={c.notes || ''}
                    onChangeText={(v) => updateCardioBlock(ci, { notes: v })}
                  />
                </View>
              ))}

              <View style={{ height: 100 }} />
            </ScrollView>

            <TouchableOpacity
              className="bg-green-600 py-4 rounded-lg flex-row items-center justify-center mt-4"
              onPress={saveDay}
            >
              <Check size={20} color={COLORS.white} />
              <Text className="text-white font-bold ml-2">GUARDAR DÍA</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ===== EXERCISE SELECTOR MODAL ===== */}
      <Modal visible={exerciseSelectorVisible} animationType="slide" transparent>
        <View className="flex-1 bg-black/95 pt-12">
          <View className="flex-1 px-4">
            {/* Header */}
            <View className="flex-row items-center justify-between mb-4">
              <View>
                <Text className="text-white font-bold text-xl">Seleccionar Ejercicio</Text>
                {selectedMuscleGroups.length > 0 && (
                  <Text className="text-green-400 text-xs">
                    🎯 Músculos del día: {selectedMuscleGroups.join(', ')}
                  </Text>
                )}
              </View>
              <TouchableOpacity
                onPress={() => {
                  setExerciseSelectorVisible(false);
                  setSelectedExerciseMuscleFilter(null);
                  setExerciseSearchQuery('');
                }}
              >
                <X size={24} color={COLORS.zinc400} />
              </TouchableOpacity>
            </View>

            {/* Muscle Group Filter Pills */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              className="mb-2"
              style={{ maxHeight: 32 }}
              contentContainerStyle={{ gap: 6, paddingRight: 16, alignItems: 'center' }}
            >
              {/* All pill */}
              <TouchableOpacity
                className="px-2.5 py-1 rounded-full"
                style={{
                  backgroundColor: !selectedExerciseMuscleFilter ? COLORS.blue : '#27272a',
                  borderWidth: 1,
                  borderColor: !selectedExerciseMuscleFilter ? COLORS.blue : '#3f3f46',
                }}
                onPress={() => setSelectedExerciseMuscleFilter(null)}
              >
                <Text
                  className="text-[10px] font-bold"
                  style={{ color: !selectedExerciseMuscleFilter ? '#000' : '#a1a1aa' }}
                >
                  TODOS
                </Text>
              </TouchableOpacity>

              {/* Show recommended pill if there are muscle groups selected */}
              {selectedMuscleGroups.length > 0 && (
                <TouchableOpacity
                  className="px-2.5 py-1 rounded-full flex-row items-center"
                  style={{
                    backgroundColor:
                      selectedExerciseMuscleFilter === 'RECOMMENDED' ? COLORS.green : '#27272a',
                    borderWidth: 1,
                    borderColor:
                      selectedExerciseMuscleFilter === 'RECOMMENDED' ? COLORS.green : '#22c55e50',
                  }}
                  onPress={() =>
                    setSelectedExerciseMuscleFilter(
                      selectedExerciseMuscleFilter === 'RECOMMENDED' ? null : 'RECOMMENDED'
                    )
                  }
                >
                  <Text
                    className="text-[10px] font-bold"
                    style={{
                      color: selectedExerciseMuscleFilter === 'RECOMMENDED' ? '#000' : '#22c55e',
                    }}
                  >
                    🎯 REC
                  </Text>
                </TouchableOpacity>
              )}

              {MUSCLE_GROUPS.map((group) => {
                const isSelected = selectedExerciseMuscleFilter === group.name;
                const isDayMuscle = selectedMuscleGroups.includes(group.name);
                return (
                  <TouchableOpacity
                    key={group.id}
                    className="px-2.5 py-1 rounded-full"
                    style={{
                      backgroundColor: isSelected ? group.color : '#27272a',
                      borderWidth: 1,
                      borderColor: isSelected
                        ? group.color
                        : isDayMuscle
                          ? group.color + '80'
                          : '#3f3f46',
                    }}
                    onPress={() => setSelectedExerciseMuscleFilter(isSelected ? null : group.name)}
                  >
                    <Text
                      className="text-[10px] font-bold"
                      style={{ color: isSelected ? '#000' : isDayMuscle ? group.color : '#a1a1aa' }}
                    >
                      {group.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Search */}
            <View className="flex-row items-center bg-zinc-800 rounded-lg px-3 py-2 mb-3">
              <Search size={18} color={COLORS.zinc400} />
              <TextInput
                className="flex-1 text-white ml-2 font-mono"
                placeholder="Buscar ejercicio..."
                placeholderTextColor={COLORS.zinc400}
                value={exerciseSearchQuery}
                onChangeText={setExerciseSearchQuery}
              />
              {exerciseSearchQuery && (
                <TouchableOpacity onPress={() => setExerciseSearchQuery('')}>
                  <X size={16} color={COLORS.zinc400} />
                </TouchableOpacity>
              )}
            </View>

            {/* Results count */}
            <Text className="text-zinc-400 text-xs font-mono mb-2">
              {filteredDbExercises.length} ejercicios disponibles
            </Text>

            {/* Exercise List */}
            {loadingExercises ? (
              <View className="flex-1 items-center justify-center">
                <ActivityIndicator size="large" color={COLORS.blue} />
              </View>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false} className="flex-1">
                {filteredDbExercises.map((ex) => {
                  // Verificar si es recomendado para el día
                  const exMuscle = ex.muscle_group?.toUpperCase() || '';
                  const exSecondary = ex.secondary_muscles?.map((m) => m.toUpperCase()) || [];
                  const isRecommended = selectedMuscleGroups.some(
                    (dayMuscle) =>
                      musclesMatch(exMuscle, dayMuscle) ||
                      exSecondary.some((s) => musclesMatch(s, dayMuscle))
                  );

                  return (
                    <TouchableOpacity
                      key={ex.id}
                      className="flex-row items-center p-3 rounded-lg mb-2"
                      style={{
                        backgroundColor: isRecommended ? '#22c55e15' : '#27272a',
                        borderWidth: isRecommended ? 1 : 0,
                        borderColor: isRecommended ? '#22c55e50' : 'transparent',
                      }}
                      onPress={() => selectExercise(ex)}
                    >
                      {/* Thumbnail */}
                      <View className="w-14 h-14 bg-zinc-700 rounded-lg overflow-hidden mr-3 relative">
                        {ex.thumbnail_url ? (
                          <Image
                            source={{ uri: ex.thumbnail_url }}
                            className="w-full h-full"
                            resizeMode="cover"
                          />
                        ) : (
                          <View className="w-full h-full items-center justify-center">
                            <Dumbbell size={20} color={COLORS.zinc400} />
                          </View>
                        )}
                        {isRecommended && (
                          <View className="absolute top-0 right-0 bg-green-500 px-1 py-0.5 rounded-bl">
                            <Text className="text-[8px] font-bold text-black">🎯</Text>
                          </View>
                        )}
                      </View>

                      {/* Info */}
                      <View className="flex-1">
                        <View className="flex-row items-center">
                          <Text
                            className="font-bold"
                            style={{ color: isRecommended ? '#22c55e' : '#fff' }}
                            numberOfLines={1}
                          >
                            {ex.name}
                          </Text>
                          {isRecommended && (
                            <View className="ml-2 bg-green-500/20 px-1.5 py-0.5 rounded">
                              <Text className="text-green-400 text-[10px] font-bold">REC</Text>
                            </View>
                          )}
                        </View>
                        <Text className="text-zinc-400 text-xs font-mono">{ex.muscle_group}</Text>
                        {ex.secondary_muscles?.length > 0 && (
                          <Text className="text-zinc-500 text-[10px]">
                            + {ex.secondary_muscles.join(', ')}
                          </Text>
                        )}
                      </View>

                      <Plus size={20} color={isRecommended ? COLORS.green : COLORS.zinc400} />
                    </TouchableOpacity>
                  );
                })}
                <View style={{ height: 100 }} />
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* ===== SERIES EDITOR MODAL ===== */}
      <Modal visible={seriesEditorVisible} animationType="slide" transparent>
        <View className="flex-1 bg-black/95 pt-12">
          <View className="flex-1 px-4">
            {/* Header */}
            <View className="flex-row items-center justify-between mb-4">
              <View className="flex-1">
                <Text className="text-white font-bold text-lg" numberOfLines={1}>
                  {currentExercise?.name}
                </Text>
                <Text className="text-zinc-400 text-xs">Configurar series y repeticiones</Text>
              </View>
              <TouchableOpacity onPress={() => setSeriesEditorVisible(false)}>
                <X size={24} color={COLORS.zinc400} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} className="flex-1">
              {/* Notas del ejercicio (instrucciones del coach) */}
              <View className="bg-zinc-800 p-3 rounded-lg mb-3">
                <Text className="text-zinc-400 text-xs font-mono mb-2">
                  📝 NOTAS DEL EJERCICIO (visible al alumno)
                </Text>
                <TextInput
                  className="bg-zinc-900 text-white p-2 rounded text-xs font-mono"
                  placeholder="Técnica, rango de movimiento, contraindicaciones..."
                  placeholderTextColor={COLORS.zinc400}
                  value={currentExercise?.notes || ''}
                  onChangeText={updateExerciseNotes}
                  multiline
                  numberOfLines={2}
                  maxLength={500}
                />
              </View>

              {/* Rest time */}
              <View className="bg-zinc-800 p-3 rounded-lg mb-4">
                <View className="flex-row items-center mb-2">
                  <Clock size={16} color={COLORS.blue} />
                  <Text className="text-white font-bold ml-2">TIEMPO DE DESCANSO</Text>
                </View>
                <View className="flex-row gap-2">
                  {['60s', '90s', '120s', '180s'].map((time) => (
                    <TouchableOpacity
                      key={time}
                      className="flex-1 py-2 rounded-lg items-center"
                      style={{
                        backgroundColor: currentExercise?.rest === time ? COLORS.blue : '#3f3f46',
                      }}
                      onPress={() => updateRest(time)}
                    >
                      <Text
                        className="font-bold"
                        style={{
                          color: currentExercise?.rest === time ? '#000' : '#a1a1aa',
                        }}
                      >
                        {time}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Series List */}
              <Text className="text-zinc-400 text-xs font-mono mb-2">
                SERIES ({currentExercise?.series?.length || 0})
              </Text>

              {currentExercise?.series?.map((series, i) => {
                const config = SERIES_TYPES.find((t) => t.type === series.type);
                return (
                  <View
                    key={series.id}
                    className="bg-zinc-800 p-3 rounded-lg mb-2 border-l-4"
                    style={{ borderLeftColor: config?.color || '#3f3f46' }}
                  >
                    <View className="flex-row items-center justify-between mb-2">
                      <View className="flex-row items-center">
                        <View
                          className="px-2 py-1 rounded mr-2"
                          style={{ backgroundColor: config?.color }}
                        >
                          <Text className="text-black text-xs font-bold">{i + 1}</Text>
                        </View>
                        <Text className="text-white font-bold text-sm">{config?.label}</Text>
                      </View>
                      <TouchableOpacity onPress={() => removeSeries(i)} className="p-1">
                        <Trash2 size={16} color={COLORS.red} />
                      </TouchableOpacity>
                    </View>

                    {/* Reps control */}
                    <View className="flex-row items-center justify-between">
                      <Text className="text-zinc-400 text-xs">REPETICIONES:</Text>
                      <View className="flex-row items-center bg-zinc-700 rounded-lg">
                        <TouchableOpacity
                          className="px-3 py-2"
                          onPress={() => updateSeriesReps(i, Math.max(1, series.reps - 1))}
                        >
                          <Minus size={16} color={COLORS.white} />
                        </TouchableOpacity>
                        <Text className="text-white font-bold text-lg px-3">{series.reps}</Text>
                        <TouchableOpacity
                          className="px-3 py-2"
                          onPress={() => updateSeriesReps(i, series.reps + 1)}
                        >
                          <Plus size={16} color={COLORS.white} />
                        </TouchableOpacity>
                      </View>
                    </View>

                    {/* Peso / Tempo / RPE */}
                    <View className="flex-row gap-2 mt-2">
                      <View className="flex-1">
                        <Text className="text-zinc-500 text-[9px] font-mono mb-0.5">PESO</Text>
                        <TextInput
                          className="bg-zinc-700 text-white p-1.5 rounded text-xs font-mono"
                          placeholder="60kg / BW"
                          placeholderTextColor={COLORS.zinc400}
                          value={series.weight || ''}
                          onChangeText={(text) => updateSeriesWeight(i, text)}
                          maxLength={12}
                        />
                      </View>
                      <View className="flex-1">
                        <Text className="text-zinc-500 text-[9px] font-mono mb-0.5">TEMPO</Text>
                        <TextInput
                          className="bg-zinc-700 text-white p-1.5 rounded text-xs font-mono"
                          placeholder="3-1-1-0"
                          placeholderTextColor={COLORS.zinc400}
                          value={series.tempo || ''}
                          onChangeText={(text) => updateSeriesTempo(i, text)}
                          maxLength={12}
                        />
                      </View>
                      <View className="w-16">
                        <Text className="text-zinc-500 text-[9px] font-mono mb-0.5">RPE</Text>
                        <TextInput
                          className="bg-zinc-700 text-white p-1.5 rounded text-xs font-mono"
                          placeholder="8"
                          placeholderTextColor={COLORS.zinc400}
                          value={series.rpe || ''}
                          onChangeText={(text) => updateSeriesRpe(i, text)}
                          keyboardType="numeric"
                          maxLength={4}
                        />
                      </View>
                    </View>

                    {/* Note */}
                    <TextInput
                      className="bg-zinc-700 text-white p-2 rounded mt-2 text-xs font-mono"
                      placeholder="Nota (opcional)..."
                      placeholderTextColor={COLORS.zinc400}
                      value={series.note}
                      onChangeText={(text) => updateSeriesNote(i, text)}
                    />
                  </View>
                );
              })}

              {/* Add Series Buttons */}
              <View className="mt-4">
                <Text className="text-zinc-400 text-xs font-mono mb-2">AGREGAR SERIE:</Text>
                <View className="flex-row flex-wrap gap-2">
                  {SERIES_TYPES.map((type) => (
                    <TouchableOpacity
                      key={type.type}
                      className="px-3 py-2 rounded-lg"
                      style={{ backgroundColor: type.color }}
                      onPress={() => addSeries(type.type)}
                    >
                      <Text className="text-black text-xs font-bold">{type.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={{ height: 120 }} />
            </ScrollView>

            {/* Save Button */}
            <View className="absolute bottom-0 left-0 right-0 p-4 bg-zinc-900 border-t border-zinc-800">
              <TouchableOpacity
                className="bg-green-600 py-4 rounded-lg flex-row items-center justify-center"
                onPress={saveSeriesConfig}
              >
                <Check size={20} color={COLORS.white} />
                <Text className="text-white font-bold ml-2">GUARDAR CONFIGURACIÓN</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
