import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  ScrollView,
  PanResponder,
  Dimensions,
} from 'react-native';
import {
  Dumbbell,
  Bike,
  Car,
  Waves,
  ChevronDown,
  Check,
  Plus,
  Lock,
  Trash2,
  LucideIcon,
} from 'lucide-react-native';
import * as Haptics from '../../lib/haptics';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  runOnJS,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSport, Sport } from '../../context/SportContext';
import { Alert } from '../../lib/alert';

// Deportes disponibles actualmente (los demás están "próximamente")
const AVAILABLE_SPORTS = ['GYM'];

// ============================================================================
// MAPA DE ICONOS POR DEPORTE
// ============================================================================
const SPORT_ICONS: Record<string, LucideIcon> = {
  GYM: Dumbbell,
  MOTO: Bike,
  AUTO: Car,
  SURF: Waves,
};

const SPORT_COLORS: Record<string, string> = {
  GYM: '#DC2626',
  MOTO: '#F97316',
  AUTO: '#EAB308',
  SURF: '#0EA5E9',
};

// Ancho para revelar el botón de desactivar
const SWIPE_THRESHOLD = 80;
const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ============================================================================
// SWIPEABLE SPORT ITEM - Item con swipe left para desactivar
// ============================================================================
interface SwipeableSportItemProps {
  sport: Sport;
  isActive: boolean;
  isAvailable: boolean;
  sportColor: string;
  onSelect: () => void;
  onDeactivate: () => void;
  canDeactivate: boolean; // No se puede desactivar si es el único deporte
}

