-- ============================================================================
-- MIGRACIÓN: Soporte para 2 Sesiones de Entrenamiento por Día
-- Permite que cada día de entrenamiento tenga sesión A y sesión B
-- Totalmente backward-compatible: session_index DEFAULT 0
-- ============================================================================

-- 1. Agregar session_index a user_exercise_config
-- 0 = sesión A (default), 1 = sesión B
ALTER TABLE user_exercise_config 
  ADD COLUMN IF NOT EXISTS session_index INTEGER DEFAULT 0;

-- 1b. Actualizar UNIQUE constraint para permitir mismo ejercicio en distintas sesiones
-- Antes: UNIQUE(user_id, exercise_id) — bloqueaba tener Press Banca en sesión A y B
-- Ahora: UNIQUE(user_id, exercise_id, session_index)
ALTER TABLE user_exercise_config 
  DROP CONSTRAINT IF EXISTS user_exercise_config_user_id_exercise_id_key;

ALTER TABLE user_exercise_config 
  ADD CONSTRAINT user_exercise_config_user_exercise_session_key 
  UNIQUE (user_id, exercise_id, session_index);

-- 2. Agregar nombres de sesiones por día en profiles
-- Estructura: { "0": {"0": "FUERZA", "1": "CARDIO"}, "1": {"0": "PUSH", "1": "HIIT"} }
ALTER TABLE profiles 
  ADD COLUMN IF NOT EXISTS training_session_names JSONB DEFAULT '{}';

-- 3. Agregar session_index a workout_block_position (PLAN timeline)
-- Cada sesión tiene su propia posición en el timeline
ALTER TABLE workout_block_position 
  ADD COLUMN IF NOT EXISTS session_index INTEGER DEFAULT 0;

-- Permitir múltiples bloques por usuario (uno por sesión)
-- Primero eliminar el constraint único existente (UNIQUE user_id)
ALTER TABLE workout_block_position
  DROP CONSTRAINT IF EXISTS workout_block_position_user_id_key;

DO $$
BEGIN
  -- Crear índice único para user_id + session_index
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE indexname = 'idx_workout_block_user_session'
  ) THEN
    CREATE UNIQUE INDEX idx_workout_block_user_session 
      ON workout_block_position(user_id, session_index);
  END IF;
END $$;

-- 4. Agregar workout_session_index al supplement_stack
-- Para vincular PRE/POST a una sesión específica
ALTER TABLE supplement_stack 
  ADD COLUMN IF NOT EXISTS workout_session_index INTEGER DEFAULT 0;

-- 5. Agregar dual_session_enabled a user_profiles
ALTER TABLE user_profiles 
  ADD COLUMN IF NOT EXISTS dual_session_enabled BOOLEAN DEFAULT false;

-- 6. Agregar campos para la segunda sesión de entrenamiento en user_profiles
-- estimated_workout_time_b y is_fasted_training_b para sesión B
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS estimated_workout_time_b TIME,
  ADD COLUMN IF NOT EXISTS is_fasted_training_b BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS workout_time_description_b TEXT;

-- ============================================================================
-- COMENTARIOS
-- ============================================================================
COMMENT ON COLUMN user_exercise_config.session_index IS '0 = sesión A (default), 1 = sesión B del día';
COMMENT ON COLUMN profiles.training_session_names IS 'Nombres de sesiones por día: {"dayIndex": {"sessionIndex": "nombre"}}';
COMMENT ON COLUMN workout_block_position.session_index IS '0 = bloque sesión A, 1 = bloque sesión B en timeline PLAN';
COMMENT ON COLUMN supplement_stack.workout_session_index IS 'PRE/POST linked to session 0 or 1';
COMMENT ON COLUMN user_profiles.dual_session_enabled IS 'true = usuario tiene 2 sesiones por día habilitadas';
