// ============================================================================
// NOTIFICATION CONTEXT - Contexto Global de Notificaciones TRENS
// Maneja notificaciones in-app + push notifications nativas
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
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
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
  expoPushToken: string | null;

  // Actions
  dismissNotification: () => void;
  updatePreferences: (updates: Partial<NotificationPreferences>) => Promise<void>;
  syncNotifications: (userId: string) => Promise<void>;
  requestPermissions: () => Promise<boolean>;
  registerForPushNotifications: () => Promise<string | null>;
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
// PUSH NOTIFICATION SETUP (expo-notifications)
// ============================================================================

// Configure notification handler for foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

/**
 * Register for push notifications and get Expo Push Token.
 * Returns the token string or null if failed.
 */
async function registerForPushNotificationsAsync(): Promise<string | null> {
  if (Platform.OS === 'web') return null;

  try {
    // Check existing permissions
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    // Request if not granted
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.warn('\uD83D\uDD14 Push notification permission not granted');
      return null;
    }

    // Get project ID from config
    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    if (!projectId) {
      console.warn('\uD83D\uDD14 No EAS project ID found');
      return null;
    }

    // Get push token
    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
    const token = tokenData.data;
    console.warn('\uD83D\uDD14 Expo Push Token:', token);

    // Android: Setup notification channel
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('trens-default', {
        name: 'TRENS',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#DC2626',
        sound: 'default',
      });
    }

    return token;
  } catch (error) {
    console.error('\uD83D\uDD14 Error registering push notifications:', error);
    return null;
  }
}

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
  const [expoPushToken, setExpoPushToken] = useState<string | null>(null);
  const listenerRef = useRef<(() => void) | null>(null);
  const notificationResponseRef = useRef<Notifications.EventSubscription | null>(null);
  const notificationReceivedRef = useRef<Notifications.EventSubscription | null>(null);

  // Initialize scheduler, push notifications, and listen for notifications
  useEffect(() => {
    const init = async () => {
      // 1. Initialize local scheduler
      await notificationScheduler.initialize();
      setPreferences(notificationScheduler.getPreferences());

      // 2. Register for push notifications (native only)
      if (Platform.OS !== 'web') {
        const token = await registerForPushNotificationsAsync();
        if (token) setExpoPushToken(token);
      }

      // 3. Listen for triggered local notifications
      listenerRef.current = notificationScheduler.addListener((notification) => {
        setActiveNotification({
          ...notification,
          receivedAt: new Date(),
        });
      });
    };

    init();

    // 4. Listen for push notification responses (user taps notification)
    notificationResponseRef.current = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const data = response.notification.request.content.data;
        // Navigate based on notification data
        if (data?.route) {
          router.push(data.route as any);
        } else if (data?.type === 'meal' || data?.type === 'supplement') {
          router.push('/(tabs)/plan');
        } else if (data?.type === 'workout') {
          router.push('/(tabs)/gym');
        }
      }
    );

    // 5. Listen for push notifications received while app is in foreground
    notificationReceivedRef.current = Notifications.addNotificationReceivedListener(
      (notification) => {
        const { title, body } = notification.request.content;
        const data = notification.request.content.data;
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        // Show as in-app banner
        setActiveNotification({
          id: notification.request.identifier,
          type: (data?.type as NotificationType) || 'workout',
          title: title || 'TRENS',
          body: body || '',
          scheduledTime: new Date().toLocaleTimeString('es-PE', {
            hour: '2-digit',
            minute: '2-digit',
          }),
          enabled: true,
          receivedAt: new Date(),
        });
      }
    );

    return () => {
      if (listenerRef.current) listenerRef.current();
      if (notificationResponseRef.current) notificationResponseRef.current.remove();
      if (notificationReceivedRef.current) notificationReceivedRef.current.remove();
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

  // Request permissions (cross-platform)
  const requestPermissions = useCallback(async (): Promise<boolean> => {
    if (Platform.OS === 'web' && typeof window !== 'undefined' && 'Notification' in window) {
      const permission = await Notification.requestPermission();
      return permission === 'granted';
    }
    // Native
    const { status } = await Notifications.requestPermissionsAsync();
    return status === 'granted';
  }, []);

  // Register for push notifications
  const registerForPush = useCallback(async (): Promise<string | null> => {
    const token = await registerForPushNotificationsAsync();
    if (token) setExpoPushToken(token);
    return token;
  }, []);

  return (
    <NotificationContext.Provider
      value={{
        activeNotification,
        preferences,
        expoPushToken,
        dismissNotification,
        updatePreferences,
        syncNotifications,
        requestPermissions,
        registerForPushNotifications: registerForPush,
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
