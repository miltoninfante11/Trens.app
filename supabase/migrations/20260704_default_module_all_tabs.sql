-- ============================================================================
-- MIGRACIÓN: ampliar módulos por defecto permitidos a los 5 tabs principales
-- Valores permitidos en user_profiles.default_module:
--   'feed' | 'adn' | 'pro' | 'plan' | 'gym'
-- ============================================================================

ALTER TABLE public.user_profiles
  DROP CONSTRAINT IF EXISTS user_profiles_default_module_check;

ALTER TABLE public.user_profiles
  ADD CONSTRAINT user_profiles_default_module_check
  CHECK (default_module IN ('feed', 'adn', 'pro', 'plan', 'gym'));
