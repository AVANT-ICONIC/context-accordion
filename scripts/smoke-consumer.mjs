import { execFileSync, execSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const projectRoot = resolve(process.cwd())
const tempDir = mkdtempSync(join(tmpdir(), 'context-accordion-smoke-'))

try {
  writeFileSync(
    join(tempDir, 'package.json'),
    JSON.stringify({ name: 'context-accordion-smoke', private: true, type: 'module' }, null, 2)
  )

  execSync(`npm install --no-package-lock --no-save "${projectRoot}"`, {
    cwd: tempDir,
    stdio: 'inherit',
  })

  writeFileSync(
    join(tempDir, 'smoke.mjs'),
    `
import { createRequire } from 'node:module'
import { AccordionComposer, accordionTraceToMarkdown, estimateTokens } from 'context-accordion'
import { accordionSystemPrompt } from 'context-accordion/ai-sdk'
import { toDocuments, toSystemMessage } from 'context-accordion/langchain'

const require = createRequire(import.meta.url)
const cjs = require('context-accordion')

const composer = new AccordionComposer({ maxTokens: 512 })
const bundle = await composer.compose(
  { id: 'smoke-agent', identity: 'You are a smoke test agent.' },
  { id: 'smoke-task', title: 'Verify package imports.' }
)

if (!bundle.trace.length) throw new Error('Expected trace entries from public package import')
if (typeof accordionSystemPrompt(bundle) !== 'string') throw new Error('AI SDK adapter import failed')
if (!Array.isArray(toDocuments(bundle))) throw new Error('LangChain adapter import failed')
if (typeof toSystemMessage(bundle) !== 'string') throw new Error('LangChain system message import failed')
if (typeof accordionTraceToMarkdown(bundle) !== 'string') throw new Error('Trace renderer import failed')
if (typeof estimateTokens('smoke') !== 'number') throw new Error('Budget utility import failed')
if (typeof cjs.AccordionComposer !== 'function') throw new Error('CJS entrypoint import failed')
`
  )

  execFileSync(process.execPath, [join(tempDir, 'smoke.mjs')], { cwd: tempDir, stdio: 'inherit' })
} finally {
  rmSync(tempDir, { recursive: true, force: true })
}
