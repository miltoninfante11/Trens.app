// ============================================================================
// HANK ONBOARDING - Sistema de Onboarding Proactivo con HANK
// Guía al usuario nuevo de forma inteligente y personalizada
// ============================================================================

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withSequence,
  withDelay,
  withRepeat,
  Easing,
  interpolate,
  FadeIn,
  SlideInRight,
  SlideOutLeft,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import {
  GitlabIcon as Bot,
  ChevronRight,
  ChevronLeft,
  Dumbbell,
  Target,
  Scale,
  Ruler,
  Flame,
  Check,
  Sparkles,
  Trophy,
  Calendar,
} from 'lucide-react-native';
import * as Haptics from '../../lib/haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';

// ============================================================================
// TYPES
// ============================================================================

export interface OnboardingData {
  weight?: string;
  height?: string;
  goal?: 'PERDER' | 'MANTENER' | 'GANAR';
  trainingExperience?: 'PRINCIPIANTE' | 'INTERMEDIO' | 'AVANZADO';
  trainingDaysPerWeek?: number;
  age?: number;
  sex?: 'M' | 'F';
}

interface HankOnboardingProps {
  visible: boolean;
  onComplete: (data: OnboardingData) => void;
  onDismiss: () => void;
  userId: string;
}

type OnboardingStep =
  | 'welcome'
  | 'weight'
  | 'height'
  | 'goal'
  | 'experience'
  | 'frequency'
  | 'complete';

// ============================================================================
// CONSTANTS
// ============================================================================

const HANK_MESSAGES: Record<OnboardingStep, string[]> = {
  welcome: [
    'Qué onda, bestia. Soy HANK, tu coach personal.',
    'Voy a ayudarte a construir el cuerpo que quieres.',
    'Pero primero necesito conocerte. ¿Listo para empezar?',
  ],
  weight: ['¿Cuánto pesas actualmente?', 'Sé honesto. Sin datos reales, no hay resultados reales.'],
  height: ['Ahora tu altura.', 'Esto me ayuda a calcular tu metabolismo y macros ideales.'],
  goal: ['¿Cuál es tu objetivo?', 'Cada gramo de comida y cada rep van dirigidos a esto.'],
  experience: [
    '¿Cuánta experiencia tienes entrenando?',
    'No hay respuesta incorrecta. Solo honestidad.',
  ],
  frequency: ['¿Cuántos días por semana puedes entrenar?', 'Diseñaré tu rutina basándome en esto.'],
  complete: [
    '¡Perfecto! Ya tengo todo lo que necesito.',
    'Tu plan está siendo generado con IA.',
    'Prepárate para transformarte. 💪',
  ],
};

const GOALS = [
  { id: 'PERDER', label: 'PERDER GRASA', icon: Flame, color: '#F97316' },
  { id: 'MANTENER', label: 'MANTENER', icon: Scale, color: '#22C55E' },
  { id: 'GANAR', label: 'GANAR MÚSCULO', icon: Dumbbell, color: '#DC2626' },
];

const EXPERIENCE_LEVELS = [
  { id: 'PRINCIPIANTE', label: 'PRINCIPIANTE', desc: 'Menos de 1 año', color: '#22C55E' },
  { id: 'INTERMEDIO', label: 'INTERMEDIO', desc: '1-3 años', color: '#F97316' },
  { id: 'AVANZADO', label: 'AVANZADO', desc: 'Más de 3 años', color: '#DC2626' },
];

const TRAINING_FREQUENCIES = [3, 4, 5, 6];

// ============================================================================
// ANIMATED HANK AVATAR
// ============================================================================

const HankAvatar: React.FC<{ isAnimating: boolean }> = ({ isAnimating }) => {
  const breathe = useSharedValue(0);
  const glow = useSharedValue(0);

  useEffect(() => {
    breathe.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: 1500, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      false
    );

    if (isAnimating) {
      glow.value = withRepeat(
        withSequence(withTiming(1, { duration: 500 }), withTiming(0.5, { duration: 500 })),
        -1,
        true
      );
    } else {
      glow.value = withTiming(0.3, { duration: 300 });
    }
  }, [isAnimating, breathe, glow]);

  const avatarStyle = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(breathe.value, [0, 1], [1, 1.05]) }],
    shadowOpacity: interpolate(glow.value, [0, 1], [0.3, 0.8]),
    shadowRadius: interpolate(glow.value, [0, 1], [10, 25]),
  }));

  return (
    <Animated.View
      style={[
        {
          width: 80,
          height: 80,
          borderRadius: 40,
          backgroundColor: '#0a0505',
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: 3,
          borderColor: '#DC2626',
          shadowColor: '#DC2626',
          shadowOffset: { width: 0, height: 0 },
        },
        avatarStyle,
      ]}
    >
      <Bot size={40} color="#F97316" />
    </Animated.View>
  );
};

