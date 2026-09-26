# Contract v1 — quote workflow

`quote.schema.json` describes the write payload; numerical ranges and cross-field rules are enforced by QuoteRules. Unknown properties are ignored by the explicit input DTO and never assigned to domain entities. Generated totals, status, number, actor and version are server-owned.

Quantity has at most 3 decimal places and is in (0, 1000000]. Unit price has at most 4 decimal places and is in [0, 1000000000]. USD, EUR and BDT use 2 decimal places in this illustrative workflow. Each line rounds half away from zero, then the rounded lines are summed. This is a quote demonstration, not a tax or currency-accounting engine.

Amounts always cross HTTP as strings. `fixtures/quote-totals.json` is consumed by both .NET and TypeScript tests, including values beyond JavaScript's safe integer range. Header/lines/version/audit commit together. Submitted documents are immutable. A UUID Idempotency-Key is scoped to quote submission and the authenticated actor; a retry with the same key returns the same immutable result even if its original If-Match is stale. A different key cannot submit the same quote again.

The stored customer code/name is a document snapshot. Draft save and submit revalidate customer existence and active status through the CRM contract. Historical submitted quotes remain readable if CRM later changes or removes a customer.
