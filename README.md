<div align="center">

<img src="https://capsule-render.vercel.app/api?type=waving&height=250&color=0:000000,40:7f1d1d,75:ea580c,100:f59e0b&text=CONTEXT%20ACCORDION&fontColor=ffffff&fontSize=48&fontAlignY=35&desc=by%20AVANT-ICONIC&descSize=15&descAlignY=52&animation=scaleIn" alt="Header" width="100%" />

<br />

<img src="https://readme-typing-svg.demolab.com?font=Inter&weight=600&size=22&pause=1200&color=f59e0B&center=true&vCenter=true&width=980&lines=Token-efficient,+layered+context+for+AI+agents.;Context+is+always+available+%E2%80%94+just+collapsed+by+default.;Four+memory+tiers:+Identity,+Session,+Experience,+Archive." alt="Typing SVG" />

<br />
<br />

<p align="center">
  <a href="#the-problem"><img src="https://img.shields.io/badge/the%20problem-7f1d1d?style=for-the-badge&logo=readme&logoColor=white" alt="The Problem" /></a>
  <a href="#the-solution-context-accordion"><img src="https://img.shields.io/badge/the%20solution-c2410c?style=for-the-badge&logo=lightbulb&logoColor=white" alt="The Solution" /></a>
  <a href="#quick-start"><img src="https://img.shields.io/badge/quick%20start-ea580c?style=for-the-badge&logo=rocket&logoColor=white" alt="Quick Start" /></a>
  <a href="#api-reference"><img src="https://img.shields.io/badge/api-d97706?style=for-the-badge&logo=code&logoColor=white" alt="API" /></a>
  <a href="#framework-adapters"><img src="https://img.shields.io/badge/adapters-f59e0b?style=for-the-badge&logo=plug&logoColor=white" alt="Adapters" /></a>
  <a href="#contributing"><img src="https://img.shields.io/badge/contributing-fbbf24?style=for-the-badge&logo=githubsponsors&logoColor=white" alt="Contributing" /></a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/TypeScript-5.0+-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Node.js-18+-339933?style=flat-square&logo=nodedotjs&logoColor=white" alt="Node.js" />
  <img src="https://img.shields.io/badge/License-MIT-f59e0b?style=flat-square&logo=opensourceinitiative&logoColor=white" alt="MIT" />
  <img src="https://img.shields.io/badge/version-0.1.0--alpha-f59e0b?style=flat-square" alt="version" />
  <img src="https://img.shields.io/badge/status-alpha-red?style=flat-square" alt="alpha" />
</p>

<p align="center">
  <strong>context-accordion</strong> gives AI agents token-efficient, layered context delivery.<br />
  Context is always available — just collapsed by default. Like an accordion: all the notes exist, you only press the ones you need.
</p>

<p align="center">
  <a href="#installation">Installation</a>
  ·
  <a href="#quick-start">Quick Start</a>
  ·
  <a href="#api-reference">API Reference</a>
  ·
  <a href="https://github.com/AVANT-ICONIC/context-accordion/discussions">Discussions</a>
  ·
  <a href="https://github.com/AVANT-ICONIC/context-accordion/issues">Issues</a>
</p>

</div>

---

## The Problem
Every AI agent framework today does one of two things:

1. **Dump everything** — shove the full history, full codebase, full goal tree into every prompt. Expensive, slow, hits context limits fast.
2. **Summarize and forget** — compress context down to a summary and throw away the original. Cheap, but the agent can never go deeper when it needs to.

Both are wrong. The full content should never be discarded — it should be *collapsed*, retrievable on demand.

---

## The Solution: Context Accordion

Four memory tiers. Each tier is always available but only loaded when needed:

```
L0  Identity       — always loaded    ~500 tokens    who am I, what can I do
L1  Session        — always loaded    ~2000 tokens   what am I doing right now
L2  Experience     — loaded on start  ~1000 tokens   what have I learned before
L3  Archive        — retrieved        ~1500 tokens   what happened in similar past runs
```

With the Accordion, you start at ~500 tokens (L0+L1) vs ~5000+ for a naive dump. The agent expands tiers on-demand, typically adding 500-2000 tokens when needed.

---

## ⚠️ Alpha Status

This package is in **alpha** status. The API may change in breaking ways between minor versions (0.x.x) until we reach 1.0.0 stability.

**Breaking changes policy:**
- We will document breaking changes in [CHANGELOG.md](./CHANGELOG.md)
- For Harbor integration stability, pin to a specific version tag

---

## Public API Surface

The public API is exported from the main entry point and subpath exports.

### Stable (recommended)
| Export | Description |
|--------|-------------|
| `AccordionComposer` | Main class for context composition and planned retrieval |
| `accordionTraceToMarkdown` | Debug renderer for bundle trace output |
| `OllamaEmbedding`, `OpenAIEmbedding` | Embedding providers |
| Types (AccordionBundle, AccordionPacket, AgentConfig, TaskContext, RetrievalIntent, ArchiveScope, WakeupOptions, etc.) | TypeScript interfaces |

