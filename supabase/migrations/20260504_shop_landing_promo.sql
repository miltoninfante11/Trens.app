-- ============================================================================
-- SHOP LANDING PROMO PILL
-- Anuncio flotante fijo en shop.trens.app (parte superior, formato pill)
-- Tabla single-row con title/subtitle/image_url/link_url + is_active.
-- ============================================================================

CREATE TABLE IF NOT EXISTS shop_landing_promo (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT,
  subtitle TEXT,
  image_url TEXT,
  link_url TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_shop_landing_promo_updated ON shop_landing_promo;
CREATE TRIGGER trg_shop_landing_promo_updated BEFORE UPDATE ON shop_landing_promo
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS
ALTER TABLE shop_landing_promo ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "shop_landing_promo_public_read" ON shop_landing_promo;
CREATE POLICY "shop_landing_promo_public_read" ON shop_landing_promo
  FOR SELECT USING (is_active = TRUE);

DROP POLICY IF EXISTS "shop_landing_promo_admin_all" ON shop_landing_promo;
CREATE POLICY "shop_landing_promo_admin_all" ON shop_landing_promo
  FOR ALL USING (
    EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid())
  );

GRANT SELECT ON shop_landing_promo TO anon, authenticated;
GRANT ALL ON shop_landing_promo TO service_role;

-- Seed con texto inicial pedido por el cliente
INSERT INTO shop_landing_promo (title, subtitle, is_active)
SELECT
  '1 MES DE ASESORÍA PROFESIONAL PERSONALIZADA',
  '¡Por tiempo limitado!',
  FALSE
WHERE NOT EXISTS (SELECT 1 FROM shop_landing_promo);
