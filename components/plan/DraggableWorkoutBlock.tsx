// ============================================================================
// DRAGGABLE WORKOUT BLOCK - Implementación Profesional
// Patrón usado: Single DOM element con CSS transforms
// El drag se activa con long-press en el header "BLOQUE ENTRENO"
// ============================================================================

import React, { useState, useRef, useEffect, useCallback, RefObject } from 'react';
import { Platform, ScrollView, Dimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  runOnJS,
} from 'react-native-reanimated';
import { Haptics } from '../../lib/haptics';
import { WorkoutBlock } from './WorkoutBlock';

// Constantes
const AUTO_SCROLL_THRESHOLD = 80;
const AUTO_SCROLL_SPEED = 5; // Reducido de 8 para scroll más suave
const LONG_PRESS_DELAY = 400;
const ITEM_HEIGHT_COMPRESSED = 85;
const { height: SCREEN_HEIGHT } = Dimensions.get('window');

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
  estimatedTime?: string | null;
  isFasted?: boolean;
  timeDescription?: string;
}

interface DraggableWorkoutBlockProps {
  data: WorkoutBlockData;
  currentIndex: number;
  totalItems: number;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDragEnd: (newIndex: number) => void;
  onDragStart?: () => void;
  onDragCancel?: () => void;
  onPositionChange?: (targetIndex: number) => void;
  onPressRoutine?: () => void;
  itemHeight?: number;
  scrollRef?: RefObject<ScrollView | null>;
}

