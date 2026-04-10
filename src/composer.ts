// context-accordion — AccordionComposer
// Main entry point. Framework-agnostic, zero required dependencies.

import { v4 as uuid } from 'uuid'
import { promises as fs } from 'fs'
import { enforceBudget, estimateTokens, TIER_PRIORITY } from './budget'
import type {
  AccordionBundle,
  AccordionConfig,
  AccordionPacket,
  AccordionTraceEntry,
  AgentConfig,
  ComposeOptions,
  ExpandOptions,
  ExpansionEvent,
  GoalContext,
  HandoffContext,
  IndexTaskOptions,
  RetrievalIntent,
  RepoContext,
  SearchComposeOptions,
  TaskContext,
  TierLevel,
} from './types'

const DEFAULT_MAX_TOKENS = 8000
const DEFAULT_CACHE_TTL = 1000 * 60 * 5 // 5 minutes
const DEFAULT_CACHE_MAX_SIZE = 1000
const DEFAULT_AGENT_ID = 'unknown-agent'
const DEFAULT_AGENT_IDENTITY = 'You are an AI agent.'
const DEFAULT_TASK_ID = 'unknown-task'
const DEFAULT_TASK_TITLE = 'Untitled task'

interface ComposeInput {
  normalizedAgent: AgentConfig
  normalizedTask: TaskContext
  maxTokens: number
}

interface ArchiveSearchMatch {
  title: string
  content: string
  score?: number
}

interface ArchiveRetrievalResult {
  packet: AccordionPacket | null
  matches: ArchiveSearchMatch[]
  query: string
}

export class AccordionComposer {
  private config: AccordionConfig
  private sessionId: string
  private sessionCache: Map<string, AccordionPacket> = new Map()
  private pendingExpansions: Map<string, Promise<AccordionPacket | null>> = new Map()

  // Static cache shared across instances and keyed by derived input signatures.
  private static cache: Map<string, { packet: AccordionPacket; expires: number; createdAt: number }> = new Map()

  /**
   * Creates a new AccordionComposer instance.
   * 
   * **Alpha Status:** This package is in alpha (0.x.x). The API may change in breaking
   * ways until version 1.0.0. For Harbor integration stability, pin to a specific
   * version tag and use the official framework adapters.
   * 
   * @param config - Optional configuration object for customizing composer behavior
   */
  constructor(config: AccordionConfig = {}) {
    this.config = config
    this.sessionId = uuid()
  }

  // ---------------------------------------------------------------------------
  // compose() — build a full bundle for an agent run
  // ---------------------------------------------------------------------------

  /**
   * Builds a complete accordion bundle for an agent run.
   * 
   * **Error Handling:** This method never throws. If a tier cannot be loaded
   * (e.g., experience.md not found), it is silently skipped. The returned bundle
   * will contain only the tiers that could be successfully assembled.
   * 
   * @param agent - The agent configuration including identity and experience settings
   * @param task - The task context containing title, description, and related metadata
   * @param options - Optional composition options for customizing bundle generation
   * @returns A promise that resolves to an AccordionBundle with all assembled packets
   */
  async compose(
    agent: AgentConfig,
    task: TaskContext,
    options: ComposeOptions = {}
  ): Promise<AccordionBundle> {
    const input = this.prepareComposeInput(agent, task, options.maxTokens)
    const trace: AccordionTraceEntry[] = []
    const packets = this.buildBasePackets(input.normalizedAgent, input.normalizedTask, trace)

    await this.appendExperiencePacket(packets, trace, input.normalizedAgent)

    if (options.includePriorTasks === true) {
      await this.appendArchivePacket(
        packets,
        trace,
        input.normalizedTask,
        this.normalizePositiveInteger(options.priorTaskLimit) ?? 3,
      )
    }

    return this.finalizeBundle(input, packets, trace)
  }

  /**
   * Plans retrieval intents for a task before executing the more expensive retrieval path.
   *
   * @param agent - Agent configuration used to determine whether experience retrieval is available
   * @param task - Task context used to derive experience and archive search queries
   * @param options - Optional planning and archive configuration
   * @returns Ordered retrieval intents, highest priority first
   */
  planRetrieval(
    agent: AgentConfig,
    task: TaskContext,
    options: SearchComposeOptions = {},
  ): RetrievalIntent[] {
    const input = this.prepareComposeInput(agent, task, options.maxTokens)
    const archiveLimit = this.normalizePositiveInteger(options.priorTaskLimit) ?? 3
    const intents: RetrievalIntent[] = []

    if (input.normalizedAgent.experiencePath) {
      intents.push({
        target: 'experience',
        query: this.buildRetrievalQuery(input.normalizedTask, 'experience'),
        priority: 90,
        reason: 'Agent-specific experience is available and should be consulted before broader retrieval.',
      })
    }

    if (options.includePriorTasks === true && this.config.vectorStore && this.config.embeddingProvider) {
      intents.push({
        target: 'archive',
        query: this.buildRetrievalQuery(input.normalizedTask, 'archive'),
        priority: 70,
        reason: 'Similar prior tasks were requested and the vector archive is available.',
        limit: archiveLimit,
      })
    }

    return this.normalizeRetrievalIntents(intents, archiveLimit)
  }

