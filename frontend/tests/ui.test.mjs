import "@angular/compiler";
import { test } from "node:test";
import assert from "node:assert/strict";
import { WorkspaceService } from "../dist/ui/fesm2022/bqatlas-ui.mjs";
class TestScreen {}
function setup() {
  const ws = new WorkspaceService();
  ws.register(
    {
      id: "order",
      title: "Order",
      icon: "orders",
      component: TestScreen,
      instance: "keyed",
    },
    {
      id: "list",
      title: "Orders",
      icon: "orders",
      component: TestScreen,
      instance: "singleton",
    },
  );
  return ws;
}

test("keyed tasks reuse identity and retain a dirty draft", () => {
  const ws = setup();
  const a = ws.open({
    screen: "order",
    key: "1",
    data: { reference: "initial" },
  });
  a.data.set({ reference: "edited" });
  a.dirty.set(true);
  const b = ws.open({
    screen: "order",
    key: "1",
    data: { reference: "reset" },
  });
  assert.equal(a.id, b.id);
  assert.equal(ws.tasks().length, 1);
  assert.equal(b.data().reference, "edited");
  assert.equal(b.dirty(), true);
});
test("singleton screen reuses one instance and keyed screens require a key", () => {
  const ws = setup();
  ws.open({ screen: "list", data: null });
  ws.open({ screen: "list", data: null });
  assert.equal(ws.tasks().length, 1);
  assert.throws(
    () => ws.open({ screen: "order", data: null }),
    /requires a key/,
  );
});
test("maximize and mobile transitions preserve desktop geometry and task data", () => {
  const ws = setup();
  const a = ws.open({ screen: "order", key: "1", data: { draft: 42 } });
  ws.move(a.id, { x: 60, y: 70, width: 600, height: 450 });
  const before = { ...ws.active().bounds };
  ws.toggleMaximize(a.id);
  ws.setViewport(390, 500, true);
  assert.deepEqual(ws.active().bounds, before);
  assert.equal(ws.active().data().draft, 42);
  ws.setViewport(1100, 690, false);
  ws.toggleMaximize(a.id);
  assert.deepEqual(ws.active().bounds, before);
});
test("geometry stays reachable after viewport shrink", () => {
  const ws = setup();
  const a = ws.open({ screen: "order", key: "1", data: null });
  ws.move(a.id, { x: 900, y: 800, width: 800, height: 600 });
  ws.setViewport(720, 400, false);
  const b = ws.active().bounds;
  assert.ok(b.x >= 8 && b.y >= 8);
  assert.ok(b.x + b.width <= 712);
  assert.ok(b.y + b.height <= 392);
});
test("minimize and close restore an available active task", async () => {
  const ws = setup();
  const a = ws.open({ screen: "list", data: null });
  const b = ws.open({ screen: "order", key: "1", data: null, origin: a.id });
  ws.minimize(b.id);
  assert.equal(ws.activeId(), a.id);
  ws.activate(b.id);
  await ws.requestClose(b.id);
  assert.equal(ws.activeId(), a.id);
  assert.equal(ws.tasks().length, 1);
});
test("dirty close can be cancelled and discarded without saving", async () => {
  const ws = setup();
  const a = ws.open({ screen: "order", key: "1", data: null });
  a.dirty.set(true);
  await ws.requestClose(a.id);
  assert.equal(ws.pendingClose(), a.id);
  ws.cancelClose();
  assert.equal(ws.tasks().length, 1);
  await ws.requestClose(a.id);
  ws.discardClose();
  assert.equal(ws.tasks().length, 0);
});
test("failed save retains the draft and close prompt; retry saves and disposes", async () => {
  const ws = setup();
  const a = ws.open({
    screen: "order",
    key: "1",
    data: { reference: "draft" },
  });
  a.dirty.set(true);
  let fail = true;
  let disposed = 0;
  ws.active().lifecycle.save = async () => {
    if (fail) throw new Error("Network failure");
  };
  ws.active().lifecycle.dispose = () => disposed++;
  await ws.requestClose(a.id);
  await ws.saveAndClose();
  assert.equal(ws.tasks().length, 1);
  assert.equal(a.data().reference, "draft");
  assert.equal(a.error(), "Network failure");
  assert.equal(ws.pendingClose(), a.id);
  fail = false;
  await ws.saveAndClose();
  assert.equal(ws.tasks().length, 0);
  assert.equal(disposed, 1);
  assert.equal(ws.pendingClose(), null);
});
test("saving prevents simultaneous discard and duplicate save", async () => {
  const ws = setup();
  const a = ws.open({ screen: "order", key: "1", data: null });
  a.dirty.set(true);
  let release;
  ws.active().lifecycle.save = () =>
    new Promise((resolve) => (release = resolve));
  await ws.requestClose(a.id);
  const save = ws.saveAndClose();
  ws.discardClose();
  assert.equal(ws.tasks().length, 1);
  assert.equal(await ws.save(a.id), false);
  release();
  await save;
  assert.equal(ws.tasks().length, 0);
});
test("closing tasks removes them from retained activation history", async () => {
  const ws = setup();
  const list = ws.open({ screen: "list", data: null });
  for (let i = 0; i < 50; i++) {
    const task = ws.open({ screen: "order", key: String(i), data: {} });
    await ws.requestClose(task.id);
  }
  assert.equal(ws.tasks().length, 1);
  assert.equal(ws.activeId(), list.id);
  assert.ok(ws.history.every((id) => id === list.id));
});

