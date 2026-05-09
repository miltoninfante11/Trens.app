// ============================================================================
// HANK CONTEXT - Proveedor global completo para el Agente HANK
// Incluye: Contexto dinámico, Sistema de Aliases, Integración LLM
// ============================================================================

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  useEffect,
  useRef,
  ReactNode,
} from 'react';
import { useHankExecutor } from '../hooks/useHankExecutor';
import { supabase } from '../lib/supabase';
import {
  callGemini,
  continueAfterToolExecution,
  continueWithMoreTools,
} from '../services/hank/gemini';
import { useSport } from './SportContext';
import { hankLogger, syncLogger } from '../lib/logger';
import type {
  HankContextState,
  HankToolResult,
  HankToolCall,
  ScreenContext,
  ActiveAsset,
  SportMode,
  UserProfile,
  UserAlias,
  HankTarget,
  HankAnimationPhase,
  HankTargetState,
  PlanBuilderState,
  PlanBuilderMeal,
  PlanBuilderSupplement,
  PlanBuilderIngredient,
} from '../types/hank';

// ============================================================================
// GEMINI API KEY - Configura tu clave aquí o usa variable de entorno
// ============================================================================
const GEMINI_API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY || '';

// ============================================================================
// HELPER: Clasificación inteligente de herramientas v3.0
// Sistema más robusto con categorización por impacto
// ============================================================================

type ToolCategory = 'read' | 'write' | 'system' | 'builder';
type ToolImpact = 'none' | 'low' | 'medium' | 'high';

interface ToolClassification {
  category: ToolCategory;
  impact: ToolImpact;
  triggersAnimation: boolean;
  triggersRefresh: boolean;
}

const TOOL_CLASSIFICATIONS: Record<string, ToolClassification> = {
  // =========================================================================
  // WRITE TOOLS - Alto impacto, modifican datos del usuario
  // =========================================================================
  // GYM - Modificar ejercicios
  GYM_ADD_EXERCISE: {
    category: 'write',
    impact: 'high',
    triggersAnimation: true,
    triggersRefresh: true,
  },
  GYM_REMOVE_EXERCISE: {
    category: 'write',
    impact: 'high',
    triggersAnimation: true,
    triggersRefresh: true,
  },
  GYM_REPLACE_EXERCISE: {
    category: 'write',
    impact: 'high',
    triggersAnimation: true,
    triggersRefresh: true,
  },
  GYM_UPDATE_SERIES_DETAIL: {
    category: 'write',
    impact: 'medium',
    triggersAnimation: true,
    triggersRefresh: true,
  },
  GYM_CREATE_EXERCISE_GROUP: {
    category: 'write',
    impact: 'high',
    triggersAnimation: true,
    triggersRefresh: true,
  },
  GYM_REMOVE_EXERCISE_GROUP: {
    category: 'write',
    impact: 'high',
    triggersAnimation: true,
    triggersRefresh: true,
  },

  // ASSET - Modificar series y datos
  ASSET_UPDATE_FIELD: {
    category: 'write',
    impact: 'medium',
    triggersAnimation: true,
    triggersRefresh: true,
  },
  ASSET_REMOVE_SERIES: {
    category: 'write',
    impact: 'medium',
    triggersAnimation: true,
    triggersRefresh: true,
  },
  ASSET_ADD_SERIES: {
    category: 'write',
    impact: 'medium',
    triggersAnimation: true,
    triggersRefresh: true,
  },
  ASSET_REPLACE_SERIES: {
    category: 'write',
    impact: 'medium',
    triggersAnimation: true,
    triggersRefresh: true,
  },
  ASSET_SET_SERIES: {
    category: 'write',
    impact: 'high',
    triggersAnimation: true,
    triggersRefresh: true,
  },

  // ADN - Modificar perfil
  ADN_UPDATE_PROFILE: {
    category: 'write',
    impact: 'high',
    triggersAnimation: true,
    triggersRefresh: true,
  },
  ADN_SET_BIOMETRICS: {
    category: 'write',
    impact: 'high',
    triggersAnimation: true,
    triggersRefresh: true,
  },
  ADN_ADD_MEASUREMENT: {
    category: 'write',
    impact: 'medium',
    triggersAnimation: true,
    triggersRefresh: true,
  },
  ADN_REMOVE_MEASUREMENT: {
    category: 'write',
    impact: 'medium',
    triggersAnimation: true,
    triggersRefresh: true,
  },
  ADN_UPDATE_MEASUREMENT: {
    category: 'write',
    impact: 'medium',
    triggersAnimation: true,
    triggersRefresh: true,
  },

  // PLAN - Modificar comidas/suplementos
  PLAN_ADD_MEAL: {
    category: 'write',
    impact: 'high',
    triggersAnimation: true,
    triggersRefresh: true,
  },
  PLAN_REMOVE_MEAL: {
    category: 'write',
    impact: 'high',
    triggersAnimation: true,
    triggersRefresh: true,
  },
  PLAN_UPDATE_MEAL_TIME: {
    category: 'write',
    impact: 'medium',
    triggersAnimation: true,
    triggersRefresh: true,
  },
  PLAN_UPDATE_INGREDIENTS: {
    category: 'write',
    impact: 'medium',
    triggersAnimation: true,
    triggersRefresh: true,
  },
  PLAN_ADD_SUPPLEMENT: {
    category: 'write',
    impact: 'high',
    triggersAnimation: true,
    triggersRefresh: true,
  },
  PLAN_REMOVE_SUPPLEMENT: {
    category: 'write',
    impact: 'high',
    triggersAnimation: true,
    triggersRefresh: true,
  },
  PLAN_UPDATE_SUPPLEMENT_TIME: {
    category: 'write',
    impact: 'medium',
    triggersAnimation: true,
    triggersRefresh: true,
  },

  // TRAINING - Modificar plan de entrenamiento
  TRAINING_ASSIGN_PLAN: {
    category: 'write',
    impact: 'high',
    triggersAnimation: true,
    triggersRefresh: true,
  },
  TRAINING_RESTRUCTURE: {
    category: 'write',
    impact: 'high',
    triggersAnimation: true,
    triggersRefresh: true,
  },
  TRAINING_RENAME_DAY: {
    category: 'write',
    impact: 'low',
    triggersAnimation: true,
    triggersRefresh: true,
  },
  TRAINING_ADD_DAY: {
    category: 'write',
    impact: 'high',
    triggersAnimation: true,
    triggersRefresh: true,
  },
  TRAINING_REMOVE_DAY: {
    category: 'write',
    impact: 'high',
    triggersAnimation: true,
    triggersRefresh: true,
  },
  TRAINING_SET_EXTERNAL_MODE: {
    category: 'write',
    impact: 'medium',
    triggersAnimation: true,
    triggersRefresh: true,
  },
  TRAINING_SET_EXTERNAL_SCHEDULE: {
    category: 'write',
    impact: 'high',
    triggersAnimation: true,
    triggersRefresh: true,
  },
  TRAINING_REMOVE_EXTERNAL_DAY: {
    category: 'write',
    impact: 'medium',
    triggersAnimation: true,
    triggersRefresh: true,
  },

  // SYNC y AUTO
  SYNC_NUTRITION_MACROS: {
    category: 'write',
    impact: 'high',
    triggersAnimation: true,
    triggersRefresh: true,
  },
  AUTO_ADJUST_ALL: {
    category: 'write',
    impact: 'high',
    triggersAnimation: true,
    triggersRefresh: true,
  },

  // PRO - Guardar notas
  PRO_ADD_EXERCISE_NOTE: {
    category: 'write',
    impact: 'low',
    triggersAnimation: true,
    triggersRefresh: true,
  },

  // GOALS
  SET_USER_GOAL: {
    category: 'write',
    impact: 'high',
    triggersAnimation: true,
    triggersRefresh: true,
  },
  UPDATE_GOAL_PROGRESS: {
    category: 'write',
    impact: 'medium',
    triggersAnimation: true,
    triggersRefresh: true,
  },

  // INVENTORY
  INVENTORY_ADD_ITEM: {
    category: 'write',
    impact: 'high',
    triggersAnimation: true,
    triggersRefresh: true,
  },
  INVENTORY_UPDATE_ITEM: {
    category: 'write',
    impact: 'medium',
    triggersAnimation: true,
    triggersRefresh: true,
  },
  INVENTORY_REMOVE_ITEM: {
    category: 'write',
    impact: 'high',
    triggersAnimation: true,
    triggersRefresh: true,
  },

  // MAINTENANCE
  MAINTENANCE_LOG: {
    category: 'write',
    impact: 'medium',
    triggersAnimation: true,
    triggersRefresh: true,
  },

  // EVENTS
  EVENT_CREATE: {
    category: 'write',
    impact: 'high',
    triggersAnimation: true,
    triggersRefresh: true,
  },
  EVENT_UPDATE: {
    category: 'write',
    impact: 'medium',
    triggersAnimation: true,
    triggersRefresh: true,
  },
  EVENT_DELETE: {
    category: 'write',
    impact: 'high',
    triggersAnimation: true,
    triggersRefresh: true,
  },

  // SURF
  SURF_LOG_SESSION: {
    category: 'write',
    impact: 'high',
    triggersAnimation: true,
    triggersRefresh: true,
  },
  SURF_FAVORITE_SPOT: {
    category: 'write',
    impact: 'low',
    triggersAnimation: true,
    triggersRefresh: true,
  },

  // DIET - Legacy
  DIET_ADD_CALORIES: {
    category: 'write',
    impact: 'medium',
    triggersAnimation: true,
    triggersRefresh: true,
  },

  // LOGGING
  LOG_WORKOUT_SET: {
    category: 'write',
    impact: 'medium',
    triggersAnimation: true,
    triggersRefresh: true,
  },

  // =========================================================================
  // BUILDER TOOLS - Plan Builder (manejo especial)
  // =========================================================================
  PLAN_BUILDER_START: {
    category: 'builder',
    impact: 'none',
    triggersAnimation: false,
    triggersRefresh: false,
  },
  PLAN_BUILDER_ADD_MEAL: {
    category: 'builder',
    impact: 'none',
    triggersAnimation: false,
    triggersRefresh: false,
  },
  PLAN_BUILDER_EDIT_MEAL: {
    category: 'builder',
    impact: 'none',
    triggersAnimation: false,
    triggersRefresh: false,
  },
  PLAN_BUILDER_REMOVE_MEAL: {
    category: 'builder',
    impact: 'none',
    triggersAnimation: false,
    triggersRefresh: false,
  },
  PLAN_BUILDER_ADD_SUPPLEMENT: {
    category: 'builder',
    impact: 'none',
    triggersAnimation: false,
    triggersRefresh: false,
  },
  PLAN_BUILDER_REMOVE_SUPPLEMENT: {
    category: 'builder',
    impact: 'none',
    triggersAnimation: false,
    triggersRefresh: false,
  },
  PLAN_BUILDER_SET_TRAINING: {
    category: 'builder',
    impact: 'none',
    triggersAnimation: false,
    triggersRefresh: false,
  },
  PLAN_BUILDER_SHOW: {
    category: 'builder',
    impact: 'none',
    triggersAnimation: false,
    triggersRefresh: false,
  },
  PLAN_BUILDER_CLEAR: {
    category: 'builder',
    impact: 'none',
    triggersAnimation: false,
    triggersRefresh: false,
  },
  PLAN_BUILDER_EXECUTE: {
    category: 'builder',
    impact: 'high',
    triggersAnimation: true,
    triggersRefresh: true,
  },

  // =========================================================================
  // SYSTEM TOOLS - Sin animación, sin refresh
  // =========================================================================
  HANK_CLEAR_HISTORY: {
    category: 'system',
    impact: 'none',
    triggersAnimation: false,
    triggersRefresh: false,
  },
  HANK_GET_CAPABILITIES: {
    category: 'system',
    impact: 'none',
    triggersAnimation: false,
    triggersRefresh: false,
  },
};

// Función para obtener clasificación de una herramienta
const getToolClassification = (toolName: string): ToolClassification => {
  // Buscar en clasificaciones explícitas
  if (TOOL_CLASSIFICATIONS[toolName]) {
    return TOOL_CLASSIFICATIONS[toolName];
  }

  // Patrones de inferencia para herramientas no clasificadas explícitamente
  const readPatterns = [
    '_GET_',
    '_LIST_',
    '_SHOW',
    'GET_FULL_',
    'GET_USER_',
    'ANALYZE_',
    '_COMPARE_',
    'SPOTIFY_',
  ];

  for (const pattern of readPatterns) {
    if (toolName.includes(pattern)) {
      return { category: 'read', impact: 'none', triggersAnimation: false, triggersRefresh: false };
    }
  }

  // Por defecto, asumir WRITE para seguridad
  console.warn(`⚠️ getToolClassification: "${toolName}" no clasificada, asumiendo WRITE`);
  return { category: 'write', impact: 'medium', triggersAnimation: true, triggersRefresh: true };
};

// Helper legacy para compatibilidad
const isWriteTool = (toolName: string): boolean => {
  const classification = getToolClassification(toolName);
  return classification.triggersAnimation;
};

// ============================================================================
// DEFAULT VALUES
// ============================================================================
const defaultScreenContext: ScreenContext = {
  module: 'nucleo',
  viewMode: null,
  currentExerciseIndex: null,
  currentTrainingDay: 0,
  estimatedWorkoutTime: null,
  isFastedTraining: false,
  workoutTimeDescription: '',
};

// Plan Builder default state
const defaultPlanBuilderState: PlanBuilderState = {
  isActive: false,
  meals: [],
  supplements: [],
  training: null,
  startedAt: null,
  clearExistingOnExecute: false,
};

const defaultUserProfile: UserProfile = {
  level: 'INTERMEDIATE',
  trainingFrequency: 3,
  currentTrainingDay: 0,
  preferences: {},
};

