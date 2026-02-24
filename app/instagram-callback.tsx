// ============================================================================
// INSTAGRAM CALLBACK HANDLER
// Esta ruta captura el callback de OAuth de Instagram y lo procesa
// Funciona tanto en native como en web
// ============================================================================

import { useEffect, useState, useRef } from 'react';
import { View, Text, ActivityIndicator, Platform } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import instagram from '../services/instagram/instagram';

// Intentar completar la sesión de auth (solo en native)
if (Platform.OS !== 'web') {
  WebBrowser.maybeCompleteAuthSession();
}

export default function InstagramCallbackScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const [status, setStatus] = useState<'processing' | 'success' | 'error'>('processing');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [username, setUsername] = useState<string>('');
  const processedRef = useRef(false);

  useEffect(() => {
    const processCallback = async () => {
      // Evitar procesamiento duplicado
      if (processedRef.current) {
        return;
      }
      processedRef.current = true;

      try {
        let code: string | null = null;
        let error: string | null = null;

        if (Platform.OS === 'web') {
          // En web, leer parámetros de la URL
          const urlParams = new URLSearchParams(window.location.search);
          code = urlParams.get('code');
          error = urlParams.get('error');
        } else {
          // En native, los parámetros vienen del deep link
          code = (params.code as string) || null;
          error = (params.error as string) || null;
        }

        if (error) {
          console.error('📸 Instagram OAuth error:', error);
          setStatus('error');
          setErrorMessage(
            error === 'access_denied'
              ? 'Permiso denegado. Debes autorizar el acceso.'
              : 'Autenticación cancelada'
          );
          setTimeout(() => redirectToSavedPath(), 2000);
          return;
        }

        if (code) {
          // Instagram agrega #_ al final del código, hay que limpiarlo
          const cleanCode = code.replace(/#_$/, '');

          const result = await instagram.processAuthCode(cleanCode);

          if (result.success) {
            setStatus('success');
            setUsername(result.username || '');
          } else {
            console.error('📸 Instagram: Error procesando código');
            setStatus('error');
            setErrorMessage('Error al vincular Instagram. Intenta de nuevo.');
          }
        } else {
          setStatus('error');
          setErrorMessage('No se recibió código de autorización.');
        }
      } catch (e: any) {
        console.error('📸 Instagram callback error:', e);
        setStatus('error');
        setErrorMessage(e.message || 'Error inesperado');
      }

      // Delay para mostrar estado
      await new Promise((resolve) => setTimeout(resolve, 1500));
      await redirectToSavedPath();
    };

    const redirectToSavedPath = async () => {
      const returnPath = await instagram.getReturnPath();
      router.replace(returnPath as any);
    };

    processCallback();
  }, [params, router]);

  return (
    <View className="flex-1 bg-black items-center justify-center">
      {status === 'processing' && (
        <>
          <ActivityIndicator size="large" color="#DC2626" />
          <Text className="text-white text-lg font-bold mt-4">Vinculando Instagram...</Text>
          <Text className="text-zinc-500 text-sm mt-2">Espera un momento</Text>
        </>
      )}

      {status === 'success' && (
        <>
          <View
            className="w-20 h-20 rounded-full bg-gradient-to-br items-center justify-center mb-4"
            style={{
              backgroundColor: '#DC2626',
              shadowColor: '#DC2626',
              shadowOffset: { width: 0, height: 0 },
              shadowOpacity: 0.6,
              shadowRadius: 20,
              elevation: 10,
            }}
          >
            <Text className="text-white text-4xl font-bold">✓</Text>
          </View>
          <Text className="text-white text-xl font-bold">¡Vinculado!</Text>
          {username ? (
            <Text className="text-red-500 text-base font-mono mt-1">@{username}</Text>
          ) : null}
          <Text className="text-zinc-500 text-sm mt-2">Redirigiendo...</Text>
        </>
      )}

      {status === 'error' && (
        <>
          <View className="w-20 h-20 rounded-full bg-zinc-800 items-center justify-center mb-4">
            <Text className="text-red-500 text-4xl font-bold">✕</Text>
          </View>
          <Text className="text-white text-xl font-bold">Error</Text>
          <Text className="text-zinc-400 text-sm mt-2 text-center px-8">{errorMessage}</Text>
        </>
      )}
    </View>
  );
}
