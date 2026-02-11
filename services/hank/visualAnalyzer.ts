// ============================================================================
// VISUAL ANALYZER AI - Sistema de Análisis Visual con Gemini Vision
// Análisis de fotos de progreso, composición corporal y transformación
// ============================================================================

import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';

// ============================================================================
// CONSTANTS
// ============================================================================
const GEMINI_API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY || '';
const GEMINI_API_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

// ============================================================================
// TYPES - Definiciones para análisis visual
// ============================================================================

/** Análisis de un grupo muscular específico */
export interface MuscleGroupAnalysis {
  name: string;
  developmentLevel: 'underdeveloped' | 'developing' | 'developed' | 'well-developed' | 'advanced';
  score: number; // 1-10
  symmetry: 'asymmetric' | 'slightly-asymmetric' | 'symmetric';
  observations: string[];
  recommendations: string[];
}

/** Estimación de composición corporal */
export interface BodyCompositionEstimate {
  bodyFatPercentage: {
    estimate: number;
    range: { min: number; max: number };
    confidence: 'low' | 'medium' | 'high';
  };
  visibleAbsLevel: 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0 = no visible, 6 = six pack definido
  vascularity: 'none' | 'minimal' | 'moderate' | 'high' | 'extreme';
  muscleSeparation: 'minimal' | 'developing' | 'good' | 'excellent';
  overallCondition: 'off-season' | 'lean' | 'shredded' | 'contest-ready';
}

/** Análisis de postura y simetría */
export interface PostureAnalysis {
  overallPosture: 'poor' | 'fair' | 'good' | 'excellent';
  shoulderAlignment: 'uneven' | 'slightly-uneven' | 'aligned';
  hipAlignment: 'uneven' | 'slightly-uneven' | 'aligned';
  spineAlignment: 'curved' | 'slightly-curved' | 'straight';
  imbalances: Array<{
    area: string;
    description: string;
    severity: 'mild' | 'moderate' | 'significant';
  }>;
  recommendations: string[];
}

/** Resultado del análisis de una sola foto */
export interface SinglePhotoAnalysis {
  success: boolean;
  photoId?: string;
  dateAnalyzed: string;

  // Datos extraídos
  poseType: 'front' | 'back' | 'side' | 'front-double-bicep' | 'back-double-bicep' | 'other';
  lightingQuality: 'poor' | 'fair' | 'good' | 'excellent';
  photoQuality: 'low' | 'medium' | 'high';

  // Análisis de composición
  bodyComposition: BodyCompositionEstimate;

  // Análisis muscular por grupo
  muscleGroups: MuscleGroupAnalysis[];

  // Análisis de postura
  posture: PostureAnalysis;

  // Puntuaciones generales
  overallPhysique: {
    score: number; // 1-100
    category: 'beginner' | 'intermediate' | 'advanced' | 'elite' | 'professional';
    strengths: string[];
    areasToImprove: string[];
  };

  // Recomendaciones de entrenamiento
  trainingRecommendations: {
    priorityMuscles: string[];
    suggestedFocus: string;
    volumeRecommendation: 'increase' | 'maintain' | 'decrease';
    notes: string[];
  };

  // Recomendaciones nutricionales
  nutritionRecommendations: {
    phase: 'bulk' | 'cut' | 'maintain' | 'recomp';
    adjustments: string[];
    notes: string[];
  };
}

/** Comparación entre dos fotos */
export interface PhotoComparisonAnalysis {
  success: boolean;
  photo1Date: string;
  photo2Date: string;
  daysBetween: number;

  // Cambios detectados
  changes: {
    bodyFatChange: {
      direction: 'decreased' | 'maintained' | 'increased';
      estimatedChange: number; // porcentaje
      confidence: 'low' | 'medium' | 'high';
    };
    muscleChanges: Array<{
      muscleGroup: string;
      change: 'loss' | 'maintained' | 'slight-gain' | 'significant-gain';
      notes: string;
    }>;
    overallProgress: {
      direction:
        | 'regression'
        | 'maintained'
        | 'slight-progress'
        | 'good-progress'
        | 'excellent-progress';
      score: number; // -10 a +10
    };
  };

