// ============================================================================
// PAGO EXITOSO - Post-payment success page
// Premium design with visual effects
// ============================================================================

import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, Platform, ScrollView, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  CheckCircle,
  Download,
  Smartphone,
  Share,
  Menu,
  Monitor,
  ArrowDown,
  Dumbbell,
  Sparkles,
  PartyPopper,
  Trophy,
} from 'lucide-react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  withDelay,
  Easing,
  FadeInDown,
  FadeInUp,
  ZoomIn,
} from 'react-native-reanimated';
import {
  isPWA,
  canShowInstallPrompt,
  getDeviceOS,
  getInstallInstructions,
  triggerInstallPrompt,
  getDeferredPrompt,
} from '../../lib/pwaDetection';
import * as Haptics from '../../lib/haptics';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

// Premium Colors
const PREMIUM = {
  fireRed: '#DC2626',
  fireOrange: '#F97316',
  fireYellow: '#FBBF24',
  success: '#22C55E',
  successDark: '#16A34A',
  glowGreen: 'rgba(34, 197, 94, 0.5)',
};

// ============================================================================
// GLOW ORB COMPONENT
// ============================================================================
const GlowOrb = ({
  color = PREMIUM.success,
  size = 300,
  top = '20%',
  left = '50%',
  delay = 0,
}: {
  color?: string;
  size?: number;
  top?: string;
  left?: string;
  delay?: number;
}) => {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(0.2);

  useEffect(() => {
    scale.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(1.3, { duration: 4000, easing: Easing.inOut(Easing.ease) }),
          withTiming(1, { duration: 4000, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        true
      )
    );
    opacity.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(0.4, { duration: 3000, easing: Easing.inOut(Easing.ease) }),
          withTiming(0.15, { duration: 3000, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        true
      )
    );
  }, []);

  return (
    <Animated.View
      style={{
        position: 'absolute',
        top: top as `${number}%`,
        left: left as `${number}%`,
        width: size,
        height: size,
        marginLeft: -size / 2,
        marginTop: -size / 2,
        borderRadius: size / 2,
        backgroundColor: color,
      }}
      className="blur-3xl"
    />
  );
};

// ============================================================================
// CONFETTI PARTICLE
// ============================================================================
const ConfettiParticle = ({ delay = 0, left = 50 }: { delay?: number; left?: number }) => {
  const translateY = useSharedValue(-50);
  const translateX = useSharedValue(0);
  const rotation = useSharedValue(0);
  const opacity = useSharedValue(0);

  const colors = [PREMIUM.fireRed, PREMIUM.fireOrange, PREMIUM.fireYellow, PREMIUM.success];
  const color = colors[Math.floor(Math.random() * colors.length)];

  useEffect(() => {
    translateY.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(SCREEN_HEIGHT * 0.8, {
            duration: 4000 + Math.random() * 2000,
            easing: Easing.in(Easing.quad),
          }),
          withTiming(-50, { duration: 0 })
        ),
        -1
      )
    );
    translateX.value = withDelay(
      delay,
      withRepeat(
        withSequence(withTiming(30, { duration: 800 }), withTiming(-30, { duration: 800 })),
        -1,
        true
      )
    );
    rotation.value = withDelay(
      delay,
      withRepeat(withTiming(360, { duration: 2000, easing: Easing.linear }), -1)
    );
    opacity.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 500 }),
          withTiming(1, { duration: 3000 }),
          withTiming(0, { duration: 1000 })
        ),
        -1
      )
    );
  }, []);

  const style = useAnimatedStyle(() => ({
    position: 'absolute',
    top: 0,
    left: `${left}%`,
    width: 8,
    height: 8,
    backgroundColor: color,
    opacity: opacity.value,
    transform: [
      { translateY: translateY.value },
      { translateX: translateX.value },
      { rotate: `${rotation.value}deg` },
    ],
  }));

  return <Animated.View style={style} className="rounded-sm" />;
};