// ============================================================================
// WEB DRAGGABLE COMPONENT
// Principios: Sin render condicional, mismo DOM siempre, CSS transforms
// ============================================================================
const WebDraggableWorkoutBlock: React.FC<DraggableWorkoutBlockProps> = ({
  data,
  currentIndex,
  totalItems,
  onMoveUp,
  onMoveDown,
  onDragEnd,
  onDragStart,
  onDragCancel,
  onPositionChange,
  onPressRoutine,
}) => {
  // Estado mínimo
  const [isDragging, setIsDragging] = useState(false);
  const [translateY, setTranslateY] = useState(0);
  const [isHoveringHandle, setIsHoveringHandle] = useState(false);

  // Refs - Nunca cambian durante el ciclo de vida del componente
  const containerRef = useRef<HTMLDivElement>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoScrollTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const isDraggingRef = useRef(false);
  const activePointerId = useRef<number | null>(null);
  const dragStartPointerY = useRef<number>(0);
  const dragStartIndex = useRef(currentIndex);
  const lastReportedIndex = useRef(currentIndex);
  const pressStartY = useRef(0);
  const dragStartY = useRef(0);

  // Refs para vista colapsada: tap-to-expand + drag awareness
  const isBlockCollapsedRef = useRef(true);
  const expandToggleRef = useRef<(() => void) | null>(null);

  const handleBlockExpandedChange = useCallback((expanded: boolean) => {
    isBlockCollapsedRef.current = !expanded;
  }, []);
  const currentPointerY = useRef(0);
  const scrollableParent = useRef<HTMLElement | null>(null);
  const initialScrollTop = useRef(0);
  const initialCompressionOffset = useRef(0); // Offset inicial por compresión de tarjetas anteriores

  // Sincronizar cuando cambia el índice (solo si no estamos arrastrando)
  useEffect(() => {
    if (!isDraggingRef.current) {
      dragStartIndex.current = currentIndex;
      lastReportedIndex.current = currentIndex;
    }
  }, [currentIndex]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (longPressTimer.current) clearTimeout(longPressTimer.current);
      if (autoScrollTimer.current) clearInterval(autoScrollTimer.current);
    };
  }, []);

  // Encontrar scrollable parent
  const findScrollableParent = useCallback((): HTMLElement | null => {
    if (!containerRef.current) return null;

    // Buscar por data attribute primero
    const dataScroll = containerRef.current.closest('[data-scroll-container]') as HTMLElement;
    if (dataScroll) return dataScroll;

    // Buscar por overflow
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
    if (!isDraggingRef.current) return currentIndex;

    const fingerMovement = currentPointerY.current - dragStartY.current;
    const scrollDelta = (scrollableParent.current?.scrollTop || 0) - initialScrollTop.current;
    // IMPORTANTE: Incluir el offset de compresión para que las tarjetas
    // reaccionen a la posición VISUAL del bloque (donde está el dedo)
    const totalMovement = initialCompressionOffset.current + fingerMovement + scrollDelta;

    const positions = Math.round(totalMovement / ITEM_HEIGHT_COMPRESSED);
    const newIndex = dragStartIndex.current + positions;

    return Math.max(0, Math.min(totalItems - 1, newIndex));
  }, [currentIndex, totalItems]);

  // Actualizar translateY para seguir al dedo
  const updateTranslateY = useCallback(() => {
    const fingerMovement = currentPointerY.current - dragStartY.current;
    const scrollDelta = (scrollableParent.current?.scrollTop || 0) - initialScrollTop.current;
    // Incluir el offset inicial de compresión para mantener el bloque en el dedo
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

      // IMPORTANTE: Solo activar auto-scroll si el usuario ha MOVIDO el dedo
      // hacia la zona de scroll (no si empezó el drag ahí)
      const fingerMovement = Math.abs(pointerY - dragStartPointerY.current);
      const MIN_MOVEMENT_FOR_AUTOSCROLL = 30; // Mínimo 30px de movimiento

      if (fingerMovement < MIN_MOVEMENT_FOR_AUTOSCROLL) {
        return; // No hacer auto-scroll hasta que el usuario mueva el dedo
      }

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

        // Limitar el scroll para no ir más allá del contenido
        const newScrollTop = Math.max(0, Math.min(maxScroll, oldScrollTop + scrollDelta));
        scrollableParent.current.scrollTop = newScrollTop;

        // Si realmente scrolleó, actualizar
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

  // Limpiar todo
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
    const startIndex = dragStartIndex.current;

    // Resetear estado
    isDraggingRef.current = false;
    setIsDragging(false);
    setTranslateY(0);
    activePointerId.current = null;

    // Callback
    if (finalIndex !== startIndex) {
      onDragEnd(finalIndex);
    } else if (onDragCancel) {
      onDragCancel();
    }
  }, [calculateTargetIndex, onDragCancel, onDragEnd, stopAutoScroll]);

  // POINTER DOWN en el handle
  const handlePointerDownOnHandle = useCallback(
    (e: React.PointerEvent) => {
      // Prevenir comportamiento por defecto
      e.stopPropagation();
      e.preventDefault();

      // Si ya hay un pointer activo, ignorar
      if (activePointerId.current !== null) return;

      activePointerId.current = e.pointerId;
      const pointerY = e.clientY;
      pressStartY.current = pointerY;
      currentPointerY.current = pointerY;

      // Preparar scroll tracking
      scrollableParent.current = findScrollableParent();
      initialScrollTop.current = scrollableParent.current?.scrollTop || 0;

      // Sincronizar índices
      dragStartIndex.current = currentIndex;
      lastReportedIndex.current = currentIndex;

      // Capturar pointer inmediatamente en el container
      if (containerRef.current) {
        try {
          containerRef.current.setPointerCapture(e.pointerId);
        } catch {
          // Ignorar errores de captura
        }
      }

      // Timer de long-press
      longPressTimer.current = setTimeout(() => {
        // Verificar que seguimos con el mismo pointer
        if (activePointerId.current !== e.pointerId) return;

        // Activar drag ANTES de onDragStart para que el estado local esté listo
        isDraggingRef.current = true;
        setIsDragging(true);

        // Haptic feedback
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

        // Llamar onDragStart - esto causa que el padre comprima las tarjetas
        if (onDragStart) onDragStart();

        // CRÍTICO: Esperar a que React re-renderice después de la compresión
        // Usamos DOBLE requestAnimationFrame para asegurar que el DOM está actualizado
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            // IMPORTANTE: Después de la compresión, el elemento puede haber SUBIDO
            // porque las tarjetas anteriores se encogieron.
            // Necesitamos calcular el offset inicial para que el bloque
            // aparezca EXACTAMENTE donde está el dedo.

            if (!containerRef.current) return;

            // Obtener la posición REAL del elemento después de la compresión
            const elementRect = containerRef.current.getBoundingClientRect();
            const elementCenterY = elementRect.top + elementRect.height / 2;

            // El dedo está en currentPointerY.current
            // El elemento está en elementCenterY
            // El offset inicial es la diferencia (para que el centro del elemento
            // esté donde está el dedo)
            const initialOffset = currentPointerY.current - elementCenterY;

            // Guardar el offset inicial de compresión para usarlo en updateTranslateY
            initialCompressionOffset.current = initialOffset;

            // Establecer dragStartY
            dragStartY.current = currentPointerY.current;

            // Guardar posición inicial para control de auto-scroll
            dragStartPointerY.current = currentPointerY.current;

            // Actualizar scroll inicial
            initialScrollTop.current = scrollableParent.current?.scrollTop || 0;

            // CLAVE: Empezar con el offset inicial para que el bloque
            // aparezca donde está el dedo, no donde quedó después de comprimir
            setTranslateY(initialOffset);

            // Iniciar auto-scroll
            startAutoScroll();
          });
        });
      }, LONG_PRESS_DELAY);
    },
    [currentIndex, findScrollableParent, onDragStart, startAutoScroll]
  );

  // POINTER MOVE (en el container para capturar todo el movimiento)
  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      // Solo procesar nuestro pointer
      if (activePointerId.current !== e.pointerId) return;

      currentPointerY.current = e.clientY;

      // Si estamos arrastrando
      if (isDraggingRef.current) {
        e.preventDefault();
        updateTranslateY();

        const targetIndex = calculateTargetIndex();
        if (targetIndex !== lastReportedIndex.current) {
          lastReportedIndex.current = targetIndex;
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          if (onPositionChange) onPositionChange(targetIndex);
        }
        return;
      }

      // Si aún no arrastramos, cancelar si se movió mucho
      if (longPressTimer.current) {
        const moved = Math.abs(e.clientY - pressStartY.current);
        if (moved > 15) {
          clearTimeout(longPressTimer.current);
          longPressTimer.current = null;

          // Liberar pointer
          if (containerRef.current) {
            try {
              containerRef.current.releasePointerCapture(e.pointerId);
            } catch {
              // Ignorar
            }
          }
          activePointerId.current = null;
        }
      }
    },
    [calculateTargetIndex, onPositionChange, updateTranslateY]
  );

  // POINTER UP
  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (activePointerId.current !== e.pointerId) return;

      cleanup();

      // Liberar pointer
      if (containerRef.current) {
        try {
          containerRef.current.releasePointerCapture(e.pointerId);
        } catch {
          // Ignorar
        }
      }

      if (isDraggingRef.current) {
        finishDrag();
      } else {
        activePointerId.current = null;
        // Si el bloque está colapsado y no hubo drag, interpretar como tap → expandir
        if (isBlockCollapsedRef.current && expandToggleRef.current) {
          expandToggleRef.current();
        }
      }
    },
    [cleanup, finishDrag]
  );

  // POINTER CANCEL
  const handlePointerCancel = useCallback(
    (e: React.PointerEvent) => {
      handlePointerUp(e);
    },
    [handlePointerUp]
  );

  // Estilos del handle
  const handleStyle: React.CSSProperties = {
    cursor: isDragging ? 'grabbing' : isHoveringHandle ? 'grab' : 'default',
    touchAction: 'none',
  };

  // Estilos del container
  const containerStyle: React.CSSProperties = {
    transform: isDragging ? `translateY(${translateY}px) scale(0.98)` : 'none',
    zIndex: isDragging ? 1000 : 1,
    position: 'relative',
    opacity: isDragging ? 0.95 : 1,
    boxShadow: isDragging ? '0 10px 40px rgba(220, 38, 38, 0.5)' : 'none',
    transition: isDragging ? 'none' : 'transform 0.15s ease-out, box-shadow 0.15s ease-out',
    willChange: isDragging ? 'transform' : 'auto',
    userSelect: 'none',
    touchAction: isDragging ? 'none' : 'auto',
  };

  return (
    <div
      ref={containerRef}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      style={containerStyle}
    >
      <WorkoutBlock
        data={data}
        onMoveUp={onMoveUp}
        onMoveDown={onMoveDown}
        isFirst={currentIndex === 0}
        isLast={currentIndex >= totalItems - 1}
        onPressRoutine={onPressRoutine}
        isCompressed={isDragging}
        onBlockExpandedChange={handleBlockExpandedChange}
        expandToggleRef={expandToggleRef}
        dragHandleProps={{
          onPointerDown: handlePointerDownOnHandle,
          onPointerEnter: () => setIsHoveringHandle(true),
          onPointerLeave: () => setIsHoveringHandle(false),
          style: handleStyle,
          isDragging,
        }}
      />
    </div>
  );
};

