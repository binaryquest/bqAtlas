import "@angular/compiler";
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  atlasHeaderBands,
  atlasGroupRows,
  atlasSumDecimal,
  atlasSummaryQueryKey,
  atlasCheckLeaves,
  atlasCheckState,
  atlasToggleChecks,
  flattenTree,
  AtlasHierarchyBase,
  AtlasTable,
} from "../dist/ui/fesm2022/bqatlas-ui.mjs";

test("decimal summaries retain cents and signs beyond Number precision and reject accidental rounding", () => {
  assert.equal(atlasSumDecimal(["0.10", "0.20", "-0.05"]), "0.25");
  assert.equal(
    atlasSumDecimal(["9007199254740993.01", "0.02"]),
    "9007199254740993.03",
  );
  assert.equal(atlasSumDecimal(["-0.10", "0.10"]), "0.00");
  assert.equal(atlasSumDecimal([], 0), "0");
  assert.throws(() => atlasSumDecimal(["1.001"]), /precision/);
  assert.throws(() => atlasSumDecimal(["NaN"]), /decimal/);
  assert.throws(() => atlasSumDecimal(["1"], -1), /scale/);
});
test("header spans follow actual visible order, including split groups after pinning", () => {
  assert.deepEqual(
    atlasHeaderBands([
      { group: "Money" },
      { group: "Order" },
      { group: "Order" },
      { group: "Money" },
      {},
    ]),
    [
      { label: "Money", span: 1 },
      { label: "Order", span: 2 },
      { label: "Money", span: 1 },
      { label: "", span: 1 },
    ],
  );
  assert.deepEqual(atlasHeaderBands([]), []);
});
test("page groups preserve within-group sort order and do not mutate rows", () => {
  const rows = [
    { id: 3, customer: "B" },
    { id: 2, customer: "A" },
    { id: 1, customer: "B" },
  ];
  const groups = atlasGroupRows(rows, (row) => row.customer);
  assert.deepEqual(
    groups.map((group) => [group.key, group.rows.map((row) => row.id)]),
    [
      ["B", [3, 1]],
      ["A", [2]],
    ],
  );
  assert.deepEqual(
    rows.map((row) => row.id),
    [3, 2, 1],
  );
  assert.equal(atlasGroupRows([], () => "").length, 0);
});
test("server aggregate request identity normalizes filters but rejects stale page/search/sort responses", () => {
  const q = {
    page: 0,
    pageSize: 6,
    search: "",
    filters: { b: "2", a: "1" },
    sort: [],
  };
  assert.equal(
    atlasSummaryQueryKey(q),
    atlasSummaryQueryKey({ ...q, filters: { a: "1", b: "2" } }),
  );
  for (const patch of [
    { page: 1 },
    { search: "new" },
    { sort: [{ key: "id", direction: "desc" }] },
  ])
    assert.notEqual(
      atlasSummaryQueryKey(q),
      atlasSummaryQueryKey({ ...q, ...patch }),
    );
});
const tree = {
  id: "root",
  label: "Accounts",
  children: [
    { id: "a", label: "Cash" },
    { id: "b", label: "Bank" },
    {
      id: "locked",
      label: "Locked",
      disabled: true,
      children: [{ id: "hidden", label: "Hidden" }],
    },
  ],
};
test("tri-state cascade excludes disabled branches and preserves selections outside this branch", () => {
  assert.deepEqual(atlasCheckLeaves(tree), ["a", "b"]);
  assert.equal(atlasCheckState(tree, []), false);
  assert.equal(atlasCheckState(tree, ["a"]), "mixed");
  assert.equal(atlasCheckState(tree, ["a", "b"]), true);
  assert.deepEqual(atlasToggleChecks(tree, ["other", "a"]), [
    "other",
    "a",
    "b",
  ]);
  assert.deepEqual(atlasToggleChecks(tree, ["other", "a", "b"]), ["other"]);
});
test("unloaded branches cannot be selected as if their children were known", () => {
  const partial = {
    id: "p",
    label: "Partial",
    children: [tree, { id: "lazy", label: "Lazy", hasChildren: true }],
  };
  assert.equal(atlasCheckLeaves(partial), null);
  assert.equal(atlasCheckState(partial, ["a"]), "mixed");
  assert.deepEqual(atlasToggleChecks(partial, ["a"]), ["a"]);
  assert.deepEqual(
    atlasCheckLeaves({
      id: "empty",
      label: "Empty",
      hasChildren: true,
      children: [],
    }),
    [],
  );
  assert.equal(
    flattenTree([{ id: "lazy", label: "Lazy", hasChildren: true }], ["lazy"])[0]
      .expanded,
    true,
  );
});
function state(value) {
  const fn = () => value;
  fn.set = (next) => (value = next);
  fn.update = (update) => (value = update(value));
  return fn;
}
function hierarchy(nodes = [tree]) {
  const instance = Object.create(AtlasHierarchyBase.prototype);
  Object.assign(instance, {
    nodes: () => nodes,
    disabled: () => false,
    readonly: () => false,
    focused: state(null),
    expandedIds: state([]),
    selectedId: state(null),
    checkedIds: state([]),
    loadChildren: { emit: () => {} },
    nodeSelected: { emit: () => {} },
  });
  instance.visible = () => flattenTree(nodes, instance.expandedIds());
  return instance;
}
test("lazy expansion emits once while loading; instances retain independent expansion and check state", () => {
  const node = { id: "lazy", label: "Assembly", hasChildren: true };
  const a = hierarchy([node]),
    b = hierarchy([node]);
  let loads = 0;
  a.loadChildren.emit = () => {
    loads++;
    node.loading = true;
  };
  a.toggle(a.visible()[0]);
  a.toggle(a.visible()[0]);
  a.toggle(a.visible()[0]);
  assert.equal(loads, 1);
  assert.deepEqual(a.expandedIds(), ["lazy"]);
  assert.deepEqual(b.expandedIds(), []);
  const c = hierarchy(),
    d = hierarchy();
  c.check(c.visible()[0]);
  assert.deepEqual(c.checkedIds(), ["a", "b"]);
  assert.deepEqual(d.checkedIds(), []);
  c.readonly = () => true;
  c.check(c.visible()[0]);
  assert.deepEqual(c.checkedIds(), ["a", "b"]);
});
test("keyboard traverses visible rows and returns from child to parent, without consuming Tab", () => {
  const component = hierarchy();
  let focus = -1,
    prevented = false;
  const event = (key) => ({
    key,
    preventDefault() {
      prevented = true;
    },
    currentTarget: {
      closest: () => ({
        querySelectorAll: () =>
          component.visible().map((_, i) => ({
            focus() {
              focus = i;
            },
          })),
      }),
    },
  });
  component.key(event("ArrowRight"), component.visible()[0]);
  assert.deepEqual(component.expandedIds(), ["root"]);
  component.key(event("ArrowDown"), component.visible()[0]);
  assert.equal(focus, 1);
  component.key(event("ArrowLeft"), component.visible()[1]);
  assert.equal(focus, 0);
  component.key(event(" "), component.visible()[1], true);
  assert.deepEqual(component.checkedIds(), ["a"]);
  prevented = false;
  component.key(event("Tab"), component.visible()[0]);
  assert.equal(prevented, false);
});
test("collapsed table groups are instance-local and toggling does not change selected records", () => {
  const a = { collapsedGroups: state([]) },
    b = { collapsedGroups: state([]) };
  AtlasTable.prototype.toggleGroup.call(a, "Customer");
  assert.deepEqual(a.collapsedGroups(), ["Customer"]);
  assert.deepEqual(b.collapsedGroups(), []);
  AtlasTable.prototype.toggleGroup.call(a, "Customer");
  assert.deepEqual(a.collapsedGroups(), []);
});
