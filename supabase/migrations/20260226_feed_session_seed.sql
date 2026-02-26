-- ============================================================================
-- FEED ALGORITHM V2.1: Session-Based Shuffle
-- ============================================================================
--
-- Changes:
--   1. New parameter p_session_seed TEXT — client sends a unique seed per app session
--   2. Exploration component uses session seed instead of daily date
--      → Every new app open = new order
--      → Same session = stable pagination (scroll consistency)
--   3. Backward compatible: if p_session_seed is NULL, falls back to daily seed
-- ============================================================================

-- Drop ALL overloads to avoid ambiguity
DROP FUNCTION IF EXISTS public.get_feed_page(INT, INT, UUID);
DROP FUNCTION IF EXISTS public.get_feed_page(INT, INT, UUID, TEXT);

CREATE OR REPLACE FUNCTION public.get_feed_page(
  p_limit INT DEFAULT 15,
  p_offset INT DEFAULT 0,
  p_user_id UUID DEFAULT NULL,
  p_session_seed TEXT DEFAULT NULL
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
  -- Use session seed if provided, otherwise fall back to daily seed
  v_seed TEXT := COALESCE(p_session_seed, to_char(current_date, 'YYYYMMDD'));
  v_has_history BOOLEAN := false;
BEGIN

  -- Check if this user has any interaction history (for cold-start handling)
  IF p_user_id IS NOT NULL THEN
    SELECT EXISTS(
      SELECT 1 FROM public.feed_interactions fi_check
      WHERE fi_check.user_id = p_user_id 
      LIMIT 1
    ) INTO v_has_history;
  END IF;

  RETURN QUERY
  WITH 
  -- ================================================================
  -- UNIFIED FEED: Combine all content sources
  -- ================================================================
  unified_feed AS (
    -- SOURCE 1: Pro Videos (user-generated content)
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
      COALESCE(pv.duration_seconds, 0) AS f_duration_seconds,
      'pro_video'::TEXT AS f_source,
      NULL::TEXT AS f_ig_permalink,
      false AS f_is_official
    FROM public.pro_videos pv
    LEFT JOIN public.user_profiles up ON up.user_id = pv.user_id
    WHERE pv.is_public = true

    UNION ALL

    -- SOURCE 2: Instagram Reels (official + community)
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
      0 AS f_duration_seconds,
      'instagram_reel'::TEXT AS f_source,
      tf.ig_permalink AS f_ig_permalink,
      COALESCE(tf.is_official, false) AS f_is_official
    FROM public.trens_feed tf
    WHERE tf.is_active = true
  ),

  -- ================================================================
  -- USER AFFINITY: Pre-compute creator affinity for this user
  -- ================================================================
  user_creator_affinity AS (
    SELECT
      fi.video_id,
      COALESCE(pv.user_id::TEXT, 
        CASE WHEN fi.video_id LIKE 'ig_%' 
          THEN COALESCE(tf2.user_id::TEXT, 'trens_official')
          ELSE NULL 
        END
      ) AS creator_id,
      fi.interaction_type,
      fi.completion_rate
    FROM public.feed_interactions fi
    LEFT JOIN public.pro_videos pv ON fi.video_id = pv.id::TEXT AND fi.source = 'pro_video'
    LEFT JOIN public.trens_feed tf2 ON fi.video_id = 'ig_' || tf2.id::TEXT AND fi.source = 'instagram_reel'
    WHERE fi.user_id = p_user_id
      AND fi.created_at > NOW() - INTERVAL '30 days'
      AND p_user_id IS NOT NULL
  ),
  creator_scores AS (
    SELECT
      uca.creator_id,
      SUM(CASE 
        WHEN uca.interaction_type = 'like' THEN 1.0
        WHEN uca.interaction_type = 'save' THEN 3.0
        WHEN uca.interaction_type = 'share' THEN 2.0
        WHEN uca.interaction_type = 'replay' THEN 2.5
        WHEN uca.interaction_type = 'view' AND uca.completion_rate >= 0.8 THEN 1.5
        WHEN uca.interaction_type = 'view' AND uca.completion_rate >= 0.5 THEN 0.5
        WHEN uca.interaction_type = 'skip' THEN -1.0
        ELSE 0.0
      END) AS raw_affinity
    FROM user_creator_affinity uca
    WHERE uca.creator_id IS NOT NULL
    GROUP BY uca.creator_id
  ),

  -- ================================================================
  -- USER VIEWED: Videos the user has already seen
  -- ================================================================
  user_viewed AS (
    SELECT DISTINCT fi.video_id, MAX(fi.created_at) AS last_viewed
    FROM public.feed_interactions fi
    WHERE fi.user_id = p_user_id
      AND fi.interaction_type = 'view'
      AND p_user_id IS NOT NULL
    GROUP BY fi.video_id
  ),

  -- ================================================================
  -- SCORING ENGINE
  -- ================================================================
  scored AS (
    SELECT
      uf.*,
      (
        -- ============================================================
        -- COMPONENT 1 (30%): GLOBAL QUALITY
        -- ============================================================
        COALESCE(vq.quality_score, 
          LEAST(LN(GREATEST(uf.f_likes_count + (uf.f_views_count * 0.05)::INT + 1, 1)) / 8.0, 1.0) * 0.5
        ) * 0.30

        -- ============================================================
        -- COMPONENT 2 (35%): USER AFFINITY (personalization)
        -- ============================================================
        + CASE
            WHEN v_has_history AND cs.raw_affinity IS NOT NULL THEN
              LEAST(1.0, cs.raw_affinity / GREATEST(ABS(cs.raw_affinity) + 5.0, 0.01)) * 0.35
            WHEN v_has_history THEN
              0.05
            ELSE
              0.15
          END

        -- ============================================================
        -- COMPONENT 3 (15%): RECENCY
        -- ============================================================
        + (1.0 / (1.0 + EXTRACT(EPOCH FROM (now() - uf.f_created_at)) / 604800.0)) * 0.15

        -- ============================================================
        -- COMPONENT 4 (10%): EXPLORATION / SERENDIPITY
        -- Uses SESSION SEED: new app open = new shuffle
        -- Same session = stable order for pagination
        -- ============================================================
        + (abs(('x' || substring(md5(uf.display_id || v_seed), 1, 8))::bit(32)::int)::FLOAT / 2147483647.0) * 0.10

        -- ============================================================
        -- COMPONENT 5: PENALTIES
        -- ============================================================
        - CASE
            WHEN uv.video_id IS NOT NULL AND uv.last_viewed > NOW() - INTERVAL '3 days' THEN 0.25
            WHEN uv.video_id IS NOT NULL AND uv.last_viewed > NOW() - INTERVAL '14 days' THEN 0.12
            WHEN uv.video_id IS NOT NULL THEN 0.05
            ELSE 0.0
          END

        -- Official content slight boost
        + CASE WHEN uf.f_is_official THEN 0.03 ELSE 0.0 END

      ) AS computed_score,

      uf.f_user_id AS score_creator_id,
      COUNT(*) OVER() AS cnt
    FROM unified_feed uf
    LEFT JOIN public.mv_video_quality vq ON vq.video_id = uf.display_id
    LEFT JOIN creator_scores cs ON cs.creator_id = uf.f_user_id
    LEFT JOIN user_viewed uv ON uv.video_id = uf.display_id
  ),

  -- ================================================================
  -- CADENCE RULE: Max 2 consecutive from same creator
  -- ================================================================
  ranked AS (
    SELECT
      s.*,
      ROW_NUMBER() OVER (ORDER BY s.computed_score DESC) AS global_rank,
      ROW_NUMBER() OVER (PARTITION BY s.score_creator_id ORDER BY s.computed_score DESC) AS creator_rank
    FROM scored s
  ),
  cadenced AS (
    SELECT
      r.*,
      CASE 
        WHEN r.creator_rank > 2 THEN r.computed_score - (0.08 * (r.creator_rank - 2))
        ELSE r.computed_score
      END AS final_score
    FROM ranked r
  )

  -- ================================================================
  -- FINAL SELECT
  -- ================================================================
  SELECT
    c.display_id AS id,
    c.f_user_id AS user_id,
    c.f_video_url AS video_url,
    c.f_thumbnail_url AS thumbnail_url,
    c.f_media_type AS media_type,
    c.f_exercise_name AS exercise_name,
    c.f_weight_kg AS weight_kg,
    c.f_reps AS reps,
    c.f_free_text AS free_text,
    c.f_spotify AS spotify,
    c.f_created_at AS created_at,
    c.f_user_display_name AS user_display_name,
    c.f_user_avatar_url AS user_avatar_url,
    c.f_likes_count AS likes_count,
    c.f_comments_count AS comments_count,
    CASE
      WHEN p_user_id IS NOT NULL AND c.raw_id IS NOT NULL
      THEN EXISTS(SELECT 1 FROM public.video_likes vl WHERE vl.user_id = p_user_id AND vl.video_id = c.raw_id)
      ELSE false
    END AS is_liked,
    CASE
      WHEN p_user_id IS NOT NULL AND c.raw_id IS NOT NULL
      THEN EXISTS(SELECT 1 FROM public.video_saves vs WHERE vs.user_id = p_user_id AND vs.video_id = c.raw_id)
      ELSE false
    END AS is_saved,
    c.f_source AS source,
    c.f_ig_permalink AS ig_permalink,
    c.f_is_official AS is_official,
    c.final_score::FLOAT AS feed_score,
    c.cnt AS total_count
  FROM cadenced c
  ORDER BY c.final_score DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_feed_page(INT, INT, UUID, TEXT) TO anon, authenticated, service_role;
