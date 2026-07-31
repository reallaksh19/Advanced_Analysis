# Priority 2 FEA Update Plan

Status: **[PROPOSED] — no Priority 2 FEA implementation or qualification evidence exists yet**

This plan follows the thermal support, anchor, and nozzle concept note and the
topology/SVG adoption procedure. Priority 1 first-cut screening is deliberately
separate. No first-cut result may be relabelled as an FEA reaction.

## Release sequence

### Phase 1 — Analysis gateway and result authority

Create the missing end-to-end LFEA consumer/orchestrator. It must bind the
shared-model, topology, attachment, restraint, profile, load-case, solver,
recovery, and presentation identities. A result is current only when every
parent hash matches and every required stage is qualified.

Exit criteria:

- one public gateway owns execution;
- partial, blocked, and stale chains cannot become presentation results;
- every result has a deterministic semantic identity and complete parent hashes;
- the currently orphaned `lfea-consumer` checks import a real module.

### Phase 2 — Support, anchor, and nozzle interfaces

Define attachment stations, right-handed local axes, offsets, six-DOF
constraint mappings, and equipment-interface records. Compile only bilateral
restraints, anchors, prescribed movements, and authorized linear springs.

Gap, lift-off, friction, unilateral contact, and nonlinear springs stay blocked
until a separately qualified nonlinear package exists. Workspace code must not
infer a missing restraint, offset, axis, stiffness, or equipment reference.

### Phase 3 — Thermal and structural load-case orchestration

Compile gravity, pressure, thermal strain, and prescribed movements into the
existing B-2/B-3 numerical core. Combinations are allowed only when an
explicitly versioned combination profile authorizes them. Temperature fields
must bind material, section, reference temperature, operating temperature, and
source identities.

### Phase 4 — Reaction and interface-load recovery

Recover reactions from the solved constrained system. Transform global
force/moment vectors into the declared support or nozzle-local frame. Transfer
moments to the equipment reference point with:

`M_reference = M_node + r × F`

Produce support, anchor, and nozzle envelopes with load-case, coordinate-frame,
offset, units, sign convention, and semantic lineage.

### Phase 5 — Read-only SVG/workspace presentation

SVG, topology rows, properties, and inspectors consume sealed results only.
Every visible value must show method, load case, frame, units, result hash,
parent hashes, and stale state. These views must not calculate loads, transform
vectors, apply offsets, choose combinations, or infer mechanics.

### Phase 6 — Allowables, export, scale, and validation

Equipment/nozzle comparisons require an authorized allowable profile with
source and revision. Add deterministic exports and sparse-solver/performance
work only after correctness gates pass. Release requires thermal, support,
anchor, nozzle, equilibrium, stale-state, UI, and real-model reconciliation.

## Appendix A — Phase-wise code sketches

All snippets are **[PROPOSED]**. They illustrate contracts and boundaries; they
are not qualified code and must not be copied into production without the
phase-specific checks below.

### A1. Result authority contract

```js
// [PROPOSED]
export function sealLfeaResultChain(input) {
  assertExactKeys(input, [
    'sharedModel', 'topology', 'attachments', 'restraints', 'profile',
    'loadCases', 'compiledModel', 'solution', 'recovery',
  ]);
  const parents = bindQualifiedParents(input);
  if (parents.some((row) => row.qualification !== 'QUALIFIED')) {
    throw new TypeError('A partial or unqualified LFEA chain cannot be sealed.');
  }
  return withSemanticHash({
    schema: 'lfea-result-chain/v1',
    parentHashes: Object.fromEntries(parents.map((row) => [row.role, row.semanticHash])),
    recovery: input.recovery,
    status: 'QUALIFIED',
  });
}
```

### A2. Interface and six-DOF constraint compilation

```js
// [PROPOSED]
export function compileEquipmentInterface(record, attachment, frame) {
  validateRightHandedFrame(frame);
  assertFiniteVector(record.offsetFromNodeM, 3);
  return withSemanticHash({
    schema: 'lfea-equipment-interface/v1',
    interfaceId: record.interfaceId,
    nodeId: attachment.nodeId,
    localFrame: frame,
    offsetFromNodeM: record.offsetFromNodeM,
    dofConstraints: record.dofConstraints.map(compileAuthorizedDof),
    allowableProfileHash: record.allowableProfileHash,
    sourceEvidence: record.sourceEvidence,
  });
}

function compileAuthorizedDof(value) {
  if (!['FREE', 'BILATERAL_FIXED', 'PRESCRIBED', 'LINEAR_SPRING'].includes(value.kind)) {
    throw new TypeError(`Unsupported or nonlinear DOF kind: ${value.kind}.`);
  }
  return value;
}
```