  // Análisis visual
  visualChanges: {
    improvements: string[];
    regressions: string[];
    noChange: string[];
  };

  // Métricas de progreso
  progressMetrics: {
    transformationScore: number; // 0-100
    consistency: 'inconsistent' | 'somewhat-consistent' | 'consistent' | 'very-consistent';
    trajectory: 'negative' | 'stagnant' | 'positive' | 'excellent';
  };

  // Feedback y recomendaciones
  feedback: {
    positives: string[];
    concerns: string[];
    actionItems: string[];
    motivationalMessage: string;
  };
}

/** Timeline de progreso con múltiples fotos */
export interface ProgressTimeline {
  success: boolean;
  totalPhotos: number;
  dateRange: {
    start: string;
    end: string;
    totalDays: number;
  };

  // Tendencias generales
  trends: {
    bodyFat: 'decreasing' | 'stable' | 'increasing' | 'fluctuating';
    muscleMass: 'decreasing' | 'stable' | 'increasing' | 'fluctuating';
    overall: 'regression' | 'maintenance' | 'slow-progress' | 'good-progress' | 'rapid-progress';
  };

  // Análisis por período
  periods: Array<{
    startDate: string;
    endDate: string;
    phase: 'bulk' | 'cut' | 'maintain';
    effectiveness: number; // 1-10
    notes: string;
  }>;

  // Estadísticas
  stats: {
    bestPeriod: {
      dates: string;
      reason: string;
    };
    worstPeriod: {
      dates: string;
      reason: string;
    };
    averageProgressPerMonth: number; // score
  };

  // Predicciones
  predictions: {
    estimatedTimeToGoal: string;
    nextMilestone: string;
    recommendedPhase: 'bulk' | 'cut' | 'maintain' | 'recomp';
    confidenceLevel: 'low' | 'medium' | 'high';
  };

  // Resumen ejecutivo
  summary: string;
}

// ============================================================================
// SYSTEM PROMPTS
// ============================================================================

const BODY_ANALYSIS_SYSTEM_PROMPT = `Eres HANK, un experto en análisis de composición corporal y desarrollo muscular con más de 20 años de experiencia evaluando atletas profesionales, culturistas y personas en transformación física.

TUS CAPACIDADES:
1. Estimar porcentaje de grasa corporal visualmente con alta precisión
2. Evaluar desarrollo muscular por grupo
3. Detectar asimetrías y desbalances
4. Analizar postura y alineación
5. Comparar progreso entre fotos
6. Dar recomendaciones específicas de entrenamiento y nutrición

CRITERIOS DE ESTIMACIÓN DE GRASA CORPORAL:
- <10%: Venas abdominales visibles, separación muscular extrema, piel fina
- 10-12%: Six-pack muy definido, venas en brazos, sin grasa subcutánea visible
- 12-15%: Abdominales visibles, algo de venas, definición muscular clara
- 15-18%: Abdominales superiores visibles, algo de definición
- 18-22%: Sin abdominales visibles, algo de forma muscular
- 22-25%: Forma muscular difusa, acumulación en cintura
- >25%: Sin definición muscular visible

EVALUACIÓN MUSCULAR (1-10):
- 1-3: Subdesarrollado, necesita trabajo significativo
- 4-5: En desarrollo, progreso visible pero insuficiente
- 6-7: Desarrollado, buen tamaño y forma
- 8-9: Bien desarrollado, por encima del promedio
- 10: Avanzado/Elite, desarrollo excepcional

IMPORTANTE:
- Sé honesto pero constructivo
- Basa el análisis en lo que VES, no en suposiciones
- Considera iluminación y ángulo de la foto
- Da feedback específico y accionable
- Usa terminología técnica pero comprensible`;