test("lifecycle hooks assigned through the open result survive presentation updates", async () => {
  const ws = setup();
  const a = ws.open({ screen: "order", key: "1", data: null });
  let saved = 0;
  a.lifecycle.save = async () => {
    saved++;
  };
  ws.move(a.id, { x: 10, y: 10, width: 500, height: 400 });
  ws.activate(a.id);
  a.dirty.set(true);
  assert.equal(await ws.save(a.id), true);
  assert.equal(saved, 1);
});
test("activation changes stacking without reordering task DOM identities", () => {
  const ws = setup();
  const a = ws.open({ screen: "order", key: "1", data: null });
  const b = ws.open({ screen: "order", key: "2", data: null });
  ws.activate(a.id);
  assert.deepEqual(
    ws.tasks().map((t) => t.id),
    [a.id, b.id],
  );
  assert.deepEqual(ws.stackOrder(), [b.id, a.id]);
});

test("Back follows origins, and root Back returns home without task-switch loops", () => {
  const ws = setup();
  const list = ws.open({ screen: "list", data: null });
  const order = ws.open({
    screen: "order",
    key: "1",
    data: { draft: 1 },
    origin: list.id,
  });
  ws.back();
  assert.equal(ws.activeId(), list.id);
  ws.back();
  assert.equal(ws.activeId(), null);
  assert.equal(ws.tasks().length, 2);
  ws.activate(order.id);
  assert.equal(ws.active().data().draft, 1);
});

const { filterCollection, sortCollection, pageCollection } = await import(
  "../dist/ui/fesm2022/bqatlas-ui.mjs"
);
test("collection search matches every term across fields without mutating rows", () => {
  const rows = [
    { name: "Northstar Supply", city: "Dhaka" },
    { name: "Northstar Studio", city: "London" },
  ];
  assert.deepEqual(
    filterCollection(rows, "  DHAKA northstar ", (r) => `${r.name} ${r.city}`),
    [rows[0]],
  );
  assert.equal(rows.length, 2);
});
test("collection sort supports natural numeric ordering and nulls last in either direction", () => {
  const rows = [{ value: "Item 10" }, { value: null }, { value: "Item 2" }];
  assert.deepEqual(
    sortCollection(rows, (r) => r.value).map((r) => r.value),
    ["Item 2", "Item 10", null],
  );
  assert.deepEqual(
    sortCollection(rows, (r) => r.value, "desc").map((r) => r.value),
    ["Item 10", "Item 2", null],
  );
  assert.equal(rows[0].value, "Item 10");
});
test("collection pagination clamps stale page indices after filtering", () => {
  assert.deepEqual(pageCollection([1, 2, 3], 10, 2), {
    items: [3],
    page: 1,
    pages: 2,
    total: 3,
    size: 2,
  });
  assert.deepEqual(pageCollection([], 2, 0), {
    items: [],
    page: 0,
    pages: 1,
    total: 0,
    size: 1,
  });
});

