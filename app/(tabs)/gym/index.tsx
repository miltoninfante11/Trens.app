import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  FlatList,
  useWindowDimensions,
  Modal,
  ScrollView,
  Pressable,
  PanResponder,
  AppState,
  TextInput,
  RefreshControl,
  KeyboardAvoidingView,
  Platform,
  Image as RNImage,
} from 'react-native';
import { PWAGuard } from '../../../components/auth/PWAGuard';
import { ErrorBoundary } from '../../../components/ui/ErrorBoundary';
import { Alert } from '../../../lib/alert';
import { Image } from 'expo-image';
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useIsFocused } from '@react-navigation/native';
import { supabase } from '../../../lib/supabase';
import { useAuth, useProContext } from '../../_layout';
import {
  Sliders,
  Plus,
  Trash2,
  X,
  Music,
  Timer,
  Edit3,
  Camera as CameraIcon,
  Video,
  ChevronDown,
  Play,
  Pause,
  Eye,
  EyeOff,
  Share2,
  RotateCcw,
  Lock,
  Volume2,
  Zap,
} from 'lucide-react-native';
import * as Haptics from '../../../lib/haptics';
import { CameraView, useCameraPermissions } from 'expo-camera';
import {
  openCamera as openWebCamera,
  openGallery as openWebGallery,
  compressImage,
  compressVideo,
} from '../../../lib/webCamera';
import { WebCameraModal, WebCameraResult } from '../../../components/ui/WebCameraModal';
import * as FileSystem from 'expo-file-system/legacy';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { VideoView, useVideoPlayer } from 'expo-video';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withRepeat,
  withSequence,
  runOnJS,
  Easing,
} from 'react-native-reanimated';
import Slider from '@react-native-community/slider';
import { useHank } from '../../../context/HankContext';
import { subscribeToHankChat } from '../../../lib/hankChatState';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import spotify, { SpotifyVideoMetadata, SpotifyTrack } from '../../../services/spotify/spotify';
import cloudflareStream from '../../../services/cloudflare/stream';
import { DraggableExerciseCard } from '../../../components/gym/DraggableExerciseCard';
import { SeriesCard } from '../../../components/gym/SeriesCard';
import { useUserRoleContext } from '../../../context/UserRoleContext';
import { useSaveGuard } from '../../_layout';
import cloudflareR2 from '../../../services/cloudflare/r2';
import { useSport } from '../../../context/SportContext';
import { calculateFabPositions } from '../../../constants/floatingTools';

// Import sport-specific screens
import GarajeScreen from '../garaje';
import TablaScreen from '../tabla';

// ============================================================================
// HELPERS
// ============================================================================
const isVideoUrl = (url: string | null | undefined): boolean => {
  if (!url) return false;
  const lowerUrl = url.toLowerCase();
  return (
    lowerUrl.includes('.mp4') ||
    lowerUrl.includes('.mov') ||
    lowerUrl.includes('.m4v') ||
    lowerUrl.includes('.3gp') ||
    lowerUrl.includes('.webm')
  );
};

const getDayOfWeek = (): DayOfWeek => {
  const days: DayOfWeek[] = [
    'Domingo',
    'Lunes',
    'Martes',
    'Miércoles',
    'Jueves',
    'Viernes',
    'Sábado',
  ];
  return days[new Date().getDay()];
};

// ============================================================================
// VIDEO THUMBNAIL - Muestra el primer frame del video
// ============================================================================
const VideoThumbnail = ({
  videoUrl,
  width = 96,
  height = 128,
}: {
  videoUrl: string;
  width?: number;
  height?: number;
}) => {
  const player = useVideoPlayer(videoUrl, (p) => {
    p.loop = false;
    p.muted = true;
    p.pause();
  });

  return (
    <VideoView
      player={player}
      style={{ width, height }}
      contentFit="cover"
      nativeControls={false}
    />
  );
};

// ============================================================================
// COMPONENTE: VIDEO HERO
// ============================================================================
const VideoHero = ({
  videoUrl,
  videoMuted,
  isActive,
  screenWidth,
}: {
  videoUrl: string;
  videoMuted: boolean;
  isActive: boolean;
  screenWidth: number;
}) => {
  const player = useVideoPlayer(videoUrl, (player) => {
    player.loop = true;
    player.muted = videoMuted;
    // No llamar play() aquí, se controla con isActive
  });

  // Control principal: play/pause basado SOLO en isActive
  React.useEffect(() => {
    if (!player) return;

    if (isActive) {
      player.muted = videoMuted;
      player.play();
    } else {
      player.pause();
    }
  }, [isActive, videoMuted, player]);

  // Reanudar video cuando la app vuelve al foreground (solo si isActive)
  React.useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active' && player && isActive) {
        player.play();
      }
    });

    return () => {
      subscription.remove();
    };
  }, [player, isActive]);

  return (
    <VideoView
      style={{ width: screenWidth, aspectRatio: 1 }}
      player={player}
      contentFit="cover"
      nativeControls={false}
    />
  );
};

// ============================================================================
// TYPES
// ============================================================================
type ViewMode = 'LOADING' | 'FOCUS'; // STRUCTURE ahora es un modal separado
type SeriesType = 'CALENTAMIENTO' | 'APROXIMACION' | 'EFECTIVA' | 'FALLO';
type UserLevel = 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED' | 'PRO';
type DayOfWeek = 'Lunes' | 'Martes' | 'Miércoles' | 'Jueves' | 'Viernes' | 'Sábado' | 'Domingo';

interface Series {
  id: string;
  type: SeriesType;
  reps: string;
  note?: string;
  weight?: number;
}

interface TrainingDay {
  id: string;
  muscleGroups: string; // "Pecho y Tríceps"
  exercises: Exercise[];
}

interface TrainingProgram {
  frequency: number; // 3, 4, 5, 6 días por semana
  days: TrainingDay[];
  lastAccessDate: string | null; // ISO date
  currentDayIndex: number; // 0, 1, 2...
}

interface SeriesConfig {
  id: string;
  reps: number;
  type: 'CALENTAMIENTO' | 'APROXIMACION' | 'EFECTIVA' | 'FALLO';
  note: string;
  weight: number;
}

interface VideoRecord {
  id: string;
  exercise_id?: string;
  video_url?: string;
  videoUrl?: string; // alias para compatibilidad
  thumbnail_url?: string;
  cloudflare_video_id?: string;
  media_type?: 'video' | 'photo';
  weight: number;
  reps: number;
  free_text?: string; // Caption del video
  date: string;
  is_public: boolean;
  spotify?: {
    enabled: boolean;
    trackName?: string;
    artist?: string;
    trackUri?: string;
    positionMs?: number;
  };
  notes?: string; // Notas del video capturadas al grabar
  exercise_notes?: string; // Notas del ejercicio al momento de grabar
  tags?: string[]; // Tags del video (PR, dolor, etc)
}

interface Exercise {
  id: string;
  exercise_id: string; // ID del ejercicio en tabla exercises (para pro_videos)
  name: string;
  sets: string;
  image_url: string;
  order: number;
  series: Series[];
  videos: VideoRecord[];
  training_days: number[]; // Array de días donde aparece este ejercicio
  alternatives?: ExerciseAlternative[]; // Ejercicios alternativos
}

interface ExerciseAlternative {
  id: string;
  name: string;
  image_url: string;
  videos: VideoRecord[];
  series: Series[];
}

interface AssetTemplate {
  id: string;
  name: string;
  description: string;
  image_url: string;
  category: string;
  difficulty: string;
  default_metadata: {
    sets: string;
    rest: string;
  };
}

// ============================================================================
// ANIMATED EXERCISE ITEM - Para animar items durante drag
// ============================================================================
interface AnimatedExerciseItemProps {
  children: React.ReactNode;
  offset: number;
  isDragging?: boolean;
}

const AnimatedExerciseItem: React.FC<AnimatedExerciseItemProps> = ({
  children,
  offset,
  isDragging,
}) => {
  const animatedStyle = useAnimatedStyle(
    () => ({
      transform: [{ translateY: withSpring(offset, { damping: 20, stiffness: 300 }) }],
      zIndex: isDragging ? 9999 : 1,
    }),
    [offset, isDragging]
  );

  return <Animated.View style={animatedStyle}>{children}</Animated.View>;
};

// ============================================================================
// SWIPEABLE SERIES ROW - Para swipe-to-delete en series
// ============================================================================
interface SwipeableSeriesRowProps {
  children: React.ReactNode;
  onDelete: () => void;
}

const SwipeableSeriesRow: React.FC<SwipeableSeriesRowProps> = ({ children, onDelete }) => {
  const translateX = useSharedValue(0);
  const DELETE_THRESHOLD = -80;
  const hasDeleted = useRef(false);
  const onDeleteRef = useRef(onDelete);

  // Mantener el ref actualizado con el callback más reciente
  useEffect(() => {
    onDeleteRef.current = onDelete;
  }, [onDelete]);

  // Resetear hasDeleted cuando el componente recibe nuevo onDelete
  useEffect(() => {
    hasDeleted.current = false;
    translateX.value = 0;
  }, [onDelete, translateX]);

  const executeDelete = useCallback(() => {
    if (hasDeleted.current) return;
    hasDeleted.current = true;
    onDeleteRef.current();
  }, []);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_, gestureState) =>
          Math.abs(gestureState.dx) > 10 && Math.abs(gestureState.dx) > Math.abs(gestureState.dy),
        onPanResponderMove: (_, gestureState) => {
          if (gestureState.dx < 0) {
            translateX.value = Math.max(gestureState.dx, -120);
          }
        },
        onPanResponderRelease: (_, gestureState) => {
          if (gestureState.dx < DELETE_THRESHOLD) {
            // Ejecutar delete inmediatamente al superar threshold
            translateX.value = withSpring(-500, { damping: 15 });
            executeDelete();
          } else {
            translateX.value = withSpring(0);
          }
        },
      }),
    [translateX, executeDelete]
  );

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  return (
    <View className="relative">
      {/* Delete Background */}
      <View className="absolute right-0 top-0 bottom-0 w-28 mb-2 rounded-xl bg-red-950 items-center justify-center flex-row gap-1">
        <View className="flex-1 h-full items-center justify-center">
          <Trash2 color="#DC2626" size={20} />
          <Text className="text-savage-red text-[10px] font-bold mt-1">ELIMINAR</Text>
        </View>
      </View>

      {/* Content */}
      <Animated.View style={animatedStyle} {...panResponder.panHandlers}>
        {children}
      </Animated.View>
    </View>
  );
};

// ============================================================================
// SPOTIFY ALBUM BACKGROUND - Fondo animado con carátula del álbum
// ============================================================================
interface SpotifyAlbumBackgroundProps {
  albumArt: string | null | undefined;
  isPlaying: boolean;
}

const SpotifyAlbumBackground: React.FC<SpotifyAlbumBackgroundProps> = React.memo(
  ({ albumArt, isPlaying }) => {
    // Animaciones de pulso/ritmo
    const scaleAnim = useSharedValue(1);
    const rotateAnim = useSharedValue(0);
    const translateXAnim = useSharedValue(0);
    const translateYAnim = useSharedValue(0);

    useEffect(() => {
      if (isPlaying) {
        // Pulso suave - escala moderada para no distraer
        scaleAnim.value = withRepeat(
          withSequence(
            withTiming(1.15, { duration: 600, easing: Easing.out(Easing.ease) }),
            withTiming(1.05, { duration: 500, easing: Easing.inOut(Easing.ease) }),
            withTiming(1.1, { duration: 550, easing: Easing.out(Easing.ease) }),
            withTiming(1.0, { duration: 550, easing: Easing.inOut(Easing.ease) })
          ),
          -1,
          false
        );
        // Rotación sutil
        rotateAnim.value = withRepeat(
          withSequence(
            withTiming(5, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
            withTiming(-5, { duration: 2000, easing: Easing.inOut(Easing.ease) })
          ),
          -1,
          true
        );
        // Traslación horizontal (respira)
        translateXAnim.value = withRepeat(
          withSequence(
            withTiming(25, { duration: 2500, easing: Easing.inOut(Easing.ease) }),
            withTiming(-25, { duration: 2500, easing: Easing.inOut(Easing.ease) })
          ),
          -1,
          true
        );
        // Traslación vertical (respira)
        translateYAnim.value = withRepeat(
          withSequence(
            withTiming(-20, { duration: 1800, easing: Easing.inOut(Easing.ease) }),
            withTiming(20, { duration: 1800, easing: Easing.inOut(Easing.ease) })
          ),
          -1,
          true
        );
      } else {
        // Detener animaciones suavemente
        scaleAnim.value = withTiming(1, { duration: 400 });
        rotateAnim.value = withTiming(0, { duration: 400 });
        translateXAnim.value = withTiming(0, { duration: 400 });
        translateYAnim.value = withTiming(0, { duration: 400 });
      }
    }, [isPlaying, scaleAnim, rotateAnim, translateXAnim, translateYAnim]);

    const animatedStyle = useAnimatedStyle(() => ({
      transform: [
        { scale: scaleAnim.value },
        { rotate: `${rotateAnim.value}deg` },
        { translateX: translateXAnim.value },
        { translateY: translateYAnim.value },
      ],
    }));

    if (!albumArt || albumArt.length === 0) return null;

    return (
      <View
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          overflow: 'hidden',
        }}
        pointerEvents="none"
      >
        {/* Carátula animada de fondo */}
        <Animated.View
          style={[
            {
              position: 'absolute',
              top: -60,
              left: -60,
              right: -60,
              bottom: -60,
            },
            animatedStyle,
          ]}
        >
          <Image
            source={{ uri: albumArt }}
            style={{ width: '100%', height: '100%' }}
            contentFit="cover"
            blurRadius={20}
          />
        </Animated.View>

        {/* Overlay oscuro para contraste y legibilidad */}
        <View
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.70)',
          }}
        />

        {/* Glassmorphism overlay */}
        <BlurView
          intensity={15}
          tint="dark"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
          }}
        />

        {/* Gradiente superior para transición suave */}
        <LinearGradient
          colors={['rgba(0,0,0,0.9)', 'transparent']}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: 40,
          }}
        />
      </View>
    );
  }
);

// ============================================================================
// MAIN COMPONENT
// ============================================================================

// ============================================================================
// TAB 4 ROUTER - Renderiza el contenido correcto según el deporte activo
// ============================================================================
function Tab4RouterContent() {
  const { activeSport } = useSport();
  const sportCode = activeSport?.code || 'GYM';

  // Renderizar pantalla según deporte
  switch (sportCode) {
    case 'MOTO':
    case 'AUTO':
      return <GarajeScreen />;
    case 'SURF':
      return <TablaScreen />;
    case 'GYM':
    default:
      return <GymScreen />;
  }
}

export default function Tab4Router() {
  return (
    <ErrorBoundary>
      <PWAGuard moduleName="GYM">
        <Tab4RouterContent />
      </PWAGuard>
    </ErrorBoundary>
  );
}

// ============================================================================
// GYM SCREEN - Pantalla original de entrenamiento
// ============================================================================
function GymScreen() {
  const windowDimensions = useWindowDimensions();
  const insets = useSafeAreaInsets();

  // BUGFIX: Memoizar dimensiones iniciales para evitar re-renders cuando el teclado se abre
  // El teclado cambia SCREEN_HEIGHT lo cual causaba que el FlatList se remontara
  const initialDimensionsRef = useRef({
    width: windowDimensions.width,
    height: windowDimensions.height,
  });

  // Usar las dimensiones iniciales, no las reactivas
  const SCREEN_WIDTH = initialDimensionsRef.current.width;
  const SCREEN_HEIGHT = initialDimensionsRef.current.height;

  // Tab bar altura: 56px base + safe area bottom
  const TAB_BAR_HEIGHT = 56 + insets.bottom;
  const CONTENT_HEIGHT = SCREEN_HEIGHT - TAB_BAR_HEIGHT;
  const { user } = useAuth();
  const {
    isPro,
    spotifyPremium,
    spotifyConnected: contextSpotifyConnected,
    updateSpotifyStatus,
  } = useUserRoleContext();
  const { setTacticalContext } = useProContext();
  const { canSave } = useSaveGuard();
  const isFocused = useIsFocused(); // Detecta si esta pantalla está activa
  const { setActiveAsset, setScreenContext, refreshTrigger } = useHank();
  const [viewMode, setViewMode] = useState<ViewMode>('LOADING');
  const [structureModalOpen, setStructureModalOpen] = useState(false); // Modal de estructura
  const [isExternalMode, setIsExternalMode] = useState(false); // Modo externo (no usa GYM)
  const [externalSchedule, setExternalSchedule] = useState<Record<string, string>>({}); // Horario externo
  const [exercises, setExercisesState] = useState<Exercise[]>([]); // Ejercicios del día actual
  const exercisesRef = useRef<Exercise[]>([]); // Ref para acceso sincrónico inmediato
  // BUGFIX: Key de lista que fuerza remontaje completo cuando se recargan ejercicios
  const [listRefreshKey, setListRefreshKey] = useState(0);
  // Wrapper que actualiza tanto state como ref para mantener sincronía
  const setExercises = (newExercises: Exercise[] | ((prev: Exercise[]) => Exercise[])) => {
    if (typeof newExercises === 'function') {
      setExercisesState((prev) => {
        const result = newExercises(prev);
        exercisesRef.current = result;
        console.log('📦 setExercises (función):', result.length, 'ejercicios');
        result.slice(0, 3).forEach((e, i) => {
          console.log(`   [${i}] ${e.name}: ${e.alternatives?.length || 0} alts`);
        });
        return result;
      });
    } else {
      exercisesRef.current = newExercises;
      console.log('📦 setExercises (directo):', newExercises.length, 'ejercicios');
      newExercises.slice(0, 3).forEach((e, i) => {
        console.log(`   [${i}] ${e.name}: ${e.alternatives?.length || 0} alts`);
      });
      setExercisesState(newExercises);
    }
  };
  const [allUserExercises, setAllUserExercises] = useState<{ name: string; image_url: string }[]>(
    []
  ); // TODOS los ejercicios del usuario
  const [templates, setTemplates] = useState<AssetTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [adding, setAdding] = useState(false);

  // Catalog Tabs State
  const [catalogTab, setCatalogTab] = useState<'SUGERIDOS' | string>('SUGERIDOS');
  const [categories, setCategories] = useState<string[]>([]);

  // Timer State
  const [timerExpanded, setTimerExpanded] = useState(false);
  const [timerActive, setTimerActive] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState(0);

  // Modals State
  const [hankModalVisible, setHankModalVisible] = useState(false);
  const [notesModalVisible, setNotesModalVisible] = useState(false);
  const [exerciseNotes, setExerciseNotes] = useState<Record<string, string>>({});
  const [exerciseTags, setExerciseTags] = useState<Record<string, string[]>>({});
  const [currentNoteText, setCurrentNoteText] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);
  const [currentExerciseIndex, setCurrentExerciseIndex] = useState(0);

  // Historial de notas del ejercicio
  const [notesHistory, setNotesHistory] = useState<
    Array<{
      id: string;
      date: string;
      rawDate: string;
      notes: string;
      tags?: string[];
      type: 'video' | 'session';
      videoId?: string;
      isToday: boolean;
    }>
  >([]);
  const [loadingNotesHistory, setLoadingNotesHistory] = useState(false);
  const [todayNoteId, setTodayNoteId] = useState<string | null>(null); // ID de nota de hoy si existe

  // Video Notes Modal State (para editar notas de un video específico)
  const [videoNotesModalVisible, setVideoNotesModalVisible] = useState(false);
  const [videoNoteText, setVideoNoteText] = useState('');
  const [savingVideoNotes, setSavingVideoNotes] = useState(false);
  const [videoNotesExpanded, setVideoNotesExpanded] = useState(false);

  // Spotify State (solo para captura durante grabación)
  const [spotifyConnected, setSpotifyConnected] = useState(false);
  const [capturedSpotifyMetadata, setCapturedSpotifyMetadata] =
    useState<SpotifyVideoMetadata | null>(null);

  // Spotify Now Playing State (para fondo animado en modo FOCUS)
  const [spotifyCurrentTrack, setSpotifyCurrentTrack] = useState<SpotifyTrack | null>(null);
  const [spotifyIsPlaying, setSpotifyIsPlaying] = useState(false);

  // Helper: Arreglar URLs de Cloudflare Stream incompletas
  const fixCloudflareUrl = (url: string): string => {
    if (!url) return url;
    if (url.includes('cloudflarestream.com') && !url.includes('/manifest/')) {
      return `${url}/manifest/video.m3u8`;
    }
    return url;
  };

  // Video State
  const [videoViewerVisible, setVideoViewerVisible] = useState(false);
  const [selectedVideo, setSelectedVideo] = useState<VideoRecord | null>(null);
  const [isVideoManuallyPaused, setIsVideoManuallyPaused] = useState(false);

  // Video Player para historial
  const rawVideoSource = selectedVideo?.videoUrl || selectedVideo?.video_url || '';
  const historialVideoSource = fixCloudflareUrl(rawVideoSource);
  const historialPlayer = useVideoPlayer(historialVideoSource, (player) => {
    player.loop = true;
    // Volumen se controla dinámicamente en el useEffect según Spotify
  });

  // Video Player para preview de video capturado
  const [capturedVideoUri, setCapturedVideoUri] = useState<string | null>(null);
  const videoPlayer = useVideoPlayer(capturedVideoUri || '', (player) => {
    player.loop = true;
  });

  // Editor state - declarado aquí antes de usarlo en editorVideoPlayer
  const [imageToEdit, setImageToEdit] = useState<string | null>(null);
  const [editorVisible, setEditorVisible] = useState(false);
  const [mediaType, setMediaType] = useState<'photo' | 'video'>('photo');
  const galleryFileRef = useRef<File | null>(null); // Ref para archivo de galería (más confiable que state)

  // Video Player para preview en editor (cuando se selecciona video de galería)
  const editorVideoPlayer = useVideoPlayer(
    mediaType === 'video' && imageToEdit ? imageToEdit : '',
    (player) => {
      player.loop = true;
      player.muted = false;
    }
  );

  // Auto-play video en editor cuando se abre
  useEffect(() => {
    if (editorVisible && mediaType === 'video' && imageToEdit && editorVideoPlayer) {
      editorVideoPlayer.play();
    }
  }, [editorVisible, mediaType, imageToEdit, editorVideoPlayer]);

  // Play preview video cuando se captura
  useEffect(() => {
    if (capturedVideoUri && videoPlayer) {
      videoPlayer.play();
    }
  }, [capturedVideoUri, videoPlayer]);

  // Ref para rastrear si Spotify ya se sincronizó (evita re-sync al reanudar de pausa)
  const spotifySyncedRef = useRef(false);

  // Ref para rastrear si el video viewer estaba abierto (detectar cierre real)
  const wasVideoViewerOpenRef = useRef(false);

  // Controlar play/pause del video cuando abre/cierra el viewer
  useEffect(() => {
    if (videoViewerVisible && historialPlayer) {
      // Marcar que el viewer está abierto
      wasVideoViewerOpenRef.current = true;

      // Determinar si hay Spotify para este video
      const hasSpotify = !!(
        spotifyPremium &&
        selectedVideo?.spotify?.enabled &&
        selectedVideo?.spotify?.trackUri
      );

      // MUTEAR el video si hay Spotify - solo se escuchará Spotify
      historialPlayer.volume = hasSpotify ? 0 : 1;

      // Reproducir video si no está pausado manualmente
      if (!isVideoManuallyPaused) {
        historialPlayer.play();
      }

      // Solo sincronizar Spotify la PRIMERA vez que se abre el modal
      if (!spotifySyncedRef.current) {
        console.log('🎬 VIDEO VIEWER ABIERTO - Spotify check:', {
          spotifyPremium,
          hasSpotifyData: !!selectedVideo?.spotify,
          spotifyEnabled: selectedVideo?.spotify?.enabled,
          trackUri: selectedVideo?.spotify?.trackUri,
          positionMs: selectedVideo?.spotify?.positionMs,
          videoMuted: hasSpotify,
        });

        if (hasSpotify) {
          spotifySyncedRef.current = true;
          console.log(
            '🎵 SINCRONIZANDO SPOTIFY (video muted):',
            selectedVideo?.spotify?.trackName,
            'desde',
            selectedVideo?.spotify?.positionMs,
            'ms'
          );
          spotify.syncWithVideo(
            selectedVideo!.spotify!.trackUri as string,
            selectedVideo!.spotify!.positionMs || 0
          );
        } else {
          console.log('🔊 Reproduciendo audio ambiente del video');
        }
      }
    } else if (historialPlayer && !videoViewerVisible && wasVideoViewerOpenRef.current) {
      // Solo pausar si el viewer REALMENTE estaba abierto antes (no en mount inicial)
      wasVideoViewerOpenRef.current = false;
      historialPlayer.pause();
      setIsVideoManuallyPaused(false); // Reset al cerrar
      // Solo pausar Spotify si realmente sincronizamos una canción
      if (spotifySyncedRef.current) {
        spotify.pauseForSwipe();
      }
      spotifySyncedRef.current = false; // Reset para próxima apertura
    }
  }, [videoViewerVisible, historialPlayer, selectedVideo, spotifyPremium]);

  // Handler para tap en el video (pausar/reanudar solo video, NO Spotify)
  const handleHistorialVideoTap = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIsVideoManuallyPaused((prev) => {
      const newPaused = !prev;
      if (newPaused) {
        historialPlayer.pause();
      } else {
        historialPlayer.play();
      }
      return newPaused;
    });
  }, [historialPlayer]);

  // Modal State
  const [historialModalVisible, setHistorialModalVisible] = useState(false);
  const [structureModalVisible, setStructureModalVisible] = useState(false);
  const [modalExercise, setModalExercise] = useState<Exercise | null>(null);
  const [exerciseVideos, setExerciseVideos] = useState<VideoRecord[]>([]);
  const [loadingVideos, setLoadingVideos] = useState(false);

  // Estado para el modal de estructura editable (FOCUS mode)
  const [focusSeriesConfig, setFocusSeriesConfig] = useState<SeriesConfig[]>([]);
  const [savingFocusSeries, setSavingFocusSeries] = useState(false);
  // BUGFIX: Capturar el día en el que se abrió el modal para evitar guardar en día incorrecto
  const [focusSeriesDayIndex, setFocusSeriesDayIndex] = useState<number>(0);

  // Camera State
  const [cameraModalVisible, setCameraModalVisible] = useState(false);
  const [webCameraModalVisible, setWebCameraModalVisible] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<any>(null);
  const [captureProcessing, setCaptureProcessing] = useState(false);
  const [uploadingMessage, setUploadingMessage] = useState<string | null>(null);
  const [cameraMode, setCameraMode] = useState<'photo' | 'video'>('photo');
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [cameraFacing, setCameraFacing] = useState<'front' | 'back'>('back');
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Ref para evitar loops en sincronización de contexto
  const lastSyncedExerciseId = useRef<string | null>(null);

  // Editor State - NOTA: editorVisible, imageToEdit están declarados arriba con editorVideoPlayer

  // Series Config Modal State
  const [seriesConfigModalVisible, setSeriesConfigModalVisible] = useState(false);
  const [seriesConfigFromCatalog, setSeriesConfigFromCatalog] = useState(false); // true si se abrió desde catálogo
  const seriesConfigFromCatalogRef = useRef(false); // Ref para acceder en panResponder
  const [selectedTemplate, setSelectedTemplate] = useState<AssetTemplate | null>(null);
  const [seriesConfig, setSeriesConfig] = useState<SeriesConfig[]>([]);
  // BUGFIX: Capturar el día cuando se abre el modal de configuración de series
  const [seriesConfigDayIndex, setSeriesConfigDayIndex] = useState<number>(0);
  const [userLevel, setUserLevel] = useState<UserLevel>('INTERMEDIATE');
  // NOTA: mediaType está declarado arriba con editorVideoPlayer
  const [videoMuted, setVideoMuted] = useState(true);
  const [isPickingFromGallery, setIsPickingFromGallery] = useState(false);

  // Day Name Edit Modal State
  const [dayNameModalVisible, setDayNameModalVisible] = useState(false);
  const [editingDayIndex, setEditingDayIndex] = useState<number | null>(null);
  const [editingDayName, setEditingDayName] = useState('');

  // Modal para agregar nuevo día con selección de grupos musculares
  const [addDayModalVisible, setAddDayModalVisible] = useState(false);
  const [selectedMuscleGroups, setSelectedMuscleGroups] = useState<string[]>([]);

  // Grupos musculares disponibles para seleccionar - MÁS ESPECÍFICOS
  const MUSCLE_GROUPS = [
    // Parte Superior
    {
      id: 'pecho',
      name: 'PECHO',
      emoji: '💪',
      color: '#ef4444',
      bg: '#450a0a',
      category: 'superior',
    },
    {
      id: 'espalda',
      name: 'ESPALDA',
      emoji: '🔙',
      color: '#3b82f6',
      bg: '#1e3a5f',
      category: 'superior',
    },
    // Hombros divididos
    {
      id: 'hombro-frontal',
      name: 'HOMBRO FRONTAL',
      emoji: '🎯',
      color: '#f59e0b',
      bg: '#422006',
      category: 'hombros',
    },
    {
      id: 'hombro-lateral',
      name: 'HOMBRO LATERAL',
      emoji: '🎯',
      color: '#fbbf24',
      bg: '#422006',
      category: 'hombros',
    },
    {
      id: 'hombro-posterior',
      name: 'HOMBRO POSTERIOR',
      emoji: '🎯',
      color: '#d97706',
      bg: '#422006',
      category: 'hombros',
    },
    {
      id: 'biceps',
      name: 'BÍCEPS',
      emoji: '💪',
      color: '#10b981',
      bg: '#052e16',
      category: 'brazos',
    },
    {
      id: 'triceps',
      name: 'TRÍCEPS',
      emoji: '💪',
      color: '#8b5cf6',
      bg: '#2e1065',
      category: 'brazos',
    },
    {
      id: 'antebrazos',
      name: 'ANTEBRAZOS',
      emoji: '🦾',
      color: '#6366f1',
      bg: '#312e81',
      category: 'brazos',
    },
    // Parte Inferior
    {
      id: 'cuadriceps',
      name: 'CUÁDRICEPS',
      emoji: '🦵',
      color: '#ec4899',
      bg: '#500724',
      category: 'piernas',
    },
    {
      id: 'femorales',
      name: 'FEMORALES',
      emoji: '🦵',
      color: '#be185d',
      bg: '#4a044e',
      category: 'piernas',
    },
    {
      id: 'gluteos',
      name: 'GLÚTEOS',
      emoji: '🍑',
      color: '#f97316',
      bg: '#431407',
      category: 'piernas',
    },
    {
      id: 'aductores',
      name: 'ADUCTORES',
      emoji: '🦵',
      color: '#a855f7',
      bg: '#3b0764',
      category: 'piernas',
    },
    {
      id: 'pantorrillas',
      name: 'PANTORRILLAS',
      emoji: '🦶',
      color: '#14b8a6',
      bg: '#134e4a',
      category: 'piernas',
    },
    // Core y Otros
    {
      id: 'abdominales',
      name: 'ABDOMINALES',
      emoji: '🔥',
      color: '#eab308',
      bg: '#422006',
      category: 'core',
    },
    {
      id: 'oblicuos',
      name: 'OBLICUOS',
      emoji: '🔥',
      color: '#facc15',
      bg: '#422006',
      category: 'core',
    },
    {
      id: 'lumbar',
      name: 'LUMBAR',
      emoji: '🔙',
      color: '#22c55e',
      bg: '#14532d',
      category: 'core',
    },
    // Especiales
    {
      id: 'trapecio',
      name: 'TRAPECIO',
      emoji: '🔺',
      color: '#0ea5e9',
      bg: '#0c4a6e',
      category: 'superior',
    },
    {
      id: 'cardio',
      name: 'CARDIO',
      emoji: '❤️',
      color: '#ef4444',
      bg: '#450a0a',
      category: 'cardio',
    },
    {
      id: 'full',
      name: 'FULL BODY',
      emoji: '⚡',
      color: '#06b6d4',
      bg: '#083344',
      category: 'especial',
    },
  ];

  // Función para obtener color de grupo muscular
  const getMuscleGroupColor = (category: string) => {
    const normalizedCategory = category?.toLowerCase() || '';
    const group = MUSCLE_GROUPS.find(
      (g) => normalizedCategory.includes(g.id) || normalizedCategory.includes(g.name.toLowerCase())
    );
    return group || { color: '#71717a', bg: '#27272a' };
  };

  // Shared value para drag-to-dismiss del modal de agregar día
  const translateYAddDay = useSharedValue(0);
  const animatedStyleAddDay = useAnimatedStyle(() => ({
    transform: [{ translateY: translateYAddDay.value }],
  }));
  const panResponderAddDay = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => Math.abs(gestureState.dy) > 5,
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy > 0) {
          translateYAddDay.value = gestureState.dy;
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > 100) {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          setAddDayModalVisible(false);
          setSelectedMuscleGroups([]);
          setTimeout(() => {
            translateYAddDay.value = 0;
          }, 300);
        } else {
          translateYAddDay.value = withSpring(0);
        }
      },
    })
  ).current;

  // Training Program State
  const [trainingProgram, setTrainingProgram] = useState<TrainingProgram>({
    frequency: 3,
    days: [
      { id: '1', muscleGroups: 'Pecho y Espalda', exercises: [] },
      { id: '2', muscleGroups: 'Hombros, Bíceps y Tríceps', exercises: [] },
      { id: '3', muscleGroups: 'Piernas', exercises: [] },
    ],
    lastAccessDate: null,
    currentDayIndex: 0,
  });
  const [selectedDayIndex, setSelectedDayIndex] = useState(0);
  // BUGFIX: Ref para capturar el día seleccionado actual (evita closure stale en panResponder)
  const selectedDayIndexRef = useRef(0);

  // Estado para editar nombre de rutina
  const [editingRoutineName, setEditingRoutineName] = useState(false);
  const [tempRoutineName, setTempRoutineName] = useState('');

  // Video playback control - trackea el ejercicio actualmente visible
  const [activeExerciseIndex, setActiveExerciseIndex] = useState(0);
  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 70, // Considera visible si está 70% en pantalla (más estricto)
  });

  // BUGFIX: Sincronizar selectedDayIndexRef cuando cambia selectedDayIndex
  useEffect(() => {
    selectedDayIndexRef.current = selectedDayIndex;
    console.log('📅 selectedDayIndexRef actualizado:', selectedDayIndex);
  }, [selectedDayIndex]);

  // BUGFIX: Memoizar onViewableItemsChanged para evitar error "Changing onViewableItemsChanged on the fly"
  // Ref para trackear el último índice visible y evitar haptics redundantes
  const lastVisibleIndexRef = useRef<number | null>(null);
  // Ref para saber si hay un modal abierto - se sincroniza en el useEffect de isAnyModalOpen
  const isAnyModalOpenRef = useRef(false);

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: Array<{ index: number | null }> }) => {
      // BUGFIX V2: Seguir trackeando el ejercicio visible aunque haya modal abierto
      // Antes: Si Hank estaba abierto, NO se actualizaba activeExerciseIndex
      // Esto causaba que Hank operara en el ejercicio incorrecto después de scroll
      // Ahora: Solo ignoramos el haptic feedback y cualquier scroll automático,
      // pero SIEMPRE actualizamos qué ejercicio está visible para que Hank sepa.

      if (viewableItems.length > 0 && viewableItems[0].index !== null) {
        const newIndex = viewableItems[0].index;

        // Solo vibrar si el índice cambió Y no hay modal abierto (evita vibrar en scroll inicial)
        if (
          !isAnyModalOpenRef.current &&
          lastVisibleIndexRef.current !== null &&
          lastVisibleIndexRef.current !== newIndex
        ) {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }

        lastVisibleIndexRef.current = newIndex;
        // SIEMPRE actualizar el índice activo, independiente del modal
        setActiveExerciseIndex(newIndex);
      }
    }
  );

  // Trackear alternativa activa por cada ejercicio (exerciseIndex -> alternativeIndex)
  const [activeAlternatives, setActiveAlternatives] = useState<Record<number, number>>({});
  // Ref para persistir el estado de alternativas durante re-renders (evita pérdida en modales)
  const activeAlternativesRef = useRef<Record<number, number>>({});

  // Sincronizar la ref con el estado
  useEffect(() => {
    activeAlternativesRef.current = activeAlternatives;
  }, [activeAlternatives]);

  // DEBUG: Detectar cuando exercises cambia y verificar alternativas
  useEffect(() => {
    if (exercises.length > 0) {
      console.log('🔔 EXERCISES STATE CHANGED:', exercises.length, 'ejercicios');
      exercises.forEach((e, i) => {
        console.log(`   [${i}] ${e.name}: ${e.alternatives?.length || 0} alternativas`);
      });
    }
  }, [exercises]);

  // ID del ejercicio actual (puede ser principal o alternativa)
  const [currentVariationId, setCurrentVariationId] = useState<string | null>(null);

  // Helper: Obtener el ID y nombre del ejercicio activo (considerando alternativas)
  // IMPORTANTE: Devuelve exercise_id (de tabla exercises), NO user_exercise_config.id
  // BUGFIX: Siempre retornar valores válidos para evitar errores de undefined
  const getActiveExerciseInfo = (exerciseIndex: number = currentExerciseIndex) => {
    const exercise = exercises[exerciseIndex];
    if (!exercise) return { id: '', name: '' };

    const altIndex = activeAlternatives[exerciseIndex] || 0;

    // Si altIndex > 0, estamos en una alternativa
    if (altIndex > 0 && exercise.alternatives && exercise.alternatives[altIndex - 1]) {
      const alt = exercise.alternatives[altIndex - 1];
      return { id: alt.id || '', name: alt.name || '' };
    }

    // Usar exercise_id (ID real del ejercicio en tabla exercises)
    // BUGFIX: Fallback a exercise.id si exercise_id no existe
    return { id: exercise.exercise_id || exercise.id || '', name: exercise.name || '' };
  };

  // Helper: Obtener TODOS los IDs de ejercicios con el mismo nombre (para sincronizar notas/videos)
  // Devuelve exercise_id (de tabla exercises), NO user_exercise_config.id
  const getAllExerciseIdsByName = (targetName: string): string[] => {
    const normalizedTarget = targetName.toLowerCase().trim();
    const matchingIds: string[] = [];

    exercises.forEach((ex) => {
      // Verificar ejercicio principal - usar exercise_id
      if (ex.name.toLowerCase().trim() === normalizedTarget) {
        if (ex.exercise_id && !matchingIds.includes(ex.exercise_id)) {
          matchingIds.push(ex.exercise_id);
        }
      }

      // Verificar alternativas - alt.id ya es exercise_id
      if (ex.alternatives) {
        ex.alternatives.forEach((alt) => {
          if (alt.name.toLowerCase().trim() === normalizedTarget) {
            if (!matchingIds.includes(alt.id)) matchingIds.push(alt.id);
          }
        });
      }
    });

    return matchingIds;
  };

  // Auto-repair flag para evitar loops infinitos
  const autoRepairDone = useRef(false);

  // Ref del FlatList para scroll programático
  const exerciseListRef = useRef<FlatList>(null);

  // -------------------------------------------------------------------------
  // WEB: Control de scroll mecánico - un ejercicio/alternativa a la vez
  // -------------------------------------------------------------------------
  const isScrollingRef = useRef(false);
  const isScrollingHorizontalRef = useRef(false);
  const lastScrollTime = useRef(0);
  const lastScrollTimeH = useRef(0);
  const touchStartY = useRef(0);
  const touchStartX = useRef(0);
  const SCROLL_COOLDOWN = 150; // ms entre scrolls - rápido para mejor respuesta

  // Función para mover exactamente 1 ejercicio (vertical)
  const scrollToExerciseIndex = useCallback(
    (direction: 'up' | 'down') => {
      const now = Date.now();
      if (isScrollingRef.current || now - lastScrollTime.current < SCROLL_COOLDOWN) return;
      if (viewMode !== 'FOCUS') return;

      isScrollingRef.current = true;
      lastScrollTime.current = now;

      const newIndex =
        direction === 'down'
          ? Math.min(activeExerciseIndex + 1, exercises.length - 1)
          : Math.max(activeExerciseIndex - 1, 0);

      if (newIndex !== activeExerciseIndex) {
        // En web, solo actualizar el estado - CSS transform hace la animación
        if (Platform.OS === 'web') {
          setActiveExerciseIndex(newIndex);
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        } else if (exerciseListRef.current) {
          exerciseListRef.current.scrollToIndex({
            index: newIndex,
            animated: true,
          });
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        }
      }

      setTimeout(() => {
        isScrollingRef.current = false;
      }, SCROLL_COOLDOWN);
    },
    [activeExerciseIndex, exercises.length, viewMode]
  );

  // Función para mover exactamente 1 alternativa (horizontal)
  const scrollToAlternative = useCallback(
    (direction: 'left' | 'right') => {
      const now = Date.now();
      if (isScrollingHorizontalRef.current || now - lastScrollTimeH.current < SCROLL_COOLDOWN)
        return;
      if (viewMode !== 'FOCUS') return;

      isScrollingHorizontalRef.current = true;
      lastScrollTimeH.current = now;

      const currentAltIndex = activeAlternatives[activeExerciseIndex] || 0;
      const currentExercise = exercises[activeExerciseIndex];
      const totalAlternatives = 1 + (currentExercise?.alternatives?.length || 0);

      const newAltIndex =
        direction === 'right'
          ? Math.min(currentAltIndex + 1, totalAlternatives - 1)
          : Math.max(currentAltIndex - 1, 0);

      if (newAltIndex !== currentAltIndex) {
        setActiveAlternatives((prev) => ({ ...prev, [activeExerciseIndex]: newAltIndex }));
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }

      setTimeout(() => {
        isScrollingHorizontalRef.current = false;
      }, SCROLL_COOLDOWN);
    },
    [activeExerciseIndex, activeAlternatives, exercises, viewMode]
  );

  // Actualizar ref cuando cambian los modales locales
  useEffect(() => {
    const isNowOpen =
      notesModalVisible ||
      videoNotesModalVisible ||
      historialModalVisible ||
      structureModalOpen || // Modal de estructura principal (días)
      structureModalVisible || // Modal de focus series (ejercicio individual)
      seriesConfigModalVisible ||
      dayNameModalVisible ||
      addDayModalVisible ||
      cameraModalVisible ||
      modalVisible ||
      hankModalVisible;

    isAnyModalOpenRef.current = isNowOpen;
  }, [
    notesModalVisible,
    videoNotesModalVisible,
    historialModalVisible,
    structureModalOpen,
    structureModalVisible,
    seriesConfigModalVisible,
    dayNameModalVisible,
    addDayModalVisible,
    cameraModalVisible,
    modalVisible,
    hankModalVisible,
  ]);

  // Suscribirse al estado del chat de HANK (sin causar re-renders)
  useEffect(() => {
    const unsubscribe = subscribeToHankChat((isOpen) => {
      if (isOpen) {
        // Modal se abre: marcar como abierto
        isAnyModalOpenRef.current = true;
      } else {
        // Modal se cierra: desmarcar inmediatamente para permitir interacción
        // No usamos cooldown aquí porque ya no es necesario con las dimensiones fijas
        isAnyModalOpenRef.current = false;
      }
    });
    return unsubscribe;
  }, []);

  // Helper: verificar si el elemento o sus ancestros tienen scroll horizontal
  const isInsideHorizontalScroll = (element: HTMLElement | null): boolean => {
    let current = element;
    while (current) {
      const style = window.getComputedStyle(current);
      const overflowX = style.overflowX;
      // Si el elemento tiene scroll horizontal habilitado
      if (overflowX === 'scroll' || overflowX === 'auto') {
        // Y tiene contenido que puede scrollear horizontalmente
        if (current.scrollWidth > current.clientWidth) {
          return true;
        }
      }
      current = current.parentElement;
    }
    return false;
  };

  // Helper: verificar si el elemento está dentro de un modal/overlay (position fixed con z-index alto)
  const isInsideModalOrOverlay = (element: HTMLElement | null): boolean => {
    let current = element;
    while (current) {
      const style = window.getComputedStyle(current);
      // Detectar modales/overlays por position fixed/absolute con z-index alto
      if (
        (style.position === 'fixed' || style.position === 'absolute') &&
        parseInt(style.zIndex || '0', 10) >= 40
      ) {
        return true;
      }
      // También detectar por role de accesibilidad
      if (
        current.getAttribute('role') === 'dialog' ||
        current.getAttribute('aria-modal') === 'true'
      ) {
        return true;
      }
      // Detectar por clases comunes de modales de React Native Web
      if (current.className?.includes?.('modal') || current.className?.includes?.('overlay')) {
        return true;
      }
      current = current.parentElement;
    }
    return false;
  };

  // Ref para guardar si el touch empezó dentro de un scroll horizontal o modal
  const touchStartedInScrollRef = useRef(false);
  const touchStartedInModalRef = useRef(false);

  // Effect para capturar wheel/touch events en web
  useEffect(() => {
    if (Platform.OS !== 'web' || viewMode !== 'FOCUS') return;

    const handleWheel = (e: WheelEvent) => {
      // Ignorar si hay un modal abierto
      if (isAnyModalOpenRef.current) return;

      // Ignorar si el evento viene de dentro de un modal/overlay (detectado por DOM)
      if (isInsideModalOrOverlay(e.target as HTMLElement)) return;

      // Ignorar si el evento viene de dentro de un scroll horizontal (ej: SeriesCard)
      if (isInsideHorizontalScroll(e.target as HTMLElement)) return;

      // Solo interceptar si el scroll es significativo
      if (Math.abs(e.deltaY) < 10 && Math.abs(e.deltaX) < 10) return;

      e.preventDefault();
      e.stopPropagation();

      // Scroll horizontal para alternativas tiene prioridad
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY) && Math.abs(e.deltaX) > 10) {
        if (e.deltaX > 0) {
          scrollToAlternative('right');
        } else {
          scrollToAlternative('left');
        }
      } else if (Math.abs(e.deltaY) > 10) {
        // Scroll vertical para ejercicios
        if (e.deltaY > 0) {
          scrollToExerciseIndex('down');
        } else {
          scrollToExerciseIndex('up');
        }
      }
    };

    const handleTouchStart = (e: TouchEvent) => {
      // Ignorar si hay un modal abierto
      if (isAnyModalOpenRef.current) return;

      // Verificar si el touch empezó dentro de un modal/overlay
      touchStartedInModalRef.current = isInsideModalOrOverlay(e.target as HTMLElement);
      if (touchStartedInModalRef.current) return;

      // Verificar si el touch empezó dentro de un scroll horizontal
      touchStartedInScrollRef.current = isInsideHorizontalScroll(e.target as HTMLElement);

      touchStartY.current = e.touches[0].clientY;
      touchStartX.current = e.touches[0].clientX;
    };

    const handleTouchEnd = (e: TouchEvent) => {
      // Ignorar si hay un modal abierto
      if (isAnyModalOpenRef.current) return;

      // Ignorar si el touch empezó dentro de un modal/overlay
      if (touchStartedInModalRef.current) {
        touchStartedInModalRef.current = false;
        return;
      }

      // Ignorar si el touch empezó dentro de un scroll horizontal
      if (touchStartedInScrollRef.current) {
        touchStartedInScrollRef.current = false;
        return;
      }

      const deltaY = touchStartY.current - e.changedTouches[0].clientY;
      const deltaX = touchStartX.current - e.changedTouches[0].clientX;
      const SWIPE_THRESHOLD = 50;

      // Detectar dirección predominante
      if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > SWIPE_THRESHOLD) {
        // Swipe horizontal - cambiar alternativa
        if (deltaX > 0) {
          scrollToAlternative('right');
        } else {
          scrollToAlternative('left');
        }
      } else if (Math.abs(deltaY) > SWIPE_THRESHOLD) {
        // Swipe vertical - cambiar ejercicio
        if (deltaY > 0) {
          scrollToExerciseIndex('down');
        } else {
          scrollToExerciseIndex('up');
        }
      }
    };

    // Agregar listeners al window
    window.addEventListener('wheel', handleWheel, { passive: false });
    window.addEventListener('touchstart', handleTouchStart, { passive: true });
    window.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      window.removeEventListener('wheel', handleWheel);
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchend', handleTouchEnd);
    };
  }, [viewMode, scrollToExerciseIndex, scrollToAlternative]);

  // -------------------------------------------------------------------------
  // SPOTIFY: Cargar estado inicial para captura durante grabación
  // -------------------------------------------------------------------------
  useEffect(() => {
    const initSpotify = async () => {
      // Solo cargar si no está ya conectado en memoria
      if (spotify.isTokenValid()) {
        setSpotifyConnected(true);
        return;
      }

      // Intentar cargar desde storage
      const connected = await spotify.loadStoredTokens();
      setSpotifyConnected(connected);
      if (connected && !contextSpotifyConnected) {
        await updateSpotifyStatus(true, true);
      }
    };
    initSpotify();
  }, [contextSpotifyConnected, updateSpotifyStatus]);

  // -------------------------------------------------------------------------
  // SPOTIFY NOW PLAYING - Polling para fondo animado en modo FOCUS
  // -------------------------------------------------------------------------
  useEffect(() => {
    // Solo hacer polling si está en modo FOCUS y Spotify está conectado
    if (!isFocused || viewMode !== 'FOCUS' || !spotifyPremium) {
      return;
    }

    // Función para obtener estado actual
    const fetchSpotifyState = async () => {
      try {
        const state = await spotify.getPlaybackState();
        if (state?.track) {
          setSpotifyCurrentTrack(state.track);
          setSpotifyIsPlaying(state.isPlaying);
        } else {
          setSpotifyCurrentTrack(null);
          setSpotifyIsPlaying(false);
        }
      } catch (error) {
        // Silenciar errores de polling
        console.warn('Spotify polling error:', error);
      }
    };

    // Fetch inicial
    fetchSpotifyState();

    // Polling cada 3 segundos
    const interval = setInterval(fetchSpotifyState, 3000);

    return () => clearInterval(interval);
  }, [isFocused, viewMode, spotifyPremium]);

  // -------------------------------------------------------------------------
  // SYNC ACTIVE EXERCISE WITH HANK CONTEXT
  // -------------------------------------------------------------------------
  useEffect(() => {
    // Sincronizar módulo actual con HANK (incluyendo día de entrenamiento)
    if (isFocused) {
      setScreenContext({
        module: 'gym',
        viewMode: viewMode,
        currentExerciseIndex: activeExerciseIndex,
        currentTrainingDay: selectedDayIndex,
      });
    }
  }, [isFocused, viewMode, activeExerciseIndex, selectedDayIndex, setScreenContext]);

  // Extraer el índice de alternativa actual como valor primitivo para dependencia estable
  const currentAltIndexForSync = activeAlternatives[activeExerciseIndex] || 0;

  useEffect(() => {
    // Sincronizar ejercicio activo con HANK (considerando alternativas)
    // Y actualizar ProContext para Smart Trigger
    const currentExercise = exercises[activeExerciseIndex];
    if (currentExercise && isFocused) {
      const altIndex = currentAltIndexForSync;

      // Determinar nombre del ejercicio actual (principal o alternativa)
      let exerciseName = currentExercise.name;
      // Para PRO: usar exercise_id (ID real del ejercicio, NO user_exercise_config.id)
      let exerciseId = currentExercise.exercise_id;

      // Si altIndex > 0, estamos en una alternativa
      if (
        altIndex > 0 &&
        currentExercise.alternatives &&
        currentExercise.alternatives[altIndex - 1]
      ) {
        const alternativeId = currentExercise.alternatives[altIndex - 1].id;
        const alternativeName = currentExercise.alternatives[altIndex - 1].name;
        exerciseId = alternativeId;
        exerciseName = alternativeName;
      }

      // SIEMPRE actualizar el contexto táctico cuando GYM está enfocado
      // (Para que PRO tenga el contexto correcto al entrar)
      const relatedIds = getAllExerciseIdsByName(exerciseName);
      let notes = '';
      let tags: string[] = [];

      for (const id of relatedIds) {
        if (!notes && exerciseNotes[id]) {
          notes = exerciseNotes[id];
        }
        if (tags.length === 0 && exerciseTags[id] && exerciseTags[id].length > 0) {
          tags = exerciseTags[id];
        }
        if (notes && tags.length > 0) break;
      }

      setTacticalContext(exerciseId, exerciseName, notes, tags);

      // SIEMPRE sincronizar con HANK cuando el ejercicio cambie (EN TODOS LOS MODOS)
      // BUGFIX: Antes solo se sincronizaba en FOCUS, causando que Hank
      // operara en el ejercicio incorrecto en GRID/LIST
      if (altIndex > 0 && currentExercise.alternatives?.[altIndex - 1]) {
        console.warn('🔄 GYM: Sincronizando ALTERNATIVA con HANK:', {
          exerciseId,
          exerciseName,
          parentExerciseName: currentExercise.name,
          parentConfigId: currentExercise.id, // user_exercise_config.id del ejercicio principal
          altIndex,
          viewMode,
        });
        setActiveAsset(exerciseId, {
          isAlternative: true,
          parentExerciseName: currentExercise.name,
          parentConfigId: currentExercise.id, // Pasar configId directamente para evitar búsqueda
        });
      } else {
        console.warn('🔄 GYM: Sincronizando EJERCICIO PRINCIPAL con HANK:', {
          exerciseId,
          exerciseName,
          configId: currentExercise.id,
          altIndex,
          viewMode,
        });
        setActiveAsset(exerciseId);
      }
    }
  }, [
    activeExerciseIndex,
    exercises,
    isFocused,
    currentAltIndexForSync, // Valor primitivo que React detecta correctamente
    viewMode,
    setTacticalContext,
    setActiveAsset,
    exerciseNotes,
    exerciseTags,
  ]);

  // Modal drag state
  const translateYHistorial = useSharedValue(0);
  const translateYStructure = useSharedValue(0);
  const translateYFocusSeries = useSharedValue(0);
  const translateYCatalog = useSharedValue(0);
  const translateYSeriesConfig = useSharedValue(0);
  const translateYNotes = useSharedValue(0);
  const translateYVideoNotes = useSharedValue(0);

  const animatedStyleHistorial = useAnimatedStyle(() => ({
    transform: [{ translateY: translateYHistorial.value }],
  }));

  const animatedStyleStructure = useAnimatedStyle(() => ({
    transform: [{ translateY: translateYStructure.value }],
  }));

  const animatedStyleFocusSeries = useAnimatedStyle(() => ({
    transform: [{ translateY: translateYFocusSeries.value }],
  }));

  const animatedStyleCatalog = useAnimatedStyle(() => ({
    transform: [{ translateY: translateYCatalog.value }],
  }));

  const animatedStyleSeriesConfig = useAnimatedStyle(() => ({
    transform: [{ translateY: translateYSeriesConfig.value }],
  }));

  const animatedStyleNotes = useAnimatedStyle(() => ({
    transform: [{ translateY: translateYNotes.value }],
  }));

  const animatedStyleVideoNotes = useAnimatedStyle(() => ({
    transform: [{ translateY: translateYVideoNotes.value }],
  }));

  const closeHistorialWithAnimation = () => setHistorialModalVisible(false);

  const panResponderHistorial = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => Math.abs(gestureState.dy) > 5,
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy > 0) {
          translateYHistorial.value = gestureState.dy;
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > 150) {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          // Animar hacia abajo y luego cerrar
          translateYHistorial.value = withTiming(
            800,
            { duration: 200, easing: Easing.out(Easing.ease) },
            () => runOnJS(closeHistorialWithAnimation)()
          );
        } else {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          translateYHistorial.value = withTiming(0, { duration: 150 });
        }
      },
    })
  ).current;

  // Ref para guardar series al cerrar con gesto
  const saveFocusSeriesRef = useRef<() => void>(() => {});

  // Effect para animar entrada del modal de estructura principal
  useEffect(() => {
    if (structureModalOpen) {
      translateYStructure.value = SCREEN_HEIGHT;
      translateYStructure.value = withTiming(0, { duration: 300, easing: Easing.out(Easing.ease) });
    }
  }, [structureModalOpen]);

  // Effect para animar entrada del modal de focus series (single)
  useEffect(() => {
    if (structureModalVisible) {
      translateYFocusSeries.value = SCREEN_HEIGHT;
      translateYFocusSeries.value = withTiming(0, {
        duration: 300,
        easing: Easing.out(Easing.ease),
      });
    }
  }, [structureModalVisible]);

  const closeStructureWithAnimation = async () => {
    // BUGFIX: Capturar el día actual desde la ref para evitar closure stale
    const targetDay = selectedDayIndexRef.current;
    console.log('🎯 closeStructureWithAnimation - targetDay capturado:', targetDay);

    // 🧹 BUGFIX: Limpiar estados de dragging para evitar pantalla opaca
    setIsDraggingExercise(false);
    setDragTargetIndex(null);
    setDraggingFromIndex(null);

    // Guardar la configuración del día (igual que el botón ENTRENAR)
    if (user) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayISO = today.toISOString();

      await supabase
        .from('profiles')
        .update({
          training_last_access: todayISO,
          training_current_day: targetDay,
        })
        .eq('id', user.id);

      setTrainingProgram((prev) => ({
        ...prev,
        lastAccessDate: todayISO,
        currentDayIndex: targetDay,
      }));
      console.log('🏋️ Día de entrenamiento guardado al cerrar modal:', targetDay);
    }

    // SOLUCIÓN: Limpiar estado de alternativas para empezar limpio
    // Esto evita que índices "recordados" apunten a alternativas que no existen
    console.log('🧹 closeStructure: Limpiando activeAlternatives para estado limpio');
    setActiveAlternatives({});
    activeAlternativesRef.current = {};

    // Paso 1: Cerrar el modal primero para mejor UX
    setStructureModalOpen(false);

    // Paso 2: Cargar datos frescos desde Supabase
    console.log('📥 closeStructure: Cargando ejercicios frescos para día:', targetDay);
    await loadExercises(targetDay, true);

    // Paso 3: Incrementar key para forzar re-render del FlatList con datos nuevos
    setListRefreshKey((prev) => prev + 1);

    console.log('✅ closeStructure: Datos frescos cargados');
    exercisesRef.current.forEach((e, i) => {
      console.log(`   [${i}] ${e.name}: ${e.alternatives?.length || 0} alternativas`);
    });
  };

  const closeFocusSeriesWithAnimation = async () => {
    // BUGFIX: Esperar a que termine el guardado antes de cerrar para evitar race conditions
    await saveFocusSeriesRef.current();
    setStructureModalVisible(false);
  };

  const panResponderStructure = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => Math.abs(gestureState.dy) > 5,
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy > 0) {
          translateYStructure.value = gestureState.dy;
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > 150) {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          // Animar hacia abajo y luego cerrar
          translateYStructure.value = withTiming(
            800,
            { duration: 200, easing: Easing.out(Easing.ease) },
            () => runOnJS(closeStructureWithAnimation)()
          );
        } else {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          translateYStructure.value = withTiming(0, { duration: 150 });
        }
      },
    })
  ).current;

  // NUEVO: PanResponder exclusivo para el modal de Series (Focus)
  const panResponderFocusSeries = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => Math.abs(gestureState.dy) > 5,
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy > 0) {
          translateYFocusSeries.value = gestureState.dy;
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > 150) {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          // Animar hacia abajo y luego cerrar
          translateYFocusSeries.value = withTiming(
            800,
            { duration: 200, easing: Easing.out(Easing.ease) },
            () => runOnJS(closeFocusSeriesWithAnimation)()
          );
        } else {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          translateYFocusSeries.value = withTiming(0, { duration: 150 });
        }
      },
    })
  ).current;

  const panResponderCatalog = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => Math.abs(gestureState.dy) > 5,
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy > 0) {
          translateYCatalog.value = gestureState.dy;
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > 150) {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          setModalVisible(false);
          setCatalogTab('SUGERIDOS');
          setTimeout(() => {
            translateYCatalog.value = 0;
          }, 300);
        } else {
          translateYCatalog.value = withSpring(0);
        }
      },
    })
  ).current;

  // Ref para guardar series config al cerrar
  const saveSeriesConfigRef = useRef<() => Promise<void>>(async () => {});

  const closeSeriesConfigModal = async () => {
    // Guardar automáticamente antes de cerrar
    await saveSeriesConfigRef.current();
    setSeriesConfigModalVisible(false);
    // Solo abrir catálogo si vino del catálogo
    if (seriesConfigFromCatalogRef.current) {
      setModalVisible(true);
    }
    setSeriesConfigFromCatalog(false);
    seriesConfigFromCatalogRef.current = false;
  };

  const closeSeriesConfigWithAnimation = () => {
    // Guardar y cerrar
    saveSeriesConfigRef.current().then(() => {
      setSeriesConfigModalVisible(false);
      if (seriesConfigFromCatalogRef.current) {
        setModalVisible(true);
      }
      setSeriesConfigFromCatalog(false);
      seriesConfigFromCatalogRef.current = false;
    });
  };

  const panResponderSeriesConfig = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => Math.abs(gestureState.dy) > 5,
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy > 0) {
          translateYSeriesConfig.value = gestureState.dy;
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > 150) {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          // Animar hacia abajo y luego cerrar
          translateYSeriesConfig.value = withTiming(
            800,
            { duration: 200, easing: Easing.out(Easing.ease) },
            () => runOnJS(closeSeriesConfigWithAnimation)()
          );
        } else {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          translateYSeriesConfig.value = withTiming(0, { duration: 150 });
        }
      },
    })
  ).current;

  // Flag para indicar que el modal de notas se cerró con gesto (debe guardar)
  const shouldSaveNotesOnCloseRef = useRef(false);

  const closeNotesWithAnimation = () => {
    shouldSaveNotesOnCloseRef.current = true;
    setNotesModalVisible(false);
  };

  const panResponderNotes = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => Math.abs(gestureState.dy) > 5,
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy > 0) {
          translateYNotes.value = gestureState.dy;
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > 150) {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          // Animar hacia abajo y luego cerrar
          translateYNotes.value = withTiming(
            800,
            { duration: 200, easing: Easing.out(Easing.ease) },
            () => runOnJS(closeNotesWithAnimation)()
          );
        } else {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          translateYNotes.value = withTiming(0, { duration: 150 });
        }
      },
    })
  ).current;

  // Ref para saber si debemos guardar video notes al cerrar
  const shouldSaveVideoNotesOnCloseRef = useRef(false);

  const closeVideoNotesWithAnimation = () => {
    shouldSaveVideoNotesOnCloseRef.current = true;
    setVideoNotesModalVisible(false);
  };

  const panResponderVideoNotes = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => Math.abs(gestureState.dy) > 5,
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy > 0) {
          translateYVideoNotes.value = gestureState.dy;
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > 150) {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          translateYVideoNotes.value = withTiming(
            800,
            { duration: 200, easing: Easing.out(Easing.ease) },
            () => runOnJS(closeVideoNotesWithAnimation)()
          );
        } else {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          translateYVideoNotes.value = withTiming(0, { duration: 150 });
        }
      },
    })
  ).current;

  // Resetear translateY y animar entrada cuando los modales se abren
  useEffect(() => {
    if (historialModalVisible) {
      // Empezar fuera de pantalla y animar hacia arriba
      translateYHistorial.value = 800;
      translateYHistorial.value = withTiming(0, { duration: 300, easing: Easing.out(Easing.ease) });
      setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium), 100);
    }
  }, [historialModalVisible]);

  // NOTA: El effect para structureModalVisible ya está arriba usando translateYFocusSeries

  useEffect(() => {
    if (notesModalVisible) {
      // Empezar fuera de pantalla y animar hacia arriba
      translateYNotes.value = 800;
      translateYNotes.value = withTiming(0, { duration: 300, easing: Easing.out(Easing.ease) });
      setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium), 100);
    }
  }, [notesModalVisible]);

  // Animar entrada del modal de video notes
  useEffect(() => {
    if (videoNotesModalVisible) {
      translateYVideoNotes.value = 800;
      translateYVideoNotes.value = withTiming(0, {
        duration: 300,
        easing: Easing.out(Easing.ease),
      });
      setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium), 100);
    }
  }, [videoNotesModalVisible]);

  // Auto-save video notes al cerrar con gesto
  const prevVideoNotesModalVisibleRef = useRef(videoNotesModalVisible);
  useEffect(() => {
    if (prevVideoNotesModalVisibleRef.current && !videoNotesModalVisible) {
      if (shouldSaveVideoNotesOnCloseRef.current) {
        saveVideoNotes();
      }
      shouldSaveVideoNotesOnCloseRef.current = false;
    }
    prevVideoNotesModalVisibleRef.current = videoNotesModalVisible;
  }, [videoNotesModalVisible]);

  useEffect(() => {
    if (seriesConfigModalVisible) {
      // Empezar fuera de pantalla y animar hacia arriba
      translateYSeriesConfig.value = 800;
      translateYSeriesConfig.value = withTiming(0, {
        duration: 300,
        easing: Easing.out(Easing.ease),
      });
      setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium), 100);
    }
  }, [seriesConfigModalVisible]);

  // Asignar función de guardado al ref para auto-save al cerrar con gesto
  useEffect(() => {
    saveSeriesConfigRef.current = async () => {
      if (seriesConfig.length === 0 || !selectedTemplate) return;

      const existingExercise = exercises.find((ex) => ex.id === selectedTemplate.id);
      if (existingExercise) {
        try {
          const { data: currentConfig } = await supabase
            .from('user_exercise_config')
            .select('config')
            .eq('id', selectedTemplate.id)
            .single();

          const currentConfigData = currentConfig?.config || {};
          const seriesByDay = (currentConfigData.series_by_day as Record<string, unknown[]>) || {};
          // BUGFIX: Usar seriesConfigDayIndex (día capturado al abrir modal) en lugar de selectedDayIndex
          seriesByDay[String(seriesConfigDayIndex)] = seriesConfig;

          await supabase
            .from('user_exercise_config')
            .update({
              config: {
                ...selectedTemplate.default_metadata,
                ...currentConfigData,
                sets: `${seriesConfig.length}x${seriesConfig[0]?.reps || 10}`,
                series_by_day: seriesByDay,
              },
            })
            .eq('id', selectedTemplate.id);

          // BUGFIX: Usar seriesConfigDayIndex para recargar el día correcto
          await loadExercises(seriesConfigDayIndex);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } catch (error) {
          console.error('Error guardando series:', error);
        }
      } else {
        await addExerciseFromTemplate(selectedTemplate, seriesConfig);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    };
  }, [seriesConfig, selectedTemplate, seriesConfigDayIndex, exercises]);

  // Cargar series cuando se abre el modal de estructura (FOCUS mode)
  useEffect(() => {
    if (structureModalVisible && modalExercise) {
      // Convertir Series[] a SeriesConfig[]
      const mappedSeries: SeriesConfig[] = (modalExercise.series || [])
        .filter((s) => s && typeof s === 'object')
        .map((s) => ({
          id: s.id || Date.now().toString() + Math.random(),
          reps: parseInt(String(s.reps)) || 10,
          type: s.type as SeriesType,
          note: s.note || '',
          weight: s.weight || 0,
        }));
      setFocusSeriesConfig(
        mappedSeries.length > 0
          ? mappedSeries
          : [{ id: '1', reps: 10, type: 'EFECTIVA', note: '', weight: 0 }]
      );
    }
  }, [structureModalVisible, modalExercise]);

  // Cargar notas cuando se abre el modal de notas
  useEffect(() => {
    if (notesModalVisible && exercises[currentExerciseIndex]) {
      // Usar helper para obtener el ejercicio activo (principal o alternativa)
      const { id: exerciseId, name: exerciseName } = getActiveExerciseInfo(currentExerciseIndex);
      if (!exerciseId) return;

      // Obtener TODOS los IDs de ejercicios con el mismo nombre (para sincronizar notas)
      const allRelatedIds = getAllExerciseIdsByName(exerciseName);
      console.log(
        `📝 Cargando notas para "${exerciseName}" - IDs relacionados:`,
        allRelatedIds.length
      );

      // Cargar historial de notas del ejercicio
      const loadNotesHistory = async () => {
        if (!user) return;
        setLoadingNotesHistory(true);

        try {
          // Fecha de hoy (inicio del día)
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const todayStr = today.toISOString().split('T')[0];

          // Obtener notas de videos de TODOS los ejercicios con el mismo nombre
          const { data: videoNotes, error } = await supabase
            .from('pro_videos')
            .select('id, exercise_id, notes, exercise_notes, tags, created_at')
            .eq('user_id', user.id)
            .in('exercise_id', allRelatedIds)
            .or('notes.not.is.null,exercise_notes.not.is.null')
            .order('created_at', { ascending: false })
            .limit(20);

          if (error) throw error;

          const history: Array<{
            id: string;
            date: string;
            rawDate: string;
            notes: string;
            tags?: string[];
            type: 'video' | 'session';
            videoId?: string;
            isToday: boolean;
          }> = [];

          let foundTodayNote: string | null = null;
          let todayNoteContent = '';
          let todayNoteTags: string[] = [];

          // Agregar notas de videos
          videoNotes?.forEach((v: any) => {
            const noteContent = v.notes || v.exercise_notes;
            if (noteContent) {
              const date = new Date(v.created_at);
              const dateStr = date.toISOString().split('T')[0];
              const isToday = dateStr === todayStr;

              // IMPORTANTE: Solo marcar como "nota de hoy" si:
              // 1. Es del día de hoy (fecha)
              // 2. Pertenece al ejercicio ACTUAL específico (no solo mismo nombre en otro día)
              const isCurrentExerciseToday = isToday && v.exercise_id === exerciseId;

              if (isCurrentExerciseToday && !foundTodayNote) {
                foundTodayNote = v.id;
                todayNoteContent = noteContent;
                todayNoteTags = v.tags || [];
              }

              history.push({
                id: v.id,
                date: date.toLocaleDateString('es-ES', {
                  day: 'numeric',
                  month: 'short',
                  year: date.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined,
                }),
                rawDate: dateStr,
                notes: noteContent,
                tags: v.tags,
                type: 'video',
                videoId: v.id,
                isToday: isCurrentExerciseToday, // Solo es "de hoy" si es del ejercicio actual
              });
            }
          });

          setNotesHistory(history);
          setTodayNoteId(foundTodayNote);

          // Si hay nota de hoy, cargar su contenido
          if (foundTodayNote) {
            setCurrentNoteText(todayNoteContent);
            setExerciseTags((prev) => ({ ...prev, [exerciseId]: todayNoteTags }));
          } else {
            // Si no hay nota de hoy, cargar desde metadata (user_exercise_config)
            // Hacer fetch directo para asegurar datos actualizados
            // Buscar en TODOS los IDs relacionados por nombre
            const { data: configData } = await supabase
              .from('user_exercise_config')
              .select('metadata')
              .eq('user_id', user.id)
              .in('exercise_id', allRelatedIds);

            // Buscar la primera nota/tags que encontremos
            let savedNotes = '';
            let savedTags: string[] = [];

            configData?.forEach((cfg: any) => {
              if (!savedNotes && cfg.metadata?.notes) {
                savedNotes = cfg.metadata.notes;
              }
              if (savedTags.length === 0 && cfg.metadata?.tags) {
                savedTags = cfg.metadata.tags;
              }
            });

            setCurrentNoteText(savedNotes);
            setExerciseTags((prev) => ({ ...prev, [exerciseId]: savedTags }));

            // Actualizar cache local para todos los IDs relacionados
            if (savedNotes) {
              const notesUpdate: Record<string, string> = {};
              allRelatedIds.forEach((id) => {
                notesUpdate[id] = savedNotes;
              });
              setExerciseNotes((prev) => ({ ...prev, ...notesUpdate }));
            }
          }
        } catch (err) {
          console.error('Error loading notes history:', err);
          setCurrentNoteText(exerciseNotes[exerciseId] || '');
        } finally {
          setLoadingNotesHistory(false);
        }
      };

      loadNotesHistory();
    }
  }, [notesModalVisible, currentExerciseIndex, exercises, user, activeAlternatives]);

  // Guardar notas automáticamente cuando el modal se cierra con gesto
  const prevNotesModalVisibleRef = useRef(notesModalVisible);
  useEffect(() => {
    // Detectar cuando el modal pasa de visible a no visible
    if (prevNotesModalVisibleRef.current && !notesModalVisible) {
      // El modal se cerró - guardar si fue por gesto o botón Android
      if (shouldSaveNotesOnCloseRef.current) {
        saveExerciseNotes();
        shouldSaveNotesOnCloseRef.current = false;
      }
    }
    prevNotesModalVisibleRef.current = notesModalVisible;
  }, [notesModalVisible]);

  // Cargar notas de ejercicios desde la base de datos
  useEffect(() => {
    const loadExerciseNotes = async () => {
      if (!user || exercises.length === 0) return;

      try {
        // Recopilar IDs de ejercicios (exercise_id de tabla exercises, NO user_exercise_config.id)
        const allExerciseIds: string[] = [];
        exercises.forEach((ex) => {
          // Usar exercise_id (ID real del ejercicio en tabla exercises)
          if (ex.exercise_id) allExerciseIds.push(ex.exercise_id);
          if (ex.alternatives) {
            ex.alternatives.forEach((alt) => allExerciseIds.push(alt.id));
          }
        });

        // 1. Primero cargar notas de user_exercise_config
        const { data, error } = await supabase
          .from('user_exercise_config')
          .select('exercise_id, metadata')
          .eq('user_id', user.id)
          .in('exercise_id', allExerciseIds);

        if (error) throw error;

        const notesMap: Record<string, string> = {};
        const tagsMap: Record<string, string[]> = {};

        data?.forEach((config: any) => {
          if (config.metadata?.notes) {
            notesMap[config.exercise_id] = config.metadata.notes;
          }
          if (config.metadata?.tags) {
            tagsMap[config.exercise_id] = config.metadata.tags;
          }
        });

        // 2. Buscar notas de pro_videos para ejercicios que NO tienen notas en user_exercise_config
        const exercisesWithoutNotes = allExerciseIds.filter((id) => !notesMap[id]);
        if (exercisesWithoutNotes.length > 0) {
          const { data: videoNotes, error: videoError } = await supabase
            .from('pro_videos')
            .select('exercise_id, notes, exercise_notes, tags')
            .eq('user_id', user.id)
            .in('exercise_id', exercisesWithoutNotes)
            .or('notes.not.is.null,exercise_notes.not.is.null')
            .order('created_at', { ascending: false });

          if (!videoError && videoNotes) {
            // Usar la nota más reciente por ejercicio
            videoNotes.forEach((v: any) => {
              const noteContent = v.notes || v.exercise_notes;
              if (noteContent && !notesMap[v.exercise_id]) {
                notesMap[v.exercise_id] = noteContent;
              }
              if (v.tags && v.tags.length > 0 && !tagsMap[v.exercise_id]) {
                tagsMap[v.exercise_id] = v.tags;
              }
            });
          }
        }

        setExerciseNotes(notesMap);
        setExerciseTags(tagsMap);
      } catch (err) {
        console.error('Error loading exercise notes:', err);
      }
    };

    loadExerciseNotes();
  }, [user, exercises.length]);

  // Cargar videos del ejercicio cuando se abre el historial
  useEffect(() => {
    const fetchExerciseVideos = async () => {
      if (!historialModalVisible || !modalExercise || !user) return;

      setLoadingVideos(true);
      try {
        // Usar exercise_id (de tabla exercises), no el id de user_exercise_config
        const exerciseId = modalExercise.exercise_id || modalExercise.id;

        const { data, error } = await supabase
          .from('pro_videos')
          .select('*')
          .eq('user_id', user.id)
          .eq('exercise_id', exerciseId)
          .not('video_url', 'is', null)
          .order('created_at', { ascending: false });

        if (error) throw error;

        // Mapear a formato VideoRecord
        const mappedVideos: VideoRecord[] = (data || []).map((v: any) => ({
          id: v.id,
          date: new Date(v.created_at).toLocaleDateString('es-ES', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
          }),
          weight: v.weight_kg || 0,
          reps: v.reps || 0,
          free_text: v.free_text,
          is_public: v.is_public,
          videoUrl: v.video_url,
          video_url: v.video_url,
          thumbnail_url: v.thumbnail_url || v.video_url,
          cloudflare_video_id: v.cloudflare_video_id,
          spotify: v.spotify,
          notes: v.notes,
          exercise_notes: v.exercise_notes,
          tags: v.tags,
          media_type: v.media_type || 'video',
        }));

        setExerciseVideos(mappedVideos);
      } catch (err) {
        console.error('Error fetching exercise videos:', err);
        setExerciseVideos([]);
      } finally {
        setLoadingVideos(false);
      }
    };

    fetchExerciseVideos();
  }, [historialModalVisible, modalExercise]);

  // ============================================================================
  // VIDEO ACTIONS
  // ============================================================================

  // Eliminar video de pro_videos
  const handleDeleteVideo = async () => {
    if (!selectedVideo) return;
    deleteVideoFromHistorial(selectedVideo);
  };

  // Eliminar video desde historial (para long press)
  const deleteVideoFromHistorial = async (video: VideoRecord) => {
    Alert.alert(
      '🗑️ ELIMINAR VIDEO',
      '¿Estás seguro de que quieres eliminar este video? Esta acción no se puede deshacer.',
      [
        { text: 'CANCELAR', style: 'cancel' },
        {
          text: 'ELIMINAR',
          style: 'destructive',
          onPress: async () => {
            try {
              await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

              // 1. Eliminar de Cloudflare Stream si existe
              if (video.cloudflare_video_id) {
                console.warn(
                  '🗑️ Eliminando video de Cloudflare Stream:',
                  video.cloudflare_video_id
                );
                const deleted = await cloudflareStream.deleteVideo(video.cloudflare_video_id);
                if (deleted) {
                  console.warn('✅ Video eliminado de Cloudflare Stream');
                } else {
                  console.warn('⚠️ No se pudo eliminar de Cloudflare Stream (continuando con DB)');
                }
              }

              // 2. Eliminar de la base de datos
              const { error } = await supabase.from('pro_videos').delete().eq('id', video.id);

              if (error) throw error;

              // 3. Eliminar de personal_records si está vinculado
              await supabase.from('personal_records').delete().eq('video_id', video.id);

              // Actualizar lista local del modal historial
              setExerciseVideos((prev) => prev.filter((v) => v.id !== video.id));

              // También actualizar la lista de ejercicios para que el video desaparezca de las cards
              setExercises((prevExercises) =>
                prevExercises.map((ex) => ({
                  ...ex,
                  videos: ex.videos.filter((v) => v.id !== video.id),
                  alternatives: ex.alternatives?.map((alt) => ({
                    ...alt,
                    videos: alt.videos.filter((v) => v.id !== video.id),
                  })),
                }))
              );

              // Si el video eliminado era el seleccionado, cerrar viewer
              if (selectedVideo?.id === video.id) {
                setVideoViewerVisible(false);
                setSelectedVideo(null);
              }

              await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            } catch (err) {
              console.error('Error deleting video:', err);
              await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            }
          },
        },
      ]
    );
  };

  // Toggle visibilidad pública del video
  const handleToggleVisibility = async () => {
    if (!selectedVideo) return;

    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      const newPublicState = !selectedVideo.is_public;

      const { error } = await supabase
        .from('pro_videos')
        .update({ is_public: newPublicState })
        .eq('id', selectedVideo.id);

      if (error) throw error;

      // Actualizar estado local
      setSelectedVideo((prev) => (prev ? { ...prev, is_public: newPublicState } : null));
      setExerciseVideos((prev) =>
        prev.map((v) => (v.id === selectedVideo.id ? { ...v, is_public: newPublicState } : v))
      );

      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err) {
      console.error('Error toggling visibility:', err);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  };

  // Compartir - mostrar instrucción para screen record
  const handleShareVideo = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Alert.alert(
      '📱 COMPARTIR CON BRANDING',
      'Graba tu pantalla mientras reproduces este video para compartirlo con los overlays de TRENS.\n\n• Logo TRENS\n• Datos del ejercicio\n• Peso × Reps\n• Tu track de Spotify',
      [{ text: 'ENTENDIDO', style: 'default' }]
    );
  };

  // ============================================================================
  // TRAINING DAY LOGIC
  // ============================================================================
  const updateTrainingDay = async () => {
    if (!user) return;

    try {
      // ===========================================================================
      // DETECTAR MODO DE ENTRENAMIENTO (external vs gym_module)
      // ===========================================================================
      const { data: userProfileData, error: profileError } = await supabase
        .from('user_profiles')
        .select('training_mode, external_schedule')
        .eq('user_id', user.id)
        .single();

      console.warn('🔍 GYM DETECCIÓN:', {
        userProfileData,
        error: profileError?.message,
      });

      const trainingMode = userProfileData?.training_mode || 'none';
      const extSchedule = userProfileData?.external_schedule || {};

      console.warn('🔍 GYM MODO:', {
        trainingMode,
        extScheduleKeys: Object.keys(extSchedule),
        condition: trainingMode === 'external' && Object.keys(extSchedule).length > 0,
      });

      // Flag para indicar si los días ya fueron configurados en modo personalizado
      let externalModeConfigured = false;

      if (trainingMode === 'external' && Object.keys(extSchedule).length > 0) {
        // MODO PERSONALIZADO: Usuario tiene su propio horario, puede agregar ejercicios
        externalModeConfigured = true;
        setIsExternalMode(true);
        setExternalSchedule(extSchedule);
        console.warn('🏋️ GYM [PERSONALIZADO]: Horario cargado:', extSchedule);

        // SINCRONIZAR: Crear días de entrenamiento basados en el horario personalizado
        // Esto permite que el usuario agregue ejercicios a sus días personalizados
        const personalizedDays = Object.entries(extSchedule).map(([dayName, muscleGroup], idx) => ({
          id: String(idx + 1),
          muscleGroups: `${dayName}: ${muscleGroup}`,
          exercises: [],
        }));

        // Actualizar profiles con los días sincronizados
        const routineNamesFromSchedule: Record<string, string> = {};
        Object.entries(extSchedule).forEach(([dayName, muscleGroup], idx) => {
          routineNamesFromSchedule[String(idx)] = `${dayName}: ${muscleGroup}`;
        });

        // Sincronizar con profiles para que los ejercicios funcionen
        await supabase
          .from('profiles')
          .update({
            training_frequency: personalizedDays.length,
            training_routine_names: routineNamesFromSchedule,
          })
          .eq('id', user.id);

        setTrainingProgram((prev) => ({
          ...prev,
          frequency: personalizedDays.length,
          days: personalizedDays,
        }));

        console.warn(
          '🏋️ GYM [PERSONALIZADO]: Sincronizados',
          personalizedDays.length,
          'días de entrenamiento'
        );
      } else {
        // Puede que el usuario tenga días pero training_mode no esté en 'external'
        // Cargar profiles para verificar si tiene días configurados
        const { data: profileCheck } = await supabase
          .from('profiles')
          .select('training_frequency, training_routine_names')
          .eq('id', user.id)
          .single();

        const hasManualDays = (profileCheck?.training_frequency ?? 0) > 0;

        if (hasManualDays && Object.keys(extSchedule).length === 0) {
          // Usuario tiene días en profiles pero no en external_schedule
          // Sincronizar automáticamente como modo personalizado
          const routineNames = profileCheck?.training_routine_names || {};
          const frequency = profileCheck?.training_frequency || 0;

          const syncedSchedule: Record<string, string> = {};
          for (let i = 0; i < frequency; i++) {
            syncedSchedule[`Día ${i + 1}`] = routineNames[String(i)] || `DÍA ${i + 1}`;
          }

          // Activar modo external automáticamente (usar upsert para garantizar que la fila exista)
          await supabase.from('user_profiles').upsert(
            {
              user_id: user.id,
              training_mode: 'external',
              external_schedule: syncedSchedule,
              training_days_per_week: frequency,
            },
            { onConflict: 'user_id' }
          );

          // Configurar días para modo personalizado sincronizado
          const syncedDays = Object.entries(syncedSchedule).map(([dayName, muscleGroup], idx) => ({
            id: String(idx + 1),
            muscleGroups: `${dayName}: ${muscleGroup}`,
            exercises: [],
          }));

          externalModeConfigured = true;
          setIsExternalMode(true);
          setExternalSchedule(syncedSchedule);
          setTrainingProgram((prev) => ({
            ...prev,
            frequency: syncedDays.length,
            days: syncedDays,
          }));
          console.warn('🔄 GYM: Sincronizado modo personalizado automáticamente:', syncedSchedule);
        } else {
          setIsExternalMode(false);
          setExternalSchedule({});
        }
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select(
          'training_last_access, training_current_day, training_routine_names, training_frequency'
        )
        .eq('id', user.id)
        .single();

      // Cargar frecuencia desde la base de datos (0 significa sin plan)
      const savedFrequency = profile?.training_frequency ?? 0;

      // Cargar nombres de rutinas desde la base de datos
      let routineNames = profile?.training_routine_names || {};

      // =========================================================================
      // RECONSTRUIR DÍAS: SOLO SI NO ESTÁ EN MODO PERSONALIZADO
      // En modo personalizado, los días ya se configuraron arriba con el formato correcto
      // =========================================================================
      if (!externalModeConfigured) {
        // Si frequency es 0, el usuario no tiene días de entrenamiento
        if (savedFrequency === 0) {
          setTrainingProgram((prev) => ({
            ...prev,
            frequency: 0,
            days: [],
            currentDayIndex: 0,
          }));
          console.warn('🏋️ GYM: Usuario sin plan de entrenamiento (0 días)');
        } else {
          // Si no hay nombres guardados, inicializar con los valores por defecto
          if (Object.keys(routineNames).length === 0) {
            const defaultNames: Record<string, string> = {};
            trainingProgram.days.forEach((day, idx) => {
              defaultNames[String(idx)] = day.muscleGroups;
            });

            // Guardar los nombres por defecto en la base de datos
            await supabase
              .from('profiles')
              .update({ training_routine_names: defaultNames })
              .eq('id', user.id);

            routineNames = defaultNames;
            console.warn('🏋️ GYM: Nombres de rutinas inicializados:', defaultNames);
          }

          // Reconstruir días basados en la frecuencia guardada (MODO GYM MODULE - naranja)
          const numDays = savedFrequency;
          const updatedDays = Array.from({ length: numDays }, (_, idx) => ({
            id: String(idx + 1),
            muscleGroups: routineNames[String(idx)] || `DÍA ${idx + 1}`,
            exercises: [],
          }));

          setTrainingProgram((prev) => ({
            ...prev,
            frequency: numDays,
            days: updatedDays,
          }));
        }
      }

      // Si no hay días, no hay nada más que hacer
      if (savedFrequency === 0) {
        return;
      }

      const numDays = savedFrequency;
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayISO = today.toISOString();

      let newDayIndex = trainingProgram.currentDayIndex;

      if (profile?.training_last_access) {
        const lastAccess = new Date(profile.training_last_access);
        lastAccess.setHours(0, 0, 0, 0);
        const lastAccessISO = lastAccess.toISOString();

        // Si han pasado uno o más días, avanzar al siguiente día de entrenamiento
        if (todayISO > lastAccessISO) {
          newDayIndex = (profile.training_current_day || 0) + 1;
          if (newDayIndex >= numDays) {
            newDayIndex = 0; // Reiniciar ciclo
          }
        } else {
          // Mismo día, mantener el índice actual
          newDayIndex = profile.training_current_day || 0;
        }
      } else {
        // Primera vez, empezar en día 1 (índice 0)
        newDayIndex = 0;
      }

      // Actualizar en Supabase
      await supabase
        .from('profiles')
        .update({
          training_last_access: todayISO,
          training_current_day: newDayIndex,
        })
        .eq('id', user.id);

      // Actualizar estado local
      setTrainingProgram((prev) => ({
        ...prev,
        lastAccessDate: todayISO,
        currentDayIndex: newDayIndex,
      }));
      setSelectedDayIndex(newDayIndex);
    } catch (error) {
      console.error('Error updating training day:', error);
    }
  };

  // Sincronizar día seleccionado con profiles.training_current_day
  // Esto permite que ADN y PLAN muestren el día correcto sin entrar a FOCUS
  const syncSelectedDay = async (dayIndex: number) => {
    setSelectedDayIndex(dayIndex);
    // BUGFIX: Cargar ejercicios del día seleccionado
    loadExercises(dayIndex, true);

    // Solo sincronizar en modo personalizado
    if (!isExternalMode || !user) return;

    try {
      await supabase.from('profiles').update({ training_current_day: dayIndex }).eq('id', user.id);

      console.log('🔄 GYM: Día sincronizado:', dayIndex);
    } catch (error) {
      console.error('Error syncing selected day:', error);
    }
  };

  // Guardar nombre de rutina en la base de datos
  const saveRoutineName = async (dayIndex: number, newName: string) => {
    // Guard: Verificar si puede guardar
    if (!canSave('save_exercise')) return;

    if (!user || !newName.trim()) return;

    try {
      // Obtener nombres actuales
      const { data: profile } = await supabase
        .from('profiles')
        .select('training_routine_names')
        .eq('id', user.id)
        .single();

      const currentNames = profile?.training_routine_names || {};
      const updatedNames = {
        ...currentNames,
        [String(dayIndex)]: newName.trim().toUpperCase(),
      };

      // Guardar en Supabase
      await supabase
        .from('profiles')
        .update({ training_routine_names: updatedNames })
        .eq('id', user.id);

      // Actualizar estado local
      setTrainingProgram((prev) => ({
        ...prev,
        days: prev.days.map((day, idx) =>
          idx === dayIndex ? { ...day, muscleGroups: newName.trim().toUpperCase() } : day
        ),
      }));

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      console.error('Error saving routine name:', error);
    }
  };

  useEffect(() => {
    if (isFocused && user) {
      updateTrainingDay();
    }
  }, [isFocused, user]);

  // ============================================================================
  // SAVE DAY NAME TO SUPABASE
  // ============================================================================
  const saveDayName = async (dayIndex: number, newName: string) => {
    // Guard: Verificar si puede guardar
    if (!canSave('save_exercise')) return;

    if (!user || !newName.trim()) return;

    try {
      // Obtener nombres actuales
      const { data: profile, error: fetchError } = await supabase
        .from('profiles')
        .select('training_routine_names')
        .eq('id', user.id)
        .single();

      if (fetchError) {
        console.error('❌ Error obteniendo nombres actuales:', fetchError);
      }

      const currentNames = profile?.training_routine_names || {};
      const updatedNames = {
        ...currentNames,
        [String(dayIndex)]: newName.trim().toUpperCase(),
      };

      console.warn('💾 GYM: Guardando nombres de rutinas:', updatedNames);

      // Guardar en Supabase
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ training_routine_names: updatedNames })
        .eq('id', user.id);

      if (updateError) {
        console.error('❌ Error guardando nombres:', updateError);
        return;
      }

      console.warn('✅ GYM: Nombres guardados correctamente');

      // Actualizar estado local
      setTrainingProgram((prev) => ({
        ...prev,
        days: prev.days.map((day, idx) =>
          idx === dayIndex ? { ...day, muscleGroups: newName.trim().toUpperCase() } : day
        ),
      }));

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      console.error('Error saving day name:', error);
    }
  };

  // ============================================================================
  // FETCH EXERCISES FROM SUPABASE
  // ============================================================================
  useEffect(() => {
    loadTemplates();
    if (user) {
      loadAllUserExercises(); // Cargar TODOS los ejercicios del usuario al inicio
    }
  }, [user]);

  // Recargar ejercicios cuando cambie el día seleccionado o el usuario
  useEffect(() => {
    // Cargar ejercicios siempre - con o sin usuario
    loadExercises(selectedDayIndex);
  }, [selectedDayIndex, user]);

  // Ref para mantener el índice del ejercicio activo de forma persistente
  // Esto evita que se pierda cuando se recarga la lista
  const savedExerciseIndexRef = useRef(0);

  // Actualizar la ref cada vez que cambia activeExerciseIndex
  useEffect(() => {
    savedExerciseIndexRef.current = activeExerciseIndex;
  }, [activeExerciseIndex]);

  // Recargar ejercicios cuando HANK modifica datos (mantener posición)
  useEffect(() => {
    console.warn('🔄 refreshTrigger cambió a:', refreshTrigger);
    if (user && refreshTrigger > 0) {
      // Usar la ref que mantiene el índice de forma persistente
      const previousIndex = savedExerciseIndexRef.current;
      console.warn(
        '🔄 HANK modificó datos, recargando ejercicios del día:',
        selectedDayIndex,
        'manteniendo índice:',
        previousIndex
      );
      // Refresh SILENCIOSO - sin mostrar loading para evitar flash
      loadExercises(selectedDayIndex, true).then(() => {
        // Después de cargar, hacer scroll al mismo índice (o al último si el índice ya no existe)
        setTimeout(() => {
          // BUGFIX: No intentar scroll si exercises está vacío (evita crash en web)
          if (exerciseListRef.current && previousIndex >= 0 && exercises.length > 0) {
            // Usar Math.min para asegurar que el índice es válido
            const safeIndex = Math.min(previousIndex, Math.max(0, exercises.length - 1));
            exerciseListRef.current.scrollToIndex({
              index: safeIndex,
              animated: false,
            });
            // Actualizar el estado del índice también
            setActiveExerciseIndex(safeIndex);
            console.warn('🔄 Scroll restaurado a índice:', safeIndex);
          }
        }, 150); // Aumentar un poco el timeout para dar tiempo al render
      });
    }
  }, [refreshTrigger]);

  const loadExercises = async (dayIndex: number | null = null, silent: boolean = false) => {
    // Si no hay usuario, mostrar modal de estructura
    if (!user) {
      setExercises([]);
      setViewMode('FOCUS');
      setStructureModalOpen(true);
      setLoading(false);
      return;
    }
    // Solo mostrar loading si no es silencioso (evita flash en refresh de HANK)
    if (!silent) {
      setLoading(true);
    }
    const targetDayIndex = dayIndex !== null ? dayIndex : selectedDayIndex;

    try {
      // NUEVA ARQUITECTURA: Cargar desde exercises + user_exercise_config
      // 1. Cargar configuraciones del usuario
      const { data: userConfigs, error: configError } = await supabase
        .from('user_exercise_config')
        .select(
          `
          id,
          exercise_id,
          training_days,
          display_order,
          config,
          custom_media_url,
          personal_records,
          notes,
          created_at,
          updated_at,
          exercises (
            id,
            name,
            description,
            muscle_group,
            secondary_muscles,
            equipment,
            difficulty,
            default_media_url,
            thumbnail_url,
            video_url,
            sport_id,
            alternatives
          )
        `
        )
        .eq('user_id', user.id)
        .order('display_order', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: true });

      if (configError) throw configError;

      console.log('📥 userConfigs cargados:', userConfigs?.length || 0);
      // Debug: verificar si alternatives viene en el JOIN
      if (userConfigs && userConfigs.length > 0) {
        const firstEx = userConfigs[0] as any;
        const exercises = firstEx.exercises;
        console.log('🔍 Primer ejercicio - alternatives:', exercises?.alternatives?.length || 0);
      }
      console.log('🔍 DEBUG userConfigs:', JSON.stringify(userConfigs?.[0], null, 2));

      // 1.5 Cargar imágenes persistentes de user_exercise_media (sobreviven eliminación)
      const allExerciseIdsForMedia = userConfigs?.map((cfg: any) => cfg.exercise_id) || [];
      let persistentMediaMap: Record<string, string> = {};

      if (allExerciseIdsForMedia.length > 0) {
        const { data: persistentMedia } = await supabase
          .from('user_exercise_media')
          .select('exercise_id, custom_media_url')
          .eq('user_id', user.id)
          .in('exercise_id', allExerciseIdsForMedia);

        if (persistentMedia) {
          persistentMedia.forEach((pm: any) => {
            if (pm.custom_media_url) {
              persistentMediaMap[pm.exercise_id] = pm.custom_media_url;
            }
          });
        }
      }

      // Mapear al formato que espera el código existente
      const data =
        userConfigs?.map((item: any) => {
          // El join puede venir como 'exercises' (objeto) o array dependiendo de la FK
          const exercise = item.exercises;
          // Prioridad: 1) custom_media_url de config, 2) persistentMedia, 3) default
          const mediaUrl =
            item.custom_media_url ||
            persistentMediaMap[item.exercise_id] ||
            exercise?.default_media_url ||
            exercise?.thumbnail_url ||
            '';
          return {
            id: item.id, // user_exercise_config.id
            exercise_id: item.exercise_id, // referencia al ejercicio global
            user_id: user.id,
            type: 'exercise',
            name: exercise?.name || 'UNNAMED',
            media_url: mediaUrl,
            training_days: item.training_days || [0],
            order: item.display_order || 0,
            deleted_at: null,
            created_at: item.created_at,
            updated_at: item.updated_at,
            metadata: {
              sets: item.config?.sets || '4x10',
              rest: item.config?.rest || '90s',
              category: exercise?.muscle_group || 'OTRO',
              difficulty: exercise?.difficulty || 'INTERMEDIO',
              series_by_day: item.config?.series_by_day || {},
              custom_series: item.config?.custom_series || null,
              description: exercise?.description,
              equipment: exercise?.equipment,
              video_url: exercise?.video_url,
              alternatives: exercise?.alternatives || [],
            },
          };
        }) || [];

      // BUGFIX: Filtrar ejercicios con datos inválidos (sin id, sin exercise_id, o sin nombre válido)
      const validData = data.filter((item: any) => {
        if (!item.id || !item.exercise_id) {
          console.warn('⚠️ Ejercicio filtrado por falta de id o exercise_id:', item);
          return false;
        }
        // NOTA: Ya no filtramos por UNNAMED - si el JOIN falla, mostrar igual con nombre fallback
        return true;
      });

      console.log('📊 Ejercicios en DB:', data.length, '→ Válidos:', validData.length);

      // Filtrar los datos ya mapeados por día de entrenamiento
      const filteredData =
        validData?.filter((item: any) => {
          const itemDays = item.training_days || [0];
          return itemDays.includes(targetDayIndex);
        }) || [];

      console.log(
        `📊 Día ${targetDayIndex}: ${filteredData.length} ejercicios de ${validData?.length || 0} total`
      );

      if (filteredData && filteredData.length > 0) {
        // NUEVA ARQUITECTURA: Las alternativas están en exercises.alternatives (array de UUIDs)
        // Recopilar todos los IDs de alternativas de todos los ejercicios filtrados
        const allAlternativeIds: string[] = [];
        filteredData.forEach((item: any) => {
          const altIds = item.metadata?.alternatives || [];
          console.log(
            `📋 Ejercicio "${item.name}": ${altIds.length} IDs de alternativas en metadata`
          );
          altIds.forEach((id: string) => {
            if (id && !allAlternativeIds.includes(id)) {
              allAlternativeIds.push(id);
            }
          });
        });

        console.log('🔍 Alternativas a cargar:', allAlternativeIds.length);

        // Cargar los datos de los ejercicios alternativos desde la tabla exercises
        let alternativeExercisesData: any[] = [];
        // También cargar custom_media_url para alternativas desde user_exercise_config
        let alternativeCustomMedia: Record<string, string> = {};

        if (allAlternativeIds.length > 0) {
          const { data: altData } = await supabase
            .from('exercises')
            .select('id, name, thumbnail_url, default_media_url, muscle_group, difficulty')
            .in('id', allAlternativeIds);

          alternativeExercisesData = altData || [];
          console.log('  ✅ Alternativas cargadas:', alternativeExercisesData.length);

          // Cargar imágenes personalizadas de alternativas (si el usuario las ha cambiado)
          const { data: altConfigs } = await supabase
            .from('user_exercise_config')
            .select('exercise_id, custom_media_url')
            .eq('user_id', user.id)
            .in('exercise_id', allAlternativeIds)
            .not('custom_media_url', 'is', null);

          if (altConfigs) {
            altConfigs.forEach((cfg: any) => {
              if (cfg.custom_media_url) {
                alternativeCustomMedia[cfg.exercise_id] = cfg.custom_media_url;
              }
            });
            console.log(
              '  - Alternativas con imagen personalizada:',
              Object.keys(alternativeCustomMedia).length
            );
          }

          // TAMBIÉN buscar en tabla PERSISTENTE user_exercise_media (sobrevive eliminación)
          const { data: persistentMedia } = await supabase
            .from('user_exercise_media')
            .select('exercise_id, custom_media_url')
            .eq('user_id', user.id)
            .in('exercise_id', allAlternativeIds);

          if (persistentMedia) {
            persistentMedia.forEach((pm: any) => {
              // Solo usar si no hay ya una imagen en user_exercise_config
              if (pm.custom_media_url && !alternativeCustomMedia[pm.exercise_id]) {
                alternativeCustomMedia[pm.exercise_id] = pm.custom_media_url;
              }
            });
          }

          console.log('  - Alternativas cargadas:', alternativeExercisesData.length);
          console.log(
            '  - Detalles:',
            alternativeExercisesData.map((a: any) => ({ id: a.id.substring(0, 8), name: a.name }))
          );
        }

        // Cargar videos de pro_videos para todos los ejercicios del usuario
        // Incluir ejercicios principales Y alternativas
        // IMPORTANTE: usar exercise_id (ID de tabla exercises), NO id (ID de user_exercise_config)
        const allExerciseIds = [
          ...filteredData.map((item: any) => item.exercise_id),
          ...allAlternativeIds,
        ];
        let exerciseVideosMap: Record<string, VideoRecord[]> = {};

        // Crear mapa de nombre -> IDs para sincronizar videos por nombre de ejercicio
        const exerciseNameToIds: Record<string, string[]> = {};

        // Agregar ejercicios principales al mapa nombre -> IDs (usando exercise_id)
        filteredData.forEach((item: any) => {
          const name = item.name?.toLowerCase()?.trim();
          if (name) {
            if (!exerciseNameToIds[name]) exerciseNameToIds[name] = [];
            if (!exerciseNameToIds[name].includes(item.exercise_id)) {
              exerciseNameToIds[name].push(item.exercise_id);
            }
          }
        });

        // Agregar alternativas al mapa nombre -> IDs
        alternativeExercisesData.forEach((alt: any) => {
          const name = alt.name?.toLowerCase()?.trim();
          if (name) {
            if (!exerciseNameToIds[name]) exerciseNameToIds[name] = [];
            if (!exerciseNameToIds[name].includes(alt.id)) {
              exerciseNameToIds[name].push(alt.id);
            }
          }
        });

        console.log(
          '🔗 Ejercicios por nombre:',
          Object.entries(exerciseNameToIds)
            .filter(([, ids]) => ids.length > 1)
            .map(([name, ids]) => `${name}: ${ids.length} IDs`)
        );

        if (allExerciseIds.length > 0) {
          const { data: videosData, error: videosError } = await supabase
            .from('pro_videos')
            .select(
              'id, exercise_id, video_url, thumbnail_url, weight_kg, reps, free_text, is_public, created_at, spotify, cloudflare_video_id, notes, exercise_notes, tags'
            )
            .eq('user_id', user.id)
            .in('exercise_id', allExerciseIds)
            .not('video_url', 'is', null)
            .order('created_at', { ascending: false });

          if (!videosError && videosData) {
            // Agrupar videos por exercise_id
            videosData.forEach((v: any) => {
              if (!exerciseVideosMap[v.exercise_id]) {
                exerciseVideosMap[v.exercise_id] = [];
              }
              exerciseVideosMap[v.exercise_id].push({
                id: v.id,
                exercise_id: v.exercise_id,
                video_url: v.video_url,
                videoUrl: v.video_url,
                thumbnail_url: v.thumbnail_url || v.video_url,
                cloudflare_video_id: v.cloudflare_video_id,
                weight: v.weight_kg || 0,
                reps: v.reps || 0,
                free_text: v.free_text,
                date: new Date(v.created_at).toLocaleDateString('es-ES', {
                  day: '2-digit',
                  month: 'short',
                }),
                is_public: v.is_public,
                spotify: v.spotify,
                notes: v.notes,
                exercise_notes: v.exercise_notes,
                tags: v.tags,
              });
            });

            // SINCRONIZAR videos entre ejercicios con el mismo nombre
            // Si "Flexiones" tiene IDs [A, B] y A tiene videos, B también los tendrá
            Object.entries(exerciseNameToIds).forEach(([, ids]) => {
              if (ids.length > 1) {
                // Combinar todos los videos de todos los IDs con este nombre
                const allVideosForName: VideoRecord[] = [];
                ids.forEach((id) => {
                  if (exerciseVideosMap[id]) {
                    allVideosForName.push(...exerciseVideosMap[id]);
                  }
                });

                // Eliminar duplicados por ID de video
                const uniqueVideos = allVideosForName.filter(
                  (v, i, arr) => arr.findIndex((x) => x.id === v.id) === i
                );

                // Ordenar por fecha (más reciente primero)
                uniqueVideos.sort(
                  (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
                );

                // Asignar los videos combinados a TODOS los IDs con este nombre
                ids.forEach((id) => {
                  exerciseVideosMap[id] = uniqueVideos;
                });
              }
            });

            console.log(
              '🎥 Videos cargados para',
              Object.keys(exerciseVideosMap).length,
              'ejercicios'
            );
          }
        }

        const mappedExercises: Exercise[] = filteredData.map((item, index) => {
          try {
            // Obtener IDs de alternativas de este ejercicio (viene de exercises.alternatives en BD)
            const alternativeIds = item.metadata?.alternatives || [];

            // BUGFIX: Filtrar el ID del ejercicio principal para evitar que sea alternativa de sí mismo
            const filteredAlternativeIds = alternativeIds.filter(
              (altId: string) => altId !== item.exercise_id
            );

            // Cargar estructura personalizada del DÍA ACTUAL
            // Nueva estructura: series_by_day[day] | Fallback: custom_series (legacy)
            const seriesByDay = item.metadata?.series_by_day as
              | Record<string, SeriesConfig[]>
              | undefined;
            const customSeriesData: SeriesConfig[] =
              seriesByDay?.[String(targetDayIndex)] || // Primero buscar en series_by_day para el día actual
              (item.metadata?.custom_series as SeriesConfig[] | undefined) || // Fallback legacy
              [];

            const seriesForState: Series[] =
              customSeriesData.length > 0
                ? customSeriesData.map((s: SeriesConfig) => ({
                    id: s.id,
                    // Normalizar tipos a español (el tipo almacenado puede ser legacy en inglés)
                    type: (s.type === 'CALENTAMIENTO' || (s.type as string) === 'WARMUP'
                      ? 'CALENTAMIENTO'
                      : s.type === 'APROXIMACION' || (s.type as string) === 'APPROACH'
                        ? 'APROXIMACION'
                        : s.type === 'FALLO' || (s.type as string) === 'FAILURE'
                          ? 'FALLO'
                          : 'EFECTIVA') as SeriesType,
                    reps: String(s.reps),
                    note: s.note || undefined,
                    weight: s.weight || 0,
                  }))
                : generateDefaultSeries(item.metadata?.sets || '4x10');

            // Mapear alternativas desde exercises.alternatives (SIMPLIFICADO)
            // Las alternativas ya están en alternativeExercisesData cargadas desde Supabase
            const alternatives: ExerciseAlternative[] = filteredAlternativeIds
              .map((altId: string) => {
                // Buscar en alternativeExercisesData (cargado de tabla exercises)
                const altExercise = alternativeExercisesData.find((a: any) => a.id === altId);

                if (!altExercise) {
                  // DEBUG: Log cuando una alternativa no se encuentra
                  console.warn(
                    `⚠️ Alternativa ${altId.substring(0, 8)} no encontrada para "${item.name}". ` +
                      `alternativeExercisesData tiene ${alternativeExercisesData.length} items.`
                  );
                  return null;
                }

                // Usar imagen personalizada si existe, sino usar la del catálogo
                const customImage = alternativeCustomMedia[altId];
                const imageUrl =
                  customImage || altExercise.default_media_url || altExercise.thumbnail_url || '';

                return {
                  id: altExercise.id,
                  name: altExercise.name,
                  image_url: imageUrl,
                  videos: exerciseVideosMap[altId] || [],
                  series: seriesForState,
                };
              })
              .filter(Boolean) as ExerciseAlternative[];

            // DEBUG: Log del resultado final de alternativas
            if (filteredAlternativeIds.length !== alternatives.length) {
              console.warn(
                `⚠️ "${item.name}": ${filteredAlternativeIds.length} IDs de alternativas → ${alternatives.length} alternativas mapeadas`
              );
            }

            return {
              id: item.id,
              exercise_id: item.exercise_id, // ID del ejercicio real para pro_videos
              name: item.name || 'UNNAMED',
              sets: item.metadata?.sets || '0x0',
              image_url: item.media_url || '',
              order: item.order || 0,
              series: seriesForState,
              training_days: item.training_days || [0],
              videos: exerciseVideosMap[item.exercise_id] || [],
              alternatives,
            };
          } catch (mapError) {
            console.error('💥 ERROR mapeando ejercicio:', item.name, mapError);
            // Retornar un ejercicio válido mínimo para no romper el array
            // BUGFIX: Usar fallbacks seguros para evitar keys vacíos/duplicados
            return {
              id: item.id || `error-${index}-${Date.now()}`,
              exercise_id: item.exercise_id || item.id || `temp-${index}-${Date.now()}`,
              name: item.name || 'ERROR',
              sets: '0x0',
              image_url: '',
              order: index,
              series: [],
              training_days: [0],
              videos: [],
              alternatives: [],
            };
          }
        });
        console.log(
          '✅ SETEANDO EJERCICIOS:',
          mappedExercises.length,
          'ejercicios para día',
          targetDayIndex
        );
        console.log(
          '   Nombres:',
          mappedExercises.map((e) => e.name)
        );
        // DEBUG: Mostrar alternativas de cada ejercicio
        console.log('📋 ALTERNATIVAS POR EJERCICIO:');
        mappedExercises.forEach((e, i) => {
          console.log(
            `   [${i}] ${e.name}: ${e.alternatives?.length || 0} alternativas`,
            e.alternatives?.map((a) => a.name) || []
          );
        });

        setExercises(mappedExercises);

        // BUGFIX: Limpiar activeAlternatives para empezar siempre en el ejercicio principal
        // Esto evita problemas de índices desincronizados después de reordenar
        console.log('🧹 loadExercises: Limpiando activeAlternatives para estado limpio');
        setActiveAlternatives({});
        activeAlternativesRef.current = {};

        // Solo cambiar a FOCUS si no estamos ya en algún modo
        if (viewMode === 'LOADING') {
          console.log('🔀 Cambiando viewMode a FOCUS');
          setViewMode('FOCUS');
        }
      } else {
        // No hay ejercicios para este día - limpiar estado
        setExercises([]);

        if (viewMode === 'LOADING') {
          setViewMode('FOCUS');
          // No abrir modal automáticamente - mostrar pantalla vacía para que el usuario decida
        }
      }
    } catch {
      if (viewMode === 'LOADING') {
        setViewMode('FOCUS');
        // No abrir modal automáticamente en caso de error
      }
    } finally {
      setLoading(false);
    }
  };

  const loadTemplates = async () => {
    try {
      // NUEVA ARQUITECTURA: Cargar desde exercises (catálogo global)
      const { data, error } = await supabase
        .from('exercises')
        .select('*')
        .eq('is_active', true)
        .order('muscle_group', { ascending: true })
        .order('name', { ascending: true });

      if (error) throw error;

      if (data) {
        // Mapear al formato AssetTemplate para compatibilidad
        const mappedTemplates: AssetTemplate[] = data.map((ex: any) => ({
          id: ex.id,
          name: ex.name,
          description: ex.description || '',
          image_url: ex.default_media_url || ex.thumbnail_url || '',
          category: ex.muscle_group || 'OTRO',
          difficulty: ex.difficulty || 'INTERMEDIO',
          default_metadata: {
            sets: '4x10',
            rest: '90s',
            equipment: ex.equipment,
            secondary_muscles: ex.secondary_muscles,
            video_url: ex.video_url,
            sport_id: ex.sport_id,
          },
        }));
        setTemplates(mappedTemplates);

        // Extraer categorías únicas para los tabs
        const uniqueCategories = [...new Set(mappedTemplates.map((t) => t.category))].filter(
          Boolean
        );
        setCategories(uniqueCategories);
      }
    } catch (error) {
      console.error('💥 Error loading templates:', error);
    }
  };

  const loadAllUserExercises = async () => {
    if (!user) return;

    try {
      // NUEVA ARQUITECTURA: Cargar desde user_exercise_config + exercises
      const { data, error } = await supabase
        .from('user_exercise_config')
        .select(
          `
          id,
          custom_media_url,
          exercises:exercise_id (
            name,
            default_media_url
          )
        `
        )
        .eq('user_id', user.id);

      if (error) throw error;

      if (data) {
        setAllUserExercises(
          data.map((config: any) => ({
            name: config.exercises?.name || 'UNNAMED',
            image_url: config.custom_media_url || config.exercises?.default_media_url || '',
          }))
        );
      }
    } catch (error) {
      console.error('💥 Error loading all user exercises:', error);
    }
  };

  // ============================================================================
  // HELPER: Generate Default Series
  // ============================================================================
  const generateDefaultSeries = (setsString: string): Series[] => {
    // Parse "4x10" -> 4 series efectivas de 10 reps
    const [count] = setsString.split('x');
    const numSets = parseInt(count) || 4;

    const series: Series[] = [
      { id: '1', type: 'CALENTAMIENTO', reps: '12', note: 'Calentamiento' },
      { id: '2', type: 'APROXIMACION', reps: '10', note: 'Aproximación' },
    ];

    for (let i = 0; i < numSets; i++) {
      series.push({
        id: `${i + 3}`,
        type: 'EFECTIVA',
        reps: '10',
        note: 'Al fallo',
      });
    }

    return series;
  };

  // ============================================================================
  // HELPER: Get Current Time
  // ============================================================================
  const getCurrentTime = (): string => {
    const now = new Date();
    return now.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  };

  // ============================================================================
  // TIMER FUNCTIONS
  // ============================================================================
  const startTimer = (minutes: number) => {
    setTimeRemaining(minutes * 60);
    setTimerActive(true);
    setTimerExpanded(false);

    const interval = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          setTimerActive(false);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // ============================================================================
  // CAMERA FUNCTIONS
  // ============================================================================
  const openCamera = async () => {
    // En web/PWA usar el WebCameraModal con preview en tiempo real
    if (Platform.OS === 'web') {
      setWebCameraModalVisible(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      return;
    }

    // En nativo, usar expo-camera con modal de preview
    if (!permission || !permission.granted) {
      const result = await requestPermission();
      if (!result.granted) {
        alert('Se requiere permiso de cámara para esta función');
        return;
      }
    }

    setCameraModalVisible(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  // Handler para cuando se captura algo en WebCameraModal
  const handleWebCameraCapture = (result: WebCameraResult) => {
    setWebCameraModalVisible(false);
    if (result.success && result.uri) {
      setMediaType(result.type === 'video' ? 'video' : 'photo');
      setImageToEdit(result.uri);
      setEditorVisible(true);
    }
  };

  const pickFromGallery = async () => {
    try {
      setIsPickingFromGallery(true); // Pausar videos mientras se elige de galería

      // En web/PWA usar el selector de archivos universal
      if (Platform.OS === 'web') {
        const result = await openWebGallery({ quality: 0.5 });
        if (result.success && result.uri) {
          // Usar el tipo detectado por webCamera
          const isVideo = result.type === 'video';
          setMediaType(isVideo ? 'video' : 'photo');
          setImageToEdit(result.uri);
          // Guardar el File original para upload confiable (usando ref para acceso inmediato)
          galleryFileRef.current = result.file || null;
          console.log(
            '📁 Gallery file saved to ref:',
            result.file?.name,
            result.file?.size,
            result.file?.type
          );
          setEditorVisible(true);
        } else if (result.error && result.error !== 'Cancelado por el usuario') {
          alert(result.error);
        }
        setIsPickingFromGallery(false);
        return;
      }

      // En nativo, usar expo-image-picker
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        alert('Se requiere permiso para acceder a la galería');
        setIsPickingFromGallery(false);
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images', 'videos'],
        allowsEditing: false,
        quality: 0.5, // Reducido para optimizar tamaño de videos
        videoMaxDuration: 10, // Máximo 10 segundos
        videoQuality: 1, // Calidad media (0=baja, 1=media, 2=alta) - iOS only
      });

      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        setMediaType(asset.type === 'video' ? 'video' : 'photo');
        setImageToEdit(asset.uri);
        setEditorVisible(true);
      }

      setIsPickingFromGallery(false); // Reanudar videos
    } catch (error) {
      console.error('💥 Error picking from gallery:', error);
      alert('Error al seleccionar archivo');
      setIsPickingFromGallery(false);
    }
  };

  const handleEditorSave = async () => {
    if (!imageToEdit) return;

    try {
      setCaptureProcessing(true);
      setUploadingMessage(mediaType === 'video' ? '📹 SUBIENDO VIDEO...' : '📷 SUBIENDO FOTO...');
      setEditorVisible(false);

      // En web con blob URLs o data URLs, usar uploadFromBlob directamente
      const isWebUpload =
        Platform.OS === 'web' &&
        (imageToEdit.startsWith('blob:') || imageToEdit.startsWith('data:'));
      if (isWebUpload) {
        console.log(
          '🌐 Web upload detected, using blob upload. URI type:',
          imageToEdit.substring(0, 30)
        );

        if (!user) {
          throw new Error('Usuario no autenticado');
        }

        // Obtener el ejercicio actual
        const exerciseIdToUpdate = currentVariationId || exercises[currentExerciseIndex]?.id;
        if (!exerciseIdToUpdate) {
          throw new Error('No hay ejercicio seleccionado');
        }

        console.log('🎯 Exercise ID to update:', exerciseIdToUpdate);

        // Obtener el blob - usar galleryFileRef si está disponible (más confiable)
        let blob: Blob;

        if (galleryFileRef.current) {
          // Usar el archivo original guardado de la galería
          console.log(
            '📁 Using saved gallery file from ref:',
            galleryFileRef.current.name,
            galleryFileRef.current.size,
            galleryFileRef.current.type
          );
          blob = galleryFileRef.current;
        } else {
          // Fallback: Obtener el blob desde el URI (blob: o data:)
          console.log('🔗 Getting blob from URI:', imageToEdit.substring(0, 100));
          try {
            if (imageToEdit.startsWith('data:')) {
              // Convertir data URL a Blob
              console.log('📄 Converting data URL to blob...');
              const response = await fetch(imageToEdit);
              blob = await response.blob();
              console.log('📦 Converted data URL to blob, size:', blob.size);
            } else {
              // Fetch blob URL directamente
              console.log('🔗 Fetching blob URL...');
              const response = await fetch(imageToEdit);
              console.log('🔗 Fetch response:', response.status, response.statusText);
              if (!response.ok) {
                throw new Error(`Failed to fetch blob: ${response.status} ${response.statusText}`);
              }
              blob = await response.blob();
              console.log('📦 Got blob from URL, size:', blob.size, 'type:', blob.type);
            }
          } catch (fetchError) {
            console.error('❌ Error getting blob:', fetchError);
            throw new Error(`Error obteniendo imagen: ${fetchError}`);
          }
        }

        console.log('📦 Original Blob - size:', blob.size, 'type:', blob.type);

        if (blob.size === 0) {
          throw new Error('El archivo está vacío (blob size = 0)');
        }

        // Determinar tipo y extensión
        const isVideo = mediaType === 'video' || blob.type.startsWith('video');

        // COMPRIMIR antes de subir
        setUploadingMessage(isVideo ? '🗜️ COMPRIMIENDO VIDEO...' : '🗜️ COMPRIMIENDO FOTO...');

        let compressedBlob: Blob;
        try {
          if (isVideo) {
            // Comprimir video a 720p max, 10 segundos max
            console.log('🎬 Starting video compression...');
            compressedBlob = await compressVideo(blob, 720, 10);
          } else {
            // Comprimir imagen a 1080px max, calidad 0.7
            console.log('📸 Starting image compression...');
            compressedBlob = await compressImage(blob, 1080, 0.7);
          }
          console.log(
            `✅ Compression complete: ${Math.round(blob.size / 1024)}KB → ${Math.round(compressedBlob.size / 1024)}KB`
          );
        } catch (compressError) {
          console.warn('⚠️ Compression failed, using original:', compressError);
          compressedBlob = blob; // Fallback al original si falla la compresión
        }

        setUploadingMessage(isVideo ? '📹 SUBIENDO VIDEO...' : '📷 SUBIENDO FOTO...');

        const extension = isVideo ? 'mp4' : 'jpg';
        const contentType = isVideo ? 'video/mp4' : 'image/jpeg';
        const timestamp = Date.now();
        const key = `exercises/${user.id}/${exerciseIdToUpdate}/${timestamp}.${extension}`;

        // Subir usando el método blob (vía Worker)
        console.log('☁️ Uploading to R2 via Worker...', {
          key,
          contentType,
          blobSize: compressedBlob.size,
        });
        const result = await cloudflareR2.uploadFromBlob(compressedBlob, key, contentType);
        console.log('☁️ Upload result:', JSON.stringify(result));

        if (!result.success || !result.url) {
          console.error('❌ Upload failed:', result);
          throw new Error(result.error || 'Error subiendo archivo');
        }

        console.log('✅ Blob upload success:', result.url);

        // Actualizar en la base de datos
        await updateExerciseMediaInDB(exerciseIdToUpdate, result.url, isVideo ? 'video' : 'image');

        setImageToEdit(null);
        galleryFileRef.current = null; // Limpiar archivo de galería
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        return;
      }

      // Flujo nativo (no web)
      if (mediaType === 'video') {
        // Para videos, subir directamente sin procesamiento
        await uploadExerciseMedia(imageToEdit, 'video');
      } else {
        // Para fotos, procesar y recortar cuadrado
        // Primero obtener info de la imagen para calcular crop correcto
        const imageInfo = await manipulateAsync(imageToEdit, []);
        const { width: origWidth, height: origHeight } = imageInfo;

        // Calcular el tamaño del lado más pequeño para crop cuadrado
        const cropSize = Math.min(origWidth, origHeight);
        const originX = (origWidth - cropSize) / 2;
        const originY = (origHeight - cropSize) / 2;

        // Recortar cuadrado desde el centro y luego resize a 1080x1080
        const manipulatedImage = await manipulateAsync(
          imageToEdit,
          [
            {
              crop: {
                originX,
                originY,
                width: cropSize,
                height: cropSize,
              },
            },
            { resize: { width: 1080, height: 1080 } },
          ],
          { compress: 0.7, format: SaveFormat.JPEG }
        );

        await uploadExerciseMedia(manipulatedImage.uri, 'photo');
      }

      setImageToEdit(null);
      galleryFileRef.current = null; // Limpiar archivo de galería
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      console.error('💥 Error saving edited image:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('💥 Error details:', errorMessage);
      alert(`Error al guardar: ${errorMessage}`);
    } finally {
      setCaptureProcessing(false);
      setUploadingMessage(null);
    }
  };

  // Helper para actualizar la DB después de subir media en web
  const updateExerciseMediaInDB = async (
    exerciseId: string,
    mediaUrl: string,
    mediaType: 'image' | 'video'
  ) => {
    if (!user) {
      console.error('❌ updateExerciseMediaInDB: No user');
      return;
    }

    console.log('💾 updateExerciseMediaInDB:', { exerciseId, mediaUrl, mediaType });

    // Buscar el ejercicio por ID directo o por exercise_id (catálogo global)
    let currentExercise = exercises.find(
      (ex) => ex.id === exerciseId || ex.exercise_id === exerciseId
    );
    let isAlternative = false;

    if (!currentExercise) {
      for (const ex of exercises) {
        // Para alternativas, el id ya es el exercise_id global
        const found = ex.alternatives?.find((alt) => alt.id === exerciseId);
        if (found) {
          currentExercise = found as any;
          isAlternative = true;
          break;
        }
      }
    }

    if (!currentExercise) {
      console.error('❌ updateExerciseMediaInDB: Exercise not found for ID:', exerciseId);
      console.log(
        '💾 Available exercise IDs:',
        exercises.map((ex) => ({ id: ex.id, exercise_id: ex.exercise_id, name: ex.name }))
      );
      return;
    }

    console.log('💾 Exercise found:', { name: currentExercise.name, isAlternative });

    const globalExerciseId = isAlternative ? exerciseId : currentExercise.exercise_id || exerciseId;

    // Guardar en tabla persistente
    const { error: persistError } = await supabase.from('user_exercise_media').upsert(
      {
        user_id: user.id,
        exercise_id: globalExerciseId,
        custom_media_url: mediaUrl,
        media_type: mediaType,
      },
      { onConflict: 'user_id,exercise_id' }
    );

    if (persistError) {
      console.error('❌ Error saving to user_exercise_media:', persistError);
    } else {
      console.log('✅ Saved to user_exercise_media');
    }

    // Actualizar en user_exercise_config
    if (isAlternative) {
      const { data: existingConfig, error: checkError } = await supabase
        .from('user_exercise_config')
        .select('id')
        .eq('user_id', user.id)
        .eq('exercise_id', exerciseId)
        .single();

      if (checkError && checkError.code !== 'PGRST116') {
        console.error('❌ Error checking existing config:', checkError);
      }

      if (existingConfig) {
        const { error: updateError } = await supabase
          .from('user_exercise_config')
          .update({ custom_media_url: mediaUrl })
          .eq('id', existingConfig.id);
        if (updateError) {
          console.error('❌ Error updating config:', updateError);
        } else {
          console.log('✅ Updated existing config');
        }
      } else {
        const { error: insertError } = await supabase.from('user_exercise_config').insert({
          user_id: user.id,
          exercise_id: exerciseId,
          custom_media_url: mediaUrl,
        });
        if (insertError) {
          console.error('❌ Error inserting config:', insertError);
        } else {
          console.log('✅ Inserted new config');
        }
      }
    } else {
      const { error: updateError } = await supabase
        .from('user_exercise_config')
        .update({ custom_media_url: mediaUrl })
        .eq('id', exerciseId);
      if (updateError) {
        console.error('❌ Error updating main exercise config:', updateError);
      } else {
        console.log('✅ Updated main exercise config');
      }
    }

    // Actualizar estado local
    setExercises((prev) =>
      prev.map((ex) => {
        if (ex.id === exerciseId) {
          return { ...ex, image_url: mediaUrl };
        }
        if (ex.alternatives) {
          return {
            ...ex,
            alternatives: ex.alternatives.map((alt) =>
              alt.id === exerciseId ? { ...alt, image_url: mediaUrl } : alt
            ),
          };
        }
        return ex;
      })
    );

    console.log('✅ Database updated with new media URL');
  };

  const capturePhoto = async () => {
    if (!cameraRef.current || captureProcessing) return;

    try {
      setCaptureProcessing(true);
      setUploadingMessage('📷 CAPTURANDO...');
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.8,
        base64: false,
      });

      setUploadingMessage('📷 SUBIENDO FOTO...');

      // Comprimir a 720p y hacer cuadrada la imagen (1:1)
      const manipulatedImage = await manipulateAsync(
        photo.uri,
        [
          { resize: { width: 720 } },
          {
            crop: {
              originX: 0,
              originY: 0,
              width: 720,
              height: 720,
            },
          },
        ],
        { compress: 0.7, format: SaveFormat.JPEG }
      );

      await uploadExerciseMedia(manipulatedImage.uri, 'photo');
    } catch (error) {
      console.error('💥 Error capturing photo:', error);
      alert('Error al capturar foto');
    } finally {
      setCaptureProcessing(false);
      setUploadingMessage(null);
    }
  };

  // ============================================================================
  // VIDEO RECORDING FUNCTIONS
  // ============================================================================
  const startVideoRecording = async () => {
    if (!cameraRef.current || isRecording) return;

    try {
      setIsRecording(true);
      setRecordingTime(0);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

      // 🎵 Capturar metadata de Spotify ANTES de grabar
      // Guarda trackUri + positionMs para sincronizar al reproducir
      // Spotify SIGUE sonando - el usuario escucha con audífonos mientras graba
      if (spotifyPremium) {
        const metadata = await spotify.captureMetadataForRecording();
        setCapturedSpotifyMetadata(metadata);
        if (metadata?.enabled) {
          console.log(
            '🎵 Spotify metadata capturado:',
            metadata.trackName,
            'en',
            metadata.positionMs,
            'ms'
          );
        }
      } else {
        setCapturedSpotifyMetadata(null);
      }

      // Timer para mostrar tiempo de grabación (máximo 10 segundos)
      recordingTimerRef.current = setInterval(() => {
        setRecordingTime((prev) => {
          if (prev >= 10) {
            // Auto-stop at 10 seconds
            stopVideoRecording();
            return 10;
          }
          return prev + 1;
        });
      }, 1000);

      const video = await cameraRef.current.recordAsync({
        maxDuration: 10, // Máximo 10 segundos
        quality: '480p', // Compresión a 480p para reducir tamaño (~1-2MB)
      });

      if (video?.uri) {
        setCapturedVideoUri(video.uri);
      }
    } catch (error) {
      console.error('💥 Error recording video:', error);
      setIsRecording(false);
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
      }
    }
  };

  const stopVideoRecording = async () => {
    if (!cameraRef.current || !isRecording) return;

    try {
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }

      cameraRef.current.stopRecording();
      setIsRecording(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      console.error('💥 Error stopping recording:', error);
      setIsRecording(false);
    }
  };

  const saveVideo = async () => {
    // Guard: Verificar si puede guardar
    if (!canSave('save_exercise_video')) return;

    if (!capturedVideoUri) return;

    try {
      setCaptureProcessing(true);
      setUploadingMessage('📹 SUBIENDO VIDEO...');
      await uploadExerciseMedia(capturedVideoUri, 'video');
      setCapturedVideoUri(null);
      setCameraModalVisible(false);
    } catch (error) {
      console.error('💥 Error saving video:', error);
      alert('Error al guardar video');
    } finally {
      setCaptureProcessing(false);
      setUploadingMessage(null);
    }
  };

  const discardVideo = () => {
    setCapturedVideoUri(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const uploadExerciseMedia = async (uri: string, type: 'photo' | 'video') => {
    if (!user) return;

    try {
      // Usar el ID de la variación actual (puede ser principal o alternativa)
      const exerciseIdToUpdate = currentVariationId || exercises[currentExerciseIndex]?.id;
      if (!exerciseIdToUpdate) return;

      // Buscar el ejercicio (puede estar en exercises o en alternatives)
      let currentExercise = exercises.find((ex) => ex.id === exerciseIdToUpdate);
      let isAlternative = false;
      let parentExerciseId: string | null = null;

      if (!currentExercise) {
        // Buscar en alternativas
        for (const ex of exercises) {
          const found = ex.alternatives?.find((alt) => alt.id === exerciseIdToUpdate);
          if (found) {
            currentExercise = found as any;
            isAlternative = true;
            parentExerciseId = ex.id; // El ID del ejercicio padre en user_exercise_config
            break;
          }
        }
      }

      if (!currentExercise) return;

      // Eliminar el archivo anterior de R2 si existe
      if (currentExercise.image_url && currentExercise.image_url.includes('media.trens.app')) {
        const oldKey = cloudflareR2.getKeyFromUrl(currentExercise.image_url);
        if (oldKey) {
          try {
            await cloudflareR2.deleteFile(oldKey);
            console.log('🗑️ Archivo anterior eliminado de R2');
          } catch (deleteError) {
            console.warn('No se pudo eliminar archivo anterior de R2:', deleteError);
          }
        }
      }

      // Subir a Cloudflare R2
      const result = await cloudflareR2.uploadExerciseMedia(uri, user.id, exerciseIdToUpdate, type);

      if (!result.success || !result.url) {
        throw new Error(result.error || 'Error subiendo a R2');
      }

      console.log('📹 Media uploaded to R2:', { type, url: result.url, isAlternative });

      // Obtener el exercise_id global (no el config id) para la tabla persistente
      const globalExerciseId = isAlternative
        ? exerciseIdToUpdate // Ya es el ID global del ejercicio alternativa
        : currentExercise.exercise_id || exerciseIdToUpdate; // Usar exercise_id global

      // GUARDAR EN TABLA PERSISTENTE (user_exercise_media) - Sobrevive eliminación
      const mediaType = type === 'video' ? 'video' : 'image';
      const { error: persistError } = await supabase.from('user_exercise_media').upsert(
        {
          user_id: user.id,
          exercise_id: globalExerciseId,
          custom_media_url: result.url,
          media_type: mediaType,
        },
        { onConflict: 'user_id,exercise_id' }
      );

      if (persistError) {
        console.warn('⚠️ Error guardando en user_exercise_media:', persistError);
      } else {
        console.log('✅ Media guardado en tabla persistente user_exercise_media');
      }

      // Actualizar en la base de datos
      if (isAlternative) {
        // ALTERNATIVA: Crear o actualizar registro en user_exercise_config para la alternativa
        console.log('💾 Guardando imagen de ALTERNATIVA:', {
          exerciseIdToUpdate,
          parentExerciseId,
        });

        // Intentar actualizar primero (si ya existe un registro para esta alternativa)
        const { data: existingConfig } = await supabase
          .from('user_exercise_config')
          .select('id, custom_media_url')
          .eq('user_id', user.id)
          .eq('exercise_id', exerciseIdToUpdate)
          .single();

        if (existingConfig) {
          // Eliminar archivo anterior de R2 si existe
          if (
            existingConfig.custom_media_url &&
            existingConfig.custom_media_url.includes('media.trens.app')
          ) {
            const oldKey = cloudflareR2.getKeyFromUrl(existingConfig.custom_media_url);
            if (oldKey) {
              try {
                await cloudflareR2.deleteFile(oldKey);
                console.log('🗑️ Archivo anterior de alternativa eliminado de R2');
              } catch (deleteError) {
                console.warn('No se pudo eliminar archivo anterior de R2:', deleteError);
              }
            }
          }

          // Actualizar registro existente
          const { error: updateError } = await supabase
            .from('user_exercise_config')
            .update({ custom_media_url: result.url })
            .eq('id', existingConfig.id);

          if (updateError) throw updateError;
          console.log('✅ Alternativa actualizada en DB');
        } else {
          // Crear nuevo registro para la alternativa
          const { error: insertError } = await supabase.from('user_exercise_config').insert({
            user_id: user.id,
            exercise_id: exerciseIdToUpdate, // ID del ejercicio global (alternativa)
            custom_media_url: result.url,
            training_days: [], // No tiene días asignados, solo almacena la imagen
            display_order: 9999, // Lo ponemos al final para que no aparezca en la lista principal
            config: {},
          });

          if (insertError) throw insertError;
          console.log('✅ Alternativa insertada en DB');
        }
      } else {
        // EJERCICIO PRINCIPAL: Actualizar normalmente
        console.log('💾 Actualizando DB ejercicio principal:', {
          exerciseIdToUpdate,
          newUrl: result.url,
        });
        const { error: updateError, data: updateData } = await supabase
          .from('user_exercise_config')
          .update({ custom_media_url: result.url })
          .eq('id', exerciseIdToUpdate)
          .select();

        console.log('✅ DB actualizada:', { error: updateError, data: updateData });
        if (updateError) throw updateError;
      }

      // Actualizar estado local - puede ser ejercicio principal o alternativa
      const updatedExercises = exercises.map((ex) => {
        if (ex.id === exerciseIdToUpdate) {
          return { ...ex, image_url: result.url || ex.image_url };
        }
        // Si es alternativa, actualizar dentro del array de alternatives
        if (ex.alternatives && ex.alternatives.length > 0) {
          return {
            ...ex,
            alternatives: ex.alternatives.map((alt) =>
              alt.id === exerciseIdToUpdate
                ? { ...alt, image_url: result.url || alt.image_url }
                : alt
            ),
          };
        }
        return ex;
      });
      setExercises(updatedExercises);

      // Actualizar también en allUserExercises para que el catálogo muestre la imagen nueva
      const exerciseName =
        exercises.find((ex) => ex.id === exerciseIdToUpdate)?.name ||
        exercises
          .flatMap((ex) => ex.alternatives || [])
          .find((alt) => alt.id === exerciseIdToUpdate)?.name;

      if (exerciseName && result.url) {
        setAllUserExercises((prev) => {
          const exists = prev.find((ex) => ex.name === exerciseName);
          if (exists) {
            return prev.map((ex) =>
              ex.name === exerciseName ? { ...ex, image_url: result.url! } : ex
            );
          } else {
            return [...prev, { name: exerciseName, image_url: result.url! }];
          }
        });
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setCameraModalVisible(false);
    } catch (error) {
      console.error('💥 Error uploading media:', error);
      alert('Error al guardar el archivo');
    }
  };

  // ============================================================================
  // SERIES CONFIG FUNCTIONS
  // ============================================================================
  const openSeriesConfigModal = (template: AssetTemplate) => {
    setSelectedTemplate(template);
    setSeriesConfig([]);
    setModalVisible(false);
    setSeriesConfigFromCatalog(true); // Viene del catálogo
    seriesConfigFromCatalogRef.current = true; // Actualizar ref también
    // BUGFIX: Capturar el día actual al abrir el modal
    setSeriesConfigDayIndex(selectedDayIndex);
    setSeriesConfigModalVisible(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  // ============================================================================
  // QUICK ADD - Agregar ejercicio con estructura automática según nivel
  // ============================================================================
  const quickAddExercise = async (template: AssetTemplate) => {
    if (!user) return;

    // Generar estructura según nivel del usuario
    const autoStructures: Record<UserLevel, SeriesConfig[]> = {
      BEGINNER: [
        { id: '1', reps: 12, type: 'CALENTAMIENTO', note: 'Calentamiento', weight: 0 },
        { id: '2', reps: 10, type: 'EFECTIVA', note: '', weight: 0 },
        { id: '3', reps: 10, type: 'EFECTIVA', note: '', weight: 0 },
        { id: '4', reps: 10, type: 'EFECTIVA', note: '', weight: 0 },
      ],
      INTERMEDIATE: [
        { id: '1', reps: 12, type: 'CALENTAMIENTO', note: 'Calentamiento', weight: 0 },
        { id: '2', reps: 10, type: 'APROXIMACION', note: 'Aproximación', weight: 0 },
        { id: '3', reps: 8, type: 'EFECTIVA', note: '', weight: 0 },
        { id: '4', reps: 8, type: 'EFECTIVA', note: '', weight: 0 },
        { id: '5', reps: 8, type: 'EFECTIVA', note: '', weight: 0 },
      ],
      ADVANCED: [
        { id: '1', reps: 12, type: 'CALENTAMIENTO', note: 'Calentamiento', weight: 0 },
        { id: '2', reps: 8, type: 'APROXIMACION', note: 'Aproximación 1', weight: 0 },
        { id: '3', reps: 6, type: 'APROXIMACION', note: 'Aproximación 2', weight: 0 },
        { id: '4', reps: 6, type: 'EFECTIVA', note: '', weight: 0 },
        { id: '5', reps: 6, type: 'EFECTIVA', note: '', weight: 0 },
        { id: '6', reps: 6, type: 'EFECTIVA', note: '', weight: 0 },
        { id: '7', reps: 12, type: 'FALLO', note: 'Al fallo', weight: 0 },
      ],
      PRO: [
        { id: '1', reps: 15, type: 'CALENTAMIENTO', note: 'Calentamiento', weight: 0 },
        { id: '2', reps: 10, type: 'APROXIMACION', note: 'Aproximación 1', weight: 0 },
        { id: '3', reps: 8, type: 'APROXIMACION', note: 'Aproximación 2', weight: 0 },
        { id: '4', reps: 5, type: 'EFECTIVA', note: '', weight: 0 },
        { id: '5', reps: 5, type: 'EFECTIVA', note: '', weight: 0 },
        { id: '6', reps: 5, type: 'EFECTIVA', note: '', weight: 0 },
        { id: '7', reps: 15, type: 'FALLO', note: 'Al fallo', weight: 0 },
      ],
    };

    const autoSeries = autoStructures[userLevel];

    // Agregar en silencio sin cerrar el modal
    await addExerciseFromTemplateSilent(template, autoSeries);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  // Versión silenciosa que no cierra el modal
  const addExerciseFromTemplateSilent = async (
    template: AssetTemplate,
    customSeries?: SeriesConfig[]
  ) => {
    if (!user) return;

    // BUGFIX: Capturar el día actual al inicio de la operación para evitar race conditions
    const targetDay = selectedDayIndex;

    setAdding(true);
    try {
      // Verificar si ya existe configuración para este ejercicio
      const { data: existingConfig, error: searchError } = await supabase
        .from('user_exercise_config')
        .select('*')
        .eq('user_id', user.id)
        .eq('exercise_id', template.id)
        .maybeSingle();

      if (searchError) {
        console.error('Error buscando configuración existente:', searchError);
      }

      let data;
      let error;

      if (existingConfig) {
        // El ejercicio YA EXISTE - agregar este día a su array training_days
        const currentDays = existingConfig.training_days || [0];

        if (currentDays.includes(targetDay)) {
          // Ya está agregado, no hacer nada
          setAdding(false);
          return;
        }

        // Agregar el nuevo día al array
        const updatedDays = [...currentDays, targetDay].sort();
        const currentConfig = existingConfig.config || {};
        const seriesByDay = (currentConfig.series_by_day as Record<string, any[]>) || {};

        if (customSeries && customSeries.length > 0) {
          seriesByDay[String(targetDay)] = customSeries;
        } else {
          const firstDaySeries = seriesByDay[String(currentDays[0])] || [];
          if (firstDaySeries.length > 0) {
            seriesByDay[String(targetDay)] = [...firstDaySeries];
          }
        }

        const result = await supabase
          .from('user_exercise_config')
          .update({
            training_days: updatedDays,
            updated_at: new Date().toISOString(),
            config: { ...currentConfig, series_by_day: seriesByDay },
          })
          .eq('id', existingConfig.id)
          .select()
          .single();

        data = result.data;
        error = result.error;
      } else {
        // Crear NUEVA configuración
        const seriesByDay: Record<string, any[]> = {};
        if (customSeries) {
          seriesByDay[String(targetDay)] = customSeries;
        }

        const result = await supabase
          .from('user_exercise_config')
          .insert({
            user_id: user.id,
            exercise_id: template.id,
            training_days: [targetDay],
            display_order: exercises.length,
            config: {
              sets: customSeries
                ? `${customSeries.length}x${customSeries[0]?.reps || 10}`
                : template.default_metadata.sets,
              rest: template.default_metadata.rest,
              series_by_day: customSeries ? seriesByDay : {},
              custom_series: customSeries || null,
            },
          })
          .select()
          .single();

        data = result.data;
        error = result.error;
      }

      if (error) throw error;

      if (data) {
        // Convertir SeriesConfig a Series para el estado local
        const seriesForState: Series[] = customSeries
          ? customSeries.map((s) => ({
              id: s.id,
              type: (s.type === 'CALENTAMIENTO' || (s.type as string) === 'WARMUP'
                ? 'CALENTAMIENTO'
                : s.type === 'APROXIMACION' || (s.type as string) === 'APPROACH'
                  ? 'APROXIMACION'
                  : s.type === 'FALLO' || (s.type as string) === 'FAILURE'
                    ? 'FALLO'
                    : 'EFECTIVA') as SeriesType,
              reps: String(s.reps),
              note: s.note || undefined,
            }))
          : generateDefaultSeries(data.config?.sets || template.default_metadata.sets);

        const newExercise: Exercise = {
          id: data.id,
          exercise_id: template.id, // ID del ejercicio en tabla exercises
          name: template.name,
          sets: data.config?.sets || template.default_metadata.sets,
          image_url: template.image_url,
          order: data.display_order || 0,
          series: seriesForState,
          training_days: data.training_days || [targetDay],
          videos: [],
          alternatives: [],
        };

        // Actualizar estado local inmediatamente (sin cerrar modal)
        setExercises((prev) => [...prev, newExercise]);

        // BUGFIX: Cargar ejercicios inmediatamente para obtener alternativas
        // No usar setTimeout ya que puede causar race conditions al cerrar el modal
        await loadExercises(targetDay, true);
      }
    } catch (error) {
      console.error('💥 Error adding exercise:', error);
    } finally {
      setAdding(false);
    }
  };

  // ============================================================================
  // HELPER: Obtener ejercicios sugeridos por grupo muscular del día
  // ============================================================================
  const getSuggestedExercises = useCallback(() => {
    const currentMuscleGroups = trainingProgram.days[selectedDayIndex]?.muscleGroups || '';
    const muscleKeywords = currentMuscleGroups
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Quitar acentos
      .split(/[\s,+y&|]+/)
      .filter((k) => k.length > 2);

    if (muscleKeywords.length === 0) return templates;

    return templates.filter((t) => {
      const category = (t.category || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
      return muscleKeywords.some(
        (keyword) => category.includes(keyword) || keyword.includes(category.substring(0, 4))
      );
    });
  }, [templates, trainingProgram.days, selectedDayIndex]);

  const addSeriesManually = () => {
    const newSeries: SeriesConfig = {
      id: Date.now().toString(),
      reps: 10,
      type: 'EFECTIVA',
      note: '',
      weight: 0,
    };
    setSeriesConfig([...seriesConfig, newSeries]);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const removeSeriesConfig = (id: string) => {
    setSeriesConfig(seriesConfig.filter((s) => s.id !== id));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  const updateSeriesConfig = (id: string, field: keyof SeriesConfig, value: any) => {
    setSeriesConfig(seriesConfig.map((s) => (s.id === id ? { ...s, [field]: value } : s)));
  };

  const generateRecommendedStructure = () => {
    const structures: Record<UserLevel, SeriesConfig[]> = {
      BEGINNER: [
        { id: '1', reps: 12, type: 'CALENTAMIENTO', note: 'Calentamiento', weight: 0 },
        { id: '2', reps: 10, type: 'EFECTIVA', note: '', weight: 0 },
        { id: '3', reps: 10, type: 'EFECTIVA', note: '', weight: 0 },
        { id: '4', reps: 10, type: 'EFECTIVA', note: '', weight: 0 },
      ],
      INTERMEDIATE: [
        { id: '1', reps: 12, type: 'CALENTAMIENTO', note: 'Calentamiento', weight: 0 },
        { id: '2', reps: 10, type: 'APROXIMACION', note: 'Aproximación', weight: 0 },
        { id: '3', reps: 8, type: 'EFECTIVA', note: '', weight: 0 },
        { id: '4', reps: 8, type: 'EFECTIVA', note: '', weight: 0 },
        { id: '5', reps: 8, type: 'EFECTIVA', note: '', weight: 0 },
      ],
      ADVANCED: [
        { id: '1', reps: 12, type: 'CALENTAMIENTO', note: 'Calentamiento', weight: 0 },
        { id: '2', reps: 8, type: 'APROXIMACION', note: 'Aproximación 1', weight: 0 },
        { id: '3', reps: 6, type: 'APROXIMACION', note: 'Aproximación 2', weight: 0 },
        { id: '4', reps: 6, type: 'EFECTIVA', note: '', weight: 0 },
        { id: '5', reps: 6, type: 'EFECTIVA', note: '', weight: 0 },
        { id: '6', reps: 6, type: 'EFECTIVA', note: '', weight: 0 },
        { id: '7', reps: 12, type: 'FALLO', note: 'Al fallo', weight: 0 },
      ],
      PRO: [
        { id: '1', reps: 15, type: 'CALENTAMIENTO', note: 'Calentamiento', weight: 0 },
        { id: '2', reps: 10, type: 'APROXIMACION', note: 'Aproximación 1', weight: 0 },
        { id: '3', reps: 8, type: 'APROXIMACION', note: 'Aproximación 2', weight: 0 },
        { id: '4', reps: 6, type: 'APROXIMACION', note: 'Aproximación 3', weight: 0 },
        { id: '5', reps: 5, type: 'EFECTIVA', note: '', weight: 0 },
        { id: '6', reps: 5, type: 'EFECTIVA', note: '', weight: 0 },
        { id: '7', reps: 5, type: 'EFECTIVA', note: '', weight: 0 },
        { id: '8', reps: 5, type: 'EFECTIVA', note: '', weight: 0 },
        { id: '9', reps: 15, type: 'FALLO', note: 'Al fallo', weight: 0 },
      ],
    };

    setSeriesConfig(structures[userLevel]);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  // ============================================================================
  // ADD EXERCISE FROM TEMPLATE
  // ============================================================================
  const addExerciseFromTemplate = async (
    template: AssetTemplate,
    customSeries?: SeriesConfig[]
  ) => {
    if (!user) return;

    // BUGFIX: Capturar el día actual al inicio de la operación para evitar race conditions
    const targetDay = selectedDayIndex;

    setAdding(true);
    try {
      // NUEVA ARQUITECTURA: Usar user_exercise_config en lugar de user_assets
      // El template.id ahora es el exercise_id del catálogo global

      // Verificar si ya existe configuración para este ejercicio
      const { data: existingConfig, error: searchError } = await supabase
        .from('user_exercise_config')
        .select('*')
        .eq('user_id', user.id)
        .eq('exercise_id', template.id)
        .maybeSingle();

      if (searchError) {
        console.error('Error buscando configuración existente:', searchError);
      }

      let data;
      let error;

      if (existingConfig) {
        // El ejercicio YA EXISTE - agregar este día a su array training_days
        const currentDays = existingConfig.training_days || [0];

        if (currentDays.includes(targetDay)) {
          alert('Este ejercicio ya está agregado en este día de entrenamiento');
          setAdding(false);
          return;
        }

        // Agregar el nuevo día al array
        const updatedDays = [...currentDays, targetDay].sort();

        // Obtener config actual para copiar series al nuevo día
        const currentConfig = existingConfig.config || {};
        const seriesByDay = (currentConfig.series_by_day as Record<string, any[]>) || {};

        // Si el usuario configuró series personalizadas, usarlas para el nuevo día
        if (customSeries && customSeries.length > 0) {
          seriesByDay[String(targetDay)] = customSeries;
        } else {
          // Copiar series del primer día configurado
          const firstDaySeries = seriesByDay[String(currentDays[0])] || [];
          if (firstDaySeries.length > 0) {
            seriesByDay[String(targetDay)] = [...firstDaySeries];
          }
        }

        const result = await supabase
          .from('user_exercise_config')
          .update({
            training_days: updatedDays,
            updated_at: new Date().toISOString(),
            config: {
              ...currentConfig,
              series_by_day: seriesByDay,
            },
          })
          .eq('id', existingConfig.id)
          .select()
          .single();

        data = result.data;
        error = result.error;
      } else {
        // Crear NUEVA configuración de usuario para este ejercicio
        const seriesByDay: Record<string, any[]> = {};
        if (customSeries) {
          seriesByDay[String(targetDay)] = customSeries;
        }

        const result = await supabase
          .from('user_exercise_config')
          .insert({
            user_id: user.id,
            exercise_id: template.id, // Referencia al ejercicio global
            training_days: [targetDay],
            display_order: exercises.length,
            config: {
              sets: customSeries
                ? `${customSeries.length}x${customSeries[0]?.reps || 10}`
                : template.default_metadata.sets,
              rest: template.default_metadata.rest,
              series_by_day: customSeries ? seriesByDay : {},
              custom_series: customSeries || null,
            },
          })
          .select()
          .single();

        data = result.data;
        error = result.error;
      }

      if (error) throw error;

      if (data) {
        // Convertir SeriesConfig a Series para el estado local
        const seriesForState: Series[] = customSeries
          ? customSeries.map((s) => ({
              id: s.id,
              // Normalizar tipos a español (el tipo almacenado puede ser legacy en inglés)
              type: (s.type === 'CALENTAMIENTO' || (s.type as string) === 'WARMUP'
                ? 'CALENTAMIENTO'
                : s.type === 'APROXIMACION' || (s.type as string) === 'APPROACH'
                  ? 'APROXIMACION'
                  : s.type === 'FALLO' || (s.type as string) === 'FAILURE'
                    ? 'FALLO'
                    : 'EFECTIVA') as SeriesType,
              reps: String(s.reps),
              note: s.note || undefined,
            }))
          : generateDefaultSeries(data.config?.sets || template.default_metadata.sets);

        const newExercise: Exercise = {
          id: data.id, // user_exercise_config.id
          exercise_id: template.id, // ID del ejercicio en tabla exercises
          name: template.name,
          sets: data.config?.sets || template.default_metadata.sets,
          image_url: template.image_url,
          order: data.display_order || 0,
          series: seriesForState,
          training_days: data.training_days || [targetDay],
          videos: [],
          alternatives: [],
        };

        setExercises([...exercises, newExercise]);
        setModalVisible(false);

        // BUGFIX: Cargar ejercicios inmediatamente para obtener alternativas
        // No usar setTimeout ya que puede causar race conditions al cerrar el modal
        await loadExercises(targetDay, true);
      }
    } catch (error) {
      console.error('💥 Error adding exercise:', error);
      alert('Error al agregar ejercicio');
    } finally {
      setAdding(false);
    }
  };

  // ============================================================================
  // DELETE EXERCISE
  // ============================================================================
  const deleteExercise = async (id: string) => {
    try {
      // NUEVA ARQUITECTURA: Usar user_exercise_config
      // Obtener la configuración actual
      const { data: config, error: fetchError } = await supabase
        .from('user_exercise_config')
        .select('training_days')
        .eq('id', id)
        .single();

      if (fetchError) throw fetchError;

      const currentDays = config?.training_days || [0];

      if (currentDays.length > 1) {
        // Si está en MÚLTIPLES días, solo REMOVER el día actual del array
        const updatedDays = currentDays.filter((day: number) => day !== selectedDayIndex);

        const { error } = await supabase
          .from('user_exercise_config')
          .update({
            training_days: updatedDays,
            updated_at: new Date().toISOString(),
          })
          .eq('id', id);

        if (error) throw error;
      } else {
        // Si está en UN SOLO día, eliminar la configuración completa
        const { error } = await supabase.from('user_exercise_config').delete().eq('id', id);

        if (error) throw error;
      }

      // Remover del estado local (solo para el día actual)
      setExercises(exercises.filter((ex) => ex.id !== id));
    } catch (error) {
      console.error('💥 Error deleting exercise:', error);
      alert('Error al eliminar ejercicio');
    }
  };

  // ============================================================================
  // REORDER EXERCISES - Drag & Drop
  // ============================================================================
  const [isDraggingExercise, setIsDraggingExercise] = useState(false);
  const [dragTargetIndex, setDragTargetIndex] = useState<number | null>(null);
  const [draggingFromIndex, setDraggingFromIndex] = useState<number | null>(null);

  const reorderExercises = useCallback(
    async (fromIndex: number, toIndex: number) => {
      if (fromIndex === toIndex) return;

      // BUGFIX: Validar índices para evitar ejercicios vacíos/undefined
      if (fromIndex < 0 || fromIndex >= exercises.length) {
        console.error(
          '💥 reorderExercises: fromIndex inválido:',
          fromIndex,
          'length:',
          exercises.length
        );
        return;
      }
      if (toIndex < 0 || toIndex >= exercises.length) {
        console.error(
          '💥 reorderExercises: toIndex inválido:',
          toIndex,
          'length:',
          exercises.length
        );
        return;
      }

      // Reordenar localmente
      const newExercises = [...exercises];
      const [movedItem] = newExercises.splice(fromIndex, 1);

      // BUGFIX: Verificar que el item movido existe y no es undefined
      if (!movedItem || !movedItem.id) {
        console.error('💥 reorderExercises: movedItem es undefined o sin id');
        return;
      }

      newExercises.splice(toIndex, 0, movedItem);

      // BUGFIX: Filtrar cualquier elemento undefined o sin id que pudiera haberse colado
      const cleanedExercises = newExercises.filter((ex) => ex && ex.id);

      // DEBUG: Verificar que las alternativas se mantienen después del reorder
      console.log('🔄 reorderExercises: Ejercicios después de reordenar:');
      cleanedExercises.forEach((ex, idx) => {
        console.log(`   [${idx}] ${ex.name}: ${ex.alternatives?.length || 0} alternativas`);
      });

      setExercises(cleanedExercises);

      // BUGFIX: Limpiar activeAlternatives después del reorder
      // Los índices de ejercicios cambian, así que resetear al ejercicio principal (índice 0)
      console.log('🧹 reorderExercises: Limpiando activeAlternatives');
      setActiveAlternatives({});
      activeAlternativesRef.current = {};

      // Actualizar orden en Supabase
      // Guardar el nuevo orden como un campo en user_exercise_config
      try {
        const orderUpdates = cleanedExercises.map((ex, idx) => ({
          id: ex.id,
          display_order: idx,
        }));

        // BUGFIX: Usar Promise.all para actualizar todos a la vez y evitar race conditions
        await Promise.all(
          orderUpdates.map((update) =>
            supabase
              .from('user_exercise_config')
              .update({ display_order: update.display_order })
              .eq('id', update.id)
          )
        );

        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch (error) {
        console.error('💥 Error reordering exercises:', error);
      }
    },
    [exercises]
  );

  // ============================================================================
  // SAVE AND TRAIN
  // ============================================================================
  const saveAndTrain = async () => {
    // Guard: Verificar si puede guardar
    if (!canSave('save_workout')) return;

    if (exercises.length === 0) return;

    // Actualizar el día actual en el perfil
    if (user) {
      await supabase
        .from('profiles')
        .update({
          training_current_day: selectedDayIndex,
          training_last_access: new Date().toISOString(),
        })
        .eq('id', user.id);

      setTrainingProgram((prev) => ({
        ...prev,
        currentDayIndex: selectedDayIndex,
        lastAccessDate: new Date().toISOString(),
      }));
    }

    // SOLUCIÓN MEJORADA: Cargar datos frescos sin limpiar estado
    // Esto evita el flash de "sin ejercicios" y mantiene una mejor UX
    console.log('🔄 saveAndTrain: Cargando datos frescos...');

    // Paso 1: Cargar datos frescos desde Supabase
    await loadExercises(selectedDayIndex, true);

    // Paso 2: Incrementar key UNA SOLA VEZ para forzar re-render con datos nuevos
    setListRefreshKey((prev) => prev + 1);

    console.log('✅ saveAndTrain: Datos frescos cargados');
    console.log('   Ejercicios:', exercisesRef.current.length);
    exercisesRef.current.forEach((e, i) => {
      console.log(`   [${i}] ${e.name}: ${e.alternatives?.length || 0} alternativas`);
    });

    setViewMode('FOCUS');
  };

  // ============================================================================
  // RENDER LOADING
  // ============================================================================
  if (viewMode === 'LOADING' || loading) {
    return (
      <View className="flex-1 bg-savage-black justify-center items-center">
        <ActivityIndicator size="large" color="#DC2626" />
        <Text className="text-savage-red font-bold text-lg mt-4 tracking-widest">
          LOADING PROTOCOL...
        </Text>
      </View>
    );
  }

  // ============================================================================
  // RENDER SERIES CONFIG MODAL
  // ============================================================================
  const SERIES_TYPES = [
    {
      key: 'CALENTAMIENTO',
      label: 'C',
      fullLabel: 'Calentamiento',
      color: '#3B82F6',
      bg: '#1e3a5f',
    },
    { key: 'APROXIMACION', label: 'A', fullLabel: 'Aproximación', color: '#F59E0B', bg: '#422006' },
    { key: 'EFECTIVA', label: 'E', fullLabel: 'Efectiva', color: '#22C55E', bg: '#052e16' },
    { key: 'FALLO', label: 'F', fullLabel: 'Al Fallo', color: '#EF4444', bg: '#450a0a' },
  ] as const;

  const getSeriesTypeConfig = (type: string) => {
    return SERIES_TYPES.find((t) => t.key === type) || SERIES_TYPES[2]; // Default: EFECTIVA
  };

  const renderSeriesConfigModal = () => (
    <Modal
      visible={seriesConfigModalVisible}
      animationType="none"
      transparent={true}
      onRequestClose={closeSeriesConfigModal}
    >
      <View className="flex-1 bg-transparent justify-end">
        <Animated.View
          style={[
            {
              height: '92%',
              backgroundColor: '#0a0a0a',
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              borderTopWidth: 2,
              borderTopColor: 'rgba(220, 38, 38, 0.5)',
              overflow: 'hidden',
            },
            animatedStyleSeriesConfig,
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

          {/* HEADER DRAGGABLE */}
          <View
            {...panResponderSeriesConfig.panHandlers}
            className="px-4 pt-4 pb-3 border-b border-zinc-900"
          >
            {/* Indicador de drag */}
            <View className="items-center mb-3">
              <View className="w-12 h-1.5 bg-zinc-600 rounded-full" />
            </View>

            {/* EXERCISE INFO CENTRADA */}
            {selectedTemplate && (
              <View className="flex-row items-center justify-center">
                <Image
                  source={{
                    uri:
                      exercises.find((ex) => ex.name === selectedTemplate.name)?.image_url ||
                      selectedTemplate.image_url,
                  }}
                  style={{ width: 36, height: 36 }}
                  className="rounded-lg mr-2"
                  contentFit="cover"
                />
                <View>
                  <Text className="text-white font-bold text-sm" numberOfLines={1}>
                    {selectedTemplate.name}
                  </Text>
                  <Text className="text-zinc-600 text-[10px]">{selectedTemplate.category}</Text>
                </View>
              </View>
            )}
          </View>

          {/* LEYENDA DE TIPOS */}
          <View className="flex-row justify-center gap-3 py-2 bg-zinc-950/50">
            {SERIES_TYPES.map((type) => (
              <View key={type.key} className="flex-row items-center gap-1">
                <View
                  className="w-5 h-5 rounded items-center justify-center"
                  style={{ backgroundColor: type.bg, borderWidth: 1, borderColor: type.color }}
                >
                  <Text className="text-[10px] font-bold" style={{ color: type.color }}>
                    {type.label}
                  </Text>
                </View>
                <Text className="text-zinc-500 text-[10px]">{type.fullLabel}</Text>
              </View>
            ))}
          </View>

          <Text className="text-zinc-600 text-[10px] text-center py-1">
            👈 Desliza izquierda para eliminar
          </Text>

          {/* SERIES LIST */}
          <ScrollView className="flex-1 px-3" keyboardShouldPersistTaps="handled">
            {seriesConfig.map((serie, index) => {
              const typeConfig = getSeriesTypeConfig(serie.type);
              return (
                <SwipeableSeriesRow
                  key={serie.id}
                  onDelete={() => {
                    removeSeriesConfig(serie.id);
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                  }}
                >
                  <View
                    className="flex-row items-stretch rounded-xl overflow-hidden mb-2"
                    style={{ backgroundColor: '#0a0a0a', borderWidth: 1, borderColor: '#1a1a1a' }}
                  >
                    {/* NÚMERO DE SERIE + TIPO */}
                    <TouchableOpacity
                      onPress={() => {
                        const currentIndex = SERIES_TYPES.findIndex((t) => t.key === serie.type);
                        const nextIndex = (currentIndex + 1) % SERIES_TYPES.length;
                        updateSeriesConfig(serie.id, 'type', SERIES_TYPES[nextIndex].key);
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      }}
                      className="w-12 items-center justify-center py-2"
                      style={{ backgroundColor: typeConfig.bg }}
                    >
                      <Text className="text-zinc-500 text-[10px] font-mono">{index + 1}</Text>
                      <Text className="text-lg font-bold" style={{ color: typeConfig.color }}>
                        {typeConfig.label}
                      </Text>
                    </TouchableOpacity>

                    {/* CONTENIDO */}
                    <View className="flex-1 py-2">
                      {/* REPS + PESO */}
                      <View className="flex-row items-center px-2">
                        {/* REPS */}
                        <View className="flex-1 flex-row items-center">
                          <TouchableOpacity
                            onPress={() => {
                              updateSeriesConfig(serie.id, 'reps', Math.max(1, serie.reps - 1));
                              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            }}
                            className="w-7 h-7 rounded-full bg-zinc-800 items-center justify-center"
                          >
                            <Text className="text-white font-bold">−</Text>
                          </TouchableOpacity>
                          <View className="flex-1 items-center">
                            <Text className="text-white font-mono font-bold text-lg">
                              {serie.reps}
                            </Text>
                            <Text className="text-zinc-600 text-[8px] -mt-1">REPS</Text>
                          </View>
                          <TouchableOpacity
                            onPress={() => {
                              updateSeriesConfig(serie.id, 'reps', serie.reps + 1);
                              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            }}
                            className="w-7 h-7 rounded-full bg-zinc-800 items-center justify-center"
                          >
                            <Text className="text-white font-bold">+</Text>
                          </TouchableOpacity>
                        </View>

                        {/* SEPARADOR */}
                        <View className="w-px h-6 bg-zinc-800 mx-1" />

                        {/* PESO */}
                        <View className="flex-1 flex-row items-center">
                          <TouchableOpacity
                            onPress={() => {
                              updateSeriesConfig(
                                serie.id,
                                'weight',
                                Math.max(0, (serie.weight || 0) - 2.5)
                              );
                              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            }}
                            className="w-7 h-7 rounded-full bg-zinc-800 items-center justify-center"
                          >
                            <Text className="text-white font-bold">−</Text>
                          </TouchableOpacity>
                          <View className="flex-1 items-center">
                            <TextInput
                              className="text-white font-mono font-bold text-lg text-center w-full p-0"
                              keyboardType="numeric"
                              placeholder="—"
                              placeholderTextColor="#52525b"
                              value={serie.weight ? String(serie.weight) : ''}
                              onChangeText={(text) => {
                                const num = parseFloat(text) || 0;
                                updateSeriesConfig(serie.id, 'weight', num);
                              }}
                            />
                            <Text className="text-zinc-600 text-[8px] -mt-1">KG</Text>
                          </View>
                          <TouchableOpacity
                            onPress={() => {
                              updateSeriesConfig(serie.id, 'weight', (serie.weight || 0) + 2.5);
                              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            }}
                            className="w-7 h-7 rounded-full bg-zinc-800 items-center justify-center"
                          >
                            <Text className="text-white font-bold">+</Text>
                          </TouchableOpacity>
                        </View>
                      </View>

                      {/* INDICACIÓN (opcional) */}
                      <TextInput
                        className="text-zinc-400 text-xs mx-2 mt-1 px-2 py-1 bg-zinc-900/50 rounded"
                        placeholder="+ Indicación (opcional)"
                        placeholderTextColor="#52525b"
                        value={serie.note || ''}
                        onChangeText={(text) => updateSeriesConfig(serie.id, 'note', text)}
                      />
                    </View>
                  </View>
                </SwipeableSeriesRow>
              );
            })}

            {/* AGREGAR SERIE */}
            <TouchableOpacity
              onPress={() => {
                addSeriesManually();
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              }}
              className="flex-row items-center justify-center gap-2 py-3 mb-4 rounded-xl"
              style={{
                borderWidth: 2,
                borderStyle: 'dashed',
                borderColor: '#27272a',
                backgroundColor: '#050505',
              }}
            >
              <Plus color="#71717a" size={20} />
              <Text className="text-zinc-500 font-bold text-sm">AGREGAR SERIE</Text>
            </TouchableOpacity>
          </ScrollView>

          {/* FOOTER */}
          <View
            className="px-4 pt-3 border-t border-zinc-900"
            style={{ paddingBottom: insets.bottom + 16 }}
          >
            <TouchableOpacity
              onPress={() => {
                generateRecommendedStructure();
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              }}
              className="flex-row items-center justify-center gap-2 py-3 rounded-xl"
              style={{ backgroundColor: '#0f0f0f', borderWidth: 1, borderColor: '#DC2626' }}
            >
              <Zap color="#DC2626" size={16} />
              <Text className="text-savage-red font-bold text-sm">
                ESTRUCTURA RECOMENDADA POR HANK
              </Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );

  // ============================================================================
  // RENDER CATALOG MODAL - CON TABS INTELIGENTES
  // ============================================================================
  const renderCatalogModal = () => {
    // Obtener ejercicios según tab activo
    const suggestedExercises = getSuggestedExercises();
    const filteredTemplates =
      catalogTab === 'SUGERIDOS'
        ? suggestedExercises
        : templates.filter((t) => t.category === catalogTab);

    // Nombre del grupo muscular del día actual
    const currentMuscleGroup =
      trainingProgram.days[selectedDayIndex]?.muscleGroups || 'ENTRENAMIENTO';

    // Parsear grupos musculares para mostrar badges de colores
    const muscleGroupBadges = currentMuscleGroup
      .split(/[,yx&]+/)
      .map((g) => g.trim())
      .filter(Boolean);

    return (
      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => {
          setModalVisible(false);
          setCatalogTab('SUGERIDOS');
        }}
      >
        <View className="flex-1 bg-transparent justify-end">
          <Animated.View
            style={[
              {
                height: '92%',
                backgroundColor: '#0a0a0a',
                borderTopLeftRadius: 24,
                borderTopRightRadius: 24,
                borderTopWidth: 2,
                borderTopColor: 'rgba(220, 38, 38, 0.5)',
                overflow: 'hidden',
              },
              animatedStyleCatalog,
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
            {/* HEADER DRAGGABLE - GRADIENT */}
            <LinearGradient
              colors={['#1a0805', '#0d0502', '#000000']}
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 1 }}
            >
              <View {...panResponderCatalog.panHandlers} className="px-4 pt-4 pb-3">
                {/* Indicador de drag */}
                <View className="items-center mb-3">
                  <View className="w-10 h-1 bg-zinc-600 rounded-full" />
                </View>

                <View className="flex-row justify-between items-start mb-3">
                  <View className="flex-1">
                    <View className="flex-row items-center gap-2 mb-1">
                      <Text className="text-savage-red text-2xl font-bold">CATÁLOGO</Text>
                      <View className="bg-savage-red/20 px-2 py-0.5 rounded-full">
                        <Text className="text-savage-red text-[10px] font-bold">
                          DÍA {selectedDayIndex + 1}
                        </Text>
                      </View>
                    </View>
                    {/* Badges de grupos musculares con colores */}
                    <View className="flex-row flex-wrap gap-1 mt-1">
                      {muscleGroupBadges.map((group, idx) => {
                        const groupColor = getMuscleGroupColor(group);
                        return (
                          <View
                            key={idx}
                            className="px-2 py-0.5 rounded-full"
                            style={{
                              backgroundColor: groupColor.bg,
                              borderWidth: 1,
                              borderColor: groupColor.color,
                            }}
                          >
                            <Text
                              className="text-[10px] font-bold uppercase"
                              style={{ color: groupColor.color }}
                            >
                              {group}
                            </Text>
                          </View>
                        );
                      })}
                      n{' '}
                    </View>
                  </View>
                </View>

                {/* TABS - Scroll horizontal con mejor diseño */}
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  className="flex-row -mx-4 px-4"
                  contentContainerStyle={{ paddingRight: 32 }}
                >
                  {/* Tab SUGERIDOS */}
                  <TouchableOpacity
                    onPress={() => {
                      setCatalogTab('SUGERIDOS');
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    }}
                    className="mr-2 px-4 py-2.5 rounded-xl"
                    style={
                      catalogTab === 'SUGERIDOS'
                        ? {
                            backgroundColor: '#DC2626',
                            shadowColor: '#DC2626',
                            shadowOffset: { width: 0, height: 4 },
                            shadowOpacity: 0.4,
                            shadowRadius: 8,
                          }
                        : {
                            backgroundColor: '#18181b',
                            borderWidth: 1,
                            borderColor: '#27272a',
                          }
                    }
                  >
                    <Text
                      className={`text-xs font-bold ${
                        catalogTab === 'SUGERIDOS' ? 'text-white' : 'text-zinc-400'
                      }`}
                    >
                      🔥 SUGERIDOS ({suggestedExercises.length})
                    </Text>
                  </TouchableOpacity>

                  {/* Tabs por categoría - estilo uniforme */}
                  {categories.map((category) => {
                    const count = templates.filter((t) => t.category === category).length;
                    const isActive = catalogTab === category;
                    return (
                      <TouchableOpacity
                        key={category}
                        onPress={() => {
                          setCatalogTab(category);
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        }}
                        className="mr-2 px-4 py-2.5 rounded-xl"
                        style={
                          isActive
                            ? {
                                backgroundColor: '#27272a',
                                borderWidth: 1,
                                borderColor: '#3f3f46',
                              }
                            : {
                                backgroundColor: '#18181b',
                                borderWidth: 1,
                                borderColor: '#27272a',
                              }
                        }
                      >
                        <Text
                          className="text-xs font-bold uppercase"
                          style={{ color: isActive ? '#fff' : '#71717a' }}
                        >
                          {category} ({count})
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            </LinearGradient>

            {/* CATALOG LIST */}
            <FlatList
              data={filteredTemplates}
              keyExtractor={(item) => item.id}
              className="flex-1 px-3 pt-3"
              showsVerticalScrollIndicator={false}
              ListEmptyComponent={
                <View className="flex-1 justify-center items-center py-16">
                  <Text className="text-zinc-500 text-center mb-2">
                    No hay ejercicios en esta categoría
                  </Text>
                  <Text className="text-zinc-600 text-xs text-center">
                    Prueba con otra categoría o renombra tu día de entrenamiento
                  </Text>
                </View>
              }
              renderItem={({ item }) => {
                // Buscar si el ejercicio ya existe con imagen personalizada
                const existingExercise = allUserExercises.find((ex) => ex.name === item.name);
                // Prioridad: 1) Imagen personalizada del usuario, 2) Imagen del template, 3) Placeholder
                const imageUrl =
                  existingExercise?.image_url ||
                  item.image_url ||
                  'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=200&h=200&fit=crop';
                const alreadyAdded = exercises.some((ex) => ex.name === item.name);
                // Solo mostrar color en tab SUGERIDOS
                const showCategoryColor = catalogTab === 'SUGERIDOS';
                const catColor = showCategoryColor ? getMuscleGroupColor(item.category) : null;

                return (
                  <View
                    className="mb-2 rounded-2xl overflow-hidden"
                    style={{
                      backgroundColor: alreadyAdded ? '#052e16' : '#0a0a0a',
                      borderWidth: 1,
                      borderColor: alreadyAdded
                        ? '#22c55e40'
                        : showCategoryColor && catColor
                          ? `${catColor.color}30`
                          : '#1a1a1a',
                    }}
                  >
                    <View className="flex-row p-3 items-center">
                      {/* IMAGE CON GLOW */}
                      <View className="relative">
                        <Image
                          source={{ uri: imageUrl }}
                          style={{ width: 60, height: 60, borderRadius: 12 }}
                          contentFit="cover"
                        />
                        {alreadyAdded && (
                          <View
                            className="absolute -top-1 -right-1 w-5 h-5 rounded-full items-center justify-center"
                            style={{ backgroundColor: '#22c55e' }}
                          >
                            <Text className="text-white text-[10px] font-bold">✓</Text>
                          </View>
                        )}
                      </View>

                      {/* INFO */}
                      <View className="flex-1 ml-3">
                        <Text className="text-white font-bold text-sm mb-0.5" numberOfLines={1}>
                          {item.name}
                        </Text>
                        <Text className="text-zinc-500 text-[11px] mb-1.5" numberOfLines={1}>
                          {item.description}
                        </Text>
                        {/* Badge de categoría - solo en SUGERIDOS con color */}
                        <View
                          className="self-start px-2 py-0.5 rounded-full"
                          style={{
                            backgroundColor:
                              showCategoryColor && catColor ? catColor.bg : '#18181b',
                            borderWidth: 1,
                            borderColor: showCategoryColor && catColor ? catColor.color : '#3f3f46',
                          }}
                        >
                          <Text
                            className="text-[9px] font-bold uppercase"
                            style={{
                              color: showCategoryColor && catColor ? catColor.color : '#71717a',
                            }}
                          >
                            {item.category}
                          </Text>
                        </View>
                      </View>

                      {/* ACTIONS */}
                      <View className="flex-row gap-2">
                        {/* Quick Add Button */}
                        <TouchableOpacity
                          onPress={() => quickAddExercise(item)}
                          disabled={adding || alreadyAdded}
                          className="w-11 h-11 rounded-xl items-center justify-center"
                          style={{
                            backgroundColor: alreadyAdded ? '#18181b' : '#DC2626',
                            shadowColor: alreadyAdded ? 'transparent' : '#DC2626',
                            shadowOffset: { width: 0, height: 4 },
                            shadowOpacity: 0.4,
                            shadowRadius: 8,
                          }}
                        >
                          {adding ? (
                            <ActivityIndicator color="#FFFFFF" size="small" />
                          ) : (
                            <Plus color={alreadyAdded ? '#52525b' : '#FFFFFF'} size={20} />
                          )}
                        </TouchableOpacity>

                        {/* Config Button */}
                        <TouchableOpacity
                          onPress={() => openSeriesConfigModal(item)}
                          disabled={adding}
                          className="w-11 h-11 rounded-xl items-center justify-center"
                          style={{
                            backgroundColor: '#18181b',
                            borderWidth: 1,
                            borderColor: '#27272a',
                          }}
                        >
                          <Sliders color="#a1a1aa" size={18} />
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                );
              }}
            />

            {/* FOOTER INFO - MEJORADO */}
            <View
              className="px-4 pt-3 border-t border-zinc-800/50"
              style={{
                paddingBottom: insets.bottom + 16,
                backgroundColor: 'rgba(10, 10, 10, 0.95)',
              }}
            >
              <View className="flex-row justify-center items-center gap-4">
                <View className="flex-row items-center gap-1.5">
                  <View className="w-6 h-6 rounded-lg bg-savage-red items-center justify-center">
                    <Plus size={14} color="#fff" />
                  </View>
                  <Text className="text-zinc-400 text-[10px]">
                    Estructura recomendada por{' '}
                    <Text className="text-savage-red font-bold">HANK</Text>
                  </Text>
                </View>
                <View className="w-px h-4 bg-zinc-700" />
                <View className="flex-row items-center gap-1.5">
                  <View className="w-6 h-6 rounded-lg bg-zinc-800 items-center justify-center border border-zinc-700">
                    <Sliders size={12} color="#a1a1aa" />
                  </View>
                  <Text className="text-zinc-400 text-[10px]">Configurar manualmente</Text>
                </View>
              </View>
            </View>
          </Animated.View>
        </View>
      </Modal>
    );
  };

  // ============================================================================
  // RENDER STRUCTURE MODAL - ED HARDY FIRE STYLE (Arrastrable)
  // ============================================================================
  const renderStructureModal = () => {
    return (
      <Modal
        visible={structureModalOpen}
        animationType="none"
        transparent={true}
        onRequestClose={closeStructureWithAnimation}
      >
        <View className="flex-1 bg-black/80 justify-end">
          <Animated.View
            style={[
              {
                height: '92%',
                backgroundColor: '#000',
                borderTopLeftRadius: 24,
                borderTopRightRadius: 24,
                borderTopWidth: 2,
                borderTopColor: 'rgba(220, 38, 38, 0.5)',
                overflow: 'hidden',
              },
              animatedStyleStructure,
            ]}
          >
            {/* Línea de acento roja */}
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

            {/* Contenido scrolleable */}
            <View className="flex-1">
              {/* HEADER ARRASTRABLE - SAVAGE FIRE STYLE */}
              <Animated.View className="relative pb-5 px-4" {...panResponderStructure.panHandlers}>
                {/* Drag Handle */}
                <View className="items-center pt-4 pb-3">
                  <View className="w-12 h-1.5 bg-zinc-600 rounded-full" />
                </View>
                <LinearGradient
                  colors={['#1a0805', '#0d0502', '#000000']}
                  start={{ x: 0.5, y: 0 }}
                  end={{ x: 0.5, y: 1 }}
                  className="absolute inset-0"
                />

                {/* Fire glow effect */}
                <View
                  className="absolute top-0 left-0 right-0 h-32"
                  style={{
                    backgroundColor: 'rgba(249, 115, 22, 0.08)',
                  }}
                />

                {/* Header Row */}
                <View className="flex-row items-center justify-between mb-5">
                  <View>
                    <View className="flex-row items-center gap-2">
                      <View
                        className="w-10 h-10 rounded-xl items-center justify-center"
                        style={{
                          backgroundColor: '#DC2626',
                          shadowColor: '#DC2626',
                          shadowOffset: { width: 0, height: 0 },
                          shadowOpacity: 0.6,
                          shadowRadius: 12,
                        }}
                      >
                        <Sliders size={20} color="#fff" />
                      </View>
                      <View>
                        <Text
                          className="text-white text-xl font-bold tracking-tight"
                          style={{
                            textShadowColor: '#F97316',
                            textShadowOffset: { width: 0, height: 0 },
                            textShadowRadius: 8,
                          }}
                        >
                          ESTRUCTURA
                        </Text>
                        <Text className="text-zinc-500 text-[10px] uppercase tracking-widest font-mono">
                          {isExternalMode
                            ? `⚡ PERSONALIZADO • ${Object.keys(externalSchedule).length} DÍAS`
                            : `${trainingProgram.days.length} DÍAS • ${exercises.length} EJERCICIOS`}
                        </Text>
                      </View>
                    </View>
                  </View>
                  <TouchableOpacity
                    onPress={async () => {
                      if (exercises.length > 0) {
                        // Actualizar el día de entrenamiento actual en la BD
                        if (user && selectedDayIndex !== trainingProgram.currentDayIndex) {
                          const today = new Date();
                          today.setHours(0, 0, 0, 0);
                          const todayISO = today.toISOString();

                          await supabase
                            .from('profiles')
                            .update({
                              training_last_access: todayISO,
                              training_current_day: selectedDayIndex,
                            })
                            .eq('id', user.id);

                          setTrainingProgram((prev) => ({
                            ...prev,
                            lastAccessDate: todayISO,
                            currentDayIndex: selectedDayIndex,
                          }));
                          console.log('🏋️ Día de entrenamiento actualizado a:', selectedDayIndex);
                        }
                        // Cerrar modal con animación y recargar desde BD
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                        translateYStructure.value = withTiming(
                          800,
                          { duration: 250, easing: Easing.out(Easing.ease) },
                          () => runOnJS(closeStructureWithAnimation)()
                        );
                      }
                    }}
                    disabled={exercises.length === 0}
                    className="flex-row items-center gap-2 px-5 py-3 rounded-xl"
                    style={
                      exercises.length > 0
                        ? {
                            backgroundColor: '#DC2626',
                            shadowColor: '#DC2626',
                            shadowOffset: { width: 0, height: 4 },
                            shadowOpacity: 0.5,
                            shadowRadius: 12,
                          }
                        : {
                            backgroundColor: '#27272a',
                          }
                    }
                  >
                    <Play
                      size={16}
                      color={exercises.length > 0 ? '#fff' : '#71717a'}
                      fill={exercises.length > 0 ? '#fff' : '#71717a'}
                    />
                    <Text
                      className={`font-bold text-sm ${exercises.length > 0 ? 'text-white' : 'text-zinc-500'}`}
                    >
                      ENTRENAR
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* DAYS SELECTOR - Horizontal Pills (MODO GYM o PERSONALIZADO) */}
                <View className="mb-2">
                  <Text className="text-zinc-600 text-[10px] font-mono mb-2 uppercase tracking-wider">
                    {isExternalMode
                      ? 'Selecciona un día para agregar ejercicios'
                      : 'Selecciona el día a configurar'}
                  </Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    className="-mx-4 px-4"
                  >
                    {/* MODO PERSONALIZADO: Días seleccionables */}
                    {isExternalMode &&
                      Object.entries(externalSchedule).map(([dayName, muscleGroup], index) => {
                        const isActive = selectedDayIndex === index;
                        return (
                          <TouchableOpacity
                            key={dayName}
                            onPress={() => {
                              syncSelectedDay(index);
                              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                            }}
                            onLongPress={() => {
                              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
                              Alert.alert(
                                '🗑️ Eliminar día',
                                `¿Eliminar "${dayName}: ${muscleGroup}" de tu plan personalizado?`,
                                [
                                  { text: 'Cancelar', style: 'cancel' },
                                  {
                                    text: 'Eliminar',
                                    style: 'destructive',
                                    onPress: async () => {
                                      const deletedDayIndex = index;

                                      // Eliminar el día del external_schedule
                                      const newSchedule = { ...externalSchedule };
                                      delete newSchedule[dayName];

                                      // Actualizar en Supabase
                                      if (user) {
                                        // 1. Actualizar external_schedule en user_profiles
                                        await supabase
                                          .from('user_profiles')
                                          .update({
                                            external_schedule: newSchedule,
                                            training_days_per_week: Object.keys(newSchedule).length,
                                          })
                                          .eq('user_id', user.id);

                                        // 2. SINCRONIZAR: También actualizar profiles para evitar desincronización
                                        const newRoutineNames: Record<string, string> = {};
                                        Object.entries(newSchedule).forEach(
                                          ([day, muscle], idx) => {
                                            newRoutineNames[String(idx)] = `${day}: ${muscle}`;
                                          }
                                        );

                                        await supabase
                                          .from('profiles')
                                          .update({
                                            training_frequency: Object.keys(newSchedule).length,
                                            training_routine_names: newRoutineNames,
                                          })
                                          .eq('id', user.id);

                                        // 3. ELIMINAR/ACTUALIZAR EJERCICIOS del día eliminado
                                        const { data: userExercises } = await supabase
                                          .from('user_exercise_config')
                                          .select('id, training_days, config')
                                          .eq('user_id', user.id);

                                        if (userExercises) {
                                          for (const ex of userExercises) {
                                            const currentDays: number[] = ex.training_days || [];
                                            // Remover el día eliminado y reindexar días mayores
                                            const newDays = currentDays
                                              .filter((d: number) => d !== deletedDayIndex)
                                              .map((d: number) =>
                                                d > deletedDayIndex ? d - 1 : d
                                              );

                                            // Limpiar series_by_day en config
                                            const config = ex.config || {};
                                            const seriesByDay =
                                              (config.series_by_day as Record<string, unknown>) ||
                                              {};
                                            const newSeriesByDay: Record<string, unknown> = {};

                                            Object.entries(seriesByDay).forEach(
                                              ([dayKey, series]) => {
                                                const dayNum = parseInt(dayKey);
                                                if (dayNum !== deletedDayIndex) {
                                                  const newKey =
                                                    dayNum > deletedDayIndex
                                                      ? String(dayNum - 1)
                                                      : dayKey;
                                                  newSeriesByDay[newKey] = series;
                                                }
                                              }
                                            );

                                            if (newDays.length === 0) {
                                              // Eliminar ejercicio si ya no tiene días
                                              await supabase
                                                .from('user_exercise_config')
                                                .delete()
                                                .eq('id', ex.id);
                                            } else {
                                              await supabase
                                                .from('user_exercise_config')
                                                .update({
                                                  training_days: newDays,
                                                  config: {
                                                    ...config,
                                                    series_by_day: newSeriesByDay,
                                                  },
                                                })
                                                .eq('id', ex.id);
                                            }
                                          }
                                        }

                                        // 4. Actualizar estado local
                                        setExternalSchedule(newSchedule);
                                        setTrainingProgram((prev) => ({
                                          ...prev,
                                          frequency: Object.keys(newSchedule).length,
                                          days: Object.entries(newSchedule).map(
                                            ([day, muscle], idx) => ({
                                              id: String(idx + 1),
                                              muscleGroups: `${day}: ${muscle}`,
                                              exercises: [],
                                            })
                                          ),
                                        }));

                                        // Si no quedan días, desactivar modo personalizado
                                        if (Object.keys(newSchedule).length === 0) {
                                          await supabase
                                            .from('user_profiles')
                                            .update({ training_mode: 'none' })
                                            .eq('user_id', user.id);
                                          setIsExternalMode(false);
                                        }

                                        // Ajustar índice seleccionado
                                        const newIndex = Math.max(
                                          0,
                                          Math.min(
                                            selectedDayIndex,
                                            Object.keys(newSchedule).length - 1
                                          )
                                        );
                                        syncSelectedDay(newIndex);

                                        // Recargar ejercicios del nuevo día seleccionado
                                        loadExercises(newIndex);
                                      }

                                      Haptics.notificationAsync(
                                        Haptics.NotificationFeedbackType.Warning
                                      );
                                    },
                                  },
                                ]
                              );
                            }}
                            className="mr-2.5 px-4 py-2.5 rounded-xl"
                            style={
                              isActive
                                ? {
                                    backgroundColor: '#a855f7',
                                    shadowColor: '#a855f7',
                                    shadowOffset: { width: 0, height: 4 },
                                    shadowOpacity: 0.5,
                                    shadowRadius: 12,
                                  }
                                : {
                                    backgroundColor: '#1a0a2e',
                                    borderWidth: 1,
                                    borderColor: '#a855f750',
                                  }
                            }
                          >
                            <View className="flex-row items-center gap-2">
                              <View
                                className="w-6 h-6 rounded-lg items-center justify-center"
                                style={{
                                  backgroundColor: isActive
                                    ? 'rgba(0,0,0,0.3)'
                                    : 'rgba(168,85,247,0.2)',
                                }}
                              >
                                <Text
                                  className={`font-bold text-xs font-mono ${isActive ? 'text-white' : 'text-purple-400'}`}
                                >
                                  {index + 1}
                                </Text>
                              </View>
                              <View>
                                <Text
                                  className={`font-bold text-[10px] uppercase tracking-wide ${isActive ? 'text-white' : 'text-purple-300'}`}
                                >
                                  {dayName}
                                </Text>
                                <Text
                                  className={`font-bold text-xs uppercase ${isActive ? 'text-white' : 'text-zinc-300'}`}
                                  numberOfLines={1}
                                >
                                  {muscleGroup}
                                </Text>
                              </View>
                            </View>
                          </TouchableOpacity>
                        );
                      })}

                    {/* MODO GYM MODULE: Mostrar días del trainingProgram */}
                    {!isExternalMode &&
                      trainingProgram.days.map((day, index) => {
                        const isActive = selectedDayIndex === index;
                        const isCurrent = trainingProgram.currentDayIndex === index;

                        return (
                          <TouchableOpacity
                            key={day.id}
                            onPress={() => {
                              setSelectedDayIndex(index);
                              // BUGFIX: Cargar ejercicios del día seleccionado
                              loadExercises(index, true);
                              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                            }}
                            onLongPress={() => {
                              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
                              Alert.alert(
                                '🗑️ Eliminar día',
                                `¿Eliminar "${day.muscleGroups}" y todos sus ejercicios?`,
                                [
                                  { text: 'Cancelar', style: 'cancel' },
                                  {
                                    text: 'Eliminar',
                                    style: 'destructive',
                                    onPress: async () => {
                                      const deletedDayIndex = index;

                                      // Eliminar el día seleccionado
                                      const updatedDays = trainingProgram.days.filter(
                                        (_, i) => i !== deletedDayIndex
                                      );
                                      const newSelectedIndex =
                                        updatedDays.length > 0
                                          ? Math.min(selectedDayIndex, updatedDays.length - 1)
                                          : 0;

                                      setTrainingProgram((prev) => ({
                                        ...prev,
                                        frequency: updatedDays.length,
                                        days: updatedDays.map((d, i) => ({
                                          ...d,
                                          id: String(i + 1),
                                        })),
                                        currentDayIndex:
                                          updatedDays.length > 0
                                            ? Math.min(prev.currentDayIndex, updatedDays.length - 1)
                                            : 0,
                                      }));
                                      setSelectedDayIndex(newSelectedIndex);

                                      // Actualizar en Supabase
                                      if (user) {
                                        // Reconstruir los nombres de rutina
                                        const updatedNames: Record<string, string> = {};
                                        updatedDays.forEach((d, i) => {
                                          updatedNames[String(i)] = d.muscleGroups;
                                        });

                                        await supabase
                                          .from('profiles')
                                          .update({
                                            training_frequency: updatedDays.length,
                                            training_current_day:
                                              updatedDays.length > 0
                                                ? Math.min(
                                                    trainingProgram.currentDayIndex,
                                                    updatedDays.length - 1
                                                  )
                                                : 0,
                                            training_routine_names: updatedNames,
                                          })
                                          .eq('id', user.id);

                                        // Actualizar training_days de todos los ejercicios del usuario
                                        const { data: userExercises } = await supabase
                                          .from('user_exercise_config')
                                          .select('id, training_days, config')
                                          .eq('user_id', user.id);

                                        if (userExercises) {
                                          for (const ex of userExercises) {
                                            const currentDays: number[] = ex.training_days || [];
                                            // Remover el día eliminado y reindexar días mayores
                                            const newDays = currentDays
                                              .filter((d: number) => d !== deletedDayIndex)
                                              .map((d: number) =>
                                                d > deletedDayIndex ? d - 1 : d
                                              );

                                            // También limpiar series_by_day en config
                                            const config = ex.config || {};
                                            const seriesByDay =
                                              (config.series_by_day as Record<string, unknown>) ||
                                              {};
                                            const newSeriesByDay: Record<string, unknown> = {};

                                            Object.entries(seriesByDay).forEach(
                                              ([dayKey, series]) => {
                                                const dayNum = parseInt(dayKey);
                                                if (dayNum !== deletedDayIndex) {
                                                  const newKey =
                                                    dayNum > deletedDayIndex
                                                      ? String(dayNum - 1)
                                                      : dayKey;
                                                  newSeriesByDay[newKey] = series;
                                                }
                                              }
                                            );

                                            await supabase
                                              .from('user_exercise_config')
                                              .update({
                                                training_days: newDays,
                                                config: {
                                                  ...config,
                                                  series_by_day: newSeriesByDay,
                                                },
                                              })
                                              .eq('id', ex.id);
                                          }
                                        }
                                      }
                                      Haptics.notificationAsync(
                                        Haptics.NotificationFeedbackType.Warning
                                      );
                                      loadExercises(newSelectedIndex);
                                    },
                                  },
                                ]
                              );
                            }}
                            className="mr-2.5 px-4 py-2.5 rounded-xl"
                            style={
                              isActive
                                ? {
                                    backgroundColor: '#F97316',
                                    shadowColor: '#F97316',
                                    shadowOffset: { width: 0, height: 4 },
                                    shadowOpacity: 0.5,
                                    shadowRadius: 12,
                                  }
                                : {
                                    backgroundColor: '#18181b',
                                    borderWidth: 1,
                                    borderColor: '#27272a',
                                  }
                            }
                          >
                            <View className="flex-row items-center gap-2">
                              {/* Day Number Badge */}
                              <View
                                className="w-6 h-6 rounded-lg items-center justify-center"
                                style={{
                                  backgroundColor: isActive ? 'rgba(0,0,0,0.3)' : '#27272a',
                                }}
                              >
                                <Text
                                  className={`font-bold text-xs font-mono ${isActive ? 'text-white' : 'text-zinc-500'}`}
                                >
                                  {index + 1}
                                </Text>
                              </View>
                              <View>
                                <Text
                                  className={`font-bold text-xs uppercase tracking-wide ${
                                    isActive ? 'text-black' : 'text-zinc-300'
                                  }`}
                                  numberOfLines={1}
                                >
                                  {day.muscleGroups}
                                </Text>
                                {isCurrent && (
                                  <Text
                                    className={`text-[8px] font-mono ${isActive ? 'text-black/60' : 'text-green-500'}`}
                                  >
                                    • HOY
                                  </Text>
                                )}
                              </View>
                            </View>
                          </TouchableOpacity>
                        );
                      })}

                    {/* BOTÓN AGREGAR DÍA - En modo GYM y PERSONALIZADO */}
                    <TouchableOpacity
                      onPress={() => {
                        if (trainingProgram.days.length >= 7) {
                          Alert.alert('Límite alcanzado', 'Máximo 7 días de entrenamiento');
                          return;
                        }
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                        setSelectedMuscleGroups([]);
                        setAddDayModalVisible(true);
                      }}
                      className="px-4 py-2.5 rounded-xl border-2 border-dashed items-center justify-center flex-row gap-2"
                      style={{
                        minWidth: 60,
                        borderColor: isExternalMode ? '#a855f750' : '#3f3f46',
                        backgroundColor: isExternalMode ? '#1a0a2e' : 'transparent',
                      }}
                    >
                      <Plus size={16} color={isExternalMode ? '#a855f7' : '#F97316'} />
                      <Text
                        className="font-bold text-xs"
                        style={{ color: isExternalMode ? '#a855f7' : '#F97316' }}
                      >
                        NUEVO
                      </Text>
                    </TouchableOpacity>
                  </ScrollView>
                </View>
              </Animated.View>

              {/* EXERCISES LIST - DRAG & DROP */}
              <GestureHandlerRootView style={{ flex: 1, backgroundColor: '#000000' }}>
                {exercises.length === 0 ? (
                  // Estado vacío - sin scroll
                  <View
                    className="flex-1 justify-center items-center px-4"
                    style={{ backgroundColor: '#000000' }}
                  >
                    {/* Icono principal */}
                    <View
                      className="w-28 h-28 rounded-full items-center justify-center mb-6"
                      style={{
                        backgroundColor: '#0a0000',
                        borderWidth: 2,
                        borderColor: trainingProgram.days.length === 0 ? '#DC2626' : '#F97316',
                        shadowColor: trainingProgram.days.length === 0 ? '#DC2626' : '#F97316',
                        shadowOffset: { width: 0, height: 0 },
                        shadowOpacity: 0.4,
                        shadowRadius: 20,
                      }}
                    >
                      <Zap
                        size={48}
                        color={trainingProgram.days.length === 0 ? '#DC2626' : '#F97316'}
                      />
                    </View>

                    {/* Título y descripción */}
                    <Text className="text-white text-center mb-2 text-xl font-bold">
                      {trainingProgram.days.length === 0
                        ? 'Configura tu Entrenamiento'
                        : 'Sin ejercicios para hoy'}
                    </Text>
                    <Text className="text-zinc-500 text-center mb-8 text-sm px-8 leading-5">
                      {trainingProgram.days.length === 0
                        ? 'Toca el botón + NUEVO arriba para agregar tu primer día de entrenamiento.'
                        : 'Agrega ejercicios a este día para comenzar tu entrenamiento.'}
                    </Text>

                    {/* Botón solo cuando hay días pero no ejercicios */}
                    {trainingProgram.days.length > 0 && (
                      <TouchableOpacity
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                          setModalVisible(true);
                        }}
                        className="py-4 px-8 rounded-2xl flex-row items-center justify-center gap-2"
                        style={{
                          backgroundColor: '#0a0000',
                          borderWidth: 2,
                          borderColor: '#F97316',
                          shadowColor: '#F97316',
                          shadowOffset: { width: 0, height: 4 },
                          shadowOpacity: 0.5,
                          shadowRadius: 16,
                        }}
                      >
                        <Plus size={20} color="#F97316" strokeWidth={2.5} />
                        <Text className="text-fire-orange font-bold text-base">
                          Agregar Ejercicio
                        </Text>
                      </TouchableOpacity>
                    )}

                    {/* Texto secundario - solo cuando no hay días */}
                    {trainingProgram.days.length === 0 && (
                      <View className="flex-row items-center gap-2 mt-4">
                        <Plus size={14} color="#F97316" />
                        <Text className="text-zinc-600 text-xs">
                          Usa el botón NUEVO en la barra de días
                        </Text>
                      </View>
                    )}
                  </View>
                ) : (
                  // Lista de ejercicios - con scroll
                  <ScrollView
                    className="flex-1 px-4 pt-3"
                    showsVerticalScrollIndicator={false}
                    scrollEnabled={!isDraggingExercise}
                  >
                    <>
                      {/* Header de lista con consejos */}
                      <View className="mb-3 px-1">
                        <View className="flex-row items-center justify-between mb-2">
                          <View className="flex-row items-center gap-2">
                            <View className="w-2 h-2 rounded-full bg-fire-orange" />
                            <Text className="text-zinc-400 text-xs font-bold uppercase tracking-wider">
                              {exercises.length} EJERCICIO{exercises.length !== 1 ? 'S' : ''}
                            </Text>
                          </View>
                        </View>
                        {/* Tips */}
                        <View className="flex-row flex-wrap gap-x-3 gap-y-1">
                          <Text className="text-zinc-600 text-[9px] font-mono">
                            👆 Toca para editar
                          </Text>
                          <Text className="text-zinc-600 text-[9px] font-mono">
                            👈 Desliza para eliminar
                          </Text>
                          <Text className="text-zinc-600 text-[9px] font-mono">
                            ✊ Mantén para reordenar
                          </Text>
                        </View>
                      </View>

                      {/* Lista de ejercicios arrastrables */}
                      {exercises.map((item, index) => {
                        // Calcular offset de animación basado en la posición del drag
                        const ITEM_HEIGHT = 88;
                        const getAnimatedOffset = (): number => {
                          if (
                            !isDraggingExercise ||
                            dragTargetIndex === null ||
                            draggingFromIndex === null
                          )
                            return 0;
                          if (index === draggingFromIndex) return 0; // El item arrastrado no necesita offset

                          // Si el target está DESPUÉS del origen (arrastrando hacia abajo)
                          if (dragTargetIndex > draggingFromIndex) {
                            // Los items entre origen+1 y target deben subir
                            if (index > draggingFromIndex && index <= dragTargetIndex) {
                              return -ITEM_HEIGHT;
                            }
                          }
                          // Si el target está ANTES del origen (arrastrando hacia arriba)
                          else if (dragTargetIndex < draggingFromIndex) {
                            // Los items entre target y origen-1 deben bajar
                            if (index >= dragTargetIndex && index < draggingFromIndex) {
                              return ITEM_HEIGHT;
                            }
                          }
                          return 0;
                        };

                        const offset = getAnimatedOffset();

                        return (
                          <AnimatedExerciseItem
                            key={item.id}
                            offset={offset}
                            isDragging={draggingFromIndex === index}
                          >
                            <DraggableExerciseCard
                              exercise={item}
                              index={index}
                              totalItems={exercises.length}
                              onEdit={async () => {
                                // NUEVA ARQUITECTURA: Cargar config del ejercicio para editarlo
                                const { data } = await supabase
                                  .from('user_exercise_config')
                                  .select(
                                    `
                          id,
                          config,
                          custom_media_url,
                          exercises:exercise_id (
                            id,
                            name,
                            description,
                            muscle_group,
                            difficulty,
                            default_media_url
                          )
                        `
                                  )
                                  .eq('id', item.id)
                                  .single();

                                if (data) {
                                  const exerciseInfo = data.exercises as unknown as {
                                    id: string;
                                    name: string;
                                    description: string | null;
                                    muscle_group: string | null;
                                    difficulty: string | null;
                                    default_media_url: string | null;
                                  } | null;

                                  const template: AssetTemplate = {
                                    id: data.id,
                                    name: exerciseInfo?.name || item.name,
                                    description: exerciseInfo?.description || '',
                                    image_url:
                                      data.custom_media_url ||
                                      exerciseInfo?.default_media_url ||
                                      '',
                                    category: exerciseInfo?.muscle_group || 'OTRO',
                                    difficulty: exerciseInfo?.difficulty || 'INTERMEDIO',
                                    default_metadata: data.config || {},
                                  };

                                  const seriesByDay = data.config?.series_by_day as
                                    | Record<string, SeriesConfig[]>
                                    | undefined;
                                  const existingSeries: SeriesConfig[] =
                                    seriesByDay?.[String(selectedDayIndex)] ||
                                    (data.config?.custom_series as SeriesConfig[] | undefined) ||
                                    [];
                                  setSeriesConfig(existingSeries);
                                  setSelectedTemplate(template);
                                  // NO viene del catálogo, viene de editar ejercicio existente
                                  setSeriesConfigFromCatalog(false);
                                  seriesConfigFromCatalogRef.current = false;
                                  // BUGFIX: Capturar el día actual al abrir el modal
                                  setSeriesConfigDayIndex(selectedDayIndex);
                                  setSeriesConfigModalVisible(true);
                                }
                              }}
                              onDelete={() => deleteExercise(item.id)}
                              onDragStart={() => {
                                setIsDraggingExercise(true);
                                setDraggingFromIndex(index);
                              }}
                              onDragEnd={(newIndex) => {
                                setIsDraggingExercise(false);
                                setDragTargetIndex(null);
                                setDraggingFromIndex(null);
                                reorderExercises(index, newIndex);
                              }}
                              onDragCancel={() => {
                                setIsDraggingExercise(false);
                                setDragTargetIndex(null);
                                setDraggingFromIndex(null);
                              }}
                              onPositionChange={(targetIndex) => setDragTargetIndex(targetIndex)}
                              itemHeight={88}
                            />
                          </AnimatedExerciseItem>
                        );
                      })}

                      {/* BOTÓN AGREGAR EJERCICIO - Dentro del scroll */}
                      <TouchableOpacity
                        onPress={() => setModalVisible(true)}
                        disabled={trainingProgram.days.length === 0}
                        className="mt-2 mb-4 p-4 rounded-xl items-center flex-row justify-center gap-2"
                        style={{
                          borderWidth: 2,
                          borderColor: trainingProgram.days.length === 0 ? '#3f3f46' : '#F97316',
                          backgroundColor:
                            trainingProgram.days.length === 0 ? '#18181b' : '#0a0500',
                          borderStyle: 'dashed',
                        }}
                      >
                        <Plus
                          color={trainingProgram.days.length === 0 ? '#71717a' : '#F97316'}
                          size={18}
                        />
                        <Text
                          className={`font-bold text-sm tracking-wider ${
                            trainingProgram.days.length === 0 ? 'text-zinc-500' : 'text-fire-orange'
                          }`}
                        >
                          AGREGAR EJERCICIO
                        </Text>
                      </TouchableOpacity>
                    </>
                  </ScrollView>
                )}
              </GestureHandlerRootView>

              {/* CATALOG MODAL */}
              {renderCatalogModal()}
              {renderSeriesConfigModal()}

              {/* DAY NAME EDIT MODAL */}
              <Modal
                visible={dayNameModalVisible}
                transparent
                animationType="fade"
                onRequestClose={() => setDayNameModalVisible(false)}
              >
                <Pressable
                  className="flex-1 bg-black/80 justify-center items-center p-4"
                  onPress={() => setDayNameModalVisible(false)}
                >
                  <Pressable
                    className="bg-zinc-900 rounded-xl p-5 w-full border border-zinc-800"
                    onPress={(e) => e.stopPropagation()}
                  >
                    <Text className="text-white text-lg font-bold mb-3">Renombrar rutina</Text>
                    <TextInput
                      value={editingDayName}
                      onChangeText={setEditingDayName}
                      placeholder="Ej: PECHO + ESPALDA"
                      placeholderTextColor="#71717A"
                      autoCapitalize="characters"
                      className="bg-black border border-zinc-700 rounded-lg px-3 py-2.5 text-white text-sm font-bold mb-3"
                      autoFocus
                    />
                    <View className="flex-row gap-2">
                      <TouchableOpacity
                        onPress={() => setDayNameModalVisible(false)}
                        className="flex-1 py-2.5 rounded-lg border border-zinc-700"
                      >
                        <Text className="text-zinc-400 text-center font-bold text-sm">
                          Cancelar
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => {
                          if (editingDayIndex !== null) {
                            saveDayName(editingDayIndex, editingDayName);
                          }
                          setDayNameModalVisible(false);
                        }}
                        className="flex-1 py-2.5 rounded-lg bg-savage-red"
                      >
                        <Text className="text-white text-center font-bold text-sm">Guardar</Text>
                      </TouchableOpacity>
                    </View>
                  </Pressable>
                </Pressable>
              </Modal>

              {/* MODAL AGREGAR DÍA - SELECCIÓN DE GRUPOS MUSCULARES */}
              <Modal
                visible={addDayModalVisible}
                transparent
                animationType="slide"
                onRequestClose={() => {
                  setAddDayModalVisible(false);
                  setSelectedMuscleGroups([]);
                }}
              >
                <View className="flex-1 bg-transparent justify-end">
                  <Animated.View
                    style={[
                      {
                        height: '85%',
                        backgroundColor: '#0a0a0a',
                        borderTopLeftRadius: 24,
                        borderTopRightRadius: 24,
                        borderTopWidth: 2,
                        borderTopColor: 'rgba(249, 115, 22, 0.5)',
                        overflow: 'hidden',
                      },
                      animatedStyleAddDay,
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
                        backgroundColor: '#F97316',
                        shadowColor: '#F97316',
                        shadowOffset: { width: 0, height: 0 },
                        shadowOpacity: 0.8,
                        shadowRadius: 10,
                        zIndex: 10,
                      }}
                    />

                    {/* Header - Draggable para cerrar */}
                    <View
                      {...panResponderAddDay.panHandlers}
                      className="px-5 pt-6 pb-4 border-b border-zinc-900"
                    >
                      {/* Indicador de drag centrado arriba */}
                      <View className="absolute top-2 left-0 right-0 items-center">
                        <View className="w-12 h-1.5 bg-zinc-600 rounded-full" />
                      </View>

                      <View className="items-center mt-2">
                        <Text className="text-white text-xl font-bold">🔥 NUEVO DÍA</Text>
                        <Text className="text-zinc-500 text-xs mt-0.5">
                          Selecciona los grupos musculares
                        </Text>
                      </View>
                    </View>

                    {/* Contenido */}
                    <View className="flex-1 px-5 pt-4">
                      {/* Grupos seleccionados */}
                      {selectedMuscleGroups.length > 0 && (
                        <View className="bg-zinc-900/80 rounded-xl p-3 mb-4 border border-fire-orange/30">
                          <Text className="text-fire-orange font-bold text-xs mb-1">
                            TU SELECCIÓN:
                          </Text>
                          <Text className="text-white font-bold">
                            {selectedMuscleGroups.join(' + ')}
                          </Text>
                        </View>
                      )}

                      {/* Grid de grupos musculares por categorías */}
                      <ScrollView
                        showsVerticalScrollIndicator={false}
                        className="flex-1 mb-4"
                        contentContainerStyle={{ paddingBottom: 20 }}
                      >
                        {/* TORSO */}
                        <View
                          className="mb-4 rounded-xl p-3"
                          style={{
                            backgroundColor: '#0a0a0a',
                            borderWidth: 1,
                            borderColor: '#ef444450',
                          }}
                        >
                          <Text className="text-xs font-bold mb-2" style={{ color: '#ef4444' }}>
                            💪 TORSO
                          </Text>
                          <View className="flex-row flex-wrap gap-2">
                            {MUSCLE_GROUPS.filter((g) => g.category === 'superior').map((group) => {
                              const isSelected = selectedMuscleGroups.includes(group.name);
                              return (
                                <TouchableOpacity
                                  key={group.id}
                                  onPress={() => {
                                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                    if (isSelected) {
                                      setSelectedMuscleGroups((prev) =>
                                        prev.filter((g) => g !== group.name)
                                      );
                                    } else {
                                      setSelectedMuscleGroups((prev) => [...prev, group.name]);
                                    }
                                  }}
                                  className="px-3 py-2 rounded-lg"
                                  style={{
                                    backgroundColor: isSelected ? '#ef4444' : '#18181b',
                                    borderWidth: 1,
                                    borderColor: isSelected ? '#ef4444' : '#27272a',
                                  }}
                                >
                                  <Text
                                    className="font-bold text-xs"
                                    style={{ color: isSelected ? '#000' : '#a1a1aa' }}
                                  >
                                    {group.name}
                                  </Text>
                                </TouchableOpacity>
                              );
                            })}
                          </View>
                        </View>

                        {/* HOMBROS */}
                        <View
                          className="mb-4 rounded-xl p-3"
                          style={{
                            backgroundColor: '#0a0a0a',
                            borderWidth: 1,
                            borderColor: '#f59e0b50',
                          }}
                        >
                          <Text className="text-xs font-bold mb-2" style={{ color: '#f59e0b' }}>
                            🎯 HOMBROS
                          </Text>
                          <View className="flex-row flex-wrap gap-2">
                            {MUSCLE_GROUPS.filter((g) => g.category === 'hombros').map((group) => {
                              const isSelected = selectedMuscleGroups.includes(group.name);
                              return (
                                <TouchableOpacity
                                  key={group.id}
                                  onPress={() => {
                                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                    if (isSelected) {
                                      setSelectedMuscleGroups((prev) =>
                                        prev.filter((g) => g !== group.name)
                                      );
                                    } else {
                                      setSelectedMuscleGroups((prev) => [...prev, group.name]);
                                    }
                                  }}
                                  className="px-3 py-2 rounded-lg"
                                  style={{
                                    backgroundColor: isSelected ? '#f59e0b' : '#18181b',
                                    borderWidth: 1,
                                    borderColor: isSelected ? '#f59e0b' : '#27272a',
                                  }}
                                >
                                  <Text
                                    className="font-bold text-xs"
                                    style={{ color: isSelected ? '#000' : '#a1a1aa' }}
                                  >
                                    {group.name}
                                  </Text>
                                </TouchableOpacity>
                              );
                            })}
                          </View>
                        </View>

                        {/* BRAZOS */}
                        <View
                          className="mb-4 rounded-xl p-3"
                          style={{
                            backgroundColor: '#0a0a0a',
                            borderWidth: 1,
                            borderColor: '#10b98150',
                          }}
                        >
                          <Text className="text-xs font-bold mb-2" style={{ color: '#10b981' }}>
                            💪 BRAZOS
                          </Text>
                          <View className="flex-row flex-wrap gap-2">
                            {MUSCLE_GROUPS.filter((g) => g.category === 'brazos').map((group) => {
                              const isSelected = selectedMuscleGroups.includes(group.name);
                              return (
                                <TouchableOpacity
                                  key={group.id}
                                  onPress={() => {
                                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                    if (isSelected) {
                                      setSelectedMuscleGroups((prev) =>
                                        prev.filter((g) => g !== group.name)
                                      );
                                    } else {
                                      setSelectedMuscleGroups((prev) => [...prev, group.name]);
                                    }
                                  }}
                                  className="px-3 py-2 rounded-lg"
                                  style={{
                                    backgroundColor: isSelected ? '#10b981' : '#18181b',
                                    borderWidth: 1,
                                    borderColor: isSelected ? '#10b981' : '#27272a',
                                  }}
                                >
                                  <Text
                                    className="font-bold text-xs"
                                    style={{ color: isSelected ? '#000' : '#a1a1aa' }}
                                  >
                                    {group.name}
                                  </Text>
                                </TouchableOpacity>
                              );
                            })}
                          </View>
                        </View>

                        {/* PIERNAS */}
                        <View
                          className="mb-4 rounded-xl p-3"
                          style={{
                            backgroundColor: '#0a0a0a',
                            borderWidth: 1,
                            borderColor: '#ec489950',
                          }}
                        >
                          <Text className="text-xs font-bold mb-2" style={{ color: '#ec4899' }}>
                            🦵 PIERNAS
                          </Text>
                          <View className="flex-row flex-wrap gap-2">
                            {MUSCLE_GROUPS.filter((g) => g.category === 'piernas').map((group) => {
                              const isSelected = selectedMuscleGroups.includes(group.name);
                              return (
                                <TouchableOpacity
                                  key={group.id}
                                  onPress={() => {
                                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                    if (isSelected) {
                                      setSelectedMuscleGroups((prev) =>
                                        prev.filter((g) => g !== group.name)
                                      );
                                    } else {
                                      setSelectedMuscleGroups((prev) => [...prev, group.name]);
                                    }
                                  }}
                                  className="px-3 py-2 rounded-lg"
                                  style={{
                                    backgroundColor: isSelected ? '#ec4899' : '#18181b',
                                    borderWidth: 1,
                                    borderColor: isSelected ? '#ec4899' : '#27272a',
                                  }}
                                >
                                  <Text
                                    className="font-bold text-xs"
                                    style={{ color: isSelected ? '#000' : '#a1a1aa' }}
                                  >
                                    {group.name}
                                  </Text>
                                </TouchableOpacity>
                              );
                            })}
                          </View>
                        </View>

                        {/* CORE */}
                        <View
                          className="mb-4 rounded-xl p-3"
                          style={{
                            backgroundColor: '#0a0a0a',
                            borderWidth: 1,
                            borderColor: '#eab30850',
                          }}
                        >
                          <Text className="text-xs font-bold mb-2" style={{ color: '#eab308' }}>
                            🔥 CORE
                          </Text>
                          <View className="flex-row flex-wrap gap-2">
                            {MUSCLE_GROUPS.filter((g) => g.category === 'core').map((group) => {
                              const isSelected = selectedMuscleGroups.includes(group.name);
                              return (
                                <TouchableOpacity
                                  key={group.id}
                                  onPress={() => {
                                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                    if (isSelected) {
                                      setSelectedMuscleGroups((prev) =>
                                        prev.filter((g) => g !== group.name)
                                      );
                                    } else {
                                      setSelectedMuscleGroups((prev) => [...prev, group.name]);
                                    }
                                  }}
                                  className="px-3 py-2 rounded-lg"
                                  style={{
                                    backgroundColor: isSelected ? '#eab308' : '#18181b',
                                    borderWidth: 1,
                                    borderColor: isSelected ? '#eab308' : '#27272a',
                                  }}
                                >
                                  <Text
                                    className="font-bold text-xs"
                                    style={{ color: isSelected ? '#000' : '#a1a1aa' }}
                                  >
                                    {group.name}
                                  </Text>
                                </TouchableOpacity>
                              );
                            })}
                          </View>
                        </View>

                        {/* ESPECIALES */}
                        <View
                          className="mb-2 rounded-xl p-3"
                          style={{
                            backgroundColor: '#0a0a0a',
                            borderWidth: 1,
                            borderColor: '#06b6d450',
                          }}
                        >
                          <Text className="text-xs font-bold mb-2" style={{ color: '#06b6d4' }}>
                            ⚡ ESPECIALES
                          </Text>
                          <View className="flex-row flex-wrap gap-2">
                            {MUSCLE_GROUPS.filter(
                              (g) => g.category === 'cardio' || g.category === 'especial'
                            ).map((group) => {
                              const isSelected = selectedMuscleGroups.includes(group.name);
                              return (
                                <TouchableOpacity
                                  key={group.id}
                                  onPress={() => {
                                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                    if (isSelected) {
                                      setSelectedMuscleGroups((prev) =>
                                        prev.filter((g) => g !== group.name)
                                      );
                                    } else {
                                      setSelectedMuscleGroups((prev) => [...prev, group.name]);
                                    }
                                  }}
                                  className="px-3 py-2 rounded-lg"
                                  style={{
                                    backgroundColor: isSelected ? '#06b6d4' : '#18181b',
                                    borderWidth: 1,
                                    borderColor: isSelected ? '#06b6d4' : '#27272a',
                                  }}
                                >
                                  <Text
                                    className="font-bold text-xs"
                                    style={{ color: isSelected ? '#000' : '#a1a1aa' }}
                                  >
                                    {group.name}
                                  </Text>
                                </TouchableOpacity>
                              );
                            })}
                          </View>
                        </View>
                      </ScrollView>

                      {/* Botón crear - con safe area */}
                      <View style={{ paddingBottom: insets.bottom + 16 }}>
                        <TouchableOpacity
                          onPress={async () => {
                            if (selectedMuscleGroups.length === 0) {
                              Alert.alert(
                                'Selección requerida',
                                'Elige al menos un grupo muscular'
                              );
                              return;
                            }

                            const newDayIndex = trainingProgram.days.length;
                            const muscleGroupsName = selectedMuscleGroups.join(' + ');
                            const newDay = {
                              id: String(newDayIndex + 1),
                              muscleGroups: muscleGroupsName,
                              exercises: [],
                            };

                            // Actualizar estado local
                            const updatedDays = [...trainingProgram.days, newDay];
                            setTrainingProgram((prev) => ({
                              ...prev,
                              frequency: updatedDays.length,
                              days: updatedDays,
                            }));

                            // Guardar en Supabase
                            if (user) {
                              const { data: profile } = await supabase
                                .from('profiles')
                                .select('training_routine_names')
                                .eq('id', user.id)
                                .single();

                              const currentNames = profile?.training_routine_names || {};
                              const updatedNames = {
                                ...currentNames,
                                [String(newDayIndex)]: muscleGroupsName,
                              };

                              // Actualizar profiles con el nuevo día
                              await supabase
                                .from('profiles')
                                .update({
                                  training_frequency: updatedDays.length,
                                  training_routine_names: updatedNames,
                                  plan_source: 'custom', // Marcar como plan personalizado
                                })
                                .eq('id', user.id);

                              // ACTIVAR MODO PERSONALIZADO: Sincronizar con user_profiles
                              // Construir external_schedule desde los días actualizados
                              const newExternalSchedule: Record<string, string> = {};
                              updatedDays.forEach((day, idx) => {
                                newExternalSchedule[`Día ${idx + 1}`] = day.muscleGroups;
                              });

                              // Usar upsert para garantizar que la fila exista
                              const { error: upsertError } = await supabase
                                .from('user_profiles')
                                .upsert(
                                  {
                                    user_id: user.id,
                                    training_mode: 'external',
                                    external_schedule: newExternalSchedule,
                                    training_days_per_week: updatedDays.length,
                                  },
                                  { onConflict: 'user_id' }
                                );

                              if (upsertError) {
                                console.error(
                                  '❌ Error guardando modo personalizado:',
                                  upsertError
                                );
                              } else {
                                console.warn(
                                  '✅ Modo personalizado guardado:',
                                  newExternalSchedule
                                );
                              }

                              // Actualizar estado local
                              setIsExternalMode(true);
                              setExternalSchedule(newExternalSchedule);
                            }

                            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                            setAddDayModalVisible(false);
                            setSelectedMuscleGroups([]);

                            // Seleccionar el nuevo día y cargar sus ejercicios
                            setSelectedDayIndex(newDayIndex);
                            // BUGFIX: Cargar ejercicios del nuevo día (será vacío pero prepara el estado)
                            loadExercises(newDayIndex, true);
                          }}
                          disabled={selectedMuscleGroups.length === 0}
                          className={`py-4 rounded-xl ${
                            selectedMuscleGroups.length > 0 ? 'bg-fire-orange' : 'bg-zinc-800'
                          }`}
                          style={
                            selectedMuscleGroups.length > 0
                              ? {
                                  shadowColor: '#F97316',
                                  shadowOffset: { width: 0, height: 4 },
                                  shadowOpacity: 0.5,
                                  shadowRadius: 12,
                                }
                              : {}
                          }
                        >
                          <Text
                            className={`text-center font-bold text-base ${
                              selectedMuscleGroups.length > 0 ? 'text-black' : 'text-zinc-500'
                            }`}
                          >
                            {selectedMuscleGroups.length > 0
                              ? `🔥 CREAR DÍA ${trainingProgram.days.length + 1}`
                              : 'SELECCIONA GRUPOS MUSCULARES'}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </Animated.View>
                </View>
              </Modal>
              {/* Fin del Modal addDayModal - MOVIDO A renderAddDayModal */}
            </View>
            {/* Fin del contenido scrolleable */}
          </Animated.View>
        </View>
      </Modal>
    );
  };

  // ============================================================================
  // RENDER ADD DAY MODAL - Modal separado para agregar día
  // ============================================================================
  const renderAddDayModal = () => {
    return (
      <Modal
        visible={addDayModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => {
          setAddDayModalVisible(false);
          setSelectedMuscleGroups([]);
        }}
      >
        <View className="flex-1 bg-black/80 justify-end">
          <Animated.View
            style={[
              {
                height: '85%',
                backgroundColor: '#0a0a0a',
                borderTopLeftRadius: 24,
                borderTopRightRadius: 24,
                borderTopWidth: 2,
                borderTopColor: 'rgba(249, 115, 22, 0.5)',
                overflow: 'hidden',
              },
              animatedStyleAddDay,
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
                backgroundColor: '#F97316',
                shadowColor: '#F97316',
                shadowOffset: { width: 0, height: 0 },
                shadowOpacity: 0.8,
                shadowRadius: 10,
                zIndex: 10,
              }}
            />

            {/* Header - Draggable para cerrar */}
            <View
              {...panResponderAddDay.panHandlers}
              className="px-5 pt-6 pb-4 border-b border-zinc-900"
            >
              {/* Indicador de drag centrado arriba */}
              <View className="absolute top-2 left-0 right-0 items-center">
                <View className="w-12 h-1.5 bg-zinc-600 rounded-full" />
              </View>

              <View className="items-center mt-2">
                <Text className="text-white text-xl font-bold">🔥 NUEVO DÍA</Text>
                <Text className="text-zinc-500 text-xs mt-0.5">
                  Selecciona los grupos musculares
                </Text>
              </View>
            </View>

            {/* Contenido */}
            <View className="flex-1 px-5 pt-4">
              {/* Grupos seleccionados */}
              {selectedMuscleGroups.length > 0 && (
                <View className="bg-zinc-900/80 rounded-xl p-3 mb-4 border border-fire-orange/30">
                  <Text className="text-fire-orange font-bold text-xs mb-1">TU SELECCIÓN:</Text>
                  <Text className="text-white font-bold">{selectedMuscleGroups.join(' + ')}</Text>
                </View>
              )}

              {/* Grid de grupos musculares por categorías */}
              <ScrollView
                showsVerticalScrollIndicator={false}
                className="flex-1 mb-4"
                contentContainerStyle={{ paddingBottom: 20 }}
              >
                {/* TORSO */}
                <View
                  className="mb-4 rounded-xl p-3"
                  style={{
                    backgroundColor: '#0a0a0a',
                    borderWidth: 1,
                    borderColor: '#ef444450',
                  }}
                >
                  <Text className="text-xs font-bold mb-2" style={{ color: '#ef4444' }}>
                    💪 TORSO
                  </Text>
                  <View className="flex-row flex-wrap gap-2">
                    {MUSCLE_GROUPS.filter((g) => g.category === 'superior').map((group) => {
                      const isSelected = selectedMuscleGroups.includes(group.name);
                      return (
                        <TouchableOpacity
                          key={group.id}
                          onPress={() => {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            if (isSelected) {
                              setSelectedMuscleGroups((prev) =>
                                prev.filter((g) => g !== group.name)
                              );
                            } else {
                              setSelectedMuscleGroups((prev) => [...prev, group.name]);
                            }
                          }}
                          className="px-3 py-2 rounded-lg"
                          style={{
                            backgroundColor: isSelected ? '#ef4444' : '#18181b',
                            borderWidth: 1,
                            borderColor: isSelected ? '#ef4444' : '#27272a',
                          }}
                        >
                          <Text
                            className="font-bold text-xs"
                            style={{ color: isSelected ? '#000' : '#a1a1aa' }}
                          >
                            {group.name}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>

                {/* HOMBROS */}
                <View
                  className="mb-4 rounded-xl p-3"
                  style={{
                    backgroundColor: '#0a0a0a',
                    borderWidth: 1,
                    borderColor: '#f59e0b50',
                  }}
                >
                  <Text className="text-xs font-bold mb-2" style={{ color: '#f59e0b' }}>
                    🎯 HOMBROS
                  </Text>
                  <View className="flex-row flex-wrap gap-2">
                    {MUSCLE_GROUPS.filter((g) => g.category === 'hombros').map((group) => {
                      const isSelected = selectedMuscleGroups.includes(group.name);
                      return (
                        <TouchableOpacity
                          key={group.id}
                          onPress={() => {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            if (isSelected) {
                              setSelectedMuscleGroups((prev) =>
                                prev.filter((g) => g !== group.name)
                              );
                            } else {
                              setSelectedMuscleGroups((prev) => [...prev, group.name]);
                            }
                          }}
                          className="px-3 py-2 rounded-lg"
                          style={{
                            backgroundColor: isSelected ? '#f59e0b' : '#18181b',
                            borderWidth: 1,
                            borderColor: isSelected ? '#f59e0b' : '#27272a',
                          }}
                        >
                          <Text
                            className="font-bold text-xs"
                            style={{ color: isSelected ? '#000' : '#a1a1aa' }}
                          >
                            {group.name}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>

                {/* BRAZOS */}
                <View
                  className="mb-4 rounded-xl p-3"
                  style={{
                    backgroundColor: '#0a0a0a',
                    borderWidth: 1,
                    borderColor: '#10b98150',
                  }}
                >
                  <Text className="text-xs font-bold mb-2" style={{ color: '#10b981' }}>
                    💪 BRAZOS
                  </Text>
                  <View className="flex-row flex-wrap gap-2">
                    {MUSCLE_GROUPS.filter((g) => g.category === 'brazos').map((group) => {
                      const isSelected = selectedMuscleGroups.includes(group.name);
                      return (
                        <TouchableOpacity
                          key={group.id}
                          onPress={() => {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            if (isSelected) {
                              setSelectedMuscleGroups((prev) =>
                                prev.filter((g) => g !== group.name)
                              );
                            } else {
                              setSelectedMuscleGroups((prev) => [...prev, group.name]);
                            }
                          }}
                          className="px-3 py-2 rounded-lg"
                          style={{
                            backgroundColor: isSelected ? '#10b981' : '#18181b',
                            borderWidth: 1,
                            borderColor: isSelected ? '#10b981' : '#27272a',
                          }}
                        >
                          <Text
                            className="font-bold text-xs"
                            style={{ color: isSelected ? '#000' : '#a1a1aa' }}
                          >
                            {group.name}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>

                {/* PIERNAS */}
                <View
                  className="mb-4 rounded-xl p-3"
                  style={{
                    backgroundColor: '#0a0a0a',
                    borderWidth: 1,
                    borderColor: '#ec489950',
                  }}
                >
                  <Text className="text-xs font-bold mb-2" style={{ color: '#ec4899' }}>
                    🦵 PIERNAS
                  </Text>
                  <View className="flex-row flex-wrap gap-2">
                    {MUSCLE_GROUPS.filter((g) => g.category === 'piernas').map((group) => {
                      const isSelected = selectedMuscleGroups.includes(group.name);
                      return (
                        <TouchableOpacity
                          key={group.id}
                          onPress={() => {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            if (isSelected) {
                              setSelectedMuscleGroups((prev) =>
                                prev.filter((g) => g !== group.name)
                              );
                            } else {
                              setSelectedMuscleGroups((prev) => [...prev, group.name]);
                            }
                          }}
                          className="px-3 py-2 rounded-lg"
                          style={{
                            backgroundColor: isSelected ? '#ec4899' : '#18181b',
                            borderWidth: 1,
                            borderColor: isSelected ? '#ec4899' : '#27272a',
                          }}
                        >
                          <Text
                            className="font-bold text-xs"
                            style={{ color: isSelected ? '#000' : '#a1a1aa' }}
                          >
                            {group.name}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>

                {/* CORE */}
                <View
                  className="mb-4 rounded-xl p-3"
                  style={{
                    backgroundColor: '#0a0a0a',
                    borderWidth: 1,
                    borderColor: '#eab30850',
                  }}
                >
                  <Text className="text-xs font-bold mb-2" style={{ color: '#eab308' }}>
                    🔥 CORE
                  </Text>
                  <View className="flex-row flex-wrap gap-2">
                    {MUSCLE_GROUPS.filter((g) => g.category === 'core').map((group) => {
                      const isSelected = selectedMuscleGroups.includes(group.name);
                      return (
                        <TouchableOpacity
                          key={group.id}
                          onPress={() => {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            if (isSelected) {
                              setSelectedMuscleGroups((prev) =>
                                prev.filter((g) => g !== group.name)
                              );
                            } else {
                              setSelectedMuscleGroups((prev) => [...prev, group.name]);
                            }
                          }}
                          className="px-3 py-2 rounded-lg"
                          style={{
                            backgroundColor: isSelected ? '#eab308' : '#18181b',
                            borderWidth: 1,
                            borderColor: isSelected ? '#eab308' : '#27272a',
                          }}
                        >
                          <Text
                            className="font-bold text-xs"
                            style={{ color: isSelected ? '#000' : '#a1a1aa' }}
                          >
                            {group.name}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>

                {/* ESPECIALES */}
                <View
                  className="mb-2 rounded-xl p-3"
                  style={{
                    backgroundColor: '#0a0a0a',
                    borderWidth: 1,
                    borderColor: '#06b6d450',
                  }}
                >
                  <Text className="text-xs font-bold mb-2" style={{ color: '#06b6d4' }}>
                    ⚡ ESPECIALES
                  </Text>
                  <View className="flex-row flex-wrap gap-2">
                    {MUSCLE_GROUPS.filter(
                      (g) => g.category === 'cardio' || g.category === 'especial'
                    ).map((group) => {
                      const isSelected = selectedMuscleGroups.includes(group.name);
                      return (
                        <TouchableOpacity
                          key={group.id}
                          onPress={() => {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            if (isSelected) {
                              setSelectedMuscleGroups((prev) =>
                                prev.filter((g) => g !== group.name)
                              );
                            } else {
                              setSelectedMuscleGroups((prev) => [...prev, group.name]);
                            }
                          }}
                          className="px-3 py-2 rounded-lg"
                          style={{
                            backgroundColor: isSelected ? '#06b6d4' : '#18181b',
                            borderWidth: 1,
                            borderColor: isSelected ? '#06b6d4' : '#27272a',
                          }}
                        >
                          <Text
                            className="font-bold text-xs"
                            style={{ color: isSelected ? '#000' : '#a1a1aa' }}
                          >
                            {group.name}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              </ScrollView>

              {/* Botón crear - con safe area */}
              <View style={{ paddingBottom: insets.bottom + 16 }}>
                <TouchableOpacity
                  onPress={async () => {
                    if (selectedMuscleGroups.length === 0) {
                      Alert.alert('Selección requerida', 'Elige al menos un grupo muscular');
                      return;
                    }

                    const newDayIndex = trainingProgram.days.length;
                    const muscleGroupsName = selectedMuscleGroups.join(' + ');
                    const newDay = {
                      id: String(newDayIndex + 1),
                      muscleGroups: muscleGroupsName,
                      exercises: [],
                    };

                    // Actualizar estado local
                    const updatedDays = [...trainingProgram.days, newDay];
                    setTrainingProgram((prev) => ({
                      ...prev,
                      frequency: updatedDays.length,
                      days: updatedDays,
                    }));

                    // Guardar en Supabase
                    if (user) {
                      const { data: profile } = await supabase
                        .from('profiles')
                        .select('training_routine_names')
                        .eq('id', user.id)
                        .single();

                      const currentNames = profile?.training_routine_names || {};
                      const updatedNames = {
                        ...currentNames,
                        [String(newDayIndex)]: muscleGroupsName,
                      };

                      // Actualizar profiles con el nuevo día
                      await supabase
                        .from('profiles')
                        .update({
                          training_frequency: updatedDays.length,
                          training_routine_names: updatedNames,
                          plan_source: 'custom',
                        })
                        .eq('id', user.id);

                      // ACTIVAR MODO PERSONALIZADO
                      const newExternalSchedule: Record<string, string> = {};
                      updatedDays.forEach((day, idx) => {
                        newExternalSchedule[`Día ${idx + 1}`] = day.muscleGroups;
                      });

                      const { error: upsertError } = await supabase.from('user_profiles').upsert(
                        {
                          user_id: user.id,
                          training_mode: 'external',
                          external_schedule: newExternalSchedule,
                          training_days_per_week: updatedDays.length,
                        },
                        { onConflict: 'user_id' }
                      );

                      if (upsertError) {
                        console.error('❌ Error guardando modo personalizado:', upsertError);
                      } else {
                        console.warn('✅ Modo personalizado guardado:', newExternalSchedule);
                      }

                      setIsExternalMode(true);
                      setExternalSchedule(newExternalSchedule);
                    }

                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                    setAddDayModalVisible(false);
                    setSelectedMuscleGroups([]);

                    // Seleccionar el nuevo día y cargar sus ejercicios
                    setSelectedDayIndex(newDayIndex);
                    loadExercises(newDayIndex, true);
                  }}
                  disabled={selectedMuscleGroups.length === 0}
                  className={`py-4 rounded-xl ${
                    selectedMuscleGroups.length > 0 ? 'bg-fire-orange' : 'bg-zinc-800'
                  }`}
                  style={
                    selectedMuscleGroups.length > 0
                      ? {
                          shadowColor: '#F97316',
                          shadowOffset: { width: 0, height: 4 },
                          shadowOpacity: 0.5,
                          shadowRadius: 12,
                        }
                      : {}
                  }
                >
                  <Text
                    className={`text-center font-bold text-base ${
                      selectedMuscleGroups.length > 0 ? 'text-black' : 'text-zinc-500'
                    }`}
                  >
                    {selectedMuscleGroups.length > 0
                      ? `🔥 CREAR DÍA ${trainingProgram.days.length + 1}`
                      : 'SELECCIONA GRUPOS MUSCULARES'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </Animated.View>
        </View>
      </Modal>
    );
  };

  // ============================================================================
  // RENDER MODALS
  // ============================================================================

  // Constantes para tags de ejercicios
  const EXERCISE_TAGS = [
    { key: 'PR', label: '🔥 PR', color: '#F97316', description: 'Récord Personal' },
    { key: 'DOLOR', label: '⚠️ Dolor', color: '#EF4444', description: 'Molestia/Lesión' },
    { key: 'SUBIR', label: '💪 Subir Peso', color: '#22C55E', description: 'Próxima vez más peso' },
    { key: 'TECNICA', label: '🔄 Técnica', color: '#3B82F6', description: 'Revisar técnica' },
    { key: 'BOMBA', label: '💥 Bomba', color: '#A855F7', description: 'Buena congestión' },
    { key: 'FATIGA', label: '😴 Fatiga', color: '#71717A', description: 'Cansancio acumulado' },
  ] as const;

  // Guardar notas del ejercicio (una por día)
  const saveExerciseNotes = async () => {
    if (!user || !exercises[currentExerciseIndex]) return;

    // Usar helper para obtener el ejercicio activo (principal o alternativa)
    const { id: exerciseId, name: exerciseName } = getActiveExerciseInfo(currentExerciseIndex);
    if (!exerciseId) return;

    const newTags = exerciseTags[exerciseId] || [];
    setSavingNotes(true);

    try {
      // Si ya existe una nota de hoy, actualizar ese registro
      if (todayNoteId) {
        const { error } = await supabase
          .from('pro_videos')
          .update({
            notes: currentNoteText,
            exercise_notes: currentNoteText,
            tags: newTags,
          })
          .eq('id', todayNoteId);

        if (error) throw error;

        // Actualizar en historial local
        setNotesHistory((prev) =>
          prev.map((n) =>
            n.id === todayNoteId ? { ...n, notes: currentNoteText, tags: newTags } : n
          )
        );

        // Actualizar en la lista de videos del ejercicio (para el reproductor)
        setExerciseVideos((prev) =>
          prev.map((v) =>
            v.id === todayNoteId
              ? { ...v, notes: currentNoteText, exercise_notes: currentNoteText, tags: newTags }
              : v
          )
        );

        // Actualizar selectedVideo si es el mismo
        if (selectedVideo && selectedVideo.id === todayNoteId) {
          setSelectedVideo((prev) =>
            prev
              ? { ...prev, notes: currentNoteText, exercise_notes: currentNoteText, tags: newTags }
              : null
          );
        }
      } else {
        // No hay nota de hoy - crear un registro en pro_videos solo con notas (sin video)
        // Esto permite guardar notas inmediatamente sin necesidad de grabar video

        const { data: newNoteRecord, error: insertError } = await supabase
          .from('pro_videos')
          .insert({
            user_id: user.id,
            exercise_id: exerciseId,
            exercise_name: exerciseName,
            notes: currentNoteText,
            exercise_notes: currentNoteText,
            tags: newTags,
            context_type: 'tactical',
            // Sin video - es solo un registro de notas
            video_url: null,
            thumbnail_url: null,
            is_public: false,
          })
          .select('id')
          .single();

        if (insertError) {
          console.error('Error creando registro de notas:', insertError);
          throw insertError;
        }

        // Guardar el ID como todayNoteId para futuras ediciones
        if (newNoteRecord) {
          setTodayNoteId(newNoteRecord.id);

          // Agregar al historial local
          const today = new Date();
          setNotesHistory((prev) => [
            {
              id: newNoteRecord.id,
              date: today.toLocaleDateString('es-ES', {
                day: 'numeric',
                month: 'short',
              }),
              rawDate: today.toISOString().split('T')[0],
              notes: currentNoteText,
              tags: newTags,
              type: 'video',
              videoId: newNoteRecord.id,
              isToday: true,
            },
            ...prev,
          ]);
        }
      }

      // Obtener todos los IDs relacionados por nombre para sincronizar estado local
      const allRelatedIds = getAllExerciseIdsByName(exerciseName);

      // Actualizar estado local para TODOS los IDs relacionados
      const notesUpdate: Record<string, string> = {};
      const tagsUpdate: Record<string, string[]> = {};
      allRelatedIds.forEach((id) => {
        notesUpdate[id] = currentNoteText;
        tagsUpdate[id] = newTags;
      });

      setExerciseNotes((prev) => ({ ...prev, ...notesUpdate }));
      setExerciseTags((prev) => ({ ...prev, ...tagsUpdate }));

      // Actualizar videos en TODOS los ejercicios con el mismo nombre
      setExercises((prev) =>
        prev.map((ex) => {
          let updatedEx = ex;

          // Verificar si el ejercicio principal tiene el mismo nombre
          if (ex.name.toLowerCase().trim() === exerciseName.toLowerCase().trim()) {
            updatedEx = {
              ...ex,
              videos: ex.videos.map((v) =>
                v.id === todayNoteId
                  ? { ...v, notes: currentNoteText, exercise_notes: currentNoteText, tags: newTags }
                  : v
              ),
            };
          }

          // Verificar alternativas con el mismo nombre
          if (updatedEx.alternatives) {
            updatedEx = {
              ...updatedEx,
              alternatives: updatedEx.alternatives.map((alt) =>
                alt.name.toLowerCase().trim() === exerciseName.toLowerCase().trim()
                  ? {
                      ...alt,
                      videos: alt.videos.map((v) =>
                        v.id === todayNoteId
                          ? {
                              ...v,
                              notes: currentNoteText,
                              exercise_notes: currentNoteText,
                              tags: newTags,
                            }
                          : v
                      ),
                    }
                  : alt
              ),
            };
          }

          return updatedEx;
        })
      );

      // Actualizar ProContext para que si graban ahora, tenga las notas actualizadas
      setTacticalContext(exerciseId, exerciseName, currentNoteText, newTags);

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setNotesModalVisible(false);
    } catch (error) {
      console.error('Error guardando notas:', error);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setSavingNotes(false);
    }
  };

  // Guardar notas de un video específico
  const saveVideoNotes = async () => {
    if (!selectedVideo || !user) return;

    setSavingVideoNotes(true);

    try {
      const { error } = await supabase
        .from('pro_videos')
        .update({ notes: videoNoteText })
        .eq('id', selectedVideo.id);

      if (error) throw error;

      // Actualizar el video en estado local
      setSelectedVideo((prev) => (prev ? { ...prev, notes: videoNoteText } : null));

      // Actualizar en la lista de videos del historial
      setExerciseVideos((prev) =>
        prev.map((v) => (v.id === selectedVideo.id ? { ...v, notes: videoNoteText } : v))
      );

      // Actualizar en notesHistory para que se refleje inmediatamente en el modal principal
      setNotesHistory((prev) =>
        prev.map((n) => (n.id === selectedVideo.id ? { ...n, notes: videoNoteText } : n))
      );

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setVideoNotesModalVisible(false);
    } catch (error) {
      console.error('Error guardando notas del video:', error);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setSavingVideoNotes(false);
    }
  };

  // Eliminar nota de un video específico
  const deleteVideoNote = (noteId: string, noteDate: string) => {
    Alert.alert(
      '🗑️ ELIMINAR NOTA',
      `¿Eliminar la nota del ${noteDate}? Esta acción no se puede deshacer.`,
      [
        { text: 'CANCELAR', style: 'cancel' },
        {
          text: 'ELIMINAR',
          style: 'destructive',
          onPress: async () => {
            try {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

              // Eliminar notas del registro en pro_videos
              const { error } = await supabase
                .from('pro_videos')
                .update({ notes: null, exercise_notes: null })
                .eq('id', noteId);

              if (error) throw error;

              // Actualizar notesHistory (eliminar de la lista)
              setNotesHistory((prev) => prev.filter((n) => n.id !== noteId));

              // También actualizar exerciseVideos si está cargado
              setExerciseVideos((prev) =>
                prev.map((v) =>
                  v.id === noteId ? { ...v, notes: undefined, exercise_notes: undefined } : v
                )
              );

              // Si es el video seleccionado, cerrar el modal
              if (selectedVideo?.id === noteId) {
                setVideoNotesModalVisible(false);
              }

              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            } catch (error) {
              console.error('Error eliminando nota:', error);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            }
          },
        },
      ]
    );
  };

  // Toggle tag
  const toggleExerciseTag = (exerciseId: string, tagKey: string) => {
    setExerciseTags((prev) => {
      const currentTags = prev[exerciseId] || [];
      const hasTag = currentTags.includes(tagKey);

      return {
        ...prev,
        [exerciseId]: hasTag ? currentTags.filter((t) => t !== tagKey) : [...currentTags, tagKey],
      };
    });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const renderNotesModal = () => {
    const currentExercise = exercises[currentExerciseIndex];
    if (!currentExercise) return null;

    // Usar helper para obtener el ejercicio activo (principal o alternativa)
    const { id: activeExerciseId, name: activeExerciseName } =
      getActiveExerciseInfo(currentExerciseIndex);

    const currentTags = exerciseTags[activeExerciseId] || [];
    const hasNotes = currentNoteText.trim().length > 0 || currentTags.length > 0;

    return (
      <Modal
        visible={notesModalVisible}
        animationType="none"
        transparent={true}
        onRequestClose={() => {
          shouldSaveNotesOnCloseRef.current = true;
          setNotesModalVisible(false);
        }}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          className="flex-1"
        >
          <View className="flex-1 bg-transparent justify-end">
            <Animated.View
              style={[
                {
                  height: '85%',
                  backgroundColor: '#0a0a0a',
                  borderTopLeftRadius: 24,
                  borderTopRightRadius: 24,
                  borderTopWidth: 2,
                  borderTopColor: 'rgba(249, 115, 22, 0.5)',
                  overflow: 'hidden',
                },
                animatedStyleNotes,
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
                  backgroundColor: '#F97316',
                  shadowColor: '#F97316',
                  shadowOffset: { width: 0, height: 0 },
                  shadowOpacity: 0.8,
                  shadowRadius: 10,
                  zIndex: 10,
                }}
              />

              {/* Drag Handle + Header (Área para arrastrar) */}
              <Animated.View
                className="items-center pt-4 pb-4 border-b border-zinc-800"
                {...panResponderNotes.panHandlers}
              >
                <View className="w-12 h-1.5 bg-zinc-600 rounded-full mb-4" />

                {/* Header centrado */}
                <View className="px-6 pb-2 w-full">
                  <Text className="text-white text-xl font-bold text-center" numberOfLines={1}>
                    {activeExerciseName}
                  </Text>
                  <Text className="text-zinc-500 text-xs mt-1 tracking-wider text-center uppercase">
                    Notas del Ejercicio
                  </Text>
                </View>
              </Animated.View>

              <ScrollView className="flex-1 px-4 py-4" keyboardShouldPersistTaps="handled">
                {/* INDICADOR DE NOTA DE HOY */}
                {todayNoteId && (
                  <View
                    className="flex-row items-center gap-2 mb-4 px-3 py-2 rounded-lg"
                    style={{
                      backgroundColor: '#22C55E20',
                      borderWidth: 1,
                      borderColor: '#22C55E40',
                    }}
                  >
                    <Text className="text-green-500">✓</Text>
                    <Text className="text-green-500 text-xs font-medium">Editando nota de hoy</Text>
                  </View>
                )}

                {/* TAGS RÁPIDOS */}
                <View className="mb-4">
                  <Text className="text-zinc-400 text-xs uppercase tracking-wider mb-3">
                    Etiquetas rápidas
                  </Text>
                  <View className="flex-row flex-wrap gap-2">
                    {EXERCISE_TAGS.map((tag) => {
                      const isSelected = currentTags.includes(tag.key);
                      return (
                        <TouchableOpacity
                          key={tag.key}
                          onPress={() => toggleExerciseTag(activeExerciseId, tag.key)}
                          className="px-3 py-2 rounded-full flex-row items-center gap-1"
                          style={{
                            backgroundColor: isSelected ? tag.color + '30' : '#18181b',
                            borderWidth: 1,
                            borderColor: isSelected ? tag.color : '#27272a',
                          }}
                        >
                          <Text style={{ fontSize: 14 }}>{tag.label.split(' ')[0]}</Text>
                          <Text
                            className="font-bold text-xs"
                            style={{ color: isSelected ? tag.color : '#a1a1aa' }}
                          >
                            {tag.label.split(' ').slice(1).join(' ')}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>

                {/* TEXTO DE NOTAS */}
                <View className="mb-4">
                  <Text className="text-zinc-400 text-xs uppercase tracking-wider mb-3">
                    {todayNoteId ? 'Nota de hoy' : 'Nueva nota'}
                  </Text>
                  <View
                    className="rounded-xl"
                    style={{
                      backgroundColor: '#0a0a0a',
                      borderWidth: 1,
                      borderColor: todayNoteId ? '#22C55E40' : '#27272a',
                    }}
                  >
                    <TextInput
                      className="text-white text-base p-4"
                      style={{ minHeight: 120, textAlignVertical: 'top' }}
                      placeholder={
                        todayNoteId
                          ? 'Edita tu nota de hoy...'
                          : 'Escribe tus notas aquí...&#10;&#10;Ejemplos:&#10;• Dolor leve en hombro izquierdo&#10;• Probar agarre más cerrado&#10;• Subir a 50kg próxima sesión'
                      }
                      placeholderTextColor="#52525b"
                      multiline
                      value={currentNoteText}
                      onChangeText={setCurrentNoteText}
                    />
                  </View>
                </View>

                {/* TIPS - Solo mostrar si no hay nota de hoy */}
                {!todayNoteId && (
                  <View
                    className="p-4 rounded-xl mb-4"
                    style={{ backgroundColor: '#0f0f0f', borderWidth: 1, borderColor: '#1a1a1a' }}
                  >
                    <Text className="text-zinc-400 text-xs mb-2">
                      💡 Solo puedes guardar una nota por día por ejercicio
                    </Text>
                    <Text className="text-zinc-500 text-[10px]">
                      La nota se guardará cuando grabes un video
                    </Text>
                  </View>
                )}

                {/* HISTORIAL DE NOTAS - Excluir la nota de hoy */}
                <View className="mb-4">
                  <Text className="text-zinc-400 text-xs uppercase tracking-wider mb-3">
                    📜 Notas anteriores
                  </Text>

                  {loadingNotesHistory ? (
                    <View className="py-4 items-center">
                      <ActivityIndicator color="#DC2626" size="small" />
                    </View>
                  ) : notesHistory.filter((n) => !n.isToday).length === 0 ? (
                    <View
                      className="py-6 items-center rounded-xl"
                      style={{ backgroundColor: '#0a0a0a', borderWidth: 1, borderColor: '#1a1a1a' }}
                    >
                      <Text className="text-zinc-600 text-sm">Sin notas anteriores</Text>
                      <Text className="text-zinc-700 text-xs mt-1">
                        Tus notas de días pasados aparecerán aquí
                      </Text>
                    </View>
                  ) : (
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={{ gap: 12 }}
                    >
                      {notesHistory
                        .filter((n) => !n.isToday)
                        .map((note) => (
                          <TouchableOpacity
                            key={note.id}
                            onPress={() => {
                              // Abrir modal de edición de nota del video
                              if (note.videoId) {
                                setSelectedVideo({
                                  id: note.videoId,
                                  notes: note.notes,
                                  tags: note.tags,
                                  date: note.date,
                                } as any);
                                setVideoNoteText(note.notes);
                                setVideoNotesModalVisible(true);
                              }
                            }}
                            onLongPress={() => {
                              // Eliminar nota con long press
                              deleteVideoNote(note.id, note.date);
                            }}
                            delayLongPress={500}
                            className="rounded-xl p-3"
                            style={{
                              backgroundColor: '#18181b',
                              borderWidth: 1,
                              borderColor: '#27272a',
                              width: 200,
                            }}
                          >
                            {/* Header con fecha */}
                            <View className="flex-row items-center justify-between mb-2">
                              <Text className="text-zinc-500 text-[10px] uppercase">
                                {note.date}
                              </Text>
                              <View className="flex-row items-center gap-1">
                                <Edit3 color="#71717A" size={10} />
                                <Text className="text-zinc-600 text-[10px]">Editar</Text>
                              </View>
                            </View>

                            {/* Tags si tiene */}
                            {note.tags && note.tags.length > 0 && (
                              <View className="flex-row flex-wrap gap-1 mb-2">
                                {note.tags.slice(0, 2).map((tag: string) => {
                                  const tagInfo = EXERCISE_TAGS.find((t) => t.key === tag);
                                  if (!tagInfo) return null;
                                  return (
                                    <View
                                      key={tag}
                                      className="px-2 py-0.5 rounded-full"
                                      style={{ backgroundColor: tagInfo.color + '20' }}
                                    >
                                      <Text
                                        style={{
                                          color: tagInfo.color,
                                          fontSize: 10,
                                          fontWeight: 'bold',
                                        }}
                                      >
                                        {tagInfo.label.split(' ')[0]}
                                      </Text>
                                    </View>
                                  );
                                })}
                                {note.tags.length > 2 && (
                                  <Text className="text-zinc-600 text-[10px]">
                                    +{note.tags.length - 2}
                                  </Text>
                                )}
                              </View>
                            )}

                            {/* Texto de la nota (truncado) */}
                            <Text className="text-zinc-300 text-xs" numberOfLines={3}>
                              {note.notes}
                            </Text>
                          </TouchableOpacity>
                        ))}
                    </ScrollView>
                  )}
                </View>

                {/* INDICADOR DE NOTAS ACTIVAS */}
                {hasNotes && (
                  <View className="flex-row items-center gap-2 py-2">
                    <View className="w-2 h-2 bg-green-500 rounded-full" />
                    <Text className="text-green-500 text-xs">
                      Este ejercicio tiene notas activas
                    </Text>
                  </View>
                )}
              </ScrollView>
            </Animated.View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    );
  };

  // Modal para ver/editar notas de un video específico
  const renderVideoNotesModal = () => {
    if (!selectedVideo) return null;

    return (
      <Modal
        visible={videoNotesModalVisible}
        animationType="none"
        transparent={true}
        onRequestClose={() => {
          shouldSaveVideoNotesOnCloseRef.current = true;
          setVideoNotesModalVisible(false);
        }}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          className="flex-1"
        >
          <View className="flex-1 bg-transparent justify-end">
            <Animated.View
              style={[
                {
                  height: '50%',
                  backgroundColor: '#0a0a0a',
                  borderTopLeftRadius: 24,
                  borderTopRightRadius: 24,
                  borderTopWidth: 2,
                  borderTopColor: 'rgba(249, 115, 22, 0.5)',
                  overflow: 'hidden',
                },
                animatedStyleVideoNotes,
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
                  backgroundColor: '#F97316',
                  shadowColor: '#F97316',
                  shadowOffset: { width: 0, height: 0 },
                  shadowOpacity: 0.8,
                  shadowRadius: 10,
                  zIndex: 10,
                }}
              />

              {/* Drag Handle + Header (Área para arrastrar) */}
              <Animated.View
                className="items-center pt-4 pb-4 border-b border-zinc-800"
                {...panResponderVideoNotes.panHandlers}
              >
                <View className="w-12 h-1.5 bg-zinc-600 rounded-full mb-4" />

                {/* Header centrado */}
                <View className="px-6 pb-2 w-full">
                  <Text className="text-white text-xl font-bold text-center" numberOfLines={1}>
                    📝 Nota del {selectedVideo.date}
                  </Text>
                  <Text className="text-zinc-500 text-xs mt-1 tracking-wider text-center uppercase">
                    Desliza hacia abajo para guardar y cerrar
                  </Text>
                </View>
              </Animated.View>

              <ScrollView className="flex-1 px-4 py-4" keyboardShouldPersistTaps="handled">
                {/* Tags del video (solo lectura) */}
                {selectedVideo.tags && selectedVideo.tags.length > 0 && (
                  <View className="flex-row flex-wrap gap-2 mb-4">
                    {selectedVideo.tags.map((tag: string) => {
                      const tagInfo = EXERCISE_TAGS.find((t) => t.key === tag);
                      if (!tagInfo) return null;
                      return (
                        <View
                          key={tag}
                          className="px-3 py-1.5 rounded-full"
                          style={{ backgroundColor: tagInfo.color + '30' }}
                        >
                          <Text style={{ color: tagInfo.color, fontSize: 12, fontWeight: 'bold' }}>
                            {tagInfo.label}
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                )}

                {/* Editor de notas */}
                <Text className="text-zinc-400 text-xs uppercase tracking-wider mb-2">
                  Contenido de la nota
                </Text>
                <View
                  className="rounded-xl"
                  style={{
                    backgroundColor: '#0a0a0a',
                    borderWidth: 1,
                    borderColor: '#F9731640',
                  }}
                >
                  <TextInput
                    className="text-white text-base p-4"
                    style={{ minHeight: 120, textAlignVertical: 'top' }}
                    placeholder="Escribe tu nota aquí..."
                    placeholderTextColor="#52525b"
                    multiline
                    value={videoNoteText}
                    onChangeText={setVideoNoteText}
                  />
                </View>

                {/* Botón de eliminar */}
                <TouchableOpacity
                  onPress={() => deleteVideoNote(selectedVideo.id, selectedVideo.date)}
                  className="flex-row items-center justify-center gap-2 mt-6 py-3 rounded-xl"
                  style={{
                    backgroundColor: '#DC262620',
                    borderWidth: 1,
                    borderColor: '#DC262640',
                  }}
                >
                  <Trash2 color="#DC2626" size={18} />
                  <Text className="text-red-500 font-bold">Eliminar esta nota</Text>
                </TouchableOpacity>
              </ScrollView>
            </Animated.View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    );
  };

  const renderHankModal = () => (
    <Modal
      visible={hankModalVisible}
      animationType="slide"
      transparent={true}
      onRequestClose={() => setHankModalVisible(false)}
    >
      <View className="flex-1 bg-transparent justify-end">
        <View
          className="flex-1 rounded-t-3xl px-6 pt-6"
          style={{
            backgroundColor: '#0a0a0a',
            maxHeight: '90%',
            borderTopWidth: 2,
            borderTopColor: 'rgba(220, 38, 38, 0.5)',
            overflow: 'hidden',
          }}
        >
          {/* Línea de acento */}
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

          {/* Drag Indicator */}
          <View className="items-center mb-4">
            <View className="w-12 h-1.5 bg-zinc-600 rounded-full" />
          </View>

          {/* Header */}
          <View className="items-center mb-6">
            <Text className="text-savage-red text-2xl font-bold">HANK IA</Text>
          </View>

          <View className="flex-1 bg-glass-strong rounded-savage p-4 border border-savage-red">
            <Text className="text-zinc-400 text-sm mb-4 tracking-wider">
              Contexto: {exercises[currentExerciseIndex]?.name}
            </Text>
            <Text className="text-zinc-600">
              Hola, soy HANK. ¿En qué puedo ayudarte con este ejercicio?
            </Text>
          </View>

          <View className="flex-row mt-4 gap-2">
            <View className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg p-4">
              <Text className="text-zinc-600">Escribe tu pregunta...</Text>
            </View>
            <TouchableOpacity className="bg-savage-red p-4 rounded-lg">
              <Text className="text-savage-text font-bold">→</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );

  // MODAL: EDITOR SIMPLE
  const renderEditorModal = () => (
    <Modal visible={editorVisible} animationType="slide" statusBarTranslucent>
      <View className="flex-1 bg-black">
        {/* Header */}
        <View
          className="flex-row justify-between items-center px-6 pb-4 border-b border-zinc-800"
          style={{ paddingTop: insets.top + 12 }}
        >
          <TouchableOpacity
            onPress={() => {
              setEditorVisible(false);
              setImageToEdit(null);
              galleryFileRef.current = null; // Limpiar archivo de galería
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            }}
            className="bg-zinc-900 px-4 py-2 rounded-full"
          >
            <Text className="text-white font-bold">✕ CANCELAR</Text>
          </TouchableOpacity>
          <Text className="text-white font-bold text-lg">AJUSTAR RECORTE</Text>
          <TouchableOpacity
            onPress={() => {
              handleEditorSave();
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
            }}
            className="bg-red-600 px-4 py-2 rounded-full"
          >
            <Text className="text-white font-bold">✓ GUARDAR</Text>
          </TouchableOpacity>
        </View>

        {/* Preview cuadrado centrado */}
        <View className="flex-1 justify-center items-center px-4">
          {imageToEdit && (
            <View className="w-full max-w-[90%]" style={{ aspectRatio: 1 }}>
              {mediaType === 'video' ? (
                // Para videos, usar VideoView o video nativo en web
                Platform.OS === 'web' ? (
                  <video
                    src={imageToEdit}
                    style={{
                      width: '100%',
                      height: '100%',
                      borderRadius: 8,
                      objectFit: 'cover',
                      backgroundColor: '#000',
                    }}
                    autoPlay
                    loop
                    muted
                    playsInline
                  />
                ) : (
                  <VideoView
                    player={editorVideoPlayer}
                    style={{ width: '100%', height: '100%', borderRadius: 8 }}
                    contentFit="cover"
                    nativeControls={false}
                  />
                )
              ) : // Para fotos, usar img nativo en web (más confiable con blob URLs)
              Platform.OS === 'web' ? (
                <img
                  src={imageToEdit}
                  style={{
                    width: '100%',
                    height: '100%',
                    borderRadius: 8,
                    objectFit: 'cover',
                    backgroundColor: '#000',
                  }}
                  alt="Preview"
                />
              ) : (
                <Image
                  source={{ uri: imageToEdit }}
                  style={{ width: '100%', height: '100%', borderRadius: 8 }}
                  contentFit="cover"
                />
              )}
              {/* Overlay con guías de recorte */}
              <View className="absolute inset-0 border-2 border-dashed border-savage-red rounded-lg" />
            </View>
          )}
        </View>

        {/* Info */}
        <View className="px-6 py-8 border-t border-zinc-800">
          <Text className="text-zinc-400 text-center text-sm">
            La imagen se recortará en formato cuadrado 1:1
          </Text>
          {mediaType === 'video' && (
            <Text className="text-zinc-400 text-center text-sm mt-2">
              📹 Máximo 10 segundos de video
            </Text>
          )}
        </View>
      </View>
    </Modal>
  );

  const renderCameraModal = () => {
    // Verificar permisos primero
    if (!permission?.granted) {
      return (
        <Modal
          visible={cameraModalVisible}
          animationType="slide"
          transparent={true}
          onRequestClose={() => setCameraModalVisible(false)}
        >
          <View className="flex-1 bg-black justify-center items-center px-8">
            <Text className="text-white text-xl font-bold mb-4 text-center">
              📸 PERMISOS DE CÁMARA
            </Text>
            <Text className="text-zinc-400 text-center mb-8">
              Necesitamos acceso a tu cámara para capturar fotos y videos de tus ejercicios.
            </Text>
            <TouchableOpacity
              onPress={requestPermission}
              className="bg-savage-red px-8 py-4 rounded-full mb-4"
            >
              <Text className="text-white font-bold">PERMITIR CÁMARA</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setCameraModalVisible(false)} className="px-8 py-4">
              <Text className="text-zinc-500 font-bold">CANCELAR</Text>
            </TouchableOpacity>
          </View>
        </Modal>
      );
    }

    return (
      <Modal
        visible={cameraModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => {
          setCameraModalVisible(false);
          setCapturedVideoUri(null);
          setIsRecording(false);
          setRecordingTime(0);
        }}
      >
        {/* Container que NO tapa la barra de navegación */}
        <View className="flex-1 bg-black pt-12 pb-24">
          {/* VIDEO PREVIEW MODE - Si hay video capturado */}
          {capturedVideoUri ? (
            <View className="flex-1">
              {/* Header con opciones de video */}
              <View className="bg-black px-6 py-4">
                <View className="flex-row justify-between items-center">
                  <TouchableOpacity
                    onPress={discardVideo}
                    className="bg-zinc-900 px-4 py-2 rounded-full"
                  >
                    <Text className="text-white font-bold">✕ DESCARTAR</Text>
                  </TouchableOpacity>
                  <Text className="text-savage-text font-bold text-lg">PREVIEW VIDEO</Text>
                  <TouchableOpacity
                    onPress={saveVideo}
                    disabled={captureProcessing}
                    className="bg-savage-red px-4 py-2 rounded-full"
                  >
                    <Text className="text-white font-bold">
                      {captureProcessing ? '...' : '✓ GUARDAR'}
                    </Text>
                  </TouchableOpacity>
                </View>
                <Text className="text-zinc-500 text-center text-sm mt-2">
                  {recordingTime}s de video • Máx 10s
                </Text>
              </View>

              {/* Video Preview */}
              <View className="flex-1 justify-center items-center px-4">
                <View
                  className="w-full overflow-hidden bg-zinc-900 rounded-lg"
                  style={{ aspectRatio: 1 }}
                >
                  <VideoView
                    player={videoPlayer}
                    style={{ flex: 1, width: '100%', height: '100%' }}
                    contentFit="cover"
                    nativeControls={false}
                  />
                </View>
              </View>

              {/* Info */}
              <View className="py-4 bg-black">
                <Text className="text-zinc-400 text-center text-sm">
                  Video comprimido a 480p (~1-2MB)
                </Text>
              </View>
            </View>
          ) : (
            <>
              {/* HEADER */}
              <View className="bg-black px-6 pb-4 border-b border-zinc-900">
                <View className="flex-row justify-between items-center mb-3">
                  <TouchableOpacity
                    onPress={() => {
                      setCameraModalVisible(false);
                      setIsRecording(false);
                      setRecordingTime(0);
                      if (recordingTimerRef.current) {
                        clearInterval(recordingTimerRef.current);
                      }
                    }}
                  >
                    <X color="#FFFFFF" size={28} />
                  </TouchableOpacity>
                  <Text className="text-savage-text font-bold text-lg tracking-wider">
                    {cameraMode === 'photo' ? '📸 FOTO' : '🎬 VIDEO'}
                  </Text>
                  <TouchableOpacity
                    onPress={() => {
                      setCameraFacing(cameraFacing === 'back' ? 'front' : 'back');
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    }}
                  >
                    <RotateCcw color="#FFFFFF" size={24} />
                  </TouchableOpacity>
                </View>
                <Text className="text-zinc-500 text-center text-sm">
                  {exercises[currentExerciseIndex]?.name}
                </Text>
              </View>

              {/* MODE TOGGLE */}
              <View className="flex-row justify-center py-4 bg-black border-b border-zinc-900">
                <TouchableOpacity
                  onPress={() => {
                    setCameraMode('photo');
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  }}
                  className={`px-6 py-2 rounded-l-full ${cameraMode === 'photo' ? 'bg-savage-red' : 'bg-zinc-800'}`}
                >
                  <Text
                    className={`font-bold ${cameraMode === 'photo' ? 'text-white' : 'text-zinc-400'}`}
                  >
                    📸 FOTO
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => {
                    setCameraMode('video');
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  }}
                  className={`px-6 py-2 rounded-r-full ${cameraMode === 'video' ? 'bg-savage-red' : 'bg-zinc-800'}`}
                >
                  <Text
                    className={`font-bold ${cameraMode === 'video' ? 'text-white' : 'text-zinc-400'}`}
                  >
                    🎬 VIDEO
                  </Text>
                </TouchableOpacity>
              </View>

              {/* CAMERA VIEW - FORMATO CUADRADO CON DIMENSIONES FIJAS */}
              <View className="flex-1 justify-center items-center bg-black px-4">
                <View
                  className="w-full overflow-hidden rounded-lg bg-zinc-900"
                  style={{ aspectRatio: 1 }}
                >
                  <CameraView
                    ref={cameraRef}
                    style={{ flex: 1, width: '100%', height: '100%' }}
                    facing={cameraFacing}
                    mode={cameraMode === 'video' ? 'video' : 'picture'}
                  />
                  {/* Recording indicator */}
                  {isRecording && (
                    <View className="absolute top-4 left-4 flex-row items-center bg-savage-red px-3 py-1 rounded-full">
                      <View className="w-3 h-3 rounded-full bg-white mr-2" />
                      <Text className="text-white font-bold font-mono">{recordingTime}s / 10s</Text>
                    </View>
                  )}
                </View>
              </View>

              {/* PROCESSING/UPLOAD INDICATOR */}
              {captureProcessing && (
                <View className="absolute inset-0 bg-black/90 justify-center items-center z-50">
                  <View className="bg-zinc-900 rounded-2xl p-8 items-center border border-zinc-800">
                    {/* Animated upload icon */}
                    <View className="w-20 h-20 rounded-full bg-savage-red/20 items-center justify-center mb-4">
                      <ActivityIndicator size="large" color="#DC2626" />
                    </View>
                    <Text className="text-white text-lg font-bold tracking-wider">
                      {uploadingMessage || 'PROCESANDO...'}
                    </Text>
                    <Text className="text-zinc-500 text-xs mt-2">
                      {uploadingMessage ? 'Por favor espera' : 'Preparando archivo'}
                    </Text>
                  </View>
                </View>
              )}

              {/* CONTROLS */}
              <View className="bg-black py-4 border-t border-zinc-900">
                {/* BOTÓN GALERÍA */}
                <View className="flex-row justify-center mb-4">
                  <TouchableOpacity
                    onPress={() => {
                      setCameraModalVisible(false);
                      setTimeout(() => pickFromGallery(), 300);
                    }}
                    className="bg-zinc-900 px-6 py-3 rounded-full border border-zinc-700"
                    disabled={isRecording}
                  >
                    <Text className="text-white font-bold">📁 GALERÍA</Text>
                  </TouchableOpacity>
                </View>

                {/* CAPTURE/RECORD BUTTON */}
                <View className="items-center">
                  {cameraMode === 'photo' ? (
                    <>
                      <TouchableOpacity
                        onPress={capturePhoto}
                        disabled={captureProcessing}
                        className="w-20 h-20 rounded-full border-4 border-white bg-transparent items-center justify-center"
                      >
                        <View className="w-16 h-16 rounded-full bg-white" />
                      </TouchableOpacity>
                      <Text className="text-zinc-500 text-xs mt-3 tracking-wider">
                        TOCA PARA FOTO
                      </Text>
                    </>
                  ) : (
                    <>
                      <TouchableOpacity
                        onPress={isRecording ? stopVideoRecording : startVideoRecording}
                        disabled={captureProcessing}
                        className={`w-20 h-20 rounded-full border-4 ${isRecording ? 'border-savage-red' : 'border-white'} bg-transparent items-center justify-center`}
                      >
                        {isRecording ? (
                          <View className="w-8 h-8 rounded-sm bg-savage-red" />
                        ) : (
                          <View className="w-16 h-16 rounded-full bg-savage-red" />
                        )}
                      </TouchableOpacity>
                      <Text className="text-zinc-500 text-xs mt-3 tracking-wider">
                        {isRecording ? 'TOCA PARA DETENER' : 'TOCA PARA GRABAR (MÁX 10s)'}
                      </Text>
                    </>
                  )}
                </View>
              </View>
            </>
          )}
        </View>
      </Modal>
    );
  };

  const renderVideoViewer = () => {
    return (
      <Modal
        visible={videoViewerVisible}
        animationType="fade"
        transparent={false}
        onRequestClose={() => {
          setVideoViewerVisible(false);
        }}
      >
        <View className="flex-1 bg-savage-black">
          {/* VIDEO/PHOTO FULLSCREEN CON OVERLAYS */}
          {selectedVideo && (
            <View className="flex-1">
              {/* VIDEO o FOTO con TAP para pausar/reanudar (solo videos) */}
              {(() => {
                console.log('🖼️ GYM Historial - selectedVideo:', {
                  id: selectedVideo.id,
                  media_type: selectedVideo.media_type,
                  videoUrl: selectedVideo.videoUrl?.substring(0, 50),
                  video_url: selectedVideo.video_url?.substring(0, 50),
                });
                return null;
              })()}
              {selectedVideo.media_type === 'photo' ? (
                <View
                  style={{
                    flex: 1,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: '#000',
                  }}
                >
                  <RNImage
                    source={{
                      uri:
                        selectedVideo.videoUrl ||
                        selectedVideo.video_url ||
                        selectedVideo.thumbnail_url,
                    }}
                    style={{
                      width: SCREEN_WIDTH,
                      height: SCREEN_WIDTH * (16 / 9),
                    }}
                    resizeMode="cover"
                  />
                </View>
              ) : historialVideoSource ? (
                <TouchableOpacity
                  activeOpacity={1}
                  onPress={handleHistorialVideoTap}
                  style={{ flex: 1 }}
                >
                  <VideoView
                    player={historialPlayer}
                    style={{ flex: 1, width: '100%', height: '100%' }}
                    contentFit="cover"
                    nativeControls={false}
                  />
                  {/* Icono de Play cuando está pausado */}
                  {isVideoManuallyPaused && (
                    <View className="absolute inset-0 justify-center items-center">
                      <View className="bg-black/60 rounded-full p-6">
                        <Play color="#DC2626" size={64} fill="#DC2626" />
                      </View>
                    </View>
                  )}
                </TouchableOpacity>
              ) : (
                <View className="flex-1 bg-zinc-900 justify-center items-center">
                  <Text className="text-zinc-500">Contenido no disponible</Text>
                </View>
              )}

              {/* === OVERLAY BRANDING === */}

              {/* TOP BAR - Logo + Fecha */}
              <View className="absolute top-0 left-0 right-0 z-50">
                <LinearGradient
                  colors={['rgba(0,0,0,0.8)', 'rgba(0,0,0,0)']}
                  style={{ paddingTop: insets.top + 12, paddingBottom: 40, paddingHorizontal: 24 }}
                >
                  <View className="flex-row justify-between items-center">
                    {/* Close Button */}
                    <TouchableOpacity
                      onPress={() => setVideoViewerVisible(false)}
                      className="bg-black/50 p-2 rounded-full"
                    >
                      <X color="#FFFFFF" size={24} />
                    </TouchableOpacity>

                    {/* TRENS Logo */}
                    <View className="flex-row items-center gap-2">
                      <View className="w-8 h-8 bg-savage-red rounded-lg items-center justify-center">
                        <Text className="text-white font-black text-sm">T</Text>
                      </View>
                      <Text className="text-white font-bold tracking-wider">TRENS</Text>
                    </View>

                    {/* Visibility Badge */}
                    <View
                      className={`px-3 py-1 rounded-full ${selectedVideo.is_public ? 'bg-green-500/20' : 'bg-zinc-800'}`}
                    >
                      <Text
                        className={`text-xs font-bold ${selectedVideo.is_public ? 'text-green-500' : 'text-zinc-500'}`}
                      >
                        {selectedVideo.is_public ? 'PÚBLICO' : 'PRIVADO'}
                      </Text>
                    </View>
                  </View>
                </LinearGradient>
              </View>

              {/* BOTTOM BAR - Datos del ejercicio */}
              <View className="absolute bottom-0 left-0 right-0 z-50">
                <LinearGradient
                  colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.95)']}
                  className="px-6 pt-20 pb-10"
                >
                  {/* Ejercicio Name (si está disponible) */}
                  {modalExercise && (
                    <Text className="text-white text-2xl font-bold mb-4 tracking-wide">
                      {modalExercise.name}
                    </Text>
                  )}

                  {/* Datos: Peso x Reps (solo si hay datos) */}
                  {(selectedVideo.weight > 0 || selectedVideo.reps > 0) && (
                    <View className="flex-row items-baseline mb-4">
                      {selectedVideo.weight > 0 && (
                        <>
                          <Text className="text-savage-red text-5xl font-black font-mono">
                            {selectedVideo.weight}
                          </Text>
                          <Text className="text-white text-xl font-bold ml-1">KG</Text>
                        </>
                      )}
                      {selectedVideo.weight > 0 && selectedVideo.reps > 0 && (
                        <Text className="text-zinc-500 text-3xl mx-3">×</Text>
                      )}
                      {selectedVideo.reps > 0 && (
                        <>
                          <Text className="text-savage-red text-5xl font-black font-mono">
                            {selectedVideo.reps}
                          </Text>
                          <Text className="text-white text-xl font-bold ml-1">REPS</Text>
                        </>
                      )}
                    </View>
                  )}

                  {/* Caption del video (si tiene) */}
                  {selectedVideo.free_text && (
                    <Text className="text-zinc-300 text-base italic mb-4">
                      "{selectedVideo.free_text}"
                    </Text>
                  )}

                  {/* Spotify Track (si tiene) */}
                  {selectedVideo.spotify?.enabled && (
                    <TouchableOpacity
                      className="flex-row items-center bg-black/50 rounded-full px-4 py-2 self-start mb-4"
                      onPress={() => {
                        if (spotifyPremium && selectedVideo.spotify?.trackUri) {
                          // Sincronizar desde posición exacta
                          spotify.syncWithVideo(
                            selectedVideo.spotify.trackUri,
                            selectedVideo.spotify.positionMs || 0
                          );
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        } else {
                          // Sin Spotify Premium: Mostrar mensaje
                          Alert.alert(
                            '🎵 Spotify Sync',
                            'Conecta Spotify Premium para reproducir la música exacta con la que se grabó este video.',
                            [{ text: 'ENTENDIDO', style: 'default' }]
                          );
                        }
                      }}
                    >
                      {spotifyPremium ? (
                        <Volume2 color="#1DB954" size={16} />
                      ) : (
                        <Lock color="#71717A" size={16} />
                      )}
                      <Text className="text-green-500 text-sm font-bold ml-2">
                        {selectedVideo.spotify.trackName}
                      </Text>
                      <Text className="text-zinc-500 text-sm ml-1">
                        – {selectedVideo.spotify.artist}
                      </Text>
                    </TouchableOpacity>
                  )}

                  {/* Tags del video + Notas (en fila, todo presionable) */}
                  <View className="flex-row flex-wrap gap-2 mb-4">
                    {/* Tags predefinidos */}
                    {selectedVideo.tags &&
                      selectedVideo.tags.length > 0 &&
                      selectedVideo.tags.map((tag: string) => {
                        const tagInfo = EXERCISE_TAGS.find((t) => t.key === tag);
                        if (!tagInfo) return null;
                        return (
                          <View
                            key={tag}
                            className="px-3 py-1.5 rounded-full"
                            style={{ backgroundColor: tagInfo.color + '30' }}
                          >
                            <Text
                              style={{ color: tagInfo.color, fontSize: 12, fontWeight: 'bold' }}
                            >
                              {tagInfo.label}
                            </Text>
                          </View>
                        );
                      })}

                    {/* Notas (chip presionable para expandir) */}
                    {(selectedVideo.exercise_notes || selectedVideo.notes) && (
                      <TouchableOpacity
                        onPress={() => setVideoNotesExpanded(!videoNotesExpanded)}
                        style={{
                          backgroundColor: videoNotesExpanded ? '#F97316' : '#F9731630',
                          paddingHorizontal: 12,
                          paddingVertical: 6,
                          borderRadius: 9999,
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 4,
                        }}
                      >
                        <Text style={{ fontSize: 12 }}>📝</Text>
                        <Text
                          style={{
                            color: videoNotesExpanded ? '#000000' : '#F97316',
                            fontSize: 12,
                            fontWeight: 'bold',
                          }}
                        >
                          {videoNotesExpanded ? 'Ocultar' : 'Ver notas'}
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>

                  {/* Nota completa (solo si está expandida) */}
                  {videoNotesExpanded && (selectedVideo.exercise_notes || selectedVideo.notes) && (
                    <View
                      className="bg-zinc-900/80 rounded-xl px-4 py-3 mt-3"
                      style={{ borderLeftWidth: 3, borderLeftColor: '#F97316' }}
                    >
                      <Text className="text-zinc-300 text-sm">
                        {selectedVideo.notes || selectedVideo.exercise_notes}
                      </Text>
                    </View>
                  )}

                  {/* Fecha */}
                  <Text className="text-zinc-500 text-sm mt-3">{selectedVideo.date}</Text>

                  {/* ACTIONS */}
                  <View className="flex-row justify-around mt-6 pt-4 border-t border-zinc-800">
                    {/* Delete */}
                    <TouchableOpacity className="items-center" onPress={handleDeleteVideo}>
                      <View className="bg-zinc-900 p-3 rounded-full border border-zinc-800 mb-1">
                        <Trash2 color="#DC2626" size={20} />
                      </View>
                      <Text className="text-zinc-600 text-[10px]">ELIMINAR</Text>
                    </TouchableOpacity>

                    {/* Toggle Visibility */}
                    <TouchableOpacity className="items-center" onPress={handleToggleVisibility}>
                      <View
                        className={`p-3 rounded-full border mb-1 ${
                          selectedVideo.is_public
                            ? 'bg-green-500/20 border-green-500/50'
                            : 'bg-zinc-900 border-zinc-800'
                        }`}
                      >
                        {selectedVideo.is_public ? (
                          <Eye color="#22C55E" size={20} />
                        ) : (
                          <EyeOff color="#71717A" size={20} />
                        )}
                      </View>
                      <Text className="text-zinc-600 text-[10px]">
                        {selectedVideo.is_public ? 'EN TRENS' : 'OCULTO'}
                      </Text>
                    </TouchableOpacity>

                    {/* Share - Screen Record Hint */}
                    <TouchableOpacity className="items-center" onPress={handleShareVideo}>
                      <View className="bg-savage-red p-3 rounded-full mb-1">
                        <Share2 color="#FFFFFF" size={20} />
                      </View>
                      <Text className="text-zinc-600 text-[10px]">COMPARTIR</Text>
                    </TouchableOpacity>
                  </View>
                </LinearGradient>
              </View>
            </View>
          )}
        </View>
      </Modal>
    );
  };

  const renderHistorialModal = () => {
    if (!modalExercise) return null;

    return (
      <Modal
        visible={historialModalVisible}
        animationType="none"
        transparent={true}
        onRequestClose={() => setHistorialModalVisible(false)}
      >
        <View className="flex-1 bg-transparent justify-end">
          <Animated.View
            className="bg-black rounded-t-3xl"
            style={[{ height: '85%', backgroundColor: '#000' }, animatedStyleHistorial]}
          >
            {/* Drag Handle + Header (Área para arrastrar) */}
            <Animated.View
              className="items-center pt-4 pb-4 border-b border-zinc-800"
              {...panResponderHistorial.panHandlers}
            >
              <View className="w-12 h-1 bg-zinc-600 rounded-full mb-4" />

              {/* Header */}
              <View className="px-6 pb-2 w-full">
                <Text className="text-savage-text text-xl font-bold text-center">
                  {modalExercise.name}
                </Text>
                <Text className="text-zinc-500 text-xs mt-1 tracking-wider text-center uppercase">
                  Historial de Videos
                </Text>
              </View>
            </Animated.View>

            {/* Lista de Videos */}
            <ScrollView className="flex-1 px-4 py-4" showsVerticalScrollIndicator={false}>
              {loadingVideos ? (
                <View className="flex-1 justify-center items-center py-20">
                  <ActivityIndicator color="#DC2626" size="large" />
                  <Text className="text-zinc-500 text-center mt-4 text-sm">Cargando videos...</Text>
                </View>
              ) : exerciseVideos.length === 0 ? (
                <View className="flex-1 justify-center items-center py-20">
                  <CameraIcon color="#3F3F46" size={48} />
                  <Text className="text-zinc-600 text-center mt-4 text-base">
                    Sin videos registrados
                  </Text>
                  <Text className="text-zinc-700 text-center mt-2 text-xs">
                    Graba tu primer set desde el botón PRO
                  </Text>
                </View>
              ) : (
                exerciseVideos.map((video) => (
                  <Pressable
                    key={video.id}
                    onPress={() => {
                      setSelectedVideo(video);
                      setVideoNotesExpanded(false);
                      setVideoViewerVisible(true);
                      setHistorialModalVisible(false);
                    }}
                    onLongPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
                      deleteVideoFromHistorial(video);
                    }}
                    delayLongPress={500}
                    className="flex-row bg-zinc-900 rounded-xl mb-3 border border-zinc-800 overflow-hidden"
                  >
                    {/* Thumbnail - usa Image para fotos, VideoView para videos */}
                    <View
                      className="bg-zinc-800 w-24 justify-center items-center overflow-hidden"
                      style={{ aspectRatio: 3 / 4 }}
                    >
                      {video.media_type === 'photo' ? (
                        <Image
                          source={{ uri: video.videoUrl || video.video_url || video.thumbnail_url }}
                          style={{ width: 96, height: 128 }}
                          contentFit="cover"
                        />
                      ) : video.videoUrl || video.video_url ? (
                        <VideoThumbnail
                          videoUrl={video.videoUrl || video.video_url || ''}
                          width={96}
                          height={128}
                        />
                      ) : (
                        <Play color="#52525b" size={28} fill="#52525b" />
                      )}
                      {/* Icono de Play para videos, Camera para fotos */}
                      <View className="absolute inset-0 items-center justify-center bg-black/30">
                        {video.media_type === 'photo' ? (
                          <CameraIcon color="#fff" size={20} />
                        ) : (
                          <Play color="#fff" size={20} fill="#fff" />
                        )}
                      </View>
                    </View>

                    {/* Datos */}
                    <View className="flex-1 p-3 justify-center">
                      <View className="flex-row items-baseline mb-1">
                        <Text className="text-white font-bold text-2xl font-mono">
                          {video.weight}
                        </Text>
                        <Text className="text-zinc-500 text-xs ml-1">kg</Text>
                        <Text className="text-zinc-700 text-xl mx-1">×</Text>
                        <Text className="text-white font-bold text-2xl font-mono">
                          {video.reps}
                        </Text>
                        <Text className="text-zinc-500 text-xs ml-1">reps</Text>
                      </View>
                      <Text className="text-zinc-600 text-xs">{video.date}</Text>
                      <View className="flex-row items-center mt-1">
                        <View
                          className={`w-1.5 h-1.5 rounded-full mr-1.5 ${
                            video.is_public ? 'bg-green-500' : 'bg-zinc-700'
                          }`}
                        />
                        <Text className="text-zinc-600 text-[10px] uppercase tracking-wider">
                          {video.is_public ? 'Público' : 'Privado'}
                        </Text>
                        {video.spotify?.enabled && (
                          <View className="flex-row items-center ml-2">
                            <Music color="#1DB954" size={10} />
                            <Text className="text-green-500 text-[10px] ml-1">
                              {video.spotify.trackName}
                            </Text>
                          </View>
                        )}
                      </View>
                    </View>
                  </Pressable>
                ))
              )}
            </ScrollView>
          </Animated.View>
        </View>
      </Modal>
    );
  };

  // Funciones para editar series en FOCUS mode
  const addFocusSeries = () => {
    const newSeries: SeriesConfig = {
      id: Date.now().toString(),
      reps: 10,
      type: 'EFECTIVA',
      note: '',
      weight: 0,
    };
    setFocusSeriesConfig([...focusSeriesConfig, newSeries]);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const removeFocusSeries = (id: string) => {
    setFocusSeriesConfig(focusSeriesConfig.filter((s) => s.id !== id));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  const updateFocusSeries = (id: string, field: keyof SeriesConfig, value: any) => {
    setFocusSeriesConfig(
      focusSeriesConfig.map((s) => (s.id === id ? { ...s, [field]: value } : s))
    );
  };

  // Guardar series del modal de estructura
  const saveFocusSeries = async () => {
    if (!modalExercise || !user) return;

    setSavingFocusSeries(true);
    try {
      // modalExercise.id es el ID del registro en user_exercise_config
      // Obtener config actual usando ese ID directamente
      const { data: currentConfig } = await supabase
        .from('user_exercise_config')
        .select('config')
        .eq('id', modalExercise.id)
        .single();

      const currentConfigData = currentConfig?.config || {};
      const currentSeriesByDay = currentConfigData.series_by_day || {};

      // BUGFIX: Usar focusSeriesDayIndex (día capturado al abrir modal) en lugar de selectedDayIndex
      // Esto evita guardar series en el día incorrecto si el usuario cambió de día
      const updatedSeriesByDay = {
        ...currentSeriesByDay,
        [String(focusSeriesDayIndex)]: focusSeriesConfig,
      };

      // Actualizar el registro existente por su ID (no upsert con exercise_id)
      const { error } = await supabase
        .from('user_exercise_config')
        .update({
          config: {
            ...currentConfigData,
            series_by_day: updatedSeriesByDay,
            custom_series: focusSeriesConfig, // También guardar como legacy
          },
        })
        .eq('id', modalExercise.id);

      if (error) {
        console.error('Error Supabase guardando series:', error);
        throw error;
      }

      console.log(
        '✅ Series guardadas en Supabase:',
        focusSeriesConfig.length,
        'series para día',
        focusSeriesDayIndex
      );

      // Actualizar estado local de ejercicios
      setExercises((prev) =>
        prev.map((ex) =>
          ex.id === modalExercise.id
            ? {
                ...ex,
                series: focusSeriesConfig.map((s) => ({
                  id: s.id,
                  type: s.type,
                  reps: String(s.reps),
                  note: s.note,
                  weight: s.weight,
                })),
              }
            : ex
        )
      );

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setStructureModalVisible(false);
    } catch (error) {
      console.error('Error guardando series:', error);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setSavingFocusSeries(false);
    }
  };

  // Mantener ref actualizada para el panResponder
  saveFocusSeriesRef.current = saveFocusSeries;

  const renderFocusSeriesModal = () => {
    if (!modalExercise) return null;

    const FOCUS_SERIES_TYPES = [
      {
        key: 'CALENTAMIENTO',
        label: 'C',
        fullLabel: 'Calentamiento',
        color: '#3B82F6',
        bg: '#1e3a5f',
      },
      {
        key: 'APROXIMACION',
        label: 'A',
        fullLabel: 'Aproximación',
        color: '#F59E0B',
        bg: '#422006',
      },
      { key: 'EFECTIVA', label: 'E', fullLabel: 'Efectiva', color: '#22C55E', bg: '#052e16' },
      { key: 'FALLO', label: 'F', fullLabel: 'Al Fallo', color: '#EF4444', bg: '#450a0a' },
    ] as const;

    const getFocusSeriesTypeConfig = (type: string) => {
      return FOCUS_SERIES_TYPES.find((t) => t.key === type) || FOCUS_SERIES_TYPES[2];
    };

    return (
      <Modal
        visible={structureModalVisible}
        animationType="none"
        transparent={true}
        onRequestClose={() => {
          saveFocusSeries();
          setStructureModalVisible(false);
        }}
      >
        <View className="flex-1 bg-transparent justify-end">
          <Animated.View
            style={[
              {
                height: '92%',
                backgroundColor: '#0a0a0a',
                borderTopLeftRadius: 24,
                borderTopRightRadius: 24,
                borderTopWidth: 2,
                borderTopColor: 'rgba(220, 38, 38, 0.5)',
                overflow: 'hidden',
              },
              animatedStyleFocusSeries,
            ]}
          >
            {/* Línea de acento superior con glow */}
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

            {/* HEADER DRAGGABLE */}
            <View
              {...panResponderFocusSeries.panHandlers}
              className="px-4 pt-4 pb-3 border-b border-zinc-900"
            >
              {/* Indicador de drag */}
              <View className="items-center mb-3">
                <View className="w-12 h-1.5 bg-zinc-600 rounded-full" />
              </View>

              {/* Header centrado */}
              <View className="flex-row items-center justify-center">
                <Image
                  source={{ uri: modalExercise.image_url }}
                  style={{ width: 36, height: 36, borderRadius: 8 }}
                  contentFit="cover"
                />
                <View className="ml-2">
                  <Text className="text-white font-bold text-sm" numberOfLines={1}>
                    {modalExercise.name}
                  </Text>
                  <Text className="text-zinc-600 text-[10px] uppercase tracking-wider">
                    Series de Hoy
                  </Text>
                </View>
              </View>
            </View>

            {/* Leyenda de tipos */}
            <View className="flex-row justify-center gap-3 py-2 bg-zinc-950/50">
              {FOCUS_SERIES_TYPES.map((type) => (
                <View key={type.key} className="flex-row items-center gap-1">
                  <View
                    className="w-5 h-5 rounded items-center justify-center"
                    style={{ backgroundColor: type.bg, borderWidth: 1, borderColor: type.color }}
                  >
                    <Text className="text-[10px] font-bold" style={{ color: type.color }}>
                      {type.label}
                    </Text>
                  </View>
                  <Text className="text-zinc-500 text-[10px]">{type.fullLabel}</Text>
                </View>
              ))}
            </View>

            <Text className="text-zinc-600 text-[10px] text-center py-1">
              👈 Desliza izquierda para eliminar
            </Text>

            {/* Lista de Series Editable */}
            <ScrollView className="flex-1 px-3" keyboardShouldPersistTaps="handled">
              {focusSeriesConfig.map((serie, index) => {
                const typeConfig = getFocusSeriesTypeConfig(serie.type);
                return (
                  <SwipeableSeriesRow key={serie.id} onDelete={() => removeFocusSeries(serie.id)}>
                    <View
                      className="flex-row items-stretch rounded-xl overflow-hidden mb-2"
                      style={{ backgroundColor: '#0a0a0a', borderWidth: 1, borderColor: '#1a1a1a' }}
                    >
                      {/* NÚMERO DE SERIE + TIPO */}
                      <TouchableOpacity
                        onPress={() => {
                          const currentIndex = FOCUS_SERIES_TYPES.findIndex(
                            (t) => t.key === serie.type
                          );
                          const nextIndex = (currentIndex + 1) % FOCUS_SERIES_TYPES.length;
                          updateFocusSeries(serie.id, 'type', FOCUS_SERIES_TYPES[nextIndex].key);
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        }}
                        className="w-12 items-center justify-center py-2"
                        style={{ backgroundColor: typeConfig.bg }}
                      >
                        <Text className="text-zinc-500 text-[10px] font-mono">{index + 1}</Text>
                        <Text className="text-lg font-bold" style={{ color: typeConfig.color }}>
                          {typeConfig.label}
                        </Text>
                      </TouchableOpacity>

                      {/* CONTENIDO */}
                      <View className="flex-1 py-2">
                        {/* REPS + PESO */}
                        <View className="flex-row items-center px-2">
                          {/* REPS */}
                          <View className="flex-1 flex-row items-center">
                            <TouchableOpacity
                              onPress={() => {
                                updateFocusSeries(serie.id, 'reps', Math.max(1, serie.reps - 1));
                                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                              }}
                              className="w-7 h-7 rounded-full bg-zinc-800 items-center justify-center"
                            >
                              <Text className="text-white font-bold">−</Text>
                            </TouchableOpacity>
                            <View className="flex-1 items-center">
                              <Text className="text-white font-mono font-bold text-lg">
                                {serie.reps}
                              </Text>
                              <Text className="text-zinc-600 text-[8px] -mt-1">REPS</Text>
                            </View>
                            <TouchableOpacity
                              onPress={() => {
                                updateFocusSeries(serie.id, 'reps', serie.reps + 1);
                                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                              }}
                              className="w-7 h-7 rounded-full bg-zinc-800 items-center justify-center"
                            >
                              <Text className="text-white font-bold">+</Text>
                            </TouchableOpacity>
                          </View>

                          {/* SEPARADOR */}
                          <View className="w-px h-6 bg-zinc-800 mx-1" />

                          {/* PESO */}
                          <View className="flex-1 flex-row items-center">
                            <TouchableOpacity
                              onPress={() => {
                                updateFocusSeries(
                                  serie.id,
                                  'weight',
                                  Math.max(0, (serie.weight || 0) - 2.5)
                                );
                                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                              }}
                              className="w-7 h-7 rounded-full bg-zinc-800 items-center justify-center"
                            >
                              <Text className="text-white font-bold">−</Text>
                            </TouchableOpacity>
                            <View className="flex-1 items-center">
                              <TextInput
                                className="text-white font-mono font-bold text-lg text-center w-full p-0"
                                keyboardType="numeric"
                                placeholder="—"
                                placeholderTextColor="#52525b"
                                value={serie.weight ? String(serie.weight) : ''}
                                onChangeText={(text) => {
                                  const num = parseFloat(text) || 0;
                                  updateFocusSeries(serie.id, 'weight', num);
                                }}
                              />
                              <Text className="text-zinc-600 text-[8px] -mt-1">KG</Text>
                            </View>
                            <TouchableOpacity
                              onPress={() => {
                                updateFocusSeries(serie.id, 'weight', (serie.weight || 0) + 2.5);
                                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                              }}
                              className="w-7 h-7 rounded-full bg-zinc-800 items-center justify-center"
                            >
                              <Text className="text-white font-bold">+</Text>
                            </TouchableOpacity>
                          </View>
                        </View>

                        {/* INDICACIÓN (opcional) */}
                        <TextInput
                          className="text-zinc-400 text-xs mx-2 mt-1 px-2 py-1 bg-zinc-900/50 rounded"
                          placeholder="+ Indicación (opcional)"
                          placeholderTextColor="#52525b"
                          value={serie.note || ''}
                          onChangeText={(text) => updateFocusSeries(serie.id, 'note', text)}
                        />
                      </View>
                    </View>
                  </SwipeableSeriesRow>
                );
              })}

              {/* AGREGAR SERIE */}
              <TouchableOpacity
                onPress={addFocusSeries}
                className="flex-row items-center justify-center gap-2 py-3 mb-4 rounded-xl"
                style={{
                  borderWidth: 2,
                  borderStyle: 'dashed',
                  borderColor: '#27272a',
                  backgroundColor: '#050505',
                }}
              >
                <Plus color="#71717a" size={20} />
                <Text className="text-zinc-500 font-bold text-sm">AGREGAR SERIE</Text>
              </TouchableOpacity>
            </ScrollView>

            {/* Footer */}
            <View
              className="px-4 pt-3 border-t border-zinc-900"
              style={{ paddingBottom: insets.bottom + 16 }}
            >
              <TouchableOpacity
                onPress={() => {
                  // Generar estructura recomendada
                  const structures: Record<string, SeriesConfig[]> = {
                    BEGINNER: [
                      { id: '1', reps: 12, type: 'CALENTAMIENTO', note: '', weight: 0 },
                      { id: '2', reps: 10, type: 'EFECTIVA', note: '', weight: 0 },
                      { id: '3', reps: 10, type: 'EFECTIVA', note: '', weight: 0 },
                      { id: '4', reps: 10, type: 'EFECTIVA', note: '', weight: 0 },
                    ],
                    INTERMEDIATE: [
                      { id: '1', reps: 12, type: 'CALENTAMIENTO', note: '', weight: 0 },
                      { id: '2', reps: 10, type: 'APROXIMACION', note: '', weight: 0 },
                      { id: '3', reps: 8, type: 'EFECTIVA', note: '', weight: 0 },
                      { id: '4', reps: 8, type: 'EFECTIVA', note: '', weight: 0 },
                      { id: '5', reps: 8, type: 'EFECTIVA', note: '', weight: 0 },
                    ],
                    ADVANCED: [
                      { id: '1', reps: 12, type: 'CALENTAMIENTO', note: '', weight: 0 },
                      { id: '2', reps: 8, type: 'APROXIMACION', note: '', weight: 0 },
                      { id: '3', reps: 6, type: 'APROXIMACION', note: '', weight: 0 },
                      { id: '4', reps: 6, type: 'EFECTIVA', note: '', weight: 0 },
                      { id: '5', reps: 6, type: 'EFECTIVA', note: '', weight: 0 },
                      { id: '6', reps: 6, type: 'EFECTIVA', note: '', weight: 0 },
                      { id: '7', reps: 12, type: 'FALLO', note: '', weight: 0 },
                    ],
                    PRO: [
                      { id: '1', reps: 15, type: 'CALENTAMIENTO', note: '', weight: 0 },
                      { id: '2', reps: 10, type: 'APROXIMACION', note: '', weight: 0 },
                      { id: '3', reps: 8, type: 'APROXIMACION', note: '', weight: 0 },
                      { id: '4', reps: 6, type: 'APROXIMACION', note: '', weight: 0 },
                      { id: '5', reps: 5, type: 'EFECTIVA', note: '', weight: 0 },
                      { id: '6', reps: 5, type: 'EFECTIVA', note: '', weight: 0 },
                      { id: '7', reps: 5, type: 'EFECTIVA', note: '', weight: 0 },
                      { id: '8', reps: 5, type: 'EFECTIVA', note: '', weight: 0 },
                      { id: '9', reps: 15, type: 'FALLO', note: '', weight: 0 },
                    ],
                  };
                  setFocusSeriesConfig(structures[userLevel] || structures.INTERMEDIATE);
                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                }}
                className="flex-row items-center justify-center gap-2 py-3 rounded-xl"
                style={{ backgroundColor: '#0f0f0f', borderWidth: 1, borderColor: '#DC2626' }}
              >
                <Zap color="#DC2626" size={16} />
                <Text className="text-savage-red font-bold text-sm">
                  ESTRUCTURA RECOMENDADA POR HANK
                </Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </View>
      </Modal>
    );
  };

  // ============================================================================
  // RENDER FOCUS MODE (VERTICAL SCROLL - TIKTOK STYLE)
  // ============================================================================
  return (
    <GestureHandlerRootView className="flex-1 bg-black">
      {/* HEADER FIJO - ED HARDY FIRE STYLE */}
      <View className="absolute top-0 left-0 right-0 z-50">
        <LinearGradient
          colors={['rgba(10,0,0,0.98)', 'rgba(10,0,0,0.85)', 'transparent']}
          className="px-4 pb-6"
          style={{ paddingTop: insets.top + 12 }}
        >
          <View className="flex-row items-center justify-between">
            <View className="flex-1">
              <Text
                className="text-fire-orange text-lg font-bold tracking-wider uppercase"
                style={{
                  textShadowColor: '#F97316',
                  textShadowOffset: { width: 0, height: 0 },
                  textShadowRadius: 8,
                }}
              >
                🔥 {trainingProgram.days[selectedDayIndex]?.muscleGroups || 'ENTRENAMIENTO'}
              </Text>
              <Text className="text-zinc-500 text-xs font-mono mt-0.5">{getCurrentTime()}</Text>
            </View>
            <TouchableOpacity
              onPress={() => setStructureModalOpen(true)}
              className="p-2.5 rounded-lg"
              style={{
                backgroundColor: '#0a0000',
                borderWidth: 1,
                borderColor: '#F97316',
              }}
            >
              <Sliders color="#F97316" size={18} />
            </TouchableOpacity>
          </View>
        </LinearGradient>
      </View>

      {/* HUD TÁCTICO - Timer justo encima de Spotify (12px gap) */}
      <View
        style={{
          position: 'absolute',
          right: 16,
          bottom: 230 + insets.bottom, // Ajustado
          zIndex: 40,
        }}
      >
        {/* TIMER - Mismo tamaño que Spotify (56x56) */}
        <View>
          {timerActive ? (
            // Cuenta regresiva activa
            <View
              className="bg-black/90 rounded-full border-2 border-savage-red items-center justify-center"
              style={{ width: 56, height: 56 }}
            >
              <Text className="text-savage-red font-mono font-bold text-sm">
                {formatTime(timeRemaining)}
              </Text>
            </View>
          ) : timerExpanded ? (
            // Burbujas desplegadas
            <View className="gap-2 bg-black/90 p-2 rounded-2xl border border-zinc-800">
              <TouchableOpacity
                onPress={() => startTimer(1)}
                className="bg-zinc-800 px-3 py-1.5 rounded-full"
              >
                <Text className="text-savage-text text-[10px] font-bold">1m</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => startTimer(2)}
                className="bg-zinc-800 px-3 py-1.5 rounded-full"
              >
                <Text className="text-savage-text text-[10px] font-bold">2m</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => startTimer(3)}
                className="bg-zinc-800 px-3 py-1.5 rounded-full"
              >
                <Text className="text-savage-text text-[10px] font-bold">3m</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setTimerExpanded(false)}
                className="bg-savage-red px-3 py-1.5 rounded-full"
              >
                <X color="#FFF" size={12} />
              </TouchableOpacity>
            </View>
          ) : (
            // Icono normal - 56x56 como Spotify
            <TouchableOpacity
              onPress={() => setTimerExpanded(true)}
              className="bg-zinc-900 rounded-full border border-zinc-700 items-center justify-center"
              style={{ width: 56, height: 56 }}
            >
              <Timer color="#FFFFFF" size={24} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* VERTICAL SCROLL (ESTILO TIKTOK) */}
      <FlatList
        ref={exerciseListRef}
        // BUGFIX: Key dinámica para forzar re-mount completo
        // listRefreshKey se incrementa después de loadExercises para garantizar remontaje
        key={`exercise-list-${listRefreshKey}-${exercises.length}`}
        data={exercises}
        // BUGFIX: Forzar re-render cuando cambian las alternativas de los ejercicios
        // El extraData incluye un hash completo de las alternativas (id, cantidad, y nombres)
        // para que React detecte cualquier cambio en los datos de alternativas
        extraData={exercises
          .map(
            (e) =>
              `${e.id}:${e.alternatives?.length || 0}:${e.alternatives?.map((a) => a.name).join(',') || ''}`
          )
          .join('|')}
        keyExtractor={(item) => item.id}
        pagingEnabled={Platform.OS !== 'web' && exercises.length > 0}
        scrollEnabled={Platform.OS !== 'web' && exercises.length > 0}
        decelerationRate="fast"
        snapToInterval={CONTENT_HEIGHT}
        snapToAlignment="start"
        disableIntervalMomentum={true}
        // BUGFIX: Evitar que las views se desmonten durante modales
        removeClippedSubviews={false}
        // BUGFIX: Renderizar TODOS los ejercicios de una vez para evitar items vacíos
        windowSize={21}
        maxToRenderPerBatch={20}
        initialNumToRender={20}
        getItemLayout={(_, index) => ({
          length: CONTENT_HEIGHT,
          offset: CONTENT_HEIGHT * index,
          index,
        })}
        showsVerticalScrollIndicator={false}
        viewabilityConfig={viewabilityConfig.current}
        onViewableItemsChanged={onViewableItemsChanged.current}
        onMomentumScrollEnd={() => {
          if (Platform.OS !== 'web') {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          }
        }}
        style={Platform.OS === 'web' ? { overflow: 'hidden', flex: 1 } : { flex: 1 }}
        contentContainerStyle={
          exercises.length === 0
            ? { flex: 1 }
            : Platform.OS === 'web'
              ? ({
                  transform: `translateY(${-activeExerciseIndex * CONTENT_HEIGHT}px)`,
                  transition: 'transform 0.25s cubic-bezier(0.25, 0.1, 0.25, 1)',
                  willChange: 'transform',
                } as any)
              : undefined
        }
        ListEmptyComponent={
          <View
            style={{ height: CONTENT_HEIGHT, backgroundColor: '#000000' }}
            className="justify-center items-center px-6"
          >
            <View
              className="w-24 h-24 rounded-full items-center justify-center mb-6"
              style={{
                backgroundColor: '#0a0000',
                borderWidth: 2,
                borderColor: '#DC2626',
                shadowColor: '#DC2626',
                shadowOffset: { width: 0, height: 0 },
                shadowOpacity: 0.4,
                shadowRadius: 16,
              }}
            >
              <Zap size={40} color="#DC2626" />
            </View>
            <Text className="text-white text-xl font-bold text-center mb-2">
              Configura tu Entrenamiento
            </Text>
            <Text className="text-zinc-500 text-center text-sm mb-6 px-4">
              Crea tu estructura de días y ejercicios para comenzar a entrenar.
            </Text>
            <TouchableOpacity
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                setStructureModalOpen(true);
              }}
              className="px-8 py-4 rounded-xl flex-row items-center gap-2"
              style={{
                backgroundColor: '#DC2626',
                shadowColor: '#DC2626',
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.5,
                shadowRadius: 12,
              }}
            >
              <Sliders size={18} color="#FFFFFF" />
              <Text className="text-white font-bold tracking-wider">CONFIGURAR RUTINA</Text>
            </TouchableOpacity>
          </View>
        }
        renderItem={({ item, index }) => {
          // Preparar array de ejercicios: principal + alternativas
          // IMPORTANTE: Para notas usamos exercise_id (de tabla exercises)
          // BUGFIX: Usar fallback seguro para evitar keys vacíos que crashean React Native
          const mainExerciseId = item.exercise_id || item.id || `main-${index}`;

          // BUGFIX: Filtrar alternativas que tengan el mismo ID que el ejercicio principal
          // y filtrar alternativas con datos inválidos (sin id o sin nombre)
          const validAlternatives = (item.alternatives || []).filter((alt: ExerciseAlternative) => {
            if (!alt || !alt.id || !alt.name) {
              console.warn(`⚠️ Alternativa inválida filtrada para ejercicio ${item.name}:`, alt);
              return false;
            }
            if (alt.id === mainExerciseId) {
              console.warn(`⚠️ Alternativa con mismo ID que principal filtrada: ${alt.name}`);
              return false;
            }
            return true;
          });

          const allVariations = [
            {
              id: mainExerciseId,
              configId: item.id, // Guardar el user_exercise_config.id por si se necesita
              name: item.name || 'Sin nombre',
              image_url: item.image_url || '',
              videos: item.videos || [],
              isMain: true,
            },
            ...validAlternatives.map((alt: ExerciseAlternative) => ({
              ...alt,
              isMain: false,
            })),
          ];

          // DEBUG: Log detallado para diagnosticar el problema de ejercicios vacíos
          if (index < 5) {
            // Solo los primeros 5 para no saturar
            console.log(
              `🔍 RENDER[${index}] "${item.name}": raw=${item.alternatives?.length || 0}, valid=${validAlternatives.length}, total=${allVariations.length}`
            );
            console.log(
              `   📋 allVariations:`,
              allVariations.map((v) => `${v.isMain ? '★' : '○'} ${v.name}`)
            );
            console.log(
              `   📐 Layout: SCREEN_WIDTH=${SCREEN_WIDTH}, safeAltIndex=${activeAlternatives[index] ?? 0}`
            );
          }

          // BUGFIX: Usar ref como fallback para evitar pérdida de alternativa durante modales
          // El estado puede no estar sincronizado durante re-renders causados por modales
          const activeAltIndex =
            activeAlternatives[index] ?? activeAlternativesRef.current[index] ?? 0;
          // BUGFIX: Validar que el índice no exceda el número de elementos disponibles
          // Esto corrige el bug donde al volver de STRUCTURE a FOCUS, el índice guardado
          // podría apuntar a una alternativa que no existe
          const safeAltIndex = Math.min(activeAltIndex, Math.max(0, allVariations.length - 1));

          return (
            <View
              style={{
                width: SCREEN_WIDTH,
                height: CONTENT_HEIGHT,
                backgroundColor: '#000',
              }}
            >
              {/* FONDO SPOTIFY - Cubre toda la sección inferior cuando hay música */}
              {spotifyIsPlaying && spotifyCurrentTrack?.albumArt && (
                <View
                  style={{
                    position: 'absolute',
                    top: SCREEN_WIDTH * 0.85, // Debajo de la imagen del ejercicio
                    left: 0,
                    right: 0,
                    bottom: 0,
                    zIndex: 0,
                  }}
                >
                  <SpotifyAlbumBackground
                    albumArt={spotifyCurrentTrack.albumArt}
                    isPlaying={spotifyIsPlaying}
                  />
                </View>
              )}

              {/* PARTE SUPERIOR SCROLLEABLE - Imagen, nombre, historial */}
              {/* Key incluye listRefreshKey para forzar remontaje después de loadExercises */}
              <FlatList
                key={`variations-${listRefreshKey}-${item.id}-${allVariations.length}`}
                horizontal
                data={allVariations}
                keyExtractor={(variation) => variation.id}
                pagingEnabled={Platform.OS !== 'web'}
                scrollEnabled={Platform.OS !== 'web'}
                showsHorizontalScrollIndicator={false}
                initialScrollIndex={safeAltIndex}
                // BUGFIX: Evitar que las views se desmonten durante modales
                removeClippedSubviews={false}
                // BUGFIX: Forzar re-render cuando cambia el índice de alternativa o los datos
                extraData={`${safeAltIndex}-${allVariations.map((v) => v.id).join(',')}`}
                // BUGFIX: Renderizar TODAS las alternativas de una vez para evitar items vacíos
                windowSize={21}
                maxToRenderPerBatch={allVariations.length + 1}
                initialNumToRender={allVariations.length + 1}
                getItemLayout={(_, idx) => ({
                  length: SCREEN_WIDTH,
                  offset: SCREEN_WIDTH * idx,
                  index: idx,
                })}
                onScrollToIndexFailed={(info) => {
                  // BUGFIX: Si el scroll inicial falla, reintentar después de un frame
                  console.warn(`⚠️ FlatList scroll failed for index ${info.index}, retrying...`);
                }}
                onMomentumScrollEnd={(event) => {
                  if (Platform.OS !== 'web') {
                    const newIndex = Math.round(event.nativeEvent.contentOffset.x / SCREEN_WIDTH);
                    setActiveAlternatives((prev) => ({ ...prev, [index]: newIndex }));
                  }
                }}
                style={{
                  width: SCREEN_WIDTH,
                  height: SCREEN_WIDTH * 0.85 + 170,
                  overflow: 'hidden',
                  flexGrow: 0,
                }}
                contentContainerStyle={
                  Platform.OS === 'web'
                    ? ({
                        display: 'flex',
                        flexDirection: 'row',
                        width: SCREEN_WIDTH * allVariations.length,
                        transform: `translateX(${-safeAltIndex * SCREEN_WIDTH}px)`,
                        transition: 'transform 0.3s ease-out',
                        willChange: 'transform',
                      } as any)
                    : undefined
                }
                renderItem={({ item: variation, index: variationIndex }) => {
                  // DEBUG: Log para verificar que cada variación se renderiza
                  if (index === 0) {
                    console.log(
                      `   🎨 renderItem[${variationIndex}]: "${variation.name}" (isMain=${variation.isMain})`
                    );
                  }
                  return (
                    <View
                      style={{
                        width: SCREEN_WIDTH,
                        minWidth: SCREEN_WIDTH,
                        maxWidth: SCREEN_WIDTH,
                        backgroundColor: spotifyIsPlaying ? 'transparent' : '#000',
                      }}
                    >
                      {/* IMAGEN/VIDEO HERO */}
                      <View className="relative" style={{ height: SCREEN_WIDTH * 0.85 }}>
                        {isVideoUrl(variation.image_url) ? (
                          <VideoHero
                            videoUrl={variation.image_url!}
                            videoMuted={videoMuted}
                            screenWidth={SCREEN_WIDTH}
                            isActive={
                              isFocused &&
                              index === activeExerciseIndex &&
                              safeAltIndex ===
                                allVariations.findIndex((v) => v.id === variation.id) &&
                              !editorVisible &&
                              !cameraModalVisible &&
                              !isPickingFromGallery
                            }
                          />
                        ) : variation.image_url ? (
                          <Image
                            source={{ uri: variation.image_url }}
                            style={{ width: SCREEN_WIDTH, height: '100%' }}
                            contentFit="cover"
                          />
                        ) : (
                          // Placeholder cuando no hay imagen
                          <View
                            style={{ width: SCREEN_WIDTH, height: '100%' }}
                            className="bg-zinc-900 items-center justify-center"
                          >
                            <View className="w-20 h-20 rounded-full bg-zinc-800 items-center justify-center">
                              <Zap size={32} color="#DC2626" />
                            </View>
                            <Text className="text-zinc-500 text-sm mt-4">Sin imagen</Text>
                          </View>
                        )}

                        {/* OVERLAY GRADIENTE SUPERIOR */}
                        <LinearGradient
                          colors={['rgba(0,0,0,0.7)', 'transparent']}
                          className="absolute top-0 left-0 right-0 h-28"
                        />

                        {/* OVERLAY GRADIENTE INFERIOR */}
                        <LinearGradient
                          colors={['transparent', 'rgba(0,0,0,0.95)', '#000']}
                          className="absolute bottom-0 left-0 right-0 h-32"
                        />

                        {/* INDICADORES DE ALTERNATIVAS (DOTS) */}
                        {allVariations.length > 1 && (
                          <View className="absolute top-24 left-4 flex-row gap-1.5">
                            {allVariations.map((_, dotIndex) => (
                              <View
                                key={dotIndex}
                                className={`h-1.5 rounded-full ${
                                  dotIndex === safeAltIndex
                                    ? 'w-6 bg-fire-orange'
                                    : 'w-1.5 bg-white/40'
                                }`}
                              />
                            ))}
                          </View>
                        )}

                        {/* BOTÓN NOTAS */}
                        <TouchableOpacity
                          onPress={() => {
                            setCurrentExerciseIndex(index);
                            setNotesModalVisible(true);
                          }}
                          className="absolute bottom-40 right-4 z-50"
                          style={{
                            backgroundColor: 'rgba(0,0,0,0.6)',
                            borderWidth: 1,
                            borderColor: 'rgba(255,255,255,0.2)',
                            borderRadius: 12,
                            width: 48,
                            height: 48,
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <Edit3
                            color={
                              exerciseNotes[variation.id] || exerciseTags[variation.id]?.length
                                ? '#F97316'
                                : '#FFFFFF'
                            }
                            size={20}
                          />
                          {exerciseNotes[variation.id] ||
                          (exerciseTags[variation.id]?.length ?? 0) > 0 ? (
                            <View
                              className="absolute -top-1 -right-1 w-3 h-3 bg-fire-orange rounded-full"
                              style={{ borderWidth: 2, borderColor: '#000' }}
                            />
                          ) : null}
                        </TouchableOpacity>

                        {/* BOTÓN MUTE/AUDIO (solo para videos) */}
                        {isVideoUrl(variation.image_url) && (
                          <TouchableOpacity
                            onPress={() => {
                              setVideoMuted(!videoMuted);
                              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            }}
                            className="absolute bottom-24 left-4"
                            style={{
                              backgroundColor: 'rgba(0,0,0,0.6)',
                              borderWidth: 1,
                              borderColor: 'rgba(255,255,255,0.2)',
                              borderRadius: 12,
                              padding: 10,
                            }}
                          >
                            {videoMuted ? (
                              <Volume2 color="#FFFFFF" size={18} />
                            ) : (
                              <Volume2 color="#F97316" size={18} />
                            )}
                          </TouchableOpacity>
                        )}

                        {/* BOTÓN CÁMARA */}
                        <TouchableOpacity
                          onPress={() => {
                            setCurrentExerciseIndex(index);
                            setCurrentVariationId(variation.id);
                            openCamera();
                          }}
                          className="absolute bottom-24 right-4 items-center justify-center"
                          style={{
                            width: 48,
                            height: 48,
                            backgroundColor: 'rgba(0,0,0,0.6)',
                            borderWidth: 1,
                            borderColor: 'rgba(255,255,255,0.2)',
                            borderRadius: 12,
                          }}
                        >
                          <CameraIcon color="#FFFFFF" size={20} />
                        </TouchableOpacity>

                        {/* TÍTULO EJERCICIO */}
                        <View className="absolute bottom-4 left-4 right-20">
                          <Text
                            className="text-white font-bold uppercase tracking-wider"
                            style={{
                              fontSize: 28,
                              textShadowColor: 'rgba(0,0,0,0.8)',
                              textShadowOffset: { width: 0, height: 2 },
                              textShadowRadius: 8,
                            }}
                            numberOfLines={2}
                          >
                            {variation.name}
                          </Text>
                          {!variation.isMain && (
                            <View className="flex-row items-center mt-1">
                              <View className="w-2 h-2 bg-fire-orange rounded-full mr-2" />
                              <Text className="text-fire-orange text-xs uppercase tracking-widest font-bold">
                                Alternativa
                              </Text>
                            </View>
                          )}
                        </View>
                      </View>

                      {/* SLIDER DE HISTORIAL */}
                      <View
                        className="px-4 pt-3"
                        style={{
                          backgroundColor: spotifyIsPlaying ? 'transparent' : '#000',
                        }}
                      >
                        <View className="flex-row items-center justify-between mb-2">
                          <View className="flex-row items-center gap-2">
                            <View className="w-1 h-4 bg-fire-orange rounded-full" />
                            <Text className="text-white font-bold text-sm uppercase tracking-wider">
                              Historial
                            </Text>
                          </View>
                          <Text className="text-zinc-500 text-xs font-mono">
                            {
                              variation.videos.filter((v: VideoRecord) => v.video_url || v.videoUrl)
                                .length
                            }{' '}
                            registros
                          </Text>
                        </View>

                        {variation.videos.filter((v: VideoRecord) => v.video_url || v.videoUrl)
                          .length > 0 ? (
                          <ScrollView
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            contentContainerStyle={{ paddingRight: 16 }}
                            className="-mx-4 px-4"
                          >
                            {variation.videos
                              .filter((v: VideoRecord) => v.video_url || v.videoUrl)
                              .slice(0, 10)
                              .map((video: VideoRecord, vIdx: number) => (
                                <Pressable
                                  key={video.id || vIdx}
                                  onPress={() => {
                                    setSelectedVideo(video);
                                    setVideoNotesExpanded(false);
                                    setVideoViewerVisible(true);
                                  }}
                                  onLongPress={() => {
                                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
                                    deleteVideoFromHistorial(video);
                                  }}
                                  delayLongPress={500}
                                  className="mr-3"
                                  style={{
                                    width: 75,
                                    height: 133,
                                    backgroundColor: spotifyIsPlaying
                                      ? 'rgba(0,0,0,0.4)'
                                      : '#0a0a0a',
                                    borderRadius: 10,
                                    borderWidth: 1.5,
                                    borderColor:
                                      vIdx === 0
                                        ? '#F97316'
                                        : spotifyIsPlaying
                                          ? 'rgba(255,255,255,0.15)'
                                          : '#27272a',
                                    overflow: 'hidden',
                                  }}
                                >
                                  <View className="relative flex-1">
                                    {video.thumbnail_url || video.video_url ? (
                                      <Image
                                        source={{ uri: video.thumbnail_url || video.video_url }}
                                        style={{ width: '100%', height: '100%' }}
                                        contentFit="cover"
                                      />
                                    ) : (
                                      <View className="w-full h-full bg-zinc-800 items-center justify-center">
                                        <Video color="#52525b" size={20} />
                                      </View>
                                    )}

                                    <LinearGradient
                                      colors={['transparent', 'rgba(0,0,0,0.9)']}
                                      className="absolute bottom-0 left-0 right-0 h-16"
                                    />

                                    <View className="absolute inset-0 items-center justify-center">
                                      <View
                                        className="w-8 h-8 rounded-full items-center justify-center"
                                        style={{ backgroundColor: 'rgba(255,255,255,0.9)' }}
                                      >
                                        <Play color="#000" size={14} fill="#000" />
                                      </View>
                                    </View>

                                    <View className="absolute top-1.5 left-1.5 right-1.5 flex-row justify-between">
                                      <View
                                        className="w-5 h-5 rounded-full items-center justify-center"
                                        style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}
                                      >
                                        {video.is_public ? (
                                          <Eye color="#22c55e" size={11} />
                                        ) : (
                                          <EyeOff color="#71717a" size={11} />
                                        )}
                                      </View>

                                      {video.spotify?.enabled && (
                                        <View
                                          className="w-5 h-5 rounded-full items-center justify-center"
                                          style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}
                                        >
                                          <Music color="#1DB954" size={11} />
                                        </View>
                                      )}
                                    </View>

                                    <View className="absolute bottom-1.5 left-1.5 right-1.5">
                                      {(video.weight > 0 || video.reps > 0) && (
                                        <Text
                                          className="text-white font-bold text-[11px]"
                                          numberOfLines={1}
                                        >
                                          {video.weight > 0 && video.reps > 0
                                            ? `${video.weight}kg × ${video.reps}`
                                            : video.weight > 0
                                              ? `${video.weight}kg`
                                              : `${video.reps} reps`}
                                        </Text>
                                      )}
                                      {video.free_text && (
                                        <Text
                                          className="text-zinc-300 text-[9px] italic"
                                          numberOfLines={1}
                                        >
                                          {video.free_text}
                                        </Text>
                                      )}
                                      <Text className="text-zinc-400 text-[9px]">{video.date}</Text>
                                    </View>
                                  </View>
                                </Pressable>
                              ))}

                            {variation.videos.length > 5 && (
                              <TouchableOpacity
                                onPress={() => {
                                  setModalExercise(item);
                                  setHistorialModalVisible(true);
                                }}
                                className="items-center justify-center"
                                style={{
                                  width: 75,
                                  height: 133,
                                  backgroundColor: spotifyIsPlaying ? 'rgba(0,0,0,0.4)' : '#18181b',
                                  borderRadius: 10,
                                  borderWidth: 1,
                                  borderColor: spotifyIsPlaying
                                    ? 'rgba(255,255,255,0.15)'
                                    : '#27272a',
                                }}
                              >
                                <Text className="text-zinc-400 text-[10px] font-bold">
                                  Ver todo
                                </Text>
                                <Text className="text-fire-orange text-lg font-bold mt-0.5">
                                  +{variation.videos.length - 5}
                                </Text>
                              </TouchableOpacity>
                            )}
                          </ScrollView>
                        ) : (
                          <View
                            className="items-center justify-center py-4 rounded-xl"
                            style={{
                              backgroundColor: spotifyIsPlaying ? 'rgba(0,0,0,0.4)' : '#0a0a0a',
                              borderWidth: 1,
                              borderColor: spotifyIsPlaying ? 'rgba(255,255,255,0.1)' : '#1a1a1a',
                            }}
                          >
                            <Video color="#52525b" size={24} />
                            <Text className="text-zinc-600 text-xs mt-2">Sin registros aún</Text>
                            <Text className="text-zinc-700 text-[10px] mt-0.5">
                              Graba tu primera serie
                            </Text>
                          </View>
                        )}
                      </View>
                    </View>
                  );
                }}
              />

              {/* CARD ESTRUCTURA - FIJA (fuera del scroll horizontal) */}
              <View
                className="px-4 pt-4"
                style={{
                  paddingRight: 90,
                  backgroundColor: spotifyIsPlaying ? 'transparent' : '#000',
                }}
              >
                <SeriesCard
                  exerciseId={item.exercise_id}
                  exerciseName={item.name}
                  series={item.series || []}
                  isActive={index === activeExerciseIndex}
                  spotifyMode={spotifyIsPlaying}
                  onPress={() => {
                    setModalExercise(item);
                    // BUGFIX: Capturar el día actual al abrir el modal para evitar guardar en día incorrecto
                    setFocusSeriesDayIndex(selectedDayIndex);
                    setStructureModalVisible(true);
                  }}
                />
              </View>

              {/* ESPACIADOR FLEXIBLE */}
              <View
                className="flex-1"
                style={{ backgroundColor: spotifyIsPlaying ? 'transparent' : '#000' }}
              />

              {/* FOOTER "PRÓXIMO" */}
              {index < exercises.length - 1 && (
                <View
                  className="py-3 px-4"
                  style={{
                    backgroundColor: spotifyIsPlaying
                      ? 'rgba(0, 0, 0, 0.5)'
                      : 'rgba(23, 23, 23, 0.95)',
                    borderTopWidth: 1,
                    borderTopColor: spotifyIsPlaying ? 'rgba(255,255,255,0.1)' : '#27272a',
                  }}
                >
                  <View className="flex-row items-center gap-2">
                    <ChevronDown color="#F97316" size={16} />
                    <Text className="text-zinc-500 text-xs tracking-wider uppercase">
                      Siguiente:
                    </Text>
                    <Text className="text-white text-xs font-bold flex-1" numberOfLines={1}>
                      {exercises[index + 1]?.name || 'Siguiente ejercicio'}
                    </Text>
                  </View>
                </View>
              )}
            </View>
          );
        }}
      />

      {/* MODALS */}
      {renderNotesModal()}
      {renderVideoNotesModal()}
      {renderHankModal()}
      {renderVideoViewer()}
      {renderHistorialModal()}
      {renderStructureModal()}
      {renderAddDayModal()}
      {renderFocusSeriesModal()}
      {renderCameraModal()}
      {renderEditorModal()}

      {/* Web Camera Modal - Solo para PWA */}
      <WebCameraModal
        visible={webCameraModalVisible}
        onClose={() => setWebCameraModalVisible(false)}
        onCapture={handleWebCameraCapture}
        allowVideo={true}
        exerciseName={exercises[currentExerciseIndex]?.name}
      />

      {/* GLOBAL UPLOAD INDICATOR - Se muestra sobre todo cuando está subiendo */}
      {captureProcessing && !cameraModalVisible && (
        <View
          className="absolute inset-0 bg-black/95 justify-center items-center z-50"
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        >
          <View className="bg-zinc-900 rounded-2xl p-8 items-center border border-zinc-800 mx-8">
            <View className="w-20 h-20 rounded-full bg-savage-red/20 items-center justify-center mb-4">
              <ActivityIndicator size="large" color="#DC2626" />
            </View>
            <Text className="text-white text-lg font-bold tracking-wider text-center">
              {uploadingMessage || 'PROCESANDO...'}
            </Text>
            <Text className="text-zinc-500 text-xs mt-2 text-center">
              {uploadingMessage ? 'Por favor espera' : 'Preparando archivo'}
            </Text>
          </View>
        </View>
      )}
    </GestureHandlerRootView>
  );
}
