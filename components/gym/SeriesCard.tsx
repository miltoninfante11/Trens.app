// ============================================================================
// SERIES CARD - Componente para mostrar series del día con targeting de Hank
// Incluye highlight interno para precisión perfecta en cualquier dispositivo
// ============================================================================

import React, { useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  withSpring,
  interpolate,
  Easing,
  cancelAnimation,
} from 'react-native-reanimated';
import { Plus, Settings2, Sliders } from 'lucide-react-native';
import { useHank } from '../../context/HankContext';

interface SeriesConfig {
  id: string;
  reps: number;
  weight: number;
  type: string;
  note?: string;
}

interface SeriesCardProps {
  exerciseId: string;
  exerciseName: string;
  series: SeriesConfig[];
  onPress: () => void;
  isActive: boolean;
  spotifyMode?: boolean;
}

const typeConfig: Record<string, { bg: string; border: string; label: string }> = {
  CALENTAMIENTO: { bg: '#1e3a5f', border: '#3b82f6', label: 'C' },
  APROXIMACION: { bg: '#422006', border: '#f59e0b', label: 'A' },
  EFECTIVA: { bg: '#14532d', border: '#22c55e', label: 'E' },
  FALLO: { bg: '#450a0a', border: '#ef4444', label: 'F' },
};

