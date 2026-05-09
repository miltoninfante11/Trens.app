// ============================================================================
// COACHING MODAL — Asesoría Profesional Personalizada (compartido)
// Hero image + título Milton Infante + chip BICAMPEÓN + features pills + CTA.
// ============================================================================

import React from 'react';
import { View, Text, TouchableOpacity, Modal, Pressable, Platform } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import {
  X as XIcon,
  Dumbbell,
  Salad,
  Pill,
  MessageCircle,
  TrendingUp,
  ArrowRight,
} from 'lucide-react-native';

const FEATURES: { icon: any; label: string; color: string }[] = [
  { icon: Dumbbell, label: 'Entrenamiento efectivo', color: '#DC2626' },
  { icon: Salad, label: 'Nutrición personalizada', color: '#22C55E' },
  { icon: Pill, label: 'Suplementación fundamental', color: '#F97316' },
  { icon: MessageCircle, label: 'Contacto por WhatsApp', color: '#25D366' },
  { icon: TrendingUp, label: 'Seguimiento constante', color: '#3B82F6' },
];

export default function CoachingModal({
  visible,
  onClose,
  onStart,
  imageUrl,
}: {
  visible: boolean;
  onClose: () => void;
  onStart: () => void;
  imageUrl?: string | null;
}) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable
        onPress={onClose}
        style={{
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.85)',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 16,
          ...(Platform.OS === 'web'
            ? ({ backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' } as any)
            : {}),
        }}
      >
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={{
            width: '100%',
            maxWidth: 440,
            borderRadius: 24,
            overflow: 'hidden',
            backgroundColor: '#0a0a0a',
            borderWidth: 1,
            borderColor: 'rgba(220,38,38,0.4)',
            shadowColor: '#DC2626',
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: 0.5,
            shadowRadius: 30,
            elevation: 20,
          }}
        >
          {imageUrl ? (
            <View style={{ width: '100%', aspectRatio: 16 / 9, position: 'relative' }}>
              <Image
                source={{ uri: imageUrl }}
                style={{ width: '100%', height: '100%' }}
                contentFit="cover"
              />
              <LinearGradient
                colors={['transparent', 'rgba(10,10,10,0.4)', '#0a0a0a']}
                style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '70%' }}
              />
              <TouchableOpacity
                onPress={onClose}
                activeOpacity={0.8}
                style={{
                  position: 'absolute',
                  top: 12,
                  right: 12,
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  backgroundColor: 'rgba(0,0,0,0.6)',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderWidth: 1,
                  borderColor: 'rgba(255,255,255,0.15)',
                }}
              >
                <XIcon size={18} color="#FFFFFF" strokeWidth={2.5} />
              </TouchableOpacity>
            </View>
          ) : (
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', padding: 12 }}>
              <TouchableOpacity
                onPress={onClose}
                activeOpacity={0.8}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  backgroundColor: 'rgba(255,255,255,0.06)',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderWidth: 1,
                  borderColor: 'rgba(255,255,255,0.1)',
                }}
              >
                <XIcon size={18} color="#FFFFFF" strokeWidth={2.5} />
              </TouchableOpacity>
            </View>
          )}

          <View style={{ paddingHorizontal: 22, paddingTop: 16, paddingBottom: 22 }}>
            <Text
              className="text-white font-black text-2xl tracking-tight"
              style={{ lineHeight: 28 }}
            >
              Milton Infante
            </Text>
            <LinearGradient
              colors={['#DC2626', '#F97316']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={{
                alignSelf: 'flex-start',
                marginTop: 6,
                paddingHorizontal: 10,
                paddingVertical: 3,
                borderRadius: 6,
              }}
            >
              <Text className="text-white font-mono text-[10px] font-black tracking-widest">
                🏆 BICAMPEÓN MR. PERÚ 2026 🇵🇪
              </Text>
            </LinearGradient>

            <View style={{ marginTop: 16, flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {FEATURES.map((f, i) => {
                const Icon = f.icon;
                return (
                  <View
                    key={i}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 6,
                      backgroundColor: `${f.color}14`,
                      borderWidth: 1,
                      borderColor: `${f.color}33`,
                      borderRadius: 999,
                      paddingVertical: 5,
                      paddingLeft: 7,
                      paddingRight: 10,
                    }}
                  >
                    <View
                      style={{
                        width: 18,
                        height: 18,
                        borderRadius: 9,
                        backgroundColor: `${f.color}26`,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Icon size={11} color={f.color} strokeWidth={2.6} />
                    </View>
                    <Text
                      className="text-white font-mono text-[10px] tracking-wider"
                      style={{ fontWeight: '600' }}
                    >
                      {f.label}
                    </Text>
                  </View>
                );
              })}
            </View>

            <TouchableOpacity
              onPress={onStart}
              activeOpacity={0.88}
              style={{
                marginTop: 22,
                borderRadius: 14,
                overflow: 'hidden',
                ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : {}),
              }}
            >
              <LinearGradient
                colors={['#DC2626', '#F97316']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  paddingVertical: 16,
                  gap: 8,
                  shadowColor: '#DC2626',
                  shadowOffset: { width: 0, height: 0 },
                  shadowOpacity: 0.6,
                  shadowRadius: 20,
                  elevation: 10,
                }}
              >
                <Text className="text-white font-black text-base tracking-[3px]">EMPEZAR</Text>
                <ArrowRight size={18} color="#FFFFFF" strokeWidth={2.8} />
              </LinearGradient>
            </TouchableOpacity>

            <Text className="text-zinc-500 font-mono text-[10px] tracking-wider text-center mt-3">
              SIN PERMANENCIA · CANCELAS CUANDO QUIERAS
            </Text>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
