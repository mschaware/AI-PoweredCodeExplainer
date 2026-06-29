# CodeLens AI — AI-Powered Code Explainer

> Paste Python or JavaScript code and get instant plain-English explanations, complexity analysis, AST-powered annotations, and AI-optimized versions with a diff view.

![CodeLens AI](https://img.shields.io/badge/AI-Gemini%20Flash-4285F4?style=flat-square&logo=google)
![Node.js](https://img.shields.io/badge/Node.js-18+-339933?style=flat-square&logo=node.js)
![License](https://img.shields.io/badge/License-MIT-6366f1?style=flat-square)

---

## 🚀 Quick Start

```bash
# 1. Clone & install
git clone <repo-url>
cd ai-code-explainer
npm install

# 2. Configure your API key
cp .env.example .env
# Edit .env and add your GEMINI_API_KEY or OPENAI_API_KEY

# 3. Start the server
npm start
# → http://localhost:3000
```

---

## ✨ Features

| Feature | Details |
|---|---|
| **Plain-English Explanation** | 2–4 sentence AI-generated summary of what the code does |
| **AST-Powered Highlights** | Server-side AST parsing extracts functions, loops, classes, imports |
| **Complexity Analysis** | Time & Space Big-O notation detected automatically |
| **Potential Issues** | Bugs, edge cases, and anti-patterns flagged by the AI |
| **History Sidebar** | All snippets saved locally — reload anytime |
| **Diff View (Bonus)** | Side-by-side comparison of original vs AI-optimized code |
| **Dual Language Support** | Python (regex AST) and JavaScript (Babel AST) |
| **Multi-Provider** | Plug in Gemini or OpenAI with a single env variable |

---

## 🏗️ System Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Browser (Frontend)                    │
│  HTML + Vanilla CSS + JS                                 │
│  • Highlight.js  (syntax highlighting)                   │
│  • diff2html     (side-by-side diff view)                │
│  • localStorage  (history persistence)                   │
└──────────────────────────┬──────────────────────────────┘
                           │  fetch() POST /api/explain
                           ▼
┌─────────────────────────────────────────────────────────┐
│                   Node.js + Express                      │
│  server.js                                               │
│  ┌──────────────────────┐  ┌──────────────────────────┐ │
│  │  lib/pythonAst.js    │  │  lib/javascriptAst.js    │ │
│  │  Regex-based parser  │  │  @babel/parser + traverse│ │
│  │  • Functions/Classes │  │  • Arrow/Async functions │ │
│  │  • Loops/Conditions  │  │  • Classes/Methods       │ │
│  │  • Imports/Decorators│  │  • Loops/Promise chains  │ │
│  └──────────┬───────────┘  └──────────────────────────┘ │
│             │  AST annotations                           │
│             ▼                                            │
│  ┌──────────────────────────────────────────────────┐   │
│  │           Prompt Engineering Layer               │   │
│  │  • Injects AST context into system prompt        │   │
│  │  • Requests structured JSON response             │   │
│  │  • Controls temperature (0.2) for accuracy       │   │
│  └──────────────────────────────────────────────────┘   │
└──────────────────────────┬──────────────────────────────┘
                           │
              ┌────────────┴────────────┐
              │                         │
              ▼                         ▼
   ┌──────────────────┐    ┌──────────────────────┐
   │  Google Gemini   │    │  OpenAI GPT-4o-mini  │
   │  gemini-2.0-flash│    │  (alternative)        │
   └──────────────────┘    └──────────────────────┘
```

---

## 🤖 AI Tool Selection & Reasoning

### Primary: Google Gemini Flash (`gemini-2.0-flash`)

**Why Gemini Flash?**
- **Free tier** with generous limits — ideal for demos and development
- **Excellent code understanding** — trained on massive code corpora
- **Fast** — sub-2s typical response times
- **Reliable JSON output** — follows structured prompts precisely

### Alternative: OpenAI `gpt-4o-mini`

Switch by setting `AI_PROVIDER=openai` in `.env`. Uses the `response_format: json_object` parameter for guaranteed JSON responses.

---

## 🌳 AST Parsing (Bonus Feature)

### JavaScript — `@babel/parser` + `@babel/traverse`
Full AST traversal using Babel's production-grade parser. Detects:
- Named/anonymous/arrow/async functions
- Classes and their methods (including constructors)
- All loop types (for, for-in, for-of, while, do-while)
- Conditionals, switch statements, try/catch
- Import/export declarations
- Promise chains (`.then`, `.catch`, `.finally`)
- Array methods (`.map`, `.filter`, `.reduce`)
- `await` expressions

### Python — Regex-based Parser (`lib/pythonAst.js`)
Pattern-matching approach (no external Python runtime required):
- `def` / `async def` functions
- `class` definitions
- `for` / `while` / `with` statements
- `import` / `from ... import`
- Decorators (`@decorator`)
- Constants (UPPER_CASE patterns)
- `lambda`, `yield`, `return` statements

---

## 🛡️ Hallucination Handling

**How we mitigate hallucinations:**

1. **Low temperature (0.2)** — Reduces creative randomness in AI responses
2. **Structured JSON schema** — AI must return a specific schema; deviations are caught by the parser
3. **Confidence note field** — LLM explicitly states uncertainty in its `confidenceNote` field
4. **Potential issues field** — LLM flags its own concerns about edge cases
5. **AST ground truth** — Structural elements (functions, classes, line numbers) come from the actual parser, not the LLM
6. **User transparency** — Confidence note shown directly in the UI so users know to verify

---

## 📁 Project Structure

```
AI-Powered Code Explainer/
├── server.js               ← Express API server
├── package.json
├── .env.example            ← Copy to .env and add API key
├── README.md
├── lib/
│   ├── pythonAst.js        ← Python regex AST parser
│   └── javascriptAst.js    ← JS Babel AST parser
└── public/
    ├── index.html          ← Single-page app shell
    ├── css/
    │   └── styles.css      ← Dark glassmorphism theme
    └── js/
        └── app.js          ← Frontend logic
```

---

## 🔑 Environment Variables

| Variable | Default | Description |
|---|---|---|
| `GEMINI_API_KEY` | — | Google AI Studio API key |
| `OPENAI_API_KEY` | — | OpenAI API key (alternative) |
| `AI_PROVIDER` | `gemini` | `"gemini"` or `"openai"` |
| `PORT` | `3000` | Server port |

Get a free Gemini API key at [Google AI Studio](https://aistudio.google.com/app/apikey).

---

## 🧩 API Endpoints

### `POST /api/explain`
```json
{ "code": "...", "language": "python|javascript" }
```
Returns: explanation, keyHighlights, complexity, optimizedCode, potentialIssues, confidenceNote, astAnnotations

### `POST /api/optimize`
```json
{ "code": "...", "language": "python|javascript" }
```
Returns: same schema, focused on optimized code and diff

### `GET /api/health`
Returns provider status and timestamp.
