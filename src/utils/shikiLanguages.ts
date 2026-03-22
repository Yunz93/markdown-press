const FENCE_LANGUAGE_PATTERN = /^[\t ]*(?:`{3,}|~{3,})\s*([^\s`~{]+)/gm;

export const SHIKI_CORE_LANGS = [
  'javascript', 'typescript', 'jsx', 'tsx',
  'json', 'json5', 'jsonc', 'yaml', 'toml', 'ini', 'dotenv',
  'markdown', 'mdx', 'html', 'xml', 'css', 'scss', 'sass', 'less', 'postcss',
  'bash', 'shellscript', 'powershell',
  'python', 'java', 'kotlin', 'groovy', 'scala',
  'go', 'rust', 'c', 'cpp', 'csharp',
  'php', 'ruby', 'swift', 'dart', 'lua', 'perl', 'r', 'julia',
  'sql', 'graphql', 'prisma',
  'docker', 'makefile', 'cmake', 'nginx', 'diff', 'viml',
  'vue', 'vue-html', 'svelte', 'astro', 'angular-html', 'angular-ts',
] as const;

export const SHIKI_LANGUAGE_ALIASES: Record<string, string> = {
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  ts: 'typescript',
  mts: 'typescript',
  cts: 'typescript',
  sh: 'bash',
  shell: 'bash',
  zsh: 'bash',
  fish: 'bash',
  yml: 'yaml',
  py: 'python',
  rs: 'rust',
  md: 'markdown',
  csharp: 'csharp',
  'c#': 'csharp',
  cs: 'csharp',
  'c++': 'cpp',
  cc: 'cpp',
  cxx: 'cpp',
  hpp: 'cpp',
  hh: 'cpp',
  hxx: 'cpp',
  rb: 'ruby',
  kt: 'kotlin',
  kts: 'kotlin',
  ps: 'powershell',
  ps1: 'powershell',
  pwsh: 'powershell',
  dockerfile: 'docker',
  gql: 'graphql',
  gqls: 'graphql',
  graphqls: 'graphql',
  make: 'makefile',
  mk: 'makefile',
  vim: 'viml',
  objc: 'objective-c',
  'obj-c': 'objective-c',
  'objective-c': 'objective-c',
};

export function normalizeShikiLanguage(rawLang: string): string {
  const normalized = rawLang.trim().toLowerCase();
  if (!normalized) return '';
  return SHIKI_LANGUAGE_ALIASES[normalized] ?? normalized;
}

export function extractMarkdownFenceLanguages(markdown: string): string[] {
  if (!markdown) return [];

  const languages = new Set<string>();

  for (const match of markdown.matchAll(FENCE_LANGUAGE_PATTERN)) {
    const normalized = normalizeShikiLanguage(match[1] ?? '');
    if (!normalized || normalized === 'mermaid' || normalized === 'mmd') {
      continue;
    }
    languages.add(normalized);
  }

  return Array.from(languages);
}
