// CoachMealsTab — usa MealCard + AddMealModal + EditMealModal + AddOptionModal del usuario
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { Plus, UtensilsCrossed } from 'lucide-react-native';
import { supabase } from '../../lib/supabase';
import { Alert } from '../../lib/alert';
import * as Haptics from '../../lib/haptics';
import { CoachTabProps } from './types';
import { MealCard } from '../plan/MealCard';
import { AddMealModal } from '../plan/AddMealModal';
import { EditMealModal } from '../plan/EditMealModal';
import { AddOptionModal } from '../plan/AddOptionModal';
import TimePickerModal from '../plan/TimePickerModal';

interface Ingredient {
  id: string;
  name: string;
  quantity: string;
  portion?: string;
  skipGrams?: boolean;
  weightType?: 'cocido' | 'crudo';
  nutritionInfo?: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    suggestedGrams?: number;
  };
}

interface MealOption {
  id: string;
  name: string;
  ingredients: Ingredient[];
  notes?: string;
}

interface Meal {
  id: string;
  name: string;
  time: string;
  options: MealOption[];
  selectedOption: number;
}

const normalizeIngredient = (ing: any, idx: number, prefix = 'ing'): Ingredient => {
  const nutrition = ing.nutritionInfo
    ? ing.nutritionInfo
    : ing.calories != null || ing.protein != null
      ? {
          calories: ing.calories || 0,
          protein: ing.protein || 0,
          carbs: ing.carbs || 0,
          fat: ing.fat || 0,
        }
      : undefined;
  return {
    id: ing.id || `${prefix}-${idx}`,
    name: ing.name,
    quantity: ing.skipGrams ? '' : ing.quantity || '~100g',
    portion: ing.portion,
    skipGrams: ing.skipGrams || undefined,
    weightType: ing.weightType || undefined,
    ...(nutrition ? { nutritionInfo: nutrition } : {}),
  };
};

