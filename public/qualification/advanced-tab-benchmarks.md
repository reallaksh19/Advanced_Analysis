# Advanced Analysis Tab Qualification

Suite semantic hash: `fnv1a64:d29d8ded0ba55aa0`

| Tab | Status | Passed | Required | Failed | Missing |
|---|---:|---:|---:|---|---|
| WORKSPACE | Qualified | 5 | 5 | — | — |
| LOAD_CALC | Qualified | 5 | 5 | — | — |
| LAFEA | Qualified | 7 | 7 | — | — |
| LFEA | Qualified | 6 | 6 | — | — |

## Evidence

### LAFEA / lafea-browser-workflow

- Status: PASS
- Category: BROWSER_WORKFLOW
- Evidence basis: [SIMULATED]
- Input semantic hash: `sha256:804ed0b667261ea7131e55d1a120a58053a05dd025c97677365b3e0060ce8e82`
- Result semantic hash: `fnv1a64:1281a1a1e0095a6b`
- Expected: `{"passed":true,"exitCodes":[0]}`
- Actual: `{"passed":true,"exitCodes":[0]}`
- Tolerance: `null`
- Diagnostics: —

### LAFEA / lafea-editor-kernel-workflow

- Status: PASS
- Category: EDITOR_TO_KERNEL
- Evidence basis: [SIMULATED]
- Input semantic hash: `sha256:02d1835d6197bc4eb636ea9ace776815d241ec8b2557cff5123157a5fd5ab36b`
- Result semantic hash: `fnv1a64:e27e3061f09ddb32`
- Expected: `{"passed":true,"exitCodes":[0]}`
- Actual: `{"passed":true,"exitCodes":[0]}`
- Tolerance: `null`
- Diagnostics: —

### LAFEA / lafea-stage-1-foundation

- Status: PASS
- Category: LAFEA_1
- Evidence basis: ANALYTICAL
- Input semantic hash: `sha256:0f26bc23c5784584e630277106e9aa1a41457ec78c03b006c1c3098641b172a6`
- Result semantic hash: `fnv1a64:d560e182fd055a68`
- Expected: `{"passed":true,"exitCodes":[0,0,0,0]}`
- Actual: `{"passed":true,"exitCodes":[0,0,0,0]}`
- Tolerance: `null`
- Diagnostics: —

### LAFEA / lafea-stage-2-screening

- Status: PASS
- Category: LAFEA_2
- Evidence basis: ANALYTICAL
- Input semantic hash: `sha256:e0564db3df1de4c782c5a75a5b6ef1bacf9132f61645871c69a242c0ea1e89d7`
- Result semantic hash: `fnv1a64:3a215d33c00c39a2`
- Expected: `{"passed":true,"exitCodes":[0,0,0,0,0,0,0]}`
- Actual: `{"passed":true,"exitCodes":[0,0,0,0,0,0,0]}`
- Tolerance: `null`
- Diagnostics: —

### LAFEA / lafea-stage-3-continuum

- Status: PASS
- Category: LAFEA_3
- Evidence basis: ANALYTICAL
- Input semantic hash: `sha256:1cc3071274e36113626a217e9a75441e76aa5834afaea8526e74ef5f70560a94`
- Result semantic hash: `fnv1a64:04918373d6d519ed`
- Expected: `{"passed":true,"exitCodes":[0,0,0,0,0,0]}`
- Actual: `{"passed":true,"exitCodes":[0,0,0,0,0,0]}`
- Tolerance: `null`
- Diagnostics: —

### LAFEA / lafea-stage-4-shell

- Status: PASS
- Category: LAFEA_4
- Evidence basis: ANALYTICAL
- Input semantic hash: `sha256:6a4e3248056fd57006a713d37a5978662439611b82d918b54b1ae266c9fe4087`
- Result semantic hash: `fnv1a64:8df529b1b1f2ed6d`
- Expected: `{"passed":true,"exitCodes":[0,0,0,0,0,0,0,0,0]}`
- Actual: `{"passed":true,"exitCodes":[0,0,0,0,0,0,0,0,0]}`
- Tolerance: `null`
- Diagnostics: —

### LAFEA / lafea-stage-5-trunnion

- Status: PASS
- Category: LAFEA_5
- Evidence basis: ANALYTICAL
- Input semantic hash: `sha256:4b8dc2de9d1e07d8c834500983a4c4174169358841823d1358dbf4a0643fc2bc`
- Result semantic hash: `fnv1a64:1d62349cea8f08fa`
- Expected: `{"passed":true,"exitCodes":[0,0,0,0,0,0,0]}`
- Actual: `{"passed":true,"exitCodes":[0,0,0,0,0,0,0]}`
- Tolerance: `null`
- Diagnostics: —

### LFEA / lfea-browser-workflow

