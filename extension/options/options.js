import {
  CONFIG_KEY,
  STATUS_KEY,
  loadConfig,
  loadStatus,
  newHeader,
  newId,
  newRule,
  normalizeConfig,
  saveConfig,
} from '../lib/config.js';
import { compileHostPattern, hostPatternToUrlRegex } from '../lib/pattern.js';

const SENSITIVE = /auth|token|key|secret|cookie|session|password/i;

const $ = (sel, root = document) => root.querySelector(sel);
const rulesEl = $('#rules');
const ruleTpl = $('#rule-tpl');
const headerTpl = $('#header-tpl');

let config = normalizeConfig(null);
let status = { applied: [], errors: {} };
/** Header id -> 'shown' | 'hidden', when the user toggled value visibility. */
const visibility = new Map();

// ---------------------------------------------------------------------------
// Persistence

let saveTimer;
function save() {
  setSaveState('Saving…');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    await saveConfig(config);
    setSaveState('Saved');
  }, 250);
}

function setSaveState(text) {
  $('#save-state').textContent = text;
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (STATUS_KEY in changes) {
    status = changes[STATUS_KEY].newValue ?? { applied: [], errors: {} };
    refreshAllStatuses();
  }
  if (CONFIG_KEY in changes) {
    // Ignore echoes of our own saves; re-render on changes made elsewhere (popup).
    const incoming = normalizeConfig(changes[CONFIG_KEY].newValue);
    if (JSON.stringify(incoming) !== JSON.stringify(config)) {
      config = incoming;
      render();
    }
  }
});

// ---------------------------------------------------------------------------
// Rendering

function render() {
  $('#global-enabled').checked = config.enabled;
  $('#global-label').textContent = config.enabled ? 'Enabled' : 'Paused';
  document.body.classList.toggle('globally-disabled', !config.enabled);

  rulesEl.replaceChildren(...config.rules.map(renderRule));
  $('#empty').hidden = config.rules.length > 0;
}

function renderRule(rule) {
  const card = ruleTpl.content.firstElementChild.cloneNode(true);
  card.dataset.id = rule.id;
  $('[data-field="enabled"]', card).checked = rule.enabled;
  $('[data-field="name"]', card).value = rule.name;
  $('[data-field="pattern"]', card).value = rule.pattern;
  $('[data-role="headers"]', card).replaceChildren(...rule.headers.map((h) => renderHeader(h)));
  card.classList.toggle('disabled', !rule.enabled);

  card.addEventListener('input', (e) => onRuleInput(e, rule, card));
  card.addEventListener('click', (e) => onRuleClick(e, rule, card));

  refreshStatus(card, rule);
  return card;
}

function renderHeader(header) {
  const row = headerTpl.content.firstElementChild.cloneNode(true);
  row.dataset.id = header.id;
  $('[data-hfield="enabled"]', row).checked = header.enabled;
  $('[data-hfield="target"]', row).value = header.target;
  $('[data-hfield="operation"]', row).value = header.operation;
  $('[data-hfield="name"]', row).value = header.name;
  $('[data-hfield="value"]', row).value = header.value;
  refreshHeaderRow(row, header);
  return row;
}

function refreshHeaderRow(row, header) {
  const valueInput = $('[data-hfield="value"]', row);
  const isRemove = header.operation === 'remove';
  valueInput.disabled = isRemove;
  valueInput.placeholder = isRemove ? '(not used)' : 'Bearer eyJhbGciOi…';
  const override = visibility.get(header.id);
  const masked = !isRemove && (override ? override === 'hidden' : SENSITIVE.test(header.name));
  valueInput.classList.toggle('masked', masked);
  $('[data-haction="reveal"]', row).hidden = isRemove;
  row.classList.toggle('disabled', !header.enabled);
}

function normalizeTestUrl(input) {
  const v = input.trim();
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(v)) return v;
  return `https://${v}${/[/?#]/.test(v) ? '' : '/'}`;
}

function refreshStatus(card, rule) {
  const pill = $('[data-role="status"]', card);
  const patternMsg = $('[data-role="pattern-msg"]', card);
  const testInput = $('[data-role="test"]', card);
  const testMsg = $('[data-role="test-msg"]', card);
  const patternInput = $('[data-field="pattern"]', card);

  let localError = null;
  let matcher = null;
  if (rule.pattern.trim()) {
    try {
      matcher = compileHostPattern(rule.pattern);
      patternInput.title = `Generated URL regex:\n${hostPatternToUrlRegex(rule.pattern)}`;
    } catch (e) {
      localError = e.message;
    }
  } else {
    localError = 'A hostname regex is required';
  }
  const error = localError ?? status.errors?.[rule.id] ?? null;

  patternMsg.textContent = error ?? 'Valid regex';
  patternMsg.className = `hint ${error ? 'error' : 'ok'}`;

  const testValue = testInput.value.trim();
  if (!testValue || !matcher) {
    testMsg.textContent = '';
    testMsg.className = 'hint';
  } else {
    const url = normalizeTestUrl(testValue);
    let host = url;
    try {
      host = new URL(url).hostname;
    } catch {}
    const ok = matcher(url);
    testMsg.textContent = ok ? `✓ Headers are applied to ${host}` : `✗ ${host} does not match`;
    testMsg.className = `hint ${ok ? 'ok' : 'error'}`;
  }

  const hasHeaders = rule.headers.some((h) => h.enabled && h.name.trim());
  let label;
  let kind = '';
  if (!config.enabled) label = 'Paused';
  else if (!rule.enabled) label = 'Disabled';
  else if (error) [label, kind] = ['Error', 'error'];
  else if (!hasHeaders) label = 'No headers';
  else if (status.applied?.includes(rule.id)) [label, kind] = ['Active', 'ok'];
  else label = 'Applying…';
  pill.textContent = label;
  pill.className = `pill ${kind}`;
}

