import {
  AVATAR_MAX_BYTES, avatarInitial, avatarPath, avatarPathFromUrl, validateAvatar,
} from "../../src/features/account/avatar";

describe("avatar helpers", () => {
  it("uses the uppercased first letter of the name, or ? when empty", () => {
    expect(avatarInitial("  samuel neres")).toBe("S");
    expect(avatarInitial("")).toBe("?");
    expect(avatarInitial(null)).toBe("?");
  });

  it("accepts jpeg, png and webp up to the limit", () => {
    expect(validateAvatar({ size: 1000, type: "image/jpeg" })).toBeNull();
    expect(validateAvatar({ size: AVATAR_MAX_BYTES, type: "image/png" })).toBeNull();
    expect(validateAvatar({ size: 1000, type: "image/webp" })).toBeNull();
  });

  it("rejects other types and oversized files", () => {
    expect(validateAvatar({ size: 1000, type: "image/gif" })).toBe("type");
    expect(validateAvatar({ size: AVATAR_MAX_BYTES + 1, type: "image/jpeg" })).toBe("size");
  });

  it("builds a path in the user's folder with the right extension", () => {
    expect(avatarPath("u1", "image/jpeg", 5)).toBe("u1/avatar-5.jpg");
    expect(avatarPath("u1", "image/png", 5)).toBe("u1/avatar-5.png");
    expect(avatarPath("u1", "image/webp", 5)).toBe("u1/avatar-5.webp");
  });

  it("extracts the object path from a public url, only for the same user", () => {
    const url = "http://x/storage/v1/object/public/avatars/u1/avatar-5.jpg";

    expect(avatarPathFromUrl(url, "u1")).toBe("u1/avatar-5.jpg");
    expect(avatarPathFromUrl(url, "u2")).toBeNull();
    expect(avatarPathFromUrl("http://elsewhere/pic.jpg", "u1")).toBeNull();
  });
});
