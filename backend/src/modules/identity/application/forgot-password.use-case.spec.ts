import { ForgotPasswordUseCase, forgotPasswordMessage } from './forgot-password.use-case';
import { UserStatus } from '../domain/user-status.enum';
import type { CryptoPasswordResetOtpService } from '../infrastructure/crypto-password-reset-otp.service';
describe('ForgotPasswordUseCase', () => {
  const user = { user: { id: 'u1', email: 'a@b.com', status: UserStatus.ACTIVE }, passwordHash: 'hash' };
  const setup = () => {
    const users = { findForLoginByEmail: jest.fn().mockResolvedValue(user) };
    const challenges = { findLatestPending: jest.fn().mockResolvedValue(null), invalidatePending: jest.fn(), createChallenge: jest.fn().mockResolvedValue({ id: 'c1' }), verifyAndCreateGrant: jest.fn() };
    const email = { sendPasswordReset: jest.fn() };
    const crypto = { generateCode: jest.fn().mockReturnValue('123456'), digest: jest.fn().mockReturnValue('digest'), expiresAt: jest.fn().mockReturnValue(new Date()), resendSeconds: 60 };
    const useCase = new ForgotPasswordUseCase(users, challenges, email, crypto as unknown as CryptoPasswordResetOtpService);
    return { useCase, users, challenges, email };
  };
  it('keeps the external response generic and creates a challenge for an eligible user', async () => { const { useCase, challenges, email } = setup(); await expect(useCase.execute({ email: ' A@B.COM ' })).resolves.toEqual({ message: forgotPasswordMessage, challengeId: 'c1' }); expect(challenges.createChallenge).toHaveBeenCalled(); expect(email.sendPasswordReset).toHaveBeenCalledWith(expect.objectContaining({ code: '123456' })); });
  it('does not create or send for an unknown user', async () => { const { useCase, users, challenges, email } = setup(); users.findForLoginByEmail.mockResolvedValue(null); await expect(useCase.execute({ email: 'unknown@b.com' })).resolves.toMatchObject({ message: forgotPasswordMessage }); expect(challenges.createChallenge).not.toHaveBeenCalled(); expect(email.sendPasswordReset).not.toHaveBeenCalled(); });
  it('enforces the resend cooldown without sending another code', async () => { const { useCase, challenges, email } = setup(); challenges.findLatestPending.mockResolvedValue({ lastSentAt: new Date() }); await expect(useCase.execute({ email: 'a@b.com' })).resolves.toMatchObject({ message: forgotPasswordMessage }); expect(challenges.createChallenge).not.toHaveBeenCalled(); expect(email.sendPasswordReset).not.toHaveBeenCalled(); });
});