  /**
   * Builds a bundle using a planned retrieval path with typed intents and traceable planner decisions.
   *
   * @param agent - The agent configuration including identity and experience settings
   * @param task - The task context containing title, description, and related metadata
   * @param options - Optional planning options or explicit retrieval intents
   * @returns A promise that resolves to an AccordionBundle with planner trace entries
   */
  async searchAndCompose(
    agent: AgentConfig,
    task: TaskContext,
    options: SearchComposeOptions = {},
  ): Promise<AccordionBundle> {
    const input = this.prepareComposeInput(agent, task, options.maxTokens)
    const archiveLimit = this.normalizePositiveInteger(options.priorTaskLimit) ?? 3
    const trace: AccordionTraceEntry[] = []
    const packets = this.buildBasePackets(input.normalizedAgent, input.normalizedTask, trace)
    const intents = this.normalizeRetrievalIntents(
      options.retrievalIntents ?? this.planRetrieval(input.normalizedAgent, input.normalizedTask, options),
      archiveLimit,
    )

    trace.push(...intents.map(intent => this.createIntentTraceEntry('plan', 'selected', intent, intent.reason)))

    let experienceLoaded = false

    for (const intent of intents) {
      if (intent.target === 'experience') {
        if (experienceLoaded) {
          trace.push(this.createIntentTraceEntry('plan', 'skipped', intent, 'Skipped duplicate experience intent because experience was already loaded.'))
          continue
        }

        const loaded = await this.appendExperiencePacket(packets, trace, input.normalizedAgent, intent)
        experienceLoaded = experienceLoaded || loaded
        continue
      }

      await this.appendArchivePacket(
        packets,
        trace,
        input.normalizedTask,
        intent.limit ?? archiveLimit,
        intent,
      )
    }

    return this.finalizeBundle(input, packets, trace)
  }

  private prepareComposeInput(
    agent: AgentConfig,
    task: TaskContext,
    maxTokens?: number,
  ): ComposeInput {
    const normalizedAgent = this.normalizeAgentConfig(agent)
    const normalizedTask = this.normalizeTaskContext(task)

    return {
      normalizedAgent,
      normalizedTask,
      maxTokens:
        this.normalizePositiveInteger(maxTokens)
        ?? normalizedAgent.maxTokens
        ?? this.normalizePositiveInteger(this.config.maxTokens)
        ?? DEFAULT_MAX_TOKENS,
    }
  }

  private buildBasePackets(
    agent: AgentConfig,
    task: TaskContext,
    trace: AccordionTraceEntry[],
  ): AccordionPacket[] {
    const packets: AccordionPacket[] = []

    const identityDate = new Date().toISOString().split('T')[0]
    const identityCacheKey = this.createCacheKey('identity', agent.id, agent.identity, identityDate)
    const cachedIdentityPacket = this.getCached(identityCacheKey)
    const identityPacket = cachedIdentityPacket
      ?? this.buildIdentityPacket(agent, identityDate)
    this.setCache(identityCacheKey, identityPacket)
    packets.push(identityPacket)
    trace.push(
      this.createTraceEntry(
        'compose',
        cachedIdentityPacket ? 'cached' : 'selected',
        identityPacket,
        cachedIdentityPacket
          ? 'Loaded identity packet from static cache.'
          : 'Loaded the identity tier for the active agent.',
        cachedIdentityPacket ? 'static-cache' : identityPacket.metadata?.source,
      ),
    )

    const taskPacket = this.buildTaskPacket(task)
    packets.push(taskPacket)
    trace.push(this.createTraceEntry('compose', 'selected', taskPacket, 'Loaded the current task context.'))

    if (task.goal) {
      const goalPacket = this.buildGoalPacket(task.goal)
      packets.push(goalPacket)
      trace.push(this.createTraceEntry('compose', 'selected', goalPacket, 'Loaded the active goal context.'))
    }

    if (task.repo) {
      const repoPacket = this.buildRepoPacket(task.repo)
      packets.push(repoPacket)
      trace.push(this.createTraceEntry('compose', 'selected', repoPacket, 'Loaded repository context attached to the task.'))
    }

    if (task.handoff) {
      const handoffPacket = this.buildHandoffPacket(task.handoff)
      packets.push(handoffPacket)
      trace.push(this.createTraceEntry('compose', 'selected', handoffPacket, 'Loaded handoff context from a previous agent.'))
    }

    return packets
  }

