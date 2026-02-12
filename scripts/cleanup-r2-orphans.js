#!/usr/bin/env node
// ============================================================================
// CLEANUP R2 ORPHANS - Elimina archivos huérfanos de Cloudflare R2
// Compara los archivos en R2 con las URLs referenciadas en Supabase
// ============================================================================

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const R2_WORKER_URL = 'https://trens-r2-upload.trens-app.workers.dev';
const R2_PUBLIC_URL = 'https://media.trens.app';

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Listar todos los archivos en R2
async function listAllR2Files() {
  console.log('📦 Listando archivos en R2...');
  let allFiles = [];
  let cursor = undefined;
  let page = 1;

  while (true) {
    const url = new URL(`${R2_WORKER_URL}/list`);
    url.searchParams.set('limit', '1000');
    if (cursor) url.searchParams.set('cursor', cursor);

    const response = await fetch(url.toString());
    const data = await response.json();

    if (!data.success) {
      console.error('❌ Error listando R2:', data);
      break;
    }

    allFiles = allFiles.concat(data.objects);
    console.log(`   Página ${page}: ${data.objects.length} archivos (total: ${allFiles.length})`);

    if (!data.truncated) break;
    cursor = data.cursor;
    page++;
  }

  return allFiles;
}

// Obtener todas las URLs referenciadas en la DB
async function getReferencedUrls() {
  console.log('🔍 Buscando URLs referenciadas en la base de datos...');
  const referencedKeys = new Set();

  // 1. user_exercise_config.custom_media_url
  const { data: configs } = await supabase
    .from('user_exercise_config')
    .select('custom_media_url')
    .not('custom_media_url', 'is', null);

  if (configs) {
    for (const c of configs) {
      if (c.custom_media_url && c.custom_media_url.includes('media.trens.app')) {
        const key = c.custom_media_url.replace(`${R2_PUBLIC_URL}/`, '');
        referencedKeys.add(key);
      }
    }
    console.log(`   user_exercise_config: ${configs.length} registros con custom_media_url`);
  }

  // 2. user_exercise_media.custom_media_url
  const { data: media } = await supabase
    .from('user_exercise_media')
    .select('custom_media_url')
    .not('custom_media_url', 'is', null);

  if (media) {
    for (const m of media) {
      if (m.custom_media_url && m.custom_media_url.includes('media.trens.app')) {
        const key = m.custom_media_url.replace(`${R2_PUBLIC_URL}/`, '');
        referencedKeys.add(key);
      }
    }
    console.log(`   user_exercise_media: ${media.length} registros con custom_media_url`);
  }

  // 3. exercises.default_media_url (las del admin)
  const { data: exercises } = await supabase
    .from('exercises')
    .select('default_media_url, thumbnail_url')
    .or('default_media_url.ilike.%media.trens.app%,thumbnail_url.ilike.%media.trens.app%');

  if (exercises) {
    for (const e of exercises) {
      if (e.default_media_url && e.default_media_url.includes('media.trens.app')) {
        const key = e.default_media_url.replace(`${R2_PUBLIC_URL}/`, '');
        referencedKeys.add(key);
      }
      if (e.thumbnail_url && e.thumbnail_url.includes('media.trens.app')) {
        const key = e.thumbnail_url.replace(`${R2_PUBLIC_URL}/`, '');
        referencedKeys.add(key);
      }
    }
    console.log(`   exercises: ${exercises.length} con media en R2`);
  }

  // 4. pro_videos (videos de usuarios)
  const { data: proVideos } = await supabase
    .from('pro_videos')
    .select('video_url, thumbnail_url')
    .or('video_url.ilike.%media.trens.app%,thumbnail_url.ilike.%media.trens.app%');

  if (proVideos) {
    for (const v of proVideos) {
      if (v.video_url && v.video_url.includes('media.trens.app')) {
        const key = v.video_url.replace(`${R2_PUBLIC_URL}/`, '');
        referencedKeys.add(key);
      }
      if (v.thumbnail_url && v.thumbnail_url.includes('media.trens.app')) {
        const key = v.thumbnail_url.replace(`${R2_PUBLIC_URL}/`, '');
        referencedKeys.add(key);
      }
    }
    console.log(`   pro_videos: ${proVideos.length} con media en R2`);
  }

  // 5. profiles.avatar_url
  const { data: profiles } = await supabase
    .from('profiles')
    .select('avatar_url')
    .ilike('avatar_url', '%media.trens.app%');

  if (profiles) {
    for (const p of profiles) {
      if (p.avatar_url && p.avatar_url.includes('media.trens.app')) {
        const key = p.avatar_url.replace(`${R2_PUBLIC_URL}/`, '');
        referencedKeys.add(key);
      }
    }
    console.log(`   profiles: ${profiles.length} con avatar en R2`);
  }

  return referencedKeys;
}

// Eliminar archivos huérfanos
async function deleteOrphanFiles(orphanKeys) {
  if (orphanKeys.length === 0) {
    console.log('✅ No hay archivos huérfanos. ¡R2 está limpio!');
    return;
  }

  console.log(`\n🗑️ Eliminando ${orphanKeys.length} archivos huérfanos...`);

  // Eliminar en lotes de 100
  const batchSize = 100;
  let deleted = 0;

  for (let i = 0; i < orphanKeys.length; i += batchSize) {
    const batch = orphanKeys.slice(i, i + batchSize);

    const response = await fetch(`${R2_WORKER_URL}/delete-batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keys: batch }),
    });

    const result = await response.json();
    if (result.success) {
      deleted += result.deleted;
      console.log(`   Lote ${Math.floor(i / batchSize) + 1}: ${result.deleted} eliminados (total: ${deleted})`);
    } else {
      console.error(`   ❌ Error en lote:`, result);
    }
  }

  console.log(`\n✅ ${deleted} archivos huérfanos eliminados de R2`);
}

// Formatear bytes
function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Main
async function main() {
  console.log('🧹 TRENS - Limpieza de archivos huérfanos en Cloudflare R2');
  console.log('='.repeat(60));

  // 1. Listar archivos en R2
  const r2Files = await listAllR2Files();
  console.log(`\n📊 Total archivos en R2: ${r2Files.length}`);

  const totalSize = r2Files.reduce((sum, f) => sum + f.size, 0);
  console.log(`📊 Tamaño total: ${formatBytes(totalSize)}`);

  // 2. Obtener URLs referenciadas
  const referencedKeys = await getReferencedUrls();
  console.log(`\n📊 Total URLs referenciadas en DB: ${referencedKeys.size}`);

  // 3. Encontrar huérfanos
  const orphanFiles = r2Files.filter((f) => !referencedKeys.has(f.key));
  const orphanSize = orphanFiles.reduce((sum, f) => sum + f.size, 0);

  console.log(`\n📊 Archivos huérfanos: ${orphanFiles.length}`);
  console.log(`📊 Espacio a liberar: ${formatBytes(orphanSize)}`);

  if (orphanFiles.length > 0) {
    console.log('\n📋 Archivos huérfanos:');
    for (const f of orphanFiles) {
      console.log(`   🔴 ${f.key} (${formatBytes(f.size)}) - ${f.uploaded}`);
    }
  }

  // 4. Preguntar si eliminar (o usar flag --delete)
  const autoDelete = process.argv.includes('--delete');

  if (autoDelete) {
    await deleteOrphanFiles(orphanFiles.map((f) => f.key));
  } else {
    console.log('\n💡 Para eliminar, ejecuta: node scripts/cleanup-r2-orphans.js --delete');
  }

  console.log('\n✅ Limpieza completada');
}

main().catch(console.error);
