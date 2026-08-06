# 10-Element XYZ Branch Demo

## Purpose

The existing `topology-edit-20-element-demo.staged.json` fixture now contains an embedded scenario named `XYZ-10-COMPONENT-BRANCH`. The original 20-object baseline remains unchanged. Selecting **XYZ Branch** in the Workspace materializes the base model plus the embedded scenario as one source-hashed 32-object dataset.

## Added branch inventory

The scenario extends the existing `T-001` / `P-007` tee branch with exactly ten piping elements:

1. `E-003` — DN50 elbow, Y-to-Z
2. `P-009` — DN50 Z riser
3. `E-004` — DN50 elbow, Z-to-X
4. `P-010` — DN50 X run
5. `R-002` — DN50-to-DN25 reducer
6. `P-011` — DN25 valve approach
7. `O-002` — three-port DN25 × DN15 Olet junction
8. `V-002` — DN25 gate valve
9. `F-002` — DN25 weld-neck flange
10. `P-012` — DN15 Y branch pipe

The combined branch therefore covers Tee, Pipe, Elbow, Reducer, Valve, Flange, and Olet component families and traverses all three source axes. Nine new components are retained as canonical edges; `O-002` is retained as a canonical three-port junction with separate host-in, host-out, and branch nodes.

## Supports

Two new support objects are materialized with the branch:

- `S-006` — REST attached to `P-009`
- `S-007` — GUIDE attached to `P-011`

The support and guide intentionally attach to different pipe elements. Both must resolve through the normal support-attachment and restraint-capability authorities.

## Loading workflow

1. Open **Workspace**.
2. Select **XYZ Branch** from the dataset toolbar.
3. Confirm the dataset summary reports 32 objects, 25 piping objects, and 7 supports.
4. Open **3D Edit**.
5. Inspect the Y-to-Z elbow and riser, the Z-to-X elbow and run, the reducer, the three-port Olet, the valve/flange train, and the DN15 side branch.
6. Verify the REST on `P-009` and GUIDE on `P-011` are visible and selectable.

The legacy **3D Demo** button continues to load only the original 20-object baseline.

## Qualification

The dedicated exact-head workflow runs:

- source syntax and JSON validation;
- embedded-scenario inventory, axis, component, and support contracts;
- materialization into a source-hashed 32-object package;
- workspace dataset, topology graph, support attachment, restraint, and canonical topology checks;
- exact canonical Olet-junction connectivity to `P-011`, `V-002`, and `P-012`;
- a Chromium walkthrough through Workspace and 3D Edit;
- the legacy 20-element loader regression.