  private async appendExperiencePacket(
    packets: AccordionPacket[],
    trace: AccordionTraceEntry[],
    agent: AgentConfig,
    intent?: RetrievalIntent,
  ): Promise<boolean> {
    if (!agent.experiencePath) {
      if (intent) {
        trace.push(this.createIntentTraceEntry('plan', 'skipped', intent, 'Skipped planned experience retrieval because the agent does not define an experience path.'))
      }
      return false
    }

    if (packets.some(packet => packet.tier === 'experience')) {
      if (intent) {
        trace.push(this.createIntentTraceEntry('plan', 'skipped', intent, 'Skipped planned experience retrieval because the experience tier is already present.'))
      }
      return false
    }

    const packet = await this.buildExperiencePacket(agent.id, agent.experiencePath)
    if (!packet) {
      if (intent) {
        trace.push(this.createIntentTraceEntry('compose', 'skipped', intent, 'Planned experience retrieval did not return a packet.'))
      }
      return false
    }

    packets.push(packet)
    trace.push(
      this.createTraceEntry(
        'compose',
        'selected',
        packet,
        intent
          ? 'Loaded learned experience for the planned retrieval intent.'
          : 'Loaded learned experience for the agent.',
        packet.metadata?.source,
        intent,
      ),
    )
    return true
  }

  private async appendArchivePacket(
    packets: AccordionPacket[],
    trace: AccordionTraceEntry[],
    task: TaskContext,
    limit: number,
    intent?: RetrievalIntent,
  ): Promise<boolean> {
    const result = await this.retrieveArchive(task, limit, intent?.query)
    if (!result.packet) {
      if (intent) {
        const unavailableReason =
          !this.config.vectorStore || !this.config.embeddingProvider
            ? 'Skipped planned archive retrieval because the vector archive is not configured.'
            : 'Planned archive retrieval returned no matches.'
        trace.push(this.createIntentTraceEntry('compose', 'skipped', intent, unavailableReason))
      }
      return false
    }

    packets.push(result.packet)
    trace.push(
      this.createTraceEntry(
        'compose',
        'selected',
        result.packet,
        intent
          ? 'Retrieved similar prior tasks for the planned archive intent.'
          : 'Retrieved similar prior tasks from the archive.',
        'archive-search',
        intent,
      ),
    )
    trace.push(...this.createArchiveMatchTraceEntries(result.matches, result.query, intent))
    return true
  }

  private finalizeBundle(
    input: ComposeInput,
    packets: AccordionPacket[],
    trace: AccordionTraceEntry[],
  ): AccordionBundle {
    const finalPackets = enforceBudget(packets, input.maxTokens, this.config.tokenizer)
    const totalTokens = finalPackets.reduce((sum, packet) => sum + estimateTokens(packet.content, this.config.tokenizer), 0)
    trace.push(...this.buildBudgetTrace(packets, finalPackets))

    return {
      agentId: input.normalizedAgent.id,
      taskId: input.normalizedTask.id,
      sessionId: this.sessionId,
      packets: finalPackets,
      totalTokens,
      maxTokens: input.maxTokens,
      expansionLog: [],
      trace,
    }
  }

  // ---------------------------------------------------------------------------
  // expand() — on-demand tier expansion mid-run
  // ---------------------------------------------------------------------------

