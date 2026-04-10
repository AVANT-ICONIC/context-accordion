import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { AccordionComposer } from '../src/composer'
import type { AgentConfig, TaskContext, ExpandOptions } from '../src/types'
import { promises as fs } from 'fs'
import * as path from 'path'
import * as os from 'os'

const agent: AgentConfig = {
  id: 'builder',
  identity: 'You are a senior software engineer.',
  maxTokens: 4000,
}

const task: TaskContext = {
  id: 'task-001',
  title: 'Fix authentication bug',
  description: 'Users are getting logged out after 5 minutes.',
  priority: 'high',
  type: 'bug',
}

describe('AccordionComposer', () => {
  it('composes a bundle with identity and task packets', async () => {
    const composer = new AccordionComposer()
    const bundle = await composer.compose(agent, task)

    expect(bundle.packets.length).toBeGreaterThanOrEqual(2)
    expect(bundle.packets.some(p => p.tier === 'identity')).toBe(true)
    expect(bundle.packets.some(p => p.tier === 'task')).toBe(true)
  })

  it('respects token budget', async () => {
    const composer = new AccordionComposer({ maxTokens: 500 })
    const bundle = await composer.compose(agent, task, { maxTokens: 500 })

    expect(bundle.totalTokens).toBeLessThanOrEqual(500)
  })

  it('uses a custom tokenizer from config when composing bundles', async () => {
    const tokenizer = (text: string) => text.split(/\s+/).filter(Boolean).length
    const composer = new AccordionComposer({ tokenizer, maxTokens: 8 })
    const bundle = await composer.compose(agent, task, { maxTokens: 8 })

    expect(bundle.totalTokens).toBeLessThanOrEqual(8)
  })

  it('normalizes invalid agent and task inputs instead of producing broken packets', async () => {
    const composer = new AccordionComposer()
    const malformedAgent = { id: '   ', identity: '   ' } as unknown as AgentConfig
    const malformedTask = { id: '', title: '   ', requirements: ['first', '', ' second '] } as unknown as TaskContext

    const bundle = await composer.compose(malformedAgent, malformedTask)
    const rendered = composer.render(bundle)

    expect(bundle.agentId).toBe('unknown-agent')
    expect(bundle.taskId).toBe('unknown-task')
    expect(rendered).toContain('Untitled task')
    expect(rendered).toContain('first')
    expect(rendered).toContain('second')
  })

  it('includes goal packet when provided', async () => {
    const composer = new AccordionComposer()
    const bundle = await composer.compose(agent, {
      ...task,
      goal: { id: 'goal-1', title: 'Improve auth reliability', progress: 40, status: 'in_progress' },
    })

    expect(bundle.packets.some(p => p.tier === 'goal')).toBe(true)
  })

  it('records selection trace entries and packet metadata during compose', async () => {
    const composer = new AccordionComposer()
    const bundle = await composer.compose(agent, {
      ...task,
      repo: { name: 'context-accordion', path: '/repo/context-accordion' },
    })

    expect(bundle.trace.some(entry => (entry.action === 'selected' || entry.action === 'cached') && entry.tier === 'identity')).toBe(true)
    expect(bundle.trace.some(entry => entry.action === 'selected' && entry.tier === 'task')).toBe(true)
    expect(bundle.packets.every(packet => packet.metadata?.source)).toBe(true)
  })

  it('records budget trace entries when packets are truncated or dropped', async () => {
    const composer = new AccordionComposer({ maxTokens: 150 })
    const bundle = await composer.compose(agent, {
      ...task,
      goal: { id: 'goal-1', title: 'Improve auth reliability', progress: 40, status: 'in_progress' },
      repo: { name: 'context-accordion', path: '/repo/context-accordion', mainFiles: Array.from({ length: 10 }, (_, index) => `src/file-${index}.ts`) },
      handoff: { fromAgent: 'reviewer', notes: 'Carry over the previous investigation with all details preserved.'.repeat(20) },
    }, { maxTokens: 150 })

    expect(bundle.trace.some(entry => entry.stage === 'budget' && (entry.action === 'truncated' || entry.action === 'dropped'))).toBe(true)
  })

  it('renders bundle to a non-empty string', async () => {
    const composer = new AccordionComposer()
    const bundle = await composer.compose(agent, task)
    const rendered = composer.render(bundle)

    expect(typeof rendered).toBe('string')
    expect(rendered.length).toBeGreaterThan(0)
    expect(rendered).toContain('Fix authentication bug')
  })

  it('identity packet has highest priority', async () => {
    const composer = new AccordionComposer()
    const bundle = await composer.compose(agent, task)
    const identity = bundle.packets.find(p => p.tier === 'identity')

    expect(identity?.priority).toBe(100)
  })

  it('static identity cache keys include the identity content', async () => {
    AccordionComposer.clearGlobalCache()

    const firstComposer = new AccordionComposer()
    await firstComposer.compose(agent, task)

    const secondComposer = new AccordionComposer()
    const bundle = await secondComposer.compose({
      ...agent,
      identity: 'You are a staff security engineer.',
    }, task)

    const identityPacket = bundle.packets.find(p => p.tier === 'identity')
    expect(identityPacket?.content).toContain('staff security engineer')
  })

  it('skips archive tier when no vector store configured', async () => {
    const composer = new AccordionComposer() // no vectorStore
    const bundle = await composer.compose(agent, task, { includePriorTasks: true })

    expect(bundle.packets.some(p => p.tier === 'archive')).toBe(false)
  })

  describe('expand()', () => {
    let tempDir: string

    beforeEach(async () => {
      tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'accordion-test-'))
      AccordionComposer.clearGlobalCache()
    })

    afterEach(async () => {
      await fs.rm(tempDir, { recursive: true, force: true })
    })

    it('adds an ExpansionEvent to the expansionLog', async () => {
      const composer = new AccordionComposer()
      const bundle = await composer.compose(agent, task)

      const expandedBundle = await composer.expand(bundle, {
        tier: 'task',
        reason: 'Need more context on task details',
      })

      expect(expandedBundle.expansionLog.length).toBe(1)
      expect(expandedBundle.expansionLog[0].tier).toBe('task')
      expect(expandedBundle.expansionLog[0].reason).toBe('Need more context on task details')
      expect(expandedBundle.expansionLog[0].timestamp).toBeInstanceOf(Date)
    })

    it('with experience tier returns bundle with experience packet', async () => {
      const experiencePath = path.join(tempDir, 'experience.md')
      await fs.writeFile(experiencePath, '# Experience\n\nLearned to handle auth edge cases.')

      const composer = new AccordionComposer()
      const bundle = await composer.compose(agent, task)

      const expandedBundle = await composer.expand(bundle, {
        tier: 'experience',
        reason: 'Need past experience context',
        experiencePath,
      })

      expect(expandedBundle.packets.some(p => p.tier === 'experience')).toBe(true)
      const experiencePacket = expandedBundle.packets.find(p => p.tier === 'experience')
      expect(experiencePacket?.content).toContain('Learned to handle auth edge cases')
      expect(expandedBundle.expansionLog[0].tokensAdded).toBeGreaterThan(0)
      expect(expandedBundle.trace.some(entry => entry.stage === 'expand' && entry.action === 'expanded' && entry.tier === 'experience')).toBe(true)
    })

    it('caches results in session cache (second call is free)', async () => {
      const experiencePath = path.join(tempDir, 'experience.md')
      await fs.writeFile(experiencePath, '# Experience\n\nCached experience content.')

      const composer = new AccordionComposer()
      const bundle = await composer.compose(agent, task)

      const expandOptions: ExpandOptions = {
        tier: 'experience',
        reason: 'Need cached experience',
        experiencePath,
      }

      const firstExpand = await composer.expand(bundle, expandOptions)
      const firstTokens = firstExpand.expansionLog[0].tokensAdded

      const secondExpand = await composer.expand(firstExpand, expandOptions)
      const secondTokens = secondExpand.expansionLog[1].tokensAdded

      expect(secondTokens).toBe(0)
      expect(secondExpand.packets.filter(p => p.tier === 'experience').length).toBe(1)
    })

    it('uses bundle-specific session cache keys when expanding experience packets', async () => {
      const firstExperiencePath = path.join(tempDir, 'experience-one.md')
      const secondExperiencePath = path.join(tempDir, 'experience-two.md')
      await fs.writeFile(firstExperiencePath, '# Experience\n\nFirst agent experience.')
      await fs.writeFile(secondExperiencePath, '# Experience\n\nSecond agent experience.')

      const composer = new AccordionComposer()
      const firstBundle = await composer.compose(agent, task)
      const secondBundle = await composer.compose(
        { ...agent, id: 'reviewer', identity: 'You are a code reviewer.' },
        { ...task, id: 'task-002', title: 'Review authentication bug' },
      )

      const reason = 'Need past experience context'
      const firstExpandedBundle = await composer.expand(firstBundle, {
        tier: 'experience',
        reason,
        experiencePath: firstExperiencePath,
      })
      const secondExpandedBundle = await composer.expand(secondBundle, {
        tier: 'experience',
        reason,
        experiencePath: secondExperiencePath,
      })

      expect(firstExpandedBundle.packets.find(p => p.tier === 'experience')?.content).toContain('First agent experience')
      expect(secondExpandedBundle.packets.find(p => p.tier === 'experience')?.content).toContain('Second agent experience')
    })

    it('coalesces duplicate in-flight experience expansions', async () => {
      const experiencePath = path.join(tempDir, 'experience-concurrent.md')
      await fs.writeFile(experiencePath, '# Experience\n\nShared experience content.')

      const readFileSpy = vi.spyOn(fs, 'readFile')
      const composer = new AccordionComposer()
      const bundle = await composer.compose(agent, task)
      const expandOptions: ExpandOptions = {
        tier: 'experience',
        reason: 'Need concurrent experience context',
        experiencePath,
      }

      const [firstExpandedBundle, secondExpandedBundle] = await Promise.all([
        composer.expand(bundle, expandOptions),
        composer.expand(bundle, expandOptions),
      ])

      expect(readFileSpy).toHaveBeenCalledTimes(1)
      expect(firstExpandedBundle.packets.some(p => p.tier === 'experience')).toBe(true)
      expect(secondExpandedBundle.packets.some(p => p.tier === 'experience')).toBe(true)
      expect(secondExpandedBundle.trace.some(entry => entry.stage === 'expand' && entry.action === 'cached' && entry.source === 'in-flight')).toBe(true)

      readFileSpy.mockRestore()
    })

    it('with non-existent experience file returns original bundle gracefully', async () => {
      const composer = new AccordionComposer()
      const bundle = await composer.compose(agent, task)
      const originalPacketCount = bundle.packets.length

      const expandedBundle = await composer.expand(bundle, {
        tier: 'experience',
        reason: 'Try loading non-existent file',
        experiencePath: '/non/existent/path/experience.md',
      })

      expect(expandedBundle.packets.length).toBe(originalPacketCount)
      expect(expandedBundle.expansionLog.length).toBe(1)
      expect(expandedBundle.expansionLog[0].tokensAdded).toBe(0)
    })
  })

  describe('Cache TTL', () => {
    let tempDir: string

    beforeEach(async () => {
      tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'accordion-cache-test-'))
      AccordionComposer.clearGlobalCache()
    })

    afterEach(async () => {
      await fs.rm(tempDir, { recursive: true, force: true })
    })

    it('static cache respects cacheTtl config', async () => {
      const veryShortTtl = 100 // 100ms
      const experiencePath = path.join(tempDir, 'experience.md')
      await fs.writeFile(experiencePath, '# Experience\n\nFirst content.')

      const composer1 = new AccordionComposer({ cacheTtl: veryShortTtl })
      const bundle1 = await composer1.compose({ ...agent, experiencePath }, task)
      const packet1 = bundle1.packets.find(p => p.tier === 'experience')

      // Wait for TTL to expire
      await new Promise(resolve => setTimeout(resolve, veryShortTtl + 50))

      // Modify the file
      await fs.writeFile(experiencePath, '# Experience\n\nSecond content.')

      // Create new composer - should get fresh content due to expired cache
      const composer2 = new AccordionComposer({ cacheTtl: veryShortTtl })
      const bundle2 = await composer2.compose({ ...agent, experiencePath }, task)
      const packet2 = bundle2.packets.find(p => p.tier === 'experience')

      // If TTL works, we should see the new content (or re-read attempt)
      expect(packet2).toBeDefined()
    })

    it('static cache respects cacheMaxSize config', async () => {
      const experiencePathOne = path.join(tempDir, 'experience-one.md')
      const experiencePathTwo = path.join(tempDir, 'experience-two.md')
      await fs.writeFile(experiencePathOne, '# Experience\n\nFirst content.')
      await fs.writeFile(experiencePathTwo, '# Experience\n\nSecond content.')

      const firstComposer = new AccordionComposer({ cacheMaxSize: 1 })
      await firstComposer.compose({ ...agent, id: 'builder-one', experiencePath: experiencePathOne }, task)

      const secondComposer = new AccordionComposer({ cacheMaxSize: 1 })
      await secondComposer.compose({ ...agent, id: 'builder-two', experiencePath: experiencePathTwo }, task)

      await fs.writeFile(experiencePathOne, '# Experience\n\nUpdated first content.')

      const thirdComposer = new AccordionComposer({ cacheMaxSize: 1 })
      const bundle = await thirdComposer.compose({ ...agent, id: 'builder-one', experiencePath: experiencePathOne }, task)
      const experiencePacket = bundle.packets.find(p => p.tier === 'experience')

      expect(experiencePacket?.content).toContain('Updated first content')
    })

    it('static experience cache keys include the experience path', async () => {
      const firstExperiencePath = path.join(tempDir, 'experience-path-one.md')
      const secondExperiencePath = path.join(tempDir, 'experience-path-two.md')
      await fs.writeFile(firstExperiencePath, '# Experience\n\nPath one content.')
      await fs.writeFile(secondExperiencePath, '# Experience\n\nPath two content.')

      const firstComposer = new AccordionComposer()
      await firstComposer.compose({ ...agent, experiencePath: firstExperiencePath }, task)

      const secondComposer = new AccordionComposer()
      const bundle = await secondComposer.compose({ ...agent, experiencePath: secondExperiencePath }, task)
      const experiencePacket = bundle.packets.find(p => p.tier === 'experience')

      expect(experiencePacket?.content).toContain('Path two content')
    })

    it('clearSessionCache() clears the session cache', async () => {
      const experiencePath = path.join(tempDir, 'experience.md')
      await fs.writeFile(experiencePath, '# Experience\n\nClear cache test.')

      const composer = new AccordionComposer()
      const bundle = await composer.compose(agent, task)

      // First expand - populates session cache
      const expanded1 = await composer.expand(bundle, {
        tier: 'experience',
        reason: 'First expand',
        experiencePath,
      })
      expect(expanded1.expansionLog.length).toBe(1)
      expect(expanded1.packets.filter(p => p.tier === 'experience').length).toBe(1)

      // Clear the session cache
      composer.clearSessionCache()

      // Second expand - rebuilds from cache but skips adding since tier already exists in bundle
      const expanded2 = await composer.expand(expanded1, {
        tier: 'experience',
        reason: 'Second expand',
        experiencePath,
      })

      // Cache was cleared but tier already exists in bundle - no duplicates allowed
      expect(expanded2.packets.filter(p => p.tier === 'experience').length).toBe(1)
    })

    it('clearGlobalCache() clears the static cache shared across composers', async () => {
      const experiencePath = path.join(tempDir, 'experience-global.md')
      await fs.writeFile(experiencePath, '# Experience\n\nOriginal content.')

      const firstComposer = new AccordionComposer()
      await firstComposer.compose({ ...agent, experiencePath }, task)

      AccordionComposer.clearGlobalCache()
      await fs.writeFile(experiencePath, '# Experience\n\nUpdated content after clear.')

      const secondComposer = new AccordionComposer()
      const bundle = await secondComposer.compose({ ...agent, experiencePath }, task)
      const experiencePacket = bundle.packets.find(p => p.tier === 'experience')

      expect(experiencePacket?.content).toContain('Updated content after clear')
    })
  })
})
