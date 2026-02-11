// ============================================================================
// USE VOICE INPUT - Hook para entrada de voz con Gemini transcription
// Usa expo-av para grabar y Gemini para transcribir
// ============================================================================

import { useState, useRef, useCallback } from 'react';
import { Audio } from 'expo-av';
import { File } from 'expo-file-system/next';

const GEMINI_API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY || '';

interface UseVoiceInputReturn {
  isRecording: boolean;
  isTranscribing: boolean;
  startRecording: (
    enableAutoStop?: boolean,
    onAutoStop?: (transcription: string | null) => void
  ) => Promise<void>;
  stopRecording: () => Promise<string | null>;
  error: string | null;
}

export function useVoiceInput(): UseVoiceInputReturn {
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const maxRecordingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const silenceCheckInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastSoundTime = useRef<number>(Date.now());
  const stopRecordingRef = useRef<(() => Promise<string | null>) | null>(null);
  const onAutoStopCallback = useRef<((transcription: string | null) => void) | null>(null);
  const isAutoStopTriggered = useRef<boolean>(false);

  /**
   * Inicia la grabación de audio
   * @param enableAutoStop - Si es true, detiene automáticamente por silencio (para botón de mic)
   *                         Si es false, solo detiene al llamar stopRecording (para long press)
   * @param onAutoStop - Callback que se ejecuta cuando auto-stop se activa (solo si enableAutoStop = true)
   */
  const startRecording = useCallback(
    async (
      enableAutoStop: boolean = false,
      onAutoStop?: (transcription: string | null) => void
    ) => {
      try {
        setError(null);

        // Guardar callback si se proporciona
        if (onAutoStop) {
          onAutoStopCallback.current = onAutoStop;
        }

        // Reset bandera de auto-stop
        isAutoStopTriggered.current = false;

        // Pedir permisos
        const { status } = await Audio.requestPermissionsAsync();
        if (status !== 'granted') {
          setError('Permiso de micrófono denegado');
          return;
        }

        // Configurar modo de audio - permitir que otras apps sigan reproduciéndose
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: true,
          playsInSilentModeIOS: true,
          staysActiveInBackground: false,
          interruptionModeIOS: 2, // MixWithOthers - NO interrumpir Spotify
          shouldDuckAndroid: false, // NO reducir volumen
          interruptionModeAndroid: 2,
        });

        // Crear y empezar grabación con metering habilitado
        const recording = new Audio.Recording();
        await recording.prepareToRecordAsync({
          ...Audio.RecordingOptionsPresets.HIGH_QUALITY,
          android: {
            extension: '.m4a',
            outputFormat: Audio.AndroidOutputFormat.MPEG_4,
            audioEncoder: Audio.AndroidAudioEncoder.AAC,
            sampleRate: 16000,
            numberOfChannels: 1,
            bitRate: 128000,
          },
          ios: {
            extension: '.m4a',
            outputFormat: Audio.IOSOutputFormat.MPEG4AAC,
            audioQuality: Audio.IOSAudioQuality.HIGH,
            sampleRate: 16000,
            numberOfChannels: 1,
            bitRate: 128000,
          },
          web: {
            mimeType: 'audio/webm',
            bitsPerSecond: 128000,
          },
          isMeteringEnabled: true, // Habilitar metering para detección de silencio
        });

        await recording.startAsync();
        recordingRef.current = recording;
        setIsRecording(true);
        lastSoundTime.current = Date.now();

        // Auto-stop: máximo 15 segundos de grabación
        maxRecordingTimer.current = setTimeout(async () => {
          console.warn('⏱️ Tiempo máximo de grabación alcanzado');
          isAutoStopTriggered.current = true;
          if (stopRecordingRef.current) {
            await stopRecordingRef.current();
          }
        }, 15000);

        // Auto-stop por silencio: SOLO si enableAutoStop es true (botón de mic en chat)
        if (enableAutoStop) {
          silenceCheckInterval.current = setInterval(async () => {
            if (!recordingRef.current) {
              if (silenceCheckInterval.current) clearInterval(silenceCheckInterval.current);
              return;
            }

            try {
              const recStatus = await recordingRef.current.getStatusAsync();
              const metering = recStatus.metering ?? -160;

              // Si hay sonido (metering > -35 dB), actualizar tiempo
              if (metering > -35) {
                lastSoundTime.current = Date.now();
              }

              // Si han pasado 2 segundos sin sonido, parar
              const silenceDuration = Date.now() - lastSoundTime.current;
              if (silenceDuration > 2000) {
                console.warn(`🤫 Silencio detectado (${silenceDuration}ms), deteniendo...`);
                if (silenceCheckInterval.current) clearInterval(silenceCheckInterval.current);
                isAutoStopTriggered.current = true;
                if (stopRecordingRef.current) {
                  await stopRecordingRef.current();
                }
              }
            } catch (e) {
              // Ignorar errores de metering
            }
          }, 300);
        }

        console.warn(
          `🎤 Grabación iniciada ${enableAutoStop ? '(auto-stop habilitado)' : '(manual)'}`
        );
      } catch (err) {
        console.error('Error al iniciar grabación:', err);
        setError('Error al iniciar grabación');
      }
    },
    []
  ); // Sin dependencias - usa refs

  /**
   * Detiene la grabación y transcribe con Gemini
   */
  const stopRecording = useCallback(async (): Promise<string | null> => {
    try {
      // Limpiar timers
      if (maxRecordingTimer.current) {
        clearTimeout(maxRecordingTimer.current);
        maxRecordingTimer.current = null;
      }
      if (silenceCheckInterval.current) {
        clearInterval(silenceCheckInterval.current);
        silenceCheckInterval.current = null;
      }

      const recording = recordingRef.current;

      if (!recording) {
        console.warn('🎤 No hay grabación activa para detener');
        setIsRecording(false);
        return null;
      }

      // Limpiar referencia inmediatamente para evitar doble stop
      recordingRef.current = null;

      console.warn('🎤 Deteniendo grabación...');
      setIsRecording(false);

      // Verificar estado del recording antes de detener
      let uri: string | null = null;
      try {
        const status = await recording.getStatusAsync();
        if (status.isRecording || status.isDoneRecording === false) {
          await recording.stopAndUnloadAsync();
        }
        uri = recording.getURI();
      } catch (stopErr) {
        // Si falla stopAndUnloadAsync, intentar obtener URI de todas formas
        console.warn('🎤 Error al detener (puede estar ya detenido):', stopErr);
        try {
          uri = recording.getURI();
        } catch {
          // Ignorar
        }
      }

      if (!uri) {
        console.warn('🎤 No se pudo obtener el archivo de audio');
        setError('No se pudo obtener el archivo de audio');
        return null;
      }

      console.warn('🎤 Audio guardado en:', uri);

      // Transcribir con Gemini
      setIsTranscribing(true);
      const transcription = await transcribeWithGemini(uri);
      setIsTranscribing(false);

      if (transcription) {
        console.warn('🎤 Transcripción:', transcription);
      } else {
        setError('No se pudo transcribir el audio');
      }

      // Si fue activado por auto-stop, ejecutar callback
      if (isAutoStopTriggered.current && onAutoStopCallback.current) {
        console.warn('🔄 Ejecutando callback de auto-stop...');
        onAutoStopCallback.current(transcription);
        // Limpiar callback y bandera
        onAutoStopCallback.current = null;
        isAutoStopTriggered.current = false;
      }

      return transcription;
    } catch (err) {
      console.error('Error al detener grabación:', err);
      setError('Error al procesar audio');
      setIsRecording(false);
      setIsTranscribing(false);
      recordingRef.current = null;
      return null;
    }
  }, []);

  // Asignar referencia para que startRecording pueda llamar a stopRecording
  stopRecordingRef.current = stopRecording;

  return {
    isRecording,
    isTranscribing,
    startRecording,
    stopRecording,
    error,
  };
}

