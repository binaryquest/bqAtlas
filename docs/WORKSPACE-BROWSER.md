# Workspace browser qualification

Date: 2026-09-26. Browser: Codex in-app browser. Environment: isolated PostgreSQL starter from local npm/NuGet packages, `artifacts/starter-runtime-1790396148957`, loopback-only host, synthetic Identity account and disposable records. The development sample database was not used.

## Observed behavior

- Created and saved a second customer, then retained editors for it and the existing synthetic customer alongside two new quote drafts. Six tasks were open including their lists.
- Each quote kept a distinct line ID and its own description (`Quote A retained` / `Quote B retained`).
- Changed the first customer's name without saving. Ctrl+S on the second customer updated only its list row/version; the first customer's persisted list name stayed unchanged and its editor retained the unsaved name. Both quote drafts remained unsaved.
- Reopened the first customer from the list. It activated task-3 with its unsaved value and did not add another task.
- At 390×844, only the active editor appeared in the accessibility tree; the taskbar switched between retained customer and quote tasks. The second quote retained its description after switching.
- Closing the dirty customer opened a visible, screen-fitting confirmation. Escape cancelled and returned focus to its Close window button; the draft value remained.
- Enter opened the quote's customer lookup with focus on Search Customer. The popup fit the mobile workspace and displayed both synthetic customers. Escape closed it and returned focus to Customer.
- Close all visited each dirty task in sequence; discarding the disposable drafts left an empty workspace.

## Fixed during review

The account header extended the document to 479 pixels at a 390-pixel viewport, clipping Change password. Grouped header actions now wrap onto a second row on narrow screens. Rebuilt the isolated consumer using the corrected `main.ts` and `styles.css`, then reloaded after discarding review drafts. Measured document width equals viewport width at both 390 and 320 pixels; all three action buttons fit within the 320-pixel viewport. Visual inspection confirmed the corrected 390-pixel home layout.

The initial task checks used unchanged package contents. Header-fix checks used the two updated source files rebuilt in the consumer. The refreshed template passes clean-consumer qualification at `artifacts/verify-1790396434607/verification.json`: all four backend option builds/unit tests, 34 frontend tests, Angular build and scaffold/regeneration checks. The viewport override was reset and review tab closed afterward.

## Remaining acceptance

These checks do not prove delayed background-save ownership, stale-write browser recovery, save-and-close under delayed responses, native exit handling, full keyboard-only workflow, complete accessibility compliance, larger data volumes, or a browser support matrix. Controlled workspace tests cover several lifecycle races separately; real-provider tests cover concurrency and transactional behavior. Quote tables intentionally scroll horizontally on narrow screens.


## Additional customer keyboard review

A later 2026-09-26 check used the running source development application at `127.0.0.1:4200` in a fresh in-app browser tab. It created only an unsaved draft and did not modify persisted sample records. After entering the login email, Tab moved to Password and Enter submitted sign-in. Subsequent application navigation used Tab, Shift+Tab, Enter and Escape without pointer activation.

Observed: the shell reached Customers; Enter opened its window and focused the window container. Seven Tab presses reached New; Enter opened a draft. Seven further Tab presses reached Save. Enter showed required-field errors and focused Code. Typing and Tab visited Code, Name, Email and Active in order. Six reverse Tabs from Active reached Close window. Enter opened the unsaved dialog, Tab reached Keep editing, and Escape cancelled with focus restored to Close window and both draft values retained. Reopening the dialog and using Tab to Discard removed only this unsaved draft and restored focus to the list's New action. The temporary tab was closed afterward.

This verifies a continuous keyboard route through generic customer launch, draft entry, validation and dirty-close. It does not establish the quote workflow or a complete focus-trap audit. Reverse Tab from the dialog's first button left DOM focus on BODY; no background application control became focused. A reload attempt left the draft intact, but the tool exposed no native dialog, so native exit confirmation remains unqualified. A `ctrl+s` input through the high-level keyboard tool produced no visible change in this run; Save/Enter worked. Earlier shortcut evidence is retained, but that input path needs separate investigation before broad keyboard certification.


## Active-window save shortcut fix

Follow-up inspection found that Customer and quote editors handled Control/Command+S on their component hosts, while a newly opened task focuses its enclosing `atlas-window`. The window now supplies a fallback save handler for its active task. It respects `defaultPrevented` from an editor, refuses to act through a pending close dialog, and uses the existing save lifecycle (including permission/validation guards and in-flight deduplication). A regression test covers frame focus, inactive task rejection, editor-handled events, modal ownership and repeated saves.

After rebuilding the library and restarting the task-owned frontend, browser `Control+s` through the explicit Playwright key API on the New Customers region showed required-field errors and focused `task-2-code`. The blank draft was discarded and the review tab closed. The high-level `ctrl+s` spelling still produced no visible response; this input discrepancy is separate from the verified application behavior. All 99 source frontend tests pass. This source browser result must not be mistaken for qualification of older package bytes.


## Stale-save recovery in the current packaged starter

