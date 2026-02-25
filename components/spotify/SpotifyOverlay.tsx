// ============================================================================
// SPOTIFY OVERLAY - FAB flotante global para control de Spotify
// VISIBILIDAD:
//   - Si Spotify conectado → visible en todos los módulos EXCEPTO Feed
//   - Si Spotify NO conectado → visible SOLO en GYM (para promover conexión)
// Gestos: Long press = play/pause, Swipe up = next, Swipe left = restart
//         Swipe down = HANK Insight (mensaje savage según canción + contexto)
// ============================================================================

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, PanResponder, Dimensions, GestureResponderEvent } from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  withSequence,
  withSpring,
  Easing,
  interpolate,
  SlideInDown,
  SlideOutDown,
} from 'react-native-reanimated';
import { Haptics } from '../../lib/haptics';
import {
  Music,
  SkipForward,
  RotateCcw,
  Sparkles,
  GitlabIcon as Bot,
  Zap,
  Wifi,
} from 'lucide-react-native';
import { usePathname } from 'expo-router';
import spotify, { SpotifyTrack, SpotifyPlaybackState } from '../../services/spotify/spotify';
import SpotifyModal from './SpotifyModal';
import { useUserRoleContext } from '../../context/UserRoleContext';
import { useHank } from '../../context/HankContext';
import { useSaveGuard } from '../../context/SaveGuardContext';
import { calculateFabPositions } from '../../constants/floatingTools';
import { spotifyModalEvent } from '../../lib/spotifyModalEvent';

// Dimensiones de pantalla
const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Constantes para gestos
const LONG_PRESS_DURATION = 500; // ms
const SWIPE_THRESHOLD = 50; // px mínimo para considerar swipe

// ============================================================================
// HANK INSIGHT TOAST - Mensaje savage flotante
// ============================================================================
interface HankInsightToastProps {
  visible: boolean;
  message: string;
  trackName: string;
  isLoading: boolean;
  albumArt?: string | null;
  artistImage?: string | null; // Imagen del artista (prioritaria)
  onDismiss: () => void;
  bottomOffset: number; // Offset desde abajo para posicionar arriba del FAB
}

