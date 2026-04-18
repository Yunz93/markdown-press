interface FileIoCapableFileSystem {
  readFile(path: string): Promise<string>;
  saveFile(path: string | null, content: string): Promise<string | null>;
  writeBinaryFile?(path: string, content: Uint8Array): Promise<void>;
  writeFile(path: string, content: string): Promise<void>;
}

type AsyncGuard = <T>(fn: () => Promise<T>, context: string) => Promise<T>;

export async function readFileContent(
  fs: FileIoCapableFileSystem,
  path: string,
  fileName: string,
  withErrorHandling: AsyncGuard
): Promise<string> {
  return withErrorHandling(
    () => fs.readFile(path),
    `Failed to read file: ${fileName}`
  );
}

export async function writeFileContent(
  fs: FileIoCapableFileSystem,
  path: string,
  content: string,
  withErrorHandling: AsyncGuard
): Promise<void> {
  await withErrorHandling(
    () => fs.writeFile(path, content),
    'Failed to write file'
  );
}

export async function writeBinaryFileContent(
  fs: FileIoCapableFileSystem,
  path: string,
  content: Uint8Array,
  withErrorHandling: AsyncGuard
): Promise<void> {
  await withErrorHandling(
    async () => {
      if (typeof fs.writeBinaryFile === 'function') {
        await fs.writeBinaryFile(path, content);
        return;
      }

      const decoded = new TextDecoder().decode(content);
      await fs.writeFile(path, decoded);
    },
    'Failed to write binary file'
  );
}

export async function saveFileContent(
  fs: FileIoCapableFileSystem,
  path: string | null,
  content: string,
  withErrorHandling: AsyncGuard
): Promise<string | null> {
  return withErrorHandling(
    () => fs.saveFile(path, content),
    'Failed to save file'
  );
}
