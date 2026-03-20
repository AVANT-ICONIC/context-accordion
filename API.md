# API Reference — Wrapper Boundary

> ⚠️ **Alpha Status**: This package is in alpha (0.x.x). API may change in breaking ways until 1.0.0.
> 
> **For Harbor integration stability:** Pin to a specific version tag (e.g., `0.1.0-alpha.1`) and use the official adapters documented below.

---

## Wrapper Boundary — Harbor Integration

The **wrapper boundary** defines the official integration points for Harbor consumers. All external integration MUST go through these adapters, not through direct manipulation of `AccordionBundle`.

```
┌─────────────────────────────────────────────────────────────────┐
│                        Harbor / External                        │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    FRAMEWORK ADAPTERS (✓)                       │
│  ┌─────────────┐ ┌──────────────┐ ┌─────────────┐ ┌───────────┐  │
│  │ ai-sdk      │ │ langchain    │ │ distill     │ │embeddings │  │
│  └─────────────┘ └──────────────┘ └─────────────┘ └───────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│               AccordionComposer (public API)                    │
│   compose() → expand() → render() → index()                     │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                  INTERNAL (Do not access)                        │
│   - bundle.packets directly                                     │
│   - Private methods                                             │
│   - Static cache                                               │
└─────────────────────────────────────────────────────────────────┘
```

**Harbor Integration Rule:** Never access `bundle.packets` directly. Always use the adapter functions.

---

## Stable Public API (Harbor Integration)

These exports are part of the stable public API and will follow semver:

### Core

```typescript
import { AccordionComposer } from 'context-accordion'
```

| Method | Description | Stability |
|--------|-------------|-----------|
| `new AccordionComposer(config?)` | Create a composer instance | Stable |
| `composer.compose(agent, task, options?)` | Build an accordion bundle | Stable |
| `composer.expand(bundle, options)` | Expand a tier on-demand | Stable |
| `composer.render(bundle)` | Render bundle to string | Stable |
| `composer.index(options)` | Index a task for archive retrieval | Stable |
| `composer.clearSessionCache()` | Clear session cache | Stable |

### Types

```typescript
import type {
  AccordionBundle,
  AccordionConfig,
  AccordionPacket,
  AgentConfig,
  ComposeOptions,
  ExpandOptions,
  ExpansionEvent,
  EmbeddingProvider,
  VectorStoreConfig,
  IndexTaskOptions,
  TaskContext,
  GoalContext,
  RepoContext,
  HandoffContext,
  TierLevel,
} from 'context-accordion'
```

All exported types are considered stable.

### Embedding Providers

```typescript
import { OllamaEmbedding, OpenAIEmbedding } from 'context-accordion'
import type { AnyEmbeddingProvider } from 'context-accordion'
```

---

## Stable Adapter APIs

### Vercel AI SDK

```typescript
import { accordionSystemPrompt } from 'context-accordion/ai-sdk'
```

| Export | Description | Stability |
|--------|-------------|-----------|
| `accordionSystemPrompt(bundle)` | Render bundle as system prompt | Stable |

### LangChain

```typescript
import { toDocuments, toSystemMessage } from 'context-accordion/langchain'
```

| Export | Description | Stability |
|--------|-------------|-----------|
| `toDocuments(bundle)` | Convert bundle to LangChain Documents | Stable |
| `toSystemMessage(bundle)` | Render bundle as system message string | Stable |

---

## Internal APIs (Do Not Use)

The following are exported for advanced use cases but may change without notice. **Harbor consumers should not use these:**

```typescript
import { enforceBudget, estimateTokens, TIER_PRIORITY } from 'context-accordion'
```

| Export | Purpose | Stability |
|--------|---------|-----------|
| `enforceBudget(packets, maxTokens)` | Token budget enforcement | `@alpha` — Internal |
| `estimateTokens(text)` | Token estimation | `@alpha` — Internal |
| `TIER_PRIORITY` | Priority mapping for tiers | `@alpha` — Internal |

### Experience Distillation

```typescript
import { distill } from 'context-accordion/distill'
import type { DistillOptions, DistillResult } from 'context-accordion/distill'
```

> ⚠️ The distillation module is experimental (`@alpha`). The interface may change without notice.

---

## Wrapper Boundary Pattern

The `AccordionComposer` is the primary wrapper boundary. All configuration flows through it:

```
User Code
    │
    ▼
AccordionComposer (public boundary)
    │
    ├── compose() → AccordionBundle
    ├── expand() → AccordionBundle  
    ├── render() → string
    ├── index() → void
    │
    └── Internal packet builders (private)
```

**Rule:** Only interact with `AccordionComposer` methods and exported types. Do not access private methods or internal implementation details.

---

## Alpha Considerations

Until version 1.0.0:
- Minor versions (0.x.0) may introduce breaking changes
- We will document breaking changes in CHANGELOG.md
- For production Harbor integration, pin to a specific version

---

## Error Handling

The public API handles errors gracefully:

| Method | Error Behavior |
|--------|---------------|
| `compose()` | Never throws; returns bundle with available tiers |
| `expand()` | Never throws; returns original bundle with logged event |
| `index()` | Silently skips if vector store not configured |
| `render()` | Never throws |

---

## Caching Behavior

The composer uses two cache layers:

1. **Static cache** (cross-instance): Identity and experience packets are cached by content hash
2. **Session cache** (per-instance): Expand results are cached within a session

Cache behavior is an implementation detail and may change. Use `clearSessionCache()` to reset session-level caching.

---

## Harbor Integration Guidelines

### Version Pinning

For production Harbor integrations, **always pin to a specific version**:

```json
{
  "dependencies": {
    "context-accordion": "0.1.0-alpha.1"
  }
}
```

Do not use `^` or `~` ranges for alpha versions.

### Adapter-First Pattern

Always use adapters for framework integration:

| Framework | Adapter | Usage |
|-----------|---------|-------|
| Vercel AI SDK | `context-accordion/ai-sdk` | `accordionSystemPrompt(bundle)` |
| LangChain | `context-accordion/langchain` | `toDocuments(bundle)` or `toSystemMessage(bundle)` |

### What NOT To Do

```typescript
// ❌ DON'T: Access packets directly
const content = bundle.packets.map(p => p.content).join('\n')

// ✅ DO: Use the adapter
import { accordionSystemPrompt } from 'context-accordion/ai-sdk'
const content = accordionSystemPrompt(bundle)
```

```typescript
// ❌ DON'T: Process bundles manually in Harbor wrapper
const tier = bundle.packets.find(p => p.tier === 'task')

// ✅ DO: Use the adapter functions
import { toDocuments } from 'context-accordion/langchain'
const docs = toDocuments(bundle)
```

### Error Handling Guarantees

The public API methods never throw:

| Method | Guarantee |
|--------|-----------|
| `compose()` | Returns bundle with available tiers; never throws |
| `expand()` | Returns original bundle if expansion fails; logs event |
| `render()` | Returns string; never throws |
| `index()` | Silently skips if vector store not configured |
