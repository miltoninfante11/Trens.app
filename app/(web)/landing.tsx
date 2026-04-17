// ============================================================================
// LANDING PAGE - TRENS
// Premium High-Performance Landing with World-Class Visual Effects
// Solo visible desde web (no PWA). Página de venta y suscripción.
// ============================================================================

import React, { useState, useEffect, useRef, useCallback } from 'react';
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
  Smartphone,
  Globe,
  BarChart3,
  BellRing,
  Clock,
  Target,
  Repeat,
  Calendar,
  ListChecks,
  Zap,
  Timer,
  MessageCircle,
  Bookmark,
  Share2,
  Activity,
  ChevronLeft,
  ChevronUp,
  Pause,
  SkipForward,
  SkipBack,
  Droplets,
  Apple,
  Beef,
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
// INTERACTIVE PHONE DEMO - 5 MODULE CAROUSEL
// ============================================================================
const MODULE_TABS = [
  { key: 'FEED', icon: Play, label: 'FEED' },
  { key: 'ADN', icon: Dna, label: 'ADN' },
  { key: 'PRO', icon: Camera, label: 'PRO' },
  { key: 'GYM', icon: Dumbbell, label: 'GYM' },
  { key: 'PLAN', icon: Utensils, label: 'PLAN' },
] as const;

type ModuleKey = (typeof MODULE_TABS)[number]['key'];

const MODULE_DURATIONS: Record<ModuleKey, number> = {
  FEED: 7500, // 5 videos × 1.5s
  ADN: 5000,
  PRO: 5000,
  GYM: 6000,
  PLAN: 6000,
};

const MODULE_DESCRIPTIONS: Record<ModuleKey, string> = {
  FEED: 'Videos reales de la comunidad. Likes, comentarios y la canción de Spotify que sonaba. Pura motivación.',
  ADN: 'Tu perfil atlético completo: macros, medidas, objetivo y progreso. Todo sincronizado automáticamente.',
  PRO: 'Grábate mientras entrenas y escuchas Spotify. Controla la música sin salir de la app.',
  GYM: 'Modo Focus: un ejercicio a la vez. Desliza para alternativas, scroll para el siguiente.',
  PLAN: 'Comidas, suplementos, bloques de entreno y cardio. Todo organizado por horarios.',
};

// --- FEED SCREEN ---
const FEED_VIDEOS = [
  {
    exercise: 'BENCH PRESS',
    weight: '120 KG × 5',
    user: 'carlos_fit',
    avatar: '#DC2626',
    likes: '247',
    badge: 'PR 🏆',
    gradient: ['#1a0808', '#0d0d0d', '#150505'] as [string, string, string],
  },
  {
    exercise: 'SQUAT',
    weight: '180 KG × 3',
    user: 'ana_power',
    avatar: '#EA580C',
    likes: '389',
    badge: '',
    gradient: ['#0d0d0d', '#150808', '#0d0d0d'] as [string, string, string],
  },
  {
    exercise: 'DEADLIFT',
    weight: '200 KG × 1',
    user: 'diego_coach',
    avatar: '#CA8A04',
    likes: '512',
    badge: '1RM 🔥',
    gradient: ['#0d100d', '#0d0d0d', '#0a0a0a'] as [string, string, string],
  },
  {
    exercise: 'MILITARY PRESS',
    weight: '80 KG × 6',
    user: 'lucia_strong',
    avatar: '#7C3AED',
    likes: '178',
    badge: '',
    gradient: ['#0d0d14', '#0d0d0d', '#0d0d0d'] as [string, string, string],
  },
  {
    exercise: 'BARBELL ROW',
    weight: '100 KG × 8',
    user: 'marcos_gym',
    avatar: '#059669',
    likes: '93',
    badge: 'Vol 🔥',
    gradient: ['#0d0f0d', '#0d0d0d', '#0d0d0d'] as [string, string, string],
  },
];

const FeedVideoCard = ({
  video,
  isActive,
}: {
  video: (typeof FEED_VIDEOS)[0];
  isActive: boolean;
}) => (
  <View
    style={{
      width: '100%',
      height: '100%',
      position: 'absolute',
      top: 0,
      left: 0,
      opacity: isActive ? 1 : 0,
    }}
  >
    <LinearGradient colors={video.gradient} style={{ flex: 1 }} className="justify-end">
      {/* Exercise overlay */}
      <View className="absolute top-4 left-4">
        <Text className="text-white font-bold text-lg">{video.exercise}</Text>
        <Text className="text-red-500 font-mono text-sm mt-0.5">{video.weight}</Text>
      </View>

      {/* Right action buttons */}
      <View className="absolute right-3 bottom-24 items-center gap-5">
        <View className="items-center">
          <Heart size={22} color="#DC2626" fill="#DC2626" />
          <Text className="text-white text-xs font-mono mt-1">{video.likes}</Text>
        </View>
        <View className="items-center">
          <MessageCircle size={22} color="white" />
          <Text className="text-white text-xs font-mono mt-1">32</Text>
        </View>
        <View className="items-center">
          <Bookmark size={22} color="white" />
        </View>
        <View className="items-center">
          <Share2 size={22} color="white" />
        </View>
      </View>

      {/* Bottom info */}
      <View className="px-4 pb-4">
        <View className="flex-row items-center gap-2 mb-2">
          <View className="w-8 h-8 rounded-full" style={{ backgroundColor: video.avatar }} />
          <Text className="text-white text-sm font-bold">{video.user}</Text>
          {video.badge ? <Text className="text-zinc-400 text-xs">· {video.badge}</Text> : null}
        </View>
        <View className="flex-row items-center gap-2">
          <Music size={10} color="#1DB954" />
          <Text className="text-zinc-500 text-xs">Spotify · Playing</Text>
        </View>
      </View>

      {/* Play icon center */}
      <View className="absolute" style={{ top: '40%', left: '45%' }}>
        <Play size={40} color="rgba(255,255,255,0.3)" fill="rgba(255,255,255,0.15)" />
      </View>

      {/* Progress bar */}
      <View className="absolute bottom-0 left-0 right-0 h-0.5 bg-zinc-800">
        <View className="h-full bg-red-600" style={{ width: isActive ? '100%' : '0%' }} />
      </View>
    </LinearGradient>
  </View>
);

const FeedScreen = ({ scrollIndex }: { scrollIndex: number }) => (
  <View className="flex-1" style={{ position: 'relative' }}>
    {FEED_VIDEOS.map((video, i) => (
      <FeedVideoCard key={i} video={video} isActive={scrollIndex === i} />
    ))}
  </View>
);

