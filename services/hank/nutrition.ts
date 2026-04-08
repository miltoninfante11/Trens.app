// ============================================================================
// HANK NUTRITION SERVICE - Cálculo de macros con Gemini AI
// ============================================================================

const GEMINI_API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY || '';
const GEMINI_API_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

// ============================================================================
// TYPES
// ============================================================================
interface Ingredient {
  id: string;
  name: string;
  quantity: string;
  portion?: string;
  skipGrams?: boolean;
}

interface NutritionInfo {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  suggestedGrams: number;
}

interface CalculatedIngredient extends Ingredient {
  nutritionInfo?: NutritionInfo;
}

// ============================================================================
// SYSTEM PROMPT FOR NUTRITION CALCULATIONS
// ============================================================================
const NUTRITION_SYSTEM_PROMPT = `Eres HANK, un experto nutricionista deportivo de élite. Tu objetivo es calcular gramos precisos y macros para atletas.

REGLAS:
1. Para cada ingrediente, estima los gramos óptimos basándote en una comida balanceada de atleta (150-250g proteína, moderados carbos)
2. Si el ingrediente ya tiene cantidad/gramos, respétala
3. Si solo tiene nombre, calcula gramos típicos para un atleta
4. Prioriza proteínas magras y fuentes de calidad
5. Responde SOLO con JSON válido, sin markdown

FORMATO DE RESPUESTA (JSON puro):
{
  "ingredients": [
    {
      "name": "nombre del ingrediente",
      "suggestedGrams": 150,
      "portion": "aproximadamente 1 filete",
      "calories": 250,
      "protein": 35,
      "carbs": 0,
      "fat": 8
    }
  ],
  "totalMeal": {
    "calories": 500,
    "protein": 45,
    "carbs": 30,
    "fat": 15
  }
}`;

// ============================================================================
// CALCULATE MACROS WITH AI
// ============================================================================
export async function calculateMacrosWithAI(
  ingredients: Ingredient[],
  userContext?: {
    goal?: string;
    weight?: number;
    mealCount?: number;
  }
): Promise<CalculatedIngredient[]> {
  if (!GEMINI_API_KEY) {
    console.warn('GEMINI_API_KEY not set, returning original ingredients');
    return ingredients.map((ing) => ({
      ...ing,
      quantity: ing.quantity || '~100g',
    }));
  }

  try {
    // Build prompt with user context
    let userMessage = `Calcula los gramos y macros para estos ingredientes de una comida de atleta:\n\n`;

    ingredients.forEach((ing, i) => {
      userMessage += `${i + 1}. ${ing.name}`;
      if (ing.quantity) userMessage += ` - Cantidad actual: ${ing.quantity}`;
      if (ing.portion) userMessage += ` (${ing.portion})`;
      userMessage += '\n';
    });

    if (userContext) {
      userMessage += `\nContexto del atleta:\n`;
      if (userContext.goal) userMessage += `- Objetivo: ${userContext.goal}\n`;
      if (userContext.weight) userMessage += `- Peso: ${userContext.weight}kg\n`;
      if (userContext.mealCount) userMessage += `- Comidas por día: ${userContext.mealCount}\n`;
    }

    // Call Gemini API
    const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [{ text: NUTRITION_SYSTEM_PROMPT + '\n\n' + userMessage }],
          },
        ],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 1024,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.status}`);
    }

    const data = await response.json();
    const textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    // Parse JSON response
    const jsonMatch = textResponse.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in response');
    }

    const parsed = JSON.parse(jsonMatch[0]);
    const calculatedIngredients = parsed.ingredients || [];

    // Map back to original ingredients with calculated values
    return ingredients.map((ing, index) => {
      const calculated = calculatedIngredients[index];
      if (calculated) {
        return {
          ...ing,
          quantity: `${calculated.suggestedGrams || 100}g`,
          portion: calculated.portion || ing.portion,
          nutritionInfo: {
            calories: calculated.calories || 0,
            protein: calculated.protein || 0,
            carbs: calculated.carbs || 0,
            fat: calculated.fat || 0,
            suggestedGrams: calculated.suggestedGrams || 100,
          },
        };
      }
      return { ...ing, quantity: ing.quantity || '~100g' };
    });
  } catch (error) {
    console.error('calculateMacrosWithAI error:', error);
    // Return original ingredients with placeholder
    return ingredients.map((ing) => ({
      ...ing,
      quantity: ing.quantity || '~100g',
    }));
  }
}

// ============================================================================
// SUGGEST MEAL OPTIONS WITH AI
// ============================================================================
export async function suggestMealAlternatives(
  currentIngredients: Ingredient[],
  preferences?: {
    avoidIngredients?: string[];
    preferredCuisine?: string;
    calorieTarget?: number;
  }
): Promise<{ name: string; ingredients: Ingredient[] }[]> {
  if (!GEMINI_API_KEY) {
    console.warn('GEMINI_API_KEY not set');
    return [];
  }

  try {
    const prompt = `Basándote en esta comida:
${currentIngredients.map((i) => `- ${i.name} (${i.quantity})`).join('\n')}

Sugiere 2 alternativas equivalentes en macros pero con diferentes ingredientes.
${preferences?.avoidIngredients ? `Evitar: ${preferences.avoidIngredients.join(', ')}` : ''}
${preferences?.preferredCuisine ? `Preferencia: ${preferences.preferredCuisine}` : ''}

