// ============================================================================
// MEAL CARD - Tarjeta de Comida con Slider Horizontal de Opciones
// Diseño industrial con opciones intercambiables
// ============================================================================

import React, { useRef, useCallback, useMemo, useState, useEffect } from 'react';
import { View, Text, Pressable, ScrollView, useWindowDimensions, Platform } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { Haptics } from '../../lib/haptics';
import { Clock, Plus, ChevronLeft, ChevronRight } from 'lucide-react-native';
import { useHankTarget } from '../../hooks/useHankTarget';
import { HankInlineHighlight } from '../hank/HankInlineHighlight';

const CARD_PADDING = 48; // padding total (ml-6 del timeline + px-5 del scroll)
const MAX_CARD_WIDTH = 600; // Ancho máximo para web

// ============================================================================
// TYPES
// ============================================================================
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
  time: string;
  options: MealOption[];
  selectedOption: number;
  // Macros objetivo por comida (opcional)
  targetMacros?: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
  };
  // Macros reales calculados desde ingredientes
  actualMacros?: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
  };
}

interface MealCardProps {
  meal: Meal;
  mealName: string;
  onSwap: (mealId: string, newOptionIndex: number) => void;
  onTimeChange: (mealId: string) => void;
  onDelete?: (mealId: string) => void;
  onDeleteOption?: (mealId: string, optionId: string) => void;
  onEdit?: (mealId: string, optionIndex?: number) => void;
  onAddOption?: (mealId: string) => void;
  isCompressed?: boolean;
}

// ============================================================================
// HELPERS
// ============================================================================
const formatTimeToAMPM = (time24: string): string => {
  if (!time24) return '12:00 PM';
  const [hours, minutes] = time24.split(':').map((s) => parseInt(s, 10));
  const h = hours || 0;
  const m = minutes || 0;
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 || 12;
  return `${hour12}:${m.toString().padStart(2, '0')} ${period}`;
};

