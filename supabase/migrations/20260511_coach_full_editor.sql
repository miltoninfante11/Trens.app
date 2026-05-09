-- ============================================================================
-- COACH FULL EDITOR — RPCs paridad con GYM Estructura + PLAN
-- Reemplaza el modelo "aplicar plantilla" por edición manual completa.
-- Depende de: 20260509_coach_access.sql, 20260509_coach_plan_rpcs.sql, 20260510_coach_extras.sql
-- ============================================================================

-- 0) Quitar RPCs de plantillas (el coach NO debe aplicar plantillas)
DROP FUNCTION IF EXISTS public.coach_apply_template(TEXT, UUID);
DROP FUNCTION IF EXISTS public.coach_list_templates(TEXT);

-- =============================================================================
-- EJERCICIOS DEL DÍA
-- =============================================================================

-- coach_search_exercises — catálogo
CREATE OR REPLACE FUNCTION public.coach_search_exercises(
  p_token TEXT,
  p_query TEXT DEFAULT NULL,
  p_muscle TEXT DEFAULT NULL,
  p_limit INT DEFAULT 100
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  v_session coach_sessions%ROWTYPE;
  v_rows JSONB;
  v_q TEXT;
BEGIN
  v_session := _coach_validate_session(p_token, 'plan:edit');
  v_q := NULLIF(TRIM(COALESCE(p_query, '')), '');

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', e.id,
    'name', e.name,
    'muscle_group', e.muscle_group,
    'secondary_muscles', e.secondary_muscles,
    'thumbnail_url', e.thumbnail_url
  ) ORDER BY e.name), '[]'::jsonb)
  INTO v_rows
  FROM (
    SELECT * FROM exercises
    WHERE (v_q IS NULL OR name ILIKE '%' || v_q || '%')
      AND (p_muscle IS NULL OR muscle_group ILIKE p_muscle)
    ORDER BY name
    LIMIT p_limit
  ) e;

  RETURN jsonb_build_object('success', true, 'exercises', v_rows);
END;
$fn$;
REVOKE ALL ON FUNCTION public.coach_search_exercises(TEXT, TEXT, TEXT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.coach_search_exercises(TEXT, TEXT, TEXT, INT) TO anon, authenticated;

-- coach_list_day_exercises — ejercicios configurados para un día
CREATE OR REPLACE FUNCTION public.coach_list_day_exercises(
  p_token TEXT,
  p_day INT
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  v_session coach_sessions%ROWTYPE;
  v_rows JSONB;
  v_groups JSONB;
BEGIN
  v_session := _coach_validate_session(p_token, 'plan:edit');

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', uec.id,
    'exercise_id', uec.exercise_id,
    'name', e.name,
    'thumbnail_url', e.thumbnail_url,
    'muscle_group', e.muscle_group,
    'training_days', uec.training_days,
    'session_index', uec.session_index,
    'display_order', uec.display_order,
    'config', uec.config,
    'alternatives', e.alternatives
  ) ORDER BY uec.display_order), '[]'::jsonb)
  INTO v_rows
  FROM user_exercise_config uec
  JOIN exercises e ON e.id = uec.exercise_id
  WHERE uec.user_id = v_session.athlete_id
    AND p_day = ANY(COALESCE(uec.training_days, ARRAY[]::int[]));

  SELECT COALESCE(up.exercise_groups -> p_day::text, '[]'::jsonb)
  INTO v_groups
  FROM user_profiles up
  WHERE up.user_id = v_session.athlete_id;

  RETURN jsonb_build_object(
    'success', true,
    'exercises', v_rows,
    'groups', COALESCE(v_groups, '[]'::jsonb)
  );
