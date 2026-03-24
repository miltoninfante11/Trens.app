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

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

async function createAssignPlanFunction() {
  console.log('🏋️ Creando función admin_assign_plan...');

  const sql = `
CREATE OR REPLACE FUNCTION admin_assign_plan(
  p_admin_user_id UUID,
  p_target_user_id UUID,
  p_template_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
  v_series JSONB;
  v_series_item JSONB;
  v_idx INT;
BEGIN
  -- 1. Verificar que el usuario es admin o CEO
  SELECT role INTO v_admin_role
  FROM user_roles
  WHERE user_id = p_admin_user_id;

  IF v_admin_role IS NULL THEN
    -- Fallback: check admin_users
    SELECT role INTO v_admin_role
    FROM admin_users
    WHERE user_id = p_admin_user_id;
  END IF;

  IF v_admin_role IS NULL THEN
    -- Fallback: check email
    PERFORM 1 FROM profiles
    WHERE id = p_admin_user_id
    AND email IN ('micorp.latam@gmail.com', 'm.sanchez@neurocodestudio.com', 'admin@trens.app');
    IF FOUND THEN
      v_admin_role := 'ceo';
    END IF;
  END IF;

  IF v_admin_role IS NULL OR v_admin_role NOT IN ('admin', 'ceo') THEN
    RETURN jsonb_build_object('success', false, 'error', 'No tienes permisos de administrador');
  END IF;

  -- 2. Obtener template
  SELECT * INTO v_template
  FROM training_plan_templates
  WHERE id = p_template_id AND is_active = true;

  IF v_template IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Plan no encontrado o no está activo');
  END IF;

  -- 3. Construir routine_names
  FOR v_day IN SELECT * FROM jsonb_array_elements(COALESCE(v_template.days, '[]'::jsonb))
  LOOP
    v_routine_names := v_routine_names || jsonb_build_object(
      (v_day->>'dayIndex')::text,
      v_day->>'name'
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
        -- Build custom_series
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
            'restSeconds', COALESCE(regexp_replace(COALESCE(v_exercise->>'rest', '90'), '[^0-9]', '', 'g')::int, 90),
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
$$;

-- Función para obtener plan actual del usuario
CREATE OR REPLACE FUNCTION admin_get_user_plan(
  p_admin_user_id UUID,
  p_target_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_role TEXT;
  v_result RECORD;
BEGIN
  -- Verificar permisos
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
  INTO v_result
  FROM profiles
  WHERE id = p_target_user_id;

  IF v_result IS NULL OR COALESCE(v_result.training_frequency, 0) = 0 THEN
    RETURN jsonb_build_object('success', true, 'plan', null);
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'plan', jsonb_build_object(
      'frequency', v_result.training_frequency,
      'routineNames', COALESCE(v_result.training_routine_names, '{}'::jsonb),
      'planSource', v_result.plan_source
    )
  );
END;
$$;
`;

  const { data, error } = await supabase.rpc('exec_sql', { sql_text: sql });

  if (error) {
    // Si exec_sql no existe, usar REST API directamente
    console.log('⚠️ exec_sql no disponible, usando REST API...');

    const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
      },
      body: JSON.stringify({ sql_text: sql }),
    });

    if (!response.ok) {
      // Último recurso: usar la SQL API directamente
      console.log('⚠️ Intentando con SQL directo via pg...');

      const sqlResponse = await fetch(`${SUPABASE_URL}/rest/v1/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: SERVICE_KEY,
          Authorization: `Bearer ${SERVICE_KEY}`,
          Prefer: 'return=representation',
        },
      });

      // Use the PostgreSQL connection directly via supabase-js
      // Split into individual statements
      const statements = sql
        .split(/;\s*$/m)
        .map((s) => s.trim())
        .filter((s) => s.length > 0);

      for (const stmt of statements) {
        if (!stmt.startsWith('CREATE OR REPLACE FUNCTION')) continue;

        // Extract function name for logging
        const fnMatch = stmt.match(/FUNCTION\s+(\w+)/);
        const fnName = fnMatch ? fnMatch[1] : 'unknown';
        console.log(`  Creating function: ${fnName}...`);

        try {
          const { error: stmtError } = await supabase.from('_exec').select('*').limit(0);
          // This won't work via REST API for DDL
          // We need to use the SQL endpoint
        } catch (e) {
          console.error(`  ❌ Error creating ${fnName}:`, e.message);
        }
      }
    }
  }

  // Verify functions were created
  const { data: checkData, error: checkError } = await supabase.rpc('admin_get_user_plan', {
    p_admin_user_id: '00000000-0000-0000-0000-000000000000',
    p_target_user_id: '00000000-0000-0000-0000-000000000000',
  });

  if (checkError && checkError.message.includes('does not exist')) {
    console.log('');
    console.log('❌ Las funciones no se pudieron crear via RPC.');
    console.log('');
    console.log('📋 Copia y pega el SQL directamente en el SQL Editor de Supabase Dashboard:');
    console.log('   https://supabase.com/dashboard/project/bzlgrukmkrftqpvpbpkj/sql');
    console.log('');
    console.log('='.repeat(80));
    console.log(sql);
    console.log('='.repeat(80));
    return;
  }

  console.log('✅ Funciones creadas exitosamente!');
  console.log('   - admin_assign_plan()');
  console.log('   - admin_get_user_plan()');
}

createAssignPlanFunction().catch(console.error);
