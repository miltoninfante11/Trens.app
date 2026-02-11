// =============================================================================
// FILTROS PRO - Filtros de video/foto para TRENS PRO
// Configuración de filtros con matrices de color
// =============================================================================

export type FilterType = 'RAW' | 'SAVAGE' | 'BW_BEAST' | 'GOLDEN_HOUR' | 'NEON';

export interface FilterConfig {
  id: FilterType;
  name: string;
  emoji: string;
  description: string;
  // CSS filter string for web/preview
  cssFilter: string;
  // Color matrix for native (expo-gl-view) - valores RGBA
  colorMatrix?: number[];
  // Overlay color (opcional)
  overlayColor?: string;
  overlayOpacity?: number;
}

export const FILTERS: Record<FilterType, FilterConfig> = {
  RAW: {
    id: 'RAW',
    name: 'Original',
    emoji: '📷',
    description: 'Sin filtro',
    cssFilter: 'none',
    colorMatrix: [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0],
  },
  SAVAGE: {
    id: 'SAVAGE',
    name: 'Savage',
    emoji: '🔥',
    description: 'Alto contraste + viñeta roja',
    cssFilter: 'contrast(1.2) saturate(1.1)',
    overlayColor: '#DC2626',
    overlayOpacity: 0.15,
    colorMatrix: [1.2, 0, 0, 0, 0, 0, 1.0, 0, 0, 0, 0, 0, 0.9, 0, 0, 0, 0, 0, 1, 0],
  },
  BW_BEAST: {
    id: 'BW_BEAST',
    name: 'B&W Beast',
    emoji: '⚫',
    description: 'Blanco y negro dramático',
    cssFilter: 'grayscale(1) contrast(1.3) brightness(1.05)',
    colorMatrix: [
      0.33, 0.33, 0.33, 0, 0, 0.33, 0.33, 0.33, 0, 0, 0.33, 0.33, 0.33, 0, 0, 0, 0, 0, 1, 0,
    ],
  },
  GOLDEN_HOUR: {
    id: 'GOLDEN_HOUR',
    name: 'Golden Hour',
    emoji: '🌅',
    description: 'Tonos cálidos para el pump',
    cssFilter: 'sepia(0.2) saturate(1.2) brightness(1.05) contrast(1.05)',
    overlayColor: '#F97316',
    overlayOpacity: 0.1,
    colorMatrix: [1.1, 0.1, 0, 0, 0, 0, 1.0, 0, 0, 0, 0, 0, 0.85, 0, 0, 0, 0, 0, 1, 0],
  },
  NEON: {
    id: 'NEON',
    name: 'Neon',
    emoji: '💜',
    description: 'Colores saturados cyberpunk',
    cssFilter: 'saturate(1.5) contrast(1.1) hue-rotate(-10deg)',
    overlayColor: '#8B5CF6',
    overlayOpacity: 0.12,
    colorMatrix: [1.1, 0, 0.2, 0, 0, 0.1, 1.0, 0.1, 0, 0, 0.2, 0, 1.2, 0, 0, 0, 0, 0, 1, 0],
  },
};

export const FILTER_LIST: FilterType[] = ['RAW', 'SAVAGE', 'BW_BEAST', 'GOLDEN_HOUR', 'NEON'];

export function getFilter(id: FilterType): FilterConfig {
  return FILTERS[id] || FILTERS.RAW;
}
