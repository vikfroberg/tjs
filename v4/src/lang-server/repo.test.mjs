import { test, suite } from 'node:test';
import assert from 'node:assert/strict';
import * as Repo from './repo.mjs';
import * as Build from './build.mjs';

suite('Language server - Repo', async () => {
  // Test data setup
  const createTestWorkspaces = () => {
    const moduleProvider = (path) => true; // Mock all imports as available
    const importResolver = Build.createImportResolver(moduleProvider);
    
    // Workspace 1
    const workspace1Dir = '/test/workspace1';
    const workspace1IndexModule = Build.createModuleFromSource(
      'export const hello = "world";\nimport { helper } from "./helper.mjs";',
      '/test/workspace1/index.mjs',
      workspace1Dir,
      importResolver
    );
    const workspace1HelperModule = Build.createModuleFromSource(
      'export const helper = () => "help";',
      '/test/workspace1/helper.mjs', 
      workspace1Dir,
      importResolver
    );

    // Workspace 2
    const workspace2Dir = '/test/workspace2';
    const workspace2MainModule = Build.createModuleFromSource(
      'export const main = "app";\nimport { utils } from "./utils.mjs";',
      '/test/workspace2/main.mjs',
      workspace2Dir,
      importResolver
    );
    const workspace2UtilsModule = Build.createModuleFromSource(
      'export const utils = { log: console.log };',
      '/test/workspace2/utils.mjs',
      workspace2Dir,
      importResolver
    );

    const workspaceModulesMap = new Map([
      [workspace1Dir, new Map([
        ['/test/workspace1/index.mjs', workspace1IndexModule],
        ['/test/workspace1/helper.mjs', workspace1HelperModule]
      ])],
      [workspace2Dir, new Map([
        ['/test/workspace2/main.mjs', workspace2MainModule],
        ['/test/workspace2/utils.mjs', workspace2UtilsModule]
      ])]
    ]);

    return {
      workspaceModulesMap,
      workspace1Dir,
      workspace2Dir,
      workspace1IndexModule,
      workspace1HelperModule,
      workspace2MainModule,
      workspace2UtilsModule
    };
  };
  test('init - should initialize store with workspace directories', async () => {
    const { workspaceModulesMap, workspace1Dir, workspace2Dir } = createTestWorkspaces();

    // Initialize store with our pre-built module maps
    const store = Repo.init(workspaceModulesMap);

    // Verify store structure
    assert.ok(store instanceof Map);
    assert.equal(store.size, 2); // Should have 2 workspaces
    
    // Verify workspace 1
    assert.ok(store.has(workspace1Dir));
    const workspace1Modules = store.get(workspace1Dir);
    assert.ok(workspace1Modules instanceof Map);
    assert.equal(workspace1Modules.size, 2); // Should have 2 files

    // Verify workspace 2  
    assert.ok(store.has(workspace2Dir));
    const workspace2Modules = store.get(workspace2Dir);
    assert.ok(workspace2Modules instanceof Map);
    assert.equal(workspace2Modules.size, 2); // Should have 2 files
  });

  test('findModule - should find module in correct workspace', async () => {
    const { workspaceModulesMap, workspace1IndexModule, workspace2MainModule } = createTestWorkspaces();
    
    // Initialize store
    const store = Repo.init(workspaceModulesMap);

    // Find module in workspace 1
    const foundModule1 = Repo.findModule(store, '/test/workspace1/index.mjs');
    assert.ok(foundModule1);
    assert.equal(foundModule1.source, workspace1IndexModule.source);
    assert.deepEqual(foundModule1.exports, workspace1IndexModule.exports);

    // Find module in workspace 2
    const foundModule2 = Repo.findModule(store, '/test/workspace2/main.mjs');
    assert.ok(foundModule2);
    assert.equal(foundModule2.source, workspace2MainModule.source);
    assert.deepEqual(foundModule2.exports, workspace2MainModule.exports);

    // Try to find non-existent module
    const notFound = Repo.findModule(store, '/test/nonexistent/file.mjs');
    assert.equal(notFound, null);
  });

  test('updateModule - should update existing module in correct workspace', async () => {
    const { workspaceModulesMap } = createTestWorkspaces();
    
    // Initialize store
    const store = Repo.init(workspaceModulesMap);

    // New content for update
    const newContent = 'export const updated = "content";\nimport { newThing } from "./helper.mjs";';
    const testFilePath = '/test/workspace1/index.mjs';

    // Update module
    const updatedModule = Repo.updateModule(store, testFilePath, newContent);

    // Verify update
    assert.ok(updatedModule);
    assert.equal(updatedModule.source, newContent);

    // Verify store was updated
    const foundModule = Repo.findModule(store, testFilePath);
    assert.equal(foundModule.source, newContent);
  });

  test('updateModule - should return null for non-existent module', async () => {
    const { workspaceModulesMap } = createTestWorkspaces();
    
    // Initialize store
    const store = Repo.init(workspaceModulesMap);

    // Try to update non-existent module
    const result = Repo.updateModule(store, '/test/nonexistent/file.mjs', 'new content');

    // Should return null
    assert.equal(result, null);
  });

  test('findModule - should handle path resolution edge cases', async () => {
    const moduleProvider = (path) => true;
    const importResolver = Build.createImportResolver(moduleProvider);
    
    // Create workspaces with similar path prefixes
    const workspace1 = '/test/app';
    const workspace2 = '/test/app-v2';
    
    const module1 = Build.createModuleFromSource('export const a = 1;', '/test/app/index.mjs', workspace1, importResolver);
    const module2 = Build.createModuleFromSource('export const b = 2;', '/test/app-v2/index.mjs', workspace2, importResolver);
    
    const workspaceModulesMap = new Map([
      [workspace1, new Map([['/test/app/index.mjs', module1]])],
      [workspace2, new Map([['/test/app-v2/index.mjs', module2]])]
    ]);
    
    const store = Repo.init(workspaceModulesMap);

    // Should find correct module even with similar path prefixes
    const found1 = Repo.findModule(store, '/test/app/index.mjs');
    const found2 = Repo.findModule(store, '/test/app-v2/index.mjs');
    
    assert.ok(found1, 'Should find module in workspace1');
    assert.ok(found2, 'Should find module in workspace2');
    assert.equal(found1.source, 'export const a = 1;');
    assert.equal(found2.source, 'export const b = 2;');
  });

  test('updateModule - should properly resolve imports with moduleProvider', async () => {
    const { workspaceModulesMap } = createTestWorkspaces();
    const store = Repo.init(workspaceModulesMap);

    // Update module with import that should be resolved
    const newContent = 'import { helper } from "./helper.mjs";\nexport const updated = helper();';
    const updatedModule = Repo.updateModule(store, '/test/workspace1/index.mjs', newContent);

    // Verify the import was resolved (helper.mjs exists in the same workspace)
    assert.ok(updatedModule);
    assert.equal(updatedModule.imports.length, 1);
    assert.equal(updatedModule.imports[0].resolvedModulePath, '/test/workspace1/helper.mjs');
  });

  test('updateModule - should handle imports to non-existent modules', async () => {
    const { workspaceModulesMap } = createTestWorkspaces();
    const store = Repo.init(workspaceModulesMap);

    // Update module with import that doesn't exist
    const newContent = 'import { missing } from "./nonexistent.mjs";\nexport const updated = missing;';
    const updatedModule = Repo.updateModule(store, '/test/workspace1/index.mjs', newContent);

    // Should still create module, but import won't be resolved
    assert.ok(updatedModule);
    assert.equal(updatedModule.imports.length, 1);
    assert.equal(updatedModule.imports[0].resolvedModulePath, null);
  });

  test('init - should handle empty workspace maps', async () => {
    const emptyWorkspaceMap = new Map();
    const store = Repo.init(emptyWorkspaceMap);

    assert.ok(store instanceof Map);
    assert.equal(store.size, 0);

    // Operations on empty store should work gracefully
    const notFound = Repo.findModule(store, '/any/path.mjs');
    assert.equal(notFound, null);

    const updateResult = Repo.updateModule(store, '/any/path.mjs', 'content');
    assert.equal(updateResult, null);
  });

  test('init - should handle workspace with empty module maps', async () => {
    const workspaceWithEmptyModules = new Map([
      ['/test/empty-workspace', new Map()]
    ]);
    
    const store = Repo.init(workspaceWithEmptyModules);

    assert.ok(store.has('/test/empty-workspace'));
    assert.equal(store.get('/test/empty-workspace').size, 0);

    // Should not find modules in empty workspace
    const notFound = Repo.findModule(store, '/test/empty-workspace/file.mjs');
    assert.equal(notFound, null);
  });

  test('findModule - should return null for file outside any workspace', async () => {
    const { workspaceModulesMap } = createTestWorkspaces();
    const store = Repo.init(workspaceModulesMap);

    // File path that doesn't start with any workspace directory
    const outsideFile = Repo.findModule(store, '/completely/different/path.mjs');
    assert.equal(outsideFile, null);
  });

  test('workspace path matching - should be exact prefix match', async () => {
    const moduleProvider = (path) => true;
    const importResolver = Build.createImportResolver(moduleProvider);
    
    // Workspace: '/app'
    // File that starts with workspace path but isn't inside it: '/application/file.mjs'
    const workspace = '/app';
    const module = Build.createModuleFromSource('export const x = 1;', '/app/index.mjs', workspace, importResolver);
    
    const workspaceModulesMap = new Map([
      [workspace, new Map([['/app/index.mjs', module]])]
    ]);
    
    const store = Repo.init(workspaceModulesMap);

    // Should find file inside workspace
    const found = Repo.findModule(store, '/app/index.mjs');
    assert.ok(found);

    // Should NOT find file that starts with workspace path but isn't inside it
    const notFound = Repo.findModule(store, '/application/file.mjs');
    assert.equal(notFound, null);
  });
});
