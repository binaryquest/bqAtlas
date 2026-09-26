import {parseDecimalUnits, type FieldDescriptor} from '@bqatlas/contracts';

export type FieldValidator = (value: unknown, row: Readonly<Record<string, unknown>>, field: Readonly<FieldDescriptor>) => readonly string[];
export type FieldValidators = Readonly<Record<string, FieldValidator>>;

/** Validates drafts without coercing money or timezone-free dates. Server validation remains authoritative. */
export function validateFields(fields: readonly FieldDescriptor[], row: Record<string, unknown>, validators: FieldValidators = {}): Record<string, string[]> {
  const errors: Record<string, string[]> = {};
  for (const field of fields) {
    if (field.readOnly) continue;
    const value = row[field.name];
    const fail = (message: string) => { errors[field.name] = [message]; };
    const custom = () => {
      if (!Object.hasOwn(validators, field.name)) return;
      const messages = validators[field.name](structuredClone(value), structuredClone(row), structuredClone(field));
      if (messages.length) errors[field.name] = [...(errors[field.name] ?? []), ...messages];
    };
    if (value === null || value === undefined || value === '') {
      if (field.required) fail('This field is required.');
      custom();
      continue;
    }
    switch (field.type) {
      case 'string': case 'email':
        if (typeof value !== 'string') fail('Enter text.');
        else if (field.required && !value.trim()) fail('This field is required.');
        else if (field.maxLength !== null && value.length > field.maxLength) fail(`Use at most ${field.maxLength} characters.`);
        else if (field.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) fail('Enter a valid email address.');
        break;
      case 'boolean': if (typeof value !== 'boolean') fail('Choose true or false.'); break;
      case 'integer': if (typeof value !== 'number' || !Number.isSafeInteger(value)) fail('Enter a whole number within the safe integer range.'); break;
      case 'decimal': if (typeof value !== 'string' || parseDecimalUnits(value, field.scale ?? 2, field.maximum ?? undefined) === null) fail(`Enter a non-negative decimal with at most ${field.scale ?? 2} decimal places.`); break;
      case 'enum': if (typeof value !== 'string' || !field.options?.includes(value)) fail('Choose an available option.'); break;
      case 'date': {
        if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) { fail('Enter a valid date.'); break; }
        const date = new Date(value + 'T00:00:00Z');
        if (Number.isNaN(date.valueOf()) || date.toISOString().slice(0,10) !== value) fail('Enter a valid date.');
        break;
      }
      default: if (!Object.hasOwn(validators, field.name)) fail('This field requires a custom editor.');
    }
    custom();
  }
  return errors;
}
export function editableValues(fields: readonly FieldDescriptor[], row: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(fields.filter(field => !field.readOnly).map(field => [field.name, structuredClone(row[field.name])]));
}
