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
  FlatList,
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
  Dumbbell,
  Search,
  Target,
  ChevronDown,
  ChevronUp,
  BadgeCheck,
} from 'lucide-react-native';
import adminUsers, { AdminUser, OpenpayPayment } from '../../../services/admin/users';
import {
  listActiveTemplates,
  assignPlanToUser,
  getUserCurrentPlan,
  clonePlanFromUser,
  ClonePlanType,
  TrainingTemplate,
} from '../../../services/admin/plans';
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
    { id: 'team', label: 'TEAM', icon: Crown, color: '#D946EF' },
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
// ASSIGN PLAN MODAL
// ============================================================================
function AssignPlanModal({
  visible,
  onClose,
  onAssign,
  loading,
  currentPlan,
}: {
  visible: boolean;
  onClose: () => void;
  onAssign: (templateId: string) => void;
  loading: boolean;
  currentPlan: {
    frequency: number;
    routineNames: Record<string, string>;
    planSource?: string;
  } | null;
}) {
  const [templates, setTemplates] = useState<TrainingTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFrequency, setSelectedFrequency] = useState<number | null>(null);
  const [expandedTemplate, setExpandedTemplate] = useState<string | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      fetchTemplates();
      setSelectedTemplate(null);
      setSearchQuery('');
      setExpandedTemplate(null);
    }
  }, [visible]);

  const fetchTemplates = async () => {
    setLoadingTemplates(true);
    try {
      const data = await listActiveTemplates();
      setTemplates(data);
    } catch (err: any) {
      console.error('Error loading templates:', err);
    } finally {
      setLoadingTemplates(false);
    }
  };

  // Agrupar por frecuencia
  const frequencies = [...new Set(templates.map((t) => t.frequency))].sort();

  // Filtrar
  const filteredTemplates = templates.filter((t) => {
    const matchFreq = selectedFrequency === null || t.frequency === selectedFrequency;
    const matchSearch =
      !searchQuery ||
      t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.target_goals?.some((g) => g.toLowerCase().includes(searchQuery.toLowerCase())) ||
      t.target_levels?.some((l) => l.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchFreq && matchSearch;
  });

  // Agrupar los filtrados por frecuencia
  const grouped = filteredTemplates.reduce(
    (acc, t) => {
      const key = t.frequency;
      if (!acc[key]) acc[key] = [];
      acc[key].push(t);
      return acc;
    },
    {} as Record<number, TrainingTemplate[]>
  );

  const getGoalColor = (goal: string) => {
    switch (goal.toUpperCase()) {
      case 'HIPERTROFIA':
        return '#8B5CF6';
      case 'FUERZA':
        return '#DC2626';
      case 'RESISTENCIA':
        return '#22C55E';
      case 'DEFINICION':
        return '#3B82F6';
      default:
        return '#A1A1AA';
    }
  };

  const getLevelColor = (level: string) => {
    switch (level.toUpperCase()) {
      case 'PRINCIPIANTE':
        return '#22C55E';
      case 'INTERMEDIO':
        return '#F97316';
      case 'AVANZADO':
        return '#DC2626';
      default:
        return '#A1A1AA';
    }
  };

  const totalExercises = (t: TrainingTemplate) =>
    t.days?.reduce((sum, d) => sum + (d.exercises?.length || 0), 0) || 0;

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View className="flex-1 bg-black/90">
        {/* Header */}
        <View className="bg-zinc-900 border-b border-zinc-800 px-4 pt-14 pb-4">
          <View className="flex-row items-center justify-between mb-4">
            <View className="flex-row items-center gap-3">
              <Dumbbell size={22} color={COLORS.red} />
              <Text className="text-white text-xl font-bold">Asignar Plan</Text>
            </View>
            <TouchableOpacity onPress={onClose} className="p-2">
              <X size={24} color={COLORS.zinc400} />
            </TouchableOpacity>
          </View>

          {/* Plan actual */}
          {currentPlan && (
            <View className="bg-zinc-800 rounded-xl p-3 mb-4 border border-zinc-700">
              <Text className="text-zinc-500 text-[10px] font-mono mb-1">PLAN ACTUAL</Text>
              <View className="flex-row items-center gap-2">
                <Text className="text-white font-bold text-sm">
                  {currentPlan.frequency} días/semana
                </Text>
                <View className="bg-zinc-700 px-2 py-0.5 rounded">
                  <Text className="text-zinc-400 text-[10px] font-mono">
                    {currentPlan.planSource?.toUpperCase() || 'MANUAL'}
                  </Text>
                </View>
              </View>
              <Text className="text-zinc-400 text-xs mt-1" numberOfLines={1}>
                {Object.values(currentPlan.routineNames).join(' → ')}
              </Text>
            </View>
          )}

          {/* Buscador */}
          <View className="flex-row items-center bg-zinc-800 rounded-xl px-4 py-3 border border-zinc-700">
            <Search size={18} color={COLORS.zinc400} />
            <TextInput
              className="flex-1 text-white text-base ml-3"
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Buscar plan..."
              placeholderTextColor={COLORS.zinc500}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <X size={16} color={COLORS.zinc400} />
              </TouchableOpacity>
            )}
          </View>

          {/* Filtro por frecuencia */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            className="mt-3"
            contentContainerStyle={{ gap: 8 }}
          >
            <TouchableOpacity
              className={`px-4 py-2 rounded-lg border ${
                selectedFrequency === null
                  ? 'bg-red-600 border-red-500'
                  : 'bg-zinc-800 border-zinc-700'
              }`}
              onPress={() => setSelectedFrequency(null)}
            >
              <Text
                className={`text-sm font-bold ${
                  selectedFrequency === null ? 'text-white' : 'text-zinc-400'
                }`}
              >
                Todos
              </Text>
            </TouchableOpacity>
            {frequencies.map((freq) => (
              <TouchableOpacity
                key={freq}
                className={`px-4 py-2 rounded-lg border ${
                  selectedFrequency === freq
                    ? 'bg-red-600 border-red-500'
                    : 'bg-zinc-800 border-zinc-700'
                }`}
                onPress={() => setSelectedFrequency(selectedFrequency === freq ? null : freq)}
              >
                <Text
                  className={`text-sm font-bold ${
                    selectedFrequency === freq ? 'text-white' : 'text-zinc-400'
                  }`}
                >
                  {freq} días
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Content */}
        {loadingTemplates ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator size="large" color={COLORS.red} />
            <Text className="text-zinc-500 mt-3 font-mono text-sm">Cargando planes...</Text>
          </View>
        ) : filteredTemplates.length === 0 ? (
          <View className="flex-1 items-center justify-center px-6">
            <Dumbbell size={48} color={COLORS.zinc700} />
            <Text className="text-zinc-500 mt-3 text-center">
              {searchQuery
                ? 'No se encontraron planes con esa búsqueda'
                : 'No hay planes activos disponibles'}
            </Text>
          </View>
        ) : (
          <ScrollView className="flex-1 px-4 pt-4" showsVerticalScrollIndicator={false}>
            {Object.entries(grouped)
              .sort(([a], [b]) => Number(a) - Number(b))
              .map(([freq, plans]) => (
                <View key={freq} className="mb-6">
                  {/* Encabezado de grupo */}
                  <View className="flex-row items-center gap-2 mb-3">
                    <View className="bg-red-600 w-1 h-5 rounded-full" />
                    <Text className="text-white font-bold text-lg">{freq} días/semana</Text>
                    <View className="bg-zinc-800 px-2 py-0.5 rounded-full">
                      <Text className="text-zinc-500 text-xs font-mono">{plans.length}</Text>
                    </View>
                  </View>

                  {plans.map((template) => {
                    const isSelected = selectedTemplate === template.id;
                    const isExpanded = expandedTemplate === template.id;

                    return (
                      <TouchableOpacity
                        key={template.id}
                        className={`bg-zinc-900 rounded-xl mb-2 border ${
                          isSelected ? 'border-red-500 bg-red-600/5' : 'border-zinc-800'
                        }`}
                        onPress={() => setSelectedTemplate(isSelected ? null : template.id)}
                        activeOpacity={0.7}
                      >
                        <View className="p-4">
                          {/* Info principal */}
                          <View className="flex-row items-start justify-between">
                            <View className="flex-1">
                              <View className="flex-row items-center gap-2">
                                {isSelected && (
                                  <View className="w-5 h-5 bg-red-600 rounded-full items-center justify-center">
                                    <Check size={12} color="white" />
                                  </View>
                                )}
                                <Text
                                  className={`font-bold text-base ${
                                    isSelected ? 'text-red-400' : 'text-white'
                                  }`}
                                >
                                  {template.name}
                                </Text>
                              </View>

                              {template.description && (
                                <Text
                                  className="text-zinc-500 text-xs mt-1"
                                  numberOfLines={isExpanded ? undefined : 1}
                                >
                                  {template.description}
                                </Text>
                              )}

                              {/* Tags */}
                              <View className="flex-row flex-wrap gap-1.5 mt-2">
                                {template.target_goals?.map((goal) => (
                                  <View
                                    key={goal}
                                    className="px-2 py-0.5 rounded"
                                    style={{ backgroundColor: `${getGoalColor(goal)}20` }}
                                  >
                                    <Text
                                      className="text-[10px] font-mono font-bold"
                                      style={{ color: getGoalColor(goal) }}
                                    >
                                      {goal}
                                    </Text>
                                  </View>
                                ))}
                                {template.target_levels?.map((level) => (
                                  <View
                                    key={level}
                                    className="px-2 py-0.5 rounded"
                                    style={{ backgroundColor: `${getLevelColor(level)}20` }}
                                  >
                                    <Text
                                      className="text-[10px] font-mono font-bold"
                                      style={{ color: getLevelColor(level) }}
                                    >
                                      {level}
                                    </Text>
                                  </View>
                                ))}
                              </View>
                            </View>

                            {/* Stats */}
                            <View className="items-end ml-3">
                              <Text className="text-zinc-500 text-xs font-mono">
                                {totalExercises(template)} ejercicios
                              </Text>
                              <Text className="text-zinc-600 text-xs font-mono">
                                {template.days?.length || 0} días
                              </Text>
                            </View>
                          </View>

                          {/* Expandir/contraer días */}
                          <TouchableOpacity
                            className="flex-row items-center justify-center mt-3 pt-2 border-t border-zinc-800"
                            onPress={() => setExpandedTemplate(isExpanded ? null : template.id)}
                          >
                            <Text className="text-zinc-500 text-xs font-mono mr-1">
                              {isExpanded ? 'Ocultar días' : 'Ver días'}
                            </Text>
                            {isExpanded ? (
                              <ChevronUp size={14} color={COLORS.zinc500} />
                            ) : (
                              <ChevronDown size={14} color={COLORS.zinc500} />
                            )}
                          </TouchableOpacity>
                        </View>

                        {/* Detalle de días */}
                        {isExpanded && template.days && (
                          <View className="px-4 pb-4 border-t border-zinc-800 pt-3">
                            {template.days.map((day) => (
                              <View key={day.dayIndex} className="mb-3">
                                <View className="flex-row items-center gap-2 mb-1.5">
                                  <View className="w-6 h-6 bg-red-600/20 rounded-full items-center justify-center">
                                    <Text className="text-red-400 text-[10px] font-bold">
                                      D{day.dayIndex + 1}
                                    </Text>
                                  </View>
                                  <Text className="text-white font-bold text-sm flex-1">
                                    {day.name}
                                  </Text>
                                  <Text className="text-zinc-600 text-xs font-mono">
                                    {day.exercises?.length || 0} ej.
                                  </Text>
                                </View>
                                {day.exercises?.map((ex, idx) => (
                                  <View
                                    key={`${ex.exercise_id}-${idx}`}
                                    className="flex-row items-center ml-8 mb-1"
                                  >
                                    <View className="w-1.5 h-1.5 bg-zinc-700 rounded-full mr-2" />
                                    <Text
                                      className="text-zinc-400 text-xs flex-1"
                                      numberOfLines={1}
                                    >
                                      {ex.name}
                                    </Text>
                                    <Text className="text-zinc-600 text-[10px] font-mono">
                                      {ex.series?.length || 0}×
                                    </Text>
                                  </View>
                                ))}
                              </View>
                            ))}
                          </View>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ))}
            <View style={{ height: 120 }} />
          </ScrollView>
        )}

        {/* Bottom Action Bar */}
        {selectedTemplate && (
          <View className="absolute bottom-0 left-0 right-0 p-4 pb-8 bg-black/95 border-t border-zinc-800">
            <TouchableOpacity
              className="bg-red-600 py-4 rounded-xl flex-row items-center justify-center"
              onPress={() => onAssign(selectedTemplate)}
              disabled={loading}
              activeOpacity={0.8}
            >
              {loading ? (
                <ActivityIndicator size="small" color="white" />
              ) : (
                <>
                  <Dumbbell size={20} color="white" />
                  <Text className="text-white font-bold text-base ml-2">Asignar Plan</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}
      </View>
    </Modal>
  );
}

// ============================================================================
// COPY PLAN FROM USER MODAL
// ============================================================================
function CopyPlanFromUserModal({
  visible,
  onClose,
  onCopy,
  loading,
  targetUserId,
}: {
  visible: boolean;
  onClose: () => void;
  onCopy: (sourceUserId: string, planType: ClonePlanType) => void;
  loading: boolean;
  targetUserId: string;
}) {
  const [planType, setPlanType] = useState<ClonePlanType>('training');
  const [searchQuery, setSearchQuery] = useState('');
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);

  const fetchUsers = useCallback(
    async (query: string) => {
      setSearching(true);
      try {
        const result = await adminUsers.listUsers({
          search: query.trim().length >= 2 ? query.trim() : undefined,
          limit: 30,
        });
        const filtered = result.users.filter((candidate) => candidate.id !== targetUserId);
        setUsers(filtered);
      } catch (err) {
        console.error('Error searching users:', err);
      } finally {
        setSearching(false);
      }
    },
    [targetUserId]
  );

  useEffect(() => {
    if (!visible) return;
    setSelectedUserId(null);
    setSearchQuery('');
    setPlanType('training');
    fetchUsers('');
  }, [visible, fetchUsers]);

  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(() => {
      fetchUsers(searchQuery);
    }, 350);
    return () => clearTimeout(timer);
  }, [searchQuery, visible, fetchUsers]);

  const selectedUser = users.find((u) => u.id === selectedUserId) || null;

  const getRoleColor = (role: AdminUser['role']) => {
    switch (role) {
      case 'ceo':
        return COLORS.red;
      case 'admin':
        return COLORS.orange;
      case 'pro':
        return COLORS.purple;
      case 'team':
        return '#D946EF';
      default:
        return COLORS.zinc400;
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View className="flex-1 bg-black/90">
        <View className="bg-zinc-900 border-b border-zinc-800 px-4 pt-14 pb-4">
          <View className="flex-row items-center justify-between mb-4">
            <View className="flex-row items-center gap-3">
              <Target size={22} color={COLORS.red} />
              <Text className="text-white text-xl font-bold">Copiar Plan de Usuario</Text>
            </View>
            <TouchableOpacity onPress={onClose} className="p-2">
              <X size={24} color={COLORS.zinc400} />
            </TouchableOpacity>
          </View>

          <Text className="text-zinc-500 text-xs font-mono mb-2">TIPO DE PLAN</Text>
          <View className="flex-row gap-2 mb-4">
            <TouchableOpacity
              className={`flex-1 py-3 rounded-xl border items-center ${
                planType === 'training'
                  ? 'bg-red-600/20 border-red-500'
                  : 'bg-zinc-800 border-zinc-700'
              }`}
              onPress={() => setPlanType('training')}
            >
              <Text
                className={`font-bold ${planType === 'training' ? 'text-red-400' : 'text-white'}`}
              >
                Entrenamiento
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              className={`flex-1 py-3 rounded-xl border items-center ${
                planType === 'nutrition'
                  ? 'bg-red-600/20 border-red-500'
                  : 'bg-zinc-800 border-zinc-700'
              }`}
              onPress={() => setPlanType('nutrition')}
            >
              <Text
                className={`font-bold ${planType === 'nutrition' ? 'text-red-400' : 'text-white'}`}
              >
                Nutrición
              </Text>
            </TouchableOpacity>
          </View>

          <View className="flex-row items-center bg-zinc-800 rounded-xl px-4 py-3 border border-zinc-700">
            <Search size={18} color={COLORS.zinc400} />
            <TextInput
              className="flex-1 text-white text-base ml-3"
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Buscar usuario por nombre o email..."
              placeholderTextColor={COLORS.zinc500}
              autoCapitalize="none"
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <X size={16} color={COLORS.zinc400} />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {searching ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator size="large" color={COLORS.red} />
            <Text className="text-zinc-500 mt-3 font-mono text-sm">Buscando usuarios...</Text>
          </View>
        ) : users.length === 0 ? (
          <View className="flex-1 items-center justify-center px-6">
            <User size={48} color={COLORS.zinc700} />
            <Text className="text-zinc-500 mt-3 text-center">
              No se encontraron usuarios con esa búsqueda
            </Text>
          </View>
        ) : (
          <FlatList
            data={users}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ padding: 16, paddingBottom: 120 }}
            renderItem={({ item }) => {
              const isSelected = selectedUserId === item.id;
              const roleColor = getRoleColor(item.role);
              return (
                <TouchableOpacity
                  className={`bg-zinc-900 rounded-xl mb-2 border p-4 ${
                    isSelected ? 'border-red-500 bg-red-600/5' : 'border-zinc-800'
                  }`}
                  onPress={() => setSelectedUserId(isSelected ? null : item.id)}
                  activeOpacity={0.75}
                >
                  <View className="flex-row items-center">
                    <View className="w-11 h-11 bg-zinc-800 rounded-full overflow-hidden items-center justify-center">
                      {item.avatar_url ? (
                        <Image
                          source={{ uri: item.avatar_url }}
                          className="w-full h-full"
                          resizeMode="cover"
                        />
                      ) : (
                        <User size={20} color={COLORS.zinc400} />
                      )}
                    </View>
                    <View className="flex-1 ml-3">
                      <Text
                        className={`font-bold ${isSelected ? 'text-red-400' : 'text-white'}`}
                        numberOfLines={1}
                      >
                        {item.full_name || 'Sin nombre'}
                      </Text>
                      <Text className="text-zinc-500 text-xs font-mono" numberOfLines={1}>
                        {item.email}
                      </Text>
                    </View>
                    <View
                      className="px-2 py-1 rounded"
                      style={{ backgroundColor: `${roleColor}20` }}
                    >
                      <Text
                        style={{ color: roleColor }}
                        className="text-[10px] font-mono font-bold"
                      >
                        {item.role.toUpperCase()}
                      </Text>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            }}
          />
        )}

        {selectedUser && (
          <View className="absolute bottom-0 left-0 right-0 p-4 pb-8 bg-black/95 border-t border-zinc-800">
            <View className="bg-zinc-900 rounded-xl p-3 mb-3 border border-zinc-800">
              <Text className="text-zinc-500 text-[10px] font-mono">USUARIO ORIGEN</Text>
              <Text className="text-white font-bold mt-1" numberOfLines={1}>
                {selectedUser.full_name || 'Sin nombre'}
              </Text>
              <Text className="text-zinc-500 text-xs font-mono" numberOfLines={1}>
                {selectedUser.email}
              </Text>
            </View>

            <TouchableOpacity
              className="bg-red-600 py-4 rounded-xl flex-row items-center justify-center"
              onPress={() => onCopy(selectedUser.id, planType)}
              disabled={loading}
              activeOpacity={0.8}
            >
              {loading ? (
                <ActivityIndicator size="small" color="white" />
              ) : (
                <>
                  <Target size={20} color="white" />
                  <Text className="text-white font-bold text-base ml-2">
                    Copiar plan de {planType === 'training' ? 'entrenamiento' : 'nutrición'}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}
      </View>
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
  currentExpiresAt,
}: {
  visible: boolean;
  onClose: () => void;
  onGrant: (expiresAt: string) => void;
  loading: boolean;
  currentExpiresAt?: string;
}) {
  const [selectedOption, setSelectedOption] = useState<string>('1m');
  const [customDate, setCustomDate] = useState('');
  const [customStartDate, setCustomStartDate] = useState('');
  const [showCustom, setShowCustom] = useState(false);

  const monthOptions = [
    { key: '1m', label: '1 Mes', months: 1 },
    { key: '2m', label: '2 Meses', months: 2 },
    { key: '3m', label: '3 Meses', months: 3 },
    { key: '6m', label: '6 Meses', months: 6 },
    { key: '1y', label: '1 Año', months: 12 },
  ];

  const parseDate = (str: string): Date | null => {
    const parts = str.split('/');
    if (parts.length === 3) {
      const d = new Date(`${parts[2]}-${parts[1]}-${parts[0]}T00:00:00`);
      if (!isNaN(d.getTime())) return d;
    }
    return null;
  };

  const getStartDate = (): Date => {
    if (customStartDate) {
      const d = parseDate(customStartDate);
      if (d) return d;
    }
    return new Date();
  };

  const getExpiresAt = (): string => {
    if (showCustom && customDate) {
      const date = parseDate(customDate);
      if (date) {
        date.setHours(23, 59, 59);
        return date.toISOString();
      }
      return '';
    }
    const opt = monthOptions.find((o) => o.key === selectedOption);
    if (!opt) return '';
    const d = getStartDate();
    d.setMonth(d.getMonth() + opt.months);
    return d.toISOString();
  };

  const formatPreview = (): string => {
    const iso = getExpiresAt();
    if (!iso) return 'Fecha inválida';
    return new Date(iso).toLocaleDateString('es-PE', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });
  };

  const handleDateFormat = (text: string): string => {
    const digits = text.replace(/\D/g, '');
    let formatted = '';
    if (digits.length > 0) formatted = digits.substring(0, 2);
    if (digits.length > 2) formatted += '/' + digits.substring(2, 4);
    if (digits.length > 4) formatted += '/' + digits.substring(4, 8);
    return formatted;
  };

  return (
    <Modal visible={visible} transparent animationType="fade">
      <TouchableOpacity
        className="flex-1 bg-black/80 justify-center items-center px-6"
        activeOpacity={1}
        onPress={onClose}
      >
        <TouchableOpacity activeOpacity={1} className="w-full max-w-sm">
          <View className="bg-zinc-900 rounded-2xl p-6">
            <View className="flex-row items-center justify-between mb-4">
              <View className="flex-row items-center gap-2">
                <Gift size={22} color={COLORS.purple} />
                <Text className="text-white text-xl font-bold">
                  {currentExpiresAt ? 'Editar PRO' : 'Otorgar PRO'}
                </Text>
              </View>
              <TouchableOpacity onPress={onClose}>
                <X size={24} color={COLORS.zinc400} />
              </TouchableOpacity>
            </View>

            {currentExpiresAt && (
              <View className="bg-purple-600/10 border border-purple-600/30 rounded-lg p-3 mb-4">
                <Text className="text-purple-400 text-xs font-mono">
                  PRO ACTUAL HASTA:{' '}
                  {new Date(currentExpiresAt).toLocaleDateString('es-PE', {
                    day: '2-digit',
                    month: 'long',
                    year: 'numeric',
                  })}
                </Text>
              </View>
            )}

            {/* Start Date */}
            <Text className="text-zinc-400 text-xs font-mono mb-2">FECHA DE INICIO</Text>
            <TouchableOpacity
              className={`flex-row items-center bg-zinc-800 rounded-xl px-4 py-3 mb-4 border ${
                customStartDate ? 'border-purple-500' : 'border-zinc-700'
              }`}
            >
              <Calendar size={18} color={customStartDate ? COLORS.purple : COLORS.zinc400} />
              <TextInput
                className="flex-1 text-white font-mono text-base ml-3"
                value={customStartDate}
                onChangeText={(t) => setCustomStartDate(handleDateFormat(t))}
                placeholder="DD/MM/AAAA (hoy por defecto)"
                placeholderTextColor={COLORS.zinc500}
                keyboardType="number-pad"
                maxLength={10}
              />
            </TouchableOpacity>

            <Text className="text-zinc-400 text-xs font-mono mb-3">DURACIÓN PREDEFINIDA</Text>

            <View className="flex-row flex-wrap gap-2 mb-4">
              {monthOptions.map((opt) => (
                <TouchableOpacity
                  key={opt.key}
                  className={`px-4 py-3 rounded-lg border ${
                    !showCustom && selectedOption === opt.key
                      ? 'bg-purple-600 border-purple-500'
                      : 'bg-zinc-800 border-zinc-700'
                  }`}
                  onPress={() => {
                    setSelectedOption(opt.key);
                    setShowCustom(false);
                  }}
                >
                  <Text
                    className={`font-bold text-sm ${
                      !showCustom && selectedOption === opt.key ? 'text-white' : 'text-zinc-300'
                    }`}
                  >
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Divider */}
            <View className="flex-row items-center gap-3 mb-4">
              <View className="flex-1 h-px bg-zinc-700" />
              <Text className="text-zinc-500 text-xs font-mono">O FECHA EXACTA</Text>
              <View className="flex-1 h-px bg-zinc-700" />
            </View>

            <TouchableOpacity
              className={`flex-row items-center bg-zinc-800 rounded-xl px-4 py-3 mb-4 border ${
                showCustom ? 'border-purple-500' : 'border-zinc-700'
              }`}
              onPress={() => setShowCustom(true)}
            >
              <Calendar size={18} color={showCustom ? COLORS.purple : COLORS.zinc400} />
              <TextInput
                className="flex-1 text-white font-mono text-base ml-3"
                value={customDate}
                onChangeText={(t) => {
                  setCustomDate(handleDateFormat(t));
                  setShowCustom(true);
                }}
                onFocus={() => setShowCustom(true)}
                placeholder="DD/MM/AAAA"
                placeholderTextColor={COLORS.zinc500}
                keyboardType="number-pad"
                maxLength={10}
              />
            </TouchableOpacity>

            {/* Preview */}
            <View className="bg-zinc-800/50 rounded-lg p-3 mb-5">
              {customStartDate && parseDate(customStartDate) && (
                <>
                  <Text className="text-zinc-500 text-xs font-mono mb-1">INICIA EL</Text>
                  <Text className="text-purple-400 font-bold text-base mb-2">
                    {getStartDate().toLocaleDateString('es-PE', {
                      day: '2-digit',
                      month: 'long',
                      year: 'numeric',
                    })}
                  </Text>
                </>
              )}
              <Text className="text-zinc-500 text-xs font-mono mb-1">VENCE EL</Text>
              <Text className="text-white font-bold text-lg">{formatPreview()}</Text>
            </View>

            <TouchableOpacity
              className="bg-purple-600 py-4 rounded-xl flex-row items-center justify-center"
              onPress={() => {
                const expiresAt = getExpiresAt();
                if (expiresAt) onGrant(expiresAt);
              }}
              disabled={loading || !getExpiresAt()}
            >
              {loading ? (
                <ActivityIndicator size="small" color="white" />
              ) : (
                <>
                  <Gift size={20} color="white" />
                  <Text className="text-white font-bold ml-2">
                    {currentExpiresAt ? 'Actualizar PRO' : 'Otorgar PRO'}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
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
  const [assignPlanModalVisible, setAssignPlanModalVisible] = useState(false);
  const [copyPlanModalVisible, setCopyPlanModalVisible] = useState(false);
  const [currentPlan, setCurrentPlan] = useState<{
    frequency: number;
    routineNames: Record<string, string>;
    planSource?: string;
  } | null>(null);

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

      // Fetch is_elite from user_profiles
      try {
        const { data: profileData } = await supabase
          .from('user_profiles')
          .select('is_elite')
          .eq('user_id', id)
          .single();
        if (profileData && userData) {
          userData.is_elite = profileData.is_elite ?? false;
          setUser({ ...userData });
        }
      } catch (e) {
        console.warn('No elite status found:', e);
      }

      // Fetch current training plan
      try {
        const plan = await getUserCurrentPlan(id);
        setCurrentPlan(plan);
      } catch (e) {
        console.warn('No plan found:', e);
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

  const handleGrantPro = async (expiresAt: string) => {
    if (!id || !user) return;
    setActionLoading(true);
    try {
      await adminUsers.grantPro(id, expiresAt);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setUser({ ...user, role: 'pro', pro_expires_at: expiresAt });
      setGrantProModalVisible(false);
      const dateStr = new Date(expiresAt).toLocaleDateString('es-PE', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      });
      Alert.alert('Éxito', `PRO hasta ${dateStr}`);
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleAssignPlan = async (templateId: string) => {
    if (!id || !user) return;
    setActionLoading(true);
    try {
      const result = await assignPlanToUser(id, templateId);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setAssignPlanModalVisible(false);

      // Actualizar info del plan actual
      const plan = await getUserCurrentPlan(id);
      setCurrentPlan(plan);

      // Actualizar frecuencia mostrada
      setUser({ ...user, training_frequency: result.frequency });

      const errMsg =
        result.errors.length > 0 ? `\n\n⚠️ No se asignaron: ${result.errors.join(', ')}` : '';

      Alert.alert(
        'Plan Asignado',
        `${result.planName}\n${result.frequency} días/semana\n${result.exercisesCreated} ejercicios configurados${errMsg}`
      );
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleCopyPlanFromUser = async (sourceUserId: string, planType: ClonePlanType) => {
    if (!id || !user) return;

    Alert.alert(
      'Copiar Plan',
      `Se reemplazará el plan de ${planType === 'training' ? 'entrenamiento' : 'nutrición'} actual de este usuario. ¿Continuar?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Copiar',
          style: 'destructive',
          onPress: async () => {
            setActionLoading(true);
            try {
              const result = await clonePlanFromUser(id, sourceUserId, planType);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              setCopyPlanModalVisible(false);

              if (planType === 'training') {
                const plan = await getUserCurrentPlan(id);
                setCurrentPlan(plan);
                if (result.copied.frequency) {
                  setUser({ ...user, training_frequency: result.copied.frequency });
                }
              }

              if (planType === 'training') {
                Alert.alert(
                  'Plan Copiado',
                  `Entrenamiento copiado exitosamente\n\nEjercicios: ${result.copied.trainingExercises || 0}\nFrecuencia: ${result.copied.frequency || 0} días/semana`
                );
              } else {
                Alert.alert(
                  'Plan Copiado',
                  `Nutrición copiada exitosamente\n\nStacks: ${result.copied.mealStacks || 0}\nComidas: ${result.copied.meals || 0}\nOpciones: ${result.copied.mealOptions || 0}\nSuplementos: ${result.copied.supplements || 0}`
                );
              }
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

  const handleToggleElite = async () => {
    if (!id || !user) return;
    const isCurrentlyElite = user.is_elite;
    const title = isCurrentlyElite ? 'Revocar ÉLITE' : 'Otorgar ÉLITE';
    const message = isCurrentlyElite
      ? '¿Quitar el badge ÉLITE a este usuario?'
      : '¿Otorgar el badge ÉLITE verificado a este usuario?';
    Alert.alert(title, message, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: isCurrentlyElite ? 'Revocar' : 'Otorgar',
        style: isCurrentlyElite ? 'destructive' : 'default',
        onPress: async () => {
          setActionLoading(true);
          try {
            await adminUsers.toggleElite(id, !isCurrentlyElite);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            setUser({ ...user, is_elite: !isCurrentlyElite });
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
              const { token_hash } = await adminUsers.impersonateUser(id);

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
      case 'team':
        return '#D946EF';
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
              {user.is_elite && (
                <View
                  className="flex-row items-center px-2 py-1 rounded-full"
                  style={{ backgroundColor: '#A855F730' }}
                >
                  <BadgeCheck size={12} color="#A855F7" />
                  <Text className="text-xs font-mono font-bold ml-1" style={{ color: '#A855F7' }}>
                    ÉLITE
                  </Text>
                </View>
              )}
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
              label={user.role === 'team' ? 'TEAM hasta' : 'PRO hasta'}
              value={formatDate(user.pro_expires_at)}
              color={user.role === 'team' ? '#D946EF' : COLORS.purple}
            />
          )}
        </View>

        {/* Current Training Plan */}
        {currentPlan && (
          <View className="bg-zinc-900 rounded-xl p-4 mt-4">
            <View className="flex-row items-center justify-between mb-2">
              <Text className="text-zinc-500 text-xs font-mono">PLAN DE ENTRENAMIENTO</Text>
              <View className="bg-red-600/20 px-2 py-0.5 rounded">
                <Text className="text-red-400 text-[10px] font-mono font-bold">
                  {currentPlan.planSource?.toUpperCase() || 'MANUAL'}
                </Text>
              </View>
            </View>
            <InfoRow
              icon={Dumbbell}
              label="Frecuencia"
              value={`${currentPlan.frequency} días/semana`}
              color={COLORS.red}
            />
            {Object.entries(currentPlan.routineNames)
              .sort(([a], [b]) => Number(a) - Number(b))
              .map(([idx, name]) => (
                <View key={idx} className="flex-row items-center py-2 border-b border-zinc-800">
                  <View className="w-6 h-6 bg-red-600/20 rounded-full items-center justify-center">
                    <Text className="text-red-400 text-[10px] font-bold">D{Number(idx) + 1}</Text>
                  </View>
                  <Text className="text-white text-sm ml-3 font-mono">{name}</Text>
                </View>
              ))}
          </View>
        )}

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
            icon={Dumbbell}
            label="Asignar Plan de Entrenamiento"
            color={COLORS.red}
            onPress={() => setAssignPlanModalVisible(true)}
          />

          <ActionButton
            icon={Target}
            label="Copiar Plan de Otro Usuario"
            color={COLORS.red}
            onPress={() => setCopyPlanModalVisible(true)}
          />

          <ActionButton
            icon={Shield}
            label="Cambiar Rol"
            color={COLORS.orange}
            onPress={() => setRoleModalVisible(true)}
          />

          <ActionButton
            icon={BadgeCheck}
            label={user.is_elite ? 'Revocar ÉLITE' : 'Otorgar ÉLITE'}
            color="#A855F7"
            onPress={handleToggleElite}
            loading={actionLoading}
          />

          {user.role !== 'pro' && user.role !== 'team' && (
            <ActionButton
              icon={Gift}
              label="Otorgar TEAM"
              color={COLORS.purple}
              onPress={() => setGrantProModalVisible(true)}
            />
          )}

          {user.role === 'team' && (
            <ActionButton
              icon={Calendar}
              label="Editar Duración TEAM"
              color="#D946EF"
              onPress={() => setGrantProModalVisible(true)}
            />
          )}

          {user.role === 'pro' &&
            (!user.subscription?.status ||
              user.subscription?.status === 'cancelled' ||
              user.subscription?.status === 'past_due') && (
              <ActionButton
                icon={Calendar}
                label="Editar Duración PRO"
                color={COLORS.purple}
                onPress={() => setGrantProModalVisible(true)}
              />
            )}

          {(user.role === 'pro' || user.role === 'team') && !user.subscription?.status && (
            <ActionButton
              icon={Ban}
              label={user.role === 'team' ? 'Revocar TEAM' : 'Revocar PRO'}
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
        currentExpiresAt={
          user.role === 'pro' || user.role === 'team' ? user.pro_expires_at : undefined
        }
      />

      <AssignPlanModal
        visible={assignPlanModalVisible}
        onClose={() => setAssignPlanModalVisible(false)}
        onAssign={handleAssignPlan}
        loading={actionLoading}
        currentPlan={currentPlan}
      />

      {!!id && (
        <CopyPlanFromUserModal
          visible={copyPlanModalVisible}
          onClose={() => setCopyPlanModalVisible(false)}
          onCopy={handleCopyPlanFromUser}
          loading={actionLoading}
          targetUserId={id}
        />
      )}
    </View>
  );
}
