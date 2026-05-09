-- ============================================================================
-- SHOP LANDING BANNERS
-- Carrusel de flyers horizontales en shop.trens.app (arriba de categorías)
-- Cada banner tiene una imagen y un enlace personalizado (interno o externo)
-- ============================================================================

CREATE TABLE IF NOT EXISTS shop_landing_banners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT,
  image_url TEXT NOT NULL,
  link_url TEXT,
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shop_landing_banners_active
  ON shop_landing_banners(is_active, sort_order);

DROP TRIGGER IF EXISTS trg_shop_landing_banners_updated ON shop_landing_banners;
CREATE TRIGGER trg_shop_landing_banners_updated BEFORE UPDATE ON shop_landing_banners
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS
ALTER TABLE shop_landing_banners ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "shop_landing_banners_public_read" ON shop_landing_banners;
CREATE POLICY "shop_landing_banners_public_read" ON shop_landing_banners
  FOR SELECT USING (is_active = TRUE);

DROP POLICY IF EXISTS "shop_landing_banners_admin_all" ON shop_landing_banners;
CREATE POLICY "shop_landing_banners_admin_all" ON shop_landing_banners
  FOR ALL USING (
    EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid())
  );

GRANT SELECT ON shop_landing_banners TO anon, authenticated;
GRANT ALL ON shop_landing_banners TO service_role;
