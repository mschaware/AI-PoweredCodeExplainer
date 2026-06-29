/**
 * Python AST Parser (regex-based, server-side)
 * Extracts functions, classes, loops, imports, and decorators from Python code.
 * Returns an array of annotation objects for LLM prompt enrichment.
 */

/**
 * @param {string} code - Raw Python source code
 * @returns {Array<{type: string, name: string, line: number, endLine: number}>}
 */
function parsePythonAST(code) {
  const lines = code.split('\n');
  const annotations = [];

  const patterns = [
    {
      regex: /^(\s*)def\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/,
      type: 'Function',
      nameGroup: 2
    },
    {
      regex: /^(\s*)async\s+def\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/,
      type: 'Async Function',
      nameGroup: 2
    },
    {
      regex: /^(\s*)class\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*[\(:]/, 
      type: 'Class',
      nameGroup: 2
    },
    {
      regex: /^(\s*)for\s+(.+?)\s+in\s+/,
      type: 'For Loop',
      nameGroup: 2
    },
    {
      regex: /^(\s*)while\s+(.+?):/,
      type: 'While Loop',
      nameGroup: 2
    },
    {
      regex: /^(\s*)if\s+(.+?):/,
      type: 'Conditional',
      nameGroup: 2
    },
    {
      regex: /^(\s*)try\s*:/,
      type: 'Try/Except Block',
      nameGroup: null
    },
    {
      regex: /^(\s*)import\s+(.+)/,
      type: 'Import',
      nameGroup: 2
    },
    {
      regex: /^(\s*)from\s+(\S+)\s+import\s+/,
      type: 'Import',
      nameGroup: 2
    },
    {
      regex: /^(\s*)@([a-zA-Z_][a-zA-Z0-9_.]*)/,
      type: 'Decorator',
      nameGroup: 2
    },
    {
      regex: /^(\s*)([A-Z_][A-Z0-9_]+)\s*=/,
      type: 'Constant',
      nameGroup: 2
    },
    {
      regex: /^(\s*)lambda\s+/,
      type: 'Lambda Expression',
      nameGroup: null
    },
    {
      regex: /^(\s*)with\s+(.+?)\s+as\s+/,
      type: 'Context Manager',
      nameGroup: 2
    },
    {
      regex: /^(\s*)yield\s+/,
      type: 'Generator Yield',
      nameGroup: null
    },
    {
      regex: /^(\s*)return\s+/,
      type: 'Return Statement',
      nameGroup: null
    }
  ];

  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    for (const pattern of patterns) {
      const match = line.match(pattern.regex);
      if (match) {
        const name = pattern.nameGroup
          ? match[pattern.nameGroup].substring(0, 40).trim()
          : line.trim().substring(0, 40);

        // Avoid duplicate type+name combos on adjacent lines
        const isDuplicate = annotations.some(
          a => a.type === pattern.type && a.name === name && Math.abs(a.line - lineNumber) < 3
        );

        if (!isDuplicate) {
          annotations.push({
            type: pattern.type,
            name: name,
            line: lineNumber,
            endLine: lineNumber, // Python indent-based end lines are hard to detect statically
            indent: (match[1] || '').length
          });
        }
        break; // Only one pattern per line
      }
    }
  });

  return annotations;
}

module.exports = { parsePythonAST };
