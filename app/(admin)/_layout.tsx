import { Tabs, Redirect } from 'expo-router';
import { View, Text, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Dumbbell, Users, CreditCard, Shield, Settings, Wrench } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { useAuth } from '../_layout';
import { supabase } from '../../lib/supabase';

// ============================================================================
// ADMIN COLORS
// ============================================================================
const ADMIN_COLORS = {
  black: '#000000',
  adminBlue: '#3B82F6',
  adminPurple: '#8B5CF6',
  white: '#FFFFFF',
  zinc400: '#A1A1AA',
  zinc800: '#27272a',
  zinc900: '#18181b',
};

// Email del CEO hardcodeado para acceso inicial
const CEO_EMAIL = 'micorp.latam@gmail.com';

// ============================================================================
// ADMIN AUTH HOOK
// ============================================================================
function useAdminAuth() {
  const { user, loading: authLoading } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [isCeo, setIsCeo] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkAdminAccess = async () => {
      if (!user) {
        setIsAdmin(false);
        setIsCeo(false);
        setLoading(false);
        return;
      }

      // Verificar si es el CEO por email (acceso inmediato)
      if (user.email === CEO_EMAIL) {
        setIsAdmin(true);
        setIsCeo(true);
        setLoading(false);

        // Asegurar que existe en admin_users
        await supabase.from('admin_users').upsert(
          {
            user_id: user.id,
            email: user.email,
            role: 'ceo',
          },
          { onConflict: 'email' }
        );
        return;
      }

      // Verificar en tabla admin_users
      const { data } = await supabase
        .from('admin_users')
        .select('role')
        .eq('user_id', user.id)
        .single();

      if (data) {
        setIsAdmin(true);
        setIsCeo(data.role === 'ceo');
      } else {
        setIsAdmin(false);
        setIsCeo(false);
      }

      setLoading(false);
    };

    if (!authLoading) {
      checkAdminAccess();
    }
  }, [user, authLoading]);

  return { isAdmin, isCeo, loading: authLoading || loading, user };
}

// ============================================================================
// ADMIN LAYOUT
// ============================================================================
export default function AdminLayout() {
  const insets = useSafeAreaInsets();
  const { isAdmin, isCeo, loading, user } = useAdminAuth();

  // Loading state
  if (loading) {
    return (
      <View className="flex-1 bg-black items-center justify-center">
        <ActivityIndicator size="large" color={ADMIN_COLORS.adminBlue} />
        <Text className="text-white mt-4 font-mono">Verificando acceso...</Text>
      </View>
    );
  }

  // No autenticado o no es admin - redirigir
  if (!user || !isAdmin) {
    return <Redirect href="/(tabs)/adn" />;
  }

  return (
    <View className="flex-1 bg-black">
      {/* Header Admin */}
      <View
        className="bg-zinc-900 border-b border-zinc-800 px-4 pb-3"
        style={{ paddingTop: insets.top + 8 }}
      >
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center gap-2">
            <Shield size={20} color={ADMIN_COLORS.adminBlue} />
            <Text className="text-white font-bold text-lg">ADMIN PANEL</Text>
          </View>
          <View className="bg-blue-600 px-2 py-1 rounded">
            <Text className="text-white text-xs font-mono">{isCeo ? 'CEO' : 'ADMIN'}</Text>
          </View>
        </View>
        <Text className="text-zinc-500 text-xs font-mono mt-1">{user?.email}</Text>
      </View>

      {/* Tabs */}
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: {
            backgroundColor: ADMIN_COLORS.zinc900,
            borderTopColor: ADMIN_COLORS.zinc800,
            borderTopWidth: 1,
            height: 70 + insets.bottom,
            paddingTop: 8,
            paddingBottom: insets.bottom + 8,
          },
          tabBarActiveTintColor: ADMIN_COLORS.adminBlue,
          tabBarInactiveTintColor: ADMIN_COLORS.zinc400,
          tabBarLabelStyle: {
            fontSize: 10,
            fontWeight: '600',
            fontFamily: 'monospace',
            marginTop: 4,
          },
        }}
      >
        <Tabs.Screen
          name="gym/index"
          options={{
            title: 'GYM',
            tabBarIcon: ({ color, size }) => <Dumbbell size={size} color={color} />,
          }}
        />
        <Tabs.Screen
          name="ajustes/index"
          options={{
            title: 'AJUSTES',
            tabBarIcon: ({ color, size }) => <Settings size={size} color={color} />,
          }}
        />
        <Tabs.Screen
          name="usuarios/index"
          options={{
            title: 'USUARIOS',
            tabBarIcon: ({ color, size }) => <Users size={size} color={color} />,
          }}
        />
        <Tabs.Screen
          name="herramientas/index"
          options={{
            title: 'HERRAMIENTAS',
            tabBarIcon: ({ color, size }) => <Wrench size={size} color={color} />,
          }}
        />
        <Tabs.Screen
          name="pay/index"
          options={{
            title: 'PAY',
            tabBarIcon: ({ color, size }) => <CreditCard size={size} color={color} />,
          }}
        />

        {/* Sub-módulos ocultos del tab bar (accesibles vía Link desde los hubs) */}
        <Tabs.Screen name="rutinas/index" options={{ href: null }} />
        <Tabs.Screen name="ejercicios/index" options={{ href: null }} />
        <Tabs.Screen name="pagos/index" options={{ href: null }} />
        <Tabs.Screen name="finanzas/index" options={{ href: null }} />
        <Tabs.Screen name="feed/index" options={{ href: null }} />
        <Tabs.Screen name="assets/index" options={{ href: null }} />
        <Tabs.Screen name="enlaces/index" options={{ href: null }} />
        <Tabs.Screen name="ajustes/landing/index" options={{ href: null }} />

        {/* Ocultar rutas de detalle */}
        <Tabs.Screen name="rutinas/[id]" options={{ href: null }} />
        <Tabs.Screen name="ejercicios/[id]" options={{ href: null }} />
        <Tabs.Screen name="usuarios/[id]" options={{ href: null }} />
        <Tabs.Screen name="tienda/index" options={{ href: null }} />
      </Tabs>
    </View>
  );
}
