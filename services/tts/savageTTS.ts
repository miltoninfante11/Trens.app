// ============================================================================
// SAVAGE TTS — Google Cloud Text-to-Speech vía Cloudflare Worker
// Voz masculina grave (Neural2-B). Caché en R2 → 1 llamada por texto único.
// Fallback a expo-speech con pitch bajo si la red falla.
// ============================================================================

import { Platform } from 'react-native';
import { Audio } from 'expo-av';
import * as Speech from 'expo-speech';

// ----------------------------------------------------------------------------
// CONFIG — el dominio del Worker. Ajusta tras hacer `wrangler deploy`.
// El worker se despliega por defecto como https://trens-tts.<account>.workers.dev
// y luego puedes mapearlo a tts.trens.app en el dashboard de Cloudflare.
// ----------------------------------------------------------------------------
const TTS_ENDPOINTS = ['https://tts.trens.app', 'https://trens-tts.trens-app.workers.dev'];

export type SavagePreset = 'coach' | 'warrior' | 'deep' | 'natural' | 'athlete' | 'hype';

export interface SpeakOptions {
  preset?: SavagePreset; // default backend: 'coach' (Studio-B grave)
  voice?: string; // ej. "es-US-Neural2-B" | "es-US-Studio-B"
  lang?: string; // ej. "es-US"
  pitch?: number; // -20..20 semitones. Default backend: -2.0
  rate?: number; // 0.25..4.0. Default backend: 0.95
  onStart?: () => void;
  onDone?: () => void;
  onError?: (e: unknown) => void;
}

let currentSound: Audio.Sound | null = null;
let isSpeakingNow = false;

// In-memory cache de URLs ya resueltas (mismo texto en sesión = 0 red)
const urlCache = new Map<string, string>();

function cacheKey(text: string, opts: SpeakOptions) {
  return `${opts.preset ?? ''}|${opts.voice ?? ''}|${opts.lang ?? ''}|${opts.pitch ?? ''}|${opts.rate ?? ''}|${text}`;
}

async function fetchTtsUrl(text: string, opts: SpeakOptions): Promise<string | null> {
  const key = cacheKey(text, opts);
  if (urlCache.has(key)) return urlCache.get(key)!;

  for (const base of TTS_ENDPOINTS) {
    try {
      const params = new URLSearchParams({ text });
      if (opts.preset) params.set('preset', opts.preset);
      if (opts.voice) params.set('voice', opts.voice);
      if (opts.lang) params.set('lang', opts.lang);
      if (typeof opts.pitch === 'number') params.set('pitch', String(opts.pitch));
      if (typeof opts.rate === 'number') params.set('rate', String(opts.rate));

      const res = await fetch(`${base}/tts-url?${params.toString()}`);
      if (!res.ok) continue;
      const json = (await res.json()) as { url?: string };
      if (json.url) {
        urlCache.set(key, json.url);
        return json.url;
      }
    } catch {
      // probar el siguiente endpoint
    }
  }
  return null;
}

/**
 * Pre-calienta el caché de TTS para un texto futuro. NO reproduce nada.
 * Útil para llamarlo en montaje del componente y eliminar la latencia
 * de la primera reproducción (Google synth + R2 put + cliente fetch).
 *
 * Idempotente: usa el mismo cache de URLs que `speakSavage`, así que
 * múltiples llamadas con el mismo texto solo hacen 1 request al worker.
 */
export async function prefetchSavage(text: string, opts: SpeakOptions = {}): Promise<void> {
  if (!text?.trim()) return;
  try {
    const url = await fetchTtsUrl(text, opts);
    if (!url) return;
    // En web, además precargamos el MP3 al disco/cache HTTP
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      try {
        // fetch HEAD para meterlo en el HTTP cache del navegador sin descargar entero
        await fetch(url, { method: 'GET', cache: 'force-cache' }).catch(() => {});
      } catch {}
    }
  } catch {
    // silencioso: prefetch best-effort
  }
}

/**
 * Reproduce el texto con voz masculina premium (Google Cloud TTS Neural2-B).
 * Si el worker no responde, cae a `expo-speech` con pitch bajo.
 */
