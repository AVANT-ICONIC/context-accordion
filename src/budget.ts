// context-accordion - token budget enforcement

import type { AccordionPacket, Tokenizer } from './types'

const TRUNCATION_NOTE = '\n\n[Truncated - token budget reached]'

/**
 * Estimates the number of tokens in a given text using a character-based approximation.
 * Uses the standard 4 characters per token ratio (GPT-style tokenization).
 * @param text - The input string to estimate tokens for
 * @param tokenizer - Optional custom tokenizer function
 * @returns The estimated token count
 */
export function estimateTokens(text: string, tokenizer?: Tokenizer): number {
  const normalized = typeof text === 'string' ? text : String(text ?? '')

  if (tokenizer) {
    const estimated = tokenizer(normalized)
    if (Number.isFinite(estimated) && estimated >= 0) {
      return Math.ceil(estimated)
    }
  }

  return Math.ceil(normalized.length / 4)
}

/**
 * Enforces a token budget across a set of accordion packets.
 * Packets are sorted by priority in descending order (highest priority first).
 * Lower-priority packets are truncated or dropped to fit within the maxTokens limit.
 * @param packets - The array of AccordionPacket objects to process
 * @param maxTokens - The maximum token budget allowed
 * @param tokenizer - Optional custom tokenizer function
 * @returns A new array of packets that fit within the token budget
 */
export function enforceBudget(
  packets: AccordionPacket[],
  maxTokens: number,
  tokenizer?: Tokenizer
): AccordionPacket[] {
  const budget = Math.max(0, Math.floor(maxTokens))
  const neverDropPackets = packets.filter(p => p.tier === 'identity' || p.tier === 'task')
  const canDropPackets = packets.filter(p => p.tier !== 'identity' && p.tier !== 'task')

  // Sort can-drop by priority (highest first)
  const sortedCanDrop = [...canDropPackets].sort((a, b) => b.priority - a.priority)

  const result: AccordionPacket[] = []
  let currentTokens = 0

  // First add never-drop packets (they're never dropped, but CAN be truncated)
  for (const packet of neverDropPackets) {
    const packetTokens = estimateTokens(packet.content, tokenizer)

    if (currentTokens + packetTokens <= budget) {
      result.push(packet)
      currentTokens += packetTokens
      continue
    }

    const remaining = Math.max(0, budget - currentTokens)
    const content = truncateToTokenBudget(packet.content, remaining, tokenizer)
    result.push({ ...packet, content })
    currentTokens += estimateTokens(content, tokenizer)
  }

  // Then add can-drop packets as budget allows
  for (const packet of sortedCanDrop) {
    const packetTokens = estimateTokens(packet.content, tokenizer)

    if (currentTokens + packetTokens <= budget) {
      result.push(packet)
      currentTokens += packetTokens
      continue
    }

    const remaining = budget - currentTokens
    // Keep if at least 200 tokens remain - truncate rather than drop
    if (remaining >= 200) {
      const content = truncateToTokenBudget(packet.content, remaining, tokenizer)
      result.push({ ...packet, content })
      currentTokens += estimateTokens(content, tokenizer)
    }

    break
  }

  return result
}

/**
 * Priority mapping for packet tiers. Higher values indicate higher priority.
 * Packets with higher priority are retained first when enforcing token budgets.
 * Identity and Task tiers are never dropped (priority >= 80).
 */
export const TIER_PRIORITY: Record<string, number> = {
  identity: 100,   // never dropped
  handoff: 90,     // agent-to-agent continuity
  experience: 85,  // learned lessons
  task: 80,        // the actual work - never dropped
  goal: 70,        // broader objective
  repo: 60,        // codebase context
  archive: 50,     // prior similar tasks - dropped first
}

function truncateToTokenBudget(text: string, maxTokens: number, tokenizer?: Tokenizer): string {
  if (maxTokens <= 0) return ''
  if (estimateTokens(text, tokenizer) <= maxTokens) return text

  const suffix = estimateTokens(TRUNCATION_NOTE, tokenizer) < maxTokens
    ? TRUNCATION_NOTE
    : ''

  let low = 0
  let high = text.length
  let best = ''

  while (low <= high) {
    const mid = Math.floor((low + high) / 2)
    const candidate = `${text.slice(0, mid)}${suffix}`.trimEnd()
    const candidateTokens = estimateTokens(candidate, tokenizer)

    if (candidateTokens <= maxTokens) {
      best = candidate
      low = mid + 1
    } else {
      high = mid - 1
    }
  }

  return best
}
