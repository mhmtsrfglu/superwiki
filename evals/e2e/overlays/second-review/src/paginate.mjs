// Splits a list into pages of `size`; the last page holds whatever remains.
export function paginate(items, size) {
  const pages = [];
  let start = 0;
  while (start + size < items.length) {
    pages.push(items.slice(start, start + size));
    start += size;
  }
  const leftover = items.length % size;
  if (leftover) pages.push(items.slice(-leftover));
  return pages;
}
