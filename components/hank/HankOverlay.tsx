// ============================================================================
// HANK OVERLAY - Interfaz Visual del Agente HANK
// FAB flotante + Modal de Chat con estilo Savage Mode
// Incluye Long Press para comando de voz con confirmación
// ============================================================================

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
  Pressable,
  PanResponder,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  withSpring,
  withSequence,
  interpolate,
  Easing,
  SharedValue,
  cancelAnimation,
} from 'react-native-reanimated';
import * as Haptics from '../../lib/haptics';
import {
  GitlabIcon as Bot,
  Mic,
  MicOff,
  ChevronDown,
  Check,
  X,
  Settings2,
} from 'lucide-react-native';
import { usePathname } from 'expo-router';
import { useHank } from '../../context/HankContext';
import { useVoiceInput } from '../../hooks/useVoiceInput';
import { supabase } from '../../lib/supabase';
import { useSaveGuard } from '../../context/SaveGuardContext';
import { useSport } from '../../context/SportContext';
import { calculateFabPositions } from '../../constants/floatingTools';
import { HankTargetHighlight } from './HankTargetHighlight';
import { HankOnboarding, type OnboardingData } from './HankOnboarding';
import { setHankChatOpen } from '../../lib/hankChatState';
import type {
  HankToolResult,
  HankToolCall,
  HankAnimationPhase,
  HankTarget,
} from '../../types/hank';
import { MessageBubble, type ChatMessage } from './MessageBubble';
import { ThinkingIndicator } from './ThinkingIndicator';
import { ConfirmationButtons } from './ConfirmationButtons';
import { AnimatedSendButton } from './AnimatedSendButton';

// ============================================================================
// TYPES
// ============================================================================

// Tipo para mensajes de la base de datos
interface DBUIMessage {
  id: string;
  user_id: string;
  role: 'user' | 'model';
  content: string;
  created_at: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================
const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const PANEL_HEIGHT = SCREEN_HEIGHT * 0.8;
const LONG_PRESS_DURATION = 400; // ms para activar long press

// ============================================================================
// HELPERS
// ============================================================================
const getDefaultWelcomeMessage = (): ChatMessage => ({
  id: 'welcome',
  role: 'hank',
  content: 'Qué onda. ¿En qué te ayudo hoy? 💪 Mantén presionado 🎤 para voz.',
  timestamp: new Date(),
});

// ============================================================================
// ANIMATED COMPONENTS
// ============================================================================
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// ============================================================================
// FAB BUTTON (Floating Action Button) con Long Press y Flying Animation
// ============================================================================
const HankFAB: React.FC<{
  onPress: () => void;
  onLongPressStart: () => void;
  onLongPressEnd: () => void;
  isProcessing: boolean;
  isListening: boolean;
  bottomOffset: number;
  rightOffset: number;
  animationPhase: HankAnimationPhase;
  target: HankTarget | null;
  voiceToastPosition?: { x: number; y: number } | null; // Posición del toast de voz
}> = ({
  onPress,
  onLongPressStart,
  onLongPressEnd,
  isProcessing,
  isListening,
  bottomOffset,
  rightOffset,
  animationPhase,
  target,
  voiceToastPosition,
}) => {
  // Breathing animation
  const breathe = useSharedValue(0);
  // Processing spin animation
  const spin = useSharedValue(0);
  // Listening pulse animation
  const pulse = useSharedValue(1);
  const pulseOpacity = useSharedValue(0);
  // Flying animation
  const flyX = useSharedValue(0);
  const flyY = useSharedValue(0);
  const flyScale = useSharedValue(1);
  // Gear rotation for working phase
  const gearRotation = useSharedValue(0);

  // Calculate home position (bottom-right corner)
  const { width: screenWidth, height: screenHeight } = Dimensions.get('window');
  const homeX = screenWidth - rightOffset - 60; // 60 = FAB width
  const homeY = screenHeight - bottomOffset - 60; // 60 = FAB height

  useEffect(() => {
    // Continuous breathing effect
    breathe.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: 1500, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      false
    );
  }, [breathe]);

  useEffect(() => {
    if (isProcessing) {
      spin.value = withRepeat(
        withTiming(360, { duration: 1000, easing: Easing.linear }),
        -1,
        false
      );
    } else {
      spin.value = withTiming(0, { duration: 300 });
    }
  }, [isProcessing, spin]);

  // Listening animation - aggressive pulsing
  useEffect(() => {
    if (isListening) {
      // Pulso agresivo
      pulse.value = withRepeat(
        withSequence(
          withTiming(1.3, { duration: 300, easing: Easing.out(Easing.ease) }),
          withTiming(1.1, { duration: 300, easing: Easing.in(Easing.ease) })
        ),
        -1,
        true
      );
      // Ondas de radio
      pulseOpacity.value = withRepeat(
        withSequence(withTiming(0.8, { duration: 100 }), withTiming(0, { duration: 600 })),
        -1,
        false
      );
    } else {
      cancelAnimation(pulse);
      cancelAnimation(pulseOpacity);
      pulse.value = withTiming(1, { duration: 200 });
      pulseOpacity.value = withTiming(0, { duration: 200 });
    }
  }, [isListening, pulse, pulseOpacity]);

