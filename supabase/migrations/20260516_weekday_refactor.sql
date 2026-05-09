-- ============================================================================
-- WEEKDAY REFACTOR — Migrar entrenamiento de "día rotativo 0..N-1" a
-- "weekday 0..6" (0=Domingo, 6=Sábado, estándar JS getDay()).
--
-- Backfill: para cada usuario con training_frequency=N, sus días antiguos
-- 0..N-1 se mapean a weekdays consecutivos empezando LUNES, módulo 7:
--   old_idx → ((old_idx + 1) % 7)
--   N=3 → Lun(1), Mar(2), Mié(3)
--   N=5 → Lun(1)..Vie(5)
--   N=7 → Lun..Dom (entero)
--
-- Se aplica a:
--  · profiles.training_routine_names      JSONB keys
--  · profiles.training_session_names      JSONB keys (nivel 1)
--  · user_profiles.exercise_groups        JSONB keys
--  · user_exercise_config.training_days   INT[]
--
-- training_frequency y training_current_day quedan como caché (deprecados).
-- ============================================================================

-- =================== HELPERS ================================================
CREATE OR REPLACE FUNCTION public._old_idx_to_weekday(p_idx INT)
RETURNS INT LANGUAGE sql IMMUTABLE AS $$
  SELECT ((p_idx + 1) % 7)::INT;
$$;

-- =================== BACKFILL ROUTINE NAMES ================================
DO $migration$
DECLARE
  r RECORD;
  v_new JSONB;
  v_key TEXT;
  v_value JSONB;
BEGIN
  FOR r IN
    SELECT id, training_routine_names
      FROM public.profiles
     WHERE training_routine_names IS NOT NULL
       AND jsonb_typeof(training_routine_names) = 'object'
  LOOP
    v_new := '{}'::jsonb;
    FOR v_key, v_value IN SELECT * FROM jsonb_each(r.training_routine_names)
    LOOP
      -- Sólo procesa keys numéricas en rango 0..6 (las que ya son weekday se
      -- detectan porque están en rango y ya hay registro en la tabla con esa key).
      -- Para evitar re-aplicar el mapeo si el migration se corre 2 veces,
      -- guardamos un flag plan_source_migrated.
      IF v_key ~ '^[0-9]+$' THEN
        v_new := v_new || jsonb_build_object(
          public._old_idx_to_weekday(v_key::INT)::TEXT,
          v_value
        );
      ELSE
        v_new := v_new || jsonb_build_object(v_key, v_value);
      END IF;
    END LOOP;
    UPDATE public.profiles SET training_routine_names = v_new WHERE id = r.id;
  END LOOP;
END
$migration$;

-- =================== BACKFILL SESSION NAMES ================================
DO $migration$
DECLARE
  r RECORD;
  v_new JSONB;
  v_key TEXT;
  v_value JSONB;
BEGIN
  FOR r IN
    SELECT id, training_session_names
      FROM public.profiles
     WHERE training_session_names IS NOT NULL
       AND jsonb_typeof(training_session_names) = 'object'
  LOOP
    v_new := '{}'::jsonb;
    FOR v_key, v_value IN SELECT * FROM jsonb_each(r.training_session_names)
    LOOP
      IF v_key ~ '^[0-9]+$' THEN
        v_new := v_new || jsonb_build_object(
          public._old_idx_to_weekday(v_key::INT)::TEXT,
          v_value
        );
      ELSE
        v_new := v_new || jsonb_build_object(v_key, v_value);
      END IF;
    END LOOP;
    UPDATE public.profiles SET training_session_names = v_new WHERE id = r.id;
  END LOOP;
END
$migration$;

-- =================== BACKFILL EXERCISE GROUPS ==============================
DO $migration$
DECLARE
  r RECORD;
  v_new JSONB;
  v_key TEXT;
  v_value JSONB;
BEGIN
  FOR r IN
    SELECT user_id, exercise_groups
      FROM public.user_profiles
     WHERE exercise_groups IS NOT NULL
       AND jsonb_typeof(exercise_groups) = 'object'
  LOOP
    v_new := '{}'::jsonb;
    FOR v_key, v_value IN SELECT * FROM jsonb_each(r.exercise_groups)
    LOOP
      IF v_key ~ '^[0-9]+$' THEN
        v_new := v_new || jsonb_build_object(
          public._old_idx_to_weekday(v_key::INT)::TEXT,
          v_value
        );
      ELSE
        v_new := v_new || jsonb_build_object(v_key, v_value);
      END IF;
    END LOOP;
    UPDATE public.user_profiles SET exercise_groups = v_new WHERE user_id = r.user_id;
  END LOOP;
