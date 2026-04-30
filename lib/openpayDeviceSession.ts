// ============================================================================
// OPENPAY DEVICE SESSION ID - Antifraude
// OpenPay PE exige device_session_id para guardar tarjetas y cobrar.
// - Web: carga el script oficial y usa OpenPay.deviceData.setup()
// - Native: genera un UUID v4 estable (OpenPay lo acepta)
// ============================================================================

import { Platform } from 'react-native';
import Constants from 'expo-constants';

const extra = Constants.expoConfig?.extra;
const MERCHANT_ID = extra?.openpayMerchantId || 'mudi9kij0xb5xk54urc6';
const PUBLIC_KEY = extra?.openpayPublicKey || 'pk_8ce5687a939145189673ff91c3282463';
const IS_SANDBOX = extra?.openpaySandbox === 'true' || false;

const SCRIPT_URLS = [
  'https://openpay.s3.amazonaws.com/openpay.v1.min.js',
  'https://openpay.s3.amazonaws.com/openpay-data.v1.min.js',
];

let scriptsLoaded = false;
let cachedSessionId: string | null = null;

function uuidV4(): string {
  // RFC4122 v4 — usable como device_session_id en native
  const c = (globalThis.crypto || (globalThis as any).msCrypto) as Crypto | undefined;
  if (c?.randomUUID) return c.randomUUID();
  if (c?.getRandomValues) {
    const buf = new Uint8Array(16);
    c.getRandomValues(buf);
    buf[6] = (buf[6] & 0x0f) | 0x40;
    buf[8] = (buf[8] & 0x3f) | 0x80;
    const hex = Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  // Fallback no criptográfico
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    const v = ch === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof document === 'undefined') return reject(new Error('No document'));
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      if ((existing as any).dataset.loaded === '1') return resolve();
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error(`Failed: ${src}`)));
      return;
    }
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.onload = () => {
      (s as any).dataset.loaded = '1';
      resolve();
    };
    s.onerror = () => reject(new Error(`Failed: ${src}`));
    document.head.appendChild(s);
  });
}

async function ensureWebScripts(): Promise<void> {
  if (scriptsLoaded) return;
  for (const url of SCRIPT_URLS) {
    try {
      await loadScript(url);
    } catch (e) {
      console.warn('[openpay-antifraud] script load failed', url, e);
    }
  }
  const OP = (globalThis as any).OpenPay;
  if (OP) {
    try {
      OP.setId(MERCHANT_ID);
      OP.setApiKey(PUBLIC_KEY);
      OP.setSandboxMode(IS_SANDBOX);
    } catch (e) {
      console.warn('[openpay-antifraud] init failed', e);
    }
  }
  scriptsLoaded = true;
}

/**
 * Devuelve un device_session_id válido para OpenPay.
 * Llamar antes de tokenizar/guardar/cobrar.
 */
export async function getDeviceSessionId(): Promise<string> {
  if (cachedSessionId) return cachedSessionId;

  if (Platform.OS === 'web') {
    try {
      await ensureWebScripts();
      const OP = (globalThis as any).OpenPay;
      if (OP?.deviceData?.setup) {
        const id: string = OP.deviceData.setup();
        if (id) {
          cachedSessionId = id;
          return id;
        }
      }
    } catch (e) {
      console.warn('[openpay-antifraud] web setup failed → fallback uuid', e);
    }
  }

  // Native (o web sin script): UUID v4
  cachedSessionId = uuidV4();
  return cachedSessionId;
}

/** Resetea el cache (útil tras logout). */
export function resetDeviceSessionId() {
  cachedSessionId = null;
}