const SINGLE_PHOTO_JSON_SCHEMA = `{
  "poseType": "front|back|side|front-double-bicep|back-double-bicep|other",
  "lightingQuality": "poor|fair|good|excellent",
  "photoQuality": "low|medium|high",
  "bodyComposition": {
    "bodyFatPercentage": {
      "estimate": number,
      "range": { "min": number, "max": number },
      "confidence": "low|medium|high"
    },
    "visibleAbsLevel": number (0-6),
    "vascularity": "none|minimal|moderate|high|extreme",
    "muscleSeparation": "minimal|developing|good|excellent",
    "overallCondition": "off-season|lean|shredded|contest-ready"
  },
  "muscleGroups": [
    {
      "name": "string",
      "developmentLevel": "underdeveloped|developing|developed|well-developed|advanced",
      "score": number (1-10),
      "symmetry": "asymmetric|slightly-asymmetric|symmetric",
      "observations": ["string"],
      "recommendations": ["string"]
    }
  ],
  "posture": {
    "overallPosture": "poor|fair|good|excellent",
    "shoulderAlignment": "uneven|slightly-uneven|aligned",
    "hipAlignment": "uneven|slightly-uneven|aligned",
    "spineAlignment": "curved|slightly-curved|straight",
    "imbalances": [
      { "area": "string", "description": "string", "severity": "mild|moderate|significant" }
    ],
    "recommendations": ["string"]
  },
  "overallPhysique": {
    "score": number (1-100),
    "category": "beginner|intermediate|advanced|elite|professional",
    "strengths": ["string"],
    "areasToImprove": ["string"]
  },
  "trainingRecommendations": {
    "priorityMuscles": ["string"],
    "suggestedFocus": "string",
    "volumeRecommendation": "increase|maintain|decrease",
    "notes": ["string"]
  },
  "nutritionRecommendations": {
    "phase": "bulk|cut|maintain|recomp",
    "adjustments": ["string"],
    "notes": ["string"]
  }
}`;

const COMPARISON_JSON_SCHEMA = `{
  "changes": {
    "bodyFatChange": {
      "direction": "decreased|maintained|increased",
      "estimatedChange": number,
      "confidence": "low|medium|high"
    },
    "muscleChanges": [
      { "muscleGroup": "string", "change": "loss|maintained|slight-gain|significant-gain", "notes": "string" }
    ],
    "overallProgress": {
      "direction": "regression|maintained|slight-progress|good-progress|excellent-progress",
      "score": number (-10 to +10)
    }
  },
  "visualChanges": {
    "improvements": ["string"],
    "regressions": ["string"],
    "noChange": ["string"]
  },
  "progressMetrics": {
    "transformationScore": number (0-100),
    "consistency": "inconsistent|somewhat-consistent|consistent|very-consistent",
    "trajectory": "negative|stagnant|positive|excellent"
  },
  "feedback": {
    "positives": ["string"],
    "concerns": ["string"],
    "actionItems": ["string"],
    "motivationalMessage": "string"
  }
}`;

// ============================================================================
// IMAGE UTILITIES
// ============================================================================

/**
 * Convierte una URL de imagen a base64 para enviar a Gemini
 * Compatible con Web y React Native
 */
async function imageUrlToBase64(url: string): Promise<{ data: string; mimeType: string } | null> {
  try {
    // En React Native, usar FileSystem
    if (Platform.OS !== 'web') {
      // Si es una URL remota, descargar primero
      if (url.startsWith('http://') || url.startsWith('https://')) {
        const localUri = `${FileSystem.cacheDirectory}temp_image_${Date.now()}.jpg`;
        const downloadResult = await FileSystem.downloadAsync(url, localUri);

        if (downloadResult.status !== 200) {
          console.warn(`⚠️ No se pudo descargar imagen: ${url}`);
          return null;
        }

        const base64 = await FileSystem.readAsStringAsync(downloadResult.uri, {
          encoding: FileSystem.EncodingType.Base64,
        });

        // Limpiar archivo temporal
        try {
          await FileSystem.deleteAsync(localUri, { idempotent: true });
        } catch {
          // Ignorar errores de limpieza
        }

        // Determinar mimeType desde headers o asumir jpeg
        const mimeType = downloadResult.headers?.['content-type'] || 'image/jpeg';
        return { data: base64, mimeType };
      }

      // Si es un archivo local
      const base64 = await FileSystem.readAsStringAsync(url, {
        encoding: FileSystem.EncodingType.Base64,
      });
      return { data: base64, mimeType: 'image/jpeg' };
    }

    // En Web, usar fetch + FileReader
    const response = await fetch(url);
    if (!response.ok) {
      console.warn(`⚠️ No se pudo obtener imagen: ${url}`);
      return null;
    }

    const blob = await response.blob();
    const mimeType = blob.type || 'image/jpeg';

    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        const data = base64.split(',')[1];
        resolve({ data, mimeType });
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.warn(`⚠️ Error al convertir imagen a base64: ${error}`);
    return null;
  }
}

