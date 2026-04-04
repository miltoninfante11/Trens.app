// ============================================================================
// EDIT MEAL MODAL - Modal para editar comidas existentes
// Análisis inteligente automático (siempre activo)
// Campos exclusivos: editas gramos O porciones, el otro se auto-calcula
// Estilo Savage Mode con cierre fluido y vibración
// ============================================================================

import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  PanResponder,
} from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from '../../lib/haptics';
import {
  X,
  Plus,
  Trash2,
  AlertTriangle,
  CheckCircle,
  Sparkles,
  Scale,
  Lock,
} from 'lucide-react-native';
import {
  analyzeIngredientsSmart,
  IngredientAnalysis,
} from '../../services/hank/ingredientAnalyzer';

// ============================================================================
// TYPES
// ============================================================================
interface Ingredient {
  id: string;
  name: string;
  quantity: string;
  portion?: string;
  nutritionInfo?: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    suggestedGrams?: number;
  };
}

interface MealOption {
  id: string;
  name: string;
  ingredients: Ingredient[];
}

interface Meal {
  id: string;
  time: string;
  options: MealOption[];
  selectedOption: number;
  targetMacros?: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
  };
}

interface EditMealModalProps {
  visible: boolean;
  meal: Meal | null;
  onClose: () => void;
  onSave: (mealId: string, optionId: string, ingredients: Ingredient[]) => Promise<void>;
  onCalculateMacros?: (
    ingredients: Ingredient[],
    targetMacros?: { calories: number; protein: number; carbs: number; fat: number }
  ) => Promise<Ingredient[]>;
}

// ============================================================================
// HELPERS
// ============================================================================
const formatTimeToAMPM = (time24: string): string => {
  const [h, m] = time24.split(':').map((s) => parseInt(s, 10));
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 || 12;
  return `${hour12}:${m.toString().padStart(2, '0')} ${period}`;
};

/** Detecta si un valor de quantity está en formato gramos explícito */
const isGramsFormat = (value: string): boolean => {
  if (!value || !value.trim()) return false;
  return /^~?\d+(\.\d+)?\s*(?:g|gr|gramos|kg)?\s*$/i.test(value.trim());
};

/** Extrae valor numérico de gramos de un string como "200g", "~150gr" */
const extractGramsNumber = (value: string): string => {
  if (!value || !value.trim()) return '';
  const match = value
    .replace(/^~/, '')
    .trim()
    .match(/(\d+(?:\.\d+)?)/);
  return match ? match[1] : '';
};

/** Combina name + portion para mostrar como un solo campo.
 *  Si portion ya está incluido en name, no lo repite */
const combineNamePortion = (name: string, portion?: string): string => {
  if (!portion || !portion.trim()) return name;
  const portionTrimmed = portion.trim();
  // Si name ya contiene la porción, no duplicar
  if (name.toLowerCase().includes(portionTrimmed.toLowerCase())) return name;
  return `${name} ${portionTrimmed}`;
};

