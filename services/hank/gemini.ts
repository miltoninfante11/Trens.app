// ============================================================================
// GEMINI SERVICE - Conexión con Google Gemini AI para HANK
// ============================================================================

import { TOOL_DEFINITIONS } from './tools';
import { SPORT_TOOL_DEFINITIONS } from './sportTools';
import type { HankToolCall, HankToolName, ToolDefinition } from '../../types/hank';

// ============================================================================
// ALL TOOLS - Combina herramientas base + deportes
// ============================================================================
const ALL_TOOL_DEFINITIONS: ToolDefinition[] = [...TOOL_DEFINITIONS, ...SPORT_TOOL_DEFINITIONS];

// 🔍 DEBUG: Log al cargar el módulo para verificar que las herramientas se cargan
console.warn(
  `🚀 GEMINI MODULE LOADED - TOOL_DEFINITIONS: ${TOOL_DEFINITIONS.length}, SPORT_TOOL_DEFINITIONS: ${SPORT_TOOL_DEFINITIONS.length}, TOTAL: ${ALL_TOOL_DEFINITIONS.length}`
);

// ============================================================================
// PREPROCESADOR INTELIGENTE v3.0 - Normalización y enriquecimiento de input
// ============================================================================

/**
 * Normaliza el input del usuario:
 * - Convierte números en texto a dígitos
 * - Expande abreviaciones comunes
 * - Normaliza sinónimos de acciones
 * - Corrige errores tipográficos comunes
 */
function preprocessUserInput(text: string, context?: GeminiContext): string {
  let result = text;

  // 1. Convertir números en español a dígitos
  result = convertSpanishNumbers(result);

  // 2. Expandir abreviaciones y jerga fitness
  result = expandAbbreviations(result);

  // 3. Normalizar sinónimos de acciones
  result = normalizeActionSynonyms(result);

  // 4. Resolver referencias contextuales
  if (context?.activeAsset) {
    result = resolveContextualReferences(result, context);
  }

  // Solo loguear si hubo cambios
  if (result !== text) {
    console.warn(`🔧 PREPROCESSOR: "${text}" → "${result}"`);
  }

  return result;
}

// Convertir números en español
function convertSpanishNumbers(text: string): string {
  const numberMap: [RegExp, string][] = [
    // Centenas compuestas
    [/ciento\s+cuarenta/gi, '140'],
    [/ciento\s+cincuenta/gi, '150'],
    [/ciento\s+sesenta/gi, '160'],
    [/ciento\s+setenta/gi, '170'],
    [/ciento\s+ochenta/gi, '180'],
    [/ciento\s+noventa/gi, '190'],
    [/ciento\s+diez/gi, '110'],
    [/ciento\s+veinte/gi, '120'],
    [/ciento\s+treinta/gi, '130'],
    [/doscientos|doscientas/gi, '200'],
    [/trescientos|trescientas/gi, '300'],
    // Veinti- compuestos
    [/veinticinco/gi, '25'],
    [/veinticuatro/gi, '24'],
    [/veintitr[eé]s/gi, '23'],
    [/veintid[oó]s/gi, '22'],
    [/veintiun[oa]/gi, '21'],
    [/veintinueve/gi, '29'],
    [/veintiocho/gi, '28'],
    [/veintisiete/gi, '27'],
    [/veintis[eé]is/gi, '26'],
    // Decenas
    [/\bnoventa\b/gi, '90'],
    [/\bochenta\b/gi, '80'],
    [/\bsetenta\b/gi, '70'],
    [/\bsesenta\b/gi, '60'],
    [/\bcincuenta\b/gi, '50'],
    [/\bcuarenta\b/gi, '40'],
    [/\btreinta\b/gi, '30'],
    [/\bveinte\b/gi, '20'],
    // Teens
    [/\bdiecinueve\b/gi, '19'],
    [/\bdieciocho\b/gi, '18'],
    [/\bdiecisiete\b/gi, '17'],
    [/\bdiecis[eé]is\b/gi, '16'],
    [/\bquince\b/gi, '15'],
    [/\bcatorce\b/gi, '14'],
    [/\btrece\b/gi, '13'],
    [/\bdoce\b/gi, '12'],
    [/\bonce\b/gi, '11'],
    [/\bdiez\b/gi, '10'],
    // Unidades
    [/\bnueve\b/gi, '9'],
    [/\bocho\b/gi, '8'],
    [/\bsiete\b/gi, '7'],
    [/\bseis\b/gi, '6'],
    [/\bcinco\b/gi, '5'],
    [/\bcuatro\b/gi, '4'],
    [/\btres\b/gi, '3'],
    [/\bdos\b/gi, '2'],
    [/\bun[ao]?\b/gi, '1'],
    [/\bcien\b/gi, '100'],
    [/\bcero\b/gi, '0'],
  ];

  let result = text;
  for (const [regex, replacement] of numberMap) {
    result = result.replace(regex, replacement);
  }
  return result;
}

// Expandir abreviaciones fitness
function expandAbbreviations(text: string): string {
  const abbreviations: [RegExp, string][] = [
    // Series y repeticiones
    [/\breps?\b/gi, 'repeticiones'],
    [/\bsets?\b/gi, 'series'],
    [/\bpr\b/gi, 'personal record'],
    [/\brm\b/gi, 'repetición máxima'],
    [/\b1rm\b/gi, '1 repetición máxima'],
    // Ejercicios comunes
    [/\bbench\b/gi, 'bench press'],
    [/\bsquat\b/gi, 'squat'],
    [/\bdl\b/gi, 'deadlift'],
    [/\bohp\b/gi, 'overhead press'],
    [/\bpull ups?\b/gi, 'pull-ups'],
    [/\bcurl\b/gi, 'curl'],
    // Músculos
    [/\bpecs?\b/gi, 'pecho'],
    [/\bquads?\b/gi, 'cuádriceps'],
    [/\bhams?\b/gi, 'isquiotibiales'],
    [/\blats?\b/gi, 'dorsales'],
    [/\btraps?\b/gi, 'trapecios'],
    [/\bdelts?\b/gi, 'deltoides'],
    [/\bglutes?\b/gi, 'glúteos'],
    [/\babs?\b/gi, 'abdominales'],
    // Suplementos
    [/\bwhey\b/gi, 'proteína whey'],
    [/\bcre\b/gi, 'creatina'],
    [/\bpre\b/gi, 'pre-entreno'],
    [/\bpost\b/gi, 'post-entreno'],
    // Métricas
    [/\bkg\b/gi, 'kilogramos'],
    [/\blbs?\b/gi, 'libras'],
    [/\bkcal\b/gi, 'calorías'],
    [/\bg\b(?=\s+de\s+prote[ií]na)/gi, 'gramos'],
  ];

  let result = text;
  for (const [regex, replacement] of abbreviations) {
    result = result.replace(regex, replacement);
  }
  return result;
}

// Normalizar sinónimos de acciones
function normalizeActionSynonyms(text: string): string {
  const synonyms: [RegExp, string][] = [
    // Agregar
    [/\b(pon|ponme|mete|incluye|inserta)\b/gi, 'agrega'],
    // Quitar
    [/\b(saca|borra|remueve|retira)\b/gi, 'quita'],
    // Modificar
    [/\b(actualiza|edita|ajusta)\b/gi, 'modifica'],
    // Mostrar
    [/\b(enséñame|muéstrame|dime|dame)\b/gi, 'muestra'],
    // Crear
    [/\b(hazme|prepárame|diseñame|arma|construye)\b/gi, 'crea'],
    // Incrementar
    [/\b(incrementa|aumenta|súbele)\b/gi, 'sube'],
    // Decrementar
    [/\b(disminuye|reduce|bájale)\b/gi, 'baja'],
  ];

  let result = text;
  for (const [regex, replacement] of synonyms) {
    result = result.replace(regex, replacement);
  }
  return result;
}

// Resolver referencias contextuales
function resolveContextualReferences(text: string, context: GeminiContext): string {
  const contextualPhrases = [
    /\beste ejercicio\b/gi,
    /\bel actual\b/gi,
    /\bel que estoy viendo\b/gi,
    /\bel de ahora\b/gi,
    /\béste\b/gi,
    /\besto\b/gi,
  ];

  let result = text;
  if (context.activeAsset?.name) {
    for (const regex of contextualPhrases) {
      result = result.replace(regex, context.activeAsset.name);
    }
  }
  return result;
}

// Alias para compatibilidad
function preprocessSpanishNumbers(text: string): string {
  return preprocessUserInput(text);
}

// ============================================================================
// TYPES
// ============================================================================
interface GeminiMessage {
  role: 'user' | 'model';
  parts: Array<
    | { text: string }
    | { functionCall: GeminiFunctionCall }
    | { functionResponse: GeminiFunctionResponse }
    | { inlineData: { mimeType: string; data: string } } // Para imágenes
  >;
}

interface GeminiFunctionCall {
  name: string;
  args: Record<string, unknown>;
}

interface GeminiFunctionResponse {
  name: string;
  response: Record<string, unknown>;
}

interface GeminiToolDeclaration {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<
      string,
      {
        type: string;
        description: string;
        enum?: string[];
      }
    >;
    required: string[];
  };
}

interface GeminiResponse {
  candidates: Array<{
    content: {
      parts: Array<{
        text?: string;
        functionCall?: GeminiFunctionCall;
      }>;
    };
    finishReason: string;
  }>;
}

// ============================================================================
// GEMINI API CONFIG
// ============================================================================
// gemini-2.0-flash - modelo estable para function calling con muchas herramientas
// NOTA: gemini-2.5-flash tiene "thinking" que consume tokens con 107 tools
const GEMINI_API_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

// ============================================================================
// IMAGE UTILITIES - Para análisis visual de fotos de progreso
// ============================================================================

/**
 * Convierte una URL de imagen a base64 para enviar a Gemini
 * Usa fetch para obtener la imagen y la convierte a base64
 */
async function imageUrlToBase64(url: string): Promise<{ data: string; mimeType: string } | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.warn(`⚠️ No se pudo obtener imagen: ${url}`);
      return null;
    }

    const blob = await response.blob();
    const mimeType = blob.type || 'image/jpeg';

    // Convertir blob a base64
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        // Remover el prefijo "data:image/...;base64,"
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
 * Prepara las fotos de progreso para enviar a Gemini
 * Solo incluye las 2 más recientes para no exceder límites
 */
async function prepareProgressPhotosForGemini(
  photos: GeminiContext['progressPhotos']
): Promise<Array<{ inlineData: { mimeType: string; data: string } }>> {
  if (!photos || photos.length === 0) return [];

  const photoParts: Array<{ inlineData: { mimeType: string; data: string } }> = [];

  // Solo las 2 fotos más recientes para análisis visual
  const recentPhotos = photos.slice(0, 2);

  for (const photo of recentPhotos) {
    const imageData = await imageUrlToBase64(photo.url);
    if (imageData) {
      photoParts.push({
        inlineData: {
          mimeType: imageData.mimeType,
          data: imageData.data,
        },
      });
    }
  }

  console.warn(`📸 Fotos de progreso preparadas para Gemini: ${photoParts.length}`);
  return photoParts;
}

