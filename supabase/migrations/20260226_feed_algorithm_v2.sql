-- ============================================================================
-- FEED ALGORITHM V2: TikTok-Style Personalized Ranking
-- ============================================================================
-- 
-- Previous: "Fresh Shuffle" = random(40%) + recency(35%) + engagement(25%)
-- New: Personalized scoring based on implicit behavioral signals
--
-- Architecture:
--   1. feed_interactions — tracks every user action (view, like, save, share, skip, replay)
--   2. get_feed_page v2 — scoring = global_quality(30%) + user_affinity(35%) + recency(15%) + exploration(10%) - penalties(10%)
--   3. Cadence rule — max 2 consecutive videos from same creator
--
-- Key signals (TikTok-inspired weights):
--   completion_rate > 80%  → strongest positive signal
--   replay (> 100%)        → extreme quality indicator
--   save                   → highest-intent explicit signal (3x like)
--   share                  → amplification signal
--   like                   → explicit validation
--   skip (< 2s)            → negative signal
-- ============================================================================

-- ============================================================================
-- PART 1: FEED_INTERACTIONS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.feed_interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  video_id TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('pro_video', 'instagram_reel')),
  interaction_type TEXT NOT NULL CHECK (interaction_type IN ('view', 'like', 'save', 'share', 'skip', 'replay', 'unlike', 'unsave')),
  watch_duration_ms INT DEFAULT 0,
  video_duration_ms INT DEFAULT 0,
  completion_rate FLOAT DEFAULT 0,
  session_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for fast reads in the RPC
CREATE INDEX IF NOT EXISTS idx_fi_user_video ON public.feed_interactions(user_id, video_id);
CREATE INDEX IF NOT EXISTS idx_fi_user_type ON public.feed_interactions(user_id, interaction_type);
CREATE INDEX IF NOT EXISTS idx_fi_video_type ON public.feed_interactions(video_id, interaction_type);
CREATE INDEX IF NOT EXISTS idx_fi_created ON public.feed_interactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fi_user_created ON public.feed_interactions(user_id, created_at DESC);
-- Composite index for the affinity subquery (creator affinity lookup)
CREATE INDEX IF NOT EXISTS idx_fi_user_type_video ON public.feed_interactions(user_id, interaction_type, video_id);

-- RLS: Users can only INSERT their own, SELECT their own
ALTER TABLE public.feed_interactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fi_insert_own" ON public.feed_interactions;
CREATE POLICY "fi_insert_own" ON public.feed_interactions 
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "fi_select_own" ON public.feed_interactions;
CREATE POLICY "fi_select_own" ON public.feed_interactions 
  FOR SELECT USING (auth.uid() = user_id);

-- Service role can read all (for admin analytics)
DROP POLICY IF EXISTS "fi_select_service" ON public.feed_interactions;
CREATE POLICY "fi_select_service" ON public.feed_interactions
  FOR SELECT USING (auth.role() = 'service_role');

-- Allow anon to insert (for unauthenticated feed browsing — track views without user)
DROP POLICY IF EXISTS "fi_insert_anon" ON public.feed_interactions;
CREATE POLICY "fi_insert_anon" ON public.feed_interactions
  FOR INSERT WITH CHECK (true);

-- ============================================================================
-- PART 2: MATERIALIZED VIEW — VIDEO QUALITY SCORES
-- Pre-computes global quality per video for fast lookups
-- Refreshed periodically via cron or on-demand
-- ============================================================================

-- Drop if exists (safe re-run)
DROP MATERIALIZED VIEW IF EXISTS public.mv_video_quality;

