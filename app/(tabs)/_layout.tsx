import { Tabs, usePathname, useRouter } from 'expo-router';
import { BottomTabBar } from '@react-navigation/bottom-tabs';
import { View, Text, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Play,
  User,
  Crosshair,
  Dumbbell,
  Utensils,
  Warehouse,
  Flag,
  Sailboat,
  Waves,
  Music,
  Camera,
  CameraOff,
  ChevronUp,
  LucideIcon,
} from 'lucide-react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  withSequence,
  withDelay,
  withSpring,
  Easing,
} from 'react-native-reanimated';
import { useEffect, useRef, useCallback, useState, useMemo } from 'react';
import { PanResponder, Dimensions, Animated as RNAnimated } from 'react-native';
import { useAuth, useProRecording } from '../_layout';
import { useSport } from '../../context/SportContext';
import FloatingLoginButton from '../../components/auth/FloatingLoginButton';
import { HankOverlay } from '../../components/hank/HankOverlay';
import { SpotifyOverlay } from '../../components/spotify/SpotifyOverlay';
import * as Haptics from '../../lib/haptics';
import { supabase } from '../../lib/supabase';

// ============================================================================
// ED HARDY COLORS
// ============================================================================
const ED_HARDY = {
  black: '#000000',
  fireRed: '#DC2626',
  fireOrange: '#F97316',
  fireGold: '#FBBF24',
  dragonGreen: '#22C55E',
  dragonBlue: '#0EA5E9',
  neonRed: '#FF3B3B',
  zinc800: '#27272a',
  zinc600: '#52525b',
};

// ============================================================================
// MAPA DE ICONOS POR NOMBRE
// ============================================================================
const ICON_MAP: Record<string, LucideIcon> = {
  Play,
  User,
  Crosshair,
  Dumbbell,
  Utensils,
  Warehouse,
  Flag,
  Sailboat,
  Waves,
};

const getIconComponent = (iconName: string): LucideIcon => {
  return ICON_MAP[iconName] || Dumbbell;
};

// Hook para detectar módulo anterior y si PRO está activo
function useProNavigation() {
  const pathname = usePathname();
  const previousModuleRef = useRef<string | null>(null);
  const isProActive = pathname === '/pro' || pathname === '/pro/index';

  useEffect(() => {
    if (!isProActive && pathname) {
      previousModuleRef.current = pathname;
    }
  }, [pathname, isProActive]);

  return {
    isProActive,
    previousModule: previousModuleRef.current,
  };
}

