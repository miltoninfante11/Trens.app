// ============================================================================
// OPENPAY CREATE SUBSCRIPTION - Supabase Edge Function
// Crea cliente + suscripción + guarda tarjeta usando llave privada (server-side)
// ============================================================================
// Flujo:
//   1. Crear customer en OpenPay
//   2. Guardar tarjeta en customer (para futuros cobros)
//   3. Crear suscripción con la tarjeta guardada
//   4. Guardar todo en Supabase (subscriptions + customer_cards + user_roles)
// ============================================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Configuración de OpenPay (desde variables de entorno)
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

  if (!response.ok) {
    console.error(`❌ OpenPay error [${response.status}]:`, data);
  }

  return { ok: response.ok, status: response.status, data };
}

interface CreateSubscriptionRequest {
  tokenId?: string;
  cardId?: string; // Tarjeta ya guardada (saltea tokenización)
  customer: {
    name: string;
    email: string;
    phone: string;
  };
  userId: string;
  saveCard?: boolean;
  deviceSessionId?: string;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const {
      tokenId,
      cardId,
      customer,
      userId,
      saveCard = true,
      deviceSessionId,
    }: CreateSubscriptionRequest = await req.json();

    if (!tokenId && !cardId) {
      throw new Error('Debes proporcionar tokenId o cardId');
    }

    console.log('📥 Creating subscription for:', customer.email, {
      saveCard,
      mode: cardId ? 'saved-card' : 'new-token',
    });

    // Supabase client (needed early to check existing customer)
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // ================================================================
    // 1. OBTENER O CREAR CLIENTE EN OPENPAY
    // ================================================================
    let customerId: string | null = null;

    // Buscar customer existente en subscriptions
    const { data: existingSub } = await supabase
      .from('subscriptions')
      .select('openpay_customer_id')
      .eq('user_id', userId)
      .single();
    if (existingSub?.openpay_customer_id) {
      customerId = existingSub.openpay_customer_id;
      console.log('♻️ Reusing customer from subscriptions:', customerId);
    }

    // Buscar en customer_cards como fallback
    if (!customerId) {
      const { data: existingCard } = await supabase
        .from('customer_cards')
        .select('openpay_customer_id')
        .eq('user_id', userId)
        .limit(1)
        .single();
      if (existingCard?.openpay_customer_id) {
        customerId = existingCard.openpay_customer_id;
        console.log('♻️ Reusing customer from customer_cards:', customerId);
      }
    }

    // Crear nuevo customer solo si no existe
    if (!customerId) {
      const customerResult = await openpayFetch('/customers', {
        method: 'POST',
        body: JSON.stringify({
          name: customer.name,
          email: customer.email,
          phone_number: customer.phone,
          requires_account: false,
        }),
      });

      if (!customerResult.ok) {
        throw new Error(customerResult.data?.description || 'Error al crear cliente');
      }

      customerId = customerResult.data.id;
      console.log('✅ Customer created:', customerId);
    }

    // ================================================================
    // 2. GUARDAR TARJETA EN EL CUSTOMER (para futuros cobros)
    // O usar tarjeta ya guardada si vino cardId
    // ================================================================
    let savedCardId: string | null = null;
    let savedCardData: any = null;

    if (cardId) {
      // Modo: tarjeta ya guardada — leer datos desde DB y reutilizar cardId directamente
      const { data: existingCardRow } = await supabase
        .from('customer_cards')
        .select('*')
        .eq('user_id', userId)
        .eq('openpay_card_id', cardId)
        .single();

      if (!existingCardRow) {
        throw new Error('Tarjeta no encontrada para este usuario');
      }

      savedCardId = cardId;
      savedCardData = {
        id: cardId,
        card_number: existingCardRow.last4 ? `XXXXXX${existingCardRow.last4}` : '',
        brand: existingCardRow.brand,
        type: existingCardRow.type,
        holder_name: existingCardRow.holder_name,
        expiration_month: existingCardRow.expiration_month,
        expiration_year: existingCardRow.expiration_year,
        allows_charges: existingCardRow.allows_charges ?? true,
      };
      console.log('♻️ Using saved card:', savedCardId);
    } else if (saveCard && tokenId) {
      const cardResult = await openpayFetch(`/customers/${customerId}/cards`, {
        method: 'POST',
        body: JSON.stringify({
          token_id: tokenId,
          device_session_id: deviceSessionId || null,
        }),
      });

      if (cardResult.ok) {
        savedCardData = cardResult.data;
        savedCardId = savedCardData.id;
        console.log('✅ Card saved on customer:', savedCardId);
      } else {
        // No es fatal - la suscripción puede funcionar solo con el token
        console.warn('⚠️ Could not save card on customer, using token for subscription');
      }
    }

