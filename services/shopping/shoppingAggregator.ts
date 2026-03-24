// ============================================================================
// SHOPPING AGGREGATOR SERVICE - Agregación de ingredientes para lista de compras
// Combina ingredientes de múltiples comidas, normaliza y categoriza
// ============================================================================

import {
  ShoppingPeriod,
  ShoppingIngredient,
  ShoppingCategory,
  ShoppingList,
  IngredientCategory,
  CATEGORY_CONFIG,
} from '../../types/shopping';

// ============================================================================
// INGREDIENT CATEGORIZATION KEYWORDS
// Basado en ingredientAnalyzer.ts pero expandido para categorización
// ============================================================================

const PROTEIN_KEYWORDS = [
  'pollo',
  'pechuga',
  'muslo',
  'pavo',
  'pavita',
  'gallina',
  'carne',
  'res',
  'bistec',
  'filete',
  'lomo',
  'asado',
  'bife',
  'cerdo',
  'chuleta',
  'costilla',
  'cordero',
  'ternera',
  'jamón',
  'jamon',
  'tocino',
  'bacon',
  'salchicha',
  'chorizo',
  'pescado',
  'atún',
  'atun',
  'salmón',
  'salmon',
  'tilapia',
  'trucha',
  'corvina',
  'robalo',
  'mero',
  'bacalao',
  'camarón',
  'camaron',
  'camarones',
  'langosta',
  'langostino',
  'pulpo',
  'calamar',
  'mariscos',
  'huevo',
  'huevos',
  'claras',
  'clara',
  'tofu',
  'tempeh',
  'seitan',
  'proteína',
  'proteina',
  'whey',
];

const VEGETABLE_KEYWORDS = [
  'lechuga',
  'espinaca',
  'espinacas',
  'kale',
  'acelga',
  'col',
  'repollo',
  'brócoli',
  'brocoli',
  'coliflor',
  'zanahoria',
  'zanahorias',
  'tomate',
  'jitomate',
  'pepino',
  'pimiento',
  'pimentón',
  'cebolla',
  'ajo',
  'apio',
  'berenjena',
  'calabacín',
  'calabacin',
  'chayote',
  'ejotes',
  'judías',
  'habichuelas',
  'champiñones',
  'champinones',
  'hongos',
  'setas',
  'espárragos',
  'esparragos',
  'nopal',
  'palmito',
  'ensalada',
  'verduras',
  'vegetales',
  'rúcula',
  'rucula',
  'berro',
  'cilantro',
  'perejil',
  'albahaca',
];

const CARB_KEYWORDS = [
  'arroz',
  'pasta',
  'espagueti',
  'fideos',
  'macarrones',
  'tallarines',
  'pan',
  'tortilla',
  'arepa',
  'avena',
  'quinoa',
  'quinua',
  'cebada',
  'trigo',
  'maíz',
  'maiz',
  'elote',
  'choclo',
  'papa',
  'papas',
  'patata',
  'patatas',
  'camote',
  'batata',
  'yuca',
  'plátano',
  'platano',
  'cereal',
  'granola',
  'harina',
  'galleta',
  'crackers',
  'frijol',
  'frijoles',
  'lentejas',
  'garbanzos',
  'habas',
  'alubias',
  'porotos',
];

const FAT_KEYWORDS = [
  'aceite',
  'oliva',
  'aceite de oliva',
  'aceite de coco',
  'aguacate',
  'palta',
  'guacamole',
  'nueces',
  'nuez',
  'almendras',
  'almendra',
  'cacahuate',
  'maní',
  'mani',
  'pistachos',
  'avellanas',
  'pecanas',
  'macadamia',
  'semillas',
  'chía',
  'chia',
  'linaza',
  'sésamo',
  'sesamo',
  'mantequilla',
  'manteca',
  'crema',
  'nata',
  'mayonesa',
  'aceitunas',
  'olivas',
  'coco',
];

const DAIRY_KEYWORDS = [
  'leche',
  'queso',
  'requesón',
  'requeson',
  'cottage',
  'yogur',
  'yogurt',
  'crema',
  'nata',
  'mantequilla',
  'suero',
  'caseína',
  'caseina',
  'mozzarella',
  'parmesano',
  'cheddar',
  'gouda',
  'feta',
  'panela',
  'oaxaca',
];

const FRUIT_KEYWORDS = [
  'manzana',
  'banana',
  'banano',
  'pera',
  'naranja',
  'mandarina',
  'uva',
  'uvas',
  'mango',
  'piña',
  'papaya',
  'sandía',
  'sandia',
  'melón',
  'melon',
  'fresa',
  'fresas',
  'mora',
  'arándano',
  'arandano',
  'kiwi',
  'durazno',
  'melocotón',
  'ciruela',
  'higo',
  'chirimoya',
  'maracuyá',
  'maracuya',
  'limón',
  'limon',
  'lima',
  'toronja',
  'pomelo',
  'coco',
];

