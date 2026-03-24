// ============================================================================
// ADMIN USERS - Supabase Edge Function
// Gestión completa de usuarios: CRUD + Control de suscripciones Openpay
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
const OPENPAY_API_URL = 'https://api.openpay.pe/v1';

type Action =
  | 'list' // Listar usuarios con filtros
  | 'get' // Obtener usuario específico
  | 'create' // Crear usuario manualmente
  | 'update-role' // Cambiar rol (free/pro/admin)
  | 'delete' // Eliminar usuario
  | 'grant-pro' // Otorgar PRO manualmente (sin pago)
  | 'revoke-pro' // Revocar PRO
  | 'cancel-subscription' // Cancelar suscripción en Openpay
  | 'get-subscription' // Obtener detalles de suscripción
  | 'get-payments' // Historial de pagos
  | 'get-cards' // Tarjetas guardadas del usuario
  | 'delete-card' // Eliminar tarjeta de un usuario
  | 'impersonate' // Iniciar sesión como otro usuario (solo CEO)
  | 'assign-plan' // Asignar plan de entrenamiento a usuario
  | 'get-user-plan'; // Obtener plan actual del usuario

interface CreateUserData {
  email: string;
  password: string;
  fullName?: string;
  phone?: string;
  role?: 'free' | 'pro' | 'admin';
  grantPro?: boolean;
  proExpiresAt?: string;
  sendWelcomeEmail?: boolean;
}

interface RequestBody {
  action: Action;
  userId?: string;
  role?: string;
  filters?: {
    role?: string;
    search?: string;
    limit?: number;
    offset?: number;
  };
  proExpiresAt?: string; // Para PRO temporal
  createData?: CreateUserData; // Para crear usuario
  cardId?: string; // Para eliminar tarjeta
  templateId?: string; // Para asignar plan de entrenamiento
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verificar que el usuario que hace la petición es admin/ceo
    const authHeader = req.headers.get('Authorization');
    console.log('📥 Auth header present:', !!authHeader);

