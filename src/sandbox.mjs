import { readdir, watch } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createInterface } from 'readline';
import { spawn } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function findSandboxes() {
  const sandboxes = [];
  
  async function searchDir(dir, relativePath = '') {
    try {
      const entries = await readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        const relPath = join(relativePath, entry.name);
        
        if (entry.isDirectory()) {
          await searchDir(fullPath, relPath);
        } else if (entry.name.endsWith('_sandbox.mjs')) {
          sandboxes.push({
            name: entry.name.replace('_sandbox.mjs', ''),
            path: fullPath,
            relativePath: relPath
          });
        }
      }
    } catch (error) {
      // Skip directories we can't read
    }
  }
  
  await searchDir(__dirname);
  return sandboxes;
}

function createPrompt() {
  return createInterface({
    input: process.stdin,
    output: process.stdout
  });
}

async function promptSandbox(sandboxes) {
  const rl = createPrompt();
  
  console.log('📦 Available Sandboxes:\n');
  sandboxes.forEach((sandbox, index) => {
    console.log(`  ${index + 1}. ${sandbox.name} (${sandbox.relativePath})`);
  });
  
  return new Promise((resolve) => {
    rl.question('\nSelect a sandbox (number): ', (answer) => {
      rl.close();
      const choice = parseInt(answer.trim()) - 1;
      if (choice >= 0 && choice < sandboxes.length) {
        resolve(sandboxes[choice]);
      } else {
        console.log('Invalid selection');
        process.exit(1);
      }
    });
  });
}

function parseArgs() {
  const watchMode = process.argv.includes('--watch');
  const testMode = process.argv.includes('--test');
  return { watchMode, testMode };
}

async function fzfSelect(items, prompt = 'Select item') {
  return new Promise((resolve, reject) => {
    const fzf = spawn('fzf', [
      '--prompt', `${prompt}> `,
      '--height', '40%',
      '--reverse',
      '--border'
    ], {
      stdio: ['pipe', 'pipe', 'inherit']
    });

    fzf.on('error', (err) => {
      if (err.code === 'ENOENT') {
        console.log('\n❌ fzf not found. Please install fzf: https://github.com/junegunn/fzf');
        console.log('Falling back to simple selection...');
        resolve(null);
      } else {
        reject(err);
      }
    });

    // Send items to fzf
    items.forEach((item, index) => {
      fzf.stdin.write(`${index + 1}. ${item}\n`);
    });
    fzf.stdin.end();

    let output = '';
    fzf.stdout.on('data', (data) => {
      output += data.toString();
    });

    fzf.on('close', (code) => {
      if (code === 0 && output.trim()) {
        // Extract the index from the selected line (format: "1. Error Name")
        const match = output.trim().match(/^(\d+)\./);
        if (match) {
          const index = parseInt(match[1]) - 1;
          resolve(index);
        } else {
          resolve(null);
        }
      } else {
        resolve(null);
      }
    });
  });
}

async function fallbackSelect(items, prompt = 'Select item') {
  const rl = createPrompt();
  
  console.log(`\n📋 ${prompt}:`);
  items.forEach((item, index) => {
    console.log(`  ${index + 1}. ${item}`);
  });
  
  return new Promise((resolve) => {
    rl.question('\nEnter number (or press Enter to cancel): ', (answer) => {
      rl.close();
      const choice = answer.trim();
      if (choice === '') {
        resolve(null);
      } else {
        const index = parseInt(choice) - 1;
        resolve(index >= 0 && index < items.length ? index : null);
      }
    });
  });
}

async function selectError(errorNames) {
  const selectedIndex = await fzfSelect(errorNames, 'Focus on error');
  
  if (selectedIndex === null) {
    // Try fallback if fzf failed
    return await fallbackSelect(errorNames, 'Focus on error');
  }
  
  return selectedIndex;
}

function clearScreen() {
  console.clear();
}

async function runSandboxModule(sandboxPath, errorFocusIndex = null, isWatchMode = false, isInteractive = true) {
  try {
    // Clear module cache to get fresh import
    const moduleUrl = `${sandboxPath}?t=${Date.now()}`;
    const module = await import(moduleUrl);
    
    if (module.runSandbox) {
      if (errorFocusIndex !== null && module.runSandboxWithFocus) {
        module.runSandboxWithFocus(errorFocusIndex);
      } else {
        module.runSandbox();
      }
      
      // Interactive mode (available in both normal and watch mode)
      if (isInteractive && module.getErrorNames && typeof module.getErrorNames === 'function') {
        await handleSlashCommands(sandboxPath, module, isWatchMode);
      } else if (isInteractive) {
        console.log('\n' + '='.repeat(60));
        console.log('Slash commands not available for this sandbox');
      }
    } else {
      console.log('Error: Sandbox file must export a runSandbox() function');
    }
  } catch (error) {
    console.error('Error running sandbox:', error.message);
  }
}

function parseSlashCommand(input) {
  const trimmed = input.trim();
  if (!trimmed.startsWith('/')) {
    return null;
  }
  
  const parts = trimmed.slice(1).split(' ');
  const command = parts[0].toLowerCase();
  const args = parts.slice(1);
  
  return { command, args };
}

function showSlashHelp(isWatchMode) {
  console.log('\n📝 Available slash commands:');
  console.log('  /focus         Focus on a specific error (uses fzf)');
  console.log('  /all           Show all errors');
  console.log('  /help          Show this help');
  if (isWatchMode) {
    console.log('  /quit          Exit watch mode');
  } else {
    console.log('  /quit          Exit sandbox');
  }
  console.log('\nTip: Just press Enter to ' + (isWatchMode ? 'continue watching' : 'run all errors again'));
}

