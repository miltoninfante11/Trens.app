// ============================================================================
// TRENS R2 UPLOAD WORKER
// Proxy para subir archivos a R2 desde el navegador (evita CORS)
// ============================================================================

export interface Env {
  BUCKET: R2Bucket;
  ALLOWED_ORIGINS: string;
}

const corsHeaders = (origin: string, allowedOrigins: string) => {
  const origins = allowedOrigins.split(',');
  const isAllowed = origins.some((o) => origin.startsWith(o.trim()));

  return {
    'Access-Control-Allow-Origin': isAllowed ? origin : origins[0],
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

        const publicUrl = `https://media.trens.app/${fileKey}`;

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
