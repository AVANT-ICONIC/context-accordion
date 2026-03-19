/**
 * @file context-accordion — Public API entry point
 * 
 * ## ⚠️ Alpha Status
 * This package is in **alpha** status (version 0.x.x). The API may change in 
 * breaking ways between minor releases until we reach 1.0.0 stability.
 * 
 * For Harbor integration stability, pin to a specific version tag.
 * 
 * ## Public API Surface
 * 
 * ### Stable (recommended for use)
 * - `AccordionComposer` — Main composition class
 * - Types: AccordionBundle, AccordionPacket, AgentConfig, TaskContext, etc.
 * - `OllamaEmbedding`, `OpenAIEmbedding` — Embedding providers
 * 
 * ### Alpha (may change without notice)
 * - `enforceBudget`, `estimateTokens`, `TIER_PRIORITY` — Budget utilities
 * - `distill` — Experience distillation module
 * 
 * ### Internal (do not use directly)
 * - Private methods on AccordionComposer
 * - Static cache state (`AccordionComposer.cache`)
 * - Unexported types and functions
 * 
 * ## Wrapper Boundary — Framework Integration
 * 
 * Framework adapters are the **official integration boundary** for external 
 * frameworks. Use these instead of manually processing AccordionBundle:
 * 
 * | Subpath | Purpose |
 * |---------|---------|
 * | `context-accordion/ai-sdk` | Renders bundle for Vercel AI SDK (`accordionSystemPrompt`) |
 * | `context-accordion/langchain` | Converts to LangChain Documents (`toDocuments`, `toSystemMessage`) |
 * | `context-accordion/distill` | Experience distillation from failed runs |
 * | `context-accordion/embeddings` | Embedding providers (OllamaEmbedding, OpenAIEmbedding) |
 * 
 * The core `AccordionComposer` is framework-agnostic. Framework integrations 
 * should use these adapters rather than processing bundles directly.
 * 
 * @packageDocumentation
 */

// context-accordion — public API
// Alpha release (0.x.x) — API may change in breaking ways until 1.0.0

export { AccordionComposer } from './composer'
export {
  /**
   * @alpha
   * Token budget enforcement. Enforces maxTokens by dropping/truncating lower-priority packets.
   * May change without notice until 1.0.0.
   */
  enforceBudget,
  /**
   * @alpha
   * Token estimation using character-based approximation (4 chars = 1 token).
   * May change without notice until 1.0.0.
   */
  estimateTokens,
  /**
   * @alpha
   * Tier priority mapping for budget enforcement. Higher = kept first.
   * May change without notice until 1.0.0.
   */
  TIER_PRIORITY,
} from './budget'
export type {
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
} from './types'

export { OllamaEmbedding, OpenAIEmbedding } from './embeddings'
export type { AnyEmbeddingProvider } from './embeddings'

export {
  /**
   * @alpha
   * Experimental: Experience distillation module. Interface may change.
   */
  distill,
} from './distill'
export type { DistillOptions } from './distill'
