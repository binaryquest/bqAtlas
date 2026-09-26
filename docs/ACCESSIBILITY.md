# Accessibility qualification

This is a qualification record, not a WCAG conformance claim. The 2026-09-26 check used the unmodified packaged starter in `artifacts/starter-runtime-1790398155957`, its isolated PostgreSQL database and synthetic local Identity account. Browser: Codex in-app browser. The review did not mutate development sample records.

## Verified rendered semantics

A read-only DOM audit and accessibility-tree inspection covered a new generic Customer editor and a new Sales quote editor retained together with their lists:

- Document language is `en`.
- No duplicate element IDs across the retained page.
- No unnamed visible buttons, native form controls or comboboxes in the inspected state, using labels, aria-label/labelledby or button text as naming sources.
- All aria-describedby references resolve to existing elements.
- Customer Code, Name, Email and Active have native label associations. An invalid save marks Code and Name invalid, links their error text and focuses Code. Active now includes its field-error association.
- Quote Customer, Date and Currency have accessible names and error references. Description, Quantity and Unit price use line-numbered accessible names and matching error IDs. A zero quantity marks the native decimal input invalid and links the visible error message; the unsaved value remains.
- The Quote lines table is named, and all five header cells declare scope=col.
- Enter activates sign-in submission, view launchers, New actions and close-dialog choices. Ctrl+S invokes quote validation. Enter opens Customer lookup and focuses its search; Escape closes it and restores focus to Customer.
- Close all visits each dirty task. Discarding these disposable review drafts leaves an empty workspace.

The audit evaluates structural naming/reference checks; it is not a browser accessibility-name algorithm or an axe/WCAG ruleset. Native accessibility-tree output independently confirmed the main Customer/quote names and focus transitions. Targeted keyboard activation through automation does not prove uninterrupted Tab-only operation through the entire application.

## Implemented fixes

Generic enum, integer, boolean and decimal controls now expose their error state and associate field-error text. Decimal controls propagate required state to the native input. The quote table has an accessible name. All 98 source frontend tests pass and the Angular/package build passes.

The browser sample contains the Customer text/email/boolean fields and custom quote decimals. The subsequent generated-resource browser scenario (`resource-runtime-1790398759901`, documented in GENERATED-RUNTIME.md) also verifies enum/integer/decimal invalid states, resolving error references, required decimal state, first-error focus and corrected record persistence.

## Remaining review

Customer and quote keyboard routes through launch, entry, validation and dirty-close are now recorded in WORKSPACE-BROWSER.md. Successful quote keyboard persistence/submission is also recorded there for the installed starter. Screen-reader announcements, comprehensive contrast and zoom/high-contrast behavior, full popup/modal ownership under delayed requests, native exit confirmation, mobile edge cases and a broader supported-browser matrix remain to be assessed. Existing workspace/browser records document 320/390-pixel header layout, mobile task switching, dirty-close cancellation and lookup focus return. Neither those checks nor this audit establishes full accessibility compliance.


## Light-theme contrast correction

A read-only rendered-style review found normal-size workspace text below the 4.5:1 threshold described by [W3C's contrast-minimum guidance](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html). The workspace eyebrow and introductory paragraph measured 4.344:1, the connection note 2.964:1, and taskbar hints/count 3.668:1. The light-theme muted token changed from `#828593` to `#626777`; the affected workspace copy now uses `#526178`.

After building and reloading the source frontend, the workspace copy measured 5.739:1 against `rgb(241,245,249)`, and taskbar muted text measured 5.636:1 against white. In a new invalid Customer form, the alert measured 4.878:1, field errors 6.574:1, helper copy 14.747:1, unsaved status 4.759:1, and the active task label 4.686:1. The menu's keyboard-focused Sales quotes button displayed a two-pixel accent outline with two-pixel offset, confirmed by computed style and screenshot inspection. No business records were saved; the empty draft and review tab were discarded/closed.

Ratios were calculated from computed opaque foreground/background RGB values using relative luminance. The scan skipped disabled controls and backgrounds involving gradients, partial alpha or opacity. It did not evaluate all placeholders, icons, borders, dark theme, forced colors, overlapping content, or screen-reader output, and is not a WCAG conformance audit. The frontend production build passed. The CSS fix is now in the refreshed local artifacts. The UI archive theme and template stylesheet match source byte-for-byte. Matching-hash consumer and runtime reports are `verify-1790401436680`, `starter-runtime-1790401436591`, and `resource-runtime-1790401436545`. The visual review above was performed on source; the package checks establish matching assets and working consumers, not a separate browser review of every packaged screen.
