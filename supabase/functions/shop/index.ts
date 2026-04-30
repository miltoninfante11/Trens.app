// ============================================================================
// SHOP EDGE FUNCTION - TRENS Tienda
// Maneja: catálogo público, carrito, checkout (tarjeta + WhatsApp), admin CRUD
// ============================================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const OPENPAY_PRIVATE_KEY = Deno.env.get('OPENPAY_PRIVATE_KEY') || '';
const OPENPAY_MERCHANT_ID = Deno.env.get('OPENPAY_MERCHANT_ID') || '';
const OPENPAY_API_URL = 'https://api.openpay.pe/v1';
const SHOP_WHATSAPP_NUMBER = Deno.env.get('SHOP_WHATSAPP_NUMBER') || '51999999999';

const openpayAuth = () => `Basic ${btoa(OPENPAY_PRIVATE_KEY + ':')}`;

async function openpayFetch(path: string, options: RequestInit = {}) {
  const url = `${OPENPAY_API_URL}/${OPENPAY_MERCHANT_ID}${path}`;
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

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function isAdmin(supabase: any, userId: string, email?: string): Promise<boolean> {
  const { data } = await supabase.from('admin_users').select('role').eq('user_id', userId).single();
  if (data) return true;
  const ceoEmails = ['micorp.latam@gmail.com', 'm.sanchez@neurocodestudio.com', 'admin@trens.app'];
  return !!email && ceoEmails.includes(email);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Optional auth (algunas acciones son públicas: list-products, get-product)
    let user: any = null;
    const authHeader = req.headers.get('Authorization');
    if (authHeader) {
      const token = authHeader.replace('Bearer ', '');
      const { data } = await supabase.auth.getUser(token);
      user = data?.user || null;
    }

    const body = await req.json();
    const { action } = body;

    // ===========================================================
    // PUBLIC: list-products
    // ===========================================================
    if (action === 'list-products') {
      const { categorySlug, featured, limit = 100 } = body;
      let query = supabase
        .from('shop_products')
        .select('*, category:shop_categories(slug, name, icon)')
        .eq('is_active', true)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: false })
        .limit(limit);

      if (categorySlug) {
        const { data: cat } = await supabase
          .from('shop_categories')
          .select('id')
          .eq('slug', categorySlug)
          .single();
        if (cat) query = query.eq('category_id', cat.id);
      }
      if (featured) query = query.eq('is_featured', true);

      const { data, error } = await query;
      if (error) throw error;
      // SECURITY: nunca exponer cost_price a clientes públicos
      const sanitized = (data || []).map((p: any) => {
        const { cost_price, ...rest } = p;
        return rest;
      });
      return jsonResponse({ success: true, products: sanitized });
    }

    // ===========================================================
    // PUBLIC: list-categories
    // ===========================================================
    if (action === 'list-categories') {
      const { data, error } = await supabase
        .from('shop_categories')
        .select('*')
        .eq('is_active', true)
        .order('sort_order');
      if (error) throw error;
      return jsonResponse({ success: true, categories: data });
    }

    // ===========================================================
    // PUBLIC: get-product
    // ===========================================================
    if (action === 'get-product') {
      const { slug, id } = body;
      let query = supabase
        .from('shop_products')
        .select('*, category:shop_categories(slug, name, icon)')
        .eq('is_active', true);
      if (slug) query = query.eq('slug', slug);
      else if (id) query = query.eq('id', id);
      else throw new Error('slug o id requerido');
      const { data, error } = await query.single();
      if (error) throw error;
      // SECURITY: nunca exponer cost_price a clientes públicos
      if (data) delete (data as any).cost_price;
      return jsonResponse({ success: true, product: data });
    }

    // ===========================================================
    // CART: get current cart (authenticated)
    // ===========================================================
    if (action === 'cart-get') {
      if (!user) return jsonResponse({ success: true, cart: null, items: [] });

      let { data: cart } = await supabase
        .from('shop_carts')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (!cart) {
        const { data: created } = await supabase
          .from('shop_carts')
          .insert({ user_id: user.id })
          .select()
          .single();
        cart = created;
      }

      const { data: items } = await supabase
        .from('shop_cart_items')
        .select('*, product:shop_products(*)')
        .eq('cart_id', cart!.id);

      return jsonResponse({ success: true, cart, items: items || [] });
    }

    // ===========================================================
    // CART: add item
    // ===========================================================
    if (action === 'cart-add') {
      if (!user) return jsonResponse({ success: false, error: 'Login requerido' }, 401);
      const { productId, quantity = 1 } = body;
      if (!productId) throw new Error('productId requerido');

      // Verify product is active
      const { data: product } = await supabase
        .from('shop_products')
        .select('id, stock, stock_unlimited, is_active')
        .eq('id', productId)
        .single();
      if (!product || !product.is_active) throw new Error('Producto no disponible');

      // Get/create cart
      let { data: cart } = await supabase
        .from('shop_carts')
        .select('*')
        .eq('user_id', user.id)
        .single();
      if (!cart) {
        const { data: created } = await supabase
          .from('shop_carts')
          .insert({ user_id: user.id })
          .select()
          .single();
        cart = created;
      }

      // Upsert item
      const { data: existing } = await supabase
        .from('shop_cart_items')
        .select('*')
        .eq('cart_id', cart!.id)
        .eq('product_id', productId)
        .single();

      let newQty = quantity;
      if (existing) newQty = existing.quantity + quantity;

      // Stock check
      if (!product.stock_unlimited && product.stock !== null && newQty > product.stock) {
        throw new Error(`Solo quedan ${product.stock} unidades`);
      }

      if (existing) {
        await supabase.from('shop_cart_items').update({ quantity: newQty }).eq('id', existing.id);
      } else {
        await supabase
          .from('shop_cart_items')
          .insert({ cart_id: cart!.id, product_id: productId, quantity: newQty });
      }

      return jsonResponse({ success: true });
    }

    // ===========================================================
    // CART: update item quantity
    // ===========================================================
    if (action === 'cart-update') {
      if (!user) return jsonResponse({ success: false, error: 'Login requerido' }, 401);
      const { itemId, quantity } = body;
      if (!itemId || !quantity || quantity < 1) throw new Error('Datos inválidos');

      // Verify ownership
      const { data: item } = await supabase
        .from('shop_cart_items')
        .select('*, cart:shop_carts(user_id)')
        .eq('id', itemId)
        .single();
      if (!item || item.cart?.user_id !== user.id) throw new Error('Item no encontrado');

      await supabase.from('shop_cart_items').update({ quantity }).eq('id', itemId);
      return jsonResponse({ success: true });
    }

    // ===========================================================
    // CART: remove item
    // ===========================================================
    if (action === 'cart-remove') {
      if (!user) return jsonResponse({ success: false, error: 'Login requerido' }, 401);
      const { itemId } = body;
      const { data: item } = await supabase
        .from('shop_cart_items')
        .select('cart:shop_carts(user_id)')
        .eq('id', itemId)
        .single();
      if (!item || (item as any).cart?.user_id !== user.id) throw new Error('Item no encontrado');
      await supabase.from('shop_cart_items').delete().eq('id', itemId);
      return jsonResponse({ success: true });
    }

    // ===========================================================
    // CART: clear
    // ===========================================================
    if (action === 'cart-clear') {
      if (!user) return jsonResponse({ success: false, error: 'Login requerido' }, 401);
      const { data: cart } = await supabase
        .from('shop_carts')
        .select('id')
        .eq('user_id', user.id)
        .single();
      if (cart) {
        await supabase.from('shop_cart_items').delete().eq('cart_id', cart.id);
      }
      return jsonResponse({ success: true });
    }

    // ===========================================================
    // CHECKOUT-CARD: cobra a tarjeta guardada o nueva (token)
    // Body: { cardId? | tokenId?, customer, shippingAddress?, customerNotes?, deviceSessionId? }
    // ===========================================================
    if (action === 'checkout-card') {
      if (!user) return jsonResponse({ success: false, error: 'Login requerido' }, 401);
      const {
        cardId,
        tokenId,
        customer,
        shippingAddress,
        customerNotes,
        deviceSessionId,
        saveCard,
      } = body;

      if (!cardId && !tokenId) throw new Error('cardId o tokenId requerido');
      if (!customer?.email || !customer?.name) throw new Error('Datos de cliente incompletos');

      // Cargar carrito + items + productos
      const { data: cart } = await supabase
        .from('shop_carts')
        .select('id')
        .eq('user_id', user.id)
        .single();
      if (!cart) throw new Error('Carrito vacío');

      const { data: items } = await supabase
        .from('shop_cart_items')
        .select('*, product:shop_products(*)')
        .eq('cart_id', cart.id);

      if (!items || items.length === 0) throw new Error('Carrito vacío');

      // Validar precios y stock SERVER-SIDE (no confiar en el cliente)
      let subtotal = 0;
      let shippingRequired = false;
      const orderItems: any[] = [];

      for (const item of items) {
        const p = item.product;
        if (!p?.is_active) throw new Error(`Producto "${p?.name}" no disponible`);
        if (!p.stock_unlimited && !p.is_digital && (p.stock ?? 0) < item.quantity) {
          throw new Error(`Stock insuficiente para "${p.name}"`);
        }
        const itemSubtotal = Number(p.price) * item.quantity;
        subtotal += itemSubtotal;
        if (p.shipping_required) shippingRequired = true;
        orderItems.push({
          product_id: p.id,
          product_name: p.name,
          product_slug: p.slug,
          thumbnail_url: p.thumbnail_url,
          unit_price: p.price,
          quantity: item.quantity,
          subtotal: itemSubtotal,
          is_digital: p.is_digital,
          digital_payload: p.digital_payload,
        });
      }

      const shippingCost = 0; // manual por ahora
      const total = subtotal + shippingCost;

      if (shippingRequired && !shippingAddress) {
        throw new Error('Se requiere dirección de envío para productos físicos');
      }

      // Obtener customer_id de Openpay
      let customerId: string | null = null;
      const { data: existingSub } = await supabase
        .from('subscriptions')
        .select('openpay_customer_id')
        .eq('user_id', user.id)
        .maybeSingle();
      customerId = existingSub?.openpay_customer_id || null;

      if (!customerId) {
        const { data: existingCard } = await supabase
          .from('customer_cards')
          .select('openpay_customer_id')
          .eq('user_id', user.id)
          .limit(1)
          .maybeSingle();
        customerId = existingCard?.openpay_customer_id || null;
      }

      if (!customerId) {
        // Crear customer
        const cr = await openpayFetch('/customers', {
          method: 'POST',
          body: JSON.stringify({
            name: customer.name,
            email: customer.email,
            phone_number: customer.phone || '',
            requires_account: false,
          }),
        });
        if (!cr.ok) throw new Error(cr.data?.description || 'Error creando cliente Openpay');
        customerId = cr.data.id;
      }

      // Crear orden en estado pending
      const { data: order, error: orderError } = await supabase
        .from('shop_orders')
        .insert({
          user_id: user.id,
          email: customer.email,
          full_name: customer.name,
          phone: customer.phone,
          subtotal,
          shipping_cost: shippingCost,
          total,
          currency: 'PEN',
          payment_method: 'card',
          status: 'pending',
          shipping_required: shippingRequired,
          shipping_address: shippingRequired ? shippingAddress : null,
          customer_notes: customerNotes,
        })
        .select()
        .single();
      if (orderError) throw orderError;

      // Insertar items
      await supabase
        .from('shop_order_items')
        .insert(orderItems.map((i) => ({ ...i, order_id: order.id })));

      // Cobrar en Openpay
      // NOTA: cuando se cobra a /customers/{id}/charges NO se debe enviar `customer`
      // (OpenPay devuelve 422 "You must not send customer data").
      const chargeBody: any = {
        method: 'card',
        amount: total,
        currency: 'PEN',
        description: `TRENS Shop - Orden ${order.order_number}`,
        order_id: order.order_number,
        device_session_id: deviceSessionId || null,
      };

      let usedCardId = cardId;
      if (cardId) {
        chargeBody.source_id = cardId;
      } else {
        // Token nuevo: si saveCard, primero guardar
        if (saveCard) {
          const sc = await openpayFetch(`/customers/${customerId}/cards`, {
            method: 'POST',
            body: JSON.stringify({ token_id: tokenId, device_session_id: deviceSessionId || null }),
          });
          if (sc.ok) {
            usedCardId = sc.data.id;
            chargeBody.source_id = usedCardId;
            // Sync DB
            await supabase.from('customer_cards').upsert(
              {
                user_id: user.id,
                openpay_customer_id: customerId,
                openpay_card_id: sc.data.id,
                last4: sc.data.card_number?.slice(-4) || '',
                brand: sc.data.brand || 'unknown',
                type: sc.data.type || 'credit',
                holder_name: sc.data.holder_name || customer.name,
                expiration_month: sc.data.expiration_month || '',
                expiration_year: sc.data.expiration_year || '',
                allows_charges: sc.data.allows_charges ?? true,
              },
              { onConflict: 'openpay_card_id' }
            );
          } else {
            chargeBody.source_id = tokenId;
          }
        } else {
          chargeBody.source_id = tokenId;
        }
      }

      const chargeRes = await openpayFetch(`/customers/${customerId}/charges`, {
        method: 'POST',
        body: JSON.stringify(chargeBody),
      });

      if (!chargeRes.ok) {
        // Marcar orden como fallida
        await supabase
          .from('shop_orders')
          .update({
            status: 'cancelled',
            cancelled_at: new Date().toISOString(),
            admin_notes: `Pago fallido: ${chargeRes.data?.description || 'Error'}`,
          })
          .eq('id', order.id);
        throw new Error(chargeRes.data?.description || 'Error al cobrar');
      }

      const charge = chargeRes.data;

      // Cargar info de tarjeta usada
      let cardLast4 = '';
      let cardBrand = '';
      if (usedCardId) {
        const { data: dbCard } = await supabase
          .from('customer_cards')
          .select('last4, brand')
          .eq('openpay_card_id', usedCardId)
          .maybeSingle();
        cardLast4 = dbCard?.last4 || charge.card?.card_number?.slice(-4) || '';
        cardBrand = dbCard?.brand || charge.card?.brand || '';
      } else {
        cardLast4 = charge.card?.card_number?.slice(-4) || '';
        cardBrand = charge.card?.brand || '';
      }

      // Actualizar orden a paid
      await supabase
        .from('shop_orders')
        .update({
          status: 'paid',
          paid_at: new Date().toISOString(),
          openpay_charge_id: charge.id,
          openpay_card_id: usedCardId,
          card_last4: cardLast4,
          card_brand: cardBrand,
        })
        .eq('id', order.id);

      // Decrementar stock
      for (const item of orderItems) {
        if (!item.is_digital) {
          await supabase
            .rpc('shop_decrement_stock', {
              p_product_id: item.product_id,
              p_qty: item.quantity,
            })
            .then(
              () => {},
              () => {
                // si no existe el RPC, hacer fallback manual
                return supabase
                  .from('shop_products')
                  .select('stock, stock_unlimited')
                  .eq('id', item.product_id)
                  .single()
                  .then(({ data }: any) => {
                    if (data && !data.stock_unlimited && data.stock !== null) {
                      return supabase
                        .from('shop_products')
                        .update({ stock: Math.max(0, (data.stock || 0) - item.quantity) })
                        .eq('id', item.product_id);
                    }
                  });
              }
            );
        }
      }

      // Vaciar carrito
      await supabase.from('shop_cart_items').delete().eq('cart_id', cart.id);

      return jsonResponse({
        success: true,
        order: {
          id: order.id,
          order_number: order.order_number,
          total,
          status: 'paid',
          openpay_charge_id: charge.id,
        },
      });
    }

    // ===========================================================
    // CHECKOUT-WHATSAPP: crea orden pending, devuelve URL de WhatsApp
    // ===========================================================
    if (action === 'checkout-whatsapp') {
      const { customer, shippingAddress, customerNotes } = body;
      if (!customer?.email || !customer?.name || !customer?.phone)
        throw new Error('Datos de cliente incompletos (nombre, email, teléfono)');

      let cartId: string | null = null;
      let items: any[] = [];

      if (user) {
        const { data: cart } = await supabase
          .from('shop_carts')
          .select('id')
          .eq('user_id', user.id)
          .single();
        if (!cart) throw new Error('Carrito vacío');
        cartId = cart.id;
        const { data: ci } = await supabase
          .from('shop_cart_items')
          .select('*, product:shop_products(*)')
          .eq('cart_id', cart.id);
        items = ci || [];
      } else {
        // Guest: items vienen en body
        const guestItems = body.items;
        if (!Array.isArray(guestItems) || guestItems.length === 0) throw new Error('Carrito vacío');
        for (const gi of guestItems) {
          const { data: p } = await supabase
            .from('shop_products')
            .select('*')
            .eq('id', gi.productId)
            .eq('is_active', true)
            .single();
          if (!p) throw new Error('Producto no disponible');
          items.push({ product: p, quantity: gi.quantity });
        }
      }

      if (items.length === 0) throw new Error('Carrito vacío');

      let subtotal = 0;
      let shippingRequired = false;
      const orderItems: any[] = [];

      for (const item of items) {
        const p = item.product;
        const itemSub = Number(p.price) * item.quantity;
        subtotal += itemSub;
        if (p.shipping_required) shippingRequired = true;
        orderItems.push({
          product_id: p.id,
          product_name: p.name,
          product_slug: p.slug,
          thumbnail_url: p.thumbnail_url,
          unit_price: p.price,
          quantity: item.quantity,
          subtotal: itemSub,
          is_digital: p.is_digital,
        });
      }

      const total = subtotal;

      const { data: order, error: orderError } = await supabase
        .from('shop_orders')
        .insert({
          user_id: user?.id || null,
          email: customer.email,
          full_name: customer.name,
          phone: customer.phone,
          subtotal,
          total,
          currency: 'PEN',
          payment_method: 'whatsapp',
          status: 'pending',
          shipping_required: shippingRequired,
          shipping_address: shippingRequired ? shippingAddress : null,
          customer_notes: customerNotes,
        })
        .select()
        .single();
      if (orderError) throw orderError;

      await supabase
        .from('shop_order_items')
        .insert(orderItems.map((i) => ({ ...i, order_id: order.id })));

      // Vaciar carrito si autenticado
      if (cartId) {
        await supabase.from('shop_cart_items').delete().eq('cart_id', cartId);
      }

      // Construir mensaje de WhatsApp
      const itemsText = orderItems
        .map(
          (i) => `• ${i.product_name} x${i.quantity} - S/ ${(i.unit_price * i.quantity).toFixed(2)}`
        )
        .join('\n');
      const msg =
        `Hola TRENS, quiero coordinar el pago de mi pedido:\n\n` +
        `*Orden:* ${order.order_number}\n` +
        `*Cliente:* ${customer.name}\n` +
        `*Email:* ${customer.email}\n\n` +
        `*Items:*\n${itemsText}\n\n` +
        `*Total:* S/ ${total.toFixed(2)}`;

      const waUrl = `https://wa.me/${SHOP_WHATSAPP_NUMBER}?text=${encodeURIComponent(msg)}`;

      return jsonResponse({
        success: true,
        order: {
          id: order.id,
          order_number: order.order_number,
          total,
          status: 'pending',
        },
        whatsappUrl: waUrl,
      });
    }

    // ===========================================================
    // MY-ORDERS
    // ===========================================================
    if (action === 'my-orders') {
      if (!user) return jsonResponse({ success: false, error: 'Login requerido' }, 401);
      const { data, error } = await supabase
        .from('shop_orders')
        .select('*, items:shop_order_items(*)')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return jsonResponse({ success: true, orders: data });
    }

    // ===========================================================
    // ADMIN ACTIONS (require admin role)
    // ===========================================================
    if (action.startsWith('admin-')) {
      if (!user) return jsonResponse({ success: false, error: 'No autenticado' }, 401);
      const ok = await isAdmin(supabase, user.id, user.email);
      if (!ok) return jsonResponse({ success: false, error: 'Sin permisos' }, 403);

      // Listar todas las órdenes
      if (action === 'admin-list-orders') {
        const { status, search, limit = 200 } = body;
        let query = supabase
          .from('shop_orders')
          .select('*, items:shop_order_items(*)')
          .order('created_at', { ascending: false })
          .limit(limit);
        if (status) query = query.eq('status', status);
        if (search)
          query = query.or(
            `email.ilike.%${search}%,full_name.ilike.%${search}%,order_number.ilike.%${search}%`
          );
        const { data, error } = await query;
        if (error) throw error;
        return jsonResponse({ success: true, orders: data });
      }

      // Actualizar estado de orden
      if (action === 'admin-update-order') {
        const { orderId, updates } = body;
        const allowed = [
          'status',
          'tracking_code',
          'shipping_carrier',
          'admin_notes',
          'shipped_at',
          'delivered_at',
        ];
        const filtered: any = {};
        for (const k of allowed) if (updates[k] !== undefined) filtered[k] = updates[k];

        // Auto-fill timestamps
        if (filtered.status === 'shipped' && !filtered.shipped_at)
          filtered.shipped_at = new Date().toISOString();
        if (filtered.status === 'delivered' && !filtered.delivered_at)
          filtered.delivered_at = new Date().toISOString();
        if (filtered.status === 'paid' && updates._setPaid)
          filtered.paid_at = new Date().toISOString();
        if (filtered.status === 'cancelled') filtered.cancelled_at = new Date().toISOString();

        const { error } = await supabase.from('shop_orders').update(filtered).eq('id', orderId);
        if (error) throw error;
        return jsonResponse({ success: true });
      }

      // CRUD productos
      if (action === 'admin-product-create') {
        const { product } = body;
        const { data, error } = await supabase
          .from('shop_products')
          .insert(product)
          .select()
          .single();
        if (error) throw error;
        return jsonResponse({ success: true, product: data });
      }

      if (action === 'admin-product-update') {
        const { id, updates } = body;
        // Strip campos que no pertenecen a la tabla (relaciones, auto-managed)
        const {
          id: _id,
          created_at: _ca,
          updated_at: _ua,
          category: _cat,
          ...cleanUpdates
        } = updates || {};
        const { data, error } = await supabase
          .from('shop_products')
          .update(cleanUpdates)
          .eq('id', id)
          .select()
          .single();
        if (error) {
          console.error('admin-product-update error:', error);
          return jsonResponse(
            { success: false, error: error.message, details: error.details },
            200
          );
        }
        return jsonResponse({ success: true, product: data });
      }

      if (action === 'admin-product-delete') {
        const { id } = body;
        const { error } = await supabase.from('shop_products').delete().eq('id', id);
        if (error) throw error;
        return jsonResponse({ success: true });
      }

      if (action === 'admin-list-products-all') {
        const { data, error } = await supabase
          .from('shop_products')
          .select('*, category:shop_categories(slug, name)')
          .order('sort_order')
          .order('created_at', { ascending: false });
        if (error) throw error;
        return jsonResponse({ success: true, products: data });
      }

      if (action === 'admin-category-create') {
        const { category } = body;
        const { data, error } = await supabase
          .from('shop_categories')
          .insert(category)
          .select()
          .single();
        if (error) throw error;
        return jsonResponse({ success: true, category: data });
      }

      if (action === 'admin-category-update') {
        const { id, updates } = body;
        const { data, error } = await supabase
          .from('shop_categories')
          .update(updates)
          .eq('id', id)
          .select()
          .single();
        if (error) throw error;
        return jsonResponse({ success: true, category: data });
      }

      if (action === 'admin-category-delete') {
        const { id } = body;
        const { error } = await supabase.from('shop_categories').delete().eq('id', id);
        if (error) throw error;
        return jsonResponse({ success: true });
      }

      if (action === 'admin-refund-order') {
        const { orderId } = body;
        const { data: order } = await supabase
          .from('shop_orders')
          .select('*')
          .eq('id', orderId)
          .single();
        if (!order) throw new Error('Orden no encontrada');

        if (order.payment_method === 'card' && order.openpay_charge_id) {
          // Refund en Openpay
          const customerId =
            (
              await supabase
                .from('subscriptions')
                .select('openpay_customer_id')
                .eq('user_id', order.user_id)
                .maybeSingle()
            ).data?.openpay_customer_id ||
            (
              await supabase
                .from('customer_cards')
                .select('openpay_customer_id')
                .eq('user_id', order.user_id)
                .limit(1)
                .maybeSingle()
            ).data?.openpay_customer_id;

          if (customerId) {
            const r = await openpayFetch(
              `/customers/${customerId}/charges/${order.openpay_charge_id}/refund`,
              {
                method: 'POST',
                body: JSON.stringify({
                  description: 'Reembolso TRENS Shop',
                  amount: order.total,
                }),
              }
            );
            if (!r.ok) throw new Error(r.data?.description || 'Error en refund Openpay');
          }
        }

        await supabase
          .from('shop_orders')
          .update({ status: 'refunded', updated_at: new Date().toISOString() })
          .eq('id', orderId);
        return jsonResponse({ success: true });
      }
    }

    return jsonResponse({ success: false, error: `Acción no soportada: ${action}` }, 400);
  } catch (err: any) {
    console.error('[shop] error:', err);
    return jsonResponse({ success: false, error: err.message || 'Error interno' }, 400);
  }
});
