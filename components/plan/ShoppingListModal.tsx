// ============================================================================
// SHOPPING LIST MODAL - Lista de Compras con estilo Savage Mode
// ============================================================================

import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { View, Text, Modal, Pressable, ScrollView, PanResponder, Platform } from 'react-native';
import Animated, {
  useAnimatedStyle,
  withSpring,
  useSharedValue,
  withTiming,
  FadeIn,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ShoppingCart, Check, ChevronDown, ChevronUp, X } from 'lucide-react-native';
import { Haptics } from '../../lib/haptics';
import {
  ShoppingPeriod,
  ShoppingCategory,
  ShoppingIngredient,
  CATEGORY_CONFIG,
} from '../../types/shopping';
import { aggregateIngredients, MealForShopping } from '../../services/shopping/shoppingAggregator';

// ============================================================================
// PROPS
// ============================================================================
interface ShoppingListModalProps {
  visible: boolean;
  onClose: () => void;
  meals: MealForShopping[];
}

// ============================================================================
// PERIOD SELECTOR
// ============================================================================
const PeriodSelector: React.FC<{
  selected: ShoppingPeriod;
  onSelect: (period: ShoppingPeriod) => void;
}> = ({ selected, onSelect }) => {
  const periods: { key: ShoppingPeriod; label: string; days: number }[] = [
    { key: 'today', label: 'HOY', days: 1 },
    { key: '3days', label: '3 DÍAS', days: 3 },
    { key: 'week', label: 'SEMANA', days: 7 },
  ];

  return (
    <View className="flex-row gap-2 mb-4">
      {periods.map((p) => (
        <Pressable
          key={p.key}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onSelect(p.key);
          }}
          className={`flex-1 py-3 rounded-xl items-center ${
            selected === p.key ? 'border-green-500' : 'border-zinc-800'
          }`}
          style={{
            backgroundColor: selected === p.key ? 'rgba(34, 197, 94, 0.15)' : '#0A0A0A',
            borderWidth: 1,
            borderColor: selected === p.key ? '#22C55E' : '#27272A',
          }}
        >
          <Text
            className={`text-xs font-bold tracking-wider ${
              selected === p.key ? 'text-green-500' : 'text-zinc-500'
            }`}
          >
            {p.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
};

// ============================================================================
// SHOPPING ITEM
// ============================================================================
const ShoppingItem: React.FC<{
  item: ShoppingIngredient;
  onToggle: (id: string) => void;
}> = ({ item, onToggle }) => {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    scale.value = withSpring(0.95, {}, () => {
      scale.value = withSpring(1);
    });
    onToggle(item.id);
  };

  return (
    <Animated.View style={animatedStyle}>
      <Pressable
        onPress={handlePress}
        className="flex-row items-center py-3 px-4 border-b border-zinc-900"
      >
        {/* Checkbox */}
        <View
          className="w-6 h-6 rounded-lg mr-3 items-center justify-center"
          style={{
            backgroundColor: item.isChecked ? '#22C55E' : 'transparent',
            borderWidth: item.isChecked ? 0 : 2,
            borderColor: '#3F3F46',
          }}
        >
          {item.isChecked && <Check size={14} color="#FFFFFF" strokeWidth={3} />}
        </View>

        {/* Name */}
        <Text
          className={`flex-1 text-sm ${
            item.isChecked ? 'text-zinc-600 line-through' : 'text-white'
          }`}
        >
          {item.name}
        </Text>

        {/* Quantity */}
        <View
          className="px-3 py-1 rounded-lg"
          style={{ backgroundColor: 'rgba(34, 197, 94, 0.1)' }}
        >
          <Text className="text-green-500 text-xs font-mono font-bold">{item.quantity}</Text>
        </View>
      </Pressable>
    </Animated.View>
  );
};

// ============================================================================
// SHOPPING CATEGORY CARD
// ============================================================================
const ShoppingCategoryCard: React.FC<{
  category: ShoppingCategory;
  onToggleItem: (id: string) => void;
}> = ({ category, onToggleItem }) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const config = CATEGORY_CONFIG[category.category];

  const progress = category.totalItems > 0 ? category.checkedItems / category.totalItems : 0;

  return (
    <Animated.View
      entering={FadeIn.delay(100)}
      className="mb-4 rounded-2xl overflow-hidden"
      style={{
        backgroundColor: '#0A0A0A',
        borderWidth: 1,
        borderColor: 'rgba(34, 197, 94, 0.1)',
      }}
    >
      {/* Header */}
      <Pressable
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          setIsExpanded(!isExpanded);
        }}
        className="flex-row items-center justify-between p-4"
        style={{
          backgroundColor: 'rgba(34, 197, 94, 0.05)',
          borderBottomWidth: isExpanded ? 1 : 0,
          borderBottomColor: 'rgba(34, 197, 94, 0.1)',
        }}
      >
        <View className="flex-row items-center gap-3">
          <Text className="text-2xl">{category.icon}</Text>
          <View>
            <Text className="text-white font-bold text-sm tracking-wide">{config.label}</Text>
            <Text className="text-zinc-500 text-xs">
              {category.checkedItems}/{category.totalItems} items
            </Text>
          </View>
        </View>

        <View className="flex-row items-center gap-3">
          {/* Progress bar mini */}
          <View className="w-16 h-1.5 rounded-full bg-zinc-800 overflow-hidden">
            <View
              className="h-full rounded-full"
              style={{
                width: `${progress * 100}%`,
                backgroundColor: progress === 1 ? '#22C55E' : '#22C55E',
              }}
            />
          </View>
          {isExpanded ? (
            <ChevronUp size={18} color="#71717A" />
          ) : (
            <ChevronDown size={18} color="#71717A" />
          )}
        </View>
      </Pressable>

      {/* Items */}
      {isExpanded && (
        <View>
          {category.items.map((item) => (
            <ShoppingItem key={item.id} item={item} onToggle={onToggleItem} />
          ))}
        </View>
      )}
    </Animated.View>
  );
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================
export const ShoppingListModal: React.FC<ShoppingListModalProps> = ({
  visible,
  onClose,
  meals,
}) => {
  const insets = useSafeAreaInsets();
  const [selectedPeriod, setSelectedPeriod] = useState<ShoppingPeriod>('today');
  const [checkedItems, setCheckedItems] = useState<Set<string>>(new Set());

  // -------------------------------------------------------------------------
  // DRAG TO CLOSE - Animated value for translateY
  // -------------------------------------------------------------------------
  const translateY = useSharedValue(0);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => Math.abs(gestureState.dy) > 5,
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy > 0) {
          translateY.value = gestureState.dy;
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > 150) {
          // Cerrar el modal
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onClose();
        } else {
          // Volver arriba
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          translateY.value = withTiming(0, { duration: 200 });
        }
      },
    })
  ).current;

  // Resetear translateY cuando el modal se abre
  useEffect(() => {
    if (visible) {
      translateY.value = 0;
    }
  }, [visible, translateY]);

  const animatedContainerStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  // Calcular multiplicador de días
  const daysMultiplier = useMemo(() => {
    switch (selectedPeriod) {
      case 'today':
        return 1;
      case '3days':
        return 3;
      case 'week':
        return 7;
      default:
        return 1;
    }
  }, [selectedPeriod]);

  // Generar lista de compras
  const shoppingList = useMemo(() => {
    const list = aggregateIngredients(meals, selectedPeriod, daysMultiplier);

    // Aplicar estado de checked desde el state local
    for (const category of list.categories) {
      for (const item of category.items) {
        item.isChecked = checkedItems.has(item.id);
      }
      category.checkedItems = category.items.filter((i) => i.isChecked).length;
    }
    list.checkedItems = Array.from(checkedItems).length;

    return list;
  }, [meals, selectedPeriod, daysMultiplier, checkedItems]);

  // Toggle item
  const handleToggleItem = useCallback((id: string) => {
    setCheckedItems((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  // Limpiar checks
  const handleClearChecks = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setCheckedItems(new Set());
  };

  // Progress total
  const totalProgress =
    shoppingList.totalItems > 0 ? shoppingList.checkedItems / shoppingList.totalItems : 0;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View className="flex-1 bg-transparent justify-end">
        <Animated.View
          style={[
            animatedContainerStyle,
            {
              backgroundColor: '#0a0a0a',
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              height: '90%',
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
              backgroundColor: '#22C55E',
              shadowColor: '#22C55E',
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
              <Text className="text-zinc-600 text-[9px] mt-1 tracking-wider">
                DESLIZA PARA CERRAR
              </Text>
            </View>

            {/* Header Title */}
            <View className="flex-row items-center px-4 pb-4 gap-3">
              <View
                className="w-10 h-10 rounded-xl items-center justify-center"
                style={{ backgroundColor: 'rgba(34, 197, 94, 0.15)' }}
              >
                <ShoppingCart size={20} color="#22C55E" />
              </View>
              <View className="flex-1">
                <Text className="text-white font-bold text-lg">Lista de Compras</Text>
                <Text className="text-zinc-500 text-xs">
                  {shoppingList.totalItems} ingredientes
                </Text>
              </View>
            </View>

            {/* Period Selector */}
            <View className="px-4 pb-3">
              <PeriodSelector selected={selectedPeriod} onSelect={setSelectedPeriod} />

              {/* Progress bar */}
              <View className="flex-row items-center gap-3 mt-1">
                <View className="flex-1 h-2 rounded-full bg-zinc-800 overflow-hidden">
                  <View
                    className="h-full rounded-full"
                    style={{
                      width: `${totalProgress * 100}%`,
                      backgroundColor: totalProgress === 1 ? '#22C55E' : '#22C55E',
                    }}
                  />
                </View>
                <Text className="text-zinc-400 text-xs font-mono">
                  {shoppingList.checkedItems}/{shoppingList.totalItems}
                </Text>
              </View>
            </View>
          </View>

          {/* Content */}
          <ScrollView
            className="flex-1 px-4 pt-4"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: shoppingList.checkedItems > 0 ? 100 : 40 }}
          >
            {shoppingList.categories.length > 0 ? (
              shoppingList.categories.map((category) => (
                <ShoppingCategoryCard
                  key={category.category}
                  category={category}
                  onToggleItem={handleToggleItem}
                />
              ))
            ) : (
              <View className="flex-1 items-center justify-center py-20">
                <ShoppingCart size={48} color="#3F3F46" />
                <Text className="text-zinc-600 text-center mt-4">
                  No hay ingredientes en tu plan
                </Text>
                <Text className="text-zinc-700 text-center text-sm mt-1">
                  Agrega comidas para generar tu lista
                </Text>
              </View>
            )}
          </ScrollView>

          {/* Bottom Action - Solo limpiar si hay items marcados */}
          {shoppingList.checkedItems > 0 && (
            <View
              className="px-5 pb-4 pt-3"
              style={{
                backgroundColor: '#0A0A0A',
                borderTopWidth: 1,
                borderTopColor: 'rgba(34, 197, 94, 0.15)',
                paddingBottom: Math.max(insets.bottom, 16) + 8,
              }}
            >
              <Pressable
                onPress={handleClearChecks}
                className="py-4 rounded-xl items-center flex-row justify-center gap-2"
                style={{
                  backgroundColor: 'rgba(239, 68, 68, 0.1)',
                  borderWidth: 1,
                  borderColor: 'rgba(239, 68, 68, 0.3)',
                }}
              >
                <X size={18} color="#EF4444" />
                <Text className="text-red-500 font-bold text-sm">
                  LIMPIAR SELECCIÓN ({shoppingList.checkedItems})
                </Text>
              </Pressable>
            </View>
          )}
        </Animated.View>
      </View>
    </Modal>
  );
};

export default ShoppingListModal;
