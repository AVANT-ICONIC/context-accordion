import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { EmbeddingProvider, VectorStoreConfig } from '../src/types'

const qdrantMocks = vi.hoisted(() => ({
  upsert: vi.fn(),
  search: vi.fn(),
  constructorArgs: vi.fn(),
}))

vi.mock('@qdrant/js-client-rest', () => ({
  QdrantClient: class MockQdrantClient {
    constructor(args: unknown) {
      qdrantMocks.constructorArgs(args)
    }

    upsert = qdrantMocks.upsert
    search = qdrantMocks.search
  },
}))

import { AccordionComposer } from '../src/composer'

describe('Qdrant success paths', () => {
  const embeddingProvider: EmbeddingProvider = {
    embed: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
  }

  const vectorStore: VectorStoreConfig = {
    url: 'http://localhost:6333',
    collection: 'tasks',
  }

  beforeEach(() => {
    AccordionComposer.clearGlobalCache()
    qdrantMocks.upsert.mockReset()
    qdrantMocks.search.mockReset()
    qdrantMocks.constructorArgs.mockReset()
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('indexes completed tasks into qdrant when configured', async () => {
    qdrantMocks.upsert.mockResolvedValue(undefined)

    const composer = new AccordionComposer({
      vectorStore,
      embeddingProvider,
    })

    await composer.index({
      taskId: 'indexed-task',
      content: 'Resolved the auth regression by rotating refresh tokens.',
      metadata: { title: 'Auth regression', type: 'bug' },
    })

    expect(qdrantMocks.constructorArgs).toHaveBeenCalledWith({
      url: 'http://localhost:6333',
      checkCompatibility: false,
    })
    expect(qdrantMocks.upsert).toHaveBeenCalledWith(
      'tasks',
      expect.objectContaining({
        wait: true,
        points: [
          expect.objectContaining({
            id: 'indexed-task',
            vector: [0.1, 0.2, 0.3],
            payload: expect.objectContaining({
              taskId: 'indexed-task',
              content: 'Resolved the auth regression by rotating refresh tokens.',
              title: 'Auth regression',
              type: 'bug',
            }),
          }),
        ],
      })
    )
  })

  it('retrieves archive packets and records metadata when qdrant returns matches', async () => {
    qdrantMocks.search.mockResolvedValue([
      {
        id: 'prior-task-1',
        score: 0.91,
        payload: {
          title: 'Previous auth incident',
          content: 'Refresh token rotation fixed session expiry.',
        },
      },
    ])

    const composer = new AccordionComposer({
      vectorStore,
      embeddingProvider,
    })

    const bundle = await composer.compose(
      {
        id: 'builder',
        identity: 'You are a senior software engineer.',
      },
      {
        id: 'task-archive',
        title: 'Fix session expiry',
        description: 'Users are logged out after five minutes.',
      },
      {
        includePriorTasks: true,
      }
    )

    const archivePacket = bundle.packets.find(packet => packet.tier === 'archive')

    expect(archivePacket).toBeDefined()
    expect(archivePacket?.content).toContain('Previous auth incident')
    expect(archivePacket?.content).toContain('relevance: 91%')
    expect(archivePacket?.metadata?.score).toBe(0.91)
    expect(bundle.trace.some(entry => entry.tier === 'archive' && entry.action === 'selected')).toBe(true)
    expect(qdrantMocks.search).toHaveBeenCalledWith(
      'tasks',
      expect.objectContaining({
        limit: 4,
        with_payload: true,
      })
    )
  })

  it('plans typed retrieval intents for experience and archive', () => {
    const composer = new AccordionComposer({
      vectorStore,
      embeddingProvider,
    })

    const intents = composer.planRetrieval(
      {
        id: 'builder',
        identity: 'You are a senior software engineer.',
        experiencePath: './experience.md',
      },
      {
        id: 'task-archive',
        title: 'Fix session expiry',
        description: 'Users are logged out after five minutes.',
      },
      {
        includePriorTasks: true,
        priorTaskLimit: 2,
      },
    )

    expect(intents).toEqual([
      expect.objectContaining({
        target: 'experience',
        priority: 90,
      }),
      expect.objectContaining({
        target: 'archive',
        priority: 70,
        limit: 2,
      }),
    ])
  })

  it('searchAndCompose records planner traces and archive match details', async () => {
    const embed = vi.fn().mockResolvedValue([0.1, 0.2, 0.3])
    qdrantMocks.search.mockResolvedValue([
      {
        id: 'prior-task-1',
        score: 0.91,
        payload: {
          title: 'Previous auth incident',
          content: 'Refresh token rotation fixed session expiry.',
        },
      },
      {
        id: 'prior-task-2',
        score: 0.83,
        payload: {
          title: 'Another login regression',
          content: 'Cookie expiry drift caused forced reauthentication.',
        },
      },
    ])

    const composer = new AccordionComposer({
      vectorStore,
      embeddingProvider: { embed },
    })

    const bundle = await composer.searchAndCompose(
      {
        id: 'builder',
        identity: 'You are a senior software engineer.',
      },
      {
        id: 'task-archive',
        title: 'Fix session expiry',
        description: 'Users are logged out after five minutes.',
      },
      {
        retrievalIntents: [
          {
            target: 'archive',
            query: 'similar auth incidents with forced logout',
            priority: 55,
            reason: 'Search related archive incidents before patching auth.',
            limit: 2,
          },
        ],
      },
    )

    expect(embed).toHaveBeenCalledWith('similar auth incidents with forced logout')
    expect(bundle.trace.some(entry =>
      entry.stage === 'plan'
      && entry.action === 'selected'
      && entry.query === 'similar auth incidents with forced logout'
      && entry.priority === 55
    )).toBe(true)
    expect(bundle.trace.some(entry =>
      entry.source === 'archive-match'
      && entry.query === 'similar auth incidents with forced logout'
      && entry.reason.includes('Previous auth incident')
    )).toBe(true)
    expect(qdrantMocks.search).toHaveBeenCalledWith(
      'tasks',
      expect.objectContaining({
        limit: 3,
        with_payload: true,
      }),
    )
  })
})
