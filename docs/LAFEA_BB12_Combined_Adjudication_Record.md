# LAFEA Bucket B BB-12 — Combined Adjudication Record

## Purpose

BB-12 is the final combined adjudication package for the controlled Bucket B
application-procedure programme. It does not rerun BB-11 as a new flange/hub
qualification. Instead it:

1. replays BB-06 through BB-09 at the BB-12 exact head;
2. validates the retained qualified BB-11 report;
3. proves that the BB-11 qualified and merged heads are ancestors;
4. proves byte identity for the governed BB-11 executable and qualification
   source paths;
5. creates a receipt-bound projection for the six qualified application
   templates;
6. retains all production and code-assessment boundaries.

The executable authority is:

- `src/core/bucket-b/bb12-combined-adjudication.js`;
- `src/core/bucket-b/bb12-check.mjs`;
- `.github/workflows/bucket-b-bb12-combined-adjudication.yml`;
- the exact-head retained BB-12 report artifact.

## Required portfolio

A valid BB-12 receipt requires qualified numerical and procedure evidence for:

- `C2D-LUG-PINHOLE`;
- `C2D-CLAMP-EAR`;
- `C2D-BRACKET-GUSSET`;
- `C2D-PIPE-PAD-SECTION`;
- `C2D-NOZZLE-REPAD-SECTION`;
- `C2D-FLANGE-HUB`.

BB-06 through BB-09 must be replayed at the BB-12 exact head. BB-11 may be
adopted from its retained qualified artifact only when its qualified source
manifest is byte-identical at the BB-12 exact head.

## Receipt-bound registry projection

BB-12 does not manually toggle the static application-template registry. It
creates a projection whose status is:

```text
APPLICATION_QUALIFIED_RECEIPT_BOUND
```

Every projected row retains:

- exact-head identity;
- source-report semantic hash;
- formulation, element, and geometry profile identity;
- the qualified limitations;
- `CODE_ASSESSMENT_QUALIFIED = false`;
- `ORDINARY_PRODUCTION_EXECUTION_AUTHORIZED = false`;
- `APPLICATION_MODULE_PROMOTED = false`;
- `PRODUCTION_SWITCH_AUTHORIZED = false`.

Consumers must possess and validate the BB-12 receipt. They must not infer the
projection from labels or manually edited release states.

## BB-12 authority disposition

A valid report may state:

```text
BUCKET_B_PROGRAMME_QUALIFIED = true
APPLICATION_PROCEDURE_PORTFOLIO_QUALIFIED = true
NUMERICAL_OUTPUT_PORTFOLIO_QUALIFIED = true
APPLICATION_TEMPLATE_PROJECTION_QUALIFIED = true
QUALIFIED_APPLICATION_PROCEDURE_COUNT = 6
```

It must retain:

```text
CODE_ASSESSMENT_QUALIFIED = false
MODULE_QUALIFIED = false
APPLICATION_MODULE_PROMOTED = false
APPLICATION_EXECUTION_AUTHORIZED = false
PRODUCTION_SWITCH_AUTHORIZED = false
BUCKET_01_QUALIFIED = UNCHANGED
```

## Limitations

BB-12 does not add mechanics beyond the qualified source procedures. It does
not authorize:

- automatic production execution;
- a production UI switch;
- application-template compiler generalization outside each qualified
  geometry and load envelope;
- code stress classification or allowable evaluation;
- ASME or other code acceptance;
- contact, plasticity, buckling, fatigue, fracture, weld assessment, or
  nonlinear response;
- any change to Bucket 01 authority.

The limitations retained by each BB-06 through BB-11 source receipt remain
binding on its projected application.
