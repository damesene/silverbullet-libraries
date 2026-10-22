/**
 * A number as SilverBullet shows the result of an expression: as Lua's
 * tostring does, floats with 14 significant digits (`%.14g`), so a sum like
 * 12.99 + 8.5 + 105 shows as 126.49, not 126.49000000000001
 */
export function formatLuaNumber(n: number): string {
  if (Number.isInteger(n)) return String(n);
  if (Number.isNaN(n)) return "-nan";
  if (n === Infinity) return "inf";
  if (n === -Infinity) return "-inf";
  // %g: the exponent of the number rounded to 14 digits picks the notation
  const [mantissa, exp] = n.toExponential(13).split("e") as [string, string];
  const exponent = Number(exp);
  if (exponent < -4 || exponent >= 14) {
    const digits = Math.abs(exponent) < 10 ? `0${Math.abs(exponent)}` : String(Math.abs(exponent));
    return `${trimZeros(mantissa)}e${exponent < 0 ? "-" : "+"}${digits}`;
  }
  return trimZeros(n.toFixed(13 - exponent));
}

// %g drops trailing zeros after the decimal point, and the point with them
function trimZeros(s: string): string {
  return s.includes(".") ? s.replace(/\.?0+$/, "") : s;
}
