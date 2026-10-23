import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeConfig } from '../extension/lib/config.js';
import { ALL_RESOURCE_TYPES, buildDnrRules } from '../extension/lib/rules.js';

const config = (rules, enabled = true) => normalizeConfig({ enabled, rules });

test('builds a modifyHeaders rule with request and response headers', () => {
  const { entries, errors } = buildDnrRules(
    config([
      {
        id: 'r1',
        name: 'API',
        pattern: '^api\\.example\\.com$',
        headers: [
          { name: 'Authorization', value: 'Bearer abc' },
          { name: 'X-Debug', operation: 'remove', value: 'ignored' },
          { name: 'Access-Control-Allow-Origin', target: 'response', value: '*' },
          { name: 'X-Off', enabled: false, value: '1' },
          { name: '   ', value: 'blank names are skipped' },
        ],
      },
    ]),
  );

  assert.deepEqual(errors, {});
  assert.equal(entries.length, 1);
  const { ruleId, dnr } = entries[0];
  assert.equal(ruleId, 'r1');
  assert.equal(dnr.id, 1);
  assert.deepEqual(dnr.action, {
    type: 'modifyHeaders',
    requestHeaders: [
      { header: 'authorization', operation: 'set', value: 'Bearer abc' },
      { header: 'x-debug', operation: 'remove' },
    ],
    responseHeaders: [{ header: 'access-control-allow-origin', operation: 'set', value: '*' }],
  });
  assert.deepEqual(dnr.condition.resourceTypes, ALL_RESOURCE_TYPES);
  assert.ok(dnr.condition.resourceTypes.includes('main_frame'));
});

test('rules higher in the list get a higher priority', () => {
  const h = [{ name: 'X-A', value: '1' }];
  const { entries } = buildDnrRules(
    config([
      { id: 'a', pattern: 'a', headers: h },
      { id: 'b', pattern: 'b', headers: h },
      { id: 'c', pattern: 'c', headers: h },
    ]),
  );
  assert.deepEqual(
    entries.map((e) => [e.ruleId, e.dnr.priority]),
    [
      ['a', 3],
      ['b', 2],
      ['c', 1],
    ],
  );
  assert.equal(new Set(entries.map((e) => e.dnr.id)).size, 3);
});

test('disabled rules, rules without headers and a paused config produce nothing', () => {
  const rules = [
    { id: 'off', enabled: false, pattern: 'a', headers: [{ name: 'X', value: '1' }] },
    { id: 'empty', pattern: 'a', headers: [] },
  ];
  assert.equal(buildDnrRules(config(rules)).entries.length, 0);
  assert.equal(buildDnrRules(config([{ id: 'x', pattern: 'a', headers: [{ name: 'X', value: '1' }] }], false)).entries.length, 0);
});

test('invalid pattern or header name is reported per rule', () => {
  const { entries, errors } = buildDnrRules(
    config([
      { id: 'bad-regex', pattern: '(oops', headers: [{ name: 'X', value: '1' }] },
      { id: 'bad-header', pattern: 'a', headers: [{ name: 'Bad Header', value: '1' }] },
      { id: 'ok', pattern: 'a', headers: [{ name: 'X', value: '1' }] },
    ]),
  );
  assert.deepEqual(Object.keys(errors).sort(), ['bad-header', 'bad-regex']);
  assert.deepEqual(entries.map((e) => e.ruleId), ['ok']);
});

test('normalizeConfig repairs untrusted input', () => {
  const cfg = normalizeConfig({ rules: [null, { headers: [{ target: 'nope', operation: 'drop', name: 3 }] }] });
  assert.equal(cfg.enabled, true);
  assert.equal(cfg.rules.length, 1);
  const [h] = cfg.rules[0].headers;
  assert.equal(h.target, 'request');
  assert.equal(h.operation, 'set');
  assert.equal(h.name, '');
  assert.ok(cfg.rules[0].id);
});
