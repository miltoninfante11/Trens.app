// ============================================================================
// DRAGGABLE EXERCISE CARD - Ejercicio con Drag & Drop y Swipe to Delete
// Implementación Web: Single DOM element con CSS transforms (igual que WorkoutBlock)
// ============================================================================

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { View, Text, Platform } from 'react-native';
import { Alert } from '../../lib/alert';
import { Image } from 'expo-image';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  runOnJS,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
import { Haptics } from '../../lib/haptics';
import { Trash2, GripVertical } from 'lucide-react-native';
import { useHankTarget } from '../../hooks/useHankTarget';
import { HankInlineHighlight } from '../hank/HankInlineHighlight';

// ============================================================================
// TYPES
// ============================================================================
interface SeriesConfig {
  id?: string;
  type: 'CALENTAMIENTO' | 'APROXIMACION' | 'EFECTIVA' | 'FALLO';
  reps: number | string;
  weight?: number | string;
  rest?: number;
  note?: string;
  notes?: string;
}

interface Exercise {
  id: string;
  name: string;
  image_url: string;
  video_url?: string;
  category?: string;
  series?: SeriesConfig[];
}

interface DraggableExerciseCardProps {
  exercise: Exercise;
  index: number;
  totalItems: number;
  onEdit: () => void;
  onDelete: () => void;
  onDragEnd: (newIndex: number) => void;
  onDragStart?: () => void;
  onDragCancel?: () => void;
  onPositionChange?: (targetIndex: number) => void;
  itemHeight?: number;
  // Selection mode for creating groups
  selectionMode?: boolean;
  isSelected?: boolean;
  onSelect?: () => void;
  groupColor?: string; // Color del grupo al que pertenece
}

// ============================================================================
// SERIES TYPE COLORS - ESPAÑOL
// ============================================================================
const TYPE_COLORS: Record<string, { bg: string; border: string; text: string; label: string }> = {
  CALENTAMIENTO: { bg: '#1e3a5f', border: '#3b82f6', text: '#60a5fa', label: 'C' },
  APROXIMACION: { bg: '#422006', border: '#f59e0b', text: '#fbbf24', label: 'A' },
  EFECTIVA: { bg: '#052e16', border: '#22c55e', text: '#4ade80', label: 'E' },
  FALLO: { bg: '#450a0a', border: '#ef4444', text: '#f87171', label: 'F' },
  WARMUP: { bg: '#1e3a5f', border: '#3b82f6', text: '#60a5fa', label: 'C' },
  FEEDER: { bg: '#422006', border: '#f59e0b', text: '#fbbf24', label: 'A' },
  EFFECTIVE: { bg: '#052e16', border: '#22c55e', text: '#4ade80', label: 'E' },
  INTENSITY: { bg: '#450a0a', border: '#ef4444', text: '#f87171', label: 'I' },
};

// ============================================================================
// CONSTANTS
// ============================================================================
const DELETE_THRESHOLD = -100;
const LONG_PRESS_DELAY = 300;
const AUTO_SCROLL_THRESHOLD = 80;
const AUTO_SCROLL_SPEED = 5;
const ITEM_HEIGHT_DEFAULT = 88;

