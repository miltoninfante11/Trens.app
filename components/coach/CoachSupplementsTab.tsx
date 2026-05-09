// CoachSupplementsTab — usa StackCard + StackManagerModal del usuario
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { Plus, FlaskConical } from 'lucide-react-native';
import { supabase } from '../../lib/supabase';
import { Alert } from '../../lib/alert';
import * as Haptics from '../../lib/haptics';
import { CoachTabProps } from './types';
import { StackCard } from '../plan/StackCard';
import { StackManagerModal } from '../plan/StackManagerModal';

interface StackItem {
  id: string;
  name: string;
  dose: string;
  type: 'pill' | 'syringe' | 'powder' | 'liquid';
  notes?: string;
  time?: string;
  times?: string[];
  isPreWorkout?: boolean;
  isPostWorkout?: boolean;
  daysOfWeek?: number[];
  workoutSessionIndex?: number;
  productId?: string;
  productThumbnail?: string;
  productPrice?: number;
}

interface Stack {
  id: string;
  time: string;
  items: StackItem[];
}

const dbToItem = (row: any): StackItem => ({
  id: row.id,
  name: row.name,
  dose: row.dose,
  type: row.type,
  notes: row.notes,
  time: row.time?.slice(0, 5),
  times: row.times || (row.time ? [row.time.slice(0, 5)] : undefined),
  isPreWorkout: row.is_pre_workout,
  isPostWorkout: row.is_post_workout,
  daysOfWeek: row.days_of_week,
  workoutSessionIndex: row.workout_session_index ?? 0,
  productId: row.product_id || undefined,
});

const itemToDb = (item: Partial<Omit<StackItem, 'id'>>): Record<string, any> => {
  const out: Record<string, any> = {};
  if (item.name !== undefined) out.name = item.name;
  if (item.dose !== undefined) out.dose = item.dose;
  if (item.type !== undefined) out.type = item.type;
  if (item.notes !== undefined) out.notes = item.notes || null;
  if (item.time !== undefined) out.time = item.time || null;
  if (item.times !== undefined) out.times = item.times || null;
  if (item.isPreWorkout !== undefined) out.is_pre_workout = item.isPreWorkout;
  if (item.isPostWorkout !== undefined) out.is_post_workout = item.isPostWorkout;
  if (item.daysOfWeek !== undefined) out.days_of_week = item.daysOfWeek;
  if (item.workoutSessionIndex !== undefined) out.workout_session_index = item.workoutSessionIndex;
  if (item.productId !== undefined) out.product_id = item.productId || null;
  return out;
};

export default function CoachSupplementsTab({ token, onError, onSaved }: CoachTabProps) {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<StackItem[]>([]);
  const [managerVisible, setManagerVisible] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('coach_list_supplements', { p_token: token });
      if (error) throw error;
      const rows = ((data as any)?.supplements ?? []) as any[];
      setItems(rows.map(dbToItem));
    } catch (e: any) {
      onError(e?.message || 'No se pudo cargar suplementos');
    } finally {
      setLoading(false);
    }
  }, [token, onError]);

  useEffect(() => {
    load();
  }, [load]);

  const stacks: Stack[] = useMemo(() => {
    const today = new Date().getDay();
    const byTime: Record<string, StackItem[]> = {};
    items.forEach((item) => {
      // Show all items, but if daysOfWeek defined and today not included, skip in timeline
      if (item.daysOfWeek && item.daysOfWeek.length > 0 && !item.daysOfWeek.includes(today)) return;
      const itemTimes =
        item.times && item.times.length > 0 ? item.times : item.time ? [item.time] : [];
      if (itemTimes.length === 0) return;
      itemTimes.forEach((t) => {
        if (!byTime[t]) byTime[t] = [];
        byTime[t].push({ ...item, time: t });
      });
    });
    return Object.entries(byTime)
      .map(([time, list]) => ({ id: `stack-${time}`, time, items: list }))
      .sort((a, b) => a.time.localeCompare(b.time));
  }, [items]);

  const handleAddItem = async (item: Omit<StackItem, 'id'>) => {
    try {
      const payload = {
        ...itemToDb(item),
        days_of_week: item.daysOfWeek || [0, 1, 2, 3, 4, 5, 6],
      };
      const { error } = await supabase.rpc('coach_upsert_supplement', {
        p_token: token,
        p_supplement: payload,
      });
      if (error) throw error;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onSaved();
      load();
    } catch (e: any) {
      onError(e?.message || 'No se pudo agregar');
    }
  };

  const handleRemoveItem = async (id: string) => {
    try {
      const { error } = await supabase.rpc('coach_delete_supplement', {
        p_token: token,
        p_supplement_id: id,
      });
      if (error) throw error;
      onSaved();
      load();
    } catch (e: any) {
      onError(e?.message || 'No se pudo eliminar');
    }
  };

  const handleUpdateItem = async (id: string, updates: Partial<Omit<StackItem, 'id'>>) => {
    try {
      const { error } = await supabase.rpc('coach_upsert_supplement', {
        p_token: token,
        p_supplement: { id, ...itemToDb(updates) },
      });
      if (error) throw error;
      onSaved();
      load();
    } catch (e: any) {
      onError(e?.message || 'No se pudo actualizar');
    }
  };

  const handleStackTimeChange = async (oldTime: string, _newTime: string) => {
    // StackCard onTimeChange receives the new time but we need to update all items at that old time.
    // For simplicity, open the manager so coach edits per-item.
    setManagerVisible(true);
  };

  return (
    <View className="flex-1">
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>
        <TouchableOpacity
          onPress={() => setManagerVisible(true)}
          className="rounded-2xl py-3 flex-row items-center justify-center gap-2 mb-3"
          style={{ backgroundColor: '#A855F7' }}
        >
          <Plus size={16} color="#fff" />
          <Text className="text-white text-xs font-bold tracking-widest">GESTIONAR STACK</Text>
        </TouchableOpacity>

        {loading ? (
          <ActivityIndicator color="#A855F7" />
        ) : stacks.length === 0 ? (
          <View className="bg-zinc-950 border border-zinc-900 rounded-2xl p-6 items-center">
            <FlaskConical size={24} color="#52525B" />
            <Text className="text-zinc-500 text-sm mt-2">Sin compuestos en el stack</Text>
          </View>
        ) : (
          stacks.map((stack) => (
            <StackCard
              key={stack.id}
              stack={stack}
              onTimeChange={(t) => handleStackTimeChange(stack.time, t)}
              onItemDelete={handleRemoveItem}
            />
          ))
        )}
      </ScrollView>

      <StackManagerModal
        visible={managerVisible}
        onClose={() => setManagerVisible(false)}
        items={items}
        onAddItem={handleAddItem}
        onRemoveItem={handleRemoveItem}
        onUpdateItem={handleUpdateItem}
        hasDualSession={false}
        initialViewMode="list"
      />
    </View>
  );
}
