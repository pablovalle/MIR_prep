import { api, loadJSON } from './api.js';
import { activeQuestions, escapeHtml as e, formatDate, formatNumber as n, formatTime, hasAnswer, specialtyStats, unresolved } from './core.js';

const root = document.querySelector('#app');
const state = { ready: false, configured: false, user: null, profile: {}, catalog: [], attempts: [], active: null, route: '/login', search: '', catalogFilter: 'all', historyFilter: 'all', reviewFilter: 'all', mobileNav: false, loading: false };
let saveTimer;
let savePromise;
let changeVersion = 0;
let savedVersion = 0;
let timerStarted = 0;
let baseElapsed = 0;
let saveError = '';
let routeVersion = 0;
let toastTimer;
let busy = false;

const paths = {
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  book: '<path d="M4 4h6a3 3 0 0 1 3 3v14a4 4 0 0 0-4-2H4z"/><path d="M20 4h-4a3 3 0 0 0-3 3v14a4 4 0 0 1 4-2h3z"/>',
  chart: '<path d="M4 3v17h17M8 15v-4m5 4V7m5 8V4"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',
  arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
  chevron: '<path d="m9 5 7 7-7 7"/>',
  back: '<path d="m14 5-7 7 7 7"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  flag: '<path d="M5 21V3m0 1c4-4 9 4 14 0v10c-5 4-10-4-14 0"/>',
  logout: '<path d="M9 4H4v16h5m0-8h12m-5-5 5 5-5 5"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  spark: '<path d="m12 3 2.6 6.4L21 12l-6.4 2.6L12 21l-2.6-6.4L3 12l6.4-2.6z"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 6 9 7 9-7"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v1"/>',
  save: '<path d="M4 3h13l4 4v14H3V3zm3 0v7h10V3M7 21v-7h10v7"/>'
};
const icon = (name, cls = '') => `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.book}</svg>`;
const brand = () => `<span class="brand-mark">m.</span><span>MIR<span class="brand-light">_Prep</span></span>`;
const button = (label, action, extra = '', type = 'primary') => `<button class="btn btn-${type}" data-action="${action}" ${extra}>${label}</button>`;
const badge = (text, type = '') => `<span class="badge ${type}">${text}</span>`;
const finished = () => state.attempts.filter(a => a.status === 'submitted');
const drafts = () => state.attempts.filter(a => a.status === 'in_progress');
const heading = (eyebrow, title, description, action = '') => `<div class="page-heading"><div><div class="eyebrow">${eyebrow}</div><h1>${title}</h1><p>${description}</p></div>${action}</div>`;
const empty = (title, description, action = '') => `<div class="empty-state"><span class="empty-icon">${icon('book')}</span><h3>${title}</h3><p>${description}</p>${action}</div>`;

function notify(message, error = false) {
  const toast = document.querySelector('#toast');
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.className = `toast ${error ? 'toast-error' : ''}`;
  toast.hidden = false;
  toastTimer = setTimeout(() => { toast.hidden = true; }, error ? 10000 : 4500);
}

function dialog(title, body, confirmText = 'Continuar', danger = false) {
  return new Promise(resolve => {
    const el = document.querySelector('#confirm-dialog');
    el.innerHTML = `<button class="icon-button dialog-close" aria-label="Cerrar" data-dialog="cancel">${icon('close')}</button><div class="eyebrow">MIR_PREP</div><h2 id="dialog-title">${e(title)}</h2><div class="dialog-body">${body}</div><div class="dialog-actions"><button class="btn btn-ghost" data-dialog="cancel">Volver</button><button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-dialog="confirm">${e(confirmText)}</button></div>`;
    const finish = value => { el.close(); el.onclick = null; el.oncancel = null; resolve(value); };
    el.onclick = event => { const action = event.target.closest('[data-dialog]'); if (action) finish(action.dataset.dialog === 'confirm'); };
    el.oncancel = event => { event.preventDefault(); finish(false); };
    el.showModal();
  });
}

function authPage() {
  const newPassword = state.route === '/new-password';
  const view = newPassword ? 'new-password' : 'login';
  const title = newPassword ? 'Un nuevo comienzo.' : 'Qué bien verte de nuevo.';
  const description = newPassword ? 'Elige una nueva contraseña para tu cuenta.' : 'Cada sesión cuenta. Continúa tu camino hacia el MIR.';
  return `<main class="auth-layout">
    <section class="auth-story"><a href="#/login" class="brand">${brand()}</a><div class="story-content"><div class="eyebrow light"><span class="tiny-dot"></span> UN OBJETIVO. TU PROPIO CAMINO.</div><h1>Tu próxima plaza<br>empieza <em>aquí.</em></h1><p>Practica con intención. Entiende tus errores.<br>Ve más lejos, una pregunta a la vez.</p><div class="study-art" aria-hidden="true"><div class="art-orbit orbit-one"></div><div class="art-orbit orbit-two"></div><div class="art-circle"></div><div class="art-card card-back"><span class="art-mini-label">CONSTANCIA</span><div class="art-lines"></div><div class="art-lines short"></div><div class="art-mini-bars"><i></i><i></i><i></i><i></i><i></i></div></div><div class="art-card card-front"><span class="art-check">${icon('check')}</span><span>Cada pregunta,<br><strong>un paso más cerca.</strong></span></div><span class="art-star">✳</span><span class="art-label">TU FUTURO, EN PROGRESO</span></div><div class="story-features"><span>${icon('save')} Avanza a tu ritmo</span><span>${icon('chart')} Aprende de tus resultados</span></div></div><footer>Hecho para acompañar tu preparación.</footer></section>
    <section class="auth-form-section"><div class="auth-top">TU ESPACIO DE PREPARACIÓN MIR ${icon('spark')}</div><div class="auth-form-wrap"><span class="badge badge-green">${newPassword ? 'Nueva contraseña' : 'Bienvenido a MIR_Prep'}</span><h2>${title}</h2><p class="muted">${description}</p>
    ${!state.configured ? `<div class="notice">${icon('info')}<span>Las cuentas se activarán al conectar la plataforma. Mientras tanto, puedes explorar la demo.</span></div>` : ''}
    <form id="auth-form" data-view="${view}">
    ${!newPassword ? `<label for="username">Nombre de usuario</label><div class="input-icon">${icon('user')}<input id="username" name="username" type="text" autocomplete="username" autocapitalize="none" spellcheck="false" required placeholder="Tu usuario" maxlength="80" ${!state.configured ? 'disabled' : ''}></div>` : ''}
    <label for="password">${newPassword ? 'Nueva contraseña' : 'Contraseña'}</label><div class="input-icon">${icon('lock')}<input id="password" name="password" type="password" autocomplete="${newPassword ? 'new-password' : 'current-password'}" ${newPassword ? 'minlength="12"' : ''} maxlength="128" required placeholder="${newPassword ? 'Al menos 12 caracteres' : 'Tu contraseña'}" ${!state.configured ? 'disabled' : ''}><button type="button" class="password-toggle" data-action="toggle-password" aria-label="Mostrar contraseña">Ver</button></div>
    <p id="form-message" class="form-message" role="status" aria-live="polite"></p>
    <button type="submit" class="btn btn-primary full" ${!state.configured ? 'disabled' : ''}>${newPassword ? 'Guardar contraseña' : 'Entrar en mi espacio'} ${icon('arrow')}</button></form>
    ${newPassword ? '<a class="text-link auth-return" href="#/profile">Volver a mi perfil</a>' : `<p class="signup-copy">Acceso privado · Tu espacio de preparación.</p>${!state.configured ? `<div class="divider"><span>CONOCE LA PLATAFORMA</span></div>${button('Explorar la demo ' + icon('arrow'), 'demo', '', 'secondary')}<p class="demo-hint">Sin registro. Datos guardados solo en este navegador.</p>` : ''}`}
    </div><footer class="auth-footer">${icon('lock')} Tu preparación tiene su propio espacio.</footer></section></main>`;
}

