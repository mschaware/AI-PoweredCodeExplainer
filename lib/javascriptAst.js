/**
 * JavaScript AST Parser using @babel/parser
 * Extracts functions, classes, loops, imports, and expressions from JS code.
 * Returns an array of annotation objects for LLM prompt enrichment.
 */

const babelParser = require('@babel/parser');
const traverse = require('@babel/traverse').default;

/**
 * @param {string} code - Raw JavaScript source code
 * @returns {Array<{type: string, name: string, line: number, endLine: number}>}
 */
function parseJavaScriptAST(code) {
  const annotations = [];

  let ast;
  try {
    ast = babelParser.parse(code, {
      sourceType: 'module',
      plugins: [
        'jsx',
        'typescript',
        'classProperties',
        'dynamicImport',
        'optionalChaining',
        'nullishCoalescingOperator',
        'decorators-legacy',
        'asyncGenerators',
        'objectRestSpread'
      ],
      errorRecovery: true
    });
  } catch (e) {
    // Fallback: try script mode
    try {
      ast = babelParser.parse(code, {
        sourceType: 'script',
        errorRecovery: true
      });
    } catch (e2) {
      throw new Error(`JS parse failed: ${e2.message}`);
    }
  }

  const seen = new Set();

  const addAnnotation = (type, name, node) => {
    if (!node || !node.loc) return;
    const key = `${type}:${name}:${node.loc.start.line}`;
    if (seen.has(key)) return;
    seen.add(key);
    annotations.push({
      type,
      name: (name || 'anonymous').substring(0, 60),
      line: node.loc.start.line,
      endLine: node.loc.end.line
    });
  };

  traverse(ast, {
    // Function declarations: function foo() {}
    FunctionDeclaration(path) {
      const name = path.node.id ? path.node.id.name : 'anonymous';
      const asyncLabel = path.node.async ? 'Async ' : '';
      addAnnotation(`${asyncLabel}Function`, name, path.node);
    },

    // Arrow functions and function expressions assigned to variables
    VariableDeclarator(path) {
      const init = path.node.init;
      if (!init) return;
      const name = path.node.id && path.node.id.name ? path.node.id.name : 'anonymous';
      if (init.type === 'ArrowFunctionExpression') {
        const asyncLabel = init.async ? 'Async ' : '';
        addAnnotation(`${asyncLabel}Arrow Function`, name, path.node);
      } else if (init.type === 'FunctionExpression') {
        addAnnotation('Function Expression', name, path.node);
      }
    },

    // Class declarations
    ClassDeclaration(path) {
      const name = path.node.id ? path.node.id.name : 'AnonymousClass';
      addAnnotation('Class', name, path.node);
    },

    // Class methods
    ClassMethod(path) {
      const name = path.node.key && path.node.key.name ? path.node.key.name : 'method';
      const kind = path.node.kind === 'constructor' ? 'Constructor' : 'Class Method';
      addAnnotation(kind, name, path.node);
    },

    // Object methods
    ObjectMethod(path) {
      const name = path.node.key && path.node.key.name ? path.node.key.name : 'method';
      addAnnotation('Object Method', name, path.node);
    },

    // For loops
    ForStatement(path) {
      addAnnotation('For Loop', 'for(...)', path.node);
    },
    ForInStatement(path) {
      addAnnotation('For-In Loop', 'for...in', path.node);
    },
    ForOfStatement(path) {
      addAnnotation('For-Of Loop', 'for...of', path.node);
    },

    // While loops
    WhileStatement(path) {
      addAnnotation('While Loop', 'while(...)', path.node);
    },
    DoWhileStatement(path) {
      addAnnotation('Do-While Loop', 'do...while', path.node);
    },

    // Conditionals
    IfStatement(path) {
      // Only top-level ifs (not else-if chains)
      if (path.parent && path.parent.type !== 'IfStatement') {
        addAnnotation('Conditional', 'if/else', path.node);
      }
    },

    // Try/catch
    TryStatement(path) {
      addAnnotation('Try/Catch Block', 'try...catch', path.node);
    },

    // Switch
    SwitchStatement(path) {
      addAnnotation('Switch Statement', 'switch', path.node);
    },

    // Imports
    ImportDeclaration(path) {
      const source = path.node.source.value;
      addAnnotation('Import', source, path.node);
    },

    // Exports
    ExportDefaultDeclaration(path) {
      addAnnotation('Default Export', 'export default', path.node);
    },
    ExportNamedDeclaration(path) {
      addAnnotation('Named Export', 'export { ... }', path.node);
    },

    // Promise chains
    CallExpression(path) {
      const callee = path.node.callee;
      if (callee.type === 'MemberExpression') {
        const prop = callee.property && callee.property.name;
        if (prop === 'then' || prop === 'catch' || prop === 'finally') {
          addAnnotation('Promise Chain', `.${prop}()`, path.node);
        }
        if (prop === 'reduce' || prop === 'map' || prop === 'filter' || prop === 'forEach') {
          addAnnotation('Array Method', `.${prop}()`, path.node);
        }
        if (prop === 'fetch' || (callee.object && callee.object.name === 'fetch')) {
          addAnnotation('Fetch API Call', 'fetch()', path.node);
        }
      }
      // await expressions hint
      if (callee.name === 'Promise') {
        addAnnotation('Promise Constructor', 'new Promise()', path.node);
      }
    },

    // Async/Await
    AwaitExpression(path) {
      addAnnotation('Await Expression', 'await', path.node);
    }
  });

  // Sort by line number
  annotations.sort((a, b) => a.line - b.line);

  return annotations;
}

module.exports = { parseJavaScriptAST };
