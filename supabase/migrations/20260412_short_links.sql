-- ============================================================================
-- TRENS SHORT LINKS SYSTEM
-- Tabla para gestionar enlaces cortos y redirecciones
-- Soporta: rutas (trens.app/asesoria) y subdominios (asesoria.trens.app)
-- ============================================================================

-- Tabla principal de enlaces cortos
CREATE TABLE IF NOT EXISTS short_links (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  destination_url TEXT NOT NULL,
  link_type TEXT NOT NULL DEFAULT 'path' CHECK (link_type IN ('path', 'subdomain')),
  label TEXT, -- Nombre descriptivo para el admin
  is_active BOOLEAN NOT NULL DEFAULT true,
  clicks INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índice para búsqueda rápida por slug (el worker lo usa)
CREATE INDEX IF NOT EXISTS idx_short_links_slug ON short_links (slug) WHERE is_active = true;

-- Índice para búsqueda por tipo
CREATE INDEX IF NOT EXISTS idx_short_links_type ON short_links (link_type);

-- Función para actualizar updated_at
CREATE OR REPLACE FUNCTION update_short_links_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_short_links_updated_at
  BEFORE UPDATE ON short_links
  FOR EACH ROW
  EXECUTE FUNCTION update_short_links_updated_at();

-- Función RPC para incrementar clicks (llamada desde el Worker)
CREATE OR REPLACE FUNCTION increment_link_clicks(link_slug TEXT)
RETURNS VOID AS $$
BEGIN
  UPDATE short_links SET clicks = clicks + 1 WHERE slug = link_slug AND is_active = true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- RLS POLICIES
-- ============================================================================
ALTER TABLE short_links ENABLE ROW LEVEL SECURITY;

-- Lectura pública (el worker necesita leer sin auth)
CREATE POLICY "short_links_public_read"
  ON short_links FOR SELECT
  USING (true);

-- Solo admins pueden insertar/actualizar/eliminar
CREATE POLICY "short_links_admin_insert"
  ON short_links FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE user_id = auth.uid() AND role IN ('ceo', 'admin')
    )
  );

CREATE POLICY "short_links_admin_update"
  ON short_links FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE user_id = auth.uid() AND role IN ('ceo', 'admin')
    )
  );

CREATE POLICY "short_links_admin_delete"
  ON short_links FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE user_id = auth.uid() AND role IN ('ceo', 'admin')
    )
  );

-- Permitir al service_role llamar increment_link_clicks
GRANT EXECUTE ON FUNCTION increment_link_clicks(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION increment_link_clicks(TEXT) TO authenticated;

-- ============================================================================
-- DATOS INICIALES (slugs reservados)
-- Estos slugs NO se pueden usar porque son rutas de la app
-- ============================================================================
COMMENT ON TABLE short_links IS 'Slugs reservados (no usar): app, adn, gym, pro, feed, plan, admin, profile, terms, privacy, contact, pago-exitoso, spotify-callback, instagram-callback';
