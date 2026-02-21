// ============================================================================
// SWAP SUBSCRIPTION CARD - Supabase Edge Function
// Cambia la tarjeta de cobro de una suscripción activa.
// OpenPay PE no soporta update de suscripción, así que el flujo es:
//   1. Crear nueva suscripción con la nueva tarjeta
//   2. Si éxito → cancelar la suscripción anterior en OpenPay
//   3. Actualizar DB con la nueva suscripción
// ============================================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const OPENPAY_PRIVATE_KEY = Deno.env.get('OPENPAY_PRIVATE_KEY') || '';
const OPENPAY_MERCHANT_ID = Deno.env.get('OPENPAY_MERCHANT_ID') || '';
const OPENPAY_PLAN_ID = Deno.env.get('OPENPAY_PLAN_ID') || 'pr6jao0vinkuqcqmkl4p';
const OPENPAY_API_URL = 'https://api.openpay.pe/v1';

const openpayAuth = () => `Basic ${btoa(OPENPAY_PRIVATE_KEY + ':')}`;

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

  if (!response.ok) {
    console.error(`❌ OpenPay error [${response.status}]:`, data);
  }

  return { ok: response.ok, status: response.status, data };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Autenticar usuario
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ success: false, error: 'No autorizado' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const {
      data: { user },
    } = await supabase.auth.getUser(token);

    if (!user) {
      return new Response(JSON.stringify({ success: false, error: 'Token inválido' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { newCardId } = await req.json();
    const userId = user.id;

    if (!newCardId) {
      throw new Error('newCardId es requerido');
    }

    console.log(`🔄 Swap subscription card for user ${userId}, new card: ${newCardId}`);

    // ================================================================
    // 1. OBTENER SUSCRIPCIÓN ACTUAL
    // ================================================================
    const { data: currentSub, error: subError } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'active')
      .single();

    if (subError || !currentSub) {
      throw new Error('No se encontró suscripción activa');
    }

    const customerId = currentSub.openpay_customer_id;
    const oldSubscriptionId = currentSub.openpay_subscription_id;

    console.log(`📋 Current subscription: ${oldSubscriptionId}, customer: ${customerId}`);

    // ================================================================
    // 2. VERIFICAR QUE LA NUEVA TARJETA EXISTE EN EL CUSTOMER
    // ================================================================
    const { data: cardRecord } = await supabase
      .from('customer_cards')
      .select('*')
      .eq('openpay_card_id', newCardId)
      .eq('user_id', userId)
      .single();

    if (!cardRecord) {
      throw new Error('La tarjeta seleccionada no fue encontrada');
    }

    // Verificar en OpenPay que la tarjeta es válida
    const cardCheck = await openpayFetch(`/customers/${customerId}/cards/${newCardId}`);
    if (!cardCheck.ok) {
      throw new Error('La tarjeta no es válida o ha sido eliminada');
    }

    console.log(`✅ Card verified: ${newCardId} (${cardRecord.brand} ****${cardRecord.last4})`);

    // ================================================================
    // 3. CREAR NUEVA SUSCRIPCIÓN CON LA NUEVA TARJETA
    // ================================================================
    const newSubResult = await openpayFetch(`/customers/${customerId}/subscriptions`, {
      method: 'POST',
      body: JSON.stringify({
        plan_id: OPENPAY_PLAN_ID,
        source_id: newCardId,
      }),
    });

    if (!newSubResult.ok) {
      const errorMsg =
        newSubResult.data?.description || 'Error al crear nueva suscripción con la tarjeta';
      throw new Error(errorMsg);
    }

    const newSubscription = newSubResult.data;
    console.log(`✅ New subscription created: ${newSubscription.id}`);

    // ================================================================
    // 4. CANCELAR SUSCRIPCIÓN ANTERIOR EN OPENPAY
    // ================================================================
    const cancelResult = await openpayFetch(
      `/customers/${customerId}/subscriptions/${oldSubscriptionId}`,
      { method: 'DELETE' }
    );

    if (!cancelResult.ok && cancelResult.status !== 404) {
      // Log warning pero no fail — la nueva suscripción ya fue creada
      console.warn(`⚠️ Could not cancel old subscription ${oldSubscriptionId}:`, cancelResult.data);
    } else {
      console.log(`✅ Old subscription cancelled: ${oldSubscriptionId}`);
    }

    // ================================================================
    // 5. ACTUALIZAR BASE DE DATOS
    // ================================================================
    const { error: updateError } = await supabase
      .from('subscriptions')
      .update({
        openpay_subscription_id: newSubscription.id,
        openpay_card_id: newCardId,
        openpay_card_last4: cardRecord.last4,
        openpay_card_brand: cardRecord.brand,
        status: 'active',
        current_period_end:
          newSubscription.period_end_date || newSubscription.current_period_end_date,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId);

    if (updateError) {
      console.error('❌ DB update error:', updateError);
      // No lanzar — la suscripción ya existe en OpenPay
    }

    // Actualizar tarjeta predeterminada
    await supabase
      .from('customer_cards')
      .update({ is_default: false })
      .eq('user_id', userId)
      .neq('openpay_card_id', newCardId);

    await supabase
      .from('customer_cards')
      .update({ is_default: true })
      .eq('user_id', userId)
      .eq('openpay_card_id', newCardId);

    console.log(`🎉 Subscription card swapped successfully for user ${userId}`);

    return new Response(
      JSON.stringify({
        success: true,
        subscriptionId: newSubscription.id,
        cardId: newCardId,
        cardLast4: cardRecord.last4,
        cardBrand: cardRecord.brand,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error: any) {
    console.error('❌ swap-subscription-card error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Error al cambiar tarjeta de suscripción',
      }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
