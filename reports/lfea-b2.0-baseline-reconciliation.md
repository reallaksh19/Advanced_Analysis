# LFEA B-2.0 baseline reconciliation

## Baselines reconciled

This record reconciles the supplied ad hoc B-2.0 declarations with the isolated recovery implementation and the authorized recovery corrections. The remote `main` branch did not contain `src/core/linear-fea-contract/` at recovery start, so the supplied ad hoc files are the declaration baseline and the complete repository is the integration baseline.

## Original declarations

| Declaration | Classification | Reconciliation decision |
|---|---|---|
| `DOF_ORDER` | RETAINED IDENTICALLY | Retained `UX, UY, UZ, RX, RY, RZ` as the exact, frozen, case-sensitive nodal order. |
| `ELEMENT_END_ORDER` | RETAINED IDENTICALLY | Retained `I, J` as the exact element-end order, with local x directed I to J. |
| `LOCAL_RESULT_ORDER` | RETAINED IDENTICALLY | Retained and made authoritative as `FX, FY, FZ, MX, MY, MZ`. It is not provisional. |
| `dofIndex()` | RETAINED SEMANTICALLY | Retained exact case-sensitive lookup and fail-closed rejection of unknown DOFs. |
| `endIndex()` | RETAINED SEMANTICALLY | Retained exact case-sensitive lookup and fail-closed rejection of unknown ends. |
| `globalDofIdentity()` | AMENDED | Retained `nodeId:dof` output but added an ASCII canonical-node-ID boundary excluding `:` and invalid IDs, eliminating delimiter collisions. |
| `LINEAR_FEA_UNITS` | AMENDED | Retained all original SI quantities and added the required Phase 2–3 semantic quantity fields, including separate absolute-temperature and temperature-difference fields. |
| `requireLinearFeaUnits()` | AMENDED | Retained validator authority and expanded it to exact-key and exact-value validation of the complete unit record. |
| `LINEAR_FEA_CONVENTIONS` | AMENDED | Retained ordering authority and added schema identities, 12-DOF layout, vector/matrix storage, transformation direction, machine-readable end-action semantics, reaction and prescribed-displacement semantics, thermal sign, canonical ordering, and numeric normalization. |
| `src/core/linear-fea-contract/index.js` | AMENDED | Retained all original public exports and added the new versioned authorities and helpers. |
| `scripts/lfea-b2.0-conventions-check.mjs` | AMENDED | Retained the targeted-check role and added exact validation, analytical sign evidence, virtual-work evidence, identifier controls, and regression-sensitive assertions. |

## Isolated recovery declarations

| Declaration | Classification | Reconciliation decision |
|---|---|---|
| `ELEMENT_DOF_ORDER` | RETAINED IDENTICALLY | Retained the I-end six DOFs followed by the J-end six DOFs. |
| `elementDofIndex()` | RETAINED IDENTICALLY | Retained `endIndex(end) * 6 + dofIndex(dof)`. |
| `VECTOR_ORIENTATION_ID` | RETAINED IDENTICALLY | Retained `COLUMN_VECTOR_V1`. |
| `ELEMENT_MATRIX_STORAGE_ID` | RETAINED IDENTICALLY | Retained `ROW_MAJOR_12X12_V1`. |
| `ELEMENT_VECTOR_LAYOUT_ID` | RETAINED IDENTICALLY | Retained `I_SIX_DOF_THEN_J_SIX_DOF_V1`. |
| `TRANSFORMATION_CONVENTION_ID` | RETAINED IDENTICALLY | Retained `D_LOCAL_EQ_T_D_GLOBAL_V1`. |
| `NUMERIC_NORMALIZATION_ID` | RETAINED IDENTICALLY | Retained `FINITE_IEEE754_NEGATIVE_ZERO_NORMALIZED_V1`. |
| `identifiers.js` split | RETAINED SEMANTICALLY | Retained the separated identifier authority. |
| `CANONICAL_ID_ORDER_ID` | REPLACED | Replaced `UNICODE_CODE_POINT_ASCENDING_V1` with `CANONICAL_ASCII_LEXICOGRAPHIC_ASCENDING_V1` because the grammar is ASCII-only and JavaScript string iteration was an imprecise identity for the intended comparator. |
| `compareCanonicalIds()` | AMENDED | Uses direct ASCII code-unit comparison; no locale collation or natural-number sorting. |
| `END_ACTION_CONVENTION` | AMENDED | Replaced prose-only semantics with an exact-key, frozen, machine-readable record governed by `FRAME_END_ACTION_ON_ELEMENT_V1`. |
| `README.md` | AMENDED | Removes provisional wording, documents exact ASCII lexicographic ordering, and identifies deferred behavior explicitly. |
| `lfea-b2.0-source-guard.mjs` | AMENDED | Adds production-owner, duplicate-literal, locale prohibition, gate reachability, duplicate-script-key, and prohibited-import checks. |

## Explicit implementation decisions and deferrals

- Positive local axial components are measured along local +x at both element ends; no outward-normal-positive end-I convention is introduced.
- Equivalent-load and initial-strain vectors are load-side vectors whose effects are subtracted in reported joint-on-element end-action recovery. Their names and construction remain deferred.
- Local-axis construction and near-parallel tolerance remain deferred; only transformation direction is frozen.
- Stiffness-factorization reuse remains governed by equality of the fully resolved stiffness operator and is deferred to material/model/solver contracts.
- Installation temperature is the stress-free reference only when a later model contract explicitly declares it so; cold spring, fabrication strain, and prestrain remain outside B-2.0.
