// Share the setup via URL: ?cfg=<base64url of a JSON with what differs from the defaults>
import { Config, defaultConfig, defaultProfile, DevProfile } from './sim';

const PARAM = 'cfg';

function toBase64Url(text: string) {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(b64: string) {
  const bin = atob(b64.replace(/-/g, '+').replace(/_/g, '/'));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

/** Only what differs from the defaults, to keep the URL short. */
function diff(cfg: Config): Partial<Config> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(cfg)) {
    if (k === 'devProfiles') {
      // sparse: { "<dev index>": { only the changed fields } }
      const sparse: Record<string, Partial<DevProfile>> = {};
      (v as DevProfile[]).forEach((p, i) => {
        const def = defaultProfile(i) as unknown as Record<string, unknown>;
        const changed = Object.fromEntries(Object.entries(p).filter(([f, x]) => x !== def[f]));
        if (Object.keys(changed).length) sparse[i] = changed;
      });
      if (Object.keys(sparse).length) out[k] = sparse;
      continue;
    }
    const d = (defaultConfig as unknown as Record<string, unknown>)[k];
    if (JSON.stringify(v) !== JSON.stringify(d)) out[k] = v;
  }
  return out as Partial<Config>;
}

/** Applies the URL settings to cfg (ignores unknown keys or wrong types). */
export function loadConfigFromUrl(cfg: Config): boolean {
  const raw = new URLSearchParams(location.search).get(PARAM);
  if (!raw) return false;
  try {
    const data = JSON.parse(fromBase64Url(raw)) as Record<string, unknown>;
    const target = cfg as unknown as Record<string, unknown>;
    for (const [k, v] of Object.entries(data)) {
      if (k === 'devProfiles') {
        if (v && typeof v === 'object') applyProfiles(cfg, v as Record<string, unknown>);
        continue;
      }
      const d = (defaultConfig as unknown as Record<string, unknown>)[k];
      if (d === undefined) continue;
      if (Array.isArray(d)) {
        if (Array.isArray(v) && v.length && v.every((x) => typeof x === 'string')) target[k] = v.slice(0, 6);
      } else if (typeof v === typeof d && (typeof v !== 'number' || Number.isFinite(v))) target[k] = v;
    }
    return true;
  } catch {
    console.warn('Invalid ?cfg= parameter, using defaults');
    return false;
  }
}

function applyProfiles(cfg: Config, sparse: Record<string, unknown>) {
  for (const [idx, raw] of Object.entries(sparse)) {
    const i = Number(idx);
    if (!Number.isInteger(i) || i < 0 || i >= cfg.devProfiles.length || !raw || typeof raw !== 'object') continue;
    const target = { ...defaultProfile(i), ...cfg.devProfiles[i] } as unknown as Record<string, unknown>;
    for (const [f, x] of Object.entries(raw)) {
      const def = (defaultProfile(i) as unknown as Record<string, unknown>)[f];
      if (def === undefined || typeof x !== typeof def) continue;
      if (f === 'level' && !['junior', 'mid', 'senior'].includes(x as string)) continue;
      if (typeof x === 'number' && !Number.isFinite(x)) continue;
      target[f] = x;
    }
    cfg.devProfiles[i] = target as unknown as DevProfile;
  }
}

/** Keeps the address bar URL always reflecting the current setup. */
export function syncUrl(cfg: Config) {
  const url = new URL(location.href);
  const d = diff(cfg);
  if (Object.keys(d).length) url.searchParams.set(PARAM, toBase64Url(JSON.stringify(d)));
  else url.searchParams.delete(PARAM);
  history.replaceState(null, '', url);
}

export function shareUrl(cfg: Config) {
  syncUrl(cfg);
  return location.href;
}
