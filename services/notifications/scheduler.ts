// ============================================================================
// NOTIFICATION SCHEDULER - Sistema de Notificaciones Inteligentes TRENS
// Recordatorios para comidas, entrenamientos y suplementos
// ============================================================================

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { supabase } from '../../lib/supabase';

// ============================================================================
// TYPES
// ============================================================================

export type NotificationType = 'meal' | 'workout' | 'supplement' | 'hydration' | 'progress_photo';

export interface ScheduledNotification {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  scheduledTime: string; // HH:MM format
  data?: Record<string, any>;
  enabled: boolean;
  daysOfWeek?: number[]; // 0 = Sunday, 1 = Monday, etc.
  lastTriggered?: string; // ISO date
}

export interface NotificationPreferences {
  enabled: boolean;
  mealsEnabled: boolean;
  workoutEnabled: boolean;
  supplementsEnabled: boolean;
  hydrationEnabled: boolean;
  progressPhotosEnabled: boolean;
  quietHoursStart: string; // HH:MM
  quietHoursEnd: string; // HH:MM
  advanceMinutes: number; // Minutes before event to notify
}

// ============================================================================
// CONSTANTS
// ============================================================================

const STORAGE_KEYS = {
  NOTIFICATIONS: '@trens_scheduled_notifications',
  PREFERENCES: '@trens_notification_preferences',
  LAST_CHECK: '@trens_last_notification_check',
};

const DEFAULT_PREFERENCES: NotificationPreferences = {
  enabled: true,
  mealsEnabled: true,
  workoutEnabled: true,
  supplementsEnabled: true,
  hydrationEnabled: false,
  progressPhotosEnabled: true,
  quietHoursStart: '22:00',
  quietHoursEnd: '07:00',
  advanceMinutes: 15,
};

// ============================================================================
// NOTIFICATION MESSAGES - SAVAGE MODE
// ============================================================================

const MEAL_MESSAGES = [
  { title: '🍽️ HORA DE COMER', body: 'Tu {meal} te espera. Los músculos no se alimentan solos.' },
  { title: '⚡ COMBUSTIBLE LISTO', body: 'Es hora de {meal}. Alimenta la máquina.' },
  { title: '🔥 A COMER, BESTIA', body: '{meal} en la mira. Macros no se cumplen solos.' },
  {
    title: '💪 NUTRICIÓN ACTIVA',
    body: 'Tu {meal} está programada. Cuerpo de élite requiere disciplina.',
  },
  { title: '🥩 PROTEÍNA CALLING', body: 'Hora de {meal}. Cada gramo cuenta.' },
];

const WORKOUT_MESSAGES = [
  { title: '🏋️ HORA DE ENTRENAR', body: 'Tu sesión de {routine} te espera. Sin excusas.' },
  { title: '⚡ BEAST MODE ON', body: 'Es hora de {routine}. El hierro no se levanta solo.' },
  { title: '🔥 A ROMPERLA', body: 'Sesión de {routine} en {time}. Prepárate mentalmente.' },
  { title: '💪 WORKOUT TIME', body: '{routine} programado. Hoy superamos los límites.' },
  { title: '🎯 OBJETIVO EN MIRA', body: 'Tu entrenamiento de {routine} comienza pronto.' },
];

const WORKOUT_FASTED_MESSAGES = [
  {
    title: '☀️ ENTRENO EN AYUNAS',
    body: 'Tu sesión de {routine} es en ayunas. Café negro y a darle.',
  },
  { title: '⚡ FASTED TRAINING', body: '{routine} en ayunas. Quema grasa como bestia.' },
  { title: '🌅 AMANECER SAVAGE', body: 'Entrenamiento en ayunas: {routine}. Cero excusas.' },
];

const SUPPLEMENT_MESSAGES = [
  { title: '💊 SUPLEMENTO', body: 'Hora de tomar {supplement}' },
  { title: '⚡ STACK TIME', body: 'Tu {supplement} te espera' },
];

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Obtiene un mensaje aleatorio del array
 */
