export type MembershipRole =
  | "OWNER"
  | "ADMIN"
  | "RECEPTIONIST"
  | "VIEWER";

export type UserStatus = "ACTIVE" | "DISABLED";

export interface AuthUser {
  id: string;
  email: string;
  status: UserStatus;
}

export interface AuthMembership {
  businessId: string;
  role: MembershipRole;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  tokenType: "Bearer";
  expiresIn: number;
  user: AuthUser;
  memberships: AuthMembership[];
}
