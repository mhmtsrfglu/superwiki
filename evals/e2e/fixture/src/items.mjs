// The item list: the first n positive integers.
export function items(n) {
  return Array.from({ length: n }, (_, i) => i + 1);
}
