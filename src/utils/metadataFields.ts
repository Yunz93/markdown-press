import type { Frontmatter, MetadataField } from '../types';
import { parseFrontmatter, replaceFrontmatterInner, updateFrontmatter } from './frontmatter';

const LEGACY_DEFAULT_METADATA_FIELDS: MetadataField[] = [
  { key: 'category', defaultValue: '' },
  { key: 'tags', defaultValue: '[]' },
  { key: 'status', defaultValue: 'draft' },
  { key: 'is_publish', defaultValue: 'false' },
  { key: 'date created', defaultValue: '{now}' },
  { key: 'date modified', defaultValue: '{now}' },
];

const LEGACY_DEFAULT_METADATA_FIELDS_WITH_SECONDS: MetadataField[] = [
  { key: 'category', defaultValue: '' },
  { key: 'tags', defaultValue: '[]' },
  { key: 'status', defaultValue: 'draft' },
  { key: 'is_publish', defaultValue: 'false' },
  { key: 'date created', defaultValue: '{now:datetime}' },
  { key: 'date modified', defaultValue: '{now:datetime}' },
];

const RENAMED_LEGACY_DEFAULT_METADATA_FIELDS: MetadataField[] = [
  { key: 'category', defaultValue: '' },
  { key: 'tags', defaultValue: '[]' },
  { key: 'status', defaultValue: 'draft' },
  { key: 'is_publish', defaultValue: 'false' },
  { key: 'create_time', defaultValue: '{now}' },
  { key: 'update_time', defaultValue: '{now}' },
];

const RENAMED_LEGACY_DEFAULT_METADATA_FIELDS_WITH_SECONDS: MetadataField[] = [
  { key: 'category', defaultValue: '' },
  { key: 'tags', defaultValue: '[]' },
  { key: 'status', defaultValue: 'draft' },
  { key: 'is_publish', defaultValue: 'false' },
  { key: 'create_time', defaultValue: '{now:datetime}' },
  { key: 'update_time', defaultValue: '{now:datetime}' },
];

export const DEFAULT_METADATA_FIELDS: MetadataField[] = [
  { key: 'category', defaultValue: '' },
  { key: 'tags', defaultValue: '[]' },
  { key: 'status', defaultValue: 'draft' },
  { key: 'slug', defaultValue: '' },
  { key: 'aliases', defaultValue: '' },
  { key: 'is_publish', defaultValue: 'false' },
  { key: 'date created', defaultValue: '{now:datetime}' },
  { key: 'date modified', defaultValue: '{now:datetime}' },
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
  if (key === 'create_time') return 'date created';
  if (key === 'update_time') return 'date modified';
  return key;
}

function shouldUseDateTimePrecision(key: string): boolean {
  const normalizedKey = key.trim().toLowerCase();
  return normalizedKey === 'create_time'
    || normalizedKey === 'date created'
    || normalizedKey === 'date_created'
    || normalizedKey === 'created_at'
    || AUTO_REFRESH_UPDATE_TIME_KEYS.has(normalizedKey);
}

