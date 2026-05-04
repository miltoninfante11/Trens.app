// ============================================================================
// QUICK MEALS MODAL - Vista simplificada de comidas desde Hank Tools
// Lista las comidas del día con hora + botón para agregar
// Estilo Savage Mode - consistente con PlanNotesModal
// ============================================================================

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  ScrollView,
  ActivityIndicator,
  PanResponder,
  useWindowDimensions,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  FadeIn,
} from 'react-native-reanimated';
import {
  Clock,
  Utensils,
  CalendarCheck,
  ShoppingCart,
  Check,
  ChevronDown,
  ChevronUp,
} from 'lucide-react-native';
import { router } from 'expo-router';
import { Haptics } from '../../lib/haptics';
import { supabase } from '../../lib/supabase';
import { aggregateIngredients, MealForShopping } from '../../services/shopping/shoppingAggregator';
import { ShoppingPeriod, CATEGORY_CONFIG } from '../../types/shopping';

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
  const { width: SCREEN_W } = useWindowDimensions();
  const pagerRef = useRef<ScrollView>(null);
  const [meals, setMeals] = useState<MealRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'meals' | 'shopping'>('meals');
  const [shoppingPeriod, setShoppingPeriod] = useState<ShoppingPeriod>('today');
  const [checkedItems, setCheckedItems] = useState<Set<string>>(new Set());
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());

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
      // Sync pager position with current activeTab on reopen (no refetch on tab change)
      requestAnimationFrame(() => {
        pagerRef.current?.scrollTo({
          x: activeTab === 'meals' ? 0 : SCREEN_W,
          animated: false,
        });
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, fetchMeals]);

  // ============================================================================
  // SHOPPING LIST AGGREGATION
  // ============================================================================
  const daysMultiplier = useMemo(() => {
    switch (shoppingPeriod) {
      case 'today':
        return 1;
      case '3days':
        return 3;
      case 'week':
        return 7;
      default:
        return 1;
    }
  }, [shoppingPeriod]);

  const shoppingList = useMemo(() => {
    const mealsForShopping: MealForShopping[] = meals.map((m) => ({
      id: m.id,
      name: m.name,
      selectedOption: 0,
      options: [
        {
          id: `${m.id}-opt-0`,
          name: m.name,
          ingredients: (Array.isArray(m.ingredients) ? m.ingredients : []).map(
            (ing: any, i: number) => ({
              id: ing.id || `${m.id}-ing-${i}`,
              name: ing.name || '',
              quantity: ing.quantity || ing.portion || '~100 gr',
              portion: ing.portion,
            })
          ),
        },
      ],
    }));
    return aggregateIngredients(mealsForShopping, shoppingPeriod, daysMultiplier);
  }, [meals, shoppingPeriod, daysMultiplier]);

  const toggleItem = useCallback((id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCheckedItems((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleCategory = useCallback((cat: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  }, []);

  const handleGoToPlan = () => {
    onClose();
    setTimeout(() => router.push('/(tabs)/plan'), 200);
  };

  // Tap a tab → animate the horizontal pager
  const goToTab = useCallback(
    (tab: 'meals' | 'shopping') => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setActiveTab(tab);
      pagerRef.current?.scrollTo({ x: tab === 'meals' ? 0 : SCREEN_W, animated: true });
    },
    [SCREEN_W]
  );

  // Horizontal scroll → sync active tab in real-time (works on web + native)
  const onPagerScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const x = e.nativeEvent.contentOffset.x;
      const next = x < SCREEN_W / 2 ? 'meals' : 'shopping';
      if (next !== activeTab) {
        Haptics.selectionAsync?.();
        setActiveTab(next);
      }
    },
    [SCREEN_W, activeTab]
  );

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
            <View className="flex-row items-center justify-between px-4 pb-3">
              <View className="flex-row items-center gap-2">
                {activeTab === 'meals' ? (
                  <Utensils size={18} color="#22c55e" />
                ) : (
                  <ShoppingCart size={18} color="#22c55e" />
                )}
                <Text className="text-white font-bold text-lg">
                  {activeTab === 'meals' ? 'Comidas' : 'Lista de Compras'}
                </Text>
                <Text className="text-zinc-500 text-[10px] font-mono ml-1">
                  {activeTab === 'meals'
                    ? meals.length > 0
                      ? `${meals.length} COMIDAS`
                      : ''
                    : shoppingList.totalItems > 0
                      ? `${shoppingList.totalItems} ITEMS`
                      : ''}
                </Text>
              </View>
            </View>

            {/* Tabs */}
            <View className="flex-row gap-2 px-4 pb-3">
              <Pressable
                onPress={() => goToTab('meals')}
                className="flex-1 py-2.5 rounded-xl items-center"
                style={{
                  backgroundColor:
                    activeTab === 'meals' ? 'rgba(34, 197, 94, 0.15)' : 'rgba(39, 39, 42, 0.4)',
                  borderWidth: 1,
                  borderColor: activeTab === 'meals' ? '#22C55E' : '#27272A',
                }}
              >
                <View className="flex-row items-center gap-1.5">
                  <Utensils size={14} color={activeTab === 'meals' ? '#22C55E' : '#71717A'} />
                  <Text
                    className={`text-xs font-bold tracking-wider ${
                      activeTab === 'meals' ? 'text-green-500' : 'text-zinc-500'
                    }`}
                  >
                    COMIDAS
                  </Text>
                </View>
              </Pressable>

              <Pressable
                onPress={() => goToTab('shopping')}
                className="flex-1 py-2.5 rounded-xl items-center"
                style={{
                  backgroundColor:
                    activeTab === 'shopping' ? 'rgba(34, 197, 94, 0.15)' : 'rgba(39, 39, 42, 0.4)',
                  borderWidth: 1,
                  borderColor: activeTab === 'shopping' ? '#22C55E' : '#27272A',
                }}
              >
                <View className="flex-row items-center gap-1.5">
                  <ShoppingCart
                    size={14}
                    color={activeTab === 'shopping' ? '#22C55E' : '#71717A'}
                  />
                  <Text
                    className={`text-xs font-bold tracking-wider ${
                      activeTab === 'shopping' ? 'text-green-500' : 'text-zinc-500'
                    }`}
                  >
                    COMPRAS
                  </Text>
                </View>
              </Pressable>
            </View>
          </View>

          {/* Pager - always mounted so swipe state is preserved */}
          <ScrollView
            ref={pagerRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onScroll={onPagerScroll}
            scrollEventThrottle={16}
            keyboardShouldPersistTaps="handled"
            className="flex-1"
          >
            {/* MEALS PAGE */}
            <View style={{ width: SCREEN_W }} className="flex-1">
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
                              const wType =
                                !ing.skipGrams && ing.weightType ? ing.weightType : null;

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
            </View>

            {/* SHOPPING PAGE */}
            <View style={{ width: SCREEN_W }} className="flex-1">
              <ScrollView className="px-4 flex-1 pt-3" showsVerticalScrollIndicator={false}>
                {/* Period Selector */}
                <View className="flex-row gap-2 mb-3">
                  {(
                    [
                      { key: 'today', label: 'HOY' },
                      { key: '3days', label: '3 DÍAS' },
                      { key: 'week', label: 'SEMANA' },
                    ] as { key: ShoppingPeriod; label: string }[]
                  ).map((p) => (
                    <Pressable
                      key={p.key}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setShoppingPeriod(p.key);
                      }}
                      className="flex-1 py-2.5 rounded-xl items-center"
                      style={{
                        backgroundColor:
                          shoppingPeriod === p.key
                            ? 'rgba(34, 197, 94, 0.15)'
                            : 'rgba(39, 39, 42, 0.4)',
                        borderWidth: 1,
                        borderColor: shoppingPeriod === p.key ? '#22C55E' : '#27272A',
                      }}
                    >
                      <Text
                        className={`text-[11px] font-bold tracking-wider ${
                          shoppingPeriod === p.key ? 'text-green-500' : 'text-zinc-500'
                        }`}
                      >
                        {p.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>

                {/* Empty state */}
                {shoppingList.totalItems === 0 ? (
                  <View className="py-12 items-center">
                    <ShoppingCart size={36} color="#3F3F46" />
                    <Text className="text-zinc-500 text-sm font-mono mt-3">
                      Sin ingredientes para comprar
                    </Text>
                    <Text className="text-zinc-600 text-[11px] font-mono mt-1">
                      Agrega comidas para generar la lista
                    </Text>
                  </View>
                ) : (
                  <>
                    {/* Resumen */}
                    <View className="flex-row gap-2 mb-3">
                      <View
                        className="flex-1 py-2 rounded-xl items-center"
                        style={{
                          backgroundColor: 'rgba(34, 197, 94, 0.08)',
                          borderWidth: 1,
                          borderColor: 'rgba(34, 197, 94, 0.2)',
                        }}
                      >
                        <Text className="text-green-500 font-bold text-base">
                          {shoppingList.totalItems}
                        </Text>
                        <Text className="text-zinc-500 text-[10px] font-mono uppercase tracking-wider">
                          ITEMS
                        </Text>
                      </View>
                      <View
                        className="flex-1 py-2 rounded-xl items-center"
                        style={{
                          backgroundColor: 'rgba(34, 197, 94, 0.08)',
                          borderWidth: 1,
                          borderColor: 'rgba(34, 197, 94, 0.2)',
                        }}
                      >
                        <Text className="text-green-500 font-bold text-base">
                          {shoppingList.categories.length}
                        </Text>
                        <Text className="text-zinc-500 text-[10px] font-mono uppercase tracking-wider">
                          CATEGORÍAS
                        </Text>
                      </View>
                    </View>

                    {/* Categorías */}
                    {shoppingList.categories.map((cat) => {
                      const config = CATEGORY_CONFIG[cat.category];
                      const isCollapsed = collapsedCategories.has(cat.category);
                      const checkedInCat = cat.items.filter((i) => checkedItems.has(i.id)).length;
                      const progress = cat.items.length > 0 ? checkedInCat / cat.items.length : 0;

                      return (
                        <Animated.View
                          key={cat.category}
                          entering={FadeIn.duration(200)}
                          className="mb-3 rounded-2xl overflow-hidden"
                          style={{
                            backgroundColor: '#0A0A0A',
                            borderWidth: 1,
                            borderColor: 'rgba(34, 197, 94, 0.1)',
                          }}
                        >
                          <Pressable
                            onPress={() => toggleCategory(cat.category)}
                            className="flex-row items-center justify-between p-3"
                            style={{
                              backgroundColor: 'rgba(34, 197, 94, 0.05)',
                              borderBottomWidth: isCollapsed ? 0 : 1,
                              borderBottomColor: 'rgba(34, 197, 94, 0.1)',
                            }}
                          >
                            <View className="flex-row items-center gap-3 flex-1">
                              <Text className="text-xl">{cat.icon}</Text>
                              <View className="flex-1">
                                <Text className="text-white font-bold text-sm">{config.label}</Text>
                                <Text className="text-zinc-500 text-[11px] font-mono">
                                  {checkedInCat}/{cat.items.length} items
                                </Text>
                              </View>
                            </View>
                            <View className="flex-row items-center gap-2">
                              <View className="w-12 h-1 rounded-full bg-zinc-800 overflow-hidden">
                                <View
                                  style={{
                                    width: `${progress * 100}%`,
                                    height: '100%',
                                    backgroundColor: '#22C55E',
                                  }}
                                />
                              </View>
                              {isCollapsed ? (
                                <ChevronDown size={16} color="#71717A" />
                              ) : (
                                <ChevronUp size={16} color="#71717A" />
                              )}
                            </View>
                          </Pressable>

                          {!isCollapsed && (
                            <View>
                              {cat.items.map((item) => {
                                const isChecked = checkedItems.has(item.id);
                                return (
                                  <Pressable
                                    key={item.id}
                                    onPress={() => toggleItem(item.id)}
                                    className="flex-row items-center py-2.5 px-3 border-b border-zinc-900"
                                  >
                                    <View
                                      className="w-5 h-5 rounded-md mr-3 items-center justify-center"
                                      style={{
                                        backgroundColor: isChecked ? '#22C55E' : 'transparent',
                                        borderWidth: isChecked ? 0 : 1.5,
                                        borderColor: '#3F3F46',
                                      }}
                                    >
                                      {isChecked && (
                                        <Check size={12} color="#FFFFFF" strokeWidth={3} />
                                      )}
                                    </View>
                                    <Text
                                      className={`flex-1 text-[13px] ${
                                        isChecked ? 'text-zinc-600 line-through' : 'text-white'
                                      }`}
                                      numberOfLines={1}
                                    >
                                      {item.name}
                                    </Text>
                                    <View
                                      className="px-2 py-0.5 rounded-md"
                                      style={{ backgroundColor: 'rgba(34, 197, 94, 0.1)' }}
                                    >
                                      <Text className="text-green-500 text-[11px] font-mono font-bold">
                                        {item.quantity}
                                      </Text>
                                    </View>
                                  </Pressable>
                                );
                              })}
                            </View>
                          )}
                        </Animated.View>
                      );
                    })}
                  </>
                )}
                <View className="h-4" />
              </ScrollView>
            </View>
          </ScrollView>

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
