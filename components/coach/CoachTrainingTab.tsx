// CoachTrainingTab — selecciona día, lista ejercicios, edita series, gestiona superseries
import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Modal,
  TextInput,
  Image,
} from 'react-native';
import { Plus, Trash2, X, Search, Link2, Save, Settings2 } from 'lucide-react-native';
import { supabase } from '../../lib/supabase';
import { Alert } from '../../lib/alert';
import * as Haptics from '../../lib/haptics';
import {
  CoachTabProps,
  CoachDayExercise,
  CoachExerciseSeries,
  CoachCatalogExercise,
  CoachExerciseGroup,
  DAY_LABELS,
  SERIES_TYPE_COLORS,
} from './types';

const SERIES_TYPES: CoachExerciseSeries['type'][] = [
  'CALENTAMIENTO',
  'APROXIMACION',
  'EFECTIVA',
  'FALLO',
];

export default function CoachTrainingTab({ token, onError, onSaved }: CoachTabProps) {
  const [day, setDay] = useState(0);
  const [loading, setLoading] = useState(true);
  const [exercises, setExercises] = useState<CoachDayExercise[]>([]);
  const [groups, setGroups] = useState<CoachExerciseGroup[]>([]);
  const [savingGroups, setSavingGroups] = useState(false);

  // Picker modal
  const [pickerVisible, setPickerVisible] = useState(false);
  const [catalog, setCatalog] = useState<CoachCatalogExercise[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [search, setSearch] = useState('');

  // Series editor
  const [editingExercise, setEditingExercise] = useState<CoachDayExercise | null>(null);
  const [editingSeries, setEditingSeries] = useState<CoachExerciseSeries[]>([]);
  const [editingRest, setEditingRest] = useState('90s');
  const [editingNotes, setEditingNotes] = useState('');
  const [savingSeries, setSavingSeries] = useState(false);

  // Group editor visible flag
  const [groupsVisible, setGroupsVisible] = useState(false);

  // -------- LOAD --------
  const loadDay = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error: rpcErr } = await supabase.rpc('coach_list_day_exercises', {
        p_token: token,
        p_day: day,
      });
      if (rpcErr) throw rpcErr;
      const result = data as {
        exercises: CoachDayExercise[];
        groups: CoachExerciseGroup[];
      };
      setExercises(result?.exercises ?? []);
      setGroups(result?.groups ?? []);
    } catch (e: any) {
      onError(e?.message || 'No se pudieron cargar los ejercicios');
    } finally {
      setLoading(false);
    }
  }, [token, day, onError]);

  useEffect(() => {
    loadDay();
  }, [loadDay]);

  // -------- CATALOG --------
  const loadCatalog = useCallback(
    async (q: string) => {
      setCatalogLoading(true);
      try {
        const { data, error: rpcErr } = await supabase.rpc('coach_search_exercises', {
          p_token: token,
          p_query: q || null,
          p_muscle: null,
          p_limit: 80,
        });
        if (rpcErr) throw rpcErr;
        setCatalog((data as any)?.exercises ?? []);
      } catch (e: any) {
        onError(e?.message || 'No se pudo buscar');
      } finally {
        setCatalogLoading(false);
      }
    },
    [token, onError]
  );

  useEffect(() => {
    if (pickerVisible) loadCatalog(search);
  }, [pickerVisible, search, loadCatalog]);

  // -------- ADD --------
  const addExercise = async (ex: CoachCatalogExercise) => {
    try {
      const { error: rpcErr } = await supabase.rpc('coach_add_exercise', {
        p_token: token,
        p_exercise_id: ex.id,
        p_day: day,
      });
      if (rpcErr) throw rpcErr;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onSaved();
      setPickerVisible(false);
      loadDay();
    } catch (e: any) {
      onError(e?.message || 'No se pudo agregar');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  };

  // -------- REMOVE --------
  const removeExercise = (ex: CoachDayExercise) => {
    Alert.alert('Quitar ejercicio', `¿Quitar "${ex.name}" del día ${DAY_LABELS[day]}?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Quitar',
        style: 'destructive',
        onPress: async () => {
          try {
            const { error: rpcErr } = await supabase.rpc('coach_remove_exercise', {
              p_token: token,
              p_config_id: ex.id,
              p_day: day,
            });
            if (rpcErr) throw rpcErr;
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            onSaved();
            loadDay();
          } catch (e: any) {
            onError(e?.message || 'No se pudo quitar');
          }
        },
      },
    ]);
  };

  // -------- SERIES EDIT --------
  const openSeriesEditor = (ex: CoachDayExercise) => {
    const seriesByDay = ex.config?.series_by_day?.[String(day)];
    const baseSeries =
      seriesByDay && seriesByDay.length
        ? seriesByDay
        : ex.config?.custom_series && ex.config.custom_series.length
          ? ex.config.custom_series
          : [{ id: '1', type: 'EFECTIVA' as const, reps: 10, weight: 0 }];
    setEditingExercise(ex);
    setEditingSeries(baseSeries.map((s) => ({ ...s }) as CoachExerciseSeries));
    setEditingRest(ex.config?.rest || '90s');
    setEditingNotes(ex.config?.notes || '');
  };

  const updateSeries = (idx: number, patch: Partial<CoachExerciseSeries>) => {
    setEditingSeries((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], ...patch };
      return next;
    });
  };
  const addSeries = (type: CoachExerciseSeries['type']) => {
    setEditingSeries((prev) => [...prev, { id: String(Date.now()), type, reps: 10, weight: 0 }]);
  };
  const removeSeriesAt = (idx: number) => {
    setEditingSeries((prev) => prev.filter((_, i) => i !== idx));
  };

  const saveSeries = async () => {
    if (!editingExercise) return;
    setSavingSeries(true);
    try {
      const newConfig = {
        ...(editingExercise.config || {}),
        rest: editingRest,
        notes: editingNotes || undefined,
        series_by_day: {
          ...(editingExercise.config?.series_by_day || {}),
          [String(day)]: editingSeries,
        },
        custom_series:
          editingExercise.config?.custom_series && editingExercise.config.custom_series.length
            ? editingExercise.config.custom_series
            : editingSeries,
      };
      const { error: rpcErr } = await supabase.rpc('coach_update_exercise_config', {
        p_token: token,
        p_config_id: editingExercise.id,
        p_config: newConfig,
      });
      if (rpcErr) throw rpcErr;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onSaved();
      setEditingExercise(null);
      loadDay();
    } catch (e: any) {
      onError(e?.message || 'No se pudo guardar');
    } finally {
      setSavingSeries(false);
    }
  };

  // -------- GROUPS --------
  const addGroup = () => {
    if (exercises.length < 2) {
      Alert.alert('Atención', 'Necesitas al menos 2 ejercicios para crear una superserie');
      return;
    }
    setGroups((prev) => [
      ...prev,
      {
        id: String(Date.now()),
        type: 'SUPERSERIES',
        exercise_ids: [],
        rest_after: 90,
        rounds: 3,
      },
    ]);
  };
  const updateGroup = (idx: number, patch: Partial<CoachExerciseGroup>) => {
    setGroups((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], ...patch };
      return next;
    });
  };
  const toggleGroupExercise = (gIdx: number, exId: string) => {
    setGroups((prev) => {
      const next = [...prev];
      const has = next[gIdx].exercise_ids.includes(exId);
      next[gIdx] = {
        ...next[gIdx],
        exercise_ids: has
          ? next[gIdx].exercise_ids.filter((id) => id !== exId)
          : [...next[gIdx].exercise_ids, exId],
      };
      return next;
    });
  };
  const removeGroupAt = (idx: number) => {
    setGroups((prev) => prev.filter((_, i) => i !== idx));
  };
  const saveGroups = async () => {
    setSavingGroups(true);
    try {
      const { error: rpcErr } = await supabase.rpc('coach_set_exercise_groups', {
        p_token: token,
        p_day: day,
        p_groups: groups,
      });
      if (rpcErr) throw rpcErr;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onSaved();
      setGroupsVisible(false);
    } catch (e: any) {
      onError(e?.message || 'No se pudo guardar');
    } finally {
      setSavingGroups(false);
    }
  };

  return (
    <View className="flex-1">
      {/* Selector de día */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 10, gap: 6 }}
      >
        {Array.from({ length: 7 }, (_, i) => i).map((d) => {
          const active = d === day;
          return (
            <TouchableOpacity
              key={d}
              onPress={() => setDay(d)}
              className={`px-4 py-2 rounded-full border ${
                active ? 'bg-savage-red border-savage-red' : 'bg-zinc-950 border-zinc-900'
              }`}
            >
              <Text
                className="text-xs font-bold tracking-widest"
                style={{ color: active ? '#000' : '#A1A1AA' }}
              >
                D{d + 1} · {DAY_LABELS[d]}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 100 }}>
        {/* Acciones */}
        <View className="flex-row gap-2 mb-3">
          <TouchableOpacity
            onPress={() => setPickerVisible(true)}
            className="flex-1 bg-savage-red rounded-2xl py-3 flex-row items-center justify-center gap-2"
          >
            <Plus size={16} color="#fff" />
            <Text className="text-white text-xs font-bold tracking-widest">AGREGAR EJERCICIO</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setGroupsVisible(true)}
            className="px-4 bg-zinc-900 border border-zinc-800 rounded-2xl py-3 flex-row items-center justify-center gap-1"
          >
            <Link2 size={14} color="#A855F7" />
            <Text className="text-purple-400 text-xs font-bold tracking-widest">
              SUPERSERIES ({groups.length})
            </Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <View className="py-10 items-center">
            <ActivityIndicator color="#DC2626" />
          </View>
        ) : exercises.length === 0 ? (
          <View className="bg-zinc-950 border border-zinc-900 rounded-2xl p-6 items-center">
            <Text className="text-zinc-500 text-sm text-center">
              Sin ejercicios para {DAY_LABELS[day]}. Pulsa AGREGAR EJERCICIO.
            </Text>
          </View>
        ) : (
          exercises.map((ex) => {
            const seriesList =
              ex.config?.series_by_day?.[String(day)] || ex.config?.custom_series || [];
            return (
              <TouchableOpacity
                key={ex.id}
                onPress={() => openSeriesEditor(ex)}
                className="bg-zinc-950 border border-zinc-900 rounded-2xl p-3 mb-2 flex-row"
              >
                <View className="w-12 h-12 bg-zinc-900 rounded-lg overflow-hidden mr-3">
                  {ex.thumbnail_url ? (
                    <Image
                      source={{ uri: ex.thumbnail_url }}
                      className="w-full h-full"
                      resizeMode="cover"
                    />
                  ) : (
                    <View className="w-full h-full items-center justify-center">
                      <Text className="text-zinc-600 text-lg">💪</Text>
                    </View>
                  )}
                </View>
                <View className="flex-1">
                  <Text className="text-white text-sm font-bold" numberOfLines={1}>
                    {ex.name}
                  </Text>
                  <Text className="text-zinc-500 text-[10px] font-mono">
                    {seriesList.length || 0} series · descanso {ex.config?.rest || '—'}
                  </Text>
                  <View className="flex-row gap-1 mt-1">
                    {seriesList.slice(0, 6).map((s, si) => (
                      <View
                        key={si}
                        className="px-1.5 py-0.5 rounded"
                        style={{ backgroundColor: SERIES_TYPE_COLORS[s.type] }}
                      >
                        <Text className="text-black text-[9px] font-bold">{s.reps}</Text>
                      </View>
                    ))}
                  </View>
                </View>
                <View className="items-end gap-1">
                  <TouchableOpacity onPress={() => openSeriesEditor(ex)} className="p-1.5">
                    <Settings2 size={16} color="#A1A1AA" />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => removeExercise(ex)} className="p-1.5">
                    <Trash2 size={16} color="#DC2626" />
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>

      {/* PICKER MODAL */}
      <Modal visible={pickerVisible} animationType="slide" transparent>
        <View className="flex-1 bg-black/95 pt-12 px-4">
          <View className="flex-row items-center justify-between mb-3">
            <Text className="text-white font-bold text-base">Catálogo de ejercicios</Text>
            <TouchableOpacity onPress={() => setPickerVisible(false)}>
              <X size={22} color="#A1A1AA" />
            </TouchableOpacity>
          </View>
          <View className="flex-row items-center bg-zinc-900 rounded-xl px-3 py-2 mb-3">
            <Search size={16} color="#A1A1AA" />
            <TextInput
              className="flex-1 text-white ml-2 font-mono"
              placeholder="Buscar ejercicio..."
              placeholderTextColor="#52525B"
              value={search}
              onChangeText={setSearch}
            />
          </View>
          {catalogLoading ? (
            <ActivityIndicator color="#DC2626" />
          ) : (
            <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
              {catalog.map((ex) => (
                <TouchableOpacity
                  key={ex.id}
                  onPress={() => addExercise(ex)}
                  className="bg-zinc-950 border border-zinc-900 rounded-xl p-3 mb-2 flex-row items-center"
                >
                  <View className="w-10 h-10 bg-zinc-900 rounded-lg overflow-hidden mr-3">
                    {ex.thumbnail_url ? (
                      <Image
                        source={{ uri: ex.thumbnail_url }}
                        className="w-full h-full"
                        resizeMode="cover"
                      />
                    ) : null}
                  </View>
                  <View className="flex-1">
                    <Text className="text-white text-sm font-bold" numberOfLines={1}>
                      {ex.name}
                    </Text>
                    <Text className="text-zinc-500 text-[10px] font-mono">
                      {ex.muscle_group || '—'}
                    </Text>
                  </View>
                  <Plus size={16} color="#22C55E" />
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
        </View>
      </Modal>

      {/* SERIES EDITOR MODAL */}
      <Modal visible={!!editingExercise} animationType="slide" transparent>
        {editingExercise && (
          <View className="flex-1 bg-black/95 pt-12 px-4">
            <View className="flex-row items-center justify-between mb-3">
              <View className="flex-1 pr-2">
                <Text className="text-white font-bold text-base" numberOfLines={1}>
                  {editingExercise.name}
                </Text>
                <Text className="text-zinc-500 text-xs">
                  Día {day + 1} · {DAY_LABELS[day]}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setEditingExercise(null)}>
                <X size={22} color="#A1A1AA" />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ paddingBottom: 100 }}>
              {/* Notas del ejercicio */}
              <Text className="text-zinc-500 text-[10px] tracking-widest font-bold mb-1">
                NOTAS DEL EJERCICIO
              </Text>
              <TextInput
                className="bg-zinc-900 text-white p-3 rounded-xl text-sm font-mono mb-3"
                placeholder="Técnica, ROM, recordatorios..."
                placeholderTextColor="#52525B"
                value={editingNotes}
                onChangeText={setEditingNotes}
                multiline
                maxLength={500}
              />

              {/* Descanso */}
              <Text className="text-zinc-500 text-[10px] tracking-widest font-bold mb-1">
                DESCANSO
              </Text>
              <View className="flex-row gap-2 mb-4">
                {['60s', '90s', '120s', '180s'].map((r) => (
                  <TouchableOpacity
                    key={r}
                    onPress={() => setEditingRest(r)}
                    className={`flex-1 py-2 rounded-xl items-center ${
                      editingRest === r ? 'bg-savage-red' : 'bg-zinc-900 border border-zinc-800'
                    }`}
                  >
                    <Text
                      className="text-xs font-bold"
                      style={{ color: editingRest === r ? '#fff' : '#A1A1AA' }}
                    >
                      {r}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Series */}
              <Text className="text-zinc-500 text-[10px] tracking-widest font-bold mb-1">
                SERIES ({editingSeries.length})
              </Text>
              {editingSeries.map((s, i) => (
                <View
                  key={s.id}
                  className="bg-zinc-950 border-l-4 rounded-xl p-3 mb-2"
                  style={{ borderLeftColor: SERIES_TYPE_COLORS[s.type] }}
                >
                  <View className="flex-row items-center justify-between mb-2">
                    <View className="flex-row items-center gap-2">
                      <View
                        className="px-2 py-0.5 rounded"
                        style={{ backgroundColor: SERIES_TYPE_COLORS[s.type] }}
                      >
                        <Text className="text-black text-[10px] font-bold">{i + 1}</Text>
                      </View>
                      <Text className="text-white text-xs font-bold">{s.type}</Text>
                    </View>
                    <TouchableOpacity onPress={() => removeSeriesAt(i)}>
                      <Trash2 size={14} color="#DC2626" />
                    </TouchableOpacity>
                  </View>
                  <View className="flex-row gap-2">
                    <View className="flex-1">
                      <Text className="text-zinc-500 text-[9px] mb-0.5">REPS</Text>
                      <TextInput
                        className="bg-zinc-900 text-white p-1.5 rounded text-xs font-mono"
                        keyboardType="numeric"
                        value={String(s.reps)}
                        onChangeText={(v) => updateSeries(i, { reps: parseInt(v, 10) || 0 })}
                        maxLength={4}
                      />
                    </View>
                    <View className="flex-1">
                      <Text className="text-zinc-500 text-[9px] mb-0.5">PESO (kg)</Text>
                      <TextInput
                        className="bg-zinc-900 text-white p-1.5 rounded text-xs font-mono"
                        keyboardType="numeric"
                        value={String(s.weight ?? '')}
                        onChangeText={(v) => updateSeries(i, { weight: parseFloat(v) || 0 })}
                        maxLength={6}
                      />
                    </View>
                    <View className="flex-1">
                      <Text className="text-zinc-500 text-[9px] mb-0.5">RIR</Text>
                      <TextInput
                        className="bg-zinc-900 text-white p-1.5 rounded text-xs font-mono"
                        keyboardType="numeric"
                        value={String(s.rir ?? '')}
                        onChangeText={(v) =>
                          updateSeries(i, { rir: v === '' ? undefined : parseInt(v, 10) })
                        }
                        maxLength={2}
                      />
                    </View>
                    <View className="flex-1">
                      <Text className="text-zinc-500 text-[9px] mb-0.5">TEMPO</Text>
                      <TextInput
                        className="bg-zinc-900 text-white p-1.5 rounded text-xs font-mono"
                        placeholder="3-1-1-0"
                        placeholderTextColor="#52525B"
                        value={s.tempo || ''}
                        onChangeText={(v) => updateSeries(i, { tempo: v })}
                        maxLength={12}
                      />
                    </View>
                  </View>
                  <TextInput
                    className="bg-zinc-900 text-white p-1.5 rounded mt-2 text-xs font-mono"
                    placeholder="Nota..."
                    placeholderTextColor="#52525B"
                    value={s.note || ''}
                    onChangeText={(v) => updateSeries(i, { note: v })}
                  />
                </View>
              ))}

              <View className="flex-row flex-wrap gap-2 mt-2">
                {SERIES_TYPES.map((t) => (
                  <TouchableOpacity
                    key={t}
                    className="px-3 py-2 rounded-full"
                    style={{ backgroundColor: SERIES_TYPE_COLORS[t] }}
                    onPress={() => addSeries(t)}
                  >
                    <Text className="text-black text-[10px] font-bold">+ {t}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TouchableOpacity
                onPress={saveSeries}
                disabled={savingSeries}
                className="bg-savage-red py-4 rounded-2xl mt-6 flex-row items-center justify-center gap-2"
              >
                {savingSeries ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Save size={16} color="#fff" />
                    <Text className="text-white font-bold tracking-widest text-xs">
                      GUARDAR CONFIGURACIÓN
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        )}
      </Modal>

      {/* GROUPS MODAL */}
      <Modal visible={groupsVisible} animationType="slide" transparent>
        <View className="flex-1 bg-black/95 pt-12 px-4">
          <View className="flex-row items-center justify-between mb-3">
            <Text className="text-white font-bold text-base">Superseries · D{day + 1}</Text>
            <TouchableOpacity onPress={() => setGroupsVisible(false)}>
              <X size={22} color="#A1A1AA" />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={{ paddingBottom: 100 }}>
            <TouchableOpacity
              onPress={addGroup}
              className="bg-purple-700 rounded-2xl py-3 flex-row items-center justify-center gap-2 mb-3"
            >
              <Plus size={16} color="#fff" />
              <Text className="text-white text-xs font-bold tracking-widest">NUEVO GRUPO</Text>
            </TouchableOpacity>

            {groups.length === 0 && (
              <View className="bg-zinc-950 border border-zinc-900 rounded-2xl p-6 items-center">
                <Text className="text-zinc-500 text-sm text-center">
                  Sin grupos. Crea superseries, triseries, circuitos o drop-sets.
                </Text>
              </View>
            )}

            {groups.map((g, gi) => (
              <View
                key={g.id}
                className="bg-zinc-950 border-l-4 border-zinc-900 rounded-2xl p-3 mb-2"
                style={{ borderLeftColor: '#A855F7' }}
              >
                <View className="flex-row items-center justify-between mb-2">
                  <View className="flex-row gap-1">
                    {(['SUPERSERIES', 'TRISERIES', 'CIRCUITO', 'DROP_SET'] as const).map((t) => (
                      <TouchableOpacity
                        key={t}
                        className="px-2 py-1 rounded"
                        style={{ backgroundColor: g.type === t ? '#A855F7' : '#27272a' }}
                        onPress={() => updateGroup(gi, { type: t })}
                      >
                        <Text className="text-white text-[9px] font-bold">{t}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <TouchableOpacity onPress={() => removeGroupAt(gi)}>
                    <Trash2 size={14} color="#DC2626" />
                  </TouchableOpacity>
                </View>
                <Text className="text-zinc-500 text-[10px] mb-1">
                  EJERCICIOS ({g.exercise_ids.length})
                </Text>
                <View className="flex-row flex-wrap gap-1.5 mb-2">
                  {exercises.map((ex) => {
                    const selected = g.exercise_ids.includes(ex.exercise_id);
                    return (
                      <TouchableOpacity
                        key={ex.exercise_id}
                        className="px-2 py-1 rounded"
                        style={{ backgroundColor: selected ? '#A855F7' : '#27272a' }}
                        onPress={() => toggleGroupExercise(gi, ex.exercise_id)}
                      >
                        <Text className="text-white text-[10px] font-bold">{ex.name}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <View className="flex-row gap-2">
                  <View className="flex-1">
                    <Text className="text-zinc-500 text-[9px]">RONDAS</Text>
                    <TextInput
                      className="bg-zinc-900 text-white p-1.5 rounded text-xs font-mono"
                      keyboardType="numeric"
                      value={String(g.rounds ?? '')}
                      onChangeText={(v) =>
                        updateGroup(gi, { rounds: parseInt(v, 10) || undefined })
                      }
                    />
                  </View>
                  <View className="flex-1">
                    <Text className="text-zinc-500 text-[9px]">DESCANSO (s)</Text>
                    <TextInput
                      className="bg-zinc-900 text-white p-1.5 rounded text-xs font-mono"
                      keyboardType="numeric"
                      value={String(g.rest_after ?? '')}
                      onChangeText={(v) =>
                        updateGroup(gi, { rest_after: parseInt(v, 10) || undefined })
                      }
                    />
                  </View>
                </View>
              </View>
            ))}

            <TouchableOpacity
              onPress={saveGroups}
              disabled={savingGroups}
              className="bg-savage-red py-4 rounded-2xl mt-4 flex-row items-center justify-center gap-2"
            >
              {savingGroups ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Save size={16} color="#fff" />
                  <Text className="text-white font-bold tracking-widest text-xs">
                    GUARDAR GRUPOS
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}
