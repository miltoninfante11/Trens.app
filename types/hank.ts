// ============================================================================
// HANK TYPES - Sistema completo de tipos para el Agente HANK
// ============================================================================

// ============================================================================
// TOOL NAMES - Todas las herramientas disponibles
// ============================================================================
export type HankToolName =
  // GYM Tools
  | 'GYM_ADD_EXERCISE'
  | 'GYM_REMOVE_EXERCISE'
  | 'GYM_REPLACE_EXERCISE'
  | 'GYM_GET_TODAY_ROUTINE'
  | 'GYM_LIST_EXERCISES'
  | 'GYM_GET_EXERCISE_DETAILS'
  | 'GYM_UPDATE_SERIES_DETAIL'
  // Asset Tools (LIQUID DATA)
  | 'ASSET_UPDATE_FIELD'
  | 'ASSET_READ'
  | 'ASSET_GET_SCHEMA'
  | 'ASSET_REMOVE_SERIES'
  | 'ASSET_ADD_SERIES'
  | 'ASSET_REPLACE_SERIES'
  | 'ASSET_SET_SERIES'
  // ADN Tools
  | 'ADN_GET_PROFILE'
  | 'ADN_GET_RECORDS'
  | 'ADN_UPDATE_PROFILE'
  | 'ADN_SET_BIOMETRICS'
  | 'ADN_ADD_MEASUREMENT'
  | 'ADN_REMOVE_MEASUREMENT'
  | 'ADN_UPDATE_MEASUREMENT'
  // OMNISCIENT Tools (HANK es Dios)
  | 'GET_FULL_USER_CONTEXT'
  | 'PLAN_GET_MEAL_DETAILS'
  | 'AUTO_ADJUST_ALL'
  // Progress Photos
  | 'PROGRESS_GET_PHOTOS'
  | 'PROGRESS_GET_PHOTO_DETAIL'
  | 'PROGRESS_COMPARE_PHOTOS'
  // PLAN Tools (Nutrición y Farmacología)
  | 'PLAN_ADD_MEAL'
  | 'PLAN_REMOVE_MEAL'
  | 'PLAN_UPDATE_MEAL_TIME'
  | 'PLAN_UPDATE_INGREDIENTS'
  | 'PLAN_CALCULATE_MACROS'
  | 'PLAN_GET_MEALS'
  | 'PLAN_GET_SHOPPING_LIST'
  | 'PLAN_ADD_SUPPLEMENT'
  | 'PLAN_REMOVE_SUPPLEMENT'
  | 'PLAN_UPDATE_SUPPLEMENT_TIME'
  | 'PLAN_UPDATE_SUPPLEMENT_DOSE'
  | 'PLAN_UPDATE_SUPPLEMENT_NAME'
  | 'PLAN_UPDATE_MEAL_NAME'
  | 'PLAN_UPDATE_MEAL_MACROS'
  | 'PLAN_GET_STACK'
  | 'PLAN_ANALYZE_NUTRITION'
  | 'PLAN_GET_NEXT_MEAL'
  // MEAL OPTIONS (Alternativas de comidas)
  | 'PLAN_ADD_MEAL_OPTION'
  | 'PLAN_SELECT_MEAL_OPTION'
  | 'PLAN_REMOVE_MEAL_OPTION'
  | 'PLAN_GET_MEAL_OPTIONS'
  // PLAN BUILDER Tools (Construcción interactiva de planes)
  | 'PLAN_BUILDER_START'
  | 'PLAN_BUILDER_ADD_MEAL'
  | 'PLAN_BUILDER_EDIT_MEAL'
  | 'PLAN_BUILDER_REMOVE_MEAL'
  | 'PLAN_BUILDER_ADD_SUPPLEMENT'
  | 'PLAN_BUILDER_REMOVE_SUPPLEMENT'
  | 'PLAN_BUILDER_SET_TRAINING'
  | 'PLAN_BUILDER_SHOW'
  | 'PLAN_BUILDER_CLEAR'
  | 'PLAN_BUILDER_EXECUTE'
  // TRAINING PLAN Tools (Asignación de planes de entrenamiento)
  | 'TRAINING_DESIGN_PLAN'
  | 'TRAINING_LIST_TEMPLATES'
  | 'TRAINING_ASSIGN_PLAN'
  | 'TRAINING_GET_CURRENT_PLAN'
  | 'TRAINING_RESTRUCTURE'
  | 'TRAINING_RENAME_DAY'
  | 'TRAINING_ADD_DAY'
  | 'TRAINING_REMOVE_DAY'
  | 'TRAINING_SET_FREQUENCY'
  | 'TRAINING_SET_CURRENT_DAY'
  // PERSONALIZED TRAINING Tools (Usuarios con plan personalizado)
  | 'TRAINING_SET_EXTERNAL_MODE'
  | 'TRAINING_SET_EXTERNAL_SCHEDULE'
  | 'TRAINING_REMOVE_EXTERNAL_DAY'
  | 'TRAINING_GET_STATUS'
  // SYNC Tools (Sincronización completa)
  | 'GET_FULL_PLAN_STATUS'
  | 'SYNC_NUTRITION_MACROS'
  // Spotify Tools
  | 'SPOTIFY_GET_CURRENT_TRACK'
  // Diet Tools (Legacy pero funcional)
  | 'DIET_ADD_CALORIES'
  // Logging Tools
  | 'LOG_WORKOUT_SET'
  // Context Tools (Legacy - usar GET_FULL_USER_CONTEXT)
  | 'GET_USER_CONTEXT'
  // System Tools
  | 'HANK_CLEAR_HISTORY'
  | 'HANK_GET_CAPABILITIES'
  // PRO Tools (Notas de ejercicio)
  | 'PRO_ADD_EXERCISE_NOTE'
  | 'PRO_GET_EXERCISE_NOTES'
  // User Goal Tools (Metas con fechas)
  | 'SET_USER_GOAL'
  | 'GET_USER_GOALS'
  | 'UPDATE_GOAL_PROGRESS'
  // INVENTORY Tools (MOTO/AUTO/SURF)
  | 'INVENTORY_ADD_ITEM'
  | 'INVENTORY_UPDATE_ITEM'
  | 'INVENTORY_REMOVE_ITEM'
  | 'INVENTORY_LIST_ITEMS'
  // MAINTENANCE Tools (MOTO/AUTO)
  | 'MAINTENANCE_LOG'
  | 'MAINTENANCE_GET_ALERTS'
  | 'MAINTENANCE_GET_HISTORY'
  // EVENT Tools (MOTO/AUTO)
  | 'EVENT_CREATE'
  | 'EVENT_UPDATE'
  | 'EVENT_DELETE'
  | 'EVENT_LIST'
  // SURF Tools
  | 'SURF_LOG_SESSION'
  | 'SURF_GET_SESSIONS'
  | 'SURF_FAVORITE_SPOT'
  | 'SURF_GET_SPOTS'
  // AI-POWERED INGREDIENT ANALYSIS Tools
  | 'ANALYZE_INGREDIENTS_AI'
  | 'GET_SUBSTITUTION_SUGGESTIONS'
  | 'CHECK_ALLERGENS'
  | 'OPTIMIZE_MEAL_MACROS'
  // AI-POWERED VISUAL ANALYSIS Tools
  | 'ANALYZE_PROGRESS_PHOTO'
  | 'COMPARE_PROGRESS_PHOTOS'
  | 'ANALYZE_FOOD_PHOTO'
  | 'GENERATE_PROGRESS_TIMELINE';