  /**
   * Expands an existing accordion bundle with additional tiers on-demand.
   * 
   * **Error Handling:** This method never throws. If expansion fails (e.g., file not found,
   * vector store unreachable), the original bundle is returned with a logged expansion event.
   * The `tokensAdded` field will be 0 to indicate no new content was added.
   * 
   * @param bundle - The existing accordion bundle to expand
   * @param options - Expansion options specifying tier, reason, and optional settings
   * @returns A promise that resolves to the expanded AccordionBundle
   */
  async expand(bundle: AccordionBundle, options: ExpandOptions): Promise<AccordionBundle> {
    const reason = this.normalizeRequiredString(options.reason, 'Expansion requested')
    const limit = this.normalizePositiveInteger(options.limit) ?? 3
    const experiencePath = this.normalizeOptionalString(options.experiencePath) ?? ''
    const cacheKey = this.createExpandCacheKey(bundle, options.tier, reason, limit, experiencePath)
    const appendTrace = (entry: AccordionTraceEntry) => [...bundle.trace, entry]
    const cachedPacket = this.sessionCache.get(cacheKey)
    
    if (cachedPacket) {
      const tierExists = bundle.packets.some(p => p.tier === cachedPacket.tier)
      if (tierExists) {
        const event: ExpansionEvent = {
          tier: options.tier,
          reason,
          tokensAdded: 0,
          timestamp: new Date(),
        }
        this.config.onExpand?.(event)
        
        return {
          ...bundle,
          expansionLog: [...bundle.expansionLog, event],
          trace: appendTrace(this.createTraceEntry('expand', 'skipped', cachedPacket, 'Expansion skipped because the requested tier is already present.', 'session-cache')),
        }
      }
      
      const tokensAdded = estimateTokens(cachedPacket.content, this.config.tokenizer)
      const event: ExpansionEvent = {
        tier: options.tier,
        reason,
        tokensAdded,
        timestamp: new Date(),
      }
      this.config.onExpand?.(event)
      
      return {
        ...bundle,
        packets: [...bundle.packets, cachedPacket],
        totalTokens: bundle.totalTokens + tokensAdded,
        expansionLog: [...bundle.expansionLog, event],
        trace: appendTrace(this.createTraceEntry('expand', 'cached', cachedPacket, 'Expanded bundle using a packet from the session cache.', 'session-cache')),
      }
    }

    try {
      if (options.tier === 'experience') {
        const { packet, fromPending } = await this.getOrCreatePendingExpansion(
          cacheKey,
          () => this.buildExperiencePacket(bundle.agentId, experiencePath)
        )
        if (packet) {
          const tierExists = bundle.packets.some(p => p.tier === packet.tier)
          if (tierExists) {
            const event: ExpansionEvent = {
              tier: options.tier,
              reason,
              tokensAdded: 0,
              timestamp: new Date(),
            }
            this.config.onExpand?.(event)
            
            return {
              ...bundle,
              expansionLog: [...bundle.expansionLog, event],
              trace: appendTrace(this.createTraceEntry('expand', 'skipped', packet, 'Expansion skipped because the experience tier is already present.', packet.metadata?.source)),
            }
          }
          
          this.sessionCache.set(cacheKey, packet)
          const tokensAdded = estimateTokens(packet.content, this.config.tokenizer)
          const event: ExpansionEvent = {
            tier: options.tier,
            reason,
            tokensAdded,
            timestamp: new Date(),
          }
          this.config.onExpand?.(event)
          
          return {
            ...bundle,
            packets: [...bundle.packets, packet],
            totalTokens: bundle.totalTokens + tokensAdded,
            expansionLog: [...bundle.expansionLog, event],
            trace: appendTrace(
              this.createTraceEntry(
                'expand',
                fromPending ? 'cached' : 'expanded',
                packet,
                fromPending
                  ? 'Expanded the bundle using an in-flight experience load.'
                  : 'Expanded the bundle with learned experience.',
                fromPending ? 'in-flight' : packet.metadata?.source,
              ),
            ),
          }
        }
      } else if (options.tier === 'archive') {
        const task = { id: this.normalizeRequiredString(bundle.taskId, DEFAULT_TASK_ID), title: reason }
        const { packet, fromPending } = await this.getOrCreatePendingExpansion(
          cacheKey,
          async () => {
            const archiveResult = await this.retrieveArchive(task, limit)
            return archiveResult.packet
          },
        )
        if (packet) {
          const tierExists = bundle.packets.some(p => p.tier === packet.tier)
          if (tierExists) {
            const event: ExpansionEvent = {
              tier: options.tier,
              reason,
              tokensAdded: 0,
              timestamp: new Date(),
            }
            this.config.onExpand?.(event)
            
            return {
              ...bundle,
              expansionLog: [...bundle.expansionLog, event],
              trace: appendTrace(this.createTraceEntry('expand', 'skipped', packet, 'Expansion skipped because the archive tier is already present.', 'archive-search')),
            }
          }
          
          this.sessionCache.set(cacheKey, packet)
          const tokensAdded = estimateTokens(packet.content, this.config.tokenizer)
          const event: ExpansionEvent = {
            tier: options.tier,
            reason,
            tokensAdded,
            timestamp: new Date(),
          }
          this.config.onExpand?.(event)
          
          return {
            ...bundle,
            packets: [...bundle.packets, packet],
            totalTokens: bundle.totalTokens + tokensAdded,
            expansionLog: [...bundle.expansionLog, event],
            trace: appendTrace(
              this.createTraceEntry(
                'expand',
                fromPending ? 'cached' : 'expanded',
                packet,
                fromPending
                  ? 'Expanded the bundle using an in-flight archive retrieval.'
                  : 'Expanded the bundle with archive retrieval results.',
                fromPending ? 'in-flight' : 'archive-search',
              ),
            ),
          }
        }
      } else {
        const existingPacket = bundle.packets.find(p => p.tier === options.tier)
        if (existingPacket?.expanded) {
          const event: ExpansionEvent = {
            tier: options.tier,
            reason,
            tokensAdded: 0,
            timestamp: new Date(),
          }
          this.config.onExpand?.(event)
          
          return {
            ...bundle,
            expansionLog: [...bundle.expansionLog, event],
            trace: appendTrace(this.createTraceEntry('expand', 'skipped', existingPacket, 'Expansion skipped because the requested tier is already expanded.', existingPacket.metadata?.source)),
          }
        }
      }
    } catch {
      // Silently return original bundle on error
    }

    const event: ExpansionEvent = {
      tier: options.tier,
      reason,
      tokensAdded: 0,
      timestamp: new Date(),
    }
    this.config.onExpand?.(event)

    return {
      ...bundle,
      expansionLog: [...bundle.expansionLog, event],
      trace: appendTrace({
        timestamp: event.timestamp,
        stage: 'expand',
        action: 'skipped',
        tier: options.tier,
        source: options.tier,
        reason: 'Expansion completed without adding new packets.',
      }),
    }
  }

