# LFEA B-2.0 deliberate-regression evidence

Each mutation was applied separately to a temporary complete package copy and removed immediately after the failing command. No mutation is present in the implementation.

| Mutation | Command | Result | Failing test or guard |
|---|---|---|---|
| Swap RY and RZ in DOF_ORDER | `node scripts/lfea-b2.0-conventions-check.mjs` | FAIL as required (exit 1) | `B20-T01 Exact six-DOF order; B20-T07 Element indices are exactly 0-11` |
| Change kernel length from m to mm | `node scripts/lfea-b2.0-conventions-check.mjs` | FAIL as required (exit 1) | `B20-T09 Exact unit record is accepted; B20-T11 Alternate units are rejected` |
| Remove absoluteTemperature | `node scripts/lfea-b2.0-conventions-check.mjs` | FAIL as required (exit 1) | `B20-T09 Exact unit record is accepted; B20-T10 Missing and unexpected units are rejected; B20-T11 Alternate units are rejected` |
| Reverse the transformation identity | `node scripts/lfea-b2.0-conventions-check.mjs` | FAIL as required (exit 1) | `B20-T12 Exact convention record is accepted; B20-T14 Changed transformation identity is rejected` |
| Move J:UX away from index 6 | `node scripts/lfea-b2.0-conventions-check.mjs` | FAIL as required (exit 1) | `B20-T07 Element indices are exactly 0-11` |
| Allow an empty node ID | `node scripts/lfea-b2.0-conventions-check.mjs` | FAIL as required (exit 1) | `B20-T16 Canonical node IDs are validated` |
| Change actionTarget to CONNECTED_JOINT | `node scripts/lfea-b2.0-conventions-check.mjs` | FAIL as required (exit 1) | `B20-T12 Exact convention record is accepted; B20-T15 Changed end-action semantics are rejected; B20-A01 Hand-computed axial end-action signs` |
| Change recoveryShape without changing identity | `node scripts/lfea-b2.0-conventions-check.mjs` | FAIL as required (exit 1) | `B20-T12 Exact convention record is accepted; B20-T15 Changed end-action semantics are rejected` |
| Use localeCompare() | `node scripts/lfea-b2.0-source-guard.mjs` | FAIL as required (exit 1) | `AssertionError [ERR_ASSERTION]: Canonical ordering must not use localeCompare().` |
