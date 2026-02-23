import { describe, it, expect, beforeEach } from "vitest";
import { getEtag, setEtag, clearEtag } from "./etag-store";

describe("etag-store", () => {
  beforeEach(() => {
    // Clear any residual state between tests
    clearEtag("item-1");
    clearEtag("item-2");
  });

  it("returns undefined for an unknown item", () => {
    expect(getEtag("nonexistent")).toBeUndefined();
  });

  it("stores and retrieves an etag", () => {
    setEtag("item-1", '"abc123"');
    expect(getEtag("item-1")).toBe('"abc123"');
  });

  it("overwrites an existing etag", () => {
    setEtag("item-1", '"v1"');
    setEtag("item-1", '"v2"');
    expect(getEtag("item-1")).toBe('"v2"');
  });

  it("stores etags independently per item", () => {
    setEtag("item-1", '"aaa"');
    setEtag("item-2", '"bbb"');
    expect(getEtag("item-1")).toBe('"aaa"');
    expect(getEtag("item-2")).toBe('"bbb"');
  });

  it("clears a specific etag", () => {
    setEtag("item-1", '"aaa"');
    setEtag("item-2", '"bbb"');
    clearEtag("item-1");
    expect(getEtag("item-1")).toBeUndefined();
    expect(getEtag("item-2")).toBe('"bbb"');
  });

  it("clearEtag is a no-op for nonexistent keys", () => {
    expect(() => clearEtag("nonexistent")).not.toThrow();
  });
});
