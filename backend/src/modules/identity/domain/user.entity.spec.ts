import { User } from './user.entity';
import { UserStatus } from './user-status.enum';
describe('User', () => { it('expone todos los datos públicos', () => { const createdAt = new Date('2026-01-01'); const updatedAt = new Date('2026-02-02'); const user = User.create({ id: 'id-distintivo', email: 'persona@example.com', status: UserStatus.ACTIVE, createdAt, updatedAt }); expect(user.id).toBe('id-distintivo'); expect(user.email).toBe('persona@example.com'); expect(user.status).toBe(UserStatus.ACTIVE); expect(user.createdAt).toBe(createdAt); expect(user.updatedAt).toBe(updatedAt); }); });
