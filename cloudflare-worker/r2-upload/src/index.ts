// ============================================================================
// TRENS R2 UPLOAD WORKER
// Proxy para subir archivos a R2 desde el navegador (evita CORS)
// ============================================================================

export interface Env {
  BUCKET: R2Bucket;
  ALLOWED_ORIGINS: string;
  PUBLIC_URL: string;
}

const corsHeaders = (origin: string, allowedOrigins: string) => {
  const origins = allowedOrigins.split(',').map((o) => o.trim());

  // Verificar si el origen está permitido (soporta wildcards básicos)
  const isAllowed = origins.some((pattern) => {
    if (pattern.includes('*')) {
      // Convertir patron wildcard a regex
      const regexPattern = pattern.replace(/\./g, '\\.').replace(/\*/g, '.*');
      return new RegExp(`^${regexPattern}$`).test(origin);
    }
    return origin.startsWith(pattern);
  });

  return {
    'Access-Control-Allow-Origin': isAllowed ? origin : origins[0].replace('*', ''),
    'Access-Control-Allow-Methods': 'GET, PUT, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-File-Key, X-Content-Type',
    'Access-Control-Max-Age': '86400',
  };
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get('Origin') || '';
    const headers = corsHeaders(origin, env.ALLOWED_ORIGINS);

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers });
    }

    const url = new URL(request.url);
    const path = url.pathname.slice(1); // Remove leading /

    try {
      // ========================================
      // PUT /upload - Subir archivo
      // ========================================
      if (request.method === 'PUT' && url.pathname === '/upload') {
        const fileKey = request.headers.get('X-File-Key');
        const contentType = request.headers.get('X-Content-Type') || 'application/octet-stream';

        if (!fileKey) {
          return new Response(JSON.stringify({ error: 'Missing X-File-Key header' }), {
            status: 400,
            headers: { ...headers, 'Content-Type': 'application/json' },
          });
        }

        const body = await request.arrayBuffer();

        await env.BUCKET.put(fileKey, body, {
          httpMetadata: {
            contentType,
          },
        });

        // Usar PUBLIC_URL de la configuración o fallback
        const publicBaseUrl = env.PUBLIC_URL || 'https://media.trens.app';
        const publicUrl = `${publicBaseUrl}/${fileKey}`;

        return new Response(
          JSON.stringify({
            success: true,
            url: publicUrl,
            key: fileKey,
          }),
          {
            status: 200,
            headers: { ...headers, 'Content-Type': 'application/json' },
          }
        );
      }

      // ========================================
      // GET /list - Listar archivos en R2
      // ========================================
      if (request.method === 'GET' && (path === 'list' || path.startsWith('list?'))) {
        const prefix = url.searchParams.get('prefix') || '';
        const cursor = url.searchParams.get('cursor') || undefined;
        const limit = parseInt(url.searchParams.get('limit') || '1000');

        const listed = await env.BUCKET.list({
          prefix: prefix || undefined,
          cursor,
          limit: Math.min(limit, 1000),
        });

        const objects = listed.objects.map((obj) => ({
          key: obj.key,
          size: obj.size,
          uploaded: obj.uploaded.toISOString(),
        }));

        return new Response(
          JSON.stringify({
            success: true,
            objects,
            truncated: listed.truncated,
            cursor: listed.truncated ? listed.cursor : null,
            count: objects.length,
          }),
          {
            headers: { ...headers, 'Content-Type': 'application/json' },
          }
        );
      }

      // ========================================
      // POST /delete-batch - Eliminar múltiples archivos
      // ========================================
      if (request.method === 'POST' && path === 'delete-batch') {
        const body = await request.json() as { keys: string[] };
        const keys = body.keys || [];

        if (!Array.isArray(keys) || keys.length === 0) {
          return new Response(JSON.stringify({ error: 'Missing keys array' }), {
            status: 400,
            headers: { ...headers, 'Content-Type': 'application/json' },
          });
        }

        // R2 soporta delete de hasta 1000 objetos a la vez
        const batchSize = 1000;
        let deleted = 0;
        for (let i = 0; i < keys.length; i += batchSize) {
          const batch = keys.slice(i, i + batchSize);
          await env.BUCKET.delete(batch);
          deleted += batch.length;
        }

        return new Response(
          JSON.stringify({
            success: true,
            deleted,
          }),
          {
            headers: { ...headers, 'Content-Type': 'application/json' },
          }
        );
      }

      // ========================================
      // DELETE /{key} - Eliminar archivo
      // ========================================
      if (request.method === 'DELETE' && path) {
        await env.BUCKET.delete(path);

        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { ...headers, 'Content-Type': 'application/json' },
        });
      }

      // ========================================
      // GET /{key} - Obtener archivo (redirect a public URL)
      // ========================================
      if (request.method === 'GET' && path && path !== 'health') {
        const object = await env.BUCKET.get(path);

        if (!object) {
          return new Response(JSON.stringify({ error: 'Not found' }), {
            status: 404,
            headers: { ...headers, 'Content-Type': 'application/json' },
          });
        }

        return new Response(object.body, {
          headers: {
            ...headers,
            'Content-Type': object.httpMetadata?.contentType || 'application/octet-stream',
            'Cache-Control': 'public, max-age=31536000',
          },
        });
      }

      // ========================================
      // GET /health - Health check
      // ========================================
      if (request.method === 'GET' && (path === 'health' || path === '')) {
        return new Response(
          JSON.stringify({
            status: 'ok',
            service: 'trens-r2-upload',
            timestamp: new Date().toISOString(),
          }),
          {
            headers: { ...headers, 'Content-Type': 'application/json' },
          }
        );
      }

      return new Response(JSON.stringify({ error: 'Not found' }), {
        status: 404,
        headers: { ...headers, 'Content-Type': 'application/json' },
      });
    } catch (error) {
      console.error('Worker error:', error);
      return new Response(
        JSON.stringify({
          error: 'Internal server error',
          message: error instanceof Error ? error.message : 'Unknown error',
        }),
        {
          status: 500,
          headers: { ...headers, 'Content-Type': 'application/json' },
        }
      );
    }
  },
};