// ============================================================================
// COMPONENT
// ============================================================================
export const EditMealModal: React.FC<EditMealModalProps> = ({
  visible,
  meal,
  onClose,
  onSave,
  onCalculateMacros,
}) => {
  const insets = useSafeAreaInsets();
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [weightInputs, setWeightInputs] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [analysis, setAnalysis] = useState<IngredientAnalysis | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Detectar si estamos editando una alternativa (no la opción principal)
  const isAlternative = meal ? meal.selectedOption > 0 : false;

  // Animated value para el desplazamiento del panel
  const translateY = useSharedValue(0);

  // -------------------------------------------------------------------------
  // VIBRACIÓN AL ABRIR
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (visible) {
      translateY.value = 0;
      const timer = setTimeout(() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [visible, translateY]);

  // -------------------------------------------------------------------------
  // PAN RESPONDER - Cierre deslizando hacia abajo
  // -------------------------------------------------------------------------
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => Math.abs(gestureState.dy) > 5,
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy > 0) {
          translateY.value = gestureState.dy;
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > 100) {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onClose();
        } else {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          translateY.value = withSpring(0, { damping: 20, stiffness: 300 });
        }
      },
    })
  ).current;

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  // Sincronizar ingredientes cuando cambia la comida
  useEffect(() => {
    if (meal && meal.options.length > 0) {
      const currentOption = meal.options[meal.selectedOption] || meal.options[0];
      // Combinar name + portion en el campo name para el nuevo formato
      const ings = currentOption.ingredients.map((ing) => ({
        ...ing,
        name: combineNamePortion(ing.name, ing.portion),
        portion: '', // Se limpia porque ahora está incluido en name
      }));
      setIngredients(ings);
      // Extraer valores numéricos de weight para los inputs
      setWeightInputs(
        currentOption.ingredients.map((ing) => extractGramsNumber(ing.quantity || ''))
      );
      setAnalysis(null);
    }
  }, [meal]);

  // Analizar ingredientes automáticamente (siempre activo)
  useEffect(() => {
    const validIngredients = ingredients
      .filter((ing) => ing.name.trim().length >= 3)
      .map((ing, i) => ({
        ...ing,
        quantity: weightInputs[i] ? `${weightInputs[i]}g` : ing.quantity || '',
      }));
    if (validIngredients.length === 0) {
      setAnalysis(null);
      return;
    }

    const timeoutId = setTimeout(async () => {
      setIsAnalyzing(true);
      try {
        const result = await analyzeIngredientsSmart(validIngredients, {
          targetMacros: meal?.targetMacros,
        });
        setAnalysis(result);
      } catch (error) {
        console.error('Error analyzing:', error);
      } finally {
        setIsAnalyzing(false);
      }
    }, 600);

    return () => clearTimeout(timeoutId);
  }, [ingredients, weightInputs, meal?.targetMacros]);

  const addIngredient = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIngredients([
      ...ingredients,
      { id: `new-${Date.now()}`, name: '', quantity: '', portion: '' },
    ]);
    setWeightInputs([...weightInputs, '']);
  };

  const removeIngredient = (index: number) => {
    if (ingredients.length > 1) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setIngredients(ingredients.filter((_, i) => i !== index));
      setWeightInputs(weightInputs.filter((_, i) => i !== index));
    }
  };

  const updateIngredient = (index: number, field: keyof Ingredient, value: string) => {
    const newIngs = [...ingredients];
    newIngs[index] = { ...newIngs[index], [field]: value };
    setIngredients(newIngs);
  };

  const updateWeight = (index: number, value: string) => {
    // Solo permitir números y punto decimal
    const numericValue = value.replace(/[^0-9.]/g, '');
    const newWeights = [...weightInputs];
    newWeights[index] = numericValue;
    setWeightInputs(newWeights);
  };

  const handleSave = async () => {
    if (!meal) return;

    const validIngredients = ingredients.filter((ing) => ing.name.trim());
    if (validIngredients.length === 0) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    setIsSaving(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      // Mapear al formato del sistema: name = texto completo, quantity = peso en gr, portion = vacío
      const finalIngredients = validIngredients.map((ing, i) => ({
        ...ing,
        name: ing.name.trim(),
        quantity: weightInputs[i] ? `${weightInputs[i]}g` : '',
        portion: '',
      }));

      const currentOption = meal.options[meal.selectedOption] || meal.options[0];
      await onSave(meal.id, currentOption.id, finalIngredients);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onClose();
    } catch (error) {
      console.error('Error saving meal:', error);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsSaving(false);
    }
  };

  if (!meal) return null;

  const currentOption = meal.options[meal.selectedOption] || meal.options[0];

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1"
      >
        <View className="flex-1 bg-transparent justify-end">
          <Animated.View
            style={[
              {
                backgroundColor: '#0a0a0a',
                borderTopLeftRadius: 24,
                borderTopRightRadius: 24,
                maxHeight: '90%',
                borderTopWidth: 2,
                borderTopColor: 'rgba(168, 85, 247, 0.5)',
                overflow: 'hidden',
              },
              animatedStyle,
            ]}
          >
            {/* Línea de acento superior con glow */}
            <View
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                height: 3,
                backgroundColor: '#A855F7',
                shadowColor: '#A855F7',
                shadowOffset: { width: 0, height: 0 },
                shadowOpacity: 0.8,
                shadowRadius: 10,
                zIndex: 10,
              }}
            />

            {/* Header - Draggable para cerrar */}
            <View
              {...panResponder.panHandlers}
              className="flex-row justify-between items-center p-4 pt-5 border-b border-zinc-800/50"
            >
              {/* Indicador de drag */}
              <View className="absolute top-2 left-0 right-0 items-center z-10">
                <View className="w-12 h-1.5 bg-zinc-600 rounded-full" />
              </View>

              <View className="flex-1 mt-2">
                <View className="flex-row items-center gap-2">
                  <Text className="text-white font-bold text-lg">Editar Comida</Text>
                  <Sparkles size={14} color="#A855F7" />
                </View>
                <Text className="text-zinc-500 text-xs">
                  {formatTimeToAMPM(meal.time)} • {currentOption?.name || 'Opción Principal'}
                </Text>
                {meal.targetMacros && (
                  <View className="flex-row gap-2 mt-1">
                    <Text className="text-savage-red text-xs font-mono">
                      {meal.targetMacros.protein}P
                    </Text>
                    <Text className="text-yellow-500 text-xs font-mono">
                      {meal.targetMacros.carbs}C
                    </Text>
                    <Text className="text-blue-400 text-xs font-mono">
                      {meal.targetMacros.fat}G
                    </Text>
                    <Text className="text-zinc-500 text-xs font-mono">
                      {meal.targetMacros.calories} kcal
                    </Text>
                  </View>
                )}
              </View>
            </View>

            <ScrollView className="p-4" showsVerticalScrollIndicator={false}>
              {/* Analysis Alert */}
              {analysis && (
                <View
                  className={`p-3 rounded-xl mb-4 border ${
                    analysis.isBalanced
                      ? 'bg-green-900/20 border-green-500/30'
                      : analysis.hasUnhealthyOnly
                        ? 'bg-red-900/20 border-red-500/30'
                        : 'bg-yellow-900/20 border-yellow-500/30'
                  }`}
                >
                  <View className="flex-row items-center gap-2">
                    {isAnalyzing ? (
                      <ActivityIndicator size="small" color="#A855F7" />
                    ) : analysis.isBalanced ? (
                      <CheckCircle size={16} color="#22C55E" />
                    ) : (
                      <AlertTriangle
                        size={16}
                        color={analysis.hasUnhealthyOnly ? '#EF4444' : '#EAB308'}
                      />
                    )}
                    <Text
                      className={`font-bold text-sm ${
                        analysis.isBalanced
                          ? 'text-green-400'
                          : analysis.hasUnhealthyOnly
                            ? 'text-red-400'
                            : 'text-yellow-400'
                      }`}
                    >
                      {isAnalyzing
                        ? 'Analizando...'
                        : analysis.isBalanced
                          ? 'Comida balanceada'
                          : analysis.hasUnhealthyOnly
                            ? 'Revisar ingredientes'
                            : 'Falta balance'}
                    </Text>
                  </View>

                  {analysis.macroFitMessage && (
                    <Text className="text-zinc-400 text-xs mt-1">
                      🎯 {analysis.macroFitMessage}
                    </Text>
                  )}

                  {!analysis.isBalanced && !isAnalyzing && (
                    <View className="flex-row gap-3 mt-2">
                      <View className="flex-row items-center gap-1">
                        <View
                          className={`w-2 h-2 rounded-full ${
                            analysis.hasProtein ? 'bg-green-500' : 'bg-red-500'
                          }`}
                        />
                        <Text className="text-zinc-500 text-xs">P</Text>
                      </View>
                      <View className="flex-row items-center gap-1">
                        <View
                          className={`w-2 h-2 rounded-full ${
                            analysis.hasCarbs ? 'bg-green-500' : 'bg-yellow-500'
                          }`}
                        />
                        <Text className="text-zinc-500 text-xs">C</Text>
                      </View>
                      <View className="flex-row items-center gap-1">
                        <View
                          className={`w-2 h-2 rounded-full ${
                            analysis.hasFat ? 'bg-green-500' : 'bg-zinc-600'
                          }`}
                        />
                        <Text className="text-zinc-500 text-xs">G</Text>
                      </View>
                    </View>
                  )}

                  {analysis.suggestions.length > 0 && !analysis.isBalanced && (
                    <Text className="text-yellow-400/70 text-xs mt-1">
                      → {analysis.suggestions[0]}
                    </Text>
                  )}
                </View>
              )}

              {/* Ingredients */}
              <Text className="text-zinc-400 text-xs font-bold mb-2 uppercase">Ingredientes</Text>

              {/* Info banner - diferente para alternativa vs principal */}
              {isAlternative ? (
                <View className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-3 mb-3">
                  <View className="flex-row items-center gap-2 mb-1">
                    <Lock size={12} color="#EAB308" />
                    <Text className="text-yellow-400 text-xs font-bold">Alternativa</Text>
                  </View>
                  <Text className="text-yellow-300/70 text-xs">
                    Las cantidades se calculan automáticamente según los macros del platillo
                    principal. Puedes cambiar los ingredientes y se recalcularán las cantidades.
                  </Text>
                </View>
              ) : (
                <View className="bg-purple-500/10 border border-purple-500/20 rounded-xl p-3 mb-3">
                  <Text className="text-purple-300 text-xs">
                    ✏️ Escribe el ingrediente con su porción. El peso en gramos es opcional.
                  </Text>
                </View>
              )}

              {ingredients.map((ing, i) => (
                <View
                  key={ing.id}
                  className="bg-zinc-900/80 p-4 rounded-xl border border-zinc-800 mb-3"
                >
                  <View className="flex-row justify-between items-center mb-2">
                    <Text className="text-zinc-500 text-xs">Ingrediente {i + 1}</Text>
                    {ingredients.length > 1 && (
                      <Pressable onPress={() => removeIngredient(i)}>
                        <Trash2 size={16} color="#EF4444" />
                      </Pressable>
                    )}
                  </View>

                  {/* Campo principal: Nombre + Porción */}
                  <TextInput
                    value={ing.name}
                    onChangeText={(v) => updateIngredient(i, 'name', v)}
                    placeholder="ej. Pechuga de Pollo 1 filete mediano"
                    placeholderTextColor="#666"
                    className="bg-transparent border-b border-zinc-700 text-white py-2 mb-3"
                    editable={!isAlternative}
                  />

                  {/* Campo opcional: Peso en gramos (solo numérico) */}
                  {isAlternative ? (
                    <View className="flex-row items-center gap-2">
                      <Scale size={14} color="#52525b" />
                      <View
                        className="flex-1 bg-zinc-800/30 border border-zinc-700/30 rounded-lg px-3 py-2"
                        style={{ opacity: 0.5 }}
                      >
                        <Text className="text-zinc-400 text-sm font-mono">
                          {weightInputs[i] ? `${weightInputs[i]}gr` : ing.quantity || '—'}
                        </Text>
                      </View>
                    </View>
                  ) : (
                    <View className="flex-row items-center gap-2">
                      <Scale size={14} color="#3B82F6" />
                      <TextInput
                        value={weightInputs[i] || ''}
                        onChangeText={(v) => updateWeight(i, v)}
                        placeholder="Peso en gr (opcional)"
                        placeholderTextColor="#555"
                        keyboardType="numeric"
                        className="flex-1 bg-zinc-800/60 border border-blue-500/30 rounded-lg text-white text-sm px-3 py-2 font-mono"
                      />
                      {weightInputs[i] ? (
                        <Text className="text-blue-400 text-xs font-mono font-bold">
                          {weightInputs[i]}gr
                        </Text>
                      ) : null}
                    </View>
                  )}
                </View>
              ))}

              {/* Botón de añadir ingrediente */}
              <Pressable
                onPress={addIngredient}
                className="w-full py-3 border border-dashed border-zinc-600 rounded-xl mb-6 active:border-purple-500 active:bg-purple-500/5"
              >
                <View className="flex-row items-center justify-center gap-2">
                  <Plus size={18} color="#A855F7" />
                  <Text className="text-zinc-400 font-medium">Añadir ingrediente</Text>
                </View>
              </Pressable>

              <Pressable
                onPress={handleSave}
                disabled={isSaving}
                className={`w-full py-4 rounded-xl ${
                  isSaving ? 'bg-zinc-600' : 'bg-purple-500 active:bg-purple-600'
                }`}
                style={{
                  marginBottom: Math.max(insets.bottom, 16) + 8,
                  shadowColor: '#A855F7',
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: isSaving ? 0 : 0.3,
                  shadowRadius: 8,
                  elevation: isSaving ? 0 : 5,
                }}
              >
                {isSaving ? (
                  <View className="flex-row items-center justify-center gap-2">
                    <ActivityIndicator size="small" color="#fff" />
                    <Text className="text-white font-bold text-center text-base">
                      {isAlternative ? 'Recalculando cantidades...' : 'Calculando y guardando...'}
                    </Text>
                  </View>
                ) : (
                  <Text className="text-white font-bold text-center text-lg">
                    {isAlternative ? 'GUARDAR INGREDIENTES' : 'GUARDAR CAMBIOS'}
                  </Text>
                )}
              </Pressable>
            </ScrollView>
          </Animated.View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

export default EditMealModal;
