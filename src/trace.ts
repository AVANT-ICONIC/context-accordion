import type { AccordionBundle, AccordionTraceEntry } from './types'

/**
 * Renders bundle trace entries as markdown for debugging retrieval and budget decisions.
 *
 * @param input - An accordion bundle or a list of trace entries
 * @returns Markdown describing the recorded trace entries
 */
export function accordionTraceToMarkdown(
  input: AccordionBundle | AccordionTraceEntry[]
): string {
  const trace = Array.isArray(input) ? input : input.trace

  if (trace.length === 0) {
    return '## Accordion Trace\n\nNo trace entries recorded.'
  }

  const sections = trace.map((entry, index) => {
    const lines = [
      `### ${index + 1}. ${entry.stage}/${entry.action} - ${entry.tier}`,
      `- Source: ${entry.source}`,
      `- Reason: ${entry.reason}`,
    ]

    if (entry.packetId) {
      lines.push(`- Packet ID: ${entry.packetId}`)
    }

    if (entry.tokenEstimate !== undefined) {
      lines.push(`- Token estimate: ${entry.tokenEstimate}`)
    }

    if (entry.score !== undefined) {
      lines.push(`- Score: ${entry.score}`)
    }

    return lines.join('\n')
  })

  return ['## Accordion Trace', '', ...sections].join('\n\n')
}
