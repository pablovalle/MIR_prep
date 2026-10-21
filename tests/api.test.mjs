import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { webcrypto } from 'node:crypto';
import { ACCOUNT_EMAIL, ACCOUNT_USERNAME } from '../src/access.js';

class MemoryStorage {
  values = new Map();
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, value); }
  removeItem(key) { this.values.delete(key); }
}
globalThis.localStorage = new MemoryStorage();
globalThis.sessionStorage = new MemoryStorage();
globalThis.location = { hash: '', origin: 'https://example.test', pathname: '/MIR_prep/' };
globalThis.history = { replaceState() {} };
if (!globalThis.crypto) globalThis.crypto = webcrypto;
const exam = JSON.parse(await readFile(new URL('../MIR/demo/exam.json', import.meta.url), 'utf8'));
const solutions = Object.fromEntries(exam.questions.map(q => [q.id, { correctOptionId: q.correctOptionId, explanation: q.explanation }]));
let configured = false;
let calls = [];
let handler;
globalThis.fetch = async (url, options = {}) => {
  calls.push({ url, options });
  if (url === './config.json') return Response.json({ supabaseUrl: configured ? 'https://test.supabase.co' : '', supabasePublishableKey: configured ? 'sb_publishable_test' : '', allowSignup: true });
  if (url.endsWith('/demo-solutions.json')) return Response.json(solutions);
  return handler ? handler(url, options) : new Response(null, { status: 404 });
};
const { api } = await import('../src/api.js');

