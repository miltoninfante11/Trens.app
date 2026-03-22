// ============================================================================
// GROUP SELECTION BAR - Barra inferior flotante para crear grupos
// Aparece cuando el usuario selecciona múltiples ejercicios en Structure mode
// ============================================================================

import React from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { Link2, X } from 'lucide-react-native';
import Animated, { SlideInDown } from 'react-native-reanimated';
import { ExerciseGroupType, GROUP_TYPE_CONFIG, inferGroupType } from '../../types/exerciseGroups';
import * as Haptics from '../../lib/haptics';

// ============================================================================
// TYPES
// ============================================================================

interface GroupSelectionBarProps {
  selectedCount: number;
  onCreateGroup: (type: ExerciseGroupType) => void;
  onCancel: () => void;
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================
export const GroupSelectionBar: React.FC<GroupSelectionBarProps> = ({
  selectedCount,
  onCreateGroup,
  onCancel,
}) => {
  // Determinar qué tipos de grupo están disponibles según la cantidad
  const availableTypes: ExerciseGroupType[] = [];

  if (selectedCount === 2) {
    availableTypes.push('SUPERSET');
  }
  if (selectedCount === 3) {
    availableTypes.push('TRISET');
  }
  if (selectedCount >= 2) {
    // Super serie siempre disponible para 2
    if (selectedCount === 2 && !availableTypes.includes('SUPERSET')) {
      availableTypes.push('SUPERSET');
    }
  }
  if (selectedCount >= 4) {
    availableTypes.push('CIRCUIT', 'GIANT_SET');
  }
  // Para 3 ejercicios, también ofrecer circuito
  if (selectedCount === 3 && !availableTypes.includes('CIRCUIT')) {
    availableTypes.push('CIRCUIT');
  }

  // Tipo recomendado
  const recommended = inferGroupType(selectedCount);

  return (
    <Animated.View
      entering={SlideInDown.springify().damping(18)}
      className="absolute bottom-0 left-0 right-0 z-50"
    >
      {/* Fondo con blur simulado */}
      <View
        className="mx-3 mb-4 rounded-2xl overflow-hidden"
        style={{
          backgroundColor: '#0d0d0d',
          borderWidth: 1.5,
          borderColor: '#DC2626',
          shadowColor: '#DC2626',
          shadowOffset: { width: 0, height: -4 },
          shadowOpacity: 0.3,
          shadowRadius: 16,
          elevation: 20,
        }}
      >
        {/* Header */}
        <View className="flex-row items-center justify-between px-4 pt-3 pb-2">
          <View className="flex-row items-center gap-2">
            <Link2 size={16} color="#DC2626" />
            <Text className="text-white font-bold text-sm">
              {selectedCount} ejercicios seleccionados
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onCancel();
            }}
            className="w-8 h-8 rounded-lg items-center justify-center"
            style={{ backgroundColor: 'rgba(255,255,255,0.08)' }}
          >
            <X size={16} color="#71717a" />
          </TouchableOpacity>
        </View>

        {/* Opciones de grupo */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          className="px-3 pb-3"
          contentContainerStyle={{ gap: 8 }}
        >
          {availableTypes.map((type) => {
            const config = GROUP_TYPE_CONFIG[type];
            const isRecommended = type === recommended;

            return (
              <TouchableOpacity
                key={type}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  onCreateGroup(type);
                }}
                className="rounded-xl px-4 py-3 items-center"
                style={{
                  backgroundColor: config.bgColor,
                  borderWidth: isRecommended ? 2 : 1,
                  borderColor: isRecommended ? config.color : `${config.color}50`,
                  minWidth: 100,
                }}
              >
                {isRecommended && (
                  <View
                    className="absolute -top-2 px-2 py-0.5 rounded"
                    style={{ backgroundColor: config.color }}
                  >
                    <Text className="text-white text-[7px] font-bold">IDEAL</Text>
                  </View>
                )}
                <Text className="text-lg mb-1">{config.icon}</Text>
                <Text
                  className="font-bold text-[10px] tracking-wider"
                  style={{ color: config.color }}
                >
                  {config.label}
                </Text>
                <Text className="text-zinc-500 text-[8px] mt-0.5 text-center" numberOfLines={2}>
                  {config.description}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>
    </Animated.View>
  );
};
