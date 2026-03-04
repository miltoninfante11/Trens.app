// ============================================================================
// REVENUECAT SERVICE - TRENS
// Servicio para gestionar suscripciones IAP via RevenueCat.
// Solo se activa en plataformas nativas (iOS/Android).
// En web, se usa OpenPay directamente.
// ============================================================================

import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { supabase } from '../lib/supabase';

// ============================================================================
// TIPOS
// ============================================================================

export interface RevenueCatPackage {
  identifier: string;
  productId: string;
  title: string;
  description: string;
  priceString: string;
  price: number;
  currencyCode: string;
  period: string;
}

export interface RevenueCatSubscriptionInfo {
  isActive: boolean;
  willRenew: boolean;
  expirationDate: string | null;
  productIdentifier: string | null;
  isSandbox: boolean;
  managementUrl: string | null;
  store: 'APP_STORE' | 'PLAY_STORE' | 'STRIPE' | 'PROMOTIONAL' | null;
}

export type PurchaseResult = {
  success: boolean;
  customerInfo?: any;
  error?: string;
};

// ============================================================================
// CONFIGURACIÓN
// ============================================================================

const extra = Constants.expoConfig?.extra;

const REVENUECAT_CONFIG = {
  // API keys de RevenueCat (configurar en app.json extra)
  appleApiKey: extra?.revenueCatAppleKey || 'appl_YOUR_REVENUECAT_APPLE_KEY',
  googleApiKey: extra?.revenueCatGoogleKey || 'goog_YOUR_REVENUECAT_GOOGLE_KEY',
  // Entitlement que marca acceso PRO
  proEntitlement: 'trens_pro',
  // Offering identifier
  defaultOffering: 'default',
  // Product identifiers (deben coincidir con App Store Connect / Google Play Console)
  monthlyProductId: 'trens_pro_monthly',
} as const;

// ============================================================================
// ESTADO INTERNO
// ============================================================================

let isInitialized = false;
let Purchases: any = null;

// ============================================================================
// INICIALIZACIÓN
// ============================================================================

/**
 * Inicializa RevenueCat SDK.
 * Solo funciona en iOS/Android. En web es no-op.
 */
export async function initRevenueCat(userId?: string): Promise<boolean> {
  if (Platform.OS === 'web') {
    console.warn('[RevenueCat] Web platform - skipping initialization');
    return false;
  }

  if (isInitialized) return true;

  try {
    // Dynamic import para que no falle en web
    const RNPurchases = await import('react-native-purchases');
    Purchases = RNPurchases.default || RNPurchases;

    const apiKey =
      Platform.OS === 'ios' ? REVENUECAT_CONFIG.appleApiKey : REVENUECAT_CONFIG.googleApiKey;

    // Configurar con debug logs en desarrollo
    if (__DEV__) {
      Purchases.setLogLevel(Purchases.LOG_LEVEL?.DEBUG || 'DEBUG');
    }

    await Purchases.configure({
      apiKey,
      appUserID: userId || null, // null = anonymous, se identifica después
    });

    isInitialized = true;
    console.warn('[RevenueCat] Initialized successfully for', Platform.OS);
    return true;
  } catch (error) {
    console.error('[RevenueCat] Initialization error:', error);
    return false;
  }
}

// ============================================================================
// IDENTIFICAR USUARIO
// ============================================================================

/**
 * Identifica al usuario en RevenueCat con su Supabase user_id.
 * Esto sincroniza su historial de compras entre dispositivos.
 */
export async function identifyUser(userId: string): Promise<void> {
  if (!isInitialized || !Purchases || Platform.OS === 'web') return;

  try {
    await Purchases.logIn(userId);
    console.warn('[RevenueCat] User identified:', userId);
  } catch (error) {
    console.error('[RevenueCat] Identify error:', error);
  }
}

/**
 * Desloguea el usuario en RevenueCat.
 */
export async function logOutRevenueCat(): Promise<void> {
  if (!isInitialized || !Purchases || Platform.OS === 'web') return;

  try {
    await Purchases.logOut();
    console.warn('[RevenueCat] User logged out');
  } catch (error) {
    console.error('[RevenueCat] Logout error:', error);
  }
}

// ============================================================================
// OBTENER OFFERINGS (PRODUCTOS DISPONIBLES)
// ============================================================================

/**
 * Obtiene los productos/paquetes disponibles para compra.
 */
