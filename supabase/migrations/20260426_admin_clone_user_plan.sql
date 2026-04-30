-- ============================================================================
-- Admin Clone User Plan Function
-- Clona plan de entrenamiento o nutrición desde un usuario origen a uno destino
-- ============================================================================

CREATE OR REPLACE FUNCTION admin_clone_user_plan(
  p_admin_user_id UUID,
  p_source_user_id UUID,
  p_target_user_id UUID,
  p_plan_type TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_admin_role TEXT;
  v_plan_type TEXT := lower(trim(COALESCE(p_plan_type, '')));

  -- Training fields
  v_training_frequency INT;
  v_training_current_day INT;
  v_training_routine_names JSONB;
  v_training_session_names JSONB;

  -- Nutrition copy helpers
  v_stack RECORD;
  v_meal RECORD;
  v_option RECORD;
  v_supp RECORD;
  v_stack_map JSONB := '{}'::jsonb;
  v_new_stack_id UUID;
  v_new_meal_id UUID;
  v_mapped_stack_id UUID;

  -- Counters
  v_training_rows INT := 0;
  v_stacks_copied INT := 0;
  v_meals_copied INT := 0;
  v_meal_options_copied INT := 0;
  v_supplements_copied INT := 0;
BEGIN
  -- --------------------------------------------------------------------------
  -- Validaciones básicas
  -- --------------------------------------------------------------------------
  IF p_admin_user_id IS NULL OR p_source_user_id IS NULL OR p_target_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Parámetros incompletos');
  END IF;

  IF p_source_user_id = p_target_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'El usuario origen y destino no pueden ser el mismo');
  END IF;

  IF v_plan_type NOT IN ('training', 'nutrition') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Tipo de plan inválido. Usa training o nutrition');
  END IF;

  -- --------------------------------------------------------------------------
  -- Permisos admin/ceo
  -- --------------------------------------------------------------------------
  SELECT role INTO v_admin_role FROM user_roles WHERE user_id = p_admin_user_id;
  IF v_admin_role IS NULL THEN
    SELECT role INTO v_admin_role FROM admin_users WHERE user_id = p_admin_user_id;
  END IF;
  IF v_admin_role IS NULL THEN
    PERFORM 1
    FROM profiles
    WHERE id = p_admin_user_id
      AND email IN ('micorp.latam@gmail.com', 'm.sanchez@neurocodestudio.com', 'admin@trens.app');
    IF FOUND THEN
      v_admin_role := 'ceo';
    END IF;
  END IF;

  IF v_admin_role IS NULL OR v_admin_role NOT IN ('admin', 'ceo') THEN
    RETURN jsonb_build_object('success', false, 'error', 'No tienes permisos de administrador');
  END IF;

  -- Validar que los usuarios existan
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = p_source_user_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Usuario origen no encontrado');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = p_target_user_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Usuario destino no encontrado');
  END IF;

  -- --------------------------------------------------------------------------
  -- CLONAR PLAN DE ENTRENAMIENTO
  -- --------------------------------------------------------------------------
  IF v_plan_type = 'training' THEN
    SELECT
      training_frequency,
      training_current_day,
      COALESCE(training_routine_names, '{}'::jsonb),
      COALESCE(training_session_names, '{}'::jsonb)
    INTO
      v_training_frequency,
      v_training_current_day,
      v_training_routine_names,
      v_training_session_names
    FROM profiles
    WHERE id = p_source_user_id;

    IF COALESCE(v_training_frequency, 0) = 0 THEN
      RETURN jsonb_build_object('success', false, 'error', 'El usuario origen no tiene un plan de entrenamiento activo');
    END IF;

    UPDATE profiles
    SET
      training_frequency = v_training_frequency,
      training_current_day = COALESCE(v_training_current_day, 0),
      training_routine_names = v_training_routine_names,
      training_session_names = v_training_session_names,
      plan_source = 'admin',
      updated_at = NOW()
    WHERE id = p_target_user_id;

    DELETE FROM user_exercise_config
    WHERE user_id = p_target_user_id;

    INSERT INTO user_exercise_config (
      user_id,
      exercise_id,
      training_days,
      display_order,
      config,
      custom_media_url,
      metadata,
      session_index
    )
    SELECT
      p_target_user_id,
      exercise_id,
      training_days,
      display_order,
      config,
      custom_media_url,
      metadata,
      COALESCE(session_index, 0)
    FROM user_exercise_config
    WHERE user_id = p_source_user_id;

    GET DIAGNOSTICS v_training_rows = ROW_COUNT;

    RETURN jsonb_build_object(
      'success', true,
      'planType', 'training',
      'copied', jsonb_build_object(
        'trainingExercises', v_training_rows,
        'frequency', v_training_frequency
      )
    );
  END IF;

  -- --------------------------------------------------------------------------
  -- CLONAR PLAN DE NUTRICIÓN
  -- --------------------------------------------------------------------------

  -- Limpiar plan actual del destino
  DELETE FROM meal_options WHERE user_id = p_target_user_id;
  DELETE FROM meals WHERE user_id = p_target_user_id;
  DELETE FROM meal_stacks WHERE user_id = p_target_user_id;
  DELETE FROM supplement_stack WHERE user_id = p_target_user_id;

  -- 1) Clonar stacks de comidas y crear mapa old_stack_id -> new_stack_id
  FOR v_stack IN
    SELECT id, name, description, color, icon, position
    FROM meal_stacks
    WHERE user_id = p_source_user_id
    ORDER BY position ASC, created_at ASC
  LOOP
    INSERT INTO meal_stacks (
      user_id,
      name,
      description,
      color,
      icon,
      position,
      created_at,
      updated_at
    )
    VALUES (
      p_target_user_id,
      v_stack.name,
      v_stack.description,
      COALESCE(v_stack.color, '#DC2626'),
      COALESCE(v_stack.icon, 'utensils'),
      COALESCE(v_stack.position, 0),
      NOW(),
      NOW()
    )
    RETURNING id INTO v_new_stack_id;

    v_stack_map := v_stack_map || jsonb_build_object(v_stack.id::text, v_new_stack_id::text);
    v_stacks_copied := v_stacks_copied + 1;
  END LOOP;

  -- 2) Clonar comidas + meal_options
  FOR v_meal IN
    SELECT
      id,
      stack_id,
      name,
      scheduled_time,
      calories,
      protein_g,
      carbs_g,
      fat_g,
      ingredients,
      notes,
      position,
      selected_option
    FROM meals
    WHERE user_id = p_source_user_id
    ORDER BY position ASC, scheduled_time ASC, created_at ASC
  LOOP
    v_mapped_stack_id := NULL;
    IF v_meal.stack_id IS NOT NULL AND (v_stack_map ? v_meal.stack_id::text) THEN
      v_mapped_stack_id := (v_stack_map ->> v_meal.stack_id::text)::uuid;
    END IF;

    INSERT INTO meals (
      user_id,
      stack_id,
      name,
      scheduled_time,
      calories,
      protein_g,
      carbs_g,
      fat_g,
      ingredients,
      notes,
      is_completed,
      completed_at,
      position,
      selected_option,
      created_at,
      updated_at
    )
    VALUES (
      p_target_user_id,
      v_mapped_stack_id,
      v_meal.name,
      v_meal.scheduled_time,
      v_meal.calories,
      v_meal.protein_g,
      v_meal.carbs_g,
      v_meal.fat_g,
      COALESCE(v_meal.ingredients, '[]'::jsonb),
      v_meal.notes,
      false,
      NULL,
      COALESCE(v_meal.position, 0),
      COALESCE(v_meal.selected_option, 0),
      NOW(),
      NOW()
    )
    RETURNING id INTO v_new_meal_id;

    v_meals_copied := v_meals_copied + 1;

    FOR v_option IN
      SELECT
        name,
        calories,
        protein_g,
        carbs_g,
        fat_g,
        ingredients,
        notes,
        is_selected,
        position
      FROM meal_options
      WHERE meal_id = v_meal.id
      ORDER BY position ASC, created_at ASC
    LOOP
      INSERT INTO meal_options (
        meal_id,
        user_id,
        name,
        calories,
        protein_g,
        carbs_g,
        fat_g,
        ingredients,
        notes,
        is_selected,
        position,
        created_at
      )
      VALUES (
        v_new_meal_id,
        p_target_user_id,
        v_option.name,
        v_option.calories,
        v_option.protein_g,
        v_option.carbs_g,
        v_option.fat_g,
        COALESCE(v_option.ingredients, '[]'::jsonb),
        v_option.notes,
        COALESCE(v_option.is_selected, false),
        COALESCE(v_option.position, 0),
        NOW()
      );

      v_meal_options_copied := v_meal_options_copied + 1;
    END LOOP;
  END LOOP;

  -- 3) Clonar stack de suplementos
  FOR v_supp IN
    SELECT
      name,
      dose,
      type,
      notes,
      time,
      times,
      is_pre_workout,
      is_post_workout,
      is_active,
      days_of_week,
      workout_session_index
    FROM supplement_stack
    WHERE user_id = p_source_user_id
    ORDER BY created_at ASC
  LOOP
    INSERT INTO supplement_stack (
      user_id,
      name,
      dose,
      type,
      notes,
      time,
      times,
      is_pre_workout,
      is_post_workout,
      is_active,
      days_of_week,
      workout_session_index,
      created_at,
      updated_at
    )
    VALUES (
      p_target_user_id,
      v_supp.name,
      v_supp.dose,
      COALESCE(v_supp.type, 'pill'),
      v_supp.notes,
      v_supp.time,
      v_supp.times,
      COALESCE(v_supp.is_pre_workout, false),
      COALESCE(v_supp.is_post_workout, false),
      COALESCE(v_supp.is_active, true),
      COALESCE(v_supp.days_of_week, ARRAY[0, 1, 2, 3, 4, 5, 6]),
      COALESCE(v_supp.workout_session_index, 0),
      NOW(),
      NOW()
    );

    v_supplements_copied := v_supplements_copied + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'planType', 'nutrition',
    'copied', jsonb_build_object(
      'mealStacks', v_stacks_copied,
      'meals', v_meals_copied,
      'mealOptions', v_meal_options_copied,
      'supplements', v_supplements_copied
    )
  );
END;
$fn$;

GRANT EXECUTE ON FUNCTION admin_clone_user_plan(UUID, UUID, UUID, TEXT) TO authenticated;
