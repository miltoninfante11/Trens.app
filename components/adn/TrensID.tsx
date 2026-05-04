import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  withRepeat,
  withSequence,
  interpolate,
  Easing,
} from 'react-native-reanimated';
import {
  ChevronDown,
  X,
  Edit2,
  Save,
  ShieldAlert,
  Crown,
  Trash2,
  Flame,
} from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from '../../lib/haptics';
import { supabase } from '../../lib/supabase';
import { useSaveGuard } from '../../context/SaveGuardContext';
import { useHankTarget } from '../../hooks/useHankTarget';
import HankInlineHighlight from '../hank/HankInlineHighlight';
import ProgressSlider from './ProgressSlider';
import AddProgressPhotoModal from './AddProgressPhotoModal';
import ProgressPhotoDetailModal from './ProgressPhotoDetailModal';
import type { ProgressPhoto } from '../../types/progress';
// Las sincronizaciones de macros ahora se hacen conversando con Hank

interface Measurement {
  id: string;
  name: string;
  value: string;
  is_dominant: boolean;
}

interface ProfileData {
  goal: string;
  weight: string;
  height: string;
  injuries: string;
  allergies: string;
  // Nuevos campos para ultra personalización de macros
  age?: number;
  sex?: string;
  body_fat_percentage?: number;
  muscle_mass?: number;
  activity_level?: string;
  training_experience?: string;
  metabolic_rate?: string;
  training_days_per_week?: number;
  // Campos calculados (read-only, vienen de GYM y PLAN)
  training_frequency?: number; // Cantidad de días en estructura de entrenamiento
  meal_count?: number; // Cantidad de comidas configuradas en PLAN
  // Modos de entrenamiento
  uses_gym_module?: boolean; // true = usa módulo GYM, false = entrena por su cuenta
  external_training_frequency?: number; // Frecuencia para modo externo
  external_training_schedule?: Record<string, string>; // {"Lunes": "Pecho", "Martes": "Espalda"}
  has_custom_plan?: boolean; // true = tiene plan personalizado
  // Macros diarios cacheados (objetivo/target)
  cached_daily_macros?: {
    totalCalories: number;
    totalProtein: number;
    totalCarbs: number;
    totalFat: number;
    perMeal: {
      calories: number;
      protein: number;
      carbs: number;
      fat: number;
    };
  } | null;
  // Macros reales computados desde ingredientes del plan
  actual_daily_macros?: {
    totalCalories: number;
    totalProtein: number;
    totalCarbs: number;
    totalFat: number;
  } | null;
}

interface TrensIDProps {
  userId: string;
  profileData: ProfileData;
  measurements: Measurement[];
  onUpdate: () => void;
}