const { createEnvironmentInjector, runInInjectionContext, Injector } =
  await import("@angular/core");
const { AtlasTextInput, AtlasNumberInput } = await import(
  "../dist/ui/fesm2022/bqatlas-ui.mjs"
);
test("text control distinguishes programmatic writes from edits and honors disabled state", () => {
  const injector = createEnvironmentInjector([], Injector.NULL);
  try {
    const control = runInInjectionContext(injector, () => new AtlasTextInput());
    const changes = [];
    let touched = 0;
    control.registerOnChange((value) => changes.push(value));
    control.registerOnTouched(() => touched++);
    control.writeValue("initial");
    assert.deepEqual(changes, []);
    control.edit("changed");
    assert.deepEqual(changes, ["changed"]);
    control.setDisabledState(true);
    control.edit("blocked");
    assert.equal(control.value(), "changed");
    control.setDisabledState(false);
    control.clear();
    assert.equal(control.value(), "");
    assert.equal(touched, 1);
    control.writeValue(null);
    assert.equal(control.value(), null);
    assert.deepEqual(changes, ["changed", ""]);
  } finally {
    injector.destroy();
  }
});
test("number control supports empty values and stepping without emitting programmatic writes", () => {
  const injector = createEnvironmentInjector([], Injector.NULL);
  try {
    const control = runInInjectionContext(
      injector,
      () => new AtlasNumberInput(),
    );
    const changes = [];
    control.registerOnChange((value) => changes.push(value));
    control.writeValue(12);
    control.increment(1);
    assert.equal(control.value(), 13);
    control.edit("");
    assert.equal(control.value(), null);
    control.edit("12.5");
    assert.equal(control.value(), 12.5);
    control.setDisabledState(true);
    control.increment(1);
    assert.equal(control.value(), 12.5);
    assert.deepEqual(changes, [13, null, 12.5]);
  } finally {
    injector.destroy();
  }
});

const { filterLookup, lookupCell, nextLookupIndex } = await import(
  "../dist/ui/fesm2022/bqatlas-ui.mjs"
);
const lookupRows = [
  { id: "C-1", name: "Acme", city: "Dhaka", balance: 1234, archived: false },
  { id: "C-2", name: "Northstar", city: "London", balance: 0, archived: true },
  { id: "C-3", name: "Meridian", city: "Dhaka", balance: 500, archived: false },
];
const lookupColumns = [
  { key: "id", label: "Code" },
  { key: "name", label: "Customer" },
  { key: "city", label: "City" },
  {
    key: "balance",
    label: "Balance",
    format: (row) => row.balance.toLocaleString("en-US"),
  },
];
test("lookup search spans columns, matches all terms, and preserves source identity", () => {
  const result = filterLookup(lookupRows, lookupColumns, "dhaka acme");
  assert.deepEqual(
    result.map((row) => row.id),
    ["C-1"],
  );
  assert.equal(result[0], lookupRows[0]);
  assert.deepEqual(
    lookupRows.map((row) => row.id),
    ["C-1", "C-2", "C-3"],
  );
  assert.equal(filterLookup(lookupRows, lookupColumns, "missing").length, 0);
});
test("lookup searches formatted values and excludes nonsearchable columns", () => {
  assert.equal(lookupCell(lookupRows[0], lookupColumns[3]), "1,234");
  assert.equal(filterLookup(lookupRows, lookupColumns, "1,234")[0].id, "C-1");
  assert.equal(
    filterLookup(
      lookupRows,
      [{ key: "city", label: "City", searchable: false }],
      "Dhaka",
    ).length,
    0,
  );
});
test("lookup keyboard navigation skips disabled records and wraps in both directions", () => {
  const disabled = (row) => row.archived;
  assert.equal(nextLookupIndex(lookupRows, 0, "ArrowDown", disabled), 2);
  assert.equal(nextLookupIndex(lookupRows, 2, "ArrowDown", disabled), 0);
  assert.equal(nextLookupIndex(lookupRows, 0, "ArrowUp", disabled), 2);
  assert.equal(nextLookupIndex(lookupRows, 2, "Home", disabled), 0);
  assert.equal(nextLookupIndex(lookupRows, 0, "End", disabled), 2);
});
test("lookup navigation handles empty results, stale highlights, and fully disabled results", () => {
  assert.equal(
    nextLookupIndex([], 5, "ArrowDown", () => false),
    -1,
  );
  assert.equal(
    nextLookupIndex(lookupRows, 99, "ArrowDown", () => false),
    0,
  );
  assert.equal(
    nextLookupIndex(lookupRows, -1, "ArrowUp", () => false),
    2,
  );
  assert.equal(
    nextLookupIndex(lookupRows, 0, "Home", () => true),
    -1,
  );
});

