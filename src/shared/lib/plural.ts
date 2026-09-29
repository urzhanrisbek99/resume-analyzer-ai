/**
 * Russian plural forms.
 *
 * Russian selects between three forms by the last digits of the count, and
 * getting it wrong ("3 замечаний") is the kind of detail that makes an
 * interface feel machine-translated. Worth eleven lines to avoid.
 */
export function plural(count: number, one: string, few: string, many: string): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

/** The count and its noun together: `pluralize(3, 'файл', 'файла', 'файлов')`. */
export function pluralize(count: number, one: string, few: string, many: string): string {
  return `${count} ${plural(count, one, few, many)}`;
}
