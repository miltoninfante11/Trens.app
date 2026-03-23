// ============================================================================
// INGREDIENT ANALYZER - Análisis híbrido (local + IA)
// Detecta balance nutricional, usa IA para ingredientes no reconocidos
// ============================================================================

export interface TargetMacros {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface IngredientAnalysis {
  isBalanced: boolean;
  hasProtein: boolean;
  hasCarbs: boolean;
  hasFat: boolean;
  hasUnhealthyOnly: boolean;
  suggestions: string[];
  warnings: string[];
  usedAI?: boolean;
  unrecognizedIngredients?: string[];
  // Nuevos campos para mostrar estimación
  estimatedMacros?: {
    protein: number;
    carbs: number;
    fat: number;
    calories: number;
  };
  targetMacros?: TargetMacros;
  macroFitMessage?: string;
}

interface SimpleIngredient {
  name: string;
}

interface AnalyzeOptions {
  targetMacros?: TargetMacros;
}

// ============================================================================
// KEYWORDS - Expandido con términos latinoamericanos
// ============================================================================
const PROTEIN_KEYWORDS = [
  // Aves
  'pollo',
  'pechuga',
  'muslo',
  'ala',
  'pavo',
  'pavita',
  'gallina',
  // Carnes rojas
  'carne',
  'res',
  'bistec',
  'bisteck',
  'filete',
  'lomo',
  'asado',
  'bife',
  'cerdo',
  'chuleta',
  'costilla',
  'cordero',
  'ternera',
  'cabrito',
  // Carnes exóticas/regionales
  'cuy',
  'cuye',
  'alpaca',
  'llama',
  'venado',
  'conejo',
  'pato',
  'codorniz',
  'chancho',
  // Carnes procesadas
  'jamón',
  'jamon',
  'tocino',
  'bacon',
  'salchicha',
  'chorizo',
  'longaniza',
  'cecina',
  'charqui',
  'chalona',
  // Pescados y mariscos
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
  'sardina',
  'anchoa',
  'bonito',
  'jurel',
  'pejerrey',
  'lenguado',
  'ceviche',
  'camarón',
  'camaron',
  'camarones',
  'langosta',
  'langostino',
  'pulpo',
  'calamar',
  'mariscos',
  'ostión',
  'ostion',
  'almeja',
  'mejillón',
  'mejillon',
  'conchas negras',
  'choros',
  'cangrejo',
  // Huevos
  'huevo',
  'huevos',
  'claras',
  'clara',
  'yema',
  // Lácteos proteicos
  'queso',
  'requesón',
  'requeson',
  'cottage',
  'yogur',
  'yogurt',
  'leche',
  'suero',
  'whey',
  'caseína',
  'caseina',
  // Legumbres
  'frijol',
  'frijoles',
  'lentejas',
  'lenteja',
  'garbanzos',
  'garbanzo',
  'habas',
  'alubias',
  'porotos',
  'caraotas',
  'edamame',
  'pallares',
  'tarwi',
  'chocho',
  // Proteínas vegetales
  'tofu',
  'tempeh',
  'seitan',
  'soya',
  'soja',
  'proteína',
  'proteina',
  // Otros
  'hígado',
  'higado',
  'mollejas',
  'menudo',
  'mondongo',
  'anticucho',
  'rachi',
];

const CARB_KEYWORDS = [
  // Granos
  'arroz',
  'pasta',
  'espagueti',
  'fideos',
  'macarrones',
  'tallarines',
  'pan',
  'tortilla',
  'arepa',
  'empanada',
  'tamal',
  'pupusa',
  'avena',
  'quinoa',
  'quinua',
  'cebada',
  'trigo',
  'centeno',
  'maíz',
  'maiz',
  'elote',
  'choclo',
  'mazorca',
  // Tubérculos
  'papa',
  'papas',
  'patata',
  'patatas',
  'camote',
  'boniato',
  'batata',
  'yuca',
  'yuka',
  'mandioca',
  'ñame',
  'name',
  'malanga',
  'taro',
  'plátano',
  'platano',
  'platanos',
  'plátanos',
  'verde',
  'maduro',
  // Tubérculos andinos
  'oca',
  'olluco',
  'ulluco',
  'mashua',
  'maca',
  'chuño',
  'tunta',
  'moraya',
  // Cereales
  'cereal',
  'granola',
  'muesli',
  'hojuelas',
  'corn flakes',
  'kiwicha',
  'cañihua',
  'canihua',
  // Frutas (carbohidratos naturales)
  'fruta',
  'frutas',
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
  'melocoton',
  'ciruela',
  'higo',
  'chirimoya',
  'lúcuma',
  'lucuma',
  'granadilla',
  'maracuyá',
  'maracuya',
  'aguaymanto',
  'camu camu',
  // Legumbres (también carbohidratos)
  'frijol',
  'lentejas',
  'garbanzos',
  // Panes y harinas
  'harina',
  'galleta',
  'crackers',
  'tostada',
  'bagel',
  'croissant',
];

const FAT_KEYWORDS = [
  // Aceites
  'aceite',
  'oliva',
  'aceite de oliva',
  'aceite de coco',
  'aceite vegetal',
  // Aguacate
  'aguacate',
  'palta',
  'guacamole',
  // Frutos secos
  'nueces',
  'nuez',
  'almendras',
  'almendra',
  'cacahuate',
  'cacahuetes',
  'maní',
  'mani',
  'pistachos',
  'pistacho',
  'avellanas',
  'avellana',
  'castañas',
  'castanas',
  'macadamia',
  'pecanas',
  'pecana',
  // Semillas
  'semillas',
  'chía',
  'chia',
  'linaza',
  'girasol',
  'calabaza',
  'sésamo',
  'sesamo',
  // Grasas animales
  'mantequilla',
  'manteca',
  'tocino',
  'bacon',
  'chicharrón',
  'chicharron',
  'crema',
  'nata',
  // Otros
  'aceitunas',
  'olivas',
  'coco',
  'chocolate negro',
  'mayonesa',
  'aderezo',
];

const UNHEALTHY_KEYWORDS = [
  // Azúcares
  'azúcar',
  'azucar',
  'miel',
  'jarabe',
  'sirope',
  'caramelo',
  'dulce',
  'dulces',
  'golosina',
  'golosinas',
  'bombón',
  'bombon',
  // Bebidas
  'refresco',
  'soda',
  'gaseosa',
  'coca',
  'pepsi',
  'sprite',
  'jugo procesado',
  'néctar',
  'nectar',
  // Postres y snacks
  'pastel',
  'torta',
  'bizcocho',
  'galletas dulces',
  'helado',
  'nieve',
  'donut',
  'dona',
  'churro',
  'churros',
  'pan dulce',
  'conchas',
  'chocolate con leche',
  'chocolatina',
  // Frituras y procesados
  'papas fritas',
  'frituras',
  'churritos',
  'cheetos',
  'doritos',
  'comida rápida',
  'fast food',
  'hamburguesa procesada',
  // Otros
  'margarina',
  'manteca vegetal',
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
  'pimenton',
  'cebolla',
  'ajo',
  'apio',
  'berenjena',
  'calabacín',
  'calabacin',
  'calabaza',
  'chayote',
  'ejotes',
  'judías',
  'judias',
  'habichuelas',
  'champiñones',
  'champinones',
  'hongos',
  'setas',
  'rábano',
  'rabano',
  'betabel',
  'remolacha',
  'nabo',
  'alcachofa',
  'espárragos',
  'esparragos',
  'nopal',
  'palmito',
  'ensalada',
  'verduras',
  'vegetales',
];

// Combinar todas las keywords para detectar ingredientes no reconocidos
const ALL_KNOWN_KEYWORDS = [
  ...PROTEIN_KEYWORDS,
  ...CARB_KEYWORDS,
  ...FAT_KEYWORDS,
  ...UNHEALTHY_KEYWORDS,
  ...VEGETABLE_KEYWORDS,
];

// ============================================================================
// GEMINI API CONFIG (para análisis con IA)
// ============================================================================
const GEMINI_API_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

// ============================================================================
// HELPER: Detectar ingredientes no reconocidos
// ============================================================================
const getUnrecognizedIngredients = (ingredients: SimpleIngredient[]): string[] => {
  const unrecognized: string[] = [];

  for (const ing of ingredients) {
    const name = ing.name.toLowerCase().trim();
    if (name.length < 3) continue; // Ignorar nombres muy cortos

    // Verificar si alguna keyword conocida está en el nombre
    const isRecognized = ALL_KNOWN_KEYWORDS.some((keyword) => {
      return name.includes(keyword) || keyword.includes(name);
    });

    if (!isRecognized) {
      unrecognized.push(ing.name);
    }
  }

  return unrecognized;
};

// ============================================================================
// ANALYZER FUNCTION (Local)
// ============================================================================
export const analyzeIngredientsLocally = (ingredients: SimpleIngredient[]): IngredientAnalysis => {
  const names = ingredients.map((i) => i.name.toLowerCase().trim()).join(' ');

  // Función helper para buscar coincidencias
  const hasKeyword = (keywords: string[]): boolean => {
    return keywords.some((keyword) => {
      // Buscar palabra completa o al inicio/final de palabra
      const regex = new RegExp(`(^|\\s|,)${keyword}($|\\s|,|s)`, 'i');
      return regex.test(names) || names.includes(keyword);
    });
  };

  const hasProtein = hasKeyword(PROTEIN_KEYWORDS);
  const hasCarbs = hasKeyword(CARB_KEYWORDS);
  const hasFat = hasKeyword(FAT_KEYWORDS);
  const hasUnhealthy = hasKeyword(UNHEALTHY_KEYWORDS);
  const hasVegetables = hasKeyword(VEGETABLE_KEYWORDS);

  // Detectar ingredientes no reconocidos
  const unrecognized = getUnrecognizedIngredients(ingredients);

  const suggestions: string[] = [];
  const warnings: string[] = [];

  // Verificar si solo hay ingredientes no saludables
  const hasOnlyUnhealthy = hasUnhealthy && !hasProtein && !hasCarbs && !hasFat && !hasVegetables;

  if (hasOnlyUnhealthy) {
    warnings.push('⚠️ Solo detecté ingredientes con bajo valor nutricional');
    suggestions.push('Agrega proteína: pollo, pavita, pescado, huevo');
    suggestions.push('Incluye carbohidratos: arroz, papa, yuca, avena');
  } else {
    if (!hasProtein) {
      suggestions.push('🥩 Falta proteína: pollo, bistec, pescado, huevo, tofu');
    }
    if (!hasCarbs && !hasVegetables) {
      suggestions.push('🍚 Falta carbohidrato: arroz, papa, yuca, choclo, avena');
    }
    // ESTRICTO CON GRASAS - Siempre advertir si no hay fuente de grasa
    if (!hasFat) {
      warnings.push('⚠️ Sin fuente de grasa - Se aumentarán otros ingredientes');
      suggestions.push('🥑 Añade grasa: palta, aceite oliva, almendras, nueces');
    }
    if (hasUnhealthy) {
      warnings.push('Contiene ingredientes altos en azúcar o procesados');
    }
  }

  // ESTRICTO: Solo balanceado si tiene los 3 macros principales
  const isBalanced = hasProtein && (hasCarbs || hasVegetables) && hasFat && !hasOnlyUnhealthy;

  return {
    isBalanced,
    hasProtein,
    hasCarbs: hasCarbs || hasVegetables,
    hasFat,
    hasUnhealthyOnly: hasOnlyUnhealthy,
    suggestions,
    warnings,
    unrecognizedIngredients: unrecognized,
  };
};

// ============================================================================
// AI ANALYZER FUNCTION (Gemini)
// ============================================================================
export const analyzeIngredientsWithAI = async (
  ingredients: SimpleIngredient[]
): Promise<IngredientAnalysis> => {
  const apiKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY;

  if (!apiKey) {
    console.warn('No Gemini API key, falling back to local analysis');
    return analyzeIngredientsLocally(ingredients);
  }

  const ingredientNames = ingredients.map((i) => i.name).join(', ');

  const prompt = `Analiza estos ingredientes de comida y clasifícalos nutricionalmente.
Ingredientes: ${ingredientNames}

Responde SOLO con un JSON válido (sin markdown, sin explicaciones):
{
  "hasProtein": boolean,
  "hasCarbs": boolean,
  "hasFat": boolean,
  "hasUnhealthy": boolean,
  "isBalanced": boolean,
  "suggestions": ["sugerencia1", "sugerencia2"],
  "warnings": ["advertencia1"]
}

Reglas:
- hasProtein: true si hay carne, pescado, huevo, legumbres, lácteos, etc.
- hasCarbs: true si hay cereales, tubérculos, frutas, etc.
- hasFat: true si hay aceites, frutos secos, aguacate, etc.
- hasUnhealthy: true si hay azúcar, frituras, ultraprocesados
- isBalanced: true si tiene proteína + (carbos o grasas) y no es solo comida chatarra
- suggestions: qué macros faltan (máximo 2)
- warnings: si hay ingredientes no saludables (máximo 1)`;

  try {
    const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 500,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.status}`);
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    // Limpiar el texto y parsear JSON
    const cleanJson = text.replace(/```json\n?|\n?```/g, '').trim();
    const result = JSON.parse(cleanJson);

    return {
      isBalanced: result.isBalanced ?? false,
      hasProtein: result.hasProtein ?? false,
      hasCarbs: result.hasCarbs ?? false,
      hasFat: result.hasFat ?? false,
      hasUnhealthyOnly: result.hasUnhealthy && !result.hasProtein && !result.hasCarbs,
      suggestions: result.suggestions || [],
      warnings: result.warnings || [],
      usedAI: true,
    };
  } catch (error) {
    console.error('Error en análisis con IA:', error);
    return analyzeIngredientsLocally(ingredients);
  }
};

// ============================================================================
// SMART ANALYZER - Usa local primero, IA si hay ingredientes desconocidos
// Ahora con soporte para macros objetivo
// ============================================================================
export const analyzeIngredientsSmart = async (
  ingredients: SimpleIngredient[],
  options?: AnalyzeOptions
): Promise<IngredientAnalysis> => {
  // Primero análisis local
  const localResult = analyzeIngredientsLocally(ingredients);

  let result = localResult;

  // Si hay ingredientes no reconocidos, usar IA
  if (localResult.unrecognizedIngredients && localResult.unrecognizedIngredients.length > 0) {
    console.warn('🤖 Ingredientes no reconocidos, usando IA:', localResult.unrecognizedIngredients);
    result = await analyzeIngredientsWithAI(ingredients);
  }

  // Si tenemos macros objetivo, generar mensaje de ajuste
  if (options?.targetMacros) {
    const target = options.targetMacros;
    result.targetMacros = target;

    // Crear mensaje informativo
    if (result.isBalanced) {
      result.macroFitMessage = `Objetivo: ${target.protein}P · ${target.carbs}C · ${target.fat}G`;
    } else if (!result.hasProtein) {
      result.macroFitMessage = `Faltan ~${target.protein}g de proteína para objetivo`;
    } else if (!result.hasCarbs) {
      result.macroFitMessage = `Considera agregar carbos (~${target.carbs}g objetivo)`;
    }
  }

  return result;
};

export default analyzeIngredientsLocally;
