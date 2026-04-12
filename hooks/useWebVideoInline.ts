import { useEffect } from 'react';
import { Platform } from 'react-native';

/**
 * Forces all <video> elements in the DOM to play inline on iOS Safari/PWA.
 * iOS requires the HTML attribute `playsinline` (not CSS) to prevent
 * videos from going fullscreen on interaction or scroll.
 *
 * Uses a MutationObserver to catch dynamically-created <video> elements
 * (e.g., from expo-video's VideoView).
 */
export function useWebVideoInline() {
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;

    const patchVideo = (video: HTMLVideoElement) => {
      if (!video.hasAttribute('playsinline')) {
        video.setAttribute('playsinline', '');
        video.setAttribute('webkit-playsinline', '');
        (video as any).playsInline = true;
      }
    };

    // Patch all existing videos
    document.querySelectorAll('video').forEach(patchVideo);

    // Watch for new videos added to the DOM
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        mutation.addedNodes.forEach((node) => {
          if (node instanceof HTMLVideoElement) {
            patchVideo(node);
          }
          // Also check children of added containers
          if (node instanceof HTMLElement) {
            node.querySelectorAll<HTMLVideoElement>('video').forEach(patchVideo);
          }
        });
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    return () => observer.disconnect();
  }, []);
}
