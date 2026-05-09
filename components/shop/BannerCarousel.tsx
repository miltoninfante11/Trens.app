// ============================================================================
// SHOP BANNER CAROUSEL — Carrusel de flyers horizontales en shop.trens.app
// Auto-rotativo, tap abre el link_url asociado a cada banner.
// La altura de cada slide se ajusta dinámicamente al aspect ratio real
// de la imagen para que NUNCA se recorte.
// ============================================================================

import React, { useEffect, useRef, useState, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Linking,
  Dimensions,
  Platform,
  Image as RNImage,
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Crown, Trophy, Truck, Sparkles, ArrowRight, Smartphone, Timer } from 'lucide-react-native';
import shop, { ShopBanner } from '../../services/shop';
import CoachingModal from '../ui/CoachingModal';

const { width: SCREEN_W } = Dimensions.get('window');
const MAX_W = Math.min(SCREEN_W, 720);
const BANNER_W = MAX_W - 32; // padding horizontal 16
const DEFAULT_RATIO = 21 / 9; // ratio inicial mientras carga (flyer horizontal)
const MIN_RATIO = 1.2; // muy alto se ve raro en carrusel → cap
const MAX_RATIO = 4; // muy ancho/delgado → cap
const AUTO_ROTATE_MS = 5000;

const clampRatio = (r: number) => Math.min(MAX_RATIO, Math.max(MIN_RATIO, r));

