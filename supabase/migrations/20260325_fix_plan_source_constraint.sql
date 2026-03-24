-- Fix: cambiar plan_source de 'admin' a 'custom' para respetar el check constraint
-- También agregar 'admin' como valor válido al constraint para futuro uso

-- Opción 1: Agregar 'admin' al check constraint existente
DO $$
BEGIN
  -- Eliminar el constraint existente
  ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_plan_source_check;
  
  -- Recrear con 'admin' incluido
  ALTER TABLE profiles ADD CONSTRAINT profiles_plan_source_check 
    CHECK (plan_source IN ('hank', 'custom', 'admin'));
END $$;
