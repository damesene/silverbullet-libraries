import { describe, expect, it } from "vitest";
import { formatLuaNumber } from "./format.ts";

describe("formatLuaNumber", () => {
  it("shows floats with 14 significant digits, as Lua does", () => {
    expect(formatLuaNumber(12.99 + 8.5 + 105)).toBe("126.49");
    expect(formatLuaNumber(0.1 + 0.2)).toBe("0.3");
    expect(formatLuaNumber(-2.5)).toBe("-2.5");
    expect(formatLuaNumber(1 / 3)).toBe("0.33333333333333");
  });

  it("shows integers as they are", () => {
    expect(formatLuaNumber(42)).toBe("42");
    expect(formatLuaNumber(-7)).toBe("-7");
    expect(formatLuaNumber(0)).toBe("0");
  });

  it("uses an exponent where %g does", () => {
    expect(formatLuaNumber(0.00001234)).toBe("1.234e-05");
    expect(formatLuaNumber(0.0001234)).toBe("0.0001234");
    expect(formatLuaNumber(123456789012345.5)).toBe("1.2345678901235e+14");
  });

  it("names the special values as Lua does", () => {
    expect(formatLuaNumber(NaN)).toBe("-nan");
    expect(formatLuaNumber(Infinity)).toBe("inf");
    expect(formatLuaNumber(-Infinity)).toBe("-inf");
  });
});
