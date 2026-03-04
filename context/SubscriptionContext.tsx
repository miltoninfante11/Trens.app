// ============================================================================
// SUBSCRIPTION CONTEXT - TRENS
// Contexto híbrido que unifica IAP (RevenueCat) + OpenPay.
// Detecta la plataforma y ofrece la fuente de suscripción correcta.
// ============================================================================

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from 'react';
import { Platform, Linking } from 'react-native';
import { supabase } from '../lib/supabase';
import { useUserRoleContext } from './UserRoleContext';
import revenueCat, {
  type RevenueCatPackage,
  type RevenueCatSubscriptionInfo,
} from '../services/revenueCat';
import { cancelSubscription as cancelOpenPaySubscription } from '../lib/openpay';
import type { Subscription } from '../types/subscription';

// ============================================================================
// TIPOS
// ============================================================================

export type SubscriptionSource = 'openpay' | 'iap' | 'none';

export interface SubscriptionState {
  // Estado general
  isLoading: boolean;
  isPro: boolean;

  // Fuente activa de suscripción
  activeSource: SubscriptionSource;

  // OpenPay (web)
  openpaySubscription: Subscription | null;

  // IAP (RevenueCat - iOS/Android)
  iapInfo: RevenueCatSubscriptionInfo | null;
  iapPackages: RevenueCatPackage[];

  // Plataforma
  isIAPAvailable: boolean;
  isWeb: boolean;

  // Precios
  webPrice: string;
  nativePrice: string;

  // Acciones
  purchaseIAP: (pkg: RevenueCatPackage) => Promise<{ success: boolean; error?: string }>;
  restorePurchases: () => Promise<{ success: boolean; error?: string }>;
  cancelSubscription: () => Promise<{ success: boolean; error?: string }>;
  manageSubscription: () => Promise<void>;
  refreshSubscription: () => Promise<void>;
}

// ============================================================================
// CONTEXT
// ============================================================================

const SubscriptionContext = createContext<SubscriptionState | undefined>(undefined);

