// ============================================================================
// LANDING PAGE - TRENS
// Premium High-Performance Landing with World-Class Visual Effects
// Solo visible desde web (no PWA). Página de venta y suscripción.
// ============================================================================

import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  Dimensions,
  KeyboardAvoidingView,
} from 'react-native';
import { Link } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Dumbbell,
  Camera,
  Trophy,
  Music,
  Utensils,
  Pill,
  TrendingUp,
  Shield,
  CreditCard,
  Mail,
  User,
  Lock,
  Eye,
  EyeOff,
  Check,
  ChevronRight,
  Flame,
  Star,
  Heart,
  Sparkles,
  ArrowRight,
  Play,
  Crown,
  Brain,
  Dna,
  Video,
  ShoppingCart,
  Warehouse,
  Flag,
  Waves,
  Smartphone,
  Globe,
  BarChart3,
  Instagram,
  Mic,
  BellRing,
  Layers,
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
  FadeInLeft,
  SlideInLeft,
  SlideInRight,
  ZoomIn,
} from 'react-native-reanimated';
import openpay, {
  formatCardNumber,
  formatExpiry,
  validateCardNumber,
  getCardBrand,
  getPlanDetails,
  getFormattedPrice,
} from '../../lib/openpay';
import { supabase } from '../../lib/supabase';
import * as Haptics from '../../lib/haptics';
import {
  PhoneInput,
  getDefaultCountry,
  getFullPhoneNumber,
  Country,
} from '../../components/ui/PhoneInput';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// ============================================================================
// PREMIUM COLORS - ED HARDY FIRE PALETTE
// ============================================================================
const PREMIUM_COLORS = {
  // Core
  black: '#000000',
  blackPure: '#000000',
  blackSoft: '#0A0A0A',
  blackCard: '#0D0D0D',

  // Fire Gradient
  fireRed: '#DC2626',
  fireOrange: '#F97316',
  fireYellow: '#FBBF24',
  fireEmber: '#EF4444',

  // Glow Effects
  glowRed: 'rgba(220, 38, 38, 0.6)',
  glowOrange: 'rgba(249, 115, 22, 0.5)',
  glowSoft: 'rgba(220, 38, 38, 0.2)',

  // Glass
  glassBorder: 'rgba(255, 255, 255, 0.08)',
  glassBackground: 'rgba(255, 255, 255, 0.03)',
  glassBorderHover: 'rgba(220, 38, 38, 0.3)',

  // Text
  textPrimary: '#FFFFFF',
  textSecondary: '#A1A1AA',
  textMuted: '#71717A',
  textDark: '#52525B',
};

// ============================================================================
// ANIMATED FLOATING PARTICLES (Fire Embers Effect)
// ============================================================================
const FloatingParticle = ({ delay = 0, left = 50 }: { delay?: number; left?: number }) => {
  const translateY = useSharedValue(0);
  const translateX = useSharedValue(0);
  const opacity = useSharedValue(0);
  const scale = useSharedValue(0.5);

  useEffect(() => {
    // Vertical movement
    translateY.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(-SCREEN_HEIGHT * 0.8, {
            duration: 8000 + Math.random() * 4000,
            easing: Easing.linear,
          }),
          withTiming(0, { duration: 0 })
        ),
        -1
      )
    );
    // Horizontal sway
    translateX.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(30, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
          withTiming(-30, { duration: 2000, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        true
      )
    );
    // Fade in/out
    opacity.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(0.8, { duration: 1000 }),
          withTiming(0.4, { duration: 6000 }),
          withTiming(0, { duration: 1000 })
        ),
        -1
      )
    );
    // Scale pulse
    scale.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
          withTiming(0.6, { duration: 2000, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        true
      )
    );
  }, []);

  const particleStyle = useAnimatedStyle(() => ({
    position: 'absolute',
    bottom: -20,
    left: `${left}%`,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: PREMIUM_COLORS.fireOrange,
    opacity: opacity.value,
    transform: [
      { translateY: translateY.value },
      { translateX: translateX.value },
      { scale: scale.value },
    ],
    shadowColor: PREMIUM_COLORS.fireOrange,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 8,
  }));

  return <Animated.View style={particleStyle} />;
};

