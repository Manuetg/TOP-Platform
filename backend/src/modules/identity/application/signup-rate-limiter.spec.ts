import { SignupRateLimiter } from './signup-rate-limiter';

describe('SignupRateLimiter', () => {
  it('allows five attempts and rejects the sixth within the 15-minute window', () => {
    const limiter = new SignupRateLimiter();
    for (let attempt = 0; attempt < 5; attempt += 1) expect(limiter.allow('User@Example.com', 1_000)).toBe(true);
    expect(limiter.allow(' user@example.com ', 1_001)).toBe(false);
  });

  it('opens a new window after fifteen minutes and isolates emails', () => {
    const limiter = new SignupRateLimiter();
    for (let attempt = 0; attempt < 5; attempt += 1) expect(limiter.allow('a@example.com', 1_000)).toBe(true);
    expect(limiter.allow('b@example.com', 1_001)).toBe(true);
    expect(limiter.allow('a@example.com', 901_001)).toBe(true);
  });
});