const { validCalendarDate, dateRangeError, parseLocaleNumber, toggleChoice } =
  await import("../dist/ui/fesm2022/bqatlas-ui.mjs");
test("multi selection is immutable, unique, removable at the limit, and bounded", () => {
  const original = ["a", "b"];
  assert.deepEqual(toggleChoice(original, "c", 2), ["a", "b"]);
  assert.deepEqual(toggleChoice(original, "a", 2), ["b"]);
  assert.deepEqual(original, ["a", "b"]);
  assert.deepEqual(toggleChoice(["a"], "b", 2), ["a", "b"]);
});
test("date-only validation handles leap years without timezone conversion", () => {
  assert.equal(validCalendarDate("2024-02-29"), true);
  assert.equal(validCalendarDate("2100-02-29"), false);
  assert.equal(validCalendarDate("2000-02-29"), true);
  assert.equal(validCalendarDate("2026-04-31"), false);
  assert.equal(validCalendarDate("2026-9-1"), false);
});
test("date ranges enforce completeness, ordering and bounds", () => {
  assert.equal(dateRangeError({ start: "", end: "" }), "");
  assert.match(dateRangeError({ start: "2026-09-01", end: "" }), /both/);
  assert.match(
    dateRangeError({ start: "2026-09-10", end: "2026-09-01" }),
    /after/,
  );
  assert.equal(dateRangeError({ start: "2026-09-01", end: "2026-09-01" }), "");
  assert.match(
    dateRangeError(
      { start: "2026-09-01", end: "2026-10-01" },
      "",
      "2026-09-30",
    ),
    /before/,
  );
});
test("locale number parsing distinguishes decimal separators and rejects malformed groups", () => {
  assert.equal(parseLocaleNumber("1,234.50", "en-US"), 1234.5);
  assert.equal(parseLocaleNumber("1.234,50", "de-DE"), 1234.5);
  assert.equal(parseLocaleNumber("-12,5", "de-DE"), -12.5);
  assert.equal(parseLocaleNumber("", "en-US"), null);
  assert.equal(parseLocaleNumber("1,2,3", "en-US"), undefined);
  assert.equal(parseLocaleNumber("12.3.4", "en-US"), undefined);
  assert.equal(parseLocaleNumber("Infinity", "en-US"), undefined);
  assert.equal(parseLocaleNumber("123abc", "en-US"), undefined);
});