const HankInsightToast: React.FC<HankInsightToastProps> = ({
  visible,
  message,
  trackName,
  isLoading,
  albumArt,
  artistImage,
  onDismiss,
  bottomOffset,
}) => {
  // Animaciones
  const pulseAnim = useSharedValue(1);
  const glowAnim = useSharedValue(0.5);
  const shakeAnim = useSharedValue(0);
  const dismissTranslateY = useSharedValue(0);
  const dismissOpacity = useSharedValue(1);

  // Track previous loading state para detectar cuando termina de cargar
  const prevIsLoading = useRef(isLoading);
  const hasTriggeredHaptics = useRef(false);
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  // PanResponder para swipe vertical dismiss
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => Math.abs(gestureState.dy) > 5,

      onPanResponderMove: (_, gestureState) => {
        // Usar gestureState.dy directamente (ya es el delta desde el inicio)
        dismissTranslateY.value = gestureState.dy;
        // Fade out mientras se arrastra
        dismissOpacity.value = Math.max(0.3, 1 - Math.abs(gestureState.dy) / 150);
      },

      onPanResponderRelease: (_, gestureState) => {
        const dy = gestureState.dy;

        // Si el swipe es suficiente (>40px arriba o abajo), cerrar
        if (Math.abs(dy) > 40) {
          // Animar fuera de pantalla DESDE la posición actual
          const direction = dy > 0 ? 300 : -300;
          dismissTranslateY.value = withTiming(direction, { duration: 150 });
          dismissOpacity.value = withTiming(0, { duration: 150 });
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

          // Cerrar SIN resetear - el reset ocurre en el useEffect cuando visible=false
          setTimeout(() => {
            onDismissRef.current();
          }, 150);
        } else {
          // Volver a posición original
          dismissTranslateY.value = withSpring(0);
          dismissOpacity.value = withTiming(1, { duration: 150 });
        }
      },

      onPanResponderTerminate: () => {
        dismissTranslateY.value = withSpring(0);
        dismissOpacity.value = withTiming(1, { duration: 150 });
      },
    })
  ).current;

  // Cleanup cuando el componente se oculta
  useEffect(() => {
    if (!visible) {
      pulseAnim.value = 1;
      glowAnim.value = 0.5;
      shakeAnim.value = 0;
      dismissTranslateY.value = 0;
      dismissOpacity.value = 1;
      hasTriggeredHaptics.current = false;
    }
  }, [visible, pulseAnim, glowAnim, shakeAnim, dismissTranslateY, dismissOpacity]);

  // Pulso mientras carga
  useEffect(() => {
    if (visible && isLoading) {
      pulseAnim.value = withRepeat(
        withSequence(withTiming(1.02, { duration: 600 }), withTiming(0.98, { duration: 600 })),
        -1,
        true
      );
    } else if (visible && !isLoading) {
      pulseAnim.value = withTiming(1, { duration: 150 });
      glowAnim.value = 0.6;
    }
  }, [visible, isLoading, pulseAnim, glowAnim]);

  // 🔥 Vibración HEAVY + Efecto SHAKE cuando el mensaje está listo
  useEffect(() => {
    if (visible && prevIsLoading.current && !isLoading && message && !hasTriggeredHaptics.current) {
      hasTriggeredHaptics.current = true;

      // Vibración triple HEAVY
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy), 100);
      setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy), 200);

      // Efecto SHAKE visual
      shakeAnim.value = withSequence(
        withTiming(-5, { duration: 35, easing: Easing.linear }),
        withTiming(5, { duration: 35, easing: Easing.linear }),
        withTiming(-4, { duration: 35, easing: Easing.linear }),
        withTiming(4, { duration: 35, easing: Easing.linear }),
        withTiming(0, { duration: 35, easing: Easing.linear })
      );
    }
    prevIsLoading.current = isLoading;
  }, [visible, isLoading, message, shakeAnim]);

  const containerStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: pulseAnim.value },
      { translateX: shakeAnim.value },
      { translateY: dismissTranslateY.value },
    ],
    opacity: dismissOpacity.value,
  }));

  const glowStyle = useAnimatedStyle(() => ({
    shadowOpacity: glowAnim.value,
  }));

  if (!visible) return null;

  return (
    <View
      style={{
        position: 'absolute',
        bottom: bottomOffset + 80, // Arriba del FAB de Spotify
        left: 16,
        right: 16,
        zIndex: 9999,
        alignItems: 'center',
      }}
    >
      <Animated.View
        entering={SlideInDown.duration(300).springify()}
        exiting={SlideOutDown.duration(200)}
        style={[containerStyle]}
        {...(!isLoading ? panResponder.panHandlers : {})}
      >
        <Animated.View
          style={[
            {
              backgroundColor: '#000',
              borderRadius: 20,
              padding: 16,
              borderWidth: 2,
              borderColor: '#DC2626',
              maxWidth: SCREEN_WIDTH - 32,
              shadowColor: '#DC2626',
              shadowOffset: { width: 0, height: 0 },
              shadowRadius: 15,
              elevation: 8,
            },
            glowStyle,
          ]}
        >
          {/* Header con icono y track */}
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
            {/* Imagen del artista o Album Art como fallback */}
            {(artistImage || albumArt) && (
              <View
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: artistImage ? 22 : 8, // Circular para artista, cuadrado para álbum
                  overflow: 'hidden',
                  marginRight: 12,
                  borderWidth: 2,
                  borderColor: artistImage ? '#DC2626' : '#1DB954', // Rojo HANK para artista
                }}
              >
                <Image
                  key={artistImage ?? albumArt ?? 'img'} // Key única para forzar re-render
                  source={{ uri: artistImage ?? albumArt ?? undefined }}
                  style={{ width: 44, height: 44, backgroundColor: '#27272a' }}
                  contentFit="cover"
                />
              </View>
            )}

            {/* HANK badge + track name */}
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 2 }}>
                <View
                  style={{
                    backgroundColor: '#DC2626',
                    paddingHorizontal: 8,
                    paddingVertical: 3,
                    borderRadius: 10,
                    flexDirection: 'row',
                    alignItems: 'center',
                  }}
                >
                  <Bot size={12} color="#FFF" />
                  <Text style={{ color: '#FFF', fontSize: 10, fontWeight: 'bold', marginLeft: 4 }}>
                    HANK
                  </Text>
                </View>
                <View
                  style={{
                    backgroundColor: '#1DB954',
                    paddingHorizontal: 6,
                    paddingVertical: 3,
                    borderRadius: 10,
                    marginLeft: 6,
                    flexDirection: 'row',
                    alignItems: 'center',
                  }}
                >
                  <Music size={10} color="#000" />
                </View>
              </View>
              <Text
                numberOfLines={1}
                style={{
                  color: '#A1A1AA',
                  fontSize: 11,
                  fontFamily: 'monospace',
                }}
              >
                🎵 {trackName}
              </Text>
            </View>
          </View>

          {/* Mensaje o Loading */}
          {isLoading ? (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                paddingVertical: 8,
              }}
            >
              <Sparkles size={18} color="#DC2626" />
              <Text style={{ color: '#DC2626', fontSize: 14, fontWeight: '600', marginLeft: 8 }}>
                Analizando vibes...
              </Text>
            </View>
          ) : (
            <Text
              style={{
                color: '#FFFFFF',
                fontSize: 15,
                lineHeight: 22,
                fontWeight: '500',
              }}
            >
              {message}
            </Text>
          )}

          {/* Dismiss hint */}
          {!isLoading && (
            <Text
              style={{
                color: '#52525B',
                fontSize: 10,
                textAlign: 'center',
                marginTop: 10,
                fontFamily: 'monospace',
              }}
            >
              ↕️ SWIPE PARA CERRAR
            </Text>
          )}
        </Animated.View>
      </Animated.View>
    </View>
  );
};

