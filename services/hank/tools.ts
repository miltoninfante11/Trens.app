// ============================================================================
// HANK TOOLS - Las 'manos' de la IA (Conexión con Supabase)
// Sistema completo de herramientas para el Agente HANK
// ============================================================================

import { supabase } from '../../lib/supabase';
import { distributeWeekdays } from '../../lib/weekday';
import type { HankToolResult, ToolDefinition } from '../../types/hank';
import { calculateMacrosWithAI } from './nutrition';
import { spotify } from '../spotify/spotify';
import {
  analyzeIngredientsAdvanced,
  getSubstitutionSuggestions,
  checkAllergens,
  optimizeMealForMacros,
} from './ingredientAnalyzerAI';
import {
  analyzeProgressPhoto,
  compareProgressPhotos,
  analyzeFoodPhoto,
  generateProgressTimeline,
} from './visualAnalyzer';

// ============================================================================
// TIPOS INTERNOS
// ============================================================================
interface UserAsset {
  id: string;
  user_id: string;
  asset_type: string;
  name: string;
  asset_url?: string;
  metadata?: Record<string, unknown>;
  training_days?: number[];
  order?: number;
  deleted_at?: string | null;
}

interface AssetTemplate {
  id: string;
  asset_type: string;
  name: string;
  description?: string;
  image_url?: string;
  default_metadata?: Record<string, unknown>;
  category?: string;
  difficulty?: string;
}

type SeriesTypeSpanish = 'CALENTAMIENTO' | 'APROXIMACION' | 'EFECTIVA' | 'FALLO';
type SeriesTypeEnglish = 'WARMUP' | 'APPROACH' | 'EFFECTIVE' | 'FAILURE';

interface SeriesConfig {
  id: string;
  reps: number;
  weight: number;
  type: SeriesTypeSpanish;
  note?: string;
  // Campos avanzados para control profundo
  rir?: number; // Reps In Reserve (0-5, donde 0 = fallo)
  tempo?: string; // Formato "3-1-2-0" (excéntrico-pausa abajo-concéntrico-pausa arriba)
  restSeconds?: number; // Descanso después de esta serie en segundos
}

// Mapeo de tipos de series inglés -> español
const mapSeriesType = (type: SeriesTypeEnglish | string): SeriesTypeSpanish => {
  const mapping: Record<string, SeriesTypeSpanish> = {
    WARMUP: 'CALENTAMIENTO',
    APPROACH: 'APROXIMACION',
    EFFECTIVE: 'EFECTIVA',
    FAILURE: 'FALLO',
    // También aceptar español directamente
    CALENTAMIENTO: 'CALENTAMIENTO',
    APROXIMACION: 'APROXIMACION',
    EFECTIVA: 'EFECTIVA',
    FALLO: 'FALLO',
  };
  return mapping[type] || 'EFECTIVA';
};

// Convertir series custom a SeriesConfig con ids
const toSeriesConfig = (
  series: Array<{ reps: number; weight: number; type: string }>
): SeriesConfig[] => {
  return series.map((s, i) => ({
    id: String(Date.now() + i),
    reps: s.reps,
    weight: s.weight,
    type: mapSeriesType(s.type),
  }));
};

// Tipo para resultado de búsqueda de ejercicio
interface ExerciseConfigResult {
  id: string;
  exerciseId: string;
  name: string;
  config: Record<string, unknown>;
  trainingDays: number[];
}

// ============================================================================
// HELPER: Buscar ejercicio por configId (PREFERIDO - estable)
// ============================================================================
async function findExerciseConfigById(configId: string): Promise<ExerciseConfigResult | null> {
  const { data, error } = await supabase
    .from('user_exercise_config')
    .select(
      `
      id,
      exercise_id,
      training_days,
      config,
      exercises!inner (
        name
      )
    `
    )
    .eq('id', configId)
    .single();

  if (error || !data) {
    console.warn(`🔍 findExerciseConfigById: No encontrado configId="${configId}"`);
    return null;
  }

  const result = data as unknown as {
    id: string;
    exercise_id: string;
    training_days: number[];
    config: Record<string, unknown>;
    exercises: { name: string };
  };

  console.warn(`✅ findExerciseConfigById: Encontrado "${result.exercises.name}" por configId`);
  return {
    id: result.id,
    exerciseId: result.exercise_id,
    name: result.exercises.name,
    config: result.config || {},
    trainingDays: result.training_days || [],
  };
}

// ============================================================================
// HELPER: Buscar ejercicio por configId O nombre (con fallback)
// ============================================================================
async function findExerciseConfigFlexible(
  userId: string,
  configId?: string,
  assetName?: string
): Promise<ExerciseConfigResult | null> {
  // 1. Si hay configId, usarlo directamente (PREFERIDO)
  if (configId && configId.length > 30) {
    const result = await findExerciseConfigById(configId);
    if (result) return result;
  }

  // 2. Fallback: buscar por nombre
  if (assetName) {
    return findExerciseConfig(userId, assetName);
  }

  console.warn('⚠️ findExerciseConfigFlexible: No se proporcionó configId ni assetName');
  return null;
}

// ============================================================================
// HELPER: Buscar ejercicio en user_exercise_config
// También busca en alternativas y devuelve la config del ejercicio principal
// ============================================================================
async function findExerciseConfig(
  userId: string,
  assetName: string
): Promise<ExerciseConfigResult | null> {
  // Normalizar el nombre para búsqueda flexible
  const normalizedName = assetName
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Quitar acentos
    .trim();

  console.warn(`🔍 findExerciseConfig: Buscando "${assetName}" (normalizado: "${normalizedName}")`);

  // 1. Primero buscar en ejercicios principales - búsqueda exacta parcial
  const { data, error } = await supabase
    .from('user_exercise_config')
    .select(
      `
      id,
      exercise_id,
      training_days,
      config,
      exercises!inner (
        name
      )
    `
    )
    .eq('user_id', userId)
    .ilike('exercises.name', `%${assetName}%`)
    .limit(1)
    .maybeSingle();

  if (!error && data) {
    const result = data as unknown as {
      id: string;
      exercise_id: string;
      training_days: number[];
      config: Record<string, unknown>;
      exercises: { name: string };
    };

    console.warn(`✅ findExerciseConfig: Encontrado directamente: "${result.exercises.name}"`);
    return {
      id: result.id,
      exerciseId: result.exercise_id,
      name: result.exercises.name,
      config: result.config || {},
      trainingDays: result.training_days || [],
    };
  }

  // 2. Búsqueda por palabras clave - buscar ejercicios que contengan palabras del nombre
  const keywords = normalizedName.split(/\s+/).filter((w) => w.length > 2);
  console.warn(`🔍 findExerciseConfig: Buscando por keywords: ${keywords.join(', ')}`);

  if (keywords.length > 0) {
    // Obtener todos los ejercicios del usuario y filtrar en memoria
    const { data: allConfigs } = await supabase
      .from('user_exercise_config')
      .select(
        `
        id,
        exercise_id,
        training_days,
        config,
        exercises!inner (
          name
        )
      `
      )
      .eq('user_id', userId);

    if (allConfigs && allConfigs.length > 0) {
      // Buscar el ejercicio que mejor coincida con las keywords
      for (const config of allConfigs) {
        const result = config as unknown as {
          id: string;
          exercise_id: string;
          training_days: number[];
          config: Record<string, unknown>;
          exercises: { name: string };
        };

        const exerciseNameNorm = result.exercises.name
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '');

        // Verificar si al menos 2 keywords coinciden (o 1 si solo hay 1 keyword)
        const minMatches = Math.min(2, keywords.length);
        const matchCount = keywords.filter((kw) => exerciseNameNorm.includes(kw)).length;

        if (matchCount >= minMatches) {
          console.warn(
            `✅ findExerciseConfig: Encontrado por keywords (${matchCount}/${keywords.length}): "${result.exercises.name}"`
          );
          return {
            id: result.id,
            exerciseId: result.exercise_id,
            name: result.exercises.name,
            config: result.config || {},
            trainingDays: result.training_days || [],
          };
        }
      }
    }
  }

  // 3. Si no se encontró, buscar en alternativas
  // Las alternativas comparten la config del ejercicio principal
  console.warn(
    `🔍 findExerciseConfig: No encontrado como principal, buscando en alternativas: "${assetName}"`
  );

  // Buscar el ejercicio alternativo por nombre - primero intento exacto, luego por keywords
  let altExercise: { id: string; name: string } | null = null;

  const { data: exactAlt } = await supabase
    .from('exercises')
    .select('id, name')
    .ilike('name', `%${assetName}%`)
    .limit(1)
    .maybeSingle();

  if (exactAlt) {
    altExercise = exactAlt;
  } else if (keywords.length > 0) {
    // Buscar por keywords en el catálogo
    const { data: allExercises } = await supabase.from('exercises').select('id, name').limit(200);

    if (allExercises) {
      for (const ex of allExercises) {
        const exNameNorm = ex.name
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '');
        const minMatches = Math.min(2, keywords.length);
        const matchCount = keywords.filter((kw) => exNameNorm.includes(kw)).length;

        if (matchCount >= minMatches) {
          altExercise = ex;
          console.warn(
            `✅ findExerciseConfig: Ejercicio encontrado en catálogo por keywords: "${ex.name}"`
          );
          break;
        }
      }
    }
  }

  if (!altExercise) {
    console.warn(`🔍 findExerciseConfig: Ejercicio "${assetName}" no existe en catálogo`);
    return null;
  }

  // Buscar si este ejercicio está configurado como alternativa de algún ejercicio principal
  const { data: altConfig } = await supabase
    .from('user_exercise_config')
    .select(
      `
      id,
      exercise_id,
      training_days,
      config,
      alternatives,
      exercises!inner (
        name
      )
    `
    )
    .eq('user_id', userId)
    .contains('alternatives', [altExercise.id])
    .limit(1)
    .maybeSingle();

  if (altConfig) {
    const result = altConfig as unknown as {
      id: string;
      exercise_id: string;
      training_days: number[];
      config: Record<string, unknown>;
      exercises: { name: string };
    };

    console.warn(
      `🔍 findExerciseConfig: "${assetName}" es alternativa de "${result.exercises.name}", usando su config`
    );

    return {
      id: result.id,
      exerciseId: result.exercise_id,
      name: result.exercises.name, // Nombre del ejercicio principal (para logs)
      config: result.config || {},
      trainingDays: result.training_days || [],
    };
  }

  console.warn(
    `🔍 findExerciseConfig: "${assetName}" no es alternativa de ningún ejercicio configurado`
  );
  return null;
}

// ============================================================================
// HELPERS: Series por día
// ============================================================================

/**
 * Obtiene las series de un ejercicio para un día específico.
 * Maneja migración automática de custom_series legacy a series_by_day.
 */
function getSeriesForDay(metadata: Record<string, unknown>, trainingDay: number): SeriesConfig[] {
  // Nueva estructura: series_by_day
  const seriesByDay = metadata.series_by_day as Record<string, SeriesConfig[]> | undefined;
  if (seriesByDay && seriesByDay[String(trainingDay)]) {
    return seriesByDay[String(trainingDay)];
  }

  // Fallback: estructura legacy custom_series (mismas series para todos los días)
  const legacySeries = metadata.custom_series as SeriesConfig[] | undefined;
  if (legacySeries && legacySeries.length > 0) {
    return legacySeries;
  }

  // Default vacío
  return [];
}

/**
 * Establece las series de un ejercicio para un día específico.
 * Solo actualiza series_by_day - NO sobrescribir custom_series para evitar contaminación entre días.
 */
function setSeriesForDay(
  metadata: Record<string, unknown>,
  trainingDay: number,
  series: SeriesConfig[]
): Record<string, unknown> {
  // Inicializar series_by_day si no existe
  if (!metadata.series_by_day) {
    metadata.series_by_day = {};
  }

  const seriesByDay = metadata.series_by_day as Record<string, SeriesConfig[]>;
  seriesByDay[String(trainingDay)] = series;

  // NO actualizar custom_series - cada día tiene sus propias series
  // custom_series solo se mantiene como fallback de migración para datos antiguos

  return metadata;
}

/**
 * Series por defecto para un ejercicio nuevo
 */
function getDefaultSeries(): SeriesConfig[] {
  return [
    { id: '1', reps: 12, type: 'CALENTAMIENTO', weight: 0 },
    { id: '2', reps: 10, type: 'EFECTIVA', weight: 0 },
    { id: '3', reps: 10, type: 'EFECTIVA', weight: 0 },
    { id: '4', reps: 10, type: 'EFECTIVA', weight: 0 },
  ];
}

/**
 * Series automáticas según nivel del usuario
 */
function getSeriesByLevel(level: string = 'INTERMEDIATE'): SeriesConfig[] {
  const structures: Record<string, SeriesConfig[]> = {
    BEGINNER: [
      { id: '1', reps: 12, type: 'CALENTAMIENTO', weight: 0 },
      { id: '2', reps: 10, type: 'EFECTIVA', weight: 0 },
      { id: '3', reps: 10, type: 'EFECTIVA', weight: 0 },
      { id: '4', reps: 10, type: 'EFECTIVA', weight: 0 },
    ],
    INTERMEDIATE: [
      { id: '1', reps: 12, type: 'CALENTAMIENTO', weight: 0 },
      { id: '2', reps: 10, type: 'APROXIMACION', weight: 0 },
      { id: '3', reps: 8, type: 'EFECTIVA', weight: 0 },
      { id: '4', reps: 8, type: 'EFECTIVA', weight: 0 },
      { id: '5', reps: 8, type: 'EFECTIVA', weight: 0 },
    ],
    ADVANCED: [
      { id: '1', reps: 12, type: 'CALENTAMIENTO', weight: 0 },
      { id: '2', reps: 8, type: 'APROXIMACION', weight: 0 },
      { id: '3', reps: 6, type: 'APROXIMACION', weight: 0 },
      { id: '4', reps: 6, type: 'EFECTIVA', weight: 0 },
      { id: '5', reps: 6, type: 'EFECTIVA', weight: 0 },
      { id: '6', reps: 6, type: 'EFECTIVA', weight: 0 },
      { id: '7', reps: 12, type: 'FALLO', weight: 0 },
    ],
    PRO: [
      { id: '1', reps: 15, type: 'CALENTAMIENTO', weight: 0 },
      { id: '2', reps: 10, type: 'APROXIMACION', weight: 0 },
      { id: '3', reps: 8, type: 'APROXIMACION', weight: 0 },
      { id: '4', reps: 5, type: 'EFECTIVA', weight: 0 },
      { id: '5', reps: 5, type: 'EFECTIVA', weight: 0 },
      { id: '6', reps: 5, type: 'EFECTIVA', weight: 0 },
      { id: '7', reps: 15, type: 'FALLO', weight: 0 },
    ],
  };
  return structures[level] || structures.INTERMEDIATE;
}

// ============================================================================
// GYM TOOL: Agregar Ejercicio (NUEVA ARQUITECTURA: exercises + user_exercise_config)
// ============================================================================
export async function gymAddExercise(
  userId: string,
  exerciseName: string,
  trainingDay: number,
  customSeries?: Array<{ reps: number; weight: number; type: string }>,
  userLevel?: string,
  sessionIndex: number = 0 // 0 = Sesión A, 1 = Sesión B (doble sesión)
): Promise<HankToolResult> {
  try {
    // NUEVA ARQUITECTURA: Buscar en tabla exercises (catálogo global)
    const { data: exercise, error: exerciseError } = await supabase
      .from('exercises')
      .select('*')
      .eq('is_active', true)
      .ilike('name', `%${exerciseName}%`)
      .limit(1)
      .single();

    if (exerciseError || !exercise) {
      // Fallback: buscar coincidencia parcial más amplia
      const { data: exercises } = await supabase
        .from('exercises')
        .select('*')
        .eq('is_active', true)
        .order('name');

      const match = exercises?.find((e) =>
        e.name.toLowerCase().includes(exerciseName.toLowerCase())
      );

      if (!match) {
        return {
          success: false,
          message: `No encontré el ejercicio "${exerciseName}" en el catálogo. Intenta con el nombre exacto.`,
        };
      }
      // Usar el match encontrado
      return gymAddExercise(userId, match.name, trainingDay, customSeries, userLevel, sessionIndex);
    }

    const sessionLabel = sessionIndex === 1 ? ' (Sesión B)' : '';

    // Verificar si ya existe user_exercise_config para este ejercicio EN ESTA SESIÓN
    // Importante: el mismo ejercicio puede estar en Sesión A y Sesión B del mismo día
    const { data: existingConfig } = await supabase
      .from('user_exercise_config')
      .select('id, training_days, config')
      .eq('user_id', userId)
      .eq('exercise_id', exercise.id)
      .eq('session_index', sessionIndex)
      .maybeSingle();

    if (existingConfig) {
      const currentDays = existingConfig.training_days || [];
      if (currentDays.includes(trainingDay)) {
        return {
          success: false,
          message: `${exercise.name} ya está en el día ${trainingDay + 1}${sessionLabel}.`,
        };
      }

      // Agregar día al array
      const updatedDays = [...new Set([...currentDays, trainingDay])].sort((a, b) => a - b);

      // Copiar series del día existente o crear nuevas
      const currentConfig = existingConfig.config || {};
      const seriesByDay = (currentConfig.series_by_day as Record<string, SeriesConfig[]>) || {};
      const existingDaySeries = seriesByDay[String(currentDays[0])];
      seriesByDay[String(trainingDay)] = customSeries
        ? toSeriesConfig(customSeries)
        : existingDaySeries || getSeriesByLevel(userLevel);

      const { error } = await supabase
        .from('user_exercise_config')
        .update({
          training_days: updatedDays,
          config: { ...currentConfig, series_by_day: seriesByDay },
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingConfig.id);

      if (error) throw error;

      return {
        success: true,
        message: `✅ ${exercise.name} añadido al día ${trainingDay + 1}${sessionLabel}`,
        affectedRecords: 1,
      };
    }

    // Crear nueva configuración de usuario
    const autoSeries = customSeries ? toSeriesConfig(customSeries) : getSeriesByLevel(userLevel);
    const seriesByDay: Record<string, SeriesConfig[]> = {
      [String(trainingDay)]: autoSeries,
    };

    const { data, error } = await supabase
      .from('user_exercise_config')
      .insert({
        user_id: userId,
        exercise_id: exercise.id,
        training_days: [trainingDay],
        session_index: sessionIndex,
        display_order: 0,
        config: {
          sets: `${autoSeries.length}x10`,
          rest: '90s',
          series_by_day: seriesByDay,
          custom_series: autoSeries,
        },
      })
      .select()
      .single();

    if (error) throw error;

    return {
      success: true,
      message: `✅ ${exercise.name} agregado al día ${trainingDay + 1}${sessionLabel} con ${autoSeries.length} series`,
      data: { exerciseId: data.id, exerciseName: exercise.name, sessionIndex },
      affectedRecords: 1,
    };
  } catch (error) {
    console.error('gymAddExercise error:', error);
    return { success: false, message: 'Error al agregar ejercicio.' };
  }
}

// ============================================================================
// GYM TOOL: Eliminar Ejercicio (NUEVA ARQUITECTURA)
// ============================================================================
export async function gymRemoveExercise(
  userId: string,
  exerciseName: string,
  trainingDay?: number,
  deleteCompletely = false,
  sessionIndex?: number // Si se especifica, solo eliminar de esa sesión
): Promise<HankToolResult> {
  try {
    // NUEVA ARQUITECTURA: Buscar en user_exercise_config con join a exercises
    let query = supabase
      .from('user_exercise_config')
      .select(
        `
        id,
        training_days,
        session_index,
        exercises!inner (
          name
        )
      `
      )
      .eq('user_id', userId)
      .ilike('exercises.name', `%${exerciseName}%`);

    // Si se especifica sesión, filtrar por ella
    if (sessionIndex !== undefined) {
      query = query.eq('session_index', sessionIndex);
    }

    const { data: config, error } = await query.limit(1).single();

    if (error || !config) {
      return {
        success: false,
        message: `No encontré "${exerciseName}" en tu rutina${sessionIndex === 1 ? ' (Sesión B)' : ''}.`,
      };
    }

    const typedConfig = config as unknown as {
      id: string;
      training_days: number[];
      session_index: number | null;
      exercises: { name: string };
    };

    const exerciseRealName = typedConfig.exercises.name;
    const sessionLabel = (typedConfig.session_index ?? 0) === 1 ? ' (Sesión B)' : '';

    if (deleteCompletely || trainingDay === undefined) {
      // Eliminar completamente
      const { error: deleteError } = await supabase
        .from('user_exercise_config')
        .delete()
        .eq('id', typedConfig.id);

      if (deleteError) throw deleteError;

      return {
        success: true,
        message: `🗑️ ${exerciseRealName}${sessionLabel} eliminado de tu rutina`,
        rollbackId: typedConfig.id,
        affectedRecords: 1,
      };
    }

    // Solo quitar de un día específico
    const currentDays = typedConfig.training_days || [];
    const updatedDays = currentDays.filter((d) => d !== trainingDay);

    if (updatedDays.length === 0) {
      // Era el único día, eliminar completamente
      const { error: deleteError } = await supabase
        .from('user_exercise_config')
        .delete()
        .eq('id', typedConfig.id);

      if (deleteError) throw deleteError;

      return {
        success: true,
        message: `🗑️ ${exerciseRealName}${sessionLabel} eliminado (era el único día)`,
        affectedRecords: 1,
      };
    }

    const { error: updateError } = await supabase
      .from('user_exercise_config')
      .update({ training_days: updatedDays })
      .eq('id', typedConfig.id);

    if (updateError) throw updateError;

    return {
      success: true,
      message: `✅ ${exerciseRealName}${sessionLabel} quitado del día ${trainingDay + 1}`,
      affectedRecords: 1,
    };
  } catch (error) {
    console.error('gymRemoveExercise error:', error);
    return { success: false, message: 'Error al eliminar ejercicio.' };
  }
}

// ============================================================================
// GYM TOOL: Reemplazar Ejercicio (NUEVA ARQUITECTURA)
// ============================================================================
export async function gymReplaceExercise(
  userId: string,
  oldExerciseName: string,
  newExerciseName: string,
  trainingDay?: number,
  userLevel?: string
): Promise<HankToolResult> {
  try {
    // 1. Buscar el ejercicio original en user_exercise_config
    const { data: oldConfig, error: findError } = await supabase
      .from('user_exercise_config')
      .select(
        `
        id,
        training_days,
        display_order,
        exercises!inner (
          name
        )
      `
      )
      .eq('user_id', userId)
      .ilike('exercises.name', `%${oldExerciseName}%`)
      .limit(1)
      .single();

    if (findError || !oldConfig) {
      return {
        success: false,
        message: `No encontré "${oldExerciseName}" en tu rutina.`,
      };
    }

    const typedOldConfig = oldConfig as unknown as {
      id: string;
      training_days: number[];
      display_order: number;
      exercises: { name: string };
    };

    const oldRealName = typedOldConfig.exercises.name;
    const oldTrainingDays = typedOldConfig.training_days || [];
    const oldOrder = typedOldConfig.display_order ?? 0;

    // Determinar el día correcto
    const targetDay =
      trainingDay !== undefined && oldTrainingDays.includes(trainingDay)
        ? trainingDay
        : (oldTrainingDays[0] ?? 0);

    console.log(`🔄 Reemplazando ${oldRealName} → ${newExerciseName} en día ${targetDay}`);

    // 2. Buscar el nuevo ejercicio en el catálogo global
    const { data: newExercise, error: exerciseError } = await supabase
      .from('exercises')
      .select('*')
      .eq('is_active', true)
      .ilike('name', `%${newExerciseName}%`)
      .limit(1)
      .single();

    if (exerciseError || !newExercise) {
      return {
        success: false,
        message: `No encontré el ejercicio "${newExerciseName}" en el catálogo.`,
      };
    }

    // 3. Verificar si el nuevo ejercicio ya existe en user_exercise_config
    const { data: existingNewConfig } = await supabase
      .from('user_exercise_config')
      .select('id, training_days, display_order')
      .eq('user_id', userId)
      .eq('exercise_id', newExercise.id)
      .maybeSingle();

    // 4. Eliminar/actualizar el ejercicio viejo
    if (oldTrainingDays.length === 1) {
      // Eliminar completamente
      await supabase.from('user_exercise_config').delete().eq('id', typedOldConfig.id);
    } else {
      // Solo quitar del día específico
      const updatedDays = oldTrainingDays.filter((d) => d !== targetDay);
      await supabase
        .from('user_exercise_config')
        .update({ training_days: updatedDays })
        .eq('id', typedOldConfig.id);
    }

    // 5. Agregar o actualizar el nuevo ejercicio
    if (existingNewConfig) {
      // El ejercicio ya existe, agregar el día
      const currentDays = existingNewConfig.training_days || [];
      const updatedDays = [...new Set([...currentDays, targetDay])].sort((a, b) => a - b);

      await supabase
        .from('user_exercise_config')
        .update({
          training_days: updatedDays,
          display_order: oldOrder,
        })
        .eq('id', existingNewConfig.id);
    } else {
      // Crear nueva configuración
      const autoSeries = getSeriesByLevel(userLevel);
      const seriesByDay: Record<string, SeriesConfig[]> = {
        [String(targetDay)]: autoSeries,
      };

      await supabase.from('user_exercise_config').insert({
        user_id: userId,
        exercise_id: newExercise.id,
        training_days: [targetDay],
        display_order: oldOrder,
        config: {
          sets: `${autoSeries.length}x10`,
          rest: '90s',
          series_by_day: seriesByDay,
          custom_series: autoSeries,
        },
      });
    }

    return {
      success: true,
      message: `✅ Cambiado: ${oldRealName} → ${newExercise.name} (día ${targetDay + 1})`,
      affectedRecords: 2,
    };
  } catch (error) {
    console.error('gymReplaceExercise error:', error);
    return { success: false, message: 'Error al reemplazar ejercicio.' };
  }
}

// ============================================================================
// GYM TOOL: Obtener Rutina del Día (nombre y ejercicios)
// ============================================================================
export async function gymGetTodayRoutine(
  userId: string,
  _trainingDayHint: number // Este hint puede estar desactualizado, calculamos el real
): Promise<HankToolResult> {
  try {
    // 1. Obtener datos del perfil
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('training_routine_names, training_last_access')
      .eq('id', userId)
      .single();

    if (profileError) {
      console.warn('gymGetTodayRoutine: Error obteniendo perfil:', profileError.message);
    }

    // Sistema weekday: 0=Dom..6=Sáb (estándar JS Date.getDay())
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayISO = today.toISOString();

    const trainingDay = new Date().getDay();
    const routineNames = (profile?.training_routine_names || {}) as Record<string, string>;
    const frequency = Object.values(routineNames).filter((v) => (v || '').trim().length > 0).length;

    // Refrescar last_access si pertinente
    if (
      !profile?.training_last_access ||
      new Date(profile.training_last_access).toISOString() !== todayISO
    ) {
      await supabase.from('profiles').update({ training_last_access: todayISO }).eq('id', userId);
    }

    const routineName = (routineNames[String(trainingDay)] || '').trim() || null;

    // 2. Obtener ejercicios del día desde user_exercise_config (incluir session_index)
    const { data: userConfigs, error: configError } = await supabase
      .from('user_exercise_config')
      .select(
        `
        id,
        exercise_id,
        training_days,
        session_index,
        display_order,
        exercises (
          name
        )
      `
      )
      .eq('user_id', userId)
      .contains('training_days', [trainingDay])
      .order('display_order', { ascending: true });

    if (configError) throw configError;

    // Separar por sesión
    const sessionAConfigs = (userConfigs || []).filter(
      (cfg: any) => (cfg.session_index ?? 0) === 0
    );
    const sessionBConfigs = (userConfigs || []).filter((cfg: any) => cfg.session_index === 1);
    const hasDualSession = sessionBConfigs.length > 0;

    const exerciseCount = sessionAConfigs.length;
    const exerciseNames = sessionAConfigs.map((cfg: any) => cfg.exercises?.name || 'Sin nombre');

    // 3. Construir mensaje
    let message = '';
    if (routineName) {
      message = `💪 Hoy toca: ${routineName}\n`;
    } else {
      message = `💪 Hoy es día de entrenamiento\n`;
    }

    if (hasDualSession) {
      // Mostrar ambas sesiones
      const nameBList = sessionBConfigs.map((cfg: any) => cfg.exercises?.name || 'Sin nombre');
      message += `\n⚡ DOBLE SESIÓN detectada:\n`;
      message += `\n💪 SESIÓN A (${exerciseCount} ejercicios):\n`;
      exerciseNames.forEach((name, i) => {
        message += `${i + 1}. ${name}\n`;
      });
      message += `\n🔥 SESIÓN B (${nameBList.length} ejercicios):\n`;
      nameBList.forEach((name: string, i: number) => {
        message += `${i + 1}. ${name}\n`;
      });
    } else if (exerciseCount > 0) {
      message += `\n🏋️ ${exerciseCount} ejercicios:\n`;
      exerciseNames.forEach((name, i) => {
        message += `${i + 1}. ${name}\n`;
      });
    } else {
      message += '\nNo tienes ejercicios programados. ¿Quieres que te agregue algunos?';
    }

    return {
      success: true,
      message: message.trim(),
      data: {
        routineName,
        trainingDay,
        frequency,
        exercises: exerciseNames,
        hasDualSession,
        sessionBExercises: hasDualSession
          ? sessionBConfigs.map((cfg: any) => cfg.exercises?.name || 'Sin nombre')
          : [],
      },
    };
  } catch (error) {
    console.error('gymGetTodayRoutine error:', error);
    return { success: false, message: 'Error al obtener la rutina del día.' };
  }
}

// ============================================================================
// GYM TOOL: Listar Ejercicios
// ============================================================================
export async function gymListExercises(
  userId: string,
  trainingDay?: number
): Promise<HankToolResult> {
  try {
    // Usar user_exercise_config (nueva arquitectura)
    const { data: userConfigs, error } = await supabase
      .from('user_exercise_config')
      .select(
        `
        id,
        exercise_id,
        training_days,
        session_index,
        display_order,
        config,
        exercises (
          name
        )
      `
      )
      .eq('user_id', userId)
      .order('display_order', { ascending: true });

    if (error) throw error;

    let exercises = (userConfigs || []) as unknown as Array<{
      id: string;
      exercise_id: string;
      training_days: number[];
      session_index: number | null;
      display_order: number;
      config: { custom_series?: Array<{ reps: number; weight: number; type: string }> };
      exercises: { name: string } | null;
    }>;

    if (trainingDay !== undefined) {
      exercises = exercises.filter((ex) => (ex.training_days || []).includes(trainingDay));
    }

    if (exercises.length === 0) {
      return {
        success: true,
        message:
          trainingDay !== undefined
            ? 'No tienes ejercicios programados para hoy. ¿Quieres que te agregue algunos?'
            : 'No tienes ejercicios en tu rutina todavía.',
        data: { exercises: [] },
      };
    }

    // Agrupar por sesión si hay doble sesión
    const sessionAExercises = exercises.filter((ex) => (ex.session_index ?? 0) === 0);
    const sessionBExercises = exercises.filter((ex) => ex.session_index === 1);
    const hasDualSession = sessionBExercises.length > 0;

    const formatExercise = (ex: (typeof exercises)[0], index: number) => {
      const series = ex.config?.custom_series;
      const seriesCount = series?.length || 0;
      const seriesInfo =
        series && series.length > 0
          ? series.map((s) => `${s.reps}×${s.weight}kg`).join(', ')
          : 'sin series';
      const name = ex.exercises?.name || 'Sin nombre';
      return `${index + 1}. ${name} (${seriesCount} series: ${seriesInfo})`;
    };

    let message = '';
    if (hasDualSession && trainingDay !== undefined) {
      const listA = sessionAExercises.map(formatExercise).join('\n');
      const listB = sessionBExercises.map(formatExercise).join('\n');
      message = `🏋️ Hoy tienes DOBLE SESIÓN:\n\n💪 SESIÓN A (${sessionAExercises.length} ejercicios):\n${listA}\n\n🔥 SESIÓN B (${sessionBExercises.length} ejercicios):\n${listB}`;
    } else {
      const exerciseList = exercises.map(formatExercise);
      message =
        trainingDay !== undefined
          ? `🏋️ Hoy te toca:\n${exerciseList.join('\n')}`
          : `📋 Tu rutina completa:\n${exerciseList.join('\n')}`;
    }

    return {
      success: true,
      message,
      data: {
        exercises: exercises.map((ex) => ({
          name: ex.exercises?.name || 'Sin nombre',
          series: ex.config?.custom_series?.length || 0,
          sessionIndex: ex.session_index ?? 0,
        })),
        hasDualSession,
      },
    };
  } catch (error) {
    console.error('gymListExercises error:', error);
    return { success: false, message: 'Error al listar ejercicios.' };
  }
}

// ============================================================================
// GYM TOOL: Obtener Detalles Completos de un Ejercicio
// ============================================================================
export async function gymGetExerciseDetails(
  userId: string,
  exerciseName: string,
  trainingDay?: number
): Promise<HankToolResult> {
  try {
    const exercise = await findExerciseConfig(userId, exerciseName);

    if (!exercise) {
      return {
        success: false,
        message: `No encontré el ejercicio "${exerciseName}" en tu rutina.`,
      };
    }

    // Si se especifica un día, obtener las series de ese día
    // Si no, mostrar todas las configuraciones por día
    const allSeriesByDay: Record<string, SeriesConfig[]> = {};

    if (trainingDay !== undefined) {
      const series = getSeriesForDay(exercise.config, trainingDay);
      allSeriesByDay[String(trainingDay)] = series;
    } else {
      // Mostrar series de todos los días que tiene asignados
      for (const day of exercise.trainingDays) {
        const series = getSeriesForDay(exercise.config, day);
        allSeriesByDay[String(day)] = series;
      }
    }

    // Formatear para respuesta
    const dayDetails = Object.entries(allSeriesByDay)
      .map(([day, series]) => {
        const dayNum = parseInt(day) + 1;
        if (series.length === 0) {
          return `📅 Día ${dayNum}: Sin series configuradas`;
        }

        const seriesDetail = series
          .map((s, i) => {
            const parts = [`${i + 1}. ${s.reps} reps × ${s.weight}kg (${s.type})`];
            if (s.rir !== undefined) parts.push(`RIR:${s.rir}`);
            if (s.tempo) parts.push(`Tempo:${s.tempo}`);
            if (s.restSeconds) parts.push(`Desc:${s.restSeconds}s`);
            if (s.note) parts.push(`"${s.note}"`);
            return parts.join(' | ');
          })
          .join('\n   ');

        return `📅 Día ${dayNum}:\n   ${seriesDetail}`;
      })
      .join('\n\n');

    return {
      success: true,
      message: `🏋️ ${exercise.name}\n\n${dayDetails}`,
      data: {
        exerciseId: exercise.exerciseId,
        configId: exercise.id,
        name: exercise.name,
        trainingDays: exercise.trainingDays,
        seriesByDay: allSeriesByDay,
        config: exercise.config,
      },
    };
  } catch (error) {
    console.error('gymGetExerciseDetails error:', error);
    return { success: false, message: 'Error al obtener detalles del ejercicio.' };
  }
}

// ============================================================================
// GYM TOOL: Actualizar Detalle Específico de una Serie
// ============================================================================
export async function gymUpdateSeriesDetail(
  userId: string,
  exerciseName: string,
  seriesIndex: number | 'first' | 'last',
  trainingDay: number,
  updates: {
    reps?: number;
    weight?: number;
    type?: SeriesTypeEnglish | SeriesTypeSpanish;
    rir?: number;
    tempo?: string;
    restSeconds?: number;
    note?: string;
  }
): Promise<HankToolResult> {
  try {
    const exercise = await findExerciseConfig(userId, exerciseName);

    if (!exercise) {
      return { success: false, message: `No encontré el ejercicio "${exerciseName}".` };
    }

    const currentConfig = JSON.parse(JSON.stringify(exercise.config)) as Record<string, unknown>;
    const series = getSeriesForDay(currentConfig, trainingDay);

    if (series.length === 0) {
      return {
        success: false,
        message: `${exercise.name} no tiene series en día ${trainingDay + 1}.`,
      };
    }

    // Resolver índice
    let idx: number;
    if (seriesIndex === 'first') {
      idx = 0;
    } else if (seriesIndex === 'last') {
      idx = series.length - 1;
    } else {
      idx = seriesIndex;
    }

    if (idx < 0 || idx >= series.length) {
      return {
        success: false,
        message: `Serie ${idx + 1} no existe. Hay ${series.length} series.`,
      };
    }

    // Aplicar actualizaciones
    const target = series[idx];
    if (updates.reps !== undefined) target.reps = updates.reps;
    if (updates.weight !== undefined) target.weight = updates.weight;
    if (updates.type) target.type = mapSeriesType(updates.type);
    if (updates.rir !== undefined) target.rir = updates.rir;
    if (updates.tempo !== undefined) target.tempo = updates.tempo;
    if (updates.restSeconds !== undefined) target.restSeconds = updates.restSeconds;
    if (updates.note !== undefined) target.note = updates.note;

    // Guardar
    setSeriesForDay(currentConfig, trainingDay, series);

    const { error: updateError } = await supabase
      .from('user_exercise_config')
      .update({ config: currentConfig })
      .eq('id', exercise.id);

    if (updateError) throw updateError;

    // Construir mensaje de confirmación
    const changedFields = Object.entries(updates)
      .filter(([_, v]) => v !== undefined)
      .map(([k, v]) => `${k}: ${v}`)
      .join(', ');

    return {
      success: true,
      message: `✅ ${exercise.name} serie ${idx + 1} actualizada: ${changedFields}`,
      data: {
        exerciseId: exercise.exerciseId,
        seriesIndex: idx,
        updatedSeries: target,
      },
      affectedRecords: 1,
    };
  } catch (error) {
    console.error('gymUpdateSeriesDetail error:', error);
    return { success: false, message: 'Error al actualizar la serie.' };
  }
}

// ============================================================================
// GYM TOOL: Crear Grupo de Ejercicios (Super Serie, Tri-Serie, Circuito)
// ============================================================================
export async function gymCreateExerciseGroup(
  userId: string,
  exerciseNames: string[],
  groupType: 'SUPERSET' | 'TRISET' | 'CIRCUIT' | 'GIANT_SET',
  trainingDay: number,
  restBetween?: number,
  restAfter?: number
): Promise<HankToolResult> {
  try {
    // Buscar los exercise_config IDs para cada nombre
    const { data: configs, error: configError } = await supabase
      .from('user_exercise_config')
      .select('id, exercise_id, exercises!inner(name)')
      .eq('user_id', userId)
      .contains('training_days', [trainingDay]);

    if (configError || !configs || configs.length === 0) {
      return { success: false, message: 'No se encontraron ejercicios en este día.' };
    }

    // Mapear nombres a config IDs
    const matchedIds: string[] = [];
    const matchedNames: string[] = [];
    for (const name of exerciseNames) {
      const match = configs.find((c: Record<string, unknown>) =>
        (((c.exercises as Record<string, unknown>)?.name as string) || '')
          .toLowerCase()
          .includes(name.toLowerCase())
      );
      if (match) {
        matchedIds.push(match.id);
        matchedNames.push(((match as unknown as Record<string, unknown>)?.name as string) || name);
      }
    }

    if (matchedIds.length < 2) {
      return {
        success: false,
        message: `Solo se encontraron ${matchedIds.length} ejercicios. Se necesitan al menos 2 para crear un grupo.`,
      };
    }

    // Calcular descansos por defecto según tipo
    const defaults: Record<string, { rb: number; ra: number }> = {
      SUPERSET: { rb: 0, ra: 120 },
      TRISET: { rb: 0, ra: 120 },
      CIRCUIT: { rb: 15, ra: 90 },
      GIANT_SET: { rb: 0, ra: 150 },
    };
    const d = defaults[groupType] || defaults.SUPERSET;

    const newGroup = {
      id: `grp-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
      type: groupType,
      exercise_ids: matchedIds,
      rest_between: restBetween ?? d.rb,
      rest_after: restAfter ?? d.ra,
    };

    // Leer grupos existentes
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('exercise_groups')
      .eq('user_id', userId)
      .single();

    const allGroups = (profile?.exercise_groups as Record<string, unknown[]>) || {};
    const dayGroups = (allGroups[String(trainingDay)] || []) as Record<string, unknown>[];

    // Verificar que ningún ejercicio ya esté en otro grupo
    for (const dg of dayGroups) {
      const existingIds = (dg.exercise_ids as string[]) || [];
      const overlap = matchedIds.filter((id) => existingIds.includes(id));
      if (overlap.length > 0) {
        return {
          success: false,
          message: 'Algunos ejercicios ya están en otro grupo. Elimina el grupo existente primero.',
        };
      }
    }

    dayGroups.push(newGroup);
    allGroups[String(trainingDay)] = dayGroups;

    const { error: updateError } = await supabase
      .from('user_profiles')
      .update({ exercise_groups: allGroups })
      .eq('user_id', userId);

    if (updateError) throw updateError;

    const typeLabels: Record<string, string> = {
      SUPERSET: 'SUPER SERIE',
      TRISET: 'TRI-SERIE',
      CIRCUIT: 'CIRCUITO',
      GIANT_SET: 'GIANT SET',
    };

    return {
      success: true,
      message: `✅ ${typeLabels[groupType]} creada: ${matchedNames.join(' + ')}`,
      data: { groupId: newGroup.id, type: groupType, exercises: matchedNames },
      affectedRecords: 1,
    };
  } catch (error) {
    console.error('gymCreateExerciseGroup error:', error);
    return { success: false, message: 'Error al crear el grupo de ejercicios.' };
  }
}

// ============================================================================
// GYM TOOL: Eliminar Grupo de Ejercicios
// ============================================================================
export async function gymRemoveExerciseGroup(
  userId: string,
  exerciseNames: string[],
  trainingDay: number
): Promise<HankToolResult> {
  try {
    // Leer grupos existentes
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('exercise_groups')
      .eq('user_id', userId)
      .single();

    const allGroups = (profile?.exercise_groups as Record<string, unknown[]>) || {};
    const dayGroups = (allGroups[String(trainingDay)] || []) as Array<{
      id: string;
      type: string;
      exercise_ids: string[];
    }>;

    if (dayGroups.length === 0) {
      return { success: false, message: 'No hay grupos de ejercicios en este día.' };
    }

    // Buscar configs que coincidan con los nombres dados
    const { data: configs } = await supabase
      .from('user_exercise_config')
      .select('id, exercises!inner(name)')
      .eq('user_id', userId)
      .contains('training_days', [trainingDay]);

    const matchedIds = (exerciseNames || [])
      .map((name) => {
        const match = (configs || []).find((c: Record<string, unknown>) =>
          (((c.exercises as Record<string, unknown>)?.name as string) || '')
            .toLowerCase()
            .includes(name.toLowerCase())
        );
        return match?.id;
      })
      .filter(Boolean) as string[];

    // Encontrar el grupo que contiene estos ejercicios
    const groupToRemove = dayGroups.find((g) =>
      matchedIds.some((id) => g.exercise_ids.includes(id))
    );

    if (!groupToRemove) {
      return { success: false, message: 'No se encontró un grupo con esos ejercicios.' };
    }

    allGroups[String(trainingDay)] = dayGroups.filter((g) => g.id !== groupToRemove.id);

    const { error: updateError } = await supabase
      .from('user_profiles')
      .update({ exercise_groups: allGroups })
      .eq('user_id', userId);

    if (updateError) throw updateError;

    return {
      success: true,
      message: `✅ Grupo ${groupToRemove.type} eliminado. Los ejercicios ahora son independientes.`,
      affectedRecords: 1,
    };
  } catch (error) {
    console.error('gymRemoveExerciseGroup error:', error);
    return { success: false, message: 'Error al eliminar el grupo.' };
  }
}

// ============================================================================
// ASSET TOOL: Leer Schema de Templates (LIQUID DATA)
// ============================================================================
export async function assetGetSchema(assetType: string): Promise<HankToolResult> {
  try {
    const { data: template, error } = await supabase
      .from('asset_templates')
      .select('*')
      .eq('asset_type', assetType)
      .limit(1)
      .single();

    if (error || !template) {
      return {
        success: false,
        message: `No encontré templates para "${assetType}"`,
      };
    }

    const typedTemplate = template as AssetTemplate;
    const liquidFields = typedTemplate.default_metadata
      ? Object.keys(typedTemplate.default_metadata)
      : [];

    return {
      success: true,
      message: `📋 Campos disponibles para ${assetType}`,
      data: {
        assetType,
        staticFields: ['id', 'name', 'asset_url', 'order', 'training_days'],
        liquidFields,
        example: typedTemplate.default_metadata,
      },
    };
  } catch (error) {
    console.error('assetGetSchema error:', error);
    return { success: false, message: 'Error obteniendo schema.' };
  }
}

// ============================================================================
// ASSET TOOL: Actualizar Campo Dinámico (LIQUID DATA)
// ============================================================================
export async function assetUpdateField(
  userId: string,
  assetId: string | undefined,
  assetName: string | undefined,
  fieldPath: string,
  newValue: unknown,
  operation: 'set' | 'increment' | 'decrement' = 'set'
): Promise<HankToolResult> {
  try {
    // Buscar ejercicio en user_exercise_config (nueva arquitectura)
    let query = supabase
      .from('user_exercise_config')
      .select(
        `
        id,
        config,
        exercises (
          name
        )
      `
      )
      .eq('user_id', userId);

    if (assetId) {
      query = query.eq('id', assetId);
    } else if (assetName) {
      // Buscar por nombre del ejercicio (join con exercises)
      const { data: configs, error: searchError } = await supabase
        .from('user_exercise_config')
        .select(
          `
          id,
          config,
          exercises!inner (
            name
          )
        `
        )
        .eq('user_id', userId)
        .ilike('exercises.name', `%${assetName}%`)
        .limit(1)
        .single();

      if (searchError || !configs) {
        return { success: false, message: `No encontré el ejercicio "${assetName}".` };
      }

      const exerciseConfig = configs as unknown as {
        id: string;
        config: Record<string, unknown>;
        exercises: { name: string };
      };

      // Continuar con este ejercicio
      return await updateExerciseConfig(
        userId,
        exerciseConfig.id,
        exerciseConfig.exercises.name,
        exerciseConfig.config,
        fieldPath,
        newValue,
        operation
      );
    }

    const { data: asset, error } = await query.limit(1).single();

    if (error || !asset) {
      return { success: false, message: 'Ejercicio no encontrado.' };
    }

    const exerciseConfig = asset as unknown as {
      id: string;
      config: Record<string, unknown>;
      exercises: { name: string } | null;
    };

    return await updateExerciseConfig(
      userId,
      exerciseConfig.id,
      exerciseConfig.exercises?.name || 'Ejercicio',
      exerciseConfig.config,
      fieldPath,
      newValue,
      operation
    );
  } catch (error) {
    console.error('assetUpdateField error:', error);
    return { success: false, message: 'Error actualizando campo.' };
  }
}

// Helper para actualizar config de ejercicio
async function updateExerciseConfig(
  userId: string,
  configId: string,
  exerciseName: string,
  currentConfig: Record<string, unknown>,
  fieldPath: string,
  newValue: unknown,
  operation: 'set' | 'increment' | 'decrement'
): Promise<HankToolResult> {
  const configCopy = JSON.parse(JSON.stringify(currentConfig || {})) as Record<string, unknown>;

  // Navegar al campo usando lodash-style path: "custom_series.0.weight"
  const pathParts = fieldPath.split('.');

  // Navegar hasta el penúltimo nivel
  let target: unknown = configCopy;
  for (let i = 0; i < pathParts.length - 1; i++) {
    const key = pathParts[i];
    const isIndex = /^\d+$/.test(key);

    if (isIndex) {
      const idx = parseInt(key, 10);
      if (!Array.isArray(target)) {
        return {
          success: false,
          message: `Se esperaba un array en "${pathParts.slice(0, i).join('.')}"`,
        };
      }
      if (idx >= (target as unknown[]).length) {
        return {
          success: false,
          message: `Índice ${idx} fuera de rango. Hay ${(target as unknown[]).length} elementos (0-${(target as unknown[]).length - 1}).`,
        };
      }
      target = (target as unknown[])[idx];
    } else {
      const obj = target as Record<string, unknown>;
      if (obj[key] === undefined) {
        obj[key] = {};
      }
      target = obj[key];
    }
  }

  // Aplicar cambio en el último nivel
  const finalKey = pathParts[pathParts.length - 1];
  const isIndexFinal = /^\d+$/.test(finalKey);

  let finalTarget: Record<string, unknown> | unknown[];
  let actualKey: string | number;

  if (isIndexFinal) {
    if (!Array.isArray(target)) {
      return { success: false, message: `Se esperaba un array para índice ${finalKey}` };
    }
    finalTarget = target as unknown[];
    actualKey = parseInt(finalKey, 10);
    if (actualKey >= finalTarget.length) {
      return {
        success: false,
        message: `Índice ${actualKey} fuera de rango. Hay ${finalTarget.length} elementos.`,
      };
    }
  } else {
    finalTarget = target as Record<string, unknown>;
    actualKey = finalKey;
  }

  const currentValue = (finalTarget as Record<string | number, unknown>)[actualKey];

  // Aplicar operación
  switch (operation) {
    case 'set':
      (finalTarget as Record<string | number, unknown>)[actualKey] = newValue;
      break;
    case 'increment':
      (finalTarget as Record<string | number, unknown>)[actualKey] =
        (Number(currentValue) || 0) + Number(newValue);
      break;
    case 'decrement':
      (finalTarget as Record<string | number, unknown>)[actualKey] =
        (Number(currentValue) || 0) - Number(newValue);
      break;
  }

  const { error: updateError } = await supabase
    .from('user_exercise_config')
    .update({ config: configCopy })
    .eq('id', configId);

  if (updateError) throw updateError;

  const finalValue = (finalTarget as Record<string | number, unknown>)[actualKey];

  return {
    success: true,
    message: `✅ ${exerciseName}: ${fieldPath} = ${String(finalValue)}`,
    data: {
      assetId: configId,
      field: fieldPath,
      oldValue: currentValue,
      newValue: finalValue,
    },
    affectedRecords: 1,
  };
}

// ============================================================================
// ASSET TOOL: Quitar Serie de un Ejercicio
// ============================================================================
export async function assetRemoveSeries(
  userId: string,
  assetName: string | undefined,
  seriesIndex: number | 'last' | 'first',
  trainingDay: number = 0,
  configId?: string
): Promise<HankToolResult> {
  try {
    // Buscar el ejercicio - priorizar configId sobre nombre
    const exercise = await findExerciseConfigFlexible(userId, configId, assetName);

    if (!exercise) {
      return {
        success: false,
        message: `No encontré el ejercicio${assetName ? ` "${assetName}"` : ''}.`,
      };
    }

    const currentConfig = JSON.parse(JSON.stringify(exercise.config)) as Record<string, unknown>;

    // Obtener series del día específico
    const customSeries = getSeriesForDay(currentConfig, trainingDay);

    if (customSeries.length === 0) {
      return {
        success: false,
        message: `${exercise.name} no tiene series para quitar en día ${trainingDay + 1}.`,
      };
    }

    if (customSeries.length === 1) {
      return {
        success: false,
        message: `${exercise.name} solo tiene 1 serie en día ${trainingDay + 1}. No puedo dejarla sin series.`,
      };
    }

    // Determinar índice a eliminar
    let indexToRemove: number;
    if (seriesIndex === 'last') {
      indexToRemove = customSeries.length - 1;
    } else if (seriesIndex === 'first') {
      indexToRemove = 0;
    } else {
      indexToRemove = seriesIndex;
    }

    if (indexToRemove < 0 || indexToRemove >= customSeries.length) {
      return {
        success: false,
        message: `Índice ${indexToRemove} fuera de rango. Hay ${customSeries.length} series (0-${customSeries.length - 1}).`,
      };
    }

    // Eliminar la serie
    const removedSeries = customSeries[indexToRemove];
    customSeries.splice(indexToRemove, 1);

    // Guardar en estructura por día
    setSeriesForDay(currentConfig, trainingDay, customSeries);

    const { error: updateError } = await supabase
      .from('user_exercise_config')
      .update({ config: currentConfig })
      .eq('id', exercise.id);

    if (updateError) throw updateError;

    return {
      success: true,
      message: `✅ ${exercise.name}: Serie ${indexToRemove + 1} eliminada. Quedan ${customSeries.length} series.`,
      data: {
        assetId: exercise.id,
        removedSeries,
        remainingSeries: customSeries.length,
      },
      affectedRecords: 1,
    };
  } catch (error) {
    console.error('assetRemoveSeries error:', error);
    return { success: false, message: 'Error quitando serie.' };
  }
}

// ============================================================================
// ASSET TOOL: Agregar Serie a un Ejercicio
// ============================================================================
export async function assetAddSeries(
  userId: string,
  assetName: string | undefined,
  reps: number = 10,
  weight: number = 0,
  seriesType: 'WARMUP' | 'APPROACH' | 'EFFECTIVE' | 'FAILURE' = 'EFFECTIVE',
  position: 'end' | 'start' | number = 'end',
  trainingDay: number = 0,
  configId?: string
): Promise<HankToolResult> {
  try {
    // Buscar el ejercicio - priorizar configId sobre nombre
    const exercise = await findExerciseConfigFlexible(userId, configId, assetName);

    if (!exercise) {
      return {
        success: false,
        message: `No encontré el ejercicio${assetName ? ` "${assetName}"` : ''}.`,
      };
    }

    const currentConfig = JSON.parse(JSON.stringify(exercise.config)) as Record<string, unknown>;

    // Obtener series del día específico
    const customSeries = getSeriesForDay(currentConfig, trainingDay);

    // Crear nueva serie
    const newSeries: SeriesConfig = {
      id: String(Date.now()),
      reps,
      weight,
      type: mapSeriesType(seriesType),
      note: '',
    };

    // Agregar según posición
    if (typeof position === 'number') {
      // Insertar en posición específica (0-based index)
      const insertIndex = Math.max(0, Math.min(position, customSeries.length));
      customSeries.splice(insertIndex, 0, newSeries);
    } else if (position === 'start') {
      customSeries.unshift(newSeries);
    } else {
      customSeries.push(newSeries);
    }

    // Guardar en estructura por día
    setSeriesForDay(currentConfig, trainingDay, customSeries);

    const { error: updateError } = await supabase
      .from('user_exercise_config')
      .update({ config: currentConfig })
      .eq('id', exercise.id);

    if (updateError) throw updateError;

    return {
      success: true,
      message: `✅ ${exercise.name} (día ${trainingDay + 1}): Nueva serie añadida (${reps} reps × ${weight}kg, tipo: ${seriesType}). Total: ${customSeries.length} series.`,
      data: {
        assetId: exercise.id,
        newSeries,
        totalSeries: customSeries.length,
      },
      affectedRecords: 1,
    };
  } catch (error) {
    console.error('assetAddSeries error:', error);
    return { success: false, message: 'Error agregando serie.' };
  }
}

// ============================================================================
// ASSET TOOL: Reemplazar Serie de un Ejercicio
// ============================================================================
export async function assetReplaceSeries(
  userId: string,
  assetName: string | undefined,
  seriesIndex: 'last' | 'first' | number,
  reps: number = 10,
  weight: number = 0,
  seriesType: 'WARMUP' | 'APPROACH' | 'EFFECTIVE' | 'FAILURE' = 'EFFECTIVE',
  trainingDay: number = 0,
  configId?: string
): Promise<HankToolResult> {
  try {
    // Buscar el ejercicio - priorizar configId sobre nombre
    const exercise = await findExerciseConfigFlexible(userId, configId, assetName);

    if (!exercise) {
      return {
        success: false,
        message: `No encontré el ejercicio${assetName ? ` "${assetName}"` : ''}.`,
      };
    }

    const currentConfig = JSON.parse(JSON.stringify(exercise.config)) as Record<string, unknown>;

    // Obtener series del día específico
    const customSeries = getSeriesForDay(currentConfig, trainingDay);

    if (customSeries.length === 0) {
      return {
        success: false,
        message: `${exercise.name} no tiene series para reemplazar en día ${trainingDay + 1}.`,
      };
    }

    // Determinar índice a reemplazar
    let indexToReplace: number;
    if (seriesIndex === 'last') {
      indexToReplace = customSeries.length - 1;
    } else if (seriesIndex === 'first') {
      indexToReplace = 0;
    } else {
      indexToReplace = seriesIndex;
    }

    if (indexToReplace < 0 || indexToReplace >= customSeries.length) {
      return {
        success: false,
        message: `Índice ${indexToReplace} fuera de rango. Hay ${customSeries.length} series (0-${customSeries.length - 1}).`,
      };
    }

    // Guardar la serie anterior y crear la nueva
    const oldSeries = { ...customSeries[indexToReplace] };
    const newSeries: SeriesConfig = {
      id: String(Date.now()),
      reps,
      weight,
      type: mapSeriesType(seriesType),
      note: '',
    };

    // Reemplazar la serie
    customSeries[indexToReplace] = newSeries;

    // Guardar en estructura por día
    setSeriesForDay(currentConfig, trainingDay, customSeries);

    const { error: updateError } = await supabase
      .from('user_exercise_config')
      .update({ config: currentConfig })
      .eq('id', exercise.id);

    if (updateError) throw updateError;

    return {
      success: true,
      message: `✅ ${exercise.name} (día ${trainingDay + 1}): Serie ${indexToReplace + 1} reemplazada. Antes: ${oldSeries.reps} reps × ${oldSeries.weight}kg (${oldSeries.type}). Ahora: ${reps} reps × ${weight}kg (${seriesType}).`,
      data: {
        assetId: exercise.id,
        oldSeries,
        newSeries,
        seriesIndex: indexToReplace,
      },
      affectedRecords: 1,
    };
  } catch (error) {
    console.error('assetReplaceSeries error:', error);
    return { success: false, message: 'Error reemplazando serie.' };
  }
}

// ============================================================================
// ASSET TOOL: Establecer Todas las Series (Reemplaza todas)
// ============================================================================

export async function assetSetSeries(
  userId: string,
  assetName: string | undefined,
  series: SeriesConfig[],
  trainingDay: number = 0,
  configId?: string
): Promise<HankToolResult> {
  try {
    if (!series || series.length === 0) {
      return { success: false, message: 'Debes proporcionar al menos una serie.' };
    }

    // Buscar el ejercicio - priorizar configId sobre nombre
    const exercise = await findExerciseConfigFlexible(userId, configId, assetName);

    if (!exercise) {
      return {
        success: false,
        message: `No encontré el ejercicio${assetName ? ` "${assetName}"` : ''}.`,
      };
    }

    const currentConfig = JSON.parse(JSON.stringify(exercise.config)) as Record<string, unknown>;

    // Crear nuevas series con IDs únicos
    const newSeries: SeriesConfig[] = series.map((s, index) => ({
      id: String(Date.now() + index),
      reps: s.reps,
      weight: s.weight,
      type: s.type,
      note: s.note || '',
    }));

    // Guardar en estructura por día
    setSeriesForDay(currentConfig, trainingDay, newSeries);

    const { error: updateError } = await supabase
      .from('user_exercise_config')
      .update({ config: currentConfig })
      .eq('id', exercise.id);

    if (updateError) throw updateError;

    // Construir resumen de series
    const seriesSummary = newSeries
      .map((s, i) => `${i + 1}. ${s.reps} reps × ${s.weight}kg (${s.type})`)
      .join('\n');

    return {
      success: true,
      message: `✅ ${exercise.name} (día ${trainingDay + 1}): ${newSeries.length} series configuradas:\n${seriesSummary}`,
      data: {
        assetId: exercise.id,
        series: newSeries,
        totalSeries: newSeries.length,
      },
      affectedRecords: 1,
    };
  } catch (error) {
    console.error('assetSetSeries error:', error);
    return { success: false, message: 'Error configurando series.' };
  }
}

// ============================================================================
// ASSET TOOL: Leer Asset Completo
// ============================================================================
export async function assetRead(
  userId: string,
  assetId?: string,
  assetName?: string,
  assetType?: string
): Promise<HankToolResult> {
  try {
    let query = supabase
      .from('user_assets')
      .select('*')
      .eq('user_id', userId)
      .is('deleted_at', null);

    if (assetId) query = query.eq('id', assetId);
    if (assetName) query = query.ilike('name', `%${assetName}%`);
    if (assetType) query = query.eq('asset_type', assetType);

    const { data, error } = await query;

    if (error) throw error;

    return {
      success: true,
      message: `📋 Encontrados: ${data?.length || 0} assets`,
      data: { assets: data },
    };
  } catch (error) {
    console.error('assetRead error:', error);
    return { success: false, message: 'Error leyendo assets.' };
  }
}

// ============================================================================
// DIET TOOL: Actualizar Calorías de Comida
// ============================================================================
export async function dietAddCalories(
  userId: string,
  mealName: string,
  caloriesChange: number
): Promise<HankToolResult> {
  try {
    const { data: meal, error } = await supabase
      .from('user_assets')
      .select('*')
      .eq('user_id', userId)
      .eq('asset_type', 'diet_meal')
      .ilike('name', `%${mealName}%`)
      .is('deleted_at', null)
      .limit(1)
      .single();

    if (error || !meal) {
      return { success: false, message: `No encontré la comida "${mealName}".` };
    }

    const typedMeal = meal as UserAsset;
    const currentMetadata = (typedMeal.metadata || {}) as Record<string, unknown>;
    const currentCalories = Number(currentMetadata.calories) || 0;
    const newCalories = currentCalories + caloriesChange;

    const { error: updateError } = await supabase
      .from('user_assets')
      .update({
        metadata: { ...currentMetadata, calories: newCalories },
      })
      .eq('id', typedMeal.id);

    if (updateError) throw updateError;

    const action = caloriesChange > 0 ? 'subió' : 'bajó';
    return {
      success: true,
      message: `✅ ${typedMeal.name}: ${action} ${Math.abs(caloriesChange)} kcal → ${newCalories} kcal`,
      data: { oldCalories: currentCalories, newCalories },
      affectedRecords: 1,
    };
  } catch (error) {
    console.error('dietAddCalories error:', error);
    return { success: false, message: 'Error modificando calorías.' };
  }
}

// ============================================================================
// LOGGING TOOL: Registrar Serie de Gym
// ============================================================================
export async function logWorkoutSet(
  sessionId: string,
  assetId: string,
  setDetails: { weight: number; reps: number; rir?: number }
): Promise<HankToolResult> {
  try {
    const { error } = await supabase.from('workout_logs').insert({
      session_id: sessionId,
      asset_id: assetId,
      weight_kg: setDetails.weight,
      reps: setDetails.reps,
      rir: setDetails.rir,
      completed: true,
    });

    if (error) return { success: false, message: error.message };
    return { success: true, message: '✅ Serie registrada.' };
  } catch (error) {
    console.error('logWorkoutSet error:', error);
    return { success: false, message: 'Error registrando serie.' };
  }
}

// ============================================================================
// ADN TOOLS: Acceso al perfil y datos biométricos
// ============================================================================

/**
 * Obtiene el perfil completo del atleta (TRENS ID + medidas corporales)
 */
export async function adnGetProfile(userId: string): Promise<HankToolResult> {
  try {
    // Obtener perfil
    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (profileError || !profile) {
      return {
        success: false,
        message: 'No se encontró el perfil del atleta.',
      };
    }

    // Obtener medidas corporales
    const { data: measurements, error: measurementsError } = await supabase
      .from('body_measurements')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: true });

    if (measurementsError) {
      return {
        success: false,
        message: 'Error al obtener medidas corporales.',
      };
    }

    const dominantMuscle = measurements?.find((m) => m.is_dominant);

    const profileSummary = `
📋 PERFIL ATLETA:
• Objetivo: ${profile.goal}
• Peso: ${profile.weight}
• Altura: ${profile.height}
• Lesiones: ${profile.injuries}
• Alergias: ${profile.allergies}

💪 MEDIDAS CORPORALES:
${measurements && measurements.length > 0 ? measurements.map((m) => `• ${m.name}: ${m.value} ${m.is_dominant ? '👑' : ''}`).join('\n') : '• Sin medidas registradas'}

${dominantMuscle ? `\n🏆 MÚSCULO DOMINANTE: ${dominantMuscle.name} (${dominantMuscle.value})` : ''}
    `.trim();

    return {
      success: true,
      message: profileSummary,
      data: {
        profile,
        measurements: measurements || [],
        dominantMuscle,
      },
    };
  } catch (error) {
    console.error('adnGetProfile error:', error);
    return {
      success: false,
      message: 'Error al obtener perfil del atleta.',
    };
  }
}

/**
 * Obtiene los récords personales del atleta
 */
export async function adnGetRecords(userId: string): Promise<HankToolResult> {
  try {
    const { data: records, error } = await supabase
      .from('personal_records')
      .select('*')
      .eq('user_id', userId)
      .order('weight', { ascending: false });

    if (error) {
      return {
        success: false,
        message: 'Error al obtener récords personales.',
      };
    }

    if (!records || records.length === 0) {
      return {
        success: true,
        message: '🏋️ Aún no tienes récords registrados. ¡Es hora de romper algunos!',
        data: { records: [] },
      };
    }

    const recordsSummary = `
🏆 TUS RÉCORDS PERSONALES:
${records.map((r) => `${r.exercise_icon} ${r.exercise_name}: ${r.weight}kg x ${r.reps === 1 ? '1RM' : `${r.reps} reps`}`).join('\n')}
    `.trim();

    return {
      success: true,
      message: recordsSummary,
      data: { records },
    };
  } catch (error) {
    console.error('adnGetRecords error:', error);
    return {
      success: false,
      message: 'Error al obtener récords personales.',
    };
  }
}

/**
 * Actualiza un campo específico del perfil del atleta
 */
export async function adnUpdateProfile(
  userId: string,
  field: 'goal' | 'weight' | 'height' | 'injuries' | 'allergies' | 'display_name',
  value: string
): Promise<HankToolResult> {
  try {
    const fieldLabels: Record<string, string> = {
      goal: 'Objetivo',
      weight: 'Peso',
      height: 'Altura',
      injuries: 'Lesiones',
      allergies: 'Alergias',
      display_name: 'Nombre',
    };

    const { error } = await supabase
      .from('user_profiles')
      .update({ [field]: value })
      .eq('user_id', userId);

    if (error) throw error;

    return {
      success: true,
      message: `✅ ${fieldLabels[field]} actualizado a: ${value}`,
      affectedRecords: 1,
    };
  } catch (error) {
    console.error('adnUpdateProfile error:', error);
    return {
      success: false,
      message: 'Error al actualizar perfil.',
    };
  }
}

/**
 * Agrega una medida corporal
 */
export async function adnAddMeasurement(
  userId: string,
  name: string,
  value: string,
  isDominant: boolean = false
): Promise<HankToolResult> {
  try {
    const { error } = await supabase.from('body_measurements').insert({
      user_id: userId,
      name: name.toUpperCase(),
      value,
      is_dominant: isDominant,
    });

    if (error) throw error;

    return {
      success: true,
      message: `✅ Medida agregada: ${name.toUpperCase()} = ${value}${isDominant ? ' 👑' : ''}`,
      affectedRecords: 1,
    };
  } catch (error) {
    console.error('adnAddMeasurement error:', error);
    return {
      success: false,
      message: 'Error al agregar medida.',
    };
  }
}

/**
 * Elimina una medida corporal
 */
export async function adnRemoveMeasurement(
  userId: string,
  measurementName: string
): Promise<HankToolResult> {
  try {
    const { data, error } = await supabase
      .from('body_measurements')
      .delete()
      .eq('user_id', userId)
      .ilike('name', `%${measurementName}%`)
      .select();

    if (error) throw error;

    if (!data || data.length === 0) {
      return {
        success: false,
        message: `No encontré la medida "${measurementName}".`,
      };
    }

    return {
      success: true,
      message: `✅ Medida "${data[0].name}" eliminada.`,
      affectedRecords: 1,
    };
  } catch (error) {
    console.error('adnRemoveMeasurement error:', error);
    return {
      success: false,
      message: 'Error al eliminar medida.',
    };
  }
}

/**
 * Actualiza una medida corporal existente
 */
export async function adnUpdateMeasurement(
  userId: string,
  measurementName: string,
  newValue: string,
  isDominant?: boolean
): Promise<HankToolResult> {
  try {
    // Buscar la medida por nombre
    const { data: existing } = await supabase
      .from('body_measurements')
      .select('id, name')
      .eq('user_id', userId)
      .ilike('name', `%${measurementName}%`)
      .single();

    if (!existing) {
      return {
        success: false,
        message: `No encontré la medida "${measurementName}". ¿Quieres que la agregue?`,
      };
    }

    const updateData: Record<string, unknown> = { value: newValue };
    if (isDominant !== undefined) {
      updateData.is_dominant = isDominant;
    }

    const { error } = await supabase
      .from('body_measurements')
      .update(updateData)
      .eq('id', existing.id);

    if (error) throw error;

    return {
      success: true,
      message: `✅ ${existing.name} actualizado a: ${newValue}${isDominant ? ' 👑' : ''}`,
      data: { measurementName: existing.name, newValue },
    };
  } catch (error) {
    console.error('adnUpdateMeasurement error:', error);
    return { success: false, message: 'Error al actualizar medida.' };
  }
}

/**
 * Establece múltiples campos biométricos de una vez
 * Campos soportados: weight, height, goal, age, sex, body_fat_percentage,
 * muscle_mass, activity_level, training_experience, metabolic_rate,
 * training_days_per_week, injuries, allergies
 */
export async function adnSetBiometrics(
  userId: string,
  updates: {
    weight?: string;
    height?: string;
    goal?: string;
    age?: number;
    sex?: string;
    body_fat_percentage?: number;
    muscle_mass?: number;
    activity_level?: string;
    training_experience?: string;
    metabolic_rate?: string;
    training_days_per_week?: number;
    injuries?: string;
    allergies?: string;
    display_name?: string;
  }
): Promise<HankToolResult> {
  try {
    if (Object.keys(updates).length === 0) {
      return { success: false, message: 'No especificaste qué campos actualizar.' };
    }

    // Validar y limpiar datos
    const cleanUpdates: Record<string, unknown> = {};
    const changedFields: string[] = [];

    const fieldLabels: Record<string, string> = {
      weight: 'Peso',
      height: 'Altura',
      goal: 'Objetivo',
      age: 'Edad',
      sex: 'Sexo',
      body_fat_percentage: 'Grasa corporal',
      muscle_mass: 'Masa muscular',
      activity_level: 'Nivel de actividad',
      training_experience: 'Experiencia',
      metabolic_rate: 'Metabolismo',
      training_days_per_week: 'Días de entreno',
      injuries: 'Lesiones',
      allergies: 'Alergias',
      display_name: 'Nombre',
    };

    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined && value !== null && value !== '') {
        cleanUpdates[key] = value;
        changedFields.push(`${fieldLabels[key] || key}: ${value}`);
      }
    }

    // Invalidar caché de macros si cambia algo que afecta la nutrición
    const macroAffectingFields = [
      'weight',
      'height',
      'goal',
      'age',
      'sex',
      'body_fat_percentage',
      'muscle_mass',
      'activity_level',
      'training_experience',
      'metabolic_rate',
      'training_days_per_week',
    ];

    const shouldInvalidateMacros = Object.keys(cleanUpdates).some((k) =>
      macroAffectingFields.includes(k)
    );

    if (shouldInvalidateMacros) {
      cleanUpdates.cached_daily_macros = null;
      cleanUpdates.cached_macros_meal_count = null;
      cleanUpdates.cached_macros_updated_at = null;
    }

    cleanUpdates.updated_at = new Date().toISOString();

    const { error } = await supabase
      .from('user_profiles')
      .update(cleanUpdates)
      .eq('user_id', userId);

    if (error) throw error;

    const response = `✅ Perfil actualizado:
${changedFields.map((f) => `• ${f}`).join('\n')}

${shouldInvalidateMacros ? '⚠️ Tus macros pueden haber cambiado. ¿Quieres que sincronice tu plan de nutrición?' : ''}`;

    return {
      success: true,
      message: response,
      data: {
        updatedFields: Object.keys(cleanUpdates),
        shouldSyncMacros: shouldInvalidateMacros,
      },
    };
  } catch (error) {
    console.error('adnSetBiometrics error:', error);
    return { success: false, message: 'Error al actualizar biometría.' };
  }
}

/**
 * AUTO ADJUST ALL - Ajusta automáticamente TODO basándose en el perfil actual
 * 1. Recalcula macros diarios según perfil
 * 2. Sincroniza ingredientes de todas las comidas
 * 3. Sugiere ajustes en el plan de entrenamiento si es necesario
 */
export async function autoAdjustAll(userId: string): Promise<HankToolResult> {
  try {
    const results: string[] = [];
    const errors: string[] = [];

    // 1. Obtener perfil completo
    const { data: userProfile } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (!userProfile) {
      return { success: false, message: 'No se encontró tu perfil. Configúralo primero.' };
    }

    results.push(
      `👤 Perfil: ${userProfile.weight} | ${userProfile.goal} | ${userProfile.training_experience || 'INTERMEDIO'}`
    );

    // 2. Obtener plan de entrenamiento (weekday: derivar frecuencia de routine_names)
    const { data: profile } = await supabase
      .from('profiles')
      .select('training_routine_names')
      .eq('id', userId)
      .single();

    const routineNames = (profile?.training_routine_names || {}) as Record<string, string>;
    const trainingFrequency = Object.values(routineNames).filter(
      (v) => (v || '').trim().length > 0
    ).length;

    results.push(`🏋️ Entrenamiento: ${trainingFrequency} días/semana`);

    // 3. Obtener y contar comidas
    const { data: meals } = await supabase
      .from('meals')
      .select('id, name, ingredients')
      .eq('user_id', userId);

    const mealCount = meals?.length || 0;
    results.push(`🍽️ Nutrición: ${mealCount} comidas configuradas`);

    // 4. Recalcular macros si hay comidas
    if (mealCount > 0) {
      const { calculateUserDailyMacros, calculateMealWithUserMacros } = await import('./nutrition');

      const dailyMacros = await calculateUserDailyMacros({
        weight: userProfile.weight || '75 KG',
        height: userProfile.height || '175 CM',
        goal: userProfile.goal || 'MANTENER',
        mealCount,
        age: userProfile.age,
        sex: userProfile.sex,
        bodyFatPercentage: userProfile.body_fat_percentage,
        muscleMass: userProfile.muscle_mass,
        activityLevel: userProfile.activity_level || 'MODERADO',
        trainingExperience: userProfile.training_experience,
        metabolicRate: userProfile.metabolic_rate,
        trainingDaysPerWeek: userProfile.training_days_per_week || trainingFrequency,
      });

      // Si no hay perMeal, calcular manualmente
      const perMealMacros = dailyMacros.perMeal || {
        calories: Math.round(dailyMacros.totalCalories / mealCount),
        protein: Math.round(dailyMacros.totalProtein / mealCount),
        carbs: Math.round(dailyMacros.totalCarbs / mealCount),
        fat: Math.round(dailyMacros.totalFat / mealCount),
      };

      // Recalcular cada comida
      let updatedMeals = 0;
      for (const meal of meals || []) {
        const ingredients = meal.ingredients || [];
        if (ingredients.length === 0) continue;

        try {
          const ingredientsWithIds = ingredients.map((ing: any, i: number) => ({
            id: `ing-${i}`,
            name: ing.name,
            quantity: '',
            portion: '',
          }));

          const calculated = await calculateMealWithUserMacros(ingredientsWithIds, perMealMacros);

          const updatedIngredients = calculated.map((ing) => ({
            name: ing.name,
            quantity: ing.quantity,
            portion: ing.portion || '',
          }));

          let totalCals = 0,
            totalP = 0,
            totalC = 0,
            totalF = 0;
          calculated.forEach((ing) => {
            totalCals += ing.nutritionInfo?.calories || 0;
            totalP += ing.nutritionInfo?.protein || 0;
            totalC += ing.nutritionInfo?.carbs || 0;
            totalF += ing.nutritionInfo?.fat || 0;
          });

          await supabase
            .from('meals')
            .update({
              ingredients: updatedIngredients,
              calories: Math.round(totalCals),
              protein_g: Math.round(totalP),
              carbs_g: Math.round(totalC),
              fat_g: Math.round(totalF),
            })
            .eq('id', meal.id);

          updatedMeals++;
        } catch (mealError) {
          errors.push(`Error en ${meal.name}`);
        }
      }

      results.push(`📊 Macros recalculados: ${updatedMeals}/${mealCount} comidas`);
      results.push(
        `🎯 Por comida: ${perMealMacros.calories}kcal | P:${perMealMacros.protein}g | C:${perMealMacros.carbs}g | F:${perMealMacros.fat}g`
      );
      results.push(
        `📈 Total diario: ${dailyMacros.totalCalories}kcal | P:${dailyMacros.totalProtein}g | C:${dailyMacros.totalCarbs}g | F:${dailyMacros.totalFat}g`
      );

      // Invalidar caché
      await supabase
        .from('user_profiles')
        .update({
          cached_daily_macros: null,
          cached_macros_meal_count: null,
          cached_macros_updated_at: null,
        })
        .eq('user_id', userId);
    }

    // 5. Obtener stack de suplementos
    const { data: supplements } = await supabase
      .from('supplement_stacks')
      .select('id, name')
      .eq('user_id', userId);

    if (supplements && supplements.length > 0) {
      results.push(`💊 Stack: ${supplements.length} suplementos`);
    }

    // 6. Sugerencias basadas en perfil
    const suggestions: string[] = [];

    if (!userProfile.age) {
      suggestions.push('Agrega tu edad para cálculos más precisos');
    }
    if (!userProfile.body_fat_percentage) {
      suggestions.push('Registra tu % de grasa corporal');
    }
    if (mealCount < 3) {
      suggestions.push(`Considera agregar más comidas (tienes ${mealCount})`);
    }

    const suggestionText =
      suggestions.length > 0
        ? `\n💡 SUGERENCIAS:\n${suggestions.map((s) => `• ${s}`).join('\n')}`
        : '';

    return {
      success: true,
      message: `🔄 AUTO-AJUSTE COMPLETADO

${results.join('\n')}
${errors.length > 0 ? `\n⚠️ Errores: ${errors.join(', ')}` : ''}
${suggestionText}`,
      data: {
        profile: userProfile,
        training: { frequency: trainingFrequency, routineNames },
        nutrition: { mealCount, updated: mealCount },
        supplements: supplements?.length || 0,
        suggestions,
      },
    };
  } catch (error) {
    console.error('autoAdjustAll error:', error);
    return { success: false, message: 'Error en el auto-ajuste.' };
  }
}

// ============================================================================
// PROGRESS PHOTOS - Historial de Progreso Visual
// ============================================================================

/**
 * Obtiene el historial de fotos de progreso del usuario
 */
export async function progressGetPhotos(userId: string): Promise<HankToolResult> {
  try {
    const { data: photos, error } = await supabase
      .from('progress_photos')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    if (!photos || photos.length === 0) {
      return {
        success: true,
        message: '📸 No tienes fotos de progreso aún. ¡Sube tu primera foto desde tu TRENS ID!',
        data: { photos: [], count: 0 },
      };
    }

    // Construir resumen del historial
    const photoSummaries = photos.map((photo: any) => {
      const date = new Date(photo.created_at).toLocaleDateString('es-ES', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
      const snapshot = photo.snapshot || {};
      return {
        id: photo.id,
        date,
        weight: snapshot.weight || null,
        body_fat: snapshot.body_fat_percentage || null,
        goal: snapshot.goal || null,
        notes: photo.notes || null,
      };
    });

    // Calcular progreso si hay al menos 2 fotos
    let progressSummary = '';
    if (photos.length >= 2) {
      const oldest = photos[photos.length - 1].snapshot;
      const newest = photos[0].snapshot;

      if (oldest?.weight && newest?.weight) {
        const weightDiff = newest.weight - oldest.weight;
        const sign = weightDiff >= 0 ? '+' : '';
        progressSummary = `\n📈 Progreso total: ${sign}${weightDiff.toFixed(1)}kg`;
      }
      if (oldest?.body_fat_percentage && newest?.body_fat_percentage) {
        const bfDiff = newest.body_fat_percentage - oldest.body_fat_percentage;
        const sign = bfDiff >= 0 ? '+' : '';
        progressSummary += ` | ${sign}${bfDiff.toFixed(1)}% grasa`;
      }
    }

    const recentList = photoSummaries
      .slice(0, 5)
      .map((p: any) => {
        let info = `📅 ${p.date}`;
        if (p.weight) info += ` | ${p.weight}kg`;
        if (p.body_fat) info += ` | ${p.body_fat}% grasa`;
        if (p.goal) info += ` | ${p.goal}`;
        if (p.notes) info += `\n   💬 "${p.notes}"`;
        return info;
      })
      .join('\n');

    return {
      success: true,
      message: `📸 HISTORIAL DE PROGRESO (${photos.length} fotos)
${progressSummary}

Fotos recientes:
${recentList}`,
      data: {
        photos: photoSummaries,
        count: photos.length,
        progress:
          photos.length >= 2
            ? {
                startWeight: photos[photos.length - 1].snapshot?.weight,
                currentWeight: photos[0].snapshot?.weight,
                startBodyFat: photos[photos.length - 1].snapshot?.body_fat_percentage,
                currentBodyFat: photos[0].snapshot?.body_fat_percentage,
              }
            : null,
      },
    };
  } catch (error) {
    console.error('progressGetPhotos error:', error);
    return { success: false, message: 'Error al obtener fotos de progreso.' };
  }
}

/**
 * Obtiene el detalle completo de una foto de progreso específica
 */
export async function progressGetPhotoDetail(
  userId: string,
  photoId: string
): Promise<HankToolResult> {
  try {
    const { data: photo, error } = await supabase
      .from('progress_photos')
      .select('*')
      .eq('id', photoId)
      .eq('user_id', userId)
      .single();

    if (error || !photo) {
      return { success: false, message: 'Foto no encontrada.' };
    }

    const snapshot = photo.snapshot || {};
    const date = new Date(photo.created_at).toLocaleDateString('es-ES', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });

    // Construir resumen detallado
    const details: string[] = [];

    details.push(`📅 Fecha: ${date}`);
    if (photo.notes) details.push(`💬 Nota: "${photo.notes}"`);

    // Biometría
    const biometrics: string[] = [];
    if (snapshot.weight) biometrics.push(`${snapshot.weight}kg`);
    if (snapshot.height) biometrics.push(`${snapshot.height}cm`);
    if (snapshot.body_fat_percentage) biometrics.push(`${snapshot.body_fat_percentage}% grasa`);
    if (snapshot.muscle_mass) biometrics.push(`${snapshot.muscle_mass}kg músculo`);
    if (snapshot.goal) biometrics.push(`Objetivo: ${snapshot.goal}`);
    if (biometrics.length > 0) details.push(`📊 Datos: ${biometrics.join(' | ')}`);

    // Medidas
    if (snapshot.measurements && snapshot.measurements.length > 0) {
      const measures = snapshot.measurements
        .map((m: any) => `${m.name}: ${m.value}${m.is_dominant ? ' 👑' : ''}`)
        .join(', ');
      details.push(`📐 Medidas: ${measures}`);
    }

    // Entrenamiento
    if (snapshot.training) {
      details.push(`🏋️ Entrenamiento: ${snapshot.training.frequency} días/semana`);
      if (snapshot.training.current_plan) {
        details.push(`   Plan: ${snapshot.training.current_plan}`);
      }
    }

    // Nutrición
    if (snapshot.nutrition) {
      const nutri = snapshot.nutrition;
      let nutriInfo = `🍽️ Nutrición: ${nutri.meal_count} comidas`;
      if (nutri.daily_calories) {
        nutriInfo += ` | ${nutri.daily_calories}kcal`;
        if (nutri.daily_protein) nutriInfo += ` | P:${nutri.daily_protein}g`;
        if (nutri.daily_carbs) nutriInfo += ` | C:${nutri.daily_carbs}g`;
        if (nutri.daily_fat) nutriInfo += ` | F:${nutri.daily_fat}g`;
      }
      details.push(nutriInfo);
    }

    // Suplementos
    if (snapshot.supplements && snapshot.supplements.length > 0) {
      const supps = snapshot.supplements.map((s: any) => s.name).join(', ');
      details.push(`💊 Suplementos: ${supps}`);
    }

    return {
      success: true,
      message: `📸 FOTO DE PROGRESO

${details.join('\n')}`,
      data: {
        photo: {
          id: photo.id,
          url: photo.photo_url,
          date: photo.created_at,
          notes: photo.notes,
        },
        snapshot,
      },
    };
  } catch (error) {
    console.error('progressGetPhotoDetail error:', error);
    return { success: false, message: 'Error al obtener detalle de la foto.' };
  }
}

/**
 * Compara dos fotos de progreso y muestra los cambios
 */
export async function progressComparePhotos(
  userId: string,
  options?: { firstPhotoId?: string; lastPhotoId?: string }
): Promise<HankToolResult> {
  try {
    // Si no se especifican IDs, comparar primera y última
    const { data: photos, error } = await supabase
      .from('progress_photos')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: true });

    if (error) throw error;
    if (!photos || photos.length < 2) {
      return {
        success: false,
        message: 'Necesitas al menos 2 fotos de progreso para hacer una comparación.',
      };
    }

    let beforePhoto = photos[0];
    let afterPhoto = photos[photos.length - 1];

    // Si se especifican IDs específicos, usarlos
    if (options?.firstPhotoId) {
      const found = photos.find((p: any) => p.id === options.firstPhotoId);
      if (found) beforePhoto = found;
    }
    if (options?.lastPhotoId) {
      const found = photos.find((p: any) => p.id === options.lastPhotoId);
      if (found) afterPhoto = found;
    }

    const before = beforePhoto.snapshot || {};
    const after = afterPhoto.snapshot || {};

    const beforeDate = new Date(beforePhoto.created_at);
    const afterDate = new Date(afterPhoto.created_at);
    const daysBetween = Math.round(
      (afterDate.getTime() - beforeDate.getTime()) / (1000 * 60 * 60 * 24)
    );

    // Calcular diferencias
    const changes: string[] = [];

    if (before.weight && after.weight) {
      const diff = after.weight - before.weight;
      const sign = diff >= 0 ? '+' : '';
      changes.push(`⚖️ Peso: ${before.weight}kg → ${after.weight}kg (${sign}${diff.toFixed(1)}kg)`);
    }

    if (before.body_fat_percentage && after.body_fat_percentage) {
      const diff = after.body_fat_percentage - before.body_fat_percentage;
      const sign = diff >= 0 ? '+' : '';
      changes.push(
        `📉 Grasa: ${before.body_fat_percentage}% → ${after.body_fat_percentage}% (${sign}${diff.toFixed(1)}%)`
      );
    }

    if (before.muscle_mass && after.muscle_mass) {
      const diff = after.muscle_mass - before.muscle_mass;
      const sign = diff >= 0 ? '+' : '';
      changes.push(
        `💪 Músculo: ${before.muscle_mass}kg → ${after.muscle_mass}kg (${sign}${diff.toFixed(1)}kg)`
      );
    }

    // Comparar medidas específicas
    if (before.measurements && after.measurements) {
      const beforeMap = new Map<string, string>(
        before.measurements.map((m: any) => [m.name.toLowerCase(), m.value])
      );
      const afterMap = new Map<string, string>(
        after.measurements.map((m: any) => [m.name.toLowerCase(), m.value])
      );

      afterMap.forEach((afterVal, name) => {
        const beforeVal = beforeMap.get(name);
        if (beforeVal && beforeVal !== afterVal) {
          // Intentar extraer números para comparar
          const beforeNum = parseFloat(beforeVal);
          const afterNum = parseFloat(afterVal);
          if (!isNaN(beforeNum) && !isNaN(afterNum)) {
            const diff = afterNum - beforeNum;
            const sign = diff >= 0 ? '+' : '';
            changes.push(`📐 ${name}: ${beforeVal} → ${afterVal} (${sign}${diff.toFixed(1)})`);
          } else {
            changes.push(`📐 ${name}: ${beforeVal} → ${afterVal}`);
          }
        }
      });
    }

    if (before.goal !== after.goal && before.goal && after.goal) {
      changes.push(`🎯 Objetivo: ${before.goal} → ${after.goal}`);
    }

    const formatDate = (d: Date) =>
      d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });

    return {
      success: true,
      message: `📊 COMPARACIÓN DE PROGRESO

📅 Período: ${formatDate(beforeDate)} → ${formatDate(afterDate)} (${daysBetween} días)

${changes.length > 0 ? changes.join('\n') : 'Sin cambios significativos registrados.'}

💡 Consejo: Sigue subiendo fotos regularmente para trackear tu progreso visual.`,
      data: {
        daysBetween,
        before: { id: beforePhoto.id, date: beforePhoto.created_at, snapshot: before },
        after: { id: afterPhoto.id, date: afterPhoto.created_at, snapshot: after },
        changes: {
          weight: before.weight && after.weight ? after.weight - before.weight : null,
          bodyFat:
            before.body_fat_percentage && after.body_fat_percentage
              ? after.body_fat_percentage - before.body_fat_percentage
              : null,
          muscleMass:
            before.muscle_mass && after.muscle_mass ? after.muscle_mass - before.muscle_mass : null,
        },
      },
    };
  } catch (error) {
    console.error('progressComparePhotos error:', error);
    return { success: false, message: 'Error al comparar fotos.' };
  }
}

// ============================================================================
// PLAN TOOLS - Nutrición y Farmacología
// ============================================================================

/**
 * Agrega una comida al plan nutricional
 * Usa la tabla meals con ingredients como JSONB
 * Calcula gramos automáticamente con IA basándose en macros
 */
export async function planAddMeal(
  userId: string,
  time: string,
  ingredients: Array<{ name: string; quantity?: string; portion?: string }>
): Promise<HankToolResult> {
  try {
    // Obtener contexto del usuario para cálculos personalizados
    let userContext: { goal?: string; weight?: number; mealCount?: number } = {};
    try {
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('weight, goal')
        .eq('user_id', userId)
        .single();

      if (profile) {
        // Extraer peso numérico (ej: '75 KG' -> 75)
        const weightMatch = profile.weight?.match(/(\d+)/);
        userContext = {
          weight: weightMatch ? parseInt(weightMatch[1]) : 75,
          goal: profile.goal || 'MANTENER',
          mealCount: 4, // Estimación típica
        };
      }
    } catch (e) {
      // Sin perfil, usar defaults
      userContext = { weight: 75, goal: 'MANTENER', mealCount: 4 };
    }

    // Calcular macros y gramos óptimos con IA
    const ingredientsWithId = ingredients.map((ing, idx) => ({
      id: `ing-${idx}`,
      name: ing.name,
      quantity: ing.quantity || '',
      portion: ing.portion || '',
    }));

    console.warn(
      '🧮 Calculando gramos óptimos para:',
      ingredientsWithId.map((i) => i.name)
    );
    const calculatedIngredients = await calculateMacrosWithAI(ingredientsWithId, userContext);

    // Formatear ingredientes como JSONB array con los gramos calculados
    const ingredientsJson = calculatedIngredients.map((ing, idx) => ({
      name: ing.name,
      quantity: ing.quantity || '~100g',
      portion: ing.portion || '',
      nutritionInfo: ing.nutritionInfo
        ? {
            calories: ing.nutritionInfo.calories,
            protein: ing.nutritionInfo.protein,
            carbs: ing.nutritionInfo.carbs,
            fat: ing.nutritionInfo.fat,
          }
        : undefined,
      order: idx,
    }));

    // Crear nombre de comida basado en hora
    const hour = parseInt(time.split(':')[0], 10);
    let mealName = 'Comida';
    if (hour >= 5 && hour < 11) mealName = 'Desayuno';
    else if (hour >= 11 && hour < 15) mealName = 'Almuerzo';
    else if (hour >= 15 && hour < 18) mealName = 'Merienda';
    else if (hour >= 18 && hour < 22) mealName = 'Cena';
    else mealName = 'Snack';

    // Crear comida directamente en meals
    const { data: mealData, error: mealError } = await supabase
      .from('meals')
      .insert({
        user_id: userId,
        name: mealName,
        scheduled_time: time,
        ingredients: ingredientsJson,
        is_completed: false,
      })
      .select()
      .single();

    if (mealError) throw mealError;

    const ingredientNames = ingredients.map((i) => i.name).join(', ');

    return {
      success: true,
      message: `✅ ${mealName} agregado a las ${time}: ${ingredientNames}`,
      data: { mealId: mealData.id },
      affectedRecords: 1,
    };
  } catch (error) {
    console.error('planAddMeal error:', error);
    return { success: false, message: 'Error al agregar comida.' };
  }
}

/**
 * Elimina una comida del plan
 */
export async function planRemoveMeal(
  userId: string,
  options: { mealId?: string; time?: string; position?: string }
): Promise<HankToolResult> {
  try {
    let mealId = options.mealId;

    if (!mealId) {
      // Find meal by time or position (usar scheduled_time, NO time)
      const { data: meals } = await supabase
        .from('meals')
        .select('id, scheduled_time')
        .eq('user_id', userId)
        .order('scheduled_time', { ascending: true });

      if (!meals || meals.length === 0) {
        return { success: false, message: 'No hay comidas para eliminar.' };
      }

      if (options.time) {
        const meal = meals.find((m) => m.scheduled_time?.startsWith(options.time!));
        if (meal) mealId = meal.id;
      } else if (options.position) {
        if (options.position === 'first') mealId = meals[0].id;
        else if (options.position === 'last') mealId = meals[meals.length - 1].id;
        else {
          const idx = parseInt(options.position, 10) - 1;
          if (meals[idx]) mealId = meals[idx].id;
        }
      }
    }

    if (!mealId) {
      return { success: false, message: 'No encontré la comida especificada.' };
    }

    const { error } = await supabase.from('meals').delete().eq('id', mealId);

    if (error) throw error;

    return {
      success: true,
      message: '✅ Comida eliminada del plan.',
      affectedRecords: 1,
    };
  } catch (error) {
    console.error('planRemoveMeal error:', error);
    return { success: false, message: 'Error al eliminar comida.' };
  }
}

/**
 * Actualiza la hora de una comida
 */
export async function planUpdateMealTime(
  userId: string,
  newTime: string,
  options: { mealId?: string; position?: string; currentTime?: string }
): Promise<HankToolResult> {
  try {
    let mealId = options.mealId;
    let mealName = 'comida';

    // Buscar por hora actual si se proporciona
    if (!mealId && options.currentTime) {
      const { data: meals } = await supabase
        .from('meals')
        .select('id, name, scheduled_time')
        .eq('user_id', userId);

      if (meals && meals.length > 0) {
        // Buscar comida que coincida con la hora (formato flexible)
        const targetTime = options.currentTime.replace(/[^0-9:]/g, '');
        const meal = meals.find((m) => {
          const mealTime = m.scheduled_time?.slice(0, 5) || '';
          return mealTime === targetTime || mealTime.startsWith(targetTime.split(':')[0]);
        });
        if (meal) {
          mealId = meal.id;
          mealName = meal.name || 'comida';
        }
      }
    }

    // Buscar por posición si no se encontró por hora
    if (!mealId && options.position) {
      const { data: meals } = await supabase
        .from('meals')
        .select('id, name')
        .eq('user_id', userId)
        .order('scheduled_time', { ascending: true });

      if (meals && meals.length > 0) {
        if (options.position === 'first') {
          mealId = meals[0].id;
          mealName = meals[0].name || 'desayuno';
        } else if (options.position === 'last') {
          mealId = meals[meals.length - 1].id;
          mealName = meals[meals.length - 1].name || 'cena';
        } else {
          const idx = parseInt(options.position, 10) - 1;
          if (meals[idx]) {
            mealId = meals[idx].id;
            mealName = meals[idx].name || 'comida';
          }
        }
      }
    }

    // Si solo hay una comida, usarla directamente
    if (!mealId) {
      const { data: meals } = await supabase.from('meals').select('id, name').eq('user_id', userId);

      if (meals && meals.length === 1) {
        mealId = meals[0].id;
        mealName = meals[0].name || 'comida';
      }
    }

    if (!mealId) {
      return {
        success: false,
        message:
          'No encontré la comida especificada. Intenta decir "cambia la hora de mi desayuno a las 7".',
      };
    }

    const { error } = await supabase
      .from('meals')
      .update({ scheduled_time: newTime })
      .eq('id', mealId);

    if (error) throw error;

    // Convertir a formato AM/PM
    const [hours, mins] = newTime.split(':').map(Number);
    const period = hours >= 12 ? 'PM' : 'AM';
    const hours12 = hours % 12 || 12;
    const timeFormatted = `${hours12}:${mins.toString().padStart(2, '0')} ${period}`;

    return {
      success: true,
      message: `✅ Hora de ${mealName.toLowerCase()} actualizada a ${timeFormatted}.`,
      affectedRecords: 1,
    };
  } catch (error) {
    console.error('planUpdateMealTime error:', error);
    return { success: false, message: 'Error al actualizar hora.' };
  }
}

/**
 * Actualiza los ingredientes de una comida
 * Usa el modelo JSONB en meals.ingredients (modelo actual)
 * Acepta identificador natural: "cena", "almuerzo", "comida 3", "última", etc.
 */
export async function planUpdateIngredients(
  userId: string,
  mealIdentifier: string,
  ingredients: Array<{ name: string; quantity?: string; portion?: string }>
): Promise<HankToolResult> {
  try {
    // Obtener todas las comidas para buscar la correcta
    const { data: meals, error: fetchError } = await supabase
      .from('meals')
      .select('id, name, scheduled_time, ingredients')
      .eq('user_id', userId)
      .order('scheduled_time', { ascending: true });

    if (fetchError) throw fetchError;
    if (!meals || meals.length === 0) {
      return { success: false, message: 'No tienes comidas configuradas.' };
    }

    // ===== BUSCAR LA COMIDA POR IDENTIFICADOR NATURAL =====
    let targetMeal: any = null;
    let mealIndex = 0;
    const identifier = mealIdentifier.toLowerCase();

    // Mapear palabras comunes a horas aproximadas
    const mealTimeMap: Record<string, number[]> = {
      desayuno: [5, 6, 7, 8, 9, 10],
      almuerzo: [11, 12, 13, 14],
      comida: [11, 12, 13, 14, 15],
      merienda: [15, 16, 17, 18],
      cena: [18, 19, 20, 21, 22, 23],
      snack: [10, 11, 15, 16, 17],
    };

    // Palabras especiales que siempre funcionan
    if (identifier.includes('última') || identifier.includes('ultima')) {
      targetMeal = meals[meals.length - 1];
      mealIndex = meals.length - 1;
    } else if (identifier.includes('primera') || identifier.includes('primer')) {
      targetMeal = meals[0];
      mealIndex = 0;
    } else if (
      identifier.includes('segunda') ||
      identifier.includes('segundo') ||
      identifier === '2'
    ) {
      if (meals.length >= 2) {
        targetMeal = meals[1];
        mealIndex = 1;
      }
    } else if (
      identifier.includes('tercera') ||
      identifier.includes('tercer') ||
      identifier === '3'
    ) {
      if (meals.length >= 3) {
        targetMeal = meals[2];
        mealIndex = 2;
      }
    } else if (
      identifier.includes('cuarta') ||
      identifier.includes('cuarto') ||
      identifier === '4'
    ) {
      if (meals.length >= 4) {
        targetMeal = meals[3];
        mealIndex = 3;
      }
    } else if (
      identifier.includes('quinta') ||
      identifier.includes('quinto') ||
      identifier === '5'
    ) {
      if (meals.length >= 5) {
        targetMeal = meals[4];
        mealIndex = 4;
      }
    } else {
      // Buscar por palabra clave de tiempo (desayuno, cena, etc.)
      for (const [keyword, hours] of Object.entries(mealTimeMap)) {
        if (identifier.includes(keyword)) {
          // Buscar comida en esas horas
          for (let i = 0; i < meals.length; i++) {
            const mealTime = meals[i].scheduled_time || '12:00';
            const mealHour = parseInt(mealTime.split(':')[0]);
            if (hours.includes(mealHour)) {
              targetMeal = meals[i];
              mealIndex = i;
              break;
            }
          }

          // Fallback inteligente si no encontró por hora
          if (!targetMeal) {
            if (keyword === 'cena') {
              targetMeal = meals[meals.length - 1];
              mealIndex = meals.length - 1;
            } else if (keyword === 'desayuno') {
              targetMeal = meals[0];
              mealIndex = 0;
            } else if (keyword === 'almuerzo' || keyword === 'comida') {
              targetMeal = meals.length >= 2 ? meals[1] : meals[0];
              mealIndex = meals.length >= 2 ? 1 : 0;
            }
          }
          break;
        }
      }
    }

    // Si no encontró por keyword, buscar por hora exacta
    if (!targetMeal && identifier.includes(':')) {
      targetMeal = meals.find((m, i) => {
        const mealTime = m.scheduled_time || '';
        if (mealTime.startsWith(identifier)) {
          mealIndex = i;
          return true;
        }
        return false;
      });
    }

    // Buscar por número en el texto
    if (!targetMeal) {
      const numMatch = identifier.match(/(\d+)/);
      if (numMatch) {
        const num = parseInt(numMatch[1]);
        if (num >= 1 && num <= meals.length) {
          targetMeal = meals[num - 1];
          mealIndex = num - 1;
        }
      }
    }

    // Buscar por nombre de comida (match parcial)
    if (!targetMeal) {
      targetMeal = meals.find((m, i) => {
        if (m.name && m.name.toLowerCase().includes(identifier)) {
          mealIndex = i;
          return true;
        }
        return false;
      });
    }

    // Si aún no encontró, intentar con UUID directo (por si acaso)
    if (!targetMeal && identifier.includes('-') && identifier.length > 30) {
      targetMeal = meals.find((m, i) => {
        if (m.id === identifier) {
          mealIndex = i;
          return true;
        }
        return false;
      });
    }

    if (!targetMeal) {
      // Listar las comidas disponibles para ayudar al usuario
      const available = meals
        .map((m, i) => {
          const time = m.scheduled_time || '12:00';
          const [h] = time.split(':').map(Number);
          const period = h >= 12 ? 'PM' : 'AM';
          const h12 = h % 12 || 12;
          return `${i + 1}. ${m.name || 'Comida'} (${h12}:00 ${period})`;
        })
        .join('\n');
      return {
        success: false,
        message: `No encontré esa comida. Tus comidas son:\n${available}\n\nPuedes decir "cena", "almuerzo", "comida 3", "la última", etc.`,
      };
    }

    // ===== CALCULAR MACROS Y ACTUALIZAR =====
    const ingredientsWithId = ingredients.map((ing, idx) => ({
      id: `ing-${idx}`,
      name: ing.name,
      quantity: ing.quantity || '',
      portion: ing.portion || '',
    }));

    let finalIngredients = ingredientsWithId;

    try {
      const calculatedIngredients = await calculateMacrosWithAI(ingredientsWithId);
      finalIngredients = calculatedIngredients.map((ing, idx) => ({
        id: `ing-${idx}`,
        name: ing.name,
        quantity: ing.quantity || '~100g',
        portion: ing.portion || '',
        nutritionInfo: ing.nutritionInfo
          ? {
              calories: ing.nutritionInfo.calories,
              protein: ing.nutritionInfo.protein,
              carbs: ing.nutritionInfo.carbs,
              fat: ing.nutritionInfo.fat,
            }
          : undefined,
        order: idx,
      }));
    } catch (calcError) {
      console.warn('Error calculando macros, usando valores sin macros:', calcError);
      finalIngredients = ingredients.map((ing, idx) => ({
        id: `ing-${idx}`,
        name: ing.name,
        quantity: ing.quantity || '~100g',
        portion: ing.portion || '',
        order: idx,
      }));
    }

    // Actualizar ingredientes como JSONB
    const { error: updateError } = await supabase
      .from('meals')
      .update({
        ingredients: finalIngredients,
        updated_at: new Date().toISOString(),
      })
      .eq('id', targetMeal.id);

    if (updateError) throw updateError;

    const ingredientNames = ingredients.map((i) => i.name).join(', ');
    const mealName = targetMeal.name || `Comida ${mealIndex + 1}`;

    return {
      success: true,
      message: `✅ Ingredientes de ${mealName} actualizados: ${ingredientNames}`,
      data: {
        mealId: targetMeal.id,
        mealName,
        mealIndex: mealIndex + 1,
        ingredients: finalIngredients,
      },
      affectedRecords: ingredients.length,
    };
  } catch (error) {
    console.error('planUpdateIngredients error:', error);
    return { success: false, message: 'Error al actualizar ingredientes.' };
  }
}

// ============================================================================
// OMNISCIENT TOOL: Obtener contexto completo del usuario
// ============================================================================
export async function getFullUserContext(userId: string): Promise<HankToolResult> {
  try {
    // 1. Perfil del usuario (training data)
    const { data: profile } = await supabase.from('profiles').select('*').eq('id', userId).single();

    // 1.5 User profile (body data - peso, altura, objetivo)
    const { data: userProfile } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('user_id', userId)
      .single();

    // 2. Todas las comidas (nuevo formato con scheduled_time e ingredients)
    const { data: meals } = await supabase
      .from('meals')
      .select(
        'id, name, scheduled_time, ingredients, calories, protein_g, carbs_g, fat_g, is_completed'
      )
      .eq('user_id', userId)
      .order('scheduled_time', { ascending: true });

    // 3. Stack de suplementos
    const { data: stack } = await supabase
      .from('supplement_stack')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true);

    // 4. Ejercicios del usuario
    const { data: exercises } = await supabase
      .from('user_assets')
      .select('id, name, training_days, metadata')
      .eq('user_id', userId)
      .eq('asset_type', 'gym_exercise')
      .is('deleted_at', null);

    // 4.5 Fotos de progreso (las últimas 5 para contexto de composición corporal)
    // El snapshot contiene: weight, body_fat_percentage, goal, measurements, etc.
    const { data: progressPhotos } = await supabase
      .from('progress_photos')
      .select('id, snapshot, notes, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(5);

    // 4.6 Personal Records (para contexto de nivel)
    const { data: personalRecords } = await supabase
      .from('personal_records')
      .select('exercise_name, weight_kg, reps')
      .eq('user_id', userId)
      .order('weight_kg', { ascending: false })
      .limit(5);

    // 5. Nombres de rutinas (sistema weekday)
    const routineNames = profile?.training_routine_names || {};
    const currentDay = new Date().getDay();
    const frequency = Object.values(routineNames as Record<string, string>).filter(
      (v) => (v || '').trim().length > 0
    ).length;

    // Formatear resumen
    const formatTime = (t: string) => {
      if (!t) return 'Sin hora';
      const [h, m] = t.split(':').map(Number);
      const period = h >= 12 ? 'PM' : 'AM';
      const h12 = h % 12 || 12;
      return `${h12}:${m.toString().padStart(2, '0')} ${period}`;
    };

    // Comidas (nuevo formato con ingredients JSONB)
    const mealsContext =
      meals
        ?.map((meal: any, idx: number) => {
          const time = meal.scheduled_time || 'Sin hora';
          const name = meal.name || `Comida ${idx + 1}`;
          const ingredients = meal.ingredients || [];
          const ings =
            ingredients
              .map((i: any) => `${i.name}${i.quantity ? ` (${i.quantity})` : ''}`)
              .join(', ') || 'Sin ingredientes';
          const macros = meal.calories
            ? `${meal.calories}kcal | P:${meal.protein_g}g C:${meal.carbs_g}g F:${meal.fat_g}g`
            : '';
          return `${idx + 1}. ${name} (${formatTime(time)}): ${ings}${macros ? `\n   📊 ${macros}` : ''}`;
        })
        .join('\n') || 'Sin comidas';

    // Ejercicios por día
    const exercisesByDay: Record<number, string[]> = {};
    exercises?.forEach((ex) => {
      const days = ex.training_days || [];
      days.forEach((day: number) => {
        if (!exercisesByDay[day]) exercisesByDay[day] = [];
        exercisesByDay[day].push(ex.name);
      });
    });

    const routinesContext = Object.entries(routineNames)
      .map(([day, name]) => {
        const exs = exercisesByDay[parseInt(day)] || [];
        return `${name}: ${exs.join(', ') || 'Sin ejercicios'}`;
      })
      .join('\n');

    // Stack
    const stackContext = stack?.map((s) => `${s.name} (${s.dose})`).join(', ') || 'Sin suplementos';

    // Datos físicos del usuario
    const bodyData = userProfile
      ? `
👤 DATOS FÍSICOS:
- Nombre: ${userProfile.display_name || 'Sin nombre'}
- Peso: ${userProfile.weight || 'No registrado'}
- Altura: ${userProfile.height || 'No registrado'}
- Objetivo: ${userProfile.goal || 'No definido'}
- Deporte: ${userProfile.sport || 'GYM'}
- Nivel: ${userProfile.level || 'INTERMEDIO'}`
      : `
👤 DATOS FÍSICOS: No configurados (usar valores estándar)`;

    // Progreso físico (snapshot contiene weight, body_fat_percentage, etc.)
    const progressContext =
      progressPhotos && progressPhotos.length > 0
        ? `
📸 HISTORIAL DE PROGRESO (últimas ${progressPhotos.length} fotos):
${progressPhotos
  .map(
    (p: {
      snapshot?: { weight?: string; body_fat_percentage?: string };
      notes?: string;
      created_at: string;
    }) => {
      const date = new Date(p.created_at).toLocaleDateString('es-PE');
      const snap = p.snapshot || {};
      return `- ${date}: ${snap.weight ? `${snap.weight}` : 'Sin peso'}${snap.body_fat_percentage ? `, ${snap.body_fat_percentage}% grasa` : ''}${p.notes ? ` - "${p.notes}"` : ''}`;
    }
  )
  .join('\n')}`
        : '';

    // Personal Records para contexto de nivel
    const prContext =
      personalRecords && personalRecords.length > 0
        ? `
🏆 MEJORES MARCAS:
${personalRecords.map((pr) => `- ${pr.exercise_name}: ${pr.weight_kg}kg x ${pr.reps}`).join('\n')}`
        : '';

    // Indicadores claros de estado del plan
    const hasMeals = meals && meals.length > 0;
    const hasSupplements = stack && stack.length > 0;
    const hasTraining = frequency > 0 && exercises && exercises.length > 0;

    const planStatusSummary = `
🎯 ESTADO DEL PLAN:
${hasMeals ? `✅ NUTRICIÓN: ${meals.length} comidas configuradas` : '❌ NUTRICIÓN: Sin plan de comidas'}
${hasSupplements ? `✅ SUPLEMENTACIÓN: ${stack.length} suplementos activos` : '❌ SUPLEMENTACIÓN: Sin stack configurado'}
${hasTraining ? `✅ ENTRENAMIENTO: ${frequency} días/semana, ${exercises.length} ejercicios` : '❌ ENTRENAMIENTO: Sin rutina configurada'}`;

    const fullContext = `
📊 CONTEXTO COMPLETO DEL USUARIO:
${bodyData}
${planStatusSummary}
${progressContext}
${prContext}

🏋️ ENTRENAMIENTO:
- Frecuencia: ${frequency} días/semana
- Día actual: ${currentDay}
- Rutina de hoy: ${routineNames[currentDay] || 'Sin rutina configurada'}
${routinesContext}

🍽️ COMIDAS ACTUALES:
${mealsContext}

💊 STACK ACTUAL:
${stackContext}
`.trim();

    return {
      success: true,
      message: fullContext,
      data: {
        profile,
        userProfile,
        meals,
        stack,
        exercises,
        routineNames,
        currentDay,
        progressPhotos,
        personalRecords,
        // Indicadores de estado
        hasMeals,
        hasSupplements,
        hasTraining,
      },
    };
  } catch (error) {
    console.error('getFullUserContext error:', error);
    return { success: false, message: 'Error al obtener contexto.' };
  }
}

/**
 * Obtiene detalles de una comida específica con todos sus ingredientes
 * Usa el modelo JSONB en meals.ingredients y scheduled_time
 */
export async function planGetMealDetails(
  userId: string,
  mealIdentifier: string | number // Puede ser hora (ej: "20:00", "8pm", "cena") o índice (1, 2, 3...)
): Promise<HankToolResult> {
  try {
    // Obtener todas las comidas con el modelo correcto
    const { data: meals, error } = await supabase
      .from('meals')
      .select(
        'id, name, scheduled_time, ingredients, calories, protein_g, carbs_g, fat_g, is_completed'
      )
      .eq('user_id', userId)
      .order('scheduled_time', { ascending: true });

    if (error) throw error;
    if (!meals || meals.length === 0) {
      return { success: false, message: 'No tienes comidas configuradas.' };
    }

    // Encontrar la comida
    let targetMeal: any = null;
    let mealIndex = 0;

    // Si es número, usar como índice
    if (typeof mealIdentifier === 'number') {
      const idx = mealIdentifier - 1; // Convertir a 0-based
      if (idx >= 0 && idx < meals.length) {
        targetMeal = meals[idx];
        mealIndex = idx;
      }
    } else {
      const identifier = mealIdentifier.toLowerCase();

      // Mapear palabras comunes a horas aproximadas
      const mealTimeMap: Record<string, number[]> = {
        desayuno: [5, 6, 7, 8, 9, 10],
        almuerzo: [11, 12, 13, 14],
        comida: [11, 12, 13, 14, 15],
        merienda: [15, 16, 17, 18],
        cena: [18, 19, 20, 21, 22, 23],
        snack: [10, 11, 15, 16, 17],
      };

      // Palabras especiales que siempre funcionan
      if (identifier.includes('última') || identifier.includes('ultima')) {
        targetMeal = meals[meals.length - 1];
        mealIndex = meals.length - 1;
      } else if (identifier.includes('primera') || identifier.includes('primer')) {
        targetMeal = meals[0];
        mealIndex = 0;
      } else if (
        identifier.includes('segunda') ||
        identifier.includes('segundo') ||
        identifier.includes('2')
      ) {
        if (meals.length >= 2) {
          targetMeal = meals[1];
          mealIndex = 1;
        }
      } else if (
        identifier.includes('tercera') ||
        identifier.includes('tercer') ||
        identifier.includes('3')
      ) {
        if (meals.length >= 3) {
          targetMeal = meals[2];
          mealIndex = 2;
        }
      } else {
        // Buscar por palabra clave de tiempo (desayuno, cena, etc.)
        for (const [keyword, hours] of Object.entries(mealTimeMap)) {
          if (identifier.includes(keyword)) {
            // Buscar comida en esas horas
            for (let i = 0; i < meals.length; i++) {
              const mealTime = meals[i].scheduled_time || '12:00';
              const mealHour = parseInt(mealTime.split(':')[0]);
              if (hours.includes(mealHour)) {
                targetMeal = meals[i];
                mealIndex = i;
                break;
              }
            }

            // Si no encontró en las horas esperadas, usar fallback inteligente
            if (!targetMeal) {
              if (keyword === 'cena') {
                targetMeal = meals[meals.length - 1];
                mealIndex = meals.length - 1;
              } else if (keyword === 'desayuno') {
                targetMeal = meals[0];
                mealIndex = 0;
              } else if (keyword === 'almuerzo' || keyword === 'comida') {
                if (meals.length >= 2) {
                  targetMeal = meals[1];
                  mealIndex = 1;
                } else {
                  targetMeal = meals[0];
                  mealIndex = 0;
                }
              }
            }
            break;
          }
        }
      }

      // Si no encontró por keyword, buscar por hora exacta
      if (!targetMeal && identifier.includes(':')) {
        const searchTime = identifier;
        targetMeal = meals.find((m, i) => {
          const mealTime = m.scheduled_time || '';
          if (mealTime.startsWith(searchTime)) {
            mealIndex = i;
            return true;
          }
          return false;
        });
      }

      // Último intento: buscar número en el texto
      if (!targetMeal) {
        const numMatch = identifier.match(/(\d+)/);
        if (numMatch) {
          const num = parseInt(numMatch[1]);
          if (num >= 1 && num <= meals.length) {
            targetMeal = meals[num - 1];
            mealIndex = num - 1;
          }
        }
      }
    }

    if (!targetMeal) {
      // Listar las comidas disponibles
      const available = meals
        .map((m, i) => {
          const time = m.scheduled_time || '12:00';
          const [h] = time.split(':').map(Number);
          const period = h >= 12 ? 'PM' : 'AM';
          const h12 = h % 12 || 12;
          return `${i + 1}. ${m.name || 'Comida'} (${h12}:00 ${period})`;
        })
        .join('\n');
      return {
        success: false,
        message: `No encontré esa comida. Tus comidas son:\n${available}\n\nPuedes decir "la última", "cena", "comida 3", etc.`,
      };
    }

    // Formatear la respuesta
    const formatTime = (t: string | null) => {
      if (!t) return '??:??';
      const [h, m] = t.split(':').map(Number);
      const period = h >= 12 ? 'PM' : 'AM';
      const h12 = h % 12 || 12;
      return `${h12}:${m.toString().padStart(2, '0')} ${period}`;
    };

    // Obtener ingredientes del JSONB
    const ingredients = targetMeal.ingredients || [];
    const ingredientsText =
      ingredients.length > 0
        ? ingredients
            .map((ing: any, idx: number) => {
              const macros = ing.calories
                ? ` (${ing.calories}kcal | ${ing.protein || 0}P ${ing.carbs || 0}C ${ing.fat || 0}G)`
                : '';
              return `  ${idx + 1}. ${ing.name}: ${ing.quantity || '~100g'}${macros}`;
            })
            .join('\n')
        : '  Sin ingredientes configurados';

    // Calcular totales de macros
    let totalCals = 0,
      totalP = 0,
      totalC = 0,
      totalF = 0;
    ingredients.forEach((ing: any) => {
      totalCals += ing.calories || 0;
      totalP += ing.protein || 0;
      totalC += ing.carbs || 0;
      totalF += ing.fat || 0;
    });

    const totalsStr =
      totalCals > 0
        ? `\n\n📊 TOTALES: ${Math.round(totalCals)} kcal | ${Math.round(totalP)}g P | ${Math.round(totalC)}g C | ${Math.round(totalF)}g G`
        : '';

    const statusIcon = targetMeal.is_completed ? '✅' : '⏳';

    return {
      success: true,
      message: `🍽️ ${statusIcon} ${targetMeal.name || 'COMIDA'} ${mealIndex + 1} (${formatTime(targetMeal.scheduled_time)}):\n\n📋 INGREDIENTES:\n${ingredientsText}${totalsStr}`,
      data: {
        meal: targetMeal,
        mealIndex,
        ingredients,
        macros: { calories: totalCals, protein: totalP, carbs: totalC, fat: totalF },
      },
    };
  } catch (error) {
    console.error('planGetMealDetails error:', error);
    return { success: false, message: 'Error al obtener detalles de la comida.' };
  }
}

/**
 * Obtiene todas las comidas del día con sus macros
 */
export async function planGetMeals(userId: string): Promise<HankToolResult> {
  try {
    const { data: meals, error } = await supabase
      .from('meals')
      .select(
        'id, name, scheduled_time, ingredients, calories, protein_g, carbs_g, fat_g, is_completed'
      )
      .eq('user_id', userId)
      .order('scheduled_time', { ascending: true });

    if (error) throw error;

    if (!meals || meals.length === 0) {
      return {
        success: true,
        message: '🍽️ No tienes comidas configuradas todavía.',
        data: { meals: [] },
      };
    }

    const totalMeals = meals.length;

    // Format response con macros
    const formatTime = (t: string | null) => {
      if (!t) return '??:??';
      const [h, m] = t.split(':').map(Number);
      const period = h >= 12 ? 'PM' : 'AM';
      const h12 = h % 12 || 12;
      return `${h12}:${m.toString().padStart(2, '0')} ${period}`;
    };

    // Calcular totales
    let totalCals = 0,
      totalP = 0,
      totalC = 0,
      totalF = 0;

    const mealsSummary = meals
      .map((m: any, i: number) => {
        const ingredients = m.ingredients || [];

        // Sumar macros de ingredientes si están disponibles
        let mealCals = m.calories || 0;
        let mealP = m.protein_g || 0;
        let mealC = m.carbs_g || 0;
        let mealF = m.fat_g || 0;

        // Si no hay macros a nivel de comida, sumar de ingredientes
        if (!mealCals && ingredients.length > 0) {
          ingredients.forEach((ing: any) => {
            mealCals += ing.calories || 0;
            mealP += ing.protein || 0;
            mealC += ing.carbs || 0;
            mealF += ing.fat || 0;
          });
        }

        totalCals += mealCals;
        totalP += mealP;
        totalC += mealC;
        totalF += mealF;

        const ings =
          ingredients.map((ing: any) => `${ing.name} (${ing.quantity || '~100g'})`).join(', ') ||
          'Sin ingredientes';
        const macrosStr =
          mealCals > 0
            ? ` | ${Math.round(mealCals)}kcal ${Math.round(mealP)}P ${Math.round(mealC)}C ${Math.round(mealF)}G`
            : '';

        // Usar nombre inteligente basado en posición
        const smartName = getSmartMealName(i, totalMeals);
        const statusIcon = m.is_completed ? '✅' : '⏳';

        return `${statusIcon} ${smartName} (${formatTime(m.scheduled_time)}): ${ings}${macrosStr}`;
      })
      .join('\n');

    const totalsStr =
      totalCals > 0
        ? `\n\n📊 TOTAL DEL DÍA: ${Math.round(totalCals)} kcal | ${Math.round(totalP)}g P | ${Math.round(totalC)}g C | ${Math.round(totalF)}g G`
        : '';

    return {
      success: true,
      message: `🍽️ TUS COMIDAS DE HOY:\n${mealsSummary}${totalsStr}`,
      data: { meals, totals: { calories: totalCals, protein: totalP, carbs: totalC, fat: totalF } },
    };
  } catch (error) {
    console.error('planGetMeals error:', error);
    return { success: false, message: 'Error al obtener comidas.' };
  }
}

/**
 * Genera una lista de compras agregando todos los ingredientes del plan
 */
export async function planGetShoppingList(
  userId: string,
  period: 'today' | '3days' | 'week' = 'today'
): Promise<HankToolResult> {
  try {
    // Obtener todas las comidas con sus opciones
    const { data: meals, error } = await supabase
      .from('meals')
      .select(
        `
        id, 
        name, 
        ingredients,
        meal_options (
          id,
          name,
          ingredients,
          is_selected
        )
      `
      )
      .eq('user_id', userId)
      .order('scheduled_time', { ascending: true });

    if (error) throw error;

    if (!meals || meals.length === 0) {
      return {
        success: true,
        message:
          '🛒 No tienes comidas configuradas. Agrega comidas para generar tu lista de compras.',
        data: { shoppingList: [], totalItems: 0 },
      };
    }

    // Calcular multiplicador según periodo
    const daysMultiplier = period === 'week' ? 7 : period === '3days' ? 3 : 1;
    const periodLabel = period === 'week' ? 'la semana' : period === '3days' ? '3 días' : 'hoy';

    // Mapa para agrupar ingredientes por nombre normalizado
    const ingredientMap = new Map<string, { name: string; grams: number; meals: string[] }>();

    // Helper para normalizar nombre
    const normalize = (name: string) =>
      name
        .toLowerCase()
        .trim()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/s$/, '');

    // Helper para parsear cantidad a gramos
    const parseGrams = (qty: string): number => {
      if (!qty) return 100;
      const num = parseFloat(qty.match(/[\d.]+/)?.[0] || '100');
      const lower = qty.toLowerCase();
      if (lower.includes('kg')) return num * 1000;
      if (lower.includes('lb')) return num * 453.6;
      if (lower.includes('oz')) return num * 28.35;
      return num;
    };

    // Helper para formatear cantidad
    const formatQty = (grams: number): string => {
      if (grams >= 1000) return `${(grams / 1000).toFixed(1)}kg`;
      return `${Math.round(grams)}g`;
    };

    // Procesar cada comida
    for (const meal of meals) {
      const mealName = meal.name || 'Comida';

      // Ingredientes principales
      const mainIngredients = (meal.ingredients as any[]) || [];

      for (const ing of mainIngredients) {
        if (!ing?.name || ing.name.trim().length < 2) continue;

        const key = normalize(ing.name);
        const grams = parseGrams(ing.quantity || '100g') * daysMultiplier;

        if (ingredientMap.has(key)) {
          const existing = ingredientMap.get(key)!;
          existing.grams += grams;
          if (!existing.meals.includes(mealName)) {
            existing.meals.push(mealName);
          }
        } else {
          ingredientMap.set(key, {
            name: ing.name.charAt(0).toUpperCase() + ing.name.slice(1).toLowerCase(),
            grams,
            meals: [mealName],
          });
        }
      }
    }

    // Convertir a array y ordenar por cantidad
    const shoppingItems = Array.from(ingredientMap.values())
      .sort((a, b) => b.grams - a.grams)
      .map((item) => ({
        name: item.name,
        quantity: formatQty(item.grams),
        usedIn: item.meals.join(', '),
      }));

    if (shoppingItems.length === 0) {
      return {
        success: true,
        message: '🛒 Tus comidas no tienen ingredientes configurados aún.',
        data: { shoppingList: [], totalItems: 0 },
      };
    }

    // Formatear respuesta
    const itemsText = shoppingItems
      .map((item, i) => `${i + 1}. **${item.name}**: ${item.quantity}`)
      .join('\n');

    return {
      success: true,
      message: `🛒 **LISTA DE COMPRAS** (${periodLabel}):\n\n${itemsText}\n\n📊 **Total:** ${shoppingItems.length} ingredientes`,
      data: {
        shoppingList: shoppingItems,
        totalItems: shoppingItems.length,
        period,
        periodLabel,
      },
    };
  } catch (error) {
    console.error('planGetShoppingList error:', error);
    return { success: false, message: 'Error al generar la lista de compras.' };
  }
}

/**
 * Helper: Genera nombre inteligente de comida basado en posición y total
 */
function getSmartMealName(index: number, total: number): string {
  if (total === 1) return 'COMIDA ÚNICA';
  if (total === 2) return index === 0 ? 'DESAYUNO' : 'CENA';
  if (total === 3) return ['DESAYUNO', 'ALMUERZO', 'CENA'][index] || `COMIDA ${index + 1}`;
  if (total === 4)
    return ['DESAYUNO', 'ALMUERZO', 'MERIENDA', 'CENA'][index] || `COMIDA ${index + 1}`;
  if (total === 5) {
    return (
      ['DESAYUNO', 'MEDIA MAÑANA', 'ALMUERZO', 'MEDIA TARDE', 'CENA'][index] ||
      `COMIDA ${index + 1}`
    );
  }
  if (total === 6) {
    return (
      ['DESAYUNO', 'MEDIA MAÑANA', 'ALMUERZO', 'MERIENDA', 'CENA', 'SNACK NOCTURNO'][index] ||
      `COMIDA ${index + 1}`
    );
  }
  return `COMIDA ${index + 1}`;
}

/**
 * Obtiene la próxima comida basándose en la hora actual
 */
export async function planGetNextMeal(userId: string): Promise<HankToolResult> {
  try {
    // Obtener TODAS las comidas para calcular el total y nombres inteligentes
    const { data: allMeals, error } = await supabase
      .from('meals')
      .select(
        'id, name, scheduled_time, ingredients, calories, protein_g, carbs_g, fat_g, is_completed'
      )
      .eq('user_id', userId)
      .order('scheduled_time', { ascending: true });

    if (error) throw error;

    if (!allMeals || allMeals.length === 0) {
      return {
        success: true,
        message: '🍽️ No tienes comidas configuradas todavía.',
        data: { nextMeal: null },
      };
    }

    const totalMeals = allMeals.length;

    // Obtener hora actual
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    const currentTimeMinutes = currentHour * 60 + currentMinute;

    // Encontrar la próxima comida (no completada y después de la hora actual)
    let nextMeal = null;
    let nextMealIndex = -1;

    for (let i = 0; i < allMeals.length; i++) {
      const meal = allMeals[i];
      if (!meal.scheduled_time || meal.is_completed) continue;

      const [h, m] = meal.scheduled_time.split(':').map(Number);
      const mealTimeMinutes = h * 60 + m;

      // Si la comida es después de la hora actual
      if (mealTimeMinutes > currentTimeMinutes) {
        nextMeal = meal;
        nextMealIndex = i;
        break;
      }
    }

    // Si no hay comida después de la hora actual
    if (!nextMeal || nextMealIndex === -1) {
      return {
        success: true,
        message: '🌙 Ya no tienes más comidas programadas para hoy. ¡Descansa!',
        data: { nextMeal: null },
      };
    }

    // Obtener nombre inteligente basado en posición
    const smartName = getSmartMealName(nextMealIndex, totalMeals);

    // Formatear hora
    const formatTime = (t: string) => {
      const [h, m] = t.split(':').map(Number);
      const period = h >= 12 ? 'PM' : 'AM';
      const h12 = h % 12 || 12;
      return `${h12}:${m.toString().padStart(2, '0')} ${period}`;
    };

    // Calcular tiempo restante
    const [nh, nm] = nextMeal.scheduled_time.split(':').map(Number);
    const nextMealMinutes = nh * 60 + nm;
    const minutesUntil = nextMealMinutes - currentTimeMinutes;
    const hoursUntil = Math.floor(minutesUntil / 60);
    const minsUntil = minutesUntil % 60;
    const timeUntilStr = hoursUntil > 0 ? `${hoursUntil}h ${minsUntil}min` : `${minsUntil} minutos`;

    // Ingredientes
    const ingredients = nextMeal.ingredients || [];
    const ingsStr =
      ingredients.length > 0
        ? ingredients.map((ing: any) => ing.name).join(', ')
        : 'Sin ingredientes definidos';

    // Macros
    const macrosStr = nextMeal.calories
      ? `\n📊 ${Math.round(nextMeal.calories)} kcal | ${Math.round(nextMeal.protein_g || 0)}P | ${Math.round(nextMeal.carbs_g || 0)}C | ${Math.round(nextMeal.fat_g || 0)}G`
      : '';

    return {
      success: true,
      message: `🍽️ TU PRÓXIMA COMIDA:\n\n📍 ${smartName} a las ${formatTime(nextMeal.scheduled_time)}\n⏱️ En ${timeUntilStr}\n🥗 ${ingsStr}${macrosStr}`,
      data: {
        nextMeal: { ...nextMeal, smartName },
        mealIndex: nextMealIndex,
        totalMeals,
        timeUntil: { hours: hoursUntil, minutes: minsUntil },
        currentTime: `${currentHour}:${currentMinute.toString().padStart(2, '0')}`,
      },
    };
  } catch (error) {
    console.error('planGetNextMeal error:', error);
    return { success: false, message: 'Error al obtener la próxima comida.' };
  }
}

/**
 * Obtiene la canción actual de Spotify
 */
export async function spotifyGetCurrentTrack(): Promise<HankToolResult> {
  try {
    const track = await spotify.getCurrentTrack();

    if (!track) {
      return {
        success: true,
        message: '🎵 No estás reproduciendo nada en Spotify ahora mismo.',
        data: { track: null, isPlaying: false },
      };
    }

    return {
      success: true,
      message: `🎵 Estás escuchando: "${track.name}" de ${track.artist}\n💿 Álbum: ${track.album}`,
      data: {
        track: {
          name: track.name,
          artist: track.artist,
          album: track.album,
          uri: track.uri,
        },
        isPlaying: true,
      },
    };
  } catch (error) {
    console.error('spotifyGetCurrentTrack error:', error);
    return {
      success: false,
      message: '⚠️ No pude conectar con Spotify. ¿Tienes la app abierta?',
    };
  }
}

/**
 * Agrega un suplemento al stack
 */
export async function planAddSupplement(
  userId: string,
  name: string,
  dose: string,
  options?: {
    type?: 'pill' | 'powder' | 'liquid' | 'syringe';
    time?: string;
    isPreWorkout?: boolean;
    isPostWorkout?: boolean;
  }
): Promise<HankToolResult> {
  try {
    const { error } = await supabase.from('supplement_stack').insert({
      user_id: userId,
      name: name.toUpperCase(),
      dose,
      type: options?.type || 'pill',
      time: options?.time,
      is_pre_workout: options?.isPreWorkout || false,
      is_post_workout: options?.isPostWorkout || false,
      is_active: true,
    });

    if (error) throw error;

    let timing = '';
    if (options?.isPreWorkout) timing = ' (Pre-entreno)';
    if (options?.isPostWorkout) timing = ' (Post-entreno)';

    return {
      success: true,
      message: `✅ ${name.toUpperCase()} (${dose}) agregado al stack${timing}.`,
      affectedRecords: 1,
    };
  } catch (error) {
    console.error('planAddSupplement error:', error);
    return { success: false, message: 'Error al agregar suplemento.' };
  }
}

/**
 * Elimina un suplemento del stack
 */
export async function planRemoveSupplement(userId: string, name: string): Promise<HankToolResult> {
  try {
    const { data, error } = await supabase
      .from('supplement_stack')
      .delete()
      .eq('user_id', userId)
      .ilike('name', `%${name}%`)
      .select();

    if (error) throw error;

    if (!data || data.length === 0) {
      return { success: false, message: `No encontré "${name}" en tu stack.` };
    }

    return {
      success: true,
      message: `✅ ${data[0].name} eliminado del stack.`,
      affectedRecords: 1,
    };
  } catch (error) {
    console.error('planRemoveSupplement error:', error);
    return { success: false, message: 'Error al eliminar suplemento.' };
  }
}

/**
 * Actualiza la(s) hora(s) de un suplemento
 * Soporta tanto un solo horario (newTime) como múltiples (newTimes)
 */
export async function planUpdateSupplementTime(
  userId: string,
  name: string,
  newTime?: string,
  newTimes?: string[]
): Promise<HankToolResult> {
  try {
    // Buscar el suplemento por nombre
    const { data: supplements } = await supabase
      .from('supplement_stack')
      .select('id, name')
      .eq('user_id', userId)
      .ilike('name', `%${name}%`)
      .eq('is_active', true);

    if (!supplements || supplements.length === 0) {
      return { success: false, message: `No encontré "${name}" en tu stack.` };
    }

    const supplement = supplements[0];

    // Helper para formatear hora a AM/PM
    const formatTime = (time24: string): string => {
      const [hours, mins] = time24.split(':').map(Number);
      const period = hours >= 12 ? 'PM' : 'AM';
      const hours12 = hours % 12 || 12;
      return `${hours12}:${(mins || 0).toString().padStart(2, '0')} ${period}`;
    };

    // Determinar si es un solo horario o múltiples
    if (newTimes && newTimes.length > 0) {
      // Múltiples horarios - usar campo times[]
      const { error } = await supabase
        .from('supplement_stack')
        .update({
          times: newTimes,
          time: newTimes[0], // También guardar el primero en time por compatibilidad
          is_pre_workout: false,
          is_post_workout: false,
        })
        .eq('id', supplement.id);

      if (error) throw error;

      const timesFormatted = newTimes.map(formatTime).join(', ');
      return {
        success: true,
        message: `✅ ${supplement.name} actualizado a ${newTimes.length} tomas: ${timesFormatted}.`,
        affectedRecords: 1,
      };
    } else if (newTime) {
      // Un solo horario
      const { error } = await supabase
        .from('supplement_stack')
        .update({
          time: newTime,
          times: null, // Limpiar array de múltiples
          is_pre_workout: false,
          is_post_workout: false,
        })
        .eq('id', supplement.id);

      if (error) throw error;

      return {
        success: true,
        message: `✅ Hora de ${supplement.name} actualizada a ${formatTime(newTime)}.`,
        affectedRecords: 1,
      };
    } else {
      return { success: false, message: 'Debes especificar newTime o newTimes.' };
    }
  } catch (error) {
    console.error('planUpdateSupplementTime error:', error);
    return { success: false, message: 'Error al actualizar hora del suplemento.' };
  }
}

/**
 * Actualiza la dosis de un suplemento
 */
export async function planUpdateSupplementDose(
  userId: string,
  name: string,
  newDose: string
): Promise<HankToolResult> {
  try {
    const { data: supplements } = await supabase
      .from('supplement_stack')
      .select('id, name, dose')
      .eq('user_id', userId)
      .ilike('name', `%${name}%`)
      .eq('is_active', true);

    if (!supplements || supplements.length === 0) {
      return { success: false, message: `No encontré "${name}" en tu stack.` };
    }

    const supplement = supplements[0];
    const oldDose = supplement.dose;

    const { error } = await supabase
      .from('supplement_stack')
      .update({ dose: newDose })
      .eq('id', supplement.id);

    if (error) throw error;

    return {
      success: true,
      message: `✅ Dosis de ${supplement.name} actualizada: ${oldDose} → ${newDose}`,
      affectedRecords: 1,
    };
  } catch (error) {
    console.error('planUpdateSupplementDose error:', error);
    return { success: false, message: 'Error al actualizar dosis del suplemento.' };
  }
}

/**
 * Renombra un suplemento
 */
export async function planUpdateSupplementName(
  userId: string,
  oldName: string,
  newName: string
): Promise<HankToolResult> {
  try {
    const { data: supplements } = await supabase
      .from('supplement_stack')
      .select('id, name')
      .eq('user_id', userId)
      .ilike('name', `%${oldName}%`)
      .eq('is_active', true);

    if (!supplements || supplements.length === 0) {
      return { success: false, message: `No encontré "${oldName}" en tu stack.` };
    }

    const supplement = supplements[0];

    const { error } = await supabase
      .from('supplement_stack')
      .update({ name: newName })
      .eq('id', supplement.id);

    if (error) throw error;

    return {
      success: true,
      message: `✅ Suplemento renombrado: ${supplement.name} → ${newName}`,
      affectedRecords: 1,
    };
  } catch (error) {
    console.error('planUpdateSupplementName error:', error);
    return { success: false, message: 'Error al renombrar suplemento.' };
  }
}

/**
 * Actualiza el nombre de una comida
 */
export async function planUpdateMealName(
  userId: string,
  newName: string,
  mealId?: string,
  position?: string
): Promise<HankToolResult> {
  try {
    let targetMealId = mealId;

    if (!targetMealId && position) {
      // Buscar por posición
      const { data: meals } = await supabase
        .from('meals')
        .select('id, name')
        .eq('user_id', userId)
        .order('scheduled_time', { ascending: true });

      if (!meals || meals.length === 0) {
        return { success: false, message: 'No tienes comidas configuradas.' };
      }

      if (position === 'first') {
        targetMealId = meals[0].id;
      } else if (position === 'last') {
        targetMealId = meals[meals.length - 1].id;
      } else {
        const idx = parseInt(position) - 1;
        if (idx >= 0 && idx < meals.length) {
          targetMealId = meals[idx].id;
        }
      }
    }

    if (!targetMealId) {
      return { success: false, message: 'Especifica la comida a renombrar (ID o posición).' };
    }

    const { data: meal, error: fetchError } = await supabase
      .from('meals')
      .select('name')
      .eq('id', targetMealId)
      .single();

    if (fetchError || !meal) {
      return { success: false, message: 'No encontré esa comida.' };
    }

    const { error } = await supabase.from('meals').update({ name: newName }).eq('id', targetMealId);

    if (error) throw error;

    return {
      success: true,
      message: `✅ Comida renombrada: ${meal.name || 'Sin nombre'} → ${newName}`,
      affectedRecords: 1,
    };
  } catch (error) {
    console.error('planUpdateMealName error:', error);
    return { success: false, message: 'Error al renombrar comida.' };
  }
}

/**
 * Actualiza los macros de una comida manualmente
 */
export async function planUpdateMealMacros(
  userId: string,
  mealId?: string,
  position?: string,
  calories?: number,
  protein?: number,
  carbs?: number,
  fat?: number
): Promise<HankToolResult> {
  try {
    let targetMealId = mealId;

    if (!targetMealId && position) {
      const { data: meals } = await supabase
        .from('meals')
        .select('id')
        .eq('user_id', userId)
        .order('scheduled_time', { ascending: true });

      if (!meals || meals.length === 0) {
        return { success: false, message: 'No tienes comidas configuradas.' };
      }

      if (position === 'first') {
        targetMealId = meals[0].id;
      } else if (position === 'last') {
        targetMealId = meals[meals.length - 1].id;
      } else {
        const idx = parseInt(position) - 1;
        if (idx >= 0 && idx < meals.length) {
          targetMealId = meals[idx].id;
        }
      }
    }

    if (!targetMealId) {
      return { success: false, message: 'Especifica la comida a actualizar.' };
    }

    // Construir objeto de actualización solo con campos proporcionados
    const updates: Record<string, number> = {};
    const changes: string[] = [];

    if (calories !== undefined) {
      updates.calories = calories;
      changes.push(`${calories} kcal`);
    }
    if (protein !== undefined) {
      updates.protein_g = protein;
      changes.push(`P: ${protein}g`);
    }
    if (carbs !== undefined) {
      updates.carbs_g = carbs;
      changes.push(`C: ${carbs}g`);
    }
    if (fat !== undefined) {
      updates.fat_g = fat;
      changes.push(`F: ${fat}g`);
    }

    if (Object.keys(updates).length === 0) {
      return { success: false, message: 'Debes especificar al menos un macro a actualizar.' };
    }

    const { error } = await supabase.from('meals').update(updates).eq('id', targetMealId);

    if (error) throw error;

    return {
      success: true,
      message: `✅ Macros actualizados: ${changes.join(', ')}`,
      affectedRecords: 1,
    };
  } catch (error) {
    console.error('planUpdateMealMacros error:', error);
    return { success: false, message: 'Error al actualizar macros.' };
  }
}

// ============================================================================
// MEAL OPTIONS (ALTERNATIVAS DE COMIDAS)
// Sistema para manejar múltiples opciones/platillos por slot de comida
// ============================================================================

/**
 * Agrega una opción/alternativa a una comida existente
 * Esto permite tener múltiples platillos para elegir en el mismo horario
 */
export async function planAddMealOption(
  userId: string,
  mealId: string,
  optionName: string,
  ingredients: Array<{ name: string; quantity?: string; portion?: string }>
): Promise<HankToolResult> {
  try {
    // Verificar que la comida existe
    const { data: meal, error: mealError } = await supabase
      .from('meals')
      .select('id, name')
      .eq('id', mealId)
      .eq('user_id', userId)
      .single();

    if (mealError || !meal) {
      return { success: false, message: 'No encontré esa comida.' };
    }

    // Contar opciones existentes
    const { count } = await supabase
      .from('meal_options')
      .select('id', { count: 'exact', head: true })
      .eq('meal_id', mealId);

    const newPosition = count || 0;

    // Calcular macros con IA
    const ingredientsWithId = ingredients.map((ing, idx) => ({
      id: `ing-${idx}`,
      name: ing.name,
      quantity: ing.quantity || '',
      portion: ing.portion || '',
    }));

    let finalIngredients: any[] = [];
    try {
      const calculated = await calculateMacrosWithAI(ingredientsWithId);
      finalIngredients = calculated.map((ing, idx) => ({
        name: ing.name,
        quantity: ing.quantity || '~100g',
        portion: ing.portion || '',
        nutritionInfo: ing.nutritionInfo
          ? {
              calories: ing.nutritionInfo.calories,
              protein: ing.nutritionInfo.protein,
              carbs: ing.nutritionInfo.carbs,
              fat: ing.nutritionInfo.fat,
            }
          : undefined,
        order: idx,
      }));
    } catch (e) {
      finalIngredients = ingredients.map((ing, idx) => ({
        name: ing.name,
        quantity: ing.quantity || '~100g',
        portion: ing.portion || '',
        order: idx,
      }));
    }

    // Crear la opción en meal_options
    const { data: optionData, error: optionError } = await supabase
      .from('meal_options')
      .insert({
        meal_id: mealId,
        user_id: userId,
        name: optionName,
        ingredients: finalIngredients,
        position: newPosition,
        is_selected: newPosition === 0, // Primera opción es la seleccionada por defecto
      })
      .select()
      .single();

    if (optionError) throw optionError;

    const ingredientNames = ingredients.map((i) => i.name).join(', ');

    return {
      success: true,
      message: `✅ Alternativa "${optionName}" agregada a ${meal.name}: ${ingredientNames}`,
      data: { optionId: optionData.id, position: newPosition },
      affectedRecords: 1,
    };
  } catch (error) {
    console.error('planAddMealOption error:', error);
    return { success: false, message: 'Error al agregar alternativa.' };
  }
}

/**
 * Selecciona una opción/alternativa específica para una comida
 */
export async function planSelectMealOption(
  userId: string,
  mealId: string,
  optionPosition: number
): Promise<HankToolResult> {
  try {
    // Verificar que la comida existe
    const { data: meal, error: mealError } = await supabase
      .from('meals')
      .select('id, name')
      .eq('id', mealId)
      .eq('user_id', userId)
      .single();

    if (mealError || !meal) {
      return { success: false, message: 'No encontré esa comida.' };
    }

    // Obtener todas las opciones
    const { data: options, error: optionsError } = await supabase
      .from('meal_options')
      .select('id, name, position')
      .eq('meal_id', mealId)
      .order('position', { ascending: true });

    if (optionsError || !options || options.length === 0) {
      return { success: false, message: 'Esta comida no tiene alternativas configuradas.' };
    }

    // Convertir posición (1-based) a índice (0-based)
    const idx = optionPosition - 1;
    if (idx < 0 || idx >= options.length) {
      const available = options.map((o, i) => `${i + 1}. ${o.name}`).join('\n');
      return {
        success: false,
        message: `Opción inválida. Disponibles:\n${available}`,
      };
    }

    const targetOption = options[idx];

    // Deseleccionar todas y seleccionar la elegida
    await supabase.from('meal_options').update({ is_selected: false }).eq('meal_id', mealId);

    await supabase.from('meal_options').update({ is_selected: true }).eq('id', targetOption.id);

    return {
      success: true,
      message: `✅ Opción "${targetOption.name}" seleccionada para ${meal.name}.`,
      affectedRecords: 1,
    };
  } catch (error) {
    console.error('planSelectMealOption error:', error);
    return { success: false, message: 'Error al seleccionar alternativa.' };
  }
}

/**
 * Elimina una opción/alternativa de una comida
 */
export async function planRemoveMealOption(
  userId: string,
  mealId: string,
  optionPosition: number
): Promise<HankToolResult> {
  try {
    // Verificar que la comida existe
    const { data: meal } = await supabase
      .from('meals')
      .select('id, name')
      .eq('id', mealId)
      .eq('user_id', userId)
      .single();

    if (!meal) {
      return { success: false, message: 'No encontré esa comida.' };
    }

    // Obtener todas las opciones
    const { data: options } = await supabase
      .from('meal_options')
      .select('id, name, position, is_selected')
      .eq('meal_id', mealId)
      .order('position', { ascending: true });

    if (!options || options.length === 0) {
      return { success: false, message: 'Esta comida no tiene alternativas.' };
    }

    // Convertir posición (1-based) a índice (0-based)
    const idx = optionPosition - 1;
    if (idx < 0 || idx >= options.length) {
      return { success: false, message: `Opción ${optionPosition} no existe.` };
    }

    const targetOption = options[idx];
    const wasSelected = targetOption.is_selected;

    // Eliminar la opción
    const { error } = await supabase.from('meal_options').delete().eq('id', targetOption.id);

    if (error) throw error;

    // Si era la seleccionada y quedan más, seleccionar la primera
    if (wasSelected && options.length > 1) {
      const nextOption = options.find((o) => o.id !== targetOption.id);
      if (nextOption) {
        await supabase.from('meal_options').update({ is_selected: true }).eq('id', nextOption.id);
      }
    }

    return {
      success: true,
      message: `✅ Alternativa "${targetOption.name}" eliminada de ${meal.name}.`,
      affectedRecords: 1,
    };
  } catch (error) {
    console.error('planRemoveMealOption error:', error);
    return { success: false, message: 'Error al eliminar alternativa.' };
  }
}

/**
 * Lista todas las opciones/alternativas de una comida
 */
export async function planGetMealOptions(userId: string, mealId: string): Promise<HankToolResult> {
  try {
    // Verificar que la comida existe
    const { data: meal } = await supabase
      .from('meals')
      .select('id, name, scheduled_time')
      .eq('id', mealId)
      .eq('user_id', userId)
      .single();

    if (!meal) {
      return { success: false, message: 'No encontré esa comida.' };
    }

    // Obtener todas las opciones
    const { data: options } = await supabase
      .from('meal_options')
      .select('id, name, ingredients, is_selected, position')
      .eq('meal_id', mealId)
      .order('position', { ascending: true });

    if (!options || options.length === 0) {
      return {
        success: true,
        message: `🍽️ ${meal.name} no tiene alternativas configuradas. Solo tiene los ingredientes principales.`,
        data: { options: [] },
      };
    }

    const formatTime = (t: string | null) => {
      if (!t) return '??:??';
      const [h, m] = t.split(':').map(Number);
      const period = h >= 12 ? 'PM' : 'AM';
      const h12 = h % 12 || 12;
      return `${h12}:${m.toString().padStart(2, '0')} ${period}`;
    };

    const optionsList = options
      .map((opt, idx) => {
        const selected = opt.is_selected ? ' ✓ ACTIVA' : '';
        const ings =
          (opt.ingredients as any[])?.map((i) => `${i.name} (${i.quantity})`).join(', ') ||
          'Sin ingredientes';
        return `${idx + 1}. ${opt.name}${selected}\n   → ${ings}`;
      })
      .join('\n\n');

    return {
      success: true,
      message: `🍽️ ALTERNATIVAS DE ${meal.name} (${formatTime(meal.scheduled_time)}):\n\n${optionsList}`,
      data: { options, mealName: meal.name },
    };
  } catch (error) {
    console.error('planGetMealOptions error:', error);
    return { success: false, message: 'Error al obtener alternativas.' };
  }
}

/**
 * Cambia la frecuencia de entrenamiento
 */
export async function trainingSetFrequency(
  userId: string,
  frequency: number
): Promise<HankToolResult> {
  try {
    if (frequency < 1 || frequency > 7) {
      return { success: false, message: 'La frecuencia debe ser entre 1 y 7 días.' };
    }

    const { error } = await supabase
      .from('profiles')
      .update({ training_frequency: frequency })
      .eq('id', userId);

    if (error) throw error;

    return {
      success: true,
      message: `✅ Frecuencia de entrenamiento actualizada a ${frequency} días/semana.`,
      affectedRecords: 1,
    };
  } catch (error) {
    console.error('trainingSetFrequency error:', error);
    return { success: false, message: 'Error al actualizar frecuencia.' };
  }
}

/**
 * Cambia el día actual de la rutina
 */
export async function trainingSetCurrentDay(
  userId: string,
  dayNumber: number
): Promise<HankToolResult> {
  try {
    // El usuario habla en 1-based, guardamos 0-based
    const day0Based = dayNumber - 1;

    if (day0Based < 0) {
      return { success: false, message: 'El día debe ser al menos 1.' };
    }

    const { error } = await supabase
      .from('profiles')
      .update({ training_current_day: day0Based })
      .eq('id', userId);

    if (error) throw error;

    return {
      success: true,
      message: `✅ Día actual de la rutina cambiado a Día ${dayNumber}.`,
      affectedRecords: 1,
    };
  } catch (error) {
    console.error('trainingSetCurrentDay error:', error);
    return { success: false, message: 'Error al cambiar día actual.' };
  }
}

/**
 * Obtiene el stack de suplementos
 */
export async function planGetStack(userId: string): Promise<HankToolResult> {
  try {
    const { data: stack, error } = await supabase
      .from('supplement_stack')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .order('time', { ascending: true, nullsFirst: false });

    if (error) throw error;

    if (!stack || stack.length === 0) {
      return {
        success: true,
        message: '💊 No tienes suplementos en tu stack.',
        data: { stack: [] },
      };
    }

    // Helper para formatear hora a AM/PM
    const formatTime = (time24: string | null): string => {
      if (!time24) return 'Sin hora';
      const [hours, minutes] = time24.split(':').map(Number);
      const h = hours || 0;
      const m = minutes || 0;
      const period = h >= 12 ? 'PM' : 'AM';
      const hour12 = h % 12 || 12;
      return `${hour12}:${m.toString().padStart(2, '0')} ${period}`;
    };

    const stackSummary = stack
      .map((s) => {
        let timing = '';
        if (s.is_pre_workout) {
          timing = ' 🏋️ PRE-ENTRENO';
        } else if (s.is_post_workout) {
          timing = ' 💪 POST-ENTRENO';
        } else if (s.times && Array.isArray(s.times) && s.times.length > 0) {
          // Múltiples horarios
          timing = ` ⏰ ${s.times.map((t: string) => formatTime(t)).join(', ')}`;
        } else if (s.time) {
          timing = ` ⏰ ${formatTime(s.time)}`;
        }
        return `• ${s.name} - ${s.dose}${timing}`;
      })
      .join('\n');

    return {
      success: true,
      message: `💊 TU STACK:\n${stackSummary}`,
      data: { stack },
    };
  } catch (error) {
    console.error('planGetStack error:', error);
    return { success: false, message: 'Error al obtener stack.' };
  }
}

// ============================================================================
// SYSTEM TOOL: Limpiar historial de chat de HANK
// ============================================================================
export async function hankClearHistory(userId: string): Promise<HankToolResult> {
  try {
    const { error, count } = await supabase
      .from('hank_chat_messages')
      .delete()
      .eq('user_id', userId);

    if (error) throw error;

    return {
      success: true,
      message: `🧹 Historial limpiado. Empezamos de cero. ¿En qué te puedo ayudar?`,
      data: { deletedCount: count, clearUIChat: true },
    };
  } catch (error) {
    console.error('hankClearHistory error:', error);
    return { success: false, message: 'Error al limpiar historial.' };
  }
}

// ============================================================================
// PLAN BUILDER TYPES (Para las funciones de construcción de planes)
// ============================================================================
import type {
  PlanBuilderMeal,
  PlanBuilderSupplement,
  PlanBuilderState,
  PlanBuilderIngredient,
  PlanBuilderExecuteResult,
} from '../../types/hank';

// ============================================================================
// PLAN BUILDER TOOLS - Construcción interactiva de planes de nutrición y stacks
// Sistema que permite al usuario construir un plan completo conversacionalmente
// y ejecutarlo todo de una vez al final
// ============================================================================

/**
 * Inicia una nueva sesión de Plan Builder
 * Permite construir un plan de nutrición y stack de suplementos conversacionalmente
 */
export function planBuilderStart(clearExistingOnExecute: boolean = false): HankToolResult {
  // Nota: El estado real se maneja en HankContext, esta función solo retorna el mensaje
  return {
    success: true,
    message: `🚀 ¡MODO PLAN BUILDER ACTIVADO!

Ahora puedes construir tu plan completo conversacionalmente. Dime:
• 📍 Las comidas que quieres (ej: "desayuno a las 7 con huevos y avena")
• 💊 Los suplementos (ej: "creatina 5g en la mañana")

Cuando termines, di **"ejecuta el plan"** y lo guardaré todo.
${clearExistingOnExecute ? '\n⚠️ Esto REEMPLAZARÁ tu plan actual.' : '\n📝 Se AGREGARÁ a tu plan existente.'}`,
    data: {
      isActive: true,
      clearExistingOnExecute,
      startedAt: new Date().toISOString(),
    },
  };
}

/**
 * Agrega una comida al Plan Builder (estado temporal)
 * No guarda en DB hasta que se ejecute el plan completo
 * Incluye estimación de macros en tiempo real
 */
export function planBuilderAddMeal(
  currentState: PlanBuilderState,
  time: string,
  ingredients: PlanBuilderIngredient[],
  name?: string
): { newState: PlanBuilderState; result: HankToolResult } {
  if (!currentState.isActive) {
    return {
      newState: currentState,
      result: {
        success: false,
        message: '⚠️ El Plan Builder no está activo. Di "crea mi plan" para comenzar.',
      },
    };
  }

  const tempId = `meal-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  // Generar nombre automático si no se proporciona
  const autoName = name || generateMealName(time);

  const newMeal: PlanBuilderMeal = {
    tempId,
    time,
    name: autoName,
    ingredients,
  };

  const newState: PlanBuilderState = {
    ...currentState,
    meals: [...currentState.meals, newMeal],
  };

  // Estimar macros de esta comida
  let mealMacros = { calories: 0, protein: 0, carbs: 0, fat: 0 };
  const ingredientsList = ingredients
    .map((i) => {
      const estimate = estimateIngredientMacros(i.name, i.quantity);
      mealMacros.calories += estimate.calories;
      mealMacros.protein += estimate.protein;
      mealMacros.carbs += estimate.carbs;
      mealMacros.fat += estimate.fat;
      return `${i.name}${i.quantity ? ` (${i.quantity})` : ''}`;
    })
    .join(', ');

  // Calcular totales acumulados del plan
  let totalMacros = { ...mealMacros };
  currentState.meals.forEach((m) => {
    m.ingredients.forEach((ing) => {
      const est = estimateIngredientMacros(ing.name, ing.quantity);
      totalMacros.calories += est.calories;
      totalMacros.protein += est.protein;
      totalMacros.carbs += est.carbs;
      totalMacros.fat += est.fat;
    });
  });

  return {
    newState,
    result: {
      success: true,
      message: `✅ ${autoName} agregado al plan (${formatTime24to12(time)}):
🥗 ${ingredientsList}
📊 Esta comida: ~${Math.round(mealMacros.calories)} kcal | ${Math.round(mealMacros.protein)}g P | ${Math.round(mealMacros.carbs)}g C | ${Math.round(mealMacros.fat)}g G

📋 Plan actual: ${newState.meals.length} comida(s), ${newState.supplements.length} suplemento(s)
📈 Total acumulado: ~${Math.round(totalMacros.calories)} kcal | ${Math.round(totalMacros.protein)}g P
💡 Sigue agregando o di "ejecuta el plan" cuando termines.`,
      data: {
        meal: newMeal,
        totalMeals: newState.meals.length,
        mealMacros,
        totalMacros,
      },
    },
  };
}

/**
 * Edita una comida en el Plan Builder
 */
export function planBuilderEditMeal(
  currentState: PlanBuilderState,
  mealIdentifier: string | number,
  updates: { time?: string; ingredients?: PlanBuilderIngredient[]; name?: string }
): { newState: PlanBuilderState; result: HankToolResult } {
  if (!currentState.isActive) {
    return {
      newState: currentState,
      result: {
        success: false,
        message: '⚠️ El Plan Builder no está activo.',
      },
    };
  }

  // Encontrar la comida por tempId, índice o nombre
  let mealIndex = -1;
  if (typeof mealIdentifier === 'number') {
    mealIndex = mealIdentifier - 1; // 1-based a 0-based
  } else {
    const identifier = mealIdentifier.toLowerCase();
    mealIndex = currentState.meals.findIndex(
      (m, i) =>
        m.tempId === mealIdentifier ||
        m.name?.toLowerCase().includes(identifier) ||
        String(i + 1) === identifier
    );
  }

  if (mealIndex < 0 || mealIndex >= currentState.meals.length) {
    return {
      newState: currentState,
      result: {
        success: false,
        message: `⚠️ No encontré esa comida en el plan. Tienes ${currentState.meals.length} comida(s).`,
      },
    };
  }

  const oldMeal = currentState.meals[mealIndex];
  const updatedMeal: PlanBuilderMeal = {
    ...oldMeal,
    time: updates.time || oldMeal.time,
    ingredients: updates.ingredients || oldMeal.ingredients,
    name: updates.name || oldMeal.name,
  };

  const newMeals = [...currentState.meals];
  newMeals[mealIndex] = updatedMeal;

  const newState: PlanBuilderState = {
    ...currentState,
    meals: newMeals,
  };

  return {
    newState,
    result: {
      success: true,
      message: `✅ ${updatedMeal.name} actualizado en el plan.`,
      data: { meal: updatedMeal },
    },
  };
}

/**
 * Elimina una comida del Plan Builder
 */
export function planBuilderRemoveMeal(
  currentState: PlanBuilderState,
  mealIdentifier: string | number
): { newState: PlanBuilderState; result: HankToolResult } {
  if (!currentState.isActive) {
    return {
      newState: currentState,
      result: {
        success: false,
        message: '⚠️ El Plan Builder no está activo.',
      },
    };
  }

  // Encontrar la comida
  let mealIndex = -1;
  if (typeof mealIdentifier === 'number') {
    mealIndex = mealIdentifier - 1;
  } else {
    const identifier = mealIdentifier.toLowerCase();
    mealIndex = currentState.meals.findIndex(
      (m, i) =>
        m.tempId === mealIdentifier ||
        m.name?.toLowerCase().includes(identifier) ||
        String(i + 1) === identifier
    );
  }

  if (mealIndex < 0 || mealIndex >= currentState.meals.length) {
    return {
      newState: currentState,
      result: {
        success: false,
        message: `⚠️ No encontré esa comida en el plan.`,
      },
    };
  }

  const removedMeal = currentState.meals[mealIndex];
  const newMeals = currentState.meals.filter((_, i) => i !== mealIndex);

  const newState: PlanBuilderState = {
    ...currentState,
    meals: newMeals,
  };

  return {
    newState,
    result: {
      success: true,
      message: `🗑️ ${removedMeal.name} eliminado del plan.
📋 Plan actual: ${newState.meals.length} comida(s), ${newState.supplements.length} suplemento(s)`,
      data: { removedMeal },
    },
  };
}

/**
 * Agrega un suplemento al Plan Builder
 */
export function planBuilderAddSupplement(
  currentState: PlanBuilderState,
  name: string,
  dose: string,
  options?: {
    type?: 'pill' | 'powder' | 'liquid' | 'syringe';
    time?: string;
    isPreWorkout?: boolean;
    isPostWorkout?: boolean;
    daysOfWeek?: number[];
  }
): { newState: PlanBuilderState; result: HankToolResult } {
  if (!currentState.isActive) {
    return {
      newState: currentState,
      result: {
        success: false,
        message: '⚠️ El Plan Builder no está activo. Di "crea mi plan" para comenzar.',
      },
    };
  }

  const tempId = `supp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  const newSupplement: PlanBuilderSupplement = {
    tempId,
    name: name.toUpperCase(),
    dose,
    type: options?.type || 'pill',
    time: options?.time,
    isPreWorkout: options?.isPreWorkout,
    isPostWorkout: options?.isPostWorkout,
    daysOfWeek: options?.daysOfWeek,
  };

  const newState: PlanBuilderState = {
    ...currentState,
    supplements: [...currentState.supplements, newSupplement],
  };

  let timing = '';
  if (options?.isPreWorkout) timing = ' (Pre-entreno)';
  else if (options?.isPostWorkout) timing = ' (Post-entreno)';
  else if (options?.time) timing = ` a las ${formatTime24to12(options.time)}`;

  return {
    newState,
    result: {
      success: true,
      message: `✅ ${newSupplement.name} (${dose}) agregado al plan${timing}.

📋 Plan actual: ${newState.meals.length} comida(s), ${newState.supplements.length} suplemento(s)
💡 Sigue agregando o di "ejecuta el plan" cuando termines.`,
      data: { supplement: newSupplement, totalSupplements: newState.supplements.length },
    },
  };
}

/**
 * Elimina un suplemento del Plan Builder
 */
export function planBuilderRemoveSupplement(
  currentState: PlanBuilderState,
  nameOrIndex: string | number
): { newState: PlanBuilderState; result: HankToolResult } {
  if (!currentState.isActive) {
    return {
      newState: currentState,
      result: {
        success: false,
        message: '⚠️ El Plan Builder no está activo.',
      },
    };
  }

  let suppIndex = -1;
  if (typeof nameOrIndex === 'number') {
    suppIndex = nameOrIndex - 1;
  } else {
    const identifier = nameOrIndex.toLowerCase();
    suppIndex = currentState.supplements.findIndex(
      (s) => s.tempId === nameOrIndex || s.name.toLowerCase().includes(identifier)
    );
  }

  if (suppIndex < 0 || suppIndex >= currentState.supplements.length) {
    return {
      newState: currentState,
      result: {
        success: false,
        message: `⚠️ No encontré ese suplemento en el plan.`,
      },
    };
  }

  const removedSupp = currentState.supplements[suppIndex];
  const newSupplements = currentState.supplements.filter((_, i) => i !== suppIndex);

  const newState: PlanBuilderState = {
    ...currentState,
    supplements: newSupplements,
  };

  return {
    newState,
    result: {
      success: true,
      message: `🗑️ ${removedSupp.name} eliminado del plan.`,
      data: { removedSupplement: removedSupp },
    },
  };
}

/**
 * Muestra el estado actual del Plan Builder con VALIDACIÓN DE MACROS EN TIEMPO REAL
 */
export function planBuilderShow(currentState: PlanBuilderState): HankToolResult {
  if (!currentState.isActive) {
    return {
      success: false,
      message: '⚠️ No hay un plan en construcción. Di "crea mi plan" para comenzar.',
    };
  }

  if (
    currentState.meals.length === 0 &&
    currentState.supplements.length === 0 &&
    !currentState.training
  ) {
    return {
      success: true,
      message: `📋 PLAN EN CONSTRUCCIÓN (vacío)

Aún no has agregado nada. Dime:
• Las comidas que quieres
• Los suplementos del stack
• Tu objetivo de entrenamiento

Ejemplo: "Desayuno a las 7 con huevos y avena, creatina 5g, quiero ganar músculo 5 días"`,
      data: currentState,
    };
  }

  // Estimar macros de cada comida usando base de datos local
  let totalEstimatedMacros = { calories: 0, protein: 0, carbs: 0, fat: 0 };

  // Construir resumen de comidas CON MACROS ESTIMADOS
  let mealsSection = '';
  if (currentState.meals.length > 0) {
    mealsSection = '🍽️ COMIDAS:\n';

    currentState.meals.forEach((m, i) => {
      let mealMacros = { calories: 0, protein: 0, carbs: 0, fat: 0 };

      const ingsWithEstimates = m.ingredients.map((ing) => {
        const estimate = estimateIngredientMacros(ing.name, ing.quantity);
        mealMacros.calories += estimate.calories;
        mealMacros.protein += estimate.protein;
        mealMacros.carbs += estimate.carbs;
        mealMacros.fat += estimate.fat;

        return `${ing.name}${ing.quantity ? ` (${ing.quantity})` : ''}`;
      });

      totalEstimatedMacros.calories += mealMacros.calories;
      totalEstimatedMacros.protein += mealMacros.protein;
      totalEstimatedMacros.carbs += mealMacros.carbs;
      totalEstimatedMacros.fat += mealMacros.fat;

      mealsSection += `${i + 1}. ${m.name || 'Comida'} (${formatTime24to12(m.time)})\n`;
      mealsSection += `   🥗 ${ingsWithEstimates.join(', ')}\n`;
      mealsSection += `   📊 ~${Math.round(mealMacros.calories)} kcal | ${Math.round(mealMacros.protein)}g P | ${Math.round(mealMacros.carbs)}g C | ${Math.round(mealMacros.fat)}g G\n`;
    });
  }

  // Construir resumen de suplementos
  let suppsSection = '';
  if (currentState.supplements.length > 0) {
    suppsSection =
      '\n💊 STACK:\n' +
      currentState.supplements
        .map((s, i) => {
          let timing = '';
          if (s.isPreWorkout) timing = ' (Pre-entreno)';
          else if (s.isPostWorkout) timing = ' (Post-entreno)';
          else if (s.time) timing = ` (${formatTime24to12(s.time)})`;
          return `${i + 1}. ${s.name} - ${s.dose}${timing}`;
        })
        .join('\n');
  }

  // Construir resumen de entrenamiento
  let trainingSection = '';
  if (currentState.training) {
    trainingSection = `\n\n🏋️ ENTRENAMIENTO:
• Objetivo: ${currentState.training.goal}
• Nivel: ${currentState.training.level}
• Frecuencia: ${currentState.training.frequency} días/semana`;
  }

  // Sección de TOTALES ESTIMADOS
  let totalsSection = '';
  if (currentState.meals.length > 0) {
    totalsSection = `

═══════════════════════════════════════════
📊 ESTIMACIÓN DE MACROS DIARIOS:
═══════════════════════════════════════════
🔥 Calorías: ~${Math.round(totalEstimatedMacros.calories)} kcal
💪 Proteína: ~${Math.round(totalEstimatedMacros.protein)}g
🍞 Carbohidratos: ~${Math.round(totalEstimatedMacros.carbs)}g
🥑 Grasas: ~${Math.round(totalEstimatedMacros.fat)}g
═══════════════════════════════════════════
⚠️ Valores aproximados. Al ejecutar se calcularán con IA.`;
  }

  return {
    success: true,
    message: `📋 TU PLAN EN CONSTRUCCIÓN:

${mealsSection}${suppsSection}${trainingSection}${totalsSection}

${currentState.clearExistingOnExecute ? '⚠️ REEMPLAZARÁ tu plan actual.' : '📝 Se AGREGARÁ a tu plan existente.'}

✅ Di "ejecuta el plan" para guardarlo todo.
✏️ Di "edita la comida X" o "quita la comida X" para modificar.`,
    data: {
      ...currentState,
      estimatedMacros: totalEstimatedMacros,
    },
  };
}

/**
 * Estima macros de un ingrediente basado en la base de datos local
 * @param ingredientName Nombre del ingrediente
 * @param quantity Cantidad en formato string (ej: "200g", "3 huevos")
 * @returns Macros estimados
 */
function estimateIngredientMacros(
  ingredientName: string,
  quantity?: string
): { calories: number; protein: number; carbs: number; fat: number } {
  // Base de datos simplificada de macros por 100g
  const nutritionDB: Record<
    string,
    { calories: number; protein: number; carbs: number; fat: number }
  > = {
    // Proteínas
    pollo: { calories: 165, protein: 31, carbs: 0, fat: 3.6 },
    pechuga: { calories: 165, protein: 31, carbs: 0, fat: 3.6 },
    res: { calories: 250, protein: 26, carbs: 0, fat: 15 },
    carne: { calories: 250, protein: 26, carbs: 0, fat: 15 },
    cerdo: { calories: 242, protein: 27, carbs: 0, fat: 14 },
    pescado: { calories: 120, protein: 22, carbs: 0, fat: 3 },
    atún: { calories: 130, protein: 29, carbs: 0, fat: 1 },
    salmón: { calories: 208, protein: 20, carbs: 0, fat: 13 },
    huevo: { calories: 155, protein: 13, carbs: 1, fat: 11 },
    huevos: { calories: 155, protein: 13, carbs: 1, fat: 11 },
    claras: { calories: 52, protein: 11, carbs: 1, fat: 0 },
    whey: { calories: 120, protein: 24, carbs: 3, fat: 1 },
    proteína: { calories: 120, protein: 24, carbs: 3, fat: 1 },

    // Carbohidratos
    arroz: { calories: 130, protein: 2.7, carbs: 28, fat: 0.3 },
    papa: { calories: 77, protein: 2, carbs: 17, fat: 0.1 },
    camote: { calories: 86, protein: 1.6, carbs: 20, fat: 0.1 },
    avena: { calories: 389, protein: 13, carbs: 66, fat: 7 },
    quinua: { calories: 120, protein: 4.4, carbs: 21, fat: 1.9 },
    pasta: { calories: 131, protein: 5, carbs: 25, fat: 1 },
    pan: { calories: 265, protein: 9, carbs: 49, fat: 3 },
    plátano: { calories: 89, protein: 1.3, carbs: 23, fat: 0.4 },

    // Grasas
    palta: { calories: 160, protein: 2, carbs: 9, fat: 15 },
    aguacate: { calories: 160, protein: 2, carbs: 9, fat: 15 },
    aceite: { calories: 884, protein: 0, carbs: 0, fat: 100 },
    maní: { calories: 567, protein: 26, carbs: 16, fat: 49 },
    almendras: { calories: 579, protein: 21, carbs: 22, fat: 49 },
    nueces: { calories: 654, protein: 15, carbs: 14, fat: 65 },

    // Vegetales
    brócoli: { calories: 34, protein: 2.8, carbs: 7, fat: 0.4 },
    espinaca: { calories: 23, protein: 2.9, carbs: 3.6, fat: 0.4 },
    tomate: { calories: 18, protein: 0.9, carbs: 3.9, fat: 0.2 },
    lechuga: { calories: 15, protein: 1.4, carbs: 2.9, fat: 0.2 },
    zanahoria: { calories: 41, protein: 0.9, carbs: 10, fat: 0.2 },
    pepino: { calories: 16, protein: 0.7, carbs: 3.6, fat: 0.1 },

    // Lácteos
    yogurt: { calories: 100, protein: 17, carbs: 6, fat: 0.7 },
    leche: { calories: 42, protein: 3.4, carbs: 5, fat: 1 },
    queso: { calories: 402, protein: 25, carbs: 1.3, fat: 33 },
  };

  // Normalizar nombre del ingrediente
  const normalizedName = ingredientName
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Quitar acentos
    .replace(/\s+/g, '');

  // Buscar en la base de datos
  let macros = { calories: 100, protein: 5, carbs: 10, fat: 3 }; // Default

  for (const [key, value] of Object.entries(nutritionDB)) {
    if (normalizedName.includes(key) || key.includes(normalizedName)) {
      macros = value;
      break;
    }
  }

  // Extraer cantidad en gramos
  let grams = 100; // Default 100g
  if (quantity) {
    const match = quantity.match(/(\d+(?:\.\d+)?)\s*g/i);
    if (match) {
      grams = parseFloat(match[1]);
    } else {
      // Intentar extraer número de unidades para huevos, etc.
      const unitMatch = quantity.match(/(\d+)/);
      if (unitMatch) {
        const units = parseInt(unitMatch[1]);
        // Huevos ~50g cada uno
        if (normalizedName.includes('huevo')) {
          grams = units * 50;
        } else {
          grams = units * 100; // Default
        }
      }
    }
  }

  // Calcular macros proporcionales
  const factor = grams / 100;
  return {
    calories: Math.round(macros.calories * factor),
    protein: Math.round(macros.protein * factor * 10) / 10,
    carbs: Math.round(macros.carbs * factor * 10) / 10,
    fat: Math.round(macros.fat * factor * 10) / 10,
  };
}

/**
 * Limpia el Plan Builder sin ejecutar
 */
export function planBuilderClear(): HankToolResult {
  return {
    success: true,
    message: `🧹 Plan Builder limpiado. Se descartaron los cambios.
💡 Di "crea mi plan" para empezar de nuevo.`,
    data: { isActive: false, cleared: true },
  };
}

/**
 * Ejecuta el Plan Builder - Guarda todo en la base de datos
 * Esta es la función principal que materializa el plan en DB
 */
export async function planBuilderExecute(
  userId: string,
  planState: PlanBuilderState
): Promise<HankToolResult> {
  if (!planState.isActive) {
    return {
      success: false,
      message: '⚠️ No hay un plan para ejecutar. Di "crea mi plan" para comenzar.',
    };
  }

  if (planState.meals.length === 0 && planState.supplements.length === 0 && !planState.training) {
    return {
      success: false,
      message:
        '⚠️ El plan está vacío. Agrega comidas, suplementos o configura el entrenamiento primero.',
    };
  }

  const result: PlanBuilderExecuteResult = {
    mealsCreated: 0,
    supplementsCreated: 0,
    trainingAssigned: false,
    trainingExercises: 0,
    errors: [],
  };

  try {
    // Si debe limpiar el plan existente, hacerlo primero
    if (planState.clearExistingOnExecute) {
      console.warn('🧹 Plan Builder: Limpiando plan existente...');

      // Eliminar comidas existentes
      await supabase.from('meals').delete().eq('user_id', userId);

      // Desactivar suplementos existentes
      await supabase.from('supplement_stack').update({ is_active: false }).eq('user_id', userId);
    }

    // Obtener contexto del usuario para calcular macros
    let userContext = { weight: 75, goal: 'MANTENER', mealCount: planState.meals.length };
    try {
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('weight, goal')
        .eq('user_id', userId)
        .single();

      if (profile) {
        const weightMatch = profile.weight?.match(/(\d+)/);
        userContext = {
          weight: weightMatch ? parseInt(weightMatch[1]) : 75,
          goal: profile.goal || 'MANTENER',
          mealCount: planState.meals.length,
        };
      }
    } catch (e) {
      // Usar defaults
    }

    // 1. Crear comidas ordenadas por tiempo
    const sortedMeals = [...planState.meals].sort((a, b) => a.time.localeCompare(b.time));

    for (let i = 0; i < sortedMeals.length; i++) {
      const meal = sortedMeals[i];

      try {
        // Calcular nombre inteligente basado en posición
        const smartName = getSmartMealName(i, sortedMeals.length);

        // Preparar ingredientes con IDs y calcular macros con IA
        const ingredientsWithId = meal.ingredients.map((ing, idx) => ({
          id: `ing-${idx}`,
          name: ing.name,
          quantity: ing.quantity || '',
          portion: ing.portion || '',
        }));

        const calculatedIngredients = await calculateMacrosWithAI(ingredientsWithId, userContext);

        // Formatear ingredientes para JSONB
        const ingredientsJson = calculatedIngredients.map((ing, idx) => ({
          name: ing.name,
          quantity: ing.quantity || '~100g',
          portion: ing.portion || '',
          nutritionInfo: ing.nutritionInfo
            ? {
                calories: ing.nutritionInfo.calories,
                protein: ing.nutritionInfo.protein,
                carbs: ing.nutritionInfo.carbs,
                fat: ing.nutritionInfo.fat,
              }
            : undefined,
          order: idx,
        }));

        // Calcular totales de la comida
        let totalCals = 0,
          totalP = 0,
          totalC = 0,
          totalF = 0;
        ingredientsJson.forEach((ing) => {
          totalCals += ing.nutritionInfo?.calories || 0;
          totalP += ing.nutritionInfo?.protein || 0;
          totalC += ing.nutritionInfo?.carbs || 0;
          totalF += ing.nutritionInfo?.fat || 0;
        });

        // Insertar comida en DB
        const { error: mealError } = await supabase.from('meals').insert({
          user_id: userId,
          name: meal.name || smartName,
          scheduled_time: meal.time,
          ingredients: ingredientsJson,
          calories: Math.round(totalCals),
          protein_g: Math.round(totalP),
          carbs_g: Math.round(totalC),
          fat_g: Math.round(totalF),
          is_completed: false,
        });

        if (mealError) {
          result.errors.push(`Error creando ${smartName}: ${mealError.message}`);
        } else {
          result.mealsCreated++;
        }
      } catch (error) {
        result.errors.push(`Error procesando comida ${i + 1}: ${error}`);
      }
    }

    // 2. Crear suplementos
    for (const supp of planState.supplements) {
      try {
        const { error: suppError } = await supabase.from('supplement_stack').insert({
          user_id: userId,
          name: supp.name,
          dose: supp.dose,
          type: supp.type || 'pill',
          time: supp.time,
          is_pre_workout: supp.isPreWorkout || false,
          is_post_workout: supp.isPostWorkout || false,
          days_of_week: supp.daysOfWeek,
          is_active: true,
        });

        if (suppError) {
          result.errors.push(`Error creando ${supp.name}: ${suppError.message}`);
        } else {
          result.supplementsCreated++;
        }
      } catch (error) {
        result.errors.push(`Error procesando ${supp.name}: ${error}`);
      }
    }

    // 3. Asignar entrenamiento si está configurado
    let trainingPlanName = '';

    if (planState.training) {
      console.warn('🏋️ Plan Builder: Asignando entrenamiento...', planState.training);
      try {
        const designResult = await trainingDesignPlan(userId, {
          goal: planState.training.goal,
          level: planState.training.level,
          frequency: planState.training.frequency,
        });

        if (designResult.success && designResult.data) {
          const data = designResult.data as {
            exercises?: number;
            templateId?: string;
            planName?: string;
          };
          result.trainingAssigned = true;
          result.trainingExercises = data.exercises || 0;
          trainingPlanName =
            data.planName || `${planState.training.goal} ${planState.training.frequency}d`;
        } else {
          result.errors.push(`Error asignando entrenamiento: ${designResult.message}`);
        }
      } catch (error) {
        result.errors.push(`Error procesando entrenamiento: ${error}`);
      }
    }

    // Construir mensaje de resultado
    const hasErrors = result.errors.length > 0;
    const successIcon = hasErrors ? '⚠️' : '🎉';

    let message = `${successIcon} PLAN EJECUTADO:

✅ ${result.mealsCreated} comida(s) creada(s)
✅ ${result.supplementsCreated} suplemento(s) agregado(s)`;

    if (result.trainingAssigned) {
      message += `\n✅ Entrenamiento asignado: ${trainingPlanName} (${result.trainingExercises} ejercicios)`;
    }

    if (hasErrors) {
      message += `\n\n⚠️ ERRORES:\n${result.errors.map((e) => `• ${e}`).join('\n')}`;
    }

    message += `\n\n🏃 Ve al módulo PLAN para ver tu nutrición y suplementos.`;
    if (result.trainingAssigned) {
      message += `\n🏋️ Ve al módulo GYM para ver tu rutina de entrenamiento.`;
    }

    return {
      success:
        !hasErrors ||
        result.mealsCreated > 0 ||
        result.supplementsCreated > 0 ||
        result.trainingAssigned,
      message,
      data: {
        ...result,
        clearPlanBuilder: true, // Flag para que HankContext limpie el estado
      },
    };
  } catch (error) {
    console.error('planBuilderExecute error:', error);
    return {
      success: false,
      message: '❌ Error ejecutando el plan. Inténtalo de nuevo.',
      data: result,
    };
  }
}

// ============================================================================
// HELPERS para Plan Builder
// ============================================================================

/**
 * Genera nombre automático de comida basado en hora
 */
function generateMealName(time: string): string {
  const hour = parseInt(time.split(':')[0], 10);
  if (hour >= 5 && hour < 11) return 'DESAYUNO';
  if (hour >= 11 && hour < 15) return 'ALMUERZO';
  if (hour >= 15 && hour < 18) return 'MERIENDA';
  if (hour >= 18 && hour < 22) return 'CENA';
  return 'SNACK';
}

/**
 * Convierte hora 24h a formato AM/PM
 */
function formatTime24to12(time: string): string {
  const [hours, mins] = time.split(':').map(Number);
  const period = hours >= 12 ? 'PM' : 'AM';
  const hours12 = hours % 12 || 12;
  return `${hours12}:${(mins || 0).toString().padStart(2, '0')} ${period}`;
}

// ============================================================================
// TRAINING PLAN TEMPLATES - Biblioteca de Planes de Entrenamiento
// ============================================================================
import type { TrainingPlanTemplate, TrainingPlanAssignResult } from '../../types/hank';

/**
 * Biblioteca de plantillas de entrenamiento predefinidas
 */
export const TRAINING_PLAN_LIBRARY: TrainingPlanTemplate[] = [
  // =========== PRINCIPIANTE ===========
  {
    id: 'full-body-3',
    name: 'Full Body 3 Días',
    description:
      'Plan para principiantes. Entrena todo el cuerpo 3 veces por semana con descanso entre días.',
    frequency: 3,
    level: 'PRINCIPIANTE',
    goal: 'GENERAL',
    days: [
      {
        dayIndex: 0,
        name: 'Full Body A',
        muscleGroups: ['Pecho', 'Espalda', 'Piernas', 'Core'],
        exerciseCount: 6,
      },
      {
        dayIndex: 1,
        name: 'Full Body B',
        muscleGroups: ['Hombros', 'Brazos', 'Piernas', 'Core'],
        exerciseCount: 6,
      },
      {
        dayIndex: 2,
        name: 'Full Body C',
        muscleGroups: ['Pecho', 'Espalda', 'Piernas', 'Glúteos'],
        exerciseCount: 6,
      },
    ],
    tags: ['principiante', 'full-body', 'básico'],
  },
  {
    id: 'upper-lower-4',
    name: 'Upper/Lower 4 Días',
    description: 'Alterna tren superior e inferior. Ideal para intermedios que buscan equilibrio.',
    frequency: 4,
    level: 'INTERMEDIO',
    goal: 'HIPERTROFIA',
    days: [
      {
        dayIndex: 0,
        name: 'Upper A',
        muscleGroups: ['Pecho', 'Espalda', 'Hombros', 'Bíceps', 'Tríceps'],
        exerciseCount: 7,
      },
      {
        dayIndex: 1,
        name: 'Lower A',
        muscleGroups: ['Cuádriceps', 'Isquios', 'Glúteos', 'Pantorrillas'],
        exerciseCount: 6,
      },
      {
        dayIndex: 2,
        name: 'Upper B',
        muscleGroups: ['Espalda', 'Pecho', 'Hombros', 'Tríceps', 'Bíceps'],
        exerciseCount: 7,
      },
      {
        dayIndex: 3,
        name: 'Lower B',
        muscleGroups: ['Glúteos', 'Isquios', 'Cuádriceps', 'Core'],
        exerciseCount: 6,
      },
    ],
    tags: ['intermedio', 'upper-lower', 'equilibrado'],
  },
  // =========== INTERMEDIO/AVANZADO ===========
  {
    id: 'ppl-6',
    name: 'Push/Pull/Legs 6 Días',
    description: 'El clásico PPL. Cada músculo 2 veces por semana con alta frecuencia.',
    frequency: 6,
    level: 'AVANZADO',
    goal: 'HIPERTROFIA',
    days: [
      {
        dayIndex: 0,
        name: 'Push A',
        muscleGroups: ['Pecho', 'Hombros', 'Tríceps'],
        exerciseCount: 6,
      },
      {
        dayIndex: 1,
        name: 'Pull A',
        muscleGroups: ['Espalda', 'Bíceps', 'Antebrazos'],
        exerciseCount: 6,
      },
      {
        dayIndex: 2,
        name: 'Legs A',
        muscleGroups: ['Cuádriceps', 'Isquios', 'Glúteos', 'Pantorrillas'],
        exerciseCount: 6,
      },
      {
        dayIndex: 3,
        name: 'Push B',
        muscleGroups: ['Hombros', 'Pecho', 'Tríceps'],
        exerciseCount: 6,
      },
      {
        dayIndex: 4,
        name: 'Pull B',
        muscleGroups: ['Espalda', 'Trapecios', 'Bíceps'],
        exerciseCount: 6,
      },
      {
        dayIndex: 5,
        name: 'Legs B',
        muscleGroups: ['Glúteos', 'Isquios', 'Cuádriceps', 'Core'],
        exerciseCount: 6,
      },
    ],
    tags: ['avanzado', 'ppl', 'alta-frecuencia', 'hipertrofia'],
  },
  {
    id: 'ppl-3',
    name: 'Push/Pull/Legs 3 Días',
    description: 'Versión reducida del PPL para quienes solo pueden entrenar 3 días.',
    frequency: 3,
    level: 'INTERMEDIO',
    goal: 'HIPERTROFIA',
    days: [
      {
        dayIndex: 0,
        name: 'Push',
        muscleGroups: ['Pecho', 'Hombros', 'Tríceps'],
        exerciseCount: 7,
      },
      {
        dayIndex: 1,
        name: 'Pull',
        muscleGroups: ['Espalda', 'Bíceps', 'Antebrazos'],
        exerciseCount: 7,
      },
      {
        dayIndex: 2,
        name: 'Legs',
        muscleGroups: ['Cuádriceps', 'Isquios', 'Glúteos', 'Pantorrillas'],
        exerciseCount: 7,
      },
    ],
    tags: ['intermedio', 'ppl', 'hipertrofia'],
  },
  {
    id: 'bro-split-5',
    name: 'Bro Split 5 Días',
    description: 'Un músculo por día. Alto volumen, baja frecuencia. Clásico culturismo.',
    frequency: 5,
    level: 'INTERMEDIO',
    goal: 'HIPERTROFIA',
    days: [
      { dayIndex: 0, name: 'Pecho', muscleGroups: ['Pecho'], exerciseCount: 6 },
      { dayIndex: 1, name: 'Espalda', muscleGroups: ['Espalda', 'Trapecios'], exerciseCount: 6 },
      { dayIndex: 2, name: 'Hombros', muscleGroups: ['Hombros', 'Core'], exerciseCount: 6 },
      {
        dayIndex: 3,
        name: 'Brazos',
        muscleGroups: ['Bíceps', 'Tríceps', 'Antebrazos'],
        exerciseCount: 8,
      },
      {
        dayIndex: 4,
        name: 'Piernas',
        muscleGroups: ['Cuádriceps', 'Isquios', 'Glúteos', 'Pantorrillas'],
        exerciseCount: 7,
      },
    ],
    tags: ['intermedio', 'bro-split', 'culturismo', 'alto-volumen'],
  },
  {
    id: 'strength-4',
    name: 'Fuerza 4 Días',
    description: 'Enfocado en los levantamientos compuestos: Squat, Bench, Deadlift, OHP.',
    frequency: 4,
    level: 'INTERMEDIO',
    goal: 'FUERZA',
    days: [
      {
        dayIndex: 0,
        name: 'Squat Day',
        muscleGroups: ['Cuádriceps', 'Glúteos', 'Core'],
        exerciseCount: 5,
      },
      {
        dayIndex: 1,
        name: 'Bench Day',
        muscleGroups: ['Pecho', 'Tríceps', 'Hombros'],
        exerciseCount: 5,
      },
      {
        dayIndex: 2,
        name: 'Deadlift Day',
        muscleGroups: ['Espalda', 'Isquios', 'Glúteos'],
        exerciseCount: 5,
      },
      {
        dayIndex: 3,
        name: 'OHP Day',
        muscleGroups: ['Hombros', 'Tríceps', 'Core'],
        exerciseCount: 5,
      },
    ],
    tags: ['fuerza', 'powerlifting', 'compuestos'],
  },
  {
    id: 'definition-5',
    name: 'Definición 5 Días',
    description: 'Alto volumen con cardio integrado. Ideal para fase de corte.',
    frequency: 5,
    level: 'INTERMEDIO',
    goal: 'DEFINICION',
    days: [
      {
        dayIndex: 0,
        name: 'Upper + HIIT',
        muscleGroups: ['Pecho', 'Espalda', 'Core'],
        exerciseCount: 6,
      },
      {
        dayIndex: 1,
        name: 'Lower + Cardio',
        muscleGroups: ['Piernas', 'Glúteos'],
        exerciseCount: 6,
      },
      {
        dayIndex: 2,
        name: 'Push + Abs',
        muscleGroups: ['Hombros', 'Tríceps', 'Core'],
        exerciseCount: 6,
      },
      { dayIndex: 3, name: 'Pull + LISS', muscleGroups: ['Espalda', 'Bíceps'], exerciseCount: 6 },
      {
        dayIndex: 4,
        name: 'Legs + Core',
        muscleGroups: ['Piernas', 'Glúteos', 'Core'],
        exerciseCount: 7,
      },
    ],
    tags: ['definición', 'corte', 'cardio', 'alto-volumen'],
  },
  {
    id: 'recomp-4',
    name: 'Recomposición 4 Días',
    description: 'Combina fuerza e hipertrofia. Ideal para perder grasa y ganar músculo.',
    frequency: 4,
    level: 'INTERMEDIO',
    goal: 'RECOMPOSICION',
    days: [
      { dayIndex: 0, name: 'Upper Strength', muscleGroups: ['Pecho', 'Espalda'], exerciseCount: 6 },
      {
        dayIndex: 1,
        name: 'Lower Strength',
        muscleGroups: ['Piernas', 'Glúteos'],
        exerciseCount: 6,
      },
      {
        dayIndex: 2,
        name: 'Upper Hypertrophy',
        muscleGroups: ['Hombros', 'Brazos', 'Core'],
        exerciseCount: 7,
      },
      {
        dayIndex: 3,
        name: 'Lower Hypertrophy',
        muscleGroups: ['Piernas', 'Glúteos', 'Pantorrillas'],
        exerciseCount: 7,
      },
    ],
    tags: ['recomposición', 'híbrido', 'fuerza-hipertrofia'],
  },
];

// ============================================================================
// TRAINING TOOLS: Diseñar Plan Personalizado (Auto-selección inteligente)
// Hank "diseña" el plan usando TODA la información del usuario
// El usuario percibe que es 100% personalizado a medida
// ============================================================================
export async function trainingDesignPlan(
  userId: string,
  params: {
    goal?: string; // HIPERTROFIA, FUERZA, DEFINICION, RECOMPOSICION, GENERAL
    level?: string; // PRINCIPIANTE, INTERMEDIO, AVANZADO
    frequency?: number; // 3, 4, 5, 6 días por semana
  }
): Promise<HankToolResult> {
  try {
    // =========================================================================
    // 1. RECOPILAR TODA LA INFORMACIÓN DEL USUARIO
    // =========================================================================

    // Obtener TRENS ID (user_profiles)
    const { data: userProfile } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('user_id', userId)
      .single();

    // Obtener fotos de progreso (para evaluar experiencia real)
    const { data: progressPhotos } = await supabase
      .from('progress_photos')
      .select('id, snapshot, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(5);

    // Obtener historial de ejercicios previos
    const { data: exerciseHistory } = await supabase
      .from('user_exercise_config')
      .select('id, exercise_id, config')
      .eq('user_id', userId)
      .limit(20);

    // =========================================================================
    // 2. DETERMINAR PARÁMETROS FINALES (prioridad: params > userProfile > default)
    // =========================================================================

    // Objetivo
    let finalGoal = params.goal?.toUpperCase();
    if (!finalGoal && userProfile?.goal) {
      finalGoal = userProfile.goal.toUpperCase();
    }
    if (!finalGoal) finalGoal = 'HIPERTROFIA';

    // Nivel - considerar experiencia real
    let finalLevel = params.level?.toUpperCase();
    if (!finalLevel) {
      // Usar training_experience o level del perfil
      if (userProfile?.training_experience) {
        finalLevel = userProfile.training_experience.toUpperCase();
      } else if (userProfile?.level) {
        finalLevel = userProfile.level.toUpperCase();
      }
    }
    // Ajustar nivel basado en evidencia (fotos y ejercicios previos)
    if (!finalLevel) {
      if (progressPhotos && progressPhotos.length >= 3) {
        // Tiene historial de fotos → al menos intermedio
        finalLevel = 'INTERMEDIO';
      } else if (exerciseHistory && exerciseHistory.length >= 10) {
        // Tiene ejercicios configurados → al menos intermedio
        finalLevel = 'INTERMEDIO';
      } else {
        finalLevel = 'PRINCIPIANTE';
      }
    }

    // Frecuencia
    let finalFrequency = params.frequency;
    if (!finalFrequency && userProfile?.training_days_per_week) {
      finalFrequency = userProfile.training_days_per_week;
    }
    if (!finalFrequency) finalFrequency = 4; // Default

    // =========================================================================
    // 3. OBTENER TEMPLATES Y HACER MATCHING INTELIGENTE
    // =========================================================================

    const { data: templates, error } = await supabase
      .from('training_plan_templates')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });

    if (error || !templates || templates.length === 0) {
      return {
        success: false,
        message:
          'Aún no tengo planes configurados para ti. Dame unos días para preparar algo épico. 🔥',
      };
    }

    // =========================================================================
    // 4. ALGORITMO DE SCORING AVANZADO
    // =========================================================================

    let bestMatch: any = null;
    let bestScore = -1;

    // Información adicional del usuario para scoring
    const userAge = userProfile?.age || 30;
    const userSex = userProfile?.sex || 'M';
    const userWeight = parseFloat(userProfile?.weight) || 75;
    const userActivityLevel = userProfile?.activity_level || 'ACTIVO';
    const hasProgressPhotos = (progressPhotos?.length || 0) > 0;
    const hasExerciseHistory = (exerciseHistory?.length || 0) > 0;

    for (const t of templates) {
      let score = 0;

      // === FRECUENCIA (peso: 30%) ===
      if (t.frequency === finalFrequency) {
        score += 30; // Match exacto
      } else if (Math.abs(t.frequency - finalFrequency) === 1) {
        score += 20; // ±1 día
      } else if (Math.abs(t.frequency - finalFrequency) === 2) {
        score += 10; // ±2 días
      }

      // === NIVEL (peso: 25%) ===
      const templateLevels = (t.target_levels || []).map((l: string) => l.toUpperCase());
      if (templateLevels.includes(finalLevel)) {
        score += 25; // Match exacto
      } else {
        // Match parcial por proximidad
        const levelOrder = ['PRINCIPIANTE', 'INTERMEDIO', 'AVANZADO'];
        const userLevelIdx = levelOrder.indexOf(finalLevel);
        const hasAdjacentLevel = templateLevels.some((tl: string) => {
          const tlIdx = levelOrder.indexOf(tl);
          return Math.abs(tlIdx - userLevelIdx) === 1;
        });
        if (hasAdjacentLevel) score += 15;
      }

      // === OBJETIVO (peso: 25%) ===
      const templateGoals = (t.target_goals || []).map((g: string) => g.toUpperCase());
      if (templateGoals.includes(finalGoal)) {
        score += 25; // Match exacto
      } else {
        // Match parcial por objetivos relacionados
        const relatedGoals: Record<string, string[]> = {
          HIPERTROFIA: ['RECOMPOSICION', 'GENERAL'],
          FUERZA: ['RECOMPOSICION', 'GENERAL'],
          DEFINICION: ['RECOMPOSICION', 'GENERAL'],
          RECOMPOSICION: ['HIPERTROFIA', 'DEFINICION', 'GENERAL'],
          GENERAL: ['HIPERTROFIA', 'FUERZA', 'DEFINICION', 'RECOMPOSICION'],
        };
        const related = relatedGoals[finalGoal] || [];
        if (templateGoals.some((tg: string) => related.includes(tg))) {
          score += 15;
        }
      }

      // === COMPLETITUD DEL TEMPLATE (peso: 10%) ===
      const totalExercises = (t.days || []).reduce(
        (sum: number, d: any) => sum + (d.exercises?.length || 0),
        0
      );
      const avgExercisesPerDay = t.days?.length > 0 ? totalExercises / t.days.length : 0;

      if (totalExercises >= 15) {
        score += 10; // Template muy completo
      } else if (totalExercises >= 8) {
        score += 7;
      } else if (totalExercises > 0) {
        score += 4;
      }

      // === BONUS: Template tiene descripción detallada ===
      if (t.description && t.description.length > 50) {
        score += 2;
      }

      // === BONUS: Experiencia del usuario vs complejidad del template ===
      if (hasExerciseHistory && avgExercisesPerDay >= 5) {
        score += 3; // Usuario con experiencia + template completo
      }
      if (hasProgressPhotos && templateGoals.includes('DEFINICION')) {
        score += 2; // Usuario que trackea progreso + objetivo definición
      }

      // === AJUSTE POR EDAD (para principiantes mayores, preferir menos volumen) ===
      if (userAge > 45 && finalLevel === 'PRINCIPIANTE' && t.frequency <= 4) {
        score += 3;
      }

      // Guardar mejor match
      if (score > bestScore) {
        bestScore = score;
        bestMatch = t;
      }
    }

    // Si no hay match, usar el primero
    if (!bestMatch) {
      bestMatch = templates[0];
    }

    const template = bestMatch;

    // Construir objeto de nombres de rutina (sistema weekday)
    // Mapea cada day.dayIndex (0..N-1) al weekday correspondiente.
    const weekdayMap = distributeWeekdays(template.frequency);
    const routineNames: Record<string, string> = {};
    (template.days || []).forEach((day: any) => {
      const wd = weekdayMap[day.dayIndex] ?? 1;
      routineNames[String(wd)] = day.name;
    });

    // 1. Actualizar perfil con el nuevo plan
    const { error: profileError } = await supabase
      .from('profiles')
      .update({
        training_routine_names: routineNames,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId);

    if (profileError) {
      console.error('Error updating profiles:', profileError);
      return { success: false, message: 'Error al configurar tu plan.' };
    }

    // 2. Actualizar user_profiles
    await supabase
      .from('user_profiles')
      .update({
        training_days_per_week: template.frequency,
        training_experience: finalLevel,
        goal: finalGoal,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId);

    // 3. Eliminar ejercicios anteriores
    await supabase.from('user_exercise_config').delete().eq('user_id', userId);

    // 4. Crear los ejercicios del template
    let exercisesCreated = 0;

    for (const day of template.days || []) {
      for (const exercise of day.exercises || []) {
        if (!exercise.exercise_id) continue;

        const config = {
          rest: exercise.rest || '90s',
          sets: `${exercise.series?.length || 4}x10`,
          custom_series: (exercise.series || []).map((s: any, idx: number) => ({
            id: s.id || String(idx + 1),
            type: s.type || 'EFECTIVA',
            reps: s.reps || 10,
            weight: 0,
            rir: s.type === 'FALLO' ? 0 : 2,
            tempo: '2-0-2-0',
            restSeconds: parseInt(exercise.rest) || 90,
            note: s.note || '',
          })),
          series_by_day: {},
        };

        const { error: insertError } = await supabase.from('user_exercise_config').insert({
          user_id: userId,
          exercise_id: exercise.exercise_id,
          training_days: [weekdayMap[day.dayIndex] ?? 1],
          config,
        });

        if (!insertError) exercisesCreated++;
      }
    }

    // =========================================================================
    // 5. CONSTRUIR RESPUESTA PERSONALIZADA
    // =========================================================================

    // Detalle de cada día
    const daysDetail = (template.days || [])
      .map((d: any) => {
        const wd = weekdayMap[d.dayIndex] ?? 1;
        const wdLabel = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'][
          wd
        ];
        const exercises = (d.exercises || []).map((e: any) => e.name).join(', ');
        return `📅 **${wdLabel.toUpperCase()}: ${d.name}**\n   ${exercises || 'Por configurar'}`;
      })
      .join('\n\n');

    // Textos personalizados
    const goalText: Record<string, string> = {
      HIPERTROFIA: 'ganar masa muscular',
      FUERZA: 'aumentar tu fuerza máxima',
      DEFINICION: 'definir y quemar grasa',
      RECOMPOSICION: 'ganar músculo mientras quemas grasa',
      GENERAL: 'mejorar tu condición física general',
    };

    const levelText: Record<string, string> = {
      PRINCIPIANTE: 'perfecto para comenzar',
      INTERMEDIO: 'ideal para tu experiencia',
      AVANZADO: 'desafiante para tu nivel',
    };

    // Personalizaciones extras basadas en datos del usuario
    let personalTouch = '';

    if (userProfile?.display_name && userProfile.display_name !== 'ATLETA') {
      personalTouch += `\n\n👤 ${userProfile.display_name}, `;
    }

    if (hasProgressPhotos) {
      personalTouch +=
        'vi que llevas un registro de tu progreso con fotos. ¡Eso es clave para ver resultados! ';
    }

    if (userWeight && userWeight > 0) {
      if (finalGoal === 'HIPERTROFIA') {
        personalTouch += `Con tus ${userWeight}kg, este plan te ayudará a ganar masa limpia. `;
      } else if (finalGoal === 'DEFINICION') {
        personalTouch += `A ${userWeight}kg, este plan te ayudará a marcar. `;
      }
    }

    if (userAge > 40) {
      personalTouch += 'Incluí tiempos de descanso adecuados para optimizar tu recuperación. ';
    }

    return {
      success: true,
      message: `🔥 **¡LISTO! He diseñado tu plan de entrenamiento.**

Analicé tu perfil y creé una rutina ${levelText[finalLevel] || ''} de **${template.frequency} días por semana**, enfocada en **${goalText[finalGoal] || finalGoal.toLowerCase()}**.

${daysDetail}

💪 **${exercisesCreated} ejercicios** configurados con:
• Series de calentamiento
• Series efectivas  
• Series al fallo técnico
• Tiempos de descanso optimizados${personalTouch}

Este plan está optimizado para ti. Si quieres que modifique algo (cambiar un ejercicio, agregar series, ajustar el volumen), solo dime.

¡Vamos a entrenar! 🏋️`,
      data: {
        planAssigned: true,
        templateId: template.id,
        frequency: template.frequency,
        days: template.days?.length || 0,
        exercises: exercisesCreated,
        goal: finalGoal,
        level: finalLevel,
        matchScore: bestScore,
      },
    };
  } catch (error) {
    console.error('trainingDesignPlan error:', error);
    return { success: false, message: 'Error al diseñar tu plan.' };
  }
}

// ============================================================================
// TRAINING TOOLS: Listar Plantillas de Entrenamiento (desde Supabase)
// NOTA: Esta función es para uso interno/admin, no exponer al usuario
// ============================================================================
export async function trainingListTemplates(filters?: {
  level?: string;
  goal?: string;
  frequency?: number;
}): Promise<HankToolResult> {
  try {
    // Consultar templates desde Supabase
    let query = supabase
      .from('training_plan_templates')
      .select('id, slug, name, description, target_levels, target_goals, frequency, days')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });

    const { data: dbTemplates, error } = await query;

    if (error) {
      console.error('Error fetching templates:', error);
      return { success: false, message: 'Error al obtener los planes de entrenamiento.' };
    }

    let templates = dbTemplates || [];

    // Aplicar filtros
    if (filters?.level) {
      const levelFilter = filters.level.toUpperCase();
      templates = templates.filter((t) =>
        t.target_levels?.some((l: string) => l.toUpperCase() === levelFilter)
      );
    }
    if (filters?.goal) {
      const goalFilter = filters.goal.toUpperCase();
      templates = templates.filter((t) =>
        t.target_goals?.some((g: string) => g.toUpperCase() === goalFilter)
      );
    }
    if (filters?.frequency) {
      templates = templates.filter((t) => t.frequency === filters.frequency);
    }

    if (templates.length === 0) {
      return {
        success: true,
        message:
          'No encontré planes que coincidan con esos criterios. ¿Quieres ver todos los disponibles?',
        data: { templates: [] },
      };
    }

    // Formatear para respuesta legible
    const templateList = templates
      .map((t) => {
        const daysInfo = (t.days || [])
          .map(
            (d: any) =>
              `  - Día ${d.dayIndex + 1}: ${d.name} (${d.exercises?.length || 0} ejercicios)`
          )
          .join('\n');
        return `📋 **${t.name}** (${t.frequency} días/semana)
Nivel: ${t.target_levels?.join(', ') || 'GENERAL'} | Objetivo: ${t.target_goals?.join(', ') || 'GENERAL'}
${t.description || ''}
${daysInfo}`;
      })
      .join('\n\n');

    return {
      success: true,
      message: `🏋️ Planes de entrenamiento disponibles:\n\n${templateList}\n\n¿Cuál quieres que te asigne? Dime el nombre.`,
      data: {
        templates: templates.map((t) => ({
          id: t.id,
          name: t.name,
          frequency: t.frequency,
          levels: t.target_levels,
          goals: t.target_goals,
        })),
      },
    };
  } catch (error) {
    console.error('trainingListTemplates error:', error);
    return { success: false, message: 'Error al listar planes de entrenamiento.' };
  }
}

// ============================================================================
// TRAINING TOOLS: Asignar Plan de Entrenamiento (desde Supabase + crear ejercicios)
// ============================================================================
export async function trainingAssignPlan(userId: string, planId: string): Promise<HankToolResult> {
  try {
    // Buscar la plantilla en Supabase (por ID o por nombre)
    let template: any = null;

    // Primero intentar por ID exacto (UUID)
    const { data: byId } = await supabase
      .from('training_plan_templates')
      .select('*')
      .eq('id', planId)
      .eq('is_active', true)
      .single();

    if (byId) {
      template = byId;
    } else {
      // Intentar por nombre parcial (case insensitive)
      const { data: byName } = await supabase
        .from('training_plan_templates')
        .select('*')
        .eq('is_active', true)
        .ilike('name', `%${planId}%`)
        .limit(1);

      if (byName && byName.length > 0) {
        template = byName[0];
      }
    }

    if (!template) {
      return {
        success: false,
        message: `No encontré el plan "${planId}". Usa TRAINING_LIST_TEMPLATES para ver los disponibles.`,
      };
    }

    // Construir objeto de nombres de rutina (sistema weekday)
    const weekdayMap = distributeWeekdays(template.frequency);
    const routineNames: Record<string, string> = {};
    (template.days || []).forEach((day: any) => {
      const wd = weekdayMap[day.dayIndex] ?? 1;
      routineNames[String(wd)] = day.name;
    });

    // 1. Actualizar perfil con el nuevo plan (MARCAR plan_source: 'hank')
    const { error: profileError } = await supabase
      .from('profiles')
      .update({
        training_routine_names: routineNames,
        plan_source: 'hank', // ⬅️ IMPORTANTE: Marcar que fue asignado por Hank
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId);

    if (profileError) {
      console.error('Error updating profiles:', profileError);
      return { success: false, message: 'Error al actualizar tu perfil con el nuevo plan.' };
    }

    // 2. Actualizar user_profiles (usar UPSERT para garantizar que exista)
    // NO establecer training_mode aquí - se detecta automáticamente por tener ejercicios
    await supabase.from('user_profiles').upsert(
      {
        user_id: userId,
        training_days_per_week: template.frequency,
        training_experience: template.target_levels?.[0] || 'INTERMEDIO',
        goal: template.target_goals?.[0] || 'HIPERTROFIA',
        // training_mode se detecta automáticamente como 'gym_module' por tener ejercicios
        // NO lo establecemos como 'external' porque usará el módulo GYM
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    );

    // 3. Eliminar ejercicios anteriores del usuario
    await supabase.from('user_exercise_config').delete().eq('user_id', userId);

    // 4. Crear los ejercicios del template para el usuario
    let exercisesCreated = 0;
    const exerciseErrors: string[] = [];

    for (const day of template.days || []) {
      for (const exercise of day.exercises || []) {
        if (!exercise.exercise_id) continue;

        // Construir config con las series del template
        const config = {
          rest: exercise.rest || '90s',
          sets: `${exercise.series?.length || 4}x10`,
          custom_series: (exercise.series || []).map((s: any, idx: number) => ({
            id: s.id || String(idx + 1),
            type: s.type || 'EFECTIVA',
            reps: s.reps || 10,
            weight: 0,
            rir: s.type === 'FALLO' ? 0 : 2,
            tempo: '2-0-2-0',
            restSeconds: parseInt(exercise.rest) || 90,
            note: s.note || '',
          })),
          series_by_day: {},
        };

        // Verificar si ya existe este ejercicio (mismo ejercicio en múltiples días)
        const { data: existing } = await supabase
          .from('user_exercise_config')
          .select('id, training_days')
          .eq('user_id', userId)
          .eq('exercise_id', exercise.exercise_id)
          .single();

        if (existing) {
          // Agregar el día al array existente
          const updatedDays = [...new Set([...(existing.training_days || []), day.dayIndex])];
          const { error: updateError } = await supabase
            .from('user_exercise_config')
            .update({ training_days: updatedDays, updated_at: new Date().toISOString() })
            .eq('id', existing.id);

          if (updateError) {
            console.error('Error updating exercise days:', exercise.name, updateError);
            exerciseErrors.push(exercise.name);
          } else {
            exercisesCreated++;
          }
        } else {
          const { error: insertError } = await supabase.from('user_exercise_config').insert({
            user_id: userId,
            exercise_id: exercise.exercise_id,
            training_days: [weekdayMap[day.dayIndex] ?? 1],
            config,
          });

          if (insertError) {
            console.error('Error inserting exercise:', exercise.name, insertError);
            exerciseErrors.push(exercise.name);
          } else {
            exercisesCreated++;
          }
        }
      }
    }

    const result: TrainingPlanAssignResult = {
      success: true,
      planName: template.name,
      frequency: template.frequency,
      daysConfigured: template.days?.length || 0,
      message: `Plan "${template.name}" asignado correctamente.`,
    };

    const daysInfo = (template.days || [])
      .map(
        (d: any) => `• Día ${d.dayIndex + 1}: ${d.name} (${d.exercises?.length || 0} ejercicios)`
      )
      .join('\n');

    const errorInfo =
      exerciseErrors.length > 0
        ? `\n\n⚠️ No se pudieron agregar: ${exerciseErrors.join(', ')}`
        : '';

    return {
      success: true,
      message: `✅ ¡Plan asignado correctamente!

📋 **${template.name}**
🗓️ ${template.frequency} días por semana
🎯 Objetivo: ${template.target_goals?.join(', ') || 'GENERAL'}
📊 Nivel: ${template.target_levels?.join(', ') || 'INTERMEDIO'}

Tu estructura:
${daysInfo}

💪 ${exercisesCreated} ejercicios configurados con sus series.${errorInfo}

¡Ya puedes ir al módulo GYM y empezar a entrenar!`,
      data: result,
    };
  } catch (error) {
    console.error('trainingAssignPlan error:', error);
    return { success: false, message: 'Error al asignar el plan de entrenamiento.' };
  }
}

// ============================================================================
// TRAINING TOOLS: Obtener Plan Actual
// ============================================================================
export async function trainingGetCurrentPlan(userId: string): Promise<HankToolResult> {
  try {
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('training_routine_names')
      .eq('id', userId)
      .single();

    if (error || !profile) {
      return {
        success: false,
        message: 'No pude obtener tu plan de entrenamiento actual.',
      };
    }

    const routineNames = (profile.training_routine_names || {}) as Record<string, string>;
    const frequency = Object.values(routineNames).filter((v) => (v || '').trim().length > 0).length;
    const currentDay = new Date().getDay(); // weekday: 0=Dom..6=Sáb

    if (frequency === 0 || Object.keys(routineNames).length === 0) {
      return {
        success: true,
        message: `📋 No tienes un plan estructurado todavía.
        
Frecuencia configurada: ${frequency} días/semana
Día actual: ${currentDay + 1}

¿Quieres que te muestre los planes disponibles y te asigne uno?`,
        data: { hasStructuredPlan: false, frequency, currentDay },
      };
    }

    const WEEKDAY_LABEL = [
      'Domingo',
      'Lunes',
      'Martes',
      'Miércoles',
      'Jueves',
      'Viernes',
      'Sábado',
    ];
    const VISUAL_ORDER_LOCAL = [1, 2, 3, 4, 5, 6, 0];
    const daysInfo = VISUAL_ORDER_LOCAL.filter(
      (wd) => (routineNames[String(wd)] || '').trim().length > 0
    )
      .map((wd) => `• ${WEEKDAY_LABEL[wd]}: ${routineNames[String(wd)]}`)
      .join('\n');

    return {
      success: true,
      message: `📋 Tu plan de entrenamiento actual:

🗓️ ${frequency} días por semana
📍 Hoy (${WEEKDAY_LABEL[currentDay]}): ${routineNames[String(currentDay)]?.trim() || 'Descanso'}

Estructura:
${daysInfo}

¿Quieres cambiar a otro plan?`,
      data: {
        hasStructuredPlan: true,
        frequency,
        currentDay,
        routineNames,
      },
    };
  } catch (error) {
    console.error('trainingGetCurrentPlan error:', error);
    return { success: false, message: 'Error al obtener tu plan actual.' };
  }
}

// ============================================================================
// TRAINING TOOLS: Reestructurar Plan de Entrenamiento
// ============================================================================
export async function trainingRestructure(
  userId: string,
  newDays: Array<{ name: string; muscleGroups?: string[] }>
): Promise<HankToolResult> {
  try {
    if (!newDays || newDays.length === 0) {
      return { success: false, message: 'Debes especificar al menos un día de entrenamiento.' };
    }

    if (newDays.length > 7) {
      return { success: false, message: 'Máximo 7 días de entrenamiento por semana.' };
    }

    // Construir nombres de rutina
    const routineNames: Record<string, string> = {};
    newDays.forEach((day, idx) => {
      routineNames[String(idx)] = day.name.toUpperCase();
    });

    // Actualizar perfil
    const { error } = await supabase
      .from('profiles')
      .update({
        training_frequency: newDays.length,
        training_current_day: 0,
        training_routine_names: routineNames,
        plan_source: 'custom', // Marcar como plan personalizado
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId);

    if (error) {
      console.error('trainingRestructure error:', error);
      return { success: false, message: 'Error al reestructurar el plan.' };
    }

    // SYNC: Actualizar user_profiles con el nuevo horario
    const newExternalSchedule: Record<string, string> = {};
    newDays.forEach((day, idx) => {
      newExternalSchedule[`Día ${idx + 1}`] = day.name.toUpperCase();
    });

    await supabase.from('user_profiles').upsert(
      {
        user_id: userId,
        training_mode: 'external',
        external_schedule: newExternalSchedule,
        training_days_per_week: newDays.length,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    );

    // Limpiar ejercicios de días que ya no existen
    const { data: userExercises } = await supabase
      .from('user_exercise_config')
      .select('id, training_days')
      .eq('user_id', userId);

    if (userExercises) {
      for (const ex of userExercises) {
        const validDays = (ex.training_days || []).filter((d: number) => d < newDays.length);
        if (validDays.length !== (ex.training_days || []).length) {
          await supabase
            .from('user_exercise_config')
            .update({ training_days: validDays.length > 0 ? validDays : [0] })
            .eq('id', ex.id);
        }
      }
    }

    const daysInfo = newDays.map((d, i) => `• Día ${i + 1}: ${d.name}`).join('\n');

    return {
      success: true,
      message: `✅ Plan reestructurado a ${newDays.length} días:

${daysInfo}

Los ejercicios se mantienen en sus días (ajustados si es necesario). Ve a GYM para agregar ejercicios a cada día.`,
      data: { frequency: newDays.length, routineNames },
    };
  } catch (error) {
    console.error('trainingRestructure error:', error);
    return { success: false, message: 'Error al reestructurar el plan.' };
  }
}

// ============================================================================
// TRAINING TOOLS: Renombrar Día
// ============================================================================
export async function trainingRenameDay(
  userId: string,
  dayIndex: number,
  newName: string
): Promise<HankToolResult> {
  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('training_routine_names, training_frequency')
      .eq('id', userId)
      .single();

    const routineNames = profile?.training_routine_names || {};
    const frequency = profile?.training_frequency ?? 0;

    if (frequency === 0) {
      return {
        success: false,
        message: 'No tienes días de entrenamiento. Agrega uno primero.',
      };
    }

    if (dayIndex < 0 || dayIndex >= frequency) {
      return {
        success: false,
        message: `El día ${dayIndex + 1} no existe. Tienes ${frequency} días.`,
      };
    }

    routineNames[String(dayIndex)] = newName.toUpperCase();

    const { error } = await supabase
      .from('profiles')
      .update({ training_routine_names: routineNames })
      .eq('id', userId);

    if (error) {
      return { success: false, message: 'Error al renombrar el día.' };
    }

    // SYNC: También actualizar user_profiles.external_schedule
    const newExternalSchedule: Record<string, string> = {};
    for (let i = 0; i < frequency; i++) {
      newExternalSchedule[`Día ${i + 1}`] = routineNames[String(i)] || `DÍA ${i + 1}`;
    }

    await supabase.from('user_profiles').upsert(
      {
        user_id: userId,
        training_mode: 'external',
        external_schedule: newExternalSchedule,
        training_days_per_week: frequency,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    );

    return {
      success: true,
      message: `✅ Día ${dayIndex + 1} renombrado a "${newName.toUpperCase()}"`,
      data: { dayIndex, newName: newName.toUpperCase() },
    };
  } catch (error) {
    console.error('trainingRenameDay error:', error);
    return { success: false, message: 'Error al renombrar el día.' };
  }
}

// ============================================================================
// TRAINING TOOLS: Agregar Día
// ============================================================================
export async function trainingAddDay(userId: string, dayName: string): Promise<HankToolResult> {
  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('training_routine_names, training_frequency')
      .eq('id', userId)
      .single();

    const routineNames = profile?.training_routine_names || {};
    const frequency = profile?.training_frequency ?? 0;

    if (frequency >= 7) {
      return { success: false, message: 'Ya tienes 7 días. No puedes agregar más.' };
    }

    const newIndex = frequency;
    routineNames[String(newIndex)] = dayName.toUpperCase();

    const { error } = await supabase
      .from('profiles')
      .update({
        training_frequency: frequency + 1,
        training_routine_names: routineNames,
        plan_source: 'custom', // Marcar como plan personalizado
      })
      .eq('id', userId);

    if (error) {
      return { success: false, message: 'Error al agregar el día.' };
    }

    // SYNC: También actualizar user_profiles para activar modo personalizado
    // Construir external_schedule desde los días actuales + el nuevo
    const newExternalSchedule: Record<string, string> = {};
    for (let i = 0; i <= newIndex; i++) {
      const name = routineNames[String(i)] || `DÍA ${i + 1}`;
      newExternalSchedule[`Día ${i + 1}`] = name;
    }

    await supabase.from('user_profiles').upsert(
      {
        user_id: userId,
        training_mode: 'external',
        external_schedule: newExternalSchedule,
        training_days_per_week: frequency + 1,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    );

    return {
      success: true,
      message: `✅ Día ${newIndex + 1} "${dayName.toUpperCase()}" agregado. Ahora tienes ${frequency + 1} días.`,
      data: { newDayIndex: newIndex, dayName: dayName.toUpperCase(), totalDays: frequency + 1 },
    };
  } catch (error) {
    console.error('trainingAddDay error:', error);
    return { success: false, message: 'Error al agregar el día.' };
  }
}

// ============================================================================
// TRAINING TOOLS: Eliminar Día
// ============================================================================
export async function trainingRemoveDay(userId: string, dayIndex: number): Promise<HankToolResult> {
  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('training_routine_names, training_frequency, training_current_day')
      .eq('id', userId)
      .single();

    const routineNames = profile?.training_routine_names || {};
    const frequency = profile?.training_frequency ?? 0;
    const currentDay = profile?.training_current_day ?? 0;

    if (frequency === 0) {
      return { success: false, message: 'No tienes días de entrenamiento para eliminar.' };
    }

    if (dayIndex < 0 || dayIndex >= frequency) {
      return { success: false, message: `El día ${dayIndex + 1} no existe.` };
    }

    const deletedName = routineNames[String(dayIndex)] || `Día ${dayIndex + 1}`;

    // Reconstruir nombres sin el día eliminado
    const newRoutineNames: Record<string, string> = {};
    let newIdx = 0;
    for (let i = 0; i < frequency; i++) {
      if (i !== dayIndex) {
        newRoutineNames[String(newIdx)] = routineNames[String(i)] || `DÍA ${newIdx + 1}`;
        newIdx++;
      }
    }

    // Ajustar día actual si es necesario
    const newFrequency = frequency - 1;
    const newCurrentDay =
      newFrequency === 0
        ? 0
        : currentDay >= frequency - 1
          ? 0
          : currentDay > dayIndex
            ? currentDay - 1
            : currentDay;

    const { error } = await supabase
      .from('profiles')
      .update({
        training_frequency: newFrequency,
        training_routine_names: newRoutineNames,
        training_current_day: newCurrentDay,
      })
      .eq('id', userId);

    if (error) {
      return { success: false, message: 'Error al eliminar el día.' };
    }

    // Si eliminamos el último día, mensaje especial
    if (newFrequency === 0) {
      return {
        success: true,
        message: `🗑️ "${deletedName}" eliminado. Tu plan de entrenamiento está vacío. Agrega un nuevo día cuando quieras.`,
        affectedRecords: 1,
      };
    }

    // Actualizar ejercicios: reindexar días
    const { data: userExercises } = await supabase
      .from('user_exercise_config')
      .select('id, training_days')
      .eq('user_id', userId);

    if (userExercises) {
      for (const ex of userExercises) {
        const currentDays: number[] = ex.training_days || [];
        const newDays = currentDays
          .filter((d: number) => d !== dayIndex)
          .map((d: number) => (d > dayIndex ? d - 1 : d));

        await supabase
          .from('user_exercise_config')
          .update({ training_days: newDays.length > 0 ? newDays : [0] })
          .eq('id', ex.id);
      }
    }

    // SYNC: También actualizar user_profiles
    const newExternalSchedule: Record<string, string> = {};
    Object.values(newRoutineNames).forEach((name, idx) => {
      newExternalSchedule[`Día ${idx + 1}`] = name as string;
    });

    if (newFrequency > 0) {
      await supabase.from('user_profiles').upsert(
        {
          user_id: userId,
          training_mode: 'external',
          external_schedule: newExternalSchedule,
          training_days_per_week: newFrequency,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      );
    } else {
      // Si no quedan días, desactivar modo personalizado
      await supabase.from('user_profiles').upsert(
        {
          user_id: userId,
          training_mode: 'none',
          external_schedule: {},
          training_days_per_week: 0,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      );
    }

    return {
      success: true,
      message: `✅ Día "${deletedName}" eliminado. Ahora tienes ${frequency - 1} días.`,
      data: { deletedDayIndex: dayIndex, deletedName, totalDays: frequency - 1 },
    };
  } catch (error) {
    console.error('trainingRemoveDay error:', error);
    return { success: false, message: 'Error al eliminar el día.' };
  }
}

// ============================================================================
// TRAINING STATUS TOOLS: Detectar modo de entrenamiento del usuario
// Modos: gym_module (usa ejercicios), external (entrena por su cuenta), none
// ============================================================================

/**
 * Obtiene el estado de entrenamiento del usuario
 * Detecta automáticamente si usa módulo GYM, modo externo, o nada
 */
export async function trainingGetStatus(userId: string): Promise<HankToolResult> {
  try {
    // Obtener datos de user_profiles
    const { data: userProfile } = await supabase
      .from('user_profiles')
      .select('training_experience, training_mode, external_schedule, training_days_per_week')
      .eq('user_id', userId)
      .single();

    // Obtener datos de profiles (plan actual)
    const { data: profile } = await supabase
      .from('profiles')
      .select('training_frequency, training_current_day, training_routine_names, plan_source')
      .eq('id', userId)
      .single();

    // Contar ejercicios en el módulo GYM
    const { count: exerciseCount } = await supabase
      .from('user_exercise_config')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId);

    const level = userProfile?.training_experience || 'INTERMEDIO';
    const declaredMode = userProfile?.training_mode || 'none';
    const externalSchedule = userProfile?.external_schedule || {};
    const gymExercises = exerciseCount || 0;

    // Determinar modo EFECTIVO (basado en datos reales, no solo declaración)
    let effectiveMode = 'none';
    if (gymExercises > 0) {
      effectiveMode = 'gym_module';
    } else if (externalSchedule && Object.keys(externalSchedule).length > 0) {
      effectiveMode = 'external';
    }

    // Calcular frecuencia
    const frequency =
      profile?.training_frequency ||
      userProfile?.training_days_per_week ||
      Object.keys(externalSchedule).length ||
      0;

    // Construir resumen del horario externo
    const scheduleInfo =
      Object.keys(externalSchedule).length > 0
        ? Object.entries(externalSchedule)
            .map(([day, muscle]) => `• ${day}: ${muscle}`)
            .join('\n')
        : null;

    // Mensaje descriptivo según el modo
    let description = '';
    if (effectiveMode === 'gym_module') {
      description = `Usas el módulo GYM con ${gymExercises} ejercicios configurados.`;
      if (profile?.plan_source) {
        description += ` Plan ${profile.plan_source === 'hank' ? 'creado por Hank' : 'personalizado'}.`;
      }
    } else if (effectiveMode === 'external') {
      description = `Entrenas por tu cuenta ${frequency} días por semana.`;
    } else {
      description = `No tienes entrenamiento configurado.`;
    }

    // Si el usuario es intermedio/avanzado/elite y no tiene nada, Hank ofrece opciones
    const isExperienced = ['INTERMEDIO', 'AVANZADO', 'ELITE'].includes(level.toUpperCase());
    if (effectiveMode === 'none' && isExperienced) {
      description = `Eres nivel ${level} pero no tienes entrenamiento en TRENS. ¿Entrenas por tu cuenta? Puedo:
1️⃣ Guardar tu frecuencia y horario simple (modo externo)
2️⃣ Asignarte un plan del módulo GYM`;
    } else if (effectiveMode === 'none') {
      description = `No tienes entrenamiento configurado. ¿Quieres que te diseñe un plan?`;
    }

    return {
      success: true,
      message: `📊 ESTADO DE ENTRENAMIENTO

🎯 Nivel: ${level}
🏋️ Modo: ${effectiveMode.toUpperCase()}
📅 Frecuencia: ${frequency} días/semana
${profile?.plan_source ? `📝 Fuente: ${profile.plan_source === 'hank' ? 'Hank' : 'Personalizado'}` : ''}

${description}
${scheduleInfo ? `\n📅 Tu horario:\n${scheduleInfo}` : ''}`,
      data: {
        level,
        declaredMode,
        effectiveMode,
        frequency,
        currentDay: profile?.training_current_day || 0,
        routineNames: profile?.training_routine_names || {},
        externalSchedule,
        gymExercisesCount: gymExercises,
        planSource: profile?.plan_source || null,
        isExperienced,
      },
    };
  } catch (error) {
    console.error('trainingGetStatus error:', error);
    return { success: false, message: 'Error al obtener el estado de entrenamiento.' };
  }
}

/**
 * Configura el modo de entrenamiento externo
 * Para usuarios que entrenan por su cuenta sin usar el módulo GYM
 */
export async function trainingSetExternalMode(
  userId: string,
  params: {
    enabled: boolean;
    frequency?: number;
  }
): Promise<HankToolResult> {
  try {
    const { enabled, frequency } = params;

    // Validar frecuencia
    if (enabled && frequency !== undefined && (frequency < 1 || frequency > 7)) {
      return { success: false, message: 'La frecuencia debe ser entre 1 y 7 días por semana.' };
    }

    // Usar upsert para garantizar que la fila exista
    const { error } = await supabase.from('user_profiles').upsert(
      {
        user_id: userId,
        training_mode: enabled ? 'external' : 'none',
        training_days_per_week: enabled ? frequency || null : null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    );

    if (error) {
      console.error('trainingSetExternalMode error:', error);
      return { success: false, message: 'Error al configurar el modo de entrenamiento.' };
    }

    if (enabled) {
      return {
        success: true,
        message: `✅ Modo externo activado${frequency ? ` (${frequency} días/semana)` : ''}.

${frequency ? '¿Quieres decirme qué músculos trabajas cada día? Ejemplo: "Lunes pecho, Martes espalda, Jueves piernas"' : '¿Cuántos días entrenas a la semana?'}`,
        data: { mode: 'external', frequency },
      };
    } else {
      return {
        success: true,
        message: `✅ Modo externo desactivado. Puedes usar el módulo GYM para gestionar ejercicios.`,
        data: { mode: 'none' },
      };
    }
  } catch (error) {
    console.error('trainingSetExternalMode error:', error);
    return { success: false, message: 'Error al configurar el modo de entrenamiento.' };
  }
}

/**
 * Configura el horario de entrenamiento externo (días y músculos)
 */
export async function trainingSetExternalSchedule(
  userId: string,
  schedule: Record<string, string> // {"Lunes": "Pecho y Tríceps", "Martes": "Espalda"}
): Promise<HankToolResult> {
  try {
    if (!schedule || Object.keys(schedule).length === 0) {
      return { success: false, message: 'Debes especificar al menos un día de entrenamiento.' };
    }

    const frequency = Object.keys(schedule).length;

    // Actualizar user_profiles con el modo personalizado
    const { error } = await supabase.from('user_profiles').upsert(
      {
        user_id: userId,
        training_mode: 'external',
        external_schedule: schedule,
        training_days_per_week: frequency,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    );

    if (error) {
      console.error('trainingSetExternalSchedule error:', error);
      return { success: false, message: 'Error al guardar el horario.' };
    }

    // SYNC: También actualizar profiles para mantener consistencia con GYM
    const routineNames: Record<string, string> = {};
    Object.entries(schedule).forEach(([day, muscle], idx) => {
      routineNames[String(idx)] = `${day}: ${muscle}`;
    });

    await supabase
      .from('profiles')
      .update({
        training_frequency: frequency,
        training_routine_names: routineNames,
        plan_source: 'custom',
      })
      .eq('id', userId);

    const scheduleInfo = Object.entries(schedule)
      .map(([day, muscle]) => `• ${day}: ${muscle}`)
      .join('\n');

    return {
      success: true,
      message: `✅ ¡Horario guardado!

📅 ${frequency} días de entrenamiento:
${scheduleInfo}

Ahora tengo en cuenta tu rutina cuando hablemos de entrenamiento. 💪`,
      data: { frequency, schedule },
    };
  } catch (error) {
    console.error('trainingSetExternalSchedule error:', error);
    return { success: false, message: 'Error al guardar el horario.' };
  }
}

/**
 * Elimina un día del plan de entrenamiento personalizado
 */
export async function trainingRemoveExternalDay(
  userId: string,
  dayName: string
): Promise<HankToolResult> {
  try {
    if (!dayName) {
      return { success: false, message: 'Debes especificar qué día quieres eliminar.' };
    }

    // Obtener el schedule actual
    const { data: profile, error: fetchError } = await supabase
      .from('user_profiles')
      .select('external_schedule')
      .eq('user_id', userId)
      .single();

    if (fetchError || !profile) {
      return { success: false, message: 'No encontré tu plan de entrenamiento.' };
    }

    const currentSchedule = profile.external_schedule || {};

    // Buscar el día de forma case-insensitive
    const dayNameLower = dayName.toLowerCase();
    const matchingKey = Object.keys(currentSchedule).find(
      (key) => key.toLowerCase() === dayNameLower
    );

    if (!matchingKey) {
      return {
        success: false,
        message: `No tienes "${dayName}" en tu plan. Tus días son: ${Object.keys(currentSchedule).join(', ')}`,
      };
    }

    // Eliminar el día
    const newSchedule = { ...currentSchedule };
    delete newSchedule[matchingKey];
    const newFrequency = Object.keys(newSchedule).length;

    // Actualizar en Supabase
    const updateData: Record<string, any> = {
      external_schedule: newSchedule,
      training_days_per_week: newFrequency,
      updated_at: new Date().toISOString(),
    };

    // Si no quedan días, desactivar modo personalizado
    if (newFrequency === 0) {
      updateData.training_mode = 'none';
    }

    const { error } = await supabase.from('user_profiles').update(updateData).eq('user_id', userId);

    // SYNC: Actualizar profiles para mantener sincronización completa
    const newRoutineNames: Record<string, string> = {};
    Object.entries(newSchedule).forEach(([day, muscle], idx) => {
      newRoutineNames[String(idx)] = `${day}: ${muscle}`;
    });

    await supabase
      .from('profiles')
      .update({
        training_frequency: newFrequency,
        training_routine_names: newRoutineNames,
      })
      .eq('id', userId);

    // SYNC: Ajustar training_current_day en profiles si quedó fuera de rango
    if (newFrequency > 0) {
      const { data: profileData } = await supabase
        .from('profiles')
        .select('training_current_day')
        .eq('id', userId)
        .single();

      const currentDay = profileData?.training_current_day ?? 0;
      if (currentDay >= newFrequency) {
        // Ajustar al último día válido
        await supabase
          .from('profiles')
          .update({ training_current_day: newFrequency - 1 })
          .eq('id', userId);
      }
    } else {
      // Sin días, resetear a 0
      await supabase.from('profiles').update({ training_current_day: 0 }).eq('id', userId);
    }

    if (error) {
      console.error('trainingRemoveExternalDay error:', error);
      return { success: false, message: 'Error al eliminar el día.' };
    }

    if (newFrequency === 0) {
      return {
        success: true,
        message: `✅ ¡Eliminado! Ya no tienes días de entrenamiento configurados. Puedo ayudarte a crear un nuevo plan cuando quieras.`,
        data: { removedDay: matchingKey, remainingDays: 0 },
      };
    }

    const remainingDays = Object.entries(newSchedule)
      .map(([day, muscle]) => `• ${day}: ${muscle}`)
      .join('\n');

    return {
      success: true,
      message: `✅ ¡Eliminado "${matchingKey}"!

📅 Tu plan ahora tiene ${newFrequency} día${newFrequency > 1 ? 's' : ''}:
${remainingDays}`,
      data: { removedDay: matchingKey, remainingDays: newFrequency, schedule: newSchedule },
    };
  } catch (error) {
    console.error('trainingRemoveExternalDay error:', error);
    return { success: false, message: 'Error al eliminar el día.' };
  }
}

// ============================================================================
// NOTA: Las funciones customPlan* fueron eliminadas.
// El "plan personalizado" ahora usa las MISMAS tablas que el módulo GYM:
// - profiles.training_routine_names para nombres de días
// - profiles.training_frequency para frecuencia
// - profiles.plan_source para saber si es "hank" o "custom"
// - user_exercise_config para ejercicios
//
// Esto evita duplicación y simplifica la arquitectura.
// Los usuarios pueden crear/editar su plan con las herramientas GYM existentes:
// - TRAINING_DESIGN_PLAN / TRAINING_RESTRUCTURE para diseñar
// - TRAINING_ADD_DAY / TRAINING_REMOVE_DAY para días
// - GYM_ADD_EXERCISE / GYM_REMOVE_EXERCISE para ejercicios
// ============================================================================

// ============================================================================
// SYNC TOOLS: Obtener Estado Completo del Plan
// ============================================================================
export async function getFullPlanStatus(userId: string): Promise<HankToolResult> {
  try {
    // 1. Perfil del usuario
    const { data: userProfile } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('user_id', userId)
      .single();

    // 2. Plan de entrenamiento
    const { data: profile } = await supabase
      .from('profiles')
      .select('training_frequency, training_current_day, training_routine_names')
      .eq('id', userId)
      .single();

    // 3. Ejercicios por día
    const { data: exercises } = await supabase
      .from('user_exercise_config')
      .select(
        `
        id,
        training_days,
        config,
        exercises (name)
      `
      )
      .eq('user_id', userId);

    // 4. Comidas
    const { data: meals } = await supabase
      .from('meals')
      .select('id, name, scheduled_time, ingredients, calories, protein_g, carbs_g, fat_g')
      .eq('user_id', userId)
      .order('scheduled_time', { ascending: true });

    // 5. Stack de suplementos
    const { data: supplements } = await supabase
      .from('supplement_stacks')
      .select('id, name, dose, type, time, is_pre_workout, is_post_workout')
      .eq('user_id', userId);

    // Procesar datos de entrenamiento
    const trainingFrequency = profile?.training_frequency ?? 0;
    const routineNames = profile?.training_routine_names || {};
    const currentDay = profile?.training_current_day ?? 0;

    const trainingDays =
      trainingFrequency > 0
        ? Array.from({ length: trainingFrequency }, (_, i) => {
            const dayExercises =
              exercises
                ?.filter((ex: any) => (ex.training_days || []).includes(i))
                .map((ex: any) => ex.exercises?.name || 'Sin nombre') || [];

            return {
              day: i + 1,
              name: routineNames[String(i)] || `DÍA ${i + 1}`,
              exercises: dayExercises,
              exerciseCount: dayExercises.length,
            };
          })
        : [];

    // Procesar datos de nutrición
    const mealsSummary =
      meals?.map((m: any) => ({
        name: m.name,
        time: m.scheduled_time,
        ingredients: (m.ingredients || []).map((ing: any) => ing.name).join(', '),
        macros: {
          calories: m.calories || 0,
          protein: m.protein_g || 0,
          carbs: m.carbs_g || 0,
          fat: m.fat_g || 0,
        },
      })) || [];

    const totalMacros = mealsSummary.reduce(
      (acc: any, m: any) => ({
        calories: acc.calories + m.macros.calories,
        protein: acc.protein + m.macros.protein,
        carbs: acc.carbs + m.macros.carbs,
        fat: acc.fat + m.macros.fat,
      }),
      { calories: 0, protein: 0, carbs: 0, fat: 0 }
    );

    // Construir resumen legible
    const trainingInfo =
      trainingDays.length > 0
        ? trainingDays
            .map(
              (d) =>
                `• Día ${d.day}: ${d.name} (${d.exerciseCount} ejercicios${d.exercises.length > 0 ? `: ${d.exercises.slice(0, 3).join(', ')}${d.exercises.length > 3 ? '...' : ''}` : ''})`
            )
            .join('\n')
        : 'Sin plan de entrenamiento configurado';

    const nutritionInfo = mealsSummary
      .map(
        (m: any) =>
          `• ${m.time} - ${m.name}: ${m.macros.calories}kcal (P:${m.macros.protein}g C:${m.macros.carbs}g F:${m.macros.fat}g)`
      )
      .join('\n');

    const supplementsInfo =
      supplements
        ?.map(
          (s: any) =>
            `• ${s.name}: ${s.dose}${s.time ? ` a las ${s.time}` : ''}${s.is_pre_workout ? ' (PRE)' : ''}${s.is_post_workout ? ' (POST)' : ''}`
        )
        .join('\n') || 'Sin suplementos';

    return {
      success: true,
      message: `📊 ESTADO COMPLETO DEL PLAN

👤 PERFIL:
• Peso: ${userProfile?.weight || 'No definido'}
• Altura: ${userProfile?.height || 'No definido'}
• Objetivo: ${userProfile?.goal || 'No definido'}
• Nivel: ${userProfile?.level || 'INTERMEDIO'}

🏋️ ENTRENAMIENTO (${trainingFrequency} días${trainingFrequency > 0 ? `, hoy: día ${currentDay + 1}` : ''}):
${trainingInfo}

🍽️ NUTRICIÓN (${mealsSummary.length} comidas):
${nutritionInfo || 'Sin comidas configuradas'}
📈 Total diario: ${totalMacros.calories}kcal | P:${totalMacros.protein}g | C:${totalMacros.carbs}g | F:${totalMacros.fat}g

💊 STACK:
${supplementsInfo}`,
      data: {
        profile: userProfile,
        training: {
          frequency: trainingFrequency,
          currentDay,
          days: trainingDays,
        },
        nutrition: {
          meals: mealsSummary,
          totalMacros,
        },
        supplements: supplements || [],
      },
    };
  } catch (error) {
    console.error('getFullPlanStatus error:', error);
    return { success: false, message: 'Error al obtener el estado del plan.' };
  }
}

// ============================================================================
// SYNC TOOLS: Sincronizar Macros de Nutrición
// ============================================================================
export async function syncNutritionMacros(userId: string): Promise<HankToolResult> {
  try {
    // 1. Obtener perfil del usuario
    const { data: userProfile } = await supabase
      .from('user_profiles')
      .select(
        'weight, height, goal, age, sex, activity_level, training_experience, training_days_per_week'
      )
      .eq('user_id', userId)
      .single();

    if (!userProfile) {
      return { success: false, message: 'No se encontró el perfil del usuario.' };
    }

    // 2. Obtener comidas actuales
    const { data: meals } = await supabase
      .from('meals')
      .select('id, name, ingredients')
      .eq('user_id', userId);

    if (!meals || meals.length === 0) {
      return { success: true, message: 'No hay comidas para sincronizar.' };
    }

    const mealsCount = meals.length;

    // 3. Importar función de cálculo de macros
    const { calculateUserDailyMacros, calculateMealWithUserMacros } = await import('./nutrition');

    // 4. Calcular macros diarios basados en perfil
    const dailyMacros = await calculateUserDailyMacros({
      weight: userProfile.weight,
      height: userProfile.height,
      goal: userProfile.goal,
      mealCount: mealsCount,
      age: userProfile.age,
      sex: userProfile.sex,
      activityLevel: userProfile.activity_level || 'MODERADO',
      trainingExperience: userProfile.training_experience,
      trainingDaysPerWeek: userProfile.training_days_per_week,
    });

    // Si no hay perMeal, calcular manualmente
    const perMealMacros = dailyMacros.perMeal || {
      calories: Math.round(dailyMacros.totalCalories / mealsCount),
      protein: Math.round(dailyMacros.totalProtein / mealsCount),
      carbs: Math.round(dailyMacros.totalCarbs / mealsCount),
      fat: Math.round(dailyMacros.totalFat / mealsCount),
    };

    // 5. Recalcular cada comida
    let updatedCount = 0;
    for (const meal of meals) {
      const ingredients = meal.ingredients || [];
      if (ingredients.length === 0) continue;

      const ingredientsWithIds = ingredients.map((ing: any, i: number) => ({
        id: `ing-${i}`,
        name: ing.name,
        quantity: '',
        portion: '',
      }));

      const calculated = await calculateMealWithUserMacros(ingredientsWithIds, perMealMacros);

      const updatedIngredients = calculated.map((ing) => ({
        name: ing.name,
        quantity: ing.quantity,
        portion: ing.portion || '',
      }));

      let totalCals = 0,
        totalP = 0,
        totalC = 0,
        totalF = 0;
      calculated.forEach((ing) => {
        totalCals += ing.nutritionInfo?.calories || 0;
        totalP += ing.nutritionInfo?.protein || 0;
        totalC += ing.nutritionInfo?.carbs || 0;
        totalF += ing.nutritionInfo?.fat || 0;
      });

      await supabase
        .from('meals')
        .update({
          ingredients: updatedIngredients,
          calories: Math.round(totalCals),
          protein_g: Math.round(totalP),
          carbs_g: Math.round(totalC),
          fat_g: Math.round(totalF),
        })
        .eq('id', meal.id);

      updatedCount++;
    }

    // 6. Invalidar caché de macros
    await supabase
      .from('user_profiles')
      .update({
        cached_daily_macros: null,
        cached_macros_meal_count: null,
        cached_macros_updated_at: null,
      })
      .eq('user_id', userId);

    return {
      success: true,
      message: `✅ Macros sincronizados!

📊 ${updatedCount} comidas recalculadas
🎯 Macros por comida: ${perMealMacros.calories}kcal | P:${perMealMacros.protein}g | C:${perMealMacros.carbs}g | F:${perMealMacros.fat}g
📈 Total diario: ${dailyMacros.totalCalories}kcal | P:${dailyMacros.totalProtein}g | C:${dailyMacros.totalCarbs}g | F:${dailyMacros.totalFat}g`,
      data: {
        mealsUpdated: updatedCount,
        perMealMacros,
        dailyMacros: {
          calories: dailyMacros.totalCalories,
          protein: dailyMacros.totalProtein,
          carbs: dailyMacros.totalCarbs,
          fat: dailyMacros.totalFat,
        },
      },
    };
  } catch (error) {
    console.error('syncNutritionMacros error:', error);
    return { success: false, message: 'Error al sincronizar los macros.' };
  }
}

// ============================================================================
// PRO TOOLS: Notas de ejercicio desde PRO module
// ============================================================================

/**
 * Agrega o actualiza notas de un ejercicio (sin necesidad de video)
 * Hank puede usar esto para guardar observaciones sobre técnica, sensaciones, etc.
 */
export async function proAddExerciseNote(
  userId: string,
  exerciseName: string,
  note: string,
  options?: {
    weightKg?: number;
    reps?: number;
    tags?: string[];
    exerciseId?: string;
  }
): Promise<HankToolResult> {
  try {
    // Buscar el ejercicio en el catálogo
    let exerciseId = options?.exerciseId;
    let resolvedExerciseName = exerciseName;

    if (!exerciseId) {
      const { data: exercise } = await supabase
        .from('exercises')
        .select('id, name')
        .ilike('name', `%${exerciseName}%`)
        .limit(1)
        .maybeSingle();

      if (exercise) {
        exerciseId = exercise.id;
        resolvedExerciseName = exercise.name;
      }
    }

    // Insertar nota como registro en pro_videos (sin video, solo notas)
    const { data, error } = await supabase
      .from('pro_videos')
      .insert({
        user_id: userId,
        video_url: '', // Sin video
        exercise_id: exerciseId || null,
        exercise_name: resolvedExerciseName,
        exercise_notes: note,
        notes: note,
        tags: options?.tags || [],
        weight_kg: options?.weightKg || null,
        reps: options?.reps || null,
        context_type: 'free',
        is_public: false,
      })
      .select('id')
      .single();

    if (error) throw error;

    return {
      success: true,
      message: `📝 Nota guardada para ${resolvedExerciseName}${options?.weightKg ? ` (${options.weightKg}kg` : ''}${options?.reps ? ` x ${options.reps}` : ''}${options?.weightKg ? ')' : ''}`,
      data: { noteId: data.id, exerciseName: resolvedExerciseName },
    };
  } catch (error) {
    console.error('proAddExerciseNote error:', error);
    return { success: false, message: 'Error al guardar la nota.' };
  }
}

/**
 * Obtiene el historial de notas de un ejercicio
 */
export async function proGetExerciseNotes(
  userId: string,
  exerciseName: string,
  limit: number = 10
): Promise<HankToolResult> {
  try {
    const { data: notes, error } = await supabase
      .from('pro_videos')
      .select('id, notes, exercise_notes, weight_kg, reps, tags, created_at')
      .eq('user_id', userId)
      .ilike('exercise_name', `%${exerciseName}%`)
      .not('notes', 'is', null)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;

    if (!notes || notes.length === 0) {
      return {
        success: true,
        message: `No hay notas guardadas para ${exerciseName}.`,
        data: { notes: [] },
      };
    }

    const formattedNotes = notes.map((n) => {
      const date = new Date(n.created_at).toLocaleDateString('es-PE', {
        day: 'numeric',
        month: 'short',
      });
      const weight = n.weight_kg ? `${n.weight_kg}kg` : '';
      const reps = n.reps ? `x${n.reps}` : '';
      const noteText = n.notes || n.exercise_notes;
      return `• ${date}${weight || reps ? ` (${weight}${reps})` : ''}: "${noteText}"`;
    });

    return {
      success: true,
      message: `📝 Notas de ${exerciseName}:\n${formattedNotes.join('\n')}`,
      data: { notes, count: notes.length },
    };
  } catch (error) {
    console.error('proGetExerciseNotes error:', error);
    return { success: false, message: 'Error al obtener notas.' };
  }
}

// ============================================================================
// USER GOAL TOOLS: Metas con fechas
// ============================================================================

/**
 * Establece una meta con fecha objetivo
 * Las metas se guardan en user_profiles.goals como JSONB
 */
export async function setUserGoal(
  userId: string,
  goalType: 'weight' | 'body_fat' | 'muscle_mass' | 'strength' | 'custom',
  targetValue: string,
  targetDate: string,
  options?: {
    description?: string;
    exerciseName?: string; // Para metas de fuerza
    startValue?: string;
  }
): Promise<HankToolResult> {
  try {
    // Obtener metas actuales
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('goals, weight, body_fat_percentage')
      .eq('user_id', userId)
      .single();

    const currentGoals = (profile?.goals as any[]) || [];

    // Crear nueva meta
    const newGoal = {
      id: `goal-${Date.now()}`,
      type: goalType,
      targetValue,
      targetDate,
      startValue: options?.startValue || (goalType === 'weight' ? profile?.weight : null),
      description: options?.description || getGoalDescription(goalType, targetValue),
      exerciseName: options?.exerciseName,
      createdAt: new Date().toISOString(),
      status: 'active',
    };

    // Agregar nueva meta (mantener las activas, máximo 5)
    const activeGoals = currentGoals.filter((g: any) => g.status === 'active').slice(0, 4);
    const updatedGoals = [...activeGoals, newGoal];

    // Guardar
    const { error } = await supabase
      .from('user_profiles')
      .update({ goals: updatedGoals })
      .eq('user_id', userId);

    if (error) throw error;

    // Calcular días hasta la meta
    const daysRemaining = Math.ceil(
      (new Date(targetDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    );

    return {
      success: true,
      message: `🎯 Meta establecida!\n• ${newGoal.description}\n• Fecha objetivo: ${new Date(targetDate).toLocaleDateString('es-PE', { day: 'numeric', month: 'long', year: 'numeric' })}\n• ${daysRemaining} días para lograrlo`,
      data: { goal: newGoal, daysRemaining },
    };
  } catch (error) {
    console.error('setUserGoal error:', error);
    return { success: false, message: 'Error al establecer la meta.' };
  }
}

/**
 * Obtiene las metas activas del usuario
 */
export async function getUserGoals(userId: string): Promise<HankToolResult> {
  try {
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('goals, weight, body_fat_percentage')
      .eq('user_id', userId)
      .single();

    const goals = ((profile?.goals as any[]) || []).filter((g: any) => g.status === 'active');

    if (goals.length === 0) {
      return {
        success: true,
        message: 'No tienes metas activas. ¿Quieres establecer una?',
        data: { goals: [] },
      };
    }

    const formattedGoals = goals.map((g: any) => {
      const daysRemaining = Math.ceil(
        (new Date(g.targetDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
      );
      const status = daysRemaining < 0 ? '⏰ VENCIDA' : daysRemaining < 7 ? '🔥 CERCA' : '🎯';
      return `${status} ${g.description} (${Math.abs(daysRemaining)} días ${daysRemaining < 0 ? 'pasados' : 'restantes'})`;
    });

    return {
      success: true,
      message: `📋 Tus metas:\n${formattedGoals.join('\n')}`,
      data: { goals, currentWeight: profile?.weight },
    };
  } catch (error) {
    console.error('getUserGoals error:', error);
    return { success: false, message: 'Error al obtener metas.' };
  }
}

/**
 * Actualiza el progreso de una meta
 */
export async function updateGoalProgress(
  userId: string,
  goalId: string,
  newValue: string,
  status?: 'active' | 'completed' | 'abandoned'
): Promise<HankToolResult> {
  try {
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('goals')
      .eq('user_id', userId)
      .single();

    const goals = (profile?.goals as any[]) || [];
    const goalIndex = goals.findIndex((g: any) => g.id === goalId);

    if (goalIndex === -1) {
      return { success: false, message: 'Meta no encontrada.' };
    }

    // Actualizar la meta
    const goal = goals[goalIndex];
    goal.currentValue = newValue;
    goal.lastUpdated = new Date().toISOString();
    if (status) goal.status = status;

    // Calcular progreso
    const start = parseFloat(goal.startValue) || 0;
    const target = parseFloat(goal.targetValue) || 0;
    const current = parseFloat(newValue) || 0;
    const progress = Math.min(100, Math.max(0, ((current - start) / (target - start)) * 100));
    goal.progressPercent = Math.round(progress);

    goals[goalIndex] = goal;

    const { error } = await supabase.from('user_profiles').update({ goals }).eq('user_id', userId);

    if (error) throw error;

    const emoji = status === 'completed' ? '🏆' : progress >= 75 ? '🔥' : '💪';
    return {
      success: true,
      message: `${emoji} Progreso actualizado: ${goal.description}\n• Actual: ${newValue}\n• Objetivo: ${goal.targetValue}\n• Progreso: ${goal.progressPercent}%`,
      data: { goal },
    };
  } catch (error) {
    console.error('updateGoalProgress error:', error);
    return { success: false, message: 'Error al actualizar progreso.' };
  }
}

// Helper para generar descripción de meta
function getGoalDescription(goalType: string, targetValue: string): string {
  switch (goalType) {
    case 'weight':
      return `Llegar a ${targetValue} kg de peso`;
    case 'body_fat':
      return `Llegar a ${targetValue}% de grasa corporal`;
    case 'muscle_mass':
      return `Alcanzar ${targetValue} kg de masa muscular`;
    case 'strength':
      return `Levantar ${targetValue} kg`;
    default:
      return `Meta: ${targetValue}`;
  }
}

// ============================================================================
// HANK CAPABILITIES - Información de lo que Hank puede hacer
// ============================================================================
export async function hankGetCapabilities(): Promise<HankToolResult> {
  const capabilities = `
🤖 SOY HANK - Tu coach de alto rendimiento. Puedo ayudarte con:

💪 ENTRENAMIENTO (GYM):
• Ver tu rutina de hoy y ejercicios
• Agregar/quitar/reemplazar ejercicios
• Modificar series, reps, peso, RIR, tempo
• Diseñar planes personalizados (PPL, Full Body, etc.)
• Reestructurar tu semana de entrenamiento

🍽️ NUTRICIÓN (PLAN):
• Crear planes de comidas completos
• Agregar/quitar/modificar comidas
• Calcular macros automáticamente
• Ver tu plan actual y próxima comida

💊 SUPLEMENTACIÓN:
• Configurar tu stack de suplementos
• Establecer horarios y dosis
• Pre/post entreno

📊 ADN (PERFIL):
• Actualizar peso, altura, objetivo
• Registrar medidas corporales
• Ver y establecer metas con fechas
• Analizar tu progreso con fotos

📝 NOTAS Y REGISTRO:
• Guardar notas en ejercicios
• Ver historial de entrenamientos
• Registrar observaciones de técnica

🏍️ DEPORTES (MOTO/SURF/AUTO):
• Gestionar inventario (vehículos, tablas)
• Registrar mantenimientos
• Crear eventos y sesiones

⚡ COMANDOS ÚTILES:
• "Qué me toca hoy" → Tu rutina
• "Crea mi plan" → Plan completo
• "Hazme un plan de X días" → Entrenamiento
• "Cuáles son mis metas" → Tus objetivos
• "Borra el historial" → Nuevo chat
`.trim();

  return {
    success: true,
    message: capabilities,
    data: {
      modules: ['GYM', 'PLAN', 'ADN', 'PRO', 'MOTO', 'SURF', 'AUTO'],
      toolCount: 70,
    },
  };
}

// ============================================================================
// AI-POWERED INGREDIENT ANALYSIS TOOLS
// ============================================================================

/** Análisis avanzado de ingredientes con IA */
export async function hankAnalyzeIngredientsAdvanced(
  userId: string,
  params: {
    ingredients: string;
    userContext?: string;
    includeQuality?: boolean;
    includeAllergens?: boolean;
    includeSuggestions?: boolean;
  }
): Promise<HankToolResult> {
  try {
    const ingredientList = params.ingredients
      .split(',')
      .map((i) => i.trim())
      .filter(Boolean);

    if (ingredientList.length === 0) {
      return {
        success: false,
        message: 'No se proporcionaron ingredientes válidos.',
      };
    }

    // Construir input correcto para analyzeIngredientsAdvanced
    const input = {
      ingredients: ingredientList.map((name) => ({ name })),
      userContext: params.userContext ? { goal: params.userContext } : undefined,
    };

    const result = await analyzeIngredientsAdvanced(input);

    if (!result.success) {
      return {
        success: false,
        message: 'Error en análisis de ingredientes.',
      };
    }

    let message = `📊 **ANÁLISIS NUTRICIONAL AVANZADO**\n\n`;
    message += `**Total por porción:**\n`;
    message += `• Calorías: ${result.totals.calories} kcal\n`;
    message += `• Proteína: ${result.totals.protein}g\n`;
    message += `• Carbohidratos: ${result.totals.carbs}g\n`;
    message += `• Grasas: ${result.totals.fat}g\n\n`;

    message += `**Calidad general:** ${result.mealQuality.grade} (${result.mealQuality.overallScore}/100)\n\n`;

    if (result.ingredients.length > 0) {
      message += `**Desglose por ingrediente:**\n`;
      result.ingredients.forEach(
        (ing: {
          name: string;
          suggestedQuantity: string;
          nutrition: { calories: number; protein: number };
        }) => {
          message += `• ${ing.name} (${ing.suggestedQuantity}): ${ing.nutrition.calories} kcal, ${ing.nutrition.protein}g prot\n`;
        }
      );
    }

    if (result.suggestions.warnings && result.suggestions.warnings.length > 0) {
      message += `\n⚠️ **Advertencias:** ${result.suggestions.warnings.join(', ')}`;
    }

    return {
      success: true,
      message,
      data: result,
    };
  } catch (error) {
    return {
      success: false,
      message: `Error analizando ingredientes: ${error instanceof Error ? error.message : 'Error desconocido'}`,
    };
  }
}

/** Obtener sugerencias de sustitución para ingredientes */
export async function hankGetSubstitutionSuggestions(
  _userId: string,
  params: {
    ingredients: string;
    goal: string;
  }
): Promise<HankToolResult> {
  try {
    const ingredientList = params.ingredients
      .split(',')
      .map((i) => i.trim())
      .filter(Boolean);

    if (ingredientList.length === 0) {
      return {
        success: false,
        message: 'No se proporcionaron ingredientes válidos.',
      };
    }

    // Mapear el goal del usuario al tipo esperado
    const goalMap: Record<string, 'healthier' | 'allergy' | 'cheaper' | 'available'> = {
      healthier: 'healthier',
      high_protein: 'healthier',
      low_carb: 'healthier',
      low_fat: 'healthier',
      budget: 'cheaper',
      allergen_free: 'allergy',
    };
    const reason = goalMap[params.goal] || 'healthier';

    // Obtener sustituciones para cada ingrediente
    const allSuggestions = [];
    for (const ingredientName of ingredientList) {
      const suggestions = await getSubstitutionSuggestions(ingredientName, reason);
      allSuggestions.push(...suggestions);
    }

    let message = `🔄 **SUGERENCIAS DE SUSTITUCIÓN** (Meta: ${params.goal})\n\n`;

    if (allSuggestions.length === 0) {
      message += 'No se encontraron sugerencias de sustitución.';
    } else {
      allSuggestions.forEach((sug) => {
        const impact = sug.healthScore > 0 ? `+${sug.healthScore}` : `${sug.healthScore}`;
        message += `**${sug.original}** → **${sug.substitute}**\n`;
        message += `  Razón: ${sug.reason}\n`;
        message += `  Impacto salud: ${impact} | Cal: ${sug.macroImpact.caloriesDiff > 0 ? '+' : ''}${sug.macroImpact.caloriesDiff}\n\n`;
      });
    }

    return {
      success: true,
      message,
      data: allSuggestions,
    };
  } catch (error) {
    return {
      success: false,
      message: `Error: ${error instanceof Error ? error.message : 'Error desconocido'}`,
    };
  }
}

/** Verificar alérgenos en ingredientes */
export async function hankCheckAllergens(
  _userId: string,
  params: {
    ingredients: string;
    userAllergens?: string;
  }
): Promise<HankToolResult> {
  try {
    const ingredientList = params.ingredients
      .split(',')
      .map((i) => i.trim())
      .filter(Boolean);

    if (ingredientList.length === 0) {
      return {
        success: false,
        message: 'No se proporcionaron ingredientes válidos.',
      };
    }

    const ingredientsArray = ingredientList.map((name) => ({ name }));
    const userAllergies = params.userAllergens || '';

    const result = await checkAllergens(ingredientsArray, userAllergies);

    let message = `🔍 **ANÁLISIS DE ALÉRGENOS**\n\n`;

    if (!result.hasAllergens) {
      message += `✅ **Seguro** - No se detectaron alérgenos peligrosos para ti.\n\n`;
    } else {
      message += `⚠️ **ALERTA** - Se detectaron alérgenos:\n`;
      result.problematicIngredients.forEach((p) => {
        message += `• **${p.ingredient}** contiene ${p.allergen} (severidad: ${p.severity})\n`;
      });
      message += '\n';
    }

    if (result.safeAlternatives.length > 0) {
      message += `💡 **Alternativas seguras:**\n`;
      result.safeAlternatives.forEach((alt) => {
        message += `• ${alt.original} → ${alt.alternative}\n`;
      });
    }

    return {
      success: true,
      message,
      data: result,
    };
  } catch (error) {
    return {
      success: false,
      message: `Error: ${error instanceof Error ? error.message : 'Error desconocido'}`,
    };
  }
}

/** Optimizar comida para macros específicos */
export async function hankOptimizeMealForMacros(
  userId: string,
  params: {
    mealDescription: string;
    targetCalories?: number;
    targetProtein?: number;
    targetCarbs?: number;
    targetFat?: number;
    constraints?: string;
  }
): Promise<HankToolResult> {
  try {
    // Obtener perfil del usuario para metas
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('daily_calories, daily_protein, daily_carbs, daily_fat')
      .eq('id', userId)
      .single();

    // Parsear ingredientes del mealDescription (asumimos formato "100g arroz, 150g pollo")
    const ingredientStrings = params.mealDescription.split(',').map((s) => s.trim());
    const currentIngredients = ingredientStrings.map((str) => {
      // Intentar extraer cantidad y nombre
      const match = str.match(/^(\d+\s*(?:g|ml|kg|oz)?)\s*(.+)$/i);
      if (match) {
        return { name: match[2].trim(), quantity: match[1].trim() };
      }
      return { name: str };
    });

    const targetMacros = {
      calories: params.targetCalories ?? profile?.daily_calories ?? 2000,
      protein: params.targetProtein ?? profile?.daily_protein ?? 150,
      carbs: params.targetCarbs ?? profile?.daily_carbs ?? 200,
      fat: params.targetFat ?? profile?.daily_fat ?? 60,
    };

    const userContext = params.constraints ? { goal: params.constraints } : undefined;

    const result = await optimizeMealForMacros(currentIngredients, targetMacros, userContext);

    let message = `⚡ **COMIDA OPTIMIZADA**\n\n`;
    message += `**Ingredientes originales:** ${params.mealDescription}\n\n`;
    message += `**Versión optimizada:**\n`;
    result.optimizedIngredients.forEach((ing) => {
      const adjusted = ing.adjusted ? ' ✏️' : '';
      message += `• ${ing.name}: ${ing.quantity}${adjusted}\n`;
    });
    message += '\n';

    message += `**Macros alcanzados:**\n`;
    message += `• Calorías: ${result.achievedMacros.calories} kcal\n`;
    message += `• Proteína: ${result.achievedMacros.protein}g\n`;
    message += `• Carbos: ${result.achievedMacros.carbs}g\n`;
    message += `• Grasas: ${result.achievedMacros.fat}g\n\n`;

    message += `**Precisión:** ${result.accuracy}%\n`;

    if (result.suggestions.length > 0) {
      message += `\n💡 **Sugerencias:**\n`;
      result.suggestions.forEach((sug) => {
        message += `• ${sug}\n`;
      });
    }

    return {
      success: true,
      message,
      data: result,
    };
  } catch (error) {
    return {
      success: false,
      message: `Error: ${error instanceof Error ? error.message : 'Error desconocido'}`,
    };
  }
}

// ============================================================================
// AI-POWERED VISUAL ANALYSIS TOOLS
// ============================================================================

/** Analizar foto de progreso corporal */
export async function hankAnalyzeProgressPhoto(
  userId: string,
  params: {
    photoUrl?: string;
    photoId?: string;
  }
): Promise<HankToolResult> {
  try {
    let imageUrl = params.photoUrl;

    // Si se proporciona photoId, buscar la URL
    if (!imageUrl && params.photoId) {
      const { data: photo } = await supabase
        .from('progress_photos')
        .select('photo_url')
        .eq('id', params.photoId)
        .eq('user_id', userId)
        .single();

      if (photo) {
        imageUrl = photo.photo_url;
      }
    }

    // Si no hay URL, buscar la foto más reciente
    if (!imageUrl) {
      const { data: recentPhoto } = await supabase
        .from('progress_photos')
        .select('photo_url, id')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (recentPhoto) {
        imageUrl = recentPhoto.photo_url;
      }
    }

    if (!imageUrl) {
      return {
        success: false,
        message: 'No se encontró ninguna foto de progreso. Sube una foto primero.',
      };
    }

    const result = await analyzeProgressPhoto(imageUrl);

    if (!result.success) {
      return {
        success: false,
        message: 'Error analizando foto de progreso.',
      };
    }

    let message = `📸 **ANÁLISIS DE PROGRESO CORPORAL**\n\n`;

    // Composición corporal
    message += `**Composición Corporal:**\n`;
    message += `• Grasa corporal estimada: ${result.bodyComposition.bodyFatPercentage.estimate}% `;
    message += `(${result.bodyComposition.bodyFatPercentage.range.min}-${result.bodyComposition.bodyFatPercentage.range.max}%)\n`;
    message += `• Nivel de abs: ${result.bodyComposition.visibleAbsLevel}/6\n`;
    message += `• Vascularidad: ${result.bodyComposition.vascularity}\n`;
    message += `• Condición: ${result.bodyComposition.overallCondition}\n\n`;

    // Músculos destacados
    if (result.muscleGroups.length > 0) {
      message += `**Análisis Muscular:**\n`;
      result.muscleGroups.forEach(
        (mg: { name: string; developmentLevel: string; score: number }) => {
          message += `• ${mg.name}: ${mg.developmentLevel} (${mg.score}/10)\n`;
        }
      );
      message += '\n';
    }

    // Postura
    message += `**Postura:** ${result.posture.overallPosture}\n`;
    if (result.posture.imbalances.length > 0) {
      message += `Desbalances detectados: ${result.posture.imbalances.length}\n`;
    }

    // Recomendaciones
    if (result.trainingRecommendations && result.trainingRecommendations.notes.length > 0) {
      message += `\n💡 **Recomendaciones:**\n`;
      result.trainingRecommendations.notes.slice(0, 3).forEach((rec: string) => {
        message += `• ${rec}\n`;
      });
    }

    return {
      success: true,
      message,
      data: result,
    };
  } catch (error) {
    return {
      success: false,
      message: `Error: ${error instanceof Error ? error.message : 'Error desconocido'}`,
    };
  }
}

/** Comparar dos fotos de progreso */
export async function hankCompareProgressPhotos(
  userId: string,
  params: {
    beforePhotoUrl?: string;
    afterPhotoUrl?: string;
    beforePhotoId?: string;
    afterPhotoId?: string;
  }
): Promise<HankToolResult> {
  try {
    let beforeUrl = params.beforePhotoUrl;
    let afterUrl = params.afterPhotoUrl;
    let beforeDate = new Date().toISOString();
    let afterDate = new Date().toISOString();

    // Si se proporcionan IDs, buscar URLs y fechas
    if (!beforeUrl && params.beforePhotoId) {
      const { data } = await supabase
        .from('progress_photos')
        .select('photo_url, created_at')
        .eq('id', params.beforePhotoId)
        .eq('user_id', userId)
        .single();
      if (data) {
        beforeUrl = data.photo_url;
        beforeDate = data.created_at;
      }
    }

    if (!afterUrl && params.afterPhotoId) {
      const { data } = await supabase
        .from('progress_photos')
        .select('photo_url, created_at')
        .eq('id', params.afterPhotoId)
        .eq('user_id', userId)
        .single();
      if (data) {
        afterUrl = data.photo_url;
        afterDate = data.created_at;
      }
    }

    // Si no hay URLs, buscar las dos fotos más recientes
    if (!beforeUrl || !afterUrl) {
      const { data: photos } = await supabase
        .from('progress_photos')
        .select('photo_url, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(2);

      if (photos && photos.length >= 2) {
        afterUrl = afterUrl || photos[0].photo_url;
        afterDate = photos[0].created_at;
        beforeUrl = beforeUrl || photos[1].photo_url;
        beforeDate = photos[1].created_at;
      } else {
        return {
          success: false,
          message: 'Necesitas al menos 2 fotos de progreso para comparar.',
        };
      }
    }

    const result = await compareProgressPhotos(beforeUrl!, beforeDate, afterUrl!, afterDate);

    if (!result.success) {
      return {
        success: false,
        message: 'Error comparando fotos de progreso.',
      };
    }

    let message = `📊 **COMPARACIÓN DE PROGRESO**\n\n`;

    // Puntuación de transformación
    message += `🏆 **Puntuación de Transformación: ${result.progressMetrics.transformationScore}/100**\n\n`;

    // Cambios de composición
    message += `**Cambios Detectados:**\n`;
    message += `• Grasa corporal: ${result.changes.bodyFatChange.direction} (${result.changes.bodyFatChange.estimatedChange}%)\n`;
    message += `• Progreso general: ${result.changes.overallProgress.direction}\n\n`;

    // Grupos musculares mejorados
    if (result.changes.muscleChanges.length > 0) {
      message += `💪 **Cambios Musculares:**\n`;
      result.changes.muscleChanges.forEach((mc: { muscleGroup: string; change: string }) => {
        message += `• ${mc.muscleGroup}: ${mc.change}\n`;
      });
      message += '\n';
    }

    // Feedback positivo
    if (result.feedback.positives.length > 0) {
      message += `✅ **Logros:**\n`;
      result.feedback.positives.slice(0, 3).forEach((pos: string) => {
        message += `• ${pos}\n`;
      });
    }

    // Recomendaciones
    if (result.feedback.actionItems.length > 0) {
      message += `\n💡 **Próximos Pasos:**\n`;
      result.feedback.actionItems.slice(0, 3).forEach((rec: string) => {
        message += `• ${rec}\n`;
      });
    }

    return {
      success: true,
      message,
      data: result,
    };
  } catch (error) {
    return {
      success: false,
      message: `Error: ${error instanceof Error ? error.message : 'Error desconocido'}`,
    };
  }
}

/** Analizar foto de comida */
export async function hankAnalyzeFoodPhoto(
  _userId: string,
  params: {
    photoUrl: string;
  }
): Promise<HankToolResult> {
  try {
    if (!params.photoUrl) {
      return {
        success: false,
        message: 'Se requiere una URL de foto de comida.',
      };
    }

    const result = await analyzeFoodPhoto(params.photoUrl);

    if (!result.success) {
      return {
        success: false,
        message: 'Error analizando foto de comida.',
      };
    }

    let message = `🍽️ **ANÁLISIS DE COMIDA**\n\n`;

    // Ingredientes detectados
    if (result.detectedIngredients.length > 0) {
      message += `**Alimentos identificados:**\n`;
      result.detectedIngredients.forEach((item: { name: string; estimatedQuantity: string }) => {
        message += `• ${item.name}: ~${item.estimatedQuantity}\n`;
      });
      message += '\n';
    }

    // Macros estimados
    message += `**Macros Estimados:**\n`;
    message += `• Calorías: ${result.estimatedMacros.calories} kcal\n`;
    message += `• Proteína: ${result.estimatedMacros.protein}g\n`;
    message += `• Carbos: ${result.estimatedMacros.carbs}g\n`;
    message += `• Grasas: ${result.estimatedMacros.fat}g\n\n`;

    // Puntuación de calidad
    message += `**Calidad de Comida:** ${result.mealQuality.grade} (${result.mealQuality.score}/100)\n`;

    if (result.suggestions.length > 0) {
      message += `\n💡 **Sugerencias:**\n`;
      result.suggestions.forEach((sug: string) => {
        message += `• ${sug}\n`;
      });
    }

    return {
      success: true,
      message,
      data: result,
    };
  } catch (error) {
    return {
      success: false,
      message: `Error: ${error instanceof Error ? error.message : 'Error desconocido'}`,
    };
  }
}

/** Generar timeline de progreso */
export async function hankGenerateProgressTimeline(
  userId: string,
  params: {
    limit?: number;
  }
): Promise<HankToolResult> {
  try {
    // Obtener fotos de progreso del usuario
    const { data: photos } = await supabase
      .from('progress_photos')
      .select('photo_url, created_at, snapshot')
      .eq('user_id', userId)
      .order('created_at', { ascending: true })
      .limit(params.limit ?? 10);

    if (!photos || photos.length < 2) {
      return {
        success: true,
        message:
          '📈 **TIMELINE DE PROGRESO**\n\nNo tienes suficientes fotos de progreso aún. ¡Sube al menos 2 fotos para comenzar a trackear tu transformación!',
        data: null,
      };
    }

    // Formatear fotos para la función
    const formattedPhotos = photos.map((p) => ({
      url: p.photo_url,
      date: p.created_at,
      weight: p.snapshot?.weight as number | undefined,
    }));

    const result = await generateProgressTimeline(formattedPhotos);

    if (!result.success) {
      return {
        success: false,
        message: 'Error generando timeline de progreso.',
      };
    }

    let message = `📈 **TIMELINE DE PROGRESO**\n\n`;

    // Resumen general
    message += `**Período:** ${result.dateRange.start} → ${result.dateRange.end}\n`;
    message += `**Fotos analizadas:** ${result.totalPhotos}\n`;
    message += `**Días totales:** ${result.dateRange.totalDays}\n\n`;

    // Tendencias
    message += `**Tendencias:**\n`;
    message += `• Grasa corporal: ${result.trends.bodyFat}\n`;
    message += `• Masa muscular: ${result.trends.muscleMass}\n`;
    message += `• Progreso general: ${result.trends.overall}\n\n`;

    // Períodos
    if (result.periods.length > 0) {
      message += `**Fases detectadas:**\n`;
      result.periods.forEach(
        (p: { startDate: string; endDate: string; phase: string; effectiveness: number }) => {
          message += `• ${p.startDate} - ${p.endDate}: ${p.phase} (efectividad: ${p.effectiveness}/10)\n`;
        }
      );
      message += '\n';
    }

    // Predicciones
    if (result.predictions) {
      message += `🎯 **Predicciones:**\n`;
      message += `• Tiempo estimado a meta: ${result.predictions.estimatedTimeToGoal}\n`;
      message += `• Próximo hito: ${result.predictions.nextMilestone}\n`;
      message += `• Fase recomendada: ${result.predictions.recommendedPhase}\n`;
    }

    return {
      success: true,
      message,
      data: result,
    };
  } catch (error) {
    return {
      success: false,
      message: `Error: ${error instanceof Error ? error.message : 'Error desconocido'}`,
    };
  }
}

// ============================================================================
// TOOL DEFINITIONS - Exportables para el LLM (Function Calling)
// ============================================================================
export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: 'GYM_ADD_EXERCISE',
    description:
      'Agrega un ejercicio a la rutina del usuario. Usa cuando diga "agrega", "añade", "incluye" un ejercicio. Si el usuario menciona "sesión B", "segundo entrenamiento" o "doble sesión", usa sessionIndex=1.',
    parameters: {
      exerciseName: {
        type: 'string',
        description: 'Nombre del ejercicio (ej: "Sentadilla Hack", "Press de Banca")',
        required: true,
      },
      trainingDay: {
        type: 'number',
        description: 'Día de entrenamiento (0 = día 1, 1 = día 2, etc.)',
        required: true,
      },
      sessionIndex: {
        type: 'number',
        description:
          'Índice de sesión: 0 = Sesión A (default), 1 = Sesión B (segundo entrenamiento del día). Usar 1 cuando el usuario mencione "sesión B", "segundo entreno", "entrenamiento de la tarde", "doble sesión".',
        required: false,
      },
    },
    requiredParams: ['exerciseName', 'trainingDay'],
  },
  {
    name: 'GYM_REMOVE_EXERCISE',
    description:
      'Elimina un ejercicio de la rutina. Usa cuando diga "quita", "elimina", "saca" un ejercicio.',
    parameters: {
      exerciseName: {
        type: 'string',
        description: 'Nombre del ejercicio a eliminar',
        required: true,
      },
      trainingDay: {
        type: 'number',
        description: 'Día específico (omitir para eliminar de todos)',
        required: false,
      },
      sessionIndex: {
        type: 'number',
        description:
          'Sesión específica: 0 = Sesión A, 1 = Sesión B. Omitir para eliminar de ambas sesiones.',
        required: false,
      },
      deleteCompletely: {
        type: 'boolean',
        description: 'Si true, elimina de todos los días',
        default: false,
      },
    },
    requiredParams: ['exerciseName'],
  },
  {
    name: 'GYM_REPLACE_EXERCISE',
    description:
      'Reemplaza un ejercicio por otro. Usa cuando diga "cambia X por Y", "pon X en lugar de Y".',
    parameters: {
      oldExerciseName: {
        type: 'string',
        description: 'Ejercicio actual a reemplazar',
        required: true,
      },
      newExerciseName: {
        type: 'string',
        description: 'Nuevo ejercicio',
        required: true,
      },
      trainingDay: {
        type: 'number',
        description: 'Día específico (omitir para todos)',
        required: false,
      },
    },
    requiredParams: ['oldExerciseName', 'newExerciseName'],
  },
  {
    name: 'GYM_GET_TODAY_ROUTINE',
    description:
      'Obtiene el nombre de la rutina del día (ej: "PECHO | ESPALDA") y sus ejercicios. Usa cuando pregunte "qué me toca hoy", "qué toca entrenar hoy", "qué rutina tengo hoy". SIEMPRE usa esta herramienta para preguntas sobre el entrenamiento de hoy.',
    parameters: {
      trainingDay: {
        type: 'number',
        description: 'Índice del día de entrenamiento (0-based). Usa el día actual del contexto.',
        required: true,
      },
    },
    requiredParams: ['trainingDay'],
  },
  {
    name: 'GYM_LIST_EXERCISES',
    description:
      'Lista TODOS los ejercicios de la rutina completa o de un día específico. Usa para "mi rutina completa", "todos mis ejercicios", "qué ejercicios tengo en total".',
    parameters: {
      trainingDay: {
        type: 'number',
        description:
          'Índice del día de entrenamiento (0-based). Omitir para ver TODOS los ejercicios.',
        required: false,
      },
    },
    requiredParams: [],
  },
  {
    name: 'GYM_GET_EXERCISE_DETAILS',
    description:
      'Obtiene TODOS los detalles de un ejercicio: series, reps, peso, RIR, tempo, descanso. Usa cuando diga "muéstrame las series de press banca", "cómo tengo configurado el ejercicio X", "dame los detalles de...".',
    parameters: {
      exerciseName: {
        type: 'string',
        description: 'Nombre del ejercicio',
        required: true,
      },
      trainingDay: {
        type: 'number',
        description: 'Día específico (0-based). Omitir para ver TODOS los días.',
        required: false,
      },
    },
    requiredParams: ['exerciseName'],
  },
  {
    name: 'GYM_UPDATE_SERIES_DETAIL',
    description:
      'Modifica un campo específico de una serie: reps, peso, tipo, RIR, tempo, descanso, nota. Usa cuando diga "cambia el RIR de la serie 3", "pon tempo 3-1-2 en la primera serie", "agrega 90 segundos de descanso", "sube el peso de la última serie".',
    parameters: {
      exerciseName: {
        type: 'string',
        description: 'Nombre del ejercicio',
        required: true,
      },
      seriesIndex: {
        type: 'string',
        description: 'Índice de la serie: "first", "last", o número (0-based)',
        required: true,
      },
      trainingDay: {
        type: 'number',
        description: 'Día de entrenamiento (0-based). SIEMPRE usa el día actual del contexto.',
        required: true,
      },
      reps: {
        type: 'number',
        description: 'Nuevas repeticiones',
        required: false,
      },
      weight: {
        type: 'number',
        description: 'Nuevo peso en kg',
        required: false,
      },
      type: {
        type: 'string',
        description: 'Tipo de serie',
        enum: ['WARMUP', 'APPROACH', 'EFFECTIVE', 'FAILURE'],
        required: false,
      },
      rir: {
        type: 'number',
        description: 'Reps In Reserve (0-5, donde 0=fallo)',
        required: false,
      },
      tempo: {
        type: 'string',
        description: 'Tempo en formato "X-X-X-X" (excéntrico-pausa-concéntrico-pausa)',
        required: false,
      },
      restSeconds: {
        type: 'number',
        description: 'Segundos de descanso después de esta serie',
        required: false,
      },
      note: {
        type: 'string',
        description: 'Nota para esta serie',
        required: false,
      },
    },
    requiredParams: ['exerciseName', 'seriesIndex', 'trainingDay'],
  },
  {
    name: 'GYM_CREATE_EXERCISE_GROUP',
    description:
      'Crea una super serie, tri-serie, circuito o giant set agrupando ejercicios. Usa cuando diga "haz super serie de X con Y", "crea circuito", "agrupa estos ejercicios", "combina X con Y".',
    parameters: {
      exerciseNames: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Lista de nombres de ejercicios a agrupar (ej: ["Press Banca", "Aperturas"]). Mínimo 2.',
        required: true,
      },
      groupType: {
        type: 'string',
        description: 'Tipo de grupo a crear',
        enum: ['SUPERSET', 'TRISET', 'CIRCUIT', 'GIANT_SET'],
        required: true,
      },
      trainingDay: {
        type: 'number',
        description: 'Día de entrenamiento (0-based)',
        required: true,
      },
      restBetween: {
        type: 'number',
        description: 'Segundos de descanso entre ejercicios del grupo (default según tipo)',
        required: false,
      },
      restAfter: {
        type: 'number',
        description: 'Segundos de descanso al terminar la ronda (default según tipo)',
        required: false,
      },
    },
    requiredParams: ['exerciseNames', 'groupType', 'trainingDay'],
  },
  {
    name: 'GYM_REMOVE_EXERCISE_GROUP',
    description:
      'Elimina un grupo (super serie, circuito, etc.), dejando los ejercicios como individuales. Usa cuando diga "quita la super serie", "desagrupa", "separa los ejercicios".',
    parameters: {
      exerciseNames: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Nombres de ejercicios que están en el grupo a eliminar (basta con 1 para identificar el grupo)',
        required: true,
      },
      trainingDay: {
        type: 'number',
        description: 'Día de entrenamiento (0-based)',
        required: true,
      },
    },
    requiredParams: ['exerciseNames', 'trainingDay'],
  },
  {
    name: 'ASSET_UPDATE_FIELD',
    description:
      'Actualiza cualquier campo dinámico (JSONB) de un asset. Funciona para ejercicios, motos, comidas, etc.',
    parameters: {
      assetName: {
        type: 'string',
        description: 'Nombre del asset',
        required: true,
      },
      fieldPath: {
        type: 'string',
        description: 'Ruta del campo (ej: "calories", "tire_pressure.front")',
        required: true,
      },
      newValue: {
        type: 'string',
        description: 'Nuevo valor',
        required: true,
      },
      operation: {
        type: 'string',
        description: 'Operación: set, increment, decrement',
        enum: ['set', 'increment', 'decrement'],
        default: 'set',
      },
    },
    requiredParams: ['assetName', 'fieldPath', 'newValue'],
  },
  {
    name: 'ASSET_GET_SCHEMA',
    description:
      'Obtiene la estructura de campos disponibles para un tipo de asset (para saber qué campos editar).',
    parameters: {
      assetType: {
        type: 'string',
        description: 'Tipo de asset (gym_exercise, diet_meal, moto_vehicle, etc.)',
        required: true,
      },
    },
    requiredParams: ['assetType'],
  },
  {
    name: 'DIET_ADD_CALORIES',
    description:
      'Modifica las calorías de una comida. Usa cuando diga "súbele/bájale X calorías a la cena".',
    parameters: {
      mealName: {
        type: 'string',
        description: 'Nombre de la comida (ej: "cena", "desayuno")',
        required: true,
      },
      caloriesChange: {
        type: 'number',
        description: 'Cambio en calorías (positivo = subir, negativo = bajar)',
        required: true,
      },
    },
    requiredParams: ['mealName', 'caloriesChange'],
  },
  {
    name: 'ASSET_REMOVE_SERIES',
    description:
      'Quita una serie de un ejercicio del día actual. Usa cuando diga "quita la última serie", "elimina la primera serie", "quita la serie 3". SIEMPRE usa configId si está disponible en el contexto.',
    parameters: {
      configId: {
        type: 'string',
        description:
          'ID del user_exercise_config (PREFERIDO - usar siempre que esté en el contexto)',
        required: false,
      },
      assetName: {
        type: 'string',
        description: 'Nombre del ejercicio (fallback si no hay configId)',
        required: false,
      },
      seriesIndex: {
        type: 'string',
        description:
          'Índice de la serie a quitar: "last" para última, "first" para primera, o un número (0-based)',
        required: true,
      },
      trainingDay: {
        type: 'number',
        description: 'Día de entrenamiento (0-based). SIEMPRE usa el día actual del contexto.',
        required: true,
      },
    },
    requiredParams: ['seriesIndex', 'trainingDay'],
  },
  {
    name: 'ASSET_ADD_SERIES',
    description:
      'Agrega una nueva serie a un ejercicio del día actual. Usa cuando diga "agrega una serie", "añade una serie de 10 reps". SIEMPRE usa configId si está disponible en el contexto.',
    parameters: {
      configId: {
        type: 'string',
        description:
          'ID del user_exercise_config (PREFERIDO - usar siempre que esté en el contexto)',
        required: false,
      },
      assetName: {
        type: 'string',
        description: 'Nombre del ejercicio (fallback si no hay configId)',
        required: false,
      },
      reps: {
        type: 'number',
        description: 'Número de repeticiones (default: 10)',
        required: false,
      },
      weight: {
        type: 'number',
        description: 'Peso en kg (default: 0)',
        required: false,
      },
      seriesType: {
        type: 'string',
        description: 'Tipo de serie',
        enum: ['WARMUP', 'APPROACH', 'EFFECTIVE', 'FAILURE'],
        default: 'EFFECTIVE',
      },
      position: {
        type: 'number',
        description:
          'Posición donde insertar (0=primera, 1=segunda, etc). Si no se especifica, se agrega al final.',
        required: false,
      },
      trainingDay: {
        type: 'number',
        description: 'Día de entrenamiento (0-based). SIEMPRE usa el día actual del contexto.',
        required: true,
      },
    },
    requiredParams: ['trainingDay'],
  },
  {
    name: 'ASSET_REPLACE_SERIES',
    description:
      'Reemplaza una serie existente por una nueva en el día actual. Usa cuando diga "reemplaza la serie X por...", "cambia la última serie a...". SIEMPRE usa configId si está disponible.',
    parameters: {
      configId: {
        type: 'string',
        description:
          'ID del user_exercise_config (PREFERIDO - usar siempre que esté en el contexto)',
        required: false,
      },
      assetName: {
        type: 'string',
        description: 'Nombre del ejercicio (fallback si no hay configId)',
        required: false,
      },
      seriesIndex: {
        type: 'string',
        description:
          'Índice de la serie a reemplazar: "last" para última, "first" para primera, o un número (0-based)',
        required: true,
      },
      reps: {
        type: 'number',
        description: 'Número de repeticiones para la nueva serie',
        required: true,
      },
      weight: {
        type: 'number',
        description: 'Peso en kg para la nueva serie',
        required: true,
      },
      seriesType: {
        type: 'string',
        description: 'Tipo de la nueva serie',
        enum: ['WARMUP', 'APPROACH', 'EFFECTIVE', 'FAILURE'],
        required: true,
      },
      trainingDay: {
        type: 'number',
        description: 'Día de entrenamiento (0-based). SIEMPRE usa el día actual del contexto.',
        required: true,
      },
    },
    requiredParams: ['seriesIndex', 'reps', 'weight', 'seriesType', 'trainingDay'],
  },
  {
    name: 'ASSET_SET_SERIES',
    description:
      'Configura TODAS las series de un ejercicio del día actual, reemplazando las existentes. Usa cuando el usuario pida "configura mis series", "pon las series que recomiendas", "borra todas y pon nuevas", "resetea las series". SIEMPRE usa configId si está disponible.',
    parameters: {
      configId: {
        type: 'string',
        description:
          'ID del user_exercise_config (PREFERIDO - usar siempre que esté en el contexto)',
        required: false,
      },
      assetName: {
        type: 'string',
        description: 'Nombre del ejercicio (fallback si no hay configId)',
        required: false,
      },
      series: {
        type: 'string',
        description:
          'JSON string con array de series. Cada serie: {reps:number, weight:number, type:"WARMUP"|"APPROACH"|"EFFECTIVE"|"FAILURE"}. Ejemplo: [{"reps":12,"weight":20,"type":"WARMUP"},{"reps":10,"weight":40,"type":"APPROACH"},{"reps":8,"weight":60,"type":"EFFECTIVE"},{"reps":6,"weight":70,"type":"FAILURE"}]',
        required: true,
      },
      trainingDay: {
        type: 'number',
        description: 'Día de entrenamiento (0-based). SIEMPRE usa el día actual del contexto.',
        required: true,
      },
    },
    requiredParams: ['series', 'trainingDay'],
  },
  {
    name: 'ADN_GET_PROFILE',
    description:
      'Obtiene el perfil completo del atleta (TRENS ID): objetivo, peso, altura, lesiones, alergias, medidas corporales. Usa cuando necesites conocer datos biométricos, lesiones, o personalizar recomendaciones.',
    parameters: {},
    requiredParams: [],
  },
  {
    name: 'ADN_GET_RECORDS',
    description:
      'Obtiene los récords personales del atleta (máximo 3). Muestra ejercicio, peso y reps. Usa cuando el usuario pregunte por sus PRs, récords, o máximos.',
    parameters: {},
    requiredParams: [],
  },
  {
    name: 'ADN_UPDATE_PROFILE',
    description:
      'Actualiza un campo del perfil del atleta. Usa cuando diga "mi objetivo es...", "peso X kilos", "tengo lesión en...", "soy alérgico a...", "mi nombre es...".',
    parameters: {
      field: {
        type: 'string',
        description: 'Campo a actualizar',
        enum: ['goal', 'weight', 'height', 'injuries', 'allergies', 'display_name'],
        required: true,
      },
      value: {
        type: 'string',
        description: 'Nuevo valor para el campo',
        required: true,
      },
    },
    requiredParams: ['field', 'value'],
  },
  {
    name: 'ADN_ADD_MEASUREMENT',
    description:
      'Agrega una medida corporal al perfil. Usa cuando diga "mi brazo mide X", "agrega medida de pecho", "mi pierna es de X cm".',
    parameters: {
      name: {
        type: 'string',
        description: 'Nombre de la zona corporal (ej: "Brazo", "Pecho", "Pierna", "Cintura")',
        required: true,
      },
      value: {
        type: 'string',
        description: 'Valor de la medida (ej: "45cm", "110cm")',
        required: true,
      },
      isDominant: {
        type: 'boolean',
        description: 'Si es el músculo dominante/más desarrollado del atleta',
        required: false,
      },
    },
    requiredParams: ['name', 'value'],
  },
  {
    name: 'ADN_REMOVE_MEASUREMENT',
    description:
      'Elimina una medida corporal del perfil. Usa cuando diga "quita la medida de...", "elimina mi medida de brazo".',
    parameters: {
      measurementName: {
        type: 'string',
        description: 'Nombre de la medida a eliminar',
        required: true,
      },
    },
    requiredParams: ['measurementName'],
  },
  {
    name: 'ADN_UPDATE_MEASUREMENT',
    description:
      'Actualiza el valor de una medida corporal existente. Usa cuando diga "actualiza mi brazo a X cm", "cambia mi medida de pecho", "mi cintura ahora es de X".',
    parameters: {
      measurementName: {
        type: 'string',
        description: 'Nombre de la medida a actualizar (ej: "Brazo", "Pecho", "Pierna", "Cintura")',
        required: true,
      },
      newValue: {
        type: 'string',
        description: 'Nuevo valor de la medida (ej: "45cm", "110cm")',
        required: true,
      },
      isDominant: {
        type: 'boolean',
        description: 'Si es el músculo dominante/más desarrollado del atleta',
        required: false,
      },
    },
    requiredParams: ['measurementName', 'newValue'],
  },
  {
    name: 'ADN_SET_BIOMETRICS',
    description:
      'Actualiza múltiples datos biométricos del perfil de una vez. Usa cuando el usuario reporte varios cambios: "peso 80kg, altura 175cm, objetivo definición", "tengo 25 años, soy hombre, grasa corporal 15%". Puede actualizar: weight, height, goal, age, sex, body_fat_percentage, muscle_mass, activity_level, training_experience, metabolic_rate, training_days_per_week, injuries, allergies.',
    parameters: {
      updates: {
        type: 'string',
        description:
          'JSON con los campos a actualizar. Campos disponibles: weight (number), height (number), goal ("volumen"|"definicion"|"recomp"|"mantenimiento"|"fuerza"), age (number), sex ("male"|"female"), body_fat_percentage (number), muscle_mass (number), activity_level ("sedentario"|"ligero"|"moderado"|"activo"|"muy_activo"), training_experience ("principiante"|"intermedio"|"avanzado"|"elite"), metabolic_rate (number), training_days_per_week (number), injuries (string[]), allergies (string[]). Ejemplo: {"weight":80,"goal":"definicion","body_fat_percentage":18}',
        required: true,
      },
    },
    requiredParams: ['updates'],
  },
  {
    name: 'AUTO_ADJUST_ALL',
    description:
      'Analiza el perfil completo del usuario y recalcula/ajusta automáticamente todo: macros, comidas, plan de entrenamiento. Usa después de cambios importantes en peso, objetivo o composición corporal. Responde con un resumen de todos los ajustes sugeridos.',
    parameters: {},
    requiredParams: [],
  },
  // ============================================================================
  // PROGRESS PHOTOS - Historial de Progreso Visual
  // ============================================================================
  {
    name: 'PROGRESS_GET_PHOTOS',
    description:
      'Obtiene el historial de fotos de progreso del usuario con resumen de cambios. Usa cuando pregunte "mi progreso", "mis fotos", "cómo he evolucionado", "mi transformación".',
    parameters: {},
    requiredParams: [],
  },
  {
    name: 'PROGRESS_GET_PHOTO_DETAIL',
    description:
      'Obtiene el detalle completo de una foto de progreso específica incluyendo todos los datos guardados (peso, medidas, nutrición, etc.). Usa cuando pregunte por una foto específica.',
    parameters: {
      photoId: {
        type: 'string',
        description: 'ID de la foto de progreso',
        required: true,
      },
    },
    requiredParams: ['photoId'],
  },
  {
    name: 'PROGRESS_COMPARE_PHOTOS',
    description:
      'Compara dos fotos de progreso mostrando los cambios en peso, grasa, músculo y medidas. Por defecto compara la primera con la última. Usa cuando pregunte "compara mi progreso", "cuánto he cambiado", "mi antes y después".',
    parameters: {
      firstPhotoId: {
        type: 'string',
        description: 'ID de la foto inicial (opcional, por defecto la primera)',
        required: false,
      },
      lastPhotoId: {
        type: 'string',
        description: 'ID de la foto final (opcional, por defecto la última)',
        required: false,
      },
    },
    requiredParams: [],
  },
  // ============================================================================
  // PLAN TOOLS - Nutrición y Farmacología
  // ============================================================================
  {
    name: 'PLAN_ADD_MEAL',
    description:
      'Agrega una comida al plan nutricional. Usa cuando diga "agrega una comida a las 7", "pon desayuno", "añade almuerzo a las 2 PM".',
    parameters: {
      time: {
        type: 'string',
        description: 'Hora de la comida en formato 24h (ej: "07:00", "14:30", "20:00")',
        required: true,
      },
      ingredients: {
        type: 'string',
        description:
          'JSON string con array de ingredientes. Cada uno: {name: string, quantity?: string, portion?: string}. quantity=gramos (ej: "200g"), portion=porciones (ej: "2 tazas"). Si el usuario da solo uno, la IA calcula el otro. Ej: [{"name":"Pollo","quantity":"200g"},{"name":"Arroz","portion":"1 taza"}]',
        required: true,
      },
    },
    requiredParams: ['time', 'ingredients'],
  },
  {
    name: 'PLAN_REMOVE_MEAL',
    description:
      'Elimina una comida del plan. Usa cuando diga "quita la comida de las 7", "elimina el desayuno", "borra la última comida".',
    parameters: {
      mealId: {
        type: 'string',
        description: 'ID de la comida a eliminar',
        required: false,
      },
      time: {
        type: 'string',
        description: 'Hora aproximada de la comida a eliminar (ej: "07:00")',
        required: false,
      },
      position: {
        type: 'string',
        description: 'Posición de la comida: "first", "last", o número (1-based)',
        required: false,
      },
    },
    requiredParams: [],
  },
  {
    name: 'PLAN_UPDATE_MEAL_TIME',
    description:
      'Cambia la hora de una comida. Usa cuando diga "mueve el desayuno a las 8", "cambia la hora de la comida".',
    parameters: {
      mealId: {
        type: 'string',
        description: 'ID de la comida',
        required: false,
      },
      position: {
        type: 'string',
        description: 'Posición de la comida: "first", "last", o número (1-based)',
        required: false,
      },
      newTime: {
        type: 'string',
        description: 'Nueva hora en formato 24h (ej: "08:00")',
        required: true,
      },
    },
    requiredParams: ['newTime'],
  },
  {
    name: 'PLAN_UPDATE_INGREDIENTS',
    description:
      'Actualiza los ingredientes de una comida. Acepta identificadores naturales como "cena", "almuerzo", "desayuno", "comida 3", "la última", "la primera", etc. Usa cuando diga "cambia el pollo por pescado", "agrega arroz a la cena", "actualiza mi almuerzo".',
    parameters: {
      mealIdentifier: {
        type: 'string',
        description:
          'Identificador de la comida. Acepta: nombres ("cena", "almuerzo", "desayuno"), posiciones ("comida 1", "primera", "última"), o horas ("12:00")',
        required: true,
      },
      ingredients: {
        type: 'string',
        description:
          'JSON string con array de ingredientes actualizados. Cada uno: {name: string, quantity?: string, portion?: string}. Si el usuario da gramos O porciones, la IA calcula el faltante.',
        required: true,
      },
    },
    requiredParams: ['mealIdentifier', 'ingredients'],
  },
  {
    name: 'PLAN_CALCULATE_MACROS',
    description:
      'Calcula los macros/gramos de ingredientes usando IA. Usa cuando diga "calcula los gramos", "cuántas calorías tiene", "ajusta las porciones".',
    parameters: {
      mealId: {
        type: 'string',
        description: 'ID de la comida para calcular (opcional, si no se da calcula todas)',
        required: false,
      },
    },
    requiredParams: [],
  },
  // ============================================================================
  // OMNISCIENT TOOLS - Para que HANK sea Dios en TRENS
  // ============================================================================
  {
    name: 'GET_FULL_USER_CONTEXT',
    description:
      'HERRAMIENTA MAESTRA OBLIGATORIA: Obtiene TODO sobre el usuario - peso, altura, objetivo (bulking/cutting/recomp), fotos de progreso, récords personales, comidas actuales, ejercicios, rutinas, suplementos. DEBES usarla SIEMPRE antes de crear planes de nutrición o entrenamiento para personalizar según los datos reales del usuario. También úsala si el usuario pregunta algo ambiguo o necesitas contexto.',
    parameters: {},
    requiredParams: [],
  },
  {
    name: 'PLAN_GET_MEAL_DETAILS',
    description:
      'Obtiene detalles de una comida específica con TODAS sus opciones/alternativas. Usa cuando pregunte sobre "la cena", "mi última comida", "comida 2", "opción 2 de la cena", "alternativa de desayuno", etc.',
    parameters: {
      mealIdentifier: {
        type: 'string',
        description:
          'Identificador de la comida: puede ser número (1, 2, 3), hora ("20:00"), o palabra clave ("cena", "desayuno", "última", "primera")',
        required: true,
      },
    },
    requiredParams: ['mealIdentifier'],
  },
  {
    name: 'PLAN_GET_MEALS',
    description:
      'Obtiene todas las comidas del día. Usa cuando pregunte "qué tengo de comer hoy", "muéstrame mis comidas", "cuál es mi plan de hoy".',
    parameters: {},
    requiredParams: [],
  },
  {
    name: 'PLAN_GET_SHOPPING_LIST',
    description:
      'Genera una lista de compras con todos los ingredientes necesarios. Usa cuando pregunte "qué necesito comprar", "dame mi lista de compras", "qué ingredientes necesito", "qué tengo que comprar para la semana".',
    parameters: {
      period: {
        type: 'string',
        description:
          'Periodo para calcular: "today" (hoy), "3days" (3 días), "week" (semana). Default: "today"',
        required: false,
      },
    },
    requiredParams: [],
  },
  // ============================================================================
  // MEAL OPTIONS (ALTERNATIVAS DE COMIDAS)
  // ============================================================================
  {
    name: 'PLAN_ADD_MEAL_OPTION',
    description:
      'Agrega una alternativa/opción a una comida existente. Usa cuando diga "agrega una alternativa para el desayuno", "quiero otra opción de cena", "pon un segundo platillo para la comida 1".',
    parameters: {
      mealId: {
        type: 'string',
        description: 'ID de la comida a la que agregar la alternativa',
        required: true,
      },
      optionName: {
        type: 'string',
        description: 'Nombre de la alternativa (ej: "Opción Vegetariana", "Para días de entreno")',
        required: true,
      },
      ingredients: {
        type: 'string',
        description:
          'JSON array con ingredientes: [{"name": "pollo", "quantity": "150g", "portion": "1 pechuga"}]. Si el usuario da gramos O porciones, la IA calcula el faltante.',
        required: true,
      },
    },
    requiredParams: ['mealId', 'optionName', 'ingredients'],
  },
  {
    name: 'PLAN_SELECT_MEAL_OPTION',
    description:
      'Selecciona/activa una alternativa específica para una comida. Usa cuando diga "usa la opción 2 de la cena", "cambia a la alternativa vegetariana", "quiero el otro platillo".',
    parameters: {
      mealId: {
        type: 'string',
        description: 'ID de la comida',
        required: true,
      },
      optionPosition: {
        type: 'number',
        description: 'Número de la opción a seleccionar (1-based: 1, 2, 3...)',
        required: true,
      },
    },
    requiredParams: ['mealId', 'optionPosition'],
  },
  {
    name: 'PLAN_REMOVE_MEAL_OPTION',
    description:
      'Elimina una alternativa de una comida. Usa cuando diga "quita la opción 2 del almuerzo", "elimina la alternativa vegetariana", "borra ese platillo".',
    parameters: {
      mealId: {
        type: 'string',
        description: 'ID de la comida',
        required: true,
      },
      optionPosition: {
        type: 'number',
        description: 'Número de la opción a eliminar (1-based)',
        required: true,
      },
    },
    requiredParams: ['mealId', 'optionPosition'],
  },
  {
    name: 'PLAN_GET_MEAL_OPTIONS',
    description:
      'Lista todas las alternativas de una comida. Usa cuando pregunte "qué alternativas tengo para la cena", "muéstrame las opciones del desayuno", "cuáles son mis platillos para el almuerzo".',
    parameters: {
      mealId: {
        type: 'string',
        description: 'ID de la comida',
        required: true,
      },
    },
    requiredParams: ['mealId'],
  },
  {
    name: 'PLAN_GET_NEXT_MEAL',
    description:
      'Obtiene la PRÓXIMA comida basándose en la hora actual. Usa cuando pregunte "cuál es mi próxima comida", "qué me toca comer", "cuándo como", "a qué hora es mi siguiente comida". SIEMPRE usa esta herramienta para preguntas sobre la próxima comida.',
    parameters: {},
    requiredParams: [],
  },
  {
    name: 'SPOTIFY_GET_CURRENT_TRACK',
    description:
      'Obtiene la canción que está sonando en Spotify. Usa cuando pregunte "qué canción estoy escuchando", "qué suena", "qué música tengo", "cuál es esta canción".',
    parameters: {},
    requiredParams: [],
  },
  {
    name: 'PLAN_ADD_SUPPLEMENT',
    description:
      'Agrega un suplemento al stack. Usa cuando diga "agrega creatina", "pon proteína post entreno", "añade omega 3".',
    parameters: {
      name: {
        type: 'string',
        description: 'Nombre del suplemento (ej: "Creatina", "Proteína Whey", "Omega 3")',
        required: true,
      },
      dose: {
        type: 'string',
        description: 'Dosis (ej: "5g", "30g", "2 cápsulas")',
        required: true,
      },
      type: {
        type: 'string',
        description: 'Tipo de suplemento',
        enum: ['pill', 'powder', 'liquid', 'syringe'],
        required: false,
      },
      time: {
        type: 'string',
        description: 'Hora de toma en formato 24h',
        required: false,
      },
      isPreWorkout: {
        type: 'boolean',
        description: 'Si se toma antes del entreno',
        required: false,
      },
      isPostWorkout: {
        type: 'boolean',
        description: 'Si se toma después del entreno',
        required: false,
      },
    },
    requiredParams: ['name', 'dose'],
  },
  {
    name: 'PLAN_REMOVE_SUPPLEMENT',
    description:
      'Elimina un suplemento del stack. Usa cuando diga "quita la creatina", "elimina el pre entreno".',
    parameters: {
      name: {
        type: 'string',
        description: 'Nombre del suplemento a eliminar',
        required: true,
      },
    },
    requiredParams: ['name'],
  },
  {
    name: 'PLAN_UPDATE_SUPPLEMENT_TIME',
    description:
      'Cambia la(s) hora(s) de un suplemento. Soporta múltiples horarios para suplementos que se toman varias veces al día. Usa cuando diga "cambia la hora de la creatina a las 8", "pon la proteína a las 7 AM y 7 PM", "mueve el omega a las 9".',
    parameters: {
      name: {
        type: 'string',
        description: 'Nombre del suplemento a modificar',
        required: true,
      },
      newTime: {
        type: 'string',
        description: 'Nueva hora en formato 24h (ej: "08:00", "20:00"). Para una sola hora.',
        required: false,
      },
      newTimes: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Array de horarios en formato 24h (ej: ["07:00", "19:00"]) para suplementos con múltiples tomas al día.',
        required: false,
      },
    },
    requiredParams: ['name'],
  },
  {
    name: 'PLAN_UPDATE_SUPPLEMENT_DOSE',
    description:
      'Cambia la dosis de un suplemento. Usa cuando diga "cambia la dosis de creatina a 10g", "pon 2 cápsulas de omega", "sube la proteína a 40g".',
    parameters: {
      name: {
        type: 'string',
        description: 'Nombre del suplemento a modificar',
        required: true,
      },
      newDose: {
        type: 'string',
        description: 'Nueva dosis (ej: "5g", "2 cápsulas", "1 scoop", "500mg")',
        required: true,
      },
    },
    requiredParams: ['name', 'newDose'],
  },
  {
    name: 'PLAN_UPDATE_SUPPLEMENT_NAME',
    description:
      'Renombra un suplemento. Usa cuando diga "cambia el nombre de creatina a mono", "renombra la proteína".',
    parameters: {
      oldName: {
        type: 'string',
        description: 'Nombre actual del suplemento',
        required: true,
      },
      newName: {
        type: 'string',
        description: 'Nuevo nombre del suplemento',
        required: true,
      },
    },
    requiredParams: ['oldName', 'newName'],
  },
  {
    name: 'PLAN_UPDATE_MEAL_NAME',
    description:
      'Cambia el nombre de una comida. Usa cuando diga "renombra la comida 1 a desayuno", "cambia el nombre de la cena".',
    parameters: {
      mealId: {
        type: 'string',
        description: 'ID de la comida',
        required: false,
      },
      position: {
        type: 'string',
        description: 'Posición de la comida: "first", "last", o número (1-based)',
        required: false,
      },
      newName: {
        type: 'string',
        description: 'Nuevo nombre de la comida (ej: "Desayuno", "Pre-entreno", "Cena")',
        required: true,
      },
    },
    requiredParams: ['newName'],
  },
  {
    name: 'PLAN_UPDATE_MEAL_MACROS',
    description:
      'Actualiza los macros de una comida manualmente. Usa cuando diga "pon 500 calorías a la comida 1", "cambia la proteína del desayuno a 40g".',
    parameters: {
      mealId: {
        type: 'string',
        description: 'ID de la comida',
        required: false,
      },
      position: {
        type: 'string',
        description: 'Posición de la comida: "first", "last", o número (1-based)',
        required: false,
      },
      calories: {
        type: 'number',
        description: 'Nuevas calorías totales',
        required: false,
      },
      protein: {
        type: 'number',
        description: 'Nuevos gramos de proteína',
        required: false,
      },
      carbs: {
        type: 'number',
        description: 'Nuevos gramos de carbohidratos',
        required: false,
      },
      fat: {
        type: 'number',
        description: 'Nuevos gramos de grasa',
        required: false,
      },
    },
    requiredParams: [],
  },
  {
    name: 'TRAINING_SET_FREQUENCY',
    description:
      'Cambia la frecuencia de entrenamiento (días por semana). Usa cuando diga "entreno 5 días", "cambio a 4 días por semana", "ahora voy 6 veces".',
    parameters: {
      frequency: {
        type: 'number',
        description: 'Número de días de entrenamiento por semana (1-7)',
        required: true,
      },
    },
    requiredParams: ['frequency'],
  },
  {
    name: 'TRAINING_SET_CURRENT_DAY',
    description:
      'Cambia el día actual de la rutina. Usa cuando diga "estoy en el día 3", "hoy me toca día 2", "resetea al día 1".',
    parameters: {
      dayNumber: {
        type: 'number',
        description: 'Número del día (0-based internamente, pero el usuario dice 1-based)',
        required: true,
      },
    },
    requiredParams: ['dayNumber'],
  },
  {
    name: 'PLAN_GET_STACK',
    description:
      'Obtiene el stack de suplementos actual. Usa cuando pregunte "qué suplementos tomo", "muéstrame mi stack".',
    parameters: {},
    requiredParams: [],
  },
  {
    name: 'PLAN_ANALYZE_NUTRITION',
    description:
      'Analiza la nutrición del día completo y da recomendaciones. Usa cuando diga "analiza mi dieta", "cómo está mi nutrición", "qué me falta hoy".',
    parameters: {},
    requiredParams: [],
  },
  {
    name: 'HANK_CLEAR_HISTORY',
    description:
      'Borra/limpia el historial de conversación con HANK. SIEMPRE usa esta herramienta cuando el usuario mencione cualquier variación de: "borra el historial", "borra historial", "limpia el chat", "limpia chat", "resetea la conversación", "olvida todo", "empieza de nuevo", "borra todo", "limpia todo", "elimina el historial", "elimina historial", "clear chat", "clear history", "nuevo chat", "chat nuevo", "borrón y cuenta nueva", "empezar de cero". NUNCA digas "historial borrado" sin llamar esta función.',
    parameters: {},
    requiredParams: [],
  },
  // ============================================================================
  // PLAN BUILDER TOOLS - Construcción conversacional de planes
  // ============================================================================
  {
    name: 'PLAN_BUILDER_START',
    description:
      'Inicia el modo Plan Builder para crear un plan de nutrición. CUÁNDO USAR: Solo cuando el usuario CONFIRMA que quiere crear el plan (dice "sí", "dale", "confírmalo", "hazlo", "ejecuta"). ANTES de llamar esta herramienta, SIEMPRE muestra un PREVIEW en texto de lo que vas a crear. NUNCA uses esta herramienta si el usuario aún no ha confirmado el plan.',
    parameters: {
      clearExisting: {
        type: 'boolean',
        description:
          'Si es true, el plan existente se REEMPLAZA al ejecutar. Si es false (default), se AGREGA al existente.',
        required: false,
        default: false,
      },
    },
    requiredParams: [],
  },
  {
    name: 'PLAN_BUILDER_ADD_MEAL',
    description:
      'Agrega una comida al plan en construcción (NO guarda en DB todavía). CRÍTICO: Debes llamar esta herramienta INMEDIATAMENTE después de PLAN_BUILDER_START para CADA comida acordada. Si el usuario dijo X comidas, debes llamar esta herramienta X veces. Distribuye las horas uniformemente entre la primera y última hora mencionadas.',
    parameters: {
      time: {
        type: 'string',
        description: 'Hora de la comida en formato 24h (ej: "07:00", "14:30", "20:00")',
        required: true,
      },
      ingredients: {
        type: 'string',
        description:
          'JSON string con array de ingredientes. Cada uno: {name: string, quantity?: string, portion?: string}. quantity=gramos, portion=porciones. Si el usuario da solo uno, la IA calcula el otro. Ej: [{"name":"Pollo","quantity":"200g"},{"name":"Arroz","portion":"1 taza"}]',
        required: true,
      },
      name: {
        type: 'string',
        description:
          'Nombre de la comida: DESAYUNO, ALMUERZO, MERIENDA, CENA, SNACK, PRE-ENTRENO, POST-ENTRENO',
        required: false,
      },
    },
    requiredParams: ['time', 'ingredients'],
  },
  {
    name: 'PLAN_BUILDER_EDIT_MEAL',
    description:
      'Edita una comida en el plan en construcción. Usa cuando el usuario diga "cambia la hora del desayuno", "edita la comida 2", "modifica el almuerzo".',
    parameters: {
      mealIdentifier: {
        type: 'string',
        description:
          'Identificador de la comida: número (1, 2, 3), nombre ("desayuno", "almuerzo"), o palabras clave ("primera", "última").',
        required: true,
      },
      time: {
        type: 'string',
        description: 'Nueva hora en formato 24h (opcional)',
        required: false,
      },
      ingredients: {
        type: 'string',
        description: 'Nuevos ingredientes como JSON string (opcional)',
        required: false,
      },
      name: {
        type: 'string',
        description: 'Nuevo nombre de la comida (opcional)',
        required: false,
      },
    },
    requiredParams: ['mealIdentifier'],
  },
  {
    name: 'PLAN_BUILDER_REMOVE_MEAL',
    description:
      'Elimina una comida del plan en construcción. Usa cuando el usuario diga "quita el desayuno", "elimina la comida 3", "borra la última comida" MIENTRAS EL PLAN BUILDER ESTÁ ACTIVO.',
    parameters: {
      mealIdentifier: {
        type: 'string',
        description:
          'Identificador de la comida: número (1, 2, 3), nombre ("desayuno"), o palabras clave ("primera", "última").',
        required: true,
      },
    },
    requiredParams: ['mealIdentifier'],
  },
  {
    name: 'PLAN_BUILDER_ADD_SUPPLEMENT',
    description:
      'Agrega un suplemento al stack del plan en construcción. CRÍTICO: Debes llamar esta herramienta para CADA suplemento que el usuario mencionó en la conversación (creatina, proteína, omega 3, multivitamínico, pre-entreno, etc). No esperes confirmación. Si el usuario dijo "tomo creatina, proteína y omega 3", llama PLAN_BUILDER_ADD_SUPPLEMENT 3 veces seguidas.',
    parameters: {
      name: {
        type: 'string',
        description: 'Nombre del suplemento (ej: "Creatina", "Proteína Whey", "Omega 3")',
        required: true,
      },
      dose: {
        type: 'string',
        description: 'Dosis (ej: "5g", "30g", "2 cápsulas")',
        required: true,
      },
      type: {
        type: 'string',
        description: 'Tipo de suplemento',
        enum: ['pill', 'powder', 'liquid', 'syringe'],
        required: false,
      },
      time: {
        type: 'string',
        description: 'Hora de toma en formato 24h (opcional si es pre/post workout)',
        required: false,
      },
      isPreWorkout: {
        type: 'boolean',
        description: 'Si se toma antes del entreno',
        required: false,
      },
      isPostWorkout: {
        type: 'boolean',
        description: 'Si se toma después del entreno',
        required: false,
      },
    },
    requiredParams: ['name', 'dose'],
  },
  {
    name: 'PLAN_BUILDER_REMOVE_SUPPLEMENT',
    description:
      'Elimina un suplemento del stack del plan en construcción. Usa cuando el usuario diga "quita la creatina", "elimina el omega 3" MIENTRAS EL PLAN BUILDER ESTÁ ACTIVO.',
    parameters: {
      nameOrIndex: {
        type: 'string',
        description: 'Nombre del suplemento o número (1, 2, 3)',
        required: true,
      },
    },
    requiredParams: ['nameOrIndex'],
  },
  {
    name: 'PLAN_BUILDER_SET_TRAINING',
    description:
      'Configura el entrenamiento dentro del Plan Builder. Cuando se ejecute el plan, se asignará automáticamente un plan de entrenamiento personalizado basado en estos parámetros. Usa cuando estés construyendo un plan completo (nutrición + suplementos + entrenamiento).',
    parameters: {
      goal: {
        type: 'string',
        description: 'Objetivo: HIPERTROFIA, FUERZA, DEFINICION, RECOMPOSICION, GENERAL',
        required: true,
      },
      level: {
        type: 'string',
        description: 'Nivel: PRINCIPIANTE, INTERMEDIO, AVANZADO',
        required: true,
      },
      frequency: {
        type: 'number',
        description: 'Días por semana (3, 4, 5, 6)',
        required: true,
      },
    },
    requiredParams: ['goal', 'level', 'frequency'],
  },
  {
    name: 'PLAN_BUILDER_SHOW',
    description:
      'Muestra el plan actual en construcción con todas las comidas y suplementos agregados. Usa cuando el usuario diga "muéstrame el plan", "qué tengo en el plan", "cómo va mi plan", "resumen del plan".',
    parameters: {},
    requiredParams: [],
  },
  {
    name: 'PLAN_BUILDER_CLEAR',
    description:
      'Limpia el Plan Builder descartando todos los cambios sin guardar. Usa cuando el usuario diga "cancela el plan", "borra todo el plan", "empezar de nuevo el plan", "descarta los cambios".',
    parameters: {},
    requiredParams: [],
  },
  {
    name: 'PLAN_BUILDER_EXECUTE',
    description:
      'EJECUTA Y GUARDA todo el plan en construcción en la base de datos. ⚠️ ADVERTENCIA: NUNCA llames esta herramienta si el plan está vacío. PRIMERO debes haber llamado PLAN_BUILDER_ADD_MEAL y/o PLAN_BUILDER_ADD_SUPPLEMENT para agregar contenido. Si el Plan Builder muestra 0 comidas y 0 suplementos, NO ejecutes. Usa SOLO cuando ya agregaste contenido al plan.',
    parameters: {},
    requiredParams: [],
  },
  // ========== TRAINING PLAN TOOLS ==========
  {
    name: 'TRAINING_DESIGN_PLAN',
    description:
      'PRINCIPAL: Diseña y asigna un plan de entrenamiento personalizado para el usuario basándose en su objetivo, nivel y frecuencia. USA ESTA cuando el usuario diga "quiero entrenar", "hazme un plan", "arma mi rutina", "diseña mi entrenamiento", "quiero ganar músculo", "quiero perder grasa". Hank pregunta objetivo, nivel y días disponibles, y luego llama esta herramienta.',
    parameters: {
      goal: {
        type: 'string',
        description:
          'Objetivo: HIPERTROFIA (ganar músculo), FUERZA (ser más fuerte), DEFINICION (quemar grasa), RECOMPOSICION (ganar músculo y perder grasa), GENERAL',
        required: true,
      },
      level: {
        type: 'string',
        description:
          'Nivel de experiencia: PRINCIPIANTE (0-1 año), INTERMEDIO (1-3 años), AVANZADO (3+ años)',
        required: true,
      },
      frequency: {
        type: 'number',
        description: 'Días por semana que puede entrenar (3, 4, 5, 6)',
        required: true,
      },
    },
    requiredParams: ['goal', 'level', 'frequency'],
  },
  {
    name: 'TRAINING_LIST_TEMPLATES',
    description:
      'USO INTERNO/ADMIN: Lista los planes disponibles. NO usar con usuarios normales - ellos no deben saber que hay planes predefinidos. Usar solo para debug o cuando el admin lo pida explícitamente.',
    parameters: {
      level: {
        type: 'string',
        description: 'Filtrar por nivel: PRINCIPIANTE, INTERMEDIO, AVANZADO',
        required: false,
      },
      goal: {
        type: 'string',
        description:
          'Filtrar por objetivo: HIPERTROFIA, FUERZA, DEFINICION, RECOMPOSICION, GENERAL',
        required: false,
      },
      frequency: {
        type: 'number',
        description: 'Filtrar por frecuencia semanal (3, 4, 5, 6 días)',
        required: false,
      },
    },
    requiredParams: [],
  },
  {
    name: 'TRAINING_ASSIGN_PLAN',
    description:
      'USO INTERNO: Asigna un plan específico por nombre/ID. Preferir TRAINING_DESIGN_PLAN para usuarios normales.',
    parameters: {
      planId: {
        type: 'string',
        description:
          'ID o nombre del plan a asignar (ej: "ppl-6", "full-body-3", "Push Pull Legs")',
        required: true,
      },
    },
    requiredParams: ['planId'],
  },
  {
    name: 'TRAINING_GET_CURRENT_PLAN',
    description:
      'Obtiene el plan de entrenamiento actual del usuario. Usa cuando pregunte "cuál es mi plan", "qué rutina tengo", "mi estructura actual", "cómo está mi entrenamiento".',
    parameters: {},
    requiredParams: [],
  },
  {
    name: 'TRAINING_RESTRUCTURE',
    description:
      'Reestructura completamente el plan de entrenamiento con nuevos días. Usa cuando diga "quiero cambiar a X días", "reestructura mi rutina", "cambia mi plan a...".',
    parameters: {
      newDays: {
        type: 'string',
        description:
          'JSON array con los nuevos días. Ej: [{"name":"Push"},{"name":"Pull"},{"name":"Legs"}]',
        required: true,
      },
    },
    requiredParams: ['newDays'],
  },
  {
    name: 'TRAINING_RENAME_DAY',
    description:
      'Renombra un día de entrenamiento específico. Usa cuando diga "renombra el día 1 a Pecho", "cambia el nombre del día 3".',
    parameters: {
      dayIndex: {
        type: 'number',
        description: 'Índice del día a renombrar (0 = día 1, 1 = día 2, etc.)',
        required: true,
      },
      newName: {
        type: 'string',
        description: 'Nuevo nombre para el día',
        required: true,
      },
    },
    requiredParams: ['dayIndex', 'newName'],
  },
  {
    name: 'TRAINING_ADD_DAY',
    description:
      'Agrega un nuevo día de entrenamiento al final. Usa cuando diga "agrega un día de piernas", "añade otro día".',
    parameters: {
      dayName: {
        type: 'string',
        description: 'Nombre del nuevo día (ej: "Piernas", "Full Body", "Core")',
        required: true,
      },
    },
    requiredParams: ['dayName'],
  },
  {
    name: 'TRAINING_REMOVE_DAY',
    description:
      'Elimina un día de entrenamiento. Usa cuando diga "elimina el día 4", "quita el último día", "borra el día de brazos".',
    parameters: {
      dayIndex: {
        type: 'number',
        description: 'Índice del día a eliminar (0 = día 1, 1 = día 2, etc.)',
        required: true,
      },
    },
    requiredParams: ['dayIndex'],
  },
  {
    name: 'GET_FULL_PLAN_STATUS',
    description:
      'Obtiene el estado COMPLETO del plan del usuario: perfil, entrenamiento, nutrición y suplementos. Usa cuando necesites contexto completo, cuando pregunte "cómo está mi plan", "dame un resumen de todo", "qué tengo configurado".',
    parameters: {},
    requiredParams: [],
  },
  {
    name: 'SYNC_NUTRITION_MACROS',
    description:
      'Sincroniza y recalcula todos los macros de las comidas basándose en el perfil actual. Usa cuando diga "sincroniza mis macros", "recalcula mi nutrición", "actualiza las cantidades de mis comidas", o después de cambios en el perfil.',
    parameters: {},
    requiredParams: [],
  },
  // ============================================================================
  // PRO TOOLS - Notas y registro de ejercicios
  // ============================================================================
  {
    name: 'PRO_ADD_EXERCISE_NOTE',
    description:
      'Guarda una nota sobre un ejercicio. Usa cuando el usuario diga "anota que...", "guarda que en el press...", "recuerda que este ejercicio...", "mi sensación fue...", "noté que...".',
    parameters: {
      exerciseName: {
        type: 'string',
        description: 'Nombre del ejercicio',
        required: true,
      },
      note: {
        type: 'string',
        description: 'La nota o observación a guardar',
        required: true,
      },
      weightKg: {
        type: 'number',
        description: 'Peso usado (opcional)',
        required: false,
      },
      reps: {
        type: 'number',
        description: 'Repeticiones hechas (opcional)',
        required: false,
      },
      tags: {
        type: 'array',
        description: 'Tags para categorizar: técnica, sensación, PR, dolor, etc.',
        items: { type: 'string' },
        required: false,
      },
    },
    requiredParams: ['exerciseName', 'note'],
  },
  {
    name: 'PRO_GET_EXERCISE_NOTES',
    description:
      'Obtiene el historial de notas de un ejercicio. Usa cuando pregunte "qué notas tengo de...", "historial de...", "qué anoté sobre...".',
    parameters: {
      exerciseName: {
        type: 'string',
        description: 'Nombre del ejercicio',
        required: true,
      },
      limit: {
        type: 'number',
        description: 'Cantidad máxima de notas a mostrar (default: 10)',
        required: false,
      },
    },
    requiredParams: ['exerciseName'],
  },
  // ============================================================================
  // USER GOAL TOOLS - Metas con fechas
  // ============================================================================
  {
    name: 'SET_USER_GOAL',
    description:
      'Establece una meta con fecha objetivo. Usa cuando diga "mi meta es...", "quiero llegar a...", "para [fecha] quiero...", "en 3 meses quiero...".',
    parameters: {
      goalType: {
        type: 'string',
        description: 'Tipo de meta',
        enum: ['weight', 'body_fat', 'muscle_mass', 'strength', 'custom'],
        required: true,
      },
      targetValue: {
        type: 'string',
        description: 'Valor objetivo (ej: "80", "15%", "100kg")',
        required: true,
      },
      targetDate: {
        type: 'string',
        description: 'Fecha objetivo en formato YYYY-MM-DD',
        required: true,
      },
      description: {
        type: 'string',
        description: 'Descripción personalizada de la meta (opcional)',
        required: false,
      },
      exerciseName: {
        type: 'string',
        description: 'Para metas de fuerza, el ejercicio objetivo (ej: "Press de Banca")',
        required: false,
      },
      startValue: {
        type: 'string',
        description: 'Valor inicial para calcular progreso (se auto-detecta si no se proporciona)',
        required: false,
      },
    },
    requiredParams: ['goalType', 'targetValue', 'targetDate'],
  },
  {
    name: 'GET_USER_GOALS',
    description:
      'Obtiene las metas activas del usuario. Usa cuando pregunte "cuáles son mis metas", "qué objetivos tengo", "mis goals".',
    parameters: {},
    requiredParams: [],
  },
  {
    name: 'UPDATE_GOAL_PROGRESS',
    description:
      'Actualiza el progreso de una meta. Usa cuando diga "actualiza mi meta", "ya estoy en X", "logré la meta".',
    parameters: {
      goalId: {
        type: 'string',
        description: 'ID de la meta a actualizar',
        required: true,
      },
      newValue: {
        type: 'string',
        description: 'Nuevo valor actual',
        required: true,
      },
      status: {
        type: 'string',
        description: 'Nuevo estado de la meta',
        enum: ['active', 'completed', 'abandoned'],
        required: false,
      },
    },
    requiredParams: ['goalId', 'newValue'],
  },
  // ============================================================================
  // HANK SYSTEM TOOLS - Información del sistema
  // ============================================================================
  {
    name: 'HANK_GET_CAPABILITIES',
    description:
      'Muestra todo lo que HANK puede hacer. Usa cuando pregunte "qué puedes hacer", "ayuda", "help", "cuáles son tus funciones", "cómo te uso".',
    parameters: {},
    requiredParams: [],
  },
  // ============================================================================
  // EXTERNAL TRAINING TOOLS - Para usuarios que no usan el módulo GYM
  // ============================================================================
  {
    name: 'TRAINING_GET_STATUS',
    description:
      'Obtiene el estado de entrenamiento del usuario: detecta si usa módulo GYM, entrenamiento externo, plan personalizado, o nada. IMPORTANTE: Usa esto PRIMERO cuando el usuario hable de entrenamiento y no estés seguro de su configuración actual. Ideal para usuarios intermedios/avanzados que no usan el módulo GYM.',
    parameters: {},
    requiredParams: [],
  },
  {
    name: 'TRAINING_SET_EXTERNAL_MODE',
    description:
      'Configura el modo de entrenamiento externo para usuarios que entrenan por su cuenta sin usar el módulo GYM. Usa cuando el usuario diga "entreno por mi cuenta", "ya tengo mi rutina", "no quiero usar el módulo de ejercicios", "solo quiero que sepas mi frecuencia".',
    parameters: {
      enabled: {
        type: 'boolean',
        description: 'true para activar modo externo, false para usar módulo GYM',
        required: true,
      },
      frequency: {
        type: 'number',
        description: 'Días de entrenamiento por semana (1-7)',
        required: false,
      },
    },
    requiredParams: ['enabled'],
  },
  {
    name: 'TRAINING_SET_EXTERNAL_SCHEDULE',
    description:
      'Guarda el horario de entrenamiento simple para usuarios que no usan el módulo GYM. Usa cuando el usuario diga "lunes pecho, martes espalda", "entreno espalda los martes", "mi rutina es así: [días y músculos]".',
    parameters: {
      scheduleJson: {
        type: 'string',
        description:
          'JSON string con días y grupos musculares. Formato: {"Lunes": "Pecho y Tríceps", "Martes": "Espalda y Bíceps", "Jueves": "Piernas"}. DEBE ser un JSON válido.',
        required: true,
      },
    },
    requiredParams: ['scheduleJson'],
  },
  {
    name: 'TRAINING_REMOVE_EXTERNAL_DAY',
    description:
      'Elimina un día del plan de entrenamiento personalizado. Usa cuando el usuario diga "elimina el lunes", "quita el día de piernas", "ya no entreno los martes".',
    parameters: {
      dayName: {
        type: 'string',
        description: 'Nombre del día a eliminar (Lunes, Martes, Miércoles, etc.)',
        required: true,
      },
    },
    requiredParams: ['dayName'],
  },
  // ============================================================================
  // AI-POWERED INGREDIENT ANALYSIS TOOLS
  // ============================================================================
  {
    name: 'ANALYZE_INGREDIENTS_AI',
    description:
      'Análisis nutricional avanzado de ingredientes usando IA. Proporciona desglose detallado de macros, calidad nutricional, nivel de procesamiento y más. Usa cuando el usuario diga "analiza estos ingredientes", "qué tan saludable es esta comida", "dame información nutricional detallada de...".',
    parameters: {
      ingredients: {
        type: 'string',
        description:
          'Lista de ingredientes separados por comas. Ejemplo: "100g pollo, 200g arroz, 50g aguacate"',
        required: true,
      },
      userContext: {
        type: 'string',
        description:
          'Contexto adicional del usuario (objetivo, restricciones). Ejemplo: "definición", "ganar masa", "diabético"',
        required: false,
      },
      includeQuality: {
        type: 'boolean',
        description: 'Incluir análisis de calidad nutricional (A-F score)',
        required: false,
      },
      includeAllergens: {
        type: 'boolean',
        description: 'Incluir detección de alérgenos',
        required: false,
      },
      includeSuggestions: {
        type: 'boolean',
        description: 'Incluir sugerencias de mejora',
        required: false,
      },
    },
    requiredParams: ['ingredients'],
  },
  {
    name: 'GET_SUBSTITUTION_SUGGESTIONS',
    description:
      'Obtiene sugerencias de sustitución para ingredientes según un objetivo específico. Usa cuando el usuario diga "por qué puedo cambiar...", "alternativas más saludables", "sustitutos con más proteína", "opciones más baratas".',
    parameters: {
      ingredients: {
        type: 'string',
        description: 'Lista de ingredientes a sustituir, separados por comas',
        required: true,
      },
      goal: {
        type: 'string',
        description:
          'Objetivo de la sustitución: healthier (más saludable), high_protein (más proteína), low_carb (menos carbos), low_fat (menos grasa), budget (más económico), allergen_free (sin alérgenos)',
        required: true,
      },
    },
    requiredParams: ['ingredients', 'goal'],
  },
  {
    name: 'CHECK_ALLERGENS',
    description:
      'Verifica alérgenos en una lista de ingredientes. Detecta gluten, lácteos, frutos secos, mariscos, etc. Usa cuando el usuario diga "tiene gluten?", "es seguro para celíacos?", "contiene lácteos?", "verificar alérgenos".',
    parameters: {
      ingredients: {
        type: 'string',
        description: 'Lista de ingredientes a verificar, separados por comas',
        required: true,
      },
      userAllergens: {
        type: 'string',
        description:
          'Alérgenos específicos del usuario a buscar, separados por comas. Ejemplo: "gluten, maní, lácteos"',
        required: false,
      },
    },
    requiredParams: ['ingredients'],
  },
  {
    name: 'OPTIMIZE_MEAL_MACROS',
    description:
      'Optimiza una comida para alcanzar macros específicos. Ajusta cantidades y sugiere cambios para cumplir objetivos. Usa cuando el usuario diga "ajusta esta comida para...", "necesito X proteína", "optimiza los macros de...", "hazla más alta en proteína".',
    parameters: {
      mealDescription: {
        type: 'string',
        description:
          'Descripción de la comida a optimizar. Ejemplo: "200g arroz con 150g pollo y verduras"',
        required: true,
      },
      targetCalories: {
        type: 'number',
        description: 'Calorías objetivo para la comida',
        required: false,
      },
      targetProtein: {
        type: 'number',
        description: 'Gramos de proteína objetivo',
        required: false,
      },
      targetCarbs: {
        type: 'number',
        description: 'Gramos de carbohidratos objetivo',
        required: false,
      },
      targetFat: {
        type: 'number',
        description: 'Gramos de grasa objetivo',
        required: false,
      },
      constraints: {
        type: 'string',
        description:
          'Restricciones adicionales separadas por comas. Ejemplo: "sin lácteos, económico, rápido"',
        required: false,
      },
    },
    requiredParams: ['mealDescription'],
  },
  // ============================================================================
  // AI-POWERED VISUAL ANALYSIS TOOLS
  // ============================================================================
  {
    name: 'ANALYZE_PROGRESS_PHOTO',
    description:
      'Analiza una foto de progreso corporal usando IA vision. Estima composición corporal, evalúa grupos musculares, detecta postura e identifica desbalances. Usa cuando el usuario diga "analiza mi foto", "cómo voy de progreso", "evalúa mi físico", "qué tal me veo".',
    parameters: {
      photoUrl: {
        type: 'string',
        description: 'URL directa de la foto a analizar',
        required: false,
      },
      photoId: {
        type: 'string',
        description: 'ID de una foto de progreso guardada en el sistema',
        required: false,
      },
    },
    requiredParams: [],
  },
  {
    name: 'COMPARE_PROGRESS_PHOTOS',
    description:
      'Compara dos fotos de progreso para analizar cambios y transformación. Calcula puntuación de transformación, cambios de composición corporal y mejoras musculares. Usa cuando el usuario diga "compara mis fotos", "cuánto he cambiado", "mi transformación", "antes y después".',
    parameters: {
      beforePhotoUrl: {
        type: 'string',
        description: 'URL de la foto "antes"',
        required: false,
      },
      afterPhotoUrl: {
        type: 'string',
        description: 'URL de la foto "después"',
        required: false,
      },
      beforePhotoId: {
        type: 'string',
        description: 'ID de la foto "antes" guardada en el sistema',
        required: false,
      },
      afterPhotoId: {
        type: 'string',
        description: 'ID de la foto "después" guardada en el sistema',
        required: false,
      },
    },
    requiredParams: [],
  },
  {
    name: 'ANALYZE_FOOD_PHOTO',
    description:
      'Analiza una foto de comida para identificar alimentos y estimar macros. Detecta ingredientes, porciones y calcula nutrición aproximada. Usa cuando el usuario envíe foto de comida diciendo "qué tiene esto", "cuántas calorías", "analiza mi comida", "estima los macros de esta foto".',
    parameters: {
      photoUrl: {
        type: 'string',
        description: 'URL directa de la foto de comida a analizar',
        required: true,
      },
    },
    requiredParams: ['photoUrl'],
  },
  {
    name: 'GENERATE_PROGRESS_TIMELINE',
    description:
      'Genera un timeline visual del progreso del usuario basado en todas sus fotos de progreso. Muestra evolución, hitos alcanzados y próximas metas. Usa cuando el usuario diga "mi timeline", "cómo ha sido mi progreso", "resumen de mi transformación", "historial de fotos".',
    parameters: {
      limit: {
        type: 'number',
        description: 'Número máximo de fotos a incluir en el timeline (default: 10)',
        required: false,
      },
    },
    requiredParams: [],
  },
  // ============================================================================
  // NOTA: CUSTOM_PLAN_* tools fueron removidas.
  // El plan personalizado ahora usa las mismas tablas que el módulo GYM.
  // Usuarios usan TRAINING_DESIGN_PLAN, TRAINING_ADD_DAY, GYM_ADD_EXERCISE, etc.
  // ============================================================================
];
