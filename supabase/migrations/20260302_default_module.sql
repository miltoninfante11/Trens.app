-- ============================================================================
-- MIGRACIÓN: Agregar columna default_module a user_profiles
-- Permite al usuario elegir qué módulo se abre al iniciar la app:
--   'feed' = TRENS (Feed de videos)
--   'adn'  = ADN (Perfil atlético)
-- Default: 'feed' (comportamiento actual)
-- ============================================================================

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS default_module TEXT NOT NULL DEFAULT 'feed'
  CHECK (default_module IN ('feed', 'adn'));