const {
  sortByColumns,
  matchesColumnFilters,
  AtlasLatestRequest,
  flattenTree,
  findTreeNode,
} = await import("../dist/ui/fesm2022/bqatlas-ui.mjs");
test("multi-sort applies ordered tie breakers and keeps nulls last in both directions", () => {
  const rows = [
    { id: "a", region: "West", value: 10 },
    { id: "b", region: "East", value: null },
    { id: "c", region: "East", value: 2 },
    { id: "d", region: "East", value: 10 },
    { id: "e", region: "East", value: 10 },
  ];
  const sorted = sortByColumns(
    rows,
    [
      { key: "region", direction: "asc" },
      { key: "value", direction: "desc" },
    ],
    (r, k) => r[k],
  );
  assert.deepEqual(
    sorted.map((r) => r.id),
    ["d", "e", "c", "b", "a"],
  );
  assert.deepEqual(
    rows.map((r) => r.id),
    ["a", "b", "c", "d", "e"],
  );
});
test("column filters combine with AND and use supplied display text", () => {
  const row = { city: "Dhaka", price: 1234 };
  const text = (r, k) => (k === "price" ? "$1,234.00" : r[k]);
  assert.equal(
    matchesColumnFilters(row, { city: " DHA ", price: "1,234" }, text),
    true,
  );
  assert.equal(
    matchesColumnFilters(row, { city: "London", price: "1,234" }, text),
    false,
  );
  assert.equal(matchesColumnFilters(row, { city: "" }, text), true);
});
test("latest request aborts superseded work and ignores stale responses even without provider cancellation", async () => {
  const runner = new AtlasLatestRequest(),
    accepted = [],
    rejected = [];
  let firstResolve, firstSignal;
  const first = runner.run(
    (signal) => {
      firstSignal = signal;
      return new Promise((resolve) => (firstResolve = resolve));
    },
    (value) => accepted.push(value),
    (error) => rejected.push(error),
  );
  await runner.run(
    async () => "new",
    (value) => accepted.push(value),
    (error) => rejected.push(error),
  );
  assert.equal(firstSignal.aborted, true);
  firstResolve("stale");
  await first;
  assert.deepEqual(accepted, ["new"]);
  assert.deepEqual(rejected, []);
});
test("latest request ignores obsolete failure, exposes current failure, and permits retry", async () => {
  const runner = new AtlasLatestRequest(),
    accepted = [],
    rejected = [];
  let rejectFirst;
  const old = runner.run(
    () => new Promise((_, reject) => (rejectFirst = reject)),
    (v) => accepted.push(v),
    (e) => rejected.push(e),
  );
  await runner.run(
    async () => {
      throw "current";
    },
    (v) => accepted.push(v),
    (e) => rejected.push(e),
  );
  rejectFirst("obsolete");
  await old;
  await runner.run(
    async () => "retry success",
    (v) => accepted.push(v),
    (e) => rejected.push(e),
  );
  assert.deepEqual(rejected, ["current"]);
  assert.deepEqual(accepted, ["retry success"]);
});
test("destroy cancellation prevents late adapter writes", async () => {
  const runner = new AtlasLatestRequest();
  let resolve,
    writes = 0;
  const pending = runner.run(
    () => new Promise((r) => (resolve = r)),
    () => writes++,
    () => writes++,
  );
  runner.cancel();
  resolve("late");
  await pending;
  assert.equal(writes, 0);
});
const hierarchy = [
  {
    id: "region",
    label: "Region",
    children: [
      {
        id: "a",
        label: "Warehouse A",
        children: [{ id: "bay", label: "Cold bay", disabled: true }],
      },
      { id: "b", label: "Warehouse B" },
    ],
  },
  { id: "other", label: "Other" },
];
test("tree flattening preserves levels, sibling metadata, parent IDs and independent expansion", () => {
  const expanded = ["region", "a"];
  const rows = flattenTree(hierarchy, expanded);
  assert.deepEqual(
    rows.map((r) => [r.node.id, r.level, r.parent, r.position, r.size]),
    [
      ["region", 1, null, 1, 2],
      ["a", 2, "region", 1, 2],
      ["bay", 3, "a", 1, 1],
      ["b", 2, "region", 2, 2],
      ["other", 1, null, 2, 2],
    ],
  );
  assert.deepEqual(
    flattenTree(hierarchy, []).map((r) => r.node.id),
    ["region", "other"],
  );
  assert.deepEqual(expanded, ["region", "a"]);
});
test("tree search reveals matching ancestors without changing expansion or selection identity", () => {
  const expanded = [];
  assert.deepEqual(
    flattenTree(hierarchy, expanded, "cold").map((r) => r.node.id),
    ["region", "a", "bay"],
  );
  assert.equal(
    findTreeNode(hierarchy, "bay"),
    hierarchy[0].children[0].children[0],
  );
  assert.equal(findTreeNode(hierarchy, "missing"), undefined);
  assert.deepEqual(flattenTree(hierarchy, [], "unknown"), []);
  assert.deepEqual(expanded, []);
});

