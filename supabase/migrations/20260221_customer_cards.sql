-- ============================================================================
-- CUSTOMER CARDS TABLE - Tarjetas guardadas de clientes OpenPay
-- Para futuros cobros (mini tienda, upgrades, cargos adicionales)
-- ============================================================================

-- Tabla de tarjetas guardadas
CREATE TABLE IF NOT EXISTS customer_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- OpenPay references
  openpay_customer_id TEXT NOT NULL,
  openpay_card_id TEXT NOT NULL,
  
  -- Card display info (no datos sensibles)
  last4 TEXT NOT NULL,
  brand TEXT NOT NULL DEFAULT 'unknown', -- visa, mastercard, amex, etc
  type TEXT DEFAULT 'credit', -- credit, debit
  holder_name TEXT NOT NULL,
  expiration_month TEXT NOT NULL,
  expiration_year TEXT NOT NULL,
  
  -- Flags
  is_default BOOLEAN DEFAULT false,
  allows_charges BOOLEAN DEFAULT true,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  -- Una tarjeta por card_id de OpenPay
  UNIQUE(openpay_card_id)
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_customer_cards_user_id ON customer_cards(user_id);
CREATE INDEX IF NOT EXISTS idx_customer_cards_openpay_customer ON customer_cards(openpay_customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_cards_default ON customer_cards(user_id, is_default) WHERE is_default = true;

-- Trigger updated_at
CREATE OR REPLACE FUNCTION update_customer_cards_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_customer_cards_updated_at ON customer_cards;
CREATE TRIGGER trigger_customer_cards_updated_at
  BEFORE UPDATE ON customer_cards
  FOR EACH ROW
  EXECUTE FUNCTION update_customer_cards_updated_at();

-- ============================================================================
-- TRIGGER: Solo una tarjeta default por usuario
-- Cuando se marca una como default, las demás se desmarcan
-- ============================================================================
CREATE OR REPLACE FUNCTION ensure_single_default_card()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_default = true THEN
    UPDATE customer_cards
    SET is_default = false, updated_at = now()
    WHERE user_id = NEW.user_id
      AND id != NEW.id
      AND is_default = true;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_single_default_card ON customer_cards;
CREATE TRIGGER trigger_single_default_card
  AFTER INSERT OR UPDATE OF is_default ON customer_cards
  FOR EACH ROW
  WHEN (NEW.is_default = true)
  EXECUTE FUNCTION ensure_single_default_card();

-- ============================================================================
-- RLS Policies
-- ============================================================================
ALTER TABLE customer_cards ENABLE ROW LEVEL SECURITY;

-- Los usuarios solo pueden ver sus propias tarjetas
CREATE POLICY "Users can view own cards"
  ON customer_cards FOR SELECT
  USING (auth.uid() = user_id);

-- Solo service role puede insertar/actualizar/eliminar
CREATE POLICY "Service role can manage cards"
  ON customer_cards FOR ALL
  USING (auth.role() = 'service_role');

-- ============================================================================
-- Agregar openpay_card_id a subscriptions si no existe
-- Para vincular qué tarjeta se usó en la suscripción
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'subscriptions' AND column_name = 'openpay_card_id'
  ) THEN
    ALTER TABLE subscriptions ADD COLUMN openpay_card_id TEXT;
  END IF;
END $$;

-- ============================================================================
-- GRANT PERMISOS
-- ============================================================================
GRANT SELECT ON customer_cards TO authenticated;
GRANT ALL ON customer_cards TO service_role;
