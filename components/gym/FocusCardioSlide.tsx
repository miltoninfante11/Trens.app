// ============================================================================
// FOCUS CARDIO SLIDE - Pantalla completa de cardio en modo Focus
// PRE-workout al inicio, POST-workout al final del FlatList
// Diseño premium sin temporizador - muestra toda la info del cardio
// ============================================================================

import React from 'react';
import { View, Text } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import {
  Flame,
  Zap,
  Activity,
  TrendingUp,
  Gauge,
  Droplets,
  Clock,
  ChevronDown,
  Dumbbell,
} from 'lucide-react-native';
import { CardioBlock } from '../plan/CardioBlockCard';

// ============================================================================
// TYPES
// ============================================================================
interface FocusCardioSlideProps {
  cardio: CardioBlock;
  position: 'PRE' | 'POST';
  screenWidth: number;
  contentHeight: number;
}

// ============================================================================
// HELPERS
// ============================================================================
const getCardioTypeColor = (type: string): string => {
  switch (type) {
    case 'HIIT':
    case 'SPRINT':
    case 'TABATA':
      return '#DC2626';
    case 'LISS':
      return '#22C55E';
    case 'STEADY_STATE':
      return '#F97316';
    case 'FARTLEK':
      return '#8B5CF6';
    case 'CUSTOM':
      return '#A1A1AA';
    default:
      return '#DC2626';
  }
};

const getCardioTypeIcon = (type: string) => {
  switch (type) {
    case 'HIIT':
    case 'SPRINT':
    case 'TABATA':
      return Zap;
    case 'LISS':
    case 'FARTLEK':
      return Flame;
    default:
      return Flame;
  }
};

const getIntensityLabel = (intensity: string): string => {
  switch (intensity?.toUpperCase()) {
    case 'BAJA':
      return 'BAJA';
    case 'MODERADA':
      return 'MODERADA';
    case 'ALTA':
      return 'ALTA';
    case 'MÁXIMA':
      return 'MÁXIMA';
    default:
      return 'MODERADA';
  }
};

const getIntensityBars = (intensity: string): number => {
  switch (intensity?.toUpperCase()) {
    case 'BAJA':
      return 1;
    case 'MODERADA':
      return 2;
    case 'ALTA':
      return 3;
    case 'MÁXIMA':
      return 4;
    default:
      return 2;
  }
};

