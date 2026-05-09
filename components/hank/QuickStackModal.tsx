// ============================================================================
// QUICK STACK MODAL - Wrapper standalone para StackManagerModal
// Carga items de supplement_stack y gestiona CRUD internamente
// Para poder abrirse desde cualquier módulo via Hank Tools
// ============================================================================

import React, { useState, useEffect, useCallback } from 'react';
import { StackManagerModal } from '../plan/StackManagerModal';
import { supabase } from '../../lib/supabase';

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

interface QuickStackModalProps {
  visible: boolean;
  onClose: () => void;
}

export const QuickStackModal: React.FC<QuickStackModalProps> = ({ visible, onClose }) => {
  const [items, setItems] = useState<StackItem[]>([]);
  const [hasDualSession, setHasDualSession] = useState(false);

  const fetchItems = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { data } = await supabase
      .from('supplement_stack')
      .select('*, product:shop_products(id, name, thumbnail_url, price)')
      .eq('user_id', user.id)
      .eq('is_active', true);

    if (data) {
      setItems(
        data.map((row: any) => ({
          id: row.id,
          name: row.name || '',
          dose: row.dose || '',
          type: row.type || 'pill',
          notes: row.notes || undefined,
          time: row.time ? String(row.time).slice(0, 5) : undefined,
          times: row.times || undefined,
          isPreWorkout: row.is_pre_workout || false,
          isPostWorkout: row.is_post_workout || false,
          daysOfWeek: row.days_of_week || undefined,
          workoutSessionIndex: row.workout_session_index ?? undefined,
          productId: row.product_id || undefined,
          productThumbnail: row.product?.thumbnail_url || undefined,
          productPrice:
            row.product?.price !== undefined && row.product?.price !== null
              ? Number(row.product.price)
              : undefined,
        }))
      );
    }

    // Check dual session
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('dual_session_enabled')
      .eq('user_id', user.id)
      .single();

    setHasDualSession(profile?.dual_session_enabled || false);
  }, []);

  useEffect(() => {
    if (visible) fetchItems();
  }, [visible, fetchItems]);

  const handleAdd = useCallback(
    async (item: Omit<StackItem, 'id'>) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase.from('supplement_stack').insert({
        user_id: user.id,
        name: item.name,
        dose: item.dose,
        type: item.type,
        notes: item.notes || null,
        time: item.time || null,
        times: item.times || null,
        is_pre_workout: item.isPreWorkout || false,
        is_post_workout: item.isPostWorkout || false,
        is_active: true,
        days_of_week: item.daysOfWeek || null,
        workout_session_index: item.workoutSessionIndex ?? null,
        product_id: item.productId || null,
      });

      if (!error) fetchItems();
    },
    [fetchItems]
  );

  const handleRemove = useCallback(async (id: string) => {
    await supabase.from('supplement_stack').delete().eq('id', id);
    setItems((prev) => prev.filter((i) => i.id !== id));
  }, []);

  const handleUpdate = useCallback(
    async (id: string, updates: Partial<Omit<StackItem, 'id'>>) => {
      const dbUpdates: Record<string, any> = {};
      if (updates.name !== undefined) dbUpdates.name = updates.name;
      if (updates.dose !== undefined) dbUpdates.dose = updates.dose;
      if (updates.type !== undefined) dbUpdates.type = updates.type;
      if (updates.notes !== undefined) dbUpdates.notes = updates.notes;
      if (updates.time !== undefined) dbUpdates.time = updates.time;
      if (updates.times !== undefined) dbUpdates.times = updates.times;
      if (updates.isPreWorkout !== undefined) dbUpdates.is_pre_workout = updates.isPreWorkout;
      if (updates.isPostWorkout !== undefined) dbUpdates.is_post_workout = updates.isPostWorkout;
      if (updates.daysOfWeek !== undefined) dbUpdates.days_of_week = updates.daysOfWeek;
      if (updates.workoutSessionIndex !== undefined)
        dbUpdates.workout_session_index = updates.workoutSessionIndex;
      if (updates.productId !== undefined) dbUpdates.product_id = updates.productId || null;

      await supabase.from('supplement_stack').update(dbUpdates).eq('id', id);
      await fetchItems();
    },
    [fetchItems]
  );

  return (
    <StackManagerModal
      visible={visible}
      onClose={onClose}
      items={items}
      onAddItem={handleAdd}
      onRemoveItem={handleRemove}
      onUpdateItem={handleUpdate}
      hasDualSession={hasDualSession}
      initialViewMode="list"
    />
  );
};

export default QuickStackModal;
