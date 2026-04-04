import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const isCheckMode = process.argv.includes('--check');
const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(scriptDirectory, '..');
const packageJsonPath = resolve(workspaceRoot, 'package.json');
const outputPath = resolve(workspaceRoot, 'src/app/generated/data-schema-version.ts');

const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
const dataSchemaVersion = packageJson.dataSchemaVersion;
const appVersion = packageJson.version;

if (typeof dataSchemaVersion !== 'string' || dataSchemaVersion.length === 0) {
  throw new Error('package.json dataSchemaVersion must be a non-empty string.');
}

if (typeof appVersion !== 'string' || appVersion.length === 0) {
  throw new Error('package.json version must be a non-empty string.');
}

const output = `export const GENERATED_APP_VERSION = ${JSON.stringify(appVersion)};\nexport const GENERATED_APP_DATA_SCHEMA_VERSION = ${JSON.stringify(dataSchemaVersion)};\n`;

mkdirSync(dirname(outputPath), { recursive: true });

let existingOutput = '';

try {
  existingOutput = readFileSync(outputPath, 'utf8');
} catch {
  existingOutput = '';
}

if (existingOutput !== output) {
  if (isCheckMode) {
    throw new Error(
      'src/app/generated/data-schema-version.ts is out of date. Run "npm run sync:data-schema-version" and commit the result.'
    );
  }

  writeFileSync(outputPath, output, 'utf8');
}