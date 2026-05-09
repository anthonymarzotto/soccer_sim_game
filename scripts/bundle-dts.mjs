import fs from 'fs';
import path from 'path';

const tempDir = './temp-skeleton';
const outputFile = './skeleton.d.ts';

function getAllFiles(dirPath, arrayOfFiles) {
  const files = fs.readdirSync(dirPath);

  arrayOfFiles = arrayOfFiles || [];

  files.forEach(function(file) {
    const fullPath = path.join(dirPath, file);
    if (fs.statSync(fullPath).isDirectory()) {
      arrayOfFiles = getAllFiles(fullPath, arrayOfFiles);
    } else {
      if (file.endsWith('.d.ts')) {
        arrayOfFiles.push(fullPath);
      }
    }
  });

  return arrayOfFiles;
}

try {
  if (!fs.existsSync(tempDir)) {
    console.error(`Directory ${tempDir} does not exist. Run build:skeleton first.`);
    process.exit(1);
  }

  const files = getAllFiles(tempDir);
  const bundle = files.map(file => {
    const content = fs.readFileSync(file, 'utf8');
    const relativePath = path.relative(tempDir, file);
    return `// --- ${relativePath} ---\n${content}`;
  }).join('\n\n');

  fs.writeFileSync(outputFile, bundle);
  console.log(`Successfully bundled ${files.length} files into ${outputFile}`);
} catch (err) {
  console.error('Error bundling .d.ts files:', err);
  process.exit(1);
}