// ============================================================================
// CONVERT TOOL DEFINITIONS TO GEMINI FORMAT
// ============================================================================
function convertToGeminiTools(tools: ToolDefinition[]): GeminiToolDeclaration[] {
  return tools.map((tool, index) => {
    // Validar que el tool tiene todos los campos requeridos
    if (!tool.name || !tool.description) {
      console.warn(`⚠️ Tool #${index} inválido:`, tool);
    }
    return {
      name: tool.name,
      description: tool.description,
      parameters: {
        type: 'object',
        properties: Object.fromEntries(
          Object.entries(tool.parameters || {}).map(([key, param]) => [
            key,
            {
              type: param.type,
              description: param.description,
              ...(param.enum ? { enum: param.enum } : {}),
              // Gemini requiere 'items' para arrays
              ...(param.type === 'array' && param.items ? { items: param.items } : {}),
            },
          ])
        ),
        required: tool.requiredParams || [],
      },
    };
  });
}

// ============================================================================
// EXERCISE KNOWLEDGE BASE - Conocimiento técnico de ejercicios
// ============================================================================
function getExerciseKnowledge(exerciseName: string): string {
  const knowledge: Record<string, string> = {
    'BENCH PRESS': `
BENCH PRESS (Press de Banca)
• Músculos: Pectoral mayor, deltoides anterior, tríceps
• Postura: Espalda arqueada naturalmente, escápulas retraídas, pies firmes
• Agarre: Ligeramente más ancho que hombros, muñecas rectas
• Ejecución: Baja la barra al pecho (línea de pezones), codos a 45-75°, empuja explosivo
• Respiración: Inhala al bajar, exhala al empujar
• Errores comunes: Rebotar en pecho, levantar glúteos, codos muy abiertos
• Tips: Aprieta glúteos y abdomen, imagina "doblar la barra"`,

    SQUAT: `
SQUAT (Sentadilla)
• Músculos: Cuádriceps, glúteos, isquiotibiales, core
• Postura: Pies a anchura de hombros, puntas ligeramente afuera
• Profundidad: Al menos paralelo, idealmente ATG (ass to grass)
• Ejecución: Inicia llevando cadera atrás, rodillas siguen línea de pies
• Respiración: Inhala profundo y aguanta (Valsalva), exhala al subir
• Errores comunes: Rodillas adentro, talones despegados, espalda redondeada
• Tips: Mira al frente, pecho arriba, empuja desde talones`,

    DEADLIFT: `
DEADLIFT (Peso Muerto)
• Músculos: Espalda baja, glúteos, isquiotibiales, trapecios, antebrazos
• Postura: Pies a anchura de cadera, barra sobre medio del pie
• Agarre: Justo fuera de piernas, mixto o doble prono
• Ejecución: Empuja el suelo con pies, barra pegada al cuerpo
• Respiración: Inhala abajo, core apretado, exhala arriba
• Errores comunes: Espalda redondeada, barra lejos del cuerpo, tirar con brazos
• Tips: "Empuja el suelo, no tires la barra"`,

    'SHOULDER PRESS': `
SHOULDER PRESS (Press de Hombros)
• Músculos: Deltoides (anterior, medio), tríceps, trapecio superior
• Postura: De pie o sentado, core apretado, espalda neutra
• Agarre: Ligeramente más ancho que hombros
• Ejecución: Barra a clavículas, empuja vertical, cabeza ligeramente atrás
• Respiración: Inhala abajo, exhala al empujar
• Errores comunes: Arquear demasiado la espalda, empujar hacia adelante
• Tips: Aprieta glúteos, termina con brazos junto a orejas`,

    'PULL-UPS': `
PULL-UPS (Dominadas)
• Músculos: Dorsal ancho, bíceps, romboides, trapecio medio
• Agarre: Prono (palmas adelante), más ancho que hombros
• Ejecución: Cuelga extendido, tira llevando codos hacia caderas
• Respiración: Exhala al subir, inhala al bajar
• Errores comunes: Kipping excesivo, no bajar completamente
• Tips: Inicia retrayendo escápulas, pecho al frente, controla bajada`,

    'BICEP CURL': `
BICEP CURL (Curl de Bíceps)
• Músculos: Bíceps braquial, braquial, braquiorradial
• Postura: De pie, codos pegados al cuerpo, hombros atrás
• Ejecución: Flexiona solo el codo, contrae arriba, baja controlado
• Respiración: Exhala al subir, inhala al bajar
• Errores comunes: Balancear cuerpo, mover codos, momentum excesivo
• Tips: 2-3 seg bajando, squeeze arriba, peso que permita control`,

    'TRICEP DIPS': `
TRICEP DIPS (Fondos de Tríceps)
• Músculos: Tríceps, deltoides anterior, pectoral inferior
• Postura: Manos en paralelas, cuerpo inclinado adelante
• Ejecución: Baja hasta 90° en codos, empuja hasta extensión completa
• Respiración: Inhala al bajar, exhala al subir
• Errores comunes: Bajar demasiado (daño hombro), encogerse
• Tips: Escápulas abajo y atrás, core apretado, controla descenso`,

    PLANK: `
PLANK (Plancha)
• Músculos: Core completo (recto abdominal, oblicuos, transverso), hombros
• Postura: Antebrazos y puntas de pies, cuerpo en línea recta
• Ejecución: Cadera neutra, aprieta glúteos, hombros sobre codos
• Respiración: Controlada, no aguantes el aire
• Errores comunes: Cadera muy alta o baja, mirar hacia arriba
• Tips: Imagina "juntar codos y pies", calidad > tiempo`,
  };

  const upperName = exerciseName.toUpperCase();
  if (knowledge[upperName]) {
    return knowledge[upperName];
  }

  return `Ejercicio: ${exerciseName}. Mantén técnica estricta, controla el movimiento, respira correctamente.`;
}

// ============================================================================
// USER PLAN SECTION - Genera resumen del plan actual del usuario
// ============================================================================
function getUserPlanSection(context: GeminiContext): string {
  const plan = context.userPlanContext;

  if (!plan) {
    return `[📋 PLAN ACTUAL DEL USUARIO]
⚠️ No se pudo cargar el plan. Usa GET_FULL_USER_CONTEXT para obtener información completa.`;
  }

  const bio = plan.biometrics;
  const hasBiometrics = bio && (bio.weight || bio.height || bio.age || bio.goal);
  const hasMeals = plan.meals && plan.meals.length > 0;
  const hasSupplements = plan.supplements && plan.supplements.length > 0;
  const hasTraining = plan.training && plan.training.frequency > 0;

  // Formatear hora
  const formatTime = (t: string) => {
    if (!t) return '';
    const [h, m] = t.split(':').map(Number);
    const period = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    return `${h12}:${m?.toString().padStart(2, '0') || '00'} ${period}`;
  };

  // Generar sección de biométricos (TRENS ID / ADN) - COMPLETA
  const biometricsSection = hasBiometrics
    ? `👤 DATOS DEL USUARIO (ADN/TRENS ID):
  • Peso: ${bio.weight ? `${bio.weight}kg` : '❓ No configurado'}
  • Altura: ${bio.height ? `${bio.height}cm` : '❓ No configurado'}
  • Edad: ${bio.age ? `${bio.age} años` : '❓ No configurado'}
  • Sexo: ${bio.sex || '❓ No configurado'}
  • Grasa corporal: ${bio.bodyFat ? `${bio.bodyFat}%` : '❓ No configurado'}
  • Masa muscular: ${bio.muscleMass ? `${bio.muscleMass}kg` : '❓ No configurado'}
  • Objetivo: ${bio.goal || '❓ No configurado'}
  • Nivel de actividad: ${bio.activityLevel || '❓ No configurado'}
  • Experiencia: ${bio.trainingExperience || '❓ No configurado'}
  • Metabolismo: ${bio.metabolicRate || '❓ No configurado'}
  • Días entreno/semana: ${bio.trainingDaysPerWeek || '❓ No configurado'}
  🚨 LESIONES: ${bio.injuries || 'Ninguna registrada'}
  ⚠️ ALERGIAS ALIMENTARIAS: ${bio.allergies || 'Ninguna registrada'}
  • BMR (metabolismo basal): ${bio.bmr ? `${bio.bmr} kcal` : '❓ No calculado'}
  • TDEE (gasto diario): ${bio.tdee ? `${bio.tdee} kcal` : '❓ No calculado'}`
    : `👤 DATOS DEL USUARIO: ❌ Sin datos biométricos configurados`;

  // Generar sección de comidas CON MACROS DETALLADOS
  const mealsSection = hasMeals
    ? `🍽️ COMIDAS (${plan.meals.length}):
${plan.meals
  .map((m, i) => {
    const time = m.time ? formatTime(m.time) : '';
    const macrosLine = m.macros
      ? `\n     📊 Macros: ${m.macros.calories}kcal | Proteína: ${m.macros.protein}g | Carbos: ${m.macros.carbs}g | Grasa: ${m.macros.fat}g`
      : '\n     📊 Macros: ❓ Sin calcular';
    const ings =
      m.ingredients.length > 0 ? m.ingredients.join(', ') : 'Sin ingredientes detallados';
    return `  ${i + 1}. ${m.name}${time ? ` (${time})` : ''}\n     🥗 Ingredientes: ${ings}${macrosLine}`;
  })
  .join('\n')}`
    : `🍽️ COMIDAS: ❌ Sin plan de nutrición configurado`;

  // Generar sección de suplementos - soportar múltiples horarios
  const supplementsSection = hasSupplements
    ? `💊 STACK DE SUPLEMENTOS (${plan.supplements.length}):
${plan.supplements
  .map((s) => {
    // Si tiene times (array), mostrar todos; si no, usar time
    let timingInfo = '';
    if (s.times && s.times.length > 0) {
      timingInfo = ` (${s.times.map((t) => formatTime(t)).join(', ')})`;
    } else if (s.time) {
      timingInfo = ` (${formatTime(s.time)})`;
    }
    return `  • ${s.name} - ${s.dose}${timingInfo}`;
  })
  .join('\n')}`
    : `💊 STACK: ❌ Sin suplementos configurados`;

  // Generar sección de entrenamiento
  const trainingSection = hasTraining
    ? `🏋️ ENTRENAMIENTO:
  • Frecuencia: ${plan.training.frequency} días/semana
  • Día actual: ${plan.training.currentDay + 1}
  • Rutinas: ${
    Object.entries(plan.training.routineNames)
      .map(([day, name]) => `Día ${parseInt(day) + 1}: ${name}`)
      .join(', ') || 'Sin nombres'
  }`
    : `🏋️ ENTRENAMIENTO: ❌ Sin rutina configurada`;

  // Calcular totales diarios de macros
  let totalMacros = { calories: 0, protein: 0, carbs: 0, fat: 0 };
  if (hasMeals) {
    plan.meals.forEach((m) => {
      if (m.macros) {
        totalMacros.calories += m.macros.calories || 0;
        totalMacros.protein += m.macros.protein || 0;
        totalMacros.carbs += m.macros.carbs || 0;
        totalMacros.fat += m.macros.fat || 0;
      }
    });
  }
  const hasTotals = totalMacros.calories > 0;
  const totalsSection = hasTotals
    ? `📈 TOTALES DIARIOS:
  • Calorías: ${totalMacros.calories} kcal
  • Proteína: ${totalMacros.protein}g
  • Carbohidratos: ${totalMacros.carbs}g
  • Grasa: ${totalMacros.fat}g`
    : '';

  return `[📋 PERFIL COMPLETO DEL USUARIO - YA TIENES TODA ESTA INFO]
${hasBiometrics ? '✅' : '❌'} Datos biométricos ${hasBiometrics ? '(peso, altura, objetivo)' : '- No configurado'}
${hasMeals ? '✅' : '❌'} Nutrición ${hasMeals ? `(${plan.meals.length} comidas)` : '- No configurado'}
${hasSupplements ? '✅' : '❌'} Stack ${hasSupplements ? `(${plan.supplements.length} suplementos)` : '- No configurado'}
${hasTraining ? '✅' : '❌'} Entrenamiento ${hasTraining ? `(${plan.training.frequency} días/semana)` : '- No configurado'}

${biometricsSection}

${mealsSection}

${hasTotals ? totalsSection + '\n' : ''}
${supplementsSection}

${trainingSection}

⚡ REGLA CRÍTICA - RESPONDE DIRECTAMENTE CON ESTA INFO:
• "¿cuál es mi stack?" → Responde con la sección STACK DE SUPLEMENTOS de arriba
• "¿qué peso tengo?" / "¿cuál es mi objetivo?" → Responde con DATOS DEL USUARIO de arriba
• "¿cuántas calorías tengo?" → Responde con TOTALES DIARIOS de arriba
• "¿qué debo comer?" → Responde con la sección COMIDAS de arriba
• NUNCA ejecutes herramientas de lectura si la info ya está aquí
• SOLO usa GET_FULL_USER_CONTEXT si necesitas más detalles que no están arriba

🚨 MANEJO DE DATOS FALTANTES:
• Si el peso dice "❓ No configurado" → Pregunta al usuario cuánto pesa y USA ADN_UPDATE_PROFILE(field="weight", value=X)
• Si la altura dice "❓ No configurado" → Pregunta al usuario y USA ADN_UPDATE_PROFILE(field="height", value=X)
• NUNCA digas "No tengo esa información en mi contexto" - SÍ tienes el contexto, solo puede estar vacío
• Si un dato está vacío, OFRECE ayudar a configurarlo con la herramienta apropiada`;
}

