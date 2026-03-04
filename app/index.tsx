import { Redirect } from 'expo-router';
import type { Href } from 'expo-router';
import { useUserRoleContext } from '../context/UserRoleContext';
import { View, ActivityIndicator, Platform } from 'react-native';
import { useEffect, useState } from 'react';
import { isPWA } from '../lib/pwaDetection';
import LandingPage from './(web)/landing';

export default function Index() {
  const { loading, isPro, isAdmin, isAuthenticated } = useUserRoleContext();
  const [isStandalone, setIsStandalone] = useState<boolean | null>(null);
  const [checkingPWA, setCheckingPWA] = useState(true);

  // Detectar si estamos en PWA (solo en web)
  useEffect(() => {
    if (Platform.OS === 'web') {
      // Pequeño delay para asegurar que window está listo
      const timer = setTimeout(() => {
        const pwaStatus = isPWA();
        setIsStandalone(pwaStatus);
        setCheckingPWA(false);

        // Debug en consola
        console.log('[TRENS] PWA Detection:', {
          isPWA: pwaStatus,
          isAuthenticated,
          isPro,
          userAgent: navigator.userAgent.substring(0, 50),
        });
      }, 100);
      return () => clearTimeout(timer);
    } else {
      // En nativo siempre es "standalone"
      setIsStandalone(true);
      setCheckingPWA(false);
    }
  }, [isAuthenticated, isPro]);

  // Mientras carga la sesión o detecta PWA, mostrar loading
  if (loading || checkingPWA) {
    return (
      <View className="flex-1 bg-black items-center justify-center">
        <ActivityIndicator size="large" color="#DC2626" />
      </View>
    );
  }

  // ============================================================================
  // WEB: Lógica de redirección según PWA vs Browser
  // ============================================================================
  if (Platform.OS === 'web') {
    // Si NO está en modo PWA (standalone)
    if (!isStandalone) {
      // Si está autenticado, permitir acceso (clientes en efectivo)
      if (isAuthenticated) {
        if (isAdmin) return <Redirect href={'/(admin)/usuarios' as Href} />;
        return <Redirect href={'/(tabs)/feed' as Href} />;
      }
      // Si NO está autenticado, mostrar landing DIRECTAMENTE en /
      return <LandingPage />;
    }

    // En PWA: Si no está autenticado, ir a login
    if (!isAuthenticated) {
      return <Redirect href={'/(auth)/login' as Href} />;
    }

    // En PWA autenticado: ir a la app
    if (isAdmin) return <Redirect href={'/(admin)/usuarios' as Href} />;
    return <Redirect href={'/(tabs)/feed' as Href} />;
  }

  // ============================================================================
  // NATIVO: Login obligatorio
  // ============================================================================
  if (!isAuthenticated) {
    return <Redirect href={'/(auth)/login' as Href} />;
  }

  if (isAdmin) return <Redirect href={'/(admin)/usuarios' as Href} />;
  return <Redirect href={'/(tabs)/feed' as Href} />;
}
