// ============================================================================
// INGREDIENT ANALYZER AI - Sistema Avanzado de Análisis Nutricional con IA
// Análisis profundo de ingredientes usando Gemini AI
// ============================================================================

// ============================================================================
// CONSTANTS
// ============================================================================
const GEMINI_API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY || '';
const GEMINI_API_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

// ============================================================================
// TYPES - Definiciones completas para análisis avanzado
// ============================================================================

/** Información nutricional detallada de un ingrediente */
export interface IngredientNutrition {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number;
  sugar?: number;
  sodium?: number;
  saturatedFat?: number;
}

/** Calidad nutricional del ingrediente */
export interface IngredientQuality {
  score: number; // 0-100
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  isOrganic?: boolean;
  isProcessed: boolean;
  processingLevel: 'minimal' | 'moderate' | 'ultra-processed';
  nutrientDensity: 'high' | 'medium' | 'low';
}

/** Información de alérgenos */
export interface AllergenInfo {
  hasAllergens: boolean;
  allergens: string[];
  crossContaminationRisk: string[];
  warnings: string[];
}

/** Sugerencia de sustitución */
export interface SubstitutionSuggestion {
  original: string;
  substitute: string;
  reason: string;
  macroImpact: {
    caloriesDiff: number;
    proteinDiff: number;
    carbsDiff: number;
    fatDiff: number;
  };
  healthScore: number; // -10 a +10 (negativo = peor, positivo = mejor)
}

/** Análisis de un ingrediente individual */
export interface SingleIngredientAnalysis {
  name: string;
  originalQuantity?: string;
  suggestedQuantity: string;
  nutrition: IngredientNutrition;
  quality: IngredientQuality;
  allergens: AllergenInfo;
  category: 'protein' | 'carb' | 'fat' | 'vegetable' | 'fruit' | 'dairy' | 'condiment' | 'other';
  benefits: string[];
  concerns: string[];
  bestTimeToEat?: 'pre-workout' | 'post-workout' | 'morning' | 'evening' | 'anytime';
  substitutions: SubstitutionSuggestion[];
}

/** Análisis completo de una comida */
export interface MealAnalysisResult {
  success: boolean;
  ingredients: SingleIngredientAnalysis[];
  totals: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    fiber: number;
  };
  mealQuality: {
    overallScore: number; // 0-100
    grade: 'A' | 'B' | 'C' | 'D' | 'F';
    balance: {
      proteinAdequate: boolean;
      carbsAdequate: boolean;
      fatAdequate: boolean;
      fiberAdequate: boolean;
    };
    macroRatio: {
      proteinPercent: number;
      carbsPercent: number;
      fatPercent: number;
    };
  };
  allergenSummary: {
    hasAllergens: boolean;
    allAllergens: string[];
    warnings: string[];
  };
  suggestions: {
    improvements: string[];
    warnings: string[];
    tips: string[];
  };
  timing: {
    bestMealTime: 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'pre-workout' | 'post-workout';
    digestionTime: string; // "1-2 horas"
    recommendation: string;
  };
  athleteOptimization?: {
    isOptimalForTraining: boolean;
    preWorkoutRating: number; // 1-10
    postWorkoutRating: number; // 1-10
    recoverySupport: number; // 1-10
    energyProvision: number; // 1-10
  };
}

/** Input para análisis */
export interface AnalyzeIngredientsInput {
  ingredients: Array<{
    name: string;
    quantity?: string;
  }>;
  userContext?: {
    goal?: string; // "GANAR MASA", "DEFINIR", "MANTENER"
    weight?: number;
    allergies?: string; // "lactosa, maní"
    mealType?: 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'pre-workout' | 'post-workout';
    targetMacros?: {
      calories: number;
      protein: number;
      carbs: number;
      fat: number;
    };
  };
}

// ============================================================================
// SYSTEM PROMPTS
// ============================================================================