// ============================================================================
// TOOL PARAMETER DEFINITIONS (Para Function Calling del LLM)
// ============================================================================
export interface ToolParameter {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  description: string;
  enum?: string[];
  items?: { type: string }; // Requerido para type: 'array' en Gemini
  required?: boolean;
  default?: unknown;
}

export interface ToolDefinition {
  name: HankToolName;
  description: string;
  parameters: Record<string, ToolParameter>;
  requiredParams: string[];
}

// ============================================================================
// TOOL CALL & RESULT
// ============================================================================
export interface HankToolCall {
  tool: HankToolName;
  parameters: Record<string, unknown>;
}

export interface HankToolResult {
  success: boolean;
  message: string;
  data?: unknown;
  affectedRecords?: number;
  rollbackId?: string;
}

// ============================================================================
// CONTEXT TYPES - El cerebro de HANK
// ============================================================================
export type ScreenModule =
  | 'nucleo'
  | 'gym'
  | 'plan'
  | 'pro'
  | 'adn'
  | 'garaje'
  | 'race'
  | 'tabla'
  | 'spot';
export type SportMode = 'GYM' | 'MOTO' | 'AUTO' | 'SURF' | null;
export type UserLevel = 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED' | 'SAVAGE';

export interface ScreenContext {
  module: ScreenModule;
  viewMode: string | null;
  currentExerciseIndex: number | null;
  currentTrainingDay?: number; // Día de entrenamiento seleccionado (0-indexed)
  // Workout time estimation from PLAN
  estimatedWorkoutTime?: string | null; // HH:MM format
  isFastedTraining?: boolean; // True if training before any meals
  workoutTimeDescription?: string; // "Después de Desayuno, antes de Almuerzo"
}

