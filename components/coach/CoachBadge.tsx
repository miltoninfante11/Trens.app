// ============================================================================
// COACH BADGE — Banner persistente "EDITANDO COMO COACH"
// Visible mientras el coach guest tenga una sesión activa.
// Tap en el banner → va al editor de plan.
// Además redirige automáticamente al coach fuera de rutas no permitidas.
// ============================================================================
import React, { useEffect } from 'react';
import { View, Text, TouchableOpacity, Platform } from 'react-native';
import { Shield, LogOut, Edit3 } from 'lucide-react-native';
import { useCoachSession, formatCoachRemaining } from '../../context/CoachSessionContext';
import * as Haptics from '../../lib/haptics';
import { Alert } from '../../lib/alert';
import { useRouter, usePathname } from 'expo-router';

// Rutas permitidas para coach guest (resto se redirige)
const COACH_ALLOWED_PATHS = ['/coach-edit', '/(auth)/coach-access', '/coach-access'];

function isAllowedPath(pathname: string | null): boolean {
  if (!pathname) return true;
  return COACH_ALLOWED_PATHS.some((p) =>
    pathname.includes(p.replace(/^\//, '').replace(/[()]/g, ''))
  );
}

export default function CoachBadge() {
  const { session, isCoachMode, msRemaining, closeSession } = useCoachSession();
  const router = useRouter();
  const pathname = usePathname();

  // Guard: si el coach navega fuera de su área, redirigir
  useEffect(() => {
    if (!isCoachMode) return;
    if (!isAllowedPath(pathname)) {
      router.replace('/coach-edit');
    }
  }, [isCoachMode, pathname, router]);

  if (!isCoachMode || !session) return null;

  const handleExit = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert('Salir del modo coach', `Cerrarás la sesión activa para ${session.athleteName}.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Salir',
        style: 'destructive',
        onPress: async () => {
          await closeSession();
          router.replace('/(auth)/login');
        },
      },
    ]);
  };

  const handleGoEdit = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.replace('/coach-edit');
  };

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: Platform.OS === 'web' ? ('fixed' as 'absolute') : 'absolute',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 9998,
      }}
    >
      <View
        className="bg-savage-red flex-row items-center justify-between px-4 py-2"
        style={{ paddingTop: Platform.OS === 'ios' ? 50 : 12 }}
      >
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={handleGoEdit}
          className="flex-row items-center gap-2 flex-1"
        >
          <Shield size={16} color="#fff" />
          <View className="flex-1">
            <Text className="text-white text-[10px] font-bold tracking-widest" numberOfLines={1}>
              MODO COACH · {session.coachName.toUpperCase()}
            </Text>
            <Text className="text-white/90 text-[11px] font-mono" numberOfLines={1}>
              EDITANDO: {session.athleteName} · {formatCoachRemaining(msRemaining)}
            </Text>
          </View>
          <Edit3 size={14} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={handleExit}
          className="bg-black/40 px-3 py-1.5 rounded-full flex-row items-center gap-1 ml-2"
        >
          <LogOut size={12} color="#fff" />
          <Text className="text-white text-[10px] font-bold tracking-wider">SALIR</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
