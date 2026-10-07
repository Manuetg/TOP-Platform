import { Leaf, Mountain, Sun, UserRound } from "lucide-react";
import type { ProfileAvatarId } from "../api/user-profile";

export function UserAvatar({ avatarId, fallback }: { avatarId?: ProfileAvatarId | null; fallback: string }) {
  const Icon = avatarId === "user" ? UserRound : avatarId === "leaf" ? Leaf : avatarId === "sun" ? Sun : avatarId === "mountain" ? Mountain : null;
  return Icon ? <Icon size={20} strokeWidth={2} aria-hidden="true" focusable="false" style={{ color: "var(--color-surface)" }} data-profile-avatar={avatarId} /> : fallback;
}