export interface ActiveAsset {
  id: string; // exercise_id (de tabla exercises)
  configId: string; // user_exercise_config.id - ESTABLE para modificar series
  type: string;
  name: string;
  liquidData: Record<string, unknown>; // JSONB dinámico
  trainingDays?: number[];
  isAlternative?: boolean; // true si es una alternativa, no el ejercicio principal
  parentExerciseName?: string; // nombre del ejercicio principal si es alternativa
}

export interface UserProfile {
  level: UserLevel;
  trainingFrequency: number;
  currentTrainingDay: number;
  preferences: Record<string, unknown>;
}

// ============================================================================
// ALIAS SYSTEM - Comandos personalizados del usuario
// ============================================================================
export interface AliasAction {
  tool: HankToolName;
  parameters: Record<string, unknown>;
}

export interface UserAlias {
  id: string;
  trigger: string; // "Modo Bestia"
  description?: string;
  actions: AliasAction[];
  createdAt: Date;
}

// ============================================================================
// HANK CONTEXT STATE - Estado global del provider
// ============================================================================
export interface HankContextState {
  // Processing state
  isProcessing: boolean;
  lastAction: string | null;

  // Dynamic context for LLM
  screenContext: ScreenContext;
  activeAsset: ActiveAsset | null;
  sportMode: SportMode;
  userProfile: UserProfile | null;
  availableExercises: string[];

  // Plan Builder State
  planBuilder: PlanBuilderState;
  planBuilderActions: {
    start: (clearExisting?: boolean) => void;
    addMeal: (time: string, ingredients: PlanBuilderIngredient[], name?: string) => HankToolResult;
    editMeal: (
      identifier: string | number,
      updates: { time?: string; ingredients?: PlanBuilderIngredient[]; name?: string }
    ) => HankToolResult;
    removeMeal: (identifier: string | number) => HankToolResult;
    addSupplement: (
      name: string,
      dose: string,
      options?: {
        type?: 'pill' | 'powder' | 'liquid' | 'syringe';
        time?: string;
        isPreWorkout?: boolean;
        isPostWorkout?: boolean;
      }
    ) => HankToolResult;
    removeSupplement: (nameOrIndex: string | number) => HankToolResult;
    show: () => HankToolResult;
    clear: () => void;
    execute: () => Promise<HankToolResult>;
  };

  // Aliases
  aliases: UserAlias[];

