import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import React, { useState, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import * as Haptics from '../../lib/haptics';
import { Mail, ArrowLeft, ArrowRight, CheckCircle, Send } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';

const PREMIUM = {
  fireRed: '#DC2626',
};

export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const router = useRouter();

  const handleResetPassword = useCallback(async () => {
    if (!email.trim()) {
      setError('Ingresa tu email');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(
        email.trim().toLowerCase(),
        {
          redirectTo:
            Platform.OS === 'web'
              ? `${typeof window !== 'undefined' ? window.location.origin : 'https://trens.app'}/login`
              : 'trensdev://login',
        }
      );

      if (resetError) throw resetError;

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSent(true);
    } catch (err: any) {
      setError(err.message || 'Error al enviar el email');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setLoading(false);
    }
  }, [email]);

  if (sent) {
    return (
      <View className="flex-1 bg-black justify-center items-center px-6">
        <Animated.View entering={FadeInDown.duration(600)} className="items-center">
          <View className="w-20 h-20 rounded-full bg-green-600/20 items-center justify-center mb-6">
            <CheckCircle size={40} color="#22C55E" />
          </View>
          <Text className="text-white text-2xl font-bold text-center mb-3">Email enviado</Text>
          <Text className="text-zinc-400 text-center mb-2 leading-6">
            Revisa tu bandeja de entrada en:
          </Text>
          <Text className="text-white font-mono text-center mb-6">{email}</Text>
          <Text className="text-zinc-500 text-center text-sm mb-8 leading-5">
            Haz click en el enlace del email para restablecer tu contraseña. Si no lo ves, revisa tu
            carpeta de spam.
          </Text>

          <TouchableOpacity
            onPress={() => router.replace('/(auth)/login')}
            className="overflow-hidden rounded-2xl w-full"
          >
            <LinearGradient
              colors={[PREMIUM.fireRed, '#B91C1C']}
              className="py-4 items-center flex-row justify-center gap-2"
            >
              <Text className="text-white font-bold text-base tracking-wider">VOLVER AL LOGIN</Text>
              <ArrowRight size={18} color="#fff" />
            </LinearGradient>
          </TouchableOpacity>
        </Animated.View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      className="flex-1 bg-black"
    >
      <View className="flex-1 justify-center px-6">
        {/* Back */}
        <Animated.View entering={FadeInDown.delay(100).duration(400)}>
          <TouchableOpacity
            onPress={() => router.back()}
            className="flex-row items-center gap-2 mb-8"
          >
            <ArrowLeft size={20} color="#A1A1AA" />
            <Text className="text-zinc-400 text-sm">Volver</Text>
          </TouchableOpacity>
        </Animated.View>

        {/* Header */}
        <Animated.View entering={FadeInDown.delay(200).duration(600)} className="mb-8">
          <Text className="text-white text-3xl font-bold tracking-tight mb-3">
            Recuperar contraseña
          </Text>
          <Text className="text-zinc-500 text-sm leading-5">
            Ingresa tu email y te enviaremos un enlace para restablecer tu contraseña.
          </Text>
        </Animated.View>

        {/* Error */}
        {error && (
          <Animated.View
            entering={FadeInDown.duration(300)}
            className="bg-red-900/20 border border-red-600/50 rounded-2xl p-4 mb-6"
          >
            <Text className="text-red-400 text-center text-sm">{error}</Text>
          </Animated.View>
        )}

        {/* Email Input */}
        <Animated.View entering={FadeInUp.delay(300).duration(600)}>
          <Text className="text-zinc-500 text-xs mb-2.5 tracking-widest font-medium uppercase">
            Email de tu cuenta
          </Text>
          <View className="flex-row items-center bg-zinc-900/50 rounded-2xl px-4 border border-zinc-800/50 mb-6">
            <Mail size={18} color="#71717a" />
            <TextInput
              placeholder="tu@email.com"
              placeholderTextColor="#52525b"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              textContentType="emailAddress"
              returnKeyType="send"
              onSubmitEditing={handleResetPassword}
              className="flex-1 text-white py-4 px-3 text-base"
            />
          </View>

          {/* Submit */}
          <TouchableOpacity onPress={handleResetPassword} disabled={loading} activeOpacity={0.9}>
            <LinearGradient
              colors={loading ? ['#3f3f46', '#27272a'] : [PREMIUM.fireRed, '#B91C1C']}
              className="py-5 rounded-2xl flex-row items-center justify-center gap-3"
              style={{
                shadowColor: loading ? 'transparent' : PREMIUM.fireRed,
                shadowOffset: { width: 0, height: 6 },
                shadowOpacity: 0.4,
                shadowRadius: 12,
                elevation: loading ? 0 : 10,
              }}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <>
                  <Send size={20} color="white" />
                  <Text className="text-white font-bold text-base tracking-widest">
                    ENVIAR ENLACE
                  </Text>
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </KeyboardAvoidingView>
  );
}