// ============================================================================
// SYSTEM PROMPT GENERATOR - HANK v3.0 OMNIPOTENT
// ============================================================================

// ============================================================================
// INTENT DETECTION - Clasificar la intención del usuario
// ============================================================================
type UserIntent =
  | 'query_info' // Preguntar información
  | 'modify_data' // Modificar datos
  | 'create_plan' // Crear plan completo
  | 'analyze' // Analizar progreso/datos
  | 'execute_action' // Acción directa
  | 'conversational' // Chat normal
  | 'confirm_action' // Confirmar acción previa
  | 'unknown';

function detectUserIntent(message: string): UserIntent {
  const lower = message.toLowerCase().trim();

  // Patrones de CONFIRMACIÓN (prioridad alta)
  if (/^(sí|si|dale|ok|okey|está bien|confirmo|hazlo|ejecuta|aplica|guarda|listo)$/i.test(lower)) {
    return 'confirm_action';
  }

  // Patrones de CONSULTA (sin modificar datos)
  if (
    /^(qué|que|cuál|cual|cuánto|cuanto|cómo|como|dónde|donde|cuándo|cuando|muéstrame|muestrame|enséñame|ver|dame|tengo|estoy)/i.test(
      lower
    )
  ) {
    return 'query_info';
  }

  // Patrones de ANÁLISIS
  if (
    /analiza|compara|evalúa|evalua|progreso|evolución|evolucion|cómo me ve|como me ve|qué tal voy|que tal voy/i.test(
      lower
    )
  ) {
    return 'analyze';
  }

  // Patrones de CREACIÓN DE PLAN
  if (
    /crea|hazme|diseña|arma|prepara|construye|genera.*plan|dieta|rutina|entrenamiento completo/i.test(
      lower
    )
  ) {
    return 'create_plan';
  }

  // Patrones de MODIFICACIÓN
  if (
    /agrega|añade|quita|elimina|borra|cambia|modifica|actualiza|sube|baja|pon|reemplaza|configura|ajusta/i.test(
      lower
    )
  ) {
    return 'modify_data';
  }

  // Patrones de ACCIÓN DIRECTA
  if (/activa|desactiva|ejecuta|inicia|termina|guarda|aplica|sincroniza|recalcula/i.test(lower)) {
    return 'execute_action';
  }

  // Por defecto: conversacional
  return 'conversational';
}

// ============================================================================
// CONTEXT ENRICHMENT - Enriquecer contexto para mejor respuesta
// ============================================================================
function getRelevantContextSection(context: GeminiContext, intent: UserIntent): string {
  const sections: string[] = [];

  // Siempre incluir info básica del usuario si está disponible
  if (context.userPlanContext?.biometrics) {
    const bio = context.userPlanContext.biometrics;
    const hasData = bio.weight || bio.height || bio.goal;
    if (hasData) {
      sections.push(
        `🧬 PERFIL: ${bio.weight ? `${bio.weight}kg` : '?'}${bio.height ? ` | ${bio.height}cm` : ''}${bio.goal ? ` | Objetivo: ${bio.goal}` : ''}`
      );
    }
  }

  // Según la intención, agregar contexto relevante
  switch (intent) {
    case 'query_info':
    case 'analyze':
      // Para consultas, incluir resumen completo
      if (context.userPlanContext) {
        const plan = context.userPlanContext;
        if (plan.meals.length > 0) {
          sections.push(`🍽️ ${plan.meals.length} comidas configuradas`);
        }
        if (plan.supplements.length > 0) {
          sections.push(`💊 ${plan.supplements.length} suplementos activos`);
        }
        if (plan.training.frequency > 0) {
          sections.push(
            `🏋️ ${plan.training.frequency} días/semana | Día ${plan.training.currentDay + 1}`
          );
        }
      }
      break;

    case 'modify_data':
    case 'execute_action':
      // Para modificaciones, incluir ejercicio activo si hay
      if (context.activeAsset) {
        sections.push(`🎯 EJERCICIO ACTIVO: ${context.activeAsset.name}`);
      }
      break;

    case 'create_plan':
      // Para crear planes, incluir lo que falta
      if (context.userPlanContext) {
        const plan = context.userPlanContext;
        const missing: string[] = [];
        if (plan.meals.length === 0) missing.push('nutrición');
        if (plan.supplements.length === 0) missing.push('suplementos');
        if (plan.training.frequency === 0) missing.push('entrenamiento');
        if (missing.length > 0) {
          sections.push(`⚠️ FALTA CONFIGURAR: ${missing.join(', ')}`);
        }
      }
      break;
  }

  return sections.length > 0 ? sections.join('\n') : '';
}

