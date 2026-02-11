// ============================================================================
// EMPTY STATES - Componentes Premium para Estados Vacíos
// Diseño SAVAGE MODE con ilustraciones y CTAs atractivos
// ============================================================================

import React, { useEffect } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  withSpring,
  withDelay,
  Easing,
  interpolate,
  FadeIn,
} from 'react-native-reanimated';
import {
  Dumbbell,
  Utensils,
  Pill,
  Camera,
  Trophy,
  Flame,
  Plus,
  Sparkles,
  Play,
  GitlabIcon as Bot,
  LucideIcon,
} from 'lucide-react-native';
import * as Haptics from '../../lib/haptics';

// ============================================================================
// TYPES
// ============================================================================

export type EmptyStateType =
  | 'gym-no-routine'
  | 'gym-rest-day'
  | 'gym-no-exercises'
  | 'plan-no-meals'
  | 'plan-no-supplements'
  | 'feed-no-videos'
  | 'profile-no-records'
  | 'adn-no-photos'
  | 'generic';

interface EmptyStateProps {
  type: EmptyStateType;
  onAction?: () => void;
  customTitle?: string;
  customDescription?: string;
  customActionLabel?: string;
  customIcon?: LucideIcon;
}

// ============================================================================
// CONSTANTS
// ============================================================================

interface EmptyStateConfig {
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  accentColor: string;
  secondaryColor: string;
  motivationalQuote?: string;
}

const EMPTY_STATE_CONFIGS: Record<EmptyStateType, EmptyStateConfig> = {
  'gym-no-routine': {
    icon: Dumbbell,
    title: 'SIN RUTINA CONFIGURADA',
    description: 'Crea tu primera rutina de entrenamiento y empieza a trackear tu progreso.',
    actionLabel: 'CREAR RUTINA',
    accentColor: '#DC2626',
    secondaryColor: '#F97316',
    motivationalQuote: '"El único mal entrenamiento es el que no hiciste"',
  },
  'gym-rest-day': {
    icon: Flame,
    title: 'DÍA DE DESCANSO',
    description: 'Hoy toca recuperar. Los músculos crecen mientras descansas.',
    actionLabel: undefined,
    accentColor: '#22C55E',
    secondaryColor: '#10B981',
    motivationalQuote: '"El descanso es parte del entrenamiento"',
  },
  'gym-no-exercises': {
    icon: Plus,
    title: 'SIN EJERCICIOS',
    description: 'Agrega ejercicios a tu rutina para comenzar a entrenar.',
    actionLabel: 'AGREGAR EJERCICIO',
    accentColor: '#DC2626',
    secondaryColor: '#F97316',
  },
  'plan-no-meals': {
    icon: Utensils,
    title: 'SIN COMIDAS',
    description: 'Configura tu plan de alimentación para optimizar tu nutrición.',
    actionLabel: 'AGREGAR COMIDA',
    accentColor: '#22C55E',
    secondaryColor: '#10B981',
    motivationalQuote: '"Entrenas 1 hora, comes 23 horas"',
  },
  'plan-no-supplements': {
    icon: Pill,
    title: 'SIN SUPLEMENTOS',
    description: 'Agrega tu stack de suplementos para recordatorios automáticos.',
    actionLabel: 'AGREGAR STACK',
    accentColor: '#8B5CF6',
    secondaryColor: '#7C3AED',
  },
  'feed-no-videos': {
    icon: Play,
    title: 'SIN VIDEOS AÚN',
    description: 'Sé el primero en compartir tu progreso con la comunidad.',
    actionLabel: 'GRABAR VIDEO',
    accentColor: '#DC2626',
    secondaryColor: '#F97316',
    motivationalQuote: '"Documenta tu journey"',
  },
  'profile-no-records': {
    icon: Trophy,
    title: 'SIN RÉCORDS',
    description: 'Tus récords personales aparecerán aquí cuando los registres.',
    actionLabel: 'IR A ENTRENAR',
    accentColor: '#F97316',
    secondaryColor: '#EAB308',
    motivationalQuote: '"Los récords están para romperse"',
  },
  'adn-no-photos': {
    icon: Camera,
    title: 'SIN FOTOS DE PROGRESO',
    description: 'Documenta tu transformación con fotos semanales.',
    actionLabel: 'TOMAR FOTO',
    accentColor: '#F97316',
    secondaryColor: '#DC2626',
    motivationalQuote: '"La mejor versión de ti está en construcción"',
  },
  generic: {
    icon: Sparkles,
    title: 'NADA AQUÍ TODAVÍA',
    description: 'Esta sección está vacía. ¡Es hora de llenarla!',
    actionLabel: 'COMENZAR',
    accentColor: '#DC2626',
    secondaryColor: '#F97316',
  },
};