test('demo saves, resumes, checks versions, grades immutably and survives reinitialization', async () => {
  assert.equal((await api.init()).configured, false);
  api.enterDemo();
  const attempt = await api.start(exam);
  attempt.answers = { q1: 'a', q2: 'b', q3: 'a', q4: null };
  attempt.flagged = ['q3'];
  attempt.current_index = 2;
  attempt.elapsed_seconds = 91;
  const saved = await api.save(attempt);
  assert.equal(saved.version, 2);
  assert.equal((await api.start(exam)).current_index, 2);
  await assert.rejects(() => api.save(attempt), /otra pestaña/);
  assert.equal((await api.init()).user.id, 'demo');
  assert.equal((await api.attempts())[0].elapsed_seconds, 91);
  const submitted = await api.submit(saved);
  assert.equal(submitted.result.points, 5);
  assert.equal(submitted.status, 'submitted');
  await assert.rejects(() => api.save(saved), /entregado/);
  assert.equal((await api.submit(saved)).id, submitted.id);
  const second = await api.start(exam);
  assert.notEqual(second.id, submitted.id);
  assert.equal((await api.attempts()).length, 2);
});
test('demo cannot start non-demo exams or submit unresolved questions', async () => {
  await assert.rejects(() => api.start({ ...exam, isDemo: false }), /cuenta/);
  const attempt = await api.start(exam);
  await assert.rejects(() => api.submit(attempt), /pendientes/);
});
test('demo profile is persisted and isolated from auth sessions', async () => {
  await api.saveProfile({ display_name: 'Prueba', specialty_goal: 'Objetivo', target_date: null });
  assert.equal((await api.profile()).display_name, 'Prueba');
  await api.logout();
  assert.equal(api.demo, false);
  assert.equal(sessionStorage.getItem('mirprep.demo-session.v1'), null);
  assert.equal((await api.init()).user, null);
});
test('auth login, protected requests and save RPC use bearer tokens without exposing passwords to profile tables', async () => {
  configured = true;
  await api.init();
  calls = [];
  handler = (url) => {
    if (url.includes('grant_type=password')) return Response.json({ access_token: 'access', refresh_token: 'refresh', expires_in: 3600, user: { id: 'user-1', email: ACCOUNT_EMAIL } });
    if (url.includes('/rest/v1/rpc/save_attempt')) return Response.json({ version: 2 });
    if (url.includes('/rest/v1/profiles')) return Response.json([{ id: 'user-1', display_name: 'Prueba' }]);
    return new Response(null, { status: 204 });
  };
  await api.login(ACCOUNT_USERNAME, 'not-a-real-password');
  await api.profile();
  const attempt = { id: 'attempt-1', answers: { q1: 'a' }, flagged: [], current_index: 0, elapsed_seconds: 3, version: 1 };
  await api.save(attempt);
  const profileCall = calls.find(c => c.url.includes('/rest/v1/profiles'));
  assert.equal(profileCall.options.headers.Authorization, 'Bearer access');
  assert.equal(profileCall.options.body, undefined);
  const rpcCall = calls.find(c => c.url.includes('/rpc/save_attempt'));
  assert.equal(rpcCall.options.headers.Accept, 'application/vnd.pgrst.object+json');
  assert.equal(JSON.parse(rpcCall.options.body).p_version, 1);
  assert.equal(calls.filter(c => c.options.body?.includes('not-a-real-password')).length, 1);
  assert.equal(JSON.parse(calls.find(c => c.url.includes('grant_type=password')).options.body).email, ACCOUNT_EMAIL);
});
test('other usernames are rejected before any request or session change', async () => {
  const before = calls.length;
  await assert.rejects(() => api.login('another-user', 'test-only'), /usuario o la contraseña/);
  assert.equal(calls.length, before);
  assert.equal(api.user.email, ACCOUNT_EMAIL);
});
test('configured private installations never allow demo access', () => {
  assert.throws(() => api.enterDemo(), /Accede con tu cuenta/);
});
test('normalizes a single table-valued RPC row and rejects an empty response', async () => {
  handler = () => Response.json([{ id: 'attempt-1', version: 2 }]);
  assert.equal((await api.save({ id: 'attempt-1', answers: {}, flagged: [], current_index: 0, elapsed_seconds: 0, version: 1 })).version, 2);
  handler = () => Response.json([]);
  await assert.rejects(() => api.start(exam), /no ha devuelto un intento/);
});
test('server version conflict has an actionable error and no automatic overwrite', async () => {
  handler = () => Response.json({ message: 'VERSION_CONFLICT' }, { status: 400 });
  const before = calls.length;
  await assert.rejects(() => api.save({ id: 'attempt-1', answers: {}, flagged: [], current_index: 0, elapsed_seconds: 0, version: 1 }), /No se han sobrescrito/);
  assert.equal(calls.length - before, 1);
});
test('closed signup is enforced by the client adapter', async () => {
  assert.throws(() => api.signup('a@example.test', 'example-password', 'Example'), /cerrado/);
});
test('expired sessions refresh once for concurrent requests', async () => {
  const stored = JSON.parse(sessionStorage.getItem('mirprep.auth.v1'));
  stored.expires_at = 1;
  sessionStorage.setItem('mirprep.auth.v1', JSON.stringify(stored));
  let refreshes = 0;
  handler = (url) => {
    if (url.includes('grant_type=refresh_token')) { refreshes++; return Response.json({ access_token: 'refreshed', refresh_token: 'rotated', expires_in: 3600, user: { id: 'user-1', email: ACCOUNT_EMAIL } }); }
    if (url.endsWith('/auth/v1/user')) return Response.json({ id: 'user-1', email: ACCOUNT_EMAIL });
    if (url.includes('/profiles')) return Response.json([{ id: 'user-1' }]);
    return Response.json([]);
  };
  await api.init();
  await Promise.all([api.profile(), api.attempts()]);
  assert.equal(refreshes, 1);
  assert.equal(JSON.parse(sessionStorage.getItem('mirprep.auth.v1')).access_token, 'refreshed');
});
test('an old account session is cleared and registration stays closed even if config requests it', async () => {
  handler = () => Response.json({ id: 'old-user', email: 'previous@example.test' });
  const auth = await api.init();
  assert.equal(auth.user, null);
  assert.equal(auth.allowSignup, false);
  assert.equal(sessionStorage.getItem('mirprep.auth.v1'), null);
});
