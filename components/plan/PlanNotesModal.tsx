// ============================================================================
// PLAN NOTES MODAL - Pizarra de notas del plan
// PREMIUM SAVAGE EDITION
// ============================================================================

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  PanResponder,
} from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { StickyNote, Save } from 'lucide-react-native';
import { Haptics } from '../../lib/haptics';
import { supabase } from '../../lib/supabase';

interface PlanNotesModalProps {
  visible: boolean;
  onClose: () => void;
}

export const PlanNotesModal: React.FC<PlanNotesModalProps> = ({ visible, onClose }) => {
  const [notes, setNotes] = useState('');
  const [saved, setSaved] = useState(true);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<TextInput>(null);

  // ===== ANIMACIONES FLUIDAS =====
  const translateY = useSharedValue(0);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => Math.abs(gestureState.dy) > 5,
      onPanResponderGrant: () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      },
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy > 0) {
          translateY.value = gestureState.dy;
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > 100 || gestureState.vy > 0.5) {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          handleClose();
        } else {
          translateY.value = withSpring(0, { damping: 20, stiffness: 300 });
        }
      },
    })
  ).current;

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  // Cargar notas al abrir
  useEffect(() => {
    if (visible) {
      translateY.value = 0;
      loadNotes();
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [visible]);

  const loadNotes = useCallback(async () => {
    setLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('plan_notes')
        .select('content')
        .eq('user_id', user.id)
        .single();

      if (data && !error) {
        setNotes(data.content || '');
      } else {
        setNotes('');
      }
      setSaved(true);
    } catch {
      // Ignorar errores de lectura
    } finally {
      setLoading(false);
    }
  }, []);

  const saveNotes = useCallback(async () => {
    setSaving(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase
        .from('plan_notes')
        .upsert(
          { user_id: user.id, content: notes, updated_at: new Date().toISOString() },
          { onConflict: 'user_id' }
        );

      if (!error) {
        setSaved(true);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    } catch {
      // Ignorar errores de escritura
    } finally {
      setSaving(false);
    }
  }, [notes]);

  const handleClose = async () => {
    if (!saved) {
      await saveNotes();
    }
    onClose();
  };

  const handleTextChange = (text: string) => {
    setNotes(text);
    setSaved(false);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1"
      >
        <View className="flex-1 bg-transparent justify-end">
          <Animated.View
            style={[
              animatedStyle,
              {
                backgroundColor: '#0a0a0a',
                borderTopLeftRadius: 24,
                borderTopRightRadius: 24,
                maxHeight: '90%',
                flex: 1,
                borderTopWidth: 2,
                borderTopColor: 'rgba(234, 179, 8, 0.5)',
                overflow: 'hidden',
              },
            ]}
          >
            {/* Línea de acento superior */}
            <View
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                height: 3,
                backgroundColor: '#EAB308',
                shadowColor: '#EAB308',
                shadowOffset: { width: 0, height: 0 },
                shadowOpacity: 0.8,
                shadowRadius: 10,
                zIndex: 10,
              }}
            />

            {/* Header Draggable */}
            <View {...panResponder.panHandlers} className="border-b border-zinc-800/50">
              {/* Drag Indicator */}
              <View className="pt-4 pb-2 items-center">
                <View className="w-12 h-1.5 bg-zinc-600 rounded-full" />
              </View>

              {/* Header Title */}
              <View className="flex-row items-center justify-between px-4 pb-4">
                <View className="flex-row items-center gap-2">
                  <StickyNote size={18} color="#EAB308" />
                  <Text className="text-white font-bold text-lg">Pizarra</Text>
                  <Text className="text-zinc-500 text-[10px] font-mono ml-1">
                    {saving ? 'GUARDANDO...' : saved ? 'GUARDADO' : 'SIN GUARDAR'}
                  </Text>
                </View>

                {!saved && (
                  <Pressable
                    onPress={saveNotes}
                    className="flex-row items-center gap-1.5 px-3 py-2 rounded-xl active:scale-95"
                    style={{
                      backgroundColor: 'rgba(234, 179, 8, 0.15)',
                      borderWidth: 1,
                      borderColor: 'rgba(234, 179, 8, 0.4)',
                    }}
                  >
                    <Save size={14} color="#EAB308" />
                    <Text className="text-yellow-400 text-xs font-bold">GUARDAR</Text>
                  </Pressable>
                )}
              </View>
            </View>

            {/* Content */}
            {loading ? (
              <View className="flex-1 items-center justify-center py-20">
                <ActivityIndicator size="small" color="#EAB308" />
              </View>
            ) : (
              <ScrollView
                className="flex-1 px-4 pt-4"
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={{ flexGrow: 1 }}
                showsVerticalScrollIndicator={false}
              >
                <TextInput
                  ref={inputRef}
                  value={notes}
                  onChangeText={handleTextChange}
                  placeholder="Escribe notas, indicaciones, recordatorios..."
                  placeholderTextColor="#52525B"
                  multiline
                  textAlignVertical="top"
                  className="flex-1 text-white text-base leading-6 pb-8"
                  style={{
                    fontFamily: Platform.OS === 'ios' ? 'System' : 'monospace',
                    minHeight: 300,
                  }}
                />
              </ScrollView>
            )}
          </Animated.View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

export default PlanNotesModal;
