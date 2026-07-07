import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from 'react';
import { supabase } from '../lib/supabase';
import { useUserRoleContext } from './UserRoleContext';

// ============================================================================
// TIPOS
// ============================================================================

export interface Sport {
  id: string;
  code: 'GYM' | 'MOTO' | 'AUTO' | 'SURF';
  name: string;
  description: string;
  icon: string;
  color_primary: string;
  color_secondary?: string;
  tab_4_name: string;
  tab_4_icon: string;
  tab_5_name: string;
  tab_5_icon: string;
  inventory_categories: InventoryCategory[];
  available_tools: SportTool[];
  profile_fields: ProfileField[];
  display_order: number;
}

export interface InventoryCategory {
  code: string;
  name: string;
  icon: string;
  fields?: CategoryField[];
}

export interface CategoryField {
  code: string;
  name: string;
  type: 'text' | 'number' | 'date' | 'select';
  options?: string[];
}

export interface SportTool {
  code: string;
  name: string;
}

export interface ProfileField {
  code: string;
  name: string;
  type: 'text' | 'number' | 'select';
  options?: string[];
}

export interface UserSport {
  id: string;
  sport_id: string;
  is_active: boolean;
  is_primary: boolean;
  personalization_mode: 'MANUAL' | 'AI' | 'HYBRID';
  sport_profile: Record<string, any>;
  custom_config: Record<string, any>;
}

export type PersonalizationMode = 'MANUAL' | 'AI' | 'HYBRID';

// ============================================================================
// CONFIGURACIÓN DE TABS POR DEPORTE
// ============================================================================

export const SPORT_TAB_CONFIG: Record<
  string,
  {
    tab4: { name: string; icon: string };
    tab5: { name: string; icon: string };
    color: string;
  }
> = {
  GYM: {
    tab4: { name: 'GYM', icon: 'Dumbbell' },
    tab5: { name: 'PLAN', icon: 'Timeline' },
    color: '#DC2626',
  },
  MOTO: {
    tab4: { name: 'GARAJE', icon: 'Warehouse' },
    tab5: { name: 'RACE', icon: 'Flag' },
    color: '#F97316',
  },
  AUTO: {
    tab4: { name: 'GARAJE', icon: 'Warehouse' },
    tab5: { name: 'RACE', icon: 'Flag' },
    color: '#EAB308',
  },
  SURF: {
    tab4: { name: 'TABLA', icon: 'Sailboat' },
    tab5: { name: 'SPOT', icon: 'Waves' },
    color: '#0EA5E9',
  },
};

// ============================================================================
// CONTEXTO
// ============================================================================

interface SportContextType {
  // Estado
  activeSport: Sport | null;
  userSports: UserSport[];
  allSports: Sport[];
  personalizationMode: PersonalizationMode;
  loading: boolean;

  // Acciones
  setActiveSport: (sportCode: string) => Promise<void>;
  addUserSport: (sportId: string) => Promise<void>;
  removeUserSport: (sportId: string) => Promise<void>;
  setPersonalizationMode: (mode: PersonalizationMode) => Promise<void>;
  refreshSports: () => Promise<void>;

  // Helpers
  getTabConfig: () => {
    tab4: { name: string; icon: string };
    tab5: { name: string; icon: string };
    color: string;
  };
  isFirstTime: boolean;
}

const SportContext = createContext<SportContextType | undefined>(undefined);

// ============================================================================
// PROVIDER
// ============================================================================