// ============================================================================
// WEB DRAGGABLE COMPONENT
// Principios: Sin render condicional, mismo DOM siempre, CSS transforms
// ============================================================================
const WebDraggableExerciseCard: React.FC<DraggableExerciseCardProps> = ({
  exercise,
  index,
  totalItems,
  onEdit,
  onDelete,
  onDragEnd,
  onDragStart,
  onDragCancel,
  onPositionChange,
  itemHeight = ITEM_HEIGHT_DEFAULT,
  selectionMode = false,
  isSelected = false,
  onSelect,
  groupColor,
}) => {
  // Estado mínimo
  const [isDragging, setIsDragging] = useState(false);
  const [translateY, setTranslateY] = useState(0);
  const [translateX, setTranslateX] = useState(0);
  const [isHoveringHandle, setIsHoveringHandle] = useState(false);
  const [isSwiping, setIsSwiping] = useState(false);
  const [isSwipeOpen, setIsSwipeOpen] = useState(false); // Swipe abierto mostrando botón

  // Refs
  const containerRef = useRef<HTMLDivElement>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoScrollTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const isDraggingRef = useRef(false);
  const isScrollingRef = useRef(false); // Para distinguir scroll de drag
  const isLongPressPending = useRef(false); // Long-press timer activo
  const activePointerId = useRef<number | null>(null);
  const dragStartPointerY = useRef<number>(0);
  const dragStartIndex = useRef(index);
  const lastReportedIndex = useRef(index);
  const pressStartY = useRef(0);
  const pressStartX = useRef(0);
  const dragStartY = useRef(0);
  const currentPointerY = useRef(0);
  const currentPointerX = useRef(0);
  const scrollableParent = useRef<HTMLElement | null>(null);
  const initialScrollTop = useRef(0);
  const initialCompressionOffset = useRef(0);

  // Hank Target
  const { targetRef, onLayout, isHighlighted, animationPhase } = useHankTarget({
    id: `exercise-${exercise.id}`,
    type: 'exercise',
    label: exercise.name,
  });

  // CRÍTICO: Manejar touchmove para prevenir scroll nativo en móviles
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleTouchMove = (e: TouchEvent) => {
      // Si estamos arrastrando, prevenir scroll nativo SIEMPRE
      if (isDraggingRef.current) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      // Si hay long-press pendiente, verificar si el movimiento es pequeño
      if (isLongPressPending.current) {
        const touch = e.touches[0];
        if (touch) {
          const deltaX = Math.abs(touch.clientX - pressStartX.current);
          const deltaY = Math.abs(touch.clientY - pressStartY.current);
          // Si el movimiento es pequeño (< 20px), prevenir scroll para permitir long-press
          if (deltaX < 20 && deltaY < 20) {
            e.preventDefault();
            console.log(
              '[DraggableExerciseCard] TouchMove PREVENIDO - long-press pendiente, delta:',
              deltaX,
              deltaY
            );
          }
        }
      }
    };

    // passive: false es CRÍTICO para poder llamar preventDefault()
    container.addEventListener('touchmove', handleTouchMove, { passive: false });

    return () => {
      container.removeEventListener('touchmove', handleTouchMove);
    };
  }, []);

  // Encontrar scrollable parent
  const findScrollableParent = useCallback((): HTMLElement | null => {
    if (!containerRef.current) return null;
    const dataScroll = containerRef.current.closest('[data-scroll-container]') as HTMLElement;
    if (dataScroll) return dataScroll;
    let parent = containerRef.current.parentElement;
    while (parent) {
      const style = window.getComputedStyle(parent);
      if (style.overflowY === 'auto' || style.overflowY === 'scroll') {
        return parent;
      }
      parent = parent.parentElement;
    }
    return null;
  }, []);

  // Calcular índice objetivo
  const calculateTargetIndex = useCallback((): number => {
    if (!isDraggingRef.current) return index;
    const fingerMovement = currentPointerY.current - dragStartY.current;
    const scrollDelta = (scrollableParent.current?.scrollTop || 0) - initialScrollTop.current;
    const totalMovement = initialCompressionOffset.current + fingerMovement + scrollDelta;
    const positions = Math.round(totalMovement / itemHeight);
    const newIndex = dragStartIndex.current + positions;
    return Math.max(0, Math.min(totalItems - 1, newIndex));
  }, [index, totalItems, itemHeight]);

  // Actualizar translateY
  const updateTranslateY = useCallback(() => {
    const fingerMovement = currentPointerY.current - dragStartY.current;
    const scrollDelta = (scrollableParent.current?.scrollTop || 0) - initialScrollTop.current;
    setTranslateY(initialCompressionOffset.current + fingerMovement + scrollDelta);
  }, []);

  // Parar auto-scroll
  const stopAutoScroll = useCallback(() => {
    if (autoScrollTimer.current) {
      clearInterval(autoScrollTimer.current);
      autoScrollTimer.current = null;
    }
  }, []);

  // Iniciar auto-scroll
  const startAutoScroll = useCallback(() => {
    if (autoScrollTimer.current) return;
    autoScrollTimer.current = setInterval(() => {
      if (!isDraggingRef.current || !scrollableParent.current) {
        stopAutoScroll();
        return;
      }
      const pointerY = currentPointerY.current;
      const headerHeight = 140;
      const bottomPadding = 100;
      const topZone = headerHeight + AUTO_SCROLL_THRESHOLD;
      const bottomZone = window.innerHeight - bottomPadding - AUTO_SCROLL_THRESHOLD;

      const fingerMovement = Math.abs(pointerY - dragStartPointerY.current);
      const MIN_MOVEMENT_FOR_AUTOSCROLL = 30;
      if (fingerMovement < MIN_MOVEMENT_FOR_AUTOSCROLL) return;

      let scrollDelta = 0;
      if (pointerY < topZone && pointerY > headerHeight) {
        const intensity = 1 - (pointerY - headerHeight) / AUTO_SCROLL_THRESHOLD;
        scrollDelta = -AUTO_SCROLL_SPEED * Math.max(0.3, intensity);
      } else if (pointerY > bottomZone) {
        const intensity = (pointerY - bottomZone) / AUTO_SCROLL_THRESHOLD;
        scrollDelta = AUTO_SCROLL_SPEED * Math.max(0.3, intensity);
      }

      if (scrollDelta !== 0) {
        const oldScrollTop = scrollableParent.current.scrollTop;
        const maxScroll =
          scrollableParent.current.scrollHeight - scrollableParent.current.clientHeight;
        const newScrollTop = Math.max(0, Math.min(maxScroll, oldScrollTop + scrollDelta));
        scrollableParent.current.scrollTop = newScrollTop;
        if (scrollableParent.current.scrollTop !== oldScrollTop) {
          updateTranslateY();
          const targetIndex = calculateTargetIndex();
          if (targetIndex !== lastReportedIndex.current) {
            lastReportedIndex.current = targetIndex;
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            if (onPositionChange) onPositionChange(targetIndex);
          }
        }
      }
    }, 16);
  }, [calculateTargetIndex, onPositionChange, stopAutoScroll, updateTranslateY]);

  // Cleanup
  const cleanup = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    stopAutoScroll();
  }, [stopAutoScroll]);

  // Finalizar drag
  const finishDrag = useCallback(() => {
    if (!isDraggingRef.current) return;
    stopAutoScroll();
    const finalIndex = calculateTargetIndex();
    isDraggingRef.current = false;
    setIsDragging(false);
    setTranslateY(0);
    activePointerId.current = null;
    initialCompressionOffset.current = 0;

    if (finalIndex !== index) {
      onDragEnd(finalIndex);
    } else {
      if (onDragCancel) onDragCancel();
    }
  }, [calculateTargetIndex, index, onDragCancel, onDragEnd, stopAutoScroll]);

  // POINTER DOWN en el handle
  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (activePointerId.current !== null) {
        return;
      }
      activePointerId.current = e.pointerId;
      pressStartY.current = e.clientY;
      pressStartX.current = e.clientX;
      currentPointerY.current = e.clientY;
      currentPointerX.current = e.clientX;
      scrollableParent.current = findScrollableParent();
      dragStartIndex.current = index;
      lastReportedIndex.current = index;

      // Capturar pointer para recibir eventos de movimiento
      if (containerRef.current) {
        try {
          containerRef.current.setPointerCapture(e.pointerId);
        } catch {
          // Ignorar
        }
      }

      // Marcar que hay un long-press pendiente
      isLongPressPending.current = true;

      longPressTimer.current = setTimeout(() => {
        if (activePointerId.current !== e.pointerId) return;

        // Long-press completado
        isLongPressPending.current = false;
        isDraggingRef.current = true;
        setIsDragging(true);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        if (onDragStart) onDragStart();

        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            if (!containerRef.current) return;

            // Obtener posición del elemento
            const elementRect = containerRef.current.getBoundingClientRect();

            // DIFERENCIA CON PLAN: No hay compresión de tarjetas en gym
            // Por lo tanto, no necesitamos calcular offset de compresión
            // Solo necesitamos que el elemento siga al dedo desde su posición actual

            // El dedo está en currentPointerY.current
            // El elemento tiene su centro en elementRect.top + elementRect.height / 2
            // Pero como NO hay compresión, el offset inicial debe ser 0
            // El elemento ya está donde debe estar

            initialCompressionOffset.current = 0;
            dragStartY.current = currentPointerY.current;
            dragStartPointerY.current = currentPointerY.current;
            initialScrollTop.current = scrollableParent.current?.scrollTop || 0;

            // Empezar con translateY = 0 (el elemento ya está en su lugar)
            setTranslateY(0);
            startAutoScroll();
          });
        });
      }, LONG_PRESS_DELAY);
    },
    [index, findScrollableParent, onDragStart, startAutoScroll]
  );

  // POINTER MOVE
  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (activePointerId.current !== e.pointerId) return;
      currentPointerY.current = e.clientY;
      currentPointerX.current = e.clientX;

      // Si estamos arrastrando, actualizar posición (PRIORIDAD MÁXIMA)
      if (isDraggingRef.current) {
        updateTranslateY();
        const targetIndex = calculateTargetIndex();
        if (targetIndex !== lastReportedIndex.current) {
          lastReportedIndex.current = targetIndex;
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          if (onPositionChange) onPositionChange(targetIndex);
        }
        return;
      }

      // Si ya estamos haciendo scroll, continuar scroll
      if (isScrollingRef.current) {
        if (scrollableParent.current) {
          const deltaY = e.clientY - pressStartY.current;
          scrollableParent.current.scrollTop -= deltaY;
          pressStartY.current = e.clientY;
        }
        return;
      }

      // Si ya estamos haciendo swipe, continuar swipe
      if (isSwiping) {
        const deltaX = e.clientX - pressStartX.current;
        if (deltaX < 0) {
          setTranslateX(Math.max(deltaX, -150));
        }
        return;
      }

      // Detectar qué gesto está haciendo el usuario
      const deltaX = e.clientX - pressStartX.current;
      const deltaY = e.clientY - pressStartY.current;

      // SWIPE: Umbral bajo (15px) y ratio 2:1 para detectar fácilmente
      // Swipe horizontal (izquierda para eliminar)
      if (Math.abs(deltaX) > 15 && Math.abs(deltaX) > Math.abs(deltaY) * 2) {
        if (longPressTimer.current) {
          clearTimeout(longPressTimer.current);
          longPressTimer.current = null;
          isLongPressPending.current = false;
        }
        setIsSwiping(true);
        if (deltaX < 0) {
          setTranslateX(Math.max(deltaX, -120));
        }
        return;
      }

      // SCROLL: Umbral alto (50px) y ratio 4:1 para priorizar long-press
      // Scroll vertical - requiere movimiento muy vertical
      if (Math.abs(deltaY) > 50 && Math.abs(deltaY) > Math.abs(deltaX) * 4) {
        if (longPressTimer.current) {
          clearTimeout(longPressTimer.current);
          longPressTimer.current = null;
          isLongPressPending.current = false;
        }
        isScrollingRef.current = true;
        if (scrollableParent.current) {
          scrollableParent.current.scrollTop -= deltaY;
          pressStartY.current = e.clientY;
        }
        return;
      }
    },
    [calculateTargetIndex, onPositionChange, updateTranslateY, isSwiping]
  );

  // POINTER UP
  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      // SIEMPRE resetear el pointerId al final, sin importar qué pasó
      const currentPointerId = activePointerId.current;

      if (currentPointerId !== e.pointerId) {
        return;
      }

      // Limpiar timer de long-press primero
      if (longPressTimer.current) {
        clearTimeout(longPressTimer.current);
        longPressTimer.current = null;
      }
      isLongPressPending.current = false;

      if (containerRef.current) {
        try {
          containerRef.current.releasePointerCapture(e.pointerId);
        } catch {
          // Ignorar
        }
      }

      // Resetear estado de scroll
      isScrollingRef.current = false;

      // Si estaba haciendo swipe
      if (isSwiping) {
        setIsSwiping(false);
        // Si deslizó suficiente, mantener abierto mostrando el botón
        if (translateX < DELETE_THRESHOLD) {
          setTranslateX(-100); // Posición fija mostrando botón
          setIsSwipeOpen(true);
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        } else {
          // No deslizó suficiente, cerrar
          setTranslateX(0);
          setIsSwipeOpen(false);
        }
        activePointerId.current = null;
        return;
      }

      // Si el swipe estaba abierto y tocó en la tarjeta (no en el botón), cerrar
      if (isSwipeOpen) {
        setTranslateX(0);
        setIsSwipeOpen(false);
        activePointerId.current = null;
        return;
      }

      if (isDraggingRef.current) {
        finishDrag();
        // finishDrag ya resetea activePointerId, pero por si acaso
        activePointerId.current = null;
      } else {
        // Tap = seleccionar (si selectionMode) o editar
        const deltaX = Math.abs(e.clientX - pressStartX.current);
        const deltaY = Math.abs(e.clientY - pressStartY.current);
        if (deltaX < 10 && deltaY < 10) {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          if (selectionMode && onSelect) {
            onSelect();
          } else {
            onEdit();
          }
        }
        activePointerId.current = null;
      }

      console.log(
        '[DraggableExerciseCard] PointerUp completado, activePointerId:',
        activePointerId.current
      );
    },
    [finishDrag, isSwiping, translateX, exercise.name, onDelete, onEdit]
  );

  // POINTER CANCEL
  const handlePointerCancel = useCallback(
    (e: React.PointerEvent) => {
      handlePointerUp(e);
    },
    [handlePointerUp]
  );

  // Estilos del container - NO aplicar translateX aquí, va en la tarjeta
  const containerStyle: React.CSSProperties = {
    transform: isDragging ? `translateY(${translateY}px) scale(1.02)` : 'none',
    zIndex: isDragging ? 1000 : 1,
    position: 'relative',
    opacity: isDragging ? 0.95 : 1,
    boxShadow: isDragging ? '0 10px 40px rgba(249, 115, 22, 0.5)' : 'none',
    transition: isDragging ? 'none' : 'transform 0.2s ease-out',
    // IMPORTANTE: Solo bloquear touch-action cuando estamos arrastrando
    // Esto permite scroll vertical normal
    touchAction: isDragging ? 'none' : 'pan-y',
    userSelect: 'none',
    cursor: isDragging ? 'grabbing' : isHoveringHandle ? 'grab' : 'pointer',
  };

  // Estilos de la tarjeta principal - aquí va el translateX para swipe
  const cardStyle: React.CSSProperties = {
    transform: isSwiping || isSwipeOpen ? `translateX(${translateX}px)` : 'none',
    transition: isSwiping ? 'none' : 'transform 0.2s ease-out',
    backgroundColor: isSelected ? '#1a0a0a' : isDragging ? '#1a1a1a' : '#0a0a0a',
    borderWidth: isSelected ? 2 : isDragging ? 2 : 1,
    borderColor: isSelected ? groupColor || '#DC2626' : isDragging ? '#F97316' : '#27272a',
    borderRadius: 16,
    overflow: 'hidden',
    position: 'relative' as const,
  };

  const series = exercise.series || [];

  // handlePointerLeave - solo cancelar si NO estamos arrastrando
  // handlePointerLeave - solo cancelar si NO estamos arrastrando
  const handlePointerLeave = (e: React.PointerEvent) => {
    // Si estamos arrastrando, NO cancelar - el pointer capture mantiene los eventos
    if (isDraggingRef.current) {
      return;
    }
    // Solo cancelar si no estamos en drag activo
    handlePointerCancel(e);
  };

  return (
    <div
      ref={containerRef}
      style={containerStyle}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onPointerLeave={handlePointerLeave}
      onMouseEnter={() => setIsHoveringHandle(true)}
      onMouseLeave={() => setIsHoveringHandle(false)}
      className="mb-2 relative"
    >
      {/* DELETE BUTTON (detrás) */}
      <div
        className="absolute right-0 top-0 bottom-0 w-24 bg-red-600 rounded-2xl flex items-center justify-center"
        style={{
          opacity: isSwipeOpen ? 1 : Math.min(1, Math.abs(translateX) / 80),
          transform: `scale(${isSwipeOpen ? 1 : 0.8 + (Math.abs(translateX) / 100) * 0.2})`,
          pointerEvents: isSwipeOpen ? 'auto' : 'none',
          cursor: isSwipeOpen ? 'pointer' : 'default',
          zIndex: isSwipeOpen ? 10 : 0,
        }}
        onPointerDown={(e) => {
          if (!isSwipeOpen) return;
          e.stopPropagation();
        }}
        onPointerUp={(e) => {
          if (!isSwipeOpen) return;
          e.stopPropagation();
        }}
        onClick={(e) => {
          if (!isSwipeOpen) return;
          e.stopPropagation();
          e.preventDefault();
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
          Alert.alert('🗑️ Eliminar ejercicio', `¿Eliminar "${exercise.name}" de este día?`, [
            {
              text: 'Cancelar',
              style: 'cancel',
              onPress: () => {
                setTranslateX(0);
                setIsSwipeOpen(false);
              },
            },
            {
              text: 'Eliminar',
              style: 'destructive',
              onPress: () => {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                onDelete();
              },
            },
          ]);
        }}
      >
        <div className="flex flex-col items-center">
          <Trash2 size={24} color="#fff" />
          <Text className="text-white text-[10px] font-bold mt-1">ELIMINAR</Text>
        </div>
      </div>

      {/* MAIN CARD - con translateX para swipe */}
      <View ref={targetRef as any} onLayout={onLayout} style={cardStyle as any}>
        <HankInlineHighlight isActive={isHighlighted} phase={animationPhase} borderRadius={16} />
        <View className="flex-row items-center p-3">
          {/* SELECTION CHECKBOX */}
          {selectionMode && (
            <View
              className="mr-2 w-6 h-6 rounded-lg items-center justify-center"
              style={{
                backgroundColor: isSelected ? groupColor || '#DC2626' : 'transparent',
                borderWidth: 2,
                borderColor: isSelected ? groupColor || '#DC2626' : '#3f3f46',
              }}
            >
              {isSelected && <Text className="text-white text-xs font-bold">✓</Text>}
            </View>
          )}

          {/* DRAG HANDLE */}
          {!selectionMode && (
            <View className="mr-2 opacity-30">
              <GripVertical size={16} color="#71717a" />
            </View>
          )}

          {/* EXERCISE IMAGE */}
          <Image
            source={{ uri: exercise.image_url }}
            className="w-12 h-12 rounded-xl mr-3"
            contentFit="cover"
            style={{ borderWidth: 1, borderColor: '#27272a' }}
          />

          {/* EXERCISE INFO */}
          <View className="flex-1">
            <Text className="text-white font-bold text-sm mb-1" numberOfLines={1}>
              {exercise.name}
            </Text>

            {/* SERIES PILLS */}
            {series.length > 0 ? (
              <View className="flex-row flex-wrap gap-1">
                {series.map((s, idx) => {
                  const typeConfig = TYPE_COLORS[s.type] || TYPE_COLORS.EFECTIVA;
                  return (
                    <View
                      key={String(idx)}
                      className="rounded-md px-1.5 py-0.5 flex-row items-center gap-0.5"
                      style={{
                        backgroundColor: typeConfig.bg,
                        borderWidth: 1,
                        borderColor: typeConfig.border,
                      }}
                    >
                      <Text className="text-[8px] font-bold" style={{ color: typeConfig.text }}>
                        {typeConfig.label}
                      </Text>
                      <Text className="text-white text-[9px] font-mono">{s.reps}</Text>
                    </View>
                  );
                })}
              </View>
            ) : (
              <Text className="text-zinc-600 text-[10px]">Toca para configurar</Text>
            )}
          </View>

          {/* CHEVRON */}
          <View className="opacity-30">
            <Text className="text-zinc-500 text-lg">›</Text>
          </View>
        </View>
      </View>
    </div>
  );
};