const INGREDIENT_ANALYSIS_PROMPT = `Eres HANK, nutricionista deportivo de élite especializado en análisis preciso de ingredientes.
Tu misión es analizar ingredientes con precisión científica para atletas y deportistas.

CAPACIDADES:
1. Calcular macros exactos por ingrediente
2. Evaluar calidad nutricional (grado A-F)
3. Detectar alérgenos y advertencias
4. Sugerir sustituciones inteligentes
5. Optimizar para objetivos deportivos

REGLAS DE CÁLCULO:
- Base de datos: USDA, INCAP (Latinoamérica)
- Porciones: Usar medidas estándar de atleta (no porciones pequeñas)
- Proteína: Priorizar fuentes completas
- Carbos: Distinguir entre simples y complejos
- Grasas: Identificar perfil (saturadas, mono, poli)

CALIDAD NUTRICIONAL (A-F):
A (90-100): Alimento integral, alta densidad nutricional, mínimo procesamiento
B (75-89): Buena calidad, ligeramente procesado
C (60-74): Aceptable, procesamiento moderado
D (40-59): Bajo valor nutricional, alto procesamiento
F (0-39): Ultra-procesado, nutricionalmente vacío

DETECCIÓN DE ALÉRGENOS:
- Lácteos: leche, queso, yogurt, whey, caseína
- Gluten: trigo, cebada, centeno, avena (si no certifica libre)
- Frutos secos: maní, almendras, nueces, etc.
- Mariscos: camarones, langostinos, cangrejo
- Soya: tofu, tempeh, edamame, lecitina
- Huevo: huevos, mayonesa, algunos panes

RESPONDE EXACTAMENTE en este formato JSON (sin markdown):`;

const MEAL_ANALYSIS_JSON_SCHEMA = `{
  "ingredients": [
    {
      "name": "string",
      "suggestedQuantity": "string (ej: 150g)",
      "nutrition": {
        "calories": number,
        "protein": number,
        "carbs": number,
        "fat": number,
        "fiber": number,
        "sugar": number,
        "sodium": number,
        "saturatedFat": number
      },
      "quality": {
        "score": number (0-100),
        "grade": "A|B|C|D|F",
        "isProcessed": boolean,
        "processingLevel": "minimal|moderate|ultra-processed",
        "nutrientDensity": "high|medium|low"
      },
      "allergens": {
        "hasAllergens": boolean,
        "allergens": ["string"],
        "crossContaminationRisk": ["string"],
        "warnings": ["string"]
      },
      "category": "protein|carb|fat|vegetable|fruit|dairy|condiment|other",
      "benefits": ["string"],
      "concerns": ["string"],
      "bestTimeToEat": "pre-workout|post-workout|morning|evening|anytime",
      "substitutions": [
        {
          "substitute": "string",
          "reason": "string",
          "healthScore": number (-10 a +10)
        }
      ]
    }
  ],
  "totals": {
    "calories": number,
    "protein": number,
    "carbs": number,
    "fat": number,
    "fiber": number
  },
  "mealQuality": {
    "overallScore": number (0-100),
    "grade": "A|B|C|D|F",
    "balance": {
      "proteinAdequate": boolean,
      "carbsAdequate": boolean,
      "fatAdequate": boolean,
      "fiberAdequate": boolean
    },
    "macroRatio": {
      "proteinPercent": number,
      "carbsPercent": number,
      "fatPercent": number
    }
  },
  "allergenSummary": {
    "hasAllergens": boolean,
    "allAllergens": ["string"],
    "warnings": ["string"]
  },
  "suggestions": {
    "improvements": ["string"],
    "warnings": ["string"],
    "tips": ["string"]
  },
  "timing": {
    "bestMealTime": "breakfast|lunch|dinner|snack|pre-workout|post-workout",
    "digestionTime": "string",
    "recommendation": "string"
  },
  "athleteOptimization": {
    "isOptimalForTraining": boolean,
    "preWorkoutRating": number (1-10),
    "postWorkoutRating": number (1-10),
    "recoverySupport": number (1-10),
    "energyProvision": number (1-10)
  }
}`;

// ============================================================================
// MAIN ANALYSIS FUNCTION
// ============================================================================

/**
 * Analiza ingredientes de manera profunda usando Gemini AI
 * Retorna análisis nutricional completo, calidad, alérgenos y sugerencias
 */
