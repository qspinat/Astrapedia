/**
 * @fileoverview Test to detect unused imports in the codebase.
 * Helps maintain clean code by catching dead imports during refactoring.
 */

import {readFileSync, readdirSync, statSync} from 'fs';
import {join, relative, dirname} from 'path';
import {fileURLToPath} from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Recursively get all JavaScript files in a directory.
 * @param {string} dir - Directory path
 * @param {!Array<string>} files - Accumulator for file paths
 * @returns {!Array<string>} Array of JS file paths
 */
function getJsFiles(dir, files = []) {
  const entries = readdirSync(dir);
  for (const entry of entries) {
    // Skip node_modules, test files, build outputs, and hidden directories
    if (entry === 'node_modules' || entry === 'tests' || entry.startsWith('.') ||
        entry === 'android' || entry === 'www' || entry === 'build') {
      continue;
    }
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      getJsFiles(fullPath, files);
    } else if (entry.endsWith('.js') && !entry.endsWith('.test.js')) {
      files.push(fullPath);
    }
  }
  return files;
}

/**
 * Extract imported identifiers from a file's content.
 * @param {string} content - File content
 * @returns {!Array<{name: string, line: number}>} Array of imported identifiers with line numbers
 */
function extractImports(content) {
  const imports = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Match: import {A, B, C} from 'module';
    // Match: import {A as B} from 'module';
    const namedImportMatch = line.match(/import\s*\{([^}]+)\}/);
    if (namedImportMatch) {
      const names = namedImportMatch[1].split(',');
      for (const name of names) {
        // Handle "A as B" - we care about B (the local name)
        const asMatch = name.trim().match(/(\w+)\s+as\s+(\w+)/);
        if (asMatch) {
          imports.push({name: asMatch[2], line: i + 1});
        } else {
          const trimmed = name.trim();
          if (trimmed && /^\w+$/.test(trimmed)) {
            imports.push({name: trimmed, line: i + 1});
          }
        }
      }
    }

    // Match: import DefaultExport from 'module';
    const defaultImportMatch = line.match(/import\s+(\w+)\s+from\s+['"]/);
    if (defaultImportMatch && !line.includes('{')) {
      imports.push({name: defaultImportMatch[1], line: i + 1});
    }

    // Match: import * as Name from 'module';
    const namespaceImportMatch = line.match(/import\s+\*\s+as\s+(\w+)\s+from/);
    if (namespaceImportMatch) {
      imports.push({name: namespaceImportMatch[1], line: i + 1});
    }
  }

  return imports;
}

/**
 * Check if an identifier is used in the file content (excluding imports).
 * @param {string} content - File content
 * @param {string} name - Identifier name to search for
 * @returns {boolean} True if the identifier is used
 */
function isIdentifierUsed(content, name) {
  // Remove import lines to avoid false positives
  const lines = content.split('\n');
  const nonImportContent = lines
    .filter((line) => !line.trim().startsWith('import '))
    .join('\n');

  // Check for usage as:
  // - Direct usage: name
  // - Property access: name.something
  // - Function call: name(
  // - As argument: (name) or , name
  // - In JSDoc: @type {name} or @param {name}
  // - Template literal: ${name}

  // Use word boundary to avoid matching substrings
  const usagePattern = new RegExp(`\\b${name}\\b`, 'g');
  return usagePattern.test(nonImportContent);
}

/**
 * Find unused imports in a file.
 * @param {string} filePath - Path to the file
 * @returns {!Array<{name: string, line: number}>} Array of unused imports
 */
function findUnusedImports(filePath) {
  const content = readFileSync(filePath, 'utf-8');
  const imports = extractImports(content);
  const unused = [];

  for (const imp of imports) {
    if (!isIdentifierUsed(content, imp.name)) {
      unused.push(imp);
    }
  }

  return unused;
}

describe('Unused Imports', () => {
  const projectRoot = join(__dirname, '..');
  const jsFiles = getJsFiles(projectRoot);

  // Create a test for each JS file
  test.each(jsFiles.map((f) => [relative(projectRoot, f), f]))(
    '%s has no unused imports',
    (relativePath, filePath) => {
      const unused = findUnusedImports(filePath);

      if (unused.length > 0) {
        const messages = unused.map(
          (u) => `  - "${u.name}" (line ${u.line})`
        ).join('\n');
        throw new Error(
          `Found ${unused.length} unused import(s) in ${relativePath}:\n${messages}`
        );
      }
    }
  );

  test('scans at least 10 source files', () => {
    // Sanity check that we're actually scanning files
    expect(jsFiles.length).toBeGreaterThanOrEqual(10);
  });
});