// ============================================================================
// TYPING TEXT ANIMATION
// ============================================================================

const TypingText: React.FC<{
  text: string;
  onComplete?: () => void;
  delay?: number;
}> = ({ text, onComplete, delay = 0 }) => {
  const [displayedText, setDisplayedText] = useState('');
  const indexRef = useRef(0);

  useEffect(() => {
    setDisplayedText('');
    indexRef.current = 0;

    const startTyping = () => {
      const interval = setInterval(() => {
        if (indexRef.current < text.length) {
          setDisplayedText(text.slice(0, indexRef.current + 1));
          indexRef.current++;
        } else {
          clearInterval(interval);
          onComplete?.();
        }
      }, 30);

      return () => clearInterval(interval);
    };

    const timeout = setTimeout(startTyping, delay);
    return () => clearTimeout(timeout);
  }, [text, delay, onComplete]);

  return (
    <Text className="text-white text-lg leading-relaxed">
      {displayedText}
      <Text className="text-red-500">|</Text>
    </Text>
  );
};

// ============================================================================
// STEP COMPONENTS
// ============================================================================

// Welcome Step
const WelcomeStep: React.FC<{ onNext: () => void }> = ({ onNext }) => {
  const [currentMessage, setCurrentMessage] = useState(0);
  const [showButton, setShowButton] = useState(false);
  const messages = HANK_MESSAGES.welcome;

  const handleMessageComplete = useCallback(() => {
    if (currentMessage < messages.length - 1) {
      setTimeout(() => setCurrentMessage((prev) => prev + 1), 500);
    } else {
      setShowButton(true);
    }
  }, [currentMessage, messages.length]);

  return (
    <View className="flex-1 justify-center items-center px-6">
      <HankAvatar isAnimating={currentMessage < messages.length - 1} />

      <View className="mt-8 min-h-[120px] items-center">
        {messages.slice(0, currentMessage + 1).map((msg, idx) => (
          <Animated.View key={idx} entering={FadeIn.duration(300)} className="mb-3">
            {idx === currentMessage ? (
              <TypingText
                text={msg}
                onComplete={handleMessageComplete}
                delay={idx === 0 ? 500 : 0}
              />
            ) : (
              <Text className="text-zinc-400 text-lg text-center">{msg}</Text>
            )}
          </Animated.View>
        ))}
      </View>

      {showButton && (
        <Animated.View entering={FadeIn.delay(300).duration(400)}>
          <TouchableOpacity
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              onNext();
            }}
            className="bg-red-600 px-8 py-4 rounded-full mt-8 flex-row items-center"
            style={{
              shadowColor: '#DC2626',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.5,
              shadowRadius: 12,
            }}
          >
            <Text className="text-white font-bold text-lg mr-2">EMPEZAR</Text>
            <ChevronRight size={24} color="#FFFFFF" />
          </TouchableOpacity>
        </Animated.View>
      )}
    </View>
  );
};

// Weight Input Step
const WeightStep: React.FC<{
  value: string;
  onChange: (v: string) => void;
}> = ({ value, onChange }) => {
  return (
    <View className="items-center">
      <Scale size={48} color="#DC2626" className="mb-4" />
      <Text className="text-zinc-500 text-sm font-bold tracking-widest mb-4">PESO ACTUAL</Text>

      <View className="flex-row items-center">
        <TextInput
          value={value}
          onChangeText={onChange}
          keyboardType="decimal-pad"
          placeholder="75"
          placeholderTextColor="#52525B"
          className="bg-zinc-900 border-2 border-red-600/50 rounded-xl px-6 py-4 text-white text-4xl font-bold text-center w-32"
          maxLength={5}
        />
        <Text className="text-zinc-400 text-2xl font-bold ml-4">KG</Text>
      </View>
    </View>
  );
};

// Height Input Step
const HeightStep: React.FC<{
  value: string;
  onChange: (v: string) => void;
}> = ({ value, onChange }) => {
  return (
    <View className="items-center">
      <Ruler size={48} color="#DC2626" className="mb-4" />
      <Text className="text-zinc-500 text-sm font-bold tracking-widest mb-4">ALTURA</Text>

      <View className="flex-row items-center">
        <TextInput
          value={value}
          onChangeText={onChange}
          keyboardType="decimal-pad"
          placeholder="1.75"
          placeholderTextColor="#52525B"
          className="bg-zinc-900 border-2 border-red-600/50 rounded-xl px-6 py-4 text-white text-4xl font-bold text-center w-36"
          maxLength={4}
        />
        <Text className="text-zinc-400 text-2xl font-bold ml-4">M</Text>
      </View>
    </View>
  );
};

