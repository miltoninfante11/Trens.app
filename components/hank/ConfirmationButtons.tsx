import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Check, X } from 'lucide-react-native';

export const ConfirmationButtons: React.FC<{
  onConfirm: () => void;
  onCancel: () => void;
  isLoading: boolean;
}> = React.memo(({ onConfirm, onCancel, isLoading }) => {
  return (
    <View className="flex-row justify-center gap-4 py-4">
      <TouchableOpacity
        onPress={onCancel}
        disabled={isLoading}
        className="flex-row items-center px-6 py-3 bg-zinc-800 rounded-full"
      >
        <X size={20} color="#EF4444" />
        <Text className="text-red-500 font-bold ml-2">CANCELAR</Text>
      </TouchableOpacity>

      <TouchableOpacity
        onPress={onConfirm}
        disabled={isLoading}
        className="flex-row items-center px-6 py-3 bg-red-600 rounded-full"
      >
        <Check size={20} color="#FFFFFF" />
        <Text className="text-white font-bold ml-2">EJECUTAR</Text>
      </TouchableOpacity>
    </View>
  );
});
