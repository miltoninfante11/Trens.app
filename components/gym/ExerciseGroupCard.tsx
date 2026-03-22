// ============================================================================
// EXERCISE GROUP CARD - Visualización de grupos (Super Series, Circuitos)
// Se usa en el modal de ESTRUCTURA para mostrar ejercicios agrupados
// ============================================================================

import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Image } from 'expo-image';
import { X, Link2, RotateCcw, Timer, GripVertical } from 'lucide-react-native';
import { ExerciseGroup, GROUP_TYPE_CONFIG } from '../../types/exerciseGroups';

// ============================================================================
// TYPES
// ============================================================================

interface SeriesConfig {
  id?: string;
  type: string;
  reps: number | string;
  weight?: number | string;
}

interface GroupExercise {
  id: string; // user_exercise_config.id
  name: string;
  image_url: string;
  series?: SeriesConfig[];
}

interface ExerciseGroupCardProps {
  group: ExerciseGroup;
  exercises: GroupExercise[];
  onRemoveGroup: () => void;
  onEditExercise: (exerciseId: string) => void;
  onRemoveExerciseFromGroup: (exerciseId: string) => void;
}

// ============================================================================
// SERIES TYPE COLORS
// ============================================================================
const TYPE_COLORS: Record<string, { bg: string; border: string; text: string; label: string }> = {
  CALENTAMIENTO: { bg: '#1e3a5f', border: '#3b82f6', text: '#60a5fa', label: 'C' },
  APROXIMACION: { bg: '#422006', border: '#f59e0b', text: '#fbbf24', label: 'A' },
  EFECTIVA: { bg: '#052e16', border: '#22c55e', text: '#4ade80', label: 'E' },
  FALLO: { bg: '#450a0a', border: '#ef4444', text: '#f87171', label: 'F' },
};

// ============================================================================
// MINI EXERCISE ROW - Ejercicio dentro del grupo
// ============================================================================
const GroupExerciseRow: React.FC<{
  exercise: GroupExercise;
  groupColor: string;
  isLast: boolean;
  restBetween: number;
  onEdit: () => void;
}> = ({ exercise, groupColor, isLast, restBetween, onEdit }) => {
  const series = exercise.series || [];

  return (
    <>
      <TouchableOpacity
        onPress={onEdit}
        className="flex-row items-center p-2.5 rounded-xl"
        style={{
          backgroundColor: '#0a0a0a',
          borderWidth: 1,
          borderColor: '#1a1a1a',
        }}
      >
        {/* Drag handle (visual, no funcional aquí) */}
        <View className="mr-1.5 opacity-20">
          <GripVertical size={14} color="#71717a" />
        </View>

        {/* Exercise image */}
        <Image
          source={{ uri: exercise.image_url }}
          className="w-10 h-10 rounded-lg mr-2.5"
          contentFit="cover"
          style={{ borderWidth: 1, borderColor: '#27272a' }}
        />

        {/* Exercise info */}
        <View className="flex-1">
          <Text className="text-white font-bold text-xs mb-0.5" numberOfLines={1}>
            {exercise.name}
          </Text>

          {/* Series pills */}
          {series.length > 0 ? (
            <View className="flex-row flex-wrap gap-0.5">
              {series.slice(0, 6).map((s, idx) => {
                const config = TYPE_COLORS[s.type] || TYPE_COLORS.EFECTIVA;
                return (
                  <View
                    key={String(idx)}
                    className="rounded px-1 py-px flex-row items-center gap-px"
                    style={{
                      backgroundColor: config.bg,
                      borderWidth: 1,
                      borderColor: config.border,
                    }}
                  >
                    <Text className="text-[7px] font-bold" style={{ color: config.text }}>
                      {config.label}
                    </Text>
                    <Text className="text-white text-[7px] font-mono">{s.reps}</Text>
                  </View>
                );
              })}
              {series.length > 6 && (
                <Text className="text-zinc-600 text-[7px]">+{series.length - 6}</Text>
              )}
            </View>
          ) : (
            <Text className="text-zinc-600 text-[9px]">Sin series</Text>
          )}
        </View>

        <View className="opacity-30">
          <Text className="text-zinc-500 text-sm">›</Text>
        </View>
      </TouchableOpacity>

      {/* Conector entre ejercicios */}
      {!isLast && (
        <View className="flex-row items-center justify-center py-1">
          <View className="w-px h-3" style={{ backgroundColor: groupColor }} />
          {restBetween > 0 ? (
            <View className="flex-row items-center ml-2 gap-1">
              <Timer size={8} color="#71717a" />
              <Text className="text-zinc-600 text-[8px] font-mono">{restBetween}s</Text>
            </View>
          ) : (
            <Text className="text-zinc-600 text-[8px] font-mono ml-2">sin descanso</Text>
          )}
        </View>
      )}
    </>
  );
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================
export const ExerciseGroupCard: React.FC<ExerciseGroupCardProps> = ({
  group,
  exercises,
  onRemoveGroup,
  onEditExercise,
  onRemoveExerciseFromGroup: _onRemoveExerciseFromGroup,
}) => {
  const config = GROUP_TYPE_CONFIG[group.type];

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins === 0) return `${secs}s`;
    return secs === 0 ? `${mins}:00` : `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <View
      className="mb-3 rounded-2xl overflow-hidden"
      style={{
        borderWidth: 1.5,
        borderColor: config.borderColor,
        backgroundColor: '#0d0d0d',
      }}
    >
      {/* Borde lateral de color */}
      <View
        className="absolute left-0 top-0 bottom-0 w-1 rounded-l-2xl"
        style={{ backgroundColor: config.color }}
      />

      {/* Header del grupo */}
      <View
        className="flex-row items-center justify-between px-4 py-2.5"
        style={{ backgroundColor: config.bgColor }}
      >
        <View className="flex-row items-center gap-2">
          <Text className="text-base">{config.icon}</Text>
          <View>
            <Text className="font-bold text-xs tracking-wider" style={{ color: config.color }}>
              {group.name || config.label}
            </Text>
            <Text className="text-zinc-500 text-[9px] font-mono">
              {exercises.length} ejercicios
              {group.rounds ? ` · ${group.rounds} rondas` : ''}
            </Text>
          </View>
        </View>

        {/* Botón desagrupar */}
        <TouchableOpacity
          onPress={onRemoveGroup}
          className="w-7 h-7 rounded-lg items-center justify-center"
          style={{ backgroundColor: 'rgba(255,255,255,0.08)' }}
        >
          <X size={14} color="#71717a" />
        </TouchableOpacity>
      </View>

      {/* Lista de ejercicios dentro del grupo */}
      <View className="px-3 py-2">
        {exercises.map((exercise, idx) => (
          <GroupExerciseRow
            key={exercise.id}
            exercise={exercise}
            groupColor={config.color}
            isLast={idx === exercises.length - 1}
            restBetween={group.rest_between}
            onEdit={() => onEditExercise(exercise.id)}
          />
        ))}
      </View>

      {/* Footer: descanso entre rondas */}
      <View
        className="flex-row items-center justify-between px-4 py-2 border-t"
        style={{ borderTopColor: '#1a1a1a' }}
      >
        <View className="flex-row items-center gap-1.5">
          <RotateCcw size={12} color={config.color} />
          <Text className="text-zinc-500 text-[10px] font-mono">
            Descanso entre rondas: {formatTime(group.rest_after)}
          </Text>
        </View>
        <View className="flex-row items-center gap-1">
          <Link2 size={10} color="#52525b" />
          <Text className="text-zinc-600 text-[9px]">Agrupados</Text>
        </View>
      </View>
    </View>
  );
};
