// CoachCardioTab — usa CardioBlockCard + AddCardioModal del usuario
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { Plus, Activity } from 'lucide-react-native';
import { supabase } from '../../lib/supabase';
import { Alert } from '../../lib/alert';
import * as Haptics from '../../lib/haptics';
import { CoachTabProps } from './types';
import CardioBlockCard, { CardioBlock } from '../plan/CardioBlockCard';
import AddCardioModal, { AddCardioData, CardioType, CardioIntensity } from '../plan/AddCardioModal';
import TimePickerModal from '../plan/TimePickerModal';

export default function CoachCardioTab({ token, onError, onSaved }: CoachTabProps) {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<CardioBlock[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState<AddCardioData | null>(null);
  const [timePickerFor, setTimePickerFor] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('coach_list_cardio', { p_token: token });
      if (error) throw error;
      const rows = ((data as any)?.cardio ?? []) as CardioBlock[];
      setItems(rows);
    } catch (e: any) {
      onError(e?.message || 'No se pudo cargar cardio');
    } finally {
      setLoading(false);
    }
  }, [token, onError]);

  useEffect(() => {
    load();
  }, [load]);

  const cardioWithLabels = useMemo(
    () =>
      items.map((c, i) => ({
        cardio: c,
        label: items.length === 1 ? 'CARDIO' : `CARDIO ${i + 1}`,
      })),
    [items]
  );

  const handleSave = async (data: AddCardioData) => {
    try {
      const payload: any = {
        ...(editingId ? { id: editingId } : {}),
        cardio_type: data.cardio_type,
        activity: data.activity,
        duration_minutes: data.duration_minutes,
        intensity: data.intensity,
        scheduled_time: data.scheduled_time,
        notes: data.notes,
        days_of_week: data.days_of_week,
        is_pre_workout: data.is_pre_workout,
        is_post_workout: data.is_post_workout,
        workout_session_index: data.workout_session_index,
        target_heart_rate: data.target_heart_rate,
        speed: data.speed,
        incline: data.incline,
        display_order: items.length,
      };
      const { error } = await supabase.rpc('coach_upsert_cardio', {
        p_token: token,
        p_cardio: payload,
      });
      if (error) throw error;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onSaved();
      setModalVisible(false);
      setEditingId(null);
      setEditData(null);
      load();
    } catch (e: any) {
      onError(e?.message || 'No se pudo guardar');
    }
  };

  const handleDelete = (cardioId: string) => {
    const cardio = items.find((c) => c.id === cardioId);
    if (!cardio) return;
    Alert.alert('Eliminar cardio', `¿Eliminar "${cardio.activity}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: async () => {
          try {
            const { error } = await supabase.rpc('coach_delete_cardio', {
              p_token: token,
              p_cardio_id: cardioId,
            });
            if (error) throw error;
            onSaved();
            load();
          } catch (e: any) {
            onError(e?.message || 'No se pudo eliminar');
          }
        },
      },
    ]);
  };

  const handleEdit = (cardioId: string) => {
    const c = items.find((x) => x.id === cardioId);
    if (!c) return;
    setEditingId(cardioId);
    setEditData({
      cardio_type: c.cardio_type as CardioType,
      activity: c.activity,
      duration_minutes: c.duration_minutes,
      intensity: c.intensity as CardioIntensity,
      target_heart_rate: c.target_heart_rate ?? null,
      speed: c.speed ?? null,
      incline: c.incline ?? null,
      scheduled_time: (c.scheduled_time || '07:00').slice(0, 5),
      notes: c.notes || '',
      days_of_week: c.days_of_week || [],
      is_pre_workout: !!c.is_pre_workout,
      is_post_workout: !!c.is_post_workout,
      workout_session_index: c.workout_session_index ?? 0,
    });
    setModalVisible(true);
  };

  const handleTimeChange = async (newTime: string) => {
    if (!timePickerFor) return;
    try {
      const { error } = await supabase.rpc('coach_upsert_cardio', {
        p_token: token,
        p_cardio: { id: timePickerFor, scheduled_time: newTime },
      });
      if (error) throw error;
      onSaved();
      setTimePickerFor(null);
      load();
    } catch (e: any) {
      onError(e?.message || 'No se pudo actualizar la hora');
    }
  };

  const openCreate = () => {
    setEditingId(null);
    setEditData(null);
    setModalVisible(true);
  };

  return (
    <View className="flex-1">
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>
        <TouchableOpacity
          onPress={openCreate}
          className="bg-savage-red rounded-2xl py-3 flex-row items-center justify-center gap-2 mb-3"
          style={{ backgroundColor: '#DC2626' }}
        >
          <Plus size={16} color="#fff" />
          <Text className="text-white text-xs font-bold tracking-widest">NUEVO CARDIO</Text>
        </TouchableOpacity>

        {loading ? (
          <ActivityIndicator color="#DC2626" />
        ) : items.length === 0 ? (
          <View className="bg-zinc-950 border border-zinc-900 rounded-2xl p-6 items-center">
            <Activity size={24} color="#52525B" />
            <Text className="text-zinc-500 text-sm mt-2">Sin bloques de cardio</Text>
          </View>
        ) : (
          cardioWithLabels.map(({ cardio, label }) => (
            <CardioBlockCard
              key={cardio.id}
              cardio={cardio}
              cardioLabel={label}
              onTimeChange={(id) => setTimePickerFor(id)}
              onDelete={handleDelete}
              onEdit={handleEdit}
            />
          ))
        )}
      </ScrollView>

      <AddCardioModal
        visible={modalVisible}
        onClose={() => {
          setModalVisible(false);
          setEditingId(null);
          setEditData(null);
        }}
        onSave={handleSave}
        editData={editData}
      />

      <TimePickerModal
        visible={!!timePickerFor}
        currentTime={(items.find((c) => c.id === timePickerFor)?.scheduled_time || '07:00').slice(
          0,
          5
        )}
        onClose={() => setTimePickerFor(null)}
        onSave={handleTimeChange}
      />
    </View>
  );
}
