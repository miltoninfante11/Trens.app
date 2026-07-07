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
import { Alert } from '../../lib/alert';
import { X, Plus, Trash2, Scale, Lock } from 'lucide-react-native';

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

interface MealOption {
  id: string;
  name: string;
  ingredients: Ingredient[];
  notes?: string;
}

interface Meal {
  id: string;
  time: string;
  options: MealOption[];
  selectedOption: number;
}

interface EditMealModalProps {
  visible: boolean;
  meal: Meal | null;
  onClose: () => void;
  onSave: (
    mealId: string,
    optionId: string,
    ingredients: Ingredient[],
    notes?: string
  ) => Promise<void>;
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
export const EditMealModal: React.FC<EditMealModalProps> = ({ visible, meal, onClose, onSave }) => {
  const insets = useSafeAreaInsets();
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [weightInputs, setWeightInputs] = useState<string[]>([]);
  const [skipGramsFlags, setSkipGramsFlags] = useState<boolean[]>([]);
  const [weightTypeFlags, setWeightTypeFlags] = useState<('cocido' | 'crudo' | '')[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [notes, setNotes] = useState('');

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
      // Inicializar flags de skipGrams desde datos guardados
      setSkipGramsFlags(currentOption.ingredients.map((ing: any) => !!(ing as any).skipGrams));
      // Inicializar weightType desde datos guardados
      setWeightTypeFlags(
        currentOption.ingredients.map((ing: any) => (ing as any).weightType || '')
      );
      setNotes(currentOption.notes || '');
    }
  }, [meal]);

  const addIngredient = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIngredients([
      ...ingredients,
      { id: `new-${Date.now()}`, name: '', quantity: '', portion: '' },
    ]);
    setWeightInputs([...weightInputs, '']);
    setSkipGramsFlags([...skipGramsFlags, false]);
    setWeightTypeFlags([...weightTypeFlags, '']);
  };

  const removeIngredient = (index: number) => {
    if (ingredients.length > 1) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setIngredients(ingredients.filter((_, i) => i !== index));
      setWeightInputs(weightInputs.filter((_, i) => i !== index));
      setSkipGramsFlags(skipGramsFlags.filter((_, i) => i !== index));
      setWeightTypeFlags(weightTypeFlags.filter((_, i) => i !== index));
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

  const toggleSkipGrams = (index: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const newFlags = [...skipGramsFlags];
    const newSkip = !newFlags[index];
    newFlags[index] = newSkip;
    setSkipGramsFlags(newFlags);
    // Limpiar gramos y weightType si se activa skipGrams
    if (newSkip) {
      const newWeights = [...weightInputs];
      newWeights[index] = '';
      setWeightInputs(newWeights);
      const newTypes = [...weightTypeFlags];
      newTypes[index] = '';
      setWeightTypeFlags(newTypes);
    }
  };

  const setWeightType = (index: number, type: 'cocido' | 'crudo') => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const newTypes = [...weightTypeFlags];
    newTypes[index] = newTypes[index] === type ? '' : type;
    setWeightTypeFlags(newTypes);
  };

  const handleSave = async () => {
    if (!meal) return;

    const validIngredients = ingredients.filter((ing) => ing.name.trim());
    if (validIngredients.length === 0) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    const missingWeightType = validIngredients.some(
      (_, i) => !skipGramsFlags[i] && !weightTypeFlags[i]
    );
    if (missingWeightType) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Peso requerido', 'Selecciona Cocido o Crudo para cada ingrediente.');
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
        skipGrams: skipGramsFlags[i] || undefined,
        weightType: weightTypeFlags[i] ? (weightTypeFlags[i] as 'cocido' | 'crudo') : undefined,
      }));

      const currentOption = meal.options[meal.selectedOption] || meal.options[0];
      await onSave(meal.id, currentOption.id, finalIngredients, notes.trim() || undefined);
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
                borderTopColor: 'rgba(34, 197, 94, 0.5)',
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
                backgroundColor: '#22C55E',
                shadowColor: '#22C55E',
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
                </View>
                <Text className="text-zinc-500 text-xs">
                  {formatTimeToAMPM(meal.time)} • {currentOption?.name || 'Opción Principal'}
                </Text>
              </View>
            </View>

            <ScrollView className="p-4" showsVerticalScrollIndicator={false}>
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
                    Puedes cambiar los ingredientes de este platillo alternativo.
                  </Text>
                </View>
              ) : (
                <View className="bg-green-500/10 border border-green-500/20 rounded-xl p-3 mb-3">
                  <Text className="text-green-300 text-xs">
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
                    <>
                      {/* Campo: Peso en gramos + tipo (cocido/crudo) */}
                      <View className="flex-row items-center gap-2">
                        <Scale size={14} color={skipGramsFlags[i] ? '#52525b' : '#3B82F6'} />
                        <TextInput
                          value={skipGramsFlags[i] ? '' : weightInputs[i] || ''}
                          onChangeText={(v) => updateWeight(i, v)}
                          placeholder={skipGramsFlags[i] ? 'Sin gr' : 'Gramos'}
                          placeholderTextColor={skipGramsFlags[i] ? '#71717a' : '#555'}
                          keyboardType="numeric"
                          editable={!skipGramsFlags[i]}
                          className={`w-24 rounded-lg text-sm px-3 py-2 font-mono ${
                            skipGramsFlags[i]
                              ? 'bg-zinc-800/30 border border-zinc-700/30 text-zinc-600'
                              : 'bg-zinc-800/60 border border-blue-500/30 text-white'
                          }`}
                        />
                        {/* Radio: Cocido */}
                        <Pressable
                          onPress={() => !skipGramsFlags[i] && setWeightType(i, 'cocido')}
                          className="flex-row items-center gap-1"
                          style={{ opacity: skipGramsFlags[i] ? 0.3 : 1 }}
                        >
                          <View
                            className={`w-4 h-4 rounded-full border-2 items-center justify-center ${
                              weightTypeFlags[i] === 'cocido'
                                ? 'border-green-500 bg-green-500'
                                : 'border-zinc-600 bg-transparent'
                            }`}
                          >
                            {weightTypeFlags[i] === 'cocido' && (
                              <View className="w-1.5 h-1.5 rounded-full bg-white" />
                            )}
                          </View>
                          <Text
                            className={`text-xs ${weightTypeFlags[i] === 'cocido' ? 'text-green-400' : 'text-zinc-500'}`}
                          >
                            Cocido
                          </Text>
                        </Pressable>
                        {/* Radio: Crudo */}
                        <Pressable
                          onPress={() => !skipGramsFlags[i] && setWeightType(i, 'crudo')}
                          className="flex-row items-center gap-1"
                          style={{ opacity: skipGramsFlags[i] ? 0.3 : 1 }}
                        >
                          <View
                            className={`w-4 h-4 rounded-full border-2 items-center justify-center ${
                              weightTypeFlags[i] === 'crudo'
                                ? 'border-red-500 bg-red-500'
                                : 'border-zinc-600 bg-transparent'
                            }`}
                          >
                            {weightTypeFlags[i] === 'crudo' && (
                              <View className="w-1.5 h-1.5 rounded-full bg-white" />
                            )}
                          </View>
                          <Text
                            className={`text-xs ${weightTypeFlags[i] === 'crudo' ? 'text-red-400' : 'text-zinc-500'}`}
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
                            skipGramsFlags[i]
                              ? 'bg-orange-500 border-orange-500'
                              : 'bg-transparent border-zinc-600'
                          }`}
                        >
                          {skipGramsFlags[i] && (
                            <Text className="text-white text-xs font-bold">✓</Text>
                          )}
                        </View>
                        <Text
                          className={`text-xs ${skipGramsFlags[i] ? 'text-orange-400' : 'text-zinc-500'}`}
                        >
                          Sin gramos (usar solo porciones)
                        </Text>
                      </Pressable>
                    </>
                  )}
                </View>
              ))}

              {/* Botón de añadir ingrediente */}
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
