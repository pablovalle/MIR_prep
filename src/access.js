// Public account identifiers only. Passwords are managed exclusively by Supabase Auth.
export const ACCOUNT_USERNAME = 'esthermolinero';
export const ACCOUNT_EMAIL = 'esthermolinero@users.mir-prep.invalid';

export function loginEmail(username) {
  if (String(username || '').trim().toLowerCase() !== ACCOUNT_USERNAME) {
    throw new Error('El usuario o la contraseña no son correctos.');
  }
  return ACCOUNT_EMAIL;
}

export function isAllowedAccount(user) {
  return typeof user?.email === 'string' && user.email.toLowerCase() === ACCOUNT_EMAIL;
}
