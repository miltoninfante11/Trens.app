// ============================================================================
// TRENS TTS WORKER
// Proxy a Google Cloud Text-to-Speech con caché en R2.
//
// Auth: prefiere GOOGLE_SERVICE_ACCOUNT (JSON completo). Si no existe, intenta
// GOOGLE_TTS_API_KEY (modo legacy).
//
// - POST /tts          -> { text, voice?, lang?, pitch?, rate? } -> audio/mpeg
// - GET  /tts/:hash    -> audio/mpeg directo del caché (para <audio src>)
// - GET  /tts-url      -> ?text=... -> { url } URL pública cacheada
// - GET  /health       -> { ok: true }
//
// Cache key = sha256(voice|lang|pitch|rate|text) -> r2://tts/<hash>.mp3
// ============================================================================

import { getGoogleAccessToken } from './googleAuth';

export interface Env {
  TTS_CACHE: R2Bucket;
  ALLOWED_ORIGINS: string;
  DEFAULT_VOICE: string;
  DEFAULT_LANG: string;
  DEFAULT_PITCH: string;
  DEFAULT_RATE: string;
  GOOGLE_SERVICE_ACCOUNT?: string;
  GOOGLE_TTS_API_KEY?: string;
}

// ---------------------------------------------------------------------------
// CORS
// ---------------------------------------------------------------------------
const buildCors = (origin: string, allowed: string) => {
  const list = allowed.split(',').map((o) => o.trim());
  const ok = list.some((pat) => {
    if (pat.includes('*')) {
      const re = pat.replace(/\./g, '\\.').replace(/\*/g, '.*');
      return new RegExp(`^${re}$`).test(origin);
    }
    return origin === pat || origin.startsWith(pat);
  });
  return {
    'Access-Control-Allow-Origin': ok ? origin : list[0].replace('*', ''),
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
};

// ---------------------------------------------------------------------------
// Hashing helper
// ---------------------------------------------------------------------------
async function sha256(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// ---------------------------------------------------------------------------
// PRESETS — combinaciones afinadas voice + pitch + rate + effects
// ---------------------------------------------------------------------------
type PresetName = 'coach' | 'warrior' | 'deep' | 'natural' | 'athlete' | 'hype';

interface Preset {
  voice: string;
  lang: string;
  pitch: number;
  rate: number;
  effectsProfileId: string[];
}

const PRESETS: Record<PresetName, Preset> = {
  // SAVAGE COACH — Polyglot-1 grave, autoritario (DEFAULT)
  coach: {
    voice: 'es-US-Polyglot-1',
    lang: 'es-US',
    pitch: -4,
    rate: 0.9,
    effectsProfileId: ['large-home-entertainment-class-device'],
  },
  // WARRIOR — acento España, tono guerrero
  warrior: {
    voice: 'es-ES-Polyglot-1',
    lang: 'es-ES',
    pitch: -3,
    rate: 0.92,
    effectsProfileId: ['large-home-entertainment-class-device'],
  },
  // ED HARDY DEEP — extremo grave, voz de tráiler cinematográfico
  deep: {
    voice: 'es-US-Studio-B',
    lang: 'es-US',
    pitch: -6,
    rate: 0.85,
    effectsProfileId: ['large-home-entertainment-class-device'],
  },
  // NATURAL — voz Neural2-B sin coloración (más barato)
  natural: {
    voice: 'es-US-Neural2-B',
    lang: 'es-US',
    pitch: -2,
    rate: 0.95,
    effectsProfileId: ['headphone-class-device'],
  },
  // ATHLETE — joven, energético, firme. Voz Neural2-C ligera con cuerpo
  athlete: {
    voice: 'es-US-Neural2-C',
    lang: 'es-US',
    pitch: -1,
    rate: 1.02,
    effectsProfileId: ['large-home-entertainment-class-device'],
  },
  // HYPE — voz nueva generación Chirp3-HD-Charon, dinámica y juvenil
  hype: {
    voice: 'es-US-Chirp3-HD-Charon',
    lang: 'es-US',
    pitch: -1,
    rate: 1.0,
    effectsProfileId: ['large-home-entertainment-class-device'],
  },
};

function resolvePreset(name?: string | null): Preset {
  if (name && name in PRESETS) return PRESETS[name as PresetName];
  return PRESETS.coach; // DEFAULT
}

// ---------------------------------------------------------------------------
// Google TTS call
// ---------------------------------------------------------------------------
async function synthesize(
  env: Env,
  text: string,
  voice: string,
  lang: string,
  pitch: number,
  rate: number,
  effectsProfileId: string[] = ['large-home-entertainment-class-device']
): Promise<Uint8Array> {
  // Soporte SSML básico: si comienza con <speak> usamos input.ssml
  const isSsml = /^\s*<speak[\s>]/i.test(text);

  // Las voces Chirp/Chirp3 NO soportan pitch (Google TTS rechaza la request).
  const supportsPitch = !/chirp/i.test(voice);

  const audioConfig: Record<string, unknown> = {
    audioEncoding: 'MP3',
    speakingRate: rate,
    effectsProfileId,
  };
  if (supportsPitch) audioConfig.pitch = pitch;

  const body = {
    input: isSsml ? { ssml: text } : { text },
    voice: {
      languageCode: lang,
      name: voice,
    },
    audioConfig,
  };

  let endpoint = 'https://texttospeech.googleapis.com/v1/text:synthesize';
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };

  // Auth: preferir Service Account (Bearer), fallback a API key (?key=)
  if (env.GOOGLE_SERVICE_ACCOUNT) {
    const token = await getGoogleAccessToken(env.GOOGLE_SERVICE_ACCOUNT);
    headers['Authorization'] = `Bearer ${token}`;
  } else if (env.GOOGLE_TTS_API_KEY) {
    endpoint += `?key=${env.GOOGLE_TTS_API_KEY}`;
  } else {
    throw new Error('Missing GOOGLE_SERVICE_ACCOUNT or GOOGLE_TTS_API_KEY secret');
  }

  const res = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Google TTS error ${res.status}: ${errText}`);
  }

  const json = (await res.json()) as { audioContent: string };
  if (!json.audioContent) throw new Error('Google TTS response missing audioContent');

  // base64 -> bytes
  const bin = atob(json.audioContent);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

// ---------------------------------------------------------------------------
// Worker entry
// ---------------------------------------------------------------------------
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get('Origin') || '';
    const cors = buildCors(origin, env.ALLOWED_ORIGINS);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    const url = new URL(request.url);

    try {
      // ---------------------------------------------------------------------
      // GET /health
      // ---------------------------------------------------------------------
      if (url.pathname === '/health') {
        return Response.json(
          {
            ok: true,
            voice: env.DEFAULT_VOICE,
            lang: env.DEFAULT_LANG,
            auth: env.GOOGLE_SERVICE_ACCOUNT
              ? 'service_account'
              : env.GOOGLE_TTS_API_KEY
                ? 'api_key'
                : 'NOT_CONFIGURED',
          },
          { headers: cors }
        );
      }

      // ---------------------------------------------------------------------
      // GET /tts/<hash> -> audio directo del caché
      // ---------------------------------------------------------------------
      if (request.method === 'GET' && url.pathname.startsWith('/tts/')) {
        const hash = url.pathname.replace('/tts/', '').replace('.mp3', '');
        if (!/^[a-f0-9]{8,64}$/.test(hash)) {
          return new Response('Bad hash', { status: 400, headers: cors });
        }
        const obj = await env.TTS_CACHE.get(`tts/${hash}.mp3`);
        if (!obj) return new Response('Not found', { status: 404, headers: cors });
        return new Response(obj.body, {
          status: 200,
          headers: {
            ...cors,
            'Content-Type': 'audio/mpeg',
            'Cache-Control': 'public, max-age=2592000, immutable',
          },
        });
      }

      // ---------------------------------------------------------------------
      // POST /tts -> body { text, preset?, voice?, lang?, pitch?, rate? }
      // También acepta ?preset=coach|warrior|deep|natural en query string.
      // Devuelve audio/mpeg directamente.
      // ---------------------------------------------------------------------
      if (request.method === 'POST' && url.pathname === '/tts') {
        const payload = (await request.json().catch(() => null)) as {
          text?: string;
          preset?: string;
          voice?: string;
          lang?: string;
          pitch?: number;
          rate?: number;
        } | null;

        if (!payload?.text || typeof payload.text !== 'string') {
          return Response.json(
            { error: 'Missing or invalid "text"' },
            { status: 400, headers: cors }
          );
        }
        if (payload.text.length > 4500) {
          return Response.json(
            { error: 'Text too long (max 4500 chars)' },
            { status: 413, headers: cors }
          );
        }

        // Resolve preset (body > query > default "coach")
        const presetName = payload.preset || url.searchParams.get('preset') || undefined;
        const preset = resolvePreset(presetName);

        // Overrides individuales
        const voice = payload.voice || preset.voice;
        const lang = payload.lang || preset.lang;
        const pitch = typeof payload.pitch === 'number' ? payload.pitch : preset.pitch;
        const rate = typeof payload.rate === 'number' ? payload.rate : preset.rate;
        const effects = preset.effectsProfileId;

        // Cache lookup (incluye effects en la key para no mezclar audios)
        const cacheKey = await sha256(
          `${voice}|${lang}|${pitch}|${rate}|${effects.join(',')}|${payload.text}`
        );
        const cacheObj = await env.TTS_CACHE.get(`tts/${cacheKey}.mp3`);
        if (cacheObj) {
          return new Response(cacheObj.body, {
            status: 200,
            headers: {
              ...cors,
              'Content-Type': 'audio/mpeg',
              'Cache-Control': 'public, max-age=2592000, immutable',
              'X-TTS-Cache': 'HIT',
              'X-TTS-Hash': cacheKey,
              'X-TTS-Voice': voice,
              'X-TTS-Preset': presetName || 'coach',
            },
          });
        }

        // Miss -> sintetiza y guarda
        const audio = await synthesize(env, payload.text, voice, lang, pitch, rate, effects);
        await env.TTS_CACHE.put(`tts/${cacheKey}.mp3`, audio, {
          httpMetadata: { contentType: 'audio/mpeg' },
          customMetadata: {
            voice,
            lang,
            pitch: String(pitch),
            rate: String(rate),
            preset: presetName || 'coach',
            length: String(payload.text.length),
            createdAt: new Date().toISOString(),
          },
        });

        return new Response(audio, {
          status: 200,
          headers: {
            ...cors,
            'Content-Type': 'audio/mpeg',
            'Cache-Control': 'public, max-age=2592000, immutable',
            'X-TTS-Cache': 'MISS',
            'X-TTS-Hash': cacheKey,
            'X-TTS-Voice': voice,
            'X-TTS-Preset': presetName || 'coach',
          },
        });
      }

      // ---------------------------------------------------------------------
      // GET /tts-url?text=...&preset=...  -> { url, hash, cache }
      // Útil cuando solo quieres una URL para <audio src> o expo-av
      // ---------------------------------------------------------------------
      if (request.method === 'GET' && url.pathname === '/tts-url') {
        const text = url.searchParams.get('text') || '';
        if (!text) {
          return Response.json({ error: 'Missing text' }, { status: 400, headers: cors });
        }

        const presetName = url.searchParams.get('preset') || undefined;
        const preset = resolvePreset(presetName);

        const voice = url.searchParams.get('voice') || preset.voice;
        const lang = url.searchParams.get('lang') || preset.lang;
        const pitch = url.searchParams.has('pitch')
          ? Number(url.searchParams.get('pitch'))
          : preset.pitch;
        const rate = url.searchParams.has('rate')
          ? Number(url.searchParams.get('rate'))
          : preset.rate;
        const effects = preset.effectsProfileId;

        const cacheKey = await sha256(
          `${voice}|${lang}|${pitch}|${rate}|${effects.join(',')}|${text}`
        );
        const exists = await env.TTS_CACHE.head(`tts/${cacheKey}.mp3`);

        if (!exists) {
          const audio = await synthesize(env, text, voice, lang, pitch, rate, effects);
          await env.TTS_CACHE.put(`tts/${cacheKey}.mp3`, audio, {
            httpMetadata: { contentType: 'audio/mpeg' },
            customMetadata: {
              voice,
              lang,
              pitch: String(pitch),
              rate: String(rate),
              preset: presetName || 'coach',
              length: String(text.length),
              createdAt: new Date().toISOString(),
            },
          });
        }

        const publicBase = new URL(request.url);
        publicBase.pathname = `/tts/${cacheKey}.mp3`;
        publicBase.search = '';
        return Response.json(
          {
            url: publicBase.toString(),
            hash: cacheKey,
            cache: exists ? 'HIT' : 'MISS',
            preset: presetName || 'coach',
            voice,
          },
          { headers: cors }
        );
      }

      // ---------------------------------------------------------------------
      // GET /presets -> lista presets disponibles para preview
      // ---------------------------------------------------------------------
      if (request.method === 'GET' && url.pathname === '/presets') {
        return Response.json(
          {
            default: 'coach',
            presets: PRESETS,
          },
          { headers: cors }
        );
      }

      return new Response('Not found', { status: 404, headers: cors });
    } catch (err: any) {
      console.error('[trens-tts] error:', err?.message || err);
      return Response.json(
        { error: err?.message || 'Internal error' },
        { status: 500, headers: cors }
      );
    }
  },
};
