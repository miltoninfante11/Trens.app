// ============================================================================
// STACK CARD - Tarjeta de Suplementos/Fármacos
// PREMIUM SAVAGE EDITION - Compacta y expandible con hora editable
// ============================================================================

import React, { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  interpolate,
} from 'react-native-reanimated';
import { Haptics } from '../../lib/haptics';
import {
  Pill,
  Syringe,
  Droplets,
  FlaskConical,
  Zap,
  Clock,
  ChevronDown,
} from 'lucide-react-native';
import { useHankTarget } from '../../hooks/useHankTarget';
import { HankInlineHighlight } from '../hank/HankInlineHighlight';

// ============================================================================
// TYPES
// ============================================================================
interface StackItem {
  id: string;
  name: string;
  dose: string;
  type: 'pill' | 'syringe' | 'powder' | 'liquid';
  notes?: string;
}

interface Stack {
  id: string;
  time: string;
  items: StackItem[];
}

interface StackCardProps {
  stack: Stack;
  onTimeChange?: (stackTime: string) => void;
  onItemDelete?: (itemId: string) => void;
  isCompressed?: boolean;
}

// ============================================================================
// HELPERS
// ============================================================================
const getTypeIcon = (type: string, size = 14) => {
  const iconProps = { size, color: '#A855F7' };
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

// ============================================================================
// COMPONENT - PREMIUM SAVAGE EDITION
// ============================================================================
export const StackCard: React.FC<StackCardProps> = ({
  stack,
  onTimeChange,
  onItemDelete,
  isCompressed = false,
}) => {
  const [expanded, setExpanded] = useState(false);
  const expandProgress = useSharedValue(0);

  // Hank Target - Registrar este stack como target para animaciones
  const { targetRef, onLayout, isHighlighted, animationPhase } = useHankTarget({
    id: `stack-${stack.id}`,
    type: 'custom',
    label: `Stack ${formatTimeToAMPM(stack.time)}`,
  });

  const toggleExpand = () => {
    if (isCompressed) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const newState = !expanded;
    setExpanded(newState);
    expandProgress.value = withTiming(newState ? 1 : 0, { duration: 250 });
  };

  const handleTimePress = () => {
    if (isCompressed) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (onTimeChange) {
      onTimeChange(stack.time);
    }
  };

  const expandedStyle = useAnimatedStyle(() => ({
    // Altura dinámica: 72px por item (p-3 + gap + contenido) + 32px padding contenedor
    height: interpolate(expandProgress.value, [0, 1], [0, stack.items.length * 72 + 32]),
    opacity: expandProgress.value,
  }));

  const chevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${interpolate(expandProgress.value, [0, 1], [0, 180])}deg` }],
  }));

  // ============================================================================
  // MODO COMPRIMIDO - Premium style
  // ============================================================================
  if (isCompressed) {
    const itemNames = stack.items.map((i) => i.name).join(', ');
    return (
      <View className="mb-3 ml-6 relative">
        {/* Timeline dot */}
        <View
          className="absolute -left-[14px] top-4 w-3.5 h-3.5 rounded-full border-2 border-zinc-900"
          style={{
            backgroundColor: '#A855F7',
            shadowColor: '#A855F7',
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
            borderColor: 'rgba(168, 85, 247, 0.35)',
          }}
        >
          <View className="flex-1 mr-3">
            <View className="flex-row items-center gap-2">
              <Pill size={12} color="#A855F7" />
              <Text className="text-purple-300 text-xs font-bold tracking-wider">STACK</Text>
            </View>
            <Text className="text-zinc-400 text-xs mt-1" numberOfLines={1}>
              {itemNames || 'Sin items'}
            </Text>
          </View>
          <View
            className="px-3 py-1.5 rounded-lg"
            style={{ backgroundColor: 'rgba(168, 85, 247, 0.2)' }}
          >
            <Text className="text-purple-300 text-xs font-bold font-mono">
              {formatTimeToAMPM(stack.time)}
            </Text>
          </View>
        </View>
      </View>
    );
  }

  // ============================================================================
  // RENDER FULL - PREMIUM SAVAGE EDITION
  // ============================================================================
  return (
    <View ref={targetRef} onLayout={onLayout} className="mb-6 ml-6 relative">
      {/* Hank Inline Highlight */}
      <HankInlineHighlight isActive={isHighlighted} phase={animationPhase} borderRadius={16} />

      {/* Timeline marker - Premium glow */}
      <View
        className="absolute -left-[14px] top-4 w-3.5 h-3.5 rounded-full border-2 border-zinc-900 z-10"
        style={{
          backgroundColor: '#A855F7',
          shadowColor: '#A855F7',
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: 0.9,
          shadowRadius: 8,
        }}
      />

      <Pressable onPress={toggleExpand} className="active:scale-[0.99]">
        <View
          className="rounded-2xl overflow-hidden"
          style={{
            backgroundColor: 'rgba(24, 24, 27, 0.95)',
            borderWidth: 1,
            borderColor: 'rgba(168, 85, 247, 0.25)',
            shadowColor: '#A855F7',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.12,
            shadowRadius: 16,
          }}
        >
          {/* Header */}
          <View
            className="p-4"
            style={{
              backgroundColor: 'rgba(39, 39, 42, 0.6)',
              borderBottomWidth: expanded ? 1 : 0,
              borderBottomColor: 'rgba(168, 85, 247, 0.2)',
            }}
          >
            <View className="flex-row justify-between items-center">
              {/* Left: Icon + Title */}
              <View className="flex-row items-center gap-3">
                <View
                  className="w-10 h-10 rounded-xl items-center justify-center"
                  style={{ backgroundColor: 'rgba(168, 85, 247, 0.15)' }}
                >
                  <Pill size={18} color="#A855F7" />
                </View>
                <View>
                  <Text className="text-white font-bold text-sm tracking-wide">STACK</Text>
                  <Text className="text-zinc-400 text-[10px] font-mono">
                    {stack.items.length} SUPLEMENTO{stack.items.length !== 1 ? 'S' : ''}
                  </Text>
                </View>
              </View>

              {/* Right: Time + Chevron */}
              <View className="flex-row items-center gap-2">
                {onTimeChange ? (
                  <Pressable
                    onPress={handleTimePress}
                    className="flex-row items-center gap-1.5 px-3 py-2 rounded-xl active:scale-95"
                    style={{
                      backgroundColor: 'rgba(168, 85, 247, 0.15)',
                      borderWidth: 1,
                      borderColor: 'rgba(168, 85, 247, 0.35)',
                    }}
                  >
                    <Clock size={12} color="#A855F7" />
                    <Text className="text-purple-300 text-xs font-mono font-bold">
                      {formatTimeToAMPM(stack.time)}
                    </Text>
                  </Pressable>
                ) : (
                  <View
                    className="flex-row items-center gap-1.5 px-3 py-2 rounded-xl"
                    style={{
                      backgroundColor: 'rgba(168, 85, 247, 0.1)',
                      borderWidth: 1,
                      borderColor: 'rgba(168, 85, 247, 0.2)',
                    }}
                  >
                    <Clock size={12} color="#7C3AED" />
                    <Text className="text-purple-400/70 text-xs font-mono font-bold">
                      {formatTimeToAMPM(stack.time)}
                    </Text>
                  </View>
                )}
                <Animated.View style={chevronStyle}>
                  <ChevronDown size={16} color="#A855F7" />
                </Animated.View>
              </View>
            </View>

            {/* Collapsed Preview - Show items inline */}
            {!expanded && stack.items.length > 0 && (
              <View className="flex-row flex-wrap gap-2 mt-3">
                {stack.items.slice(0, 4).map((item) => (
                  <View
                    key={item.id}
                    className="flex-row items-center gap-1.5 px-2 py-1.5 rounded-lg shrink-0"
                    style={{ backgroundColor: 'rgba(168, 85, 247, 0.12)' }}
                  >
                    {getTypeIcon(item.type, 12)}
                    <View>
                      <Text className="text-zinc-300 text-[11px]" numberOfLines={1}>
                        {item.name}
                      </Text>
                      <Text className="text-purple-400 text-[9px] font-mono">{item.dose}</Text>
                    </View>
                  </View>
                ))}
                {stack.items.length > 4 && (
                  <View
                    className="px-2 py-1 rounded-lg shrink-0"
                    style={{ backgroundColor: 'rgba(168, 85, 247, 0.12)' }}
                  >
                    <Text className="text-purple-300 text-[11px]">+{stack.items.length - 4}</Text>
                  </View>
                )}
              </View>
            )}
          </View>

          {/* Expanded View (Details) - Premium */}
          <Animated.View style={expandedStyle} className="overflow-hidden">
            <View className="p-4 pt-2">
              {stack.items.map((item, idx) => (
                <View
                  key={item.id}
                  className="flex-row justify-between items-center py-3"
                  style={{
                    borderBottomWidth: idx < stack.items.length - 1 ? 1 : 0,
                    borderBottomColor: 'rgba(168, 85, 247, 0.1)',
                  }}
                >
                  <View className="flex-row items-center gap-3 flex-1">
                    <View
                      className="w-8 h-8 rounded-lg items-center justify-center"
                      style={{ backgroundColor: 'rgba(168, 85, 247, 0.15)' }}
                    >
                      {getTypeIcon(item.type, 16)}
                    </View>
                    <View className="flex-1">
                      <Text className="text-white text-sm font-medium">{item.name}</Text>
                      <Text className="text-purple-200 font-mono text-[11px] mt-0.5">
                        {item.dose}
                      </Text>
                      {item.notes && (
                        <Text className="text-purple-300/70 text-[10px] mt-0.5">{item.notes}</Text>
                      )}
                    </View>
                  </View>
                </View>
              ))}
            </View>
          </Animated.View>
        </View>
      </Pressable>
    </View>
  );
};

export default StackCard;
