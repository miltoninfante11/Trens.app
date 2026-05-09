// ============================================================================
// COMPOUND PRODUCT SEARCH MODAL — Buscador de productos de la tienda TRENS
// Usado en StackManagerModal para vincular un compuesto del Stack con un
// producto real del catálogo (habilita el filtro MI STACK y el bundle -10%).
// ============================================================================

import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  TextInput,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Search, X, Package, ShoppingBag, Check } from 'lucide-react-native';
import { Haptics } from '../../lib/haptics';
import shop, { ShopProduct } from '../../services/shop';

// ============================================================================
// TYPES
// ============================================================================
export interface SelectedShopProduct {
  productId: string;
  name: string;
  price: number;
  thumbnail_url?: string;
  category?: string;
  /** Tipo de suplemento (pill/syringe/powder/liquid) si el producto lo define. */
  supplementType?: 'pill' | 'syringe' | 'powder' | 'liquid';
}

interface CompoundProductSearchModalProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (product: SelectedShopProduct) => void;
  /** Si se pasa, prioriza productos cuya categoría coincida con este deporte. */
  sportHint?: string | null;
}

// ============================================================================
// MAIN
// ============================================================================
export const CompoundProductSearchModal: React.FC<CompoundProductSearchModalProps> = ({
  visible,
  onClose,
  onSelect,
  sportHint,
}) => {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [products, setProducts] = useState<ShopProduct[]>([]);
  const [loading, setLoading] = useState(false);

  // ---- Load on open ----
  // Solo carga productos de la categoría "supplements". El buscador del Stack
  // está destinado únicamente a vincular suplementos.
  useEffect(() => {
    if (!visible) return;
    let mounted = true;
    (async () => {
      setLoading(true);
      try {
        const prods = await shop.listProducts({ categorySlug: 'supplements' });
        if (!mounted) return;
        setProducts(prods);
      } catch (e) {
        console.warn('[CompoundProductSearch] load error', e);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [visible]);

  // ---- Reset when closed ----
  useEffect(() => {
    if (!visible) {
      setQuery('');
    }
  }, [visible]);

  // ---- Filtered list ----
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = products;
    if (q) {
      list = list.filter((p) => {
        const hay =
          `${p.name} ${p.short_description || ''} ${p.description || ''} ${(p.tags || []).join(' ')}`.toLowerCase();
        return hay.includes(q);
      });
    }
    // Boost: si hay sportHint, productos con tag/categoría que matchee suben.
    if (sportHint) {
      const hint = sportHint.toLowerCase();
      list = [...list].sort((a, b) => {
        const ah = `${a.category?.name || ''} ${(a.tags || []).join(' ')}`
          .toLowerCase()
          .includes(hint)
          ? 1
          : 0;
        const bh = `${b.category?.name || ''} ${(b.tags || []).join(' ')}`
          .toLowerCase()
          .includes(hint)
          ? 1
          : 0;
        return bh - ah;
      });
    }
    return list;
  }, [products, query, sportHint]);

  // ---- Handlers ----
  const handleSelect = useCallback(
    (p: ShopProduct) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onSelect({
        productId: p.id,
        name: p.name,
        price: Number(p.price),
        thumbnail_url: p.thumbnail_url,
        category: p.category?.name,
        supplementType: p.supplement_type,
      });
      onClose();
    },
    [onSelect, onClose]
  );

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1"
      >
        <View className="flex-1 bg-black/70 justify-end">
          <Pressable className="flex-1" onPress={onClose} />
          <View
            style={{
              backgroundColor: '#0a0a0a',
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              maxHeight: '90%',
              borderTopWidth: 2,
              borderTopColor: 'rgba(220, 38, 38, 0.5)',
              overflow: 'hidden',
            }}
          >
            {/* Top accent line */}
            <View
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                height: 3,
                backgroundColor: '#DC2626',
                shadowColor: '#DC2626',
                shadowOffset: { width: 0, height: 0 },
                shadowOpacity: 0.8,
                shadowRadius: 10,
                zIndex: 10,
              }}
            />

            {/* Drag indicator */}
            <View className="pt-4 pb-2 items-center">
              <View className="w-12 h-1.5 bg-zinc-700 rounded-full" />
            </View>

            {/* Header */}
            <View className="flex-row items-center justify-between px-4 pb-3 border-b border-zinc-800/60">
              <View className="flex-row items-center gap-2">
                <ShoppingBag size={18} color="#DC2626" />
                <Text className="text-white font-bold text-lg tracking-wider">
                  Buscar en tienda
                </Text>
              </View>
              <Pressable
                onPress={onClose}
                className="p-2 rounded-lg bg-zinc-900 active:bg-zinc-800"
              >
                <X size={18} color="#A1A1AA" />
              </Pressable>
            </View>

            {/* Search input */}
            <View className="px-4 pt-3">
              <View
                className="flex-row items-center gap-2 rounded-xl px-3 py-2.5"
                style={{
                  backgroundColor: 'rgba(15, 8, 8, 0.85)',
                  borderWidth: 1.5,
                  borderColor: 'rgba(220, 38, 38, 0.35)',
                }}
              >
                <Search size={16} color="#A1A1AA" />
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Creatina, proteína, pre-workout..."
                  placeholderTextColor="#52525B"
                  className="flex-1 text-white font-mono text-sm"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                {query.length > 0 && (
                  <Pressable onPress={() => setQuery('')} hitSlop={12}>
                    <X size={14} color="#71717A" />
                  </Pressable>
                )}
              </View>
            </View>

            {/* Results */}
            <ScrollView
              className="flex-1"
              contentContainerStyle={{
                paddingHorizontal: 16,
                paddingTop: 8,
                paddingBottom: Math.max(insets.bottom, 16) + 16,
              }}
              keyboardShouldPersistTaps="handled"
            >
              {loading ? (
                <View className="py-20 items-center">
                  <ActivityIndicator color="#DC2626" />
                </View>
              ) : filtered.length === 0 ? (
                <View className="py-16 items-center">
                  <Package size={40} color="#3F3F46" />
                  <Text className="text-zinc-500 font-mono text-xs mt-3 tracking-wider">
                    {query ? 'SIN RESULTADOS' : 'NO HAY PRODUCTOS'}
                  </Text>
                  <Text className="text-zinc-600 text-xs mt-1 text-center">
                    {query
                      ? 'Prueba con otra palabra clave o cambia de categoría.'
                      : 'Pídele al admin que cargue productos en la tienda.'}
                  </Text>
                </View>
              ) : (
                filtered.map((p) => (
                  <ResultRow key={p.id} product={p} onPress={() => handleSelect(p)} />
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

// ============================================================================
// SUBCOMPONENTS
// ============================================================================

const ResultRow: React.FC<{ product: ShopProduct; onPress: () => void }> = ({
  product: p,
  onPress,
}) => {
  const outOfStock = !p.stock_unlimited && !p.is_digital && p.stock === 0;
  return (
    <Pressable
      onPress={onPress}
      disabled={outOfStock}
      className="flex-row items-center gap-3 p-2.5 rounded-xl mb-2 active:bg-zinc-900"
      style={{
        backgroundColor: 'rgba(15, 8, 8, 0.7)',
        borderWidth: 1,
        borderColor: 'rgba(220, 38, 38, 0.18)',
        opacity: outOfStock ? 0.45 : 1,
      }}
    >
      <View
        style={{
          width: 56,
          height: 56,
          borderRadius: 10,
          overflow: 'hidden',
          backgroundColor: '#0a0505',
        }}
      >
        {p.thumbnail_url ? (
          <Image
            source={{ uri: p.thumbnail_url }}
            style={{ width: '100%', height: '100%' }}
            contentFit="cover"
            transition={120}
          />
        ) : (
          <View className="w-full h-full items-center justify-center">
            <ShoppingBag size={20} color="#3F3F46" />
          </View>
        )}
      </View>

      <View className="flex-1">
        <Text className="text-white font-bold text-sm" numberOfLines={1}>
          {p.name}
        </Text>
        <View className="flex-row items-center gap-2 mt-0.5">
          <Text className="text-fire-orange font-mono text-xs font-black">
            S/ {Number(p.price).toFixed(2)}
          </Text>
          {p.category?.name && (
            <Text className="text-zinc-500 font-mono text-[10px] uppercase tracking-wider">
              · {p.category.name}
            </Text>
          )}
        </View>
        {outOfStock && (
          <Text className="text-zinc-500 font-mono text-[9px] tracking-widest mt-0.5">AGOTADO</Text>
        )}
      </View>

      <View
        className="px-2.5 py-1.5 rounded-lg flex-row items-center gap-1"
        style={{
          backgroundColor: outOfStock ? 'rgba(63, 63, 70, 0.4)' : 'rgba(220, 38, 38, 0.15)',
          borderWidth: 1,
          borderColor: outOfStock ? 'rgba(63, 63, 70, 0.6)' : 'rgba(220, 38, 38, 0.5)',
        }}
      >
        <Check size={12} color={outOfStock ? '#52525B' : '#DC2626'} />
        <Text
          className="font-mono text-[10px] font-black tracking-widest"
          style={{ color: outOfStock ? '#52525B' : '#DC2626' }}
        >
          VINCULAR
        </Text>
      </View>
    </Pressable>
  );
};

export default CompoundProductSearchModal;
