import { LanguageDescription, LanguageSupport, StreamLanguage } from '@codemirror/language';
import { normalizeShikiLanguage } from './shikiLanguages';

function loadLegacyLanguage<TModule extends Record<string, unknown>>(
  importer: () => Promise<TModule>,
  exportName: keyof TModule
): () => Promise<LanguageSupport> {
  return async () => {
    const module = await importer();
    const legacyMode = module[exportName];

    if (!legacyMode) {
      throw new Error(`Legacy CodeMirror mode "${String(exportName)}" is not available.`);
    }

    return new LanguageSupport(StreamLanguage.define(legacyMode as unknown as Parameters<typeof StreamLanguage.define>[0]));
  };
}

export const editorCodeLanguages = [
  LanguageDescription.of({
    name: 'JavaScript',
    alias: ['javascript', 'js', 'mjs', 'cjs', 'node'],
    extensions: ['js', 'mjs', 'cjs'],
    load: () => import('@codemirror/lang-javascript').then(({ javascript }) => javascript()),
  }),
  LanguageDescription.of({
    name: 'JSX',
    alias: ['jsx', 'react-jsx'],
    extensions: ['jsx'],
    load: () => import('@codemirror/lang-javascript').then(({ javascript }) => javascript({ jsx: true })),
  }),
  LanguageDescription.of({
    name: 'TypeScript',
    alias: ['typescript', 'ts', 'mts', 'cts'],
    extensions: ['ts', 'mts', 'cts'],
    load: () => import('@codemirror/lang-javascript').then(({ javascript }) => javascript({ typescript: true })),
  }),
  LanguageDescription.of({
    name: 'TSX',
    alias: ['tsx', 'react-tsx'],
    extensions: ['tsx'],
    load: () => import('@codemirror/lang-javascript').then(({ javascript }) => javascript({ typescript: true, jsx: true })),
  }),
  LanguageDescription.of({
    name: 'JSON',
    alias: ['json', 'jsonc', 'json5'],
    extensions: ['json', 'jsonc', 'json5'],
    load: () => import('@codemirror/lang-json').then(({ json }) => json()),
  }),
  LanguageDescription.of({
    name: 'HTML',
    alias: ['html', 'htm'],
    extensions: ['html', 'htm'],
    load: () => import('@codemirror/lang-html').then(({ html }) => html()),
  }),
  LanguageDescription.of({
    name: 'XML',
    alias: ['xml', 'svg', 'rss', 'atom'],
    extensions: ['xml', 'svg'],
    load: () => import('@codemirror/lang-xml').then(({ xml }) => xml()),
  }),
  LanguageDescription.of({
    name: 'CSS',
    alias: ['css', 'scss', 'sass', 'less', 'postcss'],
    extensions: ['css', 'scss', 'sass', 'less'],
    load: () => import('@codemirror/lang-css').then(({ css }) => css()),
  }),
  LanguageDescription.of({
    name: 'YAML',
    alias: ['yaml', 'yml'],
    extensions: ['yaml', 'yml'],
    load: () => import('@codemirror/lang-yaml').then(({ yaml }) => yaml()),
  }),
  LanguageDescription.of({
    name: 'TOML',
    alias: ['toml'],
    extensions: ['toml'],
    load: loadLegacyLanguage(() => import('@codemirror/legacy-modes/mode/toml'), 'toml'),
  }),
  LanguageDescription.of({
    name: 'Bash',
    alias: ['bash', 'sh', 'shell', 'shellscript', 'zsh', 'fish'],
    extensions: ['sh', 'bash'],
    load: loadLegacyLanguage(() => import('@codemirror/legacy-modes/mode/shell'), 'shell'),
  }),
  LanguageDescription.of({
    name: 'PowerShell',
    alias: ['powershell', 'ps1', 'pwsh'],
    extensions: ['ps1'],
    load: loadLegacyLanguage(() => import('@codemirror/legacy-modes/mode/powershell'), 'powerShell'),
  }),
  LanguageDescription.of({
    name: 'Python',
    alias: ['python', 'py'],
    extensions: ['py'],
    load: () => import('@codemirror/lang-python').then(({ python }) => python()),
  }),
  LanguageDescription.of({
    name: 'SQL',
    alias: ['sql', 'mysql', 'pgsql', 'postgresql', 'sqlite'],
    extensions: ['sql'],
    load: () => import('@codemirror/lang-sql').then(({ sql }) => sql()),
  }),
  LanguageDescription.of({
    name: 'Java',
    alias: ['java'],
    extensions: ['java'],
    load: () => import('@codemirror/lang-java').then(({ java }) => java()),
  }),
  LanguageDescription.of({
    name: 'C',
    alias: ['c', 'h'],
    extensions: ['c', 'h'],
    load: () => import('@codemirror/lang-cpp').then(({ cpp }) => cpp()),
  }),
  LanguageDescription.of({
    name: 'C++',
    alias: ['cpp', 'c++', 'cc', 'cxx', 'hpp', 'hxx', 'hh'],
    extensions: ['cpp', 'cc', 'cxx', 'hpp', 'hxx', 'hh'],
    load: () => import('@codemirror/lang-cpp').then(({ cpp }) => cpp()),
  }),
  LanguageDescription.of({
    name: 'C#',
    alias: ['csharp', 'c#', 'cs'],
    extensions: ['cs'],
    load: () => import('@replit/codemirror-lang-csharp').then(({ csharp }) => csharp()),
  }),
  LanguageDescription.of({
    name: 'Rust',
    alias: ['rust', 'rs'],
    extensions: ['rs'],
    load: () => import('@codemirror/lang-rust').then(({ rust }) => rust()),
  }),
  LanguageDescription.of({
    name: 'Go',
    alias: ['go', 'golang'],
    extensions: ['go'],
    load: loadLegacyLanguage(() => import('@codemirror/legacy-modes/mode/go'), 'go'),
  }),
  LanguageDescription.of({
    name: 'PHP',
    alias: ['php'],
    extensions: ['php'],
    load: () => import('@codemirror/lang-php').then(({ php }) => php()),
  }),
  LanguageDescription.of({
    name: 'Ruby',
    alias: ['ruby', 'rb'],
    extensions: ['rb'],
    load: loadLegacyLanguage(() => import('@codemirror/legacy-modes/mode/ruby'), 'ruby'),
  }),
  LanguageDescription.of({
    name: 'Lua',
    alias: ['lua'],
    extensions: ['lua'],
    load: loadLegacyLanguage(() => import('@codemirror/legacy-modes/mode/lua'), 'lua'),
  }),
  LanguageDescription.of({
    name: 'Perl',
    alias: ['perl', 'pl', 'pm'],
    extensions: ['pl', 'pm'],
    load: loadLegacyLanguage(() => import('@codemirror/legacy-modes/mode/perl'), 'perl'),
  }),
  LanguageDescription.of({
    name: 'R',
    alias: ['r'],
    extensions: ['r'],
    load: loadLegacyLanguage(() => import('@codemirror/legacy-modes/mode/r'), 'r'),
  }),
  LanguageDescription.of({
    name: 'Julia',
    alias: ['julia', 'jl'],
    extensions: ['jl'],
    load: loadLegacyLanguage(() => import('@codemirror/legacy-modes/mode/julia'), 'julia'),
  }),
  LanguageDescription.of({
    name: 'Swift',
    alias: ['swift'],
    extensions: ['swift'],
    load: loadLegacyLanguage(() => import('@codemirror/legacy-modes/mode/swift'), 'swift'),
  }),
  LanguageDescription.of({
    name: 'Dockerfile',
    alias: ['docker', 'dockerfile'],
    filename: /^dockerfile$/i,
    load: loadLegacyLanguage(() => import('@codemirror/legacy-modes/mode/dockerfile'), 'dockerFile'),
  }),
  LanguageDescription.of({
    name: 'Nginx',
    alias: ['nginx', 'nginxconf'],
    extensions: ['conf'],
    load: loadLegacyLanguage(() => import('@codemirror/legacy-modes/mode/nginx'), 'nginx'),
  }),
];

export function resolveEditorCodeLanguage(info: string): LanguageDescription | null {
  const infoToken = info.trim().split(/\s+/)[0] ?? '';
  const normalizedLanguage = normalizeShikiLanguage(infoToken);
  if (!normalizedLanguage || normalizedLanguage === 'mermaid' || normalizedLanguage === 'mmd') {
    return null;
  }

  return LanguageDescription.matchLanguageName(editorCodeLanguages, normalizedLanguage, true);
}
