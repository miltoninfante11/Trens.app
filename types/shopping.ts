// ============================================================================
// SHOPPING LIST TYPES - Lista de Compras
// ============================================================================

export type ShoppingPeriod = 'today' | '3days' | 'week' | 'custom';

export type IngredientCategory =
  | 'PROTEINAS'
  | 'VEGETALES'
  | 'CARBOHIDRATOS'
  | 'GRASAS'
  | 'LACTEOS'
  | 'FRUTAS'
  | 'CONDIMENTOS'
  | 'OTROS';

export interface ShoppingIngredient {
  id: string;
  name: string;
  normalizedName: string; // Nombre normalizado para agrupar
  quantity: string;
  quantityGrams: number; // Cantidad en gramos para sumar
  units?: number; // Cantidad en unidades (huevos, etc.)
  isUnit?: boolean; // true si se muestra en unidades
  category: IngredientCategory;
  mealIds: string[]; // IDs de comidas que usan este ingrediente
  mealNames: string[]; // Nombres de comidas para referencia
  isChecked: boolean;
}

export interface ShoppingCategory {
  category: IngredientCategory;
  icon: string;
  color: string;
  items: ShoppingIngredient[];
  totalItems: number;
  checkedItems: number;
}

export interface ShoppingList {
  period: ShoppingPeriod;
  periodLabel: string;
  categories: ShoppingCategory[];
  totalItems: number;
  checkedItems: number;
  generatedAt: string;
}

// Mapeo de categorías a iconos y colores
export const CATEGORY_CONFIG: Record<
  IngredientCategory,
  { icon: string; color: string; label: string }
> = {
  PROTEINAS: { icon: '🥩', color: '#DC2626', label: 'Proteínas' },
  VEGETALES: { icon: '🥬', color: '#22C55E', label: 'Vegetales' },
  CARBOHIDRATOS: { icon: '🍚', color: '#F59E0B', label: 'Carbohidratos' },
  GRASAS: { icon: '🧈', color: '#3B82F6', label: 'Grasas y Aceites' },
  LACTEOS: { icon: '🥛', color: '#E5E7EB', label: 'Lácteos' },
  FRUTAS: { icon: '🍎', color: '#EC4899', label: 'Frutas' },
  CONDIMENTOS: { icon: '🧂', color: '#8B5CF6', label: 'Condimentos' },
  OTROS: { icon: '📦', color: '#6B7280', label: 'Otros' },
};