  // Flying animation - Hank travels to target OR to voice toast position
  useEffect(() => {
    // Prioridad 1: Posición del toast de voz (cuando espera confirmación)
    if (voiceToastPosition) {
      // Volar a la esquina superior izquierda del toast
      const toastX = voiceToastPosition.x - 30; // 30 = FAB half width
      const toastY = voiceToastPosition.y - 30; // 30 = FAB half height

      flyX.value = withTiming(toastX - homeX, {
        duration: 500,
        easing: Easing.out(Easing.cubic),
      });
      flyY.value = withTiming(toastY - homeY, {
        duration: 500,
        easing: Easing.out(Easing.cubic),
      });
      flyScale.value = withTiming(0.85, { duration: 400, easing: Easing.out(Easing.ease) });

      // Vibración al llegar
      setTimeout(() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }, 500);
      return;
    }

    // Prioridad 2: Animación normal hacia target de herramienta
    if (animationPhase === 'flying' && target) {
      // El FAB va al CENTRO ARRIBA del target (donde está el badge "Ejecutando...")
      const targetCenterX = target.position.x + target.position.width / 2 - 30; // 30 = FAB half width
      const targetTopY = target.position.y - 60; // Encima del badge

      flyX.value = withTiming(targetCenterX - homeX, {
        duration: 600,
        easing: Easing.out(Easing.cubic),
      });
      flyY.value = withTiming(targetTopY - homeY, {
        duration: 600,
        easing: Easing.out(Easing.cubic),
      });
      flyScale.value = withTiming(0.8, { duration: 400, easing: Easing.out(Easing.ease) });

      // Vibración al llegar (después de 600ms)
      setTimeout(() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      }, 600);
    } else if (animationPhase === 'working') {
      // Start gear rotation
      gearRotation.value = withRepeat(
        withTiming(360, { duration: 1200, easing: Easing.linear }),
        -1,
        false
      );
    } else if (animationPhase === 'success') {
      // Vibración al terminar el trabajo
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else if (animationPhase === 'returning' || animationPhase === 'idle') {
      // Return to home position - también en seco
      flyX.value = withTiming(0, { duration: 500, easing: Easing.out(Easing.cubic) });
      flyY.value = withTiming(0, { duration: 500, easing: Easing.out(Easing.cubic) });
      flyScale.value = withSpring(1, { damping: 12 });
      cancelAnimation(gearRotation);
      gearRotation.value = withTiming(0, { duration: 300 });
    }
  }, [
    animationPhase,
    target,
    homeX,
    homeY,
    flyX,
    flyY,
    flyScale,
    gearRotation,
    voiceToastPosition,
  ]);

  const flyingStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: flyX.value }, { translateY: flyY.value }, { scale: flyScale.value }],
  }));

  const gearStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${gearRotation.value}deg` }],
  }));

  const glowStyle = useAnimatedStyle(() => ({
    shadowOpacity: isListening
      ? interpolate(pulse.value, [1, 1.3], [0.5, 1])
      : interpolate(breathe.value, [0, 1], [0.3, 0.8]),
    shadowRadius: isListening
      ? interpolate(pulse.value, [1, 1.3], [15, 35])
      : interpolate(breathe.value, [0, 1], [8, 20]),
    transform: [
      {
        scale: isListening ? pulse.value : interpolate(breathe.value, [0, 1], [1, 1.05]),
      },
    ],
  }));

  const borderStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${spin.value}deg` }],
  }));

  const pulseRingStyle = useAnimatedStyle(() => ({
    opacity: pulseOpacity.value,
    transform: [{ scale: interpolate(pulseOpacity.value, [0, 0.8], [2, 1]) }],
  }));

  // Gesture handling
  const longPressActive = useRef(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handlePressIn = useCallback(() => {
    longPressTimer.current = setTimeout(() => {
      longPressActive.current = true;
      onLongPressStart();
    }, LONG_PRESS_DURATION);
  }, [onLongPressStart]);

  const handlePressOut = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }

    if (longPressActive.current) {
      longPressActive.current = false;
      onLongPressEnd();
    } else {
      // Short press - open chat
      onPress();
    }
  }, [onPress, onLongPressEnd]);

  // Determine if we're in a flying/working state
  const isFlying =
    animationPhase === 'flying' || animationPhase === 'working' || animationPhase === 'returning';
  const isWorking = animationPhase === 'working';
  const isSuccess = animationPhase === 'success';

  return (
    <Animated.View
      style={[
        { position: 'absolute', bottom: bottomOffset, right: rightOffset, zIndex: 1000 },
        flyingStyle,
      ]}
    >
      {/* Pulse ring effect when listening - ED HARDY FIRE RINGS */}
      {isListening && !isFlying && (
        <>
          <Animated.View
            style={[
              {
                position: 'absolute',
                width: 60,
                height: 60,
                borderRadius: 30,
                borderWidth: 3,
                borderColor: '#F97316',
                left: 0,
                top: 0,
              },
              pulseRingStyle,
            ]}
          />
          <Animated.View
            style={[
              {
                position: 'absolute',
                width: 80,
                height: 80,
                borderRadius: 40,
                borderWidth: 2,
                borderColor: '#DC262680',
                left: -10,
                top: -10,
              },
              pulseRingStyle,
            ]}
          />
        </>
      )}

      <AnimatedPressable
        onPressIn={isFlying ? undefined : handlePressIn}
        onPressOut={isFlying ? undefined : handlePressOut}
        style={[
          {
            width: 60,
            height: 60,
            borderRadius: 30,
            backgroundColor: isWorking
              ? '#DC2626' // Rojo savage cuando trabaja
              : isSuccess
                ? '#22C55E'
                : isListening
                  ? '#DC2626'
                  : '#0a0505',
            alignItems: 'center',
            justifyContent: 'center',
            // ED HARDY: Intense fire glow
            shadowColor: isWorking
              ? '#DC2626'
              : isSuccess
                ? '#22C55E'
                : isListening
                  ? '#FF3B3B'
                  : '#F97316',
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: isWorking || isSuccess ? 1 : isListening ? 0.9 : 0.6,
            shadowRadius: isWorking || isSuccess ? 25 : isListening ? 20 : 15,
            elevation: 15,
          },
          glowStyle,
        ]}
      >
        {/* Animated Border - FIRE GRADIENT EFFECT */}
        <Animated.View
          style={[
            {
              position: 'absolute',
              width: 64,
              height: 64,
              borderRadius: 32,
              borderWidth: isWorking ? 3 : isListening ? 3 : 2,
              borderColor: isWorking ? '#F97316' : isListening ? '#FBBF24' : '#F97316',
              borderStyle: 'solid',
              borderTopColor: isWorking
                ? '#FBBF24'
                : isProcessing
                  ? '#F97316'
                  : isListening
                    ? '#FBBF24'
                    : '#F97316',
              borderRightColor:
                isWorking || isProcessing ? 'transparent' : isListening ? '#F97316' : '#DC2626',
              borderBottomColor:
                isWorking || isProcessing ? 'transparent' : isListening ? '#DC2626' : '#DC2626',
              borderLeftColor:
                isWorking || isProcessing ? 'transparent' : isListening ? '#F97316' : '#F97316',
            },
            borderStyle,
          ]}
        />

        {/* Icon - ED HARDY COLORS - FAB siempre muestra Bot (HANK Logo) */}
        {isListening ? (
          <Mic size={28} color="#FFFFFF" />
        ) : (
          <Bot size={28} color={isWorking || isSuccess || isProcessing ? '#FFFFFF' : '#F97316'} />
        )}
      </AnimatedPressable>
    </Animated.View>
  );
};

// ============================================================================
// VOICE CONFIRMATION TOAST - Notificación flotante para comandos de voz
// Brota desde donde está Hank (esquina superior izquierda del toast)
// ============================================================================
interface VoiceToastProps {
  visible: boolean;
  type: 'confirm' | 'success' | 'error' | 'processing';
  message: string;
  actionDescription?: string;
  onConfirm?: () => void;
  onCancel?: () => void;
  delayAppear?: boolean; // Si debe esperar a que Hank llegue
}

// Posición del toast en el centro de la pantalla (usa SCREEN_HEIGHT de línea 86)
const VOICE_TOAST_POSITION = { x: 40, y: Math.round(SCREEN_HEIGHT / 2 - 60) }; // Centro vertical

const VoiceConfirmationToast: React.FC<VoiceToastProps> = ({
  visible,
  type,
  message,
  actionDescription,
  onConfirm,
  onCancel,
  delayAppear = false,
}) => {
  const scale = useSharedValue(0);
  const opacity = useSharedValue(0);
  const [shouldRender, setShouldRender] = React.useState(false);
  const hasAppeared = React.useRef(false);

  useEffect(() => {
    if (visible && !hasAppeared.current) {
      hasAppeared.current = true;
      setShouldRender(true);

      // Si delayAppear, esperar a que Hank llegue (500ms) antes de aparecer
      const delay = delayAppear ? 550 : 0;

      setTimeout(() => {
        // Animación de brotar desde la esquina (donde está Hank)
        scale.value = withSpring(1, { damping: 12, stiffness: 100 });
        opacity.value = withTiming(1, { duration: 200 });
      }, delay);
    } else if (!visible && hasAppeared.current) {
      hasAppeared.current = false;
      // Desaparecer
      scale.value = withTiming(0, { duration: 150 });
      opacity.value = withTiming(0, { duration: 150 });
      setTimeout(() => setShouldRender(false), 200);
    }
  }, [visible, scale, opacity, delayAppear]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
    // Punto de origen en la esquina superior izquierda (donde está Hank)
    transformOrigin: 'top left',
  }));

  // Solo renderizar para tipo 'confirm'
  if (!shouldRender || type !== 'confirm') return null;

  const getBorderColor = () => {
    // Solo tipo 'confirm' llega aquí (ya filtramos arriba)
    return '#F97316';
  };

  const getIcon = () => {
    // Solo tipo 'confirm' llega aquí (ya filtramos arriba)
    return <Mic size={24} color="#F97316" />;
  };

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          top: VOICE_TOAST_POSITION.y,
          left: 40, // Centrado con margen igual
          right: 40,
          zIndex: 9999,
          backgroundColor: '#0a0505',
          borderRadius: 12,
          borderWidth: 2,
          borderColor: getBorderColor(),
          padding: 12,
          shadowColor: getBorderColor(),
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.4,
          shadowRadius: 12,
          elevation: 10,
        },
        animatedStyle,
      ]}
    >
      {/* Header con icono y mensaje */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          marginBottom: actionDescription ? 8 : 0,
        }}
      >
        <View
          style={{
            width: 32,
            height: 32,
            borderRadius: 16,
            backgroundColor: `${getBorderColor()}20`,
            alignItems: 'center',
            justifyContent: 'center',
            marginRight: 10,
          }}
        >
          {getIcon()}
        </View>
        <View style={{ flex: 1 }}>
          <Text
            style={{ color: '#71717a', fontSize: 10, fontFamily: 'monospace', marginBottom: 1 }}
          >
            🎤 VOZ
          </Text>
          <Text style={{ color: '#FFFFFF', fontSize: 13, fontWeight: '600' }}>{message}</Text>
        </View>
      </View>

      {/* Descripción de la acción */}
      {actionDescription && (
        <View
          style={{
            backgroundColor: '#1a1a1a',
            borderRadius: 6,
            padding: 8,
            marginBottom: 10,
            borderLeftWidth: 2,
            borderLeftColor: getBorderColor(),
          }}
        >
          <Text style={{ color: '#FFFFFF', fontSize: 12, fontFamily: 'monospace' }}>
            {actionDescription}
          </Text>
        </View>
      )}

      {/* Botones de confirmación */}
      {type === 'confirm' && onConfirm && onCancel && (
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <TouchableOpacity
            onPress={onCancel}
            style={{
              flex: 1,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              paddingVertical: 8,
              backgroundColor: '#27272a',
              borderRadius: 6,
            }}
          >
            <X size={16} color="#EF4444" />
            <Text style={{ color: '#EF4444', fontWeight: 'bold', fontSize: 12, marginLeft: 4 }}>
              NO
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onConfirm}
            style={{
              flex: 1,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              paddingVertical: 8,
              backgroundColor: '#DC2626',
              borderRadius: 6,
            }}
          >
            <Check size={16} color="#FFFFFF" />
            <Text style={{ color: '#FFFFFF', fontWeight: 'bold', fontSize: 12, marginLeft: 4 }}>
              SÍ
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </Animated.View>
  );
};

