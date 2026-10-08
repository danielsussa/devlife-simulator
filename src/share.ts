// Compartilhar o setup via URL: ?cfg=<base64url do JSON com o que difere do padrão>
import { Config, defaultConfig } from './sim';

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

/** Só o que mudou em relação ao padrão, pra URL ficar curta. */
function diff(cfg: Config): Partial<Config> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(cfg)) {
    const d = (defaultConfig as unknown as Record<string, unknown>)[k];
    if (JSON.stringify(v) !== JSON.stringify(d)) out[k] = v;
  }
  return out as Partial<Config>;
}

/** Aplica no cfg os parâmetros da URL (ignora chaves desconhecidas ou de tipo errado). */
export function loadConfigFromUrl(cfg: Config): boolean {
  const raw = new URLSearchParams(location.search).get(PARAM);
  if (!raw) return false;
  try {
    const data = JSON.parse(fromBase64Url(raw)) as Record<string, unknown>;
    const target = cfg as unknown as Record<string, unknown>;
    for (const [k, v] of Object.entries(data)) {
      const d = (defaultConfig as unknown as Record<string, unknown>)[k];
      if (d === undefined) continue;
      if (Array.isArray(d)) {
        if (Array.isArray(v) && v.length && v.every((x) => typeof x === 'string')) target[k] = v.slice(0, 6);
      } else if (typeof v === typeof d && (typeof v !== 'number' || Number.isFinite(v))) target[k] = v;
    }
    return true;
  } catch {
    console.warn('Parâmetro ?cfg= inválido, usando o padrão');
    return false;
  }
}

/** Mantém a URL da barra de endereço sempre refletindo o setup atual. */
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
