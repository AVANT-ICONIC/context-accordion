import { describe, it, expect } from 'vitest'
import { toDocuments, toSystemMessage } from '../../src/adapters/langchain'
import type { AccordionBundle, AccordionPacket } from '../../src/types'

function makePacket(tier: string, priority: number, content: string): AccordionPacket {
  return {
    id: `test-${tier}`,
    tier: tier as AccordionPacket['tier'],
    priority,
    maxTokens: 1000,
    content,
    summary: `Summary for ${tier}`,
    expanded: true,
    createdAt: new Date(),
  }
}

function makeBundle(packets: AccordionPacket[]): AccordionBundle {
  return {
    agentId: 'test-agent',
    taskId: 'test-task',
    sessionId: 'test-session',
    packets,
    totalTokens: packets.reduce((sum, p) => sum + Math.ceil(p.content.length / 4), 0),
    maxTokens: 8000,
    expansionLog: [],
  }
}

describe('langchain adapter', () => {
  describe('toDocuments', () => {
    it('converts single packet to document', () => {
      const bundle = makeBundle([
        makePacket('identity', 100, 'You are a helpful assistant.'),
      ])

      const docs = toDocuments(bundle)

      expect(docs).toHaveLength(1)
      expect(docs[0].pageContent).toBe('You are a helpful assistant.')
      expect(docs[0].metadata).toEqual({
        tier: 'identity',
        priority: 100,
        summary: 'Summary for identity',
        tokenEstimate: 7,
      })
    })

    it('converts multiple packets to documents preserving order', () => {
      const bundle = makeBundle([
        makePacket('identity', 100, 'Identity content'),
        makePacket('task', 80, 'Task content'),
        makePacket('goal', 70, 'Goal content'),
      ])

      const docs = toDocuments(bundle)

      expect(docs).toHaveLength(3)
      expect(docs[0].pageContent).toBe('Identity content')
      expect(docs[0].metadata.tier).toBe('identity')
      expect(docs[1].pageContent).toBe('Task content')
      expect(docs[1].metadata.tier).toBe('task')
      expect(docs[2].pageContent).toBe('Goal content')
      expect(docs[2].metadata.tier).toBe('goal')
    })

    it('estimates token count as content length / 4', () => {
      const content = 'a'.repeat(400) // ~100 tokens
      const bundle = makeBundle([
        makePacket('identity', 100, content),
      ])

      const docs = toDocuments(bundle)

      expect(docs[0].metadata.tokenEstimate).toBe(100)
    })

    it('handles empty bundle', () => {
      const bundle = makeBundle([])

      const docs = toDocuments(bundle)

      expect(docs).toHaveLength(0)
    })

    it('preserves packet metadata in document', () => {
      const bundle = makeBundle([
        makePacket('archive', 50, 'Archive content'),
      ])

      const docs = toDocuments(bundle)

      expect(docs[0].metadata.tier).toBe('archive')
      expect(docs[0].metadata.priority).toBe(50)
      expect(docs[0].metadata.summary).toBe('Summary for archive')
    })
  })

  describe('toSystemMessage', () => {
    it('renders single packet bundle as string', () => {
      const bundle = makeBundle([
        makePacket('identity', 100, 'You are a helpful assistant.'),
      ])

      const result = toSystemMessage(bundle)

      expect(result).toBe('You are a helpful assistant.')
    })

    it('renders multiple packets joined by double newlines', () => {
      const bundle = makeBundle([
        makePacket('identity', 100, 'You are a helpful assistant.'),
        makePacket('task', 80, 'Fix the bug in the login flow.'),
      ])

      const result = toSystemMessage(bundle)

      expect(result).toBe('You are a helpful assistant.\n\nFix the bug in the login flow.')
    })

    it('preserves order of packets', () => {
      const bundle = makeBundle([
        makePacket('identity', 100, 'First'),
        makePacket('task', 80, 'Second'),
        makePacket('goal', 70, 'Third'),
      ])

      const result = toSystemMessage(bundle)

      const firstIdx = result.indexOf('First')
      const secondIdx = result.indexOf('Second')
      const thirdIdx = result.indexOf('Third')

      expect(firstIdx).toBeLessThan(secondIdx)
      expect(secondIdx).toBeLessThan(thirdIdx)
    })

    it('trims whitespace from result', () => {
      const bundle = makeBundle([
        makePacket('identity', 100, '  Content with spaces  '),
      ])

      const result = toSystemMessage(bundle)

      expect(result).toBe('Content with spaces')
    })

    it('handles empty bundle gracefully', () => {
      const bundle = makeBundle([])

      const result = toSystemMessage(bundle)

      expect(result).toBe('')
    })
  })
})
