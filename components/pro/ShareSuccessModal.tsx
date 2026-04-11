// =============================================================================
// SHARE SUCCESS MODAL - Modal post-guardado con opciones de compartir
// Branding editor local — sin almacenamiento en la nube
// =============================================================================

import React, { useEffect } from 'react';
import { View, Text, TouchableOpacity, Modal, Platform } from 'react-native';
import * as Sharing from 'expo-sharing';
import * as MediaLibrary from 'expo-media-library';
import * as Linking from 'expo-linking';
import { CheckCircle, Download, Share2, MessageCircle, Instagram } from 'lucide-react-native';
import * as Haptics from '../../lib/haptics';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withDelay,
  SlideInUp,
} from 'react-native-reanimated';

// =============================================================================
// TIPOS
// =============================================================================

interface ShareSuccessModalProps {
  visible: boolean;
  onClose: () => void;
  mediaType: 'video' | 'photo';
  localUri?: string;
  isPublic?: boolean;
}

// =============================================================================
// COMPONENT
// =============================================================================

export function ShareSuccessModal({
  visible,
  onClose,
  mediaType,
  localUri,
}: ShareSuccessModalProps) {
  const [savedToGallery, setSavedToGallery] = React.useState(false);

  const checkScale = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      checkScale.value = withDelay(200, withSpring(1, { damping: 8, stiffness: 150 }));
      setSavedToGallery(false);
    } else {
      checkScale.value = 0;
    }
  }, [visible]);

  const checkStyle = useAnimatedStyle(() => ({
    transform: [{ scale: checkScale.value }],
  }));

  // ── Compartir archivo nativo ──
  const handleShare = async () => {
    if (!localUri) return;
    try {
      const available = await Sharing.isAvailableAsync();
      if (available) {
        await Sharing.shareAsync(localUri, {
          mimeType: mediaType === 'video' ? 'video/mp4' : 'image/jpeg',
          dialogTitle: 'Compartir desde TRENS',
        });
      }
    } catch (e) {
      console.warn('Error sharing:', e);
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  // ── Guardar en galería ──
  const handleSaveToGallery = async () => {
    if (!localUri) return;

    try {
      if (Platform.OS === 'web') {
        // Web: descargar archivo
        const a = document.createElement('a');
        a.href = localUri;
        a.download = `trens_${mediaType}_${Date.now()}.${mediaType === 'video' ? 'mp4' : 'jpg'}`;
        a.click();
      } else {
        const { status } = await MediaLibrary.requestPermissionsAsync();
        if (status === 'granted') {
          await MediaLibrary.saveToLibraryAsync(localUri);
        }
      }
      setSavedToGallery(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      console.warn('Error saving to gallery:', e);
    }
  };

  // ── Instagram Stories ──
  const handleInstagram = async () => {
    // Guardar primero en galería para que el usuario lo tenga disponible
    if (!savedToGallery) await handleSaveToGallery();

    const url = 'instagram://story-camera';
    try {
      const canOpen = await Linking.canOpenURL(url);
      if (canOpen) {
        await Linking.openURL(url);
      } else {
        await Linking.openURL('https://instagram.com');
      }
    } catch {
      await Linking.openURL('https://instagram.com');
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  // ── WhatsApp ──
  const handleWhatsApp = async () => {
    // Primero compartir el archivo directamente vía share nativo
    await handleShare();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View className="flex-1 bg-black/90 justify-center items-center px-6">
        <Animated.View
          entering={SlideInUp.springify().damping(15)}
          className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 w-full max-w-sm"
        >
          {/* Success Icon */}
          <View className="items-center mb-4">
            <Animated.View
              style={[
                checkStyle,
                {
                  width: 72,
                  height: 72,
                  borderRadius: 36,
                  backgroundColor: 'rgba(220, 38, 38, 0.2)',
                  alignItems: 'center',
                  justifyContent: 'center',
                },
              ]}
            >
              <View
                className="w-14 h-14 rounded-full items-center justify-center"
                style={{
                  backgroundColor: '#DC2626',
                  shadowColor: '#DC2626',
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.5,
                  shadowRadius: 12,
                }}
              >
                <CheckCircle color="#FFFFFF" size={28} />
              </View>
            </Animated.View>
          </View>

          {/* Title */}
          <Text className="text-white text-xl font-bold text-center mb-1">
            {mediaType === 'video' ? '¡VIDEO LISTO!' : '¡FOTO LISTA!'}
          </Text>

          {/* Subtitle */}
          <Text className="text-zinc-400 text-center text-sm mb-6">
            Comparte tu contenido con branding TRENS
          </Text>

          {/* Share Options */}
          <View className="mb-4">
            <Text className="text-zinc-500 text-xs mb-3 uppercase tracking-wide">Compartir en</Text>
            <View className="flex-row justify-center gap-4">
              {/* Instagram */}
              <TouchableOpacity onPress={handleInstagram} className="items-center">
                <View
                  className="w-14 h-14 rounded-2xl items-center justify-center mb-2"
                  style={{ backgroundColor: 'rgba(228, 64, 95, 0.2)' }}
                >
                  <Instagram color="#E4405F" size={24} />
                </View>
                <Text className="text-zinc-400 text-xs">Instagram</Text>
              </TouchableOpacity>

              {/* WhatsApp */}
              <TouchableOpacity onPress={handleWhatsApp} className="items-center">
                <View
                  className="w-14 h-14 rounded-2xl items-center justify-center mb-2"
                  style={{ backgroundColor: 'rgba(37, 211, 102, 0.2)' }}
                >
                  <MessageCircle color="#25D366" size={24} />
                </View>
                <Text className="text-zinc-400 text-xs">WhatsApp</Text>
              </TouchableOpacity>

              {/* Más */}
              <TouchableOpacity onPress={handleShare} className="items-center">
                <View
                  className="w-14 h-14 rounded-2xl items-center justify-center mb-2"
                  style={{ backgroundColor: 'rgba(113, 113, 122, 0.2)' }}
                >
                  <Share2 color="#71717A" size={24} />
                </View>
                <Text className="text-zinc-400 text-xs">Más</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Save to Gallery */}
          <TouchableOpacity
            onPress={handleSaveToGallery}
            className="flex-row items-center justify-center py-4 rounded-2xl mb-3"
            style={{
              backgroundColor: savedToGallery
                ? 'rgba(34, 197, 94, 0.15)'
                : 'rgba(220, 38, 38, 0.15)',
            }}
          >
            <Download
              color={savedToGallery ? '#22C55E' : '#DC2626'}
              size={20}
              style={{ marginRight: 8 }}
            />
            <Text className="font-bold" style={{ color: savedToGallery ? '#22C55E' : '#DC2626' }}>
              {savedToGallery ? 'GUARDADO ✓' : 'GUARDAR EN GALERÍA'}
            </Text>
          </TouchableOpacity>

          {/* Done Button */}
          <TouchableOpacity onPress={onClose} className="py-4 rounded-2xl items-center bg-zinc-800">
            <Text className="text-white font-bold">LISTO</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  );
}

export default ShareSuccessModal;