// ============================================================================
// HANK TAKEOVER - Efecto de pantalla completa cuando HANK toma el control
// ============================================================================
const { width: SCREEN_WIDTH } = Dimensions.get('window');

const HankTakeover: React.FC<{ isActive: boolean; statusText: string }> = ({
  isActive,
  statusText,
}) => {
  // Animaciones
  const opacity = useSharedValue(0);
  const scale = useSharedValue(0.5);
  const ringScale1 = useSharedValue(1);
  const ringScale2 = useSharedValue(1);
  const ringScale3 = useSharedValue(1);
  const ringOpacity1 = useSharedValue(0.8);
  const ringOpacity2 = useSharedValue(0.6);
  const ringOpacity3 = useSharedValue(0.4);
  const glitchX = useSharedValue(0);
  const scanlineY = useSharedValue(0);
  const textOpacity = useSharedValue(0);

  useEffect(() => {
    if (isActive) {
      // Fade in
      opacity.value = withTiming(1, { duration: 200 });
      scale.value = withSpring(1, { damping: 12, stiffness: 100 });
      textOpacity.value = withTiming(1, { duration: 400 });

      // Anillos pulsantes que emanan del centro
      ringScale1.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 0 }),
          withTiming(8, { duration: 1500, easing: Easing.out(Easing.ease) })
        ),
        -1,
        false
      );
      ringOpacity1.value = withRepeat(
        withSequence(
          withTiming(0.8, { duration: 0 }),
          withTiming(0, { duration: 1500, easing: Easing.out(Easing.ease) })
        ),
        -1,
        false
      );

      // Ring 2 con delay
      setTimeout(() => {
        ringScale2.value = withRepeat(
          withSequence(
            withTiming(1, { duration: 0 }),
            withTiming(8, { duration: 1500, easing: Easing.out(Easing.ease) })
          ),
          -1,
          false
        );
        ringOpacity2.value = withRepeat(
          withSequence(
            withTiming(0.6, { duration: 0 }),
            withTiming(0, { duration: 1500, easing: Easing.out(Easing.ease) })
          ),
          -1,
          false
        );
      }, 500);

      // Ring 3 con más delay
      setTimeout(() => {
        ringScale3.value = withRepeat(
          withSequence(
            withTiming(1, { duration: 0 }),
            withTiming(8, { duration: 1500, easing: Easing.out(Easing.ease) })
          ),
          -1,
          false
        );
        ringOpacity3.value = withRepeat(
          withSequence(
            withTiming(0.4, { duration: 0 }),
            withTiming(0, { duration: 1500, easing: Easing.out(Easing.ease) })
          ),
          -1,
          false
        );
      }, 1000);

      // Efecto glitch
      glitchX.value = withRepeat(
        withSequence(
          withTiming(-3, { duration: 50 }),
          withTiming(3, { duration: 50 }),
          withTiming(-2, { duration: 50 }),
          withTiming(0, { duration: 50 }),
          withTiming(0, { duration: 200 })
        ),
        -1,
        false
      );

      // Scanline
      scanlineY.value = withRepeat(
        withTiming(SCREEN_HEIGHT, { duration: 2000, easing: Easing.linear }),
        -1,
        false
      );
    } else {
      // Fade out
      opacity.value = withTiming(0, { duration: 300 });
      scale.value = withTiming(0.8, { duration: 300 });
      textOpacity.value = withTiming(0, { duration: 200 });
      cancelAnimation(ringScale1);
      cancelAnimation(ringScale2);
      cancelAnimation(ringScale3);
      cancelAnimation(ringOpacity1);
      cancelAnimation(ringOpacity2);
      cancelAnimation(ringOpacity3);
      cancelAnimation(glitchX);
      cancelAnimation(scanlineY);
    }
  }, [isActive]);

  const containerStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  const ring1Style = useAnimatedStyle(() => ({
    transform: [{ scale: ringScale1.value }],
    opacity: ringOpacity1.value,
  }));

  const ring2Style = useAnimatedStyle(() => ({
    transform: [{ scale: ringScale2.value }],
    opacity: ringOpacity2.value,
  }));

  const ring3Style = useAnimatedStyle(() => ({
    transform: [{ scale: ringScale3.value }],
    opacity: ringOpacity3.value,
  }));

  const glitchStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: glitchX.value }],
  }));

  const scanlineStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: scanlineY.value }],
  }));

  const textStyle = useAnimatedStyle(() => ({
    opacity: textOpacity.value,
  }));

  if (!isActive) return null;

  return (
    <Modal visible={isActive} transparent animationType="none">
      <Animated.View
        style={[
          {
            flex: 1,
            backgroundColor: 'rgba(0, 0, 0, 0.95)',
            justifyContent: 'center',
            alignItems: 'center',
          },
          containerStyle,
        ]}
      >
        {/* Scanline effect */}
        <Animated.View
          style={[
            {
              position: 'absolute',
              left: 0,
              right: 0,
              height: 2,
              backgroundColor: 'rgba(220, 38, 38, 0.3)',
            },
            scanlineStyle,
          ]}
        />

        {/* Grid pattern overlay */}
        <View
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            opacity: 0.05,
          }}
        >
          {Array.from({ length: 20 }).map((_, i) => (
            <View
              key={`h-${i}`}
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                top: i * (SCREEN_HEIGHT / 20),
                height: 1,
                backgroundColor: '#DC2626',
              }}
            />
          ))}
          {Array.from({ length: 10 }).map((_, i) => (
            <View
              key={`v-${i}`}
              style={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                left: i * (SCREEN_WIDTH / 10),
                width: 1,
                backgroundColor: '#DC2626',
              }}
            />
          ))}
        </View>

        {/* Pulsing rings from center */}
        <Animated.View
          style={[
            {
              position: 'absolute',
              width: 100,
              height: 100,
              borderRadius: 50,
              borderWidth: 2,
              borderColor: '#DC2626',
            },
            ring1Style,
          ]}
        />
        <Animated.View
          style={[
            {
              position: 'absolute',
              width: 100,
              height: 100,
              borderRadius: 50,
              borderWidth: 2,
              borderColor: '#DC2626',
            },
            ring2Style,
          ]}
        />
        <Animated.View
          style={[
            {
              position: 'absolute',
              width: 100,
              height: 100,
              borderRadius: 50,
              borderWidth: 2,
              borderColor: '#DC2626',
            },
            ring3Style,
          ]}
        />

        {/* Central HANK icon with glitch */}
        <Animated.View
          style={[
            {
              width: 100,
              height: 100,
              borderRadius: 50,
              backgroundColor: '#000000',
              borderWidth: 3,
              borderColor: '#DC2626',
              justifyContent: 'center',
              alignItems: 'center',
              shadowColor: '#DC2626',
              shadowOffset: { width: 0, height: 0 },
              shadowOpacity: 1,
              shadowRadius: 30,
              elevation: 20,
            },
            glitchStyle,
          ]}
        >
          <Bot size={50} color="#DC2626" />
        </Animated.View>

        {/* Status text */}
        <Animated.View style={[{ marginTop: 40 }, textStyle]}>
          <Text
            style={{
              color: '#DC2626',
              fontSize: 14,
              fontFamily: 'monospace',
              fontWeight: 'bold',
              letterSpacing: 4,
              textTransform: 'uppercase',
            }}
          >
            HANK TAKEOVER
          </Text>
          <Text
            style={{
              color: '#FFFFFF',
              fontSize: 12,
              fontFamily: 'monospace',
              textAlign: 'center',
              marginTop: 8,
              opacity: 0.7,
            }}
          >
            {statusText}
          </Text>
        </Animated.View>

        {/* Corner decorations */}
        <View style={{ position: 'absolute', top: 40, left: 20 }}>
          <Text style={{ color: '#DC2626', fontFamily: 'monospace', fontSize: 10, opacity: 0.5 }}>
            {'<SYSTEM>'}
          </Text>
        </View>
        <View style={{ position: 'absolute', top: 40, right: 20 }}>
          <Text style={{ color: '#DC2626', fontFamily: 'monospace', fontSize: 10, opacity: 0.5 }}>
            {'{OVERRIDE}'}
          </Text>
        </View>
        <View style={{ position: 'absolute', bottom: 60, left: 20 }}>
          <Text style={{ color: '#DC2626', fontFamily: 'monospace', fontSize: 10, opacity: 0.5 }}>
            {'[EXECUTING]'}
          </Text>
        </View>
        <View style={{ position: 'absolute', bottom: 60, right: 20 }}>
          <Text style={{ color: '#DC2626', fontFamily: 'monospace', fontSize: 10, opacity: 0.5 }}>
            {'//HANK.v1'}
          </Text>
        </View>
      </Animated.View>
    </Modal>
  );
};

