-- ============================================================================
-- MIGRACIÓN: Horarios de Entrenamiento por Día de la Semana
-- Permite configurar una hora específica de entrenamiento para cada día
-- sin afectar los otros días. Backward-compatible: columna JSONB nullable.
--
-- Formato de workout_scheduled_times:
--   { "1_0": "07:00", "3_0": "06:30", "1_1": "17:00" }
--   Clave = "{weekday}_{sessionIndex}"  (weekday: 0=Dom..6=Sáb, JS estándar)
--   Valor = "HH:MM" (hora en formato 24h)
--
-- Ejemplos:
--   "1_0" → Lunes, Sesión A → 07:00
--   "1_1" → Lunes, Sesión B → 17:30
--   "3_0" → Miércoles, Sesión A → 06:00
-- ============================================================================

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS workout_scheduled_times JSONB DEFAULT '{}';

COMMENT ON COLUMN profiles.workout_scheduled_times IS
  'Horarios configurados por día/sesión. Clave: "{weekday}_{sessionIndex}" (weekday 0=Dom..6=Sáb). Valor: "HH:MM"';
