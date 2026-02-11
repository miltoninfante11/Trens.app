-- Migration: Add media_type, filter, and show_overlay columns to pro_videos
-- Supports both video and photo media types
-- Date: 2026-01-26

-- Add media_type column (default 'video' for backward compatibility)
ALTER TABLE public.pro_videos 
ADD COLUMN IF NOT EXISTS media_type TEXT DEFAULT 'video';

-- Add filter column for visual filters
ALTER TABLE public.pro_videos 
ADD COLUMN IF NOT EXISTS filter TEXT DEFAULT 'RAW';

-- Add show_overlay column for data overlay toggle
ALTER TABLE public.pro_videos 
ADD COLUMN IF NOT EXISTS show_overlay BOOLEAN DEFAULT true;

-- Add comments
COMMENT ON COLUMN public.pro_videos.media_type IS 'Type of media: video or photo';
COMMENT ON COLUMN public.pro_videos.filter IS 'Visual filter applied: RAW, SAVAGE, BW_BEAST, GOLDEN_HOUR, NEON';
COMMENT ON COLUMN public.pro_videos.show_overlay IS 'Whether to show exercise/weight/reps overlay on the media';

-- Create index for media_type filtering
CREATE INDEX IF NOT EXISTS idx_pro_videos_media_type ON public.pro_videos(media_type);