Responde SOLO con JSON:
{
  "alternatives": [
    {
      "name": "Nombre de la alternativa",
      "ingredients": [
        { "name": "ingrediente", "quantity": "150g", "portion": "1 porción" }
      ]
    }
  ]
}`;

    const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 1024 },
      }),
    });

    if (!response.ok) throw new Error(`API error: ${response.status}`);

    const data = await response.json();
    const textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    const jsonMatch = textResponse.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return [];

    const parsed = JSON.parse(jsonMatch[0]);
    return (parsed.alternatives || []).map(
      (alt: {
        name: string;
        ingredients: { name: string; quantity: string; portion?: string }[];
      }) => ({
        name: alt.name,
        ingredients: alt.ingredients.map((ing, i) => ({
          id: `ai-${Date.now()}-${i}`,
          name: ing.name,
          quantity: ing.quantity,
          portion: ing.portion,
        })),
      })
    );
  } catch (error) {
    console.error('suggestMealAlternatives error:', error);
    return [];
  }
}

// ============================================================================
// ANALYZE DAILY NUTRITION
// ============================================================================
interface SimpleIngredient {
  name: string;
  quantity: string;
}

// ============================================================================
// USER PROFILE FOR MACROS CALCULATION - ULTRA PERSONALIZADO
// ============================================================================
interface BodyMeasurement {
  name: string;
  value: string;
  is_dominant?: boolean;
}

interface ProgressPhotoData {
  weight?: string;
  bodyFatPercentage?: number;
  date?: string;
}

interface UserMacroProfile {
  weight: string; // "80.5 KG"
  height: string; // "1.75 M"
  goal: string; // "GANAR MASA MUSCULAR", "DEFINIR", "MANTENER"
  activityLevel?: string; // "SEDENTARIO", "MODERADO", "ACTIVO", "MUY ACTIVO"
  mealCount?: number; // Número de comidas del usuario (opcional - si no hay, no divide)
  // Datos adicionales para ultra personalización
  age?: number; // Edad del usuario
  sex?: string; // "M", "F", "MASCULINO", "FEMENINO"
  bodyFatPercentage?: number; // % de grasa corporal
  muscleMass?: number; // kg de masa muscular
  trainingExperience?: string; // "PRINCIPIANTE", "INTERMEDIO", "AVANZADO"
  metabolicRate?: string; // "LENTO", "NORMAL", "RAPIDO"
  trainingDaysPerWeek?: number; // Días de entrenamiento por semana
  // Medidas corporales del usuario
  bodyMeasurements?: BodyMeasurement[];
  // Fotos de progreso más reciente (para usar datos actualizados)
  latestProgressPhoto?: ProgressPhotoData;
}

interface DailyMacros {
  totalCalories: number;
  totalProtein: number;
  totalCarbs: number;
  totalFat: number;
  perMeal?: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
  };
}

// ============================================================================
// CALCULATE USER DAILY MACROS - 100% IA PERSONALIZADA
// Ultra personalizado con Gemini AI basado en todas las métricas del usuario
// ============================================================================
export async function calculateUserDailyMacros(profile: UserMacroProfile): Promise<DailyMacros> {
  // Extraer valores numéricos para fallback
  const weightMatch = profile.weight.match(/(\d+\.?\d*)/);
  const weightKg = weightMatch ? parseFloat(weightMatch[1]) : 75;
  const mealCount = profile.mealCount && profile.mealCount > 0 ? profile.mealCount : undefined;

  // Si no hay API key, usar cálculo básico de fallback
  if (!GEMINI_API_KEY) {
    console.warn('GEMINI_API_KEY not set, using fallback calculation');
    return calculateFallbackMacros(weightKg, profile.goal, mealCount);
  }

  try {
    // Construir datos adicionales si existen
    let additionalData = '';
    if (profile.age) additionalData += `- Edad: ${profile.age} años\n`;
    if (profile.sex) additionalData += `- Sexo: ${profile.sex}\n`;
    if (profile.bodyFatPercentage)
      additionalData += `- Porcentaje de grasa corporal: ${profile.bodyFatPercentage}%\n`;
    if (profile.muscleMass) additionalData += `- Masa muscular: ${profile.muscleMass} kg\n`;
    if (profile.trainingExperience)
      additionalData += `- Experiencia de entrenamiento: ${profile.trainingExperience}\n`;
    if (profile.metabolicRate) additionalData += `- Metabolismo: ${profile.metabolicRate}\n`;
    if (profile.trainingDaysPerWeek)
      additionalData += `- Días de entrenamiento por semana: ${profile.trainingDaysPerWeek}\n`;

    // Construir medidas corporales si existen
    let bodyMeasurementsData = '';
    if (profile.bodyMeasurements && profile.bodyMeasurements.length > 0) {
      bodyMeasurementsData = '\nMEDIDAS CORPORALES:\n';
      profile.bodyMeasurements.forEach((m) => {
        const dominant = m.is_dominant ? ' 👑 (DOMINANTE)' : '';
        bodyMeasurementsData += `- ${m.name}: ${m.value}${dominant}\n`;
      });
    }

    // Construir datos de foto de progreso si existe
    let progressPhotoData = '';
    if (profile.latestProgressPhoto) {
      progressPhotoData = '\nÚLTIMO REGISTRO DE PROGRESO:\n';
      if (profile.latestProgressPhoto.weight)
        progressPhotoData += `- Peso registrado: ${profile.latestProgressPhoto.weight}\n`;
      if (profile.latestProgressPhoto.bodyFatPercentage)
        progressPhotoData += `- % Grasa registrado: ${profile.latestProgressPhoto.bodyFatPercentage}%\n`;
      if (profile.latestProgressPhoto.date)
        progressPhotoData += `- Fecha: ${profile.latestProgressPhoto.date}\n`;
    }

    // Determinar si calcular por comida o solo totales diarios
    const hasMeals = mealCount !== undefined;
    const mealCountInstruction = hasMeals
      ? `- Número de comidas planificadas: ${mealCount}`
      : `- SIN COMIDAS CONFIGURADAS: Calcular SOLO totales diarios objetivo`;

    const prompt = `Eres un nutricionista deportivo de ÉLITE con 20+ años de experiencia con atletas profesionales y culturistas.
Tu tarea es calcular los MACROS DIARIOS PERFECTOS de forma ULTRA PERSONALIZADA usando TODA la información disponible.

═══════════════════════════════════════════════════════════════════════════════
                           DATOS DEL CLIENTE
═══════════════════════════════════════════════════════════════════════════════
- Peso actual: ${profile.weight}
- Altura: ${profile.height}
- Objetivo principal: ${profile.goal}
- Nivel de actividad física: ${profile.activityLevel || 'MODERADO'}
${mealCountInstruction}
${additionalData ? `\nDATOS BIOMÉTRICOS:\n${additionalData}` : ''}${bodyMeasurementsData}${progressPhotoData}

═══════════════════════════════════════════════════════════════════════════════
                           INSTRUCCIONES CRÍTICAS
═══════════════════════════════════════════════════════════════════════════════
1. USA TODA LA INFORMACIÓN disponible para máxima personalización
2. Si tiene % de grasa corporal, calcula masa magra y ajusta proteína a esa base
3. Si tiene medidas corporales (cintura, cuello, cadera), puedes estimar % grasa con fórmula Navy
4. Si tiene experiencia de entrenamiento, ajusta expectativas y requerimientos
5. Si tiene metabolismo lento/rápido, ajusta calorías apropiadamente
6. Analiza las medidas para determinar tipo de cuerpo y ajustar macros

REGLAS DE CÁLCULO POR OBJETIVO:
• GANAR MASA/VOLUMEN:
  - Surplus: 10-15% si es principiante, 15-20% si es avanzado
  - Proteína: 2.0-2.2g por kg de peso (o 2.5-3g por kg de masa magra si disponible)
  - Carbos: 4-6g por kg para energía anabólica
  - Grasas: 0.8-1g por kg para hormonas

• DEFINIR/PERDER GRASA:
  - Déficit: 15-20% moderado, 20-25% agresivo
  - Proteína: 2.4-2.8g por kg (ALTA para preservar músculo)
  - Carbos: 2-3g por kg, priorizando pre/post entreno
  - Grasas: 0.6-0.8g por kg mínimo para hormonas

• MANTENER/RECOMPOSICIÓN:
  - Calorías de mantenimiento exactas
  - Proteína: 2.0-2.2g por kg
  - Distribución equilibrada de carbos y grasas

MATEMÁTICAS OBLIGATORIAS:
${hasMeals ? '- Los macros por comida × número de comidas = totales diarios EXACTOS' : '- Calcular SOLO macros totales diarios (sin dividir por comida)'}
- 1g proteína = 4 kcal, 1g carbos = 4 kcal, 1g grasa = 9 kcal
- Verifica que calorías = (proteína×4) + (carbos×4) + (grasa×9)
${progressPhotoData ? '- USA los datos del registro de progreso si son más recientes que el perfil' : ''}