export async function analyzeIngredientsAdvanced(
  input: AnalyzeIngredientsInput
): Promise<MealAnalysisResult> {
  // Validar input
  if (!input.ingredients || input.ingredients.length === 0) {
    return createEmptyResult('No se proporcionaron ingredientes');
  }

  // Si no hay API key, usar análisis básico
  if (!GEMINI_API_KEY) {
    console.warn('⚠️ GEMINI_API_KEY no configurada, usando análisis básico');
    return createBasicAnalysis(input);
  }

  try {
    // Construir prompt con contexto del usuario
    const ingredientList = input.ingredients
      .map((ing, i) => `${i + 1}. ${ing.name}${ing.quantity ? ` (${ing.quantity})` : ''}`)
      .join('\n');

    let userContextSection = '';
    if (input.userContext) {
      const ctx = input.userContext;
      userContextSection = `
CONTEXTO DEL ATLETA:
${ctx.goal ? `- Objetivo: ${ctx.goal}` : ''}
${ctx.weight ? `- Peso: ${ctx.weight}kg` : ''}
${ctx.allergies ? `- ⚠️ ALERGIAS: ${ctx.allergies}` : ''}
${ctx.mealType ? `- Tipo de comida: ${ctx.mealType}` : ''}
${ctx.targetMacros ? `- Macros objetivo: ${ctx.targetMacros.protein}P / ${ctx.targetMacros.carbs}C / ${ctx.targetMacros.fat}G` : ''}
`;
    }

    const fullPrompt = `${INGREDIENT_ANALYSIS_PROMPT}

INGREDIENTES A ANALIZAR:
${ingredientList}
${userContextSection}

FORMATO DE RESPUESTA (JSON puro, sin \`\`\`):
${MEAL_ANALYSIS_JSON_SCHEMA}

IMPORTANTE: 
- Si el usuario tiene ALERGIAS, marca los ingredientes que las contengan con warnings críticos
- Calcula cantidades para un atleta (no porciones mini)
- Incluye al menos 1 sustitución por ingrediente
- Sé específico con los beneficios para el deporte`;

    // Llamar a Gemini
    const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: fullPrompt }] }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 4096,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.status}`);
    }

    const data = await response.json();
    const textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    // Parsear JSON
    const jsonMatch = textResponse.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No se encontró JSON válido en la respuesta');
    }

    // Limpiar y parsear
    const cleanJson = jsonMatch[0]
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();

    const result = JSON.parse(cleanJson) as MealAnalysisResult;
    result.success = true;

    // Log para debugging
    console.warn(
      `✅ Análisis AI completado: ${result.ingredients.length} ingredientes, Score: ${result.mealQuality?.overallScore}`
    );

    return result;
  } catch (error) {
    console.error('❌ Error en análisis AI de ingredientes:', error);
    // Fallback a análisis básico
    return createBasicAnalysis(input);
  }
}

/**
 * Analiza un solo ingrediente de manera profunda
 */
export async function analyzeSingleIngredient(
  ingredientName: string,
  quantity?: string,
  userAllergies?: string
): Promise<SingleIngredientAnalysis | null> {
  const result = await analyzeIngredientsAdvanced({
    ingredients: [{ name: ingredientName, quantity }],
    userContext: userAllergies ? { allergies: userAllergies } : undefined,
  });

  if (result.success && result.ingredients.length > 0) {
    return result.ingredients[0];
  }
  return null;
}

/**
 * Obtiene sugerencias de sustitución para un ingrediente específico
 */
export async function getSubstitutionSuggestions(
  ingredientName: string,
  reason: 'healthier' | 'allergy' | 'cheaper' | 'available',
  userContext?: { allergies?: string; goal?: string }
): Promise<SubstitutionSuggestion[]> {
  if (!GEMINI_API_KEY) {
    return [];
  }

  const reasonPrompts = {
    healthier: 'alternativas más saludables con mejor perfil nutricional',
    allergy: 'alternativas que NO contengan los alérgenos del usuario',
    cheaper: 'alternativas más económicas con macros similares',
    available: 'alternativas comunes y fáciles de encontrar en Latinoamérica',
  };

  try {
    const prompt = `Sugiere 3 ${reasonPrompts[reason]} para reemplazar "${ingredientName}".
