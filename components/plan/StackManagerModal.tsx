// ============================================================================
// STACK MANAGER MODAL - Gestión de Suplementos/Fármacos
// Administra el inventario de química y suplementos
// FEATURES: TimePicker visual, Edición de compuestos, Múltiples horarios
// ============================================================================

import React, { useState, useEffect, useRef } from 'react';
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
} from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Haptics } from '../../lib/haptics';
import {
  X,
  Plus,
  Clock,
  Trash2,
  Pill,
  Syringe,
  FlaskConical,
  Droplets,
  Zap,
  Flame,
  Edit3,
  Check,
  ChevronLeft,
} from 'lucide-react-native';

// ============================================================================
// TYPES
// ============================================================================
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
  workoutSessionIndex?: number; // 0 = Sesión A, 1 = Sesión B
}

interface StackManagerModalProps {
  visible: boolean;
  onClose: () => void;
  items: StackItem[];
  onAddItem: (item: Omit<StackItem, 'id'>) => void;
  onRemoveItem: (id: string) => void;
  onUpdateItem?: (id: string, item: Partial<Omit<StackItem, 'id'>>) => void;
  hasDualSession?: boolean;
}

// ============================================================================
// CONSTANTS
// ============================================================================
// Visual order: Monday first. Each entry maps visual position → JS day index (0=Sun)
const DAYS_ORDER = [1, 2, 3, 4, 5, 6, 0]; // Lun, Mar, Mié, Jue, Vie, Sáb, Dom
const DAYS_LABELS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const DAYS_FULL = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

const formatDaysOfWeek = (days?: number[]): string => {
  if (!days || days.length === 0) return '';
  if (days.length === 7) return 'Todos los días';
  // Sort following Monday-first order
  const sorted = [...days].sort((a, b) => {
    const orderA = a === 0 ? 7 : a; // Sunday last
    const orderB = b === 0 ? 7 : b;
    return orderA - orderB;
  });
  return sorted.map((d) => DAYS_FULL[d]).join(', ');
};

const TYPES: { key: StackItem['type']; icon: React.ReactNode; label: string }[] = [
  { key: 'pill', icon: <Pill size={20} color="#A855F7" />, label: 'Oral' },
  { key: 'syringe', icon: <Syringe size={20} color="#A855F7" />, label: 'Inyectable' },
  { key: 'powder', icon: <FlaskConical size={20} color="#A855F7" />, label: 'Polvo' },
  { key: 'liquid', icon: <Droplets size={20} color="#A855F7" />, label: 'Líquido' },
];

const HOURS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const MINUTES = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

// ============================================================================
// HELPERS
// ============================================================================
const getTypeIcon = (type: string) => {
  const iconProps = { size: 16, color: '#A855F7' };
  switch (type) {
    case 'pill':
      return <Pill {...iconProps} />;
    case 'syringe':
      return <Syringe {...iconProps} />;
    case 'liquid':
      return <Droplets {...iconProps} />;
    case 'powder':
      return <FlaskConical {...iconProps} />;
    default:
      return <Zap {...iconProps} />;
  }
};

const formatTimeToAMPM = (time24: string): string => {
  if (!time24) return '12:00 PM';
  const [hours, minutes] = time24.split(':').map((s) => parseInt(s, 10));
  const h = hours || 0;
  const m = minutes || 0;
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 || 12;
  return `${hour12}:${m.toString().padStart(2, '0')} ${period}`;
};

const parseTimeToAMPM = (time24: string): { hour: number; minute: number; period: 'AM' | 'PM' } => {
  if (!time24) return { hour: 12, minute: 0, period: 'PM' };
  const [h, m] = time24.split(':').map((s) => parseInt(s, 10));
  const hours = h || 0;
  const minutes = m || 0;
  const period: 'AM' | 'PM' = hours >= 12 ? 'PM' : 'AM';
  const hour12 = hours % 12 || 12;
  return { hour: hour12, minute: minutes, period };
};