function normalizeMetadataDefaultValue(key: string, defaultValue: string): string {
  const trimmedDefaultValue = defaultValue.trim();
  if (trimmedDefaultValue === '{now}' && shouldUseDateTimePrecision(key)) {
    return '{now:datetime}';
  }

  return defaultValue;
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

  return shouldUseDateTimePrecision(key) ? formatLocalDateTime(now, ' ') : formatLocalDate(now);
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
        defaultValue: normalizeMetadataDefaultValue(
          key,
          typeof rawDefaultValue === 'string' ? rawDefaultValue : String(rawDefaultValue ?? '')
        ),
      };
    })
    .filter((field): field is MetadataField => Boolean(field));

  if (
    fieldsMatch(rawFields, LEGACY_DEFAULT_METADATA_FIELDS)
    || fieldsMatch(rawFields, LEGACY_DEFAULT_METADATA_FIELDS_WITH_SECONDS)
  ) {
    return cloneMetadataFields(DEFAULT_METADATA_FIELDS);
  }

  if (
    fieldsMatch(rawFields, RENAMED_LEGACY_DEFAULT_METADATA_FIELDS)
    || fieldsMatch(rawFields, RENAMED_LEGACY_DEFAULT_METADATA_FIELDS_WITH_SECONDS)
  ) {
    return cloneMetadataFields(DEFAULT_METADATA_FIELDS);
  }

  const fields = rawFields
    .map((field): MetadataField | null => {
      const key = renameLegacyMetadataKey(field.key);

      if (!key) return null;

      return {
        key,
        defaultValue: normalizeMetadataDefaultValue(key, field.defaultValue),
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

  return dedupedFields;
}

function stripYamlKeyQuotes(rawKey: string): string {
  const t = rawKey.trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    return t.slice(1, -1).trim();
  }
  return t;
}

/** Scalar timestamps only — block/flow structures need full YAML round-trip */
function isInlineTimestampYamlValue(rawTail: string): boolean {
  const t = rawTail.trim();
  if (!t) {
    return true;
  }

  if (t === '|' || t === '>') {
    return false;
  }

  if (t.startsWith('|') || t.startsWith('>')) {
    return false;
  }

  if (t.startsWith('{') || t.startsWith('[') || t.startsWith('*') || t.startsWith('&')) {
    return false;
  }

  return true;
}

function legacyRefreshDocumentUpdateTime(content: string, frontmatter: Frontmatter): string {
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

/**
 * Refresh update-time frontmatter keys without rewriting the entire YAML block.
 * Full round-trips reorder/reformat keys and cause large editor replacements that steal focus/caret.
 */
export function refreshDocumentUpdateTime(content: string): string {
  const { frontmatter } = parseFrontmatter(content);
  if (!frontmatter) {
    return content;
  }

  const refreshKeysLower = new Set(
    Object.keys(frontmatter).filter((key) => (
      AUTO_REFRESH_UPDATE_TIME_KEYS.has(key.trim().toLowerCase())
    )).map((key) => key.trim().toLowerCase()),
  );

  if (refreshKeysLower.size === 0) {
    return content;
  }

  const touchedLowerKeys = new Set<string>();

  const surgical = replaceFrontmatterInner(content, (inner, { lineEnding }) => {
    const lines = inner.split(/\r?\n/);
    let blockedByStructuredValue = false;

    const nextLines = lines.map((line) => {
      const trimmedStart = line.trimStart();
      if (trimmedStart.startsWith('#')) {
        return line;
      }

      const colonIdx = line.indexOf(':');
      if (colonIdx <= 0) {
        return line;
      }

      const keySegment = line.slice(0, colonIdx);
      const logicalKey = stripYamlKeyQuotes(keySegment.trim());

      if (!AUTO_REFRESH_UPDATE_TIME_KEYS.has(logicalKey.toLowerCase())) {
        return line;
      }

      const afterColon = line.slice(colonIdx + 1);
      const rawTail = afterColon.replace(/^\s*/, '');

      if (!isInlineTimestampYamlValue(rawTail)) {
        blockedByStructuredValue = true;
        return line;
      }

      const nextStamp = normalizeTimestampValue(rawTail, logicalKey);
      if (rawTail.trim() === nextStamp) {
        touchedLowerKeys.add(logicalKey.toLowerCase());
        return line;
      }

      touchedLowerKeys.add(logicalKey.toLowerCase());

      const spacing = afterColon.match(/^\s*/)?.[0] ?? ' ';
      return `${line.slice(0, colonIdx + 1)}${spacing}${nextStamp}`;
    });

    if (blockedByStructuredValue) {
      return null;
    }

    for (const keyLower of refreshKeysLower) {
      if (!touchedLowerKeys.has(keyLower)) {
        return null;
      }
    }

    return nextLines.join(lineEnding);
  });

  if (surgical !== null) {
    return surgical;
  }

  return legacyRefreshDocumentUpdateTime(content, frontmatter);
}