export async function getOfferings(): Promise<RevenueCatPackage[]> {
  if (!isInitialized || !Purchases || Platform.OS === 'web') return [];

  try {
    const offerings = await Purchases.getOfferings();
    const current = offerings.current;

    if (!current) {
      console.warn('[RevenueCat] No current offering found');
      return [];
    }

    const packages: RevenueCatPackage[] = [];

    for (const pkg of current.availablePackages || []) {
      const product = pkg.product;
      packages.push({
        identifier: pkg.identifier,
        productId: product.identifier || product.productId,
        title: product.title || 'TRENS PRO',
        description: product.description || 'Suscripción mensual TRENS PRO',
        priceString: product.priceString || '',
        price: product.price || 0,
        currencyCode: product.currencyCode || product.currency_code || '',
        period: pkg.packageType || 'MONTHLY',
      });
    }

    return packages;
  } catch (error) {
    console.error('[RevenueCat] Get offerings error:', error);
    return [];
  }
}

// ============================================================================
// COMPRAR SUSCRIPCIÓN
// ============================================================================

/**
 * Inicia el flujo de compra nativo (App Store / Google Play).
 * Retorna si la compra fue exitosa.
 */
export async function purchasePackage(pkg: RevenueCatPackage): Promise<PurchaseResult> {
  if (!isInitialized || !Purchases || Platform.OS === 'web') {
    return { success: false, error: 'RevenueCat no disponible en esta plataforma' };
  }

  try {
    // Recuperar el paquete real de RevenueCat
    const offerings = await Purchases.getOfferings();
    const current = offerings.current;

    if (!current) {
      return { success: false, error: 'No hay ofertas disponibles' };
    }

    const realPackage = current.availablePackages?.find(
      (p: any) =>
        p.identifier === pkg.identifier ||
        (p.product?.identifier || p.product?.productId) === pkg.productId
    );

    if (!realPackage) {
      return { success: false, error: 'Paquete no encontrado' };
    }

    const { customerInfo } = await Purchases.purchasePackage(realPackage);

    // Verificar si el entitlement PRO está activo
    const isPro = customerInfo.entitlements.active[REVENUECAT_CONFIG.proEntitlement]?.isActive;

    if (isPro) {
      // Sincronizar estado PRO con Supabase
      await syncProStatus(true);
      return { success: true, customerInfo };
    }

    return { success: false, error: 'La compra no activó el entitlement PRO' };
  } catch (error: any) {
    // El usuario canceló
    if (error.userCancelled) {
      return { success: false, error: 'cancelled' };
    }

    console.error('[RevenueCat] Purchase error:', error);
    return {
      success: false,
      error: error.message || 'Error al procesar la compra',
    };
  }
}

// ============================================================================
// VERIFICAR ESTADO DE SUSCRIPCIÓN
// ============================================================================

/**
 * Verifica si el usuario tiene una suscripción activa en RevenueCat.
 */
export async function checkSubscriptionStatus(): Promise<RevenueCatSubscriptionInfo> {
  const defaultInfo: RevenueCatSubscriptionInfo = {
    isActive: false,
    willRenew: false,
    expirationDate: null,
    productIdentifier: null,
    isSandbox: false,
    managementUrl: null,
    store: null,
  };

  if (!isInitialized || !Purchases || Platform.OS === 'web') return defaultInfo;

  try {
    const customerInfo = await Purchases.getCustomerInfo();
    const proEntitlement = customerInfo.entitlements.active[REVENUECAT_CONFIG.proEntitlement];

    if (proEntitlement) {
      return {
        isActive: proEntitlement.isActive,
        willRenew: proEntitlement.willRenew ?? true,
        expirationDate: proEntitlement.expirationDate || null,
        productIdentifier: proEntitlement.productIdentifier || null,
        isSandbox: proEntitlement.isSandbox ?? false,
        managementUrl: customerInfo.managementURL || null,
        store: proEntitlement.store || null,
      };
    }

    return defaultInfo;
  } catch (error) {
    console.error('[RevenueCat] Check status error:', error);
    return defaultInfo;
  }
}

// ============================================================================
// RESTAURAR COMPRAS
// ============================================================================

/**
 * Restaura compras anteriores del usuario.
 * Útil cuando reinstala la app o cambia de dispositivo.
 */
export async function restorePurchases(): Promise<PurchaseResult> {
  if (!isInitialized || !Purchases || Platform.OS === 'web') {
    return { success: false, error: 'RevenueCat no disponible' };
  }

  try {
    const customerInfo = await Purchases.restorePurchases();
    const isPro = customerInfo.entitlements.active[REVENUECAT_CONFIG.proEntitlement]?.isActive;

    if (isPro) {
      await syncProStatus(true);
      return { success: true, customerInfo };
    }

    return { success: false, error: 'No se encontraron compras para restaurar' };
  } catch (error: any) {
    console.error('[RevenueCat] Restore error:', error);
    return { success: false, error: error.message || 'Error al restaurar compras' };
  }
}

