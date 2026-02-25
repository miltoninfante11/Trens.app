// Simple event emitter to open the Spotify modal from anywhere (e.g. Feed)
type Listener = () => void;

export interface SpotifyNowPlaying {
  trackName: string;
  artist: string;
  trackUri: string;
}
type PlayListener = (info?: SpotifyNowPlaying) => void;

const openListeners = new Set<Listener>();
const playListeners = new Set<PlayListener>();
const pauseListeners = new Set<Listener>();

export const spotifyModalEvent = {
  /** Subscribe to modal-open — returns unsubscribe function */
  subscribe(fn: Listener) {
    openListeners.add(fn);
    return () => {
      openListeners.delete(fn);
    };
  },
  /** Subscribe to playback-started-from-modal — returns unsubscribe function */
  onPlay(fn: PlayListener) {
    playListeners.add(fn);
    return () => {
      playListeners.delete(fn);
    };
  },
  /** Subscribe to playback-paused-from-modal — returns unsubscribe function */
  onPause(fn: Listener) {
    pauseListeners.add(fn);
    return () => {
      pauseListeners.delete(fn);
    };
  },
  /** Emit modal-open — notifies all subscribers */
  open() {
    openListeners.forEach((fn) => fn());
  },
  /** Emit playback-started with optional track info */
  emitPlay(info?: SpotifyNowPlaying) {
    playListeners.forEach((fn) => fn(info));
  },
  /** Emit playback-paused */
  emitPause() {
    pauseListeners.forEach((fn) => fn());
  },
};