function refreshAllStatuses() {
  for (const card of rulesEl.children) {
    const rule = config.rules.find((r) => r.id === card.dataset.id);
    if (rule) refreshStatus(card, rule);
  }
}

// ---------------------------------------------------------------------------
// Events

function onRuleInput(e, rule, card) {
  const el = e.target;

  if (el.dataset.field) {
    rule[el.dataset.field] = el.type === 'checkbox' ? el.checked : el.value;
    card.classList.toggle('disabled', !rule.enabled);
    save();
  } else if (el.dataset.hfield) {
    const row = el.closest('.header-row');
    const header = rule.headers.find((h) => h.id === row.dataset.id);
    header[el.dataset.hfield] = el.type === 'checkbox' ? el.checked : el.value;
    refreshHeaderRow(row, header);
    save();
  }
  refreshStatus(card, rule);
}

function onRuleClick(e, rule, card) {
  const btn = e.target.closest('button');
  if (!btn) return;
  const index = config.rules.indexOf(rule);

  switch (btn.dataset.action) {
    case 'up':
    case 'down': {
      const to = index + (btn.dataset.action === 'up' ? -1 : 1);
      if (to < 0 || to >= config.rules.length) return;
      config.rules.splice(index, 1);
      config.rules.splice(to, 0, rule);
      save();
      render();
      rulesEl.children[to].querySelector(`[data-action="${btn.dataset.action}"]`).focus();
      return;
    }
    case 'duplicate': {
      const copy = structuredClone(rule);
      copy.id = newId();
      copy.name = `${rule.name} (copy)`;
      copy.headers.forEach((h) => (h.id = newId()));
      config.rules.splice(index + 1, 0, copy);
      save();
      render();
      focusRule(copy.id);
      return;
    }
    case 'delete':
      if (!confirm(`Delete rule "${rule.name || 'Untitled'}"?`)) return;
      config.rules.splice(index, 1);
      save();
      render();
      return;
    case 'add-header': {
      const header = newHeader();
      rule.headers.push(header);
      const row = renderHeader(header);
      $('[data-role="headers"]', card).append(row);
      $('[data-hfield="name"]', row).focus();
      save();
      refreshStatus(card, rule);
      return;
    }
  }

  const row = btn.closest('.header-row');
  if (!row) return;
  const header = rule.headers.find((h) => h.id === row.dataset.id);
  if (btn.dataset.haction === 'reveal') {
    const masked = $('[data-hfield="value"]', row).classList.contains('masked');
    visibility.set(header.id, masked ? 'shown' : 'hidden');
    refreshHeaderRow(row, header);
  } else if (btn.dataset.haction === 'delete') {
    rule.headers.splice(rule.headers.indexOf(header), 1);
    row.remove();
    save();
    refreshStatus(card, rule);
  }
}

function focusRule(id) {
  const card = rulesEl.querySelector(`[data-id="${CSS.escape(id)}"]`);
  card?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  $('[data-field="name"]', card)?.select();
}

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function addRule(host) {
  const rule = newRule({ headers: [newHeader({ name: 'Authorization' })] });
  if (host) Object.assign(rule, { name: host, pattern: `^${escapeRegex(host)}$` });
  config.rules.push(rule);
  save();
  render();
  focusRule(rule.id);
}

$('#add-rule-btn').addEventListener('click', () => addRule());
$('#empty-add-btn').addEventListener('click', () => addRule());

$('#global-enabled').addEventListener('change', (e) => {
  config.enabled = e.target.checked;
  save();
  render();
});

$('#export-btn').addEventListener('click', () => {
  const data = JSON.stringify({ format: 'header-injector', version: 1, ...config }, null, 2);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
  a.download = `header-injector-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
});

$('#import-btn').addEventListener('click', () => $('#import-file').click());
$('#import-file').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const imported = normalizeConfig(JSON.parse(await file.text()));
    // Fresh ids so importing the same file twice never produces duplicates.
    for (const rule of imported.rules) {
      rule.id = newId();
      rule.headers.forEach((h) => (h.id = newId()));
    }
    config.rules.push(...imported.rules);
    save();
    render();
    setSaveState(`Imported ${imported.rules.length} rule(s)`);
  } catch (err) {
    alert(`Import failed: ${err.message}`);
  }
});

// ---------------------------------------------------------------------------

[config, status] = await Promise.all([loadConfig(), loadStatus()]);
render();

// The popup links here with #new or #new=<hostname> to jump straight to a new rule.
const newMatch = location.hash.match(/^#new(?:=(.+))?$/);
if (newMatch) {
  history.replaceState(null, '', location.pathname);
  addRule(newMatch[1] && decodeURIComponent(newMatch[1]));
}