function shell(content) {
  const route = state.route.split('/')[1];
  const name = state.profile.display_name || 'Estudiante';
  const initials = name.trim().split(/\s+/).slice(0, 2).map(s => s[0]).join('').toUpperCase();
  const titles = { dashboard: 'Mi espacio', exams: 'Simulacros', history: 'Mi evolución', profile: 'Mi perfil', exam: 'Entrenamiento', result: 'Informe de resultados', review: 'Revisión del examen' };
  const nav = [['dashboard', 'grid', 'Mi espacio'], ['exams', 'book', 'Simulacros'], ['history', 'chart', 'Mi evolución'], ['profile', 'user', 'Mi perfil']];
  return `<div class="app-layout ${state.mobileNav ? 'nav-open' : ''}"><aside class="sidebar"><a href="#/dashboard" class="brand">${brand()}</a><div class="nav-label">TU PREPARACIÓN</div><nav aria-label="Navegación principal">${nav.map(([url, i, title]) => `<a href="#/${url}" class="nav-item ${route === url ? 'active' : ''}" ${route === url ? 'aria-current="page"' : ''}>${icon(i)}${title}${url === 'exams' && drafts().length ? `<span class="nav-count">${drafts().length}</span>` : ''}</a>`).join('')}</nav><div class="sidebar-note"><span class="sidebar-spark">${icon('spark')}</span><h3>Un paso cada día.</h3><p>La constancia también<br>se entrena.</p><div class="note-line"></div><span>ESTÁS CONSTRUYENDO TU CAMINO</span></div><div class="sidebar-bottom">${api.demo ? badge('Modo demo', 'badge-outline') : badge('Espacio personal', 'badge-outline')}<button class="nav-item logout-button" data-action="logout">${icon('logout')}${api.demo ? 'Salir de la demo' : 'Cerrar sesión'}</button><div class="sidebar-foot">MIR_PREP <span>ESTUDIA. AVANZA. REPITE.</span></div></div></aside><div class="sidebar-overlay" data-action="mobile-nav"></div><div class="workspace"><header class="topbar"><div class="topbar-left"><button class="icon-button mobile-menu" data-action="mobile-nav" aria-label="Abrir menú" aria-expanded="${state.mobileNav}">${icon('menu')}</button><span class="breadcrumb">Tu preparación <span>/</span> <strong>${titles[route] || 'Mi espacio'}</strong></span></div><div class="topbar-right">${api.demo ? '<span class="demo-indicator"><i></i> DEMO LOCAL</span>' : `<span class="topbar-date">${new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })}</span>`}<a href="#/profile" class="user-chip"><span class="avatar">${e(initials)}</span><span>${e(name)}</span></a></div></header>${api.demo ? '<div class="demo-banner">Estás explorando la demo. Tu progreso se guarda en este navegador; las cuentas reales permiten continuar en otros dispositivos.</div>' : ''}<main class="main-content" id="main-content">${content}</main><footer class="workspace-footer"><span>MIR_Prep · Una pregunta más cerca.</span><span>Tu espacio, tu ritmo.</span></footer></div></div>`;
}

function attemptRow(a) {
  const done = a.status === 'submitted';
  const count = activeQuestions(a.exam).length - unresolved(a).length;
  return `<tr><td><div class="table-exam"><span class="table-icon">${icon('book')}</span><div><strong>${e(a.exam.title)}</strong><span>${e(a.exam.category)} ${a.exam.isDemo ? '· Demo' : ''}</span></div></div></td><td>${formatDate(done ? a.submitted_at : a.updated_at)}</td><td>${done ? badge('Completado', 'badge-green') : badge('En progreso', 'badge-amber')}</td><td>${done ? `<strong class="score-text">${n(a.result.net, 2)}</strong><span class="muted small"> / ${a.result.total} netas</span>` : `<span class="small">${count} / ${activeQuestions(a.exam).length} resueltas</span>`}</td><td><a class="table-link" href="#/${done ? 'result' : 'exam'}/${a.id}">${done ? 'Ver informe' : 'Continuar'} ${icon('arrow')}</a></td></tr>`;
}
function attemptTable(attempts) {
  return `<div class="table-scroll"><table><thead><tr><th>SIMULACRO</th><th>FECHA</th><th>ESTADO</th><th>RESULTADO / PROGRESO</th><th><span class="sr-only">Acción</span></th></tr></thead><tbody>${attempts.map(attemptRow).join('')}</tbody></table></div>`;
}

