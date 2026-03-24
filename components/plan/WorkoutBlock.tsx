// ============================================================================
// WORKOUT BLOCK - Bloque de Entrenamiento Flotante
// PRE + Rutina + POST, cada sección expande inline al tocar
// El drag se activa SOLO con long-press
// ============================================================================

import React, { useState, useCallback } from 'react';
import { View, Text, Pressable, Platform } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  interpolate,
} from 'react-native-reanimated';
import * as Haptics from '../../lib/haptics';
import {
  Zap,
  Flame,
  ChevronRight,
  GripHorizontal,
  Pill,
  Syringe,
  FlaskConical,
  Droplets,
  Dumbbell,
} from 'lucide-react-native';
import { useHankTarget } from '../../hooks/useHankTarget';
import { HankInlineHighlight } from '../hank/HankInlineHighlight';

// ============================================================================
// TYPES
// ============================================================================
interface StackItem {
  id: string;
  name: string;
  dose: string;
  type: 'pill' | 'syringe' | 'powder' | 'liquid';
  notes?: string;
}

interface Exercise {
  id: string;
  name: string;
  imageUrl?: string;
  videoUrl?: string;
  sets?: number;
  reps?: string;
}

interface WorkoutBlockData {
  id: string;
  routineName: string;
  preStack: StackItem[];
  postStack: StackItem[];
  exercises?: Exercise[];
  isExternalMode?: boolean; // True si usa modo personalizado (sin ejercicios detallados)
  // Workout time estimation
  estimatedTime?: string | null;
  isFasted?: boolean;
  timeDescription?: string;
}

interface WorkoutBlockProps {
  data: WorkoutBlockData;
  onMoveUp: () => void;
  onMoveDown: () => void;
  isFirst: boolean;
  isLast: boolean;
  onPressRoutine?: () => void;
  isCompressed?: boolean;
  // Props para drag desde el handle (Web)
  dragHandleProps?: {
    onPointerDown?: (e: React.PointerEvent) => void;
    onPointerEnter?: () => void;
    onPointerLeave?: () => void;
    style?: React.CSSProperties;
    isDragging?: boolean;
  };
}

// ============================================================================
// HELPERS
// ============================================================================
const getTypeIcon = (type: string, color: string) => {
  const iconProps = { size: 14, color };
  switch (type) {
    case 'pill':
      return <Pill {...iconProps} />;
    case 'syringe':
      return <Syringe {...iconProps} />;
    case 'liquid':
      return <Droplets {...iconProps} />;
    case 'powder':
      return <FlaskConical {...iconProps} />;
    default:
      return <Zap {...iconProps} />;
  }
};