  /**
   * Clears all cached packets from the session cache.
   * This removes all temporarily stored accordion packets for the current session.
   */
  clearSessionCache(): void {
    this.sessionCache.clear()
    this.pendingExpansions.clear()
  }

  /**
   * Clears the static cache shared across AccordionComposer instances.
   */
  static clearGlobalCache(): void {
    AccordionComposer.cache.clear()
  }

  // ---------------------------------------------------------------------------
  // render() — flatten bundle to a string
  // ---------------------------------------------------------------------------

  /**
   * Renders an accordion bundle into a single prompt string.
   * 
   * **Error Handling:** This method never throws.
   * 
   * @param bundle - The accordion bundle to render
   * @returns A string containing all packet contents joined together
   */
  render(bundle: AccordionBundle): string {
    return bundle.packets
      .map(p => p.content)
      .join('\n\n')
      .trim()
  }

  // ---------------------------------------------------------------------------
  // index() — store a completed task in the vector archive (L3)
  // ---------------------------------------------------------------------------

  /**
   * Indexes a completed task into the vector archive for future retrieval.
   * 
   * **Error Handling:** This method never throws. If the vector store is not configured
   * or is unreachable, indexing is silently skipped.
   * 
   * @param options - The indexing options containing task content, ID, and metadata
   * @returns A promise that resolves when indexing is complete
   */
  async index(options: IndexTaskOptions): Promise<void> {
    if (!this.config.vectorStore || !this.config.embeddingProvider) return

    const embedding = await this.config.embeddingProvider.embed(options.content)

    // Dynamic import — qdrant is an optional peer dep
    const { QdrantClient } = await import('@qdrant/js-client-rest')
    const client = new QdrantClient({ url: this.config.vectorStore.url, checkCompatibility: false })
    const collection = this.config.vectorStore.collection ?? 'tasks'

    await client.upsert(collection, {
      wait: true,
      points: [{
        id: options.taskId,
        vector: embedding,
        payload: {
          ...options.metadata,
          taskId: options.taskId,
          content: options.content,
          indexedAt: new Date().toISOString(),
        },
      }],
    })
  }

  // ---------------------------------------------------------------------------
  // Packet builders
  // ---------------------------------------------------------------------------

  private buildIdentityPacket(agent: AgentConfig, identityDate: string): AccordionPacket {
    const now = new Date()
    return {
      id: uuid(),
      tier: 'identity',
      priority: TIER_PRIORITY.identity,
      maxTokens: 1000,
      content: `${agent.identity}\n\n## Session\nDate: ${identityDate}\nAgent: ${agent.id}`,
      summary: `Agent: ${agent.id}`,
      expanded: true,
      createdAt: now,
      metadata: {
        source: 'identity',
        whySelected: 'Identity is always included as the top-priority tier.',
      },
    }
  }

  private buildTaskPacket(task: TaskContext): AccordionPacket {
    const lines = [
      `## Task: ${task.title}`,
      task.description ? `\n${task.description}` : '',
      task.priority ? `\nPriority: ${task.priority}` : '',
      task.type ? `Type: ${task.type}` : '',
      task.owner ? `Owner: ${task.owner}` : '',
      task.requirements?.length
        ? `\n### Requirements\n${task.requirements.map(r => `- ${r}`).join('\n')}`
        : '',
    ].filter(Boolean)

    return {
      id: uuid(),
      tier: 'task',
      priority: TIER_PRIORITY.task,
      maxTokens: 2000,
      content: lines.join('\n'),
      summary: `${task.title} (${task.type ?? 'task'})`,
      expanded: true,
      createdAt: new Date(),
      metadata: {
        source: 'task',
        whySelected: 'Task context is always included so the active work stays in view.',
      },
    }
  }

  private buildGoalPacket(goal: GoalContext): AccordionPacket {
    return {
      id: uuid(),
      tier: 'goal',
      priority: TIER_PRIORITY.goal,
      maxTokens: 1000,
      content: [
        `## Goal: ${goal.title}`,
        goal.description ?? '',
        goal.progress !== undefined ? `Progress: ${goal.progress}%` : '',
        goal.status ? `Status: ${goal.status}` : '',
      ].filter(Boolean).join('\n'),
      summary: `Goal: ${goal.title}`,
      expanded: true,
      createdAt: new Date(),
      metadata: {
        source: 'goal',
        whySelected: 'Goal context was provided on the task.',
      },
    }
  }

  private buildRepoPacket(repo: RepoContext): AccordionPacket {
    return {
      id: uuid(),
      tier: 'repo',
      priority: TIER_PRIORITY.repo,
      maxTokens: 1500,
      content: [
        `## Repository: ${repo.name}`,
        `Path: ${repo.path}`,
        repo.description ?? '',
        repo.techStack?.length ? `Stack: ${repo.techStack.join(', ')}` : '',
        repo.mainFiles?.length ? `Key files:\n${repo.mainFiles.map(f => `- ${f}`).join('\n')}` : '',
      ].filter(Boolean).join('\n'),
      summary: `Repo: ${repo.name}`,
      expanded: true,
      createdAt: new Date(),
      metadata: {
        source: 'repo',
        whySelected: 'Repository context was attached to the task.',
      },
    }
  }

