/**
 * Arabic counted nouns.
 *
 * Arabic has a dual, so "2 تجار" reads wrong the way "2 merchants" never
 * would — it has to be "متجرين". Three to ten take the plural, and eleven up
 * take the accusative singular. The cart, the checkout header and the floating
 * bar all print the same count, so they share one helper.
 */
export function merchantsCount(n: number): string {
  if (n <= 1) return 'متجر واحد';
  if (n === 2) return 'متجرين';
  if (n <= 10) return `${n} متاجر`;
  return `${n} متجرًا`;
}
