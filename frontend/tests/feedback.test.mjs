import "@angular/compiler";
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  atlasProgressValue,
  atlasPromptError,
  atlasFeedbackPosition,
  AtlasMessageBox,
  AtlasPopover,
} from "../dist/ui/fesm2022/bqatlas-ui.mjs";
import {
  FeedbackDemoStore,
  feedbackDelay,
} from "../projects/erp/src/showcase/feedback-store.ts";
test("progress clamps finite values and leaves absent/nonfinite values indeterminate", () => {
  assert.equal(atlasProgressValue(8, 3), 3);
  assert.equal(atlasProgressValue(-1, 3), 0);
  assert.equal(atlasProgressValue(50, 0), 50);
  for (const value of [null, NaN, Infinity])
    assert.equal(atlasProgressValue(value), null);
});
test("prompt rejects whitespace and excess length, including invalid limits", () => {
  assert.match(atlasPromptError("   ", true, 80), /Enter a value/);
  assert.match(atlasPromptError("abc", false, 2), /2 characters/);
  assert.equal(atlasPromptError("", false, 80), "");
  assert.equal(atlasPromptError("Accepted", true, 80), "");
  assert.match(
    atlasPromptError("x".repeat(201), true, Infinity),
    /200 characters/,
  );
});
test("message box retains invalid prompts and emits a result only once", () => {
  let value = " ",
    error = "",
    opened = true;
  const results = [];
  const box = {
    completed: false,
    kind: () => "prompt",
    value: () => value,
    required: () => true,
    maxLength: () => 80,
    error: { set: (v) => (error = v) },
    open: { set: (v) => (opened = v) },
    result: { emit: (v) => results.push(v) },
  };
  AtlasMessageBox.prototype.finish.call(box, "accept");
  assert.equal(opened, true);
  assert.match(error, /Enter/);
  assert.equal(results.length, 0);
  value = "Valid";
  AtlasMessageBox.prototype.finish.call(box, "accept");
  AtlasMessageBox.prototype.finish.call(box, "cancel");
  assert.equal(opened, false);
  assert.deepEqual(results, [{ action: "accept", value: "Valid" }]);
});
test("message box cancel bypasses validation and preserves the supplied draft", () => {
  let emitted;
  const box = {
    completed: false,
    kind: () => "prompt",
    value: () => "",
    open: { set() {} },
    result: { emit: (v) => (emitted = v) },
  };
  AtlasMessageBox.prototype.finish.call(box, "cancel");
  assert.deepEqual(emitted, { action: "cancel", value: "" });
});
test("help positioning flips above and clamps narrow viewport edges", () => {
  assert.deepEqual(
    atlasFeedbackPosition(
      { left: 300, top: 400, bottom: 430 },
      { width: 300, height: 180 },
      { width: 390, height: 500 },
    ),
    { left: 82, top: 212 },
  );
  assert.deepEqual(
    atlasFeedbackPosition(
      { left: -5, top: 10, bottom: 30 },
      { width: 300, height: 100 },
      { width: 390, height: 844 },
    ),
    { left: 8, top: 38 },
  );
});
test("disabled popover does not open and close restores focus only when requested", () => {
  AtlasPopover.prototype.toggle.call({ disabled: () => true });
  let shown = true,
    focus = 0;
  const popup = {
    panel: () => ({
      nativeElement: {
        matches: () => shown,
        hidePopover() {
          shown = false;
        },
      },
    }),
    opened: { set() {} },
    trigger: () => ({
      nativeElement: {
        focus() {
          focus++;
        },
      },
    }),
  };
  AtlasPopover.prototype.close.call(popup, false);
  assert.equal(focus, 0);
  shown = true;
  AtlasPopover.prototype.close.call(popup, true);
  assert.equal(focus, 1);
});
test("import instances are isolated and commit only a complete snapshot", async () => {
  const a = new FeedbackDemoStore(),
    b = new FeedbackDemoStore();
  a.rename("New batch");
  let steps = 0;
  await a.start(async () => {
    steps++;
    assert.equal(a.imported().length, 0);
  });
  assert.equal(steps, 4);
  assert.equal(a.phase(), "complete");
  assert.equal(a.imported().length, 3);
  assert.equal(b.name(), "September inventory");
  assert.equal(b.imported().length, 0);
  a.rows()[0].name = "Changed";
  assert.equal(a.imported()[0].name, "Office desk");
});
test("failed import retains preview, commits nothing and succeeds on retry", async () => {
  const store = new FeedbackDemoStore();
  store.failNext.set(true);
  await store.start(async () => {});
  assert.equal(store.phase(), "error");
  assert.match(store.error(), /Nothing was committed/);
  assert.equal(store.imported().length, 0);
  assert.equal(store.rows().length, 3);
  await store.start(async () => {});
  assert.equal(store.phase(), "complete");
  assert.equal(store.imported().length, 3);
});
test("cancel, reset and dispose reject late work even if adapter ignores cancellation", async () => {
  for (const action of ["cancel", "reset", "dispose"]) {
    const store = new FeedbackDemoStore();
    let release;
    const pending = store.start(
      () => new Promise((resolve) => (release = resolve)),
    );
    store[action]();
    release();
    await pending;
    assert.equal(store.imported().length, 0);
    assert.notEqual(store.phase(), "complete");
  }
});
test("old import cannot overwrite a newer successful run", async () => {
  const store = new FeedbackDemoStore();
  let release;
  const first = store.start(
    () => new Promise((resolve) => (release = resolve)),
  );
  store.cancel();
  await store.start(async () => {});
  release();
  await first;
  assert.equal(store.phase(), "complete");
  assert.equal(store.imported().length, 3);
});
test("busy import prevents duplicate execution and rename; invalid rows fail validation", async () => {
  const store = new FeedbackDemoStore();
  let release,
    called = false;
  const pending = store.start(
    () => new Promise((resolve) => (release = resolve)),
  );
  await store.start(async () => {
    called = true;
  });
  store.rename("Ignored");
  assert.equal(called, false);
  assert.equal(store.name(), "September inventory");
  store.cancel();
  release();
  await pending;
  store.rows.set([
    { code: "A", name: "A", quantity: 1 },
    { code: "A", name: "B", quantity: 2 },
  ]);
  await store.start(async () => {});
  assert.equal(store.phase(), "error");
  assert.equal(store.imported().length, 0);
});
test("delay rejects aborted signals immediately and during work", async () => {
  const a = new AbortController();
  a.abort();
  await assert.rejects(feedbackDelay(a.signal), /Cancelled/);
  const b = new AbortController();
  const pending = feedbackDelay(b.signal);
  b.abort();
  await assert.rejects(pending, /Cancelled/);
});
