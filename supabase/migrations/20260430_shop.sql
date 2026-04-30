-- ============================================================================
-- TRENS SHOP - Productos, carrito, órdenes
-- Soporta productos digitales y físicos (envío manual Perú)
-- Pagos: tarjeta (Openpay con tarjeta guardada o nueva) + WhatsApp (Yape/transf)
-- ============================================================================

-- ============================================================================
-- CATEGORÍAS
-- ============================================================================
CREATE TABLE IF NOT EXISTS shop_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT, -- nombre del ícono lucide
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shop_categories_active ON shop_categories(is_active, sort_order);

-- ============================================================================
-- PRODUCTOS
-- ============================================================================
CREATE TABLE IF NOT EXISTS shop_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  short_description TEXT,
  
  -- Pricing (PEN)
  price DECIMAL(10,2) NOT NULL CHECK (price >= 0),
  compare_at_price DECIMAL(10,2), -- precio antes de descuento
  
  -- Inventario
  is_digital BOOLEAN DEFAULT false,
  stock INTEGER DEFAULT 0, -- ignorado si is_digital o stock_unlimited
  stock_unlimited BOOLEAN DEFAULT false,
  
  -- Media
  images JSONB DEFAULT '[]'::jsonb, -- array de URLs R2
  thumbnail_url TEXT,
  
  -- Categorización
  category_id UUID REFERENCES shop_categories(id) ON DELETE SET NULL,
  tags TEXT[] DEFAULT '{}',
  
  -- Estado
  is_active BOOLEAN DEFAULT true,
  is_featured BOOLEAN DEFAULT false,
  sort_order INTEGER DEFAULT 0,
  
  -- Digital delivery (URL de descarga, código, etc)
  digital_payload JSONB, -- {download_url, access_code, instructions...}
  
  -- Envío (físico)
  weight_grams INTEGER, -- para cálculo futuro de envío
  shipping_required BOOLEAN DEFAULT false,
  
  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shop_products_active ON shop_products(is_active, sort_order);
CREATE INDEX IF NOT EXISTS idx_shop_products_category ON shop_products(category_id);
CREATE INDEX IF NOT EXISTS idx_shop_products_featured ON shop_products(is_featured) WHERE is_featured = true;
CREATE INDEX IF NOT EXISTS idx_shop_products_slug ON shop_products(slug);

