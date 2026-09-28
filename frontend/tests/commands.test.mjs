import "@angular/compiler";
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  atlasVisibleCommands,
  atlasCommandAllowed,
  atlasToolbarCapacity,
  atlasTransferItems,
  atlasMoveItems,
  AtlasPopupMenu,
  AtlasItemSelector,
} from "../dist/ui/fesm2022/bqatlas-ui.mjs";
import { CommandDemoStore } from "../projects/erp/src/showcase/command-demo-store.ts";
const commands = [
  { id: "save", label: "Save", permission: "edit" },
  { id: "preview", label: "Preview" },
  { id: "locked", label: "Locked", disabled: true },
  { id: "hidden", label: "Hidden", hidden: true },
];
test("one command definition hides forbidden commands and rechecks permissions at execution", () => {
  assert.deepEqual(
    atlasVisibleCommands(commands, []).map((command) => command.id),
    ["preview", "locked"],
  );
  assert.equal(atlasCommandAllowed(commands, "save", ["edit"]), true);
  assert.equal(atlasCommandAllowed(commands, "save", []), false);
  assert.equal(atlasCommandAllowed(commands, "locked", ["edit"]), false);
  assert.equal(atlasCommandAllowed(commands, "hidden", ["edit"]), false);
  assert.equal(atlasCommandAllowed(commands, "preview", [], true), false);
  let emitted;
  const menu = {
    commands: () => commands,
    permissions: () => [],
    disabled: () => false,
    close() {},
    command: { emit: (id) => (emitted = id) },
  };
  AtlasPopupMenu.prototype.execute.call(menu, "save");
  assert.equal(emitted, undefined);
  AtlasPopupMenu.prototype.execute.call(menu, "preview");
  assert.equal(emitted, "preview");
});
test("toolbar reserves overflow only when needed and can place every command in More", () => {
  assert.equal(atlasToolbarCapacity([70, 80, 90], 256), 3);
  assert.equal(atlasToolbarCapacity([70, 80, 90], 255), 2);
  assert.equal(atlasToolbarCapacity([70, 80, 90], 150), 0);
  assert.equal(atlasToolbarCapacity([70, 80, 90], 162), 1);
  assert.equal(atlasToolbarCapacity([], 20), 0);
});
const options = ["a", "b", "c", "d"]
  .map((value) => ({ value, label: value }))
  .concat({ value: "locked", label: "Locked", disabled: true });
test("selector transfer retains order, enforces the full limit, excludes locked and unknown choices", () => {
  assert.deepEqual(
    atlasTransferItems(["a"], ["b", "b", "locked", "missing"], options, true),
    ["a", "b"],
  );
  assert.deepEqual(atlasTransferItems(["a"], ["b", "c"], options, true, 2), [
    "a",
  ]);
  assert.deepEqual(
    atlasTransferItems(
      ["a", "locked", "unknown"],
      ["a", "locked", "unknown"],
      options,
      false,
    ),
    ["locked", "unknown"],
  );
});
test("selector reorders contiguous selections as a block and does not move locked entries", () => {
  assert.deepEqual(
    atlasMoveItems(["a", "b", "c", "d"], ["b", "c"], options, -1),
    ["b", "c", "a", "d"],
  );
  assert.deepEqual(
    atlasMoveItems(["a", "b", "c", "d"], ["b", "c"], options, 1),
    ["a", "d", "b", "c"],
  );
  assert.deepEqual(atlasMoveItems(["a", "locked", "b"], ["b"], options, -1), [
    "a",
    "locked",
    "b",
  ]);
  assert.deepEqual(atlasMoveItems(["a", "b"], ["a"], options, -1), ["a", "b"]);
});
test("disabled/read-only selectors refuse mutation at the action boundary", () => {
  const selector = {
    disabled: () => true,
    readonly: () => false,
    value: {
      set() {
        throw new Error("changed");
      },
    },
  };
  AtlasItemSelector.prototype.transfer.call(selector, true);
  selector.disabled = () => false;
  selector.readonly = () => true;
  AtlasItemSelector.prototype.transfer.call(selector, false);
  AtlasItemSelector.prototype.move.call(selector, 1);
});
test("independent price-list tasks never share draft or saved state", async () => {
  const a = new CommandDemoStore(),
    b = new CommandDemoStore();
  a.draft.update((value) => ({
    ...value,
    title: "Changed",
    warehouses: ["sylhet"],
  }));
  assert.equal(b.dirty(), false);
  assert.deepEqual(b.draft().warehouses, ["dhaka", "chattogram"]);
  await a.execute("save");
  assert.equal(a.saved().title, "Changed");
  assert.equal(b.saved().title, "Autumn wholesale · USD");
});
test("save failure retains draft, reports error and allows retry from any command placement", async () => {
  const store = new CommandDemoStore();
  store.draft.update((value) => ({ ...value, desk: "500.10" }));
  store.failNext.set(true);
  await assert.rejects(store.execute("save"), /Simulated save failure/);
  assert.equal(store.saved().desk, "420.00");
  assert.equal(store.draft().desk, "500.10");
  assert.equal(store.dirty(), true);
  assert.equal(store.saving(), false);
  await store.execute("save");
  assert.equal(store.dirty(), false);
  assert.equal(store.saved().desk, "500.10");
  assert.equal(store.error(), "");
});
test("invalid decimal or empty assignments cannot be saved", async () => {
  const store = new CommandDemoStore();
  store.draft.update((value) => ({ ...value, chair: "1.001" }));
  await assert.rejects(store.execute("save"), /two decimal places/);
  assert.equal(store.dirty(), true);
  store.draft.update((value) => ({ ...value, chair: "1.00", warehouses: [] }));
  await assert.rejects(store.execute("save"), /at least one warehouse/);
});
test("permission revocation during save preserves draft and prevents persistence", async () => {
  const store = new CommandDemoStore();
  store.draft.update((value) => ({ ...value, title: "Draft" }));
  const saving = store.execute("save");
  store.manage.set(false);
  await assert.rejects(saving, /permission changed/);
  assert.equal(store.saved().title, "Autumn wholesale · USD");
  assert.equal(store.draft().title, "Draft");
  await assert.rejects(store.execute("save"), /unavailable/);
});
test("reset/disposal rejects stale save completions and later draft edits are preserved", async () => {
  const store = new CommandDemoStore();
  store.draft.update((value) => ({ ...value, title: "Old" }));
  const pending = store.save();
  store.reset();
  await assert.rejects(pending, /cancelled/);
  assert.equal(store.saved().title, "Autumn wholesale · USD");
  store.draft.update((value) => ({ ...value, title: "Snapshot" }));
  const save = store.save();
  store.draft.update((value) => ({ ...value, title: "Newer edit" }));
  await save;
  assert.equal(store.saved().title, "Snapshot");
  assert.equal(store.draft().title, "Newer edit");
  assert.equal(store.dirty(), true);
});