const getRandomMessage = (messages: { title: string; body: string }[]) => {
  return messages[Math.floor(Math.random() * messages.length)];
};

/**
 * Reemplaza placeholders en el mensaje
 */
const formatMessage = (
  template: { title: string; body: string },
  data: Record<string, string>
): { title: string; body: string } => {
  let title = template.title;
  let body = template.body;

  Object.entries(data).forEach(([key, value]) => {
    title = title.replace(`{${key}}`, value);
    body = body.replace(`{${key}}`, value);
  });

  return { title, body };
};

/**
 * Convierte HH:MM a minutos desde medianoche
 */
const timeToMinutes = (time: string): number => {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
};

/**
 * Obtiene los minutos actuales desde medianoche
 */
const getCurrentMinutes = (): number => {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
};

/**
 * Verifica si estamos en horas de silencio
 */
const isQuietHours = (preferences: NotificationPreferences): boolean => {
  const currentMinutes = getCurrentMinutes();
  const quietStart = timeToMinutes(preferences.quietHoursStart);
  const quietEnd = timeToMinutes(preferences.quietHoursEnd);

  // Caso donde quiet hours cruza medianoche (ej: 22:00 - 07:00)
  if (quietStart > quietEnd) {
    return currentMinutes >= quietStart || currentMinutes < quietEnd;
  }

  return currentMinutes >= quietStart && currentMinutes < quietEnd;
};

/**
 * Obtiene el día actual de la semana (0 = Domingo)
 */
const getTodayDayOfWeek = (): number => {
  return new Date().getDay();
};

// ============================================================================
// NOTIFICATION SCHEDULER CLASS
// ============================================================================

class NotificationScheduler {
  private notifications: ScheduledNotification[] = [];
  private preferences: NotificationPreferences = DEFAULT_PREFERENCES;
  private checkInterval: ReturnType<typeof setInterval> | null = null;
  private listeners: Set<(notification: ScheduledNotification) => void> = new Set();

  // -------------------------------------------------------------------------
  // INITIALIZATION
  // -------------------------------------------------------------------------

  async initialize(): Promise<void> {
    await this.loadFromStorage();
    this.startBackgroundCheck();
    console.warn('🔔 NotificationScheduler initialized');
  }

  private async loadFromStorage(): Promise<void> {
    try {
      const [notificationsJson, preferencesJson] = await Promise.all([
        AsyncStorage.getItem(STORAGE_KEYS.NOTIFICATIONS),
        AsyncStorage.getItem(STORAGE_KEYS.PREFERENCES),
      ]);

      if (notificationsJson) {
        this.notifications = JSON.parse(notificationsJson);
      }

      if (preferencesJson) {
        this.preferences = { ...DEFAULT_PREFERENCES, ...JSON.parse(preferencesJson) };
      }
    } catch (error) {
      console.error('Error loading notification data:', error);
    }
  }

  private async saveToStorage(): Promise<void> {
    try {
      await Promise.all([
        AsyncStorage.setItem(STORAGE_KEYS.NOTIFICATIONS, JSON.stringify(this.notifications)),
        AsyncStorage.setItem(STORAGE_KEYS.PREFERENCES, JSON.stringify(this.preferences)),
      ]);
    } catch (error) {
      console.error('Error saving notification data:', error);
    }
  }

  // -------------------------------------------------------------------------
  // BACKGROUND CHECK
  // -------------------------------------------------------------------------

  private startBackgroundCheck(): void {
    // Check every minute
    this.checkInterval = setInterval(() => {
      this.checkScheduledNotifications();
    }, 60000);

    // Initial check
    this.checkScheduledNotifications();
  }