-- ============================================================================
-- CARRITOS (uno por usuario, persistente)
-- ============================================================================
CREATE TABLE IF NOT EXISTS shop_carts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  -- session_id para guest checkout (se migra al login)
  session_id TEXT UNIQUE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT cart_owner CHECK (user_id IS NOT NULL OR session_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_shop_carts_user ON shop_carts(user_id);
CREATE INDEX IF NOT EXISTS idx_shop_carts_session ON shop_carts(session_id);

CREATE TABLE IF NOT EXISTS shop_cart_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cart_id UUID NOT NULL REFERENCES shop_carts(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES shop_products(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(cart_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_shop_cart_items_cart ON shop_cart_items(cart_id);

-- ============================================================================
-- ÓRDENES
-- ============================================================================
CREATE TABLE IF NOT EXISTS shop_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number TEXT NOT NULL UNIQUE, -- TRENS-XXXXXX visible al usuario
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  
  -- Contacto (también para guest checkout vía WhatsApp)
  email TEXT NOT NULL,
  full_name TEXT NOT NULL,
  phone TEXT,
  
  -- Pricing
  subtotal DECIMAL(10,2) NOT NULL,
  shipping_cost DECIMAL(10,2) DEFAULT 0,
  total DECIMAL(10,2) NOT NULL,
  currency TEXT DEFAULT 'PEN',
  
  -- Pago
  payment_method TEXT NOT NULL CHECK (payment_method IN ('card', 'whatsapp')),
  -- card: charge inmediato vía Openpay
  -- whatsapp: pendiente, usuario coordina por WhatsApp (Yape, transferencia)
  
  -- Openpay (solo si payment_method='card')
  openpay_charge_id TEXT,
  openpay_card_id TEXT, -- tarjeta usada (saved card)
  card_last4 TEXT,
  card_brand TEXT,
  
  -- Estados
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending',      -- creada, esperando pago / coordinación
    'paid',         -- pago confirmado
    'preparing',    -- preparando envío
    'shipped',      -- en camino
    'delivered',    -- entregada
    'cancelled',    -- cancelada
    'refunded'      -- reembolsada
  )),
  
  -- Envío físico
  shipping_required BOOLEAN DEFAULT false,
  shipping_address JSONB, -- {street, district, city, region, reference, postal_code}
  tracking_code TEXT,
  shipping_carrier TEXT,
  
  -- Notas
  customer_notes TEXT,
  admin_notes TEXT,
  
  -- Timestamps de estado
  paid_at TIMESTAMPTZ,
  shipped_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shop_orders_user ON shop_orders(user_id);
CREATE INDEX IF NOT EXISTS idx_shop_orders_status ON shop_orders(status);
CREATE INDEX IF NOT EXISTS idx_shop_orders_created ON shop_orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_shop_orders_email ON shop_orders(email);

-- ============================================================================
-- ITEMS DE ORDEN (snapshot del producto al momento de comprar)
-- ============================================================================
CREATE TABLE IF NOT EXISTS shop_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES shop_orders(id) ON DELETE CASCADE,
  product_id UUID REFERENCES shop_products(id) ON DELETE SET NULL,
  
  -- Snapshot
  product_name TEXT NOT NULL,
  product_slug TEXT,
  thumbnail_url TEXT,
  unit_price DECIMAL(10,2) NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  subtotal DECIMAL(10,2) NOT NULL,
  is_digital BOOLEAN DEFAULT false,
  digital_payload JSONB, -- entregado al pago confirmado
  
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shop_order_items_order ON shop_order_items(order_id);

-- ============================================================================
-- TRIGGERS updated_at
-- ============================================================================
CREATE OR REPLACE FUNCTION shop_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_shop_categories_updated ON shop_categories;
CREATE TRIGGER trg_shop_categories_updated BEFORE UPDATE ON shop_categories
  FOR EACH ROW EXECUTE FUNCTION shop_set_updated_at();

DROP TRIGGER IF EXISTS trg_shop_products_updated ON shop_products;
CREATE TRIGGER trg_shop_products_updated BEFORE UPDATE ON shop_products
  FOR EACH ROW EXECUTE FUNCTION shop_set_updated_at();

DROP TRIGGER IF EXISTS trg_shop_carts_updated ON shop_carts;
CREATE TRIGGER trg_shop_carts_updated BEFORE UPDATE ON shop_carts
  FOR EACH ROW EXECUTE FUNCTION shop_set_updated_at();

DROP TRIGGER IF EXISTS trg_shop_cart_items_updated ON shop_cart_items;
CREATE TRIGGER trg_shop_cart_items_updated BEFORE UPDATE ON shop_cart_items
  FOR EACH ROW EXECUTE FUNCTION shop_set_updated_at();

DROP TRIGGER IF EXISTS trg_shop_orders_updated ON shop_orders;
CREATE TRIGGER trg_shop_orders_updated BEFORE UPDATE ON shop_orders
  FOR EACH ROW EXECUTE FUNCTION shop_set_updated_at();

-- ============================================================================
-- GENERADOR DE ORDER_NUMBER (TRENS-XXXXXX)
-- ============================================================================
CREATE OR REPLACE FUNCTION generate_shop_order_number()
RETURNS TRIGGER AS $$
DECLARE
  new_number TEXT;
  attempts INTEGER := 0;
BEGIN
  IF NEW.order_number IS NULL OR NEW.order_number = '' THEN
    LOOP
      new_number := 'TRENS-' || lpad((floor(random() * 1000000))::text, 6, '0');
      EXIT WHEN NOT EXISTS (SELECT 1 FROM shop_orders WHERE order_number = new_number);
      attempts := attempts + 1;
      IF attempts > 10 THEN
        new_number := 'TRENS-' || extract(epoch FROM now())::bigint;
        EXIT;
      END IF;
    END LOOP;
    NEW.order_number := new_number;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_shop_orders_number ON shop_orders;
CREATE TRIGGER trg_shop_orders_number BEFORE INSERT ON shop_orders
  FOR EACH ROW EXECUTE FUNCTION generate_shop_order_number();

-- ============================================================================
-- RLS POLICIES
-- ============================================================================

-- CATEGORIES: lectura pública de activas, escritura solo admin
ALTER TABLE shop_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "shop_categories_public_read" ON shop_categories;
CREATE POLICY "shop_categories_public_read" ON shop_categories
  FOR SELECT USING (is_active = true);

DROP POLICY IF EXISTS "shop_categories_admin_all" ON shop_categories;
CREATE POLICY "shop_categories_admin_all" ON shop_categories
  FOR ALL USING (
    auth.role() = 'service_role' OR
    EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid())
  );

-- PRODUCTS: lectura pública de activos, escritura solo admin
ALTER TABLE shop_products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "shop_products_public_read" ON shop_products;
CREATE POLICY "shop_products_public_read" ON shop_products
  FOR SELECT USING (is_active = true);

DROP POLICY IF EXISTS "shop_products_admin_read_all" ON shop_products;
CREATE POLICY "shop_products_admin_read_all" ON shop_products
  FOR SELECT USING (
    auth.role() = 'service_role' OR
    EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "shop_products_admin_write" ON shop_products;
CREATE POLICY "shop_products_admin_write" ON shop_products
  FOR ALL USING (
    auth.role() = 'service_role' OR
    EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid())
  );

-- CARTS: solo el dueño o service_role
ALTER TABLE shop_carts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "shop_carts_own" ON shop_carts;
CREATE POLICY "shop_carts_own" ON shop_carts
  FOR ALL USING (
    auth.role() = 'service_role' OR
    user_id = auth.uid()
  );

ALTER TABLE shop_cart_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "shop_cart_items_own" ON shop_cart_items;
CREATE POLICY "shop_cart_items_own" ON shop_cart_items
  FOR ALL USING (
    auth.role() = 'service_role' OR
    EXISTS (
      SELECT 1 FROM shop_carts c
      WHERE c.id = shop_cart_items.cart_id AND c.user_id = auth.uid()
    )
  );

-- ORDERS: el dueño puede ver las suyas; admin todas; escritura solo via service_role
ALTER TABLE shop_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "shop_orders_own_read" ON shop_orders;
CREATE POLICY "shop_orders_own_read" ON shop_orders
  FOR SELECT USING (
    auth.role() = 'service_role' OR
    user_id = auth.uid() OR
    EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "shop_orders_admin_write" ON shop_orders;
CREATE POLICY "shop_orders_admin_write" ON shop_orders
  FOR ALL USING (
    auth.role() = 'service_role' OR
    EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid())
  );

ALTER TABLE shop_order_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "shop_order_items_own_read" ON shop_order_items;
CREATE POLICY "shop_order_items_own_read" ON shop_order_items
  FOR SELECT USING (
    auth.role() = 'service_role' OR
    EXISTS (
      SELECT 1 FROM shop_orders o
      WHERE o.id = shop_order_items.order_id
        AND (o.user_id = auth.uid() OR EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid()))
    )
  );

