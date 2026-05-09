-- ============================================================================
-- COACH NOTES UUID FIX
-- En 20260510_coach_extras.sql algunas funciones declaran v_athlete UUID y
-- hacen v_athlete := _coach_validate_session(...). Pero esa función devuelve
-- el row coach_sessions completo, lo que provoca:
--   "invalid input syntax for type uuid: (token,...,...)"
-- Reescribimos las funciones afectadas para extraer athlete_id del row.
-- ============================================================================

-- 1) coach_set_coach_notes
CREATE OR REPLACE FUNCTION public.coach_set_coach_notes(p_token TEXT, p_notes TEXT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  v_session coach_sessions%ROWTYPE;
  v_clean TEXT;
BEGIN
  v_session := public._coach_validate_session(p_token, 'plan:edit');

  v_clean := NULLIF(TRIM(COALESCE(p_notes, '')), '');
  IF v_clean IS NOT NULL AND LENGTH(v_clean) > 2000 THEN
    RAISE EXCEPTION 'NOTES_TOO_LONG';
  END IF;

  INSERT INTO user_profiles (user_id, coach_notes, coach_notes_updated_at, coach_notes_author, updated_at)
  VALUES (v_session.athlete_id, v_clean, NOW(), v_session.coach_name, NOW())
  ON CONFLICT (user_id) DO UPDATE SET
    coach_notes = EXCLUDED.coach_notes,
    coach_notes_updated_at = NOW(),
    coach_notes_author = v_session.coach_name,
    updated_at = NOW();

  INSERT INTO coach_audit_log (session_token, athlete_id, coach_name, action, payload)
  VALUES (p_token, v_session.athlete_id, v_session.coach_name, 'set_coach_notes',
          jsonb_build_object('length', COALESCE(LENGTH(v_clean), 0)));

  RETURN jsonb_build_object('success', true);
END;
$fn$;
REVOKE ALL ON FUNCTION public.coach_set_coach_notes(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.coach_set_coach_notes(TEXT, TEXT) TO anon, authenticated;