// ============================================================================
// INSTRUCTION STEP COMPONENT
// ============================================================================
const InstructionStep = ({
  number,
  text,
  icon: Icon,
  delay = 0,
}: {
  number: number;
  text: string;
  icon?: any;
  delay?: number;
}) => (
  <Animated.View
    entering={FadeInUp.delay(delay).duration(500)}
    className="flex-row items-start gap-4 mb-5"
  >
    <LinearGradient
      colors={[PREMIUM.fireRed, PREMIUM.fireOrange]}
      className="w-9 h-9 rounded-full items-center justify-center"
      style={{
        shadowColor: PREMIUM.fireRed,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.4,
        shadowRadius: 6,
      }}
    >
      <Text className="text-white font-bold text-sm">{number}</Text>
    </LinearGradient>
    <View className="flex-1 pt-1.5">
      <Text className="text-white text-base leading-relaxed">{text}</Text>
    </View>
    {Icon && <Icon size={24} color={PREMIUM.fireRed} />}
  </Animated.View>
);

// ============================================================================
// MAIN COMPONENT
// ============================================================================
export default function PagoExitosoScreen() {
  const [deviceOS, setDeviceOS] = useState<'ios' | 'android' | 'desktop' | 'unknown'>('unknown');
  const [canInstall, setCanInstall] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [installing, setInstalling] = useState(false);

  // Animation for the install button
  const pulseAnim = useSharedValue(1);
  const bounceAnim = useSharedValue(0);

  useEffect(() => {
    if (Platform.OS === 'web') {
      setDeviceOS(getDeviceOS());
      setCanInstall(canShowInstallPrompt());
      setIsInstalled(isPWA());

      // Listen for beforeinstallprompt
      const handleBeforeInstall = (e: Event) => {
        e.preventDefault();
        setCanInstall(true);
        (window as any).deferredInstallPrompt = e;
      };

      window.addEventListener('beforeinstallprompt', handleBeforeInstall);

      // Listen for app installed
      const handleAppInstalled = () => {
        setIsInstalled(true);
        setCanInstall(false);
      };

      window.addEventListener('appinstalled', handleAppInstalled);

      return () => {
        window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
        window.removeEventListener('appinstalled', handleAppInstalled);
      };
    }
  }, []);

  useEffect(() => {
    // Pulse animation for install button
    pulseAnim.value = withRepeat(
      withSequence(
        withTiming(1.05, { duration: 800, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 800, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );

    // Bounce animation for arrow
    bounceAnim.value = withRepeat(
      withSequence(
        withTiming(-10, { duration: 500, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: 500, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );
  }, []);

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseAnim.value }],
  }));

  const bounceStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: bounceAnim.value }],
  }));

  // Handle install button click
  const handleInstall = async () => {
    setInstalling(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

    try {
      const installed = await triggerInstallPrompt();
      if (installed) {
        setIsInstalled(true);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (err) {
      console.error('Install error:', err);
    } finally {
      setInstalling(false);
    }
  };

  const instructions = getInstallInstructions();

  // Already installed - redirect to app
  if (isInstalled) {
    if (Platform.OS === 'web') {
      window.location.href = '/';
    }
    return null;
  }

  return (
    <ScrollView
      className="flex-1 bg-black"
      contentContainerStyle={{ flexGrow: 1 }}
      showsVerticalScrollIndicator={false}
    >
      {/* Background Effects */}
      <View className="absolute inset-0 overflow-hidden">
        <GlowOrb color={PREMIUM.success} size={500} top="5%" left="30%" delay={0} />
        <GlowOrb color={PREMIUM.successDark} size={350} top="60%" left="70%" delay={1000} />
        <GlowOrb color={PREMIUM.fireRed} size={250} top="80%" left="20%" delay={2000} />

        {/* Confetti */}
        {[...Array(20)].map((_, i) => (
          <ConfettiParticle key={i} delay={i * 200} left={5 + i * 4.5} />
        ))}
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
        {/* Success Icon with Glow */}
        <Animated.View entering={ZoomIn.duration(800).springify()} className="items-center mb-8">
          <View className="relative">
            {/* Glow behind icon */}
            <View
              style={{
                position: 'absolute',
                width: 140,
                height: 140,
                borderRadius: 70,
                backgroundColor: PREMIUM.success,
                opacity: 0.3,
                top: -10,
                left: -10,
              }}
              className="blur-2xl"
            />
            <LinearGradient
              colors={[PREMIUM.success, PREMIUM.successDark]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              className="w-28 h-28 rounded-full items-center justify-center"
              style={{
                shadowColor: PREMIUM.success,
                shadowOffset: { width: 0, height: 8 },
                shadowOpacity: 0.5,
                shadowRadius: 20,
                elevation: 15,
              }}
            >
              <CheckCircle size={60} color="white" strokeWidth={2} />
            </LinearGradient>
          </View>
        </Animated.View>

        {/* Success Text */}
        <Animated.View
          entering={FadeInDown.delay(300).duration(600)}
          className="items-center mb-10"
        >
          <Text
            className="text-white text-4xl font-bold text-center mb-3"
            style={{
              textShadowColor: PREMIUM.glowGreen,
              textShadowOffset: { width: 0, height: 4 },
              textShadowRadius: 20,
            }}
          >
            ¡Pago exitoso!
          </Text>
          <View className="flex-row items-center gap-2">
            <PartyPopper size={20} color={PREMIUM.fireYellow} />
            <Text className="text-zinc-400 text-lg">
              Ya eres parte de <Text className="text-red-500 font-bold">TRENS PRO</Text>
            </Text>
            <Trophy size={20} color={PREMIUM.fireYellow} />
          </View>
        </Animated.View>

        {/* Install Card */}
        <Animated.View entering={FadeInUp.delay(500).duration(700)} className="w-full max-w-md">
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

              <Text className="text-white text-2xl font-bold text-center mb-2">Instala la app</Text>
              <Text className="text-zinc-400 text-center mb-8">
                Para acceder a tu cuenta, necesitas instalar TRENS en tu dispositivo
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
                      colors={[PREMIUM.fireRed, '#B91C1C']}
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
                        {installing ? 'Instalando...' : 'INSTALAR TRENS'}
                      </Text>
                    </LinearGradient>
                  </TouchableOpacity>
                </Animated.View>
              ) : (
                /* Manual instructions */
                <View className="mb-8">
                  <View className="bg-zinc-800/40 backdrop-blur rounded-2xl p-6 mb-6 border border-zinc-700/30">
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
                      <InstructionStep
                        key={index}
                        number={index + 1}
                        text={step}
                        delay={600 + index * 100}
                      />
                    ))}
                  </View>

                  {/* iOS specific visual */}
                  {deviceOS === 'ios' && (
                    <View className="bg-zinc-800/40 rounded-2xl p-4 flex-row items-center gap-4 border border-zinc-700/30">
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

                  {/* Android specific visual */}
                  {deviceOS === 'android' && (
                    <View className="bg-zinc-800/40 rounded-2xl p-4 flex-row items-center gap-4 border border-zinc-700/30">
                      <View className="w-12 h-12 rounded-xl bg-zinc-700 items-center justify-center">
                        <Menu size={22} color="white" />
                      </View>
                      <View className="flex-1">
                        <Text className="text-white font-bold">Busca el menú (⋮)</Text>
                        <Text className="text-zinc-500 text-sm">Arriba a la derecha</Text>
                      </View>
                    </View>
                  )}
                </View>
              )}

              {/* Note */}
              <View className="bg-red-900/20 border border-red-600/30 rounded-2xl p-5">
                <View className="flex-row items-center justify-center gap-2 mb-2">
                  <Sparkles size={16} color={PREMIUM.fireRed} />
                  <Text className="text-red-400 font-bold text-sm">Importante</Text>
                </View>
                <Text className="text-red-400/80 text-sm text-center leading-relaxed">
                  Solo podrás acceder desde la app instalada.{'\n'}
                  No es posible usar TRENS desde el navegador.
                </Text>
              </View>
            </View>
          </View>
        </Animated.View>

        {/* Logo */}
        <Animated.View entering={FadeInUp.delay(800).duration(600)} className="mt-12 items-center">
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
