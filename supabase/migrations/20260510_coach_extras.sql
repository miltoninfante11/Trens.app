-- ============================================================================
-- Coach Extras: Templates aplicables + Mensaje al atleta
-- Extiende el editor del coach para reutilizar plantillas admin y dejar notas.
-- Depende de: 20260509_coach_access.sql, 20260509_coach_plan_rpcs.sql
-- ============================================================================

-- 1) Columnas para mensaje del coach al atleta (idempotentes)
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS coach_notes TEXT,
  ADD COLUMN IF NOT EXISTS coach_notes_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS coach_notes_author TEXT;

-- ============================================================================
-- coach_list_templates — lista plantillas activas para el coach
-- ============================================================================
CREATE OR REPLACE FUNCTION public.coach_list_templates(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  v_session coach_sessions%ROWTYPE;
  v_rows    JSONB;
BEGIN
  v_session := _coach_validate_session(p_token, 'plan:edit');

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id',            t.id,
      'name',          t.name,
      'description',   t.description,
      'frequency',     t.frequency,
      'target_levels', t.target_levels,
      'target_goals',  t.target_goals,
      'equipment',     t.equipment,
      'day_count',     jsonb_array_length(COALESCE(t.days, '[]'::jsonb))
    )
    ORDER BY t.created_at DESC
  ), '[]'::jsonb)
  INTO v_rows
  FROM training_plan_templates t
  WHERE t.is_active = true;

  RETURN jsonb_build_object('success', true, 'templates', v_rows);
END;
$fn$;

