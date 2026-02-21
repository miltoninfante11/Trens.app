// ============================================================================
// OPENPAY CARDS - Supabase Edge Function
// Gestión de tarjetas guardadas: CRUD + cobros con tarjeta almacenada
// ============================================================================
// Acciones soportadas:
//   save           → Guardar tarjeta nueva (token → card en customer)
//   list-my-cards  → Listar tarjetas del usuario autenticado
//   list-cards     → Listar tarjetas de cualquier usuario (admin)
//   delete         → Eliminar tarjeta guardada
//   set-default    → Marcar tarjeta como predeterminada
//   charge         → Cobrar a tarjeta guardada
//   charge-token   → Cobrar con token (opcionalmente guardar tarjeta)
// ============================================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// OpenPay Config
const OPENPAY_PRIVATE_KEY = Deno.env.get('OPENPAY_PRIVATE_KEY') || '';
const OPENPAY_MERCHANT_ID = Deno.env.get('OPENPAY_MERCHANT_ID') || '';
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

// Helper: obtener o crear customer_id de OpenPay para un usuario
async function getOrCreateCustomerId(
  supabase: any,
  userId: string,
  customerData?: { name: string; email: string; phone?: string }
): Promise<string> {
  // 1. Buscar en subscriptions
  const { data: sub } = await supabase
    .from('subscriptions')
    .select('openpay_customer_id')
    .eq('user_id', userId)
    .single();

  if (sub?.openpay_customer_id) {
    console.log('✅ Customer found in subscriptions:', sub.openpay_customer_id);
    return sub.openpay_customer_id;
  }

  // 2. Buscar en customer_cards
  const { data: card } = await supabase
    .from('customer_cards')
    .select('openpay_customer_id')
    .eq('user_id', userId)
    .limit(1)
    .single();

  if (card?.openpay_customer_id) {
    console.log('✅ Customer found in customer_cards:', card.openpay_customer_id);
    return card.openpay_customer_id;
  }

  // 3. Necesita datos del cliente para crear uno nuevo
  if (!customerData) {
    // Obtener de profiles
    const { data: profile } = await supabase
      .from('profiles')
      .select('email, full_name')
      .eq('id', userId)
      .single();

    if (!profile) {
      throw new Error('No se encontró perfil del usuario');
    }

    customerData = {
      name: profile.full_name || profile.email.split('@')[0],
      email: profile.email,
    };
  }

  // 4. Crear customer en OpenPay
  const result = await openpayFetch('/customers', {
    method: 'POST',
    body: JSON.stringify({
      name: customerData.name,
      email: customerData.email,
      phone_number: customerData.phone || '',
      requires_account: false,
    }),
  });

  if (!result.ok) {
    throw new Error(result.data?.description || 'Error al crear cliente en OpenPay');
  }

  console.log('✅ Customer created in OpenPay:', result.data.id);
  return result.data.id;
}