export default function BannerCarousel({ hideFirst = false }: { hideFirst?: boolean } = {}) {
  const [allBanners, setAllBanners] = useState<ShopBanner[]>([]);
  const banners = useMemo(
    () => (hideFirst ? allBanners.slice(1) : allBanners),
    [allBanners, hideFirst]
  );
  const setBanners = setAllBanners;
  const [active, setActive] = useState(0);
  // aspectRatio = width / height por banner.id
  const [ratios, setRatios] = useState<Record<string, number>>({});
  const [coachingOpen, setCoachingOpen] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const router = useRouter();

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const data = await shop.listBanners();
        if (!mounted) return;
        setBanners(data);
        // Pre-cargar dimensiones de cada imagen
        for (const b of data) {
          RNImage.getSize(
            b.image_url,
            (w, h) => {
              if (!mounted || !w || !h) return;
              setRatios((prev) => ({ ...prev, [b.id]: clampRatio(w / h) }));
            },
            () => {}
          );
        }
      } catch {
        // silent
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // Altura del contenedor exterior = mayor altura entre todos los slides
  // así el indicador y el padding no saltan al cambiar de banner.
  const containerHeight = useMemo(() => {
    if (banners.length === 0) return 0;
    let maxH = 0;
    for (const b of banners) {
      const r = ratios[b.id] || DEFAULT_RATIO;
      const h = BANNER_W / r;
      if (h > maxH) maxH = h;
    }
    return Math.round(maxH);
  }, [banners, ratios]);

  // Auto-rotate
  useEffect(() => {
    if (banners.length <= 1) return;
    const id = setInterval(() => {
      setActive((prev) => {
        const next = (prev + 1) % banners.length;
        scrollRef.current?.scrollTo({ x: next * (BANNER_W + 8), animated: true });
        return next;
      });
    }, AUTO_ROTATE_MS);
    return () => clearInterval(id);
  }, [banners.length]);

  const handlePress = (banner: ShopBanner, index: number) => {
    // El primer flyer (index 0) abre el modal de Asesoría Profesional
    // Solo cuando NO está oculto (hideFirst=false → versión web standalone)
    if (!hideFirst && index === 0) {
      setCoachingOpen(true);
      return;
    }
    const url = banner.link_url?.trim();
    if (!url) return;
    if (url.startsWith('/') && !url.startsWith('//')) {
      router.push(url as any);
      return;
    }
    Linking.openURL(url).catch(() => {});
  };

  const handleEmpezar = () => {
    setCoachingOpen(false);
    const target = 'https://trens.app';
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.location.href = target;
      return;
    }
    Linking.openURL(target).catch(() => {});
  };

  if (banners.length === 0) return null;

  return (
    <View className="pt-3 pb-1">
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        snapToInterval={BANNER_W + 8}
        decelerationRate="fast"
        contentContainerStyle={{
          paddingHorizontal: 16,
          gap: 8,
          alignItems: 'center',
        }}
        style={{ height: containerHeight || undefined }}
        onMomentumScrollEnd={(e) => {
          const idx = Math.round(e.nativeEvent.contentOffset.x / (BANNER_W + 8));
          setActive(idx);
        }}
      >
        {banners.map((b, idx) => {
          const ratio = ratios[b.id] || DEFAULT_RATIO;
          const slideHeight = Math.round(BANNER_W / ratio);
          return (
            <TouchableOpacity
              key={b.id}
              activeOpacity={0.85}
              onPress={() => handlePress(b, idx)}
              style={{
                width: BANNER_W,
                height: slideHeight,
                borderRadius: 16,
                overflow: 'hidden',
                backgroundColor: '#0a0a0a',
                borderWidth: 1,
                borderColor: 'rgba(220,38,38,0.25)',
                ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : {}),
              }}
            >
              <Image
                source={{ uri: b.image_url }}
                style={{ width: '100%', height: '100%' }}
                contentFit="cover"
                transition={200}
                onLoad={(ev) => {
                  const src: any = (ev as any)?.source;
                  if (src?.width && src?.height) {
                    setRatios((prev) => {
                      const next = clampRatio(src.width / src.height);
                      if (prev[b.id] && Math.abs(prev[b.id] - next) < 0.01) return prev;
                      return { ...prev, [b.id]: next };
                    });
                  }
                }}
              />
              {b.title ? (
                <View
                  pointerEvents="none"
                  style={{
                    position: 'absolute',
                    left: 12,
                    bottom: 10,
                    backgroundColor: 'rgba(0,0,0,0.55)',
                    paddingHorizontal: 10,
                    paddingVertical: 4,
                    borderRadius: 8,
                  }}
                >
                  <Text className="text-white font-mono text-[11px] font-black tracking-widest">
                    {b.title.toUpperCase()}
                  </Text>
                </View>
              ) : null}

              {/* Badge POR TIEMPO LIMITADO sobre el primer banner */}
              {!hideFirst && idx === 0 ? (
                <View
                  pointerEvents="none"
                  style={{
                    position: 'absolute',
                    top: 4,
                    left: 8,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 5,
                    backgroundColor: 'rgba(34,197,94,0.18)',
                    paddingLeft: 7,
                    paddingRight: 10,
                    paddingVertical: 4,
                    borderRadius: 999,
                    borderWidth: 1.5,
                    borderColor: '#22C55E',
                    ...(Platform.OS === 'web'
                      ? ({ boxShadow: '0 0 14px rgba(34,197,94,0.55)' } as any)
                      : {
                          shadowColor: '#22C55E',
                          shadowOffset: { width: 0, height: 0 },
                          shadowOpacity: 0.7,
                          shadowRadius: 10,
                          elevation: 6,
                        }),
                  }}
                >
                  <Timer size={11} color="#22C55E" strokeWidth={2.8} />
                  <Text
                    style={{ color: '#22C55E' }}
                    className="font-mono text-[9px] font-black tracking-[2px]"
                  >
                    POR TIEMPO LIMITADO
                  </Text>
                </View>
              ) : null}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {banners.length > 1 && (
        <View className="flex-row justify-center gap-1.5 mt-2">
          {banners.map((_, i) => (
            <View
              key={i}
              style={{
                width: i === active ? 18 : 6,
                height: 6,
                borderRadius: 3,
                backgroundColor: i === active ? '#DC2626' : '#3F3F46',
              }}
            />
          ))}
        </View>
      )}

      {/* Panel de beneficios bajo el carrusel (solo cuando NO se oculta el primer banner) */}
      {!hideFirst && banners.length > 0 ? (
        <>
          {/* Conector visual: dos líneas verticales a los lados que unen imagen y tarjeta */}
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              paddingHorizontal: 24,
              marginTop: 2,
            }}
          >
            <View style={{ width: 2, height: 10, backgroundColor: '#DC2626', opacity: 0.8 }} />
            <View style={{ width: 2, height: 10, backgroundColor: '#DC2626', opacity: 0.8 }} />
          </View>
          <ProBenefitsPanel
            onPress={() => {
              const target = 'https://trens.app';
              if (Platform.OS === 'web' && typeof window !== 'undefined') {
                window.location.href = target;
                return;
              }
              Linking.openURL(target).catch(() => {});
            }}
          />
        </>
      ) : null}

      {/* COACHING MODAL — primer flyer */}
      <CoachingModal
        visible={coachingOpen}
        onClose={() => setCoachingOpen(false)}
        onStart={handleEmpezar}
        imageUrl={banners[0]?.image_url}
      />
    </View>
  );
}

// ============================================================================
// PRO BENEFITS PANEL — Lista de beneficios bajo el primer banner
// ============================================================================
const PRO_BENEFITS: {
  icon: any;
  color: string;
  title: string;
  subtitle?: string;
  highlight?: boolean;
}[] = [
  {
    icon: Trophy,
    color: '#FACC15',
    title: '1 mes de Asesoría Profesional',
    subtitle: 'Personalizada con Milton Infante · Bicampeón Mr. Perú 2026 🇵🇪',
    highlight: true,
  },
  {
    icon: Smartphone,
    color: '#DC2626',
    title: 'Trens App',
    subtitle: 'La App definitiva de entrenamiento, nutrición y suplementación.',
  },
  {
    icon: Truck,
    color: '#22C55E',
    title: 'Envíos GRATIS a nivel nacional',
    subtitle: 'Recibe tus productos sin costo adicional',
  },
];