// ============================================================================
// NATIVE DRAGGABLE COMPONENT (Original)
// ============================================================================
const NativeDraggableExerciseCard: React.FC<DraggableExerciseCardProps> = ({
  exercise,
  index,
  totalItems,
  onEdit,
  onDelete,
  onDragEnd,
  onDragStart,
  onDragCancel,
  onPositionChange,
  itemHeight = 88,
  selectionMode = false,
  isSelected = false,
  onSelect,
  groupColor,
}) => {
  // Drag states
  const translateY = useSharedValue(0);
  const scale = useSharedValue(1);
  const zIndex = useSharedValue(1);
  const isDraggingShared = useSharedValue(false);
  const [isDragging, setIsDragging] = useState(false);
  const lastReportedIndex = useSharedValue(index);

  // Swipe states
  const translateX = useSharedValue(0);
  const isSwipingShared = useSharedValue(false);

  // Hank Target
  const { targetRef, onLayout, isHighlighted, animationPhase } = useHankTarget({
    id: `exercise-${exercise.id}`,
    type: 'exercise',
    label: exercise.name,
  });

  const triggerHaptic = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
  };

  const triggerLightHaptic = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const setDraggingState = (value: boolean) => {
    setIsDragging(value);
  };

  const handleDragStart = () => {
    if (onDragStart) onDragStart();
  };

  const handleDragEnd = (newIndex: number) => {
    if (onDragCancel) onDragCancel();
    onDragEnd(newIndex);
  };

  const handleDragCancel = () => {
    if (onDragCancel) onDragCancel();
  };

  const reportPositionChange = (targetIndex: number) => {
    if (onPositionChange) onPositionChange(targetIndex);
  };

  const confirmDelete = () => {
    Alert.alert('🗑️ Eliminar ejercicio', `¿Eliminar "${exercise.name}" de este día?`, [
      {
        text: 'Cancelar',
        style: 'cancel',
        onPress: () => {
          translateX.value = withSpring(0);
        },
      },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: () => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          onDelete();
        },
      },
    ]);
  };

  // Pan gesture for reordering
  const panGesture = Gesture.Pan()
    .activateAfterLongPress(300)
    .onStart(() => {
      isDraggingShared.value = true;
      lastReportedIndex.value = index;
      zIndex.value = 9999;
      scale.value = withSpring(1.05, { damping: 15 });
      runOnJS(setDraggingState)(true);
      runOnJS(triggerHaptic)();
      runOnJS(handleDragStart)();
    })
    .onUpdate((event) => {
      translateY.value = event.translationY;
      const movedPositions = Math.round(event.translationY / itemHeight);
      let targetIndex = index + movedPositions;
      targetIndex = Math.max(0, Math.min(totalItems - 1, targetIndex));
      if (targetIndex !== lastReportedIndex.value) {
        lastReportedIndex.value = targetIndex;
        runOnJS(reportPositionChange)(targetIndex);
        runOnJS(triggerLightHaptic)();
      }
    })
    .onEnd((event) => {
      const movedPositions = Math.round(event.translationY / itemHeight);
      let newIndex = index + movedPositions;
      newIndex = Math.max(0, Math.min(totalItems - 1, newIndex));
      translateY.value = withSpring(0, { damping: 15, stiffness: 150 });
      scale.value = withSpring(1);
      zIndex.value = 1;
      isDraggingShared.value = false;
      runOnJS(setDraggingState)(false);
      if (newIndex !== index) {
        runOnJS(handleDragEnd)(newIndex);
      } else {
        runOnJS(handleDragCancel)();
      }
    })
    .onFinalize(() => {
      if (isDraggingShared.value) {
        translateY.value = withSpring(0, { damping: 15, stiffness: 150 });
        scale.value = withSpring(1);
        zIndex.value = 1;
        isDraggingShared.value = false;
        runOnJS(setDraggingState)(false);
        runOnJS(handleDragCancel)();
      }
    });

  // Swipe gesture for delete
  const swipeGesture = Gesture.Pan()
    .activeOffsetX([-10, 10])
    .failOffsetY([-5, 5])
    .onStart(() => {
      isSwipingShared.value = true;
    })
    .onUpdate((event) => {
      if (event.translationX < 0) {
        translateX.value = Math.max(event.translationX, -150);
      }
    })
    .onEnd((event) => {
      isSwipingShared.value = false;
      if (event.translationX < DELETE_THRESHOLD) {
        translateX.value = withTiming(-100);
        runOnJS(triggerHaptic)();
        runOnJS(confirmDelete)();
      } else {
        translateX.value = withSpring(0, { damping: 20 });
      }
    });

  // Tap gesture for edit or select
  const tapGesture = Gesture.Tap()
    .maxDuration(250)
    .onEnd(() => {
      if (!isSwipingShared.value && Math.abs(translateX.value) < 10) {
        runOnJS(triggerLightHaptic)();
        if (selectionMode && onSelect) {
          runOnJS(onSelect)();
        } else {
          runOnJS(onEdit)();
        }
      }
    });

  const composedGesture = Gesture.Race(panGesture, Gesture.Exclusive(swipeGesture, tapGesture));

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
    zIndex: zIndex.value,
  }));

  const deleteBackgroundStyle = useAnimatedStyle(() => ({
    opacity: interpolate(translateX.value, [0, DELETE_THRESHOLD], [0, 1], Extrapolation.CLAMP),
    transform: [
      {
        scale: interpolate(translateX.value, [0, DELETE_THRESHOLD], [0.8, 1], Extrapolation.CLAMP),
      },
    ],
  }));

  const wrapperAnimatedStyle = useAnimatedStyle(() => ({
    zIndex: zIndex.value,
    elevation: zIndex.value,
  }));

  const series = exercise.series || [];

  return (
    <Animated.View className="mb-2" style={[wrapperAnimatedStyle, { position: 'relative' }]}>
      {/* DELETE BACKGROUND */}
      <Animated.View
        style={[
          deleteBackgroundStyle,
          {
            position: 'absolute',
            right: 0,
            top: 0,
            bottom: 0,
            width: 100,
            backgroundColor: '#DC2626',
            borderRadius: 16,
            justifyContent: 'center',
            alignItems: 'center',
          },
        ]}
      >
        <Trash2 size={24} color="#fff" />
        <Text className="text-white text-[10px] font-bold mt-1">ELIMINAR</Text>
      </Animated.View>

      {/* MAIN CARD */}
      <GestureDetector gesture={composedGesture}>
        <Animated.View ref={targetRef} onLayout={onLayout} style={animatedStyle}>
          <HankInlineHighlight isActive={isHighlighted} phase={animationPhase} borderRadius={16} />
          <View
            className="rounded-2xl overflow-hidden"
            style={{
              backgroundColor: isSelected ? '#1a0a0a' : isDragging ? '#1a1a1a' : '#0a0a0a',
              borderWidth: isSelected ? 2 : isDragging ? 2 : 1,
              borderColor: isSelected
                ? groupColor || '#DC2626'
                : isDragging
                  ? '#F97316'
                  : '#27272a',
              shadowColor: isDragging ? '#F97316' : 'transparent',
              shadowOffset: { width: 0, height: isDragging ? 12 : 0 },
              shadowOpacity: isDragging ? 0.6 : 0,
              shadowRadius: isDragging ? 20 : 0,
              elevation: isDragging ? 20 : 0,
            }}
          >
            <View className="flex-row items-center p-3">
              {/* SELECTION CHECKBOX */}
              {selectionMode && (
                <View
                  className="mr-2 w-6 h-6 rounded-lg items-center justify-center"
                  style={{
                    backgroundColor: isSelected ? groupColor || '#DC2626' : 'transparent',
                    borderWidth: 2,
                    borderColor: isSelected ? groupColor || '#DC2626' : '#3f3f46',
                  }}
                >
                  {isSelected && <Text className="text-white text-xs font-bold">✓</Text>}
                </View>
              )}

              {/* DRAG HANDLE */}
              {!selectionMode && (
                <View className="mr-2 opacity-30">
                  <GripVertical size={16} color="#71717a" />
                </View>
              )}

              {/* EXERCISE IMAGE */}
              <Image
                source={{ uri: exercise.image_url }}
                className="w-12 h-12 rounded-xl mr-3"
                contentFit="cover"
                style={{ borderWidth: 1, borderColor: '#27272a' }}
              />

              {/* EXERCISE INFO */}
              <View className="flex-1">
                <Text className="text-white font-bold text-sm mb-1" numberOfLines={1}>
                  {exercise.name}
                </Text>

                {/* SERIES PILLS */}
                {series.length > 0 ? (
                  <View className="flex-row flex-wrap gap-1">
                    {series.map((s, idx) => {
                      const typeConfig = TYPE_COLORS[s.type] || TYPE_COLORS.EFECTIVA;
                      return (
                        <View
                          key={String(idx)}
                          className="rounded-md px-1.5 py-0.5 flex-row items-center gap-0.5"
                          style={{
                            backgroundColor: typeConfig.bg,
                            borderWidth: 1,
                            borderColor: typeConfig.border,
                          }}
                        >
                          <Text className="text-[8px] font-bold" style={{ color: typeConfig.text }}>
                            {typeConfig.label}
                          </Text>
                          <Text className="text-white text-[9px] font-mono">{s.reps}</Text>
                        </View>
                      );
                    })}
                  </View>
                ) : (
                  <Text className="text-zinc-600 text-[10px]">Toca para configurar</Text>
                )}
              </View>

              {/* CHEVRON */}
              <View className="opacity-30">
                <Text className="text-zinc-500 text-lg">›</Text>
              </View>
            </View>
          </View>
        </Animated.View>
      </GestureDetector>
    </Animated.View>
  );
};

// ============================================================================
// EXPORT
// ============================================================================
export const DraggableExerciseCard: React.FC<DraggableExerciseCardProps> = (props) => {
  if (Platform.OS === 'web') {
    return <WebDraggableExerciseCard {...props} />;
  }
  return <NativeDraggableExerciseCard {...props} />;
};
