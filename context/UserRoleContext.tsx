import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from 'react';
import { supabase } from '../lib/supabase';
import { User } from '@supabase/supabase-js';
import spotify from '../services/spotify/spotify';
import { spotifyLogger, authLogger } from '../lib/logger';

// ============================================================================
// TIPOS
// ============================================================================
export type UserRole = 'pro' | 'free';

export interface UserRoleContextValue {
  // Estado de autenticación
  user: User | null;
  isAuthenticated: boolean;
  loading: boolean;

  // Rol del usuario
  role: UserRole;
  isPro: boolean;
  isFree: boolean;

  // Spotify
  spotifyConnected: boolean;
  spotifyPremium: boolean;
  spotifyFeedSync: boolean;

  // Acciones
  refetch: () => Promise<void>;
  updateSpotifyStatus: (connected: boolean, premium: boolean) => Promise<void>;
  updateSpotifyFeedSync: (enabled: boolean) => Promise<void>;

  // Permisos explícitos (según MASTER)
  permissions: {
    canUseCamera: boolean;
    canRecord: boolean;
    canPublish: boolean;
    canSaveToVault: boolean;
    hasHistory: boolean;
    canControlSpotify: boolean;
    canViewFeed: boolean;
    canSwitchAudioMode: boolean;
  };
}

// ============================================================================
// CONTEXT
// ============================================================================
const UserRoleContext = createContext<UserRoleContextValue | undefined>(undefined);

