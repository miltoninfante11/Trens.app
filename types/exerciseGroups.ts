// ============================================================================
// EXERCISE GROUPS - Super Series, Tri-Series, Circuitos, Giant Sets
// Modelo de datos para agrupación de ejercicios en entrenamiento
// ============================================================================

export type ExerciseGroupType = 'SUPERSET' | 'TRISET' | 'CIRCUIT' | 'GIANT_SET';

export interface ExerciseGroup {
  id: string;
  type: ExerciseGroupType;
  name?: string;
  exercise_ids: string[]; // IDs de user_exercise_config (orden importa)
  rest_between: number; // Segundos de descanso entre ejercicios del grupo
  rest_after: number; // Segundos de descanso al terminar la ronda
  rounds?: number; // Número de rondas (circuitos). Si es null, usa las series del ejercicio
}

// Configuración de grupos por día: { "0": [...groups], "1": [...groups] }
export type ExerciseGroupsByDay = Record<string, ExerciseGroup[]>;

// ============================================================================
// HELPERS
// ============================================================================

export const GROUP_TYPE_CONFIG: Record<
  ExerciseGroupType,
  {
    label: string;
    shortLabel: string;
    icon: string; // emoji
    color: string;
    bgColor: string;
    borderColor: string;
    description: string;
    minExercises: number;
    maxExercises: number;
  }
> = {
  SUPERSET: {
    label: 'SUPER SERIE',
    shortLabel: 'SS',
    icon: '⚡',
    color: '#DC2626',
    bgColor: '#450a0a',
    borderColor: '#DC2626',
    description: '2 ejercicios sin descanso entre ellos',
    minExercises: 2,
    maxExercises: 2,
  },
  TRISET: {
    label: 'TRI-SERIE',
    shortLabel: 'TS',
    icon: '🔥',
    color: '#F97316',
    bgColor: '#431407',
    borderColor: '#F97316',
    description: '3 ejercicios encadenados sin descanso',
    minExercises: 3,
    maxExercises: 3,
  },
  CIRCUIT: {
    label: 'CIRCUITO',
    shortLabel: 'CIR',
    icon: '🔄',
    color: '#0EA5E9',
    bgColor: '#0c4a6e',
    borderColor: '#0EA5E9',
    description: '4+ ejercicios en rondas consecutivas',
    minExercises: 4,
    maxExercises: 10,
  },
  GIANT_SET: {
    label: 'GIANT SET',
    shortLabel: 'GS',
    icon: '💀',
    color: '#A855F7',
    bgColor: '#3b0764',
    borderColor: '#A855F7',
    description: '4+ ejercicios para el mismo grupo muscular',
    minExercises: 4,
    maxExercises: 8,
  },
};

/**
 * Determina automáticamente el tipo de grupo según la cantidad de ejercicios
 */
export function inferGroupType(exerciseCount: number): ExerciseGroupType {
  if (exerciseCount <= 2) return 'SUPERSET';
  if (exerciseCount === 3) return 'TRISET';
  return 'CIRCUIT';
}

/**
 * Genera un ID único para un grupo
 */
export function generateGroupId(): string {
  return `grp-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
}

/**
 * Calcula descanso por defecto según tipo de grupo
 */
export function getDefaultRest(type: ExerciseGroupType): {
  rest_between: number;
  rest_after: number;
} {
  switch (type) {
    case 'SUPERSET':
      return { rest_between: 0, rest_after: 120 };
    case 'TRISET':
      return { rest_between: 0, rest_after: 120 };
    case 'CIRCUIT':
      return { rest_between: 15, rest_after: 90 };
    case 'GIANT_SET':
      return { rest_between: 0, rest_after: 150 };
  }
}

/**
 * Busca el grupo al que pertenece un ejercicio en un día específico
 */
export function findGroupForExercise(
  groups: ExerciseGroup[],
  exerciseConfigId: string
): ExerciseGroup | null {
  return groups.find((g) => g.exercise_ids.includes(exerciseConfigId)) || null;
}

/**
 * Obtiene todos los IDs de ejercicios que están en algún grupo
 */
export function getGroupedExerciseIds(groups: ExerciseGroup[]): Set<string> {
  const ids = new Set<string>();
  groups.forEach((g) => g.exercise_ids.forEach((id) => ids.add(id)));
  return ids;
}
