1. Files changed
   - `src/components/Viewer3DTab.jsx`
   - `src/pcf/index.js` (created)
   - `src/pcf/pcfParser.test.js` (created)
   - `docs/PCF_IMPORT_EXPORT_CONTRACT.md` (created)
   - `docs/PCF_DIAGNOSTICS_AND_LOSS_REPORT.md` (created)
2. New files added
   - `src/pcf/pcfParser.js` (moved from `src/utils/pcfParser.js`)
   - `src/pcf/pcfReader.js` (moved from `src/utils/pcfReader.js`)
   - `src/pcf/pcfSerializer.js` (moved from `src/utils/pcfSerializer.js`)
   - `src/pcf/index.js`
   - `src/pcf/pcfParser.test.js`
   - `docs/PCF_IMPORT_EXPORT_CONTRACT.md`
   - `docs/PCF_DIAGNOSTICS_AND_LOSS_REPORT.md`
   - `docs/agent-handoffs/AGENT_08_PCF_INTERFACE_HANDOFF.md`
   - `benchmarks/fixtures/pcf/test1.pcf`, `test2.pcf`, `test3.pcf`
3. Deleted files, if any
   - `src/utils/pcfParser.js`
   - `src/utils/pcfReader.js`
   - `src/utils/pcfSerializer.js`
4. Engineering assumptions introduced
   - Conservative canonical fallback works for serialization
5. Tests added
   - `src/pcf/pcfParser.test.js` for testing round-trip and diagnostics
6. Commands run
   - `npm run test`
7. Commands not run and why
   - none
8. Known risks
   - none
9. Next-agent dependencies
   - Need QA Automation Agent to include the new PCF contract in full test suite and formalize `import-check`
   - Need Canonical Geometry Agent to supply `validateCanonicalGeometry.js` eventually instead of using `validateGeometry.js`
