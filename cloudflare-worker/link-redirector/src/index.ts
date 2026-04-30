// =============================================================================
// TRENS LINK REDIRECTOR WORKER
// Intercepta requests en trens.app/{slug} y {slug}.trens.app
// Si existe un short_link activo → redirect 302
// Si no → pasa la request al origen (SPA/Pages)
// =============================================================================

export interface Env {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
}

interface ShortLinkRow {
  slug: string;
  destination_url: string;
  link_type: string;
}

// Slugs que NUNCA deben interceptarse (rutas de la app)
const PASSTHROUGH_SLUGS = new Set([
  '',
  'adn',
  'gym',
  'pro',
  'feed',
  'plan',
  'admin',
  'profile',
  'terms',
  'privacy',
  'contact',
  'pago-exitoso',
  'spotify-callback',
  'instagram-callback',
]);

// Extensiones de archivo que nunca son slugs
const STATIC_EXTENSIONS =
  /\.(js|css|html|json|png|jpg|jpeg|gif|svg|ico|webp|woff2?|ttf|map|xml|txt|webmanifest)$/i;

// Subdominios reservados del sistema
const RESERVED_SUBDOMAINS = new Set([
  'www',
  'api',
  'media',
  'share',
  'app',
  'admin',
  'mail',
  'cdn',
  'shop',
  'tienda',
  'pages',
]);

// =============================================================================
// Ensure URL is safe for HTTP Location header
// Re-parse with URL constructor to encode non-ASCII chars properly
// =============================================================================
function ensureAsciiUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    // URL constructor encodes non-ASCII in path automatically
    // For query string, we need to manually encode non-ASCII chars
    if (parsed.search) {
      const params = parsed.search.substring(1); // remove leading ?
      const encoded = params
        .replace(/[^\x20-\x7E]/g, (c) => encodeURIComponent(c))
        .replace(/ /g, '%20');
      return `${parsed.origin}${parsed.pathname}?${encoded}`;
    }
    return parsed.href;
  } catch {
    // Fallback: encode all non-ASCII chars directly
    return rawUrl
      .replace(/[^\x20-\x7E]/g, (c) => {
        try {
          return encodeURIComponent(c);
        } catch {
          return '';
        }
      })
      .replace(/ /g, '%20');
  }
}

// =============================================================================
// MAIN HANDLER
// =============================================================================
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const hostname = url.hostname;

    // =========================================================================
    // 1. DETECTAR SI ES SUBDOMINIO: {slug}.trens.app
    // =========================================================================
    const subdomainMatch = hostname.match(/^([a-z0-9-]+)\.trens\.app$/i);

    if (subdomainMatch) {
      const subdomain = subdomainMatch[1].toLowerCase();

      // Subdominios del sistema → pasar al origen
      if (RESERVED_SUBDOMAINS.has(subdomain)) {
        return fetch(request);
      }

      // Buscar en short_links tipo subdomain
      const link = await lookupSlug(subdomain, 'subdomain', env);
      if (link) {
        // Incrementar clicks async (fire-and-forget)
        incrementClicks(subdomain, env);
        return new Response(null, {
          status: 302,
          headers: { Location: ensureAsciiUrl(link.destination_url) },
        });
      }

      // No existe → redirect al dominio principal
      return Response.redirect(`https://trens.app${url.pathname}`, 302);
    }

    // =========================================================================
    // 2. DETECTAR SI ES RUTA: trens.app/{slug}
    // =========================================================================

    // Solo interceptar rutas de primer nivel (no /assets/img.png, no /adn/profile)
    const pathParts = url.pathname.split('/').filter(Boolean);

    // Solo rutas de un solo segmento
    if (pathParts.length !== 1) {
      return fetch(request);
    }

    const slug = pathParts[0].toLowerCase();

    // Archivos estáticos → pasar al origen
    if (STATIC_EXTENSIONS.test(slug)) {
      return fetch(request);
    }

    // Rutas de la app → pasar al origen
    if (PASSTHROUGH_SLUGS.has(slug)) {
      return fetch(request);
    }

    // Buscar en short_links (cualquier tipo - path o subdomain)
    const link = await lookupSlug(slug, null, env);
    if (link) {
      incrementClicks(slug, env);
      return new Response(null, {
        status: 302,
        headers: { Location: ensureAsciiUrl(link.destination_url) },
      });
    }

    // No encontrado → pasar al origen (la SPA manejará el 404)
    return fetch(request);
  },
};

// =============================================================================
// LOOKUP SLUG EN SUPABASE
// =============================================================================
async function lookupSlug(
  slug: string,
  linkType: string | null,
  env: Env
): Promise<ShortLinkRow | null> {
  try {
    const typeFilter = linkType ? `&link_type=eq.${linkType}` : '';
    const response = await fetch(
      `${env.SUPABASE_URL}/rest/v1/short_links?slug=eq.${encodeURIComponent(slug)}${typeFilter}&is_active=eq.true&select=slug,destination_url,link_type&limit=1`,
      {
        headers: {
          apikey: env.SUPABASE_ANON_KEY,
          Authorization: `Bearer ${env.SUPABASE_ANON_KEY}`,
        },
      }
    );

    if (!response.ok) return null;

    const data: ShortLinkRow[] = await response.json();
    return data.length > 0 ? data[0] : null;
  } catch {
    return null;
  }
}

// =============================================================================
// INCREMENT CLICKS (fire-and-forget, no bloquea el redirect)
// =============================================================================
function incrementClicks(slug: string, env: Env): void {
  fetch(`${env.SUPABASE_URL}/rest/v1/rpc/increment_link_clicks`, {
    method: 'POST',
    headers: {
      apikey: env.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${env.SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ link_slug: slug }),
  }).catch(() => {
    // Silenciar errores de tracking - el redirect ya se hizo
  });
}
