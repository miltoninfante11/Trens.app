import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Image,
  RefreshControl,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { Alert } from '../../../lib/alert';

import {
  Search,
  Plus,
  Trash2,
  ImagePlus,
  X,
  Check,
  ChevronRight,
  Dumbbell,
  Layers,
  ChevronDown,
  ChevronUp,
  Camera,
  Image as ImageIcon,
  Video,
} from 'lucide-react-native';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from '../../../lib/haptics';
import { openCamera, openGallery } from '../../../lib/webCamera';
import { supabase } from '../../../lib/supabase';
import cloudflareR2 from '../../../services/cloudflare/r2';

// ============================================================================
// TYPES
// ============================================================================
interface Exercise {
  id: string;
  name: string;
  description?: string;
  muscle_group?: string;
  secondary_muscles?: string[];
  thumbnail_url?: string;
  alternative_exercises?: string[];
  is_active: boolean;
  category?: string;
  equipment?: string[];
  difficulty?: string;
}

// ============================================================================
// COLORS
// ============================================================================
const COLORS = {
  black: '#000000',
  blue: '#3B82F6',
  red: '#DC2626',
  green: '#22C55E',
  white: '#FFFFFF',
  zinc400: '#A1A1AA',
  zinc700: '#3f3f46',
  zinc800: '#27272a',
  zinc900: '#18181b',
};

// Lista de grupos musculares
const MUSCLE_GROUPS = [
  'PECHO',
  'ESPALDA',
  'HOMBRO FRONTAL',
  'HOMBRO LATERAL',
  'HOMBRO POSTERIOR',
  'BÍCEPS',
  'TRÍCEPS',
  'ANTEBRAZOS',
  'CORE',
  'CUÁDRICEPS',
  'ISQUIOS',
  'GLÚTEOS',
  'PANTORRILLAS',
  'TRAPECIOS',
];