function dashboard() {
  const completed = finished();
  const total = completed.reduce((sum, a) => sum + a.result.total, 0);
  const correct = completed.reduce((sum, a) => sum + a.result.correct, 0);
  const time = state.attempts.reduce((sum, a) => sum + a.elapsed_seconds, 0);
  const firstName = (state.profile.display_name || 'Estudiante').split(' ')[0];
  const resume = drafts()[0];
  return `${heading('TU PREPARACIÓN, DÍA A DÍA', `Hola, ${e(firstName)} <span class="greeting-dot">✳</span>`, 'Un nuevo día para acercarte a tu próxima plaza. Vamos paso a paso.')}
    <section class="dashboard-hero"><div class="hero-copy"><span class="eyebrow light">${resume ? 'CONTINÚA DONDE LO DEJASTE' : 'LA PRÁCTICA MARCA LA DIFERENCIA'}</span><h2>${resume ? 'Tu siguiente paso<br>ya está en marcha.' : 'Una pregunta más.<br>Un poco más cerca.'}</h2><p>${resume ? e(resume.exam.title) + ' · Tu progreso te está esperando.' : 'Convierte cada simulacro en una oportunidad<br class="desktop-break"> para aprender, mejorar y ganar confianza.'}</p><a class="btn btn-accent" href="#/${resume ? `exam/${resume.id}` : 'exams'}">${resume ? 'Retomar mi simulacro' : 'Elegir un simulacro'} ${icon('arrow')}</a></div><div class="hero-visual" aria-hidden="true"><div class="hero-orbit"></div><div class="hero-orbit orbit-small"></div><div class="hero-circle"><span>m.</span></div><div class="hero-float float-top">${icon('target')} <span>Un objetivo.<br><strong>Tu mejor versión.</strong></span></div><div class="hero-float float-bottom">${icon('check')} A tu ritmo, siempre.</div><span class="hero-star">✳</span></div></section>
    <section class="stats-grid" aria-label="Resumen de tu preparación">${[
      ['book', 'Simulacros completados', completed.length, 'Cada intento suma experiencia', 'green'],
      ['target', 'Porcentaje de acierto', total ? `${n(correct / total * 100)}<small>%</small>` : '—', total ? `${correct} aciertos de ${total} preguntas evaluadas` : 'Tu punto de partida está por llegar', 'purple'],
      ['check', 'Preguntas evaluadas', total, 'Aprende también de tus errores', 'amber'],
      ['clock', 'Tiempo de práctica', time ? `${Math.floor(time / 3600)}<small>h</small> ${Math.floor(time / 60) % 60}<small>min</small>` : '0<small>min</small>', 'Tiempo activo en tus simulacros', 'blue']
    ].map(([i, title, value, sub, color]) => `<article class="stat-card"><div class="stat-head"><span>${title}</span><span class="stat-icon ${color}">${icon(i)}</span></div><strong class="stat-value">${value}</strong><p>${sub}</p></article>`).join('')}</section>
    <div class="dashboard-columns"><section class="panel activity-panel"><div class="panel-heading"><div><h2>Tu actividad reciente</h2><p>Tu esfuerzo, pregunta a pregunta.</p></div><a class="text-link" href="#/history">Ver historial ${icon('arrow')}</a></div>${state.attempts.length ? attemptTable(state.attempts.slice(0, 4)) : empty('Aquí empieza tu recorrido', 'Cuando comiences un simulacro, podrás retomarlo y consultar aquí tus resultados.', '<a class="text-link" href="#/exams">Explorar simulacros ' + icon('arrow') + '</a>')}</section><aside class="panel goal-panel"><span class="goal-icon">${icon('target')}</span><span class="eyebrow">DALE DIRECCIÓN A TU ESFUERZO</span><h2>${state.profile.specialty_goal ? e(state.profile.specialty_goal) : 'Tu objetivo,<br>siempre presente.'}</h2><p>${state.profile.target_date ? `Fecha objetivo: ${formatDate(state.profile.target_date + 'T12:00:00')}. Cada sesión te ayuda a avanzar.` : 'Personaliza tu perfil y recuerda por qué has empezado este camino.'}</p><a class="text-link" href="#/profile">${state.profile.specialty_goal ? 'Editar mi objetivo' : 'Definir mi objetivo'} ${icon('arrow')}</a><div class="goal-decoration" aria-hidden="true">↗</div></aside></div>
    <div class="gentle-note">${icon('spark')} No necesitas hacerlo todo hoy. Solo seguir avanzando.</div>`;
}

function examCard(exam) {
  const draft = drafts().find(a => a.exam_id === exam.id);
  const completed = finished().filter(a => a.exam_id === exam.id).length;
  const progress = draft ? activeQuestions(draft.exam).length - unresolved(draft).length : 0;
  return `<article class="exam-card"><div class="exam-card-top"><span class="exam-card-icon">${icon(exam.isDemo ? 'spark' : 'book')}</span>${draft ? badge('En progreso', 'badge-amber') : exam.isDemo ? badge('Demo guiada', 'badge-green') : badge('Disponible')}</div><span class="eyebrow">${e(exam.category)}</span><h2>${e(exam.title)}</h2><p>${e(exam.description)}</p><div class="exam-metadata"><span>${icon('book')} ${exam.questionCount} preguntas</span><span>${icon('clock')} ${exam.durationMinutes} min orientativos</span></div><div class="exam-card-bottom">${draft ? `<div class="card-progress"><div><span>Tu progreso</span><strong>${progress} / ${exam.questionCount}</strong></div><progress max="${exam.questionCount}" value="${progress}"></progress></div>` : `<div class="exam-scoring"><span>+${exam.scoring.correct} acierto</span><span>${exam.scoring.incorrect} error</span><span>0 en blanco</span></div>`}${button(`${draft ? 'Continuar simulacro' : completed ? 'Volver a practicar' : 'Empezar simulacro'} ${icon('arrow')}`, 'start', `data-id="${e(exam.id)}" ${api.demo && !exam.isDemo ? 'disabled title="Accede con una cuenta para realizar este examen"' : ''}`, draft ? 'primary' : 'secondary')}${completed ? `<span class="attempt-count">${completed} ${completed === 1 ? 'intento completado' : 'intentos completados'}</span>` : ''}</div></article>`;
}
function catalog() {
  const filtered = state.catalog.filter(exam => (`${exam.title} ${exam.category} ${exam.description}`).toLocaleLowerCase('es').includes(state.search.toLocaleLowerCase('es')) && (state.catalogFilter !== 'drafts' || drafts().some(a => a.exam_id === exam.id)));
  return `${heading('PRACTICA CON INTENCIÓN', 'Tu próximo entrenamiento.', 'Elige un simulacro, concéntrate y avanza a tu ritmo.', badge(`${state.catalog.length} ${state.catalog.length === 1 ? 'simulacro disponible' : 'simulacros disponibles'}`, 'badge-green'))}<div class="catalog-toolbar"><div class="tabs" aria-label="Filtrar simulacros"><button data-action="catalog-filter" data-filter="all" class="tab ${state.catalogFilter === 'all' ? 'selected' : ''}" aria-pressed="${state.catalogFilter === 'all'}">Todos los simulacros</button><button data-action="catalog-filter" data-filter="drafts" class="tab ${state.catalogFilter === 'drafts' ? 'selected' : ''}" aria-pressed="${state.catalogFilter === 'drafts'}">En progreso <span>${drafts().length}</span></button></div><div class="input-icon search-input">${icon('search')}<input id="exam-search" type="search" placeholder="Buscar un simulacro…" aria-label="Buscar simulacro" value="${e(state.search)}"></div></div><div class="exam-grid">${filtered.map(examCard).join('')}</div>${filtered.length ? '' : empty('No hay simulacros en esta selección', 'Prueba otra búsqueda o vuelve a todos los simulacros.') }<div class="catalog-note">${icon('info')}<p>Los simulacros guardan tu progreso automáticamente. Puedes salir y continuar más adelante.${state.catalog.every(a => a.isDemo) ? '<br>De momento tienes disponible un entrenamiento de demostración. Los MIR se añadirán aquí cuando estén preparados.' : ''}</p></div>`;
}

