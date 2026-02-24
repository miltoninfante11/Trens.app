// ============================================================================
// INSTAGRAM CONNECT BUTTON
// Botón agresivo/élite para vincular cuenta de Instagram desde el módulo ADN
// ============================================================================

import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Instagram, Unlink, RefreshCw, AlertTriangle, Zap } from 'lucide-react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  Easing,
} from 'react-native-reanimated';
import { Alert } from '../../lib/alert';
import * as Haptics from '../../lib/haptics';
import instagram from '../../services/instagram/instagram';
import type { InstagramConnectionStatus } from '../../types/instagram';

const AnimatedTouchable = Animated.createAnimatedComponent(TouchableOpacity);

// ============================================================================
// PROPS
// ============================================================================

interface InstagramConnectButtonProps {
  /** Callback cuando se conecta/desconecta exitosamente */
  onStatusChange?: (connected: boolean) => void;
  /** Estilo compacto para uso inline */
  compact?: boolean;
}

// ============================================================================
// COMPONENT
// ============================================================================

export default function InstagramConnectButton({
  onStatusChange,
  compact = false,
}: InstagramConnectButtonProps) {
  const [status, setStatus] = useState<InstagramConnectionStatus>({
    connected: false,
    username: null,
    expiresAt: null,
    isExpiringSoon: false,
  });
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  // Animación del glow pulsante
  const glowPulse = useSharedValue(0);

  useEffect(() => {
    // Glow pulsante infinito para el estado desconectado
    glowPulse.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: 1200, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );
  }, []);

  const glowStyle = useAnimatedStyle(() => ({
    shadowOpacity: 0.3 + glowPulse.value * 0.5,
    shadowRadius: 8 + glowPulse.value * 12,
  }));

  // --------------------------------------------------------------------------
  // LOAD STATUS
  // --------------------------------------------------------------------------

  const loadStatus = useCallback(async () => {
    try {
      setLoading(true);
      const connectionStatus = await instagram.getConnectionStatus();
      setStatus(connectionStatus);
    } catch (error) {
      console.error('[InstagramConnect] Error loading status:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  // --------------------------------------------------------------------------
  // ACTIONS
  // --------------------------------------------------------------------------

  const handleConnect = async () => {
    Haptics.impactAsync();
    try {
      await instagram.startOAuthFlow('/(tabs)/adn');
    } catch (error: any) {
      Alert.alert('Error', error.message || 'No se pudo iniciar la conexión');
    }
  };

  const handleDisconnect = async () => {
    Haptics.impactAsync();
    Alert.alert(
      'Desvincular Instagram',
      `¿Deseas desvincular @${status.username}? Tus Reels sincronizados se ocultarán del feed.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Desvincular',
          style: 'destructive',
          onPress: async () => {
            setLoading(true);
            const success = await instagram.disconnect();
            if (success) {
              setStatus({
                connected: false,
                username: null,
                expiresAt: null,
                isExpiringSoon: false,
              });
              onStatusChange?.(false);
              Haptics.notificationAsync();
            } else {
              Alert.alert('Error', 'No se pudo desvincular la cuenta');
            }
            setLoading(false);
          },
        },
      ]
    );
  };

  const handleSyncReels = async () => {
    Haptics.impactAsync();
    setSyncing(true);
    try {
      const result = await instagram.syncMyReels({ hashtagFilter: '#trens' });
      if (result.success) {
        Haptics.notificationAsync();
        Alert.alert(
          'Sincronización completa',
          `${result.synced} Reels sincronizados${result.skipped > 0 ? `, ${result.skipped} omitidos` : ''}`
        );
      } else {
        Alert.alert('Error', result.errors[0] || 'Error al sincronizar');
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Error desconocido');
    } finally {
      setSyncing(false);
    }
  };

  // --------------------------------------------------------------------------
  // LOADING STATE
  // --------------------------------------------------------------------------

  if (loading) {
    return (
      <View className={`${compact ? 'py-2' : 'py-4'} items-center`}>
        <ActivityIndicator size="small" color="#DC2626" />
      </View>
    );
  }

  // --------------------------------------------------------------------------
  // CONNECTED STATE
  // --------------------------------------------------------------------------

  if (status.connected) {
    return (
      <View className="bg-zinc-900/80 rounded-2xl border border-zinc-800 overflow-hidden">
        {/* Header con estado */}
        <View className="flex-row items-center justify-between px-4 py-3">
          <View className="flex-row items-center flex-1">
            <View
              className="w-8 h-8 rounded-full bg-gradient-to-br items-center justify-center mr-3"
              style={{ backgroundColor: '#E1306C' }}
            >
              <Instagram size={16} color="#fff" />
            </View>
            <View className="flex-1">
              <Text className="text-white font-bold text-sm">@{status.username}</Text>
              <Text className="text-zinc-500 text-xs font-mono">
                {status.isExpiringSoon ? '⚠️ Token expira pronto' : '● Vinculado'}
              </Text>
            </View>
          </View>

          {/* Acciones */}
          <View className="flex-row items-center gap-2">
            {/* Sync Button */}
            <TouchableOpacity
              onPress={handleSyncReels}
              disabled={syncing}
              className="bg-red-600/20 rounded-xl px-3 py-2 flex-row items-center"
              activeOpacity={0.7}
            >
              {syncing ? (
                <ActivityIndicator size="small" color="#DC2626" />
              ) : (
                <RefreshCw size={14} color="#DC2626" />
              )}
              <Text className="text-red-500 text-xs font-bold ml-1.5">
                {syncing ? 'SYNC...' : 'SYNC'}
              </Text>
            </TouchableOpacity>

            {/* Disconnect */}
            <TouchableOpacity
              onPress={handleDisconnect}
              className="bg-zinc-800 rounded-xl p-2"
              activeOpacity={0.7}
            >
              <Unlink size={14} color="#71717A" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Warning si el token expira pronto */}
        {status.isExpiringSoon && (
          <View className="flex-row items-center px-4 py-2 bg-amber-500/10 border-t border-amber-500/20">
            <AlertTriangle size={12} color="#F59E0B" />
            <Text className="text-amber-500 text-xs ml-2 flex-1">
              Tu token expira pronto. Reconecta para mantener la sincronización.
            </Text>
            <TouchableOpacity onPress={handleConnect}>
              <Text className="text-amber-400 text-xs font-bold">RENOVAR</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  }

  // --------------------------------------------------------------------------
  // DISCONNECTED STATE — Botón agresivo de conexión
  // --------------------------------------------------------------------------

  if (compact) {
    return (
      <TouchableOpacity
        onPress={handleConnect}
        className="flex-row items-center bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3"
        activeOpacity={0.7}
      >
        <Instagram size={18} color="#DC2626" />
        <Text className="text-white font-bold text-sm ml-2">Vincular Instagram</Text>
      </TouchableOpacity>
    );
  }

  return (
    <AnimatedTouchable
      onPress={handleConnect}
      activeOpacity={0.8}
      style={[
        {
          shadowColor: '#DC2626',
          shadowOffset: { width: 0, height: 0 },
          elevation: 10,
        },
        glowStyle,
      ]}
      className="rounded-2xl overflow-hidden"
    >
      {/* Fondo gradiente con bordes fire */}
      <View
        className="border border-red-600/40 rounded-2xl"
        style={{
          backgroundColor: '#0A0A0A',
        }}
      >
        <View className="px-5 py-5">
          {/* Icono + Título */}
          <View className="flex-row items-center mb-3">
            <View
              className="w-10 h-10 rounded-xl items-center justify-center mr-3"
              style={{
                backgroundColor: 'rgba(220, 38, 38, 0.15)',
                borderWidth: 1,
                borderColor: 'rgba(220, 38, 38, 0.3)',
              }}
            >
              <Instagram size={20} color="#DC2626" />
            </View>
            <View className="flex-1">
              <Text className="text-white font-bold text-base">Conectar Instagram</Text>
              <Text className="text-zinc-500 text-xs">Sincroniza tus Reels al feed TRENS</Text>
            </View>
            <Zap size={16} color="#DC2626" />
          </View>

          {/* CTA */}
          <View
            className="rounded-xl py-3 items-center flex-row justify-center"
            style={{
              backgroundColor: '#DC2626',
            }}
          >
            <Instagram size={16} color="#fff" />
            <Text className="text-white font-bold text-sm ml-2 tracking-wider">
              VINCULAR CUENTA
            </Text>
          </View>

          {/* Disclaimer */}
          <Text className="text-zinc-600 text-[10px] text-center mt-2">
            Solo accedemos a tus Reels públicos • Puedes desvincular cuando quieras
          </Text>
        </View>
      </View>
    </AnimatedTouchable>
  );
}
