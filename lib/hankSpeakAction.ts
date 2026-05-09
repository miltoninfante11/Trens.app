// ============================================================================
// HANK SPEAK ACTION - Bus de acciones para disparar TTS desde el FAB
// HankOverlay (swipe izquierdo) emite → TodayCards consume y reproduce/para audio.
// ============================================================================

export type HankSpeakAction = 'toggle';

const _listeners = new Set<(action: HankSpeakAction) => void>();

export const hankSpeakActions = {
  emit(action: HankSpeakAction = 'toggle') {
    _listeners.forEach((fn) => fn(action));
  },
  onAction(fn: (action: HankSpeakAction) => void) {
    _listeners.add(fn);
    return () => {
      _listeners.delete(fn);
    };
  },
};
