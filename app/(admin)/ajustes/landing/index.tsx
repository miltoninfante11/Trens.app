// ============================================================================
// ADMIN: LANDING WEB — Gestión de banners flyers para shop.trens.app
// Carrusel arriba de las categorías de productos. Cada banner tiene:
//   - Imagen horizontal
//   - Enlace personalizado (URL externa o ruta interna)
//   - Orden y estado activo
// ============================================================================

import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Platform,
  Switch,
} from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Globe,
  Plus,
  Trash2,
  Upload,
  Link as LinkIcon,
  Move,
  ArrowUp,
  ArrowDown,
  Save,
  X,
  ImageIcon,
  Sparkles,
} from 'lucide-react-native';
import { Alert } from '../../../../lib/alert';
import { shopAdmin, ShopBanner, ShopLandingPromo } from '../../../../services/shop';
import cloudflareR2 from '../../../../services/cloudflare/r2';

const COLORS = {
  red: '#DC2626',
  rose: '#F43F5E',
  green: '#22C55E',
  zinc500: '#71717A',
  zinc700: '#3F3F46',
};

export default function AdminLandingWebScreen() {
  const insets = useSafeAreaInsets();
  const [banners, setBanners] = useState<ShopBanner[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  // Promo pill state
  const [promo, setPromo] = useState<ShopLandingPromo | null>(null);
  const [promoSaving, setPromoSaving] = useState(false);
  const [promoUploading, setPromoUploading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [list, p] = await Promise.all([shopAdmin.listBanners(), shopAdmin.getLandingPromo()]);
      setBanners(list);
      setPromo(
        p ?? {
          id: 'new',
          title: '1 MES DE ASESORÍA PROFESIONAL PERSONALIZADA',
          subtitle: '¡Por tiempo limitado!',
          image_url: '',
          link_url: '',
          is_active: false,
        }
      );
    } catch (e: any) {
      Alert.alert('Error', e.message || 'No se pudo cargar');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // ---------- CREATE ----------
  const handleCreate = useCallback(async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 0.92,
        base64: true,
      });
      if (result.canceled || !result.assets[0]) return;
      const asset = result.assets[0];

      setCreating(true);
      const manipulated = await ImageManipulator.manipulateAsync(
        asset.uri,
        [{ resize: { width: 1600 } }],
        {
          compress: 0.9,
          format: ImageManipulator.SaveFormat.JPEG,
          base64: true,
        }
      );
      if (!manipulated.base64) {
        Alert.alert('Error', 'No se pudo procesar la imagen');
        return;
      }

      const key = `app-assets/shop-banners/banner-${Date.now()}.jpg`;
      const upload = await cloudflareR2.uploadFromBase64(manipulated.base64, key, 'image/jpeg');
      if (!upload?.url) {
        Alert.alert('Error', upload?.error || 'No se pudo subir la imagen');
        return;
      }

      const sortOrder = banners.length;
      const created = await shopAdmin.createBanner({
        image_url: upload.url,
        link_url: '',
        title: '',
        sort_order: sortOrder,
        is_active: true,
      });
      setBanners((prev) => [...prev, created]);
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Error al crear banner');
    } finally {
      setCreating(false);
    }
  }, [banners.length]);

  // ---------- REPLACE IMAGE ----------
  const handleReplaceImage = useCallback(async (banner: ShopBanner) => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 0.92,
        base64: true,
      });
      if (result.canceled || !result.assets[0]) return;
      setUploadingId(banner.id);

      const manipulated = await ImageManipulator.manipulateAsync(
        result.assets[0].uri,
        [{ resize: { width: 1600 } }],
        { compress: 0.9, format: ImageManipulator.SaveFormat.JPEG, base64: true }
      );
      if (!manipulated.base64) return;

      const key = `app-assets/shop-banners/banner-${banner.id}-${Date.now()}.jpg`;
      const upload = await cloudflareR2.uploadFromBase64(manipulated.base64, key, 'image/jpeg');
      if (!upload?.url) {
        Alert.alert('Error', upload?.error || 'No se pudo subir');
        return;
      }
      const updated = await shopAdmin.updateBanner(banner.id, { image_url: upload.url });
      setBanners((prev) => prev.map((b) => (b.id === banner.id ? updated : b)));
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Error al reemplazar imagen');
    } finally {
      setUploadingId(null);
    }
  }, []);

  // ---------- UPDATE FIELDS ----------
  const updateField = (id: string, field: keyof ShopBanner, value: any) => {
    setBanners((prev) => prev.map((b) => (b.id === id ? { ...b, [field]: value } : b)));
  };

  const persistBanner = useCallback(async (banner: ShopBanner) => {
    setSavingId(banner.id);
    try {
      const updated = await shopAdmin.updateBanner(banner.id, {
        title: banner.title || '',
        link_url: banner.link_url || '',
        sort_order: banner.sort_order,
        is_active: banner.is_active,
      });
      setBanners((prev) => prev.map((b) => (b.id === banner.id ? updated : b)));
    } catch (e: any) {
      Alert.alert('Error', e.message || 'No se pudo guardar');
    } finally {
      setSavingId(null);
    }
  }, []);

  const toggleActive = useCallback(async (banner: ShopBanner) => {
    const next = !banner.is_active;
    updateField(banner.id, 'is_active', next);
    try {
      await shopAdmin.updateBanner(banner.id, { is_active: next });
    } catch (e: any) {
      updateField(banner.id, 'is_active', banner.is_active);
      Alert.alert('Error', e.message || 'No se pudo cambiar estado');
    }
  }, []);

  const moveBanner = useCallback(
    async (banner: ShopBanner, dir: -1 | 1) => {
      const idx = banners.findIndex((b) => b.id === banner.id);
      const target = idx + dir;
      if (target < 0 || target >= banners.length) return;
      const reordered = [...banners];
      [reordered[idx], reordered[target]] = [reordered[target], reordered[idx]];
      const withOrder = reordered.map((b, i) => ({ ...b, sort_order: i }));
      setBanners(withOrder);
      // Persist both swapped
      try {
        await Promise.all([
          shopAdmin.updateBanner(withOrder[idx].id, { sort_order: idx }),
          shopAdmin.updateBanner(withOrder[target].id, { sort_order: target }),
        ]);
      } catch (e: any) {
        Alert.alert('Error', e.message || 'No se pudo reordenar');
        load();
      }
    },
    [banners, load]
  );

  const handleDelete = useCallback((banner: ShopBanner) => {
    Alert.alert('Eliminar banner', '¿Eliminar este flyer del carrusel?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: async () => {
          try {
            await shopAdmin.deleteBanner(banner.id);
            setBanners((prev) => prev.filter((b) => b.id !== banner.id));
          } catch (e: any) {
            Alert.alert('Error', e.message || 'No se pudo eliminar');
          }
        },
      },
    ]);
  }, []);

  // ---------- PROMO PILL HANDLERS ----------
  const updatePromoField = (field: keyof ShopLandingPromo, value: any) => {
    setPromo((prev) => (prev ? { ...prev, [field]: value } : prev));
  };

  const handlePromoUploadImage = useCallback(async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.9,
        base64: true,
      });
      if (result.canceled || !result.assets[0]) return;
      setPromoUploading(true);

      const manipulated = await ImageManipulator.manipulateAsync(
        result.assets[0].uri,
        [{ resize: { width: 256, height: 256 } }],
        { compress: 0.9, format: ImageManipulator.SaveFormat.JPEG, base64: true }
      );
      if (!manipulated.base64) return;

      const key = `app-assets/shop-promo/promo-${Date.now()}.jpg`;
      const upload = await cloudflareR2.uploadFromBase64(manipulated.base64, key, 'image/jpeg');
      if (!upload?.url) {
        Alert.alert('Error', upload?.error || 'No se pudo subir');
        return;
      }
      setPromo((prev) => (prev ? { ...prev, image_url: upload.url ?? null } : prev));
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Error al subir imagen');
    } finally {
      setPromoUploading(false);
    }
  }, []);

  const handlePromoSave = useCallback(async () => {
    if (!promo) return;
    setPromoSaving(true);
    try {
      const saved = await shopAdmin.updateLandingPromo({
        tag: promo.tag || '',
        title: promo.title || '',
        subtitle: promo.subtitle || '',
        image_url: promo.image_url || '',
        link_url: promo.link_url || '',
        is_active: !!promo.is_active,
      });
      setPromo(saved);
      Alert.alert('✅ Guardado', 'Promo actualizada');
    } catch (e: any) {
      Alert.alert('Error', e.message || 'No se pudo guardar');
    } finally {
      setPromoSaving(false);
    }
  }, [promo]);

  const handlePromoToggleActive = useCallback(async () => {
    if (!promo) return;
    const next = !promo.is_active;
    setPromo((prev) => (prev ? { ...prev, is_active: next } : prev));
    try {
      await shopAdmin.updateLandingPromo({ is_active: next });
    } catch (e: any) {
      setPromo((prev) => (prev ? { ...prev, is_active: !next } : prev));
      Alert.alert('Error', e.message || 'No se pudo cambiar estado');
    }
  }, [promo]);

  return (
    <View className="flex-1 bg-black" style={{ paddingTop: insets.top }}>
      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 120 }}>
        {/* Header */}
        <View className="px-4 pt-4 pb-2">
          <View className="flex-row items-center gap-3 mb-2">
            <Globe size={24} color={COLORS.rose} />
            <Text className="text-white text-xl font-bold tracking-wider">LANDING WEB</Text>
          </View>
          <Text className="text-zinc-500 text-sm font-mono">
            Carrusel de flyers horizontales que se muestra arriba de las categorías en
            shop.trens.app. Cada banner puede tener un enlace personalizado.
          </Text>
        </View>

        {/* PROMO PILL — Anuncio superior */}
        {promo && (
          <PromoSection
            promo={promo}
            saving={promoSaving}
            uploading={promoUploading}
            onChange={updatePromoField}
            onSave={handlePromoSave}
            onToggleActive={handlePromoToggleActive}
            onReplaceImage={handlePromoUploadImage}
          />
        )}

        {/* Sub-sección banners */}
        <View className="px-4 mt-6 pb-1">
          <Text className="text-zinc-400 font-mono text-[11px] tracking-widest">
            CARRUSEL DE FLYERS
          </Text>
        </View>

        {/* Add button */}
        <View className="px-4 mt-4">
          <TouchableOpacity
            onPress={handleCreate}
            disabled={creating}
            activeOpacity={0.8}
            className="flex-row items-center justify-center gap-2 bg-zinc-900 border border-rose-600/40 rounded-2xl py-4"
          >
            {creating ? (
              <ActivityIndicator color={COLORS.rose} />
            ) : (
              <>
                <Plus size={20} color={COLORS.rose} />
                <Text className="text-white font-bold tracking-wider">AGREGAR FLYER</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* Banner list */}
        <View className="px-4 mt-4 gap-4">
          {loading ? (
            <View className="items-center justify-center py-20">
              <ActivityIndicator color={COLORS.red} size="large" />
            </View>
          ) : banners.length === 0 ? (
            <View className="items-center justify-center py-20">
              <ImageIcon size={48} color={COLORS.zinc700} />
              <Text className="text-zinc-500 font-mono mt-4 text-sm">
                Sin banners. Agrega el primero ↑
              </Text>
            </View>
          ) : (
            banners.map((banner, i) => (
              <BannerEditor
                key={banner.id}
                banner={banner}
                index={i}
                total={banners.length}
                saving={savingId === banner.id}
                uploading={uploadingId === banner.id}
                onChange={(field, value) => updateField(banner.id, field, value)}
                onSave={() => persistBanner(banner)}
                onToggleActive={() => toggleActive(banner)}
                onReplaceImage={() => handleReplaceImage(banner)}
                onMoveUp={() => moveBanner(banner, -1)}
                onMoveDown={() => moveBanner(banner, 1)}
                onDelete={() => handleDelete(banner)}
              />
            ))
          )}
        </View>
      </ScrollView>
    </View>
  );
}

