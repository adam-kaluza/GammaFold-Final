export const REQUIRED_CARBON_MODEL_ID = 'gemini-4-carbon';

export const REQUEST_TIMEOUT_MS = 40_000;
export const MAX_OUTPUT_CHARS = 24_000;
export const MAX_REQUEST_BODY_LIMIT = '16kb';
export const DEFAULT_SERVER_HOST = '127.0.0.1';
export const SERVER_PORT = Number(process.env.PORT || 3000);
export const DEFAULT_MAX_LIVE_REQUESTS = 5;
export const DEFAULT_COOLDOWN_MS = 10_000;

export interface ServerModelConfig {
  requestedModel: typeof REQUIRED_CARBON_MODEL_ID;
  configuredEnvModel: string;
  modelPolicyValid: boolean;
}

export function resolveServerModelConfig(envModelRaw = process.env.GEMINI_MODEL): ServerModelConfig {
  const trimmed = envModelRaw?.trim() ?? '';
  const configuredEnvModel = trimmed.length > 0 ? trimmed : REQUIRED_CARBON_MODEL_ID;
  return {
    requestedModel: REQUIRED_CARBON_MODEL_ID,
    configuredEnvModel,
    modelPolicyValid: configuredEnvModel === REQUIRED_CARBON_MODEL_ID,
  };
}

export function isUsableApiKey(rawKey = process.env.GEMINI_API_KEY): boolean {
  const trimmed = rawKey?.trim() ?? '';
  if (!trimmed) return false;
  if (/^(PLACEHOLDER_|MY_GEMINI_API_KEY|YOUR_SERVER_SIDE_GEMINI_API_KEY)/i.test(trimmed)) {
    return false;
  }
  return true;
}

export function isLiveModeEnabled(rawFlag = process.env.GAMMAFOLD_LIVE_MODE): boolean {
  const normalized = rawFlag?.trim().toLowerCase() ?? '';
  return normalized === 'true' || normalized === '1';
}

export function isLoopbackHost(host: string): boolean {
  const normalized = host.trim().toLowerCase();
  return normalized === '127.0.0.1' || normalized === 'localhost' || normalized === '::1';
}

export function resolveServerHost(rawHost = process.env.HOST): {
  host: string;
  isLoopback: boolean;
} {
  const trimmed = rawHost?.trim() ?? '';
  const host = trimmed.length > 0 ? trimmed : DEFAULT_SERVER_HOST;
  return {
    host,
    isLoopback: isLoopbackHost(host),
  };
}

export function isLoopbackRemoteAddress(remoteAddress: string | undefined): boolean {
  if (!remoteAddress) return false;
  const normalized = remoteAddress.trim().toLowerCase();
  return (
    normalized === '127.0.0.1' ||
    normalized === '::1' ||
    normalized === '::ffff:127.0.0.1'
  );
}

export type LoopbackHostHeaderCheck =
  | {
      ok: true;
      expectedOrigin: string;
      normalizedAuthority: string;
    }
  | {
      ok: false;
      reason: string;
    };

export function validateLoopbackHostHeader(
  rawHostHeader: string | string[] | undefined,
  localSocketPort?: number,
): LoopbackHostHeaderCheck {
  if (rawHostHeader === undefined || Array.isArray(rawHostHeader)) {
    return { ok: false, reason: 'Missing or duplicate Host header.' };
  }

  const trimmed = rawHostHeader.trim();
  if (!trimmed || /[\s,@/\\]/.test(trimmed)) {
    return { ok: false, reason: 'Malformed Host header.' };
  }

  let hostname: string;
  let portStr: string | undefined;

  if (trimmed.startsWith('[')) {
    const match = /^\[([^\]]+)\](?::([1-9]\d{0,4}))?$/.exec(trimmed);
    if (!match) {
      return { ok: false, reason: 'Invalid bracketed Host header.' };
    }
    if (match[1].toLowerCase() !== '::1') {
      return { ok: false, reason: 'Host header is not a loopback address.' };
    }
    hostname = '[::1]';
    portStr = match[2];
  } else {
    const match = /^([^:]+)(?::([1-9]\d{0,4}))?$/.exec(trimmed);
    if (!match) {
      return { ok: false, reason: 'Invalid Host header format.' };
    }
    const lowerHost = match[1].toLowerCase();
    if (lowerHost !== '127.0.0.1' && lowerHost !== 'localhost') {
      return { ok: false, reason: 'Host header is not an allowed loopback host.' };
    }
    hostname = lowerHost;
    portStr = match[2];
  }

  let port: number | null = null;
  if (portStr !== undefined) {
    port = Number(portStr);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      return { ok: false, reason: 'Invalid Host port.' };
    }
    if (typeof localSocketPort === 'number' && localSocketPort > 0 && port !== localSocketPort) {
      return { ok: false, reason: 'Host header port does not match local socket port.' };
    }
  }

  const normalizedAuthority = port !== null ? `${hostname}:${port}` : hostname;
  try {
    const expectedOrigin = new URL(`http://${normalizedAuthority}`).origin;
    return {
      ok: true,
      expectedOrigin,
      normalizedAuthority,
    };
  } catch {
    return { ok: false, reason: 'Invalid Host authority.' };
  }
}