END;
$fn$;
REVOKE ALL ON FUNCTION public.coach_list_day_exercises(TEXT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.coach_list_day_exercises(TEXT, INT) TO anon, authenticated;

-- coach_add_exercise — añadir ejercicio a un día
CREATE OR REPLACE FUNCTION public.coach_add_exercise(
  p_token TEXT,
  p_exercise_id UUID,
  p_day INT
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  v_session coach_sessions%ROWTYPE;
  v_existing RECORD;
  v_new_id UUID;
  v_order INT;
BEGIN
  v_session := _coach_validate_session(p_token, 'plan:edit');

  -- Si ya existe el ejercicio (mismo user/exercise/session_index) → solo agregar día
  SELECT * INTO v_existing FROM user_exercise_config
  WHERE user_id = v_session.athlete_id
    AND exercise_id = p_exercise_id
    AND session_index = 0
  LIMIT 1;

  IF v_existing.id IS NOT NULL THEN
    UPDATE user_exercise_config
    SET training_days = (
      SELECT ARRAY(SELECT DISTINCT unnest(COALESCE(v_existing.training_days, ARRAY[]::int[]) || ARRAY[p_day]))
    ),
    updated_at = NOW()
    WHERE id = v_existing.id;
    v_new_id := v_existing.id;
  ELSE
    SELECT COALESCE(MAX(display_order), -1) + 1
    INTO v_order
    FROM user_exercise_config
    WHERE user_id = v_session.athlete_id
      AND p_day = ANY(COALESCE(training_days, ARRAY[]::int[]));

    INSERT INTO user_exercise_config (user_id, exercise_id, training_days, session_index, display_order, config)
    VALUES (
      v_session.athlete_id,
      p_exercise_id,
      ARRAY[p_day],
      0,
      v_order,
      jsonb_build_object(
        'rest', '90s',
        'sets', '4x10',
        'custom_series', '[]'::jsonb,
        'series_by_day', '{}'::jsonb
      )
    )
    RETURNING id INTO v_new_id;
  END IF;

  INSERT INTO coach_audit_log (session_token, athlete_id, coach_name, action, payload)
  VALUES (p_token, v_session.athlete_id, v_session.coach_name, 'add_exercise',
          jsonb_build_object('exercise_id', p_exercise_id, 'day', p_day, 'config_id', v_new_id));

  RETURN jsonb_build_object('success', true, 'id', v_new_id);
END;
$fn$;
REVOKE ALL ON FUNCTION public.coach_add_exercise(TEXT, UUID, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.coach_add_exercise(TEXT, UUID, INT) TO anon, authenticated;

-- coach_remove_exercise — quitar ejercicio de un día (o eliminarlo si era único)
CREATE OR REPLACE FUNCTION public.coach_remove_exercise(
  p_token TEXT,
  p_config_id UUID,
  p_day INT
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  v_session coach_sessions%ROWTYPE;
  v_existing RECORD;
  v_new_days INT[];
BEGIN
  v_session := _coach_validate_session(p_token, 'plan:edit');

  SELECT * INTO v_existing FROM user_exercise_config
  WHERE id = p_config_id AND user_id = v_session.athlete_id LIMIT 1;
  IF v_existing.id IS NULL THEN
    RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  v_new_days := ARRAY(
    SELECT d FROM unnest(COALESCE(v_existing.training_days, ARRAY[]::int[])) d WHERE d <> p_day
  );

  IF array_length(v_new_days, 1) IS NULL THEN
    DELETE FROM user_exercise_config WHERE id = p_config_id;
  ELSE
    UPDATE user_exercise_config
    SET training_days = v_new_days, updated_at = NOW()
    WHERE id = p_config_id;
  END IF;

  INSERT INTO coach_audit_log (session_token, athlete_id, coach_name, action, payload)
  VALUES (p_token, v_session.athlete_id, v_session.coach_name, 'remove_exercise',
          jsonb_build_object('config_id', p_config_id, 'day', p_day));

  RETURN jsonb_build_object('success', true);
END;
$fn$;
REVOKE ALL ON FUNCTION public.coach_remove_exercise(TEXT, UUID, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.coach_remove_exercise(TEXT, UUID, INT) TO anon, authenticated;

-- coach_update_exercise_config — actualizar config (series, rest, etc.)
CREATE OR REPLACE FUNCTION public.coach_update_exercise_config(
  p_token TEXT,
  p_config_id UUID,
  p_config JSONB
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  v_session coach_sessions%ROWTYPE;
  v_count INT;
BEGIN
  v_session := _coach_validate_session(p_token, 'plan:edit');

  UPDATE user_exercise_config
  SET config = COALESCE(p_config, '{}'::jsonb), updated_at = NOW()
  WHERE id = p_config_id AND user_id = v_session.athlete_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count = 0 THEN
    RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO coach_audit_log (session_token, athlete_id, coach_name, action, payload)
  VALUES (p_token, v_session.athlete_id, v_session.coach_name, 'update_exercise_config',
          jsonb_build_object('config_id', p_config_id));

  RETURN jsonb_build_object('success', true);
END;
$fn$;
REVOKE ALL ON FUNCTION public.coach_update_exercise_config(TEXT, UUID, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.coach_update_exercise_config(TEXT, UUID, JSONB) TO anon, authenticated;

-- coach_reorder_day_exercises — orden de ejercicios en un día
CREATE OR REPLACE FUNCTION public.coach_reorder_day_exercises(
  p_token TEXT,
  p_day INT,
  p_ids UUID[]
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  v_session coach_sessions%ROWTYPE;
  v_id UUID;
  v_idx INT := 0;
BEGIN
  v_session := _coach_validate_session(p_token, 'plan:edit');

  FOREACH v_id IN ARRAY p_ids LOOP
    UPDATE user_exercise_config
    SET display_order = v_idx, updated_at = NOW()
    WHERE id = v_id AND user_id = v_session.athlete_id;
    v_idx := v_idx + 1;
  END LOOP;

  INSERT INTO coach_audit_log (session_token, athlete_id, coach_name, action, payload)
  VALUES (p_token, v_session.athlete_id, v_session.coach_name, 'reorder_exercises',
          jsonb_build_object('day', p_day, 'count', v_idx));

  RETURN jsonb_build_object('success', true);
END;
$fn$;
REVOKE ALL ON FUNCTION public.coach_reorder_day_exercises(TEXT, INT, UUID[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.coach_reorder_day_exercises(TEXT, INT, UUID[]) TO anon, authenticated;

-- coach_set_exercise_groups — superseries / circuitos / drop-sets de un día
CREATE OR REPLACE FUNCTION public.coach_set_exercise_groups(
  p_token TEXT,
  p_day INT,
  p_groups JSONB
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  v_session coach_sessions%ROWTYPE;
  v_existing JSONB;
  v_next JSONB;
BEGIN
  v_session := _coach_validate_session(p_token, 'plan:edit');

  SELECT COALESCE(exercise_groups, '{}'::jsonb)
  INTO v_existing
  FROM user_profiles WHERE user_id = v_session.athlete_id;
  v_existing := COALESCE(v_existing, '{}'::jsonb);

  v_next := v_existing || jsonb_build_object(p_day::text, COALESCE(p_groups, '[]'::jsonb));

  INSERT INTO user_profiles (user_id, exercise_groups, updated_at)
  VALUES (v_session.athlete_id, v_next, NOW())
  ON CONFLICT (user_id) DO UPDATE SET
    exercise_groups = v_next,
    updated_at = NOW();

  INSERT INTO coach_audit_log (session_token, athlete_id, coach_name, action, payload)
  VALUES (p_token, v_session.athlete_id, v_session.coach_name, 'set_exercise_groups',
          jsonb_build_object('day', p_day, 'count', jsonb_array_length(COALESCE(p_groups, '[]'::jsonb))));

  RETURN jsonb_build_object('success', true);
END;
$fn$;
REVOKE ALL ON FUNCTION public.coach_set_exercise_groups(TEXT, INT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.coach_set_exercise_groups(TEXT, INT, JSONB) TO anon, authenticated;

-- =============================================================================
-- COMIDAS
-- =============================================================================

CREATE OR REPLACE FUNCTION public.coach_list_meals(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  v_session coach_sessions%ROWTYPE;
  v_rows JSONB;
BEGIN
  v_session := _coach_validate_session(p_token, 'plan:edit');

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', m.id,
    'name', m.name,
    'scheduled_time', m.scheduled_time,
    'ingredients', COALESCE(m.ingredients, '[]'::jsonb),
    'calories', m.calories,
    'protein_g', m.protein_g,
    'carbs_g', m.carbs_g,
    'fat_g', m.fat_g,
    'notes', m.notes,
    'position', m.position,
    'selected_option', m.selected_option
  ) ORDER BY m.scheduled_time, m.position), '[]'::jsonb)
  INTO v_rows
  FROM meals m
  WHERE m.user_id = v_session.athlete_id;

  RETURN jsonb_build_object('success', true, 'meals', v_rows);
END;
$fn$;
REVOKE ALL ON FUNCTION public.coach_list_meals(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.coach_list_meals(TEXT) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.coach_upsert_meal(
  p_token TEXT,
  p_meal JSONB
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  v_session coach_sessions%ROWTYPE;
  v_id UUID;
BEGIN
  v_session := _coach_validate_session(p_token, 'plan:edit');
  v_id := NULLIF(p_meal->>'id', '')::uuid;

  IF v_id IS NULL THEN
    INSERT INTO meals (
      user_id, name, scheduled_time, ingredients, calories,
      protein_g, carbs_g, fat_g, notes, position, selected_option
    )
    VALUES (
      v_session.athlete_id,
      COALESCE(p_meal->>'name', 'COMIDA'),
      NULLIF(p_meal->>'scheduled_time', '')::time,
      COALESCE(p_meal->'ingredients', '[]'::jsonb),
      NULLIF(p_meal->>'calories', '')::int,
      NULLIF(p_meal->>'protein_g', '')::numeric,
      NULLIF(p_meal->>'carbs_g', '')::numeric,
      NULLIF(p_meal->>'fat_g', '')::numeric,
      p_meal->>'notes',
      COALESCE((p_meal->>'position')::int, 0),
      COALESCE((p_meal->>'selected_option')::int, 0)
    )
    RETURNING id INTO v_id;
  ELSE
    UPDATE meals SET
      name = COALESCE(p_meal->>'name', name),
      scheduled_time = COALESCE(NULLIF(p_meal->>'scheduled_time', '')::time, scheduled_time),
      ingredients = COALESCE(p_meal->'ingredients', ingredients),
      calories = COALESCE(NULLIF(p_meal->>'calories', '')::int, calories),
      protein_g = COALESCE(NULLIF(p_meal->>'protein_g', '')::numeric, protein_g),
      carbs_g = COALESCE(NULLIF(p_meal->>'carbs_g', '')::numeric, carbs_g),
      fat_g = COALESCE(NULLIF(p_meal->>'fat_g', '')::numeric, fat_g),
      notes = COALESCE(p_meal->>'notes', notes),
      position = COALESCE((p_meal->>'position')::int, position),
      selected_option = COALESCE((p_meal->>'selected_option')::int, selected_option),
      updated_at = NOW()
    WHERE id = v_id AND user_id = v_session.athlete_id;
  END IF;

  INSERT INTO coach_audit_log (session_token, athlete_id, coach_name, action, payload)
  VALUES (p_token, v_session.athlete_id, v_session.coach_name, 'upsert_meal',
          jsonb_build_object('meal_id', v_id));

  RETURN jsonb_build_object('success', true, 'id', v_id);
END;
$fn$;
REVOKE ALL ON FUNCTION public.coach_upsert_meal(TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.coach_upsert_meal(TEXT, JSONB) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.coach_delete_meal(p_token TEXT, p_meal_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  v_session coach_sessions%ROWTYPE;
  v_count INT;
BEGIN
  v_session := _coach_validate_session(p_token, 'plan:edit');

  DELETE FROM meals WHERE id = p_meal_id AND user_id = v_session.athlete_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count = 0 THEN
    RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO coach_audit_log (session_token, athlete_id, coach_name, action, payload)
  VALUES (p_token, v_session.athlete_id, v_session.coach_name, 'delete_meal',
          jsonb_build_object('meal_id', p_meal_id));

  RETURN jsonb_build_object('success', true);
END;
$fn$;
REVOKE ALL ON FUNCTION public.coach_delete_meal(TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.coach_delete_meal(TEXT, UUID) TO anon, authenticated;

-- Alternativas de comida
CREATE OR REPLACE FUNCTION public.coach_list_meal_options(p_token TEXT, p_meal_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  v_session coach_sessions%ROWTYPE;
  v_rows JSONB;
BEGIN
  v_session := _coach_validate_session(p_token, 'plan:edit');

  PERFORM 1 FROM meals WHERE id = p_meal_id AND user_id = v_session.athlete_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', mo.id,
    'name', mo.name,
    'ingredients', mo.ingredients,
    'notes', mo.notes,
    'position', mo.position
  ) ORDER BY mo.position), '[]'::jsonb)
  INTO v_rows
  FROM meal_options mo
  WHERE mo.meal_id = p_meal_id;

  RETURN jsonb_build_object('success', true, 'options', v_rows);
END;
$fn$;
REVOKE ALL ON FUNCTION public.coach_list_meal_options(TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.coach_list_meal_options(TEXT, UUID) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.coach_upsert_meal_option(
  p_token TEXT,
  p_meal_id UUID,
  p_option JSONB
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  v_session coach_sessions%ROWTYPE;
  v_id UUID;
  v_pos INT;
BEGIN
  v_session := _coach_validate_session(p_token, 'plan:edit');
  PERFORM 1 FROM meals WHERE id = p_meal_id AND user_id = v_session.athlete_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE = 'P0002'; END IF;

  v_id := NULLIF(p_option->>'id', '')::uuid;

  IF v_id IS NULL THEN
    SELECT COALESCE(MAX(position), -1) + 1 INTO v_pos FROM meal_options WHERE meal_id = p_meal_id;
    INSERT INTO meal_options (meal_id, user_id, name, ingredients, notes, position)
    VALUES (
      p_meal_id, v_session.athlete_id,
      COALESCE(p_option->>'name', 'OPCIÓN'),
      COALESCE(p_option->'ingredients', '[]'::jsonb),
      p_option->>'notes',
      v_pos
    )
    RETURNING id INTO v_id;
  ELSE
    UPDATE meal_options SET
      name = COALESCE(p_option->>'name', name),
      ingredients = COALESCE(p_option->'ingredients', ingredients),
      notes = COALESCE(p_option->>'notes', notes)
    WHERE id = v_id AND meal_id = p_meal_id;
  END IF;

  INSERT INTO coach_audit_log (session_token, athlete_id, coach_name, action, payload)
  VALUES (p_token, v_session.athlete_id, v_session.coach_name, 'upsert_meal_option',
          jsonb_build_object('meal_id', p_meal_id, 'option_id', v_id));

  RETURN jsonb_build_object('success', true, 'id', v_id);
END;
$fn$;
REVOKE ALL ON FUNCTION public.coach_upsert_meal_option(TEXT, UUID, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.coach_upsert_meal_option(TEXT, UUID, JSONB) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.coach_delete_meal_option(p_token TEXT, p_option_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  v_session coach_sessions%ROWTYPE;
  v_count INT;
BEGIN
  v_session := _coach_validate_session(p_token, 'plan:edit');
  DELETE FROM meal_options WHERE id = p_option_id AND user_id = v_session.athlete_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count = 0 THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE = 'P0002'; END IF;

  INSERT INTO coach_audit_log (session_token, athlete_id, coach_name, action, payload)
  VALUES (p_token, v_session.athlete_id, v_session.coach_name, 'delete_meal_option',
          jsonb_build_object('option_id', p_option_id));

  RETURN jsonb_build_object('success', true);
END;
$fn$;
REVOKE ALL ON FUNCTION public.coach_delete_meal_option(TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.coach_delete_meal_option(TEXT, UUID) TO anon, authenticated;

-- =============================================================================
-- CARDIO
-- =============================================================================

CREATE OR REPLACE FUNCTION public.coach_list_cardio(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  v_session coach_sessions%ROWTYPE;
  v_rows JSONB;
BEGIN
  v_session := _coach_validate_session(p_token, 'plan:edit');

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', c.id,
    'activity', c.activity,
    'cardio_type', c.cardio_type,
    'duration_minutes', c.duration_minutes,
    'intensity', c.intensity,
    'scheduled_time', c.scheduled_time,
    'days_of_week', c.days_of_week,
    'is_pre_workout', c.is_pre_workout,
    'is_post_workout', c.is_post_workout,
    'is_fasted', c.is_fasted,
    'notes', c.notes,
    'display_order', c.display_order
  ) ORDER BY c.display_order, c.scheduled_time), '[]'::jsonb)
  INTO v_rows
  FROM cardio_blocks c
  WHERE c.user_id = v_session.athlete_id;

  RETURN jsonb_build_object('success', true, 'cardio', v_rows);
END;
$fn$;
REVOKE ALL ON FUNCTION public.coach_list_cardio(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.coach_list_cardio(TEXT) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.coach_upsert_cardio(p_token TEXT, p_cardio JSONB)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  v_session coach_sessions%ROWTYPE;
  v_id UUID;
  v_days INT[];
BEGIN
  v_session := _coach_validate_session(p_token, 'plan:edit');
  v_id := NULLIF(p_cardio->>'id', '')::uuid;

  v_days := CASE
    WHEN jsonb_typeof(p_cardio->'days_of_week') = 'array'
      THEN ARRAY(SELECT (value)::int FROM jsonb_array_elements_text(p_cardio->'days_of_week'))
    ELSE NULL
  END;

  IF v_id IS NULL THEN
    INSERT INTO cardio_blocks (
      user_id, activity, cardio_type, duration_minutes, intensity,
      scheduled_time, days_of_week, is_pre_workout, is_post_workout, is_fasted, notes, display_order
    )
    VALUES (
      v_session.athlete_id,
      COALESCE(p_cardio->>'activity', 'Cardio'),
      COALESCE(p_cardio->>'cardio_type', 'LISS'),
      COALESCE((p_cardio->>'duration_minutes')::int, 30),
      p_cardio->>'intensity',
      p_cardio->>'scheduled_time',
      COALESCE(v_days, ARRAY[]::int[]),
      COALESCE((p_cardio->>'is_pre_workout')::boolean, false),
      COALESCE((p_cardio->>'is_post_workout')::boolean, false),
      COALESCE((p_cardio->>'is_fasted')::boolean, false),
      p_cardio->>'notes',
      COALESCE((p_cardio->>'display_order')::int, 0)
    )
    RETURNING id INTO v_id;
  ELSE
    UPDATE cardio_blocks SET
      activity = COALESCE(p_cardio->>'activity', activity),
      cardio_type = COALESCE(p_cardio->>'cardio_type', cardio_type),
      duration_minutes = COALESCE((p_cardio->>'duration_minutes')::int, duration_minutes),
      intensity = COALESCE(p_cardio->>'intensity', intensity),
      scheduled_time = COALESCE(p_cardio->>'scheduled_time', scheduled_time),
      days_of_week = COALESCE(v_days, days_of_week),
      is_pre_workout = COALESCE((p_cardio->>'is_pre_workout')::boolean, is_pre_workout),
      is_post_workout = COALESCE((p_cardio->>'is_post_workout')::boolean, is_post_workout),
      is_fasted = COALESCE((p_cardio->>'is_fasted')::boolean, is_fasted),
      notes = COALESCE(p_cardio->>'notes', notes),
      display_order = COALESCE((p_cardio->>'display_order')::int, display_order)
    WHERE id = v_id AND user_id = v_session.athlete_id;
  END IF;

  INSERT INTO coach_audit_log (session_token, athlete_id, coach_name, action, payload)
  VALUES (p_token, v_session.athlete_id, v_session.coach_name, 'upsert_cardio',
          jsonb_build_object('cardio_id', v_id));

  RETURN jsonb_build_object('success', true, 'id', v_id);
END;
$fn$;
REVOKE ALL ON FUNCTION public.coach_upsert_cardio(TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.coach_upsert_cardio(TEXT, JSONB) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.coach_delete_cardio(p_token TEXT, p_cardio_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  v_session coach_sessions%ROWTYPE;
  v_count INT;
BEGIN
  v_session := _coach_validate_session(p_token, 'plan:edit');
  DELETE FROM cardio_blocks WHERE id = p_cardio_id AND user_id = v_session.athlete_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count = 0 THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE = 'P0002'; END IF;

  INSERT INTO coach_audit_log (session_token, athlete_id, coach_name, action, payload)
  VALUES (p_token, v_session.athlete_id, v_session.coach_name, 'delete_cardio',
          jsonb_build_object('cardio_id', p_cardio_id));

  RETURN jsonb_build_object('success', true);
END;
$fn$;
REVOKE ALL ON FUNCTION public.coach_delete_cardio(TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.coach_delete_cardio(TEXT, UUID) TO anon, authenticated;

-- =============================================================================
-- SUPLEMENTOS
-- =============================================================================

CREATE OR REPLACE FUNCTION public.coach_list_supplements(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  v_session coach_sessions%ROWTYPE;
  v_rows JSONB;
BEGIN
  v_session := _coach_validate_session(p_token, 'plan:edit');

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', s.id,
    'name', s.name,
    'dose', s.dose,
    'type', s.type,
    'time', s.time,
    'days_of_week', s.days_of_week,
    'is_pre_workout', s.is_pre_workout,
    'is_post_workout', s.is_post_workout,
    'is_active', s.is_active,
    'notes', s.notes
  ) ORDER BY s.time), '[]'::jsonb)
  INTO v_rows
  FROM supplement_stack s
  WHERE s.user_id = v_session.athlete_id;

  RETURN jsonb_build_object('success', true, 'supplements', v_rows);
END;
$fn$;
REVOKE ALL ON FUNCTION public.coach_list_supplements(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.coach_list_supplements(TEXT) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.coach_upsert_supplement(p_token TEXT, p_supp JSONB)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  v_session coach_sessions%ROWTYPE;
  v_id UUID;
  v_days INT[];
BEGIN
  v_session := _coach_validate_session(p_token, 'plan:edit');
  v_id := NULLIF(p_supp->>'id', '')::uuid;

  v_days := CASE
    WHEN jsonb_typeof(p_supp->'days_of_week') = 'array'
      THEN ARRAY(SELECT (value)::int FROM jsonb_array_elements_text(p_supp->'days_of_week'))
    ELSE NULL
  END;

  IF v_id IS NULL THEN
    INSERT INTO supplement_stack (
      user_id, name, dose, type, time, days_of_week,
      is_pre_workout, is_post_workout, is_active, notes
    )
    VALUES (
      v_session.athlete_id,
      COALESCE(p_supp->>'name', 'SUPLEMENTO'),
      p_supp->>'dose',
      COALESCE(p_supp->>'type', 'pill'),
      NULLIF(p_supp->>'time', '')::time,
      COALESCE(v_days, ARRAY[]::int[]),
      COALESCE((p_supp->>'is_pre_workout')::boolean, false),
      COALESCE((p_supp->>'is_post_workout')::boolean, false),
      COALESCE((p_supp->>'is_active')::boolean, true),
      p_supp->>'notes'
    )
    RETURNING id INTO v_id;
  ELSE
    UPDATE supplement_stack SET
      name = COALESCE(p_supp->>'name', name),
      dose = COALESCE(p_supp->>'dose', dose),
      type = COALESCE(p_supp->>'type', type),
      time = COALESCE(NULLIF(p_supp->>'time', '')::time, time),
      days_of_week = COALESCE(v_days, days_of_week),
      is_pre_workout = COALESCE((p_supp->>'is_pre_workout')::boolean, is_pre_workout),
      is_post_workout = COALESCE((p_supp->>'is_post_workout')::boolean, is_post_workout),
      is_active = COALESCE((p_supp->>'is_active')::boolean, is_active),
      notes = COALESCE(p_supp->>'notes', notes)
    WHERE id = v_id AND user_id = v_session.athlete_id;
  END IF;

  INSERT INTO coach_audit_log (session_token, athlete_id, coach_name, action, payload)
  VALUES (p_token, v_session.athlete_id, v_session.coach_name, 'upsert_supplement',
          jsonb_build_object('supp_id', v_id));

  RETURN jsonb_build_object('success', true, 'id', v_id);
END;
$fn$;
REVOKE ALL ON FUNCTION public.coach_upsert_supplement(TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.coach_upsert_supplement(TEXT, JSONB) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.coach_delete_supplement(p_token TEXT, p_supp_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  v_session coach_sessions%ROWTYPE;
  v_count INT;
BEGIN
  v_session := _coach_validate_session(p_token, 'plan:edit');
  DELETE FROM supplement_stack WHERE id = p_supp_id AND user_id = v_session.athlete_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count = 0 THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE = 'P0002'; END IF;

  INSERT INTO coach_audit_log (session_token, athlete_id, coach_name, action, payload)
  VALUES (p_token, v_session.athlete_id, v_session.coach_name, 'delete_supplement',
          jsonb_build_object('supp_id', p_supp_id));

  RETURN jsonb_build_object('success', true);
END;
$fn$;
REVOKE ALL ON FUNCTION public.coach_delete_supplement(TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.coach_delete_supplement(TEXT, UUID) TO anon, authenticated;

-- =============================================================================
-- NOTAS DEL COACH (alias compatibles con tabs)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.coach_get_notes(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  v_session coach_sessions%ROWTYPE;
  v_notes TEXT;
  v_author TEXT;
  v_updated TIMESTAMPTZ;
BEGIN
  v_session := _coach_validate_session(p_token, 'plan:read');
  SELECT coach_notes, coach_notes_author, coach_notes_updated_at
    INTO v_notes, v_author, v_updated
    FROM user_profiles
   WHERE user_id = v_session.athlete_id;
  RETURN jsonb_build_object(
    'success', true,
    'notes', COALESCE(v_notes, ''),
    'author', v_author,
    'updated_at', v_updated
  );
END;
$fn$;
REVOKE ALL ON FUNCTION public.coach_get_notes(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.coach_get_notes(TEXT) TO anon, authenticated;

-- coach_set_notes — alias del existente coach_set_coach_notes con nombre simple
CREATE OR REPLACE FUNCTION public.coach_set_notes(p_token TEXT, p_notes TEXT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
BEGIN
  RETURN public.coach_set_coach_notes(p_token, p_notes);
END;
$fn$;
REVOKE ALL ON FUNCTION public.coach_set_notes(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.coach_set_notes(TEXT, TEXT) TO anon, authenticated;
