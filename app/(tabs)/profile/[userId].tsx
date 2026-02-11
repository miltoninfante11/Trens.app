import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Image as RNImage,
  RefreshControl,
  ActivityIndicator,
  Dimensions,
  Modal,
} from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ArrowLeft,
  Play,
  Music,
  Lock,
  Volume2,
  X,
  Flame,
  Crown,
  Dumbbell,
  Bike,
  Car,
  Waves,
  Trophy,
  ImageIcon,
} from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from '../../../lib/haptics';
import { VideoView, useVideoPlayer } from 'expo-video';
import { supabase } from '../../../lib/supabase';
import { useUserRoleContext } from '../../../context/UserRoleContext';
import spotify from '../../../services/spotify/spotify';

// ============================================================================
// TIPOS
// ============================================================================
interface PublicProfile {
  id: string;
  user_id: string;
  display_name: string;
  avatar_url: string | null;
}

interface UserSport {
  id: string;
  sport_id: string;
  code: string;
  name: string;
  icon: string;
}

interface PublicVideo {
  id: string;
  video_url: string;
  thumbnail_url: string;
  media_type?: 'video' | 'photo';
  exercise_name: string | null;
  weight_kg: number | null;
  reps: number | null;
  free_text: string | null;
  created_at: string;
  spotify: {
    enabled: boolean;
    trackUri?: string;
    trackName?: string;
    artist?: string;
    positionMs?: number;
  } | null;
}

interface PersonalRecord {
  id: string;
  exercise_name: string;
  weight_kg: number;
  reps: number;
  video_id: string | null;
}

interface DominantMuscle {
  name: string;
  value: string;
}

// ============================================================================
// DIMENSIONES
// ============================================================================
const { width: SCREEN_WIDTH } = Dimensions.get('window');
const VIDEO_TILE_SIZE = (SCREEN_WIDTH - 6) / 3;
const RECORD_CARD_WIDTH = (SCREEN_WIDTH - 56) / 3;