REVOKE ALL ON FUNCTION public.coach_list_templates(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.coach_list_templates(TEXT) TO anon, authenticated;

-- ============================================================================
-- coach_apply_template — aplica plantilla admin al plan del atleta
-- ============================================================================
CREATE OR REPLACE FUNCTION public.coach_apply_template(
  p_token       TEXT,
  p_template_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  v_session   coach_sessions%ROWTYPE;
  v_template  RECORD;
  v_day       JSONB;
  v_exercise  JSONB;
  v_routine_names JSONB := '{}';
  v_exercises_created INT := 0;
  v_config    JSONB;
  v_custom_series JSONB;
  v_series_item JSONB;
  v_idx       INT;
  v_rest_seconds INT;
BEGIN
  v_session := _coach_validate_session(p_token, 'plan:edit');

  SELECT * INTO v_template FROM training_plan_templates
  WHERE id = p_template_id AND is_active = true;
  IF v_template IS NULL THEN
    RAISE EXCEPTION 'TEMPLATE_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  -- Construir routine_names a partir de los días
  FOR v_day IN SELECT * FROM jsonb_array_elements(COALESCE(v_template.days, '[]'::jsonb))
  LOOP
    v_routine_names := v_routine_names || jsonb_build_object(
      (v_day->>'dayIndex')::text, v_day->>'name'
    );
  END LOOP;

  UPDATE profiles SET
    training_frequency = v_template.frequency,
    training_current_day = 0,
    training_routine_names = v_routine_names,
    plan_source = 'coach',
    updated_at = NOW()
  WHERE id = v_session.athlete_id;

  INSERT INTO user_profiles (user_id, training_days_per_week, training_experience, goal, updated_at)
  VALUES (
    v_session.athlete_id,
    v_template.frequency,
    COALESCE(v_template.target_levels[1], 'INTERMEDIO'),
    COALESCE(v_template.target_goals[1], 'HIPERTROFIA'),
    NOW()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    training_days_per_week = EXCLUDED.training_days_per_week,
    training_experience    = EXCLUDED.training_experience,
    goal                   = EXCLUDED.goal,
    updated_at             = NOW();

  -- Reset de ejercicios actuales del atleta
  DELETE FROM user_exercise_config WHERE user_id = v_session.athlete_id;

  FOR v_day IN SELECT * FROM jsonb_array_elements(COALESCE(v_template.days, '[]'::jsonb))
  LOOP
    FOR v_exercise IN SELECT * FROM jsonb_array_elements(COALESCE(v_day->'exercises', '[]'::jsonb))
    LOOP
      IF v_exercise->>'exercise_id' IS NOT NULL AND v_exercise->>'exercise_id' != '' THEN
        v_rest_seconds := COALESCE(
          NULLIF(regexp_replace(COALESCE(v_exercise->>'rest', '90'), '[^0-9]', '', 'g'), '')::int,
          90
        );

        v_custom_series := '[]'::jsonb;
        v_idx := 0;
        FOR v_series_item IN SELECT * FROM jsonb_array_elements(COALESCE(v_exercise->'series', '[]'::jsonb))
        LOOP
          v_custom_series := v_custom_series || jsonb_build_array(jsonb_build_object(
            'id',          COALESCE(v_series_item->>'id', (v_idx + 1)::text),
            'type',        COALESCE(v_series_item->>'type', 'EFECTIVA'),
            'reps',        COALESCE((v_series_item->>'reps')::int, 10),
            'weight',      COALESCE((v_series_item->>'weight')::numeric, 0),
            'rir',         CASE
                             WHEN v_series_item ? 'rpe' AND (v_series_item->>'rpe') ~ '^[0-9]+(\.[0-9]+)?$'
                               THEN GREATEST(0, 10 - (v_series_item->>'rpe')::numeric)
                             WHEN v_series_item->>'type' = 'FALLO' THEN 0
                             ELSE 2
                           END,
            'tempo',       COALESCE(NULLIF(v_series_item->>'tempo', ''), '2-0-2-0'),
            'restSeconds', v_rest_seconds,
            'note',        COALESCE(v_series_item->>'note', '')
          ));
          v_idx := v_idx + 1;
        END LOOP;

        v_config := jsonb_build_object(
          'rest',          COALESCE(v_exercise->>'rest', '90s'),
          'sets',          COALESCE(jsonb_array_length(v_exercise->'series'), 4)::text || 'x10',
          'custom_series', v_custom_series,
          'series_by_day', '{}'::jsonb,
          'notes',         COALESCE(v_exercise->>'notes', '')
        );

        BEGIN
          INSERT INTO user_exercise_config (user_id, exercise_id, training_days, config)
          VALUES (
            v_session.athlete_id,
            (v_exercise->>'exercise_id')::uuid,
            ARRAY[(v_day->>'dayIndex')::int],
            v_config
          );
          v_exercises_created := v_exercises_created + 1;
        EXCEPTION WHEN OTHERS THEN
          NULL;
        END;
      END IF;
    END LOOP;
  END LOOP;

  INSERT INTO coach_audit_log (session_token, athlete_id, coach_name, action, payload)
  VALUES (
    p_token,
    v_session.athlete_id,
    v_session.coach_name,
    'apply_template',
    jsonb_build_object(
      'template_id',       p_template_id,
      'template_name',     v_template.name,
      'frequency',         v_template.frequency,
      'exercises_created', v_exercises_created
    )
  );

  RETURN jsonb_build_object(
    'success',          true,
    'planName',         v_template.name,
    'frequency',        v_template.frequency,
    'exercisesCreated', v_exercises_created
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.coach_apply_template(TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.coach_apply_template(TEXT, UUID) TO anon, authenticated;

-- ============================================================================
-- coach_set_coach_notes — mensaje persistente del coach al atleta
-- ============================================================================
CREATE OR REPLACE FUNCTION public.coach_set_coach_notes(
  p_token TEXT,
  p_notes TEXT
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  v_session coach_sessions%ROWTYPE;
  v_clean   TEXT;
BEGIN
  v_session := _coach_validate_session(p_token, 'plan:edit');

  v_clean := NULLIF(TRIM(COALESCE(p_notes, '')), '');
  IF v_clean IS NOT NULL AND LENGTH(v_clean) > 2000 THEN
    RAISE EXCEPTION 'NOTES_TOO_LONG' USING ERRCODE = '22001';
  END IF;

  INSERT INTO user_profiles (user_id, coach_notes, coach_notes_updated_at, coach_notes_author, updated_at)
  VALUES (v_session.athlete_id, v_clean, NOW(), v_session.coach_name, NOW())
  ON CONFLICT (user_id) DO UPDATE SET
    coach_notes            = EXCLUDED.coach_notes,
    coach_notes_updated_at = NOW(),
    coach_notes_author     = v_session.coach_name,
    updated_at             = NOW();

  INSERT INTO coach_audit_log (session_token, athlete_id, coach_name, action, payload)
  VALUES (
    p_token,
    v_session.athlete_id,
    v_session.coach_name,
    'set_coach_notes',
    jsonb_build_object('length', COALESCE(LENGTH(v_clean), 0))
  );

  RETURN jsonb_build_object('success', true);
END;
$fn$;

REVOKE ALL ON FUNCTION public.coach_set_coach_notes(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.coach_set_coach_notes(TEXT, TEXT) TO anon, authenticated;

-- ============================================================================
-- coach_plan_snapshot — REDEFINIDO para incluir notas del coach
-- (mantiene shape original + nuevos campos coach_notes / coach_notes_*)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.coach_plan_snapshot(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  v_session coach_sessions%ROWTYPE;
  v_result  JSONB;
BEGIN
  v_session := _coach_validate_session(p_token, 'plan:edit');

  SELECT jsonb_build_object(
    'athlete_id',             v_session.athlete_id,
    'athlete_name',           COALESCE(up.display_name, p.full_name, 'Atleta'),
    'avatar_url',             p.avatar_url,
    'training_frequency',     p.training_frequency,
    'training_routine_names', COALESCE(p.training_routine_names, '{}'::jsonb),
    'training_session_names', COALESCE(p.training_session_names, '[]'::jsonb),
    'external_schedule',      COALESCE(up.external_schedule, '{}'::jsonb),
    'training_mode',          up.training_mode,
    'dual_session_enabled',   up.dual_session_enabled,
    'training_program',       up.training_program,
    'coach_notes',            up.coach_notes,
    'coach_notes_updated_at', up.coach_notes_updated_at,
    'coach_notes_author',     up.coach_notes_author
  ) INTO v_result
  FROM profiles p
  LEFT JOIN user_profiles up ON up.user_id = p.id
  WHERE p.id = v_session.athlete_id
  LIMIT 1;

  IF v_result IS NULL THEN
    v_result := jsonb_build_object(
      'athlete_id',             v_session.athlete_id,
      'athlete_name',           'Atleta',
      'training_frequency',     NULL,
      'training_routine_names', '{}'::jsonb,
      'external_schedule',      '{}'::jsonb,
      'coach_notes',            NULL
    );
  END IF;

  RETURN v_result;
END;
$fn$;

REVOKE ALL ON FUNCTION public.coach_plan_snapshot(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.coach_plan_snapshot(TEXT) TO anon, authenticated;
-- ============================================================================
-- Coach Extras: Templates aplicables + Mensaje al atleta
-- Extiende el editor del coach para reutilizar plantillas admin y dejar notas.
-- ============================================================================

-- 1) Columna para mensaje del coach al atleta (idempotente)
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS coach_notes TEXT,
  ADD COLUMN IF NOT EXISTS coach_notes_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS coach_notes_author TEXT;

-- 2) Listar plantillas disponibles para el coach
CREATE OR REPLACE FUNCTION public.coach_list_templates(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_athlete UUID;
  v_rows JSONB;
BEGIN
  v_athlete := public._coach_validate_session(p_token, 'plan');
  IF v_athlete IS NULL THEN
    RAISE EXCEPTION 'INVALID_SESSION';
  END IF;

  SELECT COALESCE(jsonb_agg(t ORDER BY t.created_at DESC), '[]'::jsonb)
  INTO v_rows
  FROM (
    SELECT
      id,
      name,
      description,
      frequency,
      target_levels,
      target_goals,
      equipment,
      jsonb_array_length(COALESCE(days, '[]'::jsonb)) AS day_count,
      created_at
    FROM training_plan_templates
    WHERE is_active = true
  ) t;

  RETURN jsonb_build_object('success', true, 'templates', v_rows);
END;
$fn$;

REVOKE ALL ON FUNCTION public.coach_list_templates(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.coach_list_templates(TEXT) TO anon, authenticated;

-- 3) Aplicar plantilla al atleta (replica admin_assign_plan limitado al session)
CREATE OR REPLACE FUNCTION public.coach_apply_template(p_token TEXT, p_template_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_athlete UUID;
  v_template RECORD;
  v_day JSONB;
  v_exercise JSONB;
  v_routine_names JSONB := '{}';
  v_exercises_created INT := 0;
  v_config JSONB;
  v_custom_series JSONB;
  v_series_item JSONB;
  v_idx INT;
  v_rest_seconds INT;
  v_coach_name TEXT;
BEGIN
  v_athlete := public._coach_validate_session(p_token, 'plan');
  IF v_athlete IS NULL THEN
    RAISE EXCEPTION 'INVALID_SESSION';
  END IF;

  SELECT coach_name INTO v_coach_name
  FROM coach_sessions WHERE token = p_token;

  SELECT * INTO v_template FROM training_plan_templates
  WHERE id = p_template_id AND is_active = true;
  IF v_template IS NULL THEN
    RAISE EXCEPTION 'TEMPLATE_NOT_FOUND';
  END IF;

  -- Construir routine_names
  FOR v_day IN SELECT * FROM jsonb_array_elements(COALESCE(v_template.days, '[]'::jsonb))
  LOOP
    v_routine_names := v_routine_names || jsonb_build_object(
      (v_day->>'dayIndex')::text, v_day->>'name'
    );
  END LOOP;

  UPDATE profiles SET
    training_frequency = v_template.frequency,
    training_current_day = 0,
    training_routine_names = v_routine_names,
    plan_source = 'coach',
    updated_at = NOW()
  WHERE id = v_athlete;

  INSERT INTO user_profiles (user_id, training_days_per_week, training_experience, goal, updated_at)
  VALUES (
    v_athlete,
    v_template.frequency,
    COALESCE(v_template.target_levels[1], 'INTERMEDIO'),
    COALESCE(v_template.target_goals[1], 'HIPERTROFIA'),
    NOW()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    training_days_per_week = EXCLUDED.training_days_per_week,
    training_experience = EXCLUDED.training_experience,
    goal = EXCLUDED.goal,
    updated_at = NOW();

  DELETE FROM user_exercise_config WHERE user_id = v_athlete;

  FOR v_day IN SELECT * FROM jsonb_array_elements(COALESCE(v_template.days, '[]'::jsonb))
  LOOP
    FOR v_exercise IN SELECT * FROM jsonb_array_elements(COALESCE(v_day->'exercises', '[]'::jsonb))
    LOOP
      IF v_exercise->>'exercise_id' IS NOT NULL AND v_exercise->>'exercise_id' != '' THEN
        v_rest_seconds := COALESCE(
          NULLIF(regexp_replace(COALESCE(v_exercise->>'rest', '90'), '[^0-9]', '', 'g'), '')::int,
          90
        );

        v_custom_series := '[]'::jsonb;
        v_idx := 0;
        FOR v_series_item IN SELECT * FROM jsonb_array_elements(COALESCE(v_exercise->'series', '[]'::jsonb))
        LOOP
          v_custom_series := v_custom_series || jsonb_build_array(jsonb_build_object(
            'id', COALESCE(v_series_item->>'id', (v_idx + 1)::text),
            'type', COALESCE(v_series_item->>'type', 'EFECTIVA'),
            'reps', COALESCE((v_series_item->>'reps')::int, 10),
            'weight', COALESCE((v_series_item->>'weight')::numeric, 0),
            'rir', CASE
                     WHEN v_series_item ? 'rpe' AND (v_series_item->>'rpe') ~ '^[0-9]+(\.[0-9]+)?$'
                       THEN GREATEST(0, 10 - (v_series_item->>'rpe')::numeric)
                     WHEN v_series_item->>'type' = 'FALLO' THEN 0
                     ELSE 2
                   END,
            'tempo', COALESCE(NULLIF(v_series_item->>'tempo', ''), '2-0-2-0'),
            'restSeconds', v_rest_seconds,
            'note', COALESCE(v_series_item->>'note', '')
          ));
          v_idx := v_idx + 1;
        END LOOP;

        v_config := jsonb_build_object(
          'rest', COALESCE(v_exercise->>'rest', '90s'),
          'sets', COALESCE(jsonb_array_length(v_exercise->'series'), 4)::text || 'x10',
          'custom_series', v_custom_series,
          'series_by_day', '{}'::jsonb,
          'notes', COALESCE(v_exercise->>'notes', '')
        );

        BEGIN
          INSERT INTO user_exercise_config (user_id, exercise_id, training_days, config)
          VALUES (
            v_athlete,
            (v_exercise->>'exercise_id')::uuid,
            ARRAY[(v_day->>'dayIndex')::int],
            v_config
          );
          v_exercises_created := v_exercises_created + 1;
        EXCEPTION WHEN OTHERS THEN
          NULL;
        END;
      END IF;
    END LOOP;
  END LOOP;

  -- Auditoría
  INSERT INTO coach_audit_log (token, athlete_id, coach_name, action, payload)
  VALUES (
    p_token,
    v_athlete,
    v_coach_name,
    'apply_template',
    jsonb_build_object(
      'template_id', p_template_id,
      'template_name', v_template.name,
      'exercises_created', v_exercises_created
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'planName', v_template.name,
    'frequency', v_template.frequency,
    'exercisesCreated', v_exercises_created
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.coach_apply_template(TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.coach_apply_template(TEXT, UUID) TO anon, authenticated;

-- 4) Mensaje del coach al atleta
CREATE OR REPLACE FUNCTION public.coach_set_coach_notes(p_token TEXT, p_notes TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_athlete UUID;
  v_coach_name TEXT;
  v_clean TEXT;
BEGIN
  v_athlete := public._coach_validate_session(p_token, 'plan');
  IF v_athlete IS NULL THEN
    RAISE EXCEPTION 'INVALID_SESSION';
  END IF;

  v_clean := NULLIF(TRIM(COALESCE(p_notes, '')), '');
  IF v_clean IS NOT NULL AND LENGTH(v_clean) > 2000 THEN
    RAISE EXCEPTION 'NOTES_TOO_LONG';
  END IF;

  SELECT coach_name INTO v_coach_name FROM coach_sessions WHERE token = p_token;

  INSERT INTO user_profiles (user_id, coach_notes, coach_notes_updated_at, coach_notes_author, updated_at)
  VALUES (v_athlete, v_clean, NOW(), v_coach_name, NOW())
  ON CONFLICT (user_id) DO UPDATE SET
    coach_notes = EXCLUDED.coach_notes,
    coach_notes_updated_at = NOW(),
    coach_notes_author = v_coach_name,
    updated_at = NOW();

  INSERT INTO coach_audit_log (token, athlete_id, coach_name, action, payload)
  VALUES (p_token, v_athlete, v_coach_name, 'set_coach_notes',
          jsonb_build_object('length', COALESCE(LENGTH(v_clean), 0)));

  RETURN jsonb_build_object('success', true);
END;
$fn$;

REVOKE ALL ON FUNCTION public.coach_set_coach_notes(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.coach_set_coach_notes(TEXT, TEXT) TO anon, authenticated;

-- 5) Extender snapshot para incluir notas
CREATE OR REPLACE FUNCTION public.coach_plan_snapshot(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_athlete UUID;
  v_result JSONB;
BEGIN
  v_athlete := public._coach_validate_session(p_token, 'plan');
  IF v_athlete IS NULL THEN
    RAISE EXCEPTION 'INVALID_SESSION';
  END IF;

  SELECT jsonb_build_object(
    'athlete_id', v_athlete,
    'athlete_name', COALESCE(up.display_name, p.full_name, 'Atleta'),
    'avatar_url', p.avatar_url,
    'training_frequency', p.training_frequency,
    'training_routine_names', COALESCE(p.training_routine_names, '{}'::jsonb),
    'external_schedule', COALESCE(up.external_schedule, '{}'::jsonb),
    'training_program', COALESCE(up.training_program, '{}'::jsonb),
    'coach_notes', up.coach_notes,
    'coach_notes_updated_at', up.coach_notes_updated_at,
    'coach_notes_author', up.coach_notes_author
  )
  INTO v_result
  FROM profiles p
  LEFT JOIN user_profiles up ON up.user_id = p.id
  WHERE p.id = v_athlete;

  RETURN v_result;
END;
$fn$;

REVOKE ALL ON FUNCTION public.coach_plan_snapshot(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.coach_plan_snapshot(TEXT) TO anon, authenticated;
