// ============================================================================
// ADD CARDIO MODAL - Modal para agregar bloques de cardio
// Selector de tipo, actividad, duración, intensidad con FC, velocidad, inclinación
// Estilo Savage Mode con PanResponder drag-to-close
// ============================================================================

import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  PanResponder,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from '../../lib/haptics';
import {
  Zap,
  Flame,
  ChevronUp,
  ChevronDown,
  Gauge,
  TrendingUp,
  Activity,
} from 'lucide-react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
  runOnJS,
} from 'react-native-reanimated';

const SCREEN_HEIGHT = Dimensions.get('window').height;

// ============================================================================
// TYPES
// ============================================================================
export type CardioType =
  | 'CUSTOM'
  | 'LISS'
  | 'HIIT'
  | 'STEADY_STATE'
  | 'SPRINT'
  | 'TABATA'
  | 'FARTLEK';
export type CardioIntensity = 'BAJA' | 'MODERADA' | 'ALTA' | 'MÁXIMA';

export interface AddCardioData {
  cardio_type: CardioType;
  activity: string;
  duration_minutes: number;
  intensity: CardioIntensity;
  target_heart_rate: number | null;
  speed: number | null;
  incline: number | null;
  scheduled_time: string;
  notes: string;
  days_of_week: number[];
  is_pre_workout: boolean;
  is_post_workout: boolean;
  workout_session_index: number;
}

interface AddCardioModalProps {
  visible: boolean;
  onClose: () => void;
  onSave: (data: AddCardioData) => void;
  hasDualSession?: boolean;
  editData?: AddCardioData | null;
}

// ============================================================================
// CONSTANTS
// ============================================================================

// Preset data for each cardio type — auto-fills all fields
interface CardioPreset {
  value: CardioType;
  label: string;
  desc: string;
  icon: typeof Flame;
  // Auto-fill values (null = don't change / let user set)
  activity: string;
  duration: number;
  intensity: CardioIntensity;
  hr: number;
  speed: number | null;
  incline: number | null;
  notes: string;
}

const CARDIO_PRESETS: CardioPreset[] = [
  {
    value: 'CUSTOM',
    label: 'CUSTOM',
    desc: 'Configura todo manual',
    icon: Flame,
    activity: 'Caminadora',
    duration: 30,
    intensity: 'MODERADA',
    hr: 135,
    speed: null,
    incline: null,
    notes: '',
  },
  {
    value: 'LISS',
    label: 'LISS',
    desc: 'Low Intensity Steady State',
    icon: Flame,
    activity: 'Caminadora',
    duration: 45,
    intensity: 'BAJA',
    hr: 115,
    speed: 5.5,
    incline: 3,
    notes:
      'Mantener ritmo constante sin perder el aliento. Zona quema grasa: poder hablar sin dificultad. Ideal post-entreno o en ayunas.',
  },
  {
    value: 'HIIT',
    label: 'HIIT',
    desc: 'High Intensity Interval Training',
    icon: Zap,
    activity: 'Caminadora',
    duration: 20,
    intensity: 'ALTA',
    hr: 160,
    speed: 12,
    incline: 1,
    notes:
      'Intervalos: 30s sprint máximo → 60s caminata activa. Repetir 8-12 rounds. Calentar 3 min antes y enfriar 3 min al final.',
  },
  {
    value: 'STEADY_STATE',
    label: 'STEADY',
    desc: 'Ritmo constante moderado',
    icon: Flame,
    activity: 'Elíptica',
    duration: 35,
    intensity: 'MODERADA',
    hr: 140,
    speed: 7,
    incline: null,
    notes:
      'Mantener ritmo uniforme donde puedas hablar con frases cortas. Resistencia moderada constante. No variar velocidad.',
  },
  {
    value: 'SPRINT',
    label: 'SPRINT',
    desc: 'Explosiones máximas cortas',
    icon: Zap,
    activity: 'Correr',
    duration: 15,
    intensity: 'MÁXIMA',
    hr: 180,
    speed: 16,
    incline: 0,
    notes:
      'Sprints all-out de 15-20s → descanso completo 60-90s caminando. 6-10 repeticiones. Calentar mínimo 5 min con trote progresivo.',
  },
  {
    value: 'TABATA',
    label: 'TABATA',
    desc: '20s ON / 10s OFF × 8',
    icon: Flame,
    activity: 'Bicicleta',
    duration: 16,
    intensity: 'MÁXIMA',
    hr: 175,
    speed: null,
    incline: null,
    notes:
      'Protocolo Tabata: 20s esfuerzo máximo → 10s descanso × 8 rounds = 4 min por bloque. Hacer 2-4 bloques con 2 min descanso entre bloques.',
  },
  {
    value: 'FARTLEK',
    label: 'FARTLEK',
    desc: 'Velocidad variable libre',
    icon: Flame,
    activity: 'Correr',
    duration: 30,
    intensity: 'ALTA',
    hr: 155,
    speed: 10,
    incline: null,
    notes:
      'Juego de velocidad: alternar trote suave (2-3 min) con ritmo fuerte (1-2 min) según cómo te sientas. No hay estructura fija, escucha tu cuerpo.',
  },
];

