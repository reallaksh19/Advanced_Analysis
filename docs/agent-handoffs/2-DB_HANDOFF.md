/* AGENT HANDOFF: 2-DB -> 3-UI
 * Date: 2026-04-27
 * Changes:
 *   - src/core/solvers/piperack/dbUtils.js: Documented IN_PER_100FT_TO_IN_PER_FT and FLANGE_OD_NPS_RATIO, updated methods to use these constants.
 *   - src/calc-extended/db/pipe_properties.json: Added 16" Sch 40 exact pipe entry instead of fallback.
 * Interface changes:
 *   - getRackPipeProps: fallback structure modified to prefer exact db instead of hardcoded 16" check.
 * Known open items:
 *   - None.
 * Tests run:
 *   - run_benchmarks.test.js & src/piperack/solver/PipeRackSolver.test.js expected to be executed after.
 */
