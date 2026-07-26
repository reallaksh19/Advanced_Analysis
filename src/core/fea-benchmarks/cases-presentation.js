/**
 * Presentation-fidelity verification cases.
 *
 * A correct kernel is not sufficient. These cases verify that what the
 * application DISPLAYS is the same quantity, with the same value, on the same
 * geometry, as what the kernel published and what the evidence bundle exports.
 *
 * They deliberately exercise the workbench display layer, not the kernel.
 */
import { executeLfeaWorkbench } from '../../workspace/lfea-workbench-pipeline.js';
import { lfeaDisplayGeometry } from '../../workspace/lfea-workbench-model.js';
import {
  FIXED, FREE, denseProfile, pBoundary, pConstraint, pLoadCase, pMaterialAssignment,
  pPoint, pPointForce, pRegion, pThicknessAssignment, pTraction, q4Grid, sealPackage, t3Grid,
} from './builders.js';

const E_STEEL = 200000;
const NU = 0.3;

/* ------------------------------------------------------------------ */
/* Package fixtures                                                    */
/* ------------------------------------------------------------------ */

/**
 * A short, deep cantilever strip loaded by end traction. Deep enough that the
 * in-plane stress state is genuinely biaxial, so sigma_z matters under plane
 * strain and a sigma_z-ignoring von Mises expression gives a different answer.
 */
function stripPackage(elementType, formulation) {
  const packageIdentity = `BM-DISPLAY-${elementType}-${formulation}`;
  const grid = elementType === 'Q4'
    ? q4Grid({ width: 40, height: 20, nx: 2, ny: 2 })
    : t3Grid({ width: 40, height: 20, nx: 2, ny: 2 });

  const boundaries = [];
  const rightColumn = 1;
  for (let j = 0; j < 2; j += 1) {
    if (elementType === 'Q4') {
      boundaries.push({ elementId: `E00${rightColumn}_00${j}`, localEdgeId: 'Q4_E2' });
    } else {
      // Right edge of the split quad lives on triangle A, local edge T3_E2.
      boundaries.push({ elementId: `E00${rightColumn}_00${j}A`, localEdgeId: 'T3_E2' });
    }
  }

  const points = [];
  const constraints = [];
  for (let j = 0; j <= 2; j += 1) {
    const pointId = `P_L${j}`;
    points.push(pPoint(pointId, grid.nodeId(0, j)));
    constraints.push(pConstraint(`C_L${j}`, 'POINT', pointId, FIXED, j === 0 ? FIXED : FREE));
  }
  const tipPointId = 'P_TIP';
  points.push(pPoint(tipPointId, grid.nodeId(2, 2)));

  return sealPackage({
    packageIdentity,
    formulation,
    solverProfile: denseProfile(formulation),
    nodes: grid.nodes,
    elements: grid.elements,
    materials: [{ materialId: 'MAT1', E: E_STEEL, nu: NU, sourceSemanticHash: 'fea-benchmark-source:v1' }],
    regions: [pRegion('R_ALL', grid.elementIds)],
    boundaries: [pBoundary('B_RIGHT', boundaries)],
    points,
    materialAssignments: [pMaterialAssignment('MA1', 'R_ALL', 'MAT1')],
    thicknessAssignments: formulation === 'PLANE_STRESS'
      ? [pThicknessAssignment('TA1', 'R_ALL', 1)]
      : [],
    loadCase: pLoadCase('LC1', {
      boundaryTractions: [pTraction('T1', 'B_RIGHT', 40, -70)],
      pointForces: [pPointForce('F1', tipPointId, 0, -250)],
    }),
    constraints,
  });
}

const DISPLAY_VARIANTS = Object.freeze([
  { elementType: 'T3', formulation: 'PLANE_STRESS' },
  { elementType: 'T3', formulation: 'PLANE_STRAIN' },
  { elementType: 'Q4', formulation: 'PLANE_STRESS' },
  { elementType: 'Q4', formulation: 'PLANE_STRAIN' },
]);

/* ------------------------------------------------------------------ */
/* Authority extraction (kernel side)                                  */
/* ------------------------------------------------------------------ */

/**
 * The authoritative per-element von Mises stress, taken ONLY from published
 * solver evidence. This function performs no stress arithmetic whatsoever.
 *
 * @param {Record<string, unknown>} result Qualified continuum result.
 * @returns {{values:Record<string,number>, source:string}} Authoritative field.
 */