const ACTIVITIES = [
  'Caminadora',
  'Elíptica',
  'Bicicleta',
  'Escaladora',
  'Remo',
  'Correr',
  'Caminar',
  'Nadar',
  'Saltar cuerda',
  'Sombra',
];

// Actividades que soportan inclinación
const INCLINE_ACTIVITIES = ['Caminadora', 'Correr', 'Caminar'];

const INTENSITIES: {
  value: CardioIntensity;
  label: string;
  color: string;
  hrRange: string;
  hrSuggested: number;
}[] = [
  { value: 'BAJA', label: 'BAJA', color: '#22C55E', hrRange: '100-120', hrSuggested: 110 },
  { value: 'MODERADA', label: 'MODERADA', color: '#F97316', hrRange: '120-145', hrSuggested: 135 },
  { value: 'ALTA', label: 'ALTA', color: '#DC2626', hrRange: '145-170', hrSuggested: 155 },
  { value: 'MÁXIMA', label: 'MÁXIMA', color: '#7C3AED', hrRange: '170-195', hrSuggested: 180 },
];

// ============================================================================
// COMPONENT
// ============================================================================
// Day mapping: visual order (Mon-first) to JS getDay() index
const DAYS_ORDER = [1, 2, 3, 4, 5, 6, 0];
const DAYS_LABELS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