- Status: PASS
- Category: BROWSER_WORKFLOW
- Evidence basis: [SIMULATED]
- Input semantic hash: `sha256:fdf03692b953fe948949d3d9068cbe946a5c713a500b492f3798981b8d272f3d`
- Result semantic hash: `fnv1a64:84d1e9ccac462fa3`
- Expected: `{"passed":true,"exitCodes":[0]}`
- Actual: `{"passed":true,"exitCodes":[0]}`
- Tolerance: `null`
- Diagnostics: —

### LFEA / lfea-dense-sparse-parity

- Status: PASS
- Category: SOLVER_PARITY
- Evidence basis: ANALYTICAL
- Input semantic hash: `sha256:ccbaea92059f187e770e0728e4ca9f223f9a799f7ed05fb7cecfdcc48383c98d`
- Result semantic hash: `fnv1a64:e9b0812297162dde`
- Expected: `{"passed":true,"exitCodes":[0,0,0,0]}`
- Actual: `{"passed":true,"exitCodes":[0,0,0,0]}`
- Tolerance: `null`
- Diagnostics: —

### LFEA / lfea-editor-review-export

- Status: PASS
- Category: EDITOR_TO_EVIDENCE
- Evidence basis: [SIMULATED]
- Input semantic hash: `sha256:b2b22a624e71cb2c8a1e3b0a58272301ffb9f514a3df35cc7f9ca9c512d5f562`
- Result semantic hash: `fnv1a64:d15839afb8e53f19`
- Expected: `{"passed":true,"exitCodes":[0,0,0,0,0,0,0]}`
- Actual: `{"passed":true,"exitCodes":[0,0,0,0,0,0,0]}`
- Tolerance: `null`
- Diagnostics: —

### LFEA / lfea-equilibrium-convergence

- Status: PASS
- Category: EQUILIBRIUM_AND_CONVERGENCE
- Evidence basis: ANALYTICAL
- Input semantic hash: `sha256:13c8f21f350aa9a15f23c325c7b281a76d7d1acaf99c1c8b68c12704f703a72a`
- Result semantic hash: `fnv1a64:1a138874c2d237c2`
- Expected: `{"passed":true,"exitCodes":[0,0,0,0,0]}`
- Actual: `{"passed":true,"exitCodes":[0,0,0,0,0]}`
- Tolerance: `null`
- Diagnostics: —

### LFEA / lfea-singular-rejection

- Status: PASS
- Category: FAIL_CLOSED
- Evidence basis: REGRESSION
- Input semantic hash: `sha256:85d030f83dfbf7baaee798340c7e5b5b218f56942a8476bb6686fed4b8429e52`
- Result semantic hash: `fnv1a64:de2147a6b37ae0ff`
- Expected: `{"passed":true,"exitCodes":[0,0]}`
- Actual: `{"passed":true,"exitCodes":[0,0]}`
- Tolerance: `null`
- Diagnostics: —

### LFEA / lfea-t3-q4-patch

- Status: PASS
- Category: PATCH_TESTS
- Evidence basis: ANALYTICAL
- Input semantic hash: `sha256:bc9f4053099262c1c8d6992bc6d45e4922ee0f4496bc9ebac7ec8f7f771988e3`
- Result semantic hash: `fnv1a64:86084f296c5bbeee`
- Expected: `{"passed":true,"exitCodes":[0,0,0,0,0,0,0,0,0]}`
- Actual: `{"passed":true,"exitCodes":[0,0,0,0,0,0,0,0,0]}`
- Tolerance: `null`
- Diagnostics: —

### LOAD_CALC / load-browser-workflow

- Status: PASS
- Category: BROWSER_WORKFLOW
- Evidence basis: [SIMULATED]
- Input semantic hash: `sha256:3d5c86127d17e45d5ca2ac2e623671be825805ec86da38851775a01cdd421b2f`
- Result semantic hash: `fnv1a64:4d7316fb9cf5f19b`
- Expected: `{"passed":true,"exitCodes":[0]}`
- Actual: `{"passed":true,"exitCodes":[0]}`
- Tolerance: `null`
- Diagnostics: —

### LOAD_CALC / load-contributions-and-blockers

- Status: PASS
- Category: LOAD_CONTRIBUTIONS
- Evidence basis: [SIMULATED]
- Input semantic hash: `sha256:4e73bee05d5b441673b536ba892d800e7743f3d4e9f17ad6973d2a7d3c52a8fd`
- Result semantic hash: `fnv1a64:fd95fda6faf70629`
- Expected: `{"passed":true,"exitCodes":[0]}`
- Actual: `{"passed":true,"exitCodes":[0]}`
- Tolerance: `null`
- Diagnostics: —

### LOAD_CALC / load-empty-ope-hyd