${userContext?.allergies ? `⚠️ ALERGIAS del usuario: ${userContext.allergies}` : ''}
${userContext?.goal ? `Objetivo: ${userContext.goal}` : ''}

Responde SOLO con JSON:
{
  "substitutions": [
    {
      "original": "${ingredientName}",
      "substitute": "nombre del sustituto",
      "reason": "por qué es mejor opción",
      "macroImpact": {
        "caloriesDiff": number,
        "proteinDiff": number,
        "carbsDiff": number,
        "fatDiff": number
      },
      "healthScore": number (-10 a +10)
    }
  ]
}`;

    const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 1024 },
      }),
    });

    if (!response.ok) throw new Error(`API error: ${response.status}`);

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return [];

    const parsed = JSON.parse(jsonMatch[0]);
    return parsed.substitutions || [];
  } catch (error) {
    console.error('Error obteniendo sustituciones:', error);
    return [];
  }
}

/**
 * Verifica si una lista de ingredientes contiene alérgenos específicos
 */
export async function checkAllergens(
  ingredients: Array<{ name: string }>,
  userAllergies: string
): Promise<{
  hasAllergens: boolean;
  problematicIngredients: Array<{
    ingredient: string;
    allergen: string;
    severity: 'high' | 'medium' | 'low';
  }>;
  safeAlternatives: Array<{
    original: string;
    alternative: string;
  }>;
}> {
  if (!GEMINI_API_KEY) {
    return { hasAllergens: false, problematicIngredients: [], safeAlternatives: [] };
  }

  const ingredientList = ingredients.map((i) => i.name).join(', ');

  try {
    const prompt = `Analiza estos ingredientes para detectar alérgenos.
INGREDIENTES: ${ingredientList}
ALERGIAS DEL USUARIO: ${userAllergies}

Responde SOLO con JSON:
{
  "hasAllergens": boolean,
  "problematicIngredients": [
    {
      "ingredient": "nombre del ingrediente",
      "allergen": "alérgeno detectado",
      "severity": "high|medium|low"
    }
  ],
  "safeAlternatives": [
    {
      "original": "ingrediente problemático",
      "alternative": "alternativa segura"
    }
  ]
}

SEVERIDAD:
- high: Contiene el alérgeno directamente
- medium: Puede contener trazas o derivados
- low: Riesgo de contaminación cruzada`;

    const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 1024 },
      }),
    });

    if (!response.ok) throw new Error(`API error: ${response.status}`);

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch)
      return { hasAllergens: false, problematicIngredients: [], safeAlternatives: [] };

    return JSON.parse(jsonMatch[0]);
  } catch (error) {
    console.error('Error verificando alérgenos:', error);
    return { hasAllergens: false, problematicIngredients: [], safeAlternatives: [] };
  }
}

/**
 * Genera un plan de comida optimizado basado en macros objetivo
 */
export async function optimizeMealForMacros(
  currentIngredients: Array<{ name: string; quantity?: string }>,
  targetMacros: { calories: number; protein: number; carbs: number; fat: number },
  userContext?: { allergies?: string; goal?: string }
): Promise<{
  optimizedIngredients: Array<{ name: string; quantity: string; adjusted: boolean }>;
  achievedMacros: { calories: number; protein: number; carbs: number; fat: number };
  accuracy: number; // 0-100%
  suggestions: string[];
}> {
  if (!GEMINI_API_KEY) {
    return {
      optimizedIngredients: currentIngredients.map((i) => ({
        name: i.name,
        quantity: i.quantity || '100g',
        adjusted: false,
      })),
      achievedMacros: targetMacros,
      accuracy: 0,
      suggestions: ['API key no disponible'],
    };
  }

  const ingredientList = currentIngredients
    .map((i) => `${i.name}${i.quantity ? ` (${i.quantity})` : ''}`)
    .join(', ');

  try {
    const prompt = `Optimiza las cantidades de estos ingredientes para alcanzar los macros objetivo.

INGREDIENTES ACTUALES: ${ingredientList}
MACROS OBJETIVO: ${targetMacros.calories}kcal | ${targetMacros.protein}g P | ${targetMacros.carbs}g C | ${targetMacros.fat}g G
${userContext?.allergies ? `ALERGIAS: ${userContext.allergies}` : ''}
${userContext?.goal ? `OBJETIVO: ${userContext.goal}` : ''}

