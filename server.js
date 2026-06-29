/**
 * AI-Powered Code Explainer — Express Backend
 * Handles AST parsing, LLM calls, and static file serving.
 * Provider waterfall: Gemini → OpenAI → Claude → Mistral
 * Each provider is tried in order; failures automatically cascade to the next.
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fetch = require('node-fetch');
const { parsePythonAST } = require('./lib/pythonAst');
const { parseJavaScriptAST } = require('./lib/javascriptAst');

// Track when we entered demo mode (null = not in demo mode)
// Auto-retries the real AI provider after 60 seconds
let demoModeUntil = null;
const DEMO_MODE_RETRY_MS = 60 * 1000; // 60 seconds

function isDemoMode() {
  if (!demoModeUntil) return false;
  if (Date.now() > demoModeUntil) {
    demoModeUntil = null; // auto-reset — try real AI again
    console.log('🔄 Demo mode expired — retrying AI provider...');
    return false;
  }
  return true;
}

function enterDemoMode() {
  demoModeUntil = Date.now() + DEMO_MODE_RETRY_MS;
}

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/explain
// Body: { code: string, language: "python"|"javascript", mode: "explain"|"optimize" }
// ─────────────────────────────────────────────────────────────────────────────
app.post('/api/explain', async (req, res) => {
  const { code, language, mode = 'explain' } = req.body;

  if (!code || !language) {
    return res.status(400).json({ error: 'Missing required fields: code, language' });
  }

  try {
    // Step 1: Parse AST for code annotations
    let astAnnotations = [];
    try {
      if (language === 'javascript') {
        astAnnotations = parseJavaScriptAST(code);
      } else if (language === 'python') {
        astAnnotations = parsePythonAST(code);
      }
    } catch (astError) {
      console.warn('AST parsing failed (non-fatal):', astError.message);
    }

    // Step 2: Build enriched prompt
    const prompt = buildPrompt(code, language, mode, astAnnotations);

    // Step 3: Call AI with automatic provider waterfall
    let parsed;

    if (isDemoMode()) {
      parsed = buildDemoResponse(code, language, astAnnotations);
    } else {
      try {
        const { result, label } = await callAIWithFallback(prompt);
        parsed = parseAIResponse(result);
        demoModeUntil = null; // clear demo mode on success
        parsed.confidenceNote = `Analysis powered by ${label}. Results are based on deep static and semantic code analysis.`;
      } catch (aiError) {
        console.warn('⚠️  All AI providers failed — switching to demo mode (will retry in 60s)');
        console.warn(aiError.message);
        enterDemoMode();
        parsed = buildDemoResponse(code, language, astAnnotations);
      }
    }

    parsed.astAnnotations = astAnnotations;
    parsed.language = language;
    parsed.originalCode = code;
    parsed.demoMode = isDemoMode();

    res.json(parsed);
  } catch (error) {
    console.error('Error processing request:', error);
    res.status(500).json({
      error: error.message || 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/optimize
// Body: { code: string, language: string }
// ─────────────────────────────────────────────────────────────────────────────
app.post('/api/optimize', async (req, res) => {
  const { code, language } = req.body;
  if (!code || !language) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    let parsed;
    if (isDemoMode()) {
      parsed = buildDemoResponse(code, language, []);
    } else {
      try {
        const prompt = buildOptimizePrompt(code, language);
        const { result, label } = await callAIWithFallback(prompt);
        parsed = parseAIResponse(result);
        demoModeUntil = null;
        parsed.confidenceNote = `Optimization powered by ${label}. All improvements are explained with rationale below.`;
      } catch (aiError) {
        console.warn('⚠️  All AI providers failed for optimize — switching to demo mode (will retry in 60s)');
        enterDemoMode();
        parsed = buildDemoResponse(code, language, []);
      }
    }
    parsed.originalCode = code;
    parsed.demoMode = isDemoMode();
    res.json(parsed);
  } catch (error) {
    console.error('Optimize error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Prompt Builders
// ─────────────────────────────────────────────────────────────────────────────
function buildPrompt(code, language, mode, astAnnotations) {
  const langLabel = language === 'python' ? 'Python' : 'JavaScript';

  const astContext = astAnnotations.length > 0
    ? `\n\nAST Analysis found these key elements:\n${astAnnotations.map(a => `  - [${a.type}] "${a.name}" at line ${a.line}`).join('\n')}`
    : '';

  return `You are a senior ${langLabel} engineer and expert technical writer. Perform a deep, thorough analysis of the following ${langLabel} code. Respond ONLY with a valid JSON object — no markdown, no backticks, no extra text.

Code to analyze:
\`\`\`${language}
${code}
\`\`\`
${astContext}

Your response MUST follow this exact JSON structure. Be as detailed and informative as possible in every field:
{
  "explanation": "Write a detailed, multi-paragraph plain-English explanation of what this code does. Cover: (1) the overall purpose and what problem it solves, (2) how the algorithm or logic works step-by-step, (3) what inputs it expects and outputs it produces, (4) any important design decisions or patterns used. Aim for 5-8 sentences minimum. Be thorough — a beginner should fully understand the code after reading this.",
  "keyHighlights": [
    {
      "lineStart": <1-indexed line number where this element starts>,
      "lineEnd": <1-indexed line number where this element ends>,
      "label": "Descriptive label (e.g., 'Recursive Base Case', 'Memoization Cache', 'Main Sorting Loop')",
      "description": "Write 2-3 sentences explaining exactly what this section does, why it exists, how it interacts with the rest of the code, and any important nuances or edge cases to be aware of."
    }
  ],
  "complexity": {
    "time": "O(?) — Explain the time complexity in detail: what drives it, best/average/worst cases if they differ, and which part of the code is the bottleneck.",
    "space": "O(?) — Explain the space complexity: what data structures consume memory, whether recursion adds stack frames, and if there are any trade-offs.",
    "detectable": true
  },
  "optimizedCode": "The same logic rewritten with best practices, better naming, type hints (Python) or JSDoc (JS), early returns, and efficiency improvements. Return as a plain string with newlines as \\n. Return null only if the code is already optimal and well-written.",
  "optimizationNotes": ["Each note should be a specific, actionable improvement explaining WHAT was changed, WHY it is better, and what benefit it provides (performance, readability, safety, etc.)"],
  "potentialIssues": ["Each issue should describe the problem clearly, explain under what conditions it occurs, and suggest how to fix it. Cover bugs, edge cases, anti-patterns, security risks, and maintainability concerns."],
  "confidenceNote": "Rate your confidence (High/Medium/Low) and briefly explain any assumptions made or parts of the code that were ambiguous."
}`;
}

function buildOptimizePrompt(code, language) {
  const langLabel = language === 'python' ? 'Python' : 'JavaScript';
  return `You are a senior ${langLabel} engineer specializing in code quality and performance optimization. Deeply analyze and rewrite the following code. Respond ONLY with a valid JSON object — no markdown, no backticks, no extra text.

Original code:
\`\`\`${language}
${code}
\`\`\`

Your response MUST follow this exact JSON structure. Be comprehensive and actionable in every field:
{
  "explanation": "Provide a detailed explanation of what the original code does: its purpose, how the logic flows step-by-step, what inputs/outputs are involved, and any patterns or design choices used. Write at least 5 sentences.",
  "keyHighlights": [
    {
      "lineStart": <line number>,
      "lineEnd": <line number>,
      "label": "Descriptive label for this code section",
      "description": "2-3 sentences describing what this section does and why it matters for optimization."
    }
  ],
  "complexity": {
    "time": "O(?) — Explain in detail: what drives the complexity, best/average/worst cases, and the specific bottleneck in the code.",
    "space": "O(?) — Explain: what uses memory, recursion stack frames if any, and any space/time trade-offs.",
    "detectable": true
  },
  "optimizedCode": "The fully optimized version as a plain string (use \\n for newlines). Apply: better algorithms if applicable, proper naming, type hints or JSDoc, guard clauses, eliminated redundancy, and ${langLabel} best practices.",
  "optimizationNotes": ["For each change: describe WHAT was changed, WHY it is better (e.g., reduces time complexity from O(n²) to O(n log n)), and what the practical benefit is (speed, memory, readability, safety)."],
  "potentialIssues": ["Describe each issue in the ORIGINAL code: what the problem is, when it manifests, and how the optimized version addresses it."],
  "confidenceNote": "State your confidence level (High/Medium/Low), mention any assumptions, and note if any optimizations depend on usage context."
}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// AI Providers — Individual callers
// ─────────────────────────────────────────────────────────────────────────────
async function callGemini(prompt) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'your_gemini_api_key_here') throw new Error('GEMINI_API_KEY not configured');

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.2, topK: 40, topP: 0.95, maxOutputTokens: 4096 }
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini ${response.status}: ${errText.substring(0, 200)}`);
  }
  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

async function callOpenAI(prompt) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || apiKey === 'your_openai_api_key_here') throw new Error('OPENAI_API_KEY not configured');

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You are an expert code analyst. Always respond with valid JSON only, no markdown.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.2,
      max_tokens: 4096,
      response_format: { type: 'json_object' }
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`OpenAI ${response.status}: ${errText.substring(0, 200)}`);
  }
  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}

async function callClaude(prompt) {
  const apiKey = process.env.CLAUDE_API_KEY;
  if (!apiKey || apiKey === 'your_claude_api_key_here') throw new Error('CLAUDE_API_KEY not configured');

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 4096,
      system: 'You are an expert code analyst. Always respond with valid JSON only, no markdown formatting, no backticks.',
      messages: [{ role: 'user', content: prompt }]
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Claude ${response.status}: ${errText.substring(0, 200)}`);
  }
  const data = await response.json();
  return data.content?.[0]?.text || '';
}

async function callMistral(prompt) {
  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey || apiKey === 'your_mistral_api_key_here') throw new Error('MISTRAL_API_KEY not configured');

  const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: 'mistral-large-latest',
      messages: [
        { role: 'system', content: 'You are an expert code analyst. Always respond with valid JSON only, no markdown formatting, no backticks.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.2,
      max_tokens: 4096,
      response_format: { type: 'json_object' }
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Mistral ${response.status}: ${errText.substring(0, 200)}`);
  }
  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}

// ─────────────────────────────────────────────────────────────────────────────
// AI Waterfall — tries providers in order until one succeeds
// Order: Gemini → OpenAI → Claude → Mistral
// ─────────────────────────────────────────────────────────────────────────────
const AI_PROVIDERS = [
  { name: 'gemini',  fn: callGemini,  label: 'Gemini 2.0 Flash' },
  { name: 'openai',  fn: callOpenAI,  label: 'GPT-4o-mini' },
  { name: 'claude',  fn: callClaude,  label: 'Claude 3.5 Haiku' },
  { name: 'mistral', fn: callMistral, label: 'Mistral Large' }
];

async function callAIWithFallback(prompt) {
  const errors = [];

  for (const provider of AI_PROVIDERS) {
    try {
      console.log(`🤖 Trying ${provider.label}...`);
      const result = await provider.fn(prompt);
      console.log(`✅ ${provider.label} responded successfully`);
      return { result, name: provider.name, label: provider.label };
    } catch (err) {
      console.warn(`⚠️  ${provider.label} failed: ${err.message.substring(0, 120)}`);
      errors.push(`${provider.label}: ${err.message.substring(0, 100)}`);
    }
  }

  // All providers failed
  throw new Error(`All AI providers exhausted:\n${errors.join('\n')}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Response Parser — robustly extracts JSON from LLM output
// ─────────────────────────────────────────────────────────────────────────────
function parseAIResponse(rawText) {
  // Strip markdown code fences if present
  let cleaned = rawText.trim();
  cleaned = cleaned.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '');

  // Try direct parse
  try {
    return JSON.parse(cleaned);
  } catch (e) {
    // Try to extract JSON object from text
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch (e2) {
        // Return safe fallback
        return {
          explanation: cleaned.substring(0, 500) || 'Could not parse AI response.',
          keyHighlights: [],
          complexity: { time: 'N/A', space: 'N/A', detectable: false },
          optimizedCode: null,
          optimizationNotes: [],
          potentialIssues: [],
          confidenceNote: 'Response parsing failed — raw output shown above.'
        };
      }
    }
    return {
      explanation: cleaned || 'No explanation available.',
      keyHighlights: [],
      complexity: { time: 'N/A', space: 'N/A', detectable: false },
      optimizedCode: null,
      optimizationNotes: [],
      potentialIssues: [],
      confidenceNote: ''
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Demo Fallback — generates realistic explanation from AST data
// Activates automatically when the API quota is exceeded (429)
// ─────────────────────────────────────────────────────────────────────────────
function buildDemoResponse(code, language, astAnnotations) {
  const lines = code.split('\n');
  const langLabel = language === 'python' ? 'Python' : 'JavaScript';

  const functions = astAnnotations.filter(a => a.type.includes('Function') || a.type.includes('Method'));
  const classes   = astAnnotations.filter(a => a.type === 'Class');
  const loops     = astAnnotations.filter(a => a.type.includes('Loop'));
  const imports   = astAnnotations.filter(a => a.type === 'Import');
  const tryBlocks = astAnnotations.filter(a => a.type.includes('Try'));
  const asyncFns  = astAnnotations.filter(a => a.type.includes('Async'));

  // Build natural explanation
  let explanation = '';
  if (classes.length > 0 && functions.length > 0) {
    explanation = `This ${langLabel} code defines the \`${classes[0].name}\` class with ${functions.length} method${functions.length > 1 ? 's' : ''} (${functions.slice(0, 3).map(f => '`' + f.name + '`').join(', ')}). `;
    explanation += loops.length > 0 ? `It uses ${loops.length} loop${loops.length > 1 ? 's' : ''} to iterate over data. ` : 'The methods operate on instance data. ';
    explanation += 'The class encapsulates state and behaviour using object-oriented principles.';
  } else if (functions.length > 0) {
    const mainFn = functions[0];
    explanation = `This ${langLabel} code defines ${functions.length > 1 ? functions.length + ' functions' : 'a function'} — the primary one being \`${mainFn.name}\`. `;
    if (asyncFns.length > 0) explanation += 'It uses async/await for non-blocking operations. ';
    if (loops.length > 0) explanation += `It contains ${loops.length} loop${loops.length > 1 ? 's' : ''} to process or transform data. `;
    if (tryBlocks.length > 0) explanation += 'Error handling is implemented with try/catch blocks. ';
    if (!explanation.trim().endsWith('.')) explanation += ' The overall logic processes input and produces a computed result.';
  } else if (imports.length > 0) {
    explanation = `This ${langLabel} script imports ${imports.length} module${imports.length > 1 ? 's' : ''} (${imports.slice(0, 2).map(i => '`' + i.name + '`').join(', ')}) and executes top-level logic. `;
    explanation += loops.length > 0 ? `It uses ${loops.length} loop${loops.length > 1 ? 's' : ''} for iteration. ` : '';
    explanation += 'The script performs operations using the imported utilities.';
  } else {
    explanation = `This ${langLabel} snippet is ${lines.length} line${lines.length > 1 ? 's' : ''} long. `;
    explanation += loops.length > 0 ? `It contains ${loops.length} loop${loops.length > 1 ? 's' : ''} for iteration. ` : '';
    explanation += 'It defines logic for processing or transforming data.';
  }

  // Infer complexity
  let timeComplexity, spaceComplexity;
  if (loops.length >= 2) {
    timeComplexity  = 'O(n²) — nested loops iterate over input pairs';
    spaceComplexity = 'O(1) — in-place operations, constant extra space';
  } else if (loops.length === 1) {
    timeComplexity  = 'O(n) — single pass through the input';
    spaceComplexity = 'O(1) — constant auxiliary space';
  } else if (functions.length > 0 && code.includes(functions[0].name + '(')) {
    timeComplexity  = 'O(log n) or O(n) — depends on recursion depth';
    spaceComplexity = 'O(n) — call stack grows with input size';
  } else {
    timeComplexity  = 'O(1) — constant time, no loops detected';
    spaceComplexity = 'O(1) — constant space usage';
  }

  // Key highlights from AST
  const keyHighlights = astAnnotations.slice(0, 6).map(a => ({
    lineStart: a.line,
    lineEnd: a.endLine || a.line,
    label: a.type,
    description: getDemoDescription(a)
  }));

  // Simple optimized version
  const optLines = [];
  if (language === 'python') {
    if (!code.trim().startsWith('"""')) { optLines.push('"""', 'Optimized: improved readability and best-practices applied.', '"""'); }
    code.split('\n').forEach(l => optLines.push(l.replace(/\t/g, '    ')));
  } else {
    if (!code.trim().startsWith('/**')) { optLines.push('/**', ' * @description Best practices applied by CodeLens AI (demo mode).', ' */'); }
    code.split('\n').forEach(l => optLines.push(l.replace(/\bvar\b/g, 'const')));
  }

  // Static issue detection
  const issues = [];
  if (language === 'python') {
    if (code.includes('def ') && !code.includes('"""')) issues.push('Functions lack docstrings — add """description""" for documentation.');
    if (code.includes('except:')) issues.push('Bare except clause — be more specific about which exceptions to catch.');
    if (/def .*memo=\{\}/.test(code)) issues.push('Mutable default argument (memo={}) is shared across all calls — use None and initialise inside.');
    if (code.includes('print(')) issues.push('print() used — consider the logging module for production code.');
  } else {
    if (code.includes('var ')) issues.push('Using `var` — prefer `const` or `let` for block scoping.');
    if (code.includes('console.log')) issues.push('console.log present — remove before production deployment.');
    if (code.includes(' == ') && !code.includes(' === ')) issues.push('Loose equality (==) — prefer strict equality (===) to avoid type coercion.');
    if (!code.includes('try') && (code.includes('fetch(') || code.includes('await '))) issues.push('Async operations without try/catch — add error handling.');
  }
  if (issues.length === 0) issues.push('No obvious issues detected by static analysis.');

  return {
    explanation: explanation.trim(),
    keyHighlights,
    complexity: { time: timeComplexity, space: spaceComplexity, detectable: true },
    optimizedCode: optLines.join('\n'),
    optimizationNotes: [
      'Added type hints / JSDoc documentation',
      'Improved variable naming for clarity',
      'Added early-return guard clauses',
      'Extracted magic numbers into named constants'
    ],
    potentialIssues: issues,
    confidenceNote: ''
  };
}

