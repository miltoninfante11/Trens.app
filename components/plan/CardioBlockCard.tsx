// ============================================================================
// CARDIO BLOCK CARD - Tarjeta de Bloque de Cardio en Timeline
// Diseño savage con tipo de cardio, actividad, duración e intensidad
// ============================================================================

import React, { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { Haptics } from '../../lib/haptics';
import {
  Clock,
  Flame,
  Zap,
  ChevronDown,
  ChevronUp,
  Droplets,
  Activity,
  Gauge,
  TrendingUp,
} from 'lucide-react-native';
import { useHankTarget } from '../../hooks/useHankTarget';

// ============================================================================
// TYPES
// ============================================================================
export interface CardioBlock {
  id: string;
  user_id: string;
  training_day: number;
  scheduled_time: string;
  cardio_type: 'CUSTOM' | 'LISS' | 'HIIT' | 'STEADY_STATE' | 'SPRINT' | 'TABATA' | 'FARTLEK';
  activity: string;
  duration_minutes: number;
  intensity: string;
  notes: string;
  is_fasted: boolean;
  is_completed: boolean;
  display_order: number;
  target_heart_rate?: number | null;
  speed?: number | null;
  incline?: number | null;
  days_of_week?: number[];
  is_pre_workout?: boolean;
  is_post_workout?: boolean;
  workout_session_index?: number;
}

interface CardioBlockCardProps {
  cardio: CardioBlock;
  cardioLabel: string;
  onTimeChange: (cardioId: string) => void;
  onDelete: (cardioId: string) => void;
  onEdit: (cardioId: string) => void;
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

const getCardioTypeColor = (type: string): string => {
  switch (type) {
    case 'HIIT':
    case 'SPRINT':
    case 'TABATA':
      return '#DC2626'; // Savage Red - alta intensidad
    case 'LISS':
      return '#22C55E'; // Green - baja intensidad
    case 'STEADY_STATE':
      return '#F97316'; // Orange - media
    case 'FARTLEK':
      return '#8B5CF6'; // Purple - variable
    case 'CUSTOM':
      return '#A1A1AA'; // Zinc - custom
    default:
      return '#DC2626';
  }
};

const getCardioTypeIcon = (type: string) => {
  switch (type) {
    case 'HIIT':
    case 'SPRINT':
    case 'TABATA':
      return Zap;
    case 'LISS':
      return Flame;
    case 'FARTLEK':
      return Flame;
    default:
      return Flame;
  }
};

const getIntensityBars = (intensity: string): number => {
  switch (intensity?.toUpperCase()) {
    case 'BAJA':
      return 1;
    case 'MODERADA':
      return 2;
    case 'ALTA':
      return 3;
    case 'MÁXIMA':
      return 4;
    default:
      return 2;
  }
};

// ============================================================================
// COMPONENT
// ============================================================================
export const CardioBlockCard: React.FC<CardioBlockCardProps> = ({
  cardio,
  cardioLabel,
  onTimeChange,
  onDelete,
  onEdit,
  isCompressed = false,
}) => {
  const [expanded, setExpanded] = useState(false);

  const { targetRef, onLayout } = useHankTarget({
    id: `cardio-${cardio.id}`,
    type: 'custom',
    label: cardioLabel,
  });

  const typeColor = getCardioTypeColor(cardio.cardio_type);
  const TypeIcon = getCardioTypeIcon(cardio.cardio_type);
  const intensityBars = getIntensityBars(cardio.intensity);
  const isPrePost = cardio.is_pre_workout || cardio.is_post_workout;
  const displayTime = isPrePost ? null : formatTimeToAMPM(cardio.scheduled_time);

  // ============================================================================
  // COMPRESSED MODE
  // ============================================================================
  if (isCompressed) {
    return (
      <View className="mb-3 ml-6 relative">
        <View
          className="absolute -left-[14px] top-4 w-3.5 h-3.5 rounded-full border-2 border-zinc-900"
          style={{
            backgroundColor: typeColor,
            shadowColor: typeColor,
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
            borderColor: `${typeColor}40`,
          }}
        >
          <View className="flex-1 mr-3">
            <Text className="text-white text-sm font-bold uppercase tracking-wide">
              {cardioLabel}
            </Text>
            <Text className="text-zinc-400 text-xs mt-0.5" numberOfLines={1}>
              {cardio.activity} · {cardio.duration_minutes} min
              {cardio.speed ? ` · ${cardio.speed} km/h` : ''}
              {cardio.incline ? ` · ${cardio.incline}%` : ''}
            </Text>
          </View>
          {displayTime && (
            <View className="px-3 py-1.5 rounded-lg" style={{ backgroundColor: `${typeColor}30` }}>
              <Text style={{ color: typeColor }} className="text-xs font-bold font-mono">
                {displayTime}
              </Text>
            </View>
          )}
        </View>
      </View>
    );
  }

  // ============================================================================
  // FULL RENDER
  // ============================================================================
  return (
    <Pressable
      ref={targetRef}
      onLayout={onLayout}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onEdit(cardio.id);
      }}
      onLongPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        onDelete(cardio.id);
      }}
      className="mb-4 ml-6 relative"
    >
      {/* Timeline dot */}
      <View
        className="absolute -left-[14px] top-5 w-3.5 h-3.5 rounded-full border-2 border-zinc-900"
        style={{
          backgroundColor: typeColor,
          shadowColor: typeColor,
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: 0.8,
          shadowRadius: 6,
        }}
      />

      {/* Card */}
      <View
        className="rounded-2xl overflow-hidden"
        style={{
          backgroundColor: 'rgba(24, 24, 27, 0.95)',
          borderWidth: 1,
          borderColor: `${typeColor}35`,
          shadowColor: typeColor,
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.15,
          shadowRadius: 16,
        }}
      >
        {/* Header */}
        <View className="px-4 pt-4 pb-3">
          <View className="flex-row items-center justify-between mb-3">
            {/* Left: Type badge + label */}
            <View className="flex-row items-center gap-2 flex-1">
              <View
                className="w-8 h-8 rounded-lg items-center justify-center"
                style={{ backgroundColor: `${typeColor}20` }}
              >
                <TypeIcon size={16} color={typeColor} />
              </View>
              <View className="flex-1">
                <Text className="text-white text-sm font-bold uppercase tracking-wide">
                  {cardioLabel}
                </Text>
                <View className="flex-row items-center gap-1.5 mt-0.5">
                  <Text className="text-zinc-500 text-[10px] font-mono">{cardio.cardio_type}</Text>
                  {cardio.is_pre_workout && (
                    <View
                      className="px-1.5 py-0.5 rounded"
                      style={{ backgroundColor: 'rgba(234, 179, 8, 0.15)' }}
                    >
                      <Text className="text-yellow-500 text-[8px] font-bold">PRE</Text>
                    </View>
                  )}
                  {cardio.is_post_workout && (
                    <View
                      className="px-1.5 py-0.5 rounded"
                      style={{ backgroundColor: 'rgba(34, 197, 94, 0.15)' }}
                    >
                      <Text className="text-green-500 text-[8px] font-bold">POST</Text>
                    </View>
                  )}
                </View>
              </View>
            </View>

            {/* Right: Time or PRE/POST label */}
            {isPrePost ? (
              <View
                className="flex-row items-center gap-1.5 px-3 py-1.5 rounded-lg"
                style={{
                  backgroundColor: cardio.is_pre_workout
                    ? 'rgba(234, 179, 8, 0.15)'
                    : 'rgba(34, 197, 94, 0.15)',
                }}
              >
                {cardio.is_pre_workout ? (
                  <Zap size={12} color="#EAB308" />
                ) : (
                  <Flame size={12} color="#22C55E" />
                )}
                <Text
                  style={{ color: cardio.is_pre_workout ? '#EAB308' : '#22C55E' }}
                  className="text-xs font-bold"
                >
                  {cardio.is_pre_workout ? 'PRE' : 'POST'}
                </Text>
              </View>
            ) : (
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  onTimeChange(cardio.id);
                }}
                className="flex-row items-center gap-1.5 px-3 py-1.5 rounded-lg"
                style={{ backgroundColor: `${typeColor}15` }}
              >
                <Clock size={12} color={typeColor} />
                <Text style={{ color: typeColor }} className="text-xs font-bold font-mono">
                  {displayTime}
                </Text>
              </Pressable>
            )}
          </View>

          {/* Activity + Duration + Intensity row */}
          <View className="flex-row items-center gap-3">
            {/* Activity */}
            <View
              className="flex-row items-center gap-1.5 px-3 py-2 rounded-lg flex-1"
              style={{ backgroundColor: 'rgba(39, 39, 42, 0.6)' }}
            >
              <Flame size={14} color="#A1A1AA" />
              <Text className="text-white text-xs font-bold" numberOfLines={1}>
                {cardio.activity}
              </Text>
            </View>

            {/* Duration */}
            <View
              className="flex-row items-center gap-1.5 px-3 py-2 rounded-lg"
              style={{ backgroundColor: 'rgba(39, 39, 42, 0.6)' }}
            >
              <Clock size={14} color="#A1A1AA" />
              <Text className="text-white text-xs font-bold font-mono">
                {cardio.duration_minutes}m
              </Text>
            </View>

            {/* Intensity bars */}
            <View
              className="flex-row items-center gap-1 px-3 py-2 rounded-lg"
              style={{ backgroundColor: 'rgba(39, 39, 42, 0.6)' }}
            >
              {[1, 2, 3, 4].map((bar) => (
                <View
                  key={bar}
                  style={{
                    width: 4,
                    height: 8 + bar * 3,
                    borderRadius: 2,
                    backgroundColor: bar <= intensityBars ? typeColor : '#3f3f46',
                  }}
                />
              ))}
            </View>
          </View>

          {/* HR / Speed / Incline badges */}
          {(cardio.target_heart_rate || cardio.speed || cardio.incline) && (
            <View className="flex-row items-center gap-2 mt-2 flex-wrap">
              {cardio.target_heart_rate ? (
                <View
                  className="flex-row items-center gap-1 px-2 py-1 rounded-md"
                  style={{ backgroundColor: 'rgba(220, 38, 38, 0.12)' }}
                >
                  <Activity size={10} color="#DC2626" />
                  <Text className="text-savage-red text-[10px] font-bold font-mono">
                    {cardio.target_heart_rate} BPM
                  </Text>
                </View>
              ) : null}
              {cardio.speed ? (
                <View
                  className="flex-row items-center gap-1 px-2 py-1 rounded-md"
                  style={{ backgroundColor: 'rgba(59, 130, 246, 0.12)' }}
                >
                  <Gauge size={10} color="#3B82F6" />
                  <Text className="text-blue-500 text-[10px] font-bold font-mono">
                    {cardio.speed} km/h
                  </Text>
                </View>
              ) : null}
              {cardio.incline ? (
                <View
                  className="flex-row items-center gap-1 px-2 py-1 rounded-md"
                  style={{ backgroundColor: 'rgba(245, 158, 11, 0.12)' }}
                >
                  <TrendingUp size={10} color="#F59E0B" />
                  <Text className="text-amber-500 text-[10px] font-bold font-mono">
                    {cardio.incline}%
                  </Text>
                </View>
              ) : null}
            </View>
          )}

          {/* Fasted badge */}
          {cardio.is_fasted && (
            <View className="flex-row items-center gap-1.5 mt-2">
              <Droplets size={12} color="#22C55E" />
              <Text className="text-green-500 text-[10px] font-bold uppercase tracking-wider">
                EN AYUNAS
              </Text>
            </View>
          )}

          {/* Notes (expandable) */}
          {cardio.notes ? (
            <Pressable
              onPress={() => setExpanded(!expanded)}
              className="flex-row items-center gap-1 mt-2"
            >
              <Text
                className="text-zinc-500 text-[10px] font-mono flex-1"
                numberOfLines={expanded ? undefined : 2}
              >
                {cardio.notes}
              </Text>
              {expanded ? (
                <ChevronUp size={12} color="#71717a" />
              ) : (
                <ChevronDown size={12} color="#71717a" />
              )}
            </Pressable>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
};

export default CardioBlockCard;
