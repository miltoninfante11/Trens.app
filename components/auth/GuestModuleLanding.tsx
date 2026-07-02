// ============================================================================
// GUEST MODULE LANDING - TRENS
// Mini landing que muestra a invitados qué hace cada módulo
// y los invita a iniciar sesión. Sin opción de compra/suscripción.
// ============================================================================

import React from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import {
  Dna,
  TrendingUp,
  Camera,
  BarChart3,
  Dumbbell,
  Target,
  Calendar,
  Zap,
  Utensils,
  Brain,
  Pill,
  ShoppingBag,
  LogIn,
  Flame,
  LucideIcon,
} from 'lucide-react-native';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import * as Haptics from '../../lib/haptics';

// ============================================================================
// TIPOS
// ============================================================================
type ModuleId = 'adn' | 'gym' | 'plan';

interface Feature {
  icon: LucideIcon;
  label: string;
}

interface ModuleConfig {
  id: ModuleId;
  name: string;
  tagline: string;
  description: string;
  accentColor: string;
  features: Feature[];
  MainIcon: LucideIcon;
}

// ============================================================================
// CONFIGURACIÓN DE MÓDULOS
// ============================================================================
const MODULE_CONFIG: Record<ModuleId, ModuleConfig> = {
  adn: {
    id: 'adn',
    name: 'ADN',
    tagline: 'Tu perfil atlético completo',
    description:
      'Registra tu composición corporal, récords personales, fotos de progreso y macros diarios. Tu identidad como atleta, toda en un solo lugar.',
    accentColor: '#F97316',
    MainIcon: Dna,
    features: [
      { icon: BarChart3, label: 'Macros calculados con IA' },
      { icon: Camera, label: 'Fotos de progreso con comparativa' },
      { icon: TrendingUp, label: 'Récords personales con video' },
      { icon: Dna, label: 'TrensID Card compartible' },
    ],
  },
  gym: {
    id: 'gym',
    name: 'GYM',
    tagline: 'Diseña tu rutina de alto rendimiento',
    description:
      'Constructor de rutinas con más de 500 ejercicios, series configurables por tipo, cardio blocks, doble sesión por día y seguimiento completo de tu progreso.',
    accentColor: '#DC2626',
    MainIcon: Dumbbell,
    features: [
      { icon: Dumbbell, label: '+500 ejercicios con demo en video' },
      { icon: Target, label: 'Series: calentamiento, aproximación, efectiva' },
      { icon: Zap, label: 'Cardio blocks y doble sesión/día' },
      { icon: Calendar, label: 'Días rotacionales automáticos' },
    ],
  },
  plan: {
    id: 'plan',
    name: 'PLAN',
    tagline: 'Tu agenda metabólica completa',
    description:
      'Planifica comidas por horario con ingredientes exactos, macros calculados automáticamente, stack de suplementos y lista de compras generada al instante.',
    accentColor: '#22C55E',
    MainIcon: Utensils,
    features: [
      { icon: Utensils, label: 'Comidas por horario con ingredientes' },
      { icon: Brain, label: 'Macros calculados con inteligencia artificial' },
      { icon: Pill, label: 'Stack de suplementos ilimitado' },
      { icon: ShoppingBag, label: 'Lista de compras automática' },
    ],
  },
};

// ============================================================================
// PROPS
// ============================================================================
interface GuestModuleLandingProps {
  module: ModuleId;
}