// ============================================================================
// ANIMATED ICON COMPONENT
// ============================================================================

const AnimatedIcon: React.FC<{
  Icon: LucideIcon;
  color: string;
  secondaryColor: string;
  type: EmptyStateType;
}> = ({ Icon, color, secondaryColor, type }) => {
  const float = useSharedValue(0);
  const pulse = useSharedValue(1);
  const glow = useSharedValue(0);

  useEffect(() => {
    // Floating animation
    float.value = withRepeat(
      withSequence(
        withTiming(-8, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: 2000, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      false
    );

    // Pulse animation
    pulse.value = withRepeat(
      withSequence(
        withTiming(1.05, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 1500, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      false
    );

    // Glow animation
    glow.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.3, { duration: 2000, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      false
    );
  }, [float, pulse, glow]);

  const containerStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: float.value }, { scale: pulse.value }],
  }));

  const glowStyle = useAnimatedStyle(() => ({
    shadowOpacity: interpolate(glow.value, [0, 1], [0.3, 0.7]),
    shadowRadius: interpolate(glow.value, [0, 1], [15, 35]),
  }));

  // Specific animation for rest day (more calm)
  const isRestDay = type === 'gym-rest-day';

  return (
    <Animated.View style={containerStyle}>
      <Animated.View
        style={[
          {
            width: 120,
            height: 120,
            borderRadius: 60,
            backgroundColor: `${color}15`,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 2,
            borderColor: `${color}30`,
            shadowColor: color,
            shadowOffset: { width: 0, height: 0 },
          },
          glowStyle,
        ]}
      >
        {/* Inner gradient ring */}
        <View
          style={{
            position: 'absolute',
            width: 100,
            height: 100,
            borderRadius: 50,
            borderWidth: 1,
            borderColor: `${secondaryColor}20`,
          }}
        />

        {/* Icon */}
        <Icon size={isRestDay ? 48 : 56} color={color} />

        {/* Sparkle decorations */}
        {!isRestDay && (
          <>
            <View
              style={{
                position: 'absolute',
                top: 10,
                right: 15,
                width: 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: secondaryColor,
                opacity: 0.6,
              }}
            />
            <View
              style={{
                position: 'absolute',
                bottom: 20,
                left: 10,
                width: 6,
                height: 6,
                borderRadius: 3,
                backgroundColor: color,
                opacity: 0.4,
              }}
            />
          </>
        )}
      </Animated.View>
    </Animated.View>
  );
};

// ============================================================================
// HANK SUGGESTION BUBBLE
// ============================================================================

const HankSuggestion: React.FC<{ message: string; delay?: number }> = ({
  message,
  delay = 500,
}) => {
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(20);

  useEffect(() => {
    opacity.value = withDelay(delay, withTiming(1, { duration: 400 }));
    translateY.value = withDelay(delay, withSpring(0, { damping: 12 }));
  }, [opacity, translateY, delay]);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <Animated.View style={style} className="mt-6 mx-4">
      <View className="flex-row items-start p-4 rounded-xl bg-zinc-900/50 border border-zinc-800">
        <View className="w-8 h-8 rounded-full bg-red-600/20 items-center justify-center mr-3 mt-0.5">
          <Bot size={16} color="#DC2626" />
        </View>
        <View className="flex-1">
          <Text className="text-red-500 text-xs font-bold mb-1">HANK DICE</Text>
          <Text className="text-zinc-400 text-sm leading-relaxed">{message}</Text>
        </View>
      </View>
    </Animated.View>
  );
};

// ============================================================================
// ACTION BUTTON
// ============================================================================

const ActionButton: React.FC<{
  label: string;
  color: string;
  onPress: () => void;
}> = ({ label, color, onPress }) => {
  const scale = useSharedValue(1);

  const handlePressIn = () => {
    scale.value = withTiming(0.95, { duration: 100 });
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 12 });
  };

  const buttonStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View style={buttonStyle}>
      <TouchableOpacity
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          onPress();
        }}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        className="flex-row items-center px-6 py-4 rounded-xl"
        style={{
          backgroundColor: color,
          shadowColor: color,
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.4,
          shadowRadius: 12,
          elevation: 8,
        }}
      >
        <Plus size={20} color="#FFFFFF" />
        <Text className="text-white font-bold text-base ml-2">{label}</Text>
      </TouchableOpacity>
    </Animated.View>
  );
};

