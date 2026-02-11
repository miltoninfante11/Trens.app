// ============================================================================
// INSTALAR PAGE - Premium redirect page for PWA installation
// ============================================================================

import React, { useEffect } from 'react';
import { View, Text, TouchableOpacity, Platform, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Smartphone,
  Download,
  AlertTriangle,
  Dumbbell,
  Share,
  Menu,
  Monitor,
  ArrowDown,
  Sparkles,
} from 'lucide-react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  Easing,
  FadeInDown,
  FadeInUp,
  ZoomIn,
} from 'react-native-reanimated';
import {
  isPWA,
  getDeviceOS,
  getInstallInstructions,
  triggerInstallPrompt,
  getDeferredPrompt,
  canShowInstallPrompt,
} from '../../lib/pwaDetection';
import * as Haptics from '../../lib/haptics';

const PREMIUM = {
  fireRed: '#DC2626',
  fireRedDark: '#B91C1C',
  fireOrange: '#F97316',
  fireYellow: '#FBBF24',
  warningOrange: '#EA580C',
};

// Glow orb component
const GlowOrb = ({
  color,
  size,
  top,
  left,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  delay = 0,
}: {
  color: string;
  size: number;
  top: string;
  left: string;
  delay?: number;
}) => {
  return (
    <View
      style={{
        position: 'absolute',
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: color,
        top: top as `${number}%`,
        left: left as `${number}%`,
        opacity: 0.2,
      }}
      className="blur-3xl"
    />
  );
};

// Animated step component
const InstallStep = ({ number, text, delay }: { number: number; text: string; delay: number }) => (
  <Animated.View
    entering={FadeInUp.delay(delay).duration(400)}
    className="flex-row items-start gap-4 mb-5"
  >
    <LinearGradient
      colors={[PREMIUM.fireRed, PREMIUM.fireRedDark]}
      className="w-9 h-9 rounded-xl items-center justify-center"
      style={{
        shadowColor: PREMIUM.fireRed,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.4,
        shadowRadius: 8,
      }}
    >
      <Text className="text-white font-bold text-sm">{number}</Text>
    </LinearGradient>
    <View className="flex-1 pt-2">
      <Text className="text-zinc-300 text-base leading-relaxed">{text}</Text>
    </View>
  </Animated.View>
);

