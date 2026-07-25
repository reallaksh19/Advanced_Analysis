# AGENT_02_CANONICAL_GEOMETRY_HANDOFF

## 1. Files changed
- `scripts/smoke-check.mjs`: Added integration of `validateCanonicalGeometry` to assert valid geometry output after PCF to canonical geometry parsing.

## 2. New files added
- `src/core/geometry/geometrySchema.js`: Basic constants and supported formats.
- `src/core/geometry/geometryDiagnostics.js`: Utility to manage diagnostics list (errors, warnings, etc.).
- `src/core/geometry/normalizeCanonicalGeometry.js`: Fills out base unit default (to mm) and coerces basic object layouts safely.
- `src/core/geometry/validateCanonicalGeometry.js`: Wraps internal validation with canonical checks such as node references, component references, and property completeness.
- `src/core/geometry/index.js`: Exposes new functions natively.
- `src/core/geometry/canonicalGeometry.test.js`: Contains automated tests running directly over `validateCanonicalGeometry` logic.
- `docs/CANONICAL_GEOMETRY_CONTRACT.md`: Standard contract specifying shape, references, zero-length tolerances and calculation fields requirements.

## 3. Deleted files, if any
None.

## 4. Engineering assumptions introduced
- All un-configured units implicitly default to mm to resolve missing info.
- Zero-length segments are disallowed unless defined strictly as 'SUPPORT' or related item marker explicitly.
- The `type` string on components such as `PIPE` requires basic dimensions (thickness, diameter/bore).

## 5. Tests added
- `src/core/geometry/canonicalGeometry.test.js` tests valid payloads, duplicate nodes, default mm unit population, zero length errors, correct missing properties warnings, and invalid orphan node/segment errors. Tested via native node runner. 9 total pass.

## 6. Commands run
- `npm i @babel/parser` to fix strict syntax check script.
- `npm run check:full` running syntax, syntax:strict, build, and test.

## 7. Commands not run and why
- Playwright end-to-end tests (none available locally or referenced natively in checks).

## 8. Known risks
- Relaxed string to numeric parsing was implemented in normalize step which might mask bad string input from external systems if formatted improperly but parsed out as NaN without throwing.

## 9. Next-agent dependencies
- Other engineering solver components can immediately rely on `validateCanonicalGeometry` output from canonical sources and parse robust warnings/errors arrays.