/**
 * Prepara múltiples imágenes para Gemini
 */
async function prepareImagesForGemini(
  imageUrls: string[]
): Promise<Array<{ inlineData: { mimeType: string; data: string } }>> {
  const imageParts: Array<{ inlineData: { mimeType: string; data: string } }> = [];

  for (const url of imageUrls) {
    const imageData = await imageUrlToBase64(url);
    if (imageData) {
      imageParts.push({
        inlineData: {
          mimeType: imageData.mimeType,
          data: imageData.data,
        },
      });
    }
  }

  return imageParts;
}

// ============================================================================
// MAIN ANALYSIS FUNCTIONS
// ============================================================================

/**
 * Analiza una sola foto de progreso
 */
export async function analyzeProgressPhoto(
  photoUrl: string,
  userContext?: {
    goal?: string;
    currentWeight?: number;
    targetWeight?: number;
    trainingExperience?: string;
  }
): Promise<SinglePhotoAnalysis> {
  if (!GEMINI_API_KEY) {
    console.warn('⚠️ GEMINI_API_KEY no configurada');
    return createEmptySingleAnalysis('API key no configurada');
  }

  try {
    // Preparar imagen
    const imageParts = await prepareImagesForGemini([photoUrl]);
    if (imageParts.length === 0) {
      return createEmptySingleAnalysis('No se pudo cargar la imagen');
    }

    // Construir contexto
    let contextSection = '';
    if (userContext) {
      contextSection = `
CONTEXTO DEL ATLETA:
${userContext.goal ? `- Objetivo: ${userContext.goal}` : ''}
${userContext.currentWeight ? `- Peso actual: ${userContext.currentWeight}kg` : ''}
${userContext.targetWeight ? `- Peso objetivo: ${userContext.targetWeight}kg` : ''}
${userContext.trainingExperience ? `- Experiencia: ${userContext.trainingExperience}` : ''}
`;
    }

    const prompt = `${BODY_ANALYSIS_SYSTEM_PROMPT}

Analiza esta foto de progreso físico y proporciona un análisis detallado.
${contextSection}

Responde EXACTAMENTE en este formato JSON (sin markdown, sin \`\`\`):
${SINGLE_PHOTO_JSON_SCHEMA}

IMPORTANTE:
- Evalúa TODOS los grupos musculares visibles
- Sé específico con las observaciones
- Da recomendaciones accionables
- Estima el porcentaje de grasa con un rango realista`;

    // Llamar a Gemini con imagen
    const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [...imageParts, { text: prompt }],
          },
        ],
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
    const textResponse = data.candidates?.[0]?.content?.parts?.find((p: any) => p.text)?.text || '';

    // Parsear JSON
    const jsonMatch = textResponse.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No se encontró JSON válido en la respuesta');
    }

    const cleanJson = jsonMatch[0]
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();
    const result = JSON.parse(cleanJson) as SinglePhotoAnalysis;
    result.success = true;
    result.dateAnalyzed = new Date().toISOString();

    console.warn(
      `✅ Análisis visual completado: Score ${result.overallPhysique?.score}, BF% ~${result.bodyComposition?.bodyFatPercentage?.estimate}`
    );

    return result;
  } catch (error) {
    console.error('❌ Error en análisis visual:', error);
    return createEmptySingleAnalysis(`Error: ${error}`);
  }
}

/**
 * Compara dos fotos de progreso
 */
