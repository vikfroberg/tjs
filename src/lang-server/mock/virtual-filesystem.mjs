export function createVirtualFileSystem(files = {}) {
  const fileMap = new Map();
  
  // Convert object to Map for easier manipulation
  for (const [path, content] of Object.entries(files)) {
    fileMap.set(path, content);
  }
  
  return fileMap;
}

export function createTestWorkspace(workspacePath, files) {
  const virtualFiles = new Map();
  
  for (const [relativePath, content] of Object.entries(files)) {
    const absolutePath = `${workspacePath}/${relativePath}`;
    virtualFiles.set(absolutePath, content);
  }
  
  return virtualFiles;
}

// Common test scenarios
export const commonTestFiles = {
  simple: {
    '/workspace/index.mjs': 'export const hello = "world";',
    '/workspace/math.mjs': 'export const sum = (a, b) => a + b;'
  },
  
  withImports: {
    '/workspace/index.mjs': 'import { sum } from "./math.mjs";\nexport const result = sum(1, 2);',
    '/workspace/math.mjs': 'export const sum = (a, b) => a + b;'
  },
  
  withTypeMismatches: {
    '/workspace/index.mjs': 'import { sum } from "./math.mjs";\nexport const result = sum("hello", "world");',
    '/workspace/math.mjs': 'export const sum = (a, b) => a + b;',
    '/workspace/strings.mjs': 'export const length = (str) => str.length;\nexport const badCall = length(42);'
  },
  
  complex: {
    '/workspace/index.mjs': 'import { utils } from "./utils/helper.mjs";\nexport const app = utils.init();',
    '/workspace/utils/helper.mjs': 'export const utils = { init: () => "initialized" };',
    '/workspace/math.mjs': 'export const sum = (a, b) => a + b;\nexport const multiply = (a, b) => a * b;'
  }
};

export function createWorkspaceFiles(scenario = 'simple') {
  if (!commonTestFiles[scenario]) {
    throw new Error(`Unknown test scenario: ${scenario}. Available: ${Object.keys(commonTestFiles).join(', ')}`);
  }
  
  return createVirtualFileSystem(commonTestFiles[scenario]);
}