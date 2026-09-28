/** HTTP contract v1. Keep this package independent of Angular and server implementation. */
export const contractVersion = "1.0";
export interface FieldDescriptor {
  name: string;
  label: string;
  type:
    | "string"
    | "email"
    | "boolean"
    | "integer"
    | "decimal"
    | "date"
    | "dateTime"
    | "enum"
    | "reference";
  required: boolean;
  maxLength: number | null;
  readOnly: boolean;
  options: string[] | null;
  scale?: number | null;
  maximum?: string | null;
}
export interface ResourceDescriptor {
  id: string;
  title: string;
  endpoint: string;
  readPermission: string;
  fields: FieldDescriptor[];
  keyField: string;
  oDataEndpoint: string | null;
}
export interface ApplicationManifest {
  contractVersion: string;
  modules: string[];
  resources: ResourceDescriptor[];
}
export interface SessionInfo {
  authenticated: boolean;
  id: string | null;
  name: string | null;
  permissions: string[];
  authMode: "local" | "oidc";
}
export interface QueryRequest {
  page: number;
  pageSize: number;
  search: string;
  sort?: { field: string; direction: "asc" | "desc" }[];
  filters?: {
    field: string;
    operator: "eq" | "contains" | "startsWith";
    value: string;
  }[];
}
export interface PageResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}
export interface RecordCapabilities {
  edit: boolean;
  delete: boolean;
  commands: string[];
}
export interface RecordResult<T> {
  data: T;
  version: string;
  capabilities?: RecordCapabilities | null;
}
export interface ProblemDetails {
  title?: string;
  detail?: string;
  status?: number;
  code?: string;
  errors?: Record<string, string[]>;
}
export interface ResourceProvider<T, TInput = Partial<T>> {
  query(request: QueryRequest, signal?: AbortSignal): Promise<PageResult<T>>;
  get(id: string, signal?: AbortSignal): Promise<RecordResult<T>>;
  create(input: TInput, signal?: AbortSignal): Promise<RecordResult<T>>;
  update(
    id: string,
    input: TInput,
    version: string,
    signal?: AbortSignal,
  ): Promise<RecordResult<T>>;
  delete(id: string, version: string, signal?: AbortSignal): Promise<void>;
}

export interface LookupProvider<T> {
  /** Minimal eligible projection; unavailable records return null. */
  resolve?(id: string, signal?: AbortSignal): Promise<T | null>;
  query(request: QueryRequest, signal?: AbortSignal): Promise<PageResult<T>>;
}
export * from "./decimal.js";
