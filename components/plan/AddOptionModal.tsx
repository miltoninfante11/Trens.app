// ============================================================================
// ADD OPTION MODAL - Modal para añadir un nuevo platillo a una comida
// Análisis inteligente automático (siempre activo)
// Campos manuales de gramos y porciones con conversión IA
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
  Layers,
} from 'lucide-react-native';
import {
  analyzeIngredientsSmart,
  IngredientAnalysis,
} from '../../services/hank/ingredientAnalyzer';
import { calculateMealWithUserMacros, convertGramsPortions } from '../../services/hank/nutrition';

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

interface AddOptionModalProps {
  visible: boolean;
  mealId: string;
  mealName: string;
  targetMacros?: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
  };
  onClose: () => void;
  onSave: (mealId: string, optionName: string, ingredients: Ingredient[]) => Promise<void>;
  onCalculateMacros?: (ingredients: Ingredient[]) => Promise<Ingredient[]>;
}

// ============================================================================
// COMPONENT
// ============================================================================
export const AddOptionModal: React.FC<AddOptionModalProps> = ({
  visible,
  mealId,
  mealName,
  targetMacros,
  onClose,
  onSave,
  onCalculateMacros,
}) => {
  const insets = useSafeAreaInsets();
  const [ingredients, setIngredients] = useState<Ingredient[]>([
    { id: `new-${Date.now()}`, name: '', quantity: '', portion: '' },
  ]);
  const [isSaving, setIsSaving] = useState(false);
  const [analysis, setAnalysis] = useState<IngredientAnalysis | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isConverting, setIsConverting] = useState(false);

  // ===== ANIMACIONES FLUIDAS =====
  const translateY = useSharedValue(0);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => Math.abs(gestureState.dy) > 5,
      onPanResponderGrant: () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      },
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy > 0) {
          translateY.value = gestureState.dy;
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > 100 || gestureState.vy > 0.5) {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          onClose();
        } else {
          translateY.value = withSpring(0, { damping: 20, stiffness: 300 });
        }
      },
    })
  ).current;

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  // Reset state when modal opens
  useEffect(() => {
    if (visible) {
      translateY.value = 0;
      setIngredients([{ id: `new-${Date.now()}`, name: '', quantity: '', portion: '' }]);
      setAnalysis(null);
      // Haptic feedback cuando abre
      setTimeout(() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }, 300);
    }
  }, [visible]);

  // Analizar ingredientes automáticamente (siempre activo)
  useEffect(() => {
    const validIngredients = ingredients.filter((ing) => ing.name.trim().length >= 3);
    if (validIngredients.length === 0) {
      setAnalysis(null);
      return;
    }

    const timeoutId = setTimeout(async () => {
      setIsAnalyzing(true);
      try {
        const result = await analyzeIngredientsSmart(validIngredients, {
          targetMacros: targetMacros,
        });
        setAnalysis(result);
      } catch (error) {
        console.error('Error analyzing:', error);
      } finally {
        setIsAnalyzing(false);
      }
    }, 600);

    return () => clearTimeout(timeoutId);
  }, [ingredients, targetMacros]);

  const addIngredient = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIngredients([
      ...ingredients,
      { id: `new-${Date.now()}`, name: '', quantity: '', portion: '' },
    ]);
  };

  const removeIngredient = (index: number) => {
    if (ingredients.length > 1) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setIngredients(ingredients.filter((_, i) => i !== index));
    }
  };

  const updateIngredient = (index: number, field: keyof Ingredient, value: string) => {
    const newIngs = [...ingredients];
    newIngs[index] = { ...newIngs[index], [field]: value };
    setIngredients(newIngs);
  };

  const handleSave = async () => {
    const validIngredients = ingredients.filter((ing) => ing.name.trim());
    if (validIngredients.length === 0) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    setIsSaving(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      let finalIngredients = validIngredients;

      // Primero: conversión gramos ↔ porciones si falta alguno
      const needsConversion = finalIngredients.some(
        (ing) =>
          (ing.quantity.trim() && !(ing.portion || '').trim()) ||
          (!(ing.quantity || '').trim() && (ing.portion || '').trim())
      );

      if (needsConversion) {
        setIsConverting(true);
        try {
          const converted = await convertGramsPortions(
            finalIngredients.map((ing) => ({
              name: ing.name,
              quantity: ing.quantity?.trim() || undefined,
              portion: ing.portion?.trim() || undefined,
            }))
          );
          finalIngredients = converted.map((c, idx) => ({
            ...finalIngredients[idx],
            name: c.name,
            quantity: c.quantity,
            portion: c.portion,
          }));
        } catch (error) {
          console.error('Error convirtiendo:', error);
        } finally {
          setIsConverting(false);
        }
      }

      // Luego: usar IA para calcular gramos con macros objetivo
      if (targetMacros) {
        try {
          console.log('🎯 Calculando con macros objetivo:', targetMacros);
          const calculated = await calculateMealWithUserMacros(finalIngredients, targetMacros);
          finalIngredients = calculated.map((ing) => ({
            id: ing.id,
            name: ing.name,
            quantity: ing.quantity,
            portion: ing.portion,
            nutritionInfo: ing.nutritionInfo,
          }));
        } catch (error) {
          console.error('Error calculating macros with target:', error);
          // Fallback a onCalculateMacros si falla
          if (onCalculateMacros) {
            finalIngredients = await onCalculateMacros(finalIngredients);
          }
        }
      } else if (onCalculateMacros) {
        // Si no hay targetMacros, usar cálculo genérico
        try {
          finalIngredients = await onCalculateMacros(finalIngredients);
        } catch (error) {
          console.error('Error calculating macros:', error);
        }
      }

      const name = `Opción ${Date.now().toString().slice(-4)}`;
      await onSave(mealId, name, finalIngredients);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onClose();
    } catch (error) {
      console.error('Error saving option:', error);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1"
      >
        <View className="flex-1 bg-transparent justify-end">
          <Animated.View
            style={[
              animatedStyle,
              {
                backgroundColor: '#0a0a0a',
                borderTopLeftRadius: 24,
                borderTopRightRadius: 24,
                maxHeight: '90%',
                borderTopWidth: 2,
                borderTopColor: 'rgba(168, 85, 247, 0.5)',
                overflow: 'hidden',
              },
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

            {/* Drag Indicator */}
            <View {...panResponder.panHandlers} className="pt-4 pb-2 items-center">
              <View className="w-12 h-1.5 bg-zinc-600 rounded-full" />
            </View>

            {/* Header */}
            <View className="flex-row justify-between items-center px-4 pb-4 border-b border-zinc-800/50">
              <View className="flex-1">
                <View className="flex-row items-center gap-2">
                  <Sparkles size={16} color="#A855F7" />
                  <Text className="text-white font-bold text-lg">Añadir Platillo</Text>
                </View>
                <Text className="text-zinc-500 text-xs mt-1">{mealName}</Text>
                {targetMacros && (
                  <View className="flex-row gap-2 mt-1">
                    <Text className="text-savage-red text-xs font-mono">
                      {targetMacros.protein}P
                    </Text>
                    <Text className="text-yellow-500 text-xs font-mono">{targetMacros.carbs}C</Text>
                    <Text className="text-blue-400 text-xs font-mono">{targetMacros.fat}G</Text>
                    <Text className="text-zinc-500 text-xs font-mono">
                      {targetMacros.calories} kcal
                    </Text>
                  </View>
                )}
              </View>
            </View>

            <ScrollView className="p-4" showsVerticalScrollIndicator={false}>
              {/* Analysis Alert - Siempre visible cuando hay análisis */}
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

                  {/* Macro fit message */}
                  {analysis.macroFitMessage && (
                    <Text className="text-zinc-400 text-xs mt-1">
                      🎯 {analysis.macroFitMessage}
                    </Text>
                  )}

                  {/* Macro indicators en línea */}
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

                  {/* Sugerencia (máximo 1) */}
                  {analysis.suggestions.length > 0 && !analysis.isBalanced && (
                    <Text className="text-yellow-400/70 text-xs mt-1">
                      → {analysis.suggestions[0]}
                    </Text>
                  )}
                </View>
              )}

              {/* Ingredients */}
              <Text className="text-zinc-400 text-xs font-bold mb-2 uppercase">Ingredientes</Text>

              {/* Info: conversión automática */}
              <View className="bg-purple-500/10 border border-purple-500/20 rounded-xl p-3 mb-3">
                <Text className="text-purple-300 text-xs">
                  💡 Ingresa gramos O porciones — la IA calcula el otro al guardar
                </Text>
              </View>

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
                  <TextInput
                    value={ing.name}
                    onChangeText={(v) => updateIngredient(i, 'name', v)}
                    placeholder="Nombre (ej. Pollo a la plancha)"
                    placeholderTextColor="#666"
                    className="bg-transparent border-b border-zinc-700 text-white py-2 mb-3"
                  />

                  {/* Campos de Gramos y Porciones */}
                  <View className="flex-row gap-3">
                    {/* Gramos */}
                    <View className="flex-1">
                      <View className="flex-row items-center gap-1.5 mb-1">
                        <Scale size={12} color="#3B82F6" />
                        <Text className="text-zinc-500 text-[10px] font-bold uppercase">
                          Gramos
                        </Text>
                      </View>
                      <TextInput
                        value={ing.quantity}
                        onChangeText={(v) => updateIngredient(i, 'quantity', v)}
                        placeholder="ej. 200g"
                        placeholderTextColor="#555"
                        keyboardType="default"
                        className="bg-zinc-800/60 border border-zinc-700/50 rounded-lg text-white text-sm px-3 py-2 font-mono"
                      />
                    </View>

                    {/* Porciones */}
                    <View className="flex-1">
                      <View className="flex-row items-center gap-1.5 mb-1">
                        <Layers size={12} color="#A855F7" />
                        <Text className="text-zinc-500 text-[10px] font-bold uppercase">
                          Porciones
                        </Text>
                      </View>
                      <TextInput
                        value={ing.portion || ''}
                        onChangeText={(v) => updateIngredient(i, 'portion', v)}
                        placeholder="ej. 2 tazas"
                        placeholderTextColor="#555"
                        className="bg-zinc-800/60 border border-zinc-700/50 rounded-lg text-white text-sm px-3 py-2 font-mono"
                      />
                    </View>
                  </View>
                </View>
              ))}

              {/* Add Ingredient Button */}
              <Pressable
                onPress={addIngredient}
                className="w-full py-3 border border-dashed border-zinc-600 rounded-xl mb-6 active:border-purple-500 active:bg-purple-500/5"
              >
                <View className="flex-row items-center justify-center gap-2">
                  <Plus size={18} color="#A855F7" />
                  <Text className="text-zinc-400 font-medium">Añadir ingrediente</Text>
                </View>
              </Pressable>

              {/* Save Button */}
              <Pressable
                onPress={handleSave}
                disabled={isSaving || isConverting}
                className={`w-full py-4 rounded-xl ${
                  isSaving || isConverting ? 'bg-zinc-600' : 'bg-savage-red active:bg-red-700'
                }`}
                style={{
                  marginBottom: Math.max(insets.bottom, 16) + 8,
                  shadowColor: '#DC2626',
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: isSaving || isConverting ? 0 : 0.4,
                  shadowRadius: 8,
                  elevation: isSaving || isConverting ? 0 : 5,
                }}
              >
                {isSaving || isConverting ? (
                  <View className="flex-row items-center justify-center gap-2">
                    <ActivityIndicator size="small" color="#FFF" />
                    <Text className="text-white font-bold text-center text-base">
                      {isConverting ? 'Calculando...' : 'Guardando...'}
                    </Text>
                  </View>
                ) : (
                  <Text className="text-white font-bold text-center text-lg">AÑADIR PLATILLO</Text>
                )}
              </Pressable>
            </ScrollView>
          </Animated.View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

export default AddOptionModal;
