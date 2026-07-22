import { describe, expect, it } from 'vitest';

import { isValidUsername, syntheticEmailForUsername } from './username';

describe('isValidUsername', () => {
  it('accepts a typical valid username', () => {
    expect(isValidUsername('gooduser')).toBe(true);
  });

  it('accepts the minimum length (3 chars)', () => {
    expect(isValidUsername('abc')).toBe(true);
  });

  it('accepts the maximum length (20 chars)', () => {
    expect(isValidUsername('a'.repeat(20))).toBe(true);
  });

  it('accepts digits and underscores', () => {
    expect(isValidUsername('user_123')).toBe(true);
  });

  it('rejects a username that is too short', () => {
    expect(isValidUsername('ab')).toBe(false);
  });

  it('rejects a username that is too long', () => {
    expect(isValidUsername('a'.repeat(21))).toBe(false);
  });

  it('rejects a username with a space', () => {
    expect(isValidUsername('bad name')).toBe(false);
  });

  it('rejects a username with a hyphen', () => {
    expect(isValidUsername('bad-name')).toBe(false);
  });

  it('rejects a username with an @ symbol', () => {
    expect(isValidUsername('bad@name')).toBe(false);
  });

  it('rejects an empty string', () => {
    expect(isValidUsername('')).toBe(false);
  });
});

describe('syntheticEmailForUsername', () => {
  it('generates the expected synthetic email for a lowercase username', () => {
    expect(syntheticEmailForUsername('gooduser')).toBe('gooduser@users.episode-ranker.internal');
  });

  it('lowercases the username, matching the DB\'s case-insensitive uniqueness', () => {
    expect(syntheticEmailForUsername('GoodUser')).toBe('gooduser@users.episode-ranker.internal');
  });
});