test("tree keyboard resolves a retained row by ID after expansion and keeps focus separate from selection", async () => {
  const { AtlasTree } = await import("../dist/ui/fesm2022/bqatlas-ui.mjs");
  const { signal } = await import("@angular/core");
  const injector = createEnvironmentInjector([], Injector.NULL);
  try {
    const tree = runInInjectionContext(injector, () => new AtlasTree());
    tree.nodes = signal(hierarchy);
    tree.expandedIds.set(["region"]);
    const retained = tree.visible()[1];
    tree.expandedIds.set(["region", "a"]);
    let focused = -1,
      prevented = false;
    const buttons = tree
      .visible()
      .map((_, index) => ({ focus: () => (focused = index) }));
    tree.key(
      {
        key: "ArrowDown",
        preventDefault: () => (prevented = true),
        currentTarget: { parentElement: { querySelectorAll: () => buttons } },
      },
      retained,
    );
    assert.equal(focused, 2);
    assert.equal(tree.focused(), "bay");
    assert.equal(tree.selectedId(), null);
    assert.equal(prevented, true);
    tree.choose(tree.visible()[2]);
    assert.equal(tree.selectedId(), null, "disabled nodes cannot commit");
    tree.choose(tree.visible()[3]);
    assert.equal(tree.selectedId(), "b");
  } finally {
    injector.destroy();
  }
});

const { validateEditRow, replaceEditedRow } = await import(
  "../dist/ui/fesm2022/bqatlas-ui.mjs"
);
const editColumns = [
  { key: "id", label: "ID", readonly: true },
  { key: "name", label: "Description", required: true },
  {
    key: "quantity",
    label: "Quantity",
    type: "number",
    required: true,
    min: 1,
    max: 100,
    step: 1,
  },
  {
    key: "price",
    label: "Price",
    type: "number",
    required: true,
    min: 0,
    step: 0.01,
  },
];
test("row validation rejects blank, nonfinite, out-of-range and fractional unit quantities", () => {
  assert.equal(
    Object.keys(
      validateEditRow(
        { id: "1", name: "Desk", quantity: 2, price: 1.23 },
        editColumns,
      ),
    ).length,
    0,
  );
  assert.ok(
    validateEditRow(
      { id: "1", name: " ", quantity: 0, price: NaN },
      editColumns,
    ).name,
  );
  assert.ok(
    validateEditRow({ name: "Desk", quantity: 1.5, price: 0 }, editColumns)
      .quantity,
  );
  assert.ok(
    validateEditRow({ name: "Desk", quantity: 101, price: 0 }, editColumns)
      .quantity,
  );
  assert.ok(
    validateEditRow(
      { name: "Desk", quantity: null, price: Infinity },
      editColumns,
    ).price,
  );
});
test("row validation checks available select values and ignores derived readonly fields", () => {
  const columns = [
    {
      key: "status",
      label: "Status",
      type: "select",
      required: true,
      options: [
        { value: "open", label: "Open" },
        { value: "closed", label: "Closed", disabled: true },
      ],
    },
    { key: "derived", label: "Derived", readonly: true, required: true },
  ];
  assert.deepEqual(validateEditRow({ status: "open" }, columns), {});
  assert.ok(validateEditRow({ status: "closed" }, columns).status);
  assert.ok(validateEditRow({ status: "unknown" }, columns).status);
});
test("applying a row replaces only its stable key and isolates subsequent draft mutations", () => {
  const original = [
    { id: "a", name: "Desk", nested: { count: 1 } },
    { id: "b", name: "Chair", nested: { count: 2 } },
  ];
  const draft = structuredClone(original[0]);
  draft.name = "Changed";
  const updated = replaceEditedRow(original, draft, "id");
  draft.nested.count = 9;
  assert.equal(original[0].name, "Desk");
  assert.equal(updated[0].name, "Changed");
  assert.equal(updated[0].nested.count, 1);
  assert.equal(updated[1], original[1]);
  assert.throws(
    () => replaceEditedRow(original, { id: "missing" }, "id"),
    /no longer exists/,
  );
});