// ============================================================================
// PRESET ALIASES - Comandos predefinidos
// ============================================================================
const PRESET_ALIASES: Omit<UserAlias, 'id' | 'createdAt'>[] = [
  {
    trigger: 'Modo Bestia',
    description: 'Agrega una serie al fallo a todos los ejercicios del día',
    actions: [
      {
        tool: 'ASSET_UPDATE_FIELD',
        parameters: {
          assetType: 'gym_exercise',
          fieldPath: 'intensity_modifier',
          newValue: 1.2,
          operation: 'set',
        },
      },
    ],
  },
  {
    trigger: 'Día Ligero',
    description: 'Reduce la intensidad al 70%',
    actions: [
      {
        tool: 'ASSET_UPDATE_FIELD',
        parameters: {
          assetType: 'gym_exercise',
          fieldPath: 'intensity_modifier',
          newValue: 0.7,
          operation: 'set',
        },
      },
    ],
  },
];

// ============================================================================
// CONTEXT CREATION
// ============================================================================
const HankContext = createContext<HankContextState | undefined>(undefined);

// ============================================================================
// PROVIDER PROPS
// ============================================================================
interface HankProviderProps {
  children: ReactNode;
  userId: string | null;
}

// ============================================================================
// HANK PROVIDER
// ============================================================================

// Tipo para mensajes del historial (compatible con Gemini)
interface ChatMessage {
  role: 'user' | 'model';
  parts: Array<{ text: string }>;
}

// Tipo para mensajes de la base de datos
interface DBChatMessage {
  id: string;
  user_id: string;
  role: 'user' | 'model';
  content: string;
  created_at: string;
}

// Helper para validar UUID (evita enviar "visitor" a la DB)
const isValidUUID = (str: string | null): boolean => {
  if (!str) return false;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
};

