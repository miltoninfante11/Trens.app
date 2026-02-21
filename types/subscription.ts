// ============================================================================
// SUBSCRIPTION & PAYMENT TYPES
// Tipos centralizados para todo el sistema de pagos OpenPay
// ============================================================================

// ============================================================================
// TARJETAS
// ============================================================================

/** Datos de tarjeta para tokenización (client-side) */
export interface CardTokenData {
  card_number: string;
  holder_name: string;
  expiration_year: string;
  expiration_month: string;
  cvv2: string;
}

/** Tarjeta guardada en OpenPay (sin datos sensibles) */
export interface SavedCard {
  id: string; // OpenPay card ID
  holder_name: string;
  card_number: string; // Últimos 4 dígitos enmascarados (e.g., "411111XXXXXX1111")
  last4: string;
  brand: string; // visa, mastercard, amex
  type: string; // debit, credit
  expiration_month: string;
  expiration_year: string;
  allows_charges: boolean;
  is_default: boolean;
  created_at: string;
}

/** Tarjeta guardada en Supabase (referencia local) */
export interface CustomerCard {
  id: string; // UUID local
  user_id: string;
  openpay_customer_id: string;
  openpay_card_id: string;
  last4: string;
  brand: string;
  type: string;
  holder_name: string;
  expiration_month: string;
  expiration_year: string;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// CLIENTES OPENPAY
// ============================================================================

/** Datos para crear un cliente en OpenPay */
export interface OpenpayCustomerData {
  name: string;
  email: string;
  phone_number: string;
}

/** Cliente de OpenPay (response) */
export interface OpenpayCustomer {
  id: string;
  name: string;
  email: string;
  phone_number: string;
  status: string;
  creation_date: string;
  clabe?: string;
  external_id?: string;
}

// ============================================================================
// SUSCRIPCIONES
// ============================================================================

export type SubscriptionStatus = 'active' | 'cancelled' | 'past_due' | 'trialing' | 'unpaid';

/** Suscripción guardada en Supabase */
export interface Subscription {
  id: string;
  user_id: string;
  openpay_customer_id: string;
  openpay_subscription_id: string;
  openpay_card_last4: string;
  openpay_card_brand: string;
  plan_id: string;
  amount: number;
  currency: string;
  status: SubscriptionStatus;
  current_period_start: string;
  current_period_end: string;
  trial_end: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Resultado de crear suscripción */
export interface CreateSubscriptionResult {
  success: boolean;
  subscriptionId?: string;
  customerId?: string;
  cardId?: string;
  status?: string;
  currentPeriodEnd?: string;
  savedCards?: SavedCard[];
  error?: string;
}

/** Parámetros para crear suscripción */
export interface CreateSubscriptionParams {
  tokenId: string;
  customer: OpenpayCustomerData;
  userId: string;
  saveCard?: boolean; // Guardar tarjeta para futuros cobros
  deviceSessionId?: string;
}

// ============================================================================
// COBROS / CHARGES
// ============================================================================

/** Resultado de un cobro */
export interface ChargeResult {
  success: boolean;
  chargeId?: string;
  status?: string;
  authorization?: string;
  error?: string;
  errorCode?: number;
}

/** Parámetros para cobro con tarjeta guardada */
export interface ChargeWithSavedCardParams {
  userId: string;
  cardId: string; // OpenPay card ID
  amount: number;
  description: string;
  orderId?: string;
  currency?: string;
  deviceSessionId?: string;
}

/** Parámetros para cobro con token (tarjeta nueva) */
export interface ChargeWithTokenParams {
  userId: string;
  tokenId: string;
  amount: number;
  description: string;
  orderId?: string;
  currency?: string;
  saveCard?: boolean;
  deviceSessionId?: string;
  customer?: OpenpayCustomerData;
}

// ============================================================================
// CARD MANAGEMENT
// ============================================================================

/** Resultado de operación con tarjeta */
export interface CardOperationResult {
  success: boolean;
  card?: SavedCard;
  cards?: SavedCard[];
  error?: string;
}

/** Parámetros para guardar tarjeta */
export interface SaveCardParams {
  userId: string;
  tokenId: string;
  deviceSessionId?: string;
}

/** Parámetros para eliminar tarjeta */
export interface DeleteCardParams {
  userId: string;
  cardId: string;
}

// ============================================================================
// PLAN
// ============================================================================

export interface PlanDetails {
  id: string;
  name: string;
  price: number;
  currency: string;
  period: 'mensual' | 'anual';
  features: string[];
}

export const TRENS_PRO_PLAN: PlanDetails = {
  id: 'pr6jao0vinkuqcqmkl4p',
  name: 'TRENS PRO',
  price: 59.9,
  currency: 'PEN',
  period: 'mensual',
  features: [
    'Grabación de videos ilimitada',
    'Guardado en tu bóveda personal',
    'Registro de PRs y récords',
    'Historial completo de entrenamientos',
    'Sincronización con Spotify',
    'Planes de nutrición personalizados',
    'Suplementación inteligente',
    'Asistente HANK con IA',
    'Fotos de progreso',
    'Métricas avanzadas de ADN atlético',
  ],
};

// ============================================================================
// WEBHOOK
// ============================================================================

export type OpenpayEventType =
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

export interface OpenpayWebhookEvent {
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
    card?: {
      brand: string;
      card_number: string;
    };
    subscription?: {
      id: string;
      plan_id: string;
      status: string;
      current_period_end_date: string;
    };
  };
}