function historyPage() {
  const completed = finished().slice().reverse();
  const filtered = state.attempts.filter(a => state.historyFilter === 'all' || a.status === state.historyFilter);
  const chart = completed.slice(-10);
  const values = chart.map(a => Math.max(-100, Math.min(100, a.result.net / a.result.total * 100)));
  const points = values.map((v, i) => `${40 + i * (620 / Math.max(1, values.length - 1))},${125 - v}`).join(' ');
  const last = completed.at(-1);
  return `${heading('EL PROGRESO SE CONSTRUYE', 'Tu esfuerzo tiene historia.', 'Consulta tus intentos, revisa tus errores y observa cómo avanzas.')}${completed.length ? `<section class="panel evolution-panel"><div class="panel-heading"><div><h2>La evolución de tus netas</h2><p>Netas sobre preguntas evaluables (%) · Últimos 10 intentos</p></div>${last ? `<span class="last-score">${n(last.result.net, 2)}<small> / ${last.result.total} netas en el último intento</small></span>` : ''}</div><div class="chart-wrap"><svg viewBox="0 0 700 260" role="img" aria-label="Evolución de tus últimos ${chart.length} intentos. ${values.map((v, i) => `Intento ${i + 1}: ${n(v)} por ciento de netas.`).join(' ')}"><path class="chart-grid" d="M35 25H675M35 75H675M35 125H675M35 175H675M35 225H675"/><text x="0" y="29" class="chart-label">100</text><text x="9" y="129" class="chart-label">0</text><text x="0" y="229" class="chart-label">−100</text><polyline points="${points}" class="chart-line"/>${values.map((v, i) => `<circle cx="${40 + i * (620 / Math.max(1, values.length - 1))}" cy="${125 - v}" r="5" class="chart-point"/><text x="${40 + i * (620 / Math.max(1, values.length - 1))}" y="253" text-anchor="middle" class="chart-label">${i + 1}</text>`).join('')}</svg></div><p class="small muted chart-footnote">Cada punto representa un intento. Diferentes longitudes y dificultades limitan la comparación; no es una estimación del puesto MIR.</p></section>` : ''}<section class="panel history-panel"><div class="panel-heading"><div><h2>Todos tus intentos</h2><p>Un registro de cada paso que has dado.</p></div><label class="sr-only" for="history-filter">Filtrar historial</label><select id="history-filter"><option value="all" ${state.historyFilter === 'all' ? 'selected' : ''}>Todos los estados</option><option value="submitted" ${state.historyFilter === 'submitted' ? 'selected' : ''}>Completados</option><option value="in_progress" ${state.historyFilter === 'in_progress' ? 'selected' : ''}>En progreso</option></select></div>${filtered.length ? attemptTable(filtered) : empty('Tu historia empieza con un intento', 'Aquí encontrarás tus simulacros guardados y tus informes de resultados.', '<a href="#/exams" class="btn btn-primary">Elegir un simulacro ' + icon('arrow') + '</a>')}</section>`;
}

function profilePage() {
  return `${heading('TU ESPACIO PERSONAL', 'Detrás de cada objetivo, estás tú.', 'Dale forma a tu perfil y a lo que quieres conseguir.')}<div class="profile-grid"><section class="panel profile-panel"><div class="panel-heading"><div><h2>Mis datos</h2><p>Solo tú puedes acceder a tu perfil y tus resultados.</p></div>${icon('user')}</div><form id="profile-form"><label for="profile-name">Nombre visible</label><input id="profile-name" name="display_name" value="${e(state.profile.display_name)}" required maxlength="80" autocomplete="given-name"><label for="profile-email">Usuario de acceso</label><input id="profile-email" value="${e(api.username)}" disabled><p class="field-hint">${api.demo ? 'La demo no crea una cuenta.' : 'Este usuario identifica tu espacio personal.'}</p><div class="form-row"><div><label for="profile-goal">Especialidad u objetivo</label><input id="profile-goal" name="specialty_goal" value="${e(state.profile.specialty_goal)}" maxlength="120" placeholder="Ese objetivo que te mueve"></div><div><label for="profile-date">Fecha objetivo</label><input id="profile-date" name="target_date" type="date" value="${e(state.profile.target_date || '')}"></div></div><p id="form-message" class="form-message" role="status"></p><button class="btn btn-primary" type="submit">Guardar mi perfil ${icon('check')}</button></form></section><div class="profile-side"><section class="panel privacy-panel"><span class="stat-icon green">${icon('lock')}</span><h2>Tu preparación es personal.</h2><p>${api.demo ? 'Los datos de esta demo se almacenan solo en el navegador. Al borrar sus datos también perderás el progreso de demostración.' : 'Tus intentos y tu perfil están vinculados a tu cuenta. Tu contraseña la gestiona el servicio de autenticación y no se guarda en este repositorio.'}</p>${button('Exportar mis datos ' + icon('download'), 'export-data', '', 'secondary')}${api.demo ? button('Borrar datos de la demo', 'clear-demo', '', 'ghost') : button('Cambiar mi contraseña', 'change-password', '', 'ghost')}</section><p class="profile-small">${icon('info')} ${api.demo ? 'Puedes probar toda la plataforma con el entrenamiento demo.' : 'Para recuperar el acceso, contacta con quien administra la plataforma.'}</p></div></div>`;
}

