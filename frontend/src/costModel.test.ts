import { describe, expect, it } from "vitest";
import { buildIndexes, unitCost } from "./costModel";
import type { DataResponse } from "./types";
import data from "./__fixtures__/data.json";
import expected from "./__fixtures__/expected_costs.json";

/* Cost-model parity guard: the TS port must produce, for the seeded data, the
   exact same unit costs as the reference Python implementation (app/cost.py),
   which is itself anchored to hand-computed values in the backend tests. */
describe("unitCost parity with backend cost model", () => {
  const { items, recipes } = data as DataResponse;
  const { byId, recipeOf } = buildIndexes(items, recipes);
  const exp = expected as Record<string, number | null>;

  it("matches expected cost for every item", () => {
    for (const item of items) {
      const got = unitCost(item.id, byId, recipeOf);
      const want = exp[item.id];
      if (want == null) {
        expect(got, item.id).toBeNull();
      } else {
        expect(got, item.id).not.toBeNull();
        expect(Math.abs((got as number) - want), item.id).toBeLessThan(1e-9);
      }
    }
  });
});
