export class MockTextDocuments {
  constructor() {
    this.documents = new Map(); // uri -> document
    this.handlers = {};
  }

  // Handler registration
  onDidOpen(handler) {
    this.handlers.didOpen = handler;
  }

  onDidClose(handler) {
    this.handlers.didClose = handler;
  }

  onDidChangeContent(handler) {
    this.handlers.didChangeContent = handler;
  }

  // Mock document operations (called by tests)
  async openDocument(uri, languageId, version, text) {
    const document = new MockTextDocument(uri, languageId, version, text);
    this.documents.set(uri, document);
    
    if (this.handlers.didOpen) {
      await this.handlers.didOpen({ document });
    }
    
    return document;
  }

  async changeDocument(uri, newText, newVersion) {
    const document = this.documents.get(uri);
    if (!document) {
      throw new Error(`Document ${uri} not found`);
    }
    
    document._content = newText;
    document._version = newVersion;
    
    if (this.handlers.didChangeContent) {
      await this.handlers.didChangeContent({ document });
    }
    
    return document;
  }

  async closeDocument(uri) {
    const document = this.documents.get(uri);
    if (document && this.handlers.didClose) {
      await this.handlers.didClose({ document });
    }
    this.documents.delete(uri);
  }

  get(uri) {
    return this.documents.get(uri);
  }

  // Required by vscode-languageserver
  listen(connection) {
    // Mock - do nothing
  }
}

class MockTextDocument {
  constructor(uri, languageId, version, content) {
    this._uri = uri;
    this._languageId = languageId;
    this._version = version;
    this._content = content;
  }

  get uri() { return this._uri; }
  get languageId() { return this._languageId; }
  get version() { return this._version; }
  
  getText() {
    return this._content;
  }
}