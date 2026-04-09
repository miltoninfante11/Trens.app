// ============================================================================
// SPOTIFY FAB STATE - Estado compartido del FAB de Spotify
// SpotifyOverlay publica datos de display aquí.
// HankOverlay los consume para renderizar el clon del botón en el fan.
// ============================================================================

export type SpotifyFabData = {
  albumArtUrl: string | null;
  isPlaying: boolean;
  isConnected: boolean;
};

export type SpotifyAction = 'next' | 'restart' | 'play_pause' | 'hank_insight' | 'open_modal';

// --- Display state ---
let _state: SpotifyFabData = { albumArtUrl: null, isPlaying: false, isConnected: false };
const _listeners = new Set<(data: SpotifyFabData) => void>();

export const spotifyFabState = {
  update(data: Partial<SpotifyFabData>) {
    _state = { ..._state, ...data };
    _listeners.forEach((fn) => fn(_state));
  },
  get current() {
    return _state;
  },
  onChange(fn: (data: SpotifyFabData) => void) {
    _listeners.add(fn);
    fn(_state); // emit current state immediately
    return () => {
      _listeners.delete(fn);
    };
  },
};

// --- Actions (HankOverlay → SpotifyOverlay) ---
const _actionListeners = new Set<(action: SpotifyAction) => void>();

export const spotifyFabActions = {
  emit(action: SpotifyAction) {
    _actionListeners.forEach((fn) => fn(action));
  },
  onAction(fn: (action: SpotifyAction) => void) {
    _actionListeners.add(fn);
    return () => {
      _actionListeners.delete(fn);
    };
  },
};