export default function TrensID({ userId, profileData, measurements, onUpdate }: TrensIDProps) {
  const { canSave } = useSaveGuard();
  const { targetRef, onLayout, isHighlighted, animationPhase } = useHankTarget({
    id: 'trens-id-biometrics',
    type: 'profile',
    label: 'ID // Biometrics',
  });
  const [isExpanded, setIsExpanded] = useState(false);
  const [editData, setEditData] = useState<ProfileData>(profileData);
  const [editMeasurements, setEditMeasurements] = useState<Measurement[]>(measurements);
  const [showMeasureForm, setShowMeasureForm] = useState(false);
  const [newMeasurement, setNewMeasurement] = useState({ name: '', value: '', is_dominant: false });
  const [isSaving, setIsSaving] = useState(false);
  // Progress Photos
  const [showAddPhotoModal, setShowAddPhotoModal] = useState(false);
  const [showPhotoDetailModal, setShowPhotoDetailModal] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState<ProgressPhoto | null>(null);
  const [progressRefreshTrigger, setProgressRefreshTrigger] = useState(0);

  const expandProgress = useSharedValue(0);
  const idleBorderGlow = useSharedValue(0);

  // Pulsing fire-glow border when collapsed (matches landing PremiumFeatureCard)
  useEffect(() => {
    idleBorderGlow.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 2200, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: 2200, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );
  }, []);

  // GUARD: Solo sincronizar props → state cuando NO se está editando.
  // Sin esta guardia, cada re-render del padre crea un nuevo objeto profileData
  // (referencia diferente) que dispara este effect y sobreescribe ediciones en curso.
  useEffect(() => {
    if (!isExpanded) {
      setEditData(profileData);
      setEditMeasurements(measurements);
    }
  }, [profileData, measurements, isExpanded]);

  useEffect(() => {
    expandProgress.value = withTiming(isExpanded ? 1 : 0, {
      duration: 300,
      easing: Easing.bezier(0.25, 0.1, 0.25, 1),
    });
  }, [isExpanded]);

  const dominantMuscle = editMeasurements.find((m) => m.is_dominant) || { name: 'N/A', value: '-' };

  const handleExpand = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIsExpanded(true);
  };

  const handleCollapse = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIsExpanded(false);
    setShowMeasureForm(false);
  };

  const handleAddMeasurement = async () => {
    if (!newMeasurement.name || !newMeasurement.value) return;

    // Guard: Verificar si puede guardar
    if (!canSave('save_measurement')) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const { data, error } = await supabase
        .from('body_measurements')
        .insert({
          user_id: userId,
          name: newMeasurement.name.toUpperCase(),
          value: newMeasurement.value,
          is_dominant: newMeasurement.is_dominant,
        })
        .select()
        .single();

      if (error) throw error;

      setEditMeasurements((prev) => {
        let updated = [...prev];
        if (newMeasurement.is_dominant) {
          updated = updated.map((m) => ({ ...m, is_dominant: false }));
        }
        return [...updated, data];
      });

      setNewMeasurement({ name: '', value: '', is_dominant: false });
      setShowMeasureForm(false);
      onUpdate(); // Sincronizar padre
    } catch (err) {
      console.error('Error adding measurement:', err);
    }
  };

  const toggleDominant = async (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    try {
      // El trigger en Supabase se encarga de desactivar los otros
      await supabase.from('body_measurements').update({ is_dominant: true }).eq('id', id);

      setEditMeasurements((prev) =>
        prev.map((m) => ({
          ...m,
          is_dominant: m.id === id,
        }))
      );
      onUpdate(); // Sincronizar padre
    } catch (err) {
      console.error('Error toggling dominant:', err);
    }
  };

  const deleteMeasurement = async (id: string) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);

    try {
      await supabase.from('body_measurements').delete().eq('id', id);

      setEditMeasurements((prev) => prev.filter((m) => m.id !== id));
      onUpdate(); // Sincronizar padre
    } catch (err) {
      console.error('Error deleting measurement:', err);
    }
  };

  // Actualizar valor de medida: local al escribir, DB al perder foco
  const updateMeasurementLocal = (id: string, newValue: string) => {
    setEditMeasurements((prev) => prev.map((m) => (m.id === id ? { ...m, value: newValue } : m)));
  };

  const saveMeasurementValue = async (id: string, newValue: string) => {
    try {
      await supabase.from('body_measurements').update({ value: newValue }).eq('id', id);
      onUpdate(); // Sincronizar padre
    } catch (err) {
      console.error('Error saving measurement:', err);
    }
  };

  // Guardar solo los datos del perfil (sin recalcular plan)
  const saveProfileOnly = async () => {
    // Guard: Verificar si puede guardar
    if (!canSave('save_profile')) return;

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setIsSaving(true);

    try {
      const { error } = await supabase
        .from('user_profiles')
        .update({
          goal: editData.goal,
          weight: editData.weight,
          height: editData.height,
          injuries: editData.injuries,
          allergies: editData.allergies,
          age: editData.age || null,
          sex: editData.sex || null,
          body_fat_percentage: editData.body_fat_percentage || null,
          muscle_mass: editData.muscle_mass || null,
          activity_level: editData.activity_level || 'MODERADO',
          training_experience: editData.training_experience || 'INTERMEDIO',
          metabolic_rate: editData.metabolic_rate || 'NORMAL',
          training_days_per_week: editData.training_days_per_week || 4,
          // Invalidar macros cacheados para que se recalculen con los nuevos datos
          cached_daily_macros: null,
          cached_macros_updated_at: null,
        })
        .eq('user_id', userId);

      if (error) throw error;

      onUpdate();
      setIsExpanded(false);
      setShowMeasureForm(false);
    } catch (err) {
      console.error('Error saving profile:', err);
    } finally {
      setIsSaving(false);
    }
  };

  // ⚡ Para sincronizar macros con tu plan, habla con Hank
  // Ejemplo: "Hank, recalcula mis macros con mi nuevo peso"

  const chevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${interpolate(expandProgress.value, [0, 1], [0, 180])}deg` }],
    opacity: interpolate(expandProgress.value, [0, 1], [0.5, 0]),
  }));

  const idleBorderStyle = useAnimatedStyle(() => {
    // When expanded use the static fire-orange border; otherwise pulse subtly
    const opacity = interpolate(idleBorderGlow.value, [0, 1], [0.18, 0.55]);
    return {
      borderColor: isExpanded ? 'rgba(249, 115, 22, 0.5)' : `rgba(220, 38, 38, ${opacity})`,
    };
  });

  return (
    <View className="mb-6" ref={targetRef} onLayout={onLayout}>
      {/* HANK INLINE HIGHLIGHT */}
      <HankInlineHighlight isActive={isHighlighted} phase={animationPhase} borderRadius={8} />

      {/* CARD CONTAINER - ED HARDY STYLE + LANDING-GRADE FIRE GLOW */}
      <Animated.View style={idleBorderStyle} className="rounded-2xl border-2 overflow-hidden">
        <TouchableOpacity
          activeOpacity={isExpanded ? 1 : 0.85}
          onPress={!isExpanded ? handleExpand : undefined}
          className="rounded-2xl overflow-hidden"
          style={{
            backgroundColor: isExpanded ? '#0a0505' : 'rgba(15, 8, 8, 0.92)',
            shadowColor: isExpanded ? '#F97316' : '#DC2626',
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: isExpanded ? 0.35 : 0.18,
            shadowRadius: isExpanded ? 18 : 14,
            elevation: isExpanded ? 12 : 6,
          }}
        >
          {/* Inner diagonal fire shimmer (matches landing PremiumFeatureCard) */}
          <LinearGradient
            colors={['rgba(220, 38, 38, 0.10)', 'transparent', 'transparent']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
            pointerEvents="none"
          />

          {/* HEADER - FIRE ACCENT */}
          <View
            className="flex-row justify-between items-center px-4 py-3 border-b"
            style={{
              borderBottomColor: isExpanded ? '#F97316' : '#27272a',
              borderBottomWidth: isExpanded ? 2 : 1,
            }}
          >
            <View className="flex-row items-center gap-2">
              <View
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: isExpanded ? '#F97316' : '#52525b' }}
              />
              <Text className="text-zinc-500 text-[10px] uppercase tracking-widest font-bold">
                ID // Biometrics{' '}
                {isExpanded && <Text style={{ color: '#F97316' }}>[EDIT MODE]</Text>}
              </Text>
            </View>
            {isExpanded ? (
              <TouchableOpacity
                onPress={handleCollapse}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <X size={14} color="#F97316" />
              </TouchableOpacity>
            ) : (
              <Edit2 size={12} color="#52525b" />
            )}
          </View>

          {/* CONTENIDO */}
          <View className="p-4">
            {!isExpanded ? (
              // --- VISTA RESUMEN (PASSIVE) ---
              <View>
                <View className="flex-row flex-wrap">
                  {/* Objetivo */}
                  <View className="w-1/2 mb-4">
                    <Text className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider mb-1">
                      Objetivo
                    </Text>
                    <Text className="text-white font-bold text-sm uppercase" numberOfLines={2}>
                      {editData.goal}
                    </Text>
                  </View>

                  {/* Peso Actual */}
                  <View className="w-1/2 mb-4 items-end">
                    <Text className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider mb-1">
                      Peso Actual
                    </Text>
                    <Text className="text-white font-mono font-bold text-lg">
                      {editData.weight}
                    </Text>
                  </View>

                  {/* Lesiones */}
                  <View className="w-1/2">
                    <Text className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider mb-1">
                      Lesiones
                    </Text>
                    <View className="flex-row items-center gap-1">
                      <ShieldAlert size={10} color="#ef4444" />
                      <Text className="text-red-500 font-bold text-xs uppercase">
                        {editData.injuries || 'NINGUNA'}
                      </Text>
                    </View>
                  </View>

                  {/* Músculo Dominante */}
                  <View className="w-1/2 items-end">
                    <View className="flex-row items-center gap-1 mb-1">
                      <Crown size={10} color="#eab308" />
                      <Text className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">
                        Dominante
                      </Text>
                    </View>
                    <Text className="text-white font-bold text-sm uppercase">
                      {dominantMuscle.name} {dominantMuscle.value}
                    </Text>
                  </View>
                </View>

                {/* Macros Diarios - Reales si disponibles, target como fallback */}
                {(editData.actual_daily_macros || editData.cached_daily_macros) &&
                  (() => {
                    const macros = editData.actual_daily_macros || editData.cached_daily_macros!;
                    const isActual = !!editData.actual_daily_macros;
                    return (
                      <View className="mt-4 pt-4 border-t border-zinc-800/50">
                        <View className="flex-row items-center gap-1 mb-2">
                          <Flame size={10} color="#F97316" />
                          <Text className="text-[10px] text-fire-orange font-bold uppercase tracking-wider">
                            {isActual
                              ? 'Macros Reales'
                              : (editData.meal_count || 0) > 0
                                ? 'Macros Diarios'
                                : 'Macros Objetivo'}
                          </Text>
                          {(editData.meal_count || 0) > 0 && (
                            <Text className="text-zinc-600 text-[10px] font-mono ml-auto">
                              {editData.meal_count} comidas
                            </Text>
                          )}
                        </View>
                        <View className="flex-row justify-between">
                          {/* Calorías */}
                          <View className="items-center">
                            <Text className="text-white font-mono font-bold text-lg">
                              {macros.totalCalories}
                            </Text>
                            <Text className="text-zinc-500 text-[9px] uppercase">kcal</Text>
                          </View>
                          {/* Proteína */}
                          <View className="items-center">
                            <Text className="text-savage-red font-mono font-bold text-lg">
                              {macros.totalProtein}g
                            </Text>
                            <Text className="text-zinc-500 text-[9px] uppercase">Proteína</Text>
                          </View>
                          {/* Carbos */}
                          <View className="items-center">
                            <Text className="text-yellow-500 font-mono font-bold text-lg">
                              {macros.totalCarbs}g
                            </Text>
                            <Text className="text-zinc-500 text-[9px] uppercase">Carbos</Text>
                          </View>
                          {/* Grasas */}
                          <View className="items-center">
                            <Text className="text-blue-400 font-mono font-bold text-lg">
                              {macros.totalFat}g
                            </Text>
                            <Text className="text-zinc-500 text-[9px] uppercase">Grasas</Text>
                          </View>
                        </View>
                        {/* Hint para usuarios sin comidas */}
                        {(editData.meal_count || 0) === 0 && (
                          <Text className="text-zinc-600 text-[9px] text-center mt-2 italic">
                            Ve a PLAN para configurar tus comidas
                          </Text>
                        )}
                      </View>
                    );
                  })()}

                {/* Hint para expandir */}
                <Animated.View style={chevronStyle} className="items-center mt-3">
                  <ChevronDown size={12} color="#52525b" />
                </Animated.View>
              </View>
            ) : (
              // --- VISTA EDICIÓN (ACTIVE) ---
              <ScrollView showsVerticalScrollIndicator={false}>
                {/* CAMPOS PRINCIPALES */}
                <View className="flex-row flex-wrap -mx-1">
                  <View className="w-full px-1 mb-3">
                    <Text className="text-[9px] text-zinc-500 uppercase font-bold tracking-wider mb-1">
                      Objetivo
                    </Text>
                    <TextInput
                      value={editData.goal}
                      onChangeText={(text) => setEditData({ ...editData, goal: text })}
                      className="bg-black border border-zinc-800 p-3 text-white text-xs font-bold"
                      placeholderTextColor="#52525b"
                      placeholder="Ej: GANAR MÚSCULO, CORRER UN MARATÓN..."
                      multiline
                      numberOfLines={2}
                      style={{ minHeight: 48, textAlignVertical: 'top' }}
                    />
                  </View>
                  <View className="w-1/2 px-1 mb-3">
                    <Text className="text-[9px] text-zinc-500 uppercase font-bold tracking-wider mb-1">
                      Peso (kg)
                    </Text>
                    <TextInput
                      value={editData.weight}
                      onChangeText={(text) => setEditData({ ...editData, weight: text })}
                      className="bg-black border border-zinc-800 p-3 text-white text-xs font-bold"
                      placeholderTextColor="#52525b"
                      keyboardType="numeric"
                    />
                  </View>
                  <View className="w-1/2 px-1 mb-3">
                    <Text className="text-[9px] text-zinc-500 uppercase font-bold tracking-wider mb-1">
                      Estatura (cm)
                    </Text>
                    <TextInput
                      value={editData.height}
                      onChangeText={(text) => setEditData({ ...editData, height: text })}
                      className="bg-black border border-zinc-800 p-3 text-white text-xs font-bold"
                      placeholderTextColor="#52525b"
                      placeholder="175"
                      keyboardType="numeric"
                    />
                  </View>
                  <View className="w-1/2 px-1 mb-3">
                    <Text className="text-[9px] text-red-900 uppercase font-bold tracking-wider mb-1">
                      Lesiones
                    </Text>
                    <TextInput
                      value={editData.injuries}
                      onChangeText={(text) => setEditData({ ...editData, injuries: text })}
                      className="bg-black border border-red-900/30 p-3 text-red-400 text-xs font-bold"
                      placeholderTextColor="#7f1d1d"
                    />
                  </View>
                  <View className="w-1/2 px-1 mb-3">
                    <Text className="text-[9px] text-yellow-700 uppercase font-bold tracking-wider mb-1">
                      Alergias
                    </Text>
                    <TextInput
                      value={editData.allergies}
                      onChangeText={(text) => setEditData({ ...editData, allergies: text })}
                      className="bg-black border border-yellow-900/30 p-3 text-yellow-200 text-xs font-bold"
                      placeholderTextColor="#713f12"
                    />
                  </View>
                </View>

                {/* SECCIÓN BIOMETRÍA AVANZADA */}
                <View className="pt-4 mt-2 border-t border-zinc-800">
                  <Text className="text-savage-red text-[10px] font-bold uppercase tracking-widest mb-3">
                    🧬 Biometría Avanzada
                  </Text>
                  <View className="flex-row flex-wrap -mx-1">
                    {/* Edad */}
                    <View className="w-1/3 px-1 mb-3">
                      <Text className="text-[9px] text-zinc-500 uppercase font-bold tracking-wider mb-1">
                        Edad
                      </Text>
                      <TextInput
                        value={editData.age?.toString() || ''}
                        onChangeText={(text) =>
                          setEditData({ ...editData, age: parseInt(text) || undefined })
                        }
                        keyboardType="numeric"
                        placeholder="30"
                        className="bg-black border border-zinc-800 p-3 text-white text-xs font-bold"
                        placeholderTextColor="#52525b"
                      />
                    </View>
                    {/* Sexo */}
                    <View className="w-1/3 px-1 mb-3">
                      <Text className="text-[9px] text-zinc-500 uppercase font-bold tracking-wider mb-1">
                        Sexo
                      </Text>
                      <View className="flex-row gap-1">
                        <TouchableOpacity
                          onPress={() => setEditData({ ...editData, sex: 'M' })}
                          className={`flex-1 p-3 border ${editData.sex === 'M' ? 'bg-savage-red border-savage-red' : 'bg-black border-zinc-800'}`}
                        >
                          <Text
                            className={`text-center text-xs font-bold ${editData.sex === 'M' ? 'text-white' : 'text-zinc-500'}`}
                          >
                            M
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => setEditData({ ...editData, sex: 'F' })}
                          className={`flex-1 p-3 border ${editData.sex === 'F' ? 'bg-savage-red border-savage-red' : 'bg-black border-zinc-800'}`}
                        >
                          <Text
                            className={`text-center text-xs font-bold ${editData.sex === 'F' ? 'text-white' : 'text-zinc-500'}`}
                          >
                            F
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                    {/* % Grasa */}
                    <View className="w-1/3 px-1 mb-3">
                      <Text className="text-[9px] text-zinc-500 uppercase font-bold tracking-wider mb-1">
                        % Grasa
                      </Text>
                      <TextInput
                        value={editData.body_fat_percentage?.toString() || ''}
                        onChangeText={(text) =>
                          setEditData({
                            ...editData,
                            body_fat_percentage: parseFloat(text) || undefined,
                          })
                        }
                        keyboardType="numeric"
                        placeholder="15"
                        className="bg-black border border-zinc-800 p-3 text-white text-xs font-bold"
                        placeholderTextColor="#52525b"
                      />
                    </View>
                    {/* IMC - Calculado automáticamente */}
                    <View className="w-1/3 px-1 mb-3">
                      <Text className="text-[9px] text-zinc-500 uppercase font-bold tracking-wider mb-1">
                        IMC
                      </Text>
                      {(() => {
                        const w = parseFloat(editData.weight);
                        const hCm = parseFloat(editData.height);
                        if (w > 0 && hCm > 0) {
                          const hM = hCm > 3 ? hCm / 100 : hCm;
                          const imc = (w / (hM * hM)).toFixed(1);
                          return (
                            <View className="bg-zinc-900 border border-zinc-700 p-3 rounded">
                              <Text className="text-white text-xs font-mono font-bold text-center">
                                {imc}
                              </Text>
                            </View>
                          );
                        }
                        return (
                          <View className="bg-zinc-900 border border-zinc-700 p-3 rounded">
                            <Text className="text-zinc-600 text-xs font-mono font-bold text-center">
                              -
                            </Text>
                          </View>
                        );
                      })()}
                      <Text className="text-[7px] text-zinc-600 text-center mt-1">Auto</Text>
                    </View>
                    {/* Masa Muscular */}
                    <View className="w-1/2 px-1 mb-3">
                      <Text className="text-[9px] text-zinc-500 uppercase font-bold tracking-wider mb-1">
                        Masa Muscular (kg)
                      </Text>
                      <TextInput
                        value={editData.muscle_mass?.toString() || ''}
                        onChangeText={(text) =>
                          setEditData({ ...editData, muscle_mass: parseFloat(text) || undefined })
                        }
                        keyboardType="numeric"
                        placeholder="65"
                        className="bg-black border border-zinc-800 p-3 text-white text-xs font-bold"
                        placeholderTextColor="#52525b"
                      />
                    </View>
                    {/* Días de Entreno - CALCULADO (no editable) */}
                    <View className="w-1/4 px-1 mb-3">
                      <Text className="text-[9px] text-fire-orange uppercase font-bold tracking-wider mb-1">
                        🏋️ Días
                      </Text>
                      <View className="bg-zinc-900 border border-zinc-700 p-3 rounded">
                        <Text className="text-fire-orange text-lg font-mono font-bold text-center">
                          {editData.training_frequency || profileData.training_frequency || '-'}
                        </Text>
                      </View>
                      <Text className="text-[7px] text-zinc-600 text-center mt-1">Desde GYM</Text>
                    </View>
                    {/* Comidas/Día - CALCULADO (no editable) */}
                    <View className="w-1/4 px-1 mb-3">
                      <Text className="text-[9px] text-green-500 uppercase font-bold tracking-wider mb-1">
                        🍽️ Comidas
                      </Text>
                      <View className="bg-zinc-900 border border-zinc-700 p-3 rounded">
                        <Text className="text-green-500 text-lg font-mono font-bold text-center">
                          {editData.meal_count || profileData.meal_count || '-'}
                        </Text>
                      </View>
                      <Text className="text-[7px] text-zinc-600 text-center mt-1">Desde PLAN</Text>
                    </View>
                  </View>

                  {/* Nivel de Actividad */}
                  <View className="mb-3">
                    <Text className="text-[9px] text-zinc-500 uppercase font-bold tracking-wider mb-2">
                      Nivel de Actividad
                    </Text>
                    <View className="flex-row flex-wrap gap-1">
                      {['SEDENTARIO', 'LIGERO', 'MODERADO', 'ACTIVO', 'MUY ACTIVO'].map((level) => (
                        <TouchableOpacity
                          key={level}
                          onPress={() => setEditData({ ...editData, activity_level: level })}
                          className={`px-3 py-2 border ${editData.activity_level === level ? 'bg-savage-red border-savage-red' : 'bg-black border-zinc-800'}`}
                        >
                          <Text
                            className={`text-[9px] font-bold ${editData.activity_level === level ? 'text-white' : 'text-zinc-500'}`}
                          >
                            {level}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>

                  {/* Experiencia */}
                  <View className="mb-3">
                    <Text className="text-[9px] text-zinc-500 uppercase font-bold tracking-wider mb-2">
                      Experiencia
                    </Text>
                    <View className="flex-row gap-1">
                      {['PRINCIPIANTE', 'INTERMEDIO', 'AVANZADO', 'ELITE'].map((exp) => (
                        <TouchableOpacity
                          key={exp}
                          onPress={() => setEditData({ ...editData, training_experience: exp })}
                          className={`flex-1 py-2 border ${editData.training_experience === exp ? 'bg-savage-red border-savage-red' : 'bg-black border-zinc-800'}`}
                        >
                          <Text
                            className={`text-center text-[8px] font-bold ${editData.training_experience === exp ? 'text-white' : 'text-zinc-500'}`}
                          >
                            {exp}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>

                  {/* Metabolismo */}
                  <View className="mb-3">
                    <Text className="text-[9px] text-zinc-500 uppercase font-bold tracking-wider mb-2">
                      Metabolismo
                    </Text>
                    <View className="flex-row gap-1">
                      {['LENTO', 'NORMAL', 'RAPIDO'].map((meta) => (
                        <TouchableOpacity
                          key={meta}
                          onPress={() => setEditData({ ...editData, metabolic_rate: meta })}
                          className={`flex-1 py-2 border ${editData.metabolic_rate === meta ? 'bg-savage-red border-savage-red' : 'bg-black border-zinc-800'}`}
                        >
                          <Text
                            className={`text-center text-[9px] font-bold ${editData.metabolic_rate === meta ? 'text-white' : 'text-zinc-500'}`}
                          >
                            {meta}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                </View>

                {/* SECCIÓN MEDIDAS */}
                <View className="pt-4 mt-2 border-t border-zinc-800">
                  <View className="flex-row justify-between items-center mb-3">
                    <Text className="text-zinc-400 text-[10px] font-bold uppercase tracking-widest">
                      Medidas Corporales
                    </Text>
                    <TouchableOpacity
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setShowMeasureForm(!showMeasureForm);
                      }}
                      className="bg-zinc-800 px-3 py-1 rounded"
                    >
                      <Text className="text-[9px] text-white uppercase font-bold">
                        {showMeasureForm ? 'Cancelar' : '+ Agregar'}
                      </Text>
                    </TouchableOpacity>
                  </View>

                  {/* Formulario Agregar Medida */}
                  {showMeasureForm && (
                    <View className="bg-[#151515] p-3 rounded mb-3 border border-zinc-700">
                      <View className="flex-row gap-2 mb-3">
                        <TextInput
                          placeholder="Zona (ej: Pecho)"
                          value={newMeasurement.name}
                          onChangeText={(text) =>
                            setNewMeasurement({ ...newMeasurement, name: text })
                          }
                          className="bg-black text-white text-xs p-3 flex-1 border border-zinc-700"
                          placeholderTextColor="#52525b"
                        />
                        <TextInput
                          placeholder="Valor"
                          value={newMeasurement.value}
                          onChangeText={(text) =>
                            setNewMeasurement({ ...newMeasurement, value: text })
                          }
                          className="bg-black text-white text-xs p-3 w-20 border border-zinc-700"
                          placeholderTextColor="#52525b"
                        />
                      </View>

                      <TouchableOpacity
                        onPress={() =>
                          setNewMeasurement({
                            ...newMeasurement,
                            is_dominant: !newMeasurement.is_dominant,
                          })
                        }
                        className="flex-row items-center gap-2 mb-3"
                      >
                        <View
                          className={`w-5 h-5 border items-center justify-center ${
                            newMeasurement.is_dominant
                              ? 'bg-yellow-500 border-yellow-500'
                              : 'border-zinc-600 bg-transparent'
                          }`}
                        >
                          {newMeasurement.is_dominant && <Crown size={10} color="#000" />}
                        </View>
                        <Text
                          className={`text-[10px] uppercase font-bold ${
                            newMeasurement.is_dominant ? 'text-yellow-500' : 'text-zinc-500'
                          }`}
                        >
                          Músculo Dominante 👑
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        onPress={handleAddMeasurement}
                        className="bg-white py-3 items-center"
                      >
                        <Text className="text-black text-[10px] font-black uppercase tracking-widest">
                          Confirmar Medida
                        </Text>
                      </TouchableOpacity>
                    </View>
                  )}

                  {/* Lista de Medidas - EDITABLES */}
                  <View className="gap-1">
                    {editMeasurements.map((m) => (
                      <View
                        key={m.id}
                        className={`flex-row items-center justify-between p-3 rounded bg-[#080808] border ${
                          m.is_dominant
                            ? 'border-yellow-600/40 bg-yellow-900/5'
                            : 'border-zinc-800/50'
                        }`}
                      >
                        <View className="flex-row items-center gap-3 flex-1">
                          <TouchableOpacity onPress={() => toggleDominant(m.id)}>
                            <Crown
                              size={14}
                              color={m.is_dominant ? '#eab308' : '#3f3f46'}
                              fill={m.is_dominant ? '#eab308' : 'none'}
                            />
                          </TouchableOpacity>
                          <Text
                            className={`text-xs font-bold uppercase w-24 ${
                              m.is_dominant ? 'text-white' : 'text-zinc-400'
                            }`}
                          >
                            {m.name}
                          </Text>
                          <TextInput
                            value={m.value}
                            onChangeText={(text) => updateMeasurementLocal(m.id, text)}
                            onBlur={() => saveMeasurementValue(m.id, m.value)}
                            className="bg-black border border-zinc-800 px-3 py-1.5 text-white text-xs font-mono flex-1"
                            placeholderTextColor="#52525b"
                            placeholder="ej: 105 cm"
                          />
                        </View>
                        <TouchableOpacity onPress={() => deleteMeasurement(m.id)} className="ml-2">
                          <Trash2 size={12} color="#3f3f46" />
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                </View>

                {/* BOTONES DE GUARDADO */}
                <View className="mt-6 gap-3">
                  {/* Botón: Guardar Ficha */}
                  <TouchableOpacity
                    onPress={saveProfileOnly}
                    disabled={isSaving}
                    className="py-4 flex-row items-center justify-center gap-2 bg-white"
                  >
                    <Save size={14} color="#000" />
                    <Text className="text-black font-black uppercase tracking-widest text-xs">
                      {isSaving ? 'Guardando...' : 'Guardar Ficha'}
                    </Text>
                  </TouchableOpacity>

                  {/* Nota explicativa - Hank */}
                  <View className="bg-zinc-900/50 p-3 rounded border border-zinc-800">
                    <Text className="text-[10px] text-zinc-400 text-center">
                      💡 Para sincronizar macros con tu plan, habla con Hank:
                    </Text>
                    <Text className="text-[10px] text-savage-red text-center font-mono mt-1">
                      "Recalcula mis macros con mi nuevo peso"
                    </Text>
                  </View>
                </View>
              </ScrollView>
            )}
          </View>
        </TouchableOpacity>
      </Animated.View>

      {/* Texto de privacidad */}
      {!isExpanded && (
        <View className="items-center mt-2">
          <Text className="text-[9px] text-zinc-700 uppercase tracking-widest">
            Privado • Solo tú ves esto
          </Text>
        </View>
      )}

      {/* Progress Photos Slider - Solo visible cuando no está expandido */}
      {!isExpanded && (
        <View className="mt-4 -mx-4">
          <ProgressSlider
            userId={userId}
            onAddPhoto={() => setShowAddPhotoModal(true)}
            onViewPhoto={(photo) => {
              setSelectedPhoto(photo);
              setShowPhotoDetailModal(true);
            }}
            refreshTrigger={progressRefreshTrigger}
          />
        </View>
      )}

      {/* Modal: Agregar Foto de Progreso */}
      <AddProgressPhotoModal
        visible={showAddPhotoModal}
        userId={userId}
        onClose={() => setShowAddPhotoModal(false)}
        onSuccess={() => {
          setShowAddPhotoModal(false);
          setProgressRefreshTrigger((prev) => prev + 1);
        }}
      />

      {/* Modal: Detalle de Foto */}
      <ProgressPhotoDetailModal
        visible={showPhotoDetailModal}
        photo={selectedPhoto}
        userId={userId}
        onClose={() => {
          setShowPhotoDetailModal(false);
          setSelectedPhoto(null);
        }}
        onDeleted={() => {
          setShowPhotoDetailModal(false);
          setSelectedPhoto(null);
          setProgressRefreshTrigger((prev) => prev + 1);
        }}
      />
    </View>
  );
}
