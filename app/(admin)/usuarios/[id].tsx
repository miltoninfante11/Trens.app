import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Image,
  Modal,
  ActivityIndicator,
  TextInput,
  Platform,
} from 'react-native';
import { Alert } from '../../../lib/alert';
import { useLocalSearchParams, router } from 'expo-router';
import {
  User,
  Mail,
  Calendar,
  Crown,
  Shield,
  CreditCard,
  X,
  Check,
  AlertTriangle,
  Trash2,
  ChevronLeft,
  Gift,
  Ban,
  Clock,
  Copy,
  Settings,
  Activity,
  LogIn,
} from 'lucide-react-native';
import adminUsers, { AdminUser, OpenpayPayment } from '../../../services/admin/users';
import { getUserCards } from '../../../services/admin/users';
import * as Haptics from '../../../lib/haptics';
import * as Clipboard from 'expo-clipboard';
import { supabase } from '../../../lib/supabase';

// ============================================================================
// COLORS
// ============================================================================
const COLORS = {
  red: '#DC2626',
  green: '#22C55E',
  purple: '#8B5CF6',
  orange: '#F97316',
  yellow: '#EAB308',
  white: '#FFFFFF',
  zinc400: '#A1A1AA',
  zinc500: '#71717A',
  zinc700: '#3F3F46',
  zinc800: '#27272a',
};

// ============================================================================
// INFO ROW COMPONENT
// ============================================================================
function InfoRow({
  icon: Icon,
  label,
  value,
  color = COLORS.zinc400,
  copyable = false,
}: {
  icon: any;
  label: string;
  value: string;
  color?: string;
  copyable?: boolean;
}) {
  const handleCopy = async () => {
    await Clipboard.setStringAsync(value);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    if (Platform.OS !== 'web') {
      Alert.alert('Copiado', value);
    }
  };

  return (
    <View className="flex-row items-center py-3 border-b border-zinc-800">
      <Icon size={18} color={color} />
      <Text className="text-zinc-500 text-sm ml-3 w-24">{label}</Text>
      <Text className="text-white flex-1 font-mono text-sm" numberOfLines={1}>
        {value}
      </Text>
      {copyable && (
        <TouchableOpacity onPress={handleCopy} className="p-2">
          <Copy size={16} color={COLORS.zinc400} />
        </TouchableOpacity>
      )}
    </View>
  );
}