// ============================================================================
// COMPONENT
// ============================================================================
export const FocusCardioSlide: React.FC<FocusCardioSlideProps> = ({
  cardio,
  position,
  screenWidth,
  contentHeight,
}) => {
  const typeColor = getCardioTypeColor(cardio.cardio_type);
  const TypeIcon = getCardioTypeIcon(cardio.cardio_type);
  const intensityBars = getIntensityBars(cardio.intensity);
  const intensityLabel = getIntensityLabel(cardio.intensity);

  // Subtle breathing glow on the icon
  const glowOpacity = useSharedValue(0.3);
  React.useEffect(() => {
    glowOpacity.value = withRepeat(
      withSequence(
        withTiming(0.8, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.3, { duration: 2000, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );
  }, []);

  const glowStyle = useAnimatedStyle(() => ({
    opacity: glowOpacity.value,
  }));

  return (
    <View
      style={{
        width: screenWidth,
        height: contentHeight,
        backgroundColor: '#000',
      }}
      className="justify-between"
    >
      {/* ================================================================ */}
      {/* TOP - Position badge + Type */}
      {/* ================================================================ */}
      <View className="items-center pt-10">
        {/* Position pill */}
        <View
          className="px-5 py-2 rounded-full mb-6"
          style={{
            backgroundColor: `${typeColor}12`,
            borderWidth: 1,
            borderColor: `${typeColor}40`,
          }}
        >
          <Text
            className="text-[11px] font-bold font-mono tracking-[3px]"
            style={{ color: typeColor }}
          >
            {position === 'PRE' ? 'PRE-ENTRENO' : 'POST-ENTRENO'}
          </Text>
        </View>

        {/* Icon with glow */}
        <View className="items-center mb-4">
          <Animated.View
            style={[
              glowStyle,
              {
                position: 'absolute',
                width: 80,
                height: 80,
                borderRadius: 40,
                backgroundColor: typeColor,
              },
            ]}
          />
          <View
            className="w-20 h-20 rounded-full items-center justify-center"
            style={{
              backgroundColor: `${typeColor}20`,
              borderWidth: 1.5,
              borderColor: `${typeColor}50`,
            }}
          >
            <TypeIcon size={32} color={typeColor} />
          </View>
        </View>

        {/* Type name */}
        <Text
          className="text-3xl font-black uppercase tracking-wider mb-1"
          style={{ color: '#FFFFFF' }}
        >
          {cardio.cardio_type.replace('_', ' ')}
        </Text>

        {/* Activity */}
        <Text
          className="text-base font-mono tracking-widest uppercase"
          style={{ color: `${typeColor}CC` }}
        >
          {cardio.activity}
        </Text>
      </View>

      {/* ================================================================ */}
      {/* CENTER - Main metrics */}
      {/* ================================================================ */}
      <View className="px-5">
        {/* Duration - Hero stat */}
        <View
          className="rounded-2xl px-6 py-5 mb-4 items-center"
          style={{
            backgroundColor: `${typeColor}08`,
            borderWidth: 1,
            borderColor: `${typeColor}20`,
          }}
        >
          <View className="flex-row items-baseline gap-2">
            <Clock size={18} color={typeColor} style={{ marginBottom: 2 }} />
            <Text
              className="font-mono font-black"
              style={{ fontSize: 48, color: '#FFFFFF', letterSpacing: 2 }}
            >
              {cardio.duration_minutes}
            </Text>
            <Text
              className="text-lg font-bold font-mono tracking-wider"
              style={{ color: '#71717a' }}
            >
              MIN
            </Text>
          </View>
        </View>

        {/* Metrics grid */}
        <View className="flex-row gap-3 mb-4">
          {/* Intensity */}
          <View
            className="flex-1 rounded-2xl py-4 items-center"
            style={{
              backgroundColor: '#0a0a0a',
              borderWidth: 1,
              borderColor: '#18181b',
            }}
          >
            <View className="flex-row gap-[3px] mb-2">
              {[1, 2, 3, 4].map((bar) => (
                <View
                  key={bar}
                  style={{
                    width: 5,
                    height: 8 + bar * 4,
                    borderRadius: 3,
                    backgroundColor: bar <= intensityBars ? typeColor : '#1a1a1a',
                  }}
                />
              ))}
            </View>
            <Text className="text-zinc-600 text-[9px] font-mono tracking-[2px] mb-1">
              INTENSIDAD
            </Text>
            <Text className="text-white text-xs font-bold font-mono">{intensityLabel}</Text>
          </View>

          {/* Heart Rate */}
          {cardio.target_heart_rate ? (
            <View
              className="flex-1 rounded-2xl py-4 items-center"
              style={{
                backgroundColor: '#0a0a0a',
                borderWidth: 1,
                borderColor: '#18181b',
              }}
            >
              <Activity size={18} color="#DC2626" style={{ marginBottom: 6 }} />
              <Text className="text-zinc-600 text-[9px] font-mono tracking-[2px] mb-1">
                TARGET HR
              </Text>
              <Text className="text-white text-xs font-bold font-mono">
                {cardio.target_heart_rate} BPM
              </Text>
            </View>
          ) : null}

          {/* Speed */}
          {cardio.speed ? (
            <View
              className="flex-1 rounded-2xl py-4 items-center"
              style={{
                backgroundColor: '#0a0a0a',
                borderWidth: 1,
                borderColor: '#18181b',
              }}
            >
              <Gauge size={18} color="#F97316" style={{ marginBottom: 6 }} />
              <Text className="text-zinc-600 text-[9px] font-mono tracking-[2px] mb-1">
                VELOCIDAD
              </Text>
              <Text className="text-white text-xs font-bold font-mono">
                {cardio.speed} KM/H
              </Text>
            </View>
          ) : null}

          {/* Incline */}
          {cardio.incline ? (
            <View
              className="flex-1 rounded-2xl py-4 items-center"
              style={{
                backgroundColor: '#0a0a0a',
                borderWidth: 1,
                borderColor: '#18181b',
              }}
            >
              <TrendingUp size={18} color="#8B5CF6" style={{ marginBottom: 6 }} />
              <Text className="text-zinc-600 text-[9px] font-mono tracking-[2px] mb-1">
                INCLINACIÓN
              </Text>
              <Text className="text-white text-xs font-bold font-mono">{cardio.incline}%</Text>
            </View>
          ) : null}
        </View>

        {/* Badges row */}
        <View className="flex-row justify-center gap-3 flex-wrap">
          {cardio.is_fasted && (
            <View
              className="flex-row items-center gap-1.5 px-4 py-2 rounded-full"
              style={{
                backgroundColor: '#22C55E10',
                borderWidth: 1,
                borderColor: '#22C55E30',
              }}
            >
              <Droplets size={12} color="#22C55E" />
              <Text className="text-green-500 text-[10px] font-bold font-mono tracking-wider">
                EN AYUNAS
              </Text>
            </View>
          )}

          {cardio.workout_session_index != null && cardio.workout_session_index < 2 && (
            <View
              className="flex-row items-center gap-1.5 px-4 py-2 rounded-full"
              style={{
                backgroundColor: '#A855F710',
                borderWidth: 1,
                borderColor: '#A855F730',
              }}
            >
              <Dumbbell size={12} color="#A855F7" />
              <Text className="text-purple-400 text-[10px] font-bold font-mono tracking-wider">
                SESIÓN {cardio.workout_session_index === 0 ? 'A' : 'B'}
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* ================================================================ */}
      {/* BOTTOM - Notes + swipe hint */}
      {/* ================================================================ */}
      <View className="px-6 pb-8 items-center">
        {cardio.notes ? (
          <View
            className="w-full rounded-xl px-4 py-3 mb-5"
            style={{
              backgroundColor: '#0a0a0a',
              borderWidth: 1,
              borderColor: '#18181b',
            }}
          >
            <Text className="text-zinc-600 text-[9px] font-mono tracking-[2px] mb-1.5">
              NOTAS
            </Text>
            <Text className="text-zinc-400 text-sm leading-5">{cardio.notes}</Text>
          </View>
        ) : null}

        <View className="flex-row items-center gap-2">
          <ChevronDown size={14} color="#27272a" />
          <Text className="text-zinc-700 text-[10px] font-mono tracking-[2px]">
            DESLIZA PARA CONTINUAR
          </Text>
          <ChevronDown size={14} color="#27272a" />
        </View>
      </View>
    </View>
  );
};
