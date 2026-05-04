// ============================================================================
// GOOGLE SERVICE ACCOUNT AUTH
// Genera un access_token de OAuth2 firmando un JWT RS256 con la private_key
// del service account. Cachea el token en memoria del Worker hasta 50 min.
// ============================================================================

interface ServiceAccountJSON {
  client_email: string;
  private_key: string;
  token_uri?: string;
}

interface CachedToken {
  token: string;
  expiresAt: number;
}

let cached: CachedToken | null = null;

const TTS_SCOPE = 'https://www.googleapis.com/auth/cloud-platform';

// ----------------------------------------------------------------------------
// Helpers — base64url
// ----------------------------------------------------------------------------
function b64url(input: ArrayBuffer | Uint8Array | string): string {
  let bytes: Uint8Array;
  if (typeof input === 'string') {
    bytes = new TextEncoder().encode(input);
  } else if (input instanceof ArrayBuffer) {
    bytes = new Uint8Array(input);
  } else {
    bytes = input;
  }
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

// PEM PKCS#8 -> CryptoKey
async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const cleaned = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\\n/g, '\n')
    .replace(/[\r\n\s]/g, '');

  const bin = atob(cleaned);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);

  return crypto.subtle.importKey(
    'pkcs8',
    bytes,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );
}

// ----------------------------------------------------------------------------
// getAccessToken — cachea hasta 50 min
// ----------------------------------------------------------------------------
export async function getGoogleAccessToken(saJson: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cached && cached.expiresAt > now + 60) return cached.token;

  let sa: ServiceAccountJSON;
  try {
    sa = JSON.parse(saJson);
  } catch (e) {
    throw new Error('Invalid GOOGLE_SERVICE_ACCOUNT JSON');
  }
  if (!sa.client_email || !sa.private_key) {
    throw new Error('Service account missing client_email or private_key');
  }

  const tokenUri = sa.token_uri || 'https://oauth2.googleapis.com/token';

  const header = { alg: 'RS256', typ: 'JWT' };
  const claim = {
    iss: sa.client_email,
    scope: TTS_SCOPE,
    aud: tokenUri,
    iat: now,
    exp: now + 3600,
  };

  const headerB64 = b64url(JSON.stringify(header));
  const claimB64 = b64url(JSON.stringify(claim));
  const signingInput = `${headerB64}.${claimB64}`;

  const key = await importPrivateKey(sa.private_key);
  const sigBuf = await crypto.subtle.sign(
    { name: 'RSASSA-PKCS1-v1_5' },
    key,
    new TextEncoder().encode(signingInput)
  );
  const jwt = `${signingInput}.${b64url(sigBuf)}`;

  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion: jwt,
  });

  const res = await fetch(tokenUri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`OAuth token error ${res.status}: ${t}`);
  }
  const json = (await res.json()) as { access_token: string; expires_in: number };
  cached = {
    token: json.access_token,
    expiresAt: now + Math.min(json.expires_in - 60, 3000), // máx ~50min
  };
  return cached.token;
}
