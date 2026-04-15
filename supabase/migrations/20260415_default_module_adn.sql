-- ============================================================================
-- MIGRACIÓN: Cambiar default_module de 'feed' a 'adn'
-- Nuevos usuarios (por suscripción o asignación desde admin) ahora
-- arrancan con el módulo ADN como pantalla principal.
-- El usuario puede cambiarlo en su perfil cuando quiera.
-- ============================================================================

ALTER TABLE public.user_profiles
  ALTER COLUMN default_module SET DEFAULT 'adn';
