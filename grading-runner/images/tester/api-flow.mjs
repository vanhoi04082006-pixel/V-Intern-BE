import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

async function boundedJson(response) {
  const chunks = []; let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > 262144) { await response.body.cancel().catch(() => {}); throw Error('API response exceeds limit'); }
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
function field(value, path) {
  if (typeof path !== 'string' || path.length > 200) throw Error('Invalid capture field');
  for (const key of path.split('.')) {
    if (!value || typeof value !== 'object' || !Object.hasOwn(value, key) || ['__proto__', 'prototype', 'constructor'].includes(key)) throw Error('Missing response field');
    value = value[key];
  }
  return value;
}
export async function runApiFlow(check, target) {
  if (!Array.isArray(check.steps) || !check.steps.length || check.steps.length > 20) throw Error('Invalid API flow');
  const variables = new Map([['nonce', randomUUID()]]);
  function substitute(value, url = false) {
    if (typeof value === 'string') {
      const variable = /^\{\{([A-Za-z][A-Za-z0-9_]{0,40})\}\}$/.exec(value);
      if (variable && !url) { if (!variables.has(variable[1])) throw Error('Missing captured variable'); return variables.get(variable[1]); }
      return value.replace(/\{\{([A-Za-z][A-Za-z0-9_]{0,40})\}\}/g, (_, key) => {
        if (!variables.has(key)) throw Error('Missing captured variable');
        return url ? encodeURIComponent(variables.get(key)) : String(variables.get(key));
      });
    }
    if (Array.isArray(value)) return value.map(v => substitute(v));
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, v]) => [key, substitute(v)]));
    return value;
  }
  for (const step of check.steps) {
    if (!step || typeof step.path !== 'string' || !Number.isInteger(step.status) || !['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(step.method ?? 'GET')) throw Error('Invalid API step');
    const response = await fetch(target(substitute(step.path, true)), {
      method: step.method ?? 'GET', redirect: 'error', signal: AbortSignal.timeout(3000),
      headers: { 'Content-Type': 'application/json', ...(step.bearer ? { Authorization: 'Bearer ' + substitute(step.bearer) } : {}) },
      ...(step.body === undefined ? {} : { body: JSON.stringify(substitute(step.body)) }),
    });
    try {
      assert.equal(response.status, step.status);
      if (step.capture || step.jsonIncludes || step.jsonAbsent) {
        const json = await boundedJson(response);
        for (const [key, expected] of Object.entries(step.jsonIncludes ?? {})) assert.deepEqual(field(json, key), substitute(expected));
        for (const key of step.jsonAbsent ?? []) assert.equal(Object.hasOwn(json, key), false);
        for (const [name, source] of Object.entries(step.capture ?? {})) {
          if (!/^[A-Za-z][A-Za-z0-9_]{0,40}$/.test(name) || name === 'nonce') throw Error('Invalid capture name');
          const value = field(json, source);
          if (!(typeof value === 'string' && value.length <= 4000 || typeof value === 'number' && Number.isFinite(value) || typeof value === 'boolean')) throw Error('Capture must be a bounded primitive');
          variables.set(name, value);
        }
      }
    } finally { await response.body?.cancel().catch(() => {}); }
  }
}
