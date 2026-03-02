import React from 'react';
import { View, Text, TouchableOpacity, Modal } from 'react-native';
import { Crosshair, Lock, X } from 'lucide-react-native';
import * as Haptics from '../../lib/haptics';
import { useRouter } from 'expo-router';

// ============================================================================
// PROPS
// ============================================================================
interface ProUpgradeModalProps {
  visible: boolean;
  onClose: () => void;
  feature?: 'record' | 'publish' | 'vault' | 'camera';
}

// ============================================================================
// MENSAJES POR FEATURE
// ============================================================================
const FEATURE_MESSAGES = {
  record: {
    title: 'DESBLOQUEA PRO',
    subtitle: 'Graba y documenta tus levantamientos',
    description: 'Desbloquea TRENS PRO para grabar y publicar tus levantamientos',
  },
  publish: {
    title: 'DESBLOQUEA PRO',
    subtitle: 'Publica tu contenido',
    description: 'Desbloquea TRENS PRO para publicar tus videos en el feed',
  },
  vault: {
    title: 'DESBLOQUEA PRO',
    subtitle: 'Accede a tu bóveda',
    description: 'Desbloquea TRENS PRO para guardar videos privados en tu bóveda',
  },
  camera: {
    title: 'DESBLOQUEA PRO',
    subtitle: 'Usa la cámara PRO',
    description: 'Desbloquea TRENS PRO para grabar y publicar tus levantamientos',
  },
};

// ============================================================================
// COMPONENT
// ============================================================================
export function ProUpgradeModal({ visible, onClose, feature = 'camera' }: ProUpgradeModalProps) {
  const router = useRouter();
  const messages = FEATURE_MESSAGES[feature];

  const handleUpgrade = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onClose();
    // Ir a login/registro para activar PRO
    router.push('/(auth)/login');
  };

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View className="flex-1 bg-black/90 justify-center items-center px-6">
        {/* Glow Effect */}
        <View
          className="absolute w-64 h-64 rounded-full bg-savage-red opacity-20"
          style={{
            shadowColor: '#DC2626',
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: 0.8,
            shadowRadius: 100,
          }}
        />

        {/* Card */}
        <View className="bg-zinc-950 border border-zinc-800 rounded-3xl p-8 w-full max-w-sm relative">
          {/* Close Button */}
          <TouchableOpacity
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onClose();
            }}
            className="absolute top-4 right-4 w-8 h-8 rounded-full bg-zinc-900 items-center justify-center"
          >
            <X color="#71717A" size={18} />
          </TouchableOpacity>

          {/* Icon */}
          <View className="items-center mb-6">
            <View
              className="w-20 h-20 rounded-full bg-zinc-900 border-2 border-savage-red items-center justify-center"
              style={{
                shadowColor: '#DC2626',
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.5,
                shadowRadius: 12,
              }}
            >
              <Lock color="#DC2626" size={32} />
            </View>
          </View>

          {/* Title */}
          <Text className="text-white text-2xl font-bold text-center mb-2 tracking-wider">
            {messages.title}
          </Text>

          {/* Subtitle */}
          <Text className="text-savage-red text-sm font-bold text-center mb-4 tracking-widest">
            {messages.subtitle.toUpperCase()}
          </Text>

          {/* Description */}
          <Text className="text-zinc-400 text-center mb-8 leading-relaxed">
            {messages.description}
          </Text>

          {/* Benefits */}
          <View className="bg-zinc-900/50 rounded-2xl p-4 mb-6">
            <View className="flex-row items-center mb-3">
              <View className="w-2 h-2 bg-savage-red rounded-full mr-3" />
              <Text className="text-white text-sm">Cámara PRO con editor</Text>
            </View>
            <View className="flex-row items-center mb-3">
              <View className="w-2 h-2 bg-savage-red rounded-full mr-3" />
              <Text className="text-white text-sm">Grabación de videos</Text>
            </View>
            <View className="flex-row items-center mb-3">
              <View className="w-2 h-2 bg-savage-red rounded-full mr-3" />
              <Text className="text-white text-sm">Publicar en el Feed</Text>
            </View>
            <View className="flex-row items-center">
              <View className="w-2 h-2 bg-savage-red rounded-full mr-3" />
              <Text className="text-white text-sm">Bóveda privada + historial</Text>
            </View>
          </View>

          {/* CTA Button */}
          <TouchableOpacity
            onPress={handleUpgrade}
            className="bg-savage-red py-4 rounded-2xl items-center"
            style={{
              shadowColor: '#DC2626',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.5,
              shadowRadius: 8,
            }}
          >
            <View className="flex-row items-center">
              <Crosshair color="#FFFFFF" size={20} />
              <Text className="text-white font-bold text-lg ml-2 tracking-wider">ACTIVAR PRO</Text>
            </View>
          </TouchableOpacity>

          {/* Skip */}
          <TouchableOpacity onPress={onClose} className="mt-4 py-2">
            <Text className="text-zinc-600 text-center text-sm">Ahora no</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