function elapsed() {
  return Math.min(31536000, baseElapsed + (timerStarted && document.visibilityState !== 'hidden' ? Math.floor((Date.now() - timerStarted) / 1000) : 0));
}
function captureTime() {
  if (!state.active || state.active.status !== 'in_progress') return;
  baseElapsed = elapsed();
  state.active.elapsed_seconds = baseElapsed;
  timerStarted = document.visibilityState === 'hidden' ? 0 : Date.now();
}
function saveStatus() {
  if (saveError) return `<span class="save-state error">${icon('info')} Sin guardar</span>`;
  return `<span class="save-state">${icon(changeVersion === savedVersion ? 'check' : 'save')} ${changeVersion === savedVersion ? api.demo ? 'Guardado en este navegador' : 'Progreso guardado' : 'Guardando…'}</span>`;
}
function questionImage(q) {
  // Image paths are checked during the build and only same-origin assets are accepted.
  if (!q.image || !q.image.startsWith('./MIR/')) return '';
  return `<figure class="question-image"><img src="${e(q.image)}" alt="${e(q.imageAlt)}" loading="lazy"></figure>`;
}
function examPage() {
  const a = state.active;
  const q = a.exam.questions[a.current_index];
  const count = activeQuestions(a.exam).length - unresolved(a).length;
  const has = hasAnswer(a.answers, q.id);
  return `<div class="exam-top"><a href="#/exams" class="text-link back-link">${icon('back')} Mis simulacros</a><div id="save-status">${saveStatus()}</div></div>${saveError ? `<div class="notice notice-error"><span>${e(saveError)}</span>${button('Reintentar guardado', 'save-retry', '', 'secondary')}${button('Recargar versión guardada', 'reload-attempt', '', 'ghost')}</div>` : ''}<div class="exam-title-line"><div><div class="eyebrow">${e(a.exam.category)} ${a.exam.isDemo ? '· DEMOSTRACIÓN' : ''}</div><h1>${e(a.exam.title)}</h1></div><div class="exam-timer">${icon('clock')}<span id="exam-time">${formatTime(elapsed())}</span><small>tiempo activo</small></div></div><div class="exam-overall-progress"><progress value="${count}" max="${activeQuestions(a.exam).length}"></progress><span>${count} de ${activeQuestions(a.exam).length} resueltas</span></div><div class="exam-layout"><section class="panel question-panel"><div class="question-top"><span class="eyebrow">PREGUNTA ${a.current_index + 1} DE ${a.exam.questions.length}</span>${badge(e(q.specialty))}</div>${q.voided ? '<div class="notice">Pregunta anulada: no se evalúa ni afecta a tu puntuación.</div>' : ''}<h2 class="question-statement" id="question-statement">${e(q.statement)}</h2>${questionImage(q)}<fieldset class="question-options" aria-labelledby="question-statement" ${q.voided ? 'disabled' : ''}><legend class="sr-only">Elige una respuesta o déjala en blanco</legend>${q.options.map((o, i) => `<label class="answer-option ${has && a.answers[q.id] === o.id ? 'chosen' : ''}" for="option-${i}"><input type="radio" id="option-${i}" name="answer" value="${e(o.id)}" ${has && a.answers[q.id] === o.id ? 'checked' : ''}><span class="option-letter">${String.fromCharCode(65 + i)}</span><span class="option-text">${e(o.text)}</span><span class="option-indicator">${icon('check')}</span></label>`).join('')}<label class="answer-option blank-option ${has && a.answers[q.id] === null ? 'chosen' : ''}" for="option-blank"><input type="radio" id="option-blank" name="answer" value="" data-blank="true" ${has && a.answers[q.id] === null ? 'checked' : ''}><span class="option-letter">—</span><span class="option-text">Dejar esta pregunta en blanco <small>0 puntos</small></span><span class="option-indicator">${icon('check')}</span></label></fieldset><div class="question-tools">${button(icon('flag') + (a.flagged.includes(q.id) ? ' Marcada para revisar' : ' Marcar para revisar'), 'flag', `aria-pressed="${a.flagged.includes(q.id)}"`, a.flagged.includes(q.id) ? 'amber' : 'ghost')}${has && !q.voided ? button('Borrar respuesta', 'clear-answer', '', 'ghost') : ''}</div><div class="question-navigation">${button(icon('back') + ' Anterior', 'question-prev', a.current_index === 0 ? 'disabled' : '', 'secondary')}<span>${a.current_index + 1} / ${a.exam.questions.length}</span>${a.current_index < a.exam.questions.length - 1 ? button('Siguiente ' + icon('arrow'), 'question-next') : button('Revisar y entregar ' + icon('check'), 'submit')}</div></section><aside class="exam-sidebar"><section class="panel question-map"><h2>Tu hoja de respuestas</h2><p>Salta a cualquier pregunta.</p><div class="question-grid">${a.exam.questions.map((item, i) => `<button class="question-number ${i === a.current_index ? 'current' : ''} ${item.voided ? 'voided' : hasAnswer(a.answers, item.id) ? a.answers[item.id] === null ? 'blank' : 'answered' : ''} ${a.flagged.includes(item.id) ? 'flagged' : ''}" data-action="question-jump" data-index="${i}" aria-label="Pregunta ${i + 1}${item.voided ? ', anulada' : !hasAnswer(a.answers, item.id) ? ', pendiente' : a.answers[item.id] === null ? ', en blanco' : ', respondida'}${a.flagged.includes(item.id) ? ', marcada' : ''}" ${i === a.current_index ? 'aria-current="step"' : ''}>${i + 1}</button>`).join('')}</div><div class="map-legend"><span><i class="legend-dot answered"></i>Respondida</span><span><i class="legend-dot"></i>Pendiente</span><span><i class="legend-dot blank"></i>En blanco</span><span><i class="legend-dot flagged"></i>Para revisar</span></div><div class="map-summary"><span>Pendientes <strong>${unresolved(a).length}</strong></span><span>Marcadas <strong>${a.flagged.length}</strong></span></div>${button('Entregar simulacro ' + icon('arrow'), 'submit', '', 'primary')}${button(icon('save') + ' Guardar y salir', 'save-exit', '', 'secondary')}</section><p class="exam-hint">${icon('info')} Duración orientativa: ${a.exam.durationMinutes} minutos. El tiempo registra tu práctica activa; no hay entrega automática.</p></aside></div>`;
}

function resultPage(a) {
  const r = a.result;
  const accuracy = r.total ? r.correct / r.total * 100 : 0;
  const stats = specialtyStats(a);
  return `${heading('CADA INTENTO, UN APRENDIZAJE', 'Un paso más en tu camino.', `${e(a.exam.title)} · ${formatDate(a.submitted_at)}`, button('Descargar informe ' + icon('download'), 'download-report', `data-id="${a.id}"`, 'secondary'))}<section class="result-hero"><div><span class="eyebrow light">TU RESULTADO</span><div class="result-big">${n(r.net, 2)}<span>/ ${r.total}</span></div><span class="result-unit">PREGUNTAS NETAS</span><p>${r.points} de ${r.maxPoints} puntos posibles · ${formatTime(a.elapsed_seconds)} de práctica</p><a class="btn btn-accent" href="#/review/${a.id}">Revisar mis respuestas ${icon('arrow')}</a></div><div class="result-breakdown"><div><span class="result-dot correct"></span><span>Aciertos</span><strong>${r.correct}</strong></div><div><span class="result-dot incorrect"></span><span>Errores</span><strong>${r.incorrect}</strong></div><div><span class="result-dot blank"></span><span>En blanco</span><strong>${r.blank}</strong></div>${r.voided ? `<div><span class="result-dot"></span><span>Anuladas</span><strong>${r.voided}</strong></div>` : ''}<div class="result-accuracy"><span>Porcentaje de acierto</span><strong>${n(accuracy)}%</strong></div></div></section><div class="result-columns"><section class="panel specialty-panel"><div class="panel-heading"><div><h2>Una mirada más de cerca</h2><p>Aciertos por área sobre preguntas evaluables.</p></div>${icon('chart')}</div>${stats.map(row => `<div class="specialty-row"><div><strong>${e(row.name)}</strong><span>${row.correct} / ${row.total} <small>(${n(row.correct / row.total * 100)}%)</small></span></div><progress max="${row.total}" value="${row.correct}"></progress></div>`).join('')}</section><section class="panel result-learning"><span class="stat-icon green">${icon('book')}</span><h2>El resultado es solo<br>el punto de partida.</h2><p>Entender por qué has fallado es parte del entrenamiento. Revisa cada explicación y vuelve a practicar cuando estés listo.</p><a class="text-link" href="#/review/${a.id}">Empezar la revisión ${icon('arrow')}</a></section></div><div class="notice result-method">${icon('info')}<span>Puntuación de este simulacro: +${a.exam.scoring.correct} por acierto, ${a.exam.scoring.incorrect} por error y 0 en blanco. Netas = puntos ÷ ${a.exam.scoring.correct}. Las anuladas no cuentan. Es una métrica de práctica; no estima tu nota ni tu puesto oficial en el MIR.</span></div><a href="#/exams" class="text-link back-link">${icon('back')} Volver a mis simulacros</a>`;
}

