-- ============================================================================
-- COACH PLAN NOTES — RPCs para que el coach edite las 3 notas del usuario
-- (pizarra, entrenamiento, nutricion) en la tabla plan_notes.
-- ============================================================================

-- coach_get_plan_notes — devuelve las 3 notas del atleta
CREATE OR REPLACE FUNCTION public.coach_get_plan_notes(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  v_session coach_sessions%ROWTYPE;
  v_notes JSONB;
BEGIN
  v_session := public._coach_validate_session(p_token, 'plan:read');
  SELECT COALESCE(
    jsonb_object_agg(note_type, jsonb_build_object(
      'content', COALESCE(content, ''),
      'updated_at', updated_at
    )),
    '{}'::jsonb
  )
    INTO v_notes
    FROM plan_notes
   WHERE user_id = v_session.athlete_id;
  RETURN jsonb_build_object('success', true, 'notes', v_notes);
END;
$fn$;
REVOKE ALL ON FUNCTION public.coach_get_plan_notes(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.coach_get_plan_notes(TEXT) TO anon, authenticated;

-- coach_set_plan_note — upsert una nota por tipo
CREATE OR REPLACE FUNCTION public.coach_set_plan_note(
  p_token TEXT,
  p_note_type TEXT,
  p_content TEXT
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  v_session coach_sessions%ROWTYPE;
  v_clean TEXT;
BEGIN
  v_session := public._coach_validate_session(p_token, 'plan:edit');

  IF p_note_type NOT IN ('pizarra','entrenamiento','nutricion') THEN
    RAISE EXCEPTION 'INVALID_NOTE_TYPE' USING ERRCODE = '22023';
  END IF;

  v_clean := COALESCE(p_content, '');
  IF LENGTH(v_clean) > 5000 THEN
    RAISE EXCEPTION 'NOTE_TOO_LONG' USING ERRCODE = '22001';
  END IF;

  INSERT INTO plan_notes (user_id, note_type, content, created_at, updated_at)
  VALUES (v_session.athlete_id, p_note_type, v_clean, NOW(), NOW())
  ON CONFLICT (user_id, note_type) DO UPDATE SET
    content    = EXCLUDED.content,
    updated_at = NOW();

  INSERT INTO coach_audit_log (session_token, athlete_id, coach_name, action, payload)
  VALUES (p_token, v_session.athlete_id, v_session.coach_name, 'set_plan_note',
          jsonb_build_object('note_type', p_note_type, 'length', LENGTH(v_clean)));

  RETURN jsonb_build_object('success', true);
END;
$fn$;
REVOKE ALL ON FUNCTION public.coach_set_plan_note(TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.coach_set_plan_note(TEXT, TEXT, TEXT) TO anon, authenticated;
