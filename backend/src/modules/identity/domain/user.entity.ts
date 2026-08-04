import { UserStatus } from './user-status.enum';

export interface UserProps {
  id: string;
  email: string;
  status: UserStatus;
  createdAt: Date;
  updatedAt: Date;
}

export class User {
  private constructor(private readonly props: UserProps) {}

  static create(props: UserProps): User {
    return new User(props);
  }

  get id(): string { return this.props.id; }
  get email(): string { return this.props.email; }
  get status(): UserStatus { return this.props.status; }
  get createdAt(): Date { return this.props.createdAt; }
  get updatedAt(): Date { return this.props.updatedAt; }
  updateEmail(email: string, updatedAt = new Date()): User { return User.create({ ...this.props, email, updatedAt }); }
  disable(updatedAt = new Date()): User { return User.create({ ...this.props, status: UserStatus.DISABLED, updatedAt }); }
}