  // Actions
  executeCommand: (
    command: string,
    options?: {
      saveToHistory?: boolean;
      analyzeOnly?: boolean; // Si true, retorna toolCalls sin ejecutar
    }
  ) => Promise<HankToolResult[]>;
  executeTool: (toolCall: HankToolCall) => Promise<HankToolResult>;
  executeToolChain: (toolCalls: HankToolCall[]) => Promise<HankToolResult[]>;

  // Context updates
  setScreenContext: (ctx: ScreenContext) => void;
  setActiveAsset: (
    assetId: string | null,
    alternativeInfo?: {
      isAlternative: boolean;
      parentExerciseName: string;
      parentConfigId?: string;
    }
  ) => Promise<void>;
  setSportMode: (mode: SportMode) => void;

  // Alias management
  addAlias: (alias: Omit<UserAlias, 'id' | 'createdAt'>) => void;
  removeAlias: (triggerId: string) => void;
  executeAlias: (trigger: string) => Promise<HankToolResult[] | null>;

  // Conversation management
  clearConversation: () => Promise<void>;
  saveMessageToSupabase: (role: 'user' | 'model', content: string) => Promise<void>;

  // Data refresh trigger (incrementa cuando HANK modifica datos)
  refreshTrigger: number;
  triggerRefresh: () => void;

  // NOTA: isChatOpen se movió a lib/hankChatState.ts para evitar re-renders
  // Usar setHankChatOpen(), isHankChatOpen(), subscribeToHankChat() en su lugar

  // Macro cache invalidation (incrementa cuando se actualizan datos del perfil)
  macroCacheInvalidate: number;
  invalidateMacroCache: () => void;

  // LLM Integration
  getToolDefinitions: () => ToolDefinition[];
  getSystemPrompt: () => string;

  // Targeting System (para animaciones visuales)
  targetState: HankTargetState;
}

// ============================================================================
// CONVERSATION TYPES
// ============================================================================
export interface HankMessage {
  id: string;
  role: 'user' | 'hank' | 'system';
  content: string;
  toolCalls?: Array<{
    tool: HankToolName;
    params: Record<string, unknown>;
    result: HankToolResult;
  }>;
  timestamp: Date;
}

