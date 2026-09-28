import "@angular/compiler";
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  nextAtlasTab,
  clampAtlasSplit,
  AtlasTabs,
  AtlasSplitPane,
} from "../dist/ui/fesm2022/bqatlas-ui.mjs";
import { CustomerDemoStore } from "../projects/erp/src/showcase/customer-demo-store.ts";

test("tab keyboard traversal wraps, skips disabled tabs and handles no available tabs", () => {
  const tabs = [
    { id: "details" },
    { id: "locked", disabled: true },
    { id: "contacts" },
  ];
  assert.equal(nextAtlasTab(tabs, "details", "ArrowRight"), "contacts");
  assert.equal(nextAtlasTab(tabs, "details", "ArrowLeft"), "contacts");
  assert.equal(nextAtlasTab(tabs, "contacts", "ArrowRight"), "details");
  assert.equal(nextAtlasTab(tabs, "contacts", "Home"), "details");
  assert.equal(nextAtlasTab(tabs, "details", "End"), "contacts");
  assert.equal(nextAtlasTab(tabs, "details", "Tab"), undefined);
  assert.equal(
    nextAtlasTab([{ id: "locked", disabled: true }], "locked", "Home"),
    undefined,
  );
});
test("tab component moves focus and selection together without intercepting normal Tab", () => {
  let selected,
    focused,
    prevented = false;
  const component = {
    tabs: () => [
      { id: () => "one", disabled: () => false },
      { id: () => "skip", disabled: () => true },
      { id: () => "two", disabled: () => false },
    ],
    selected: { set: (v) => (selected = v) },
  };
  const event = {
    key: "ArrowRight",
    preventDefault: () => (prevented = true),
    currentTarget: {
      parentElement: {
        querySelectorAll: () => [{}, {}, { focus: () => (focused = "two") }],
      },
    },
  };
  AtlasTabs.prototype.key.call(component, event, "one");
  assert.equal(selected, "two");
  assert.equal(focused, "two");
  assert.ok(prevented);
  prevented = false;
  AtlasTabs.prototype.key.call(component, { ...event, key: "Tab" }, "two");
  assert.equal(prevented, false);
});
test("split geometry stays within usable bounds including invalid consumer values", () => {
  assert.equal(clampAtlasSplit(-30, 20, 70), 20);
  assert.equal(clampAtlasSplit(120, 20, 70), 70);
  assert.equal(clampAtlasSplit(NaN), 35);
  assert.equal(clampAtlasSplit(20, 80, 30), 80);
  let ratio = 40;
  const component = {
    minimum: () => 20,
    maximum: () => 70,
    size: () => ratio,
    ratio: { set: (v) => (ratio = v) },
  };
  const press = (key, shiftKey = false) =>
    AtlasSplitPane.prototype.key.call(component, {
      key,
      shiftKey,
      preventDefault() {},
    });
  press("ArrowRight");
  assert.equal(ratio, 42);
  press("ArrowLeft", true);
  assert.equal(ratio, 32);
  press("Home");
  assert.equal(ratio, 20);
  press("End");
  assert.equal(ratio, 70);
  press("ArrowRight");
  assert.equal(ratio, 70);
});
test("customer drafts survive record switching and remain isolated between demo instances", () => {
  const a = new CustomerDemoStore(),
    b = new CustomerDemoStore();
  a.change("name", "Retained name");
  a.select("C-102");
  a.change("city", "Retained city");
  a.select("C-101");
  assert.equal(a.current().name, "Retained name");
  assert.equal(a.drafts()["C-102"].city, "Retained city");
  assert.equal(b.current().name, "Northstar Supply");
  assert.equal(b.dirty(), false);
  a.change("name", "Northstar Supply");
  assert.equal(a.drafts()["C-101"], undefined);
  assert.equal(a.dirty(), true);
});
test("validation selects an invalid background customer and identifies the correct tab without persisting", async () => {
  const store = new CustomerDemoStore();
  store.change("email", "bad");
  store.select("C-102");
  store.change("name", "Valid revised name");
  await assert.rejects(store.save(), /valid contact email/);
  assert.equal(store.selected(), "C-101");
  assert.equal(store.issues()[0].tab, "contacts");
  assert.equal(store.saved()[1].name, "Meridian Studio");
  assert.ok(store.dirty());
  store.change("email", "valid@example.test");
  assert.equal(store.issues().length, 0);
});
test("failed saves retain all drafts; pending saves reject edits and success commits one snapshot", async () => {
  const store = new CustomerDemoStore();
  store.change("name", "Changed");
  store.failNext.set(true);
  const failed = store.save();
  store.change("name", "Late edit");
  store.select("C-102");
  assert.equal(store.selected(), "C-101");
  await assert.rejects(failed, /Simulated save failure/);
  assert.equal(store.current().name, "Changed");
  assert.equal(store.saved()[0].name, "Northstar Supply");
  assert.ok(store.dirty());
  await store.save();
  assert.equal(store.saved()[0].name, "Changed");
  assert.equal(store.dirty(), false);
  assert.equal(store.history()["C-101"].length, 1);
});
test("read-only mode preserves drafts and reset changes only its own instance", async () => {
  const a = new CustomerDemoStore(),
    b = new CustomerDemoStore();
  a.change("name", "Draft");
  a.readonly.set(true);
  a.change("name", "Denied");
  assert.equal(a.current().name, "Draft");
  await assert.rejects(a.save(), /read-only/);
  b.change("name", "Other draft");
  a.reset();
  assert.equal(a.dirty(), false);
  assert.equal(b.current().name, "Other draft");
  assert.equal(b.dirty(), true);
});