// ============================================================================
// MAIN COMPONENT: HANK OVERLAY
// ============================================================================
export const HankOverlay: React.FC = () => {
  // IMPORTANTE: usePathname debe llamarse primero
  // Si el contexto de navegación no está disponible, no renderizar
  let pathname: string | null = null;
  try {
    pathname = usePathname();
  } catch {
    // Si falla usePathname, el contexto de navegación no está disponible
    return null;
  }

  const insets = useSafeAreaInsets();

  // Save Guard para verificar si puede usar HANK
  const { canSave } = useSaveGuard();

  // Sport context para detectar primera vez
  const { isFirstTime } = useSport();

  const [isOpen, setIsOpen] = useState(false);
  const [inputText, setInputText] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [isLongPressProcessing, setIsLongPressProcessing] = useState(false);
  const [isTakeover, setIsTakeover] = useState(false);
  const [takeoverStatus, setTakeoverStatus] = useState('');
  const [pendingExecution, setPendingExecution] = useState<{
    text: string;
    toolCalls: HankToolCall[];
  } | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([getDefaultWelcomeMessage()]);
  const [userId, setUserId] = useState<string | null>(null);
  const messagesInitialized = useRef(false);
  const takeoverResultRef = useRef<HankToolResult[] | null>(null);

  // Estado del Onboarding
  const [showOnboarding, setShowOnboarding] = useState(false);
  const onboardingChecked = useRef(false);

  // Estado del Toast de voz
  const [voiceToast, setVoiceToast] = useState<{
    visible: boolean;
    type: 'confirm' | 'success' | 'error' | 'processing';
    message: string;
    actionDescription?: string;
    delayAppear?: boolean;
  }>({
    visible: false,
    type: 'confirm',
    message: '',
    actionDescription: undefined,
    delayAppear: false,
  });

  const flatListRef = useRef<FlatList>(null);
  const textInputRef = useRef<any>(null);

  // Auto-resize textarea on web
  const autoResizeInput = useCallback(() => {
    if (Platform.OS !== 'web' || !textInputRef.current) return;
    const el = textInputRef.current as any;
    // Find the actual textarea DOM element
    const textarea = el instanceof HTMLTextAreaElement ? el : el?.querySelector?.('textarea') || el;
    if (textarea && textarea.style !== undefined) {
      textarea.style.height = 'auto';
      textarea.style.height = `${textarea.scrollHeight}px`;
    }
  }, []);

  // Ref for direct DOM manipulation on web (avoids state re-render flicker)
  const modalWebRef = useRef<any>(null);

  // Lock body scroll + track viewport via direct DOM (no state = no flicker)
  useEffect(() => {
    if (Platform.OS !== 'web' || !isOpen) return;

    // Lock background scroll on html + body
    const scrollY = window.scrollY;
    const html = document.documentElement;
    const body = document.body;

    html.style.overflow = 'hidden';
    html.style.height = '100%';
    body.style.overflow = 'hidden';
    body.style.position = 'fixed';
    body.style.width = '100%';
    body.style.height = '100%';
    body.style.top = `-${scrollY}px`;
    body.style.overscrollBehavior = 'none';
    body.style.touchAction = 'none';

    // Apply viewport height + offset directly to DOM node (no React re-render)
    const applyHeight = () => {
      const node = modalWebRef.current;
      if (!node) return;
      const vv = (window as any).visualViewport;
      if (vv) {
        node.style.height = `${vv.height}px`;
        node.style.top = `${vv.offsetTop}px`;
        node.style.bottom = 'auto';
      } else {
        node.style.height = `${window.innerHeight}px`;
      }
    };

    // Initial apply
    requestAnimationFrame(applyHeight);

    const vv = (window as any).visualViewport;
    if (vv) {
      vv.addEventListener('resize', applyHeight);
      vv.addEventListener('scroll', applyHeight);
    }

    return () => {
      if (vv) {
        vv.removeEventListener('resize', applyHeight);
        vv.removeEventListener('scroll', applyHeight);
      }
      html.style.overflow = '';
      html.style.height = '';
      body.style.overflow = '';
      body.style.position = '';
      body.style.width = '';
      body.style.height = '';
      body.style.top = '';
      body.style.overscrollBehavior = '';
      body.style.touchAction = '';
      window.scrollTo(0, scrollY);
    };
  }, [isOpen]);

  // Ocultar en Feed y PRO
  const isHiddenInFeed =
    pathname?.includes('feed') ||
    pathname === '/feed/index' ||
    pathname === '/feed' ||
    pathname?.includes('pro') ||
    pathname === '/pro/index' ||
    pathname === '/pro';

  // Animated value para cierre por gesto
  const translateY = useSharedValue(0);

  const animatedPanelStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const {
    executeCommand,
    executeTool,
    isProcessing,
    screenContext,
    sportMode,
    activeAsset,
    userProfile,
    availableExercises,
    clearConversation,
    saveMessageToSupabase,
    targetState,
  } = useHank();

  // Voice input hook
  const {
    isRecording,
    isTranscribing,
    startRecording,
    stopRecording,
    error: voiceError,
  } = useVoiceInput();

  // -------------------------------------------------------------------------
  // PAN RESPONDER - Cerrar deslizando hacia abajo
  // -------------------------------------------------------------------------
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => Math.abs(gestureState.dy) > 5,
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy > 0) {
          translateY.value = gestureState.dy;
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > 150) {
          // Cerrar directamente - el translateY se resetea al abrir
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          setIsOpen(false);
        } else {
          // Volver arriba
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          translateY.value = withTiming(0, { duration: 200 });
        }
      },
    })
  ).current;

  // Resetear translateY cuando el modal se abre
  useEffect(() => {
    if (isOpen) {
      translateY.value = 0;
    }
  }, [isOpen, translateY]);

  // -------------------------------------------------------------------------
  // SINCRONIZAR isOpen CON EL MÓDULO GLOBAL (sin causar re-renders en otros componentes)
  // -------------------------------------------------------------------------
  useEffect(() => {
    // Actualizar el estado global (ref) sin causar re-renders
    setHankChatOpen(isOpen);
  }, [isOpen]);

  // -------------------------------------------------------------------------
  // CERRAR CHAT CUANDO SE DETECTA UN WRITE TOOL (para ver la animación)
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (targetState.writeToolDetected && isOpen) {
      console.warn('🎬 HANK UI: Write tool detectado, cerrando chat para mostrar animación');
      setIsOpen(false);
    }
  }, [targetState.writeToolDetected, isOpen]);

  // -------------------------------------------------------------------------
  // ABRIR CHAT CUANDO LA EJECUCIÓN TERMINA EXITOSAMENTE
  // -------------------------------------------------------------------------
  useEffect(() => {
    // Registrar callback para abrir el chat cuando HANK termine de ejecutar exitosamente
    targetState.setOnExecutionSuccess(() => {
      console.warn('🎯 HANK UI: Ejecución exitosa completada, abriendo chat...');
      // Pequeño delay para que la animación de regreso termine suavemente
      setTimeout(() => {
        setIsOpen(true);
      }, 200);
    });

    // Limpiar al desmontar
    return () => {
      targetState.setOnExecutionSuccess(null);
    };
  }, [targetState]);

  // -------------------------------------------------------------------------
  // HELPER: Verificar si debe limpiar la UI del chat
  // -------------------------------------------------------------------------
  const checkAndClearUIChat = useCallback(
    (results: HankToolResult[]) => {
      // Debug: Ver qué resultados llegaron
      console.warn('🧹 checkAndClearUIChat - Revisando resultados:', results.length);
      results.forEach((r, i) => {
        console.warn(`  [${i}] success:`, r.success, 'data:', JSON.stringify(r.data || {}));
      });

      // Verificar si algún resultado tiene el flag clearUIChat
      const shouldClear = results.some(
        (r) => (r.data as { clearUIChat?: boolean })?.clearUIChat === true
      );

      // También verificar si el mensaje menciona que se limpió el historial
      // (fallback por si el flag no llegó correctamente)
      const messageMentionsClear = results.some(
        (r) =>
          r.success &&
          r.message &&
          (/historial\s+(limpiado|borrado)/i.test(r.message) ||
            /HANK_CLEAR_HISTORY/i.test(r.message))
      );

      if (shouldClear || messageMentionsClear) {
        console.warn(
          '🧹 HANK UI: Limpiando chat visual... (flag:',
          shouldClear,
          ', mensaje:',
          messageMentionsClear,
          ')'
        );
        // Resetear mensajes con solo bienvenida + notificación
        const clearedNotification: ChatMessage = {
          id: `cleared-${Date.now()}`,
          role: 'hank',
          content: '🧹 Historial limpiado. Empezamos de cero. ¿En qué te puedo ayudar?',
          timestamp: new Date(),
        };
        setMessages([getDefaultWelcomeMessage(), clearedNotification]);
        // También limpiar el contexto de conversación
        clearConversation();
        return true;
      }
      return false;
    },
    [clearConversation]
  );

  // -------------------------------------------------------------------------
  // OBTENER USER ID
  // -------------------------------------------------------------------------
  useEffect(() => {
    const getUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setUserId(user?.id || null);
    };
    getUser();
  }, []);

  // -------------------------------------------------------------------------
  // ONBOARDING PROACTIVO - Mostrar solo primera vez
  // -------------------------------------------------------------------------
  useEffect(() => {
    // Solo verificar si tenemos userId y es primera vez
    if (!userId || onboardingChecked.current) return;

    // Marcar que ya verificamos
    onboardingChecked.current = true;

    // Si es primera vez según el contexto, mostrar onboarding
    if (isFirstTime) {
      console.warn('🎉 HANK: Primera vez detectada, mostrando onboarding...');
      // Pequeño delay para que la app cargue primero
      setTimeout(() => {
        setShowOnboarding(true);
      }, 1500);
    }
  }, [userId, isFirstTime]);

  /**
   * Handler cuando el usuario completa el onboarding
   */
  const handleOnboardingComplete = useCallback((data: OnboardingData) => {
    console.warn('✅ HANK: Onboarding completado', data);
    setShowOnboarding(false);
    // Mostrar mensaje de bienvenida personalizado
    const welcomeMessage: ChatMessage = {
      id: `onboarding-complete-${Date.now()}`,
      role: 'hank',
      content:
        '🔥 ¡Perfecto! Ya te conozco mejor. Ahora puedo darte recomendaciones personalizadas. ¿Empezamos?',
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, welcomeMessage]);
  }, []);

  /**
   * Handler cuando el usuario cierra el onboarding sin completar
   */
  const handleOnboardingDismiss = useCallback(async () => {
    console.warn('⏭️ HANK: Onboarding saltado');
    setShowOnboarding(false);
    // Marcar en DB para que no vuelva a aparecer
    if (userId) {
      try {
        await supabase
          .from('user_profiles')
          .upsert({ user_id: userId, hank_first_time_shown: true }, { onConflict: 'user_id' });
      } catch (error) {
        console.error('Error marking onboarding dismissed:', error);
      }
    }
  }, [userId]);

  // -------------------------------------------------------------------------
  // CHAT UI MEMORY - Sistema de 24 horas con Supabase
  // -------------------------------------------------------------------------

  /**
   * Cargar mensajes de UI desde Supabase (sincronizado con el historial de contexto)
   */
  useEffect(() => {
    const initializeUIMessages = async () => {
      if (messagesInitialized.current || !userId) return;
      messagesInitialized.current = true;

      try {
        // La limpieza de medianoche ya se hace en HankContext con clean_old_hank_messages
        // Aquí solo cargamos los mensajes del día
        const { data: dbMessages, error } = await supabase
          .from('hank_chat_messages')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: true });

        if (error) {
          console.warn('⚠️ HANK UI: Error cargando mensajes:', error.message);
          return;
        }

        if (dbMessages && dbMessages.length > 0) {
          // Convertir de DB format a UI format
          const uiMessages: ChatMessage[] = dbMessages.map((msg: DBUIMessage) => ({
            id: msg.id,
            role: msg.role === 'model' ? 'hank' : 'user',
            content: msg.content,
            timestamp: new Date(msg.created_at),
          }));

          // Agregar mensaje de bienvenida al inicio si no hay mensajes
          const allMessages = [getDefaultWelcomeMessage(), ...uiMessages];
          console.warn(`💬 HANK UI: Cargando ${uiMessages.length} mensajes desde Supabase`);
          setMessages(allMessages);
        }
      } catch (error) {
        console.warn('⚠️ HANK UI: Error inicializando mensajes:', error);
      }
    };

    initializeUIMessages();
  }, [userId]);

  /**
   * Verificar medianoche periódicamente (cada minuto)
   * La limpieza real se hace en HankContext, aquí solo refrescamos la UI
   */
  useEffect(() => {
    if (!userId) return;

    const checkMidnight = async () => {
      // Llamar a la función de limpieza de DB
      const { data: cleanedCount, error } = await supabase.rpc('clean_old_hank_messages', {
        p_user_id: userId,
      });

      if (!error && cleanedCount && cleanedCount > 0) {
        console.warn(`🧹 HANK UI: ¡Medianoche! Limpiados ${cleanedCount} mensajes`);
        setMessages([getDefaultWelcomeMessage()]);
      }
    };

    const interval = setInterval(checkMidnight, 60000);
    return () => clearInterval(interval);
  }, [userId]);

  // Panel slide animation
  const panelY = useSharedValue(PANEL_HEIGHT);

  useEffect(() => {
    if (isOpen) {
      // Abrir sin rebote, con vibración al llegar arriba
      panelY.value = withTiming(0, { duration: 300 }, () => {
        // Vibración cuando llega arriba
        'worklet';
        // No podemos llamar Haptics directamente en worklet, usar runOnJS
      });
      // Vibración después de 300ms
      setTimeout(() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }, 300);
    } else {
      panelY.value = withTiming(PANEL_HEIGHT, { duration: 300 });
    }
  }, [isOpen, panelY]);

  const panelStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: panelY.value }],
  }));

  // -------------------------------------------------------------------------
  // HANDLERS
  // -------------------------------------------------------------------------
  const handleOpen = useCallback(() => {
    // Guard: Verificar si puede hablar con HANK
    if (!canSave('talk_to_hank')) return;
    setIsOpen(true);
  }, [canSave]);

  const handleClose = useCallback(() => {
    setIsOpen(false);
    setPendingExecution(null);
  }, []);

  const handleSend = async () => {
    // Guard: Verificar si puede hablar con HANK
    if (!canSave('talk_to_hank')) return;

    if (!inputText.trim() || isProcessing) return;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: inputText.trim(),
      timestamp: new Date(),
    };

    const messageText = inputText.trim();
    setMessages((prev) => [...prev, userMessage]);
    setInputText('');
    // Haptic feedback on send
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // Reset textarea height on web after sending
    if (Platform.OS === 'web' && textInputRef.current) {
      requestAnimationFrame(() => {
        const el = textInputRef.current as any;
        const textarea =
          el instanceof HTMLTextAreaElement ? el : el?.querySelector?.('textarea') || el;
        if (textarea?.style) textarea.style.height = 'auto';
      });
    }

    // NO cerrar el chat aquí - el useEffect detectará writeToolDetected y cerrará automáticamente
    // Esto permite que consultas/chat casual permanezcan con el chat abierto

    // Execute command
    const results = await executeCommand(messageText);

    // Verificar si hubo herramientas de ESCRITURA (no solo lectura/consultas)
    const hadWriteToolCalls = results.some(
      (r) => (r.data as { hadWriteToolCalls?: boolean })?.hadWriteToolCalls === true
    );

    // Verificar si debe limpiar la UI del chat
    if (checkAndClearUIChat(results)) {
      return; // Ya se limpió, no agregar más mensajes
    }

    // Add Hank response
    const hankMessage: ChatMessage = {
      id: (Date.now() + 1).toString(),
      role: 'hank',
      content:
        results.length > 0 && results[0].success
          ? '✅ Listo. ¿Algo más?'
          : results[0]?.message || 'Procesado.',
      timestamp: new Date(),
      results: results.length > 1 ? results : undefined,
    };

    // If the first result has a message, use it as the main content
    if (results.length === 1) {
      hankMessage.content = results[0].message;
    }

    setMessages((prev) => [...prev, hankMessage]);
    // Haptic feedback on receive
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    // Si hubo herramientas de ESCRITURA, esperar que termine la animación antes de reabrir
    if (hadWriteToolCalls) {
      // La animación ya terminó (el executeCommand es síncrono con la animación)
      // Pero agregamos un pequeño delay para que el usuario vea el resultado final
      setTimeout(() => {
        setIsOpen(true);
        setTimeout(() => {
          flatListRef.current?.scrollToEnd({ animated: true });
        }, 100);
      }, 4500); // flying(800) + working(5000) + success(400) + returning(600)
    } else {
      // Solo consulta/conversación, mantener el chat abierto y hacer scroll
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  };

  const handleMicPress = async () => {
    if (isRecording) {
      // Detener grabación manualmente (cancelar auto-stop)
      console.log('🎤 Cancelando grabación...');
      await stopRecording();
      // No procesar nada, solo detener
    } else {
      // Iniciar grabación CON auto-stop (detección de silencio)
      console.log('🎤 Iniciando grabación con auto-stop...');
      await startRecording(true, async (transcription) => {
        // Callback ejecutado automáticamente cuando auto-stop se activa
        console.log('🎤 Auto-stop activado, procesando transcripción...');

        if (transcription) {
          // Agregar mensaje del usuario
          const userMessage: ChatMessage = {
            id: Date.now().toString(),
            role: 'user',
            content: transcription,
            timestamp: new Date(),
          };
          setMessages((prev) => [...prev, userMessage]);

          // Agregar indicador de procesamiento
          const thinkingMessage: ChatMessage = {
            id: `thinking-${Date.now()}`,
            role: 'hank',
            content: '🎤 ' + transcription,
            timestamp: new Date(),
          };
          setMessages((prev) => [...prev, thinkingMessage]);

          // Ejecutar comando
          const results = await executeCommand(transcription);

          // Remover thinking
          setMessages((prev) => prev.filter((m) => !m.id.startsWith('thinking-')));

          // Verificar si debe limpiar la UI del chat
          if (checkAndClearUIChat(results)) {
            setInputText('');
            return;
          }

          const hankMessage: ChatMessage = {
            id: `hank-${Date.now()}`,
            role: 'hank',
            content: results.length > 0 ? results[0].message : 'Comando ejecutado.',
            timestamp: new Date(),
            results: results.length > 1 ? results : undefined,
          };
          setMessages((prev) => [...prev, hankMessage]);
          setInputText('');

          setTimeout(() => {
            flatListRef.current?.scrollToEnd({ animated: true });
          }, 100);
        } else if (voiceError) {
          // Mostrar error
          const errorMessage: ChatMessage = {
            id: `error-${Date.now()}`,
            role: 'hank',
            content: `❌ ${voiceError}`,
            timestamp: new Date(),
          };
          setMessages((prev) => [...prev, errorMessage]);
        }
      });
    }
  };

  // -------------------------------------------------------------------------
  // LONG PRESS HANDLERS (con confirmación)
  // -------------------------------------------------------------------------
  const handleLongPressStart = useCallback(async () => {
    console.log('🎤 Long press - Iniciando escucha...');
    setIsListening(true);

    // Vibración fuerte para indicar que está escuchando
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

    // Iniciar grabación SIN auto-stop (modo manual)
    await startRecording(false);
  }, [startRecording]);

  const handleLongPressEnd = useCallback(async () => {
    console.log('🎤 Long press - Finalizando escucha...');
    setIsListening(false);

    // Vibración suave para indicar fin
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    // Detener grabación y transcribir
    const transcription = await stopRecording();

    if (transcription) {
      // NO abrir el chat - usar toast flotante
      setIsLongPressProcessing(true);

      // Mostrar toast de procesamiento
      setVoiceToast({
        visible: true,
        type: 'processing',
        message: `"${transcription}"`,
        actionDescription: undefined,
      });

      // Agregar mensaje del usuario al historial (SÍ se guarda)
      const userMessage: ChatMessage = {
        id: Date.now().toString(),
        role: 'user',
        content: `🎤 ${transcription}`,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, userMessage]);

      // Guardar mensaje de voz en Supabase
      await saveMessageToSupabase('user', transcription);

      try {
        console.log('🤖 Analizando comando con executeCommand (analyzeOnly)...');

        // 🔧 USAR FLUJO UNIFICADO: executeCommand con analyzeOnly para obtener tool calls sin ejecutar
        // Esto incluye todos los fallbacks y manejo de errores del chat
        const analyzeResults = await executeCommand(transcription, {
          saveToHistory: false, // Ya guardamos arriba
          analyzeOnly: true,
        });

        // Extraer datos del análisis
        const analyzeData = analyzeResults[0]?.data as
          | {
              analyzeOnly?: boolean;
              toolCalls?: HankToolCall[];
              geminiMessage?: string;
            }
          | undefined;

        const toolCalls = analyzeData?.toolCalls || [];
        const geminiMessage = analyzeData?.geminiMessage || analyzeResults[0]?.message || '';

        if (toolCalls.length > 0) {
          // Separar herramientas de lectura (ejecutar directo) de escritura (pedir confirmación)
          const readOnlyTools = [
            'GYM_GET_TODAY_ROUTINE',
            'GYM_LIST_EXERCISES',
            'ASSET_READ',
            'ASSET_GET_SCHEMA',
            'ADN_GET_PROFILE',
            'ADN_GET_RECORDS',
            'PLAN_GET_MEALS',
            'PLAN_GET_MEAL_DETAILS',
            'PLAN_GET_NEXT_MEAL',
            'PLAN_GET_STACK',
            'PLAN_ANALYZE_NUTRITION',
            'PLAN_CALCULATE_MACROS',
            'SPOTIFY_GET_CURRENT_TRACK',
            'GET_USER_CONTEXT',
            'GET_FULL_USER_CONTEXT',
            'HANK_CLEAR_HISTORY',
            'HANK_GET_CAPABILITIES',
            'TRAINING_GET_STATUS',
            'TRAINING_GET_CURRENT_PLAN',
            'TRAINING_LIST_TEMPLATES',
            'PROGRESS_GET_PHOTOS',
            'PROGRESS_GET_PHOTO_DETAIL',
            'PROGRESS_COMPARE_PHOTOS',
            'PRO_GET_EXERCISE_NOTES',
            'GET_USER_GOALS',
          ];

          const writeToolCalls = toolCalls.filter((tc) => !readOnlyTools.includes(tc.tool));
          const readToolCalls = toolCalls.filter((tc) => readOnlyTools.includes(tc.tool));

          // Ejecutar herramientas de lectura directamente
          let readResults: HankToolResult[] = [];
          if (readToolCalls.length > 0) {
            console.log('✅ Ejecutando herramientas de lectura sin confirmación...');
            for (const tc of readToolCalls) {
              const toolResult = await executeTool(tc);
              if (toolResult.success) {
                readResults.push(toolResult);
              }
            }
          }

          // Verificar si algún resultado tiene flag de limpiar UI
          if (checkAndClearUIChat(readResults)) {
            setIsLongPressProcessing(false);
            setVoiceToast({ visible: false, type: 'confirm', message: '' });
            return;
          }

          // Si hay herramientas de escritura, mostrar TOAST de confirmación
          if (writeToolCalls.length > 0) {
            const actionDescription = writeToolCalls
              .map((tc) => {
                switch (tc.tool) {
                  case 'GYM_REPLACE_EXERCISE':
                    return `Reemplazar ${tc.parameters.oldExerciseName} por ${tc.parameters.newExerciseName}`;
                  case 'GYM_ADD_EXERCISE':
                    return `Agregar ${tc.parameters.exerciseName}`;
                  case 'GYM_REMOVE_EXERCISE':
                    return `Quitar ${tc.parameters.exerciseName}`;
                  case 'ASSET_ADD_SERIES':
                    return `Agregar serie: ${tc.parameters.reps || 10} reps × ${tc.parameters.weight || 0}kg`;
                  case 'ASSET_REMOVE_SERIES':
                    return `Quitar serie`;
                  case 'ASSET_REPLACE_SERIES':
                    return `Reemplazar serie: ${tc.parameters.reps || 10} reps × ${tc.parameters.weight || 0}kg`;
                  case 'ASSET_UPDATE_FIELD':
                    return `Modificar ${tc.parameters.fieldPath}`;
                  case 'ASSET_SET_SERIES':
                    return `Configurar series`;
                  case 'ADN_UPDATE_PROFILE':
                    return `Actualizar ${tc.parameters.field}: ${tc.parameters.value}`;
                  case 'ADN_ADD_MEASUREMENT':
                    return `Agregar medida: ${tc.parameters.name} = ${tc.parameters.value}`;
                  case 'ADN_REMOVE_MEASUREMENT':
                    return `Eliminar medida: ${tc.parameters.measurementName}`;
                  case 'PLAN_ADD_SUPPLEMENT':
                    return `Agregar suplemento: ${tc.parameters.name}`;
                  case 'PLAN_REMOVE_SUPPLEMENT':
                    return `Eliminar suplemento: ${tc.parameters.name}`;
                  case 'PLAN_ADD_MEAL':
                    return `Agregar comida a las ${tc.parameters.time}`;
                  case 'PLAN_REMOVE_MEAL':
                    return `Eliminar comida`;
                  case 'PLAN_UPDATE_MEAL_TIME':
                    return `Actualizar hora de comida`;
                  default:
                    return tc.tool.replace(/_/g, ' ');
                }
              })
              .join('\n• ');

            // Guardar mensaje de confirmación en el historial
            const confirmMessage: ChatMessage = {
              id: `confirm-${Date.now()}`,
              role: 'hank',
              content: `⚠️ ¿Ejecutar?\n\n• ${actionDescription}`,
              timestamp: new Date(),
              pendingConfirmation: true,
              pendingToolCalls: writeToolCalls,
            };
            setMessages((prev) => [...prev, confirmMessage]);

            // Mostrar TOAST de confirmación con delay para que Hank llegue primero
            setVoiceToast({
              visible: true,
              type: 'confirm',
              message: '¿Ejecutar este comando?',
              actionDescription: `• ${actionDescription}`,
              delayAppear: true, // Esperar a que Hank llegue
            });

            setPendingExecution({
              text: transcription,
              toolCalls: writeToolCalls,
            });

            // Vibración de alerta
            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            setIsLongPressProcessing(false);
          } else if (readResults.length > 0) {
            // Solo herramientas de lectura - mostrar toast de éxito y abrir chat
            const finalMessage = readResults.map((r) => r.message).join('\n\n');
            const hankMessage: ChatMessage = {
              id: `hank-${Date.now()}`,
              role: 'hank',
              content: finalMessage,
              timestamp: new Date(),
            };
            setMessages((prev) => [...prev, hankMessage]);
            await saveMessageToSupabase('model', finalMessage);

            // Mostrar toast de éxito brevemente y luego abrir chat
            setVoiceToast({
              visible: true,
              type: 'success',
              message: 'Información obtenida',
            });
            setTimeout(() => {
              setVoiceToast({ visible: false, type: 'confirm', message: '' });
              setIsOpen(true);
            }, 1500);
            setIsLongPressProcessing(false);
          } else {
            // Sin resultados - mostrar respuesta de Gemini
            const hankMessage: ChatMessage = {
              id: `hank-${Date.now()}`,
              role: 'hank',
              content: geminiMessage || 'Información obtenida.',
              timestamp: new Date(),
            };
            setMessages((prev) => [...prev, hankMessage]);
            await saveMessageToSupabase('model', geminiMessage || 'Información obtenida.');

            setVoiceToast({
              visible: true,
              type: 'success',
              message: geminiMessage?.substring(0, 50) || 'Listo',
            });
            setTimeout(() => {
              setVoiceToast({ visible: false, type: 'confirm', message: '' });
            }, 2000);
            setIsLongPressProcessing(false);
          }
        } else {
          // Es solo una pregunta conversacional - guardar y mostrar toast
          const hankMessage: ChatMessage = {
            id: `hank-${Date.now()}`,
            role: 'hank',
            content: geminiMessage || 'No entendí tu comando.',
            timestamp: new Date(),
          };
          setMessages((prev) => [...prev, hankMessage]);
          await saveMessageToSupabase('model', geminiMessage || 'No entendí tu comando.');

          // Mostrar toast con respuesta breve y abrir chat después
          setVoiceToast({
            visible: true,
            type: 'success',
            message: geminiMessage?.substring(0, 60) || 'Respuesta recibida',
          });
          setTimeout(() => {
            setVoiceToast({ visible: false, type: 'confirm', message: '' });
            setIsOpen(true);
          }, 2000);
          setIsLongPressProcessing(false);
        }
      } catch (error) {
        console.error('Error analizando comando:', error);
        const errorMessage: ChatMessage = {
          id: `error-${Date.now()}`,
          role: 'hank',
          content: '❌ Error al procesar tu comando. Intenta de nuevo.',
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, errorMessage]);
        await saveMessageToSupabase('model', '❌ Error al procesar tu comando.');

        setVoiceToast({
          visible: true,
          type: 'error',
          message: 'Error al procesar comando',
        });
        setTimeout(() => {
          setVoiceToast({ visible: false, type: 'confirm', message: '' });
        }, 3000);
        setIsLongPressProcessing(false);
      }
    }
  }, [stopRecording, executeCommand, checkAndClearUIChat, executeTool, saveMessageToSupabase]);

  // Handler para confirmar desde el toast de voz
  const handleVoiceConfirm = useCallback(async () => {
    if (!pendingExecution) return;

    console.log('✅ Ejecutando acciones confirmadas desde toast...');

    // Vibración de confirmación
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    // Cerrar el toast - Hank irá directo al target
    setVoiceToast({ visible: false, type: 'confirm', message: '' });

    // EJECUTAR LAS HERRAMIENTAS (Hank volará directo al target)
    const results: HankToolResult[] = [];
    for (let i = 0; i < pendingExecution.toolCalls.length; i++) {
      const toolCall = pendingExecution.toolCalls[i];
      const result = await executeTool(toolCall);
      results.push(result);
    }

    // Guardar en historial
    const successCount = results.filter((r) => r.success).length;
    const resultMessage =
      successCount === results.length
        ? `✅ ${successCount} acción(es) ejecutada(s) correctamente`
        : `⚠️ ${successCount}/${results.length} acciones completadas`;

    const hankMessage: ChatMessage = {
      id: `result-${Date.now()}`,
      role: 'hank',
      content: resultMessage + '\n\n' + results.map((r) => r.message).join('\n'),
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, hankMessage]);
    await saveMessageToSupabase('model', resultMessage);

    // Vibración de éxito (el badge de éxito se muestra en HankTargetHighlight)
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    // Limpiar ejecución pendiente
    setPendingExecution(null);
  }, [pendingExecution, executeTool, saveMessageToSupabase]);

  // Handler para cancelar desde el toast de voz
  const handleVoiceCancel = useCallback(async () => {
    console.log('❌ Comando cancelado desde toast');

    // Cerrar el toast para que Hank regrese a casa
    setVoiceToast({ visible: false, type: 'confirm', message: '' });

    // Vibración de cancelación
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    // Guardar en historial
    const cancelMessage: ChatMessage = {
      id: `cancel-${Date.now()}`,
      role: 'hank',
      content: '❌ Comando cancelado',
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, cancelMessage]);
    await saveMessageToSupabase('model', '❌ Comando cancelado');

    // Limpiar ejecución pendiente
    setPendingExecution(null);
  }, [saveMessageToSupabase]);

  // Confirmar ejecución pendiente - USA ANIMACIÓN DE VUELO (no Takeover)
  const handleConfirmExecution = useCallback(async () => {
    if (!pendingExecution) return;

    console.log('✅ Ejecutando acciones confirmadas...');

    // Vibración de confirmación
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    // CERRAR EL CHAT para ver la animación de vuelo
    setIsOpen(false);

    // Vibración fuerte para indicar inicio
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

    // Pequeña pausa para que el chat se cierre y se vea el FAB
    await new Promise((resolve) => setTimeout(resolve, 400));

    // EJECUTAR LAS HERRAMIENTAS (la animación y delay ya están dentro de executeTool)
    const results: HankToolResult[] = [];
    for (let i = 0; i < pendingExecution.toolCalls.length; i++) {
      const toolCall = pendingExecution.toolCalls[i];
      const result = await executeTool(toolCall);
      results.push(result);
    }

    // Guardar resultados para después
    takeoverResultRef.current = results;

    // Vibración de éxito
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    // Pequeña pausa antes de abrir el chat
    await new Promise((resolve) => setTimeout(resolve, 300));

    // ABRIR EL CHAT Y MOSTRAR RESULTADO
    setIsOpen(true);

    // Verificar si debe limpiar la UI del chat
    if (checkAndClearUIChat(results)) {
      setPendingExecution(null);
      takeoverResultRef.current = null;
      return;
    }

    // Agregar resultado al chat
    const resultMessage: ChatMessage = {
      id: `result-${Date.now()}`,
      role: 'hank',
      content: results.every((r) => r.success)
        ? '✅ ¡Hecho! Los cambios fueron aplicados.'
        : '⚠️ Algunas acciones fallaron.',
      timestamp: new Date(),
      results: results.length > 1 ? results : undefined,
    };

    // Si solo hay un resultado, mostrar su mensaje
    if (results.length === 1 && results[0].message) {
      resultMessage.content = `✅ ${results[0].message}`;
    }

    setMessages((prev) => prev.filter((m) => !m.pendingConfirmation).concat(resultMessage));
    await saveMessageToSupabase('model', resultMessage.content);
    setPendingExecution(null);
    takeoverResultRef.current = null;

    setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated: true });
    }, 100);
  }, [pendingExecution, executeTool, checkAndClearUIChat, saveMessageToSupabase]);

  // Cancelar ejecución pendiente
  const handleCancelExecution = useCallback(async () => {
    console.log('❌ Ejecución cancelada');

    // Vibración de error
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);

    const cancelMessage: ChatMessage = {
      id: `cancel-${Date.now()}`,
      role: 'hank',
      content: '🚫 Acción cancelada.',
      timestamp: new Date(),
    };

    setMessages((prev) => prev.filter((m) => !m.pendingConfirmation).concat(cancelMessage));
    setPendingExecution(null);
  }, []);

  // -------------------------------------------------------------------------
  // RENDER
  // -------------------------------------------------------------------------

  // No renderizar en Feed
  if (isHiddenInFeed) {
    return null;
  }

  return (
    <>
      {/* HANK TAKEOVER - Efecto fullscreen cuando ejecuta cambios */}
      <HankTakeover isActive={isTakeover} statusText={takeoverStatus} />

      {/* Voice Confirmation Toast - Notificación flotante para comandos de voz */}
      <VoiceConfirmationToast
        visible={voiceToast.visible}
        type={voiceToast.type}
        message={voiceToast.message}
        actionDescription={voiceToast.actionDescription}
        onConfirm={handleVoiceConfirm}
        onCancel={handleVoiceCancel}
        delayAppear={voiceToast.delayAppear}
      />

      {/* FAB Button - Always visible (oculto durante takeover) */}
      {!isTakeover && (
        <HankFAB
          onPress={handleOpen}
          onLongPressStart={handleLongPressStart}
          onLongPressEnd={handleLongPressEnd}
          isProcessing={isProcessing || isTranscribing}
          isListening={isListening || isRecording}
          bottomOffset={calculateFabPositions(insets.bottom).hank}
          rightOffset={calculateFabPositions(insets.bottom).right}
          animationPhase={targetState.animationPhase}
          target={targetState.currentTarget}
          voiceToastPosition={
            voiceToast.visible && voiceToast.type === 'confirm' ? VOICE_TOAST_POSITION : null
          }
        />
      )}

      {/* Target Highlight Overlay */}
      <HankTargetHighlight />

      {/* Chat Panel Modal */}
      <Modal visible={isOpen} transparent={true} animationType="slide" onRequestClose={handleClose}>
        <View
          ref={Platform.OS === 'web' ? modalWebRef : undefined}
          style={[
            Platform.OS === 'web'
              ? { position: 'absolute' as any, bottom: 0, left: 0, right: 0, height: '100%' }
              : { flex: 1 },
          ]}
        >
          {/* Spacer top - empuja el panel hacia abajo */}
          <View style={{ height: Math.max(insets.top, 20) }} />
          <Animated.View
            style={[
              {
                flex: 1,
                backgroundColor: '#0a0a0a',
                borderTopLeftRadius: 24,
                borderTopRightRadius: 24,
                borderTopWidth: 2,
                borderTopColor: 'rgba(220, 38, 38, 0.5)',
                overflow: 'hidden',
              },
              animatedPanelStyle,
            ]}
          >
            {/* Línea de acento superior SAVAGE RED */}
            <View
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                height: 3,
                backgroundColor: '#DC2626',
                shadowColor: '#DC2626',
                shadowOffset: { width: 0, height: 0 },
                shadowOpacity: 0.8,
                shadowRadius: 10,
                zIndex: 10,
              }}
            />

            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : undefined}
              className="flex-1"
              enabled={Platform.OS !== 'web'}
            >
              {/* Header con PanResponder para cerrar deslizando */}
              <View
                {...panResponder.panHandlers}
                className="flex-row items-center justify-between px-5 pt-5 pb-4 border-b border-zinc-800/50"
              >
                {/* Indicador de drag */}
                <View className="absolute top-2 left-0 right-0 items-center z-10">
                  <View className="w-12 h-1.5 bg-zinc-600 rounded-full" />
                </View>

                <View className="flex-row items-center">
                  <View className="w-10 h-10 rounded-full bg-red-600/20 items-center justify-center mr-3">
                    <Bot size={22} color="#DC2626" />
                  </View>
                  <View>
                    <Text className="text-white font-bold text-lg">HANK</Text>
                    <Text className="text-zinc-500 text-xs font-mono">
                      {screenContext.module.toUpperCase()} • {sportMode || 'MODO'}
                    </Text>
                  </View>
                </View>

                {/* Espacio vacío para mantener layout centrado */}
                <View className="w-10" />
              </View>

              {/* Messages */}
              <FlatList
                ref={flatListRef}
                data={messages}
                keyExtractor={(item) => item.id}
                contentContainerStyle={{
                  padding: 16,
                  paddingBottom: 8,
                }}
                renderItem={({ item }) => <MessageBubble message={item} />}
                ListFooterComponent={
                  <>
                    {(isProcessing || isLongPressProcessing) && <ThinkingIndicator />}
                    {pendingExecution && (
                      <ConfirmationButtons
                        onConfirm={handleConfirmExecution}
                        onCancel={handleCancelExecution}
                        isLoading={isProcessing}
                      />
                    )}
                  </>
                }
                onContentSizeChange={() => {
                  flatListRef.current?.scrollToEnd({ animated: true });
                }}
              />

              {/* Input Area - con padding para la barra de navegación */}
              <View
                className="flex-row items-end px-4 py-3 border-t border-zinc-800 bg-black"
                style={{ paddingBottom: Math.max(insets.bottom, 12) }}
              >
                <TextInput
                  ref={textInputRef}
                  value={inputText}
                  onChangeText={(text) => {
                    setInputText(text);
                    requestAnimationFrame(autoResizeInput);
                  }}
                  placeholder={
                    isRecording
                      ? '🎤 Grabando...'
                      : isTranscribing
                        ? '⏳ Transcribiendo...'
                        : 'Escribe un comando...'
                  }
                  placeholderTextColor={isRecording ? '#DC2626' : '#71717A'}
                  className="flex-1 bg-zinc-900 rounded-2xl px-4 text-white text-base mr-2"
                  style={[
                    {
                      paddingTop: 10,
                      paddingBottom: 10,
                      maxHeight: SCREEN_HEIGHT * 0.4,
                    },
                    Platform.OS === 'web' && ({ resize: 'none', overflow: 'auto' } as any),
                  ]}
                  multiline
                  numberOfLines={1}
                  scrollEnabled
                  onSubmitEditing={handleSend}
                  blurOnSubmit={false}
                  returnKeyType="default"
                  editable={!isProcessing && !isRecording && !isTranscribing && !pendingExecution}
                />

                {/* Mic Button */}
                <TouchableOpacity
                  onPress={handleMicPress}
                  disabled={isProcessing || isTranscribing || !!pendingExecution}
                  className={`w-11 h-11 rounded-full items-center justify-center mr-2 ${
                    isRecording ? 'bg-red-600' : 'bg-zinc-900'
                  }`}
                >
                  {isRecording ? (
                    <MicOff size={20} color="#FFFFFF" />
                  ) : isTranscribing ? (
                    <Mic size={20} color="#DC2626" />
                  ) : (
                    <Mic size={20} color="#A1A1AA" />
                  )}
                </TouchableOpacity>

                {/* Send Button - Animated */}
                <AnimatedSendButton
                  hasText={!!inputText.trim()}
                  isDisabled={isProcessing || !!pendingExecution}
                  onPress={handleSend}
                />
              </View>
            </KeyboardAvoidingView>
          </Animated.View>
        </View>
      </Modal>

      {/* Hank Onboarding Modal - Primera vez */}
      {userId && (
        <HankOnboarding
          visible={showOnboarding}
          onComplete={handleOnboardingComplete}
          onDismiss={handleOnboardingDismiss}
          userId={userId}
        />
      )}
    </>
  );
};

export default HankOverlay;