// ============================================================================
// PROVIDER
// ============================================================================

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const { user, isPro, refetch: refetchRole } = useUserRoleContext();

  // State
  const [isLoading, setIsLoading] = useState(true);
  const [openpaySubscription, setOpenpaySubscription] = useState<Subscription | null>(null);
  const [iapInfo, setIapInfo] = useState<RevenueCatSubscriptionInfo | null>(null);
  const [iapPackages, setIapPackages] = useState<RevenueCatPackage[]>([]);
  const [revenueCatReady, setRevenueCatReady] = useState(false);

  const isWeb = Platform.OS === 'web';
  const isIAPAvailable = Platform.OS === 'ios' || Platform.OS === 'android';

  // -------------------------------------------------------------------------
  // INIT REVENUECAT (solo nativo)
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (isWeb) {
      setRevenueCatReady(false);
      return;
    }

    const init = async () => {
      const success = await revenueCat.init(user?.id);
      if (success && user?.id) {
        await revenueCat.identify(user.id);
      }
      setRevenueCatReady(success);
    };

    init();
  }, [user?.id, isWeb]);

  // -------------------------------------------------------------------------
  // LISTENER DE CAMBIOS IAP
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!revenueCatReady) return;

    const cleanup = revenueCat.addListener((info) => {
      setIapInfo(info);
      // Si cambió el estado PRO, refrescar rol
      refetchRole();
    });

    return cleanup;
  }, [revenueCatReady, refetchRole]);

  // -------------------------------------------------------------------------
  // FETCH OFERTAS IAP
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!revenueCatReady) return;

    const fetchOfferings = async () => {
      const packages = await revenueCat.getOfferings();
      setIapPackages(packages);
    };

    fetchOfferings();
  }, [revenueCatReady]);

  // -------------------------------------------------------------------------
  // FETCH ESTADO COMPLETO
  // -------------------------------------------------------------------------
  const refreshSubscription = useCallback(async () => {
    if (!user) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    try {
      // 1. Buscar suscripción OpenPay en Supabase
      const { data: openpaySub } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      setOpenpaySubscription(openpaySub as Subscription | null);

      // 2. Verificar estado IAP (solo nativo)
      if (revenueCatReady) {
        const rcStatus = await revenueCat.checkStatus();
        setIapInfo(rcStatus);
      }
    } catch (error) {
      console.error('[SubscriptionContext] Refresh error:', error);
    } finally {
      setIsLoading(false);
    }
  }, [user, revenueCatReady]);

  // Initial fetch
  useEffect(() => {
    refreshSubscription();
  }, [refreshSubscription]);

  // -------------------------------------------------------------------------
  // DETERMINAR FUENTE ACTIVA
  // -------------------------------------------------------------------------
  const activeSource: SubscriptionSource = (() => {
    // IAP tiene prioridad sobre OpenPay
    if (iapInfo?.isActive) return 'iap';
    if (
      openpaySubscription &&
      (openpaySubscription.status === 'active' || openpaySubscription.status === 'past_due')
    ) {
      return 'openpay';
    }
    return 'none';
  })();

  // -------------------------------------------------------------------------
  // PRECIOS
  // -------------------------------------------------------------------------
  const getWebPrice = (): string => 'S/ 59.90/mes';
  const getNativePrice = (): string => {
    // Si tenemos el precio real del IAP, usarlo
    const monthlyPkg = iapPackages.find(
      (p) => p.period === 'MONTHLY' || p.identifier === '$rc_monthly'
    );
    if (monthlyPkg?.priceString) return `${monthlyPkg.priceString}/mes`;
    // Fallback: mismo precio para iOS y Android
    return 'S/ 69.90/mes';
  };

  // -------------------------------------------------------------------------
  // COMPRAR IAP
  // -------------------------------------------------------------------------
  const purchaseIAP = useCallback(
    async (pkg: RevenueCatPackage): Promise<{ success: boolean; error?: string }> => {
      if (!isIAPAvailable || !revenueCatReady) {
        return { success: false, error: 'IAP no disponible en esta plataforma' };
      }

      const result = await revenueCat.purchase(pkg);

      if (result.success) {
        // Refrescar todo
        await refreshSubscription();
        await refetchRole();
      }

      return result;
    },
    [isIAPAvailable, revenueCatReady, refreshSubscription, refetchRole]
  );

  // -------------------------------------------------------------------------
  // RESTAURAR COMPRAS
  // -------------------------------------------------------------------------
  const restorePurchases = useCallback(async (): Promise<{
    success: boolean;
    error?: string;
  }> => {
    if (!isIAPAvailable || !revenueCatReady) {
      return { success: false, error: 'IAP no disponible' };
    }

    const result = await revenueCat.restore();

    if (result.success) {
      await refreshSubscription();
      await refetchRole();
    }

    return result;
  }, [isIAPAvailable, revenueCatReady, refreshSubscription, refetchRole]);

  // -------------------------------------------------------------------------
  // CANCELAR SUSCRIPCIÓN
  // -------------------------------------------------------------------------
  const cancelSub = useCallback(async (): Promise<{
    success: boolean;
    error?: string;
  }> => {
    if (activeSource === 'iap') {
      // IAP: redirigir a la gestión de la tienda
      const url = await revenueCat.getManagementUrl();
      if (url) {
        await Linking.openURL(url);
        return { success: true };
      }

      // Fallback: URLs de gestión de suscripciones
      if (Platform.OS === 'ios') {
        await Linking.openURL('https://apps.apple.com/account/subscriptions');
        return { success: true };
      }
      if (Platform.OS === 'android') {
        await Linking.openURL('https://play.google.com/store/account/subscriptions');
        return { success: true };
      }

      return { success: false, error: 'No se pudo abrir la gestión de suscripciones' };
    }

    if (activeSource === 'openpay' && openpaySubscription) {
      return cancelOpenPaySubscription(openpaySubscription.openpay_subscription_id);
    }

    return { success: false, error: 'No hay suscripción activa' };
  }, [activeSource, openpaySubscription]);

  // -------------------------------------------------------------------------
  // GESTIONAR SUSCRIPCIÓN (abrir tienda)
  // -------------------------------------------------------------------------
  const manageSubscription = useCallback(async () => {
    if (activeSource === 'iap') {
      const url = await revenueCat.getManagementUrl();
      if (url) {
        await Linking.openURL(url);
        return;
      }
      if (Platform.OS === 'ios') {
        await Linking.openURL('https://apps.apple.com/account/subscriptions');
        return;
      }
      if (Platform.OS === 'android') {
        await Linking.openURL('https://play.google.com/store/account/subscriptions');
        return;
      }
    }
    // OpenPay: la gestión es dentro de la app
  }, [activeSource]);

  // -------------------------------------------------------------------------
  // VALUE
  // -------------------------------------------------------------------------
  const value: SubscriptionState = {
    isLoading,
    isPro,
    activeSource,
    openpaySubscription,
    iapInfo,
    iapPackages,
    isIAPAvailable,
    isWeb,
    webPrice: getWebPrice(),
    nativePrice: getNativePrice(),
    purchaseIAP,
    restorePurchases,
    cancelSubscription: cancelSub,
    manageSubscription,
    refreshSubscription,
  };

  return <SubscriptionContext.Provider value={value}>{children}</SubscriptionContext.Provider>;
}

// ============================================================================
// HOOK
// ============================================================================

export function useSubscription() {
  const context = useContext(SubscriptionContext);
  if (!context) {
    throw new Error('useSubscription must be used within a SubscriptionProvider');
  }
  return context;
}