// ============================================================================
// MAIN EMPTY STATE COMPONENT
// ============================================================================

export const EmptyState: React.FC<EmptyStateProps> = ({
  type,
  onAction,
  customTitle,
  customDescription,
  customActionLabel,
  customIcon,
}) => {
  const config = EMPTY_STATE_CONFIGS[type];
  const Icon = customIcon || config.icon;
  const title = customTitle || config.title;
  const description = customDescription || config.description;
  const actionLabel = customActionLabel || config.actionLabel;

  return (
    <Animated.View
      entering={FadeIn.duration(400)}
      className="flex-1 items-center justify-center px-8 py-12"
    >
      {/* Animated Icon */}
      <AnimatedIcon
        Icon={Icon}
        color={config.accentColor}
        secondaryColor={config.secondaryColor}
        type={type}
      />

      {/* Title */}
      <Text className="text-white font-black text-xl text-center mt-8 tracking-wide">{title}</Text>

      {/* Description */}
      <Text className="text-zinc-500 text-center mt-3 max-w-[280px] leading-relaxed">
        {description}
      </Text>

      {/* Motivational Quote */}
      {config.motivationalQuote && (
        <View className="mt-4 px-4 py-2 bg-zinc-900/30 rounded-lg border border-zinc-800/50">
          <Text className="text-zinc-600 text-xs italic text-center">
            {config.motivationalQuote}
          </Text>
        </View>
      )}

      {/* Action Button */}
      {actionLabel && onAction && (
        <View className="mt-8">
          <ActionButton label={actionLabel} color={config.accentColor} onPress={onAction} />
        </View>
      )}

      {/* Hank Suggestion (for specific types) */}
      {type === 'gym-no-routine' && (
        <HankSuggestion message="¿No sabes por dónde empezar? Dime tu objetivo y te creo una rutina personalizada. 💪" />
      )}

      {type === 'plan-no-meals' && (
        <HankSuggestion message="Puedo calcular tus macros ideales basándome en tu perfil. Solo dime cuántas comidas quieres al día." />
      )}

      {type === 'gym-rest-day' && (
        <HankSuggestion message="Aprovecha para revisar tu nutrición o hacer algo de cardio ligero si te sientes con energía." />
      )}
    </Animated.View>
  );
};

// ============================================================================
// COMPACT EMPTY STATE (para uso en secciones pequeñas)
// ============================================================================

interface CompactEmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  color?: string;
}

export const CompactEmptyState: React.FC<CompactEmptyStateProps> = ({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
  color = '#DC2626',
}) => {
  return (
    <Animated.View entering={FadeIn.duration(300)} className="items-center py-8 px-4">
      <View
        className="w-16 h-16 rounded-full items-center justify-center mb-3"
        style={{ backgroundColor: `${color}15` }}
      >
        <Icon size={28} color={color} />
      </View>

      <Text className="text-white font-bold text-sm text-center">{title}</Text>

      {description && (
        <Text className="text-zinc-500 text-xs text-center mt-1 max-w-[200px]">{description}</Text>
      )}

      {actionLabel && onAction && (
        <TouchableOpacity
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onAction();
          }}
          className="flex-row items-center mt-4 px-4 py-2 rounded-full"
          style={{ backgroundColor: `${color}20`, borderWidth: 1, borderColor: `${color}40` }}
        >
          <Plus size={14} color={color} />
          <Text style={{ color }} className="font-bold text-xs ml-1">
            {actionLabel}
          </Text>
        </TouchableOpacity>
      )}
    </Animated.View>
  );
};

// ============================================================================
// INLINE EMPTY STATE (para listas y cards)
// ============================================================================

interface InlineEmptyStateProps {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

export const InlineEmptyState: React.FC<InlineEmptyStateProps> = ({
  message,
  actionLabel,
  onAction,
}) => {
  return (
    <View className="flex-row items-center justify-center py-6 px-4 bg-zinc-900/30 rounded-xl border border-dashed border-zinc-800">
      <Text className="text-zinc-500 text-sm">{message}</Text>
      {actionLabel && onAction && (
        <TouchableOpacity
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onAction();
          }}
          className="ml-2"
        >
          <Text className="text-red-500 font-bold text-sm">{actionLabel}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

// ============================================================================
// EXPORTS
// ============================================================================

export default EmptyState;