  private buildHandoffPacket(handoff: HandoffContext): AccordionPacket {
    return {
      id: uuid(),
      tier: 'handoff',
      priority: TIER_PRIORITY.handoff,
      maxTokens: 1000,
      content: [
        `## Handoff from ${handoff.fromAgent}`,
        handoff.previousWork ? `### Previous Work\n${handoff.previousWork}` : '',
        handoff.notes ? `### Notes\n${handoff.notes}` : '',
        handoff.percentageComplete !== undefined
          ? `Completion: ${handoff.percentageComplete}%`
          : '',
      ].filter(Boolean).join('\n'),
      summary: `Handoff from ${handoff.fromAgent}`,
      expanded: true,
      createdAt: new Date(),
      metadata: {
        source: 'handoff',
        whySelected: 'Handoff context was provided by a previous agent.',
      },
    }
  }

  private async buildExperiencePacket(
    agentId: string,
    experiencePath: string
  ): Promise<AccordionPacket | null> {
    const cacheKey = this.createCacheKey('experience', agentId, experiencePath)
    const cached = this.getCached(cacheKey)
    if (cached) return cached

    try {
      const content = await fs.readFile(experiencePath, 'utf-8')
      if (!content.trim()) return null

      const packet: AccordionPacket = {
        id: uuid(),
        tier: 'experience',
        priority: TIER_PRIORITY.experience,
        maxTokens: 1000,
        content: `## Learned Experience\n${content}`,
        summary: 'Agent experience and learned lessons',
        expanded: true,
        createdAt: new Date(),
        metadata: {
          source: 'experience-file',
          whySelected: 'Experience content was available for this agent.',
        },
      }

      this.setCache(cacheKey, packet)
      return packet
    } catch {
      return null // experience.md not found — skip silently
    }
  }

  private async retrieveArchive(
    task: TaskContext,
    limit: number,
    queryOverride?: string
  ): Promise<ArchiveRetrievalResult> {
    if (!this.config.vectorStore || !this.config.embeddingProvider) {
      return { packet: null, matches: [], query: '' }
    }

    try {
      const retrievalQuery = this.normalizeRequiredString(
        queryOverride,
        `${task.title} ${task.description ?? ''}`
      )
      const embedding = await this.config.embeddingProvider.embed(retrievalQuery)

      const { QdrantClient } = await import('@qdrant/js-client-rest')
      const client = new QdrantClient({ url: this.config.vectorStore.url, checkCompatibility: false })
      const collection = this.config.vectorStore.collection ?? 'tasks'

      const results = await client.search(collection, {
        vector: embedding,
        limit: limit + 1,
        filter: {
          must_not: [{ key: 'taskId', match: { value: task.id } }],
        },
        with_payload: true,
      })

      if (!results.length) {
        return { packet: null, matches: [], query: retrievalQuery }
      }

      const matches: ArchiveSearchMatch[] = results.map(result => ({
        title: (result.payload?.title as string) ?? String(result.id),
        content: (result.payload?.content as string) ?? '',
        score: result.score,
      }))

      const content = matches
        .map(match => {
          const score = ((match.score ?? 0) * 100).toFixed(0)
          return `### ${match.title} (relevance: ${score}%)\n${match.content}`
        })
        .join('\n\n')

      return {
        packet: {
          id: uuid(),
          tier: 'archive',
          priority: TIER_PRIORITY.archive,
          maxTokens: 1500,
          content: `## Similar Past Tasks\n\n${content}`,
          summary: `${matches.length} similar past tasks retrieved`,
          expanded: true,
          createdAt: new Date(),
          metadata: {
            source: 'archive-search',
            whySelected: 'Similar prior tasks were retrieved from the archive.',
            score: matches[0]?.score,
          },
        },
        matches,
        query: retrievalQuery,
      }
    } catch {
      return { packet: null, matches: [], query: queryOverride ?? '' } // Qdrant unreachable during archive retrieval
    }
  }

  // ---------------------------------------------------------------------------
  // Cache helpers
  // ---------------------------------------------------------------------------

  private getCached(key: string): AccordionPacket | null {
    this.pruneExpiredCache()
    const entry = AccordionComposer.cache.get(key)
    if (entry && entry.expires > Date.now()) {
      return { ...entry.packet, id: uuid(), createdAt: new Date() }
    }
    return null
  }

  private setCache(key: string, packet: AccordionPacket): void {
    this.pruneExpiredCache()
    if (AccordionComposer.cache.has(key)) {
      AccordionComposer.cache.delete(key)
    }

    AccordionComposer.cache.set(key, {
      packet,
      expires: Date.now() + (this.config.cacheTtl ?? DEFAULT_CACHE_TTL),
      createdAt: Date.now(),
    })

    this.enforceCacheSize()
  }