// ============================================================================
// NATIVE DRAGGABLE COMPONENT
// Implementación con manualActivation para activar solo desde header
// ============================================================================

// Altura del header donde se puede iniciar el drag
const HEADER_HEIGHT = 56;

const NativeDraggableWorkoutBlock: React.FC<DraggableWorkoutBlockProps> = ({
  data,
  currentIndex,
  totalItems,
  onMoveUp,
  onMoveDown,
  onDragEnd,
  onDragStart,
  onDragCancel,
  onPositionChange,
  onPressRoutine,
  itemHeight = 150,
  scrollRef,
}) => {
  const translateY = useSharedValue(0);
  const scale = useSharedValue(1);
  const zIndex = useSharedValue(1);
  const isDraggingShared = useSharedValue(false);
  const [isDraggingState, setIsDraggingState] = useState(false);
  const lastReportedIndex = useSharedValue(currentIndex);
  const autoScrollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const currentAbsoluteYRef = useRef(0);
  const scrollOffsetRef = useRef(0);
  const isDraggingRef = useRef(false);

  // Shared value para saber si el bloque está colapsado (drag desde cualquier punto)
  const isBlockCollapsed = useSharedValue(true);

  const handleBlockExpandedChange = useCallback(
    (expanded: boolean) => {
      isBlockCollapsed.value = !expanded;
    },
    [isBlockCollapsed]
  );

  // Ref para el contenedor y medir posición
  const containerRef = useRef<Animated.View>(null);
  const containerTopY = useSharedValue(0);

  // Shared values para el gesto manual
  const touchStartY = useSharedValue(0);
  const isInHeader = useSharedValue(false);
  const longPressTimer = useSharedValue<number | null>(null);

  useEffect(() => {
    return () => {
      if (autoScrollIntervalRef.current) {
        clearInterval(autoScrollIntervalRef.current);
      }
    };
  }, []);

  // Auto-scroll mejorado
  const startAutoScroll = useCallback(() => {
    if (autoScrollIntervalRef.current) return;

    // Obtener scroll offset inicial
    if (scrollRef?.current) {
      // @ts-ignore - scrollTo exists
      scrollOffsetRef.current = 0;
    }

    autoScrollIntervalRef.current = setInterval(() => {
      if (!isDraggingRef.current || !scrollRef?.current) {
        if (autoScrollIntervalRef.current) {
          clearInterval(autoScrollIntervalRef.current);
          autoScrollIntervalRef.current = null;
        }
        return;
      }

      const absoluteY = currentAbsoluteYRef.current;
      if (absoluteY === 0) return; // No hay posición válida aún

      const headerHeight = 140;
      const bottomPadding = 120;

      const topZone = headerHeight + AUTO_SCROLL_THRESHOLD;
      const bottomZone = SCREEN_HEIGHT - bottomPadding - AUTO_SCROLL_THRESHOLD;

      let scrollDelta = 0;

      if (absoluteY < topZone && absoluteY > headerHeight) {
        // Scroll hacia arriba
        const intensity = 1 - (absoluteY - headerHeight) / AUTO_SCROLL_THRESHOLD;
        scrollDelta = -AUTO_SCROLL_SPEED * 2 * Math.max(0.3, intensity);
      } else if (absoluteY > bottomZone) {
        // Scroll hacia abajo
        const intensity = (absoluteY - bottomZone) / AUTO_SCROLL_THRESHOLD;
        scrollDelta = AUTO_SCROLL_SPEED * 2 * Math.max(0.3, intensity);
      }

      if (scrollDelta !== 0 && scrollRef.current) {
        try {
          // Usar scrollTo con offset relativo
          scrollRef.current.scrollTo({
            y: Math.max(0, scrollOffsetRef.current + scrollDelta),
            animated: false,
          });
          scrollOffsetRef.current += scrollDelta;
        } catch {
          // Ignorar errores
        }
      }
    }, 16);
  }, [scrollRef]);

  const stopAutoScroll = useCallback(() => {
    if (autoScrollIntervalRef.current) {
      clearInterval(autoScrollIntervalRef.current);
      autoScrollIntervalRef.current = null;
    }
  }, []);

  const handleDragStart = useCallback(() => {
    isDraggingRef.current = true;
    setIsDraggingState(true);
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    } catch {
      // Ignorar
    }
    if (onDragStart) onDragStart();
    startAutoScroll();
  }, [onDragStart, startAutoScroll]);

  const handleDragEnd = useCallback(
    (newIndex: number) => {
      stopAutoScroll();
      isDraggingRef.current = false;
      setIsDraggingState(false);

      if (newIndex !== currentIndex) {
        onDragEnd(newIndex);
      } else if (onDragCancel) {
        onDragCancel();
      }
    },
    [currentIndex, onDragEnd, onDragCancel, stopAutoScroll]
  );

  const handlePositionChange = useCallback(
    (newIndex: number) => {
      try {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      } catch {
        // Ignorar
      }
      if (onPositionChange) onPositionChange(newIndex);
    },
    [onPositionChange]
  );

  const updateAbsoluteY = useCallback((y: number) => {
    currentAbsoluteYRef.current = y;
  }, []);

  // Gesture con manualActivation para activar solo desde el header
  const gesture = Gesture.Pan()
    .manualActivation(true)
    .onTouchesDown((event, stateManager) => {
      'worklet';
      if (event.numberOfTouches !== 1) return;

      const touch = event.allTouches[0];
      touchStartY.value = touch.y;

      // Verificar si el touch está en el header o si el bloque está colapsado
      // Cuando está colapsado, toda la tarjeta es zona de drag
      if (touch.y <= HEADER_HEIGHT || isBlockCollapsed.value) {
        isInHeader.value = true;
        // Iniciar timer de long press
        longPressTimer.value = Date.now();
      } else {
        isInHeader.value = false;
        longPressTimer.value = null;
      }
    })
    .onTouchesMove((event, stateManager) => {
      'worklet';
      if (event.numberOfTouches !== 1) {
        stateManager.fail();
        return;
      }

      const touch = event.allTouches[0];
      const moveDistance = Math.abs(touch.y - touchStartY.value);

      // Si ya está activo (dragging), continuar
      if (isDraggingShared.value) {
        stateManager.activate();
        return;
      }

      // Si el touch no empezó en el header, fallar
      if (!isInHeader.value) {
        stateManager.fail();
        return;
      }

      // Si se movió mucho antes del long press, fallar
      if (moveDistance > 10 && longPressTimer.value !== null) {
        const elapsed = Date.now() - longPressTimer.value;
        if (elapsed < LONG_PRESS_DELAY) {
          stateManager.fail();
          return;
        }
      }

      // Verificar si pasó el tiempo de long press
      if (longPressTimer.value !== null) {
        const elapsed = Date.now() - longPressTimer.value;
        if (elapsed >= LONG_PRESS_DELAY) {
          stateManager.activate();
        }
      }
    })
    .onTouchesUp((_, stateManager) => {
      'worklet';
      if (!isDraggingShared.value) {
        stateManager.fail();
      }
      longPressTimer.value = null;
      isInHeader.value = false;
    })
    .onTouchesCancelled((_, stateManager) => {
      'worklet';
      stateManager.fail();
      longPressTimer.value = null;
      isInHeader.value = false;
    })
    .onStart((event) => {
      'worklet';
      isDraggingShared.value = true;
      scale.value = withSpring(0.98, { damping: 15, stiffness: 150 });
      zIndex.value = 1000;
      lastReportedIndex.value = currentIndex;
      runOnJS(handleDragStart)();
    })
    .onUpdate((event) => {
      'worklet';
      translateY.value = event.translationY;
      runOnJS(updateAbsoluteY)(event.absoluteY);

      const positions = Math.round(event.translationY / itemHeight);
      const newIndex = Math.max(0, Math.min(totalItems - 1, currentIndex + positions));

      if (newIndex !== lastReportedIndex.value) {
        lastReportedIndex.value = newIndex;
        runOnJS(handlePositionChange)(newIndex);
      }
    })
    .onEnd((event) => {
      'worklet';
      const positions = Math.round(event.translationY / itemHeight);
      const newIndex = Math.max(0, Math.min(totalItems - 1, currentIndex + positions));

      translateY.value = withSpring(0, { damping: 15, stiffness: 150 });
      scale.value = withSpring(1, { damping: 15, stiffness: 150 });
      zIndex.value = 1;
      isDraggingShared.value = false;

      runOnJS(handleDragEnd)(newIndex);
    })
    .onFinalize(() => {
      'worklet';
      longPressTimer.value = null;
      isInHeader.value = false;

      if (isDraggingShared.value) {
        translateY.value = withSpring(0);
        scale.value = withSpring(1);
        zIndex.value = 1;
        isDraggingShared.value = false;
        runOnJS(handleDragEnd)(currentIndex);
      }
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }, { scale: scale.value }],
    zIndex: zIndex.value,
    opacity: isDraggingShared.value ? 0.95 : 1,
  }));

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View
        ref={containerRef}
        style={[
          {
            shadowColor: '#DC2626',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: isDraggingState ? 0.4 : 0,
            shadowRadius: 15,
            elevation: isDraggingState ? 10 : 0,
          },
          animatedStyle,
        ]}
      >
        <WorkoutBlock
          data={data}
          onMoveUp={onMoveUp}
          onMoveDown={onMoveDown}
          isFirst={currentIndex === 0}
          isLast={currentIndex >= totalItems - 1}
          onPressRoutine={onPressRoutine}
          isCompressed={isDraggingState}
          onBlockExpandedChange={handleBlockExpandedChange}
        />
      </Animated.View>
    </GestureDetector>
  );
};

// ============================================================================
// EXPORT
// ============================================================================
export const DraggableWorkoutBlock: React.FC<DraggableWorkoutBlockProps> = (props) => {
  if (Platform.OS === 'web') {
    return <WebDraggableWorkoutBlock {...props} />;
  }
  return <NativeDraggableWorkoutBlock {...props} />;
};
