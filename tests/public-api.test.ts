import { describe, expect, it } from 'vitest'
import * as publicApi from '../src/index'

describe('public API entrypoint', () => {
  it('exports the main public runtime surface', async () => {
    expect(typeof publicApi.AccordionComposer).toBe('function')
    expect(typeof publicApi.OllamaEmbedding).toBe('function')
    expect(typeof publicApi.OpenAIEmbedding).toBe('function')
    expect(typeof publicApi.enforceBudget).toBe('function')
    expect(typeof publicApi.estimateTokens).toBe('function')
    expect(typeof publicApi.accordionTraceToMarkdown).toBe('function')
    expect(typeof publicApi.distill).toBe('function')

    const composer = new publicApi.AccordionComposer({ maxTokens: 256 })
    const bundle = await composer.compose(
      { id: 'public-api', identity: 'You are a public API test agent.' },
      { id: 'public-task', title: 'Verify public exports.' }
    )

    expect(bundle.trace.length).toBeGreaterThan(0)
    expect(publicApi.accordionTraceToMarkdown(bundle)).toContain('Accordion Trace')
  })
})