function authoritativeVonMises(result) {
  const values = {};
  let source = null;
  for (const row of result.vonMisesStress ?? []) {
    values[row.elementId] = row.value;
    source = 'result.vonMisesStress[].value';
  }
  for (const row of result.integrationPointResults ?? []) {
    const current = values[row.elementId];
    values[row.elementId] = current === undefined
      ? row.vonMisesStress
      : Math.max(current, row.vonMisesStress);
    source = 'result.integrationPointResults[].vonMisesStress';
  }
  return { values, source };
}

function check(spec) {
  const absoluteError = Math.abs(spec.computed - spec.reference);
  const scale = Math.max(Math.abs(spec.reference), spec.referenceScale ?? 0);
  const relativeError = scale > 0 ? absoluteError / scale : (absoluteError > 0 ? Infinity : 0);
  const measured = spec.toleranceType === 'RELATIVE' ? relativeError : absoluteError;
  return {
    ...spec,
    absoluteError,
    relativeError,
    status: Number.isFinite(measured) && measured <= spec.tolerance ? 'PASS' : 'FAIL',
  };
}

function passFail(checkId, quantity, ok, note) {
  return {
    checkId, quantity, unit: null,
    computed: ok ? 1 : 0, reference: 1,
    absoluteError: ok ? 0 : 1, relativeError: ok ? 0 : 1,
    tolerance: 0, toleranceType: 'BOOLEAN',
    status: ok ? 'PASS' : 'FAIL',
    note: note ?? null,
  };
}

function runVariant(variant) {
  const packageValue = stripPackage(variant.elementType, variant.formulation);
  const execution = executeLfeaWorkbench(packageValue, {});
  if (!execution.result || execution.result.status !== 'QUALIFIED') {
    const first = execution.diagnostics?.[0];
    throw new Error(
      `${variant.elementType}/${variant.formulation} did not solve: `
      + `${execution.failedStage ?? '?'} ${first?.code ?? ''} ${first?.message ?? ''}`,
    );
  }
  return { packageValue, execution };
}

/* ================================================================== */
/* P1 — Displayed field value equals solver evidence                   */
/* ================================================================== */

function displayedVonMisesFidelity() {
  const caseId = 'BM-P1-DISPLAYED-VON-MISES';
  return {
    caseId,
    title: 'Displayed stress field equals the authoritative solver von Mises, bit for bit',
    tier: 'T4_PRESENTATION',
    category: 'PRESENTATION_FIDELITY',
    kernel: 'lfea-workbench',
    reference: {
      type: 'PRESENTATION',
      source: 'The view layer must SELECT a published kernel quantity, never re-derive one. '
        + 'Any deviation means the screen and the signed evidence bundle disagree.',
    },
    run() {
      const checks = [];
      const evidence = [];
      DISPLAY_VARIANTS.forEach((variant) => {
        const label = `${variant.elementType}_${variant.formulation}`;
        const { packageValue, execution } = runVariant(variant);
        const authority = authoritativeVonMises(execution.result);
        const geometry = lfeaDisplayGeometry(packageValue, execution, 'RAW_STRESS');
        const displayed = geometry.values ?? {};

        let worstAbsolute = 0;
        let worstRelative = 0;
        let bitIdentical = true;
        let worstAt = null;
        let scale = 0;
        Object.entries(authority.values).forEach(([elementId, reference]) => {
          scale = Math.max(scale, Math.abs(reference));
          const shown = displayed[elementId];
          if (!Object.is(shown, reference)) bitIdentical = false;
          if (!Number.isFinite(shown)) {
            bitIdentical = false;
            return;
          }
          const absolute = Math.abs(shown - reference);
          const relative = Math.abs(reference) > 0 ? absolute / Math.abs(reference) : absolute;
          if (relative > worstRelative) {
            worstRelative = relative;
            worstAbsolute = absolute;
            worstAt = `${elementId}: displayed ${shown} vs authoritative ${reference}`;
          }
        });

        checks.push(passFail(
          `${caseId}.${label}.BIT_IDENTICAL`,
          `Displayed field is bit-identical to kernel evidence (${label})`,
          bitIdentical,
          worstAt ?? `source = ${authority.source}`,
        ));
        checks.push(check({
          checkId: `${caseId}.${label}.RELATIVE`,
          quantity: `Worst relative deviation of displayed stress (${label})`,
          unit: '-',
          computed: worstRelative,
          reference: 0,
          referenceScale: 1,
          tolerance: 0,
          toleranceType: 'ABSOLUTE',
          note: worstAt,
        }));
        evidence.push({
          variant: label,
          authoritativeSource: authority.source,
          elementCount: Object.keys(authority.values).length,
          worstRelativeDeviation: worstRelative,
          worstAbsoluteDeviation: worstAbsolute,
          worstLocation: worstAt,
          referenceScale: scale,
        });
      });
      return { checks, evidence };
    },
  };
}

