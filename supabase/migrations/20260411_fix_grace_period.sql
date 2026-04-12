-- ============================================================================
-- FIX: Grace period for past_due subscriptions
-- Don't degrade user immediately on billing failure.
-- Only degrade on 'cancelled' or 'expired'.
-- 'past_due' keeps PRO access during grace period (16 days Apple, 30 days Google).
-- ============================================================================

CREATE OR REPLACE FUNCTION sync_subscription_to_role()
RETURNS TRIGGER AS $$
DECLARE
  current_role TEXT;
BEGIN
  -- Get current role
  SELECT role INTO current_role
  FROM user_roles
  WHERE user_id = NEW.user_id;

  -- Never downgrade admin/ceo
  IF current_role IN ('admin', 'ceo') THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'active' OR NEW.status = 'trialing' THEN
    -- Activate PRO
    UPDATE user_roles 
    SET role = 'pro', updated_at = now()
    WHERE user_id = NEW.user_id;
    
    -- Create if not exists
    IF NOT FOUND THEN
      INSERT INTO user_roles (user_id, role)
      VALUES (NEW.user_id, 'pro')
      ON CONFLICT (user_id) DO UPDATE SET role = 'pro', updated_at = now();
    END IF;

  ELSIF NEW.status = 'past_due' THEN
    -- GRACE PERIOD: Keep PRO access during billing retry.
    -- RevenueCat webhook or scheduled job will handle final expiration.
    -- Do NOT downgrade here.
    NULL;

  ELSIF NEW.status IN ('cancelled', 'expired') THEN
    -- Check if user has any OTHER active subscription (IAP or OpenPay)
    -- before downgrading
    IF NOT EXISTS (
      SELECT 1 FROM subscriptions
      WHERE user_id = NEW.user_id
        AND id != NEW.id
        AND status IN ('active', 'trialing', 'past_due')
    ) THEN
      UPDATE user_roles 
      SET role = 'free', updated_at = now()
      WHERE user_id = NEW.user_id;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add 'expired' and 'trialing' to status check constraint if exists
DO $$
BEGIN
  -- Try to drop existing constraint
  ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS subscriptions_status_check;
  
  -- Add updated constraint with all valid statuses
  ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_status_check
    CHECK (status IN ('active', 'trialing', 'past_due', 'cancelled', 'expired'));
EXCEPTION
  WHEN OTHERS THEN
    -- If constraint doesn't exist or can't be modified, that's OK
    NULL;
END $$;
