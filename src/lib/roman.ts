/** 羅馬數字。分刻環逢五標一個，最大到 LX。 */
const MAP: Array<[number, string]> = [
  [50, "L"],
  [40, "XL"],
  [10, "X"],
  [9, "IX"],
  [5, "V"],
  [4, "IV"],
  [1, "I"],
];

export function roman(n: number): string {
  let rest = Math.trunc(n);
  let out = "";
  for (const [value, sym] of MAP) {
    while (rest >= value) {
      out += sym;
      rest -= value;
    }
  }
  return out;
}
