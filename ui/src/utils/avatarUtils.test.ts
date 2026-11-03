import { describe, expect, it } from 'vitest';
import { getInitials } from './avatarUtils';

describe('getInitials', () => {
  it.each([
    ['kind', 'KI'],
    ['k', 'K'],
    ['kind-kind', 'KK'],
    ['Production West', 'PW'],
    ['production-east coast', 'PC'],
    ['', 'NA'],
  ])('keeps initials for %j', (name, initials) => {
    expect(getInitials(name)).toBe(initials);
  });

  it.each([
    ['Production ', 'PR'],
    [' Production', 'PR'],
    [' Production  West ', 'PW'],
    ['Production\tWest', 'PW'],
    [' \t\n ', 'NA'],
    ['kind-', 'KI'],
    ['-kind', 'KI'],
    ['kind--west', 'KW'],
    ['--', '--'],
  ])('handles incomplete or repeated separators in %j', (name, initials) => {
    expect(getInitials(name)).toBe(initials);
  });
});
