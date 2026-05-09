import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, Linking, Platform } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Gitlab } from 'lucide-react-native';
import shop, { ShopLandingPromo } from '../../services/shop';

export default function PromoPill({
  topInset = 0,
  onPress,
  onLoaded,
}: {
  topInset?: number;
  onPress?: (promo: ShopLandingPromo) => void;
  onLoaded?: (promo: ShopLandingPromo | null) => void;
}) {
  const [promo, setPromo] = useState<ShopLandingPromo | null>(null);
  const router = useRouter();

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const data = await shop.getLandingPromo();
        if (!mounted) return;
        setPromo(data);
        onLoaded?.(data);
      } catch {}
    })();
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!promo || !promo.is_active) return null;

  const handlePress = () => {
    if (onPress) {
      onPress(promo);
      return;
    }
    const url = promo.link_url?.trim();
    if (!url) return;
    if (url.startsWith('/') && !url.startsWith('//')) {
      router.push(url as any);
      return;
    }
    Linking.openURL(url).catch(() => {});
  };

  const wrapperStyle: any =
    Platform.OS === 'web'
      ? {
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 9999,
          paddingTop: 10,
          paddingHorizontal: 12,
          paddingBottom: 6,
          alignItems: 'center',
          backgroundColor: 'transparent',
          pointerEvents: 'box-none',
        }
      : {
          paddingTop: topInset + 8,
          paddingHorizontal: 12,
          paddingBottom: 6,
          alignItems: 'center',
          backgroundColor: 'transparent',
        };

  return (
    <View style={wrapperStyle}>
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={handlePress}
        style={{
          width: '100%',
          maxWidth: 720,
          ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : {}),
        }}
      >
        <LinearGradient
          colors={['#18181b', '#0a0a0a']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingVertical: 8,
            paddingLeft: 12,
            paddingRight: 6,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.08)',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.5,
            shadowRadius: 16,
            elevation: 10,
          }}
        >
          {/* Gitlab icon */}
          <View
            style={{
              width: 26,
              height: 26,
              borderRadius: 13,
              backgroundColor: 'rgba(255,255,255,0.06)',
              alignItems: 'center',
              justifyContent: 'center',
              marginRight: 10,
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.08)',
            }}
          >
            <Gitlab size={14} color="#FC6D26" strokeWidth={2.2} />
          </View>

          {/* Texto */}
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
            {promo.title ? (
              <Text numberOfLines={1} className="text-white font-black text-[11px] tracking-widest">
                {promo.title}
              </Text>
            ) : null}
            {promo.subtitle ? (
              <Text
                numberOfLines={1}
                className="text-zinc-400 font-mono text-[10px] tracking-wider"
              >
                {promo.subtitle}
              </Text>
            ) : null}
          </View>

          {/* Imagen miniatura cuadrada */}
          {promo.image_url ? (
            <View
              style={{
                width: 38,
                height: 38,
                borderRadius: 10,
                overflow: 'hidden',
                backgroundColor: 'rgba(0,0,0,0.4)',
                borderWidth: 1.5,
                borderColor: 'rgba(255,255,255,0.15)',
              }}
            >
              <Image
                source={{ uri: promo.image_url }}
                style={{ width: '100%', height: '100%' }}
                contentFit="cover"
              />
            </View>
          ) : null}
        </LinearGradient>
      </TouchableOpacity>
    </View>
  );
}