export function validateReviewRequestOrigin(
  headers: {
    origin?: string | string[];
    secFetchSite?: string | string[];
    referer?: string | string[];
  },
  expectedOrigin: string,
): { ok: true } | { ok: false; reason: string } {
  if (Array.isArray(headers.origin)) {
    return { ok: false, reason: 'Multiple Origin headers are not permitted.' };
  }

  if (headers.origin !== undefined) {
    const trimmedOrigin = headers.origin.trim();
    if (
      !trimmedOrigin ||
      trimmedOrigin.toLowerCase() === 'null' ||
      /[\s,]/.test(trimmedOrigin) ||
      trimmedOrigin.endsWith('/')
    ) {
      return { ok: false, reason: 'Null or untrusted Origin header rejected.' };
    }

    let parsedOrigin: URL;
    try {
      parsedOrigin = new URL(trimmedOrigin);
    } catch {
      return { ok: false, reason: 'Malformed Origin header rejected.' };
    }

    if (
      parsedOrigin.protocol !== 'http:' ||
      parsedOrigin.username !== '' ||
      parsedOrigin.password !== '' ||
      parsedOrigin.pathname !== '/' ||
      parsedOrigin.search !== '' ||
      parsedOrigin.hash !== '' ||
      parsedOrigin.origin !== expectedOrigin
    ) {
      return { ok: false, reason: 'Cross-origin request to local review endpoint is prohibited.' };
    }
  }

  if (Array.isArray(headers.secFetchSite)) {
    return { ok: false, reason: 'Multiple Sec-Fetch-Site headers are not permitted.' };
  }
  if (headers.secFetchSite !== undefined) {
    const sfs = headers.secFetchSite.trim().toLowerCase();
    if (sfs !== 'same-origin') {
      return { ok: false, reason: 'Non-same-origin browser fetch metadata rejected.' };
    }
  }

  if (Array.isArray(headers.referer)) {
    return { ok: false, reason: 'Multiple Referer headers are not permitted.' };
  }
  if (headers.referer !== undefined) {
    const trimmedReferer = headers.referer.trim();
    let parsedReferer: URL;
    try {
      parsedReferer = new URL(trimmedReferer);
    } catch {
      return { ok: false, reason: 'Malformed Referer header rejected.' };
    }
    if (parsedReferer.origin !== expectedOrigin) {
      return { ok: false, reason: 'Cross-origin Referer header rejected.' };
    }
  }

  return { ok: true };
}

export function isJsonContentTypeHeader(
  rawContentType: string | string[] | undefined,
): boolean {
  if (!rawContentType || Array.isArray(rawContentType)) {
    return false;
  }
  const [rawMediaType, ...rawParams] = rawContentType.split(';');
  if (rawMediaType.trim().toLowerCase() !== 'application/json') {
    return false;
  }
  for (const rawParam of rawParams) {
    const param = rawParam.trim();
    if (!param) continue;
    const eqIdx = param.indexOf('=');
    if (eqIdx <= 0) return false;
    const key = param.slice(0, eqIdx).trim().toLowerCase();
    const val = param
      .slice(eqIdx + 1)
      .trim()
      .replace(/^"|"$/g, '')
      .toLowerCase();
    if (key !== 'charset' || (val !== 'utf-8' && val !== 'utf8')) {
      return false;
    }
  }
  return true;
}

export function resolveMaxLiveRequests(rawMax = process.env.GAMMAFOLD_MAX_REQUESTS): number {
  if (!rawMax || rawMax.trim().length === 0) return DEFAULT_MAX_LIVE_REQUESTS;
  const parsed = Number(rawMax.trim());
  if (!Number.isInteger(parsed) || parsed < 1) return DEFAULT_MAX_LIVE_REQUESTS;
  return Math.min(25, parsed);
}

export function resolveCooldownMs(rawCooldown = process.env.GAMMAFOLD_COOLDOWN_MS): number {
  if (!rawCooldown || rawCooldown.trim().length === 0) return DEFAULT_COOLDOWN_MS;
  const parsed = Number(rawCooldown.trim());
  if (!Number.isFinite(parsed) || parsed < 0) return DEFAULT_COOLDOWN_MS;
  return Math.min(300_000, Math.floor(parsed));
}

export function redactConfiguredSecrets(
  raw: string,
  exactSecrets: ReadonlyArray<string | undefined> = [],
): string {
  let out = raw;

  for (const secret of exactSecrets) {
    const trimmed = secret?.trim();
    if (!trimmed) continue;
    out = out.split(trimmed).join('[REDACTED_SECRET]');
    const urlEncoded = encodeURIComponent(trimmed);
    if (urlEncoded !== trimmed) {
      out = out.split(urlEncoded).join('[REDACTED_SECRET]');
    }
  }

  return out
    .replace(/AIza[0-9A-Za-z_-]{12,}/g, '[REDACTED_SECRET]')
    .replace(/Bearer\s+[^\s,;"]+/gi, 'Bearer [REDACTED_SECRET]')
    .replace(/(?:api[_-]?key|x-goog-api-key|key|token)\s*[:=]\s*[^\s&,;"]+/gi, 'key=[REDACTED_SECRET]')
    .slice(0, 320);
}
