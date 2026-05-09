// ============================================================================
// COACH EDIT — Editor completo del plan del atleta (sin cuenta)
// Tabs: ENTRENO · NUTRICIÓN · CARDIO · SUPLEMENTOS · NOTAS
// ============================================================================
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import {
  ArrowLeft,
  Shield,
  Clock,
  Dumbbell,
  Apple,
  Activity,
  Pill,
  MessageSquare,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react-native';
import { Alert } from '../lib/alert';
import { useCoachSession, formatCoachRemaining } from '../context/CoachSessionContext';

import CoachTrainingTab from '../components/coach/CoachTrainingTab';
import CoachMealsTab from '../components/coach/CoachMealsTab';
import CoachCardioTab from '../components/coach/CoachCardioTab';
import CoachSupplementsTab from '../components/coach/CoachSupplementsTab';
import CoachNotesTab from '../components/coach/CoachNotesTab';

type TabKey = 'training' | 'meals' | 'cardio' | 'supps' | 'notes';

const TABS: { key: TabKey; label: string; icon: any; color: string }[] = [
  { key: 'training', label: 'ENTRENO', icon: Dumbbell, color: '#DC2626' },
  { key: 'meals', label: 'COMIDAS', icon: Apple, color: '#22C55E' },
  { key: 'cardio', label: 'CARDIO', icon: Activity, color: '#F97316' },
  { key: 'supps', label: 'STACK', icon: Pill, color: '#3B82F6' },
  { key: 'notes', label: 'NOTA', icon: MessageSquare, color: '#A855F7' },
];

export default function CoachEditScreen() {
  const router = useRouter();
  const { session, isCoachMode, msRemaining, closeSession } = useCoachSession();
  const [tab, setTab] = useState<TabKey>('training');
  const [now, setNow] = useState(Date.now());
  const [error, setError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);

  // GUARD
  useEffect(() => {
    if (!isCoachMode || !session) {
      router.replace('/(auth)/coach-access');
    }
  }, [isCoachMode, session, router]);

  // TICK
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const flashSaved = () => {
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1400);
  };

  const handleExit = () => {
    Alert.alert('Cerrar sesión coach', '¿Seguro que quieres salir?', [
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

  if (!isCoachMode || !session) {
    return (
      <View className="flex-1 bg-savage-black items-center justify-center">
        <ActivityIndicator color="#DC2626" />
      </View>
    );
  }

  const tabProps = {
    token: session.token,
    coachName: session.coachName,
    onError: setError,
    onSaved: flashSaved,
  };

  // Suprime warning de variable no usada
  void now;

  return (
    <View className="flex-1 bg-savage-black">
      <Stack.Screen options={{ headerShown: false }} />

      {/* HEADER */}
      <View
        className="border-b border-zinc-900 px-4"
        style={{ paddingTop: Platform.OS === 'ios' ? 56 : 24, paddingBottom: 12 }}
      >
        <View className="flex-row items-center justify-between mb-3">
          <TouchableOpacity
            onPress={() => router.replace('/(auth)/coach-access')}
            className="w-10 h-10 rounded-full bg-zinc-900 items-center justify-center border border-zinc-800"
          >
            <ArrowLeft size={20} color="#A1A1AA" />
          </TouchableOpacity>

          <View className="flex-row items-center gap-2">
            <Shield size={16} color="#DC2626" />
            <Text className="text-white text-sm font-bold tracking-widest">EDITOR COACH</Text>
          </View>

          <TouchableOpacity
            onPress={handleExit}
            className="px-3 h-10 rounded-full bg-zinc-900 items-center justify-center border border-red-900/40"
          >
            <Text className="text-red-400 text-[11px] font-bold tracking-widest">SALIR</Text>
          </TouchableOpacity>
        </View>

        <View className="flex-row items-center justify-between mb-3">
          <View className="flex-1">
            <Text className="text-zinc-500 text-[10px] tracking-widest font-bold uppercase">
              {session.coachName} · EDITANDO A
            </Text>
            <Text className="text-white text-base font-bold" numberOfLines={1}>
              {session.athleteName}
            </Text>
          </View>
          <View className="flex-row items-center gap-1.5 bg-zinc-900 px-3 py-1.5 rounded-full border border-zinc-800">
            <Clock size={12} color="#DC2626" />
            <Text className="text-white text-xs font-mono font-bold">
              {formatCoachRemaining(msRemaining)}
            </Text>
          </View>
        </View>

        {/* TABS */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View className="flex-row gap-2">
            {TABS.map((t) => {
              const active = t.key === tab;
              const Icon = t.icon;
              return (
                <TouchableOpacity
                  key={t.key}
                  onPress={() => setTab(t.key)}
                  className={`flex-row items-center gap-1.5 px-3 py-2 rounded-full border ${
                    active ? 'border-transparent' : 'bg-zinc-950 border-zinc-900'
                  }`}
                  style={active ? { backgroundColor: t.color } : undefined}
                >
                  <Icon size={13} color={active ? '#000' : t.color} />
                  <Text
                    className="text-[11px] font-bold tracking-widest"
                    style={{ color: active ? '#000' : '#A1A1AA' }}
                  >
                    {t.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>
      </View>

      {/* SAVED / ERROR */}
      {savedFlash && (
        <View className="absolute top-32 left-4 right-4 z-50 bg-green-900/40 border border-green-700 rounded-2xl p-3 flex-row items-center gap-2">
          <CheckCircle2 size={16} color="#22C55E" />
          <Text className="text-green-400 text-sm font-bold tracking-wider">GUARDADO</Text>
        </View>
      )}
      {error && (
        <View className="mx-4 mt-3 bg-red-900/30 border border-red-800 rounded-2xl p-3 flex-row items-start gap-2">
          <AlertCircle size={14} color="#F87171" />
          <Text className="text-red-400 text-xs flex-1">{error}</Text>
          <TouchableOpacity onPress={() => setError(null)}>
            <Text className="text-red-400 text-xs font-bold">×</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* TAB CONTENT */}
      <View className="flex-1">
        {tab === 'training' && <CoachTrainingTab {...tabProps} />}
        {tab === 'meals' && <CoachMealsTab {...tabProps} />}
        {tab === 'cardio' && <CoachCardioTab {...tabProps} />}
        {tab === 'supps' && <CoachSupplementsTab {...tabProps} />}
        {tab === 'notes' && <CoachNotesTab {...tabProps} />}
      </View>
    </View>
  );
}
