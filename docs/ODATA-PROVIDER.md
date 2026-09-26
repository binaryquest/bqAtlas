# OData lists with REST record operations

`ODataResourceProvider` implements the same `ResourceProvider` contract as the REST adapter. Register its factory on a `CrudFeature` to select OData for list queries. The editor continues to read and mutate through the supplied REST provider, preserving record capabilities and opaque ETags.

```ts
provider: (api, descriptor) => new ODataResourceProvider(
  api,
  descriptor.oDataEndpoint!,
  new RestResourceProvider(api, descriptor.endpoint),
  {
    fields: {
      id: { property: 'Id', type: 'guid' },
      code: { property: 'Code', type: 'string' },
      name: { property: 'Name', type: 'string' },
      email: { property: 'Email', type: 'string' },
      active: { property: 'Active', type: 'boolean' },
    },
    key: 'id',
    searchFields: ['code', 'name'],
    map: row => ({ id: row.Id, code: row.Code, name: row.Name,
      email: row.Email, active: row.Active }),
  },
)
```

Use public EDM names and a DTO mapper matching the service's actual response casing. Typed equality filters support strings, booleans, integers, decimal strings, GUID keys and date literals. Text contains/prefix operations apply only to strings. Search uses configured string fields with the service's case sensitivity. Sorts append the configured key for stable pagination.

Queries negotiate `application/json;IEEE754Compatible=true` so decimal values remain strings. Counts encoded as integer strings are accepted only within JavaScript’s safe integer range; malformed or oversized counts fail. DTO mapping should retain decimal strings rather than convert them to numbers.

Queries request an exact count and at most 100 records, with offsets capped at 100,000. Server-driven continuation links are followed only within the same origin and resource path, until the requested page is filled. Empty or repeated continuations and oversized responses fail explicitly. Abort signals propagate to every request. The provider does not forward arbitrary OData expressions or expand navigation properties.

Library tests cover query escaping, typed value rejection, decimal precision, continuation boundaries and REST write delegation. The generated-resource runtime harness verifies the actual packaged REST/OData adapters against shared PostgreSQL fixtures: 53 rows, server continuation, exact decimals, date/integer/boolean/text/GUID filters, delegated writes, stale versions and deletion. Full browser view-switch qualification and SQL Server runtime remain separate checks; the sample continues to use REST lists by default.
