// ============================================================================
// CARD MANAGEMENT SERVICE - Client-side
// Servicio para gestionar tarjetas guardadas del usuario
// ============================================================================

import { supabase } from '../lib/supabase';
import type { SavedCard, CustomerCard } from '../types/subscription';

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Extrae el mensaje de error real desde una respuesta de edge function.
 * supabase-js arroja FunctionsHttpError con `context: Response` cuando el
 * status no es 2xx — el body JSON sigue ahí pero hay que leerlo a mano.
 */
async function extractFnError(error: any, data: any, fallback: string): Promise<string> {
  if (data?.error) return data.error;
  if (error?.context && typeof error.context.json === 'function') {
    try {
      const body = await error.context.json();
      if (body?.error) return body.error;
      if (body?.message) return body.message;
    } catch {
      try {
        const txt = await error.context.text();
        if (txt) return txt;
      } catch {}
    }
  }
  return error?.message || fallback;
}

// ============================================================================
// OBTENER MIS TARJETAS
// ============================================================================

/**
 * Obtener todas las tarjetas guardadas del usuario autenticado.
 * Primero intenta desde Supabase (rápido), luego sincroniza con OpenPay.
 */
export async function getMyCards(): Promise<SavedCard[]> {
  const { data, error } = await supabase.functions.invoke('openpay-cards', {
    body: { action: 'list-my-cards' },
  });

  if (error || !data?.success) {
    throw new Error(await extractFnError(error, data, 'Error al obtener tarjetas'));
  }

  return data.cards || [];
}

// ============================================================================
// GUARDAR NUEVA TARJETA
// ============================================================================

/**
 * Guardar una nueva tarjeta para el usuario actual.
 * Requiere tokenizar primero con openpay.createCardToken().
 */
export async function saveCard(tokenId: string, deviceSessionId?: string): Promise<SavedCard> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error('No autenticado');

  const { data, error } = await supabase.functions.invoke('openpay-cards', {
    body: {
      action: 'save',
      tokenId,
      userId: user.id,
      deviceSessionId,
    },
  });

  if (error || !data?.success) {
    throw new Error(await extractFnError(error, data, 'Error al guardar tarjeta'));
  }

  return data.card;
}

// ============================================================================
// ELIMINAR TARJETA
// ============================================================================

/**
 * Eliminar una tarjeta guardada.
 */
export async function deleteCard(cardId: string): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error('No autenticado');

  const { data, error } = await supabase.functions.invoke('openpay-cards', {
    body: {
      action: 'delete',
      cardId,
      userId: user.id,
    },
  });

  if (error || !data?.success) {
    throw new Error(data?.error || error?.message || 'Error al eliminar tarjeta');
  }
}

// ============================================================================
// MARCAR COMO PREDETERMINADA
// ============================================================================

/**
 * Establecer una tarjeta como la predeterminada para cobros futuros.
 */
export async function setDefaultCard(cardId: string): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error('No autenticado');

  const { data, error } = await supabase.functions.invoke('openpay-cards', {
    body: {
      action: 'set-default',
      cardId,
      userId: user.id,
    },
  });

  if (error || !data?.success) {
    throw new Error(data?.error || error?.message || 'Error al establecer tarjeta predeterminada');
  }
}

// ============================================================================
// OBTENER TARJETA DEFAULT
// ============================================================================

/**
 * Obtener la tarjeta predeterminada del usuario autenticado.
 */
export async function getDefaultCard(): Promise<SavedCard | null> {
  const cards = await getMyCards();
  return cards.find((c) => c.is_default) || cards[0] || null;
}

// ============================================================================
// OBTENER TARJETAS DESDE DB LOCAL (sin llamar a edge function)
// ============================================================================

/**
 * Obtener tarjetas desde la tabla customer_cards de Supabase.
 * Más rápido que llamar al edge function.
 */
export async function getMyCardsLocal(): Promise<CustomerCard[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error('No autenticado');

  const { data, error } = await supabase
    .from('customer_cards')
    .select('*')
    .eq('user_id', user.id)
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

// ============================================================================
// ADMIN: OBTENER TARJETAS DE UN USUARIO
// ============================================================================

/**
 * Obtener tarjetas de cualquier usuario (requiere permisos admin).
 */
export async function getUserCards(userId: string): Promise<SavedCard[]> {
  const { data, error } = await supabase.functions.invoke('openpay-cards', {
    body: { action: 'list-cards', userId },
  });

  if (error || !data?.success) {
    throw new Error(data?.error || error?.message || 'Error al obtener tarjetas del usuario');
  }

  return data.cards || [];
}

// ============================================================================
// CAMBIAR TARJETA DE SUSCRIPCIÓN
// ============================================================================

/**
 * Cambia la tarjeta usada para el cobro recurrente de la suscripción.
 * Internamente cancela la suscripción actual y crea una nueva con la tarjeta indicada.
 */
export async function swapSubscriptionCard(
  newCardId: string
): Promise<{ success: boolean; subscriptionId?: string; error?: string }> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error('No autenticado');

  const { data, error } = await supabase.functions.invoke('swap-subscription-card', {
    body: { newCardId },
  });

  if (error || !data?.success) {
    throw new Error(data?.error || error?.message || 'Error al cambiar tarjeta de suscripción');
  }

  return data;
}

// ============================================================================
// DEFAULT EXPORT
// ============================================================================

const cardsService = {
  getMyCards,
  saveCard,
  deleteCard,
  setDefaultCard,
  getDefaultCard,
  getMyCardsLocal,
  getUserCards,
  swapSubscriptionCard,
};

export default cardsService;