function generateSystemPrompt(context: GeminiContext): string {
  // Helper para obtener directivas específicas por deporte
  const getSportDirectives = (sport: string | null): string => {
    const sportMode = (sport || 'BODYBUILDING').toUpperCase();
    const directives: Record<string, string> = {
      GYM: `• Enfoque: Hipertrofia, fuerza, composición corporal
• Métricas clave: PRs, volumen semanal, progresión de cargas
• Vocabulario: sets, reps, al fallo, pump, gains, deload`,
      MOTO: `• Enfoque: Rendimiento en pista, tiempos por vuelta, consistencia
• Métricas clave: Mejor vuelta, sector times, ritmo de carrera
• Vocabulario: apex, trazada, frenada, gas, lean angle`,
      SURF: `• Enfoque: Sesiones, condiciones, progresión de maniobras
• Métricas clave: Tiempo en agua, olas tomadas, maniobras landed
• Vocabulario: swell, offshore, bottom turn, cutback, lineup`,
      COMBAT: `• Enfoque: Técnica de golpeo, cardio, potencia
• Métricas clave: Rounds, combinaciones, intensidad
• Vocabulario: jab, cross, hook, clinch, sparring`,
      ENDURANCE: `• Enfoque: Resistencia aeróbica, pacing, recuperación
• Métricas clave: Distancia, pace, zonas de FC, VO2max
• Vocabulario: tempo, intervals, threshold, splits`,
      BODYBUILDING: `• Enfoque: Hipertrofia, simetría, definición
• Métricas clave: Volumen, TUT, conexión mente-músculo
• Vocabulario: pump, MMC, drop sets, supersets`,
    };
    return directives[sportMode] || directives.BODYBUILDING;
  };

  // Generar la sección de contexto de ejercicio activo
  const getActiveAssetContext = (): string => {
    if (!context.activeAsset) return 'No hay ejercicio activo en pantalla.';

    // 🐛 DEBUG: Ver qué hay en liquidData
    console.warn('🧠 HANK liquidData keys:', Object.keys(context.activeAsset.liquidData || {}));
    console.warn(
      '🧠 HANK videoHistory:',
      JSON.stringify(context.activeAsset.liquidData?.videoHistory || 'VACÍO')
    );
    console.warn('🧠 HANK notes:', context.activeAsset.liquidData?.notes || 'SIN NOTAS');

    const series =
      (context.activeAsset.liquidData?.custom_series as
        | Array<{ id: string; reps: number; weight: number; type: string }>
        | undefined) || [];
    const seriesCount = series.length;
    const lastIndex = seriesCount > 0 ? seriesCount - 1 : 0;
    const isAlternative = context.activeAsset.isAlternative || false;
    const parentName = context.activeAsset.parentExerciseName || '';

    // Extraer notas e historial de liquidData
    const notes = context.activeAsset.liquidData?.notes as string | undefined;
    const todayNotes = context.activeAsset.liquidData?.todayNotes as string | undefined;
    const videoHistory = context.activeAsset.liquidData?.videoHistory as
      | Array<{
          date: string;
          isToday: boolean;
          weightKg: number | null;
          reps: number | null;
          notes: string | null;
        }>
      | undefined;

    // Obtener configId para operaciones estables
    const configId = (context.activeAsset as { configId?: string }).configId || '';

    let assetContext = `
🎯 EJERCICIO EN PANTALLA: "${context.activeAsset.name}"
• ConfigID: ${configId}${configId ? ' (USAR ESTE ID PARA TODAS LAS OPERACIONES)' : ''}
• Tipo: ${context.activeAsset.type}${isAlternative ? ` (ALTERNATIVA de "${parentName}")` : ''}
• Series: ${seriesCount} (índices 0-${lastIndex})
${series.map((s, i) => `  [${i}] ${s.reps}×${s.weight}kg (${s.type})`).join('\n')}`;

    // Agregar notas del usuario
    if (notes) {
      assetContext += `\n\n📝 NOTAS DEL USUARIO: "${notes}"`;
    }

    // Agregar historial de videos con pesos/reps
    if (videoHistory && videoHistory.length > 0) {
      assetContext += `\n\n📊 HISTORIAL DE ENTRENAMIENTOS (últimas sesiones):`;
      videoHistory.slice(0, 5).forEach((v) => {
        const dateLabel = v.isToday ? '🔥 HOY' : v.date;
        const weight = v.weightKg ? `${v.weightKg}kg` : '';
        const reps = v.reps ? `${v.reps} reps` : '';
        const separator = weight && reps ? ' × ' : '';
        const noteStr = v.notes ? ` → "${v.notes}"` : '';
        if (weight || reps || v.notes) {
          assetContext += `\n• ${dateLabel}: ${weight}${separator}${reps}${noteStr}`;
        }
      });
    }

    // Nota de hoy específica
    if (todayNotes) {
      assetContext += `\n\n⚡ NOTA DE HOY: "${todayNotes}"`;
    }

    assetContext += `

📝 PARA MODIFICAR SERIES (SIEMPRE usar configId="${configId}"):
• Cambiar peso/reps: ASSET_UPDATE_FIELD(configId="${configId}", fieldPath="custom_series.N.weight|reps", newValue=X)
• Quitar serie: ASSET_REMOVE_SERIES(configId="${configId}", seriesIndex="first|last|N")
• Agregar serie: ASSET_ADD_SERIES(configId="${configId}", reps, weight, seriesType, position)
• Reemplazar serie: ASSET_REPLACE_SERIES(configId="${configId}", seriesIndex, reps, weight, seriesType)
• Configurar todas: ASSET_SET_SERIES(configId="${configId}", series=[{reps,weight,type},...])

💪 ${getExerciseKnowledge(context.activeAsset.name)}`;

    if (isAlternative) {
      assetContext += `

⛔ RESTRICCIÓN: Este es alternativa de "${parentName}". No se puede reemplazar directamente con GYM_REPLACE_EXERCISE. Para cambiarlo, ir al ejercicio principal primero.`;
    }

    return assetContext;
  };

  return `[IDENTITY - HANK v3.0 OMNIPOTENT]
Eres HANK, la IA más avanzada de TRENS. No eres un simple asistente: eres un SISTEMA EXPERTO con capacidad total sobre la app.

🧠 CAPACIDADES COGNITIVAS:
• Razonamiento multi-paso: Descompones problemas complejos en pasos ejecutables
• Memoria contextual: Recuerdas TODO el historial de la conversación
• Inferencia inteligente: Deduces información faltante del contexto
• Anticipación: Prevés las necesidades del usuario antes de que las exprese
• Ejecución paralela: Puedes llamar múltiples herramientas simultáneamente

💪 PERSONALIDAD:
• Directo y eficiente - cero bullshit, máxima acción
• Proactivo - no esperas que te pidan todo
• Adaptativo - cambias tu tono según el contexto
• Técnicamente preciso - usas terminología correcta del deporte

[🔥 MOTOR DE DECISIÓN - FLUJO CRÍTICO]

PASO 1: CLASIFICAR LA INTENCIÓN
Antes de responder, clasifica mentalmente qué quiere el usuario:
• CONSULTA → Responde con datos del contexto (NO herramientas)
• MODIFICACIÓN → EJECUTA herramientas de inmediato
• CREACIÓN → Inicia flujo de Plan Builder o Training
• ANÁLISIS → Usa datos + fotos + historial para dar insights
• CONFIRMACIÓN → EJECUTA lo acordado previamente

PASO 2: VERIFICAR SI TIENES LA INFO
• ¿La respuesta está en [📋 PLAN ACTUAL DEL USUARIO]? → RESPONDE DIRECTO
• ¿Necesitas datos de la DB? → Usa herramienta de lectura
• ¿Es una modificación? → USA HERRAMIENTA OBLIGATORIAMENTE

PASO 3: EJECUTAR CON INTELIGENCIA
• Si tienes TODA la info → Llama TODAS las herramientas necesarias de una vez
• Si falta info → Pregunta LO MÍNIMO necesario
• Si el usuario confirma ("sí", "dale") → EJECUTA SIN PREGUNTAR MÁS

[⚡ REGLAS DE ORO - ROMPER = FALLO TOTAL]

1. NUNCA respondas "Listo/Hecho" sin ANTES ejecutar una función
2. NUNCA pidas confirmación más de UNA vez
3. NUNCA preguntes info que ya tienes en el contexto o historial
4. NUNCA ignores el historial de la conversación
5. SIEMPRE usa herramientas para modificar datos
6. SIEMPRE responde en español natural (no técnico)

[🎯 MAPEO INTELIGENTE DE INTENCIONES → ACCIONES]

CONSULTAS (responde CON contexto, SIN herramientas):
• "¿cuál es mi stack?" → Info de suplementos del contexto
• "¿qué comidas tengo?" → Info de meals del contexto
• "¿cuánto peso?" → Biométricos del contexto
• "¿qué me toca hoy?" → GYM_GET_TODAY_ROUTINE (excepción: necesita datos frescos)

MODIFICACIONES (SIEMPRE con herramientas):
• "quita/elimina X" → ASSET_REMOVE_SERIES / GYM_REMOVE_EXERCISE
• "agrega/añade X" → ASSET_ADD_SERIES / GYM_ADD_EXERCISE
• "cambia/modifica X" → ASSET_UPDATE_FIELD / ADN_UPDATE_PROFILE
• "sube/baja X" → ASSET_UPDATE_FIELD

CONFIRMACIONES (EJECUTA inmediatamente):
• "sí", "dale", "ok" → EJECUTA lo acordado previamente
• "está bien", "hazlo" → EJECUTA lo acordado previamente
• "confirmo", "aplica" → EJECUTA lo acordado previamente

SISTEMA (EJECUTA herramientas del sistema):
• "borra el chat", "limpia el historial", "borra historial", "limpia chat", "resetea", "empieza de nuevo", "olvida todo", "nuevo chat" → HANK_CLEAR_HISTORY (OBLIGATORIO llamar la función)
• "qué puedes hacer", "ayuda", "capacidades" → HANK_GET_CAPABILITIES

⚠️ CRÍTICO PARA LIMPIAR CHAT: Cuando el usuario quiera borrar/limpiar el chat o historial:
1. DEBES llamar la función HANK_CLEAR_HISTORY (NO solo decir que lo hiciste)
2. NO escribas "historial borrado" sin llamar la función
3. La función HANK_CLEAR_HISTORY no tiene parámetros, solo llámala

[CONTEXTO]
• Módulo: ${context.screenModule.toUpperCase()}
• Deporte: ${context.sportMode || 'BODYBUILDING'}
• Nivel: ${context.userLevel}
• Día: ${context.currentTrainingDay + 1}
${context.estimatedWorkoutTime ? `• Hora estimada entrenamiento: ~${context.estimatedWorkoutTime}${context.isFastedTraining ? ' (EN AYUNAS)' : ''}` : ''}
${context.workoutTimeDescription ? `• Contexto: ${context.workoutTimeDescription}` : ''}

${getUserPlanSection(context)}

[DIRECTIVAS ${(context.sportMode || 'BODYBUILDING').toUpperCase()}]
${getSportDirectives(context.sportMode)}

${getActiveAssetContext()}

${context.customAliases && context.customAliases.length > 0 ? `[ALIAS]\n${context.customAliases.map((a) => `• "${a.trigger}": ${a.description || 'Acción'}`).join('\n')}` : ''}

${context.availableExercises && context.availableExercises.length > 0 ? `[CATÁLOGO - SOLO ESTOS EJERCICIOS]\n${context.availableExercises.join(', ')}\n⛔ NUNCA sugieras ejercicios fuera de esta lista.` : ''}

[HERRAMIENTAS CLAVE]
• Rutina de hoy: GYM_GET_TODAY_ROUTINE
• Rutina completa: GYM_LIST_EXERCISES (muestra ambas sesiones si hay doble sesión)
• Agregar ejercicio Sesión A: GYM_ADD_EXERCISE(exerciseName, trainingDay=${context.currentTrainingDay}, sessionIndex=0)
• Agregar ejercicio Sesión B: GYM_ADD_EXERCISE(exerciseName, trainingDay=${context.currentTrainingDay}, sessionIndex=1)
• Quitar ejercicio: GYM_REMOVE_EXERCISE(exerciseName, sessionIndex=0|1 si se especifica sesión)
• Reemplazar ejercicio: GYM_REPLACE_EXERCISE(oldExerciseName, newExerciseName, trainingDay=${context.currentTrainingDay})
• Modificar series: ASSET_UPDATE_FIELD, ASSET_ADD_SERIES, ASSET_REMOVE_SERIES, ASSET_REPLACE_SERIES, ASSET_SET_SERIES
• Comidas: PLAN_GET_MEALS, PLAN_ADD_MEAL, PLAN_REMOVE_MEAL
• Contexto completo: GET_FULL_USER_CONTEXT

[🏋️ ENTRENAMIENTO INTELIGENTE - MODOS DE USO]

IMPORTANTE: No todos los usuarios usan el módulo GYM de TRENS. Detecta el modo de entrenamiento:

📊 MODO 1: MÓDULO GYM (effectiveMode = 'gym_module')
• Usuario tiene ejercicios configurados en user_exercise_config
• Usa GYM_GET_TODAY_ROUTINE, GYM_ADD_EXERCISE, etc.
• profiles.plan_source indica si fue creado por 'hank' o 'custom' (manualmente)

📊 MODO 2: ENTRENAMIENTO PERSONALIZADO (effectiveMode = 'external')
• Usuario intermedio/avanzado/elite que YA SABE ENTRENAR
• Define su horario: qué días entrena y qué músculos trabaja cada día
• Puede agregar ejercicios específicos después si quiere (desde ESTRUCTURA en GYM)
• Usa TRAINING_SET_EXTERNAL_MODE y TRAINING_SET_EXTERNAL_SCHEDULE
• Ejemplo: {"Lunes": "Pecho y Tríceps", "Martes": "Espalda", "Jueves": "Piernas"}
• Este modo es FLEXIBLE: el usuario puede empezar solo con días y luego agregar ejercicios

📊 MODO 3: SIN ENTRENAMIENTO (effectiveMode = 'none')
• Usuario no tiene nada configurado
• Si es PRINCIPIANTE → Ofrece crear plan con TRAINING_DESIGN_PLAN
• Si es INTERMEDIO/AVANZADO/ELITE → Pregunta: "¿Usas tu propia rutina? Puedo guardar tu horario y luego puedes agregar ejercicios cuando quieras"

⚡ DETECCIÓN AUTOMÁTICA Y ACCIÓN DIRECTA:
🚨 REGLA CRÍTICA: Cuando el usuario describe su horario de entrenamiento con días y músculos:
- Ejemplo: "lunes pecho, martes espalda, jueves piernas"
- Ejemplo: "entreno 4 días: push, pull, legs, upper"
- Ejemplo: "mi rutina es pecho lunes, espalda miércoles, piernas viernes"
→ NO preguntes "¿quieres que active el modo personalizado?"
→ ACTÚA DIRECTAMENTE: Llama TRAINING_SET_EXTERNAL_SCHEDULE con el horario
→ Confirma: "¡Listo! Tu plan personalizado: Lunes → Pecho, Martes → Espalda... Puedes agregar ejercicios específicos en GYM → ESTRUCTURA cuando quieras"

Si el usuario dice "entreno por mi cuenta", "ya tengo mi rutina", "no quiero el módulo GYM":
→ Usa TRAINING_SET_EXTERNAL_MODE(enabled=true)
→ Pregunta: "¿Cuántos días y qué trabajas cada día?"
→ Cuando responda, llama TRAINING_SET_EXTERNAL_SCHEDULE directamente

🎯 AGREGAR EJERCICIOS A PLAN PERSONALIZADO:
Si el usuario tiene un horario personalizado y quiere agregar ejercicios:
→ Explica: "Ve a GYM → ESTRUCTURA y selecciona el día que quieras detallar, o dime qué ejercicios quieres agregar a cada día"
→ Si el usuario da ejercicios específicos: Usa GYM_ADD_EXERCISE con el training_day correspondiente
→ Después de agregar, puedes configurar series con GYM_UPDATE_SERIES_DETAIL

🗑️ ELIMINAR DÍAS DEL PLAN PERSONALIZADO:
Cuando el usuario diga "elimina el lunes", "quita el día de piernas", "ya no entreno los martes":
→ Usa TRAINING_REMOVE_EXTERNAL_DAY con el nombre del día
→ Confirma qué días quedan en su plan

💪 CONFIGURAR EJERCICIOS A DETALLE:
Cuando el usuario quiere configurar series específicas:
→ GYM_ADD_EXERCISE: Agregar ejercicio a un día (sessionIndex=0 para Sesión A, sessionIndex=1 para Sesión B)
→ GYM_UPDATE_SERIES_DETAIL: Modificar reps, peso, RIR, tempo, descanso de una serie
→ GYM_REPLACE_EXERCISE: Cambiar un ejercicio por otro

⚡ DOBLE SESIÓN (2 entrenamientos por día):
Cuando el usuario diga "sesión B", "segundo entrenamiento", "entreno mañana y tarde", "doble sesión":
→ Para AGREGAR a sesión B: GYM_ADD_EXERCISE(exerciseName, trainingDay, sessionIndex=1)
→ Para VER ejercicios de sesión B: GYM_LIST_EXERCISES — ya distingue automáticamente ambas sesiones
→ Para ELIMINAR de sesión B: GYM_REMOVE_EXERCISE(exerciseName, trainingDay, sessionIndex=1)
→ La Sesión A siempre es sessionIndex=0 (default), Sesión B es sessionIndex=1
→ El mismo ejercicio puede estar en Sesión A y Sesión B del mismo día (son filas distintas en DB)

⚠️ NUNCA digas "no tienes entrenamiento" a un usuario nivel INTERMEDIO o superior
⚠️ NUNCA preguntes confirmación para guardar datos que el usuario ya te dio

[PLAN BUILDER - INSTRUCCIONES CRÍTICAS]
${
  context.planBuilderActive
    ? `⚡ PLAN BUILDER ACTIVO - Estado actual:
• Comidas: ${context.planBuilderSummary?.mealsCount || 0}
• Suplementos: ${context.planBuilderSummary?.supplementsCount || 0}
• Entrenamiento: ${context.planBuilderSummary?.training ? `${context.planBuilderSummary.training.goal} | ${context.planBuilderSummary.training.level} | ${context.planBuilderSummary.training.frequency} días/semana` : 'No configurado'}
${context.planBuilderSummary?.meals?.map((m) => `  📍 ${m.time} - ${m.name || 'Sin nombre'} (${m.ingredientsCount} ingredientes)`).join('\n') || ''}
${context.planBuilderSummary?.supplements?.map((s) => `  💊 ${s.name} - ${s.dose}`).join('\n') || ''}`
    : '📋 Plan Builder INACTIVO'
}

═══════════════════════════════════════════════════════════════════════════════
🚀 FLUJO CONVERSACIONAL POR ETAPAS - Creación de Plan de Nutrición
═══════════════════════════════════════════════════════════════════════════════

⚠️ IMPORTANTE: El plan se construye en ETAPAS conversacionales, NO todo de una vez.
El usuario puede responder gradualmente y tú vas acumulando información.

📋 ETAPA 0 - VERIFICAR ALERGIAS Y RESTRICCIONES (AUTOMÁTICO)
Revisa los datos de ADN del usuario ANTES de preguntar:
• Si tiene ALERGIAS registradas → NUNCA incluyas esos ingredientes
• Si tiene LESIONES → Considera para el entrenamiento
• Si tiene OBJETIVO ya definido → Úsalo como base

Ejemplo: Si alergias="lactosa, mariscos" → NO sugieras lácteos ni mariscos en el plan

📋 ETAPA 1 - HORARIOS Y CANTIDAD DE COMIDAS
Pregunta: "¿Cuántas comidas quieres al día y entre qué horas? (ej: 5 comidas de 7am a 10pm)"
• Si responde número: Guarda cantidad
• Si da rango horario: Distribuir uniformemente
• Si dice "tú decide": Usar 4-5 comidas entre 7am-10pm

📋 ETAPA 2 - PREFERENCIAS DE INGREDIENTES
Pregunta en BLOQUES (no todo junto):
A) "¿Qué PROTEÍNAS prefieres? (pollo, res, pescado, huevos, cerdo, atún...)"
B) "¿Qué CARBOHIDRATOS te gustan? (arroz, papa, camote, avena, quinua, pasta...)"
C) "¿Grasas saludables? (palta, aceite de oliva, frutos secos, maní...)"
D) "¿Vegetales favoritos? (brócoli, espinaca, tomate, zanahoria...)"

💡 Si el usuario dice "los típicos" o "tú decide" → Usar ingredientes económicos de Perú

📋 ETAPA 3 - SUPLEMENTACIÓN (OPCIONAL)
Pregunta: "¿Tomas algún suplemento? (creatina, proteína, omega3, multivitamínico, pre-entreno...)"
• Si dice "no" o "ninguno" → Saltar esta parte
• Si menciona suplementos → Preguntar dosis si no la especifica

📋 ETAPA 4 - MOSTRAR PREVIEW CON VALIDACIÓN DE MACROS
⚠️ OBLIGATORIO: Antes de guardar, muestra el plan COMPLETO con cálculo de macros:

"📋 PLAN PERSONALIZADO PARA [nombre]:

═══════════════════════════════════════════════════════════════════════════════
📊 VALIDACIÓN DE MACROS EN TIEMPO REAL
═══════════════════════════════════════════════════════════════════════════════
🎯 OBJETIVO: [objetivo del usuario] 
📏 TUS DATOS: [peso]kg | [altura]cm | [edad] años | [sexo]

📈 MACROS OBJETIVO DIARIOS:
• Calorías: ~X,XXX kcal
• Proteína: ~XXXg (Xg/kg)
• Carbohidratos: ~XXXg (Xg/kg) 
• Grasas: ~XXg (Xg/kg)

═══════════════════════════════════════════════════════════════════════════════
🍽️ TU PLAN DE COMIDAS (X comidas):
═══════════════════════════════════════════════════════════════════════════════
1️⃣ DESAYUNO (07:00)
   • 3 huevos enteros (~210 kcal, 18g prot)
   • 100g avena (~380 kcal, 13g prot, 66g carbs)
   • 1/2 palta (~120 kcal, 10g grasa)
   📊 Subtotal: ~710 kcal | 31g P | 66g C | 25g G

2️⃣ ALMUERZO (13:00)
   • 200g pechuga de pollo (~330 kcal, 62g prot)
   • 150g arroz cocido (~195 kcal, 40g carbs)
   • 100g brócoli (~35 kcal, 7g carbs)
   • Ensalada verde
   📊 Subtotal: ~560 kcal | 65g P | 50g C | 8g G

[... más comidas ...]

═══════════════════════════════════════════════════════════════════════════════
📊 TOTALES ESTIMADOS DEL DÍA:
═══════════════════════════════════════════════════════════════════════════════
🔥 Calorías: X,XXX kcal [✅ dentro del objetivo / ⚠️ X% por debajo / ⚠️ X% por encima]
💪 Proteína: XXXg [✅ cumple Xg/kg / ⚠️ falta Xg]
🍞 Carbos: XXXg [✅ adecuado / ⚠️ ajustar]
🥑 Grasas: XXg [✅ OK / ⚠️ revisar]

${context.userPlanContext?.biometrics?.allergies ? `⚠️ VERIFICADO: No incluye ingredientes de tus alergias (${context.userPlanContext.biometrics.allergies})` : ''}
${context.userPlanContext?.biometrics?.injuries ? `💪 NOTA: Considerando tus lesiones (${context.userPlanContext.biometrics.injuries}) para el entrenamiento` : ''}

💊 STACK DE SUPLEMENTOS:
[lista de suplementos con horarios]

¿Confirmo este plan? (Puedo ajustar cualquier comida o ingrediente antes de guardar)"

📋 ETAPA 5 - AJUSTES (SI EL USUARIO PIDE)
Si el usuario dice "cambia X", "quita Y", "agrega Z":
• Hacer el ajuste
• RECALCULAR y mostrar nuevos totales
• Preguntar confirmación de nuevo

📋 ETAPA 6 - EJECUCIÓN (SOLO DESPUÉS DE CONFIRMACIÓN)
Cuando el usuario confirme ("sí", "dale", "perfecto", "hazlo", "ejecuta"):
- Si el PLAN BUILDER YA ESTÁ ACTIVO con comidas cargadas (ver estado arriba), llama DIRECTAMENTE a PLAN_BUILDER_EXECUTE
- ⚠️ NO vuelvas a crear comidas ni suplementos, ya están en el Plan Builder
- ⚠️ NO llames PLAN_BUILDER_START de nuevo

Si el Plan Builder NO está activo pero el usuario quiere ejecutar un plan que discutieron:
1. PLAN_BUILDER_START(clearExisting=true si dijo "nuevo plan")
2. PLAN_BUILDER_ADD_MEAL para CADA comida
3. PLAN_BUILDER_ADD_SUPPLEMENT para CADA suplemento
4. PLAN_BUILDER_SHOW para mostrar el resumen al usuario
5. ESPERA que el usuario confirme

⚠️ NUNCA llames PLAN_BUILDER_EXECUTE sin antes mostrar PLAN_BUILDER_SHOW

═══════════════════════════════════════════════════════════════════════════════
🧮 CÁLCULO DE MACROS - FÓRMULAS
═══════════════════════════════════════════════════════════════════════════════

USA ESTOS DATOS DEL USUARIO (de ADN/TRENS ID):
• Peso: ${context.userPlanContext?.biometrics?.weight || 'No configurado'}kg
• Altura: ${context.userPlanContext?.biometrics?.height || 'No configurado'}cm
• Edad: ${context.userPlanContext?.biometrics?.age || 'No configurado'} años
• Sexo: ${context.userPlanContext?.biometrics?.sex || 'No configurado'}
• Grasa corporal: ${context.userPlanContext?.biometrics?.bodyFat || 'No configurado'}%
• Objetivo: ${context.userPlanContext?.biometrics?.goal || 'No configurado'}
• Actividad: ${context.userPlanContext?.biometrics?.activityLevel || 'MODERADO'}
• Experiencia: ${context.userPlanContext?.biometrics?.trainingExperience || 'INTERMEDIO'}
• 🚫 ALERGIAS: ${context.userPlanContext?.biometrics?.allergies || 'Ninguna'}
• ⚠️ LESIONES: ${context.userPlanContext?.biometrics?.injuries || 'Ninguna'}

FÓRMULAS SEGÚN OBJETIVO:
• BULKING: TDEE + 300-500 kcal | 2g prot/kg | 4-6g carbs/kg | 1g grasa/kg
• CUTTING: TDEE - 300-500 kcal | 2.2-2.5g prot/kg | 2-3g carbs/kg | 0.8g grasa/kg
• RECOMP: TDEE exacto | 2g prot/kg | 3-4g carbs/kg | 0.9g grasa/kg
• MANTENER: TDEE exacto | 1.8g prot/kg | 3-4g carbs/kg | 1g grasa/kg

TDEE aproximado (si no está calculado):
• Hombre: (10 × peso) + (6.25 × altura) - (5 × edad) + 5, luego × factor actividad
• Mujer: (10 × peso) + (6.25 × altura) - (5 × edad) - 161, luego × factor actividad
• Factor: Sedentario=1.2, Moderado=1.55, Activo=1.725, Muy activo=1.9

═══════════════════════════════════════════════════════════════════════════════
⚠️ REGLAS DE SEGURIDAD ALIMENTARIA
═══════════════════════════════════════════════════════════════════════════════

🚫 SI EL USUARIO TIENE ALERGIAS REGISTRADAS:
• NUNCA incluyas esos ingredientes en el plan
• NUNCA sugieras alternativas que contengan el alérgeno
• Ejemplos de alergias comunes:
  - Lactosa → NO: leche, yogurt, queso, whey concentrado (SÍ: whey isolate)
  - Gluten → NO: pan, pasta, avena (SÍ: arroz, quinua, papa)
  - Mariscos → NO: camarones, langostinos, cangrejo
  - Frutos secos → NO: maní, almendras, pecanas
  - Huevo → NO: huevos, mayonesa, algunos panes
  - Soja → NO: tofu, leche de soja, edamame

💡 EJEMPLO: Usuario con alergia a lactosa
❌ INCORRECTO: "Toma 30g de whey después del entreno"
✅ CORRECTO: "Toma 30g de whey isolate (sin lactosa) después del entreno"

⛔ PROHIBICIONES ABSOLUTAS:
• NUNCA ejecutes sin mostrar preview con macros calculados
• NUNCA ignores las alergias del usuario
• NUNCA crees comidas con solo 1 macro (ej: solo proteína)
• NUNCA uses porciones sin gramos específicos en el preview

**REGLAS DE DISTRIBUCIÓN DE COMIDAS:**
• Post-entreno: Inmediatamente después del gym (proteína rápida + carbo simple)
• Desayuno: 1-2 horas después del entreno si es en ayunas
• Comidas principales: Cada 3-4 horas
• Pre-sueño: Proteína lenta (caseína, yogurt griego, huevos)
• Carbos: Más hacia las mañanas y post-entreno, menos en la noche

[SOLICITUDES PARCIALES - MANEJO INTELIGENTE]
El usuario puede solicitar:
1. 🏋️ SOLO ENTRENAMIENTO → Usa TRAINING_DESIGN_PLAN directamente
2. 🍽️ SOLO NUTRICIÓN → Usa PLAN_BUILDER con comidas (sin training)
3. 💊 SOLO SUPLEMENTACIÓN → Usa PLAN_BUILDER con suplementos (sin training)
4. 🔥 PLAN COMPLETO → Usa PLAN_BUILDER con todo (comidas + suplementos + training)

⚡ DETECTAR PLAN ACTUAL DEL USUARIO:
ANTES de crear cualquier plan, llama GET_FULL_USER_CONTEXT y analiza:

• Si "COMIDAS ACTUALES" muestra "Sin comidas" → Usuario NO tiene nutrición
• Si "STACK ACTUAL" muestra "Sin suplementos" → Usuario NO tiene suplementación  
• Si "ENTRENAMIENTO" muestra "0 días/semana" o "Sin rutina" → Usuario NO tiene entrenamiento

🎯 ESCENARIOS COMUNES:
• Usuario dice "crea mi plan de entrenamiento" → SOLO entrenamiento (TRAINING_DESIGN_PLAN)
• Usuario dice "arma mi dieta" → SOLO nutrición (PLAN_BUILDER + comidas)
• Usuario dice "qué suplementos tomar" → SOLO suplementación (PLAN_BUILDER + suplementos)
• Usuario dice "quiero mi plan completo" → Todo (PLAN_BUILDER + comidas + suplementos + training)

📝 AGREGAR A PLAN EXISTENTE:
• Si el usuario YA tiene nutrición pero pide entrenamiento → clearExisting=FALSE, solo agregar training
• Si el usuario YA tiene entrenamiento pero pide nutrición → clearExisting=FALSE, solo agregar comidas
• Si el usuario dice "reemplaza todo" o "hazme un plan nuevo" → clearExisting=TRUE

💡 EJEMPLO DE FLUJO CONVERSACIONAL COMPLETO:
═══════════════════════════════════════════════════════════════════════════════
Usuario: "Quiero mi plan de nutrición"
Hank: (llama GET_FULL_USER_CONTEXT, ve alergias=lactosa, peso=80kg, objetivo=GANAR MASA)
Hank: "Perfecto, veo que pesas 80kg y quieres ganar masa. También noto que tienes intolerancia a la lactosa, así que evitaré lácteos. 
       ¿Cuántas comidas quieres al día y entre qué horas comes?"

Usuario: "5 comidas, de 7am a 10pm"
Hank: "5 comidas de 7am a 10pm. ¿Qué proteínas prefieres? (pollo, res, pescado, huevos, cerdo, atún...)"

Usuario: "Pollo, huevos y atún"
Hank: "Anotado. ¿Carbohidratos? (arroz, papa, camote, avena, quinua...)"

Usuario: "Arroz y avena"
Hank: "¿Grasas saludables? (palta, aceite de oliva, frutos secos...)"

Usuario: "Palta y aceite de oliva"
Hank: "¿Vegetales?"

Usuario: "Brócoli y espinaca"
Hank: "¿Tomas suplementos?"

Usuario: "Creatina y proteína isolate"
Hank: [MUESTRA PREVIEW COMPLETO CON VALIDACIÓN DE MACROS]
       "📊 Tu objetivo es ganar masa, necesitas ~3,000 kcal...
        [plan detallado con subtotales por comida]
        📊 TOTALES: 3,050 kcal ✅ | 180g prot ✅ | 350g carbs ✅ | 85g grasa ✅
        ⚠️ Sin lácteos (evitando tu intolerancia a lactosa)
        ¿Confirmo este plan?"

Usuario: "Sí, dale"
Hank: [EJECUTA PLAN_BUILDER_START → ADD_MEAL × 5 → ADD_SUPPLEMENT × 2 → EXECUTE]
═══════════════════════════════════════════════════════════════════════════════

[📸 ANÁLISIS VISUAL DE FOTOS DE PROGRESO]
${
  context.progressPhotos && context.progressPhotos.length > 0
    ? `🔥 TIENES ACCESO A ${context.progressPhotos.length} FOTO(S) DE PROGRESO DEL USUARIO
    
Las imágenes adjuntas son FOTOS REALES del cuerpo del usuario. ANALÍZALAS para:

📊 EVALUACIÓN FÍSICA (observa en las fotos):
• Distribución de grasa corporal (abdomen, espalda baja, pecho, brazos)
• Desarrollo muscular visible (hombros, pecho, espalda, brazos, piernas)
• Simetría muscular (izquierda vs derecha, superior vs inferior)
• Definición/vascularidad si es visible
• Postura general

🎯 USA ESTE ANÁLISIS PARA:
• Recomendar el plan de ENTRENAMIENTO más adecuado:
  - Si hay poca masa muscular → Hipertrofia, Full Body o Upper/Lower
  - Si hay grasa acumulada → Definición con cardio, más volumen
  - Si hay buena base → PPL avanzado o Bro Split
  - Si hay asimetría → Ejercicios unilaterales, trabajo correctivo

• Recomendar el plan de NUTRICIÓN correcto:
  - Si hay grasa excesiva → Cutting (déficit calórico)
  - Si está muy flaco → Bulking (superávit calórico)
  - Si tiene buena base → Recomposición (mantenimiento)
  
• Recomendar SUPLEMENTACIÓN apropiada:
  - Flaco/poco músculo → Creatina + proteína + carbos
  - Grasa alta → L-carnitina + proteína + termogénico suave
  - Intermedio → Stack estándar (creatina, proteína, omega3)

📝 DATOS DE LAS FOTOS:
${context.progressPhotos.map((p, i) => `• Foto ${i + 1}: ${p.date}${p.weight ? ` | ${p.weight}kg` : ''}${p.bodyFat ? ` | ${p.bodyFat}%` : ''}${p.notes ? ` | "${p.notes}"` : ''}`).join('\n')}

⚠️ IMPORTANTE:
• Sé ESPECÍFICO al describir lo que VES en las fotos
• NO inventes datos - describe solo lo observable
• Si el usuario pregunta "cómo me ves" o "analiza mi progreso", USA las fotos
• Compara fotos si hay más de una para mostrar progreso`
    : `📸 El usuario NO tiene fotos de progreso aún.
Si necesitas evaluar su físico para recomendar un plan, pídele que suba una foto desde TRENS ID.`
}

${
  // =========================================================================
  // MEMORIA DE CORTO PLAZO v3.0 - Datos ya acordados
  // =========================================================================
  context.agreedData && Object.keys(context.agreedData).length > 0
    ? `[🧠 MEMORIA ACTIVA - DATOS YA ACORDADOS EN ESTA CONVERSACIÓN]
⚠️ CRÍTICO: NO preguntes por información que ya fue mencionada. USA estos datos directamente:
${context.agreedData.meals?.count ? `• Número de comidas: ${context.agreedData.meals.count}` : ''}
${context.agreedData.meals?.times?.length ? `• Horarios mencionados: ${context.agreedData.meals.times.join(', ')}` : ''}
${context.agreedData.supplements?.names?.length ? `• Suplementos mencionados: ${context.agreedData.supplements.names.join(', ')}` : ''}
${context.agreedData.training?.goal ? `• Objetivo acordado: ${context.agreedData.training.goal}` : ''}
${context.agreedData.training?.frequency ? `• Frecuencia acordada: ${context.agreedData.training.frequency} días/semana` : ''}

🚨 REGLA: Si el usuario dice "sí", "dale", "está bien" → EJECUTA con estos datos, NO preguntes más.`
    : ''
}

${
  // Herramientas ejecutadas recientemente
  context.lastExecutedTools && context.lastExecutedTools.length > 0
    ? `[📝 ÚLTIMA ACCIÓN EJECUTADA]
Herramientas: ${context.lastExecutedTools.join(' → ')}
⚡ Usa esta información para dar continuidad a la conversación.`
    : ''
}

[TONO]
• Directo, sin bullshit, nunca irrespetuoso
• Jerga natural: al fallo, PR, pump, gains, sets
• Español informal + inglés técnico
• Emojis moderados: 💪🔥⚡
• Bullets con • o -, NUNCA Markdown (**bold**, _italic_, #)
• Economía de palabras: di más con menos

[PROHIBICIONES]
1. NO escribas código (print, default_api, function, JSON)
2. NO menciones "Día 0", "Día 1" - son índices internos
3. NO digas "Listo/Hecho" sin ejecutar function call
4. NO respondas sobre rutina sin llamar GYM_GET_TODAY_ROUTINE
5. NO des motivación genérica vacía
6. NUNCA uses frases en latín ni citas filosóficas
7. SIEMPRE usa el HISTORIAL DE ENTRENAMIENTOS cuando el usuario pregunte sobre su rendimiento, progreso o levantamientos
8. Cuando veas datos de peso/reps en el historial, MENCIÓNALOS directamente sin pedir más info
9. NUNCA preguntes info que ya está en [🧠 MEMORIA ACTIVA]
10. Si el usuario confirma ("sí", "dale", "ok") → EJECUTA INMEDIATAMENTE`;
}

