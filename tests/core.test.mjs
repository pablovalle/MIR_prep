import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { gradeExam, unresolved, escapeHtml, specialtyStats, formatTime } from '../src/core.js';

const source = JSON.parse(await readFile(new URL('../MIR/demo/exam.json', import.meta.url), 'utf8'));
const solutions = Object.fromEntries(source.questions.map(q => [q.id, { correctOptionId: q.correctOptionId, explanation: q.explanation }]));

test('grades correct, incorrect and explicit blanks, with fractional net score', () => {
  const result = gradeExam(source, { q1: 'a', q2: 'b', q3: 'a', q4: null }, solutions);
  assert.deepEqual([result.correct, result.incorrect, result.blank, result.points, result.net, result.total], [2, 1, 1, 5, 1.67, 4]);
});
test('retains negative scores instead of clipping them to zero', () => {
  assert.equal(gradeExam(source, { q1: 'd', q2: 'd', q3: 'd', q4: 'a' }, solutions).net, -1.33);
});
test('rounds negative half values like PostgreSQL numeric', () => {
  const exam = structuredClone(source);
  exam.scoring.correct = 8;
  assert.equal(gradeExam(exam, { q1: 'b', q2: null, q3: null, q4: null }, solutions).net, -0.13);
});
test('full marks and all blanks', () => {
  assert.equal(gradeExam(source, { q1: 'a', q2: 'b', q3: 'c', q4: 'd' }, solutions).net, 4);
  assert.equal(gradeExam(source, { q1: null, q2: null, q3: null, q4: null }, solutions).net, 0);
});
test('unresolved is distinct from an explicit blank', () => {
  assert.equal(unresolved({ exam: source, answers: { q1: null } }).length, 3);
  assert.throws(() => gradeExam(source, { q1: null }, solutions), /pendientes/);
});
test('rejects nonexistent options and invalid solutions', () => {
  assert.throws(() => gradeExam(source, { q1: 'invalid' }, solutions), /inválida/);
  assert.throws(() => gradeExam(source, { q1: null }, {}), /inválida/);
});
test('voided questions do not count in scoring, progress, or specialty accuracy', () => {
  const exam = structuredClone(source);
  exam.questions[3].voided = true;
  const result = gradeExam(exam, { q1: 'a', q2: 'b', q3: null }, solutions);
  assert.equal(result.voided, 1);
  assert.equal(result.maxPoints, 9);
  assert.equal(result.total, 3);
  assert.equal(unresolved({ exam, answers: { q1: null, q2: null, q3: null } }).length, 0);
  assert.equal(specialtyStats({ exam, result }).reduce((sum, row) => sum + row.total, 0), 3);
});
test('HTML content and attribute injection are escaped', () => {
  assert.equal(escapeHtml('<script>"&\' test'), '&lt;script&gt;&quot;&amp;&#39; test');
});
test('formats elapsed time correctly past one hour', () => {
  assert.equal(formatTime(3661), '01:01:01');
  assert.equal(formatTime(-1), '00:00:00');
});