// ============================================================================
// PREMIUM GLOW ORB (Ambient Light Effect)
// ============================================================================
const GlowOrb = ({
  color = PREMIUM_COLORS.fireRed,
  size = 400,
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
  const opacity = useSharedValue(0.3);

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
          withTiming(0.5, { duration: 3000, easing: Easing.inOut(Easing.ease) }),
          withTiming(0.2, { duration: 3000, easing: Easing.inOut(Easing.ease) })
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
// PREMIUM FEATURE CARD WITH GLOW BORDER
// ============================================================================
const PremiumFeatureCard = ({
  icon: Icon,
  title,
  description,
  delay = 0,
  index = 0,
}: {
  icon: any;
  title: string;
  description: string;
  delay?: number;
  index?: number;
}) => {
  const borderOpacity = useSharedValue(0.1);
  const isMobile = SCREEN_WIDTH < 640;

  useEffect(() => {
    // Subtle border animation
    borderOpacity.value = withDelay(
      delay + index * 100,
      withRepeat(
        withSequence(
          withTiming(0.3, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
          withTiming(0.1, { duration: 2000, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        true
      )
    );
  }, []);

  const cardStyle = useAnimatedStyle(() => ({
    borderColor: `rgba(220, 38, 38, ${borderOpacity.value})`,
  }));

  return (
    <Animated.View
      entering={FadeInUp.delay(delay).duration(700).springify()}
      style={{
        width: isMobile ? '100%' : undefined,
        flex: isMobile ? undefined : 1,
        minWidth: isMobile ? undefined : 280,
        maxWidth: isMobile ? '100%' : 380,
      }}
    >
      <Animated.View
        style={cardStyle}
        className="bg-zinc-900/30 backdrop-blur-xl rounded-3xl p-5 border-2 relative overflow-hidden"
      >
        {/* Inner glow effect */}
        <LinearGradient
          colors={['rgba(220, 38, 38, 0.1)', 'transparent', 'transparent']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            borderRadius: 24,
          }}
        />

        {/* Icon with glow */}
        <View className="relative mb-5">
          <LinearGradient
            colors={[PREMIUM_COLORS.fireRed, PREMIUM_COLORS.fireOrange]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            className="w-14 h-14 rounded-2xl items-center justify-center"
            style={{
              shadowColor: PREMIUM_COLORS.fireRed,
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.5,
              shadowRadius: 12,
              elevation: 8,
            }}
          >
            <Icon size={28} color="white" strokeWidth={2} />
          </LinearGradient>
        </View>

        <Text className="text-white font-bold text-xl mb-3 tracking-tight">{title}</Text>
        <Text className="text-zinc-400 text-base leading-relaxed">{description}</Text>
      </Animated.View>
    </Animated.View>
  );
};

// ============================================================================
// PRICING FEATURE ROW WITH ANIMATION
// ============================================================================
const PricingFeature = ({ text, delay = 0 }: { text: string; delay?: number }) => (
  <Animated.View
    entering={FadeInLeft.delay(delay).duration(500)}
    className="flex-row items-center gap-3 py-3"
  >
    <LinearGradient
      colors={[PREMIUM_COLORS.fireRed, PREMIUM_COLORS.fireOrange]}
      className="w-6 h-6 rounded-full items-center justify-center"
      style={{
        shadowColor: PREMIUM_COLORS.fireRed,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.5,
        shadowRadius: 6,
      }}
    >
      <Check size={14} color="white" strokeWidth={3} />
    </LinearGradient>
    <Text className="text-white text-base flex-1 font-medium">{text}</Text>
  </Animated.View>
);

// ============================================================================
// ANIMATED LOGO COMPONENT
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
      withSequence(withTiming(0.8, { duration: 2000 }), withTiming(0.4, { duration: 2000 })),
      -1,
      true
    );
  }, []);

  const glowStyle = useAnimatedStyle(() => ({
    position: 'absolute',
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: PREMIUM_COLORS.fireRed,
    opacity: glowOpacity.value,
    transform: [{ scale: glowScale.value }],
  }));

  return (
    <View className="items-center justify-center relative">
      {/* Outer glow */}
      <Animated.View style={glowStyle} className="blur-2xl" />

      {/* Main logo container */}
      <LinearGradient
        colors={[PREMIUM_COLORS.fireRed, '#B91C1C']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        className="w-28 h-28 rounded-[28px] items-center justify-center z-10"
        style={{
          shadowColor: PREMIUM_COLORS.fireRed,
          shadowOffset: { width: 0, height: 12 },
          shadowOpacity: 0.6,
          shadowRadius: 24,
          elevation: 20,
        }}
      >
        <Dumbbell size={56} color="white" strokeWidth={2} />
      </LinearGradient>
    </View>
  );
};

// ============================================================================
// STAT COUNTER COMPONENT
// ============================================================================
const StatCounter = ({
  value,
  label,
  suffix = '',
  delay = 0,
}: {
  value: string;
  label: string;
  suffix?: string;
  delay?: number;
}) => (
  <Animated.View
    entering={ZoomIn.delay(delay).duration(600).springify()}
    className="items-center px-6"
  >
    <Text className="text-white text-4xl md:text-5xl font-bold">
      {value}
      <Text className="text-red-500">{suffix}</Text>
    </Text>
    <Text className="text-zinc-500 text-sm uppercase tracking-widest mt-2">{label}</Text>
  </Animated.View>
);

// ============================================================================
// TESTIMONIAL CARD
// ============================================================================
const TestimonialCard = ({
  name,
  role,
  text,
  delay = 0,
}: {
  name: string;
  role: string;
  text: string;
  delay?: number;
}) => {
  const cardWidth = SCREEN_WIDTH < 640 ? SCREEN_WIDTH - 64 : 280;

  return (
    <Animated.View
      entering={FadeInUp.delay(delay).duration(700)}
      className="bg-zinc-900/40 backdrop-blur-xl border border-zinc-800/50 rounded-2xl p-4"
      style={{ width: cardWidth, minWidth: cardWidth, maxWidth: cardWidth }}
    >
      <View className="flex-row items-center mb-2">
        {[1, 2, 3, 4, 5].map((i) => (
          <Star
            key={i}
            size={12}
            color={PREMIUM_COLORS.fireYellow}
            fill={PREMIUM_COLORS.fireYellow}
          />
        ))}
      </View>
      <Text className="text-zinc-300 leading-relaxed mb-3 italic" style={{ fontSize: 13 }}>
        "{text}"
      </Text>
      <View className="flex-row items-center gap-2">
        <LinearGradient
          colors={[PREMIUM_COLORS.fireRed, PREMIUM_COLORS.fireOrange]}
          className="w-8 h-8 rounded-full items-center justify-center"
        >
          <User size={16} color="white" />
        </LinearGradient>
        <View>
          <Text className="text-white font-bold" style={{ fontSize: 13 }}>
            {name}
          </Text>
          <Text className="text-zinc-500" style={{ fontSize: 11 }}>
            {role}
          </Text>
        </View>
      </View>
    </Animated.View>
  );
};

// ============================================================================
// MAIN LANDING COMPONENT - PREMIUM VERSION
// ============================================================================
export default function LandingPage() {
  const scrollRef = useRef<ScrollView>(null);

  // Form state
  const [step, setStep] = useState<'info' | 'payment'>('info');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // User info
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [phoneCountry, setPhoneCountry] = useState<Country>(getDefaultCountry());
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Card info
  const [cardNumber, setCardNumber] = useState('');
  const [cardName, setCardName] = useState('');
  const [expiry, setExpiry] = useState('');
  const [cvv, setCvv] = useState('');

  // Animations
  const pulseAnim = useSharedValue(1);
  const floatAnim = useSharedValue(0);
  const shimmerPosition = useSharedValue(0);

  useEffect(() => {
    // Pulse effect for CTA
    pulseAnim.value = withRepeat(
      withSequence(
        withTiming(1.05, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 1500, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );
    // Float effect
    floatAnim.value = withRepeat(
      withSequence(
        withTiming(-10, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
        withTiming(10, { duration: 2000, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );
    // Shimmer effect
    shimmerPosition.value = withRepeat(
      withTiming(1, { duration: 2000, easing: Easing.linear }),
      -1
    );
  }, []);

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseAnim.value }],
  }));

  const floatStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: floatAnim.value }],
  }));

  // Scroll to pricing section
  const scrollToPricing = () => {
    if (Platform.OS === 'web') {
      const element = document.getElementById('pricing-section');
      element?.scrollIntoView({ behavior: 'smooth' });
    }
  };

  // Validate user info step
  const validateUserInfo = (): boolean => {
    if (!name.trim()) {
      setError('Ingresa tu nombre completo');
      return false;
    }
    if (!email.trim() || !email.includes('@')) {
      setError('Ingresa un email válido');
      return false;
    }
    if (!phone.trim() || phone.length < 9) {
      setError('Ingresa un número de celular válido');
      return false;
    }
    if (!password || password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres');
      return false;
    }
    return true;
  };

  // Go to payment step
  const goToPayment = () => {
    if (validateUserInfo()) {
      setError(null);
      setStep('payment');
      setCardName(name.toUpperCase());
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  };

  // Handle card number formatting
  const handleCardNumberChange = (value: string) => {
    setCardNumber(formatCardNumber(value));
  };

  // Handle expiry formatting
  const handleExpiryChange = (value: string) => {
    const cleaned = value.replace(/\D/g, '');
    if (cleaned.length <= 4) {
      setExpiry(formatExpiry(cleaned));
    }
  };

  // Process subscription
  const handleSubscribe = async () => {
    setLoading(true);
    setError(null);

    try {
      // Validate card
      if (!validateCardNumber(cardNumber)) {
        throw new Error('Número de tarjeta inválido');
      }

      const [expMonth, expYear] = expiry.split('/');
      if (!expMonth || !expYear) {
        throw new Error('Fecha de expiración inválida');
      }

      if (!cvv || cvv.length < 3) {
        throw new Error('CVV inválido');
      }

      // 1. Create user in Supabase
      const fullPhoneNumber = getFullPhoneNumber(phoneCountry, phone);
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
        options: {
          data: {
            full_name: name,
            display_name: name,
            phone: fullPhoneNumber,
          },
        },
      });

      if (authError) {
        if (authError.message.includes('already registered')) {
          throw new Error('Este email ya está registrado. Intenta iniciar sesión.');
        }
        throw authError;
      }

      if (!authData.user) {
        throw new Error('Error al crear usuario');
      }

      // 2. Tokenize card (client-side con llave pública)
      const token = await openpay.createCardToken({
        card_number: cardNumber.replace(/\s/g, ''),
        holder_name: cardName.toUpperCase(),
        expiration_month: expMonth.padStart(2, '0'),
        expiration_year: expYear.length === 4 ? expYear.slice(-2) : expYear,
        cvv2: cvv,
      });

      // 3. Create customer + subscription + save card via Edge Function
      const result = await openpay.createSubscription({
        tokenId: token.id,
        customer: {
          name: name.trim(),
          email: email.trim().toLowerCase(),
          phone_number: fullPhoneNumber,
        },
        userId: authData.user.id,
        saveCard: true, // Guardar tarjeta para futuros cobros
      });

      if (!result.success) {
        throw new Error(result.error || 'Error al procesar suscripción');
      }

      // 4. Create/update user profile + sync profiles table
      await Promise.all([
        supabase.from('user_profiles').upsert(
          {
            user_id: authData.user.id,
            display_name: name,
          },
          { onConflict: 'user_id' }
        ),
        supabase.from('profiles').update({ full_name: name }).eq('id', authData.user.id),
      ]);

      // 5. Success!
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      if (Platform.OS === 'web') {
        window.location.href = '/pago-exitoso';
      }
    } catch (err: any) {
      console.error('Subscription error:', err);
      setError(err.message || 'Error al procesar el pago');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setLoading(false);
    }
  };

  const planDetails = getPlanDetails();

  return (
    <ScrollView
      ref={scrollRef}
      className="flex-1 bg-black"
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingBottom: 100 }}
    >
      {/* ================================================================== */}
      {/* HERO SECTION - PREMIUM */}
      {/* ================================================================== */}
      <View className="min-h-screen justify-center items-center px-6 py-24 relative overflow-hidden">
        {/* Animated Background Orbs */}
        <GlowOrb color={PREMIUM_COLORS.fireRed} size={600} top="10%" left="30%" delay={0} />
        <GlowOrb color={PREMIUM_COLORS.fireOrange} size={400} top="60%" left="70%" delay={1000} />
        <GlowOrb color="#B91C1C" size={300} top="80%" left="20%" delay={2000} />

        {/* Floating Particles */}
        {[...Array(20)].map((_, i) => (
          <FloatingParticle key={i} delay={i * 400} left={5 + i * 4.5} />
        ))}

        {/* Main gradient overlay */}
        <LinearGradient
          colors={['rgba(220, 38, 38, 0.15)', 'transparent', 'rgba(0, 0, 0, 0.8)']}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
          }}
        />

        {/* Grid Pattern Overlay */}
        <View
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            opacity: 0.03,
            ...(Platform.OS === 'web' &&
              ({
                backgroundImage:
                  'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)',
                backgroundSize: '50px 50px',
              } as any)),
          }}
        />

        {/* Logo with Animation */}
        <Animated.View
          entering={ZoomIn.duration(1000).springify()}
          style={floatStyle}
          className="mb-10"
        >
          <AnimatedLogo />
        </Animated.View>

        {/* Brand Name */}
        <Animated.View entering={FadeInDown.delay(300).duration(800)} className="items-center mb-4">
          <Text
            className="text-white text-6xl md:text-7xl font-bold tracking-tight"
            style={{
              textShadowColor: PREMIUM_COLORS.fireRed,
              textShadowOffset: { width: 0, height: 4 },
              textShadowRadius: 20,
            }}
          >
            TRENS
          </Text>
        </Animated.View>

        {/* Tagline */}
        <Animated.View entering={FadeInDown.delay(500).duration(800)} className="items-center mb-6">
          <LinearGradient
            colors={[PREMIUM_COLORS.fireRed, PREMIUM_COLORS.fireOrange, PREMIUM_COLORS.fireYellow]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            className="px-6 py-2 rounded-full"
          >
            <Text className="text-white font-mono text-sm tracking-[0.3em] uppercase">
              High Performance Fitness
            </Text>
          </LinearGradient>
        </Animated.View>

        {/* Main Headline */}
        <Animated.View
          entering={FadeInDown.delay(700).duration(800)}
          className="items-center mb-8 max-w-3xl"
        >
          <Text className="text-white text-3xl md:text-5xl font-bold text-center leading-tight">
            Tu entrenador, nutricionista y cámara{' '}
            <Text style={{ color: PREMIUM_COLORS.fireRed }}>en una sola app</Text>
          </Text>
          <Text className="text-zinc-400 text-lg md:text-xl text-center mt-6 max-w-2xl leading-relaxed">
            HANK, tu IA con +90 herramientas, crea tu rutina, calcula tus macros, analiza tu técnica
            en video, trackea récords automáticos y sincroniza tu música — todo mientras entrenas.
            Para GYM, Motociclismo, Automovilismo y Surf.
          </Text>
        </Animated.View>

        {/* CTA Button with Glow */}
        <Animated.View entering={FadeInUp.delay(900).duration(800)} style={pulseStyle}>
          <TouchableOpacity onPress={scrollToPricing} activeOpacity={0.9} className="relative">
            {/* Button glow */}
            <View
              style={{
                position: 'absolute',
                top: -10,
                left: -10,
                right: -10,
                bottom: -10,
                borderRadius: 28,
                backgroundColor: PREMIUM_COLORS.fireRed,
                opacity: 0.3,
              }}
              className="blur-xl"
            />
            <LinearGradient
              colors={[PREMIUM_COLORS.fireRed, '#B91C1C']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              className="px-12 py-5 rounded-2xl flex-row items-center gap-4"
              style={{
                shadowColor: PREMIUM_COLORS.fireRed,
                shadowOffset: { width: 0, height: 8 },
                shadowOpacity: 0.6,
                shadowRadius: 20,
                elevation: 15,
              }}
            >
              <Flame size={26} color="white" fill="white" />
              <Text className="text-white text-xl font-bold tracking-wide">EMPIEZA AHORA</Text>
              <ArrowRight size={24} color="white" />
            </LinearGradient>
          </TouchableOpacity>
        </Animated.View>

        {/* Price Badge */}
        <Animated.View entering={FadeInUp.delay(1100).duration(800)} className="mt-8">
          <View className="flex-row items-center gap-2 bg-zinc-900/60 backdrop-blur-xl border border-zinc-800 px-6 py-3 rounded-full">
            <Crown size={18} color={PREMIUM_COLORS.fireYellow} />
            <Text className="text-zinc-400">
              Solo <Text className="text-red-500 font-bold text-lg">{getFormattedPrice()}</Text>
              <Text className="text-zinc-500"> / mes</Text>
            </Text>
          </View>
        </Animated.View>

        {/* Scroll Indicator */}
        <Animated.View entering={FadeInUp.delay(1300).duration(800)} className="absolute bottom-10">
          <View className="items-center">
            <Text className="text-zinc-600 text-xs uppercase tracking-widest mb-2">
              Descubre más
            </Text>
            <Animated.View
              style={{
                ...floatStyle,
              }}
            >
              <ChevronRight
                size={24}
                color="#52525B"
                style={{ transform: [{ rotate: '90deg' }] }}
              />
            </Animated.View>
          </View>
        </Animated.View>
      </View>

      {/* ================================================================== */}
      {/* STATS SECTION */}
      {/* ================================================================== */}
      <View className="px-6 py-16 bg-zinc-950/50">
        <View
          className="flex-row flex-wrap justify-center items-center gap-8 md:gap-16"
          style={{ maxWidth: 1000, alignSelf: 'center' }}
        >
          <StatCounter value="10K" suffix="+" label="Atletas Activos" delay={100} />
          <View className="w-px h-12 bg-zinc-800 hidden md:flex" />
          <StatCounter value="500K" suffix="+" label="Sets Grabados" delay={200} />
          <View className="w-px h-12 bg-zinc-800 hidden md:flex" />
          <StatCounter value="98" suffix="%" label="Satisfacción" delay={300} />
        </View>
      </View>

      {/* ================================================================== */}
      {/* FEATURES SECTION - PREMIUM */}
      {/* ================================================================== */}

      {/* ================================================================== */}
      {/* EL PROBLEMA — VALUE COMPARISON */}
      {/* ================================================================== */}
      <View
        className="bg-black relative overflow-hidden"
        style={{ paddingHorizontal: 16, paddingVertical: SCREEN_WIDTH < 768 ? 48 : 80 }}
      >
        <GlowOrb color="#991B1B" size={400} top="50%" left="50%" delay={0} />

        <Animated.View entering={FadeInUp.duration(600)} className="items-center mb-10">
          <Text
            className="text-red-500 font-mono tracking-[0.3em] uppercase mb-4"
            style={{ fontSize: SCREEN_WIDTH < 640 ? 11 : 14 }}
          >
            ¿Cuánto gastas cada mes?
          </Text>
          <Text
            className="text-white font-bold text-center max-w-2xl px-2"
            style={{ fontSize: SCREEN_WIDTH < 640 ? 22 : SCREEN_WIDTH < 768 ? 32 : 40 }}
          >
            Todo lo que necesitas,{' '}
            <Text style={{ color: PREMIUM_COLORS.fireRed }}>por una fracción del costo</Text>
          </Text>
        </Animated.View>

        <View
          className="items-center"
          style={{ maxWidth: 700, alignSelf: 'center', width: '100%' }}
        >
          {/* Cost comparison rows */}
          {[
            { label: 'Entrenador Personal', price: 'S/ 300 - 500', emoji: '🏋️' },
            { label: 'Nutricionista', price: 'S/ 150 - 300', emoji: '🥗' },
            { label: 'Apps de fitness (varias)', price: 'S/ 30 - 60', emoji: '📱' },
            { label: 'App de grabación/edición', price: 'S/ 20 - 40', emoji: '🎬' },
            { label: 'Rastreo de suplementos', price: 'S/ 15 - 30', emoji: '💊' },
          ].map((item, i) => (
            <Animated.View
              key={i}
              entering={FadeInLeft.delay(200 + i * 100).duration(500)}
              className="flex-row items-center justify-between w-full py-4 border-b border-zinc-800/50"
            >
              <View className="flex-row items-center gap-3">
                <Text style={{ fontSize: 20 }}>{item.emoji}</Text>
                <Text className="text-zinc-300 text-base">{item.label}</Text>
              </View>
              <Text className="text-zinc-500 text-base line-through font-mono">{item.price}</Text>
            </Animated.View>
          ))}

          {/* Total comparison */}
          <Animated.View
            entering={FadeInUp.delay(800).duration(600)}
            className="w-full mt-6 p-6 rounded-2xl border-2 border-red-600/30 bg-red-950/20"
          >
            <View className="flex-row items-center justify-between">
              <View className="flex-row items-center gap-3">
                <Flame size={24} color={PREMIUM_COLORS.fireRed} fill={PREMIUM_COLORS.fireRed} />
                <View>
                  <Text className="text-white text-lg font-bold">TRENS PRO</Text>
                  <Text className="text-zinc-400 text-sm">Todo incluido en una sola app</Text>
                </View>
              </View>
              <View className="items-end">
                <Text
                  className="text-white text-2xl font-bold"
                  style={{
                    textShadowColor: PREMIUM_COLORS.glowRed,
                    textShadowOffset: { width: 0, height: 2 },
                    textShadowRadius: 12,
                  }}
                >
                  S/ 59.90
                </Text>
                <Text className="text-zinc-500 text-xs">/ mes</Text>
              </View>
            </View>
          </Animated.View>

          <Animated.View entering={FadeInUp.delay(1000).duration(600)} className="mt-4">
            <Text className="text-zinc-500 text-center text-sm">
              Ahorra hasta <Text className="text-red-500 font-bold">S/ 870</Text> al mes frente a
              contratar todo por separado
            </Text>
          </Animated.View>
        </View>
      </View>

      {/* ================================================================== */}
      {/* FEATURES GRID - PREMIUM */}
      {/* ================================================================== */}
      <View
        className="bg-black relative overflow-hidden"
        style={{ paddingHorizontal: 16, paddingVertical: SCREEN_WIDTH < 768 ? 48 : 96 }}
      >
        {/* Background Elements */}
        <GlowOrb color={PREMIUM_COLORS.fireRed} size={400} top="20%" left="10%" delay={500} />
        <GlowOrb color={PREMIUM_COLORS.fireOrange} size={300} top="70%" left="80%" delay={1500} />

        <Animated.View
          entering={FadeInUp.duration(600)}
          className="items-center"
          style={{ marginBottom: SCREEN_WIDTH < 768 ? 32 : 64 }}
        >
          <View className="flex-row items-center gap-3 mb-4">
            <Sparkles size={20} color={PREMIUM_COLORS.fireRed} />
            <Text
              className="text-red-500 font-mono tracking-[0.3em] uppercase"
              style={{ fontSize: SCREEN_WIDTH < 640 ? 11 : 14 }}
            >
              Características
            </Text>
            <Sparkles size={20} color={PREMIUM_COLORS.fireRed} />
          </View>
          <Text
            className="text-white font-bold text-center max-w-2xl leading-tight px-2"
            style={{ fontSize: SCREEN_WIDTH < 640 ? 22 : SCREEN_WIDTH < 768 ? 32 : 40 }}
          >
            Todo lo que necesitas para{' '}
            <Text style={{ color: PREMIUM_COLORS.fireRed }}>dominar</Text> tu entrenamiento
          </Text>
        </Animated.View>

        <View
          className="flex-row flex-wrap justify-center items-stretch"
          style={{ maxWidth: 1300, alignSelf: 'center', gap: 12, paddingHorizontal: 4 }}
        >
          <PremiumFeatureCard
            icon={Brain}
            title="HANK — IA Entrenador"
            description='Díle "Crea una rutina Push Pull Legs" o "Calcula mis macros" y HANK lo hace instantáneamente. +90 herramientas powered by Gemini: arma rutinas, ajusta nutrición, analiza tu técnica en video, sugiere ejercicios alternativos y responde cualquier duda — por texto o voz.'
            delay={100}
            index={0}
          />
          <PremiumFeatureCard
            icon={Camera}
            title="Cámara PRO 9:16"
            description="Graba cada set en formato vertical profesional como TikTok. Flash, cámara frontal/trasera, compresión inteligente. Cada video queda vinculado al ejercicio, peso y repeticiones exactas. HANK puede analizar tu técnica y darte feedback."
            delay={150}
            index={1}
          />
          <PremiumFeatureCard
            icon={Dna}
            title="ADN Atlético"
            description="Tu perfil de atleta con TrensID Card compartible, medidas corporales (peso, grasa, masa muscular), récords personales auto-detectados, macros objetivo, fotos de progreso con comparativas, badges y stats de volumen semanal. Tu historial completo."
            delay={200}
            index={2}
          />
          <PremiumFeatureCard
            icon={Dumbbell}
            title="Rutinas GYM"
            description="Constructor de rutinas con +500 ejercicios, días rotacionales automáticos, 4 tipos de series (calentamiento, aproximación, efectiva, fallo). Configura peso, reps, RIR, tempo y descanso. Agrega fotos/videos por ejercicio. Drag & drop para reorganizar."
            delay={250}
            index={3}
          />
          <PremiumFeatureCard
            icon={Utensils}
            title="Plan Nutricional IA"
            description="Planifica cada comida por horario con ingredientes detallados. La IA Gemini calcula calorías, proteína, carbs y grasa automáticamente. Múltiples opciones por comida, sugerencias de sustitución, detección de alérgenos y ajuste dinámico según tus objetivos."
            delay={300}
            index={4}
          />
          <PremiumFeatureCard
            icon={Pill}
            title="Stack de Suplementos"
            description="Gestiona tu suplementación completa con horarios múltiples y dosis específicas: pastillas, polvo, líquido, inyectables. Pre/intra/post workout integrado en tu timeline. HANK puede sugerirte el stack ideal para tu objetivo."
            delay={350}
            index={5}
          />
          <PremiumFeatureCard
            icon={Trophy}
            title="Récords Automáticos"
            description="TRENS detecta automáticamente cuando superas tu mejor marca: PR dominante, peso máximo, 1RM estimado y máx reps. Cada récord queda registrado con video, fecha y datos exactos. Ve tu historial de progreso por ejercicio."
            delay={400}
            index={6}
          />
          <PremiumFeatureCard
            icon={Music}
            title="Spotify Sync"
            description="Conecta tu Spotify Premium y la canción que suena durante tu set se sincroniza automáticamente con tu video: nombre del track, artista, carátula y posición exacta. Control de reproducción integrado."
            delay={450}
            index={7}
          />
          <PremiumFeatureCard
            icon={Video}
            title="Feed Social"
            description="Publica tus mejores sets en el feed de la comunidad TRENS. Likes, comentarios, saves y shares con deep links. Filtra por ejercicio, ve lo que entrenan otros atletas e importa contenido desde Instagram Reels."
            delay={500}
            index={8}
          />
          <PremiumFeatureCard
            icon={TrendingUp}
            title="Progreso Visual"
            description="Sube fotos de progreso y compáralas en timeline con slider lado a lado. HANK analiza tu composición corporal por foto. Ve tu transformación mes a mes con datos de peso, grasa corporal y masa muscular."
            delay={550}
            index={9}
          />
          <PremiumFeatureCard
            icon={ShoppingCart}
            title="Lista de Compras"
            description="Se genera automáticamente desde tus comidas planificadas. Agrega todos los ingredientes de la semana, agrupa por categoría y lleva al super exactamente lo que necesitas. Sin desperdiciar, sin olvidar nada."
            delay={600}
            index={10}
          />
          <PremiumFeatureCard
            icon={BarChart3}
            title="Macros Inteligentes"
            description="Calorías, proteína, carbs y grasa calculados automáticamente según tu peso, altura, edad, nivel de actividad y objetivo (volumen, definición, mantenimiento). Se ajustan en tiempo real cuando modificas tu plan de comidas."
            delay={650}
            index={11}
          />
          <PremiumFeatureCard
            icon={Instagram}
            title="Instagram Connect"
            description="Vincula tu Instagram para importar Reels al feed de TRENS, cross-postear tus videos de entrenamiento, y mostrar tu perfil social directamente en tu TrensID Card pública. Hashtags automáticos."
            delay={700}
            index={12}
          />
          <PremiumFeatureCard
            icon={BellRing}
            title="Notificaciones Smart"
            description="Recordatorios automáticos de entrenamiento, alertas de suplementos programadas a la hora exacta, avisos de comidas y notificaciones de actividad social. 100% personalizables, nunca spam."
            delay={750}
            index={13}
          />
          <PremiumFeatureCard
            icon={Mic}
            title="Comandos de Voz"
            description='Manos en la barra, voz en HANK. Di "agrega 10kg al press" o "pon un snack a las 4pm" y HANK ejecuta el cambio en tiempo real. Ideal para medio entrenamiento sin tocar el celular.'
            delay={800}
            index={14}
          />
          <PremiumFeatureCard
            icon={Layers}
            title="Multi-Deporte"
            description="Más allá del GYM: MOTO y AUTO tienen Garaje (inventario de vehículos, mantenimiento, costos) y Race (eventos, tiempos, checklists). SURF tiene Tabla (quiver de tablas y equipo) y Spot (sesiones con olas, viento, marea)."
            delay={850}
            index={15}
          />
        </View>

        {/* ================================================================== */}
        {/* MULTI-SPORT SECTION */}
        {/* ================================================================== */}
        <View
          className="mt-16 items-center"
          style={{ maxWidth: 1000, alignSelf: 'center', width: '100%' }}
        >
          <Animated.View entering={FadeInUp.delay(900).duration(600)} className="items-center mb-8">
            <Text
              className="text-white font-bold text-center px-2"
              style={{ fontSize: SCREEN_WIDTH < 640 ? 20 : 28 }}
            >
              Una app, <Text style={{ color: PREMIUM_COLORS.fireOrange }}>4 deportes</Text>
            </Text>
            <Text className="text-zinc-400 text-center mt-3 max-w-lg px-4">
              TRENS se adapta a tu deporte. Cada disciplina tiene módulos exclusivos.
            </Text>
          </Animated.View>

          <View
            className="flex-row flex-wrap justify-center gap-3"
            style={{ paddingHorizontal: 8 }}
          >
            {[
              {
                icon: Dumbbell,
                name: 'FITNESS',
                color: '#DC2626',
                desc: 'GYM + PLAN + SUPLEMENTOS',
              },
              {
                icon: Warehouse,
                name: 'MOTO',
                color: '#F97316',
                desc: 'GARAJE + RACE + CHECKLISTS',
              },
              { icon: Flag, name: 'AUTO', color: '#EAB308', desc: 'GARAJE + RACE + TIEMPOS' },
              { icon: Waves, name: 'SURF', color: '#0EA5E9', desc: 'TABLA + SPOT + SESIONES' },
            ].map((sport, i) => (
              <Animated.View
                key={sport.name}
                entering={FadeInUp.delay(1000 + i * 100).duration(500)}
                className="bg-zinc-900/50 border border-zinc-800/50 rounded-2xl p-4 items-center"
                style={{ width: SCREEN_WIDTH < 640 ? '45%' : 200 }}
              >
                <View
                  className="w-12 h-12 rounded-xl items-center justify-center mb-2"
                  style={{ backgroundColor: `${sport.color}20` }}
                >
                  <sport.icon size={24} color={sport.color} />
                </View>
                <Text className="text-white font-bold text-sm">{sport.name}</Text>
                <Text className="text-zinc-500 text-xs mt-1">{sport.desc}</Text>
              </Animated.View>
            ))}
          </View>
        </View>

        {/* ================================================================== */}
        {/* 5 MÓDULOS SECTION */}
        {/* ================================================================== */}
        <View
          className="mt-16 items-center"
          style={{ maxWidth: 1100, alignSelf: 'center', width: '100%' }}
        >
          <Animated.View
            entering={FadeInUp.delay(1100).duration(600)}
            className="items-center mb-8"
          >
            <Text
              className="text-white font-bold text-center px-2"
              style={{ fontSize: SCREEN_WIDTH < 640 ? 20 : 28 }}
            >
              5 módulos <Text style={{ color: PREMIUM_COLORS.fireRed }}>interconectados</Text>
            </Text>
          </Animated.View>

          <View className="flex-row flex-wrap justify-center gap-3 px-4">
            {[
              {
                icon: Play,
                name: 'FEED',
                desc: 'Tu red social de fitness. Videos de la comunidad, likes, comentarios, saves y shares con deep links. Importa Reels de Instagram.',
                color: '#DC2626',
              },
              {
                icon: Dna,
                name: 'ADN',
                desc: 'Tu perfil atlético completo. TrensID Card, medidas corporales, récords con video, fotos de progreso con comparativas, macros y badges.',
                color: '#F97316',
              },
              {
                icon: Camera,
                name: 'PRO',
                desc: 'Cámara profesional 9:16 con flash, frontal/trasera, Spotify sync, editor de video, publicación al feed e Instagram.',
                color: '#FBBF24',
              },
              {
                icon: Dumbbell,
                name: 'GYM',
                desc: 'Constructor de rutinas con +500 ejercicios, 4 tipos de series, RIR, tempo, drag & drop, alternativas IA y fotos/videos por ejercicio.',
                color: '#22C55E',
              },
              {
                icon: Utensils,
                name: 'PLAN',
                desc: 'Planificador de comidas por horario, macros automáticos IA, suplementación con dosis/horarios, cardio blocks y lista de compras.',
                color: '#0EA5E9',
              },
            ].map((mod, i) => (
              <Animated.View
                key={mod.name}
                entering={FadeInUp.delay(1200 + i * 100).duration(500)}
                className="bg-zinc-900/40 border border-zinc-800/40 rounded-2xl p-4"
                style={{ width: SCREEN_WIDTH < 640 ? '100%' : 200 }}
              >
                <View className="flex-row items-center gap-3 mb-2">
                  <View
                    className="w-10 h-10 rounded-xl items-center justify-center"
                    style={{ backgroundColor: `${mod.color}20` }}
                  >
                    <mod.icon size={20} color={mod.color} />
                  </View>
                  <Text className="text-white font-bold">{mod.name}</Text>
                </View>
                <Text className="text-zinc-400 text-xs leading-relaxed">{mod.desc}</Text>
              </Animated.View>
            ))}
          </View>
        </View>

        {/* ================================================================== */}
        {/* HANK AI SECTION */}
        {/* ================================================================== */}
        <View
          className="mt-16 items-center"
          style={{ maxWidth: 800, alignSelf: 'center', width: '100%' }}
        >
          <Animated.View entering={FadeInUp.delay(1400).duration(600)} className="items-center">
            <LinearGradient
              colors={[PREMIUM_COLORS.fireRed, PREMIUM_COLORS.fireOrange]}
              className="w-16 h-16 rounded-2xl items-center justify-center mb-4"
              style={{
                shadowColor: PREMIUM_COLORS.fireRed,
                shadowOffset: { width: 0, height: 6 },
                shadowOpacity: 0.4,
                shadowRadius: 12,
              }}
            >
              <Brain size={32} color="white" />
            </LinearGradient>
            <Text
              className="text-white font-bold text-center mb-3"
              style={{ fontSize: SCREEN_WIDTH < 640 ? 22 : 32 }}
            >
              Conoce a <Text style={{ color: PREMIUM_COLORS.fireRed }}>HANK</Text>
            </Text>
            <Text className="text-zinc-400 text-center max-w-lg px-4 mb-3 leading-relaxed">
              Tu entrenador de IA con más de 90 herramientas especializadas. Powered by Google
              Gemini. HANK entiende el contexto completo de tu entrenamiento: sabe qué día toca, qué
              ejercicio estás haciendo, y cuáles son tus macros objetivo.
            </Text>
            <Text className="text-zinc-500 text-center max-w-lg px-4 mb-6 text-sm leading-relaxed">
              Crea rutinas completas desde cero, diseña planes nutricionales personalizados, analiza
              tu técnica con fotos/videos, detecta alergias en ingredientes, sugiere sustituciones,
              calcula tu 1RM, gestiona suplementos, genera listas de compras — todo con lenguaje
              natural en español, por texto o voz.
            </Text>
            <View className="flex-row flex-wrap justify-center gap-2">
              {[
                '"Crea una rutina Push Pull Legs"',
                '"Analiza mi foto de progreso"',
                '"Agrega pollo 200g al almuerzo"',
                '"Cambia mi serie a 5x5 con 80kg"',
                '"Calcula mis macros para definición"',
                '"Sugiere un pre-workout con creatina"',
                '"Reemplaza sentadilla por prensa"',
                '"¿Cuánta proteína necesito al día?"',
                '"Arma un plan de comidas high protein"',
                '"Analiza la técnica de mi video"',
              ].map((cmd, i) => (
                <View
                  key={i}
                  className="bg-zinc-800/50 border border-zinc-700/30 rounded-full px-3 py-1.5"
                >
                  <Text className="text-zinc-300 text-xs font-mono">{cmd}</Text>
                </View>
              ))}
            </View>
          </Animated.View>
        </View>

        {/* ================================================================== */}
        {/* PLATFORM SECTION */}
        {/* ================================================================== */}
        <View
          className="mt-16 items-center"
          style={{ maxWidth: 800, alignSelf: 'center', width: '100%' }}
        >
          <Animated.View
            entering={FadeInUp.delay(1500).duration(600)}
            className="items-center mb-6"
          >
            <Text
              className="text-white font-bold text-center"
              style={{ fontSize: SCREEN_WIDTH < 640 ? 18 : 24 }}
            >
              Disponible en{' '}
              <Text style={{ color: PREMIUM_COLORS.fireRed }}>todas las plataformas</Text>
            </Text>
          </Animated.View>
          <View className="flex-row flex-wrap justify-center gap-4">
            {[
              { icon: Smartphone, name: 'iOS', sub: 'App Store' },
              { icon: Smartphone, name: 'Android', sub: 'Google Play' },
              { icon: Globe, name: 'Web', sub: 'trens.app (PWA)' },
            ].map((platform, i) => (
              <View
                key={i}
                className="bg-zinc-900/40 border border-zinc-800/40 rounded-xl px-5 py-3 flex-row items-center gap-3"
              >
                <platform.icon size={20} color={PREMIUM_COLORS.fireRed} />
                <View>
                  <Text className="text-white font-bold text-sm">{platform.name}</Text>
                  <Text className="text-zinc-500 text-xs">{platform.sub}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>
        {/* ================================================================== */}
        {/* HOW IT WORKS */}
        {/* ================================================================== */}
        <View
          className="mt-20 items-center"
          style={{ maxWidth: 1000, alignSelf: 'center', width: '100%' }}
        >
          <Animated.View
            entering={FadeInUp.delay(1600).duration(600)}
            className="items-center mb-10"
          >
            <Text
              className="text-red-500 font-mono tracking-[0.3em] uppercase mb-4"
              style={{ fontSize: SCREEN_WIDTH < 640 ? 11 : 14 }}
            >
              3 pasos
            </Text>
            <Text
              className="text-white font-bold text-center px-2"
              style={{ fontSize: SCREEN_WIDTH < 640 ? 22 : 32 }}
            >
              Empieza en <Text style={{ color: PREMIUM_COLORS.fireRed }}>menos de 2 minutos</Text>
            </Text>
          </Animated.View>

          <View
            className="flex-row flex-wrap justify-center gap-4"
            style={{ paddingHorizontal: 8 }}
          >
            {[
              {
                step: '01',
                title: 'Crea tu cuenta',
                desc: 'Registrate con email y tarjeta. Acceso inmediato a todos los módulos desde el primer segundo.',
                icon: User,
              },
              {
                step: '02',
                title: 'Configura tu perfil',
                desc: 'Ingresa tus medidas, objetivos y preferencias. HANK personaliza tu experiencia automáticamente.',
                icon: Dna,
              },
              {
                step: '03',
                title: 'Entrena y registra',
                desc: 'Pídele a HANK tu rutina, graba tus sets, trackea tu nutrición y ve tu progreso crecer día a día.',
                icon: Flame,
              },
            ].map((item, i) => (
              <Animated.View
                key={i}
                entering={FadeInUp.delay(1700 + i * 150).duration(500)}
                className="bg-zinc-900/40 border border-zinc-800/40 rounded-2xl p-6 items-center"
                style={{ width: SCREEN_WIDTH < 640 ? '100%' : 280 }}
              >
                <LinearGradient
                  colors={[PREMIUM_COLORS.fireRed, PREMIUM_COLORS.fireOrange]}
                  className="w-14 h-14 rounded-2xl items-center justify-center mb-4"
                >
                  <Text className="text-white text-xl font-bold font-mono">{item.step}</Text>
                </LinearGradient>
                <Text className="text-white font-bold text-lg mb-2">{item.title}</Text>
                <Text className="text-zinc-400 text-sm text-center leading-relaxed">
                  {item.desc}
                </Text>
              </Animated.View>
            ))}
          </View>
        </View>
      </View>

      {/* ================================================================== */}
      {/* TESTIMONIALS SECTION */}
      {/* ================================================================== */}
      <View
        className="bg-zinc-950 relative overflow-hidden"
        style={{ paddingHorizontal: 16, paddingVertical: SCREEN_WIDTH < 768 ? 48 : 96 }}
      >
        <Animated.View
          entering={FadeInUp.duration(600)}
          className="items-center"
          style={{ marginBottom: SCREEN_WIDTH < 768 ? 24 : 48 }}
        >
          <View className="flex-row items-center gap-3 mb-4">
            <Heart size={20} color={PREMIUM_COLORS.fireRed} fill={PREMIUM_COLORS.fireRed} />
            <Text
              className="text-red-500 font-mono tracking-[0.3em] uppercase"
              style={{ fontSize: SCREEN_WIDTH < 640 ? 11 : 14 }}
            >
              Testimonios
            </Text>
          </View>
          <Text
            className="text-white font-bold text-center px-2"
            style={{ fontSize: SCREEN_WIDTH < 640 ? 20 : SCREEN_WIDTH < 768 ? 28 : 40 }}
          >
            Lo que dicen nuestros atletas
          </Text>
        </Animated.View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }}
        >
          <TestimonialCard
            name="Carlos Mendoza"
            role="Powerlifter · Lima"
            text="HANK me armó una rutina de fuerza 5/3/1 en segundos. La cámara PRO me ayuda a revisar mi técnica en cada PR y la detección automática de récords me tiene motivado al máximo. Subí 15kg en mi sentadilla en 3 meses."
            delay={100}
          />
          <TestimonialCard
            name="María Fernández"
            role="Fitness Coach · Arequipa"
            text="El plan nutricional con macros automáticos me ahorró S/ 200 mensuales en nutricionista. Analizo la comida con una foto y HANK me calcula todo. La lista de compras automática es oro puro para mi prep."
            delay={200}
          />
          <TestimonialCard
            name="Diego Ramírez"
            role="Personal Trainer · Trujillo"
            text="Uso TRENS con 12 clientes. El módulo GYM con series configurables y el feed social los mantiene comprometidos. Los comandos de voz me permiten ajustar rutinas mientras entreno con ellos."
            delay={300}
          />
          <TestimonialCard
            name="Ana Torres"
            role="Bodybuilder · Cusco"
            text="Las fotos de progreso con comparativas timeline son un game-changer. Puedo ver mi transformación semana a semana con datos de grasa corporal. HANK me detectó 4 PRs que ni sabía que había roto."
            delay={400}
          />
          <TestimonialCard
            name="Sebastián Luna"
            role="Motociclista · Lima"
            text="No es solo para gym. Tengo mi KTM en el Garaje con todo su mantenimiento, trackeo mis carreras con tiempos por vuelta, y mi checklist de equipo. Todo en una app. Nadie más da esto."
            delay={500}
          />
          <TestimonialCard
            name="Luciana Vargas"
            role="CrossFit · Miraflores"
            text="La integración con Spotify es increíble. Cada video de mis sets tiene la canción que sonaba. Mis stories de Instagram nunca lucieron tan profesionales. Y HANK ajusta mis macros cuando cambio de fase."
            delay={600}
          />
        </ScrollView>
      </View>

      {/* ================================================================== */}
      {/* FAQ SECTION */}
      {/* ================================================================== */}
      <View
        className="bg-black"
        style={{ paddingHorizontal: 16, paddingVertical: SCREEN_WIDTH < 768 ? 48 : 80 }}
      >
        <Animated.View entering={FadeInUp.duration(600)} className="items-center mb-10">
          <Text
            className="text-red-500 font-mono tracking-[0.3em] uppercase mb-4"
            style={{ fontSize: SCREEN_WIDTH < 640 ? 11 : 14 }}
          >
            Preguntas Frecuentes
          </Text>
          <Text
            className="text-white font-bold text-center px-2"
            style={{ fontSize: SCREEN_WIDTH < 640 ? 22 : SCREEN_WIDTH < 768 ? 28 : 36 }}
          >
            Todo lo que necesitas saber
          </Text>
        </Animated.View>

        <View
          className="items-center"
          style={{ maxWidth: 700, alignSelf: 'center', width: '100%' }}
        >
          {[
            {
              q: '¿Puedo cancelar cuando quiera?',
              a: 'Sí. Sin penalidades, sin preguntas, sin letras chicas. Cancela desde tu perfil en cualquier momento y no se te cobra el siguiente mes.',
            },
            {
              q: '¿En qué dispositivos funciona TRENS?',
              a: 'iPhone (iOS 15+), Android (10+) y cualquier navegador moderno como PWA. Tu cuenta se sincroniza en todos tus dispositivos automáticamente.',
            },
            {
              q: '¿Necesito Spotify Premium para la sincronización musical?',
              a: 'Sí, para que HANK detecte la canción que suena durante tus sets necesitas Spotify Premium. Sin embargo, todas las demás funciones de TRENS funcionan sin Spotify.',
            },
            {
              q: '¿TRENS sirve para principiantes?',
              a: 'Absolutamente. HANK se adapta a tu nivel de experiencia. Puedes pedirle rutinas para principiantes, explicaciones de técnica, y planes nutricionales básicos. Crece contigo.',
            },
            {
              q: '¿Qué métodos de pago aceptan?',
              a: 'Visa, Mastercard y American Express. El pago se procesa de forma segura con Openpay (certificación PCI DSS). También aceptamos pagos nativos en App Store y Google Play.',
            },
            {
              q: '¿Puedo usar TRENS solo para nutrición, sin hacer gym?',
              a: 'Sí. El módulo PLAN funciona independientemente. Puedes usar HANK para planificar comidas, calcular macros, gestionar suplementos y generar listas de compras sin necesidad de usar el módulo GYM.',
            },
            {
              q: '¿Qué deportes están incluidos en la suscripción?',
              a: 'Los 4: GYM (fitness), Motociclismo, Automovilismo y Surf. Cada deporte tiene módulos dedicados exclusivos. Todo incluido en un solo precio.',
            },
            {
              q: '¿HANK (IA) funciona en español?',
              a: 'Sí. HANK entiende español e inglés perfectamente. Puedes escribirle o hablarle en cualquiera de los dos idiomas y responde en el idioma que prefieras.',
            },
          ].map((item, i) => (
            <Animated.View
              key={i}
              entering={FadeInUp.delay(100 + i * 80).duration(500)}
              className="w-full border-b border-zinc-800/50 py-5"
            >
              <Text className="text-white font-bold text-base mb-2">{item.q}</Text>
              <Text className="text-zinc-400 text-sm leading-relaxed">{item.a}</Text>
            </Animated.View>
          ))}
        </View>
      </View>

      {/* ================================================================== */}
      {/* PRICING SECTION - PREMIUM */}
      {/* ================================================================== */}
      <View id="pricing-section" className="px-6 py-24 bg-black relative overflow-hidden">
        {/* Background Effects */}
        <GlowOrb color={PREMIUM_COLORS.fireRed} size={500} top="50%" left="50%" delay={0} />

        <Animated.View
          entering={FadeInUp.duration(600)}
          className="items-center mb-16 relative z-10"
        >
          <View className="flex-row items-center gap-3 mb-4">
            <Crown size={20} color={PREMIUM_COLORS.fireYellow} />
            <Text className="text-red-500 font-mono text-sm tracking-[0.3em] uppercase">
              Suscripción
            </Text>
          </View>
          <Text className="text-white text-4xl md:text-5xl font-bold text-center">
            Un solo plan, <Text style={{ color: PREMIUM_COLORS.fireRed }}>todo incluido</Text>
          </Text>
          <Text className="text-zinc-400 text-center mt-4 max-w-lg">
            Sin niveles confusos. Sin features bloqueadas. Pagas una vez y tienes acceso completo a
            toda la plataforma, todos los deportes, y todas las actualizaciones futuras.
          </Text>
        </Animated.View>

        <View
          className="flex-row flex-wrap justify-center gap-8"
          style={{ maxWidth: 1100, alignSelf: 'center' }}
        >
          {/* Plan Card - Premium Design */}
          <Animated.View
            entering={SlideInLeft.delay(200).duration(800).springify()}
            className="flex-1 min-w-[340px] max-w-[420px]"
          >
            <View className="relative">
              {/* Glow effect behind card */}
              <View
                style={{
                  position: 'absolute',
                  top: -20,
                  left: -20,
                  right: -20,
                  bottom: -20,
                  borderRadius: 40,
                  backgroundColor: PREMIUM_COLORS.fireRed,
                  opacity: 0.15,
                }}
                className="blur-3xl"
              />

              <LinearGradient
                colors={['#1a0808', '#0d0d0d']}
                className="rounded-[32px] p-8 border-2 border-red-600/50 relative overflow-hidden"
              >
                {/* Premium badge */}
                <View className="absolute top-0 right-0">
                  <LinearGradient
                    colors={[PREMIUM_COLORS.fireRed, PREMIUM_COLORS.fireOrange]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    className="px-4 py-2 rounded-bl-2xl rounded-tr-[30px]"
                  >
                    <Text className="text-white text-xs font-bold tracking-widest">POPULAR</Text>
                  </LinearGradient>
                </View>

                {/* Inner gradient */}
                <LinearGradient
                  colors={['rgba(220, 38, 38, 0.1)', 'transparent']}
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

                <View className="flex-row items-center gap-3 mb-6">
                  <Flame size={28} color={PREMIUM_COLORS.fireRed} fill={PREMIUM_COLORS.fireRed} />
                  <Text className="text-white text-2xl font-bold">{planDetails.name}</Text>
                </View>

                <View className="flex-row items-baseline mb-2">
                  <Text className="text-zinc-500 text-xl line-through mr-3">S/ 99.90</Text>
                </View>

                <View className="flex-row items-baseline mb-8">
                  <Text
                    className="text-white text-6xl font-bold"
                    style={{
                      textShadowColor: PREMIUM_COLORS.glowRed,
                      textShadowOffset: { width: 0, height: 2 },
                      textShadowRadius: 20,
                    }}
                  >
                    S/ 59
                  </Text>
                  <Text className="text-white text-3xl font-bold">.90</Text>
                  <Text className="text-zinc-500 text-lg ml-2">/ mes</Text>
                </View>

                <View className="mb-8">
                  {planDetails.features.map((feature, index) => (
                    <PricingFeature key={index} text={feature} delay={300 + index * 100} />
                  ))}
                </View>

                <View className="bg-gradient-to-r from-red-900/30 to-orange-900/20 border border-red-600/20 rounded-2xl p-5">
                  <View className="flex-row items-center justify-center gap-2 mb-2">
                    <Shield size={18} color={PREMIUM_COLORS.fireRed} />
                    <Text className="text-white text-sm font-bold">
                      Pago 100% seguro con Openpay
                    </Text>
                  </View>
                  <Text className="text-zinc-400 text-xs text-center leading-relaxed">
                    Certificación PCI DSS • Encriptación SSL 256-bit
                  </Text>
                  <View className="h-px bg-zinc-800/50 my-3" />
                  <Text className="text-zinc-400 text-xs text-center">
                    ✓ Cancela cuando quieras, sin penalidad{'\n'}✓ Sin letras chicas ni cargos
                    ocultos{'\n'}✓ Acceso total desde el primer día{'\n'}✓ Actualizaciones incluidas
                    de por vida
                  </Text>
                </View>
              </LinearGradient>
            </View>
          </Animated.View>

          {/* Form Card - Premium Design */}
          <Animated.View
            entering={SlideInRight.delay(400).duration(800).springify()}
            className="flex-1 min-w-[340px] max-w-[480px]"
          >
            <View className="bg-zinc-900/40 backdrop-blur-2xl border border-zinc-800/50 rounded-[32px] p-8 relative overflow-hidden">
              {/* Subtle inner gradient */}
              <LinearGradient
                colors={['rgba(255, 255, 255, 0.02)', 'transparent']}
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

              <View className="flex-row items-center gap-3 mb-8">
                {step === 'info' ? (
                  <User size={24} color={PREMIUM_COLORS.fireRed} />
                ) : (
                  <CreditCard size={24} color={PREMIUM_COLORS.fireRed} />
                )}
                <Text className="text-white text-xl font-bold">
                  {step === 'info' ? 'Crea tu cuenta' : 'Datos de pago'}
                </Text>
              </View>

              {/* Step indicator */}
              <View className="flex-row items-center gap-2 mb-6">
                <View
                  className={`flex-1 h-1 rounded-full ${step === 'info' ? 'bg-red-600' : 'bg-zinc-700'}`}
                />
                <View
                  className={`flex-1 h-1 rounded-full ${step === 'payment' ? 'bg-red-600' : 'bg-zinc-700'}`}
                />
              </View>

              {error && (
                <Animated.View
                  entering={FadeInDown.duration(300)}
                  className="bg-red-900/30 border border-red-600/50 rounded-2xl p-4 mb-6"
                >
                  <Text className="text-red-400 text-sm text-center">{error}</Text>
                </Animated.View>
              )}

              {step === 'info' ? (
                <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                  <View data-form-type="registration">
                    {/* Name */}
                    <View className="mb-5">
                      <Text className="text-zinc-400 text-sm mb-2 font-medium">
                        Nombre completo
                      </Text>
                      <View className="flex-row items-center bg-zinc-800/50 backdrop-blur rounded-2xl px-4 border border-zinc-700/50">
                        <User size={20} color="#71717a" />
                        <TextInput
                          value={name}
                          onChangeText={setName}
                          placeholder="Juan Pérez"
                          placeholderTextColor="#52525b"
                          className="flex-1 text-white py-4 px-3 text-base"
                          autoCapitalize="words"
                          autoComplete="name"
                        />
                      </View>
                    </View>

                    {/* Email */}
                    <View className="mb-5">
                      <Text className="text-zinc-400 text-sm mb-2 font-medium">
                        Correo electrónico
                      </Text>
                      <View className="flex-row items-center bg-zinc-800/50 backdrop-blur rounded-2xl px-4 border border-zinc-700/50">
                        <Mail size={20} color="#71717a" />
                        <TextInput
                          value={email}
                          onChangeText={setEmail}
                          placeholder="tu@email.com"
                          placeholderTextColor="#52525b"
                          className="flex-1 text-white py-4 px-3 text-base"
                          keyboardType="email-address"
                          autoCapitalize="none"
                          autoComplete="email"
                        />
                      </View>
                    </View>

                    {/* Phone */}
                    <View className="mb-5">
                      <Text className="text-zinc-400 text-sm mb-2 font-medium">Celular</Text>
                      <PhoneInput
                        value={phone}
                        onChangeText={setPhone}
                        selectedCountry={phoneCountry}
                        onCountryChange={setPhoneCountry}
                        placeholder="999 999 999"
                        disabled={loading}
                      />
                    </View>

                    {/* Password */}
                    <View className="mb-8">
                      <Text className="text-zinc-400 text-sm mb-2 font-medium">Contraseña</Text>
                      <View className="flex-row items-center bg-zinc-800/50 backdrop-blur rounded-2xl px-4 border border-zinc-700/50">
                        <Lock size={20} color="#71717a" />
                        <TextInput
                          value={password}
                          onChangeText={setPassword}
                          placeholder="Mínimo 6 caracteres"
                          placeholderTextColor="#52525b"
                          className="flex-1 text-white py-4 px-3 text-base"
                          secureTextEntry={!showPassword}
                          autoComplete="new-password"
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
                  </View>

                  {/* Continue Button */}
                  <TouchableOpacity onPress={goToPayment} activeOpacity={0.9}>
                    <LinearGradient
                      colors={[PREMIUM_COLORS.fireRed, '#B91C1C']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      className="py-5 rounded-2xl flex-row items-center justify-center gap-3"
                      style={{
                        shadowColor: PREMIUM_COLORS.fireRed,
                        shadowOffset: { width: 0, height: 6 },
                        shadowOpacity: 0.4,
                        shadowRadius: 12,
                      }}
                    >
                      <Text className="text-white text-lg font-bold">Continuar</Text>
                      <ArrowRight size={22} color="white" />
                    </LinearGradient>
                  </TouchableOpacity>
                </KeyboardAvoidingView>
              ) : (
                <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                  <View data-form-type="payment">
                    {/* Card Number */}
                    <View className="mb-5">
                      <Text className="text-zinc-400 text-sm mb-2 font-medium">
                        Número de tarjeta
                      </Text>
                      <View className="flex-row items-center bg-zinc-800/50 backdrop-blur rounded-2xl px-4 border border-zinc-700/50">
                        <CreditCard size={20} color="#71717a" />
                        <TextInput
                          value={cardNumber}
                          onChangeText={handleCardNumberChange}
                          placeholder="4111 1111 1111 1111"
                          placeholderTextColor="#52525b"
                          className="flex-1 text-white py-4 px-3 font-mono text-base"
                          keyboardType="number-pad"
                          maxLength={19}
                          autoComplete="cc-number"
                        />
                        {cardNumber.length > 0 && (
                          <Text className="text-zinc-500 text-xs uppercase font-bold">
                            {getCardBrand(cardNumber)}
                          </Text>
                        )}
                      </View>
                    </View>

                    {/* Card Holder */}
                    <View className="mb-5">
                      <Text className="text-zinc-400 text-sm mb-2 font-medium">
                        Nombre en la tarjeta
                      </Text>
                      <View className="flex-row items-center bg-zinc-800/50 backdrop-blur rounded-2xl px-4 border border-zinc-700/50">
                        <User size={20} color="#71717a" />
                        <TextInput
                          value={cardName}
                          onChangeText={(v) => setCardName(v.toUpperCase())}
                          placeholder="JUAN PEREZ"
                          placeholderTextColor="#52525b"
                          className="flex-1 text-white py-4 px-3 text-base"
                          autoCapitalize="characters"
                          autoComplete="cc-name"
                        />
                      </View>
                    </View>

                    {/* Expiry + CVV */}
                    <View className="flex-row gap-4 mb-8">
                      <View className="flex-1">
                        <Text className="text-zinc-400 text-sm mb-2 font-medium">Vencimiento</Text>
                        <View className="flex-row items-center bg-zinc-800/50 backdrop-blur rounded-2xl px-4 border border-zinc-700/50">
                          <TextInput
                            value={expiry}
                            onChangeText={handleExpiryChange}
                            placeholder="MM/YY"
                            placeholderTextColor="#52525b"
                            className="flex-1 text-white py-4 font-mono text-center text-base"
                            keyboardType="number-pad"
                            maxLength={5}
                            autoComplete="cc-exp"
                          />
                        </View>
                      </View>
                      <View className="flex-1">
                        <Text className="text-zinc-400 text-sm mb-2 font-medium">CVV</Text>
                        <View className="flex-row items-center bg-zinc-800/50 backdrop-blur rounded-2xl px-4 border border-zinc-700/50">
                          <TextInput
                            value={cvv}
                            onChangeText={setCvv}
                            placeholder="123"
                            placeholderTextColor="#52525b"
                            className="flex-1 text-white py-4 font-mono text-center text-base"
                            keyboardType="number-pad"
                            maxLength={4}
                            secureTextEntry
                            autoComplete="cc-csc"
                          />
                        </View>
                      </View>
                    </View>
                  </View>

                  {/* Back Button */}
                  <TouchableOpacity
                    onPress={() => setStep('info')}
                    className="mb-4 py-2"
                    activeOpacity={0.7}
                  >
                    <Text className="text-zinc-400 text-center">← Volver a mis datos</Text>
                  </TouchableOpacity>

                  {/* Subscribe Button */}
                  <TouchableOpacity
                    onPress={handleSubscribe}
                    activeOpacity={0.9}
                    disabled={loading}
                  >
                    <LinearGradient
                      colors={
                        loading ? ['#3f3f46', '#27272a'] : [PREMIUM_COLORS.fireRed, '#B91C1C']
                      }
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      className="py-5 rounded-2xl flex-row items-center justify-center gap-3"
                      style={{
                        shadowColor: loading ? 'transparent' : PREMIUM_COLORS.fireRed,
                        shadowOffset: { width: 0, height: 6 },
                        shadowOpacity: 0.4,
                        shadowRadius: 12,
                      }}
                    >
                      {loading ? (
                        <ActivityIndicator color="white" />
                      ) : (
                        <>
                          <Shield size={22} color="white" />
                          <Text className="text-white text-lg font-bold">
                            Pagar {getFormattedPrice()}
                          </Text>
                        </>
                      )}
                    </LinearGradient>
                  </TouchableOpacity>

                  {/* Security note */}
                  <View className="flex-row items-center justify-center gap-2 mt-5">
                    <Lock size={14} color="#52525b" />
                    <Text className="text-zinc-500 text-xs">
                      Pago seguro procesado por Openpay • SSL
                    </Text>
                  </View>
                </KeyboardAvoidingView>
              )}
            </View>
          </Animated.View>
        </View>
      </View>

      {/* ================================================================== */}
      {/* CTA SECTION */}
      {/* ================================================================== */}
      <View className="px-6 py-20 bg-zinc-950 relative overflow-hidden">
        <GlowOrb color={PREMIUM_COLORS.fireRed} size={600} top="50%" left="50%" delay={0} />

        <Animated.View entering={FadeInUp.duration(800)} className="items-center relative z-10">
          <Flame size={48} color={PREMIUM_COLORS.fireRed} fill={PREMIUM_COLORS.fireRed} />
          <Text className="text-white text-4xl md:text-5xl font-bold text-center mt-6 mb-4">
            Tu mejor versión empieza hoy
          </Text>
          <Text className="text-zinc-400 text-lg text-center mb-4 max-w-xl">
            Deja de improvisar tu entrenamiento. Con TRENS tienes un IA coach, plan nutricional
            automático, cámara PRO, récords inteligentes y todo lo que necesitas para resultados
            reales.
          </Text>
          <Text className="text-zinc-500 text-base text-center mb-8 max-w-md">
            Más de 5,000 atletas ya entrenan con TRENS. Solo{' '}
            <Text className="text-red-500 font-bold">{getFormattedPrice()}/mes</Text>. Cancela
            cuando quieras.
          </Text>

          <TouchableOpacity onPress={scrollToPricing} activeOpacity={0.9}>
            <LinearGradient
              colors={[PREMIUM_COLORS.fireRed, '#B91C1C']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              className="px-12 py-5 rounded-2xl flex-row items-center gap-4"
              style={{
                shadowColor: PREMIUM_COLORS.fireRed,
                shadowOffset: { width: 0, height: 8 },
                shadowOpacity: 0.5,
                shadowRadius: 20,
              }}
            >
              <Play size={24} color="white" fill="white" />
              <Text className="text-white text-xl font-bold">COMENZAR AHORA</Text>
            </LinearGradient>
          </TouchableOpacity>
        </Animated.View>
      </View>

      {/* ================================================================== */}
      {/* FOOTER - PREMIUM */}
      {/* ================================================================== */}
      <View className="px-6 py-16 bg-black border-t border-zinc-900">
        <View className="max-w-5xl self-center w-full" style={{ alignSelf: 'center' }}>
          {/* Logo and Social */}
          <View className="items-center mb-12">
            <View className="flex-row items-center gap-3 mb-4">
              <LinearGradient
                colors={[PREMIUM_COLORS.fireRed, PREMIUM_COLORS.fireOrange]}
                className="w-12 h-12 rounded-xl items-center justify-center"
              >
                <Dumbbell size={24} color="white" />
              </LinearGradient>
              <Text
                className="text-white text-3xl font-bold"
                style={{
                  textShadowColor: PREMIUM_COLORS.glowSoft,
                  textShadowOffset: { width: 0, height: 2 },
                  textShadowRadius: 10,
                }}
              >
                TRENS
              </Text>
            </View>
            <Text className="text-zinc-500 text-sm tracking-widest">HIGH PERFORMANCE FITNESS</Text>
          </View>

          {/* Links */}
          <View className="flex-row flex-wrap justify-center gap-8 mb-12">
            <Link href="/terms" asChild>
              <TouchableOpacity className="py-2">
                <Text className="text-zinc-400 hover:text-white transition-colors">
                  Términos y Condiciones
                </Text>
              </TouchableOpacity>
            </Link>
            <Link href="/privacy" asChild>
              <TouchableOpacity className="py-2">
                <Text className="text-zinc-400 hover:text-white transition-colors">
                  Política de Privacidad
                </Text>
              </TouchableOpacity>
            </Link>
            <Link href="/contact" asChild>
              <TouchableOpacity className="py-2">
                <Text className="text-zinc-400 hover:text-white transition-colors">Contacto</Text>
              </TouchableOpacity>
            </Link>
          </View>

          {/* Divider */}
          <View className="h-px bg-zinc-800 mb-8" />

          {/* Copyright */}
          <View className="items-center">
            <Text className="text-zinc-600 text-sm text-center mb-2">
              © 2026 TRENS. Todos los derechos reservados.
            </Text>
            <View className="flex-row items-center gap-2">
              <Text className="text-zinc-700 text-xs">Lima, Perú</Text>
              <Text className="text-2xl">🇵🇪</Text>
            </View>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}