const CONDIMENT_KEYWORDS = [
  'sal',
  'pimienta',
  'orégano',
  'oregano',
  'comino',
  'curry',
  'paprika',
  'páprika',
  'salsa',
  'mostaza',
  'ketchup',
  'soya',
  'soja',
  'vinagre',
  'especias',
  'hierbas',
  'canela',
  'clavo',
  'nuez moscada',
  'chile',
  'chiles',
  'jalapeño',
  'jalapeno',
  'habanero',
  'serrano',
  'ají',
  'aji',
  'rocoto',
  'panca',
  'amarillo',
];

// ============================================================================
// HELPER: Categorizar un ingrediente
// ============================================================================
function categorizeIngredient(name: string): IngredientCategory {
  const lowerName = name.toLowerCase().trim();

  // Verificar cada categoría en orden de prioridad
  const checks: [string[], IngredientCategory][] = [
    [PROTEIN_KEYWORDS, 'PROTEINAS'],
    [VEGETABLE_KEYWORDS, 'VEGETALES'],
    [DAIRY_KEYWORDS, 'LACTEOS'],
    [FRUIT_KEYWORDS, 'FRUTAS'],
    [CARB_KEYWORDS, 'CARBOHIDRATOS'],
    [FAT_KEYWORDS, 'GRASAS'],
    [CONDIMENT_KEYWORDS, 'CONDIMENTOS'],
  ];

  for (const [keywords, category] of checks) {
    if (keywords.some((kw) => lowerName.includes(kw) || kw.includes(lowerName))) {
      return category;
    }
  }

  return 'OTROS';
}

// ============================================================================
// HELPER: Normalizar nombre de ingrediente
// ============================================================================
function normalizeIngredientName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remover acentos
    .replace(/s$/, '') // Remover plural simple
    .replace(/es$/, ''); // Remover plural -es
}

// ============================================================================
// UNIT-BASED INGREDIENTS - Ingredientes que se cuentan por unidad
// ============================================================================
const UNIT_INGREDIENTS = [
  'huevo',
  'huevos',
  'clara',
  'claras',
  'tortilla',
  'tortillas',
  'arepa',
  'arepas',
  'rebanada',
  'rebanadas',
  'pan',
  'banana',
  'banano',
  'plátano',
  'platano',
  'manzana',
  'pera',
  'naranja',
  'mandarina',
  'kiwi',
  'durazno',
  'melocotón',
  'limón',
  'limon',
  'lima',
  'toronja',
  'aguacate',
  'palta',
  'papa',
  'papas',
  'patata',
  'patatas',
  'camote',
  'batata',
  'salchicha',
  'salchichas',
  'filete',
  'filetes',
  'chuleta',
  'chuletas',
  'diente',
  'dientes',
  'ajo',
];

function isUnitIngredient(name: string): boolean {
  const lower = name.toLowerCase().trim();
  return UNIT_INGREDIENTS.some((kw) => lower.includes(kw));
}

// ============================================================================
// HELPER: Parsear cantidad
// Retorna { grams, units, isUnit }
// ============================================================================
interface ParsedQuantity {
  grams: number;
  units: number;
  isUnit: boolean;
}

