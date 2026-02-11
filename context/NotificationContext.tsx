// ============================================================================
// NOTIFICATION CONTEXT - Contexto Global de Notificaciones TRENS
// Maneja notificaciones in-app con estilo premium SAVAGE
// ============================================================================

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  ReactNode,
} from 'react';
import { View, Text, TouchableOpacity, Platform } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withSequence,
  runOnJS,
  Easing,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Bell, Utensils, Dumbbell, Pill, X, ChevronRight, Clock } from 'lucide-react-native';
import * as Haptics from '../lib/haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import notificationScheduler, {
  ScheduledNotification,
  NotificationType,
  NotificationPreferences,
} from '../services/notifications/scheduler';

// ============================================================================
// TYPES
// ============================================================================

interface ActiveNotification extends ScheduledNotification {
  receivedAt: Date;
}

interface NotificationContextType {
  // State
  activeNotification: ActiveNotification | null;
  preferences: NotificationPreferences;

  // Actions
  dismissNotification: () => void;
  updatePreferences: (updates: Partial<NotificationPreferences>) => Promise<void>;
  syncNotifications: (userId: string) => Promise<void>;
  requestPermissions: () => Promise<boolean>;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const NOTIFICATION_ICONS: Record<NotificationType, React.FC<any>> = {
  meal: Utensils,
  workout: Dumbbell,
  supplement: Pill,
  hydration: () => null,
  progress_photo: () => null,
};

const NOTIFICATION_COLORS: Record<NotificationType, { primary: string; secondary: string }> = {
  meal: { primary: '#22C55E', secondary: '#16A34A' }, // Green
  workout: { primary: '#DC2626', secondary: '#B91C1C' }, // Red (Savage)
  supplement: { primary: '#8B5CF6', secondary: '#7C3AED' }, // Purple
  hydration: { primary: '#0EA5E9', secondary: '#0284C7' }, // Blue
  progress_photo: { primary: '#F97316', secondary: '#EA580C' }, // Orange
};

// ============================================================================
// CONTEXT
// ============================================================================

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

// ============================================================================
// IN-APP NOTIFICATION BANNER
// ============================================================================

interface NotificationBannerProps {
  notification: ActiveNotification | null;
  onDismiss: () => void;
  onAction: () => void;
}

const NotificationBanner: React.FC<NotificationBannerProps> = ({
  notification,
  onDismiss,
  onAction,
}) => {
  const insets = useSafeAreaInsets();
  const translateY = useSharedValue(-200);
  const opacity = useSharedValue(0);
  const scale = useSharedValue(0.9);
  const pulseAnim = useSharedValue(1);

  useEffect(() => {
    if (notification) {
      // Entrada dramática
      translateY.value = withSpring(0, { damping: 15, stiffness: 120 });
      opacity.value = withTiming(1, { duration: 200 });
      scale.value = withSpring(1, { damping: 12 });

      // Pulse animation
      pulseAnim.value = withSequence(
        withTiming(1.02, { duration: 200 }),
        withTiming(1, { duration: 200 })
      );

      // Haptic feedback
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);

      // Auto dismiss after 8 seconds
      const timeout = setTimeout(() => {
        handleDismiss();
      }, 8000);

      return () => clearTimeout(timeout);
    } else {
      translateY.value = withTiming(-200, { duration: 200 });
      opacity.value = withTiming(0, { duration: 200 });
    }
  }, [notification, translateY, opacity, scale, pulseAnim]);

