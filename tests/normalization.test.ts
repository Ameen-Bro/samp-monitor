import { describe, it, expect } from 'vitest';
import { normalizeName, namesMatch } from '../src/utils/normalizeName';

describe('Name Normalization & Matching', () => {
  it('should normalize uppercase, lowercase and mixed case identically', () => {
    expect(normalizeName('John_Smith')).toBe('john_smith');
    expect(normalizeName('JOHN_SMITH')).toBe('john_smith');
    expect(normalizeName('john_smith')).toBe('john_smith');
  });

  it('should trim surrounding whitespace', () => {
    expect(normalizeName('  John_Smith  ')).toBe('john_smith');
  });

  it('should match identical names regardless of casing', () => {
    expect(namesMatch('John_Smith', 'john_smith')).toBe(true);
    expect(namesMatch('JOHN_SMITH', 'John_Smith')).toBe(true);
  });

  it('should NOT do fuzzy matching or prefix matching', () => {
    expect(namesMatch('John_Smith', 'John_Smith123')).toBe(false);
    expect(namesMatch('John', 'John_Smith')).toBe(false);
    expect(namesMatch('Officer_Bob', 'Officer_Bobby')).toBe(false);
  });

  it('should handle empty or null-like strings safely', () => {
    expect(normalizeName('')).toBe('');
    expect(namesMatch('', 'John')).toBe(false);
  });
});
