// ============================================================================
// WORKOUT BLOCK - Bloque de Entrenamiento Flotante
// PRE + Rutina + POST, cada uno expande independientemente
// El drag se activa SOLO desde el header "BLOQUE ENTRENO"
// ============================================================================

import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, Pressable, ScrollView, Image, Platform } from 'react-native';
import { GestureDetector, GestureType } from 'react-native-gesture-handler';
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
  ChevronUp,
  ChevronDown,
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
  // Props para drag desde el header (Web)
  dragHandleProps?: {
    onPointerDown?: (e: React.PointerEvent) => void;
    onPointerEnter?: () => void;
    onPointerLeave?: () => void;
    style?: React.CSSProperties;
    isDragging?: boolean;
  };
  // Gesture para el header (Native)
  nativeGesture?: GestureType;
  // Callback para informar al padre del estado expandido/colapsado
  onBlockExpandedChange?: (expanded: boolean) => void;
  // Ref que el padre usa para triggear expand desde fuera (tap-to-expand en web)
  expandToggleRef?: React.MutableRefObject<(() => void) | null>;
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
// EXERCISE CARD - Muestra imagen o placeholder con nombre
// No usamos VideoPlayer para thumbnails para evitar crashes en Expo Go
// ============================================================================
interface ExerciseCardProps {
  exercise: Exercise;
  index: number;
  onPress?: () => void;
}