═══════════════════════════════════════════════════════════════════════════════
                           RESPUESTA REQUERIDA
═══════════════════════════════════════════════════════════════════════════════
RESPONDE ÚNICAMENTE CON ESTE JSON (sin markdown, sin texto adicional):
${
  hasMeals
    ? `{
  "totalCalories": 2500,
  "totalProtein": 180,
  "totalCarbs": 250,
  "totalFat": 70,
  "perMeal": {
    "calories": 625,
    "protein": 45,
    "carbs": 62,
    "fat": 17
  },
  "reasoning": "Explicación técnica de 1-2 líneas de por qué estos macros específicos"
}`
    : `{
  "totalCalories": 2500,
  "totalProtein": 180,
  "totalCarbs": 250,
  "totalFat": 70,
  "reasoning": "Explicación técnica de 1-2 líneas de por qué estos macros específicos (sin perMeal porque no hay comidas configuradas)"
}`
}`;

    const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.2, // Bajo para consistencia
          maxOutputTokens: 512,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.status}`);
    }

    const data = await response.json();
    const textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    // Limpiar respuesta y extraer JSON
    let cleanedResponse = textResponse
      .replace(/```json/gi, '')
      .replace(/```/g, '')
      .trim();

    const jsonMatch = cleanedResponse.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in AI response');
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // Validar que tenemos todos los campos necesarios (perMeal solo si hay comidas)
    if (!parsed.totalCalories || !parsed.totalProtein) {
      throw new Error('Incomplete macro data from AI');
    }

    // Log solo en desarrollo
    if (__DEV__) {
      console.log('🧠 AI Macros:', parsed.reasoning || 'Calculado');
    }

    const result: DailyMacros = {
      totalCalories: Math.round(parsed.totalCalories),
      totalProtein: Math.round(parsed.totalProtein),
      totalCarbs: Math.round(parsed.totalCarbs || 0),
      totalFat: Math.round(parsed.totalFat || 0),
    };

    // Solo incluir perMeal si había comidas configuradas y la IA lo devolvió
    if (hasMeals && parsed.perMeal) {
      result.perMeal = {
        calories: Math.round(parsed.perMeal.calories),
        protein: Math.round(parsed.perMeal.protein),
        carbs: Math.round(parsed.perMeal.carbs || 0),
        fat: Math.round(parsed.perMeal.fat || 0),
      };
    }

    return result;
  } catch (error) {
    console.error('calculateUserDailyMacros AI error:', error);
    // Fallback a cálculo básico si falla la IA
    return calculateFallbackMacros(weightKg, profile.goal, mealCount);
  }
}

// ============================================================================
// FALLBACK CALCULATION (sin IA)
// Solo se usa si Gemini no está disponible
// ============================================================================
function calculateFallbackMacros(weightKg: number, goal: string, mealCount?: number): DailyMacros {
  const goalLower = goal.toLowerCase();
  let calories = weightKg * 33; // Base para mantenimiento
  let proteinMultiplier = 2.0;

  if (goalLower.includes('ganar') || goalLower.includes('masa') || goalLower.includes('volumen')) {
    calories = weightKg * 38;
    proteinMultiplier = 2.2;
  } else if (
    goalLower.includes('defin') ||
    goalLower.includes('perder') ||
    goalLower.includes('bajar')
  ) {
    calories = weightKg * 28;
    proteinMultiplier = 2.4;
  }

  const totalCalories = Math.round(calories);
  const totalProtein = Math.round(weightKg * proteinMultiplier);
  const proteinCals = totalProtein * 4;
  const remaining = totalCalories - proteinCals;
  const totalCarbs = Math.round((remaining * 0.55) / 4);
  const totalFat = Math.round((remaining * 0.45) / 9);

  const result: DailyMacros = {
    totalCalories,
    totalProtein,
    totalCarbs,
    totalFat,
  };

  // Solo incluir perMeal si hay comidas configuradas
  if (mealCount && mealCount > 0) {
    result.perMeal = {
      calories: Math.round(totalCalories / mealCount),
      protein: Math.round(totalProtein / mealCount),
      carbs: Math.round(totalCarbs / mealCount),
      fat: Math.round(totalFat / mealCount),
    };
  }

  return result;
}

// ============================================================================
// CALCULATE MACROS WITH AI + USER CONTEXT
// Versión mejorada que usa los macros del usuario para calcular porciones
// ============================================================================

// Base de datos nutricional local (por 100g) con info de porciones
const NUTRITION_DB: Record<
  string,
  {
    protein: number;
    carbs: number;
    fat: number;
    calories: number;
    portionSize: number; // gramos por porción típica
    portionName: string; // nombre de la porción
  }
