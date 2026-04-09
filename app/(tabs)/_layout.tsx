import { Tabs, usePathname, useRouter } from 'expo-router';
import { BottomTabBar } from '@react-navigation/bottom-tabs';
import { View, Text, Platform, Pressable } from 'react-native';
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
  Camera,
  LucideIcon,
} from 'lucide-react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  withSequence,
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

// Componente de icono simple para tabs
function TabIcon({
  Icon,
  color,
  size,
  fill,
}: {
  Icon: any;
  color: string;
  size: number;
  fill?: string;
}) {
  return (
    <View style={{ alignItems: 'center', justifyContent: 'center' }}>
      <Icon color={color} size={size} fill={fill} />
    </View>
  );
}

// Componente para el icono PRO con indicadores dinámicos
function ProTabIcon({
  focused,
  onTabPress,
  onPhotoPress,
}: {
  focused: boolean;
  onTabPress: () => void;
  onPhotoPress: () => void;
}) {
  const { isRecording, recordingTime } = useProRecording();

  const pulseScale = useSharedValue(1);

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

  const buttonStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
  }));

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

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

      {/* Botón de FOTO — icono de cámara encima del botón de grabar (solo en PRO, no grabando) */}
      {focused && !isRecording && (
        <Pressable
          onPress={onPhotoPress}
          style={{
            position: 'absolute',
            bottom: 96,
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 110,
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor: 'rgba(10, 0, 0, 0.9)',
            borderWidth: 1.5,
            borderColor: '#F97316',
            ...(Platform.OS !== 'web'
              ? {
                  shadowColor: '#F97316',
                  shadowOffset: { width: 0, height: 0 },
                  shadowOpacity: 0.8,
                  shadowRadius: 8,
                  elevation: 10,
                }
              : {}),
          }}
        >
          <Camera color="#FFFFFF" size={18} strokeWidth={2.5} />
        </Pressable>
      )}

      {/* Botón principal de grabar — Pressable unificado web + nativo */}
      <Pressable onPress={onTabPress}>
        <Animated.View style={[buttonStyle]}>
          <View
            style={{
              // Círculo blanco exterior (siempre visible en PRO)
              padding: focused ? 4 : 16,
              borderRadius: 999,
              backgroundColor: focused ? '#FFFFFF' : ED_HARDY.zinc800,
              marginBottom: 20,
              alignItems: 'center',
              justifyContent: 'center',
              ...(Platform.OS !== 'web'
                ? {
                    shadowColor: isRecording
                      ? ED_HARDY.neonRed
                      : focused
                        ? ED_HARDY.neonRed
                        : 'transparent',
                    shadowOffset: { width: 0, height: 0 },
                    shadowOpacity: isRecording ? 1 : focused ? 0.8 : 0,
                    shadowRadius: isRecording ? 20 : 15,
                    elevation: isRecording ? 20 : focused ? 15 : 0,
                  }
                : {}),
            }}
          >
            {focused ? (
              // Dentro de PRO: círculo rojo (idle) o cuadrado rojo (grabando)
              isRecording ? (
                // GRABANDO → cuadrado rojo (stop)
                <View
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 6,
                    backgroundColor: ED_HARDY.fireRed,
                    margin: 10,
                  }}
                />
              ) : (
                // IDLE → círculo rojo grande (start)
                <View
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 22,
                    backgroundColor: ED_HARDY.fireRed,
                    margin: 2,
                  }}
                />
              )
            ) : (
              // Fuera de PRO: icono crosshair
              <Crosshair color="#FFFFFF" size={28} strokeWidth={2.5} />
            )}
          </View>
        </Animated.View>
      </Pressable>
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
  const { user, loading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isRecording, startRecording, stopRecording, takePhoto } = useProRecording();
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
              />
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
                  <TabIcon Icon={Play} color={effectiveColor} size={26} fill={effectiveColor} />
                );
              },
            }}
          />

          {/* ADN - Perfil + Bóveda + Configuración */}
          <Tabs.Screen
            name="adn/index"
            options={{
              title: 'ADN',
              tabBarIcon: ({ color }) => <TabIcon Icon={User} color={color} size={26} />,
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
                    const isProActive = pathname?.includes('/pro');
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
                  onPhotoPress={() => {
                    takePhoto();
                  }}
                />
              ),
              // View simple en ambas plataformas — el click lo maneja el Pressable interno de ProTabIcon
              tabBarButton: (props: any) => (
                <View style={[props.style, { overflow: 'visible' }]} accessibilityRole="button">
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
              tabBarIcon: ({ color }) => <TabIcon Icon={Tab4Icon} color={color} size={26} />,
              lazy: false,
            }}
          />

          {/* PLAN/TRACK/WAVES - Dinámico según deporte */}
          <Tabs.Screen
            name="plan/index"
            options={{
              title: tabConfig.tab5.name,
              tabBarIcon: ({ color }) => <TabIcon Icon={Tab5Icon} color={color} size={26} />,
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