DROP POLICY IF EXISTS "shop_order_items_admin_write" ON shop_order_items;
CREATE POLICY "shop_order_items_admin_write" ON shop_order_items
  FOR ALL USING (
    auth.role() = 'service_role' OR
    EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid())
  );

-- ============================================================================
-- GRANTS
-- ============================================================================
GRANT SELECT ON shop_categories TO anon, authenticated;
GRANT SELECT ON shop_products TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON shop_carts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON shop_cart_items TO authenticated;
GRANT SELECT ON shop_orders TO authenticated;
GRANT SELECT ON shop_order_items TO authenticated;

GRANT ALL ON shop_categories, shop_products, shop_carts, shop_cart_items, shop_orders, shop_order_items TO service_role;

-- ============================================================================
-- SEED DATA - Categorías iniciales
-- ============================================================================
INSERT INTO shop_categories (slug, name, description, icon, sort_order) VALUES
  ('apparel', 'Ropa TRENS', 'Polos, hoodies y accesorios oficiales', 'Shirt', 1),
  ('supplements', 'Suplementos', 'Proteínas, creatina y suplementación', 'Pill', 2),
  ('equipment', 'Equipamiento', 'Accesorios para entrenar', 'Dumbbell', 3),
  ('digital', 'Programas Digitales', 'Planes, ebooks y contenido descargable', 'FileDown', 4)
ON CONFLICT (slug) DO NOTHING;