// ============================================================================
// PROVIDER
// ============================================================================
export function UserRoleProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<UserRole>('free');
  const [spotifyConnected, setSpotifyConnected] = useState(false);
  const [spotifyPremium, setSpotifyPremium] = useState(false);
  const [spotifyFeedSync, setSpotifyFeedSync] = useState(true);

  // -------------------------------------------------------------------------
  // FETCH USER ROLE + SPOTIFY STATUS
  // -------------------------------------------------------------------------
  const fetchRole = useCallback(async (userId: string) => {
    try {
      const { data: roleData, error: roleError } = await supabase
        .from('user_roles')
        .select('role, spotify_connected, spotify_premium, spotify_feed_sync')
        .eq('user_id', userId)
        .single();

      if (roleError) {
        // Si no existe, crear registro con rol FREE
        if (roleError.code === 'PGRST116') {
          const { error: insertError } = await supabase
            .from('user_roles')
            .insert({ user_id: userId, role: 'free' });

          if (!insertError) {
            setRole('free');
            setSpotifyConnected(false);
            setSpotifyPremium(false);
            setSpotifyFeedSync(true);
          }
        }
      } else if (roleData) {
        setRole(roleData.role as UserRole);
        // Cargar estado de Spotify desde la DB
        setSpotifyConnected(roleData.spotify_connected ?? false);
        setSpotifyPremium(roleData.spotify_premium ?? false);
        setSpotifyFeedSync(roleData.spotify_feed_sync ?? true);
        spotifyLogger.debug('Status cargado:', {
          connected: roleData.spotify_connected,
          premium: roleData.spotify_premium,
          feedSync: roleData.spotify_feed_sync,
        });
      }
    } catch (err) {
      authLogger.error('Error fetching user role:', err);
      setRole('free');
    }
  }, []);

  // -------------------------------------------------------------------------
  // AUTH LISTENER
  // -------------------------------------------------------------------------
  useEffect(() => {
    // Obtener sesión inicial
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        // IMPORTANTE: Esperar a que fetchRole termine antes de setLoading(false)
        await fetchRole(session.user.id);
        // 🎵 Cargar token de Spotify al inicio
        const connected = await spotify.loadStoredTokens();
        // 🔥 Warm-up silencioso si está conectado
        if (connected) {
          spotify.warmUp();
        }
      }
      setLoading(false);
    });

    // Escuchar cambios de autenticación
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchRole(session.user.id);
        // 🎵 Cargar token de Spotify en cambio de auth
        const connected = await spotify.loadStoredTokens();
        // 🔥 Warm-up silencioso si está conectado
        if (connected) {
          spotify.warmUp();
        }
      } else {
        // Reset a FREE cuando se desloguea
        setRole('free');
        setSpotifyConnected(false);
        setSpotifyPremium(false);
        setSpotifyFeedSync(true);
      }
    });

    return () => subscription.unsubscribe();
  }, [fetchRole]);

  // -------------------------------------------------------------------------
  // UPDATE SPOTIFY STATUS
  // -------------------------------------------------------------------------
  const updateSpotifyStatus = useCallback(
    async (connected: boolean, premium: boolean) => {
      // Siempre actualizar estado local (para que funcione inmediatamente)
      setSpotifyConnected(connected);
      setSpotifyPremium(premium);
      spotifyLogger.debug('Status local actualizado:', { connected, premium });

      // Solo guardar en DB si hay usuario autenticado
      if (!user) {
        spotifyLogger.debug('Usuario no autenticado, no se guarda en DB');
        return;
      }

      try {
        const { error: updateError } = await supabase
          .from('user_roles')
          .update({
            spotify_connected: connected,
            spotify_premium: premium,
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', user.id);

        if (updateError) {
          spotifyLogger.error('Error updating status:', updateError);
        } else {
          spotifyLogger.debug('Status guardado en DB:', { connected, premium });
        }
      } catch (err) {
        spotifyLogger.error('Error updating status:', err);
      }
    },
    [user]
  );

  // -------------------------------------------------------------------------
  // UPDATE SPOTIFY FEED SYNC PREFERENCE
  // -------------------------------------------------------------------------
  const updateSpotifyFeedSync = useCallback(
    async (enabled: boolean) => {
      if (!user) return;

      // Actualizar estado local inmediatamente (optimistic update)
      setSpotifyFeedSync(enabled);

      try {
        const { error: updateError } = await supabase
          .from('user_roles')
          .update({
            spotify_feed_sync: enabled,
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', user.id);

        if (updateError) {
          spotifyLogger.error('Error updating feed sync:', updateError);
          // Revertir si falla
          setSpotifyFeedSync(!enabled);
        } else {
          spotifyLogger.debug('Feed sync actualizado en DB:', { enabled });
        }
      } catch (err) {
        spotifyLogger.error('Error updating feed sync:', err);
        setSpotifyFeedSync(!enabled);
      }
    },
    [user]
  );

  // -------------------------------------------------------------------------
  // REFETCH
  // -------------------------------------------------------------------------
  const refetch = useCallback(async () => {
    if (user) {
      await fetchRole(user.id);
    }
  }, [user, fetchRole]);

  // -------------------------------------------------------------------------
  // PERMISOS (Según MASTER)
  // -------------------------------------------------------------------------
  const isPro = role === 'pro';
  const isFree = role === 'free';

  const permissions = {
    // PRO exclusivo
    canUseCamera: isPro,
    canRecord: isPro,
    canPublish: isPro,
    canSaveToVault: isPro,
    hasHistory: isPro,

    // Spotify - disponible para todos los usuarios
    canControlSpotify: true,

    // Todos los usuarios
    canViewFeed: true,
    canSwitchAudioMode: true,
  };

  // -------------------------------------------------------------------------
  // VALUE
  // -------------------------------------------------------------------------
  const value: UserRoleContextValue = {
    user,
    isAuthenticated: !!user,
    loading,
    role,
    isPro,
    isFree,
    spotifyConnected,
    spotifyPremium,
    spotifyFeedSync,
    refetch,
    updateSpotifyStatus,
    updateSpotifyFeedSync,
    permissions,
  };

  return <UserRoleContext.Provider value={value}>{children}</UserRoleContext.Provider>;
}

// ============================================================================
// HOOK
// ============================================================================
export function useUserRoleContext() {
  const context = useContext(UserRoleContext);
  if (!context) {
    throw new Error('useUserRoleContext must be used within a UserRoleProvider');
  }
  return context;
}
