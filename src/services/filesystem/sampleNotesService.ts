interface SampleNotesCapableFileSystem {
  copySampleNotes?: (targetDir: string) => Promise<boolean>;
}

export async function initializeSampleNotesIfSupported(
  fs: SampleNotesCapableFileSystem,
  targetDir: string
): Promise<boolean> {
  if (!fs.copySampleNotes) {
    console.log('Sample notes not supported in this environment');
    return false;
  }

  const timeoutPromise = new Promise<boolean>((_, reject) => {
    setTimeout(() => reject(new Error('Sample notes initialization timed out')), 5000);
  });

  return Promise.race([
    fs.copySampleNotes(targetDir),
    timeoutPromise,
  ]);
}
