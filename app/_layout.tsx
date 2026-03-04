// FORCE_REBUILD_1767570000
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Slot } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';
import React, { createContext, useContext, useState, useEffect } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { HankProvider } from '../context/HankContext';
import { ProContextProvider } from '../context/ProContext';
import { ProRecordingProvider } from '../context/ProRecordingContext';
import { UserRoleProvider, useUserRoleContext } from '../context/UserRoleContext';
import { SaveGuardProvider } from '../context/SaveGuardContext';
import { NotificationProvider } from '../context/NotificationContext';
import { SubscriptionProvider } from '../context/SubscriptionContext';
import { useDeepLinkHandler } from '../services/share/deepLinkHandler';
import { ErrorBoundary } from '../components/ui/ErrorBoundary';
import * as WebBrowser from 'expo-web-browser';
import '../global.css';

// IMPORTANTE: Completar OAuth sessions pendientes (Spotify, etc.)
// Debe ejecutarse antes de que Expo Router intercepte los deep links
WebBrowser.maybeCompleteAuthSession();

// ============================================================================
// 1. AUTH PROVIDER (LEGACY - Mantener para compatibilidad)
// El nuevo UserRoleContext maneja auth + roles, pero mantenemos esto para
// no romper componentes existentes
// ============================================================================
interface AuthContextType {
  session: Session | null;
  user: User | null;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType>({ session: null, user: null, loading: true });

export const useAuth = () => useContext(AuthContext);

const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  return (
    <AuthContext.Provider value={{ session, user: session?.user ?? null, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

// Re-export del nuevo contexto de roles
export { useUserRoleContext } from '../context/UserRoleContext';

// ============================================================================
// 2. SPORT PROVIDER - Maneja deporte activo y configuración dinámica
// ============================================================================
import { SportProvider, useSport } from '../context/SportContext';
export { useSport } from '../context/SportContext';

// ============================================================================
// 3. HANK PROVIDER - Importado desde context/HankContext.tsx
// Re-exportamos useHank para acceso global
// ============================================================================
export { useHank } from '../context/HankContext';

// ============================================================================
// 4. PRO CONTEXT - Smart Trigger para el módulo PRO
// Re-exportamos useProContext para acceso global
// ============================================================================
export { useProContext } from '../context/ProContext';

// ============================================================================
// 4.5. PRO RECORDING CONTEXT - Estado de grabación compartido
// Re-exportamos useProRecording para acceso global
// ============================================================================
export { useProRecording } from '../context/ProRecordingContext';

// ============================================================================
// 5. SAVE GUARD CONTEXT - Bloquea guardado para usuarios FREE
// Re-exportamos useSaveGuard para acceso global
// ============================================================================
export { useSaveGuard } from '../context/SaveGuardContext';

// ============================================================================
// 5.5. NOTIFICATION CONTEXT - Notificaciones inteligentes
// Re-exportamos useNotifications para acceso global
// ============================================================================
export { useNotifications } from '../context/NotificationContext';

// ============================================================================
// 6. SUBSCRIPTION CONTEXT - Sistema híbrido IAP + OpenPay
// Re-exportamos useSubscription para acceso global
// ============================================================================
export { useSubscription } from '../context/SubscriptionContext';

// ============================================================================
// 4. HANK WRAPPER - Conecta HankProvider con userId del Auth
// Solo renderiza HankProvider y HankOverlay cuando hay usuario autenticado
// ============================================================================
const HankWrapper = ({ children }: { children: React.ReactNode }) => {
  const { user } = useAuth();

  // Manejar deep links entrantes
  useDeepLinkHandler();

  // HankProvider siempre disponible - userId opcional para visitantes
  return <HankProvider userId={user?.id || 'visitor'}>{children}</HankProvider>;
};

// ============================================================================
// 6. SAVE GUARD WRAPPER - Wrapper que conecta con auth y pro context
// ============================================================================
const SaveGuardWrapper = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  const { isPro } = useUserRoleContext();

  return (
    <SaveGuardProvider isAuthenticated={!loading && !!user} isPro={isPro}>
      {children}
    </SaveGuardProvider>
  );
};

export default function RootLayout() {
  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <UserRoleProvider>
          <AuthProvider>
            <SportProvider>
              <ProContextProvider>
                <ProRecordingProvider>
                  <SaveGuardWrapper>
                    <NotificationProvider>
                      <SubscriptionProvider>
                        <HankWrapper>
                          <View className="flex-1 bg-savage-black">
                            <Slot />
                            {/* Overlays movidos a (tabs)/_layout.tsx donde hay contexto de navegación */}
                            <StatusBar style="light" />
                          </View>
                        </HankWrapper>
                      </SubscriptionProvider>
                    </NotificationProvider>
                  </SaveGuardWrapper>
                </ProRecordingProvider>
              </ProContextProvider>
            </SportProvider>
          </AuthProvider>
        </UserRoleProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}
