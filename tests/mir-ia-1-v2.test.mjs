import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { gradeExam, unresolved } from '../src/core.js';

const exam = JSON.parse(await readFile(new URL('../MIR/MIR_IA_1/exam.json', import.meta.url), 'utf8'));
const solutions = Object.fromEntries(exam.questions.map(q => [q.id, { correctOptionId: q.correctOptionId, explanation: q.explanation }]));

test('MIR_IA_1 v2 awards 200 net and 600 points when all questions are correct', () => {
  const answers = Object.fromEntries(exam.questions.map(q => [q.id, q.correctOptionId]));
  const result = gradeExam(exam, answers, solutions);
  assert.deepEqual([result.correct, result.total, result.voided, result.points, result.maxPoints, result.net], [200, 200, 0, 600, 600, 200]);
  for (const index of [147, 180]) assert.equal(result.details[index].outcome, 'correct');
});

test('both replacement questions must be resolved and are graded as normal questions', () => {
  const answers = Object.fromEntries(exam.questions.map(q => [q.id, null]));
  delete answers.q148; delete answers.q181;
  assert.deepEqual(unresolved({ exam, answers }).map(q => q.id), ['q148', 'q181']);
  assert.throws(() => gradeExam(exam, answers, solutions), /pendientes/);
  answers.q148 = 'c'; answers.q181 = 'a';
  const result = gradeExam(exam, answers, solutions);
  assert.deepEqual([result.correct, result.incorrect, result.blank, result.voided, result.points, result.net], [1, 1, 198, 0, 2, 0.67]);
});
