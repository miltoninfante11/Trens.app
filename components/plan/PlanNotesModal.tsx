// ============================================================================
// PLAN NOTES MODAL - Notas con 3 tipos: Pizarra, Entrenamiento, Nutrición
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
  Dimensions,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { StickyNote, Save, Dumbbell, Utensils, PenLine } from 'lucide-react-native';
import { Haptics } from '../../lib/haptics';
import { supabase } from '../../lib/supabase';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

type NoteType = 'pizarra' | 'entrenamiento' | 'nutricion';

const NOTE_TABS: Array<{ type: NoteType; label: string; icon: React.ReactNode; color: string }> = [
  {
    type: 'pizarra',
    label: 'Pizarra',
    icon: <PenLine size={14} color="#EAB308" />,
    color: '#EAB308',
  },
  {
    type: 'entrenamiento',
    label: 'Entreno',
    icon: <Dumbbell size={14} color="#DC2626" />,
    color: '#DC2626',
  },
  {
    type: 'nutricion',
    label: 'Nutrición',
    icon: <Utensils size={14} color="#22c55e" />,
    color: '#22c55e',
  },
];

interface PlanNotesModalProps {
  visible: boolean;
  onClose: () => void;
}

export const PlanNotesModal: React.FC<PlanNotesModalProps> = ({ visible, onClose }) => {
  const [activeTab, setActiveTab] = useState<NoteType>('pizarra');
  const [notesMap, setNotesMap] = useState<Record<NoteType, string>>({
    pizarra: '',
    entrenamiento: '',
    nutricion: '',
  });
  const [savedMap, setSavedMap] = useState<Record<NoteType, boolean>>({
    pizarra: true,
    entrenamiento: true,
    nutricion: true,
  });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const pagerRef = useRef<ScrollView>(null);

  // ===== ANIMACIONES FLUIDAS =====
  const translateY = useSharedValue(0);
  const pillIndicatorX = useSharedValue(0);

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

  const pillIndicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: pillIndicatorX.value }],
  }));

  // Cargar todas las notas al abrir
  useEffect(() => {
    if (visible) {
      translateY.value = 0;
      loadAllNotes();
      setActiveTab('pizarra');
      pillIndicatorX.value = 0;
      setTimeout(() => {
        pagerRef.current?.scrollTo({ x: 0, animated: false });
      }, 300);
    }
  }, [visible]);

  const loadAllNotes = useCallback(async () => {
    setLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from('plan_notes')
        .select('content, note_type')
        .eq('user_id', user.id);

      const map: Record<NoteType, string> = { pizarra: '', entrenamiento: '', nutricion: '' };
      if (data) {
        data.forEach((row: any) => {
          if (row.note_type in map) {
            map[row.note_type as NoteType] = row.content || '';
          }
        });
      }
      setNotesMap(map);
      setSavedMap({ pizarra: true, entrenamiento: true, nutricion: true });
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  const saveNote = useCallback(
    async (type: NoteType) => {
      setSaving(true);
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return;

        await supabase.from('plan_notes').upsert(
          {
            user_id: user.id,
            note_type: type,
            content: notesMap[type],
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id,note_type' }
        );

        setSavedMap((prev) => ({ ...prev, [type]: true }));
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      } catch {
        // ignore
      } finally {
        setSaving(false);
      }
    },
    [notesMap]
  );

  const saveAllUnsaved = useCallback(async () => {
    const unsaved = (Object.keys(savedMap) as NoteType[]).filter((k) => !savedMap[k]);
    for (const type of unsaved) {
      await saveNote(type);
    }
  }, [savedMap, saveNote]);

  const handleClose = async () => {
    await saveAllUnsaved();
    onClose();
  };

  const handleTextChange = (text: string) => {
    setNotesMap((prev) => ({ ...prev, [activeTab]: text }));
    setSavedMap((prev) => ({ ...prev, [activeTab]: false }));
  };

  const PILL_WIDTH = (SCREEN_WIDTH - 48) / 3;

  const switchTab = (type: NoteType, index: number) => {
    setActiveTab(type);
    pillIndicatorX.value = withTiming(index * PILL_WIDTH, {
      duration: 200,
      easing: Easing.out(Easing.ease),
    });
    pagerRef.current?.scrollTo({ x: index * (SCREEN_WIDTH - 32), animated: true });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const lastScrollIndex = useRef(0);

  const handlePagerScroll = (event: any) => {
    const offsetX = event.nativeEvent.contentOffset.x;
    const pageWidth = SCREEN_WIDTH - 32;
    const index = Math.round(offsetX / pageWidth);
    if (index >= 0 && index < 3 && index !== lastScrollIndex.current) {
      lastScrollIndex.current = index;
      const newTab = NOTE_TABS[index].type;
      setActiveTab(newTab);
      pillIndicatorX.value = withTiming(index * PILL_WIDTH, { duration: 200 });
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  };

  const activeColor = NOTE_TABS.find((t) => t.type === activeTab)?.color || '#EAB308';
  const hasAnyUnsaved = (Object.keys(savedMap) as NoteType[]).some((k) => !savedMap[k]);

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
                borderTopColor: `${activeColor}80`,
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
                backgroundColor: activeColor,
                shadowColor: activeColor,
                shadowOffset: { width: 0, height: 0 },
                shadowOpacity: 0.8,
                shadowRadius: 10,
                zIndex: 10,
              }}
            />

            {/* Header Draggable */}
            <View {...panResponder.panHandlers}>
              {/* Drag Indicator */}
              <View className="pt-4 pb-2 items-center">
                <View className="w-12 h-1.5 bg-zinc-600 rounded-full" />
              </View>

              {/* Header Title */}
              <View className="flex-row items-center justify-between px-4 pb-3">
                <View className="flex-row items-center gap-2">
                  <StickyNote size={18} color={activeColor} />
                  <Text className="text-white font-bold text-lg">Notas</Text>
                  <Text className="text-zinc-500 text-[10px] font-mono ml-1">
                    {saving ? 'GUARDANDO...' : hasAnyUnsaved ? 'SIN GUARDAR' : 'GUARDADO'}
                  </Text>
                </View>

                {hasAnyUnsaved && (
                  <Pressable
                    onPress={() => saveAllUnsaved()}
                    className="flex-row items-center gap-1.5 px-3 py-2 rounded-xl active:scale-95"
                    style={{
                      backgroundColor: `${activeColor}25`,
                      borderWidth: 1,
                      borderColor: `${activeColor}60`,
                    }}
                  >
                    <Save size={14} color={activeColor} />
                    <Text style={{ color: activeColor }} className="text-xs font-bold">
                      GUARDAR
                    </Text>
                  </Pressable>
                )}
              </View>
            </View>

            {/* Pills */}
            <View className="px-4 pb-3">
              <View
                style={{
                  flexDirection: 'row',
                  backgroundColor: '#18181b',
                  borderRadius: 12,
                  padding: 3,
                  position: 'relative',
                }}
              >
                {/* Indicador animado */}
                <Animated.View
                  style={[
                    {
                      position: 'absolute',
                      top: 3,
                      left: 3,
                      width: PILL_WIDTH,
                      height: 36,
                      borderRadius: 10,
                      backgroundColor: `${activeColor}20`,
                      borderWidth: 1,
                      borderColor: `${activeColor}40`,
                    },
                    pillIndicatorStyle,
                  ]}
                />
                {NOTE_TABS.map((tab, idx) => (
                  <Pressable
                    key={tab.type}
                    onPress={() => switchTab(tab.type, idx)}
                    style={{
                      flex: 1,
                      height: 36,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 5,
                    }}
                  >
                    {tab.icon}
                    <Text
                      style={{
                        color: activeTab === tab.type ? tab.color : '#71717a',
                        fontSize: 12,
                        fontWeight: '700',
                      }}
                    >
                      {tab.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {/* Content Pager */}
            {loading ? (
              <View className="flex-1 items-center justify-center py-20">
                <ActivityIndicator size="small" color={activeColor} />
              </View>
            ) : (
              <ScrollView
                ref={pagerRef}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                onMomentumScrollEnd={handlePagerScroll}
                onScroll={handlePagerScroll}
                scrollEventThrottle={16}
                style={{ flex: 1 }}
                contentContainerStyle={{ width: (SCREEN_WIDTH - 32) * 3 }}
              >
                {NOTE_TABS.map((tab) => (
                  <ScrollView
                    key={tab.type}
                    style={{ width: SCREEN_WIDTH - 32 }}
                    className="px-5 pt-4"
                    keyboardShouldPersistTaps="handled"
                    contentContainerStyle={{ flexGrow: 1 }}
                    showsVerticalScrollIndicator={false}
                  >
                    <TextInput
                      ref={tab.type === activeTab ? inputRef : undefined}
                      value={notesMap[tab.type]}
                      onChangeText={(text) => {
                        setNotesMap((prev) => ({ ...prev, [tab.type]: text }));
                        setSavedMap((prev) => ({ ...prev, [tab.type]: false }));
                      }}
                      placeholder={
                        tab.type === 'pizarra'
                          ? 'Notas generales, recordatorios...'
                          : tab.type === 'entrenamiento'
                            ? 'Notas de entrenamiento, PRs, ajustes...'
                            : 'Notas de nutrición, sustituciones...'
                      }
                      placeholderTextColor="#52525B"
                      multiline
                      textAlignVertical="top"
                      className="flex-1 text-white text-base leading-6 pb-8 pr-2"
                      style={{
                        fontFamily: Platform.OS === 'ios' ? 'System' : 'monospace',
                        minHeight: 300,
                        padding: 16,
                      }}
                    />
                  </ScrollView>
                ))}
              </ScrollView>
            )}
          </Animated.View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

export default PlanNotesModal;
