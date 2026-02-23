// =============================================================================
// SERVICE: Progress Photos - Gestión de fotos de progreso
// Usa Cloudflare R2 para storage de imágenes
// =============================================================================

import { supabase } from '../../lib/supabase';
import cloudflareR2 from '../cloudflare/r2';
import type {
  ProgressPhoto,
  ProgressSnapshot,
  CreateProgressPhotoInput,
} from '../../types/progress';

/**
 * Captura un snapshot completo del estado actual del usuario
 */
export async function captureUserSnapshot(userId: string): Promise<ProgressSnapshot> {
  // Validar que el userId sea un UUID válido (no "guest" ni vacío)
  if (!userId || userId === 'guest' || userId.length < 32) {
    return {};
  }

  try {
    // 1. Obtener perfil y medidas
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('user_id', userId)
      .single();

    const { data: measurements } = await supabase
      .from('body_measurements')
      .select('name, value, is_dominant')
      .eq('user_id', userId);

    // 2. Obtener estructura de entrenamiento
    const { data: exerciseConfigs } = await supabase
      .from('user_exercise_config')
      .select('training_days')
      .eq('user_id', userId);

    // Calcular días únicos
    const allDays = new Set<number>();
    (exerciseConfigs || []).forEach((config: { training_days: number[] }) => {
      (config.training_days || []).forEach((day) => allDays.add(day));
    });

    // Obtener nombres de días
    const { data: trainingFrequency } = await supabase
      .from('user_profiles')
      .select('training_frequency')
      .eq('user_id', userId)
      .single();

    // 3. Obtener comidas
    const { data: meals } = await supabase
      .from('meals')
      .select('id, calories, protein, carbs, fat')
      .eq('user_id', userId);

    // Calcular totales de macros
    let totalCalories = 0,
      totalProtein = 0,
      totalCarbs = 0,
      totalFat = 0;
    (meals || []).forEach(
      (meal: { calories?: number; protein?: number; carbs?: number; fat?: number }) => {
        totalCalories += meal.calories || 0;
        totalProtein += meal.protein || 0;
        totalCarbs += meal.carbs || 0;
        totalFat += meal.fat || 0;
      }
    );

    // 4. Obtener suplementos
    const { data: supplements } = await supabase
      .from('supplement_stacks')
      .select('name, time')
      .eq('user_id', userId);

    // Construir snapshot
    const snapshot: ProgressSnapshot = {
      weight: profile?.weight || undefined,
      height: profile?.height || undefined,
      body_fat_percentage: profile?.body_fat_percentage || undefined,
      muscle_mass: profile?.muscle_mass || undefined,
      goal: profile?.goal || undefined,
      age: profile?.age || undefined,
      sex: profile?.sex || undefined,
      activity_level: profile?.activity_level || undefined,
      training_experience: profile?.training_experience || undefined,
      injuries: profile?.injuries || undefined,
      allergies: profile?.allergies || undefined,
      // Calcular IMC si hay peso y altura
      imc: (() => {
        const w = parseFloat(profile?.weight);
        const hCm = parseFloat(profile?.height);
        if (w > 0 && hCm > 0) {
          const hM = hCm > 3 ? hCm / 100 : hCm;
          return parseFloat((w / (hM * hM)).toFixed(1));
        }
        return undefined;
      })(),
      measurements: (measurements || []).map(
        (m: { name: string; value: string; is_dominant: boolean }) => ({
          name: m.name,
          value: m.value,
          is_dominant: m.is_dominant,
        })
      ),
      training: {
        frequency: trainingFrequency?.training_frequency || allDays.size || 0,
        current_plan: profile?.current_training_plan || undefined,
      },
      nutrition: {
        meal_count: meals?.length || 0,
        daily_calories: totalCalories || undefined,
        daily_protein: totalProtein || undefined,
        daily_carbs: totalCarbs || undefined,
        daily_fat: totalFat || undefined,
      },
      supplements: (supplements || []).map((s: { name: string; time: string }) => ({
        name: s.name,
        time: s.time,
      })),
    };

    return snapshot;
  } catch (error) {
    console.error('captureUserSnapshot error:', error);
    return {};
  }
}

/**
 * Sube una foto de progreso con su snapshot usando Cloudflare R2
 */