// ============================================================================
// ACTION BUTTON COMPONENT
// ============================================================================
function ActionButton({
  icon: Icon,
  label,
  color,
  onPress,
  destructive = false,
  loading = false,
}: {
  icon: any;
  label: string;
  color: string;
  onPress: () => void;
  destructive?: boolean;
  loading?: boolean;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={loading}
      className={`flex-row items-center p-4 rounded-xl mb-2 ${
        destructive ? 'bg-red-600/10 border border-red-600/30' : 'bg-zinc-800'
      }`}
      activeOpacity={0.7}
    >
      {loading ? (
        <ActivityIndicator size="small" color={color} />
      ) : (
        <Icon size={20} color={color} />
      )}
      <Text className={`font-bold ml-3 flex-1 ${destructive ? 'text-red-400' : 'text-white'}`}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

// ============================================================================
// PAYMENT CARD COMPONENT
// ============================================================================
function PaymentCard({ payment }: { payment: OpenpayPayment }) {
  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('es-PE', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return COLORS.green;
      case 'pending':
        return COLORS.yellow;
      case 'failed':
        return COLORS.red;
      case 'past_due':
        return COLORS.orange;
      default:
        return COLORS.zinc400;
    }
  };

  return (
    <View className="bg-zinc-800 rounded-xl p-4 mb-2">
      <View className="flex-row items-center justify-between mb-2">
        <View className="flex-row items-center">
          <CreditCard size={16} color={COLORS.zinc400} />
          <Text className="text-zinc-400 text-xs font-mono ml-2">
            •••• {payment.card?.last4 || '****'}
          </Text>
        </View>
        <View
          className="px-2 py-1 rounded"
          style={{ backgroundColor: `${getStatusColor(payment.status)}20` }}
        >
          <Text style={{ color: getStatusColor(payment.status) }} className="text-xs font-mono">
            {payment.status?.toUpperCase()}
          </Text>
        </View>
      </View>
      <View className="flex-row items-center justify-between">
        <Text className="text-white font-bold text-lg">S/ {payment.amount?.toFixed(2)}</Text>
        <Text className="text-zinc-500 text-xs font-mono">{formatDate(payment.creation_date)}</Text>
      </View>
      {payment.description && (
        <Text className="text-zinc-500 text-xs mt-1" numberOfLines={1}>
          {payment.description}
        </Text>
      )}
    </View>
  );
}

// ============================================================================
// ROLE CHANGE MODAL
// ============================================================================
function RoleChangeModal({
  visible,
  onClose,
  currentRole,
  onChangeRole,
  loading,
}: {
  visible: boolean;
  onClose: () => void;
  currentRole: string;
  onChangeRole: (role: string) => void;
  loading: boolean;
}) {
  const roles = [
    { id: 'free', label: 'Free', icon: User, color: COLORS.zinc400 },
    { id: 'pro', label: 'PRO', icon: Crown, color: COLORS.purple },
    { id: 'admin', label: 'Admin', icon: Shield, color: COLORS.orange },
  ];

  return (
    <Modal visible={visible} transparent animationType="fade">
      <TouchableOpacity
        className="flex-1 bg-black/80 justify-center items-center px-6"
        activeOpacity={1}
        onPress={onClose}
      >
        <View className="bg-zinc-900 rounded-2xl p-6 w-full max-w-sm">
          <View className="flex-row items-center justify-between mb-6">
            <Text className="text-white text-xl font-bold">Cambiar Rol</Text>
            <TouchableOpacity onPress={onClose}>
              <X size={24} color={COLORS.zinc400} />
            </TouchableOpacity>
          </View>

          {roles.map((role) => (
            <TouchableOpacity
              key={role.id}
              className={`flex-row items-center p-4 rounded-xl mb-2 ${
                currentRole === role.id ? 'bg-red-600/20 border border-red-600' : 'bg-zinc-800'
              }`}
              onPress={() => onChangeRole(role.id)}
              disabled={loading}
            >
              {loading && currentRole !== role.id ? (
                <ActivityIndicator size="small" color={role.color} />
              ) : (
                <role.icon size={20} color={role.color} />
              )}
              <Text className="text-white font-bold ml-3 flex-1">{role.label}</Text>
              {currentRole === role.id && <Check size={20} color={COLORS.red} />}
            </TouchableOpacity>
          ))}
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

// ============================================================================
// GRANT PRO MODAL
// ============================================================================
function GrantProModal({
  visible,
  onClose,
  onGrant,
  loading,
}: {
  visible: boolean;
  onClose: () => void;
  onGrant: (days: number) => void;
  loading: boolean;
}) {
  const [days, setDays] = useState('30');
  const presets = [7, 15, 30, 90, 365];

  return (
    <Modal visible={visible} transparent animationType="fade">
      <TouchableOpacity
        className="flex-1 bg-black/80 justify-center items-center px-6"
        activeOpacity={1}
        onPress={onClose}
      >
        <View className="bg-zinc-900 rounded-2xl p-6 w-full max-w-sm">
          <View className="flex-row items-center justify-between mb-6">
            <Text className="text-white text-xl font-bold">Otorgar PRO</Text>
            <TouchableOpacity onPress={onClose}>
              <X size={24} color={COLORS.zinc400} />
            </TouchableOpacity>
          </View>

          <Text className="text-zinc-400 mb-4">Duración (días):</Text>

          <View className="flex-row flex-wrap gap-2 mb-4">
            {presets.map((d) => (
              <TouchableOpacity
                key={d}
                className={`px-4 py-2 rounded-lg ${
                  parseInt(days) === d ? 'bg-purple-600' : 'bg-zinc-800'
                }`}
                onPress={() => setDays(d.toString())}
              >
                <Text className="text-white font-mono">{d}d</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View className="flex-row items-center bg-zinc-800 rounded-xl px-4 mb-6">
            <TextInput
              className="flex-1 text-white py-4 font-mono text-center text-xl"
              value={days}
              onChangeText={setDays}
              keyboardType="number-pad"
              placeholder="30"
              placeholderTextColor={COLORS.zinc500}
            />
            <Text className="text-zinc-400">días</Text>
          </View>

          <TouchableOpacity
            className="bg-purple-600 py-4 rounded-xl flex-row items-center justify-center"
            onPress={() => onGrant(parseInt(days) || 30)}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator size="small" color="white" />
            ) : (
              <>
                <Gift size={20} color="white" />
                <Text className="text-white font-bold ml-2">Otorgar PRO</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================
export default function UsuarioDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [user, setUser] = useState<AdminUser | null>(null);
  const [payments, setPayments] = useState<OpenpayPayment[]>([]);
  const [userCards, setUserCards] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Modals
  const [roleModalVisible, setRoleModalVisible] = useState(false);
  const [grantProModalVisible, setGrantProModalVisible] = useState(false);

  // -------------------------------------------------------------------------
  // FETCH USER
  // -------------------------------------------------------------------------
  const fetchUser = useCallback(async () => {
    if (!id) return;
    try {
      setError(null);
      const userData = await adminUsers.getUser(id);
      setUser(userData);

      // Fetch payments
      const paymentsData = await adminUsers.getPayments(id);
      setPayments(paymentsData);

      // Fetch saved cards
      try {
        const cardsData = await adminUsers.getUserCards(id);
        setUserCards(cardsData);
      } catch (e) {
        console.warn('No cards found:', e);
      }
    } catch (err: any) {
      console.error('Error fetching user:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  // -------------------------------------------------------------------------
  // ACTIONS
  // -------------------------------------------------------------------------
  const handleChangeRole = async (newRole: string) => {
    if (!id || !user) return;
    setActionLoading(true);
    try {
      await adminUsers.updateUserRole(id, newRole as any);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setUser({ ...user, role: newRole as any });
      setRoleModalVisible(false);
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleGrantPro = async (days: number) => {
    if (!id || !user) return;
    setActionLoading(true);
    try {
      const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
      await adminUsers.grantPro(id, expiresAt);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setUser({ ...user, role: 'pro', pro_expires_at: expiresAt });
      setGrantProModalVisible(false);
      Alert.alert('Éxito', `PRO otorgado por ${days} días`);
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleRevokePro = async () => {
    if (!id || !user) return;
    Alert.alert('Revocar PRO', '¿Seguro que quieres quitar el acceso PRO a este usuario?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Revocar',
        style: 'destructive',
        onPress: async () => {
          setActionLoading(true);
          try {
            await adminUsers.revokePro(id);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            setUser({ ...user, role: 'free', pro_expires_at: undefined });
          } catch (err: any) {
            Alert.alert('Error', err.message);
          } finally {
            setActionLoading(false);
          }
        },
      },
    ]);
  };

  const handleCancelSubscription = async () => {
    if (!id || !user) return;
    Alert.alert(
      'Cancelar Suscripción',
      'Esto cancelará la suscripción en Openpay y cambiará el usuario a FREE. ¿Continuar?',
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Sí, cancelar',
          style: 'destructive',
          onPress: async () => {
            setActionLoading(true);
            try {
              await adminUsers.cancelSubscription(id);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              setUser({
                ...user,
                role: 'free',
                subscription: user.subscription
                  ? { ...user.subscription, status: 'cancelled' }
                  : undefined,
              });
              Alert.alert('Éxito', 'Suscripción cancelada');
            } catch (err: any) {
              Alert.alert('Error', err.message);
            } finally {
              setActionLoading(false);
            }
          },
        },
      ]
    );
  };

  const handleDeleteUser = async () => {
    if (!id) return;
    Alert.alert(
      '⚠️ Eliminar Usuario',
      'Esta acción es IRREVERSIBLE. Se eliminará:\n\n• Cuenta de usuario\n• Suscripción activa\n• Todos los datos\n\n¿Estás seguro?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'ELIMINAR',
          style: 'destructive',
          onPress: async () => {
            setActionLoading(true);
            try {
              await adminUsers.deleteUser(id);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              Alert.alert('Eliminado', 'El usuario ha sido eliminado');
              router.back();
            } catch (err: any) {
              Alert.alert('Error', err.message);
            } finally {
              setActionLoading(false);
            }
          },
        },
      ]
    );
  };

  // -------------------------------------------------------------------------
  // IMPERSONATE - Entrar como usuario
  // -------------------------------------------------------------------------
  const handleImpersonate = async () => {
    if (!id) return;
    Alert.alert(
      '🎭 Entrar como usuario',
      `Iniciarás sesión como ${user?.full_name || user?.email || 'este usuario'}.\n\n⚠️ Tu sesión de CEO se cerrará. Para volver, tendrás que iniciar sesión de nuevo con tu cuenta.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'ENTRAR',
          style: 'destructive',
          onPress: async () => {
            setActionLoading(true);
            try {
              const { token_hash, email } = await adminUsers.impersonateUser(id);

              // Verificar OTP para iniciar sesión como el usuario
              const { error: otpError } = await supabase.auth.verifyOtp({
                token_hash,
                type: 'magiclink',
              });

              if (otpError) throw otpError;

              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              // onAuthStateChange detectará el cambio y redirigirá automáticamente
              router.replace('/(tabs)/plan');
            } catch (err: any) {
              Alert.alert('Error', err.message);
            } finally {
              setActionLoading(false);
            }
          },
        },
      ]
    );
  };

  // -------------------------------------------------------------------------
  // FORMATTERS
  // -------------------------------------------------------------------------
  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('es-PE', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });
  };

  // -------------------------------------------------------------------------
  // RENDER
  // -------------------------------------------------------------------------
  if (loading) {
    return (
      <View className="flex-1 bg-black items-center justify-center">
        <ActivityIndicator size="large" color={COLORS.red} />
      </View>
    );
  }

  if (error || !user) {
    return (
      <View className="flex-1 bg-black items-center justify-center px-6">
        <AlertTriangle size={48} color={COLORS.red} />
        <Text className="text-white text-lg font-bold mt-4">Error</Text>
        <Text className="text-zinc-400 text-center mt-2">{error || 'Usuario no encontrado'}</Text>
        <TouchableOpacity
          className="bg-zinc-800 px-6 py-3 rounded-xl mt-6"
          onPress={() => router.back()}
        >
          <Text className="text-white font-bold">Volver</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const getRoleColor = () => {
    switch (user.role) {
      case 'ceo':
        return COLORS.red;
      case 'admin':
        return COLORS.orange;
      case 'pro':
        return COLORS.purple;
      default:
        return COLORS.zinc400;
    }
  };

  return (
    <View className="flex-1 bg-black">
      {/* Header */}
      <View className="bg-zinc-900 border-b border-zinc-800 px-4 py-4">
        <TouchableOpacity className="flex-row items-center mb-4" onPress={() => router.back()}>
          <ChevronLeft size={24} color={COLORS.zinc400} />
          <Text className="text-zinc-400 ml-1">Usuarios</Text>
        </TouchableOpacity>

        <View className="flex-row items-center">
          {/* Avatar */}
          <View className="w-20 h-20 bg-zinc-800 rounded-full overflow-hidden items-center justify-center">
            {user.avatar_url ? (
              <Image
                source={{ uri: user.avatar_url }}
                className="w-full h-full"
                resizeMode="cover"
              />
            ) : (
              <User size={40} color={COLORS.zinc400} />
            )}
          </View>

          {/* Info */}
          <View className="flex-1 ml-4">
            <View className="flex-row items-center gap-2">
              <Text className="text-white text-xl font-bold" numberOfLines={1}>
                {user.full_name || 'Sin nombre'}
              </Text>
            </View>
            <Text className="text-zinc-400 font-mono mt-1" numberOfLines={1}>
              {user.email}
            </Text>
            <View className="flex-row items-center mt-2 gap-2">
              <View
                className="px-3 py-1 rounded-full"
                style={{ backgroundColor: `${getRoleColor()}30` }}
              >
                <Text style={{ color: getRoleColor() }} className="text-xs font-mono font-bold">
                  {user.role?.toUpperCase()}
                </Text>
              </View>
              {user.subscription?.status === 'active' && (
                <View className="flex-row items-center bg-green-600/20 px-2 py-1 rounded-full">
                  <CreditCard size={12} color={COLORS.green} />
                  <Text className="text-green-400 text-xs font-mono ml-1">PAGANDO</Text>
                </View>
              )}
              {user.subscription?.status === 'past_due' && (
                <View className="flex-row items-center bg-yellow-600/20 px-2 py-1 rounded-full">
                  <CreditCard size={12} color={COLORS.yellow} />
                  <Text className="text-yellow-400 text-xs font-mono ml-1">PAGO PENDIENTE</Text>
                </View>
              )}
            </View>
          </View>
        </View>
      </View>

      <ScrollView className="flex-1 px-4" showsVerticalScrollIndicator={false}>
        {/* User Info */}
        <View className="bg-zinc-900 rounded-xl p-4 mt-4">
          <Text className="text-zinc-500 text-xs font-mono mb-2">INFORMACIÓN</Text>
          <InfoRow icon={Mail} label="Email" value={user.email} copyable />
          <InfoRow icon={Calendar} label="Registro" value={formatDate(user.created_at)} />
          <InfoRow
            icon={Activity}
            label="Frecuencia"
            value={`${user.training_frequency || 0} días/semana`}
          />
          {user.pro_expires_at && (
            <InfoRow
              icon={Clock}
              label="PRO hasta"
              value={formatDate(user.pro_expires_at)}
              color={COLORS.purple}
            />
          )}
        </View>

        {/* Subscription Info */}
        {user.subscription && (
          <View className="bg-zinc-900 rounded-xl p-4 mt-4">
            <Text className="text-zinc-500 text-xs font-mono mb-2">SUSCRIPCIÓN OPENPAY</Text>
            <InfoRow
              icon={CreditCard}
              label="Tarjeta"
              value={`${user.subscription.card_brand?.toUpperCase()} •••• ${user.subscription.card_last4}`}
            />
            <InfoRow
              icon={Activity}
              label="Estado"
              value={user.subscription.status?.toUpperCase() || 'DESCONOCIDO'}
              color={user.subscription.status === 'active' ? COLORS.green : COLORS.red}
            />
            {user.subscription.current_period_end && (
              <InfoRow
                icon={Calendar}
                label="Próximo cobro"
                value={formatDate(user.subscription.current_period_end)}
              />
            )}
            <InfoRow
              icon={Settings}
              label="ID Suscripción"
              value={user.subscription.openpay_subscription_id || 'N/A'}
              copyable
            />
          </View>
        )}

        {/* Actions */}
        <View className="mt-6">
          <Text className="text-zinc-500 text-xs font-mono mb-2 ml-1">ACCIONES</Text>

          <ActionButton
            icon={LogIn}
            label="Entrar como este usuario"
            color={COLORS.green}
            onPress={handleImpersonate}
            loading={actionLoading}
          />

          <ActionButton
            icon={Shield}
            label="Cambiar Rol"
            color={COLORS.orange}
            onPress={() => setRoleModalVisible(true)}
          />

          {user.role !== 'pro' && (
            <ActionButton
              icon={Gift}
              label="Otorgar PRO (gratis)"
              color={COLORS.purple}
              onPress={() => setGrantProModalVisible(true)}
            />
          )}

          {user.role === 'pro' && !user.subscription?.status && (
            <ActionButton
              icon={Ban}
              label="Revocar PRO"
              color={COLORS.yellow}
              onPress={handleRevokePro}
              loading={actionLoading}
            />
          )}

          {user.subscription?.status === 'active' && (
            <ActionButton
              icon={Ban}
              label="Cancelar Suscripción Openpay"
              color={COLORS.red}
              onPress={handleCancelSubscription}
              loading={actionLoading}
              destructive
            />
          )}

          {user.subscription?.status === 'past_due' && (
            <ActionButton
              icon={Ban}
              label="Cancelar Suscripción (Pago Pendiente)"
              color={COLORS.red}
              onPress={handleCancelSubscription}
              loading={actionLoading}
              destructive
            />
          )}

          <ActionButton
            icon={Trash2}
            label="Eliminar Usuario"
            color={COLORS.red}
            onPress={handleDeleteUser}
            loading={actionLoading}
            destructive
          />
        </View>

        {/* Saved Cards */}
        {userCards.length > 0 && (
          <View className="mt-6">
            <Text className="text-zinc-500 text-xs font-mono mb-2 ml-1">
              TARJETAS GUARDADAS ({userCards.length})
            </Text>
            {userCards.map((card: any) => (
              <View
                key={card.id}
                className={`bg-zinc-900 rounded-xl p-4 mb-2 flex-row items-center justify-between border ${
                  card.is_default ? 'border-orange-500/50' : 'border-zinc-800'
                }`}
              >
                <View className="flex-row items-center gap-3">
                  <CreditCard size={18} color={card.is_default ? COLORS.orange : COLORS.zinc400} />
                  <View>
                    <View className="flex-row items-center gap-2">
                      <Text className="text-white font-bold font-mono">
                        {card.brand?.toUpperCase() || 'TARJETA'} •••• {card.last4}
                      </Text>
                      {card.is_default && (
                        <View className="bg-orange-600/20 px-2 py-0.5 rounded-full">
                          <Text className="text-orange-400 text-[10px] font-bold">DEFAULT</Text>
                        </View>
                      )}
                    </View>
                    <Text className="text-zinc-500 text-xs font-mono">
                      {card.holder_name} · Exp {card.expiration_month}/{card.expiration_year}
                    </Text>
                  </View>
                </View>
                <TouchableOpacity
                  onPress={() => {
                    Alert.alert(
                      'Eliminar Tarjeta',
                      `¿Eliminar ${card.brand?.toUpperCase()} •••• ${card.last4}?`,
                      [
                        { text: 'Cancelar', style: 'cancel' },
                        {
                          text: 'Eliminar',
                          style: 'destructive',
                          onPress: async () => {
                            try {
                              await adminUsers.deleteUserCard(id!, card.id);
                              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                              setUserCards((prev) => prev.filter((c: any) => c.id !== card.id));
                            } catch (err: any) {
                              Alert.alert('Error', err.message);
                            }
                          },
                        },
                      ]
                    );
                  }}
                  className="p-2"
                >
                  <Trash2 size={16} color={COLORS.zinc400} />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        {/* Payment History */}
        {payments.length > 0 && (
          <View className="mt-6">
            <Text className="text-zinc-500 text-xs font-mono mb-2 ml-1">
              HISTORIAL DE PAGOS ({payments.length})
            </Text>
            {payments.map((payment) => (
              <PaymentCard key={payment.id} payment={payment} />
            ))}
          </View>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Modals */}
      <RoleChangeModal
        visible={roleModalVisible}
        onClose={() => setRoleModalVisible(false)}
        currentRole={user.role}
        onChangeRole={handleChangeRole}
        loading={actionLoading}
      />

      <GrantProModal
        visible={grantProModalVisible}
        onClose={() => setGrantProModalVisible(false)}
        onGrant={handleGrantPro}
        loading={actionLoading}
      />
    </View>
  );
}
