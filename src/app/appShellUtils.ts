import { getPathBasename as getPathBasenameStrict } from "../utils/pathHelpers";

export { findFileInTree } from "../utils/fileTree";

export function getPathBasename(path: string | null | undefined): string {
  if (!path) return "";
  return getPathBasenameStrict(path);
}