// ============================================================================
// MAIN COMPONENT
// ============================================================================
export default function AdminEjerciciosScreen() {
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [filteredExercises, setFilteredExercises] = useState<Exercise[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMuscleFilter, setSelectedMuscleFilter] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Modal states
  const [modalVisible, setModalVisible] = useState(false);
  const [editingExercise, setEditingExercise] = useState<Exercise | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    muscle_group: '',
    secondary_muscles: [] as string[],
    thumbnail_url: '',
    alternative_exercises: [] as string[],
  });

  // Section toggles dentro del modal
  const [showMuscles, setShowMuscles] = useState(false);
  const [showAlternatives, setShowAlternatives] = useState(false);
  const [alternativesSearch, setAlternativesSearch] = useState('');

  // Upload states
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const [showMediaPicker, setShowMediaPicker] = useState(false);

  // -------------------------------------------------------------------------
  // PICK AND UPLOAD IMAGE FROM GALLERY
  // -------------------------------------------------------------------------
  const pickImageFromGallery = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setShowMediaPicker(false);

    const result = await openGallery({
      quality: 1,
      allowsEditing: true,
      aspect: [1, 1],
    });

    if (result.success && result.uri) {
      await processAndUploadImage(result.uri);
    } else if (result.error && result.error !== 'Cancelado por el usuario') {
      Alert.alert('Error', result.error);
    }
  };

  // -------------------------------------------------------------------------
  // PICK AND UPLOAD IMAGE FROM CAMERA
  // -------------------------------------------------------------------------
  const pickImageFromCamera = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setShowMediaPicker(false);

    const result = await openCamera({
      quality: 1,
      allowsEditing: true,
      aspect: [1, 1],
    });

    if (result.success && result.uri) {
      await processAndUploadImage(result.uri);
    } else if (result.error && result.error !== 'Cancelado por el usuario') {
      Alert.alert('Error', result.error);
    }
  };

  // -------------------------------------------------------------------------
  // PROCESS AND UPLOAD IMAGE (OPTIMIZE + R2)
  // -------------------------------------------------------------------------
  const processAndUploadImage = async (imageUri: string) => {
    if (!editingExercise?.id) {
      Alert.alert('Error', 'Guarda el ejercicio primero antes de subir una imagen');
      return;
    }

    setIsUploading(true);
    setUploadProgress('Optimizando imagen...');

    // Guardar URL anterior para borrarla después
    const previousThumbnailUrl = formData.thumbnail_url;

    try {
      // 1. Optimizar imagen: redimensionar a max 800px y comprimir a 80%
      const manipulated = await ImageManipulator.manipulateAsync(
        imageUri,
        [{ resize: { width: 800 } }],
        { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG, base64: true }
      );

      if (!manipulated.base64) {
        throw new Error('No se pudo procesar la imagen');
      }

      setUploadProgress('Subiendo a Cloudflare R2...');

      // 2. Subir a Cloudflare R2
      const uploadResult = await cloudflareR2.uploadExerciseThumbnail(
        manipulated.base64,
        editingExercise.id
      );

      if (!uploadResult.success || !uploadResult.url) {
        throw new Error(uploadResult.error || 'Error al subir');
      }

      setUploadProgress('Actualizando base de datos...');

      // 3. Actualizar en Supabase
      const { error } = await supabase
        .from('exercises')
        .update({ thumbnail_url: uploadResult.url })
        .eq('id', editingExercise.id);

      if (error) throw error;

      // 4. Borrar imagen anterior de Cloudflare R2 (si existía y era de R2)
      if (previousThumbnailUrl && previousThumbnailUrl.includes('r2.cloudflarestorage.com')) {
        setUploadProgress('Limpiando imagen anterior...');
        await cloudflareR2.deleteExerciseThumbnail(previousThumbnailUrl);
      }

      // 5. Actualizar estado local
      setFormData((prev) => ({ ...prev, thumbnail_url: uploadResult.url! }));

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('✅ Éxito', 'Imagen subida correctamente');

      // Refrescar lista
      fetchExercises();
    } catch (error) {
      console.error('Error uploading image:', error);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Error', 'No se pudo subir la imagen');
    } finally {
      setIsUploading(false);
      setUploadProgress('');
    }
  };

  // -------------------------------------------------------------------------
  // PICK AND UPLOAD VIDEO FROM GALLERY
  // -------------------------------------------------------------------------
  const pickVideoFromGallery = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setShowMediaPicker(false);

    if (!editingExercise?.id) {
      Alert.alert('Error', 'Guarda el ejercicio primero antes de subir un video');
      return;
    }

    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permiso requerido', 'Necesitamos acceso a tu galería.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['videos'],
      quality: 0.7,
      videoMaxDuration: 30,
    });

    if (!result.canceled && result.assets[0]) {
      await uploadVideo(result.assets[0].uri);
    }
  };

  // -------------------------------------------------------------------------
  // UPLOAD VIDEO TO R2
  // -------------------------------------------------------------------------
  const uploadVideo = async (videoUri: string) => {
    if (!editingExercise?.id) return;

    setIsUploading(true);
    setUploadProgress('Subiendo video a Cloudflare R2...');

    try {
      const uploadResult = await cloudflareR2.uploadExerciseVideo(videoUri, editingExercise.id);

      if (!uploadResult.success || !uploadResult.url) {
        throw new Error(uploadResult.error || 'Error al subir video');
      }

      setUploadProgress('Actualizando base de datos...');

      // Actualizar video_url en Supabase
      const { error } = await supabase
        .from('exercises')
        .update({ video_url: uploadResult.url })
        .eq('id', editingExercise.id);

      if (error) throw error;

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('✅ Éxito', 'Video subido correctamente');

      fetchExercises();
    } catch (error) {
      console.error('Error uploading video:', error);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Error', 'No se pudo subir el video');
    } finally {
      setIsUploading(false);
      setUploadProgress('');
    }
  };

  // -------------------------------------------------------------------------
  // FETCH EXERCISES
  // -------------------------------------------------------------------------
  const fetchExercises = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('exercises')
        .select('*')
        .eq('is_active', true)
        .order('name', { ascending: true });

      if (error) throw error;

      setExercises(data || []);
      setFilteredExercises(data || []);
    } catch (error) {
      console.error('Error fetching exercises:', error);
      Alert.alert('Error', 'No se pudieron cargar los ejercicios');
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchExercises();
  }, [fetchExercises]);

  // -------------------------------------------------------------------------
  // SEARCH FILTER
  // -------------------------------------------------------------------------
  useEffect(() => {
    let filtered = exercises;

    // Filtrar por grupo muscular seleccionado
    if (selectedMuscleFilter) {
      filtered = filtered.filter(
        (ex) =>
          ex.muscle_group?.toUpperCase() === selectedMuscleFilter ||
          ex.secondary_muscles?.some((mg) => mg.toUpperCase() === selectedMuscleFilter)
      );
    }

    // Filtrar por búsqueda de texto
    if (searchQuery.trim() !== '') {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (ex) =>
          ex.name.toLowerCase().includes(query) ||
          ex.muscle_group?.toLowerCase().includes(query) ||
          ex.secondary_muscles?.some((mg) => mg.toLowerCase().includes(query))
      );
    }

    setFilteredExercises(filtered);
  }, [searchQuery, exercises, selectedMuscleFilter]);

  // -------------------------------------------------------------------------
  // GET EXERCISE NAME BY ID
  // -------------------------------------------------------------------------
  const getExerciseName = (id: string): string => {
    const ex = exercises.find((e) => e.id === id);
    return ex?.name || 'Desconocido';
  };

  // -------------------------------------------------------------------------
  // OPEN CREATE/EDIT MODAL
  // -------------------------------------------------------------------------
  const openModal = (exercise?: Exercise) => {
    if (exercise) {
      setEditingExercise(exercise);
      setFormData({
        name: exercise.name,
        description: exercise.description || '',
        muscle_group: exercise.muscle_group || '',
        secondary_muscles: exercise.secondary_muscles || [],
        thumbnail_url: exercise.thumbnail_url || '',
        alternative_exercises: exercise.alternative_exercises || [],
      });
    } else {
      setEditingExercise(null);
      setFormData({
        name: '',
        description: '',
        muscle_group: '',
        secondary_muscles: [],
        thumbnail_url: '',
        alternative_exercises: [],
      });
    }
    setShowMuscles(false);
    setShowAlternatives(false);
    setAlternativesSearch('');
    setModalVisible(true);
  };

  // -------------------------------------------------------------------------
  // SAVE EXERCISE
  // -------------------------------------------------------------------------
  const saveExercise = async () => {
    if (!formData.name.trim()) {
      Alert.alert('Error', 'El nombre es requerido');
      return;
    }

    try {
      if (editingExercise) {
        // Update
        const { error } = await supabase
          .from('exercises')
          .update({
            name: formData.name.trim(),
            description: formData.description.trim() || null,
            muscle_group: formData.muscle_group || null,
            secondary_muscles: formData.secondary_muscles,
            thumbnail_url: formData.thumbnail_url.trim() || null,
            alternatives: formData.alternative_exercises,
            updated_at: new Date().toISOString(),
          })
          .eq('id', editingExercise.id);

        if (error) throw error;
        Alert.alert('✅ Éxito', 'Ejercicio actualizado');
      } else {
        // Create
        const { error } = await supabase.from('exercises').insert({
          name: formData.name.trim(),
          description: formData.description.trim() || null,
          muscle_group: formData.muscle_group || null,
          secondary_muscles: formData.secondary_muscles,
          thumbnail_url: formData.thumbnail_url.trim() || null,
          is_active: true,
          alternatives: formData.alternative_exercises,
        });

        if (error) throw error;
        Alert.alert('✅ Éxito', 'Ejercicio creado');
      }

      setModalVisible(false);
      fetchExercises();
    } catch (error) {
      console.error('Error saving exercise:', error);
      Alert.alert('Error', 'No se pudo guardar el ejercicio');
    }
  };

  // -------------------------------------------------------------------------
  // DELETE EXERCISE
  // -------------------------------------------------------------------------
  const deleteExercise = (exercise: Exercise) => {
    Alert.alert('Eliminar Ejercicio', `¿Seguro que quieres eliminar "${exercise.name}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: async () => {
          try {
            const { error } = await supabase
              .from('exercises')
              .update({ is_active: false })
              .eq('id', exercise.id);

            if (error) throw error;
            fetchExercises();
          } catch (error) {
            console.error('Error deleting exercise:', error);
            Alert.alert('Error', 'No se pudo eliminar el ejercicio');
          }
        },
      },
    ]);
  };

  // -------------------------------------------------------------------------
  // TOGGLE MUSCLE GROUP (Primary)
  // -------------------------------------------------------------------------
  const selectPrimaryMuscle = (muscle: string) => {
    setFormData((prev) => ({
      ...prev,
      muscle_group: prev.muscle_group === muscle ? '' : muscle,
    }));
  };

  // -------------------------------------------------------------------------
  // TOGGLE SECONDARY MUSCLE
  // -------------------------------------------------------------------------
  const toggleSecondaryMuscle = (muscle: string) => {
    if (muscle === formData.muscle_group) return; // No puede ser primario y secundario
    setFormData((prev) => ({
      ...prev,
      secondary_muscles: prev.secondary_muscles.includes(muscle)
        ? prev.secondary_muscles.filter((m) => m !== muscle)
        : [...prev.secondary_muscles, muscle],
    }));
  };

  // -------------------------------------------------------------------------
  // TOGGLE ALTERNATIVE
  // -------------------------------------------------------------------------
  const toggleAlternative = (alternativeId: string) => {
    setFormData((prev) => ({
      ...prev,
      alternatives: prev.alternative_exercises.includes(alternativeId)
        ? prev.alternative_exercises.filter((id) => id !== alternativeId)
        : [...prev.alternative_exercises, alternativeId],
    }));
  };

  // -------------------------------------------------------------------------
  // REMOVE ALTERNATIVE
  // -------------------------------------------------------------------------
  const removeAlternative = (alternativeId: string) => {
    setFormData((prev) => ({
      ...prev,
      alternatives: prev.alternative_exercises.filter((id) => id !== alternativeId),
    }));
  };

  // -------------------------------------------------------------------------
  // GET ALL MUSCLES (primary + secondary)
  // -------------------------------------------------------------------------
  const getAllMuscles = (exercise: Exercise): string => {
    const muscles = [];
    if (exercise.muscle_group) muscles.push(exercise.muscle_group);
    if (exercise.secondary_muscles?.length) {
      muscles.push(...exercise.secondary_muscles);
    }
    return muscles.length > 0 ? muscles.join(', ') : 'Sin músculos';
  };

  // -------------------------------------------------------------------------
  // RENDER
  // -------------------------------------------------------------------------
  return (
    <View className="flex-1 bg-black">
      {/* Muscle Group Filter Pills */}
      <View className="bg-zinc-900 px-4 pt-3 pb-2 border-b border-zinc-800">
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8 }}
        >
          {/* All pill */}
          <TouchableOpacity
            className="px-3 py-1.5 rounded-full"
            style={{
              backgroundColor: !selectedMuscleFilter ? COLORS.blue : '#27272a',
              borderWidth: 1,
              borderColor: !selectedMuscleFilter ? COLORS.blue : '#3f3f46',
            }}
            onPress={() => setSelectedMuscleFilter(null)}
          >
            <Text
              className="text-xs font-bold"
              style={{ color: !selectedMuscleFilter ? '#000' : '#a1a1aa' }}
            >
              TODOS
            </Text>
          </TouchableOpacity>

          {MUSCLE_GROUPS.map((muscle) => {
            const isSelected = selectedMuscleFilter === muscle;
            const count = exercises.filter(
              (ex) =>
                ex.muscle_group?.toUpperCase() === muscle ||
                ex.secondary_muscles?.some((mg) => mg.toUpperCase() === muscle)
            ).length;
            return (
              <TouchableOpacity
                key={muscle}
                className="px-3 py-1.5 rounded-full flex-row items-center"
                style={{
                  backgroundColor: isSelected ? COLORS.blue : '#27272a',
                  borderWidth: 1,
                  borderColor: isSelected ? COLORS.blue : '#3f3f46',
                }}
                onPress={() => setSelectedMuscleFilter(isSelected ? null : muscle)}
              >
                <Text
                  className="text-xs font-bold"
                  style={{ color: isSelected ? '#000' : '#a1a1aa' }}
                >
                  {muscle}
                </Text>
                <View
                  className="ml-1.5 px-1.5 py-0.5 rounded-full"
                  style={{ backgroundColor: isSelected ? 'rgba(0,0,0,0.2)' : '#3f3f46' }}
                >
                  <Text
                    className="text-[10px] font-bold"
                    style={{ color: isSelected ? '#000' : '#71717a' }}
                  >
                    {count}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Search Header */}
      <View className="px-4 py-3 bg-zinc-900 border-b border-zinc-800">
        <View className="flex-row items-center bg-zinc-800 rounded-lg px-3 py-2">
          <Search size={18} color={COLORS.zinc400} />
          <TextInput
            className="flex-1 text-white ml-2 font-mono"
            placeholder="Buscar ejercicio..."
            placeholderTextColor={COLORS.zinc400}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {(searchQuery || selectedMuscleFilter) && (
            <TouchableOpacity
              onPress={() => {
                setSearchQuery('');
                setSelectedMuscleFilter(null);
              }}
            >
              <X size={16} color={COLORS.zinc400} />
            </TouchableOpacity>
          )}
        </View>

        <View className="flex-row items-center justify-between mt-3">
          <Text className="text-zinc-400 text-xs font-mono">
            {filteredExercises.length} ejercicios
            {selectedMuscleFilter && ` de ${selectedMuscleFilter}`}
          </Text>
          <TouchableOpacity
            className="flex-row items-center bg-blue-600 px-3 py-2 rounded-lg"
            onPress={() => openModal()}
          >
            <Plus size={16} color={COLORS.white} />
            <Text className="text-white text-sm font-bold ml-1">NUEVO</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Exercise List */}
      <ScrollView
        className="flex-1"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              fetchExercises();
            }}
            tintColor={COLORS.blue}
          />
        }
      >
        {filteredExercises.map((exercise) => (
          <TouchableOpacity
            key={exercise.id}
            className="flex-row items-center bg-zinc-900 mx-4 my-1 p-3 rounded-lg border border-zinc-800"
            onPress={() => openModal(exercise)}
          >
            {/* Thumbnail */}
            <View className="w-14 h-14 bg-zinc-800 rounded-lg overflow-hidden items-center justify-center">
              {exercise.thumbnail_url ? (
                <Image
                  source={{ uri: exercise.thumbnail_url }}
                  className="w-full h-full"
                  resizeMode="cover"
                />
              ) : (
                <Dumbbell size={24} color={COLORS.zinc400} />
              )}
            </View>

            {/* Info */}
            <View className="flex-1 ml-3">
              <Text className="text-white font-bold">{exercise.name}</Text>
              <Text className="text-zinc-400 text-xs font-mono mt-1">
                {getAllMuscles(exercise)}
              </Text>
              {exercise.alternative_exercises && exercise.alternative_exercises.length > 0 && (
                <Text className="text-blue-400 text-xs mt-1">
                  {exercise.alternative_exercises.length} alternativa
                  {exercise.alternative_exercises.length > 1 ? 's' : ''}
                </Text>
              )}
            </View>

            {/* Actions */}
            <View className="flex-row items-center gap-2">
              <TouchableOpacity
                className="p-2 bg-zinc-800 rounded-lg"
                onPress={() => deleteExercise(exercise)}
              >
                <Trash2 size={18} color={COLORS.red} />
              </TouchableOpacity>
              <ChevronRight size={18} color={COLORS.zinc400} />
            </View>
          </TouchableOpacity>
        ))}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Create/Edit Modal */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <View className="flex-1 bg-black/90 justify-end">
          <View className="bg-zinc-900 rounded-t-3xl p-4" style={{ maxHeight: '90%' }}>
            {/* Header */}
            <View className="flex-row items-center justify-between mb-4">
              <Text className="text-white font-bold text-lg">
                {editingExercise ? 'Editar Ejercicio' : 'Nuevo Ejercicio'}
              </Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <X size={24} color={COLORS.zinc400} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Preview Image */}
              {formData.thumbnail_url ? (
                <TouchableOpacity
                  className="w-full h-40 bg-zinc-800 rounded-lg overflow-hidden mb-4"
                  onPress={() => editingExercise && setShowMediaPicker(true)}
                  disabled={isUploading}
                >
                  <Image
                    source={{ uri: formData.thumbnail_url }}
                    className="w-full h-full"
                    resizeMode="cover"
                  />
                  {isUploading && (
                    <View className="absolute inset-0 bg-black/70 items-center justify-center">
                      <ActivityIndicator size="large" color={COLORS.blue} />
                      <Text className="text-white text-xs mt-2">{uploadProgress}</Text>
                    </View>
                  )}
                  <View className="absolute bottom-2 right-2 bg-black/70 px-2 py-1 rounded">
                    <Text className="text-white text-xs">Tap para cambiar</Text>
                  </View>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  className="w-full h-40 bg-zinc-800 rounded-lg mb-4 items-center justify-center border-2 border-dashed border-zinc-600"
                  onPress={() =>
                    editingExercise
                      ? setShowMediaPicker(true)
                      : Alert.alert('Info', 'Guarda el ejercicio primero')
                  }
                  disabled={isUploading}
                >
                  {isUploading ? (
                    <>
                      <ActivityIndicator size="large" color={COLORS.blue} />
                      <Text className="text-white text-xs mt-2">{uploadProgress}</Text>
                    </>
                  ) : (
                    <>
                      <ImagePlus size={40} color={COLORS.zinc400} />
                      <Text className="text-zinc-400 text-sm mt-2">
                        {editingExercise ? 'Tap para subir imagen' : 'Guarda primero'}
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              )}

              {/* Name */}
              <Text className="text-zinc-400 text-xs font-mono mb-1">NOMBRE</Text>
              <TextInput
                className="bg-zinc-800 text-white p-3 rounded-lg mb-4 font-mono"
                placeholder="Nombre del ejercicio"
                placeholderTextColor={COLORS.zinc400}
                value={formData.name}
                onChangeText={(text) => setFormData((prev) => ({ ...prev, name: text }))}
              />

              {/* Description */}
              <Text className="text-zinc-400 text-xs font-mono mb-1">DESCRIPCIÓN</Text>
              <TextInput
                className="bg-zinc-800 text-white p-3 rounded-lg mb-4 font-mono"
                placeholder="Descripción opcional"
                placeholderTextColor={COLORS.zinc400}
                value={formData.description}
                onChangeText={(text) => setFormData((prev) => ({ ...prev, description: text }))}
                multiline
                numberOfLines={3}
              />

              {/* Image/Video Upload */}
              <View className="flex-row items-center justify-between mb-2">
                <Text className="text-zinc-400 text-xs font-mono">IMAGEN URL</Text>
                {editingExercise && (
                  <TouchableOpacity
                    className="flex-row items-center bg-blue-600 px-3 py-1.5 rounded"
                    onPress={() => setShowMediaPicker(true)}
                    disabled={isUploading}
                  >
                    <Camera size={14} color="#fff" />
                    <Text className="text-white text-xs font-bold ml-1">SUBIR</Text>
                  </TouchableOpacity>
                )}
              </View>
              <TextInput
                className="bg-zinc-800 text-white p-3 rounded-lg font-mono mb-4 text-xs"
                placeholder="URL de la imagen (o usa el botón SUBIR)"
                placeholderTextColor={COLORS.zinc400}
                value={formData.thumbnail_url}
                onChangeText={(text) => setFormData((prev) => ({ ...prev, thumbnail_url: text }))}
              />

              {/* ===== MUSCLES SECTION ===== */}
              <TouchableOpacity
                className="flex-row items-center justify-between bg-zinc-800 p-3 rounded-lg mb-2"
                onPress={() => setShowMuscles(!showMuscles)}
              >
                <View className="flex-row items-center">
                  <Dumbbell size={18} color={COLORS.blue} />
                  <Text className="text-white font-bold ml-2">MÚSCULOS</Text>
                </View>
                <View className="flex-row items-center">
                  <Text className="text-zinc-400 text-xs mr-2">
                    {formData.muscle_group || 'Ninguno'}
                    {formData.secondary_muscles.length > 0 &&
                      ` +${formData.secondary_muscles.length}`}
                  </Text>
                  {showMuscles ? (
                    <ChevronUp size={18} color={COLORS.zinc400} />
                  ) : (
                    <ChevronDown size={18} color={COLORS.zinc400} />
                  )}
                </View>
              </TouchableOpacity>

              {showMuscles && (
                <View className="bg-zinc-800/50 p-3 rounded-lg mb-4">
                  {/* Primary Muscle */}
                  <Text className="text-red-500 text-xs font-mono mb-2">MÚSCULO PRINCIPAL</Text>
                  <View className="flex-row flex-wrap gap-2 mb-4">
                    {MUSCLE_GROUPS.map((muscle) => {
                      const isSelected = formData.muscle_group === muscle;
                      return (
                        <TouchableOpacity
                          key={`primary-${muscle}`}
                          className={`px-3 py-2 rounded-lg border ${
                            isSelected ? 'bg-red-600 border-red-500' : 'bg-zinc-800 border-zinc-700'
                          }`}
                          onPress={() => selectPrimaryMuscle(muscle)}
                        >
                          <Text
                            className={`text-xs font-mono ${isSelected ? 'text-white' : 'text-zinc-400'}`}
                          >
                            {muscle}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  {/* Secondary Muscles */}
                  <Text className="text-blue-500 text-xs font-mono mb-2">MÚSCULOS SECUNDARIOS</Text>
                  <View className="flex-row flex-wrap gap-2">
                    {MUSCLE_GROUPS.filter((m) => m !== formData.muscle_group).map((muscle) => {
                      const isSelected = formData.secondary_muscles.includes(muscle);
                      return (
                        <TouchableOpacity
                          key={`secondary-${muscle}`}
                          className={`px-3 py-2 rounded-lg border ${
                            isSelected
                              ? 'bg-blue-600 border-blue-500'
                              : 'bg-zinc-800 border-zinc-700'
                          }`}
                          onPress={() => toggleSecondaryMuscle(muscle)}
                        >
                          <Text
                            className={`text-xs font-mono ${isSelected ? 'text-white' : 'text-zinc-400'}`}
                          >
                            {muscle}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              )}

              {/* ===== ALTERNATIVES SECTION ===== */}
              <TouchableOpacity
                className="flex-row items-center justify-between bg-zinc-800 p-3 rounded-lg mb-2"
                onPress={() => setShowAlternatives(!showAlternatives)}
              >
                <View className="flex-row items-center">
                  <Layers size={18} color={COLORS.green} />
                  <Text className="text-white font-bold ml-2">ALTERNATIVAS</Text>
                </View>
                <View className="flex-row items-center">
                  <Text className="text-zinc-400 text-xs mr-2">
                    {formData.alternative_exercises.length} seleccionadas
                  </Text>
                  {showAlternatives ? (
                    <ChevronUp size={18} color={COLORS.zinc400} />
                  ) : (
                    <ChevronDown size={18} color={COLORS.zinc400} />
                  )}
                </View>
              </TouchableOpacity>

              {showAlternatives && (
                <View className="bg-zinc-800/50 p-3 rounded-lg mb-4">
                  {/* Current Alternatives */}
                  {formData.alternative_exercises.length > 0 && (
                    <View className="mb-3">
                      <Text className="text-green-500 text-xs font-mono mb-2">
                        ALTERNATIVAS ACTUALES
                      </Text>
                      <View className="flex-row flex-wrap gap-2">
                        {formData.alternative_exercises.map((altId) => (
                          <TouchableOpacity
                            key={`alt-${altId}`}
                            className="flex-row items-center bg-green-600/30 border border-green-500 px-3 py-2 rounded-lg"
                            onPress={() => removeAlternative(altId)}
                          >
                            <Text className="text-white text-xs font-mono mr-2">
                              {getExerciseName(altId)}
                            </Text>
                            <X size={14} color={COLORS.red} />
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>
                  )}

                  {/* Search to add */}
                  <Text className="text-zinc-400 text-xs font-mono mb-2">AGREGAR ALTERNATIVA</Text>
                  <View className="flex-row items-center bg-zinc-700 rounded-lg px-3 py-2 mb-3">
                    <Search size={16} color={COLORS.zinc400} />
                    <TextInput
                      className="flex-1 text-white ml-2 font-mono text-sm"
                      placeholder="Buscar ejercicio..."
                      placeholderTextColor={COLORS.zinc400}
                      value={alternativesSearch}
                      onChangeText={setAlternativesSearch}
                    />
                  </View>

                  {/* Exercise List */}
                  <View style={{ maxHeight: 200 }}>
                    <ScrollView nestedScrollEnabled showsVerticalScrollIndicator={false}>
                      {exercises
                        .filter(
                          (ex) =>
                            ex.id !== editingExercise?.id &&
                            ex.is_active &&
                            !formData.alternative_exercises.includes(ex.id) &&
                            (alternativesSearch === '' ||
                              ex.name.toLowerCase().includes(alternativesSearch.toLowerCase()))
                        )
                        .slice(0, 10)
                        .map((exercise) => (
                          <TouchableOpacity
                            key={`add-${exercise.id}`}
                            className="flex-row items-center p-2 rounded-lg mb-1 bg-zinc-700"
                            onPress={() => toggleAlternative(exercise.id)}
                          >
                            <View className="w-8 h-8 bg-zinc-600 rounded items-center justify-center overflow-hidden">
                              {exercise.thumbnail_url ? (
                                <Image
                                  source={{ uri: exercise.thumbnail_url }}
                                  className="w-full h-full"
                                  resizeMode="cover"
                                />
                              ) : (
                                <Dumbbell size={14} color={COLORS.zinc400} />
                              )}
                            </View>
                            <Text className="text-white text-sm ml-2 flex-1">{exercise.name}</Text>
                            <Plus size={16} color={COLORS.green} />
                          </TouchableOpacity>
                        ))}
                    </ScrollView>
                  </View>
                </View>
              )}

              <View style={{ height: 20 }} />
            </ScrollView>

            {/* Save Button */}
            <TouchableOpacity
              className="bg-blue-600 py-4 rounded-lg flex-row items-center justify-center"
              onPress={saveExercise}
            >
              <Check size={20} color={COLORS.white} />
              <Text className="text-white font-bold ml-2">GUARDAR</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ===== MEDIA PICKER MODAL ===== */}
      <Modal
        visible={showMediaPicker}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setShowMediaPicker(false)}
      >
        <View className="flex-1 bg-black/80 justify-end">
          <View className="bg-zinc-900 rounded-t-3xl p-6">
            <Text className="text-white text-xl font-bold text-center mb-6">SUBIR MEDIA</Text>

            {isUploading ? (
              <View className="items-center py-8">
                <ActivityIndicator size="large" color={COLORS.blue} />
                <Text className="text-white mt-4 font-mono">{uploadProgress}</Text>
              </View>
            ) : (
              <View className="gap-3">
                {/* Gallery Image */}
                <TouchableOpacity
                  className="flex-row items-center bg-zinc-800 p-4 rounded-xl"
                  onPress={pickImageFromGallery}
                >
                  <View className="w-12 h-12 bg-blue-600 rounded-full items-center justify-center">
                    <ImageIcon size={24} color="#fff" />
                  </View>
                  <View className="ml-4">
                    <Text className="text-white font-bold">Imagen de Galería</Text>
                    <Text className="text-zinc-400 text-xs">
                      Sube una foto desde tu dispositivo
                    </Text>
                  </View>
                </TouchableOpacity>

                {/* Camera */}
                <TouchableOpacity
                  className="flex-row items-center bg-zinc-800 p-4 rounded-xl"
                  onPress={pickImageFromCamera}
                >
                  <View className="w-12 h-12 bg-green-600 rounded-full items-center justify-center">
                    <Camera size={24} color="#fff" />
                  </View>
                  <View className="ml-4">
                    <Text className="text-white font-bold">Tomar Foto</Text>
                    <Text className="text-zinc-400 text-xs">Usa la cámara para capturar</Text>
                  </View>
                </TouchableOpacity>

                {/* Gallery Video */}
                <TouchableOpacity
                  className="flex-row items-center bg-zinc-800 p-4 rounded-xl"
                  onPress={pickVideoFromGallery}
                >
                  <View className="w-12 h-12 bg-red-600 rounded-full items-center justify-center">
                    <Video size={24} color="#fff" />
                  </View>
                  <View className="ml-4">
                    <Text className="text-white font-bold">Video de Galería</Text>
                    <Text className="text-zinc-400 text-xs">Máximo 30 segundos</Text>
                  </View>
                </TouchableOpacity>
              </View>
            )}

            {/* Cancel */}
            <TouchableOpacity
              className="mt-6 py-4 rounded-xl bg-zinc-800"
              onPress={() => setShowMediaPicker(false)}
              disabled={isUploading}
            >
              <Text className="text-zinc-400 text-center font-bold">CANCELAR</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}
