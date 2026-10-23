// Turns the user config into declarativeNetRequest dynamic rules.

import { hostPatternToUrlRegex, PatternError } from './pattern.js';

// Listed explicitly: when resourceTypes is omitted, DNR skips main_frame.
export const ALL_RESOURCE_TYPES = [
  'main_frame',
  'sub_frame',
  'stylesheet',
  'script',
  'image',
  'font',
  'object',
  'xmlhttprequest',
  'ping',
  'csp_report',
  'media',
  'websocket',
  'webtransport',
  'webbundle',
  'other',
];

const HEADER_NAME = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;

function toHeaderInfo(h) {
  const info = { header: h.name.trim().toLowerCase(), operation: h.operation };
  if (h.operation !== 'remove') info.value = h.value;
  return info;
}

/**
 * Builds one DNR rule per enabled user rule.
 *
 * Rules higher in the list get a higher priority, so when two rules set the
 * same header the top-most one wins.
 *
 * @returns {{ entries: { ruleId: string, dnr: object }[], errors: Record<string, string> }}
 */
export function buildDnrRules(config) {
  const entries = [];
  const errors = {};
  if (!config.enabled) return { entries, errors };

  const count = config.rules.length;
  config.rules.forEach((rule, index) => {
    if (!rule.enabled) return;

    let regexFilter;
    try {
      regexFilter = hostPatternToUrlRegex(rule.pattern);
    } catch (e) {
      if (!(e instanceof PatternError)) throw e;
      errors[rule.id] = e.message;
      return;
    }

    const headers = rule.headers.filter((h) => h.enabled && h.name.trim());
    const bad = headers.find((h) => !HEADER_NAME.test(h.name.trim()));
    if (bad) {
      errors[rule.id] = `Invalid header name "${bad.name}"`;
      return;
    }

    const requestHeaders = headers.filter((h) => h.target === 'request').map(toHeaderInfo);
    const responseHeaders = headers.filter((h) => h.target === 'response').map(toHeaderInfo);
    if (!requestHeaders.length && !responseHeaders.length) return;

    const action = { type: 'modifyHeaders' };
    if (requestHeaders.length) action.requestHeaders = requestHeaders;
    if (responseHeaders.length) action.responseHeaders = responseHeaders;

    entries.push({
      ruleId: rule.id,
      dnr: {
        id: index + 1,
        priority: count - index,
        action,
        condition: { regexFilter, isUrlFilterCaseSensitive: false, resourceTypes: ALL_RESOURCE_TYPES },
      },
    });
  });

  return { entries, errors };
}
