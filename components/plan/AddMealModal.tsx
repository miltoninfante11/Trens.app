// ============================================================================
// ADD MEAL MODAL - Modal para agregar comidas
// Análisis inteligente automático (siempre activo)
// TimePicker visual como Stack
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
  Clock,
  Scale,
} from 'lucide-react-native';
import {
  analyzeIngredientsSmart,
  IngredientAnalysis,
} from '../../services/hank/ingredientAnalyzer';

// ============================================================================
// TYPES
// ============================================================================
interface Ingredient {
  name: string;
  quantity: string;
  portion: string;
}

interface TargetMacros {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

interface AddMealModalProps {
  visible: boolean;
  targetMacros?: TargetMacros;
  onClose: () => void;
  onSave: (ingredients: Ingredient[], time: string) => void;
}

// ============================================================================
// COMPONENT
// ============================================================================
export const AddMealModal: React.FC<AddMealModalProps> = ({
  visible,
  targetMacros,
  onClose,
  onSave,
}) => {
  const insets = useSafeAreaInsets();

  // Default to current hour rounded to next quarter
  const now = new Date();
  const currentH = now.getHours();
  const currentM = now.getMinutes();
  const roundedMinute = Math.ceil(currentM / 15) * 15;
  const defaultMinute = roundedMinute >= 60 ? 0 : roundedMinute;
  const defaultH24 = roundedMinute >= 60 ? (currentH + 1) % 24 : currentH;
  const defaultHour12 = defaultH24 === 0 ? 12 : defaultH24 > 12 ? defaultH24 - 12 : defaultH24;
  const defaultPeriod: 'AM' | 'PM' = defaultH24 >= 12 ? 'PM' : 'AM';

  const [selectedHour, setSelectedHour] = useState(defaultHour12);
  const [selectedMinute, setSelectedMinute] = useState(defaultMinute);
  const [selectedPeriod, setSelectedPeriod] = useState<'AM' | 'PM'>(defaultPeriod);
  const [ingredients, setIngredients] = useState<{ name: string; weightGrams: string }[]>([
    { name: '', weightGrams: '' },
  ]);
  const [analysis, setAnalysis] = useState<IngredientAnalysis | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Animated value para el desplazamiento del panel
  const translateY = useSharedValue(0);

  const hours = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  const minutes = [0, 15, 30, 45];

  // -------------------------------------------------------------------------
  // VIBRACIÓN AL ABRIR
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (visible) {
      translateY.value = 0;
      // Vibración cuando el modal termina de abrir
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

  // Reset cuando se abre — usar hora actual
  useEffect(() => {
    if (visible) {
      const n = new Date();
      const h24 = n.getHours();
      const m = n.getMinutes();
      const rm = Math.ceil(m / 15) * 15;
      const adjM = rm >= 60 ? 0 : rm;
      const adjH = rm >= 60 ? (h24 + 1) % 24 : h24;
      setSelectedHour(adjH === 0 ? 12 : adjH > 12 ? adjH - 12 : adjH);
      setSelectedMinute(adjM);
      setSelectedPeriod(adjH >= 12 ? 'PM' : 'AM');
      setIngredients([{ name: '', weightGrams: '' }]);
      setAnalysis(null);
    }
  }, [visible]);

  // Analizar ingredientes automáticamente (siempre activo)
  useEffect(() => {
    const validIngredients = ingredients
      .filter((ing) => ing.name.trim().length >= 3)
      .map((ing) => ({
        name: ing.name,
        quantity: ing.weightGrams ? `${ing.weightGrams}g` : '',
        portion: '',
      }));
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
    setIngredients([...ingredients, { name: '', weightGrams: '' }]);
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
      // Solo permitir números y punto decimal
      const numericValue = value.replace(/[^0-9.]/g, '');
      newIngs[index] = { ...newIngs[index], [field]: numericValue };
    } else {
      newIngs[index] = { ...newIngs[index], [field]: value };
    }
    setIngredients(newIngs);
  };

  const getTime24h = (): string => {
    let h = selectedHour;
    if (selectedPeriod === 'AM') {
      if (h === 12) h = 0;
    } else {
      if (h !== 12) h += 12;
    }
    return `${h.toString().padStart(2, '0')}:${selectedMinute.toString().padStart(2, '0')}`;
  };

  const selectHour = (h: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedHour(h);
  };

  const selectMinute = (m: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedMinute(m);
  };

  const togglePeriod = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSelectedPeriod(selectedPeriod === 'AM' ? 'PM' : 'AM');
  };

  const handleSave = async () => {
    const validIngredients = ingredients.filter((ing) => ing.name.trim());
    if (validIngredients.length === 0) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    setIsSaving(true);

    try {
      // Mapear al formato esperado por el sistema: name, quantity, portion
      // name = texto combinado (nombre + porción), quantity = peso en gr, portion = vacío
      const finalIngredients: Ingredient[] = validIngredients.map((ing) => ({
        name: ing.name.trim(),
        quantity: ing.weightGrams ? `${ing.weightGrams}g` : '',
        portion: '',
      }));

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onSave(finalIngredients, getTime24h());
      setIngredients([{ name: '', weightGrams: '' }]);
      setSelectedHour(12);
      setSelectedMinute(0);
      setSelectedPeriod('PM');
      onClose();
    } catch (error) {
      console.error('Error saving:', error);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsSaving(false);
    }
  };

  // Formatear display
  const displayTime = `${selectedHour}:${selectedMinute.toString().padStart(2, '0')} ${selectedPeriod}`;

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
              className="flex-row justify-between items-center p-4 border-b border-zinc-800/50"
            >
              {/* Indicador de drag */}
              <View className="absolute top-3 left-0 right-0 items-center">
                <View className="w-12 h-1.5 bg-zinc-700 rounded-full" />
              </View>

              <View className="flex-1 mt-2">
                <View className="flex-row items-center gap-2">
                  <Sparkles size={16} color="#A855F7" />
                  <Text className="text-white font-bold text-lg">Agregar Comida</Text>
                </View>
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

              {/* Time Picker Visual */}
              <View className="mb-4">
                <View className="flex-row items-center gap-2 mb-3">
                  <Clock size={14} color="#3B82F6" />
                  <Text className="text-zinc-400 text-xs font-bold uppercase">Hora</Text>
                  <Text className="text-blue-400 font-mono font-bold text-sm ml-auto">
                    {displayTime}
                  </Text>
                </View>

                {/* Hour Selector */}
                <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-3">
                  <View className="flex-row gap-2">
                    {hours.map((h) => (
                      <Pressable
                        key={h}
                        onPress={() => selectHour(h)}
                        className={`w-11 h-11 rounded-xl items-center justify-center ${
                          selectedHour === h ? 'bg-blue-500' : 'bg-zinc-800 active:bg-zinc-700'
                        }`}
                      >
                        <Text
                          className={`font-bold text-lg ${
                            selectedHour === h ? 'text-white' : 'text-zinc-400'
                          }`}
                        >
                          {h}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </ScrollView>

                {/* Minute + Period Row */}
                <View className="flex-row gap-2">
                  {/* Minutes */}
                  <View className="flex-1 flex-row gap-2">
                    {minutes.map((m) => (
                      <Pressable
                        key={m}
                        onPress={() => selectMinute(m)}
                        className={`flex-1 h-10 rounded-lg items-center justify-center ${
                          selectedMinute === m ? 'bg-blue-500' : 'bg-zinc-800 active:bg-zinc-700'
                        }`}
                      >
                        <Text
                          className={`font-mono text-sm ${
                            selectedMinute === m ? 'text-white font-bold' : 'text-zinc-400'
                          }`}
                        >
                          :{m.toString().padStart(2, '0')}
                        </Text>
                      </Pressable>
                    ))}
                  </View>

                  {/* AM/PM Toggle */}
                  <Pressable
                    onPress={togglePeriod}
                    className={`w-16 h-10 rounded-lg items-center justify-center ${
                      selectedPeriod === 'AM'
                        ? 'bg-yellow-500/20 border border-yellow-500'
                        : 'bg-purple-500/20 border border-purple-500'
                    }`}
                  >
                    <Text
                      className={`font-bold ${
                        selectedPeriod === 'AM' ? 'text-yellow-500' : 'text-purple-500'
                      }`}
                    >
                      {selectedPeriod}
                    </Text>
                  </Pressable>
                </View>
              </View>

              {/* Ingredients */}
              <Text className="text-zinc-400 text-xs font-bold mb-2 uppercase">Ingredientes</Text>

              {/* Info: nuevo formato simplificado */}
              <View className="bg-purple-500/10 border border-purple-500/20 rounded-xl p-3 mb-3">
                <Text className="text-purple-300 text-xs">
                  ✏️ Escribe el ingrediente con su porción. El peso en gramos es opcional.
                </Text>
              </View>

              {ingredients.map((ing, i) => (
                <View key={i} className="bg-zinc-900/80 p-4 rounded-xl border border-zinc-800 mb-3">
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
                  />

                  {/* Campo opcional: Peso en gramos (solo numérico) */}
                  <View className="flex-row items-center gap-2">
                    <Scale size={14} color="#3B82F6" />
                    <TextInput
                      value={ing.weightGrams}
                      onChangeText={(v) => updateIngredient(i, 'weightGrams', v)}
                      placeholder="Peso en gr (opcional)"
                      placeholderTextColor="#555"
                      keyboardType="numeric"
                      className="flex-1 bg-zinc-800/60 border border-blue-500/30 rounded-lg text-white text-sm px-3 py-2 font-mono"
                    />
                    {ing.weightGrams ? (
                      <Text className="text-blue-400 text-xs font-mono font-bold">
                        {ing.weightGrams}gr
                      </Text>
                    ) : null}
                  </View>
                </View>
              ))}

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
                    <Text className="text-white font-bold text-center text-base">Guardando...</Text>
                  </View>
                ) : (
                  <Text className="text-white font-bold text-center text-lg">GUARDAR COMIDA</Text>
                )}
              </Pressable>
            </ScrollView>
          </Animated.View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

export default AddMealModal;
