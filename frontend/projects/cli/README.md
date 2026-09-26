# bqAtlas CLI

Generate a module from an explicit resource specification:

```sh
bqatlas generate crud --spec product.resource.json --out ./inventory-module --dry-run
bqatlas generate crud --spec product.resource.json --out ./inventory-module
```

The package includes `examples/product.resource.json`, covering text, email, boolean, integer, date, enum and exact decimal fields. Declare UUID keys, explicit operation permissions, field validation/defaults, form order, list columns and default sorting. Unknown or unsupported properties are rejected before writing. Decimal values remain strings in browser contracts and JSON, with native decimal persistence/OData metadata.

Generated output includes C# DTOs, EF mapping hooks, resource descriptors, REST/OData registration, bounded query/CRUD services, a user-owned partial validation file, typed Angular bindings/menu, representative fixtures and runnable backend/frontend tests. Follow its README to register the module and add reviewed migrations for each database provider. Public self-registration, automatic grants and automatic migrations are not generator side effects.

Generation is deterministic: `--dry-run` prints an ownership/hash manifest without creating files. Existing output requires an explicit regeneration command. Resource regeneration is available with explicit `--regenerate` (preview with `--regenerate --dry-run`): unchanged generated files are updated, user-owned custom rules and unrelated files are preserved, and edited generated files or path conflicts are rejected. Initial generation still refuses existing output. Relationship fields, alternate keys and aggregate generation remain unfinished; do not infer their support from arbitrary scalar fields. Custom rules belong in `*.Custom.cs`. One resource is currently generated per module.

The original fixed master-data shortcut remains available:

```sh
bqatlas scaffold master-data --module Purchasing --entity Supplier --plural Suppliers --out ./supplier-module
```


Regeneration applies only to resource-spec output with a compatible `bqatlas.generation.json`, not the fixed master-data shortcut. Module/entity/resource renames require a new output directory and explicit migration of custom code. You may edit `resource.json` inside the output and pass that exact file as `--spec`; the validated specification is the authorized input. Other edited generated files must be moved into extensions or reconciled manually first.

Keep the directory idle during regeneration. The tool uses an advisory `.bqatlas-regeneration` lock, stages output, retains original files, commits the manifest last, and rolls back ordinary write failures. A process interruption or failed rollback leaves this directory and its recovery journal intact and blocks the next run. Inspect the journal and backups before manual recovery; do not delete them to force a retry. This is not a filesystem-wide atomic transaction or a database migration.
