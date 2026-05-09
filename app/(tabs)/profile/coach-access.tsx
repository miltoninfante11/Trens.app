// ============================================================================
// COACH ACCESS — PANTALLA DEL ATLETA
// Genera código de invitación para tu coach (modo rápido, sin cuenta).
// - Nombre del coach (escrito por el atleta)
// - Duración: 1h o 3h
// - Máximo 1 invitación al día
// ============================================================================
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Platform,
  Share,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import {
  ArrowLeft,
  Shield,
  Copy,
  Send,
  X as XIcon,
  Clock,
  Sparkles,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react-native';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from '../../../lib/haptics';
import { Alert } from '../../../lib/alert';
import { supabase } from '../../../lib/supabase';
import { formatCoachRemaining } from '../../../context/CoachSessionContext';

// ============================================================================
// TIPOS
// ============================================================================
interface ActiveInvite {
  code: string;
  coach_name: string;
  created_at: string;
  expires_at: string;
  duration_hours: number;
  used_at: string | null;
  has_session: boolean;
}

type Duration = 1 | 3;

const DURATIONS: { value: Duration; label: string; sub: string }[] = [
  { value: 1, label: '1 HORA', sub: 'Ajuste rápido' },
  { value: 3, label: '3 HORAS', sub: 'Sesión extendida' },
];

// ============================================================================
// SCREEN
// ============================================================================
export default function CoachAccessAthleteScreen() {
  const router = useRouter();

  const [coachName, setCoachName] = useState('');
  const [duration, setDuration] = useState<Duration>(1);
  const [active, setActive] = useState<ActiveInvite | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

  // ---------------------------------------------------------------------------
  // FETCH ACTIVE INVITE
  // ---------------------------------------------------------------------------
  const fetchActive = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error: rpcErr } = await supabase.rpc('coach_invite_active');
      if (rpcErr) throw rpcErr;
      const row = Array.isArray(data) ? data[0] : data;
      setActive(row ?? null);
    } catch (e: any) {
      setError(e?.message || 'No se pudo cargar la invitación');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchActive();
  }, [fetchActive]);

  // Tick countdown
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // ---------------------------------------------------------------------------
  // ¿Ya creó una hoy? — bloquea generación
  // ---------------------------------------------------------------------------
  const [createdTodayCount, setCreatedTodayCount] = useState(0);

  const refreshDailyCount = useCallback(async () => {
    try {
      const startUtc = new Date();
      startUtc.setUTCHours(0, 0, 0, 0);
      const { count } = await supabase
        .from('coach_invites')
        .select('code', { count: 'exact', head: true })
        .gte('created_at', startUtc.toISOString());
      setCreatedTodayCount(count ?? 0);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    refreshDailyCount();
  }, [refreshDailyCount]);

  const dailyLimitReached = createdTodayCount >= 1;

  // ---------------------------------------------------------------------------
  // CREATE
  // ---------------------------------------------------------------------------
  const handleCreate = async () => {
    setError(null);
    const clean = coachName.trim();
    if (clean.length < 2) {
      setError('Escribe el nombre de tu coach (mín. 2 caracteres)');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }
    if (dailyLimitReached) {
      setError('Solo puedes generar 1 invitación al día');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }
    setGenerating(true);
    try {
      const { data, error: rpcErr } = await supabase.rpc('coach_invite_create', {
        p_coach_name: clean,
        p_duration_hours: duration,
      });
      if (rpcErr) throw rpcErr;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setCoachName('');
      await Promise.all([fetchActive(), refreshDailyCount()]);
    } catch (e: any) {
      const msg = String(e?.message || '');
      if (msg.includes('DAILY_LIMIT_REACHED')) {
        setError('Solo puedes generar 1 invitación al día');
      } else if (msg.includes('INVALID_DURATION')) {
        setError('Duración inválida');
      } else if (msg.includes('INVALID_NAME')) {
        setError('Nombre del coach inválido');
      } else {
        setError(msg || 'No se pudo generar el código');
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setGenerating(false);
    }
  };

  // ---------------------------------------------------------------------------
  // REVOKE
  // ---------------------------------------------------------------------------
  const handleRevoke = async () => {
    if (!active) return;
    Alert.alert('Revocar acceso', `Cerrarás la sesión de ${active.coach_name}. ¿Continuar?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Revocar',
        style: 'destructive',
        onPress: async () => {
          setRevoking(true);
          try {
            const { error: rpcErr } = await supabase.rpc('coach_invite_revoke', {
              p_code: active.code,
            });
            if (rpcErr) throw rpcErr;
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            await fetchActive();
          } catch (e: any) {
            setError(e?.message || 'No se pudo revocar');
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          } finally {
            setRevoking(false);
          }
        },
      },
    ]);
  };

  // ---------------------------------------------------------------------------
  // ACTIONS
  // ---------------------------------------------------------------------------
  const handleCopy = async () => {
    if (!active) return;
    await Clipboard.setStringAsync(active.code);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert('Copiado', 'Código copiado al portapapeles');
  };

  const handleShare = async () => {
    if (!active) return;
    const message =
      `🛡️ Acceso TRENS para ${active.coach_name}\n\n` +
      `Código: ${active.code}\n` +
      `Duración: ${active.duration_hours}h\n\n` +
      `Ingresa en: trens.app/coach\nO en la app: ACCESO COACH`;
    try {
      if (Platform.OS === 'web' && typeof navigator !== 'undefined' && (navigator as any).share) {
        await (navigator as any).share({ title: 'Acceso Coach TRENS', text: message });
      } else {
        await Share.share({ message });
      }
    } catch {
      /* user cancelled */
    }
  };

  // ---------------------------------------------------------------------------
  // DERIVED
  // ---------------------------------------------------------------------------
  const remainingMs = useMemo(() => {
    if (!active) return 0;
    return Math.max(0, new Date(active.expires_at).getTime() - now);
  }, [active, now]);

  const isExpired = active && remainingMs <= 0;

  // ---------------------------------------------------------------------------
  // RENDER
  // ---------------------------------------------------------------------------
  return (
    <View className="flex-1 bg-savage-black">
      <Stack.Screen options={{ headerShown: false }} />

      {/* HEADER */}
      <View
        className="flex-row items-center justify-between px-4 border-b border-zinc-900"
        style={{ paddingTop: Platform.OS === 'ios' ? 56 : 20, paddingBottom: 16 }}
      >
        <TouchableOpacity
          onPress={() => router.back()}
          className="w-10 h-10 rounded-full bg-zinc-900 items-center justify-center border border-zinc-800"
        >
          <ArrowLeft size={20} color="#A1A1AA" />
        </TouchableOpacity>
        <View className="flex-row items-center gap-2">
          <Shield size={18} color="#DC2626" />
          <Text className="text-white text-base font-bold tracking-widest">ACCESO COACH</Text>
        </View>
        <View className="w-10" />
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: 60 }}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <View className="py-20 items-center">
            <ActivityIndicator color="#DC2626" />
          </View>
        ) : active && !isExpired ? (
          // ============================================================
          // INVITACIÓN ACTIVA
          // ============================================================
          <View>
            <View className="bg-zinc-950 border border-savage-red/40 rounded-3xl p-6 mb-4">
              <View className="flex-row items-center gap-2 mb-3">
                <View className="w-2 h-2 rounded-full bg-savage-red" />
                <Text className="text-savage-red text-[11px] font-bold tracking-widest">
                  ACTIVA · {active.has_session ? 'COACH CONECTADO' : 'ESPERANDO COACH'}
                </Text>
              </View>

              <Text className="text-zinc-400 text-xs uppercase tracking-wider mb-1">
                CÓDIGO PARA
              </Text>
              <Text className="text-white text-2xl font-bold mb-5">{active.coach_name}</Text>

              <View className="bg-black border border-zinc-800 rounded-2xl py-6 items-center mb-5">
                <Text className="text-white text-4xl font-mono font-bold tracking-[0.3em]">
                  {active.code}
                </Text>
              </View>

              <View className="flex-row items-center gap-2 mb-5">
                <Clock size={14} color="#A1A1AA" />
                <Text className="text-zinc-400 text-sm font-mono">
                  Expira en {formatCoachRemaining(remainingMs)}
                </Text>
              </View>

              <View className="flex-row gap-2">
                <TouchableOpacity
                  onPress={handleCopy}
                  className="flex-1 bg-zinc-900 border border-zinc-800 rounded-2xl py-3 flex-row items-center justify-center gap-2"
                >
                  <Copy size={16} color="#fff" />
                  <Text className="text-white text-sm font-bold tracking-wider">COPIAR</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleShare}
                  className="flex-1 bg-savage-red rounded-2xl py-3 flex-row items-center justify-center gap-2"
                >
                  <Send size={16} color="#fff" />
                  <Text className="text-white text-sm font-bold tracking-wider">ENVIAR</Text>
                </TouchableOpacity>
              </View>
            </View>

            <TouchableOpacity
              onPress={handleRevoke}
              disabled={revoking}
              className="bg-zinc-950 border border-red-900/40 rounded-2xl p-4 flex-row items-center justify-center gap-2"
            >
              {revoking ? (
                <ActivityIndicator color="#DC2626" />
              ) : (
                <>
                  <XIcon size={16} color="#DC2626" />
                  <Text className="text-savage-red text-sm font-bold tracking-widest">
                    REVOCAR ACCESO AHORA
                  </Text>
                </>
              )}
            </TouchableOpacity>

            <View className="mt-6 bg-zinc-950 border border-zinc-900 rounded-2xl p-4">
              <Text className="text-zinc-500 text-xs leading-5">
                Tu coach podrá editar tu plan de entrenamiento durante {active.duration_hours}{' '}
                {active.duration_hours === 1 ? 'hora' : 'horas'}. Cuando expire o lo revoques,
                pierde el acceso al instante. Cada cambio queda registrado.
              </Text>
            </View>
          </View>
        ) : (
          // ============================================================
          // FORMULARIO DE NUEVA INVITACIÓN
          // ============================================================
          <View>
            {/* HERO */}
            <View className="items-center mb-8 mt-4">
              <View className="w-20 h-20 rounded-full bg-savage-red/10 border border-savage-red/30 items-center justify-center mb-4">
                <Shield size={36} color="#DC2626" />
              </View>
              <Text className="text-white text-2xl font-bold italic mb-1">INVITA A TU COACH</Text>
              <Text className="text-zinc-500 text-center text-sm leading-5 px-4">
                Tu coach podrá editar tu plan sin crear cuenta. Tú controlas el tiempo.
              </Text>
            </View>

            {dailyLimitReached && !active && (
              <View className="bg-yellow-900/20 border border-yellow-800/40 rounded-2xl p-4 mb-4 flex-row items-start gap-3">
                <AlertCircle size={18} color="#EAB308" />
                <Text className="text-yellow-400 text-sm flex-1 leading-5">
                  Ya creaste una invitación hoy. Podrás generar otra mañana.
                </Text>
              </View>
            )}

            {error && (
              <View className="bg-red-900/30 border border-red-800/40 rounded-2xl p-4 mb-4">
                <Text className="text-red-400 text-sm">{error}</Text>
              </View>
            )}

            {/* NOMBRE COACH */}
            <Text className="text-zinc-500 text-xs uppercase tracking-widest font-bold mb-2">
              NOMBRE DEL COACH
            </Text>
            <TextInput
              value={coachName}
              onChangeText={(t) => {
                setCoachName(t);
                setError(null);
              }}
              placeholder="Ej. Coach Ramos"
              placeholderTextColor="#52525b"
              maxLength={60}
              className="bg-zinc-950 border border-zinc-800 rounded-2xl px-4 py-4 text-white text-base mb-6"
            />

            {/* DURACIÓN */}
            <Text className="text-zinc-500 text-xs uppercase tracking-widest font-bold mb-2">
              TIEMPO DE ACCESO
            </Text>
            <View className="flex-row gap-3 mb-8">
              {DURATIONS.map((opt) => {
                const active = duration === opt.value;
                return (
                  <TouchableOpacity
                    key={opt.value}
                    onPress={() => {
                      Haptics.selectionAsync();
                      setDuration(opt.value);
                    }}
                    className={`flex-1 rounded-2xl border p-4 ${
                      active ? 'bg-savage-red/10 border-savage-red' : 'bg-zinc-950 border-zinc-800'
                    }`}
                  >
                    <View className="flex-row items-center justify-between mb-1">
                      <Clock size={18} color={active ? '#DC2626' : '#71717A'} />
                      {active && <CheckCircle2 size={16} color="#DC2626" />}
                    </View>
                    <Text
                      className={`text-base font-bold tracking-widest mt-2 ${
                        active ? 'text-white' : 'text-zinc-300'
                      }`}
                    >
                      {opt.label}
                    </Text>
                    <Text className="text-zinc-500 text-xs mt-1">{opt.sub}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* CTA */}
            <TouchableOpacity
              onPress={handleCreate}
              disabled={generating || dailyLimitReached}
              className={`rounded-2xl py-4 items-center flex-row justify-center gap-2 ${
                generating || dailyLimitReached ? 'bg-zinc-800' : 'bg-savage-red'
              }`}
              style={
                !generating && !dailyLimitReached
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
              {generating ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Sparkles size={18} color="#fff" />
                  <Text className="text-white font-bold text-base tracking-widest">
                    GENERAR CÓDIGO
                  </Text>
                </>
              )}
            </TouchableOpacity>

            {/* INFO */}
            <View className="mt-8 gap-3">
              <InfoRow text="Solo 1 invitación al día por seguridad." />
              <InfoRow text="El código expira automáticamente." />
              <InfoRow text="Puedes revocar el acceso cuando quieras." />
              <InfoRow text="Cada cambio que haga tu coach queda registrado." />
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================
function InfoRow({ text }: { text: string }) {
  return (
    <View className="flex-row items-start gap-3">
      <View className="w-1.5 h-1.5 rounded-full bg-savage-red mt-1.5" />
      <Text className="text-zinc-400 text-sm flex-1 leading-5">{text}</Text>
    </View>
  );
}