const ExerciseCard: React.FC<ExerciseCardProps> = ({ exercise, index: _index, onPress }) => {
  // Determinar si tenemos una imagen para mostrar
  const hasImage = !!exercise.imageUrl;
  const hasVideo = !!exercise.videoUrl;

  return (
    <Pressable onPress={onPress} className="mr-3 items-center active:scale-95">
      {/* Thumbnail */}
      <View className="w-20 h-20 bg-zinc-800 rounded-xl items-center justify-center border-2 border-red-500/40 overflow-hidden">
        {hasImage ? (
          <Image source={{ uri: exercise.imageUrl }} className="w-full h-full" resizeMode="cover" />
        ) : hasVideo ? (
          // Para videos sin imagen, mostrar placeholder con icono de play
          // Esto evita cargar VideoPlayer solo para thumbnail
          <View className="items-center justify-center w-full h-full bg-zinc-700">
            <View className="absolute">
              <Dumbbell size={24} color="#DC2626" />
            </View>
            <View className="absolute bottom-1 right-1 bg-black/60 rounded px-1">
              <Text className="text-white text-[8px] font-mono">▶</Text>
            </View>
          </View>
        ) : (
          <View className="items-center justify-center">
            <Dumbbell size={28} color="#DC2626" />
          </View>
        )}
      </View>
      {/* Exercise Name */}
      <Text
        className="text-zinc-300 text-[10px] text-center mt-1.5 font-medium w-20"
        numberOfLines={2}
      >
        {exercise.name}
      </Text>
    </Pressable>
  );
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
  nativeGesture,
  onBlockExpandedChange,
  expandToggleRef,
}) => {
  // ============================================================================
  // HOOKS - Siempre deben llamarse primero
  // ============================================================================
  const [blockExpanded, setBlockExpanded] = useState(false);
  const [preExpanded, setPreExpanded] = useState(false);
  const [postExpanded, setPostExpanded] = useState(false);

  const preProgress = useSharedValue(0);
  const postProgress = useSharedValue(0);

  // Notificar al padre del estado inicial y cambios
  const toggleBlockExpanded = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setBlockExpanded((prev) => {
      const newVal = !prev;
      onBlockExpandedChange?.(newVal);
      return newVal;
    });
  }, [onBlockExpandedChange]);

  // Exponer toggleBlockExpanded al padre via ref
  useEffect(() => {
    if (expandToggleRef) {
      expandToggleRef.current = toggleBlockExpanded;
    }
    return () => {
      if (expandToggleRef) {
        expandToggleRef.current = null;
      }
    };
  }, [expandToggleRef, toggleBlockExpanded]);

  // Notificar estado inicial al padre
  useEffect(() => {
    onBlockExpandedChange?.(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
                <ChevronUp size={18} color={isFirst ? '#666' : '#FFF'} />
              </Pressable>
              <Pressable
                onPress={handleMoveDown}
                disabled={isLast}
                className={`p-1 ${isLast ? 'opacity-20' : ''}`}
              >
                <ChevronDown size={18} color={isLast ? '#666' : '#FFF'} />
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
  // RENDER FULL - PREMIUM SAVAGE EDITION
  // ============================================================================

  // ============================================================================
  // VISTA COLAPSADA POR DEFECTO - Resumen compacto tocable + arrastrable
  // ============================================================================
  if (!blockExpanded) {
    // Contenido interno de la tarjeta colapsada (compartido entre web y native)
    const collapsedCardContent = (
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
          {/* PRE-WORKOUT Summary */}
          {data.preStack.length > 0 && (
            <View className="flex-row items-center gap-2 mb-3">
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
                    className="flex-row items-center gap-1 px-2 py-0.5 rounded-md shrink-0"
                    style={{ backgroundColor: 'rgba(220, 38, 38, 0.1)' }}
                  >
                    {getTypeIcon(item.type, '#DC2626')}
                    <Text className="text-zinc-400 text-[10px]" numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Text className="text-zinc-600 text-[9px] font-mono">{item.dose}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* ROUTINE NAME - Centro */}
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

          {/* POST-WORKOUT Summary */}
          {data.postStack.length > 0 && (
            <View className="flex-row items-center gap-2 mt-3">
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
                    className="flex-row items-center gap-1 px-2 py-0.5 rounded-md shrink-0"
                    style={{ backgroundColor: 'rgba(34, 197, 94, 0.08)' }}
                  >
                    {getTypeIcon(item.type, '#22C55E')}
                    <Text className="text-zinc-400 text-[10px]" numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Text className="text-zinc-600 text-[9px] font-mono">{item.dose}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Drag hint + expand hint */}
          <View className="flex-row items-center justify-center gap-2 mt-3 -mb-1">
            <GripHorizontal size={12} color="#52525B" />
            <Text className="text-zinc-600 text-[9px] font-bold tracking-widest uppercase">
              MANTÉN PARA MOVER
            </Text>
            <View className="w-px h-3 bg-zinc-700" />
            <ChevronDown size={14} color="#52525B" />
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
          // WEB: div con pointer events para drag + tap-to-expand via DraggableWorkoutBlock
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
            {collapsedCardContent}
          </div>
        ) : (
          // NATIVE: Pressable para tap-to-expand (el GestureDetector del padre maneja long-press)
          <Pressable onPress={toggleBlockExpanded} className="active:scale-[0.99]">
            {collapsedCardContent}
          </Pressable>
        )}
      </View>
    );
  }

  // ============================================================================
  // VISTA EXPANDIDA - Contenido completo (actual)
  // ============================================================================
  return (
    <View ref={targetRef} onLayout={onLayout} className="mb-6 ml-6">
      {/* Hank Inline Highlight */}
      <HankInlineHighlight isActive={isHighlighted} phase={animationPhase} borderRadius={16} />

      {/* Timeline dot - Premium workout marker */}
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
        {/* Control Handle - Premium - ZONA ARRASTRABLE */}
        {Platform.OS === 'web' ? (
          <div
            onPointerDown={dragHandleProps?.onPointerDown}
            onPointerEnter={dragHandleProps?.onPointerEnter}
            onPointerLeave={dragHandleProps?.onPointerLeave}
            style={{
              ...dragHandleProps?.style,
              display: 'flex',
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '12px 16px',
              backgroundColor: dragHandleProps?.isDragging
                ? 'rgba(220, 38, 38, 0.2)'
                : 'rgba(39, 39, 42, 0.6)',
              borderBottom: '1px solid rgba(220, 38, 38, 0.2)',
              transition: 'background-color 0.2s ease',
            }}
          >
            <View className="flex-row gap-2">
              <Pressable
                onPress={handleMoveUp}
                disabled={isFirst}
                className={`p-2 rounded-lg ${isFirst ? 'opacity-20' : ''}`}
                style={{ backgroundColor: isFirst ? 'transparent' : 'rgba(220, 38, 38, 0.1)' }}
              >
                <ChevronUp size={16} color={isFirst ? '#666' : '#DC2626'} />
              </Pressable>
              <Pressable
                onPress={handleMoveDown}
                disabled={isLast}
                className={`p-2 rounded-lg ${isLast ? 'opacity-20' : ''}`}
                style={{ backgroundColor: isLast ? 'transparent' : 'rgba(220, 38, 38, 0.1)' }}
              >
                <ChevronDown size={16} color={isLast ? '#666' : '#DC2626'} />
              </Pressable>
            </View>
            <View className="flex-row items-center gap-2">
              <View
                className="w-6 h-6 rounded-md items-center justify-center"
                style={{ backgroundColor: 'rgba(220, 38, 38, 0.15)' }}
              >
                <GripHorizontal size={12} color="#DC2626" />
              </View>
              <Text className="text-savage-red text-[10px] font-bold tracking-[2px] uppercase">
                ✊ MANTÉN PARA MOVER
              </Text>
            </View>
          </div>
        ) : nativeGesture ? (
          <GestureDetector gesture={nativeGesture}>
            <View
              className="flex-row justify-between items-center px-4 py-3"
              style={{
                backgroundColor: 'rgba(39, 39, 42, 0.6)',
                borderBottomWidth: 1,
                borderBottomColor: 'rgba(220, 38, 38, 0.2)',
              }}
            >
              <View className="flex-row gap-2">
                <Pressable
                  onPress={handleMoveUp}
                  disabled={isFirst}
                  className={`p-2 rounded-lg ${isFirst ? 'opacity-20' : ''}`}
                  style={{ backgroundColor: isFirst ? 'transparent' : 'rgba(220, 38, 38, 0.1)' }}
                >
                  <ChevronUp size={16} color={isFirst ? '#666' : '#DC2626'} />
                </Pressable>
                <Pressable
                  onPress={handleMoveDown}
                  disabled={isLast}
                  className={`p-2 rounded-lg ${isLast ? 'opacity-20' : ''}`}
                  style={{ backgroundColor: isLast ? 'transparent' : 'rgba(220, 38, 38, 0.1)' }}
                >
                  <ChevronDown size={16} color={isLast ? '#666' : '#DC2626'} />
                </Pressable>
              </View>
              <View className="flex-row items-center gap-2">
                <View
                  className="w-6 h-6 rounded-md items-center justify-center"
                  style={{ backgroundColor: 'rgba(220, 38, 38, 0.15)' }}
                >
                  <GripHorizontal size={12} color="#DC2626" />
                </View>
                <Text className="text-savage-red text-[10px] font-bold tracking-[2px] uppercase">
                  ✊ MANTÉN PARA MOVER
                </Text>
              </View>
            </View>
          </GestureDetector>
        ) : (
          <View
            className="flex-row justify-between items-center px-4 py-3"
            style={{
              backgroundColor: 'rgba(39, 39, 42, 0.6)',
              borderBottomWidth: 1,
              borderBottomColor: 'rgba(220, 38, 38, 0.2)',
            }}
          >
            <View className="flex-row gap-2">
              <Pressable
                onPress={handleMoveUp}
                disabled={isFirst}
                className={`p-2 rounded-lg ${isFirst ? 'opacity-20' : ''}`}
                style={{ backgroundColor: isFirst ? 'transparent' : 'rgba(220, 38, 38, 0.1)' }}
              >
                <ChevronUp size={16} color={isFirst ? '#666' : '#DC2626'} />
              </Pressable>
              <Pressable
                onPress={handleMoveDown}
                disabled={isLast}
                className={`p-2 rounded-lg ${isLast ? 'opacity-20' : ''}`}
                style={{ backgroundColor: isLast ? 'transparent' : 'rgba(220, 38, 38, 0.1)' }}
              >
                <ChevronDown size={16} color={isLast ? '#666' : '#DC2626'} />
              </Pressable>
            </View>
            <View className="flex-row items-center gap-2">
              <View
                className="w-6 h-6 rounded-md items-center justify-center"
                style={{ backgroundColor: 'rgba(220, 38, 38, 0.15)' }}
              >
                <GripHorizontal size={12} color="#DC2626" />
              </View>
              <Text className="text-savage-red text-[10px] font-bold tracking-[2px] uppercase">
                BLOQUE ENTRENO
              </Text>
            </View>
          </View>
        )}

        {/* Main Content */}
        <View className="p-4">
          {/* ============================================ */}
          {/* PRE-WORKOUT - Premium Style */}
          {/* ============================================ */}
          <Pressable
            onPress={togglePre}
            className="flex-row items-center gap-3 p-3 rounded-xl active:scale-[0.99]"
            style={{ backgroundColor: 'rgba(39, 39, 42, 0.5)' }}
          >
            <View
              className="w-10 h-10 rounded-xl items-center justify-center"
              style={{ backgroundColor: 'rgba(220, 38, 38, 0.2)' }}
            >
              <Zap size={18} color="#DC2626" />
            </View>
            <View className="flex-1">
              <Text className="text-savage-red font-bold text-xs tracking-wide">PRE-WORKOUT</Text>
              <Text className="text-zinc-400 text-[11px] mt-0.5" numberOfLines={1}>
                {data.preStack.length > 0
                  ? data.preStack.map((i) => i.name).join(', ')
                  : 'Sin suplementos configurados'}
              </Text>
            </View>
            <Animated.View style={preChevronStyle}>
              <ChevronRight size={16} color="#DC2626" />
            </Animated.View>
          </Pressable>

          {/* PRE Expanded Detail */}
          <Animated.View
            className="overflow-hidden rounded-xl mx-1 mt-2"
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
              {data.preStack.length === 0 && (
                <Text className="text-zinc-500 text-xs text-center py-3">
                  Sin suplementos pre-entreno
                </Text>
              )}
            </View>
          </Animated.View>

          {/* ============================================ */}
          {/* ROUTINE - Premium Slider */}
          {/* ============================================ */}
          <View
            className="my-4 py-4 -mx-4 px-4"
            style={{
              backgroundColor: 'rgba(24, 24, 27, 0.6)',
              borderTopWidth: 1,
              borderBottomWidth: 1,
              borderColor: 'rgba(220, 38, 38, 0.15)',
            }}
          >
            {/* Workout time estimation */}
            {data.estimatedTime && (
              <View className="flex-row items-center justify-between mb-3 px-1">
                <View className="flex-row items-center gap-2">
                  <Text className="text-zinc-600 text-[11px] font-mono">
                    ⏰ ~{data.estimatedTime}
                  </Text>
                  {data.isFasted && (
                    <View
                      className="px-2 py-0.5 rounded-md"
                      style={{ backgroundColor: 'rgba(234, 179, 8, 0.15)' }}
                    >
                      <Text className="text-yellow-500 text-[9px] font-bold tracking-wide">
                        EN AYUNAS
                      </Text>
                    </View>
                  )}
                </View>
                <Text className="text-zinc-700 text-[9px] font-mono">{data.timeDescription}</Text>
              </View>
            )}

            {/* Header con nombre de rutina */}
            <View className="flex-row items-center justify-between mb-3 px-1">
              <View className="flex-row items-center gap-3">
                <View
                  className="w-8 h-8 rounded-lg items-center justify-center"
                  style={{ backgroundColor: 'rgba(220, 38, 38, 0.15)' }}
                >
                  <Dumbbell size={16} color="#DC2626" />
                </View>
                <Text
                  className="text-xl text-white font-black uppercase tracking-tight"
                  style={{
                    textShadowColor: 'rgba(220, 38, 38, 0.3)',
                    textShadowOffset: { width: 0, height: 0 },
                    textShadowRadius: 8,
                  }}
                >
                  {data.routineName || 'DÍA DE DESCANSO'}
                </Text>
              </View>
              {/* Badge */}
              {hasExercises && !data.isExternalMode && (
                <View
                  className="px-3 py-1.5 rounded-lg"
                  style={{ backgroundColor: 'rgba(220, 38, 38, 0.1)' }}
                >
                  <Text className="text-savage-red text-[10px] font-mono font-bold">
                    {data.exercises!.length} EJERCICIOS
                  </Text>
                </View>
              )}
              {data.isExternalMode && data.routineName !== 'DESCANSO' && (
                <View
                  className="px-3 py-1.5 rounded-lg"
                  style={{ backgroundColor: 'rgba(168, 85, 247, 0.1)' }}
                >
                  <Text className="text-purple-400 text-[10px] font-mono font-bold">
                    PERSONALIZADO
                  </Text>
                </View>
              )}
            </View>

            {/* Modo GYM: Slider de ejercicios */}
            {hasExercises && !data.isExternalMode ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                className="mt-2"
                contentContainerStyle={{ paddingHorizontal: 4, paddingVertical: 4 }}
              >
                {data.exercises!.map((ex, index) => (
                  <ExerciseCard key={ex.id} exercise={ex} index={index} onPress={onPressRoutine} />
                ))}
              </ScrollView>
            ) : data.isExternalMode && data.routineName !== 'DESCANSO' ? (
              /* Modo PERSONALIZADO */
              <View className="items-center py-5">
                <Text className="text-zinc-600 text-xs font-mono text-center mb-3">
                  Tu entrenamiento personalizado
                </Text>
                <Pressable onPress={onPressRoutine} className="active:scale-95">
                  <View
                    className="flex-row items-center gap-2 px-5 py-2.5 rounded-xl"
                    style={{ backgroundColor: 'rgba(168, 85, 247, 0.1)' }}
                  >
                    <Dumbbell size={14} color="#a855f7" />
                    <Text className="text-purple-400 text-xs font-bold tracking-wide">
                      AGREGAR EJERCICIOS
                    </Text>
                  </View>
                </Pressable>
              </View>
            ) : (
              <Pressable onPress={onPressRoutine} className="items-center py-5 active:scale-95">
                <View
                  className="flex-row items-center gap-2 px-5 py-2.5 rounded-xl"
                  style={{ backgroundColor: 'rgba(220, 38, 38, 0.1)' }}
                >
                  <Dumbbell size={14} color="#DC2626" />
                  <Text className="text-savage-red text-xs font-bold tracking-wide">
                    CONFIGURAR RUTINA
                  </Text>
                </View>
              </Pressable>
            )}
          </View>

          {/* ============================================ */}
          {/* POST-WORKOUT - Premium Style */}
          {/* ============================================ */}
          <Pressable
            onPress={togglePost}
            className="flex-row items-center gap-3 p-3 rounded-xl active:scale-[0.99]"
            style={{ backgroundColor: 'rgba(39, 39, 42, 0.5)' }}
          >
            <View
              className="w-10 h-10 rounded-xl items-center justify-center"
              style={{ backgroundColor: 'rgba(34, 197, 94, 0.2)' }}
            >
              <Flame size={18} color="#22C55E" />
            </View>
            <View className="flex-1">
              <Text className="text-green-500 font-bold text-xs tracking-wide">POST-WORKOUT</Text>
              <Text className="text-zinc-400 text-[11px] mt-0.5" numberOfLines={1}>
                {data.postStack.length > 0
                  ? data.postStack.map((i) => i.name).join(', ')
                  : 'Sin suplementos configurados'}
              </Text>
            </View>
            <Animated.View style={postChevronStyle}>
              <ChevronRight size={16} color="#22C55E" />
            </Animated.View>
          </Pressable>

          {/* POST Expanded Detail */}
          <Animated.View
            className="overflow-hidden rounded-xl mx-1 mt-2"
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
              {data.postStack.length === 0 && (
                <Text className="text-zinc-500 text-xs text-center py-3">
                  Sin suplementos post-entreno
                </Text>
              )}
            </View>
          </Animated.View>

          {/* ============================================ */}
          {/* COLLAPSE BUTTON */}
          {/* ============================================ */}
          <Pressable
            onPress={toggleBlockExpanded}
            className="items-center pt-3 pb-1 active:opacity-70"
          >
            <View className="flex-row items-center gap-1.5">
              <ChevronUp size={14} color="#52525B" />
              <Text className="text-zinc-600 text-[10px] font-bold tracking-wider uppercase">
                COLAPSAR
              </Text>
              <ChevronUp size={14} color="#52525B" />
            </View>
          </Pressable>
        </View>
      </View>
    </View>
  );
};

export default WorkoutBlock;