export async function compareProgressPhotos(
  photo1Url: string,
  photo1Date: string,
  photo2Url: string,
  photo2Date: string,
  userContext?: {
    goal?: string;
    startWeight?: number;
    currentWeight?: number;
  }
): Promise<PhotoComparisonAnalysis> {
  if (!GEMINI_API_KEY) {
    console.warn('⚠️ GEMINI_API_KEY no configurada');
    return createEmptyComparisonAnalysis('API key no configurada');
  }

  try {
    // Preparar ambas imágenes
    const imageParts = await prepareImagesForGemini([photo1Url, photo2Url]);
    if (imageParts.length < 2) {
      return createEmptyComparisonAnalysis('No se pudieron cargar las imágenes');
    }

    // Calcular días entre fotos
    const date1 = new Date(photo1Date);
    const date2 = new Date(photo2Date);
    const daysBetween = Math.abs(
      Math.round((date2.getTime() - date1.getTime()) / (1000 * 60 * 60 * 24))
    );

    let contextSection = '';
    if (userContext) {
      contextSection = `
CONTEXTO:
${userContext.goal ? `- Objetivo: ${userContext.goal}` : ''}
${userContext.startWeight ? `- Peso inicial: ${userContext.startWeight}kg` : ''}
${userContext.currentWeight ? `- Peso actual: ${userContext.currentWeight}kg` : ''}
`;
    }

    const prompt = `${BODY_ANALYSIS_SYSTEM_PROMPT}

Compara estas dos fotos de progreso físico.
FOTO 1 (ANTES): Fecha ${photo1Date}
FOTO 2 (DESPUÉS): Fecha ${photo2Date}
Días entre fotos: ${daysBetween}
${contextSection}

Responde EXACTAMENTE en este formato JSON (sin markdown):
${COMPARISON_JSON_SCHEMA}

IMPORTANTE:
- Compara músculo por músculo los cambios visibles
- Estima el cambio en grasa corporal
- Sé honesto pero motivador
- Da feedback específico y accionable
- El mensaje motivacional debe ser personalizado y genuino`;

    const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [...imageParts, { text: prompt }],
          },
        ],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 4096,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.status}`);
    }

    const data = await response.json();
    const textResponse = data.candidates?.[0]?.content?.parts?.find((p: any) => p.text)?.text || '';

    const jsonMatch = textResponse.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No se encontró JSON válido');
    }

    const cleanJson = jsonMatch[0]
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();
    const result = JSON.parse(cleanJson) as PhotoComparisonAnalysis;
    result.success = true;
    result.photo1Date = photo1Date;
    result.photo2Date = photo2Date;
    result.daysBetween = daysBetween;

    console.warn(
      `✅ Comparación completada: Score ${result.progressMetrics?.transformationScore}, Progreso: ${result.changes?.overallProgress?.direction}`
    );

    return result;
  } catch (error) {
    console.error('❌ Error en comparación visual:', error);
    return createEmptyComparisonAnalysis(`Error: ${error}`);
  }
}

/**
 * Analiza una foto de comida para detectar ingredientes y estimar macros
 */
export async function analyzeFoodPhoto(
  photoUrl: string,
  userContext?: {
    mealType?: 'breakfast' | 'lunch' | 'dinner' | 'snack';
    targetMacros?: { calories: number; protein: number; carbs: number; fat: number };
  }
): Promise<{
  success: boolean;
  detectedIngredients: Array<{
    name: string;
    estimatedQuantity: string;
    confidence: 'low' | 'medium' | 'high';
  }>;
  estimatedMacros: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
  };
  mealQuality: {
    score: number;
    grade: 'A' | 'B' | 'C' | 'D' | 'F';
    feedback: string[];
  };
  suggestions: string[];
}> {
  if (!GEMINI_API_KEY) {
    return {
      success: false,
      detectedIngredients: [],
      estimatedMacros: { calories: 0, protein: 0, carbs: 0, fat: 0 },
      mealQuality: { score: 0, grade: 'F', feedback: ['API no configurada'] },
      suggestions: [],
    };
  }

  try {
    const imageParts = await prepareImagesForGemini([photoUrl]);
    if (imageParts.length === 0) {
      return {
        success: false,
        detectedIngredients: [],
        estimatedMacros: { calories: 0, protein: 0, carbs: 0, fat: 0 },
        mealQuality: { score: 0, grade: 'F', feedback: ['No se pudo cargar la imagen'] },
        suggestions: [],
      };
    }

    const prompt = `Eres HANK, nutricionista deportivo experto. Analiza esta foto de comida.