export async function speakSavage(text: string, opts: SpeakOptions = {}): Promise<void> {
  if (!text?.trim()) return;

  // Detener cualquier reproducción previa
  await stopSavage();

  isSpeakingNow = true;
  opts.onStart?.();

  try {
    const url = await fetchTtsUrl(text, opts);

    if (!url) throw new Error('TTS endpoint unreachable');

    // En web: <audio> es más eficiente que expo-av
    if (Platform.OS === 'web') {
      await playWeb(url, opts);
      return;
    }

    // Native: expo-av
    await Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      shouldDuckAndroid: true,
    }).catch(() => {});

    const { sound } = await Audio.Sound.createAsync(
      { uri: url },
      { shouldPlay: true, volume: 1.0 }
    );
    currentSound = sound;

    sound.setOnPlaybackStatusUpdate((status) => {
      if (!status.isLoaded) return;
      if (status.didJustFinish) {
        isSpeakingNow = false;
        sound.unloadAsync().catch(() => {});
        if (currentSound === sound) currentSound = null;
        opts.onDone?.();
      }
    });
  } catch (err) {
    // Fallback: voz local con pitch bajo para sonar varonil
    fallbackSpeak(text, opts);
  }
}

/** Detiene cualquier reproducción activa (cloud o fallback). */
export async function stopSavage(): Promise<void> {
  isSpeakingNow = false;
  try {
    Speech.stop();
  } catch {}
  if (currentSound) {
    try {
      await currentSound.stopAsync();
      await currentSound.unloadAsync();
    } catch {}
    currentSound = null;
  }
  if (Platform.OS === 'web' && webAudio) {
    try {
      webAudio.pause();
      webAudio.src = '';
    } catch {}
    webAudio = null;
  }
}

export function isSavageSpeaking() {
  return isSpeakingNow;
}

// ----------------------------------------------------------------------------
// Web playback
// ----------------------------------------------------------------------------
let webAudio: HTMLAudioElement | null = null;

async function playWeb(url: string, opts: SpeakOptions) {
  if (typeof window === 'undefined') return;
  const audio = new (window as any).Audio(url) as HTMLAudioElement;
  webAudio = audio;
  audio.preload = 'auto';
  audio.onended = () => {
    isSpeakingNow = false;
    webAudio = null;
    opts.onDone?.();
  };
  audio.onerror = (e) => {
    isSpeakingNow = false;
    webAudio = null;
    opts.onError?.(e);
  };
  await audio.play();
}

// ----------------------------------------------------------------------------
// Fallback: expo-speech con pitch grave
// ----------------------------------------------------------------------------
function fallbackSpeak(text: string, opts: SpeakOptions) {
  Speech.speak(text, {
    language: opts.lang || 'es-MX',
    pitch: 0.78, // grave para sonar varonil
    rate: opts.rate ?? 0.92,
    onDone: () => {
      isSpeakingNow = false;
      opts.onDone?.();
    },
    onStopped: () => {
      isSpeakingNow = false;
      opts.onDone?.();
    },
    onError: (e) => {
      isSpeakingNow = false;
      opts.onError?.(e);
    },
  });
}

export const SAVAGE_VOICES = {
  /** Voz masculina grave atlética — default */
  neural: 'es-US-Neural2-B',
  /** Premium narrator (más caro) */
  studio: 'es-US-Studio-B',
  /** Acento España */
  spain: 'es-ES-Neural2-B',
  /** Wavenet más económica */
  wavenet: 'es-US-Wavenet-B',
} as const;

/**
 * Presets de voz disponibles en el worker.
 * - `coach` (default): Studio-B grave, autoritario, motivacional. Ideal narrador ADN.
 * - `warrior`: acento España, intensidad militar.
 * - `deep`: máxima gravedad, ritmo lento, dramático.
 * - `natural`: Neural2-B suave, conversacional.
 */
export const SAVAGE_PRESETS = {
  COACH: 'coach',
  WARRIOR: 'warrior',
  DEEP: 'deep',
  NATURAL: 'natural',
  ATHLETE: 'athlete',
  HYPE: 'hype',
} as const;
