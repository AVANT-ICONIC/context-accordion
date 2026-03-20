# Changelog

All notable changes to this project will be documented in this file.

## [0.1.0-alpha.1] - 2026-03-19

### Changed
- Version bump to `0.1.0-alpha.1` to clearly indicate alpha status
- Added `alpha` keyword to package.json
- Added `publishConfig` for alpha npm tag

### Added
- Added alpha status warning in README.md
- Added Public API Surface section in README.md documenting wrapper boundary
- Added wrapper boundary pattern documentation in API.md
- Added JSDoc comments to index.ts exports marking alpha/internal APIs
- Added comprehensive test coverage for embedding providers

### Documentation
- API.md now clearly documents stable vs internal APIs
- README.md includes "⚠️ Alpha Status" section with breaking changes policy
- Wrapper boundary clearly documented for Harbor integration

## [0.1.0] - 2026-03-18

### Added
- Initial release
- AccordionComposer with multi-tier context composition
- Token budget enforcement with priority-based dropping
- On-demand tier expansion (expand() method)
- Embedding provider abstraction (OllamaEmbedding, OpenAIEmbedding)
- Qdrant vector store integration for L3 archive tier
- Framework adapters for LangChain and Vercel AI SDK
- Experience distillation helper
- GitHub Actions CI workflow
