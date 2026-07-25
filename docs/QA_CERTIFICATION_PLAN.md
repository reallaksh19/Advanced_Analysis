# QA Certification Plan - Phase 6

This plan defines the strategy for testing the Phase 6 finalized app, covering:

1. **Source import resolution & Syntax Check**: Verify `import` statements and source code syntax across `.js`, `.jsx`, `.mjs`, `.cjs` files.
2. **Forbidden modules check**: Ensure no deprecated folders exist.
3. **No Math.random check**: Verify calculation source has no `Math.random()`.
4. **Module registry validation**: Validate against module schema.
5. **Canonical geometry validation**: Unit tests for schema and geometry format.
6. **Benchmark runner tests**: Ensure calculations pass numeric tolerances against verified references.
7. **Report export tests**: Ensure JSON, Markdown, and CSV generation works correctly.
8. **End-to-End UI Smoke (Playwright)**: Full verification across screens and user workflows.
