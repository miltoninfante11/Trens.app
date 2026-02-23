import React from 'react';
import { View, Text, TouchableOpacity, Modal, Image, ScrollView, Dimensions } from 'react-native';
import { Alert } from '../../lib/alert';
import {
  X,
  Trash2,
  Scale,
  Ruler,
  Target,
  Dumbbell,
  Utensils,
  Pill,
  Calendar,
  TrendingUp,
  Activity,
  ShieldAlert,
  AlertTriangle,
  Zap,
  Award,
} from 'lucide-react-native';
import * as Haptics from '../../lib/haptics';
import type { ProgressPhoto } from '../../types/progress';
import { deleteProgressPhoto } from '../../services/progress/photos';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface ProgressPhotoDetailModalProps {
  visible: boolean;
  photo: ProgressPhoto | null;
  userId: string;
  onClose: () => void;
  onDeleted: () => void;
}

export default function ProgressPhotoDetailModal({
  visible,
  photo,
  userId,
  onClose,
  onDeleted,
}: ProgressPhotoDetailModalProps) {
  if (!photo) return null;

  const { snapshot } = photo;

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('es-ES', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const handleDelete = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    Alert.alert('Eliminar Foto', '¿Estás seguro de que quieres eliminar esta foto de progreso?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: async () => {
          const result = await deleteProgressPhoto(userId, photo.id);
          if (result.success) {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            onDeleted();
          } else {
            Alert.alert('Error', result.error || 'No se pudo eliminar');
          }
        },
      },
    ]);
  };

  const goalLabels: Record<string, string> = {
    volumen: '💪 Volumen',
    definicion: '🔥 Definición',
    recomp: '⚡ Recomposición',
    mantenimiento: '🎯 Mantenimiento',
    fuerza: '🏋️ Fuerza',
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View className="flex-1 bg-black">
        {/* Header con botones */}
        <View className="absolute top-0 left-0 right-0 z-10 flex-row items-center justify-between p-4 pt-12 bg-gradient-to-b from-black to-transparent">
          <TouchableOpacity
            onPress={onClose}
            className="w-10 h-10 rounded-full bg-black/50 items-center justify-center"
          >
            <X size={20} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleDelete}
            className="w-10 h-10 rounded-full bg-red-900/50 items-center justify-center"
          >
            <Trash2 size={18} color="#DC2626" />
          </TouchableOpacity>
        </View>

        <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
          {/* Imagen */}
          <Image
            source={{ uri: photo.photo_url }}
            style={{ width: SCREEN_WIDTH, height: SCREEN_HEIGHT * 0.55 }}
            resizeMode="cover"
          />

          {/* Datos del Snapshot */}
          <View className="p-4 bg-[#0a0a0a]">
            {/* Fecha */}
            <View className="flex-row items-center gap-2 mb-4">
              <Calendar size={14} color="#DC2626" />
              <Text className="text-zinc-400 text-xs capitalize">
                {formatDate(photo.created_at)}
              </Text>
            </View>

            {/* Notas del usuario */}
            {photo.notes && (
              <View className="bg-zinc-900 p-3 rounded-lg border border-zinc-800 mb-4">
                <Text className="text-white text-sm italic">"{photo.notes}"</Text>
              </View>
            )}

            {/* Sección: Datos Biométricos */}
            <View className="mb-4">
              <Text className="text-white font-bold text-xs uppercase tracking-widest mb-3">
                📊 Datos Biométricos
              </Text>
              <View className="flex-row flex-wrap gap-2">
                {snapshot?.weight && (
                  <View className="bg-zinc-900 px-3 py-2 rounded-lg border border-zinc-800 flex-row items-center gap-2">
                    <Scale size={12} color="#DC2626" />
                    <Text className="text-white font-mono text-xs">{snapshot.weight} kg</Text>
                  </View>
                )}
                {snapshot?.height && (
                  <View className="bg-zinc-900 px-3 py-2 rounded-lg border border-zinc-800 flex-row items-center gap-2">
                    <Ruler size={12} color="#DC2626" />
                    <Text className="text-white font-mono text-xs">{snapshot.height} cm</Text>
                  </View>
                )}
                {snapshot?.imc && (
                  <View className="bg-zinc-900 px-3 py-2 rounded-lg border border-zinc-800 flex-row items-center gap-2">
                    <Activity size={12} color="#F97316" />
                    <Text className="text-white font-mono text-xs">IMC {snapshot.imc}</Text>
                  </View>
                )}
                {snapshot?.body_fat_percentage && (
                  <View className="bg-zinc-900 px-3 py-2 rounded-lg border border-zinc-800 flex-row items-center gap-2">
                    <TrendingUp size={12} color="#DC2626" />
                    <Text className="text-white font-mono text-xs">
                      {snapshot.body_fat_percentage}% grasa
                    </Text>
                  </View>
                )}
                {snapshot?.muscle_mass && (
                  <View className="bg-zinc-900 px-3 py-2 rounded-lg border border-zinc-800 flex-row items-center gap-2">
                    <Dumbbell size={12} color="#DC2626" />
                    <Text className="text-white font-mono text-xs">
                      {snapshot.muscle_mass} kg músculo
                    </Text>
                  </View>
                )}
                {snapshot?.goal && (
                  <View className="bg-zinc-900 px-3 py-2 rounded-lg border border-zinc-800 flex-row items-center gap-2">
                    <Target size={12} color="#DC2626" />
                    <Text className="text-white font-mono text-xs">
                      {goalLabels[snapshot.goal] || snapshot.goal}
                    </Text>
                  </View>
                )}
                {snapshot?.age && (
                  <View className="bg-zinc-900 px-3 py-2 rounded-lg border border-zinc-800 flex-row items-center gap-2">
                    <Calendar size={12} color="#A1A1AA" />
                    <Text className="text-white font-mono text-xs">{snapshot.age} años</Text>
                  </View>
                )}
                {snapshot?.sex && (
                  <View className="bg-zinc-900 px-3 py-2 rounded-lg border border-zinc-800">
                    <Text className="text-white font-mono text-xs">
                      {snapshot.sex === 'M' ? '♂ Masculino' : '♀ Femenino'}
                    </Text>
                  </View>
                )}
              </View>
            </View>

            {/* Sección: Estado Físico */}
            {(snapshot?.activity_level ||
              snapshot?.training_experience ||
              snapshot?.injuries ||
              snapshot?.allergies) && (
              <View className="mb-4">
                <Text className="text-white font-bold text-xs uppercase tracking-widest mb-3">
                  ⚡ Estado Físico
                </Text>
                <View className="flex-row flex-wrap gap-2">
                  {snapshot?.activity_level && (
                    <View className="bg-zinc-900 px-3 py-2 rounded-lg border border-zinc-800 flex-row items-center gap-2">
                      <Zap size={12} color="#F97316" />
                      <Text className="text-fire-orange font-mono text-xs">
                        {snapshot.activity_level}
                      </Text>
                    </View>
                  )}
                  {snapshot?.training_experience && (
                    <View className="bg-zinc-900 px-3 py-2 rounded-lg border border-zinc-800 flex-row items-center gap-2">
                      <Award size={12} color="#A1A1AA" />
                      <Text className="text-white font-mono text-xs">
                        {snapshot.training_experience}
                      </Text>
                    </View>
                  )}
                  {snapshot?.injuries && (
                    <View className="bg-zinc-900 px-3 py-2 rounded-lg border border-red-900/50 flex-row items-center gap-2">
                      <ShieldAlert size={12} color="#ef4444" />
                      <Text className="text-red-400 font-mono text-xs">{snapshot.injuries}</Text>
                    </View>
                  )}
                  {snapshot?.allergies && (
                    <View className="bg-zinc-900 px-3 py-2 rounded-lg border border-yellow-900/50 flex-row items-center gap-2">
                      <AlertTriangle size={12} color="#eab308" />
                      <Text className="text-yellow-400 font-mono text-xs">
                        {snapshot.allergies}
                      </Text>
                    </View>
                  )}
                </View>
              </View>
            )}

            {/* Sección: Medidas Corporales */}
            {snapshot?.measurements && snapshot.measurements.length > 0 && (
              <View className="mb-4">
                <Text className="text-white font-bold text-xs uppercase tracking-widest mb-3">
                  📐 Medidas Corporales
                </Text>
                <View className="flex-row flex-wrap gap-2">
                  {snapshot.measurements.map((m, idx) => (
                    <View
                      key={idx}
                      className={`px-3 py-2 rounded-lg border flex-row items-center gap-2 ${
                        m.is_dominant
                          ? 'bg-yellow-900/20 border-yellow-600/40'
                          : 'bg-zinc-900 border-zinc-800'
                      }`}
                    >
                      <Text
                        className={`text-xs font-bold ${m.is_dominant ? 'text-yellow-500' : 'text-zinc-400'}`}
                      >
                        {m.name}
                      </Text>
                      <Text className="text-white font-mono text-xs">{m.value}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* Sección: Entrenamiento */}
            {snapshot?.training && (
              <View className="mb-4">
                <Text className="text-white font-bold text-xs uppercase tracking-widest mb-3">
                  🏋️ Entrenamiento
                </Text>
                <View className="bg-zinc-900 p-3 rounded-lg border border-zinc-800">
                  <View className="flex-row items-center gap-2">
                    <Dumbbell size={14} color="#DC2626" />
                    <Text className="text-white text-xs">
                      {snapshot.training.frequency} días/semana
                    </Text>
                  </View>
                  {snapshot.training.current_plan && (
                    <Text className="text-zinc-400 text-[10px] mt-1">
                      Plan: {snapshot.training.current_plan}
                    </Text>
                  )}
                </View>
              </View>
            )}

            {/* Sección: Nutrición */}
            {snapshot?.nutrition && (
              <View className="mb-4">
                <Text className="text-white font-bold text-xs uppercase tracking-widest mb-3">
                  🍽️ Nutrición
                </Text>
                <View className="bg-zinc-900 p-3 rounded-lg border border-zinc-800">
                  <View className="flex-row items-center gap-2 mb-2">
                    <Utensils size={14} color="#DC2626" />
                    <Text className="text-white text-xs">
                      {snapshot.nutrition.meal_count} comidas/día
                    </Text>
                  </View>
                  {snapshot.nutrition.daily_calories && (
                    <View className="flex-row flex-wrap gap-2">
                      <Text className="text-zinc-400 text-[10px] font-mono">
                        🔥 {snapshot.nutrition.daily_calories} kcal
                      </Text>
                      {snapshot.nutrition.daily_protein && (
                        <Text className="text-zinc-400 text-[10px] font-mono">
                          💪 {snapshot.nutrition.daily_protein}g P
                        </Text>
                      )}
                      {snapshot.nutrition.daily_carbs && (
                        <Text className="text-zinc-400 text-[10px] font-mono">
                          🍞 {snapshot.nutrition.daily_carbs}g C
                        </Text>
                      )}
                      {snapshot.nutrition.daily_fat && (
                        <Text className="text-zinc-400 text-[10px] font-mono">
                          🥑 {snapshot.nutrition.daily_fat}g F
                        </Text>
                      )}
                    </View>
                  )}
                </View>
              </View>
            )}

            {/* Sección: Suplementos */}
            {snapshot?.supplements && snapshot.supplements.length > 0 && (
              <View className="mb-4">
                <Text className="text-white font-bold text-xs uppercase tracking-widest mb-3">
                  💊 Suplementos
                </Text>
                <View className="flex-row flex-wrap gap-2">
                  {snapshot.supplements.map((s, idx) => (
                    <View
                      key={idx}
                      className="bg-zinc-900 px-3 py-2 rounded-lg border border-zinc-800 flex-row items-center gap-2"
                    >
                      <Pill size={12} color="#DC2626" />
                      <Text className="text-white text-xs">{s.name}</Text>
                      <Text className="text-zinc-500 text-[10px] font-mono">{s.time}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* Espacio inferior */}
            <View className="h-8" />
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}
