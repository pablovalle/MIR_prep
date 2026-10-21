import { gradeExam } from './core.js';
import { ACCOUNT_USERNAME, isAllowedAccount, loginEmail } from './access.js';

const SESSION_KEY = 'mirprep.auth.v1';
const DEMO_KEY = 'mirprep.demo.v1';
const DEMO_SESSION_KEY = 'mirprep.demo-session.v1';
let config;
let session;
let refreshPromise;
let isDemo = false;

function storageGet(storage, key) {
  try { return JSON.parse(storage.getItem(key) || 'null'); } catch { return null; }
}
function setSession(value) {
  if (value) sessionStorage.setItem(SESSION_KEY, JSON.stringify(value));
  else sessionStorage.removeItem(SESSION_KEY);
  session = value;
}
function acceptSession(value) {
  setSession({ ...value, expires_at: value.expires_at || Math.floor(Date.now() / 1000) + value.expires_in });
  return session;
}
const errors = {
  AUTH_REQUIRED: 'Tu sesión ha caducado. Guarda esta pestaña abierta y vuelve a iniciar sesión.',
  VERSION_CONFLICT: 'Este intento ha cambiado en otra pestaña o dispositivo. No se han sobrescrito sus datos. Recarga para recuperar la última versión guardada.',
  ALREADY_SUBMITTED: 'Este examen ya se ha entregado. Recarga para ver su informe.',
  EXAM_NOT_FOUND: 'El examen todavía no está cargado en la base de datos. Contacta con la administración.',
  ATTEMPT_NOT_FOUND: 'No se encuentra este intento en tu cuenta.',
  UNRESOLVED_QUESTIONS: 'Resuelve todas las preguntas o márcalas expresamente en blanco antes de entregar.',
  invalid_credentials: 'El usuario o la contraseña no son correctos.',
  ACCESS_DENIED: 'Esta cuenta no tiene acceso a MIR_Prep.',
  email_not_confirmed: 'Confirma tu correo electrónico antes de entrar.',
  over_email_send_rate_limit: 'Se han enviado demasiados correos. Espera unos minutos antes de volver a intentarlo.',
  signup_disabled: 'El registro está cerrado. Solicita tu cuenta a la administración.'
};
async function rawRequest(path, { method = 'GET', body, auth = true, single = false } = {}) {
  const headers = { apikey: config.supabasePublishableKey, 'Content-Type': 'application/json' };
  if (single) headers.Accept = 'application/vnd.pgrst.object+json';
  if (auth && session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
  let response;
  try {
    response = await fetch(config.supabaseUrl + path, {
      method, headers, body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(15000), cache: 'no-store'
    });
  } catch {
    throw new Error('No se pudo conectar. Comprueba tu conexión; conserva esta pestaña para reintentar el guardado.');
  }
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const code = data?.error_code || data?.message || data?.error;
    const error = new Error(errors[code] || (response.status === 401 ? errors.AUTH_REQUIRED : 'No se pudo completar la operación. Revisa la conexión y la configuración de Supabase.'));
    error.code = code;
    throw error;
  }
  return data;
}
async function ensureSession() {
  if (!session) throw new Error(errors.AUTH_REQUIRED);
  if (session.expires_at > Date.now() / 1000 + 60) return;
  if (!refreshPromise) {
    refreshPromise = rawRequest('/auth/v1/token?grant_type=refresh_token', {
      method: 'POST', body: { refresh_token: session.refresh_token }, auth: false
    }).then(acceptSession).finally(() => { refreshPromise = null; });
  }
  await refreshPromise;
}
async function request(path, options) { await ensureSession(); return rawRequest(path, options); }
async function rpc(name, body) {
  const data = await request(`/rest/v1/rpc/${name}`, { method: 'POST', body, single: true });
  // Composite PostgreSQL return types are table-valued in PostgREST.
  const row = Array.isArray(data) ? data.length === 1 ? data[0] : null : data;
  if (!row || typeof row !== 'object') throw new Error('La base de datos no ha devuelto un intento. Revisa las funciones de Supabase.');
  return row;
}

function demoData() {
  return storageGet(localStorage, DEMO_KEY) || { profile: { display_name: 'Estudiante', target_date: null, specialty_goal: '' }, attempts: [] };
}
function persistDemo(data) {
  try { localStorage.setItem(DEMO_KEY, JSON.stringify(data)); }
  catch { throw new Error('El navegador no permite guardar la demo o su almacenamiento está lleno. Habilita el almacenamiento local para continuar.'); }
}
function demoUpdate(id, update) {
  const data = demoData();
  const index = data.attempts.findIndex(a => a.id === id);
  if (index < 0) throw new Error(errors.ATTEMPT_NOT_FOUND);
  const next = update(data.attempts[index]);
  data.attempts[index] = next;
  persistDemo(data);
  return structuredClone(next);
}
export async function loadJSON(path) {
  const response = await fetch(path, { cache: 'no-cache' });
  if (!response.ok) throw new Error('No se ha podido cargar el contenido. Inténtalo de nuevo.');
  return response.json();
}