// ============================================================================
// BANNER EDITOR CARD
// ============================================================================
interface BannerEditorProps {
  banner: ShopBanner;
  index: number;
  total: number;
  saving: boolean;
  uploading: boolean;
  onChange: (field: keyof ShopBanner, value: any) => void;
  onSave: () => void;
  onToggleActive: () => void;
  onReplaceImage: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
}

function BannerEditor({
  banner,
  index,
  total,
  saving,
  uploading,
  onChange,
  onSave,
  onToggleActive,
  onReplaceImage,
  onMoveUp,
  onMoveDown,
  onDelete,
}: BannerEditorProps) {
  return (
    <View className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
      {/* Imagen preview */}
      <TouchableOpacity activeOpacity={0.8} onPress={onReplaceImage}>
        <View
          style={{
            width: '100%',
            aspectRatio: 21 / 9,
            backgroundColor: '#000',
          }}
        >
          {banner.image_url ? (
            <Image
              source={{ uri: banner.image_url }}
              style={{ width: '100%', height: '100%' }}
              contentFit="cover"
            />
          ) : (
            <View className="flex-1 items-center justify-center">
              <ImageIcon size={32} color={COLORS.zinc700} />
            </View>
          )}
          {uploading && (
            <View
              style={{
                position: 'absolute',
                inset: 0,
                backgroundColor: 'rgba(0,0,0,0.6)',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <ActivityIndicator color={COLORS.rose} size="large" />
            </View>
          )}
          {/* Replace badge */}
          <View
            style={{
              position: 'absolute',
              top: 8,
              right: 8,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4,
              backgroundColor: 'rgba(0,0,0,0.7)',
              paddingHorizontal: 10,
              paddingVertical: 6,
              borderRadius: 8,
            }}
          >
            <Upload size={14} color="#FFFFFF" />
            <Text className="text-white font-mono text-[10px] font-bold tracking-wider">
              REEMPLAZAR
            </Text>
          </View>
        </View>
      </TouchableOpacity>

      {/* Form */}
      <View className="p-4 gap-3">
        {/* Title */}
        <View>
          <Text className="text-zinc-400 font-mono text-[10px] tracking-widest mb-1.5">
            TÍTULO (OPCIONAL)
          </Text>
          <TextInput
            value={banner.title || ''}
            onChangeText={(v) => onChange('title', v)}
            placeholder="Ej: OFERTA NAVIDEÑA"
            placeholderTextColor={COLORS.zinc500}
            className="bg-black border border-zinc-800 rounded-xl px-3 py-2.5 text-white font-mono text-sm"
          />
        </View>

        {/* Link URL */}
        <View>
          <View className="flex-row items-center gap-2 mb-1.5">
            <LinkIcon size={12} color={COLORS.zinc500} />
            <Text className="text-zinc-400 font-mono text-[10px] tracking-widest">
              ENLACE PERSONALIZADO
            </Text>
          </View>
          <TextInput
            value={banner.link_url || ''}
            onChangeText={(v) => onChange('link_url', v)}
            placeholder="https://... o /ruta-interna"
            placeholderTextColor={COLORS.zinc500}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType={Platform.OS === 'web' ? 'default' : 'url'}
            className="bg-black border border-zinc-800 rounded-xl px-3 py-2.5 text-white font-mono text-xs"
          />
          <Text className="text-zinc-600 font-mono text-[10px] mt-1">
            Soporta URLs externas o rutas internas como /shop o /(tabs)/...
          </Text>
        </View>

        {/* Active toggle */}
        <View className="flex-row items-center justify-between bg-black/40 border border-zinc-800 rounded-xl px-3 py-2.5">
          <Text className="text-white font-mono text-xs tracking-wider">
            {banner.is_active ? 'ACTIVO' : 'OCULTO'}
          </Text>
          <Switch
            value={banner.is_active}
            onValueChange={onToggleActive}
            trackColor={{ false: '#27272a', true: COLORS.green }}
            thumbColor="#FFFFFF"
          />
        </View>

        {/* Actions row */}
        <View className="flex-row items-center gap-2 mt-1">
          <TouchableOpacity
            onPress={onMoveUp}
            disabled={index === 0}
            activeOpacity={0.7}
            className="bg-zinc-800 rounded-xl p-2.5"
            style={{ opacity: index === 0 ? 0.3 : 1 }}
          >
            <ArrowUp size={16} color="#FFFFFF" />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onMoveDown}
            disabled={index === total - 1}
            activeOpacity={0.7}
            className="bg-zinc-800 rounded-xl p-2.5"
            style={{ opacity: index === total - 1 ? 0.3 : 1 }}
          >
            <ArrowDown size={16} color="#FFFFFF" />
          </TouchableOpacity>

          <View className="flex-1" />

          <TouchableOpacity
            onPress={onDelete}
            activeOpacity={0.7}
            className="bg-red-950 border border-red-800/40 rounded-xl px-3 py-2.5 flex-row items-center gap-1.5"
          >
            <Trash2 size={14} color={COLORS.red} />
            <Text className="text-red-400 font-mono text-[11px] font-bold tracking-wider">
              ELIMINAR
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={onSave}
            disabled={saving}
            activeOpacity={0.85}
            className="bg-rose-600 rounded-xl px-4 py-2.5 flex-row items-center gap-1.5"
          >
            {saving ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Save size={14} color="#FFFFFF" />
            )}
            <Text className="text-white font-mono text-[11px] font-black tracking-wider">
              GUARDAR
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

// ============================================================================
// PROMO SECTION — Anuncio pildora superior shop.trens.app
// ============================================================================
interface PromoSectionProps {
  promo: ShopLandingPromo;
  saving: boolean;
  uploading: boolean;
  onChange: (field: keyof ShopLandingPromo, value: any) => void;
  onSave: () => void;
  onToggleActive: () => void;
  onReplaceImage: () => void;
}

function PromoSection({
  promo,
  saving,
  uploading,
  onChange,
  onSave,
  onToggleActive,
  onReplaceImage,
}: PromoSectionProps) {
  return (
    <View className="px-4 mt-4">
      <View className="flex-row items-center gap-2 mb-2">
        <Sparkles size={16} color={COLORS.rose} />
        <Text className="text-zinc-300 font-mono text-[11px] tracking-widest">
          ANUNCIO SUPERIOR (PILDORA)
        </Text>
      </View>

      <View className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 gap-3">
        {/* Preview */}
        <View
          style={{
            backgroundColor: '#000',
            borderRadius: 999,
            paddingVertical: 6,
            paddingLeft: 12,
            paddingRight: 6,
            flexDirection: 'row',
            alignItems: 'center',
            borderWidth: 1,
            borderColor: 'rgba(220,38,38,0.25)',
          }}
        >
          <View style={{ flex: 1, paddingRight: 8 }}>
            {promo.tag ? (
              <Text
                numberOfLines={1}
                className="font-mono text-[9px] tracking-[2px]"
                style={{ color: '#22C55E', marginBottom: 1 }}
              >
                {promo.tag}
              </Text>
            ) : null}
            <Text numberOfLines={1} className="text-white font-black text-[11px] tracking-widest">
              {(promo.title || 'TÍTULO').toString()}
            </Text>
            {promo.subtitle ? (
              <Text
                numberOfLines={1}
                className="text-white/85 font-mono text-[10px] tracking-wider"
              >
                {promo.subtitle}
              </Text>
            ) : null}
          </View>
          <TouchableOpacity onPress={onReplaceImage} activeOpacity={0.8}>
            <View
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                overflow: 'hidden',
                backgroundColor: '#0a0a0a',
                borderWidth: 1.5,
                borderColor: 'rgba(255,255,255,0.25)',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {uploading ? (
                <ActivityIndicator size="small" color={COLORS.rose} />
              ) : promo.image_url ? (
                <Image
                  source={{ uri: promo.image_url }}
                  style={{ width: '100%', height: '100%' }}
                  contentFit="cover"
                />
              ) : (
                <ImageIcon size={16} color={COLORS.zinc500} />
              )}
            </View>
          </TouchableOpacity>
        </View>

        {/* Tag (texto verde superior) */}
        <View>
          <Text
            className="font-mono text-[10px] tracking-widest mb-1.5"
            style={{ color: '#22C55E' }}
          >
            TAG VERDE (SUPERIOR)
          </Text>
          <TextInput
            value={promo.tag || ''}
            onChangeText={(v) => onChange('tag', v)}
            placeholder="NUEVO • OFERTA • EXCLUSIVO..."
            placeholderTextColor={COLORS.zinc500}
            className="bg-black border border-zinc-800 rounded-xl px-3 py-2.5 text-white font-mono text-xs"
          />
        </View>

        {/* Title */}
        <View>
          <Text className="text-zinc-400 font-mono text-[10px] tracking-widest mb-1.5">TÍTULO</Text>
          <TextInput
            value={promo.title || ''}
            onChangeText={(v) => onChange('title', v)}
            placeholder="1 MES DE ASESORÍA PROFESIONAL PERSONALIZADA"
            placeholderTextColor={COLORS.zinc500}
            className="bg-black border border-zinc-800 rounded-xl px-3 py-2.5 text-white font-mono text-xs"
          />
        </View>

        {/* Subtitle */}
        <View>
          <Text className="text-zinc-400 font-mono text-[10px] tracking-widest mb-1.5">
            SUBTÍTULO
          </Text>
          <TextInput
            value={promo.subtitle || ''}
            onChangeText={(v) => onChange('subtitle', v)}
            placeholder="¡Por tiempo limitado!"
            placeholderTextColor={COLORS.zinc500}
            className="bg-black border border-zinc-800 rounded-xl px-3 py-2.5 text-white font-mono text-xs"
          />
        </View>

        {/* Link */}
        <View>
          <View className="flex-row items-center gap-2 mb-1.5">
            <LinkIcon size={12} color={COLORS.zinc500} />
            <Text className="text-zinc-400 font-mono text-[10px] tracking-widest">
              ENLACE (OPCIONAL)
            </Text>
          </View>
          <TextInput
            value={promo.link_url || ''}
            onChangeText={(v) => onChange('link_url', v)}
            placeholder="https://... o /ruta-interna"
            placeholderTextColor={COLORS.zinc500}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType={Platform.OS === 'web' ? 'default' : 'url'}
            className="bg-black border border-zinc-800 rounded-xl px-3 py-2.5 text-white font-mono text-xs"
          />
        </View>

        {/* Imagen upload button */}
        <TouchableOpacity
          onPress={onReplaceImage}
          activeOpacity={0.8}
          disabled={uploading}
          className="flex-row items-center justify-center gap-2 bg-zinc-800 border border-zinc-700 rounded-xl py-3"
        >
          {uploading ? (
            <ActivityIndicator size="small" color={COLORS.rose} />
          ) : (
            <Upload size={14} color="#FFFFFF" />
          )}
          <Text className="text-white font-mono text-[11px] font-bold tracking-wider">
            {promo.image_url ? 'REEMPLAZAR IMAGEN' : 'SUBIR IMAGEN CUADRADA'}
          </Text>
        </TouchableOpacity>

        {/* Active toggle + Save */}
        <View className="flex-row items-center gap-2 mt-1">
          <View className="flex-1 flex-row items-center justify-between bg-black/40 border border-zinc-800 rounded-xl px-3 py-2.5">
            <Text className="text-white font-mono text-xs tracking-wider">
              {promo.is_active ? 'ACTIVO' : 'OCULTO'}
            </Text>
            <Switch
              value={!!promo.is_active}
              onValueChange={onToggleActive}
              trackColor={{ false: '#27272a', true: COLORS.green }}
              thumbColor="#FFFFFF"
            />
          </View>

          <TouchableOpacity
            onPress={onSave}
            disabled={saving}
            activeOpacity={0.85}
            className="bg-rose-600 rounded-xl px-4 py-3 flex-row items-center gap-1.5"
          >
            {saving ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Save size={14} color="#FFFFFF" />
            )}
            <Text className="text-white font-mono text-[11px] font-black tracking-wider">
              GUARDAR
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}
