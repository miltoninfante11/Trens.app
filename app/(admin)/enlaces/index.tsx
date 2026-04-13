import { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  TextInput,
  Modal,
  Alert,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import {
  Link2,
  Plus,
  Trash2,
  Edit3,
  ExternalLink,
  Globe,
  Route,
  BarChart3,
  Copy,
  ToggleLeft,
  ToggleRight,
  X,
  MousePointerClick,
  Search,
  RotateCcw,
  MessageCircle,
  Phone,
} from 'lucide-react-native';
import adminLinks, { ShortLink, CreateShortLinkInput } from '../../../services/admin/links';
import * as Haptics from '../../../lib/haptics';
import * as Clipboard from 'expo-clipboard';

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
  zinc800: '#27272a',
  zinc900: '#18181b',
};

// ============================================================================
// STAT CARD
// ============================================================================
function StatCard({
  title,
  value,
  icon: Icon,
  color,
}: {
  title: string;
  value: string | number;
  icon: any;
  color: string;
}) {
  return (
    <View className="bg-zinc-900 rounded-xl p-4 flex-1 border border-zinc-800">
      <View className="flex-row items-center gap-2 mb-2">
        <Icon size={16} color={color} />
        <Text className="text-zinc-400 text-xs font-mono">{title}</Text>
      </View>
      <Text className="text-white text-2xl font-bold">{value}</Text>
    </View>
  );
}

