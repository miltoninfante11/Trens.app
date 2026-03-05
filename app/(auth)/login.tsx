import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
} from 'react-native';
import { Link, useRouter } from 'expo-router';
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import * as Haptics from '../../lib/haptics';
import {
  Shield,
  Lock,
  Mail,
  Eye,
  EyeOff,
  Dumbbell,
  Flame,
  ArrowRight,
  Sparkles,
  Crown,
} from 'lucide-react-native';
import { ProUpgradeModal } from '../../components/pro/ProUpgradeModal';
import { LinearGradient } from 'expo-linear-gradient';
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

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Premium Colors
const PREMIUM = {
  fireRed: '#DC2626',
  fireOrange: '#F97316',
  fireYellow: '#FBBF24',
  glowRed: 'rgba(220, 38, 38, 0.6)',
};

// FormWrapper FUERA del componente para evitar re-renders
const WebFormWrapper = React.memo(
  ({ children, onSubmit }: { children: React.ReactNode; onSubmit: () => void }) => {
    if (Platform.OS !== 'web') {
      return <View className="gap-5">{children}</View>;
    }

    return (
      <form
        onSubmit={(e: any) => {
          e.preventDefault();
          e.stopPropagation();
          onSubmit();
          return false;
        }}
        autoComplete="on"
        name="trens-login-form"
        id="trens-login-form"
        style={{ display: 'flex', flexDirection: 'column', gap: 20 }}
      >
        {children}
      </form>
    );
  }
);

// ============================================================================
// ANIMATED GLOW ORB
// ============================================================================
const GlowOrb = ({
  color = PREMIUM.fireRed,
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

  const orbStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  return (
    <View
      style={{
        position: 'absolute',
        top: top as any,
        left: left as any,
        width: size,
        height: size,
        marginLeft: -size / 2,
        marginTop: -size / 2,
      }}
      className="blur-3xl"
    >
      <Animated.View
        style={[
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: color,
          },
          orbStyle,
        ]}
      />
    </View>
  );
};

