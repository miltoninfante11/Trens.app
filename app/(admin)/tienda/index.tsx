import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  Image,
  ActivityIndicator,
  RefreshControl,
  Switch,
  Platform,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import {
  ShoppingBag,
  Plus,
  Pencil,
  Trash2,
  Search,
  X,
  Package,
  Tag,
  ListOrdered,
  Star,
  Image as ImageIcon,
  Upload,
  Eye,
  EyeOff,
  ChevronLeft,
  RefreshCcw,
  Truck,
  Check,
  Pill,
  Syringe,
  FlaskConical,
  Droplets,
} from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { Alert } from '../../../lib/alert';
import * as Haptics from '../../../lib/haptics';
import { shopAdmin, ShopProduct, ShopCategory, ShopOrder } from '../../../services/shop';
import cloudflareR2 from '../../../services/cloudflare/r2';

const COLORS = {
  red: '#DC2626',
  blue: '#3B82F6',
  green: '#22C55E',
  yellow: '#EAB308',
  orange: '#F97316',
  purple: '#8B5CF6',
  white: '#FFFFFF',
  zinc400: '#A1A1AA',
  zinc500: '#71717A',
  zinc700: '#3F3F46',
  zinc800: '#27272a',
};

type Tab = 'products' | 'orders';

const STATUS_COLORS: Record<string, string> = {
  pending: COLORS.yellow,
  paid: COLORS.green,
  preparing: COLORS.blue,
  shipped: COLORS.purple,
  delivered: COLORS.green,
  cancelled: COLORS.zinc500,
  refunded: COLORS.orange,
};

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pendiente',
  paid: 'Pagado',
  preparing: 'Preparando',
  shipped: 'Enviado',
  delivered: 'Entregado',
  cancelled: 'Cancelado',
  refunded: 'Reembolsado',
};

