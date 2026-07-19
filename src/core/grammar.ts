import { ValidationResult } from './types.js';

/**
 * The alias grammar: lowercase snake_case or kebab-case, starting with a
 * letter or digit.
 *
 * This is the single rule that makes the argv grammar unambiguous. Token 1 is
 * an alias if and only if it matches here, which is what lets `inw mem memory`
 * mean "save" while `inw -p mem` means "execute from project scope" — a flag
 * can never be mistaken for an alias because flags start with a hyphen.
 *
 * Declared once and exported so no other module re-states the rule.
 */
export const ALIAS_PATTERN = /^[a-z0-9][a-z0-9_-]*$/;

export function isValidAlias(token: string): boolean {
  return ALIAS_PATTERN.test(token);
}

/**
 * Like `isValidAlias`, but explains the failure.
 *
 * The CLI shows this to a user who typed something that looked like an alias,
 * so the message names the rule that was broken rather than printing a regex.
 */
export function validateAlias(token: string): ValidationResult {
  if (token.length === 0) {
    return { ok: false, reason: 'Alias is empty. Give it a name, for example: inw deploy ./scripts/deploy.sh' };
  }

  if (ALIAS_PATTERN.test(token)) {
    return { ok: true };
  }

  if (/[A-Z]/.test(token)) {
    return {
      ok: false,
      reason: `Alias "${token}" contains uppercase. Aliases are lowercase — try "${token.toLowerCase()}".`,
    };
  }

  if (!/^[a-z0-9]/.test(token)) {
    return {
      ok: false,
      reason: `Alias "${token}" must start with a letter or digit. Leading hyphens and underscores are reserved so flags are never mistaken for aliases.`,
    };
  }

  return {
    ok: false,
    reason: `Alias "${token}" has characters that are not allowed. Use only lowercase letters, digits, hyphens, and underscores.`,
  };
}
