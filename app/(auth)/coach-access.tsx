// ============================================================================
// COACH ACCESS — PANTALLA DEL COACH (sin cuenta)
// El coach pega el código que le envió su atleta y abre una sesión scoped.
// ============================================================================
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { useRouter, Stack } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Shield, ArrowLeft, LogOut, Edit3, AlertCircle, Clock } from 'lucide-react-native';
import * as Haptics from '../../lib/haptics';
import { useCoachSession, formatCoachRemaining } from '../../context/CoachSessionContext';

const ERROR_MAP: Record<string, string> = {
  INVALID_CODE: 'Formato de código inválido',
  CODE_NOT_FOUND: 'Código no encontrado',
  CODE_REVOKED: 'Este código fue revocado por el atleta',
  CODE_EXPIRED: 'Este código ya expiró',
};

function normalizeCode(raw: string): string {
  const clean = raw
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 8);
  if (clean.length <= 4) return clean;
  return `${clean.slice(0, 4)}-${clean.slice(4)}`;
}

export default function CoachAccessScreen() {
  const router = useRouter();
  const { session, isCoachMode, openSession, closeSession, refresh } = useCoachSession();

  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [now, setNow] = useState(Date.now());

  // Tick countdown
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Refresca info de sesión al entrar
  useEffect(() => {
    if (isCoachMode) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------------------------------------------------------------------------
  // SUBMIT CODE
  // ---------------------------------------------------------------------------
  const handleAccess = async () => {
    setError(null);
    const stripped = code.replace(/[^A-Z0-9]/gi, '');
    if (stripped.length !== 8) {
      setError('El código tiene 8 caracteres');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }
    setLoading(true);
    try {
      await openSession(code);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      const raw = String(e?.message || '');
      const matchKey = Object.keys(ERROR_MAP).find((k) => raw.includes(k));
      setError(matchKey ? ERROR_MAP[matchKey] : raw || 'No se pudo validar el código');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setLoading(false);
    }
  };

  // ---------------------------------------------------------------------------
  // ACCIONES SESIÓN ACTIVA
  // ---------------------------------------------------------------------------
  const goEditPlan = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.replace('/coach-edit');
  };

  const handleClose = async () => {
    setLoading(true);
    try {
      await closeSession();
      setCode('');
    } finally {
      setLoading(false);
    }
  };

  // ===========================================================================
  // VISTA: SESIÓN ACTIVA
  // ===========================================================================
  if (isCoachMode && session) {
    const remainingMs = Math.max(0, new Date(session.expiresAt).getTime() - now);
    return (
      <View className="flex-1 bg-savage-black">
        <Stack.Screen options={{ headerShown: false }} />
        <ScrollView contentContainerStyle={{ padding: 24, paddingTop: 80 }}>
          <TouchableOpacity
            onPress={() => router.back()}
            className="absolute top-14 left-6 w-10 h-10 rounded-full bg-zinc-900 items-center justify-center border border-zinc-800"
          >
            <ArrowLeft size={20} color="#A1A1AA" />
          </TouchableOpacity>

          <View className="items-center mt-8 mb-8">
            <View className="w-24 h-24 rounded-full bg-savage-red/10 border border-savage-red items-center justify-center mb-6">
              <Shield size={44} color="#DC2626" />
            </View>
            <Text className="text-savage-red text-xs font-bold tracking-[0.4em] mb-2">
              SESIÓN ACTIVA
            </Text>
            <Text className="text-white text-2xl font-bold mb-1">Hola, {session.coachName}</Text>
            <Text className="text-zinc-400 text-base">
              Editando el plan de{' '}
              <Text className="text-white font-bold">{session.athleteName}</Text>
            </Text>
          </View>

          <View className="bg-zinc-950 border border-zinc-900 rounded-3xl p-5 mb-4 flex-row items-center gap-3">
            <Clock size={20} color="#DC2626" />
            <View className="flex-1">
              <Text className="text-zinc-500 text-[11px] uppercase tracking-widest font-bold">
                EXPIRA EN
              </Text>
              <Text className="text-white text-xl font-mono font-bold mt-0.5">
                {formatCoachRemaining(remainingMs)}
              </Text>
            </View>
          </View>

          <TouchableOpacity
            onPress={goEditPlan}
            className="bg-savage-red rounded-2xl py-5 items-center flex-row justify-center gap-2 mb-3"
            style={{
              shadowColor: '#DC2626',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.4,
              shadowRadius: 8,
              elevation: 6,
            }}
          >
            <Edit3 size={18} color="#fff" />
            <Text className="text-white text-base font-bold tracking-widest">ENTRAR AL PLAN</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleClose}
            disabled={loading}
            className="bg-zinc-950 border border-red-900/40 rounded-2xl py-4 items-center flex-row justify-center gap-2"
          >
            {loading ? (
              <ActivityIndicator color="#DC2626" />
            ) : (
              <>
                <LogOut size={16} color="#DC2626" />
                <Text className="text-savage-red text-sm font-bold tracking-widest">
                  CERRAR SESIÓN
                </Text>
              </>
            )}
          </TouchableOpacity>

          <View className="mt-8 bg-zinc-950 border border-zinc-900 rounded-2xl p-4">
            <View className="flex-row items-start gap-2">
              <AlertCircle size={14} color="#71717A" />
              <Text className="text-zinc-500 text-xs flex-1 leading-5">
                Cada cambio que hagas queda registrado. El atleta puede revocar tu acceso en
                cualquier momento.
              </Text>
            </View>
          </View>
        </ScrollView>
      </View>
    );
  }

  // ===========================================================================
  // VISTA: INGRESAR CÓDIGO
  // ===========================================================================
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      className="flex-1 bg-savage-black"
    >
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24 }}
        keyboardShouldPersistTaps="handled"
      >
        <TouchableOpacity
          onPress={() => router.back()}
          className="absolute top-14 left-6 w-10 h-10 rounded-full bg-zinc-900 items-center justify-center border border-zinc-800"
        >
          <ArrowLeft size={20} color="#A1A1AA" />
        </TouchableOpacity>

        <View className="items-center mb-8">
          <View className="w-24 h-24 rounded-full bg-savage-red/10 border border-savage-red/40 items-center justify-center mb-6">
            <Shield size={44} color="#DC2626" />
          </View>
          <Text className="text-white text-3xl font-bold italic mb-2">ACCESO COACH</Text>
          <Text className="text-zinc-500 text-center text-sm tracking-wider px-4">
            Ingresa el código que te envió tu atleta
          </Text>
        </View>

        {error && (
          <View className="bg-red-900/30 border border-red-800/40 rounded-2xl p-4 mb-5 flex-row items-start gap-2">
            <AlertCircle size={16} color="#F87171" />
            <Text className="text-red-400 text-sm flex-1">{error}</Text>
          </View>
        )}

        <TextInput
          placeholder="XXXX-XXXX"
          placeholderTextColor="#3F3F46"
          value={code}
          onChangeText={(text) => {
            setCode(normalizeCode(text));
            setError(null);
          }}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={9} // 8 + guion
          className="w-full bg-zinc-950 text-white py-5 rounded-2xl border border-zinc-800 text-center text-3xl tracking-[0.4em] font-mono font-bold mb-6"
        />

        <TouchableOpacity
          onPress={handleAccess}
          disabled={loading}
          className={`w-full rounded-2xl py-5 items-center flex-row justify-center gap-2 ${
            loading ? 'bg-zinc-800' : 'bg-savage-red'
          }`}
          style={
            !loading
              ? {
                  shadowColor: '#DC2626',
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.4,
                  shadowRadius: 8,
                  elevation: 6,
                }
              : undefined
          }
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text className="text-white font-bold text-base tracking-widest">VERIFICAR</Text>
          )}
        </TouchableOpacity>

        <Text className="text-zinc-600 text-xs text-center mt-6 leading-5">
          ¿No tienes código? Pídele a tu atleta que genere uno desde su app.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