/* ================================================================== */
/* P2 — Undeformed modes plot source geometry                          */
/* ================================================================== */

function geometryStateFidelity() {
  const caseId = 'BM-P2-GEOMETRY-STATE';
  return {
    caseId,
    title: 'Stress display modes plot undeformed source geometry unless deformation is explicitly requested',
    tier: 'T4_PRESENTATION',
    category: 'PRESENTATION_FIDELITY',
    kernel: 'lfea-workbench',
    reference: {
      type: 'PRESENTATION',
      source: 'A plot labelled with a stress authority must not silently apply a displacement magnification. '
        + 'Coordinates read off the plot must be the model coordinates.',
    },
    run() {
      const { packageValue, execution } = runVariant({ elementType: 'Q4', formulation: 'PLANE_STRESS' });
      const source = new Map(packageValue.nodes.map((row) => [row.nodeId, row]));
      const checks = [];
      const evidence = [];

      ['MODEL', 'RAW_STRESS', 'PROJECTED_STRESS'].forEach((mode) => {
        let geometry;
        try {
          geometry = lfeaDisplayGeometry(packageValue, execution, mode);
        } catch {
          geometry = null;
        }
        if (!geometry) {
          checks.push(passFail(`${caseId}.${mode}.AVAILABLE`, `${mode} geometry is produced`, false));
          return;
        }
        const declaredDeformed = String(geometry.geometryState ?? '').includes('DEFORM')
          || Number(geometry.deformationScale ?? 0) !== 0;
        let worst = 0;
        let worstAt = null;
        geometry.nodes.forEach((node) => {
          const original = source.get(node.nodeId);
          const deviation = Math.max(Math.abs(node.x - original.x), Math.abs(node.y - original.y));
          if (deviation > worst) {
            worst = deviation;
            worstAt = `${node.nodeId}: plotted (${node.x}, ${node.y}) vs source (${original.x}, ${original.y})`;
          }
        });
        checks.push(passFail(
          `${caseId}.${mode}.UNDEFORMED_BY_DEFAULT`,
          `${mode} plots exact source coordinates when deformation is not requested`,
          worst === 0,
          worstAt ?? 'exact match',
        ));
        checks.push(passFail(
          `${caseId}.${mode}.STATE_DECLARED`,
          `${mode} declares its geometry state explicitly`,
          typeof geometry.geometryState === 'string' && geometry.geometryState.length > 0,
          `geometryState = ${geometry.geometryState ?? '<absent>'}, `
          + `deformationScale = ${geometry.deformationScale ?? '<absent>'}, `
          + `declaredDeformed = ${declaredDeformed}`,
        ));
        evidence.push({ mode, worstCoordinateDeviation: worst, worstAt, geometryState: geometry.geometryState ?? null });
      });

      return { checks, evidence };
    },
  };
}

/* ================================================================== */
/* P3 — Field metadata: quantity, unit, provenance, scale              */
/* ================================================================== */