export default function InstalarScreen() {
  const router = useRouter();
  const [deviceOS, setDeviceOS] = React.useState<'ios' | 'android' | 'desktop' | 'unknown'>(
    'unknown'
  );
  const [canInstall, setCanInstall] = React.useState(false);
  const [installing, setInstalling] = React.useState(false);

  const bounceAnim = useSharedValue(0);
  const pulseAnim = useSharedValue(1);

  useEffect(() => {
    if (Platform.OS === 'web') {
      // If already in PWA, redirect to home
      if (isPWA()) {
        router.replace('/');
        return;
      }

      setDeviceOS(getDeviceOS());
      setCanInstall(canShowInstallPrompt() && !!getDeferredPrompt());

      // Listen for install prompt
      const handleBeforeInstall = (e: Event) => {
        e.preventDefault();
        setCanInstall(true);
        (window as any).deferredInstallPrompt = e;
      };

      window.addEventListener('beforeinstallprompt', handleBeforeInstall);

      return () => {
        window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      };
    }
  }, []);

  useEffect(() => {
    bounceAnim.value = withRepeat(
      withSequence(
        withTiming(-8, { duration: 600, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: 600, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );

    pulseAnim.value = withRepeat(
      withSequence(
        withTiming(1.05, { duration: 1000, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 1000, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );
  }, []);

  const bounceStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: bounceAnim.value }],
  }));

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseAnim.value }],
  }));

  const handleInstall = async () => {
    setInstalling(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

    try {
      const installed = await triggerInstallPrompt();
      if (installed) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (err) {
      console.error('Install error:', err);
    } finally {
      setInstalling(false);
    }
  };

  const instructions = getInstallInstructions();

  return (
    <ScrollView
      className="flex-1 bg-black"
      contentContainerStyle={{ flexGrow: 1 }}
      showsVerticalScrollIndicator={false}
    >
      {/* Background Effects */}
      <View className="absolute inset-0 overflow-hidden">
        <GlowOrb color={PREMIUM.warningOrange} size={400} top="-10%" left="20%" delay={0} />
        <GlowOrb color={PREMIUM.fireRed} size={300} top="50%" left="70%" delay={1000} />
        <GlowOrb color={PREMIUM.fireYellow} size={200} top="80%" left="10%" delay={2000} />
      </View>

      {/* Grid Pattern */}
      <View
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          opacity: 0.02,
          ...(Platform.OS === 'web' &&
            ({
              backgroundImage:
                'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)',
              backgroundSize: '40px 40px',
            } as any)),
        }}
      />

      <View className="flex-1 px-6 py-20 items-center justify-center relative z-10">
        {/* Warning Icon with Glow */}
        <Animated.View entering={ZoomIn.duration(600).springify()} className="items-center mb-8">
          <View className="relative">
            {/* Glow behind icon */}
            <View
              style={{
                position: 'absolute',
                width: 140,
                height: 140,
                borderRadius: 70,
                backgroundColor: PREMIUM.warningOrange,
                opacity: 0.25,
                top: -10,
                left: -10,
              }}
              className="blur-2xl"
            />
            <LinearGradient
              colors={[PREMIUM.fireOrange, PREMIUM.warningOrange]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              className="w-28 h-28 rounded-full items-center justify-center"
              style={{
                shadowColor: PREMIUM.fireOrange,
                shadowOffset: { width: 0, height: 8 },
                shadowOpacity: 0.6,
                shadowRadius: 20,
              }}
            >
              <AlertTriangle size={60} color="white" strokeWidth={2} />
            </LinearGradient>
          </View>
        </Animated.View>

        {/* Warning Text */}
        <Animated.View
          entering={FadeInDown.delay(200).duration(500)}
          className="items-center mb-10"
        >
          <Text
            className="text-white text-3xl font-bold text-center mb-3"
            style={{
              textShadowColor: 'rgba(249, 115, 22, 0.4)',
              textShadowOffset: { width: 0, height: 4 },
              textShadowRadius: 15,
            }}
          >
            Acceso restringido
          </Text>
          <Text className="text-zinc-400 text-lg text-center max-w-sm leading-relaxed">
            TRENS solo funciona como app instalada.{'\n'}No es posible acceder desde el navegador.
          </Text>
        </Animated.View>

        {/* Install Card */}
        <Animated.View entering={FadeInUp.delay(400).duration(600)} className="w-full max-w-md">
          <View className="relative">
            {/* Card glow */}
            <View
              style={{
                position: 'absolute',
                top: -15,
                left: -15,
                right: -15,
                bottom: -15,
                borderRadius: 40,
                backgroundColor: PREMIUM.fireRed,
                opacity: 0.1,
              }}
              className="blur-3xl"
            />

            <View className="bg-zinc-900/60 backdrop-blur-xl border border-zinc-800/50 rounded-[32px] p-8 overflow-hidden">
              {/* Inner gradient */}
              <LinearGradient
                colors={['rgba(220, 38, 38, 0.05)', 'transparent']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  borderRadius: 30,
                }}
              />

              {/* Arrow indicator */}
              <View className="items-center mb-6">
                <Animated.View style={bounceStyle}>
                  <View className="bg-red-600/20 p-3 rounded-full">
                    <ArrowDown size={28} color={PREMIUM.fireRed} />
                  </View>
                </Animated.View>
              </View>

              <Text className="text-white text-2xl font-bold text-center mb-2">Instala TRENS</Text>
              <Text className="text-zinc-400 text-center mb-8">
                Sigue estos pasos para acceder a la app
              </Text>

              {/* Install Button (if supported) */}
              {canInstall && getDeferredPrompt() ? (
                <Animated.View style={pulseStyle} className="mb-8">
                  <TouchableOpacity
                    onPress={handleInstall}
                    disabled={installing}
                    activeOpacity={0.9}
                  >
                    <View
                      style={{
                        position: 'absolute',
                        top: -8,
                        left: -8,
                        right: -8,
                        bottom: -8,
                        borderRadius: 20,
                        backgroundColor: PREMIUM.fireRed,
                        opacity: 0.3,
                      }}
                      className="blur-xl"
                    />
                    <LinearGradient
                      colors={[PREMIUM.fireRed, PREMIUM.fireRedDark]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      className="py-5 rounded-2xl flex-row items-center justify-center gap-3"
                      style={{
                        shadowColor: PREMIUM.fireRed,
                        shadowOffset: { width: 0, height: 8 },
                        shadowOpacity: 0.5,
                        shadowRadius: 16,
                      }}
                    >
                      <Download size={24} color="white" />
                      <Text className="text-white text-xl font-bold">
                        {installing ? 'Instalando...' : 'INSTALAR AHORA'}
                      </Text>
                    </LinearGradient>
                  </TouchableOpacity>
                </Animated.View>
              ) : (
                /* Manual instructions */
                <View className="mb-6">
                  <View className="bg-zinc-800/40 backdrop-blur rounded-2xl p-6 border border-zinc-700/30">
                    <View className="flex-row items-center gap-3 mb-5">
                      {deviceOS === 'ios' ? (
                        <Smartphone size={24} color={PREMIUM.fireRed} />
                      ) : deviceOS === 'android' ? (
                        <Smartphone size={24} color={PREMIUM.fireRed} />
                      ) : (
                        <Monitor size={24} color={PREMIUM.fireRed} />
                      )}
                      <Text className="text-white text-lg font-bold">{instructions.title}</Text>
                    </View>

                    {instructions.steps.map((step, index) => (
                      <InstallStep
                        key={index}
                        number={index + 1}
                        text={step}
                        delay={500 + index * 100}
                      />
                    ))}
                  </View>
                </View>
              )}

              {/* Helper visuals */}
              {deviceOS === 'ios' && (
                <View className="bg-zinc-800/40 rounded-2xl p-4 flex-row items-center gap-4 mb-4 border border-zinc-700/30">
                  <LinearGradient
                    colors={['#3B82F6', '#1D4ED8']}
                    className="w-12 h-12 rounded-xl items-center justify-center"
                  >
                    <Share size={22} color="white" />
                  </LinearGradient>
                  <View className="flex-1">
                    <Text className="text-white font-bold">Busca este ícono</Text>
                    <Text className="text-zinc-500 text-sm">En la barra de Safari</Text>
                  </View>
                </View>
              )}

              {deviceOS === 'android' && (
                <View className="bg-zinc-800/40 rounded-2xl p-4 flex-row items-center gap-4 mb-4 border border-zinc-700/30">
                  <View className="w-12 h-12 rounded-xl bg-zinc-700 items-center justify-center">
                    <Menu size={22} color="white" />
                  </View>
                  <View className="flex-1">
                    <Text className="text-white font-bold">Busca el menú (⋮)</Text>
                    <Text className="text-zinc-500 text-sm">Arriba a la derecha</Text>
                  </View>
                </View>
              )}

              {/* Subscribe CTA */}
              <View className="bg-red-900/20 border border-red-600/30 rounded-2xl p-5">
                <View className="flex-row items-center justify-center gap-2 mb-2">
                  <Sparkles size={16} color={PREMIUM.fireRed} />
                  <Text className="text-red-400 font-bold text-sm">¿No tienes cuenta?</Text>
                </View>
                <TouchableOpacity
                  onPress={() => {
                    if (Platform.OS === 'web') {
                      window.location.href = '/(web)/landing';
                    }
                  }}
                >
                  <Text className="text-red-500 font-bold text-center underline">
                    Suscríbete aquí →
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Animated.View>

        {/* Logo */}
        <Animated.View entering={FadeInUp.delay(700).duration(500)} className="mt-12 items-center">
          <View className="flex-row items-center gap-3">
            <LinearGradient
              colors={[PREMIUM.fireRed, PREMIUM.fireOrange]}
              className="w-10 h-10 rounded-xl items-center justify-center"
            >
              <Dumbbell size={20} color="white" />
            </LinearGradient>
            <Text
              className="text-white text-xl font-bold"
              style={{
                textShadowColor: 'rgba(220, 38, 38, 0.3)',
                textShadowOffset: { width: 0, height: 2 },
                textShadowRadius: 10,
              }}
            >
              TRENS
            </Text>
          </View>
          <Text className="text-zinc-600 text-xs mt-2 tracking-widest">
            HIGH PERFORMANCE FITNESS
          </Text>
        </Animated.View>
      </View>
    </ScrollView>
  );
}
