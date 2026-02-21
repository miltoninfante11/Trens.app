import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Modal,
  Platform,
} from 'react-native';
import { useFocusEffect, router } from 'expo-router';
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Users,
  Target,
  CreditCard,
  RefreshCw,
  Crown,
  UserX,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Calendar,
  ArrowUpRight,
  LogOut,
  ChevronLeft,
  ChevronRight,
  X,
} from 'lucide-react-native';
import adminPayments, {
  FinancialStats,
  ChartData,
  DateRange,
} from '../../../services/admin/payments';
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
// STAT CARD COMPONENT
// ============================================================================
function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  color,
  trend,
  trendValue,
  large,
}: {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: any;
  color: string;
  trend?: 'up' | 'down' | 'neutral';
  trendValue?: string;
  large?: boolean;
}) {
  const TrendIcon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : null;
  const trendColor = trend === 'up' ? COLORS.green : trend === 'down' ? COLORS.red : COLORS.zinc400;

  return (
    <View
      className={`bg-zinc-900 rounded-xl border border-zinc-800 ${large ? 'p-5' : 'p-4'}`}
      style={{ flex: large ? 1 : undefined }}
    >
      <View className="flex-row items-center gap-2 mb-2">
        <Icon size={16} color={color} />
        <Text className="text-zinc-400 text-xs font-mono uppercase">{title}</Text>
      </View>
      <Text className={`text-white font-bold ${large ? 'text-3xl' : 'text-2xl'}`}>{value}</Text>
      {(subtitle || trendValue) && (
        <View className="flex-row items-center mt-1 gap-1">
          {TrendIcon && <TrendIcon size={12} color={trendColor} />}
          <Text style={{ color: trendColor }} className="text-xs font-mono">
            {trendValue || subtitle}
          </Text>
        </View>
      )}
    </View>
  );
}

// ============================================================================
// MINI CHART (Simple bar visualization)
// ============================================================================
function MiniChart({
  data,
  color,
  label,
  labels,
  total,
  isSingleMonth,
  type = 'currency',
}: {
  data: number[];
  color: string;
  label: string;
  labels?: string[];
  total?: number;
  isSingleMonth?: boolean;
  type?: 'currency' | 'count';
}) {
  const max = Math.max(...data, 1);

  const formatTotal = () => {
    if (total === undefined) return null;
    if (type === 'currency') return `S/ ${total.toFixed(2)}`;
    return `${total} usuarios`;
  };

  return (
    <View className="bg-zinc-900 rounded-xl border border-zinc-800 p-4">
      <View className="flex-row items-center justify-between mb-3">
        <Text className="text-zinc-400 text-xs font-mono">{label}</Text>
        {total !== undefined && (
          <Text className="text-white font-bold text-sm">{formatTotal()}</Text>
        )}
      </View>
      <View className="flex-row items-end justify-between h-20 gap-[2px]">
        {data.map((value, index) => (
          <View
            key={index}
            className="flex-1 rounded-t items-center"
            style={{
              backgroundColor: value > 0 ? color : '#27272a',
              height: `${Math.max((value / max) * 100, 4)}%`,
              opacity: 0.4 + (index / data.length) * 0.6,
            }}
          />
        ))}
      </View>
      {labels && labels.length > 0 && (
        <View className="flex-row justify-between mt-2">
          <Text className="text-zinc-600 text-[10px] font-mono">{labels[0]}</Text>
          {labels.length > 1 && (
            <Text className="text-zinc-600 text-[10px] font-mono">{labels[labels.length - 1]}</Text>
          )}
        </View>
      )}
    </View>
  );
}

// ============================================================================
// DATE RANGE PICKER MODAL
// ============================================================================
const PRESET_RANGES = [
  { label: 'Este mes', getValue: () => getCurrentMonthRange() },
  { label: 'Mes anterior', getValue: () => getLastMonthRange() },
  { label: 'Últimos 3 meses', getValue: () => getLastNMonthsRange(3) },
  { label: 'Últimos 6 meses', getValue: () => getLastNMonthsRange(6) },
  { label: 'Este año', getValue: () => getThisYearRange() },
  { label: 'Año anterior', getValue: () => getLastYearRange() },
];

// Helper para formatear fecha sin problemas de timezone
function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getCurrentMonthRange(): DateRange {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return {
    dateFrom: formatLocalDate(start),
    dateTo: formatLocalDate(end),
  };
}

