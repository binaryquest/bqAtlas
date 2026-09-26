# Resource-driven CRUD generation

The CLI supports `bqatlas generate crud --spec resource-specs/inventory/product.resource.json --out ./inventory-module`. Add `--dry-run` to inspect its deterministic ownership/hash manifest without writing output. New starter templates include the Product specification; the npm CLI also includes it under `examples/`.

The specification declares schema version 1, module/entity/plural names, resource ID, UUID `id` key, distinct read/write/delete/lookup permission IDs, fields, list columns/default sort and form order. Unknown properties are rejected. Supported scalar field types are string, email, boolean, 32-bit integer, date-only, enum and non-negative decimal. Each field declares a typed default and whether it is required. Text fields declare bounded lengths; enum fields declare allowed values; decimals declare scale (0–4) and an exact string maximum, with up to 14 integral digits. Decimal validation uses exact units rather than JavaScript floating-point comparisons.

Output includes:

- ASP.NET module registration, resource metadata and explicit authorization policies.
- Input/output DTOs, EF mapping hooks, bounded REST queries, CRUD and OData read endpoints.
- Concurrency versions, modified-at/actor fields and a separate user-owned partial validation file.
- Typed Angular input/record bindings, default values, ordered list columns and a menu definition. Forms follow the declared form order through metadata.
- Backend validation, permission-denial and in-memory CRUD tests; frontend fixture, validation and writable-payload tests.

REST decimals serialize as strings and reject JSON number input. Dates use `DateOnly`. OData retains native decimal EDM properties; consumers must request IEEE754-compatible JSON for exact values. Database query collation semantics are application configuration. The generator does not silently create unique constraints, infer relationships, register a host module, grant users permissions or apply migrations. Follow its generated README for explicit composition and reviewed provider migration steps.

`*.Custom.cs` is identified as user-owned in the generation manifest. Initial generation refuses existing output directories. Explicit resource regeneration updates only unchanged generated files and preserves user-owned files; see the workflow below. Relationship/aggregate fields, alternate key strategies, multiple resources in one generated module and the standalone module template remain unfinished. Unsupported inputs fail before output creation.

Generated persistence tests use EF's in-memory provider to check service behavior and stale versions. They are not evidence of PostgreSQL or SQL Server translation, migration or database concurrency behavior; provider-specific integration tests remain necessary.


## Regenerate after changing a resource

```sh
bqatlas generate crud --spec inventory-module/resource.json --out inventory-module --regenerate --dry-run
bqatlas generate crud --spec inventory-module/resource.json --out inventory-module --regenerate
```

The preview reports create/update/remove/unchanged/preserve actions and the proposed manifest without writing files. It is deterministic for the same inputs and output tree. The actual run rechecks files before applying the plan. Custom validation files retain their bytes; unrelated files remain untouched. The manifest records the preserved files' current hashes. Generated files with local edits, missing tracked files, untracked collisions and symlinked managed paths are rejected before changes. Invalid paths or forged ownership entries in a manifest are rejected as well. Module/entity/plural/resource identity cannot be renamed during regeneration.

When the supplied spec is the output directory's `resource.json`, edits to that exact input file are accepted and validated; it is rewritten in canonical JSON. If a different external spec is supplied, an independently edited output `resource.json` is a conflict. Other generated source never receives this exception. This makes deliberate specification changes distinct from overwriting manually edited implementation code.

Regeneration stages new content in `.bqatlas-regeneration/`, records a journal, retains originals, and writes the new manifest last. Ordinary write errors roll back replacements, including the manifest. File changes detected after preview cause refusal; do not edit or build in the output directory while applying regeneration. The lock is advisory and this is not an atomic directory-wide operation. Process crashes or a second failure during rollback can leave partial output, so the tool blocks further regeneration while the transaction directory exists.

For interrupted work, first ensure the original CLI process has stopped. Inspect `journal.json`: each operation records its target path, staged/backup filename and old/new hashes. Preserve this directory until the output is reconciled. A backup contains the original file; compare hashes before replacing any current file, and retain any independently edited content. A committed journal means the application phase finished but cleanup may not have. If there is any ambiguity, keep both versions and resolve the change manually; deleting the lock is not recovery. After restoring a consistent manifest/output pair or completing the recorded changes, remove the recovered transaction directory and preview again.

Tests inject write and rollback failures, reject edits between preview and commit, and verify unchanged custom rules and unrelated files. The package-consumer check also adds a field, regenerates, compiles the result and executes a custom application validation rule that existed before regeneration. Database migrations and business-rule changes remain reviewed application work.
