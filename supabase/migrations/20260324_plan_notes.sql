-- ============================================================================
-- PLAN_NOTES - Pizarra de notas del plan
-- Ejecutar en SQL Editor de Supabase
-- ============================================================================

-- Crear tabla plan_notes (una nota por usuario, tipo pizarra)
CREATE TABLE IF NOT EXISTS public.plan_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT plan_notes_user_unique UNIQUE (user_id)
);

-- Índice para búsqueda por usuario
CREATE INDEX IF NOT EXISTS idx_plan_notes_user ON public.plan_notes(user_id);

-- Habilitar RLS
ALTER TABLE public.plan_notes ENABLE ROW LEVEL SECURITY;

-- Políticas de seguridad
DROP POLICY IF EXISTS "plan_notes_select" ON public.plan_notes;
CREATE POLICY "plan_notes_select" ON public.plan_notes FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "plan_notes_insert" ON public.plan_notes;
CREATE POLICY "plan_notes_insert" ON public.plan_notes FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "plan_notes_update" ON public.plan_notes;
CREATE POLICY "plan_notes_update" ON public.plan_notes FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "plan_notes_delete" ON public.plan_notes;
CREATE POLICY "plan_notes_delete" ON public.plan_notes FOR DELETE USING (auth.uid() = user_id);

-- ============================================================================
-- ✅ MIGRACIÓN COMPLETADA
-- ============================================================================
