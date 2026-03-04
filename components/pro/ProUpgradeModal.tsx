// ============================================================================
// PRO UPGRADE MODAL - TRENS
// Modal de upgrade híbrido: muestra IAP en nativo, OpenPay en web.
// Diseño agresivo "SAVAGE MODE" con gradientes.
// ============================================================================

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
  Platform,
  ScrollView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Crown,
  X,
  Zap,
  CheckCircle,
  Shield,
  RotateCcw,
  Camera,
  Video,
  Brain,
  Dna,
  Dumbbell,
  Globe,
  Smartphone,
} from 'lucide-react-native';
import * as Haptics from '../../lib/haptics';
import { useRouter } from 'expo-router';
import { useUserRoleContext } from '../../context/UserRoleContext';

// Dynamic import para SubscriptionContext (puede no estar montado)
let useSubscriptionSafe: () => any = () => null;
try {
  const subMod = require('../../context/SubscriptionContext');
  useSubscriptionSafe = () => {
    try {
      return subMod.useSubscription();
    } catch {
      return null;
    }
  };
} catch {
  // Module not available
}

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
    icon: Video,
  },
  publish: {
    title: 'DESBLOQUEA PRO',
    subtitle: 'Publica tu contenido',
    icon: Zap,
  },
  vault: {
    title: 'DESBLOQUEA PRO',
    subtitle: 'Accede a tu bóveda',
    icon: Shield,
  },
  camera: {
    title: 'DESBLOQUEA PRO',
    subtitle: 'Usa la cámara PRO',
    icon: Camera,
  },
};

const PRO_FEATURES_LIST = [
  { icon: Camera, label: 'Cámara PRO con editor' },
  { icon: Video, label: 'Grabación de videos ilimitada' },
  { icon: Zap, label: 'Publicar en el Feed' },
  { icon: Shield, label: 'Bóveda privada + historial' },
  { icon: Brain, label: 'Asistente HANK con IA' },
  { icon: Dna, label: 'Métricas ADN atlético' },
  { icon: Dumbbell, label: 'Nutrición y suplementos' },
];

