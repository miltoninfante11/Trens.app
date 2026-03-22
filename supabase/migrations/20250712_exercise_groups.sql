-- ============================================================================
-- MIGRACIÓN: Agregar columna exercise_groups a user_profiles
-- Almacena grupos de ejercicios (super series, circuitos, etc.) por día
-- Estructura JSONB: { "0": [ExerciseGroup], "1": [ExerciseGroup], ... }
-- ============================================================================

ALTER TABLE public.user_profiles
ADD COLUMN IF NOT EXISTS exercise_groups JSONB DEFAULT '{}'::jsonb;

-- Comentario descriptivo
COMMENT ON COLUMN public.user_profiles.exercise_groups IS 
  'Grupos de ejercicios por día de entrenamiento. Estructura: { dayIndex: [{ id, type, exercise_ids, rest_between, rest_after, rounds }] }';
