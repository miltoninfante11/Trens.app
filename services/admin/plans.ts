// ============================================================================
// ADMIN PLANS SERVICE
// Gestión de asignación de planes de entrenamiento desde el panel admin
// ============================================================================

import { supabase } from '../../lib/supabase';

// ============================================================================
// TIPOS
// ============================================================================

export interface TemplateSeries {
  id: string;
  type: 'CALENTAMIENTO' | 'APROXIMACION' | 'EFECTIVA' | 'FALLO';
  reps: number;
  note: string;
}

export interface TemplateDayExercise {
  exercise_id: string;
  name: string;
  thumbnail_url?: string;
  rest: string;
  series: TemplateSeries[];
}

export interface TemplateDay {
  dayIndex: number;
  name: string;
  focus?: string;
  exercises: TemplateDayExercise[];
}

export interface TrainingTemplate {
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
}

export interface AssignPlanResult {
  success: boolean;
  planName: string;
  frequency: number;
  exercisesCreated: number;
  errors: string[];
}

// ============================================================================
// FUNCIONES
// ============================================================================

/**
 * Listar todos los templates activos, agrupados por frecuencia
 * (lectura pública sin RLS issues)
 */
export async function listActiveTemplates(): Promise<TrainingTemplate[]> {
  const { data, error } = await supabase
    .from('training_plan_templates')
    .select('*')
    .eq('is_active', true)
    .order('frequency', { ascending: true })
    .order('sort_order', { ascending: true });

  if (error) throw new Error(error.message);
  return (data || []) as TrainingTemplate[];
}

/**
 * Asignar un plan de entrenamiento a un usuario
 * Usa función PostgreSQL SECURITY DEFINER para bypasear RLS
 */
export async function assignPlanToUser(
  userId: string,
  templateId: string
): Promise<AssignPlanResult> {
  // Obtener el ID del admin actual
  const {
    data: { user: currentUser },
  } = await supabase.auth.getUser();
  if (!currentUser) throw new Error('No autenticado');

  const { data, error } = await supabase.rpc('admin_assign_plan', {
    p_admin_user_id: currentUser.id,
    p_target_user_id: userId,
    p_template_id: templateId,
  });

  if (error) throw new Error(error.message);
  if (!data?.success) throw new Error(data?.error || 'Error desconocido');

  return {
    success: true,
    planName: data.planName,
    frequency: data.frequency,
    exercisesCreated: data.exercisesCreated,
    errors: data.errors || [],
  };
}

/**
 * Obtener el plan actual asignado a un usuario
 * Usa función PostgreSQL SECURITY DEFINER para bypasear RLS
 */
export async function getUserCurrentPlan(userId: string): Promise<{
  frequency: number;
  routineNames: Record<string, string>;
  planSource?: string;
} | null> {
  const {
    data: { user: currentUser },
  } = await supabase.auth.getUser();
  if (!currentUser) throw new Error('No autenticado');

  const { data, error } = await supabase.rpc('admin_get_user_plan', {
    p_admin_user_id: currentUser.id,
    p_target_user_id: userId,
  });

  if (error) throw new Error(error.message);
  if (!data?.success) throw new Error(data?.error || 'Error desconocido');

  return data.plan || null;
}

export type ClonePlanType = 'training' | 'nutrition';

export interface ClonePlanResult {
  success: boolean;
  planType: ClonePlanType;
  copied: {
    trainingExercises?: number;
    frequency?: number;
    mealStacks?: number;
    meals?: number;
    mealOptions?: number;
    supplements?: number;
  };
}

/**
 * Clonar plan (entrenamiento o nutrición) desde otro usuario
 * Usa función PostgreSQL SECURITY DEFINER para bypasear RLS
 */
export async function clonePlanFromUser(
  targetUserId: string,
  sourceUserId: string,
  planType: ClonePlanType
): Promise<ClonePlanResult> {
  const {
    data: { user: currentUser },
  } = await supabase.auth.getUser();

  if (!currentUser) throw new Error('No autenticado');

  const { data, error } = await supabase.rpc('admin_clone_user_plan', {
    p_admin_user_id: currentUser.id,
    p_source_user_id: sourceUserId,
    p_target_user_id: targetUserId,
    p_plan_type: planType,
  });

  if (error) throw new Error(error.message);
  if (!data?.success) throw new Error(data?.error || 'Error desconocido');

  return {
    success: true,
    planType,
    copied: data.copied || {},
  };
}
