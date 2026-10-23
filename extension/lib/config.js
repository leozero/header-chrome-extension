// Configuration model, shared by the service worker, the popup and the options page.
//
// {
//   enabled: boolean,                 // global on/off switch
//   rules: [{
//     id, name, enabled,
//     pattern,                        // hostname regex
//     headers: [{ id, enabled, target: 'request'|'response',
//                 operation: 'set'|'append'|'remove', name, value }]
//   }]
// }

export const CONFIG_KEY = 'config';
export const STATUS_KEY = 'status';

export const TARGETS = ['request', 'response'];
export const OPERATIONS = ['set', 'append', 'remove'];

export function newId() {
  return crypto.randomUUID();
}

export function newHeader(overrides = {}) {
  return { id: newId(), enabled: true, target: 'request', operation: 'set', name: '', value: '', ...overrides };
}

export function newRule(overrides = {}) {
  return { id: newId(), name: 'New rule', enabled: true, pattern: '', headers: [newHeader()], ...overrides };
}

export function defaultConfig() {
  return { enabled: true, rules: [] };
}

const str = (v, fallback = '') => (typeof v === 'string' ? v : fallback);
const bool = (v, fallback = true) => (typeof v === 'boolean' ? v : fallback);
const oneOf = (v, list) => (list.includes(v) ? v : list[0]);

/** Coerces untrusted input (storage, imported JSON) into a valid config. */
export function normalizeConfig(input) {
  const cfg = input && typeof input === 'object' ? input : {};
  const rules = Array.isArray(cfg.rules) ? cfg.rules : [];
  return {
    enabled: bool(cfg.enabled),
    rules: rules
      .filter((r) => r && typeof r === 'object')
      .map((r) => ({
        id: str(r.id) || newId(),
        name: str(r.name),
        enabled: bool(r.enabled),
        pattern: str(r.pattern),
        headers: (Array.isArray(r.headers) ? r.headers : [])
          .filter((h) => h && typeof h === 'object')
          .map((h) => ({
            id: str(h.id) || newId(),
            enabled: bool(h.enabled),
            target: oneOf(h.target, TARGETS),
            operation: oneOf(h.operation, OPERATIONS),
            name: str(h.name),
            value: str(h.value),
          })),
      })),
  };
}

export async function loadConfig() {
  const { [CONFIG_KEY]: cfg } = await chrome.storage.local.get(CONFIG_KEY);
  return normalizeConfig(cfg ?? defaultConfig());
}

export async function saveConfig(cfg) {
  await chrome.storage.local.set({ [CONFIG_KEY]: normalizeConfig(cfg) });
}

export async function loadStatus() {
  const { [STATUS_KEY]: status } = await chrome.storage.local.get(STATUS_KEY);
  return status ?? { applied: [], errors: {} };
}