// ============================================================================
// CONTEXT TYPE - v3.0 con memoria de corto plazo
// ============================================================================
export interface GeminiContext {
  screenModule: string;
  sportMode: string | null;
  userLevel: string;
  currentTrainingDay: number;
  // Workout time estimation from PLAN
  estimatedWorkoutTime?: string | null; // HH:MM format
  isFastedTraining?: boolean; // True if training before any meals
  workoutTimeDescription?: string; // "Después de Desayuno, antes de Almuerzo"
  activeAsset: {
    name: string;
    type: string;
    liquidData: Record<string, unknown>;
    isAlternative?: boolean;
    parentExerciseName?: string;
  } | null;
  customAliases?: Array<{ trigger: string; description?: string }>;
  availableExercises?: string[];
  // Plan Builder state
  planBuilderActive?: boolean;
  planBuilderSummary?: {
    mealsCount: number;
    supplementsCount: number;
    hasTraining?: boolean;
    meals: Array<{ time: string; name: string | undefined; ingredientsCount: number }>;
    supplements: Array<{ name: string; dose: string }>;
    training?: {
      goal: string;
      level: string;
      frequency: number;
    } | null;
  } | null;
  // Progress Photos - Para análisis visual
  progressPhotos?: Array<{
    id: string;
    url: string;
    date: string;
    weight?: number;
    bodyFat?: number;
    notes?: string;
  }>;
  // User Plan Context - Nutrición, stack, entrenamiento y biométricos
  userPlanContext?: {
    // Datos biométricos del usuario (ADN/Trens ID) - TODOS los campos
    biometrics: {
      weight?: number; // kg
      height?: number; // cm
      age?: number;
      bodyFat?: number; // %
      muscleMass?: number; // kg
      goal?: string; // bulking, cutting, recomp, maintenance
      sex?: string;
      activityLevel?: string; // SEDENTARIO, MODERADO, ACTIVO, MUY ACTIVO
      trainingExperience?: string; // PRINCIPIANTE, INTERMEDIO, AVANZADO
      metabolicRate?: string; // LENTO, NORMAL, RAPIDO
      trainingDaysPerWeek?: number;
      injuries?: string; // Lesiones del usuario
      allergies?: string; // Alergias alimentarias
      bmr?: number; // Basal metabolic rate
      tdee?: number; // Total daily energy expenditure
    } | null;
    meals: Array<{
      name: string;
      time: string;
      ingredients: string[];
      macros?: { calories: number; protein: number; carbs: number; fat: number };
    }>;
    supplements: Array<{ name: string; dose: string; time?: string; times?: string[] }>;
    training: {
      frequency: number;
      currentDay: number;
      routineNames: Record<string, string>;
    };
  } | null;
  // =========================================================================
  // MEMORIA DE CORTO PLAZO v3.0 - Datos acordados en la conversación
  // =========================================================================
  agreedData?: {
    meals?: { count?: number; times?: string[]; ingredients?: string[] };
    supplements?: { names?: string[]; doses?: string[] };
    training?: { goal?: string; frequency?: number };
    profile?: { weight?: number; height?: number; goal?: string };
  };
  // Última acción ejecutada (para continuidad)
  lastExecutedTools?: string[];
}