const convertTo24h = (hour: number, minute: number, period: 'AM' | 'PM'): string => {
  let hour24 = hour;
  if (period === 'AM') {
    if (hour24 === 12) hour24 = 0;
  } else {
    if (hour24 !== 12) hour24 += 12;
  }
  return `${hour24.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
};

// ============================================================================
// INLINE TIME PICKER COMPONENT
// ============================================================================
interface InlineTimePickerProps {
  time: string;
  onTimeChange: (time: string) => void;
  label?: string;
  onRemove?: () => void;
  showRemove?: boolean;
}

const InlineTimePicker: React.FC<InlineTimePickerProps> = ({
  time,
  onTimeChange,
  label,
  onRemove,
  showRemove = false,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const parsed = parseTimeToAMPM(time);
  const [selectedHour, setSelectedHour] = useState(parsed.hour);
  const [selectedMinute, setSelectedMinute] = useState(parsed.minute);
  const [selectedPeriod, setSelectedPeriod] = useState<'AM' | 'PM'>(parsed.period);

  useEffect(() => {
    const p = parseTimeToAMPM(time);
    setSelectedHour(p.hour);
    setSelectedMinute(p.minute);
    setSelectedPeriod(p.period);
  }, [time]);

  const handleConfirm = () => {
    const newTime = convertTo24h(selectedHour, selectedMinute, selectedPeriod);
    onTimeChange(newTime);
    setIsExpanded(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  if (!isExpanded) {
    return (
      <View className="flex-row items-center gap-2">
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setIsExpanded(true);
          }}
          className="flex-row items-center gap-2 bg-purple-500/20 border border-purple-500/40 px-4 py-3 rounded-xl flex-1 active:bg-purple-500/30"
        >
          <Clock size={16} color="#A855F7" />
          <Text className="text-purple-400 font-bold text-base">{formatTimeToAMPM(time)}</Text>
          {label && <Text className="text-zinc-500 text-xs ml-auto">{label}</Text>}
        </Pressable>
        {showRemove && onRemove && (
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              onRemove();
            }}
            className="p-3 bg-red-500/10 rounded-xl active:bg-red-500/20"
          >
            <Trash2 size={18} color="#EF4444" />
          </Pressable>
        )}
      </View>
    );
  }

  return (
    <View className="bg-[#0a0a0a] border border-purple-500/30 rounded-xl p-4">
      {label && <Text className="text-purple-400 text-xs font-bold uppercase mb-3">{label}</Text>}

      {/* Preview */}
      <View className="items-center pb-4 border-b border-white/5 mb-4">
        <Text className="text-white text-3xl font-mono font-bold">
          {selectedHour}:{selectedMinute.toString().padStart(2, '0')} {selectedPeriod}
        </Text>
      </View>

      {/* Hour Selector */}
      <Text className="text-zinc-500 text-xs font-bold uppercase mb-2">Hora</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-4">
        <View className="flex-row gap-2">
          {HOURS.map((h) => (
            <Pressable
              key={h}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setSelectedHour(h);
              }}
              className={`w-11 h-11 rounded-xl items-center justify-center ${
                selectedHour === h ? 'bg-purple-500' : 'bg-zinc-800 active:bg-zinc-700'
              }`}
            >
              <Text
                className={`font-bold text-base ${
                  selectedHour === h ? 'text-white' : 'text-zinc-400'
                }`}
              >
                {h}
              </Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>

      {/* Minute Selector */}
      <Text className="text-zinc-500 text-xs font-bold uppercase mb-2">Minutos</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-4">
        <View className="flex-row gap-2">
          {MINUTES.map((m) => (
            <Pressable
              key={m}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setSelectedMinute(m);
              }}
              className={`w-11 h-11 rounded-xl items-center justify-center ${
                selectedMinute === m ? 'bg-purple-500' : 'bg-zinc-800 active:bg-zinc-700'
              }`}
            >
              <Text
                className={`font-bold text-base ${
                  selectedMinute === m ? 'text-white' : 'text-zinc-400'
                }`}
              >
                {m.toString().padStart(2, '0')}
              </Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>

      {/* AM/PM Toggle */}
      <View className="flex-row gap-3 mb-4">
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setSelectedPeriod('AM');
          }}
          className={`flex-1 py-3 rounded-xl items-center ${
            selectedPeriod === 'AM'
              ? 'bg-yellow-500/20 border-2 border-yellow-500'
              : 'bg-zinc-800 border-2 border-transparent'
          }`}
        >
          <Text
            className={`font-bold text-lg ${
              selectedPeriod === 'AM' ? 'text-yellow-500' : 'text-zinc-500'
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
          className={`flex-1 py-3 rounded-xl items-center ${
            selectedPeriod === 'PM'
              ? 'bg-purple-500/20 border-2 border-purple-500'
              : 'bg-zinc-800 border-2 border-transparent'
          }`}
        >
          <Text
            className={`font-bold text-lg ${
              selectedPeriod === 'PM' ? 'text-purple-500' : 'text-zinc-500'
            }`}
          >
            PM
          </Text>
        </Pressable>
      </View>

      {/* Actions */}
      <View className="flex-row gap-3">
        <Pressable
          onPress={() => setIsExpanded(false)}
          className="flex-1 py-3 rounded-xl border border-zinc-700"
        >
          <Text className="text-zinc-400 font-bold text-center">CANCELAR</Text>
        </Pressable>
        <Pressable
          onPress={handleConfirm}
          className="flex-1 py-3 rounded-xl bg-purple-600 flex-row items-center justify-center gap-2 active:bg-purple-500"
        >
          <Check size={16} color="#FFF" />
          <Text className="text-white font-bold">CONFIRMAR</Text>
        </Pressable>
      </View>
    </View>
  );
};

// ============================================================================
// EDIT ITEM VIEW
// ============================================================================
interface EditItemViewProps {
  item: StackItem;
  onSave: (updatedItem: Partial<Omit<StackItem, 'id'>>) => void;
  onCancel: () => void;
  onDelete: () => void;
  hasDualSession?: boolean;
}

