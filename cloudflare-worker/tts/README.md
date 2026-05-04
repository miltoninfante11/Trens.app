# TRENS TTS Worker

Proxy a Google Cloud Text-to-Speech con caché en R2.

**Estado actual**: ✅ Desplegado en https://trens-tts.trens-app.workers.dev con Service Account `voz-ia@gen-lang-client-0458876939`.

## Auth

Soporta dos modos (preferido primero):

1. **Service Account** (recomendado) — secret `GOOGLE_SERVICE_ACCOUNT` con el JSON completo
2. **API Key** (legacy) — secret `GOOGLE_TTS_API_KEY`

## Setup (una sola vez)

```bash
cd cloudflare-worker/tts
npm install

# Configura la API key como secret (NO la pongas en wrangler.toml)
npx wrangler secret put GOOGLE_TTS_API_KEY
# Pega la key cuando lo pida

# Deploy
npm run deploy
```

## Cómo obtener la API key

1. https://console.cloud.google.com/ → crea o elige proyecto
2. APIs & Services → habilita **"Cloud Text-to-Speech API"**
3. Credentials → Create Credentials → **API Key**
4. Recomendado: "Restrict key" → API restrictions → solo "Cloud Text-to-Speech API"

## Endpoints

| Método | Ruta                | Descripción                                                |
| ------ | ------------------- | ---------------------------------------------------------- |
| `POST` | `/tts`              | Body `{ text, voice?, lang?, pitch?, rate? }` → audio/mpeg |
| `GET`  | `/tts-url?text=...` | Retorna `{ url, hash }` para usar como `<audio src>`       |
| `GET`  | `/tts/:hash.mp3`    | Servir audio cacheado directo de R2                        |
| `GET`  | `/health`           | Healthcheck                                                |

## Voces recomendadas (varoniles, español)

- `es-US-Neural2-B` ⭐ default — grave, atlético, "savage"
- `es-US-Studio-B` — premium narrator
- `es-ES-Neural2-B` — acento España
- `es-US-Wavenet-B` — alternativa cheaper

## Pitch / Rate

- `pitch`: -20 a 20 semitones. **Default `-2.0`** (más grave, varonil)
- `rate`: 0.25 a 4.0. **Default `0.95`** (ligeramente pausado)

## Caché

Cache key = `sha256(voice|lang|pitch|rate|text)` → `r2://tts/<hash>.mp3`.
Texto idéntico = 0 llamadas a Google después del primer hit.

## Free tier

Google Cloud TTS gratis hasta:

- 1M caracteres/mes Standard
- 1M caracteres/mes Neural2 / Studio (combinados)

Una narración típica del ADN ≈ 400 chars → ~2,500 reproducciones gratis/mes.
