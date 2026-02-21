-- ============================================================================
-- TRENS - MIGRACIÓN COMPLETA Y ORDENADA
-- Ejecutar en SQL Editor de Supabase
-- ============================================================================

-- ============================================================================
-- PARTE 1: TABLAS BASE
-- ============================================================================

-- 1.1 PROFILES (para auth)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  full_name TEXT,
  avatar_url TEXT,
  training_last_access TIMESTAMPTZ,
  training_current_day INTEGER DEFAULT 0,
  training_frequency INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_select" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "profiles_insert" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_update" ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- 1.2 USER_ASSETS (ejercicios del usuario)
CREATE TABLE IF NOT EXISTS public.user_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'exercise',
  media_url TEXT,
  thumbnail_url TEXT,
  metadata JSONB DEFAULT '{}',
  training_days INTEGER[] DEFAULT ARRAY[0],
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_assets_user ON public.user_assets(user_id);
CREATE INDEX IF NOT EXISTS idx_user_assets_type ON public.user_assets(type);
CREATE INDEX IF NOT EXISTS idx_user_assets_deleted ON public.user_assets(deleted_at);

ALTER TABLE public.user_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_assets_select" ON public.user_assets FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "user_assets_insert" ON public.user_assets FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "user_assets_update" ON public.user_assets FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "user_assets_delete" ON public.user_assets FOR DELETE USING (auth.uid() = user_id);

-- 1.3 ASSET_TEMPLATES (plantillas de ejercicios)
CREATE TABLE IF NOT EXISTS public.asset_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'exercise',
  category TEXT,
  media_url TEXT,
  thumbnail_url TEXT,
  metadata JSONB DEFAULT '{}',
  is_featured BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_asset_templates_type ON public.asset_templates(type);
CREATE INDEX IF NOT EXISTS idx_asset_templates_category ON public.asset_templates(category);

ALTER TABLE public.asset_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "asset_templates_select" ON public.asset_templates FOR SELECT USING (true);

-- 1.4 EXERCISE_ALTERNATIVES (alternativas de ejercicios)
CREATE TABLE IF NOT EXISTS public.exercise_alternatives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  primary_exercise_id UUID NOT NULL REFERENCES public.user_assets(id) ON DELETE CASCADE,
  alternative_exercise_id UUID NOT NULL REFERENCES public.user_assets(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(primary_exercise_id, alternative_exercise_id)
);

CREATE INDEX IF NOT EXISTS idx_alternatives_user ON public.exercise_alternatives(user_id);
CREATE INDEX IF NOT EXISTS idx_alternatives_primary ON public.exercise_alternatives(primary_exercise_id);

ALTER TABLE public.exercise_alternatives ENABLE ROW LEVEL SECURITY;

CREATE POLICY "alternatives_select" ON public.exercise_alternatives FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "alternatives_insert" ON public.exercise_alternatives FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "alternatives_delete" ON public.exercise_alternatives FOR DELETE USING (auth.uid() = user_id);

-- 1.5 SERIES_LOG (registro de series por día)
CREATE TABLE IF NOT EXISTS public.series_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  exercise_id UUID NOT NULL REFERENCES public.user_assets(id) ON DELETE CASCADE,
  training_day INTEGER NOT NULL DEFAULT 0,
  weight_kg DECIMAL(6,2),
  reps INTEGER,
  rpe INTEGER CHECK (rpe >= 1 AND rpe <= 10),
  notes TEXT,
  completed_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_series_log_user ON public.series_log(user_id);
CREATE INDEX IF NOT EXISTS idx_series_log_exercise ON public.series_log(exercise_id);
CREATE INDEX IF NOT EXISTS idx_series_log_day ON public.series_log(training_day);

ALTER TABLE public.series_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "series_log_select" ON public.series_log FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "series_log_insert" ON public.series_log FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "series_log_update" ON public.series_log FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "series_log_delete" ON public.series_log FOR DELETE USING (auth.uid() = user_id);

-- ============================================================================
-- PARTE 2: MÓDULO ADN (Perfil y Records)
-- ============================================================================

