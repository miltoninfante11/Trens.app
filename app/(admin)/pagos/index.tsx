import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  TextInput,
  Modal,
  Share,
  Platform,
} from 'react-native';
import { useFocusEffect, router } from 'expo-router';
import {
  CreditCard,
  Search,
  Filter,
  Download,
  RefreshCw,
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  X,
  ChevronRight,
  DollarSign,
  Calendar,
  User,
  Mail,
} from 'lucide-react-native';
import adminPayments, { Payment } from '../../../services/admin/payments';
import { Alert } from '../../../lib/alert';
import * as Haptics from '../../../lib/haptics';

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
  cyan: '#06B6D4',
  white: '#FFFFFF',
  zinc400: '#A1A1AA',
  zinc500: '#71717A',
};

// ============================================================================
// STATUS CONFIG
// ============================================================================
const STATUS_CONFIG: Record<string, { color: string; label: string; icon: any }> = {
  completed: { color: COLORS.green, label: 'Completado', icon: CheckCircle },
  pending: { color: COLORS.yellow, label: 'Pendiente', icon: Clock },
  failed: { color: COLORS.red, label: 'Fallido', icon: XCircle },
  refunded: { color: COLORS.orange, label: 'Reembolsado', icon: RefreshCw },
  cancelled: { color: COLORS.zinc400, label: 'Cancelado', icon: X },
  past_due: { color: COLORS.orange, label: 'Pago Pendiente', icon: AlertTriangle },
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
// PAYMENT CARD COMPONENT
// ============================================================================
function PaymentCard({ payment, onPress }: { payment: Payment; onPress: () => void }) {
  const config = STATUS_CONFIG[payment.status] || STATUS_CONFIG.pending;
  const StatusIcon = config.icon;

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('es-PE', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <TouchableOpacity
      onPress={onPress}
      className="bg-zinc-900 rounded-xl p-4 mb-2 border border-zinc-800"
      activeOpacity={0.7}
    >
      <View className="flex-row items-center justify-between mb-3">
        <View className="flex-row items-center gap-2">
          <View
            className="w-8 h-8 rounded-lg items-center justify-center"
            style={{ backgroundColor: `${config.color}20` }}
          >
            <StatusIcon size={16} color={config.color} />
          </View>
          <View>
            <Text className="text-white font-bold">S/ {payment.amount.toFixed(2)}</Text>
            <Text style={{ color: config.color }} className="text-xs font-mono">
              {config.label}
            </Text>
          </View>
        </View>
        <View className="items-end">
          <Text className="text-zinc-400 text-xs font-mono">
            {payment.card_brand} •••• {payment.card_last4}
          </Text>
          <Text className="text-zinc-600 text-[10px] font-mono">
            {formatDate(payment.created_at)}
          </Text>
        </View>
      </View>

      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center gap-2">
          <User size={12} color={COLORS.zinc400} />
          <Text className="text-zinc-400 text-xs" numberOfLines={1}>
            {payment.user_name || 'N/A'}
          </Text>
        </View>
        <View className="flex-row items-center gap-2">
          <Mail size={12} color={COLORS.zinc400} />
          <Text className="text-zinc-500 text-xs font-mono" numberOfLines={1}>
            {payment.user_email || 'N/A'}
          </Text>
        </View>
        <ChevronRight size={16} color={COLORS.zinc400} />
      </View>

      {payment.error_message && (
        <View className="mt-2 bg-red-600/10 p-2 rounded-lg">
          <Text className="text-red-400 text-xs font-mono">{payment.error_message}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

// ============================================================================
// PAYMENT DETAIL MODAL
// ============================================================================
function PaymentDetailModal({
  payment,
  visible,
  onClose,
  onRefund,
}: {
  payment: Payment | null;
  visible: boolean;
  onClose: () => void;
  onRefund: () => void;
}) {
  if (!payment) return null;

  const config = STATUS_CONFIG[payment.status] || STATUS_CONFIG.pending;
  const StatusIcon = config.icon;

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View className="flex-1 bg-black/90 justify-end">
        <View className="bg-zinc-900 rounded-t-3xl p-6 border-t border-zinc-800">
          {/* Header */}
          <View className="flex-row items-center justify-between mb-6">
            <Text className="text-white font-bold text-lg">Detalle del Pago</Text>
            <TouchableOpacity onPress={onClose}>
              <X size={24} color={COLORS.zinc400} />
            </TouchableOpacity>
          </View>

          {/* Amount & Status */}
          <View className="items-center mb-6">
            <Text className="text-white font-bold text-4xl">S/ {payment.amount.toFixed(2)}</Text>
            <View
              className="flex-row items-center gap-2 mt-2 px-3 py-1 rounded-full"
              style={{ backgroundColor: `${config.color}20` }}
            >
              <StatusIcon size={14} color={config.color} />
              <Text style={{ color: config.color }} className="font-mono text-sm">
                {config.label}
              </Text>
            </View>
          </View>

          {/* Details */}
          <View className="bg-zinc-800 rounded-xl p-4 mb-4">
            <DetailRow label="ID Transacción" value={payment.id} mono />
            <DetailRow label="Usuario" value={payment.user_name || 'N/A'} />
            <DetailRow label="Email" value={payment.user_email || 'N/A'} mono />
            <DetailRow
              label="Tarjeta"
              value={`${payment.card_brand || ''} •••• ${payment.card_last4 || ''}`}
            />
            <DetailRow label="Fecha" value={new Date(payment.created_at).toLocaleString('es-PE')} />
            {payment.openpay_transaction_id && (
              <DetailRow label="Auth Code" value={payment.openpay_transaction_id} mono />
            )}
          </View>

          {/* Error Message */}
          {payment.error_message && (
            <View className="bg-red-600/10 border border-red-600/30 rounded-xl p-4 mb-4">
              <Text className="text-red-400 font-bold text-sm mb-1">Error</Text>
              <Text className="text-red-300 text-xs font-mono">{payment.error_message}</Text>
            </View>
          )}

          {/* Actions */}
          {payment.status === 'completed' && (
            <TouchableOpacity
              onPress={onRefund}
              className="bg-orange-600/20 border border-orange-600/30 p-4 rounded-xl flex-row items-center justify-center"
            >
              <RefreshCw size={18} color={COLORS.orange} />
              <Text className="text-orange-400 font-bold ml-2">Procesar Reembolso</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  );
}

function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <View className="flex-row justify-between py-2 border-b border-zinc-700 last:border-b-0">
      <Text className="text-zinc-500 text-sm">{label}</Text>
      <Text
        className={`text-white text-sm ${mono ? 'font-mono' : ''}`}
        numberOfLines={1}
        style={{ maxWidth: '60%' }}
      >
        {value}
      </Text>
    </View>
  );
}

// ============================================================================
// FILTER MODAL
// ============================================================================
function FilterModal({
  visible,
  onClose,
  currentFilter,
  onSelectFilter,
}: {
  visible: boolean;
  onClose: () => void;
  currentFilter: string | null;
  onSelectFilter: (filter: string | null) => void;
}) {
  const filters = [
    { value: null, label: 'Todos', color: COLORS.white },
    { value: 'completed', label: 'Completados', color: COLORS.green },
    { value: 'pending', label: 'Pendientes', color: COLORS.yellow },
    { value: 'failed', label: 'Fallidos', color: COLORS.red },
    { value: 'refunded', label: 'Reembolsados', color: COLORS.orange },
  ];

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <TouchableOpacity className="flex-1 bg-black/80" activeOpacity={1} onPress={onClose}>
        <View className="absolute bottom-0 left-0 right-0 bg-zinc-900 rounded-t-3xl p-6 border-t border-zinc-800">
          <View className="flex-row items-center justify-between mb-4">
            <Text className="text-white font-bold text-lg">Filtrar por Estado</Text>
            <TouchableOpacity onPress={onClose}>
              <X size={24} color={COLORS.zinc400} />
            </TouchableOpacity>
          </View>

          {filters.map((filter) => (
            <TouchableOpacity
              key={filter.value || 'all'}
              onPress={() => {
                onSelectFilter(filter.value);
                onClose();
              }}
              className={`p-4 rounded-xl mb-2 flex-row items-center justify-between ${
                currentFilter === filter.value
                  ? 'bg-red-600/20 border border-red-600'
                  : 'bg-zinc-800'
              }`}
            >
              <View className="flex-row items-center gap-3">
                <View className="w-3 h-3 rounded-full" style={{ backgroundColor: filter.color }} />
                <Text className="text-white font-bold">{filter.label}</Text>
              </View>
              {currentFilter === filter.value && <CheckCircle size={18} color={COLORS.red} />}
            </TouchableOpacity>
          ))}
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================
export default function AdminPagosScreen() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [filterModalVisible, setFilterModalVisible] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null);
  const [detailModalVisible, setDetailModalVisible] = useState(false);

  const fetchPayments = useCallback(async () => {
    try {
      setError(null);
      const data = await adminPayments.getPayments({
        status: statusFilter || undefined,
      });
      setPayments(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [statusFilter]);

  useFocusEffect(
    useCallback(() => {
      fetchPayments();
    }, [fetchPayments])
  );

  useEffect(() => {
    fetchPayments();
  }, [fetchPayments]);

  const handleExport = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const csv = adminPayments.exportToCSV(payments);

    if (Platform.OS === 'web') {
      // Download as file in web
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `pagos_trens_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
    } else {
      // Share on native
      await Share.share({
        message: csv,
        title: 'Exportar Pagos TRENS',
      });
    }
  };

  const handleRefund = async () => {
    if (!selectedPayment) return;

    Alert.alert(
      '⚠️ Procesar Reembolso',
      `¿Seguro que quieres reembolsar S/ ${selectedPayment.amount.toFixed(2)} a ${selectedPayment.user_email}?\n\nEsta acción no se puede deshacer.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Reembolsar',
          style: 'destructive',
          onPress: async () => {
            try {
              await adminPayments.processRefund(selectedPayment.id);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              setDetailModalVisible(false);
              fetchPayments();
            } catch (err: any) {
              Alert.alert('Error', err.message);
            }
          },
        },
      ]
    );
  };

  // Filter payments by search
  const filteredPayments = payments.filter((p) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      p.user_email?.toLowerCase().includes(query) ||
      p.user_name?.toLowerCase().includes(query) ||
      p.id.toLowerCase().includes(query)
    );
  });

  // Stats
  const stats = {
    total: payments.length,
    completed: payments.filter((p) => p.status === 'completed').length,
    failed: payments.filter((p) => p.status === 'failed').length,
    refunded: payments.filter((p) => p.status === 'refunded').length,
  };

  if (loading) {
    return (
      <View className="flex-1 bg-black items-center justify-center">
        <ActivityIndicator size="large" color={COLORS.red} />
        <Text className="text-zinc-400 font-mono text-sm mt-4">Cargando pagos...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View className="flex-1 bg-black items-center justify-center p-8">
        <AlertTriangle size={48} color={COLORS.red} />
        <Text className="text-white font-bold text-lg mt-4">Error</Text>
        <Text className="text-zinc-400 text-center font-mono text-sm mt-2">{error}</Text>
        <TouchableOpacity className="bg-red-600 px-6 py-3 rounded-xl mt-6" onPress={fetchPayments}>
          <Text className="text-white font-bold">Reintentar</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-black">
      <ScrollView
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              fetchPayments();
            }}
            tintColor={COLORS.red}
          />
        }
      >
        {/* Header */}
        <View className="px-4 py-4 bg-zinc-900 border-b border-zinc-800">
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center gap-2">
              <CreditCard size={20} color={COLORS.blue} />
              <Text className="text-white font-bold text-lg">Pagos</Text>
            </View>
            <TouchableOpacity
              onPress={handleExport}
              className="flex-row items-center gap-2 bg-zinc-800 px-3 py-2 rounded-lg"
            >
              <Download size={16} color={COLORS.green} />
              <Text className="text-green-400 font-mono text-xs">Exportar CSV</Text>
            </TouchableOpacity>
          </View>
          <Text className="text-zinc-500 text-xs font-mono mt-1">
            Transacciones de Openpay en tiempo real
          </Text>
        </View>

        {/* Stats */}
        <View className="flex-row px-4 mt-4 gap-3">
          <StatCard
            title="Total"
            value={stats.total}
            icon={CreditCard}
            color={COLORS.blue}
            onPress={() => setStatusFilter(null)}
            active={statusFilter === null}
          />
          <StatCard
            title="Exitosos"
            value={stats.completed}
            icon={CheckCircle}
            color={COLORS.green}
            onPress={() => setStatusFilter('completed')}
            active={statusFilter === 'completed'}
          />
          <StatCard
            title="Fallidos"
            value={stats.failed}
            icon={XCircle}
            color={COLORS.red}
            onPress={() => setStatusFilter('failed')}
            active={statusFilter === 'failed'}
          />
          <StatCard
            title="Reembolsos"
            value={stats.refunded}
            icon={RefreshCw}
            color={COLORS.orange}
            onPress={() => setStatusFilter('refunded')}
            active={statusFilter === 'refunded'}
          />
        </View>

        {/* Search & Filter */}
        <View className="px-4 mt-4 flex-row gap-2">
          <View className="flex-1 flex-row items-center bg-zinc-800 rounded-xl px-3">
            <Search size={18} color={COLORS.zinc400} />
            <TextInput
              className="flex-1 py-3 px-2 text-white font-mono"
              placeholder="Buscar por email, nombre o ID..."
              placeholderTextColor={COLORS.zinc500}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery && (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <X size={18} color={COLORS.zinc400} />
              </TouchableOpacity>
            )}
          </View>
          <TouchableOpacity
            onPress={() => setFilterModalVisible(true)}
            className={`p-3 rounded-xl ${statusFilter ? 'bg-red-600' : 'bg-zinc-800'}`}
          >
            <Filter size={20} color={statusFilter ? COLORS.white : COLORS.zinc400} />
          </TouchableOpacity>
        </View>

        {/* Payments List */}
        <View className="px-4 mt-4">
          <Text className="text-zinc-500 text-xs font-mono mb-2 ml-1">
            {filteredPayments.length} TRANSACCIONES
          </Text>

          {filteredPayments.length === 0 ? (
            <View className="items-center py-12">
              <CreditCard size={48} color={COLORS.zinc500} />
              <Text className="text-zinc-400 font-mono mt-4">No hay pagos</Text>
            </View>
          ) : (
            filteredPayments.map((payment) => (
              <PaymentCard
                key={payment.id}
                payment={payment}
                onPress={() => {
                  setSelectedPayment(payment);
                  setDetailModalVisible(true);
                }}
              />
            ))
          )}
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Modals */}
      <FilterModal
        visible={filterModalVisible}
        onClose={() => setFilterModalVisible(false)}
        currentFilter={statusFilter}
        onSelectFilter={setStatusFilter}
      />

      <PaymentDetailModal
        payment={selectedPayment}
        visible={detailModalVisible}
        onClose={() => setDetailModalVisible(false)}
        onRefund={handleRefund}
      />
    </View>
  );
}
