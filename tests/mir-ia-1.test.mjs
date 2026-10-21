import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { activeQuestions, gradeExam, specialtyStats, unresolved } from '../src/core.js';

const exam = JSON.parse(await readFile(new URL('../MIR/archive/MIR_IA_1_v1/exam.json', import.meta.url), 'utf8'));
const active = activeQuestions(exam);
const solutions = Object.fromEntries(exam.questions.map(q => [q.id, { correctOptionId: q.correctOptionId, explanation: q.explanation }]));
const responses = answerFor => Object.fromEntries(active.map(q => [q.id, answerFor(q)]));

test('MIR_IA_1 grades 198 correct answers without requiring answers to the two voided questions', () => {
  const answers = responses(q => q.correctOptionId);
  assert.equal(unresolved({ exam, answers }).length, 0);
  const result = gradeExam(exam, answers, solutions);
  assert.deepEqual([result.correct, result.incorrect, result.blank, result.voided, result.total, result.points, result.maxPoints, result.net], [198, 0, 0, 2, 198, 594, 594, 198]);
  assert.equal(result.details.length, 200);
  assert.deepEqual(result.details.filter(d => d.outcome === 'voided').map(d => d.questionId), ['q148', 'q181']);
  assert.equal(specialtyStats({ exam, result }).reduce((sum, row) => sum + row.total, 0), 198);
});

test('all incorrect MIR_IA_1 answers produce negative net score; void keys cannot add points', () => {
  const answers = responses(q => q.options.find(o => o.id !== q.correctOptionId).id);
  answers.q148 = 'c'; answers.q181 = 'c';
  const result = gradeExam(exam, answers, solutions);
  assert.deepEqual([result.incorrect, result.voided, result.points, result.net], [198, 2, -198, -66]);
});

test('explicit blanks count as resolved while the unanswered last question still blocks delivery', () => {
  const answers = responses(() => null);
  delete answers.q200;
  assert.deepEqual(unresolved({ exam, answers }).map(q => q.id), ['q200']);
  assert.throws(() => gradeExam(exam, answers, solutions), /pendientes/);
  answers.q200 = null;
  const result = gradeExam(exam, answers, solutions);
  assert.deepEqual([result.blank, result.voided, result.total, result.net], [198, 2, 198, 0]);
});

test('mixed MIR_IA_1 submission keeps the original question numbers and +3/-1/0 scoring', () => {
  const answers = responses(() => null);
  answers.q1 = 'c'; answers.q2 = 'b'; answers.q200 = 'a';
  const result = gradeExam(exam, answers, solutions);
  assert.deepEqual([result.correct, result.incorrect, result.blank, result.points, result.net], [2, 1, 195, 5, 1.67]);
  assert.equal(result.details[147].questionId, 'q148');
  assert.equal(result.details[180].questionId, 'q181');
  assert.equal(result.details[199].questionId, 'q200');
});

test('built catalog lists only the current version and never publishes real solutions', async () => {
  const catalog = JSON.parse(await readFile(new URL('../dist/MIR/catalog.json', import.meta.url), 'utf8'));
  assert.ok(!catalog.some(e => e.id === exam.id));
  const entry = catalog.find(e => e.id === 'mir-ia-1-v2');
  assert.deepEqual([entry.totalQuestionCount, entry.questionCount, entry.voidedQuestionCount], [200, 200, 0]);
  const publicExam = await readFile(new URL('../dist/MIR/mir-ia-1-v2/exam.json', import.meta.url), 'utf8');
  assert.equal(JSON.parse(publicExam).questions.length, 200);
  assert.doesNotMatch(publicExam, /correctOptionId|explanation|editorialNotes/);
  await assert.rejects(readFile(new URL('../dist/MIR/mir-ia-1-v2/demo-solutions.json', import.meta.url)), { code: 'ENOENT' });
});
