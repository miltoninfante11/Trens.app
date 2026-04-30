import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  RefreshControl,
  Image,
  Modal,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Link, useFocusEffect } from 'expo-router';
import {
  Search,
  User,
  Mail,
  Crown,
  ChevronRight,
  Filter,
  Shield,
  CreditCard,
  Users,
  X,
  Check,
  AlertTriangle,
  UserPlus,
  Lock,
  Phone,
  Eye,
  EyeOff,
  Sparkles,
  Calendar,
} from 'lucide-react-native';
import adminUsers, { AdminUser, AdminStats, CreateUserData } from '../../../services/admin/users';
import * as Haptics from '../../../lib/haptics';
import {
  PhoneInput,
  getDefaultCountry,
  getFullPhoneNumber,
  Country,
} from '../../../components/ui/PhoneInput';

// ============================================================================
// COLORS
// ============================================================================
const COLORS = {
  red: '#DC2626',
  blue: '#3B82F6',
  green: '#22C55E',
  purple: '#8B5CF6',
  orange: '#F97316',
  yellow: '#EAB308',
  white: '#FFFFFF',
  zinc400: '#A1A1AA',
  zinc500: '#71717A',
  zinc700: '#3F3F46',
  zinc800: '#27272a',
  zinc900: '#18181b',
};

// ============================================================================
// STAT CARD COMPONENT
// ============================================================================
function StatCard({
  title,
  value,
  icon: Icon,
  color,
  onPress,
  active,
}: {
  title: string;
  value: number;
  icon: any;
  color: string;
  onPress?: () => void;
  active?: boolean;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      className={`flex-1 bg-zinc-900 rounded-xl p-3 border ${
        active ? 'border-red-600' : 'border-zinc-800'
      }`}
    >
      <View className="flex-row items-center justify-between mb-2">
        <Icon size={18} color={color} />
        {active && <View className="w-2 h-2 bg-red-600 rounded-full" />}
      </View>
      <Text className="text-2xl font-bold text-white">{value}</Text>
      <Text className="text-zinc-500 text-xs font-mono">{title}</Text>
    </TouchableOpacity>
  );
}

// ============================================================================
// HELPERS
// ============================================================================
function getDaysRemaining(user: AdminUser): number | null {
  // For card subscriptions: use current_period_end
  if (user.subscription?.status === 'active' && user.subscription?.current_period_end) {
    const end = new Date(user.subscription.current_period_end);
    const now = new Date();
    return Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  }
  // For manual PRO/TEAM: use pro_expires_at
  if ((user.role === 'pro' || user.role === 'team') && user.pro_expires_at) {
    const end = new Date(user.pro_expires_at);
    const now = new Date();
    return Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  }
  return null;
}

function getDaysRemainingText(days: number | null): string | null {
  if (days === null) return null;
  if (days < 0) return 'Vencido';
  if (days === 0) return 'Vence hoy';
  if (days === 1) return 'Queda 1 día';
  return `Quedan ${days} días`;
}

type ProFilter = 'all' | 'card' | 'manual';

