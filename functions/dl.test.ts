import { describe, expect, test } from "bun:test";
import { isAllowedDlHost, forceSmallInstagramUrl } from "./dl";

// ── isAllowedDlHost ───────────────────────────────────────────────────────────

describe("isAllowedDlHost", () => {
  test("allows cdninstagram.com subdomains", () => {
    expect(
      isAllowedDlHost("https://scontent-otp1-1.cdninstagram.com/v/t51/img.jpg"),
    ).toBe(true);
  });

  test("allows fbcdn.net subdomains", () => {
    expect(isAllowedDlHost("https://scontent.fbcdn.net/v/img.jpg")).toBe(true);
  });

  test("allows o1 video cdn (still cdninstagram.com)", () => {
    expect(
      isAllowedDlHost(
        "https://scontent-otp1-1.cdninstagram.com/o1/v/t16/video.mp4",
      ),
    ).toBe(true);
  });

  test("blocks localhost (double-proxy guard)", () => {
    expect(
      isAllowedDlHost("http://localhost:8788/dl?url=https%3A%2F%2Fcdn..."),
    ).toBe(false);
  });

  test("blocks arbitrary external domains", () => {
    expect(isAllowedDlHost("https://evil.com/steal.jpg")).toBe(false);
  });

  test("blocks empty string", () => {
    expect(isAllowedDlHost("")).toBe(false);
  });

  test("blocks malformed URLs", () => {
    expect(isAllowedDlHost("not-a-url")).toBe(false);
  });

  test("does not allow cdninstagram.com.evil.com (suffix check)", () => {
    expect(isAllowedDlHost("https://cdninstagram.com.evil.com/img.jpg")).toBe(
      false,
    );
  });
});

// ── forceSmallInstagramUrl ────────────────────────────────────────────────────

describe("forceSmallInstagramUrl", () => {
  test("replaces size segment in pathname", () => {
    const url =
      "https://scontent.cdninstagram.com/v/t51/s1080x1080/img.jpg?foo=bar";
    const result = forceSmallInstagramUrl(url);
    expect(result).toContain("/s320x320/");
    expect(result).not.toContain("/s1080x1080/");
  });

  test("replaces size in stp query parameter", () => {
    const url =
      "https://scontent.cdninstagram.com/v/img.jpg?stp=dst-jpg_e15_s1080x1080_tt6";
    const result = forceSmallInstagramUrl(url);
    expect(result).toContain("s320x320");
    expect(result).not.toContain("s1080x1080");
  });

  test("handles both pathname and stp together", () => {
    const url =
      "https://scontent.cdninstagram.com/v/t51/s640x640/img.jpg?stp=dst-jpg_s640x640";
    const result = forceSmallInstagramUrl(url);
    expect(result).not.toContain("s640x640");
    expect((result.match(/s320x320/g) ?? []).length).toBeGreaterThan(0);
  });

  test("leaves URLs without size markers unchanged", () => {
    const url = "https://scontent.cdninstagram.com/v/img.jpg?foo=bar";
    expect(forceSmallInstagramUrl(url)).toBe(url);
  });

  test("returns input unchanged for malformed URLs", () => {
    expect(forceSmallInstagramUrl("not-a-url")).toBe("not-a-url");
  });

  test("target size is 320x320", () => {
    const url = "https://scontent.cdninstagram.com/v/t51/s150x150/img.jpg";
    expect(forceSmallInstagramUrl(url)).toContain("/s320x320/");
  });
});