### Alpha (may change until 1.0.0)
| Export | Description |
|--------|-------------|
| `estimateTokens`, `enforceBudget`, `TIER_PRIORITY` | Budget utilities |
| `distill` | Experience distillation helper |

These helpers intentionally remain alpha until `1.0.0` because token accounting and lifecycle automation are still evolving.
All other exports listed in the stable table above are the supported public surface for the alpha series.

### Wrapper Boundary — Framework Integration

Framework adapters are the **official integration boundary** for external frameworks. 
Use these instead of manually processing `AccordionBundle`:

| Subpath | Export | Purpose |
|---------|--------|---------|
| `context-accordion/ai-sdk` | `accordionSystemPrompt(bundle)` | Renders bundle as system prompt for Vercel AI SDK |
| `context-accordion/langchain` | `toDocuments(bundle)` | Converts bundle to LangChain Documents |
| `context-accordion/langchain` | `toSystemMessage(bundle)` | Renders bundle as single string for system message |

**Why use adapters?** They handle framework-specific formatting and are the 
officially supported integration points. The core `AccordionComposer` is 
framework-agnostic — adapters translate between the abstract bundle format 
and your framework of choice.

For Harbor integration, use these adapters rather than processing bundles directly.

### Internal (Not for Direct Use)

The following are internal implementation details — do not rely on them:
- Private methods on `AccordionComposer` (e.g., `buildIdentityPacket`, `retrieveArchive`)
- Static cache state (`AccordionComposer.cache`) — shared across instances
- Internal type definitions not exported from index.ts
- Budget utilities (`enforceBudget`, `estimateTokens`, `TIER_PRIORITY`) — marked as `@alpha`

**Harbor consumers:** Pin to specific version tags and use the wrapper adapters 
for framework integration.

---

## Installation

```bash
npm install context-accordion
```

---

## Quick Start

```typescript
import { AccordionComposer } from 'context-accordion'

const composer = new AccordionComposer({
  maxTokens: 8000,
  vectorStore: {
    url: process.env.QDRANT_URL, // optional — enables L3 archive tier
  },
})

// Compose context for an agent run
const bundle = await composer.compose(
  {
    id: 'builder',
    identity: 'You are a senior software engineer. You write clean, tested code.',
    experiencePath: './agents/builder/experience.md', // L2 — learned lessons
  },
  {
    id: 'issue-123',
    title: 'Fix authentication bug in login flow',
    description: 'Users are getting logged out after 5 minutes...',
    priority: 'high',
    type: 'bug',
  },
  {
    includePriorTasks: true, // triggers L3 semantic retrieval
  },
)

// bundle.packets — ordered, budget-enforced context packets
// bundle.totalTokens — actual token usage
// bundle.maxTokens — budget ceiling

// Render to a prompt string
const prompt = composer.render(bundle)
```

### Planned Retrieval

Use `searchAndCompose()` when you want a traceable retrieval plan before loading optional tiers:

```typescript
import { AccordionComposer, accordionTraceToMarkdown } from 'context-accordion'

const composer = new AccordionComposer({
  vectorStore: {
    url: process.env.QDRANT_URL,
  },
})

const intents = composer.planRetrieval(
  {
    id: 'builder',
    identity: 'You are a senior software engineer.',
    experiencePath: './agents/builder/experience.md',
  },
  {
    id: 'issue-123',
    title: 'Fix authentication bug in login flow',
    description: 'Users are getting logged out after 5 minutes...',
  },
  {
    includePriorTasks: true,
    priorTaskLimit: 2,
  },
)

const plannedBundle = await composer.searchAndCompose(
  {
    id: 'builder',
    identity: 'You are a senior software engineer.',
    experiencePath: './agents/builder/experience.md',
  },
  {
    id: 'issue-123',
    title: 'Fix authentication bug in login flow',
    description: 'Users are getting logged out after 5 minutes...',
  },
  {
    retrievalIntents: intents,
  },
)

console.log(accordionTraceToMarkdown(plannedBundle))
```

Planner traces include the retrieval query and priority, and archive retrieval also records per-match trace entries.

### Wake-Up Prompt

Use `generateWakeup()` to resume from a bundle with a compact bootstrap prompt:

```typescript
const wakeup = composer.generateWakeup(plannedBundle, {
  format: 'system-prompt',
  maxTokens: 1200,
  includeTraceSummary: true,
})
```

This keeps identity and task detail, compresses the rest to summaries, and can optionally include recent retrieval and budget decisions.

### Scoped Archive Memory

Archive indexing and retrieval can be partitioned by scope:

```typescript
await composer.index({
  taskId: 'task-123',
  content: 'Resolved the auth-platform forced logout regression.',
  scope: {
    visibility: 'project',
    projectId: 'auth-platform',
  },
})

const scopedBundle = await composer.searchAndCompose(agent, task, {
  includePriorTasks: true,
  archiveScope: {
    visibility: 'project',
    projectId: 'auth-platform',
  },
})
```

