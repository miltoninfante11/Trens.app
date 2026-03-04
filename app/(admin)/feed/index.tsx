import { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Modal,
  TextInput,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Image } from 'expo-image';
import {
  Search,
  Music,
  Play,
  Pause,
  Plus,
  X,
  Check,
  Trash2,
  Instagram,
  Video,
} from 'lucide-react-native';
import * as Haptics from '../../../lib/haptics';
import { supabase } from '../../../lib/supabase';
import spotify from '../../../services/spotify/spotify';
import { useUserRoleContext } from '../../../context/UserRoleContext';

// ============================================================================
// COLORS
// ============================================================================
const C = {
  red: '#DC2626',
  green: '#1DB954',
  blue: '#3B82F6',
  white: '#FFFFFF',
  zinc400: '#A1A1AA',
  zinc500: '#71717A',
  zinc700: '#3F3F46',
  zinc800: '#27272a',
  zinc900: '#18181b',
};

// ============================================================================
// TYPES
// ============================================================================
interface FeedItem {
  id: string;
  ig_media_id: string;
  caption: string | null;
  video_url: string;
  thumbnail_url: string | null;
  is_official: boolean;
  ig_permalink: string | null;
  like_count: number;
  comment_count: number;
  created_at: string;
  track_name: string | null;
  track_artist: string | null;
  spotify_uri: string | null;
  spotify_album_art: string | null;
}

interface SpotifyTrack {
  uri: string;
  name: string;
  artist: string;
  album: string;
  albumArt: string;
  durationMs: number;
}

