import { CONFIG_KEY, STATUS_KEY, loadConfig } from './lib/config.js';
import { buildDnrRules } from './lib/rules.js';

const dnr = chrome.declarativeNetRequest;

async function applyConfig() {
  const config = await loadConfig();
  const { entries, errors } = buildDnrRules(config);

  // RE2 (used by Chrome) and JS regexes differ slightly: let Chrome decide.
  const supported = [];
  for (const entry of entries) {
    const { isSupported, reason } = await dnr.isRegexSupported({
      regex: entry.dnr.condition.regexFilter,
      isCaseSensitive: false,
    });
    if (isSupported) supported.push(entry);
    else errors[entry.ruleId] = `Regex rejected by Chrome (${reason})`;
  }

  const removeRuleIds = (await dnr.getDynamicRules()).map((r) => r.id);
  let applied = supported;
  try {
    await dnr.updateDynamicRules({ removeRuleIds, addRules: supported.map((e) => e.dnr) });
  } catch {
    // updateDynamicRules is atomic: one bad rule rejects them all. Add them one
    // by one so the others still work and the culprit gets reported.
    await dnr.updateDynamicRules({ removeRuleIds });
    applied = [];
    for (const entry of supported) {
      try {
        await dnr.updateDynamicRules({ addRules: [entry.dnr] });
        applied.push(entry);
      } catch (e) {
        errors[entry.ruleId] = e.message;
      }
    }
  }

  await chrome.storage.local.set({ [STATUS_KEY]: { applied: applied.map((e) => e.ruleId), errors } });
  await updateBadge(config.enabled, applied.length, Object.keys(errors).length);
}

async function updateBadge(enabled, appliedCount, errorCount) {
  let text = '';
  let color = '#2563eb';
  if (!enabled) {
    text = 'OFF';
    color = '#6b7280';
  } else if (errorCount) {
    text = '!';
    color = '#dc2626';
  } else if (appliedCount) {
    text = String(appliedCount);
  }
  await chrome.action.setBadgeText({ text });
  await chrome.action.setBadgeBackgroundColor({ color });
}

// Serialize runs so rapid edits never interleave rule updates.
let queue = Promise.resolve();
function scheduleApply() {
  queue = queue.then(applyConfig).catch((e) => console.error('Failed to apply rules', e));
  return queue;
}

chrome.runtime.onInstalled.addListener(scheduleApply);
chrome.runtime.onStartup.addListener(scheduleApply);
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && CONFIG_KEY in changes) scheduleApply();
});