function reviewPage(a) {
  const filters = [['all', 'Todas'], ['incorrect', 'Errores'], ['correct', 'Aciertos'], ['blank', 'En blanco']];
  const details = a.result.details.filter(d => state.reviewFilter === 'all' || d.outcome === state.reviewFilter);
  const labels = { correct: 'Respuesta correcta', incorrect: 'Respuesta incorrecta', blank: 'En blanco', voided: 'Anulada' };
  return `${heading('ENTENDER PARA SEGUIR AVANZANDO', 'Aprende de cada pregunta.', e(a.exam.title), `<a class="btn btn-secondary" href="#/result/${a.id}">${icon('back')} Volver al informe</a>`)}<div class="review-toolbar"><div class="tabs" aria-label="Filtrar respuestas">${filters.map(([key, title]) => `<button class="tab ${state.reviewFilter === key ? 'selected' : ''}" data-action="review-filter" data-filter="${key}" aria-pressed="${state.reviewFilter === key}">${title} <span>${key === 'all' ? a.result.details.length : a.result[key]}</span></button>`).join('')}</div><span class="muted small">Intento entregado · Solo lectura</span></div><div class="review-list">${details.map(d => {
    const index = a.exam.questions.findIndex(q => q.id === d.questionId);
    const q = a.exam.questions[index];
    return `<article class="panel review-question"><div class="review-question-heading"><span class="eyebrow">PREGUNTA ${index + 1} · ${e(q.specialty)}</span>${badge(labels[d.outcome], d.outcome === 'correct' ? 'badge-green' : d.outcome === 'incorrect' ? 'badge-red' : '')}</div><h2>${e(q.statement)}</h2>${questionImage(q)}<div class="review-options">${q.options.map((o, i) => `<div class="review-option ${d.outcome !== 'voided' && o.id === d.correctOptionId ? 'correct-option' : d.outcome !== 'voided' && o.id === d.answer ? 'incorrect-option' : ''}"><span class="option-letter">${String.fromCharCode(65 + i)}</span><span>${e(o.text)}</span><div class="review-option-label">${o.id === d.answer ? '<span>Tu respuesta</span>' : ''}${o.id === d.correctOptionId && d.outcome !== 'voided' ? icon('check') + '<span>Correcta</span>' : ''}</div></div>`).join('')}</div>${d.answer === null ? '<p class="muted small">Dejaste esta pregunta en blanco.</p>' : ''}<div class="explanation"><span class="eyebrow">${icon('book')} ${d.outcome === 'voided' ? 'PREGUNTA ANULADA · EXPLICACIÓN DE REFERENCIA' : 'LA CLAVE ESTÁ EN ENTENDERLO'}</span><p>${e(d.explanation)}</p></div></article>`;
  }).join('')}</div>${details.length ? '' : empty('No hay respuestas en este filtro', 'Puedes consultar el resto de preguntas en la pestaña «Todas».')}`;
}

function render() {
  const focused = document.activeElement?.id;
  const selection = focused && document.activeElement instanceof HTMLInputElement ? { start: document.activeElement.selectionStart, end: document.activeElement.selectionEnd } : null;
  if (!state.ready) return;
  if (!state.user || state.route === '/new-password') root.innerHTML = authPage();
  else if (state.loading) root.innerHTML = shell('<div class="loading-state" role="status"><span class="loading-spinner"></span>Preparando tu espacio…</div>');
  else {
    const [page, id] = state.route.slice(1).split('/');
    let content;
    if (page === 'dashboard') content = dashboard();
    else if (page === 'exams') content = catalog();
    else if (page === 'history') content = historyPage();
    else if (page === 'profile') content = profilePage();
    else if (page === 'exam' && state.active?.id === id && state.active.status === 'in_progress') content = examPage();
    else if (page === 'result' || page === 'review') {
      const attempt = state.attempts.find(a => a.id === id && a.status === 'submitted');
      content = attempt ? page === 'result' ? resultPage(attempt) : reviewPage(attempt) : empty('Informe no disponible', 'Comprueba que este intento pertenece a tu cuenta y ya se ha entregado.', '<a href="#/history" class="btn btn-primary">Ver mi historial</a>');
    } else content = empty('Este espacio no está disponible', 'Vuelve a tu panel para continuar la preparación.', '<a href="#/dashboard" class="btn btn-primary">Ir a mi espacio</a>');
    root.innerHTML = shell(content);
  }
  const nextFocus = focused && document.getElementById(focused);
  if (nextFocus) {
    nextFocus.focus({ preventScroll: true });
    if (selection?.start !== null && selection && ['text', 'search', 'email'].includes(nextFocus.type)) nextFocus.setSelectionRange(selection.start, selection.end);
  }
  document.title = `${state.route.startsWith('/exam/') ? 'Simulacro' : state.route.startsWith('/review/') ? 'Revisión' : 'Tu espacio de preparación'} · MIR_Prep`;
}

