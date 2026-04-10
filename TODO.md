# TODO

## Completed in this pass

- [x] Add publish-safe packaging checks with `prepack` and `npm pack --dry-run`.
- [x] Wire coverage into the repo with `@vitest/coverage-v8`.
- [x] Harden CI to use `npm ci`, run coverage, and smoke-test the package tarball.
- [x] Honor `AccordionConfig.tokenizer` throughout compose/expand/budget flows.
- [x] Enforce `maxTokens` strictly, even when never-drop packets overflow the budget.
- [x] Honor `AccordionConfig.cacheMaxSize` and add `AccordionComposer.clearGlobalCache()`.
- [x] Normalize malformed runtime inputs so compose does not emit broken packets.
- [x] Disable noisy Qdrant compatibility warnings during graceful degradation paths.
- [x] Add packet metadata, bundle trace entries, and `accordionTraceToMarkdown()`.
- [x] Expand the test suite around budgeting, cache behavior, trace rendering, and compose normalization.
- [x] Scope identity and experience caches to their actual inputs and coalesce duplicate in-flight expansions.

## Release blockers

- [x] Raise overall coverage above 90 percent.
- [x] Add docs for trace output, cache controls, tokenizer support, and new package scripts.
- [x] Decide which currently alpha helpers should stay alpha vs move toward stable.
- [x] Add consumer smoke tests that import the built package from a temp project.
- [x] Audit and upgrade vulnerable dev dependencies, especially the Vitest/Vite chain.
- [x] Add a release workflow that tags, verifies, and publishes only from a clean green build.
- [x] Verify README and API.md wording around error handling now that inputs are normalized and traces exist.

## Retrieval control plane

- [x] Add a planned retrieval API such as `searchAndCompose()` or `planAndCompose()`.
- [x] Introduce typed retrieval intents for `experience` and `archive`.
- [x] Record retrieval planning decisions in `bundle.trace`.
- [x] Add per-result archive trace details beyond the top combined archive packet.
- [ ] Add directory-aware retrieval as an optional provider instead of hardwiring it into the composer.

## Runtime ergonomics

- [x] Add wake-up packet generation for compact bootstrap prompts.
- [ ] Add lifecycle hooks for `onRunEnd`, `beforeContextShrink`, and post-task archival.
- [ ] Add shared vs private archive scopes for agent and project memory partitions.
- [ ] Add a simple trace viewer example for debugging in real apps.

## Nice-to-have later

- [ ] Add optional temporal facts as a separate provider module.
- [ ] Add a dedicated debug adapter/subpath if trace rendering grows beyond markdown.
- [x] Add concurrency protection for duplicate in-flight `expand()` calls.
