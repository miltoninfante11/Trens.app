// =============================================================================
// PRO MEDIA EDITOR — Professional Video/Photo Editor
// TRENS watermark ALWAYS visible. Crop inline. Preview via swipe.
// Web-compatible: uses onLayout instead of .measure()
// =============================================================================

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  ActivityIndicator,
  PanResponder,
  GestureResponderEvent,
  TextInput,
  Dimensions,
  Animated,
  LayoutChangeEvent,
  Platform,
} from 'react-native';
import {
  X,
  Play,
  Scissors,
  RotateCcw,
  Download,
  Lock,
  Crop,
  Dumbbell,
  ChevronUp,
  ChevronDown,
  Globe,
} from 'lucide-react-native';
import { VideoView, useVideoPlayer } from 'expo-video';
import { Image as ExpoImage } from 'expo-image';
import * as Haptics from '../../lib/haptics';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const BOTTOM_PANEL_HEIGHT = 280;

// =============================================================================
// TIPOS
// =============================================================================

export interface MediaData {
  uri: string;
  type: 'video' | 'photo';
  duration?: number;
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

export interface ProMediaEditorProps {
  visible: boolean;
  mediaData: MediaData | null;
  spotifyMetadata: SpotifyMetadata | null;
  spotifyConnected: boolean;
  exerciseName?: string | null;
  isTactical?: boolean;
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
    filter: string;
    showOverlay: boolean;
    cropOffsetY?: number;
  }) => void;
  saving: boolean;
  keepSpotifyPlaying?: boolean;
}

// =============================================================================
// HELPERS
// =============================================================================