export async function uploadProgressPhoto(
  userId: string,
  input: CreateProgressPhotoInput
): Promise<{ success: boolean; data?: ProgressPhoto; error?: string }> {
  try {
    // 1. Subir imagen a Cloudflare R2
    const uploadResult = await cloudflareR2.uploadProgressPhoto(input.photo_base64, userId);

    if (!uploadResult.success || !uploadResult.url) {
      console.error('R2 Upload error:', uploadResult.error);
      return { success: false, error: 'Error al subir la imagen a R2' };
    }

    const photoUrl = uploadResult.url;

    // 2. Capturar snapshot actual
    const snapshot = await captureUserSnapshot(userId);

    // 3. Guardar en base de datos
    const { data: photo, error: insertError } = await supabase
      .from('progress_photos')
      .insert({
        user_id: userId,
        photo_url: photoUrl,
        snapshot,
        notes: input.notes || null,
      })
      .select()
      .single();

    if (insertError) {
      console.error('Insert error:', insertError);
      // Intentar eliminar la imagen de R2 si falla el insert
      await cloudflareR2.deleteProgressPhoto(photoUrl);
      return { success: false, error: 'Error al guardar la foto' };
    }

    return { success: true, data: photo as ProgressPhoto };
  } catch (error) {
    console.error('uploadProgressPhoto error:', error);
    return { success: false, error: 'Error inesperado' };
  }
}

/**
 * Obtiene todas las fotos de progreso del usuario
 */
export async function getProgressPhotos(userId: string): Promise<ProgressPhoto[]> {
  try {
    // Validar que el userId sea un UUID válido (no "guest" ni vacío)
    if (!userId || userId === 'guest' || userId.length < 32) {
      return [];
    }

    const { data, error } = await supabase
      .from('progress_photos')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return (data || []) as ProgressPhoto[];
  } catch (error) {
    console.error('getProgressPhotos error:', error);
    return [];
  }
}

/**
 * Obtiene una foto de progreso específica
 */
export async function getProgressPhoto(photoId: string): Promise<ProgressPhoto | null> {
  try {
    const { data, error } = await supabase
      .from('progress_photos')
      .select('*')
      .eq('id', photoId)
      .single();

    if (error) throw error;
    return data as ProgressPhoto;
  } catch (error) {
    console.error('getProgressPhoto error:', error);
    return null;
  }
}

/**
 * Elimina una foto de progreso (de R2 y de la base de datos)
 */
export async function deleteProgressPhoto(
  userId: string,
  photoId: string
): Promise<{ success: boolean; error?: string }> {
  // Validar que el userId sea un UUID válido
  if (!userId || userId === 'guest' || userId.length < 32) {
    return { success: false, error: 'Usuario no autenticado' };
  }

  try {
    // Obtener la foto para saber la URL en R2
    const { data: photo, error: fetchError } = await supabase
      .from('progress_photos')
      .select('photo_url')
      .eq('id', photoId)
      .eq('user_id', userId)
      .single();

    if (fetchError || !photo) {
      return { success: false, error: 'Foto no encontrada' };
    }

    // Eliminar de Cloudflare R2
    const deleteResult = await cloudflareR2.deleteProgressPhoto(photo.photo_url);
    if (!deleteResult.success) {
      console.warn('R2 delete warning:', deleteResult.error);
      // Continuar de todas formas para eliminar de la base de datos
    }

    // Eliminar de la base de datos
    const { error: deleteError } = await supabase
      .from('progress_photos')
      .delete()
      .eq('id', photoId)
      .eq('user_id', userId);

    if (deleteError) throw deleteError;

    return { success: true };
  } catch (error) {
    console.error('deleteProgressPhoto error:', error);
    return { success: false, error: 'Error al eliminar' };
  }
}

/**
 * Actualiza las notas de una foto
 */
export async function updateProgressPhotoNotes(
  userId: string,
  photoId: string,
  notes: string
): Promise<{ success: boolean; error?: string }> {
  // Validar que el userId sea un UUID válido
  if (!userId || userId === 'guest' || userId.length < 32) {
    return { success: false, error: 'Usuario no autenticado' };
  }

  try {
    const { error } = await supabase
      .from('progress_photos')
      .update({ notes })
      .eq('id', photoId)
      .eq('user_id', userId);

    if (error) throw error;
    return { success: true };
  } catch (error) {
    console.error('updateProgressPhotoNotes error:', error);
    return { success: false, error: 'Error al actualizar' };
  }
}
