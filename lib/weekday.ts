// ============================================================================
// WEEKDAY HELPERS — sistema unificado de días por calendario semanal.
// 0=Domingo, 1=Lunes, 2=Martes, 3=Miércoles, 4=Jueves, 5=Viernes, 6=Sábado.
// (Estándar JavaScript Date.getDay())
//
// Visualmente en TRENS la semana se muestra LUNES-PRIMERO. Usa
// VISUAL_ORDER para iterar.
// ============================================================================

export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** Orden visual: Lun, Mar, Mié, Jue, Vie, Sáb, Dom */
export const VISUAL_ORDER: Weekday[] = [1, 2, 3, 4, 5, 6, 0];

/** Letras cortas (Mon-first) */
export const VISUAL_LETTERS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

/** Etiquetas cortas indexadas por weekday (0=Dom..6=Sáb) */
export const SHORT_LABEL: Record<Weekday, string> = {
  0: 'Dom',
  1: 'Lun',
  2: 'Mar',
  3: 'Mié',
  4: 'Jue',
  5: 'Vie',
  6: 'Sáb',
};

/** Nombre completo */
export const FULL_LABEL: Record<Weekday, string> = {
  0: 'Domingo',
  1: 'Lunes',
  2: 'Martes',
  3: 'Miércoles',
  4: 'Jueves',
  5: 'Viernes',
  6: 'Sábado',
};

/** Devuelve el weekday actual (0..6) en horario local */
export function todayWeekday(): Weekday {
  return new Date().getDay() as Weekday;
}

/** Lee el nombre de rutina para un weekday desde training_routine_names JSONB */
export function routineNameFor(
  routineNames: Record<string, string> | null | undefined,
  weekday: Weekday
): string | null {
  if (!routineNames) return null;
  const v = routineNames[String(weekday)];
  return v && typeof v === 'string' && v.trim() ? v.trim() : null;
}

/** Lista de weekdays activos (con nombre asignado) ordenados Mon-first */
export function activeWeekdaysFromNames(
  routineNames: Record<string, string> | null | undefined
): Weekday[] {
  if (!routineNames) return [];
  return VISUAL_ORDER.filter((wd) => {
    const v = routineNames[String(wd)];
    return v && typeof v === 'string' && v.trim().length > 0;
  });
}

/** Frecuencia derivada (cantidad de weekdays con nombre) */
export function frequencyFromNames(
  routineNames: Record<string, string> | null | undefined
): number {
  return activeWeekdaysFromNames(routineNames).length;
}

/**
 * Distribución estándar de N días por semana en weekdays.
 * Garantiza que el plan se reparta equilibrado (Lun primero, evita Domingo si N<=6).
 *  - 1 → Lun
 *  - 2 → Lun, Jue
 *  - 3 → Lun, Mié, Vie
 *  - 4 → Lun, Mar, Jue, Vie
 *  - 5 → Lun..Vie
 *  - 6 → Lun..Sáb
 *  - 7 → Lun..Sáb, Dom
 */
export function distributeWeekdays(frequency: number): Weekday[] {
  const map: Record<number, Weekday[]> = {
    0: [],
    1: [1],
    2: [1, 4],
    3: [1, 3, 5],
    4: [1, 2, 4, 5],
    5: [1, 2, 3, 4, 5],
    6: [1, 2, 3, 4, 5, 6],
    7: [1, 2, 3, 4, 5, 6, 0],
  };
  const f = Math.max(0, Math.min(7, Math.floor(frequency)));
  return map[f] || [];
}