function ProBenefitsPanel({ onPress }: { onPress: () => void }) {
  return (
    <View style={{ paddingHorizontal: 16, marginTop: 2 }}>
      <TouchableOpacity
        activeOpacity={0.92}
        onPress={onPress}
        style={{
          borderRadius: 18,
          overflow: 'hidden',
          borderWidth: 1,
          borderColor: 'rgba(220,38,38,0.4)',
          shadowColor: '#DC2626',
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: 0.4,
          shadowRadius: 18,
          elevation: 10,
          ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : {}),
        }}
      >
        <LinearGradient
          colors={['#1a0606', '#0a0a0a']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ padding: 16 }}
        >
          {/* Header */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              marginBottom: 12,
            }}
          >
            <LinearGradient
              colors={['#DC2626', '#F97316']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={{
                width: 30,
                height: 30,
                borderRadius: 10,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Crown size={16} color="#FFFFFF" strokeWidth={2.6} />
            </LinearGradient>
            <View style={{ flex: 1 }}>
              <Text className="text-zinc-500 font-mono text-[9px] tracking-[3px]">
                OBTÉN HOY CON
              </Text>
              <Text className="text-white font-black text-base tracking-tight">
                TRENS <Text style={{ color: '#DC2626' }}>PRO</Text>
              </Text>
            </View>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 4,
                backgroundColor: 'rgba(34,197,94,0.12)',
                borderWidth: 1,
                borderColor: 'rgba(34,197,94,0.3)',
                paddingHorizontal: 8,
                paddingVertical: 3,
                borderRadius: 999,
              }}
            >
              <Sparkles size={10} color="#22C55E" strokeWidth={2.6} />
              <Text className="font-mono text-[9px] tracking-widest" style={{ color: '#22C55E' }}>
                INCLUIDO
              </Text>
            </View>
          </View>

          {/* Beneficios */}
          <View style={{ gap: 8 }}>
            {PRO_BENEFITS.map((b, i) => {
              const Icon = b.icon;
              const hi = !!b.highlight;
              return (
                <View
                  key={i}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                    backgroundColor: hi ? `${b.color}12` : 'rgba(255,255,255,0.03)',
                    borderWidth: hi ? 1.5 : 1,
                    borderColor: hi ? `${b.color}66` : 'rgba(255,255,255,0.06)',
                    borderRadius: 12,
                    paddingVertical: hi ? 12 : 10,
                    paddingHorizontal: 12,
                    ...(hi && Platform.OS !== 'web'
                      ? {
                          shadowColor: b.color,
                          shadowOffset: { width: 0, height: 0 },
                          shadowOpacity: 0.5,
                          shadowRadius: 12,
                          elevation: 6,
                        }
                      : {}),
                    ...(hi && Platform.OS === 'web'
                      ? ({ boxShadow: `0 0 18px ${b.color}33` } as any)
                      : {}),
                  }}
                >
                  <View
                    style={{
                      width: hi ? 38 : 34,
                      height: hi ? 38 : 34,
                      borderRadius: 10,
                      backgroundColor: `${b.color}1A`,
                      borderWidth: 1,
                      borderColor: `${b.color}55`,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Icon size={hi ? 18 : 16} color={b.color} strokeWidth={2.5} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 6,
                        flexWrap: 'wrap',
                      }}
                    >
                      <Text
                        className="text-white font-bold text-[12px] tracking-wide"
                        numberOfLines={1}
                      >
                        {b.title}
                      </Text>
                      {hi ? (
                        <View
                          style={{
                            backgroundColor: `${b.color}26`,
                            borderWidth: 1,
                            borderColor: `${b.color}66`,
                            paddingHorizontal: 6,
                            paddingVertical: 1,
                            borderRadius: 999,
                          }}
                        >
                          <Text
                            className="font-mono text-[8px] tracking-widest"
                            style={{ color: b.color }}
                          >
                            ★ EXCLUSIVO
                          </Text>
                        </View>
                      ) : null}
                    </View>
                    {b.subtitle ? (
                      <Text
                        className="text-zinc-400 font-mono text-[10px] tracking-wide mt-0.5"
                        numberOfLines={2}
                      >
                        {b.subtitle}
                      </Text>
                    ) : null}
                  </View>
                </View>
              );
            })}
          </View>

          {/* CTA hint */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              marginTop: 12,
            }}
          >
            <Text className="font-mono text-[10px] tracking-[2px]" style={{ color: '#F97316' }}>
              VER MÁS DETALLES
            </Text>
            <ArrowRight size={11} color="#F97316" strokeWidth={2.8} />
          </View>
        </LinearGradient>
      </TouchableOpacity>
    </View>
  );
}