    if (!authHeader) {
      return new Response(JSON.stringify({ success: false, error: 'No autorizado - sin token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const {
      data: { user: requestingUser },
      error: authError,
    } = await supabase.auth.getUser(token);

    console.log('📥 User auth result:', { userId: requestingUser?.id, error: authError?.message });

    if (authError || !requestingUser) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Token inválido: ' + (authError?.message || 'unknown'),
        }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verificar rol del usuario que hace la petición
    // 1) Primero checar admin_users (fuente principal del panel admin)
    const { data: adminData, error: adminError } = await supabase
      .from('admin_users')
      .select('role')
      .eq('user_id', requestingUser.id)
      .single();

    console.log('📥 Admin data:', { role: adminData?.role, error: adminError?.message });

    let userRole = adminData?.role || null;

    // 2) Fallback: checar user_roles
    if (!userRole) {
      const { data: roleData, error: roleError } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', requestingUser.id)
        .single();

      console.log('📥 Role data:', { role: roleData?.role, error: roleError?.message });
      userRole = roleData?.role;
    }

    // 3) Fallback final: verificar por email conocido
    if (!userRole) {
      const { data: profileData } = await supabase
        .from('profiles')
        .select('email')
        .eq('id', requestingUser.id)
        .single();

      // Lista de emails de CEOs (incluir todos los conocidos)
      const ceoEmails = [
        'micorp.latam@gmail.com',
        'm.sanchez@neurocodestudio.com',
        'admin@trens.app',
      ];
      if (profileData && ceoEmails.includes(profileData.email)) {
        userRole = 'ceo';
        console.log('📥 User is CEO by email:', profileData.email);
      }
    }

    if (!userRole || !['admin', 'ceo'].includes(userRole)) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `No tienes permisos de administrador. Rol actual: ${userRole || 'ninguno'}`,
        }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body: RequestBody = await req.json();
    const { action, userId, role, filters, proExpiresAt } = body;

    console.log(`📥 Admin action: ${action}`, { userId, role, filters });

    // ================================================================
    // ACTIONS
    // ================================================================

    switch (action) {
      // ----------------------------------------------------------------
      // LISTAR USUARIOS
      // ----------------------------------------------------------------
      case 'list': {
        let query = supabase
          .from('profiles')
          .select(
            `
            id,
            email,
            full_name,
            avatar_url,
            created_at,
            training_frequency
          `
          )
          .order('created_at', { ascending: false });

        if (filters?.search) {
          query = query.or(`email.ilike.%${filters.search}%,full_name.ilike.%${filters.search}%`);
        }

        if (filters?.limit) {
          query = query.limit(filters.limit);
        }

        if (filters?.offset) {
          query = query.range(filters.offset, filters.offset + (filters.limit || 50) - 1);
        }

        const { data: profiles, error: profilesError } = await query;
        if (profilesError) throw profilesError;

        // Obtener roles
        const { data: roles } = await supabase
          .from('user_roles')
          .select('user_id, role, pro_expires_at');

        // Obtener suscripciones
        const { data: subscriptions } = await supabase
          .from('subscriptions')
          .select(
            'user_id, status, openpay_subscription_id, openpay_card_last4, openpay_card_brand, current_period_end'
          );

        const rolesMap = new Map(roles?.map((r) => [r.user_id, r]) || []);
        const subsMap = new Map(
          subscriptions?.map((s) => [
            s.user_id,
            {
              ...s,
              // Mapear a nombres que espera el frontend
              card_last4: s.openpay_card_last4,
              card_brand: s.openpay_card_brand,
            },
          ]) || []
        );

        const users = (profiles || []).map((p) => ({
          ...p,
          role: rolesMap.get(p.id)?.role || 'free',
          pro_expires_at: rolesMap.get(p.id)?.pro_expires_at,
          subscription: subsMap.get(p.id) || null,
        }));

        // Filtrar por rol si se especifica
        const filteredUsers = filters?.role ? users.filter((u) => u.role === filters.role) : users;

        // Stats
        const stats = {
          total: users.length,
          pro: users.filter((u) => u.role === 'pro').length,
          free: users.filter((u) => u.role === 'free').length,
          admin: users.filter((u) => u.role === 'admin').length,
          withSubscription: users.filter((u) => u.subscription?.status === 'active').length,
        };

        return new Response(
          JSON.stringify({
            success: true,
            users: filteredUsers,
            stats,
          }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      // ----------------------------------------------------------------
      // OBTENER USUARIO ESPECÍFICO
      // ----------------------------------------------------------------
      case 'get': {
        if (!userId) throw new Error('userId requerido');

        const { data: profile } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', userId)
          .single();

        const { data: roleData } = await supabase
          .from('user_roles')
          .select('*')
          .eq('user_id', userId)
          .single();

        const { data: subscription } = await supabase
          .from('subscriptions')
          .select('*')
          .eq('user_id', userId)
          .single();

        // Obtener info de Openpay si hay suscripción
        let openpayData = null;
        if (subscription?.openpay_customer_id) {
          try {
            const openpayRes = await fetch(
              `${OPENPAY_API_URL}/${OPENPAY_MERCHANT_ID}/customers/${subscription.openpay_customer_id}`,
              {
                headers: {
                  Authorization: `Basic ${btoa(OPENPAY_PRIVATE_KEY + ':')}`,
                },
              }
            );
            if (openpayRes.ok) {
              openpayData = await openpayRes.json();
            }
          } catch (e) {
            console.error('Error fetching Openpay data:', e);
          }
        }

        // Obtener tarjetas guardadas
        const { data: savedCards } = await supabase
          .from('customer_cards')
          .select('*')
          .eq('user_id', userId)
          .order('is_default', { ascending: false })
          .order('created_at', { ascending: false });

        return new Response(
          JSON.stringify({
            success: true,
            user: {
              ...profile,
              role: roleData?.role || 'free',
              pro_expires_at: roleData?.pro_expires_at,
              subscription,
              openpay: openpayData,
              saved_cards: (savedCards || []).map((c: any) => ({
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
              })),
            },
          }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      // ----------------------------------------------------------------
      // CREAR USUARIO MANUALMENTE
      // ----------------------------------------------------------------
      case 'create': {
        const { createData } = body;
        if (!createData) throw new Error('createData requerido');
        if (!createData.email) throw new Error('email requerido');
        if (!createData.password) throw new Error('password requerido');
        if (createData.password.length < 6)
          throw new Error('La contraseña debe tener al menos 6 caracteres');

        // Verificar que el email no exista
        const { data: existingUser } = await supabase
          .from('profiles')
          .select('id')
          .eq('email', createData.email.toLowerCase())
          .single();

        if (existingUser) {
          throw new Error('Ya existe un usuario con ese email');
        }

        console.log('📝 Creating user:', createData.email);

        // Crear usuario en Auth usando Admin API
        const { data: authData, error: authError } = await supabase.auth.admin.createUser({
          email: createData.email.toLowerCase(),
          password: createData.password,
          email_confirm: true, // Auto-confirmar email
          user_metadata: {
            full_name: createData.fullName || '',
            phone: createData.phone || '',
          },
        });

        if (authError) {
          console.error('❌ Auth error:', authError);
          throw new Error(`Error al crear usuario: ${authError.message}`);
        }

        const newUserId = authData.user.id;
        console.log('✅ Auth user created:', newUserId);

        // Crear perfil en profiles (puede que el trigger ya lo haya hecho)
        const { error: profileError } = await supabase.from('profiles').upsert(
          {
            id: newUserId,
            email: createData.email.toLowerCase(),
            full_name: createData.fullName || null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'id' }
        );

        if (profileError) {
          console.error('⚠️ Profile upsert warning:', profileError);
          // No lanzar error porque el trigger puede haberlo creado
        }

        // Asignar rol si se especifica
        const userRole = createData.grantPro ? 'pro' : createData.role || 'free';
        if (userRole !== 'free') {
          const roleExpiresAt =
            createData.grantPro && createData.proExpiresAt
              ? createData.proExpiresAt
              : createData.grantPro
                ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() // 30 días por defecto
                : null;

          const { error: roleError } = await supabase.from('user_roles').upsert(
            {
              user_id: newUserId,
              role: userRole,
              pro_expires_at: roleExpiresAt,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'user_id' }
          );

          if (roleError) {
            console.error('⚠️ Role upsert error:', roleError);
          }
        }

        // Asignar deporte GYM por defecto
        const { data: gymSport } = await supabase
          .from('sports')
          .select('id')
          .eq('code', 'GYM')
          .eq('is_active', true)
          .single();

        if (gymSport) {
          // Crear user_profile con active_sport_id
          await supabase.from('user_profiles').upsert(
            {
              user_id: newUserId,
              active_sport_id: gymSport.id,
            },
            { onConflict: 'user_id' }
          );

          // Asignar GYM como deporte del usuario
          await supabase.from('user_sports').upsert(
            {
              user_id: newUserId,
              sport_id: gymSport.id,
              is_active: true,
              is_primary: true,
            },
            { onConflict: 'user_id,sport_id' }
          );

          console.log('✅ GYM sport assigned to new user:', newUserId);
        }

        console.log('✅ User created successfully:', {
          id: newUserId,
          email: createData.email,
          role: userRole,
        });

        return new Response(
          JSON.stringify({
            success: true,
            user: {
              id: newUserId,
              email: createData.email.toLowerCase(),
              full_name: createData.fullName || null,
              role: userRole,
              created_at: new Date().toISOString(),
            },
          }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      // ----------------------------------------------------------------
      // ACTUALIZAR ROL
      // ----------------------------------------------------------------
      case 'update-role': {
        if (!userId || !role) throw new Error('userId y role requeridos');

        // Solo CEO puede crear otros admins
        if (role === 'admin' && userRole !== 'ceo') {
          throw new Error('Solo el CEO puede crear administradores');
        }

        // Upsert role
        const { error } = await supabase.from('user_roles').upsert(
          {
            user_id: userId,
            role,
            pro_expires_at: role === 'pro' && proExpiresAt ? proExpiresAt : null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id' }
        );

        if (error) throw error;

        console.log(`✅ Role updated: ${userId} -> ${role}`);

        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // ----------------------------------------------------------------
      // OTORGAR PRO MANUALMENTE
      // ----------------------------------------------------------------
      case 'grant-pro': {
        if (!userId) throw new Error('userId requerido');

        const expiresAt =
          proExpiresAt || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

        const { error } = await supabase.from('user_roles').upsert(
          {
            user_id: userId,
            role: 'pro',
            pro_expires_at: expiresAt,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id' }
        );

        if (error) throw error;

        console.log(`✅ PRO granted: ${userId} until ${expiresAt}`);

        return new Response(JSON.stringify({ success: true, expiresAt }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // ----------------------------------------------------------------
      // REVOCAR PRO
      // ----------------------------------------------------------------
      case 'revoke-pro': {
        if (!userId) throw new Error('userId requerido');

        const { error } = await supabase
          .from('user_roles')
          .update({
            role: 'free',
            pro_expires_at: null,
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', userId);

        if (error) throw error;

        console.log(`✅ PRO revoked: ${userId}`);

        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // ----------------------------------------------------------------
      // CANCELAR SUSCRIPCIÓN EN OPENPAY
      // ----------------------------------------------------------------
      case 'cancel-subscription': {
        if (!userId) throw new Error('userId requerido');

        const { data: subscription } = await supabase
          .from('subscriptions')
          .select('*')
          .eq('user_id', userId)
          .single();

        if (!subscription?.openpay_subscription_id) {
          throw new Error('El usuario no tiene suscripción activa');
        }

        // Cancelar en Openpay
        const cancelRes = await fetch(
          `${OPENPAY_API_URL}/${OPENPAY_MERCHANT_ID}/customers/${subscription.openpay_customer_id}/subscriptions/${subscription.openpay_subscription_id}`,
          {
            method: 'DELETE',
            headers: {
              Authorization: `Basic ${btoa(OPENPAY_PRIVATE_KEY + ':')}`,
            },
          }
        );

        if (!cancelRes.ok) {
          const error = await cancelRes.json();
          console.error('Openpay cancel error:', error);
          // Continuar de todos modos para actualizar la DB
        }

        // Actualizar en Supabase
        await supabase
          .from('subscriptions')
          .update({
            status: 'cancelled',
            cancelled_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', userId);

        // Cambiar rol a free
        await supabase
          .from('user_roles')
          .update({ role: 'free', updated_at: new Date().toISOString() })
          .eq('user_id', userId);

        console.log(`✅ Subscription cancelled: ${userId}`);

        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // ----------------------------------------------------------------
      // OBTENER DETALLES DE SUSCRIPCIÓN OPENPAY
      // ----------------------------------------------------------------
      case 'get-subscription': {
        if (!userId) throw new Error('userId requerido');

        const { data: subscription } = await supabase
          .from('subscriptions')
          .select('*')
          .eq('user_id', userId)
          .single();

        if (!subscription?.openpay_subscription_id) {
          return new Response(JSON.stringify({ success: true, subscription: null }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // Obtener de Openpay
        let openpaySubscription = null;
        try {
          const res = await fetch(
            `${OPENPAY_API_URL}/${OPENPAY_MERCHANT_ID}/customers/${subscription.openpay_customer_id}/subscriptions/${subscription.openpay_subscription_id}`,
            {
              headers: {
                Authorization: `Basic ${btoa(OPENPAY_PRIVATE_KEY + ':')}`,
              },
            }
          );
          if (res.ok) {
            openpaySubscription = await res.json();
          }
        } catch (e) {
          console.error('Error fetching subscription:', e);
        }

        return new Response(
          JSON.stringify({
            success: true,
            subscription: {
              ...subscription,
              openpay: openpaySubscription,
            },
          }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      // ----------------------------------------------------------------
      // HISTORIAL DE PAGOS
      // ----------------------------------------------------------------
      case 'get-payments': {
        if (!userId) throw new Error('userId requerido');

        // Buscar customer_id en subscriptions O en customer_cards (fallback)
        let customerId: string | null = null;
        const { data: subForPayments } = await supabase
          .from('subscriptions')
          .select('openpay_customer_id')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        customerId = subForPayments?.openpay_customer_id || null;

        if (!customerId) {
          const { data: cardForPayments } = await supabase
            .from('customer_cards')
            .select('openpay_customer_id')
            .eq('user_id', userId)
            .limit(1)
            .maybeSingle();
          customerId = cardForPayments?.openpay_customer_id || null;
        }

        if (!customerId) {
          return new Response(JSON.stringify({ success: true, payments: [] }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // Obtener cargos de Openpay
        let payments = [];
        try {
          const res = await fetch(
            `${OPENPAY_API_URL}/${OPENPAY_MERCHANT_ID}/customers/${customerId}/charges`,
            {
              headers: {
                Authorization: `Basic ${btoa(OPENPAY_PRIVATE_KEY + ':')}`,
              },
            }
          );
          if (res.ok) {
            payments = await res.json();
          }
        } catch (e) {
          console.error('Error fetching payments:', e);
        }

        return new Response(JSON.stringify({ success: true, payments }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // ----------------------------------------------------------------
      // ELIMINAR USUARIO
      // ----------------------------------------------------------------
      case 'delete': {
        if (!userId) throw new Error('userId requerido');

        // Solo CEO puede eliminar usuarios
        if (userRole !== 'ceo') {
          throw new Error('Solo el CEO puede eliminar usuarios');
        }

        // Primero cancelar suscripción si existe
        const { data: subscription } = await supabase
          .from('subscriptions')
          .select('*')
          .eq('user_id', userId)
          .single();

        if (subscription?.openpay_customer_id) {
          // Cancelar suscripción activa
          if (subscription.openpay_subscription_id) {
            try {
              const cancelRes = await fetch(
                `${OPENPAY_API_URL}/${OPENPAY_MERCHANT_ID}/customers/${subscription.openpay_customer_id}/subscriptions/${subscription.openpay_subscription_id}`,
                {
                  method: 'DELETE',
                  headers: {
                    Authorization: `Basic ${btoa(OPENPAY_PRIVATE_KEY + ':')}`,
                  },
                }
              );
              // 404 = already cancelled, that's fine
              if (!cancelRes.ok && cancelRes.status !== 404) {
                console.error('Error cancelling subscription:', await cancelRes.text());
              }
            } catch (e) {
              console.error('Error cancelling subscription:', e);
            }
          }

          // Eliminar customer de OpenPay para evitar cobros fantasma
          try {
            const delRes = await fetch(
              `${OPENPAY_API_URL}/${OPENPAY_MERCHANT_ID}/customers/${subscription.openpay_customer_id}`,
              {
                method: 'DELETE',
                headers: {
                  Authorization: `Basic ${btoa(OPENPAY_PRIVATE_KEY + ':')}`,
                },
              }
            );
            if (delRes.ok || delRes.status === 404) {
              console.log('✅ OpenPay customer deleted:', subscription.openpay_customer_id);
            } else {
              console.warn('⚠️ Could not delete OpenPay customer:', await delRes.text());
            }
          } catch (e) {
            console.error('Error deleting OpenPay customer:', e);
          }
        }

        // Eliminar de tablas relacionadas
        await supabase.from('customer_cards').delete().eq('user_id', userId);
        await supabase.from('subscriptions').delete().eq('user_id', userId);
        await supabase.from('user_roles').delete().eq('user_id', userId);
        await supabase.from('profiles').delete().eq('id', userId);

        // Eliminar usuario de auth
        const { error: deleteError } = await supabase.auth.admin.deleteUser(userId);
        if (deleteError) {
          console.error('Error deleting auth user:', deleteError);
        }

        console.log(`✅ User deleted: ${userId}`);

        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // ----------------------------------------------------------------
      // OBTENER TARJETAS GUARDADAS DE UN USUARIO
      // ----------------------------------------------------------------
      case 'get-cards': {
        if (!userId) throw new Error('userId requerido');

        // Buscar en DB local
        const { data: dbCards } = await supabase
          .from('customer_cards')
          .select('*')
          .eq('user_id', userId)
          .order('is_default', { ascending: false })
          .order('created_at', { ascending: false });

        // También sincronizar desde OpenPay si hay customer_id
        // Buscar en subscriptions O en customer_cards (fallback)
        let cardsCustomerId: string | null = null;
        const { data: subForCards } = await supabase
          .from('subscriptions')
          .select('openpay_customer_id')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        cardsCustomerId = subForCards?.openpay_customer_id || null;

        if (!cardsCustomerId && dbCards && dbCards.length > 0) {
          cardsCustomerId = dbCards[0].openpay_customer_id || null;
        }

        let openpayCardsList: any[] = [];
        if (cardsCustomerId) {
          try {
            const cardsRes = await fetch(
              `${OPENPAY_API_URL}/${OPENPAY_MERCHANT_ID}/customers/${cardsCustomerId}/cards`,
              {
                headers: {
                  Authorization: `Basic ${btoa(OPENPAY_PRIVATE_KEY + ':')}`,
                },
              }
            );
            if (cardsRes.ok) {
              openpayCardsList = await cardsRes.json();

              // Sincronizar tarjetas nuevas a DB
              for (const card of openpayCardsList) {
                await supabase.from('customer_cards').upsert(
                  {
                    user_id: userId,
                    openpay_customer_id: cardsCustomerId,
                    openpay_card_id: card.id,
                    last4: card.card_number?.slice(-4) || '',
                    brand: card.brand || 'unknown',
                    type: card.type || 'credit',
                    holder_name: card.holder_name || '',
                    expiration_month: card.expiration_month || '',
                    expiration_year: card.expiration_year || '',
                    allows_charges: card.allows_charges ?? true,
                  },
                  { onConflict: 'openpay_card_id' }
                );
              }
            }
          } catch (e) {
            console.error('Error fetching OpenPay cards:', e);
          }
        }

        // Re-leer de DB (ya sincronizado)
        const { data: finalCards } = await supabase
          .from('customer_cards')
          .select('*')
          .eq('user_id', userId)
          .order('is_default', { ascending: false })
          .order('created_at', { ascending: false });

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

      // ----------------------------------------------------------------
      // ELIMINAR TARJETA DE UN USUARIO
      // ----------------------------------------------------------------
      case 'delete-card': {
        if (!userId) throw new Error('userId requerido');
        const { cardId } = body;
        if (!cardId) throw new Error('cardId requerido');

        // Obtener customer_id
        const { data: cardRecord } = await supabase
          .from('customer_cards')
          .select('openpay_customer_id, is_default')
          .eq('openpay_card_id', cardId)
          .eq('user_id', userId)
          .single();

        if (!cardRecord) {
          throw new Error('Tarjeta no encontrada');
        }

        // Eliminar en OpenPay
        try {
          await fetch(
            `${OPENPAY_API_URL}/${OPENPAY_MERCHANT_ID}/customers/${cardRecord.openpay_customer_id}/cards/${cardId}`,
            {
              method: 'DELETE',
              headers: {
                Authorization: `Basic ${btoa(OPENPAY_PRIVATE_KEY + ':')}`,
              },
            }
          );
        } catch (e) {
          console.error('Error deleting card from OpenPay:', e);
        }

        // Eliminar de DB
        await supabase
          .from('customer_cards')
          .delete()
          .eq('openpay_card_id', cardId)
          .eq('user_id', userId);

        // Si era la default, asignar otra
        if (cardRecord.is_default) {
          const { data: remaining } = await supabase
            .from('customer_cards')
            .select('id')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(1);

          if (remaining && remaining.length > 0) {
            await supabase
              .from('customer_cards')
              .update({ is_default: true })
              .eq('id', remaining[0].id);
          }
        }

        console.log(`✅ Card deleted for user ${userId}: ${cardId}`);

        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // ================================================================
      // IMPERSONATE - Iniciar sesión como otro usuario (solo CEO)
      // ================================================================
      case 'impersonate': {
        if (userRole !== 'ceo') {
          return new Response(
            JSON.stringify({ success: false, error: 'Solo el CEO puede impersonar usuarios' }),
            { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        if (!userId) throw new Error('userId es requerido');

        // Obtener email del usuario target
        const { data: targetProfile, error: targetError } = await supabase
          .from('profiles')
          .select('email')
          .eq('id', userId)
          .single();

        if (targetError || !targetProfile?.email) {
          throw new Error('No se encontró el email del usuario');
        }

        console.log(`🎭 CEO impersonating user: ${targetProfile.email}`);

        // Generar magic link para el usuario target
        const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
          type: 'magiclink',
          email: targetProfile.email,
        });

        if (linkError || !linkData?.properties?.action_link) {
          throw new Error('Error generando link: ' + (linkError?.message || 'sin action_link'));
        }

        console.log(`✅ Magic link generated for ${targetProfile.email}`);

        return new Response(
          JSON.stringify({
            success: true,
            token_hash: linkData.properties.hashed_token,
            email: targetProfile.email,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // ================================================================
      // ASIGNAR PLAN DE ENTRENAMIENTO
      // ================================================================
      case 'assign-plan': {
        if (!userId) throw new Error('userId es requerido');
        const templateId = body.templateId;
        if (!templateId) throw new Error('templateId es requerido');

        console.log(`🏋️ Assigning plan ${templateId} to user ${userId}`);

        // 1. Obtener template
        const { data: template, error: tplError } = await supabase
          .from('training_plan_templates')
          .select('*')
          .eq('id', templateId)
          .eq('is_active', true)
          .single();

        if (tplError || !template) {
          throw new Error('Plan no encontrado o no está activo');
        }

        // 2. Construir nombres de rutina
        const routineNames: Record<string, string> = {};
        (template.days || []).forEach((day: any) => {
          routineNames[String(day.dayIndex)] = day.name;
        });

        // 3. Actualizar profiles
        const { error: profileError } = await supabase
          .from('profiles')
          .update({
            training_frequency: template.frequency,
            training_current_day: 0,
            training_routine_names: routineNames,
            plan_source: 'admin',
            updated_at: new Date().toISOString(),
          })
          .eq('id', userId);

        if (profileError) throw new Error('Error al actualizar perfil: ' + profileError.message);

        // 4. Actualizar user_profiles
        await supabase.from('user_profiles').upsert(
          {
            user_id: userId,
            training_days_per_week: template.frequency,
            training_experience: template.target_levels?.[0] || 'INTERMEDIO',
            goal: template.target_goals?.[0] || 'HIPERTROFIA',
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id' }
        );

        // 5. Eliminar ejercicios anteriores
        await supabase.from('user_exercise_config').delete().eq('user_id', userId);

        // 6. Crear ejercicios del template
        let exercisesCreated = 0;
        const exerciseErrors: string[] = [];

        for (const day of template.days || []) {
          for (const exercise of day.exercises || []) {
            if (!exercise.exercise_id) continue;

            const config = {
              rest: exercise.rest || '90s',
              sets: `${exercise.series?.length || 4}x10`,
              custom_series: (exercise.series || []).map((s: any, idx: number) => ({
                id: s.id || String(idx + 1),
                type: s.type || 'EFECTIVA',
                reps: s.reps || 10,
                weight: 0,
                rir: s.type === 'FALLO' ? 0 : 2,
                tempo: '2-0-2-0',
                restSeconds: parseInt(exercise.rest) || 90,
                note: s.note || '',
              })),
              series_by_day: {},
            };

            const { error: insertError } = await supabase.from('user_exercise_config').insert({
              user_id: userId,
              exercise_id: exercise.exercise_id,
              training_days: [day.dayIndex],
              config,
            });

            if (insertError) {
              console.error('Error inserting exercise:', exercise.name, insertError.message);
              exerciseErrors.push(exercise.name || exercise.exercise_id);
            } else {
              exercisesCreated++;
            }
          }
        }

        console.log(
          `✅ Plan "${template.name}" assigned: ${exercisesCreated} exercises, ${exerciseErrors.length} errors`
        );

        return new Response(
          JSON.stringify({
            success: true,
            planName: template.name,
            frequency: template.frequency,
            exercisesCreated,
            errors: exerciseErrors,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // ================================================================
      // OBTENER PLAN ACTUAL DEL USUARIO
      // ================================================================
      case 'get-user-plan': {
        if (!userId) throw new Error('userId es requerido');

        const { data: planData, error: planError } = await supabase
          .from('profiles')
          .select('training_frequency, training_routine_names, plan_source')
          .eq('id', userId)
          .single();

        if (planError || !planData) {
          return new Response(JSON.stringify({ success: true, plan: null }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        if (!planData.training_frequency || planData.training_frequency === 0) {
          return new Response(JSON.stringify({ success: true, plan: null }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        return new Response(
          JSON.stringify({
            success: true,
            plan: {
              frequency: planData.training_frequency,
              routineNames: planData.training_routine_names || {},
              planSource: planData.plan_source,
            },
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      default:
        throw new Error(`Acción no válida: ${action}`);
    }
  } catch (error) {
    console.error('❌ Admin users error:', error);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
