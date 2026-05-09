// Tipos compartidos por los tabs del Coach Editor
export interface CoachTabProps {
  token: string;
  coachName: string;
  onError: (msg: string | null) => void;
  onSaved: () => void;
}

export interface CoachExerciseSeries {
  id: string;
  type: 'CALENTAMIENTO' | 'APROXIMACION' | 'EFECTIVA' | 'FALLO';
  reps: number;
  weight?: number;
  rir?: number;
  tempo?: string;
  restSeconds?: number;
  note?: string;
}

export interface CoachExerciseConfig {
  rest?: string;
  sets?: string;
  custom_series?: CoachExerciseSeries[];
  series_by_day?: Record<string, CoachExerciseSeries[]>;
  notes?: string;
}

export interface CoachDayExercise {
  id: string; // user_exercise_config.id
  exercise_id: string;
  name: string;
  thumbnail_url: string | null;
  muscle_group: string | null;
  training_days: number[];
  session_index: number;
  display_order: number;
  config: CoachExerciseConfig;
  alternatives: string[] | null;
}

export interface CoachExerciseGroup {
  id: string;
  type: 'SUPERSERIES' | 'TRISERIES' | 'CIRCUITO' | 'DROP_SET';
  exercise_ids: string[];
  rest_after?: number;
  rounds?: number;
  notes?: string;
}

export interface CoachCatalogExercise {
  id: string;
  name: string;
  muscle_group: string | null;
  secondary_muscles: string[] | null;
  thumbnail_url: string | null;
}

export interface CoachMeal {
  id: string;
  name: string;
  scheduled_time: string | null;
  ingredients: any[];
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  notes: string | null;
  position: number;
  selected_option: number;
}

export interface CoachMealOption {
  id: string;
  name: string;
  ingredients: any[];
  notes: string | null;
  position: number;
}

export interface CoachCardio {
  id: string;
  activity: string;
  cardio_type: string;
  duration_minutes: number;
  intensity: string | null;
  scheduled_time: string | null;
  days_of_week: number[] | null;
  is_pre_workout: boolean;
  is_post_workout: boolean;
  is_fasted: boolean;
  notes: string | null;
  display_order: number;
}

export interface CoachSupplement {
  id: string;
  name: string;
  dose: string | null;
  type: string;
  time: string | null;
  days_of_week: number[] | null;
  is_pre_workout: boolean;
  is_post_workout: boolean;
  is_active: boolean;
  notes: string | null;
}

export const DAY_LABELS = ['LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB', 'DOM'];

export const SERIES_TYPE_COLORS: Record<CoachExerciseSeries['type'], string> = {
  CALENTAMIENTO: '#F59E0B',
  APROXIMACION: '#3B82F6',
  EFECTIVA: '#22C55E',
  FALLO: '#EF4444',
};
