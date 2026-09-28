import "@angular/compiler";
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  atlasPivot,
  atlasChartDomain,
  atlasDashboardOrder,
  atlasMovePanel,
  atlasDate,
  atlasShiftDate,
  atlasShiftMonth,
  atlasCalendarDays,
  atlasEventsOn,
  atlasRichText,
  atlasUpdateRichBlock,
  atlasVirtualRange,
  AtlasRichText,
  AtlasVirtualGrid,
} from "../dist/ui/fesm2022/bqatlas-ui.mjs";
import { PlanningStore } from "../projects/erp/src/showcase/planning-store.ts";
test("pivot preserves exact signed decimals beyond safe integer range and handles empty cells", () => {
  const records = [
    { r: "A", c: "One", v: "9007199254740993.01" },
    { r: "A", c: "One", v: "-0.01" },
    { r: "B", c: "Two", v: "0.20" },
  ];
  const result = atlasPivot(
    records,
    (r) => r.r,
    (r) => r.c,
    (r) => r.v,
  );
  assert.equal(result.grandTotal, "9007199254740993.20");
  assert.deepEqual(result.rows[0].values, ["9007199254740993.00", "0.00"]);
  assert.deepEqual(result.totals, ["9007199254740993.00", "0.20"]);
  assert.equal(records[0].v, "9007199254740993.01");
  assert.equal(
    atlasPivot(
      [],
      (r) => r,
      (r) => r,
      (r) => r,
    ).grandTotal,
    "0.00",
  );
  assert.throws(() =>
    atlasPivot(
      [{ v: "1.234" }],
      () => "",
      () => "",
      (r) => r.v,
    ),
  );
});
test("pivot dimension labels cannot collide through delimiters", () => {
  const result = atlasPivot(
    [
      { r: "a|b", c: "c", v: "1" },
      { r: "a", c: "b|c", v: "2" },
    ],
    (r) => r.r,
    (r) => r.c,
    (r) => r.v,
    0,
  );
  assert.equal(result.rows.length, 2);
  assert.equal(result.grandTotal, "3");
});
test("chart domain includes zero, ignores nonfinite data and handles empty or zero-only series", () => {
  const points = (values) =>
    values.map((value) => ({ id: String(value), label: "Value", value }));
  assert.deepEqual(atlasChartDomain(points([-3, 5, NaN, Infinity])), {
    min: -3,
    max: 5,
  });
  assert.deepEqual(atlasChartDomain(points([0, 0])), { min: 0, max: 1 });
  assert.deepEqual(atlasChartDomain([]), { min: 0, max: 1 });
  assert.deepEqual(atlasChartDomain(points([-5, -2])), { min: -5, max: 0 });
});
test("dashboard drops stale and duplicate IDs, appends new panels, and moves without mutation", () => {
  const ids = ["a", "b", "c"];
  assert.deepEqual(atlasDashboardOrder(ids, ["b", "b", "gone"]), [
    "b",
    "a",
    "c",
  ]);
  assert.deepEqual(atlasMovePanel(ids, "a", "c"), ["b", "c", "a"]);
  assert.deepEqual(atlasMovePanel(ids, "c", "a"), ["c", "a", "b"]);
  assert.deepEqual(atlasMovePanel(ids, "missing", "a"), ids);
  assert.deepEqual(ids, ["a", "b", "c"]);
});
test("calendar date arithmetic clamps month ends and stays independent of local DST", () => {
  assert.equal(atlasShiftMonth("2024-01-31", 1), "2024-02-29");
  assert.equal(atlasShiftMonth("2025-03-31", -1), "2025-02-28");
  assert.equal(atlasShiftDate("2026-03-08", 1), "2026-03-09");
  assert.equal(atlasShiftDate("0099-12-31", 1), "0100-01-01");
  assert.equal(atlasDate("0001-01-01").getUTCFullYear(), 1);
  assert.throws(() => atlasDate("2025-02-29"));
  assert.throws(() => atlasShiftDate("0001-01-01", -1));
  assert.throws(() => atlasShiftMonth("9999-12-01", 1));
  assert.throws(() => atlasShiftDate("2026-01-01", Infinity));
  assert.throws(() => atlasShiftMonth("2026-01-01", Number.MAX_SAFE_INTEGER));
});
test("calendar grids honor week start, preserve 42 cells and handle supported-year boundaries", () => {
  assert.equal(atlasCalendarDays("2026-09")[0], "2026-08-31");
  assert.equal(atlasCalendarDays("2026-09", 0)[0], "2026-08-30");
  assert.equal(atlasCalendarDays("2026-09").length, 42);
  assert.ok(atlasCalendarDays("9999-12").includes(""));
  assert.throws(() => atlasCalendarDays("2026-13"));
});
test("calendar uses inclusive event ranges and ignores invalid or reversed dates", () => {
  const events = [
    { id: "a", title: "A", date: "2026-09-24", endDate: "2026-09-25" },
    { id: "b", title: "B", date: "2026-09-25" },
    { id: "bad", title: "Bad", date: "2026-09-26", endDate: "2026-09-25" },
  ];
  assert.deepEqual(
    atlasEventsOn(events, "2026-09-25").map((e) => e.id),
    ["a", "b"],
  );
  assert.equal(atlasEventsOn(events, "2026-09-26").length, 0);
  assert.equal(atlasEventsOn(events, "garbage").length, 0);
});
test("structured editor preserves text literally and updates blocks immutably", () => {
  const doc = {
    blocks: [
      { id: "a", kind: "paragraph", text: "<script>alert(1)</script>" },
      { id: "b", kind: "bullet", text: "Two" },
    ],
  };
  const next = atlasUpdateRichBlock(doc, "a", { bold: true });
  assert.equal(doc.blocks[0].bold, undefined);
  assert.equal(next.blocks[0].bold, true);
  assert.equal(atlasRichText(next), "<script>alert(1)</script>\nTwo");
  let writes = 0;
  const blocked = {
    disabled: () => false,
    readonly: () => true,
    value: { set: () => writes++ },
    touch: { emit() {} },
  };
  AtlasRichText.prototype.edit.call(blocked, "a", { text: "changed" });
  assert.equal(writes, 0);
});
test("virtual ranges stay bounded at 50,000 rows, overscroll, empty and malformed dimensions", () => {
  for (const offset of [0, 32, 700000, 1600000, Infinity, -40]) {
    const range = atlasVirtualRange(50000, offset, 368, 32);
    assert.ok(range.end - range.start <= 21);
    assert.ok(range.start >= 0 && range.end <= 50000);
    assert.equal(
      range.top + (range.end - range.start) * 32 + range.bottom,
      1600000,
    );
  }
  const last = atlasVirtualRange(50000, 1600000, 368, 32);
  assert.equal(last.end, 50000);
  assert.equal(last.bottom, 0);
  assert.deepEqual(atlasVirtualRange(0, 900, 368, 32), {
    start: 0,
    end: 0,
    top: 0,
    bottom: 0,
  });
  assert.equal(atlasVirtualRange(NaN, NaN, NaN, NaN).end, 0);
});
test("virtual grid keyboard clamps selection and activates the selected record", () => {
  const rows = [{ id: "a" }, { id: "b" }];
  let selected,
    activated,
    prevented = 0;
  const grid = {
    loading: () => false,
    error: () => "",
    rows: () => rows,
    activeIndex: () => 1,
    viewportHeight: () => 400,
    size: () => 32,
    select: (i) => (selected = i),
    rowActivated: { emit: (row) => (activated = row) },
  };
  const event = (key) => ({
    key,
    preventDefault() {
      prevented++;
    },
  });
  AtlasVirtualGrid.prototype.key.call(grid, event("ArrowDown"));
  assert.equal(selected, 1);
  AtlasVirtualGrid.prototype.key.call(grid, event("Home"));
  assert.equal(selected, 0);
  AtlasVirtualGrid.prototype.key.call(grid, event("Enter"));
  assert.deepEqual(activated, rows[1]);
  assert.equal(prevented, 3);
});
test("planning instances isolate drafts; failed saves retain edits and can retry", async () => {
  const a = new PlanningStore(),
    b = new PlanningStore();
  a.update({ title: "Changed" });
  assert.equal(b.dirty(), false);
  a.failNext.set(true);
  await assert.rejects(
    a.save(async () => {}),
    /Simulated/,
  );
  assert.equal(a.draft().title, "Changed");
  assert.equal(a.dirty(), true);
  await a.save(async () => {});
  assert.equal(a.dirty(), false);
  assert.equal(b.draft().title, "Dispatch customer orders");
});
test("invalid planning input reports validation without entering a save", async () => {
  const store = new PlanningStore();
  store.update({ date: "2026-02-30" });
  await assert.rejects(store.save(), /valid delivery date/);
  assert.match(store.error(), /valid delivery date/);
  assert.equal(store.saving(), false);
});
test("planning reset, disposal and read-only changes reject stale saves", async () => {
  for (const action of ["reset", "dispose", "readonly"]) {
    const store = new PlanningStore();
    store.update({ title: "Pending" });
    let resolve;
    const pending = store.save(() => new Promise((done) => (resolve = done)));
    if (action === "readonly") store.readonly.set(true);
    else store[action]();
    resolve();
    await assert.rejects(pending, /cancelled/);
    assert.equal(store.saved().title, "Dispatch customer orders");
  }
});
test("planning saves only its submitted snapshot, preserving newer programmatic edits", async () => {
  const store = new PlanningStore();
  store.update({ title: "Snapshot" });
  let resolve;
  const pending = store.save(() => new Promise((done) => (resolve = done)));
  store.draft.update((draft) => ({ ...draft, title: "Newer" }));
  resolve();
  await pending;
  assert.equal(store.saved().title, "Snapshot");
  assert.equal(store.draft().title, "Newer");
  assert.equal(store.dirty(), true);
});