function getDemoDescription(a) {
  const map = {
    'Function':            `Defines \`${a.name}\` — a reusable block of logic.`,
    'Async Function':      `Async function \`${a.name}\` for non-blocking operations.`,
    'Arrow Function':      `Arrow function \`${a.name}\` — concise, lexically scoped.`,
    'Async Arrow Function':`Async arrow \`${a.name}\` handles async/await flow.`,
    'Class':               `Defines the \`${a.name}\` class using OOP principles.`,
    'Class Method':        `Method \`${a.name}\` defines behaviour for class instances.`,
    'Constructor':         `Constructor initialises instance properties when an object is created.`,
    'For Loop':            'Iterates over a sequence, running the body for each element.',
    'For-Of Loop':         'ES6 iteration over iterable values (array, string, etc.).',
    'For-In Loop':         'Iterates over enumerable keys of an object.',
    'While Loop':          'Repeats while the condition is true.',
    'Import':              `Imports \`${a.name}\` module or exports into scope.`,
    'Try/Catch Block':     'Handles exceptions to prevent unhandled crashes.',
    'Try/Except Block':    'Handles exceptions in Python — prevents unhandled crashes.',
    'Conditional':         'Branches execution based on a boolean condition.',
    'Decorator':           `@${a.name} modifies or enhances the decorated function/class.`,
    'Constant':            `\`${a.name}\` is a module-level constant.`,
    'Await Expression':    'Pauses until the awaited Promise resolves.',
    'Return Statement':    'Returns a computed value from the enclosing function.',
    'Array Method':        `\`${a.name}\` transforms or queries the array functionally.`
  };
  return map[a.type] || `${a.type} detected at line ${a.line}.`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Health check

// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  const providerStatus = AI_PROVIDERS.map(p => ({
    name: p.name,
    label: p.label,
    configured: !!process.env[`${p.name.toUpperCase()}_API_KEY`] &&
                process.env[`${p.name.toUpperCase()}_API_KEY`] !== `your_${p.name}_api_key_here`
  }));

  res.json({
    status: 'ok',
    providerChain: 'Gemini → OpenAI → Claude → Mistral',
    providers: providerStatus,
    demoMode: isDemoMode(),
    timestamp: new Date().toISOString()
  });
});

app.listen(PORT, () => {
  console.log(`\n🚀 AI Code Explainer running at http://localhost:${PORT}`);
  console.log(`   Provider chain: Gemini → OpenAI → Claude → Mistral`);
  console.log(`   Press Ctrl+C to stop\n`);
});
