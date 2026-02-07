import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { useAuth } from "./use-auth";

describe("useAuth", () => {
  it("throws when used outside AuthProvider", () => {
    expect(() => renderHook(() => useAuth())).toThrow(
      "useAuth must be used within an AuthProvider",
    );
  });
});
