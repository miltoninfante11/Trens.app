-- ============================================================================
-- COACH SCOPE FIX — plan:edit implica plan:read
-- Las sesiones existentes solo tienen 'plan:edit' pero las RPCs de list
-- piden 'plan:read'. Esto provoca SCOPE_DENIED al entrar a las pestañas.
-- ============================================================================

CREATE OR REPLACE FUNCTION public._coach_validate_session(
  p_token  TEXT,
  p_scope  TEXT
) RETURNS coach_sessions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_session coach_sessions%ROWTYPE;
  v_ok BOOLEAN;
BEGIN
  SELECT * INTO v_session FROM coach_sessions WHERE token = p_token LIMIT 1;
  IF v_session.token IS NULL OR v_session.closed_at IS NOT NULL
     OR v_session.expires_at <= NOW() THEN
    RAISE EXCEPTION 'SESSION_INVALID' USING ERRCODE = '28000';
  END IF;

  -- Resolver scope: plan:edit implica plan:read y plan
  v_ok := p_scope = ANY(v_session.scopes)
       OR (p_scope IN ('plan:read','plan') AND 'plan:edit' = ANY(v_session.scopes));

  IF NOT v_ok THEN
    RAISE EXCEPTION 'SCOPE_DENIED' USING ERRCODE = '42501';
  END IF;

  UPDATE coach_sessions SET last_seen_at = NOW() WHERE token = p_token;
  RETURN v_session;
END;
$$;

REVOKE EXECUTE ON FUNCTION public._coach_validate_session(TEXT, TEXT) FROM PUBLIC;

-- Asegurar que sesiones e invites futuros incluyan ambos scopes
UPDATE public.coach_sessions
   SET scopes = ARRAY(SELECT DISTINCT unnest(scopes || ARRAY['plan:read']))
 WHERE 'plan:edit' = ANY(scopes) AND NOT ('plan:read' = ANY(scopes));

UPDATE public.coach_invites
   SET scopes = ARRAY(SELECT DISTINCT unnest(scopes || ARRAY['plan:read']))
 WHERE 'plan:edit' = ANY(scopes) AND NOT ('plan:read' = ANY(scopes));
