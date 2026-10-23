// HTTP Basic authentication helpers (RFC 7617), UTF-8 safe.

export const AUTH_HEADER = /^(proxy-)?authorization$/i;

/** Returns `Basic <base64(username:password)>`. */
export function encodeBasicAuth(username, password) {
  if (username.includes(':')) throw new Error('The username cannot contain ":"');
  const bytes = new TextEncoder().encode(`${username}:${password}`);
  return `Basic ${btoa(String.fromCharCode(...bytes))}`;
}

/** Parses a `Basic …` header value, or returns null if it is not one. */
export function decodeBasicAuth(value) {
  const match = /^\s*Basic\s+([A-Za-z0-9+/]+=*)\s*$/i.exec(value ?? '');
  if (!match) return null;
  try {
    const bytes = Uint8Array.from(atob(match[1]), (c) => c.charCodeAt(0));
    const decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    const sep = decoded.indexOf(':');
    if (sep === -1) return null;
    return { username: decoded.slice(0, sep), password: decoded.slice(sep + 1) };
  } catch {
    return null;
  }
}
