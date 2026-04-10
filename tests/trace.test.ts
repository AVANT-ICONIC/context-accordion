import { describe, expect, it } from 'vitest'
import { accordionTraceToMarkdown } from '../src/trace'
import type { AccordionBundle, AccordionTraceEntry } from '../src/types'

function makeTraceEntry(overrides: Partial<AccordionTraceEntry> = {}): AccordionTraceEntry {
  return {
    timestamp: new Date('2026-01-01T00:00:00.000Z'),
    stage: 'compose',
    action: 'selected',
    tier: 'task',
    packetId: 'packet-1',
    source: 'task',
    reason: 'Loaded the current task context.',
    tokenEstimate: 42,
    ...overrides,
  }
}

function makeBundle(trace: AccordionTraceEntry[]): AccordionBundle {
  return {
    agentId: 'test-agent',
    taskId: 'test-task',
    sessionId: 'test-session',
    packets: [],
    totalTokens: 0,
    maxTokens: 8000,
    expansionLog: [],
    trace,
  }
}

describe('accordionTraceToMarkdown', () => {
  it('renders bundle trace entries as markdown', () => {
    const bundle = makeBundle([
      makeTraceEntry({
        stage: 'plan',
        source: 'retrieval-planner',
        reason: 'Plan archive retrieval before compose.',
        query: 'similar auth incidents',
        priority: 70,
      }),
      makeTraceEntry({
        stage: 'budget',
        action: 'truncated',
        tier: 'repo',
        source: 'repo',
        reason: 'Truncated during budget enforcement.',
        score: 0.91,
      }),
    ])

    const markdown = accordionTraceToMarkdown(bundle)

    expect(markdown).toContain('## Accordion Trace')
    expect(markdown).toContain('plan/selected - task')
    expect(markdown).toContain('budget/truncated - repo')
    expect(markdown).toContain('Token estimate: 42')
    expect(markdown).toContain('Score: 0.91')
    expect(markdown).toContain('Query: similar auth incidents')
    expect(markdown).toContain('Priority: 70')
  })

  it('renders a helpful empty-state message', () => {
    const markdown = accordionTraceToMarkdown([])

    expect(markdown).toContain('No trace entries recorded')
  })
})
