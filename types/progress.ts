// =============================================================================
// TYPES: PROGRESS PHOTOS - Sistema de historial de progreso visual
// =============================================================================

/**
 * Snapshot del estado del usuario en un momento específico
 * Se guarda junto con cada foto de progreso
 */
export interface ProgressSnapshot {
  // Datos biométricos del perfil
  weight?: number;
  height?: number;
  body_fat_percentage?: number;
  muscle_mass?: number;
  goal?: string;
  age?: number;
  sex?: string;
  imc?: number;
  activity_level?: string;
  training_experience?: string;
  injuries?: string;
  allergies?: string;

  // Medidas corporales
  measurements?: Array<{
    name: string;
    value: string;
    is_dominant: boolean;
  }>;

  // Estructura de entrenamiento
  training?: {
    frequency: number;
    structure?: Array<{
      day: number;
      name: string;
    }>;
    current_plan?: string;
  };

  // Nutrición
  nutrition?: {
    meal_count: number;
    daily_calories?: number;
    daily_protein?: number;
    daily_carbs?: number;
    daily_fat?: number;
  };

  // Suplementos/Stack
  supplements?: Array<{
    name: string;
    time: string;
  }>;
}

/**
 * Foto de progreso con todos sus datos
 */
export interface ProgressPhoto {
  id: string;
  user_id: string;
  photo_url: string;
  thumbnail_url?: string;
  snapshot: ProgressSnapshot;
  notes?: string;
  created_at: string;
}

/**
 * Input para crear una nueva foto de progreso
 */
export interface CreateProgressPhotoInput {
  photo_base64: string;
  notes?: string;
}

/**
 * Comparación entre dos fotos de progreso
 */
export interface ProgressComparison {
  before: ProgressPhoto;
  after: ProgressPhoto;
  changes: {
    weight_diff?: number;
    body_fat_diff?: number;
    muscle_mass_diff?: number;
    days_between: number;
  };
}