### A3. Thermal/structural case compilation

```js
// [PROPOSED]
export function compileLfeaLoadCase(caseRecord, model, profile) {
  assertParentHash(caseRecord.sharedModelHash, model.sharedModelSemanticHash);
  return withSemanticHash({
    schema: 'lfea-compiled-load-case/v1',
    loadCaseId: caseRecord.loadCaseId,
    gravity: compileExplicitGravity(caseRecord.gravity, model),
    pressure: compileExplicitPressure(caseRecord.pressure, model),
    thermalStrain: compileThermalStrain(caseRecord.temperature, model, profile),
    prescribedMovements: compilePrescribedMovements(caseRecord.movements, model),
    combinationProfileHash: caseRecord.combinationProfileHash,
  });
}
```

### A4. Qualified orchestration

```js
// [PROPOSED]
export function runQualifiedLfea(input) {
  const compiled = compileLfeaModel(input);
  if (compiled.audit.status !== 'QUALIFIED') {
    throw new TypeError(`LFEA compilation blocked: ${compiled.audit.blockers.join(', ')}`);
  }
  const solution = solveCompiledLfea(compiled);
  assertEquilibrium(solution, input.profile.equilibriumTolerances);
  const recovery = recoverInterfaceLoads(compiled, solution);
  return sealLfeaResultChain({ ...input, compiledModel: compiled, solution, recovery });
}
```

### A5. Reaction recovery

```js
// [PROPOSED]
export function recoverConstrainedReaction(system, solution, constrainedDofIds) {
  const residual = subtract(multiply(system.stiffness, solution.displacements), system.loads);
  return constrainedDofIds.map((dofId) => ({
    dofId,
    reaction: residual[system.dofIndex[dofId]],
    unit: system.dofUnits[dofId],
  }));
}
```

### A6. Local frame and reference-point transfer

```js
// [PROPOSED]
export function transformInterfaceLoad(globalLoad, interfaceRecord) {
  const forceLocal = multiplyMatrixVector(interfaceRecord.globalToLocal, globalLoad.forceN);
  const nodeMomentLocal = multiplyMatrixVector(
    interfaceRecord.globalToLocal,
    globalLoad.momentNm,
  );
  const transferredMoment = add(
    nodeMomentLocal,
    cross(interfaceRecord.offsetNodeToReferenceLocalM, forceLocal),
  );
  return { forceLocalN: forceLocal, momentAtReferenceLocalNm: transferredMoment };
}
```

### A7. Stale-safe presenter

```js
// [PROPOSED]
export function presentInterfaceResult(result, currentParents) {
  const stale = Object.entries(result.parentHashes)
    .some(([role, hash]) => currentParents[role] !== hash);
  return {
    status: stale ? 'STALE' : result.status,
    canCopy: !stale && result.status === 'QUALIFIED',
    canExport: !stale && result.status === 'QUALIFIED',
    values: stale ? [] : result.interfaceLoads,
  };
}
```

### A8. Source guard

```js
// [PROPOSED]
const forbiddenUiTokens = [
  'assembleGlobalStiffness',
  'recoverConstrainedReaction',
  'cross(offset',
  'thermalStrain',
];
assertFilesDoNotContain('src/workspace', forbiddenUiTokens);
assertEveryResultContractContains([
  'semanticHash', 'parentHashes', 'loadCaseId', 'frameId', 'units', 'status',
]);
```

## Appendix B — Pass-test matrix

Every analytical fixture is **[SIMULATED]**. Status remains `NOT RUN` until its
phase is implemented. A row may become `PASS` only when its command output and
artifact are retained by the repository’s normal test workflow.

