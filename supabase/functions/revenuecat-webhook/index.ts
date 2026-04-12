// ============================================================================
// REVENUECAT WEBHOOK - Supabase Edge Function
// Recibe notificaciones de RevenueCat sobre eventos de suscripción IAP.
// Sincroniza el estado PRO del usuario en user_roles.
//
// Configurar en RevenueCat Dashboard → Integrations → Webhooks:
//   URL: https://<project-ref>.supabase.co/functions/v1/revenuecat-webhook
//   Authorization: Bearer <REVENUECAT_WEBHOOK_SECRET>
// ============================================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const REVENUECAT_WEBHOOK_SECRET = Deno.env.get('REVENUECAT_WEBHOOK_SECRET') || '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

// Grace period: 16 days (Apple standard) before downgrading
const GRACE_PERIOD_DAYS = 16;

// ============================================================================
// TYPES
// ============================================================================

interface RevenueCatEvent {
  type: string;
  app_user_id: string;
  original_app_user_id: string;
  product_id: string;
  entitlement_ids: string[];
  period_type: string; // NORMAL, TRIAL, INTRO
  purchased_at_ms: number;
  expiration_at_ms: number | null;
  environment: string; // SANDBOX or PRODUCTION
  store: string; // APP_STORE, PLAY_STORE
  is_family_share: boolean;
  presented_offering_id: string | null;
  price_in_purchased_currency: number;
  currency: string;
  takehome_percentage: number;
}

interface RevenueCatWebhookPayload {
  api_version: string;
  event: RevenueCatEvent;
}

// ============================================================================
// EVENT HANDLERS
// ============================================================================

type EventType =
  | 'INITIAL_PURCHASE'
  | 'RENEWAL'
  | 'CANCELLATION'
  | 'UNCANCELLATION'
  | 'NON_RENEWING_PURCHASE'
  | 'SUBSCRIPTION_PAUSED'
  | 'SUBSCRIPTION_EXTENDED'
  | 'BILLING_ISSUE'
  | 'PRODUCT_CHANGE'
  | 'EXPIRATION'
  | 'TRANSFER';

async function handleEvent(
  supabase: any,
  event: RevenueCatEvent,
  eventType: EventType
): Promise<{ status: number; message: string }> {
  const userId = event.app_user_id;
  const isProEntitlement = event.entitlement_ids?.includes('trens_pro');

  console.log(`📦 RevenueCat Event: ${eventType}`, {
    userId,
    product: event.product_id,
    store: event.store,
    environment: event.environment,
    entitlements: event.entitlement_ids,
  });

  // Skip sandbox events in production (optional — keep for testing)
  // if (event.environment === 'SANDBOX') {
  //   return { status: 200, message: 'Sandbox event ignored' };
  // }

  if (!userId) {
    return { status: 400, message: 'No app_user_id provided' };
  }

  // Check if user exists
  const { data: userRole } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', userId)
    .maybeSingle();

  // Never downgrade admin/ceo
  if (userRole?.role === 'admin' || userRole?.role === 'ceo') {
    return { status: 200, message: 'Admin/CEO user — no role change' };
  }

  switch (eventType) {
    case 'INITIAL_PURCHASE':
    case 'RENEWAL':
    case 'UNCANCELLATION':
    case 'SUBSCRIPTION_EXTENDED': {
      // Activate PRO
      if (isProEntitlement) {
        await supabase.from('user_roles').upsert(
          {
            user_id: userId,
            role: 'pro',
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id' }
        );

        console.log(`✅ User ${userId} upgraded to PRO via ${event.store}`);
      }
      return { status: 200, message: `PRO activated for ${userId}` };
    }

    case 'EXPIRATION': {
      // Only downgrade if no OpenPay subscription is active
      const { data: openpaySub } = await supabase
        .from('subscriptions')
        .select('status')
        .eq('user_id', userId)
        .in('status', ['active', 'past_due'])
        .maybeSingle();

      if (openpaySub) {
        console.log(`⚠️ User ${userId} expired IAP but has active OpenPay — keeping PRO`);
        return { status: 200, message: 'OpenPay still active — no downgrade' };
      }

      await supabase
        .from('user_roles')
        .update({
          role: 'free',
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId);

      console.log(`⬇️ User ${userId} downgraded to FREE (IAP expired)`);
      return { status: 200, message: `Downgraded ${userId} to free` };
    }

    case 'CANCELLATION': {
      // User cancelled but subscription might still be active until expiration
      // Don't downgrade immediately — wait for EXPIRATION event
      console.log(
        `ℹ️ User ${userId} cancelled — will expire at ${
          event.expiration_at_ms ? new Date(event.expiration_at_ms).toISOString() : 'unknown'
        }`
      );
      return { status: 200, message: `Cancellation noted for ${userId}` };
    }

    case 'BILLING_ISSUE': {
      // Don't downgrade immediately — grace period
      const graceExpiry = new Date();
      graceExpiry.setDate(graceExpiry.getDate() + GRACE_PERIOD_DAYS);

      console.log(
        `⚠️ Billing issue for ${userId} — grace period until ${graceExpiry.toISOString()}`
      );
      return {
        status: 200,
        message: `Billing issue noted — grace period until ${graceExpiry.toISOString()}`,
      };
    }

    case 'TRANSFER': {
      // User transferred to a different app user ID
      console.log(`🔄 Transfer event for ${userId}`);
      return { status: 200, message: `Transfer noted for ${userId}` };
    }

    default: {
      console.log(`❓ Unhandled event type: ${eventType} for ${userId}`);
      return { status: 200, message: `Unhandled event: ${eventType}` };
    }
  }
}

// ============================================================================
// SERVE
// ============================================================================

serve(async (req: Request) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Verify authorization
    const authHeader = req.headers.get('authorization') || '';
    const token = authHeader.replace('Bearer ', '');

    if (REVENUECAT_WEBHOOK_SECRET && token !== REVENUECAT_WEBHOOK_SECRET) {
      console.error('❌ Unauthorized webhook request');
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const payload: RevenueCatWebhookPayload = await req.json();
    const { event } = payload;

    if (!event || !event.type) {
      return new Response(JSON.stringify({ error: 'Invalid payload — no event' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Init Supabase admin client
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const result = await handleEvent(supabase, event, event.type as EventType);

    return new Response(JSON.stringify({ success: true, message: result.message }), {
      status: result.status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error('❌ RevenueCat webhook error:', err);
    return new Response(JSON.stringify({ error: err.message || 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
