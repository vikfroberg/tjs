export class MockConnection {
  constructor() {
    this.handlers = {};
    this.diagnostics = new Map(); // uri -> diagnostics[]
    this.console = {
      log: (...args) => {
        if (this.logOutput) {
          console.log('[LSP Server]', ...args);
        }
      }
    };
    this.logOutput = false; // Set to true to see server logs during tests
  }

  // Handler registration methods (used by language server)
  onInitialize(handler) {
    this.handlers.initialize = handler;
  }

  onInitialized(handler) {
    this.handlers.initialized = handler;
  }

  onShutdown(handler) {
    this.handlers.shutdown = handler;
  }

  onHover(handler) {
    this.handlers.hover = handler;
  }

  onDefinition(handler) {
    this.handlers.definition = handler;
  }

  // Mock methods for testing (called by test code)
  async initialize(params) {
    if (this.handlers.initialize) {
      const result = await this.handlers.initialize(params);
      if (this.handlers.initialized) {
        await this.handlers.initialized();
      }
      return result;
    }
    throw new Error('No initialize handler registered');
  }

  async hover(params) {
    if (this.handlers.hover) {
      return await this.handlers.hover(params);
    }
    return null;
  }

  async definition(params) {
    if (this.handlers.definition) {
      return await this.handlers.definition(params);
    }
    return null;
  }

  async shutdown() {
    if (this.handlers.shutdown) {
      return await this.handlers.shutdown();
    }
  }

  // Diagnostic handling
  sendDiagnostics({ uri, diagnostics }) {
    this.diagnostics.set(uri, diagnostics);
    // Also track all published diagnostics for testing
    if (!this.publishedDiagnostics) {
      this.publishedDiagnostics = [];
    }
    this.publishedDiagnostics.push({ uri, diagnostics });
  }

  getDiagnostics(uri) {
    return this.diagnostics.get(uri) || [];
  }

  getPublishedDiagnostics() {
    return this.publishedDiagnostics || [];
  }

  clearDiagnostics() {
    this.diagnostics.clear();
    this.publishedDiagnostics = [];
  }

  // Test helpers
  enableLogging() {
    this.logOutput = true;
  }

  disableLogging() {
    this.logOutput = false;
  }

  // Required by vscode-languageserver but not used in tests
  listen() {
    // Do nothing in mock - tests control execution
  }
}