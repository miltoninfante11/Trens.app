-- Add optional cost_price field to products (admin-only visibility)
ALTER TABLE shop_products ADD COLUMN IF NOT EXISTS cost_price NUMERIC(10, 2);
COMMENT ON COLUMN shop_products.cost_price IS 'Costo de adquisición/producción del producto. Solo visible para admins, usado para cálculo de margen y finanzas.';
