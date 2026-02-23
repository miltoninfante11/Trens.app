import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Image,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { Camera, Plus, ChevronRight } from 'lucide-react-native';
import * as Haptics from '../../lib/haptics';
import type { ProgressPhoto } from '../../types/progress';
import { getProgressPhotos } from '../../services/progress/photos';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const PHOTO_SIZE = (SCREEN_WIDTH - 64) / 3.5;

interface ProgressSliderProps {
  userId: string;
  onAddPhoto: () => void;
  onViewPhoto: (photo: ProgressPhoto) => void;
  refreshTrigger?: number;
}

export default function ProgressSlider({
  userId,
  onAddPhoto,
  onViewPhoto,
  refreshTrigger = 0,
}: ProgressSliderProps) {
  const [photos, setPhotos] = useState<ProgressPhoto[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadPhotos = useCallback(async () => {
    setIsLoading(true);
    const data = await getProgressPhotos(userId);
    setPhotos(data);
    setIsLoading(false);
  }, [userId]);

  useEffect(() => {
    loadPhotos();
  }, [loadPhotos, refreshTrigger]);

  const handleAddPhoto = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onAddPhoto();
  };

  const handleViewPhoto = (photo: ProgressPhoto) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onViewPhoto(photo);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const day = date.getDate();
    const month = date.toLocaleDateString('es-ES', { month: 'short' });
    return `${day} ${month}`;
  };

  if (isLoading) {
    return (
      <View className="py-4">
        <View className="flex-row items-center justify-between px-4 mb-3">
          <Text className="text-white font-bold text-xs uppercase tracking-widest">
            📸 Historial de Progreso
          </Text>
        </View>
        <View className="h-24 items-center justify-center">
          <ActivityIndicator size="small" color="#DC2626" />
        </View>
      </View>
    );
  }

  return (
    <View className="py-4">
      {/* Header */}
      <View className="flex-row items-center justify-between px-4 mb-3">
        <Text className="text-white font-bold text-xs uppercase tracking-widest">
          📸 Historial de Progreso
        </Text>
        <Text className="text-zinc-500 text-[10px] font-mono">
          {photos.length} {photos.length === 1 ? 'foto' : 'fotos'}
        </Text>
      </View>

      {/* Slider */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }}
      >
        {/* Botón Agregar Foto */}
        <TouchableOpacity
          onPress={handleAddPhoto}
          className="items-center justify-center border-2 border-dashed border-zinc-700 rounded-lg bg-zinc-900/50"
          style={{ width: PHOTO_SIZE, height: PHOTO_SIZE * 1.3 }}
        >
          <View className="w-10 h-10 rounded-full bg-savage-red items-center justify-center mb-2">
            <Plus size={20} color="#FFF" strokeWidth={3} />
          </View>
          <Text className="text-zinc-400 text-[9px] uppercase tracking-wider font-bold">
            Nueva Foto
          </Text>
        </TouchableOpacity>

        {/* Lista de Fotos */}
        {photos.map((photo) => (
          <TouchableOpacity
            key={photo.id}
            onPress={() => handleViewPhoto(photo)}
            className="rounded-lg overflow-hidden border border-zinc-800"
            style={{ width: PHOTO_SIZE, height: PHOTO_SIZE * 1.3 }}
          >
            <Image source={{ uri: photo.photo_url }} className="w-full h-full" resizeMode="cover" />
            {/* Overlay con fecha y datos */}
            <View className="absolute bottom-0 left-0 right-0 bg-black/80 p-2">
              <Text className="text-white text-[10px] font-bold">
                {formatDate(photo.created_at)}
              </Text>
              <View className="flex-row items-center gap-2 mt-0.5">
                {photo.snapshot?.weight && (
                  <Text className="text-zinc-400 text-[9px] font-mono">
                    {photo.snapshot.weight} kg
                  </Text>
                )}
                {photo.snapshot?.imc && (
                  <Text className="text-fire-orange text-[9px] font-mono">
                    IMC {photo.snapshot.imc}
                  </Text>
                )}
                {photo.snapshot?.body_fat_percentage && (
                  <Text className="text-zinc-500 text-[9px] font-mono">
                    {photo.snapshot.body_fat_percentage}%
                  </Text>
                )}
              </View>
            </View>
            {/* Indicador de datos */}
            <View className="absolute top-2 right-2">
              <View className="w-5 h-5 rounded-full bg-savage-red items-center justify-center">
                <ChevronRight size={12} color="#FFF" />
              </View>
            </View>
          </TouchableOpacity>
        ))}

        {/* Placeholder si no hay fotos */}
        {photos.length === 0 && (
          <View
            className="items-center justify-center bg-zinc-900/30 rounded-lg border border-zinc-800"
            style={{ width: PHOTO_SIZE * 2, height: PHOTO_SIZE * 1.3 }}
          >
            <Camera size={24} color="#3f3f46" />
            <Text className="text-zinc-600 text-[10px] mt-2 text-center px-4">
              Sube tu primera foto para trackear tu progreso
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}
