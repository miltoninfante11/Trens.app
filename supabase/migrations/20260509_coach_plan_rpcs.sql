-- ============================================================================
-- COACH ACCESS — RPCs DE EDICIÓN DE PLAN (extensión de 20260509_coach_access)
-- ============================================================================
-- Permiten al coach (autenticado vía token de coach_sessions) leer y editar
-- la estructura del plan del atleta sin necesidad de cuenta TRENS.
-- Todas las funciones validan token + scope + auditan.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- HELPER PRIVADO: valida sesión y devuelve el row, o lanza excepción
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION _coach_validate_session(
  p_token  TEXT,
  p_scope  TEXT
) RETURNS coach_sessions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_session coach_sessions%ROWTYPE;
BEGIN
  SELECT * INTO v_session FROM coach_sessions WHERE token = p_token LIMIT 1;
  IF v_session.token IS NULL OR v_session.closed_at IS NOT NULL
     OR v_session.expires_at <= NOW() THEN
    RAISE EXCEPTION 'SESSION_INVALID' USING ERRCODE = '28000';
  END IF;
  IF NOT (p_scope = ANY(v_session.scopes)) THEN
    RAISE EXCEPTION 'SCOPE_DENIED' USING ERRCODE = '42501';
  END IF;
  UPDATE coach_sessions SET last_seen_at = NOW() WHERE token = p_token;
  RETURN v_session;
END;
$$;

REVOKE EXECUTE ON FUNCTION _coach_validate_session(TEXT, TEXT) FROM PUBLIC;

-- ============================================================================
-- RPC: coach_plan_snapshot — devuelve estructura del plan del atleta
-- ============================================================================
CREATE OR REPLACE FUNCTION coach_plan_snapshot(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_session coach_sessions%ROWTYPE;
  v_result  JSONB;
BEGIN
  v_session := _coach_validate_session(p_token, 'plan:edit');

  SELECT jsonb_build_object(
    'athlete_id',           v_session.athlete_id,
    'athlete_name',         COALESCE(up.display_name, p.full_name, 'Atleta'),
    'avatar_url',           p.avatar_url,
    'training_frequency',   p.training_frequency,
    'training_routine_names', COALESCE(p.training_routine_names, '{}'::jsonb),
    'training_session_names', COALESCE(p.training_session_names, '[]'::jsonb),
    'external_schedule',    COALESCE(up.external_schedule, '{}'::jsonb),
    'training_mode',        up.training_mode,
    'dual_session_enabled', up.dual_session_enabled,
    'training_program',     up.training_program
  ) INTO v_result
  FROM profiles p
  LEFT JOIN user_profiles up ON up.user_id = p.id
  WHERE p.id = v_session.athlete_id
  LIMIT 1;

  IF v_result IS NULL THEN
    v_result := jsonb_build_object(
      'athlete_id',           v_session.athlete_id,
      'athlete_name',         'Atleta',
      'training_frequency',   NULL,
      'training_routine_names', '{}'::jsonb,
      'external_schedule',    '{}'::jsonb
    );
  END IF;

  RETURN v_result;
END;
$$;

-- ============================================================================
-- RPC: coach_set_routine_names — actualiza profiles.training_routine_names
-- p_names: JSONB { "0": "PECHO", "1": "PIERNA", ... }
-- ============================================================================
CREATE OR REPLACE FUNCTION coach_set_routine_names(
  p_token  TEXT,
  p_names  JSONB
) RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_session coach_sessions%ROWTYPE;
BEGIN
  v_session := _coach_validate_session(p_token, 'plan:edit');

  IF p_names IS NULL OR jsonb_typeof(p_names) <> 'object' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD' USING ERRCODE = '22023';
  END IF;

  UPDATE profiles
     SET training_routine_names = p_names,
         updated_at = NOW()
   WHERE id = v_session.athlete_id;

  -- Sincronizar también external_schedule por compatibilidad
  -- ({"Día 1": "PECHO", ...} a partir de {"0": "PECHO", ...})
  UPDATE user_profiles
     SET external_schedule = (
       SELECT jsonb_object_agg('Día ' || ((key::int) + 1)::text, value)
         FROM jsonb_each_text(p_names)
     ),
         updated_at = NOW()
   WHERE user_id = v_session.athlete_id;

  INSERT INTO coach_audit_log (session_token, athlete_id, coach_name, action, payload)
  VALUES (p_token, v_session.athlete_id, v_session.coach_name,
          'plan.routine_names_updated', p_names);

  RETURN true;
END;
$$;

-- ============================================================================
-- RPC: coach_set_training_frequency — días/semana
-- ============================================================================
CREATE OR REPLACE FUNCTION coach_set_training_frequency(
  p_token      TEXT,
  p_frequency  INT
) RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_session coach_sessions%ROWTYPE;
BEGIN
  v_session := _coach_validate_session(p_token, 'plan:edit');

  IF p_frequency < 1 OR p_frequency > 7 THEN
    RAISE EXCEPTION 'INVALID_FREQUENCY' USING ERRCODE = '22023';
  END IF;

  UPDATE profiles
     SET training_frequency = p_frequency,
         updated_at = NOW()
   WHERE id = v_session.athlete_id;

  INSERT INTO coach_audit_log (session_token, athlete_id, coach_name, action, payload)
  VALUES (p_token, v_session.athlete_id, v_session.coach_name,
          'plan.frequency_updated',
          jsonb_build_object('frequency', p_frequency));

  RETURN true;
END;
$$;

-- ============================================================================
-- RPC: coach_set_session_names — nombres por sesión
-- ============================================================================
CREATE OR REPLACE FUNCTION coach_set_session_names(
  p_token  TEXT,
  p_names  JSONB
) RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_session coach_sessions%ROWTYPE;
BEGIN
  v_session := _coach_validate_session(p_token, 'plan:edit');

  IF p_names IS NULL OR jsonb_typeof(p_names) NOT IN ('array', 'object') THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD' USING ERRCODE = '22023';
  END IF;

  UPDATE profiles
     SET training_session_names = p_names,
         updated_at = NOW()
   WHERE id = v_session.athlete_id;

  INSERT INTO coach_audit_log (session_token, athlete_id, coach_name, action, payload)
  VALUES (p_token, v_session.athlete_id, v_session.coach_name,
          'plan.session_names_updated', p_names);

  RETURN true;
END;
$$;

-- ============================================================================
-- GRANTS
-- ============================================================================
GRANT EXECUTE ON FUNCTION coach_plan_snapshot(TEXT)                    TO anon, authenticated;
GRANT EXECUTE ON FUNCTION coach_set_routine_names(TEXT, JSONB)         TO anon, authenticated;
GRANT EXECUTE ON FUNCTION coach_set_training_frequency(TEXT, INT)      TO anon, authenticated;
GRANT EXECUTE ON FUNCTION coach_set_session_names(TEXT, JSONB)         TO anon, authenticated;