// ============================================================================
// COMPONENTE PRINCIPAL
// ============================================================================
export function SpotifyOverlay() {
  // IMPORTANTE: usePathname debe llamarse antes de cualquier early return
  // para mantener el orden de hooks consistente
  let pathname: string | null = null;
  try {
    pathname = usePathname();
  } catch {
    // Si falla usePathname, el contexto de navegación no está disponible
    return null;
  }

  const insets = useSafeAreaInsets();

  const {
    isPro,
    spotifyConnected: contextSpotifyConnected,
    updateSpotifyStatus,
  } = useUserRoleContext();

  // Estados - inicializar con valor del contexto
  const [modalVisible, setModalVisible] = useState(false);
  const [spotifyConnected, setSpotifyConnected] = useState(contextSpotifyConnected);
  const [spotifyLoading, setSpotifyLoading] = useState(false);
  const [currentTrack, setCurrentTrack] = useState<SpotifyTrack | null>(null);
  const [playbackState, setPlaybackState] = useState<SpotifyPlaybackState | null>(null);
  // Estado separado para albumArt para evitar re-renders de imagen
  const [albumArtUrl, setAlbumArtUrl] = useState<string | null>(null);

  // 🔥 Estado de warm-up para indicador visual
  const [warmUpStatus, setWarmUpStatus] = useState<{
    isWarmedUp: boolean;
    isReady: boolean;
    useNativeSDK: boolean;
    nativeAvailable: boolean;
  }>({ isWarmedUp: false, isReady: false, useNativeSDK: false, nativeAvailable: false });

  // -------------------------------------------------------------------------
  // HANK INSIGHT - Swipe down para mensaje savage
  // -------------------------------------------------------------------------
  const { executeCommand, screenContext, activeAsset } = useHank();
  const [hankInsight, setHankInsight] = useState<{
    visible: boolean;
    message: string;
    trackName: string;
    isLoading: boolean;
    artistImage: string | null; // Imagen del artista
  }>({ visible: false, message: '', trackName: '', isLoading: false, artistImage: null });

  // Animaciones
  const pulseAnim = useSharedValue(1);
  const glowAnim = useSharedValue(0);

  // Verificar si estamos en el módulo GYM
  const isGymModule =
    pathname?.includes('gym') || pathname === '/gym' || pathname === '/(tabs)/gym';

  // Verificar si estamos en Feed (siempre oculto)
  const isFeedModule =
    pathname?.includes('feed') || pathname === '/feed/index' || pathname === '/feed';

  // Lógica de visibilidad:
  // - Si está en Feed → SIEMPRE oculto
  // - Si Spotify NO está conectado → solo visible en GYM
  // - Si Spotify SÍ está conectado → visible en todos excepto Feed
  const isHidden = isFeedModule || (!spotifyConnected && !isGymModule);

  // -------------------------------------------------------------------------
  // 🔥 WARM UP AUTOMÁTICO - Pre-calentar Spotify al entrar a GYM
  // -------------------------------------------------------------------------
  useEffect(() => {
    // Solo hacer warm-up si:
    // 1. Spotify está conectado
    // 2. Estamos en el módulo GYM
    // 3. No está oculto
    if (spotifyConnected && isGymModule && !isHidden) {
      // Warm-up silencioso en segundo plano
      spotify.warmUp().then((ready) => {
        if (ready) {
          console.log('🔥 SpotifyOverlay: Spotify está caliente y listo');
        }
        // Actualizar estado de warm-up para UI
        setWarmUpStatus(spotify.getWarmUpStatus());
      });
    }
  }, [spotifyConnected, isGymModule, isHidden]);

  // -------------------------------------------------------------------------
  // 🔥 POLLING DE WARM-UP STATUS
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!spotifyConnected) {
      setWarmUpStatus({
        isWarmedUp: false,
        isReady: false,
        useNativeSDK: false,
        nativeAvailable: false,
      });
      return;
    }

    // Verificar status inicial
    setWarmUpStatus(spotify.getWarmUpStatus());

    // Actualizar cada 10 segundos
    const interval = setInterval(() => {
      setWarmUpStatus(spotify.getWarmUpStatus());
    }, 10000);

    return () => clearInterval(interval);
  }, [spotifyConnected]);

  // -------------------------------------------------------------------------
  // SINCRONIZAR ESTADO DE SPOTIFY
  // -------------------------------------------------------------------------
  useEffect(() => {
    const checkSpotifyStatus = async () => {
      // Usar el estado del contexto que ya validó los tokens
      const connected = contextSpotifyConnected ?? (await spotify.isTokenValid());
      setSpotifyConnected(connected);

      if (connected) {
        // 🔥 Warm-up junto con la verificación inicial
        spotify.warmUp();

        const playback = await spotify.getPlaybackState();
        setPlaybackState(playback);
        // Solo actualizar si hay track y cambió el URI
        if (playback?.track) {
          setCurrentTrack((prev) => {
            if (prev?.uri !== playback.track?.uri) {
              // Actualizar albumArt solo cuando cambia la canción
              setAlbumArtUrl(playback.track?.albumArt || null);
              return playback.track;
            }
            return prev;
          });
        }
      }
    };

    checkSpotifyStatus();
  }, [contextSpotifyConnected]);

  // -------------------------------------------------------------------------
  // POLLING DE PLAYBACK STATE
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!spotifyConnected || isHidden) return;

    const interval = setInterval(async () => {
      try {
        const playback = await spotify.getPlaybackState();
        setPlaybackState(playback);
        // Solo actualizar track si cambió (evita re-renders innecesarios de la imagen)
        if (playback?.track) {
          setCurrentTrack((prev) => {
            if (prev?.uri !== playback.track?.uri) {
              // Actualizar albumArt solo cuando cambia la canción
              setAlbumArtUrl(playback.track?.albumArt || null);
              return playback.track;
            }
            return prev;
          });
        }
      } catch {
        // Silenciar errores de polling
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [spotifyConnected, isHidden]);

  // -------------------------------------------------------------------------
  // ANIMACIÓN DE PULSO CUANDO HAY REPRODUCCIÓN
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (playbackState?.isPlaying) {
      pulseAnim.value = withRepeat(
        withSequence(
          withTiming(1.1, { duration: 600, easing: Easing.inOut(Easing.ease) }),
          withTiming(1, { duration: 600, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        true
      );
      glowAnim.value = withRepeat(
        withSequence(withTiming(1, { duration: 600 }), withTiming(0.5, { duration: 600 })),
        -1,
        true
      );
    } else {
      pulseAnim.value = withTiming(1, { duration: 300 });
      glowAnim.value = withTiming(0, { duration: 300 });
    }
  }, [playbackState?.isPlaying]);

  // -------------------------------------------------------------------------
  // HANDLERS
  // -------------------------------------------------------------------------
  const handleSpotifyConnect = async () => {
    console.log('🎵 handleSpotifyConnect: Starting...');
    setSpotifyLoading(true);

    // Guardar la ruta actual para volver después del callback
    try {
      const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
      await AsyncStorage.setItem('@spotify_return_path', pathname || '/(tabs)/adn');
      console.log('🎵 handleSpotifyConnect: Return path saved');
    } catch (e) {
      console.warn('No se pudo guardar ruta de retorno:', e);
    }

    console.log('🎵 handleSpotifyConnect: Calling spotify.authenticate()...');
    const success = await spotify.authenticate();
    console.log('🎵 handleSpotifyConnect: authenticate result =', success);

    setSpotifyConnected(success);
    if (success) {
      // 🔥 Warm-up inmediato después de conectar para preparar Spotify
      spotify.warmUp();

      const playback = await spotify.getPlaybackState();
      setPlaybackState(playback);
      setCurrentTrack(playback?.track || null);
      await updateSpotifyStatus(true, true);
    }
    setSpotifyLoading(false);
  };

  const handleSpotifyDisconnect = async () => {
    await spotify.disconnect();
    setSpotifyConnected(false);
    setPlaybackState(null);
    setCurrentTrack(null);
    await updateSpotifyStatus(false, false);
  };

  const handlePlayPause = async () => {
    await spotify.togglePlayPause();
    const playback = await spotify.getPlaybackState();
    setPlaybackState(playback);
    if (playback?.isPlaying && playback?.track) {
      spotifyModalEvent.emitPlay({
        trackName: playback.track.name,
        artist: playback.track.artist,
        trackUri: playback.track.uri,
      });
    } else {
      spotifyModalEvent.emitPause();
    }
  };

  const handleNext = async () => {
    const success = await spotify.next();
    if (success) {
      setTimeout(async () => {
        const playback = await spotify.getPlaybackState();
        setPlaybackState(playback);
        setCurrentTrack(playback?.track || null);
        if (playback?.track?.albumArt) {
          setAlbumArtUrl(playback.track.albumArt);
        }
        if (playback?.isPlaying && playback?.track) {
          spotifyModalEvent.emitPlay({
            trackName: playback.track.name,
            artist: playback.track.artist,
            trackUri: playback.track.uri,
          });
        }
      }, 600);
    }
  };

  const handlePrevious = async () => {
    await spotify.previous();
    setTimeout(async () => {
      const playback = await spotify.getPlaybackState();
      setPlaybackState(playback);
      setCurrentTrack(playback?.track || null);
      if (playback?.track?.albumArt) {
        setAlbumArtUrl(playback.track.albumArt);
      }
      if (playback?.isPlaying && playback?.track) {
        spotifyModalEvent.emitPlay({
          trackName: playback.track.name,
          artist: playback.track.artist,
          trackUri: playback.track.uri,
        });
      }
    }, 600);
  };

  const handleTrackChange = (track: SpotifyTrack) => {
    setCurrentTrack(track);
    if (track.albumArt) {
      setAlbumArtUrl(track.albumArt);
    }
    // Track changed from modal → notify Feed to mute video + send track info
    spotifyModalEvent.emitPlay({
      trackName: track.name,
      artist: track.artist,
      trackUri: track.uri || '',
    });
    setTimeout(async () => {
      const playback = await spotify.getPlaybackState();
      setPlaybackState(playback);
    }, 500);
  };

  const handleFabPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    openModalAndRefresh();
  };

  // Refresh playback state when modal opens so it shows the actual current track
  const openModalAndRefresh = useCallback(async () => {
    setModalVisible(true);
    if (spotifyConnected) {
      try {
        const playback = await spotify.getPlaybackState();
        setPlaybackState(playback);
        if (playback?.track) {
          setCurrentTrack(playback.track);
          setAlbumArtUrl(playback.track.albumArt || null);
        }
      } catch {}
    }
  }, [spotifyConnected]);

  // Listen for external open requests (e.g. from Feed)
  useEffect(() => {
    const unsub = spotifyModalEvent.subscribe(() => {
      openModalAndRefresh();
    });
    return unsub;
  }, [openModalAndRefresh]);

  // Handler para reiniciar canción (seek to 0)
  const handleRestartTrack = useCallback(async () => {
    try {
      console.warn('🎵 SpotifyOverlay: handleRestartTrack called');
      await spotify.seek(0);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      // Actualizar estado
      setTimeout(async () => {
        const playback = await spotify.getPlaybackState();
        setPlaybackState(playback);
      }, 300);
    } catch (error) {
      console.warn('Error restarting track:', error);
    }
  }, []);

  // -------------------------------------------------------------------------
  // HANK INSIGHT HANDLER - Swipe down para comentario savage
  // -------------------------------------------------------------------------
  const { canSave } = useSaveGuard();

  const handleHankInsight = useCallback(async () => {
    if (!currentTrack || hankInsight.isLoading) return;

    console.warn('🤖 SpotifyOverlay: handleHankInsight triggered');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

    // 🔒 Verificar si el usuario puede usar esta función (consume IA)
    if (!canSave('hank_spotify_insight')) {
      // Mostrar un EJEMPLO de lo que obtendría con PRO
      const exampleMessages = [
        `🔥 "${currentTrack.name}" sonando mientras entrenas? IMPARABLE. Cada rep al ritmo de ${currentTrack.artist}. ¡A romperla!`,
        `💪 ${currentTrack.artist} en los audífonos, fuego en los músculos. Esta sesión va a ser ÉPICA.`,
        `🎵 Con "${currentTrack.name}" no hay excusas. El gym es tu escenario. ¡DEMUESTRA QUIÉN ERES!`,
      ];
      const randomExample = exampleMessages[Math.floor(Math.random() * exampleMessages.length)];

      // Mostrar ejemplo bloqueado brevemente
      setHankInsight({
        visible: true,
        message: `🔒 EJEMPLO PRO:\n\n${randomExample}\n\n⬆️ Actualiza a PRO para desbloquear mensajes SAVAGE personalizados con IA`,
        trackName: currentTrack.name,
        isLoading: false,
        artistImage: null,
      });
      return;
    }

    // Mostrar estado de carga (sin imagen de artista aún)
    setHankInsight({
      visible: true,
      message: '',
      trackName: currentTrack.name,
      isLoading: true,
      artistImage: null,
    });

    // 🎨 Obtener imagen del artista en paralelo con el insight
    let artistImageUrl: string | null = null;
    const artistImagePromise = currentTrack.artistId
      ? spotify.getArtistImage(currentTrack.artistId)
      : Promise.resolve(null);

    try {
      // Construir el prompt con contexto de canción y pantalla
      const moduleNames: Record<string, string> = {
        nucleo: 'el Dashboard Principal',
        gym: 'el módulo de Entrenamiento',
        plan: 'el módulo de Nutrición',
        pro: 'el módulo PRO de Análisis',
        adn: 'el módulo de ADN (Perfil Físico)',
      };

      const moduleName = moduleNames[screenContext.module] || screenContext.module;

      // 🔍 DEBUG: Log completo del contexto actual
      console.warn(
        '🔍 HANK Insight - activeAsset:',
        JSON.stringify({
          id: activeAsset?.id,
          name: activeAsset?.name,
          isAlternative: activeAsset?.isAlternative,
          parentExerciseName: activeAsset?.parentExerciseName,
        })
      );
      console.warn('🔍 HANK Insight - screenContext:', JSON.stringify(screenContext));

      // Construir contexto del ejercicio/asset incluyendo si es alternativa
      let assetContext = '';
      if (activeAsset) {
        if (activeAsset.isAlternative && activeAsset.parentExerciseName) {
          assetContext = ` mientras hago "${activeAsset.name}" (alternativa de ${activeAsset.parentExerciseName})`;
        } else {
          assetContext = ` mientras hago "${activeAsset.name}"`;
        }
      } else {
        console.warn('⚠️ HANK Insight - activeAsset es NULL, no hay ejercicio en contexto');
      }

      const insightPrompt = `[SPOTIFY_INSIGHT] Estoy escuchando "${currentTrack.name}" de ${currentTrack.artist} en ${moduleName}${assetContext}. Dame un comentario SAVAGE y motivacional de máximo 2 oraciones que conecte la canción con lo que estoy haciendo. Sé creativo, usa emojis, y que sea memorable. NO uses herramientas, solo responde con el mensaje.`;

      console.warn('🤖 HANK Insight prompt:', insightPrompt);

      // Ejecutar en paralelo: HANK + imagen artista
      const [results, fetchedArtistImage] = await Promise.all([
        executeCommand(insightPrompt, { saveToHistory: false }),
        artistImagePromise,
      ]);

      artistImageUrl = fetchedArtistImage;

      if (results && results.length > 0 && results[0].message) {
        setHankInsight({
          visible: true,
          message: results[0].message,
          trackName: currentTrack.name,
          isLoading: false,
          artistImage: artistImageUrl,
        });
        // NO auto-hide - el usuario cierra manualmente
      } else {
        // Fallback si no hay respuesta
        setHankInsight({
          visible: true,
          message: `🔥 "${currentTrack.name}" sonando. Sin excusas, a darle.`,
          trackName: currentTrack.name,
          isLoading: false,
          artistImage: artistImageUrl,
        });
        // NO auto-hide - el usuario cierra manualmente
      }
    } catch (error) {
      console.warn('Error getting HANK insight:', error);
      // Intentar obtener imagen del artista aunque falle el insight
      artistImageUrl = await artistImagePromise.catch(() => null);
      setHankInsight({
        visible: true,
        message: `💀 La música dice más que yo. Dale duro.`,
        trackName: currentTrack.name,
        isLoading: false,
        artistImage: artistImageUrl,
      });
      // NO auto-hide - el usuario cierra manualmente
    }
  }, [currentTrack, screenContext, activeAsset, executeCommand, hankInsight.isLoading]);

  // -------------------------------------------------------------------------
  // GESTURE STATE & REFS
  // -------------------------------------------------------------------------
  const [gestureIndicator, setGestureIndicator] = useState<'none' | 'next' | 'restart' | 'hank'>(
    'none'
  );
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startPos = useRef({ x: 0, y: 0 });
  const isLongPress = useRef(false);
  const gestureHandled = useRef(false);

  // Refs para las funciones que el PanResponder necesita acceder
  const handleNextRef = useRef(handleNext);
  const handleRestartRef = useRef(handleRestartTrack);
  const handlePlayPauseRef = useRef(handlePlayPause);
  const handleHankInsightRef = useRef(handleHankInsight);
  const handleFabPressRef = useRef(handleFabPress);

  // Mantener refs actualizados
  useEffect(() => {
    handleNextRef.current = handleNext;
    handleRestartRef.current = handleRestartTrack;
    handlePlayPauseRef.current = handlePlayPause;
    handleFabPressRef.current = handleFabPress;
    handleHankInsightRef.current = handleHankInsight;
  });

  // Animación para feedback visual del FAB
  const fabScale = useSharedValue(1);
  const fabTranslateX = useSharedValue(0);
  const fabTranslateY = useSharedValue(0);

  // -------------------------------------------------------------------------
  // PAN RESPONDER PARA GESTOS
  // -------------------------------------------------------------------------
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,

      onPanResponderGrant: (evt: GestureResponderEvent) => {
        startPos.current = { x: evt.nativeEvent.pageX, y: evt.nativeEvent.pageY };
        isLongPress.current = false;
        gestureHandled.current = false;
        setGestureIndicator('none');

        // Iniciar timer de long press
        longPressTimer.current = setTimeout(() => {
          if (!gestureHandled.current) {
            isLongPress.current = true;
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
            // Toggle play/pause
            handlePlayPauseRef.current();
            gestureHandled.current = true;
            fabScale.value = withSequence(withTiming(0.8, { duration: 100 }), withSpring(1));
          }
        }, LONG_PRESS_DURATION);

        // Feedback visual inicial
        fabScale.value = withTiming(0.95, { duration: 100 });
      },

      onPanResponderMove: (evt: GestureResponderEvent) => {
        const dx = evt.nativeEvent.pageX - startPos.current.x;
        const dy = evt.nativeEvent.pageY - startPos.current.y;

        // Si hay movimiento significativo, cancelar long press
        if (Math.abs(dx) > 20 || Math.abs(dy) > 20) {
          if (longPressTimer.current) {
            clearTimeout(longPressTimer.current);
            longPressTimer.current = null;
          }
        }

        // Mover FAB visualmente (limitado)
        fabTranslateX.value = Math.max(-60, Math.min(60, dx * 0.5));
        fabTranslateY.value = Math.max(-60, Math.min(60, dy * 0.5));

        // Detectar dirección del swipe y mostrar indicador
        if (dy < -SWIPE_THRESHOLD && Math.abs(dx) < SWIPE_THRESHOLD) {
          setGestureIndicator('next');
        } else if (dx < -SWIPE_THRESHOLD && Math.abs(dy) < SWIPE_THRESHOLD) {
          setGestureIndicator('restart');
        } else if (dy > SWIPE_THRESHOLD && Math.abs(dx) < SWIPE_THRESHOLD) {
          // Swipe down -> HANK Insight
          setGestureIndicator('hank');
        } else {
          setGestureIndicator('none');
        }
      },

      onPanResponderRelease: (evt: GestureResponderEvent) => {
        // Cancelar timer de long press
        if (longPressTimer.current) {
          clearTimeout(longPressTimer.current);
          longPressTimer.current = null;
        }

        const dx = evt.nativeEvent.pageX - startPos.current.x;
        const dy = evt.nativeEvent.pageY - startPos.current.y;

        // Resetear posición visual
        fabScale.value = withSpring(1);
        fabTranslateX.value = withSpring(0);
        fabTranslateY.value = withSpring(0);
        setGestureIndicator('none');

        // Si ya se manejó (long press), no hacer nada más
        if (gestureHandled.current) return;

        // Detectar swipe up -> Next track
        if (dy < -SWIPE_THRESHOLD && Math.abs(dx) < SWIPE_THRESHOLD) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          handleNextRef.current();
          gestureHandled.current = true;
          return;
        }

        // Detectar swipe left -> Restart track
        if (dx < -SWIPE_THRESHOLD && Math.abs(dy) < SWIPE_THRESHOLD) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          handleRestartRef.current();
          gestureHandled.current = true;
          return;
        }

        // Detectar swipe down -> HANK Insight 🤖
        if (dy > SWIPE_THRESHOLD && Math.abs(dx) < SWIPE_THRESHOLD) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          handleHankInsightRef.current();
          gestureHandled.current = true;
          return;
        }

        // Si no hubo swipe ni long press, es un tap -> abrir modal
        if (Math.abs(dx) < 10 && Math.abs(dy) < 10 && !isLongPress.current) {
          handleFabPressRef.current();
        }
      },

      onPanResponderTerminate: () => {
        if (longPressTimer.current) {
          clearTimeout(longPressTimer.current);
          longPressTimer.current = null;
        }
        fabScale.value = withSpring(1);
        fabTranslateX.value = withSpring(0);
        fabTranslateY.value = withSpring(0);
        setGestureIndicator('none');
      },
    })
  ).current;

  // -------------------------------------------------------------------------
  // ESTILOS ANIMADOS
  // -------------------------------------------------------------------------
  const fabStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: pulseAnim.value * fabScale.value },
      { translateX: fabTranslateX.value },
      { translateY: fabTranslateY.value },
    ],
  }));

  const glowStyle = useAnimatedStyle(() => ({
    opacity: interpolate(glowAnim.value, [0, 1], [0, 0.6]),
    transform: [{ scale: interpolate(glowAnim.value, [0, 1], [1, 1.5]) }],
  }));

  // -------------------------------------------------------------------------
  // LÓGICA DE VISIBILIDAD:
  // - Feed → NUNCA visible
  // - Spotify conectado → Visible en todos los módulos excepto Feed
  // - Spotify NO conectado → Solo visible en GYM (para promover conexión)
  // -------------------------------------------------------------------------
  if (isHidden) {
    // Even when hidden (e.g. Feed), render SpotifyModal if opened via event
    if (modalVisible) {
      return (
        <SpotifyModal
          visible={modalVisible}
          onClose={() => setModalVisible(false)}
          isPro={isPro}
          onSpotifyConnect={handleSpotifyConnect}
          onSpotifyDisconnect={handleSpotifyDisconnect}
          spotifyConnected={spotifyConnected}
          spotifyLoading={spotifyLoading}
          currentTrack={currentTrack}
          playbackState={playbackState}
          onPlayPause={handlePlayPause}
          onNext={handleNext}
          onPrevious={handlePrevious}
          onTrackChange={handleTrackChange}
        />
      );
    }
    return null;
  }

  // -------------------------------------------------------------------------
  // RENDER
  // -------------------------------------------------------------------------
  // Usar sistema centralizado de posicionamiento
  const fabPositions = calculateFabPositions(insets.bottom);

  return (
    <>
      {/* FAB FLOTANTE */}
      <View
        style={{
          position: 'absolute',
          bottom: fabPositions.spotify,
          right: fabPositions.right,
          zIndex: 9998,
        }}
      >
        {/* Glow Effect */}
        {playbackState?.isPlaying && (
          <Animated.View
            style={[
              {
                position: 'absolute',
                width: 56,
                height: 56,
                borderRadius: 28,
                backgroundColor: '#1DB954',
              },
              glowStyle,
            ]}
          />
        )}

        {/* 🔥 Indicador de Warm-Up Status */}
        {spotifyConnected && (
          <View
            style={{
              position: 'absolute',
              top: -8,
              right: -8,
              width: 20,
              height: 20,
              borderRadius: 10,
              backgroundColor: warmUpStatus.isReady
                ? '#22c55e'
                : warmUpStatus.isWarmedUp
                  ? '#eab308'
                  : '#ef4444',
              justifyContent: 'center',
              alignItems: 'center',
              borderWidth: 2,
              borderColor: '#000',
              zIndex: 10,
            }}
          >
            {warmUpStatus.useNativeSDK ? (
              <Zap size={10} color="#000" />
            ) : warmUpStatus.isReady ? (
              <Wifi size={10} color="#000" />
            ) : (
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#000' }} />
            )}
          </View>
        )}

        {/* FAB Button con Gestos */}
        <Animated.View style={fabStyle} {...panResponder.panHandlers}>
          <View
            style={{
              width: 56,
              height: 56,
              borderRadius: 28,
              backgroundColor: spotifyConnected ? '#1DB954' : '#27272a',
              justifyContent: 'center',
              alignItems: 'center',
              shadowColor: '#1DB954',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: spotifyConnected ? 0.4 : 0,
              shadowRadius: 8,
              elevation: 8,
            }}
          >
            {/* Mini Album Art o Icono */}
            {albumArtUrl && spotifyConnected ? (
              <View style={{ width: 40, height: 40, borderRadius: 20, overflow: 'hidden' }}>
                <Image
                  key={albumArtUrl}
                  source={{ uri: albumArtUrl }}
                  style={{ width: 40, height: 40 }}
                  contentFit="cover"
                />
              </View>
            ) : (
              <Music size={24} color={spotifyConnected ? '#000' : '#1DB954'} />
            )}
          </View>
        </Animated.View>

        {/* Indicador de Gesto - Next (arriba) */}
        {gestureIndicator === 'next' && (
          <View
            style={{
              position: 'absolute',
              top: -40,
              left: 0,
              right: 0,
              alignItems: 'center',
            }}
          >
            <View
              style={{
                backgroundColor: '#1DB954',
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderRadius: 16,
                flexDirection: 'row',
                alignItems: 'center',
              }}
            >
              <SkipForward size={14} color="#000" />
              <Text style={{ color: '#000', fontSize: 12, fontWeight: 'bold', marginLeft: 4 }}>
                Siguiente
              </Text>
            </View>
          </View>
        )}

        {/* Indicador de Gesto - Restart (izquierda) */}
        {gestureIndicator === 'restart' && (
          <View
            style={{
              position: 'absolute',
              left: -80,
              top: 0,
              bottom: 0,
              justifyContent: 'center',
            }}
          >
            <View
              style={{
                backgroundColor: '#1DB954',
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderRadius: 16,
                flexDirection: 'row',
                alignItems: 'center',
              }}
            >
              <RotateCcw size={14} color="#000" />
              <Text style={{ color: '#000', fontSize: 12, fontWeight: 'bold', marginLeft: 4 }}>
                Reiniciar
              </Text>
            </View>
          </View>
        )}

        {/* Indicador de Gesto - HANK (abajo) 🤖 */}
        {gestureIndicator === 'hank' && (
          <View
            style={{
              position: 'absolute',
              bottom: -45,
              left: 0,
              right: 0,
              alignItems: 'center',
            }}
          >
            <View
              style={{
                backgroundColor: '#DC2626',
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderRadius: 16,
                flexDirection: 'row',
                alignItems: 'center',
                shadowColor: '#DC2626',
                shadowOffset: { width: 0, height: 0 },
                shadowOpacity: 0.8,
                shadowRadius: 10,
                elevation: 10,
              }}
            >
              <Bot size={14} color="#FFF" />
              <Text style={{ color: '#FFF', fontSize: 12, fontWeight: 'bold', marginLeft: 4 }}>
                HANK
              </Text>
            </View>
          </View>
        )}

        {/* Mini Track Name Badge */}
        {currentTrack && spotifyConnected && playbackState?.isPlaying && (
          <View
            style={{
              position: 'absolute',
              bottom: -8,
              right: 60,
              backgroundColor: '#000',
              paddingHorizontal: 8,
              paddingVertical: 4,
              borderRadius: 12,
              maxWidth: 150,
              borderWidth: 1,
              borderColor: '#1DB954',
            }}
          >
            <Text numberOfLines={1} style={{ color: '#fff', fontSize: 10, fontWeight: '600' }}>
              {currentTrack.name}
            </Text>
          </View>
        )}
      </View>

      {/* MODAL DE SPOTIFY - Solo renderizar cuando es visible */}
      {modalVisible && (
        <SpotifyModal
          visible={modalVisible}
          onClose={() => setModalVisible(false)}
          isPro={isPro}
          onSpotifyConnect={handleSpotifyConnect}
          onSpotifyDisconnect={handleSpotifyDisconnect}
          spotifyConnected={spotifyConnected}
          spotifyLoading={spotifyLoading}
          currentTrack={currentTrack}
          playbackState={playbackState}
          onPlayPause={handlePlayPause}
          onNext={handleNext}
          onPrevious={handlePrevious}
          onTrackChange={handleTrackChange}
        />
      )}

      {/* HANK INSIGHT TOAST - Mensaje savage después de swipe down */}
      <HankInsightToast
        visible={hankInsight.visible}
        message={hankInsight.message}
        trackName={hankInsight.trackName}
        isLoading={hankInsight.isLoading}
        albumArt={albumArtUrl}
        artistImage={hankInsight.artistImage}
        onDismiss={() => setHankInsight((prev) => ({ ...prev, visible: false }))}
        bottomOffset={fabPositions.spotify}
      />
    </>
  );
}

export default SpotifyOverlay;
