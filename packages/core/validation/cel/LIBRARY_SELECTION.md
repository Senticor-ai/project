# JavaScript CEL Library Selection

**Date**: 2026-02-24
**Subtask**: subtask-5-1
**Decision**: Use `@marcbachmann/cel-js` for CEL evaluation in the TypeScript/JavaScript CLI

---

## Selected Library: @marcbachmann/cel-js

**npm Package**: `@marcbachmann/cel-js`
**Repository**: https://github.com/marcbachmann/cel-js
**License**: MIT

### Key Features

- ✅ **Zero dependencies** - Better security, smaller bundle
- ✅ **High performance** - 10-22x faster evaluation than alternatives
- ✅ **Type-safe Environment API** - Matches backend cel-python pattern
- ✅ **Full TypeScript support** - Native type definitions
- ✅ **ES Modules** - Tree-shaking support for optimal bundle size
- ✅ **Async function support** - Future-proof for async validation
- ✅ **Custom functions/operators** - Can match backend CEL capabilities

### API Comparison with Backend

| Backend (Python) | Frontend (JavaScript) | Purpose |
|-----------------|---------------------|---------|
| `celpy.Environment()` | `new Environment()` | Create evaluation context |
| `env.compile(expression)` | `env.check(expression)` | Validate expression |
| `program.evaluate(context)` | `env.evaluate(expr, context)` | Execute with variables |

---

## Evaluation Pattern

### Basic Usage

```typescript
import { Environment } from '@marcbachmann/cel-js'

// Initialize environment once at module load
const env = new Environment()
  .registerVariable('bucket', 'string')
  .registerVariable('operation', 'string')
  .registerVariable('source', 'map')
  .registerVariable('target', 'map')

// Evaluate with context (reusable)
function evaluateRule(expression: string, context: Record<string, unknown>): boolean {
  try {
    const result = env.evaluate(expression, context)
    return Boolean(result)
  } catch (error) {
    console.error(`CEL evaluation error: ${error}`)
    return false // Fail-safe
  }
}

// Example: triage.inbox.targets rule
const context = {
  operation: 'triage',
  source: { bucket: 'inbox' },
  target: { bucket: 'processed' }
}

const isValid = evaluateRule(
  'operation == "triage" && source.bucket == "inbox" && target.bucket in ["processed", "project"]',
  context
)
```

### Advanced Pattern with Rule Loading

```typescript
import { Environment } from '@marcbachmann/cel-js'
import { readFileSync } from 'fs'
import { join } from 'path'

interface CelRule {
  id: string
  expression: string
  errorCode: string
  message: string
  appliesWhen?: string
}

// Load and validate rules at startup
const env = new Environment({
  unlistedVariablesAreDyn: false, // Strict: all vars must be registered
  enableOptionalTypes: true
})
  .registerVariable('bucket', 'string')
  .registerVariable('operation', 'string')
  .registerVariable('source', 'map')
  .registerVariable('target', 'map')

const rulesPath = join(__dirname, 'rules.json')
const rulesData = JSON.parse(readFileSync(rulesPath, 'utf-8'))
const rules: CelRule[] = rulesData.rules

// Validate rules compile successfully
rules.forEach(rule => {
  try {
    env.check(rule.expression)
  } catch (error) {
    throw new Error(`Invalid CEL rule ${rule.id}: ${error}`)
  }
})

// Evaluation function returning violations
interface ValidationIssue {
  source: 'cel'
  code: string
  message: string
  field: string | null
  rule: string
}

export function evaluateCelRules(context: Record<string, unknown>): ValidationIssue[] {
  const issues: ValidationIssue[] = []

  for (const rule of rules) {
    try {
      // Check if rule applies
      if (rule.appliesWhen) {
        const applies = env.evaluate(rule.appliesWhen, context)
        if (!applies) continue
      }

      // Evaluate rule
      const result = env.evaluate(rule.expression, context)

      // Violation if result is false
      if (!result) {
        issues.push({
          source: 'cel',
          code: rule.errorCode,
          message: rule.message,
          field: null,
          rule: rule.id
        })
      }
    } catch (error) {
      // Fail-safe: treat errors as violations
      issues.push({
        source: 'cel',
        code: 'CEL_EVALUATION_ERROR',
        message: `Rule ${rule.id} evaluation failed: ${error}`,
        field: null,
        rule: rule.id
      })
    }
  }

  return issues
}
```

### Integration with Validation Pipeline

```typescript
import { evaluateCelRules } from './validation/cel/evaluator'
import { validateWithShacl } from './validation/shacl/validator'

export function validateItemCreate(item: Record<string, unknown>) {
  // Step 1: SHACL validation (schema)
  const shaclIssues = validateWithShacl(item, true) // abort_on_first=true
  if (shaclIssues.length > 0) {
    return shaclIssues // Fail fast
  }

  // Step 2: CEL validation (business rules)
  const context = {
    operation: 'create',
    bucket: item['app:bucket'] || 'inbox'
  }
  const celIssues = evaluateCelRules(context)
  return celIssues
}
```

---

## Alternatives Considered

### cel-js (ChromeGG/cel-js)
- Built on Chevrotain parser
- 20,852 weekly downloads
- ❌ Known limitation: error messages differ from cel-go
- ❌ Less sophisticated API (just evaluate/parse)
- ❌ No type-safe environment

### @gresb/cel-javascript
- Built with ANTLR4
- Good timestamp handling
- ❌ Less documentation
- ❌ Fewer features
- ❌ Less active development

---

## Installation

```bash
cd packages/core
npm install @marcbachmann/cel-js
```

Add to `packages/core/package.json`:

```json
{
  "dependencies": {
    "@marcbachmann/cel-js": "^1.0.0"
  }
}
```

---

## Type Safety Benefits

The Environment API provides compile-time and runtime type checking:

```typescript
const env = new Environment()
  .registerVariable('age', 'int')

// Runtime type error
env.evaluate('age > 18', { age: '25' })
// Error: expected int, got string

// Compile-time type checking
env.check('age > "18"')
// Error: cannot compare int with string
```

---

## Performance Considerations

- **Initialize Once**: Create `Environment` at module load, not per-request
- **Reuse**: Call `env.evaluate()` with different contexts
- **Caching**: Library internally caches parsed ASTs
- **Fail-Fast**: For CLI, stop at first violation (matches `abort_on_first`)

---

## Security

- Zero dependencies = smaller attack surface
- CEL is non-Turing complete (no loops) = no DoS risk
- Expression complexity limits configurable via `limits` option
- No `eval()` or dynamic code execution

---

## Sources

- [@marcbachmann/cel-js npm](https://www.npmjs.com/package/@marcbachmann/cel-js)
- [marcbachmann/cel-js GitHub](https://github.com/marcbachmann/cel-js)
- [cel-js npm](https://www.npmjs.com/package/cel-js)
- [@gresb/cel-javascript npm](https://www.npmjs.com/package/@gresb/cel-javascript)
- [CEL Official Documentation](https://cel.dev/)
