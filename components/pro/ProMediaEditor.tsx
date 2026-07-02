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
  LayoutChangeEvent,
  Platform,
} from 'react-native';
import { X, Play, Download, Share2, Dumbbell, LogIn } from 'lucide-react-native';
import * as Sharing from 'expo-sharing';
import * as MediaLibrary from 'expo-media-library';
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
import ViewShot, { captureRef } from 'react-native-view-shot';
import * as Haptics from '../../lib/haptics';
import { ProBrandOverlay } from './ProBrandOverlay';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
// Preview card: always 9:16, width-driven
const CARD_W = SCREEN_W * 0.92;
const CARD_H = CARD_W * (16 / 9);
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
  mimeType?: string;
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
    brandedUri?: string;
  }) => void;
  saving: boolean;
  keepSpotifyPlaying?: boolean;
  /** Si es invitado sin sesión, muestra overlay de login al compartir/guardar */
  isGuest?: boolean;
  onGuestLogin?: () => void;
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
  isGuest = false,
  onGuestLogin,
}: ProMediaEditorProps) {
  const isVideo = mediaData?.type === 'video';
  const viewShotRef = useRef<any>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [savedToGallery, setSavedToGallery] = useState(false);
  const [guestPromptVisible, setGuestPromptVisible] = useState(false);
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
      setSavedToGallery(false);
      setGuestPromptVisible(false);
      dismissY.value = 0;
    } else if (!visible) {
      hasInitializedRef.current = false;
    }
  }, [visible, isVideo]);

  // --- Autoplay video when modal opens ---
  useEffect(() => {
    if (visible && isVideo && videoPlayerRef.current) {
      // Small delay to ensure the player is mounted and ready
      const t = setTimeout(() => {
        try {
          videoPlayerRef.current?.play();
          setIsPlaying(true);
        } catch {}
      }, 150);
      return () => clearTimeout(t);
    }
  }, [visible, isVideo]);

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

  // --- Capture branded photo (Canvas compositing — works on web & native) ---
  // Always outputs 9:16 crop at maximum quality, respecting user's pinch/pan.
  const capturePhoto = useCallback(async (): Promise<string> => {
    if (isVideo) return mediaData?.uri || '';

    const sourceUri = mediaData?.uri || '';

    // On web: use Canvas API to composite image + overlays in 9:16
    if (Platform.OS === 'web') {
      try {
        return await new Promise<string>((resolve, reject) => {
          const img = new window.Image();
          img.crossOrigin = 'anonymous';
          img.onload = () => {
            const W = img.naturalWidth;
            const H = img.naturalHeight;
            const TARGET_RATIO = 9 / 16;

            // === Compute "cover" fit: how the image maps to the 9:16 frame ===
            const frameW = CROP_FRAME_W; // screen px
            const frameH = CROP_FRAME_H; // screen px
            const coverScale = Math.max(frameW / W, frameH / H);

            // Read user's crop transforms (reanimated shared values)
            const userScale = cropScale.value;
            const userTX = cropTranslateX.value;
            const userTY = cropTranslateY.value;

            // Total scale: source px → screen px
            const totalScale = coverScale * userScale;

            // Visible region size in source pixels
            const visW = frameW / totalScale;
            const visH = frameH / totalScale;

            // Center of visible region in source pixels (accounting for user pan)
            const centerX = W / 2 - userTX / totalScale;
            const centerY = H / 2 - userTY / totalScale;

            // Source rectangle
            let sx = centerX - visW / 2;
            let sy = centerY - visH / 2;
            let sw = visW;
            let sh = visH;

            // Clamp to source bounds
            if (sx < 0) sx = 0;
            if (sy < 0) sy = 0;
            if (sx + sw > W) sx = W - sw;
            if (sy + sh > H) sy = H - sh;
            // Final safety clamp
            sx = Math.max(0, sx);
            sy = Math.max(0, sy);
            sw = Math.min(sw, W - sx);
            sh = Math.min(sh, H - sy);

            // Output canvas: 9:16 at max resolution from source
            // Use the visible source region's width as output width
            const outW = Math.round(sw);
            const outH = Math.round(outW / TARGET_RATIO);

            const canvas = document.createElement('canvas');
            canvas.width = outW;
            canvas.height = outH;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
              reject('No canvas context');
              return;
            }

            // High quality rendering
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';

            // 1) Draw cropped source region to fill 9:16 canvas
            ctx.drawImage(img, sx, sy, sw, sh, 0, 0, outW, outH);

            // Scale factor for overlay text (designed for 390px width)
            const S = outW / 390;

            // 2) "TRENS" — bottom center, italic bold
            ctx.textAlign = 'center';
            ctx.textBaseline = 'alphabetic';
            ctx.shadowColor = 'rgba(0,0,0,0.7)';
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 3 * S;
            ctx.shadowBlur = 12 * S;
            ctx.fillStyle = 'rgba(255,255,255,0.9)';
            ctx.font = `italic 900 ${36 * S}px system-ui, -apple-system, sans-serif`;
            ctx.letterSpacing = `${6 * S}px`;
            ctx.fillText('TRENS', outW / 2, outH - 44 * S);
            ctx.letterSpacing = '0px';

            // 3) "trens.app" — below TRENS
            ctx.shadowColor = 'transparent';
            ctx.shadowBlur = 0;
            ctx.fillStyle = 'rgba(255,255,255,0.5)';
            ctx.font = `600 ${12 * S}px system-ui, -apple-system, sans-serif`;
            ctx.letterSpacing = `${3 * S}px`;
            ctx.fillText('trens.app', outW / 2, outH - 24 * S);
            ctx.letterSpacing = '0px';

            ctx.textAlign = 'start';
            ctx.textBaseline = 'alphabetic';
            resolve(canvas.toDataURL('image/png', 1.0));
          };
          img.onerror = () => reject('Image load failed');
          img.src = sourceUri;
        });
      } catch (e) {
        console.warn('Canvas capture failed, using original:', e);
        return sourceUri;
      }
    }

    // On native: ViewShot captures the 9:16 frame including crop transforms
    if (viewShotRef.current) {
      try {
        const uri = await captureRef(viewShotRef.current, {
          format: 'png',
          quality: 1,
          result: 'tmpfile',
        });
        return uri;
      } catch (e) {
        console.warn('ViewShot capture failed, using original:', e);
      }
    }
    return sourceUri;
  }, [isVideo, mediaData, cropScale, cropTranslateX, cropTranslateY]);

  // --- Capture video cropped to 9:16 (web only — Canvas + MediaRecorder) ---
  const captureVideoCropped = useCallback(async (): Promise<{ uri: string; mimeType: string }> => {
    const sourceUri = mediaData?.uri || '';
    if (Platform.OS !== 'web' || !isVideo)
      return { uri: sourceUri, mimeType: mediaData?.mimeType || 'video/mp4' };

    try {
      return await new Promise((resolve, reject) => {
        const video = document.createElement('video');
        video.crossOrigin = 'anonymous';
        video.muted = true;
        video.playsInline = true;
        video.preload = 'auto';
        video.setAttribute('webkit-playsinline', 'true');

        video.onloadedmetadata = () => {
          const vW = video.videoWidth;
          const vH = video.videoHeight;
          const TARGET_RATIO = 9 / 16;

          // Compute cover-fit crop (same math as photos)
          const frameW = CROP_FRAME_W;
          const frameH = CROP_FRAME_H;
          const coverScale = Math.max(frameW / vW, frameH / vH);

          const userScale = cropScale.value;
          const userTX = cropTranslateX.value;
          const userTY = cropTranslateY.value;
          const totalScale = coverScale * userScale;

          const visW = frameW / totalScale;
          const visH = frameH / totalScale;
          const centerX = vW / 2 - userTX / totalScale;
          const centerY = vH / 2 - userTY / totalScale;

          let sx = centerX - visW / 2;
          let sy = centerY - visH / 2;
          let sw = visW;
          let sh = visH;
          if (sx < 0) sx = 0;
          if (sy < 0) sy = 0;
          if (sx + sw > vW) sx = vW - sw;
          if (sy + sh > vH) sy = vH - sh;
          sx = Math.max(0, sx);
          sy = Math.max(0, sy);
          sw = Math.min(sw, vW - sx);
          sh = Math.min(sh, vH - sy);

          // Output canvas: cap to 1080x1920 for performance
          const maxOutW = Math.min(Math.round(sw), 1080);
          const outW = maxOutW;
          const outH = Math.round(outW / TARGET_RATIO);

          const canvas = document.createElement('canvas');
          canvas.width = outW;
          canvas.height = outH;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject('No canvas context');
            return;
          }
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';

          // Choose best supported codec
          const codecs = [
            'video/mp4;codecs=avc1.640028',
            'video/mp4;codecs=avc1',
            'video/mp4',
            'video/webm;codecs=vp9',
            'video/webm;codecs=vp8',
            'video/webm',
          ];
          let chosenMime = 'video/webm';
          for (const c of codecs) {
            if (MediaRecorder.isTypeSupported(c)) {
              chosenMime = c;
              break;
            }
          }

          const stream = canvas.captureStream(30);
          const recorder = new MediaRecorder(stream, {
            mimeType: chosenMime,
            videoBitsPerSecond: 8_000_000,
          });
          const chunks: Blob[] = [];
          recorder.ondataavailable = (e) => {
            if (e.data.size > 0) chunks.push(e.data);
          };
          recorder.onstop = () => {
            const baseMime = chosenMime.split(';')[0];
            const blob = new Blob(chunks, { type: baseMime });
            const url = URL.createObjectURL(blob);
            resolve({ uri: url, mimeType: baseMime });
          };
          recorder.onerror = () => reject('MediaRecorder error');

          // Apply trim
          const durMs = videoDurationMs;
          const startSec = (videoTrimStart / 100) * (durMs / 1000);
          const endSec = (videoTrimEnd / 100) * (durMs / 1000);

          const drawFrame = () => {
            ctx.drawImage(video, sx, sy, sw, sh, 0, 0, outW, outH);

            // TRENS watermark
            const S = outW / 390;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'alphabetic';
            ctx.shadowColor = 'rgba(0,0,0,0.7)';
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 3 * S;
            ctx.shadowBlur = 12 * S;
            ctx.fillStyle = 'rgba(255,255,255,0.9)';
            ctx.font = `italic 900 ${36 * S}px system-ui, -apple-system, sans-serif`;
            ctx.letterSpacing = `${6 * S}px`;
            ctx.fillText('TRENS', outW / 2, outH - 44 * S);
            ctx.letterSpacing = '0px';
            ctx.shadowColor = 'transparent';
            ctx.shadowBlur = 0;
            ctx.fillStyle = 'rgba(255,255,255,0.5)';
            ctx.font = `600 ${12 * S}px system-ui, -apple-system, sans-serif`;
            ctx.letterSpacing = `${3 * S}px`;
            ctx.fillText('trens.app', outW / 2, outH - 24 * S);
            ctx.letterSpacing = '0px';
            ctx.textAlign = 'start';
            ctx.textBaseline = 'alphabetic';
          };

          // Use setInterval for consistent frame capture on mobile PWA
          // (requestAnimationFrame gets throttled on mobile browsers)
          video.currentTime = startSec;
          video.onseeked = () => {
            recorder.start();
            video.play();
            const frameInterval = setInterval(() => {
              if (video.paused || video.ended || video.currentTime >= endSec) {
                clearInterval(frameInterval);
                recorder.stop();
                video.pause();
                return;
              }
              drawFrame();
            }, 1000 / 30); // 30 fps

            // Safety: stop after expected duration + 2s buffer
            const safetyMs = (endSec - startSec) * 1000 + 2000;
            setTimeout(() => {
              if (recorder.state === 'recording') {
                clearInterval(frameInterval);
                recorder.stop();
                video.pause();
              }
            }, safetyMs);
          };
        };
        video.onerror = () => reject('Video load failed');
        video.src = sourceUri;
      });
    } catch (e) {
      console.warn('Video crop failed, using original:', e);
      return { uri: sourceUri, mimeType: mediaData?.mimeType || 'video/mp4' };
    }
  }, [
    isVideo,
    mediaData,
    cropScale,
    cropTranslateX,
    cropTranslateY,
    videoDurationMs,
    videoTrimStart,
    videoTrimEnd,
  ]);

  // --- Share ---
  const handleShare = useCallback(async () => {
    if (isGuest) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      setGuestPromptVisible(true);
      return;
    }
    setIsSaving(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      let uri: string;
      let mime: string;

      if (isVideo && Platform.OS === 'web') {
        // Video on web: crop to 9:16 via canvas re-encode
        const result = await captureVideoCropped();
        uri = result.uri;
        mime = result.mimeType;
      } else {
        uri = await capturePhoto();
        mime = mediaData?.mimeType || (isVideo ? 'video/mp4' : 'image/png');
      }

      const extMap: Record<string, string> = {
        'video/mp4': 'mp4',
        'video/quicktime': 'mov',
        'video/webm': 'webm',
        'video/x-msvideo': 'avi',
        'video/3gpp': '3gp',
        'image/png': 'png',
        'image/jpeg': 'jpg',
        'image/webp': 'webp',
        'image/heic': 'heic',
      };
      const ext = extMap[mime] || (isVideo ? 'mp4' : 'png');
      const fileName = `trens_${isVideo ? 'video' : 'photo'}_${Date.now()}.${ext}`;

      if (Platform.OS === 'web') {
        const res = await fetch(uri);
        const blob = await res.blob();
        const file = new File([blob], fileName, { type: mime });

        // Check if sharing files is supported (some browsers can't share video)
        if (navigator.share && navigator.canShare?.({ files: [file] })) {
          await navigator.share({ files: [file], title: 'TRENS' });
        } else {
          // Fallback: trigger download
          const downloadUrl = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = downloadUrl;
          a.download = fileName;
          a.style.display = 'none';
          a.setAttribute('target', '_self');
          document.body.appendChild(a);
          a.click();
          requestAnimationFrame(() => {
            document.body.removeChild(a);
          });
          setTimeout(() => URL.revokeObjectURL(downloadUrl), 10000);
        }
      } else {
        // Native: use expo-sharing
        const available = await Sharing.isAvailableAsync();
        if (available) {
          await Sharing.shareAsync(uri, {
            mimeType: mime,
            dialogTitle: 'Compartir desde TRENS',
          });
        }
      }
    } catch (e) {
      console.warn('Error sharing:', e);
    } finally {
      setIsSaving(false);
    }
  }, [capturePhoto, captureVideoCropped, isVideo, mediaData, isGuest]);

  // --- Save to gallery ---
  const handleSaveToGallery = useCallback(async () => {
    if (isGuest) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      setGuestPromptVisible(true);
      return;
    }
    setIsSaving(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      let uri: string;
      let mime: string;

      if (isVideo && Platform.OS === 'web') {
        // Video on web: crop to 9:16 via canvas re-encode
        const result = await captureVideoCropped();
        uri = result.uri;
        mime = result.mimeType;
      } else {
        uri = await capturePhoto();
        mime = mediaData?.mimeType || (isVideo ? 'video/mp4' : 'image/png');
      }

      if (Platform.OS === 'web') {
        const extMap: Record<string, string> = {
          'video/mp4': 'mp4',
          'video/quicktime': 'mov',
          'video/webm': 'webm',
          'video/x-msvideo': 'avi',
          'video/x-matroska': 'mkv',
          'video/3gpp': '3gp',
          'image/png': 'png',
          'image/jpeg': 'jpg',
          'image/webp': 'webp',
          'image/heic': 'heic',
          'image/heif': 'heif',
        };
        const ext = extMap[mime] || (isVideo ? 'mp4' : 'png');
        const fileName = `trens_${isVideo ? 'video' : 'photo'}_${Date.now()}.${ext}`;

        // For blob/object URIs: fetch and re-create for reliable download
        const res = await fetch(uri);
        const blob = await res.blob();
        const downloadUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = fileName;
        a.style.display = 'none';
        a.setAttribute('target', '_self');
        document.body.appendChild(a);
        a.click();
        // Limpiar inmediatamente para evitar navegación accidental
        requestAnimationFrame(() => {
          document.body.removeChild(a);
        });
        setTimeout(() => URL.revokeObjectURL(downloadUrl), 10000);
      } else {
        const { status } = await MediaLibrary.requestPermissionsAsync();
        if (status === 'granted') {
          await MediaLibrary.saveToLibraryAsync(uri);
        }
      }
      setSavedToGallery(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      console.warn('Error saving to gallery:', e);
    } finally {
      setIsSaving(false);
    }
  }, [capturePhoto, captureVideoCropped, isVideo, mediaData, isGuest]);

  // --- Render ---
  if (!mediaData) return null;

  const hasWorkoutData = !!(weightKg.trim() || reps.trim());

  // =======================================================================
  // RENDER — Overlay modal (Hank-style: transparent, slide, drag-to-close)
  // =======================================================================
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <GestureHandlerRootView style={{ flex: 1 }}>
        <Animated.View
          style={[
            {
              flex: 1,
              backgroundColor: '#0a0a0a',
              borderTopLeftRadius: isVideo ? 0 : 24,
              borderTopRightRadius: isVideo ? 0 : 24,
              borderTopWidth: isVideo ? 0 : 2,
              borderTopColor: 'rgba(220, 38, 38, 0.5)',
              overflow: 'hidden',
              marginTop: isVideo ? 0 : 44,
            },
            dismissAnimatedStyle,
          ]}
          {...dismissPanResponder.panHandlers}
        >
          {/* Red accent line (photo only) + Drag handle */}
          {!isVideo && (
            <View
              style={{
                width: '100%',
                height: 3,
                backgroundColor: '#DC2626',
                shadowColor: '#DC2626',
                shadowOffset: { width: 0, height: 0 },
                shadowOpacity: 0.8,
                shadowRadius: 8,
              }}
            />
          )}
          <View className="items-center" style={{ paddingTop: isVideo ? 12 : 8, paddingBottom: 4 }}>
            <View className="w-12 h-1.5 bg-zinc-600 rounded-full" />
          </View>

          {/* ================================================================ */}
          {/* MEDIA PREVIEW — fills available space                            */}
          {/* ================================================================ */}
          <View className="flex-1 items-center justify-center px-3">
            <View
              style={{
                width: CARD_W,
                height: CARD_H,
                maxHeight: SCREEN_H - 220,
                borderRadius: 16,
                overflow: 'hidden',
                backgroundColor: '#0A0A0A',
              }}
            >
              <ViewShot
                ref={viewShotRef}
                options={{ format: 'png', quality: 1 }}
                style={{ flex: 1 }}
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

                {/* Brand Overlay — TRENS branding only (no pills) */}
                <ProBrandOverlay hideGuides />
              </ViewShot>

              {/* Scale indicator — outside ViewShot (not baked in) */}
              {displayScale > 1 && (
                <View className="absolute top-3 left-0 right-0 items-center" pointerEvents="none">
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

              {/* Play/Pause overlay (video only) */}
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
          {/* TOP BAR — workout toggle (floating)                              */}
          {/* ================================================================ */}
          {isTactical && (
            <View className="absolute top-16 right-3" style={{ zIndex: 20 }}>
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
            </View>
          )}

          {/* ================================================================ */}
          {/* WORKOUT FIELDS PANEL (floating)                                  */}
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
                    <Text style={{ color: '#71717A', fontSize: 11, fontWeight: '700' }}>
                      LIMPIAR
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          )}

          {/* ================================================================ */}
          {/* VIDEO TRIM (only for video)                                      */}
          {/* ================================================================ */}
          {isVideo && (
            <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
              <View className="flex-row items-center justify-between mb-2">
                <Text
                  style={{
                    color: '#A1A1AA',
                    fontSize: 11,
                    fontWeight: '700',
                    letterSpacing: 1,
                  }}
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

          {/* ================================================================ */}
          {/* EXPORT BUTTONS — bottom                                          */}
          {/* ================================================================ */}
          <View className="px-4 pb-10 pt-4">
            {/* Video on web (PWA): single GUARDAR button */}
            {isVideo && Platform.OS === 'web' ? (
              <TouchableOpacity
                onPress={handleSaveToGallery}
                disabled={isSaving}
                style={{
                  backgroundColor: savedToGallery ? 'rgba(34, 197, 94, 0.2)' : '#DC2626',
                  borderRadius: 16,
                  paddingVertical: 16,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  shadowColor: savedToGallery ? '#22C55E' : '#DC2626',
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.3,
                  shadowRadius: 8,
                }}
              >
                {isSaving ? (
                  <ActivityIndicator color="#FFF" />
                ) : (
                  <>
                    <Download color={savedToGallery ? '#22C55E' : '#FFF'} size={20} />
                    <Text
                      style={{
                        color: savedToGallery ? '#22C55E' : '#FFF',
                        fontWeight: '700',
                        fontSize: 15,
                        marginLeft: 8,
                      }}
                    >
                      {savedToGallery ? '✓ GUARDADO' : 'GUARDAR EN DISPOSITIVO'}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            ) : (
              /* Photo or Native: COMPARTIR + GUARDAR */
              <View style={{ flexDirection: 'row', gap: 12 }}>
                {/* COMPARTIR — larger */}
                <TouchableOpacity
                  onPress={handleShare}
                  disabled={isSaving}
                  style={{
                    flex: 2,
                    backgroundColor: '#DC2626',
                    borderRadius: 16,
                    paddingVertical: 16,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    shadowColor: '#DC2626',
                    shadowOffset: { width: 0, height: 4 },
                    shadowOpacity: 0.3,
                    shadowRadius: 8,
                  }}
                >
                  {isSaving ? (
                    <ActivityIndicator color="#FFF" />
                  ) : (
                    <>
                      <Share2 color="#FFF" size={20} />
                      <Text
                        style={{
                          color: '#FFF',
                          fontWeight: '700',
                          fontSize: 15,
                          marginLeft: 8,
                        }}
                      >
                        COMPARTIR
                      </Text>
                    </>
                  )}
                </TouchableOpacity>

                {/* GUARDAR — smaller */}
                <TouchableOpacity
                  onPress={handleSaveToGallery}
                  disabled={isSaving}
                  style={{
                    flex: 1,
                    backgroundColor: savedToGallery
                      ? 'rgba(34, 197, 94, 0.2)'
                      : 'rgba(255,255,255,0.1)',
                    borderRadius: 16,
                    paddingVertical: 16,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Download color={savedToGallery ? '#22C55E' : '#FFF'} size={20} />
                  <Text
                    style={{
                      color: savedToGallery ? '#22C55E' : '#FFF',
                      fontWeight: '700',
                      fontSize: 13,
                      marginLeft: 6,
                    }}
                  >
                    {savedToGallery ? '✓' : 'GUARDAR'}
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* GUEST PROMPT OVERLAY — dentro del editor, siempre al frente */}
          {guestPromptVisible && (
            <View
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                zIndex: 100,
                backgroundColor: 'rgba(0,0,0,0.88)',
              }}
              className="items-center justify-center px-6"
            >
              <View
                className="w-full rounded-3xl p-6 items-center"
                style={{
                  backgroundColor: '#111',
                  maxWidth: 400,
                  borderWidth: 1,
                  borderColor: 'rgba(220,38,38,0.3)',
                }}
              >
                <View
                  className="w-16 h-16 rounded-2xl items-center justify-center mb-4"
                  style={{ backgroundColor: '#DC262620', borderWidth: 1, borderColor: '#DC2626' }}
                >
                  <Share2 size={32} color="#DC2626" />
                </View>
                <Text className="text-white text-2xl font-bold mb-1">PRO Share</Text>
                <Text className="text-zinc-400 text-sm text-center mb-6">
                  Comparte tus clips con overlay de datos, canción de Spotify y marca TRENS a tus
                  redes.
                </Text>
                <TouchableOpacity
                  onPress={() => {
                    setGuestPromptVisible(false);
                    onGuestLogin?.();
                  }}
                  className="w-full py-4 rounded-2xl items-center mb-3"
                  style={{ backgroundColor: '#DC2626' }}
                >
                  <View className="flex-row items-center gap-2">
                    <LogIn size={18} color="#fff" />
                    <Text className="text-white font-bold text-base">Iniciar sesión</Text>
                  </View>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setGuestPromptVisible(false)} className="py-3">
                  <Text className="text-zinc-500 text-sm">Seguir explorando</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </Animated.View>
      </GestureHandlerRootView>
    </Modal>
  );
}

export default ProMediaEditor;
