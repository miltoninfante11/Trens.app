import { useState, useEffect, useCallback } from 'react';
import { Platform } from 'react-native';

/**
 * Hook to detect network connectivity status.
 * Uses expo-network on native and navigator.onLine on web.
 */
export function useNetworkStatus() {
  const [isConnected, setIsConnected] = useState(true);
  const [isChecking, setIsChecking] = useState(true);

  const checkConnection = useCallback(async () => {
    if (Platform.OS === 'web') {
      setIsConnected(typeof navigator !== 'undefined' ? navigator.onLine : true);
      setIsChecking(false);
      return;
    }

    try {
      const Network = await import('expo-network');
      const state = await Network.getNetworkStateAsync();
      setIsConnected(state.isConnected ?? true);
    } catch {
      setIsConnected(true);
    } finally {
      setIsChecking(false);
    }
  }, []);

  useEffect(() => {
    checkConnection();

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const handleOnline = () => setIsConnected(true);
      const handleOffline = () => setIsConnected(false);

      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);

      return () => {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
      };
    }

    // Native: poll every 10 seconds
    const interval = setInterval(checkConnection, 10000);
    return () => clearInterval(interval);
  }, [checkConnection]);

  return { isConnected, isChecking, refresh: checkConnection };
}