> = {
  // Proteínas
  pechuga: {
    protein: 31,
    carbs: 0,
    fat: 3.6,
    calories: 165,
    portionSize: 150,
    portionName: 'pechuga',
  },
  pollo: { protein: 27, carbs: 0, fat: 14, calories: 239, portionSize: 150, portionName: 'pieza' },
  carne: { protein: 26, carbs: 0, fat: 15, calories: 250, portionSize: 150, portionName: 'bistec' },
  res: { protein: 26, carbs: 0, fat: 15, calories: 250, portionSize: 150, portionName: 'bistec' },
  bistec: {
    protein: 26,
    carbs: 0,
    fat: 15,
    calories: 250,
    portionSize: 150,
    portionName: 'bistec',
  },
  lomo: { protein: 26, carbs: 0, fat: 8, calories: 180, portionSize: 150, portionName: 'filete' },
  cerdo: {
    protein: 25,
    carbs: 0,
    fat: 20,
    calories: 280,
    portionSize: 150,
    portionName: 'chuleta',
  },
  pescado: {
    protein: 22,
    carbs: 0,
    fat: 5,
    calories: 130,
    portionSize: 150,
    portionName: 'filete',
  },
  salmon: {
    protein: 20,
    carbs: 0,
    fat: 13,
    calories: 208,
    portionSize: 150,
    portionName: 'filete',
  },
  atun: { protein: 30, carbs: 0, fat: 1, calories: 130, portionSize: 100, portionName: 'lata' },
  tilapia: {
    protein: 26,
    carbs: 0,
    fat: 3,
    calories: 128,
    portionSize: 150,
    portionName: 'filete',
  },
  pavo: {
    protein: 29,
    carbs: 0,
    fat: 1,
    calories: 135,
    portionSize: 150,
    portionName: 'porción',
  },
  pavita: {
    protein: 29,
    carbs: 0,
    fat: 1,
    calories: 135,
    portionSize: 150,
    portionName: 'porción',
  },
  molida: {
    protein: 26,
    carbs: 0,
    fat: 15,
    calories: 250,
    portionSize: 150,
    portionName: 'porción',
  },
  cordero: {
    protein: 25,
    carbs: 0,
    fat: 21,
    calories: 294,
    portionSize: 150,
    portionName: 'porción',
  },
  camarones: {
    protein: 24,
    carbs: 0,
    fat: 0.3,
    calories: 99,
    portionSize: 100,
    portionName: 'porción',
  },
  langostinos: {
    protein: 24,
    carbs: 0,
    fat: 0.3,
    calories: 99,
    portionSize: 100,
    portionName: 'porción',
  },
  huevo: { protein: 13, carbs: 1, fat: 11, calories: 155, portionSize: 50, portionName: 'huevo' },
  huevos: { protein: 13, carbs: 1, fat: 11, calories: 155, portionSize: 50, portionName: 'huevo' },
  clara: { protein: 11, carbs: 1, fat: 0, calories: 52, portionSize: 33, portionName: 'clara' },
  claras: { protein: 11, carbs: 1, fat: 0, calories: 52, portionSize: 33, portionName: 'clara' },
  // Carbohidratos
  arroz: {
    protein: 2.7,
    carbs: 28,
    fat: 0.3,
    calories: 130,
    portionSize: 150,
    portionName: 'taza',
  },
  papa: {
    protein: 2,
    carbs: 17,
    fat: 0.1,
    calories: 77,
    portionSize: 150,
    portionName: 'papa mediana',
  },
  papas: {
    protein: 2,
    carbs: 17,
    fat: 0.1,
    calories: 77,
    portionSize: 150,
    portionName: 'papa mediana',
  },
  camote: {
    protein: 1.6,
    carbs: 20,
    fat: 0.1,
    calories: 86,
    portionSize: 150,
    portionName: 'camote mediano',
  },
  batata: {
    protein: 1.6,
    carbs: 20,
    fat: 0.1,
    calories: 86,
    portionSize: 150,
    portionName: 'batata mediana',
  },
  yuca: {
    protein: 1.4,
    carbs: 38,
    fat: 0.3,
    calories: 160,
    portionSize: 150,
    portionName: 'trozo',
  },
  avena: { protein: 13, carbs: 66, fat: 7, calories: 389, portionSize: 40, portionName: 'taza' },
  quinoa: {
    protein: 4.4,
    carbs: 21,
    fat: 1.9,
    calories: 120,
    portionSize: 150,
    portionName: 'taza',
  },
  pasta: { protein: 5, carbs: 25, fat: 1, calories: 131, portionSize: 150, portionName: 'plato' },
  fideos: { protein: 5, carbs: 25, fat: 1, calories: 131, portionSize: 150, portionName: 'plato' },
  tallarines: {
    protein: 5,
    carbs: 25,
    fat: 1,
    calories: 131,
    portionSize: 150,
    portionName: 'plato',
  },
  espagueti: {
    protein: 5,
    carbs: 25,
    fat: 1,
    calories: 131,
    portionSize: 150,
    portionName: 'plato',
  },
  macarrones: {
    protein: 5,
    carbs: 25,
    fat: 1,
    calories: 131,
    portionSize: 150,
    portionName: 'plato',
  },
  cuscus: {
    protein: 3.8,
    carbs: 23,
    fat: 0.2,
    calories: 112,
    portionSize: 150,
    portionName: 'taza',
  },
  platano: {
    protein: 1.3,
    carbs: 23,
    fat: 0.4,
    calories: 89,
    portionSize: 120,
    portionName: 'plátano',
  },
  choclo: {
    protein: 3.2,
    carbs: 19,
    fat: 1.2,
    calories: 86,
    portionSize: 150,
    portionName: 'mazorca',
  },
  pan: { protein: 9, carbs: 49, fat: 3, calories: 265, portionSize: 30, portionName: 'rebanada' },
  // Grasas
  palta: { protein: 2, carbs: 9, fat: 15, calories: 160, portionSize: 80, portionName: 'palta' },
  aguacate: {
    protein: 2,
    carbs: 9,
    fat: 15,
    calories: 160,
    portionSize: 80,
    portionName: 'aguacate',
  },
  aceite: {
    protein: 0,
    carbs: 0,
    fat: 100,
    calories: 884,
    portionSize: 14,
    portionName: 'cucharada',
  },
  mantequilla: {
    protein: 0.9,
    carbs: 0.1,
    fat: 81,
    calories: 717,
    portionSize: 14,
    portionName: 'cucharada',
  },
  almendras: {
    protein: 21,
    carbs: 22,
    fat: 49,
    calories: 579,
    portionSize: 30,
    portionName: 'puñado',
  },
  mani: { protein: 26, carbs: 16, fat: 49, calories: 567, portionSize: 30, portionName: 'puñado' },
  nueces: {
    protein: 15,
    carbs: 14,
    fat: 65,
    calories: 654,
    portionSize: 30,
    portionName: 'puñado',
  },
  // Vegetales
  brocoli: {
    protein: 2.8,
    carbs: 7,
    fat: 0.4,
    calories: 34,
    portionSize: 100,
    portionName: 'taza',
  },
  espinaca: {
    protein: 2.9,
    carbs: 3.6,
    fat: 0.4,
    calories: 23,
    portionSize: 100,
    portionName: 'taza',
  },
  tomate: {
    protein: 0.9,
    carbs: 3.9,
    fat: 0.2,
    calories: 18,
    portionSize: 120,
    portionName: 'tomate',
  },
  lechuga: {
    protein: 1.4,
    carbs: 2.9,
    fat: 0.2,
    calories: 15,
    portionSize: 100,
    portionName: 'taza',
  },
};

// Buscar nutrientes de un ingrediente en la base de datos local
function findNutritionData(ingredientName: string): {
  protein: number;
  carbs: number;
  fat: number;
  calories: number;
  portionSize: number;
  portionName: string;
} | null {
  const nameLower = ingredientName.toLowerCase().trim();
  for (const [key, value] of Object.entries(NUTRITION_DB)) {
    if (nameLower.includes(key) || key.includes(nameLower)) {
      return value;
    }
  }
  return null;
}

// Calcular gramos necesarios para alcanzar un macro específico
function calculateGramsForMacro(targetMacro: number, macroPer100g: number): number {
  if (macroPer100g <= 0) return 0;
  return Math.round((targetMacro / macroPer100g) * 100);
}

// Calcular porción descriptiva basada en gramos y tipo de alimento
function calculatePortionDescription(
  grams: number,
  portionSize: number,
  portionName: string
): string {
  const portions = grams / portionSize;

  if (portions <= 0.3) {
    return `~¼ ${portionName}`;
  } else if (portions <= 0.6) {
    return `~½ ${portionName}`;
  } else if (portions <= 0.85) {
    return `~¾ ${portionName}`;
  } else if (portions <= 1.15) {
    return `~1 ${portionName}`;
  } else if (portions <= 1.35) {
    return `~1¼ ${portionName}s`;
  } else if (portions <= 1.6) {
    return `~1½ ${portionName}s`;
  } else if (portions <= 1.85) {
    return `~1¾ ${portionName}s`;
  } else if (portions <= 2.15) {
    return `~2 ${portionName}s`;
  } else if (portions <= 2.6) {
    return `~2½ ${portionName}s`;
  } else if (portions <= 3.15) {
    return `~3 ${portionName}s`;
  } else {
    return `~${Math.round(portions)} ${portionName}s`;
  }
}

