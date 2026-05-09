// ============================================================================
// COACH SESSION CONTEXT — MODO RÁPIDO (Guest Coach)
// Maneja la sesión del coach (sin cuenta) que ingresó vía código de invitación.
// Persiste en AsyncStorage / localStorage. Auto-expira.
// ============================================================================
import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  ReactNode,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { supabase } from '../lib/supabase';

const STORAGE_KEY = '@trens/coach_session_v1';
const FP_KEY = '@trens/device_fp_v1';

// ============================================================================
// TIPOS
// ============================================================================
export interface CoachSession {
  token: string;
  athleteId: string;
  athleteName: string;
  coachName: string;
  scopes: string[];
  expiresAt: string; // ISO
}

export interface CoachSessionContextValue {
  session: CoachSession | null;
  loading: boolean;
  isCoachMode: boolean;
  msRemaining: number;
  /** Abre sesión de coach desde un código de invitación. */
  openSession: (code: string) => Promise<CoachSession>;
  /** Cierra la sesión actual (logout coach). */
  closeSession: () => Promise<void>;
  /** Refresca info de la sesión desde el backend. */
  refresh: () => Promise<void>;
  /** Genera/recupera el fingerprint de dispositivo. */
  deviceFingerprint: () => Promise<string>;
  /** ID efectivo a usar para escrituras (athlete si coach mode, else null). */
  effectiveAthleteId: string | null;
  /** Aplica un patch al plan del atleta vía RPC scoped. */
  applyPlanPatch: (patch: Record<string, unknown>) => Promise<void>;
}

const CoachSessionContext = createContext<CoachSessionContextValue | undefined>(undefined);

// ============================================================================
// STORAGE HELPERS (web + native)
// ============================================================================
const storage = {
  async get(key: string): Promise<string | null> {
    try {
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        return window.localStorage.getItem(key);
      }
      return await AsyncStorage.getItem(key);
    } catch {
      return null;
    }
  },
  async set(key: string, value: string): Promise<void> {
    try {
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.localStorage.setItem(key, value);
      } else {
        await AsyncStorage.setItem(key, value);
      }
    } catch {
      /* ignore */
    }
  },
  async remove(key: string): Promise<void> {
    try {
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.localStorage.removeItem(key);
      } else {
        await AsyncStorage.removeItem(key);
      }
    } catch {
      /* ignore */
    }
  },
};

// ============================================================================
// FINGERPRINT HELPER
// ============================================================================
async function getDeviceFingerprint(): Promise<string> {
  let fp = await storage.get(FP_KEY);
  if (fp) return fp;
  const rand =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const ua =
    Platform.OS === 'web' && typeof navigator !== 'undefined' ? navigator.userAgent : Platform.OS;
  fp = `${Platform.OS}:${rand}:${ua.slice(0, 32)}`;
  await storage.set(FP_KEY, fp);
  return fp;
}

// ============================================================================
// PROVIDER
// ============================================================================
export function CoachSessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<CoachSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(() => Date.now());

  // Hidratar al inicio
  useEffect(() => {
    (async () => {
      try {
        const raw = await storage.get(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as CoachSession;
          if (new Date(parsed.expiresAt).getTime() > Date.now()) {
            setSession(parsed);
          } else {
            await storage.remove(STORAGE_KEY);
          }
        }
      } catch {
        /* ignore */
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Tick para countdown + auto-cierre al expirar
  useEffect(() => {
    if (!session) return;
    const id = setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (new Date(session.expiresAt).getTime() <= t) {
        storage.remove(STORAGE_KEY).then(() => setSession(null));
      }
    }, 1000);
    return () => clearInterval(id);
  }, [session]);

  // ---------------------------------------------------------------------------
  // openSession — el coach valida el código → crea sesión backend → persiste
  // ---------------------------------------------------------------------------
  const openSession = useCallback(async (code: string): Promise<CoachSession> => {
    const fp = await getDeviceFingerprint();
    const { data, error } = await supabase.rpc('coach_session_open', {
      p_code: code,
      p_device_fp: fp,
    });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    if (!row?.token) throw new Error('SESSION_NOT_CREATED');
    const next: CoachSession = {
      token: row.token,
      athleteId: row.athlete_id,
      athleteName: row.athlete_name ?? 'Atleta',
      coachName: row.coach_name,
      scopes: row.scopes ?? ['plan:edit'],
      expiresAt: row.expires_at,
    };
    await storage.set(STORAGE_KEY, JSON.stringify(next));
    setSession(next);
    return next;
  }, []);

  // ---------------------------------------------------------------------------
  // closeSession — cierra en backend y limpia local
  // ---------------------------------------------------------------------------
  const closeSession = useCallback(async () => {
    if (session) {
      try {
        await supabase.rpc('coach_session_close', { p_token: session.token });
      } catch {
        /* swallow — limpiar local de todas formas */
      }
    }
    await storage.remove(STORAGE_KEY);
    setSession(null);
  }, [session]);

  // ---------------------------------------------------------------------------
  // refresh — re-lee la sesión del backend (detecta revocación)
  // ---------------------------------------------------------------------------
  const refresh = useCallback(async () => {
    if (!session) return;
    try {
      const { data, error } = await supabase.rpc('coach_session_get', {
        p_token: session.token,
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      if (!row || row.closed_at || new Date(row.expires_at).getTime() <= Date.now()) {
        await storage.remove(STORAGE_KEY);
        setSession(null);
        return;
      }
      const next: CoachSession = {
        ...session,
        athleteName: row.athlete_name ?? session.athleteName,
        coachName: row.coach_name ?? session.coachName,
        scopes: row.scopes ?? session.scopes,
        expiresAt: row.expires_at ?? session.expiresAt,
      };
      await storage.set(STORAGE_KEY, JSON.stringify(next));
      setSession(next);
    } catch {
      /* offline — mantener sesión local */
    }
  }, [session]);

  // ---------------------------------------------------------------------------
  // applyPlanPatch — escritura scoped del coach al plan del atleta
  // ---------------------------------------------------------------------------
  const applyPlanPatch = useCallback(
    async (patch: Record<string, unknown>) => {
      if (!session) throw new Error('NO_COACH_SESSION');
      const { error } = await supabase.rpc('coach_apply_plan_patch', {
        p_token: session.token,
        p_patch: patch,
      });
      if (error) throw error;
    },
    [session]
  );

  const isCoachMode = !!session && new Date(session.expiresAt).getTime() > now;
  const msRemaining = session ? Math.max(0, new Date(session.expiresAt).getTime() - now) : 0;

  return (
    <CoachSessionContext.Provider
      value={{
        session,
        loading,
        isCoachMode,
        msRemaining,
        openSession,
        closeSession,
        refresh,
        deviceFingerprint: getDeviceFingerprint,
        effectiveAthleteId: isCoachMode ? session!.athleteId : null,
        applyPlanPatch,
      }}
    >
      {children}
    </CoachSessionContext.Provider>
  );
}

// ============================================================================
// HOOK
// ============================================================================
export function useCoachSession(): CoachSessionContextValue {
  const ctx = useContext(CoachSessionContext);
  if (!ctx) {
    throw new Error('useCoachSession must be used within CoachSessionProvider');
  }
  return ctx;
}

// ============================================================================
// HELPER PURO — formatea ms restantes a "Xh Ym"
// ============================================================================
export function formatCoachRemaining(ms: number): string {
  if (ms <= 0) return 'EXPIRADA';
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m.toString().padStart(2, '0')}m`;
  if (m > 0) return `${m}m ${s.toString().padStart(2, '0')}s`;
  return `${s}s`;
}