// ============================================================================
// ADMIN FEED SCREEN
// ============================================================================
export default function AdminFeedScreen() {
  const { spotifyConnected } = useUserRoleContext();
  const [items, setItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<'all' | 'with_song' | 'no_song'>('all');

  // Song picker modal
  const [pickerVisible, setPickerVisible] = useState(false);
  const [pickerItem, setPickerItem] = useState<FeedItem | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SpotifyTrack[]>([]);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // -----------------------------------------------------------------------
  // FETCH FEED ITEMS
  // -----------------------------------------------------------------------
  const fetchItems = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('trens_feed')
        .select(
          'id, ig_media_id, caption, video_url, thumbnail_url, is_official, ig_permalink, like_count, comment_count, created_at, track_name, track_artist, spotify_uri, spotify_album_art'
        )
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setItems(data || []);
    } catch (err) {
      console.error('Error fetching admin feed:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchItems();
  }, [fetchItems]);

  // -----------------------------------------------------------------------
  // FILTER
  // -----------------------------------------------------------------------
  const filteredItems = items.filter((item) => {
    if (filter === 'with_song') return !!item.spotify_uri;
    if (filter === 'no_song') return !item.spotify_uri;
    return true;
  });

  const stats = {
    total: items.length,
    withSong: items.filter((i) => !!i.spotify_uri).length,
    noSong: items.filter((i) => !i.spotify_uri).length,
  };

  // -----------------------------------------------------------------------
  // OPEN SONG PICKER
  // -----------------------------------------------------------------------
  const openPicker = useCallback(
    (item: FeedItem) => {
      if (!spotifyConnected) {
        // Launch spotify auth
        spotify.authenticate().then(() => {
          setPickerItem(item);
          setPickerVisible(true);
        });
        return;
      }
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setPickerItem(item);
      setSearchQuery('');
      setSearchResults([]);
      setPickerVisible(true);
    },
    [spotifyConnected]
  );

  // -----------------------------------------------------------------------
  // SPOTIFY SEARCH (debounced)
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    searchTimeout.current = setTimeout(async () => {
      try {
        const data = await spotify.searchTracks(searchQuery, 20);
        if (data && data.length > 0) {
          setSearchResults(
            data.map((t) => ({
              uri: t.uri,
              name: t.name,
              artist: t.artist,
              album: t.album,
              albumArt: t.albumArt || '',
              durationMs: t.durationMs,
            }))
          );
        } else {
          setSearchResults([]);
        }
      } catch (err) {
        console.warn('Search error:', err);
      }
      setSearching(false);
    }, 350);
    return () => {
      if (searchTimeout.current) clearTimeout(searchTimeout.current);
    };
  }, [searchQuery]);

  // -----------------------------------------------------------------------
  // ASSIGN SONG
  // -----------------------------------------------------------------------
  const assignSong = useCallback(
    async (track: SpotifyTrack) => {
      if (!pickerItem) return;
      setSaving(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      try {
        const { error } = await supabase
          .from('trens_feed')
          .update({
            track_name: track.name,
            track_artist: track.artist,
            spotify_uri: track.uri,
            spotify_album_art: track.albumArt || null,
          })
          .eq('id', pickerItem.id);

        if (error) throw error;

        // Update local state
        setItems((prev) =>
          prev.map((i) =>
            i.id === pickerItem.id
              ? {
                  ...i,
                  track_name: track.name,
                  track_artist: track.artist,
                  spotify_uri: track.uri,
                  spotify_album_art: track.albumArt || null,
                }
              : i
          )
        );
        setPickerVisible(false);
        setPickerItem(null);
      } catch (err) {
        console.error('Error assigning song:', err);
      } finally {
        setSaving(false);
      }
    },
    [pickerItem]
  );

  // -----------------------------------------------------------------------
  // REMOVE SONG
  // -----------------------------------------------------------------------
  const removeSong = useCallback(async (itemId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const { error } = await supabase
        .from('trens_feed')
        .update({
          track_name: null,
          track_artist: null,
          spotify_uri: null,
          spotify_album_art: null,
        })
        .eq('id', itemId);

      if (error) throw error;

      setItems((prev) =>
        prev.map((i) =>
          i.id === itemId
            ? {
                ...i,
                track_name: null,
                track_artist: null,
                spotify_uri: null,
                spotify_album_art: null,
              }
            : i
        )
      );
    } catch (err) {
      console.error('Error removing song:', err);
    }
  }, []);

  // -----------------------------------------------------------------------
  // PREVIEW
  // -----------------------------------------------------------------------
  const togglePreview = useCallback(
    async (uri: string) => {
      if (previewUri === uri) {
        await spotify.pause();
        setPreviewUri(null);
      } else {
        await spotify.playTrack(uri);
        setPreviewUri(uri);
      }
    },
    [previewUri]
  );

  // -----------------------------------------------------------------------
  // RENDER ITEM
  // -----------------------------------------------------------------------
  const renderItem = useCallback(
    ({ item }: { item: FeedItem }) => {
      const hasSong = !!item.spotify_uri;
      return (
        <View
          className="mx-4 mb-3 rounded-2xl overflow-hidden"
          style={{ backgroundColor: C.zinc800, borderWidth: 1, borderColor: C.zinc700 }}
        >
          {/* Top row: thumbnail + info */}
          <View className="flex-row p-3">
            {/* Thumbnail */}
            <View className="w-20 h-20 rounded-xl overflow-hidden bg-zinc-700">
              {item.thumbnail_url ? (
                <Image
                  source={{ uri: item.thumbnail_url }}
                  style={{ width: 80, height: 80 }}
                  contentFit="cover"
                />
              ) : (
                <View className="flex-1 items-center justify-center">
                  <Video size={24} color={C.zinc500} />
                </View>
              )}
            </View>

            {/* Info */}
            <View className="flex-1 ml-3 justify-center">
              <Text className="text-white text-sm font-bold" numberOfLines={2}>
                {item.caption?.substring(0, 80) || 'Sin descripción'}
              </Text>
              <View className="flex-row items-center mt-1 gap-2">
                {item.is_official && (
                  <View
                    className="px-1.5 py-0.5 rounded"
                    style={{ backgroundColor: 'rgba(220,38,38,0.3)' }}
                  >
                    <Text className="text-red-500 text-[9px] font-bold">OFICIAL</Text>
                  </View>
                )}
                <Text className="text-zinc-500 text-xs">
                  ❤️ {item.like_count || 0} · 💬 {item.comment_count || 0}
                </Text>
              </View>
              <Text className="text-zinc-600 text-[10px] mt-1">
                {new Date(item.created_at).toLocaleDateString('es', {
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric',
                })}
              </Text>
            </View>
          </View>

          {/* Song section */}
          <View className="px-3 pb-3">
            {hasSong ? (
              <View className="flex-row items-center justify-between">
                {/* Song chip */}
                <View
                  className="flex-row items-center flex-1 rounded-full px-3 py-2 mr-2"
                  style={{
                    backgroundColor: 'rgba(30,215,96,0.12)',
                    borderWidth: 1,
                    borderColor: 'rgba(30,215,96,0.3)',
                  }}
                >
                  {item.spotify_album_art ? (
                    <Image
                      source={{ uri: item.spotify_album_art }}
                      style={{ width: 24, height: 24, borderRadius: 4 }}
                    />
                  ) : (
                    <Music size={16} color={C.green} />
                  )}
                  <View className="flex-1 ml-2 mr-1">
                    <Text className="text-white text-xs font-bold" numberOfLines={1}>
                      {item.track_name}
                    </Text>
                    <Text className="text-zinc-400 text-[10px]" numberOfLines={1}>
                      {item.track_artist}
                    </Text>
                  </View>
                </View>

                {/* Change / Remove buttons */}
                <TouchableOpacity
                  onPress={() => openPicker(item)}
                  className="w-9 h-9 rounded-full items-center justify-center mr-1"
                  style={{ backgroundColor: C.green }}
                >
                  <Music size={16} color={C.white} />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => removeSong(item.id)}
                  className="w-9 h-9 rounded-full items-center justify-center"
                  style={{ backgroundColor: 'rgba(220,38,38,0.3)' }}
                >
                  <Trash2 size={16} color={C.red} />
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                onPress={() => openPicker(item)}
                className="flex-row items-center justify-center rounded-xl py-2.5"
                style={{
                  backgroundColor: 'rgba(30,215,96,0.1)',
                  borderWidth: 1,
                  borderColor: 'rgba(30,215,96,0.2)',
                  borderStyle: 'dashed',
                }}
              >
                <Plus size={16} color={C.green} />
                <Text className="text-green-400 text-sm font-bold ml-2">AGREGAR CANCIÓN</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      );
    },
    [openPicker, removeSong]
  );

  // -----------------------------------------------------------------------
  // RENDER
  // -----------------------------------------------------------------------
  if (loading) {
    return (
      <View className="flex-1 bg-black items-center justify-center">
        <ActivityIndicator size="large" color={C.blue} />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-black">
      {/* Stats bar */}
      <View className="flex-row px-4 py-3 gap-2">
        <TouchableOpacity
          onPress={() => setFilter('all')}
          className="flex-1 rounded-xl py-2 items-center"
          style={{
            backgroundColor: filter === 'all' ? 'rgba(59,130,246,0.2)' : C.zinc800,
            borderWidth: 1,
            borderColor: filter === 'all' ? C.blue : C.zinc700,
          }}
        >
          <Text
            className="text-lg font-bold font-mono"
            style={{ color: filter === 'all' ? C.blue : C.zinc400 }}
          >
            {stats.total}
          </Text>
          <Text className="text-zinc-500 text-[10px] font-bold">TOTAL</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setFilter('with_song')}
          className="flex-1 rounded-xl py-2 items-center"
          style={{
            backgroundColor: filter === 'with_song' ? 'rgba(30,215,96,0.15)' : C.zinc800,
            borderWidth: 1,
            borderColor: filter === 'with_song' ? C.green : C.zinc700,
          }}
        >
          <Text
            className="text-lg font-bold font-mono"
            style={{ color: filter === 'with_song' ? C.green : C.zinc400 }}
          >
            {stats.withSong}
          </Text>
          <Text className="text-zinc-500 text-[10px] font-bold">CON 🎵</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setFilter('no_song')}
          className="flex-1 rounded-xl py-2 items-center"
          style={{
            backgroundColor: filter === 'no_song' ? 'rgba(220,38,38,0.15)' : C.zinc800,
            borderWidth: 1,
            borderColor: filter === 'no_song' ? C.red : C.zinc700,
          }}
        >
          <Text
            className="text-lg font-bold font-mono"
            style={{ color: filter === 'no_song' ? C.red : C.zinc400 }}
          >
            {stats.noSong}
          </Text>
          <Text className="text-zinc-500 text-[10px] font-bold">SIN 🎵</Text>
        </TouchableOpacity>
      </View>

      {/* List */}
      <FlashList
        data={filteredItems}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.blue} />
        }
        ListEmptyComponent={
          <View className="items-center justify-center py-20">
            <Instagram size={48} color={C.zinc700} />
            <Text className="text-zinc-500 mt-4">No hay videos en el feed</Text>
          </View>
        }
        contentContainerStyle={{ paddingBottom: 100 }}
      />

      {/* ================================================================= */}
      {/* SPOTIFY SONG PICKER MODAL */}
      {/* ================================================================= */}
      <Modal
        visible={pickerVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setPickerVisible(false)}
      >
        <View className="flex-1" style={{ backgroundColor: 'rgba(0,0,0,0.85)' }}>
          {/* Header */}
          <View
            className="px-4 pt-14 pb-3"
            style={{
              backgroundColor: C.zinc900,
              borderBottomWidth: 1,
              borderBottomColor: C.zinc700,
            }}
          >
            <View className="flex-row items-center justify-between mb-3">
              <View className="flex-1 mr-3">
                <Text className="text-white font-bold text-lg">🎵 Asignar canción</Text>
                <Text className="text-zinc-500 text-xs mt-0.5" numberOfLines={1}>
                  {pickerItem?.caption?.substring(0, 50) || 'Video sin descripción'}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => {
                  setPickerVisible(false);
                  if (previewUri) {
                    spotify.pause();
                    setPreviewUri(null);
                  }
                }}
                className="w-10 h-10 rounded-full items-center justify-center"
                style={{ backgroundColor: C.zinc800 }}
              >
                <X size={20} color={C.white} />
              </TouchableOpacity>
            </View>

            {/* Search input */}
            <View
              className="flex-row items-center rounded-xl px-3 py-2.5"
              style={{ backgroundColor: C.zinc800, borderWidth: 1, borderColor: C.zinc700 }}
            >
              <Search size={18} color={C.zinc500} />
              <TextInput
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Buscar canción en Spotify..."
                placeholderTextColor={C.zinc500}
                className="flex-1 text-white text-sm ml-2"
                style={{ outlineStyle: 'none' } as any}
                autoFocus
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setSearchQuery('')}>
                  <X size={16} color={C.zinc500} />
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* Results */}
          <FlashList
            data={searchResults}
            keyExtractor={(t) => t.uri}
            contentContainerStyle={{ padding: 16 }}
            ListEmptyComponent={
              searching ? (
                <View className="items-center py-10">
                  <ActivityIndicator size="small" color={C.green} />
                  <Text className="text-zinc-500 text-sm mt-2">Buscando...</Text>
                </View>
              ) : searchQuery.length > 0 ? (
                <View className="items-center py-10">
                  <Music size={32} color={C.zinc700} />
                  <Text className="text-zinc-500 text-sm mt-2">Sin resultados</Text>
                </View>
              ) : (
                <View className="items-center py-10">
                  <Search size={32} color={C.zinc700} />
                  <Text className="text-zinc-500 text-sm mt-2">
                    Escribe el nombre de la canción
                  </Text>
                </View>
              )
            }
            renderItem={({ item: track }) => (
              <View
                className="flex-row items-center p-3 mb-2 rounded-xl"
                style={{ backgroundColor: C.zinc800 }}
              >
                {/* Album art */}
                {track.albumArt ? (
                  <Image
                    source={{ uri: track.albumArt }}
                    style={{ width: 48, height: 48, borderRadius: 8 }}
                  />
                ) : (
                  <View
                    className="w-12 h-12 rounded-lg items-center justify-center"
                    style={{ backgroundColor: C.zinc700 }}
                  >
                    <Music size={20} color={C.zinc500} />
                  </View>
                )}

                {/* Track info */}
                <View className="flex-1 ml-3 mr-2">
                  <Text className="text-white text-sm font-bold" numberOfLines={1}>
                    {track.name}
                  </Text>
                  <Text className="text-zinc-400 text-xs" numberOfLines={1}>
                    {track.artist} · {track.album}
                  </Text>
                </View>

                {/* Preview button */}
                <TouchableOpacity
                  onPress={() => togglePreview(track.uri)}
                  className="w-10 h-10 rounded-full items-center justify-center mr-2"
                  style={{
                    backgroundColor: previewUri === track.uri ? C.green : C.zinc700,
                  }}
                >
                  {previewUri === track.uri ? (
                    <Pause size={18} color={C.white} />
                  ) : (
                    <Play size={18} color={C.green} />
                  )}
                </TouchableOpacity>

                {/* Select button */}
                <TouchableOpacity
                  onPress={() => assignSong(track)}
                  disabled={saving}
                  className="w-10 h-10 rounded-full items-center justify-center"
                  style={{ backgroundColor: C.green }}
                >
                  {saving ? (
                    <ActivityIndicator size="small" color={C.white} />
                  ) : (
                    <Check size={20} color={C.white} />
                  )}
                </TouchableOpacity>
              </View>
            )}
          />
        </View>
      </Modal>
    </View>
  );
}