Responde SOLO con JSON:
{
  "optimizedIngredients": [
    { "name": "ingrediente", "quantity": "Xg", "adjusted": boolean }
  ],
  "achievedMacros": {
    "calories": number,
    "protein": number,
    "carbs": number,
    "fat": number
  },
  "accuracy": number (0-100),
  "suggestions": ["sugerencia para mejorar"]
}`;

    const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 2048 },
      }),
    });

    if (!response.ok) throw new Error(`API error: ${response.status}`);

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in response');

    return JSON.parse(jsonMatch[0]);
  } catch (error) {
    console.error('Error optimizando macros:', error);
    return {
      optimizedIngredients: currentIngredients.map((i) => ({
        name: i.name,
        quantity: i.quantity || '100g',
        adjusted: false,
      })),
      achievedMacros: { calories: 0, protein: 0, carbs: 0, fat: 0 },
      accuracy: 0,
      suggestions: ['Error al optimizar'],
    };
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function createEmptyResult(message: string): MealAnalysisResult {
  return {
    success: false,
    ingredients: [],
    totals: { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 },
    mealQuality: {
      overallScore: 0,
      grade: 'F',
      balance: {
        proteinAdequate: false,
        carbsAdequate: false,
        fatAdequate: false,
        fiberAdequate: false,
      },
      macroRatio: { proteinPercent: 0, carbsPercent: 0, fatPercent: 0 },
    },
    allergenSummary: { hasAllergens: false, allAllergens: [], warnings: [message] },
    suggestions: { improvements: [], warnings: [message], tips: [] },
    timing: { bestMealTime: 'snack', digestionTime: 'N/A', recommendation: message },
  };
}

function createBasicAnalysis(input: AnalyzeIngredientsInput): MealAnalysisResult {
  // Análisis básico local cuando no hay API
  const ingredients: SingleIngredientAnalysis[] = input.ingredients.map((ing) => ({
    name: ing.name,
    originalQuantity: ing.quantity,
    suggestedQuantity: ing.quantity || '100g',
    nutrition: {
      calories: 100,
      protein: 5,
      carbs: 15,
      fat: 3,
      fiber: 2,
      sugar: 2,
      sodium: 100,
      saturatedFat: 1,
    },
    quality: {
      score: 50,
      grade: 'C',
      isProcessed: false,
      processingLevel: 'minimal',
      nutrientDensity: 'medium',
    },
    allergens: { hasAllergens: false, allergens: [], crossContaminationRisk: [], warnings: [] },
    category: 'other',
    benefits: ['Fuente de nutrientes básicos'],
    concerns: ['Análisis básico - usar API para datos precisos'],
    bestTimeToEat: 'anytime',
    substitutions: [],
  }));

  const totalCalories = ingredients.length * 100;

  return {
    success: true,
    ingredients,
    totals: {
      calories: totalCalories,
      protein: ingredients.length * 5,
      carbs: ingredients.length * 15,
      fat: ingredients.length * 3,
      fiber: ingredients.length * 2,
    },
    mealQuality: {
      overallScore: 50,
      grade: 'C',
      balance: {
        proteinAdequate: false,
        carbsAdequate: true,
        fatAdequate: true,
        fiberAdequate: false,
      },
      macroRatio: { proteinPercent: 20, carbsPercent: 60, fatPercent: 20 },
    },
    allergenSummary: {
      hasAllergens: false,
      allAllergens: [],
      warnings: ['Análisis básico - Conectar API para precisión'],
    },
    suggestions: {
      improvements: ['Conectar Gemini API para análisis preciso'],
      warnings: [],
      tips: ['Usa ingredientes variados para mejor nutrición'],
    },
    timing: {
      bestMealTime: 'lunch',
      digestionTime: '2-3 horas',
      recommendation: 'Comida estándar',
    },
  };
}

// ============================================================================
// EXPORT - Re-exportar funciones legacy para compatibilidad
// ============================================================================
export {
  analyzeIngredientsLocally,
  analyzeIngredientsWithAI,
  analyzeIngredientsSmart,
} from './ingredientAnalyzer';
