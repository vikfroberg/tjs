#!/usr/bin/env node

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Path to the language server
const langServerPath = join(__dirname, 'lang-server');

console.log('Starting TJS Language Server test...');
console.log(`Language server path: ${langServerPath}`);

// Start the language server process with --stdio flag
const langServer = spawn('node', [langServerPath, '--stdio'], {
  stdio: ['pipe', 'pipe', 'pipe'],
  cwd: __dirname
});

let messageId = 1;

// Helper function to send LSP messages
function sendMessage(method, params = {}) {
  const message = {
    jsonrpc: '2.0',
    id: messageId++,
    method,
    params
  };

  const content = JSON.stringify(message);
  const header = `Content-Length: ${Buffer.byteLength(content, 'utf8')}\r\n\r\n`;
  const fullMessage = header + content;

  console.log(`\n📤 Sending ${method}:`);
  console.log(JSON.stringify(message, null, 2));

  langServer.stdin.write(fullMessage);
}

// Helper function to send notifications (no ID)
function sendNotification(method, params = {}) {
  const message = {
    jsonrpc: '2.0',
    method,
    params
  };

  const content = JSON.stringify(message);
  const header = `Content-Length: ${Buffer.byteLength(content, 'utf8')}\r\n\r\n`;
  const fullMessage = header + content;

  console.log(`\n📤 Sending notification ${method}:`);
  console.log(JSON.stringify(message, null, 2));

  langServer.stdin.write(fullMessage);
}

// Buffer to collect response data
let responseBuffer = '';

// Handle responses from language server
langServer.stdout.on('data', (data) => {
  responseBuffer += data.toString();
  
  // Process complete messages
  let headerEnd;
  while ((headerEnd = responseBuffer.indexOf('\r\n\r\n')) !== -1) {
    const headerPart = responseBuffer.slice(0, headerEnd);
    const contentLengthMatch = headerPart.match(/Content-Length: (\d+)/);
    
    if (!contentLengthMatch) {
      console.error('❌ Invalid message format');
      break;
    }
    
    const contentLength = parseInt(contentLengthMatch[1]);
    const messageStart = headerEnd + 4;
    
    if (responseBuffer.length >= messageStart + contentLength) {
      const messageContent = responseBuffer.slice(messageStart, messageStart + contentLength);
      responseBuffer = responseBuffer.slice(messageStart + contentLength);
      
      try {
        const message = JSON.parse(messageContent);
        console.log(`\n📥 Received response:`);
        console.log(JSON.stringify(message, null, 2));
      } catch (error) {
        console.error('❌ Failed to parse message:', error);
        console.log('Raw content:', messageContent);
      }
    } else {
      break; // Not enough data yet
    }
  }
});

// Handle errors
langServer.stderr.on('data', (data) => {
  console.log(`\n🐛 Language server stderr:\n${data}`);
});

langServer.on('close', (code) => {
  console.log(`\n🏁 Language server process exited with code ${code}`);
  process.exit(code);
});

langServer.on('error', (error) => {
  console.error(`\n❌ Failed to start language server: ${error}`);
  process.exit(1);
});

// Test sequence
setTimeout(() => {
  console.log('\n🚀 Starting test sequence...');

  // 1. Send initialize request
  sendMessage('initialize', {
    processId: process.pid,
    rootUri: `file://${join(__dirname, 'example')}`,
    capabilities: {
      textDocument: {
        synchronization: {
          didSave: true
        }
      },
      workspace: {
        workspaceFolders: true
      }
    },
    workspaceFolders: [
      {
        uri: `file://${join(__dirname, 'example')}`,
        name: 'example'
      }
    ],
    clientInfo: {
      name: 'TJS Test Client',
      version: '1.0.0'
    }
  });

  // 2. Send initialized notification
  setTimeout(() => {
    sendNotification('initialized', {});
  }, 500);

  // 3. Open a document
  setTimeout(() => {
    sendNotification('textDocument/didOpen', {
      textDocument: {
        uri: `file://${join(__dirname, 'example', 'index.mjs')}`,
        languageId: 'javascript',
        version: 1,
        text: 'import { sum } from "./math.mjs";\n\nexport let name = "Viktor";\n\nexport default sum;\n'
      }
    });
  }, 1000);

  // 4. Change document content
  setTimeout(() => {
    sendNotification('textDocument/didChange', {
      textDocument: {
        uri: `file://${join(__dirname, 'example', 'index.mjs')}`,
        version: 2
      },
      contentChanges: [
        {
          text: 'import { sum } from "./math.mjs";\n\nexport let name = "Updated Viktor";\n\nexport default sum;\n'
        }
      ]
    });
  }, 1500);

  // 5. Close document and shutdown
  setTimeout(() => {
    sendNotification('textDocument/didClose', {
      textDocument: {
        uri: `file://${join(__dirname, 'example', 'index.mjs')}`
      }
    });
    
    setTimeout(() => {
      sendMessage('shutdown', {});
      
      setTimeout(() => {
        sendNotification('exit', {});
      }, 200);
    }, 200);
  }, 2000);

}, 100);

// Graceful shutdown on Ctrl+C
process.on('SIGINT', () => {
  console.log('\n🛑 Terminating language server...');
  langServer.kill('SIGTERM');
  setTimeout(() => {
    langServer.kill('SIGKILL');
    process.exit(1);
  }, 2000);
});