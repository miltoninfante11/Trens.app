// =============================================================================
// PRO MEDIA EDITOR - Editor unificado para Video + Foto
// Incluye: Filtros, Overlay de datos, Spotify, Timeline
// Formato fijo: 9:16 (vertical)
// =============================================================================

import React, { useState, useRef, useEffect, useCallback, memo, useMemo } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  ActivityIndicator,
  PanResponder,
  GestureResponderEvent,
  TextInput,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Dimensions,
} from 'react-native';
import {
  X,
  Play,
  Pause,
  Scissors,
  Music,
  RotateCcw,
  Share2,
  Eye,
  Lock,
  Search,
  Plus,
  ChevronLeft,
  Volume2,
  Sparkles,
  Type,
  Crop,
  Move,
} from 'lucide-react-native';
import { VideoView, useVideoPlayer } from 'expo-video';
import { Image as ExpoImage } from 'expo-image';
import * as Haptics from '../../lib/haptics';
import spotify from '../../services/spotify/spotify';
import { FILTER_LIST, FilterType, getFilter } from './filters';

// =============================================================================
// TIPOS
// =============================================================================

export interface MediaData {
  uri: string;
  type: 'video' | 'photo';
  duration?: number; // Solo para video
  width?: number;
  height?: number;
}

export interface SpotifyMetadata {
  enabled: boolean;
  trackUri: string;
  positionMs: number;
  trackName: string;
  artist: string;
  albumArt?: string;
  durationMs?: number;
}

interface SpotifyTrack {
  uri: string;
  name: string;
  artist: string;
  album: string;
  albumArt: string;
  durationMs: number;
  previewUrl?: string;
}

export interface ProMediaEditorProps {
  visible: boolean;
  mediaData: MediaData | null;
  spotifyMetadata: SpotifyMetadata | null;
  spotifyConnected: boolean;
  exerciseName?: string | null;
  onClose: () => void;
  onSave: (data: {
    mediaType: 'video' | 'photo';
    videoTrimStart: number;
    videoTrimEnd: number;
    spotifyTrack: SpotifyMetadata | null;
    isPublic: boolean;
    weightKg: number | null;
    reps: number | null;
    caption: string | null;
    filter: FilterType;
    showOverlay: boolean;
    cropOffsetY?: number; // -50 a 50, posición del recorte para fotos
  }) => void;
  saving: boolean;
  keepSpotifyPlaying?: boolean;
}

// =============================================================================
// TRACK ITEM COMPONENT
// =============================================================================

const TrackItem = memo(
  ({
    track,
    onSelect,
    onPreview,
    isPlaying,
  }: {
    track: SpotifyTrack;
    onSelect: () => void;
    onPreview?: () => void;
    isPlaying?: boolean;
  }) => (
    <View className="flex-row items-center p-3 bg-zinc-800/80 rounded-xl mb-2">
      {/* Album Art con botón de preview - Área separada */}
      <TouchableOpacity onPress={onPreview} className="relative" activeOpacity={0.7}>
        {track.albumArt ? (
          <Image source={{ uri: track.albumArt }} className="w-12 h-12 rounded-lg" />
        ) : (
          <View className="w-12 h-12 rounded-lg bg-zinc-700 items-center justify-center">
            <Music color="#71717A" size={20} />
          </View>
        )}

        {/* Overlay de Preview sobre la carátula */}
        <View
          className="absolute inset-0 rounded-lg items-center justify-center"
          style={{
            backgroundColor: isPlaying ? 'rgba(0,0,0,0.7)' : 'rgba(0,0,0,0.4)',
          }}
          pointerEvents="none"
        >
          {isPlaying ? (
            <View className="flex-row items-center gap-0.5">
              <View className="w-1 h-3 bg-green-500 rounded-full" />
              <View className="w-1 h-4 bg-green-500 rounded-full" />
              <View className="w-1 h-2 bg-green-500 rounded-full" />
            </View>
          ) : (
            <Play color="#1DB954" size={18} fill="#1DB954" />
          )}
        </View>
      </TouchableOpacity>

      {/* Info de la canción - Tappable para seleccionar */}
      <TouchableOpacity onPress={onSelect} className="flex-1 ml-3 mr-2" activeOpacity={0.7}>
        <Text className="text-white font-bold text-sm" numberOfLines={1}>
          {track.name}
        </Text>
        <Text className="text-zinc-400 text-xs" numberOfLines={1}>
          {track.artist}
        </Text>
      </TouchableOpacity>

      {/* Botón + para agregar */}
      <TouchableOpacity
        onPress={onSelect}
        className="w-8 h-8 rounded-full bg-green-600 items-center justify-center"
        activeOpacity={0.7}
      >
        <Plus color="#FFFFFF" size={16} />
      </TouchableOpacity>
    </View>
  )
);

TrackItem.displayName = 'TrackItem';

// =============================================================================
// FILTER PREVIEW COMPONENT
// =============================================================================

const FilterPreview = memo(
  ({
    filter,
    isSelected,
    onSelect,
    thumbnailUri,
  }: {
    filter: FilterType;
    isSelected: boolean;
    onSelect: () => void;
    thumbnailUri?: string;
  }) => {
    const config = getFilter(filter);

    return (
      <TouchableOpacity
        onPress={onSelect}
        className={`mr-3 items-center ${isSelected ? 'opacity-100' : 'opacity-60'}`}
      >
        <View
          className={`w-16 h-20 rounded-xl overflow-hidden border-2 ${
            isSelected ? 'border-savage-red' : 'border-transparent'
          }`}
        >
          {/* Thumbnail con filtro aplicado */}
          <View className="flex-1 bg-zinc-800 items-center justify-center">
            {thumbnailUri ? (
              <View className="w-full h-full">
                <Image source={{ uri: thumbnailUri }} className="w-full h-full" />
                {config.overlayColor && (
                  <View
                    className="absolute inset-0"
                    style={{
                      backgroundColor: config.overlayColor,
                      opacity: config.overlayOpacity || 0.1,
                    }}
                  />
                )}
              </View>
            ) : (
              <Text className="text-2xl">{config.emoji}</Text>
            )}
          </View>
        </View>
        <Text className={`text-xs mt-1 ${isSelected ? 'text-white font-bold' : 'text-zinc-500'}`}>
          {config.name}
        </Text>
      </TouchableOpacity>
    );
  }
);

