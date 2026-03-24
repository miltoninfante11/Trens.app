-- Fix: Manejar ejercicios que aparecen en múltiples días del template
-- Usar ON CONFLICT para agregar el día al array training_days en vez de fallar

CREATE OR REPLACE FUNCTION admin_assign_plan(
  p_admin_user_id UUID,
  p_target_user_id UUID,
  p_template_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_admin_role TEXT;
  v_template RECORD;
  v_day JSONB;
  v_exercise JSONB;
  v_routine_names JSONB := '{}';
  v_exercises_created INT := 0;
  v_exercise_errors TEXT[] := '{}';
  v_config JSONB;
  v_custom_series JSONB;
  v_series_item JSONB;
  v_idx INT;
  v_rest_seconds INT;
  v_day_index INT;
BEGIN
  -- 1. Verificar que el usuario es admin o CEO
  SELECT role INTO v_admin_role FROM user_roles WHERE user_id = p_admin_user_id;
  IF v_admin_role IS NULL THEN
    SELECT role INTO v_admin_role FROM admin_users WHERE user_id = p_admin_user_id;
  END IF;
  IF v_admin_role IS NULL THEN
    PERFORM 1 FROM profiles WHERE id = p_admin_user_id
    AND email IN ('micorp.latam@gmail.com', 'm.sanchez@neurocodestudio.com', 'admin@trens.app');
    IF FOUND THEN v_admin_role := 'ceo'; END IF;
  END IF;

  IF v_admin_role IS NULL OR v_admin_role NOT IN ('admin', 'ceo') THEN
    RETURN jsonb_build_object('success', false, 'error', 'No tienes permisos de administrador');
  END IF;

  -- 2. Obtener template
  SELECT * INTO v_template FROM training_plan_templates
  WHERE id = p_template_id AND is_active = true;

  IF v_template IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Plan no encontrado o no está activo');
  END IF;

  -- 3. Construir routine_names
  FOR v_day IN SELECT * FROM jsonb_array_elements(COALESCE(v_template.days, '[]'::jsonb))
  LOOP
    v_routine_names := v_routine_names || jsonb_build_object(
      (v_day->>'dayIndex')::text, v_day->>'name'
    );
  END LOOP;

  -- 4. Actualizar profiles
  UPDATE profiles SET
    training_frequency = v_template.frequency,
    training_current_day = 0,
    training_routine_names = v_routine_names,
    plan_source = 'admin',
    updated_at = NOW()
  WHERE id = p_target_user_id;

  -- 5. Upsert user_profiles
  INSERT INTO user_profiles (user_id, training_days_per_week, training_experience, goal, updated_at)
  VALUES (
    p_target_user_id,
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

  -- 6. Eliminar ejercicios anteriores
  DELETE FROM user_exercise_config WHERE user_id = p_target_user_id;

  -- 7. Crear ejercicios del template
  FOR v_day IN SELECT * FROM jsonb_array_elements(COALESCE(v_template.days, '[]'::jsonb))
  LOOP
    v_day_index := (v_day->>'dayIndex')::int;

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
            'weight', 0,
            'rir', CASE WHEN v_series_item->>'type' = 'FALLO' THEN 0 ELSE 2 END,
            'tempo', '2-0-2-0',
            'restSeconds', v_rest_seconds,
            'note', COALESCE(v_series_item->>'note', '')
          ));
          v_idx := v_idx + 1;
        END LOOP;

        v_config := jsonb_build_object(
          'rest', COALESCE(v_exercise->>'rest', '90s'),
          'sets', COALESCE(jsonb_array_length(v_exercise->'series'), 4)::text || 'x10',
          'custom_series', v_custom_series,
          'series_by_day', '{}'::jsonb
        );

        BEGIN
          INSERT INTO user_exercise_config (user_id, exercise_id, training_days, config)
          VALUES (
            p_target_user_id,
            (v_exercise->>'exercise_id')::uuid,
            ARRAY[v_day_index],
            v_config
          )
          ON CONFLICT (user_id, exercise_id) DO UPDATE SET
            training_days = array_cat(user_exercise_config.training_days, ARRAY[v_day_index]),
            updated_at = NOW();
          v_exercises_created := v_exercises_created + 1;
        EXCEPTION WHEN OTHERS THEN
          v_exercise_errors := array_append(v_exercise_errors, COALESCE(v_exercise->>'name', v_exercise->>'exercise_id'));
        END;
      END IF;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'planName', v_template.name,
    'frequency', v_template.frequency,
    'exercisesCreated', v_exercises_created,
    'errors', to_jsonb(v_exercise_errors)
  );
END;
$fn$;
