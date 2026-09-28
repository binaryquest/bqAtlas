# Feedback and guidance

Batch 6 adds exported feedback controls to `@bqatlas/ui` and an **Inventory import desk** under **Forms & controls → Feedback & guidance**. Generated starters include the example and its tests. The workflow is a local simulation; it uploads no files and writes no backend records.

## Message boxes

`AtlasMessageBox` composes the existing native-modal `AtlasDialog` with alert, confirm and prompt modes. Inputs are `kind`, `title`, `message`, `promptLabel`, `required`, `maxLength`, `acceptLabel`, `cancelLabel` and `danger`; `open` and `value` are models. `result` emits `{ action: 'accept' | 'cancel', value }` once per user completion. Escape and the close button produce cancellation; setting `open` to false externally simply dismisses it. Cancel does not clear the caller's value.

```html
<atlas-message-box kind="prompt" title="Rename batch"
  message="Choose a descriptive name." promptLabel="Batch name"
  [maxLength]="80" acceptLabel="Rename"
  [(open)]="renameOpen" [(value)]="batchName"
  (result)="renameCompleted($event)" />
```

Prompts reject whitespace-only required values and values over the configured length, retaining the entered value and displaying a linked validation error. Prompts focus their input; confirmation dialogs initially focus Cancel. Native dialog behavior traps modal focus and restores the invoking control after dismissal. Message content is text, not HTML. Use `AtlasDialog` directly for richer custom forms or asynchronous save actions. `AtlasMessageBox` reports a decision; it does not itself perform network work or authorization.

## Notices, progress and status

- `AtlasNotice`: `title`, `message`, `tone` (`info`, `success`, `warning`, `danger`), `urgent`, `dismissible`, and `dismissed`. The caller controls removal. Normal messages use a polite status region; opt into an alert with `urgent` for errors requiring immediate attention. The example keeps errors visible until retry/reset.
- `AtlasProgress`: `label`, `value` and `max`. Native `<progress>` exposes an accessible label and determinate progress. `null` or nonfinite values indicate indeterminate work; finite values clamp to 0–max, with invalid maxima falling back to 100. Its exported helper is `atlasProgressValue`.
- `AtlasStatusBar`: a persistent, polite `message`, optional `tone`, and projected supplementary content. Keep transient details outside its live message to avoid repeated announcements.
- `AtlasLoadingRegion`: `busy`, `label` and `message`, with projected content. While busy, it marks the region `aria-busy`, makes content `inert`, and displays a loading mask. A status announcement sits outside the busy region. Put Cancel/Retry and the initiating action outside the locked content, as the example does. The spinner respects reduced-motion settings. This control does not cancel work or move focus on its own.

Prefer one concise error announcement per operation. Do not put urgent notices in a rapidly updating loop. Progress updates use the native progress semantic; the example's status changes only once per simulated row.

## Contextual help

`AtlasTooltip` supplies a focusable question-mark button with `label` and plain `text`. Focus, hover or click opens a native manual popover with tooltip semantics and `aria-describedby`. Escape hides it without moving focus; hover can move onto the tooltip. It does not contain interactive content. Text wraps to the viewport. Scrolling or resizing dismisses the tooltip. This first version is a dedicated help button, not a directive for arbitrary or disabled controls.

`AtlasPopover` supplies a labeled trigger and a nonmodal native auto-popover containing projected content. Set `label`, `title` and optionally `disabled`. It focuses the panel on open; Tab reaches projected interactive content. Escape or Close help restores focus to the trigger, while outside click light-dismisses. External scrolling or resizing closes the popover without stealing focus. Disabling the control also closes it. It does not trap focus. Both controls clamp placement to the viewport and flip above a trigger near the lower edge; `atlasFeedbackPosition` is the exported placement helper. Current browsers with the native Popover API are required, as with Atlas popup menus.

```html
<atlas-tooltip label="About batch names" text="Use a descriptive name, up to 80 characters." />
<atlas-popover label="How imports work" title="Validate, then commit">
  <p>All rows are validated before the operation commits.</p>
  <button atlasButton (click)="showDetails()">Show details</button>
</atlas-popover>
```

## Import example and lifecycle

The sample includes a dismissible notice, validation summary alert, rename prompt, import/reset confirmations, help tooltip/popover, indeterminate validation, determinate row progress, a loading mask, cancellation, simulated failure/retry and a persistent status bar.

Each `FeedbackDemoStore` owns its state. `start()` snapshots rows and commits a result only after every step succeeds. Cancellation, reset, disposal and a newer run invalidate late completions even when an adapter ignores its abort signal. Failures retain preview rows and commit nothing. Duplicate starts and renaming while busy are blocked. Reset clears the result and restores sample rows; it retains the batch name. Independent task windows do not share results, guidance state or batch names. Switching showcase examples retains its local state; closing the task disposes and cancels work. These transient preview operations do not create unsaved business drafts or require a save-on-close prompt.

Real imports should use server-side validation, permission enforcement, transaction boundaries and a server-owned cancellation/job protocol. The loading overlay and local Cancel button alone cannot roll back a server operation.

`frontend/tests/feedback.test.mjs` covers prompt decisions, progress normalization, popover guards/placement, independent imports, validation, atomic completion, cancellation/reset/disposal, failed retries and stale responses. Browser review covers keyboard dialogs/help, locked preview controls, live progress, retry, independent tasks and narrow layouts.
