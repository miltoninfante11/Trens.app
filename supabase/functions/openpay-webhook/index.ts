// ============================================================================
// OPENPAY WEBHOOK - Supabase Edge Function
// Recibe notificaciones de Openpay sobre eventos de suscripción
// ============================================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Configuración de Openpay (desde variables de entorno)
const OPENPAY_PRIVATE_KEY = Deno.env.get('OPENPAY_PRIVATE_KEY') || '';
const OPENPAY_MERCHANT_ID = Deno.env.get('OPENPAY_MERCHANT_ID') || '';
const OPENPAY_PLAN_ID = Deno.env.get('OPENPAY_PLAN_ID') || 'pr6jao0vinkuqcqmkl4p';
const OPENPAY_API_URL = 'https://api.openpay.pe/v1';

const openpayAuth = () => `Basic ${btoa(OPENPAY_PRIVATE_KEY + ':')}`;

// Helper: llamada a OpenPay API
async function openpayFetch(
  path: string,
  options: RequestInit = {}
): Promise<{ ok: boolean; status: number; data: any }> {
  const url = `${OPENPAY_API_URL}/${OPENPAY_MERCHANT_ID}${path}`;
  console.log(`🔗 OpenPay ${options.method || 'GET'}: ${url}`);

  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: openpayAuth(),
      ...(options.headers || {}),
    },
  });

  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }

  return { ok: response.ok, status: response.status, data };
}

// Tipos de eventos de Openpay
type OpenpayEventType =
  | 'charge.succeeded'
  | 'charge.failed'
  | 'charge.refunded'
  | 'charge.cancelled'
  | 'subscription.charge.succeeded'
  | 'subscription.charge.failed'
  | 'subscription.cancelled'
  | 'payout.created'
  | 'payout.succeeded'
  | 'payout.failed';

interface OpenpayWebhookEvent {
  type: OpenpayEventType;
  event_date: string;
  transaction: {
    id: string;
    authorization: string;
    operation_type: string;
    method: string;
    transaction_type: string;
    status: string;
    currency: string;
    amount: number;
    description: string;
    customer_id: string;
    order_id?: string;
    error_message?: string;
    subscription?: {
      id: string;
      plan_id: string;
      status: string;
      current_period_end_date: string;
    };
  };
}

