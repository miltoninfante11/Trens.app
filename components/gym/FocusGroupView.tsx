// ============================================================================
// FOCUS GROUP VIEW - Vista de grupo en modo Focus (ejecución)
// SUPERSET (2): Pantalla dividida vertical (arriba/abajo)
// CIRCUIT/TRISET/GIANT_SET (3+): Lista compacta con expandible
// ============================================================================

import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { Image } from 'expo-image';
import { RotateCcw, Play, Pause, ChevronDown, ChevronUp } from 'lucide-react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withSequence,
  Easing,
  FadeIn,
  SlideInDown,
} from 'react-native-reanimated';
import { ExerciseGroup, GROUP_TYPE_CONFIG } from '../../types/exerciseGroups';
import * as Haptics from '../../lib/haptics';

// ============================================================================
// TYPES
// ============================================================================

interface SeriesConfig {
  id: string;
  reps: number;
  weight: number;
  type: string;
  note?: string;
}

interface GroupExerciseData {
  id: string;
  exercise_id: string;
  name: string;
  image_url: string;
  series: SeriesConfig[];
}

interface FocusGroupViewProps {
  group: ExerciseGroup;
  exercises: GroupExerciseData[];
  screenWidth: number;
  contentHeight: number;
  onEditSeries: (exerciseId: string) => void;
  spotifyMode?: boolean;
}

// ============================================================================
// SERIES TYPE CONFIG
// ============================================================================
const typeConfig: Record<string, { bg: string; border: string; label: string }> = {
  CALENTAMIENTO: { bg: '#1e3a5f', border: '#3b82f6', label: 'C' },
  APROXIMACION: { bg: '#422006', border: '#f59e0b', label: 'A' },
  EFECTIVA: { bg: '#14532d', border: '#22c55e', label: 'E' },
  FALLO: { bg: '#450a0a', border: '#ef4444', label: 'F' },
};