// Componente de icono con glow pulsante sincronizado
function SyncedGlowIcon({
  Icon,
  color,
  size,
  isSource,
  fill,
  accentColor = '#DC2626',
}: {
  Icon: any;
  color: string;
  size: number;
  isSource: boolean;
  fill?: string;
  accentColor?: string;
}) {
  const glowOpacity = useSharedValue(0);
  const glowScale = useSharedValue(1);

  useEffect(() => {
    if (isSource) {
      // Pulso sincronizado
      glowOpacity.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 800, easing: Easing.inOut(Easing.ease) }),
          withTiming(0.4, { duration: 800, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        true
      );
      glowScale.value = withRepeat(
        withSequence(
          withTiming(1.4, { duration: 800, easing: Easing.inOut(Easing.ease) }),
          withTiming(1.2, { duration: 800, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        true
      );
    } else {
      glowOpacity.value = withTiming(0, { duration: 300 });
      glowScale.value = withTiming(1, { duration: 300 });
    }
  }, [isSource]);

  const glowStyle = useAnimatedStyle(() => ({
    position: 'absolute',
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: accentColor,
    opacity: glowOpacity.value * 0.5,
    transform: [{ scale: glowScale.value }],
  }));

  return (
    <View style={{ alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={glowStyle} />
      <Icon
        color={isSource ? accentColor : color}
        size={size}
        fill={isSource ? accentColor : fill}
      />
    </View>
  );
}

// Línea de conexión animada en el borde superior
function ConnectionLine({
  isVisible,
  sourceIndex,
}: {
  isVisible: boolean;
  sourceIndex: number; // 0=FEED, 1=ADN, 3=GYM, 4=PLAN (PRO es 2)
}) {
  const lineProgress = useSharedValue(0);
  const lineOpacity = useSharedValue(0);

  useEffect(() => {
    if (isVisible && sourceIndex !== -1) {
      lineOpacity.value = withTiming(1, { duration: 200 });
      lineProgress.value = 0;
      lineProgress.value = withDelay(
        100,
        withTiming(1, { duration: 400, easing: Easing.out(Easing.cubic) })
      );
    } else {
      lineOpacity.value = withTiming(0, { duration: 200 });
      lineProgress.value = withTiming(0, { duration: 200 });
    }
  }, [isVisible, sourceIndex]);

  const lineStyle = useAnimatedStyle(() => {
    // Calcular posiciones (5 tabs, PRO está en posición 2)
    const tabWidth = 100 / 5;
    const proCenter = 2 * tabWidth + tabWidth / 2; // Centro de PRO en %
    const sourceCenter = sourceIndex * tabWidth + tabWidth / 2; // Centro del módulo origen

    const startX = Math.min(proCenter, sourceCenter);
    const endX = Math.max(proCenter, sourceCenter);
    const totalWidth = endX - startX;

    // La línea crece desde el origen hacia PRO
    const isLeftOfPro = sourceIndex < 2;
    const currentWidth = totalWidth * lineProgress.value;

    return {
      position: 'absolute',
      top: 0,
      left: isLeftOfPro ? `${startX + (totalWidth - currentWidth)}%` : `${startX}%`,
      width: `${currentWidth}%`,
      height: 2,
      backgroundColor: '#DC2626',
      opacity: lineOpacity.value,
      shadowColor: '#DC2626',
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.8,
      shadowRadius: 4,
    };
  });

  // Punto en el origen
  const dotStyle = useAnimatedStyle(() => {
    const tabWidth = 100 / 5;
    const sourceCenter = sourceIndex * tabWidth + tabWidth / 2;

    return {
      position: 'absolute',
      top: -3,
      left: `${sourceCenter}%`,
      marginLeft: -4,
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: '#DC2626',
      opacity: lineOpacity.value,
      transform: [{ scale: lineProgress.value }],
      shadowColor: '#DC2626',
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 1,
      shadowRadius: 6,
    };
  });

  // Punto en PRO
  const proDotStyle = useAnimatedStyle(() => {
    const tabWidth = 100 / 5;
    const proCenter = 2 * tabWidth + tabWidth / 2;

    return {
      position: 'absolute',
      top: -3,
      left: `${proCenter}%`,
      marginLeft: -4,
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: '#DC2626',
      opacity: lineOpacity.value,
      transform: [{ scale: lineProgress.value }],
      shadowColor: '#DC2626',
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 1,
      shadowRadius: 6,
    };
  });

  if (sourceIndex === -1) return null;

  return (
    <>
      <Animated.View style={lineStyle} />
      <Animated.View style={dotStyle} />
      <Animated.View style={proDotStyle} />
    </>
  );
}

// Componente para el icono PRO con indicadores dinámicos
function ProTabIcon({ focused, onTabPress }: { focused: boolean; onTabPress: () => void }) {
  const { isRecording, recordingTime, hasSpotify, exerciseName, takePhoto } = useProRecording();

  // Refs para PanResponder (mismo patrón que Spotify)
  const focusedRef = useRef(focused);
  const isRecordingRef = useRef(isRecording);
  const takePhotoRef = useRef(takePhoto);
  const onTabPressRef = useRef(onTabPress);
  const startPos = useRef({ x: 0, y: 0 });
  const isDragging = useRef(false);
  useEffect(() => {
    focusedRef.current = focused;
  }, [focused]);
  useEffect(() => {
    isRecordingRef.current = isRecording;
  }, [isRecording]);
  useEffect(() => {
    takePhotoRef.current = takePhoto;
  }, [takePhoto]);
  useEffect(() => {
    onTabPressRef.current = onTabPress;
  }, [onTabPress]);

  const pulseScale = useSharedValue(1);
  const hintOpacity = useSharedValue(0);
  const fabTranslateY = useSharedValue(0);
  const fabScale = useSharedValue(1);
  const waveY1 = useSharedValue(0);
  const waveY2 = useSharedValue(0);
  const waveY3 = useSharedValue(0);
  const waveOpacity1 = useSharedValue(0);
  const waveOpacity2 = useSharedValue(0);
  const waveOpacity3 = useSharedValue(0);

  useEffect(() => {
    if (isRecording) {
      pulseScale.value = withRepeat(
        withSequence(
          withTiming(1.15, { duration: 600, easing: Easing.inOut(Easing.ease) }),
          withTiming(1, { duration: 600, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        true
      );
    } else {
      pulseScale.value = withTiming(1, { duration: 200 });
    }
  }, [isRecording]);

  // Animación de ondas: translateY hacia arriba (no scale)
  useEffect(() => {
    if (focused && !isRecording) {
      hintOpacity.value = withDelay(800, withTiming(1, { duration: 400 }));

      // Onda 1: sube y se desvanece
      waveY1.value = withRepeat(
        withSequence(
          withTiming(-30, { duration: 1200, easing: Easing.out(Easing.ease) }),
          withTiming(0, { duration: 0 })
        ),
        -1
      );
      waveOpacity1.value = withRepeat(
        withSequence(withTiming(0.8, { duration: 100 }), withTiming(0, { duration: 1100 })),
        -1
      );

      // Onda 2: 400ms desfase
      waveY2.value = withDelay(
        400,
        withRepeat(
          withSequence(
            withTiming(-30, { duration: 1200, easing: Easing.out(Easing.ease) }),
            withTiming(0, { duration: 0 })
          ),
          -1
        )
      );
      waveOpacity2.value = withDelay(
        400,
        withRepeat(
          withSequence(withTiming(0.5, { duration: 100 }), withTiming(0, { duration: 1100 })),
          -1
        )
      );

      // Onda 3: 800ms desfase
      waveY3.value = withDelay(
        800,
        withRepeat(
          withSequence(
            withTiming(-30, { duration: 1200, easing: Easing.out(Easing.ease) }),
            withTiming(0, { duration: 0 })
          ),
          -1
        )
      );
      waveOpacity3.value = withDelay(
        800,
        withRepeat(
          withSequence(withTiming(0.4, { duration: 100 }), withTiming(0, { duration: 1100 })),
          -1
        )
      );
    } else {
      hintOpacity.value = withTiming(0, { duration: 200 });
      waveOpacity1.value = withTiming(0, { duration: 200 });
      waveOpacity2.value = withTiming(0, { duration: 200 });
      waveOpacity3.value = withTiming(0, { duration: 200 });
      waveY1.value = withTiming(0, { duration: 200 });
      waveY2.value = withTiming(0, { duration: 200 });
      waveY3.value = withTiming(0, { duration: 200 });
    }
  }, [focused, isRecording]);

  // Animated styles
  const buttonStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value * fabScale.value }, { translateY: fabTranslateY.value }],
  }));

  const hintAnimatedStyle = useAnimatedStyle(() => ({
    opacity: hintOpacity.value,
  }));

  // 3 semicírculos que suben — solo arco superior visible
  const ARC_W = 50;
  const ARC_H = 14; // mitad del arco visible

  const wave1Style = useAnimatedStyle(() => ({
    opacity: waveOpacity1.value,
    transform: [{ translateY: waveY1.value }],
  }));
  const wave2Style = useAnimatedStyle(() => ({
    opacity: waveOpacity2.value,
    transform: [{ translateY: waveY2.value }],
  }));
  const wave3Style = useAnimatedStyle(() => ({
    opacity: waveOpacity3.value,
    transform: [{ translateY: waveY3.value }],
  }));

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // PanResponder — captura TODO (ya no hay Pressable padre que compita)
  // Tap = navegar/grabar/parar. Drag hacia arriba = foto (solo en PRO).
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,

      onPanResponderGrant: (evt) => {
        isDragging.current = false;
        startPos.current = {
          x: evt.nativeEvent.pageX,
          y: evt.nativeEvent.pageY,
        };
      },

      onPanResponderMove: (_evt, gestureState) => {
        // Solo arrastra si estamos en PRO y no grabando
        if (!focusedRef.current || isRecordingRef.current) return;
        if (Math.abs(gestureState.dy) > 5) {
          isDragging.current = true;
          fabScale.value = withTiming(0.95, { duration: 100 });
        }
        // Solo hacia arriba, con resistencia elástica al 50%
        if (gestureState.dy < 0) {
          fabTranslateY.value = Math.max(-80, gestureState.dy * 0.5);
        }
      },

      onPanResponderRelease: (_evt, gestureState) => {
        fabScale.value = withSpring(1);
        fabTranslateY.value = withSpring(0, { damping: 15, stiffness: 300 });

        if (isDragging.current && gestureState.dy < -40) {
          // Drag hacia arriba suficiente → foto
          takePhotoRef.current();
        } else if (!isDragging.current) {
          // Tap corto → navegar o grabar/parar
          onTabPressRef.current();
        }
        isDragging.current = false;
      },

      onPanResponderTerminate: () => {
        fabScale.value = withSpring(1);
        fabTranslateY.value = withSpring(0, { damping: 15, stiffness: 300 });
        isDragging.current = false;
      },
    })
  ).current;

  return (
    <View style={{ alignItems: 'center', overflow: 'visible' }}>
      {/* Recording time indicator */}
      {isRecording && (
        <View style={{ position: 'absolute', bottom: 78, alignItems: 'center', zIndex: 100 }}>
          <View
            style={{
              backgroundColor: 'rgba(10, 0, 0, 0.95)',
              borderWidth: 2,
              borderColor: '#DC2626',
              borderRadius: 16,
              paddingHorizontal: 12,
              paddingVertical: 4,
              shadowColor: '#DC2626',
              shadowOffset: { width: 0, height: 0 },
              shadowOpacity: 1,
              shadowRadius: 10,
            }}
          >
            <Text
              style={{
                color: '#F97316',
                fontSize: 11,
                fontWeight: '800',
                fontFamily: Platform.OS === 'web' ? 'monospace' : undefined,
                letterSpacing: 1,
              }}
            >
              🔥 {formatTime(recordingTime)}
            </Text>
          </View>
        </View>
      )}

      {/* Texto FOTO — encima de las ondas */}
      {focused && !isRecording && (
        <Animated.View
          style={[
            hintAnimatedStyle,
            {
              position: 'absolute',
              bottom: 92,
              alignItems: 'center',
              zIndex: 110,
            },
          ]}
        >
          <ChevronUp color="#DC2626" size={14} strokeWidth={3} />
          <Text
            style={{
              color: '#DC2626',
              fontSize: 9,
              fontWeight: '800',
              letterSpacing: 1,
              marginTop: -3,
            }}
          >
            FOTO
          </Text>
        </Animated.View>
      )}

      {/* Ondas — semicírculos que suben desde el botón */}
      {focused && !isRecording && (
        <View style={{ position: 'absolute', bottom: 66, alignItems: 'center', zIndex: 99 }}>
          <Animated.View style={[wave1Style, { position: 'absolute', bottom: 0 }]}>
            <View
              style={{
                width: ARC_W,
                height: ARC_H,
                borderTopLeftRadius: ARC_W / 2,
                borderTopRightRadius: ARC_W / 2,
                borderWidth: 2,
                borderBottomWidth: 0,
                borderColor: '#DC2626',
              }}
            />
          </Animated.View>
          <Animated.View style={[wave2Style, { position: 'absolute', bottom: 0 }]}>
            <View
              style={{
                width: ARC_W * 0.8,
                height: ARC_H * 0.85,
                borderTopLeftRadius: ARC_W / 2,
                borderTopRightRadius: ARC_W / 2,
                borderWidth: 1.5,
                borderBottomWidth: 0,
                borderColor: '#DC2626',
              }}
            />
          </Animated.View>
          <Animated.View style={[wave3Style, { position: 'absolute', bottom: 0 }]}>
            <View
              style={{
                width: ARC_W * 0.6,
                height: ARC_H * 0.7,
                borderTopLeftRadius: ARC_W / 2,
                borderTopRightRadius: ARC_W / 2,
                borderWidth: 1,
                borderBottomWidth: 0,
                borderColor: '#DC2626',
              }}
            />
          </Animated.View>
        </View>
      )}

      {/* Botón principal — panHandlers aplicados al Animated.View (como Spotify) */}
      <Animated.View
        style={[
          buttonStyle,
          Platform.OS === 'web'
            ? ({ touchAction: 'none', userSelect: 'none', cursor: 'grab' } as any)
            : {},
        ]}
        {...panResponder.panHandlers}
      >
        <View
          style={{
            padding: 16,
            borderRadius: 999,
            backgroundColor: isRecording
              ? ED_HARDY.fireRed
              : focused
                ? ED_HARDY.fireRed
                : ED_HARDY.zinc800,
            marginBottom: 20,
            shadowColor: isRecording
              ? ED_HARDY.neonRed
              : focused
                ? ED_HARDY.neonRed
                : 'transparent',
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: isRecording ? 1 : focused ? 0.8 : 0,
            shadowRadius: isRecording ? 20 : 15,
            elevation: isRecording ? 20 : focused ? 15 : 0,
            borderWidth: isRecording ? 3 : focused ? 2 : 0,
            borderColor: isRecording ? '#fff' : ED_HARDY.fireOrange,
          }}
        >
          {isRecording ? (
            <View style={{ width: 28, height: 28, backgroundColor: '#fff', borderRadius: 4 }} />
          ) : focused ? (
            <Camera color="#FFFFFF" size={28} strokeWidth={2.5} />
          ) : (
            <Crosshair color="#FFFFFF" size={28} strokeWidth={2.5} />
          )}
        </View>
      </Animated.View>
    </View>
  );
}

