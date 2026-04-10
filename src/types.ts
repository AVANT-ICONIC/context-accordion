// context-accordion - core types

export type TierLevel = 'identity' | 'task' | 'goal' | 'repo' | 'handoff' | 'experience' | 'archive'

export interface AccordionPacketMetadata {
  source: string
  whySelected: string
  score?: number
}

export interface AccordionPacket {
  id: string
  tier: TierLevel
  priority: number      // higher = kept first when budget is tight
  maxTokens: number
  content: string
  summary: string       // compact version - shown when tier is collapsed
  expanded: boolean     // whether full content is loaded
  createdAt: Date
  metadata?: AccordionPacketMetadata
}

export interface AccordionTraceEntry {
  timestamp: Date
  stage: 'plan' | 'compose' | 'expand' | 'budget'
  action: 'selected' | 'cached' | 'skipped' | 'expanded' | 'dropped' | 'truncated'
  tier: TierLevel
  packetId?: string
  source: string
  reason: string
  tokenEstimate?: number
  score?: number
  query?: string
  priority?: number
  scope?: string
}

export interface AccordionBundle {
  agentId: string
  taskId?: string
  sessionId: string
  packets: AccordionPacket[]
  totalTokens: number
  maxTokens: number
  expansionLog: ExpansionEvent[]
  trace: AccordionTraceEntry[]
}

export interface ExpansionEvent {
  tier: TierLevel
  reason: string
  tokensAdded: number
  timestamp: Date
}

export interface AgentConfig {
  id: string
  identity: string                // L0 - who the agent is
  experiencePath?: string         // L2 - path to experience.md file
  maxTokens?: number              // token budget for this agent
}

export interface TaskContext {
  id: string
  title: string
  description?: string
  priority?: string
  type?: string
  owner?: string
  projectId?: string
  requirements?: string[]
  goal?: GoalContext
  repo?: RepoContext
  handoff?: HandoffContext
}

export interface GoalContext {
  id: string
  title: string
  description?: string
  progress?: number
  status?: string
}

export interface RepoContext {
  name: string
  path: string
  description?: string
  techStack?: string[]
  mainFiles?: string[]
}

export interface HandoffContext {
  fromAgent: string
  previousWork?: string
  notes?: string
  percentageComplete?: number
}

export interface ComposeOptions {
  maxTokens?: number
  includePriorTasks?: boolean     // triggers L3 archive retrieval
  priorTaskLimit?: number         // how many prior tasks to retrieve (default: 3)
  archiveScope?: ArchiveScope
}

export type RetrievalIntentTarget = 'experience' | 'archive'

export type ArchiveScopeVisibility = 'global' | 'agent' | 'project'

export interface ArchiveScope {
  visibility: ArchiveScopeVisibility
  agentId?: string
  projectId?: string
}

export interface RetrievalIntent {
  target: RetrievalIntentTarget
  query: string
  priority: number
  reason: string
  limit?: number
  scope?: ArchiveScope
}

export interface SearchComposeOptions extends ComposeOptions {
  retrievalIntents?: RetrievalIntent[]
}

export type WakeupFormat = 'plain' | 'markdown' | 'system-prompt'

export interface WakeupOptions {
  format?: WakeupFormat
  maxTokens?: number
  includeTraceSummary?: boolean
}

export interface EmbeddingProvider {
  embed(text: string): Promise<number[]>
}

export interface VectorStoreConfig {
  url: string
  collection?: string             // default: 'tasks'
  vectorSize?: number             // default: 1536
}

/**
 * Tokenizer function type for custom token estimation.
 * Returns the estimated token count for the given text.
 */
export type Tokenizer = (text: string) => number

export interface AccordionConfig {
  maxTokens?: number              // global default (default: 8000)
  cacheTtl?: number               // ms (default: 300_000 = 5 min)
  cacheMaxSize?: number           // max static cache entries (default: 1000)
  vectorStore?: VectorStoreConfig
  embeddingProvider?: EmbeddingProvider
  onExpand?: (event: ExpansionEvent) => void
  /**
   * Custom tokenizer for token estimation.
   * Defaults to character-based approximation (4 chars = 1 token).
   */
  tokenizer?: Tokenizer
}

export interface IndexTaskOptions {
  taskId: string
  content: string
  metadata?: Record<string, unknown>
  scope?: ArchiveScope
}

export interface ExpandOptions {
  tier: TierLevel
  reason: string
  limit?: number           // for archive tier: how many results
  experiencePath?: string  // for experience tier: path to experience.md
}
