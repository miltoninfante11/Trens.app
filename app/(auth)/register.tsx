import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { Link, useRouter } from 'expo-router';
import React, { useState, useCallback, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import * as Haptics from '../../lib/haptics';
import {
  Lock,
  Mail,
  Eye,
  EyeOff,
  User,
  Phone,
  ArrowRight,
  ArrowLeft,
  CheckCircle,
  Crown,
  Shield,
} from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';

const PREMIUM = {
  fireRed: '#DC2626',
  glowRed: 'rgba(220, 38, 38, 0.6)',
};

export default function RegisterScreen() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const router = useRouter();

  const emailRef = useRef<TextInput>(null);
  const phoneRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);

  const handleRegister = useCallback(async () => {
    if (!name.trim()) {
      setError('Ingresa tu nombre');
      return;
    }
    if (!email.trim()) {
      setError('Ingresa tu email');
      return;
    }
    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres');
      return;
    }
    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden');
      return;
    }
    if (!acceptTerms) {
      setError('Debes aceptar los Términos y la Política de Privacidad');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
        options: {
          data: {
            display_name: name.trim(),
            phone: phone.trim() || null,
          },
        },
      });

      if (signUpError) throw signUpError;

      if (data.user) {
        // Crear perfil básico
        await supabase.from('user_profiles').upsert(
          {
            user_id: data.user.id,
            display_name: name.trim(),
            phone: phone.trim() || null,
          },
          { onConflict: 'user_id' }
        );

        // Crear rol free por defecto
        await supabase.from('user_roles').upsert(
          {
            user_id: data.user.id,
            role: 'free',
          },
          { onConflict: 'user_id' }
        );
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSuccess(true);
    } catch (err: any) {
      const msg = err.message || 'Error al crear la cuenta';
      if (msg.includes('already registered')) {
        setError('Este email ya está registrado. Intenta iniciar sesión.');
      } else {
        setError(msg);
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setLoading(false);
    }
  }, [name, email, phone, password, confirmPassword, acceptTerms]);

  if (success) {
    return (
      <View className="flex-1 bg-black justify-center items-center px-6">
        <Animated.View entering={FadeInDown.duration(600)} className="items-center">
          <View className="w-20 h-20 rounded-full bg-green-600/20 items-center justify-center mb-6">
            <CheckCircle size={40} color="#22C55E" />
          </View>
          <Text className="text-white text-2xl font-bold text-center mb-3">¡Cuenta creada!</Text>
          <Text className="text-zinc-400 text-center mb-8 leading-6">
            Revisa tu email para confirmar tu cuenta.{'\n'}Luego podrás iniciar sesión.
          </Text>
          <TouchableOpacity
            onPress={() => router.replace('/(auth)/login')}
            className="overflow-hidden rounded-2xl w-full"
          >
            <LinearGradient
              colors={[PREMIUM.fireRed, '#B91C1C']}
              className="py-4 items-center flex-row justify-center gap-2"
            >
              <Text className="text-white font-bold text-base tracking-wider">IR A LOGIN</Text>
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
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Back button */}
        <Animated.View entering={FadeInDown.delay(100).duration(400)}>
          <TouchableOpacity
            onPress={() => router.back()}
            className="flex-row items-center gap-2 mb-6"
          >
            <ArrowLeft size={20} color="#A1A1AA" />
            <Text className="text-zinc-400 text-sm">Volver</Text>
          </TouchableOpacity>
        </Animated.View>

        {/* Header */}
        <Animated.View entering={FadeInDown.delay(200).duration(600)} className="mb-6">
          <Text className="text-white text-3xl font-bold tracking-tight mb-2">Crear cuenta</Text>
          <Text className="text-zinc-500 text-sm">
            Únete a TRENS y lleva tu entrenamiento al siguiente nivel
          </Text>
        </Animated.View>

        {/* Error */}
        {error && (
          <Animated.View
            entering={FadeInDown.duration(300)}
            className="bg-red-900/20 border border-red-600/50 rounded-2xl p-4 mb-4"
          >
            <Text className="text-red-400 text-center text-sm">{error}</Text>
          </Animated.View>
        )}

        {/* Form */}
        <Animated.View entering={FadeInUp.delay(300).duration(600)} className="gap-4">
          {/* Name */}
          <View>
            <Text className="text-zinc-500 text-xs mb-2 tracking-widest font-medium uppercase">
              Nombre
            </Text>
            <View className="flex-row items-center bg-zinc-900/50 rounded-2xl px-4 border border-zinc-800/50">
              <User size={18} color="#71717a" />
              <TextInput
                placeholder="Tu nombre"
                placeholderTextColor="#52525b"
                value={name}
                onChangeText={setName}
                autoCapitalize="words"
                autoComplete="name"
                textContentType="name"
                returnKeyType="next"
                onSubmitEditing={() => emailRef.current?.focus()}
                className="flex-1 text-white py-4 px-3 text-base"
              />
            </View>
          </View>

          {/* Email */}
          <View>
            <Text className="text-zinc-500 text-xs mb-2 tracking-widest font-medium uppercase">
              Email
            </Text>
            <View className="flex-row items-center bg-zinc-900/50 rounded-2xl px-4 border border-zinc-800/50">
              <Mail size={18} color="#71717a" />
              <TextInput
                ref={emailRef}
                placeholder="tu@email.com"
                placeholderTextColor="#52525b"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                textContentType="emailAddress"
                returnKeyType="next"
                onSubmitEditing={() => phoneRef.current?.focus()}
                className="flex-1 text-white py-4 px-3 text-base"
              />
            </View>
          </View>

          {/* Phone (optional) */}
          <View>
            <Text className="text-zinc-500 text-xs mb-2 tracking-widest font-medium uppercase">
              Teléfono <Text className="text-zinc-700">(opcional)</Text>
            </Text>
            <View className="flex-row items-center bg-zinc-900/50 rounded-2xl px-4 border border-zinc-800/50">
              <Phone size={18} color="#71717a" />
              <TextInput
                ref={phoneRef}
                placeholder="+51 999 999 999"
                placeholderTextColor="#52525b"
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
                autoComplete="tel"
                textContentType="telephoneNumber"
                returnKeyType="next"
                onSubmitEditing={() => passwordRef.current?.focus()}
                className="flex-1 text-white py-4 px-3 text-base"
              />
            </View>
          </View>

          {/* Password */}
          <View>
            <Text className="text-zinc-500 text-xs mb-2 tracking-widest font-medium uppercase">
              Contraseña
            </Text>
            <View className="flex-row items-center bg-zinc-900/50 rounded-2xl px-4 border border-zinc-800/50">
              <Lock size={18} color="#71717a" />
              <TextInput
                ref={passwordRef}
                placeholder="Mínimo 6 caracteres"
                placeholderTextColor="#52525b"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                autoComplete="new-password"
                textContentType="newPassword"
                returnKeyType="next"
                onSubmitEditing={() => confirmRef.current?.focus()}
                className="flex-1 text-white py-4 px-3 text-base"
              />
              <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                {showPassword ? (
                  <EyeOff size={20} color="#71717a" />
                ) : (
                  <Eye size={20} color="#71717a" />
                )}
              </TouchableOpacity>
            </View>
          </View>

          {/* Confirm Password */}
          <View>
            <Text className="text-zinc-500 text-xs mb-2 tracking-widest font-medium uppercase">
              Confirmar contraseña
            </Text>
            <View className="flex-row items-center bg-zinc-900/50 rounded-2xl px-4 border border-zinc-800/50">
              <Lock size={18} color="#71717a" />
              <TextInput
                ref={confirmRef}
                placeholder="Repite tu contraseña"
                placeholderTextColor="#52525b"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry={!showPassword}
                autoComplete="new-password"
                textContentType="newPassword"
                returnKeyType="done"
                onSubmitEditing={handleRegister}
                className="flex-1 text-white py-4 px-3 text-base"
              />
            </View>
          </View>

          {/* Terms checkbox */}
          <TouchableOpacity
            onPress={() => setAcceptTerms(!acceptTerms)}
            activeOpacity={0.7}
            className="flex-row items-start gap-3 mt-2"
          >
            <View
              className={`w-6 h-6 rounded-lg border-2 items-center justify-center mt-0.5 ${
                acceptTerms ? 'bg-red-600 border-red-600' : 'border-zinc-600'
              }`}
            >
              {acceptTerms && <CheckCircle size={14} color="#fff" />}
            </View>
            <Text className="text-zinc-400 text-sm flex-1 leading-5">
              Acepto los{' '}
              <Link href="/terms" asChild>
                <Text className="text-red-500 underline">Términos de Servicio</Text>
              </Link>{' '}
              y la{' '}
              <Link href="/privacy" asChild>
                <Text className="text-red-500 underline">Política de Privacidad</Text>
              </Link>
            </Text>
          </TouchableOpacity>

          {/* Register button */}
          <TouchableOpacity
            onPress={handleRegister}
            disabled={loading}
            activeOpacity={0.9}
            className="mt-4"
          >
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
                  <Crown size={20} color="white" />
                  <Text className="text-white font-bold text-lg tracking-widest">CREAR CUENTA</Text>
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>

          {/* Login link */}
          <View className="flex-row justify-center gap-1 mt-4">
            <Text className="text-zinc-500 text-sm">¿Ya tienes cuenta?</Text>
            <Link href="/(auth)/login" asChild>
              <TouchableOpacity>
                <Text className="text-red-500 text-sm font-bold">Inicia sesión</Text>
              </TouchableOpacity>
            </Link>
          </View>

          {/* Legal */}
          <View className="flex-row justify-center gap-4 mt-4 mb-6">
            <Link href="/privacy" asChild>
              <TouchableOpacity>
                <Text className="text-zinc-600 text-xs">Privacidad</Text>
              </TouchableOpacity>
            </Link>
            <Text className="text-zinc-700 text-xs">•</Text>
            <Link href="/terms" asChild>
              <TouchableOpacity>
                <Text className="text-zinc-600 text-xs">Términos</Text>
              </TouchableOpacity>
            </Link>
          </View>
        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
