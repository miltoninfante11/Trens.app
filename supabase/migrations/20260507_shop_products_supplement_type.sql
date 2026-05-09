-- ============================================================================
-- TRENS SHOP — supplement_type
-- Tipo de suplemento (oral, inyectable, polvo, líquido) para productos de la
-- categoría "Suplementos". Solo aplica cuando el producto pertenece a esa
-- categoría; nullable para el resto. Se reusa el mismo dominio que en
-- supplement_stack.type para que MI STACK pueda auto-rellenar el tipo al
-- vincular un producto.
-- ============================================================================

ALTER TABLE shop_products
  ADD COLUMN IF NOT EXISTS supplement_type TEXT
  CHECK (supplement_type IN ('pill', 'syringe', 'powder', 'liquid'));

COMMENT ON COLUMN shop_products.supplement_type IS
  'Tipo de presentación cuando el producto es un suplemento: pill | syringe | powder | liquid';

CREATE INDEX IF NOT EXISTS idx_shop_products_supplement_type
  ON shop_products(supplement_type)
  WHERE supplement_type IS NOT NULL;