function markDirty() {
  changeVersion += 1;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => flushSave().catch(() => {}), 650);
}
function updateSaveUI() { const target = document.querySelector('#save-status'); if (target) target.innerHTML = saveStatus(); }
async function flushSave() {
  clearTimeout(saveTimer);
  if (savePromise) { await savePromise; if (changeVersion !== savedVersion) return flushSave(); return; }
  if (!state.active || state.active.status !== 'in_progress' || savedVersion === changeVersion) return;
  const working = state.active;
  captureTime();
  const snapshot = structuredClone(working);
  const generation = changeVersion;
  savePromise = api.save(snapshot).then(saved => {
    working.version = saved.version;
    working.updated_at = saved.updated_at;
    savedVersion = generation;
    saveError = '';
    const index = state.attempts.findIndex(a => a.id === saved.id);
    if (index >= 0) state.attempts[index] = saved;
  }).catch(error => { saveError = error.message; notify(error.message, true); throw error; }).finally(() => {
    savePromise = null;
    updateSaveUI();
    if (saveError && state.route.startsWith('/exam/')) render();
  });
  updateSaveUI();
  await savePromise;
  if (savedVersion !== changeVersion) return flushSave();
}
async function saveBeforeLeaving() {
  if (state.active?.status === 'in_progress') { captureTime(); changeVersion += 1; await flushSave(); }
}
async function loadAccount() {
  const [profile, attempts] = await Promise.all([api.profile(), api.attempts()]);
  state.profile = profile;
  state.attempts = attempts;
}
function activateAttempt(a) {
  state.active = structuredClone(a);
  changeVersion = savedVersion = 0;
  saveError = '';
  baseElapsed = a.elapsed_seconds;
  timerStarted = document.visibilityState === 'hidden' ? 0 : Date.now();
}
async function navigate() {
  const requested = location.hash.startsWith('#/') ? location.hash.slice(1) : state.user ? '/dashboard' : '/login';
  const oldRoute = state.route;
  const navigation = ++routeVersion;
  if (state.active?.status === 'in_progress' && requested !== `/exam/${state.active.id}`) {
    try { await saveBeforeLeaving(); }
    catch { history.replaceState(null, '', `#${oldRoute}`); render(); return; }
    state.active = null;
    timerStarted = 0;
  }
  if (navigation !== routeVersion) return;
  state.route = !state.user ? '/login' : requested === '/login' ? '/dashboard' : requested;
  state.mobileNav = false;
  if (state.route.startsWith('/exam/')) {
    const id = state.route.split('/')[2];
    const a = state.attempts.find(item => item.id === id);
    if (a?.status === 'submitted') { location.replace(`#/${'result'}/${a.id}`); return; }
    if (a && state.active?.id !== id) activateAttempt(a);
  }
  render();
  window.scrollTo({ top: 0, behavior: 'instant' });
}