// ============================================================================
// LINK CARD
// ============================================================================
function LinkCard({
  link,
  onEdit,
  onDelete,
  onToggle,
  onCopy,
  onResetClicks,
}: {
  link: ShortLink;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: () => void;
  onCopy: () => void;
  onResetClicks: () => void;
}) {
  const isSubdomain = link.link_type === 'subdomain';
  const shortUrl = isSubdomain ? `${link.slug}.trens.app` : `trens.app/${link.slug}`;

  return (
    <View
      className={`bg-zinc-900 rounded-xl p-4 border ${link.is_active ? 'border-zinc-800' : 'border-zinc-800/50 opacity-60'}`}
    >
      {/* Header */}
      <View className="flex-row items-center justify-between mb-3">
        <View className="flex-row items-center gap-2 flex-1">
          <View
            className="w-8 h-8 rounded-lg items-center justify-center"
            style={{ backgroundColor: isSubdomain ? COLORS.purple + '20' : COLORS.blue + '20' }}
          >
            {isSubdomain ? (
              <Globe size={16} color={COLORS.purple} />
            ) : (
              <Route size={16} color={COLORS.blue} />
            )}
          </View>
          <View className="flex-1">
            {link.label && (
              <Text className="text-white font-bold text-sm" numberOfLines={1}>
                {link.label}
              </Text>
            )}
            <Text
              className="text-zinc-400 text-xs font-mono"
              style={{
                backgroundColor: isSubdomain ? COLORS.purple + '15' : COLORS.blue + '15',
                paddingHorizontal: 6,
                paddingVertical: 2,
                borderRadius: 4,
                alignSelf: 'flex-start',
                overflow: 'hidden',
              }}
            >
              {isSubdomain ? 'SUBDOMINIO' : 'RUTA'}
            </Text>
          </View>
        </View>

        {/* Toggle activo */}
        <TouchableOpacity onPress={onToggle} className="p-1">
          {link.is_active ? (
            <ToggleRight size={28} color={COLORS.green} />
          ) : (
            <ToggleLeft size={28} color={COLORS.zinc500} />
          )}
        </TouchableOpacity>
      </View>

      {/* URLs */}
      <TouchableOpacity onPress={onCopy} className="mb-3">
        <View className="bg-black rounded-lg p-3 border border-zinc-800">
          <View className="flex-row items-center gap-2">
            <Link2 size={14} color={isSubdomain ? COLORS.purple : COLORS.blue} />
            <Text
              className="font-mono text-sm flex-1"
              style={{ color: isSubdomain ? COLORS.purple : COLORS.blue }}
              numberOfLines={1}
            >
              {shortUrl}
            </Text>
            <Copy size={14} color={COLORS.zinc400} />
          </View>
        </View>
      </TouchableOpacity>

      <View className="flex-row items-center gap-2 mb-3">
        {link.destination_url.includes('wa.me') ? (
          <MessageCircle size={12} color={COLORS.green} />
        ) : (
          <ExternalLink size={12} color={COLORS.zinc500} />
        )}
        <Text
          className="text-xs font-mono flex-1"
          style={{ color: link.destination_url.includes('wa.me') ? COLORS.green : COLORS.zinc500 }}
          numberOfLines={1}
        >
          → {link.destination_url}
        </Text>
      </View>

      {/* Footer: clicks + actions */}
      <View className="flex-row items-center justify-between border-t border-zinc-800 pt-3">
        <TouchableOpacity onPress={onResetClicks} className="flex-row items-center gap-1">
          <MousePointerClick size={14} color={COLORS.cyan} />
          <Text className="text-cyan-400 text-sm font-mono font-bold">{link.clicks}</Text>
          <Text className="text-zinc-500 text-xs">clicks</Text>
        </TouchableOpacity>

        <View className="flex-row items-center gap-3">
          <TouchableOpacity onPress={onEdit} className="p-2">
            <Edit3 size={18} color={COLORS.zinc400} />
          </TouchableOpacity>
          <TouchableOpacity onPress={onDelete} className="p-2">
            <Trash2 size={18} color={COLORS.red} />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

// ============================================================================
// CREATE/EDIT MODAL
// ============================================================================
function LinkFormModal({
  visible,
  onClose,
  onSave,
  editingLink,
  saving,
}: {
  visible: boolean;
  onClose: () => void;
  onSave: (input: CreateShortLinkInput) => void;
  editingLink: ShortLink | null;
  saving: boolean;
}) {
  const [slug, setSlug] = useState('');
  const [destinationUrl, setDestinationUrl] = useState('');
  const [linkType, setLinkType] = useState<'path' | 'subdomain'>('path');
  const [label, setLabel] = useState('');
  const [destMode, setDestMode] = useState<'url' | 'whatsapp'>('url');
  const [waPhone, setWaPhone] = useState('');
  const [waMessage, setWaMessage] = useState('');

  // Detectar si una URL es de WhatsApp y extraer datos
  const parseWhatsAppUrl = (url: string) => {
    const match = url.match(/^https?:\/\/wa\.me\/(\d+)\??(.*)$/);
    if (match) {
      const phone = match[1];
      const params = new URLSearchParams(match[2]);
      const text = params.get('text') || '';
      return { phone, text };
    }
    return null;
  };

  // Generar URL de WhatsApp
  const buildWhatsAppUrl = () => {
    const cleanPhone = waPhone.replace(/[^0-9]/g, '');
    if (!cleanPhone) return '';
    const base = `https://wa.me/${cleanPhone}`;
    if (waMessage.trim()) {
      return `${base}?text=${encodeURIComponent(waMessage.trim())}`;
    }
    return base;
  };

  // URL final según el modo
  const finalUrl = destMode === 'whatsapp' ? buildWhatsAppUrl() : destinationUrl;

  // Reset form cuando se abre
  const resetForm = useCallback(() => {
    if (editingLink) {
      setSlug(editingLink.slug);
      setLinkType(editingLink.link_type);
      setLabel(editingLink.label || '');

      // Detectar si es WhatsApp
      const wa = parseWhatsAppUrl(editingLink.destination_url);
      if (wa) {
        setDestMode('whatsapp');
        setWaPhone(wa.phone);
        setWaMessage(wa.text);
        setDestinationUrl('');
      } else {
        setDestMode('url');
        setDestinationUrl(editingLink.destination_url);
        setWaPhone('');
        setWaMessage('');
      }
    } else {
      setSlug('');
      setDestinationUrl('');
      setLinkType('path');
      setLabel('');
      setDestMode('url');
      setWaPhone('');
      setWaMessage('');
    }
  }, [editingLink]);

  useFocusEffect(
    useCallback(() => {
      if (visible) resetForm();
    }, [visible, resetForm])
  );

  const preview =
    linkType === 'subdomain' ? `${slug || 'ejemplo'}.trens.app` : `trens.app/${slug || 'ejemplo'}`;

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View className="flex-1 bg-black/80 justify-end">
        <View className="bg-zinc-900 rounded-t-3xl border-t border-zinc-700 max-h-[90%]">
          {/* Header */}
          <View className="flex-row items-center justify-between p-4 border-b border-zinc-800">
            <Text className="text-white font-bold text-lg">
              {editingLink ? 'Editar Enlace' : 'Nuevo Enlace'}
            </Text>
            <TouchableOpacity onPress={onClose} className="p-1">
              <X size={24} color={COLORS.zinc400} />
            </TouchableOpacity>
          </View>

          <ScrollView className="p-4" keyboardShouldPersistTaps="handled">
            {/* Tipo de enlace */}
            <Text className="text-zinc-400 text-xs font-mono mb-2 uppercase">Tipo de enlace</Text>
            <View className="flex-row gap-3 mb-5">
              <TouchableOpacity
                onPress={() => setLinkType('path')}
                className={`flex-1 p-3 rounded-xl border ${linkType === 'path' ? 'border-blue-500 bg-blue-500/10' : 'border-zinc-700 bg-zinc-800'}`}
              >
                <View className="flex-row items-center gap-2 mb-1">
                  <Route size={18} color={linkType === 'path' ? COLORS.blue : COLORS.zinc400} />
                  <Text
                    className="font-bold text-sm"
                    style={{ color: linkType === 'path' ? COLORS.blue : COLORS.zinc400 }}
                  >
                    Ruta
                  </Text>
                </View>
                <Text className="text-zinc-500 text-xs">trens.app/slug</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => setLinkType('subdomain')}
                className={`flex-1 p-3 rounded-xl border ${linkType === 'subdomain' ? 'border-purple-500 bg-purple-500/10' : 'border-zinc-700 bg-zinc-800'}`}
              >
                <View className="flex-row items-center gap-2 mb-1">
                  <Globe
                    size={18}
                    color={linkType === 'subdomain' ? COLORS.purple : COLORS.zinc400}
                  />
                  <Text
                    className="font-bold text-sm"
                    style={{ color: linkType === 'subdomain' ? COLORS.purple : COLORS.zinc400 }}
                  >
                    Subdominio
                  </Text>
                </View>
                <Text className="text-zinc-500 text-xs">slug.trens.app</Text>
              </TouchableOpacity>
            </View>

            {/* Label */}
            <Text className="text-zinc-400 text-xs font-mono mb-2 uppercase">
              Nombre descriptivo
            </Text>
            <TextInput
              className="bg-black border border-zinc-700 rounded-xl px-4 py-3 text-white mb-4"
              placeholder="Ej: WhatsApp Asesoría"
              placeholderTextColor="#71717A"
              value={label}
              onChangeText={setLabel}
            />

            {/* Slug */}
            <Text className="text-zinc-400 text-xs font-mono mb-2 uppercase">Slug</Text>
            <TextInput
              className="bg-black border border-zinc-700 rounded-xl px-4 py-3 text-white font-mono mb-1"
              placeholder="asesoria"
              placeholderTextColor="#71717A"
              value={slug}
              onChangeText={(t) => setSlug(t.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Text className="text-zinc-500 text-xs mb-4">Solo letras, números y guiones</Text>

            {/* Preview */}
            <View className="bg-black/50 rounded-xl p-3 border border-zinc-800 mb-5">
              <Text className="text-zinc-500 text-xs font-mono mb-1">PREVIEW</Text>
              <Text
                className="font-mono text-base font-bold"
                style={{ color: linkType === 'subdomain' ? COLORS.purple : COLORS.blue }}
              >
                {preview}
              </Text>
            </View>

            {/* Destino: selector de modo */}
            <Text className="text-zinc-400 text-xs font-mono mb-2 uppercase">Destino</Text>
            <View className="flex-row gap-3 mb-4">
              <TouchableOpacity
                onPress={() => setDestMode('url')}
                className={`flex-1 p-3 rounded-xl border ${destMode === 'url' ? 'border-blue-500 bg-blue-500/10' : 'border-zinc-700 bg-zinc-800'}`}
              >
                <View className="flex-row items-center gap-2">
                  <ExternalLink
                    size={16}
                    color={destMode === 'url' ? COLORS.blue : COLORS.zinc400}
                  />
                  <Text
                    className="font-bold text-sm"
                    style={{ color: destMode === 'url' ? COLORS.blue : COLORS.zinc400 }}
                  >
                    URL
                  </Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => setDestMode('whatsapp')}
                className={`flex-1 p-3 rounded-xl border ${destMode === 'whatsapp' ? 'border-green-500 bg-green-500/10' : 'border-zinc-700 bg-zinc-800'}`}
              >
                <View className="flex-row items-center gap-2">
                  <MessageCircle
                    size={16}
                    color={destMode === 'whatsapp' ? COLORS.green : COLORS.zinc400}
                  />
                  <Text
                    className="font-bold text-sm"
                    style={{ color: destMode === 'whatsapp' ? COLORS.green : COLORS.zinc400 }}
                  >
                    WhatsApp
                  </Text>
                </View>
              </TouchableOpacity>
            </View>

            {destMode === 'whatsapp' ? (
              <>
                {/* Teléfono WhatsApp */}
                <Text className="text-zinc-400 text-xs font-mono mb-2 uppercase">
                  Número de WhatsApp
                </Text>
                <View className="flex-row items-center bg-black border border-zinc-700 rounded-xl px-4 py-3 mb-1">
                  <Phone size={16} color={COLORS.green} />
                  <TextInput
                    className="flex-1 text-white font-mono ml-2"
                    placeholder="521234567890"
                    placeholderTextColor="#71717A"
                    value={waPhone}
                    onChangeText={(t) => setWaPhone(t.replace(/[^0-9]/g, ''))}
                    keyboardType="phone-pad"
                  />
                </View>
                <Text className="text-zinc-500 text-xs mb-4">
                  Con código de país sin + (ej: 52 para México)
                </Text>

                {/* Mensaje predefinido */}
                <Text className="text-zinc-400 text-xs font-mono mb-2 uppercase">
                  Mensaje predefinido (opcional)
                </Text>
                <TextInput
                  className="bg-black border border-zinc-700 rounded-xl px-4 py-3 text-white mb-1"
                  placeholder="Hola, me interesa una asesoría..."
                  placeholderTextColor="#71717A"
                  value={waMessage}
                  onChangeText={setWaMessage}
                  multiline
                  numberOfLines={3}
                  style={{ minHeight: 80, textAlignVertical: 'top' }}
                />
                <Text className="text-zinc-500 text-xs mb-4">
                  Texto que aparecerá pre-escrito al abrir WhatsApp
                </Text>

                {/* Preview URL generada */}
                {finalUrl ? (
                  <View className="bg-green-500/5 rounded-xl p-3 border border-green-500/20 mb-5">
                    {waMessage.trim() ? (
                      <>
                        <Text className="text-zinc-500 text-xs font-mono mb-1">
                          MENSAJE EN WHATSAPP
                        </Text>
                        <View className="bg-black/30 rounded-lg p-2 mb-2">
                          <Text className="text-white text-sm">{waMessage.trim()}</Text>
                        </View>
                      </>
                    ) : null}
                    <Text className="text-zinc-500 text-xs font-mono mb-1">URL GENERADA</Text>
                    <Text className="text-green-400 text-xs font-mono" numberOfLines={3}>
                      {finalUrl}
                    </Text>
                    <Text className="text-zinc-600 text-xs mt-1">
                      Los emojis se codifican en la URL pero WhatsApp los muestra correctamente
                    </Text>
                  </View>
                ) : null}
              </>
            ) : (
              <>
                {/* URL destino manual */}
                <Text className="text-zinc-400 text-xs font-mono mb-2 uppercase">
                  URL de destino
                </Text>
                <TextInput
                  className="bg-black border border-zinc-700 rounded-xl px-4 py-3 text-white font-mono mb-1"
                  placeholder="https://ejemplo.com/pagina"
                  placeholderTextColor="#71717A"
                  value={destinationUrl}
                  onChangeText={setDestinationUrl}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                  multiline
                />
                <Text className="text-zinc-500 text-xs mb-5">URL completa incluyendo https://</Text>
              </>
            )}

            {/* Botón guardar */}
            <TouchableOpacity
              onPress={() =>
                onSave({
                  slug,
                  destination_url: finalUrl,
                  link_type: linkType,
                  label: label || undefined,
                })
              }
              disabled={!slug || !finalUrl || saving}
              className={`rounded-xl py-4 items-center mb-8 ${!slug || !finalUrl || saving ? 'bg-zinc-700' : 'bg-blue-600'}`}
            >
              {saving ? (
                <ActivityIndicator color={COLORS.white} />
              ) : (
                <Text className="text-white font-bold text-base">
                  {editingLink ? 'Guardar Cambios' : 'Crear Enlace'}
                </Text>
              )}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ============================================================================
// MAIN SCREEN
// ============================================================================
export default function LinksScreen() {
  const [links, setLinks] = useState<ShortLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'path' | 'subdomain'>('all');

  // Modal state
  const [modalVisible, setModalVisible] = useState(false);
  const [editingLink, setEditingLink] = useState<ShortLink | null>(null);
  const [saving, setSaving] = useState(false);

  // Stats
  const [stats, setStats] = useState({
    total: 0,
    active: 0,
    totalClicks: 0,
    paths: 0,
    subdomains: 0,
  });

  // ========================================
  // FETCH DATA
  // ========================================
  const fetchData = useCallback(async () => {
    try {
      const [linksData, statsData] = await Promise.all([
        adminLinks.getAll(),
        adminLinks.getStats(),
      ]);
      setLinks(linksData);
      setStats(statsData);
    } catch (err: any) {
      Alert.alert('Error', err.message);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      fetchData().finally(() => setLoading(false));
    }, [fetchData])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  }, [fetchData]);

  // ========================================
  // ACTIONS
  // ========================================
  const handleSave = useCallback(
    async (input: CreateShortLinkInput) => {
      setSaving(true);
      try {
        if (editingLink) {
          await adminLinks.update(editingLink.id, input);
        } else {
          await adminLinks.create(input);
        }
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setModalVisible(false);
        setEditingLink(null);
        fetchData();
      } catch (err: any) {
        Alert.alert('Error', err.message);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      } finally {
        setSaving(false);
      }
    },
    [editingLink, fetchData]
  );

  const handleDelete = useCallback(
    (link: ShortLink) => {
      const doDelete = async () => {
        try {
          await adminLinks.delete(link.id);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          fetchData();
        } catch (err: any) {
          Alert.alert('Error', err.message);
        }
      };

      if (Platform.OS === 'web') {
        if (confirm(`¿Eliminar "${link.label || link.slug}"?`)) doDelete();
      } else {
        Alert.alert('Eliminar enlace', `¿Eliminar "${link.label || link.slug}"?`, [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Eliminar', style: 'destructive', onPress: doDelete },
        ]);
      }
    },
    [fetchData]
  );

  const handleToggle = useCallback(
    async (link: ShortLink) => {
      try {
        await adminLinks.update(link.id, { is_active: !link.is_active });
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        fetchData();
      } catch (err: any) {
        Alert.alert('Error', err.message);
      }
    },
    [fetchData]
  );

  const handleCopy = useCallback(async (link: ShortLink) => {
    const isSubdomain = link.link_type === 'subdomain';
    const url = isSubdomain ? `https://${link.slug}.trens.app` : `https://trens.app/${link.slug}`;

    await Clipboard.setStringAsync(url);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    if (Platform.OS === 'web') {
      // Web: usar toast o alert simple
      alert(`Copiado: ${url}`);
    } else {
      Alert.alert('Copiado', url);
    }
  }, []);

  const handleResetClicks = useCallback(
    (link: ShortLink) => {
      const doReset = async () => {
        try {
          await adminLinks.resetClicks(link.id);
          fetchData();
        } catch (err: any) {
          Alert.alert('Error', err.message);
        }
      };

      if (Platform.OS === 'web') {
        if (confirm(`¿Resetear clicks de "${link.label || link.slug}"?`)) doReset();
      } else {
        Alert.alert('Resetear clicks', `¿Resetear clicks de "${link.label || link.slug}"?`, [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Resetear', onPress: doReset },
        ]);
      }
    },
    [fetchData]
  );

  // ========================================
  // FILTERED DATA
  // ========================================
  const filteredLinks = links.filter((link) => {
    const matchesSearch =
      !search ||
      link.slug.includes(search.toLowerCase()) ||
      link.label?.toLowerCase().includes(search.toLowerCase()) ||
      link.destination_url.toLowerCase().includes(search.toLowerCase());

    const matchesType = filterType === 'all' || link.link_type === filterType;

    return matchesSearch && matchesType;
  });

  // ========================================
  // LOADING STATE
  // ========================================
  if (loading) {
    return (
      <View className="flex-1 bg-black items-center justify-center">
        <ActivityIndicator size="large" color={COLORS.blue} />
        <Text className="text-zinc-400 mt-3 font-mono text-sm">Cargando enlaces...</Text>
      </View>
    );
  }

  // ========================================
  // RENDER
  // ========================================
  return (
    <View className="flex-1 bg-black">
      <ScrollView
        className="flex-1"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={COLORS.blue}
            colors={[COLORS.blue]}
          />
        }
        keyboardShouldPersistTaps="handled"
      >
        <View className="p-4 pb-32">
          {/* Header */}
          <View className="flex-row items-center justify-between mb-4">
            <View className="flex-row items-center gap-2">
              <Link2 size={22} color={COLORS.blue} />
              <Text className="text-white font-bold text-xl">ENLACES</Text>
            </View>
            <TouchableOpacity
              onPress={() => {
                setEditingLink(null);
                setModalVisible(true);
              }}
              className="bg-blue-600 flex-row items-center gap-2 px-4 py-2 rounded-xl"
            >
              <Plus size={18} color={COLORS.white} />
              <Text className="text-white font-bold text-sm">Nuevo</Text>
            </TouchableOpacity>
          </View>

          {/* Stats */}
          <View className="flex-row gap-3 mb-4">
            <StatCard title="TOTAL" value={stats.total} icon={Link2} color={COLORS.blue} />
            <StatCard
              title="CLICKS"
              value={stats.totalClicks}
              icon={MousePointerClick}
              color={COLORS.cyan}
            />
            <StatCard
              title="ACTIVOS"
              value={stats.active}
              icon={ToggleRight}
              color={COLORS.green}
            />
          </View>

          {/* Search */}
          <View className="bg-zinc-900 rounded-xl flex-row items-center px-3 border border-zinc-800 mb-3">
            <Search size={18} color={COLORS.zinc500} />
            <TextInput
              className="flex-1 text-white py-3 px-2"
              placeholder="Buscar enlace..."
              placeholderTextColor="#71717A"
              value={search}
              onChangeText={setSearch}
            />
            {search ? (
              <TouchableOpacity onPress={() => setSearch('')}>
                <X size={18} color={COLORS.zinc400} />
              </TouchableOpacity>
            ) : null}
          </View>

          {/* Filter pills */}
          <View className="flex-row gap-2 mb-5">
            {[
              { key: 'all' as const, label: 'Todos', count: stats.total },
              { key: 'path' as const, label: 'Rutas', count: stats.paths },
              { key: 'subdomain' as const, label: 'Subdominios', count: stats.subdomains },
            ].map((f) => (
              <TouchableOpacity
                key={f.key}
                onPress={() => setFilterType(f.key)}
                className={`px-3 py-2 rounded-lg ${filterType === f.key ? 'bg-blue-600' : 'bg-zinc-800'}`}
              >
                <Text
                  className={`text-xs font-mono font-bold ${filterType === f.key ? 'text-white' : 'text-zinc-400'}`}
                >
                  {f.label} ({f.count})
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Links list */}
          {filteredLinks.length === 0 ? (
            <View className="items-center justify-center py-16">
              <Link2 size={48} color={COLORS.zinc800} />
              <Text className="text-zinc-500 mt-4 font-mono text-sm">
                {search ? 'Sin resultados' : 'No hay enlaces creados'}
              </Text>
              {!search && (
                <TouchableOpacity
                  onPress={() => {
                    setEditingLink(null);
                    setModalVisible(true);
                  }}
                  className="mt-4 bg-zinc-800 px-4 py-2 rounded-lg"
                >
                  <Text className="text-blue-400 font-bold text-sm">Crear primer enlace</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : (
            <View className="gap-3">
              {filteredLinks.map((link) => (
                <LinkCard
                  key={link.id}
                  link={link}
                  onEdit={() => {
                    setEditingLink(link);
                    setModalVisible(true);
                  }}
                  onDelete={() => handleDelete(link)}
                  onToggle={() => handleToggle(link)}
                  onCopy={() => handleCopy(link)}
                  onResetClicks={() => handleResetClicks(link)}
                />
              ))}
            </View>
          )}
        </View>
      </ScrollView>

      {/* Form Modal */}
      <LinkFormModal
        visible={modalVisible}
        onClose={() => {
          setModalVisible(false);
          setEditingLink(null);
        }}
        onSave={handleSave}
        editingLink={editingLink}
        saving={saving}
      />
    </View>
  );
}
