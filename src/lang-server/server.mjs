import {
  createConnection,
  TextDocuments,
  ProposedFeatures,
} from "vscode-languageserver/node.js";
import { TextDocument } from "vscode-languageserver-textdocument";
import { realBuildFunctions } from "./build.mjs";
import * as Repo from "./repo.mjs";

export function createLanguageServer(options = {}) {
  const {
    buildFunctions = realBuildFunctions,
    connection = createConnection(ProposedFeatures.all),
    documents = new TextDocuments(TextDocument)
  } = options;

  let repo = Repo.init(new Map());

  // Initialize server capabilities
  connection.onInitialize((params) => {
    connection.console.log("=== TJS Language Server Starting ===");
    connection.console.log(`Client: ${params.clientInfo?.name || "Unknown"}`);
    connection.console.log(`Process ID: ${params.processId}`);
    connection.console.log(`Root URI: ${params.rootUri}`);
    connection.console.log(`PARAMS: ${JSON.stringify(params, null, 2)}`);

    const workspaceFolders = params.workspaceFolders || [];
    const workspaceModulesMap = new Map();
    
    for (const folder of workspaceFolders) {
      // Convert file:// URI to local path
      const workspaceDir = folder.uri.replace('file://', '');
      connection.console.log(`Building modules for workspace: ${workspaceDir}`);
      
      try {
        // Use injected build function instead of direct Build.buildModulesFromDir
        const modules = buildFunctions.buildModulesFromDir(workspaceDir);
        workspaceModulesMap.set(workspaceDir, modules);
        connection.console.log(`Found ${modules.size} modules in ${workspaceDir}`);
      } catch (error) {
        connection.console.log(`Error building modules for ${workspaceDir}: ${error.message}`);
      }
    }
    
    repo = Repo.init(workspaceModulesMap);
    connection.console.log(`Initialized repo with ${workspaceModulesMap.size} workspaces`);

    return {
      capabilities: {
        textDocumentSync: {
          openClose: true,
          change: 2, // Incremental sync
        },
        // hoverProvider: true,
        // definitionProvider: true,
        // diagnosticsProvider: true
      },
    };
  });

  connection.onInitialized(() => {
    connection.console.log("Server initialized and ready!");
  });

  documents.onDidOpen((event) => {
    connection.console.log(`Document opened: ${event.document.uri}`);
  });

  documents.onDidClose((event) => {
    connection.console.log(`Document closed: ${event.document.uri}`);
  });

  connection.onShutdown(() => {
    connection.console.log("Server shutting down...");
  });

  // Handle document changes and run typechecker
  documents.onDidChangeContent(async (change) => {
    const document = change.document;
    const text = document.getText();

    connection.console.log("=> onDidChangeContent");
    connection.console.log(`Document URI: ${document.uri}`);
    
    // Convert file:// URI to local path
    const filePath = document.uri.replace('file://', '');
    const foundModule = Repo.findModule(repo, filePath);
    
    if (foundModule) {
      connection.console.log(`Found module: ${foundModule.absoluteFilePath}`);
      // TODO: Update module with new content using Repo.updateModule
      const updatedModule = Repo.updateModule(repo, filePath, text);
      if (updatedModule) {
        connection.console.log(`Updated module successfully`);
      }
    } else {
      connection.console.log(`Module not found for: ${filePath}`);
    }
    
    connection.console.log("END onDidChangeContent");

    // try {
    //     // Use your typechecker here
    //     const result = await typeChecker.check(text, document.uri);

    //     // Convert your typechecker errors to LSP diagnostics
    //     const diagnostics = result.errors.map(error => ({
    //         severity: error.severity === 'error' ? 1 : 2, // Error or Warning
    //         range: {
    //             start: { line: error.line - 1, character: error.column - 1 },
    //             end: { line: error.endLine - 1, character: error.endColumn - 1 }
    //         },
    //         message: error.message,
    //         source: 'my-typechecker'
    //     }));

    //     connection.sendDiagnostics({ uri: document.uri, diagnostics });
    // } catch (error) {
    //     console.error('Typechecker error:', error);
    // }
  });

  // Provide hover information
  // connection.onHover(async (params) => {
  //   const document = documents.get(params.textDocument.uri);
  //   if (!document) return null;

  //   const position = params.position;
  //   const text = document.getText();

  //   const hoverInfo = {
  //     type: `Hello World!`,
  //     documentation: "Greetings from TJS language server :)",
  //   };

  //   if (hoverInfo) {
  //     return {
  //       contents: {
  //         kind: "markdown",
  //         value: `**${hoverInfo.type}**\n\n${hoverInfo.documentation || ""}`,
  //       },
  //     };
  //   }

  //   return null;
  // });

  // Connect documents to the connection
  documents.listen(connection);
  
  return {
    connection,
    documents,
    repo: () => repo, // Getter for testing
    listen: () => connection.listen()
  };
}