const EditItemView: React.FC<EditItemViewProps> = ({
  item,
  onSave,
  onCancel,
  onDelete,
  hasDualSession,
}) => {
  const insets = useSafeAreaInsets();
  const [name, setName] = useState(item.name);
  const [dose, setDose] = useState(item.dose);
  const [type, setType] = useState<StackItem['type']>(item.type);
  const [notes, setNotes] = useState(item.notes || '');
  const [times, setTimes] = useState<string[]>(item.times || (item.time ? [item.time] : ['08:00']));
  const [isPreWorkout, setIsPreWorkout] = useState(item.isPreWorkout || false);
  const [isPostWorkout, setIsPostWorkout] = useState(item.isPostWorkout || false);
  const [workoutSessionIndex, setWorkoutSessionIndex] = useState<number>(
    item.workoutSessionIndex ?? 0
  );
  const [showAdditionalTimes, setShowAdditionalTimes] = useState(
    (item.isPreWorkout || item.isPostWorkout) && item.times && item.times.length > 0
  );
  const [selectedDays, setSelectedDays] = useState<number[]>(
    item.daysOfWeek || [0, 1, 2, 3, 4, 5, 6]
  );

  const toggleDay = (day: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (selectedDays.includes(day)) {
      setSelectedDays(selectedDays.filter((d) => d !== day));
    } else {
      setSelectedDays([...selectedDays, day]);
    }
  };

  const addTime = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setTimes([...times, '12:00']);
  };

  const removeTime = (index: number) => {
    if (times.length > 1) {
      setTimes(times.filter((_, i) => i !== index));
    }
  };

  const updateTime = (index: number, newTime: string) => {
    const updated = [...times];
    updated[index] = newTime;
    setTimes(updated);
  };

  const handleSave = () => {
    if (!name.trim() || !dose.trim()) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    // For pre/post workout: only include times if user toggled additional times on
    const finalTimes = (isPreWorkout || isPostWorkout) && !showAdditionalTimes ? undefined : times;
    const finalTime = finalTimes ? finalTimes[0] : undefined;

    onSave({
      name: name.trim(),
      dose: dose.trim(),
      type,
      notes: notes.trim() || undefined,
      times: finalTimes,
      time: finalTime,
      isPreWorkout,
      isPostWorkout,
      daysOfWeek: selectedDays,
      workoutSessionIndex: isPreWorkout || isPostWorkout ? workoutSessionIndex : undefined,
    });
  };

  return (
    <ScrollView className="p-4" showsVerticalScrollIndicator={false}>
      {/* Header */}
      <View className="flex-row items-center gap-3 mb-4">
        <Pressable onPress={onCancel} className="p-2 bg-zinc-800 rounded-lg active:bg-zinc-700">
          <ChevronLeft size={20} color="#999" />
        </Pressable>
        <Text className="text-white font-bold text-lg flex-1">Editar Compuesto</Text>
        <Pressable onPress={onDelete} className="p-2 bg-red-500/10 rounded-lg active:bg-red-500/20">
          <Trash2 size={20} color="#EF4444" />
        </Pressable>
      </View>
      {/* Name */} <Text className="text-zinc-500 text-xs mb-2 font-bold uppercase">Nombre</Text>
      <TextInput
        value={name}
        onChangeText={setName}
        placeholder="Nombre (ej. Creatina)"
        placeholderTextColor="#666"
        className="bg-black/40 border border-white/10 rounded-lg p-3 text-white mb-4"
      />
      {/* Type Selector */}
      <Text className="text-zinc-500 text-xs mb-2 font-bold uppercase">Tipo</Text>
      <View className="flex-row gap-2 mb-4">
        {TYPES.map((t) => (
          <Pressable
            key={t.key}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setType(t.key);
            }}
            className={`flex-1 p-3 rounded-lg border items-center ${
              type === t.key ? 'bg-purple-500/20 border-purple-500' : 'bg-[#111111] border-white/10'
            }`}
          >
            {t.icon}
            <Text
              className={`text-xs mt-1 ${type === t.key ? 'text-purple-400' : 'text-zinc-500'}`}
            >
              {t.label}
            </Text>
          </Pressable>
        ))}
      </View>
      {/* Dose */}
      <Text className="text-zinc-500 text-xs mb-2 font-bold uppercase">Dosis</Text>
      <TextInput
        value={dose}
        onChangeText={setDose}
        placeholder="Dosis (ej. 5g, 1 tab, 2 UI)"
        placeholderTextColor="#666"
        className="bg-black/40 border border-white/10 rounded-lg p-3 text-white mb-4"
      />
      {/* Days Selector */}
      <Text className="text-zinc-500 text-xs mb-2 font-bold uppercase">Días de la semana</Text>
      <View className="flex-row gap-1 mb-4">
        {DAYS_ORDER.map((dayIdx, visualIdx) => (
          <Pressable
            key={dayIdx}
            onPress={() => toggleDay(dayIdx)}
            className={`flex-1 py-2 rounded-lg items-center ${
              selectedDays.includes(dayIdx)
                ? 'bg-purple-500'
                : 'bg-[#111111] border border-white/10'
            }`}
          >
            <Text
              className={`font-bold text-xs ${
                selectedDays.includes(dayIdx) ? 'text-white' : 'text-zinc-500'
              }`}
            >
              {DAYS_LABELS[visualIdx]}
            </Text>
          </Pressable>
        ))}
      </View>
      {/* Pre/Post Workout Toggle */}
      <Text className="text-zinc-500 text-xs mb-2 font-bold uppercase">
        Vinculación al Entrenamiento
      </Text>
      <View className="flex-row gap-2 mb-4">
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            setIsPreWorkout(!isPreWorkout);
            if (!isPreWorkout) setIsPostWorkout(false);
          }}
          className={`flex-1 flex-row items-center justify-center gap-2 p-3 rounded-lg border ${
            isPreWorkout ? 'bg-yellow-500/20 border-yellow-500' : 'bg-[#111111] border-white/10'
          }`}
        >
          <Zap size={16} color={isPreWorkout ? '#EAB308' : '#666'} />
          <Text
            className={`text-sm font-bold ${isPreWorkout ? 'text-yellow-500' : 'text-zinc-500'}`}
          >
            PRE-WORKOUT
          </Text>
        </Pressable>
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            setIsPostWorkout(!isPostWorkout);
            if (!isPostWorkout) setIsPreWorkout(false);
          }}
          className={`flex-1 flex-row items-center justify-center gap-2 p-3 rounded-lg border ${
            isPostWorkout ? 'bg-green-500/20 border-green-500' : 'bg-[#111111] border-white/10'
          }`}
        >
          <Flame size={16} color={isPostWorkout ? '#22C55E' : '#666'} />
          <Text
            className={`text-sm font-bold ${isPostWorkout ? 'text-green-500' : 'text-zinc-500'}`}
          >
            POST-WORKOUT
          </Text>
        </Pressable>
      </View>
      {/* Session Selector - Only when PRE/POST is active and dual session exists */}
      {(isPreWorkout || isPostWorkout) && hasDualSession && (
        <>
          <Text className="text-zinc-500 text-xs mb-2 font-bold uppercase">
            Sesión de Entrenamiento
          </Text>
          <View className="flex-row gap-2 mb-4">
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setWorkoutSessionIndex(0);
              }}
              className={`flex-1 p-3 rounded-lg border items-center ${
                workoutSessionIndex === 0
                  ? 'bg-red-500/20 border-red-500'
                  : 'bg-[#111111] border-white/10'
              }`}
            >
              <Text
                className={`text-sm font-bold ${
                  workoutSessionIndex === 0 ? 'text-red-500' : 'text-zinc-500'
                }`}
              >
                SESIÓN A
              </Text>
            </Pressable>
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setWorkoutSessionIndex(1);
              }}
              className={`flex-1 p-3 rounded-lg border items-center ${
                workoutSessionIndex === 1
                  ? 'bg-red-500/20 border-red-500'
                  : 'bg-[#111111] border-white/10'
              }`}
            >
              <Text
                className={`text-sm font-bold ${
                  workoutSessionIndex === 1 ? 'text-red-500' : 'text-zinc-500'
                }`}
              >
                SESIÓN B
              </Text>
            </Pressable>
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setWorkoutSessionIndex(2);
              }}
              className={`flex-1 p-3 rounded-lg border items-center ${
                workoutSessionIndex === 2
                  ? 'bg-red-500/20 border-red-500'
                  : 'bg-[#111111] border-white/10'
              }`}
            >
              <Text
                className={`text-sm font-bold ${
                  workoutSessionIndex === 2 ? 'text-red-500' : 'text-zinc-500'
                }`}
              >
                AMBAS
              </Text>
            </Pressable>
          </View>
        </>
      )}
      {/* Times - Multiple Time Pickers */}
      {isPreWorkout || isPostWorkout ? (
        <>
          {!showAdditionalTimes ? (
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setShowAdditionalTimes(true);
                setTimes(['08:00']);
              }}
              className="flex-row items-center justify-center gap-2 py-3 border border-dashed border-purple-500/30 rounded-xl mb-4 active:bg-purple-500/10"
            >
              <Plus size={16} color="#A855F7" />
              <Text className="text-purple-400 font-bold text-sm">AGREGAR HORARIO ADICIONAL</Text>
            </Pressable>
          ) : (
            <>
              <Text className="text-zinc-500 text-xs mb-2 font-bold uppercase">
                Horarios adicionales ({times.length})
              </Text>
              <View className="gap-3 mb-2">
                {times.map((t, index) => (
                  <InlineTimePicker
                    key={index}
                    time={t}
                    onTimeChange={(newTime) => updateTime(index, newTime)}
                    label={times.length > 1 ? `Toma ${index + 1}` : undefined}
                    showRemove={true}
                    onRemove={() => {
                      if (times.length <= 1) {
                        setShowAdditionalTimes(false);
                        setTimes(['08:00']);
                      } else {
                        removeTime(index);
                      }
                    }}
                  />
                ))}
              </View>
              <Pressable
                onPress={addTime}
                className="flex-row items-center justify-center gap-2 py-3 border border-dashed border-purple-500/50 rounded-xl mb-4 active:bg-purple-500/10"
              >
                <Plus size={16} color="#A855F7" />
                <Text className="text-purple-400 font-bold text-sm">AGREGAR HORARIO</Text>
              </Pressable>
            </>
          )}
        </>
      ) : (
        <>
          <Text className="text-zinc-500 text-xs mb-2 font-bold uppercase">
            Horarios de toma ({times.length})
          </Text>
          <View className="gap-3 mb-2">
            {times.map((t, index) => (
              <InlineTimePicker
                key={index}
                time={t}
                onTimeChange={(newTime) => updateTime(index, newTime)}
                label={times.length > 1 ? `Toma ${index + 1}` : undefined}
                showRemove={times.length > 1}
                onRemove={() => removeTime(index)}
              />
            ))}
          </View>
          <Pressable
            onPress={addTime}
            className="flex-row items-center justify-center gap-2 py-3 border border-dashed border-purple-500/50 rounded-xl mb-4 active:bg-purple-500/10"
          >
            <Plus size={16} color="#A855F7" />
            <Text className="text-purple-400 font-bold text-sm">AGREGAR HORARIO</Text>
          </Pressable>
        </>
      )}
      {/* Notes */}
      <Text className="text-zinc-500 text-xs mb-2 font-bold uppercase">Notas</Text>
      <TextInput
        value={notes}
        onChangeText={setNotes}
        placeholder="Notas (ej. Con estómago vacío)"
        placeholderTextColor="#666"
        className="bg-black/40 border border-white/10 rounded-lg p-3 text-white mb-6"
        multiline
      />
      {/* Save Button */}
      <Pressable
        onPress={handleSave}
        className="bg-purple-600 py-4 rounded-xl flex-row items-center justify-center gap-2 active:bg-purple-500"
        style={{ marginBottom: Math.max(insets.bottom, 16) + 8 }}
      >
        <Check size={18} color="#FFF" />
        <Text className="text-white font-bold text-lg">GUARDAR CAMBIOS</Text>
      </Pressable>
    </ScrollView>
  );
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================
export const StackManagerModal: React.FC<StackManagerModalProps> = ({
  visible,
  onClose,
  items,
  onAddItem,
  onRemoveItem,
  onUpdateItem,
  hasDualSession,
}) => {
  const insets = useSafeAreaInsets();
  const [viewMode, setViewMode] = useState<'list' | 'add' | 'edit'>('list');
  const [editingItem, setEditingItem] = useState<StackItem | null>(null);

  // ===== ANIMACIONES FLUIDAS =====
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

  // Form state for new item
  const [name, setName] = useState('');
  const [dose, setDose] = useState('');
  const [type, setType] = useState<StackItem['type']>('pill');
  const [notes, setNotes] = useState('');
  const [times, setTimes] = useState<string[]>(['08:00']);
  const [isPreWorkout, setIsPreWorkout] = useState(false);
  const [isPostWorkout, setIsPostWorkout] = useState(false);
  const [workoutSessionIndex, setWorkoutSessionIndex] = useState<number>(0);
  const [showAdditionalTimes, setShowAdditionalTimes] = useState(false);
  const [selectedDays, setSelectedDays] = useState<number[]>([0, 1, 2, 3, 4, 5, 6]);

  // Reset form and view when modal closes
  useEffect(() => {
    if (!visible) {
      setViewMode('list');
      setEditingItem(null);
      resetForm();
    } else {
      translateY.value = 0;
      // Haptic feedback cuando abre
      setTimeout(() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }, 300);
    }
  }, [visible]);

  const resetForm = () => {
    setName('');
    setDose('');
    setType('pill');
    setNotes('');
    setTimes(['08:00']);
    setIsPreWorkout(false);
    setIsPostWorkout(false);
    setWorkoutSessionIndex(0);
    setShowAdditionalTimes(false);
    setSelectedDays([0, 1, 2, 3, 4, 5, 6]);
  };

  const toggleDay = (day: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (selectedDays.includes(day)) {
      setSelectedDays(selectedDays.filter((d) => d !== day));
    } else {
      setSelectedDays([...selectedDays, day]);
    }
  };

  const addTime = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setTimes([...times, '12:00']);
  };

  const removeTime = (index: number) => {
    if (times.length > 1) {
      setTimes(times.filter((_, i) => i !== index));
    }
  };

  const updateTime = (index: number, newTime: string) => {
    const updated = [...times];
    updated[index] = newTime;
    setTimes(updated);
  };

  const handleAddItem = () => {
    if (!name.trim() || !dose.trim()) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    // For pre/post workout: only include times if user toggled additional times on
    const finalTimes = (isPreWorkout || isPostWorkout) && !showAdditionalTimes ? undefined : times;
    const finalTime = finalTimes ? finalTimes[0] : undefined;

    onAddItem({
      name: name.trim(),
      dose: dose.trim(),
      type,
      notes: notes.trim() || undefined,
      times: finalTimes,
      time: finalTime,
      isPreWorkout,
      isPostWorkout,
      daysOfWeek: selectedDays,
      workoutSessionIndex: isPreWorkout || isPostWorkout ? workoutSessionIndex : undefined,
    });

    resetForm();
    setViewMode('list');
  };

  const handleEditItem = (item: StackItem) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setEditingItem(item);
    setViewMode('edit');
  };

  const handleSaveEdit = (updatedData: Partial<Omit<StackItem, 'id'>>) => {
    if (editingItem && onUpdateItem) {
      onUpdateItem(editingItem.id, updatedData);
    }
    setEditingItem(null);
    setViewMode('list');
  };

  const handleDeleteFromEdit = () => {
    if (editingItem) {
      onRemoveItem(editingItem.id);
    }
    setEditingItem(null);
    setViewMode('list');
  };

  // Helper to get all times for display
  const getItemTimes = (item: StackItem): string[] => {
    if (item.times && item.times.length > 0) return item.times;
    if (item.time) return [item.time];
    return [];
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1"
      >
        <View className="flex-1 bg-transparent justify-end">
          <Animated.View
            style={[
              animatedStyle,
              {
                backgroundColor: '#0a0a0a',
                borderTopLeftRadius: 24,
                borderTopRightRadius: 24,
                maxHeight: '90%',
                borderTopWidth: 2,
                borderTopColor: 'rgba(168, 85, 247, 0.5)',
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
                backgroundColor: '#A855F7',
                shadowColor: '#A855F7',
                shadowOffset: { width: 0, height: 0 },
                shadowOpacity: 0.8,
                shadowRadius: 10,
                zIndex: 10,
              }}
            />

            {/* Header Draggable - Todo el header es área de arrastre */}
            <View {...panResponder.panHandlers} className="border-b border-zinc-800/50">
              {/* Drag Indicator */}
              <View className="pt-4 pb-2 items-center">
                <View className="w-12 h-1.5 bg-zinc-600 rounded-full" />
              </View>

              {/* Header Title */}
              <View className="flex-row items-center px-4 pb-4">
                <View className="flex-row items-center gap-2">
                  <FlaskConical size={18} color="#A855F7" />
                  <Text className="text-white font-bold text-lg">
                    {viewMode === 'edit'
                      ? 'Editar Compuesto'
                      : viewMode === 'add'
                        ? 'Nuevo Compuesto'
                        : 'Stack Manager'}
                  </Text>
                </View>
              </View>
            </View>

            {/* EDIT VIEW */}
            {viewMode === 'edit' && editingItem && (
              <EditItemView
                item={editingItem}
                onSave={handleSaveEdit}
                onCancel={() => {
                  setEditingItem(null);
                  setViewMode('list');
                }}
                onDelete={handleDeleteFromEdit}
                hasDualSession={hasDualSession}
              />
            )}

            {/* LIST VIEW */}
            {viewMode === 'list' && (
              <ScrollView className="p-4" showsVerticalScrollIndicator={false}>
                {/* Info Banner */}
                <View className="flex-row bg-purple-500/10 border border-purple-500/20 p-3 rounded-xl mb-4 gap-3">
                  <Clock size={16} color="#A855F7" />
                  <Text className="text-zinc-300 text-xs flex-1">
                    Toca un compuesto para editarlo. Puedes configurar múltiples horarios para
                    suplementos que se toman varias veces al día.
                  </Text>
                </View>

                {/* Items List */}
                <Text className="text-zinc-500 text-xs font-bold uppercase mb-3">
                  Activos ({items.length})
                </Text>
                {items.length === 0 ? (
                  <View className="bg-zinc-900/80 p-6 rounded-xl border border-zinc-800 mb-4">
                    <Text className="text-zinc-500 text-center">
                      No hay suplementos configurados
                    </Text>
                  </View>
                ) : (
                  items.map((item) => {
                    const itemTimes = getItemTimes(item);
                    return (
                      <Pressable
                        key={item.id}
                        onPress={() => handleEditItem(item)}
                        className="bg-zinc-900/80 p-4 rounded-xl border border-zinc-800 mb-3 active:bg-zinc-800"
                      >
                        <View className="flex-row justify-between items-start">
                          <View className="flex-row gap-3 items-center flex-1">
                            {getTypeIcon(item.type)}
                            <View className="flex-1">
                              <Text className="text-white font-bold">{item.name}</Text>
                              <View className="flex-row items-center gap-2 flex-wrap mt-1">
                                <Text className="text-zinc-500 text-xs">{item.dose}</Text>
                                {item.isPreWorkout && (
                                  <View className="flex-row items-center gap-1 bg-yellow-500/20 px-1.5 py-0.5 rounded">
                                    <Zap size={10} color="#EAB308" />
                                    <Text className="text-yellow-500 text-[10px]">PRE</Text>
                                  </View>
                                )}
                                {item.isPostWorkout && (
                                  <View className="flex-row items-center gap-1 bg-green-500/20 px-1.5 py-0.5 rounded">
                                    <Flame size={10} color="#22C55E" />
                                    <Text className="text-green-500 text-[10px]">POST</Text>
                                  </View>
                                )}
                                {(item.isPreWorkout || item.isPostWorkout) && hasDualSession && (
                                  <View className="bg-red-500/20 px-1.5 py-0.5 rounded">
                                    <Text className="text-red-500 text-[10px] font-bold">
                                      {(item.workoutSessionIndex ?? 0) === 0
                                        ? 'SESIÓN A'
                                        : item.workoutSessionIndex === 1
                                          ? 'SESIÓN B'
                                          : 'A + B'}
                                    </Text>
                                  </View>
                                )}
                              </View>
                              {/* Days of week display */}
                              {item.daysOfWeek &&
                                item.daysOfWeek.length > 0 &&
                                item.daysOfWeek.length < 7 && (
                                  <View className="flex-row items-center gap-1 mt-1">
                                    <Clock size={10} color="#A855F7" />
                                    <Text className="text-purple-400 text-[10px]">
                                      {formatDaysOfWeek(item.daysOfWeek)}
                                    </Text>
                                  </View>
                                )}
                              {(!item.daysOfWeek || item.daysOfWeek.length === 7) && (
                                <View className="flex-row items-center gap-1 mt-1">
                                  <Clock size={10} color="#666" />
                                  <Text className="text-zinc-500 text-[10px]">Todos los días</Text>
                                </View>
                              )}
                              {/* Multiple times display */}
                              {itemTimes.length > 0 && (
                                <View className="flex-row flex-wrap gap-1 mt-2">
                                  {itemTimes.map((t, idx) => (
                                    <View key={idx} className="bg-purple-500/10 px-2 py-1 rounded">
                                      <Text className="text-purple-400 text-xs font-mono">
                                        {formatTimeToAMPM(t)}
                                      </Text>
                                    </View>
                                  ))}
                                </View>
                              )}
                            </View>
                          </View>
                          <View className="flex-row items-center gap-2">
                            <Edit3 size={14} color="#666" />
                          </View>
                        </View>
                      </Pressable>
                    );
                  })
                )}

                {/* Add Button */}
                <Pressable
                  onPress={() => setViewMode('add')}
                  className="w-full bg-purple-600 py-4 rounded-xl mb-6 flex-row items-center justify-center gap-2 active:bg-purple-500"
                  style={{
                    marginBottom: Math.max(insets.bottom, 16) + 8,
                    shadowColor: '#A855F7',
                    shadowOffset: { width: 0, height: 4 },
                    shadowOpacity: 0.4,
                    shadowRadius: 8,
                    elevation: 5,
                  }}
                >
                  <Plus size={18} color="#FFF" />
                  <Text className="text-white font-bold">AGREGAR COMPUESTO</Text>
                </Pressable>
              </ScrollView>
            )}

            {/* ADD VIEW */}
            {viewMode === 'add' && (
              <ScrollView className="p-4" showsVerticalScrollIndicator={false}>
                {/* Back Button */}
                <View className="flex-row items-center gap-3 mb-4">
                  <Pressable
                    onPress={() => {
                      resetForm();
                      setViewMode('list');
                    }}
                    className="p-2 bg-zinc-800 rounded-lg active:bg-zinc-700"
                  >
                    <ChevronLeft size={20} color="#999" />
                  </Pressable>
                  <Text className="text-white font-bold text-lg">Nuevo Compuesto</Text>
                </View>

                {/* Name */}
                <Text className="text-zinc-500 text-xs mb-2 font-bold uppercase">Nombre</Text>
                <TextInput
                  value={name}
                  onChangeText={setName}
                  placeholder="Nombre (ej. Creatina)"
                  placeholderTextColor="#666"
                  className="bg-black/40 border border-white/10 rounded-lg p-3 text-white mb-4"
                />

                {/* Type Selector */}
                <Text className="text-zinc-500 text-xs mb-2 font-bold uppercase">Tipo</Text>
                <View className="flex-row gap-2 mb-4">
                  {TYPES.map((t) => (
                    <Pressable
                      key={t.key}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setType(t.key);
                      }}
                      className={`flex-1 p-3 rounded-lg border items-center ${
                        type === t.key
                          ? 'bg-purple-500/20 border-purple-500'
                          : 'bg-[#111111] border-white/10'
                      }`}
                    >
                      {t.icon}
                      <Text
                        className={`text-xs mt-1 ${
                          type === t.key ? 'text-purple-400' : 'text-zinc-500'
                        }`}
                      >
                        {t.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>

                {/* Dose */}
                <Text className="text-zinc-500 text-xs mb-2 font-bold uppercase">Dosis</Text>
                <TextInput
                  value={dose}
                  onChangeText={setDose}
                  placeholder="Dosis (ej. 5g, 1 tab, 2 UI)"
                  placeholderTextColor="#666"
                  className="bg-black/40 border border-white/10 rounded-lg p-3 text-white mb-4"
                />

                {/* Days Selector */}
                <Text className="text-zinc-500 text-xs mb-2 font-bold uppercase">
                  Días de la semana
                </Text>
                <View className="flex-row gap-1 mb-4">
                  {DAYS_ORDER.map((dayIdx, visualIdx) => (
                    <Pressable
                      key={dayIdx}
                      onPress={() => toggleDay(dayIdx)}
                      className={`flex-1 py-2 rounded-lg items-center ${
                        selectedDays.includes(dayIdx)
                          ? 'bg-purple-500'
                          : 'bg-[#111111] border border-white/10'
                      }`}
                    >
                      <Text
                        className={`font-bold text-xs ${
                          selectedDays.includes(dayIdx) ? 'text-white' : 'text-zinc-500'
                        }`}
                      >
                        {DAYS_LABELS[visualIdx]}
                      </Text>
                    </Pressable>
                  ))}
                </View>

                {/* Pre/Post Workout Toggle */}
                <Text className="text-zinc-500 text-xs mb-2 font-bold uppercase">
                  Vinculación al Entrenamiento
                </Text>
                <View className="flex-row gap-2 mb-4">
                  <Pressable
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                      setIsPreWorkout(!isPreWorkout);
                      if (!isPreWorkout) setIsPostWorkout(false);
                    }}
                    className={`flex-1 flex-row items-center justify-center gap-2 p-3 rounded-lg border ${
                      isPreWorkout
                        ? 'bg-yellow-500/20 border-yellow-500'
                        : 'bg-[#111111] border-white/10'
                    }`}
                  >
                    <Zap size={16} color={isPreWorkout ? '#EAB308' : '#666'} />
                    <Text
                      className={`text-sm font-bold ${
                        isPreWorkout ? 'text-yellow-500' : 'text-zinc-500'
                      }`}
                    >
                      PRE
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                      setIsPostWorkout(!isPostWorkout);
                      if (!isPostWorkout) setIsPreWorkout(false);
                    }}
                    className={`flex-1 flex-row items-center justify-center gap-2 p-3 rounded-lg border ${
                      isPostWorkout
                        ? 'bg-green-500/20 border-green-500'
                        : 'bg-[#111111] border-white/10'
                    }`}
                  >
                    <Flame size={16} color={isPostWorkout ? '#22C55E' : '#666'} />
                    <Text
                      className={`text-sm font-bold ${
                        isPostWorkout ? 'text-green-500' : 'text-zinc-500'
                      }`}
                    >
                      POST
                    </Text>
                  </Pressable>
                </View>

                {/* Session Selector - Only when PRE/POST is active and dual session exists */}
                {(isPreWorkout || isPostWorkout) && hasDualSession && (
                  <>
                    <Text className="text-zinc-500 text-xs mb-2 font-bold uppercase">
                      Sesión de Entrenamiento
                    </Text>
                    <View className="flex-row gap-2 mb-4">
                      <Pressable
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          setWorkoutSessionIndex(0);
                        }}
                        className={`flex-1 p-3 rounded-lg border items-center ${
                          workoutSessionIndex === 0
                            ? 'bg-red-500/20 border-red-500'
                            : 'bg-[#111111] border-white/10'
                        }`}
                      >
                        <Text
                          className={`text-sm font-bold ${
                            workoutSessionIndex === 0 ? 'text-red-500' : 'text-zinc-500'
                          }`}
                        >
                          SESIÓN A
                        </Text>
                      </Pressable>
                      <Pressable
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          setWorkoutSessionIndex(1);
                        }}
                        className={`flex-1 p-3 rounded-lg border items-center ${
                          workoutSessionIndex === 1
                            ? 'bg-red-500/20 border-red-500'
                            : 'bg-[#111111] border-white/10'
                        }`}
                      >
                        <Text
                          className={`text-sm font-bold ${
                            workoutSessionIndex === 1 ? 'text-red-500' : 'text-zinc-500'
                          }`}
                        >
                          SESIÓN B
                        </Text>
                      </Pressable>
                      <Pressable
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          setWorkoutSessionIndex(2);
                        }}
                        className={`flex-1 p-3 rounded-lg border items-center ${
                          workoutSessionIndex === 2
                            ? 'bg-red-500/20 border-red-500'
                            : 'bg-[#111111] border-white/10'
                        }`}
                      >
                        <Text
                          className={`text-sm font-bold ${
                            workoutSessionIndex === 2 ? 'text-red-500' : 'text-zinc-500'
                          }`}
                        >
                          AMBAS
                        </Text>
                      </Pressable>
                    </View>
                  </>
                )}

                {/* Times - Multiple Time Pickers */}
                {isPreWorkout || isPostWorkout ? (
                  <>
                    {!showAdditionalTimes ? (
                      <Pressable
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          setShowAdditionalTimes(true);
                          setTimes(['08:00']);
                        }}
                        className="flex-row items-center justify-center gap-2 py-3 border border-dashed border-purple-500/30 rounded-xl mb-4 active:bg-purple-500/10"
                      >
                        <Plus size={16} color="#A855F7" />
                        <Text className="text-purple-400 font-bold text-sm">
                          AGREGAR HORARIO ADICIONAL
                        </Text>
                      </Pressable>
                    ) : (
                      <>
                        <Text className="text-zinc-500 text-xs mb-2 font-bold uppercase">
                          Horarios adicionales ({times.length})
                        </Text>
                        <View className="gap-3 mb-2">
                          {times.map((t, index) => (
                            <InlineTimePicker
                              key={index}
                              time={t}
                              onTimeChange={(newTime) => updateTime(index, newTime)}
                              label={times.length > 1 ? `Toma ${index + 1}` : undefined}
                              showRemove={true}
                              onRemove={() => {
                                if (times.length <= 1) {
                                  setShowAdditionalTimes(false);
                                  setTimes(['08:00']);
                                } else {
                                  removeTime(index);
                                }
                              }}
                            />
                          ))}
                        </View>
                        <Pressable
                          onPress={addTime}
                          className="flex-row items-center justify-center gap-2 py-3 border border-dashed border-purple-500/50 rounded-xl mb-4 active:bg-purple-500/10"
                        >
                          <Plus size={16} color="#A855F7" />
                          <Text className="text-purple-400 font-bold text-sm">AGREGAR HORARIO</Text>
                        </Pressable>
                      </>
                    )}
                  </>
                ) : (
                  <>
                    <Text className="text-zinc-500 text-xs mb-2 font-bold uppercase">
                      Horarios de toma ({times.length})
                    </Text>
                    <View className="gap-3 mb-2">
                      {times.map((t, index) => (
                        <InlineTimePicker
                          key={index}
                          time={t}
                          onTimeChange={(newTime) => updateTime(index, newTime)}
                          label={times.length > 1 ? `Toma ${index + 1}` : undefined}
                          showRemove={times.length > 1}
                          onRemove={() => removeTime(index)}
                        />
                      ))}
                    </View>
                    <Pressable
                      onPress={addTime}
                      className="flex-row items-center justify-center gap-2 py-3 border border-dashed border-purple-500/50 rounded-xl mb-4 active:bg-purple-500/10"
                    >
                      <Plus size={16} color="#A855F7" />
                      <Text className="text-purple-400 font-bold text-sm">AGREGAR HORARIO</Text>
                    </Pressable>
                  </>
                )}

                {/* Notes */}
                <Text className="text-zinc-500 text-xs mb-2 font-bold uppercase">Notas</Text>
                <TextInput
                  value={notes}
                  onChangeText={setNotes}
                  placeholder="Notas (ej. Con estómago vacío)"
                  placeholderTextColor="#666"
                  className="bg-black/40 border border-white/10 rounded-lg p-3 text-white mb-6"
                  multiline
                />

                {/* Action Buttons */}
                <View
                  className="flex-row gap-3"
                  style={{ marginBottom: Math.max(insets.bottom, 16) + 8 }}
                >
                  <Pressable
                    onPress={() => {
                      resetForm();
                      setViewMode('list');
                    }}
                    className="flex-1 py-4 rounded-xl border border-zinc-700"
                  >
                    <Text className="text-zinc-400 font-bold text-center">CANCELAR</Text>
                  </Pressable>
                  <Pressable
                    onPress={handleAddItem}
                    className="flex-1 bg-purple-600 py-4 rounded-xl active:bg-purple-500"
                    style={{
                      shadowColor: '#A855F7',
                      shadowOffset: { width: 0, height: 4 },
                      shadowOpacity: 0.4,
                      shadowRadius: 8,
                      elevation: 5,
                    }}
                  >
                    <Text className="text-white font-bold text-center">GUARDAR</Text>
                  </Pressable>
                </View>
              </ScrollView>
            )}
          </Animated.View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

export default StackManagerModal;