The installed starter at `artifacts/starter-runtime-1790400050177` was reviewed in two temporary in-app browser tabs against its isolated PostgreSQL database. It consumes the same ten package hashes as clean-consumer `verify-1790399880218` and generated-resource runtime `resource-runtime-1790400052325`.

Both tabs opened the harness-created STARTER-1 customer at version `ccc76e67`. Tab B retained the unsaved name `Retained conflicting browser draft`. Tab A saved `Winning browser version`, advancing to version `e095e28b`. Tab B then chose Close window → Save & close. The dialog displayed Saving with its actions disabled while the request was pending, then showed “This record changed after you opened it. Reload before saving.” It remained open. Keep editing returned to the editor with its unsaved name and original version intact.

Reload subsequently retrieved `Winning browser version` at `e095e28b`, cleared the error and changed the draft to Saved. This confirms the stale save did not overwrite the winning version. The reload click reported a browser-tool timeout and exposed no native confirmation handle; subsequent UI showed the reload completed. Therefore native-confirmation cancellation is not qualified by this check. The request's visible pending state is evidence that save-and-close waits for completion, but it is not a controlled delayed-response test.

Both tabs were closed, the review completion marker released the harness, and the runtime test passed. The private review credential file was removed by cleanup. No development sample records were used or changed.


## Quote keyboard route

A further source-development check in the in-app browser used only an unsaved new quote; existing records were read only. After sign-in, Tab reached Sales quotes, Enter opened its list, and Tab/Enter reached New quote. From the new window container, Tab traversed its controls and toolbar to Customer. Enter opened the remote lookup and focused Search Customer. Down/Enter selected the existing customer and returned to the form. Tab traversed native date segments and the date-picker button to Currency, Add line, Description, Quantity and Unit price.

The draft received description `Unsaved keyboard quote` and zero quantity. Explicit browser `Control+s` from Unit price displayed the positive-quantity error and focused Quantity while retaining its zero text, description and selected customer. Reverse Tab reached Close window. Enter opened the dirty-close dialog; Escape returned focus to Close window and retained all draft values. Reopening the dialog and using Tab/Enter on Discard removed only the unsaved quote. The temporary tab was closed. No record was created or updated.

Navigation after sign-in used keyboard activation rather than pointer targeting. The first high-level sign-in attempt failed; explicit form-field entry with the same configured credentials succeeded. This check covers quote launch, lookup selection, header/line traversal, invalid-save focus and dirty-close cancellation/discard. It does not cover every browser's date-control behavior, keyboard-only successful persistence/submission, screen-reader announcements, or controlled delayed responses.


## Delayed-save browser qualification

The previously outstanding controlled-delay check now has evidence in GENERATED-RUNTIME.md for `resource-runtime-1790401873893`. The packaged generic CRUD view was exercised against a real isolated PostgreSQL host with an opt-in ten-second write delay. Normal background completion preserved the other active dirty draft; save-and-close retained its task while pending and removed only that task after completion. The unrelated draft survived. This complements rather than replaces the earlier cross-session lifecycle regression tests.


## Keyboard save and submission in the installed starter

The installed starter at `artifacts/starter-runtime-1790402623973` was reviewed against its disposable PostgreSQL database using the current local package set. After local Identity sign-in, application navigation used Tab, Shift+Tab, Enter, arrow keys and explicit Control+S. Sales quotes → New quote opened the custom editor. Keyboard lookup selection chose the harness-created STARTER-1 customer; Tab traversed the native date control, currency and line fields. The line description was `Keyboard saved quote`, quantity `2.125`, and unit price `12.3456`; the displayed rounded total was `26.23`.

Control+S from Unit price persisted the draft, changed the route to record `2591452c-2928-4e90-8276-3029da27620d`, displayed Saved draft, and refreshed the list with the same total. After the save disabled and re-enabled the form, reverse Tab resumed at Quantity and reached Submit quote. Enter submitted it; the editor displayed SUBMITTED and Submitted · Read only, removed the submission action and disabled its fields. No pointer activation was used after sign-in. The temporary browser tab was closed and the harness completion marker released cleanup. This completes this browser's successful quote keyboard path, without claiming a screen-reader audit or other browser/date-control behavior.

The workflow assertion passed, but this review run is **not a passing runtime report**: fixture disposal failed with an Npgsql connection timeout in `EnsureDeletedAsync` (see `starter-runtime-1790402623973/results/starter.trx`). The private review credential file was removed and port 65156 no longer had a listener. Removal of this run's disposable database could not be verified because the Docker diagnostic command also stopped responding. Earlier successful runtime reports remain the authoritative package qualification; this run supplies manual keyboard evidence only. Do not delete databases by a broad name pattern when reconciling this cleanup.

Cleanup was subsequently reconciled after Docker responded. A read-only query against `bqatlas_starter_ff26692e5a59483cb6989986071514b4` returned the exact review quote `2591452c-2928-4e90-8276-3029da27620d`, status `submitted`, total `26.23`. An explicit DROP DATABASE of that single identified test database then completed successfully. The original TRX remains failed; successful manual recovery does not rewrite it. Future starter runs preserve a credential-free `database-lifecycle.json` before migration so recovery does not depend on locating a known review record.