  stopBackgroundCheck(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  private async checkScheduledNotifications(): Promise<void> {
    if (!this.preferences.enabled) return;
    if (isQuietHours(this.preferences)) return;

    const currentMinutes = getCurrentMinutes();
    const today = getTodayDayOfWeek();
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];

    for (const notification of this.notifications) {
      if (!notification.enabled) continue;

      // Check day of week if specified
      if (notification.daysOfWeek && !notification.daysOfWeek.includes(today)) {
        continue;
      }

      // Check if already triggered today
      if (notification.lastTriggered?.startsWith(todayStr)) {
        continue;
      }

      const scheduledMinutes = timeToMinutes(notification.scheduledTime);
      const targetMinutes = scheduledMinutes - this.preferences.advanceMinutes;

      // Check if it's time (within 1 minute window)
      if (Math.abs(currentMinutes - targetMinutes) <= 1) {
        await this.triggerNotification(notification);
      }
    }
  }

  private async triggerNotification(notification: ScheduledNotification): Promise<void> {
    // Update last triggered
    notification.lastTriggered = new Date().toISOString();
    await this.saveToStorage();

    // Notify listeners (for in-app notifications)
    this.listeners.forEach((listener) => listener(notification));

    // Platform-specific notification
    if (Platform.OS === 'web') {
      this.showWebNotification(notification);
    } else {
      // For native, we'll use a callback system since expo-notifications
      // requires different handling
      this.showNativeAlert(notification);
    }

    console.warn('🔔 Notification triggered:', notification.title);
  }

  private showWebNotification(notification: ScheduledNotification): void {
    if (typeof window === 'undefined') return;

    // Request permission if needed
    if ('Notification' in window) {
      if (Notification.permission === 'granted') {
        new Notification(notification.title, {
          body: notification.body,
          icon: '/icons/icon-192x192.png',
          badge: '/icons/icon-72x72.png',
          tag: notification.id,
          requireInteraction: true,
        });
      } else if (Notification.permission !== 'denied') {
        Notification.requestPermission().then((permission) => {
          if (permission === 'granted') {
            this.showWebNotification(notification);
          }
        });
      }
    }
  }

  private showNativeAlert(notification: ScheduledNotification): void {
    // This will be handled by the NotificationContext which shows
    // in-app alerts with the premium TRENS design
    console.warn('📱 Native notification:', notification.title);
  }

  // -------------------------------------------------------------------------
  // PUBLIC API - SCHEDULING
  // -------------------------------------------------------------------------

  /**
   * Programa una notificación de comida
   */
  scheduleMealNotification(
    mealId: string,
    mealName: string,
    scheduledTime: string,
    daysOfWeek?: number[]
  ): void {
    if (!this.preferences.mealsEnabled) return;

    const message = getRandomMessage(MEAL_MESSAGES);
    const formatted = formatMessage(message, { meal: mealName.toLowerCase() });

    const notification: ScheduledNotification = {
      id: `meal-${mealId}`,
      type: 'meal',
      title: formatted.title,
      body: formatted.body,
      scheduledTime,
      daysOfWeek,
      enabled: true,
      data: { mealId, mealName },
    };

    this.addOrUpdateNotification(notification);
  }

  /**
   * Programa una notificación de entrenamiento
   */
  scheduleWorkoutNotification(
    routineName: string,
    scheduledTime: string,
    isFasted: boolean = false,
    daysOfWeek?: number[]
  ): void {
    if (!this.preferences.workoutEnabled) return;

    const messages = isFasted ? WORKOUT_FASTED_MESSAGES : WORKOUT_MESSAGES;
    const message = getRandomMessage(messages);
    const formatted = formatMessage(message, {
      routine: routineName,
      time: scheduledTime,
    });

    const notification: ScheduledNotification = {
      id: 'workout-daily',
      type: 'workout',
      title: formatted.title,
      body: formatted.body,
      scheduledTime,
      daysOfWeek,
      enabled: true,
      data: { routineName, isFasted },
    };

    this.addOrUpdateNotification(notification);
  }

