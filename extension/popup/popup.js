import { CONFIG_KEY, STATUS_KEY, loadConfig, loadStatus, saveConfig } from '../lib/config.js';
import { compileHostPattern } from '../lib/pattern.js';

const $ = (sel, root = document) => root.querySelector(sel);

let config;
let status;
let tabUrl = null;

function matchesTab(rule) {
  if (!tabUrl) return false;
  try {
    return compileHostPattern(rule.pattern)(tabUrl);
  } catch {
    return false;
  }
}

function render() {
  $('#global-enabled').checked = config.enabled;

  // Rules matching the current tab first, then the rest in priority order.
  const rules = [...config.rules].sort((a, b) => matchesTab(b) - matchesTab(a));
  $('#rules').replaceChildren(
    ...rules.map((rule) => {
      const li = $('#rule-tpl').content.firstElementChild.cloneNode(true);
      const toggle = $('input', li);
      toggle.checked = rule.enabled;
      toggle.addEventListener('change', () => {
        rule.enabled = toggle.checked;
        saveConfig(config);
      });

      const headers = rule.headers.filter((h) => h.enabled && h.name.trim());
      $('.rule-name', li).textContent = rule.name || 'Untitled';
      $('.rule-meta', li).textContent = headers.length
        ? headers.map((h) => (h.operation === 'remove' ? `−${h.name}` : h.name)).join(', ')
        : 'no headers';
      $('.rule-meta', li).title = rule.pattern;

      const pill = $('.pill', li);
      if (status.errors?.[rule.id]) {
        pill.textContent = 'Error';
        pill.className = 'pill error';
        pill.title = status.errors[rule.id];
      } else if (matchesTab(rule)) {
        pill.textContent = 'This site';
        pill.className = `pill ${rule.enabled && config.enabled ? 'ok' : ''}`;
      } else {
        pill.hidden = true;
      }

      li.classList.toggle('paused', !config.enabled);
      return li;
    }),
  );
  $('#empty').hidden = config.rules.length > 0;
}

function openOptions(hash = '') {
  chrome.tabs.create({ url: chrome.runtime.getURL(`options/options.html${hash}`) });
  window.close();
}

$('#global-enabled').addEventListener('change', (e) => {
  config.enabled = e.target.checked;
  saveConfig(config);
  render();
});
$('#settings-btn').addEventListener('click', () => openOptions());

chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area !== 'local' || !(CONFIG_KEY in changes || STATUS_KEY in changes)) return;
  [config, status] = await Promise.all([loadConfig(), loadStatus()]);
  render();
});

const [[tab], cfg, st] = await Promise.all([
  chrome.tabs.query({ active: true, currentWindow: true }),
  loadConfig(),
  loadStatus(),
]);
config = cfg;
status = st;

if (tab?.url && /^(https?|wss?):/.test(tab.url)) {
  tabUrl = tab.url;
  const host = new URL(tab.url).hostname;
  $('#site-host').textContent = host;
  const addBtn = $('#add-site-btn');
  addBtn.hidden = false;
  addBtn.addEventListener('click', () => openOptions(`#new=${encodeURIComponent(host)}`));
} else {
  $('#site-host').textContent = 'Not a web page';
}

render();