-- 2.1 USER_PROFILES (TRENS ID - diferente a profiles de auth)
CREATE TABLE IF NOT EXISTS public.user_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL DEFAULT 'ATLETA',
  avatar_url TEXT,
  height TEXT,
  weight TEXT,
  goal TEXT,
  sport TEXT DEFAULT 'GYM',
  level TEXT DEFAULT 'INTERMEDIO',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_profiles_user ON public.user_profiles(user_id);

ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_profiles_select" ON public.user_profiles FOR SELECT USING (true);
CREATE POLICY "user_profiles_insert" ON public.user_profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "user_profiles_update" ON public.user_profiles FOR UPDATE USING (auth.uid() = user_id);

-- 2.2 PERSONAL_RECORDS (récords personales)
CREATE TABLE IF NOT EXISTS public.personal_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  exercise_name TEXT NOT NULL,
  weight_kg DECIMAL(6,2) NOT NULL,
  reps INTEGER DEFAULT 1,
  video_id UUID,
  achieved_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_personal_records_user ON public.personal_records(user_id);
CREATE INDEX IF NOT EXISTS idx_personal_records_exercise ON public.personal_records(exercise_name);

ALTER TABLE public.personal_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "personal_records_select" ON public.personal_records FOR SELECT USING (true);
CREATE POLICY "personal_records_insert" ON public.personal_records FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "personal_records_update" ON public.personal_records FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "personal_records_delete" ON public.personal_records FOR DELETE USING (auth.uid() = user_id);

-- 2.3 USER_VIDEOS (videos del usuario - legacy)
CREATE TABLE IF NOT EXISTS public.user_videos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  video_url TEXT NOT NULL,
  thumbnail_url TEXT,
  exercise_name TEXT,
  weight_kg DECIMAL(6,2),
  reps INTEGER,
  duration_seconds INTEGER,
  is_public BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_videos_user ON public.user_videos(user_id);
CREATE INDEX IF NOT EXISTS idx_user_videos_public ON public.user_videos(is_public);

ALTER TABLE public.user_videos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_videos_select_own" ON public.user_videos FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "user_videos_select_public" ON public.user_videos FOR SELECT USING (is_public = true);
CREATE POLICY "user_videos_insert" ON public.user_videos FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "user_videos_update" ON public.user_videos FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "user_videos_delete" ON public.user_videos FOR DELETE USING (auth.uid() = user_id);

-- ============================================================================
-- PARTE 3: MÓDULO HANK (Chat IA)
-- ============================================================================

-- 3.1 HANK_CHAT_MESSAGES
CREATE TABLE IF NOT EXISTS public.hank_chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hank_messages_user ON public.hank_chat_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_hank_messages_created ON public.hank_chat_messages(created_at DESC);

ALTER TABLE public.hank_chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hank_messages_select" ON public.hank_chat_messages FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "hank_messages_insert" ON public.hank_chat_messages FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "hank_messages_delete" ON public.hank_chat_messages FOR DELETE USING (auth.uid() = user_id);

-- ============================================================================
-- PARTE 4: MÓDULO PLAN (Nutrición)
-- ============================================================================

-- 4.1 MEAL_STACKS
CREATE TABLE IF NOT EXISTS public.meal_stacks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT DEFAULT '#DC2626',
  icon TEXT DEFAULT 'utensils',
  position INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_meal_stacks_user ON public.meal_stacks(user_id);

ALTER TABLE public.meal_stacks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "meal_stacks_select" ON public.meal_stacks FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "meal_stacks_insert" ON public.meal_stacks FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "meal_stacks_update" ON public.meal_stacks FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "meal_stacks_delete" ON public.meal_stacks FOR DELETE USING (auth.uid() = user_id);