serve(async (req) => {
  const url = new URL(req.url);

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // ================================================================
    // LOG TODO PARA DEBUG
    // ================================================================
    console.log('📥 WEBHOOK REQUEST:', {
      method: req.method,
      url: req.url,
      headers: Object.fromEntries(req.headers.entries()),
    });

    // Verificar si hay código en query params
    const allParams = Object.fromEntries(url.searchParams.entries());
    console.log('📥 Query params:', allParams);

    // Buscar cualquier parámetro que parezca un código
    const verificationCode =
      url.searchParams.get('verification_code') ||
      url.searchParams.get('code') ||
      url.searchParams.get('verify') ||
      url.searchParams.get('token');

    if (verificationCode) {
      console.log('🔐 Returning verification code from params:', verificationCode);
      return new Response(verificationCode, {
        status: 200,
        headers: { 'Content-Type': 'text/plain' },
      });
    }

    // GET sin código - endpoint activo
    if (req.method === 'GET') {
      // Si hay algún param, devolverlo (por si es el código)
      const firstParam = url.searchParams.keys().next().value;
      if (firstParam) {
        const value = url.searchParams.get(firstParam);
        console.log('🔐 Returning first param as code:', firstParam, '=', value);
        return new Response(value || firstParam, {
          status: 200,
          headers: { 'Content-Type': 'text/plain' },
        });
      }
      return new Response('OK', {
        status: 200,
        headers: { 'Content-Type': 'text/plain' },
      });
    }

    // POST: Leer el body
    if (req.method === 'POST') {
      const body = await req.text();
      console.log('📥 POST body:', body);

      // Si el body es corto y no es JSON, es probablemente el código
      if (body && body.length < 100 && !body.startsWith('{')) {
        console.log('🔐 Returning POST body as code:', body.trim());
        return new Response(body.trim(), {
          status: 200,
          headers: { 'Content-Type': 'text/plain' },
        });
      }

      // Si es JSON
      if (body.startsWith('{')) {
        const event = JSON.parse(body);
        console.log('📥 JSON event keys:', Object.keys(event));

        // Buscar cualquier campo que parezca código de verificación
        // Openpay envía: {"type":"verification","verification_code":"XXX",...}
        if (event.verification_code) {
          const code = String(event.verification_code).trim();
          console.log('🔐 Returning verification_code:', code, 'Length:', code.length);
          // Responder EXACTAMENTE con el código, sin nada extra
          return new Response(code, {
            status: 200,
            headers: {
              'Content-Type': 'text/plain; charset=utf-8',
              'Content-Length': String(code.length),
              ...corsHeaders,
            },
          });
        }

        // Si tiene type (y no es verificación), es un evento normal
        if (event.type && event.type !== 'verification') {
          console.log('📥 Openpay event type:', event.type);

          // Crear cliente de Supabase con service role
          const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
          const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
          const supabase = createClient(supabaseUrl, supabaseServiceKey);

          // Procesar según el tipo de evento
          switch (event.type) {
            // ================================================================
            // CARGO DE SUSCRIPCIÓN EXITOSO
            // ================================================================
            case 'subscription.charge.succeeded': {
              const { customer_id, subscription } = event.transaction;

              if (subscription) {
                // Actualizar estado de suscripción
                const { error } = await supabase
                  .from('subscriptions')
                  .update({
                    status: 'active',
                    current_period_end: subscription.current_period_end_date,
                    updated_at: new Date().toISOString(),
                  })
                  .eq('openpay_customer_id', customer_id);

                if (error) {
                  console.error('Error updating subscription:', error);
                } else {
                  console.log('✅ Subscription renewed:', customer_id);
                }

                // Reactivar rol PRO del usuario
                const { data: sub, error: subErr } = await supabase
                  .from('subscriptions')
                  .select('user_id')
                  .eq('openpay_customer_id', customer_id)
                  .single();

                if (!sub && !subErr) {
                  console.warn('⚠️ ORPHAN EVENT: No subscription found for customer_id:', customer_id);
                }

                if (sub?.user_id) {
                  await supabase
                    .from('user_roles')
                    .update({ role: 'pro', updated_at: new Date().toISOString() })
                    .eq('user_id', sub.user_id);
                  console.log('✅ User role reactivated to PRO:', sub.user_id);
                }
              }
              break;
            }

            // ================================================================
            // CARGO DE SUSCRIPCIÓN FALLIDO → RETRY CON TARJETAS ALTERNATIVAS
            // ================================================================
            case 'subscription.charge.failed': {
              const { customer_id, error_message } = event.transaction;

              console.log(`❌ Subscription charge failed for ${customer_id}: ${error_message}`);

              // Marcar como past_due (pago pendiente)
              await supabase
                .from('subscriptions')
                .update({
                  status: 'past_due',
                  updated_at: new Date().toISOString(),
                })
                .eq('openpay_customer_id', customer_id);

              // ---- RETRY LOGIC: intentar con tarjetas alternativas ----
              const { data: sub } = await supabase
                .from('subscriptions')
                .select('*')
                .eq('openpay_customer_id', customer_id)
                .single();

              if (!sub) {
                console.log('⚠️ No subscription found for retry');
                break;
              }

              // Obtener todas las tarjetas del usuario
              const { data: allCards } = await supabase
                .from('customer_cards')
                .select('*')
                .eq('user_id', sub.user_id)
                .eq('allows_charges', true)
                .order('is_default', { ascending: false });

              // Filtrar la tarjeta que falló Y solo usar tarjetas del mismo customer
              const failedCardId = sub.openpay_card_id;
              const alternativeCards = (allCards || []).filter(
                (c: any) => c.openpay_card_id !== failedCardId && c.openpay_customer_id === customer_id
              );

              if (alternativeCards.length === 0) {
                console.log('⚠️ No alternative cards for retry, user must update payment');
                break;
              }

              console.log(`🔄 Retrying with ${alternativeCards.length} alternative card(s)`);

              let retrySuccess = false;
              for (const card of alternativeCards) {
                console.log(`🔄 Trying: ${card.brand} ****${card.last4}`);

                const newSubResult = await openpayFetch(`/customers/${customer_id}/subscriptions`, {
                  method: 'POST',
                  body: JSON.stringify({
                    plan_id: OPENPAY_PLAN_ID,
                    source_id: card.openpay_card_id,
                  }),
                });

                if (newSubResult.ok) {
                  console.log(`✅ Retry succeeded with ****${card.last4}`);

                  // Cancelar suscripción vieja
                  await openpayFetch(
                    `/customers/${customer_id}/subscriptions/${sub.openpay_subscription_id}`,
                    { method: 'DELETE' }
                  ).catch(() => {});

                  const newSub = newSubResult.data;

                  // Actualizar DB
                  await supabase
                    .from('subscriptions')
                    .update({
                      openpay_subscription_id: newSub.id,
                      openpay_card_id: card.openpay_card_id,
                      openpay_card_last4: card.last4,
                      openpay_card_brand: card.brand,
                      status: 'active',
                      current_period_end: newSub.period_end_date || newSub.current_period_end_date,
                      updated_at: new Date().toISOString(),
                    })
                    .eq('user_id', sub.user_id);

                  // Actualizar default card
                  await supabase
                    .from('customer_cards')
                    .update({ is_default: false })
                    .eq('user_id', sub.user_id);
                  await supabase
                    .from('customer_cards')
                    .update({ is_default: true })
                    .eq('openpay_card_id', card.openpay_card_id);

                  // Mantener rol PRO
                  await supabase
                    .from('user_roles')
                    .update({ role: 'pro', updated_at: new Date().toISOString() })
                    .eq('user_id', sub.user_id);

                  retrySuccess = true;
                  break;
                } else {
                  console.log(`❌ Card ****${card.last4} also failed`);
                }
              }

              if (!retrySuccess) {
                console.log('❌ All cards failed. User must update payment method.');
              }
              break;
            }

            // ================================================================
            // SUSCRIPCIÓN CANCELADA
            // ================================================================
            case 'subscription.cancelled': {
              const { customer_id } = event.transaction;

              const { error } = await supabase
                .from('subscriptions')
                .update({
                  status: 'cancelled',
                  cancelled_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                })
                .eq('openpay_customer_id', customer_id);

              if (error) {
                console.error('Error updating subscription:', error);
              } else {
                console.log('🚫 Subscription cancelled:', customer_id);
              }
              break;
            }

            // ================================================================
            // CARGO ÚNICO EXITOSO (también puede ser reintento de suscripción)
            // ================================================================
            case 'charge.succeeded': {
              const { id: chargeId, customer_id, description } = event.transaction;
              console.log('💳 Charge succeeded:', chargeId, description);

              // Detectar si es un cargo de suscripción por la descripción
              if (
                customer_id &&
                description &&
                description.toLowerCase().includes('subscription')
              ) {
                console.log('🔄 Detected subscription charge, reactivating PRO...');

                // Buscar suscripción del customer
                const { data: sub } = await supabase
                  .from('subscriptions')
                  .select('user_id, status')
                  .eq('openpay_customer_id', customer_id)
                  .single();

                if (sub) {
                  // Reactivar suscripción
                  await supabase
                    .from('subscriptions')
                    .update({
                      status: 'active',
                      updated_at: new Date().toISOString(),
                    })
                    .eq('openpay_customer_id', customer_id);

                  // Reactivar rol PRO
                  await supabase
                    .from('user_roles')
                    .update({ role: 'pro', updated_at: new Date().toISOString() })
                    .eq('user_id', sub.user_id);

                  console.log('✅ Subscription reactivated via charge.succeeded:', sub.user_id);
                }
              }
              break;
            }

            // ================================================================
            // CARGO FALLIDO (también puede ser reintento de suscripción)
            // ================================================================
            case 'charge.failed': {
              const { id: chargeId, customer_id, description, error_message } = event.transaction;
              console.log('❌ Charge failed:', chargeId, error_message);

              // Detectar si es un cargo de suscripción por la descripción
              if (
                customer_id &&
                description &&
                description.toLowerCase().includes('subscription')
              ) {
                console.log('🔄 Detected subscription charge failure, marking past_due...');

                await supabase
                  .from('subscriptions')
                  .update({
                    status: 'past_due',
                    updated_at: new Date().toISOString(),
                  })
                  .eq('openpay_customer_id', customer_id);
              }
              break;
            }

            // ================================================================
            // REEMBOLSO
            // ================================================================
            case 'charge.refunded': {
              const { customer_id } = event.transaction;

              const { error } = await supabase
                .from('subscriptions')
                .update({
                  status: 'cancelled',
                  cancelled_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                })
                .eq('openpay_customer_id', customer_id);

              if (error) {
                console.error('Error updating subscription:', error);
              } else {
                console.log('💸 Charge refunded, subscription cancelled:', customer_id);
              }
              break;
            }

            default:
              console.log('ℹ️ Unhandled event type:', event.type);
          }

          // Responder OK a Openpay
          return new Response(JSON.stringify({ received: true, type: event.type }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }
    }

    // Método no soportado o request no reconocido
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('❌ Webhook error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