// Helper: sincronizar tarjetas de OpenPay → Supabase
async function syncCardsToDb(
  supabase: any,
  userId: string,
  customerId: string,
  openpayCards: any[]
): Promise<void> {
  for (const card of openpayCards) {
    const isFirst =
      openpayCards.indexOf(card) === 0 &&
      !(
        await supabase
          .from('customer_cards')
          .select('id')
          .eq('user_id', userId)
          .eq('is_default', true)
          .single()
      ).data;

    await supabase.from('customer_cards').upsert(
      {
        user_id: userId,
        openpay_customer_id: customerId,
        openpay_card_id: card.id,
        last4: card.card_number?.slice(-4) || '',
        brand: card.brand || 'unknown',
        type: card.type || 'credit',
        holder_name: card.holder_name || '',
        expiration_month: card.expiration_month || '',
        expiration_year: card.expiration_year || '',
        is_default: isFirst,
        allows_charges: card.allows_charges ?? true,
      },
      { onConflict: 'openpay_card_id' }
    );
  }
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

    const body = await req.json();
    const { action } = body;

    console.log(`📥 openpay-cards action: ${action}, user: ${user.id}`);

    // Verificar si necesita permisos admin
    const adminActions = ['list-cards'];
    if (adminActions.includes(action)) {
      const { data: roleData } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .single();

      if (!roleData || !['admin', 'ceo'].includes(roleData.role)) {
        return new Response(
          JSON.stringify({ success: false, error: 'Sin permisos de administrador' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // ==================================================================
    // SAVE - Guardar nueva tarjeta
    // ==================================================================
    if (action === 'save') {
      const { tokenId, userId: targetUserId, deviceSessionId } = body;
      const effectiveUserId = targetUserId || user.id;

      if (!tokenId) throw new Error('tokenId es requerido');

      // Obtener o crear customer
      const customerId = await getOrCreateCustomerId(supabase, effectiveUserId);

      // Crear tarjeta en OpenPay usando el token
      const result = await openpayFetch(`/customers/${customerId}/cards`, {
        method: 'POST',
        body: JSON.stringify({
          token_id: tokenId,
          device_session_id: deviceSessionId || null,
        }),
      });

      if (!result.ok) {
        throw new Error(result.data?.description || 'Error al guardar tarjeta');
      }

      const openpayCard = result.data;
      console.log('✅ Card saved in OpenPay:', openpayCard.id);

      // Verificar si es la primera tarjeta (marcar como default)
      const { count } = await supabase
        .from('customer_cards')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', effectiveUserId);

      const isDefault = (count || 0) === 0;

      // Guardar en Supabase
      const { error: dbError } = await supabase.from('customer_cards').upsert(
        {
          user_id: effectiveUserId,
          openpay_customer_id: customerId,
          openpay_card_id: openpayCard.id,
          last4: openpayCard.card_number?.slice(-4) || '',
          brand: openpayCard.brand || 'unknown',
          type: openpayCard.type || 'credit',
          holder_name: openpayCard.holder_name || '',
          expiration_month: openpayCard.expiration_month || '',
          expiration_year: openpayCard.expiration_year || '',
          is_default: isDefault,
          allows_charges: openpayCard.allows_charges ?? true,
        },
        { onConflict: 'openpay_card_id' }
      );

      if (dbError) {
        console.error('⚠️ DB save warning:', dbError);
      }

      return new Response(
        JSON.stringify({
          success: true,
          card: {
            id: openpayCard.id,
            last4: openpayCard.card_number?.slice(-4) || '',
            brand: openpayCard.brand || 'unknown',
            type: openpayCard.type || 'credit',
            holder_name: openpayCard.holder_name || '',
            expiration_month: openpayCard.expiration_month || '',
            expiration_year: openpayCard.expiration_year || '',
            is_default: isDefault,
            allows_charges: openpayCard.allows_charges ?? true,
            created_at: new Date().toISOString(),
          },
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ==================================================================
    // LIST-MY-CARDS - Listar tarjetas del usuario autenticado
    // ==================================================================
    if (action === 'list-my-cards') {
      // Buscar en DB local primero
      const { data: dbCards } = await supabase
        .from('customer_cards')
        .select('*')
        .eq('user_id', user.id)
        .order('is_default', { ascending: false })
        .order('created_at', { ascending: false });

      if (dbCards && dbCards.length > 0) {
        const cards = dbCards.map((c: any) => ({
          id: c.openpay_card_id,
          last4: c.last4,
          brand: c.brand,
          type: c.type,
          holder_name: c.holder_name,
          expiration_month: c.expiration_month,
          expiration_year: c.expiration_year,
          is_default: c.is_default,
          allows_charges: c.allows_charges,
          created_at: c.created_at,
        }));

        return new Response(JSON.stringify({ success: true, cards }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Si no hay en DB, intentar sincronizar desde OpenPay
      const { data: sub } = await supabase
        .from('subscriptions')
        .select('openpay_customer_id')
        .eq('user_id', user.id)
        .single();

      if (sub?.openpay_customer_id) {
        const result = await openpayFetch(`/customers/${sub.openpay_customer_id}/cards`);
        if (result.ok && Array.isArray(result.data)) {
          // Sincronizar a DB
          await syncCardsToDb(supabase, user.id, sub.openpay_customer_id, result.data);

          const cards = result.data.map((c: any) => ({
            id: c.id,
            last4: c.card_number?.slice(-4) || '',
            brand: c.brand || 'unknown',
            type: c.type || 'credit',
            holder_name: c.holder_name || '',
            expiration_month: c.expiration_month || '',
            expiration_year: c.expiration_year || '',
            is_default: false,
            allows_charges: c.allows_charges ?? true,
            created_at: c.creation_date || new Date().toISOString(),
          }));

          return new Response(JSON.stringify({ success: true, cards }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }

      // No tiene tarjetas
      return new Response(JSON.stringify({ success: true, cards: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ==================================================================
    // LIST-CARDS - Listar tarjetas de un usuario (admin)
    // ==================================================================
    if (action === 'list-cards') {
      const { userId: targetUserId } = body;
      if (!targetUserId) throw new Error('userId requerido');

      // Sincronizar desde OpenPay si hay customer_id
      const { data: sub } = await supabase
        .from('subscriptions')
        .select('openpay_customer_id')
        .eq('user_id', targetUserId)
        .single();

      if (sub?.openpay_customer_id) {
        const result = await openpayFetch(`/customers/${sub.openpay_customer_id}/cards`);
        if (result.ok && Array.isArray(result.data)) {
          // Sincronizar nuevas tarjetas
          await syncCardsToDb(supabase, targetUserId, sub.openpay_customer_id, result.data);
        }
      }

      // Re-leer de DB (ya sincronizado)
      const { data: finalCards } = await supabase
        .from('customer_cards')
        .select('*')
        .eq('user_id', targetUserId)
        .order('is_default', { ascending: false });

      const cards = (finalCards || []).map((c: any) => ({
        id: c.openpay_card_id,
        last4: c.last4,
        brand: c.brand,
        type: c.type,
        holder_name: c.holder_name,
        expiration_month: c.expiration_month,
        expiration_year: c.expiration_year,
        is_default: c.is_default,
        allows_charges: c.allows_charges,
        created_at: c.created_at,
      }));

      return new Response(JSON.stringify({ success: true, cards }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ==================================================================
    // DELETE - Eliminar tarjeta guardada
    // ==================================================================
    if (action === 'delete') {
      const { cardId, userId: targetUserId } = body;
      const effectiveUserId = targetUserId || user.id;

      if (!cardId) throw new Error('cardId requerido');

      // ---- REGLA: Mínimo 1 tarjeta si tiene suscripción activa ----
      const { data: activeSub } = await supabase
        .from('subscriptions')
        .select('status')
        .eq('user_id', effectiveUserId)
        .in('status', ['active', 'past_due'])
        .maybeSingle();

      if (activeSub) {
        // Contar cuántas tarjetas tiene el usuario
        const { count } = await supabase
          .from('customer_cards')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', effectiveUserId);

        if ((count || 0) <= 1) {
          throw new Error(
            'No puedes eliminar tu única tarjeta mientras tengas una suscripción activa. Agrega otra tarjeta primero.'
          );
        }
      }

      // Obtener customer_id
      const { data: cardRecord } = await supabase
        .from('customer_cards')
        .select('openpay_customer_id, is_default')
        .eq('openpay_card_id', cardId)
        .eq('user_id', effectiveUserId)
        .single();

      if (!cardRecord) {
        throw new Error('Tarjeta no encontrada');
      }

      // Eliminar en OpenPay
      const result = await openpayFetch(
        `/customers/${cardRecord.openpay_customer_id}/cards/${cardId}`,
        { method: 'DELETE' }
      );

      // A veces OpenPay devuelve 404 si ya fue eliminada, eso está OK
      if (!result.ok && result.status !== 404) {
        console.error('⚠️ OpenPay delete warning:', result.data);
      }

      // Eliminar de DB
      await supabase
        .from('customer_cards')
        .delete()
        .eq('openpay_card_id', cardId)
        .eq('user_id', effectiveUserId);

      // Si era la default, asignar otra como default
      if (cardRecord.is_default) {
        const { data: remaining } = await supabase
          .from('customer_cards')
          .select('id')
          .eq('user_id', effectiveUserId)
          .order('created_at', { ascending: false })
          .limit(1);

        if (remaining && remaining.length > 0) {
          await supabase
            .from('customer_cards')
            .update({ is_default: true })
            .eq('id', remaining[0].id);
        }
      }

      console.log('✅ Card deleted:', cardId);

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ==================================================================
    // SET-DEFAULT - Marcar tarjeta como predeterminada
    // ==================================================================
    if (action === 'set-default') {
      const { cardId, userId: targetUserId } = body;
      const effectiveUserId = targetUserId || user.id;

      if (!cardId) throw new Error('cardId requerido');

      // El trigger en DB se encarga de desmarcar las demás
      const { error: dbError } = await supabase
        .from('customer_cards')
        .update({ is_default: true })
        .eq('openpay_card_id', cardId)
        .eq('user_id', effectiveUserId);

      if (dbError) throw dbError;

      console.log('✅ Default card set:', cardId);

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ==================================================================
    // CHARGE - Cobrar a tarjeta guardada
    // ==================================================================
    if (action === 'charge') {
      const {
        userId: targetUserId,
        cardId,
        amount,
        description,
        orderId,
        currency,
        deviceSessionId,
      } = body;
      const effectiveUserId = targetUserId || user.id;

      if (!cardId) throw new Error('cardId requerido');
      if (!amount || amount <= 0) throw new Error('amount debe ser mayor a 0');
      if (!description) throw new Error('description requerida');

      // Obtener customer_id
      const { data: cardRecord } = await supabase
        .from('customer_cards')
        .select('openpay_customer_id')
        .eq('openpay_card_id', cardId)
        .eq('user_id', effectiveUserId)
        .single();

      if (!cardRecord) {
        throw new Error('Tarjeta no encontrada');
      }

      // Cobrar en OpenPay
      const chargeBody: any = {
        source_id: cardId,
        method: 'card',
        amount: parseFloat(amount),
        currency: currency || 'PEN',
        description,
        device_session_id: deviceSessionId || null,
      };

      if (orderId) chargeBody.order_id = orderId;

      const result = await openpayFetch(`/customers/${cardRecord.openpay_customer_id}/charges`, {
        method: 'POST',
        body: JSON.stringify(chargeBody),
      });

      if (!result.ok) {
        const errorMsg = result.data?.description || 'Error al procesar cobro';
        throw new Error(errorMsg);
      }

      console.log('✅ Charge completed:', result.data.id);

      return new Response(
        JSON.stringify({
          success: true,
          chargeId: result.data.id,
          status: result.data.status,
          authorization: result.data.authorization,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ==================================================================
    // CHARGE-TOKEN - Cobrar con token (opcionalmente guardar tarjeta)
    // ==================================================================
    if (action === 'charge-token') {
      const {
        userId: targetUserId,
        tokenId,
        amount,
        description,
        orderId,
        currency,
        saveCard,
        deviceSessionId,
        customer: customerData,
      } = body;
      const effectiveUserId = targetUserId || user.id;

      if (!tokenId) throw new Error('tokenId requerido');
      if (!amount || amount <= 0) throw new Error('amount debe ser mayor a 0');
      if (!description) throw new Error('description requerida');

      // Obtener o crear customer
      const customerId = await getOrCreateCustomerId(supabase, effectiveUserId, customerData);

      // Si saveCard, primero guardar la tarjeta y luego cobrar con ella
      let cardIdForCharge = tokenId;

      if (saveCard) {
        // Crear tarjeta en OpenPay
        const cardResult = await openpayFetch(`/customers/${customerId}/cards`, {
          method: 'POST',
          body: JSON.stringify({
            token_id: tokenId,
            device_session_id: deviceSessionId || null,
          }),
        });

        if (cardResult.ok) {
          const opCard = cardResult.data;
          cardIdForCharge = opCard.id;

          // Guardar en DB
          const { count } = await supabase
            .from('customer_cards')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', effectiveUserId);

          await supabase.from('customer_cards').upsert(
            {
              user_id: effectiveUserId,
              openpay_customer_id: customerId,
              openpay_card_id: opCard.id,
              last4: opCard.card_number?.slice(-4) || '',
              brand: opCard.brand || 'unknown',
              type: opCard.type || 'credit',
              holder_name: opCard.holder_name || '',
              expiration_month: opCard.expiration_month || '',
              expiration_year: opCard.expiration_year || '',
              is_default: (count || 0) === 0,
              allows_charges: opCard.allows_charges ?? true,
            },
            { onConflict: 'openpay_card_id' }
          );

          console.log('✅ Card saved during charge:', opCard.id);
        } else {
          console.error('⚠️ Could not save card, proceeding with token charge');
        }
      }

      // Cobrar
      const chargeBody: any = {
        source_id: cardIdForCharge,
        method: 'card',
        amount: parseFloat(amount),
        currency: currency || 'PEN',
        description,
        device_session_id: deviceSessionId || null,
      };

      if (orderId) chargeBody.order_id = orderId;

      const result = await openpayFetch(`/customers/${customerId}/charges`, {
        method: 'POST',
        body: JSON.stringify(chargeBody),
      });

      if (!result.ok) {
        throw new Error(result.data?.description || 'Error al procesar cobro');
      }

      console.log('✅ Token charge completed:', result.data.id);

      return new Response(
        JSON.stringify({
          success: true,
          chargeId: result.data.id,
          status: result.data.status,
          authorization: result.data.authorization,
          cardSaved: !!saveCard && cardIdForCharge !== tokenId,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    throw new Error(`Acción no válida: ${action}`);
  } catch (error: any) {
    console.error('❌ openpay-cards error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Error al procesar operación de tarjeta',
      }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