function parseQuantity(quantity: string, ingredientName: string, portion?: string): ParsedQuantity {
  if (!quantity) return { grams: 100, units: 1, isUnit: false };

  const lower = quantity.toLowerCase();
  const numMatch = lower.match(/[\d.]+/);
  const num = numMatch ? parseFloat(numMatch[0]) : 1;

  // === PRIORIDAD 1: Leer unidades del campo portion si existe ===
  if (portion) {
    const portionLower = portion.toLowerCase().replace(/^~/, '').trim();
    const portionNumMatch = portionLower.match(/([\d.]+)/);
    let portionNum = portionNumMatch ? parseFloat(portionNumMatch[0]) : 1;

    // Convertir fracciones unicode
    if (portionLower.includes('¼')) portionNum = 0.25;
    else if (portionLower.includes('½')) portionNum = 0.5;
    else if (portionLower.includes('¾')) portionNum = 0.75;
    else if (portionLower.includes('⅓')) portionNum = 0.33;
    else if (portionLower.includes('⅔')) portionNum = 0.67;
    else if (portionLower.includes('1¼')) portionNum = 1.25;
    else if (portionLower.includes('1½')) portionNum = 1.5;
    else if (portionLower.includes('1¾')) portionNum = 1.75;
    else if (portionLower.includes('2¼')) portionNum = 2.25;
    else if (portionLower.includes('2½')) portionNum = 2.5;

    // Ingredientes que se cuentan por unidad desde portion
    const unitPortionWords = [
      'huevo',
      'huevos',
      'lata',
      'latas',
      'filete',
      'filetes',
      'pieza',
      'piezas',
      'rebanada',
      'rebanadas',
      'tortilla',
      'tortillas',
      'unidad',
      'unidades',
      'papa',
      'papas',
      'pechuga',
      'pechugas',
      'chuleta',
      'chuletas',
      'salchicha',
      'salchichas',
      'arepa',
      'arepas',
      'banana',
      'banano',
      'manzana',
      'naranja',
      'aguacate',
      'palta',
    ];

    if (unitPortionWords.some((w) => portionLower.includes(w))) {
      const units = portionNum || 1;
      return { grams: num, units, isUnit: true };
    }
  }

  // === PRIORIDAD 2: Detección por unidad explícita en quantity ===
  const isExplicitUnit = /unidad|pieza|pza|u\b|ud/.test(lower);
  const isIngUnit = isUnitIngredient(ingredientName);

  if (isExplicitUnit) {
    return { grams: num * 150, units: num, isUnit: true };
  }

  // Detectar unidad y convertir a gramos
  if (lower.includes('kg') || lower.includes('kilo')) {
    return { grams: num * 1000, units: num, isUnit: false };
  }
  if (lower.includes('lb') || lower.includes('libra')) {
    return { grams: num * 453.6, units: num, isUnit: false };
  }
  if (lower.includes('oz') || lower.includes('onza')) {
    return { grams: num * 28.35, units: num, isUnit: false };
  }
  if (lower.includes('taza') || lower.includes('cup')) {
    return { grams: num * 240, units: num, isUnit: false };
  }
  if (lower.includes('cucharada') || lower.includes('tbsp')) {
    return { grams: num * 15, units: num, isUnit: false };
  }
  if (lower.includes('cucharadita') || lower.includes('tsp')) {
    return { grams: num * 5, units: num, isUnit: false };
  }

  // Para ingredientes unitarios: convertir gramos a unidades aprox
  if (isIngUnit) {
    const gramsPerUnit = 60; // ~60g por huevo, ajustable
    if (lower.includes('g') || lower.includes('gramo') || lower.includes('gr')) {
      // Viene en gramos, convertir a unidades
      const estimatedUnits = Math.max(1, Math.round(num / gramsPerUnit));
      return { grams: num, units: estimatedUnits, isUnit: true };
    }
    // Sin unidad: tratar como número de unidades
    if (num <= 30) {
      return { grams: num * gramsPerUnit, units: num, isUnit: true };
    }
    // Número grande sin unidad: probablemente gramos
    const estimatedUnits = Math.max(1, Math.round(num / gramsPerUnit));
    return { grams: num, units: estimatedUnits, isUnit: true };
  }

  if (lower.includes('g') || lower.includes('gramo') || lower.includes('gr')) {
    return { grams: num, units: 0, isUnit: false };
  }

  return { grams: num || 100, units: 0, isUnit: false };
}

// ============================================================================
// HELPER: Formatear cantidad total
// ============================================================================
function formatTotalQuantity(grams: number, units: number, isUnit: boolean): string {
  const weightStr = grams >= 1000 ? `${(grams / 1000).toFixed(1)}kg` : `${Math.round(grams)}g`;
  if (isUnit && units > 0) {
    const u = Math.round(units);
    return `${u} ${u === 1 ? 'ud' : 'uds'} (${weightStr})`;
  }
  return weightStr;
}

// ============================================================================
// MAIN: Agregar ingredientes de comidas
// ============================================================================
export interface MealForShopping {
  id: string;
  name: string;
  selectedOption: number;
  options: {
    id: string;
    name: string;
    ingredients: {
      id: string;
      name: string;
      quantity: string;
      portion?: string;
    }[];
  }[];
}