// ============================================================================
// MAIN COMPONENT
// ============================================================================
export default function PublicProfileScreen() {
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const insets = useSafeAreaInsets();
  const { isPro, spotifyPremium } = useUserRoleContext();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [videos, setVideos] = useState<PublicVideo[]>([]);
  const [records, setRecords] = useState<PersonalRecord[]>([]);
  const [dominantMuscle, setDominantMuscle] = useState<DominantMuscle | null>(null);
  const [userSports, setUserSports] = useState<UserSport[]>([]);
  const [isUserPro, setIsUserPro] = useState(false);

  // Video viewer state
  const [selectedVideo, setSelectedVideo] = useState<PublicVideo | null>(null);
  const [videoViewerVisible, setVideoViewerVisible] = useState(false);
  const [isVideoManuallyPaused, setIsVideoManuallyPaused] = useState(false);

  // Video player
  const videoSource = selectedVideo?.video_url || '';
  const videoPlayer = useVideoPlayer(videoSource, (player) => {
    player.loop = true;
  });

  // Control de reproducción
  useEffect(() => {
    if (videoViewerVisible && videoPlayer) {
      const hasSpotify = !!(selectedVideo?.spotify?.enabled && spotifyPremium);
      videoPlayer.volume = hasSpotify ? 0 : 1;

      if (!isVideoManuallyPaused) {
        videoPlayer.play();
      }

      if (hasSpotify && selectedVideo?.spotify?.trackUri) {
        const positionMs = selectedVideo.spotify.positionMs || 0;
        spotify.syncWithVideo(selectedVideo.spotify.trackUri, positionMs).catch(console.warn);
      }
    } else if (videoPlayer && !videoViewerVisible) {
      videoPlayer.pause();
      setIsVideoManuallyPaused(false);
      if (selectedVideo?.spotify?.enabled) {
        spotify.pauseForSwipe().catch(console.warn);
      }
    }
  }, [videoViewerVisible, videoPlayer, selectedVideo, spotifyPremium]);

  const handleVideoTap = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIsVideoManuallyPaused((prev) => {
      const newPaused = !prev;
      if (newPaused) {
        videoPlayer.pause();
      } else {
        videoPlayer.play();
      }
      return newPaused;
    });
  }, [videoPlayer]);

  // -------------------------------------------------------------------------
  // FETCH DATA
  // -------------------------------------------------------------------------
  const fetchData = useCallback(async () => {
    if (!userId) return;

    try {
      // Fetch profile
      const { data: profileData } = await supabase
        .from('user_profiles')
        .select('id, user_id, display_name, avatar_url')
        .eq('user_id', userId)
        .single();

      setProfile(profileData);

      // Fetch public videos
      const { data: videosData } = await supabase
        .from('pro_videos')
        .select('*')
        .eq('user_id', userId)
        .eq('is_public', true)
        .not('video_url', 'is', null)
        .order('created_at', { ascending: false });

      setVideos(videosData || []);

      // Si tiene videos, es PRO (solo PRO puede grabar)
      setIsUserPro((videosData?.length || 0) > 0);

      // Intentar obtener rol y deportes (pueden fallar por RLS)
      try {
        const { data: roleData } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', userId)
          .maybeSingle();

        if (roleData?.role === 'pro' || roleData?.role === 'admin') {
          setIsUserPro(true);
        }

        // Fetch user sports
        const { data: userSportsData } = await supabase
          .from('user_sports')
          .select('id, sport_id')
          .eq('user_id', userId)
          .eq('is_active', true);

        if (userSportsData && userSportsData.length > 0) {
          const sportIds = userSportsData.map((us) => us.sport_id);
          const { data: sportsDetails } = await supabase
            .from('sports')
            .select('id, code, name, icon')
            .in('id', sportIds);

          if (sportsDetails) {
            const mapped = userSportsData.map((us) => {
              const sport = sportsDetails.find((s) => s.id === us.sport_id);
              return {
                id: us.id,
                sport_id: us.sport_id,
                code: sport?.code || 'SPORT',
                name: sport?.name || 'Deporte',
                icon: sport?.icon || '🏆',
              };
            });
            setUserSports(mapped);
          }
        }
      } catch {
        // RLS puede bloquear estas consultas, ignorar silenciosamente
      }

      // Fetch records
      const { data: recordsData } = await supabase
        .from('personal_records')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: true })
        .limit(3);

      setRecords(recordsData || []);

      // Fetch dominant muscle from measurements
      const { data: measurementData } = await supabase
        .from('measurements')
        .select('name, value')
        .eq('user_id', userId)
        .eq('is_dominant', true)
        .single();

      if (measurementData) {
        setDominantMuscle(measurementData);
      }
    } catch (err) {
      console.error('Error fetching public profile:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchData();
  }, [fetchData]);

  // -------------------------------------------------------------------------
  // RENDER: Loading
  // -------------------------------------------------------------------------
  if (loading) {
    return (
      <View className="flex-1 bg-black items-center justify-center">
        <ActivityIndicator size="large" color="#DC2626" />
      </View>
    );
  }

  // -------------------------------------------------------------------------
  // RENDER: Not Found
  // -------------------------------------------------------------------------
  if (!profile) {
    return (
      <View className="flex-1 bg-black items-center justify-center">
        <Text className="text-zinc-500 text-lg">Usuario no encontrado</Text>
        <TouchableOpacity
          onPress={() => router.back()}
          className="mt-4 px-6 py-3 bg-zinc-900 rounded-lg"
        >
          <Text className="text-white font-bold">Volver</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // -------------------------------------------------------------------------
  // RENDER: Main
  // -------------------------------------------------------------------------
  return (
    <View className="flex-1 bg-black">
      {/* Fixed Header con Back Button */}
      <View className="absolute top-0 left-0 right-0 z-20" style={{ paddingTop: insets.top + 8 }}>
        <TouchableOpacity
          onPress={() => router.back()}
          className="ml-4 w-10 h-10 rounded-full bg-black/60 backdrop-blur items-center justify-center"
          style={{
            borderWidth: 1,
            borderColor: 'rgba(220, 38, 38, 0.3)',
          }}
        >
          <ArrowLeft size={20} color="#fff" />
        </TouchableOpacity>
      </View>

      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 180 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#DC2626" />
        }
      >
        {/* HERO HEADER */}
        <View className="relative items-center" style={{ paddingTop: insets.top + 60 }}>
          {/* Glow Background */}
          <View
            className="absolute top-0 left-0 right-0"
            style={{
              height: 200,
              backgroundColor: '#0a0000',
            }}
          >
            <LinearGradient
              colors={['#1a0505', '#0a0000', '#000000']}
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 1 }}
              style={{ flex: 1 }}
            />
          </View>

          {/* Avatar */}
          <View
            className="w-28 h-28 rounded-full overflow-hidden"
            style={{
              borderWidth: 3,
              borderColor: '#DC2626',
              shadowColor: '#DC2626',
              shadowOffset: { width: 0, height: 0 },
              shadowOpacity: 0.6,
              shadowRadius: 20,
              elevation: 15,
            }}
          >
            {profile.avatar_url ? (
              <Image
                source={{ uri: profile.avatar_url }}
                className="w-full h-full"
                resizeMode="cover"
              />
            ) : (
              <LinearGradient
                colors={['#DC2626', '#991B1B']}
                className="w-full h-full items-center justify-center"
              >
                <Text className="text-4xl font-black text-white">
                  {profile.display_name?.charAt(0).toUpperCase() || 'A'}
                </Text>
              </LinearGradient>
            )}
          </View>

          {/* Name + PRO Badge */}
          <View className="flex-row items-center gap-2 mt-4">
            <Text
              className="text-white text-2xl font-black uppercase tracking-[4px]"
              style={{
                textShadowColor: '#DC2626',
                textShadowOffset: { width: 0, height: 0 },
                textShadowRadius: 10,
              }}
            >
              {profile.display_name}
            </Text>
            {isUserPro && (
              <LinearGradient
                colors={['#F59E0B', '#D97706']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                className="px-2 py-0.5 rounded"
                style={{
                  shadowColor: '#F59E0B',
                  shadowOffset: { width: 0, height: 0 },
                  shadowOpacity: 0.5,
                  shadowRadius: 8,
                  elevation: 5,
                }}
              >
                <View className="flex-row items-center gap-1">
                  <Crown size={10} color="#000" />
                  <Text className="text-black text-[10px] font-black">PRO</Text>
                </View>
              </LinearGradient>
            )}
          </View>

          {/* Sports Badges */}
          {userSports.length > 0 && (
            <View className="flex-row flex-wrap items-center justify-center gap-2 mt-3 px-4">
              {userSports.map((us) => (
                <View
                  key={us.id}
                  className="flex-row items-center gap-1.5 px-3 py-1.5 rounded-full"
                  style={{
                    backgroundColor: 'rgba(220, 38, 38, 0.1)',
                    borderWidth: 1,
                    borderColor: '#DC262650',
                  }}
                >
                  {(() => {
                    const iconProps = { size: 14, color: '#F97316' };
                    switch (us.icon) {
                      case 'Dumbbell':
                        return <Dumbbell {...iconProps} />;
                      case 'Bike':
                        return <Bike {...iconProps} />;
                      case 'Car':
                        return <Car {...iconProps} />;
                      case 'Waves':
                        return <Waves {...iconProps} />;
                      default:
                        return <Trophy {...iconProps} />;
                    }
                  })()}
                  <Text className="text-fire-orange text-xs font-bold uppercase tracking-wider">
                    {us.code}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {/* Dominant Muscle Badge */}
          {dominantMuscle && (
            <View className="flex-row items-center gap-2 mt-3 px-4 py-2 rounded-xl bg-zinc-900/80 border border-fire-orange/30">
              <Flame size={14} color="#F97316" />
              <Text className="text-fire-orange text-xs font-bold uppercase tracking-wider">
                {dominantMuscle.name}
              </Text>
              <Text className="text-white text-sm font-mono font-bold">
                {dominantMuscle.value}cm
              </Text>
            </View>
          )}

          {/* Stats Row */}
          <View className="flex-row items-center gap-6 mt-5">
            <View className="items-center">
              <Text className="text-white text-xl font-mono font-black">{videos.length}</Text>
              <Text className="text-zinc-600 text-[10px] uppercase tracking-wider">Videos</Text>
            </View>
            <View className="w-px h-6 bg-zinc-800" />
            <View className="items-center">
              <Text className="text-white text-xl font-mono font-black">{records.length}</Text>
              <Text className="text-zinc-600 text-[10px] uppercase tracking-wider">Récords</Text>
            </View>
          </View>
        </View>

        {/* RECORDS SECTION */}
        {records.length > 0 && (
          <View className="mt-6 px-4">
            {/* Section Header */}
            <View className="flex-row items-center gap-2 mb-3">
              <LinearGradient
                colors={['#DC2626', '#F97316']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                className="w-1 h-4 rounded-full"
              />
              <Text className="text-white font-bold text-xs uppercase tracking-widest">
                Top Récords
              </Text>
            </View>

            {/* Records - Tamaño fijo proporcional */}
            <View className="flex-row gap-2">
              {records.map((rec) => {
                const video = videos.find((v) => v.id === rec.video_id);
                return (
                  <TouchableOpacity
                    key={rec.id}
                    onPress={() => {
                      if (video) {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setSelectedVideo(video);
                        setVideoViewerVisible(true);
                      }
                    }}
                    className="rounded-xl overflow-hidden"
                    style={{
                      width: RECORD_CARD_WIDTH,
                      aspectRatio: 9 / 16,
                      backgroundColor: '#0a0a0a',
                    }}
                  >
                    {video?.thumbnail_url && (
                      <Image
                        source={{ uri: video.thumbnail_url }}
                        className="absolute inset-0 w-full h-full"
                        resizeMode="cover"
                      />
                    )}
                    {/* Gradients */}
                    <LinearGradient
                      colors={['rgba(0,0,0,0.6)', 'transparent', 'rgba(0,0,0,0.95)']}
                      className="absolute inset-0"
                    />
                    {/* Fire top border */}
                    <LinearGradient
                      colors={['#DC2626', '#F97316', '#FBBF24']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2 }}
                    />
                    {/* Spotify badge */}
                    {video?.spotify?.enabled && (
                      <View className="absolute top-2 right-2 w-5 h-5 rounded-full bg-black/60 items-center justify-center">
                        <Music size={10} color="#1DB954" />
                      </View>
                    )}
                    {/* Play icon if no thumbnail */}
                    {!video?.thumbnail_url && (
                      <View className="absolute inset-0 items-center justify-center">
                        <Play size={24} color="#52525b" />
                      </View>
                    )}
                    {/* Info */}
                    <View className="absolute bottom-0 left-0 right-0 p-2">
                      <Text
                        className="text-[9px] font-bold text-white/80 uppercase tracking-wider"
                        numberOfLines={1}
                      >
                        {rec.exercise_name}
                      </Text>
                      <View className="flex-row items-baseline gap-1">
                        <Text className="text-xl font-mono font-black text-fire-orange">
                          {rec.weight_kg}
                        </Text>
                        <Text className="text-[8px] text-zinc-400 font-bold">KG</Text>
                        <Text className="text-zinc-500 text-[10px] ml-1">×{rec.reps}</Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        {/* VIDEOS GRID SECTION */}
        <View className="mt-6">
          {/* Section Header */}
          <View className="flex-row items-center gap-2 mb-3 px-4">
            <LinearGradient
              colors={['#DC2626', '#F97316']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              className="w-1 h-4 rounded-full"
            />
            <Text className="text-white font-bold text-xs uppercase tracking-widest">Legado</Text>
            <View className="flex-1" />
            <Text className="text-zinc-600 text-xs">{videos.length} videos</Text>
          </View>

          {/* Grid */}
          <View className="flex-row flex-wrap px-0.5">
            {videos.map((video) => (
              <TouchableOpacity
                key={video.id}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setSelectedVideo(video);
                  setVideoViewerVisible(true);
                }}
                style={{
                  width: VIDEO_TILE_SIZE,
                  height: VIDEO_TILE_SIZE * (16 / 9),
                  padding: 1,
                }}
              >
                <View className="flex-1 bg-zinc-900 overflow-hidden">
                  {video.thumbnail_url ? (
                    <Image
                      source={{ uri: video.thumbnail_url }}
                      className="w-full h-full"
                      resizeMode="cover"
                    />
                  ) : (
                    <View className="flex-1 items-center justify-center bg-zinc-900">
                      <Play size={20} color="#3f3f46" />
                    </View>
                  )}
                  {/* Spotify badge */}
                  {video.spotify?.enabled && (
                    <View className="absolute top-1 right-1 w-4 h-4 rounded-full bg-black/70 items-center justify-center">
                      <Music size={8} color="#1DB954" />
                    </View>
                  )}
                  {/* Weight overlay */}
                  {video.weight_kg && (
                    <LinearGradient
                      colors={['transparent', 'rgba(0,0,0,0.85)']}
                      className="absolute bottom-0 left-0 right-0 px-1 pb-1 pt-4"
                    >
                      <Text className="text-fire-orange text-[10px] font-mono font-bold">
                        {video.weight_kg}kg
                      </Text>
                    </LinearGradient>
                  )}
                </View>
              </TouchableOpacity>
            ))}
          </View>

          {/* Empty state */}
          {videos.length === 0 && (
            <View className="items-center justify-center py-16">
              <View className="w-16 h-16 rounded-full bg-zinc-900 items-center justify-center mb-3">
                <Play size={24} color="#52525b" />
              </View>
              <Text className="text-zinc-600 text-sm">Sin videos públicos</Text>
            </View>
          )}
        </View>
      </ScrollView>

      {/* VIDEO VIEWER MODAL */}
      <Modal
        visible={videoViewerVisible}
        animationType="fade"
        transparent={true}
        onRequestClose={() => {
          setVideoViewerVisible(false);
          setSelectedVideo(null);
          spotify.pauseForSwipe().catch(() => {});
        }}
      >
        <View className="flex-1 bg-black">
          {/* Header */}
          <View
            className="absolute top-0 left-0 right-0 z-10 px-4 pb-4"
            style={{ paddingTop: insets.top + 8 }}
          >
            <View className="flex-row items-center justify-between">
              <TouchableOpacity
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setVideoViewerVisible(false);
                  setSelectedVideo(null);
                  spotify.pauseForSwipe().catch(() => {});
                }}
                className="w-10 h-10 rounded-full bg-black/60 items-center justify-center border border-zinc-800"
              >
                <X size={20} color="#fff" />
              </TouchableOpacity>
              <View className="flex-1 mx-4">
                <Text className="text-white font-bold text-sm text-center" numberOfLines={1}>
                  {selectedVideo?.exercise_name || selectedVideo?.free_text || 'Video'}
                </Text>
                {selectedVideo?.weight_kg && selectedVideo?.reps && (
                  <Text className="text-fire-orange text-xs text-center font-mono">
                    {selectedVideo.weight_kg}kg × {selectedVideo.reps}
                  </Text>
                )}
              </View>
              <View className="w-10" />
            </View>
          </View>

          {/* Video/Photo Player */}
          <TouchableOpacity
            activeOpacity={1}
            onPress={selectedVideo?.media_type === 'photo' ? undefined : handleVideoTap}
            className="flex-1 items-center justify-center"
          >
            {selectedVideo?.media_type === 'photo' ? (
              <Image
                source={{ uri: selectedVideo.video_url || selectedVideo.thumbnail_url }}
                style={{ width: SCREEN_WIDTH, height: SCREEN_WIDTH * (16 / 9) }}
                contentFit="contain"
              />
            ) : selectedVideo?.video_url ? (
              <VideoView
                player={videoPlayer}
                style={{ width: SCREEN_WIDTH, height: SCREEN_WIDTH * (16 / 9) }}
                contentFit="contain"
                nativeControls={false}
              />
            ) : null}
            {isVideoManuallyPaused && selectedVideo?.media_type !== 'photo' && (
              <View className="absolute inset-0 items-center justify-center">
                <View className="w-20 h-20 rounded-full bg-black/50 items-center justify-center">
                  <Play size={40} color="#FFFFFF" fill="#FFFFFF" />
                </View>
              </View>
            )}
          </TouchableOpacity>

          {/* Spotify Footer */}
          {selectedVideo?.spotify?.enabled && (
            <View
              className="absolute bottom-0 left-0 right-0 px-4 pt-4"
              style={{ paddingBottom: insets.bottom + 16 }}
            >
              <LinearGradient
                colors={['transparent', 'rgba(0,0,0,0.9)']}
                className="absolute inset-0"
              />
              <View className="flex-row items-center gap-2 bg-zinc-900/90 rounded-xl px-4 py-3 border border-zinc-800">
                <Music size={18} color="#1DB954" />
                <View className="flex-1">
                  <Text className="text-white text-sm font-bold" numberOfLines={1}>
                    {selectedVideo.spotify.trackName}
                  </Text>
                  <Text className="text-zinc-500 text-xs" numberOfLines={1}>
                    {selectedVideo.spotify.artist}
                  </Text>
                </View>
                {spotifyPremium ? (
                  <Volume2 size={18} color="#1DB954" />
                ) : (
                  <Lock size={16} color="#71717a" />
                )}
              </View>
            </View>
          )}
        </View>
      </Modal>
    </View>
  );
}
