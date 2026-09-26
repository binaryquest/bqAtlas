# Custom fields in generic CRUD

A registered CrudFeature can provide `fieldRenderers` and `fieldValidators`, keyed by public field name. Components and callbacks are trusted application code. Resource metadata supplies data only and cannot name arbitrary imports.

```ts
fieldRenderers: { code: CustomerCodeField },
fieldValidators: { code: validateCustomerCode },
```

A standalone field component declares a required `context` input of type `FieldRendererContext`. It receives the value, row snapshot, descriptor, unique control/error IDs, disabled state, errors and a `change(value)` callback. Associate its input with `controlId` and `errorId`, display validation feedback, and honor `disabled`. The callback independently rejects changes while loading/saving or when permissions or read-only metadata disallow editing. It copies accepted values into the owning draft.

A FieldValidator receives `(value, row, field)` and returns error messages. It can compare related fields and impose conditional requirements, including for an empty optional field. Standard validation errors remain; custom validation adds messages. Reference/date-time fields require an explicit custom validator when their values are present. The server remains authoritative for validation and permissions.

The starter's `client/projects/erp/src/customer-code.ts` demonstrates an application-owned renderer and a code-format rule matching the CRM backend. No framework source edits are needed. Row, field and value snapshots isolate extensions from direct draft mutation; validation callbacks should remain pure and synchronous. Remote validation belongs in the application/server save flow.
