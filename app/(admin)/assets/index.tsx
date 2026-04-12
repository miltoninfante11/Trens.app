// ============================================================================
// ADMIN: APP ASSETS MANAGEMENT
// Upload, replace and manage app icons, splash screens, screenshots,
// and other visual assets for store submissions.
// ============================================================================

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Platform,
  Alert as RNAlert,
} from 'react-native';
import { Alert } from '../../../lib/alert';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Upload,
  ImageIcon,
  Smartphone,
  Monitor,
  Trash2,
  CheckCircle,
  AlertCircle,
  RefreshCw,
  Camera,
  Palette,
  Layers,
  Star,
} from 'lucide-react-native';
import cloudflareR2 from '../../../services/cloudflare/r2';

// ============================================================================
// TYPES
// ============================================================================

interface AssetSlot {
  id: string;
  label: string;
  description: string;
  category: 'icons' | 'splash' | 'screenshots_ios' | 'screenshots_android' | 'marketing';
  requiredSize?: string;
  storageKey: string; // R2 key path
  currentUrl: string | null;
}

type AssetCategory = AssetSlot['category'];

const CATEGORY_INFO: Record<AssetCategory, { label: string; icon: any; color: string }> = {
  icons: { label: 'ICONOS', icon: Palette, color: '#DC2626' },
  splash: { label: 'SPLASH SCREEN', icon: Layers, color: '#F97316' },
  screenshots_ios: { label: 'SCREENSHOTS iOS', icon: Smartphone, color: '#3B82F6' },
  screenshots_android: { label: 'SCREENSHOTS Android', icon: Monitor, color: '#22C55E' },
  marketing: { label: 'MARKETING', icon: Star, color: '#8B5CF6' },
};

// ============================================================================
// ASSET DEFINITIONS
// ============================================================================

