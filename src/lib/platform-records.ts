/** Read every page of a protected platform list without treating a page as a total. */
export async function readAllPlatformRecords<T extends { total_count?: number | string }>(
  readPage: (offset: number, limit: number) => Promise<T[]>,
  pageSize = 100,
): Promise<T[]> {
  const rows: T[] = [];
  for (;;) {
    const page = await readPage(rows.length, pageSize);
    if (page.length === 0) return rows;
    rows.push(...page);
    const total = Number(page[0]?.total_count);
    if (Number.isFinite(total) && rows.length >= total) return rows;
    if (!Number.isFinite(total) && page.length < pageSize) return rows;
  }
}

export function percentageChange(current: number | null | undefined, previous: number | null | undefined): number | undefined {
  if (current == null || previous == null || previous <= 0) return undefined;
  return ((current - previous) / previous) * 100;
}