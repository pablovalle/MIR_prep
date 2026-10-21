import test from 'node:test';
import assert from 'node:assert/strict';
import { ACCOUNT_USERNAME, ACCOUNT_EMAIL, isAllowedAccount, loginEmail } from '../src/access.js';

test('username maps to the internal Auth identity without requiring email entry', () => {
  assert.equal(loginEmail(ACCOUNT_USERNAME), ACCOUNT_EMAIL);
  assert.equal(loginEmail('  ESTHERMOLINERO  '), ACCOUNT_EMAIL);
});
test('invalid identifiers cannot reach the login API', () => {
  for (const input of ['', null, 'other', ACCOUNT_EMAIL, '<script>']) {
    assert.throws(() => loginEmail(input), /usuario o la contraseña/);
  }
});
test('public metadata cannot authorize a different account', () => {
  assert.equal(isAllowedAccount({ email: ACCOUNT_EMAIL }), true);
  assert.equal(isAllowedAccount({ email: 'someone@example.test', user_metadata: { username: ACCOUNT_USERNAME, email: ACCOUNT_EMAIL } }), false);
  assert.equal(isAllowedAccount(null), false);
});
