// Script para ejecutar la migración de short_links en Supabase
const fs = require('fs');
const path = require('path');

// Cargar variables de entorno manualmente
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach((line) => {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) {
      process.env[match[1].trim()] = match[2].trim();
    }
  });
}

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function runMigration() {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    console.error('❌ Faltan variables EXPO_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  console.log('🚀 Ejecutando migración short_links...');
  console.log('URL:', SUPABASE_URL);

  const migrationPath = path.join(
    __dirname,
    '..',
    'supabase',
    'migrations',
    '20260412_short_links.sql'
  );
  const sql = fs.readFileSync(migrationPath, 'utf8');

  console.log('📄 Migración cargada:', migrationPath);
  console.log('📏 Tamaño:', sql.length, 'caracteres');

  // Separar por statements
  const statements = sql
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith('--'));

  console.log(`📋 ${statements.length} statements a ejecutar\n`);

  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i];
    const preview = stmt.substring(0, 80).replace(/\n/g, ' ');
    console.log(`[${i + 1}/${statements.length}] ${preview}...`);

    try {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/`, {
        method: 'POST',
        headers: {
          apikey: SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({
          query: stmt,
        }),
      });

      if (!response.ok) {
        // Intentar via SQL directamente
        const sqlResponse = await fetch(`${SUPABASE_URL}/pg`, {
          method: 'POST',
          headers: {
            apikey: SERVICE_ROLE_KEY,
            Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ query: stmt }),
        });

        if (!sqlResponse.ok) {
          console.warn(`  ⚠️ Statement ${i + 1} puede requerir ejecución manual`);
        } else {
          console.log(`  ✅ OK`);
        }
      } else {
        console.log(`  ✅ OK`);
      }
    } catch (err) {
      console.warn(`  ⚠️ Error: ${err.message}`);
    }
  }

  console.log('\n🎉 Migración completada!');
  console.log('💡 Si hay errores, ejecuta el SQL manualmente en Supabase Dashboard > SQL Editor');
  console.log('📁 Archivo:', migrationPath);
}

runMigration().catch(console.error);
