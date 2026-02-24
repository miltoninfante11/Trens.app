-- ============================================================================
-- INSTAGRAM SYNC SYSTEM
-- Tablas para sincronización de Reels de Instagram al feed TRENS
-- ============================================================================

-- 1. user_integrations: Tokens OAuth de usuarios vinculados con Instagram
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.user_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'instagram',
  ig_user_id TEXT,
  ig_username TEXT,
  access_token TEXT NOT NULL,
  token_expires_at TIMESTAMPTZ NOT NULL,
  scopes TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  -- Un usuario solo puede tener una integración por provider
  UNIQUE(user_id, provider)
);

-- Índices para búsquedas rápidas
CREATE INDEX IF NOT EXISTS idx_user_integrations_user_id ON public.user_integrations(user_id);
CREATE INDEX IF NOT EXISTS idx_user_integrations_provider ON public.user_integrations(provider);
CREATE INDEX IF NOT EXISTS idx_user_integrations_expires ON public.user_integrations(token_expires_at);

-- RLS: Solo el usuario puede ver/editar sus propias integraciones
ALTER TABLE public.user_integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own integrations"
  ON public.user_integrations FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own integrations"
  ON public.user_integrations FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own integrations"
  ON public.user_integrations FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own integrations"
  ON public.user_integrations FOR DELETE
  USING (auth.uid() = user_id);

-- Service role bypass (para Edge Functions / cron jobs)
CREATE POLICY "Service role full access on integrations"
  ON public.user_integrations FOR ALL
  USING (auth.jwt()->>'role' = 'service_role');

-- 2. trens_feed: Posts/Reels sincronizados desde Instagram
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.trens_feed (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ig_media_id TEXT NOT NULL UNIQUE,
  ig_permalink TEXT,
  video_url TEXT NOT NULL,
  thumbnail_url TEXT,
  caption TEXT,
  hashtags TEXT[] DEFAULT '{}',
  is_official BOOLEAN DEFAULT false,
  media_type TEXT DEFAULT 'VIDEO',
  ig_timestamp TIMESTAMPTZ,
  sync_source TEXT DEFAULT 'manual', -- 'cron', 'manual', 'oauth_sync'
  like_count INTEGER DEFAULT 0,
  comment_count INTEGER DEFAULT 0,
  view_count INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Índices para el feed
CREATE INDEX IF NOT EXISTS idx_trens_feed_user_id ON public.trens_feed(user_id);
CREATE INDEX IF NOT EXISTS idx_trens_feed_official ON public.trens_feed(is_official);
CREATE INDEX IF NOT EXISTS idx_trens_feed_active ON public.trens_feed(is_active);
CREATE INDEX IF NOT EXISTS idx_trens_feed_created ON public.trens_feed(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_trens_feed_ig_media ON public.trens_feed(ig_media_id);
CREATE INDEX IF NOT EXISTS idx_trens_feed_hashtags ON public.trens_feed USING GIN(hashtags);

-- RLS: Feed público para lectura, escritura restringida
ALTER TABLE public.trens_feed ENABLE ROW LEVEL SECURITY;

-- Todos los usuarios autenticados pueden ver el feed activo
CREATE POLICY "Authenticated users can view active feed"
  ON public.trens_feed FOR SELECT
  USING (auth.role() = 'authenticated' AND is_active = true);

-- Usuarios solo pueden insertar sus propios posts
CREATE POLICY "Users can insert own feed items"
  ON public.trens_feed FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Usuarios pueden actualizar solo sus posts
CREATE POLICY "Users can update own feed items"
  ON public.trens_feed FOR UPDATE
  USING (auth.uid() = user_id);

-- Service role bypass (para cron jobs y sync oficial)
CREATE POLICY "Service role full access on feed"
  ON public.trens_feed FOR ALL
  USING (auth.jwt()->>'role' = 'service_role');

-- 3. Trigger para updated_at automático
-- ============================================================================
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para user_integrations
DROP TRIGGER IF EXISTS set_updated_at_user_integrations ON public.user_integrations;
CREATE TRIGGER set_updated_at_user_integrations
  BEFORE UPDATE ON public.user_integrations
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Trigger para trens_feed
DROP TRIGGER IF EXISTS set_updated_at_trens_feed ON public.trens_feed;
CREATE TRIGGER set_updated_at_trens_feed
  BEFORE UPDATE ON public.trens_feed
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- 4. Comentarios descriptivos
-- ============================================================================
COMMENT ON TABLE public.user_integrations IS 'Tokens OAuth de integraciones externas (Instagram, etc.)';
COMMENT ON TABLE public.trens_feed IS 'Feed de Reels sincronizados desde Instagram';
COMMENT ON COLUMN public.trens_feed.is_official IS 'true = cuenta oficial de TRENS, false = usuario de comunidad';
COMMENT ON COLUMN public.trens_feed.sync_source IS 'Origen de la sincronización: cron, manual, oauth_sync';
COMMENT ON COLUMN public.trens_feed.hashtags IS 'Array de hashtags extraídos del caption para filtrado';
