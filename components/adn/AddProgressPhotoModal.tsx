import React, { useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, Image, ActivityIndicator } from 'react-native';
import { Alert } from '../../lib/alert';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Camera, Image as ImageIcon, Upload, X } from 'lucide-react-native';
import * as Haptics from '../../lib/haptics';
import { openCamera, openGallery } from '../../lib/webCamera';
import { uploadProgressPhoto } from '../../services/progress/photos';
import { BottomSheetModal } from '../ui/BottomSheetModal';

interface AddProgressPhotoModalProps {
  visible: boolean;
  userId: string;
  onClose: () => void;
  onSuccess: () => void;
}

export default function AddProgressPhotoModal({
  visible,
  userId,
  onClose,
  onSuccess,
}: AddProgressPhotoModalProps) {
  const insets = useSafeAreaInsets();
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [isUploading, setIsUploading] = useState(false);

  const resetState = () => {
    setSelectedImage(null);
    setNotes('');
    setIsUploading(false);
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  const pickFromCamera = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const result = await openCamera({
      quality: 0.8,
      base64: true,
      allowsEditing: true,
      aspect: [3, 4],
    });

    if (result.success && result.uri) {
      // Si ya viene como data URL, usarlo directamente
      if (result.uri.startsWith('data:')) {
        setSelectedImage(result.uri);
      } else if (result.base64) {
        setSelectedImage(`data:image/jpeg;base64,${result.base64}`);
      }
    } else if (result.error && result.error !== 'Cancelado por el usuario') {
      Alert.alert('Error', result.error);
    }
  };

  const pickFromGallery = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const result = await openGallery({
      quality: 0.8,
      base64: true,
      allowsEditing: true,
      aspect: [3, 4],
    });

    if (result.success && result.uri) {
      // Si ya viene como data URL, usarlo directamente
      if (result.uri.startsWith('data:')) {
        setSelectedImage(result.uri);
      } else if (result.base64) {
        setSelectedImage(`data:image/jpeg;base64,${result.base64}`);
      }
    } else if (result.error && result.error !== 'Cancelado por el usuario') {
      Alert.alert('Error', result.error);
    }
  };

  const handleUpload = async () => {
    if (!selectedImage) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setIsUploading(true);

    // Extraer base64 sin el prefijo data:image/jpeg;base64,
    const base64Data = selectedImage.replace(/^data:image\/\w+;base64,/, '');

    const result = await uploadProgressPhoto(userId, {
      photo_base64: base64Data,
      notes: notes.trim() || undefined,
    });

    setIsUploading(false);

    if (result.success) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      resetState();
      onSuccess();
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Error', result.error || 'No se pudo subir la foto');
    }
  };

  // Footer con botón de subir
  const footer = (
    <View className="p-4">
      <TouchableOpacity
        onPress={handleUpload}
        disabled={!selectedImage || isUploading}
        className={`py-4 rounded-xl flex-row items-center justify-center gap-2 ${
          selectedImage && !isUploading ? 'bg-savage-red' : 'bg-zinc-800'
        }`}
        style={
          selectedImage && !isUploading
            ? {
                shadowColor: '#DC2626',
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.3,
                shadowRadius: 8,
                elevation: 5,
              }
            : {}
        }
      >
        {isUploading ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <Upload size={18} color="#fff" />
        )}
        <Text className="text-white font-black uppercase tracking-widest text-xs">
          {isUploading ? 'Subiendo...' : 'Guardar Foto'}
        </Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <BottomSheetModal
      visible={visible}
      onClose={handleClose}
      title="📸 Nueva Foto de Progreso"
      accentColor="#DC2626"
      height="auto"
      scrollable={false}
      footer={footer}
    >
      <View className="p-4">
        {/* Preview de imagen o botones de selección */}
        {selectedImage ? (
          <View className="mb-4">
            <Image
              source={{ uri: selectedImage }}
              className="w-full h-80 rounded-xl"
              resizeMode="cover"
              style={{
                borderWidth: 2,
                borderColor: '#DC262640',
              }}
            />
            <TouchableOpacity
              onPress={() => setSelectedImage(null)}
              className="absolute top-2 right-2 bg-black/70 p-2 rounded-full"
            >
              <X size={16} color="#fff" />
            </TouchableOpacity>
          </View>
        ) : (
          <View className="flex-row gap-3 mb-4">
            <TouchableOpacity
              onPress={pickFromCamera}
              className="flex-1 py-6 bg-zinc-900 rounded-xl items-center border border-zinc-800 active:bg-zinc-800"
              style={{
                shadowColor: '#DC2626',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.1,
                shadowRadius: 4,
              }}
            >
              <Camera size={32} color="#DC2626" />
              <Text className="text-white text-xs font-bold mt-2 uppercase">Cámara</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={pickFromGallery}
              className="flex-1 py-6 bg-zinc-900 rounded-xl items-center border border-zinc-800 active:bg-zinc-800"
              style={{
                shadowColor: '#DC2626',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.1,
                shadowRadius: 4,
              }}
            >
              <ImageIcon size={32} color="#DC2626" />
              <Text className="text-white text-xs font-bold mt-2 uppercase">Galería</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Notas opcionales */}
        <View className="mb-4">
          <Text className="text-zinc-400 text-[10px] uppercase tracking-wider mb-2">
            Notas (opcional)
          </Text>
          <TextInput
            value={notes}
            onChangeText={setNotes}
            placeholder="Ej: Semana 8 de definición, sintiéndome más fuerte..."
            placeholderTextColor="#52525b"
            multiline
            numberOfLines={3}
            className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-white text-sm"
            style={{ textAlignVertical: 'top', minHeight: 80 }}
          />
        </View>

        {/* Info sobre snapshot */}
        <View className="bg-zinc-900/50 p-3 rounded-xl border border-zinc-800">
          <Text className="text-zinc-400 text-[10px] text-center">
            💾 Se guardará automáticamente tu peso, medidas, plan de entrenamiento y nutrición
            actuales junto con esta foto.
          </Text>
        </View>
      </View>
    </BottomSheetModal>
  );
}