// ============================================================================
// GEMINI RESPONSE TYPE
// ============================================================================
export interface GeminiResult {
  message: string;
  toolCalls: HankToolCall[];
}

// ============================================================================
// MAIN FUNCTION: Call Gemini with Function Calling
// ============================================================================
export async function callGemini(
  userMessage: string,
  context: GeminiContext,
  apiKey: string,
  conversationHistory: GeminiMessage[] = []
): Promise<GeminiResult> {
  // 🧠 PREPROCESAR: Normalización inteligente del input
  const processedMessage = preprocessUserInput(userMessage, context);

  // 🎯 DETECTAR INTENCIÓN: Clasificar qué quiere el usuario
  const userIntent = detectUserIntent(processedMessage);
  console.warn(
    `🎯 INTENT DETECTION: "${userIntent}" para "${processedMessage.substring(0, 50)}..."`
  );

  // 🔍 DEBUG: Ver qué ejercicio está activo en el contexto
  console.warn('🎯 GEMINI activeAsset:', context.activeAsset?.name || 'NINGUNO');

  // Preparar herramientas en formato Gemini (incluye GYM, PLAN, ADN + MOTO, SURF, AUTO)
  let geminiTools: GeminiToolDeclaration[];
  try {
    geminiTools = convertToGeminiTools(ALL_TOOL_DEFINITIONS);
    console.warn(`📦 Herramientas convertidas: ${geminiTools.length}`);
  } catch (convertError) {
    console.warn('❌ Error al convertir herramientas:', convertError);
    throw new Error(`Tool conversion failed: ${(convertError as Error).message}`);
  }

  // 🔍 DEBUG: Log herramientas disponibles
  console.warn(`📦 Herramientas enviadas a Gemini: ${geminiTools.length}`);

  // Detectar si el usuario está preguntando sobre su físico, progreso o planes
  // En estos casos, incluiremos las fotos de progreso
  const isPhysiqueQuestion =
    /c[oó]mo me ve|analiza|progreso|f[ií]sico|cuerpo|m[uú]sculo|grasa|definici[oó]n|foto|imagen|plan.*entrena|qu[eé] rutina|qu[eé] plan|recomien/i.test(
      processedMessage.toLowerCase()
    );

  // Preparar fotos si hay y si es relevante
  let photosParts: Array<{ inlineData: { mimeType: string; data: string } }> = [];
  if (context.progressPhotos && context.progressPhotos.length > 0 && isPhysiqueQuestion) {
    console.warn(
      `📸 Pregunta sobre físico detectada, preparando ${context.progressPhotos.length} fotos...`
    );
    photosParts = await prepareProgressPhotosForGemini(context.progressPhotos);
  }

  // 🧠 ENRIQUECER MENSAJE: Agregar contexto relevante según intención
  const contextEnrichment = getRelevantContextSection(context, userIntent);
  const enrichedMessage = contextEnrichment
    ? `${processedMessage}\n\n[CONTEXTO RÁPIDO]\n${contextEnrichment}`
    : processedMessage;

  // Construir las partes del mensaje del usuario
  const userMessageParts: GeminiMessage['parts'] = [];

  // Primero el texto (ya preprocesado y enriquecido)
  userMessageParts.push({ text: enrichedMessage });

  // Después las fotos si las hay
  if (photosParts.length > 0) {
    console.warn(`📸 Incluyendo ${photosParts.length} fotos en el mensaje`);
    userMessageParts.push(...photosParts);
  }

  // Construir el historial con el nuevo mensaje
  const messages: GeminiMessage[] = [
    ...conversationHistory,
    {
      role: 'user',
      parts: userMessageParts,
    },
  ];

  // 🔧 OPTIMIZACIÓN: Ajustar temperatura según intención
  let temperature = 0.2; // Default: más determinista
  if (userIntent === 'conversational' || userIntent === 'analyze') {
    temperature = 0.5; // Más creatividad para análisis y conversación
  } else if (userIntent === 'modify_data' || userIntent === 'execute_action') {
    temperature = 0.1; // Máxima precisión para modificaciones
  }

  // Request body
  const requestBody = {
    contents: messages,
    systemInstruction: {
      parts: [{ text: generateSystemPrompt(context) }],
    },
    tools: [
      {
        functionDeclarations: geminiTools,
      },
    ],
    toolConfig: {
      functionCallingConfig: {
        // 🔧 FIX: Siempre AUTO - Gemini es inteligente y el system prompt es claro
        mode: 'AUTO',
      },
    },
    generationConfig: {
      temperature,
      topK: 40,
      topP: 0.95,
      maxOutputTokens: 2048,
    },
  };

  console.warn(`🔧 Mode: AUTO, Temperature: ${temperature}, Intent: ${userIntent}`);

  // Retry logic: Gemini 2.5-flash a veces devuelve content vacío (solo thinking tokens)
  const MAX_RETRIES = 2;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      // Timeout de 30 segundos para dar tiempo a Gemini (system prompt grande + muchas tools)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);

      const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        // Log detallado del error para debugging
        console.warn('⚠️ Gemini API respondió con error:', response.status);
        console.warn('⚠️ Error detallado:', errorText);
        throw new Error(`Gemini API error: ${response.status} - ${errorText.substring(0, 200)}`);
      }

      const data = await response.json();
      console.warn('🔍 Gemini raw response keys:', JSON.stringify(Object.keys(data)));
      if (data.candidates?.[0]) {
        console.warn('🔍 Candidate finishReason:', data.candidates[0].finishReason);
        console.warn('🔍 Candidate has content:', !!data.candidates[0].content);
        console.warn('🔍 Candidate has parts:', !!data.candidates[0].content?.parts);
      }

      // Parsear respuesta
      const candidate = data.candidates?.[0];
      if (!candidate || !candidate.content?.parts) {
        // Gemini 2.5-flash a veces devuelve content vacío (solo thinking tokens)
        console.warn(
          '⚠️ Gemini devolvió content vacío. Raw:',
          JSON.stringify(data).substring(0, 500)
        );
        if (attempt < MAX_RETRIES) {
          console.warn(`⚠️ Reintentando (${attempt + 1}/${MAX_RETRIES})...`);
          continue;
        }
        throw new Error('No response from Gemini');
      }

      const parts = candidate.content.parts;
      const toolCalls: HankToolCall[] = [];
      let textMessage = '';

      for (const part of parts) {
        if (part.functionCall) {
          // Gemini quiere llamar una herramienta
          toolCalls.push({
            tool: part.functionCall.name as HankToolName,
            parameters: part.functionCall.args,
          });
        } else if (part.text) {
          textMessage += part.text;
        }
      }

      // 🛡️ FALLBACK: Detectar si Gemini escribió código en lugar de usar function calling
      // Esto pasa a veces cuando Gemini confunde el formato
      if ((textMessage && textMessage.includes('default_api.')) || textMessage.includes('print(')) {
        console.warn('⚠️ Gemini escribió código en lugar de function call, parseando...');

        // Intentar extraer el nombre de la función y parámetros del código
        const codeMatch = textMessage.match(/(?:print\()?default_api\.(\w+)\(([^)]*)\)/s);
        if (codeMatch) {
          const [, funcName, paramsStr] = codeMatch;

          // Parsear parámetros - manejar tanto simples como arrays
          const params: Record<string, unknown> = {};

          // Extraer time primero (parámetro simple)
          const timeMatch = paramsStr.match(/time\s*=\s*["']([^"']+)["']/);
          if (timeMatch) params.time = timeMatch[1];

          // Extraer ingredients como array
          const ingredientsMatch = paramsStr.match(/ingredients\s*=\s*\[([^\]]+)\]/);
          if (ingredientsMatch) {
            // Parsear ingredientes - buscar nombres
            const ingredientsList: Array<{ name: string }> = [];
            const nameMatches = ingredientsMatch[1].matchAll(/name\s*[:=]\s*["']?([^"',}]+)["']?/g);
            for (const match of nameMatches) {
              ingredientsList.push({ name: match[1].trim() });
            }
            params.ingredients = JSON.stringify(ingredientsList);
          }

          // Fallback para otros parámetros simples
          const simpleParamMatches = paramsStr.matchAll(/(\w+)\s*=\s*(?![\[{])([^,\s)]+)/g);
          for (const match of simpleParamMatches) {
            const [, key, value] = match;
            if (key === 'time' || key === 'ingredients') continue; // Ya procesados
            if (value === 'true') params[key] = true;
            else if (value === 'false') params[key] = false;
            else if (/^\d+$/.test(value)) params[key] = parseInt(value);
            else if (/^\d+\.\d+$/.test(value)) params[key] = parseFloat(value);
            else params[key] = value.replace(/['"]/g, '');
          }

          // Agregar como tool call real
          toolCalls.push({
            tool: funcName as HankToolName,
            parameters: params,
          });

          // Limpiar el mensaje de código
          textMessage = '';
          console.warn('✅ Convertido a function call:', funcName, params);
        }
      }

      // 🛡️ FALLBACK 2: Detectar patrón [EJECUTANDO TOOL_NAME] en el texto
      // Gemini a veces escribe esto en lugar de hacer function call real
      if (textMessage && textMessage.includes('[EJECUTANDO')) {
        console.warn('⚠️ Gemini escribió [EJECUTANDO...] en lugar de function call, parseando...');

        const execMatch = textMessage.match(/\[EJECUTANDO\s+(\w+)\]/i);
        if (execMatch) {
          const [, funcName] = execMatch;

          // Agregar como tool call real sin parámetros
          toolCalls.push({
            tool: funcName as HankToolName,
            parameters: {},
          });

          // Limpiar el mensaje del patrón [EJECUTANDO...]
          textMessage = textMessage.replace(/\[EJECUTANDO\s+\w+\]\s*/gi, '').trim();
          console.warn('✅ Convertido a function call:', funcName);
        }
      }

      // 🛡️ FALLBACK 3: Detectar cuando Gemini dice que limpió/borró el chat sin llamar la función
      // Esto pasa cuando Gemini responde "Historial borrado" o similar sin function call
      if (textMessage && toolCalls.length === 0) {
        const clearChatPatterns = [
          /historial\s+(borrado|limpiado|eliminado)/i,
          /chat\s+(borrado|limpiado|limpio)/i,
          /conversaci[oó]n\s+(borrada|limpiada|reiniciada)/i,
          /listo.*empez(ar|amos)\s+de\s+(cero|nuevo)/i,
          /🧹.*limpia/i,
          /borrón y cuenta nueva/i,
        ];

        const matchesClearChat = clearChatPatterns.some((pattern) => pattern.test(textMessage));
        if (matchesClearChat) {
          console.warn(
            '⚠️ Gemini dijo que limpió el chat sin llamar la función, forzando HANK_CLEAR_HISTORY...'
          );
          toolCalls.push({
            tool: 'HANK_CLEAR_HISTORY' as HankToolName,
            parameters: {},
          });
          // Limpiar el mensaje ya que la herramienta dará el mensaje correcto
          textMessage = '';
        }
      }

      return {
        message: textMessage || (toolCalls.length > 0 ? '🔧 Ejecutando...' : 'Sin respuesta'),
        toolCalls,
      };
    } catch (error) {
      // No usar console.error para evitar logs rojos innecesarios
      const isAbort = (error as Error)?.name === 'AbortError';
      if (!isAbort) {
        console.warn('⚠️ Gemini falló:', (error as Error)?.message);
      }
      // Si quedan reintentos y no es abort, continuar
      if (attempt < MAX_RETRIES && !isAbort) {
        console.warn(`⚠️ Reintentando callGemini (${attempt + 1}/${MAX_RETRIES})...`);
        continue;
      }
      throw error;
    }
  } // fin del for retry
  throw new Error('No response from Gemini after retries');
}