export async function calculateMealWithUserMacros(
  ingredients: Ingredient[],
  mealMacros: { calories: number; protein: number; carbs: number; fat: number }
): Promise<CalculatedIngredient[]> {
  console.warn(
    `🧮 Calculando para objetivo: ${mealMacros.protein}P ${mealMacros.carbs}C ${mealMacros.fat}G`
  );

  // Primero intentar cálculo local
  const localResults = calculateLocally(ingredients, mealMacros);

  // Si todos los ingredientes están en la base de datos, usar cálculo local
  if (localResults.allFound) {
    console.warn('✅ Cálculo local exitoso');
    return localResults.ingredients;
  }

  // Si hay ingredientes desconocidos, usar IA
  console.warn('🤖 Usando IA para ingredientes desconocidos');
  return calculateWithAI(ingredients, mealMacros);
}

// Cálculo local matemático preciso
function calculateLocally(
  ingredients: Ingredient[],
  mealMacros: { calories: number; protein: number; carbs: number; fat: number }
): { allFound: boolean; ingredients: CalculatedIngredient[] } {
  const results: CalculatedIngredient[] = [];
  let allFound = true;

  // Clasificar ingredientes por tipo de macro principal
  const proteinSources: { ing: Ingredient; data: (typeof NUTRITION_DB)[string] }[] = [];
  const carbSources: { ing: Ingredient; data: (typeof NUTRITION_DB)[string] }[] = [];
  const fatSources: { ing: Ingredient; data: (typeof NUTRITION_DB)[string] }[] = [];

  for (const ing of ingredients) {
    const data = findNutritionData(ing.name);
    if (!data) {
      allFound = false;
      results.push({ ...ing, quantity: ing.quantity || '~100g' });
      continue;
    }

    // Clasificar por macro dominante
    if (data.protein > data.carbs && data.protein > data.fat) {
      proteinSources.push({ ing, data });
    } else if (data.carbs > data.protein && data.carbs > data.fat) {
      carbSources.push({ ing, data });
    } else if (data.fat > data.protein && data.fat > data.carbs) {
      fatSources.push({ ing, data });
    } else {
      proteinSources.push({ ing, data }); // Default a proteína
    }
  }

  if (!allFound) {
    return { allFound: false, ingredients: results };
  }

  // Calcular gramos para cada tipo
  let remainingProtein = mealMacros.protein;
  let remainingCarbs = mealMacros.carbs;
  let remainingFat = mealMacros.fat;

  // Distribuir proteína
  if (proteinSources.length > 0) {
    const proteinPerSource = remainingProtein / proteinSources.length;
    for (const { ing, data } of proteinSources) {
      const grams = calculateGramsForMacro(proteinPerSource, data.protein);
      const actualProtein = Math.round((grams / 100) * data.protein);
      const actualCarbs = Math.round((grams / 100) * data.carbs);
      const actualFat = Math.round((grams / 100) * data.fat);
      const actualCalories = Math.round((grams / 100) * data.calories);

      remainingCarbs -= actualCarbs;
      remainingFat -= actualFat;

      results.push({
        ...ing,
        quantity: `${grams}g`,
        portion: calculatePortionDescription(grams, data.portionSize, data.portionName),
        nutritionInfo: {
          protein: actualProtein,
          carbs: actualCarbs,
          fat: actualFat,
          calories: actualCalories,
          suggestedGrams: grams,
        },
      });

      console.warn(`   → ${ing.name}: ${grams}g (${actualProtein}P ${actualCarbs}C ${actualFat}G)`);
    }
  }

  // Distribuir carbohidratos
  if (carbSources.length > 0) {
    const carbsPerSource = Math.max(0, remainingCarbs) / carbSources.length;
    for (const { ing, data } of carbSources) {
      const grams = calculateGramsForMacro(carbsPerSource, data.carbs);
      const actualProtein = Math.round((grams / 100) * data.protein);
      const actualCarbs = Math.round((grams / 100) * data.carbs);
      const actualFat = Math.round((grams / 100) * data.fat);
      const actualCalories = Math.round((grams / 100) * data.calories);

      remainingFat -= actualFat;

      results.push({
        ...ing,
        quantity: `${grams}g`,
        portion: calculatePortionDescription(grams, data.portionSize, data.portionName),
        nutritionInfo: {
          protein: actualProtein,
          carbs: actualCarbs,
          fat: actualFat,
          calories: actualCalories,
          suggestedGrams: grams,
        },
      });

      console.warn(`   → ${ing.name}: ${grams}g (${actualProtein}P ${actualCarbs}C ${actualFat}G)`);
    }
  }

  // Distribuir grasas
  if (fatSources.length > 0) {
    const fatPerSource = Math.max(0, remainingFat) / fatSources.length;
    for (const { ing, data } of fatSources) {
      const grams = calculateGramsForMacro(fatPerSource, data.fat);
      const actualProtein = Math.round((grams / 100) * data.protein);
      const actualCarbs = Math.round((grams / 100) * data.carbs);
      const actualFat = Math.round((grams / 100) * data.fat);
      const actualCalories = Math.round((grams / 100) * data.calories);

      results.push({
        ...ing,
        quantity: `${grams}g`,
        portion: calculatePortionDescription(grams, data.portionSize, data.portionName),
        nutritionInfo: {
          protein: actualProtein,
          carbs: actualCarbs,
          fat: actualFat,
          calories: actualCalories,
          suggestedGrams: grams,
        },
      });

      console.warn(`   → ${ing.name}: ${grams}g (${actualProtein}P ${actualCarbs}C ${actualFat}G)`);
    }
  }

  return { allFound, ingredients: results };
}

// Fallback a IA para ingredientes desconocidos
async function calculateWithAI(
  ingredients: Ingredient[],
  mealMacros: { calories: number; protein: number; carbs: number; fat: number }
): Promise<CalculatedIngredient[]> {
  if (!GEMINI_API_KEY) {
    return ingredients.map((ing) => ({
      ...ing,
      quantity: ing.quantity || '~100g',
    }));
  }

  try {
    const prompt = `Eres HANK, nutricionista deportivo. Calcula gramos EXACTOS para CUMPLIR estos macros.

MACROS OBJETIVO (OBLIGATORIO):
• Proteína: ${mealMacros.protein}g
• Carbohidratos: ${mealMacros.carbs}g  
• Grasas: ${mealMacros.fat}g
• Calorías: ${mealMacros.calories} kcal

INGREDIENTES:
${ingredients.map((i, idx) => `${idx + 1}. ${i.name}`).join('\n')}

REGLAS:
1. La suma DEBE dar exactamente los macros objetivo
2. Si falta fuente de grasa, AUMENTA los otros ingredientes para compensar calorías
3. Usa valores reales: pechuga=31g proteína/100g, arroz=28g carbos/100g

Responde SOLO JSON:
{"ingredients": [{"name": "...", "suggestedGrams": 250, "protein": 78, "carbs": 0, "fat": 9}]}`;

    const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.0, maxOutputTokens: 1024 },
      }),
    });

    if (!response.ok) throw new Error(`API error: ${response.status}`);

    const data = await response.json();
    const textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    const jsonMatch = textResponse.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in response');

    const parsed = JSON.parse(jsonMatch[0]);
    const calculatedIngredients = parsed.ingredients || [];

    console.warn('📊 Resultado IA:', JSON.stringify(calculatedIngredients));

    return ingredients.map((ing, index) => {
      const calculated = calculatedIngredients[index];
      if (calculated) {
        const grams = Math.round(calculated.suggestedGrams || 100);
        // Intentar encontrar datos locales para calcular porción
        const localData = findNutritionData(ing.name);
        let portion: string;

        if (localData) {
          // Si existe en DB local, usar su porción
          portion = calculatePortionDescription(
            grams,
            localData.portionSize,
            localData.portionName
          );
        } else {
          // Estimar porción genérica basada en macros dominantes
          const isProtein = (calculated.protein || 0) > (calculated.carbs || 0);
          const isCarb = (calculated.carbs || 0) > (calculated.protein || 0);
          const isFat = (calculated.fat || 0) > 10;

          if (isProtein) {
            // Proteína: porción típica 150g
            portion = calculatePortionDescription(grams, 150, 'porción');
          } else if (isCarb) {
            // Carbohidrato: porción típica 150g (taza cocida)
            portion = calculatePortionDescription(grams, 150, 'taza');
          } else if (isFat) {
            // Grasa: porción típica 80g
            portion = calculatePortionDescription(grams, 80, 'porción');
          } else {
            // Genérico
            portion = calculatePortionDescription(grams, 100, 'porción');
          }
        }

        console.warn(`   → ${calculated.name || ing.name}: ${grams}g (${portion})`);
        return {
          ...ing,
          quantity: `${grams}g`,
          portion,
          nutritionInfo: {
            calories: calculated.calories || 0,
            protein: calculated.protein || 0,
            carbs: calculated.carbs || 0,
            fat: calculated.fat || 0,
            suggestedGrams: grams,
          },
        };
      }
      return { ...ing, quantity: ing.quantity || '~100g' };
    });
  } catch (error) {
    console.error('calculateWithAI error:', error);
    return ingredients.map((ing) => ({
      ...ing,
      quantity: ing.quantity || '~100g',
    }));
  }
}