    // ================================================================
    // 3. CREAR SUSCRIPCIÓN
    // ================================================================
    const subscriptionBody: any = {
      plan_id: OPENPAY_PLAN_ID,
    };

    // Prioridad: tarjeta guardada > token
    if (savedCardId) {
      subscriptionBody.source_id = savedCardId;
    } else if (tokenId) {
      subscriptionBody.source_id = tokenId;
    } else {
      throw new Error('No hay fuente de pago disponible');
    }

    const subResult = await openpayFetch(`/customers/${customerId}/subscriptions`, {
      method: 'POST',
      body: JSON.stringify(subscriptionBody),
    });

    if (!subResult.ok) {
      throw new Error(subResult.data?.description || 'Error al crear suscripción');
    }

    const subscription = subResult.data;
    console.log('✅ Subscription created:', subscription.id);

    // ================================================================
    // 4. GUARDAR EN SUPABASE
    // ================================================================

    // 4a. Insertar/actualizar suscripción
    const cardLast4 =
      (cardId && savedCardData?.card_number?.replace(/^X+/, '')?.slice(-4)) ||
      savedCardData?.card_number?.slice(-4) ||
      subscription.card?.card_number?.slice(-4) ||
      '';
    const cardBrand = savedCardData?.brand || subscription.card?.brand || '';

    const { error: dbError } = await supabase.from('subscriptions').upsert(
      {
        user_id: userId,
        openpay_customer_id: customerId,
        openpay_subscription_id: subscription.id,
        openpay_card_id: savedCardId,
        openpay_card_last4: cardLast4,
        openpay_card_brand: cardBrand,
        plan_id: OPENPAY_PLAN_ID,
        status: 'active',
        amount: 59.9,
        currency: 'PEN',
        current_period_end: subscription.period_end_date || subscription.current_period_end_date,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    );

    if (dbError) {
      console.error('❌ Error saving subscription to DB:', dbError);
      // No lanzar error - la suscripción ya fue creada en OpenPay
    }

    // 4b. Guardar tarjeta en customer_cards (si se guardó)
    if (savedCardId && savedCardData) {
      const { error: cardDbError } = await supabase.from('customer_cards').upsert(
        {
          user_id: userId,
          openpay_customer_id: customerId,
          openpay_card_id: savedCardId,
          last4: cardLast4,
          brand: cardBrand,
          type: savedCardData.type || 'credit',
          holder_name: savedCardData.holder_name || customer.name,
          expiration_month: savedCardData.expiration_month || '',
          expiration_year: savedCardData.expiration_year || '',
          is_default: true,
          allows_charges: savedCardData.allows_charges ?? true,
        },
        { onConflict: 'openpay_card_id' }
      );

      if (cardDbError) {
        console.error('⚠️ Error saving card to DB:', cardDbError);
        // No fatal - la tarjeta ya está en OpenPay
      } else {
        console.log('✅ Card saved to customer_cards DB');
      }
    }

    // 4c. Actualizar rol del usuario a PRO
    const { data: existingRole } = await supabase
      .from('user_roles')
      .select('user_id')
      .eq('user_id', userId)
      .single();

    if (existingRole) {
      const { error: roleError } = await supabase
        .from('user_roles')
        .update({ role: 'pro', updated_at: new Date().toISOString() })
        .eq('user_id', userId);

      if (roleError) {
        console.error('❌ Error updating role:', roleError);
      } else {
        console.log('✅ Role updated to PRO for user:', userId);
      }
    } else {
      const { error: roleError } = await supabase
        .from('user_roles')
        .insert({ user_id: userId, role: 'pro' });

      if (roleError) {
        console.error('❌ Error inserting role:', roleError);
      } else {
        console.log('✅ Role inserted as PRO for user:', userId);
      }
    }

    console.log('🎉 Subscription complete for user:', userId);

    return new Response(
      JSON.stringify({
        success: true,
        subscriptionId: subscription.id,
        customerId: customerId,
        cardId: savedCardId,
        status: subscription.status,
        currentPeriodEnd: subscription.current_period_end_date,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error: any) {
    console.error('❌ Subscription error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Error al procesar suscripción',
      }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
