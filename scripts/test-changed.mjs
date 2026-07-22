import { execSync, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(scriptDirectory, '..');

// Helper to get dirname in ES modules
function dirname(path) {
  return path.replace(/[\/\\][^\/\\]+$/, '');
}

// 1. Get modified files from git
function getModifiedFiles() {
  const files = new Set();
  
  let commit = null;
  const passThroughArgs = [];

  for (let i = 2; i < process.argv.length; i++) {
    if (process.argv[i] === '--since') {
      commit = process.argv[i + 1];
      i++; // skip next arg
    } else {
      passThroughArgs.push(process.argv[i]);
    }
  }

  try {
    // Get unstaged, staged, and untracked changes
    const statusOutput = execSync('git status --porcelain', { encoding: 'utf8', cwd: workspaceRoot });
    statusOutput.split('\n').forEach(line => {
      if (!line) return;
      const filePath = line.substring(3).trim().replace(/^"(.*)"$/, '$1');
      if (filePath) {
        files.add(filePath.replace(/\\/g, '/'));
      }
    });

    // Check if a branch/commit to compare against is provided
    if (commit) {
      const diffOutput = execSync(`git diff --name-only ${commit}`, { encoding: 'utf8', cwd: workspaceRoot });
      diffOutput.split('\n').forEach(line => {
        const filePath = line.trim();
        if (filePath) {
          files.add(filePath.replace(/\\/g, '/'));
        }
      });
    }
  } catch (error) {
    console.error('Warning: Failed to retrieve modified files from Git:', error.message);
  }

  return { files: Array.from(files), passThroughArgs };
}

// 2. Map modified files to their spec files
function getSpecFilesToRun(modifiedFiles) {
  const specFiles = new Set();

  for (const file of modifiedFiles) {
    const fullPath = resolve(workspaceRoot, file);
    if (file.endsWith('.spec.ts') || file.endsWith('.test.ts')) {
      if (existsSync(fullPath)) {
        specFiles.add(file);
      }
    } else {
      const ext = extname(file);
      if (ext) {
        const specFile = file.slice(0, -ext.length) + '.spec.ts';
        if (existsSync(resolve(workspaceRoot, specFile))) {
          specFiles.add(specFile);
        }
      }
    }
  }

  return Array.from(specFiles);
}

// Main execution
const { files: modifiedFiles, passThroughArgs } = getModifiedFiles();
const specFiles = getSpecFilesToRun(modifiedFiles);

if (specFiles.length === 0) {
  console.log('No modified files with corresponding unit tests found.');
  process.exit(0);
}

console.log(`Running tests for ${specFiles.length} file(s):`);
specFiles.forEach(file => console.log(` - ${file}`));
console.log();

// Forward --watch flag if provided by user, otherwise default to false for a clean run
const hasWatchArg = passThroughArgs.some(arg => arg.startsWith('--watch'));
const watchArgs = hasWatchArg ? [] : ['--watch=false'];

const args = [
  'test',
  ...watchArgs,
  ...specFiles.map(file => `--include=${file}`),
  ...passThroughArgs
];

const ngCliPath = resolve(workspaceRoot, 'node_modules', '@angular/cli', 'bin', 'ng.js');

const ngProcess = spawn(process.execPath, [ngCliPath, ...args], {
  stdio: 'inherit',
  cwd: workspaceRoot
});

ngProcess.on('exit', (code) => {
  process.exit(code ?? 0);
});