FilterPreview.displayName = 'FilterPreview';

// =============================================================================
// HELPERS
// =============================================================================

function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function formatSeconds(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function ProMediaEditor({
  visible,
  mediaData,
  spotifyMetadata,
  spotifyConnected,
  exerciseName,
  onClose,
  onSave,
  saving,
  keepSpotifyPlaying = false,
}: ProMediaEditorProps) {
  const isVideo = mediaData?.type === 'video';
  const isPhoto = mediaData?.type === 'photo';

  // -------------------------------------------------------------------------
  // VIDEO STATE
  // -------------------------------------------------------------------------
  const [isPlaying, setIsPlaying] = useState(true);
  const [currentVideoTime, setCurrentVideoTime] = useState(0);
  const [videoTrimStart, setVideoTrimStart] = useState(0);
  const [videoTrimEnd, setVideoTrimEnd] = useState(100);

  // -------------------------------------------------------------------------
  // SPOTIFY STATE
  // -------------------------------------------------------------------------
  const [selectedTrack, setSelectedTrack] = useState<SpotifyMetadata | null>(spotifyMetadata);
  const [spotifyEnabled, setSpotifyEnabled] = useState(!!spotifyMetadata);
  const [showSpotifyBrowser, setShowSpotifyBrowser] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SpotifyTrack[]>([]);
  const [likedSongs, setLikedSongs] = useState<SpotifyTrack[]>([]);
  const [recentTracks, setRecentTracks] = useState<SpotifyTrack[]>([]);
  const [searching, setSearching] = useState(false);
  const [loadingLiked, setLoadingLiked] = useState(false);
  const [previewingTrack, setPreviewingTrack] = useState<string | null>(null);

  // -------------------------------------------------------------------------
  // FILTER STATE
  // -------------------------------------------------------------------------
  const [selectedFilter, setSelectedFilter] = useState<FilterType>('RAW');

  // -------------------------------------------------------------------------
  // OVERLAY STATE
  // -------------------------------------------------------------------------
  const [showOverlay, setShowOverlay] = useState(true);

  // -------------------------------------------------------------------------
  // PREVIEW MODE - Oculta todas las herramientas y muestra cómo se guardará
  // -------------------------------------------------------------------------
  const [previewMode, setPreviewMode] = useState(false);

  // -------------------------------------------------------------------------
  // CROP STATE - Para fotos: posición del recorte en 9:16
  // cropMode: si está activo el modo de ajuste de recorte
  // cropOffsetY: porcentaje de desplazamiento vertical (-50 a 50, 0 = centro)
  // -------------------------------------------------------------------------
  const [cropMode, setCropMode] = useState(false);
  const [cropOffsetY, setCropOffsetY] = useState(0); // -50 (arriba) a 50 (abajo)

  // -------------------------------------------------------------------------
  // UI STATE
  // -------------------------------------------------------------------------
  const [isPublic, setIsPublic] = useState(true);
  const [weightKg, setWeightKg] = useState<string>('');
  const [reps, setReps] = useState<string>('');
  const [caption, setCaption] = useState<string>('');

  // -------------------------------------------------------------------------
  // REFS
  // -------------------------------------------------------------------------
  const videoTimelineRef = useRef<View>(null);
  const spotifyTimelineRef = useRef<View>(null);
  const videoPlayerRef = useRef<any>(null);
  const wasEditorOpenRef = useRef(false);
  const hasInitializedRef = useRef(false); // Track if editor has been initialized
  const currentValuesRef = useRef({
    videoTrimStart: 0,
    videoTrimEnd: 100,
    videoDurationMs: 30000,
    spotifyPositionPercent: 0,
    spotifyDurationMs: 240000,
    spotifyPositionMs: 0,
    spotifyTrackUri: '',
  });

  // -------------------------------------------------------------------------
  // VIDEO PLAYER (solo para videos)
  // -------------------------------------------------------------------------
  const videoPlayer = useVideoPlayer(isVideo ? mediaData?.uri || '' : '', (player) => {
    if (isVideo) {
      player.loop = true;
      player.play();
    }
  });

  useEffect(() => {
    if (isVideo) {
      videoPlayerRef.current = videoPlayer;
    }
  }, [videoPlayer, isVideo]);

  // -------------------------------------------------------------------------
  // COMPUTED VALUES
  // -------------------------------------------------------------------------
  const videoDurationMs = (mediaData?.duration || 30) * 1000;
  const videoTrimStartMs = (videoTrimStart / 100) * videoDurationMs;
  const videoTrimEndMs = (videoTrimEnd / 100) * videoDurationMs;
  const filterConfig = getFilter(selectedFilter);

  // -------------------------------------------------------------------------
  // EFFECTS
  // -------------------------------------------------------------------------

  // Update refs for PanResponders
  useEffect(() => {
    currentValuesRef.current = {
      videoTrimStart,
      videoTrimEnd,
      videoDurationMs,
      spotifyPositionPercent: selectedTrack
        ? (selectedTrack.positionMs / (selectedTrack.durationMs || 240000)) * 100
        : 0,
      spotifyDurationMs: selectedTrack?.durationMs || 240000,
      spotifyPositionMs: selectedTrack?.positionMs || 0,
      spotifyTrackUri: selectedTrack?.trackUri || '',
    };
  }, [videoTrimStart, videoTrimEnd, videoDurationMs, selectedTrack]);

  // Playback simulation (solo video)
  useEffect(() => {
    if (!visible || !mediaData || !isVideo) return;

    const interval = setInterval(() => {
      if (isPlaying) {
        setCurrentVideoTime((prev) => {
          const next = prev + 100;
          if (next >= videoTrimEndMs) return videoTrimStartMs;
          return next;
        });
      }
    }, 100);

    return () => clearInterval(interval);
  }, [visible, isPlaying, mediaData, videoTrimStartMs, videoTrimEndMs, isVideo]);

  // Reset on open - Solo cuando el editor se abre por primera vez
  useEffect(() => {
    if (visible && !hasInitializedRef.current) {
      // Primera vez que se abre - inicializar todo
      hasInitializedRef.current = true;
      setVideoTrimStart(0);
      setVideoTrimEnd(100);
      setSelectedTrack(spotifyMetadata);
      setSpotifyEnabled(!!spotifyMetadata);
      setCurrentVideoTime(0);
      setIsPlaying(isVideo);
      setShowSpotifyBrowser(false);
      setSearchQuery('');
      setSearchResults([]);
      setSelectedFilter('RAW');
      setShowOverlay(true);
      setPreviewMode(false);
      setCropMode(false);
      setCropOffsetY(0);
      setWeightKg('');
      setReps('');
      setCaption('');

      if (spotifyMetadata) {
        currentValuesRef.current.spotifyTrackUri = spotifyMetadata.trackUri;
        currentValuesRef.current.spotifyPositionMs = spotifyMetadata.positionMs;
        currentValuesRef.current.spotifyPositionPercent =
          (spotifyMetadata.positionMs / (spotifyMetadata.durationMs || 240000)) * 100;
        currentValuesRef.current.spotifyDurationMs = spotifyMetadata.durationMs || 240000;

        // Iniciar Spotify si es video
        if (isVideo) {
          spotify.play(spotifyMetadata.trackUri, spotifyMetadata.positionMs).catch((e) => {
            console.warn('Error starting Spotify:', e);
          });
        }
      }

      // Cargar canciones recientes
      loadRecentTracks();
    } else if (!visible) {
      // Cuando se cierra, resetear el flag para la próxima vez
      hasInitializedRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, spotifyMetadata, isVideo]);

  // Pausar Spotify al cerrar
  useEffect(() => {
    if (visible) {
      wasEditorOpenRef.current = true;
    } else if (wasEditorOpenRef.current) {
      wasEditorOpenRef.current = false;
      if (!keepSpotifyPlaying) {
        spotify.pause().catch(() => {});
      }
    }
  }, [visible, keepSpotifyPlaying]);

  // Load liked songs when browser opens
  useEffect(() => {
    if (showSpotifyBrowser && likedSongs.length === 0) {
      loadLikedSongs();
    }
  }, [showSpotifyBrowser]);

  // -------------------------------------------------------------------------
  // SPOTIFY HANDLERS
  // -------------------------------------------------------------------------

  const loadRecentTracks = useCallback(async () => {
    try {
      const recent = await spotify.getRecentlyPlayed(10);
      if (recent && recent.length > 0) {
        setRecentTracks(
          recent.map((item: any) => ({
            uri: item.uri,
            name: item.name,
            artist: item.artist,
            album: item.album || '',
            albumArt: item.albumArt || '',
            durationMs: item.durationMs || 180000,
            previewUrl: item.previewUrl,
          }))
        );
      }
    } catch (error) {
      console.warn('Error loading recent tracks:', error);
    }
  }, []);

  const loadLikedSongs = useCallback(async () => {
    setLoadingLiked(true);
    try {
      const data = await spotify.getLikedSongs(30, 0);
      if (data && data.length > 0) {
        setLikedSongs(
          data.map((item: any) => ({
            uri: item.uri,
            name: item.name,
            artist: item.artist,
            album: item.album,
            albumArt: item.albumArt || '',
            durationMs: item.durationMs,
            previewUrl: item.previewUrl,
          }))
        );
      }
    } catch (error) {
      console.warn('Error loading liked songs:', error);
    }
    setLoadingLiked(false);
  }, []);

  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) return;

    setSearching(true);
    try {
      const data = await spotify.searchTracks(searchQuery, 20);
      if (data && data.length > 0) {
        setSearchResults(
          data.map((track: any) => ({
            uri: track.uri,
            name: track.name,
            artist: track.artist,
            album: track.album,
            albumArt: track.albumArt || '',
            durationMs: track.durationMs,
            previewUrl: track.previewUrl,
          }))
        );
      } else {
        setSearchResults([]);
      }
    } catch (error) {
      console.warn('Error searching:', error);
    }
    setSearching(false);
  }, [searchQuery]);

  const handleSelectTrack = useCallback(
    async (track: SpotifyTrack) => {
      const syncedPositionMs = isVideo ? Math.floor((videoTrimStart / 100) * track.durationMs) : 0;

      const newTrack: SpotifyMetadata = {
        enabled: true,
        trackUri: track.uri,
        positionMs: syncedPositionMs,
        trackName: track.name,
        artist: track.artist,
        albumArt: track.albumArt,
        durationMs: track.durationMs,
      };

      setSelectedTrack(newTrack);
      setSpotifyEnabled(true);
      setShowSpotifyBrowser(false);
      setPreviewingTrack(null);

      currentValuesRef.current.spotifyTrackUri = track.uri;
      currentValuesRef.current.spotifyPositionMs = syncedPositionMs;
      currentValuesRef.current.spotifyPositionPercent = (syncedPositionMs / track.durationMs) * 100;
      currentValuesRef.current.spotifyDurationMs = track.durationMs;

      // Play si es video
      if (isVideo) {
        try {
          await spotify.play(track.uri, syncedPositionMs);
        } catch (e) {
          console.warn('Error playing track:', e);
        }
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    [videoTrimStart, isVideo]
  );

  // Preview track (long press)
  const handlePreviewTrack = useCallback(
    async (track: SpotifyTrack) => {
      if (previewingTrack === track.uri) {
        // Stop preview
        await spotify.pause();
        setPreviewingTrack(null);
      } else {
        // Start preview
        try {
          await spotify.play(track.uri, 30000); // Start at 30s (usually the hook)
          setPreviewingTrack(track.uri);
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

          // Auto-stop after 15 seconds
          setTimeout(async () => {
            if (previewingTrack === track.uri) {
              await spotify.pause();
              setPreviewingTrack(null);
            }
          }, 15000);
        } catch (e) {
          console.warn('Error previewing track:', e);
        }
      }
    },
    [previewingTrack]
  );

  const handleRemoveTrack = useCallback(() => {
    setSelectedTrack(null);
    setSpotifyEnabled(false);
    spotify.pause().catch(() => {});
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  // -------------------------------------------------------------------------
  // PLAYBACK HANDLERS
  // -------------------------------------------------------------------------

  const restartSyncedPlayback = useCallback(
    async (syncSpotifyToVideo: boolean = false) => {
      if (!isVideo) return;

      try {
        if (videoPlayerRef.current) {
          const trimStartSeconds =
            (currentValuesRef.current.videoTrimStart / 100) * (mediaData?.duration || 30);
          videoPlayerRef.current.currentTime = trimStartSeconds;
          videoPlayerRef.current.play();
        }

        const trackUri = currentValuesRef.current.spotifyTrackUri;
        let positionMs = currentValuesRef.current.spotifyPositionMs;

        if (syncSpotifyToVideo && trackUri) {
          const spotifyDurationMs = currentValuesRef.current.spotifyDurationMs;
          positionMs = Math.floor(
            (currentValuesRef.current.videoTrimStart / 100) * spotifyDurationMs
          );
          currentValuesRef.current.spotifyPositionMs = positionMs;
          currentValuesRef.current.spotifyPositionPercent = currentValuesRef.current.videoTrimStart;
          setSelectedTrack((prev) => (prev ? { ...prev, positionMs } : null));
        }

        if (trackUri && spotifyEnabled) {
          await spotify.play(trackUri, positionMs);
        }

        setIsPlaying(true);
        setCurrentVideoTime(
          (currentValuesRef.current.videoTrimStart / 100) * ((mediaData?.duration || 30) * 1000)
        );
      } catch (error) {
        console.warn('Error restarting playback:', error);
      }
    },
    [spotifyEnabled, mediaData, isVideo]
  );

  const togglePlayback = useCallback(async () => {
    if (!isVideo) return;

    try {
      if (isPlaying) {
        videoPlayerRef.current?.pause();
        if (spotifyEnabled && selectedTrack) await spotify.pause();
      } else {
        if (spotifyEnabled && selectedTrack) {
          if (videoPlayerRef.current) {
            videoPlayerRef.current.currentTime = videoTrimStartMs / 1000;
            videoPlayerRef.current.play();
          }
          setCurrentVideoTime(videoTrimStartMs);
          await spotify.play(selectedTrack.trackUri, selectedTrack.positionMs);
        } else {
          videoPlayerRef.current?.play();
        }
      }
    } catch (error) {
      console.warn('Error toggling playback:', error);
    }
    setIsPlaying(!isPlaying);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [isPlaying, spotifyEnabled, selectedTrack, videoTrimStartMs, isVideo]);

  // -------------------------------------------------------------------------
  // PAN RESPONDERS
  // -------------------------------------------------------------------------

  const videoTrimStartPanResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        },
        onPanResponderMove: (evt: GestureResponderEvent) => {
          if (!videoTimelineRef.current) return;
          videoTimelineRef.current.measure((_x, _y, width, _h, pageX) => {
            const relativeX = evt.nativeEvent.pageX - pageX;
            const percentage = Math.max(
              0,
              Math.min(currentValuesRef.current.videoTrimEnd - 10, (relativeX / width) * 100)
            );
            setVideoTrimStart(percentage);
            currentValuesRef.current.videoTrimStart = percentage;
          });
        },
        onPanResponderRelease: async () => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          await restartSyncedPlayback(false);
        },
      }),
    [restartSyncedPlayback]
  );

  const videoTrimEndPanResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        },
        onPanResponderMove: (evt: GestureResponderEvent) => {
          if (!videoTimelineRef.current) return;
          videoTimelineRef.current.measure((_x, _y, width, _h, pageX) => {
            const relativeX = evt.nativeEvent.pageX - pageX;
            const percentage = Math.max(
              currentValuesRef.current.videoTrimStart + 10,
              Math.min(100, (relativeX / width) * 100)
            );
            setVideoTrimEnd(percentage);
            currentValuesRef.current.videoTrimEnd = percentage;
          });
        },
        onPanResponderRelease: async () => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          await restartSyncedPlayback(false);
        },
      }),
    [restartSyncedPlayback]
  );

  const spotifyPositionPanResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          if (isVideo) {
            videoPlayerRef.current?.pause();
          }
          spotify.pause().catch(() => {});
          setIsPlaying(false);
        },
        onPanResponderMove: (evt: GestureResponderEvent) => {
          if (!spotifyTimelineRef.current) return;
          spotifyTimelineRef.current.measure((_x, _y, width, _h, pageX) => {
            if (width === 0) return;
            const relativeX = evt.nativeEvent.pageX - pageX;
            const percentage = Math.max(0, Math.min(100, (relativeX / width) * 100));
            const positionMs = Math.floor(
              (percentage / 100) * currentValuesRef.current.spotifyDurationMs
            );

            currentValuesRef.current.spotifyPositionMs = positionMs;
            currentValuesRef.current.spotifyPositionPercent = percentage;
            setSelectedTrack((prev) => (prev ? { ...prev, positionMs } : null));
          });
        },
        onPanResponderRelease: async () => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          if (isVideo) {
            await restartSyncedPlayback(false);
          }
        },
      }),
    [restartSyncedPlayback, isVideo]
  );

  // -------------------------------------------------------------------------
  // SAVE HANDLER
  // -------------------------------------------------------------------------

  const handleSave = useCallback(() => {
    onSave({
      mediaType: mediaData?.type || 'video',
      videoTrimStart,
      videoTrimEnd,
      spotifyTrack: spotifyEnabled && selectedTrack ? selectedTrack : null,
      isPublic,
      weightKg: weightKg.trim() ? parseFloat(weightKg) : null,
      reps: reps.trim() ? parseInt(reps, 10) : null,
      caption: caption.trim() || null,
      filter: selectedFilter,
      showOverlay,
      cropOffsetY: isPhoto ? cropOffsetY : undefined,
    });
  }, [
    mediaData,
    videoTrimStart,
    videoTrimEnd,
    spotifyEnabled,
    selectedTrack,
    isPublic,
    weightKg,
    reps,
    caption,
    selectedFilter,
    showOverlay,
    cropOffsetY,
    isPhoto,
    onSave,
  ]);

  // -------------------------------------------------------------------------
  // RENDER
  // -------------------------------------------------------------------------

  if (!mediaData) return null;

  const tracksToShow =
    searchResults.length > 0 ? searchResults : recentTracks.length > 0 ? recentTracks : likedSongs;

  const tracksLabel =
    searchResults.length > 0
      ? 'Resultados'
      : recentTracks.length > 0
        ? 'Recientes'
        : 'Tus favoritas';

  return (
    <Modal
      visible={visible}
      animationType="fade"
      presentationStyle="fullScreen"
      statusBarTranslucent
    >
      <View className="flex-1 bg-black">
        {/* FULLSCREEN MEDIA CON FILTRO */}
        <View className="absolute inset-0">
          {isVideo ? (
            <VideoView
              player={videoPlayer}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
              }}
              contentFit="cover"
              nativeControls={false}
            />
          ) : (
            <View className="flex-1 items-center justify-center overflow-hidden">
              <ExpoImage
                source={{ uri: mediaData.uri }}
                style={{
                  width: '100%',
                  height: '100%',
                  transform: [{ translateY: cropOffsetY * 5 }], // Multiplicamos para dar más rango
                }}
                contentFit="cover"
              />
            </View>
          )}

          {/* Filter Overlay */}
          {filterConfig.overlayColor && (
            <View
              className="absolute inset-0"
              style={{
                backgroundColor: filterConfig.overlayColor,
                opacity: filterConfig.overlayOpacity || 0.1,
              }}
              pointerEvents="none"
            />
          )}
        </View>

        {/* DATA OVERLAY (si está habilitado y hay datos) - Posición ajustada para preview mode */}
        {showOverlay && (exerciseName || weightKg || reps) && (
          <View
            className={`absolute left-4 right-4 ${previewMode ? 'bottom-24' : 'bottom-40'}`}
            pointerEvents="none"
          >
            <View className="bg-black/60 rounded-2xl p-4 border border-zinc-700">
              {exerciseName && (
                <Text className="text-white font-bold text-lg uppercase tracking-wide">
                  {exerciseName}
                </Text>
              )}
              {(weightKg || reps) && (
                <View className="flex-row items-baseline mt-1">
                  {weightKg && (
                    <Text className="text-savage-red font-mono font-bold text-2xl">
                      {weightKg}kg
                    </Text>
                  )}
                  {weightKg && reps && <Text className="text-zinc-400 mx-2">×</Text>}
                  {reps && (
                    <Text className="text-white font-mono font-bold text-2xl">{reps} reps</Text>
                  )}
                </View>
              )}
            </View>
          </View>
        )}

        {/* ================================================================== */}
        {/* PREVIEW MODE - Vista limpia sin controles                          */}
        {/* ================================================================== */}
        {previewMode ? (
          <View className="absolute inset-0">
            {/* Top bar minimalista */}
            <View className="flex-row items-center justify-between px-4 pt-14">
              <TouchableOpacity
                onPress={() => setPreviewMode(false)}
                className="px-4 py-2 rounded-full flex-row items-center"
                style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
              >
                <ChevronLeft color="#FFFFFF" size={18} />
                <Text className="text-white font-bold text-sm ml-1">Editar</Text>
              </TouchableOpacity>

              <View
                className="px-3 py-1.5 rounded-full"
                style={{ backgroundColor: 'rgba(220,38,38,0.8)' }}
              >
                <Text className="text-white text-xs font-bold">👁 VISTA PREVIA</Text>
              </View>
            </View>

            {/* Centro - Play/Pause sutil (solo video) */}
            {isVideo && (
              <View className="flex-1 items-center justify-center">
                <TouchableOpacity
                  onPress={togglePlayback}
                  className="w-16 h-16 rounded-full items-center justify-center"
                  style={{ backgroundColor: 'rgba(0,0,0,0.3)' }}
                >
                  {isPlaying ? (
                    <Pause color="#FFFFFF" size={28} />
                  ) : (
                    <Play color="#FFFFFF" size={28} fill="#FFFFFF" />
                  )}
                </TouchableOpacity>
              </View>
            )}

            {/* Spacer para foto */}
            {isPhoto && <View className="flex-1" />}

            {/* Bottom section con Spotify y botón guardar */}
            <View className="px-4 pb-8">
              {/* Spotify indicator en preview mode */}
              {selectedTrack && spotifyEnabled && (
                <View
                  className="mb-4 rounded-xl p-3 flex-row items-center"
                  style={{
                    backgroundColor: 'rgba(0,0,0,0.7)',
                    borderWidth: 1,
                    borderColor: '#1DB954',
                  }}
                >
                  {selectedTrack.albumArt ? (
                    <Image
                      source={{ uri: selectedTrack.albumArt }}
                      className="w-10 h-10 rounded-lg"
                    />
                  ) : (
                    <View className="w-10 h-10 rounded-lg bg-zinc-700 items-center justify-center">
                      <Music color="#1DB954" size={18} />
                    </View>
                  )}
                  <View className="flex-1 ml-3">
                    <Text className="text-white text-sm font-bold" numberOfLines={1}>
                      {selectedTrack.trackName}
                    </Text>
                    <Text className="text-zinc-400 text-xs" numberOfLines={1}>
                      {selectedTrack.artist}
                    </Text>
                  </View>
                  <View className="px-2 py-1 rounded bg-green-500/20">
                    <Text className="text-green-500 text-xs font-bold">🎵 SYNC</Text>
                  </View>
                </View>
              )}

              <TouchableOpacity
                onPress={handleSave}
                disabled={saving}
                className="py-4 rounded-xl flex-row items-center justify-center bg-savage-red"
              >
                {saving ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <>
                    <Share2 color="#FFFFFF" size={20} />
                    <Text className="text-white font-bold text-base ml-2">
                      {isPublic ? 'COMPARTIR' : 'GUARDAR EN BÓVEDA'}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        ) : cropMode && isPhoto ? (
          /* ================================================================== */
          /* CROP MODE - Ajuste de posición de recorte para fotos              */
          /* ================================================================== */
          <View className="absolute inset-0">
            {/* Overlay oscuro con marco 9:16 */}
            <View className="absolute inset-0 bg-black/40" />

            {/* Marco guía 9:16 */}
            <View className="absolute inset-0 items-center justify-center pointer-events-none">
              <View
                style={{
                  width: Dimensions.get('window').width * 0.9,
                  aspectRatio: 9 / 16,
                  borderWidth: 2,
                  borderColor: '#DC2626',
                  borderStyle: 'dashed',
                }}
              />
            </View>

            {/* Instrucciones */}
            <View className="absolute top-14 left-0 right-0 items-center">
              <View className="px-4 py-2 rounded-full bg-black/70">
                <Text className="text-white text-sm font-bold">
                  ↕ Desliza para ajustar encuadre
                </Text>
              </View>
            </View>

            {/* Área de arrastre - toda la pantalla */}
            <View
              className="absolute inset-0"
              onStartShouldSetResponder={() => true}
              onMoveShouldSetResponder={() => true}
              onResponderMove={(evt) => {
                const { locationY, pageY } = evt.nativeEvent;
                const screenHeight = Dimensions.get('window').height;
                const centerY = screenHeight / 2;
                const deltaY = (pageY - centerY) / screenHeight;
                const newOffset = Math.max(-50, Math.min(50, deltaY * 100));
                setCropOffsetY(newOffset);
              }}
              onResponderRelease={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }}
            />

            {/* Slider visual */}
            <View className="absolute right-4 top-1/2 -translate-y-1/2 h-48 w-8 items-center">
              <View className="h-full w-1 bg-zinc-700 rounded-full">
                <View
                  className="absolute w-4 h-4 bg-savage-red rounded-full -left-1.5"
                  style={{
                    top: `${50 + cropOffsetY}%`,
                    transform: [{ translateY: -8 }],
                  }}
                />
              </View>
            </View>

            {/* Bottom controls */}
            <View className="absolute bottom-0 left-0 right-0 p-4 pb-8">
              <View className="flex-row gap-3">
                <TouchableOpacity
                  onPress={() => {
                    setCropOffsetY(0);
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  }}
                  className="flex-1 py-3 rounded-xl items-center"
                  style={{
                    backgroundColor: 'rgba(0,0,0,0.8)',
                    borderWidth: 1,
                    borderColor: '#3f3f46',
                  }}
                >
                  <Text className="text-zinc-400 font-bold">CENTRAR</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => {
                    setCropMode(false);
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  }}
                  className="flex-1 py-3 rounded-xl items-center bg-savage-red"
                >
                  <Text className="text-white font-bold">APLICAR</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        ) : (
          /* ================================================================== */
          /* MODO EDITOR - Controles completos                                  */
          /* ================================================================== */
          <View className="absolute inset-0" style={{ backgroundColor: 'rgba(0,0,0,0.3)' }}>
            {/* TOP BAR */}
            <View className="flex-row items-center justify-between px-4 pt-14">
              <TouchableOpacity
                onPress={onClose}
                className="w-10 h-10 rounded-full items-center justify-center"
                style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
              >
                <X color="#FFFFFF" size={22} />
              </TouchableOpacity>

              <View className="flex-row items-center gap-2">
                {/* Vista Previa Button */}
                <TouchableOpacity
                  onPress={() => {
                    setPreviewMode(true);
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  }}
                  className="flex-row items-center px-3 py-2 rounded-full"
                  style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
                >
                  <Eye color="#FFF" size={16} />
                  <Text className="text-white text-xs font-bold ml-1">PREVIEW</Text>
                </TouchableOpacity>

                {/* Overlay Toggle */}
                <TouchableOpacity
                  onPress={() => setShowOverlay(!showOverlay)}
                  className="flex-row items-center px-3 py-2 rounded-full"
                  style={{
                    backgroundColor: showOverlay ? 'rgba(220,38,38,0.8)' : 'rgba(0,0,0,0.6)',
                  }}
                >
                  <Type color="#FFF" size={16} />
                  <Text className="text-white text-xs font-bold ml-1">
                    {showOverlay ? 'ON' : 'OFF'}
                  </Text>
                </TouchableOpacity>

                {/* Crop Toggle - Solo para fotos */}
                {isPhoto && (
                  <TouchableOpacity
                    onPress={() => {
                      setCropMode(true);
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    }}
                    className="flex-row items-center px-3 py-2 rounded-full"
                    style={{
                      backgroundColor:
                        cropOffsetY !== 0 ? 'rgba(220,38,38,0.8)' : 'rgba(0,0,0,0.6)',
                    }}
                  >
                    <Crop color="#FFF" size={16} />
                    <Text className="text-white text-xs font-bold ml-1">AJUSTAR</Text>
                  </TouchableOpacity>
                )}

                {/* Public/Private Toggle */}
                <TouchableOpacity
                  onPress={() => setIsPublic(!isPublic)}
                  className="flex-row items-center px-3 py-2 rounded-full"
                  style={{ backgroundColor: isPublic ? 'rgba(220,38,38,0.8)' : 'rgba(0,0,0,0.6)' }}
                >
                  {isPublic ? <Eye color="#FFF" size={16} /> : <Lock color="#FFF" size={16} />}
                  <Text className="text-white text-xs font-bold ml-2">
                    {isPublic ? 'PÚBLICO' : 'BÓVEDA'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* CENTER - PLAY/PAUSE (solo video) */}
            {isVideo && (
              <View className="flex-1 items-center justify-center">
                <TouchableOpacity
                  onPress={togglePlayback}
                  className="w-16 h-16 rounded-full items-center justify-center"
                  style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
                >
                  {isPlaying ? (
                    <Pause color="#FFFFFF" size={28} />
                  ) : (
                    <Play color="#FFFFFF" size={28} fill="#FFFFFF" />
                  )}
                </TouchableOpacity>
              </View>
            )}

            {/* PHOTO: Más espacio en el centro */}
            {isPhoto && <View className="flex-1" />}

            {/* BOTTOM CONTROLS */}
            <View className="px-4 pb-8" style={{ backgroundColor: 'rgba(0,0,0,0.85)' }}>
              {/* FILTER SELECTOR */}
              <View className="mb-4 pt-4">
                <View className="flex-row items-center mb-3">
                  <Sparkles color="#DC2626" size={14} />
                  <Text className="text-white text-xs font-bold ml-2">FILTROS</Text>
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {FILTER_LIST.map((filterId) => (
                    <FilterPreview
                      key={filterId}
                      filter={filterId}
                      isSelected={selectedFilter === filterId}
                      onSelect={() => {
                        setSelectedFilter(filterId);
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      }}
                      thumbnailUri={mediaData.uri}
                    />
                  ))}
                </ScrollView>
              </View>

              {/* VIDEO TRIM TIMELINE (solo video) */}
              {isVideo && (
                <View className="mb-4">
                  <View className="flex-row items-center justify-between mb-2">
                    <View className="flex-row items-center">
                      <Scissors color="#DC2626" size={14} />
                      <Text className="text-white text-xs font-bold ml-2">RECORTAR</Text>
                    </View>
                    <Text className="text-zinc-400 text-xs font-mono">
                      {formatSeconds(videoTrimStartMs / 1000)} -{' '}
                      {formatSeconds(videoTrimEndMs / 1000)}
                    </Text>
                  </View>

                  <View ref={videoTimelineRef} className="relative h-10">
                    <View className="absolute left-0 right-0 top-4 h-2 bg-zinc-700 rounded-full" />
                    <View
                      className="absolute top-4 h-2 bg-red-500"
                      style={{
                        left: `${videoTrimStart}%`,
                        right: `${100 - videoTrimEnd}%`,
                      }}
                    />
                    <View
                      className="absolute top-3 w-1 h-4 bg-white rounded-full"
                      style={{ left: `${(currentVideoTime / videoDurationMs) * 100}%` }}
                    />

                    {/* Start handle */}
                    <View
                      {...videoTrimStartPanResponder.panHandlers}
                      className="absolute items-center"
                      style={{
                        left: `${videoTrimStart}%`,
                        marginLeft: -15,
                        top: -2,
                        width: 30,
                        height: 30,
                        zIndex: 10,
                      }}
                    >
                      <View className="w-6 h-6 rounded-md bg-red-500 items-center justify-center border border-red-300">
                        <Text className="text-white text-xs font-bold">‹</Text>
                      </View>
                    </View>

                    {/* End handle */}
                    <View
                      {...videoTrimEndPanResponder.panHandlers}
                      className="absolute items-center"
                      style={{
                        left: `${videoTrimEnd}%`,
                        marginLeft: -15,
                        top: -2,
                        width: 30,
                        height: 30,
                        zIndex: 10,
                      }}
                    >
                      <View className="w-6 h-6 rounded-md bg-red-500 items-center justify-center border border-red-300">
                        <Text className="text-white text-xs font-bold">›</Text>
                      </View>
                    </View>
                  </View>
                </View>
              )}

              {/* WORKOUT DATA SECTION */}
              <View className="mb-4">
                <View className="flex-row gap-2 mb-2">
                  <View className="flex-1 bg-zinc-800/50 rounded-xl p-3">
                    <Text className="text-zinc-400 text-xs font-bold mb-1">PESO (KG)</Text>
                    <TextInput
                      value={weightKg}
                      onChangeText={setWeightKg}
                      placeholder="—"
                      placeholderTextColor="#71717A"
                      keyboardType="decimal-pad"
                      className="text-white text-xl font-bold font-mono"
                      style={{ padding: 0, height: 28 }}
                    />
                  </View>

                  <View className="flex-1 bg-zinc-800/50 rounded-xl p-3">
                    <Text className="text-zinc-400 text-xs font-bold mb-1">REPS</Text>
                    <TextInput
                      value={reps}
                      onChangeText={setReps}
                      placeholder="—"
                      placeholderTextColor="#71717A"
                      keyboardType="number-pad"
                      className="text-white text-xl font-bold font-mono"
                      style={{ padding: 0, height: 28 }}
                    />
                  </View>
                </View>

                <View className="bg-zinc-800/50 rounded-xl p-3">
                  <TextInput
                    value={caption}
                    onChangeText={setCaption}
                    placeholder="Añadir caption... (opcional)"
                    placeholderTextColor="#71717A"
                    className="text-white text-sm"
                    style={{ padding: 0, height: 20 }}
                    maxLength={100}
                  />
                </View>
              </View>

              {/* SPOTIFY SECTION */}
              {spotifyConnected && (
                <View className="mb-4">
                  {selectedTrack ? (
                    <View className="bg-zinc-800/50 rounded-xl p-3">
                      <View className="flex-row items-center justify-between mb-2">
                        <View className="flex-row items-center">
                          <Music color="#1DB954" size={14} />
                          <Text className="text-green-500 text-xs font-bold ml-2">SPOTIFY</Text>
                        </View>
                        <TouchableOpacity
                          onPress={() => setSpotifyEnabled(!spotifyEnabled)}
                          className={`w-10 h-5 rounded-full ${spotifyEnabled ? 'bg-green-600' : 'bg-zinc-700'}`}
                          style={{ justifyContent: 'center', paddingHorizontal: 2 }}
                        >
                          <View
                            className="w-4 h-4 bg-white rounded-full"
                            style={{ alignSelf: spotifyEnabled ? 'flex-end' : 'flex-start' }}
                          />
                        </TouchableOpacity>
                      </View>

                      <View className="flex-row items-center">
                        {selectedTrack.albumArt ? (
                          <Image
                            source={{ uri: selectedTrack.albumArt }}
                            className="w-10 h-10 rounded"
                          />
                        ) : (
                          <View className="w-10 h-10 rounded bg-zinc-700 items-center justify-center">
                            <Music color="#71717A" size={16} />
                          </View>
                        )}
                        <View className="flex-1 ml-3">
                          <Text className="text-white text-sm font-bold" numberOfLines={1}>
                            {selectedTrack.trackName}
                          </Text>
                          <Text className="text-zinc-400 text-xs" numberOfLines={1}>
                            {selectedTrack.artist}
                          </Text>
                        </View>
                        <TouchableOpacity
                          onPress={() => setShowSpotifyBrowser(true)}
                          className="px-3 py-1.5 rounded-lg bg-zinc-700"
                        >
                          <Text className="text-zinc-300 text-xs">Cambiar</Text>
                        </TouchableOpacity>
                      </View>

                      {/* SPOTIFY POSITION PICKER (solo si está habilitado y es video) */}
                      {spotifyEnabled && isVideo && (
                        <View className="mt-3 pt-3 border-t border-zinc-700">
                          <View className="flex-row items-center justify-between mb-2">
                            <View className="flex-row items-center">
                              <Volume2 color="#1DB954" size={12} />
                              <Text className="text-zinc-400 text-xs ml-1">Punto de inicio</Text>
                            </View>
                            <Text className="text-green-500 text-xs font-mono font-bold">
                              {formatTime(selectedTrack.positionMs)} /{' '}
                              {formatTime(selectedTrack.durationMs || 240000)}
                            </Text>
                          </View>

                          <View
                            ref={spotifyTimelineRef}
                            {...spotifyPositionPanResponder.panHandlers}
                            className="h-12 rounded-lg overflow-hidden relative"
                            style={{ backgroundColor: 'rgba(29, 185, 84, 0.2)' }}
                          >
                            <View className="absolute inset-0 flex-row" pointerEvents="none">
                              {Array.from({ length: 30 }).map((_, i) => (
                                <View key={i} className="flex-1 mx-px justify-center items-center">
                                  <View
                                    style={{
                                      width: 2,
                                      height: 8 + Math.random() * 16,
                                      backgroundColor:
                                        i <
                                        (selectedTrack.positionMs /
                                          (selectedTrack.durationMs || 240000)) *
                                          30
                                          ? '#1DB954'
                                          : 'rgba(29, 185, 84, 0.3)',
                                      borderRadius: 1,
                                    }}
                                  />
                                </View>
                              ))}
                            </View>

                            <View
                              pointerEvents="none"
                              style={{
                                position: 'absolute',
                                left: `${(selectedTrack.positionMs / (selectedTrack.durationMs || 240000)) * 100}%`,
                                top: 0,
                                bottom: 0,
                                width: 24,
                                marginLeft: -12,
                                justifyContent: 'center',
                                alignItems: 'center',
                              }}
                            >
                              <View
                                style={{
                                  width: 4,
                                  height: '100%',
                                  backgroundColor: '#FFFFFF',
                                  borderRadius: 2,
                                }}
                              />
                              <View
                                style={{
                                  position: 'absolute',
                                  top: -4,
                                  width: 12,
                                  height: 12,
                                  borderRadius: 6,
                                  backgroundColor: '#1DB954',
                                  borderWidth: 2,
                                  borderColor: '#FFFFFF',
                                }}
                              />
                            </View>
                          </View>

                          <View className="flex-row justify-between mt-1">
                            <Text className="text-zinc-600 text-xs font-mono">0:00</Text>
                            <Text className="text-zinc-600 text-xs font-mono">
                              {formatTime(selectedTrack.durationMs || 240000)}
                            </Text>
                          </View>
                        </View>
                      )}
                    </View>
                  ) : (
                    <TouchableOpacity
                      onPress={() => setShowSpotifyBrowser(true)}
                      className="py-3 rounded-xl flex-row items-center justify-center"
                      style={{ backgroundColor: 'rgba(29, 185, 84, 0.3)' }}
                    >
                      <Music color="#1DB954" size={18} />
                      <Text className="text-green-500 text-sm font-bold ml-2">AGREGAR CANCIÓN</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}

              {/* ACTION BUTTONS */}
              <View className="flex-row gap-3">
                <TouchableOpacity
                  onPress={onClose}
                  className="flex-1 py-3 rounded-xl items-center justify-center"
                  style={{ backgroundColor: 'rgba(255,255,255,0.1)' }}
                >
                  <RotateCcw color="#FFFFFF" size={20} />
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handleSave}
                  disabled={saving}
                  className="flex-[3] py-3 rounded-xl flex-row items-center justify-center bg-savage-red"
                >
                  {saving ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <>
                      <Share2 color="#FFFFFF" size={20} />
                      <Text className="text-white font-bold text-base ml-2">
                        {isPublic ? 'COMPARTIR' : 'GUARDAR'}
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}

        {/* SPOTIFY BROWSER OVERLAY */}
        {showSpotifyBrowser && (
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            className="absolute inset-0"
            style={{ backgroundColor: 'rgba(0,0,0,0.95)' }}
          >
            <View className="flex-1 pt-14 px-4">
              {/* Header */}
              <View className="flex-row items-center mb-4">
                <TouchableOpacity
                  onPress={() => {
                    setShowSpotifyBrowser(false);
                    setPreviewingTrack(null);
                    spotify.pause().catch(() => {});
                  }}
                  className="w-10 h-10 rounded-full bg-zinc-800 items-center justify-center mr-3"
                >
                  <ChevronLeft color="#FFFFFF" size={22} />
                </TouchableOpacity>
                <Text className="text-white text-lg font-bold flex-1">Elegir canción</Text>
                {selectedTrack && (
                  <TouchableOpacity
                    onPress={handleRemoveTrack}
                    className="px-3 py-1.5 rounded-lg bg-red-500/20"
                  >
                    <Text className="text-red-500 text-xs font-bold">Quitar</Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* Preview Hint */}
              <View className="bg-zinc-800/50 rounded-lg px-3 py-2 mb-4 flex-row items-center">
                <Play color="#1DB954" size={14} />
                <Text className="text-zinc-400 text-xs ml-2">
                  Toca el ▶ en la carátula para escuchar preview
                </Text>
              </View>

              {/* Search Bar */}
              <View className="flex-row items-center bg-zinc-800 rounded-xl px-4 py-3 mb-4">
                <Search color="#71717A" size={18} />
                <TextInput
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  onSubmitEditing={handleSearch}
                  placeholder="Buscar canciones..."
                  placeholderTextColor="#71717A"
                  returnKeyType="search"
                  className="flex-1 text-white ml-3"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                {searching && <ActivityIndicator size="small" color="#1DB954" />}
              </View>

              {/* Results Label */}
              <Text className="text-zinc-500 text-xs mb-2 uppercase tracking-wide">
                {tracksLabel}
              </Text>

              {/* Track List */}
              {loadingLiked ? (
                <View className="flex-1 items-center justify-center">
                  <ActivityIndicator size="large" color="#1DB954" />
                </View>
              ) : (
                <FlatList
                  data={tracksToShow}
                  keyExtractor={(item) => item.uri}
                  renderItem={({ item }) => (
                    <TrackItem
                      track={item}
                      onSelect={() => handleSelectTrack(item)}
                      onPreview={() => handlePreviewTrack(item)}
                      isPlaying={previewingTrack === item.uri}
                    />
                  )}
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={{ paddingBottom: 100 }}
                  ListEmptyComponent={
                    <View className="items-center justify-center py-12">
                      <Music color="#71717A" size={48} />
                      <Text className="text-zinc-500 mt-4 text-center">
                        {searchQuery
                          ? 'No se encontraron canciones'
                          : 'Busca o escucha música en Spotify'}
                      </Text>
                    </View>
                  }
                />
              )}
            </View>
          </KeyboardAvoidingView>
        )}
      </View>
    </Modal>
  );
}

export default ProMediaEditor;