  /**
   * Programa una notificación de suplemento
   */
  scheduleSupplementNotification(
    supplementId: string,
    supplementName: string,
    scheduledTime: string,
    daysOfWeek?: number[]
  ): void {
    if (!this.preferences.supplementsEnabled) return;

    const message = getRandomMessage(SUPPLEMENT_MESSAGES);
    const formatted = formatMessage(message, { supplement: supplementName });

    const notification: ScheduledNotification = {
      id: `supplement-${supplementId}-${scheduledTime.replace(':', '')}`,
      type: 'supplement',
      title: formatted.title,
      body: formatted.body,
      scheduledTime,
      daysOfWeek,
      enabled: true,
      data: { supplementId, supplementName },
    };

    this.addOrUpdateNotification(notification);
  }

  /**
   * Cancela una notificación
   */
  cancelNotification(id: string): void {
    this.notifications = this.notifications.filter((n) => n.id !== id);
    this.saveToStorage();
  }

  /**
   * Cancela todas las notificaciones de un tipo
   */
  cancelNotificationsByType(type: NotificationType): void {
    this.notifications = this.notifications.filter((n) => n.type !== type);
    this.saveToStorage();
  }

  /**
   * Cancela todas las notificaciones de comidas
   */
  cancelAllMealNotifications(): void {
    this.cancelNotificationsByType('meal');
  }

  /**
   * Cancela la notificación de entrenamiento
   */
  cancelWorkoutNotification(): void {
    this.cancelNotification('workout-daily');
  }

  private addOrUpdateNotification(notification: ScheduledNotification): void {
    const existingIndex = this.notifications.findIndex((n) => n.id === notification.id);

    if (existingIndex >= 0) {
      this.notifications[existingIndex] = notification;
    } else {
      this.notifications.push(notification);
    }

    this.saveToStorage();
  }

  // -------------------------------------------------------------------------
  // PUBLIC API - PREFERENCES
  // -------------------------------------------------------------------------

  getPreferences(): NotificationPreferences {
    return { ...this.preferences };
  }

  async updatePreferences(updates: Partial<NotificationPreferences>): Promise<void> {
    this.preferences = { ...this.preferences, ...updates };
    await this.saveToStorage();
  }

  // -------------------------------------------------------------------------
  // PUBLIC API - LISTENERS
  // -------------------------------------------------------------------------