export function SportProvider({ children }: { children: ReactNode }) {
  const { user, isAuthenticated } = useUserRoleContext();

  const [allSports, setAllSports] = useState<Sport[]>([]);
  const [userSports, setUserSports] = useState<UserSport[]>([]);
  const [activeSport, setActiveSportState] = useState<Sport | null>(null);
  const [personalizationMode, setPersonalizationModeState] =
    useState<PersonalizationMode>('HYBRID');
  const [loading, setLoading] = useState(true);
  const [isFirstTime, setIsFirstTime] = useState(false);

  // -------------------------------------------------------------------------
  // CARGAR DEPORTES DISPONIBLES
  // -------------------------------------------------------------------------
  const loadAllSports = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('sports')
        .select('*')
        .eq('is_active', true)
        .order('display_order');

      if (error) throw error;
      setAllSports(data || []);
    } catch (error) {
      console.error('Error loading sports:', error);
      // Fallback a datos locales si falla
      setAllSports([
        {
          id: 'gym-local',
          code: 'GYM',
          name: 'Gym & Fitness',
          description: 'Entrenamiento de fuerza',
          icon: 'Dumbbell',
          color_primary: '#DC2626',
          tab_4_name: 'GYM',
          tab_4_icon: 'Dumbbell',
          tab_5_name: 'PLAN',
          tab_5_icon: 'Utensils',
          inventory_categories: [],
          available_tools: [],
          profile_fields: [],
          display_order: 1,
        },
      ] as Sport[]);
    }
  }, []);

  // -------------------------------------------------------------------------
  // CARGAR DEPORTES DEL USUARIO
  // -------------------------------------------------------------------------
  const loadUserSports = useCallback(async () => {
    if (!user) {
      setUserSports([]);
      setActiveSportState(null);
      setLoading(false);
      return;
    }

    try {
      // Cargar deportes del usuario (solo los activos)
      const { data: userSportsData, error: userSportsError } = await supabase
        .from('user_sports')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_active', true);

      if (userSportsError) throw userSportsError;
      setUserSports(userSportsData || []);

      // Si el usuario no tiene deportes, asignar GYM por defecto
      if (!userSportsData || userSportsData.length === 0) {
        const gym = allSports.find((s) => s.code === 'GYM');
        if (gym) {
          const { data: newSport, error: insertError } = await supabase
            .from('user_sports')
            .insert({
              user_id: user.id,
              sport_id: gym.id,
              is_active: true,
              is_primary: true,
            })
            .select()
            .single();

          if (!insertError && newSport) {
            setUserSports([newSport]);
          }

          // Actualizar active_sport_id en perfil
          await supabase
            .from('user_profiles')
            .update({ active_sport_id: gym.id })
            .eq('user_id', user.id);
        }
      }

      // Cargar perfil para obtener deporte activo
      const { data: profile, error: profileError } = await supabase
        .from('user_profiles')
        .select('active_sport_id, personalization_mode, hank_first_time_shown')
        .eq('user_id', user.id)
        .single();

      if (profileError && profileError.code !== 'PGRST116') {
        throw profileError;
      }

      // Determinar si es primera vez
      setIsFirstTime(!profile?.hank_first_time_shown);

      // Setear modo de personalización
      if (profile?.personalization_mode) {
        setPersonalizationModeState(profile.personalization_mode as PersonalizationMode);
      }

      // Setear deporte activo
      if (profile?.active_sport_id && allSports.length > 0) {
        const active = allSports.find((s) => s.id === profile.active_sport_id);
        if (active) {
          setActiveSportState(active);
        } else {
          // Default a GYM
          const gym = allSports.find((s) => s.code === 'GYM');
          setActiveSportState(gym || null);
        }
      } else if (allSports.length > 0) {
        // Default a GYM si no hay deporte activo
        const gym = allSports.find((s) => s.code === 'GYM');
        setActiveSportState(gym || allSports[0]);
      }
    } catch (error) {
      console.error('Error loading user sports:', error);
      // Default a GYM en caso de error
      const gym = allSports.find((s) => s.code === 'GYM');
      setActiveSportState(gym || null);
    } finally {
      setLoading(false);
    }
  }, [user, allSports]);

  // -------------------------------------------------------------------------
  // CAMBIAR DEPORTE ACTIVO
  // -------------------------------------------------------------------------
  const setActiveSport = useCallback(
    async (sportCode: string) => {
      const sport = allSports.find((s) => s.code === sportCode);
      if (!sport) return;

      setActiveSportState(sport);

      if (user) {
        try {
          // Actualizar en perfil
          await supabase
            .from('user_profiles')
            .update({ active_sport_id: sport.id })
            .eq('user_id', user.id);

          // Asegurar que el deporte está en user_sports
          const exists = userSports.find((us) => us.sport_id === sport.id);
          if (!exists) {
            await supabase.from('user_sports').insert({
              user_id: user.id,
              sport_id: sport.id,
              is_active: true,
              is_primary: userSports.length === 0,
            });
          }
        } catch (error) {
          console.error('Error setting active sport:', error);
        }
      }
    },
    [user, allSports, userSports]
  );

  // -------------------------------------------------------------------------
  // AGREGAR DEPORTE AL USUARIO
  // Si ya existe un registro desactivado, lo reactiva en lugar de crear uno nuevo
  // Esto preserva los datos históricos del usuario para ese deporte
  // -------------------------------------------------------------------------
  const addUserSport = useCallback(
    async (sportId: string) => {
      if (!user) return;

      try {
        // Verificar si ya existe un registro (activo o inactivo)
        const { data: existingRecord } = await supabase
          .from('user_sports')
          .select('*')
          .eq('user_id', user.id)
          .eq('sport_id', sportId)
          .single();

        if (existingRecord) {
          // Reactivar el registro existente (preserva datos históricos)
          const { data, error } = await supabase
            .from('user_sports')
            .update({ is_active: true })
            .eq('id', existingRecord.id)
            .select()
            .single();

          if (error) throw error;
          setUserSports((prev) => [...prev, data]);
        } else {
          // Crear nuevo registro
          const { data, error } = await supabase
            .from('user_sports')
            .insert({
              user_id: user.id,
              sport_id: sportId,
              is_active: true,
              is_primary: userSports.length === 0,
            })
            .select()
            .single();

          if (error) throw error;
          setUserSports((prev) => [...prev, data]);
        }
      } catch (error) {
        console.error('Error adding user sport:', error);
      }
    },
    [user, userSports]
  );

  // -------------------------------------------------------------------------
  // DESACTIVAR DEPORTE DEL USUARIO
  // Solo marca is_active = false, NO elimina los datos
  // Así el usuario puede reactivar el deporte y conservar su historial
  // -------------------------------------------------------------------------
  const removeUserSport = useCallback(
    async (sportId: string) => {
      if (!user) return;

      try {
        // Desactivar en lugar de eliminar (preserva datos históricos)
        await supabase
          .from('user_sports')
          .update({ is_active: false })
          .eq('user_id', user.id)
          .eq('sport_id', sportId);

        // Remover del estado local (pero sigue en BD como inactivo)
        setUserSports((prev) => prev.filter((us) => us.sport_id !== sportId));

        // Si era el deporte activo, cambiar a GYM
        if (activeSport?.id === sportId) {
          const gym = allSports.find((s) => s.code === 'GYM');
          if (gym) {
            setActiveSportState(gym);
            await supabase
              .from('user_profiles')
              .update({ active_sport_id: gym.id })
              .eq('user_id', user.id);
          }
        }
      } catch (error) {
        console.error('Error deactivating user sport:', error);
      }
    },
    [user, activeSport, allSports]
  );

  // -------------------------------------------------------------------------
  // CAMBIAR MODO DE PERSONALIZACIÓN
  // -------------------------------------------------------------------------
  const setPersonalizationMode = useCallback(
    async (mode: PersonalizationMode) => {
      setPersonalizationModeState(mode);

      if (user) {
        try {
          await supabase
            .from('user_profiles')
            .update({ personalization_mode: mode })
            .eq('user_id', user.id);
        } catch (error) {
          console.error('Error setting personalization mode:', error);
        }
      }
    },
    [user]
  );

  // -------------------------------------------------------------------------
  // REFRESH
  // -------------------------------------------------------------------------
  const refreshSports = useCallback(async () => {
    setLoading(true);
    await loadAllSports();
    await loadUserSports();
  }, [loadAllSports, loadUserSports]);

  // -------------------------------------------------------------------------
  // HELPER: OBTENER CONFIG DE TABS
  // -------------------------------------------------------------------------
  const getTabConfig = useCallback(() => {
    if (activeSport) {
      const isPlanTab = (activeSport.tab_5_name || '').trim().toUpperCase() === 'PLAN';
      return {
        tab4: { name: activeSport.tab_4_name, icon: activeSport.tab_4_icon },
        tab5: {
          name: activeSport.tab_5_name,
          icon: isPlanTab ? 'Timeline' : activeSport.tab_5_icon,
        },
        color: activeSport.color_primary,
      };
    }
    // Default a GYM
    return SPORT_TAB_CONFIG.GYM;
  }, [activeSport]);

  // -------------------------------------------------------------------------
  // EFFECTS
  // -------------------------------------------------------------------------
  useEffect(() => {
    loadAllSports();
  }, [loadAllSports]);

  useEffect(() => {
    if (allSports.length > 0) {
      loadUserSports();
    }
  }, [allSports, loadUserSports, isAuthenticated]);

  // -------------------------------------------------------------------------
  // RENDER
  // -------------------------------------------------------------------------
  return (
    <SportContext.Provider
      value={{
        activeSport,
        userSports,
        allSports,
        personalizationMode,
        loading,
        setActiveSport,
        addUserSport,
        removeUserSport,
        setPersonalizationMode,
        refreshSports,
        getTabConfig,
        isFirstTime,
      }}
    >
      {children}
    </SportContext.Provider>
  );
}

// ============================================================================
// HOOK
// ============================================================================

export function useSport() {
  const context = useContext(SportContext);
  if (!context) {
    throw new Error('useSport must be used within a SportProvider');
  }
  return context;
}

// ============================================================================
// EXPORT DEFAULT
// ============================================================================

export default SportContext;