function download(filename, contents, type) {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function downloadReport(a) {
  const r = a.result;
  const details = r.details.map((d, i) => {
    const q = a.exam.questions.find(q => q.id === d.questionId);
    const option = id => q.options.find(o => o.id === id)?.text || 'En blanco';
    return `<article><p class="label">PREGUNTA ${i + 1} · ${e(q.specialty)} · ${e({ correct: 'Acierto', incorrect: 'Error', blank: 'En blanco', voided: 'Anulada' }[d.outcome])}</p><h2>${e(q.statement)}</h2><p><b>Tu respuesta:</b> ${e(option(d.answer))}</p><p><b>Respuesta de referencia:</b> ${e(option(d.correctOptionId))}</p><p>${e(d.explanation)}</p></article>`;
  }).join('');
  const html = `<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>MIR_Prep · Informe</title><style>body{font:16px/1.7 system-ui,sans-serif;color:#18263e;max-width:850px;margin:50px auto;padding:0 24px}h1{font-size:36px}h2{font-size:20px}.label{font-size:12px;letter-spacing:1px;color:#62718a}article{border-top:1px solid #e3e8f0;padding:24px 0;break-inside:avoid}.score{font-size:40px;font-weight:700}footer{margin-top:40px;color:#62718a}@media print{body{margin:0}} </style><p class="label">MIR_PREP · INFORME PERSONAL</p><h1>${e(a.exam.title)}</h1><p>${e(state.profile.display_name)} · ${formatDate(a.submitted_at)} · ${formatTime(a.elapsed_seconds)} de práctica</p><div class="score">${n(r.net, 2)} / ${r.total} netas</div><p>${r.correct} aciertos · ${r.incorrect} errores · ${r.blank} en blanco · ${r.voided} anuladas</p><p>${r.points} / ${r.maxPoints} puntos. +${a.exam.scoring.correct} acierto, ${a.exam.scoring.incorrect} error, 0 blanco. Netas = puntos ÷ ${a.exam.scoring.correct}. Métrica de práctica, no puntuación oficial MIR.</p>${details}<footer>MIR_Prep · Una pregunta más cerca. Puedes imprimir este documento o guardarlo como PDF desde el navegador.</footer></html>`;
  download(`MIR_Prep-informe-${a.id}.html`, html, 'text/html;charset=utf-8');
}

async function handleAction(action, element) {
  if (action === 'mobile-nav') { state.mobileNav = !state.mobileNav; render(); return; }
  if (action === 'toggle-password') {
    const input = document.querySelector('#password');
    input.type = input.type === 'password' ? 'text' : 'password';
    element.textContent = input.type === 'password' ? 'Ver' : 'Ocultar';
    element.setAttribute('aria-label', input.type === 'password' ? 'Mostrar contraseña' : 'Ocultar contraseña');
    return;
  }
  if (action === 'demo') { api.enterDemo(); state.user = api.user; await loadAccount(); location.hash = '/dashboard'; await navigate(); return; }
  if (action === 'logout') {
    await saveBeforeLeaving();
    await api.logout();
    state.user = null; state.active = null; state.attempts = []; state.profile = {};
    location.hash = '/login'; render(); return;
  }
  if (action === 'catalog-filter') { state.catalogFilter = element.dataset.filter; render(); return; }
  if (action === 'review-filter') { state.reviewFilter = element.dataset.filter; render(); return; }
  if (action === 'start') {
    const item = state.catalog.find(exam => exam.id === element.dataset.id);
    if (!item) return;
    const exam = await loadJSON(item.path);
    const attempt = await api.start(exam);
    const index = state.attempts.findIndex(a => a.id === attempt.id);
    if (index >= 0) state.attempts[index] = attempt; else state.attempts.unshift(attempt);
    activateAttempt(attempt);
    location.hash = `/exam/${attempt.id}`;
    await navigate(); return;
  }
  const a = state.active;
  if (action === 'flag' && a) {
    const id = a.exam.questions[a.current_index].id;
    a.flagged = a.flagged.includes(id) ? a.flagged.filter(value => value !== id) : [...a.flagged, id];
    markDirty(); render(); return;
  }
  if (action === 'clear-answer' && a) { delete a.answers[a.exam.questions[a.current_index].id]; markDirty(); render(); return; }
  if (action.startsWith('question-') && a) {
    const index = action === 'question-next' ? a.current_index + 1 : action === 'question-prev' ? a.current_index - 1 : Number(element.dataset.index);
    if (index < 0 || index >= a.exam.questions.length) return;
    a.current_index = index;
    markDirty(); render();
    document.querySelector('.question-statement')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    return;
  }
  if (action === 'save-retry') { await flushSave(); render(); return; }
  if (action === 'save-exit') { await saveBeforeLeaving(); location.hash = '/exams'; return; }
  if (action === 'reload-attempt') {
    if (await dialog('¿Recuperar la versión guardada?', '<p>Se descartarán los cambios de esta pestaña que no se hayan guardado. Se recuperará el último progreso disponible.</p>', 'Recuperar progreso')) {
      clearTimeout(saveTimer);
      // A failed save must never be followed by a blind overwrite of the remote revision.
      const attempts = await api.attempts();
      const current = attempts.find(item => item.id === a.id);
      state.attempts = attempts;
      if (!current) throw new Error('No se encuentra este intento.');
      activateAttempt(current);
      if (current.status === 'submitted') location.hash = `/result/${current.id}`;
      render();
    }
    return;
  }
  if (action === 'submit' && a) {
    const pending = unresolved(a);
    if (pending.length) {
      const go = await dialog('Te quedan preguntas por resolver', `<p>Hay <strong>${pending.length}</strong> ${pending.length === 1 ? 'pregunta pendiente' : 'preguntas pendientes'}. Elige una respuesta o «Dejar esta pregunta en blanco» en cada una antes de entregar.</p>`, 'Ir a la primera pendiente');
      if (go) { a.current_index = a.exam.questions.findIndex(q => q.id === pending[0].id); markDirty(); render(); }
      return;
    }
    const blank = activeQuestions(a.exam).filter(q => a.answers[q.id] === null).length;
    const yes = await dialog('¿Entregamos este simulacro?', `<p>Has resuelto las ${activeQuestions(a.exam).length} preguntas evaluables, con <strong>${blank} en blanco</strong>. ${a.flagged.length ? `Tienes <strong>${a.flagged.length} marcadas para revisar</strong>.` : ''}</p><p>Al entregar se calculará tu puntuación y podrás consultar las explicaciones. Las respuestas de este intento quedarán cerradas.</p>`, 'Entregar y ver mi resultado');
    if (!yes) return;
    await saveBeforeLeaving();
    const submitted = await api.submit(a);
    const index = state.attempts.findIndex(item => item.id === a.id);
    if (index >= 0) state.attempts[index] = submitted;
    state.active = null; timerStarted = 0;
    location.hash = `/result/${submitted.id}`;
    notify('Simulacro entregado. Ya puedes revisar tu resultado.');
    return;
  }
  if (action === 'download-report') { const attempt = state.attempts.find(a => a.id === element.dataset.id); if (attempt?.result) downloadReport(attempt); return; }
  if (action === 'export-data') { download('MIR_Prep-mis-datos.json', JSON.stringify({ exported_at: new Date().toISOString(), profile: state.profile, attempts: state.attempts }, null, 2), 'application/json'); return; }
  if (action === 'clear-demo') {
    if (await dialog('¿Borrar tu recorrido de demostración?', '<p>Se eliminarán el perfil, los resultados y los intentos de la demo guardados en este navegador.</p>', 'Borrar datos de la demo', true)) { api.clearDemo(); await loadAccount(); render(); notify('Datos de demostración borrados.'); }
    return;
  }
  if (action === 'change-password') { location.hash = '/new-password'; }
}

root.addEventListener('click', async event => {
  const element = event.target.closest('[data-action]');
  if (!element || element.disabled || busy) return;
  const action = element.dataset.action;
  const networkAction = ['demo', 'logout', 'start', 'save-retry', 'save-exit', 'submit', 'reload-attempt', 'clear-demo', 'change-password'].includes(action);
  if (networkAction) { busy = true; element.disabled = true; }
  try { await handleAction(action, element); }
  catch (error) { notify(error.message, true); }
  finally { if (networkAction) { busy = false; element.disabled = false; } }
});
root.addEventListener('input', event => {
  if (event.target.id === 'exam-search') { state.search = event.target.value; render(); }
});
root.addEventListener('change', event => {
  const input = event.target;
  if (input.id === 'history-filter') { state.historyFilter = input.value; render(); }
  if (input.name === 'answer' && state.active && !busy) {
    const q = state.active.exam.questions[state.active.current_index];
    if (q.voided) return;
    state.active.answers[q.id] = input.dataset.blank === 'true' ? null : input.value;
    markDirty(); render();
  }
});
root.addEventListener('submit', async event => {
  event.preventDefault();
  if (busy) return;
  busy = true;
  const form = event.target;
  const data = new FormData(form);
  const submit = form.querySelector('[type="submit"]');
  const message = form.querySelector('#form-message');
  submit.disabled = true;
  message.textContent = '';
  try {
    if (form.id === 'profile-form') {
      const profile = { display_name: data.get('display_name').trim(), specialty_goal: data.get('specialty_goal').trim(), target_date: data.get('target_date') || null };
      if (!profile.display_name) throw new Error('Escribe tu nombre visible.');
      await api.saveProfile(profile); state.profile = profile; render(); notify('Tu perfil está actualizado.');
    } else if (form.id === 'auth-form') {
      const view = form.dataset.view;
      if (view === 'new-password') { await api.updatePassword(data.get('password')); state.user = api.user; state.loading = true; render(); await loadAccount(); state.loading = false; location.hash = '/dashboard'; await navigate(); notify('Tu contraseña se ha actualizado.'); }
      else {
        const user = await api.login(data.get('username').trim(), data.get('password'));
        // Load account data before changing the visible page so failures remain recoverable.
        await loadAccount(); state.user = user; location.hash = '/dashboard'; await navigate();
      }
    }
  } catch (error) { state.loading = false; if (message.isConnected) message.textContent = error.message; else notify(error.message, true); }
  finally { busy = false; if (submit.isConnected) submit.disabled = false; }
});

window.addEventListener('hashchange', () => navigate().catch(error => notify(error.message, true)));
window.addEventListener('beforeunload', event => {
  if (state.active?.status === 'in_progress' && (saveError || changeVersion !== savedVersion || savePromise)) { event.preventDefault(); event.returnValue = ''; }
});
document.addEventListener('visibilitychange', () => {
  if (state.active?.status !== 'in_progress') return;
  // Capture the outgoing interval even though visibilityState has already changed.
  if (document.visibilityState === 'hidden' && timerStarted) {
    baseElapsed += Math.floor((Date.now() - timerStarted) / 1000);
    timerStarted = 0; state.active.elapsed_seconds = baseElapsed;
  } else if (!timerStarted) timerStarted = Date.now();
  markDirty(); flushSave().catch(() => {});
});
setInterval(() => {
  if (state.active?.status !== 'in_progress') return;
  const timer = document.querySelector('#exam-time');
  if (timer) timer.textContent = formatTime(elapsed());
}, 1000);
setInterval(() => {
  if (state.active?.status === 'in_progress' && document.visibilityState !== 'hidden') { markDirty(); flushSave().catch(() => {}); }
}, 30000);

async function boot() {
  try {
    const [auth, catalog] = await Promise.all([api.init(), loadJSON('./MIR/catalog.json')]);
    Object.assign(state, auth, { catalog, user: auth.user, ready: true });
    if (state.user) await loadAccount();
    await navigate();
  } catch (error) {
    root.innerHTML = `<main class="boot boot-error"><span class="brand-mark">m.</span><h1>No hemos podido abrir tu espacio.</h1><p>${e(error.message)}</p><p>Si acabas de configurar el proyecto, comprueba la conexión y el esquema de Supabase.</p><button id="retry-boot" class="btn btn-primary">Volver a intentar</button></main>`;
    document.querySelector('#retry-boot').addEventListener('click', () => location.reload());
  }
}
boot();
