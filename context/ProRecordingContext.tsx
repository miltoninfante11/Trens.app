import React, { createContext, useContext, useState, useRef, useCallback, ReactNode } from 'react';

// ============================================================================
// TIPOS
// ============================================================================
type CaptureMode = 'photo' | 'video';

interface ProRecordingContextValue {
  isRecording: boolean;
  recordingTime: number;
  hasSpotify: boolean;
  exerciseName: string | null;
  captureMode: CaptureMode;

  // Métodos que serán implementados por PRO screen
  startRecording: () => void;
  stopRecording: () => void;
  takePhoto: () => void;

  // Para que PRO screen registre sus handlers
  registerHandlers: (handlers: { start: () => void; stop: () => void; photo: () => void }) => void;

  // Para actualizar estado desde PRO screen
  setRecordingState: (isRecording: boolean, time: number) => void;
  setSpotifyState: (hasSpotify: boolean) => void;
  setExerciseState: (name: string | null) => void;
  setCaptureMode: (mode: CaptureMode) => void;
}

// ============================================================================
// CONTEXT
// ============================================================================
const ProRecordingContext = createContext<ProRecordingContextValue | undefined>(undefined);

// ============================================================================
// PROVIDER
// ============================================================================
export function ProRecordingProvider({ children }: { children: ReactNode }) {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [hasSpotify, setHasSpotify] = useState(false);
  const [exerciseName, setExerciseName] = useState<string | null>(null);
  const [captureMode, setCaptureMode] = useState<CaptureMode>('photo');

  const handlersRef = useRef<{ start: () => void; stop: () => void; photo: () => void } | null>(
    null
  );

  const registerHandlers = useCallback(
    (handlers: { start: () => void; stop: () => void; photo: () => void }) => {
      handlersRef.current = handlers;
    },
    []
  );

  const startRecording = useCallback(() => {
    if (handlersRef.current) {
      handlersRef.current.start();
    }
  }, []);

  const stopRecording = useCallback(() => {
    if (handlersRef.current) {
      handlersRef.current.stop();
    }
  }, []);

  const takePhoto = useCallback(() => {
    if (handlersRef.current) {
      handlersRef.current.photo();
    }
  }, []);

  const setRecordingState = useCallback((recording: boolean, time: number) => {
    setIsRecording(recording);
    setRecordingTime(time);
  }, []);

  const setSpotifyState = useCallback((spotify: boolean) => {
    setHasSpotify(spotify);
  }, []);

  const setExerciseState = useCallback((name: string | null) => {
    setExerciseName(name);
  }, []);

  return (
    <ProRecordingContext.Provider
      value={{
        isRecording,
        recordingTime,
        hasSpotify,
        exerciseName,
        captureMode,
        startRecording,
        stopRecording,
        takePhoto,
        registerHandlers,
        setRecordingState,
        setSpotifyState,
        setExerciseState,
        setCaptureMode,
      }}
    >
      {children}
    </ProRecordingContext.Provider>
  );
}

// ============================================================================
// HOOK
// ============================================================================
export function useProRecording() {
  const context = useContext(ProRecordingContext);
  if (!context) {
    throw new Error('useProRecording must be used within a ProRecordingProvider');
  }
  return context;
}
