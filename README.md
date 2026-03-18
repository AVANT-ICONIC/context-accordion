<div align="center">

<img src="https://capsule-render.vercel.app/api?type=waving&height=250&color=0:000000,40:7f1d1d,75:ea580c,100:f59e0b&text=CONTEXT%20ACCORDION&fontColor=ffffff&fontSize=48&fontAlignY=35&desc=by%20HARBOR&descSize=15&descAlignY=52&animation=scaleIn" alt="Header" width="100%" />

<br />

<img src="https://readme-typing-svg.demolab.com?font=Inter&weight=600&size=22&pause=1200&color=f59e0B&center=true&vCenter=true&width=980&lines=Token-efficient,+layered+context+for+AI+agents.;Context+is+always+available+%E2%80%94+just+collapsed+by+default.;Four+memory+tiers:+Identity,+Session,+Experience,+Archive." alt="Typing SVG" />

<br />
<br />

<p align="center">
  <a href="#the-problem"><img src="https://img.shields.io/badge/the%20problem-7f1d1d?style=for-the-badge&logo=readme&logoColor=white" alt="The Problem" /></a>
  <a href="#the-solution"><img src="https://img.shields.io/badge/the%20solution-c2410c?style=for-the-badge&logo=lightbulb&logoColor=white" alt="The Solution" /></a>
  <a href="#quick-start"><img src="https://img.shields.io/badge/quick%20start-ea580c?style=for-the-badge&logo=rocket&logoColor=white" alt="Quick Start" /></a>
  <a href="#api"><img src="https://img.shields.io/badge/api-d97706?style=for-the-badge&logo=code&logoColor=white" alt="API" /></a>
  <a href="#adapters"><img src="https://img.shields.io/badge/adapters-f59e0b?style=for-the-badge&logo=plug&logoColor=white" alt="Adapters" /></a>
  <a href="#contributing"><img src="https://img.shields.io/badge/contributing-fbbf24?style=for-the-badge&logo=githubsponsors&logoColor=white" alt="Contributing" /></a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/TypeScript-5.0+-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Node.js-18+-339933?style=flat-square&logo=nodedotjs&logoColor=white" alt="Node.js" />
  <img src="https://img.shields.io/badge/License-MIT-f59e0b?style=flat-square&logo=opensourceinitiative&logoColor=white" alt="MIT" />
  <img src="https://img.shields.io/badge/version-0.1.0-f59e0b?style=flat-square" alt="version" />
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
  <a href="#api">API Reference</a>
  ·
  <a href="https://github.com/harbor-office/context-accordion/discussions">Discussions</a>
  ·
  <a href="https://github.com/harbor-office/context-accordion/issues">Issues</a>
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
| `vectorStore` | `object` | - | Qdrant config |
| `embeddingProvider` | `object` | - | Ollama or OpenAI |
| `onExpand` | `function` | - | Expansion event callback |

### Methods

- `compose(agent, task, options?)` — Build a bundle
- `expand(bundle, options)` — Expand a tier on-demand
- `render(bundle)` — Render to string
- `index(options)` — Store task in archive
- `clearSessionCache()` — Clear session cache

---

## License

MIT — see [LICENSE](./LICENSE)

---

## Built by AVANT-ICONIC

Built by [AVANT-ICONIC](https://avant-iconic.com). Inspired by the problem of agents drowning in context they didn't ask for.

---

<div align="center">

<strong>Context is always available — just collapsed by default.</strong>

<br />
<br />

<img src="https://capsule-render.vercel.app/api?type=waving&section=footer&height=130&color=0:f59e0b,50:ea580c,100:000000" alt="Footer" width="100%" />

</div>
