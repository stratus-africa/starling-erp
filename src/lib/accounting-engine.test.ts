import { describe, expect, it } from "vitest";
import { assertStatusTransitionAllowed } from "./accounting-engine";

describe("accounting workflow transitions", () => {
  it("allows valid quote transitions", () => {
    expect(assertStatusTransitionAllowed("quote", "Draft", "Sent")).toBe(true);
    expect(assertStatusTransitionAllowed("quote", "Viewed", "Accepted")).toBe(true);
  });

  it("blocks invalid quote transitions", () => {
    expect(assertStatusTransitionAllowed("quote", "Accepted", "Sent")).toBe(false);
    expect(assertStatusTransitionAllowed("quote", "Draft", "Accepted")).toBe(false);
  });

  it("allows valid sales order transitions", () => {
    expect(assertStatusTransitionAllowed("sales_order", "Draft", "Confirmed")).toBe(true);
    expect(assertStatusTransitionAllowed("sales_order", "Confirmed", "Processing")).toBe(true);
  });

  it("blocks invalid sales order transitions", () => {
    expect(assertStatusTransitionAllowed("sales_order", "Draft", "Processing")).toBe(false);
    expect(assertStatusTransitionAllowed("sales_order", "Completed", "Confirmed")).toBe(false);
  });
});