  /**
   * Registra un listener para notificaciones in-app
   */
  addListener(callback: (notification: ScheduledNotification) => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  // -------------------------------------------------------------------------
  // PUBLIC API - SYNC WITH PLAN
  // -------------------------------------------------------------------------

  /**
   * Sincroniza todas las notificaciones con los datos del plan del usuario
   */
  async syncWithUserPlan(userId: string): Promise<void> {
    try {
      // Fetch meals
      const { data: meals } = await supabase
        .from('meals')
        .select('id, name, scheduled_time')
        .eq('user_id', userId)
        .order('scheduled_time');

      // Fetch workout position and routine
      const { data: workoutPos } = await supabase
        .from('workout_block_position')
        .select('position')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false })
        .limit(1);

      // Fetch training info (sistema weekday)
      const { data: profile } = await supabase
        .from('profiles')
        .select('training_routine_names')
        .eq('id', userId)
        .single();

      // Fetch supplements
      const { data: supplements } = await supabase
        .from('supplement_stack')
        .select('id, name, time, times, days_of_week, is_pre_workout, is_post_workout')
        .eq('user_id', userId)
        .eq('is_active', true);

      // Clear existing notifications
      this.notifications = [];

      // Schedule meal notifications
      if (meals && meals.length > 0) {
        meals.forEach((meal) => {
          if (meal.scheduled_time) {
            this.scheduleMealNotification(
              meal.id,
              meal.name || 'Comida',
              meal.scheduled_time.slice(0, 5)
            );
          }
        });
      }

      // Calculate workout time based on position
      if (meals && meals.length > 0 && workoutPos && workoutPos.length > 0) {
        const workoutIndex = workoutPos[0].position;
        const sortedMeals = meals
          .filter((m) => m.scheduled_time)
          .sort((a, b) => a.scheduled_time!.localeCompare(b.scheduled_time!));

        let workoutTime: string;
        let isFasted = false;

        if (workoutIndex === 0 || sortedMeals.length === 0) {
          // Workout before first meal = fasted
          isFasted = true;
          if (sortedMeals.length > 0) {
            const firstMealTime = sortedMeals[0].scheduled_time!.slice(0, 5);
            const [hours, minutes] = firstMealTime.split(':').map(Number);
            const workoutMinutes = Math.max(hours * 60 + minutes - 120, 5 * 60);
            const workoutHours = Math.floor(workoutMinutes / 60);
            const workoutMins = workoutMinutes % 60;
            workoutTime = `${workoutHours.toString().padStart(2, '0')}:${workoutMins.toString().padStart(2, '0')}`;
          } else {
            workoutTime = '06:00';
          }
        } else {
          // Workout after meal
          const previousMeal = sortedMeals[Math.min(workoutIndex - 1, sortedMeals.length - 1)];
          const [hours, minutes] = previousMeal.scheduled_time!.slice(0, 5).split(':').map(Number);
          const workoutMinutes = hours * 60 + minutes + 90; // 1.5 hours after meal
          const workoutHours = Math.floor(workoutMinutes / 60) % 24;
          const workoutMins = workoutMinutes % 60;
          workoutTime = `${workoutHours.toString().padStart(2, '0')}:${workoutMins.toString().padStart(2, '0')}`;
        }

        // Get routine name (weekday actual)
        const _names = (profile?.training_routine_names || {}) as Record<string, string>;
        const _today = new Date().getDay();
        let routineName = _names[String(_today)] || 'Entrenamiento';

        // Days of week donde hay entrenamiento (los keys con valor en routineNames)
        const trainingDays: number[] = Object.entries(_names)
          .filter(([k, v]) => /^[0-6]$/.test(k) && typeof v === 'string' && (v as string).trim())
          .map(([k]) => parseInt(k, 10));

        this.scheduleWorkoutNotification(
          routineName,
          workoutTime,
          isFasted,
          trainingDays.length > 0 ? trainingDays : undefined
        );
      }

      // Schedule supplement notifications
      if (supplements && supplements.length > 0) {
        supplements.forEach((supplement) => {
          if (supplement.is_pre_workout || supplement.is_post_workout) {
            // Pre/post workout supplements are tied to workout notification
            return;
          }

          const times = supplement.times || (supplement.time ? [supplement.time] : []);
          times.forEach((time: string) => {
            this.scheduleSupplementNotification(
              supplement.id,
              supplement.name,
              time.slice(0, 5),
              supplement.days_of_week
            );
          });
        });
      }

      await this.saveToStorage();
      console.warn('🔔 Notifications synced with user plan:', this.notifications.length);
    } catch (error) {
      console.error('Error syncing notifications with plan:', error);
    }
  }

  /**
   * Convierte frecuencia de entrenamiento a días de la semana
   */
  private getTrainingDaysOfWeek(frequency: number): number[] {
    // Asume distribución típica basada en frecuencia
    switch (frequency) {
      case 3:
        return [1, 3, 5]; // Lun, Mié, Vie
      case 4:
        return [1, 2, 4, 5]; // Lun, Mar, Jue, Vie
      case 5:
        return [1, 2, 3, 4, 5]; // Lun-Vie
      case 6:
        return [1, 2, 3, 4, 5, 6]; // Lun-Sáb
      default:
        return []; // Todos los días
    }
  }

  // -------------------------------------------------------------------------
  // DEBUG
  // -------------------------------------------------------------------------

  getScheduledNotifications(): ScheduledNotification[] {
    return [...this.notifications];
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

export const notificationScheduler = new NotificationScheduler();

export default notificationScheduler;