// ============================================================================
// INLINE HIGHLIGHT - Se renderiza dentro del componente para precisión exacta
// ============================================================================
const InlineHighlight: React.FC<{
  isActive: boolean;
  phase: 'idle' | 'flying' | 'working' | 'success' | 'returning';
}> = ({ isActive, phase }) => {
  const borderOpacity = useSharedValue(0);
  const glowIntensity = useSharedValue(0);
  const gearRotation = useSharedValue(0);

  const isHighlighting =
    isActive && (phase === 'flying' || phase === 'working' || phase === 'success');

  useEffect(() => {
    if (!isActive) {
      borderOpacity.value = withTiming(0, { duration: 200 });
      return;
    }

    if (phase === 'flying') {
      // Entrada suave mientras Hank vuela
      borderOpacity.value = withTiming(0.8, { duration: 300 });
      glowIntensity.value = withTiming(0.5, { duration: 300 });
    } else if (phase === 'working') {
      // Borde completo + glow pulsante + engranaje girando
      borderOpacity.value = withSpring(1, { damping: 15 });
      glowIntensity.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 600, easing: Easing.inOut(Easing.ease) }),
          withTiming(0.5, { duration: 600, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        true
      );
      gearRotation.value = withRepeat(
        withTiming(360, { duration: 1500, easing: Easing.linear }),
        -1,
        false
      );
    } else if (phase === 'success') {
      // Flash verde
      cancelAnimation(gearRotation);
      glowIntensity.value = withSequence(
        withTiming(1.5, { duration: 150 }),
        withTiming(0, { duration: 300 })
      );
      borderOpacity.value = withTiming(0, { duration: 400 });
    } else {
      cancelAnimation(glowIntensity);
      cancelAnimation(gearRotation);
      borderOpacity.value = withTiming(0, { duration: 200 });
    }
  }, [isActive, phase, borderOpacity, glowIntensity, gearRotation]);

  const borderStyle = useAnimatedStyle(() => ({
    ...StyleSheet.absoluteFillObject,
    borderWidth: 2,
    borderColor: phase === 'success' ? '#22C55E' : '#F97316',
    borderRadius: 12,
    opacity: borderOpacity.value,
    shadowColor: phase === 'success' ? '#22C55E' : '#DC2626',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: interpolate(glowIntensity.value, [0, 1], [0.3, 0.9]),
    shadowRadius: interpolate(glowIntensity.value, [0, 1], [5, 20]),
    elevation: 10,
  }));

  const cornerOpacity = useAnimatedStyle(() => ({
    opacity: interpolate(glowIntensity.value, [0, 1], [0.5, 1]),
  }));

  const gearStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${gearRotation.value}deg` }],
  }));

  if (!isHighlighting) return null;

  const cornerColor = phase === 'success' ? '#22C55E' : '#FBBF24';

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {/* Borde principal */}
      <Animated.View style={borderStyle} />

      {/* Esquinas decorativas */}
      <Animated.View
        style={[
          {
            position: 'absolute',
            top: -2,
            left: -2,
            width: 12,
            height: 12,
            borderTopWidth: 3,
            borderLeftWidth: 3,
            borderColor: cornerColor,
            borderTopLeftRadius: 4,
          },
          cornerOpacity,
        ]}
      />
      <Animated.View
        style={[
          {
            position: 'absolute',
            top: -2,
            right: -2,
            width: 12,
            height: 12,
            borderTopWidth: 3,
            borderRightWidth: 3,
            borderColor: cornerColor,
            borderTopRightRadius: 4,
          },
          cornerOpacity,
        ]}
      />
      <Animated.View
        style={[
          {
            position: 'absolute',
            bottom: -2,
            left: -2,
            width: 12,
            height: 12,
            borderBottomWidth: 3,
            borderLeftWidth: 3,
            borderColor: cornerColor,
            borderBottomLeftRadius: 4,
          },
          cornerOpacity,
        ]}
      />
      <Animated.View
        style={[
          {
            position: 'absolute',
            bottom: -2,
            right: -2,
            width: 12,
            height: 12,
            borderBottomWidth: 3,
            borderRightWidth: 3,
            borderColor: cornerColor,
            borderBottomRightRadius: 4,
          },
          cornerOpacity,
        ]}
      />

      {/* Engranaje girando */}
      {phase === 'working' && (
        <>
          {/* Mini-badge "Ejecutando..." encima del target */}
          <View
            style={{
              position: 'absolute',
              top: -28,
              left: 0,
              right: 0,
              alignItems: 'center',
            }}
          >
            <View
              style={{
                backgroundColor: '#0a0505',
                borderWidth: 1,
                borderColor: '#F97316',
                borderRadius: 4,
                paddingHorizontal: 8,
                paddingVertical: 3,
                flexDirection: 'row',
                alignItems: 'center',
              }}
            >
              <Text style={{ color: '#F97316', fontSize: 10, fontWeight: '600' }}>
                ⚙️ Ejecutando...
              </Text>
            </View>
          </View>
          {/* Engranaje */}
          <View
            style={{
              position: 'absolute',
              bottom: -14,
              right: -14,
              width: 28,
              height: 28,
              borderRadius: 14,
              backgroundColor: '#0a0505',
              borderWidth: 2,
              borderColor: '#F97316',
              alignItems: 'center',
              justifyContent: 'center',
              shadowColor: '#F97316',
              shadowOffset: { width: 0, height: 0 },
              shadowOpacity: 0.8,
              shadowRadius: 8,
              elevation: 5,
            }}
          >
            <Animated.View style={gearStyle}>
              <Settings2 size={16} color="#F97316" strokeWidth={2.5} />
            </Animated.View>
          </View>
        </>
      )}

      {/* Check de éxito */}
      {phase === 'success' && (
        <>
          {/* Mini-badge "¡Listo!" encima del target */}
          <View
            style={{
              position: 'absolute',
              top: -28,
              left: 0,
              right: 0,
              alignItems: 'center',
            }}
          >
            <View
              style={{
                backgroundColor: '#0a0505',
                borderWidth: 1,
                borderColor: '#22C55E',
                borderRadius: 4,
                paddingHorizontal: 8,
                paddingVertical: 3,
              }}
            >
              <Text style={{ color: '#22C55E', fontSize: 10, fontWeight: '600' }}>✅ ¡Listo!</Text>
            </View>
          </View>
          {/* Check */}
          <View
            style={{
              position: 'absolute',
              top: -14,
              right: -14,
              width: 28,
              height: 28,
              borderRadius: 14,
              backgroundColor: '#22C55E',
              alignItems: 'center',
              justifyContent: 'center',
              shadowColor: '#22C55E',
              shadowOffset: { width: 0, height: 0 },
              shadowOpacity: 1,
              shadowRadius: 12,
              elevation: 5,
            }}
          >
            <View
              style={{
                width: 8,
                height: 14,
                borderRightWidth: 3,
                borderBottomWidth: 3,
                borderColor: '#fff',
                transform: [{ rotate: '45deg' }, { translateY: -2 }],
              }}
            />
          </View>
        </>
      )}
    </View>
  );
};

// ============================================================================
// SERIES CARD - Componente principal
// ============================================================================
export const SeriesCard = ({
  exerciseId,
  exerciseName,
  series,
  onPress,
  isActive,
  spotifyMode = false,
}: SeriesCardProps) => {
  const { targetState } = useHank();
  const { currentTarget, animationPhase, registerTarget, unregisterTarget } = targetState;
  const containerRef = React.useRef<View>(null);
  const positionRef = React.useRef({ x: 0, y: 0, width: 0, height: 0 });

  // Verificar si ESTE componente es el target actual
  const targetId = `series-${exerciseId}`;
  const isThisTargeted = currentTarget?.id === targetId;

  // Medir posición y registrar target
  const measureAndRegister = React.useCallback(() => {
    if (!isActive || !containerRef.current) return;

    containerRef.current.measureInWindow((x, y, width, height) => {
      if (x !== undefined && y !== undefined && width > 0 && height > 0) {
        positionRef.current = { x, y, width, height };
        registerTarget(targetId, {
          type: 'exercise',
          label: exerciseName,
          position: { x, y, width, height },
        });
      }
    });
  }, [isActive, targetId, exerciseName, registerTarget]);

  // Registrar este componente como target cuando está activo
  useEffect(() => {
    if (isActive) {
      // Medir después de un pequeño delay para asegurar que el layout esté listo
      const timer = setTimeout(measureAndRegister, 100);
      return () => {
        clearTimeout(timer);
        unregisterTarget(targetId);
      };
    }
    return () => {
      unregisterTarget(targetId);
    };
  }, [isActive, targetId, measureAndRegister, unregisterTarget]);

  return (
    <View
      ref={containerRef}
      onLayout={measureAndRegister}
      className="p-4 rounded-xl"
      style={{
        backgroundColor: spotifyMode ? 'rgba(0,0,0,0.4)' : '#0a0a0a',
        borderWidth: 1,
        borderColor: spotifyMode ? 'rgba(255,255,255,0.15)' : '#1a1a1a',
        overflow: 'visible', // Importante para que el highlight y esquinas se vean
      }}
    >
      {/* HIGHLIGHT INTERNO - Se posiciona automáticamente */}
      <InlineHighlight isActive={isThisTargeted} phase={animationPhase} />

      <TouchableOpacity onPress={onPress}>
        <View className="flex-row items-center justify-between mb-3">
          <View className="flex-row items-center gap-2">
            <View className="w-1 h-4 bg-fire-orange rounded-full" />
            <Text className="text-white font-bold text-sm uppercase tracking-wider">
              Series de Hoy
            </Text>
          </View>
          <View className="flex-row items-center gap-1">
            <Text className="text-zinc-500 text-xs">Editar</Text>
            <Sliders color="#71717a" size={14} />
          </View>
        </View>
      </TouchableOpacity>

      {/* Series visuales - Slider horizontal */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8 }}
        nestedScrollEnabled={true}
      >
        {(series || [])
          .filter((s) => s && typeof s === 'object')
          .map((s, idx) => {
            const config = typeConfig[s.type] || typeConfig.EFECTIVA;
            const hasWeight = s.weight > 0;
            return (
              <TouchableOpacity
                key={String(idx)}
                onPress={onPress}
                className="items-center justify-center rounded-xl"
                style={{
                  width: hasWeight ? 56 : 50,
                  height: 50,
                  backgroundColor: config.bg,
                  borderWidth: 1.5,
                  borderColor: config.border,
                }}
              >
                <Text className="text-white font-bold" style={{ fontSize: 15 }}>{String(s.reps || 0)}</Text>
                {hasWeight ? (
                  <Text className="text-zinc-300 text-[9px] font-mono font-bold -mt-0.5">{s.weight}kg</Text>
                ) : (
                  <Text className="text-zinc-400 text-[9px] font-bold -mt-0.5">{config.label}</Text>
                )}
              </TouchableOpacity>
            );
          })}

        {/* Agregar serie */}
        <TouchableOpacity
          onPress={onPress}
          className="items-center justify-center rounded-xl"
          style={{
            width: 50,
            height: 50,
            backgroundColor: 'transparent',
            borderWidth: 1.5,
            borderColor: '#3f3f46',
            borderStyle: 'dashed',
          }}
        >
          <Plus color="#71717a" size={18} />
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
};
