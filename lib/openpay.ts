// ============================================================================
// OPENPAY PERU - CLIENT SDK
// Tokenización, validación, gestión de tarjetas y suscripciones
// ============================================================================

import { supabase } from './supabase';
import type {
  CardTokenData,
  CreateSubscriptionParams,
  CreateSubscriptionResult,
  SaveCardParams,
  DeleteCardParams,
  CardOperationResult,
  ChargeWithSavedCardParams,
  ChargeWithTokenParams,
  ChargeResult,
  PlanDetails,
} from '../types/subscription';

// ============================================================================
// CONFIGURACIÓN - Solo llave pública (client-side)
// Lee credenciales desde variables de entorno (app.json extra)
// ============================================================================

import Constants from 'expo-constants';

const extra = Constants.expoConfig?.extra;

const OPENPAY_CONFIG = {
  merchantId: extra?.openpayMerchantId || 'mudi9kij0xb5xk54urc6',
  publicKey: extra?.openpayPublicKey || 'pk_8ce5687a939145189673ff91c3282463',
  isSandbox: extra?.openpaySandbox === 'true' || false,
  apiUrl: 'https://api.openpay.pe/v1',
} as const;

// Re-exportar tipos para backward compatibility
export type { CardTokenData as OpenpayCard } from '../types/subscription';
export type { OpenpayCustomerData as OpenpayCustomer } from '../types/subscription';
export type { CreateSubscriptionResult, CreateSubscriptionParams } from '../types/subscription';

export interface OpenpayTokenResponse {
  id: string;
  card: {
    card_number: string;
    holder_name: string;
    expiration_year: string;
    expiration_month: string;
    brand: string;
    type: string;
  };
}

// ============================================================================
// TOKENIZACIÓN DE TARJETA (Client-side con llave pública)
// ============================================================================

/**
 * Tokeniza una tarjeta con la llave pública de OpenPay.
 * El token es de un solo uso y expira en minutos.
 * Se usa para crear suscripciones, guardar tarjetas o cobros directos.
 */
