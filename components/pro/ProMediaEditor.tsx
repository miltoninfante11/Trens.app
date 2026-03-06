// =============================================================================
// PRO MEDIA EDITOR — Professional Video/Photo Editor
// Instagram-style crop: pinch-to-zoom + pan within 9:16 frame.
// TRENS watermark ALWAYS visible. Trim + Crop inline. Preview via swipe.
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
  Animated as RNAnimated,
  LayoutChangeEvent,
  Platform,
} from 'react-native';
import { X, Play, Download, Dumbbell, ChevronUp, ChevronDown } from 'lucide-react-native';
import { VideoView, useVideoPlayer } from 'expo-video';
import { Image as ExpoImage } from 'expo-image';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import * as Haptics from '../../lib/haptics';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const BOTTOM_PANEL_HEIGHT = 280;
// Preview card: always 9:16, width-driven
const CARD_W = SCREEN_W * 0.92;
const CARD_H = CARD_W * (16 / 9);
// Smaller card when panel is open (fits above bottom panel + top bar)
const TOP_BAR_H = 80;
const AVAILABLE_H_WITH_PANEL = SCREEN_H - BOTTOM_PANEL_HEIGHT - TOP_BAR_H - 20;
const CARD_SCALE_WITH_PANEL = Math.min(1, AVAILABLE_H_WITH_PANEL / CARD_H);
const CROP_FRAME_W = CARD_W;
const CROP_FRAME_H = CARD_H;
const MIN_SCALE = 1;
const MAX_SCALE = 5;
const DISMISS_THRESHOLD = 100;

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
    cropScale?: number;
    cropTranslateX?: number;
    cropTranslateY?: number;
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

  // --- Crop (Instagram-style: pinch-to-zoom + pan) ---
  const cropScale = useSharedValue(1);
  const cropTranslateX = useSharedValue(0);
  const cropTranslateY = useSharedValue(0);
  const savedScale = useSharedValue(1);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);
  const [displayScale, setDisplayScale] = useState(1);
  const [cropModified, setCropModified] = useState(false);

  // --- Workout data ---
  const [isPublic, setIsPublic] = useState(true);
  const [weightKg, setWeightKg] = useState('');
  const [reps, setReps] = useState('');
  const [showWorkoutFields, setShowWorkoutFields] = useState(false);

  // --- Preview mode (swipe) ---
  const [previewMode, setPreviewMode] = useState(false);
  const panelAnim = useRef(new RNAnimated.Value(0)).current;

  // --- Dismiss gesture (swipe whole modal down) ---
  const dismissY = useSharedValue(0);

  const dismissAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: dismissY.value }],
  }));

  const dismissPanResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_evt, gs) => {
          // Only capture vertical drags downward, not conflicting with crop/trim
          return gs.dy > 10 && Math.abs(gs.dy) > Math.abs(gs.dx) * 2;
        },
        onPanResponderMove: (_evt, gs) => {
          if (gs.dy > 0) {
            dismissY.value = gs.dy;
          }
        },
        onPanResponderRelease: (_evt, gs) => {
          if (gs.dy > DISMISS_THRESHOLD || gs.vy > 0.5) {
            // Dismiss: animate out and close
            dismissY.value = withTiming(SCREEN_H, { duration: 200 });
            setTimeout(() => {
              dismissY.value = 0;
              onClose();
            }, 200);
          } else {
            // Snap back
            dismissY.value = withSpring(0, { damping: 20, stiffness: 300 });
          }
        },
        onPanResponderTerminate: () => {
          dismissY.value = withSpring(0, { damping: 20, stiffness: 300 });
        },
      }),
    [onClose]
  );

  // --- Layout cache (web-compatible, no .measure()) ---
  const timelineLayout = useRef({ x: 0, y: 0, width: 0, pageX: 0 });

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
      cropScale.value = 1;
      cropTranslateX.value = 0;
      cropTranslateY.value = 0;
      savedScale.value = 1;
      savedTranslateX.value = 0;
      savedTranslateY.value = 0;
      setDisplayScale(1);
      setCropModified(false);
      setWeightKg('');
      setReps('');
      setShowWorkoutFields(false);
      setIsPublic(true);
      panelAnim.setValue(0);
      dismissY.value = 0;
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

  // --- Animate panel ---
  const animatePanel = useCallback(
    (toPreview: boolean) => {
      setPreviewMode(toPreview);
      RNAnimated.spring(panelAnim, {
        toValue: toPreview ? 1 : 0,
        useNativeDriver: true,
        tension: 80,
        friction: 12,
      }).start();
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    },
    [panelAnim]
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

  // --- Instagram-style Crop Gestures (pinch-to-zoom + pan) ---
  const updateDisplayScale = useCallback((s: number) => {
    setDisplayScale(Math.round(s * 10) / 10);
  }, []);

  const markCropModified = useCallback(() => {
    setCropModified(true);
  }, []);

  const triggerHaptic = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  const pinchGesture = useMemo(
    () =>
      Gesture.Pinch()
        .onStart(() => {
          savedScale.value = cropScale.value;
        })
        .onUpdate((e) => {
          const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, savedScale.value * e.scale));
          cropScale.value = newScale;
          // Clamp translation when scale changes
          const maxTx = ((newScale - 1) * CROP_FRAME_W) / 2;
          const maxTy = ((newScale - 1) * CROP_FRAME_H) / 2;
          cropTranslateX.value = Math.max(-maxTx, Math.min(maxTx, cropTranslateX.value));
          cropTranslateY.value = Math.max(-maxTy, Math.min(maxTy, cropTranslateY.value));
          runOnJS(updateDisplayScale)(newScale);
        })
        .onEnd(() => {
          savedScale.value = cropScale.value;
          savedTranslateX.value = cropTranslateX.value;
          savedTranslateY.value = cropTranslateY.value;
          runOnJS(markCropModified)();
          runOnJS(triggerHaptic)();
        }),
    []
  );

  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .minPointers(1)
        .maxPointers(2)
        .onStart(() => {
          savedTranslateX.value = cropTranslateX.value;
          savedTranslateY.value = cropTranslateY.value;
        })
        .onUpdate((e) => {
          const s = cropScale.value;
          const maxTx = ((s - 1) * CROP_FRAME_W) / 2;
          const maxTy = ((s - 1) * CROP_FRAME_H) / 2;
          cropTranslateX.value = Math.max(
            -maxTx,
            Math.min(maxTx, savedTranslateX.value + e.translationX)
          );
          cropTranslateY.value = Math.max(
            -maxTy,
            Math.min(maxTy, savedTranslateY.value + e.translationY)
          );
        })
        .onEnd(() => {
          savedTranslateX.value = cropTranslateX.value;
          savedTranslateY.value = cropTranslateY.value;
          runOnJS(markCropModified)();
        }),
    []
  );

  const cropGesture = useMemo(
    () => Gesture.Simultaneous(pinchGesture, panGesture),
    [pinchGesture, panGesture]
  );

  const resetCrop = useCallback(() => {
    cropScale.value = withSpring(1, { damping: 15, stiffness: 120 });
    cropTranslateX.value = withSpring(0, { damping: 15, stiffness: 120 });
    cropTranslateY.value = withSpring(0, { damping: 15, stiffness: 120 });
    savedScale.value = 1;
    savedTranslateX.value = 0;
    savedTranslateY.value = 0;
    setDisplayScale(1);
    setCropModified(false);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  const cropAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: cropTranslateX.value },
      { translateY: cropTranslateY.value },
      { scale: cropScale.value },
    ],
  }));

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
      cropOffsetY: 0,
      cropScale: cropScale.value,
      cropTranslateX: cropTranslateX.value,
      cropTranslateY: cropTranslateY.value,
    });
  }, [mediaData, videoTrimStart, videoTrimEnd, isPublic, weightKg, reps, onSave]);

  // --- Render ---
  if (!mediaData) return null;

  const hasWorkoutData = !!(weightKg.trim() || reps.trim());

  // Panel slide animation
  const panelTranslateY = panelAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, BOTTOM_PANEL_HEIGHT + 40],
  });

  // Preview card scale: shrink when panel is visible, full when preview mode
  const cardScale = panelAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [CARD_SCALE_WITH_PANEL, 1],
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
      <GestureHandlerRootView style={{ flex: 1 }}>
      <Animated.View
        style={[{ flex: 1, backgroundColor: '#000' }, dismissAnimatedStyle]}
        {...dismissPanResponder.panHandlers}
      >
        {/* ================================================================ */}
        {/* MEDIA PREVIEW — 9:16 aspect ratio                                */}
        {/* ================================================================ */}
        <View
          className="flex-1 items-center justify-center"
          style={{ backgroundColor: '#000' }}
        >
          <RNAnimated.View
            style={{
              width: CARD_W,
              height: CARD_H,
              borderRadius: 12,
              overflow: 'hidden',
              backgroundColor: '#0A0A0A',
              transform: [{ scale: cardScale }],
            }}
          >
            <GestureDetector gesture={cropGesture}>
              <Animated.View style={[{ flex: 1 }, cropAnimatedStyle]}>
                {isVideo ? (
                  <VideoView
                    player={videoPlayer}
                    style={{ flex: 1 }}
                    contentFit="cover"
                    nativeControls={false}
                  />
                ) : (
                  <ExpoImage
                    source={{ uri: mediaData.uri }}
                    style={{ flex: 1 }}
                    contentFit="cover"
                  />
                )}
              </Animated.View>
            </GestureDetector>

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

            {/* Guide lines — siempre visibles */}
            <View className="absolute inset-0" pointerEvents="none">
              {/* Grid lines */}
              <View
                className="absolute left-0 right-0"
                style={{ top: '33.3%', height: 1, backgroundColor: 'rgba(255,255,255,0.2)' }}
              />
              <View
                className="absolute left-0 right-0"
                style={{ top: '66.6%', height: 1, backgroundColor: 'rgba(255,255,255,0.2)' }}
              />
              <View
                className="absolute top-0 bottom-0"
                style={{ left: '33.3%', width: 1, backgroundColor: 'rgba(255,255,255,0.2)' }}
              />
              <View
                className="absolute top-0 bottom-0"
                style={{ left: '66.6%', width: 1, backgroundColor: 'rgba(255,255,255,0.2)' }}
              />
              {/* Corner brackets */}
              {[
                { top: 0, left: 0 },
                { top: 0, right: 0 },
                { bottom: 0, left: 0 },
                { bottom: 0, right: 0 },
              ].map((pos, i) => (
                <View
                  key={i}
                  style={{
                    position: 'absolute',
                    ...pos,
                    width: 24,
                    height: 24,
                    borderColor: '#DC2626',
                    borderTopWidth: pos.top === 0 ? 3 : 0,
                    borderBottomWidth: pos.bottom === 0 ? 3 : 0,
                    borderLeftWidth: pos.left === 0 ? 3 : 0,
                    borderRightWidth: pos.right === 0 ? 3 : 0,
                  }}
                />
              ))}
              {/* Scale indicator */}
              {displayScale > 1 && (
                <View className="absolute top-3 left-0 right-0 items-center">
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
                      {displayScale.toFixed(1)}×
                    </Text>
                  </View>
                </View>
              )}
            </View>

            {/* Play/Pause overlay (video) or tap-to-preview (photo) */}
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
            {!isVideo && (
              <TouchableOpacity
                onPress={() => animatePanel(!previewMode)}
                className="absolute inset-0"
                activeOpacity={1}
              />
            )}
          </RNAnimated.View>
        </View>

        {/* ================================================================ */}
        {/* TOP BAR                                                          */}
        {/* ================================================================ */}
        <View
          className="absolute top-0 left-0 right-0 pt-14 px-3 pb-2"
          style={{ backgroundColor: 'transparent' }}
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
        <RNAnimated.View
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

          {/* TOOL CONTENT */}
          <View style={{ minHeight: 90, paddingHorizontal: 16 }}>
            {/* ---- TRIM TOOL ---- */}
            {isVideo && (
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
                    COMPARTIR
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </RNAnimated.View>
      </Animated.View>
      </GestureHandlerRootView>
    </Modal>
  );
}

export default ProMediaEditor;