export const AddCardioModal: React.FC<AddCardioModalProps> = ({
  visible,
  onClose,
  onSave,
  hasDualSession = false,
  editData = null,
}) => {
  const insets = useSafeAreaInsets();
  const isEditMode = !!editData;

  // Form state
  const [cardioType, setCardioType] = useState<CardioType>('CUSTOM');
  const [activity, setActivity] = useState('Caminadora');
  const [duration, setDuration] = useState(30);
  const [intensity, setIntensity] = useState<CardioIntensity>('MODERADA');
  const [targetHR, setTargetHR] = useState('');
  const [speed, setSpeed] = useState('');
  const [incline, setIncline] = useState('');
  const [notes, setNotes] = useState('');

  // Scheduling state
  const [selectedDays, setSelectedDays] = useState<number[]>([0, 1, 2, 3, 4, 5, 6]);
  const [isPreWorkout, setIsPreWorkout] = useState(false);
  const [isPostWorkout, setIsPostWorkout] = useState(false);
  const [workoutSessionIndex, setWorkoutSessionIndex] = useState(0);

  // Time picker
  const [selectedHour, setSelectedHour] = useState(6);
  const [selectedMinute, setSelectedMinute] = useState(0);
  const [selectedPeriod, setSelectedPeriod] = useState<'AM' | 'PM'>('AM');

  // ============================================================================
  // DRAG-TO-CLOSE ANIMATION
  // ============================================================================
  const translateY = useSharedValue(SCREEN_HEIGHT);
  const backdropOpacity = useSharedValue(0);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const backdropAnimatedStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));

  const executeClose = () => {
    resetForm();
    onClose();
  };

  const closeWithAnimation = () => {
    backdropOpacity.value = withTiming(0, { duration: 200 });
    translateY.value = withTiming(
      SCREEN_HEIGHT,
      { duration: 250, easing: Easing.in(Easing.ease) },
      () => runOnJS(executeClose)()
    );
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 5,
      onPanResponderMove: (_, g) => {
        if (g.dy > 0) translateY.value = g.dy;
      },
      onPanResponderRelease: (_, g) => {
        if (g.dy > 150) {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          closeWithAnimation();
        } else {
          translateY.value = withTiming(0, { duration: 150 });
        }
      },
    })
  ).current;

  // Entry animation
  useEffect(() => {
    if (visible) {
      translateY.value = SCREEN_HEIGHT;
      backdropOpacity.value = 0;
      // Small delay to ensure layout is ready before animating
      requestAnimationFrame(() => {
        backdropOpacity.value = withTiming(1, { duration: 300 });
        translateY.value = withTiming(0, { duration: 300, easing: Easing.out(Easing.ease) });
      });
    }
  }, [visible]);

  // Populate form when editData changes
  React.useEffect(() => {
    if (editData && visible) {
      setCardioType(editData.cardio_type);
      setActivity(editData.activity);
      setDuration(editData.duration_minutes);
      setIntensity(editData.intensity);
      setTargetHR(editData.target_heart_rate ? editData.target_heart_rate.toString() : '');
      setSpeed(editData.speed ? editData.speed.toString() : '');
      setIncline(editData.incline ? editData.incline.toString() : '');
      setNotes(editData.notes || '');
      setSelectedDays(editData.days_of_week || [0, 1, 2, 3, 4, 5, 6]);
      setIsPreWorkout(editData.is_pre_workout);
      setIsPostWorkout(editData.is_post_workout);
      setWorkoutSessionIndex(editData.workout_session_index);
      // Parse scheduled_time to 12h format for time picker
      if (editData.scheduled_time && !editData.is_pre_workout && !editData.is_post_workout) {
        const [h, m] = editData.scheduled_time.split(':').map(Number);
        setSelectedHour(h === 0 ? 12 : h > 12 ? h - 12 : h);
        setSelectedMinute(m || 0);
        setSelectedPeriod(h >= 12 ? 'PM' : 'AM');
      }
    }
  }, [editData, visible]);

  const showIncline = INCLINE_ACTIVITIES.includes(activity);

  const resetForm = () => {
    setCardioType('CUSTOM');
    setActivity('Caminadora');
    setDuration(30);
    setIntensity('MODERADA');
    setTargetHR('');
    setSpeed('');
    setIncline('');
    setNotes('');
    setSelectedDays([0, 1, 2, 3, 4, 5, 6]);
    setIsPreWorkout(false);
    setIsPostWorkout(false);
    setWorkoutSessionIndex(0);
    setSelectedHour(6);
    setSelectedMinute(0);
    setSelectedPeriod('AM');
  };

  // Apply a preset — fills ALL form fields with real-world values
  const applyPreset = (preset: CardioPreset) => {
    setCardioType(preset.value);
    setActivity(preset.activity);
    setDuration(preset.duration);
    setIntensity(preset.intensity);
    setTargetHR(preset.hr.toString());
    setSpeed(preset.speed !== null ? preset.speed.toString() : '');
    setIncline(preset.incline !== null ? preset.incline.toString() : '');
    setNotes(preset.notes);
  };

  const handleSave = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    // Convert to 24h format
    let hour24 = selectedHour;
    if (selectedPeriod === 'PM' && hour24 !== 12) hour24 += 12;
    if (selectedPeriod === 'AM' && hour24 === 12) hour24 = 0;
    const timeStr = `${hour24.toString().padStart(2, '0')}:${selectedMinute.toString().padStart(2, '0')}`;

    const hrVal = targetHR ? parseInt(targetHR, 10) : null;
    const speedVal = speed ? parseFloat(speed) : null;
    const inclineVal = incline ? parseFloat(incline) : null;

    onSave({
      cardio_type: cardioType,
      activity,
      duration_minutes: duration,
      intensity,
      target_heart_rate: hrVal && !isNaN(hrVal) ? hrVal : null,
      speed: speedVal && !isNaN(speedVal) ? speedVal : null,
      incline: showIncline && inclineVal && !isNaN(inclineVal) ? inclineVal : null,
      scheduled_time: isPreWorkout || isPostWorkout ? '00:00' : timeStr,
      notes: notes.trim(),
      days_of_week: selectedDays,
      is_pre_workout: isPreWorkout,
      is_post_workout: isPostWorkout,
      workout_session_index: workoutSessionIndex,
    });

    resetForm();
    onClose();
  };

  // Get current intensity config
  const currentIntensity = INTENSITIES.find((i) => i.value === intensity) || INTENSITIES[1];

  // ============================================================================
  // RENDER
  // ============================================================================
  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={closeWithAnimation}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1"
      >
        <Animated.View
          className="flex-1 justify-end"
          style={[{ backgroundColor: 'rgba(0,0,0,0.8)' }, backdropAnimatedStyle]}
        >
          <Pressable className="flex-1" onPress={closeWithAnimation} />

          <Animated.View
            style={[
              {
                height: '92%',
                backgroundColor: '#000',
                borderTopLeftRadius: 24,
                borderTopRightRadius: 24,
                borderTopWidth: 2,
                borderTopColor: 'rgba(220, 38, 38, 0.5)',
                overflow: 'hidden',
              },
              animatedStyle,
            ]}
          >
            {/* Red accent line */}
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

            <View className="flex-1">
              {/* DRAGGABLE HEADER */}
              <View {...panResponder.panHandlers}>
                {/* Drag handle bar */}
                <View className="items-center pt-4 pb-3">
                  <View className="w-12 h-1.5 bg-zinc-600 rounded-full" />
                </View>

                {/* Header */}
                <View className="px-5 pb-4 flex-row items-center justify-between">
                  <View className="flex-row items-center gap-3">
                    <View
                      className="w-10 h-10 rounded-xl items-center justify-center"
                      style={{
                        backgroundColor: '#DC2626',
                        shadowColor: '#DC2626',
                        shadowOffset: { width: 0, height: 0 },
                        shadowOpacity: 0.6,
                        shadowRadius: 12,
                      }}
                    >
                      <Flame size={20} color="#fff" />
                    </View>
                    <View>
                      <Text className="text-white text-xl font-bold tracking-tight">
                        {isEditMode ? 'EDITAR CARDIO' : 'AGREGAR CARDIO'}
                      </Text>
                      <Text className="text-zinc-500 text-[10px] uppercase tracking-widest font-mono">
                        {isEditMode ? 'Modificar bloque' : 'Nuevo bloque de cardio'}
                      </Text>
                    </View>
                  </View>
                </View>
              </View>

              {/* SCROLLABLE CONTENT */}
              <ScrollView
                className="px-5 flex-1"
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
              >
                {/* ============================================ */}
                {/* CARDIO TYPE SELECTOR */}
                {/* ============================================ */}
                <Text className="text-zinc-400 text-xs font-bold tracking-widest mb-3">
                  TIPO DE CARDIO
                </Text>
                <View className="flex-row flex-wrap gap-2 mb-6">
                  {CARDIO_PRESETS.map((preset) => {
                    const isSelected = cardioType === preset.value;
                    const IconComp = preset.icon;
                    const isCustom = preset.value === 'CUSTOM';
                    return (
                      <Pressable
                        key={preset.value}
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                          applyPreset(preset);
                        }}
                        className="rounded-xl px-4 py-3"
                        style={{
                          backgroundColor: isSelected
                            ? isCustom
                              ? 'rgba(161, 161, 170, 0.15)'
                              : 'rgba(220, 38, 38, 0.15)'
                            : 'rgba(39, 39, 42, 0.4)',
                          borderWidth: 1.5,
                          borderColor: isSelected
                            ? isCustom
                              ? '#A1A1AA'
                              : '#DC2626'
                            : 'rgba(63, 63, 70, 0.4)',
                          minWidth: '30%',
                        }}
                      >
                        <View className="flex-row items-center gap-2 mb-1">
                          <IconComp
                            size={14}
                            color={isSelected ? (isCustom ? '#A1A1AA' : '#DC2626') : '#71717a'}
                          />
                          <Text
                            className={`text-xs font-bold ${isSelected ? (isCustom ? 'text-zinc-300' : 'text-savage-red') : 'text-zinc-400'}`}
                          >
                            {preset.label}
                          </Text>
                        </View>
                        <Text className="text-zinc-600 text-[9px] font-mono">{preset.desc}</Text>
                      </Pressable>
                    );
                  })}
                </View>

                {/* ============================================ */}
                {/* ACTIVITY SELECTOR */}
                {/* ============================================ */}
                <Text className="text-zinc-400 text-xs font-bold tracking-widest mb-3">
                  ACTIVIDAD
                </Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  className="mb-6"
                  contentContainerStyle={{ gap: 8 }}
                >
                  {ACTIVITIES.map((act) => {
                    const isSelected = activity === act;
                    return (
                      <Pressable
                        key={act}
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          setActivity(act);
                          // Reset incline if switching to non-treadmill
                          if (!INCLINE_ACTIVITIES.includes(act)) {
                            setIncline('');
                          }
                        }}
                        className="rounded-lg px-4 py-2.5"
                        style={{
                          backgroundColor: isSelected
                            ? 'rgba(220, 38, 38, 0.15)'
                            : 'rgba(39, 39, 42, 0.4)',
                          borderWidth: 1,
                          borderColor: isSelected ? '#DC2626' : 'rgba(63, 63, 70, 0.3)',
                        }}
                      >
                        <Text
                          className={`text-xs font-bold ${isSelected ? 'text-savage-red' : 'text-zinc-400'}`}
                        >
                          {act}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>

                {/* ============================================ */}
                {/* DURATION */}
                {/* ============================================ */}
                <Text className="text-zinc-400 text-xs font-bold tracking-widest mb-3">
                  DURACIÓN (MINUTOS)
                </Text>
                <View className="flex-row items-center gap-3 mb-6">
                  <Pressable
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setDuration(Math.max(5, duration - 5));
                    }}
                    className="w-12 h-12 rounded-xl items-center justify-center"
                    style={{
                      backgroundColor: 'rgba(39, 39, 42, 0.6)',
                      borderWidth: 1,
                      borderColor: 'rgba(63, 63, 70, 0.4)',
                    }}
                  >
                    <ChevronDown size={20} color="#A1A1AA" />
                  </Pressable>

                  <View
                    className="flex-1 h-12 rounded-xl items-center justify-center"
                    style={{
                      backgroundColor: 'rgba(220, 38, 38, 0.1)',
                      borderWidth: 1,
                      borderColor: 'rgba(220, 38, 38, 0.3)',
                    }}
                  >
                    <Text className="text-white text-2xl font-bold font-mono">{duration}</Text>
                  </View>

                  <Pressable
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setDuration(Math.min(120, duration + 5));
                    }}
                    className="w-12 h-12 rounded-xl items-center justify-center"
                    style={{
                      backgroundColor: 'rgba(39, 39, 42, 0.6)',
                      borderWidth: 1,
                      borderColor: 'rgba(63, 63, 70, 0.4)',
                    }}
                  >
                    <ChevronUp size={20} color="#A1A1AA" />
                  </Pressable>
                </View>

                {/* Quick duration buttons */}
                <View className="flex-row gap-2 mb-6 -mt-3">
                  {[15, 20, 30, 45, 60].map((mins) => (
                    <Pressable
                      key={mins}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setDuration(mins);
                      }}
                      className="flex-1 py-2 rounded-lg items-center"
                      style={{
                        backgroundColor:
                          duration === mins ? 'rgba(220, 38, 38, 0.15)' : 'rgba(39, 39, 42, 0.3)',
                        borderWidth: 1,
                        borderColor: duration === mins ? '#DC2626' : 'rgba(63, 63, 70, 0.2)',
                      }}
                    >
                      <Text
                        className={`text-[10px] font-bold font-mono ${
                          duration === mins ? 'text-savage-red' : 'text-zinc-500'
                        }`}
                      >
                        {mins}m
                      </Text>
                    </Pressable>
                  ))}
                </View>

                {/* ============================================ */}
                {/* INTENSITY + HEART RATE */}
                {/* ============================================ */}
                <Text className="text-zinc-400 text-xs font-bold tracking-widest mb-3">
                  INTENSIDAD
                </Text>
                <View className="flex-row gap-2 mb-3">
                  {INTENSITIES.map((int) => {
                    const isSelected = intensity === int.value;
                    return (
                      <Pressable
                        key={int.value}
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          setIntensity(int.value);
                          // Always update HR to match selected intensity
                          setTargetHR(int.hrSuggested.toString());
                        }}
                        className="flex-1 py-3 rounded-xl items-center"
                        style={{
                          backgroundColor: isSelected ? `${int.color}20` : 'rgba(39, 39, 42, 0.4)',
                          borderWidth: 1.5,
                          borderColor: isSelected ? int.color : 'rgba(63, 63, 70, 0.3)',
                        }}
                      >
                        <Text
                          style={{ color: isSelected ? int.color : '#71717a' }}
                          className="text-[10px] font-bold tracking-wider"
                        >
                          {int.label}
                        </Text>
                        <Text
                          style={{ color: isSelected ? `${int.color}90` : '#52525b' }}
                          className="text-[8px] font-mono mt-0.5"
                        >
                          {int.hrRange} BPM
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                {/* Heart Rate Input */}
                <View
                  className="flex-row items-center gap-3 mb-6 px-4 py-3 rounded-xl"
                  style={{
                    backgroundColor: 'rgba(239, 68, 68, 0.06)',
                    borderWidth: 1,
                    borderColor: `${currentIntensity.color}30`,
                  }}
                >
                  <Activity size={18} color={currentIntensity.color} />
                  <View className="flex-1">
                    <Text className="text-zinc-400 text-[10px] font-bold tracking-widest mb-1">
                      FRECUENCIA CARDÍACA OBJETIVO
                    </Text>
                    <View className="flex-row items-center gap-2">
                      <TextInput
                        value={targetHR}
                        onChangeText={(text) => setTargetHR(text.replace(/[^0-9]/g, ''))}
                        placeholder={currentIntensity.hrSuggested.toString()}
                        placeholderTextColor="#52525b"
                        keyboardType="number-pad"
                        maxLength={3}
                        className="bg-black/40 border border-zinc-800 rounded-lg px-3 py-2 text-white text-lg font-bold font-mono w-20 text-center"
                      />
                      <Text className="text-zinc-500 text-xs font-bold">BPM</Text>
                      <View className="flex-1" />
                      <Text className="text-zinc-600 text-[9px] font-mono">
                        Rango: {currentIntensity.hrRange}
                      </Text>
                    </View>
                  </View>
                </View>

                {/* ============================================ */}
                {/* SPEED */}
                {/* ============================================ */}
                <Text className="text-zinc-400 text-xs font-bold tracking-widest mb-3">
                  VELOCIDAD (OPCIONAL)
                </Text>
                <View
                  className="flex-row items-center gap-3 mb-6 px-4 py-3 rounded-xl"
                  style={{
                    backgroundColor: 'rgba(39, 39, 42, 0.4)',
                    borderWidth: 1,
                    borderColor: 'rgba(63, 63, 70, 0.3)',
                  }}
                >
                  <Gauge size={18} color="#F97316" />
                  <TextInput
                    value={speed}
                    onChangeText={(text) => setSpeed(text.replace(/[^0-9.]/g, ''))}
                    placeholder="0.0"
                    placeholderTextColor="#52525b"
                    keyboardType="decimal-pad"
                    maxLength={4}
                    className="bg-black/40 border border-zinc-800 rounded-lg px-3 py-2 text-white text-lg font-bold font-mono w-20 text-center"
                  />
                  <Text className="text-zinc-500 text-xs font-bold">km/h</Text>
                  <View className="flex-1" />
                  {/* Quick speed presets */}
                  <View className="flex-row gap-1.5">
                    {[4, 6, 8, 10].map((s) => (
                      <Pressable
                        key={s}
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          setSpeed(s.toString());
                        }}
                        className="px-2 py-1 rounded"
                        style={{
                          backgroundColor:
                            speed === s.toString()
                              ? 'rgba(249, 115, 22, 0.2)'
                              : 'rgba(39, 39, 42, 0.6)',
                          borderWidth: 1,
                          borderColor: speed === s.toString() ? '#F97316' : 'rgba(63, 63, 70, 0.3)',
                        }}
                      >
                        <Text
                          className="text-[9px] font-bold font-mono"
                          style={{ color: speed === s.toString() ? '#F97316' : '#71717a' }}
                        >
                          {s}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>

                {/* ============================================ */}
                {/* INCLINE - Only for treadmill/running activities */}
                {/* ============================================ */}
                {showIncline && (
                  <>
                    <Text className="text-zinc-400 text-xs font-bold tracking-widest mb-3">
                      INCLINACIÓN (%)
                    </Text>
                    <View
                      className="flex-row items-center gap-3 mb-6 px-4 py-3 rounded-xl"
                      style={{
                        backgroundColor: 'rgba(39, 39, 42, 0.4)',
                        borderWidth: 1,
                        borderColor: 'rgba(63, 63, 70, 0.3)',
                      }}
                    >
                      <TrendingUp size={18} color="#8B5CF6" />
                      <TextInput
                        value={incline}
                        onChangeText={(text) => setIncline(text.replace(/[^0-9.]/g, ''))}
                        placeholder="0.0"
                        placeholderTextColor="#52525b"
                        keyboardType="decimal-pad"
                        maxLength={4}
                        className="bg-black/40 border border-zinc-800 rounded-lg px-3 py-2 text-white text-lg font-bold font-mono w-20 text-center"
                      />
                      <Text className="text-zinc-500 text-xs font-bold">%</Text>
                      <View className="flex-1" />
                      {/* Quick incline presets */}
                      <View className="flex-row gap-1.5">
                        {[1, 3, 5, 10, 15].map((i) => (
                          <Pressable
                            key={i}
                            onPress={() => {
                              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                              setIncline(i.toString());
                            }}
                            className="px-2 py-1 rounded"
                            style={{
                              backgroundColor:
                                incline === i.toString()
                                  ? 'rgba(139, 92, 246, 0.2)'
                                  : 'rgba(39, 39, 42, 0.6)',
                              borderWidth: 1,
                              borderColor:
                                incline === i.toString() ? '#8B5CF6' : 'rgba(63, 63, 70, 0.3)',
                            }}
                          >
                            <Text
                              className="text-[9px] font-bold font-mono"
                              style={{ color: incline === i.toString() ? '#8B5CF6' : '#71717a' }}
                            >
                              {i}%
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                    </View>
                  </>
                )}

                {/* ============================================ */}
                {/* DÍAS DE LA SEMANA */}
                {/* ============================================ */}
                <Text className="text-zinc-400 text-xs font-bold tracking-widest mb-3">DÍAS</Text>
                <View className="flex-row gap-2 mb-4">
                  {DAYS_ORDER.map((dayIdx, visualIdx) => {
                    const isSelected = selectedDays.includes(dayIdx);
                    return (
                      <Pressable
                        key={dayIdx}
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          setSelectedDays((prev) =>
                            isSelected ? prev.filter((d) => d !== dayIdx) : [...prev, dayIdx]
                          );
                        }}
                        className="flex-1 py-2.5 rounded-lg items-center"
                        style={{
                          backgroundColor: isSelected
                            ? 'rgba(220, 38, 38, 0.2)'
                            : 'rgba(39, 39, 42, 0.4)',
                          borderWidth: 1.5,
                          borderColor: isSelected ? '#DC2626' : 'rgba(63, 63, 70, 0.3)',
                        }}
                      >
                        <Text
                          className="text-xs font-bold"
                          style={{ color: isSelected ? '#DC2626' : '#71717a' }}
                        >
                          {DAYS_LABELS[visualIdx]}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                {/* Quick: All / Training days */}
                <View className="flex-row gap-2 mb-6">
                  <Pressable
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setSelectedDays([0, 1, 2, 3, 4, 5, 6]);
                    }}
                    className="flex-1 py-2 rounded-lg items-center"
                    style={{
                      backgroundColor:
                        selectedDays.length === 7
                          ? 'rgba(220, 38, 38, 0.15)'
                          : 'rgba(39, 39, 42, 0.3)',
                      borderWidth: 1,
                      borderColor: selectedDays.length === 7 ? '#DC2626' : 'rgba(63, 63, 70, 0.2)',
                    }}
                  >
                    <Text
                      className="text-[10px] font-bold"
                      style={{ color: selectedDays.length === 7 ? '#DC2626' : '#71717a' }}
                    >
                      TODOS
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setSelectedDays([1, 2, 3, 4, 5]); // Lunes a Viernes
                    }}
                    className="flex-1 py-2 rounded-lg items-center"
                    style={{
                      backgroundColor: 'rgba(39, 39, 42, 0.3)',
                      borderWidth: 1,
                      borderColor: 'rgba(63, 63, 70, 0.2)',
                    }}
                  >
                    <Text className="text-zinc-500 text-[10px] font-bold">L-V</Text>
                  </Pressable>
                </View>

                {/* ============================================ */}
                {/* PRE / POST WORKOUT TOGGLE */}
                {/* ============================================ */}
                <Text className="text-zinc-400 text-xs font-bold tracking-widest mb-3">
                  MOMENTO
                </Text>
                <View className="flex-row gap-2 mb-3">
                  {/* Regular (by time) */}
                  <Pressable
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setIsPreWorkout(false);
                      setIsPostWorkout(false);
                    }}
                    className="flex-1 py-3 rounded-xl items-center"
                    style={{
                      backgroundColor:
                        !isPreWorkout && !isPostWorkout
                          ? 'rgba(220, 38, 38, 0.15)'
                          : 'rgba(39, 39, 42, 0.4)',
                      borderWidth: 1.5,
                      borderColor:
                        !isPreWorkout && !isPostWorkout ? '#DC2626' : 'rgba(63, 63, 70, 0.3)',
                    }}
                  >
                    <Text
                      className="text-[10px] font-bold tracking-wider"
                      style={{
                        color: !isPreWorkout && !isPostWorkout ? '#DC2626' : '#71717a',
                      }}
                    >
                      POR HORA
                    </Text>
                  </Pressable>

                  {/* Pre-workout */}
                  <Pressable
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setIsPreWorkout(true);
                      setIsPostWorkout(false);
                    }}
                    className="flex-1 py-3 rounded-xl items-center flex-row justify-center gap-1.5"
                    style={{
                      backgroundColor: isPreWorkout
                        ? 'rgba(234, 179, 8, 0.15)'
                        : 'rgba(39, 39, 42, 0.4)',
                      borderWidth: 1.5,
                      borderColor: isPreWorkout ? '#EAB308' : 'rgba(63, 63, 70, 0.3)',
                    }}
                  >
                    <Zap size={12} color={isPreWorkout ? '#EAB308' : '#71717a'} />
                    <Text
                      className="text-[10px] font-bold tracking-wider"
                      style={{ color: isPreWorkout ? '#EAB308' : '#71717a' }}
                    >
                      PRE
                    </Text>
                  </Pressable>

                  {/* Post-workout */}
                  <Pressable
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setIsPreWorkout(false);
                      setIsPostWorkout(true);
                    }}
                    className="flex-1 py-3 rounded-xl items-center flex-row justify-center gap-1.5"
                    style={{
                      backgroundColor: isPostWorkout
                        ? 'rgba(34, 197, 94, 0.15)'
                        : 'rgba(39, 39, 42, 0.4)',
                      borderWidth: 1.5,
                      borderColor: isPostWorkout ? '#22C55E' : 'rgba(63, 63, 70, 0.3)',
                    }}
                  >
                    <Flame size={12} color={isPostWorkout ? '#22C55E' : '#71717a'} />
                    <Text
                      className="text-[10px] font-bold tracking-wider"
                      style={{ color: isPostWorkout ? '#22C55E' : '#71717a' }}
                    >
                      POST
                    </Text>
                  </Pressable>
                </View>

                {/* Session selector - only when pre/post + dual session */}
                {(isPreWorkout || isPostWorkout) && hasDualSession && (
                  <View className="flex-row gap-2 mb-6">
                    {[
                      { val: 0, label: 'SESIÓN A' },
                      { val: 1, label: 'SESIÓN B' },
                      { val: 2, label: 'AMBAS' },
                    ].map((opt) => {
                      const isSelected = workoutSessionIndex === opt.val;
                      return (
                        <Pressable
                          key={opt.val}
                          onPress={() => {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            setWorkoutSessionIndex(opt.val);
                          }}
                          className="flex-1 py-2.5 rounded-lg items-center"
                          style={{
                            backgroundColor: isSelected
                              ? 'rgba(168, 85, 247, 0.15)'
                              : 'rgba(39, 39, 42, 0.3)',
                            borderWidth: 1,
                            borderColor: isSelected ? '#A855F7' : 'rgba(63, 63, 70, 0.2)',
                          }}
                        >
                          <Text
                            className="text-[10px] font-bold"
                            style={{ color: isSelected ? '#A855F7' : '#71717a' }}
                          >
                            {opt.label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                )}

                {/* Info note when pre/post */}
                {(isPreWorkout || isPostWorkout) && !hasDualSession && <View className="mb-6" />}

                {/* ============================================ */}
                {/* TIME PICKER - Only when NOT pre/post */}
                {/* ============================================ */}
                {!isPreWorkout && !isPostWorkout && (
                  <>
                    <Text className="text-zinc-400 text-xs font-bold tracking-widest mb-3">
                      HORA
                    </Text>
                    <View className="flex-row items-center gap-3 mb-6">
                      {/* Hour */}
                      <View className="items-center">
                        <Pressable
                          onPress={() => {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            setSelectedHour(selectedHour >= 12 ? 1 : selectedHour + 1);
                          }}
                          className="w-16 h-8 items-center justify-center"
                        >
                          <ChevronUp size={16} color="#71717a" />
                        </Pressable>
                        <View
                          className="w-16 h-14 rounded-xl items-center justify-center"
                          style={{
                            backgroundColor: 'rgba(220, 38, 38, 0.1)',
                            borderWidth: 1,
                            borderColor: 'rgba(220, 38, 38, 0.3)',
                          }}
                        >
                          <Text className="text-white text-2xl font-bold font-mono">
                            {selectedHour.toString().padStart(2, '0')}
                          </Text>
                        </View>
                        <Pressable
                          onPress={() => {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            setSelectedHour(selectedHour <= 1 ? 12 : selectedHour - 1);
                          }}
                          className="w-16 h-8 items-center justify-center"
                        >
                          <ChevronDown size={16} color="#71717a" />
                        </Pressable>
                      </View>

                      <Text className="text-white text-2xl font-bold">:</Text>

                      {/* Minute */}
                      <View className="items-center">
                        <Pressable
                          onPress={() => {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            setSelectedMinute(selectedMinute >= 55 ? 0 : selectedMinute + 5);
                          }}
                          className="w-16 h-8 items-center justify-center"
                        >
                          <ChevronUp size={16} color="#71717a" />
                        </Pressable>
                        <View
                          className="w-16 h-14 rounded-xl items-center justify-center"
                          style={{
                            backgroundColor: 'rgba(220, 38, 38, 0.1)',
                            borderWidth: 1,
                            borderColor: 'rgba(220, 38, 38, 0.3)',
                          }}
                        >
                          <Text className="text-white text-2xl font-bold font-mono">
                            {selectedMinute.toString().padStart(2, '0')}
                          </Text>
                        </View>
                        <Pressable
                          onPress={() => {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            setSelectedMinute(selectedMinute <= 0 ? 55 : selectedMinute - 5);
                          }}
                          className="w-16 h-8 items-center justify-center"
                        >
                          <ChevronDown size={16} color="#71717a" />
                        </Pressable>
                      </View>

                      {/* AM/PM */}
                      <View className="items-center gap-2 ml-2">
                        <Pressable
                          onPress={() => {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            setSelectedPeriod('AM');
                          }}
                          className="w-14 h-10 rounded-lg items-center justify-center"
                          style={{
                            backgroundColor:
                              selectedPeriod === 'AM'
                                ? 'rgba(220, 38, 38, 0.2)'
                                : 'rgba(39, 39, 42, 0.4)',
                            borderWidth: 1,
                            borderColor:
                              selectedPeriod === 'AM' ? '#DC2626' : 'rgba(63, 63, 70, 0.3)',
                          }}
                        >
                          <Text
                            className={`text-xs font-bold ${
                              selectedPeriod === 'AM' ? 'text-savage-red' : 'text-zinc-500'
                            }`}
                          >
                            AM
                          </Text>
                        </Pressable>
                        <Pressable
                          onPress={() => {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            setSelectedPeriod('PM');
                          }}
                          className="w-14 h-10 rounded-lg items-center justify-center"
                          style={{
                            backgroundColor:
                              selectedPeriod === 'PM'
                                ? 'rgba(220, 38, 38, 0.2)'
                                : 'rgba(39, 39, 42, 0.4)',
                            borderWidth: 1,
                            borderColor:
                              selectedPeriod === 'PM' ? '#DC2626' : 'rgba(63, 63, 70, 0.3)',
                          }}
                        >
                          <Text
                            className={`text-xs font-bold ${
                              selectedPeriod === 'PM' ? 'text-savage-red' : 'text-zinc-500'
                            }`}
                          >
                            PM
                          </Text>
                        </Pressable>
                      </View>
                    </View>
                  </>
                )}

                {/* ============================================ */}
                {/* NOTES */}
                {/* ============================================ */}
                <Text className="text-zinc-400 text-xs font-bold tracking-widest mb-3">
                  NOTAS (OPCIONAL)
                </Text>
                <TextInput
                  value={notes}
                  onChangeText={setNotes}
                  placeholder="Ej: intervalos 2min rápido / 1min lento..."
                  placeholderTextColor="#52525b"
                  multiline
                  numberOfLines={3}
                  className="bg-zinc-900/60 border border-zinc-800 rounded-xl px-4 py-3 text-white text-sm mb-8"
                  style={{ textAlignVertical: 'top', minHeight: 80 }}
                />
              </ScrollView>

              {/* ============================================ */}
              {/* SAVE BUTTON - Fixed at bottom */}
              {/* ============================================ */}
              <View className="px-5 pt-4" style={{ paddingBottom: insets.bottom + 16 }}>
                <Pressable
                  onPress={handleSave}
                  className="w-full py-4 rounded-2xl items-center active:scale-[0.98]"
                  style={{
                    backgroundColor: '#DC2626',
                    shadowColor: '#DC2626',
                    shadowOffset: { width: 0, height: 4 },
                    shadowOpacity: 0.4,
                    shadowRadius: 16,
                  }}
                >
                  <Text className="text-white text-base font-bold tracking-widest">
                    {isEditMode ? 'GUARDAR CAMBIOS' : 'AGREGAR CARDIO'}
                  </Text>
                </Pressable>
              </View>
            </View>
          </Animated.View>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

export default AddCardioModal;