// ============================================================================
// COMPONENT
// ============================================================================
export function GuestModuleLanding({ module }: GuestModuleLandingProps) {
  const router = useRouter();
  const config = MODULE_CONFIG[module];
  const { MainIcon } = config;

  const handleLogin = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push('/(auth)/login');
  };

  const handleRegister = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push('/(auth)/register');
  };

  return (
    <ScrollView
      className="flex-1 bg-black"
      contentContainerStyle={{ flexGrow: 1, paddingBottom: 120 }}
      showsVerticalScrollIndicator={false}
    >
      {/* Ambient glow */}
      <View
        style={{
          position: 'absolute',
          top: -80,
          left: '50%',
          marginLeft: -150,
          width: 300,
          height: 300,
          borderRadius: 150,
          backgroundColor: config.accentColor,
          opacity: 0.08,
        }}
      />

      {/* Hero */}
      <Animated.View entering={FadeInDown.duration(600)} className="items-center pt-20 px-6 pb-10">
        {/* Icon */}
        <View className="mb-6">
          <View
            style={{
              position: 'absolute',
              width: 120,
              height: 120,
              borderRadius: 60,
              backgroundColor: config.accentColor,
              opacity: 0.15,
              top: -8,
              left: -8,
            }}
          />
          <LinearGradient
            colors={[config.accentColor, '#000000']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{
              width: 104,
              height: 104,
              borderRadius: 28,
              alignItems: 'center',
              justifyContent: 'center',
              shadowColor: config.accentColor,
              shadowOffset: { width: 0, height: 8 },
              shadowOpacity: 0.5,
              shadowRadius: 20,
              elevation: 12,
            }}
          >
            <MainIcon size={52} color="#FFFFFF" strokeWidth={1.5} />
          </LinearGradient>
        </View>

        {/* Module name badge */}
        <View
          className="px-4 py-1 rounded-full mb-4"
          style={{
            backgroundColor: `${config.accentColor}20`,
            borderWidth: 1,
            borderColor: `${config.accentColor}40`,
          }}
        >
          <Text
            className="font-mono font-bold tracking-widest text-xs"
            style={{ color: config.accentColor }}
          >
            MÓDULO {config.name}
          </Text>
        </View>

        {/* Tagline */}
        <Text
          className="text-white text-2xl font-black text-center mb-3"
          style={{
            textShadowColor: config.accentColor,
            textShadowOffset: { width: 0, height: 0 },
            textShadowRadius: 10,
          }}
        >
          {config.tagline}
        </Text>

        {/* Description */}
        <Text className="text-zinc-400 text-base text-center leading-6 max-w-sm">
          {config.description}
        </Text>
      </Animated.View>

      {/* Features */}
      <Animated.View entering={FadeInUp.delay(200).duration(600)} className="px-6 mb-8">
        <View
          className="rounded-3xl overflow-hidden"
          style={{
            backgroundColor: '#0D0D0D',
            borderWidth: 1,
            borderColor: '#27272A',
          }}
        >
          {config.features.map((feat, idx) => {
            const FeatIcon = feat.icon;
            return (
              <View key={idx}>
                <View className="flex-row items-center gap-4 px-5 py-4">
                  <View
                    className="w-10 h-10 rounded-xl items-center justify-center"
                    style={{ backgroundColor: `${config.accentColor}15` }}
                  >
                    <FeatIcon size={20} color={config.accentColor} />
                  </View>
                  <Text className="text-white font-medium flex-1">{feat.label}</Text>
                  <Flame size={14} color={config.accentColor} opacity={0.6} />
                </View>
                {idx < config.features.length - 1 && <View className="h-px bg-zinc-800/50 mx-5" />}
              </View>
            );
          })}
        </View>
      </Animated.View>

      {/* CTA */}
      <Animated.View entering={FadeInUp.delay(400).duration(600)} className="px-6 gap-3">
        {/* Primary: Login */}
        <TouchableOpacity onPress={handleLogin} activeOpacity={0.85}>
          <LinearGradient
            colors={[
              config.accentColor,
              config.accentColor === '#DC2626' ? '#B91C1C' : config.accentColor,
            ]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={{
              borderRadius: 18,
              paddingVertical: 18,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
              shadowColor: config.accentColor,
              shadowOffset: { width: 0, height: 6 },
              shadowOpacity: 0.4,
              shadowRadius: 14,
              elevation: 10,
            }}
          >
            <LogIn size={22} color="#FFFFFF" />
            <Text className="text-white font-black text-lg tracking-wider">INICIAR SESIÓN</Text>
          </LinearGradient>
        </TouchableOpacity>

        {/* Secondary: Register */}
        <TouchableOpacity
          onPress={handleRegister}
          activeOpacity={0.7}
          className="py-4 items-center"
        >
          <Text className="text-zinc-500 text-sm">
            ¿Sin cuenta? <Text className="text-zinc-300 font-bold">Crea una gratis →</Text>
          </Text>
        </TouchableOpacity>
      </Animated.View>
    </ScrollView>
  );
}

export default GuestModuleLanding;
