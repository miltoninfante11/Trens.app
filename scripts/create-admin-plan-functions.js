const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// Cargar .env
const envPath = path.join(__dirname, '..', '.env');
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split('\n').forEach((line) => {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match) env[match[1].trim()] = match[2].trim();
});

const SUPABASE_URL = env.EXPO_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const ACCESS_TOKEN = env.SUPABASE_ACCESS_TOKEN;
const PROJECT_REF = 'bzlgrukmkrftqpvpbpkj';

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

async function execSQL(sql) {
  // Usar la Management API de Supabase para ejecutar SQL
  const response = await fetch(
    `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: sql }),
    }
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`HTTP ${response.status}: ${text}`);
  }

  return await response.json();
}

async function main() {
  console.log('🏋️ Creando funciones para asignación de planes admin...');
  console.log('URL:', SUPABASE_URL);
  console.log('');

  // =========================================================================
  // FUNCIÓN 1: admin_assign_plan
  // =========================================================================
  const fnAssign = `
CREATE OR REPLACE FUNCTION admin_assign_plan(
  p_admin_user_id UUID,
  p_target_user_id UUID,
  p_template_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_admin_role TEXT;
  v_template RECORD;
  v_day JSONB;
  v_exercise JSONB;
  v_routine_names JSONB := '{}';
  v_exercises_created INT := 0;
  v_exercise_errors TEXT[] := '{}';
  v_config JSONB;
  v_custom_series JSONB;
  v_series_item JSONB;
  v_idx INT;
  v_rest_seconds INT;
BEGIN
  -- 1. Verificar que el usuario es admin o CEO
  SELECT role INTO v_admin_role FROM user_roles WHERE user_id = p_admin_user_id;
  IF v_admin_role IS NULL THEN
    SELECT role INTO v_admin_role FROM admin_users WHERE user_id = p_admin_user_id;
  END IF;
  IF v_admin_role IS NULL THEN
    PERFORM 1 FROM profiles WHERE id = p_admin_user_id
    AND email IN ('micorp.latam@gmail.com', 'm.sanchez@neurocodestudio.com', 'admin@trens.app');
    IF FOUND THEN v_admin_role := 'ceo'; END IF;
  END IF;

  IF v_admin_role IS NULL OR v_admin_role NOT IN ('admin', 'ceo') THEN
    RETURN jsonb_build_object('success', false, 'error', 'No tienes permisos de administrador');
  END IF;

  -- 2. Obtener template
  SELECT * INTO v_template FROM training_plan_templates
  WHERE id = p_template_id AND is_active = true;

  IF v_template IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Plan no encontrado o no está activo');
  END IF;

  -- 3. Construir routine_names
  FOR v_day IN SELECT * FROM jsonb_array_elements(COALESCE(v_template.days, '[]'::jsonb))
  LOOP
    v_routine_names := v_routine_names || jsonb_build_object(
      (v_day->>'dayIndex')::text, v_day->>'name'
    );
  END LOOP;

  -- 4. Actualizar profiles
  UPDATE profiles SET
    training_frequency = v_template.frequency,
    training_current_day = 0,
    training_routine_names = v_routine_names,
    plan_source = 'admin',
    updated_at = NOW()
  WHERE id = p_target_user_id;

  -- 5. Upsert user_profiles
  INSERT INTO user_profiles (user_id, training_days_per_week, training_experience, goal, updated_at)
  VALUES (
    p_target_user_id,
    v_template.frequency,
    COALESCE(v_template.target_levels[1], 'INTERMEDIO'),
    COALESCE(v_template.target_goals[1], 'HIPERTROFIA'),
    NOW()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    training_days_per_week = EXCLUDED.training_days_per_week,
    training_experience = EXCLUDED.training_experience,
    goal = EXCLUDED.goal,
    updated_at = NOW();

  -- 6. Eliminar ejercicios anteriores
  DELETE FROM user_exercise_config WHERE user_id = p_target_user_id;

  -- 7. Crear ejercicios del template
  FOR v_day IN SELECT * FROM jsonb_array_elements(COALESCE(v_template.days, '[]'::jsonb))
  LOOP
    FOR v_exercise IN SELECT * FROM jsonb_array_elements(COALESCE(v_day->'exercises', '[]'::jsonb))
    LOOP
      IF v_exercise->>'exercise_id' IS NOT NULL AND v_exercise->>'exercise_id' != '' THEN
        v_rest_seconds := COALESCE(
          NULLIF(regexp_replace(COALESCE(v_exercise->>'rest', '90'), '[^0-9]', '', 'g'), '')::int,
          90
        );

        v_custom_series := '[]'::jsonb;
        v_idx := 0;
        FOR v_series_item IN SELECT * FROM jsonb_array_elements(COALESCE(v_exercise->'series', '[]'::jsonb))
        LOOP
          v_custom_series := v_custom_series || jsonb_build_array(jsonb_build_object(
            'id', COALESCE(v_series_item->>'id', (v_idx + 1)::text),
            'type', COALESCE(v_series_item->>'type', 'EFECTIVA'),
            'reps', COALESCE((v_series_item->>'reps')::int, 10),
            'weight', 0,
            'rir', CASE WHEN v_series_item->>'type' = 'FALLO' THEN 0 ELSE 2 END,
            'tempo', '2-0-2-0',
            'restSeconds', v_rest_seconds,
            'note', COALESCE(v_series_item->>'note', '')
          ));
          v_idx := v_idx + 1;
        END LOOP;

        v_config := jsonb_build_object(
          'rest', COALESCE(v_exercise->>'rest', '90s'),
          'sets', COALESCE(jsonb_array_length(v_exercise->'series'), 4)::text || 'x10',
          'custom_series', v_custom_series,
          'series_by_day', '{}'::jsonb
        );

        BEGIN
          INSERT INTO user_exercise_config (user_id, exercise_id, training_days, config)
          VALUES (
            p_target_user_id,
            (v_exercise->>'exercise_id')::uuid,
            ARRAY[(v_day->>'dayIndex')::int],
            v_config
          );
          v_exercises_created := v_exercises_created + 1;
        EXCEPTION WHEN OTHERS THEN
          v_exercise_errors := array_append(v_exercise_errors, COALESCE(v_exercise->>'name', v_exercise->>'exercise_id'));
        END;
      END IF;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'planName', v_template.name,
    'frequency', v_template.frequency,
    'exercisesCreated', v_exercises_created,
    'errors', to_jsonb(v_exercise_errors)
  );
END;
$fn$;
`;

  // =========================================================================
  // FUNCIÓN 2: admin_get_user_plan
  // =========================================================================
  const fnGetPlan = `
CREATE OR REPLACE FUNCTION admin_get_user_plan(
  p_admin_user_id UUID,
  p_target_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_admin_role TEXT;
  v_freq INT;
  v_names JSONB;
  v_source TEXT;
BEGIN
  SELECT role INTO v_admin_role FROM user_roles WHERE user_id = p_admin_user_id;
  IF v_admin_role IS NULL THEN
    SELECT role INTO v_admin_role FROM admin_users WHERE user_id = p_admin_user_id;
  END IF;
  IF v_admin_role IS NULL THEN
    PERFORM 1 FROM profiles WHERE id = p_admin_user_id
    AND email IN ('micorp.latam@gmail.com', 'm.sanchez@neurocodestudio.com', 'admin@trens.app');
    IF FOUND THEN v_admin_role := 'ceo'; END IF;
  END IF;

  IF v_admin_role IS NULL OR v_admin_role NOT IN ('admin', 'ceo') THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autorizado');
  END IF;

  SELECT training_frequency, training_routine_names, plan_source
  INTO v_freq, v_names, v_source
  FROM profiles WHERE id = p_target_user_id;

  IF COALESCE(v_freq, 0) = 0 THEN
    RETURN jsonb_build_object('success', true, 'plan', null);
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'plan', jsonb_build_object(
      'frequency', v_freq,
      'routineNames', COALESCE(v_names, '{}'::jsonb),
      'planSource', v_source
    )
  );
END;
$fn$;
`;

  // Ejecutar
  try {
    console.log('📦 Creando admin_assign_plan...');
    await execSQL(fnAssign);
    console.log('✅ admin_assign_plan creada');
  } catch (err) {
    console.error('❌ Error creando admin_assign_plan:', err.message?.substring(0, 200));
    return;
  }

  try {
    console.log('📦 Creando admin_get_user_plan...');
    await execSQL(fnGetPlan);
    console.log('✅ admin_get_user_plan creada');
  } catch (err) {
    console.error('❌ Error creando admin_get_user_plan:', err.message?.substring(0, 200));
    return;
  }

  // Verificar
  console.log('');
  console.log('🔍 Verificando funciones...');
  const { data, error } = await supabase.rpc('admin_get_user_plan', {
    p_admin_user_id: '00000000-0000-0000-0000-000000000000',
    p_target_user_id: '00000000-0000-0000-0000-000000000000',
  });

  if (error && error.message.includes('does not exist')) {
    console.log('❌ La función no se creó correctamente');
  } else {
    console.log('✅ Funciones verificadas y listas!');
    console.log('');
    console.log('🎉 Todo configurado. Ahora despliega la web con: npm run deploy:fast');
  }
}

main().catch(console.error);
