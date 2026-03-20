import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { OllamaEmbedding, OpenAIEmbedding } from '../src/embeddings'

describe('OllamaEmbedding', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    vi.spyOn(globalThis, 'fetch')
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    vi.restoreAllMocks()
  })

  it('creates instance with default URL and model', () => {
    const ollama = new OllamaEmbedding()
    expect(ollama).toBeDefined()
  })

  it('creates instance with custom URL and model', () => {
    const ollama = new OllamaEmbedding({
      url: 'http://custom:11434',
      model: 'custom-model',
    })
    expect(ollama).toBeDefined()
  })

  it('calls Ollama API with correct parameters', async () => {
    const mockResponse = { embedding: [0.1, 0.2, 0.3] }
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    } as Response)

    const ollama = new OllamaEmbedding()
    const result = await ollama.embed('Hello world')

    expect(globalThis.fetch).toHaveBeenCalledWith(
      'http://localhost:11434/api/embeddings',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'nomic-embed-text',
          prompt: 'Hello world',
        }),
      })
    )
    expect(result).toEqual([0.1, 0.2, 0.3])
  })

  it('throws error on API failure', async () => {
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    } as Response)

    const ollama = new OllamaEmbedding()
    await expect(ollama.embed('test')).rejects.toThrow(
      'Ollama embedding failed: 500 Internal Server Error'
    )
  })
})

describe('OpenAIEmbedding', () => {
  const originalFetch = globalThis.fetch
  const originalEnv = process.env

  beforeEach(() => {
    vi.spyOn(globalThis, 'fetch')
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    process.env = originalEnv
    vi.restoreAllMocks()
  })

  it('creates instance with API key option', () => {
    const openai = new OpenAIEmbedding({ apiKey: 'test-key' })
    expect(openai).toBeDefined()
  })

  it('creates instance with default model', () => {
    const openai = new OpenAIEmbedding({ apiKey: 'test-key' })
    expect(openai).toBeDefined()
  })

  it('calls OpenAI API with correct parameters', async () => {
    const mockResponse = {
      data: [{ embedding: [0.1, 0.2, 0.3] }],
    }
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    } as Response)

    const openai = new OpenAIEmbedding({ apiKey: 'test-key' })
    const result = await openai.embed('Hello world')

    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://api.openai.com/v1/embeddings',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-key',
        },
        body: JSON.stringify({
          model: 'text-embedding-3-small',
          input: 'Hello world',
        }),
      })
    )
    expect(result).toEqual([0.1, 0.2, 0.3])
  })

  it('throws error on API failure', async () => {
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
    } as Response)

    const openai = new OpenAIEmbedding({ apiKey: 'invalid-key' })
    await expect(openai.embed('test')).rejects.toThrow(
      'OpenAI embedding failed: 401 Unauthorized'
    )
  })

  it('returns empty array when embedding is missing', async () => {
    const mockResponse = { data: [] }
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    } as Response)

    const openai = new OpenAIEmbedding({ apiKey: 'test-key' })
    const result = await openai.embed('test')
    expect(result).toEqual([])
  })
})
