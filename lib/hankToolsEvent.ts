// ============================================================================
// HANK TOOLS EVENT - Emitter para abrir herramientas desde el FAB de Hank
// Permite abrir modales de cualquier módulo desde el botón flotante.
// Soporta payload opcional para deep-linking (ej: abrir shop en MI STACK
// o sobre un producto específico).
// ============================================================================

export interface ShopOpenPayload {
  /** Vista inicial dentro del shop. */
  view?: 'catalog' | 'mystack';
  /** Producto a seleccionar al abrir (deep-link desde Stack timeline). */
  productId?: string;
}

export type HankToolPayload = ShopOpenPayload | Record<string, any> | undefined;
type Listener = (payload?: HankToolPayload) => void;

const listeners: Record<string, Set<Listener>> = {
  shop: new Set(),
  gym_structure: new Set(),
  meals: new Set(),
  stack: new Set(),
  notes: new Set(),
};

// Eventos pendientes: si se emite y no hay listeners, se guarda para ejecución
// inmediata cuando alguien se suscriba (ej: gym_structure al navegar al tab)
const pending: Record<string, HankToolPayload | true> = {};

export type HankToolType = 'shop' | 'gym_structure' | 'meals' | 'stack' | 'notes';

export const hankToolsEvent = {
  /** Suscribirse a un evento de herramienta */
  subscribe(tool: HankToolType, fn: Listener) {
    listeners[tool].add(fn);
    // Si hay un evento pendiente, ejecutarlo de inmediato
    if (pending[tool] !== undefined) {
      const payload = pending[tool];
      delete pending[tool];
      fn(payload === true ? undefined : (payload as HankToolPayload));
    }
    return () => {
      listeners[tool].delete(fn);
    };
  },

  /** Emitir apertura de herramienta con payload opcional */
  open(tool: HankToolType, payload?: HankToolPayload) {
    if (listeners[tool].size > 0) {
      listeners[tool].forEach((fn) => fn(payload));
    } else {
      // Guardar como pendiente para cuando se monte el componente
      pending[tool] = payload === undefined ? true : payload;
    }
  },
};