| Test ID | Input basis | Expected result | Tolerance | Command | Status |
|---|---|---|---|---|---|
| FEA-GW-01 | [SIMULATED] complete parent chain | One qualified sealed result | Exact hashes | `npm run check:lfea-consumer` | NOT RUN |
| FEA-GW-02 | [SIMULATED] changed profile hash | Result rejected as stale | Exact hashes | `npm run check:lfea-consumer` | NOT RUN |
| FEA-GW-03 | [SIMULATED] missing recovery parent | Seal blocked | Exact | `npm run check:lfea-consumer` | NOT RUN |
| FEA-IF-01 | [SIMULATED] bilateral support | Correct six-DOF map | Exact | `npm run check:lfea-interfaces` | NOT RUN |
| FEA-IF-02 | [SIMULATED] anchor with offset | Station/frame/offset retained | 1e-12 m | `npm run check:lfea-interfaces` | NOT RUN |
| FEA-IF-B01 | [SIMULATED] gap/friction input | Compilation blocked | Exact | `npm run check:lfea-interfaces` | NOT RUN |
| FEA-TH-01 | [SIMULATED] restrained bar ΔT | Analytical axial thermal reaction | Profile tolerance | `npm run check:lfea-thermal` | NOT RUN |
| FEA-TH-02 | [SIMULATED] free bar ΔT | Zero support reaction, free expansion | Profile tolerance | `npm run check:lfea-thermal` | NOT RUN |
| FEA-TH-B01 | Missing reference temperature | Case blocked | Exact | `npm run check:lfea-thermal` | NOT RUN |
| FEA-RXN-01 | [SIMULATED] fixed beam gravity | Recovered equilibrium reactions | Force/moment profile | `npm run check:lfea-reactions` | NOT RUN |
| FEA-RXN-02 | [SIMULATED] prescribed movement | Reaction matches analytical solution | Profile tolerance | `npm run check:lfea-reactions` | NOT RUN |
| FEA-FRM-01 | [SIMULATED] rotated local frame | Force/moment rotation correct | 1e-12 relative | `npm run check:lfea-interface-frames` | NOT RUN |
| FEA-OFF-01 | [SIMULATED] eccentric force | `M_node + r × F` exactly recovered | 1e-10 N·m | `npm run check:lfea-interface-frames` | NOT RUN |
| FEA-ENV-01 | [SIMULATED] three qualified cases | Deterministic component envelopes | Exact ordering | `npm run check:lfea-envelopes` | NOT RUN |
| FEA-ALL-B01 | Missing allowable source | Comparison blocked; loads retained | Exact | `npm run check:lfea-allowables` | NOT RUN |
| FEA-UI-01 | [SIMULATED] sealed current result | SVG displays case/frame/units/hash | Pixel + contract | `npm run check:lfea-interface-e2e` | NOT RUN |
| FEA-UI-02 | [SIMULATED] parent mutation | Values hidden; STALE visible | Exact | `npm run check:lfea-interface-e2e` | NOT RUN |
| FEA-UI-03 | [SIMULATED] stale result | Copy/export disabled | Exact | `npm run check:lfea-interface-e2e` | NOT RUN |
| FEA-EXP-01 | [SIMULATED] qualified result | Byte-deterministic export | Exact bytes | `npm run check:lfea-interface-export` | NOT RUN |
| FEA-REAL-01 | User-supplied project model | Reconciled support/anchor/nozzle loads | Approved benchmark | Project command TBD | NOT RUN |

## Appendix C — Anti-drift rules

1. Mechanics live under `src/core`; SVG and workspace modules are read-only.
2. UI code may never generate mass, reaction, sag, stress, thermal strain,
   contact state, lift-off, friction, local-frame transformation, or offset
   moment.
3. Empirical reactions and rating-derived masses are prohibited.
4. No hidden restraint, stiffness, gravity, temperature, load combination,
   allowable, SIF, stress index, corrosion, or mill-tolerance value is allowed.
5. A gap, unilateral support, lift-off, friction, or nonlinear result is blocked
   until a qualified nonlinear solver package and benchmarks exist.
6. Imported source bytes and source objects are immutable. Enrichment and
   accepted overrides are separately hashed sidecars.
7. Every derived artifact must contain all direct parent hashes. Missing,
   mismatched, partial, or unqualified parents block sealing.
8. Stale results cannot be displayed as current, copied, compared to an
   allowable, included in an envelope, or exported.
9. Allowables require an authorized source and revision; the application
   contains no embedded equipment/nozzle allowable table.
10. “PASS”, “qualified”, or code-compliance wording requires retained evidence
    from the named command. A planned, skipped, mocked, or unrun check cannot be
    reported as passing.
11. Analytical fixtures are labelled `[SIMULATED]`; engineering validation is
    not claimed until a real imported model is reconciled.
12. Priority 1 first-cut values retain their screening labels and can never be
    promoted to LFEA reactions by a presenter.

## Current repository blocker

The repository currently contains `lfea-consumer` checks that reference a
missing `src/core/lfea-consumer/index.js`. This is the first Priority 2 gap and
must be resolved in Phase 1. It is not a reason to delete, skip, or weaken those
checks, and it does not invalidate a fully passing Priority 1 gate.
