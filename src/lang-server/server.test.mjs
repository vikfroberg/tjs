import { test, describe } from 'node:test';
import assert from 'node:assert';
import { createLanguageServer } from './server.mjs';
import { createVirtualBuildFunctions } from './build.mjs';
import { MockConnection } from './mock/lsp-connection.mjs';
import { MockTextDocuments } from './mock/text-documents.mjs';
import { createWorkspaceFiles } from './mock/virtual-filesystem.mjs';

// Test helper to create a testable language server
function createTestableLanguageServer(virtualFiles) {
  const mockConnection = new MockConnection();
  const mockDocuments = new MockTextDocuments();
  const virtualBuildFunctions = createVirtualBuildFunctions(virtualFiles);

  const server = createLanguageServer({
    buildFunctions: virtualBuildFunctions,
    connection: mockConnection,
    documents: mockDocuments
  });

  return { server, mockConnection, mockDocuments };
}

describe('Language Server', () => {
  test('should initialize with simple workspace', async () => {
    const virtualFiles = createWorkspaceFiles('simple');
    const { server, mockConnection } = createTestableLanguageServer(virtualFiles);

    const initParams = {
      workspaceFolders: [{ uri: 'file:///workspace', name: 'test' }],
      clientInfo: { name: 'Test Client' }
    };

    const capabilities = await mockConnection.initialize(initParams);

    assert.ok(capabilities.capabilities.textDocumentSync, 'Should have textDocumentSync capability');
    assert.strictEqual(server.repo().size, 1, 'Should have 1 workspace in repo');
    
    const workspaceModules = server.repo().get('/workspace');
    assert.ok(workspaceModules, 'Should have modules for workspace');
    assert.strictEqual(workspaceModules.size, 2, 'Should have 2 modules in simple workspace');
  });

  test('should handle document open and change operations', async () => {
    const virtualFiles = createWorkspaceFiles('withImports');
    const { server, mockConnection, mockDocuments } = createTestableLanguageServer(virtualFiles);

    // Initialize server
    await mockConnection.initialize({
      workspaceFolders: [{ uri: 'file:///workspace', name: 'test' }],
      clientInfo: { name: 'Test Client' }
    });

    // Open a document
    const document = await mockDocuments.openDocument(
      'file:///workspace/index.mjs', 
      'javascript', 
      1, 
      'import { sum } from "./math.mjs";\nexport const result = sum(1, 2);'
    );

    assert.strictEqual(document.uri, 'file:///workspace/index.mjs', 'Document should have correct URI');

    // Change document content
    await mockDocuments.changeDocument(
      'file:///workspace/index.mjs',
      'import { sum } from "./math.mjs";\nexport const result = sum("hello", "world");',
      2
    );

    // Verify repo was updated
    const repo = server.repo();
    const workspaceModules = repo.get('/workspace');
    const module = workspaceModules?.get('/workspace/index.mjs');
    
    assert.ok(module, 'Module should exist in repo');
    assert.ok(module.source.includes('hello'), 'Module content should be updated');
  });

  test('should load complex workspace with nested modules', async () => {
    const virtualFiles = createWorkspaceFiles('complex');
    const { server, mockConnection } = createTestableLanguageServer(virtualFiles);

    await mockConnection.initialize({
      workspaceFolders: [{ uri: 'file:///workspace', name: 'test' }],
      clientInfo: { name: 'Test Client' }
    });

    const repo = server.repo();
    const workspaceModules = repo.get('/workspace');
    
    assert.strictEqual(workspaceModules.size, 3, 'Should have 3 modules in complex workspace');
    assert.ok(workspaceModules.has('/workspace/utils/helper.mjs'), 'Should find nested module');
  });

  test('should handle type mismatch scenarios', async () => {
    const virtualFiles = createWorkspaceFiles('withTypeMismatches');
    const { server, mockConnection, mockDocuments } = createTestableLanguageServer(virtualFiles);

    await mockConnection.initialize({
      workspaceFolders: [{ uri: 'file:///workspace', name: 'test' }],
      clientInfo: { name: 'Test Client' }
    });

    // Open document with type mismatches
    await mockDocuments.openDocument(
      'file:///workspace/index.mjs', 
      'javascript', 
      1, 
      'import { sum } from "./math.mjs";\nexport const result = sum("hello", "world");'
    );

    // Verify module was loaded (diagnostic generation not implemented yet)
    const repo = server.repo();
    const workspaceModules = repo.get('/workspace');
    const module = workspaceModules?.get('/workspace/index.mjs');
    
    assert.ok(module, 'Module with type mismatches should be loaded');
    assert.ok(module.source.includes('sum("hello", "world")'), 'Should contain type mismatch code');
  });

  test('should handle missing modules gracefully', async () => {
    const virtualFiles = createWorkspaceFiles('simple');
    const { server, mockConnection, mockDocuments } = createTestableLanguageServer(virtualFiles);

    await mockConnection.initialize({
      workspaceFolders: [{ uri: 'file:///workspace', name: 'test' }],
      clientInfo: { name: 'Test Client' }
    });

    // Try to change a non-existent document
    await mockDocuments.openDocument(
      'file:///workspace/nonexistent.mjs', 
      'javascript', 
      1, 
      'export const test = "hello";'
    );

    // Should not crash - the repo update will handle missing modules
    const repo = server.repo();
    assert.ok(repo, 'Repo should still exist');
  });
});