// ============================================================================
// CANCELAR / GESTIONAR SUSCRIPCIÓN
// ============================================================================

/**
 * Retorna la URL de gestión de suscripción de la tienda correspondiente.
 * En iOS redirige a App Store settings, en Android a Play Store.
 */
export async function getManagementUrl(): Promise<string | null> {
  if (!isInitialized || !Purchases || Platform.OS === 'web') return null;

  try {
    const customerInfo = await Purchases.getCustomerInfo();
    return customerInfo.managementURL || null;
  } catch {
    return null;
  }
}

// ============================================================================
// SINCRONIZAR CON SUPABASE
// ============================================================================

/**
 * Sincroniza el estado PRO del usuario entre RevenueCat y Supabase.
 * Se llama después de compras exitosas o verificaciones de estado.
 */
async function syncProStatus(isPro: boolean): Promise<void> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return;

    const newRole = isPro ? 'pro' : 'free';

    // Solo actualizar si el rol actual es diferente
    const { data: current } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .single();

    // No degradar admins/ceos
    if (current?.role === 'admin' || current?.role === 'ceo') return;

    // No downgrade si tiene suscripción OpenPay activa
    if (!isPro) {
      const { data: openpaySub } = await supabase
        .from('subscriptions')
        .select('status')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .maybeSingle();

      if (openpaySub) return; // Tiene suscripción OpenPay activa, no degradar
    }

    await supabase
      .from('user_roles')
      .update({
        role: newRole,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', user.id);

    console.warn('[RevenueCat] Pro status synced:', newRole);
  } catch (error) {
    console.error('[RevenueCat] Sync error:', error);
  }
}

// ============================================================================
// LISTENER DE CAMBIOS DE ESTADO
// ============================================================================

/**
 * Registra un listener para cambios en el estado de la suscripción.
 * Se activa cuando RevenueCat recibe un webhook de la tienda.
 */
export function addCustomerInfoListener(
  callback: (info: RevenueCatSubscriptionInfo) => void
): () => void {
  if (!isInitialized || !Purchases || Platform.OS === 'web') {
    return () => {}; // no-op cleanup
  }

  const listener = (customerInfo: any) => {
    const proEntitlement = customerInfo.entitlements.active[REVENUECAT_CONFIG.proEntitlement];

    callback({
      isActive: proEntitlement?.isActive ?? false,
      willRenew: proEntitlement?.willRenew ?? false,
      expirationDate: proEntitlement?.expirationDate || null,
      productIdentifier: proEntitlement?.productIdentifier || null,
      isSandbox: proEntitlement?.isSandbox ?? false,
      managementUrl: customerInfo.managementURL || null,
      store: proEntitlement?.store || null,
    });

    // También sincronizar con Supabase
    syncProStatus(proEntitlement?.isActive ?? false);
  };

  Purchases.addCustomerInfoUpdateListener(listener);

  return () => {
    // RevenueCat SDK no expone removeListener directamente, el cleanup
    // se maneja internamente cuando se desmonta el componente
  };
}

// ============================================================================
// UTILIDADES
// ============================================================================

/**
 * Determina la fuente de suscripción según la plataforma.
 */
export function getSubscriptionSource(): 'openpay' | 'iap' {
  if (Platform.OS === 'web') return 'openpay';
  return 'iap';
}

/**
 * Verifica si IAP está disponible en la plataforma actual.
 */
export function isIAPAvailable(): boolean {
  return Platform.OS === 'ios' || Platform.OS === 'android';
}

/**
 * Obtiene el precio formateado según la plataforma.
 * iOS/Android: precio del IAP (lo que muestre la tienda).
 * Web: S/ 59.90/mes (OpenPay).
 */
export function getPlatformPrice(): { display: string; amount: number; currency: string } {
  if (Platform.OS === 'web') {
    return { display: 'S/ 59.90', amount: 59.9, currency: 'PEN' };
  }
  // En nativo (iOS y Android), precio IAP
  return { display: 'S/ 69.90', amount: 69.9, currency: 'PEN' };
}

// ============================================================================
// EXPORT
// ============================================================================

export const revenueCat = {
  init: initRevenueCat,
  identify: identifyUser,
  logOut: logOutRevenueCat,
  getOfferings,
  purchase: purchasePackage,
  checkStatus: checkSubscriptionStatus,
  restore: restorePurchases,
  getManagementUrl,
  addListener: addCustomerInfoListener,
  getSource: getSubscriptionSource,
  isAvailable: isIAPAvailable,
  getPrice: getPlatformPrice,
  config: REVENUECAT_CONFIG,
};

export default revenueCat;
