// ============================================================================
// ACCOUNT MODAL - TRENS
// Modal completo de gestión de cuenta: perfil, suscripción, tarjetas,
// seguridad, y más. Se abre al presionar la foto de perfil en ADN.
// ============================================================================

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Image,
  Modal,
  TextInput,
  ActivityIndicator,
  Linking,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  X,
  Camera,
  ImageIcon,
  CreditCard,
  Crown,
  Lock,
  Phone,
  Mail,
  LogOut,
  ChevronRight,
  Trash2,
  CheckCircle,
  AlertCircle,
  Eye,
  EyeOff,
  User,
  CalendarDays,
  Zap,
  Plus,
  Star,
  Play,
  Dna,
  ShieldAlert,
  UserX,
  ExternalLink,
  RotateCcw,
  Globe,
  Smartphone,
} from 'lucide-react-native';
import * as Haptics from '../../lib/haptics';
import { Alert } from '../../lib/alert';
import { supabase } from '../../lib/supabase';
import { openCamera, openGallery } from '../../lib/webCamera';
import cloudflareR2 from '../../services/cloudflare/r2';
import { useUserRoleContext } from '../../context/UserRoleContext';
import {
  getMyCardsLocal,
  deleteCard as deleteCardService,
  setDefaultCard as setDefaultCardService,
  swapSubscriptionCard,
} from '../../services/cards';
import { cancelSubscription } from '../../lib/openpay';
import AddCardForm from './AddCardForm';
import type { CustomerCard, Subscription } from '../../types/subscription';

// Dynamic import para SubscriptionContext
let useSubscriptionSafe: () => any = () => null;
try {
  const subMod = require('../../context/SubscriptionContext');
  useSubscriptionSafe = () => {
    try {
      return subMod.useSubscription();
    } catch {
      return null;
    }
  };
} catch {
  // SubscriptionContext not available
}

// ============================================================================
// TIPOS
// ============================================================================

type Section =
  | 'main'
  | 'profile'
  | 'subscription'
  | 'cards'
  | 'password'
  | 'personal'
  | 'delete-account';

interface AccountModalProps {
  visible: boolean;
  onClose: () => void;
  profile: {
    display_name: string;
    avatar_url: string | null;
    user_id?: string;
  } | null;
  onProfileSaved: () => void;
}

// ============================================================================
// COMPONENT
// ============================================================================

