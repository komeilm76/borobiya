import { badRequest } from './errors.ts';

export type Validator<T> = (value: unknown, path?: string) => T;

function issue(path: string, message: string): never {
  throw badRequest('Invalid request.', { field: path, reason: message });
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

interface TextOptions {
  min?: number;
  max?: number;
  pattern?: RegExp;
  trim?: boolean;
  lower?: boolean;
  allowEmpty?: boolean;
}

export function text(options: TextOptions = {}): Validator<string> {
  const { min = 0, max = 500, trim = true, lower = false, allowEmpty = false, pattern } = options;
  return (value, path = 'value') => {
    if (typeof value !== 'string') issue(path, 'must be a string');
    let output = trim ? value.trim() : value;
    if (lower) output = output.toLowerCase();
    if (!allowEmpty && output.length === 0) issue(path, 'must not be empty');
    if (output.length < min) issue(path, `must contain at least ${min} characters`);
    if (output.length > max) issue(path, `must contain at most ${max} characters`);
    if (/[\u0000-\u001F\u007F]/.test(output)) issue(path, 'must not contain control characters');
    if (pattern && !pattern.test(output)) issue(path, 'has an invalid format');
    return output;
  };
}

export const username = text({ min: 3, max: 32, lower: true, pattern: /^[a-z0-9._-]+$/ });
export const displayText = (min = 1, max = 200) => text({ min, max });
export const description = text({ min: 10, max: 500 });
export const identifier = text({ min: 2, max: 80, pattern: /^[A-Za-z0-9_.:-]+$/ });
/**
 * Strict password policy. Applied where a password is chosen: registration, recovery reset and
 * administrator-created accounts.
 */
export const password: Validator<string> = (value, path = 'password') => {
  const output = text({ min: 12, max: 128, trim: false })(value, path);
  if (!/[A-Za-z]/.test(output) || !/[0-9]/.test(output)) issue(path, 'must include letters and numbers');
  return output;
};

/**
 * Login secret. Authentication must accept whatever is stored, including secrets provisioned
 * outside the registration policy (for example the documented bootstrap administrator password),
 * so only length is checked here. Strength is enforced where a password is set.
 */
export const loginSecret: Validator<string> = (value, path = 'password') =>
  text({ min: 1, max: 128, trim: false })(value, path);

interface NumberOptions { min?: number; max?: number; integer?: boolean }
export function number(options: NumberOptions = {}): Validator<number> {
  const { min = -Number.MAX_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER, integer = false } = options;
  return (value, path = 'value') => {
    const parsed = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
    if (typeof parsed !== 'number' || !Number.isFinite(parsed)) issue(path, 'must be a finite number');
    if (integer && !Number.isSafeInteger(parsed)) issue(path, 'must be an integer');
    if (parsed < min || parsed > max) issue(path, `must be between ${min} and ${max}`);
    return parsed;
  };
}

export const latitude = number({ min: -90, max: 90 });
export const longitude = number({ min: -180, max: 180 });
export const accuracy = number({ min: 0, max: 100000 });
export const positiveInteger = number({ min: 1, max: Number.MAX_SAFE_INTEGER, integer: true });

export function boolean(): Validator<boolean> {
  return (value, path = 'value') => {
    if (typeof value === 'boolean') return value;
    if (value === 'true' || value === '1') return true;
    if (value === 'false' || value === '0') return false;
    return issue(path, 'must be a boolean');
  };
}

export function oneOf<T extends string>(values: readonly T[]): Validator<T> {
  return (value, path = 'value') => {
    if (typeof value !== 'string' || !values.includes(value as T)) {
      issue(path, `must be one of: ${values.join(', ')}`);
    }
    return value as T;
  };
}

export function array<T>(item: Validator<T>, options: { min?: number; max?: number } = {}): Validator<T[]> {
  const { min = 0, max = 100 } = options;
  return (value, path = 'value') => {
    if (!Array.isArray(value)) issue(path, 'must be an array');
    if (value.length < min) issue(path, `must contain at least ${min} items`);
    if (value.length > max) issue(path, `must contain at most ${max} items`);
    return value.map((entry, index) => item(entry, `${path}[${index}]`));
  };
}

type ShapeSpec = Record<string, Validator<unknown>>;
type ShapeResult<T extends ShapeSpec> = { [K in keyof T]: ReturnType<T[K]> };

export function shape<T extends ShapeSpec>(spec: T, options: { allowUnknown?: boolean } = {}): Validator<ShapeResult<T>> {
  return (value, path = 'body') => {
    if (!isPlainObject(value)) issue(path, 'must be a JSON object');
    const output: Record<string, unknown> = {};
    for (const [key, validator] of Object.entries(spec)) {
      if (!(key in value)) {
        const optionalResult = validator(undefined, `${path}.${key}`);
        if (optionalResult !== undefined) output[key] = optionalResult;
        continue;
      }
      output[key] = validator(value[key], `${path}.${key}`);
    }
    const unknown = Object.keys(value).filter((key) => !(key in spec));
    if (!options.allowUnknown && unknown.length) issue(path, `contains unknown fields: ${unknown.join(', ')}`);
    return output as ShapeResult<T>;
  };
}

export function optional<T>(validator: Validator<T>): Validator<T | undefined> {
  return (value, path) => (value === undefined || value === null ? undefined : validator(value, path));
}

export function queryObject(searchParams: URLSearchParams): Record<string, string> {
  const output: Record<string, string> = {};
  for (const [key, value] of searchParams) {
    if (!(key in output)) output[key] = value;
  }
  return output;
}

export function parse<T>(validator: Validator<T>, value: unknown, path = 'body'): T {
  return validator(value, path);
}
