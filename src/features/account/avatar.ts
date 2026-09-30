export const AVATAR_BUCKET = "avatars";
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
// A real 512 px JPEG is tens of KB; anything this small means the bytes were lost on the way.
export const AVATAR_MIN_BYTES = 1024;

const EXTENSIONS: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

export function avatarInitial(name?: string | null) {
  return (name?.trim()[0] ?? "?").toUpperCase();
}

export function validateAvatar(file: { size: number; type: string }) {
  if (!(file.type in EXTENSIONS)) return "type" as const;
  if (file.size < AVATAR_MIN_BYTES || file.size > AVATAR_MAX_BYTES) return "size" as const;

  return null;
}

export function avatarPath(userId: string, mimeType: string, now = Date.now()) {
  return `${userId}/avatar-${now}.${EXTENSIONS[mimeType] ?? "jpg"}`;
}

export function base64ToArrayBuffer(base64: string) {
  return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0)).buffer;
}
