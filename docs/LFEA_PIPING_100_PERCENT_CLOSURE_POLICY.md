# LFEA Piping 100% Closure Policy

Status: ACTIVE GOVERNANCE POLICY

## Meaning of 100% closure

`100%` means every declared release gate has objective evidence and no unresolved, not-run, stale, simulated-only, or undocumented item is represented as production qualification. It does not mean a mathematical claim of zero defect probability.

The program remains `BLOCKED` unless every mandatory gate below is `VERIFIED` at one clean exact head.

## Mandatory gates

| Gate | Required evidence | Fail-closed condition |
|---|---|---|
| G0 Exact head | Clean checkout, exact commit, lock hash, runtime manifest, retained CI logs | Dirty tree, untracked code, head mismatch, missing log or artifact |
| G1 Upstream numerical chain | B-2.x through B-4.0 checks on exact head | Any failed, skipped, stale or ancestor-only check |
| G2 T0 application sequencing | Registered consumer check; deterministic current-only B-2.5 through B-3.4 result | Partial chain, null mandatory parent, stale parent, simulated result promoted beyond T0 |
| G3 Source orchestration | Engineering source compiled into B-2.5 and B-3.0 through public authorities | Precompiled-only intake represented as end-to-end application execution |
| G4 Interfaces | Governed support, anchor and nozzle definitions, frames, offsets and six-DOF mappings | Missing or inferred frame, offset, station, stiffness or sign convention |
| G5 Interface recovery | Reactions grouped from B-3.3, transformed, reference-point transferred and enveloped | Empirical reaction, UI transformation, omitted or double-applied `r x F` |
| G6 Code and allowables | B31.3 application orchestration and caller-supplied nozzle allowable assessment | Embedded allowable, `OPERATING` represented as compliance, missing dataset source |
| G7 Presentation/export | Read-only stale-safe views and byte-deterministic exports | Stale value displayed/copied/exported or renderer performs mechanics |
| G8 Real-model reconciliation | User-controlled imported model, approved reference values and signed reconciliation | Only `[SIMULATED]` or analytical fixtures available |
| G9 Commercial corroboration | Selected cases compared with a named recognized pipe-stress program and explained differences | Missing comparison, undocumented formulation difference or cherry-picked output |
| G10 Release/rollback | Exact-head full gate, performance envelope, rollback rehearsal and signed disposition | Missing artifacts, failed workflow, unrehearsed rollback |

## Status vocabulary

Only these statuses are allowed:

- `VERIFIED`
- `PARTIALLY_VERIFIED`
- `CONTRADICTED`
- `UNRESOLVED_GATE`
- `NOT_IMPLEMENTED`
- `NOT_APPLICABLE`

Program release is permitted only when every mandatory gate is `VERIFIED`.

## Simulated and analytical evidence

`[SIMULATED]` and closed-form analytical fixtures qualify implementation behaviour only. They cannot satisfy G8 or G9 and cannot support a production engineering conclusion.

## External evidence rule

Real-model and commercial evidence are external dependencies. The repository shall provide schemas, validators and comparison commands, but release remains blocked until project-controlled evidence is supplied and accepted. Empty placeholders, self-authored expected values and copied solver output without source identity are rejected.

## LFEA-007 separation

The `lfea-007` continuum Local FEA consumer is a separate application work package. It is not Priority 2 piping completion. It must be either:

1. fully restored, registered and independently qualified; or
2. formally retired with its workflow, scripts, registry claim and documentation removed together.

A broken but advertised `IMPLEMENTED` state is prohibited.

## Documentation corrections

The repository facts are:

- `src/core/workspace-consumers/` exists;
- the correct piping statement is `no complete end-to-end source-to-interface-to-code-to-presentation gateway exists`;
- `src/core/lfea-consumer/` belongs to the separate continuum `lfea-007` path;
- `src/core/linear-piping-analysis-consumer/` is the bounded piping T0 path.

## Release assertion

No document, UI, test log or PR may state that the assembled piping application is qualified until G0 through G10 are verified at the same exact head.
