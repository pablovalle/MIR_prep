// Integration of UI events and the real demo adapter with a small DOM test double.
// This does not replace visual testing in a browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { webcrypto } from 'node:crypto';

test('complete app journey: demo, autosave, pending questions, resume after reload, submit and review', async () => {
  class MemoryStorage {
    values = new Map();
    getItem(key) { return this.values.get(key) ?? null; }
    setItem(key, value) { this.values.set(key, value); }
    removeItem(key) { this.values.delete(key); }
  }
  globalThis.localStorage = new MemoryStorage();
  globalThis.sessionStorage = new MemoryStorage();
  if (!globalThis.crypto) globalThis.crypto = webcrypto;
  const root = { innerHTML: '', listeners: {}, addEventListener(type, fn) { this.listeners[type] = fn; } };
  const toast = { hidden: true, textContent: '', className: '' };
  const modal = { open: false, innerHTML: '', showModal() { this.open = true; }, close() { this.open = false; } };
  const windowListeners = {};
  globalThis.window = { addEventListener(type, fn) { windowListeners[type] = fn; }, scrollTo() {} };
  globalThis.document = {
    activeElement: null, visibilityState: 'visible', title: '',
    addEventListener() {}, getElementById() { return null; },
    querySelector(selector) { return selector === '#app' ? root : selector === '#toast' ? toast : selector === '#confirm-dialog' ? modal : null; }
  };
  let hash = '';
  globalThis.location = {
    origin: 'http://127.0.0.1:4173', pathname: '/', search: '',
    get hash() { return hash; },
    set hash(value) { hash = value.startsWith('#') ? value : '#' + value; queueMicrotask(() => windowListeners.hashchange?.()); },
    replace(value) { this.hash = value; }
  };
  globalThis.history = { replaceState(_a, _b, value) { hash = value.includes('#') ? value.slice(value.indexOf('#')) : ''; } };
  let privateMode = false;
  globalThis.fetch = async path => {
    if (path === './config.json') return Response.json({ supabaseUrl: privateMode ? 'https://test.supabase.co' : '', supabasePublishableKey: privateMode ? 'sb_publishable_test' : '', allowSignup: true });
    try {
      const value = JSON.parse(await readFile(new URL('../dist/' + path.replace(/^\.\//, ''), import.meta.url), 'utf8'));
      return Response.json(value);
    } catch { return new Response(null, { status: 404 }); }
  };
  const originalInterval = globalThis.setInterval;
  // Record no recurring timers in a unit-test process; autosave timeouts still execute.
  globalThis.setInterval = () => 0;
  const waitFor = async predicate => {
    for (let i = 0; i < 200; i++) { if (predicate()) return; await new Promise(resolve => setTimeout(resolve, 10)); }
    assert.fail('Timed out waiting for application state. Last markup: ' + root.innerHTML.slice(0, 1000));
  };
  const click = (action, dataset = {}) => {
    const el = { dataset: { action, ...dataset }, disabled: false };
    return root.listeners.click({ target: { closest() { return el; } } });
  };
  const answer = (value, blank = false) => root.listeners.change({ target: { name: 'answer', value, dataset: { blank: String(blank) } } });
  const confirm = () => modal.onclick({ target: { closest() { return { dataset: { dialog: 'confirm' } }; } } });
  try {
    await import('../src/app.js?journey=first');
    await waitFor(() => root.innerHTML.includes('Qué bien verte de nuevo.'));
    await click('demo');
    assert.ok(root.innerHTML.includes('Hola, Estudiante'));
    await click('start', { id: 'demo-v1' });
    await waitFor(() => root.innerHTML.includes('Tu hoja de respuestas'));
    answer('a');
    await new Promise(resolve => setTimeout(resolve, 750));
    const { api } = await import('../src/api.js');
    assert.equal((await api.attempts())[0].answers.q1, 'a', 'autosave persists the selected answer');
    await click('flag');
    const pending = click('submit');
    await waitFor(() => modal.open);
    assert.ok(modal.innerHTML.includes('Te quedan preguntas por resolver'));
    confirm(); await pending;
    assert.ok(root.innerHTML.includes('PREGUNTA 2 DE 4'));
    answer('b');
    await click('save-exit');
    await waitFor(() => root.innerHTML.includes('Tu próximo entrenamiento.'));
    const saved = (await api.attempts())[0];
    assert.deepEqual(JSON.parse(JSON.stringify(saved.answers)), { q1: 'a', q2: 'b' });
    assert.deepEqual(JSON.parse(JSON.stringify(saved.flagged)), ['q1']);
    assert.equal(saved.current_index, 1);
    root.innerHTML = '';
    await import('../src/app.js?journey=reload');
    await waitFor(() => root.innerHTML.includes('Tu próximo entrenamiento.'));
    await click('start', { id: 'demo-v1' });
    assert.ok(root.innerHTML.includes('PREGUNTA 2 DE 4'), 'last question is restored after reload');
    await click('question-jump', { index: '2' }); answer('a');
    await click('question-jump', { index: '3' }); answer('', true);
    const submit = click('submit');
    await waitFor(() => modal.open);
    assert.ok(modal.innerHTML.includes('1 en blanco'));
    confirm(); await submit;
    await waitFor(() => root.innerHTML.includes('Un paso más en tu camino.'));
    const completed = (await api.attempts())[0];
    assert.equal(completed.result.points, 5);
    assert.equal(completed.result.net, 1.67);
    location.hash = '/review/' + completed.id;
    await waitFor(() => root.innerHTML.includes('Aprende de cada pregunta.'));
    assert.ok(root.innerHTML.includes('LA CLAVE ESTÁ EN ENTENDERLO'));
    await click('review-filter', { filter: 'incorrect' });
    assert.ok(root.innerHTML.includes('PREGUNTA 3'));
    assert.ok(!root.innerHTML.includes('PREGUNTA 1'));
    location.hash = '/history';
    await waitFor(() => root.innerHTML.includes('Tu esfuerzo tiene historia.'));
    assert.ok(root.innerHTML.includes('1,67'));
    await click('logout');
    await waitFor(() => root.innerHTML.includes('Qué bien verte de nuevo.'));
    assert.equal(api.demo, false);
    privateMode = true;
    root.innerHTML = '';
    await import('../src/app.js?journey=private');
    await waitFor(() => root.innerHTML.includes('Nombre de usuario'));
    assert.ok(root.innerHTML.includes('autocomplete="username"'));
    assert.ok(!root.innerHTML.includes('name="email"'));
    assert.ok(!root.innerHTML.includes('auth-signup'));
    assert.ok(!root.innerHTML.includes('Crea tu cuenta'));
    assert.ok(!root.innerHTML.includes('data-action="demo"'));
  } finally {
    globalThis.setInterval = originalInterval;
  }
});