export default function CoachMealsTab({ token, onError, onSaved }: CoachTabProps) {
  const [loading, setLoading] = useState(true);
  const [meals, setMeals] = useState<Meal[]>([]);

  const [addModalVisible, setAddModalVisible] = useState(false);
  const [editModalMeal, setEditModalMeal] = useState<Meal | null>(null);
  const [editOptionIndex, setEditOptionIndex] = useState(0);
  const [addOptionMealId, setAddOptionMealId] = useState<string | null>(null);
  const [timePickerMealId, setTimePickerMealId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('coach_list_meals', { p_token: token });
      if (error) throw error;
      const rows = ((data as any)?.meals ?? []) as any[];

      const built: Meal[] = await Promise.all(
        rows.map(async (m: any) => {
          // Cargar alternativas
          const { data: optsRes } = await supabase.rpc('coach_list_meal_options', {
            p_token: token,
            p_meal_id: m.id,
          });
          const altRows = ((optsRes as any)?.options ?? []) as any[];

          const options: MealOption[] = [];
          const mainIngs = (m.ingredients || []) as any[];
          if (mainIngs.length > 0) {
            options.push({
              id: `main-${m.id}`,
              name: 'Principal',
              notes: m.notes || undefined,
              ingredients: mainIngs.map((ing, i) => normalizeIngredient(ing, i, 'main')),
            });
          }
          altRows
            .sort((a, b) => (a.position || 0) - (b.position || 0))
            .forEach((opt) => {
              options.push({
                id: opt.id,
                name: opt.name || 'Alternativa',
                notes: opt.notes || undefined,
                ingredients: ((opt.ingredients || []) as any[]).map((ing, i) =>
                  normalizeIngredient(ing, i, 'alt')
                ),
              });
            });

          const saved = m.selected_option ?? 0;
          const valid = options.length > 0 ? Math.min(Math.max(0, saved), options.length - 1) : 0;
          return {
            id: m.id,
            name: m.name || 'Comida',
            time: m.scheduled_time?.slice(0, 5) || '08:00',
            selectedOption: valid,
            options,
          };
        })
      );

      built.sort((a, b) => a.time.localeCompare(b.time));
      setMeals(built);
    } catch (e: any) {
      onError(e?.message || 'No se pudo cargar comidas');
    } finally {
      setLoading(false);
    }
  }, [token, onError]);

  useEffect(() => {
    load();
  }, [load]);

  const upsertMeal = async (payload: Record<string, any>) => {
    const { data, error } = await supabase.rpc('coach_upsert_meal', {
      p_token: token,
      p_meal: payload,
    });
    if (error) throw error;
    return (data as any)?.id as string;
  };

  // Crear comida nueva
  const handleAddMeal = async (ingredients: any[], time: string, notes?: string) => {
    try {
      await upsertMeal({
        name: 'Comida',
        scheduled_time: time,
        ingredients,
        notes: notes ?? null,
        position: meals.length,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onSaved();
      setAddModalVisible(false);
      load();
    } catch (e: any) {
      onError(e?.message || 'No se pudo agregar la comida');
    }
  };

  // Cambiar selectedOption
  const handleSwap = async (mealId: string, newIdx: number) => {
    setMeals((prev) => prev.map((m) => (m.id === mealId ? { ...m, selectedOption: newIdx } : m)));
    try {
      await upsertMeal({ id: mealId, selected_option: newIdx });
      onSaved();
    } catch (e: any) {
      onError(e?.message || 'No se pudo guardar la selección');
    }
  };

  // Cambiar hora
  const handleTimeChange = (mealId: string) => {
    setTimePickerMealId(mealId);
  };
  const handleSaveTime = async (newTime: string) => {
    if (!timePickerMealId) return;
    try {
      await upsertMeal({ id: timePickerMealId, scheduled_time: newTime });
      onSaved();
      setTimePickerMealId(null);
      load();
    } catch (e: any) {
      onError(e?.message || 'No se pudo actualizar hora');
    }
  };

  // Eliminar comida
  const handleDeleteMeal = (mealId: string) => {
    const meal = meals.find((m) => m.id === mealId);
    if (!meal) return;
    Alert.alert('Eliminar comida', `¿Eliminar ${meal.name}?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: async () => {
          try {
            const { error } = await supabase.rpc('coach_delete_meal', {
              p_token: token,
              p_meal_id: mealId,
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

  // Eliminar opción
  const handleDeleteOption = async (mealId: string, optionId: string) => {
    if (optionId.startsWith('main-')) {
      // No se puede eliminar la principal directamente — borrar comida entera o vaciar
      Alert.alert('Acción no soportada', 'No se puede eliminar la opción principal.');
      return;
    }
    try {
      const { error } = await supabase.rpc('coach_delete_meal_option', {
        p_token: token,
        p_option_id: optionId,
      });
      if (error) throw error;
      onSaved();
      load();
    } catch (e: any) {
      onError(e?.message || 'No se pudo eliminar la opción');
    }
  };

  // Abrir editor
  const handleEdit = (mealId: string, optionIndex?: number) => {
    const meal = meals.find((m) => m.id === mealId);
    if (!meal) return;
    setEditModalMeal(meal);
    setEditOptionIndex(optionIndex ?? meal.selectedOption);
  };

  // Guardar opción editada
  const handleSaveEdit = async (
    mealId: string,
    optionId: string,
    ingredients: Ingredient[],
    notes?: string
  ) => {
    try {
      if (optionId.startsWith('main-')) {
        await upsertMeal({
          id: mealId,
          ingredients,
          notes: notes ?? null,
        });
      } else {
        const { error } = await supabase.rpc('coach_upsert_meal_option', {
          p_token: token,
          p_meal_id: mealId,
          p_option: { id: optionId, ingredients, notes: notes ?? null },
        });
        if (error) throw error;
      }
      onSaved();
      setEditModalMeal(null);
      load();
    } catch (e: any) {
      onError(e?.message || 'No se pudo guardar');
    }
  };

  // Agregar opción
  const handleAddOption = (mealId: string) => {
    setAddOptionMealId(mealId);
  };
  const handleSaveOption = async (
    mealId: string,
    optionName: string,
    ingredients: Ingredient[],
    notes?: string
  ) => {
    try {
      const { error } = await supabase.rpc('coach_upsert_meal_option', {
        p_token: token,
        p_meal_id: mealId,
        p_option: {
          name: optionName,
          ingredients,
          notes: notes ?? null,
          position: meals.find((m) => m.id === mealId)?.options.length ?? 0,
        },
      });
      if (error) throw error;
      onSaved();
      setAddOptionMealId(null);
      load();
    } catch (e: any) {
      onError(e?.message || 'No se pudo agregar la alternativa');
    }
  };

  const addOptionMealName = useMemo(
    () => meals.find((m) => m.id === addOptionMealId)?.name || '',
    [addOptionMealId, meals]
  );
  const timePickerCurrentTime = useMemo(
    () => meals.find((m) => m.id === timePickerMealId)?.time || '08:00',
    [timePickerMealId, meals]
  );

  return (
    <View className="flex-1">
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>
        <TouchableOpacity
          onPress={() => setAddModalVisible(true)}
          className="rounded-2xl py-3 flex-row items-center justify-center gap-2 mb-3"
          style={{ backgroundColor: '#DC2626' }}
        >
          <Plus size={16} color="#fff" />
          <Text className="text-white text-xs font-bold tracking-widest">NUEVA COMIDA</Text>
        </TouchableOpacity>

        {loading ? (
          <ActivityIndicator color="#DC2626" />
        ) : meals.length === 0 ? (
          <View className="bg-zinc-950 border border-zinc-900 rounded-2xl p-6 items-center">
            <UtensilsCrossed size={24} color="#52525B" />
            <Text className="text-zinc-500 text-sm mt-2">Sin comidas en el plan</Text>
          </View>
        ) : (
          meals.map((meal) => (
            <MealCard
              key={meal.id}
              meal={meal}
              mealName={meal.name}
              onSwap={handleSwap}
              onTimeChange={handleTimeChange}
              onDelete={handleDeleteMeal}
              onDeleteOption={handleDeleteOption}
              onEdit={handleEdit}
              onAddOption={handleAddOption}
            />
          ))
        )}
      </ScrollView>

      <AddMealModal
        visible={addModalVisible}
        onClose={() => setAddModalVisible(false)}
        onSave={handleAddMeal}
      />

      <EditMealModal
        visible={!!editModalMeal}
        meal={editModalMeal ? { ...editModalMeal, selectedOption: editOptionIndex } : null}
        onClose={() => setEditModalMeal(null)}
        onSave={handleSaveEdit}
      />

      <AddOptionModal
        visible={!!addOptionMealId}
        mealId={addOptionMealId || ''}
        mealName={addOptionMealName}
        onClose={() => setAddOptionMealId(null)}
        onSave={handleSaveOption}
      />

      <TimePickerModal
        visible={!!timePickerMealId}
        currentTime={timePickerCurrentTime}
        onClose={() => setTimePickerMealId(null)}
        onSave={handleSaveTime}
      />
    </View>
  );
}