/**
 * Transcribe audio usando Gemini 2.0 Flash
 * Gemini puede procesar audio directamente
 */
async function transcribeWithGemini(audioUri: string): Promise<string | null> {
  try {
    // Leer el archivo de audio como base64 usando la nueva API
    const file = new File(audioUri);
    const base64Audio = await file.base64();

    // Log del tamaño del audio para debugging
    const audioSizeKB = Math.round((base64Audio.length * 0.75) / 1024);
    console.warn(`🎤 Audio size: ${audioSizeKB} KB`);

    if (audioSizeKB < 5) {
      console.warn('🎤 Audio muy corto, ignorando...');
      return null;
    }

    // Determinar el mime type
    const mimeType = audioUri.endsWith('.m4a') ? 'audio/mp4' : 'audio/webm';

    // Llamar a Gemini con el audio
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  inlineData: {
                    mimeType: mimeType,
                    data: base64Audio,
                  },
                },
                {
                  text: 'INSTRUCCIÓN: NO respondas ni interpretes. Solo transcribe palabra por palabra lo que escuchas en el audio. Si dice "agrega press de banca" escribe exactamente "agrega press de banca". Si el audio está vacío responde: EMPTY',
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0,
            maxOutputTokens: 500,
          },
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Gemini transcription error:', response.status, errorText);
      return null;
    }

    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;

    console.warn('🎤 Gemini raw response:', text);

    if (text && text !== 'EMPTY' && text.trim().length > 1) {
      // Normalizar cualquier nombre al inicio + coma/dos puntos a "Hank"
      // Detecta: "Juan, " o "Han, " o "Pedro: " etc. y lo convierte a "Hank, "
      let normalized = text.trim();

      // Patrón: palabra al inicio (capitalizada o no) seguida de coma o dos puntos
      const namePattern = /^[A-ZÁÉÍÓÚÑa-záéíóúñ]+[,:](\s)/i;
      if (namePattern.test(normalized)) {
        normalized = normalized.replace(namePattern, 'Hank,$1');
      }

      // Backup: variaciones específicas de HANK en cualquier parte
      const hankVariations = /\b(juan|jank|janc|ank|hanc|jenk|janck|jhan|jan|han|hank)\b/gi;
      normalized = normalized.replace(hankVariations, 'Hank');

      console.warn('🎤 Transcripción normalizada:', normalized);
      return normalized;
    }

    return null;
  } catch (err) {
    console.error('Error transcribiendo con Gemini:', err);
    return null;
  }
}
