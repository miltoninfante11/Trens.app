// CoachNotesTab — edita las 3 notas del atleta (pizarra, entrenamiento, nutrición)
import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { Save, ClipboardList, Dumbbell, UtensilsCrossed } from 'lucide-react-native';
import { supabase } from '../../lib/supabase';
import * as Haptics from '../../lib/haptics';
import { CoachTabProps } from './types';

type NoteType = 'pizarra' | 'entrenamiento' | 'nutricion';
const MAX = 5000;

const TABS: { type: NoteType; label: string; Icon: any; color: string }[] = [
  { type: 'pizarra', label: 'Pizarra', Icon: ClipboardList, color: '#A855F7' },
  { type: 'entrenamiento', label: 'Entrenamiento', Icon: Dumbbell, color: '#DC2626' },
  { type: 'nutricion', label: 'Nutrición', Icon: UtensilsCrossed, color: '#22C55E' },
];

export default function CoachNotesTab({ token, onError, onSaved }: CoachTabProps) {
  const [loading, setLoading] = useState(true);
  const [savingType, setSavingType] = useState<NoteType | null>(null);
  const [notes, setNotes] = useState<Record<NoteType, string>>({
    pizarra: '',
    entrenamiento: '',
    nutricion: '',
  });
  const [updatedAt, setUpdatedAt] = useState<Record<NoteType, string | null>>({
    pizarra: null,
    entrenamiento: null,
    nutricion: null,
  });
  const [activeTab, setActiveTab] = useState<NoteType>('pizarra');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('coach_get_plan_notes', { p_token: token });
      if (error) throw error;
      const map = ((data as any)?.notes ?? {}) as Record<
        string,
        { content: string; updated_at: string }
      >;
      setNotes({
        pizarra: map.pizarra?.content || '',
        entrenamiento: map.entrenamiento?.content || '',
        nutricion: map.nutricion?.content || '',
      });
      setUpdatedAt({
        pizarra: map.pizarra?.updated_at || null,
        entrenamiento: map.entrenamiento?.updated_at || null,
        nutricion: map.nutricion?.updated_at || null,
      });
    } catch (e: any) {
      onError(e?.message || 'No se pudieron cargar las notas');
    } finally {
      setLoading(false);
    }
  }, [token, onError]);

  useEffect(() => {
    load();
  }, [load]);

  const save = async (type: NoteType) => {
    setSavingType(type);
    try {
      const { error } = await supabase.rpc('coach_set_plan_note', {
        p_token: token,
        p_note_type: type,
        p_content: notes[type].slice(0, MAX),
      });
      if (error) throw error;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onSaved();
      load();
    } catch (e: any) {
      onError(e?.message || 'No se pudo guardar');
    } finally {
      setSavingType(null);
    }
  };

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator color="#DC2626" />
      </View>
    );
  }

  const active = TABS.find((t) => t.type === activeTab)!;
  const ActiveIcon = active.Icon;

  return (
    <View className="flex-1">
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>
        <View className="flex-row gap-2 mb-3">
          {TABS.map((t) => {
            const Icon = t.Icon;
            const isActive = t.type === activeTab;
            return (
              <TouchableOpacity
                key={t.type}
                onPress={() => {
                  Haptics.selectionAsync();
                  setActiveTab(t.type);
                }}
                className="flex-1 rounded-xl py-3 items-center justify-center border"
                style={{
                  backgroundColor: isActive ? `${t.color}22` : '#0A0A0A',
                  borderColor: isActive ? t.color : '#27272A',
                }}
              >
                <Icon size={16} color={isActive ? t.color : '#52525B'} />
                <Text
                  className="text-[10px] font-bold tracking-widest mt-1"
                  style={{ color: isActive ? t.color : '#71717A' }}
                  numberOfLines={1}
                >
                  {t.label.toUpperCase()}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View className="flex-row items-center gap-2 mb-2">
          <ActiveIcon size={14} color={active.color} />
          <Text className="text-white text-xs font-bold tracking-widest">
            NOTA · {active.label.toUpperCase()}
          </Text>
        </View>

        <TextInput
          className="bg-zinc-950 border border-zinc-900 text-white p-4 rounded-2xl text-sm"
          style={{ minHeight: 280, textAlignVertical: 'top', fontFamily: 'monospace' }}
          placeholder={`Escribe la nota de ${active.label.toLowerCase()}...`}
          placeholderTextColor="#52525B"
          value={notes[activeTab]}
          onChangeText={(v) => setNotes((prev) => ({ ...prev, [activeTab]: v.slice(0, MAX) }))}
          multiline
          maxLength={MAX}
        />

        <View className="flex-row items-center justify-between mt-2">
          <Text className="text-zinc-500 text-[10px] font-mono">
            {notes[activeTab].length}/{MAX}
          </Text>
          {updatedAt[activeTab] && (
            <Text className="text-zinc-500 text-[10px] font-mono" numberOfLines={1}>
              {new Date(updatedAt[activeTab] as string).toLocaleString()}
            </Text>
          )}
        </View>

        <TouchableOpacity
          onPress={() => save(activeTab)}
          disabled={savingType === activeTab}
          className="py-4 rounded-2xl mt-4 flex-row items-center justify-center gap-2"
          style={{ backgroundColor: active.color }}
        >
          {savingType === activeTab ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Save size={16} color="#fff" />
              <Text className="text-white font-bold tracking-widest text-xs">
                GUARDAR {active.label.toUpperCase()}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}