// ============================================================================
// COMPONENT
// ============================================================================
export const MealCard: React.FC<MealCardProps> = ({
  meal,
  mealName,
  onSwap,
  onTimeChange,
  onDelete,
  onDeleteOption,
  onEdit,
  onAddOption,
  isCompressed = false,
}) => {
  // ============================================================================
  // HOOKS - Siempre deben llamarse primero, antes de cualquier return
  // ============================================================================
  const scrollViewRef = useRef<ScrollView>(null);
  const scaleAnim = useSharedValue(1);
  const [activeIndex, setActiveIndex] = useState(meal.selectedOption);

  // Sincronizar activeIndex cuando cambia selectedOption externamente
  useEffect(() => {
    setActiveIndex(meal.selectedOption);
  }, [meal.selectedOption]);

  // Dimensiones dinámicas para responsividad en web
  const { width: windowWidth } = useWindowDimensions();
  const optionWidth = useMemo(() => {
    const effectiveWidth =
      Platform.OS === 'web'
        ? Math.min(windowWidth - 40, MAX_CARD_WIDTH) // En web, restar padding del contenedor
        : windowWidth - CARD_PADDING;
    return effectiveWidth - 16; // Padding interno del slider
  }, [windowWidth]);

  // Hank Target - Registrar esta tarjeta como target para animaciones
  const { targetRef, onLayout, isHighlighted, animationPhase } = useHankTarget({
    id: `meal-${meal.id}`,
    type: 'meal',
    label: mealName,
  });

  // Navegar a opción específica
  const navigateToOption = useCallback(
    (index: number) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      scrollViewRef.current?.scrollTo({
        x: index * optionWidth,
        animated: true,
      });
      onSwap(meal.id, index);
    },
    [meal.id, onSwap, optionWidth]
  );

  // Rastrear posición del scroll en tiempo real para los dots
  const handleScroll = useCallback(
    (event: { nativeEvent: { contentOffset: { x: number } } }) => {
      const offsetX = event.nativeEvent.contentOffset.x;
      const newIndex = Math.round(offsetX / optionWidth);
      if (newIndex >= 0 && newIndex < meal.options.length && newIndex !== activeIndex) {
        setActiveIndex(newIndex);
      }
    },
    [optionWidth, meal.options.length, activeIndex]
  );

  // Handle scroll end - persistir cambio al padre
  const handleScrollEnd = useCallback(
    (event: { nativeEvent: { contentOffset: { x: number } } }) => {
      const offsetX = event.nativeEvent.contentOffset.x;
      const newIndex = Math.round(offsetX / optionWidth);
      if (newIndex >= 0 && newIndex < meal.options.length) {
        setActiveIndex(newIndex);
        if (newIndex !== meal.selectedOption) {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onSwap(meal.id, newIndex);
        }
      }
    },
    [meal.id, meal.selectedOption, meal.options.length, onSwap, optionWidth]
  );

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scaleAnim.value }],
  }));

  // ============================================================================
  // DERIVED VALUES
  // ============================================================================
  const hasMultipleOptions = meal.options.length > 1;
  const canAddMore = meal.options.length < 5; // Máximo 5 opciones
  const displayTime = formatTimeToAMPM(meal.time);

  // ============================================================================
  // MODO COMPRIMIDO - Para drag & drop (después de los hooks)
  // ============================================================================
  if (isCompressed) {
    const currentOption = meal.options[meal.selectedOption] || meal.options[0];
    const ingredientNames = currentOption?.ingredients?.map((i) => i.name).join(', ') || '';
    return (
      <View className="mb-3 ml-6 relative">
        {/* Timeline dot */}
        <View
          className="absolute -left-[14px] top-4 w-3.5 h-3.5 rounded-full border-2 border-zinc-900"
          style={{
            backgroundColor: '#22C55E',
            shadowColor: '#22C55E',
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: 0.8,
            shadowRadius: 6,
          }}
        />
        <View
          className="rounded-xl px-4 py-3 flex-row items-center justify-between"
          style={{
            backgroundColor: 'rgba(39, 39, 42, 0.6)',
            borderWidth: 1,
            borderColor: 'rgba(34, 197, 94, 0.35)',
          }}
        >
          <View className="flex-1 mr-3">
            <Text className="text-white text-sm font-bold uppercase tracking-wide">{mealName}</Text>
            <Text className="text-zinc-400 text-xs mt-0.5" numberOfLines={1}>
              {ingredientNames || 'Sin ingredientes'}
            </Text>
          </View>
          <View
            className="px-3 py-1.5 rounded-lg"
            style={{ backgroundColor: 'rgba(34, 197, 94, 0.2)' }}
          >
            <Text className="text-green-500 text-xs font-bold font-mono">{displayTime}</Text>
          </View>
        </View>
      </View>
    );
  }

  // ============================================================================
  // HANDLERS
  // ============================================================================
  // Long press handler - Delete option or entire meal
  const handleLongPress = (optionId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    // Si hay múltiples opciones, eliminar solo la opción
    if (hasMultipleOptions && onDeleteOption) {
      onDeleteOption(meal.id, optionId);
    } else if (onDelete) {
      // Si solo hay una opción, eliminar toda la comida
      onDelete(meal.id);
    }
  };

  // Handle add option
  const handleAddOption = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (onAddOption) {
      onAddOption(meal.id);
    }
  };

  // ============================================================================
  // RENDER OPTION CARD - ULTRA PREMIUM SAVAGE EDITION
  // ============================================================================
  const renderOptionCard = (option: MealOption, index: number) => (
    <Pressable
      key={option.id}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        if (onEdit) onEdit(meal.id, index);
      }}
      onLongPress={() => handleLongPress(option.id)}
      delayLongPress={500}
      style={{ width: optionWidth }}
      className="px-2"
    >
      <View
        className="rounded-2xl overflow-hidden"
        style={{
          backgroundColor: 'rgba(24, 24, 27, 0.95)',
          borderWidth: 1,
          borderColor: 'rgba(34, 197, 94, 0.2)',
        }}
      >
        {/* Option Header - only if multiple options */}
        {hasMultipleOptions && (
          <View
            className="px-4 py-2.5 flex-row items-center justify-between"
            style={{
              backgroundColor: 'rgba(34, 197, 94, 0.08)',
              borderBottomWidth: 1,
              borderBottomColor: 'rgba(34, 197, 94, 0.15)',
            }}
          >
            <View className="flex-row items-center gap-2">
              <View
                className="w-5 h-5 rounded-md items-center justify-center"
                style={{ backgroundColor: 'rgba(34, 197, 94, 0.2)' }}
              >
                <Text className="text-green-500 text-[10px] font-black">{index + 1}</Text>
              </View>
              <Text className="text-zinc-300 text-[10px] font-bold tracking-[2px] uppercase">
                OPCIÓN
              </Text>
            </View>
            <View className="flex-row items-center gap-1">
              <View className="w-1.5 h-1.5 rounded-full bg-green-500/50" />
              <Text className="text-zinc-400 text-[9px] font-mono">
                {option.ingredients.length} items
              </Text>
            </View>
          </View>
        )}

        {/* Ingredients List - Ultra Premium */}
        <View className="p-3">
          {option.ingredients.map((ingredient, idx) => (
            <View
              key={ingredient.id || idx}
              className="flex-row items-center gap-3 py-2.5 px-3 rounded-xl mb-1.5"
              style={{
                backgroundColor: idx % 2 === 0 ? 'rgba(63, 63, 70, 0.4)' : 'rgba(39, 39, 42, 0.3)',
              }}
            >
              {/* Ingredient Number Badge */}
              <View
                className="w-6 h-6 rounded-lg items-center justify-center"
                style={{
                  backgroundColor: 'rgba(34, 197, 94, 0.15)',
                  borderWidth: 1,
                  borderColor: 'rgba(34, 197, 94, 0.25)',
                }}
              >
                <Text className="text-green-500 text-[10px] font-bold">{idx + 1}</Text>
              </View>

              {/* Ingredient Name (includes portion in new format) */}
              <View className="flex-1">
                <Text className="text-white font-semibold text-[13px] tracking-tight">
                  {ingredient.name}
                </Text>
              </View>

              {/* Weight Badge - show quantity if it has actual weight value */}
              {ingredient.quantity && ingredient.quantity.trim() && (
                <View
                  className="px-3 py-1.5 rounded-lg"
                  style={{
                    backgroundColor: 'rgba(34, 197, 94, 0.12)',
                    borderWidth: 1,
                    borderColor: 'rgba(34, 197, 94, 0.2)',
                  }}
                >
                  <Text className="text-white font-bold font-mono text-xs tracking-tight">
                    {ingredient.quantity}
                  </Text>
                </View>
              )}

              {/* Weight Type Badge (Cocido/Crudo) */}
              {ingredient.weightType && (
                <View
                  className="px-2 py-1 rounded-md"
                  style={{
                    backgroundColor:
                      ingredient.weightType === 'cocido'
                        ? 'rgba(34,197,94,0.15)'
                        : 'rgba(239,68,68,0.15)',
                    borderWidth: 1,
                    borderColor:
                      ingredient.weightType === 'cocido'
                        ? 'rgba(34,197,94,0.3)'
                        : 'rgba(239,68,68,0.3)',
                  }}
                >
                  <Text
                    className={`font-bold text-[10px] uppercase tracking-wider ${
                      ingredient.weightType === 'cocido' ? 'text-green-400' : 'text-red-400'
                    }`}
                  >
                    {ingredient.weightType === 'cocido' ? 'C' : 'R'}
                  </Text>
                </View>
              )}
            </View>
          ))}

          {/* Empty State - Premium */}
          {(!option.ingredients || option.ingredients.length === 0) && (
            <View className="items-center py-8">
              <View
                className="w-14 h-14 rounded-2xl items-center justify-center mb-3"
                style={{
                  backgroundColor: 'rgba(34, 197, 94, 0.15)',
                  borderWidth: 1,
                  borderColor: 'rgba(34, 197, 94, 0.25)',
                }}
              >
                <Plus size={24} color="#22C55E" />
              </View>
              <Text className="text-zinc-300 text-xs font-bold tracking-wide">
                SIN INGREDIENTES
              </Text>
              <Text className="text-zinc-500 text-[10px] mt-1">Toca para configurar</Text>
            </View>
          )}

          {/* Notes - if present */}
          {option.notes && (
            <View
              className="mt-2 px-3 py-2 rounded-lg"
              style={{
                backgroundColor: 'rgba(234, 179, 8, 0.08)',
                borderWidth: 1,
                borderColor: 'rgba(234, 179, 8, 0.2)',
              }}
            >
              <Text className="text-yellow-300 text-[11px] leading-4">📝 {option.notes}</Text>
            </View>
          )}
        </View>

        {/* Footer hint - only if has ingredients */}
        {option.ingredients && option.ingredients.length > 0 && (
          <View className="px-4 py-2" style={{ backgroundColor: 'rgba(39, 39, 42, 0.5)' }}>
            <Text className="text-zinc-400 text-[9px] text-center tracking-wider uppercase">
              Toca para editar ingredientes
            </Text>
          </View>
        )}
      </View>
    </Pressable>
  );

  // ============================================================================
  // RENDER ADD OPTION CARD - PREMIUM
  // ============================================================================
  const renderAddOptionCard = () => (
    <Pressable
      onPress={handleAddOption}
      style={{ width: optionWidth * 0.45 }}
      className="px-2 justify-center"
    >
      <View
        className="rounded-xl p-4 min-h-[130px] justify-center items-center"
        style={{
          backgroundColor: 'rgba(39, 39, 42, 0.4)',
          borderWidth: 1.5,
          borderStyle: 'dashed',
          borderColor: 'rgba(34, 197, 94, 0.35)',
        }}
      >
        <View
          className="w-12 h-12 rounded-full items-center justify-center mb-2"
          style={{ backgroundColor: 'rgba(34, 197, 94, 0.15)' }}
        >
          <Plus size={22} color="#22C55E" />
        </View>
        <Text className="text-green-500 text-[10px] font-bold text-center tracking-wider">
          AÑADIR PLATILLO
        </Text>
      </View>
    </Pressable>
  );

  // ============================================================================
  // RENDER - PREMIUM SAVAGE EDITION
  // ============================================================================
  return (
    <Animated.View ref={targetRef} onLayout={onLayout} style={animatedStyle} className="mb-6 ml-6">
      {/* Hank Inline Highlight */}
      <HankInlineHighlight isActive={isHighlighted} phase={animationPhase} borderRadius={16} />

      {/* Timeline Connector Dot */}
      <View
        className="absolute -left-[14px] top-6 w-3.5 h-3.5 rounded-full border-2 border-zinc-900 z-10"
        style={{
          backgroundColor: '#22C55E',
          shadowColor: '#22C55E',
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: 0.9,
          shadowRadius: 8,
        }}
      />

      <View
        className="rounded-2xl overflow-hidden"
        style={{
          backgroundColor: 'rgba(24, 24, 27, 0.95)',
          borderWidth: 1,
          borderColor: 'rgba(34, 197, 94, 0.25)',
          shadowColor: '#22C55E',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.15,
          shadowRadius: 20,
          elevation: 10,
        }}
      >
        {/* Header - PREMIUM SAVAGE */}
        <View
          className="p-4"
          style={{
            backgroundColor: 'rgba(39, 39, 42, 0.6)',
            borderBottomWidth: 1,
            borderBottomColor: 'rgba(34, 197, 94, 0.2)',
          }}
        >
          <View className="flex-row justify-between items-start">
            <View className="flex-1">
              <Text
                className="font-black tracking-wider text-lg uppercase text-white"
                style={{
                  textShadowColor: 'rgba(34, 197, 94, 0.3)',
                  textShadowOffset: { width: 0, height: 0 },
                  textShadowRadius: 8,
                }}
              >
                {mealName}
              </Text>
              {/* Macros Display - Reales si disponibles, fallback a target */}
              {(meal.actualMacros || meal.targetMacros) && (
                <View className="flex-row gap-3 mt-2">
                  <View className="flex-row items-center gap-1">
                    <View className="w-1.5 h-1.5 rounded-full bg-purple-500" />
                    <Text className="text-purple-400 text-[11px] font-mono font-bold">
                      {(meal.actualMacros || meal.targetMacros)!.protein}P
                    </Text>
                  </View>
                  <View className="flex-row items-center gap-1">
                    <View className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                    <Text className="text-amber-400 text-[11px] font-mono font-bold">
                      {(meal.actualMacros || meal.targetMacros)!.carbs}C
                    </Text>
                  </View>
                  <View className="flex-row items-center gap-1">
                    <View className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                    <Text className="text-blue-400 text-[11px] font-mono font-bold">
                      {(meal.actualMacros || meal.targetMacros)!.fat}G
                    </Text>
                  </View>
                  <Text className="text-zinc-600 text-[11px] font-mono">
                    {(meal.actualMacros || meal.targetMacros)!.calories} kcal
                  </Text>
                </View>
              )}
            </View>

            {/* Time Button Premium */}
            <Pressable
              onPress={() => onTimeChange(meal.id)}
              className="flex-row items-center gap-2 px-3 py-2 rounded-xl active:scale-95"
              style={{
                backgroundColor: 'rgba(34, 197, 94, 0.15)',
                borderWidth: 1,
                borderColor: 'rgba(34, 197, 94, 0.35)',
              }}
            >
              <Clock size={12} color="#22C55E" />
              <Text className="text-green-500 text-xs font-mono font-bold">{displayTime}</Text>
            </Pressable>
          </View>
        </View>

        {/* Slider de opciones */}
        <ScrollView
          ref={scrollViewRef}
          horizontal
          pagingEnabled={false}
          showsHorizontalScrollIndicator={false}
          snapToInterval={optionWidth}
          decelerationRate="fast"
          contentContainerStyle={{ paddingVertical: 12 }}
          onScroll={handleScroll}
          onMomentumScrollEnd={handleScrollEnd}
          onScrollEndDrag={handleScrollEnd}
          scrollEventThrottle={16}
        >
          {meal.options.map((option, index) => renderOptionCard(option, index))}
          {canAddMore && onAddOption && renderAddOptionCard()}
        </ScrollView>

        {/* Footer / Pagination - PREMIUM SAVAGE */}
        <View
          className="py-3 px-4 flex-row items-center justify-between"
          style={{ backgroundColor: 'rgba(39, 39, 42, 0.5)' }}
        >
          {/* Navigation arrows */}
          <Pressable
            onPress={() => navigateToOption(Math.max(0, activeIndex - 1))}
            disabled={activeIndex === 0}
            className={`p-2 rounded-lg ${activeIndex === 0 ? 'opacity-20' : 'opacity-100'}`}
            style={{
              backgroundColor: activeIndex === 0 ? 'transparent' : 'rgba(34, 197, 94, 0.1)',
            }}
          >
            <ChevronLeft size={18} color="#22C55E" />
          </Pressable>

          {/* Dots - Savage Red Style */}
          <View className="flex-row gap-2 flex-1 justify-center">
            {meal.options.map((_, idx) => (
              <Pressable key={idx} onPress={() => navigateToOption(idx)} className="p-1">
                <View
                  className="rounded-full transition-all"
                  style={{
                    backgroundColor: idx === activeIndex ? '#22C55E' : 'rgba(255, 255, 255, 0.1)',
                    width: idx === activeIndex ? 20 : 6,
                    height: 6,
                    shadowColor: idx === activeIndex ? '#22C55E' : 'transparent',
                    shadowOffset: { width: 0, height: 0 },
                    shadowOpacity: 0.8,
                    shadowRadius: 4,
                  }}
                />
              </Pressable>
            ))}
            {canAddMore && onAddOption && (
              <Pressable onPress={handleAddOption} className="p-1">
                <View
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ backgroundColor: 'rgba(34, 197, 94, 0.3)' }}
                />
              </Pressable>
            )}
          </View>

          {/* Navigation arrows */}
          <Pressable
            onPress={() => navigateToOption(Math.min(meal.options.length - 1, activeIndex + 1))}
            disabled={activeIndex === meal.options.length - 1}
            className={`p-2 rounded-lg ${activeIndex === meal.options.length - 1 ? 'opacity-20' : 'opacity-100'}`}
            style={{
              backgroundColor:
                activeIndex === meal.options.length - 1 ? 'transparent' : 'rgba(34, 197, 94, 0.1)',
            }}
          >
            <ChevronRight size={18} color="#22C55E" />
          </Pressable>
        </View>

        {/* Hint - Minimal */}
        <View className="py-2" style={{ backgroundColor: 'rgba(24, 24, 27, 0.8)' }}>
          <Text className="text-zinc-500 text-[9px] text-center tracking-wider uppercase">
            Desliza • Toca para editar • Mantén para eliminar
          </Text>
        </View>
      </View>
    </Animated.View>
  );
};

export default MealCard;