${userContext?.mealType ? `Tipo de comida: ${userContext.mealType}` : ''}
${userContext?.targetMacros ? `Macros objetivo: ${userContext.targetMacros.protein}P / ${userContext.targetMacros.carbs}C / ${userContext.targetMacros.fat}G` : ''}

Responde SOLO con JSON:
{
  "detectedIngredients": [
    { "name": "ingrediente", "estimatedQuantity": "Xg", "confidence": "low|medium|high" }
  ],
  "estimatedMacros": {
    "calories": number,
    "protein": number,
    "carbs": number,
    "fat": number
  },
  "mealQuality": {
    "score": number (0-100),
    "grade": "A|B|C|D|F",
    "feedback": ["string"]
  },
  "suggestions": ["string"]
}`;

    const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [...imageParts, { text: prompt }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 2048 },
      }),
    });

    if (!response.ok) throw new Error(`API error: ${response.status}`);

    const data = await response.json();
    const textResponse = data.candidates?.[0]?.content?.parts?.find((p: any) => p.text)?.text || '';

    const jsonMatch = textResponse.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON found');

    const result = JSON.parse(jsonMatch[0]);
    result.success = true;

    console.warn(
      `✅ Foto de comida analizada: ${result.detectedIngredients?.length} ingredientes, ${result.estimatedMacros?.calories}kcal`
    );

    return result;
  } catch (error) {
    console.error('❌ Error analizando foto de comida:', error);
    return {
      success: false,
      detectedIngredients: [],
      estimatedMacros: { calories: 0, protein: 0, carbs: 0, fat: 0 },
      mealQuality: { score: 0, grade: 'F', feedback: [`Error: ${error}`] },
      suggestions: [],
    };
  }
}

/**
 * Genera un timeline de progreso analizando múltiples fotos
 */
export async function generateProgressTimeline(
  photos: Array<{ url: string; date: string; weight?: number }>,
  userGoal?: string
): Promise<ProgressTimeline> {
  if (!GEMINI_API_KEY || photos.length < 2) {
    return createEmptyTimeline('Se necesitan al menos 2 fotos');
  }

  // Limitar a 5 fotos para no exceder límites de API
  const selectedPhotos = photos.slice(0, 5);

  try {
    const imageParts = await prepareImagesForGemini(selectedPhotos.map((p) => p.url));
    if (imageParts.length < 2) {
      return createEmptyTimeline('No se pudieron cargar las imágenes');
    }

    const photoInfo = selectedPhotos
      .map((p, i) => `Foto ${i + 1}: ${p.date}${p.weight ? ` (${p.weight}kg)` : ''}`)
      .join('\n');

    const prompt = `${BODY_ANALYSIS_SYSTEM_PROMPT}

Analiza esta secuencia de fotos de progreso físico y genera un timeline completo.

FOTOS (en orden cronológico):
${photoInfo}

${userGoal ? `OBJETIVO DEL USUARIO: ${userGoal}` : ''}

