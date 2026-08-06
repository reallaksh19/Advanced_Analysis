import {
  deepFreeze,
  semanticHash,
} from '../../core/shared-piping-model/index.js';
import {
  PRIMITIVE_TYPES,
  validateModelLoadPrimitiveSet,
} from '../../core/model-loads/index.js';

export const EMPIRICAL_BEAM_CONTACT_LOAD_ADAPTER_SCHEMA =
  'empirical-beam-contact-load-adapter/v1';

const TYPE_MAPPING = Object.freeze({
  [PRIMITIVE_TYPES.DISTRIBUTED]: 'DISTRIBUTED',
  [PRIMITIVE_TYPES.POINT]: 'POINT',
  [PRIMITIVE_TYPES.MOMENT]: 'MOMENT',
});

export function adaptModelLoadPrimitivesForBeamContact(source) {
  const validation = validateModelLoadPrimitiveSet(source);
  if (!validation.ok) {
    throw new TypeError(`Beam/contact load adapter requires model-load-primitive-set/v1: ${validation.errors.join(' ')}`);
  }
  const primitives = source.primitives.map((primitive) => {
    const primitiveType = TYPE_MAPPING[primitive.primitiveType];
    if (!primitiveType) {
      throw new TypeError(`Unsupported model-load primitive type: ${primitive.primitiveType}.`);
    }
    return deepFreeze({ ...primitive, primitiveType });
  }).sort((left, right) => left.primitiveId.localeCompare(right.primitiveId));
  const base = {
    schema: source.schema,
    datasetId: source.datasetId,
    loadCaseSetSemanticHash: source.loadCaseSetSemanticHash,
    sourceProjectionSemanticHash: source.sourceProjectionSemanticHash,
    gravityProfile: source.gravityProfile,
    compositionProfile: source.compositionProfile,
    primitives,
    componentOutcomes: source.componentOutcomes,
    summary: source.summary,
    adapterEvidence: {
      schema: EMPIRICAL_BEAM_CONTACT_LOAD_ADAPTER_SCHEMA,
      sourceSemanticHash: source.semanticHash,
      primitiveTypeMapping: TYPE_MAPPING,
      valueMutation: false,
      unitMutation: false,
    },
  };
  return deepFreeze({ ...base, semanticHash: semanticHash(base) });
}
