# LFEA Piping Phase 6I Aggregate Anti-Drift

## Disposition

`AUD-A7-001` remains `UNRESOLVED_GATE` and the program remains `BLOCKED`.

This source package implements the aggregate anti-drift command proposed by the Phase 6I gap-closure report. It does not create real project evidence, qualify a release, or close any runtime gate.

## Candidate restart

The source change was explicitly authorized after the original execution plan was frozen. Therefore:

- `921491eaee42a89115c958797508686c551e19b6` remains superseded;
- `e76d2171015275836fe80e7d5e8b12d426eeb79e` is now also superseded for Phase 6I execution;
- no artifact from either head is eligible for the new chain;
- the next immutable execution candidate is selected only after this package is merged;
- Phase 6F, Phase 6H, Phase 6G, Phase 6E and independent review must restart on that one new head.

## Public command

```bash
npm run check:lfea-piping-phase6i-anti-drift
```

The command is also executed through `check:lfea-piping-release-policy` and therefore through the full repository `gate`.

## Evidence eligibility policy

A workflow record is eligible only when all of the following are true:

- workflow status is `completed`;
- workflow conclusion is `success`;
- at least one executable step is retained;
- every retained step completed successfully;
- downloadable logs are available;
- the required retained artifact is present.

The policy rejects pre-step failures, partial runs, cancelled runs, failed steps, missing logs and missing artifacts. This prevents the repository-wide Actions condition from being interpreted as either passing evidence or a command-level source failure.

Candidate binding additionally requires every supplied artifact to identify one current 40-character SHA. Superseded and mixed-head evidence is rejected.

## AD-01 through AD-25 catalogue

The immutable catalogue maps every report scenario to concrete repository enforcement evidence:

| ID | Enforcement boundary |
|---|---|
| AD-01 | Collector/materializer exact-head checks |
| AD-02 | Explicit superseded-head policy |
| AD-03 | Phase 6G internal/external head equality |
| AD-04 | Phase 6C/6D semantic and evidence hash checks |
| AD-05 | Persisted artifact content-hash checks |
| AD-06 | Blocked/null-headed committed release template |
| AD-07 | Simulated identity and ineligible-root rejection |
| AD-08 | G8/G9 authority independence |
| AD-09 | Signed-disposition exact-head binding |
| AD-10 | Performance head and envelope binding |
| AD-11 | Rollback candidate and post-check binding |
| AD-12 | Absolute, traversal, drive, empty-segment and symlink rejection |
| AD-13 | Case-insensitive destination collision rejection |
| AD-14 | Failed command prevents manifest sealing |
| AD-15 | Failure artifact cannot satisfy Phase 6G collection-summary checks |
| AD-16 | Clean-tree authority |
| AD-17 | Current presentation and application-parent binding |
| AD-18 | Required unique artifact paths |
| AD-19 | Partial/cancelled workflow ineligibility |
| AD-20 | Pre-step and log-less workflow ineligibility |
| AD-21 | Runner-temporary path-independent manifest identity |
| AD-22 | Timestamp metadata separated from semantic identity |
| AD-23 | Nozzle/B31 dataset and recovery parent binding |
| AD-24 | Nonlinear gap/contact/friction scope guards |
| AD-25 | ASME/vendor/allowable-table source guards |

The aggregate fails if a mapped source file disappears or any required rejection code or guard token is removed.

## AD-22 correction

The Phase 6D internal manifest previously included `createdAtUtc` in its semantic projection. That made semantic identity depend on collection time.

Phase 6I now applies the following separation:

- `createdAtUtc` remains a required retained UTC field;
- it remains included in the manifest evidence hash;
- it is excluded from the semantic projection;
- identical governed content collected at different times has the same semantic hash and different evidence hashes.

This change does not alter command results, engineering values, artifact content hashes, exact-head binding or release status.

## Transitive checks

The aggregate executes the existing simulated/static qualification boundaries for:

- Phase 6A and Phase 6B external qualification;
- Phase 6C persisted external intake;
- Phase 6D persisted internal intake;
- Phase 6E runtime release orchestration;
- Phase 6F internal collection;
- Phase 6G runtime assembly;
- Phase 6H external materialization;
- interface scope and recovery;
- nozzle and B31.3 application;
- presentation and export currency;
- B-4.0 caller-supplied code-data source authority.

It does not execute a real engineering model, a commercial program, the real Phase 6F command plan, performance measurement or rollback rehearsal.

## Qualification versus release evidence

A successful aggregate result proves only that the coded negative controls and source guards remain present and that their simulated fixtures pass. It is explicitly ineligible for project or release evidence.

Release closure still requires:

1. one newly selected immutable exact head after merge;
2. executable GitHub Actions steps and downloadable logs;
3. caller-approved project engineering authority;
4. seven non-fictional external records;
5. successful same-head Phase 6F and Phase 6H artifacts;
6. successful Phase 6G runtime bundle;
7. successful Phase 6E certification and full repository gate;
8. applicable BM-01 through BM-22 evidence;
9. independent review closing `AUD-A7-001` and G0 through G10.

## Explicit exclusions

- No tolerance is relaxed.
- No production result creates its own expected value.
- No real external authority is fabricated.
- No runtime release path is written into the committed template.
- No gap, lift-off, contact or friction result is represented as linear-release authority.
- No licensed or vendor numerical table is embedded in source.