// ============================================================================
// CALCULATE NUTRITION FROM FIXED QUANTITIES (modo manual)
// Calcula macros/nutritionInfo SIN cambiar las cantidades del usuario
// ============================================================================
export async function calculateNutritionFromQuantities(
  ingredients: Ingredient[]
): Promise<CalculatedIngredient[]> {
  const results: CalculatedIngredient[] = [];
  const needsAI: { index: number; ing: Ingredient }[] = [];

  for (let i = 0; i < ingredients.length; i++) {
    const ing = ingredients[i];
    const data = findNutritionData(ing.name);
    const gramsNum = ing.skipGrams ? 0 : parseGramsValue(ing.quantity || '', data?.portionSize);

    if (data && gramsNum > 0) {
      // Cálculo local: macros proporcionales a los gramos del usuario
      const protein = Math.round((gramsNum / 100) * data.protein);
      const carbs = Math.round((gramsNum / 100) * data.carbs);
      const fat = Math.round((gramsNum / 100) * data.fat);
      const calories = Math.round((gramsNum / 100) * data.calories);
      const portion =
        ing.portion || calculatePortionDescription(gramsNum, data.portionSize, data.portionName);

      results.push({
        ...ing,
        quantity: ing.quantity,
        portion,
        nutritionInfo: { protein, carbs, fat, calories, suggestedGrams: gramsNum },
      });
    } else {
      // No está en la BD local o no tiene gramos válidos → IA
      needsAI.push({ index: i, ing });
      results.push({ ...ing }); // placeholder
    }
  }

  // Para ingredientes desconocidos, usar Gemini en modo "solo calcular macros"
  if (needsAI.length > 0 && GEMINI_API_KEY) {
    try {
      // Separar ingredientes skipGrams de los normales para prompt diferenciado
      const skipGramsItems = needsAI.filter(({ ing }) => ing.skipGrams);
      const normalItems = needsAI.filter(({ ing }) => !ing.skipGrams);

      // Procesar ingredientes normales (con cálculo de gramos)
      if (normalItems.length > 0) {
        const prompt = `Eres HANK, nutricionista deportivo. Calcula los macros EXACTOS para estos ingredientes CON LAS CANTIDADES INDICADAS.
IMPORTANTE: NO cambies las cantidades. Solo calcula los macros para la cantidad que el usuario indicó.

INGREDIENTES:
${normalItems
  .map(
    ({ ing }, idx) =>
      `${idx + 1}. ${ing.name}${ing.quantity ? ` - ${ing.quantity}` : ''}${ing.portion ? ` (${ing.portion})` : ''}`
  )
  .join('\n')}

Responde SOLO JSON:
{"ingredients": [{"name": "...", "grams": 200, "portion": "~1 porción", "calories": 250, "protein": 35, "carbs": 0, "fat": 8}]}`;

        const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.1, maxOutputTokens: 1024 },
          }),
        });

        if (response.ok) {
          const data = await response.json();
          const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
          const jsonMatch = text.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            const aiIngredients = parsed.ingredients || [];

            for (let j = 0; j < normalItems.length; j++) {
              const { index, ing } = normalItems[j];
              const aiResult = aiIngredients[j];
              if (aiResult) {
                const grams = aiResult.grams || parseGramsValue(ing.quantity || '') || 100;
                results[index] = {
                  ...ing,
                  quantity: ing.quantity || `${grams}g`,
                  portion: ing.portion || aiResult.portion || '~1 porción',
                  nutritionInfo: {
                    protein: aiResult.protein || 0,
                    carbs: aiResult.carbs || 0,
                    fat: aiResult.fat || 0,
                    calories: aiResult.calories || 0,
                    suggestedGrams: grams,
                  },
                };
              }
            }
          }
        }
      }

      // Procesar ingredientes skipGrams (solo macros, SIN asignar gramos)
      if (skipGramsItems.length > 0) {
        const prompt = `Eres HANK, nutricionista deportivo. Calcula los macros APROXIMADOS para estos ingredientes según la porción descrita en el nombre.
IMPORTANTE: El usuario NO quiere gramos. Solo calcula macros (calorías, proteína, carbos, grasa) basándote en la descripción/porción del ingrediente.
NO inventes ni asignes gramos.

INGREDIENTES:
${skipGramsItems.map(({ ing }, idx) => `${idx + 1}. ${ing.name}`).join('\n')}

Responde SOLO JSON:
{"ingredients": [{"name": "...", "calories": 250, "protein": 35, "carbs": 0, "fat": 8}]}`;

        const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.1, maxOutputTokens: 1024 },
          }),
        });

        if (response.ok) {
          const data = await response.json();
          const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
          const jsonMatch = text.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            const aiIngredients = parsed.ingredients || [];

            for (let j = 0; j < skipGramsItems.length; j++) {
              const { index, ing } = skipGramsItems[j];
              const aiResult = aiIngredients[j];
              if (aiResult) {
                results[index] = {
                  ...ing,
                  quantity: '', // NO asignar gramos
                  portion: '',
                  nutritionInfo: {
                    protein: aiResult.protein || 0,
                    carbs: aiResult.carbs || 0,
                    fat: aiResult.fat || 0,
                    calories: aiResult.calories || 0,
                    suggestedGrams: 0,
                  },
                };
              }
            }
          }
        }
      }
    } catch (error) {
      console.error('calculateNutritionFromQuantities AI error:', error);
    }
  }

  return results;
}