-- 4.2 MEALS
CREATE TABLE IF NOT EXISTS public.meals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stack_id UUID REFERENCES public.meal_stacks(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  scheduled_time TIME,
  calories INTEGER,
  protein_g DECIMAL(6,2),
  carbs_g DECIMAL(6,2),
  fat_g DECIMAL(6,2),
  ingredients JSONB DEFAULT '[]',
  notes TEXT,
  is_completed BOOLEAN DEFAULT false,
  completed_at TIMESTAMPTZ,
  position INTEGER DEFAULT 0,
  selected_option INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_meals_user ON public.meals(user_id);
CREATE INDEX IF NOT EXISTS idx_meals_stack ON public.meals(stack_id);

ALTER TABLE public.meals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "meals_select" ON public.meals FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "meals_insert" ON public.meals FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "meals_update" ON public.meals FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "meals_delete" ON public.meals FOR DELETE USING (auth.uid() = user_id);

-- 4.3 MEAL_OPTIONS
CREATE TABLE IF NOT EXISTS public.meal_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meal_id UUID NOT NULL REFERENCES public.meals(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  calories INTEGER,
  protein_g DECIMAL(6,2),
  carbs_g DECIMAL(6,2),
  fat_g DECIMAL(6,2),
  ingredients JSONB DEFAULT '[]',
  is_selected BOOLEAN DEFAULT false,
  position INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_meal_options_meal ON public.meal_options(meal_id);

ALTER TABLE public.meal_options ENABLE ROW LEVEL SECURITY;

CREATE POLICY "meal_options_select" ON public.meal_options FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "meal_options_insert" ON public.meal_options FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "meal_options_update" ON public.meal_options FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "meal_options_delete" ON public.meal_options FOR DELETE USING (auth.uid() = user_id);

-- 4.4 DAILY_NUTRITION_LOG
CREATE TABLE IF NOT EXISTS public.daily_nutrition_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  total_calories INTEGER DEFAULT 0,
  total_protein_g DECIMAL(6,2) DEFAULT 0,
  total_carbs_g DECIMAL(6,2) DEFAULT 0,
  total_fat_g DECIMAL(6,2) DEFAULT 0,
  water_ml INTEGER DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, date)
);

CREATE INDEX IF NOT EXISTS idx_daily_nutrition_user ON public.daily_nutrition_log(user_id);
CREATE INDEX IF NOT EXISTS idx_daily_nutrition_date ON public.daily_nutrition_log(date);

ALTER TABLE public.daily_nutrition_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "daily_nutrition_select" ON public.daily_nutrition_log FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "daily_nutrition_insert" ON public.daily_nutrition_log FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "daily_nutrition_update" ON public.daily_nutrition_log FOR UPDATE USING (auth.uid() = user_id);

-- ============================================================================
-- PARTE 5: MÓDULO PRO (Videos y Sistema PRO/FREE)
-- ============================================================================