CREATE MATERIALIZED VIEW public.mv_video_quality AS
WITH interaction_stats AS (
  SELECT
    fi.video_id,
    -- Completion metrics
    COUNT(*) FILTER (WHERE fi.interaction_type = 'view') AS view_count,
    AVG(fi.completion_rate) FILTER (WHERE fi.interaction_type = 'view' AND fi.completion_rate > 0) AS avg_completion,
    COUNT(*) FILTER (WHERE fi.interaction_type = 'view' AND fi.completion_rate >= 0.8) AS high_completion_count,
    COUNT(*) FILTER (WHERE fi.interaction_type = 'replay') AS replay_count,
    -- Explicit signals
    COUNT(*) FILTER (WHERE fi.interaction_type = 'like') AS like_count,
    COUNT(*) FILTER (WHERE fi.interaction_type = 'save') AS save_count,
    COUNT(*) FILTER (WHERE fi.interaction_type = 'share') AS share_count,
    COUNT(*) FILTER (WHERE fi.interaction_type = 'skip') AS skip_count
  FROM public.feed_interactions fi
  WHERE fi.created_at > NOW() - INTERVAL '30 days'
  GROUP BY fi.video_id
)
SELECT
  ist.video_id,
  COALESCE(ist.view_count, 0) AS total_views,
  COALESCE(ist.avg_completion, 0) AS avg_completion_rate,
  -- Quality score: weighted combination of signals
  LEAST(1.0, (
    -- Completion rate (0-1, strongest signal)
    COALESCE(ist.avg_completion, 0) * 0.35
    -- High-completion ratio (what % of viewers watched 80%+)
    + CASE WHEN ist.view_count > 0 
        THEN LEAST(1.0, ist.high_completion_count::FLOAT / ist.view_count) * 0.20
        ELSE 0 END
    -- Replay ratio (replays per view, capped at 1)
    + CASE WHEN ist.view_count > 0 
        THEN LEAST(1.0, ist.replay_count::FLOAT / ist.view_count) * 0.15
        ELSE 0 END
    -- Save ratio (saves are 3x more valuable than likes)
    + CASE WHEN ist.view_count > 0
        THEN LEAST(1.0, (ist.save_count * 3.0 + ist.like_count + ist.share_count * 2.0) / GREATEST(ist.view_count, 1)) * 0.20
        ELSE 0 END
    -- Skip penalty (high skip rate = bad content)
    - CASE WHEN ist.view_count > 0
        THEN LEAST(0.3, ist.skip_count::FLOAT / ist.view_count * 0.3)
        ELSE 0 END
    -- Volume bonus (more views = more confidence, log scaled)
    + LEAST(0.10, LN(GREATEST(ist.view_count, 1)) / 20.0)
  )) AS quality_score
FROM interaction_stats ist;

-- Index on the materialized view for fast lookups
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_vq_video ON public.mv_video_quality(video_id);

-- ============================================================================
-- PART 3: FUNCTION TO REFRESH MATERIALIZED VIEW
-- Can be called by cron (pg_cron) or manually
-- ============================================================================

CREATE OR REPLACE FUNCTION public.refresh_video_quality()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_video_quality;
END;
$$;

GRANT EXECUTE ON FUNCTION public.refresh_video_quality() TO service_role;

-- ============================================================================
-- PART 4: REWRITTEN get_feed_page RPC (V2)
-- ============================================================================

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
  v_has_history BOOLEAN := false;
