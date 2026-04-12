import React from 'react';
import { View, Text } from 'react-native';
import { WifiOff } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';

/**
 * Banner that shows at the top of the screen when the device is offline.
 * Automatically hides when connectivity is restored.
 */
export function OfflineBanner() {
  const { isConnected, isChecking } = useNetworkStatus();
  const insets = useSafeAreaInsets();

  if (isChecking || isConnected) return null;

  return (
    <View
      className="bg-red-900/95 flex-row items-center justify-center gap-2 py-2 px-4"
      style={{ paddingTop: Math.max(insets.top, 4) }}
    >
      <WifiOff size={14} color="#FCA5A5" />
      <Text className="text-red-200 text-xs font-bold tracking-wider">SIN CONEXIÓN</Text>
    </View>
  );
}