  const handleDismiss = useCallback(() => {
    translateY.value = withTiming(-200, { duration: 200, easing: Easing.in(Easing.ease) });
    opacity.value = withTiming(0, { duration: 150 });

    setTimeout(() => {
      runOnJS(onDismiss)();
    }, 200);
  }, [translateY, opacity, onDismiss]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }, { scale: scale.value * pulseAnim.value }],
    opacity: opacity.value,
  }));

  if (!notification) return null;

  const Icon = NOTIFICATION_ICONS[notification.type] || Bell;
  const colors = NOTIFICATION_COLORS[notification.type] || NOTIFICATION_COLORS.meal;

  const getActionLabel = () => {
    switch (notification.type) {
      case 'meal':
        return 'Ver Plan';
      case 'workout':
        return 'Ir a GYM';
      case 'supplement':
        return 'Ver Stack';
      default:
        return 'Ver';
    }
  };

  const handleAction = () => {
    handleDismiss();

    // Navigate based on notification type
    setTimeout(() => {
      switch (notification.type) {
        case 'meal':
        case 'supplement':
          router.push('/(tabs)/plan');
          break;
        case 'workout':
          router.push('/(tabs)/gym');
          break;
      }
    }, 250);

    onAction();
  };

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          top: insets.top + 8,
          left: 12,
          right: 12,
          zIndex: 9999,
        },
        animatedStyle,
      ]}
    >
      <TouchableOpacity activeOpacity={0.95} onPress={handleAction}>
        <View
          style={{
            backgroundColor: '#0a0a0a',
            borderRadius: 16,
            borderWidth: 2,
            borderColor: colors.primary,
            overflow: 'hidden',
            // Shadow
            shadowColor: colors.primary,
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.4,
            shadowRadius: 12,
            elevation: 10,
          }}
        >
          {/* Gradient accent bar */}
          <LinearGradient
            colors={[colors.primary, colors.secondary]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={{ height: 3 }}
          />

          <View className="flex-row items-center p-4">
            {/* Icon */}
            <View
              style={{
                width: 48,
                height: 48,
                borderRadius: 24,
                backgroundColor: `${colors.primary}20`,
                alignItems: 'center',
                justifyContent: 'center',
                borderWidth: 1,
                borderColor: `${colors.primary}50`,
              }}
            >
              <Icon size={24} color={colors.primary} />
            </View>

            {/* Content */}
            <View className="flex-1 ml-3">
              <Text className="text-white font-bold text-base">{notification.title}</Text>
              <Text className="text-zinc-400 text-sm mt-0.5" numberOfLines={2}>
                {notification.body}
              </Text>
            </View>

            {/* Action */}
            <View className="flex-row items-center ml-2">
              <View
                style={{
                  backgroundColor: colors.primary,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  borderRadius: 8,
                  flexDirection: 'row',
                  alignItems: 'center',
                }}
              >
                <Text className="text-white font-bold text-xs">{getActionLabel()}</Text>
                <ChevronRight size={14} color="#FFFFFF" style={{ marginLeft: 2 }} />
              </View>
            </View>

            {/* Dismiss button */}
            <TouchableOpacity
              onPress={(e) => {
                e.stopPropagation();
                handleDismiss();
              }}
              style={{
                position: 'absolute',
                top: 8,
                right: 8,
                width: 24,
                height: 24,
                borderRadius: 12,
                backgroundColor: '#27272a',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <X size={14} color="#71717a" />
            </TouchableOpacity>
          </View>

          {/* Time indicator */}
          <View className="flex-row items-center justify-center pb-2 -mt-1">
            <Clock size={10} color="#52525b" />
            <Text className="text-zinc-600 text-[10px] ml-1 font-mono">
              {notification.scheduledTime}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
};

// ============================================================================
// PROVIDER
// ============================================================================

interface NotificationProviderProps {
  children: ReactNode;
}

export function NotificationProvider({ children }: NotificationProviderProps) {
  const [activeNotification, setActiveNotification] = useState<ActiveNotification | null>(null);
  const [preferences, setPreferences] = useState<NotificationPreferences>(
    notificationScheduler.getPreferences()
  );
  const listenerRef = useRef<(() => void) | null>(null);

  // Initialize scheduler and listen for notifications
  useEffect(() => {
    const init = async () => {
      await notificationScheduler.initialize();
      setPreferences(notificationScheduler.getPreferences());

      // Listen for triggered notifications
      listenerRef.current = notificationScheduler.addListener((notification) => {
        setActiveNotification({
          ...notification,
          receivedAt: new Date(),
        });
      });
    };

    init();

    return () => {
      if (listenerRef.current) {
        listenerRef.current();
      }
      notificationScheduler.stopBackgroundCheck();
    };
  }, []);

  // Dismiss notification
  const dismissNotification = useCallback(() => {
    setActiveNotification(null);
  }, []);

  // Update preferences
  const updatePreferences = useCallback(async (updates: Partial<NotificationPreferences>) => {
    await notificationScheduler.updatePreferences(updates);
    setPreferences(notificationScheduler.getPreferences());
  }, []);

  // Sync notifications with user plan
  const syncNotifications = useCallback(async (userId: string) => {
    await notificationScheduler.syncWithUserPlan(userId);
  }, []);

  // Request permissions (for web)
  const requestPermissions = useCallback(async (): Promise<boolean> => {
    if (Platform.OS === 'web' && typeof window !== 'undefined' && 'Notification' in window) {
      const permission = await Notification.requestPermission();
      return permission === 'granted';
    }
    return true; // Native permissions handled elsewhere
  }, []);

  return (
    <NotificationContext.Provider
      value={{
        activeNotification,
        preferences,
        dismissNotification,
        updatePreferences,
        syncNotifications,
        requestPermissions,
      }}
    >
      {children}

      {/* Global Notification Banner */}
      <NotificationBanner
        notification={activeNotification}
        onDismiss={dismissNotification}
        onAction={() => {}}
      />
    </NotificationContext.Provider>
  );
}

// ============================================================================
// HOOK
// ============================================================================

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
}

// ============================================================================
// EXPORT
// ============================================================================

export default NotificationContext;
