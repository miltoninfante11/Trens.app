// ============================================================================
// FOCUS CARDIO SLIDE - Pantalla completa de cardio en modo Focus
// PRE-workout al inicio, POST-workout al final del FlatList
// ============================================================================

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
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
  Play,
  Pause,
  RotateCcw,
} from 'lucide-react-native';
import * as Haptics from '../../lib/haptics';
import { CardioBlock } from '../plan/CardioBlockCard';

// ============================================================================
// TYPES
// ============================================================================
interface FocusCardioSlideProps {
  cardio: CardioBlock;
  position: 'PRE' | 'POST';
  screenWidth: number;
  contentHeight: number;
  totalItems: number;
  currentIndex: number;
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

const formatTimer = (totalSeconds: number): string => {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
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
  const [timerState, setTimerState] = useState<'idle' | 'running' | 'paused'>('idle');
  const [secondsRemaining, setSecondsRemaining] = useState(cardio.duration_minutes * 60);
  const [secondsElapsed, setSecondsElapsed] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const typeColor = getCardioTypeColor(cardio.cardio_type);
  const TypeIcon = getCardioTypeIcon(cardio.cardio_type);
  const intensityBars = getIntensityBars(cardio.intensity);
  const intensityLabel = getIntensityLabel(cardio.intensity);
  const totalSeconds = cardio.duration_minutes * 60;

  // Pulse animation for the timer ring
  const pulseScale = useSharedValue(1);

  useEffect(() => {
    if (timerState === 'running') {
      pulseScale.value = withRepeat(
        withSequence(
          withTiming(1.04, { duration: 800, easing: Easing.inOut(Easing.ease) }),
          withTiming(1, { duration: 800, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        true
      );
    } else {
      pulseScale.value = withTiming(1, { duration: 300 });
    }
  }, [timerState]);

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
  }));

  // Timer logic
  useEffect(() => {
    if (timerState === 'running') {
      intervalRef.current = setInterval(() => {
        setSecondsRemaining((prev) => {
          if (prev <= 1) {
            clearInterval(intervalRef.current!);
            setTimerState('idle');
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            return totalSeconds;
          }
          return prev - 1;
        });
        setSecondsElapsed((prev) => {
          if (prev + 1 >= totalSeconds) return 0;
          return prev + 1;
        });
      }, 1000);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [timerState]);

  const handleStart = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setTimerState('running');
  }, []);

  const handlePause = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (intervalRef.current) clearInterval(intervalRef.current);
    setTimerState('paused');
  }, []);

  const handleResume = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setTimerState('running');
  }, []);

  const handleReset = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (intervalRef.current) clearInterval(intervalRef.current);
    setSecondsRemaining(totalSeconds);
    setSecondsElapsed(0);
    setTimerState('idle');
  }, [totalSeconds]);

  // Progress percentage
  const progress = totalSeconds > 0 ? secondsElapsed / totalSeconds : 0;

  return (
    <View
      style={{
        width: screenWidth,
        height: contentHeight,
        backgroundColor: '#000',
      }}
    >
      {/* POSITION BADGE */}
      <View className="items-center pt-8 pb-2">
        <View
          className="px-4 py-1.5 rounded-full"
          style={{
            backgroundColor: `${typeColor}20`,
            borderWidth: 1,
            borderColor: `${typeColor}60`,
          }}
        >
          <Text
            className="text-xs font-bold font-mono tracking-widest"
            style={{ color: typeColor }}
          >
            {position === 'PRE' ? '🔥 PRE-ENTRENO' : '⚡ POST-ENTRENO'}
          </Text>
        </View>
      </View>

      {/* CARDIO TYPE + ACTIVITY */}
      <View className="items-center px-6 mt-2">
        <View className="flex-row items-center gap-2 mb-1">
          <TypeIcon size={20} color={typeColor} />
          <Text
            className="text-2xl font-bold uppercase tracking-wider"
            style={{ color: typeColor }}
          >
            {cardio.cardio_type.replace('_', ' ')}
          </Text>
        </View>
        <Text className="text-zinc-400 text-base font-mono uppercase tracking-wide">
          {cardio.activity}
        </Text>
      </View>

      {/* TIMER CIRCLE */}
      <View className="flex-1 items-center justify-center" style={{ marginTop: -20 }}>
        <Animated.View style={pulseStyle}>
          <View
            className="items-center justify-center rounded-full"
            style={{
              width: Math.min(screenWidth * 0.6, 260),
              height: Math.min(screenWidth * 0.6, 260),
              borderWidth: 4,
              borderColor:
                timerState === 'running'
                    ? typeColor
                    : '#27272a',
              shadowColor:
                timerState === 'running' ? typeColor : '#000',
              shadowOffset: { width: 0, height: 0 },
              shadowOpacity: timerState === 'idle' ? 0 : 0.6,
              shadowRadius: 24,
            }}
          >
            {/* Inner glow ring */}
            <View
              className="absolute rounded-full"
              style={{
                width: Math.min(screenWidth * 0.6, 260) - 20,
                height: Math.min(screenWidth * 0.6, 260) - 20,
                borderWidth: 1,
                borderColor:
                  timerState === 'running'
                    ? `${typeColor}30`
                    : '#18181b',
              }}
            />
            <View className="items-center">
                <Text
                  className="font-mono font-bold"
                  style={{
                    fontSize: Math.min(screenWidth * 0.12, 52),
                    color: timerState === 'running' ? typeColor : '#FFFFFF',
                    letterSpacing: 2,
                  }}
                >
                  {formatTimer(secondsRemaining)}
                </Text>
                <Text className="text-zinc-500 text-xs font-mono mt-1 tracking-wider">
                  {cardio.duration_minutes} MIN · {intensityLabel}
                </Text>
                {/* Progress text */}
                {timerState !== 'idle' && (
                  <Text
                    className="text-xs font-mono mt-2 tracking-wider"
                    style={{ color: `${typeColor}80` }}
                  >
                    {Math.round(progress * 100)}%
                  </Text>
                )}
              </View>
          </View>
        </Animated.View>
      </View>

      {/* STATS ROW */}
      <View className="flex-row justify-center gap-4 px-6 mb-4">
        {/* Intensity */}
        <View
          className="flex-1 rounded-xl px-3 py-3 items-center"
          style={{ backgroundColor: '#0a0a0a', borderWidth: 1, borderColor: '#1a1a1a' }}
        >
          <View className="flex-row gap-1 mb-1.5">
            {[1, 2, 3, 4].map((bar) => (
              <View
                key={bar}
                className="rounded-full"
                style={{
                  width: 4,
                  height: 12 + bar * 2,
                  backgroundColor: bar <= intensityBars ? typeColor : '#27272a',
                }}
              />
            ))}
          </View>
          <Text className="text-zinc-500 text-[10px] font-mono tracking-wider">INTENSIDAD</Text>
        </View>

        {/* Heart Rate */}
        {cardio.target_heart_rate ? (
          <View
            className="flex-1 rounded-xl px-3 py-3 items-center"
            style={{ backgroundColor: '#0a0a0a', borderWidth: 1, borderColor: '#1a1a1a' }}
          >
            <View className="flex-row items-center gap-1 mb-1.5">
              <Activity size={14} color="#DC2626" />
              <Text className="text-white font-bold font-mono text-sm">
                {cardio.target_heart_rate}
              </Text>
            </View>
            <Text className="text-zinc-500 text-[10px] font-mono tracking-wider">BPM</Text>
          </View>
        ) : null}

        {/* Speed */}
        {cardio.speed ? (
          <View
            className="flex-1 rounded-xl px-3 py-3 items-center"
            style={{ backgroundColor: '#0a0a0a', borderWidth: 1, borderColor: '#1a1a1a' }}
          >
            <View className="flex-row items-center gap-1 mb-1.5">
              <Gauge size={14} color="#F97316" />
              <Text className="text-white font-bold font-mono text-sm">{cardio.speed}</Text>
            </View>
            <Text className="text-zinc-500 text-[10px] font-mono tracking-wider">KM/H</Text>
          </View>
        ) : null}

        {/* Incline */}
        {cardio.incline ? (
          <View
            className="flex-1 rounded-xl px-3 py-3 items-center"
            style={{ backgroundColor: '#0a0a0a', borderWidth: 1, borderColor: '#1a1a1a' }}
          >
            <View className="flex-row items-center gap-1 mb-1.5">
              <TrendingUp size={14} color="#8B5CF6" />
              <Text className="text-white font-bold font-mono text-sm">{cardio.incline}%</Text>
            </View>
            <Text className="text-zinc-500 text-[10px] font-mono tracking-wider">INCLINE</Text>
          </View>
        ) : null}
      </View>

      {/* FASTED BADGE */}
      {cardio.is_fasted && (
        <View className="items-center mb-3">
          <View
            className="flex-row items-center gap-1.5 px-3 py-1.5 rounded-full"
            style={{ backgroundColor: '#22C55E15', borderWidth: 1, borderColor: '#22C55E40' }}
          >
            <Droplets size={12} color="#22C55E" />
            <Text className="text-green-500 text-[10px] font-bold font-mono tracking-wider">
              EN AYUNAS
            </Text>
          </View>
        </View>
      )}

      {/* NOTES */}
      {cardio.notes ? (
        <View className="px-6 mb-3">
          <Text className="text-zinc-600 text-xs text-center italic" numberOfLines={2}>
            {cardio.notes}
          </Text>
        </View>
      ) : null}

      {/* ACTION BUTTONS */}
      <View className="px-6 pb-6">
        {timerState === 'idle' && (
          <TouchableOpacity
            onPress={handleStart}
            className="flex-row items-center justify-center gap-3 py-4 rounded-2xl"
            style={{
              backgroundColor: typeColor,
              shadowColor: typeColor,
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.5,
              shadowRadius: 16,
            }}
          >
            <Play size={22} color="#FFFFFF" fill="#FFFFFF" />
            <Text className="text-white font-bold text-lg tracking-wider">INICIAR</Text>
          </TouchableOpacity>
        )}

        {timerState === 'running' && (
          <TouchableOpacity
            onPress={handlePause}
            className="flex-row items-center justify-center gap-2 py-4 rounded-2xl"
            style={{ backgroundColor: '#18181b', borderWidth: 1, borderColor: '#27272a' }}
          >
            <Pause size={18} color="#FFFFFF" />
            <Text className="text-white font-bold tracking-wider">PAUSAR</Text>
          </TouchableOpacity>
        )}

        {timerState === 'paused' && (
          <View className="flex-row gap-3">
            <TouchableOpacity
              onPress={handleReset}
              className="py-4 px-5 rounded-2xl items-center justify-center"
              style={{ backgroundColor: '#18181b', borderWidth: 1, borderColor: '#27272a' }}
            >
              <RotateCcw size={18} color="#A1A1AA" />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleResume}
              className="flex-1 flex-row items-center justify-center gap-2 py-4 rounded-2xl"
              style={{
                backgroundColor: typeColor,
                shadowColor: typeColor,
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.5,
                shadowRadius: 16,
              }}
            >
              <Play size={18} color="#FFFFFF" fill="#FFFFFF" />
              <Text className="text-white font-bold tracking-wider">CONTINUAR</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
};
