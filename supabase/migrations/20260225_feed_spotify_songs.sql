-- ============================================================================
-- FEED SPOTIFY SONG ASSIGNMENT
-- Allows admins to assign Spotify songs to IG reels from admin panel
-- Also updates RPC to return Spotify data for IG reels
-- ============================================================================

-- 1. Add Spotify columns to trens_feed
ALTER TABLE public.trens_feed ADD COLUMN IF NOT EXISTS track_name TEXT;
ALTER TABLE public.trens_feed ADD COLUMN IF NOT EXISTS track_artist TEXT;
ALTER TABLE public.trens_feed ADD COLUMN IF NOT EXISTS spotify_uri TEXT;
ALTER TABLE public.trens_feed ADD COLUMN IF NOT EXISTS spotify_album_art TEXT;

-- 2. Admin update policy (for assigning songs)
DROP POLICY IF EXISTS "Admin can update feed" ON public.trens_feed;
CREATE POLICY "Admin can update feed" ON public.trens_feed FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_users au
      WHERE au.user_id = auth.uid()
    )
  );

-- 3. Updated RPC: now returns Spotify JSONB for IG reels with songs
DROP FUNCTION IF EXISTS public.get_feed_page(INT, INT, UUID);

CREATE OR REPLACE FUNCTION public.get_feed_page(
  p_limit INT DEFAULT 15,
  p_offset INT DEFAULT 0,
  p_user_id UUID DEFAULT NULL
)
RETURNS TABLE (
  id TEXT,
  user_id TEXT,
  video_url TEXT,
  thumbnail_url TEXT,
  media_type TEXT,
  exercise_name TEXT,
  weight_kg DECIMAL,
  reps INT,
  free_text TEXT,
  spotify JSONB,
  created_at TIMESTAMPTZ,
  user_display_name TEXT,
  user_avatar_url TEXT,
  likes_count INT,
  comments_count INT,
  is_liked BOOLEAN,
  is_saved BOOLEAN,
  source TEXT,
  ig_permalink TEXT,
  is_official BOOLEAN,
  feed_score FLOAT,
  total_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_daily_seed TEXT := to_char(current_date, 'YYYYMMDD');
BEGIN
  RETURN QUERY
  WITH unified_feed AS (
    -- SOURCE 1: Pro Videos
    SELECT
      pv.id AS raw_id,
      pv.id::TEXT AS display_id,
      pv.user_id::TEXT AS f_user_id,
      pv.video_url AS f_video_url,
      COALESCE(pv.thumbnail_url, '') AS f_thumbnail_url,
      'video'::TEXT AS f_media_type,
      pv.exercise_name AS f_exercise_name,
      pv.weight_kg AS f_weight_kg,
      pv.reps AS f_reps,
      pv.free_text AS f_free_text,
      pv.spotify AS f_spotify,
      pv.created_at AS f_created_at,
      COALESCE(up.display_name, 'ATLETA') AS f_user_display_name,
      up.avatar_url AS f_user_avatar_url,
      COALESCE(pv.likes_count, 0) AS f_likes_count,
      COALESCE(pv.comments_count, 0) AS f_comments_count,
      COALESCE(pv.views_count, 0) AS f_views_count,
      'pro_video'::TEXT AS f_source,
      NULL::TEXT AS f_ig_permalink,
      false AS f_is_official
    FROM public.pro_videos pv
    LEFT JOIN public.user_profiles up ON up.user_id = pv.user_id
    WHERE pv.is_public = true

    UNION ALL

    -- SOURCE 2: Instagram Reels (with Spotify data when assigned by admin)
    SELECT
      NULL::UUID AS raw_id,
      'ig_' || tf.id::TEXT AS display_id,
      COALESCE(tf.user_id::TEXT, 'trens_official') AS f_user_id,
      tf.video_url AS f_video_url,
      COALESCE(tf.thumbnail_url, '') AS f_thumbnail_url,
      'video'::TEXT AS f_media_type,
      NULL::TEXT AS f_exercise_name,
      NULL::DECIMAL AS f_weight_kg,
      NULL::INT AS f_reps,
      tf.caption AS f_free_text,
      CASE
        WHEN tf.spotify_uri IS NOT NULL AND tf.track_name IS NOT NULL
        THEN jsonb_build_object(
          'enabled', true,
          'trackUri', tf.spotify_uri,
          'trackName', tf.track_name,
          'artist', COALESCE(tf.track_artist, ''),
          'albumArt', COALESCE(tf.spotify_album_art, ''),
          'positionMs', 0
        )
        ELSE NULL
      END AS f_spotify,
      COALESCE(tf.ig_timestamp, tf.created_at) AS f_created_at,
      CASE WHEN tf.is_official THEN 'TRENS' ELSE 'COMUNIDAD' END AS f_user_display_name,
      NULL::TEXT AS f_user_avatar_url,
      COALESCE(tf.like_count, 0) AS f_likes_count,
      COALESCE(tf.comment_count, 0) AS f_comments_count,
      COALESCE(tf.view_count, 0) AS f_views_count,
      'instagram_reel'::TEXT AS f_source,
      tf.ig_permalink AS f_ig_permalink,
      COALESCE(tf.is_official, false) AS f_is_official
    FROM public.trens_feed tf
    WHERE tf.is_active = true
  ),
  scored AS (
    SELECT
      uf.*,
      (abs(('x' || substring(md5(uf.display_id || v_daily_seed), 1, 8))::bit(32)::int)::FLOAT / 2147483647.0) * 0.4
      + (1.0 / (1.0 + EXTRACT(EPOCH FROM (now() - uf.f_created_at)) / 604800.0)) * 0.35
      + LEAST(ln(GREATEST(uf.f_likes_count + (uf.f_views_count * 0.05)::INT + 1, 1)) / 8.0, 1.0) * 0.25
      AS computed_score,
      COUNT(*) OVER() AS cnt
    FROM unified_feed uf
  )
  SELECT
    s.display_id AS id,
    s.f_user_id AS user_id,
    s.f_video_url AS video_url,
    s.f_thumbnail_url AS thumbnail_url,
    s.f_media_type AS media_type,
    s.f_exercise_name AS exercise_name,
    s.f_weight_kg AS weight_kg,
    s.f_reps AS reps,
    s.f_free_text AS free_text,
    s.f_spotify AS spotify,
    s.f_created_at AS created_at,
    s.f_user_display_name AS user_display_name,
    s.f_user_avatar_url AS user_avatar_url,
    s.f_likes_count AS likes_count,
    s.f_comments_count AS comments_count,
    CASE
      WHEN p_user_id IS NOT NULL AND s.raw_id IS NOT NULL
      THEN EXISTS(SELECT 1 FROM public.video_likes vl WHERE vl.user_id = p_user_id AND vl.video_id = s.raw_id)
      ELSE false
    END AS is_liked,
    CASE
      WHEN p_user_id IS NOT NULL AND s.raw_id IS NOT NULL
      THEN EXISTS(SELECT 1 FROM public.video_saves vs WHERE vs.user_id = p_user_id AND vs.video_id = s.raw_id)
      ELSE false
    END AS is_saved,
    s.f_source AS source,
    s.f_ig_permalink AS ig_permalink,
    s.f_is_official AS is_official,
    s.computed_score::FLOAT AS feed_score,
    s.cnt AS total_count
  FROM scored s
  ORDER BY s.computed_score DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_feed_page(INT, INT, UUID) TO anon, authenticated, service_role;
