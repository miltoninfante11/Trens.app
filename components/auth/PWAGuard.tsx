// ============================================================================
// PWA GUARD - Protects routes that require PWA installation
// ============================================================================

import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { Download, Smartphone, Lock, Zap, Shield } from 'lucide-react-native';
import Animated, {
  FadeIn,
  FadeInDown,
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { isPWA } from '../../lib/platform';
import * as Haptics from '../../lib/haptics';

// ============================================================================
// TOGGLE: Poner en `true` para bloquear acceso desde navegador (solo PWA)
// Poner en `false` para permitir uso completo desde cualquier navegador
// ============================================================================
const REQUIRE_PWA = false;

// ============================================================================
// COLORS
// ============================================================================
const COLORS = {
  black: '#000000',
  red: '#DC2626',
  white: '#FFFFFF',
  zinc400: '#A1A1AA',
  zinc500: '#71717A',
  zinc600: '#52525B',
  zinc700: '#3F3F46',
  zinc800: '#27272A',
  zinc900: '#18181B',
};

// ============================================================================
// TYPES
// ============================================================================
interface PWAGuardProps {
  children: React.ReactNode;
  moduleName?: string;
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================
export function PWAGuard({ children, moduleName = 'este módulo' }: PWAGuardProps) {
  // Si REQUIRE_PWA está desactivado, permitir acceso directo
  if (!REQUIRE_PWA) return <>{children}</>;

  const router = useRouter();
  const [isAllowed, setIsAllowed] = useState<boolean | null>(null);
  const pulseAnim = useSharedValue(1);

  useEffect(() => {
    // On native platforms, always allow
    if (Platform.OS !== 'web') {
      setIsAllowed(true);
      return;
    }

    // BUGFIX: Timeout de seguridad para evitar pantalla negra indefinida
    const timeout = setTimeout(() => {
      if (isAllowed === null) {
        console.warn('⚠️ PWAGuard timeout - allowing access to prevent black screen');
        setIsAllowed(true); // Fallback: permitir acceso si tarda demasiado
      }
    }, 3000);

    // On web, check if PWA
    const checkPWA = () => {
      try {
        const pwaInstalled = isPWA();
        setIsAllowed(pwaInstalled);
      } catch (error) {
        console.error('PWAGuard check failed:', error);
        setIsAllowed(true); // En caso de error, permitir acceso
      }
    };

    checkPWA();

    // Also check when visibility changes (user might install and come back)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        checkPWA();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      clearTimeout(timeout);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isAllowed]);

  useEffect(() => {
    pulseAnim.value = withRepeat(
      withSequence(
        withTiming(1.1, { duration: 1000, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 1000, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );
  }, []);

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseAnim.value }],
  }));

  // Still checking...
  if (isAllowed === null) {
    return (
      <View className="flex-1 bg-black items-center justify-center">
        <Animated.View
          entering={FadeIn.duration(300)}
          className="w-16 h-16 rounded-full bg-red-600/20 items-center justify-center"
        >
          <Lock size={32} color={COLORS.red} />
        </Animated.View>
        <Text className="text-zinc-500 text-sm mt-4 font-mono">Verificando acceso...</Text>
      </View>
    );
  }

  // Allowed - render children
  if (isAllowed) {
    return <>{children}</>;
  }

  // Not allowed - show install prompt
  const handleInstall = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push('/instalar');
  };

  const features = [
    { icon: Zap, text: 'Acceso completo a todas las funciones' },
    { icon: Shield, text: 'Modo offline disponible' },
    { icon: Smartphone, text: 'Experiencia nativa optimizada' },
  ];

  return (
    <View className="flex-1 bg-black">
      <LinearGradient
        colors={['#000000', '#0a0505', '#000000']}
        className="flex-1 items-center justify-center px-6"
      >
        {/* Lock Icon */}
        <Animated.View entering={FadeInDown.delay(100).duration(500)} style={pulseStyle}>
          <View className="w-24 h-24 rounded-full bg-red-600/20 border-2 border-red-600/50 items-center justify-center mb-6">
            <Lock size={48} color={COLORS.red} />
          </View>
        </Animated.View>

        {/* Title */}
        <Animated.View entering={FadeInDown.delay(200).duration(500)} className="items-center">
          <Text className="text-white text-3xl font-bold text-center mb-2">Instala TRENS</Text>
          <Text className="text-zinc-400 text-center text-lg mb-2">
            para acceder a {moduleName}
          </Text>
        </Animated.View>

        {/* Description */}
        <Animated.View
          entering={FadeInDown.delay(300).duration(500)}
          className="mt-6 w-full max-w-sm"
        >
          <View className="bg-zinc-900/80 rounded-2xl p-5 border border-zinc-800">
            <Text className="text-zinc-300 text-center mb-4">
              Este módulo solo está disponible en la aplicación instalada para garantizar la mejor
              experiencia.
            </Text>

            {/* Features */}
            <View className="gap-3">
              {features.map((feature, index) => (
                <View key={index} className="flex-row items-center gap-3">
                  <View className="w-8 h-8 rounded-full bg-red-600/20 items-center justify-center">
                    <feature.icon size={16} color={COLORS.red} />
                  </View>
                  <Text className="text-zinc-400 flex-1">{feature.text}</Text>
                </View>
              ))}
            </View>
          </View>
        </Animated.View>

        {/* Install Button */}
        <Animated.View
          entering={FadeInDown.delay(400).duration(500)}
          className="mt-8 w-full max-w-sm"
        >
          <TouchableOpacity
            className="bg-red-600 py-4 rounded-xl flex-row items-center justify-center"
            onPress={handleInstall}
            activeOpacity={0.8}
          >
            <Download size={22} color={COLORS.white} />
            <Text className="text-white font-bold text-lg ml-3">Instalar TRENS</Text>
          </TouchableOpacity>

          <Text className="text-zinc-600 text-xs text-center mt-4 font-mono">
            Gratis • Sin App Store • 2 segundos
          </Text>
        </Animated.View>

        {/* Back Link */}
        <Animated.View entering={FadeInDown.delay(500).duration(500)} className="mt-8">
          <TouchableOpacity onPress={() => router.back()}>
            <Text className="text-zinc-500 text-sm">← Volver</Text>
          </TouchableOpacity>
        </Animated.View>
      </LinearGradient>
    </View>
  );
}

export default PWAGuard;