function SwipeableSportItem({
  sport,
  isActive,
  isAvailable,
  sportColor,
  onSelect,
  onDeactivate,
  canDeactivate,
}: SwipeableSportItemProps) {
  const translateX = useSharedValue(0);
  const SportIcon = SPORT_ICONS[sport.code] || Dumbbell;

  const handleDeactivate = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    Alert.alert(
      '⚠️ Desactivar Deporte',
      `¿Quieres quitar ${sport.name} de tu lista?\n\nTus datos y progreso se conservarán. Podrás reactivarlo cuando quieras.`,
      [
        {
          text: 'Cancelar',
          style: 'cancel',
          onPress: () => {
            translateX.value = withSpring(0);
          },
        },
        {
          text: 'Desactivar',
          style: 'destructive',
          onPress: () => {
            translateX.value = withTiming(0, { duration: 200 });
            onDeactivate();
          },
        },
      ]
    );
  };

  const panGesture = Gesture.Pan()
    .activeOffsetX([-10, 10])
    .onUpdate((event) => {
      // Solo permitir swipe a la izquierda si puede desactivar
      if (canDeactivate && event.translationX < 0) {
        translateX.value = Math.max(event.translationX, -SWIPE_THRESHOLD - 20);
      }
    })
    .onEnd((event) => {
      if (canDeactivate && event.translationX < -SWIPE_THRESHOLD / 2) {
        // Mantener abierto mostrando el botón
        translateX.value = withSpring(-SWIPE_THRESHOLD);
        runOnJS(Haptics.impactAsync)(Haptics.ImpactFeedbackStyle.Medium);
      } else {
        translateX.value = withSpring(0);
      }
    });

  const tapGesture = Gesture.Tap().onEnd(() => {
    if (translateX.value < -10) {
      // Si está abierto, cerrar
      translateX.value = withSpring(0);
    } else {
      // Si está cerrado, seleccionar
      runOnJS(onSelect)();
    }
  });

  const composedGesture = Gesture.Race(panGesture, tapGesture);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const deleteButtonStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      translateX.value,
      [-SWIPE_THRESHOLD, -20, 0],
      [1, 0.5, 0],
      Extrapolation.CLAMP
    ),
  }));

  return (
    <View className="mb-2 overflow-hidden rounded-xl">
      {/* Botón de desactivar (detrás) */}
      {canDeactivate && (
        <Animated.View
          style={[
            {
              position: 'absolute',
              right: 0,
              top: 0,
              bottom: 0,
              width: SWIPE_THRESHOLD,
              backgroundColor: '#DC2626',
              justifyContent: 'center',
              alignItems: 'center',
              borderTopRightRadius: 12,
              borderBottomRightRadius: 12,
            },
            deleteButtonStyle,
          ]}
        >
          <TouchableOpacity
            onPress={handleDeactivate}
            className="flex-1 w-full items-center justify-center"
          >
            <Trash2 color="#FFF" size={22} />
            <Text className="text-white text-xs font-bold mt-1">Quitar</Text>
          </TouchableOpacity>
        </Animated.View>
      )}

      {/* Contenido principal (swipeable) */}
      <GestureDetector gesture={composedGesture}>
        <Animated.View
          style={[
            {
              backgroundColor: isActive ? `${sportColor}20` : '#27272a',
              borderWidth: isActive ? 1 : 0,
              borderColor: sportColor,
              opacity: isAvailable ? 1 : 0.6,
              borderRadius: 12,
            },
            animatedStyle,
          ]}
          className="flex-row items-center p-4"
        >
          <View
            className="w-12 h-12 rounded-full items-center justify-center"
            style={{ backgroundColor: `${sportColor}30` }}
          >
            <SportIcon color={sportColor} size={24} />
          </View>

          <View className="flex-1 ml-4">
            <View className="flex-row items-center">
              <Text className="text-white font-bold text-base">{sport.name}</Text>
              {!isAvailable && (
                <View className="ml-2 px-2 py-0.5 bg-zinc-700 rounded">
                  <Text className="text-zinc-400 text-xs font-medium">PRONTO</Text>
                </View>
              )}
            </View>
            <Text className="text-zinc-500 text-sm">{sport.description}</Text>
            {canDeactivate && (
              <Text className="text-zinc-600 text-xs mt-1">← Desliza para quitar</Text>
            )}
          </View>

          {isActive && isAvailable && (
            <View
              className="w-8 h-8 rounded-full items-center justify-center"
              style={{ backgroundColor: sportColor }}
            >
              <Check color="white" size={18} strokeWidth={3} />
            </View>
          )}

          {!isAvailable && (
            <View className="w-8 h-8 rounded-full items-center justify-center bg-zinc-700">
              <Lock color="#71717a" size={16} />
            </View>
          )}
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

// ============================================================================
// SPORT PILL (Botón compacto para mostrar deporte activo)
// ============================================================================
interface SportPillProps {
  onPress: () => void;
}

export function SportPill({ onPress }: SportPillProps) {
  const { activeSport } = useSport();

  const sportCode = activeSport?.code || 'GYM';
  const SportIcon = SPORT_ICONS[sportCode] || Dumbbell;
  const sportColor = SPORT_COLORS[sportCode] || '#DC2626';

  return (
    <TouchableOpacity
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
      className="flex-row items-center px-3 py-2 rounded-full border"
      style={{ borderColor: sportColor, backgroundColor: `${sportColor}15` }}
    >
      <SportIcon color={sportColor} size={18} />
      <Text className="ml-2 font-bold text-sm" style={{ color: sportColor }}>
        {sportCode}
      </Text>
      <ChevronDown color={sportColor} size={16} className="ml-1" />
    </TouchableOpacity>
  );
}

// ============================================================================
// SPORT SWITCHER MODAL
// ============================================================================
interface SportSwitcherModalProps {
  visible: boolean;
  onClose: () => void;
}

export function SportSwitcherModal({ visible, onClose }: SportSwitcherModalProps) {
  const { activeSport, allSports, userSports, setActiveSport, addUserSport, removeUserSport } =
    useSport();

  // -------------------------------------------------------------------------
  // PAN RESPONDER - Cerrar deslizando hacia abajo
  // -------------------------------------------------------------------------
  const translateY = useSharedValue(0);

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
          onClose();
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
    if (visible) {
      translateY.value = 0;
    }
  }, [visible, translateY]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const handleSelectSport = async (sport: Sport) => {
    // Verificar si el deporte está disponible
    if (!AVAILABLE_SPORTS.includes(sport.code)) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      Alert.alert(
        '🚧 Próximamente',
        `${sport.name} estará disponible muy pronto.\n\nEstamos trabajando para traerte la mejor experiencia en ${sport.name.toLowerCase()}.`,
        [{ text: 'Entendido', style: 'default' }]
      );
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await setActiveSport(sport.code);
    onClose();
  };

  const handleAddSport = async (sport: Sport) => {
    // Verificar si el deporte está disponible antes de agregar
    if (!AVAILABLE_SPORTS.includes(sport.code)) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      Alert.alert(
        '🚧 Próximamente',
        `${sport.name} estará disponible muy pronto.\n\nTe notificaremos cuando esté listo.`,
        [{ text: 'OK', style: 'default' }]
      );
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await addUserSport(sport.id);
  };

  // Deportes que el usuario ya tiene
  const userSportIds = userSports.map((us) => us.sport_id);

  // Deportes disponibles para agregar
  const availableSports = allSports.filter((s) => !userSportIds.includes(s.id));

  // Deportes del usuario
  const mySports = allSports.filter((s) => userSportIds.includes(s.id));

  return (
    <Modal visible={visible} transparent={true} animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 bg-transparent justify-end">
        <Animated.View
          style={[
            {
              height: '70%',
              backgroundColor: '#0a0a0a',
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              borderTopWidth: 2,
              borderTopColor: 'rgba(220, 38, 38, 0.5)',
              overflow: 'hidden',
            },
            animatedStyle,
          ]}
        >
          {/* Línea de acento superior */}
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

          {/* Header completo - Draggable para cerrar */}
          <View {...panResponder.panHandlers} className="border-b border-zinc-800">
            {/* Handle */}
            <View className="items-center pt-4 pb-2">
              <View className="w-12 h-1.5 bg-zinc-600 rounded-full" />
            </View>

            {/* Títulos */}
            <View className="px-6 pb-4">
              <Text className="text-white font-bold text-xl">Cambiar Deporte</Text>
              <Text className="text-zinc-500 text-sm mt-1">Desliza para cerrar</Text>
            </View>
          </View>

          <ScrollView className="px-6 py-4">
            {/* Mis Deportes */}
            {mySports.length > 0 && (
              <View className="mb-6">
                <Text className="text-zinc-500 font-semibold text-xs mb-3 tracking-wider">
                  MIS DEPORTES
                </Text>
                <GestureHandlerRootView>
                  {mySports.map((sport) => {
                    const isActive = activeSport?.id === sport.id;
                    const sportColor = SPORT_COLORS[sport.code] || '#DC2626';
                    const isAvailable = AVAILABLE_SPORTS.includes(sport.code);
                    // No se puede desactivar si es el único deporte activo
                    const canDeactivate = mySports.length > 1;

                    return (
                      <SwipeableSportItem
                        key={sport.id}
                        sport={sport}
                        isActive={isActive}
                        isAvailable={isAvailable}
                        sportColor={sportColor}
                        onSelect={() => handleSelectSport(sport)}
                        onDeactivate={() => removeUserSport(sport.id)}
                        canDeactivate={canDeactivate}
                      />
                    );
                  })}
                </GestureHandlerRootView>
              </View>
            )}

            {/* Agregar Deporte */}
            {availableSports.length > 0 && (
              <View className="mb-6">
                <Text className="text-zinc-500 font-semibold text-xs mb-3 tracking-wider">
                  AGREGAR DEPORTE
                </Text>
                {availableSports.map((sport) => {
                  const SportIcon = SPORT_ICONS[sport.code] || Dumbbell;
                  const sportColor = SPORT_COLORS[sport.code] || '#DC2626';
                  const isAvailable = AVAILABLE_SPORTS.includes(sport.code);

                  return (
                    <TouchableOpacity
                      key={sport.id}
                      onPress={() => handleAddSport(sport)}
                      className="flex-row items-center p-4 rounded-xl mb-2 bg-zinc-800/50 border border-dashed border-zinc-700"
                      style={{ opacity: isAvailable ? 1 : 0.6 }}
                    >
                      <View
                        className="w-12 h-12 rounded-full items-center justify-center"
                        style={{ backgroundColor: `${sportColor}20` }}
                      >
                        <SportIcon color={sportColor} size={24} />
                      </View>

                      <View className="flex-1 ml-4">
                        <View className="flex-row items-center">
                          <Text className="text-zinc-400 font-bold text-base">{sport.name}</Text>
                          {!isAvailable && (
                            <View className="ml-2 px-2 py-0.5 bg-zinc-700 rounded">
                              <Text className="text-zinc-500 text-xs font-medium">PRONTO</Text>
                            </View>
                          )}
                        </View>
                        <Text className="text-zinc-600 text-sm">{sport.description}</Text>
                      </View>

                      {isAvailable ? (
                        <View className="w-8 h-8 rounded-full items-center justify-center bg-zinc-700">
                          <Plus color="#a1a1aa" size={18} />
                        </View>
                      ) : (
                        <View className="w-8 h-8 rounded-full items-center justify-center bg-zinc-800">
                          <Lock color="#52525b" size={16} />
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {/* Espacio inferior */}
            <View className="h-8" />
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

// ============================================================================
// SPORT SWITCHER COMPLETO (Pill + Modal)
// ============================================================================
export function SportSwitcher() {
  const [modalVisible, setModalVisible] = useState(false);

  return (
    <>
      <SportPill onPress={() => setModalVisible(true)} />
      <SportSwitcherModal visible={modalVisible} onClose={() => setModalVisible(false)} />
    </>
  );
}

export default SportSwitcher;
