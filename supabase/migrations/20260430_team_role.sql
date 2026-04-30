-- ============================================================================
-- TEAM ROLE - 30 abr 2026
-- Distingue PROs asignados manualmente por admin (role='team') de los que
-- pagaron suscripción (role='pro'). Ambos tienen los mismos permisos en
-- la app, pero se muestran con badges diferentes.
--
-- Cuando un usuario TEAM paga su suscripción → role pasa a 'pro' y la
-- duración de acceso queda atada a current_period_end de la suscripción.
-- ============================================================================

-- 1) Ajustar el CHECK constraint de user_roles para aceptar 'team'
DO $$
BEGIN
  -- Eliminar check existente (puede tener distintos nombres según versión)
  EXECUTE (
    SELECT 'ALTER TABLE public.user_roles DROP CONSTRAINT IF EXISTS ' || conname
    FROM pg_constraint
    WHERE conrelid = 'public.user_roles'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%role%'
    LIMIT 1
  );
EXCEPTION WHEN OTHERS THEN
  -- Si no había constraint o el SELECT no devolvió nada, seguir
  NULL;
END $$;

-- Agregar nuevo CHECK con 'team' incluido
ALTER TABLE public.user_roles
  ADD CONSTRAINT user_roles_role_check
  CHECK (role IN ('free', 'pro', 'team', 'admin', 'ceo'));

-- 2) Migrar PROs manuales existentes a 'team'
-- Criterio: role='pro' Y (no tiene suscripción activa/past_due)
UPDATE public.user_roles ur
SET role = 'team', updated_at = now()
WHERE ur.role = 'pro'
  AND NOT EXISTS (
    SELECT 1 FROM public.subscriptions s
    WHERE s.user_id = ur.user_id
      AND s.status IN ('active', 'trialing', 'past_due')
  );

-- 3) Reemplazar trigger sync_subscription_to_role
-- - active/trialing → role='pro' (sobrescribe team)
-- - cancelled/expired/unpaid → role='free' (admin/ceo/team protegidos*)
-- (*team protegido aquí solo si la suscripción NUNCA estuvo activa para él)
CREATE OR REPLACE FUNCTION sync_subscription_to_role()
RETURNS TRIGGER AS $$
DECLARE
  current_role TEXT;
BEGIN
  SELECT role INTO current_role
  FROM public.user_roles
  WHERE user_id = NEW.user_id;

  -- Nunca degradar admin/ceo
  IF current_role IN ('admin', 'ceo') THEN
    RETURN NEW;
  END IF;

  IF NEW.status IN ('active', 'trialing') THEN
    -- Activar PRO (cuenta de pago) — sobrescribe team
    INSERT INTO public.user_roles (user_id, role, updated_at)
    VALUES (NEW.user_id, 'pro', now())
    ON CONFLICT (user_id) DO UPDATE
      SET role = 'pro', updated_at = now();

  ELSIF NEW.status = 'past_due' THEN
    -- Periodo de gracia: mantener PRO. NO downgrade.
    NULL;

  ELSIF NEW.status IN ('cancelled', 'expired', 'unpaid') THEN
    -- Solo degradar usuarios que estaban como 'pro' por suscripción.
    -- 'team' (asignado manualmente) no debería existir si llegamos acá,
    -- pero por seguridad lo respetamos.
    IF current_role = 'pro' THEN
      UPDATE public.user_roles
      SET role = 'free', updated_at = now()
      WHERE user_id = NEW.user_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_sync_subscription_to_role ON public.subscriptions;
CREATE TRIGGER trigger_sync_subscription_to_role
  AFTER INSERT OR UPDATE OF status ON public.subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION sync_subscription_to_role();

-- 4) Helper: cuando un usuario team paga → al insertar la suscripción active,
-- el trigger ya lo pasa a 'pro'. La duración la maneja current_period_end
-- de la tabla subscriptions (renovación automática vía webhook openpay).

COMMENT ON FUNCTION sync_subscription_to_role IS
  'Sincroniza role en user_roles según estado de subscriptions. team→pro al activarse pago.';