  private pruneExpiredCache(): void {
    const now = Date.now()
    for (const [key, entry] of AccordionComposer.cache.entries()) {
      if (entry.expires <= now) {
        AccordionComposer.cache.delete(key)
      }
    }
  }

  private enforceCacheSize(): void {
    const maxSize = this.normalizePositiveInteger(this.config.cacheMaxSize) ?? DEFAULT_CACHE_MAX_SIZE
    while (AccordionComposer.cache.size > maxSize) {
      const oldestKey = AccordionComposer.cache.keys().next().value
      if (!oldestKey) break
      AccordionComposer.cache.delete(oldestKey)
    }
  }

  private createCacheKey(...parts: Array<string | number>): string {
    return JSON.stringify(parts)
  }

  private createExpandCacheKey(
    bundle: AccordionBundle,
    tier: TierLevel,
    reason: string,
    limit: number,
    experiencePath: string,
  ): string {
    if (tier === 'experience') {
      return this.createCacheKey('expand', tier, bundle.agentId, experiencePath)
    }

    if (tier === 'archive') {
      return this.createCacheKey('expand', tier, this.normalizeRequiredString(bundle.taskId, DEFAULT_TASK_ID), reason, limit)
    }

    return this.createCacheKey('expand', tier, bundle.agentId, this.normalizeRequiredString(bundle.taskId, DEFAULT_TASK_ID), reason)
  }

  private async getOrCreatePendingExpansion(
    key: string,
    loader: () => Promise<AccordionPacket | null>,
  ): Promise<{ packet: AccordionPacket | null; fromPending: boolean }> {
    const existing = this.pendingExpansions.get(key)
    if (existing) {
      return {
        packet: await existing,
        fromPending: true,
      }
    }

    const pending = loader().finally(() => {
      if (this.pendingExpansions.get(key) === pending) {
        this.pendingExpansions.delete(key)
      }
    })
    this.pendingExpansions.set(key, pending)

    return {
      packet: await pending,
      fromPending: false,
    }
  }

  private buildRetrievalQuery(task: TaskContext, target: RetrievalIntent['target']): string {
    const parts = [
      task.title,
      task.description,
      task.type ? `type: ${task.type}` : undefined,
      task.priority ? `priority: ${task.priority}` : undefined,
      task.owner ? `owner: ${task.owner}` : undefined,
      task.goal?.title ? `goal: ${task.goal.title}` : undefined,
      task.repo?.name ? `repo: ${task.repo.name}` : undefined,
      task.requirements?.length ? `requirements: ${task.requirements.join('; ')}` : undefined,
    ].filter((part): part is string => part !== undefined)

    const prefix =
      target === 'experience'
        ? 'Relevant agent experience for'
        : 'Similar prior tasks for'

    return `${prefix} ${parts.join(' | ')}`.trim()
  }

  private normalizeRetrievalIntents(
    intents: RetrievalIntent[],
    defaultArchiveLimit: number,
  ): RetrievalIntent[] {
    return intents
      .map(intent => {
        const target: RetrievalIntent['target'] = intent.target === 'experience' ? 'experience' : 'archive'
        const defaultQuery =
          target === 'experience'
            ? 'Relevant agent experience'
            : 'Similar prior tasks'
        const defaultReason =
          target === 'experience'
            ? 'Agent experience should be consulted for this task.'
            : 'Archive retrieval should search for similar prior tasks.'

        return {
          target,
          query: this.normalizeRequiredString(intent.query, defaultQuery),
          priority: this.normalizeFiniteNumber(intent.priority) ?? (target === 'experience' ? 90 : 70),
          reason: this.normalizeRequiredString(intent.reason, defaultReason),
          limit: target === 'archive'
            ? this.normalizePositiveInteger(intent.limit) ?? defaultArchiveLimit
            : undefined,
        }
      })
      .sort((left, right) => right.priority - left.priority)
  }

  private createArchiveMatchTraceEntries(
    matches: ArchiveSearchMatch[],
    query: string,
    intent?: RetrievalIntent,
  ): AccordionTraceEntry[] {
    return matches.map((match, index) => ({
      timestamp: new Date(),
      stage: 'compose',
      action: 'selected',
      tier: 'archive',
      source: 'archive-match',
      reason: `Archive match ${index + 1} selected: ${match.title}`,
      score: match.score,
      query: query || intent?.query,
      priority: intent?.priority,
    }))
  }

  private createIntentTraceEntry(
    stage: AccordionTraceEntry['stage'],
    action: AccordionTraceEntry['action'],
    intent: RetrievalIntent,
    reason: string,
  ): AccordionTraceEntry {
    return {
      timestamp: new Date(),
      stage,
      action,
      tier: intent.target,
      source: 'retrieval-planner',
      reason,
      query: intent.query,
      priority: intent.priority,
    }
  }

