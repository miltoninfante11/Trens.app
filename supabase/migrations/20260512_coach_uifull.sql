-- ============================================================================
-- COACH UI FULL — RPCs devuelven shape nativo de DB para reusar componentes
-- del usuario (MealCard, StackCard, CardioBlockCard, etc.) sin transformación.
-- Reemplaza versiones previas en 20260511 con campos completos.
-- ============================================================================

-- ============================ MEALS ==========================================
DROP FUNCTION IF EXISTS public.coach_list_meals(TEXT);
CREATE FUNCTION public.coach_list_meals(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  v_session coach_sessions%ROWTYPE;
  v_rows JSONB;
BEGIN
  v_session := _coach_validate_session(p_token, 'plan:read');
  SELECT COALESCE(jsonb_agg(to_jsonb(m.*) ORDER BY m.position, m.scheduled_time), '[]'::jsonb)
    INTO v_rows
    FROM meals m
   WHERE m.user_id = v_session.athlete_id;
  RETURN jsonb_build_object('success', true, 'meals', v_rows);
END;
$fn$;
REVOKE ALL ON FUNCTION public.coach_list_meals(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.coach_list_meals(TEXT) TO anon, authenticated;

DROP FUNCTION IF EXISTS public.coach_upsert_meal(TEXT, JSONB);
CREATE FUNCTION public.coach_upsert_meal(p_token TEXT, p_meal JSONB)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  v_session coach_sessions%ROWTYPE;
  v_id UUID;
BEGIN
  v_session := _coach_validate_session(p_token, 'plan:edit');
  v_id := NULLIF(p_meal->>'id','')::UUID;
  IF v_id IS NULL THEN
    INSERT INTO meals (
      user_id, name, scheduled_time, calories, protein_g, carbs_g, fat_g,
      ingredients, notes, position, selected_option
    ) VALUES (
      v_session.athlete_id,
      COALESCE(p_meal->>'name','Comida'),
      NULLIF(p_meal->>'scheduled_time','')::TIME,
      NULLIF(p_meal->>'calories','')::INT,
      NULLIF(p_meal->>'protein_g','')::NUMERIC,
      NULLIF(p_meal->>'carbs_g','')::NUMERIC,
      NULLIF(p_meal->>'fat_g','')::NUMERIC,
      COALESCE(p_meal->'ingredients','[]'::jsonb),
      p_meal->>'notes',
      COALESCE(NULLIF(p_meal->>'position','')::INT, 0),
      COALESCE(NULLIF(p_meal->>'selected_option','')::INT, 0)
    ) RETURNING id INTO v_id;
  ELSE
    UPDATE meals SET
      name           = COALESCE(p_meal->>'name', name),
      scheduled_time = COALESCE(NULLIF(p_meal->>'scheduled_time','')::TIME, scheduled_time),
      calories       = COALESCE(NULLIF(p_meal->>'calories','')::INT, calories),
      protein_g      = COALESCE(NULLIF(p_meal->>'protein_g','')::NUMERIC, protein_g),
      carbs_g        = COALESCE(NULLIF(p_meal->>'carbs_g','')::NUMERIC, carbs_g),
      fat_g          = COALESCE(NULLIF(p_meal->>'fat_g','')::NUMERIC, fat_g),
      ingredients    = COALESCE(p_meal->'ingredients', ingredients),
      notes          = COALESCE(p_meal->>'notes', notes),
      position       = COALESCE(NULLIF(p_meal->>'position','')::INT, position),
      selected_option= COALESCE(NULLIF(p_meal->>'selected_option','')::INT, selected_option),
      updated_at     = NOW()
     WHERE id = v_id AND user_id = v_session.athlete_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
  END IF;
  INSERT INTO coach_audit_log (session_token, athlete_id, coach_name, action, payload)
  VALUES (p_token, v_session.athlete_id, v_session.coach_name, 'upsert_meal',
          jsonb_build_object('meal_id', v_id));
  RETURN jsonb_build_object('success', true, 'id', v_id);
END;
$fn$;
REVOKE ALL ON FUNCTION public.coach_upsert_meal(TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.coach_upsert_meal(TEXT, JSONB) TO anon, authenticated;

-- coach_list_meal_options ya existe, ampliar shape
DROP FUNCTION IF EXISTS public.coach_list_meal_options(TEXT, UUID);
CREATE FUNCTION public.coach_list_meal_options(p_token TEXT, p_meal_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  v_session coach_sessions%ROWTYPE;
  v_rows JSONB;
BEGIN
  v_session := _coach_validate_session(p_token, 'plan:read');
  IF NOT EXISTS (SELECT 1 FROM meals WHERE id = p_meal_id AND user_id = v_session.athlete_id) THEN
    RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002';
  END IF;
  SELECT COALESCE(jsonb_agg(to_jsonb(o.*) ORDER BY o.position), '[]'::jsonb)
    INTO v_rows
    FROM meal_options o
   WHERE o.meal_id = p_meal_id;
  RETURN jsonb_build_object('success', true, 'options', v_rows);
END;
$fn$;
REVOKE ALL ON FUNCTION public.coach_list_meal_options(TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.coach_list_meal_options(TEXT, UUID) TO anon, authenticated;

-- ============================ CARDIO =========================================
DROP FUNCTION IF EXISTS public.coach_list_cardio(TEXT);
CREATE FUNCTION public.coach_list_cardio(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  v_session coach_sessions%ROWTYPE;
  v_rows JSONB;
BEGIN
  v_session := _coach_validate_session(p_token, 'plan:read');
  SELECT COALESCE(jsonb_agg(to_jsonb(c.*) ORDER BY c.display_order, c.scheduled_time), '[]'::jsonb)
    INTO v_rows
    FROM cardio_blocks c
   WHERE c.user_id = v_session.athlete_id;
  RETURN jsonb_build_object('success', true, 'cardio', v_rows);
END;
$fn$;
REVOKE ALL ON FUNCTION public.coach_list_cardio(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.coach_list_cardio(TEXT) TO anon, authenticated;

DROP FUNCTION IF EXISTS public.coach_upsert_cardio(TEXT, JSONB);
CREATE FUNCTION public.coach_upsert_cardio(p_token TEXT, p_cardio JSONB)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  v_session coach_sessions%ROWTYPE;
  v_id UUID;
BEGIN
  v_session := _coach_validate_session(p_token, 'plan:edit');
  v_id := NULLIF(p_cardio->>'id','')::UUID;
  IF v_id IS NULL THEN
    INSERT INTO cardio_blocks (
      user_id, training_day, scheduled_time, cardio_type, activity, duration_minutes,
      intensity, notes, is_fasted, is_completed, display_order,
      target_heart_rate, speed, incline, days_of_week,
      is_pre_workout, is_post_workout, workout_session_index
    ) VALUES (
      v_session.athlete_id,
      COALESCE(NULLIF(p_cardio->>'training_day','')::INT, 0),
      COALESCE(p_cardio->>'scheduled_time',''),
      COALESCE(p_cardio->>'cardio_type','CUSTOM'),
      COALESCE(p_cardio->>'activity','Cardio'),
      COALESCE(NULLIF(p_cardio->>'duration_minutes','')::INT, 30),
      COALESCE(p_cardio->>'intensity','MODERADA'),
      COALESCE(p_cardio->>'notes',''),
      COALESCE((p_cardio->>'is_fasted')::BOOL, FALSE),
      FALSE,
      COALESCE(NULLIF(p_cardio->>'display_order','')::INT, 0),
      NULLIF(p_cardio->>'target_heart_rate','')::INT,
      NULLIF(p_cardio->>'speed','')::NUMERIC,
      NULLIF(p_cardio->>'incline','')::NUMERIC,
      CASE WHEN p_cardio ? 'days_of_week'
           THEN ARRAY(SELECT jsonb_array_elements_text(p_cardio->'days_of_week'))::INT[]
           ELSE NULL END,
      COALESCE((p_cardio->>'is_pre_workout')::BOOL, FALSE),
      COALESCE((p_cardio->>'is_post_workout')::BOOL, FALSE),
      COALESCE(NULLIF(p_cardio->>'workout_session_index','')::INT, 0)
    ) RETURNING id INTO v_id;
  ELSE
    UPDATE cardio_blocks SET
      training_day          = COALESCE(NULLIF(p_cardio->>'training_day','')::INT, training_day),
      scheduled_time        = COALESCE(p_cardio->>'scheduled_time', scheduled_time),
      cardio_type           = COALESCE(p_cardio->>'cardio_type', cardio_type),
      activity              = COALESCE(p_cardio->>'activity', activity),
      duration_minutes      = COALESCE(NULLIF(p_cardio->>'duration_minutes','')::INT, duration_minutes),
      intensity             = COALESCE(p_cardio->>'intensity', intensity),
      notes                 = COALESCE(p_cardio->>'notes', notes),
      is_fasted             = COALESCE((p_cardio->>'is_fasted')::BOOL, is_fasted),
      display_order         = COALESCE(NULLIF(p_cardio->>'display_order','')::INT, display_order),
      target_heart_rate     = COALESCE(NULLIF(p_cardio->>'target_heart_rate','')::INT, target_heart_rate),
      speed                 = COALESCE(NULLIF(p_cardio->>'speed','')::NUMERIC, speed),
      incline               = COALESCE(NULLIF(p_cardio->>'incline','')::NUMERIC, incline),
      days_of_week          = CASE WHEN p_cardio ? 'days_of_week'
                                   THEN ARRAY(SELECT jsonb_array_elements_text(p_cardio->'days_of_week'))::INT[]
                                   ELSE days_of_week END,
      is_pre_workout        = COALESCE((p_cardio->>'is_pre_workout')::BOOL, is_pre_workout),
      is_post_workout       = COALESCE((p_cardio->>'is_post_workout')::BOOL, is_post_workout),
      workout_session_index = COALESCE(NULLIF(p_cardio->>'workout_session_index','')::INT, workout_session_index),
      updated_at            = NOW()
     WHERE id = v_id AND user_id = v_session.athlete_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
  END IF;
  INSERT INTO coach_audit_log (session_token, athlete_id, coach_name, action, payload)
  VALUES (p_token, v_session.athlete_id, v_session.coach_name, 'upsert_cardio',
          jsonb_build_object('cardio_id', v_id));
  RETURN jsonb_build_object('success', true, 'id', v_id);
END;
$fn$;
REVOKE ALL ON FUNCTION public.coach_upsert_cardio(TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.coach_upsert_cardio(TEXT, JSONB) TO anon, authenticated;

-- ============================ SUPPLEMENTS ====================================
DROP FUNCTION IF EXISTS public.coach_list_supplements(TEXT);
CREATE FUNCTION public.coach_list_supplements(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  v_session coach_sessions%ROWTYPE;
  v_rows JSONB;
BEGIN
  v_session := _coach_validate_session(p_token, 'plan:read');
  SELECT COALESCE(jsonb_agg(to_jsonb(s.*) ORDER BY s.time, s.name), '[]'::jsonb)
    INTO v_rows
    FROM supplement_stack s
   WHERE s.user_id = v_session.athlete_id;
  RETURN jsonb_build_object('success', true, 'supplements', v_rows);
END;
$fn$;
REVOKE ALL ON FUNCTION public.coach_list_supplements(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.coach_list_supplements(TEXT) TO anon, authenticated;

DROP FUNCTION IF EXISTS public.coach_upsert_supplement(TEXT, JSONB);
CREATE FUNCTION public.coach_upsert_supplement(p_token TEXT, p_supp JSONB)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  v_session coach_sessions%ROWTYPE;
  v_id UUID;
BEGIN
  v_session := _coach_validate_session(p_token, 'plan:edit');
  v_id := NULLIF(p_supp->>'id','')::UUID;
  IF v_id IS NULL THEN
    INSERT INTO supplement_stack (
      user_id, name, dose, type, notes, time, times,
      is_pre_workout, is_post_workout, is_active, days_of_week,
      workout_session_index, product_id
    ) VALUES (
      v_session.athlete_id,
      COALESCE(p_supp->>'name','Suplemento'),
      p_supp->>'dose',
      COALESCE(p_supp->>'type','pill'),
      p_supp->>'notes',
      NULLIF(p_supp->>'time','')::TIME,
      CASE WHEN p_supp ? 'times'
           THEN ARRAY(SELECT (jsonb_array_elements_text(p_supp->'times'))::TIME)
           ELSE NULL END,
      COALESCE((p_supp->>'is_pre_workout')::BOOL, FALSE),
      COALESCE((p_supp->>'is_post_workout')::BOOL, FALSE),
      COALESCE((p_supp->>'is_active')::BOOL, TRUE),
      CASE WHEN p_supp ? 'days_of_week'
           THEN ARRAY(SELECT jsonb_array_elements_text(p_supp->'days_of_week'))::INT[]
           ELSE NULL END,
      COALESCE(NULLIF(p_supp->>'workout_session_index','')::INT, 0),
      NULLIF(p_supp->>'product_id','')::UUID
    ) RETURNING id INTO v_id;
  ELSE
    UPDATE supplement_stack SET
      name                  = COALESCE(p_supp->>'name', name),
      dose                  = COALESCE(p_supp->>'dose', dose),
      type                  = COALESCE(p_supp->>'type', type),
      notes                 = COALESCE(p_supp->>'notes', notes),
      time                  = COALESCE(NULLIF(p_supp->>'time','')::TIME, time),
      times                 = CASE WHEN p_supp ? 'times'
                                   THEN ARRAY(SELECT (jsonb_array_elements_text(p_supp->'times'))::TIME)
                                   ELSE times END,
      is_pre_workout        = COALESCE((p_supp->>'is_pre_workout')::BOOL, is_pre_workout),
      is_post_workout       = COALESCE((p_supp->>'is_post_workout')::BOOL, is_post_workout),
      is_active             = COALESCE((p_supp->>'is_active')::BOOL, is_active),
      days_of_week          = CASE WHEN p_supp ? 'days_of_week'
                                   THEN ARRAY(SELECT jsonb_array_elements_text(p_supp->'days_of_week'))::INT[]
                                   ELSE days_of_week END,
      workout_session_index = COALESCE(NULLIF(p_supp->>'workout_session_index','')::INT, workout_session_index),
      product_id            = COALESCE(NULLIF(p_supp->>'product_id','')::UUID, product_id),
      updated_at            = NOW()
     WHERE id = v_id AND user_id = v_session.athlete_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
  END IF;
  INSERT INTO coach_audit_log (session_token, athlete_id, coach_name, action, payload)
  VALUES (p_token, v_session.athlete_id, v_session.coach_name, 'upsert_supplement',
          jsonb_build_object('supp_id', v_id));
  RETURN jsonb_build_object('success', true, 'id', v_id);
END;
$fn$;
REVOKE ALL ON FUNCTION public.coach_upsert_supplement(TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.coach_upsert_supplement(TEXT, JSONB) TO anon, authenticated;

-- coach_upsert_meal_option ya existe, ampliar para devolver shape limpio
DROP FUNCTION IF EXISTS public.coach_upsert_meal_option(TEXT, UUID, JSONB);
CREATE FUNCTION public.coach_upsert_meal_option(p_token TEXT, p_meal_id UUID, p_option JSONB)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  v_session coach_sessions%ROWTYPE;
  v_id UUID;
BEGIN
  v_session := _coach_validate_session(p_token, 'plan:edit');
  IF NOT EXISTS (SELECT 1 FROM meals WHERE id = p_meal_id AND user_id = v_session.athlete_id) THEN
    RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002';
  END IF;
  v_id := NULLIF(p_option->>'id','')::UUID;
  IF v_id IS NULL THEN
    INSERT INTO meal_options (
      meal_id, user_id, name, ingredients, notes, calories, protein_g, carbs_g, fat_g,
      is_selected, position
    ) VALUES (
      p_meal_id, v_session.athlete_id,
      COALESCE(p_option->>'name','Alternativa'),
      COALESCE(p_option->'ingredients','[]'::jsonb),
      p_option->>'notes',
      NULLIF(p_option->>'calories','')::INT,
      NULLIF(p_option->>'protein_g','')::NUMERIC,
      NULLIF(p_option->>'carbs_g','')::NUMERIC,
      NULLIF(p_option->>'fat_g','')::NUMERIC,
      COALESCE((p_option->>'is_selected')::BOOL, FALSE),
      COALESCE(NULLIF(p_option->>'position','')::INT, 0)
    ) RETURNING id INTO v_id;
  ELSE
    UPDATE meal_options SET
      name        = COALESCE(p_option->>'name', name),
      ingredients = COALESCE(p_option->'ingredients', ingredients),
      notes       = COALESCE(p_option->>'notes', notes),
      calories    = COALESCE(NULLIF(p_option->>'calories','')::INT, calories),
      protein_g   = COALESCE(NULLIF(p_option->>'protein_g','')::NUMERIC, protein_g),
      carbs_g     = COALESCE(NULLIF(p_option->>'carbs_g','')::NUMERIC, carbs_g),
      fat_g       = COALESCE(NULLIF(p_option->>'fat_g','')::NUMERIC, fat_g),
      is_selected = COALESCE((p_option->>'is_selected')::BOOL, is_selected),
      position    = COALESCE(NULLIF(p_option->>'position','')::INT, position)
     WHERE id = v_id AND meal_id = p_meal_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
  END IF;
  INSERT INTO coach_audit_log (session_token, athlete_id, coach_name, action, payload)
  VALUES (p_token, v_session.athlete_id, v_session.coach_name, 'upsert_meal_option',
          jsonb_build_object('meal_id', p_meal_id, 'option_id', v_id));
  RETURN jsonb_build_object('success', true, 'id', v_id);
END;
$fn$;
REVOKE ALL ON FUNCTION public.coach_upsert_meal_option(TEXT, UUID, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.coach_upsert_meal_option(TEXT, UUID, JSONB) TO anon, authenticated;
