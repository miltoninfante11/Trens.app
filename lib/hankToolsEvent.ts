// ============================================================================
// HANK TOOLS EVENT - Emitter para abrir herramientas desde el FAB de Hank
// Permite abrir modales de cualquier módulo desde el botón flotante
// ============================================================================

type Listener = () => void;

const listeners: Record<string, Set<Listener>> = {
  shop: new Set(),
  gym_structure: new Set(),
  meals: new Set(),
  stack: new Set(),
  notes: new Set(),
};

// Eventos pendientes: si se emite y no hay listeners, se guarda para ejecución
// inmediata cuando alguien se suscriba (ej: gym_structure al navegar al tab)
const pending: Record<string, boolean> = {};

export type HankToolType = 'shop' | 'gym_structure' | 'meals' | 'stack' | 'notes';

export const hankToolsEvent = {
  /** Suscribirse a un evento de herramienta */
  subscribe(tool: HankToolType, fn: Listener) {
    listeners[tool].add(fn);
    // Si hay un evento pendiente, ejecutarlo de inmediato
    if (pending[tool]) {
      delete pending[tool];
      fn();
    }
    return () => {
      listeners[tool].delete(fn);
    };
  },

  /** Emitir apertura de herramienta */
  open(tool: HankToolType) {
    if (listeners[tool].size > 0) {
      listeners[tool].forEach((fn) => fn());
    } else {
      // Guardar como pendiente para cuando se monte el componente
      pending[tool] = true;
    }
  },
};