export default function AdminTiendaScreen() {
  const [tab, setTab] = useState<Tab>('products');
  const [products, setProducts] = useState<ShopProduct[]>([]);
  const [orders, setOrders] = useState<ShopOrder[]>([]);
  const [categories, setCategories] = useState<ShopCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');

  // Product modal
  const [productModalVisible, setProductModalVisible] = useState(false);
  const [editingProduct, setEditingProduct] = useState<ShopProduct | null>(null);
  const [productForm, setProductForm] = useState<Partial<ShopProduct>>({});
  const [uploadingImage, setUploadingImage] = useState(false);

  // Order modal
  const [orderModalVisible, setOrderModalVisible] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<ShopOrder | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  // Load data
  const loadData = useCallback(async () => {
    try {
      const [prods, orderList, cats] = await Promise.all([
        shopAdmin.listAllProducts().catch(() => []),
        shopAdmin.listOrders({ status: statusFilter || undefined }).catch(() => []),
        // categorías se leen vía supabase directo
        (async () => {
          const { shop } = await import('../../../services/shop');
          return shop.listCategories().catch(() => []);
        })(),
      ]);
      setProducts(prods);
      setOrders(orderList);
      setCategories(cats);
    } catch (e: any) {
      console.error('Error loading shop admin data:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [statusFilter]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = () => {
    setRefreshing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    loadData();
  };

  // ==========================================================================
  // PRODUCT HANDLERS
  // ==========================================================================
  const openCreateProduct = () => {
    setEditingProduct(null);
    setProductForm({
      name: '',
      slug: '',
      description: '',
      short_description: '',
      price: 0,
      cost_price: undefined,
      is_digital: false,
      stock: 0,
      stock_unlimited: false,
      images: [],
      thumbnail_url: '',
      is_active: true,
      is_featured: false,
      shipping_required: true,
      sort_order: 0,
      tags: [],
    });
    setProductModalVisible(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  const openEditProduct = (p: ShopProduct) => {
    setEditingProduct(p);
    setProductForm({ ...p });
    setProductModalVisible(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const generateSlug = (name: string) =>
    name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

  const saveProduct = async () => {
    try {
      if (!productForm.name || !productForm.price) {
        Alert.alert('Error', 'Nombre y precio son requeridos');
        return;
      }
      const slug = productForm.slug || generateSlug(productForm.name);
      // Limpiar payload: quitar relaciones (category) y columnas auto-managed
      // que rompen el UPDATE en Supabase
      const {
        id: _id,
        created_at: _ca,
        updated_at: _ua,
        category: _cat,
        ...cleanForm
      } = productForm as any;

      const payload: Partial<ShopProduct> = {
        ...cleanForm,
        slug,
        price: Number(productForm.price),
        stock: Number(productForm.stock) || 0,
        compare_at_price: productForm.compare_at_price
          ? Number(productForm.compare_at_price)
          : null,
        cost_price:
          productForm.cost_price !== undefined &&
          productForm.cost_price !== null &&
          String(productForm.cost_price) !== ''
            ? Number(productForm.cost_price)
            : null,
      };

      if (editingProduct) {
        await shopAdmin.updateProduct(editingProduct.id, payload);
      } else {
        await shopAdmin.createProduct(payload);
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setProductModalVisible(false);
      loadData();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  const deleteProduct = (p: ShopProduct) => {
    Alert.alert('Eliminar producto', `¿Eliminar "${p.name}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: async () => {
          try {
            await shopAdmin.deleteProduct(p.id);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            loadData();
          } catch (e: any) {
            Alert.alert('Error', e.message);
          }
        },
      },
    ]);
  };

  const uploadProductImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.9,
        base64: true,
      });
      if (result.canceled || !result.assets[0]) return;

      setUploadingImage(true);
      const asset = result.assets[0];
      const manipulated = await ImageManipulator.manipulateAsync(
        asset.uri,
        [{ resize: { width: 1000 } }],
        { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG, base64: true }
      );
      if (!manipulated.base64) throw new Error('Error procesando imagen');

      const productId = editingProduct?.id || `new-${Date.now()}`;
      const key = `shop/products/${productId}-${Date.now()}.jpg`;
      const upload = await cloudflareR2.uploadFromBase64(manipulated.base64, key, 'image/jpeg');
      if (!upload?.url) throw new Error('Error subiendo a R2');

      const newImages = [...(productForm.images || []), upload.url];
      setProductForm({
        ...productForm,
        images: newImages,
        thumbnail_url: productForm.thumbnail_url || upload.url,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setUploadingImage(false);
    }
  };

  const removeImage = (url: string) => {
    const newImages = (productForm.images || []).filter((u) => u !== url);
    setProductForm({
      ...productForm,
      images: newImages,
      thumbnail_url: productForm.thumbnail_url === url ? newImages[0] : productForm.thumbnail_url,
    });
  };

  // ==========================================================================
  // ORDER HANDLERS
  // ==========================================================================
  const openOrder = (o: ShopOrder) => {
    setSelectedOrder(o);
    setOrderModalVisible(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const updateOrderStatus = async (orderId: string, status: ShopOrder['status']) => {
    try {
      await shopAdmin.updateOrder(orderId, { status });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setOrderModalVisible(false);
      loadData();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  const refundOrder = (o: ShopOrder) => {
    Alert.alert('Reembolsar', `¿Reembolsar S/ ${o.total} a ${o.email}?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Reembolsar',
        style: 'destructive',
        onPress: async () => {
          try {
            await shopAdmin.refundOrder(o.id);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            setOrderModalVisible(false);
            loadData();
          } catch (e: any) {
            Alert.alert('Error', e.message);
          }
        },
      },
    ]);
  };

  // ==========================================================================
  // RENDER
  // ==========================================================================
  if (loading) {
    return (
      <View className="flex-1 bg-black items-center justify-center">
        <ActivityIndicator size="large" color={COLORS.red} />
        <Text className="text-zinc-400 font-mono mt-3">Cargando tienda...</Text>
      </View>
    );
  }

  const filteredProducts = products.filter((p) =>
    !search ? true : p.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <View className="flex-1 bg-black">
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 120 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.red} />
        }
      >
        {/* Header */}
        <View className="px-4 pt-4 pb-2">
          <View className="flex-row items-center gap-3 mb-2">
            <ShoppingBag size={24} color={COLORS.red} />
            <Text className="text-white text-xl font-bold tracking-wider">TIENDA</Text>
          </View>
          <Text className="text-zinc-500 text-sm font-mono">
            Gestión de productos, órdenes y catálogo de la tienda TRENS.
          </Text>
        </View>

        {/* Tab switcher */}
        <View className="flex-row gap-2 px-4 mb-4 mt-2">
          <TouchableOpacity
            onPress={() => setTab('products')}
            className={`flex-1 flex-row items-center justify-center gap-2 py-3 rounded-xl ${
              tab === 'products' ? 'bg-red-600' : 'bg-zinc-900 border border-zinc-800'
            }`}
          >
            <Package size={16} color={COLORS.white} />
            <Text className="text-white font-mono font-bold text-xs">
              PRODUCTOS ({products.length})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setTab('orders')}
            className={`flex-1 flex-row items-center justify-center gap-2 py-3 rounded-xl ${
              tab === 'orders' ? 'bg-red-600' : 'bg-zinc-900 border border-zinc-800'
            }`}
          >
            <ListOrdered size={16} color={COLORS.white} />
            <Text className="text-white font-mono font-bold text-xs">
              ÓRDENES ({orders.length})
            </Text>
          </TouchableOpacity>
        </View>

        {/* PRODUCTS TAB */}
        {tab === 'products' && (
          <View className="px-4">
            <View className="flex-row gap-2 mb-3">
              <View className="flex-1 bg-zinc-900 rounded-xl flex-row items-center px-3 border border-zinc-800">
                <Search size={16} color={COLORS.zinc500} />
                <TextInput
                  className="flex-1 text-white py-3 px-2 font-mono text-sm"
                  placeholder="Buscar producto..."
                  placeholderTextColor={COLORS.zinc500}
                  value={search}
                  onChangeText={setSearch}
                />
              </View>
              <TouchableOpacity
                onPress={openCreateProduct}
                className="bg-red-600 flex-row items-center gap-2 px-4 rounded-xl"
              >
                <Plus size={18} color={COLORS.white} />
                <Text className="text-white font-bold text-sm">Nuevo</Text>
              </TouchableOpacity>
            </View>

            {filteredProducts.length === 0 ? (
              <View className="items-center justify-center py-16">
                <Package size={48} color={COLORS.zinc800} />
                <Text className="text-zinc-500 mt-4 font-mono text-sm">
                  {search ? 'Sin resultados' : 'No hay productos'}
                </Text>
              </View>
            ) : (
              filteredProducts.map((p) => (
                <View
                  key={p.id}
                  className="bg-zinc-900 border border-zinc-800 rounded-2xl p-3 mb-3 flex-row gap-3"
                >
                  <View className="w-20 h-20 rounded-xl bg-zinc-800 overflow-hidden">
                    {p.thumbnail_url ? (
                      <Image source={{ uri: p.thumbnail_url }} className="w-full h-full" />
                    ) : (
                      <View className="w-full h-full items-center justify-center">
                        <ImageIcon size={28} color={COLORS.zinc700} />
                      </View>
                    )}
                  </View>
                  <View className="flex-1">
                    <View className="flex-row items-center gap-2">
                      <Text className="text-white font-bold text-base flex-1" numberOfLines={1}>
                        {p.name}
                      </Text>
                      {p.is_featured && (
                        <Star size={14} color={COLORS.yellow} fill={COLORS.yellow} />
                      )}
                      {p.is_active ? (
                        <Eye size={14} color={COLORS.green} />
                      ) : (
                        <EyeOff size={14} color={COLORS.zinc500} />
                      )}
                    </View>
                    <Text className="text-zinc-500 font-mono text-xs mt-1" numberOfLines={1}>
                      {p.slug}
                    </Text>
                    <View className="flex-row items-center gap-3 mt-2 flex-wrap">
                      <Text className="text-red-500 font-bold text-base">
                        S/ {Number(p.price).toFixed(2)}
                      </Text>
                      {p.cost_price ? (
                        <Text className="text-yellow-500 font-mono text-[10px]">
                          Costo S/ {Number(p.cost_price).toFixed(2)} · +S/{' '}
                          {(Number(p.price) - Number(p.cost_price)).toFixed(2)}
                        </Text>
                      ) : null}
                      <View className="bg-zinc-800 px-2 py-0.5 rounded">
                        <Text className="text-zinc-300 font-mono text-[10px]">
                          {p.is_digital ? 'DIGITAL' : `STOCK: ${p.stock_unlimited ? '∞' : p.stock}`}
                        </Text>
                      </View>
                    </View>
                  </View>
                  <View className="gap-2">
                    <TouchableOpacity
                      onPress={() => openEditProduct(p)}
                      className="bg-blue-600/20 p-2 rounded-lg"
                    >
                      <Pencil size={16} color={COLORS.blue} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => deleteProduct(p)}
                      className="bg-red-600/20 p-2 rounded-lg"
                    >
                      <Trash2 size={16} color={COLORS.red} />
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            )}
          </View>
        )}

        {/* ORDERS TAB */}
        {tab === 'orders' && (
          <View className="px-4">
            {/* Status filter pills */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              className="mb-3"
              contentContainerStyle={{ gap: 8 }}
            >
              {[
                null,
                'pending',
                'paid',
                'preparing',
                'shipped',
                'delivered',
                'cancelled',
                'refunded',
              ].map((s) => (
                <TouchableOpacity
                  key={s || 'all'}
                  onPress={() => setStatusFilter(s)}
                  className={`px-3 py-2 rounded-lg ${
                    statusFilter === s ? 'bg-red-600' : 'bg-zinc-800'
                  }`}
                >
                  <Text className="text-white font-mono text-xs font-bold">
                    {s ? STATUS_LABELS[s].toUpperCase() : 'TODAS'}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {orders.length === 0 ? (
              <View className="items-center justify-center py-16">
                <ListOrdered size={48} color={COLORS.zinc800} />
                <Text className="text-zinc-500 mt-4 font-mono text-sm">No hay órdenes</Text>
              </View>
            ) : (
              orders.map((o) => (
                <TouchableOpacity
                  key={o.id}
                  onPress={() => openOrder(o)}
                  className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 mb-3"
                  activeOpacity={0.7}
                >
                  <View className="flex-row items-center justify-between mb-2">
                    <Text className="text-white font-bold font-mono text-sm">{o.order_number}</Text>
                    <View
                      className="px-2 py-0.5 rounded"
                      style={{ backgroundColor: `${STATUS_COLORS[o.status]}20` }}
                    >
                      <Text
                        className="font-mono text-[10px] font-bold"
                        style={{ color: STATUS_COLORS[o.status] }}
                      >
                        {STATUS_LABELS[o.status].toUpperCase()}
                      </Text>
                    </View>
                  </View>
                  <Text className="text-zinc-300 text-sm">{o.full_name}</Text>
                  <Text className="text-zinc-500 font-mono text-xs">{o.email}</Text>
                  <View className="flex-row items-center justify-between mt-2">
                    <Text className="text-zinc-500 font-mono text-xs">
                      {o.payment_method === 'card' ? '💳 Tarjeta' : '💬 WhatsApp'} •{' '}
                      {o.items?.length || 0} item(s)
                    </Text>
                    <Text className="text-red-500 font-bold">S/ {Number(o.total).toFixed(2)}</Text>
                  </View>
                </TouchableOpacity>
              ))
            )}
          </View>
        )}
      </ScrollView>

      {/* PRODUCT MODAL */}
      <Modal
        visible={productModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setProductModalVisible(false)}
      >
        <View className="flex-1 bg-black">
          <View className="flex-row items-center justify-between px-4 py-4 border-b border-zinc-800">
            <TouchableOpacity onPress={() => setProductModalVisible(false)}>
              <X size={24} color={COLORS.white} />
            </TouchableOpacity>
            <Text className="text-white font-bold text-lg">
              {editingProduct ? 'Editar' : 'Nuevo'} Producto
            </Text>
            <TouchableOpacity onPress={saveProduct}>
              <Text className="text-red-500 font-bold">Guardar</Text>
            </TouchableOpacity>
          </View>
          <ScrollView className="flex-1 p-4" contentContainerStyle={{ paddingBottom: 60 }}>
            {/* Imágenes */}
            <Text className="text-zinc-400 font-mono text-xs mb-2">IMÁGENES</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              className="mb-4"
              contentContainerStyle={{ gap: 8 }}
            >
              {(productForm.images || []).map((url, i) => (
                <View key={i} className="relative">
                  <Image source={{ uri: url }} className="w-24 h-24 rounded-xl" />
                  <TouchableOpacity
                    onPress={() => removeImage(url)}
                    className="absolute top-1 right-1 bg-black/70 rounded-full p-1"
                  >
                    <X size={12} color={COLORS.white} />
                  </TouchableOpacity>
                  {productForm.thumbnail_url === url && (
                    <View className="absolute bottom-1 left-1 bg-red-600 rounded px-1">
                      <Text className="text-white text-[8px] font-mono">PRINCIPAL</Text>
                    </View>
                  )}
                </View>
              ))}
              <TouchableOpacity
                onPress={uploadProductImage}
                disabled={uploadingImage}
                className="w-24 h-24 rounded-xl bg-zinc-900 border border-dashed border-zinc-700 items-center justify-center"
              >
                {uploadingImage ? (
                  <ActivityIndicator color={COLORS.white} />
                ) : (
                  <Upload size={24} color={COLORS.zinc500} />
                )}
              </TouchableOpacity>
            </ScrollView>

            {/* Form fields */}
            <Field
              label="Nombre"
              value={productForm.name || ''}
              onChange={(v) => setProductForm({ ...productForm, name: v })}
            />
            <Field
              label="Slug (URL)"
              value={productForm.slug || ''}
              onChange={(v) => setProductForm({ ...productForm, slug: v })}
              placeholder="auto desde nombre"
            />
            <Field
              label="Descripción corta"
              value={productForm.short_description || ''}
              onChange={(v) => setProductForm({ ...productForm, short_description: v })}
            />
            <Field
              label="Descripción completa"
              value={productForm.description || ''}
              onChange={(v) => setProductForm({ ...productForm, description: v })}
              multiline
            />
            <Field
              label="Precio (PEN)"
              value={String(productForm.price ?? '')}
              onChange={(v) => setProductForm({ ...productForm, price: Number(v) || 0 })}
              keyboardType="decimal-pad"
            />
            <Field
              label="Precio antes (tachado, opcional)"
              value={String(productForm.compare_at_price ?? '')}
              onChange={(v) =>
                setProductForm({
                  ...productForm,
                  compare_at_price: v ? Number(v) : undefined,
                })
              }
              keyboardType="decimal-pad"
            />

            {/* COST PRICE - solo admin, finanzas internas */}
            <View className="bg-yellow-500/5 border border-yellow-500/20 rounded-xl p-3 mb-2">
              <View className="flex-row items-center gap-2 mb-1">
                <Text className="text-yellow-500 font-mono text-[10px] font-bold">
                  ¡ INTERNO · SOLO ADMIN
                </Text>
              </View>
              <Field
                label="Precio costo (PEN, opcional)"
                value={String(productForm.cost_price ?? '')}
                onChange={(v) =>
                  setProductForm({
                    ...productForm,
                    cost_price: v ? Number(v) : undefined,
                  })
                }
                keyboardType="decimal-pad"
              />
              {productForm.price && productForm.cost_price ? (
                <View className="mt-1 flex-row items-center gap-2 flex-wrap">
                  <Text className="text-zinc-400 font-mono text-xs">
                    Margen: S/{' '}
                    {(Number(productForm.price) - Number(productForm.cost_price)).toFixed(2)}
                  </Text>
                  <Text className="text-green-500 font-mono text-xs font-bold">
                    (
                    {(
                      ((Number(productForm.price) - Number(productForm.cost_price)) /
                        Number(productForm.price)) *
                      100
                    ).toFixed(1)}
                    %)
                  </Text>
                </View>
              ) : null}
            </View>

            {/* Categoría */}
            <Text className="text-zinc-400 font-mono text-xs mb-2 mt-2">CATEGORÍA</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              className="mb-3"
              contentContainerStyle={{ gap: 8 }}
            >
              {categories.map((c) => (
                <TouchableOpacity
                  key={c.id}
                  onPress={() => setProductForm({ ...productForm, category_id: c.id })}
                  className={`px-3 py-2 rounded-lg ${
                    productForm.category_id === c.id ? 'bg-red-600' : 'bg-zinc-800'
                  }`}
                >
                  <Text className="text-white font-mono text-xs">{c.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Tipo de suplemento — solo si la categoría seleccionada es "supplements" */}
            {(() => {
              const selectedCat = categories.find((c) => c.id === productForm.category_id);
              if (selectedCat?.slug !== 'supplements') return null;
              const SUPPLEMENT_TYPES: {
                key: 'pill' | 'syringe' | 'powder' | 'liquid';
                label: string;
                Icon: typeof Pill;
              }[] = [
                { key: 'pill', label: 'Oral', Icon: Pill },
                { key: 'syringe', label: 'Inyectable', Icon: Syringe },
                { key: 'powder', label: 'Polvo', Icon: FlaskConical },
                { key: 'liquid', label: 'Líquido', Icon: Droplets },
              ];
              return (
                <View className="mb-3">
                  <Text className="text-zinc-400 font-mono text-xs mb-2 mt-2">
                    TIPO DE SUPLEMENTO
                  </Text>
                  <View className="flex-row" style={{ gap: 8 }}>
                    {SUPPLEMENT_TYPES.map((t) => {
                      const active = productForm.supplement_type === t.key;
                      return (
                        <TouchableOpacity
                          key={t.key}
                          onPress={() =>
                            setProductForm({
                              ...productForm,
                              supplement_type: active ? undefined : t.key,
                            })
                          }
                          className={`flex-1 items-center justify-center py-3 rounded-lg ${
                            active ? 'bg-red-600' : 'bg-zinc-800'
                          }`}
                          style={{
                            borderWidth: 1,
                            borderColor: active ? '#DC2626' : '#27272a',
                          }}
                        >
                          <t.Icon
                            size={18}
                            color={active ? '#FFFFFF' : '#A1A1AA'}
                            strokeWidth={2.2}
                          />
                          <Text
                            className={`font-mono text-[10px] font-bold mt-1 tracking-widest ${
                              active ? 'text-white' : 'text-zinc-400'
                            }`}
                          >
                            {t.label.toUpperCase()}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  <Text className="text-zinc-500 font-mono text-[10px] mt-2 leading-4">
                    Se mostrará al usuario al vincular este producto desde MI STACK.
                  </Text>
                </View>
              );
            })()}

            {/* Toggles */}
            <Toggle
              label="Producto digital"
              hint="Sin envío, entrega vía email/acceso"
              value={!!productForm.is_digital}
              onChange={(v) =>
                setProductForm({
                  ...productForm,
                  is_digital: v,
                  shipping_required: v ? false : true,
                })
              }
            />
            <Toggle
              label="Requiere envío"
              value={!!productForm.shipping_required}
              onChange={(v) => setProductForm({ ...productForm, shipping_required: v })}
            />
            <Toggle
              label="Stock ilimitado"
              value={!!productForm.stock_unlimited}
              onChange={(v) => setProductForm({ ...productForm, stock_unlimited: v })}
            />
            {!productForm.stock_unlimited && !productForm.is_digital && (
              <Field
                label="Stock"
                value={String(productForm.stock ?? '')}
                onChange={(v) => setProductForm({ ...productForm, stock: Number(v) || 0 })}
                keyboardType="number-pad"
              />
            )}
            <Toggle
              label="Producto destacado"
              value={!!productForm.is_featured}
              onChange={(v) => setProductForm({ ...productForm, is_featured: v })}
            />
            <Toggle
              label="Activo"
              hint="Visible en la tienda"
              value={!!productForm.is_active}
              onChange={(v) => setProductForm({ ...productForm, is_active: v })}
            />
          </ScrollView>
        </View>
      </Modal>

      {/* ORDER MODAL */}
      <Modal
        visible={orderModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setOrderModalVisible(false)}
      >
        {selectedOrder && (
          <View className="flex-1 bg-black">
            <View className="flex-row items-center justify-between px-4 py-4 border-b border-zinc-800">
              <TouchableOpacity onPress={() => setOrderModalVisible(false)}>
                <X size={24} color={COLORS.white} />
              </TouchableOpacity>
              <Text className="text-white font-bold text-lg font-mono">
                {selectedOrder.order_number}
              </Text>
              <View style={{ width: 24 }} />
            </View>
            <ScrollView className="flex-1 p-4" contentContainerStyle={{ paddingBottom: 80 }}>
              {/* Status */}
              <View
                className="rounded-xl p-3 mb-4"
                style={{ backgroundColor: `${STATUS_COLORS[selectedOrder.status]}20` }}
              >
                <Text
                  className="font-bold text-center text-base"
                  style={{ color: STATUS_COLORS[selectedOrder.status] }}
                >
                  {STATUS_LABELS[selectedOrder.status].toUpperCase()}
                </Text>
              </View>

              {/* Cliente */}
              <Section title="CLIENTE">
                <Row label="Nombre" value={selectedOrder.full_name} />
                <Row label="Email" value={selectedOrder.email} />
                <Row label="Teléfono" value={selectedOrder.phone || '—'} />
              </Section>

              {/* Items */}
              <Section title="PRODUCTOS">
                {selectedOrder.items?.map((it) => (
                  <View
                    key={it.id}
                    className="flex-row items-center gap-3 py-2 border-b border-zinc-900"
                  >
                    {it.thumbnail_url ? (
                      <Image source={{ uri: it.thumbnail_url }} className="w-12 h-12 rounded-lg" />
                    ) : (
                      <View className="w-12 h-12 rounded-lg bg-zinc-800 items-center justify-center">
                        <Package size={20} color={COLORS.zinc500} />
                      </View>
                    )}
                    <View className="flex-1">
                      <Text className="text-white font-bold text-sm">{it.product_name}</Text>
                      <Text className="text-zinc-500 font-mono text-xs">
                        x{it.quantity} • S/ {Number(it.unit_price).toFixed(2)}
                      </Text>
                    </View>
                    <Text className="text-white font-bold">
                      S/ {Number(it.subtotal).toFixed(2)}
                    </Text>
                  </View>
                ))}
              </Section>

              {/* Pago */}
              <Section title="PAGO">
                <Row
                  label="Método"
                  value={selectedOrder.payment_method === 'card' ? '💳 Tarjeta' : '💬 WhatsApp'}
                />
                {selectedOrder.card_last4 && (
                  <Row
                    label="Tarjeta"
                    value={`${selectedOrder.card_brand} ****${selectedOrder.card_last4}`}
                  />
                )}
                <Row label="Subtotal" value={`S/ ${Number(selectedOrder.subtotal).toFixed(2)}`} />
                <Row
                  label="Total"
                  value={`S/ ${Number(selectedOrder.total).toFixed(2)}`}
                  highlight
                />
              </Section>

              {/* Envío */}
              {selectedOrder.shipping_required && selectedOrder.shipping_address && (
                <Section title="DIRECCIÓN DE ENVÍO">
                  <Text className="text-white text-sm">
                    {selectedOrder.shipping_address.street}
                  </Text>
                  <Text className="text-zinc-400 text-sm">
                    {selectedOrder.shipping_address.district}, {selectedOrder.shipping_address.city}
                  </Text>
                  <Text className="text-zinc-400 text-sm">
                    {selectedOrder.shipping_address.region}
                  </Text>
                  {selectedOrder.shipping_address.reference && (
                    <Text className="text-zinc-500 text-xs mt-1 font-mono">
                      Ref: {selectedOrder.shipping_address.reference}
                    </Text>
                  )}
                </Section>
              )}

              {selectedOrder.customer_notes && (
                <Section title="NOTAS DEL CLIENTE">
                  <Text className="text-zinc-300 text-sm">{selectedOrder.customer_notes}</Text>
                </Section>
              )}

              {/* Acciones */}
              <Text className="text-zinc-400 font-mono text-xs mb-2 mt-4">CAMBIAR ESTADO</Text>
              <View className="flex-row flex-wrap gap-2 mb-4">
                {(['paid', 'preparing', 'shipped', 'delivered', 'cancelled'] as const).map((s) => (
                  <TouchableOpacity
                    key={s}
                    onPress={() => updateOrderStatus(selectedOrder.id, s)}
                    disabled={selectedOrder.status === s}
                    className={`flex-row items-center gap-1.5 px-3 py-2 rounded-lg ${
                      selectedOrder.status === s
                        ? 'bg-zinc-800 opacity-50'
                        : 'bg-zinc-900 border border-zinc-700'
                    }`}
                  >
                    {s === 'shipped' && <Truck size={14} color={STATUS_COLORS[s]} />}
                    {s === 'delivered' && <Check size={14} color={STATUS_COLORS[s]} />}
                    <Text className="text-white font-mono text-xs">{STATUS_LABELS[s]}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {selectedOrder.payment_method === 'card' && selectedOrder.status === 'paid' && (
                <TouchableOpacity
                  onPress={() => refundOrder(selectedOrder)}
                  className="bg-orange-600/20 border border-orange-600 rounded-xl py-3 items-center"
                >
                  <Text className="text-orange-500 font-bold">
                    <RefreshCcw size={14} color={COLORS.orange} /> REEMBOLSAR
                  </Text>
                </TouchableOpacity>
              )}
            </ScrollView>
          </View>
        )}
      </Modal>
    </View>
  );
}

// ============================================================================
// HELPERS
// ============================================================================
function Field({
  label,
  value,
  onChange,
  multiline,
  keyboardType,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  multiline?: boolean;
  keyboardType?: any;
  placeholder?: string;
}) {
  return (
    <View className="mb-3">
      <Text className="text-zinc-400 font-mono text-xs mb-1">{label.toUpperCase()}</Text>
      <TextInput
        className="bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-3 text-white"
        value={value}
        onChangeText={onChange}
        multiline={multiline}
        numberOfLines={multiline ? 3 : 1}
        keyboardType={keyboardType}
        placeholder={placeholder}
        placeholderTextColor={COLORS.zinc500}
        style={{ textAlignVertical: multiline ? 'top' : 'center' }}
      />
    </View>
  );
}

function Toggle({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <View className="flex-row items-center justify-between bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-3 mb-2">
      <View className="flex-1">
        <Text className="text-white font-bold text-sm">{label}</Text>
        {hint && <Text className="text-zinc-500 font-mono text-xs mt-0.5">{hint}</Text>}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: COLORS.zinc800, true: COLORS.red }}
        thumbColor={COLORS.white}
      />
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 mb-3">
      <Text className="text-zinc-400 font-mono text-xs mb-2">{title}</Text>
      {children}
    </View>
  );
}

function Row({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <View className="flex-row items-center justify-between py-1.5">
      <Text className="text-zinc-500 font-mono text-xs">{label}</Text>
      <Text className={`text-sm ${highlight ? 'text-red-500 font-bold' : 'text-white font-mono'}`}>
        {value}
      </Text>
    </View>
  );
}
