import type { FileNode } from '../types';

/**
 * File store state interface
 */
export interface FileState {
  files: FileNode[];
  currentFilePath: string | null;
  rootFolderPath: string | null;
}

/**
 * File store actions interface
 */
export interface FileActions {
  setFiles: (files: FileNode[]) => void;
  setCurrentFilePath: (path: string | null) => void;
  setRootFolderPath: (path: string | null) => void;
  updateFileContent: (fileId: string, content: string) => void;
  addFile: (file: FileNode) => void;
  removeFile: (fileId: string) => void;
  updateFileName: (fileId: string, newName: string, newPath: string) => void;
  toggleFileTrash: (fileId: string) => void;
  deleteFileForever: (fileId: string) => void;
}

/**
 * Initial file state
 */
export const initialFileState: FileState = {
  files: [],
  currentFilePath: null,
  rootFolderPath: null,
};

/**
 * Create file store slice
 */
export function createFileSlice(
  set: (fn: (state: FileState) => Partial<FileState>) => void,
  get: () => FileState & FileActions
): FileState & FileActions {
  return {
    ...initialFileState,

    setFiles: (files) => set(() => ({ files })),

    setCurrentFilePath: (path) => set(() => ({ currentFilePath: path })),

    setRootFolderPath: (path) => set(() => ({ rootFolderPath: path })),

    updateFileContent: (fileId, content) => {
      set((state) => {
        const updateTree = (nodes: FileNode[]): FileNode[] =>
          nodes.map((node) =>
            node.id === fileId
              ? { ...node, content }
              : node.children
                ? { ...node, children: updateTree(node.children) }
                : node
          );
        return { files: updateTree(state.files) };
      });
    },

    addFile: (file) => {
      set((state) => {
        const parentPath = file.path.substring(0, file.path.lastIndexOf(file.name) - 1);

        if (!parentPath || parentPath === state.rootFolderPath) {
          return { files: [...state.files, file] };
        }

        const addToTree = (nodes: FileNode[]): FileNode[] =>
          nodes.map((node) => {
            if (node.path === parentPath) {
              return { ...node, children: [...(node.children || []), file] };
            }
            if (node.children) {
              return { ...node, children: addToTree(node.children) };
            }
            return node;
          });
        return { files: addToTree(state.files) };
      });
    },

    removeFile: (fileId) => {
      set((state) => {
        const removeFromTree = (nodes: FileNode[]): FileNode[] =>
          nodes
            .filter((node) => node.id !== fileId)
            .map((node) =>
              node.children
                ? { ...node, children: removeFromTree(node.children) }
                : node
            );
        return { files: removeFromTree(state.files) };
      });
    },

    updateFileName: (fileId, newName, newPath) => {
      set((state) => {
        const updateTree = (nodes: FileNode[]): FileNode[] =>
          nodes.map((node) =>
            node.id === fileId
              ? { ...node, name: newName, path: newPath }
              : node.children
                ? { ...node, children: updateTree(node.children) }
                : node
          );
        return { files: updateTree(state.files) };
      });
    },

    toggleFileTrash: (fileId) => {
      set((state) => {
        const updateTree = (nodes: FileNode[]): FileNode[] =>
          nodes.map((node) => {
            if (node.id === fileId) {
              return { ...node, isTrash: !node.isTrash };
            }
            if (node.children) {
              return { ...node, children: updateTree(node.children) };
            }
            return node;
          });
        return { files: updateTree(state.files) };
      });
    },

    deleteFileForever: (fileId) => {
      set((state) => {
        const removeFromTree = (nodes: FileNode[]): FileNode[] =>
          nodes
            .filter((node) => node.id !== fileId)
            .map((node) =>
              node.children
                ? { ...node, children: removeFromTree(node.children) }
                : node
            );
        return { files: removeFromTree(state.files) };
      });
    },
  };
}