export function aggregateIngredients(
  meals: MealForShopping[],
  period: ShoppingPeriod = 'today',
  daysMultiplier: number = 1
): ShoppingList {
  // Mapa para agrupar ingredientes por nombre normalizado
  const ingredientMap = new Map<string, ShoppingIngredient>();

  // Procesar cada comida
  for (const meal of meals) {
    // Obtener opción seleccionada
    const selectedOption = meal.options[meal.selectedOption] || meal.options[0];
    if (!selectedOption?.ingredients) continue;

    // Procesar cada ingrediente
    for (const ing of selectedOption.ingredients) {
      if (!ing.name || ing.name.trim().length < 2) continue;

      const normalizedName = normalizeIngredientName(ing.name);
      const parsed = parseQuantity(ing.quantity, ing.name, ing.portion);
      const quantityGrams = parsed.grams * daysMultiplier;
      const quantityUnits = parsed.units * daysMultiplier;

      if (ingredientMap.has(normalizedName)) {
        // Agregar a ingrediente existente
        const existing = ingredientMap.get(normalizedName)!;
        existing.quantityGrams += quantityGrams;
        if (parsed.isUnit) {
          existing.units = (existing.units || 0) + quantityUnits;
          existing.isUnit = true;
        }
        existing.quantity = formatTotalQuantity(
          existing.quantityGrams,
          existing.units || 0,
          existing.isUnit || false
        );
        if (!existing.mealIds.includes(meal.id)) {
          existing.mealIds.push(meal.id);
          existing.mealNames.push(meal.name);
        }
      } else {
        // Crear nuevo ingrediente (ID determinístico sin Date.now())
        ingredientMap.set(normalizedName, {
          id: `shop-${normalizedName}`,
          name: ing.name.charAt(0).toUpperCase() + ing.name.slice(1).toLowerCase(),
          normalizedName,
          quantity: formatTotalQuantity(quantityGrams, quantityUnits, parsed.isUnit),
          quantityGrams,
          units: quantityUnits,
          isUnit: parsed.isUnit,
          category: categorizeIngredient(ing.name),
          mealIds: [meal.id],
          mealNames: [meal.name],
          isChecked: false,
        });
      }
    }
  }

  // Agrupar por categoría
  const categoryMap = new Map<IngredientCategory, ShoppingIngredient[]>();
  const categoryOrder: IngredientCategory[] = [
    'PROTEINAS',
    'VEGETALES',
    'CARBOHIDRATOS',
    'FRUTAS',
    'LACTEOS',
    'GRASAS',
    'CONDIMENTOS',
    'OTROS',
  ];

  // Inicializar todas las categorías
  for (const cat of categoryOrder) {
    categoryMap.set(cat, []);
  }

  // Distribuir ingredientes
  for (const ing of ingredientMap.values()) {
    const items = categoryMap.get(ing.category) || [];
    items.push(ing);
    categoryMap.set(ing.category, items);
  }

  // Construir categorías finales (solo las que tienen items)
  const categories: ShoppingCategory[] = [];
  for (const cat of categoryOrder) {
    const items = categoryMap.get(cat) || [];
    if (items.length > 0) {
      // Ordenar items por cantidad (mayor primero)
      items.sort((a, b) => b.quantityGrams - a.quantityGrams);

      const config = CATEGORY_CONFIG[cat];
      categories.push({
        category: cat,
        icon: config.icon,
        color: config.color,
        items,
        totalItems: items.length,
        checkedItems: items.filter((i) => i.isChecked).length,
      });
    }
  }

  // Calcular totales
  const totalItems = Array.from(ingredientMap.values()).length;
  const checkedItems = Array.from(ingredientMap.values()).filter((i) => i.isChecked).length;

  // Label del periodo
  const periodLabels: Record<ShoppingPeriod, string> = {
    today: 'Hoy',
    '3days': 'Próximos 3 días',
    week: 'Esta semana',
    custom: 'Personalizado',
  };

  return {
    period,
    periodLabel: periodLabels[period],
    categories,
    totalItems,
    checkedItems,
    generatedAt: new Date().toISOString(),
  };
}

// ============================================================================
// HELPER: Generar texto plano de lista para compartir/copiar
// ============================================================================
export function shoppingListToText(list: ShoppingList): string {
  let text = `🛒 LISTA DE COMPRAS - ${list.periodLabel.toUpperCase()}\n`;
  text += `${'─'.repeat(40)}\n\n`;

  for (const category of list.categories) {
    text += `${category.icon} ${CATEGORY_CONFIG[category.category].label.toUpperCase()}\n`;
    for (const item of category.items) {
      const check = item.isChecked ? '✅' : '⬜';
      text += `  ${check} ${item.name}: ${item.quantity}\n`;
    }
    text += '\n';
  }

  text += `${'─'.repeat(40)}\n`;
  text += `📊 Total: ${list.totalItems} ingredientes\n`;
  text += `🗓️ Generado: ${new Date(list.generatedAt).toLocaleDateString('es-ES')}\n`;

  return text;
}

// ============================================================================
// HELPER: Generar resumen para HANK
// ============================================================================
export function shoppingListForHank(list: ShoppingList): string {
  let text = `🛒 LISTA DE COMPRAS (${list.periodLabel}):\n\n`;

  for (const category of list.categories) {
    text += `${category.icon} **${CATEGORY_CONFIG[category.category].label}:**\n`;
    const itemsList = category.items.map((item) => `• ${item.name}: ${item.quantity}`).join('\n');
    text += `${itemsList}\n\n`;
  }

  text += `📊 **Total:** ${list.totalItems} ingredientes`;

  return text;
}