END
$migration$;

-- =================== BACKFILL training_days (INT[]) =========================
UPDATE public.user_exercise_config uec
   SET training_days = ARRAY(
     SELECT DISTINCT public._old_idx_to_weekday(d)
       FROM unnest(COALESCE(training_days, ARRAY[]::INT[])) d
      WHERE d BETWEEN 0 AND 6
   )
 WHERE training_days IS NOT NULL
   AND array_length(training_days, 1) > 0;

-- =================== WORKOUT SESSIONS LOG ===================================
CREATE TABLE IF NOT EXISTS public.workout_sessions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  weekday       INT  NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  session_index INT  NOT NULL DEFAULT 0,
  started_at    TIMESTAMPTZ DEFAULT NOW(),
  completed_at  TIMESTAMPTZ,
  duration_s    INT,
  exercises_completed INT DEFAULT 0,
  notes         TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workout_sessions_user_completed
  ON public.workout_sessions(user_id, completed_at DESC)
  WHERE completed_at IS NOT NULL;

ALTER TABLE public.workout_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ws_select_own" ON public.workout_sessions;
CREATE POLICY "ws_select_own" ON public.workout_sessions
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "ws_insert_own" ON public.workout_sessions;
CREATE POLICY "ws_insert_own" ON public.workout_sessions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "ws_update_own" ON public.workout_sessions;
CREATE POLICY "ws_update_own" ON public.workout_sessions
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "ws_delete_own" ON public.workout_sessions;
CREATE POLICY "ws_delete_own" ON public.workout_sessions
  FOR DELETE USING (auth.uid() = user_id);

-- =================== RPC: complete_workout_session ==========================
CREATE OR REPLACE FUNCTION public.complete_workout_session(
  p_weekday INT,
  p_session_index INT DEFAULT 0,
  p_duration_s INT DEFAULT NULL,
  p_exercises_completed INT DEFAULT 0,
  p_notes TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  v_uid UUID := auth.uid();
  v_id  UUID;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED' USING ERRCODE = '28000';
  END IF;
  IF p_weekday IS NULL OR p_weekday NOT BETWEEN 0 AND 6 THEN
    RAISE EXCEPTION 'INVALID_WEEKDAY' USING ERRCODE = '22023';
  END IF;
  INSERT INTO workout_sessions (
    user_id, weekday, session_index, completed_at,
    duration_s, exercises_completed, notes
  ) VALUES (
    v_uid, p_weekday, COALESCE(p_session_index, 0), NOW(),
    p_duration_s, COALESCE(p_exercises_completed, 0), p_notes
  ) RETURNING id INTO v_id;
  RETURN jsonb_build_object('success', true, 'id', v_id);
END;
$fn$;
REVOKE ALL ON FUNCTION public.complete_workout_session(INT, INT, INT, INT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_workout_session(INT, INT, INT, INT, TEXT) TO authenticated;

-- =================== RPC: get_today_workout =================================
-- Devuelve weekday de hoy + nombre de rutina, lo que toca entrenar.
CREATE OR REPLACE FUNCTION public.get_today_workout()
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  v_uid UUID := auth.uid();
  v_weekday INT := EXTRACT(DOW FROM (NOW() AT TIME ZONE 'UTC'))::INT;
  v_names JSONB;
  v_routine TEXT;
  v_has_exercises BOOLEAN;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED' USING ERRCODE = '28000';
  END IF;
  SELECT training_routine_names INTO v_names FROM profiles WHERE id = v_uid;
  v_routine := v_names ->> v_weekday::TEXT;
  SELECT EXISTS(
    SELECT 1 FROM user_exercise_config
     WHERE user_id = v_uid
       AND v_weekday = ANY(COALESCE(training_days, ARRAY[]::INT[]))
  ) INTO v_has_exercises;
  RETURN jsonb_build_object(
    'weekday', v_weekday,
    'routine_name', v_routine,
    'has_exercises', v_has_exercises,
    'is_rest_day', NOT v_has_exercises
  );
END;
$fn$;
REVOKE ALL ON FUNCTION public.get_today_workout() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_today_workout() TO authenticated;
