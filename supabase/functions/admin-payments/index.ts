// ============================================================================
// ADMIN PAYMENTS - Supabase Edge Function
// Gestión de pagos, métricas financieras y sincronización con Openpay
// ============================================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Openpay Config (desde variables de entorno)
const OPENPAY_PRIVATE_KEY = Deno.env.get('OPENPAY_PRIVATE_KEY') || '';
const OPENPAY_MERCHANT_ID = Deno.env.get('OPENPAY_MERCHANT_ID') || '';
const OPENPAY_API_URL = 'https://api.openpay.pe/v1';

// Helper para generar el header de autorización dinámicamente
const getOpenpayAuth = (): string => {
  const credentials = btoa(`${OPENPAY_PRIVATE_KEY}:`);
  return `Basic ${credentials}`;
};

type Action = 'list-payments' | 'get-stats' | 'get-chart-data' | 'sync-openpay' | 'refund';

interface RequestBody {
  action: Action;
  filters?: {
    status?: string;
    dateFrom?: string;
    dateTo?: string;
    userId?: string;
  };
  paymentId?: string;
  reason?: string;
  // Para get-chart-data con rango personalizado
  dateFrom?: string;
  dateTo?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verificar autorización
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

    // Verificar rol CEO/Admin
    // 1) Primero checar admin_users (fuente principal del panel admin)
    const { data: adminData } = await supabase
      .from('admin_users')
      .select('role')
      .eq('user_id', user.id)
      .single();

    let paymentUserRole = adminData?.role || null;

    // 2) Fallback: checar user_roles
    if (!paymentUserRole) {
      const { data: roleData } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .single();

      paymentUserRole = roleData?.role;
    }

    // 3) Fallback final: verificar si es CEO por email
    if (!paymentUserRole) {
      const ceoEmails = [
        'micorp.latam@gmail.com',
        'm.sanchez@neurocodestudio.com',
        'admin@trens.app',
      ];
      if (user.email && ceoEmails.includes(user.email)) {
        paymentUserRole = 'ceo';
      }
    }