// --- ADN SCREEN ---
const AdnScreen = ({ scrollY }: { scrollY: number }) => {
  const items = [
    // TrensID card
    { type: 'id' as const },
    // Macros
    { type: 'macros' as const },
    // Measurements
    { type: 'measurements' as const },
    // Today timeline
    { type: 'today' as const },
  ];
  const visibleItems = items.slice(0, Math.min(items.length, Math.floor(scrollY / 25) + 2));

  return (
    <View className="flex-1 px-3 pt-2">
      {/* TrensID Card */}
      {visibleItems.some((i) => i.type === 'id') && (
        <View className="bg-zinc-900 rounded-2xl p-3 mb-3 border border-zinc-800/50">
          <View className="flex-row items-center gap-2 mb-3">
            <View className="w-10 h-10 rounded-full bg-red-600 items-center justify-center">
              <Text className="text-white font-bold text-sm">MR</Text>
            </View>
            <View>
              <Text className="text-white font-bold text-sm">Marco Rodríguez</Text>
              <Text className="text-zinc-500 text-xs font-mono">ÉLITE · 78 kg</Text>
            </View>
            <View className="ml-auto bg-red-600/20 px-2 py-0.5 rounded-full">
              <Text className="text-red-500 text-xs font-bold">PRO</Text>
            </View>
          </View>
          <View className="flex-row gap-2">
            <View className="flex-1 bg-zinc-800/50 rounded-xl p-2 items-center">
              <Text className="text-zinc-500 text-xs">Objetivo</Text>
              <Text className="text-white text-xs font-bold">Fuerza</Text>
            </View>
            <View className="flex-1 bg-zinc-800/50 rounded-xl p-2 items-center">
              <Text className="text-zinc-500 text-xs">Peso</Text>
              <Text className="text-white text-xs font-bold font-mono">78.4 kg</Text>
            </View>
            <View className="flex-1 bg-zinc-800/50 rounded-xl p-2 items-center">
              <Text className="text-zinc-500 text-xs">Grasa</Text>
              <Text className="text-white text-xs font-bold font-mono">14.2%</Text>
            </View>
          </View>
        </View>
      )}

      {/* Macros */}
      {visibleItems.some((i) => i.type === 'macros') && (
        <View className="bg-zinc-900 rounded-2xl p-3 mb-3 border border-zinc-800/50">
          <Text className="text-white font-bold text-xs mb-2">Macros Diarios</Text>
          <View className="flex-row gap-2">
            <View className="flex-1 items-center">
              <Text className="text-red-500 font-mono font-bold text-sm">2,850</Text>
              <Text className="text-zinc-500 text-xs">Kcal</Text>
            </View>
            <View className="flex-1 items-center">
              <Text className="text-red-400 font-mono font-bold text-sm">185g</Text>
              <Text className="text-zinc-500 text-xs">Proteína</Text>
            </View>
            <View className="flex-1 items-center">
              <Text className="text-yellow-500 font-mono font-bold text-sm">320g</Text>
              <Text className="text-zinc-500 text-xs">Carbos</Text>
            </View>
            <View className="flex-1 items-center">
              <Text className="text-blue-400 font-mono font-bold text-sm">78g</Text>
              <Text className="text-zinc-500 text-xs">Grasas</Text>
            </View>
          </View>
        </View>
      )}

      {/* Measurements */}
      {visibleItems.some((i) => i.type === 'measurements') && (
        <View className="bg-zinc-900 rounded-2xl p-3 mb-3 border border-zinc-800/50">
          <Text className="text-white font-bold text-xs mb-2">Medidas</Text>
          <View className="flex-row flex-wrap gap-2">
            {[
              { l: 'Pecho', v: '102 cm' },
              { l: 'Brazo', v: '38 cm' },
              { l: 'Cintura', v: '82 cm' },
              { l: 'Muslo', v: '61 cm' },
            ].map((m, i) => (
              <View key={i} className="bg-zinc-800/50 rounded-lg px-2.5 py-1.5">
                <Text className="text-zinc-500 text-xs">{m.l}</Text>
                <Text className="text-white text-xs font-mono font-bold">{m.v}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Timeline */}
      {visibleItems.some((i) => i.type === 'today') && (
        <View className="bg-zinc-900 rounded-2xl p-3 border border-zinc-800/50">
          <Text className="text-white font-bold text-xs mb-2">Hoy</Text>
          {[
            { time: '07:00', label: 'Desayuno', icon: '🥚', color: '#22C55E' },
            { time: '08:00', label: 'Pre-Workout Stack', icon: '💊', color: '#A855F7' },
            { time: '09:00', label: 'Push + Abs', icon: '🏋️', color: '#DC2626' },
            { time: '12:00', label: 'Almuerzo', icon: '🍗', color: '#22C55E' },
          ].map((item, i) => (
            <View key={i} className="flex-row items-center gap-2 py-1.5">
              <Text className="text-zinc-600 text-xs font-mono w-10">{item.time}</Text>
              <View className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: item.color }} />
              <Text style={{ fontSize: 12 }}>{item.icon}</Text>
              <Text className="text-zinc-300 text-xs">{item.label}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
};

// --- PRO SCREEN ---
const ProScreen = () => (
  <View className="flex-1">
    {/* Camera viewfinder */}
    <LinearGradient colors={['#0a0a0a', '#1a0808', '#0a0a0a']} className="flex-1 justify-between">
      {/* Top controls */}
      <View className="flex-row items-center justify-between px-3 pt-2">
        <View className="bg-red-600/90 px-2 py-1 rounded-full flex-row items-center gap-1">
          <View className="w-2 h-2 rounded-full bg-white" />
          <Text className="text-white text-xs font-mono font-bold">REC 0:34</Text>
        </View>
        <View className="bg-zinc-800/80 px-2 py-1 rounded-lg">
          <Text className="text-white text-xs font-bold">9:16</Text>
        </View>
      </View>

      {/* Exercise overlay on camera */}
      <View className="items-center justify-center flex-1">
        <View className="items-center">
          <View className="w-16 h-16 rounded-full border-2 border-red-600/40 items-center justify-center mb-2">
            <Camera size={24} color="#DC2626" />
          </View>
          <Text className="text-white font-bold text-sm">BENCH PRESS</Text>
          <Text className="text-red-500 font-mono text-xs mt-0.5">Serie 3 / 4</Text>
        </View>
      </View>

      {/* Spotify mini player */}
      <View className="mx-3 mb-2 bg-zinc-900/90 rounded-2xl p-3 border border-zinc-800/50">
        <View className="flex-row items-center gap-3">
          <View className="w-10 h-10 rounded-lg bg-green-900/50 items-center justify-center">
            <Music size={18} color="#1DB954" />
          </View>
          <View className="flex-1">
            <Text className="text-white text-xs font-bold" numberOfLines={1}>
              Till I Collapse
            </Text>
            <Text className="text-zinc-500 text-xs">Eminem</Text>
          </View>
          <View className="flex-row items-center gap-3">
            <SkipBack size={14} color="white" />
            <View className="w-7 h-7 rounded-full bg-white items-center justify-center">
              <Pause size={12} color="black" />
            </View>
            <SkipForward size={14} color="white" />
          </View>
        </View>
        {/* Progress bar */}
        <View className="h-0.5 bg-zinc-700 rounded-full mt-2">
          <View className="h-full bg-green-500 rounded-full" style={{ width: '62%' }} />
        </View>
      </View>

      {/* Bottom info */}
      <View className="px-3 pb-3">
        <View className="bg-zinc-800/60 rounded-xl p-2.5">
          <Text className="text-zinc-400 text-xs leading-4">
            📹 Cámara PRO graba mientras escuchas Spotify.{'\n'}
            Controla la música desde el reproductor integrado sin salir de tu sesión.
          </Text>
        </View>
      </View>
    </LinearGradient>
  </View>
);

// --- GYM SCREEN (Focus Mode) ---
const GYM_EXERCISES = [
  {
    name: 'BENCH PRESS',
    alternatives: ['INCLINE DB PRESS', 'CABLE FLY'],
    series: [
      { type: 'C', color: '#3B82F6', reps: 12, weight: 60 },
      { type: 'A', color: '#F97316', reps: 8, weight: 100 },
      { type: 'E', color: '#22C55E', reps: 5, weight: 120 },
      { type: 'E', color: '#22C55E', reps: 5, weight: 120 },
    ],
  },
  {
    name: 'INCLINE DB PRESS',
    alternatives: ['SMITH INCLINE', 'LANDMINE PRESS'],
    series: [
      { type: 'E', color: '#22C55E', reps: 10, weight: 36 },
      { type: 'E', color: '#22C55E', reps: 10, weight: 36 },
      { type: 'E', color: '#22C55E', reps: 8, weight: 40 },
    ],
  },
  {
    name: 'CABLE FLY',
    alternatives: ['PEC DECK', 'DB FLY'],
    series: [
      { type: 'E', color: '#22C55E', reps: 12, weight: 15 },
      { type: 'E', color: '#22C55E', reps: 12, weight: 15 },
      { type: 'F', color: '#EF4444', reps: 10, weight: 15 },
    ],
  },
];

const GymScreen = ({ exerciseIndex, altIndex }: { exerciseIndex: number; altIndex: number }) => {
  const ex = GYM_EXERCISES[exerciseIndex] || GYM_EXERCISES[0];
  const displayName = altIndex > 0 ? ex.alternatives[altIndex - 1] || ex.name : ex.name;

  return (
    <View className="flex-1 px-3 pt-2">
      {/* Focus mode header */}
      <View className="flex-row items-center justify-between mb-2">
        <Text className="text-red-500 text-xs font-mono font-bold">FOCUS MODE</Text>
        <Text className="text-zinc-600 text-xs font-mono">
          {exerciseIndex + 1}/{GYM_EXERCISES.length}
        </Text>
      </View>

      {/* Exercise image area */}
      <LinearGradient
        colors={['#1a0808', '#0d0d0d']}
        className="rounded-2xl items-center justify-center mb-3"
        style={{ height: 120 }}
      >
        <Dumbbell size={28} color="#DC2626" />
        <Text className="text-white font-bold text-sm mt-2">{displayName}</Text>
        {altIndex > 0 && (
          <View className="bg-orange-600/20 px-2 py-0.5 rounded-full mt-1">
            <Text className="text-orange-400 text-xs font-mono">ALT {altIndex}</Text>
          </View>
        )}
      </LinearGradient>

      {/* Alternative indicators */}
      <View className="flex-row items-center justify-center gap-1.5 mb-3">
        {[ex.name, ...ex.alternatives].map((_, i) => (
          <View
            key={i}
            className="rounded-full"
            style={{
              width: i === altIndex ? 16 : 6,
              height: 6,
              backgroundColor: i === altIndex ? '#DC2626' : '#3f3f46',
            }}
          />
        ))}
        <Text className="text-zinc-600 text-xs ml-1">← desliza →</Text>
      </View>

      {/* Series list */}
      <View className="bg-zinc-900 rounded-2xl p-3 border border-zinc-800/50">
        <Text className="text-white font-bold text-xs mb-2">Series</Text>
        {ex.series.map((s, i) => (
          <View key={i} className="flex-row items-center gap-2 py-1.5 border-b border-zinc-800/30">
            <View
              className="w-5 h-5 rounded items-center justify-center"
              style={{ backgroundColor: `${s.color}20` }}
            >
              <Text style={{ color: s.color, fontSize: 9, fontWeight: 'bold' }}>{s.type}</Text>
            </View>
            <Text className="text-zinc-300 text-xs flex-1">{s.reps} reps</Text>
            <Text className="text-white text-xs font-mono font-bold">{s.weight} kg</Text>
            <View className="w-4 h-4 rounded border border-zinc-700" />
          </View>
        ))}
      </View>

      {/* Swipe hint */}
      <View className="items-center mt-3">
        <ChevronUp size={14} color="#52525B" />
        <Text className="text-zinc-600 text-xs">siguiente ejercicio</Text>
      </View>
    </View>
  );
};

// --- PLAN SCREEN ---
const PLAN_SECTIONS = ['Comidas', 'Stack', 'Entreno', 'Cardio'] as const;

const PlanScreen = ({ sectionIndex }: { sectionIndex: number }) => {
  const section = PLAN_SECTIONS[sectionIndex] || PLAN_SECTIONS[0];

  return (
    <View className="flex-1 px-3 pt-2">
      {/* Section tabs */}
      <View className="flex-row gap-1 mb-3">
        {PLAN_SECTIONS.map((s, i) => (
          <View
            key={i}
            className="flex-1 py-1.5 rounded-lg items-center"
            style={{ backgroundColor: i === sectionIndex ? '#DC262620' : '#18181b' }}
          >
            <Text
              className="text-xs font-bold"
              style={{ color: i === sectionIndex ? '#DC2626' : '#71717A', fontSize: 9 }}
            >
              {s}
            </Text>
          </View>
        ))}
      </View>

      {/* Meals */}
      {section === 'Comidas' && (
        <View>
          {[
            {
              time: '07:00',
              name: 'Desayuno',
              items: ['4 claras + 2 huevos', 'Avena 80g', 'Banana', 'Café negro'],
              kcal: 620,
            },
            {
              time: '10:30',
              name: 'Snack AM',
              items: ['Yogurt griego 200g', 'Almendras 30g', 'Miel 10g'],
              kcal: 340,
            },
            {
              time: '13:00',
              name: 'Almuerzo',
              items: ['Pechuga 200g', 'Arroz 150g', 'Brócoli', 'Aceite oliva'],
              kcal: 680,
            },
          ].map((meal, i) => (
            <View key={i} className="bg-zinc-900 rounded-xl p-2.5 mb-2 border border-zinc-800/30">
              <View className="flex-row items-center justify-between mb-1.5">
                <View className="flex-row items-center gap-1.5">
                  <Text className="text-green-500 text-xs font-mono">{meal.time}</Text>
                  <Text className="text-white text-xs font-bold">{meal.name}</Text>
                </View>
                <Text className="text-zinc-500 text-xs font-mono">{meal.kcal} kcal</Text>
              </View>
              {meal.items.map((item, j) => (
                <Text key={j} className="text-zinc-400 text-xs pl-2">
                  • {item}
                </Text>
              ))}
            </View>
          ))}
        </View>
      )}

      {/* Stack */}
      {section === 'Stack' && (
        <View>
          {[
            { time: '07:00', name: 'Creatina', dose: '5g', type: 'powder', color: '#A855F7' },
            { time: '07:00', name: 'Omega 3', dose: '2 caps', type: 'pill', color: '#3B82F6' },
            {
              time: '08:30',
              name: 'Pre-Workout',
              dose: '1 scoop',
              type: 'powder',
              color: '#EF4444',
            },
            { time: '10:00', name: 'Whey Protein', dose: '30g', type: 'powder', color: '#F97316' },
            { time: '15:00', name: 'Vitamina D3', dose: '4000 UI', type: 'pill', color: '#FBBF24' },
            { time: '22:00', name: 'Magnesio', dose: '400mg', type: 'pill', color: '#8B5CF6' },
          ].map((s, i) => (
            <View key={i} className="flex-row items-center gap-2 py-2 border-b border-zinc-800/30">
              <View
                className="w-7 h-7 rounded-lg items-center justify-center"
                style={{ backgroundColor: `${s.color}20` }}
              >
                <Pill size={12} color={s.color} />
              </View>
              <View className="flex-1">
                <Text className="text-white text-xs font-bold">{s.name}</Text>
                <Text className="text-zinc-500 text-xs font-mono">{s.dose}</Text>
              </View>
              <Text className="text-zinc-600 text-xs font-mono">{s.time}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Training block */}
      {section === 'Entreno' && (
        <View>
          <View className="bg-zinc-900 rounded-xl p-3 mb-2 border border-red-900/30">
            <View className="flex-row items-center gap-2 mb-2">
              <Dumbbell size={14} color="#DC2626" />
              <Text className="text-white text-xs font-bold">PUSH + ABS</Text>
              <View className="ml-auto bg-zinc-800 px-2 py-0.5 rounded-full">
                <Text className="text-zinc-400 text-xs font-mono">~65 min</Text>
              </View>
            </View>
            <View className="bg-zinc-800/50 rounded-lg p-2 mb-2">
              <Text className="text-purple-400 text-xs font-bold mb-1">Pre-Workout</Text>
              {['Creatina 5g', 'Pre-Workout 1 scoop', 'Cafeína 200mg'].map((s, i) => (
                <Text key={i} className="text-zinc-400 text-xs">
                  💊 {s}
                </Text>
              ))}
            </View>
            <View className="bg-zinc-800/50 rounded-lg p-2">
              <Text className="text-green-400 text-xs font-bold mb-1">Post-Workout</Text>
              {['Whey Protein 30g', 'Glutamina 5g'].map((s, i) => (
                <Text key={i} className="text-zinc-400 text-xs">
                  💊 {s}
                </Text>
              ))}
            </View>
          </View>
          <View className="bg-zinc-900 rounded-xl p-3 border border-orange-900/30">
            <View className="flex-row items-center gap-2 mb-1">
              <Flame size={14} color="#F97316" />
              <Text className="text-white text-xs font-bold">SESIÓN 2: CARDIO PM</Text>
            </View>
            <Text className="text-zinc-400 text-xs">LISS · Caminata inclinada · 30 min</Text>
          </View>
        </View>
      )}

      {/* Cardio */}
      {section === 'Cardio' && (
        <View>
          {[
            {
              type: 'HIIT',
              activity: 'Sprints',
              duration: '20 min',
              intensity: 4,
              color: '#DC2626',
              hr: '165 bpm',
            },
            {
              type: 'LISS',
              activity: 'Caminata inclinada',
              duration: '30 min',
              intensity: 2,
              color: '#22C55E',
              hr: '125 bpm',
            },
            {
              type: 'STEADY STATE',
              activity: 'Bicicleta',
              duration: '25 min',
              intensity: 3,
              color: '#F97316',
              hr: '145 bpm',
            },
          ].map((c, i) => (
            <View key={i} className="bg-zinc-900 rounded-xl p-3 mb-2 border border-zinc-800/30">
              <View className="flex-row items-center gap-2 mb-1.5">
                <View
                  className="w-6 h-6 rounded items-center justify-center"
                  style={{ backgroundColor: `${c.color}20` }}
                >
                  <Activity size={12} color={c.color} />
                </View>
                <Text className="text-white text-xs font-bold">{c.type}</Text>
                <Text className="text-zinc-500 text-xs ml-auto font-mono">{c.duration}</Text>
              </View>
              <View className="flex-row items-center gap-3">
                <Text className="text-zinc-400 text-xs">{c.activity}</Text>
                <Text className="text-zinc-600 text-xs">·</Text>
                <View className="flex-row items-center gap-0.5">
                  {[1, 2, 3, 4].map((level) => (
                    <View
                      key={level}
                      className="rounded-sm"
                      style={{
                        width: 3,
                        height: 8 + level * 2,
                        backgroundColor: level <= c.intensity ? c.color : '#3f3f46',
                      }}
                    />
                  ))}
                </View>
                <Text className="text-zinc-500 text-xs font-mono">{c.hr}</Text>
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
};

// --- MAIN INTERACTIVE PHONE DEMO ---
const InteractivePhoneDemo = () => {
  const [activeModule, setActiveModule] = useState<ModuleKey>('FEED');
  const [feedIndex, setFeedIndex] = useState(0);
  const [adnScroll, setAdnScroll] = useState(0);
  const [gymExercise, setGymExercise] = useState(0);
  const [gymAlt, setGymAlt] = useState(0);
  const [planSection, setPlanSection] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const moduleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const phoneW = SCREEN_WIDTH < 640 ? 270 : 310;
  const phoneH = SCREEN_WIDTH < 640 ? 560 : 640;

  // Module cycling
  const goToNextModule = useCallback(() => {
    setActiveModule((prev) => {
      const idx = MODULE_TABS.findIndex((t) => t.key === prev);
      const next = MODULE_TABS[(idx + 1) % MODULE_TABS.length];
      return next.key;
    });
    // Reset inner states
    setFeedIndex(0);
    setAdnScroll(0);
    setGymExercise(0);
    setGymAlt(0);
    setPlanSection(0);
  }, []);

  // Inner content animation per module
  useEffect(() => {
    if (isPaused) return;

    if (timerRef.current) clearInterval(timerRef.current);
    if (moduleTimerRef.current) clearTimeout(moduleTimerRef.current);

    const duration = MODULE_DURATIONS[activeModule];

    if (activeModule === 'FEED') {
      // Cycle videos every 1.5s
      let idx = 0;
      timerRef.current = setInterval(() => {
        idx++;
        if (idx >= FEED_VIDEOS.length) {
          if (timerRef.current) clearInterval(timerRef.current);
          goToNextModule();
        } else {
          setFeedIndex(idx);
        }
      }, 1500);
    } else if (activeModule === 'ADN') {
      // Gradually scroll content
      let scroll = 0;
      timerRef.current = setInterval(() => {
        scroll += 25;
        setAdnScroll(scroll);
      }, 1000);
      moduleTimerRef.current = setTimeout(goToNextModule, duration);
    } else if (activeModule === 'PRO') {
      moduleTimerRef.current = setTimeout(goToNextModule, duration);
    } else if (activeModule === 'GYM') {
      // Cycle: show exercise → show alt → next exercise → show alt → next
      const sequence = [
        { ex: 0, alt: 0 },
        { ex: 0, alt: 1 },
        { ex: 0, alt: 0 },
        { ex: 1, alt: 0 },
        { ex: 2, alt: 0 },
        { ex: 2, alt: 1 },
      ];
      let step = 0;
      timerRef.current = setInterval(() => {
        step++;
        if (step >= sequence.length) {
          if (timerRef.current) clearInterval(timerRef.current);
          goToNextModule();
        } else {
          setGymExercise(sequence[step].ex);
          setGymAlt(sequence[step].alt);
        }
      }, 1000);
    } else if (activeModule === 'PLAN') {
      // Cycle plan sections
      let sec = 0;
      timerRef.current = setInterval(() => {
        sec++;
        if (sec >= PLAN_SECTIONS.length) {
          if (timerRef.current) clearInterval(timerRef.current);
          goToNextModule();
        } else {
          setPlanSection(sec);
        }
      }, 1500);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (moduleTimerRef.current) clearTimeout(moduleTimerRef.current);
    };
  }, [activeModule, isPaused, goToNextModule]);

  // Manual tab selection
  const selectModule = (key: ModuleKey) => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (moduleTimerRef.current) clearTimeout(moduleTimerRef.current);
    setActiveModule(key);
    setFeedIndex(0);
    setAdnScroll(0);
    setGymExercise(0);
    setGymAlt(0);
    setPlanSection(0);
    setIsPaused(false);
  };

  return (
    <View
      className="bg-black relative overflow-hidden"
      style={{ paddingHorizontal: 16, paddingVertical: SCREEN_WIDTH < 768 ? 48 : 80 }}
    >
      <GlowOrb color={PREMIUM_COLORS.fireRed} size={400} top="30%" left="60%" delay={500} />

      {/* Section header */}
      <Animated.View entering={FadeInUp.duration(600)} className="items-center mb-6">
        <View className="flex-row items-center gap-3 mb-4">
          <Smartphone size={20} color={PREMIUM_COLORS.fireRed} />
          <Text
            className="text-red-500 font-mono tracking-[0.3em] uppercase"
            style={{ fontSize: SCREEN_WIDTH < 640 ? 11 : 14 }}
          >
            Demo interactivo
          </Text>
        </View>
        <Text
          className="text-white font-bold text-center max-w-2xl px-2"
          style={{ fontSize: SCREEN_WIDTH < 640 ? 22 : SCREEN_WIDTH < 768 ? 32 : 40 }}
        >
          5 módulos, <Text style={{ color: PREMIUM_COLORS.fireRed }}>una sola app</Text>
        </Text>
      </Animated.View>

      {/* Module description */}
      <Animated.View entering={FadeInUp.delay(200).duration(600)} className="items-center mb-6">
        <Text className="text-zinc-400 text-sm text-center max-w-md px-4">
          {MODULE_DESCRIPTIONS[activeModule]}
        </Text>
      </Animated.View>

      <Animated.View
        entering={FadeInUp.delay(300).duration(800).springify()}
        className="items-center"
      >
        {/* Phone Frame */}
        <TouchableOpacity
          activeOpacity={0.95}
          onPress={() => setIsPaused((p) => !p)}
          style={{
            width: phoneW,
            height: phoneH,
            borderRadius: 40,
            borderWidth: 3,
            borderColor: isPaused ? 'rgba(220,38,38,0.4)' : 'rgba(255,255,255,0.1)',
            backgroundColor: '#0A0A0A',
            overflow: 'hidden',
            position: 'relative',
            shadowColor: PREMIUM_COLORS.fireRed,
            shadowOffset: { width: 0, height: 20 },
            shadowOpacity: 0.3,
            shadowRadius: 40,
          }}
        >
          {/* Notch */}
          <View
            style={{
              width: 120,
              height: 28,
              backgroundColor: '#000',
              borderBottomLeftRadius: 20,
              borderBottomRightRadius: 20,
              alignSelf: 'center',
              zIndex: 10,
            }}
          />

          {/* Status bar */}
          <View className="flex-row items-center justify-between px-6 py-1">
            <Text className="text-white text-xs font-bold">9:41</Text>
            <View className="flex-row items-center gap-1">
              <View className="w-4 h-2 rounded-sm bg-white" />
            </View>
          </View>

          {/* App header */}
          <View className="px-4 py-2 flex-row items-center justify-between">
            <View className="flex-row items-center gap-2">
              <LinearGradient
                colors={[PREMIUM_COLORS.fireRed, PREMIUM_COLORS.fireOrange]}
                className="w-7 h-7 rounded-lg items-center justify-center"
              >
                <Dumbbell size={14} color="white" />
              </LinearGradient>
              <Text className="text-white font-bold text-sm">{activeModule}</Text>
            </View>
            {isPaused && (
              <View className="bg-red-600/20 px-2 py-0.5 rounded-full">
                <Text className="text-red-500 text-xs font-bold">PAUSADO</Text>
              </View>
            )}
          </View>

          {/* Module Content */}
          <View className="flex-1">
            {activeModule === 'FEED' && <FeedScreen scrollIndex={feedIndex} />}
            {activeModule === 'ADN' && <AdnScreen scrollY={adnScroll} />}
            {activeModule === 'PRO' && <ProScreen />}
            {activeModule === 'GYM' && <GymScreen exerciseIndex={gymExercise} altIndex={gymAlt} />}
            {activeModule === 'PLAN' && <PlanScreen sectionIndex={planSection} />}
          </View>

          {/* Bottom Tab Bar */}
          <View className="flex-row items-center justify-around py-3 border-t border-zinc-800/50 bg-black/90">
            {MODULE_TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeModule === tab.key;
              return (
                <TouchableOpacity
                  key={tab.key}
                  onPress={() => selectModule(tab.key)}
                  className="items-center"
                  activeOpacity={0.7}
                >
                  <Icon
                    size={18}
                    color={isActive ? PREMIUM_COLORS.fireRed : '#71717A'}
                    fill={isActive && tab.key === 'FEED' ? PREMIUM_COLORS.fireRed : 'none'}
                  />
                  <Text
                    style={{ fontSize: 8, color: isActive ? PREMIUM_COLORS.fireRed : '#52525B' }}
                    className="mt-0.5 font-bold"
                  >
                    {tab.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </TouchableOpacity>

        {/* Pause hint */}
        <Text className="text-zinc-600 text-xs mt-4 text-center">
          Toca el teléfono para {isPaused ? 'reanudar' : 'pausar'} · Toca un tab para navegar
        </Text>
      </Animated.View>

      {/* Module progress dots */}
      <View className="flex-row items-center justify-center gap-2 mt-6">
        {MODULE_TABS.map((tab) => (
          <TouchableOpacity key={tab.key} onPress={() => selectModule(tab.key)}>
            <View
              className="rounded-full"
              style={{
                width: activeModule === tab.key ? 24 : 8,
                height: 8,
                backgroundColor: activeModule === tab.key ? PREMIUM_COLORS.fireRed : '#3f3f46',
              }}
            />
          </TouchableOpacity>
        ))}
      </View>
    </View>
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
            Organiza tu entrenamiento{' '}
            <Text style={{ color: PREMIUM_COLORS.fireRed }}>al mínimo detalle</Text>
          </Text>
          <Text className="text-zinc-400 text-lg md:text-xl text-center mt-6 max-w-2xl leading-relaxed">
            Rutinas con cada serie configurable, plan nutricional por horario, stack de suplementos
            ilimitado, múltiples cardios, 2 entrenamientos al día, récords automáticos, cámara PRO y
            feed motivacional. Todo conectado en una sola plataforma.
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
      {/* INTERACTIVE PHONE DEMO - 5 MODULES */}
      {/* ================================================================== */}
      <InteractivePhoneDemo />
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
      {/* FEATURES GRID - UTILITY FOCUSED */}
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
              Herramientas
            </Text>
            <Sparkles size={20} color={PREMIUM_COLORS.fireRed} />
          </View>
          <Text
            className="text-white font-bold text-center max-w-2xl leading-tight px-2"
            style={{ fontSize: SCREEN_WIDTH < 640 ? 22 : SCREEN_WIDTH < 768 ? 32 : 40 }}
          >
            Configura <Text style={{ color: PREMIUM_COLORS.fireRed }}>cada detalle</Text> de tu
            entrenamiento
          </Text>
          <Text className="text-zinc-400 text-center mt-4 max-w-xl px-4">
            Desde el calentamiento hasta el último suplemento del día. TRENS te da control total
            sobre cada variable de tu rendimiento.
          </Text>
        </Animated.View>

        <View
          className="flex-row flex-wrap justify-center items-stretch"
          style={{ maxWidth: 1300, alignSelf: 'center', gap: 12, paddingHorizontal: 4 }}
        >
          <PremiumFeatureCard
            icon={Dumbbell}
            title="Rutinas a Tu Medida"
            description="Constructor con +500 ejercicios, días rotacionales automáticos, 4 tipos de series (calentamiento, aproximación, efectiva, fallo). Configura peso, reps, RIR, tempo y descanso en cada serie. Hasta 2 entrenamientos por día. Drag & drop para reorganizar."
            delay={100}
            index={0}
          />
          <PremiumFeatureCard
            icon={Utensils}
            title="Plan Nutricional Completo"
            description="Planifica cada comida por horario con ingredientes detallados y gramos exactos. Múltiples opciones por comida para variar tu dieta. Macros calculados automáticamente por inteligencia artificial. Ajuste dinámico según tu objetivo: volumen, definición o mantenimiento."
            delay={150}
            index={1}
          />
          <PremiumFeatureCard
            icon={Pill}
            title="Stack de Suplementos Ilimitado"
            description="Agrega cualquier suplemento: pastillas, polvo, líquido, inyectables. Configura múltiples horarios y dosis específicas por día. Pre-workout, intra-workout, post-workout, antes de dormir — todo organizado en tu timeline diario integrado con tu plan."
            delay={200}
            index={2}
          />
          <PremiumFeatureCard
            icon={Timer}
            title="Cardio Blocks"
            description="Agrega varios bloques de cardio separados a tu día: HIIT, steady-state, caminata, bicicleta. Cada uno con duración, intensidad y notas. Combínalos con tus entrenamientos de fuerza para un control total de tu volumen de trabajo."
            delay={250}
            index={3}
          />
          <PremiumFeatureCard
            icon={Camera}
            title="Cámara PRO 9:16"
            description="Graba cada set en formato vertical profesional. Flash, cámara frontal/trasera, compresión inteligente. Cada video queda vinculado al ejercicio, peso y repeticiones exactas. Tu técnica documentada en tu bóveda personal para revisarla cuando quieras."
            delay={300}
            index={4}
          />
          <PremiumFeatureCard
            icon={Trophy}
            title="Récords Automáticos"
            description="TRENS detecta automáticamente cuando superas tu mejor marca: PR dominante, peso máximo, 1RM estimado y máx reps. Cada récord registrado con video, fecha y datos exactos. Historial completo de progresión por ejercicio."
            delay={350}
            index={5}
          />
          <PremiumFeatureCard
            icon={Dna}
            title="ADN Atlético"
            description="Tu perfil completo: medidas corporales (peso, grasa, masa muscular), récords personales, macros objetivo, fotos de progreso con comparativas en timeline, badges y stats de volumen semanal. TrensID Card compartible."
            delay={400}
            index={6}
          />
          <PremiumFeatureCard
            icon={TrendingUp}
            title="Progreso Visual"
            description="Sube fotos de progreso y compáralas en timeline con slider lado a lado. Ve tu transformación mes a mes con datos de peso, grasa corporal y masa muscular. Cada foto se vincula a tus métricas de ese momento."
            delay={450}
            index={7}
          />
          <PremiumFeatureCard
            icon={BarChart3}
            title="Macros Inteligentes"
            description="Calorías, proteína, carbs y grasa calculados automáticamente según tu peso, altura, edad, nivel de actividad y objetivo. Se ajustan en tiempo real cuando modificas tu plan de comidas. Dashboard visual con anillos de progreso diario."
            delay={500}
            index={8}
          />
          <PremiumFeatureCard
            icon={ShoppingCart}
            title="Lista de Compras"
            description="Se genera automáticamente desde tus comidas planificadas. Agrupa todos los ingredientes de la semana por categoría. Lleva al supermercado exactamente lo que necesitas. Sin desperdiciar, sin olvidar nada."
            delay={550}
            index={9}
          />
          <PremiumFeatureCard
            icon={Music}
            title="Spotify Sync"
            description="Conecta tu Spotify Premium y la canción que suena durante tu set se sincroniza automáticamente con tu video: nombre del track, artista, carátula y posición exacta. Control de reproducción integrado en la app."
            delay={600}
            index={10}
          />
          <PremiumFeatureCard
            icon={BellRing}
            title="Notificaciones Smart"
            description="Recordatorios automáticos de entrenamiento, alertas de suplementos programadas a la hora exacta, avisos de comidas y notificaciones de la comunidad. 100% personalizables para que nunca se te pase nada."
            delay={650}
            index={11}
          />
        </View>

        {/* ================================================================== */}
        {/* PARA QUIÉN ES TRENS */}
        {/* ================================================================== */}
        <View
          className="mt-20 items-center"
          style={{ maxWidth: 1000, alignSelf: 'center', width: '100%' }}
        >
          <Animated.View
            entering={FadeInUp.delay(700).duration(600)}
            className="items-center mb-10"
          >
            <Text
              className="text-red-500 font-mono tracking-[0.3em] uppercase mb-4"
              style={{ fontSize: SCREEN_WIDTH < 640 ? 11 : 14 }}
            >
              ¿Para quién es?
            </Text>
            <Text
              className="text-white font-bold text-center px-2"
              style={{ fontSize: SCREEN_WIDTH < 640 ? 22 : SCREEN_WIDTH < 768 ? 28 : 36 }}
            >
              Si quieres <Text style={{ color: PREMIUM_COLORS.fireRed }}>resultados reales</Text>,
              necesitas un sistema real
            </Text>
          </Animated.View>

          <View
            className="flex-row flex-wrap justify-center gap-4"
            style={{ paddingHorizontal: 8 }}
          >
            {/* Card 1: Quiere ordenarse */}
            <Animated.View
              entering={FadeInUp.delay(800).duration(600)}
              className="bg-zinc-900/40 border border-zinc-800/40 rounded-2xl p-6"
              style={{ width: SCREEN_WIDTH < 640 ? '100%' : 460, maxWidth: 460 }}
            >
              <View className="flex-row items-center gap-3 mb-4">
                <LinearGradient
                  colors={[PREMIUM_COLORS.fireRed, PREMIUM_COLORS.fireOrange]}
                  className="w-12 h-12 rounded-2xl items-center justify-center"
                >
                  <Target size={24} color="white" />
                </LinearGradient>
                <Text className="text-white font-bold text-lg">Quieres ordenarte</Text>
              </View>
              <Text className="text-zinc-400 text-sm leading-relaxed mb-4">
                Entrenas pero no tienes estructura. Un día haces pecho, otro improvias pierna. Comes
                lo que hay. No sabes qué suplementos tomar ni cuándo. No llevas registro de nada.
              </Text>
              <View className="gap-2">
                {[
                  'Rutina armada por días con rotación automática',
                  'Plan de comidas con horarios y macros calculados',
                  'Stack de suplementos con alertas de horario',
                  'Lista de compras generada de tu plan',
                  'Fotos de progreso para ver tu transformación',
                ].map((item, i) => (
                  <View key={i} className="flex-row items-center gap-2">
                    <Check size={14} color={PREMIUM_COLORS.fireRed} />
                    <Text className="text-zinc-300 text-sm">{item}</Text>
                  </View>
                ))}
              </View>
            </Animated.View>

            {/* Card 2: Atleta competitivo */}
            <Animated.View
              entering={FadeInUp.delay(900).duration(600)}
              className="bg-zinc-900/40 border border-red-600/20 rounded-2xl p-6"
              style={{ width: SCREEN_WIDTH < 640 ? '100%' : 460, maxWidth: 460 }}
            >
              <View className="flex-row items-center gap-3 mb-4">
                <LinearGradient
                  colors={[PREMIUM_COLORS.fireRed, '#B91C1C']}
                  className="w-12 h-12 rounded-2xl items-center justify-center"
                >
                  <Flame size={24} color="white" />
                </LinearGradient>
                <Text className="text-white font-bold text-lg">Atleta competitivo</Text>
              </View>
              <Text className="text-zinc-400 text-sm leading-relaxed mb-4">
                Necesitas control absoluto sobre cada variable: peso, reps, RIR, tempo, descanso.
                Dos sesiones al día, cardio específico, suplementación precisa al minuto.
              </Text>
              <View className="gap-2">
                {[
                  '2 entrenamientos al día con series detalladas',
                  'RIR, tempo (excéntrica-concéntrica), descanso configurable',
                  'Múltiples cardios con intensidad y duración',
                  'Récords automáticos con 1RM estimado',
                  'Cámara PRO para análisis de técnica',
                  'Videos de cada PR registrados automáticamente',
                ].map((item, i) => (
                  <View key={i} className="flex-row items-center gap-2">
                    <Check size={14} color={PREMIUM_COLORS.fireRed} />
                    <Text className="text-zinc-300 text-sm">{item}</Text>
                  </View>
                ))}
              </View>
            </Animated.View>
          </View>
        </View>

        {/* ================================================================== */}
        {/* DEEP DIVE: NIVEL DE DETALLE */}
        {/* ================================================================== */}
        <View
          className="mt-20 items-center"
          style={{ maxWidth: 1000, alignSelf: 'center', width: '100%' }}
        >
          <Animated.View
            entering={FadeInUp.delay(1000).duration(600)}
            className="items-center mb-10"
          >
            <Text
              className="text-red-500 font-mono tracking-[0.3em] uppercase mb-4"
              style={{ fontSize: SCREEN_WIDTH < 640 ? 11 : 14 }}
            >
              Nivel de detalle
            </Text>
            <Text
              className="text-white font-bold text-center px-2"
              style={{ fontSize: SCREEN_WIDTH < 640 ? 22 : SCREEN_WIDTH < 768 ? 28 : 36 }}
            >
              Cada serie, cada comida, cada suplemento —{' '}
              <Text style={{ color: PREMIUM_COLORS.fireRed }}>configurable</Text>
            </Text>
          </Animated.View>

          <View className="flex-row flex-wrap justify-center gap-3 px-4">
            {[
              {
                icon: Dumbbell,
                title: 'POR SERIE',
                items: [
                  'Peso en kg/lb',
                  'Repeticiones',
                  'RIR (Reps In Reserve)',
                  'Tempo (ecc-bot-con-top)',
                  'Tiempo de descanso',
                  'Tipo: calentamiento / efectiva / fallo',
                ],
                color: '#DC2626',
              },
              {
                icon: Utensils,
                title: 'POR COMIDA',
                items: [
                  'Horario específico',
                  'Ingredientes con gramos',
                  'Macros automáticos (kcal/P/C/G)',
                  'Múltiples opciones por slot',
                  'Sugerencias de sustitución',
                  'Detección de alérgenos',
                ],
                color: '#F97316',
              },
              {
                icon: Pill,
                title: 'POR SUPLEMENTO',
                items: [
                  'Tipo: pastilla / polvo / líquido',
                  'Dosis específica',
                  'Múltiples horarios al día',
                  'Notas de uso',
                  'Timeline integrado',
                  'Alertas programables',
                ],
                color: '#FBBF24',
              },
            ].map((block, i) => (
              <Animated.View
                key={i}
                entering={FadeInUp.delay(1100 + i * 100).duration(500)}
                className="bg-zinc-900/40 border border-zinc-800/40 rounded-2xl p-5"
                style={{ width: SCREEN_WIDTH < 640 ? '100%' : 300 }}
              >
                <View className="flex-row items-center gap-3 mb-4">
                  <View
                    className="w-10 h-10 rounded-xl items-center justify-center"
                    style={{ backgroundColor: `${block.color}20` }}
                  >
                    <block.icon size={20} color={block.color} />
                  </View>
                  <Text className="text-white font-bold font-mono text-sm">{block.title}</Text>
                </View>
                <View className="gap-2">
                  {block.items.map((item, j) => (
                    <View key={j} className="flex-row items-center gap-2">
                      <View
                        className="w-1.5 h-1.5 rounded-full"
                        style={{ backgroundColor: block.color }}
                      />
                      <Text className="text-zinc-400 text-xs">{item}</Text>
                    </View>
                  ))}
                </View>
              </Animated.View>
            ))}
          </View>

          {/* IA mention — single, subtle */}
          <Animated.View
            entering={FadeInUp.delay(1400).duration(600)}
            className="mt-8 items-center"
          >
            <View className="bg-zinc-900/30 border border-zinc-800/30 rounded-2xl px-6 py-4 flex-row items-center gap-4 max-w-lg">
              <Brain size={24} color={PREMIUM_COLORS.fireRed} />
              <View className="flex-1">
                <Text className="text-white font-bold text-sm">Asistente IA integrado</Text>
                <Text className="text-zinc-500 text-xs mt-1">
                  HANK puede crear rutinas, calcular macros, sugerir ejercicios y ajustar tu plan —
                  por texto o voz.
                </Text>
              </View>
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
                title: 'Arma tu plan',
                desc: 'Configura tu rutina por días, tu plan de comidas por horario, tu stack de suplementos y tus cardios. Todo queda guardado y listo.',
                icon: Dna,
              },
              {
                step: '03',
                title: 'Entrena y registra',
                desc: 'Graba tus sets, trackea tu nutrición, recibe alertas de suplementos, ve tu progreso crecer día a día y rompe récords.',
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
            text="Tengo cada serie de mi rutina configurada al detalle: peso, reps, RIR, tempo. La detección automática de récords me tiene motivado al máximo. Subí 15kg en mi sentadilla en 3 meses gracias a trackear todo."
            delay={100}
          />
          <TestimonialCard
            name="María Fernández"
            role="Fitness Coach · Arequipa"
            text="El plan nutricional con macros automáticos me ahorró S/ 200 mensuales en nutricionista. Configuro cada comida con gramos exactos y la lista de compras se genera sola. Oro puro para mi prep."
            delay={200}
          />
          <TestimonialCard
            name="Diego Ramírez"
            role="Personal Trainer · Trujillo"
            text="Uso TRENS con 12 clientes. 2 entrenamientos al día, cardios separados, suplementación con horarios. El nivel de detalle que tiene esta app no lo he visto en ninguna otra. Y el feed los mantiene motivados."
            delay={300}
          />
          <TestimonialCard
            name="Ana Torres"
            role="Bodybuilder · Cusco"
            text="Las fotos de progreso con comparativas timeline son un game-changer. Puedo ver mi transformación semana a semana con datos de grasa corporal. 4 PRs detectados automáticamente que ni sabía que había roto."
            delay={400}
          />
          <TestimonialCard
            name="Rodrigo Chávez"
            role="Atleta Natural · Lima"
            text="Mi stack de suplementos es extenso: creatina, proteína, omega-3, multivitamínico, ZMA... TRENS me organiza todo con horarios y dosis. Cada pastilla, cada polvo, todo en su timeline. Nunca me olvidé de nada."
            delay={500}
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
              q: '¿Puedo poner 2 entrenamientos en un solo día?',
              a: 'Sí. Puedes configurar sesiones de mañana y tarde con ejercicios independientes. Además puedes agregar múltiples bloques de cardio separados al mismo día.',
            },
            {
              q: '¿TRENS sirve para principiantes?',
              a: 'Absolutamente. Puedes empezar con rutinas simples e ir agregando complejidad. El sistema de días rotacionales y la configuración por serie te ayudan a llevar orden desde el primer día.',
            },
            {
              q: '¿Qué tan detallado puedo configurar cada serie?',
              a: 'Cada serie tiene: peso, repeticiones, tipo (calentamiento, aproximación, efectiva, fallo), RIR, tempo (eccéntrica-fondo-concéntrica-top) y tiempo de descanso. Control total.',
            },
            {
              q: '¿Qué métodos de pago aceptan?',
              a: 'Visa, Mastercard y American Express. El pago se procesa de forma segura con Openpay (certificación PCI DSS). También aceptamos pagos nativos en App Store y Google Play.',
            },
            {
              q: '¿Puedo usar TRENS solo para nutrición, sin hacer gym?',
              a: 'Sí. El módulo PLAN funciona independientemente. Puedes planificar comidas, calcular macros, gestionar suplementos y generar listas de compras sin necesidad de usar el módulo GYM.',
            },
            {
              q: '¿La lista de compras se genera automáticamente?',
              a: 'Sí. A partir de todas las comidas e ingredientes de tu plan semanal, TRENS genera una lista de compras agrupada por categoría. Solo la abres en el supermercado y listo.',
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
            todas las herramientas, todos los módulos, y todas las actualizaciones futuras.
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
            Deja de improvisar. Con TRENS ordenas tu rutina, tu nutrición, tus suplementos, tus
            cardios y tu progreso en una sola plataforma. Cada detalle bajo control.
          </Text>
          <Text className="text-zinc-500 text-base text-center mb-8 max-w-md">
            Solo <Text className="text-red-500 font-bold">{getFormattedPrice()}/mes</Text>. Cancela
            cuando quieras. Sin compromiso.
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