function sortByExpiration(users: AdminUser[]): AdminUser[] {
  return [...users].sort((a, b) => {
    const daysA = getDaysRemaining(a);
    const daysB = getDaysRemaining(b);
    // Users with expiration dates first, sorted by soonest
    if (daysA !== null && daysB !== null) return daysA - daysB;
    if (daysA !== null) return -1;
    if (daysB !== null) return 1;
    // Then by creation date (newest first)
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
}

// ============================================================================
// USER CARD COMPONENT
// ============================================================================
function UserCard({ user }: { user: AdminUser }) {
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('es-PE', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  };

  const getRoleBadgeStyle = (role: string) => {
    switch (role) {
      case 'ceo':
        return { bg: 'bg-red-600/30', text: 'text-red-400' };
      case 'admin':
        return { bg: 'bg-orange-600/30', text: 'text-orange-400' };
      case 'pro':
        return { bg: 'bg-purple-600/30', text: 'text-purple-400' };
      case 'team':
        return { bg: 'bg-fuchsia-600/30', text: 'text-fuchsia-400' };
      default:
        return { bg: 'bg-zinc-800', text: 'text-zinc-400' };
    }
  };

  const roleStyle = getRoleBadgeStyle(user.role);
  const daysLeft = getDaysRemaining(user);
  const daysText = getDaysRemainingText(daysLeft);

  return (
    <Link href={`/(admin)/usuarios/${user.id}`} asChild>
      <TouchableOpacity
        className="flex-row items-center bg-zinc-900 mx-4 my-1 p-4 rounded-xl border border-zinc-800"
        activeOpacity={0.7}
      >
        {/* Avatar */}
        <View className="w-12 h-12 bg-zinc-800 rounded-full overflow-hidden items-center justify-center">
          {user.avatar_url ? (
            <Image source={{ uri: user.avatar_url }} className="w-full h-full" resizeMode="cover" />
          ) : (
            <User size={24} color={COLORS.zinc400} />
          )}
        </View>

        {/* Info */}
        <View className="flex-1 ml-3">
          <View className="flex-row items-center gap-2">
            <Text className="text-white font-bold" numberOfLines={1}>
              {user.full_name || 'Sin nombre'}
            </Text>
            {user.role === 'pro' && <Crown size={14} color={COLORS.purple} />}
            {user.role === 'team' && <Crown size={14} color="#D946EF" />}
            {user.role === 'admin' && <Shield size={14} color={COLORS.orange} />}
            {user.role === 'ceo' && <Crown size={14} color={COLORS.red} />}
          </View>

          <View className="flex-row items-center mt-1">
            <Mail size={12} color={COLORS.zinc400} />
            <Text className="text-zinc-400 text-xs font-mono ml-1" numberOfLines={1}>
              {user.email}
            </Text>
          </View>

          <View className="flex-row items-center mt-1 gap-3">
            {user.subscription?.status === 'active' && (
              <View className="flex-row items-center">
                <CreditCard size={12} color={COLORS.green} />
                <Text className="text-green-400 text-xs font-mono ml-1">
                  •••• {user.subscription.card_last4}
                </Text>
              </View>
            )}

            {user.subscription?.status === 'past_due' && (
              <View className="flex-row items-center">
                <CreditCard size={12} color={COLORS.yellow} />
                <Text className="text-yellow-400 text-xs font-mono ml-1">PAGO PENDIENTE</Text>
              </View>
            )}

            {daysText && (
              <Text
                className={`text-xs font-mono font-bold ${
                  daysLeft !== null && daysLeft <= 3
                    ? 'text-red-400'
                    : daysLeft !== null && daysLeft <= 7
                      ? 'text-yellow-400'
                      : 'text-cyan-400'
                }`}
              >
                {daysText}
              </Text>
            )}
          </View>
        </View>

        {/* Role Badge */}
        <View className={`px-2 py-1 rounded ${roleStyle.bg}`}>
          <Text className={`text-xs font-mono font-bold ${roleStyle.text}`}>
            {user.role?.toUpperCase()}
          </Text>
        </View>

        <ChevronRight size={18} color={COLORS.zinc400} className="ml-2" />
      </TouchableOpacity>
    </Link>
  );
}

// ============================================================================
// FILTER MODAL
// ============================================================================
function FilterModal({
  visible,
  onClose,
  activeFilter,
  onSelectFilter,
}: {
  visible: boolean;
  onClose: () => void;
  activeFilter: string | null;
  onSelectFilter: (filter: string | null) => void;
}) {
  const filters = [
    { id: null, label: 'Todos', icon: Users, color: COLORS.white },
    { id: 'pro', label: 'PRO', icon: Crown, color: COLORS.purple },
    { id: 'free', label: 'Free', icon: User, color: COLORS.zinc400 },
    { id: 'admin', label: 'Admin', icon: Shield, color: COLORS.orange },
  ];

  return (
    <Modal visible={visible} transparent animationType="fade">
      <TouchableOpacity
        className="flex-1 bg-black/80 justify-end"
        activeOpacity={1}
        onPress={onClose}
      >
        <View className="bg-zinc-900 rounded-t-3xl p-6">
          <View className="flex-row items-center justify-between mb-6">
            <Text className="text-white text-xl font-bold">Filtrar por rol</Text>
            <TouchableOpacity onPress={onClose}>
              <X size={24} color={COLORS.zinc400} />
            </TouchableOpacity>
          </View>

          {filters.map((filter) => (
            <TouchableOpacity
              key={filter.id || 'all'}
              className={`flex-row items-center p-4 rounded-xl mb-2 ${
                activeFilter === filter.id ? 'bg-red-600/20 border border-red-600' : 'bg-zinc-800'
              }`}
              onPress={() => {
                onSelectFilter(filter.id);
                onClose();
              }}
            >
              <filter.icon size={20} color={filter.color} />
              <Text className="text-white font-bold ml-3 flex-1">{filter.label}</Text>
              {activeFilter === filter.id && <Check size={20} color={COLORS.red} />}
            </TouchableOpacity>
          ))}
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

// ============================================================================
// CREATE USER MODAL
// ============================================================================
function CreateUserModal({
  visible,
  onClose,
  onUserCreated,
}: {
  visible: boolean;
  onClose: () => void;
  onUserCreated: () => void;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [phoneCountry, setPhoneCountry] = useState<Country>(getDefaultCountry());
  const [role, setRole] = useState<'free' | 'pro' | 'admin'>('free');
  const [grantPro, setGrantPro] = useState(false);
  const [proMonths, setProMonths] = useState('1');
  const [proStartDate, setProStartDate] = useState('');
  const [proEndDate, setProEndDate] = useState('');
  const [showCustomDates, setShowCustomDates] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resetForm = () => {
    setEmail('');
    setPassword('');
    setFullName('');
    setPhone('');
    setPhoneCountry(getDefaultCountry());
    setRole('free');
    setGrantPro(false);
    setProMonths('1');
    setProStartDate('');
    setProEndDate('');
    setShowCustomDates(false);
    setError(null);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const generatePassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%';
    let result = '';
    for (let i = 0; i < 12; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setPassword(result);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const validateForm = (): string | null => {
    if (!email.trim()) return 'El email es requerido';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Email inválido';
    if (!password) return 'La contraseña es requerida';
    if (password.length < 6) return 'La contraseña debe tener al menos 6 caracteres';
    return null;
  };

  const handleCreate = async () => {
    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Calcular fecha de expiración PRO
      let proExpiresAt: string | undefined;
      if (grantPro || role === 'pro') {
        if (showCustomDates && proEndDate) {
          const parts = proEndDate.split('/');
          if (parts.length === 3) {
            const d = new Date(`${parts[2]}-${parts[1]}-${parts[0]}T23:59:59`);
            if (!isNaN(d.getTime())) proExpiresAt = d.toISOString();
          }
        }
        if (!proExpiresAt) {
          const months = parseInt(proMonths) || 1;
          const startDate =
            showCustomDates && proStartDate
              ? (() => {
                  const parts = proStartDate.split('/');
                  if (parts.length === 3) {
                    const d = new Date(`${parts[2]}-${parts[1]}-${parts[0]}T00:00:00`);
                    if (!isNaN(d.getTime())) return d;
                  }
                  return new Date();
                })()
              : new Date();
          startDate.setMonth(startDate.getMonth() + months);
          proExpiresAt = startDate.toISOString();
        }
      }

      const createData: CreateUserData = {
        email: email.trim().toLowerCase(),
        password,
        fullName: fullName.trim() || undefined,
        phone: phone.trim() ? getFullPhoneNumber(phoneCountry, phone) : undefined,
        role: grantPro ? 'pro' : role,
        grantPro,
        proExpiresAt,
      };

      await adminUsers.createUser(createData);

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      handleClose();
      onUserCreated();
    } catch (err: any) {
      console.error('Error creating user:', err);
      setError(err.message || 'Error al crear usuario');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setLoading(false);
    }
  };

  const roles = [
    { id: 'free', label: 'Free', icon: User, color: COLORS.zinc400 },
    { id: 'pro', label: 'PRO', icon: Crown, color: COLORS.purple },
    { id: 'admin', label: 'Admin', icon: Shield, color: COLORS.orange },
  ];

  return (
    <Modal visible={visible} transparent animationType="slide">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1"
      >
        <View className="flex-1 bg-black/90 justify-end">
          <View className="bg-zinc-900 rounded-t-3xl max-h-[90%]">
            {/* Header */}
            <View className="flex-row items-center justify-between p-6 border-b border-zinc-800">
              <View className="flex-row items-center gap-3">
                <View className="w-10 h-10 bg-red-600/20 rounded-full items-center justify-center">
                  <UserPlus size={20} color={COLORS.red} />
                </View>
                <View>
                  <Text className="text-white text-xl font-bold">Crear Usuario</Text>
                  <Text className="text-zinc-500 text-xs font-mono">Registro manual</Text>
                </View>
              </View>
              <TouchableOpacity onPress={handleClose} disabled={loading}>
                <X size={24} color={COLORS.zinc400} />
              </TouchableOpacity>
            </View>

            <ScrollView className="p-6" keyboardShouldPersistTaps="handled">
              {/* Error */}
              {error && (
                <View className="bg-red-600/20 border border-red-600 rounded-xl p-4 mb-4 flex-row items-center">
                  <AlertTriangle size={18} color={COLORS.red} />
                  <Text className="text-red-400 ml-3 flex-1">{error}</Text>
                </View>
              )}

              {/* Email */}
              <View className="mb-4">
                <Text className="text-zinc-400 text-sm font-mono mb-2">Email *</Text>
                <View className="flex-row items-center bg-zinc-800 rounded-xl px-4 py-3 border border-zinc-700">
                  <Mail size={18} color={COLORS.zinc400} />
                  <TextInput
                    className="flex-1 text-white ml-3 font-mono"
                    placeholder="usuario@email.com"
                    placeholderTextColor={COLORS.zinc500}
                    value={email}
                    onChangeText={setEmail}
                    autoCapitalize="none"
                    keyboardType="email-address"
                    autoComplete="email"
                    editable={!loading}
                  />
                </View>
              </View>

              {/* Password */}
              <View className="mb-4">
                <Text className="text-zinc-400 text-sm font-mono mb-2">Contraseña *</Text>
                <View className="flex-row items-center bg-zinc-800 rounded-xl px-4 py-3 border border-zinc-700">
                  <Lock size={18} color={COLORS.zinc400} />
                  <TextInput
                    className="flex-1 text-white ml-3 font-mono"
                    placeholder="Mínimo 6 caracteres"
                    placeholderTextColor={COLORS.zinc500}
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    editable={!loading}
                  />
                  <TouchableOpacity onPress={() => setShowPassword(!showPassword)} className="p-1">
                    {showPassword ? (
                      <EyeOff size={18} color={COLORS.zinc400} />
                    ) : (
                      <Eye size={18} color={COLORS.zinc400} />
                    )}
                  </TouchableOpacity>
                </View>
                <TouchableOpacity
                  onPress={generatePassword}
                  className="flex-row items-center mt-2"
                  disabled={loading}
                >
                  <Sparkles size={14} color={COLORS.blue} />
                  <Text className="text-blue-400 text-xs font-mono ml-1">
                    Generar contraseña segura
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Full Name */}
              <View className="mb-4">
                <Text className="text-zinc-400 text-sm font-mono mb-2">Nombre completo</Text>
                <View className="flex-row items-center bg-zinc-800 rounded-xl px-4 py-3 border border-zinc-700">
                  <User size={18} color={COLORS.zinc400} />
                  <TextInput
                    className="flex-1 text-white ml-3 font-mono"
                    placeholder="Juan Pérez"
                    placeholderTextColor={COLORS.zinc500}
                    value={fullName}
                    onChangeText={setFullName}
                    autoCapitalize="words"
                    editable={!loading}
                  />
                </View>
              </View>

              {/* Phone */}
              <View className="mb-4">
                <Text className="text-zinc-400 text-sm font-mono mb-2">Teléfono</Text>
                <PhoneInput
                  value={phone}
                  onChangeText={setPhone}
                  selectedCountry={phoneCountry}
                  onCountryChange={setPhoneCountry}
                  placeholder="999 999 999"
                  disabled={loading}
                />
              </View>

              {/* Role Selection */}
              <View className="mb-4">
                <Text className="text-zinc-400 text-sm font-mono mb-2">Rol inicial</Text>
                <View className="flex-row gap-2">
                  {roles.map((r) => (
                    <TouchableOpacity
                      key={r.id}
                      className={`flex-1 flex-row items-center justify-center p-3 rounded-xl border ${
                        role === r.id
                          ? 'bg-zinc-700 border-zinc-500'
                          : 'bg-zinc-800 border-zinc-700'
                      }`}
                      onPress={() => {
                        setRole(r.id as any);
                        if (r.id === 'pro') setGrantPro(true);
                        else setGrantPro(false);
                      }}
                      disabled={loading}
                    >
                      <r.icon size={16} color={r.color} />
                      <Text
                        className={`ml-2 font-mono text-sm ${
                          role === r.id ? 'text-white font-bold' : 'text-zinc-400'
                        }`}
                      >
                        {r.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Grant PRO Options */}
              {(role === 'pro' || grantPro) && (
                <View className="mb-4 bg-purple-600/10 border border-purple-600/30 rounded-xl p-4">
                  <View className="flex-row items-center justify-between mb-3">
                    <View className="flex-row items-center">
                      <Crown size={18} color={COLORS.purple} />
                      <Text className="text-purple-400 font-bold ml-2">Membresía PRO</Text>
                    </View>
                  </View>

                  <Text className="text-zinc-400 text-xs font-mono mb-2">DURACIÓN PREDEFINIDA</Text>
                  <View className="flex-row gap-2 mb-4">
                    {['1', '3', '6', '12'].map((months) => (
                      <TouchableOpacity
                        key={months}
                        className={`flex-1 p-3 rounded-xl items-center ${
                          !showCustomDates && proMonths === months
                            ? 'bg-purple-600/30 border border-purple-500'
                            : 'bg-zinc-800 border border-zinc-700'
                        }`}
                        onPress={() => {
                          setProMonths(months);
                          setShowCustomDates(false);
                        }}
                        disabled={loading}
                      >
                        <Text
                          className={`font-bold ${
                            !showCustomDates && proMonths === months
                              ? 'text-purple-400'
                              : 'text-zinc-400'
                          }`}
                        >
                          {months}
                        </Text>
                        <Text className="text-zinc-500 text-xs">
                          {months === '1' ? 'mes' : 'meses'}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  {/* Divider */}
                  <View className="flex-row items-center gap-3 mb-4">
                    <View className="flex-1 h-px bg-zinc-700" />
                    <Text className="text-zinc-500 text-xs font-mono">O FECHAS EXACTAS</Text>
                    <View className="flex-1 h-px bg-zinc-700" />
                  </View>

                  {/* Start Date */}
                  <Text className="text-zinc-400 text-xs font-mono mb-2">FECHA DE INICIO</Text>
                  <TouchableOpacity
                    className={`flex-row items-center bg-zinc-800 rounded-xl px-4 py-3 mb-3 border ${
                      showCustomDates ? 'border-purple-500' : 'border-zinc-700'
                    }`}
                    onPress={() => setShowCustomDates(true)}
                  >
                    <Calendar size={18} color={showCustomDates ? COLORS.purple : COLORS.zinc400} />
                    <TextInput
                      className="flex-1 text-white font-mono text-base ml-3"
                      value={proStartDate}
                      onChangeText={(text) => {
                        const digits = text.replace(/\D/g, '');
                        let f = '';
                        if (digits.length > 0) f = digits.substring(0, 2);
                        if (digits.length > 2) f += '/' + digits.substring(2, 4);
                        if (digits.length > 4) f += '/' + digits.substring(4, 8);
                        setProStartDate(f);
                        setShowCustomDates(true);
                      }}
                      onFocus={() => setShowCustomDates(true)}
                      placeholder="DD/MM/AAAA (hoy por defecto)"
                      placeholderTextColor={COLORS.zinc500}
                      keyboardType="number-pad"
                      maxLength={10}
                    />
                  </TouchableOpacity>

                  {/* End Date */}
                  <Text className="text-zinc-400 text-xs font-mono mb-2">FECHA DE FIN</Text>
                  <TouchableOpacity
                    className={`flex-row items-center bg-zinc-800 rounded-xl px-4 py-3 mb-3 border ${
                      showCustomDates ? 'border-purple-500' : 'border-zinc-700'
                    }`}
                    onPress={() => setShowCustomDates(true)}
                  >
                    <Calendar size={18} color={showCustomDates ? COLORS.purple : COLORS.zinc400} />
                    <TextInput
                      className="flex-1 text-white font-mono text-base ml-3"
                      value={proEndDate}
                      onChangeText={(text) => {
                        const digits = text.replace(/\D/g, '');
                        let f = '';
                        if (digits.length > 0) f = digits.substring(0, 2);
                        if (digits.length > 2) f += '/' + digits.substring(2, 4);
                        if (digits.length > 4) f += '/' + digits.substring(4, 8);
                        setProEndDate(f);
                        setShowCustomDates(true);
                      }}
                      onFocus={() => setShowCustomDates(true)}
                      placeholder="DD/MM/AAAA"
                      placeholderTextColor={COLORS.zinc500}
                      keyboardType="number-pad"
                      maxLength={10}
                    />
                  </TouchableOpacity>
                </View>
              )}

              {/* Create Button */}
              <TouchableOpacity
                className={`mt-4 py-4 rounded-xl flex-row items-center justify-center ${
                  loading ? 'bg-zinc-700' : 'bg-red-600'
                }`}
                onPress={handleCreate}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator size="small" color={COLORS.white} />
                ) : (
                  <>
                    <UserPlus size={20} color={COLORS.white} />
                    <Text className="text-white font-bold ml-2">Crear Usuario</Text>
                  </>
                )}
              </TouchableOpacity>

              {/* Info */}
              <Text className="text-zinc-600 text-xs text-center mt-4 font-mono">
                El usuario recibirá acceso inmediato con las credenciales proporcionadas.
                {'\n'}El email será confirmado automáticamente.
              </Text>

              <View className="h-10" />
            </ScrollView>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================
export default function AdminUsuariosScreen() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [stats, setStats] = useState<AdminStats>({
    total: 0,
    pro: 0,
    team: 0,
    free: 0,
    admin: 0,
    withSubscription: 0,
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [roleFilter, setRoleFilter] = useState<string | null>(null);
  const [proFilter, setProFilter] = useState<ProFilter>('all');
  const [filterModalVisible, setFilterModalVisible] = useState(false);
  const [createModalVisible, setCreateModalVisible] = useState(false);

  // Computed: filtered + sorted users
  const filteredUsers = useMemo(() => {
    let filtered = users;
    if (proFilter === 'card') {
      filtered = filtered.filter(
        (u) => u.subscription?.status === 'active' || u.subscription?.status === 'past_due'
      );
    } else if (proFilter === 'manual') {
      filtered = filtered.filter((u) => u.role === 'team');
    }
    return sortByExpiration(filtered);
  }, [users, proFilter]);

  // Counts for filter tabs
  const filterCounts = useMemo(() => {
    const withCard = users.filter(
      (u) => u.subscription?.status === 'active' || u.subscription?.status === 'past_due'
    ).length;
    const manual = users.filter((u) => u.role === 'team').length;
    return { all: users.length, card: withCard, manual };
  }, [users]);

  // -------------------------------------------------------------------------
  // FETCH USERS
  // -------------------------------------------------------------------------
  const fetchUsers = useCallback(async () => {
    try {
      setError(null);
      const result = await adminUsers.listUsers({
        role: roleFilter || undefined,
        search: searchQuery || undefined,
      });
      setUsers(result.users);
      setStats(result.stats);
    } catch (err: any) {
      console.error('Error fetching users:', err);
      setError(err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [roleFilter, searchQuery]);

  // Refrescar cuando la pantalla vuelve a tener foco
  useFocusEffect(
    useCallback(() => {
      fetchUsers();
    }, [fetchUsers])
  );

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchQuery.length >= 2 || searchQuery === '') {
        fetchUsers();
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // -------------------------------------------------------------------------
  // HANDLERS
  // -------------------------------------------------------------------------
  const handleRefresh = () => {
    setRefreshing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    fetchUsers();
  };

  const handleFilterByRole = (role: string | null) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setRoleFilter(role);
  };

  // -------------------------------------------------------------------------
  // RENDER
  // -------------------------------------------------------------------------
  if (loading) {
    return (
      <View className="flex-1 bg-black items-center justify-center">
        <ActivityIndicator size="large" color={COLORS.red} />
        <Text className="text-zinc-400 mt-4">Cargando usuarios...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View className="flex-1 bg-black items-center justify-center px-6">
        <AlertTriangle size={48} color={COLORS.red} />
        <Text className="text-white text-lg font-bold mt-4 text-center">Error</Text>
        <Text className="text-zinc-400 text-center mt-2">{error}</Text>
        <TouchableOpacity className="bg-red-600 px-6 py-3 rounded-xl mt-6" onPress={fetchUsers}>
          <Text className="text-white font-bold">Reintentar</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-black">
      {/* Stats Header */}
      <View className="px-4 pt-4 pb-3 bg-zinc-900/50 border-b border-zinc-800">
        <View className="flex-row gap-2 mb-4">
          <StatCard
            title="TOTAL"
            value={stats.total}
            icon={Users}
            color={COLORS.white}
            onPress={() => handleFilterByRole(null)}
            active={roleFilter === null}
          />
          <StatCard
            title="PRO"
            value={stats.pro}
            icon={Crown}
            color={COLORS.purple}
            onPress={() => handleFilterByRole('pro')}
            active={roleFilter === 'pro'}
          />
          <StatCard
            title="FREE"
            value={stats.free}
            icon={User}
            color={COLORS.zinc400}
            onPress={() => handleFilterByRole('free')}
            active={roleFilter === 'free'}
          />
          <StatCard
            title="PAGANDO"
            value={stats.withSubscription}
            icon={CreditCard}
            color={COLORS.green}
          />
        </View>

        {/* Search & Filter */}
        <View className="flex-row gap-2">
          <View className="flex-1 flex-row items-center bg-zinc-800 rounded-xl px-4 py-3">
            <Search size={18} color={COLORS.zinc400} />
            <TextInput
              className="flex-1 text-white ml-3 font-mono"
              placeholder="Buscar por nombre o email..."
              placeholderTextColor={COLORS.zinc500}
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoCapitalize="none"
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <X size={18} color={COLORS.zinc400} />
              </TouchableOpacity>
            )}
          </View>

          <TouchableOpacity
            className={`w-12 h-12 rounded-xl items-center justify-center ${
              roleFilter ? 'bg-red-600' : 'bg-zinc-800'
            }`}
            onPress={() => setFilterModalVisible(true)}
          >
            <Filter size={20} color={COLORS.white} />
          </TouchableOpacity>

          {/* Create User Button */}
          <TouchableOpacity
            className="w-12 h-12 rounded-xl items-center justify-center bg-red-600"
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              setCreateModalVisible(true);
            }}
          >
            <UserPlus size={20} color={COLORS.white} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Filter Tabs: Todos / Con Tarjeta / PRO Manual */}
      <View className="px-4 pt-3 pb-1">
        <View className="flex-row gap-2">
          {[
            { key: 'all' as ProFilter, label: 'Todos', count: filterCounts.all, color: 'zinc' },
            {
              key: 'card' as ProFilter,
              label: 'Con Tarjeta',
              count: filterCounts.card,
              color: 'green',
            },
            {
              key: 'manual' as ProFilter,
              label: 'TEAM',
              count: filterCounts.manual,
              color: 'purple',
            },
          ].map((tab) => {
            const active = proFilter === tab.key;
            return (
              <TouchableOpacity
                key={tab.key}
                className={`flex-1 py-2 rounded-lg items-center border ${
                  active
                    ? tab.color === 'green'
                      ? 'bg-green-600/20 border-green-600/50'
                      : tab.color === 'purple'
                        ? 'bg-purple-600/20 border-purple-600/50'
                        : 'bg-zinc-700/50 border-zinc-600'
                    : 'bg-zinc-900 border-zinc-800'
                }`}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setProFilter(tab.key);
                }}
              >
                <Text
                  className={`text-xs font-bold font-mono ${
                    active
                      ? tab.color === 'green'
                        ? 'text-green-400'
                        : tab.color === 'purple'
                          ? 'text-purple-400'
                          : 'text-white'
                      : 'text-zinc-500'
                  }`}
                >
                  {tab.label}
                </Text>
                <Text
                  className={`text-xs font-mono ${
                    active
                      ? tab.color === 'green'
                        ? 'text-green-500'
                        : tab.color === 'purple'
                          ? 'text-purple-500'
                          : 'text-zinc-400'
                      : 'text-zinc-600'
                  }`}
                >
                  {tab.count}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Results count */}
      <View className="px-4 py-2 flex-row items-center justify-between">
        <Text className="text-zinc-500 text-sm font-mono">
          {filteredUsers.length} usuario{filteredUsers.length !== 1 ? 's' : ''}
          {roleFilter && ` • ${roleFilter.toUpperCase()}`}
        </Text>
        {roleFilter && (
          <TouchableOpacity onPress={() => setRoleFilter(null)}>
            <Text className="text-red-400 text-sm font-mono">Limpiar filtro</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* User List */}
      <ScrollView
        className="flex-1"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={COLORS.red}
          />
        }
      >
        {filteredUsers.length === 0 ? (
          <View className="items-center justify-center py-20">
            <Users size={48} color={COLORS.zinc700} />
            <Text className="text-zinc-500 mt-4">No se encontraron usuarios</Text>
          </View>
        ) : (
          filteredUsers.map((user) => <UserCard key={user.id} user={user} />)
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Filter Modal */}
      <FilterModal
        visible={filterModalVisible}
        onClose={() => setFilterModalVisible(false)}
        activeFilter={roleFilter}
        onSelectFilter={handleFilterByRole}
      />

      {/* Create User Modal */}
      <CreateUserModal
        visible={createModalVisible}
        onClose={() => setCreateModalVisible(false)}
        onUserCreated={() => {
          fetchUsers();
        }}
      />
    </View>
  );
}