export const api = {
  async init() {
    config = await loadJSON('./config.json');
    session = storageGet(sessionStorage, SESSION_KEY);
    // Supabase email verification/recovery uses the implicit fragment flow.
    const params = new URLSearchParams(location.hash.slice(1));
    let recovery = false;
    if (params.has('error_description')) {
      history.replaceState(null, '', location.pathname + location.search);
      throw new Error('El enlace ha caducado o no es válido. Solicita un nuevo enlace de recuperación.');
    }
    if (params.has('access_token') && params.has('refresh_token') && config.supabaseUrl) {
      recovery = params.get('type') === 'recovery';
      acceptSession({ access_token: params.get('access_token'), refresh_token: params.get('refresh_token'), expires_in: Number(params.get('expires_in')) || 3600 });
      history.replaceState(null, '', location.pathname + location.search + (recovery ? '#/new-password' : '#/dashboard'));
    }
    if (session && !config.supabaseUrl) setSession(null);
    if (session) {
      try {
        await ensureSession();
        session.user = await request('/auth/v1/user');
        if (isAllowedAccount(session.user)) setSession(session);
        else setSession(null);
      } catch (error) {
        if (error.code === 'refresh_token_not_found' || error.code === 'refresh_token_already_used' || error.code === 'bad_jwt' || error.code === 'session_not_found') setSession(null);
        else throw error;
      }
    }
    if (config.supabaseUrl) sessionStorage.removeItem(DEMO_SESSION_KEY);
    isDemo = !config.supabaseUrl && !session && sessionStorage.getItem(DEMO_SESSION_KEY) === 'true';
    return { configured: Boolean(config.supabaseUrl), allowSignup: false, user: api.user || null, recovery };
  },
  get demo() { return isDemo; },
  get user() { return isDemo ? { id: 'demo', email: 'Demo local · sin cuenta' } : session?.user; },
  get username() { return isDemo ? 'Demo local' : ACCOUNT_USERNAME; },
  enterDemo() {
    if (config.supabaseUrl) throw new Error('Accede con tu cuenta para continuar.');
    persistDemo(demoData()); sessionStorage.setItem(DEMO_SESSION_KEY, 'true'); isDemo = true;
  },
  async login(username, password) {
    const email = loginEmail(username);
    const data = await rawRequest('/auth/v1/token?grant_type=password', { method: 'POST', body: { email, password }, auth: false });
    if (!isAllowedAccount(data.user)) throw new Error(errors.ACCESS_DENIED);
    acceptSession(data);
    sessionStorage.removeItem(DEMO_SESSION_KEY);
    isDemo = false;
    return data.user;
  },
  signup() { throw new Error(errors.signup_disabled); },
  updatePassword(password) { return request('/auth/v1/user', { method: 'PUT', body: { password } }); },
  async logout() {
    if (!isDemo && session) await request('/auth/v1/logout', { method: 'POST' });
    isDemo = false;
    setSession(null);
    sessionStorage.removeItem(DEMO_SESSION_KEY);
  },
  async profile() {
    if (isDemo) return structuredClone(demoData().profile);
    const rows = await request(`/rest/v1/profiles?id=eq.${encodeURIComponent(session.user.id)}&select=*`);
    if (!rows?.length) throw new Error('Falta tu perfil. Comprueba que se ha instalado el esquema de Supabase.');
    return rows[0];
  },
  async saveProfile(profile) {
    if (isDemo) { const data = demoData(); data.profile = profile; persistDemo(data); return; }
    await request(`/rest/v1/profiles?id=eq.${encodeURIComponent(session.user.id)}`, { method: 'PATCH', body: profile });
  },
  async attempts() {
    if (isDemo) return structuredClone(demoData().attempts).sort((a, b) => b.updated_at.localeCompare(a.updated_at));
    // Paginate explicitly so the default PostgREST row cap cannot silently truncate history.
    const rows = [];
    for (let offset = 0; ; offset += 100) {
      const page = await request(`/rest/v1/attempts?select=*&order=updated_at.desc,id.desc&limit=100&offset=${offset}`);
      rows.push(...page);
      if (page.length < 100) return rows;
    }
  },
  async start(exam) {
    if (!isDemo) return rpc('start_exam', { p_exam_id: exam.id });
    if (!exam.isDemo) throw new Error('Para practicar exámenes reales, accede con tu cuenta.');
    const data = demoData();
    let attempt = data.attempts.find(a => a.exam_id === exam.id && a.status === 'in_progress');
    if (!attempt) {
      attempt = { id: crypto.randomUUID(), user_id: 'demo', exam_id: exam.id, exam: structuredClone(exam), status: 'in_progress', answers: {}, flagged: [], current_index: 0, elapsed_seconds: 0, version: 1, result: null, started_at: new Date().toISOString(), updated_at: new Date().toISOString(), submitted_at: null };
      data.attempts.unshift(attempt);
      persistDemo(data);
    }
    return structuredClone(attempt);
  },
  async save(attempt) {
    if (!isDemo) return rpc('save_attempt', {
      p_attempt_id: attempt.id, p_answers: attempt.answers, p_flagged: attempt.flagged,
      p_current_index: attempt.current_index, p_elapsed_seconds: attempt.elapsed_seconds, p_version: attempt.version
    });
    return demoUpdate(attempt.id, stored => {
      if (stored.status !== 'in_progress') throw new Error(errors.ALREADY_SUBMITTED);
      if (stored.version !== attempt.version) throw new Error(errors.VERSION_CONFLICT);
      return { ...structuredClone(attempt), version: stored.version + 1, updated_at: new Date().toISOString() };
    });
  },
  async submit(attempt) {
    if (!isDemo) return rpc('submit_attempt', { p_attempt_id: attempt.id, p_version: attempt.version });
    const solutions = await loadJSON(`./MIR/${encodeURIComponent(attempt.exam_id)}/demo-solutions.json`);
    return demoUpdate(attempt.id, stored => {
      if (stored.status === 'submitted') return stored;
      if (stored.version !== attempt.version) throw new Error(errors.VERSION_CONFLICT);
      const now = new Date().toISOString();
      return { ...stored, result: gradeExam(stored.exam, stored.answers, solutions), status: 'submitted', version: stored.version + 1, updated_at: now, submitted_at: now };
    });
  },
  clearDemo() { localStorage.removeItem(DEMO_KEY); }
};