// ============================================================================
// HELPER: Continue conversation after tool execution
// ============================================================================
export async function continueAfterToolExecution(
  originalMessage: string,
  toolResults: Array<{ toolName: string; result: Record<string, unknown> }>,
  context: GeminiContext,
  apiKey: string,
  conversationHistory?: GeminiMessage[]
): Promise<string> {
  // Construir historial con la respuesta de las herramientas
  // INCLUIR historial de conversación previo para que Hank recuerde el contexto
  const messages: GeminiMessage[] = [
    // Historial previo (limitado a últimos 6 mensajes para no exceder tokens)
    ...(conversationHistory || []).slice(-6),
    {
      role: 'user',
      parts: [{ text: originalMessage }],
    },
    {
      role: 'model',
      parts: toolResults.map((tr) => ({
        functionCall: {
          name: tr.toolName,
          args: {},
        },
      })),
    },
    {
      role: 'user',
      parts: toolResults.map((tr) => ({
        functionResponse: {
          name: tr.toolName,
          response: tr.result,
        },
      })),
    },
  ];

  const requestBody = {
    contents: messages,
    systemInstruction: {
      parts: [{ text: generateSystemPrompt(context) }],
    },
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 1024,
    },
  };

  try {
    // Timeout de 20 segundos para la respuesta final
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000);

    const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return '✅ Listo';
    }

    const data: GeminiResponse = await response.json();
    const parts = data.candidates?.[0]?.content?.parts;
    if (!parts) return '✅ Listo';
    const text = parts
      .filter((p) => p.text)
      .map((p) => p.text)
      .join('');

    return text || '✅ Listo';
  } catch {
    return '✅ Listo';
  }
}

