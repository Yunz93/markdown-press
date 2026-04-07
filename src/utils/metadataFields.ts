import type { Frontmatter, MetadataField } from '../types';
import { parseFrontmatter, updateFrontmatter } from './frontmatter';

const LEGACY_DEFAULT_METADATA_FIELDS: MetadataField[] = [
  { key: 'category', defaultValue: '' },
  { key: 'tags', defaultValue: '[]' },
  { key: 'status', defaultValue: 'draft' },
  { key: 'is_publish', defaultValue: 'false' },
  { key: 'date created', defaultValue: '{now}' },
  { key: 'date modified', defaultValue: '{now}' },
];

const RENAMED_LEGACY_DEFAULT_METADATA_FIELDS: MetadataField[] = [
  { key: 'category', defaultValue: '' },
  { key: 'tags', defaultValue: '[]' },
  { key: 'status', defaultValue: 'draft' },
  { key: 'is_publish', defaultValue: 'false' },
  { key: 'create_time', defaultValue: '{now}' },
  { key: 'update_time', defaultValue: '{now}' },
];

export const DEFAULT_METADATA_FIELDS: MetadataField[] = [
  { key: 'category', defaultValue: '' },
  { key: 'tags', defaultValue: '[]' },
  { key: 'status', defaultValue: 'draft' },
  { key: 'slug', defaultValue: '' },
  { key: 'aliases', defaultValue: '' },
  { key: 'is_publish', defaultValue: 'false' },
  { key: 'create_time', defaultValue: '{now}' },
  { key: 'update_time', defaultValue: '{now:datetime}' },
];

const AUTO_REFRESH_UPDATE_TIME_KEYS = new Set([
  'update_time',
  'updated_at',
  'date modified',
  'date_modified',
  'last_modified',
  'last modified',
]);

function cloneMetadataFields(fields: MetadataField[]): MetadataField[] {
  return fields.map((field) => ({ ...field }));
}

function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatLocalDateTime(date: Date, separator: 'T' | ' ' = ' '): string {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${formatLocalDate(date)}${separator}${hours}:${minutes}:${seconds}`;
}

function fieldsMatch(fields: MetadataField[], expectedFields: readonly MetadataField[]): boolean {
  return fields.length === expectedFields.length
    && fields.every((field, index) => (
      field.key === expectedFields[index].key
      && field.defaultValue === expectedFields[index].defaultValue
    ));
}

function renameLegacyMetadataKey(key: string): string {
  if (key === 'date created') return 'create_time';
  if (key === 'date modified') return 'update_time';
  return key;
}

function normalizeTimestampValue(value: unknown, key: string): string {
  const now = new Date();
  const trimmed = typeof value === 'string' ? value.trim() : '';

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return formatLocalDate(now);
  }

  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?Z$/.test(trimmed)) {
    return now.toISOString();
  }

  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(trimmed)) {
    return formatLocalDateTime(now, 'T');
  }

  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(?::\d{2})?$/.test(trimmed)) {
    return formatLocalDateTime(now, ' ');
  }

  return key === 'update_time' ? formatLocalDateTime(now, ' ') : formatLocalDate(now);
}

export function parseMetadataTemplateValue(rawValue: string): string | string[] | number | boolean {
  const normalized = rawValue.trim();

  if (normalized === '{now}') return formatLocalDate(new Date());
  if (normalized === '{now:datetime}') return formatLocalDateTime(new Date(), ' ');
  if (normalized === '{now:iso}') return new Date().toISOString();
  if (normalized === '[]') return [];
  if (normalized === '{}') return '';
  if (normalized.toLowerCase() === 'true') return true;
  if (normalized.toLowerCase() === 'false') return false;

  const num = Number(rawValue);
  if (!Number.isNaN(num) && rawValue.trim() !== '') return num;

  return rawValue;
}

export function normalizeMetadataFields(input: unknown): MetadataField[] {
  if (!Array.isArray(input)) {
    return cloneMetadataFields(DEFAULT_METADATA_FIELDS);
  }

  // Preserve an intentionally empty template instead of repopulating defaults on restart.
  if (input.length === 0) {
    return [];
  }

  const rawFields = input
    .map((field): MetadataField | null => {
      if (!field || typeof field !== 'object') return null;

      const rawKey = 'key' in field ? field.key : '';
      const rawDefaultValue = 'defaultValue' in field ? field.defaultValue : '';
      const key = typeof rawKey === 'string' ? rawKey.trim() : '';

      if (!key) return null;

      return {
        key,
        defaultValue: typeof rawDefaultValue === 'string' ? rawDefaultValue : String(rawDefaultValue ?? ''),
      };
    })
    .filter((field): field is MetadataField => Boolean(field));

  if (fieldsMatch(rawFields, LEGACY_DEFAULT_METADATA_FIELDS)) {
    return cloneMetadataFields(DEFAULT_METADATA_FIELDS);
  }

  const fields = rawFields
    .map((field): MetadataField | null => {
      const key = renameLegacyMetadataKey(field.key);

      if (!key) return null;

      return {
        key,
        defaultValue: field.defaultValue,
      };
    })
    .filter((field): field is MetadataField => Boolean(field));

  if (fields.length === 0) {
    return cloneMetadataFields(DEFAULT_METADATA_FIELDS);
  }

  const dedupedFields: MetadataField[] = [];
  const seenKeys = new Set<string>();
  for (const field of fields) {
    if (seenKeys.has(field.key)) continue;
    seenKeys.add(field.key);
    dedupedFields.push(field);
  }

  if (fieldsMatch(dedupedFields, RENAMED_LEGACY_DEFAULT_METADATA_FIELDS)) {
    return cloneMetadataFields(DEFAULT_METADATA_FIELDS);
  }

  return dedupedFields;
}

export function refreshDocumentUpdateTime(content: string): string {
  const { frontmatter } = parseFrontmatter(content);
  if (!frontmatter) {
    return content;
  }

  const updates: Frontmatter = {};
  let hasUpdates = false;

  for (const [key, value] of Object.entries(frontmatter)) {
    if (!AUTO_REFRESH_UPDATE_TIME_KEYS.has(key.trim().toLowerCase())) {
      continue;
    }

    updates[key] = normalizeTimestampValue(value, key);
    hasUpdates = true;
  }

  if (!hasUpdates) {
    return content;
  }

  return updateFrontmatter(content, updates);
}
