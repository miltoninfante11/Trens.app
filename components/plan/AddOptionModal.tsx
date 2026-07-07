// ============================================================================
// ADD OPTION MODAL - Modal para añadir un nuevo platillo (opción) a una comida
// Igual que AddMealModal: nombre + peso opcional + cocido/crudo + sin gramos
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
import { Alert } from '../../lib/alert';
import { Plus, Trash2, Scale } from 'lucide-react-native';

// ============================================================================
// TYPES
// ============================================================================
interface Ingredient {
  id: string;
  name: string;
  quantity: string;
  portion?: string;
  skipGrams?: boolean;
  weightType?: 'cocido' | 'crudo';
}

interface AddOptionModalProps {
  visible: boolean;
  mealId: string;
  mealName: string;
  onClose: () => void;
  onSave: (
    mealId: string,
    optionName: string,
    ingredients: Ingredient[],
    notes?: string
  ) => Promise<void>;
}

// ============================================================================
// COMPONENT
// ============================================================================
export const AddOptionModal: React.FC<AddOptionModalProps> = ({
  visible,
  mealId,
  mealName,
  onClose,
  onSave,
}) => {
  const insets = useSafeAreaInsets();
  const [ingredients, setIngredients] = useState<
    {
      id: string;
      name: string;
      weightGrams: string;
      skipGrams: boolean;
      weightType: 'cocido' | 'crudo' | '';
    }[]
  >([{ id: `new-${Date.now()}`, name: '', weightGrams: '', skipGrams: true, weightType: '' }]);
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
      setIngredients([
        { id: `new-${Date.now()}`, name: '', weightGrams: '', skipGrams: true, weightType: '' },
      ]);
      setNotes('');
      setTimeout(() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }, 300);
    }
  }, [visible]);

  const addIngredient = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIngredients([
      ...ingredients,
      { id: `new-${Date.now()}`, name: '', weightGrams: '', skipGrams: true, weightType: '' },
    ]);
  };

  const removeIngredient = (index: number) => {
    if (ingredients.length > 1) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setIngredients(ingredients.filter((_, i) => i !== index));
    }
  };

  const updateIngredient = (index: number, field: 'name' | 'weightGrams', value: string) => {
    const newIngs = [...ingredients];
    if (field === 'weightGrams') {
      const numericValue = value.replace(/[^0-9.]/g, '');
      newIngs[index] = { ...newIngs[index], [field]: numericValue };
    } else {
      newIngs[index] = { ...newIngs[index], [field]: value };
    }
    setIngredients(newIngs);
  };

  const toggleSkipGrams = (index: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const newIngs = [...ingredients];
    const newSkip = !newIngs[index].skipGrams;
    newIngs[index] = {
      ...newIngs[index],
      skipGrams: newSkip,
      weightGrams: newSkip ? '' : newIngs[index].weightGrams,
      weightType: newSkip ? '' : newIngs[index].weightType,
    };
    setIngredients(newIngs);
  };

  const setWeightType = (index: number, type: 'cocido' | 'crudo') => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const newIngs = [...ingredients];
    newIngs[index] = {
      ...newIngs[index],
      weightType: newIngs[index].weightType === type ? '' : type,
    };
    setIngredients(newIngs);
  };

  const handleSave = async () => {
    const validIngredients = ingredients.filter((ing) => ing.name.trim());
    if (validIngredients.length === 0) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    const missingWeightType = validIngredients.some((ing) => !ing.skipGrams && !ing.weightType);
    if (missingWeightType) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Peso requerido', 'Selecciona Cocido o Crudo para cada ingrediente.');
      return;
    }

    setIsSaving(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const finalIngredients: Ingredient[] = validIngredients.map((ing) => ({
        id: ing.id,
        name: ing.name.trim(),
        quantity: ing.weightGrams ? `${ing.weightGrams}g` : '',
        portion: '',
        skipGrams: ing.skipGrams || undefined,
        weightType: ing.weightType ? (ing.weightType as 'cocido' | 'crudo') : undefined,
      }));

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
                borderTopColor: 'rgba(34, 197, 94, 0.5)',
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
                backgroundColor: '#22C55E',
                shadowColor: '#22C55E',
                shadowOffset: { width: 0, height: 0 },
                shadowOpacity: 0.8,
                shadowRadius: 10,
                zIndex: 10,
              }}
            />

            {/* Header Draggable */}
            <View
              {...panResponder.panHandlers}
              className="flex-row justify-between items-center p-4 border-b border-zinc-800/50"
            >
              <View className="absolute top-3 left-0 right-0 items-center">
                <View className="w-12 h-1.5 bg-zinc-700 rounded-full" />
              </View>
              <View className="flex-1 mt-2">
                <Text className="text-white font-bold text-lg">Añadir Platillo Alternativo</Text>
                <Text className="text-zinc-500 text-xs mt-0.5">{mealName}</Text>
              </View>
            </View>

            <ScrollView className="p-4" showsVerticalScrollIndicator={false}>
              <Text className="text-zinc-400 text-xs font-bold mb-2 uppercase">Ingredientes</Text>

              <View className="bg-green-500/10 border border-green-500/20 rounded-xl p-3 mb-3">
                <Text className="text-green-300 text-xs">
                  ✏️ Escribe el ingrediente con su porción. El peso en gramos es opcional.
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

                  {/* Nombre + porción */}
                  <TextInput
                    value={ing.name}
                    onChangeText={(v) => updateIngredient(i, 'name', v)}
                    placeholder="ej. Pechuga de Pollo 1 filete mediano"
                    placeholderTextColor="#666"
                    className="bg-transparent border-b border-zinc-700 text-white py-2 mb-3"
                  />

                  {/* Peso en gramos + Cocido/Crudo */}
                  <View className="flex-row items-center gap-2">
                    <Scale size={14} color={ing.skipGrams ? '#52525b' : '#3B82F6'} />
                    <TextInput
                      value={ing.skipGrams ? '' : ing.weightGrams}
                      onChangeText={(v) => updateIngredient(i, 'weightGrams', v)}
                      placeholder={ing.skipGrams ? 'Sin gr' : 'Gramos'}
                      placeholderTextColor={ing.skipGrams ? '#71717a' : '#555'}
                      keyboardType="numeric"
                      editable={!ing.skipGrams}
                      className={`w-24 rounded-lg text-sm px-3 py-2 font-mono ${
                        ing.skipGrams
                          ? 'bg-zinc-800/30 border border-zinc-700/30 text-zinc-600'
                          : 'bg-zinc-800/60 border border-blue-500/30 text-white'
                      }`}
                    />
                    {/* Radio: Cocido */}
                    <Pressable
                      onPress={() => !ing.skipGrams && setWeightType(i, 'cocido')}
                      className="flex-row items-center gap-1"
                      style={{ opacity: ing.skipGrams ? 0.3 : 1 }}
                    >
                      <View
                        className={`w-4 h-4 rounded-full border-2 items-center justify-center ${
                          ing.weightType === 'cocido'
                            ? 'border-green-500 bg-green-500'
                            : 'border-zinc-600 bg-transparent'
                        }`}
                      >
                        {ing.weightType === 'cocido' && (
                          <View className="w-1.5 h-1.5 rounded-full bg-white" />
                        )}
                      </View>
                      <Text
                        className={`text-xs ${ing.weightType === 'cocido' ? 'text-green-400' : 'text-zinc-500'}`}
                      >
                        Cocido
                      </Text>
                    </Pressable>
                    {/* Radio: Crudo */}
                    <Pressable
                      onPress={() => !ing.skipGrams && setWeightType(i, 'crudo')}
                      className="flex-row items-center gap-1"
                      style={{ opacity: ing.skipGrams ? 0.3 : 1 }}
                    >
                      <View
                        className={`w-4 h-4 rounded-full border-2 items-center justify-center ${
                          ing.weightType === 'crudo'
                            ? 'border-red-500 bg-red-500'
                            : 'border-zinc-600 bg-transparent'
                        }`}
                      >
                        {ing.weightType === 'crudo' && (
                          <View className="w-1.5 h-1.5 rounded-full bg-white" />
                        )}
                      </View>
                      <Text
                        className={`text-xs ${ing.weightType === 'crudo' ? 'text-red-400' : 'text-zinc-500'}`}
                      >
                        Crudo
                      </Text>
                    </Pressable>
                  </View>

                  {/* Toggle: Sin gramos */}
                  <Pressable
                    onPress={() => toggleSkipGrams(i)}
                    className="flex-row items-center gap-2 mt-2"
                  >
                    <View
                      className={`w-5 h-5 rounded border items-center justify-center ${
                        ing.skipGrams
                          ? 'bg-orange-500 border-orange-500'
                          : 'bg-transparent border-zinc-600'
                      }`}
                    >
                      {ing.skipGrams && <Text className="text-white text-xs font-bold">✓</Text>}
                    </View>
                    <Text
                      className={`text-xs ${ing.skipGrams ? 'text-orange-400' : 'text-zinc-500'}`}
                    >
                      Sin gramos (usar solo porciones)
                    </Text>
                  </Pressable>
                </View>
              ))}

              <Pressable
                onPress={addIngredient}
                className="w-full py-3 border border-dashed border-zinc-600 rounded-xl mb-6 active:border-green-500 active:bg-green-500/5"
              >
                <View className="flex-row items-center justify-center gap-2">
                  <Plus size={18} color="#22C55E" />
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

              <Pressable
                onPress={handleSave}
                disabled={isSaving}
                className={`w-full py-4 rounded-xl ${
                  isSaving ? 'bg-zinc-600' : 'bg-green-500 active:bg-green-600'
                }`}
                style={{
                  marginBottom: Math.max(insets.bottom, 16) + 8,
                  shadowColor: '#22C55E',
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: isSaving ? 0 : 0.4,
                  shadowRadius: 8,
                  elevation: isSaving ? 0 : 5,
                }}
              >
                {isSaving ? (
                  <View className="flex-row items-center justify-center gap-2">
                    <ActivityIndicator size="small" color="#FFF" />
                    <Text className="text-white font-bold text-center text-base">Guardando...</Text>
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
