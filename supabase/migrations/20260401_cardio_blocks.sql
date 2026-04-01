-- ============================================================================
-- CARDIO BLOCKS - Sistema de cardios múltiples por día
-- Soporta N cardios posicionados en el timeline de PLAN
-- ============================================================================

-- Tabla principal de cardio blocks
CREATE TABLE IF NOT EXISTS cardio_blocks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  training_day INTEGER NOT NULL DEFAULT 0,
  scheduled_time TEXT NOT NULL DEFAULT '06:00',
  cardio_type TEXT NOT NULL DEFAULT 'LISS',
  activity TEXT NOT NULL DEFAULT 'Caminadora',
  duration_minutes INTEGER NOT NULL DEFAULT 30,
  intensity TEXT DEFAULT NULL,
  notes TEXT DEFAULT NULL,
  is_fasted BOOLEAN DEFAULT false,
  is_completed BOOLEAN DEFAULT false,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para consultas rápidas
CREATE INDEX IF NOT EXISTS idx_cardio_blocks_user ON cardio_blocks(user_id);
CREATE INDEX IF NOT EXISTS idx_cardio_blocks_user_day ON cardio_blocks(user_id, training_day);

-- RLS
ALTER TABLE cardio_blocks ENABLE ROW LEVEL SECURITY;

-- Policies: usuarios solo ven/editan sus propios cardios
CREATE POLICY "Users can view own cardio blocks"
  ON cardio_blocks FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own cardio blocks"
  ON cardio_blocks FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own cardio blocks"
  ON cardio_blocks FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own cardio blocks"
  ON cardio_blocks FOR DELETE
  USING (auth.uid() = user_id);
