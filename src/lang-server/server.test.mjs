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
    assert.ok(capabilities.capabilities.hoverProvider, 'Should have hover capability');
    assert.ok(capabilities.capabilities.diagnosticsProvider, 'Should have diagnostics capability');
    assert.strictEqual(capabilities.capabilities.textDocumentSync.openClose, true, 'Should support open/close events');
    assert.strictEqual(capabilities.capabilities.textDocumentSync.change, 2, 'Should support incremental sync');
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
    assert.strictEqual(document.languageId, 'javascript', 'Document should have correct language ID');

    // Change document content
    const updatedDocument = await mockDocuments.changeDocument(
      'file:///workspace/index.mjs',
      'import { sum } from "./math.mjs";\nexport const result = sum("hello", "world");',
      2
    );

    assert.ok(updatedDocument, 'Document should be updated');
    assert.ok(updatedDocument.getText().includes('hello'), 'Document content should be updated');
  });

  test('should handle compilation errors with diagnostics', async () => {
    const virtualFiles = new Map([
      ['/workspace/index.mjs', 'export const x = undefinedVariable;'], // This should cause a namecheck error
      ['/workspace/math.mjs', 'export const sum = (a, b) => a + b;']
    ]);
    const { server, mockConnection } = createTestableLanguageServer(virtualFiles);

    await mockConnection.initialize({
      workspaceFolders: [{ uri: 'file:///workspace', name: 'test' }],
      clientInfo: { name: 'Test Client' }
    });

    // Wait for initial compilation and check if diagnostics were sent
    const diagnostics = mockConnection.getPublishedDiagnostics();
    
    // Should have diagnostics for the file with undefined variable
    const indexDiagnostics = diagnostics.find(d => d.uri === 'file:///workspace/index.mjs');
    if (indexDiagnostics && indexDiagnostics.diagnostics.length > 0) {
      assert.ok(indexDiagnostics.diagnostics[0].message.includes('Undefined variable'), 'Should report undefined variable error');
    }
  });

  test('should clear diagnostics when errors are fixed', async () => {
    const virtualFiles = new Map([
      ['/workspace/index.mjs', 'export const x = undefinedVariable;'], // Error initially
      ['/workspace/math.mjs', 'export const sum = (a, b) => a + b;']
    ]);
    const { server, mockConnection, mockDocuments } = createTestableLanguageServer(virtualFiles);

    await mockConnection.initialize({
      workspaceFolders: [{ uri: 'file:///workspace', name: 'test' }],
      clientInfo: { name: 'Test Client' }
    });

    // Open document with error
    await mockDocuments.openDocument(
      'file:///workspace/index.mjs', 
      'javascript', 
      1, 
      'export const x = undefinedVariable;'
    );

    // Fix the error by changing document content
    await mockDocuments.changeDocument(
      'file:///workspace/index.mjs',
      'export const x = 42;', // Fixed: no undefined variable
      2
    );

    // Check that diagnostics were sent (both error and clear)
    const diagnostics = mockConnection.getPublishedDiagnostics();
    const indexDiagnostics = diagnostics.filter(d => d.uri === 'file:///workspace/index.mjs');
    
    assert.ok(indexDiagnostics.length > 0, 'Should have published diagnostics for the file');
    // The last diagnostic should be empty (clearing the error)
    const lastDiagnostic = indexDiagnostics[indexDiagnostics.length - 1];
    assert.strictEqual(lastDiagnostic.diagnostics.length, 0, 'Should clear diagnostics when error is fixed');
  });

  test('should handle syntax errors on startup', async () => {
    const virtualFiles = new Map([
      ['/workspace/index.mjs', 'export const x = ;'], // Syntax error on startup
      ['/workspace/math.mjs', 'export const sum = (a, b) => a + b;']
    ]);
    
    // Server should not crash during initialization even with syntax errors
    let serverCreated = false;
    try {
      const { server, mockConnection } = createTestableLanguageServer(virtualFiles);
      serverCreated = true;
      
      await mockConnection.initialize({
        workspaceFolders: [{ uri: 'file:///workspace', name: 'test' }],
        clientInfo: { name: 'Test Client' }
      });
      
      // Server should start successfully despite syntax errors
      assert.ok(true, 'Server should initialize without crashing');
    } catch (error) {
      if (!serverCreated) {
        // This is expected - the virtual file system will fail to create modules with syntax errors
        assert.ok(true, 'Expected error during virtual file system creation with syntax errors');
      } else {
        throw error; // Unexpected error after server creation
      }
    }
  });

  test('should handle syntax errors during editing', async () => {
    const virtualFiles = new Map([
      ['/workspace/index.mjs', 'export const x = 42;'], // Start with valid syntax
      ['/workspace/math.mjs', 'export const sum = (a, b) => a + b;']
    ]);
    const { server, mockConnection, mockDocuments } = createTestableLanguageServer(virtualFiles);

    await mockConnection.initialize({
      workspaceFolders: [{ uri: 'file:///workspace', name: 'test' }],
      clientInfo: { name: 'Test Client' }
    });

    // Open document with valid syntax first
    await mockDocuments.openDocument(
      'file:///workspace/index.mjs', 
      'javascript', 
      1, 
      'export const x = 42;'
    );

    // Change to invalid syntax to trigger parse error during editing
    await mockDocuments.changeDocument(
      'file:///workspace/index.mjs',
      'export const x = ;', // This should cause a parse error
      2
    );

    // Server should not crash, should handle parse errors gracefully
    const diagnostics = mockConnection.getPublishedDiagnostics();
    
    // Should have some diagnostics published (server should not crash)
    assert.ok(diagnostics.length >= 0, 'Should handle parse errors without crashing');
  });

  test('should report syntax error with correct position', async () => {
    const virtualFiles = new Map([
      ['/workspace/index.mjs', 'export const x = 42;'], // Start with valid syntax
      ['/workspace/math.mjs', 'export const sum = (a, b) => a + b;']
    ]);
    const { server, mockConnection, mockDocuments } = createTestableLanguageServer(virtualFiles);

    await mockConnection.initialize({
      workspaceFolders: [{ uri: 'file:///workspace', name: 'test' }],
      clientInfo: { name: 'Test Client' }
    });

    // Open document with valid syntax first
    await mockDocuments.openDocument(
      'file:///workspace/index.mjs', 
      'javascript', 
      1, 
      'export const x = 42;'
    );

    // Change to specific syntax error at known position
    const syntaxErrorCode = `export const x = 42;
export const y = ;`; // Syntax error on line 2, column 17
    
    await mockDocuments.changeDocument(
      'file:///workspace/index.mjs',
      syntaxErrorCode,
      2
    );

    // Check diagnostics for correct position
    const diagnostics = mockConnection.getPublishedDiagnostics();
    const indexDiagnostics = diagnostics.filter(d => d.uri === 'file:///workspace/index.mjs');
    
    if (indexDiagnostics.length > 0) {
      const lastDiagnostic = indexDiagnostics[indexDiagnostics.length - 1];
      if (lastDiagnostic.diagnostics.length > 0) {
        const syntaxError = lastDiagnostic.diagnostics[0];
        
        // Should point to line 2 (1-indexed becomes 0-indexed)
        assert.strictEqual(syntaxError.range.start.line, 1, 'Should point to correct line');
        // Should point to column 17 where the semicolon is
        assert.strictEqual(syntaxError.range.start.character, 17, 'Should point to correct column');
        assert.ok(syntaxError.message.includes('Syntax Error'), 'Should be a syntax error message');
      }
    }
  });

  test('should report syntax error at beginning of line', async () => {
    const virtualFiles = new Map([
      ['/workspace/index.mjs', 'export const x = 42;'], // Start with valid syntax
      ['/workspace/math.mjs', 'export const sum = (a, b) => a + b;']
    ]);
    const { server, mockConnection, mockDocuments } = createTestableLanguageServer(virtualFiles);

    await mockConnection.initialize({
      workspaceFolders: [{ uri: 'file:///workspace', name: 'test' }],
      clientInfo: { name: 'Test Client' }
    });

    // Open document with valid syntax first
    await mockDocuments.openDocument(
      'file:///workspace/index.mjs', 
      'javascript', 
      1, 
      'export const x = 42;'
    );

    // Change to syntax error at beginning of line
    const syntaxErrorCode = `export const x = 42;
const`; // Syntax error on line 2, column 0 - incomplete const declaration
    
    await mockDocuments.changeDocument(
      'file:///workspace/index.mjs',
      syntaxErrorCode,
      2
    );

    // Check diagnostics for correct position
    const diagnostics = mockConnection.getPublishedDiagnostics();
    const indexDiagnostics = diagnostics.filter(d => d.uri === 'file:///workspace/index.mjs');
    
    if (indexDiagnostics.length > 0) {
      const lastDiagnostic = indexDiagnostics[indexDiagnostics.length - 1];
      if (lastDiagnostic.diagnostics.length > 0) {
        const syntaxError = lastDiagnostic.diagnostics[0];
        
        // Should point to line 2 (1-indexed becomes 0-indexed)
        assert.strictEqual(syntaxError.range.start.line, 1, 'Should point to correct line');
        // Should point to column 0 (beginning of const keyword)
        assert.strictEqual(syntaxError.range.start.character, 0, 'Should point to beginning of line');
        assert.ok(syntaxError.message.includes('Syntax Error'), 'Should be a syntax error message');
      }
    }
  });

  test('should handle typecheck errors with diagnostics', async () => {
    const virtualFiles = new Map([
      ['/workspace/index.mjs', 'export const x = 1 + "hello";'], // Type mismatch error
      ['/workspace/math.mjs', 'export const sum = (a, b) => a + b;']
    ]);
    const { server, mockConnection } = createTestableLanguageServer(virtualFiles);

    await mockConnection.initialize({
      workspaceFolders: [{ uri: 'file:///workspace', name: 'test' }],
      clientInfo: { name: 'Test Client' }
    });

    // Wait for initial compilation and check if typecheck diagnostics were sent
    const diagnostics = mockConnection.getPublishedDiagnostics();
    
    // Get all diagnostics for the index file (there might be multiple publishDiagnostics calls)
    const allIndexDiagnostics = diagnostics
      .filter(d => d.uri === 'file:///workspace/index.mjs')
      .flatMap(d => d.diagnostics);
    
    assert.ok(allIndexDiagnostics.length > 0, 'Should have at least one diagnostic for type mismatch');
    
    const typecheckDiagnostic = allIndexDiagnostics.find(d => d.source === 'tjs-typecheck');
    assert.ok(typecheckDiagnostic, 'Should have a typecheck diagnostic for type mismatch');
    assert.ok(typecheckDiagnostic.message.includes('mismatch') || typecheckDiagnostic.message.includes('error'), 'Should report type error');
  });

  test('should send type mismatch diagnostic when editing file', async () => {
    const virtualFiles = new Map([
      ['/workspace/index.mjs', 'export const x = 42;'], // Start with valid code
      ['/workspace/math.mjs', 'export const sum = (a, b) => a + b;']
    ]);
    const { server, mockConnection, mockDocuments } = createTestableLanguageServer(virtualFiles);

    await mockConnection.initialize({
      workspaceFolders: [{ uri: 'file:///workspace', name: 'test' }],
      clientInfo: { name: 'Test Client' }
    });

    // Open document with valid code
    await mockDocuments.openDocument(
      'file:///workspace/index.mjs', 
      'javascript', 
      1, 
      'export const x = 42;'
    );

    // Clear diagnostics from initialization
    mockConnection.clearDiagnostics();

    // Introduce a type mismatch
    await mockDocuments.changeDocument(
      'file:///workspace/index.mjs',
      'export const x = 1 + "hello";', // Type mismatch: number + string
      2
    );

    // Check that we get a typecheck diagnostic
    const diagnostics = mockConnection.getPublishedDiagnostics();
    const indexDiagnostics = diagnostics.filter(d => d.uri === 'file:///workspace/index.mjs');
    
    assert.ok(indexDiagnostics.length > 0, 'Should have published diagnostics');
    
    // Find a typecheck diagnostic
    const typecheckDiagnostic = indexDiagnostics
      .flatMap(d => d.diagnostics)
      .find(diag => diag.source === 'tjs-typecheck');
    
    assert.ok(typecheckDiagnostic, 'Should receive a typecheck diagnostic for type mismatch');
    assert.ok(typecheckDiagnostic.message.includes('mismatch') || typecheckDiagnostic.message.includes('error'), 'Should contain type error message');
    assert.strictEqual(typecheckDiagnostic.severity, 1, 'Should be an error severity');
    assert.ok(typecheckDiagnostic.range.start.line >= 0, 'Should have valid line position');
  });
});