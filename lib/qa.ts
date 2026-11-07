export function numericTokens(value: string): string[] {
  const regex = /(?<![\p{L}\d])(?:[$€£]\s*)?\d+(?:[.,]\d{3})*(?:[.,]\d+)?/gu;
  return (value.match(regex) ?? []).map(x => {
    const digits = x.replace(/[$€£\s]/g, "");
    const group = /^(\d{1,3})([.,]\d{3})+$/.test(digits);
    if (group) return digits.replace(/[.,]/g, "");
    if (digits.includes(".") && digits.includes(",")) {
      return digits.lastIndexOf(".") > digits.lastIndexOf(",")
        ? digits.replace(/,/g, "") : digits.replace(/\./g, "").replace(",", ".");
    }
    return digits.replace(",", ".");
  }).sort();
}
export function compareNumbers(source: string, output: string): string | null {
  const before = numericTokens(source);
  if (!before.length) return null;
  const after = numericTokens(output);
  if (JSON.stringify(before) !== JSON.stringify(after)) return "Los números de la traducción no coinciden con el mensaje original. Confirma cantidades, precios y medidas.";
  return null;
}
