export const hasAnswer = (answers, id) => Object.hasOwn(answers, id);
export const activeQuestions = exam => exam.questions.filter(q => !q.voided);
export const unresolved = attempt => activeQuestions(attempt.exam).filter(q => !hasAnswer(attempt.answers, q.id));

export function gradeExam(exam, answers, solutions) {
  const result = { correct: 0, incorrect: 0, blank: 0, voided: 0, total: 0, points: 0, maxPoints: 0, net: 0, details: [] };
  for (const q of exam.questions) {
    const solution = solutions[q.id];
    if (!solution || !q.options.some(o => o.id === solution.correctOptionId)) throw new Error('Solución inválida.');
    const answer = answers[q.id] ?? null;
    if (answer !== null && !q.options.some(o => o.id === answer)) throw new Error('Respuesta inválida.');
    if (!q.voided && !hasAnswer(answers, q.id)) throw new Error('Quedan preguntas pendientes.');
    const outcome = q.voided ? 'voided' : answer === null ? 'blank' : answer === solution.correctOptionId ? 'correct' : 'incorrect';
    result[outcome] += 1;
    result.details.push({ questionId: q.id, answer, ...solution, outcome });
  }
  result.total = result.correct + result.incorrect + result.blank;
  result.points = result.correct * exam.scoring.correct + result.incorrect * exam.scoring.incorrect;
  result.maxPoints = result.total * exam.scoring.correct;
  const net = result.points / exam.scoring.correct;
  // Match PostgreSQL numeric rounding (ties away from zero, also for negative scores).
  result.net = Math.sign(net) * Math.round((Math.abs(net) + Number.EPSILON) * 100) / 100;
  return result;
}

export const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const formatNumber = (value, digits = 1) => Number(value).toLocaleString('es-ES', { maximumFractionDigits: digits });
export function formatTime(seconds) {
  const total = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(total / 3600)).padStart(2, '0')}:${String(Math.floor(total / 60) % 60).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}
export const formatDate = value => value ? new Date(value).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

export function specialtyStats(attempt) {
  const stats = new Map();
  for (const detail of attempt.result.details) {
    if (detail.outcome === 'voided') continue;
    const q = attempt.exam.questions.find(item => item.id === detail.questionId);
    const name = q?.specialty || 'General';
    const row = stats.get(name) || { name, correct: 0, total: 0 };
    row.total += 1;
    if (detail.outcome === 'correct') row.correct += 1;
    stats.set(name, row);
  }
  return [...stats.values()];
}