function formatSec(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 10);
  return m > 0 ? `${m}:${s.toString().padStart(2, '0')}.${ms}` : `${s}.${ms}s`;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function ProMediaEditor({
  visible,
  mediaData,
  exerciseName,
  isTactical = false,
  onClose,
  onSave,
  saving,
}: ProMediaEditorProps) {
  const isVideo = mediaData?.type === 'video';
  // --- Video ---
  const [isPlaying, setIsPlaying] = useState(true);
  const [currentVideoTime, setCurrentVideoTime] = useState(0);
  const [videoTrimStart, setVideoTrimStart] = useState(0);
  const [videoTrimEnd, setVideoTrimEnd] = useState(100);

  // --- Crop ---
  const [cropOffsetY, setCropOffsetY] = useState(0);
  const [activeTool, setActiveTool] = useState<'trim' | 'crop' | null>('trim');

  // --- Workout data ---
  const [isPublic, setIsPublic] = useState(true);
  const [weightKg, setWeightKg] = useState('');
  const [reps, setReps] = useState('');
  const [showWorkoutFields, setShowWorkoutFields] = useState(false);

  // --- Preview mode (swipe) ---
  const [previewMode, setPreviewMode] = useState(false);
  const panelAnim = useRef(new Animated.Value(0)).current;

  // --- Layout cache (web-compatible, no .measure()) ---
  const timelineLayout = useRef({ x: 0, y: 0, width: 0, pageX: 0 });
  const cropLayout = useRef({ x: 0, y: 0, width: 0, pageX: 0 });

  // --- Refs ---
  const videoTimelineRef = useRef<View>(null);
  const videoPlayerRef = useRef<any>(null);
  const hasInitializedRef = useRef(false);
  const currentValuesRef = useRef({
    videoTrimStart: 0,
    videoTrimEnd: 100,
    videoDurationMs: 30000,
  });

  // --- Video Player ---
  const videoPlayer = useVideoPlayer(isVideo ? mediaData?.uri || '' : '', (player) => {
    if (isVideo) {
      player.loop = true;
      player.play();
    }
  });

  useEffect(() => {
    if (isVideo) videoPlayerRef.current = videoPlayer;
  }, [videoPlayer, isVideo]);

  // --- Computed ---
  const videoDurationMs = (mediaData?.duration || 30) * 1000;
  const videoTrimStartMs = (videoTrimStart / 100) * videoDurationMs;
  const videoTrimEndMs = (videoTrimEnd / 100) * videoDurationMs;
  const trimmedDurationSec = (videoTrimEndMs - videoTrimStartMs) / 1000;

  // --- Update refs ---
  useEffect(() => {
    currentValuesRef.current = { videoTrimStart, videoTrimEnd, videoDurationMs };
  }, [videoTrimStart, videoTrimEnd, videoDurationMs]);

  // --- Playback simulation ---
  useEffect(() => {
    if (!visible || !mediaData || !isVideo) return;
    const interval = setInterval(() => {
      if (isPlaying) {
        setCurrentVideoTime((prev) => {
          const next = prev + 100;
          return next >= videoTrimEndMs ? videoTrimStartMs : next;
        });
      }
    }, 100);
    return () => clearInterval(interval);
  }, [visible, isPlaying, mediaData, videoTrimStartMs, videoTrimEndMs, isVideo]);

  // --- Reset on open ---
  useEffect(() => {
    if (visible && !hasInitializedRef.current) {
      hasInitializedRef.current = true;
      setVideoTrimStart(0);
      setVideoTrimEnd(100);
      setCurrentVideoTime(0);
      setIsPlaying(isVideo);
      setPreviewMode(false);
      setCropOffsetY(0);
      setWeightKg('');
      setReps('');
      setShowWorkoutFields(false);
      setActiveTool(isVideo ? 'trim' : 'crop');
      setIsPublic(true);
      panelAnim.setValue(0);
    } else if (!visible) {
      hasInitializedRef.current = false;
    }
  }, [visible, isVideo, panelAnim]);

  // --- onLayout handlers (web-safe) ---
  const handleTimelineLayout = useCallback((e: LayoutChangeEvent) => {
    const { x, y, width } = e.nativeEvent.layout;
    timelineLayout.current = { x, y, width, pageX: 0 };
    // On native, also try to get pageX
    if (videoTimelineRef.current && Platform.OS !== 'web') {
      videoTimelineRef.current.measure((_fx, _fy, _w, _h, pageX) => {
        timelineLayout.current.pageX = pageX || 0;
      });
    }
  }, []);

  const handleCropLayout = useCallback((e: LayoutChangeEvent) => {
    const { x, y, width } = e.nativeEvent.layout;
    cropLayout.current = { x, y, width, pageX: 0 };
  }, []);

  // --- Animate panel ---
  const animatePanel = useCallback(
    (toPreview: boolean) => {
      setPreviewMode(toPreview);
      Animated.spring(panelAnim, {
        toValue: toPreview ? 1 : 0,
        useNativeDriver: true,
        tension: 80,
        friction: 12,
      }).start();
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    },
    [panelAnim]
  );

  // --- Swipe PanResponder for preview toggle ---
  const swipePan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_evt, gs) => {
          return Math.abs(gs.dy) > 20 && Math.abs(gs.dy) > Math.abs(gs.dx) * 1.5;
        },
        onPanResponderRelease: (_evt, gs) => {
          if (gs.dy > 50 && !previewMode) {
            animatePanel(true);
          } else if (gs.dy < -50 && previewMode) {
            animatePanel(false);
          }
        },
      }),
    [previewMode, animatePanel]
  );

  // --- Playback ---
  const restartPlayback = useCallback(() => {
    if (!isVideo) return;
    try {
      if (videoPlayerRef.current) {
        const start = (currentValuesRef.current.videoTrimStart / 100) * (mediaData?.duration || 30);
        videoPlayerRef.current.currentTime = start;
        videoPlayerRef.current.play();
      }
      setIsPlaying(true);
      setCurrentVideoTime(
        (currentValuesRef.current.videoTrimStart / 100) * ((mediaData?.duration || 30) * 1000)
      );
    } catch (e) {
      console.warn('Restart error:', e);
    }
  }, [mediaData, isVideo]);

  const togglePlayback = useCallback(() => {
    if (!isVideo) return;
    try {
      if (isPlaying) {
        videoPlayerRef.current?.pause();
      } else {
        videoPlayerRef.current?.play();
      }
    } catch (e) {
      console.warn('Toggle error:', e);
    }
    setIsPlaying(!isPlaying);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [isPlaying, isVideo]);

  // --- Helper: get position relative to timeline using pageX from event ---
  const getRelativeX = useCallback(
    (evt: GestureResponderEvent, layout: { width: number; pageX: number }) => {
      // On web, .measure() doesn't work. Use event locationX when possible,
      // otherwise fallback to pageX minus a rough estimate.
      if (Platform.OS === 'web') {
        // On web, nativeEvent has locationX for the target element
        const locationX = (evt.nativeEvent as any).locationX;
        if (locationX !== undefined && locationX !== null) {
          return locationX;
        }
        // Fallback: use pageX and estimate container position
        // The timeline is 16px from left edge (px-4)
        const containerLeft = 16;
        return evt.nativeEvent.pageX - containerLeft;
      }
      // Native: use pageX from layout
      return evt.nativeEvent.pageX - layout.pageX;
    },
    []
  );

  // --- PanResponders para trim (web-compatible) ---
  const trimStartPan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          if (isVideo) {
            videoPlayerRef.current?.pause();
            setIsPlaying(false);
          }
        },
        onPanResponderMove: (evt: GestureResponderEvent, _gs) => {
          const width = timelineLayout.current.width;
          if (!width) return;
          const rel = getRelativeX(evt, timelineLayout.current);
          const pct = Math.max(
            0,
            Math.min(currentValuesRef.current.videoTrimEnd - 5, (rel / width) * 100)
          );
          setVideoTrimStart(pct);
          currentValuesRef.current.videoTrimStart = pct;
        },
        onPanResponderRelease: () => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          restartPlayback();
        },
      }),
    [restartPlayback, isVideo, getRelativeX]
  );

  const trimEndPan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          if (isVideo) {
            videoPlayerRef.current?.pause();
            setIsPlaying(false);
          }
        },
        onPanResponderMove: (evt: GestureResponderEvent, _gs) => {
          const width = timelineLayout.current.width;
          if (!width) return;
          const rel = getRelativeX(evt, timelineLayout.current);
          const pct = Math.max(
            currentValuesRef.current.videoTrimStart + 5,
            Math.min(100, (rel / width) * 100)
          );
          setVideoTrimEnd(pct);
          currentValuesRef.current.videoTrimEnd = pct;
        },
        onPanResponderRelease: () => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          restartPlayback();
        },
      }),
    [restartPlayback, isVideo, getRelativeX]
  );

  // --- Crop slider (web-compatible, uses accumulated dx) ---
  const cropStartRef = useRef(0);
  const cropValueRef = useRef(0);
  // Keep ref in sync
  useEffect(() => {
    cropValueRef.current = cropOffsetY;
  }, [cropOffsetY]);

  const cropPan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          cropStartRef.current = cropValueRef.current;
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        },
        onPanResponderMove: (_evt: GestureResponderEvent, gs) => {
          // Use dx (accumulated horizontal delta) — works on web
          const width = cropLayout.current.width || SCREEN_W - 32;
          const delta = (gs.dx / width) * 100;
          const newVal = Math.max(-50, Math.min(50, cropStartRef.current + delta));
          setCropOffsetY(newVal);
        },
        onPanResponderRelease: () => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        },
      }),
    [] // No dependencies — uses refs only
  );

  // --- Save ---
  const handleSave = useCallback(() => {
    onSave({
      mediaType: mediaData?.type || 'video',
      videoTrimStart,
      videoTrimEnd,
      spotifyTrack: null,
      isPublic,
      weightKg: weightKg.trim() ? parseFloat(weightKg) : null,
      reps: reps.trim() ? parseInt(reps, 10) : null,
      caption: null,
      filter: 'RAW',
      showOverlay: true,
      cropOffsetY,
    });
  }, [mediaData, videoTrimStart, videoTrimEnd, isPublic, weightKg, reps, cropOffsetY, onSave]);

  // --- Render ---
  if (!mediaData) return null;

  const hasWorkoutData = !!(weightKg.trim() || reps.trim());

  // Panel slide animation
  const panelTranslateY = panelAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, BOTTOM_PANEL_HEIGHT + 40],
  });

  // =======================================================================
  // RENDER
  // =======================================================================
  return (
    <Modal
      visible={visible}
      animationType="fade"
      presentationStyle="fullScreen"
      statusBarTranslucent
    >
      <View className="flex-1 bg-black">
        {/* ================================================================ */}
        {/* MEDIA PREVIEW — 9:16 aspect ratio                                */}
        {/* ================================================================ */}
        <View
          className="flex-1 items-center justify-center"
          style={{ backgroundColor: '#000' }}
          {...swipePan.panHandlers}
        >
          <View
            style={{
              width: previewMode ? SCREEN_W : SCREEN_W * 0.92,
              aspectRatio: 9 / 16,
              maxHeight: previewMode ? SCREEN_H : SCREEN_H * 0.62,
              borderRadius: previewMode ? 0 : 12,
              overflow: 'hidden',
              backgroundColor: '#0A0A0A',
            }}
          >
            {isVideo ? (
              <VideoView
                player={videoPlayer}
                style={{
                  flex: 1,
                  transform: [{ translateY: cropOffsetY * 3 }],
                }}
                contentFit="cover"
                nativeControls={false}
              />
            ) : (
              <ExpoImage
                source={{ uri: mediaData.uri }}
                style={{ flex: 1, transform: [{ translateY: cropOffsetY * 3 }] }}
                contentFit="cover"
              />
            )}

            {/* TRENS Watermark — SIEMPRE visible */}
            <View className="absolute bottom-6 left-0 right-0 items-center" pointerEvents="none">
              <Text
                style={{
                  color: 'rgba(255,255,255,0.75)',
                  fontSize: 13,
                  fontWeight: '900',
                  letterSpacing: 8,
                }}
              >
                TRENS
              </Text>
              {isTactical && exerciseName && (
                <Text
                  style={{
                    color: 'rgba(255,255,255,0.45)',
                    fontSize: 10,
                    fontWeight: '700',
                    marginTop: 2,
                    textTransform: 'uppercase',
                    letterSpacing: 2,
                  }}
                >
                  {exerciseName}
                </Text>
              )}
              {hasWorkoutData && (
                <View className="flex-row items-center mt-0.5">
                  {weightKg.trim() ? (
                    <Text
                      style={{
                        color: '#DC2626',
                        fontSize: 12,
                        fontWeight: '800',
                        fontFamily: 'monospace',
                      }}
                    >
                      {weightKg}kg
                    </Text>
                  ) : null}
                  {weightKg.trim() && reps.trim() ? (
                    <Text
                      style={{ color: 'rgba(255,255,255,0.3)', marginHorizontal: 4, fontSize: 10 }}
                    >
                      ×
                    </Text>
                  ) : null}
                  {reps.trim() ? (
                    <Text
                      style={{
                        color: 'rgba(255,255,255,0.7)',
                        fontSize: 12,
                        fontWeight: '800',
                        fontFamily: 'monospace',
                      }}
                    >
                      {reps}
                    </Text>
                  ) : null}
                </View>
              )}
            </View>

            {/* Crop guide lines (solo cuando crop activo) */}
            {activeTool === 'crop' && (
              <View className="absolute inset-0 items-center justify-center" pointerEvents="none">
                <View
                  className="absolute left-4 right-4"
                  style={{ top: '33%', height: 1, backgroundColor: 'rgba(220,38,38,0.3)' }}
                />
                <View
                  className="absolute left-4 right-4"
                  style={{ top: '66%', height: 1, backgroundColor: 'rgba(220,38,38,0.3)' }}
                />
                {cropOffsetY !== 0 && (
                  <View
                    className="px-3 py-1.5 rounded-full"
                    style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}
                  >
                    <Text
                      style={{
                        color: '#DC2626',
                        fontSize: 12,
                        fontWeight: '800',
                        fontFamily: 'monospace',
                      }}
                    >
                      {cropOffsetY > 0 ? '+' : ''}
                      {Math.round(cropOffsetY)}
                    </Text>
                  </View>
                )}
              </View>
            )}

            {/* Play/Pause overlay */}
            {isVideo && (
              <TouchableOpacity
                onPress={togglePlayback}
                className="absolute inset-0 items-center justify-center"
                activeOpacity={1}
              >
                {!isPlaying && (
                  <View
                    className="w-16 h-16 rounded-full items-center justify-center"
                    style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}
                  >
                    <Play color="#FFF" size={28} fill="#FFF" />
                  </View>
                )}
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* ================================================================ */}
        {/* TOP BAR                                                          */}
        {/* ================================================================ */}
        <View
          className="absolute top-0 left-0 right-0 pt-14 px-3 pb-2"
          style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}
        >
          <View className="flex-row items-center justify-between">
            <TouchableOpacity
              onPress={onClose}
              className="w-10 h-10 rounded-full items-center justify-center"
              style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
            >
              <X color="#FFF" size={20} />
            </TouchableOpacity>

            <View className="flex-row items-center gap-2">
              {isTactical && (
                <TouchableOpacity
                  onPress={() => {
                    setShowWorkoutFields(!showWorkoutFields);
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  }}
                  className="flex-row items-center px-3 py-2 rounded-full"
                  style={{
                    backgroundColor:
                      showWorkoutFields || hasWorkoutData
                        ? 'rgba(220,38,38,0.85)'
                        : 'rgba(0,0,0,0.6)',
                  }}
                >
                  <Dumbbell color="#FFF" size={14} />
                  <Text className="text-white text-[10px] font-bold ml-1.5">DATOS</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                onPress={() => {
                  setIsPublic(!isPublic);
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }}
                className="flex-row items-center px-3 py-2 rounded-full"
                style={{
                  backgroundColor: isPublic ? 'rgba(220,38,38,0.85)' : 'rgba(0,0,0,0.6)',
                }}
              >
                {isPublic ? <Globe color="#FFF" size={14} /> : <Lock color="#FFF" size={14} />}
                <Text className="text-white text-[10px] font-bold ml-1.5">
                  {isPublic ? 'PÚBLICO' : 'BÓVEDA'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* ================================================================ */}
        {/* WORKOUT FIELDS PANEL                                             */}
        {/* ================================================================ */}
        {showWorkoutFields && isTactical && (
          <View className="absolute left-4 right-4" style={{ top: SCREEN_H * 0.14 }}>
            <View
              className="rounded-2xl p-4"
              style={{
                backgroundColor: 'rgba(0,0,0,0.9)',
                borderWidth: 1,
                borderColor: 'rgba(220,38,38,0.3)',
              }}
            >
              <View className="flex-row items-center justify-between mb-3">
                <View className="flex-row items-center">
                  <Dumbbell color="#DC2626" size={14} />
                  <Text className="text-white text-xs font-bold ml-2 tracking-wider">
                    DATOS DEL EJERCICIO
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => {
                    setShowWorkoutFields(false);
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  }}
                >
                  <X color="#71717A" size={16} />
                </TouchableOpacity>
              </View>

              {exerciseName && (
                <View
                  className="mb-3 px-3 py-2 rounded-xl"
                  style={{ backgroundColor: 'rgba(220,38,38,0.1)' }}
                >
                  <Text
                    style={{
                      color: '#A1A1AA',
                      fontSize: 9,
                      fontWeight: '700',
                      textTransform: 'uppercase',
                      letterSpacing: 1,
                    }}
                  >
                    EJERCICIO
                  </Text>
                  <Text className="text-white font-bold text-sm uppercase">{exerciseName}</Text>
                </View>
              )}

              <View className="flex-row gap-3">
                <View className="flex-1">
                  <Text
                    style={{
                      color: '#71717A',
                      fontSize: 9,
                      fontWeight: '700',
                      marginBottom: 4,
                      letterSpacing: 1,
                    }}
                  >
                    PESO (KG)
                  </Text>
                  <View
                    style={{
                      backgroundColor: 'rgba(255,255,255,0.05)',
                      borderRadius: 12,
                      paddingHorizontal: 12,
                      paddingVertical: 10,
                      borderWidth: 1,
                      borderColor: 'rgba(255,255,255,0.08)',
                    }}
                  >
                    <TextInput
                      value={weightKg}
                      onChangeText={setWeightKg}
                      placeholder="0"
                      placeholderTextColor="#3f3f46"
                      keyboardType="decimal-pad"
                      style={{
                        color: '#FFF',
                        fontSize: 20,
                        fontWeight: '700',
                        fontFamily: 'monospace',
                        textAlign: 'center',
                        padding: 0,
                        height: 28,
                      }}
                    />
                  </View>
                </View>
                <View className="flex-1">
                  <Text
                    style={{
                      color: '#71717A',
                      fontSize: 9,
                      fontWeight: '700',
                      marginBottom: 4,
                      letterSpacing: 1,
                    }}
                  >
                    REPS
                  </Text>
                  <View
                    style={{
                      backgroundColor: 'rgba(255,255,255,0.05)',
                      borderRadius: 12,
                      paddingHorizontal: 12,
                      paddingVertical: 10,
                      borderWidth: 1,
                      borderColor: 'rgba(255,255,255,0.08)',
                    }}
                  >
                    <TextInput
                      value={reps}
                      onChangeText={setReps}
                      placeholder="0"
                      placeholderTextColor="#3f3f46"
                      keyboardType="number-pad"
                      style={{
                        color: '#FFF',
                        fontSize: 20,
                        fontWeight: '700',
                        fontFamily: 'monospace',
                        textAlign: 'center',
                        padding: 0,
                        height: 28,
                      }}
                    />
                  </View>
                </View>
              </View>

              {hasWorkoutData && (
                <TouchableOpacity
                  onPress={() => {
                    setWeightKg('');
                    setReps('');
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  }}
                  className="mt-3 py-2 rounded-xl items-center"
                  style={{ backgroundColor: 'rgba(255,255,255,0.05)' }}
                >
                  <Text style={{ color: '#71717A', fontSize: 11, fontWeight: '700' }}>LIMPIAR</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}

        {/* ================================================================ */}
        {/* PREVIEW SWIPE HINT                                               */}
        {/* ================================================================ */}
        {previewMode && (
          <View className="absolute bottom-6 left-0 right-0 items-center">
            <TouchableOpacity
              onPress={() => animatePanel(false)}
              className="flex-row items-center px-5 py-2.5 rounded-full"
              style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
              activeOpacity={0.7}
            >
              <ChevronUp color="#A1A1AA" size={14} />
              <Text style={{ color: '#A1A1AA', fontSize: 11, fontWeight: '600', marginLeft: 4 }}>
                Toca o desliza arriba para editar
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ================================================================ */}
        {/* BOTTOM PANEL (animated)                                          */}
        {/* ================================================================ */}
        <Animated.View
          style={{
            backgroundColor: '#0A0A0A',
            borderTopWidth: 1,
            borderTopColor: 'rgba(255,255,255,0.06)',
            transform: [{ translateY: panelTranslateY }],
          }}
        >
          {/* Swipe/tap hint bar */}
          <View className="items-center pt-2 pb-1">
            <TouchableOpacity
              onPress={() => animatePanel(!previewMode)}
              className="flex-row items-center px-6 py-1.5"
              activeOpacity={0.7}
            >
              <View
                style={{
                  width: 36,
                  height: 4,
                  borderRadius: 2,
                  backgroundColor: 'rgba(255,255,255,0.2)',
                }}
              />
            </TouchableOpacity>
            {!previewMode && (
              <TouchableOpacity
                onPress={() => animatePanel(true)}
                className="flex-row items-center mt-0.5"
                activeOpacity={0.7}
              >
                <ChevronDown color="#52525B" size={10} />
                <Text style={{ color: '#52525B', fontSize: 9, fontWeight: '600', marginLeft: 2 }}>
                  VISTA PREVIA
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {/* TOOL TABS */}
          <View className="flex-row px-4 mb-2 gap-2">
            {isVideo && (
              <TouchableOpacity
                onPress={() => {
                  setActiveTool('trim');
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }}
                className="flex-row items-center px-4 py-2 rounded-full"
                style={{
                  backgroundColor: activeTool === 'trim' ? '#DC2626' : 'rgba(255,255,255,0.06)',
                  borderWidth: activeTool === 'trim' ? 0 : 1,
                  borderColor: 'rgba(255,255,255,0.08)',
                }}
              >
                <Scissors color="#FFF" size={13} />
                <Text className="text-white text-xs font-bold ml-1.5">CORTAR</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={() => {
                setActiveTool('crop');
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }}
              className="flex-row items-center px-4 py-2 rounded-full"
              style={{
                backgroundColor: activeTool === 'crop' ? '#DC2626' : 'rgba(255,255,255,0.06)',
                borderWidth: activeTool === 'crop' ? 0 : 1,
                borderColor: 'rgba(255,255,255,0.08)',
              }}
            >
              <Crop color="#FFF" size={13} />
              <Text className="text-white text-xs font-bold ml-1.5">ENCUADRE</Text>
              {cropOffsetY !== 0 && (
                <View
                  className="ml-1.5 px-1.5 rounded-full"
                  style={{ backgroundColor: 'rgba(255,255,255,0.2)', paddingVertical: 1 }}
                >
                  <Text
                    style={{
                      color: '#FFF',
                      fontSize: 9,
                      fontWeight: '800',
                      fontFamily: 'monospace',
                    }}
                  >
                    {Math.round(Math.abs(cropOffsetY))}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          </View>

          {/* TOOL CONTENT */}
          <View style={{ minHeight: 90, paddingHorizontal: 16 }}>
            {/* ---- TRIM TOOL ---- */}
            {activeTool === 'trim' && isVideo && (
              <View>
                <View className="flex-row items-center justify-between mb-2">
                  <Text
                    style={{ color: '#A1A1AA', fontSize: 11, fontWeight: '700', letterSpacing: 1 }}
                  >
                    DURACIÓN
                  </Text>
                  <View className="flex-row items-center">
                    <Text style={{ color: '#71717A', fontSize: 11, fontFamily: 'monospace' }}>
                      {formatSec(videoTrimStartMs / 1000)}
                    </Text>
                    <Text style={{ color: '#3F3F46', marginHorizontal: 6 }}>→</Text>
                    <Text style={{ color: '#71717A', fontSize: 11, fontFamily: 'monospace' }}>
                      {formatSec(videoTrimEndMs / 1000)}
                    </Text>
                    <View
                      className="ml-2 px-2 rounded-md"
                      style={{ backgroundColor: 'rgba(220,38,38,0.2)', paddingVertical: 2 }}
                    >
                      <Text
                        style={{
                          color: '#DC2626',
                          fontSize: 11,
                          fontFamily: 'monospace',
                          fontWeight: '700',
                        }}
                      >
                        {formatDuration(trimmedDurationSec)}
                      </Text>
                    </View>
                  </View>
                </View>

                {/* Timeline */}
                <View
                  ref={videoTimelineRef}
                  onLayout={handleTimelineLayout}
                  style={{ height: 52, position: 'relative' }}
                >
                  {/* Track bg */}
                  <View
                    style={{
                      position: 'absolute',
                      left: 0,
                      right: 0,
                      top: 14,
                      height: 24,
                      borderRadius: 8,
                      backgroundColor: 'rgba(255,255,255,0.04)',
                      overflow: 'hidden',
                    }}
                  >
                    <View className="absolute inset-0 flex-row items-center px-0.5">
                      {Array.from({ length: 60 }).map((_, i) => {
                        const pct = (i / 60) * 100;
                        const inRange = pct >= videoTrimStart && pct <= videoTrimEnd;
                        const h = 4 + Math.abs(Math.sin(i * 0.7)) * 8 + (i % 3) * 2;
                        return (
                          <View key={i} className="flex-1 mx-px items-center justify-center">
                            <View
                              style={{
                                width: 2,
                                height: h,
                                backgroundColor: inRange ? '#DC2626' : 'rgba(255,255,255,0.08)',
                                borderRadius: 1,
                              }}
                            />
                          </View>
                        );
                      })}
                    </View>
                  </View>

                  {/* Active range */}
                  <View
                    style={{
                      position: 'absolute',
                      left: `${videoTrimStart}%`,
                      right: `${100 - videoTrimEnd}%`,
                      top: 12,
                      height: 28,
                      borderWidth: 2,
                      borderColor: '#DC2626',
                      borderRadius: 6,
                      backgroundColor: 'rgba(220,38,38,0.06)',
                    }}
                  />

                  {/* Playhead */}
                  <View
                    style={{
                      position: 'absolute',
                      left: `${(currentVideoTime / videoDurationMs) * 100}%`,
                      top: 10,
                      width: 2,
                      height: 32,
                      backgroundColor: '#FFFFFF',
                      borderRadius: 1,
                      zIndex: 5,
                    }}
                  />

                  {/* Start handle */}
                  <View
                    {...trimStartPan.panHandlers}
                    style={{
                      position: 'absolute',
                      left: `${videoTrimStart}%`,
                      marginLeft: -16,
                      top: 6,
                      width: 32,
                      height: 40,
                      zIndex: 20,
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'ew-resize' as any,
                    }}
                  >
                    <View
                      style={{
                        width: 20,
                        height: 36,
                        backgroundColor: '#DC2626',
                        borderRadius: 4,
                        borderWidth: 1,
                        borderColor: '#FF4444',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <View
                        style={{
                          width: 2,
                          height: 12,
                          backgroundColor: 'rgba(255,255,255,0.8)',
                          borderRadius: 1,
                        }}
                      />
                    </View>
                  </View>

                  {/* End handle */}
                  <View
                    {...trimEndPan.panHandlers}
                    style={{
                      position: 'absolute',
                      left: `${videoTrimEnd}%`,
                      marginLeft: -16,
                      top: 6,
                      width: 32,
                      height: 40,
                      zIndex: 20,
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'ew-resize' as any,
                    }}
                  >
                    <View
                      style={{
                        width: 20,
                        height: 36,
                        backgroundColor: '#DC2626',
                        borderRadius: 4,
                        borderWidth: 1,
                        borderColor: '#FF4444',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <View
                        style={{
                          width: 2,
                          height: 12,
                          backgroundColor: 'rgba(255,255,255,0.8)',
                          borderRadius: 1,
                        }}
                      />
                    </View>
                  </View>
                </View>
              </View>
            )}

            {/* ---- CROP TOOL (inline, con dx acumulado — funciona en web) ---- */}
            {activeTool === 'crop' && (
              <View>
                <View className="flex-row items-center justify-between mb-3">
                  <Text
                    style={{ color: '#A1A1AA', fontSize: 11, fontWeight: '700', letterSpacing: 1 }}
                  >
                    ENCUADRE 9:16
                  </Text>
                  {cropOffsetY !== 0 && (
                    <TouchableOpacity
                      onPress={() => {
                        setCropOffsetY(0);
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      }}
                      className="flex-row items-center px-2.5 py-1 rounded-full"
                      style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}
                    >
                      <RotateCcw color="#A1A1AA" size={11} />
                      <Text
                        style={{ color: '#A1A1AA', fontSize: 10, fontWeight: '700', marginLeft: 4 }}
                      >
                        CENTRAR
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>

                {/* Crop slider — usa dx acumulado en vez de .measure() */}
                <View
                  onLayout={handleCropLayout}
                  {...cropPan.panHandlers}
                  style={{
                    height: 48,
                    borderRadius: 12,
                    backgroundColor: 'rgba(255,255,255,0.04)',
                    borderWidth: 1,
                    borderColor: 'rgba(255,255,255,0.06)',
                    justifyContent: 'center',
                    paddingHorizontal: 16,
                    position: 'relative',
                    cursor: 'ew-resize' as any,
                  }}
                >
                  {/* Track line */}
                  <View
                    style={{
                      height: 3,
                      borderRadius: 2,
                      backgroundColor: 'rgba(255,255,255,0.1)',
                    }}
                  >
                    <View
                      style={{
                        position: 'absolute',
                        left: cropOffsetY < 0 ? `${50 + cropOffsetY * 0.4}%` : '50%',
                        width: `${Math.abs(cropOffsetY) * 0.4}%`,
                        height: 3,
                        backgroundColor: '#DC2626',
                        borderRadius: 2,
                      }}
                    />
                  </View>

                  {/* Thumb */}
                  <View
                    style={{
                      position: 'absolute',
                      left: `${50 + cropOffsetY * 0.4}%`,
                      marginLeft: -14,
                      width: 28,
                      height: 28,
                      borderRadius: 14,
                      backgroundColor: '#DC2626',
                      borderWidth: 2,
                      borderColor: '#FF4444',
                      alignItems: 'center',
                      justifyContent: 'center',
                      shadowColor: '#DC2626',
                      shadowOffset: { width: 0, height: 2 },
                      shadowOpacity: 0.5,
                      shadowRadius: 6,
                    }}
                  >
                    <View
                      style={{
                        width: 8,
                        height: 2,
                        backgroundColor: 'rgba(255,255,255,0.8)',
                        borderRadius: 1,
                      }}
                    />
                  </View>

                  {/* Labels */}
                  <View style={{ position: 'absolute', left: 12, top: 4 }}>
                    <Text style={{ color: '#3F3F46', fontSize: 8, fontWeight: '700' }}>ARRIBA</Text>
                  </View>
                  <View style={{ position: 'absolute', right: 12, top: 4 }}>
                    <Text style={{ color: '#3F3F46', fontSize: 8, fontWeight: '700' }}>ABAJO</Text>
                  </View>
                  <View
                    style={{
                      position: 'absolute',
                      left: 0,
                      right: 0,
                      top: 4,
                      alignItems: 'center',
                    }}
                  >
                    <Text style={{ color: '#3F3F46', fontSize: 8, fontWeight: '700' }}>CENTRO</Text>
                  </View>
                </View>
              </View>
            )}
          </View>

          {/* EXPORT BUTTON */}
          <View className="px-4 pb-8 pt-3">
            <TouchableOpacity
              onPress={handleSave}
              disabled={saving}
              style={{
                backgroundColor: '#DC2626',
                borderRadius: 16,
                paddingVertical: 14,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                shadowColor: '#DC2626',
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.3,
                shadowRadius: 8,
              }}
            >
              {saving ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <>
                  <Download color="#FFF" size={18} />
                  <Text
                    style={{
                      color: '#FFF',
                      fontWeight: '700',
                      fontSize: 14,
                      marginLeft: 8,
                    }}
                  >
                    {isPublic ? 'EXPORTAR' : 'GUARDAR EN BÓVEDA'}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

export default ProMediaEditor;
