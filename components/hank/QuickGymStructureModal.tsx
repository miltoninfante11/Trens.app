// ============================================================================
// QUICK GYM STRUCTURE MODAL - Vista de estructura de entrenamiento
// Muestra la rutina/split con los días y ejercicios
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
import { Dumbbell, ChevronRight, Zap } from 'lucide-react-native';
import { router } from 'expo-router';
import { Haptics } from '../../lib/haptics';
import { supabase } from '../../lib/supabase';

interface DayInfo {
  index: number;
  name: string;
  muscleGroups: string;
  exercises: { name: string; sets: string }[];
}

interface QuickGymStructureModalProps {
  visible: boolean;
  onClose: () => void;
}

const DAYS_OF_WEEK = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

export const QuickGymStructureModal: React.FC<QuickGymStructureModalProps> = ({
  visible,
  onClose,
}) => {
  const [days, setDays] = useState<DayInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentDayIndex, setCurrentDayIndex] = useState(0);
  const [selectedDay, setSelectedDay] = useState(0);
  const [isExternalMode, setIsExternalMode] = useState(false);

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

  const fetchStructure = useCallback(async () => {
    setLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      // Fetch training mode
      const { data: userProfile } = await supabase
        .from('user_profiles')
        .select('training_mode, external_schedule, training_days_per_week')
        .eq('user_id', user.id)
        .single();

      // Fetch profile training data
      const { data: profile } = await supabase
        .from('profiles')
        .select('training_routine_names')
        .eq('id', user.id)
        .single();

      const isExternal = userProfile?.training_mode === 'external';
      setIsExternalMode(isExternal);
      setCurrentDayIndex(new Date().getDay()); // weekday: 0=Dom..6=Sáb

      let dayInfos: DayInfo[] = [];

      if (isExternal && userProfile?.external_schedule) {
        // External mode: days from schedule
        const schedule = userProfile.external_schedule as Record<string, string>;
        dayInfos = Object.entries(schedule).map(([dayName, muscles], idx) => ({
          index: idx,
          name: dayName,
          muscleGroups: muscles || 'Sin asignar',
          exercises: [],
        }));
      } else {
        // Weekday mode: 7 días de la semana desde routine_names
        const routineNames = (profile?.training_routine_names || {}) as Record<string, string>;

        for (let wd = 0; wd < 7; wd++) {
          const muscles = (routineNames[String(wd)] || '').trim();
          if (muscles.length === 0) continue; // saltar días de descanso
          dayInfos.push({
            index: wd,
            name: ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'][wd],
            muscleGroups: muscles,
            exercises: [],
          });
        }
      }

      // Fetch exercises for all days
      const { data: exerciseConfigs } = await supabase
        .from('user_exercise_config')
        .select(
          `
          id,
          training_days,
          display_order,
          config,
          exercises!inner(name)
        `
        )
        .eq('user_id', user.id)
        .order('display_order', { ascending: true });

      if (exerciseConfigs) {
        for (const config of exerciseConfigs) {
          const trainingDays = (config.training_days as number[]) || [];
          const exercise = config.exercises as any;
          const exerciseConfig = config.config as any;
          const sets = exerciseConfig?.sets || '4x10';

          for (const dayIdx of trainingDays) {
            const day = dayInfos.find((d) => d.index === dayIdx);
            if (day) {
              day.exercises.push({ name: exercise?.name || 'Sin nombre', sets });
            }
          }
        }
      }

      setDays(dayInfos);
      if (dayInfos.length > 0) {
        setSelectedDay(0);
      }
    } catch (err) {
      console.error('QuickGymStructure fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (visible) {
      translateY.value = 0;
      fetchStructure();
    }
  }, [visible, fetchStructure]);

  const handleGoToGym = () => {
    onClose();
    setTimeout(() => router.push('/(tabs)/gym'), 200);
  };

  const currentDay = days[selectedDay];
  const totalExercises = days.reduce((sum, d) => sum + d.exercises.length, 0);

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
              maxHeight: '80%',
              borderTopWidth: 2,
              borderTopColor: 'rgba(220, 38, 38, 0.5)',
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
              backgroundColor: '#DC2626',
              shadowColor: '#DC2626',
              shadowOffset: { width: 0, height: 0 },
              shadowOpacity: 0.8,
              shadowRadius: 10,
              zIndex: 10,
            }}
          />

          {/* Header Draggable */}
          <View {...panResponder.panHandlers} className="border-b border-zinc-800/50">
            <View className="pt-4 pb-2 items-center">
              <View className="w-12 h-1.5 bg-zinc-600 rounded-full" />
            </View>

            <View className="flex-row items-center justify-between px-4 pb-4">
              <View className="flex-row items-center gap-2">
                <Dumbbell size={18} color="#DC2626" />
                <Text className="text-white font-bold text-lg">Estructura</Text>
                <Text className="text-zinc-500 text-[10px] font-mono ml-1">
                  {days.length > 0 ? `${days.length}D · ${totalExercises}E` : ''}
                </Text>
              </View>
            </View>
          </View>

          {loading ? (
            <View className="py-12 items-center">
              <ActivityIndicator size="small" color="#DC2626" />
            </View>
          ) : days.length === 0 ? (
            <View className="py-12 items-center">
              <Text className="text-zinc-500 text-sm font-mono">Sin rutina configurada</Text>
            </View>
          ) : (
            <View style={{ flex: 1 }}>
              {/* Day selector pills */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                className="px-3 pt-3 pb-2"
                contentContainerStyle={{ gap: 6 }}
              >
                {days.map((day, idx) => {
                  const isSelected = selectedDay === idx;
                  const isCurrent = idx === currentDayIndex;
                  return (
                    <Pressable
                      key={idx}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setSelectedDay(idx);
                      }}
                      style={{
                        paddingHorizontal: 14,
                        paddingVertical: 8,
                        borderRadius: 10,
                        backgroundColor: isSelected
                          ? 'rgba(220, 38, 38, 0.2)'
                          : 'rgba(39, 39, 42, 0.5)',
                        borderWidth: 1,
                        borderColor: isSelected ? '#DC2626' : '#27272a',
                      }}
                    >
                      <Text
                        className="font-bold text-[11px] tracking-wide"
                        style={{ color: isSelected ? '#DC2626' : '#71717a' }}
                        numberOfLines={1}
                      >
                        {day.muscleGroups.toUpperCase()}
                      </Text>
                      {isCurrent && (
                        <View className="flex-row items-center gap-0.5 mt-0.5">
                          <Zap size={8} color="#f59e0b" />
                          <Text className="text-[8px] font-mono text-yellow-500">HOY</Text>
                        </View>
                      )}
                    </Pressable>
                  );
                })}
              </ScrollView>

              {/* Exercise list for selected day */}
              <ScrollView
                className="px-4 pt-1"
                style={{ maxHeight: 350 }}
                showsVerticalScrollIndicator={false}
              >
                {currentDay && currentDay.exercises.length > 0 ? (
                  currentDay.exercises.map((exercise, idx) => (
                    <View
                      key={idx}
                      className="flex-row items-center justify-between py-3"
                      style={{
                        borderBottomWidth: idx < currentDay.exercises.length - 1 ? 1 : 0,
                        borderBottomColor: '#27272a30',
                      }}
                    >
                      <View className="flex-row items-center gap-3 flex-1">
                        <View
                          className="w-7 h-7 rounded-full items-center justify-center"
                          style={{ backgroundColor: 'rgba(220, 38, 38, 0.1)' }}
                        >
                          <Text className="text-[10px] font-mono font-bold text-zinc-500">
                            {idx + 1}
                          </Text>
                        </View>
                        <Text className="text-white font-bold text-sm flex-1" numberOfLines={1}>
                          {exercise.name}
                        </Text>
                      </View>
                      <Text className="text-zinc-500 font-mono text-[11px]">{exercise.sets}</Text>
                    </View>
                  ))
                ) : (
                  <View className="py-8 items-center">
                    <Text className="text-zinc-600 text-xs font-mono">
                      Sin ejercicios en este día
                    </Text>
                  </View>
                )}
              </ScrollView>
            </View>
          )}

          {/* Go to GYM button */}
          <View className="px-4 pt-3 pb-6">
            <Pressable
              onPress={handleGoToGym}
              className="flex-row items-center justify-center gap-2 py-3 rounded-xl active:scale-[0.98]"
              style={{
                backgroundColor: 'rgba(220, 38, 38, 0.15)',
                borderWidth: 1,
                borderColor: 'rgba(220, 38, 38, 0.4)',
              }}
            >
              <Dumbbell size={16} color="#DC2626" />
              <Text className="text-red-500 font-bold text-sm">EDITAR EN GYM</Text>
            </Pressable>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
};

export default QuickGymStructureModal;
