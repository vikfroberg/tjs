import {
  createConnection,
  TextDocuments,
  ProposedFeatures,
} from "vscode-languageserver/node.js";
import { TextDocument } from "vscode-languageserver-textdocument";
import * as Build from "./build.mjs";
import * as Result from "../result.mjs";

export function createLanguageServer(options = {}) {
  const {
    buildFunctions = Build.realBuildFunctions,
    connection = createConnection(ProposedFeatures.all),
    documents = new TextDocuments(TextDocument)
  } = options;

  let workspaceFolders = new Set();

  let recompileAndSendDiagnostics = (workspaceFolder) => {
    let dir = workspaceFolder.replace("file://", "");
    connection.console.log(`Compiling ${dir}`);
    try {
      let modules = buildFunctions.buildModulesFromDir(dir);
      
      // Clear diagnostics for all files first
      for (const [filePath] of modules) {
        connection.sendDiagnostics({
          uri: `file://${filePath}`,
          diagnostics: []
        });
      }
      
      Result.cata(
        Build.processModules(modules, dir),
        (ok) => {
          // Success - diagnostics already cleared above
        },
        (error) => {
          if (error.type === 'namecheck') {
            const { error: namecheckError, module } = error;
            const diagnostics = [{
              severity: 1, // Error
              range: {
                start: {
                  line: namecheckError.node.loc.start.line - 1,
                  character: namecheckError.node.loc.start.column
                },
                end: {
                  line: namecheckError.node.loc.end.line - 1,
                  character: namecheckError.node.loc.end.column
                }
              },
              message: formatErrorAsPlainText(namecheckError, module),
              source: 'tjs-namecheck'
            }];

            connection.sendDiagnostics({
              uri: `file://${module.absoluteFilePath}`,
              diagnostics
            });
          } else if (error.type === 'typecheck') {
            const { error: typecheckError, module } = error;
            const diagnostics = [{
              severity: 1, // Error
              range: {
                start: {
                  line: typecheckError.node.loc.start.line - 1,
                  character: typecheckError.node.loc.start.column
                },
                end: {
                  line: typecheckError.node.loc.end.line - 1,
                  character: typecheckError.node.loc.end.column
                }
              },
              message: formatErrorAsPlainText(typecheckError, module),
              source: 'tjs-typecheck'
            }];

            connection.sendDiagnostics({
              uri: `file://${module.absoluteFilePath}`,
              diagnostics
            });
          } else {
            // Handle unrecognized error types - show as generic diagnostic
            connection.console.log(`Unhandled error type: ${error.type}`);
            // For now, just log - we could send a generic diagnostic to the first file if needed
          }
        }
      );
    } catch (startupError) {
      connection.console.log(`Error during workspace compilation: ${startupError.message}`);
      
      // Try to extract file path and position from syntax error and send diagnostic
      const syntaxErrorMatch = startupError.message.match(/(\[(\d+):(\d+)-(\d+):(\d+)\]): (.+)/);
      if (syntaxErrorMatch && startupError.stack) {
        // Extract error position
        const [, , startLine, startCol, endLine, endCol, errorMsg] = syntaxErrorMatch;
        
        // Try to find which file caused the error from the stack trace
        const fileMatch = startupError.stack.match(/file:\/\/([^:]+\.m?js)/);
        if (fileMatch) {
          const filePath = fileMatch[1];
          const diagnostics = [{
            severity: 1, // Error
            range: {
              start: { line: parseInt(startLine) - 1, character: parseInt(startCol) },
              end: { line: parseInt(endLine) - 1, character: parseInt(endCol) }
            },
            message: `Syntax Error: ${errorMsg}`,
            source: 'tjs-parser'
          }];

          connection.sendDiagnostics({
            uri: `file://${filePath}`,
            diagnostics
          });
        }
      }
    }
  };

  // Helper function to format namecheck and typecheck errors as plain text
  let formatErrorAsPlainText = (error, module) => {
    switch (error.type) {
      // Namecheck errors
      case "UndefinedVariableError":
        let suggestions = error.context.suggestions.length > 0
          ? `\n\nDid you mean: ${error.context.suggestions.slice(0, 3).join(', ')}`
          : '';
        return `Undefined variable: '${error.context.name}'\n\nTried to reference a variable that doesn't exist.${suggestions}`;

      case "DuplicateDeclarationError":
        return `Duplicate declaration: '${error.context.name}'\n\nVariable was already declared at line ${error.context.node2.loc.start.line}.`;

      case "NameNotExportedError":
        let exports = error.context.availableExports.length > 0
          ? `\n\nAvailable exports: ${error.context.availableExports.join(', ')}`
          : '';
        return `Import error: Variable not exported from module\n\nModule: ${error.context.importNode.resolvedModulePath}${exports}`;

      case "UnsupportedError":
        return `Unsupported feature\n\nThis language feature is not currently supported by TJS.`;

      // Typecheck errors
      case "binaryExpressionMismatch":
        return `Type mismatch in binary expression\n\nExpected compatible types for '${error.node.operator}' operator.`;

      case "binaryExpressionUnsupportedType":
        return `Unsupported type in binary expression\n\nOperator '${error.node.operator}' cannot be applied to this type.`;

      case "unaryExpressionUnsupportedType":
        return `Unsupported type in unary expression\n\nOperator '${error.node.operator}' cannot be applied to this type.`;

      case "arityMismatch":
        return `Function call arity mismatch\n\nFunction expects different number of arguments.`;

      case "paramMismatch":
        return `Parameter type mismatch\n\nArgument type doesn't match expected parameter type.`;

      case "unsupported":
        return `Unsupported feature\n\nThis language feature is not currently supported by the type checker.`;

      case "unexpectedError":
        return `Unexpected error during type checking\n\nError: ${error.context.originalError}`;

      default:
        return `Unknown error type: ${error.type}\n\nUnrecognized error type encountered.\n\n${JSON.stringify(error, null, 2)}`;
    }
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
    for (const folder of workspaceFolders) {
      recompileAndSendDiagnostics(folder);
    }
  });

  documents.onDidOpen((event) => {
    // @todo: Only recompile relevant workspace folder for the opened document
    for (const folder of workspaceFolders) {
      recompileAndSendDiagnostics(folder);
    }
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
    connection.console.log(`Document text length: ${text.length}`);
    connection.console.log(`Workspace folders: ${Array.from(workspaceFolders).join(', ')}`);

    // @todo: Only recompile relevant workspace folder for the opened document
    for (const folder of workspaceFolders) {
      connection.console.log(`Processing folder: ${folder}`);
      recompileAndSendDiagnosticsWithInMemoryContent(folder);
    }
  });

  // Version that uses in-memory document content instead of reading from disk
  let recompileAndSendDiagnosticsWithInMemoryContent = (workspaceFolder) => {
    let dir = workspaceFolder.replace("file://", "");
    connection.console.log(`Compiling ${dir} with in-memory content`);
    
    // Get modules from disk first
    let modules = buildFunctions.buildModulesFromDir(dir);
    
    // Override with in-memory content for any open documents
    for (const [filePath, module] of modules) {
      const uri = `file://${filePath}`;
      const document = documents.get(uri);
      if (document) {
        const inMemorySource = document.getText();
        try {
          // Re-create the module with in-memory content
          const importResolver = Build.createImportResolver((path) => modules.has(path));
          const updatedModule = Build.createModuleFromSource(inMemorySource, filePath, dir, importResolver);
          modules.set(filePath, updatedModule);
        } catch (parseError) {
          // Parse error - skip this module, clear its diagnostics, and continue
          connection.console.log(`Parse error in ${filePath}: ${parseError.message}`);
          connection.sendDiagnostics({
            uri: `file://${filePath}`,
            diagnostics: []
          });
          // Remove this module from processing since it can't be parsed
          modules.delete(filePath);
        }
      }
    }
    
    // Clear diagnostics for all files first
    for (const [filePath] of modules) {
      connection.sendDiagnostics({
        uri: `file://${filePath}`,
        diagnostics: []
      });
    }
    
    try {
      Result.cata(
        Build.processModules(modules, dir),
        (ok) => {
          // Success - diagnostics already cleared above
        },
        (error) => {
          if (error.type === 'namecheck') {
            const { error: namecheckError, module } = error;
            const diagnostics = [{
              severity: 1, // Error
              range: {
                start: {
                  line: namecheckError.node.loc.start.line - 1,
                  character: namecheckError.node.loc.start.column
                },
                end: {
                  line: namecheckError.node.loc.end.line - 1,
                  character: namecheckError.node.loc.end.column
                }
              },
              message: formatErrorAsPlainText(namecheckError, module),
              source: 'tjs-namecheck'
            }];

            connection.sendDiagnostics({
              uri: `file://${module.absoluteFilePath}`,
              diagnostics
            });
          } else if (error.type === 'typecheck') {
            const { error: typecheckError, module } = error;
            const diagnostics = [{
              severity: 1, // Error
              range: {
                start: {
                  line: typecheckError.node.loc.start.line - 1,
                  character: typecheckError.node.loc.start.column
                },
                end: {
                  line: typecheckError.node.loc.end.line - 1,
                  character: typecheckError.node.loc.end.column
                }
              },
              message: formatErrorAsPlainText(typecheckError, module),
              source: 'tjs-typecheck'
            }];

            connection.sendDiagnostics({
              uri: `file://${module.absoluteFilePath}`,
              diagnostics
            });
          } else {
            // Handle unrecognized error types - show as generic diagnostic
            connection.console.log(`Unhandled error type: ${error.type}`);
          }
        }
      );
    } catch (processingError) {
      connection.console.log(`Error during module processing: ${processingError.message}`);
      connection.console.log(`Stack trace: ${processingError.stack}`);
      // Don't crash the server, just log the error
    }
  };

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
    listen: () => connection.listen()
  };
}