    if (!paymentUserRole || !['admin', 'ceo'].includes(paymentUserRole)) {
      return new Response(
        JSON.stringify({ success: false, error: 'Sin permisos de administrador' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body: RequestBody = await req.json();
    const { action, filters, paymentId, reason } = body;

    // ========================================================================
    // DEBUG - Probar conexión directa a Openpay
    // ========================================================================
    if (action === 'debug-openpay') {
      const authHeader = getOpenpayAuth();
      const url = `${OPENPAY_API_URL}/${OPENPAY_MERCHANT_ID}/charges?limit=5`;

      const response = await fetch(url, {
        headers: { Authorization: authHeader },
      });

      const status = response.status;
      const responseText = await response.text();
      let parsed = null;
      try {
        parsed = JSON.parse(responseText);
      } catch (e) {
        // no es JSON
      }

      return new Response(
        JSON.stringify({
          success: true,
          debug: {
            url,
            authHeaderPreview: authHeader.substring(0, 30) + '...',
            responseStatus: status,
            responseOk: response.ok,
            chargesCount: Array.isArray(parsed) ? parsed.length : 0,
            firstCharge:
              Array.isArray(parsed) && parsed.length > 0
                ? {
                    id: parsed[0].id,
                    status: parsed[0].status,
                    amount: parsed[0].amount,
                    creation_date: parsed[0].creation_date,
                  }
                : null,
            rawResponse: responseText.substring(0, 500),
          },
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // ========================================================================
    // LIST PAYMENTS - Obtener pagos desde Openpay
    // ========================================================================
    if (action === 'list-payments') {
      // Obtener charges desde Openpay
      const chargesResponse = await fetch(
        `${OPENPAY_API_URL}/${OPENPAY_MERCHANT_ID}/charges?limit=100`,
        {
          headers: {
            Authorization: getOpenpayAuth(),
          },
        }
      );

      const charges = chargesResponse.ok ? await chargesResponse.json() : [];

      // Obtener perfiles para mapear emails
      const { data: profiles } = await supabase.from('profiles').select('id, email, full_name');

      const { data: subscriptions } = await supabase
        .from('subscriptions')
        .select('user_id, openpay_customer_id');

      // Mapear customer_id a user_id
      const customerToUser = new Map(
        subscriptions?.map((s) => [s.openpay_customer_id, s.user_id]) || []
      );
      const profileMap = new Map(profiles?.map((p) => [p.id, p]) || []);

      const payments = charges.map((charge: any) => {
        const userId = customerToUser.get(charge.customer_id);
        const profile = userId ? profileMap.get(userId) : null;

        return {
          id: charge.id,
          user_id: userId || null,
          user_email: profile?.email || charge.customer?.email || 'N/A',
          user_name: profile?.full_name || charge.customer?.name || 'N/A',
          amount: charge.amount,
          currency: charge.currency?.toUpperCase() || 'PEN',
          status: mapOpenpayStatus(charge.status),
          openpay_transaction_id: charge.authorization,
          card_brand: charge.card?.brand,
          card_last4: charge.card?.card_number?.slice(-4),
          description: charge.description,
          error_message: charge.error_message,
          created_at: charge.creation_date,
        };
      });

      // Aplicar filtros
      let filtered = payments;
      if (filters?.status) {
        filtered = filtered.filter((p: any) => p.status === filters.status);
      }
      if (filters?.userId) {
        filtered = filtered.filter((p: any) => p.user_id === filters.userId);
      }

      return new Response(JSON.stringify({ success: true, payments: filtered }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ========================================================================
    // GET STATS - Métricas financieras
    // ========================================================================
    if (action === 'get-stats') {
      // Obtener datos de la base de datos
      const { data: subscriptions } = await supabase.from('subscriptions').select('*');

      const { data: userRoles } = await supabase.from('user_roles').select('role, created_at');

      const { data: profiles } = await supabase.from('profiles').select('id, created_at');

      // Obtener charges de Openpay
      const openpayUrl = `${OPENPAY_API_URL}/${OPENPAY_MERCHANT_ID}/charges?limit=100`;
      const authHeader = getOpenpayAuth();
      console.log('[get-stats] Calling Openpay:', openpayUrl);
      console.log('[get-stats] Auth header length:', authHeader.length);

      const chargesResponse = await fetch(openpayUrl, {
        headers: {
          Authorization: authHeader,
        },
      });

      console.log('[get-stats] Openpay response status:', chargesResponse.status);

      let charges: any[] = [];
      if (chargesResponse.ok) {
        charges = await chargesResponse.json();
        console.log('[get-stats] Openpay charges count:', charges.length);
      } else {
        const errorText = await chargesResponse.text();
        console.error('[get-stats] Openpay error:', errorText);
      }

      // Calcular métricas
      const now = new Date();
      const thisMonth = now.toISOString().slice(0, 7); // YYYY-MM
      const lastMonth = new Date(now.setMonth(now.getMonth() - 1)).toISOString().slice(0, 7);

      const activeSubscriptions = subscriptions?.filter((s) => s.status === 'active') || [];
      const cancelledThisMonth =
        subscriptions?.filter(
          (s) => s.status === 'cancelled' && s.cancelled_at?.startsWith(thisMonth)
        ) || [];

      const completedCharges = charges.filter((c: any) => c.status === 'completed');
      const thisMonthCharges = completedCharges.filter((c: any) =>
        c.creation_date?.startsWith(thisMonth)
      );
      const lastMonthCharges = completedCharges.filter((c: any) =>
        c.creation_date?.startsWith(lastMonth)
      );
      const failedCharges = charges.filter((c: any) => c.status === 'failed');
      const refundedCharges = charges.filter((c: any) => c.status === 'refunded');

      const revenueThisMonth = thisMonthCharges.reduce((sum: number, c: any) => sum + c.amount, 0);
      const revenueLastMonth = lastMonthCharges.reduce((sum: number, c: any) => sum + c.amount, 0);
      const totalRevenue = completedCharges.reduce((sum: number, c: any) => sum + c.amount, 0);

      // MRR = Suscripciones activas * precio mensual
      const MONTHLY_PRICE = 59.9;
      const mrr = activeSubscriptions.length * MONTHLY_PRICE;
      const arr = mrr * 12;

      // Usuarios
      const totalUsers = profiles?.length || 0;
      const proUsers = userRoles?.filter((r) => r.role === 'pro').length || 0;
      const freeUsers = totalUsers - proUsers;
      const newUsersThisMonth =
        profiles?.filter((p) => p.created_at?.startsWith(thisMonth)).length || 0;
      const newProThisMonth =
        userRoles?.filter((r) => r.role === 'pro' && r.created_at?.startsWith(thisMonth)).length ||
        0;

      // Tasas
      const conversionRate = totalUsers > 0 ? (proUsers / totalUsers) * 100 : 0;
      const churnRate =
        activeSubscriptions.length > 0
          ? (cancelledThisMonth.length / activeSubscriptions.length) * 100
          : 0;
      const avgLifetimeValue = proUsers > 0 ? totalRevenue / proUsers : 0;
      const avgPaymentAmount =
        completedCharges.length > 0 ? totalRevenue / completedCharges.length : 0;

      // Revenue growth
      const revenueGrowth =
        revenueLastMonth > 0
          ? ((revenueThisMonth - revenueLastMonth) / revenueLastMonth) * 100
          : revenueThisMonth > 0
            ? 100
            : 0;

      const stats = {
        mrr,
        arr,
        totalRevenue,
        revenueThisMonth,
        revenueLastMonth,
        revenueGrowth,
        totalUsers,
        proUsers,
        freeUsers,
        newUsersThisMonth,
        newProThisMonth,
        conversionRate,
        churnRate,
        avgLifetimeValue,
        activeSubscriptions: activeSubscriptions.length,
        cancelledThisMonth: cancelledThisMonth.length,
        successfulPayments: completedCharges.length,
        failedPayments: failedCharges.length,
        refunds: refundedCharges.length,
        avgPaymentAmount,
      };

      return new Response(JSON.stringify({ success: true, stats }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ========================================================================
    // GET CHART DATA - Datos para gráficos (rango dinámico o últimos 6 meses)
    // ========================================================================
    if (action === 'get-chart-data') {
      const openpayUrl = `${OPENPAY_API_URL}/${OPENPAY_MERCHANT_ID}/charges?limit=100`;
      const authHeader = getOpenpayAuth();

      const chargesResponse = await fetch(openpayUrl, {
        headers: {
          Authorization: authHeader,
        },
      });

      const responseStatus = chargesResponse.status;
      const responseText = await chargesResponse.text();

      let charges: any[] = [];
      let openpayError = null;

      if (chargesResponse.ok) {
        try {
          charges = JSON.parse(responseText);
        } catch (e) {
          openpayError = 'Failed to parse JSON: ' + responseText.substring(0, 200);
        }
      } else {
        openpayError = `Status ${responseStatus}: ${responseText.substring(0, 200)}`;
      }

      const completedCharges = charges.filter((c: any) => c.status === 'completed');

      // Debug: log sample charge date format
      console.log(
        'Sample charges:',
        completedCharges.slice(0, 2).map((c: any) => ({
          id: c.id,
          creation_date: c.creation_date,
          amount: c.amount,
        }))
      );

      const { data: profiles } = await supabase.from('profiles').select('created_at');

      // Determinar rango de meses
      const now = new Date();
      let startDate: Date;
      let endDate: Date;

      console.log('DEBUG get-chart-data input:', {
        bodyDateFrom: body.dateFrom,
        bodyDateTo: body.dateTo,
      });

      if (body.dateFrom && body.dateTo) {
        // Usar rango personalizado - parse como fecha local
        const [fromYear, fromMonth, fromDay] = body.dateFrom.split('-').map(Number);
        const [toYear, toMonth, toDay] = body.dateTo.split('-').map(Number);
        startDate = new Date(fromYear, fromMonth - 1, fromDay);
        endDate = new Date(toYear, toMonth - 1, toDay);
      } else {
        // Default: mes actual
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      }

      console.log('DEBUG parsed dates:', {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        startMonth: startDate.getMonth(),
        startYear: startDate.getFullYear(),
      });

      // Helper para formatear fecha local sin UTC conversion
      const formatLocalMonth = (d: Date): string => {
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        return `${year}-${month}`;
      };

      // Generar array de meses entre las fechas
      const months: string[] = [];
      const current = new Date(startDate);
      while (current <= endDate) {
        months.push(formatLocalMonth(current));
        current.setMonth(current.getMonth() + 1);
      }

      // Si solo hay un mes, agregar datos diarios en vez de mensuales
      const isSingleMonth = months.length === 1;

      const monthNames = [
        'Ene',
        'Feb',
        'Mar',
        'Abr',
        'May',
        'Jun',
        'Jul',
        'Ago',
        'Sep',
        'Oct',
        'Nov',
        'Dic',
      ];

      let labels: string[];
      let revenue: number[];
      let users: number[];

      // Helper para normalizar fecha de Openpay (puede ser ISO o "YYYY-MM-DD HH:mm:ss")
      const normalizeDate = (dateStr: string): string => {
        if (!dateStr) return '';
        // Openpay puede retornar "2026-01-06T15:30:00-05:00" o "2026-01-06 15:30:00"
        // Extraemos solo YYYY-MM-DD
        return dateStr.slice(0, 10);
      };

      if (isSingleMonth) {
        // Datos diarios para un solo mes
        const daysInMonth = new Date(
          startDate.getFullYear(),
          startDate.getMonth() + 1,
          0
        ).getDate();
        const monthPrefix = months[0];

        console.log('DEBUG single month:', {
          isSingleMonth,
          monthPrefix,
          daysInMonth,
          months,
        });

        labels = Array.from({ length: daysInMonth }, (_, i) => String(i + 1));
        revenue = Array.from({ length: daysInMonth }, (_, i) => {
          const dayStr = `${monthPrefix}-${String(i + 1).padStart(2, '0')}`;
          const dayCharges = completedCharges.filter((c: any) => {
            const chargeDate = normalizeDate(c.creation_date);
            const matches = chargeDate === dayStr;
            if (matches) {
              console.log('DEBUG charge match:', { chargeDate, dayStr, amount: c.amount });
            }
            return matches;
          });
          return dayCharges.reduce((sum: number, c: any) => sum + c.amount, 0);
        });
        users = Array.from({ length: daysInMonth }, (_, i) => {
          const dayStr = `${monthPrefix}-${String(i + 1).padStart(2, '0')}`;
          return profiles?.filter((p) => normalizeDate(p.created_at) === dayStr).length || 0;
        });

        // Debug log
        console.log('Daily revenue calculation:', {
          monthPrefix,
          daysInMonth,
          completedChargesCount: completedCharges.length,
          sampleDates: completedCharges.slice(0, 3).map((c: any) => normalizeDate(c.creation_date)),
          revenue,
        });
      } else {
        // Datos mensuales
        labels = months.map((m) => {
          const [year, month] = m.split('-');
          return `${monthNames[parseInt(month, 10) - 1]} ${year.slice(2)}`;
        });

        revenue = months.map((m) =>
          completedCharges
            .filter((c: any) => normalizeDate(c.creation_date).startsWith(m))
            .reduce((sum: number, c: any) => sum + c.amount, 0)
        );

        users = months.map(
          (m) => profiles?.filter((p) => normalizeDate(p.created_at).startsWith(m)).length || 0
        );
      }

      // Calcular totales del período
      const totalRevenue = revenue.reduce((sum, v) => sum + v, 0);
      const totalUsers = users.reduce((sum, v) => sum + v, 0);

      // Debug info incluida en response
      const debugInfo = {
        requestedDateFrom: body.dateFrom,
        requestedDateTo: body.dateTo,
        parsedMonthPrefix: months[0],
        isSingleMonth,
        completedChargesCount: completedCharges.length,
        rawChargesCount: charges.length,
        openpayResponseStatus: responseStatus,
        openpayError: openpayError,
        authHeaderUsed: authHeader.substring(0, 30) + '...',
        chargesWithDates: completedCharges.slice(0, 5).map((c: any) => ({
          date: normalizeDate(c.creation_date),
          amount: c.amount,
        })),
        firstRawCharge:
          charges.length > 0 ? { id: charges[0].id, status: charges[0].status } : null,
      };

      return new Response(
        JSON.stringify({
          success: true,
          chartData: {
            labels,
            revenue,
            users,
            totalRevenue,
            totalUsers,
            dateFrom: body.dateFrom || formatLocalMonth(startDate) + '-01',
            dateTo: body.dateTo || formatLocalMonth(endDate) + '-' + endDate.getDate(),
            isSingleMonth,
            debug: debugInfo,
          },
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ========================================================================
    // SYNC OPENPAY - Sincronizar datos
    // ========================================================================
    if (action === 'sync-openpay') {
      // Obtener todas las suscripciones de Openpay
      const customersResponse = await fetch(
        `${OPENPAY_API_URL}/${OPENPAY_MERCHANT_ID}/customers?limit=100`,
        {
          headers: {
            Authorization: getOpenpayAuth(),
          },
        }
      );

      const customers = customersResponse.ok ? await customersResponse.json() : [];
      let synced = 0;

      for (const customer of customers) {
        // Obtener suscripciones del cliente
        const subsResponse = await fetch(
          `${OPENPAY_API_URL}/${OPENPAY_MERCHANT_ID}/customers/${customer.id}/subscriptions`,
          {
            headers: {
              Authorization: getOpenpayAuth(),
            },
          }
        );

        const subs = subsResponse.ok ? await subsResponse.json() : [];

        for (const sub of subs) {
          // Buscar usuario por email
          const { data: profile } = await supabase
            .from('profiles')
            .select('id')
            .eq('email', customer.email)
            .single();

          if (profile) {
            // Actualizar o insertar suscripción
            await supabase.from('subscriptions').upsert(
              {
                user_id: profile.id,
                openpay_customer_id: customer.id,
                openpay_subscription_id: sub.id,
                plan_id: sub.plan_id,
                status: sub.status,
                current_period_end: sub.period_end_date,
                openpay_card_last4: sub.card?.card_number?.slice(-4),
                openpay_card_brand: sub.card?.brand,
              },
              { onConflict: 'user_id' }
            );

            // Actualizar rol a PRO si está activo
            if (sub.status === 'active') {
              await supabase.from('user_roles').update({ role: 'pro' }).eq('user_id', profile.id);
            }

            synced++;
          }
        }
      }

      return new Response(JSON.stringify({ success: true, synced }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ========================================================================
    // REFUND - Procesar reembolso
    // ========================================================================
    if (action === 'refund') {
      if (!paymentId) {
        throw new Error('paymentId es requerido');
      }

      // Solo CEO puede hacer refunds
      if (roleData.role !== 'ceo') {
        throw new Error('Solo el CEO puede procesar reembolsos');
      }

      // Obtener el charge de Openpay
      const chargeResponse = await fetch(
        `${OPENPAY_API_URL}/${OPENPAY_MERCHANT_ID}/charges/${paymentId}`,
        {
          headers: {
            Authorization: getOpenpayAuth(),
          },
        }
      );

      if (!chargeResponse.ok) {
        throw new Error('Pago no encontrado en Openpay');
      }

      const charge = await chargeResponse.json();

      // Procesar refund
      const refundResponse = await fetch(
        `${OPENPAY_API_URL}/${OPENPAY_MERCHANT_ID}/charges/${paymentId}/refund`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: getOpenpayAuth(),
          },
          body: JSON.stringify({
            description: reason || 'Reembolso solicitado por CEO',
          }),
        }
      );

      if (!refundResponse.ok) {
        const error = await refundResponse.json();
        throw new Error(error.description || 'Error al procesar reembolso');
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    throw new Error(`Acción no válida: ${action}`);
  } catch (error: any) {
    console.error('Error:', error);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// Helper para mapear status de Openpay
function mapOpenpayStatus(status: string): string {
  const statusMap: Record<string, string> = {
    completed: 'completed',
    in_progress: 'pending',
    failed: 'failed',
    refunded: 'refunded',
    cancelled: 'cancelled',
    charge_pending: 'pending',
  };
  return statusMap[status] || status;
}