const ASSET_SLOTS: AssetSlot[] = [
  // Icons
  {
    id: 'icon_1024',
    label: 'App Icon',
    description: '1024×1024 PNG sin transparencia',
    category: 'icons',
    requiredSize: '1024×1024',
    storageKey: 'app-assets/icons/icon-1024.png',
    currentUrl: null,
  },
  {
    id: 'adaptive_icon',
    label: 'Android Adaptive Icon',
    description: '1024×1024 PNG (foreground)',
    category: 'icons',
    requiredSize: '1024×1024',
    storageKey: 'app-assets/icons/adaptive-icon.png',
    currentUrl: null,
  },
  {
    id: 'favicon',
    label: 'Favicon Web',
    description: '48×48 PNG',
    category: 'icons',
    requiredSize: '48×48',
    storageKey: 'app-assets/icons/favicon.png',
    currentUrl: null,
  },
  // Splash
  {
    id: 'splash_icon',
    label: 'Splash Screen Icon',
    description: '1024×1024 PNG sobre fondo negro',
    category: 'splash',
    requiredSize: '1024×1024',
    storageKey: 'app-assets/splash/splash-icon.png',
    currentUrl: null,
  },
  // iOS Screenshots (6.7" - iPhone 15 Pro Max)
  {
    id: 'ios_67_1',
    label: 'iPhone 6.7" — Screenshot 1',
    description: '1290×2796 PNG o JPG',
    category: 'screenshots_ios',
    requiredSize: '1290×2796',
    storageKey: 'app-assets/screenshots/ios/6.7/screenshot-1.png',
    currentUrl: null,
  },
  {
    id: 'ios_67_2',
    label: 'iPhone 6.7" — Screenshot 2',
    description: '1290×2796 PNG o JPG',
    category: 'screenshots_ios',
    requiredSize: '1290×2796',
    storageKey: 'app-assets/screenshots/ios/6.7/screenshot-2.png',
    currentUrl: null,
  },
  {
    id: 'ios_67_3',
    label: 'iPhone 6.7" — Screenshot 3',
    description: '1290×2796 PNG o JPG',
    category: 'screenshots_ios',
    requiredSize: '1290×2796',
    storageKey: 'app-assets/screenshots/ios/6.7/screenshot-3.png',
    currentUrl: null,
  },
  {
    id: 'ios_67_4',
    label: 'iPhone 6.7" — Screenshot 4',
    description: '1290×2796 PNG o JPG',
    category: 'screenshots_ios',
    requiredSize: '1290×2796',
    storageKey: 'app-assets/screenshots/ios/6.7/screenshot-4.png',
    currentUrl: null,
  },
  {
    id: 'ios_67_5',
    label: 'iPhone 6.7" — Screenshot 5',
    description: '1290×2796 PNG o JPG',
    category: 'screenshots_ios',
    requiredSize: '1290×2796',
    storageKey: 'app-assets/screenshots/ios/6.7/screenshot-5.png',
    currentUrl: null,
  },
  // iOS Screenshots (6.5" - iPhone 11 Pro Max)
  {
    id: 'ios_65_1',
    label: 'iPhone 6.5" — Screenshot 1',
    description: '1242×2688 PNG o JPG',
    category: 'screenshots_ios',
    requiredSize: '1242×2688',
    storageKey: 'app-assets/screenshots/ios/6.5/screenshot-1.png',
    currentUrl: null,
  },
  {
    id: 'ios_65_2',
    label: 'iPhone 6.5" — Screenshot 2',
    description: '1242×2688 PNG o JPG',
    category: 'screenshots_ios',
    requiredSize: '1242×2688',
    storageKey: 'app-assets/screenshots/ios/6.5/screenshot-2.png',
    currentUrl: null,
  },
  {
    id: 'ios_65_3',
    label: 'iPhone 6.5" — Screenshot 3',
    description: '1242×2688 PNG o JPG',
    category: 'screenshots_ios',
    requiredSize: '1242×2688',
    storageKey: 'app-assets/screenshots/ios/6.5/screenshot-3.png',
    currentUrl: null,
  },
  // Android Screenshots
  {
    id: 'android_phone_1',
    label: 'Android Phone — Screenshot 1',
    description: '1080×1920 mínimo, PNG o JPG',
    category: 'screenshots_android',
    requiredSize: '1080×1920+',
    storageKey: 'app-assets/screenshots/android/phone/screenshot-1.png',
    currentUrl: null,
  },
  {
    id: 'android_phone_2',
    label: 'Android Phone — Screenshot 2',
    description: '1080×1920 mínimo, PNG o JPG',
    category: 'screenshots_android',
    requiredSize: '1080×1920+',
    storageKey: 'app-assets/screenshots/android/phone/screenshot-2.png',
    currentUrl: null,
  },
  {
    id: 'android_phone_3',
    label: 'Android Phone — Screenshot 3',
    description: '1080×1920 mínimo, PNG o JPG',
    category: 'screenshots_android',
    requiredSize: '1080×1920+',
    storageKey: 'app-assets/screenshots/android/phone/screenshot-3.png',
    currentUrl: null,
  },
  {
    id: 'android_phone_4',
    label: 'Android Phone — Screenshot 4',
    description: '1080×1920 mínimo, PNG o JPG',
    category: 'screenshots_android',
    requiredSize: '1080×1920+',
    storageKey: 'app-assets/screenshots/android/phone/screenshot-4.png',
    currentUrl: null,
  },
  // Marketing
  {
    id: 'feature_graphic',
    label: 'Feature Graphic (Google Play)',
    description: '1024×500 PNG o JPG',
    category: 'marketing',
    requiredSize: '1024×500',
    storageKey: 'app-assets/marketing/feature-graphic.png',
    currentUrl: null,
  },
  {
    id: 'promo_banner',
    label: 'Banner Promocional',
    description: 'Imagen para redes sociales / landing',
    category: 'marketing',
    storageKey: 'app-assets/marketing/promo-banner.png',
    currentUrl: null,
  },
];

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function AdminAssetsScreen() {
  const insets = useSafeAreaInsets();
  const [assets, setAssets] = useState<Record<string, string | null>>({});
  const [uploading, setUploading] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<AssetCategory>('icons');
  const [refreshKey, setRefreshKey] = useState(0);

  // Load existing assets from R2
  const loadAssets = useCallback(async () => {
    try {
      const loaded: Record<string, string | null> = {};
      // Check which assets exist by constructing URLs
      for (const slot of ASSET_SLOTS) {
        const url = `https://media.trens.app/${slot.storageKey}`;
        loaded[slot.id] = url;
      }
      setAssets(loaded);
    } catch {
      // Silent fail
    }
  }, []);

  React.useEffect(() => {
    loadAssets();
  }, [loadAssets, refreshKey]);

  // Pick and upload image
  const handleUpload = useCallback(async (slot: AssetSlot) => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 1,
        base64: true,
      });

      if (result.canceled || !result.assets[0]) return;

      setUploading(slot.id);
      const asset = result.assets[0];

      // Upload original quality (don't compress store assets)
      const manipulated = await ImageManipulator.manipulateAsync(asset.uri, [], {
        compress: 0.95,
        format: ImageManipulator.SaveFormat.PNG,
        base64: true,
      });

      if (!manipulated.base64) {
        Alert.alert('Error', 'No se pudo procesar la imagen');
        return;
      }

      // Upload to R2
      const uploadResult = await cloudflareR2.uploadFromBase64(
        manipulated.base64,
        slot.storageKey,
        'image/png'
      );

      if (uploadResult?.url) {
        const url = uploadResult.url;
        setAssets((prev) => ({ ...prev, [slot.id]: url }));
        Alert.alert('✅ Subido', `${slot.label} actualizado correctamente`);
      } else {
        Alert.alert('Error', 'No se pudo subir la imagen');
      }
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Error al subir imagen');
    } finally {
      setUploading(null);
    }
  }, []);

  // Delete asset
  const handleDelete = useCallback(async (slot: AssetSlot) => {
    Alert.alert('Eliminar asset', `¿Seguro que quieres eliminar ${slot.label}?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: async () => {
          try {
            setUploading(slot.id);
            await cloudflareR2.deleteFile(slot.storageKey);
            setAssets((prev) => ({ ...prev, [slot.id]: null }));
            Alert.alert('Eliminado', `${slot.label} eliminado`);
          } catch {
            Alert.alert('Error', 'No se pudo eliminar');
          } finally {
            setUploading(null);
          }
        },
      },
    ]);
  }, []);

  const filteredSlots = ASSET_SLOTS.filter((s) => s.category === selectedCategory);
  const categoryInfo = CATEGORY_INFO[selectedCategory];
  const CategoryIcon = categoryInfo.icon;

  return (
    <View className="flex-1 bg-black">
      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 100 }}>
        {/* Header */}
        <View className="px-4 pt-4 pb-2">
          <View className="flex-row items-center gap-3 mb-2">
            <ImageIcon size={24} color="#3B82F6" />
            <Text className="text-white text-xl font-bold tracking-wider">APP ASSETS</Text>
          </View>
          <Text className="text-zinc-500 text-sm">
            Gestiona iconos, splash screens, screenshots y assets de marketing para las stores.
          </Text>
        </View>

        {/* Category Tabs */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          className="px-4 py-3"
          contentContainerStyle={{ gap: 8 }}
        >
          {(
            Object.entries(CATEGORY_INFO) as [
              AssetCategory,
              (typeof CATEGORY_INFO)[AssetCategory],
            ][]
          ).map(([key, info]) => {
            const Icon = info.icon;
            const isActive = selectedCategory === key;
            return (
              <TouchableOpacity
                key={key}
                onPress={() => setSelectedCategory(key)}
                className={`flex-row items-center gap-2 px-4 py-2.5 rounded-xl border ${
                  isActive ? 'bg-zinc-800 border-blue-500/50' : 'bg-zinc-900/50 border-zinc-800'
                }`}
              >
                <Icon size={14} color={isActive ? info.color : '#71717A'} />
                <Text
                  className={`text-xs font-bold tracking-wider ${
                    isActive ? 'text-white' : 'text-zinc-500'
                  }`}
                >
                  {info.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Refresh */}
        <View className="flex-row justify-end px-4 mb-2">
          <TouchableOpacity
            onPress={() => setRefreshKey((k) => k + 1)}
            className="flex-row items-center gap-1.5 px-3 py-1.5 bg-zinc-900 rounded-lg"
          >
            <RefreshCw size={12} color="#71717A" />
            <Text className="text-zinc-500 text-xs">Refrescar</Text>
          </TouchableOpacity>
        </View>

        {/* Asset Slots */}
        <View className="px-4 gap-3">
          {filteredSlots.map((slot) => {
            const hasImage = assets[slot.id];
            const isUploading = uploading === slot.id;

            return (
              <View
                key={slot.id}
                className="bg-zinc-900/80 border border-zinc-800 rounded-2xl overflow-hidden"
              >
                {/* Preview */}
                {hasImage ? (
                  <View className="bg-zinc-950 items-center justify-center" style={{ height: 200 }}>
                    <Image
                      source={{ uri: `${hasImage}?t=${refreshKey}` }}
                      style={{ width: '100%', height: 200 }}
                      contentFit="contain"
                    />
                  </View>
                ) : (
                  <View
                    className="bg-zinc-950 items-center justify-center border-b border-zinc-800"
                    style={{ height: 120 }}
                  >
                    <ImageIcon size={32} color="#3F3F46" />
                    <Text className="text-zinc-700 text-xs mt-2">Sin imagen</Text>
                  </View>
                )}

                {/* Info + Actions */}
                <View className="p-4">
                  <View className="flex-row items-center justify-between mb-1">
                    <Text className="text-white font-bold text-sm flex-1">{slot.label}</Text>
                    {hasImage && <CheckCircle size={14} color="#22C55E" />}
                  </View>

                  <Text className="text-zinc-500 text-xs mb-3">{slot.description}</Text>

                  {slot.requiredSize && (
                    <View className="flex-row items-center gap-1.5 mb-3">
                      <AlertCircle size={10} color="#71717A" />
                      <Text className="text-zinc-600 text-[10px] font-mono">
                        Tamaño requerido: {slot.requiredSize}
                      </Text>
                    </View>
                  )}

                  <View className="flex-row gap-2">
                    <TouchableOpacity
                      onPress={() => handleUpload(slot)}
                      disabled={isUploading}
                      className="flex-1 bg-blue-600 rounded-xl py-3 flex-row items-center justify-center gap-2"
                    >
                      {isUploading ? (
                        <ActivityIndicator color="#fff" size="small" />
                      ) : (
                        <>
                          <Upload size={14} color="#fff" />
                          <Text className="text-white text-xs font-bold">
                            {hasImage ? 'REEMPLAZAR' : 'SUBIR'}
                          </Text>
                        </>
                      )}
                    </TouchableOpacity>

                    {hasImage && (
                      <TouchableOpacity
                        onPress={() => handleDelete(slot)}
                        disabled={isUploading}
                        className="bg-red-600/20 border border-red-600/30 rounded-xl px-4 py-3 items-center justify-center"
                      >
                        <Trash2 size={14} color="#DC2626" />
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              </View>
            );
          })}
        </View>

        {/* Store Checklist */}
        <View className="px-4 mt-6">
          <Text className="text-white font-bold text-sm tracking-wider mb-3">
            📋 CHECKLIST PARA STORES
          </Text>
          <View className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-4 gap-2">
            <ChecklistItem label="App Icon (1024×1024)" done={!!assets['icon_1024']} />
            <ChecklistItem label="Adaptive Icon Android" done={!!assets['adaptive_icon']} />
            <ChecklistItem label="Splash Screen" done={!!assets['splash_icon']} />
            <ChecklistItem
              label={'Screenshots iPhone 6.7" (mín. 3)'}
              done={['ios_67_1', 'ios_67_2', 'ios_67_3'].every((id) => !!assets[id])}
            />
            <ChecklistItem
              label={'Screenshots iPhone 6.5" (mín. 3)'}
              done={['ios_65_1', 'ios_65_2', 'ios_65_3'].every((id) => !!assets[id])}
            />
            <ChecklistItem
              label="Screenshots Android (mín. 2)"
              done={['android_phone_1', 'android_phone_2'].every((id) => !!assets[id])}
            />
            <ChecklistItem label="Feature Graphic Google Play" done={!!assets['feature_graphic']} />
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

// ============================================================================
// CHECKLIST ITEM
// ============================================================================

function ChecklistItem({ label, done }: { label: string; done: boolean }) {
  return (
    <View className="flex-row items-center gap-2.5">
      {done ? (
        <CheckCircle size={14} color="#22C55E" />
      ) : (
        <View className="w-3.5 h-3.5 rounded-full border-2 border-zinc-600" />
      )}
      <Text className={`text-sm ${done ? 'text-green-400' : 'text-zinc-500'}`}>{label}</Text>
    </View>
  );
}
