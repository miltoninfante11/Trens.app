-- ============================================================================
-- SUPPLEMENT_STACK ↔ SHOP_PRODUCTS LINK
-- Permite vincular un compuesto del Stack del usuario con un producto real
-- de la tienda, habilitando:
--   • Filtro "MI STACK" en el modal de tienda
--   • CTA "COMPRAR" inline en la timeline del plan
--   • Bundle discount al comprar todo el Stack (3+ productos = -10%)
-- El campo es OPCIONAL: el usuario puede seguir creando compuestos manuales
-- con texto libre (ej. "Creatina genérica") sin productId.
-- ============================================================================

ALTER TABLE public.supplement_stack
  ADD COLUMN IF NOT EXISTS product_id UUID
  REFERENCES public.shop_products(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_supplement_stack_product
  ON public.supplement_stack(product_id)
  WHERE product_id IS NOT NULL;

COMMENT ON COLUMN public.supplement_stack.product_id IS
  'FK opcional a shop_products. Si está seteado, el compuesto está vinculado a un producto real de la tienda TRENS y aparece en el filtro MI STACK del shop.';

-- ============================================================================
-- ✅ MIGRACIÓN COMPLETADA
-- ============================================================================