// ============================================================================
// COMPONENT
// ============================================================================
export function ProUpgradeModal({ visible, onClose, feature = 'camera' }: ProUpgradeModalProps) {
  const router = useRouter();
  const { isAuthenticated } = useUserRoleContext();
  const subscription = useSubscriptionSafe();
  const messages = FEATURE_MESSAGES[feature];
  const FeatureIcon = messages.icon;

  const [isPurchasing, setIsPurchasing] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [purchaseError, setPurchaseError] = useState<string | null>(null);

  const isIOS = Platform.OS === 'ios';
  const isAndroid = Platform.OS === 'android';
  const isNative = Platform.OS === 'ios' || Platform.OS === 'android';

  useEffect(() => {
    if (visible) setPurchaseError(null);
  }, [visible]);

  // Go to login/subscribe
  const handleLoginFirst = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onClose();
    router.push('/(auth)/login');
  };

  // IAP purchase (native)
  const handleIAPPurchase = async () => {
    if (!subscription?.iapPackages?.length) return;

    const pkg =
      subscription.iapPackages.find(
        (p: any) => p.period === 'MONTHLY' || p.identifier === '$rc_monthly'
      ) || subscription.iapPackages[0];

    setIsPurchasing(true);
    setPurchaseError(null);

    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      const result = await subscription.purchaseIAP(pkg);

      if (result.success) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        onClose();
      } else if (result.error !== 'cancelled') {
        setPurchaseError(result.error || 'Error al procesar la compra');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
    } catch (err: any) {
      setPurchaseError(err.message || 'Error inesperado');
    } finally {
      setIsPurchasing(false);
    }
  };

  // Restore purchases (native)
  const handleRestore = async () => {
    if (!subscription) return;
    setIsRestoring(true);
    setPurchaseError(null);

    try {
      const result = await subscription.restorePurchases();
      if (result.success) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        onClose();
      } else {
        setPurchaseError(result.error || 'No se encontraron compras anteriores');
      }
    } catch (err: any) {
      setPurchaseError(err.message || 'Error al restaurar');
    } finally {
      setIsRestoring(false);
    }
  };

  // Get display price
  const getDisplayPrice = (): string => {
    if (isNative && subscription?.iapPackages?.length) {
      const pkg = subscription.iapPackages.find(
        (p: any) => p.period === 'MONTHLY' || p.identifier === '$rc_monthly'
      );
      if (pkg?.priceString) return `${pkg.priceString}/mes`;
    }
    if (isNative) return subscription?.nativePrice || 'S/ 69.90/mes';
    return subscription?.webPrice || 'S/ 59.90/mes';
  };

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View className="flex-1 bg-black/95 justify-center items-center px-4">
        <View className="bg-zinc-950 border border-zinc-800 rounded-3xl w-full max-w-sm overflow-hidden">
          {/* Header Gradient */}
          <LinearGradient
            colors={['#DC2626', '#991B1B', '#000000']}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            className="px-6 pt-8 pb-6"
          >
            <TouchableOpacity
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onClose();
              }}
              className="absolute top-4 right-4 w-8 h-8 rounded-full bg-black/40 items-center justify-center z-10"
            >
              <X color="#fff" size={16} />
            </TouchableOpacity>

            <View className="items-center mb-4">
              <View className="w-16 h-16 rounded-2xl bg-black/30 items-center justify-center border border-red-500/30">
                <FeatureIcon color="#fff" size={28} />
              </View>
            </View>

            <Text className="text-white text-2xl font-black text-center tracking-wider">
              {messages.title}
            </Text>
            <Text className="text-red-200/80 text-sm font-bold text-center mt-1 tracking-widest uppercase">
              {messages.subtitle}
            </Text>
          </LinearGradient>

          {/* Content */}
          <ScrollView
            className="px-6"
            showsVerticalScrollIndicator={false}
            style={{ maxHeight: 380 }}
          >
            {/* Features */}
            <View className="py-4 gap-2.5">
              {PRO_FEATURES_LIST.map(({ icon: Icon, label }) => (
                <View key={label} className="flex-row items-center gap-3">
                  <View className="w-8 h-8 rounded-lg bg-red-600/10 items-center justify-center">
                    <Icon size={14} color="#DC2626" />
                  </View>
                  <Text className="text-zinc-300 text-sm flex-1">{label}</Text>
                  <CheckCircle size={14} color="#22C55E" />
                </View>
              ))}
            </View>

            {/* Error */}
            {purchaseError && purchaseError !== 'cancelled' && (
              <View className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 mb-4">
                <Text className="text-red-400 text-sm text-center">{purchaseError}</Text>
              </View>
            )}

            {!isAuthenticated ? (
              /* Not logged in */
              <View className="pb-6">
                <TouchableOpacity
                  onPress={handleLoginFirst}
                  className="overflow-hidden rounded-2xl"
                >
                  <LinearGradient colors={['#DC2626', '#B91C1C']} className="py-4 items-center">
                    <View className="flex-row items-center gap-2">
                      <Crown size={18} color="#fff" />
                      <Text className="text-white font-black text-base tracking-wider">
                        INICIAR SESIÓN
                      </Text>
                    </View>
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            ) : isNative && subscription ? (
              /* Native: IAP */
              <View className="pb-6">
                <TouchableOpacity
                  onPress={handleIAPPurchase}
                  disabled={isPurchasing}
                  className="overflow-hidden rounded-2xl mb-3"
                >
                  <LinearGradient
                    colors={isPurchasing ? ['#374151', '#1F2937'] : ['#DC2626', '#B91C1C']}
                    className="py-4 items-center"
                  >
                    {isPurchasing ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <View className="items-center">
                        <View className="flex-row items-center gap-2">
                          <Crown size={18} color="#fff" />
                          <Text className="text-white font-black text-lg tracking-wider">
                            ACTIVAR PRO
                          </Text>
                        </View>
                        <Text className="text-red-200/70 text-xs mt-1 font-medium">
                          {getDisplayPrice()}
                        </Text>
                      </View>
                    )}
                  </LinearGradient>
                </TouchableOpacity>

                {/* Restore */}
                <TouchableOpacity
                  onPress={handleRestore}
                  disabled={isRestoring}
                  className="flex-row items-center justify-center gap-2 py-3"
                >
                  {isRestoring ? (
                    <ActivityIndicator color="#71717A" size="small" />
                  ) : (
                    <>
                      <RotateCcw size={14} color="#71717A" />
                      <Text className="text-zinc-500 text-sm">Restaurar compras</Text>
                    </>
                  )}
                </TouchableOpacity>

                <View className="flex-row items-center justify-center gap-1.5 mt-1">
                  <Smartphone size={12} color="#52525B" />
                  <Text className="text-zinc-600 text-[10px]">
                    {isIOS ? 'Pago seguro via App Store' : 'Pago seguro via Google Play'}
                  </Text>
                </View>

                {/* Android: motivar pago web */}
                {isAndroid && (
                  <View className="mt-3 p-3 bg-green-500/5 border border-green-500/20 rounded-xl">
                    <Text className="text-green-400 text-xs font-bold text-center mb-1">
                      💰 ¡Ahorra S/ 10 al mes!
                    </Text>
                    <Text className="text-zinc-400 text-[11px] text-center">
                      Suscríbete desde trens.app por solo S/ 59.90/mes
                    </Text>
                  </View>
                )}
              </View>
            ) : (
              /* Web: OpenPay */
              <View className="pb-6">
                <TouchableOpacity
                  onPress={handleLoginFirst}
                  className="overflow-hidden rounded-2xl mb-3"
                >
                  <LinearGradient colors={['#DC2626', '#B91C1C']} className="py-4 items-center">
                    <View className="items-center">
                      <View className="flex-row items-center gap-2">
                        <Crown size={18} color="#fff" />
                        <Text className="text-white font-black text-lg tracking-wider">
                          ACTIVAR PRO
                        </Text>
                      </View>
                      <Text className="text-red-200/70 text-xs mt-1 font-medium">
                        {getDisplayPrice()}
                      </Text>
                    </View>
                  </LinearGradient>
                </TouchableOpacity>

                <View className="flex-row items-center justify-center gap-1.5 mt-2">
                  <Globe size={12} color="#52525B" />
                  <Text className="text-zinc-600 text-[10px]">
                    Pago seguro con tarjeta de crédito/débito
                  </Text>
                </View>
              </View>
            )}
          </ScrollView>

          {/* Skip */}
          <TouchableOpacity onPress={onClose} className="py-3 border-t border-zinc-800/50">
            <Text className="text-zinc-600 text-center text-sm">Ahora no</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
