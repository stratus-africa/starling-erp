export function getPackagePickerItems<T extends { id: string; name?: string; sku?: string }>(
  catalog: T[],
  orderLines: Array<{ item_id?: string | null }>,
  sourceOrderId?: string | null,
) {
  if (!sourceOrderId) return catalog;

  const allowedItemIds = new Set(
    orderLines.map((line) => line.item_id).filter((itemId): itemId is string => Boolean(itemId)),
  );

  return catalog.filter((item) => allowedItemIds.has(item.id));
}