// ============================================================================
// HANK TARGETING SYSTEM - Para animaciones visuales
// ============================================================================
export interface HankTargetPosition {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface HankTarget {
  id: string;
  type: 'meal' | 'exercise' | 'supplement' | 'record' | 'profile' | 'custom';
  label: string;
  position: HankTargetPosition;
}

export type HankAnimationPhase =
  | 'idle' // Hank en esquina, nada activo
  | 'flying' // Hank viajando hacia el target
  | 'working' // Hank llegó, engranaje girando
  | 'success' // Flash verde, trabajo completado
  | 'returning'; // Hank regresando a esquina

export interface HankTargetState {
  currentTarget: HankTarget | null;
  animationPhase: HankAnimationPhase;
  writeToolDetected: boolean; // Se activa cuando se detecta una herramienta de escritura
  setTarget: (target: HankTarget | null) => void;
  startAnimation: (target: HankTarget) => void;
  completeAnimation: (success: boolean) => void;
  registerTarget: (id: string, target: Omit<HankTarget, 'id'>) => void;
  unregisterTarget: (id: string) => void;
  setOnExecutionSuccess: (callback: (() => void) | null) => void; // Callback para abrir chat al terminar
}

// ============================================================================
// PLAN BUILDER TYPES - Sistema de construcción de planes
// ============================================================================

/**
 * Un ingrediente en el plan builder
 */
export interface PlanBuilderIngredient {
  name: string;
  quantity?: string;
  portion?: string;
}

/**
 * Una comida en el plan builder (aún no guardada)
 */
export interface PlanBuilderMeal {
  tempId: string; // ID temporal para referencia
  time: string; // Hora en formato 24h (ej: "07:00")
  name?: string; // Nombre opcional (ej: "Desayuno")
  ingredients: PlanBuilderIngredient[];
}

/**
 * Un suplemento en el plan builder (aún no guardado)
 */
export interface PlanBuilderSupplement {
  tempId: string;
  name: string;
  dose: string;
  type?: 'pill' | 'powder' | 'liquid' | 'syringe';
  time?: string;
  isPreWorkout?: boolean;
  isPostWorkout?: boolean;
  daysOfWeek?: number[];
}

/**
 * Configuración de entrenamiento en el plan builder
 */
export interface PlanBuilderTraining {
  goal: string; // HIPERTROFIA, FUERZA, DEFINICION, RECOMPOSICION, GENERAL
  level: string; // PRINCIPIANTE, INTERMEDIO, AVANZADO
  frequency: number; // 3, 4, 5, 6 días por semana
}

/**
 * El estado completo del plan builder
 */
export interface PlanBuilderState {
  isActive: boolean;
  meals: PlanBuilderMeal[];
  supplements: PlanBuilderSupplement[];
  training: PlanBuilderTraining | null; // Configuración de entrenamiento
  startedAt: Date | null;
  clearExistingOnExecute: boolean; // Si true, borra el plan actual antes de insertar
}

/**
 * Resultado de ejecutar el plan builder
 */
export interface PlanBuilderExecuteResult {
  mealsCreated: number;
  supplementsCreated: number;
  trainingAssigned: boolean;
  trainingExercises: number;
  errors: string[];
}

// ============================================================================
// TRAINING PLAN TEMPLATES - Plantillas de entrenamiento predefinidas
// ============================================================================

/**
 * Un día de entrenamiento en una plantilla
 */
export interface TrainingTemplateDay {
  dayIndex: number; // 0-based
  name: string; // "Pecho y Tríceps"
  muscleGroups: string[]; // ["Pecho", "Tríceps"]
  exerciseCount: number; // Cantidad sugerida de ejercicios
}

/**
 * Una plantilla de entrenamiento completa
 */
export interface TrainingPlanTemplate {
  id: string; // Identificador único
  name: string; // "Push/Pull/Legs"
  description: string;
  frequency: number; // 3, 4, 5, 6 días por semana
  level: 'PRINCIPIANTE' | 'INTERMEDIO' | 'AVANZADO';
  goal: 'HIPERTROFIA' | 'FUERZA' | 'DEFINICION' | 'RECOMPOSICION' | 'GENERAL';
  days: TrainingTemplateDay[];
  tags?: string[];
}

/**
 * Resultado de asignar un plan de entrenamiento
 */
export interface TrainingPlanAssignResult {
  success: boolean;
  planName: string;
  frequency: number;
  daysConfigured: number;
  message: string;
}

// ============================================================================
// TRAINING STATUS - Estado de entrenamiento del usuario (SIMPLIFICADO)
// ============================================================================

/**
 * Modo de entrenamiento del usuario (simplificado)
 * - gym_module: Usa el módulo GYM con ejercicios en user_exercise_config
 * - external: Entrena por su cuenta, solo guarda frecuencia/horario simple
 * - none: No tiene nada configurado
 */
export type TrainingMode = 'gym_module' | 'external' | 'none';

/**
 * Nivel de experiencia del usuario
 */
export type ExperienceLevel = 'PRINCIPIANTE' | 'INTERMEDIO' | 'AVANZADO' | 'ELITE';

/**
 * Estado de entrenamiento simplificado
 */
export interface UserTrainingStatus {
  level: ExperienceLevel;
  declaredMode: TrainingMode; // Lo que el usuario declaró
  effectiveMode: TrainingMode; // Lo que realmente tiene (basado en datos)
  frequency: number;
  currentDay: number;
  routineNames: Record<string, string>;
  externalSchedule: Record<string, string>; // {"Lunes": "Pecho", "Martes": "Espalda"}
  gymExercisesCount: number;
  planSource: 'hank' | 'custom' | null;
  isExperienced: boolean;
}
