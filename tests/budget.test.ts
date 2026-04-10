import { describe, it, expect } from 'vitest'
import { enforceBudget, estimateTokens } from '../src/budget'
import type { AccordionPacket } from '../src/types'

function makePacket(tier: string, priority: number, content: string): AccordionPacket {
  return {
    id: `test-${tier}`,
    tier: tier as AccordionPacket['tier'],
    priority,
    maxTokens: 1000,
    content,
    summary: tier,
    expanded: true,
    createdAt: new Date(),
  }
}

describe('enforceBudget', () => {
  it('keeps all packets when under budget', () => {
    const packets = [
      makePacket('identity', 100, 'short identity'),
      makePacket('task', 80, 'short task'),
    ]
    const result = enforceBudget(packets, 10000)
    expect(result.length).toBe(2)
  })

  it('drops lowest priority packet first when over budget', () => {
    const identity = makePacket('identity', 100, 'a'.repeat(1000))
    const task = makePacket('task', 80, 'b'.repeat(1000))
    const archive = makePacket('archive', 50, 'c'.repeat(1000))

    // Budget only fits 2 packets
    const result = enforceBudget([identity, task, archive], 600)

    expect(result.some(p => p.tier === 'identity')).toBe(true)
    expect(result.some(p => p.tier === 'task')).toBe(true)
    expect(result.some(p => p.tier === 'archive')).toBe(false)
  })

  it('truncates a packet rather than dropping it when partial space remains', () => {
    const identity = makePacket('identity', 100, 'a'.repeat(400))  // ~100 tokens
    const task = makePacket('task', 80, 'b'.repeat(4000))           // ~1000 tokens

    const result = enforceBudget([identity, task], 300) // only 200 tokens left after identity

    const taskPacket = result.find(p => p.tier === 'task')
    expect(taskPacket).toBeDefined()
    expect(taskPacket?.content).toContain('[Truncated')
  })

  it('never exceeds the max token budget even when never-drop packets overflow it', () => {
    const identity = makePacket('identity', 100, 'a'.repeat(4000))
    const task = makePacket('task', 80, 'b'.repeat(4000))

    const result = enforceBudget([identity, task], 50)
    const totalTokens = result.reduce((sum, packet) => sum + estimateTokens(packet.content), 0)

    expect(totalTokens).toBeLessThanOrEqual(50)
  })

  it('uses a custom tokenizer when enforcing the budget', () => {
    const tokenizer = (text: string) => text.split(/\s+/).filter(Boolean).length
    const identity = makePacket('identity', 100, 'one two')
    const task = makePacket('task', 80, 'three four five six')
    const archive = makePacket('archive', 50, 'seven eight nine')

    const result = enforceBudget([identity, task, archive], 6, tokenizer)
    const totalTokens = result.reduce((sum, packet) => sum + estimateTokens(packet.content, tokenizer), 0)

    expect(totalTokens).toBeLessThanOrEqual(6)
    expect(result.some(packet => packet.tier === 'archive')).toBe(false)
  })
})

describe('estimateTokens', () => {
  it('estimates ~1 token per 4 chars', () => {
    expect(estimateTokens('a'.repeat(400))).toBe(100)
    expect(estimateTokens('a'.repeat(4000))).toBe(1000)
  })

  it('supports a custom tokenizer', () => {
    const tokenizer = (text: string) => text.split(/\s+/).filter(Boolean).length
    expect(estimateTokens('one two three', tokenizer)).toBe(3)
  })
})