// ============================================================================
// RECALCULATE ALL MEALS FOR NEW MEAL COUNT
// Recalcula todas las comidas cuando cambia la cantidad de comidas
// ============================================================================
export async function recalculateAllMealsForNewCount(
  meals: {
    optionId: string;
    ingredients: { name: string }[];
  }[],
  profile: UserMacroProfile
): Promise<
  {
    optionId: string;
    ingredients: { name: string; quantity: string; portion: string }[];
  }[]
> {
  // Calcular nuevos macros por comida
  const dailyMacros = await calculateUserDailyMacros(profile);
  const perMealMacros = dailyMacros.perMeal;

  // Si no hay perMealMacros (no tiene comidas configuradas), usar fallback
  if (!perMealMacros) {
    console.warn('⚠️ No hay macros por comida, usando valores por defecto');
    const defaultPerMeal = {
      protein: Math.round(dailyMacros.totalProtein / (profile.mealCount || 3)),
      carbs: Math.round(dailyMacros.totalCarbs / (profile.mealCount || 3)),
      fat: Math.round(dailyMacros.totalFat / (profile.mealCount || 3)),
      calories: Math.round(dailyMacros.totalCalories / (profile.mealCount || 3)),
    };

    console.warn(
      `🔄 Recalculando ${meals.length} comidas con ${profile.mealCount} comidas/día -> ${defaultPerMeal.protein}P ${defaultPerMeal.carbs}C ${defaultPerMeal.fat}G por comida`
    );

    const results = await Promise.all(
      meals.map(async (meal) => {
        const ingredientsWithIds = meal.ingredients.map((ing, i) => ({
          id: `ing-${i}`,
          name: ing.name,
          quantity: '',
          portion: '',
        }));

        const calculated = await calculateMealWithUserMacros(ingredientsWithIds, defaultPerMeal);

        return {
          optionId: meal.optionId,
          ingredients: calculated.map((ing) => ({
            name: ing.name,
            quantity: ing.quantity,
            portion: ing.portion || '',
          })),
        };
      })
    );

    return results;
  }

  console.warn(
    `🔄 Recalculando ${meals.length} comidas con ${profile.mealCount} comidas/día -> ${perMealMacros.protein}P ${perMealMacros.carbs}C ${perMealMacros.fat}G por comida`
  );

  // Recalcular cada comida
  const results = await Promise.all(
    meals.map(async (meal) => {
      const ingredientsWithIds = meal.ingredients.map((ing, i) => ({
        id: `ing-${i}`,
        name: ing.name,
        quantity: '',
        portion: '',
      }));

      const calculated = await calculateMealWithUserMacros(ingredientsWithIds, perMealMacros);

      return {
        optionId: meal.optionId,
        ingredients: calculated.map((ing) => ({
          name: ing.name,
          quantity: ing.quantity,
          portion: ing.portion || '',
        })),
      };
    })
  );

  return results;
}

export async function analyzeDailyNutrition(
  meals: { time: string; ingredients: SimpleIngredient[] }[]
): Promise<{
  totalCalories: number;
  totalProtein: number;
  totalCarbs: number;
  totalFat: number;
  analysis: string;
  recommendations: string[];
}> {
  if (!GEMINI_API_KEY) {
    return {
      totalCalories: 0,
      totalProtein: 0,
      totalCarbs: 0,
      totalFat: 0,
      analysis: 'API key no configurada',
      recommendations: [],
    };
  }

  try {
    const prompt = `Analiza el plan nutricional de un atleta para hoy:

${meals.map((m) => `${m.time}:\n${m.ingredients.map((i) => `  - ${i.name} (${i.quantity})`).join('\n')}`).join('\n\n')}

Calcula totales y da recomendaciones. Responde SOLO JSON:
{
  "totals": { "calories": 2500, "protein": 180, "carbs": 200, "fat": 80 },
  "analysis": "Breve análisis de 1-2 líneas",
  "recommendations": ["Recomendación 1", "Recomendación 2"]
}`;

    const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 512 },
      }),
    });

    if (!response.ok) throw new Error(`API error: ${response.status}`);

    const data = await response.json();
    const textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    const jsonMatch = textResponse.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON');

    const parsed = JSON.parse(jsonMatch[0]);
    return {
      totalCalories: parsed.totals?.calories || 0,
      totalProtein: parsed.totals?.protein || 0,
      totalCarbs: parsed.totals?.carbs || 0,
      totalFat: parsed.totals?.fat || 0,
      analysis: parsed.analysis || '',
      recommendations: parsed.recommendations || [],
    };
  } catch (error) {
    console.error('analyzeDailyNutrition error:', error);
    return {
      totalCalories: 0,
      totalProtein: 0,
      totalCarbs: 0,
      totalFat: 0,
      analysis: 'Error al analizar',
      recommendations: [],
    };
  }
}

// ============================================================================
// CONVERSIÓN GRAMOS ↔ PORCIONES CON IA
// Si el usuario ingresa solo gramos, calcula porciones y viceversa
// ============================================================================

const GRAMS_PORTION_PROMPT = `Eres HANK, nutricionista deportivo experto. Tu tarea es convertir entre gramos y porciones para ingredientes de comidas.

REGLAS:
1. Si te dan GRAMOS, calcula cuántas porciones típicas equivale (ej: 300g de arroz = ~2 tazas)
2. Si te dan PORCIONES, calcula cuántos gramos equivale (ej: 2 pechugas = ~300g)
3. Usa porciones comunes: taza, cucharada, pieza, rebanada, porción, filete, puñado, etc.
4. Sé preciso con las equivalencias estándar de nutrición deportiva
5. Responde SOLO con JSON válido, sin markdown

FORMATO DE RESPUESTA (JSON puro):
{
  "ingredients": [
    {
      "name": "nombre del ingrediente",
      "grams": "150g",
      "portion": "~1 pechuga"
    }
  ]
}`;

interface ConversionIngredient {
  name: string;
  quantity?: string; // gramos (ej: "200g")
  portion?: string; // porciones (ej: "2 tazas")
}

interface ConversionResult {
  name: string;
  quantity: string;
  portion: string;
}

/**
 * Convierte gramos a porciones o porciones a gramos usando BD local + IA fallback.
 * Si ambos campos están llenos, los devuelve tal cual.
 * Si solo uno está lleno, calcula el otro.
 */
