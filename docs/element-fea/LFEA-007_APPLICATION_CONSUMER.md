# LFEA-007 — Read-Only Local FEA Application Consumer

## Authority and live integration baseline

LFEA-007 implements the read-only Local FEA application-shell consumer authorized by the LFEA-007 Work Pack. The implementation was originally developed from `c49749f447880261eb2126b3dd6046faa67ce88f` and was reconciled before merge with the live baseline:

```text
7e12954f2923c2df574bf94cb0d94811c813d463
```

The consumer begins only after a qualified `lfea-engineering-review/v1` or `lfea-evidence-export/v1` has already been produced. It does not create, solve, modify, project, qualify, accept, or regenerate engineering evidence.

## Application-shell evolution

W10.12 already owns these closed contracts:

```text
workspace-consumer-registry/v9
application-view-state/v9
```

LFEA-007 therefore adds additive successors:

```text
workspace-consumer-registry/v10
application-view-state/v10
```

The v1 through v9 registries and view states remain closed. The v10 navigation order is:

```text
HOME
WORKSPACE
LOAD_CALC
PCF
SKETCHER
THREE_D_CALC
PIPE_SOLVER
LOCAL_FEA
REPORTS
QA
SETTINGS
DEBUG
```

`LOCAL_FEA` is implemented, independent of Workspace contract readiness, and advertises only read-only review actions. `ApplicationShellController` remains the sole application-view-state owner. The W10.12 QA consumer remains implemented and is composed with the Local FEA consumer rather than replaced.

## Consumer contracts

The new application-consumer contracts are:

```text
lfea-consumer-profile/v1
lfea-consumer-session/v1
lfea-consumer-view-model/v1
```

The profile is constructed explicitly during bootstrap with these limits:

| Capacity | Value |
|---|---:|
| Source bytes | 16,777,216 |
| Nodes | 20,000 |
| Elements | 10,000 |
| Raw-stress rows | 40,000 |
| Projected-stress rows | 50,000 |
| Convergence rows | 10,000 |
| Supplied export files | 128 |
| Table page size | 100 |

The profile, session, and view model use closed keys, deterministic semantic hashes, and immutable values. Source file names and browser-only state do not participate in engineering semantic identity.

## Transactional source intake

The browser controller checks `File.size` before reading. It then decodes UTF-8 with fatal decoding and accepts only JSON object roots whose schema is exactly one of:

```text
lfea-engineering-review/v1
lfea-evidence-export/v1
```

Direct engineering reviews must be `QUALIFIED_FOR_REVIEW` and pass the existing `validateEngineeringReview()` authority.

Evidence exports must be `QUALIFIED_EXPORT` and pass the existing `validateEvidenceExport()` authority. Intake additionally requires exactly one UTF-8 `application/json` `review.json`, matching content hash and byte length, a qualified embedded review, exact review/export identity and semantic-hash agreement, and matching manifest evidence.

Replacement is transactional. A candidate is committed only after complete validation and capacity qualification. Rejected or capacity-blocked candidates preserve the previous accepted review, export, and view model and expose no partial candidate tables.

## Exact selection and engineering authority

One canonical selection-identity authority is used by SVG geometry, tables, selected-state highlighting, source-record resolution, and details display.

Examples include:

```text
RAW_STRESS_LOCATION      <elementId>:<resultLocationId>
REACTION                 <nodeId>:<component>
PROJECTED_NODAL_LOCATION <nodeId>:<projectionPatchId>:<stressComponent>
PROJECTED_CORNER_LOCATION <elementId>:<cornerId>
CONVERGENCE_QUANTITY     <quantityId> or <levelId>
```

Selection resolves against the complete qualified view model, not only the current table page, and never uses substring matching.

Raw stress is the default and authoritative stress mode:

```text
AUTHORITATIVE_RAW_ELEMENT_OR_INTEGRATION_POINT_STRESS
```

T3 elements use one discrete fill from the exact constant-stress record. Q4 stress uses markers at exact qualified integration-point coordinates. The consumer does not average, extrapolate, smooth, interpolate, recover contours, create isolines, or infer governing stress from presentation colours.

Projected stress is hidden by default and can be shown only when the source marks it:

```text
AVAILABLE_NON_AUTHORITATIVE
NON_AUTHORITATIVE_REVIEW_PROJECTION
```

Projected panels display the required non-authoritative warning and never replace governing raw-stress evidence.

The deformed layer uses the exact supplied `deformedX` and `deformedY` review coordinates. The supplied deformation scale is displayed but cannot be edited.

The Local FEA view uses ordinary HTML and SVG. It creates no canvas, WebGL host, Three.js scene, React tree, Zustand store, or second application shell. The existing Workspace WebGL host remains the only WebGL host.

## Determinism

Canonical consumer ordering uses an explicit code-unit lexical comparator. It does not use implicit-locale `localeCompare()` for semantic ordering. Supplied files, diagnostics, selection identities, tables, and view-model hashes are independent of browser locale, operating system, or ICU configuration.

## Workspace isolation

The Local FEA controller owns only its accepted review/export bundle, immutable consumer session, view model, selection, display options, pagination, and intake diagnostics. It does not read or write `WorkspaceState`, create an analysis session, append to the analysis ledger, request solving, invoke Pipe Solver or LAFEA, or change Settings.

Existing dataset-replacement navigation policy remains intact: the shell may return to Workspace when a dataset is replaced, but the accepted Local FEA source remains loaded.

## Supplied-file downloads

Downloads are available only from a qualified evidence export. Immediately before download, the consumer rechecks the exact supplied file's UTF-8 encoding, content hash, byte length, and manifest evidence. The downloaded text is the exact supplied content. No review, CSV, Markdown, manifest, or ZIP is regenerated.

## Accessibility

The implementation provides:

- keyboard-operable application navigation and exact table-row selection;
- labelled buttons, source controls, and display controls;
- `aria-live` source status;
- selected state on evidence-section controls;
- SVG title and description;
- non-colour selection indicators;
- semantic table headers and page status;
- assistive-technology-visible projected-stress warnings;
- focus transfer to rejection diagnostics;
- listener and object-URL cleanup during teardown.

## Qualification

The dedicated static suite covers the explicit profile, closed contracts, immutable session/view model, direct review and export intake, exact embedded review extraction, capacity limits, v10 registration, v1–v9 preservation, exact record selection, locale-independent ordering, Workspace isolation, transactional replacement, safe downloads, and explicit failure cases.

The targeted Playwright suite covers navigation, empty state, direct review and export imports, invalid and oversized source containment, exact supplied geometry, T3 and Q4 raw-stress rendering, projected-stress warnings, exact raw/reaction/projected/convergence selection, byte-identical downloads, Workspace isolation, single-WebGL-host preservation, no-canvas enforcement, keyboard navigation, and teardown.

The required-baseline LFEA-006 behavioural fixtures predate the now-mandatory review-input semantic hash. The LFEA-007 workflow applies a temporary test-harness-only compatibility transformation while running the predecessor behavioural suite, restores the predecessor files before source-boundary enforcement, and commits no predecessor source changes.

## Commands

```text
npm run check:lfea.007:static
npm run check:lfea.007:browser
npm run check:lfea.007
npm run build
```

The aggregate QA entry adds one LFEA-007 static registration and does not replace or remove existing W10, LFEA, or LAFEA registrations.