export const HankProvider = ({ children, userId }: HankProviderProps) => {
  // Verificar si el userId es válido para operaciones de DB
  const isValidUser = isValidUUID(userId);

  // NOTA: isChatOpen se movió a lib/hankChatState.ts para evitar re-renders
  // El estado local aquí causaba re-renders de todos los componentes que usan useHank()

  // Obtener deporte activo del SportContext
  const sportContext = useSport();
  const activeSportCode = sportContext?.activeSport?.code || 'GYM';

  // -------------------------------------------------------------------------
  // STATE
  // -------------------------------------------------------------------------
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastAction, setLastAction] = useState<string | null>(null);

  // Conversation History - Para que HANK recuerde el contexto del chat (máximo 24h)
  const [conversationHistory, setConversationHistory] = useState<ChatMessage[]>([]);

  // =========================================================================
  // SISTEMA DE MEMORIA DE CORTO PLAZO v3.0
  // Almacena información contextual que Hank puede usar entre mensajes
  // =========================================================================
  const shortTermMemory = useRef<{
    // Última acción ejecutada
    lastExecutedTools: string[];
    lastExecutionTime: Date | null;
    // Datos acordados en la conversación (para no preguntar de nuevo)
    agreedData: {
      meals?: { count?: number; times?: string[]; ingredients?: string[] };
      supplements?: { names?: string[]; doses?: string[] };
      training?: { goal?: string; frequency?: number };
      profile?: { weight?: number; height?: number; goal?: string };
    };
    // Intención del usuario detectada
    currentIntent: 'query' | 'modify' | 'create' | 'analyze' | 'chat' | null;
    // Pendientes por ejecutar
    pendingActions: Array<{ tool: string; params: Record<string, unknown> }>;
  }>({
    lastExecutedTools: [],
    lastExecutionTime: null,
    agreedData: {},
    currentIntent: null,
    pendingActions: [],
  });

  // Función para actualizar memoria de corto plazo
  const updateShortTermMemory = useCallback((update: Partial<typeof shortTermMemory.current>) => {
    shortTermMemory.current = { ...shortTermMemory.current, ...update };
    hankLogger.debug('🧠 Memoria actualizada:', shortTermMemory.current);
  }, []);

  // Función para extraer datos acordados del historial de conversación
  const extractAgreedDataFromHistory = useCallback(
    (history: ChatMessage[]) => {
      const agreedData: typeof shortTermMemory.current.agreedData = {};

      // Analizar últimos 10 mensajes
      const recentHistory = history.slice(-10);
      for (const msg of recentHistory) {
        const text = msg.parts.find((p): p is { text: string } => 'text' in p)?.text || '';
        const lower = text.toLowerCase();

        // Detectar número de comidas mencionadas
        const mealsMatch = lower.match(/(\d+)\s*comidas?/);
        if (mealsMatch) {
          agreedData.meals = agreedData.meals || {};
          agreedData.meals.count = parseInt(mealsMatch[1], 10);
        }

        // Detectar horarios mencionados
        const timeMatches = lower.match(/(\d{1,2})[:\s]?(\d{2})?\s*(am|pm|hrs?)?/gi);
        if (timeMatches && timeMatches.length > 0) {
          agreedData.meals = agreedData.meals || {};
          agreedData.meals.times = agreedData.meals.times || [];
          agreedData.meals.times.push(...timeMatches);
        }

        // Detectar suplementos mencionados
        const supplements = [
          'creatina',
          'proteína',
          'whey',
          'omega',
          'pre-entreno',
          'multivitamínico',
          'cafeína',
        ];
        const foundSupplements = supplements.filter((s) => lower.includes(s));
        if (foundSupplements.length > 0) {
          agreedData.supplements = agreedData.supplements || {};
          agreedData.supplements.names = [
            ...(agreedData.supplements.names || []),
            ...foundSupplements,
          ];
        }

        // Detectar objetivo
        const goals = [
          'ganar masa',
          'perder grasa',
          'definir',
          'volumen',
          'cutting',
          'bulking',
          'recomposición',
        ];
        const foundGoal = goals.find((g) => lower.includes(g));
        if (foundGoal) {
          agreedData.training = agreedData.training || {};
          agreedData.training.goal = foundGoal;
        }

        // Detectar frecuencia de entrenamiento
        const freqMatch = lower.match(
          /(\d)\s*(?:días?|veces?)\s*(?:a la semana|por semana|semanales?)?/
        );
        if (freqMatch) {
          agreedData.training = agreedData.training || {};
          agreedData.training.frequency = parseInt(freqMatch[1], 10);
        }
      }

      // Actualizar memoria
      if (Object.keys(agreedData).length > 0) {
        updateShortTermMemory({
          agreedData: { ...shortTermMemory.current.agreedData, ...agreedData },
        });
      }

      return agreedData;
    },
    [updateShortTermMemory]
  );

  // Flag para indicar si ya se cargó/verificó el historial
  const historyInitialized = useRef(false);

  // Refresh Trigger - Se incrementa cuando HANK modifica datos para que las pantallas recarguen
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Método para disparar refresh desde otros módulos
  const triggerRefresh = useCallback(() => {
    syncLogger.debug('triggerRefresh llamado externamente');
    setRefreshTrigger((prev) => prev + 1);
  }, []);

  // Macro Cache Invalidation - Se incrementa cuando se actualizan datos del perfil
  const [macroCacheInvalidate, setMacroCacheInvalidate] = useState(0);

  // Progress Photos - Fotos de progreso del usuario para análisis visual de Gemini
  const [progressPhotos, setProgressPhotos] = useState<
    Array<{
      id: string;
      url: string;
      date: string;
      weight?: number;
      bodyFat?: number;
      notes?: string;
    }>
  >([]);

  // User Plan Context - Nutrición y Stack actual para contexto de Gemini
  const [userPlanContext, setUserPlanContext] = useState<{
    // Datos biométricos del usuario (ADN/Trens ID) - TODOS los campos de biometría
    biometrics: {
      weight?: number; // kg
      height?: number; // cm
      age?: number;
      bodyFat?: number; // %
      muscleMass?: number; // kg
      goal?: string; // bulking, cutting, recomp, maintenance
      sex?: string;
      activityLevel?: string; // SEDENTARIO, MODERADO, ACTIVO, MUY ACTIVO
      trainingExperience?: string; // PRINCIPIANTE, INTERMEDIO, AVANZADO
      metabolicRate?: string; // LENTO, NORMAL, RAPIDO
      trainingDaysPerWeek?: number;
      injuries?: string; // Lesiones del usuario
      allergies?: string; // Alergias alimentarias
      bmr?: number; // Basal metabolic rate
      tdee?: number; // Total daily energy expenditure
    } | null;
    meals: Array<{
      name: string;
      time: string;
      ingredients: string[];
      macros?: { calories: number; protein: number; carbs: number; fat: number };
    }>;
    supplements: Array<{ name: string; dose: string; time?: string; times?: string[] }>;
    training: {
      frequency: number;
      currentDay: number;
      routineNames: Record<string, string>;
    };
  } | null>(null);

  // -------------------------------------------------------------------------
  // TARGETING SYSTEM - Para animaciones visuales de Hank
  // -------------------------------------------------------------------------
  const [currentTarget, setCurrentTarget] = useState<HankTarget | null>(null);
  const [animationPhase, setAnimationPhase] = useState<HankAnimationPhase>('idle');
  const registeredTargets = useRef<Map<string, HankTarget>>(new Map());

  // Flag que se activa cuando se detecta un write tool - HankOverlay lo escucha para cerrar el chat
  const [writeToolDetected, setWriteToolDetected] = useState(false);

  const registerTarget = useCallback((id: string, target: Omit<HankTarget, 'id'>) => {
    registeredTargets.current.set(id, { ...target, id });
  }, []);

  const unregisterTarget = useCallback((id: string) => {
    registeredTargets.current.delete(id);
  }, []);

  const startTargetAnimation = useCallback((target: HankTarget) => {
    console.warn('🎯 HANK: Iniciando animación hacia', target.label);
    setCurrentTarget(target);
    setAnimationPhase('flying');
    // Notificar que se detectó un write tool (para que HankOverlay cierre el chat)
    setWriteToolDetected(true);

    // Después de volar (800ms), cambiar a working
    setTimeout(() => {
      setAnimationPhase('working');
    }, 800);
  }, []);

  // Callback para notificar cuando la ejecución exitosa termina completamente
  const onExecutionSuccessRef = useRef<(() => void) | null>(null);
  const setOnExecutionSuccess = useCallback((callback: (() => void) | null) => {
    onExecutionSuccessRef.current = callback;
  }, []);

  const completeTargetAnimation = useCallback((success: boolean) => {
    console.warn('✨ HANK: Completando animación', success ? 'con éxito' : 'con error');
    setAnimationPhase(success ? 'success' : 'idle');

    // Flash de éxito y luego regresar
    setTimeout(() => {
      setAnimationPhase('returning');
      setTimeout(() => {
        setAnimationPhase('idle');
        setCurrentTarget(null);
        // Reset del flag de write tool detectado
        setWriteToolDetected(false);
        // 🎯 Notificar al overlay que abra el chat con el resultado
        if (success && onExecutionSuccessRef.current) {
          console.warn('🎯 HANK: Notificando éxito para abrir chat');
          onExecutionSuccessRef.current();
        }
      }, 600);
    }, 400);
  }, []);

  // Dynamic Context
  const [screenContext, setScreenContext] = useState<ScreenContext>(defaultScreenContext);
  const [activeAsset, setActiveAssetState] = useState<ActiveAsset | null>(null);
  const [sportMode, setSportMode] = useState<SportMode>(activeSportCode as SportMode);
  const [userProfile] = useState<UserProfile>(defaultUserProfile);

  // Plan Builder State - Para construcción conversacional de planes
  const [planBuilderState, setPlanBuilderState] =
    useState<PlanBuilderState>(defaultPlanBuilderState);

  // 🔧 REF para acceso sincrónico al estado más reciente del Plan Builder
  // Esto es necesario porque Gemini puede llamar múltiples herramientas secuencialmente
  // y el estado de React no se actualiza entre llamadas
  const planBuilderStateRef = useRef<PlanBuilderState>(defaultPlanBuilderState);
  useEffect(() => {
    planBuilderStateRef.current = planBuilderState;
  }, [planBuilderState]);

  // Sincronizar sportMode con el deporte activo del SportContext
  useEffect(() => {
    if (activeSportCode) {
      setSportMode(activeSportCode as SportMode);
    }
  }, [activeSportCode]);

  // Aliases
  const [aliases, setAliases] = useState<UserAlias[]>(
    PRESET_ALIASES.map((a, i) => ({
      ...a,
      id: `preset-${i}`,
      createdAt: new Date(),
    }))
  );

  // Executor Hook
  const {
    executeTool: executeToolRaw,
    executeToolChain: executeToolChainRaw,
    getToolDefinitions,
    isExecuting,
  } = useHankExecutor({
    userId,
    currentTrainingDay: screenContext.currentTrainingDay ?? 0, // Pasar día actual de la pantalla
  });

  // Wrapper para executeTool que incrementa refreshTrigger si exitoso
  // También dispara animación visual si hay target registrado
  const executeTool = useCallback(
    async (toolCall: HankToolCall): Promise<HankToolResult> => {
      console.warn('🚀🚀🚀 HANK WRAPPER executeTool LLAMADO! Tool:', toolCall.tool);

      // Solo disparar animación para herramientas de ESCRITURA
      const shouldAnimate = isWriteTool(toolCall.tool);
      console.warn('🎬 HANK: shouldAnimate:', shouldAnimate, 'tool:', toolCall.tool);

      if (shouldAnimate) {
        // Buscar target registrado que coincida con el contexto
        const allTargets = Array.from(registeredTargets.current.entries());
        console.warn(
          '🎯 HANK executeTool: Targets registrados:',
          allTargets.length,
          allTargets.map(([id]) => id)
        );

        let registeredTarget = registeredTargets.current.values().next().value;

        // Si NO hay target registrado, crear uno por defecto en el centro de la pantalla
        if (!registeredTarget) {
          console.warn('⚠️ HANK: NO hay targets registrados, usando posición central');
          const { Dimensions } = require('react-native');
          const { width, height } = Dimensions.get('window');
          registeredTarget = {
            id: 'default-center',
            type: 'custom',
            label: toolCall.tool,
            position: {
              x: width / 2 - 100,
              y: height / 2 - 50,
              width: 200,
              height: 100,
            },
          };
        } else {
          console.warn(
            '🎯 HANK: Target encontrado, iniciando animación hacia:',
            registeredTarget.label
          );
        }

        // Iniciar animación
        startTargetAnimation(registeredTarget);

        // Registrar tiempo de inicio de la fase working (después de 800ms de vuelo)
        const workingStartTime = Date.now() + 800;

        const result = await executeToolRaw(toolCall);

        // IMPORTANTE: Disparar refresh INMEDIATAMENTE después de ejecutar
        if (result.success) {
          console.warn('🔄 executeTool exitoso, disparando refresh AHORA (mientras Hank trabaja)');
          setRefreshTrigger((prev) => prev + 1);
        }

        // Asegurar mínimo 5 segundos en fase working (los datos se cargan en paralelo)
        const elapsedInWorking = Date.now() - workingStartTime;
        const remainingWorkingTime = Math.max(0, 5000 - elapsedInWorking);
        if (remainingWorkingTime > 0) {
          await new Promise((resolve) => setTimeout(resolve, remainingWorkingTime));
        }

        // Completar animación según resultado
        completeTargetAnimation(result.success);

        // Esperar solo el tiempo mínimo para que la animación de éxito sea visible
        await new Promise((resolve) => setTimeout(resolve, 900));

        return result;
      } else {
        // Herramienta de LECTURA - ejecutar sin animación
        console.warn('📖 HANK: Ejecutando herramienta de LECTURA sin animación');
        const result = await executeToolRaw(toolCall);
        return result;
      }
    },
    [executeToolRaw, startTargetAnimation, completeTargetAnimation]
  );

  // Wrapper para executeToolChain que incrementa refreshTrigger si alguno exitoso
  // También dispara animación visual si hay target registrado Y hay herramientas de escritura
  const executeToolChain = useCallback(
    async (toolCalls: HankToolCall[]): Promise<HankToolResult[]> => {
      // Solo disparar animación si hay herramientas de ESCRITURA
      const hasWriteTools = toolCalls.some((tc) => isWriteTool(tc.tool));
      console.warn('🎬 HANK executeToolChain: hasWriteTools:', hasWriteTools);

      if (hasWriteTools) {
        // Buscar target registrado que coincida con el contexto
        const allTargets = Array.from(registeredTargets.current.entries());
        console.warn('🎯 HANK executeToolChain: Targets registrados:', allTargets.length);

        let registeredTarget = registeredTargets.current.values().next().value;

        // Si NO hay target registrado, crear uno por defecto en el centro de la pantalla
        if (!registeredTarget) {
          console.warn('⚠️ HANK: NO hay targets, usando posición central');
          const { Dimensions } = require('react-native');
          const { width, height } = Dimensions.get('window');
          registeredTarget = {
            id: 'default-center',
            type: 'custom',
            label: toolCalls[0]?.tool || 'Action',
            position: {
              x: width / 2 - 100,
              y: height / 2 - 50,
              width: 200,
              height: 100,
            },
          };
        } else {
          console.warn('🎯 HANK: Target encontrado:', registeredTarget.label);
        }

        // Iniciar animación
        startTargetAnimation(registeredTarget);

        // Registrar tiempo de inicio de la fase working (después de 800ms de vuelo)
        const workingStartTime = Date.now() + 800;

        const results = await executeToolChainRaw(toolCalls);
        const hasSuccess = results.some((r) => r.success);

        // IMPORTANTE: Disparar refresh INMEDIATAMENTE después de ejecutar
        if (hasSuccess) {
          console.warn(
            '🔄 executeToolChain exitoso, disparando refresh AHORA (mientras Hank trabaja)'
          );
          setRefreshTrigger((prev) => prev + 1);
        }

        // Asegurar mínimo 5 segundos en fase working (los datos se cargan en paralelo)
        const elapsedInWorking = Date.now() - workingStartTime;
        const remainingWorkingTime = Math.max(0, 5000 - elapsedInWorking);
        if (remainingWorkingTime > 0) {
          await new Promise((resolve) => setTimeout(resolve, remainingWorkingTime));
        }

        // Completar animación según resultado
        completeTargetAnimation(hasSuccess);

        // Esperar solo el tiempo mínimo para que la animación de éxito sea visible
        await new Promise((resolve) => setTimeout(resolve, 900));

        return results;
      } else {
        // Solo herramientas de LECTURA - ejecutar sin animación
        console.warn('📖 HANK executeToolChain: Solo herramientas de LECTURA, sin animación');
        const results = await executeToolChainRaw(toolCalls);
        return results;
      }
    },
    [executeToolChainRaw, startTargetAnimation, completeTargetAnimation]
  );

  // -------------------------------------------------------------------------
  // CHAT MEMORY MANAGEMENT - Sistema de 24 horas con Supabase
  // -------------------------------------------------------------------------

  /**
   * Cargar historial desde Supabase y limpiar mensajes antiguos (medianoche)
   * Solo para usuarios autenticados con UUID válido
   */
  useEffect(() => {
    const initializeChatHistory = async () => {
      // Solo cargar historial para usuarios con UUID válido (no "visitor")
      if (historyInitialized.current || !isValidUser) return;
      historyInitialized.current = true;

      try {
        // Primero, limpiar mensajes anteriores a medianoche usando la función de DB
        const { data: cleanedCount, error: cleanError } = await supabase.rpc(
          'clean_old_hank_messages',
          { p_user_id: userId }
        );

        if (cleanError) {
          console.warn('⚠️ HANK: Error limpiando mensajes antiguos:', cleanError.message);
        } else if (cleanedCount && cleanedCount > 0) {
          console.warn(`🧹 HANK: Limpiados ${cleanedCount} mensajes de días anteriores`);
        }

        // Cargar mensajes del día de hoy
        const { data: messages, error } = await supabase
          .from('hank_chat_messages')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: true });

        if (error) {
          console.warn('⚠️ HANK: Error cargando historial:', error.message);
          return;
        }

        if (messages && messages.length > 0) {
          // Convertir de DB format a Gemini format
          const history: ChatMessage[] = messages.map((msg: DBChatMessage) => ({
            role: msg.role,
            parts: [{ text: msg.content }],
          }));
          console.warn(`🧠 HANK: Cargando ${history.length} mensajes del historial`);
          setConversationHistory(history);
        }
      } catch (error) {
        console.warn('⚠️ HANK: Error inicializando historial:', error);
      }
    };

    initializeChatHistory();
  }, [userId, isValidUser]);

  /**
   * Guardar un mensaje en Supabase
   * Solo para usuarios autenticados con UUID válido
   */
  const saveMessageToSupabase = useCallback(
    async (role: 'user' | 'model', content: string) => {
      // No guardar para visitantes
      if (!isValidUser) {
        return;
      }

      console.warn('💾 HANK: Intentando guardar mensaje:', {
        role,
        userId,
        contentLength: content.length,
      });

      try {
        const { data, error } = await supabase
          .from('hank_chat_messages')
          .insert({
            user_id: userId,
            role,
            content,
          })
          .select();

        if (error) {
          console.warn(
            '⚠️ HANK: Error guardando mensaje:',
            error.message,
            error.details,
            error.hint
          );
        } else {
          console.warn('✅ HANK: Mensaje guardado exitosamente:', data);
        }
      } catch (error) {
        console.warn('⚠️ HANK: Error guardando mensaje:', error);
      }
    },
    [userId, isValidUser]
  );

  /**
   * Verificar medianoche periódicamente (cada minuto)
   * Esto asegura que si el usuario tiene la app abierta a medianoche, se limpie
   * Solo para usuarios autenticados
   */
  useEffect(() => {
    if (!isValidUser) return;

    const checkMidnight = async () => {
      // Llamar a la función de limpieza de DB
      const { data: cleanedCount, error } = await supabase.rpc('clean_old_hank_messages', {
        p_user_id: userId,
      });

      if (!error && cleanedCount && cleanedCount > 0) {
        console.warn(`🧹 HANK: ¡Medianoche! Limpiados ${cleanedCount} mensajes automáticamente`);
        setConversationHistory([]);
      }
    };

    // Verificar cada minuto (60000 ms)
    const interval = setInterval(checkMidnight, 60000);

    return () => clearInterval(interval);
  }, [userId, isValidUser]);

  // -------------------------------------------------------------------------
  // PROGRESS PHOTOS - Cargar fotos de progreso para análisis visual
  // -------------------------------------------------------------------------
  useEffect(() => {
    const loadProgressPhotos = async () => {
      if (!isValidUser) return;

      try {
        const { data: photos, error } = await supabase
          .from('progress_photos')
          .select('id, photo_url, created_at, snapshot, notes')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(5); // Solo las 5 más recientes

        if (error) {
          console.warn('⚠️ HANK: Error cargando fotos de progreso:', error.message);
          return;
        }

        if (photos && photos.length > 0) {
          const formattedPhotos = photos.map((photo: any) => ({
            id: photo.id,
            url: photo.photo_url,
            date: new Date(photo.created_at).toLocaleDateString('es-ES', {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
            }),
            weight: photo.snapshot?.weight,
            bodyFat: photo.snapshot?.body_fat_percentage,
            notes: photo.notes,
          }));
          console.warn(
            `📸 HANK: Cargadas ${formattedPhotos.length} fotos de progreso para análisis visual`
          );
          setProgressPhotos(formattedPhotos);
        }
      } catch (error) {
        console.warn('⚠️ HANK: Error cargando fotos de progreso:', error);
      }
    };

    loadProgressPhotos();
  }, [userId, isValidUser, refreshTrigger]); // Recargar cuando refreshTrigger cambie

  // -------------------------------------------------------------------------
  // USER PLAN CONTEXT - Cargar nutrición, stack y entrenamiento
  // -------------------------------------------------------------------------
  useEffect(() => {
    const loadUserPlanContext = async () => {
      if (!isValidUser) return;

      try {
        // 1. Cargar comidas
        const { data: meals } = await supabase
          .from('meals')
          .select('name, scheduled_time, ingredients, calories, protein_g, carbs_g, fat_g')
          .eq('user_id', userId)
          .order('scheduled_time', { ascending: true });

        // 2. Cargar stack de suplementos
        const { data: stack, error: stackError } = await supabase
          .from('supplement_stack')
          .select('name, dose, time, times')
          .eq('user_id', userId)
          .eq('is_active', true);

        if (stackError) {
          console.warn('⚠️ Error cargando suplementos:', stackError);
        }

        // 3. Cargar datos de entrenamiento desde profiles
        const { data: trainingProfile, error: trainingProfileError } = await supabase
          .from('profiles')
          .select('training_frequency, training_current_day, training_routine_names')
          .eq('id', userId)
          .single();

        if (trainingProfileError) {
          console.warn('⚠️ Error cargando training profile:', trainingProfileError);
        }

        // 4. Cargar datos biométricos desde user_profiles (donde ADN los guarda) - TODOS los campos
        const { data: userProfile, error: userProfileError } = await supabase
          .from('user_profiles')
          .select(
            'weight, height, goal, age, sex, body_fat_percentage, muscle_mass, activity_level, training_experience, metabolic_rate, training_days_per_week'
          )
          .eq('user_id', userId)
          .single();

        if (userProfileError && userProfileError.code !== 'PGRST116') {
          console.warn('⚠️ Error cargando user_profiles:', userProfileError);
        }

        // DEBUG: Log de datos cargados
        console.warn(
          `🔍 HANK: user_profiles loaded - weight: ${userProfile?.weight}, goal: ${userProfile?.goal}, height: ${userProfile?.height}`
        );

        // Casting seguro de los perfiles
        const trainingData = trainingProfile as {
          training_frequency?: number;
          training_current_day?: number;
          training_routine_names?: Record<string, string>;
        } | null;

        const biometricsData = userProfile as {
          weight?: string;
          height?: string;
          goal?: string;
          age?: number;
          sex?: string;
          body_fat_percentage?: number;
          muscle_mass?: number;
          activity_level?: string;
          training_experience?: string;
          metabolic_rate?: string;
          training_days_per_week?: number;
        } | null;

        // Formatear comidas
        const formattedMeals = (meals || []).map((meal: any) => ({
          name: meal.name || 'Comida',
          time: meal.scheduled_time || '',
          ingredients: (meal.ingredients || []).map(
            (i: any) => `${i.name}${i.quantity ? ` (${i.quantity})` : ''}`
          ),
          macros: meal.calories
            ? {
                calories: meal.calories,
                protein: meal.protein_g,
                carbs: meal.carbs_g,
                fat: meal.fat_g,
              }
            : undefined,
        }));

        // Formatear stack - soportar múltiples horarios
        const formattedStack = (stack || []).map((s: any) => {
          // Si tiene times (array), usarlo; si no, usar time
          const allTimes: string[] = [];
          if (s.times && Array.isArray(s.times) && s.times.length > 0) {
            allTimes.push(...s.times);
          } else if (s.time) {
            allTimes.push(s.time);
          }
          return {
            name: s.name,
            dose: s.dose,
            time: allTimes.length === 1 ? allTimes[0] : undefined,
            times: allTimes.length > 1 ? allTimes : undefined,
          };
        });

        // Formatear entrenamiento (sistema weekday: 0=Dom..6=Sáb)
        // currentDay AHORA es el weekday real (new Date().getDay()), no un
        // contador rotativo. La frecuencia se deriva de routineNames con valor.
        const _routineNames = trainingData?.training_routine_names || {};
        const _activeWeekdays = Object.entries(_routineNames).filter(
          ([k, v]) => /^[0-6]$/.test(k) && typeof v === 'string' && (v as string).trim()
        );
        const training = {
          frequency: _activeWeekdays.length || trainingData?.training_frequency || 0,
          currentDay: new Date().getDay(),
          routineNames: _routineNames,
        };

        // Formatear biométricos (desde user_profiles) - TODOS los campos de ADN
        // Nota: weight y height vienen como strings, convertir a números
        const biometrics = biometricsData
          ? {
              weight: biometricsData.weight ? parseFloat(biometricsData.weight) : undefined,
              height: biometricsData.height ? parseFloat(biometricsData.height) : undefined,
              age: biometricsData.age || undefined,
              bodyFat: biometricsData.body_fat_percentage || undefined,
              muscleMass: biometricsData.muscle_mass || undefined,
              goal: biometricsData.goal || undefined,
              sex: biometricsData.sex || undefined,
              activityLevel: biometricsData.activity_level || undefined,
              trainingExperience: biometricsData.training_experience || undefined,
              metabolicRate: biometricsData.metabolic_rate || undefined,
              trainingDaysPerWeek: biometricsData.training_days_per_week || undefined,
              bmr: undefined, // Calcular si es necesario
              tdee: undefined, // Calcular si es necesario
            }
          : null;

        setUserPlanContext({
          biometrics,
          meals: formattedMeals,
          supplements: formattedStack,
          training,
        });

        console.warn(
          `📋 HANK: Plan cargado - ${formattedMeals.length} comidas, ${formattedStack.length} suplementos, ${training.frequency} días/semana, bio: ${biometrics?.weight}kg`
        );
      } catch (error) {
        console.warn('⚠️ HANK: Error cargando plan del usuario:', error);
      }
    };

    loadUserPlanContext();
  }, [userId, isValidUser, refreshTrigger]);

  // -------------------------------------------------------------------------
  // CONTEXT UPDATES
  // -------------------------------------------------------------------------

  /**
   * Carga un asset activo desde Supabase
   * @param assetId - ID del asset (user_exercise_config.id)
   * @param alternativeInfo - Info si es una alternativa
   */
  const setActiveAsset = useCallback(
    async (
      assetId: string | null,
      alternativeInfo?: {
        isAlternative: boolean;
        parentExerciseName: string;
        parentConfigId?: string;
      }
    ) => {
      // Visitantes no tienen assets en DB
      if (!assetId || !isValidUser) {
        setActiveAssetState(null);
        return;
      }

      try {
        // Helper para cargar notas e historial de videos
        const loadNotesAndHistory = async (exerciseId: string, exerciseName: string) => {
          console.warn(
            `🔍 loadNotesAndHistory: ejercicio="${exerciseName}", exercise_id="${exerciseId}"`
          );

          // Fecha de hoy
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const todayStr = today.toISOString().split('T')[0];

          // 1. Cargar notas de user_exercise_config
          const { data: configData, error: configError } = await supabase
            .from('user_exercise_config')
            .select('metadata')
            .eq('user_id', userId)
            .eq('exercise_id', exerciseId)
            .maybeSingle();

          if (configData) {
            console.warn(`🔍 user_exercise_config: ENCONTRADO`);
          }

          let currentNotes = configData?.metadata?.notes || '';
          let currentTags = configData?.metadata?.tags || [];

          // 2. Cargar historial de videos/notas - primero por exercise_id, luego fallback por nombre
          let { data: videoHistory, error: videoError } = await supabase
            .from('pro_videos')
            .select(
              'id, weight_kg, reps, notes, exercise_notes, tags, created_at, exercise_id, exercise_name'
            )
            .eq('user_id', userId)
            .eq('exercise_id', exerciseId)
            .order('created_at', { ascending: false })
            .limit(10);

          // Fallback: si no hay videos por ID, buscar por nombre (case-insensitive)
          if ((!videoHistory || videoHistory.length === 0) && exerciseName) {
            const { data: videosByName } = await supabase
              .from('pro_videos')
              .select(
                'id, weight_kg, reps, notes, exercise_notes, tags, created_at, exercise_id, exercise_name'
              )
              .eq('user_id', userId)
              .ilike('exercise_name', exerciseName)
              .order('created_at', { ascending: false })
              .limit(10);

            if (videosByName && videosByName.length > 0) {
              videoHistory = videosByName;
              console.warn(
                `🔍 pro_videos: fallback por nombre encontró ${videosByName.length} registros`
              );
            } else {
              // Debug: ver qué hay en pro_videos para este usuario
              const { data: allVideos } = await supabase
                .from('pro_videos')
                .select('exercise_name, notes, exercise_notes')
                .eq('user_id', userId)
                .not('notes', 'is', null)
                .limit(5);
              console.warn(
                `🔍 DEBUG: Videos con notas del usuario:`,
                allVideos?.map((v) => ({
                  name: v.exercise_name,
                  notes: v.notes?.substring(0, 30),
                })) || 'NINGUNO'
              );
            }
          }

          console.warn(
            `🔍 pro_videos: ${videoHistory?.length || 0} videos, error: ${videoError?.message || 'ninguno'}`
          );

          const history: Array<{
            date: string;
            isToday: boolean;
            weightKg: number | null;
            reps: number | null;
            notes: string | null;
            tags: string[] | null;
          }> = [];

          let todayNotes: string | null = null;
          let todayTags: string[] | null = null;

          videoHistory?.forEach((v: any) => {
            const date = new Date(v.created_at);
            const dateStr = date.toISOString().split('T')[0];
            const isToday = dateStr === todayStr;
            const noteContent = v.notes || v.exercise_notes;

            if (isToday && noteContent && !todayNotes) {
              todayNotes = noteContent;
              todayTags = v.tags;
            }

            history.push({
              date: date.toLocaleDateString('es-ES', {
                day: 'numeric',
                month: 'short',
                year: date.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined,
              }),
              isToday,
              weightKg: v.weight_kg,
              reps: v.reps,
              notes: noteContent,
              tags: v.tags,
            });
          });

          // Si no hay notas en config pero sí en videos, usar las de video
          if (!currentNotes && videoHistory && videoHistory.length > 0) {
            const mostRecentWithNotes = videoHistory.find((v: any) => v.notes || v.exercise_notes);
            if (mostRecentWithNotes) {
              currentNotes = mostRecentWithNotes.notes || mostRecentWithNotes.exercise_notes;
              currentTags = mostRecentWithNotes.tags || [];
            }
          }

          return {
            currentNotes,
            currentTags,
            todayNotes,
            todayTags,
            videoHistory: history,
          };
        };

        // 🔧 FIX: Si es alternativa, cargar desde la tabla exercises directamente
        // PERO también necesitamos el configId del ejercicio principal
        if (alternativeInfo?.isAlternative) {
          console.log('🔄 setActiveAsset: Cargando ALTERNATIVA:', assetId);

          const { data: altData, error: altError } = await supabase
            .from('exercises')
            .select('id, name, muscle_group, equipment, difficulty')
            .eq('id', assetId)
            .single();

          if (altError || !altData) {
            console.warn('⚠️ setActiveAsset: No se encontró la alternativa:', assetId);
            setActiveAssetState(null);
            return;
          }

          // Usar parentConfigId si está disponible (PREFERIDO - viene directo de GYM)
          let configId = alternativeInfo?.parentConfigId || '';
          let parentLiquidData: Record<string, unknown> = {};

          if (configId) {
            // Tenemos configId directo - cargar config del ejercicio principal
            const { data: parentConfig } = await supabase
              .from('user_exercise_config')
              .select('id, config')
              .eq('id', configId)
              .eq('user_id', userId)
              .single();

            if (parentConfig) {
              parentLiquidData = (parentConfig.config as Record<string, unknown>) || {};
              console.log(
                '✅ setActiveAsset: Config principal cargada por parentConfigId:',
                configId
              );
            }
          } else {
            // Fallback: buscar por contains (menos confiable)
            const { data: parentExercise } = await supabase
              .from('exercises')
              .select('id')
              .contains('alternative_exercises', [assetId])
              .limit(1)
              .maybeSingle();

            if (parentExercise) {
              const { data: parentConfig } = await supabase
                .from('user_exercise_config')
                .select('id, config')
                .eq('user_id', userId)
                .eq('exercise_id', parentExercise.id)
                .limit(1)
                .maybeSingle();

              configId = parentConfig?.id || '';
              parentLiquidData = (parentConfig?.config as Record<string, unknown>) || {};
            }
          }

          console.log(
            '✅ setActiveAsset: Alternativa cargada:',
            altData.name,
            '(de',
            alternativeInfo.parentExerciseName,
            ') configId:',
            configId
          );

          // Cargar notas e historial para la alternativa
          const notesData = await loadNotesAndHistory(altData.id, altData.name);

          setActiveAssetState({
            id: altData.id,
            configId: configId, // ID del user_exercise_config del ejercicio principal
            type: 'exercise',
            name: altData.name,
            liquidData: {
              ...parentLiquidData, // Las series vienen del ejercicio principal
              notes: notesData.currentNotes,
              tags: notesData.currentTags,
              todayNotes: notesData.todayNotes,
              todayTags: notesData.todayTags,
              videoHistory: notesData.videoHistory,
            },
            trainingDays: [],
            isAlternative: true,
            parentExerciseName: alternativeInfo.parentExerciseName,
          });
          return;
        }

        // Cargar desde user_exercise_config (nueva arquitectura) - EJERCICIO PRINCIPAL
        // assetId puede ser exercise_id (de tabla exercises) o user_exercise_config.id
        // Intentar primero por exercise_id, luego por id
        let data: any = null;
        let error: any = null;

        // Primero intentar buscar por exercise_id
        const { data: dataByExerciseId, error: errorByExerciseId } = await supabase
          .from('user_exercise_config')
          .select(
            `
            id,
            exercise_id,
            training_days,
            display_order,
            config,
            metadata,
            exercises (
              name,
              muscle_group,
              equipment,
              difficulty
            )
          `
          )
          .eq('exercise_id', assetId)
          .eq('user_id', userId)
          .limit(1)
          .single();

        if (dataByExerciseId) {
          data = dataByExerciseId;
          error = null;
        } else {
          // Fallback: buscar por id (user_exercise_config.id)
          const { data: dataById, error: errorById } = await supabase
            .from('user_exercise_config')
            .select(
              `
            id,
            exercise_id,
            training_days,
            display_order,
            config,
            metadata,
            exercises (
              name,
              muscle_group,
              equipment,
              difficulty
            )
          `
            )
            .eq('id', assetId)
            .eq('user_id', userId)
            .single();

          data = dataById;
          error = errorById;
        }

        if (error || !data) {
          console.warn('⚠️ setActiveAsset: No se encontró el ejercicio:', assetId, error?.message);
          setActiveAssetState(null);
          return;
        }

        const exerciseData = data as unknown as {
          id: string;
          exercise_id: string;
          training_days: number[];
          display_order: number;
          config: Record<string, unknown>;
          metadata: { notes?: string; tags?: string[] } | null;
          exercises: {
            name: string;
            muscle_group: string;
            equipment: string[];
            difficulty: string;
          } | null;
        };

        console.log('✅ setActiveAsset: Ejercicio cargado:', exerciseData.exercises?.name);

        // Cargar notas e historial para el ejercicio principal
        const notesData = await loadNotesAndHistory(
          exerciseData.exercise_id,
          exerciseData.exercises?.name || ''
        );

        setActiveAssetState({
          id: exerciseData.exercise_id, // exercise_id de tabla exercises
          configId: exerciseData.id, // user_exercise_config.id - ESTABLE para modificar series
          type: 'exercise',
          name: exerciseData.exercises?.name || 'Sin nombre',
          liquidData: {
            ...exerciseData.config,
            notes: notesData.currentNotes,
            tags: notesData.currentTags,
            todayNotes: notesData.todayNotes,
            todayTags: notesData.todayTags,
            videoHistory: notesData.videoHistory,
          },
          trainingDays: exerciseData.training_days,
          isAlternative: false,
          parentExerciseName: undefined,
        });
      } catch (e) {
        console.error('Error loading active asset:', e);
        setActiveAssetState(null);
      }
    },
    [userId, isValidUser]
  );

  // -------------------------------------------------------------------------
  // ALIAS MANAGEMENT
  // -------------------------------------------------------------------------

  const addAlias = useCallback((alias: Omit<UserAlias, 'id' | 'createdAt'>) => {
    const newAlias: UserAlias = {
      ...alias,
      id: `custom-${Date.now()}`,
      createdAt: new Date(),
    };
    setAliases((prev) => [...prev, newAlias]);
  }, []);

  const removeAlias = useCallback((triggerId: string) => {
    setAliases((prev) => prev.filter((a) => a.id !== triggerId));
  }, []);

  /**
   * Ejecuta un alias si el trigger coincide
   */
  const executeAlias = useCallback(
    async (trigger: string): Promise<HankToolResult[] | null> => {
      const alias = aliases.find((a) => a.trigger.toLowerCase() === trigger.toLowerCase());

      if (!alias) return null;

      console.warn(`🤖 HANK: Ejecutando alias "${alias.trigger}"`);
      const results = await executeToolChain(alias.actions);
      return results;
    },
    [aliases, executeToolChain]
  );

  // -------------------------------------------------------------------------
  // PLAN BUILDER MANAGEMENT - Construcción conversacional de planes
  // -------------------------------------------------------------------------

  // Importar funciones de Plan Builder
  const {
    planBuilderStart,
    planBuilderAddMeal,
    planBuilderEditMeal,
    planBuilderRemoveMeal,
    planBuilderAddSupplement,
    planBuilderRemoveSupplement,
    planBuilderShow,
    planBuilderClear,
    planBuilderExecute,
  } = require('../services/hank/tools');

  const planBuilderActionsStart = useCallback((clearExisting: boolean = false) => {
    console.warn('🚀 Plan Builder: Iniciando...');
    const result = planBuilderStart(clearExisting);
    const newState: PlanBuilderState = {
      isActive: true,
      meals: [],
      supplements: [],
      training: null,
      startedAt: new Date(),
      clearExistingOnExecute: clearExisting,
    };
    setPlanBuilderState(newState);
    // 🔧 Actualizar ref inmediatamente para llamadas secuenciales
    planBuilderStateRef.current = newState;
    return result;
  }, []);

  const planBuilderActionsAddMeal = useCallback(
    (time: string, ingredients: PlanBuilderIngredient[], name?: string): HankToolResult => {
      // 🔧 Usar ref para estado sincrónico (importante para llamadas secuenciales de Gemini)
      const currentState = planBuilderStateRef.current;
      const { newState, result } = planBuilderAddMeal(currentState, time, ingredients, name);
      setPlanBuilderState(newState);
      planBuilderStateRef.current = newState; // Actualizar ref inmediatamente
      return result;
    },
    [] // Sin dependencias - usa ref
  );

  const planBuilderActionsEditMeal = useCallback(
    (
      identifier: string | number,
      updates: { time?: string; ingredients?: PlanBuilderIngredient[]; name?: string }
    ): HankToolResult => {
      const currentState = planBuilderStateRef.current;
      const { newState, result } = planBuilderEditMeal(currentState, identifier, updates);
      setPlanBuilderState(newState);
      planBuilderStateRef.current = newState;
      return result;
    },
    []
  );

  const planBuilderActionsRemoveMeal = useCallback(
    (identifier: string | number): HankToolResult => {
      const currentState = planBuilderStateRef.current;
      const { newState, result } = planBuilderRemoveMeal(currentState, identifier);
      setPlanBuilderState(newState);
      planBuilderStateRef.current = newState;
      return result;
    },
    []
  );

  const planBuilderActionsAddSupplement = useCallback(
    (
      name: string,
      dose: string,
      options?: {
        type?: 'pill' | 'powder' | 'liquid' | 'syringe';
        time?: string;
        isPreWorkout?: boolean;
        isPostWorkout?: boolean;
      }
    ): HankToolResult => {
      const currentState = planBuilderStateRef.current;
      const { newState, result } = planBuilderAddSupplement(currentState, name, dose, options);
      setPlanBuilderState(newState);
      planBuilderStateRef.current = newState;
      return result;
    },
    []
  );

  const planBuilderActionsRemoveSupplement = useCallback(
    (nameOrIndex: string | number): HankToolResult => {
      const currentState = planBuilderStateRef.current;
      const { newState, result } = planBuilderRemoveSupplement(currentState, nameOrIndex);
      setPlanBuilderState(newState);
      planBuilderStateRef.current = newState;
      return result;
    },
    []
  );

  const planBuilderActionsSetTraining = useCallback(
    (goal: string, level: string, frequency: number): HankToolResult => {
      const training = { goal, level, frequency };
      const newState = { ...planBuilderStateRef.current, training };
      setPlanBuilderState(newState);
      planBuilderStateRef.current = newState;
      console.warn(
        `🏋️ Plan Builder: Training configurado - ${goal}, ${level}, ${frequency} días/semana`
      );
      return {
        success: true,
        message: `🏋️ Entrenamiento configurado:\n• Objetivo: ${goal}\n• Nivel: ${level}\n• Frecuencia: ${frequency} días/semana\n\nSe asignará automáticamente al ejecutar el plan.`,
      };
    },
    []
  );

  const planBuilderActionsShow = useCallback((): HankToolResult => {
    return planBuilderShow(planBuilderStateRef.current);
  }, []);

  const planBuilderActionsClear = useCallback(() => {
    console.warn('🧹 Plan Builder: Limpiando...');
    setPlanBuilderState(defaultPlanBuilderState);
    planBuilderStateRef.current = defaultPlanBuilderState;
  }, []);

  const planBuilderActionsExecute = useCallback(async (): Promise<HankToolResult> => {
    if (!userId) {
      return { success: false, message: 'Usuario no autenticado.' };
    }
    console.warn('🏃 Plan Builder: Ejecutando plan...');
    const currentState = planBuilderStateRef.current;
    console.warn(
      `📋 Plan Builder Estado: ${currentState.meals.length} comidas, ${currentState.supplements.length} suplementos`
    );
    const result = await planBuilderExecute(userId, currentState);

    // Si fue exitoso, limpiar el estado y disparar refresh
    if (result.success || result.data?.mealsCreated > 0 || result.data?.supplementsCreated > 0) {
      setPlanBuilderState(defaultPlanBuilderState);
      planBuilderStateRef.current = defaultPlanBuilderState;
      setRefreshTrigger((prev) => prev + 1);
    }

    return result;
  }, [userId]); // Solo depende de userId, usa ref para estado

  // Agrupar todas las acciones del Plan Builder
  const planBuilderActions = useMemo(
    () => ({
      start: planBuilderActionsStart,
      addMeal: planBuilderActionsAddMeal,
      editMeal: planBuilderActionsEditMeal,
      removeMeal: planBuilderActionsRemoveMeal,
      addSupplement: planBuilderActionsAddSupplement,
      removeSupplement: planBuilderActionsRemoveSupplement,
      setTraining: planBuilderActionsSetTraining,
      show: planBuilderActionsShow,
      clear: planBuilderActionsClear,
      execute: planBuilderActionsExecute,
    }),
    [
      planBuilderActionsStart,
      planBuilderActionsAddMeal,
      planBuilderActionsEditMeal,
      planBuilderActionsRemoveMeal,
      planBuilderActionsAddSupplement,
      planBuilderActionsRemoveSupplement,
      planBuilderActionsSetTraining,
      planBuilderActionsShow,
      planBuilderActionsClear,
      planBuilderActionsExecute,
    ]
  );

  // -------------------------------------------------------------------------
  // LOAD AVAILABLE EXERCISES FROM CATALOG
  // -------------------------------------------------------------------------
  const [availableExercises, setAvailableExercises] = useState<string[]>([]);

  useEffect(() => {
    const loadExerciseCatalog = async () => {
      try {
        // Cargar desde tabla 'exercises' (catálogo global) - arquitectura actual
        const { data, error } = await supabase
          .from('exercises')
          .select('name')
          .eq('is_active', true)
          .order('name');

        if (!error && data) {
          const exercises = data.map((t) => t.name as string);
          setAvailableExercises(exercises);
          console.warn(`📋 CATÁLOGO DE EJERCICIOS: ${exercises.length} ejercicios cargados`);
        } else {
          // Fallback a asset_templates si la tabla exercises no existe o está vacía
          const { data: fallbackData } = await supabase
            .from('asset_templates')
            .select('name')
            .eq('asset_type', 'gym_exercise')
            .order('name');

          if (fallbackData) {
            const exercises = fallbackData.map((t) => t.name as string);
            setAvailableExercises(exercises);
            console.warn(`📋 CATÁLOGO (fallback): ${exercises.length} ejercicios`);
          }
        }
      } catch (e) {
        console.warn('Error loading exercise catalog:', e);
      }
    };
    loadExerciseCatalog();
  }, []);

  // -------------------------------------------------------------------------
  // BUILD GEMINI CONTEXT - Optimizado v3.0
  // -------------------------------------------------------------------------
  const buildGeminiContext = useCallback(() => {
    // 🐛 FIX: Usar screenContext.currentTrainingDay (real) en lugar de userProfile.currentTrainingDay (siempre 0)
    const realTrainingDay = screenContext.currentTrainingDay ?? 0;

    // Extraer datos acordados del historial para pasarlos a Gemini
    const agreedData = extractAgreedDataFromHistory(conversationHistory);

    console.warn(
      `📝 buildGeminiContext: día=${realTrainingDay}, ejercicio=${activeAsset?.name || 'NINGUNO'}, planBuilder=${planBuilderState.isActive ? 'ACTIVO' : 'INACTIVO'}`
    );
    // Log de biométricos para debug
    console.warn(
      `📝 buildGeminiContext biometrics: peso=${userPlanContext?.biometrics?.weight || 'N/A'}kg, altura=${userPlanContext?.biometrics?.height || 'N/A'}cm`
    );
    // Log de memoria de corto plazo
    if (Object.keys(agreedData).length > 0) {
      console.warn(`🧠 buildGeminiContext agreedData:`, JSON.stringify(agreedData));
    }

    return {
      screenModule: screenContext.module,
      sportMode: sportMode,
      userLevel: userProfile.level,
      currentTrainingDay: realTrainingDay,
      // Workout time estimation from PLAN
      estimatedWorkoutTime: screenContext.estimatedWorkoutTime,
      isFastedTraining: screenContext.isFastedTraining,
      workoutTimeDescription: screenContext.workoutTimeDescription,
      activeAsset: activeAsset
        ? {
            name: activeAsset.name,
            type: activeAsset.type,
            configId: activeAsset.configId, // ID estable para operaciones de series
            liquidData: activeAsset.liquidData,
            isAlternative: activeAsset.isAlternative || false,
            parentExerciseName: activeAsset.parentExerciseName,
          }
        : null,
      customAliases: aliases.map((a) => ({
        trigger: a.trigger,
        description: a.description,
      })),
      availableExercises: availableExercises,
      // Plan Builder State - Para que Gemini sepa si está activo
      planBuilderActive: planBuilderState.isActive,
      planBuilderSummary: planBuilderState.isActive
        ? {
            mealsCount: planBuilderState.meals.length,
            supplementsCount: planBuilderState.supplements.length,
            hasTraining: !!planBuilderState.training,
            meals: planBuilderState.meals.map((m) => ({
              time: m.time,
              name: m.name,
              ingredientsCount: m.ingredients.length,
            })),
            supplements: planBuilderState.supplements.map((s) => ({ name: s.name, dose: s.dose })),
            training: planBuilderState.training
              ? {
                  goal: planBuilderState.training.goal,
                  level: planBuilderState.training.level,
                  frequency: planBuilderState.training.frequency,
                }
              : null,
          }
        : null,
      // Progress Photos - Para análisis visual de Gemini
      progressPhotos: progressPhotos.length > 0 ? progressPhotos : undefined,
      // User Plan Context - Nutrición, stack y entrenamiento actual
      userPlanContext: userPlanContext,
      // =========================================================================
      // MEMORIA DE CORTO PLAZO v3.0 - Datos acordados en la conversación
      // =========================================================================
      agreedData: Object.keys(agreedData).length > 0 ? agreedData : undefined,
      // Última acción ejecutada (para continuidad)
      lastExecutedTools:
        shortTermMemory.current.lastExecutedTools.length > 0
          ? shortTermMemory.current.lastExecutedTools
          : undefined,
    };
  }, [
    screenContext,
    sportMode,
    userProfile,
    activeAsset,
    aliases,
    availableExercises,
    planBuilderState,
    progressPhotos,
    userPlanContext,
    conversationHistory,
    extractAgreedDataFromHistory,
  ]);

  // -------------------------------------------------------------------------
  // MAIN COMMAND EXECUTION
  // -------------------------------------------------------------------------

  /**
   * Limpia el historial de conversación (para nuevo chat)
   * Elimina todos los mensajes del usuario en Supabase (solo usuarios autenticados)
   */
  const clearConversation = useCallback(async () => {
    setConversationHistory([]);
    // Solo limpiar en DB para usuarios autenticados
    if (!isValidUser) return;

    try {
      const { error } = await supabase.from('hank_chat_messages').delete().eq('user_id', userId);

      if (error) {
        console.warn('⚠️ HANK: Error limpiando historial:', error.message);
      } else {
        console.warn('🧹 HANK: Historial del chat limpiado manualmente');
      }
    } catch (error) {
      console.warn('⚠️ HANK: Error limpiando historial:', error);
    }
  }, [userId, isValidUser]);

  /**
   * Procesa un comando de texto del usuario usando Gemini AI
   * @param userText - El comando a procesar
   * @param options - Opciones adicionales
   * @param options.saveToHistory - Si es false, no guarda en historial ni Supabase (default: true)
   * @param options.analyzeOnly - Si es true, retorna toolCalls sin ejecutar (para long press con confirmación)
   */
  const executeCommand = useCallback(
    async (
      userText: string,
      options?: { saveToHistory?: boolean; analyzeOnly?: boolean }
    ): Promise<HankToolResult[]> => {
      const saveToHistory = options?.saveToHistory !== false; // default true
      const analyzeOnly = options?.analyzeOnly === true; // default false
      setIsProcessing(true);
      setLastAction(userText);
      console.warn('🧠 HANK recibió comando:', userText);
      console.warn('🧠 HANK saveToHistory:', saveToHistory);
      console.warn('🎯 HANK activeAsset:', activeAsset ? activeAsset.name : 'NINGUNO');

      try {
        // 1. Verificar si es un alias
        const aliasResults = await executeAlias(userText);
        if (aliasResults) {
          // Agregar al historial y guardar en DB solo si saveToHistory es true
          if (saveToHistory) {
            const aliasMessage = aliasResults.map((r) => r.message).join(' ');
            setConversationHistory((prev) => [
              ...prev,
              { role: 'user', parts: [{ text: userText }] },
              { role: 'model', parts: [{ text: aliasMessage }] },
            ]);
            // Guardar en Supabase
            await saveMessageToSupabase('user', userText);
            await saveMessageToSupabase('model', aliasMessage);
          }
          return aliasResults;
        }

        // 2. Si no hay API key, usar parseo básico
        if (!GEMINI_API_KEY) {
          console.warn('⚠️ GEMINI_API_KEY no configurada, usando parseo básico');
          return [
            {
              success: false,
              message: '⚠️ GEMINI_API_KEY no está configurada. La IA no está disponible.',
            },
          ];
        }

        // 3. Llamar a Gemini con Function Calling (con historial de conversación)
        const geminiContext = buildGeminiContext();
        console.warn('🤖 Llamando a Gemini...');
        console.warn('📝 Contexto activeAsset:', geminiContext.activeAsset?.name || 'NINGUNO');
        console.warn('📜 Historial de conversación:', conversationHistory.length, 'mensajes');

        // 🔧 FIX: Limitar historial a últimos 10 mensajes para evitar confusión
        const recentHistory = conversationHistory.slice(-10);

        const geminiResponse = await callGemini(
          userText,
          geminiContext,
          GEMINI_API_KEY,
          recentHistory
        );

        console.warn('🤖 Gemini respondió:', geminiResponse.message?.substring(0, 100));
        console.warn('🔧 Tool calls:', geminiResponse.toolCalls.length);
        if (geminiResponse.toolCalls.length > 0) {
          console.warn(
            '🔧 Tools:',
            geminiResponse.toolCalls
              .map((tc) => `${tc.tool}(${JSON.stringify(tc.parameters)})`)
              .join(', ')
          );
        } else {
          console.warn('⚠️ GEMINI NO LLAMÓ NINGUNA HERRAMIENTA - solo texto');
        }

        // Variable para almacenar la respuesta final
        let finalResponseText = geminiResponse.message;

        // 🔧 ANALYZE ONLY: Retornar tool calls sin ejecutar (para long press con confirmación)
        if (analyzeOnly && geminiResponse.toolCalls.length > 0) {
          console.warn('🔍 ANALYZE ONLY: Retornando tool calls sin ejecutar');
          setIsProcessing(false);
          // Retornar un resultado especial con los tool calls pendientes
          return [
            {
              success: true,
              message: geminiResponse.message || '🔧 Comando analizado',
              data: {
                analyzeOnly: true,
                toolCalls: geminiResponse.toolCalls,
                geminiMessage: geminiResponse.message,
              },
            },
          ];
        }

        // 4. Si Gemini devuelve tool calls, ejecutarlas
        if (geminiResponse.toolCalls.length > 0) {
          const results: HankToolResult[] = [];
          const toolResults: Array<{ toolName: string; result: Record<string, unknown> }> = [];

          for (const toolCall of geminiResponse.toolCalls) {
            console.warn(`🔧 Ejecutando herramienta: ${toolCall.tool}`);

            let result: HankToolResult;

            // INTERCEPTAR HERRAMIENTAS DE PLAN BUILDER - se manejan localmente
            if (toolCall.tool.startsWith('PLAN_BUILDER_')) {
              const p = toolCall.parameters;

              switch (toolCall.tool) {
                case 'PLAN_BUILDER_START':
                  result = planBuilderActionsStart((p.clearExisting as boolean) || false);
                  break;

                case 'PLAN_BUILDER_ADD_MEAL': {
                  // Parsear ingredientes de JSON string
                  let ingredients: PlanBuilderIngredient[] = [];
                  try {
                    if (typeof p.ingredients === 'string') {
                      ingredients = JSON.parse(p.ingredients);
                    } else if (Array.isArray(p.ingredients)) {
                      ingredients = p.ingredients as PlanBuilderIngredient[];
                    }
                  } catch (e) {
                    console.warn('Error parseando ingredientes:', e);
                    ingredients = [];
                  }
                  result = planBuilderActionsAddMeal(
                    p.time as string,
                    ingredients,
                    p.name as string | undefined
                  );
                  break;
                }

                case 'PLAN_BUILDER_EDIT_MEAL': {
                  let ingredients: PlanBuilderIngredient[] | undefined;
                  if (p.ingredients) {
                    try {
                      ingredients =
                        typeof p.ingredients === 'string'
                          ? JSON.parse(p.ingredients)
                          : (p.ingredients as PlanBuilderIngredient[]);
                    } catch (e) {
                      console.warn('Error parseando ingredientes:', e);
                    }
                  }
                  result = planBuilderActionsEditMeal(p.mealIdentifier as string | number, {
                    time: p.time as string | undefined,
                    ingredients,
                    name: p.name as string | undefined,
                  });
                  break;
                }

                case 'PLAN_BUILDER_REMOVE_MEAL':
                  result = planBuilderActionsRemoveMeal(p.mealIdentifier as string | number);
                  break;

                case 'PLAN_BUILDER_ADD_SUPPLEMENT':
                  result = planBuilderActionsAddSupplement(p.name as string, p.dose as string, {
                    type: p.type as 'pill' | 'powder' | 'liquid' | 'syringe' | undefined,
                    time: p.time as string | undefined,
                    isPreWorkout: p.isPreWorkout as boolean | undefined,
                    isPostWorkout: p.isPostWorkout as boolean | undefined,
                  });
                  break;

                case 'PLAN_BUILDER_REMOVE_SUPPLEMENT':
                  result = planBuilderActionsRemoveSupplement(p.nameOrIndex as string | number);
                  break;

                case 'PLAN_BUILDER_SET_TRAINING':
                  result = planBuilderActionsSetTraining(
                    p.goal as string,
                    p.level as string,
                    p.frequency as number
                  );
                  break;

                case 'PLAN_BUILDER_SHOW':
                  result = planBuilderActionsShow();
                  break;

                case 'PLAN_BUILDER_CLEAR':
                  planBuilderActionsClear();
                  result = {
                    success: true,
                    message: `🧹 Plan Builder limpiado. Se descartaron los cambios.
💡 Di "crea mi plan" para empezar de nuevo.`,
                  };
                  break;

                case 'PLAN_BUILDER_EXECUTE':
                  result = await planBuilderActionsExecute();
                  break;

                default:
                  result = await executeTool(toolCall);
              }
            } else {
              // Herramientas normales - ejecutar vía executor
              result = await executeTool(toolCall);
            }

            results.push(result);
            toolResults.push({
              toolName: toolCall.tool,
              result: { success: result.success, message: result.message },
            });
          }

          // 🔧 PLAN BUILDER CONTINUATION LOOP
          // Si se llamó PLAN_BUILDER_START y el Plan Builder está activo pero vacío,
          // pedimos a Gemini que continúe agregando comidas/suplementos
          const wasStartCalled = toolResults.some((t) => t.toolName === 'PLAN_BUILDER_START');
          const currentPBState = planBuilderStateRef.current;
          let continuationIterations = 0;
          const MAX_CONTINUATIONS = 15; // Máximo 15 iteraciones (5 comidas + 10 suplementos)

          while (
            wasStartCalled &&
            currentPBState.isActive &&
            continuationIterations < MAX_CONTINUATIONS
          ) {
            console.warn(
              `🔄 Plan Builder Continuation Loop: iteración ${continuationIterations + 1}`
            );

            // Construir un resumen del estado actual y lo que falta
            const currentMeals = planBuilderStateRef.current.meals;
            const currentSupplements = planBuilderStateRef.current.supplements;
            const mealsAdded = currentMeals.map((m) => `${m.time} ${m.name}`).join(', ');
            const suppsAdded = currentSupplements.map((s) => `${s.name} ${s.dose}`).join(', ');

            // Pedirle a Gemini que continúe con más herramientas
            const moreToolsResponse = await continueWithMoreTools(
              userText,
              toolResults,
              geminiContext,
              GEMINI_API_KEY,
              `ESTADO ACTUAL DEL PLAN BUILDER:
- Comidas agregadas (${currentMeals.length}): ${mealsAdded || 'ninguna'}
- Suplementos agregados (${currentSupplements.length}): ${suppsAdded || 'ninguno'}

HISTORIAL DE HERRAMIENTAS EJECUTADAS: ${toolResults.map((t) => t.toolName).join(' → ')}

INSTRUCCIONES:
1. Si el usuario mencionó un NÚMERO específico de comidas (ej: "5 comidas") y aún no has agregado ese número, agrega las que faltan con PLAN_BUILDER_ADD_MEAL
2. Si el usuario mencionó suplementos (creatina, proteína, omega3, pre-entreno, etc.) y no los has agregado, usa PLAN_BUILDER_ADD_SUPPLEMENT para CADA UNO
3. Si ya agregaste TODAS las comidas y suplementos mencionados, usa PLAN_BUILDER_SHOW para mostrar el resumen al usuario
4. ⛔ NO llames PLAN_BUILDER_EXECUTE. El usuario debe confirmar el plan antes de ejecutar.
5. IMPORTANTE: Distribuye las comidas uniformemente entre la primera y última hora que mencionó el usuario
6. Para pre-entreno usa isPreWorkout=true, para post-entreno usa isPostWorkout=true

¿Qué herramienta debes llamar ahora?`,
              recentHistory // Pasar historial de conversación
            );

            if (moreToolsResponse.toolCalls.length === 0) {
              console.warn('🔄 Plan Builder Continuation: Sin más herramientas');
              break;
            }

            // Ejecutar las nuevas herramientas
            for (const toolCall of moreToolsResponse.toolCalls) {
              console.warn(`🔧 Continuation - Ejecutando: ${toolCall.tool}`);

              let result: HankToolResult;
              const p = toolCall.parameters;

              // Solo procesar herramientas del Plan Builder
              if (toolCall.tool.startsWith('PLAN_BUILDER_')) {
                switch (toolCall.tool) {
                  case 'PLAN_BUILDER_ADD_MEAL': {
                    let ingredients: PlanBuilderIngredient[] = [];
                    try {
                      if (typeof p.ingredients === 'string') {
                        ingredients = JSON.parse(p.ingredients);
                      } else if (Array.isArray(p.ingredients)) {
                        ingredients = p.ingredients as PlanBuilderIngredient[];
                      }
                    } catch (e) {
                      console.warn('Error parseando ingredientes:', e);
                    }
                    result = planBuilderActionsAddMeal(
                      p.time as string,
                      ingredients,
                      p.name as string | undefined
                    );
                    break;
                  }
                  case 'PLAN_BUILDER_ADD_SUPPLEMENT':
                    result = planBuilderActionsAddSupplement(p.name as string, p.dose as string, {
                      type: p.type as 'pill' | 'powder' | 'liquid' | 'syringe' | undefined,
                      time: p.time as string | undefined,
                      isPreWorkout: p.isPreWorkout as boolean | undefined,
                      isPostWorkout: p.isPostWorkout as boolean | undefined,
                    });
                    break;
                  case 'PLAN_BUILDER_SET_TRAINING':
                    result = planBuilderActionsSetTraining(
                      p.goal as string,
                      p.level as string,
                      p.frequency as number
                    );
                    break;
                  case 'PLAN_BUILDER_SHOW':
                    result = planBuilderActionsShow();
                    // Mostrar preview = parar el loop para que el usuario confirme
                    continuationIterations = MAX_CONTINUATIONS;
                    break;
                  case 'PLAN_BUILDER_EXECUTE':
                    result = await planBuilderActionsExecute();
                    // Si se ejecutó, salir del loop
                    continuationIterations = MAX_CONTINUATIONS;
                    break;
                  default:
                    result = { success: true, message: 'OK' };
                }

                results.push(result);
                toolResults.push({
                  toolName: toolCall.tool,
                  result: { success: result.success, message: result.message },
                });
              }
            }

            continuationIterations++;
          }

          // 5. Obtener respuesta final de Gemini después de ejecutar herramientas
          // PASAR historial de conversación para que Hank tenga contexto de lo hablado
          const finalMessage = await continueAfterToolExecution(
            userText,
            toolResults,
            geminiContext,
            GEMINI_API_KEY,
            recentHistory // Historial de conversación para contexto
          );

          // Agregar el mensaje final como resultado
          // NO sobreescribir mensajes de PLAN_BUILDER_SHOW o PLAN_BUILDER_EXECUTE
          // ya que contienen previews/resultados detallados que Gemini truncaría
          const lastToolExecuted = toolResults[toolResults.length - 1]?.toolName || '';
          const isPlanBuilderResult =
            lastToolExecuted === 'PLAN_BUILDER_SHOW' || lastToolExecuted === 'PLAN_BUILDER_EXECUTE';
          if (finalMessage && results.length > 0 && !isPlanBuilderResult) {
            results[results.length - 1].message = finalMessage;
            finalResponseText = finalMessage;
          } else if (isPlanBuilderResult && results.length > 0) {
            // Usar el mensaje del Plan Builder directamente (ya tiene preview/resultado completo)
            finalResponseText = results[results.length - 1].message;
          }

          // =========================================================================
          // ACTUALIZAR MEMORIA DE CORTO PLAZO v3.0
          // =========================================================================
          const executedTools = toolResults.map((tr) => tr.toolName);
          updateShortTermMemory({
            lastExecutedTools: executedTools,
            lastExecutionTime: new Date(),
          });

          // Construir resumen de ejecuciones para el historial
          // Esto ayuda a Hank a "recordar" qué acciones realizó
          const executionSummary = toolResults
            .filter((tr) => tr.result.success)
            .map((tr) => `✓ ${tr.toolName}`)
            .join(', ');

          // Mensaje completo para el historial incluye las acciones ejecutadas
          const historyMessage = executionSummary
            ? `[Ejecutado: ${executionSummary}]\n${finalResponseText || 'Listo.'}`
            : finalResponseText || 'Listo.';

          // Actualizar historial de conversación y guardar en DB solo si saveToHistory es true
          if (saveToHistory) {
            setConversationHistory((prev) => [
              ...prev,
              { role: 'user', parts: [{ text: userText }] },
              { role: 'model', parts: [{ text: historyMessage }] },
            ]);
            await saveMessageToSupabase('user', userText);
            await saveMessageToSupabase('model', historyMessage);
          }

          // Marcar que hubo tool calls y si hubo herramientas de ESCRITURA
          // Solo las herramientas de escritura deben cerrar el chat y mostrar animación
          const hadWriteTools = geminiResponse.toolCalls.some((tc) => isWriteTool(tc.tool));

          // Trigger refresh SOLO si alguna operación de ESCRITURA fue exitosa
          // Herramientas como HANK_CLEAR_HISTORY no deben disparar refresh de datos
          if (results.some((r) => r.success) && hadWriteTools) {
            console.warn('🔄 HANK: Operación de ESCRITURA exitosa, incrementando refreshTrigger');
            setRefreshTrigger((prev) => {
              console.warn('🔄 HANK: refreshTrigger ahora será:', prev + 1);
              return prev + 1;
            });
          }
          console.warn(
            '🔧 HANK: hadWriteTools:',
            hadWriteTools,
            'tools:',
            geminiResponse.toolCalls.map((tc) => tc.tool).join(', ')
          );

          if (results.length > 0) {
            // Preservar todos los flags existentes (como clearUIChat) al agregar los nuevos
            const existingData = results[0].data || {};
            console.warn('🔧 HANK: existingData antes de merge:', JSON.stringify(existingData));
            results[0].data = {
              ...existingData,
              hadToolCalls: true,
              hadWriteToolCalls: hadWriteTools,
            };
            console.warn(
              '🔧 HANK: results[0].data después de merge:',
              JSON.stringify(results[0].data)
            );
          }

          return results;
        }

        // 6. Si no hay tool calls, devolver el mensaje de texto y actualizar historial
        // En modo analyzeOnly, también retornar indicando que no hay herramientas
        if (analyzeOnly) {
          console.warn('🔍 ANALYZE ONLY: Solo respuesta conversacional, sin herramientas');
          setIsProcessing(false);
          return [
            {
              success: true,
              message: geminiResponse.message,
              data: {
                analyzeOnly: true,
                toolCalls: [],
                geminiMessage: geminiResponse.message,
              },
            },
          ];
        }

        if (saveToHistory) {
          setConversationHistory((prev) => [
            ...prev,
            { role: 'user', parts: [{ text: userText }] },
            { role: 'model', parts: [{ text: geminiResponse.message }] },
          ]);
          await saveMessageToSupabase('user', userText);
          await saveMessageToSupabase('model', geminiResponse.message);
        }

        return [
          {
            success: true,
            message: geminiResponse.message,
          },
        ];
      } catch (e) {
        const errorName = (e as Error)?.name || 'Unknown';
        const errorMsg = (e as Error)?.message || 'Error desconocido';
        const isTimeout = errorName === 'AbortError';

        if (isTimeout) {
          console.warn('⏱️ Gemini timeout, usando parseo básico...');
        } else {
          console.warn('⚠️ Gemini falló:', errorMsg);
        }

        // 🔴 DEBUG: Mostrar error real al usuario para diagnóstico
        const debugError = isTimeout
          ? '⏱️ Gemini tardó demasiado (timeout 30s). Intenta de nuevo.'
          : `⚠️ Gemini error: ${errorMsg.substring(0, 200)}`;

        return [
          {
            success: false,
            message: debugError,
          },
        ];
      } finally {
        setIsProcessing(false);
      }
    },
    [executeAlias, buildGeminiContext, executeTool, conversationHistory, saveMessageToSupabase]
  );

  /**
   * Parseo básico de patrones comunes (placeholder para LLM)
   */
  const parseAndExecuteBasic = async (text: string): Promise<HankToolResult[]> => {
    const lower = text.toLowerCase();

    // Helper: Resolver "este ejercicio", "el actual", etc. al activeAsset
    const resolveExerciseName = (name: string): string => {
      const contextualPhrases = [
        'este ejercicio',
        'este',
        'el actual',
        'el que estoy viendo',
        'el de ahora',
        'este de aquí',
        'el ejercicio actual',
        'éste',
      ];
      const lowerName = name.toLowerCase().trim();
      if (contextualPhrases.some((phrase) => lowerName.includes(phrase)) && activeAsset) {
        return activeAsset.name;
      }
      return name.trim();
    };

    // Helper: Convertir ordinales a números
    const ordinalToNumber = (text: string): number | null => {
      const ordinals: Record<string, number> = {
        primera: 0,
        first: 0,
        '1ra': 0,
        '1ª': 0,
        segunda: 1,
        second: 1,
        '2da': 1,
        '2ª': 1,
        tercera: 2,
        third: 2,
        '3ra': 2,
        '3ª': 2,
        cuarta: 3,
        fourth: 3,
        '4ta': 3,
        '4ª': 3,
        quinta: 4,
        fifth: 4,
        '5ta': 4,
        '5ª': 4,
        sexta: 5,
        sixth: 5,
        '6ta': 5,
        '6ª': 5,
        séptima: 6,
        septima: 6,
        seventh: 6,
        '7ma': 6,
        '7ª': 6,
        octava: 7,
        eighth: 7,
        '8va': 7,
        '8ª': 7,
        novena: 8,
        ninth: 8,
        '9na': 8,
        '9ª': 8,
        décima: 9,
        decima: 9,
        tenth: 9,
        '10ma': 9,
        '10ª': 9,
      };
      for (const [ordinal, idx] of Object.entries(ordinals)) {
        if (text.includes(ordinal)) return idx;
      }
      return null;
    };

    // ⚠️ IMPORTANTE: Patrones de SERIES deben ir ANTES de patrones de EJERCICIOS

    // Patrón: "quita/elimina la última/primera/segunda serie"
    if ((lower.includes('quita') || lower.includes('elimina')) && lower.includes('serie')) {
      let seriesIndex: 'last' | 'first' | number = 'last';

      // Primero buscar ordinales
      const ordinalIdx = ordinalToNumber(lower);
      if (ordinalIdx !== null) {
        seriesIndex = ordinalIdx;
      } else if (lower.includes('última') || lower.includes('ultima') || lower.includes('last')) {
        seriesIndex = 'last';
      } else {
        // Buscar número específico "serie 3"
        const numMatch = lower.match(/serie\s*(\d+)/);
        if (numMatch) {
          seriesIndex = parseInt(numMatch[1], 10) - 1; // Convertir a 0-indexed
        }
      }

      if (activeAsset) {
        const result = await executeTool({
          tool: 'ASSET_REMOVE_SERIES',
          parameters: {
            configId: activeAsset.configId, // BUGFIX: Usar configId para identificación precisa
            assetName: activeAsset.name,
            seriesIndex: seriesIndex,
          },
        });
        return [result];
      }
    }

    // Patrón: "agrega/añade una serie"
    if ((lower.includes('agrega') || lower.includes('añade')) && lower.includes('serie')) {
      // Extraer reps si se especifican (soporta: "10 reps", "1 repetición", "12 repeticiones")
      let reps = 10;
      const repsMatch = lower.match(/(\d+)\s*(?:reps?|repetici[oó]n(?:es)?)/);
      if (repsMatch) {
        reps = parseInt(repsMatch[1], 10);
      }

      // Extraer peso si se especifica
      let weight = 0;
      const weightMatch = lower.match(/(\d+)\s*(?:kg|kilos?)/);
      if (weightMatch) {
        weight = parseInt(weightMatch[1], 10);
      }

      // Extraer tipo
      let seriesType: 'CALENTAMIENTO' | 'APROXIMACION' | 'EFECTIVA' | 'FALLO' = 'EFECTIVA';
      if (lower.includes('calentamiento') || lower.includes('warmup')) {
        seriesType = 'CALENTAMIENTO';
      } else if (
        lower.includes('fallo') ||
        lower.includes('failure') ||
        lower.includes('intensidad')
      ) {
        seriesType = 'FALLO';
      } else if (
        lower.includes('aproximación') ||
        lower.includes('approach') ||
        lower.includes('aproximacion')
      ) {
        seriesType = 'APROXIMACION';
      }

      if (activeAsset) {
        const result = await executeTool({
          tool: 'ASSET_ADD_SERIES',
          parameters: {
            configId: activeAsset.configId, // BUGFIX: Usar configId para identificación precisa
            assetName: activeAsset.name,
            reps,
            weight,
            seriesType,
          },
        });
        return [result];
      }
    }

    // Patrón: "quita/elimina X" (EJERCICIO - solo si NO menciona "serie")
    if ((lower.includes('quita') || lower.includes('elimina')) && !lower.includes('serie')) {
      const match = text.match(/(?:quita|elimina)\s+(?:la\s+)?(.+)/i);
      if (match) {
        const exerciseName = resolveExerciseName(match[1]);
        const result = await executeTool({
          tool: 'GYM_REMOVE_EXERCISE',
          parameters: { exerciseName },
        });
        return [result];
      }
    }

    // Patrón: "cambia X por Y" o "reemplaza X por Y"
    if (lower.includes('cambia') || lower.includes('reemplaza') || lower.includes('pon')) {
      // Patrón con "por"
      const matchWithPor = text.match(
        /(?:cambia|reemplaza|pon)\s+(.+?)\s+(?:por|en lugar de)\s+(.+)/i
      );
      if (matchWithPor) {
        const oldExerciseName = resolveExerciseName(matchWithPor[1]);
        const newExerciseName = matchWithPor[2].trim();
        const result = await executeTool({
          tool: 'GYM_REPLACE_EXERCISE',
          parameters: { oldExerciseName, newExerciseName },
        });
        return [result];
      }

      // Patrón sin especificar nuevo: "cambia este ejercicio" (usa activeAsset)
      if (activeAsset && (lower.includes('este') || lower.includes('actual'))) {
        // Si dice "por otro" sin especificar, sugerir alternativas DEL CATÁLOGO REAL
        if (
          lower.includes('por otro') ||
          lower.includes('tu decide') ||
          lower.includes('tú decide') ||
          lower.includes('escoge') ||
          lower.includes('elige')
        ) {
          // Filtrar ejercicios disponibles excluyendo el actual
          const suggestions = availableExercises
            .filter((ex) => ex !== activeAsset.name)
            .slice(0, 5);

          return [
            {
              success: false,
              message: `🏋️ Estás en **${activeAsset.name}**. ¿Por cuál quieres cambiarlo?\n\nEjercicios disponibles:\n${suggestions.map((s) => `• ${s}`).join('\n')}\n\nDime el nombre exacto.`,
            },
          ];
        }
      }
    }

    // Patrón: "agrega/añade X" (ejercicio - solo si NO menciona "serie")
    if ((lower.includes('agrega') || lower.includes('añade')) && !lower.includes('serie')) {
      const match = text.match(/(?:agrega|añade)\s+(.+)/i);
      if (match) {
        // Usar el día del contexto de pantalla (UI) si está disponible
        const currentDay = screenContext.currentTrainingDay ?? userProfile.currentTrainingDay;
        const result = await executeTool({
          tool: 'GYM_ADD_EXERCISE',
          parameters: {
            exerciseName: match[1].trim(),
            trainingDay: currentDay,
          },
        });
        return [result];
      }
    }

    // Patrón: "súbele/bájale X calorías a Y"
    const calorieMatch = text.match(
      /(súbele|bájale|sube|baja)\s+(\d+)\s*(?:cal|calorías?)?\s*(?:a\s+)?(?:la\s+)?(.+)/i
    );
    if (calorieMatch) {
      const isAdd =
        calorieMatch[1].toLowerCase().startsWith('súb') ||
        calorieMatch[1].toLowerCase().startsWith('sub');
      const amount = parseInt(calorieMatch[2], 10);
      const result = await executeTool({
        tool: 'DIET_ADD_CALORIES',
        parameters: {
          mealName: calorieMatch[3].trim(),
          caloriesChange: isAdd ? amount : -amount,
        },
      });
      return [result];
    }

    // Patrón: "mi rutina" o "qué tengo"
    if (lower.includes('mi rutina') || lower.includes('qué tengo') || lower.includes('que tengo')) {
      const result = await executeTool({
        tool: 'GYM_LIST_EXERCISES',
        parameters: {},
      });
      return [result];
    }

    // No se pudo parsear
    return [
      {
        success: false,
        message:
          '🤔 No entendí el comando. Prueba con:\n• "quita la Prensa"\n• "cambia Prensa por Sentadilla Hack"\n• "súbele 200 calorías a la cena"',
      },
    ];
  };

  // -------------------------------------------------------------------------
  // LLM INTEGRATION HELPERS
  // -------------------------------------------------------------------------

  /**
   * Genera instrucciones específicas por deporte
   */
  const getSportInstructions = useCallback((sport: SportMode): string => {
    switch (sport) {
      case 'GYM':
        return `MODO GYM:
- Puedes gestionar ejercicios, series, repeticiones y pesos
- Herramientas: GYM_ADD_EXERCISE, GYM_REMOVE_EXERCISE, GYM_MODIFY_SERIES, GYM_REPLACE_EXERCISE
- Ayuda con técnica, nutrición (PLAN), y progresión de cargas
- Vocabulario: ejercicios, series, reps, PR, fallo muscular, descanso`;

      case 'MOTO':
        return `MODO MOTO:
- Gestiona vehículos, mantenimientos y eventos/carreras
- Herramientas: INVENTORY_ADD, INVENTORY_UPDATE, EVENT_CREATE, MAINTENANCE_LOG
- Ayuda con setup de moto, telemetría, y preparación pre-carrera
- Vocabulario: circuito, vuelta rápida, presión neumáticos, suspensión, frenada`;

      case 'AUTO':
        return `MODO AUTO:
- Similar a MOTO pero para automóviles
- Gestiona vehículos, mantenimientos y eventos/track days
- Herramientas: INVENTORY_ADD, INVENTORY_UPDATE, EVENT_CREATE, MAINTENANCE_LOG
- Vocabulario: track day, stint, pit stop, setup, telemetría`;

      case 'SURF':
        return `MODO SURF:
- Gestiona tablas (quiver), gear y sesiones de surf
- Herramientas: INVENTORY_ADD, SESSION_LOG, SPOT_FAVORITE
- Ayuda con condiciones, forecast, y elección de tabla
- Vocabulario: swell, periodo, marea, offshore, quiver, spot`;

      default:
        return 'Deporte no especificado. Pregunta al usuario qué tipo de actividad realiza.';
    }
  }, []);

  /**
   * Genera el System Prompt con contexto actual
   */
  const getSystemPrompt = useCallback((): string => {
    // Usar el día del contexto de pantalla (UI) si está disponible, sino el del perfil
    const currentDay = screenContext.currentTrainingDay ?? userProfile.currentTrainingDay;
    const sportName = sportContext?.activeSport?.name || 'No definido';

    // Debug: ver qué contexto tiene HANK
    console.warn('🧠 HANK getSystemPrompt - activeAsset:', activeAsset?.name || 'NINGUNO');
    console.warn('🧠 HANK planBuilder:', planBuilderState.isActive ? 'ACTIVO' : 'INACTIVO');

    // Construir sección de Plan Builder si está activo
    const planBuilderSection = planBuilderState.isActive
      ? `
🚀 MODO PLAN BUILDER ACTIVO
El usuario está construyendo un plan de nutrición conversacionalmente.
- Comidas agregadas: ${planBuilderState.meals.length}
- Suplementos agregados: ${planBuilderState.supplements.length}
${planBuilderState.meals.length > 0 ? `\nComidas en construcción:\n${planBuilderState.meals.map((m, i) => `  ${i + 1}. ${m.name || 'Comida'} (${m.time}): ${m.ingredients.map((ing) => ing.name).join(', ')}`).join('\n')}` : ''}
${planBuilderState.supplements.length > 0 ? `\nSupplementos en construcción:\n${planBuilderState.supplements.map((s, i) => `  ${i + 1}. ${s.name} (${s.dose})`).join('\n')}` : ''}

INSTRUCCIONES PLAN BUILDER:
- Usa PLAN_BUILDER_ADD_MEAL para agregar comidas
- Usa PLAN_BUILDER_ADD_SUPPLEMENT para agregar suplementos
- Usa PLAN_BUILDER_SHOW cuando pida ver el plan
- Usa PLAN_BUILDER_REMOVE_MEAL / PLAN_BUILDER_REMOVE_SUPPLEMENT para quitar items
- Usa PLAN_BUILDER_EXECUTE cuando diga "ejecuta", "guarda", "aplica" o "listo con el plan"
- Usa PLAN_BUILDER_CLEAR para cancelar y descartar todo
`
      : '';

    return `Eres HANK, el asistente de IA de TRENS (High-Performance Multi-Sport App).

CONTEXTO ACTUAL:
- Módulo activo: ${screenContext.module.toUpperCase()}
- Vista: ${screenContext.viewMode || 'principal'}
- Deporte activo: ${sportMode} (${sportName})
- Nivel del usuario: ${userProfile.level}
${sportMode === 'GYM' ? `- Día de entrenamiento: ${currentDay + 1} (índice: ${currentDay})` : ''}
${planBuilderSection}

${getSportInstructions(sportMode)}

${sportMode === 'GYM' ? `IMPORTANTE: Cuando el usuario pida modificar series de un ejercicio, usa trainingDay: ${currentDay}` : ''}

${
  activeAsset
    ? `
EJERCICIO ACTIVO: ${activeAsset.name}
${
  activeAsset.liquidData?.notes
    ? `📝 NOTAS DEL USUARIO: "${activeAsset.liquidData.notes}"`
    : '(Sin notas)'
}
${
  (
    activeAsset.liquidData?.videoHistory as
      | Array<{
          date: string;
          isToday: boolean;
          weightKg: number | null;
          reps: number | null;
          notes: string | null;
        }>
      | undefined
  )?.length
    ? `
📊 HISTORIAL DE VIDEOS (últimos entrenos):
${(
  activeAsset.liquidData.videoHistory as Array<{
    date: string;
    isToday: boolean;
    weightKg: number | null;
    reps: number | null;
    notes: string | null;
  }>
)
  .slice(0, 5)
  .map(
    (v) =>
      `- ${v.isToday ? '🔥 HOY' : v.date}: ${v.weightKg ? `${v.weightKg}kg` : ''}${v.weightKg && v.reps ? ' x ' : ''}${v.reps ? `${v.reps} reps` : ''}${v.notes ? ` | "${v.notes}"` : ''}`
  )
  .join('\n')}`
    : ''
}
${activeAsset.liquidData?.todayNotes ? `\n⚡ NOTA DE HOY: "${activeAsset.liquidData.todayNotes}"` : ''}
`
    : ''
}

${
  aliases.length > 0
    ? `
ALIAS DEL USUARIO:
${aliases.map((a) => `- "${a.trigger}": ${a.description || a.actions.map((ac) => ac.tool).join(', ')}`).join('\n')}
`
    : ''
}

PERSONALIDAD:
1. Eres directo, conciso y motivador. Estilo "savage", sin rodeos.
2. Adapta tu vocabulario al deporte activo.
3. Si el usuario pide cambiar algo, USA las herramientas disponibles.
4. Confirma SIEMPRE después de ejecutar una acción.
5. Si no entiendes algo, pregunta claramente.
6. SIEMPRE revisa las NOTAS e HISTORIAL del ejercicio activo antes de responder preguntas sobre el rendimiento del usuario.
7. Cuando el usuario pregunte sobre su levantamiento/entrenamiento, USA los datos del historial de videos (peso, reps, notas).
${planBuilderState.isActive ? '8. EL PLAN BUILDER ESTÁ ACTIVO - Usa las herramientas PLAN_BUILDER_* para manejar el plan en construcción.' : ''}

PLANES DE ENTRENAMIENTO:
- Usa TRAINING_DESIGN_PLAN para diseñar un plan personalizado. ESTA ES LA HERRAMIENTA PRINCIPAL.
  * Primero pregunta al usuario: 1) ¿Cuál es tu objetivo? 2) ¿Cuántos días puedes entrenar? 3) ¿Cuál es tu experiencia?
  * Luego llama TRAINING_DESIGN_PLAN con goal, level y frequency.
  * El plan se asigna automáticamente con todos los ejercicios y series.
  * El usuario NUNCA debe saber que hay planes predefinidos - siempre presenta el plan como 100% personalizado.
- Usa TRAINING_GET_CURRENT_PLAN para ver qué plan tiene actualmente
- Usa TRAINING_RESTRUCTURE para cambiar completamente la estructura de días
- Usa TRAINING_RENAME_DAY para renombrar un día específico
- Usa TRAINING_ADD_DAY para agregar un nuevo día
- Usa TRAINING_REMOVE_DAY para eliminar un día
- NO uses TRAINING_LIST_TEMPLATES ni TRAINING_ASSIGN_PLAN con usuarios normales (son herramientas internas)

CONTROL DE EJERCICIOS Y SERIES:
- Usa GYM_GET_EXERCISE_DETAILS para ver la configuración completa de un ejercicio (series, reps, peso, RIR, tempo, descanso)
- Usa GYM_UPDATE_SERIES_DETAIL para modificar cualquier aspecto de una serie específica:
  * reps: número de repeticiones
  * weight: peso en kg
  * type: WARMUP, APPROACH, EFFECTIVE, FAILURE
  * rir: Reps In Reserve (0-5, donde 0=fallo técnico)
  * tempo: formato "3-1-2-0" (excéntrico-pausa-concéntrico-pausa)
  * restSeconds: segundos de descanso después de la serie
  * note: anotación para la serie
- Usa ASSET_SET_SERIES para configurar TODAS las series de un ejercicio de una vez
- Usa ASSET_ADD_SERIES para agregar una serie nueva
- Usa ASSET_REMOVE_SERIES para quitar una serie
- Cuando el usuario pregunte sobre un ejercicio, usa GYM_GET_EXERCISE_DETAILS primero para ver su configuración

NUTRICIÓN Y MACROS:
- Usa GET_FULL_PLAN_STATUS para obtener el estado COMPLETO del plan (entrenamiento + nutrición + suplementos)
- Usa SYNC_NUTRITION_MACROS para recalcular todos los macros después de cambios en el perfil
- Usa PLAN_BUILDER_* para construir planes de nutrición conversacionalmente
- Cuando el usuario cambie peso, objetivo o datos del perfil, pregunta si quiere sincronizar macros

CONTROL DEL PERFIL (ADN):
- Usa ADN_SET_BIOMETRICS para actualizar múltiples datos del perfil de una vez (peso, altura, objetivo, edad, sexo, % grasa, masa muscular, nivel de actividad, experiencia, lesiones, alergias)
- Usa ADN_UPDATE_MEASUREMENT para actualizar medidas corporales existentes (brazo, pecho, pierna, cintura, etc.)
- Usa ADN_ADD_MEASUREMENT para agregar nuevas medidas
- Usa ADN_UPDATE_PROFILE para cambios individuales simples
- DESPUÉS de cualquier cambio significativo en el perfil (peso, objetivo, composición corporal), SUGIERE ejecutar AUTO_ADJUST_ALL

AJUSTE AUTOMÁTICO:
- Usa AUTO_ADJUST_ALL cuando el usuario:
  * Cambie su peso significativamente (±2kg)
  * Cambie su objetivo (volumen → definición, etc.)
  * Actualice su % de grasa corporal
  * Pida "recalcular todo", "ajustar mi plan", "actualizar basado en mis cambios"
- AUTO_ADJUST_ALL recalcula: macros diarios, distribución de comidas, y da recomendaciones de entrenamiento

IMPORTANTE: 
- Puedes ejecutar múltiples herramientas si la solicitud lo requiere.
- Usa GET_FULL_PLAN_STATUS cuando necesites contexto completo antes de hacer cambios grandes.
- Siempre confirma los cambios importantes antes de ejecutarlos.
- TIENES CONTROL TOTAL del perfil del usuario. Cualquier dato (peso, objetivo, medidas) puede y DEBE cambiarse a través de ti.

HISTORIAL DE PROGRESO (FOTOS):
- Usa PROGRESS_GET_PHOTOS para ver el historial de fotos de progreso con resumen de cambios
- Usa PROGRESS_GET_PHOTO_DETAIL para ver los datos completos de una foto específica
- Usa PROGRESS_COMPARE_PHOTOS para comparar dos fotos y mostrar la evolución del usuario
- Cuando el usuario pregunte sobre su progreso, transformación o evolución, consulta sus fotos
- Las fotos guardan snapshot de peso, medidas, entrenamiento, nutrición y suplementos de ese momento
- Usa esta información para personalizar recomendaciones y ajustar planes`;
  }, [
    screenContext,
    sportMode,
    sportContext?.activeSport?.name,
    userProfile,
    activeAsset,
    aliases,
    getSportInstructions,
    planBuilderState,
  ]);

  // -------------------------------------------------------------------------
  // CONTEXT VALUE
  /**
   * Invalidar caché de macros - Llamar cuando se actualicen datos del perfil
   */
  const invalidateMacroCache = useCallback(() => {
    console.warn('🔄 HANK: Invalidando caché de macros');
    setMacroCacheInvalidate((prev) => prev + 1);
  }, []);

  // -------------------------------------------------------------------------
  const value = useMemo<HankContextState>(
    () => ({
      // State
      isProcessing: isProcessing || isExecuting,
      lastAction,

      // Dynamic context
      screenContext,
      activeAsset,
      sportMode,
      userProfile,
      availableExercises,

      // Plan Builder
      planBuilder: planBuilderState,
      planBuilderActions,

      // Aliases
      aliases,

      // Actions
      executeCommand,
      executeTool,
      executeToolChain,

      // Context updates
      setScreenContext,
      setActiveAsset,
      setSportMode,

      // Alias management
      addAlias,
      removeAlias,
      executeAlias,

      // Conversation management
      clearConversation,
      saveMessageToSupabase,

      // Data refresh trigger
      refreshTrigger,
      triggerRefresh,

      // NOTA: isChatOpen se movió a lib/hankChatState.ts para evitar re-renders

      // Macro cache invalidation
      macroCacheInvalidate,
      invalidateMacroCache,

      // LLM Integration
      getToolDefinitions,
      getSystemPrompt,

      // Targeting System
      targetState: {
        currentTarget,
        animationPhase,
        writeToolDetected,
        setTarget: setCurrentTarget,
        startAnimation: startTargetAnimation,
        completeAnimation: completeTargetAnimation,
        registerTarget,
        unregisterTarget,
        setOnExecutionSuccess,
      },
    }),
    [
      isProcessing,
      isExecuting,
      lastAction,
      screenContext,
      activeAsset,
      sportMode,
      userProfile,
      availableExercises,
      planBuilderState,
      planBuilderActions,
      aliases,
      executeCommand,
      executeTool,
      executeToolChain,
      setActiveAsset,
      addAlias,
      removeAlias,
      executeAlias,
      clearConversation,
      saveMessageToSupabase,
      refreshTrigger,
      triggerRefresh,
      // NOTA: isChatOpen removido - ahora usa lib/hankChatState.ts
      macroCacheInvalidate,
      invalidateMacroCache,
      getToolDefinitions,
      getSystemPrompt,
      currentTarget,
      animationPhase,
      writeToolDetected,
      startTargetAnimation,
      completeTargetAnimation,
      registerTarget,
      unregisterTarget,
      setOnExecutionSuccess,
    ]
  );

  return <HankContext.Provider value={value}>{children}</HankContext.Provider>;
};