async function handleSlashCommands(sandboxPath, module, isWatchMode = false) {
  const rl = createPrompt();
  
  console.log('\n' + '='.repeat(60));
  if (isWatchMode) {
    console.log('👀 Watch mode - Type /focus, /all, /help, or /quit:');
  } else {
    console.log('Type /focus, /all, /help, or /quit:');
  }
  
  return new Promise((resolve) => {
    rl.question('> ', async (input) => {
      const slashCmd = parseSlashCommand(input);
      
      if (!slashCmd) {
        // No slash command - default behavior
        if (input.trim() === '') {
          if (isWatchMode) {
            rl.close();
            resolve();
            return;
          } else {
            clearScreen();
            console.log('\n🚀 Running full sandbox...\n');
            await runSandboxModule(sandboxPath, null, isWatchMode, true);
            return;
          }
        } else {
          console.log('❌ Unknown input. Use slash commands like /focus or /help');
          rl.close();
          await handleSlashCommands(sandboxPath, module, isWatchMode);
          return;
        }
      }
      
      switch (slashCmd.command) {
        case 'quit':
        case 'q':
          rl.close();
          if (isWatchMode) {
            console.log('👋 Exiting watch mode...');
            process.exit(0);
          } else {
            resolve();
          }
          return;
          
        case 'focus':
        case 'f':
          try {
            const errorNames = module.getErrorNames();
            const selectedIndex = await selectError(errorNames);
            
            if (selectedIndex !== null) {
              clearScreen();
              console.log(`\n🚀 Running sandbox with focus on error ${selectedIndex + 1}...\n`);
              await runSandboxModule(sandboxPath, selectedIndex, isWatchMode, true);
            } else {
              clearScreen();
              console.log('\n🚀 Running full sandbox...\n');
              await runSandboxModule(sandboxPath, null, isWatchMode, true);
            }
          } catch (error) {
            console.error('Error in focus mode:', error.message);
            rl.close();
            await handleSlashCommands(sandboxPath, module, isWatchMode);
          }
          return;
          
        case 'all':
        case 'a':
          clearScreen();
          console.log('\n🚀 Running full sandbox...\n');
          await runSandboxModule(sandboxPath, null, isWatchMode, true);
          return;
          
        case 'help':
        case 'h':
          showSlashHelp(isWatchMode);
          rl.close();
          await handleSlashCommands(sandboxPath, module, isWatchMode);
          return;
          
        default:
          console.log(`❌ Unknown command: /${slashCmd.command}`);
          showSlashHelp(isWatchMode);
          rl.close();
          await handleSlashCommands(sandboxPath, module, isWatchMode);
          return;
      }
    });
  });
}

async function watchSandbox(sandboxPath, errorFocusIndex = null) {
  console.log('👀 Watch mode enabled - watching for file changes...');
  console.log('Use /focus, /all, /help, or Ctrl+C to exit\n');
  
  let debounceTimer = null;
  
  try {
    const watcher = watch(sandboxPath);
    
    for await (const event of watcher) {
      if (event.eventType === 'change') {
        // Debounce file changes
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(async () => {
          clearScreen();
          console.log('🔄 File changed, re-running sandbox...\n');
          await runSandboxModule(sandboxPath, errorFocusIndex, true, true);
          console.log('\n👀 Watching for changes... (Use /focus, /all, /help, or Ctrl+C)');
        }, 100);
      }
    }
  } catch (error) {
    console.error('Watch error:', error.message);
  }
}

async function runSandbox() {
  try {
    const { watchMode } = parseArgs();
    const sandboxes = await findSandboxes();
    
    if (sandboxes.length === 0) {
      console.log('No sandboxes found (*_sandbox.mjs files)');
      return;
    }
    
    const selected = await promptSandbox(sandboxes);
    
    if (watchMode) {
      console.log(`\n🚀 Running ${selected.name} sandbox in watch mode...\n`);
    } else {
      console.log(`\n🚀 Running ${selected.name} sandbox...\n`);
    }
    
    // Initial run
    await runSandboxModule(selected.path, null, watchMode);
    
    if (watchMode) {
      console.log('\n' + '='.repeat(60));
      await watchSandbox(selected.path);
    }
    
  } catch (error) {
    console.error('Error running sandbox:', error.message);
    process.exit(1);
  }
}

// CLI entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  const { testMode } = parseArgs();
  
  if (testMode) {
    console.log('✅ Enhanced sandbox with fzf and slash commands implemented!');
    console.log('\n📋 Features added:');
    console.log('  • --watch flag for watch mode');
    console.log('  • fzf integration for fuzzy finding errors');
    console.log('  • Slash commands: /focus, /all, /help, /quit');
    console.log('  • Commands available in both normal and watch mode');
    console.log('  • Debounced file change detection');
    console.log('  • Fallback to simple selection if fzf not installed');
    console.log('\n🎯 Usage:');
    console.log('  node sandbox.mjs              # Run with slash commands');
    console.log('  node sandbox.mjs --watch      # Run in watch mode with slash commands');
    console.log('  npm run sandbox               # Run normally');
    console.log('  npm run sandbox:watch         # Run in watch mode');
    console.log('\n💡 Slash commands:');
    console.log('  /focus                        # Use fzf to focus on specific error');
    console.log('  /all                          # Show all errors');
    console.log('  /help                         # Show help');
    console.log('  /quit                         # Exit');
    process.exit(0);
  }
  
  runSandbox();
}