export async function createCardToken(card: CardTokenData): Promise<OpenpayTokenResponse> {
  const url = `${OPENPAY_CONFIG.apiUrl}/${OPENPAY_CONFIG.merchantId}/tokens`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${btoa(OPENPAY_CONFIG.publicKey + ':')}`,
    },
    body: JSON.stringify({
      card_number: card.card_number.replace(/\s/g, ''),
      holder_name: card.holder_name.toUpperCase(),
      expiration_year: card.expiration_year,
      expiration_month: card.expiration_month,
      cvv2: card.cvv2,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ description: 'Error de conexión' }));
    const msg = mapOpenpayError(error);
    throw new Error(msg);
  }

  return response.json();
}

// ============================================================================
// SUSCRIPCIÓN (via Edge Function)
// ============================================================================

/**
 * Crea cliente + suscripción + guarda tarjeta (server-side).
 * Flujo: Token → Edge Function → OpenPay API → Supabase DB
 */
export async function createSubscription(
  params: CreateSubscriptionParams
): Promise<CreateSubscriptionResult> {
  const { data, error } = await supabase.functions.invoke('openpay-subscribe', {
    body: {
      tokenId: params.tokenId,
      customer: {
        name: params.customer.name,
        email: params.customer.email,
        phone: params.customer.phone_number,
      },
      userId: params.userId,
      saveCard: params.saveCard ?? true, // Por defecto guarda la tarjeta
      deviceSessionId: params.deviceSessionId,
    },
  });

  if (error) {
    console.error('[OpenPay] Subscription error:', error);
    return { success: false, error: error.message };
  }

  return data;
}

// ============================================================================
// GESTIÓN DE TARJETAS GUARDADAS (via Edge Function)
// ============================================================================

/**
 * Guardar una nueva tarjeta para un usuario.
 * Requiere tokenizar primero con createCardToken().
 */
export async function saveCard(params: SaveCardParams): Promise<CardOperationResult> {
  const { data, error } = await supabase.functions.invoke('openpay-cards', {
    body: {
      action: 'save',
      tokenId: params.tokenId,
      userId: params.userId,
      deviceSessionId: params.deviceSessionId,
    },
  });

  if (error) {
    console.error('[OpenPay] Save card error:', error);
    return { success: false, error: error.message };
  }

  return data;
}

/**
 * Obtener todas las tarjetas guardadas del usuario actual.
 */
export async function getMyCards(): Promise<CardOperationResult> {
  const { data, error } = await supabase.functions.invoke('openpay-cards', {
    body: { action: 'list-my-cards' },
  });

  if (error) {
    console.error('[OpenPay] List cards error:', error);
    return { success: false, error: error.message };
  }

  return data;
}

/**
 * Eliminar una tarjeta guardada.
 */
export async function deleteCard(params: DeleteCardParams): Promise<CardOperationResult> {
  const { data, error } = await supabase.functions.invoke('openpay-cards', {
    body: {
      action: 'delete',
      cardId: params.cardId,
      userId: params.userId,
    },
  });

  if (error) {
    console.error('[OpenPay] Delete card error:', error);
    return { success: false, error: error.message };
  }

  return data;
}

/**
 * Establecer una tarjeta como la predeterminada.
 */
export async function setDefaultCard(userId: string, cardId: string): Promise<CardOperationResult> {
  const { data, error } = await supabase.functions.invoke('openpay-cards', {
    body: {
      action: 'set-default',
      cardId,
      userId,
    },
  });

  if (error) {
    console.error('[OpenPay] Set default card error:', error);
    return { success: false, error: error.message };
  }

  return data;
}

// ============================================================================
// COBROS (via Edge Function)
// ============================================================================

/**
 * Cobrar a una tarjeta guardada.
 * Ideal para: mini tienda, upgrades, productos adicionales.
 */
export async function chargeWithSavedCard(
  params: ChargeWithSavedCardParams
): Promise<ChargeResult> {
  const { data, error } = await supabase.functions.invoke('openpay-cards', {
    body: {
      action: 'charge',
      userId: params.userId,
      cardId: params.cardId,
      amount: params.amount,
      description: params.description,
      orderId: params.orderId,
      currency: params.currency || 'PEN',
      deviceSessionId: params.deviceSessionId,
    },
  });

  if (error) {
    console.error('[OpenPay] Charge error:', error);
    return { success: false, error: error.message };
  }

  return data;
}

/**
 * Cobrar con un token nuevo (tarjeta no guardada).
 * Opcionalmente guarda la tarjeta para el futuro.
 */
export async function chargeWithToken(params: ChargeWithTokenParams): Promise<ChargeResult> {
  const { data, error } = await supabase.functions.invoke('openpay-cards', {
    body: {
      action: 'charge-token',
      userId: params.userId,
      tokenId: params.tokenId,
      amount: params.amount,
      description: params.description,
      orderId: params.orderId,
      currency: params.currency || 'PEN',
      saveCard: params.saveCard ?? false,
      deviceSessionId: params.deviceSessionId,
      customer: params.customer,
    },
  });

  if (error) {
    console.error('[OpenPay] Charge with token error:', error);
    return { success: false, error: error.message };
  }

  return data;
}

// ============================================================================
// CANCELAR SUSCRIPCIÓN (via Edge Function)
// ============================================================================

export async function cancelSubscription(
  subscriptionId: string
): Promise<{ success: boolean; error?: string }> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: 'No autenticado' };
  }

  const { data, error } = await supabase.functions.invoke('admin-users', {
    body: { action: 'cancel-subscription', userId: user.id },
  });

  if (error) {
    return { success: false, error: error.message };
  }

  return data;
}

// ============================================================================
// UTILIDADES DE TARJETA (Client-side)
// ============================================================================

/** Formatear número de tarjeta con espacios cada 4 dígitos */
export function formatCardNumber(value: string): string {
  const v = value.replace(/\s+/g, '').replace(/[^0-9]/gi, '');
  const matches = v.match(/\d{4,16}/g);
  const match = (matches && matches[0]) || '';
  const parts = [];
  for (let i = 0, len = match.length; i < len; i += 4) {
    parts.push(match.substring(i, i + 4));
  }
  return parts.length ? parts.join(' ') : v;
}

/** Formatear fecha de expiración MM/YY */
export function formatExpiry(value: string): string {
  const v = value.replace(/\s+/g, '').replace(/[^0-9]/gi, '');
  if (v.length >= 2) {
    return v.substring(0, 2) + '/' + v.substring(2, 4);
  }
  return v;
}

/** Validar número de tarjeta (algoritmo de Luhn) */
export function validateCardNumber(number: string): boolean {
  const cleaned = number.replace(/\s/g, '');
  if (!/^\d{13,19}$/.test(cleaned)) return false;

  let sum = 0;
  let isEven = false;

  for (let i = cleaned.length - 1; i >= 0; i--) {
    let digit = parseInt(cleaned[i], 10);
    if (isEven) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    isEven = !isEven;
  }

  return sum % 10 === 0;
}

/** Validar CVV (3 o 4 dígitos) */
export function validateCVV(cvv: string, brand?: string): boolean {
  const cleaned = cvv.replace(/\D/g, '');
  if (brand === 'amex') return cleaned.length === 4;
  return cleaned.length === 3;
}

/** Validar fecha de expiración no está vencida */
export function validateExpiry(month: string, year: string): boolean {
  const now = new Date();
  const currentYear = now.getFullYear() % 100;
  const currentMonth = now.getMonth() + 1;
  const expYear = parseInt(year, 10);
  const expMonth = parseInt(month, 10);

  if (expMonth < 1 || expMonth > 12) return false;
  if (expYear < currentYear) return false;
  if (expYear === currentYear && expMonth < currentMonth) return false;
  return true;
}

/** Detectar marca de tarjeta por número */
export function getCardBrand(number: string): string {
  const cleaned = number.replace(/\s/g, '');
  if (/^4/.test(cleaned)) return 'visa';
  if (/^5[1-5]/.test(cleaned)) return 'mastercard';
  if (/^3[47]/.test(cleaned)) return 'amex';
  if (/^6(?:011|5)/.test(cleaned)) return 'discover';
  if (/^(?:2131|1800|35)/.test(cleaned)) return 'jcb';
  if (/^36/.test(cleaned)) return 'diners';
  return 'unknown';
}

/** Obtener ícono/emoji de marca de tarjeta */
export function getCardBrandIcon(brand: string): string {
  const icons: Record<string, string> = {
    visa: '💳 Visa',
    mastercard: '💳 Mastercard',
    amex: '💳 Amex',
    discover: '💳 Discover',
    jcb: '💳 JCB',
    diners: '💳 Diners',
    unknown: '💳',
  };
  return icons[brand.toLowerCase()] || icons.unknown;
}

/** Enmascarar número de tarjeta para display */
export function maskCardNumber(last4: string, brand?: string): string {
  if (brand === 'amex') return `•••• •••••• •${last4}`;
  return `•••• •••• •••• ${last4}`;
}

// ============================================================================
// PLAN & PRICING
// ============================================================================

export function getFormattedPrice(): string {
  return 'S/ 59.90';
}

export function getPlanDetails(): PlanDetails {
  return {
    id: 'pr6jao0vinkuqcqmkl4p',
    name: 'TRENS PRO',
    price: 59.9,
    currency: 'PEN',
    period: 'mensual',
    features: [
      'Rutinas con +500 ejercicios y días rotacionales',
      '4 tipos de series: calentamiento, aprox, efectiva, fallo',
      'Configura peso, reps, RIR, tempo y descanso',
      'Hasta 2 entrenamientos por día',
      'Múltiples cardio blocks por día',
      'Plan nutricional por horario con macros automáticos',
      'Stack de suplementos ilimitado con horarios y dosis',
      'Cámara PRO 9:16 con Spotify integrado',
      'Feed motivacional con likes y comentarios',
      'Fotos de progreso con comparativas timeline',
      'Lista de compras generada desde tu plan',
      'Sincronización musical con Spotify',
      'Notificaciones de entrenamiento y suplementos',
      'Perfil ADN atlético con TrensID Card',
      'Asistente IA integrado',
      'iOS, Android y Web (PWA) incluidos',
    ],
  };
}

// ============================================================================
// CAMBIAR TARJETA DE SUSCRIPCIÓN (via Edge Function)
// ============================================================================

/**
 * Cambia la tarjeta de cobro recurrente de la suscripción activa.
 * Cancela la suscripción anterior y crea una nueva con la tarjeta indicada.
 */
export async function swapSubscriptionCard(
  newCardId: string
): Promise<{ success: boolean; subscriptionId?: string; error?: string }> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { success: false, error: 'No autenticado' };

  const { data, error } = await supabase.functions.invoke('swap-subscription-card', {
    body: { newCardId },
  });

  if (error) {
    console.error('[OpenPay] Swap subscription card error:', error);
    return { success: false, error: error.message };
  }

  return data;
}

// ============================================================================
// MAPEO DE ERRORES OPENPAY → ESPAÑOL
// ============================================================================

function mapOpenpayError(error: any): string {
  const code = error?.error_code || error?.category;
  const description = error?.description || '';

  const errorMap: Record<number, string> = {
    1001: 'Faltan campos requeridos en la petición',
    1002: 'La petición no tiene el formato correcto',
    1003: 'Operación no soportada',
    1004: 'Un servicio necesario no está disponible',
    1005: 'Uno de los campos requeridos está vacío',
    1006: 'Uno o más campos tienen datos inválidos',
    1007: 'La transferencia entre la misma cuenta no está permitida',
    2001: 'La cuenta de banco no está asociada',
    2003: 'El token ya fue utilizado',
    2004: 'El dígito verificador es inválido',
    2005: 'La fecha de vencimiento es inválida',
    2006: 'El CVV es obligatorio',
    2007: 'El número de tarjeta es de longitud inválida',
    2008: 'El número de tarjeta no es válido',
    2009: 'El código CVV no es válido',
    2010: 'La tarjeta fue declinada por autenticación 3D Secure',
    3001: 'La tarjeta fue declinada por el banco',
    3002: 'La tarjeta ha expirado',
    3003: 'La tarjeta no tiene fondos suficientes',
    3004: 'La tarjeta fue reportada como robada',
    3005: 'Riesgo de fraude detectado',
    3006: 'Operación no permitida para esta tarjeta',
    3008: 'La tarjeta no es soportada en transacciones en línea',
    3009: 'La tarjeta fue reportada como perdida',
    3010: 'La tarjeta tiene restricción del banco',
    3011: 'El banco ha solicitado retener la tarjeta',
    3012: 'Se requiere autorización del banco para este pago',
  };

  if (code && errorMap[code]) {
    return errorMap[code];
  }

  if (description) {
    return description;
  }

  return 'Error al procesar la tarjeta. Intenta de nuevo.';
}

// ============================================================================
// EXPORT DEFAULT (backward compatible)
// ============================================================================

export default {
  createCardToken,
  createSubscription,
  cancelSubscription,
  swapSubscriptionCard,
  saveCard,
  getMyCards,
  deleteCard,
  setDefaultCard,
  chargeWithSavedCard,
  chargeWithToken,
  formatCardNumber,
  formatExpiry,
  validateCardNumber,
  validateCVV,
  validateExpiry,
  getCardBrand,
  getCardBrandIcon,
  maskCardNumber,
  getFormattedPrice,
  getPlanDetails,
  config: OPENPAY_CONFIG,
};
