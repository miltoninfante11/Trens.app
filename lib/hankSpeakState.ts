// ============================================================================
// HANK SPEAK STATE - Estado compartido de TTS
// TodayCards publica isSpeaking, HankOverlay consume para renderizar ondas
// ============================================================================

let _isSpeaking = false;
const _listeners = new Set<(speaking: boolean) => void>();

export const hankSpeakState = {
  set(speaking: boolean) {
    _isSpeaking = speaking;
    _listeners.forEach((fn) => fn(speaking));
  },
  get current() {
    return _isSpeaking;
  },
  onChange(fn: (speaking: boolean) => void) {
    _listeners.add(fn);
    fn(_isSpeaking);
    return () => {
      _listeners.delete(fn);
    };
  },
};
