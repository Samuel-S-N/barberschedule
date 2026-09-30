import {
  AVATAR_MAX_BYTES, AVATAR_MIN_BYTES, avatarInitial, avatarPath, base64ToArrayBuffer, validateAvatar,
} from "../../src/features/account/avatar";

describe("avatar helpers", () => {
  it("uses the uppercased first letter of the name, or ? when empty", () => {
    expect(avatarInitial("  samuel neres")).toBe("S");
    expect(avatarInitial("")).toBe("?");
    expect(avatarInitial(null)).toBe("?");
  });

  it("accepts jpeg, png and webp up to the limit", () => {
    expect(validateAvatar({ size: 2000, type: "image/jpeg" })).toBeNull();
    expect(validateAvatar({ size: AVATAR_MAX_BYTES, type: "image/png" })).toBeNull();
    expect(validateAvatar({ size: 2000, type: "image/webp" })).toBeNull();
  });

  it("rejects other types and oversized files", () => {
    expect(validateAvatar({ size: 2000, type: "image/gif" })).toBe("type");
    expect(validateAvatar({ size: AVATAR_MAX_BYTES + 1, type: "image/jpeg" })).toBe("size");
  });

  it("rejects files too small to be a real image", () => {
    expect(validateAvatar({ size: AVATAR_MIN_BYTES - 1, type: "image/jpeg" })).toBe("size");
    expect(validateAvatar({ size: 14, type: "image/jpeg" })).toBe("size");
  });

  it("decodes base64 into the exact bytes", () => {
    expect(Array.from(new Uint8Array(base64ToArrayBuffer("AQID")))).toEqual([1, 2, 3]);
    expect(base64ToArrayBuffer("").byteLength).toBe(0);
  });

  it("builds a path in the user's folder with the right extension", () => {
    expect(avatarPath("u1", "image/jpeg", 5)).toBe("u1/avatar-5.jpg");
    expect(avatarPath("u1", "image/png", 5)).toBe("u1/avatar-5.png");
    expect(avatarPath("u1", "image/webp", 5)).toBe("u1/avatar-5.webp");
  });
});
