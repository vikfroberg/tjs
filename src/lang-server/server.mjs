import {
  createConnection,
  TextDocuments,
  ProposedFeatures,
} from "vscode-languageserver/node.js";
import { TextDocument } from "vscode-languageserver-textdocument";
import * as Build from "./build.mjs";
import * as Repo from "./repo.mjs";
import * as Result from "../result.mjs";

export function createLanguageServer(options = {}) {
  const {
    buildFunctions = Build.realBuildFunctions,
    connection = createConnection(ProposedFeatures.all),
    documents = new TextDocuments(TextDocument)
  } = options;

  // let repo = Repo.init(new Map());
  let workspaceFolders = new Set();

  let recompileAndSendDiagnostics = (workspaceFolder) => {
    let dir = workspaceFolder.replace("file://", "");
    connection.console.log(`Compiling ${dir}`);
    let modules = buildFunctions.buildModulesFromDir(dir);
    Result.cata(
      Build.processModules(modules, dir),
      (ok) => {},
      (error) => {
        connection.console.log("COMPILE ERROR:")
        connection.console.log(JSON.stringify(error, null, 2))
        // connection.sendDiagnostics({
        //   uri: error.,
        //   diagnostics: [{

        //   }]
        // });
      }
    );
  };

  // Initialize server capabilities
  connection.onInitialize((params) => {
    connection.console.log("=== TJS Language Server Starting ===");
    connection.console.log(`Client: ${params.clientInfo?.name || "Unknown"}`);
    connection.console.log(`Process ID: ${params.processId}`);
    connection.console.log(`Root URI: ${params.rootUri}`);
    connection.console.log(`PARAMS: ${JSON.stringify(params, null, 2)}`);

    workspaceFolders = new Set(params.workspaceFolders.map(folder => folder.uri) || []);

    return {
      capabilities: {
        textDocumentSync: {
          openClose: true,
          change: 2, // Incremental sync
        },
        hoverProvider: true,
        // definitionProvider: true,
        diagnosticsProvider: true
      },
    };
  });

  connection.onInitialized(() => {
    connection.console.log("Server initialized and ready!");
    for (const folder of workspaceFolders) {
      connection.console.log(`Workspace folder: ${folder}`);
      recompileAndSendDiagnostics(folder);
    }
  });

  documents.onDidOpen((event) => {
    // @todo: Only recompile relevant workspace folder for the opened document
    for (const folder of workspaceFolders) {
      recompileAndSendDiagnostics(folder);
    }


    connection.console.log(`Document opened: ${event.document.uri}`);
    connection.console.log(JSON.stringify(event, null, 2))
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
  connection.onHover(async (params) => {
    connection.console.log("START onHover");
    const document = documents.get(params.textDocument.uri);
    if (!document) return null;

    const position = params.position;
    const text = document.getText();

    const hoverInfo = {
      type: `Hello World!`,
      documentation: "Greetings from TJS language server :)",
    };

    if (hoverInfo) {
      return {
        contents: {
          kind: "markdown",
          value: `**${hoverInfo.type}**\n\n${hoverInfo.documentation || ""}`,
        },
      };
    }

    return null;
  });

  // Connect documents to the connection
  documents.listen(connection);

  return {
    connection,
    documents,
    repo: () => repo, // Getter for testing
    listen: () => connection.listen()
  };
}
