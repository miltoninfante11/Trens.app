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
  const [isShopSubdomain, setIsShopSubdomain] = useState(false);

  // Detectar PWA y subdominio — solo una vez al montar, NO depende de auth
  useEffect(() => {
    if (Platform.OS === 'web') {
      try {
        const host = typeof window !== 'undefined' ? window.location.hostname : '';
        if (host.startsWith('shop.')) setIsShopSubdomain(true);
      } catch {}

      // isPWA() es síncrona, el delay mínimo es solo para asegurar que window esté listo
      const timer = setTimeout(() => {
        const pwaStatus = isPWA();
        setIsStandalone(pwaStatus);
        setCheckingPWA(false);
        console.log('[TRENS] PWA:', pwaStatus, '| host:', window.location.hostname);
      }, 50);
      return () => clearTimeout(timer);
    } else {
      setIsStandalone(true);
      setCheckingPWA(false);
    }
  }, []); // ← sin dependencias: solo se ejecuta una vez

  // ============================================================================
  // WEB BROWSER (no PWA): mostrar contenido SIN esperar a que auth cargue
  // La landing page no necesita saber si el usuario está autenticado para mostrarse
  // ============================================================================
  if (Platform.OS === 'web' && !checkingPWA && !isStandalone) {
    if (isShopSubdomain) return <Redirect href={'/shop' as Href} />;
    if (isAuthenticated) {
      if (isAdmin) return <Redirect href={'/(admin)/usuarios' as Href} />;
      return <Redirect href={'/(tabs)/feed' as Href} />;
    }
    // Mostrar landing inmediatamente — sin esperar 8s de auth
    return <LandingPage />;
  }

  // Para PWA o nativo: esperar a que auth resuelva
  if (loading || checkingPWA) {
    return (
      <View className="flex-1 bg-black items-center justify-center">
        <ActivityIndicator size="large" color="#DC2626" />
      </View>
    );
  }

  // ============================================================================
  // PWA autenticada o nativo: redirigir según rol
  // ============================================================================
  if (Platform.OS === 'web') {
    // En PWA autenticado: ir a la app según rol
    if (isAuthenticated) {
      if (isAdmin) return <Redirect href={'/(admin)/usuarios' as Href} />;
      return <Redirect href={'/(tabs)/feed' as Href} />;
    }
    // Invitado en PWA: ir al feed (puede explorar sin cuenta)
    return <Redirect href={'/(tabs)/feed' as Href} />;
  }

  // ============================================================================
  // NATIVO: Feed por defecto, login opcional desde los módulos
  // ============================================================================
  if (isAuthenticated) {
    if (isAdmin) return <Redirect href={'/(admin)/usuarios' as Href} />;
    return <Redirect href={'/(tabs)/feed' as Href} />;
  }
  // Invitado nativo: ir al feed
  return <Redirect href={'/(tabs)/feed' as Href} />;
}
