-- ============================================================================
-- PLAN_NOTES - Agregar tipos de notas: pizarra, entrenamiento, nutricion
-- Ejecutar en SQL Editor de Supabase
-- ============================================================================

-- Agregar columna note_type con default 'pizarra' (migra datos existentes)
ALTER TABLE public.plan_notes ADD COLUMN IF NOT EXISTS note_type TEXT DEFAULT 'pizarra';

-- Eliminar constraint anterior de usuario único
ALTER TABLE public.plan_notes DROP CONSTRAINT IF EXISTS plan_notes_user_unique;

-- Crear nuevo constraint: un registro por usuario + tipo
ALTER TABLE public.plan_notes ADD CONSTRAINT plan_notes_user_type_unique UNIQUE (user_id, note_type);

-- ============================================================================
