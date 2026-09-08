/**
 * Normalizes an in-game name for safe, case-insensitive comparison.
 * Trims leading/trailing whitespace, converts to lowercase.
 * Does NOT do fuzzy matching or prefix matching to prevent accidental collisions (e.g. John_Smith vs John_Smith123).
 */
export function normalizeName(name: string): string {
  if (!name) return '';
  return name.trim().toLowerCase();
}

/**
 * Checks if two in-game names match identically under safe normalization.
 */
export function namesMatch(name1: string, name2: string): boolean {
  return normalizeName(name1) === normalizeName(name2);
}
