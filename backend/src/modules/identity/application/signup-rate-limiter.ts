import { Injectable } from '@nestjs/common';

@Injectable()
export class SignupRateLimiter {
  private readonly attempts = new Map<string, { count: number; resetAt: number }>();
  allow(email: string, now = Date.now()): boolean {
    const key = email.trim().toLowerCase(); const current = this.attempts.get(key);
    if (!current || current.resetAt <= now) { this.attempts.set(key, { count: 1, resetAt: now + 15 * 60 * 1000 }); return true; }
    if (current.count >= 5) return false;
    current.count += 1; return true;
  }
}
