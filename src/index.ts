/**
 * @file context-accordion - Public API entry point
 *
 * Alpha status:
 * This package is in alpha status (version 0.x.x). The API may change in
 * breaking ways between minor releases until we reach 1.0.0 stability.
 *
 * For Harbor integration stability, pin to a specific version tag.
 *
 * Public API surface:
 *
 * Stable (recommended for use):
 * - `AccordionComposer` - Main composition class, including planned retrieval and wake-up helpers
 * - `accordionTraceToMarkdown` - Debug renderer for bundle trace output
 * - Types: AccordionBundle, AccordionPacket, AgentConfig, TaskContext, RetrievalIntent, etc.
 * - `OllamaEmbedding`, `OpenAIEmbedding` - Embedding providers
 *
 * Alpha (may change without notice):
 * - `enforceBudget`, `estimateTokens`, `TIER_PRIORITY` - Budget utilities
 * - `distill` - Experience distillation module
 *
 * Internal (do not use directly):
 * - Private methods on AccordionComposer
 * - Static cache state (`AccordionComposer.cache`)
 * - Unexported types and functions
 *
 * Wrapper boundary - Framework integration:
 *
 * Framework adapters are the official integration boundary for external
 * frameworks and Harbor consumers. Use these instead of manually processing
 * `AccordionBundle`.
 *
 * | Subpath | Export | Purpose |
 * |---------|--------|---------|
 * | `context-accordion/ai-sdk` | `accordionSystemPrompt(bundle)` | Renders bundle for Vercel AI SDK |
 * | `context-accordion/langchain` | `toDocuments(bundle)`, `toSystemMessage(bundle)` | LangChain integration |
 * | `context-accordion/distill` | `distill(options)` | Experience distillation |
 * | `context-accordion/embeddings` | `OllamaEmbedding`, `OpenAIEmbedding` | Embedding providers |
 *
 * The core `AccordionComposer` is framework-agnostic. Framework integrations
 * and Harbor wrappers must use these adapters rather than processing bundles
 * directly.
 *
 * Harbor integration rule: do not access `bundle.packets` directly. Use adapters.
 *
 * @packageDocumentation
 */

// context-accordion - public API
// Alpha release (0.x.x) - API may change in breaking ways until 1.0.0

export { AccordionComposer } from './composer'
export {
  /**
   * @alpha
   * Token budget enforcement. Enforces maxTokens by dropping or truncating
   * lower-priority packets. May change without notice until 1.0.0.
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
  AccordionPacketMetadata,
  AccordionTraceEntry,
  AgentConfig,
  ArchiveScope,
  ArchiveScopeVisibility,
  ComposeOptions,
  ExpandOptions,
  ExpansionEvent,
  EmbeddingProvider,
  RetrievalIntent,
  RetrievalIntentTarget,
  SearchComposeOptions,
  VectorStoreConfig,
  IndexTaskOptions,
  TaskContext,
  GoalContext,
  RepoContext,
  HandoffContext,
  TierLevel,
  WakeupFormat,
  WakeupOptions,
} from './types'

export { accordionTraceToMarkdown } from './trace'

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
