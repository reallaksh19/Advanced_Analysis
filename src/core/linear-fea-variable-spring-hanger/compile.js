import { semanticHash } from '../shared-piping-model/canonical-json.js';
import { deepFreeze } from '../shared-piping-model/immutable.js';
import { variableSpringSupportForce } from './design.js';

export function compileProgrammedVariableSpringHanger({ hangerId, kernelNodeId, design, sourceEvidence }) {
  if (!hangerId || !kernelNodeId || !design?.selected) throw new Error('hangerId, kernelNodeId, and a selected design are required.');
  const selected = design.selected;
  const result = {
    schema: 'fea-linear-programmed-variable-spring-authority/v1',
    hangerId,
    nodeId: design.nodeId,
    kernelNodeId,
    designSemanticHash: design.semanticHash,
    selected: {
      manufacturer: 'ANVIL',
      figure: selected.figure,
      seriesId: selected.seriesId,
      size: selected.size,
      springRate: selected.springRate,
      theoreticalColdLoad: selected.theoreticalColdLoad,
      hotLoad: selected.hotLoad,
      signedOperatingTravel: selected.signedOperatingTravel,
      variability: selected.variability,
    },
    constraintDeclaration: {
      declarationId: `${hangerId}-UY-SPRING`,
      kind: 'PARTIAL_RELEASE_SPRING',
      nodeId: kernelNodeId,
      dof: 'UY',
      stiffness: selected.springRate,
    },
    preloadPrimitive: {
      schema: 'fea-linear-load-primitive/v1',
      primitiveId: `${hangerId}-H-PRELOAD`,
      kind: 'NODAL_FORCE_MOMENT',
      nodeId: kernelNodeId,
      basis: { kind: 'GLOBAL' },
      force: { fx: 0, fy: selected.theoreticalColdLoad, fz: 0 },
      moment: { mx: 0, my: 0, mz: 0 },
      units: { force: 'N', moment: 'N*m', length: 'm' },
      signConvention: 'APPLIED_TO_STRUCTURE',
      sourceEvidence,
    },
    equilibriumOracle: {
      operatingSupportForce: variableSpringSupportForce({
        theoreticalColdLoad: selected.theoreticalColdLoad,
        springRate: selected.springRate,
        displacement: selected.signedOperatingTravel,
      }),
      expectedHotLoad: selected.hotLoad,
    },
    semanticHash: '',
  };
  result.semanticHash = semanticHash(result);
  return deepFreeze(result);
}