// ============================================================================
// COUNTDOWN TIMER COMPONENT
// ============================================================================
const CountdownTimer: React.FC<{
  seconds: number;
  label: string;
  color: string;
  onComplete?: () => void;
}> = ({ seconds, label, color, onComplete }) => {
  const [remaining, setRemaining] = useState(seconds);
  const [isRunning, setIsRunning] = useState(false);

  useEffect(() => {
    if (!isRunning || remaining <= 0) return;
    const interval = setInterval(() => {
      setRemaining((prev) => {
        if (prev <= 1) {
          setIsRunning(false);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          onComplete?.();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [isRunning, remaining, onComplete]);

  const formatTime = (s: number) => {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleToggle = () => {
    if (remaining <= 0) {
      setRemaining(seconds);
      setIsRunning(true);
    } else {
      setIsRunning(!isRunning);
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  return (
    <TouchableOpacity
      onPress={handleToggle}
      className="flex-row items-center gap-2 px-3 py-2 rounded-xl"
      style={{
        backgroundColor: isRunning ? `${color}20` : 'rgba(255,255,255,0.05)',
        borderWidth: 1,
        borderColor: isRunning ? color : '#27272a',
      }}
    >
      {isRunning ? (
        <Pause size={14} color={color} />
      ) : (
        <Play size={14} color={remaining <= 0 ? '#22c55e' : color} />
      )}
      <Text
        className="font-mono font-bold text-sm"
        style={{ color: remaining <= 0 ? '#22c55e' : '#fff' }}
      >
        {remaining <= 0 ? '✓' : formatTime(remaining)}
      </Text>
      <Text className="text-zinc-500 text-[9px]">{label}</Text>
    </TouchableOpacity>
  );
};

// ============================================================================
// SERIES PILLS - Compact inline series view
// ============================================================================
const SeriesPills: React.FC<{ series: SeriesConfig[] }> = ({ series }) => (
  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
    <View className="flex-row gap-1">
      {(series || []).map((s, idx) => {
        const config = typeConfig[s.type] || typeConfig.EFECTIVA;
        return (
          <View
            key={String(idx)}
            className="items-center justify-center rounded-md"
            style={{
              width: 36,
              height: 36,
              backgroundColor: config.bg,
              borderWidth: 1,
              borderColor: config.border,
            }}
          >
            <Text className="text-white font-bold text-xs">{String(s.reps || 0)}</Text>
            <Text className="text-zinc-400 text-[7px] font-bold -mt-0.5">{config.label}</Text>
          </View>
        );
      })}
    </View>
  </ScrollView>
);

// ============================================================================
// SUPERSET SLOT - Mitad de pantalla para un ejercicio (modo split vertical)
// ============================================================================
const SupersetSlot: React.FC<{
  exercise: GroupExerciseData;
  width: number;
  height: number;
  groupColor: string;
  onEditSeries: () => void;
  position: 'top' | 'bottom';
}> = ({ exercise, width, height, groupColor, onEditSeries, position }) => {
  const imageHeight = height * 0.65;

  return (
    <TouchableOpacity
      activeOpacity={0.9}
      onPress={onEditSeries}
      style={{
        width,
        height,
        borderBottomWidth: position === 'top' ? 2 : 0,
        borderBottomColor: position === 'top' ? groupColor : 'transparent',
      }}
    >
      {/* Imagen */}
      <View style={{ width, height: imageHeight }} className="relative">
        {exercise.image_url ? (
          <Image
            source={{ uri: exercise.image_url }}
            style={{ width, height: imageHeight }}
            contentFit="cover"
          />
        ) : (
          <View
            style={{ width, height: imageHeight }}
            className="bg-zinc-900 items-center justify-center"
          >
            <Text className="text-zinc-600 text-4xl">💪</Text>
          </View>
        )}

        {/* Overlay inferior con nombre */}
        <View
          className="absolute bottom-0 left-0 right-0 px-4 pb-3 pt-10"
          style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
        >
          <Text
            className="text-white font-bold uppercase tracking-wider text-base"
            style={{
              textShadowColor: 'rgba(0,0,0,0.9)',
              textShadowOffset: { width: 0, height: 1 },
              textShadowRadius: 6,
            }}
            numberOfLines={2}
          >
            {exercise.name}
          </Text>
        </View>
      </View>

      {/* Series */}
      <View className="flex-1 px-4 py-2 justify-center bg-black">
        <SeriesPills series={exercise.series} />
      </View>
    </TouchableOpacity>
  );
};

// ============================================================================
// CIRCUIT EXERCISE ROW - Fila compacta expandible para circuitos (3+)
// ============================================================================
const CircuitExerciseRow: React.FC<{
  exercise: GroupExerciseData;
  index: number;
  total: number;
  groupColor: string;
  isExpanded: boolean;
  onToggle: () => void;
  onEditSeries: () => void;
}> = ({ exercise, index, total, groupColor, isExpanded, onToggle, onEditSeries }) => {
  const seriesCount = exercise.series?.length || 0;
  const totalReps = exercise.series?.reduce((sum, s) => sum + (s.reps || 0), 0) || 0;

  return (
    <View
      style={{
        borderBottomWidth: index < total - 1 ? 1 : 0,
        borderBottomColor: '#1a1a1a',
      }}
    >
      {/* Fila compacta */}
      <TouchableOpacity
        onPress={() => {
          onToggle();
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }}
        activeOpacity={0.7}
        className="flex-row items-center px-4 py-3"
        style={{
          backgroundColor: isExpanded ? `${groupColor}10` : 'transparent',
        }}
      >
        {/* Número de orden */}
        <View
          className="w-7 h-7 rounded-full items-center justify-center mr-3"
          style={{
            backgroundColor: `${groupColor}25`,
            borderWidth: 1,
            borderColor: groupColor,
          }}
        >
          <Text className="font-bold text-xs" style={{ color: groupColor }}>
            {index + 1}
          </Text>
        </View>

        {/* Miniatura */}
        <View className="w-12 h-12 rounded-lg overflow-hidden mr-3">
          {exercise.image_url ? (
            <Image
              source={{ uri: exercise.image_url }}
              style={{ width: 48, height: 48 }}
              contentFit="cover"
            />
          ) : (
            <View className="w-12 h-12 bg-zinc-800 items-center justify-center">
              <Text className="text-zinc-600">💪</Text>
            </View>
          )}
        </View>

        {/* Info */}
        <View className="flex-1 mr-2">
          <Text className="text-white font-bold text-sm" numberOfLines={1}>
            {exercise.name}
          </Text>
          <Text className="text-zinc-500 text-[10px] font-mono mt-0.5">
            {seriesCount} series • {totalReps} reps total
          </Text>
        </View>

        {/* Chevron */}
        {isExpanded ? (
          <ChevronUp size={18} color="#71717a" />
        ) : (
          <ChevronDown size={18} color="#71717a" />
        )}
      </TouchableOpacity>

      {/* Contenido expandido */}
      {isExpanded && (
        <Animated.View
          entering={FadeIn.duration(200)}
          className="px-4 pb-4"
          style={{ backgroundColor: `${groupColor}08` }}
        >
          {/* Imagen grande */}
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={onEditSeries}
            className="rounded-xl overflow-hidden mb-3"
            style={{ borderWidth: 1, borderColor: `${groupColor}30` }}
          >
            {exercise.image_url ? (
              <Image
                source={{ uri: exercise.image_url }}
                style={{ width: '100%', height: 180 }}
                contentFit="cover"
              />
            ) : (
              <View className="items-center justify-center bg-zinc-900" style={{ height: 180 }}>
                <Text className="text-zinc-600 text-4xl">💪</Text>
              </View>
            )}
          </TouchableOpacity>

          {/* Series detalladas */}
          <TouchableOpacity onPress={onEditSeries} activeOpacity={0.8}>
            <Text className="text-zinc-500 text-[9px] font-bold uppercase tracking-wider mb-2">
              SERIES ({seriesCount})
            </Text>
            <View className="flex-row flex-wrap gap-1.5">
              {(exercise.series || []).map((s, idx) => {
                const tc = typeConfig[s.type] || typeConfig.EFECTIVA;
                return (
                  <View
                    key={String(idx)}
                    className="rounded-lg px-2.5 py-2 items-center"
                    style={{
                      backgroundColor: tc.bg,
                      borderWidth: 1,
                      borderColor: tc.border,
                      minWidth: 52,
                    }}
                  >
                    <Text className="text-white font-bold text-sm">{String(s.reps || 0)}</Text>
                    <Text className="text-zinc-400 text-[8px] font-bold mt-0.5">
                      {s.weight > 0 ? `${s.weight}kg` : tc.label}
                    </Text>
                    {s.note ? (
                      <Text className="text-zinc-500 text-[7px] mt-0.5" numberOfLines={1}>
                        {s.note}
                      </Text>
                    ) : null}
                  </View>
                );
              })}
            </View>
            <Text className="text-zinc-600 text-[8px] font-mono mt-2">
              👆 Toca para editar series
            </Text>
          </TouchableOpacity>
        </Animated.View>
      )}
    </View>
  );
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================
export const FocusGroupView: React.FC<FocusGroupViewProps> = ({
  group,
  exercises,
  screenWidth,
  contentHeight,
  onEditSeries,
  spotifyMode = false,
}) => {
  const config = GROUP_TYPE_CONFIG[group.type];
  const isSuperset =
    exercises.length === 2 && (group.type === 'SUPERSET' || group.type === 'TRISET');
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  // Pulso animado del badge
  const pulseOpacity = useSharedValue(1);
  useEffect(() => {
    pulseOpacity.value = withRepeat(
      withSequence(
        withTiming(0.6, { duration: 1200, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );
  }, [pulseOpacity]);

  const pulseStyle = useAnimatedStyle(() => ({
    opacity: pulseOpacity.value,
  }));

  // Header height + rest bar height
  const HEADER_HEIGHT = 44;
  const REST_BAR_HEIGHT = 56;
  const bodyHeight = contentHeight - HEADER_HEIGHT - REST_BAR_HEIGHT;

  return (
    <View
      style={{
        width: screenWidth,
        height: contentHeight,
        backgroundColor: spotifyMode ? 'transparent' : '#000',
      }}
    >
      {/* ============ HEADER DEL GRUPO ============ */}
      <Animated.View
        entering={SlideInDown.duration(300)}
        className="flex-row items-center justify-between px-4"
        style={{
          height: HEADER_HEIGHT,
          backgroundColor: config.bgColor,
          borderBottomWidth: 2,
          borderBottomColor: config.color,
        }}
      >
        <View className="flex-row items-center gap-2">
          <Animated.View
            style={[
              {
                width: 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: config.color,
              },
              pulseStyle,
            ]}
          />
          <Text className="font-bold text-sm tracking-wider" style={{ color: config.color }}>
            {config.icon} {group.name || config.label}
          </Text>
          <Text className="text-zinc-500 text-[10px] font-mono">{exercises.length} ejercicios</Text>
        </View>
        {group.rounds && group.rounds > 1 ? (
          <View className="flex-row items-center gap-1.5">
            <RotateCcw size={12} color={config.color} />
            <Text className="font-mono font-bold text-xs" style={{ color: config.color }}>
              {group.rounds} rondas
            </Text>
          </View>
        ) : null}
      </Animated.View>

      {/* ============ BODY ============ */}
      {isSuperset ? (
        // ==================================================
        // SUPERSET: Split vertical — arriba / abajo
        // ==================================================
        <View style={{ height: bodyHeight }}>
          <SupersetSlot
            exercise={exercises[0]}
            width={screenWidth}
            height={bodyHeight / 2}
            groupColor={config.color}
            onEditSeries={() => onEditSeries(exercises[0].id)}
            position="top"
          />
          <SupersetSlot
            exercise={exercises[1]}
            width={screenWidth}
            height={bodyHeight / 2}
            groupColor={config.color}
            onEditSeries={() => onEditSeries(exercises[1].id)}
            position="bottom"
          />
        </View>
      ) : (
        // ==================================================
        // CIRCUIT / TRISET / GIANT_SET: Lista expandible
        // ==================================================
        <ScrollView
          style={{ height: bodyHeight }}
          contentContainerStyle={{ paddingBottom: 20 }}
          showsVerticalScrollIndicator={false}
        >
          {exercises.map((exercise, index) => (
            <CircuitExerciseRow
              key={exercise.id}
              exercise={exercise}
              index={index}
              total={exercises.length}
              groupColor={config.color}
              isExpanded={expandedIndex === index}
              onToggle={() => setExpandedIndex(expandedIndex === index ? null : index)}
              onEditSeries={() => onEditSeries(exercise.id)}
            />
          ))}
        </ScrollView>
      )}

      {/* ============ BARRA DE DESCANSOS ============ */}
      <View
        className="flex-row items-center justify-center gap-3 px-4"
        style={{
          height: REST_BAR_HEIGHT,
          backgroundColor: spotifyMode ? 'rgba(0,0,0,0.6)' : '#0a0a0a',
          borderTopWidth: 1,
          borderTopColor: '#1a1a1a',
        }}
      >
        {group.rest_between > 0 && (
          <CountdownTimer
            seconds={group.rest_between}
            label="entre ejercicios"
            color={config.color}
          />
        )}
        <CountdownTimer seconds={group.rest_after} label="entre rondas" color={config.color} />
      </View>
    </View>
  );
};