// ============================================================================
// HOOK
// ============================================================================
// Valores por defecto cuando no hay HankProvider (evita crashes en hot reload)
const defaultHankState: HankContextState = {
  isProcessing: false,
  lastAction: null,
  screenContext: defaultScreenContext,
  activeAsset: null,
  sportMode: null,
  userProfile: null,
  availableExercises: [],
  planBuilder: defaultPlanBuilderState,
  planBuilderActions: {
    start: () => {},
    addMeal: () => ({ success: false, message: 'HankProvider no disponible' }),
    editMeal: () => ({ success: false, message: 'HankProvider no disponible' }),
    removeMeal: () => ({ success: false, message: 'HankProvider no disponible' }),
    addSupplement: () => ({ success: false, message: 'HankProvider no disponible' }),
    removeSupplement: () => ({ success: false, message: 'HankProvider no disponible' }),
    show: () => ({ success: false, message: 'HankProvider no disponible' }),
    clear: () => {},
    execute: async () => ({ success: false, message: 'HankProvider no disponible' }),
  },
  aliases: [],
  executeCommand: async () => [],
  executeTool: async () => ({ success: false, message: 'HankProvider no disponible' }),
  executeToolChain: async () => [],
  setScreenContext: () => {},
  setActiveAsset: async () => {},
  setSportMode: () => {},
  addAlias: () => {},
  removeAlias: () => {},
  executeAlias: async () => null,
  clearConversation: async () => {},
  saveMessageToSupabase: async () => {},
  refreshTrigger: 0,
  triggerRefresh: () => {},
  // NOTA: isChatOpen removido - ahora usa lib/hankChatState.ts
  macroCacheInvalidate: 0,
  invalidateMacroCache: () => {},
  getToolDefinitions: () => [],
  getSystemPrompt: () => '',
  targetState: {
    currentTarget: null,
    animationPhase: 'idle',
    writeToolDetected: false,
    setTarget: () => {},
    startAnimation: () => {},
    completeAnimation: () => {},
    registerTarget: () => {},
    unregisterTarget: () => {},
    setOnExecutionSuccess: () => {},
  },
};

export const useHank = (): HankContextState => {
  const context = useContext(HankContext);
  if (!context) {
    // Retornar valores por defecto en lugar de crash (hot reload safety)
    console.warn('useHank: HankProvider no disponible, usando valores por defecto');
    return defaultHankState;
  }
  return context;
};
