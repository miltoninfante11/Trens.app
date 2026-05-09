-- ============================================================================
-- COACH ACCESS — MODO RÁPIDO (Guest Coach Session)
-- ============================================================================
-- El atleta genera un código de invitación con:
--   - nombre del coach (lo escribe el atleta)
--   - duración: 1h o 3h
--   - máximo: 1 invitación por día (UTC)
-- El coach ingresa el código (sin necesidad de cuenta TRENS) y obtiene un
-- token de sesión scoped que le permite editar el plan del atleta hasta
-- que expire o el atleta lo revoque.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- TABLA: coach_invites — códigos de invitación generados por el atleta
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS coach_invites (
  code            TEXT PRIMARY KEY,
  athlete_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  coach_name      TEXT NOT NULL,
  duration_hours  INT NOT NULL CHECK (duration_hours IN (1, 3)),
  scopes          TEXT[] NOT NULL DEFAULT ARRAY['plan:edit'],
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at      TIMESTAMPTZ NOT NULL,
  used_at         TIMESTAMPTZ,
  revoked_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_coach_invites_athlete
  ON coach_invites(athlete_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_coach_invites_active
  ON coach_invites(athlete_id, expires_at)
  WHERE revoked_at IS NULL;

-- ----------------------------------------------------------------------------
-- TABLA: coach_sessions — sesiones activas (token = bearer)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS coach_sessions (
  token           TEXT PRIMARY KEY,
  invite_code     TEXT NOT NULL REFERENCES coach_invites(code) ON DELETE CASCADE,
  athlete_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  coach_name      TEXT NOT NULL,
  scopes          TEXT[] NOT NULL,
  device_fp       TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at      TIMESTAMPTZ NOT NULL,
  last_seen_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at       TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_coach_sessions_athlete
  ON coach_sessions(athlete_id, expires_at DESC);

-- ----------------------------------------------------------------------------
-- TABLA: coach_audit_log — auditoría inmutable
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS coach_audit_log (
  id              BIGSERIAL PRIMARY KEY,
  session_token   TEXT,
  athlete_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  coach_name      TEXT NOT NULL,
  action          TEXT NOT NULL,
  payload         JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_coach_audit_athlete
  ON coach_audit_log(athlete_id, created_at DESC);

-- ============================================================================
-- RLS
-- ============================================================================
ALTER TABLE coach_invites    ENABLE ROW LEVEL SECURITY;
ALTER TABLE coach_sessions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE coach_audit_log  ENABLE ROW LEVEL SECURITY;

-- El atleta dueño puede ver sus propias invitaciones / sesiones / logs
CREATE POLICY "athlete_reads_own_invites" ON coach_invites
  FOR SELECT USING (athlete_id = auth.uid());

CREATE POLICY "athlete_reads_own_sessions" ON coach_sessions
  FOR SELECT USING (athlete_id = auth.uid());

CREATE POLICY "athlete_reads_own_audit" ON coach_audit_log
  FOR SELECT USING (athlete_id = auth.uid());

-- Toda escritura va por RPCs SECURITY DEFINER (no policies de INSERT/UPDATE)

-- ============================================================================
-- HELPER: generador de códigos legibles (base32 sin 0/O/1/I)
-- ============================================================================
CREATE OR REPLACE FUNCTION _coach_generate_code() RETURNS TEXT
LANGUAGE plpgsql AS $$
DECLARE
  chars  TEXT := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  raw    TEXT := '';
  i      INT;
BEGIN
  FOR i IN 1..8 LOOP
    raw := raw || substr(chars, floor(random() * length(chars))::int + 1, 1);
  END LOOP;
  RETURN substr(raw, 1, 4) || '-' || substr(raw, 5, 4);
END;
$$;

-- ============================================================================
-- RPC: coach_invite_create — el atleta genera invitación
--   - max 1 por día (cuenta de creaciones, no de uso)
--   - duration_hours debe ser 1 o 3
-- ============================================================================
CREATE OR REPLACE FUNCTION coach_invite_create(
  p_coach_name      TEXT,
  p_duration_hours  INT
) RETURNS TABLE (
  code         TEXT,
  coach_name   TEXT,
  expires_at   TIMESTAMPTZ,
  duration_hours INT
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_athlete UUID := auth.uid();
  v_code    TEXT;
  v_today   INT;
  v_clean   TEXT;
BEGIN
  IF v_athlete IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = '28000';
  END IF;

  IF p_duration_hours NOT IN (1, 3) THEN
    RAISE EXCEPTION 'INVALID_DURATION' USING ERRCODE = '22023';
  END IF;

  v_clean := trim(coalesce(p_coach_name, ''));
  IF length(v_clean) < 2 OR length(v_clean) > 60 THEN
    RAISE EXCEPTION 'INVALID_NAME' USING ERRCODE = '22023';
  END IF;

  -- Límite: 1 invitación por día UTC (aunque la anterior haya sido revocada)
  SELECT COUNT(*) INTO v_today
  FROM coach_invites
  WHERE athlete_id = v_athlete
    AND created_at >= date_trunc('day', NOW() AT TIME ZONE 'UTC');

  IF v_today >= 1 THEN
    RAISE EXCEPTION 'DAILY_LIMIT_REACHED' USING ERRCODE = '23505';
  END IF;

  -- Generar código único
  LOOP
    v_code := _coach_generate_code();
    EXIT WHEN NOT EXISTS (SELECT 1 FROM coach_invites WHERE coach_invites.code = v_code);
  END LOOP;

  INSERT INTO coach_invites (code, athlete_id, coach_name, duration_hours, expires_at)
  VALUES (
    v_code,
    v_athlete,
    v_clean,
    p_duration_hours,
    NOW() + (p_duration_hours || ' hours')::interval
  );

  -- Audit
  INSERT INTO coach_audit_log (athlete_id, coach_name, action, payload)
  VALUES (v_athlete, v_clean, 'invite.created',
          jsonb_build_object('code', v_code, 'duration_hours', p_duration_hours));

  code           := v_code;
  coach_name     := v_clean;
  expires_at     := NOW() + (p_duration_hours || ' hours')::interval;
  duration_hours := p_duration_hours;
  RETURN NEXT;
END;
$$;

-- ============================================================================
-- RPC: coach_invite_active — devuelve la invitación viva del atleta (si hay)
-- ============================================================================
CREATE OR REPLACE FUNCTION coach_invite_active()
RETURNS TABLE (
  code         TEXT,
  coach_name   TEXT,
  created_at   TIMESTAMPTZ,
  expires_at   TIMESTAMPTZ,
  duration_hours INT,
  used_at      TIMESTAMPTZ,
  has_session  BOOLEAN
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_athlete UUID := auth.uid();
BEGIN
  IF v_athlete IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = '28000';
  END IF;

  RETURN QUERY
  SELECT
    i.code,
    i.coach_name,
    i.created_at,
    i.expires_at,
    i.duration_hours,
    i.used_at,
    EXISTS (
      SELECT 1 FROM coach_sessions s
      WHERE s.invite_code = i.code
        AND s.expires_at > NOW()
        AND s.closed_at IS NULL
    ) AS has_session
  FROM coach_invites i
  WHERE i.athlete_id = v_athlete
    AND i.revoked_at IS NULL
    AND i.expires_at > NOW()
  ORDER BY i.created_at DESC
  LIMIT 1;
END;
$$;

-- ============================================================================
-- RPC: coach_invite_revoke — el atleta revoca su invitación + sesiones
-- ============================================================================
CREATE OR REPLACE FUNCTION coach_invite_revoke(p_code TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_athlete UUID := auth.uid();
  v_name    TEXT;
BEGIN
  IF v_athlete IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = '28000';
  END IF;

  UPDATE coach_invites
     SET revoked_at = NOW()
   WHERE code = p_code
     AND athlete_id = v_athlete
     AND revoked_at IS NULL
  RETURNING coach_name INTO v_name;

  IF v_name IS NULL THEN
    RETURN false;
  END IF;

  UPDATE coach_sessions
     SET closed_at = NOW(),
         expires_at = LEAST(expires_at, NOW())
   WHERE invite_code = p_code
     AND closed_at IS NULL;

  INSERT INTO coach_audit_log (athlete_id, coach_name, action, payload)
  VALUES (v_athlete, v_name, 'invite.revoked',
          jsonb_build_object('code', p_code));

  RETURN true;
END;
$$;

-- ============================================================================
-- RPC PUBLIC: coach_session_open — el coach valida el código y abre sesión
-- ============================================================================
CREATE OR REPLACE FUNCTION coach_session_open(
  p_code      TEXT,
  p_device_fp TEXT
) RETURNS TABLE (
  token         TEXT,
  athlete_id    UUID,
  athlete_name  TEXT,
  coach_name    TEXT,
  scopes        TEXT[],
  expires_at    TIMESTAMPTZ
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_invite   coach_invites%ROWTYPE;
  v_token    TEXT;
  v_aname    TEXT;
BEGIN
  -- Normaliza código (quita espacios, mayúsculas, asegura formato XXXX-XXXX)
  p_code := upper(regexp_replace(coalesce(p_code, ''), '[^A-Z0-9]', '', 'g'));
  IF length(p_code) <> 8 THEN
    RAISE EXCEPTION 'INVALID_CODE' USING ERRCODE = '22023';
  END IF;
  p_code := substr(p_code, 1, 4) || '-' || substr(p_code, 5, 4);

  SELECT * INTO v_invite
  FROM coach_invites
  WHERE code = p_code
  LIMIT 1;

  IF v_invite.code IS NULL THEN
    RAISE EXCEPTION 'CODE_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  IF v_invite.revoked_at IS NOT NULL THEN
    RAISE EXCEPTION 'CODE_REVOKED' USING ERRCODE = '22023';
  END IF;

  IF v_invite.expires_at <= NOW() THEN
    RAISE EXCEPTION 'CODE_EXPIRED' USING ERRCODE = '22008';
  END IF;

  -- Si ya hay sesión activa para este invite, devolver la misma (idempotente)
  SELECT s.token INTO v_token
  FROM coach_sessions s
  WHERE s.invite_code = v_invite.code
    AND s.expires_at > NOW()
    AND s.closed_at IS NULL
  LIMIT 1;

  IF v_token IS NULL THEN
    v_token := encode(extensions.gen_random_bytes(32), 'hex');
    INSERT INTO coach_sessions (
      token, invite_code, athlete_id, coach_name, scopes, device_fp, expires_at
    ) VALUES (
      v_token,
      v_invite.code,
      v_invite.athlete_id,
      v_invite.coach_name,
      v_invite.scopes,
      p_device_fp,
      v_invite.expires_at
    );

    -- Marca invite como usado (no bloquea reintentos del mismo dispositivo)
    UPDATE coach_invites SET used_at = COALESCE(used_at, NOW())
    WHERE code = v_invite.code;
  END IF;

  -- Nombre público del atleta (best-effort)
  SELECT COALESCE(p.display_name, 'Atleta')
    INTO v_aname
    FROM user_profiles p
   WHERE p.user_id = v_invite.athlete_id
   LIMIT 1;

  INSERT INTO coach_audit_log (session_token, athlete_id, coach_name, action, payload)
  VALUES (v_token, v_invite.athlete_id, v_invite.coach_name, 'session.opened',
          jsonb_build_object('code', v_invite.code, 'device_fp', p_device_fp));

  token        := v_token;
  athlete_id   := v_invite.athlete_id;
  athlete_name := COALESCE(v_aname, 'Atleta');
  coach_name   := v_invite.coach_name;
  scopes       := v_invite.scopes;
  expires_at   := v_invite.expires_at;
  RETURN NEXT;
END;
$$;

-- ============================================================================
-- RPC PUBLIC: coach_session_get — el coach refresca info de su sesión
-- ============================================================================
CREATE OR REPLACE FUNCTION coach_session_get(p_token TEXT)
RETURNS TABLE (
  athlete_id    UUID,
  athlete_name  TEXT,
  coach_name    TEXT,
  scopes        TEXT[],
  expires_at    TIMESTAMPTZ,
  closed_at     TIMESTAMPTZ
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_session coach_sessions%ROWTYPE;
BEGIN
  SELECT * INTO v_session FROM coach_sessions WHERE token = p_token LIMIT 1;
  IF v_session.token IS NULL THEN
    RAISE EXCEPTION 'SESSION_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  UPDATE coach_sessions SET last_seen_at = NOW() WHERE token = p_token;

  athlete_id := v_session.athlete_id;
  SELECT COALESCE(p.display_name, 'Atleta')
    INTO athlete_name FROM profiles p WHERE p.user_id = v_session.athlete_id LIMIT 1;
  athlete_name := COALESCE(athlete_name, 'Atleta');
  coach_name := v_session.coach_name;
  scopes     := v_session.scopes;
  expires_at := v_session.expires_at;
  closed_at  := v_session.closed_at;
  RETURN NEXT;
END;
$$;

-- ============================================================================
-- RPC PUBLIC: coach_session_close — el coach termina su sesión voluntariamente
-- ============================================================================
CREATE OR REPLACE FUNCTION coach_session_close(p_token TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_athlete UUID;
  v_name    TEXT;
BEGIN
  UPDATE coach_sessions
     SET closed_at = NOW()
   WHERE token = p_token
     AND closed_at IS NULL
  RETURNING athlete_id, coach_name INTO v_athlete, v_name;

  IF v_athlete IS NULL THEN RETURN false; END IF;

  INSERT INTO coach_audit_log (session_token, athlete_id, coach_name, action, payload)
  VALUES (p_token, v_athlete, v_name, 'session.closed', '{}'::jsonb);
  RETURN true;
END;
$$;

-- ============================================================================
-- HOOK FUTURO: coach_apply_plan_patch — el coach edita el plan del atleta
-- (validación de token + scope, aplica patch a user_profiles)
-- Se deja como SECURITY DEFINER listo para ser invocado desde el cliente.
-- Implementación expansible cuando se conecte plan/index.tsx.
-- ============================================================================
CREATE OR REPLACE FUNCTION coach_apply_plan_patch(
  p_token  TEXT,
  p_patch  JSONB
) RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_session coach_sessions%ROWTYPE;
BEGIN
  SELECT * INTO v_session FROM coach_sessions WHERE token = p_token LIMIT 1;

  IF v_session.token IS NULL OR v_session.closed_at IS NOT NULL
     OR v_session.expires_at <= NOW() THEN
    RAISE EXCEPTION 'SESSION_INVALID' USING ERRCODE = '28000';
  END IF;

  IF NOT ('plan:edit' = ANY(v_session.scopes)) THEN
    RAISE EXCEPTION 'SCOPE_DENIED' USING ERRCODE = '42501';
  END IF;

  -- Patch directo a user_profiles (campos permitidos)
  UPDATE user_profiles
     SET
       training_program  = COALESCE(p_patch->'training_program',  training_program),
       external_schedule = COALESCE(p_patch->'external_schedule', external_schedule),
       updated_at        = NOW()
   WHERE user_id = v_session.athlete_id;

  INSERT INTO coach_audit_log (session_token, athlete_id, coach_name, action, payload)
  VALUES (p_token, v_session.athlete_id, v_session.coach_name, 'plan.patched', p_patch);

  UPDATE coach_sessions SET last_seen_at = NOW() WHERE token = p_token;
  RETURN true;
END;
$$;

-- ============================================================================
-- GRANTS
-- ============================================================================
GRANT SELECT ON coach_invites, coach_sessions, coach_audit_log TO authenticated;
GRANT ALL    ON coach_invites, coach_sessions, coach_audit_log TO service_role;

GRANT EXECUTE ON FUNCTION coach_invite_create(TEXT, INT)         TO authenticated;
GRANT EXECUTE ON FUNCTION coach_invite_active()                   TO authenticated;
GRANT EXECUTE ON FUNCTION coach_invite_revoke(TEXT)               TO authenticated;
GRANT EXECUTE ON FUNCTION coach_session_open(TEXT, TEXT)          TO anon, authenticated;
GRANT EXECUTE ON FUNCTION coach_session_get(TEXT)                 TO anon, authenticated;
GRANT EXECUTE ON FUNCTION coach_session_close(TEXT)               TO anon, authenticated;
GRANT EXECUTE ON FUNCTION coach_apply_plan_patch(TEXT, JSONB)     TO anon, authenticated;

-- Limpieza opcional (cron futuro): purgar sesiones expiradas > 30 días
-- DELETE FROM coach_sessions WHERE expires_at < NOW() - INTERVAL '30 days';