export async function convertGramsPortions(
  ingredients: ConversionIngredient[]
): Promise<ConversionResult[]> {
  const results: ConversionResult[] = [];
  const needsAI: { index: number; ingredient: ConversionIngredient }[] = [];

  for (let i = 0; i < ingredients.length; i++) {
    const ing = ingredients[i];
    const hasGrams = !!(ing.quantity && ing.quantity.trim());
    const hasPortion = !!(ing.portion && ing.portion.trim());

    // Si no tiene ninguno, marcar para IA con valor default
    if (!hasGrams && !hasPortion) {
      needsAI.push({ index: i, ingredient: ing });
      results.push({ name: ing.name, quantity: '', portion: '' }); // placeholder
      continue;
    }

    // Intentar conversión local (siempre recalcular el lado complementario)
    const nutritionData = findNutritionData(ing.name);

    if (nutritionData) {
      if (hasGrams) {
        // Tiene gramos → recalcular porción desde gramos
        const gramsNum = parseGramsValue(ing.quantity!, nutritionData.portionSize);
        if (gramsNum > 0) {
          const portionDesc = calculatePortionDescription(
            gramsNum,
            nutritionData.portionSize,
            nutritionData.portionName
          );
          results.push({
            name: ing.name,
            quantity: `${gramsNum}g`,
            portion: portionDesc,
          });
          continue;
        }
      }
      if (hasPortion && !hasGrams) {
        // Solo tiene porción → calcular gramos
        const portionNum = parsePortionValue(ing.portion!);
        if (portionNum > 0) {
          const grams = Math.round(portionNum * nutritionData.portionSize);
          results.push({
            name: ing.name,
            quantity: `${grams}g`,
            portion: ing.portion!.trim(),
          });
          continue;
        }
      }
    }

    // Si no se resolvió localmente, marcar para IA
    needsAI.push({ index: i, ingredient: ing });
    results.push({ name: ing.name, quantity: '', portion: '' }); // placeholder
  }

  // Si hay ingredientes que necesitan IA, hacer una sola llamada
  if (needsAI.length > 0 && GEMINI_API_KEY) {
    try {
      const aiResults = await convertWithAI(needsAI.map((n) => n.ingredient));
      for (let i = 0; i < needsAI.length; i++) {
        const { index, ingredient } = needsAI[i];
        const aiResult = aiResults[i];
        if (aiResult) {
          results[index] = {
            name: ingredient.name,
            quantity: aiResult.grams || ingredient.quantity || '~100g',
            portion: aiResult.portion || ingredient.portion || '~1 porción',
          };
        } else {
          // Fallback si IA no devolvió este ingrediente
          results[index] = {
            name: ingredient.name,
            quantity: ingredient.quantity || '~100g',
            portion: ingredient.portion || '~1 porción',
          };
        }
      }
    } catch (error) {
      console.error('Error en conversión con IA:', error);
      // Fallback para todos los que necesitaban IA
      for (const { index, ingredient } of needsAI) {
        results[index] = {
          name: ingredient.name,
          quantity: ingredient.quantity || '~100g',
          portion: ingredient.portion || '~1 porción',
        };
      }
    }
  } else if (needsAI.length > 0) {
    // Sin API key, usar valores default
    for (const { index, ingredient } of needsAI) {
      results[index] = {
        name: ingredient.name,
        quantity: ingredient.quantity || '~100g',
        portion: ingredient.portion || '~1 porción',
      };
    }
  }

  return results;
}

/** Extrae el valor numérico de gramos de un string como "200g", "200 g", "200gr", "200 gramos" */
/**
 * Parsea un string de cantidad y devuelve gramos.
 * - "200g", "200 gr", "200 gramos" → 200
 * - "5 huevos enteros", "2 pechugas" → detecta piezas y devuelve { pieces, grams: 0 }
 * - "1 taza", "2 cucharadas" → detecta medida y devuelve { pieces, grams: 0 }
 */
function parseGramsValue(value: string, portionSize?: number): number {
  if (!value || !value.trim()) return 0;
  const cleaned = value.replace(/^~/, '').trim().toLowerCase();

  // Patrón explícito de gramos: "200g", "200 gr", "200 gramos", "200"
  const gramsMatch = cleaned.match(/(\d+(?:\.\d+)?)\s*(?:g|gr|gramos|kg)\b/i);
  if (gramsMatch) {
    const num = parseFloat(gramsMatch[1]);
    if (cleaned.includes('kg')) return num * 1000;
    return num;
  }

  // Palabras que indican unidades/piezas/porciones (NO gramos)
  const unitKeywords =
    /(?:huevo|pechuga|filete|rebanada|pieza|unidad|tortilla|pan|banana|banano|plátano|manzana|naranja|taza|cucharada|cucharadita|porción|porcion|scoop|slice|piece|cup|tbsp|tsp|entero|entera|enteros|enteras|trozo|rodaja|lata|sobre)s?/i;

  // Si contiene palabras de unidad, extraer el número como piezas
  if (unitKeywords.test(cleaned)) {
    const numMatch = cleaned.match(/(\d+(?:\.\d+)?)/);
    if (numMatch && portionSize && portionSize > 0) {
      return parseFloat(numMatch[1]) * portionSize;
    }
    // Sin portionSize, no podemos convertir → devolver 0 para que vaya a IA
    return 0;
  }

  // Si solo es un número sin unidad ("200") → asumir gramos
  const plainNum = cleaned.match(/^(\d+(?:\.\d+)?)$/);
  if (plainNum) return parseFloat(plainNum[1]);

  // Último intento: extraer cualquier número
  const anyNum = cleaned.match(/(\d+(?:\.\d+)?)/);
  if (anyNum) {
    // Si tiene portionSize y el número es bajo (< 30), probablemente son piezas
    const num = parseFloat(anyNum[1]);
    if (portionSize && portionSize > 0 && num < 30) {
      return num * portionSize;
    }
    return num;
  }

  return 0;
}

/** Extrae el valor numérico de porciones de un string como "2 tazas", "1.5 pechugas", "~2 piezas" */
function parsePortionValue(value: string): number {
  // Manejar fracciones como "½", "¼", "¾"
  const fractionMap: Record<string, number> = {
    '¼': 0.25,
    '½': 0.5,
    '¾': 0.75,
    '1¼': 1.25,
    '1½': 1.5,
    '1¾': 1.75,
    '2½': 2.5,
  };

  const cleaned = value.replace(/^~/, '').trim();

  // Buscar fracciones unicode primero
  for (const [frac, num] of Object.entries(fractionMap)) {
    if (cleaned.startsWith(frac)) {
      return num;
    }
  }

  // Buscar número normal
  const match = cleaned.match(/(\d+(?:\.\d+)?)/);
  return match ? parseFloat(match[1]) : 0;
}

/** Llama a Gemini para convertir ingredientes que no están en la BD local */
async function convertWithAI(
  ingredients: ConversionIngredient[]
): Promise<{ grams: string; portion: string }[]> {
  let userMessage = 'Convierte entre gramos y porciones para estos ingredientes:\n\n';

  ingredients.forEach((ing, i) => {
    userMessage += `${i + 1}. ${ing.name}`;
    if (ing.quantity) userMessage += ` - Gramos: ${ing.quantity}`;
    if (ing.portion) userMessage += ` - Porción: ${ing.portion}`;
    if (!ing.quantity && !ing.portion)
      userMessage += ` - Sin datos (estima porción típica de atleta)`;
    userMessage += '\n';
  });

  const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [
        { role: 'user', parts: [{ text: GRAMS_PORTION_PROMPT }] },
        { role: 'model', parts: [{ text: 'Entendido. Envíame los ingredientes.' }] },
        { role: 'user', parts: [{ text: userMessage }] },
      ],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 1024,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Gemini API error: ${response.status}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

  // Extraer JSON
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('No JSON en respuesta de IA');

  const parsed = JSON.parse(jsonMatch[0]);
  return (parsed.ingredients || []).map((ing: any) => ({
    grams: ing.grams || ing.quantity || '',
    portion: ing.portion || '',
  }));
}