BEGIN

  -- Check if this user has any interaction history (for cold-start handling)
  IF p_user_id IS NOT NULL THEN
    SELECT EXISTS(
      SELECT 1 FROM public.feed_interactions 
      WHERE user_id = p_user_id 
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
  -- (which creators has this user engaged with positively?)
  -- ================================================================
  user_creator_affinity AS (
    SELECT
      fi.video_id,
      -- Find the creator of each interacted video
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
      -- Weighted engagement score per creator
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
        -- From materialized view (pre-computed) OR fallback to legacy
        -- ============================================================
        COALESCE(vq.quality_score, 
          -- Fallback for videos with no interaction data yet (cold content)
          -- Use legacy IG metrics as proxy
          LEAST(LN(GREATEST(uf.f_likes_count + (uf.f_views_count * 0.05)::INT + 1, 1)) / 8.0, 1.0) * 0.5
        ) * 0.30

        -- ============================================================
        -- COMPONENT 2 (35%): USER AFFINITY (personalization)
        -- How much does THIS user engage with THIS creator?
        -- Falls back to 0 for anonymous users (cold start)
        -- ============================================================
        + CASE
            WHEN v_has_history AND cs.raw_affinity IS NOT NULL THEN
              -- Normalize affinity: sigmoid-like scaling (caps extreme fans)
              LEAST(1.0, cs.raw_affinity / (cs.raw_affinity + 5.0)) * 0.35
            WHEN v_has_history THEN
              -- User has history but never interacted with this creator
              -- Slight exploration bonus to discover new creators
              0.05
            ELSE
              -- Anonymous / cold start: no personalization, use neutral value
              0.15
          END

        -- ============================================================
        -- COMPONENT 3 (15%): RECENCY
        -- Exponential decay, ~7 day half-life (same as before)
        -- ============================================================
        + (1.0 / (1.0 + EXTRACT(EPOCH FROM (now() - uf.f_created_at)) / 604800.0)) * 0.15

        -- ============================================================
        -- COMPONENT 4 (10%): EXPLORATION / SERENDIPITY
        -- Deterministic daily random (reshuffles at midnight)
        -- Reduced from 40% to 10% — quality beats randomness
        -- ============================================================
        + (abs(('x' || substring(md5(uf.display_id || v_daily_seed), 1, 8))::bit(32)::int)::FLOAT / 2147483647.0) * 0.10

        -- ============================================================
        -- COMPONENT 5: PENALTIES
        -- ============================================================
        -- Already-seen penalty: push viewed content down
        - CASE
            WHEN uv.video_id IS NOT NULL AND uv.last_viewed > NOW() - INTERVAL '3 days' THEN 0.25
            WHEN uv.video_id IS NOT NULL AND uv.last_viewed > NOW() - INTERVAL '14 days' THEN 0.12
            WHEN uv.video_id IS NOT NULL THEN 0.05  -- Old views: minimal penalty (can resurface)
            ELSE 0.0  -- Never seen: no penalty
          END

        -- Official content slight boost (curated by TRENS team)
        + CASE WHEN uf.f_is_official THEN 0.03 ELSE 0.0 END

      ) AS computed_score,

      -- For cadence rule: track creator ordering
      uf.f_user_id AS score_creator_id,

      -- Total count for pagination
      COUNT(*) OVER() AS cnt
    FROM unified_feed uf
    LEFT JOIN public.mv_video_quality vq ON vq.video_id = uf.display_id
    LEFT JOIN creator_scores cs ON cs.creator_id = uf.f_user_id
    LEFT JOIN user_viewed uv ON uv.video_id = uf.display_id
  ),

  -- ================================================================
  -- CADENCE RULE: Prevent same creator flooding
  -- Max 2 consecutive videos from the same creator
  -- Uses row_number partitioned by creator to detect runs
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
      -- Penalize 3rd+ video from same creator in close proximity
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
    -- Like/Save status
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

GRANT EXECUTE ON FUNCTION public.get_feed_page(INT, INT, UUID) TO anon, authenticated, service_role;

-- ============================================================================
-- PART 5: RPC TO LOG FEED INTERACTIONS (batch insert from client)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.log_feed_interactions(
  p_interactions JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count INT := 0;
  v_item JSONB;
  v_user_id UUID;
BEGIN
  -- Get current user (can be NULL for anon)
  v_user_id := auth.uid();

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_interactions)
  LOOP
    INSERT INTO public.feed_interactions (
      user_id,
      video_id,
      source,
      interaction_type,
      watch_duration_ms,
      video_duration_ms,
      completion_rate,
      session_id
    ) VALUES (
      COALESCE(v_user_id, '00000000-0000-0000-0000-000000000000'::UUID),
      v_item->>'video_id',
      v_item->>'source',
      v_item->>'interaction_type',
      COALESCE((v_item->>'watch_duration_ms')::INT, 0),
      COALESCE((v_item->>'video_duration_ms')::INT, 0),
      COALESCE((v_item->>'completion_rate')::FLOAT, 0),
      v_item->>'session_id'
    );
    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object('logged', v_count);
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_feed_interactions(JSONB) TO anon, authenticated, service_role;

-- ============================================================================
-- PART 6: CLEANUP — Auto-delete old interactions (> 90 days)
-- Can be run via pg_cron or Supabase scheduled function
-- ============================================================================

CREATE OR REPLACE FUNCTION public.cleanup_old_feed_interactions()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_deleted INT;
BEGIN
  DELETE FROM public.feed_interactions
  WHERE created_at < NOW() - INTERVAL '90 days';
  
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  
  -- Also refresh the materialized view after cleanup
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_video_quality;
  
  RETURN v_deleted;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cleanup_old_feed_interactions() TO service_role;
