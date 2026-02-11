export function countVisibleChars(value: string): number {
  return value.replace(/\s+/g, '').length
}