function fieldMetadata() {
  const caseId = 'BM-P3-FIELD-METADATA';
  return {
    caseId,
    title: 'Every displayed field declares its quantity, unit, reduction, provenance and value range',
    tier: 'T4_PRESENTATION',
    category: 'PRESENTATION_FIDELITY',
    kernel: 'lfea-workbench',
    reference: {
      type: 'PRESENTATION',
      source: 'A coloured mesh with no quantity identity, no unit and no numeric range is not a reviewable '
        + 'engineering output. Units must come from solverProfile.units.stress, never a literal.',
    },
    run() {
      const { packageValue, execution } = runVariant({ elementType: 'Q4', formulation: 'PLANE_STRESS' });
      const expectedUnit = packageValue.analysisDefinition.solverProfile.units.stress;
      const geometry = lfeaDisplayGeometry(packageValue, execution, 'RAW_STRESS');
      const field = geometry.field ?? {};
      const required = ['quantityId', 'unit', 'reduction', 'sourcePath', 'min', 'max'];
      const present = required.filter((key) => field[key] !== undefined && field[key] !== null);

      return {
        checks: [
          passFail(`${caseId}.DESCRIPTOR_PRESENT`,
            'Display geometry carries a field descriptor',
            present.length === required.length,
            `present: [${present.join(', ')}]; missing: [${required.filter((k) => !present.includes(k)).join(', ')}]`),
          passFail(`${caseId}.UNIT_FROM_PROFILE`,
            'Declared unit equals solverProfile.units.stress',
            field.unit === expectedUnit,
            `declared = ${field.unit ?? '<absent>'}, profile = ${expectedUnit}`),
          passFail(`${caseId}.RANGE_FINITE`,
            'Field declares a finite numeric range for the legend',
            Number.isFinite(field.min) && Number.isFinite(field.max) && field.max >= field.min,
            `min = ${field.min ?? '<absent>'}, max = ${field.max ?? '<absent>'}`),
          passFail(`${caseId}.PROVENANCE`,
            'Field declares which result path it was selected from',
            typeof field.sourcePath === 'string' && field.sourcePath.includes('result.'),
            `sourcePath = ${field.sourcePath ?? '<absent>'}`),
          passFail(`${caseId}.CAPTION`,
            'Display geometry provides a caption naming quantity, unit and geometry state',
            typeof geometry.caption === 'string'
              && geometry.caption.includes(expectedUnit)
              && /DEFORM|UNDEFORM/i.test(geometry.caption),
            `caption = ${geometry.caption ?? '<absent>'}`),
        ],
        evidence: { expectedUnit, field, caption: geometry.caption ?? null },
      };
    },
  };
}

/* ================================================================== */
/* P4 — Mode switching changes the declared quantity                   */
/* ================================================================== */

function quantityDisambiguation() {
  const caseId = 'BM-P4-QUANTITY-DISAMBIGUATION';
  return {
    caseId,
    title: 'Raw and projected stress modes declare different quantities and separate value ranges',
    tier: 'T4_PRESENTATION',
    category: 'PRESENTATION_FIDELITY',
    kernel: 'lfea-workbench',
    reference: {
      type: 'PRESENTATION',
      source: 'Raw mode shows a von Mises invariant (non-negative). Projected mode shows a signed stress '
        + 'component from a NON-AUTHORITATIVE projection. Sharing one unlabelled colour ramp between them '
        + 'lets a reader compare two different physical quantities as if they were one.',
    },
    run() {
      const { packageValue, execution } = runVariant({ elementType: 'Q4', formulation: 'PLANE_STRESS' });
      const raw = lfeaDisplayGeometry(packageValue, execution, 'RAW_STRESS');
      const projected = lfeaDisplayGeometry(packageValue, execution, 'PROJECTED_STRESS');
      const rawId = raw.field?.quantityId ?? null;
      const projectedId = projected.field?.quantityId ?? null;

      return {
        checks: [
          passFail(`${caseId}.DISTINCT_QUANTITY_IDS`,
            'Raw and projected modes declare distinct quantity identities',
            Boolean(rawId) && Boolean(projectedId) && rawId !== projectedId,
            `raw = ${rawId ?? '<absent>'}, projected = ${projectedId ?? '<absent>'}`),
          passFail(`${caseId}.PROJECTED_AUTHORITY`,
            'Projected mode is labelled non-authoritative',
            String(projected.authority ?? '').includes('NON_AUTHORITATIVE'),
            `authority = ${projected.authority}`),
          passFail(`${caseId}.RAW_AUTHORITY`,
            'Raw mode is labelled authoritative',
            String(raw.authority ?? '').includes('AUTHORITATIVE_RAW'),
            `authority = ${raw.authority}`),
          passFail(`${caseId}.SEPARATE_RANGES`,
            'Each mode carries its own numeric range rather than sharing one implicit scale',
            Number.isFinite(raw.field?.min) && Number.isFinite(projected.field?.min)
              && (raw.field.min !== projected.field.min || raw.field.max !== projected.field.max),
            `raw range = [${raw.field?.min}, ${raw.field?.max}], `
            + `projected range = [${projected.field?.min}, ${projected.field?.max}]`),
        ],
        evidence: { rawQuantityId: rawId, projectedQuantityId: projectedId },
      };
    },
  };
}

/* ================================================================== */
/* Registry                                                           */
/* ================================================================== */

/**
 * Presentation-fidelity verification cases.
 *
 * @returns {Array<Record<string, unknown>>} Case definitions.
 */
export function presentationBenchmarkCases() {
  return [
    displayedVonMisesFidelity(),
    geometryStateFidelity(),
    fieldMetadata(),
    quantityDisambiguation(),
  ];
}