- Status: PASS
- Category: WEIGHT_CASES
- Evidence basis: ANALYTICAL
- Input semantic hash: `sha256:c52e57ebc1bfb1089d0cb046ba430dd5cf77676149620c226e593bea538528fa`
- Result semantic hash: `fnv1a64:bed5e6a039ec3de0`
- Expected: `{"passed":true,"exitCodes":[0]}`
- Actual: `{"passed":true,"exitCodes":[0]}`
- Tolerance: `null`
- Diagnostics: —

### LOAD_CALC / load-force-balance-and-reactions

- Status: PASS
- Category: FORCE_BALANCE
- Evidence basis: ANALYTICAL
- Input semantic hash: `sha256:cd50601f66bdf85c12e79014f151d5ba0a163727f020158698e935b5d2dddb93`
- Result semantic hash: `fnv1a64:e82fbd7830dcaa0a`
- Expected: `{"passed":true,"exitCodes":[0]}`
- Actual: `{"passed":true,"exitCodes":[0]}`
- Tolerance: `null`
- Diagnostics: —

### LOAD_CALC / load-workspace-contract-propagation

- Status: PASS
- Category: CONTRACT_PROPAGATION
- Evidence basis: REGRESSION
- Input semantic hash: `sha256:97113bf09c6b03382c49dd350456fc04bb6002673323cb15ee0842dc90eca21a`
- Result semantic hash: `fnv1a64:4fdc8c92d75a278f`
- Expected: `{"passed":true,"exitCodes":[0,0]}`
- Actual: `{"passed":true,"exitCodes":[0,0]}`
- Tolerance: `null`
- Diagnostics: —

### WORKSPACE / workspace-browser-workflow

- Status: PASS
- Category: BROWSER_WORKFLOW
- Evidence basis: [SIMULATED]
- Input semantic hash: `sha256:762da725577f072a7d34454fd729ed5bb0e194479e63899241b0f85ef94a637c`
- Result semantic hash: `fnv1a64:458744554adc7bbc`
- Expected: `{"passed":true,"exitCodes":[0]}`
- Actual: `{"passed":true,"exitCodes":[0]}`
- Tolerance: `null`
- Diagnostics: —

### WORKSPACE / workspace-real-project-import

- Status: PASS
- Category: DATASET_IMPORT
- Evidence basis: REAL_PROJECT
- Input semantic hash: `sha256:88e62782772d743e9236d13775476826f9649ab06d3161de35dc500baa85a9c6`
- Result semantic hash: `fnv1a64:8a6fdda1b172bb65`
- Expected: `{"schema":"inputxml-managed-stage/v1","sha256":"88e62782772d743e9236d13775476826f9649ab06d3161de35dc500baa85a9c6","byteLength":25219174,"rawRootCount":276,"rawNodeCount":4884,"rawSupportCount":1331,"normalizedPipeCount":3277,"normalizedSupportCount":1331,"normalizedComponentCount":276}`
- Actual: `{"schema":"inputxml-managed-stage/v1","sha256":"88e62782772d743e9236d13775476826f9649ab06d3161de35dc500baa85a9c6","byteLength":25219174,"rawRootCount":276,"rawNodeCount":4884,"rawSupportCount":1331,"normalizedPipeCount":3277,"normalizedSupportCount":1331,"normalizedComponentCount":276}`
- Tolerance: `null`
- Diagnostics: —

### WORKSPACE / workspace-schema-rejection

- Status: PASS
- Category: SCHEMA_REJECTION
- Evidence basis: REGRESSION
- Input semantic hash: `sha256:7de590bfa1c5e5738d97f00bb322348d2d59ab0931663305fecf159fa2b922aa`
- Result semantic hash: `fnv1a64:fd88526962c57a4a`
- Expected: `{"passed":true,"exitCodes":[0]}`
- Actual: `{"passed":true,"exitCodes":[0]}`
- Tolerance: `null`
- Diagnostics: —

### WORKSPACE / workspace-selection-export-reimport

- Status: PASS
- Category: STATE_AND_ROUND_TRIP
- Evidence basis: [SIMULATED]
- Input semantic hash: `sha256:a0cea4f58616c0259ed4aa6bda5633bccc0314c0471fd05282e5debbb820645d`
- Result semantic hash: `fnv1a64:c045af9e2cca8acc`
- Expected: `{"passed":true,"exitCodes":[0,0]}`
- Actual: `{"passed":true,"exitCodes":[0,0]}`
- Tolerance: `null`
- Diagnostics: —

### WORKSPACE / workspace-topology-invariance

- Status: PASS
- Category: TOPOLOGY_INVARIANCE
- Evidence basis: [SIMULATED]
- Input semantic hash: `sha256:285f4cec4f6b96e5c6b20287d66a0fc001c1c53edd768a28f28efcea08ab8db7`
- Result semantic hash: `fnv1a64:36afded1b70713ed`
- Expected: `{"passed":true,"exitCodes":[0]}`
- Actual: `{"passed":true,"exitCodes":[0]}`
- Tolerance: `null`
- Diagnostics: —

