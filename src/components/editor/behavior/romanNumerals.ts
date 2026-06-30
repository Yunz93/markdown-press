/**
 * Roman numeral parsing/formatting for ordered-list markers
 * (e.g. `i.`, `IV.`). Pure and dependency-free so it can be shared and tested
 * in isolation from the list-behavior module.
 */

export function parseRomanNumeral(roman: string): number {
  const values: Record<string, number> = {
    i: 1,
    v: 5,
    x: 10,
    l: 50,
    c: 100,
    d: 500,
    m: 1000,
  };
  let total = 0;
  let prev = 0;

  for (let i = roman.length - 1; i >= 0; i--) {
    const current = values[roman[i].toLowerCase()] || 0;
    if (current < prev) {
      total -= current;
    } else {
      total += current;
      prev = current;
    }
  }

  return total;
}

export function formatRomanNumeral(value: number, uppercase: boolean): string {
  if (value < 1 || value > 3999) {
    return String(value);
  }
  const numerals: Array<[number, string]> = [
    [1000, "M"],
    [900, "CM"],
    [500, "D"],
    [400, "CD"],
    [100, "C"],
    [90, "XC"],
    [50, "L"],
    [40, "XL"],
    [10, "X"],
    [9, "IX"],
    [5, "V"],
    [4, "IV"],
    [1, "I"],
  ];
  let n = value;
  let s = "";
  for (const [v, sym] of numerals) {
    while (n >= v) {
      s += sym;
      n -= v;
    }
  }
  return uppercase ? s : s.toLowerCase();
}