Supported scopes are `global`, `agent`, and `project`.

---

## Accordion Expansion (On-Demand Retrieval)

The agent can request deeper context mid-run:

```typescript
// Expand a specific tier during a run
const expanded = await composer.expand(bundle, {
  tier: 'archive',       // L3 — pull from vector store
  reason: 'Need to check how similar auth bugs were fixed before',
  limit: 5,
})

// Or expand experience tier
const withExperience = await composer.expand(bundle, {
  tier: 'experience',    // L2 — load full experience.md
  experiencePath: './agents/builder/experience.md', // required for experience tier
})
```

All expansion events are logged so you can see exactly what context the agent actually needed.

---

## Token Budget Enforcement

The composer enforces a token budget by dropping lower-priority packets first:

- **Identity** (priority 100) — never dropped
- **Handoff** (priority 90) — agent-to-agent continuity
- **Experience** (priority 85) — learned lessons
- **Task** (priority 80) — never dropped
- **Goal** (priority 70) — broader objective
- **Repo** (priority 60) — codebase context
- **Archive** (priority 50) — prior similar tasks

When budget is exceeded, lower-priority packets are dropped. If partial space remains (200+ tokens), packets are truncated rather than dropped.

---

## Vector Store (L3 Archive)

Store completed tasks for semantic retrieval:

```typescript
// After task completion, index the run
await composer.index({
  taskId: 'issue-123',
  content: 'Fixed authentication bug by...',
  metadata: { type: 'bug', resolution: 'fixed' },
})

// Retrieval happens automatically during compose() when includePriorTasks: true
```

Qdrant is optional. If `vectorStore` is not configured, L3 is silently skipped.

---

## Embedding Providers

For L3 archive retrieval, configure an embedding provider:

```typescript
import { AccordionComposer, OllamaEmbedding } from 'context-accordion'

const composer = new AccordionComposer({
  maxTokens: 8000,
  vectorStore: { url: 'http://localhost:6333' },
  embeddingProvider: new OllamaEmbedding(), // or new OpenAIEmbedding()
})
```

---

## Framework Adapters

Works with any agent framework:

### Vercel AI SDK

```typescript
import { accordionSystemPrompt } from 'context-accordion/ai-sdk'

const { text } = await generateText({
  model: openai('gpt-4o'),
  system: accordionSystemPrompt(bundle),
  prompt: userMessage,
})
```

### LangChain

```typescript
import { toDocuments, toSystemMessage } from 'context-accordion/langchain'

const docs = toDocuments(bundle)
// Use with LangChain's RetrievalQAChain

const systemMessage = toSystemMessage(bundle)
// Use as SystemMessage in chat chains
```

---

## API Reference

### AccordionComposer

```typescript
new AccordionComposer(config?)
```

**Config:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `maxTokens` | `number` | `8000` | Default token budget |
| `cacheTtl` | `number` | `300000` | Static cache TTL in ms |
| `cacheMaxSize` | `number` | `1000` | Max shared cache entries before eviction |
| `vectorStore` | `object` | - | Qdrant config |
| `embeddingProvider` | `object` | - | Ollama or OpenAI |
| `tokenizer` | `function` | - | Custom token estimator for budgeting |
| `onExpand` | `function` | - | Expansion event callback |

### Methods

- `compose(agent, task, options?)` — Build a bundle
- `expand(bundle, options)` — Expand a tier on-demand
- `render(bundle)` — Render to string
- `index(options)` — Store task in archive
- `clearSessionCache()` — Clear session cache

Additional runtime helpers:

- `AccordionComposer.clearGlobalCache()` - Clear the shared static cache
- `accordionTraceToMarkdown(bundle)` - Render trace/debug output as markdown

### Bundle Observability

Every composed bundle now includes:

- `bundle.trace` - selection, cache, expand, and budget events
- `packet.metadata` - packet source, selection reason, and optional score

---

## Contributing

PRs and issues welcome. Please open an [issue](https://github.com/AVANT-ICONIC/context-accordion/issues) before sending a large PR so we can align on direction.

```bash
git clone https://github.com/AVANT-ICONIC/context-accordion.git
cd context-accordion
npm install
npm run verify
```

### Release Flow

- CI runs `npm run verify` on pushes and pull requests.
- Manual publishes use the `Release` GitHub Actions workflow.
- Pre-release versions such as `0.1.0-alpha.1` must publish with the `alpha` or `beta` dist-tag, not `latest`.

---

## License

MIT — see [LICENSE](./LICENSE)

---

Built by [AVANT-ICONIC](https://avant-iconic.com). Inspired by the problem of agents drowning in context they didn't ask for.

---

<div align="center">

<strong>Context is always available — just collapsed by default.</strong>

<br />
<br />

<img src="https://capsule-render.vercel.app/api?type=waving&section=footer&height=130&color=0:f59e0b,50:ea580c,100:000000" alt="Footer" width="100%" />

</div>


