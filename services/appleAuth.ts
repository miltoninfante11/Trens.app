import { Platform } from 'react-native';
import { supabase } from '../lib/supabase';

/**
 * Sign in with Apple - only available on iOS native.
 * Uses expo-apple-authentication for the native flow
 * and Supabase Auth for session management.
 */
export async function signInWithApple(): Promise<{
  success: boolean;
  error?: string;
  isNewUser?: boolean;
}> {
  if (Platform.OS !== 'ios') {
    return { success: false, error: 'Sign in with Apple solo disponible en iOS' };
  }

  try {
    const AppleAuthentication = await import('expo-apple-authentication');
    const Crypto = await import('expo-crypto');

    // Generate a nonce for security
    const rawNonce = Array.from(Crypto.getRandomBytes(32))
      .map((b: number) => b.toString(16).padStart(2, '0'))
      .join('');

    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });

    if (!credential.identityToken) {
      return { success: false, error: 'No se recibió token de Apple' };
    }

    // Sign in with Supabase using the Apple ID token
    const { data, error } = await supabase.auth.signInWithIdToken({
      provider: 'apple',
      token: credential.identityToken,
    });

    if (error) throw error;

    // Check if new user to create profile
    let isNewUser = false;
    if (data.user) {
      const { data: existingProfile } = await supabase
        .from('user_profiles')
        .select('user_id')
        .eq('user_id', data.user.id)
        .maybeSingle();

      if (!existingProfile) {
        isNewUser = true;
        const fullName = credential.fullName
          ? `${credential.fullName.givenName || ''} ${credential.fullName.familyName || ''}`.trim()
          : null;

        await supabase.from('user_profiles').upsert(
          {
            user_id: data.user.id,
            display_name: fullName || credential.email || 'Usuario TRENS',
          },
          { onConflict: 'user_id' }
        );

        await supabase.from('user_roles').upsert(
          {
            user_id: data.user.id,
            role: 'free',
          },
          { onConflict: 'user_id' }
        );
      }
    }

    return { success: true, isNewUser };
  } catch (err: any) {
    // User cancelled
    if (err.code === 'ERR_REQUEST_CANCELED' || err.code === '1001') {
      return { success: false, error: 'cancelled' };
    }
    return { success: false, error: err.message || 'Error con Sign in with Apple' };
  }
}

/**
 * Check if Sign in with Apple is available on this device.
 */
export async function isAppleAuthAvailable(): Promise<boolean> {
  if (Platform.OS !== 'ios') return false;

  try {
    const AppleAuthentication = await import('expo-apple-authentication');
    return await AppleAuthentication.isAvailableAsync();
  } catch {
    return false;
  }
}
