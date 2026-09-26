import type { PageResult, QueryRequest, ResourceProvider } from '@bqatlas/contracts';
import { AtlasApi } from './api';

export interface ODataField {
  /** Public EDM property name, never an arbitrary OData expression. */
  property: string;
  type: 'string' | 'boolean' | 'integer' | 'decimal' | 'date' | 'guid';
}
export interface ODataQueryOptions<TWire, T> {
  fields: Readonly<Record<string, ODataField>>;
  key: string;
  searchFields?: readonly string[];
  map: (record: TWire) => T;
}
const identifier = /^[A-Za-z_][A-Za-z0-9_]*$/;
const quote = (value: string) => `'${value.replaceAll("'", "''")}'`;

/** Read OData DTOs while retaining the application's REST ETag and command semantics. */
export class ODataResourceProvider<T, TInput = Partial<T>, TWire = T>
  implements ResourceProvider<T, TInput> {
  constructor(
    private readonly api: AtlasApi,
    private readonly endpoint: string,
    private readonly records: ResourceProvider<T, TInput>,
    private readonly options: ODataQueryOptions<TWire, T>,
  ) {
    if (!endpoint.startsWith('/') || endpoint.startsWith('//') || /[?#]/.test(endpoint))
      throw new Error('OData endpoint must be a same-origin path without query or fragment.');
    this.field(options.key);
    for (const name of options.searchFields ?? []) {
      if (this.field(name).type !== 'string') throw new Error('Search fields must be strings.');
    }
  }
  private field(name: string): ODataField {
    const field = Object.hasOwn(this.options.fields, name) ? this.options.fields[name] : undefined;
    if (!field || !identifier.test(field.property)) throw new Error(`Unknown OData field: ${name}`);
    return field;
  }
  async query(request: QueryRequest, signal?: AbortSignal): Promise<PageResult<T>> {
    if (!Number.isSafeInteger(request.page) || request.page < 0 ||
        !Number.isSafeInteger(request.pageSize) || request.pageSize < 1 || request.pageSize > 100 ||
        request.page * request.pageSize > 100000) throw new Error('Invalid OData page.');
    const params = new URLSearchParams({ '$count': 'true', '$top': String(request.pageSize), '$skip': String(request.page * request.pageSize) });
    const order = (request.sort ?? []).map(sort => {
      if (!['asc', 'desc'].includes(sort.direction)) throw new Error('Invalid OData sort direction.');
      return `${this.field(sort.field).property} ${sort.direction}`;
    });
    if (!(request.sort ?? []).some(sort => sort.field === this.options.key)) order.push(`${this.field(this.options.key).property} asc`);
    params.set('$orderby', order.join(','));
    const filters = (request.filters ?? []).map(filter => {
      const field = this.field(filter.field);
      if (!['eq', 'contains', 'startsWith'].includes(filter.operator)) throw new Error('Unsupported OData operator.');
      if (filter.operator !== 'eq') {
        if (field.type !== 'string') throw new Error('Text filters require a string field.');
        return `${filter.operator === 'startsWith' ? 'startswith' : 'contains'}(${field.property},${quote(filter.value)})`;
      }
      let value = filter.value;
      switch (field.type) {
        case 'string': value = quote(value); break;
        case 'boolean': if (!/^(true|false)$/.test(value)) throw new Error('Invalid boolean filter.'); break;
        case 'integer': if (!/^-?(0|[1-9]\d*)$/.test(value)) throw new Error('Invalid integer filter.'); break;
        case 'decimal': if (!/^-?(0|[1-9]\d*)(\.\d+)?$/.test(value)) throw new Error('Invalid decimal filter.'); break;
        case 'guid': if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) throw new Error('Invalid GUID filter.'); break;
        case 'date': if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Invalid date filter.'); break;
      }
      return `${field.property} eq ${value}`;
    });
    if (request.search.trim()) {
      if (!this.options.searchFields?.length) throw new Error('OData search fields are not configured.');
      filters.push('(' + this.options.searchFields.map(name => `contains(${this.field(name).property},${quote(request.search.trim())})`).join(' or ') + ')');
    }
    if (filters.length) params.set('$filter', filters.join(' and '));
    let next: string | undefined = `${this.endpoint}?${params}`;
    const items: T[] = [];
    const seen = new Set<string>();
    let total: number | undefined;
    while (next) {
      if (seen.has(next)) throw new Error('Repeated OData continuation.');
      seen.add(next);
      const page: { value: TWire[]; '@odata.count'?: number | string; '@odata.nextLink'?: string } = await this.api.request(next, 'GET', undefined, signal, undefined, undefined, 'application/json;IEEE754Compatible=true');
      if (!Array.isArray(page.value) || page.value.length + items.length > request.pageSize) throw new Error('Invalid OData page response.');
      if (total === undefined) {
        const count = page['@odata.count'];
        total = typeof count === 'string' && /^(0|[1-9]\d*)$/.test(count) && BigInt(count) <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(count) : typeof count === 'number' ? count : undefined;
      }
      if (!Number.isSafeInteger(total) || total! < 0) throw new Error('OData response requires an exact count.');
      items.push(...page.value.map(this.options.map));
      next = undefined;
      if (page['@odata.nextLink'] && items.length < request.pageSize) {
        if (!page.value.length) throw new Error('Empty OData continuation page.');
        const base = new URL(this.endpoint, window.location.origin);
        const link = new URL(page['@odata.nextLink'], base);
        if (link.origin !== base.origin || link.pathname !== base.pathname || link.hash || link.username || link.password)
          throw new Error('OData continuation must stay on the same resource.');
        next = link.pathname + link.search;
      }
    }
    return { items, total: total!, page: request.page, pageSize: request.pageSize };
  }
  get(id: string, signal?: AbortSignal) { return this.records.get(id, signal); }
  create(input: TInput, signal?: AbortSignal) { return this.records.create(input, signal); }
  update(id: string, input: TInput, version: string, signal?: AbortSignal) { return this.records.update(id, input, version, signal); }
  delete(id: string, version: string, signal?: AbortSignal) { return this.records.delete(id, version, signal); }
}
