import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { distill } from '../src/distill'
import { promises as fs } from 'fs'
import * as path from 'path'
import * as os from 'os'

describe('distill', () => {
  let tempDir: string
  const originalFetch = globalThis.fetch

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'distill-test-'))
    vi.spyOn(globalThis, 'fetch')
  })

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true })
    globalThis.fetch = originalFetch
    vi.restoreAllMocks()
  })

  it('returns empty result when all runs are successful', async () => {
    const experiencePath = path.join(tempDir, 'experience.md')

    const result = await distill({
      runs: [
        { taskId: '1', title: 'Task 1', description: 'Desc', outcome: 'success' },
      ],
      experiencePath,
      model: 'test-model',
    })

    expect(result.added).toBe('')
    expect(result.runsProcessed).toBe(0)
    expect(result.errors).toHaveLength(0)
  })

  it('filters out successful runs and only processes failures', async () => {
    const experiencePath = path.join(tempDir, 'experience.md')
    await fs.writeFile(experiencePath, '# Experience\n\n')

    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        message: { content: 'Lesson 1: Always validate inputs.' },
      }),
    } as Response)

    const result = await distill({
      runs: [
        { taskId: '1', title: 'Task 1', description: 'Desc', outcome: 'success' },
        { taskId: '2', title: 'Task 2', description: 'Failed task', outcome: 'failure', error: 'Null pointer' },
      ],
      experiencePath,
      model: 'test-model',
    })

    expect(result.runsProcessed).toBe(1)
    expect(result.errors).toHaveLength(0)
  })

  it('appends lessons to experience.md file', async () => {
    const experiencePath = path.join(tempDir, 'experience.md')
    await fs.writeFile(experiencePath, '# Experience\n\n')

    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        message: { content: 'Lesson: Validate all inputs before processing.' },
      }),
    } as Response)

    const result = await distill({
      runs: [
        { taskId: '1', title: 'Fix Bug', description: 'Auth failed', outcome: 'failure', error: 'Null pointer' },
      ],
      experiencePath,
      model: 'test-model',
    })

    expect(result.added).toContain('Lessons')
    expect(result.added).toContain('Fix Bug')

    const content = await fs.readFile(experiencePath, 'utf-8')
    expect(content).toContain('Fix Bug')
  })

  it('uses default Ollama URL when not provided', async () => {
    const experiencePath = path.join(tempDir, 'experience.md')
    await fs.writeFile(experiencePath, '# Experience\n')

    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ message: { content: 'Lesson' } }),
    } as Response)

    await distill({
      runs: [{ taskId: '1', title: 'Task', description: 'Desc', outcome: 'failure' }],
      experiencePath,
      model: 'model',
    })

    expect(globalThis.fetch).toHaveBeenCalledWith(
      'http://localhost:11434/api/chat',
      expect.objectContaining({ method: 'POST' })
    )
  })

  it('uses custom Ollama URL when provided', async () => {
    const experiencePath = path.join(tempDir, 'experience.md')
    await fs.writeFile(experiencePath, '# Experience\n')

    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ message: { content: 'Lesson' } }),
    } as Response)

    await distill({
      runs: [{ taskId: '1', title: 'Task', description: 'Desc', outcome: 'failure' }],
      experiencePath,
      model: 'model',
      ollamaUrl: 'http://custom:11434',
    })

    expect(globalThis.fetch).toHaveBeenCalledWith(
      'http://custom:11434/api/chat',
      expect.objectContaining({ method: 'POST' })
    )
  })

  it('collects errors when Ollama API fails', async () => {
    const experiencePath = path.join(tempDir, 'experience.md')
    await fs.writeFile(experiencePath, '# Experience\n')

    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    } as Response)

    const result = await distill({
      runs: [
        { taskId: '1', title: 'Task', description: 'Desc', outcome: 'failure' },
      ],
      experiencePath,
      model: 'test-model',
    })

    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toContain('task 1')
  })

  it('handles partial runs correctly', async () => {
    const experiencePath = path.join(tempDir, 'experience.md')
    await fs.writeFile(experiencePath, '# Experience\n')

    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        message: { content: 'Lesson: Add better error handling.' },
      }),
    } as Response)

    const result = await distill({
      runs: [
        { taskId: '1', title: 'Task', description: 'Partially done', outcome: 'partial' },
      ],
      experiencePath,
      model: 'test-model',
    })

    expect(result.runsProcessed).toBe(1)
  })
})
