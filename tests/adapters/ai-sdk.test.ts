import { describe, it, expect } from 'vitest'
import { accordionSystemPrompt } from '../../src/adapters/ai-sdk'
import type { AccordionBundle, AccordionPacket } from '../../src/types'

function makePacket(tier: string, content: string): AccordionPacket {
  return {
    id: `test-${tier}`,
    tier: tier as AccordionPacket['tier'],
    priority: 100,
    maxTokens: 1000,
    content,
    summary: tier,
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

describe('ai-sdk adapter', () => {
  describe('accordionSystemPrompt', () => {
    it('renders bundle with single packet', () => {
      const bundle = makeBundle([
        makePacket('identity', 'You are a helpful assistant.'),
      ])

      const result = accordionSystemPrompt(bundle)

      expect(result).toBe('You are a helpful assistant.')
    })

    it('renders bundle with multiple packets joined by double newlines', () => {
      const bundle = makeBundle([
        makePacket('identity', 'You are a helpful assistant.'),
        makePacket('task', 'Fix the bug in the login flow.'),
      ])

      const result = accordionSystemPrompt(bundle)

      expect(result).toBe('You are a helpful assistant.\n\nFix the bug in the login flow.')
    })

    it('preserves order of packets', () => {
      const bundle = makeBundle([
        makePacket('identity', 'First packet'),
        makePacket('task', 'Second packet'),
        makePacket('goal', 'Third packet'),
      ])

      const result = accordionSystemPrompt(bundle)

      expect(result).toContain('First packet')
      expect(result).toContain('Second packet')
      expect(result).toContain('Third packet')
      expect(result.indexOf('First packet')).toBeLessThan(result.indexOf('Second packet'))
    })

    it('trims whitespace from result', () => {
      const bundle = makeBundle([
        makePacket('identity', '  Content with leading/trailing spaces  '),
      ])

      const result = accordionSystemPrompt(bundle)

      expect(result).toBe('Content with leading/trailing spaces')
    })

    it('handles empty bundle gracefully', () => {
      const bundle = makeBundle([])

      const result = accordionSystemPrompt(bundle)

      expect(result).toBe('')
    })

    it('handles packet with empty content', () => {
      const bundle = makeBundle([
        makePacket('identity', ''),
      ])

      const result = accordionSystemPrompt(bundle)

      expect(result).toBe('')
    })
  })
})