// ============================================================================
// ANIMATED LOGO
// ============================================================================
const AnimatedLogo = () => {
  const glowScale = useSharedValue(1);
  const glowOpacity = useSharedValue(0.5);

  useEffect(() => {
    glowScale.value = withRepeat(
      withSequence(
        withTiming(1.2, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 2000, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );
    glowOpacity.value = withRepeat(
      withSequence(withTiming(0.7, { duration: 2000 }), withTiming(0.3, { duration: 2000 })),
      -1,
      true
    );
  }, []);

  const glowStyle = useAnimatedStyle(() => ({
    position: 'absolute',
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: PREMIUM.fireRed,
    opacity: glowOpacity.value,
    transform: [{ scale: glowScale.value }],
  }));

  return (
    <View className="items-center justify-center relative">
      <Animated.View style={glowStyle} className="blur-2xl" />
      <LinearGradient
        colors={[PREMIUM.fireRed, '#B91C1C']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        className="w-20 h-20 rounded-[20px] items-center justify-center z-10"
        style={{
          shadowColor: PREMIUM.fireRed,
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: 0.5,
          shadowRadius: 16,
          elevation: 15,
        }}
      >
        <Dumbbell size={40} color="white" strokeWidth={2} />
      </LinearGradient>
    </View>
  );
};

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showProModal, setShowProModal] = useState(false);
  const router = useRouter();

  // Refs para mantener focus en inputs
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);

  // Animations
  const floatAnim = useSharedValue(0);

  useEffect(() => {
    floatAnim.value = withRepeat(
      withSequence(
        withTiming(-8, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
        withTiming(8, { duration: 2000, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );
  }, []);

  const floatStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: floatAnim.value }],
  }));

  // Callbacks estables para evitar re-renders que cierran el teclado
  const handleEmailChange = useCallback((text: string) => {
    setEmail(text);
  }, []);

  const handlePasswordChange = useCallback((text: string) => {
    setPassword(text);
  }, []);

  // Configurar meta tags para la barra de URL negra (solo web)
  useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      // Asegurar theme-color negro
      let themeColor = document.querySelector('meta[name="theme-color"]');
      if (themeColor) {
        themeColor.setAttribute('content', '#000000');
      }
      // Agregar meta para Safari
      let statusBar = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');
      if (statusBar) {
        statusBar.setAttribute('content', 'black');
      }
    }
  }, []);

  const handleLogin = useCallback(async () => {
    if (!email || !password) {
      setError('Por favor completa todos los campos');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });

      if (authError) throw authError;

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      // Verificar si es admin/ceo para redirigir al panel admin
      if (authData.user) {
        const { data: roleData } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', authData.user.id)
          .single();

        if (roleData?.role === 'admin' || roleData?.role === 'ceo') {
          router.replace('/(admin)/usuarios');
          return;
        }
      }

      router.replace('/(tabs)/feed');
    } catch (err: any) {
      setError(err.message || 'Error al iniciar sesión');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setLoading(false);
    }
  }, [email, password, router]);

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      className="flex-1 bg-black"
    >
      {/* Background Effects */}
      <View className="absolute inset-0 overflow-hidden">
        <GlowOrb color={PREMIUM.fireRed} size={500} top="5%" left="30%" delay={0} />
        <GlowOrb color={PREMIUM.fireOrange} size={350} top="70%" left="70%" delay={1000} />
        <GlowOrb color="#B91C1C" size={250} top="90%" left="20%" delay={2000} />

        {/* Grid pattern */}
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
      </View>

      <View className="flex-1 justify-center px-6 relative z-10">
        {/* Logo with Animation */}
        <Animated.View
          entering={ZoomIn.duration(800).springify()}
          style={floatStyle}
          className="items-center mb-8"
        >
          <AnimatedLogo />
        </Animated.View>

        {/* Brand */}
        <Animated.View entering={FadeInDown.delay(200).duration(600)} className="items-center mb-4">
          <Text
            className="text-white text-5xl font-bold tracking-tight"
            style={{
              textShadowColor: PREMIUM.glowRed,
              textShadowOffset: { width: 0, height: 4 },
              textShadowRadius: 20,
            }}
          >
            TRENS
          </Text>
        </Animated.View>

        {/* Tagline */}
        <Animated.View entering={FadeInDown.delay(300).duration(600)} className="items-center mb-8">
          <LinearGradient
            colors={[PREMIUM.fireRed, PREMIUM.fireOrange]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            className="px-4 py-1.5 rounded-full"
          >
            <Text className="text-white/90 text-xs tracking-[0.25em] uppercase font-medium">
              High Performance Fitness
            </Text>
          </LinearGradient>
        </Animated.View>

        {/* Security Badge */}
        <Animated.View
          entering={FadeInDown.delay(400).duration(600)}
          className="flex-row items-center justify-center mb-6 py-2 px-4 bg-zinc-900/30 backdrop-blur-xl rounded-full self-center border border-zinc-800/50"
        >
          <Lock size={12} color="#22c55e" />
          <Text className="text-green-500 text-xs ml-2 font-medium">Conexión segura SSL</Text>
        </Animated.View>

        {/* Error Message */}
        {error && (
          <Animated.View
            entering={FadeInDown.duration(300)}
            className="bg-red-900/20 border border-red-600/50 backdrop-blur-xl rounded-2xl p-4 mb-6"
          >
            <Text className="text-red-400 text-center text-sm">{error}</Text>
          </Animated.View>
        )}

        {/* Form */}
        <Animated.View entering={FadeInUp.delay(500).duration(700)}>
          <WebFormWrapper onSubmit={handleLogin}>
            {/* Email Input */}
            <View>
              <Text className="text-zinc-500 text-xs mb-2.5 tracking-[0.2em] font-medium uppercase">
                Email
              </Text>
              <View className="flex-row items-center bg-zinc-900/50 backdrop-blur-xl rounded-2xl px-4 border border-zinc-800/50">
                <Mail size={18} color="#71717a" />
                <TextInput
                  ref={emailRef}
                  placeholder="tu@email.com"
                  placeholderTextColor="#52525b"
                  value={email}
                  onChangeText={handleEmailChange}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoComplete="email"
                  autoCorrect={false}
                  textContentType="emailAddress"
                  inputMode="email"
                  blurOnSubmit={false}
                  returnKeyType="next"
                  onSubmitEditing={() => passwordRef.current?.focus()}
                  nativeID="email"
                  className="flex-1 text-white py-4 px-3 text-base"
                />
              </View>
            </View>

            {/* Password Input */}
            <View>
              <Text className="text-zinc-500 text-xs mb-2.5 tracking-[0.2em] font-medium uppercase">
                Contraseña
              </Text>
              <View className="flex-row items-center bg-zinc-900/50 backdrop-blur-xl rounded-2xl px-4 border border-zinc-800/50">
                <Lock size={18} color="#71717a" />
                <TextInput
                  ref={passwordRef}
                  placeholder="••••••••"
                  placeholderTextColor="#52525b"
                  value={password}
                  onChangeText={handlePasswordChange}
                  secureTextEntry={!showPassword}
                  autoComplete="current-password"
                  autoCorrect={false}
                  textContentType="password"
                  autoCapitalize="none"
                  blurOnSubmit={false}
                  returnKeyType="done"
                  onSubmitEditing={handleLogin}
                  nativeID="password"
                  className="flex-1 text-white py-4 px-3 text-base"
                />
                <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                  {showPassword ? (
                    <EyeOff size={20} color="#71717a" />
                  ) : (
                    <Eye size={20} color="#71717a" />
                  )}
                </TouchableOpacity>
              </View>
            </View>

            {/* Login Button */}
            <TouchableOpacity
              onPress={handleLogin}
              disabled={loading}
              activeOpacity={0.9}
              className="mt-2"
            >
              <LinearGradient
                colors={loading ? ['#3f3f46', '#27272a'] : [PREMIUM.fireRed, '#B91C1C']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                className="py-5 rounded-2xl flex-row items-center justify-center gap-3"
                style={{
                  shadowColor: loading ? 'transparent' : PREMIUM.fireRed,
                  shadowOffset: { width: 0, height: 6 },
                  shadowOpacity: 0.4,
                  shadowRadius: 12,
                  elevation: loading ? 0 : 10,
                }}
              >
                {loading ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <>
                    <Flame size={22} color="white" />
                    <Text className="text-white font-bold text-lg tracking-widest">ENTRAR</Text>
                    <ArrowRight size={20} color="white" />
                  </>
                )}
              </LinearGradient>
            </TouchableOpacity>
          </WebFormWrapper>
        </Animated.View>

        {/* Suscríbete + Coach */}
        <Animated.View
          entering={FadeInUp.delay(700).duration(600)}
          className="mt-8 items-center gap-4"
        >
          {/* Botón Suscríbete */}
          <TouchableOpacity
            onPress={() => {
              if (Platform.OS === 'web') {
                router.push('/(web)/landing' as any);
              } else {
                setShowProModal(true);
              }
            }}
            activeOpacity={0.9}
          >
            <LinearGradient
              colors={['#F97316', '#FBBF24']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              className="flex-row items-center gap-2 px-6 py-3 rounded-full"
              style={{
                shadowColor: '#F97316',
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.3,
                shadowRadius: 8,
                elevation: 6,
              }}
            >
              <Crown size={16} color="white" />
              <Text className="text-white font-bold text-sm tracking-widest">SUSCRÍBETE</Text>
              <ArrowRight size={16} color="white" />
            </LinearGradient>
          </TouchableOpacity>

          <Link href="/(auth)/coach-access" asChild>
            <TouchableOpacity className="flex-row items-center gap-2">
              <Sparkles size={14} color="#52525b" />
              <Text className="text-zinc-500 text-sm">Acceso Coach</Text>
              <ArrowRight size={14} color="#52525b" />
            </TouchableOpacity>
          </Link>
        </Animated.View>

        {/* Pro Upgrade Modal */}
        <ProUpgradeModal visible={showProModal} onClose={() => setShowProModal(false)} />

        {/* Legal Links */}
        <Animated.View
          entering={FadeInUp.delay(800).duration(600)}
          className="flex-row justify-center gap-4 mt-6"
        >
          <Link href="/privacy" asChild>
            <TouchableOpacity>
              <Text className="text-zinc-600 text-xs">Privacidad</Text>
            </TouchableOpacity>
          </Link>
          <Text className="text-zinc-700 text-xs">•</Text>
          <Link href="/terms" asChild>
            <TouchableOpacity>
              <Text className="text-zinc-600 text-xs">Términos</Text>
            </TouchableOpacity>
          </Link>
          <Text className="text-zinc-700 text-xs">•</Text>
          <Link href="/contact" asChild>
            <TouchableOpacity>
              <Text className="text-zinc-600 text-xs">Contacto</Text>
            </TouchableOpacity>
          </Link>
        </Animated.View>

        {/* Footer */}
        <Animated.View
          entering={FadeInUp.delay(900).duration(600)}
          className="mt-auto pb-6 items-center"
        >
          <View className="flex-row items-center mb-3 bg-green-900/20 border border-green-600/30 rounded-full px-4 py-2">
            <Shield size={12} color="#22c55e" />
            <Text className="text-green-500 text-xs ml-2">Sitio verificado y seguro</Text>
          </View>
          <Text className="text-zinc-700 text-xs text-center">
            © 2026 TRENS - High Performance Fitness
          </Text>
          <Text className="text-zinc-800 text-xs text-center mt-1">soporte@trens.app</Text>
        </Animated.View>
      </View>
    </KeyboardAvoidingView>
  );
}