function getLastMonthRange(): DateRange {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const end = new Date(now.getFullYear(), now.getMonth(), 0);
  return {
    dateFrom: formatLocalDate(start),
    dateTo: formatLocalDate(end),
  };
}

function getLastNMonthsRange(n: number): DateRange {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - n + 1, 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return {
    dateFrom: formatLocalDate(start),
    dateTo: formatLocalDate(end),
  };
}

function getThisYearRange(): DateRange {
  const now = new Date();
  return {
    dateFrom: `${now.getFullYear()}-01-01`,
    dateTo: `${now.getFullYear()}-12-31`,
  };
}

function getLastYearRange(): DateRange {
  const now = new Date();
  const lastYear = now.getFullYear() - 1;
  return {
    dateFrom: `${lastYear}-01-01`,
    dateTo: `${lastYear}-12-31`,
  };
}

function DateRangePickerModal({
  visible,
  onClose,
  onSelect,
  currentRange,
}: {
  visible: boolean;
  onClose: () => void;
  onSelect: (range: DateRange) => void;
  currentRange: DateRange;
}) {
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null);
  const [mode, setMode] = useState<'presets' | 'custom'>('presets');

  const monthNames = [
    'Enero',
    'Febrero',
    'Marzo',
    'Abril',
    'Mayo',
    'Junio',
    'Julio',
    'Agosto',
    'Septiembre',
    'Octubre',
    'Noviembre',
    'Diciembre',
  ];

  const handleMonthSelect = (monthIndex: number) => {
    const start = new Date(selectedYear, monthIndex, 1);
    const end = new Date(selectedYear, monthIndex + 1, 0);
    onSelect({
      dateFrom: formatLocalDate(start),
      dateTo: formatLocalDate(end),
    });
    onClose();
  };

  const currentYear = new Date().getFullYear();
  const years = [currentYear - 2, currentYear - 1, currentYear];

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <TouchableOpacity className="flex-1 bg-black/80" activeOpacity={1} onPress={onClose}>
        <View className="absolute bottom-0 left-0 right-0 bg-zinc-900 rounded-t-3xl border-t border-zinc-800">
          {/* Header */}
          <View className="flex-row items-center justify-between p-4 border-b border-zinc-800">
            <Text className="text-white font-bold text-lg">Seleccionar Período</Text>
            <TouchableOpacity onPress={onClose}>
              <X size={24} color={COLORS.zinc400} />
            </TouchableOpacity>
          </View>

          {/* Tabs */}
          <View className="flex-row p-2 gap-2">
            <TouchableOpacity
              onPress={() => setMode('presets')}
              className={`flex-1 py-2 rounded-lg ${mode === 'presets' ? 'bg-red-600' : 'bg-zinc-800'}`}
            >
              <Text
                className={`text-center font-bold ${mode === 'presets' ? 'text-white' : 'text-zinc-400'}`}
              >
                Rápido
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setMode('custom')}
              className={`flex-1 py-2 rounded-lg ${mode === 'custom' ? 'bg-red-600' : 'bg-zinc-800'}`}
            >
              <Text
                className={`text-center font-bold ${mode === 'custom' ? 'text-white' : 'text-zinc-400'}`}
              >
                Por Mes
              </Text>
            </TouchableOpacity>
          </View>

          {mode === 'presets' ? (
            // Preset ranges
            <View className="p-4">
              {PRESET_RANGES.map((preset) => {
                const range = preset.getValue();
                const isActive =
                  currentRange.dateFrom === range.dateFrom && currentRange.dateTo === range.dateTo;
                return (
                  <TouchableOpacity
                    key={preset.label}
                    onPress={() => {
                      onSelect(range);
                      onClose();
                    }}
                    className={`p-4 rounded-xl mb-2 flex-row items-center justify-between ${
                      isActive ? 'bg-red-600/20 border border-red-600' : 'bg-zinc-800'
                    }`}
                  >
                    <Text className="text-white font-bold">{preset.label}</Text>
                    {isActive && <CheckCircle size={18} color={COLORS.red} />}
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : (
            // Custom month picker
            <View className="p-4">
              {/* Year selector */}
              <View className="flex-row items-center justify-center gap-4 mb-4">
                <TouchableOpacity
                  onPress={() => setSelectedYear((y) => y - 1)}
                  className="p-2 bg-zinc-800 rounded-lg"
                >
                  <ChevronLeft size={20} color={COLORS.white} />
                </TouchableOpacity>
                <Text className="text-white font-bold text-xl">{selectedYear}</Text>
                <TouchableOpacity
                  onPress={() => setSelectedYear((y) => Math.min(y + 1, currentYear))}
                  disabled={selectedYear >= currentYear}
                  className={`p-2 rounded-lg ${selectedYear >= currentYear ? 'bg-zinc-900' : 'bg-zinc-800'}`}
                >
                  <ChevronRight
                    size={20}
                    color={selectedYear >= currentYear ? COLORS.zinc500 : COLORS.white}
                  />
                </TouchableOpacity>
              </View>

              {/* Month grid */}
              <View className="flex-row flex-wrap gap-2">
                {monthNames.map((month, index) => {
                  const isCurrentMonth =
                    selectedYear === new Date().getFullYear() && index === new Date().getMonth();
                  const isFuture = selectedYear === currentYear && index > new Date().getMonth();
                  return (
                    <TouchableOpacity
                      key={month}
                      onPress={() => !isFuture && handleMonthSelect(index)}
                      disabled={isFuture}
                      className={`w-[31%] p-3 rounded-xl items-center ${
                        isCurrentMonth ? 'bg-red-600' : isFuture ? 'bg-zinc-900' : 'bg-zinc-800'
                      }`}
                    >
                      <Text
                        className={`font-mono text-sm ${isFuture ? 'text-zinc-600' : 'text-white'}`}
                      >
                        {month.slice(0, 3)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}

          <View style={{ height: 40 }} />
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================
export default function AdminFinanzasScreen() {
  const [stats, setStats] = useState<FinancialStats | null>(null);
  const [chartData, setChartData] = useState<ChartData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [datePickerVisible, setDatePickerVisible] = useState(false);
  const [dateRange, setDateRange] = useState<DateRange>(getCurrentMonthRange());

  const fetchData = useCallback(async () => {
    try {
      setError(null);
      const [statsData, chart] = await Promise.all([
        adminPayments.getFinancialStats(),
        adminPayments.getChartData(dateRange),
      ]);
      setStats(statsData);
      setChartData(chart);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [dateRange]);

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [fetchData])
  );

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSync = async () => {
    setSyncing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await adminPayments.syncWithOpenpay();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      fetchData();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSyncing(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return `S/ ${amount.toFixed(2)}`;
  };

  const formatPercent = (value: number) => {
    return `${value.toFixed(1)}%`;
  };

  const formatDateRangeLabel = (range: DateRange) => {
    const from = new Date(range.dateFrom);
    const to = new Date(range.dateTo);
    const monthNames = [
      'Ene',
      'Feb',
      'Mar',
      'Abr',
      'May',
      'Jun',
      'Jul',
      'Ago',
      'Sep',
      'Oct',
      'Nov',
      'Dic',
    ];

    // Si es el mismo mes
    if (from.getMonth() === to.getMonth() && from.getFullYear() === to.getFullYear()) {
      return `${monthNames[from.getMonth()]} ${from.getFullYear()}`;
    }

    // Si es el mismo año
    if (from.getFullYear() === to.getFullYear()) {
      return `${monthNames[from.getMonth()]} - ${monthNames[to.getMonth()]} ${from.getFullYear()}`;
    }

    return `${monthNames[from.getMonth()]} ${from.getFullYear()} - ${monthNames[to.getMonth()]} ${to.getFullYear()}`;
  };

  if (loading) {
    return (
      <View className="flex-1 bg-black items-center justify-center">
        <ActivityIndicator size="large" color={COLORS.red} />
        <Text className="text-zinc-400 font-mono text-sm mt-4">Cargando métricas...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View className="flex-1 bg-black items-center justify-center p-8">
        <AlertTriangle size={48} color={COLORS.red} />
        <Text className="text-white font-bold text-lg mt-4">Error</Text>
        <Text className="text-zinc-400 text-center font-mono text-sm mt-2">{error}</Text>
        <TouchableOpacity className="bg-red-600 px-6 py-3 rounded-xl mt-6" onPress={fetchData}>
          <Text className="text-white font-bold">Reintentar</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!stats) return null;

  const revenueGrowthTrend = stats.revenueGrowth >= 0 ? 'up' : 'down';

  return (
    <ScrollView
      className="flex-1 bg-black"
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            fetchData();
          }}
          tintColor={COLORS.red}
        />
      }
    >
      {/* Header */}
      <View className="px-4 py-4 bg-zinc-900 border-b border-zinc-800">
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center gap-2">
            <BarChart3 size={20} color={COLORS.red} />
            <Text className="text-white font-bold text-lg">Dashboard CEO</Text>
          </View>
          <View className="flex-row gap-2">
            <TouchableOpacity
              onPress={handleSync}
              disabled={syncing}
              className="flex-row items-center gap-2 bg-zinc-800 px-3 py-2 rounded-lg"
            >
              {syncing ? (
                <ActivityIndicator size="small" color={COLORS.blue} />
              ) : (
                <RefreshCw size={16} color={COLORS.blue} />
              )}
              <Text className="text-blue-400 font-mono text-xs">
                {syncing ? 'Sincronizando...' : 'Sync Openpay'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
        <Text className="text-zinc-500 text-xs font-mono mt-1">
          Métricas en tiempo real • Openpay Perú
        </Text>
      </View>

      {/* MRR / ARR - Hero Cards */}
      <View className="flex-row px-4 mt-4 gap-3">
        <StatCard
          title="MRR"
          value={formatCurrency(stats.mrr)}
          icon={DollarSign}
          color={COLORS.green}
          trend={revenueGrowthTrend}
          trendValue={`${stats.revenueGrowth >= 0 ? '+' : ''}${formatPercent(stats.revenueGrowth)} vs mes ant.`}
          large
        />
        <StatCard
          title="ARR"
          value={formatCurrency(stats.arr)}
          icon={DollarSign}
          color={COLORS.purple}
          subtitle="Proyección anual"
          large
        />
      </View>

      {/* Revenue Stats */}
      <View className="px-4 mt-4">
        <View className="flex-row items-center justify-between mb-2">
          <Text className="text-zinc-500 text-xs font-mono ml-1">INGRESOS</Text>
          <TouchableOpacity
            onPress={() => setDatePickerVisible(true)}
            className="flex-row items-center gap-2 bg-zinc-800 px-3 py-1.5 rounded-lg"
          >
            <Calendar size={14} color={COLORS.cyan} />
            <Text className="text-cyan-400 font-mono text-xs">
              {formatDateRangeLabel(dateRange)}
            </Text>
          </TouchableOpacity>
        </View>
        <View className="flex-row gap-3">
          <View className="flex-1">
            <StatCard
              title="Período Seleccionado"
              value={formatCurrency(chartData?.totalRevenue || 0)}
              icon={Calendar}
              color={COLORS.cyan}
            />
          </View>
          <View className="flex-1">
            <StatCard
              title="Total Histórico"
              value={formatCurrency(stats.totalRevenue)}
              icon={CreditCard}
              color={COLORS.orange}
            />
          </View>
        </View>
      </View>

      {/* Revenue Chart */}
      {chartData && (
        <View className="px-4 mt-4">
          <MiniChart
            data={chartData.revenue}
            color={COLORS.green}
            label={chartData.isSingleMonth ? 'INGRESOS POR DÍA' : 'INGRESOS POR MES'}
            labels={chartData.labels}
            total={chartData.totalRevenue}
            isSingleMonth={chartData.isSingleMonth}
            type="currency"
          />
        </View>
      )}

      {/* User Stats */}
      <View className="px-4 mt-4">
        <Text className="text-zinc-500 text-xs font-mono mb-2 ml-1">USUARIOS</Text>
        <View className="flex-row gap-3 mb-3">
          <View className="flex-1">
            <StatCard title="Total" value={stats.totalUsers} icon={Users} color={COLORS.blue} />
          </View>
          <View className="flex-1">
            <StatCard title="PRO" value={stats.proUsers} icon={Crown} color={COLORS.yellow} />
          </View>
          <View className="flex-1">
            <StatCard title="Free" value={stats.freeUsers} icon={Users} color={COLORS.zinc400} />
          </View>
        </View>
        <View className="flex-row gap-3">
          <View className="flex-1">
            <StatCard
              title="Nuevos/Mes"
              value={stats.newUsersThisMonth}
              icon={ArrowUpRight}
              color={COLORS.green}
            />
          </View>
          <View className="flex-1">
            <StatCard
              title="Nuevos PRO/Mes"
              value={stats.newProThisMonth}
              icon={Crown}
              color={COLORS.purple}
            />
          </View>
        </View>
      </View>

      {/* Users Chart */}
      {chartData && (
        <View className="px-4 mt-4">
          <MiniChart
            data={chartData.users}
            color={COLORS.blue}
            label={chartData.isSingleMonth ? 'NUEVOS USUARIOS POR DÍA' : 'NUEVOS USUARIOS POR MES'}
            labels={chartData.labels}
            total={chartData.totalUsers}
            isSingleMonth={chartData.isSingleMonth}
            type="count"
          />
        </View>
      )}

      {/* Conversion & Retention */}
      <View className="px-4 mt-4">
        <Text className="text-zinc-500 text-xs font-mono mb-2 ml-1">CONVERSIÓN & RETENCIÓN</Text>
        <View className="flex-row gap-3 mb-3">
          <View className="flex-1">
            <StatCard
              title="Conversión"
              value={formatPercent(stats.conversionRate)}
              icon={Target}
              color={COLORS.green}
              subtitle="Free → PRO"
            />
          </View>
          <View className="flex-1">
            <StatCard
              title="Churn"
              value={formatPercent(stats.churnRate)}
              icon={UserX}
              color={stats.churnRate > 5 ? COLORS.red : COLORS.green}
              subtitle="Cancelaciones/mes"
            />
          </View>
        </View>
        <View className="flex-row gap-3">
          <View className="flex-1">
            <StatCard
              title="LTV Promedio"
              value={formatCurrency(stats.avgLifetimeValue)}
              icon={DollarSign}
              color={COLORS.purple}
              subtitle="Lifetime Value"
            />
          </View>
          <View className="flex-1">
            <StatCard
              title="Ticket Promedio"
              value={formatCurrency(stats.avgPaymentAmount)}
              icon={CreditCard}
              color={COLORS.cyan}
            />
          </View>
        </View>
      </View>

      {/* Subscriptions & Payments */}
      <View className="px-4 mt-4">
        <Text className="text-zinc-500 text-xs font-mono mb-2 ml-1">SUSCRIPCIONES & PAGOS</Text>
        <View className="flex-row gap-3 mb-3">
          <View className="flex-1">
            <StatCard
              title="Subs Activas"
              value={stats.activeSubscriptions}
              icon={CheckCircle}
              color={COLORS.green}
            />
          </View>
          <View className="flex-1">
            <StatCard
              title="Canceladas/Mes"
              value={stats.cancelledThisMonth}
              icon={XCircle}
              color={COLORS.red}
            />
          </View>
        </View>
        <View className="flex-row gap-3">
          <View className="flex-1">
            <StatCard
              title="Pagos OK"
              value={stats.successfulPayments}
              icon={CheckCircle}
              color={COLORS.green}
            />
          </View>
          <View className="flex-1">
            <StatCard
              title="Pagos Fallidos"
              value={stats.failedPayments}
              icon={XCircle}
              color={COLORS.red}
            />
          </View>
          <View className="flex-1">
            <StatCard
              title="Reembolsos"
              value={stats.refunds}
              icon={RefreshCw}
              color={COLORS.orange}
            />
          </View>
        </View>
      </View>

      {/* Footer - Openpay Status */}
      <View className="px-4 py-6 mt-4">
        <View className="bg-zinc-900 rounded-xl border border-zinc-800 p-4">
          <View className="flex-row items-center gap-2 mb-2">
            <CheckCircle size={16} color={COLORS.green} />
            <Text className="text-green-400 font-mono text-xs">OPENPAY CONECTADO</Text>
          </View>
          <Text className="text-zinc-500 text-xs font-mono">
            Merchant ID: mudi9kij0xb5xk54urc6{'\n'}
            Ambiente: Producción{'\n'}
            Plan Mensual: S/ 59.90
          </Text>
        </View>
      </View>

      {/* Exit Admin Button */}
      <TouchableOpacity
        className="mx-4 mb-8 bg-red-600/20 p-4 rounded-xl border border-red-600/50 flex-row items-center justify-center"
        onPress={() => router.replace('/(tabs)/adn')}
      >
        <LogOut size={20} color={COLORS.red} />
        <Text className="text-red-500 font-bold ml-2">SALIR DE MODO ADMIN</Text>
      </TouchableOpacity>

      <View style={{ height: 100 }} />

      {/* Date Range Picker Modal */}
      <DateRangePickerModal
        visible={datePickerVisible}
        onClose={() => setDatePickerVisible(false)}
        onSelect={(range) => {
          setDateRange(range);
          setDatePickerVisible(false);
        }}
        currentRange={dateRange}
      />
    </ScrollView>
  );
}
