// ============================================================================
// QUICK MEALS MODAL - Vista simplificada de comidas desde Hank Tools
// Lista las comidas del día con hora + botón para agregar
// Estilo Savage Mode - consistente con PlanNotesModal
// ============================================================================

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  ScrollView,
  ActivityIndicator,
  PanResponder,
} from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { Clock, Utensils, ChevronRight, CalendarCheck } from 'lucide-react-native';
import { router } from 'expo-router';
import { Haptics } from '../../lib/haptics';
import { supabase } from '../../lib/supabase';

interface MealRow {
  id: string;
  name: string;
  scheduled_time: string | null;
  ingredients: any[];
}

interface QuickMealsModalProps {
  visible: boolean;
  onClose: () => void;
}

const formatTime12h = (time24: string): string => {
  if (!time24) return '--:--';
  const [hours, minutes] = time24.split(':').map(Number);
  const period = hours >= 12 ? 'PM' : 'AM';
  const hours12 = hours % 12 || 12;
  return `${hours12}:${(minutes || 0).toString().padStart(2, '0')} ${period}`;
};

export const QuickMealsModal: React.FC<QuickMealsModalProps> = ({ visible, onClose }) => {
  const [meals, setMeals] = useState<MealRow[]>([]);
  const [loading, setLoading] = useState(true);

  const translateY = useSharedValue(0);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => Math.abs(gestureState.dy) > 5,
      onPanResponderGrant: () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      },
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy > 0) {
          translateY.value = gestureState.dy;
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > 100 || gestureState.vy > 0.5) {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          onClose();
        } else {
          translateY.value = withSpring(0, { damping: 20, stiffness: 300 });
        }
      },
    })
  ).current;

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const fetchMeals = useCallback(async () => {
    setLoading(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }
    const { data } = await supabase
      .from('meals')
      .select('id, name, scheduled_time, ingredients')
      .eq('user_id', user.id)
      .order('scheduled_time', { ascending: true });

    setMeals(data || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (visible) {
      translateY.value = 0;
      fetchMeals();
    }
  }, [visible, fetchMeals]);

  const handleGoToPlan = () => {
    onClose();
    setTimeout(() => router.push('/(tabs)/plan'), 200);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View className="flex-1 bg-transparent justify-end">
        <Pressable className="flex-1" onPress={onClose} />
        <Animated.View
          style={[
            animatedStyle,
            {
              backgroundColor: '#0a0a0a',
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              maxHeight: '90%',
              borderTopWidth: 2,
              borderTopColor: 'rgba(34, 197, 94, 0.5)',
              overflow: 'hidden',
            },
          ]}
        >
          {/* Línea de acento superior */}
          <View
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: 3,
              backgroundColor: '#22c55e',
              shadowColor: '#22c55e',
              shadowOffset: { width: 0, height: 0 },
              shadowOpacity: 0.8,
              shadowRadius: 10,
              zIndex: 10,
            }}
          />

          {/* Header Draggable */}
          <View {...panResponder.panHandlers} className="border-b border-zinc-800/50">
            {/* Drag Indicator */}
            <View className="pt-4 pb-2 items-center">
              <View className="w-12 h-1.5 bg-zinc-600 rounded-full" />
            </View>

            {/* Header Title */}
            <View className="flex-row items-center justify-between px-4 pb-4">
              <View className="flex-row items-center gap-2">
                <Utensils size={18} color="#22c55e" />
                <Text className="text-white font-bold text-lg">Comidas</Text>
                <Text className="text-zinc-500 text-[10px] font-mono ml-1">
                  {meals.length > 0 ? `${meals.length} COMIDAS` : ''}
                </Text>
              </View>
            </View>
          </View>

          {/* List */}
          {loading ? (
            <View className="py-12 items-center">
              <ActivityIndicator size="small" color="#22c55e" />
            </View>
          ) : meals.length === 0 ? (
            <View className="py-12 items-center">
              <Text className="text-zinc-500 text-sm font-mono">Sin comidas creadas</Text>
            </View>
          ) : (
            <ScrollView className="px-4 flex-1 pt-2" showsVerticalScrollIndicator={false}>
              {meals.map((meal, idx) => {
                const ingredients = Array.isArray(meal.ingredients) ? meal.ingredients : [];
                const totalIngredients = ingredients.length;
                return (
                  <View
                    key={meal.id}
                    className="mb-3 rounded-2xl overflow-hidden"
                    style={{
                      backgroundColor: '#111113',
                      borderWidth: 1,
                      borderColor: '#27272a40',
                    }}
                  >
                    {/* Meal header card */}
                    <View
                      className="flex-row items-center justify-between px-4 py-3"
                      style={{
                        borderBottomWidth: ingredients.length > 0 ? 1 : 0,
                        borderBottomColor: '#27272a30',
                      }}
                    >
                      <View className="flex-row items-center gap-3">
                        <View
                          className="w-8 h-8 rounded-full items-center justify-center"
                          style={{
                            backgroundColor: '#22c55e18',
                            borderWidth: 1,
                            borderColor: '#22c55e30',
                          }}
                        >
                          <Text className="text-xs font-bold" style={{ color: '#22c55e' }}>
                            {idx + 1}
                          </Text>
                        </View>
                        <View>
                          <Text className="text-white text-sm font-bold">Comida {idx + 1}</Text>
                          <Text className="text-zinc-500 text-[10px] font-mono mt-0.5">
                            {totalIngredients}{' '}
                            {totalIngredients === 1 ? 'ingrediente' : 'ingredientes'}
                          </Text>
                        </View>
                      </View>

                      {meal.scheduled_time && (
                        <View
                          className="flex-row items-center gap-1.5 px-3 py-1.5 rounded-full"
                          style={{
                            backgroundColor: '#22c55e12',
                            borderWidth: 1,
                            borderColor: '#22c55e25',
                          }}
                        >
                          <Clock size={12} color="#22c55e" />
                          <Text className="text-sm font-bold" style={{ color: '#22c55e' }}>
                            {formatTime12h(meal.scheduled_time.slice(0, 5))}
                          </Text>
                        </View>
                      )}
                    </View>

                    {/* Ingredients list */}
                    {ingredients.length > 0 ? (
                      <View className="px-4 py-2.5 gap-2">
                        {ingredients.map((ing: any, i: number) => {
                          const qty = ing.skipGrams
                            ? ing.portion || null
                            : ing.quantity || '~100 gr';
                          const wType = !ing.skipGrams && ing.weightType ? ing.weightType : null;

                          return (
                            <View key={i} className="flex-row items-center justify-between">
                              <View className="flex-row items-center gap-2 flex-1 mr-2">
                                <View
                                  className="w-1.5 h-1.5 rounded-full"
                                  style={{ backgroundColor: '#22c55e60' }}
                                />
                                <Text className="text-white text-[13px]" numberOfLines={1}>
                                  {ing.name}
                                </Text>
                              </View>
                              {qty && (
                                <View className="flex-row items-center gap-1.5">
                                  <Text className="text-zinc-400 text-xs font-mono font-bold">
                                    {qty}
                                  </Text>
                                  {wType && (
                                    <View
                                      className="px-1.5 py-0.5 rounded"
                                      style={{
                                        backgroundColor:
                                          wType === 'cocido'
                                            ? 'rgba(34,197,94,0.15)'
                                            : 'rgba(239,68,68,0.15)',
                                        borderWidth: 1,
                                        borderColor:
                                          wType === 'cocido'
                                            ? 'rgba(34,197,94,0.3)'
                                            : 'rgba(239,68,68,0.3)',
                                      }}
                                    >
                                      <Text
                                        className="text-[9px] font-mono font-bold uppercase"
                                        style={{
                                          color: wType === 'cocido' ? '#4ade80' : '#f87171',
                                        }}
                                      >
                                        {wType === 'cocido' ? 'C' : 'R'}
                                      </Text>
                                    </View>
                                  )}
                                </View>
                              )}
                            </View>
                          );
                        })}
                      </View>
                    ) : (
                      <View className="px-4 py-3">
                        <Text className="text-zinc-600 text-[11px] font-mono">
                          Sin ingredientes
                        </Text>
                      </View>
                    )}
                  </View>
                );
              })}
              {/* Spacer for bottom button */}
              <View className="h-2" />
            </ScrollView>
          )}

          {/* Ver Plan Button */}
          <View className="px-4 pt-3 pb-6">
            <Pressable
              onPress={handleGoToPlan}
              className="flex-row items-center justify-center gap-2 py-3 rounded-xl active:scale-[0.98]"
              style={{
                backgroundColor: 'rgba(34, 197, 94, 0.15)',
                borderWidth: 1,
                borderColor: 'rgba(34, 197, 94, 0.4)',
              }}
            >
              <CalendarCheck size={16} color="#22c55e" />
              <Text className="text-green-500 font-bold text-sm">VER PLAN COMPLETO</Text>
            </Pressable>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
};

export default QuickMealsModal;
