// ============================================================================
// ADD OPTION MODAL - Modal para añadir un nuevo platillo (opción) a una comida
// Solo pide nombres de ingredientes — las cantidades se calculan automáticamente
// según los macros de la comida principal
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
import { Plus, Trash2, Sparkles } from 'lucide-react-native';
import { calculateMealWithUserMacros } from '../../services/hank/nutrition';

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
  onSave: (
    mealId: string,
    optionName: string,
    ingredients: Ingredient[],
    notes?: string
  ) => Promise<void>;
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
  const [notes, setNotes] = useState('');

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
      setNotes('');
      // Haptic feedback cuando abre
      setTimeout(() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }, 300);
    }
  }, [visible]);

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

  const updateIngredientName = (index: number, value: string) => {
    const newIngs = [...ingredients];
    newIngs[index] = { ...newIngs[index], name: value };
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

      // Las cantidades se calculan automáticamente según los macros de la comida principal
      // El usuario solo ingresó nombres de ingredientes (sin cantidad ni porción)
      if (targetMacros) {
        try {
          console.log('🎯 Calculando cantidades con macros de comida principal:', targetMacros);
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
          if (onCalculateMacros) {
            finalIngredients = await onCalculateMacros(finalIngredients);
          }
        }
      } else if (onCalculateMacros) {
        try {
          finalIngredients = await onCalculateMacros(finalIngredients);
        } catch (error) {
          console.error('Error calculating macros:', error);
        }
      }

      const name = `Opción ${Date.now().toString().slice(-4)}`;
      await onSave(mealId, name, finalIngredients, notes.trim() || undefined);
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
              {/* Ingredients - Solo nombre, sin campos de cantidad */}
              <Text className="text-zinc-400 text-xs font-bold mb-2 uppercase">Ingredientes</Text>

              {/* Info: cantidades automáticas según macros */}
              <View className="bg-purple-500/10 border border-purple-500/20 rounded-xl p-3 mb-3">
                <Text className="text-purple-300 text-xs">
                  🤖 Solo agrega los ingredientes — Hank calculará automáticamente las cantidades
                  según los macros de esta comida
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
                    onChangeText={(v) => updateIngredientName(i, v)}
                    placeholder="Nombre (ej. Pollo a la plancha)"
                    placeholderTextColor="#666"
                    className="bg-transparent border-b border-zinc-700 text-white py-2"
                  />
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

              {/* Notas */}
              <Text className="text-zinc-400 text-xs font-bold mb-2 uppercase">
                Notas (opcional)
              </Text>
              <TextInput
                value={notes}
                onChangeText={setNotes}
                placeholder="Recomendaciones, ingredientes extras, preparación..."
                placeholderTextColor="#555"
                multiline
                numberOfLines={3}
                className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-3 text-white text-sm mb-6"
                style={{ minHeight: 70, textAlignVertical: 'top' }}
              />

              {/* Save Button */}
              <Pressable
                onPress={handleSave}
                disabled={isSaving}
                className={`w-full py-4 rounded-xl ${
                  isSaving ? 'bg-zinc-600' : 'bg-savage-red active:bg-red-700'
                }`}
                style={{
                  marginBottom: Math.max(insets.bottom, 16) + 8,
                  shadowColor: '#DC2626',
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: isSaving ? 0 : 0.4,
                  shadowRadius: 8,
                  elevation: isSaving ? 0 : 5,
                }}
              >
                {isSaving ? (
                  <View className="flex-row items-center justify-center gap-2">
                    <ActivityIndicator size="small" color="#FFF" />
                    <Text className="text-white font-bold text-center text-base">
                      Calculando cantidades...
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
