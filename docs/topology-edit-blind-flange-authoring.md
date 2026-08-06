# Governed Blind Flange Authoring

## Scope

The production 3D Edit HUD exposes **Blind flange** as a terminal-component workflow:

1. select Blind flange;
2. select one graph-open endpoint of a straight canonical pipe edge;
3. choose one exact compatible catalogue record;
4. inspect read-only engineering evidence;
5. Preview the governed ghost candidate;
6. Validate the exact final topology in the worker;
7. Apply one atomic journal command;
8. Undo or redo by canonical journal replay.

Blind flange authoring does not introduce a second topology authority. It uses the certified `INSERT_INLINE_COMPONENT` command with explicit boundary placement.

## Canonical topology strategy

A blind flange is retained canonically as:

- `entityType: FLANGE`;
- `flangeType: BLIND`;
- one exact immutable catalogue binding;
- one boundary placement: `FROM_BOUNDARY` or `TO_BOUNDARY`;
- one orientation selected from endpoint position:
  - host FROM endpoint → `FROM_BOUNDARY` + `TO_FROM`;
  - host TO endpoint → `TO_BOUNDARY` + `FROM_TO`.

The command replaces one terminal straight edge with:

- one positive-length retained pipe edge;
- one positive-thickness blind flange edge;
- one generated mating node.

The original graph-open terminal node remains the closed face. No zero-length edge, endpoint shortcut, duplicate boundary primitive, or artificial micro-spool is created.

## Catalogue authority

The immutable v3 catalogue accepts `flangeType: BLIND` only when the record contains:

- nominal size and outside diameter;
- piping class and pressure class;
- material specification;
- flange facing;
- flange thickness and component length, which must be equal;
- component mass;
- flange outside diameter;
- bolt-circle diameter;
- bolt-hole count and diameter;
- `PIPE_TERMINAL` pipe-side connection;
- `CLOSED_<facing>` closed-face connection;
- exact source document, revision, and catalogue path.

The production demo record is `BLIND-FLANGE-DN50-150-RF-A`.

Ordinary standalone Flange authoring explicitly excludes `BLIND` records. Valve assemblies also cannot consume the blind record because its terminal connection evidence is incompatible with valve mating requirements.

## Fail-closed validation

The planner rejects:

- a node with degree other than one;
- a non-straight terminal host edge;
- edge or terminal-node dependants;
- size, outside-diameter, piping-class, or record mismatches;
- insufficient host length;
- altered catalogue-owned HUD evidence.

Final-state command-effect validation independently rejects:

- interior blind flange insertion;
- reversed boundary orientation;
- assembly-bound blind flanges;
- non-degree-one terminal results;
- retained terminal dependants;
- incorrect `PIPE_TERMINAL` / `CLOSED_<facing>` orientation;
- changed record provenance, flange type, length, or thickness evidence.

This second validation layer prevents a manually constructed or tampered command payload from bypassing the production HUD planner.

## Qualification

`3D Edit Blind Flange Authoring` checks the exact PR head and executes:

- deterministic FROM- and TO-boundary contracts;
- exact catalogue filtering and read-only authority checks;
- canonical node/edge shape and positive-length assertions;
- command-effect tamper rejection;
- journal undo/redo hash replay;
- regression contracts for ordinary Flange/Reducer, inline insertion, valve assemblies, authoring sessions, and composite operations;
- a production Chromium walkthrough against `public/fixtures/topology-edit-20-element-demo.staged.json` using the canonical object tree, ghost preview, worker validation, atomic Apply, undo, and redo.