-- 5.0 SUPPLEMENT_STACK (Stack de suplementos/fármacos)
CREATE TABLE IF NOT EXISTS public.supplement_stack (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  dose TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'pill' CHECK (type IN ('pill', 'syringe', 'powder', 'liquid')),
  notes TEXT,
  time TIME,
  is_pre_workout BOOLEAN DEFAULT false,
  is_post_workout BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  days_of_week INTEGER[] DEFAULT ARRAY[0, 1, 2, 3, 4, 5, 6],
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_supplement_stack_user ON public.supplement_stack(user_id);
CREATE INDEX IF NOT EXISTS idx_supplement_stack_active ON public.supplement_stack(user_id, is_active);

ALTER TABLE public.supplement_stack ENABLE ROW LEVEL SECURITY;

CREATE POLICY "supplement_stack_select" ON public.supplement_stack FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "supplement_stack_insert" ON public.supplement_stack FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "supplement_stack_update" ON public.supplement_stack FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "supplement_stack_delete" ON public.supplement_stack FOR DELETE USING (auth.uid() = user_id);

-- 5.1 USER_ROLES
CREATE TABLE IF NOT EXISTS public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'free' CHECK (role IN ('free', 'pro', 'admin')),
  pro_expires_at TIMESTAMPTZ,
  features JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_roles_user ON public.user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_role ON public.user_roles(role);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_roles_select" ON public.user_roles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "user_roles_insert" ON public.user_roles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "user_roles_update" ON public.user_roles FOR UPDATE USING (auth.uid() = user_id);

-- 5.2 PRO_VIDEOS
CREATE TABLE IF NOT EXISTS public.pro_videos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  video_url TEXT NOT NULL,
  thumbnail_url TEXT,
  cloudflare_video_id TEXT,
  duration_seconds INTEGER,
  context_type TEXT DEFAULT 'free' CHECK (context_type IN ('tactical', 'free')),
  exercise_id UUID,
  exercise_name TEXT,
  exercise_notes TEXT,
  tags TEXT[],
  notes TEXT,
  weight_kg DECIMAL(6,2),
  reps INTEGER,
  free_text TEXT,
  filter TEXT DEFAULT 'RAW',
  spotify JSONB DEFAULT '{"enabled": false}',
  ambient_audio BOOLEAN DEFAULT true,
  is_public BOOLEAN DEFAULT true,
  trim_start_percent INTEGER DEFAULT 0,
  trim_end_percent INTEGER DEFAULT 100,
  likes_count INTEGER DEFAULT 0,
  comments_count INTEGER DEFAULT 0,
  views_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pro_videos_user ON public.pro_videos(user_id);
CREATE INDEX IF NOT EXISTS idx_pro_videos_public ON public.pro_videos(is_public);
CREATE INDEX IF NOT EXISTS idx_pro_videos_created ON public.pro_videos(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pro_videos_cloudflare ON public.pro_videos(cloudflare_video_id);

ALTER TABLE public.pro_videos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pro_videos_select_own" ON public.pro_videos FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "pro_videos_select_public" ON public.pro_videos FOR SELECT USING (is_public = true);
CREATE POLICY "pro_videos_insert" ON public.pro_videos FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "pro_videos_update" ON public.pro_videos FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "pro_videos_delete" ON public.pro_videos FOR DELETE USING (auth.uid() = user_id);

-- ============================================================================
-- PARTE 6: INTERACCIONES DEL FEED
-- ============================================================================

-- 6.1 VIDEO_LIKES
CREATE TABLE IF NOT EXISTS public.video_likes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  video_id UUID NOT NULL REFERENCES public.pro_videos(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, video_id)
);

CREATE INDEX IF NOT EXISTS idx_video_likes_video ON public.video_likes(video_id);
CREATE INDEX IF NOT EXISTS idx_video_likes_user ON public.video_likes(user_id);

ALTER TABLE public.video_likes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "video_likes_select" ON public.video_likes FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "video_likes_insert" ON public.video_likes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "video_likes_delete" ON public.video_likes FOR DELETE USING (auth.uid() = user_id);

-- 6.2 VIDEO_SAVES
CREATE TABLE IF NOT EXISTS public.video_saves (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  video_id UUID NOT NULL REFERENCES public.pro_videos(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, video_id)
);

CREATE INDEX IF NOT EXISTS idx_video_saves_video ON public.video_saves(video_id);
CREATE INDEX IF NOT EXISTS idx_video_saves_user ON public.video_saves(user_id);

ALTER TABLE public.video_saves ENABLE ROW LEVEL SECURITY;

CREATE POLICY "video_saves_select" ON public.video_saves FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "video_saves_insert" ON public.video_saves FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "video_saves_delete" ON public.video_saves FOR DELETE USING (auth.uid() = user_id);

-- 6.3 VIDEO_COMMENTS
CREATE TABLE IF NOT EXISTS public.video_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  video_id UUID NOT NULL REFERENCES public.pro_videos(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  parent_id UUID REFERENCES public.video_comments(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_video_comments_video ON public.video_comments(video_id);
CREATE INDEX IF NOT EXISTS idx_video_comments_user ON public.video_comments(user_id);

ALTER TABLE public.video_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "video_comments_select" ON public.video_comments FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.pro_videos WHERE id = video_id AND is_public = true)
);
CREATE POLICY "video_comments_insert" ON public.video_comments FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "video_comments_update" ON public.video_comments FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "video_comments_delete" ON public.video_comments FOR DELETE USING (auth.uid() = user_id);

-- 6.4 VIDEO_VIEWS
CREATE TABLE IF NOT EXISTS public.video_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id UUID NOT NULL REFERENCES public.pro_videos(id) ON DELETE CASCADE,
  viewer_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  viewer_ip TEXT,
  watched_seconds INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_video_views_video ON public.video_views(video_id);

ALTER TABLE public.video_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "video_views_insert" ON public.video_views FOR INSERT WITH CHECK (true);
CREATE POLICY "video_views_select" ON public.video_views FOR SELECT USING (auth.uid() = viewer_id OR viewer_id IS NULL);

-- ============================================================================
-- PARTE 7: TRIGGERS Y FUNCIONES
-- ============================================================================

-- 7.1 Trigger para crear perfil automáticamente
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(
      NEW.raw_user_meta_data->>'full_name',
      NEW.raw_user_meta_data->>'display_name',
      NEW.raw_user_meta_data->>'name'
    ),
    NEW.raw_user_meta_data->>'avatar_url'
  );
  
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'free');
  
  INSERT INTO public.user_profiles (user_id, display_name)
  VALUES (
    NEW.id,
    COALESCE(
      NEW.raw_user_meta_data->>'full_name',
      NEW.raw_user_meta_data->>'display_name',
      'ATLETA'
    )
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 7.2 Trigger para actualizar likes_count
CREATE OR REPLACE FUNCTION public.update_video_likes_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.pro_videos SET likes_count = likes_count + 1 WHERE id = NEW.video_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.pro_videos SET likes_count = GREATEST(0, likes_count - 1) WHERE id = OLD.video_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_video_like_change ON public.video_likes;
CREATE TRIGGER on_video_like_change
  AFTER INSERT OR DELETE ON public.video_likes
  FOR EACH ROW EXECUTE FUNCTION public.update_video_likes_count();

-- 7.3 Trigger para actualizar comments_count
CREATE OR REPLACE FUNCTION public.update_video_comments_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.parent_id IS NULL THEN
    UPDATE public.pro_videos SET comments_count = comments_count + 1 WHERE id = NEW.video_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' AND OLD.parent_id IS NULL THEN
    UPDATE public.pro_videos SET comments_count = GREATEST(0, comments_count - 1) WHERE id = OLD.video_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_video_comment_change ON public.video_comments;
CREATE TRIGGER on_video_comment_change
  AFTER INSERT OR DELETE ON public.video_comments
  FOR EACH ROW EXECUTE FUNCTION public.update_video_comments_count();

-- 7.4 Trigger para actualizar views_count
CREATE OR REPLACE FUNCTION public.update_video_views_count()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.pro_videos SET views_count = views_count + 1 WHERE id = NEW.video_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_video_view_insert ON public.video_views;
CREATE TRIGGER on_video_view_insert
  AFTER INSERT ON public.video_views
  FOR EACH ROW EXECUTE FUNCTION public.update_video_views_count();

-- ============================================================================
-- PARTE 8: FUNCIONES HELPER
-- ============================================================================

-- 8.1 Verificar si usuario es PRO
CREATE OR REPLACE FUNCTION public.is_user_pro(user_uuid UUID)
RETURNS BOOLEAN AS $$
DECLARE
  user_role TEXT;
  expires_at TIMESTAMPTZ;
BEGIN
  SELECT role, pro_expires_at INTO user_role, expires_at
  FROM public.user_roles
  WHERE user_id = user_uuid;
  
  IF user_role = 'admin' THEN RETURN TRUE; END IF;
  IF user_role = 'pro' THEN
    IF expires_at IS NULL OR expires_at > NOW() THEN RETURN TRUE; END IF;
  END IF;
  
  RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8.2 Limpiar mensajes antiguos de Hank
CREATE OR REPLACE FUNCTION public.cleanup_old_hank_messages(user_uuid UUID, keep_count INTEGER DEFAULT 50)
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  WITH old_messages AS (
    SELECT id FROM public.hank_chat_messages
    WHERE user_id = user_uuid
    ORDER BY created_at DESC
    OFFSET keep_count
  )
  DELETE FROM public.hank_chat_messages
  WHERE id IN (SELECT id FROM old_messages);
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- ✅ MIGRACIÓN COMPLETA
-- ============================================================================