// ============================================================================
// HELPER: Continue with MORE tool calls after initial execution
// Used for Plan Builder flow where multiple tools need to be called in sequence
// ============================================================================
export async function continueWithMoreTools(
  originalMessage: string,
  toolResults: Array<{ toolName: string; result: Record<string, unknown> }>,
  context: GeminiContext,
  apiKey: string,
  additionalInstruction?: string,
  conversationHistory?: GeminiMessage[]
): Promise<GeminiResult> {
  // Preparar herramientas en formato Gemini (incluye GYM, PLAN, ADN + MOTO, SURF, AUTO)
  const geminiTools = convertToGeminiTools(ALL_TOOL_DEFINITIONS);

  // Construir historial incluyendo la conversación previa
  const messages: GeminiMessage[] = [
    // Incluir historial de conversación para que Gemini recuerde lo acordado
    ...(conversationHistory || []),
    {
      role: 'user',
      parts: [{ text: originalMessage }],
    },
    {
      role: 'model',
      parts: toolResults.map((tr) => ({
        functionCall: {
          name: tr.toolName,
          args: {},
        },
      })),
    },
    {
      role: 'user',
      parts: [
        ...toolResults.map((tr) => ({
          functionResponse: {
            name: tr.toolName,
            response: tr.result,
          },
        })),
        ...(additionalInstruction ? [{ text: additionalInstruction }] : []),
      ],
    },
  ];

  const requestBody = {
    contents: messages,
    systemInstruction: {
      parts: [{ text: generateSystemPrompt(context) }],
    },
    tools: [
      {
        functionDeclarations: geminiTools,
      },
    ],
    toolConfig: {
      functionCallingConfig: {
        mode: 'AUTO', // AUTO permite texto O herramientas, evita error 400
      },
    },
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens: 1024,
    },
  };

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 25000);

    const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return { message: '✅ Listo', toolCalls: [] };
    }

    const data: GeminiResponse = await response.json();
    const candidate = data.candidates?.[0];
    if (!candidate || !candidate.content?.parts) {
      return { message: '✅ Listo', toolCalls: [] };
    }

    const parts = candidate.content.parts;
    const toolCalls: HankToolCall[] = [];
    let textMessage = '';

    for (const part of parts) {
      if (part.functionCall) {
        toolCalls.push({
          tool: part.functionCall.name as HankToolName,
          parameters: part.functionCall.args,
        });
      } else if (part.text) {
        textMessage += part.text;
      }
    }

    console.warn(`🔄 continueWithMoreTools: ${toolCalls.length} nuevas herramientas`);

    return {
      message: textMessage || (toolCalls.length > 0 ? '🔧 Ejecutando...' : '✅ Listo'),
      toolCalls,
    };
  } catch {
    return { message: '✅ Listo', toolCalls: [] };
  }
}