// ============================================================================
// INITIAL ROUTE: Feed (TRENS) se abre primero
// ============================================================================
export const unstable_settings = {
  initialRouteName: 'feed/index',
};

// ============================================================================
// TAB ORDER - Solo Feed y ADN permiten swipe horizontal
// ============================================================================
const TAB_ROUTES = ['feed', 'adn', 'pro', 'gym', 'plan'] as const;
const SWIPEABLE_TABS = ['feed', 'adn'] as const;

export default function TabsLayout() {
  const { isProActive, previousModule } = useProNavigation();
  const { user, loading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isRecording, startRecording, stopRecording } = useProRecording();
  const defaultModuleApplied = useRef(false);

  // -------------------------------------------------------------------------
  // DEFAULT MODULE REDIRECT: Lee preferencia del usuario y redirige una vez
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (loading || defaultModuleApplied.current) return;
    if (!user) {
      defaultModuleApplied.current = true;
      return;
    }

    (async () => {
      try {
        const { data } = await supabase
          .from('user_profiles')
          .select('default_module')
          .eq('user_id', user.id)
          .maybeSingle();

        if (data?.default_module === 'adn') {
          router.replace('/(tabs)/adn' as any);
        }
      } catch (err) {
        // Silently fail — default to feed
      } finally {
        defaultModuleApplied.current = true;
      }
    })();
  }, [user, loading]);

  // Obtener configuración de tabs según deporte activo
  const { activeSport, getTabConfig } = useSport();
  const tabConfig = getTabConfig();

  // Iconos dinámicos para tabs 4 y 5
  const Tab4Icon = getIconComponent(tabConfig.tab4.icon);
  const Tab5Icon = getIconComponent(tabConfig.tab5.icon);
  const sportColor = tabConfig.color;

  // Login ya es obligatorio desde index.tsx, no necesitamos botón flotante
  const showLoginButton = false;
  const getSourceIndex = (): number => {
    if (!previousModule) return -1;
    if (previousModule.includes('feed')) return 0;
    if (previousModule.includes('adn')) return 1;
    if (previousModule.includes('gym')) return 3;
    if (previousModule.includes('plan')) return 4;
    return -1;
  };

  const isSourceModule = (routeName: string) => {
    if (!isProActive || !previousModule) return false;
    return previousModule.includes(routeName);
  };

  // Altura dinámica del tab bar basada en safe area
  // En web insets.bottom es 0, necesitamos padding mínimo para que el texto no se corte
  const webPadding = Platform.OS === 'web' ? 8 : 0;
  const tabBarHeight = (Platform.OS === 'web' ? 70 : 56) + insets.bottom;

  // ==========================================================================
  // SLIDER HORIZONTAL: solo entre TRENS (Feed) ↔ ADN
  // Usa RNAnimated (React Native Animated) porque funciona con PanResponder en web
  // La tab bar se queda fija usando contra-animación
  // ==========================================================================
  const SCREEN_W = Dimensions.get('window').width;
  const SWIPE_THRESHOLD = SCREEN_W * 0.2;
  const VELOCITY_THRESHOLD = 0.4;

  // RN Animated.Value para el slide (compatible 100% con web + PanResponder)
  const slideXRef = useRef(new RNAnimated.Value(0));
  const slideX = slideXRef.current;

  // Contra-animación: multiplica slideX por -1 para cancelar movimiento en la tab bar
  const counterSlideX = useMemo(() => RNAnimated.multiply(slideX, -1), [slideX]);

  const [isSwiping, setIsSwiping] = useState(false);

  /** Índice dentro de SWIPEABLE_TABS (0=feed, 1=adn), -1 si no aplica */
  const getSwipeIndex = useCallback((): number => {
    if (!pathname) return -1;
    return SWIPEABLE_TABS.findIndex((t) => pathname.includes(t));
  }, [pathname]);

  const swipeIdxRef = useRef(0);
  useEffect(() => {
    swipeIdxRef.current = getSwipeIndex();
  }, [pathname, getSwipeIndex]);

  const navigateSwipe = useCallback(
    (targetSwipeIdx: number, direction: 'left' | 'right') => {
      if (targetSwipeIdx < 0 || targetSwipeIdx >= SWIPEABLE_TABS.length) return;
      const tab = SWIPEABLE_TABS[targetSwipeIdx];

      // Animar salida del contenido
      const exitX = direction === 'left' ? -SCREEN_W : SCREEN_W;
      RNAnimated.timing(slideX, {
        toValue: exitX,
        duration: 150,
        useNativeDriver: true,
      }).start(() => {
        router.push(`/(tabs)/${tab}` as any);
        // Preparar entrada desde el lado opuesto
        slideX.setValue(direction === 'left' ? SCREEN_W * 0.25 : -SCREEN_W * 0.25);
        RNAnimated.spring(slideX, {
          toValue: 0,
          damping: 22,
          stiffness: 350,
          mass: 0.7,
          useNativeDriver: true,
        }).start(() => setIsSwiping(false));
      });
      Haptics.impactAsync();
    },
    [router, SCREEN_W, slideX]
  );

  const sliderPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_evt, gs) => {
        if (swipeIdxRef.current < 0) return false;
        const isHorizontal = Math.abs(gs.dx) > 12 && Math.abs(gs.dx) > Math.abs(gs.dy) * 1.8;
        return isHorizontal;
      },
      onPanResponderGrant: () => {
        setIsSwiping(true);
      },
      onPanResponderMove: (_evt, gs) => {
        const idx = swipeIdxRef.current;
        if (idx < 0) return;
        let dx = gs.dx;
        // Resistencia en los extremos
        if ((idx === 0 && dx > 0) || (idx === SWIPEABLE_TABS.length - 1 && dx < 0)) {
          dx = dx * 0.15;
        }
        slideX.setValue(dx);
      },
      onPanResponderRelease: (_evt, gs) => {
        const idx = swipeIdxRef.current;
        if (idx < 0) {
          RNAnimated.spring(slideX, {
            toValue: 0,
            damping: 20,
            stiffness: 400,
            useNativeDriver: true,
          }).start();
          setIsSwiping(false);
          return;
        }

        const shouldSwipe =
          Math.abs(gs.dx) > SWIPE_THRESHOLD || Math.abs(gs.vx) > VELOCITY_THRESHOLD;
        const goRight = gs.dx > 0;
        const goLeft = gs.dx < 0;

        if (shouldSwipe && goRight && idx > 0) {
          navigateSwipe(idx - 1, 'right');
        } else if (shouldSwipe && goLeft && idx < SWIPEABLE_TABS.length - 1) {
          navigateSwipe(idx + 1, 'left');
        } else {
          RNAnimated.spring(slideX, {
            toValue: 0,
            damping: 20,
            stiffness: 400,
            useNativeDriver: true,
          }).start();
          setIsSwiping(false);
        }
      },
      onPanResponderTerminate: () => {
        RNAnimated.spring(slideX, {
          toValue: 0,
          damping: 20,
          stiffness: 400,
          useNativeDriver: true,
        }).start();
        setIsSwiping(false);
      },
    })
  ).current;

  return (
    <View style={{ flex: 1, overflow: 'hidden' }} {...sliderPanResponder.panHandlers}>
      <RNAnimated.View style={[{ flex: 1 }, { transform: [{ translateX: slideX }] }]}>
        <Tabs
          tabBar={(props) => (
            <RNAnimated.View style={{ transform: [{ translateX: counterSlideX }] }}>
              <BottomTabBar {...props} />
            </RNAnimated.View>
          )}
          screenListeners={{
            tabPress: () => {
              Haptics.impactAsync();
              slideX.setValue(0);
            },
          }}
          screenOptions={{
            headerShown: false,
            animation: 'none',
            tabBarStyle: {
              backgroundColor: ED_HARDY.black,
              borderTopColor: ED_HARDY.zinc800,
              borderTopWidth: 1,
              height: tabBarHeight,
              paddingBottom: insets.bottom + 4 + webPadding,
              paddingTop: 8,
              overflow: 'visible',
              // ED HARDY: Subtle fire glow from bottom
              shadowColor: ED_HARDY.fireOrange,
              shadowOffset: { width: 0, height: -2 },
              shadowOpacity: 0.15,
              shadowRadius: 10,
              elevation: 10,
            },
            tabBarActiveTintColor: sportColor,
            tabBarInactiveTintColor: ED_HARDY.zinc600,
            tabBarLabelStyle: {
              fontSize: 10,
              fontWeight: '700',
              letterSpacing: 1.5,
              textTransform: 'uppercase',
            },
            tabBarBackground: () => (
              <LinearGradient
                colors={['#0a0505', '#000000', '#000000']}
                start={{ x: 0.5, y: 0 }}
                end={{ x: 0.5, y: 1 }}
                style={{ flex: 1 }}
              >
                <ConnectionLine isVisible={isProActive} sourceIndex={getSourceIndex()} />
              </LinearGradient>
            ),
          }}
        >
          {/* TRENS - Pantalla principal (TikTok-style feed) */}
          <Tabs.Screen
            name="feed/index"
            options={{
              title: 'TRENS',
              tabBarIcon: ({ color, focused }) => {
                // Si estamos en profile, mostrar Feed como activo
                const isProfileView = pathname?.includes('profile');
                const effectiveFocused = focused || isProfileView;
                const effectiveColor = effectiveFocused ? sportColor : color;
                return (
                  <SyncedGlowIcon
                    Icon={Play}
                    color={effectiveColor}
                    size={26}
                    fill={effectiveColor}
                    isSource={isSourceModule('feed')}
                  />
                );
              },
            }}
          />

          {/* ADN - Perfil + Bóveda + Configuración */}
          <Tabs.Screen
            name="adn/index"
            options={{
              title: 'ADN',
              tabBarIcon: ({ color }) => (
                <SyncedGlowIcon
                  Icon={User}
                  color={color}
                  size={26}
                  isSource={isSourceModule('adn')}
                />
              ),
            }}
          />

          {/* PRO - Botón central de cámara con indicadores dinámicos */}
          <Tabs.Screen
            name="pro/index"
            options={{
              title: '',
              tabBarIcon: ({ focused }) => (
                <ProTabIcon
                  focused={focused}
                  onTabPress={() => {
                    if (isProActive) {
                      if (isRecording) {
                        stopRecording();
                      } else {
                        startRecording();
                      }
                    } else {
                      router.push('/pro');
                    }
                  }}
                />
              ),
              // Reemplazar PlatformPressable con View simple para que PanResponder funcione
              tabBarButton: (props) => (
                <View
                  style={[props.style as any, { overflow: 'visible' }]}
                  accessibilityRole="button"
                >
                  {props.children}
                </View>
              ),
            }}
          />

          {/* GYM/GARAGE/QUIVER - Dinámico según deporte */}
          <Tabs.Screen
            name="gym/index"
            options={{
              title: tabConfig.tab4.name,
              tabBarIcon: ({ color }) => (
                <SyncedGlowIcon
                  Icon={Tab4Icon}
                  color={color}
                  size={26}
                  isSource={isSourceModule('gym')}
                  accentColor={sportColor}
                />
              ),
            }}
          />

          {/* PLAN/TRACK/WAVES - Dinámico según deporte */}
          <Tabs.Screen
            name="plan/index"
            options={{
              title: tabConfig.tab5.name,
              tabBarIcon: ({ color }) => (
                <SyncedGlowIcon
                  Icon={Tab5Icon}
                  color={color}
                  size={26}
                  isSource={isSourceModule('plan')}
                  accentColor={sportColor}
                />
              ),
            }}
          />

          {/* Rutas ocultas - Se renderizan condicionalmente desde gym/plan */}
          <Tabs.Screen
            name="garaje/index"
            options={{
              href: null,
            }}
          />
          <Tabs.Screen
            name="race/index"
            options={{
              href: null,
            }}
          />
          <Tabs.Screen
            name="tabla/index"
            options={{
              href: null,
            }}
          />
          <Tabs.Screen
            name="spot/index"
            options={{
              href: null,
            }}
          />
          <Tabs.Screen
            name="profile/[userId]"
            options={{
              href: null,
            }}
          />
        </Tabs>
      </RNAnimated.View>

      {/* Overlays globales - aquí tienen contexto de navegación */}
      <HankOverlay />
      <SpotifyOverlay />

      {/* Botón flotante de login (solo para usuarios no autenticados) */}
      <FloatingLoginButton visible={showLoginButton} />
    </View>
  );
}
