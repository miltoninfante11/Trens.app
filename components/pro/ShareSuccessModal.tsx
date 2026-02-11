// =============================================================================
// SHARE SUCCESS MODAL - Modal post-guardado con opciones de compartir
// Estilo SAVAGE con links directos a redes sociales
// =============================================================================

import React, { useEffect } from 'react';
import { View, Text, TouchableOpacity, Modal, Share } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as Linking from 'expo-linking';
import { CheckCircle, Copy, Share2, X, MessageCircle, Instagram } from 'lucide-react-native';
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
  exerciseName?: string | null;
  weight?: number | null;
  reps?: number | null;
  isPublic: boolean;
  videoId?: string; // ID para generar link compartible
}

// =============================================================================
// SHARE BUTTONS CONFIG
// =============================================================================

const SHARE_OPTIONS = [
  {
    id: 'instagram',
    name: 'Instagram',
    icon: Instagram,
    color: '#E4405F',
    action: 'stories',
  },
  {
    id: 'whatsapp',
    name: 'WhatsApp',
    icon: MessageCircle,
    color: '#25D366',
    action: 'share',
  },
  {
    id: 'more',
    name: 'Más',
    icon: Share2,
    color: '#71717A',
    action: 'native',
  },
];

// =============================================================================
// COMPONENT
// =============================================================================

export function ShareSuccessModal({
  visible,
  onClose,
  mediaType,
  exerciseName,
  weight,
  reps,
  isPublic,
  videoId,
}: ShareSuccessModalProps) {
  const [copied, setCopied] = React.useState(false);

  // Animación del check
  const checkScale = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      checkScale.value = withDelay(200, withSpring(1, { damping: 8, stiffness: 150 }));
    } else {
      checkScale.value = 0;
    }
  }, [visible]);

  const checkStyle = useAnimatedStyle(() => ({
    transform: [{ scale: checkScale.value }],
  }));

  // Generar link compartible
  const shareLink = videoId ? `https://trens.app/v/${videoId}` : null;

  // Generar texto para compartir
  const generateShareText = () => {
    let text = '🔥 ';

    if (exerciseName) {
      text += exerciseName;
    } else {
      text += 'Entrenamiento';
    }

    if (weight && reps) {
      text += ` | ${weight}kg × ${reps} reps`;
    } else if (weight) {
      text += ` | ${weight}kg`;
    }

    text += '\n\n#TRENS #Fitness #GymLife';

    if (shareLink) {
      text += `\n\n${shareLink}`;
    }

    return text;
  };

  // Copiar link
  const handleCopyLink = async () => {
    if (shareLink) {
      await Clipboard.setStringAsync(shareLink);
      setCopied(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Compartir a WhatsApp
  const handleWhatsApp = async () => {
    const text = encodeURIComponent(generateShareText());
    const url = `whatsapp://send?text=${text}`;

    try {
      const canOpen = await Linking.canOpenURL(url);
      if (canOpen) {
        await Linking.openURL(url);
      } else {
        // Fallback a share nativo
        handleNativeShare();
      }
    } catch {
      handleNativeShare();
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  // Compartir nativo
  const handleNativeShare = async () => {
    try {
      await Share.share({
        message: generateShareText(),
        title: exerciseName || 'Mi entrenamiento',
      });
    } catch (e) {
      console.warn('Error sharing:', e);
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  // Instagram Stories (requiere que el video ya esté guardado en galería)
  const handleInstagram = async () => {
    // Instagram Stories se abre con el video del carrete
    // El usuario ya tiene el video guardado, solo abrimos IG
    const url = 'instagram://story-camera';

    try {
      const canOpen = await Linking.canOpenURL(url);
      if (canOpen) {
        await Linking.openURL(url);
      } else {
        // Fallback: abrir Instagram normal
        await Linking.openURL('instagram://');
      }
    } catch {
      // Si no tiene Instagram, abrir web
      await Linking.openURL('https://instagram.com');
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  const handleShareOption = (optionId: string) => {
    switch (optionId) {
      case 'instagram':
        handleInstagram();
        break;
      case 'whatsapp':
        handleWhatsApp();
        break;
      case 'more':
        handleNativeShare();
        break;
    }
  };

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View className="flex-1 bg-black/90 justify-center items-center px-6">
        <Animated.View
          entering={SlideInUp.springify().damping(15)}
          className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 w-full max-w-sm"
        >
          {/* Close Button */}
          <TouchableOpacity
            onPress={onClose}
            className="absolute top-4 right-4 w-8 h-8 rounded-full bg-zinc-800 items-center justify-center z-10"
          >
            <X color="#71717A" size={18} />
          </TouchableOpacity>

          {/* Success Icon */}
          <View className="items-center mb-4">
            <Animated.View
              style={[
                checkStyle,
                {
                  width: 72,
                  height: 72,
                  borderRadius: 36,
                  backgroundColor: 'rgba(34, 197, 94, 0.2)',
                  alignItems: 'center',
                  justifyContent: 'center',
                },
              ]}
            >
              <View
                className="w-14 h-14 rounded-full bg-green-500 items-center justify-center"
                style={{
                  shadowColor: '#22C55E',
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
            {mediaType === 'video' ? '¡VIDEO GUARDADO!' : '¡FOTO GUARDADA!'}
          </Text>

          {/* Subtitle */}
          <Text className="text-zinc-400 text-center text-sm mb-6">
            {isPublic ? 'Tu contenido está listo para compartir' : 'Guardado en tu bóveda privada'}
          </Text>

          {/* Exercise Info */}
          {exerciseName && (
            <View className="bg-zinc-800/50 rounded-xl p-3 mb-4">
              <Text className="text-zinc-400 text-xs mb-1">EJERCICIO</Text>
              <Text className="text-white font-bold text-lg">{exerciseName}</Text>
              {weight && reps && (
                <Text className="text-savage-red font-mono text-sm mt-1">
                  {weight}kg × {reps} reps
                </Text>
              )}
            </View>
          )}

          {/* Share Link */}
          {shareLink && isPublic && (
            <View className="mb-4">
              <Text className="text-zinc-500 text-xs mb-2 uppercase tracking-wide">
                Link para compartir
              </Text>
              <TouchableOpacity
                onPress={handleCopyLink}
                className="flex-row items-center bg-zinc-800 rounded-xl px-4 py-3"
              >
                <Text className="flex-1 text-white text-sm font-mono" numberOfLines={1}>
                  {shareLink}
                </Text>
                <View
                  className={`px-3 py-1 rounded-lg ${copied ? 'bg-green-500/20' : 'bg-zinc-700'}`}
                >
                  {copied ? (
                    <Text className="text-green-500 text-xs font-bold">COPIADO</Text>
                  ) : (
                    <Copy color="#A1A1AA" size={16} />
                  )}
                </View>
              </TouchableOpacity>
            </View>
          )}

          {/* Share Options */}
          {isPublic && (
            <View className="mb-4">
              <Text className="text-zinc-500 text-xs mb-3 uppercase tracking-wide">
                Compartir en
              </Text>
              <View className="flex-row justify-center gap-4">
                {SHARE_OPTIONS.map((option) => (
                  <TouchableOpacity
                    key={option.id}
                    onPress={() => handleShareOption(option.id)}
                    className="items-center"
                  >
                    <View
                      className="w-14 h-14 rounded-2xl items-center justify-center mb-2"
                      style={{ backgroundColor: `${option.color}20` }}
                    >
                      <option.icon color={option.color} size={24} />
                    </View>
                    <Text className="text-zinc-400 text-xs">{option.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

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