export default function AccountModal({
  visible,
  onClose,
  profile,
  onProfileSaved,
}: AccountModalProps) {
  const { user, isPro } = useUserRoleContext();
  const subscriptionCtx = useSubscriptionSafe();

  // Platform detection
  const isWeb = Platform.OS === 'web';
  const isIOS = Platform.OS === 'ios';
  const isNative = Platform.OS === 'ios' || Platform.OS === 'android';
  const hasIAPSubscription = subscriptionCtx?.activeSource === 'iap';
  const hasOpenpaySubscription = subscriptionCtx?.activeSource === 'openpay';

  // Navigation
  const [section, setSection] = useState<Section>('main');

  // Profile editing
  const [editName, setEditName] = useState('');
  const [editAvatarUri, setEditAvatarUri] = useState<string | null>(null);
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  // Subscription
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [loadingSub, setLoadingSub] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);

  // Cards
  const [cards, setCards] = useState<CustomerCard[]>([]);
  const [loadingCards, setLoadingCards] = useState(false);
  const [deletingCardId, setDeletingCardId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [settingDefaultId, setSettingDefaultId] = useState<string | null>(null);

  // Password

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [isSavingPassword, setIsSavingPassword] = useState(false);

  // Personal info
  const [editPhone, setEditPhone] = useState('');
  const [isSavingPersonal, setIsSavingPersonal] = useState(false);

  // Default module preference
  const [defaultModule, setDefaultModule] = useState<'feed' | 'adn'>('feed');
  const [isSavingModule, setIsSavingModule] = useState(false);

  // -------------------------------------------------------------------------
  // RESET ON OPEN
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (visible) {
      setSection('main');
      setEditName(profile?.display_name || '');
      setEditAvatarUri(null);
      setNewPassword('');
      setConfirmPassword('');
      setShowNewPassword(false);
      setEditPhone(user?.phone || '');
      setShowAddForm(false);
      // Load default module preference
      if (user) {
        supabase
          .from('user_profiles')
          .select('default_module')
          .eq('user_id', user.id)
          .maybeSingle()
          .then(({ data }) => {
            if (data?.default_module) {
              setDefaultModule(data.default_module as 'feed' | 'adn');
            }
          });
      }
    }
  }, [visible, profile, user]);

  // -------------------------------------------------------------------------
  // FETCH SUBSCRIPTION
  // -------------------------------------------------------------------------
  const fetchSubscription = useCallback(async () => {
    if (!user) return;
    setLoadingSub(true);
    try {
      const { data, error } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!error && data) {
        setSubscription(data as Subscription);
      }
    } catch (err) {
      console.error('Error fetching subscription:', err);
    } finally {
      setLoadingSub(false);
    }
  }, [user]);

  // -------------------------------------------------------------------------
  // FETCH CARDS
  // -------------------------------------------------------------------------
  const fetchCards = useCallback(async () => {
    if (!user) return;
    setLoadingCards(true);
    try {
      const data = await getMyCardsLocal();
      setCards(data);
    } catch (err) {
      console.error('Error fetching cards:', err);
    } finally {
      setLoadingCards(false);
    }
  }, [user]);

  // Load data when entering sections
  useEffect(() => {
    if (section === 'subscription') fetchSubscription();
    if (section === 'cards') {
      fetchCards();
      fetchSubscription(); // Need subscription info for card management rules
    }
  }, [section, fetchSubscription, fetchCards]);

  // -------------------------------------------------------------------------
  // PROFILE ACTIONS
  // -------------------------------------------------------------------------
  const pickImageFromGallery = async () => {
    const result = await openGallery({ allowsEditing: true, aspect: [1, 1], quality: 0.8 });
    if (result.success && result.uri) {
      setEditAvatarUri(result.uri);
    } else if (result.error && result.error !== 'Cancelado por el usuario') {
      Alert.alert('Error', result.error);
    }
  };

  const takePhoto = async () => {
    const result = await openCamera({ allowsEditing: true, aspect: [1, 1], quality: 0.8 });
    if (result.success && result.uri) {
      setEditAvatarUri(result.uri);
    } else if (result.error && result.error !== 'Cancelado por el usuario') {
      Alert.alert('Error', result.error);
    }
  };

  const saveProfile = async () => {
    if (!user) return;
    setIsSavingProfile(true);
    try {
      let avatarUrl = profile?.avatar_url || null;

      if (editAvatarUri) {
        // Delete old avatar
        if (profile?.avatar_url) {
          try {
            await cloudflareR2.deleteAvatar(profile.avatar_url);
          } catch (e) {
            console.warn('Error deleting old avatar:', e);
          }
        }
        // Upload new avatar
        const uploadResult = await cloudflareR2.uploadAvatar(editAvatarUri, user.id);
        if (uploadResult.success && uploadResult.url) {
          avatarUrl = uploadResult.url;
        }
      }

      const updatedName = editName.trim() || profile?.display_name;

      const { error } = await supabase
        .from('user_profiles')
        .update({
          display_name: updatedName,
          avatar_url: avatarUrl,
        })
        .eq('user_id', user.id);

      if (error) throw error;

      // Sync full_name in profiles table
      await supabase.from('profiles').update({ full_name: updatedName }).eq('id', user.id);

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Perfil actualizado', 'Tu perfil se ha guardado correctamente.');
      onProfileSaved();
      setSection('main');
    } catch (err: any) {
      Alert.alert('Error', err.message || 'No se pudo guardar el perfil.');
    } finally {
      setIsSavingProfile(false);
    }
  };

  // -------------------------------------------------------------------------
  // PASSWORD
  // -------------------------------------------------------------------------
  const changePassword = async () => {
    if (!newPassword || !confirmPassword) {
      Alert.alert('Error', 'Completa todos los campos.');
      return;
    }
    if (newPassword.length < 6) {
      Alert.alert('Error', 'La contraseña debe tener al menos 6 caracteres.');
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert('Error', 'Las contraseñas no coinciden.');
      return;
    }

    setIsSavingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Contraseña actualizada', 'Tu contraseña ha sido cambiada exitosamente.');
      setNewPassword('');
      setConfirmPassword('');
      setSection('main');
    } catch (err: any) {
      Alert.alert('Error', err.message || 'No se pudo cambiar la contraseña.');
    } finally {
      setIsSavingPassword(false);
    }
  };

  // -------------------------------------------------------------------------
  // PERSONAL INFO (phone)
  // -------------------------------------------------------------------------
  const savePersonalInfo = async () => {
    if (!user) return;
    setIsSavingPersonal(true);
    try {
      // Update phone in auth
      if (editPhone !== (user.phone || '')) {
        const { error } = await supabase.auth.updateUser({ phone: editPhone.trim() });
        if (error) throw error;
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Información actualizada', 'Tus datos personales se han guardado.');
      setSection('main');
    } catch (err: any) {
      Alert.alert('Error', err.message || 'No se pudieron guardar los cambios.');
    } finally {
      setIsSavingPersonal(false);
    }
  };

  // -------------------------------------------------------------------------
  // SUBSCRIPTION ACTIONS
  // -------------------------------------------------------------------------
  const handleCancelSubscription = () => {
    Alert.alert(
      'Cancelar Suscripción',
      '¿Estás seguro? Perderás acceso a todas las funciones PRO al finalizar tu período actual.',
      [
        { text: 'No, mantener', style: 'cancel' },
        {
          text: 'Sí, cancelar',
          style: 'destructive',
          onPress: async () => {
            setIsCancelling(true);
            try {
              const result = await cancelSubscription(subscription?.openpay_subscription_id || '');
              if (result.success) {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                Alert.alert(
                  'Suscripción cancelada',
                  'Tu suscripción se mantendrá activa hasta el final del período actual.'
                );
                fetchSubscription();
              } else {
                Alert.alert('Error', result.error || 'No se pudo cancelar la suscripción.');
              }
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Error inesperado.');
            } finally {
              setIsCancelling(false);
            }
          },
        },
      ]
    );
  };

  // -------------------------------------------------------------------------
  // CARD ACTIONS
  // -------------------------------------------------------------------------
  const handleDeleteCard = (card: CustomerCard) => {
    // Min 1 card enforcement: si solo queda 1 tarjeta y tiene suscripción activa
    if (cards.length <= 1 && subscription && ['active', 'past_due'].includes(subscription.status)) {
      Alert.alert(
        'No se puede eliminar',
        'Debes agregar otra tarjeta antes de eliminar la última. Tu suscripción requiere al menos un método de pago.',
        [{ text: 'Entendido' }]
      );
      return;
    }

    Alert.alert('Eliminar Tarjeta', `¿Eliminar la tarjeta terminada en ${card.last4}?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: async () => {
          setDeletingCardId(card.openpay_card_id);
          try {
            await deleteCardService(card.openpay_card_id);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            fetchCards();
          } catch (err: any) {
            Alert.alert('Error', err.message || 'No se pudo eliminar la tarjeta.');
          } finally {
            setDeletingCardId(null);
          }
        },
      },
    ]);
  };

  const handleSetDefault = async (card: CustomerCard) => {
    if (card.is_default) return; // Ya es la predeterminada
    setSettingDefaultId(card.openpay_card_id);
    try {
      // 1. Marcar como default en DB
      await setDefaultCardService(card.openpay_card_id);

      // 2. Si tiene suscripción activa, cambiar la tarjeta de cobro
      if (subscription && ['active', 'past_due'].includes(subscription.status)) {
        try {
          await swapSubscriptionCard(card.openpay_card_id);
        } catch (swapErr: any) {
          console.warn('Swap subscription card warning:', swapErr.message);
          // No fallar completamente - la tarjeta ya es default en DB
        }
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      fetchCards();
      if (subscription) fetchSubscription();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'No se pudo establecer como predeterminada.');
    } finally {
      setSettingDefaultId(null);
    }
  };

  const handleCardAdded = () => {
    setShowAddForm(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    fetchCards();
  };

  // -------------------------------------------------------------------------
  // DEFAULT MODULE
  // -------------------------------------------------------------------------
  const toggleDefaultModule = async (value: 'feed' | 'adn') => {
    if (!user || isSavingModule) return;
    setIsSavingModule(true);
    const previous = defaultModule;
    setDefaultModule(value); // Optimistic update
    try {
      const { error } = await supabase
        .from('user_profiles')
        .update({ default_module: value })
        .eq('user_id', user.id);

      if (error) throw error;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      setDefaultModule(previous); // Rollback
      Alert.alert('Error', 'No se pudo guardar la preferencia.');
    } finally {
      setIsSavingModule(false);
    }
  };

  // -------------------------------------------------------------------------
  // DELETE ACCOUNT
  // -------------------------------------------------------------------------
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');

  const handleDeleteAccount = () => {
    if (deleteConfirmText !== 'ELIMINAR') {
      Alert.alert('Error', 'Debes escribir ELIMINAR para confirmar.');
      return;
    }

    Alert.alert(
      'Eliminar Cuenta Permanentemente',
      'Esta acción es IRREVERSIBLE. Se eliminarán todos tus datos, entrenamientos, récords, fotos y suscripciones. ¿Estás completamente seguro?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Sí, eliminar todo',
          style: 'destructive',
          onPress: async () => {
            setIsDeletingAccount(true);
            try {
              if (!user) throw new Error('No hay sesión activa');

              // 1. Cancel active subscription if exists
              if (
                subscription &&
                subscription.status === 'active' &&
                subscription.openpay_subscription_id
              ) {
                try {
                  await cancelSubscription(subscription.openpay_subscription_id);
                } catch (subErr) {
                  console.warn('Error cancelling subscription during account deletion:', subErr);
                }
              }

              // 2. Delete user data from all tables
              const tablesToClean = [
                'user_profiles',
                'profiles',
                'training_sessions',
                'personal_records',
                'meals',
                'supplement_stack',
                'workout_block_position',
                'subscriptions',
                'customer_cards',
                'progress_photos',
                'feed_videos',
              ];

              for (const table of tablesToClean) {
                try {
                  await supabase
                    .from(table)
                    .delete()
                    .eq(table === 'profiles' ? 'id' : 'user_id', user.id);
                } catch (e) {
                  console.warn(`Error cleaning ${table}:`, e);
                }
              }

              // 3. Delete avatar from R2 if exists
              if (profile?.avatar_url) {
                try {
                  await cloudflareR2.deleteAvatar(profile.avatar_url);
                } catch (e) {
                  console.warn('Error deleting avatar:', e);
                }
              }

              // 4. Call edge function to delete auth user
              const { error: deleteError } = await supabase.functions.invoke('admin-users', {
                body: { action: 'delete', userId: user.id },
              });

              if (deleteError) {
                console.warn('Edge function delete error:', deleteError);
              }

              // 5. Sign out
              await supabase.auth.signOut();

              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              onClose();
            } catch (err: any) {
              Alert.alert(
                'Error',
                err.message || 'No se pudo eliminar la cuenta. Contacta a soporte.'
              );
            } finally {
              setIsDeletingAccount(false);
            }
          },
        },
      ]
    );
  };

  // -------------------------------------------------------------------------
  // LOGOUT
  // -------------------------------------------------------------------------
  const handleLogout = () => {
    Alert.alert('Cerrar Sesión', '¿Estás seguro de que deseas cerrar sesión?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Cerrar Sesión',
        style: 'destructive',
        onPress: async () => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          await supabase.auth.signOut();
          onClose();
        },
      },
    ]);
  };

  // -------------------------------------------------------------------------
  // NAVIGATION HELPER
  // -------------------------------------------------------------------------
  const goTo = (s: Section) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSection(s);
  };

  const goBack = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (section === 'main') {
      onClose();
    } else {
      setSection('main');
    }
  };

  // -------------------------------------------------------------------------
  // FORMAT HELPERS
  // -------------------------------------------------------------------------
  const formatDate = (dateStr: string | null | undefined): string => {
    if (!dateStr) return '—';
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch {
      return '—';
    }
  };

  const getStatusColor = (status: string): string => {
    switch (status) {
      case 'active':
        return '#22C55E';
      case 'cancelled':
        return '#EF4444';
      case 'past_due':
        return '#F59E0B';
      case 'trialing':
        return '#3B82F6';
      default:
        return '#71717A';
    }
  };

  const getStatusLabel = (status: string): string => {
    switch (status) {
      case 'active':
        return 'ACTIVA';
      case 'cancelled':
        return 'CANCELADA';
      case 'past_due':
        return 'PAGO PENDIENTE';
      case 'trialing':
        return 'PRUEBA';
      case 'unpaid':
        return 'IMPAGA';
      default:
        return status.toUpperCase();
    }
  };

  // =========================================================================
  // RENDER: MAIN MENU
  // =========================================================================
  const renderMainMenu = () => (
    <View className="flex-1">
      {/* User Header */}
      <View className="items-center mb-8">
        <View
          className="w-24 h-24 rounded-full items-center justify-center mb-3"
          style={{ borderWidth: 3, borderColor: isPro ? '#F97316' : '#3F3F46' }}
        >
          <View className="w-20 h-20 rounded-full bg-zinc-800 overflow-hidden">
            {profile?.avatar_url ? (
              <Image
                source={{ uri: profile.avatar_url }}
                className="w-full h-full"
                resizeMode="cover"
              />
            ) : (
              <LinearGradient
                colors={['#DC2626', '#F97316']}
                className="w-full h-full items-center justify-center"
              >
                <Text className="text-white text-3xl font-black">
                  {profile?.display_name?.charAt(0) || 'A'}
                </Text>
              </LinearGradient>
            )}
          </View>
        </View>
        <Text className="text-white text-xl font-bold">{profile?.display_name || 'Atleta'}</Text>
        <Text className="text-zinc-500 text-sm mt-1">{user?.email || ''}</Text>
        {isPro && (
          <View className="flex-row items-center gap-1 mt-2 px-3 py-1 bg-orange-500/20 rounded-full border border-orange-500/40">
            <Crown size={12} color="#F97316" />
            <Text className="text-orange-400 text-xs font-bold uppercase tracking-widest">PRO</Text>
          </View>
        )}
      </View>

      {/* Menu Items */}
      <View className="gap-1">
        {/* Editar Perfil */}
        <MenuItem
          icon={<User size={20} color="#F97316" />}
          label="Editar Perfil"
          sublabel="Nombre y foto de perfil"
          onPress={() => goTo('profile')}
        />

        {/* Suscripción */}
        <MenuItem
          icon={<Crown size={20} color={isPro ? '#F97316' : '#71717A'} />}
          label="Suscripción"
          sublabel={
            isPro
              ? hasIAPSubscription
                ? isIOS
                  ? 'PRO via App Store'
                  : 'PRO via Google Play'
                : hasOpenpaySubscription
                  ? 'PRO via OpenPay'
                  : 'TRENS PRO activa'
              : 'Plan gratuito'
          }
          onPress={() => goTo('subscription')}
          badge={isPro ? 'PRO' : undefined}
        />

        {/* Métodos de Pago */}
        <MenuItem
          icon={<CreditCard size={20} color="#F97316" />}
          label="Métodos de Pago"
          sublabel="Tarjetas guardadas"
          onPress={() => goTo('cards')}
        />

        {/* Información Personal */}
        <MenuItem
          icon={<Phone size={20} color="#F97316" />}
          label="Información Personal"
          sublabel="Teléfono y datos de contacto"
          onPress={() => goTo('personal')}
        />

        {/* Cambiar Contraseña */}
        <MenuItem
          icon={<Lock size={20} color="#F97316" />}
          label="Cambiar Contraseña"
          sublabel="Actualiza tu contraseña"
          onPress={() => goTo('password')}
        />
      </View>

      {/* Default Module Selector */}
      <View className="mt-6 mb-2">
        <Text className="text-xs text-zinc-500 uppercase tracking-widest font-bold mb-3">
          MÓDULO PREDETERMINADO
        </Text>
        <Text className="text-zinc-600 text-xs mb-3">
          Elige qué módulo se abre al iniciar la app
        </Text>
        <View className="bg-zinc-800/40 rounded-2xl border border-zinc-800/60 overflow-hidden">
          {/* TRENS (Feed) Option */}
          <TouchableOpacity
            onPress={() => toggleDefaultModule('feed')}
            className={`flex-row items-center gap-4 p-4 ${
              defaultModule === 'feed' ? 'bg-red-600/10' : ''
            }`}
            activeOpacity={0.7}
            disabled={isSavingModule}
          >
            <View
              className={`w-10 h-10 rounded-xl items-center justify-center ${
                defaultModule === 'feed' ? 'bg-red-600/20' : 'bg-zinc-800'
              }`}
            >
              <Play
                size={20}
                color={defaultModule === 'feed' ? '#DC2626' : '#71717A'}
                fill={defaultModule === 'feed' ? '#DC2626' : 'transparent'}
              />
            </View>
            <View className="flex-1">
              <Text
                className={`font-bold ${defaultModule === 'feed' ? 'text-white' : 'text-zinc-400'}`}
              >
                TRENS
              </Text>
              <Text className="text-zinc-500 text-xs mt-0.5">Feed de videos</Text>
            </View>
            <View
              className={`w-6 h-6 rounded-full border-2 items-center justify-center ${
                defaultModule === 'feed' ? 'border-red-600 bg-red-600' : 'border-zinc-600'
              }`}
            >
              {defaultModule === 'feed' && <CheckCircle size={14} color="#fff" />}
            </View>
          </TouchableOpacity>

          {/* Divider */}
          <View className="h-px bg-zinc-700/30 mx-4" />

          {/* ADN Option */}
          <TouchableOpacity
            onPress={() => toggleDefaultModule('adn')}
            className={`flex-row items-center gap-4 p-4 ${
              defaultModule === 'adn' ? 'bg-red-600/10' : ''
            }`}
            activeOpacity={0.7}
            disabled={isSavingModule}
          >
            <View
              className={`w-10 h-10 rounded-xl items-center justify-center ${
                defaultModule === 'adn' ? 'bg-red-600/20' : 'bg-zinc-800'
              }`}
            >
              <Dna size={20} color={defaultModule === 'adn' ? '#DC2626' : '#71717A'} />
            </View>
            <View className="flex-1">
              <Text
                className={`font-bold ${defaultModule === 'adn' ? 'text-white' : 'text-zinc-400'}`}
              >
                ADN
              </Text>
              <Text className="text-zinc-500 text-xs mt-0.5">Perfil atlético</Text>
            </View>
            <View
              className={`w-6 h-6 rounded-full border-2 items-center justify-center ${
                defaultModule === 'adn' ? 'border-red-600 bg-red-600' : 'border-zinc-600'
              }`}
            >
              {defaultModule === 'adn' && <CheckCircle size={14} color="#fff" />}
            </View>
          </TouchableOpacity>
        </View>
        {isSavingModule && <ActivityIndicator color="#DC2626" size="small" className="mt-2" />}
      </View>

      {/* Footer Actions */}
      <View className="mt-8 pt-6 border-t border-zinc-800/50">
        {/* Soporte */}
        <TouchableOpacity
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            Linking.openURL('mailto:soporte@trens.app?subject=Soporte%20TRENS');
          }}
          className="flex-row items-center justify-center gap-2 py-3 mb-3"
        >
          <Mail size={16} color="#71717A" />
          <Text className="text-zinc-500 text-sm">Soporte</Text>
        </TouchableOpacity>

        {/* Cerrar sesión */}
        <TouchableOpacity
          onPress={handleLogout}
          className="flex-row items-center justify-center gap-2 py-3 mb-3"
        >
          <LogOut size={16} color="#EF4444" />
          <Text className="text-red-500 text-sm font-medium">Cerrar Sesión</Text>
        </TouchableOpacity>

        {/* Eliminar Cuenta */}
        <TouchableOpacity
          onPress={() => goTo('delete-account')}
          className="flex-row items-center justify-center gap-2 py-3"
        >
          <UserX size={14} color="#52525B" />
          <Text className="text-zinc-600 text-xs">Eliminar mi cuenta</Text>
        </TouchableOpacity>
      </View>

      {/* Version */}
      <Text className="text-zinc-700 text-xs text-center mt-6">TRENS v1.0.1</Text>
    </View>
  );

  // =========================================================================
  // RENDER: EDIT PROFILE
  // =========================================================================
  const renderProfileSection = () => (
    <View className="flex-1">
      <Text className="text-xs text-zinc-500 uppercase tracking-widest mb-4 font-bold">
        EDITAR PERFIL
      </Text>

      {/* Avatar */}
      <View className="items-center mb-6">
        <View
          className="w-28 h-28 rounded-full items-center justify-center mb-4"
          style={{ borderWidth: 3, borderColor: '#F97316' }}
        >
          <View className="w-24 h-24 rounded-full bg-zinc-800 overflow-hidden">
            {editAvatarUri ? (
              <Image source={{ uri: editAvatarUri }} className="w-full h-full" resizeMode="cover" />
            ) : profile?.avatar_url ? (
              <Image
                source={{ uri: profile.avatar_url }}
                className="w-full h-full"
                resizeMode="cover"
              />
            ) : (
              <LinearGradient
                colors={['#DC2626', '#F97316']}
                className="w-full h-full items-center justify-center"
              >
                <Text className="text-white text-4xl font-black">{editName?.charAt(0) || 'A'}</Text>
              </LinearGradient>
            )}
          </View>
        </View>

        <View className="flex-row gap-3">
          <TouchableOpacity
            onPress={takePhoto}
            className="flex-row items-center gap-2 px-4 py-2 bg-zinc-800 rounded-full"
          >
            <Camera size={16} color="#F97316" />
            <Text className="text-white font-medium text-sm">Cámara</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={pickImageFromGallery}
            className="flex-row items-center gap-2 px-4 py-2 bg-zinc-800 rounded-full"
          >
            <ImageIcon size={16} color="#F97316" />
            <Text className="text-white font-medium text-sm">Galería</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Name Input */}
      <View className="mb-6">
        <Text className="text-zinc-400 text-sm mb-2">Nombre</Text>
        <TextInput
          value={editName}
          onChangeText={setEditName}
          placeholder="Tu nombre"
          placeholderTextColor="#52525b"
          className="bg-zinc-800 text-white text-lg p-4 rounded-xl border border-zinc-700"
          autoCapitalize="words"
        />
      </View>

      {/* Email (read-only) */}
      <View className="mb-6">
        <Text className="text-zinc-400 text-sm mb-2">Correo electrónico</Text>
        <View className="bg-zinc-800/50 p-4 rounded-xl border border-zinc-700/50">
          <Text className="text-zinc-500 text-lg">{user?.email || '—'}</Text>
        </View>
      </View>

      {/* Save Button */}
      <TouchableOpacity
        onPress={saveProfile}
        disabled={isSavingProfile}
        className={`py-4 rounded-xl ${isSavingProfile ? 'bg-zinc-700' : 'bg-red-600'}`}
      >
        {isSavingProfile ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text className="text-white text-center font-bold text-lg uppercase tracking-widest">
            Guardar
          </Text>
        )}
      </TouchableOpacity>
    </View>
  );

  // =========================================================================
  // RENDER: SUBSCRIPTION (HYBRID)
  // =========================================================================
  const renderSubscriptionSection = () => {
    const iapInfo = subscriptionCtx?.iapInfo;
    const activeSource = subscriptionCtx?.activeSource || 'none';

    return (
      <View className="flex-1">
        <Text className="text-xs text-zinc-500 uppercase tracking-widest mb-4 font-bold">
          SUSCRIPCIÓN
        </Text>

        {loadingSub || subscriptionCtx?.isLoading ? (
          <View className="items-center py-12">
            <ActivityIndicator color="#F97316" size="large" />
          </View>
        ) : isPro ? (
          <View>
            {/* ============ IAP SUBSCRIPTION (iOS/Android) ============ */}
            {activeSource === 'iap' && iapInfo ? (
              <View>
                {/* Plan Card - IAP */}
                <View className="bg-zinc-800/60 rounded-2xl p-5 border border-zinc-700/50 mb-4">
                  <View className="flex-row items-center justify-between mb-4">
                    <View className="flex-row items-center gap-2">
                      <Crown size={22} color="#F97316" />
                      <Text className="text-white text-lg font-bold">TRENS PRO</Text>
                    </View>
                    <View className="px-3 py-1 rounded-full bg-green-500/20 border border-green-500/60">
                      <Text className="text-xs font-bold uppercase tracking-widest text-green-400">
                        ACTIVA
                      </Text>
                    </View>
                  </View>

                  {/* Store badge */}
                  <View className="flex-row items-center gap-2 mb-4 px-3 py-2 bg-zinc-900/60 rounded-xl">
                    <Smartphone size={16} color="#71717A" />
                    <Text className="text-zinc-400 text-sm">
                      {iapInfo.store === 'APP_STORE'
                        ? 'Suscripción via App Store'
                        : 'Suscripción via Google Play'}
                    </Text>
                  </View>

                  {/* Details */}
                  <View className="gap-3">
                    <DetailRow
                      icon={<CalendarDays size={16} color="#71717A" />}
                      label="Vence"
                      value={iapInfo.expirationDate ? formatDate(iapInfo.expirationDate) : '—'}
                    />
                    <DetailRow
                      icon={
                        <CheckCircle size={16} color={iapInfo.willRenew ? '#22C55E' : '#F59E0B'} />
                      }
                      label="Renovación"
                      value={iapInfo.willRenew ? 'Automática' : 'No renovará'}
                    />
                  </View>
                </View>

                {/* Features */}
                {renderFeaturesCard()}

                {/* Manage via Store */}
                <TouchableOpacity
                  onPress={async () => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    if (subscriptionCtx) {
                      await subscriptionCtx.manageSubscription();
                    }
                  }}
                  className="flex-row items-center justify-center gap-2 py-4 rounded-xl border border-zinc-700 mt-4"
                >
                  <ExternalLink size={16} color="#71717A" />
                  <Text className="text-zinc-400 text-sm">
                    {isIOS ? 'Gestionar en App Store' : 'Gestionar en Google Play'}
                  </Text>
                </TouchableOpacity>

                <View className="flex-row items-start gap-2 mt-3 p-3 bg-zinc-800/40 rounded-xl">
                  <AlertCircle size={14} color="#71717A" />
                  <Text className="text-zinc-500 text-xs flex-1">
                    Para cancelar o cambiar tu suscripción, usa la configuración de{' '}
                    {isIOS ? 'App Store' : 'Google Play'}. Los cambios se aplican al final del
                    período actual.
                  </Text>
                </View>
              </View>
            ) : subscription ? (
              /* ============ OPENPAY SUBSCRIPTION (Web) ============ */
              <View>
                {/* Plan Card - OpenPay */}
                <View className="bg-zinc-800/60 rounded-2xl p-5 border border-zinc-700/50 mb-4">
                  <View className="flex-row items-center justify-between mb-4">
                    <View className="flex-row items-center gap-2">
                      <Crown size={22} color="#F97316" />
                      <Text className="text-white text-lg font-bold">TRENS PRO</Text>
                    </View>
                    <View
                      className="px-3 py-1 rounded-full"
                      style={{
                        backgroundColor: getStatusColor(subscription.status) + '20',
                        borderWidth: 1,
                        borderColor: getStatusColor(subscription.status) + '60',
                      }}
                    >
                      <Text
                        className="text-xs font-bold uppercase tracking-widest"
                        style={{ color: getStatusColor(subscription.status) }}
                      >
                        {getStatusLabel(subscription.status)}
                      </Text>
                    </View>
                  </View>

                  {/* Source badge */}
                  <View className="flex-row items-center gap-2 mb-4 px-3 py-2 bg-zinc-900/60 rounded-xl">
                    <Globe size={16} color="#71717A" />
                    <Text className="text-zinc-400 text-sm">Suscripción via OpenPay</Text>
                  </View>

                  {/* Price */}
                  <View className="flex-row items-baseline gap-1 mb-4">
                    <Text className="text-white text-3xl font-black font-mono">
                      S/ {subscription.amount?.toFixed(2) || '59.90'}
                    </Text>
                    <Text className="text-zinc-500 text-sm">/ mes</Text>
                  </View>

                  {/* Details */}
                  <View className="gap-3">
                    <DetailRow
                      icon={<CalendarDays size={16} color="#71717A" />}
                      label="Inicio del período"
                      value={formatDate(subscription.current_period_start)}
                    />
                    <DetailRow
                      icon={<CalendarDays size={16} color="#71717A" />}
                      label="Próximo cobro"
                      value={formatDate(subscription.current_period_end)}
                    />
                    <DetailRow
                      icon={<CreditCard size={16} color="#71717A" />}
                      label="Tarjeta"
                      value={
                        subscription.openpay_card_last4
                          ? `${subscription.openpay_card_brand?.toUpperCase() || 'TARJETA'} •••• ${subscription.openpay_card_last4}`
                          : '—'
                      }
                    />
                  </View>
                </View>

                {/* Features */}
                {renderFeaturesCard()}

                {/* Cancel Button - OpenPay */}
                {subscription.status === 'active' && (
                  <TouchableOpacity
                    onPress={handleCancelSubscription}
                    disabled={isCancelling}
                    className="py-3 rounded-xl border border-zinc-700 mt-4"
                  >
                    {isCancelling ? (
                      <ActivityIndicator color="#EF4444" />
                    ) : (
                      <Text className="text-zinc-500 text-center text-sm">
                        Cancelar suscripción
                      </Text>
                    )}
                  </TouchableOpacity>
                )}

                {subscription.status === 'cancelled' && (
                  <View className="bg-red-500/10 rounded-xl p-4 border border-red-500/20 mt-4">
                    <View className="flex-row items-center gap-2 mb-1">
                      <AlertCircle size={16} color="#EF4444" />
                      <Text className="text-red-400 font-bold text-sm">Suscripción cancelada</Text>
                    </View>
                    <Text className="text-zinc-400 text-xs">
                      Tu acceso PRO continuará hasta el{' '}
                      {formatDate(subscription.current_period_end)}.
                    </Text>
                  </View>
                )}
              </View>
            ) : (
              /* PRO but no subscription found (admin/ceo grant) */
              <View>
                <View className="bg-zinc-800/60 rounded-2xl p-5 border border-zinc-700/50 mb-4">
                  <View className="flex-row items-center gap-2 mb-3">
                    <Crown size={22} color="#F97316" />
                    <Text className="text-white text-lg font-bold">TRENS PRO</Text>
                  </View>
                  <View className="px-3 py-1 rounded-full bg-green-500/20 border border-green-500/60 self-start mb-3">
                    <Text className="text-xs font-bold uppercase tracking-widest text-green-400">
                      ACTIVA
                    </Text>
                  </View>
                  <Text className="text-zinc-400 text-sm">
                    Tu acceso PRO fue otorgado por el administrador.
                  </Text>
                </View>
                {renderFeaturesCard()}
              </View>
            )}
          </View>
        ) : (
          /* ============ FREE PLAN ============ */
          <View>
            <View className="bg-zinc-800/60 rounded-2xl p-5 border border-zinc-700/50 mb-4">
              <View className="flex-row items-center gap-2 mb-3">
                <Zap size={22} color="#71717A" />
                <Text className="text-white text-lg font-bold">Plan Gratuito</Text>
              </View>
              <Text className="text-zinc-400 text-sm mb-4">
                Funciones básicas de entrenamiento. Actualiza a PRO para desbloquear todo el
                potencial de TRENS.
              </Text>

              <View className="gap-2">
                {[
                  'Grabación de videos',
                  'Bóveda personal',
                  'Historial completo',
                  'Asistente HANK con IA',
                  'Nutrición personalizada',
                ].map((feat) => (
                  <View key={feat} className="flex-row items-center gap-2">
                    <Lock size={14} color="#52525B" />
                    <Text className="text-zinc-500 text-sm">{feat}</Text>
                  </View>
                ))}
              </View>
            </View>

            {/* Upgrade Button - Platform aware */}
            <TouchableOpacity
              onPress={() => {
                onClose();
              }}
              className="overflow-hidden rounded-xl"
            >
              <LinearGradient
                colors={['#DC2626', '#F97316']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                className="py-4 items-center"
              >
                <View className="flex-row items-center gap-2">
                  <Crown size={18} color="#fff" />
                  <Text className="text-white text-center font-bold text-lg uppercase tracking-widest">
                    Hazte PRO —{' '}
                    {subscriptionCtx
                      ? isWeb
                        ? subscriptionCtx.webPrice
                        : subscriptionCtx.nativePrice
                      : 'S/ 59.90/mes'}
                  </Text>
                </View>
              </LinearGradient>
            </TouchableOpacity>

            {/* Restore (native only) */}
            {isNative && subscriptionCtx && (
              <TouchableOpacity
                onPress={async () => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  const result = await subscriptionCtx.restorePurchases();
                  if (result.success) {
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                    Alert.alert('Compras restauradas', 'Tu suscripción PRO ha sido restaurada.');
                    fetchSubscription();
                  } else {
                    Alert.alert(
                      'Sin compras',
                      result.error || 'No se encontraron compras anteriores.'
                    );
                  }
                }}
                className="flex-row items-center justify-center gap-2 py-3 mt-3"
              >
                <RotateCcw size={14} color="#71717A" />
                <Text className="text-zinc-500 text-sm">Restaurar compras</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>
    );
  };

  // Helper: Features card (reutilizable)
  const renderFeaturesCard = () => (
    <View className="bg-zinc-800/30 rounded-2xl p-5 border border-zinc-700/30">
      <Text className="text-zinc-400 text-xs uppercase tracking-widest font-bold mb-3">
        TU PLAN INCLUYE
      </Text>
      <View className="gap-2">
        {[
          'Grabación de videos ilimitada',
          'Bóveda personal',
          'Registro de PRs y récords',
          'Historial de entrenamientos',
          'Sincronización con Spotify',
          'Nutrición personalizada',
          'Asistente HANK con IA',
          'Fotos de progreso',
          'Métricas ADN atlético',
        ].map((feat) => (
          <View key={feat} className="flex-row items-center gap-2">
            <CheckCircle size={14} color="#22C55E" />
            <Text className="text-zinc-300 text-sm">{feat}</Text>
          </View>
        ))}
      </View>
    </View>
  );

  // =========================================================================
  // RENDER: CARDS (solo para suscripciones OpenPay / tarjetas guardadas)
  // =========================================================================
  const renderCardsSection = () => (
    <View className="flex-1">
      {/* Show IAP notice if subscription is via IAP */}
      {hasIAPSubscription && (
        <View className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 mb-4">
          <View className="flex-row items-center gap-2 mb-1">
            <Smartphone size={16} color="#3B82F6" />
            <Text className="text-blue-400 font-bold text-sm">Pago via tienda</Text>
          </View>
          <Text className="text-zinc-400 text-xs">
            Tu suscripción se cobra a través de {isIOS ? 'App Store' : 'Google Play'}. La gestión de
            pago se hace desde la configuración de tu dispositivo.
          </Text>
        </View>
      )}

      <Text className="text-xs text-zinc-500 uppercase tracking-widest mb-4 font-bold">
        {hasIAPSubscription ? 'TARJETAS GUARDADAS' : 'MÉTODOS DE PAGO'}
      </Text>

      {/* Add Card Form (inline) */}
      {showAddForm ? (
        <AddCardForm onCardAdded={handleCardAdded} onCancel={() => setShowAddForm(false)} />
      ) : (
        <>
          {loadingCards ? (
            <View className="items-center py-12">
              <ActivityIndicator color="#F97316" size="large" />
            </View>
          ) : cards.length === 0 ? (
            <View className="items-center py-12">
              <CreditCard size={48} color="#3F3F46" />
              <Text className="text-zinc-500 text-center mt-4">No tienes tarjetas guardadas</Text>
              <Text className="text-zinc-600 text-center text-sm mt-1">
                Agrega una tarjeta para gestionar tus pagos
              </Text>
            </View>
          ) : (
            <View className="gap-3">
              {cards.map((card) => {
                const isOnlyCard = cards.length === 1;
                const hasActiveSub =
                  subscription && ['active', 'past_due'].includes(subscription.status);
                const canDelete = !(isOnlyCard && hasActiveSub);

                return (
                  <View
                    key={card.id}
                    className={`bg-zinc-800/60 rounded-2xl p-4 border ${
                      card.is_default ? 'border-orange-500/50' : 'border-zinc-700/50'
                    }`}
                  >
                    <View className="flex-row items-center justify-between">
                      <View className="flex-row items-center gap-3 flex-1">
                        <View
                          className={`w-12 h-8 rounded-lg items-center justify-center ${
                            card.is_default ? 'bg-orange-500/20' : 'bg-zinc-700'
                          }`}
                        >
                          <CreditCard size={18} color={card.is_default ? '#F97316' : '#71717A'} />
                        </View>
                        <View className="flex-1">
                          <View className="flex-row items-center gap-2">
                            <Text className="text-white font-bold">
                              {card.brand?.toUpperCase() || 'TARJETA'}
                            </Text>
                            <Text className="text-zinc-400 font-mono">•••• {card.last4}</Text>
                          </View>
                          <Text className="text-zinc-500 text-xs mt-0.5">
                            {card.holder_name} · Exp {card.expiration_month}/{card.expiration_year}
                          </Text>
                        </View>
                      </View>

                      {/* Actions */}
                      <View className="flex-row items-center gap-1">
                        {/* Delete button */}
                        <TouchableOpacity
                          onPress={() => handleDeleteCard(card)}
                          disabled={
                            deletingCardId === card.openpay_card_id || settingDefaultId !== null
                          }
                          className="p-2"
                          style={{ opacity: canDelete ? 1 : 0.3 }}
                        >
                          {deletingCardId === card.openpay_card_id ? (
                            <ActivityIndicator color="#EF4444" size="small" />
                          ) : (
                            <Trash2 size={16} color="#71717A" />
                          )}
                        </TouchableOpacity>
                      </View>
                    </View>

                    {/* Set as Default / Default badge */}
                    <View className="mt-3 pt-3 border-t border-zinc-700/30">
                      {card.is_default ? (
                        <View className="flex-row items-center gap-2">
                          <Star size={14} color="#F97316" fill="#F97316" />
                          <Text className="text-orange-400 text-xs font-bold uppercase tracking-widest">
                            Tarjeta predeterminada
                          </Text>
                        </View>
                      ) : (
                        <TouchableOpacity
                          onPress={() => handleSetDefault(card)}
                          disabled={settingDefaultId !== null}
                          className="flex-row items-center gap-2"
                        >
                          {settingDefaultId === card.openpay_card_id ? (
                            <>
                              <ActivityIndicator color="#F97316" size="small" />
                              <Text className="text-zinc-400 text-xs">
                                {subscription &&
                                ['active', 'past_due'].includes(subscription.status)
                                  ? 'Cambiando tarjeta de cobro...'
                                  : 'Estableciendo...'}
                              </Text>
                            </>
                          ) : (
                            <>
                              <Star size={14} color="#71717A" />
                              <Text className="text-zinc-400 text-xs">
                                Usar como predeterminada
                              </Text>
                            </>
                          )}
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                );
              })}
            </View>
          )}

          {/* Add Card Button */}
          <TouchableOpacity
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setShowAddForm(true);
            }}
            className="flex-row items-center justify-center gap-2 mt-6 py-4 rounded-xl border border-dashed border-zinc-600"
          >
            <Plus size={18} color="#F97316" />
            <Text className="text-orange-400 font-bold text-sm uppercase tracking-widest">
              Agregar Tarjeta
            </Text>
          </TouchableOpacity>

          {/* Info note */}
          {cards.length > 0 &&
            subscription &&
            ['active', 'past_due'].includes(subscription.status) && (
              <View className="flex-row items-start gap-2 mt-4 p-3 bg-zinc-800/40 rounded-xl">
                <AlertCircle size={14} color="#71717A" className="mt-0.5" />
                <Text className="text-zinc-500 text-xs flex-1">
                  La tarjeta predeterminada se usa para el cobro de tu suscripción. Si falla, se
                  intentará con tus otras tarjetas automáticamente.
                </Text>
              </View>
            )}
        </>
      )}
    </View>
  );

  // =========================================================================
  // RENDER: PASSWORD
  // =========================================================================
  const renderPasswordSection = () => (
    <View className="flex-1">
      <Text className="text-xs text-zinc-500 uppercase tracking-widest mb-4 font-bold">
        CAMBIAR CONTRASEÑA
      </Text>

      <View className="gap-4 mb-6">
        {/* New Password */}
        <View>
          <Text className="text-zinc-400 text-sm mb-2">Nueva contraseña</Text>
          <View className="flex-row items-center bg-zinc-800 rounded-xl border border-zinc-700">
            <TextInput
              value={newPassword}
              onChangeText={setNewPassword}
              placeholder="Mínimo 6 caracteres"
              placeholderTextColor="#52525b"
              secureTextEntry={!showNewPassword}
              className="flex-1 text-white text-lg p-4"
              autoCapitalize="none"
            />
            <TouchableOpacity onPress={() => setShowNewPassword(!showNewPassword)} className="px-4">
              {showNewPassword ? (
                <EyeOff size={20} color="#71717A" />
              ) : (
                <Eye size={20} color="#71717A" />
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* Confirm Password */}
        <View>
          <Text className="text-zinc-400 text-sm mb-2">Confirmar contraseña</Text>
          <TextInput
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            placeholder="Repite tu contraseña"
            placeholderTextColor="#52525b"
            secureTextEntry={!showNewPassword}
            className="bg-zinc-800 text-white text-lg p-4 rounded-xl border border-zinc-700"
            autoCapitalize="none"
          />
        </View>

        {/* Password strength indicator */}
        {newPassword.length > 0 && (
          <View className="flex-row items-center gap-2">
            {newPassword.length < 6 ? (
              <>
                <AlertCircle size={14} color="#EF4444" />
                <Text className="text-red-400 text-xs">Muy corta</Text>
              </>
            ) : newPassword.length < 10 ? (
              <>
                <AlertCircle size={14} color="#F59E0B" />
                <Text className="text-yellow-400 text-xs">Aceptable</Text>
              </>
            ) : (
              <>
                <CheckCircle size={14} color="#22C55E" />
                <Text className="text-green-400 text-xs">Fuerte</Text>
              </>
            )}
          </View>
        )}
      </View>

      <TouchableOpacity
        onPress={changePassword}
        disabled={isSavingPassword || !newPassword || !confirmPassword}
        className={`py-4 rounded-xl ${
          isSavingPassword || !newPassword || !confirmPassword ? 'bg-zinc-700' : 'bg-red-600'
        }`}
      >
        {isSavingPassword ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text className="text-white text-center font-bold text-lg uppercase tracking-widest">
            Actualizar Contraseña
          </Text>
        )}
      </TouchableOpacity>
    </View>
  );

  // =========================================================================
  // RENDER: PERSONAL INFO
  // =========================================================================
  const renderPersonalSection = () => (
    <View className="flex-1">
      <Text className="text-xs text-zinc-500 uppercase tracking-widest mb-4 font-bold">
        INFORMACIÓN PERSONAL
      </Text>

      <View className="gap-4 mb-6">
        {/* Email (read-only) */}
        <View>
          <Text className="text-zinc-400 text-sm mb-2">Correo electrónico</Text>
          <View className="bg-zinc-800/50 p-4 rounded-xl border border-zinc-700/50 flex-row items-center gap-3">
            <Mail size={18} color="#52525B" />
            <Text className="text-zinc-500 text-lg flex-1">{user?.email || '—'}</Text>
            <Lock size={14} color="#3F3F46" />
          </View>
          <Text className="text-zinc-600 text-xs mt-1">
            El correo no se puede cambiar desde aquí
          </Text>
        </View>

        {/* Phone */}
        <View>
          <Text className="text-zinc-400 text-sm mb-2">Teléfono</Text>
          <View className="flex-row items-center bg-zinc-800 rounded-xl border border-zinc-700">
            <View className="pl-4">
              <Phone size={18} color="#71717A" />
            </View>
            <TextInput
              value={editPhone}
              onChangeText={setEditPhone}
              placeholder="+51 999 999 999"
              placeholderTextColor="#52525b"
              className="flex-1 text-white text-lg p-4"
              keyboardType="phone-pad"
            />
          </View>
        </View>

        {/* User ID */}
        <View>
          <Text className="text-zinc-400 text-sm mb-2">ID de usuario</Text>
          <View className="bg-zinc-800/50 p-4 rounded-xl border border-zinc-700/50">
            <Text className="text-zinc-600 text-xs font-mono" numberOfLines={1}>
              {user?.id || '—'}
            </Text>
          </View>
        </View>

        {/* Account creation date */}
        <View>
          <Text className="text-zinc-400 text-sm mb-2">Cuenta creada</Text>
          <View className="bg-zinc-800/50 p-4 rounded-xl border border-zinc-700/50 flex-row items-center gap-3">
            <CalendarDays size={18} color="#52525B" />
            <Text className="text-zinc-500 text-sm">
              {user?.created_at ? formatDate(user.created_at) : '—'}
            </Text>
          </View>
        </View>
      </View>

      <TouchableOpacity
        onPress={savePersonalInfo}
        disabled={isSavingPersonal}
        className={`py-4 rounded-xl ${isSavingPersonal ? 'bg-zinc-700' : 'bg-red-600'}`}
      >
        {isSavingPersonal ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text className="text-white text-center font-bold text-lg uppercase tracking-widest">
            Guardar
          </Text>
        )}
      </TouchableOpacity>
    </View>
  );

  // =========================================================================
  // RENDER: DELETE ACCOUNT
  // =========================================================================
  const renderDeleteAccountSection = () => (
    <View className="flex-1">
      {/* Warning Header */}
      <View className="bg-red-950/30 border border-red-500/30 rounded-2xl p-5 mb-6">
        <View className="flex-row items-center gap-3 mb-3">
          <View className="w-12 h-12 rounded-full bg-red-500/20 items-center justify-center">
            <ShieldAlert size={24} color="#EF4444" />
          </View>
          <View className="flex-1">
            <Text className="text-red-400 text-lg font-bold">Zona de Peligro</Text>
            <Text className="text-red-400/60 text-xs mt-0.5">Esta acción es irreversible</Text>
          </View>
        </View>
        <Text className="text-zinc-400 text-sm leading-6">
          Al eliminar tu cuenta se borrarán permanentemente:
        </Text>
        <View className="mt-3 gap-2">
          {[
            'Tu perfil y datos personales',
            'Todos tus entrenamientos y récords',
            'Fotos de progreso',
            'Plan nutricional y suplementos',
            'Videos subidos a la bóveda',
            'Suscripción activa (si la tienes)',
            'Tarjetas guardadas',
          ].map((item) => (
            <View key={item} className="flex-row items-center gap-2">
              <Trash2 size={12} color="#EF4444" />
              <Text className="text-zinc-400 text-sm">{item}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Confirmation Input */}
      <View className="mb-6">
        <Text className="text-zinc-400 text-sm mb-2">
          Escribe <Text className="text-red-400 font-bold">ELIMINAR</Text> para confirmar:
        </Text>
        <TextInput
          value={deleteConfirmText}
          onChangeText={setDeleteConfirmText}
          placeholder="Escribe ELIMINAR"
          placeholderTextColor="#52525b"
          className="bg-zinc-800 text-white text-lg p-4 rounded-xl border border-red-900/50"
          autoCapitalize="characters"
          autoCorrect={false}
        />
      </View>

      {/* Delete Button */}
      <TouchableOpacity
        onPress={handleDeleteAccount}
        disabled={isDeletingAccount || deleteConfirmText !== 'ELIMINAR'}
        className={`py-4 rounded-xl ${
          isDeletingAccount || deleteConfirmText !== 'ELIMINAR'
            ? 'bg-zinc-800 border border-zinc-700'
            : 'bg-red-600'
        }`}
      >
        {isDeletingAccount ? (
          <View className="flex-row items-center justify-center gap-2">
            <ActivityIndicator color="#EF4444" />
            <Text className="text-red-400 font-bold">Eliminando cuenta...</Text>
          </View>
        ) : (
          <View className="flex-row items-center justify-center gap-2">
            <UserX size={18} color={deleteConfirmText === 'ELIMINAR' ? '#fff' : '#52525B'} />
            <Text
              className={`text-center font-bold text-lg uppercase tracking-widest ${
                deleteConfirmText === 'ELIMINAR' ? 'text-white' : 'text-zinc-600'
              }`}
            >
              Eliminar mi cuenta
            </Text>
          </View>
        )}
      </TouchableOpacity>

      {/* Help text */}
      <View className="flex-row items-start gap-2 mt-4 p-3 bg-zinc-800/40 rounded-xl">
        <AlertCircle size={14} color="#71717A" className="mt-0.5" />
        <Text className="text-zinc-500 text-xs flex-1">
          Si tienes problemas con tu cuenta, contacta a soporte@trens.app antes de eliminarla.
          Podemos ayudarte.
        </Text>
      </View>
    </View>
  );

  // =========================================================================
  // RENDER: CURRENT SECTION
  // =========================================================================
  const renderSection = () => {
    switch (section) {
      case 'main':
        return renderMainMenu();
      case 'profile':
        return renderProfileSection();
      case 'subscription':
        return renderSubscriptionSection();
      case 'cards':
        return renderCardsSection();
      case 'password':
        return renderPasswordSection();
      case 'personal':
        return renderPersonalSection();
      case 'delete-account':
        return renderDeleteAccountSection();
      default:
        return renderMainMenu();
    }
  };

  const getSectionTitle = (): string => {
    switch (section) {
      case 'main':
        return 'Mi Cuenta';
      case 'profile':
        return 'Editar Perfil';
      case 'subscription':
        return 'Suscripción';
      case 'cards':
        return 'Métodos de Pago';
      case 'password':
        return 'Contraseña';
      case 'personal':
        return 'Info Personal';
      case 'delete-account':
        return 'Eliminar Cuenta';
      default:
        return 'Mi Cuenta';
    }
  };

  // =========================================================================
  // MAIN RENDER
  // =========================================================================
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={goBack}>
      <View className="flex-1 bg-black/90 justify-end">
        <View className="bg-zinc-900 rounded-t-3xl border-t border-zinc-800 max-h-[92%]">
          {/* Header */}
          <View className="flex-row items-center justify-between p-6 pb-4 border-b border-zinc-800/50">
            {section !== 'main' ? (
              <TouchableOpacity onPress={goBack} className="flex-row items-center gap-1">
                <ChevronRight
                  size={20}
                  color="#F97316"
                  style={{ transform: [{ rotate: '180deg' }] }}
                />
                <Text className="text-orange-400 font-medium">Atrás</Text>
              </TouchableOpacity>
            ) : (
              <View />
            )}
            <Text className="text-white text-lg font-bold absolute left-0 right-0 text-center">
              {getSectionTitle()}
            </Text>
            <TouchableOpacity onPress={onClose} className="z-10">
              <X size={24} color="#71717a" />
            </TouchableOpacity>
          </View>

          {/* Content */}
          <ScrollView
            className="p-6"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 40 }}
          >
            {renderSection()}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

function MenuItem({
  icon,
  label,
  sublabel,
  onPress,
  badge,
}: {
  icon: React.ReactNode;
  label: string;
  sublabel?: string;
  onPress: () => void;
  badge?: string;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      className="flex-row items-center gap-4 p-4 bg-zinc-800/40 rounded-xl border border-zinc-800/60"
      activeOpacity={0.7}
    >
      <View className="w-10 h-10 bg-zinc-800 rounded-xl items-center justify-center">{icon}</View>
      <View className="flex-1">
        <View className="flex-row items-center gap-2">
          <Text className="text-white font-bold">{label}</Text>
          {badge && (
            <View className="bg-orange-500/20 px-2 py-0.5 rounded-full border border-orange-500/40">
              <Text className="text-orange-400 text-[10px] font-bold uppercase">{badge}</Text>
            </View>
          )}
        </View>
        {sublabel && <Text className="text-zinc-500 text-xs mt-0.5">{sublabel}</Text>}
      </View>
      <ChevronRight size={18} color="#3F3F46" />
    </TouchableOpacity>
  );
}

function DetailRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <View className="flex-row items-center justify-between">
      <View className="flex-row items-center gap-2">
        {icon}
        <Text className="text-zinc-400 text-sm">{label}</Text>
      </View>
      <Text className="text-white text-sm font-medium">{value}</Text>
    </View>
  );
}
