import { apiRequest } from '../../../shared/api/api-client';
export function resendVerification(email: string): Promise<{ status: 'VERIFICATION_EMAIL_SENT_IF_ELIGIBLE' }> { return apiRequest('/auth/resend-verification', { method: 'POST', body: JSON.stringify({ email }) }); }