Responde SOLO con JSON:
{
  "trends": {
    "bodyFat": "decreasing|stable|increasing|fluctuating",
    "muscleMass": "decreasing|stable|increasing|fluctuating",
    "overall": "regression|maintenance|slow-progress|good-progress|rapid-progress"
  },
  "periods": [
    {
      "startDate": "string",
      "endDate": "string",
      "phase": "bulk|cut|maintain",
      "effectiveness": number (1-10),
      "notes": "string"
    }
  ],
  "stats": {
    "bestPeriod": { "dates": "string", "reason": "string" },
    "worstPeriod": { "dates": "string", "reason": "string" },
    "averageProgressPerMonth": number
  },
  "predictions": {
    "estimatedTimeToGoal": "string",
    "nextMilestone": "string",
    "recommendedPhase": "bulk|cut|maintain|recomp",
    "confidenceLevel": "low|medium|high"
  },
  "summary": "string (2-3 oraciones)"
}`;

    const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [...imageParts, { text: prompt }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 3000 },
      }),
    });

    if (!response.ok) throw new Error(`API error: ${response.status}`);

    const data = await response.json();
    const textResponse = data.candidates?.[0]?.content?.parts?.find((p: any) => p.text)?.text || '';

    const jsonMatch = textResponse.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON found');

    const result = JSON.parse(jsonMatch[0]) as ProgressTimeline;
    result.success = true;
    result.totalPhotos = selectedPhotos.length;
    result.dateRange = {
      start: selectedPhotos[0].date,
      end: selectedPhotos[selectedPhotos.length - 1].date,
      totalDays: Math.abs(
        Math.round(
          (new Date(selectedPhotos[selectedPhotos.length - 1].date).getTime() -
            new Date(selectedPhotos[0].date).getTime()) /
            (1000 * 60 * 60 * 24)
        )
      ),
    };

    console.warn(
      `✅ Timeline generado: ${result.totalPhotos} fotos, ${result.dateRange.totalDays} días, Tendencia: ${result.trends?.overall}`
    );

    return result;
  } catch (error) {
    console.error('❌ Error generando timeline:', error);
    return createEmptyTimeline(`Error: ${error}`);
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function createEmptySingleAnalysis(message: string): SinglePhotoAnalysis {
  return {
    success: false,
    dateAnalyzed: new Date().toISOString(),
    poseType: 'other',
    lightingQuality: 'poor',
    photoQuality: 'low',
    bodyComposition: {
      bodyFatPercentage: { estimate: 0, range: { min: 0, max: 0 }, confidence: 'low' },
      visibleAbsLevel: 0,
      vascularity: 'none',
      muscleSeparation: 'minimal',
      overallCondition: 'off-season',
    },
    muscleGroups: [],
    posture: {
      overallPosture: 'fair',
      shoulderAlignment: 'aligned',
      hipAlignment: 'aligned',
      spineAlignment: 'straight',
      imbalances: [],
      recommendations: [message],
    },
    overallPhysique: {
      score: 0,
      category: 'beginner',
      strengths: [],
      areasToImprove: [message],
    },
    trainingRecommendations: {
      priorityMuscles: [],
      suggestedFocus: 'N/A',
      volumeRecommendation: 'maintain',
      notes: [message],
    },
    nutritionRecommendations: {
      phase: 'maintain',
      adjustments: [],
      notes: [message],
    },
  };
}

function createEmptyComparisonAnalysis(message: string): PhotoComparisonAnalysis {
  return {
    success: false,
    photo1Date: '',
    photo2Date: '',
    daysBetween: 0,
    changes: {
      bodyFatChange: { direction: 'maintained', estimatedChange: 0, confidence: 'low' },
      muscleChanges: [],
      overallProgress: { direction: 'maintained', score: 0 },
    },
    visualChanges: { improvements: [], regressions: [], noChange: [message] },
    progressMetrics: {
      transformationScore: 0,
      consistency: 'inconsistent',
      trajectory: 'stagnant',
    },
    feedback: {
      positives: [],
      concerns: [message],
      actionItems: [],
      motivationalMessage: 'No se pudo completar el análisis.',
    },
  };
}

function createEmptyTimeline(message: string): ProgressTimeline {
  return {
    success: false,
    totalPhotos: 0,
    dateRange: { start: '', end: '', totalDays: 0 },
    trends: { bodyFat: 'stable', muscleMass: 'stable', overall: 'maintenance' },
    periods: [],
    stats: {
      bestPeriod: { dates: 'N/A', reason: message },
      worstPeriod: { dates: 'N/A', reason: message },
      averageProgressPerMonth: 0,
    },
    predictions: {
      estimatedTimeToGoal: 'N/A',
      nextMilestone: 'N/A',
      recommendedPhase: 'maintain',
      confidenceLevel: 'low',
    },
    summary: message,
  };
}