// Exercise the actual signal-backed demo store without requiring a browser renderer.
const { matchesFilterRules, AtlasFilterBuilder, AtlasPropertySheet } = await import('../dist/ui/fesm2022/bqatlas-ui.mjs');
test('filter rules combine AND, preserve case-insensitive text and reject empty numeric operands', () => {
 const row={name:'Northstar',balance:1250};
 const rules=[{id:'a',field:'name',operator:'contains',value:'STAR'},{id:'b',field:'balance',operator:'gte',value:'1000'}];
 assert.equal(matchesFilterRules(row,rules),true);
 assert.equal(matchesFilterRules({...row,balance:900},rules),false);
 assert.equal(matchesFilterRules(row,[{...rules[1],value:''}]),false);
 assert.equal(matchesFilterRules(row,[{...rules[1],value:'Infinity'}]),false);
 assert.equal(matchesFilterRules(row,[{...rules[1],operator:'equals',value:'1250.00'}]),true);
 assert.equal(matchesFilterRules({},rules),false);
 assert.equal(matchesFilterRules(row,[]),true);
});
test('saved filter snapshots and property edits isolate their original values', () => {
 const injector=createEnvironmentInjector([],Injector.NULL);
 try {
  const builder=runInInjectionContext(injector,()=>new AtlasFilterBuilder());
  const original=[{id:'a',field:'name',operator:'contains',value:'Desk'}];
  const draft=builder.copy(original);draft[0].value='Chair';assert.equal(original[0].value,'Desk');
  const sheet=runInInjectionContext(injector,()=>new AtlasPropertySheet());
  const data={name:'Before',amount:10};sheet.value.set(data);sheet.set('name','After');
  assert.equal(data.name,'Before');assert.equal(sheet.value().name,'After');assert.equal(sheet.value().amount,10);
 } finally {injector.destroy();}
});

const { AtlasUploadQueue } = await import('../dist/ui/fesm2022/bqatlas-ui.mjs');
const { documentKind } = await import('../dist/ui/fesm2022/bqatlas-ui-documents.mjs');
test('upload removal aborts work and ignores stale completion and progress', async () => {
 let context,finish; const queue=new AtlasUploadQueue((file,ctx)=>{context=ctx;return new Promise(resolve=>finish=resolve);});
 queue.add([new File(['sample'],'sample.txt',{type:'text/plain'})]);const id=queue.files()[0].id;
 queue.remove(id);assert.equal(context.signal.aborted,true);context.progress(100);finish();await Promise.resolve();assert.deepEqual(queue.files(),[]);queue.destroy();
});
test('upload retry preserves source, validates size and completes after failure', async () => {
 let fail=true;const queue=new AtlasUploadQueue(async()=>{if(fail)throw new Error('Offline');},10);
 queue.add([new File(['12345678901'],'large.txt')]);assert.equal(queue.files().length,0);assert.ok(queue.error());
 queue.add([new File(['abc'],'small.txt')]);await Promise.resolve();assert.equal(queue.files()[0].status,'error');fail=false;await queue.upload(queue.files()[0].id);assert.equal(queue.files()[0].status,'ready');queue.destroy();
});
test('document format routing excludes active SVG and HTML rendering',()=>{
 assert.equal(documentKind({name:'a.svg',type:'image/svg+xml'}),'unsupported');
 assert.equal(documentKind({name:'a.html',type:'text/html'}),'text');
 assert.equal(documentKind({name:'a.pdf',type:'application/pdf'}),'pdf');
 assert.equal(documentKind({name:'a.png',type:'image/png'}),'image');
});