// ============================================================================
// COMPONENT
// ============================================================================
export const WorkoutBlock: React.FC<WorkoutBlockProps> = ({
  data,
  onMoveUp,
  onMoveDown,
  isFirst,
  isLast,
  onPressRoutine,
  isCompressed = false,
  dragHandleProps,
}) => {
  // ============================================================================
  // HOOKS
  // ============================================================================
  const [preExpanded, setPreExpanded] = useState(false);
  const [postExpanded, setPostExpanded] = useState(false);

  const preProgress = useSharedValue(0);
  const postProgress = useSharedValue(0);

  // Hank Target - Registrar este bloque como target para animaciones
  const { targetRef, onLayout, isHighlighted, animationPhase } = useHankTarget({
    id: `workout-${data.id}`,
    type: 'custom',
    label: data.routineName,
  });

  // Altura dinámica: 72px por item (p-3 + gap + contenido) + 32px padding contenedor
  const preHeight = Math.max(data.preStack.length * 72 + 32, 100);
  const postHeight = Math.max(data.postStack.length * 72 + 32, 100);

  const preExpandedStyle = useAnimatedStyle(() => ({
    height: interpolate(preProgress.value, [0, 1], [0, preHeight]),
    opacity: preProgress.value,
    marginTop: interpolate(preProgress.value, [0, 1], [0, 8]),
  }));

  const postExpandedStyle = useAnimatedStyle(() => ({
    height: interpolate(postProgress.value, [0, 1], [0, postHeight]),
    opacity: postProgress.value,
    marginTop: interpolate(postProgress.value, [0, 1], [0, 8]),
  }));

  const preChevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${interpolate(preProgress.value, [0, 1], [0, 90])}deg` }],
  }));

  const postChevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${interpolate(postProgress.value, [0, 1], [0, 90])}deg` }],
  }));

  // ============================================================================
  // MODO COMPRIMIDO - PREMIUM SAVAGE
  // ============================================================================
  if (isCompressed) {
    return (
      <View className="mb-3 ml-6">
        {/* Timeline dot for workout */}
        <View
          className="absolute -left-[14px] top-5 w-4 h-4 rounded-full border-2 border-zinc-900 z-10"
          style={{
            backgroundColor: '#DC2626',
            shadowColor: '#DC2626',
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: 1,
            shadowRadius: 10,
          }}
        />
        <View
          className="rounded-2xl px-4 py-4 flex-row items-center justify-between"
          style={{
            backgroundColor: 'rgba(39, 39, 42, 0.7)',
            borderWidth: 1.5,
            borderColor: 'rgba(220, 38, 38, 0.4)',
            shadowColor: '#DC2626',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.25,
            shadowRadius: 20,
            elevation: 10,
          }}
        >
          <View className="flex-row items-center gap-3">
            <View
              className="w-10 h-10 rounded-xl items-center justify-center"
              style={{ backgroundColor: 'rgba(220, 38, 38, 0.2)' }}
            >
              <Dumbbell size={18} color="#DC2626" />
            </View>
            <View>
              <Text className="text-savage-red text-[10px] font-bold tracking-[2px] uppercase">
                BLOQUE ENTRENO
              </Text>
              <Text className="text-white font-black text-base tracking-tight">
                {data.routineName}
              </Text>
            </View>
          </View>
          <View
            className="px-3 py-2 rounded-xl"
            style={{ backgroundColor: 'rgba(220, 38, 38, 0.15)' }}
          >
            <Text className="text-savage-red text-xs font-mono font-bold">
              {data.exercises?.length || 0} ejercicios
            </Text>
          </View>
        </View>
      </View>
    );
  }

  const togglePre = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const newState = !preExpanded;
    setPreExpanded(newState);
    preProgress.value = withTiming(newState ? 1 : 0, { duration: 200 });
  };

  const togglePost = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const newState = !postExpanded;
    setPostExpanded(newState);
    postProgress.value = withTiming(newState ? 1 : 0, { duration: 200 });
  };

  const handleMoveUp = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onMoveUp();
  };

  const handleMoveDown = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onMoveDown();
  };

  const hasExercises = data.exercises && data.exercises.length > 0;
  const isRestDay = data.routineName === 'DESCANSO' && !hasExercises;

  // ============================================================================
  // MODO DESCANSO - Sin ejercicios asignados
  // ============================================================================
  if (isRestDay) {
    return (
      <View ref={targetRef} onLayout={onLayout} className="mb-6">
        <HankInlineHighlight isActive={isHighlighted} phase={animationPhase} borderRadius={0} />
        <View className="bg-[#1a1a1a] border-y-2 border-zinc-700/50 shadow-lg">
          {/* Control Handle */}
          <View className="flex-row justify-between items-center bg-zinc-800/30 px-4 py-2 border-b border-white/5">
            <View className="flex-row gap-3">
              <Pressable
                onPress={handleMoveUp}
                disabled={isFirst}
                className={`p-1 ${isFirst ? 'opacity-20' : ''}`}
              >
                <ChevronRight
                  size={18}
                  color={isFirst ? '#666' : '#FFF'}
                  style={{ transform: [{ rotate: '-90deg' }] }}
                />
              </Pressable>
              <Pressable
                onPress={handleMoveDown}
                disabled={isLast}
                className={`p-1 ${isLast ? 'opacity-20' : ''}`}
              >
                <ChevronRight
                  size={18}
                  color={isLast ? '#666' : '#FFF'}
                  style={{ transform: [{ rotate: '90deg' }] }}
                />
              </Pressable>
            </View>
            <View className="flex-row items-center gap-1">
              <GripHorizontal size={14} color="#71717A" />
              <Text className="text-zinc-500 text-xs font-bold tracking-widest uppercase">
                BLOQUE ENTRENO
              </Text>
            </View>
          </View>

          {/* Rest Day Content */}
          <View className="p-4 flex-row items-center justify-between">
            <View className="flex-row items-center gap-2">
              <Text className="text-xl text-white font-black italic uppercase tracking-tight">
                DESCANSO
              </Text>
              <Text className="text-xl">😴</Text>
            </View>
            <Pressable
              onPress={onPressRoutine}
              className="px-4 py-2 rounded-xl active:scale-95"
              style={{ backgroundColor: 'rgba(161, 161, 170, 0.1)' }}
            >
              <Text className="text-zinc-400 text-xs font-bold tracking-wide">CONFIGURAR</Text>
            </Pressable>
          </View>
        </View>
      </View>
    );
  }

  // ============================================================================
  // RENDER - Vista única con PRE/POST expandibles inline
  // ============================================================================

  const cardContent = (
    <View
      className="rounded-2xl overflow-hidden"
      style={{
        backgroundColor: 'rgba(24, 24, 27, 0.95)',
        borderWidth: 1,
        borderColor: 'rgba(220, 38, 38, 0.3)',
        shadowColor: '#DC2626',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 24,
      }}
    >
      <View className="p-4">
        {/* ============================================ */}
        {/* PRE-WORKOUT - Pressable para expandir detalle */}
        {/* ============================================ */}
        {data.preStack.length > 0 && (
          <View>
            <Pressable
              onPress={togglePre}
              className="flex-row items-center gap-2 mb-1 active:opacity-80"
            >
              <View
                className="w-7 h-7 rounded-lg items-center justify-center"
                style={{ backgroundColor: 'rgba(220, 38, 38, 0.15)' }}
              >
                <Zap size={14} color="#DC2626" />
              </View>
              <Text className="text-savage-red text-[10px] font-bold tracking-wider uppercase">
                PRE
              </Text>
              <View className="flex-1 flex-row flex-wrap gap-1.5">
                {data.preStack.map((item) => (
                  <View
                    key={item.id}
                    className="flex-row items-center gap-1 px-2 py-1 rounded-md shrink-0"
                    style={{ backgroundColor: 'rgba(220, 38, 38, 0.1)' }}
                  >
                    {getTypeIcon(item.type, '#DC2626')}
                    <View>
                      <Text className="text-zinc-400 text-[10px]" numberOfLines={1}>
                        {item.name}
                      </Text>
                      <Text className="text-zinc-600 text-[9px] font-mono">{item.dose}</Text>
                    </View>
                  </View>
                ))}
              </View>
              <Animated.View style={preChevronStyle}>
                <ChevronRight size={14} color="#DC2626" />
              </Animated.View>
            </Pressable>

            {/* PRE Expanded Detail */}
            <Animated.View
              className="overflow-hidden rounded-xl mx-1"
              style={[preExpandedStyle, { backgroundColor: 'rgba(39, 39, 42, 0.3)' }]}
            >
              <View className="p-3">
                {data.preStack.map((item) => (
                  <View
                    key={item.id}
                    className="flex-row items-center gap-3 p-3 rounded-xl mb-2"
                    style={{ backgroundColor: 'rgba(24, 24, 27, 0.6)' }}
                  >
                    <View className="bg-red-500/25 p-1.5 rounded">
                      {getTypeIcon(item.type, '#DC2626')}
                    </View>
                    <View className="flex-1">
                      <Text className="text-white text-sm font-medium">{item.name}</Text>
                      <Text className="text-savage-red text-xs font-mono">{item.dose}</Text>
                    </View>
                    {item.notes && (
                      <Text
                        className="text-zinc-500 text-[10px] italic max-w-[80px]"
                        numberOfLines={1}
                      >
                        {item.notes}
                      </Text>
                    )}
                  </View>
                ))}
              </View>
            </Animated.View>
          </View>
        )}

        {/* ============================================ */}
        {/* ROUTINE NAME - Centro */}
        {/* ============================================ */}
        <Pressable onPress={onPressRoutine} className="active:opacity-80">
          <View
            className="flex-row items-center justify-between py-3"
            style={{
              borderTopWidth: data.preStack.length > 0 ? 1 : 0,
              borderBottomWidth: data.postStack.length > 0 ? 1 : 0,
              borderColor: 'rgba(220, 38, 38, 0.12)',
            }}
          >
            <View className="flex-row items-center gap-3">
              <View
                className="w-9 h-9 rounded-xl items-center justify-center"
                style={{ backgroundColor: 'rgba(220, 38, 38, 0.15)' }}
              >
                <Dumbbell size={18} color="#DC2626" />
              </View>
              <View>
                <Text
                  className="text-white font-black text-lg uppercase tracking-tight"
                  style={{
                    textShadowColor: 'rgba(220, 38, 38, 0.3)',
                    textShadowOffset: { width: 0, height: 0 },
                    textShadowRadius: 8,
                  }}
                >
                  {data.routineName || 'DÍA DE DESCANSO'}
                </Text>
                {data.estimatedTime && (
                  <View className="flex-row items-center gap-2 mt-0.5">
                    <Text className="text-zinc-600 text-[10px] font-mono">
                      ⏰ ~{data.estimatedTime}
                    </Text>
                    {data.isFasted && (
                      <Text className="text-yellow-500 text-[9px] font-bold">EN AYUNAS</Text>
                    )}
                  </View>
                )}
              </View>
            </View>
            <View className="flex-row items-center gap-2">
              {hasExercises && !data.isExternalMode && (
                <View
                  className="px-2.5 py-1 rounded-lg"
                  style={{ backgroundColor: 'rgba(220, 38, 38, 0.1)' }}
                >
                  <Text className="text-savage-red text-[10px] font-mono font-bold">
                    {data.exercises!.length} EJ
                  </Text>
                </View>
              )}
              {data.isExternalMode && data.routineName !== 'DESCANSO' && (
                <View
                  className="px-2.5 py-1 rounded-lg"
                  style={{ backgroundColor: 'rgba(168, 85, 247, 0.1)' }}
                >
                  <Text className="text-purple-400 text-[9px] font-mono font-bold">CUSTOM</Text>
                </View>
              )}
            </View>
          </View>
        </Pressable>

        {/* ============================================ */}
        {/* POST-WORKOUT - Pressable para expandir detalle */}
        {/* ============================================ */}
        {data.postStack.length > 0 && (
          <View>
            <Pressable
              onPress={togglePost}
              className="flex-row items-center gap-2 mt-1 active:opacity-80"
            >
              <View
                className="w-7 h-7 rounded-lg items-center justify-center"
                style={{ backgroundColor: 'rgba(34, 197, 94, 0.15)' }}
              >
                <Flame size={14} color="#22C55E" />
              </View>
              <Text className="text-green-500 text-[10px] font-bold tracking-wider uppercase">
                POST
              </Text>
              <View className="flex-1 flex-row flex-wrap gap-1.5">
                {data.postStack.map((item) => (
                  <View
                    key={item.id}
                    className="flex-row items-center gap-1 px-2 py-1 rounded-md shrink-0"
                    style={{ backgroundColor: 'rgba(34, 197, 94, 0.08)' }}
                  >
                    {getTypeIcon(item.type, '#22C55E')}
                    <View>
                      <Text className="text-zinc-400 text-[10px]" numberOfLines={1}>
                        {item.name}
                      </Text>
                      <Text className="text-zinc-600 text-[9px] font-mono">{item.dose}</Text>
                    </View>
                  </View>
                ))}
              </View>
              <Animated.View style={postChevronStyle}>
                <ChevronRight size={14} color="#22C55E" />
              </Animated.View>
            </Pressable>

            {/* POST Expanded Detail */}
            <Animated.View
              className="overflow-hidden rounded-xl mx-1"
              style={[postExpandedStyle, { backgroundColor: 'rgba(39, 39, 42, 0.3)' }]}
            >
              <View className="p-3">
                {data.postStack.map((item) => (
                  <View
                    key={item.id}
                    className="flex-row items-center gap-3 p-3 rounded-xl mb-2"
                    style={{ backgroundColor: 'rgba(24, 24, 27, 0.6)' }}
                  >
                    <View
                      className="w-8 h-8 rounded-lg items-center justify-center"
                      style={{ backgroundColor: 'rgba(34, 197, 94, 0.25)' }}
                    >
                      {getTypeIcon(item.type, '#22C55E')}
                    </View>
                    <View className="flex-1">
                      <Text className="text-white text-sm font-medium">{item.name}</Text>
                      <Text className="text-green-500 text-xs font-mono">{item.dose}</Text>
                    </View>
                    {item.notes && (
                      <Text
                        className="text-zinc-500 text-[10px] italic max-w-[80px]"
                        numberOfLines={1}
                      >
                        {item.notes}
                      </Text>
                    )}
                  </View>
                ))}
              </View>
            </Animated.View>
          </View>
        )}

        {/* Drag hint */}
        <View className="flex-row items-center justify-center gap-2 mt-3 -mb-1">
          <GripHorizontal size={12} color="#52525B" />
          <Text className="text-zinc-600 text-[9px] font-bold tracking-widest uppercase">
            MANTÉN PARA MOVER
          </Text>
        </View>
      </View>
    </View>
  );

  return (
    <View ref={targetRef} onLayout={onLayout} className="mb-6 ml-6">
      <HankInlineHighlight isActive={isHighlighted} phase={animationPhase} borderRadius={16} />

      {/* Timeline dot */}
      <View
        className="absolute -left-[14px] top-6 w-4 h-4 rounded-full border-2 border-zinc-900 z-10"
        style={{
          backgroundColor: '#DC2626',
          shadowColor: '#DC2626',
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: 1,
          shadowRadius: 10,
        }}
      />

      {Platform.OS === 'web' && dragHandleProps ? (
        <div
          onPointerDown={dragHandleProps.onPointerDown}
          onPointerEnter={dragHandleProps.onPointerEnter}
          onPointerLeave={dragHandleProps.onPointerLeave}
          style={{
            ...dragHandleProps.style,
            cursor: dragHandleProps.isDragging ? 'grabbing' : 'grab',
            touchAction: 'none',
          }}
        >
          {cardContent}
        </div>
      ) : (
        <View>{cardContent}</View>
      )}
    </View>
  );
};

export default WorkoutBlock;