// Goal Selection Step
const GoalStep: React.FC<{
  value: OnboardingData['goal'];
  onChange: (v: OnboardingData['goal']) => void;
}> = ({ value, onChange }) => {
  return (
    <View className="items-center w-full px-4">
      <Target size={48} color="#DC2626" className="mb-4" />
      <Text className="text-zinc-500 text-sm font-bold tracking-widest mb-6">TU OBJETIVO</Text>

      <View className="w-full gap-3">
        {GOALS.map((goal) => {
          const Icon = goal.icon;
          const isSelected = value === goal.id;

          return (
            <TouchableOpacity
              key={goal.id}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                onChange(goal.id as OnboardingData['goal']);
              }}
              className={`flex-row items-center p-4 rounded-xl border-2 ${
                isSelected ? 'border-red-600 bg-red-600/10' : 'border-zinc-800 bg-zinc-900/50'
              }`}
              style={
                isSelected
                  ? {
                      shadowColor: goal.color,
                      shadowOffset: { width: 0, height: 0 },
                      shadowOpacity: 0.4,
                      shadowRadius: 12,
                    }
                  : {}
              }
            >
              <View
                className="w-12 h-12 rounded-full items-center justify-center mr-4"
                style={{ backgroundColor: `${goal.color}20` }}
              >
                <Icon size={24} color={goal.color} />
              </View>
              <Text
                className={`flex-1 font-bold text-lg ${isSelected ? 'text-white' : 'text-zinc-400'}`}
              >
                {goal.label}
              </Text>
              {isSelected && <Check size={24} color="#DC2626" />}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
};

// Experience Level Step
const ExperienceStep: React.FC<{
  value: OnboardingData['trainingExperience'];
  onChange: (v: OnboardingData['trainingExperience']) => void;
}> = ({ value, onChange }) => {
  return (
    <View className="items-center w-full px-4">
      <Trophy size={48} color="#DC2626" className="mb-4" />
      <Text className="text-zinc-500 text-sm font-bold tracking-widest mb-6">EXPERIENCIA</Text>

      <View className="w-full gap-3">
        {EXPERIENCE_LEVELS.map((level) => {
          const isSelected = value === level.id;

          return (
            <TouchableOpacity
              key={level.id}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                onChange(level.id as OnboardingData['trainingExperience']);
              }}
              className={`p-4 rounded-xl border-2 ${
                isSelected ? 'border-red-600 bg-red-600/10' : 'border-zinc-800 bg-zinc-900/50'
              }`}
              style={
                isSelected
                  ? {
                      shadowColor: level.color,
                      shadowOffset: { width: 0, height: 0 },
                      shadowOpacity: 0.4,
                      shadowRadius: 12,
                    }
                  : {}
              }
            >
              <View className="flex-row items-center justify-between">
                <View>
                  <Text
                    className={`font-bold text-lg ${isSelected ? 'text-white' : 'text-zinc-400'}`}
                  >
                    {level.label}
                  </Text>
                  <Text className="text-zinc-500 text-sm mt-1">{level.desc}</Text>
                </View>
                {isSelected && <Check size={24} color="#DC2626" />}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
};

// Training Frequency Step
const FrequencyStep: React.FC<{
  value: number;
  onChange: (v: number) => void;
}> = ({ value, onChange }) => {
  return (
    <View className="items-center w-full px-4">
      <Calendar size={48} color="#DC2626" className="mb-4" />
      <Text className="text-zinc-500 text-sm font-bold tracking-widest mb-6">DÍAS POR SEMANA</Text>

      <View className="flex-row gap-4">
        {TRAINING_FREQUENCIES.map((freq) => {
          const isSelected = value === freq;

          return (
            <TouchableOpacity
              key={freq}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                onChange(freq);
              }}
              className={`w-16 h-16 rounded-xl items-center justify-center border-2 ${
                isSelected ? 'border-red-600 bg-red-600/20' : 'border-zinc-800 bg-zinc-900/50'
              }`}
              style={
                isSelected
                  ? {
                      shadowColor: '#DC2626',
                      shadowOffset: { width: 0, height: 0 },
                      shadowOpacity: 0.5,
                      shadowRadius: 10,
                    }
                  : {}
              }
            >
              <Text
                className={`text-2xl font-black ${isSelected ? 'text-red-500' : 'text-zinc-500'}`}
              >
                {freq}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Text className="text-zinc-600 text-sm mt-4">
        {value === 3 && 'Ideal para empezar'}
        {value === 4 && 'Balance perfecto'}
        {value === 5 && 'Alto compromiso'}
        {value === 6 && 'Modo bestia'}
      </Text>
    </View>
  );
};

// Complete Step
const CompleteStep: React.FC<{ onComplete: () => void }> = ({ onComplete }) => {
  const scale = useSharedValue(0);
  const [showButton, setShowButton] = useState(false);

  useEffect(() => {
    scale.value = withDelay(500, withSpring(1, { damping: 12, stiffness: 100 }));

    setTimeout(() => setShowButton(true), 2000);

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [scale]);

  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <View className="flex-1 justify-center items-center px-6">
      <Animated.View style={iconStyle}>
        <View
          className="w-24 h-24 rounded-full bg-green-500/20 items-center justify-center mb-6"
          style={{
            shadowColor: '#22C55E',
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: 0.5,
            shadowRadius: 20,
          }}
        >
          <Check size={48} color="#22C55E" />
        </View>
      </Animated.View>

      <Text className="text-white text-2xl font-black text-center mb-2">¡PERFIL CREADO!</Text>
      <Text className="text-zinc-400 text-center mb-8">
        Tu plan personalizado está listo.{'\n'}
        Es hora de comenzar tu transformación.
      </Text>

      {showButton && (
        <Animated.View entering={FadeIn.duration(400)}>
          <TouchableOpacity
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
              onComplete();
            }}
            className="bg-red-600 px-8 py-4 rounded-full flex-row items-center"
            style={{
              shadowColor: '#DC2626',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.5,
              shadowRadius: 12,
            }}
          >
            <Sparkles size={20} color="#FFFFFF" className="mr-2" />
            <Text className="text-white font-bold text-lg">COMENZAR</Text>
          </TouchableOpacity>
        </Animated.View>
      )}
    </View>
  );
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export const HankOnboarding: React.FC<HankOnboardingProps> = ({
  visible,
  onComplete,
  onDismiss,
  userId,
}) => {
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<OnboardingStep>('welcome');
  const [data, setData] = useState<OnboardingData>({
    weight: '',
    height: '',
    goal: undefined,
    trainingExperience: undefined,
    trainingDaysPerWeek: 4,
  });

  const steps: OnboardingStep[] = [
    'welcome',
    'weight',
    'height',
    'goal',
    'experience',
    'frequency',
    'complete',
  ];
  const currentIndex = steps.indexOf(step);
  const progress = (currentIndex / (steps.length - 1)) * 100;

  const canProceed = useCallback(() => {
    switch (step) {
      case 'welcome':
        return true;
      case 'weight':
        return !!data.weight && parseFloat(data.weight) > 0;
      case 'height':
        return !!data.height && parseFloat(data.height) > 0;
      case 'goal':
        return !!data.goal;
      case 'experience':
        return !!data.trainingExperience;
      case 'frequency':
        return !!data.trainingDaysPerWeek;
      case 'complete':
        return true;
      default:
        return false;
    }
  }, [step, data]);

  const handleNext = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const nextIndex = currentIndex + 1;
    if (nextIndex < steps.length) {
      setStep(steps[nextIndex]);
    }

    // Save data to Supabase when reaching complete step
    if (step === 'frequency') {
      try {
        await supabase
          .from('user_profiles')
          .update({
            weight: data.weight ? `${data.weight} KG` : null,
            height: data.height ? `${data.height} M` : null,
            goal: data.goal,
            training_experience: data.trainingExperience,
            training_days_per_week: data.trainingDaysPerWeek,
            hank_first_time_shown: true,
            onboarding_completed: true,
          })
          .eq('user_id', userId);

        console.warn('✅ Onboarding data saved');
      } catch (error) {
        console.error('Error saving onboarding data:', error);
      }
    }
  }, [currentIndex, step, steps, data, userId]);

  const handleBack = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    if (currentIndex > 0) {
      setStep(steps[currentIndex - 1]);
    }
  }, [currentIndex, steps]);

  const handleComplete = useCallback(async () => {
    // Mark first time as shown
    try {
      await supabase
        .from('user_profiles')
        .update({ hank_first_time_shown: true })
        .eq('user_id', userId);
    } catch (error) {
      console.error('Error updating first time flag:', error);
    }

    onComplete(data);
  }, [data, onComplete, userId]);

  const renderStep = () => {
    switch (step) {
      case 'welcome':
        return <WelcomeStep onNext={handleNext} />;
      case 'weight':
        return (
          <WeightStep
            value={data.weight || ''}
            onChange={(v) => setData((prev) => ({ ...prev, weight: v }))}
          />
        );
      case 'height':
        return (
          <HeightStep
            value={data.height || ''}
            onChange={(v) => setData((prev) => ({ ...prev, height: v }))}
          />
        );
      case 'goal':
        return (
          <GoalStep value={data.goal} onChange={(v) => setData((prev) => ({ ...prev, goal: v }))} />
        );
      case 'experience':
        return (
          <ExperienceStep
            value={data.trainingExperience}
            onChange={(v) => setData((prev) => ({ ...prev, trainingExperience: v }))}
          />
        );
      case 'frequency':
        return (
          <FrequencyStep
            value={data.trainingDaysPerWeek || 4}
            onChange={(v) => setData((prev) => ({ ...prev, trainingDaysPerWeek: v }))}
          />
        );
      case 'complete':
        return <CompleteStep onComplete={handleComplete} />;
      default:
        return null;
    }
  };

  const getMessage = () => {
    const messages = HANK_MESSAGES[step];
    return messages[0];
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="fade" transparent={false} onRequestClose={onDismiss}>
      <View className="flex-1 bg-black">
        {/* Background gradient */}
        <LinearGradient colors={['#0a0505', '#000000', '#050000']} className="absolute inset-0" />

        {/* Progress bar */}
        {step !== 'welcome' && step !== 'complete' && (
          <View
            className="absolute top-0 left-0 right-0 h-1 bg-zinc-900"
            style={{ marginTop: insets.top }}
          >
            <Animated.View className="h-full bg-red-600" style={{ width: `${progress}%` }} />
          </View>
        )}

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          className="flex-1"
        >
          <View
            className="flex-1 justify-center"
            style={{ paddingTop: insets.top + 20, paddingBottom: insets.bottom + 20 }}
          >
            {/* Hank message (for non-welcome/complete steps) */}
            {step !== 'welcome' && step !== 'complete' && (
              <View className="px-6 mb-8">
                <View className="flex-row items-center mb-3">
                  <View className="w-8 h-8 rounded-full bg-red-600/20 items-center justify-center mr-2">
                    <Bot size={16} color="#DC2626" />
                  </View>
                  <Text className="text-red-500 font-bold text-sm">HANK</Text>
                </View>
                <Text className="text-white text-lg">{getMessage()}</Text>
              </View>
            )}

            {/* Step content */}
            <Animated.View
              key={step}
              entering={SlideInRight.duration(300)}
              exiting={SlideOutLeft.duration(200)}
              className="flex-1 justify-center"
            >
              {renderStep()}
            </Animated.View>

            {/* Navigation buttons (for input steps) */}
            {step !== 'welcome' && step !== 'complete' && (
              <View className="flex-row justify-between px-6 pt-4">
                <TouchableOpacity onPress={handleBack} className="flex-row items-center px-4 py-3">
                  <ChevronLeft size={20} color="#71717A" />
                  <Text className="text-zinc-500 font-bold ml-1">ATRÁS</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handleNext}
                  disabled={!canProceed()}
                  className={`flex-row items-center px-6 py-3 rounded-full ${
                    canProceed() ? 'bg-red-600' : 'bg-zinc-800'
                  }`}
                  style={
                    canProceed()
                      ? {
                          shadowColor: '#DC2626',
                          shadowOffset: { width: 0, height: 4 },
                          shadowOpacity: 0.4,
                          shadowRadius: 8,
                        }
                      : {}
                  }
                >
                  <Text
                    className={`font-bold mr-1 ${canProceed() ? 'text-white' : 'text-zinc-600'}`}
                  >
                    SIGUIENTE
                  </Text>
                  <ChevronRight size={20} color={canProceed() ? '#FFFFFF' : '#52525B'} />
                </TouchableOpacity>
              </View>
            )}
          </View>
        </KeyboardAvoidingView>

        {/* Skip button (only on welcome) */}
        {step === 'welcome' && (
          <TouchableOpacity
            onPress={onDismiss}
            className="absolute top-0 right-4"
            style={{ marginTop: insets.top + 8 }}
          >
            <Text className="text-zinc-600 text-sm">Saltar</Text>
          </TouchableOpacity>
        )}
      </View>
    </Modal>
  );
};

export default HankOnboarding;