  private createTraceEntry(
    stage: AccordionTraceEntry['stage'],
    action: AccordionTraceEntry['action'],
    packet: AccordionPacket,
    reason: string,
    sourceOverride?: string,
    intent?: RetrievalIntent,
  ): AccordionTraceEntry {
    return {
      timestamp: new Date(),
      stage,
      action,
      tier: packet.tier,
      packetId: packet.id,
      source: sourceOverride ?? packet.metadata?.source ?? packet.tier,
      reason,
      tokenEstimate: estimateTokens(packet.content, this.config.tokenizer),
      score: packet.metadata?.score,
      query: intent?.query,
      priority: intent?.priority,
    }
  }

  private buildBudgetTrace(originalPackets: AccordionPacket[], finalPackets: AccordionPacket[]): AccordionTraceEntry[] {
    const trace: AccordionTraceEntry[] = []
    const finalPacketsById = new Map(finalPackets.map(packet => [packet.id, packet]))

    for (const packet of originalPackets) {
      const finalPacket = finalPacketsById.get(packet.id)

      if (!finalPacket) {
        trace.push(this.createTraceEntry('budget', 'dropped', packet, 'Dropped during budget enforcement because higher-priority packets consumed the available budget.'))
        continue
      }

      if (finalPacket.content !== packet.content) {
        trace.push(this.createTraceEntry('budget', 'truncated', finalPacket, 'Truncated during budget enforcement to fit within the available token budget.'))
      }
    }

    return trace
  }

  private normalizeAgentConfig(agent: AgentConfig): AgentConfig {
    const candidate = (agent ?? {}) as Partial<AgentConfig>

    return {
      id: this.normalizeRequiredString(candidate.id, DEFAULT_AGENT_ID),
      identity: this.normalizeRequiredString(candidate.identity, DEFAULT_AGENT_IDENTITY),
      experiencePath: this.normalizeOptionalString(candidate.experiencePath),
      maxTokens: this.normalizePositiveInteger(candidate.maxTokens),
    }
  }

  private normalizeTaskContext(task: TaskContext): TaskContext {
    const candidate = (task ?? {}) as Partial<TaskContext>

    return {
      id: this.normalizeRequiredString(candidate.id, DEFAULT_TASK_ID),
      title: this.normalizeRequiredString(candidate.title, DEFAULT_TASK_TITLE),
      description: this.normalizeOptionalString(candidate.description),
      priority: this.normalizeOptionalString(candidate.priority),
      type: this.normalizeOptionalString(candidate.type),
      owner: this.normalizeOptionalString(candidate.owner),
      requirements: this.normalizeStringArray(candidate.requirements),
      goal: candidate.goal ? this.normalizeGoalContext(candidate.goal) : undefined,
      repo: candidate.repo ? this.normalizeRepoContext(candidate.repo) : undefined,
      handoff: candidate.handoff ? this.normalizeHandoffContext(candidate.handoff) : undefined,
    }
  }

  private normalizeGoalContext(goal: GoalContext): GoalContext {
    const candidate = goal as Partial<GoalContext>

    return {
      id: this.normalizeRequiredString(candidate.id, 'goal'),
      title: this.normalizeRequiredString(candidate.title, 'Untitled goal'),
      description: this.normalizeOptionalString(candidate.description),
      progress: this.normalizeFiniteNumber(candidate.progress),
      status: this.normalizeOptionalString(candidate.status),
    }
  }

  private normalizeRepoContext(repo: RepoContext): RepoContext {
    const candidate = repo as Partial<RepoContext>

    return {
      name: this.normalizeRequiredString(candidate.name, 'Unnamed repository'),
      path: this.normalizeRequiredString(candidate.path, '.'),
      description: this.normalizeOptionalString(candidate.description),
      techStack: this.normalizeStringArray(candidate.techStack),
      mainFiles: this.normalizeStringArray(candidate.mainFiles),
    }
  }

  private normalizeHandoffContext(handoff: HandoffContext): HandoffContext {
    const candidate = handoff as Partial<HandoffContext>

    return {
      fromAgent: this.normalizeRequiredString(candidate.fromAgent, DEFAULT_AGENT_ID),
      previousWork: this.normalizeOptionalString(candidate.previousWork),
      notes: this.normalizeOptionalString(candidate.notes),
      percentageComplete: this.normalizeFiniteNumber(candidate.percentageComplete),
    }
  }

  private normalizeRequiredString(value: unknown, fallback: string): string {
    if (typeof value !== 'string') return fallback

    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : fallback
  }

  private normalizeOptionalString(value: unknown): string | undefined {
    if (typeof value !== 'string') return undefined

    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : undefined
  }

  private normalizeStringArray(value: unknown): string[] | undefined {
    if (!Array.isArray(value)) return undefined

    const normalized = value
      .map(item => this.normalizeOptionalString(item))
      .filter((item): item is string => item !== undefined)

    return normalized.length > 0 ? normalized : undefined
  }

  private normalizeFiniteNumber(value: unknown): number | undefined {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return undefined
    }

    return value
  }

  private normalizePositiveInteger(value: unknown): number | undefined {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
      return undefined
    }

    return Math.floor(value)
  }
}
