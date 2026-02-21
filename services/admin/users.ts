// ============================================================================
// ADMIN USERS SERVICE
// Cliente para gestión de usuarios desde el panel de administración
// ============================================================================

import { supabase } from '../../lib/supabase';

// ============================================================================
// TIPOS
// ============================================================================

export interface AdminUser {
  id: string;
  email: string;
  full_name?: string;
  avatar_url?: string;
  created_at: string;
  training_frequency?: number;
  role: 'free' | 'pro' | 'admin' | 'ceo';
  pro_expires_at?: string;
  subscription?: {
    user_id: string;
    status: string;
    openpay_subscription_id?: string;
    card_last4?: string;
    card_brand?: string;
    current_period_end?: string;
  };
}

export interface AdminStats {
  total: number;
  pro: number;
  free: number;
  admin: number;
  withSubscription: number;
}

export interface OpenpayPayment {
  id: string;
  amount: number;
  currency: string;
  status: string;
  description: string;
  creation_date: string;
  card: {
    brand: string;
    last4: string;
  };
}

export interface UserFilters {
  role?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface CreateUserData {
  email: string;
  password: string;
  fullName?: string;
  phone?: string;
  role?: 'free' | 'pro' | 'admin';
  grantPro?: boolean;
  proExpiresAt?: string;
  sendWelcomeEmail?: boolean;
}

// ============================================================================
// FUNCIONES
// ============================================================================

/**
 * Crear usuario manualmente
 */
export async function createUser(data: CreateUserData): Promise<AdminUser> {
  const { data: result, error } = await supabase.functions.invoke('admin-users', {
    body: { action: 'create', createData: data },
  });

  if (error) throw new Error(error.message);
  if (!result.success) throw new Error(result.error);

  return result.user;
}

/**
 * Listar usuarios con filtros
 */
export async function listUsers(filters?: UserFilters): Promise<{
  users: AdminUser[];
  stats: AdminStats;
}> {
  const { data, error } = await supabase.functions.invoke('admin-users', {
    body: { action: 'list', filters },
  });

  if (error) throw new Error(error.message);
  if (!data.success) throw new Error(data.error);

  return { users: data.users, stats: data.stats };
}

/**
 * Obtener usuario específico con detalles completos
 */
export async function getUser(userId: string): Promise<AdminUser & { openpay?: any }> {
  const { data, error } = await supabase.functions.invoke('admin-users', {
    body: { action: 'get', userId },
  });

  if (error) throw new Error(error.message);
  if (!data.success) throw new Error(data.error);

  return data.user;
}

/**
 * Cambiar rol de usuario
 */
export async function updateUserRole(
  userId: string,
  role: 'free' | 'pro' | 'admin',
  proExpiresAt?: string
): Promise<void> {
  const { data, error } = await supabase.functions.invoke('admin-users', {
    body: { action: 'update-role', userId, role, proExpiresAt },
  });

  if (error) throw new Error(error.message);
  if (!data.success) throw new Error(data.error);
}

/**
 * Otorgar PRO manualmente (sin pago)
 */
export async function grantPro(userId: string, expiresAt?: string): Promise<{ expiresAt: string }> {
  const { data, error } = await supabase.functions.invoke('admin-users', {
    body: { action: 'grant-pro', userId, proExpiresAt: expiresAt },
  });

  if (error) throw new Error(error.message);
  if (!data.success) throw new Error(data.error);

  return { expiresAt: data.expiresAt };
}

/**
 * Revocar PRO
 */
export async function revokePro(userId: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke('admin-users', {
    body: { action: 'revoke-pro', userId },
  });

  if (error) throw new Error(error.message);
  if (!data.success) throw new Error(data.error);
}

/**
 * Cancelar suscripción de Openpay
 */
export async function cancelSubscription(userId: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke('admin-users', {
    body: { action: 'cancel-subscription', userId },
  });

  if (error) throw new Error(error.message);
  if (!data.success) throw new Error(data.error);
}

/**
 * Obtener detalles de suscripción
 */
export async function getSubscription(userId: string): Promise<any> {
  const { data, error } = await supabase.functions.invoke('admin-users', {
    body: { action: 'get-subscription', userId },
  });

  if (error) throw new Error(error.message);
  if (!data.success) throw new Error(data.error);

  return data.subscription;
}

/**
 * Obtener historial de pagos
 */
export async function getPayments(userId: string): Promise<OpenpayPayment[]> {
  const { data, error } = await supabase.functions.invoke('admin-users', {
    body: { action: 'get-payments', userId },
  });

  if (error) throw new Error(error.message);
  if (!data.success) throw new Error(data.error);

  return data.payments;
}

/**
 * Eliminar usuario (solo CEO)
 */
export async function deleteUser(userId: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke('admin-users', {
    body: { action: 'delete', userId },
  });

  if (error) throw new Error(error.message);
  if (!data.success) throw new Error(data.error);
}

/**
 * Obtener tarjetas guardadas de un usuario
 */
export async function getUserCards(userId: string): Promise<any[]> {
  const { data, error } = await supabase.functions.invoke('admin-users', {
    body: { action: 'get-cards', userId },
  });

  if (error) throw new Error(error.message);
  if (!data.success) throw new Error(data.error);

  return data.cards || [];
}

/**
 * Eliminar tarjeta de un usuario
 */
export async function deleteUserCard(userId: string, cardId: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke('admin-users', {
    body: { action: 'delete-card', userId, cardId },
  });

  if (error) throw new Error(error.message);
  if (!data.success) throw new Error(data.error);
}

/**
 * Impersonar usuario - genera un magic link para iniciar sesión como otro usuario (solo CEO)
 */
export async function impersonateUser(userId: string): Promise<{ url: string; email: string }> {
  const { data, error } = await supabase.functions.invoke('admin-users', {
    body: { action: 'impersonate', userId },
  });

  if (error) throw new Error(error.message);
  if (!data.success) throw new Error(data.error);
  return { url: data.url, email: data.email };
}

export default {
  createUser,
  listUsers,
  getUser,
  updateUserRole,
  grantPro,
  revokePro,
  cancelSubscription,
  getSubscription,
  getPayments,
  deleteUser,
  getUserCards,
  deleteUserCard,
  impersonateUser,
};
