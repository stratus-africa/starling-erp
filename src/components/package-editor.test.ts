import { describe, expect, it } from "vitest";
import { getPackagePickerItems } from "./package-editor-utils";

describe("getPackagePickerItems", () => {
  it("limits the picker to the selected sales order's items", () => {
    const catalog = [
      { id: "item-1", name: "Widget", sku: "W-100" },
      { id: "item-2", name: "Gadget", sku: "G-200" },
      { id: "item-3", name: "Unrelated", sku: "U-300" },
    ];

    const orderLines = [
      { id: "line-1", item_id: "item-1", description: "Widget" },
      { id: "line-2", item_id: "item-2", description: "Gadget" },
    ];

    expect(getPackagePickerItems(catalog, orderLines, "order-1")).toEqual([
      { id: "item-1", name: "Widget", sku: "W-100" },
      { id: "item-2", name: "Gadget", sku: "G-200" },
    ]);
  });
});
