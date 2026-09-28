# Connected CRM demo

Open **Customers**, **Pipeline**, **Activities**, **Products** or **Sales quotes** from the workspace or Start menu. **Control documentation** opens the individual-control reference; **Forms & controls** remains the composite example gallery.

## Try the workflow

1. Open Customers and activate a row. The resizable overview includes account details and links to that customer's pipeline and activities.
2. Add an opportunity. Choose the customer using the multi-column related-record lookup, set its stage, expected amount, currency, close date and owner. Notes use the character-counting textarea.
3. Open Pipeline. Cards are grouped by Lead, Qualified, Proposal, Won and Lost. Open a card and change its stage; saving refreshes the board. The table tab supports search, sorting and columns. Counts describe the current page, not a global forecast.
4. Schedule a follow-up from the customer overview. Choose Call, Email, Meeting or Task; set its date and owner. Change its status to Done after completing it. These are saved activity records, not automated email/calendar sends.
5. Maintain Products with SKU, name, Stock/Service category, exact decimal unit price, currency and availability.
6. Start a quote from a customer. Use **Add from product catalog** to search by SKU/name, create a product or open its form. An active product in the quote currency supplies a line description and price. Manual lines and price overrides remain supported. Saving/submitting uses the existing validated quote workflow.

Quotes retain description/price snapshots; they do not store a product foreign key. Opportunity amounts and product prices are decimal strings. This demo does not convert currencies or combine amounts across currencies. Activities link to customers, not individual opportunities. An owner is a display name, not an assignment/notification system. Customer names on activities and opportunities are snapshots refreshed when those records are saved. The customer directory remains the source of current account details.

## Demo data and upgrades

Migrate the configured database explicitly:

```sh
node scripts/backend.mjs migrate
node scripts/backend.mjs grant-dev
node scripts/backend.mjs seed-crm
```

Then sign in again to load new permissions. `seed-crm` only runs in Development and never runs at startup. It adds four DEMO-prefixed customers, five products, six opportunities, five activities and three draft quotes. Re-running skips existing seeded records and preserves edits; a customer code collision or edited demo customer stops the operation instead of overwriting it. Use a dedicated demo database. Dates are relative to the first seed run.

## Architecture and authorization

The Engagement sample module owns its `engagement` schema and DbContext. PostgreSQL and SQL Server migrations are included. It reads customer eligibility through `ICustomerDirectory`; it does not query another module's tables. The host seed command is a development composition concern and may call both CRM and Sales services.

Resources: `engagement.products`, `engagement.opportunities`, `engagement.activities`, each with `.read`, `.write`, `.delete` permissions. Writes require read as well; opportunities/activities also require `crm.customers.lookup`. The browser hides unavailable actions, and endpoints enforce permissions and CSRF. Updates and deletes require If-Match and reject stale versions. Existing OIDC role mappings are unchanged: an administrator must explicitly assign the new resource permissions to the intended roles before those users see the CRM sections. Local development accounts use the explicit grant-dev operation.

New resources expose REST query/CRUD endpoints; existing customer OData stays available. Query requests support search, bounded pagination, multiple field sorts, and customerId equality filtering for opportunities/activities. Decimal-string sorting is intentionally disabled. This is an application sample, not a new generic scaffolding format; the separate Inventory product specification still demonstrates generated modules.

## Control reference

**Control documentation** contains 17 individual live examples: button, input, textarea, select, multi-column lookup, related-record lookup, multi-select, radio, checkbox, toggle, date, exact decimal, tabs, accordion, split pane, table and dialog. Each page explains imports, component state, template bindings, APIs and keyboard behavior. Most examples are local; the related-record example explicitly uses the connected customer database.

Source: `frontend/projects/erp/src/control-docs`. Additional specialized controls remain demonstrated in **Forms & controls**. The reference is a starting catalog, not an exhaustive API specification for every exported symbol.
