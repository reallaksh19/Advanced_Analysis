import { deepFreeze } from '../../shared-piping-model/index.js';
import { createTemplateParameterSchema, asciiCompare } from '../contracts.js';
import { requireLafeaApplicationTemplate } from '../template-registry.js';

export const LAFEA_T4_CONTINUUM_TEMPLATE_IDS = deepFreeze([
  'C2D-BRACKET-GUSSET',
  'C2D-CLAMP-EAR',
  'C2D-LUG-PINHOLE',
  'C2D-NOZZLE-REPAD-SECTION',
  'C2D-PIPE-PAD-SECTION',
]);

export const LAFEA_T4_CONTINUUM_PARAMETER_SCHEMAS = Object.freeze(
  LAFEA_T4_CONTINUUM_TEMPLATE_IDS
    .map(continuumSourceSchema)
    .sort((left, right) => asciiCompare(left.templateId, right.templateId)),
);

export const LAFEA_T4_CONTINUUM_PARAMETER_SCHEMA_IDS = Object.freeze(
  LAFEA_T4_CONTINUUM_PARAMETER_SCHEMAS.map((schema) => schema.parameterSchemaId),
);

export function requireT4ContinuumParameterSchema(templateId) {
  const schema = LAFEA_T4_CONTINUUM_PARAMETER_SCHEMAS
    .find((item) => item.templateId === templateId);
  if (!schema) {
    throw new TypeError(`Unsupported T4 continuum template parameter schema: ${templateId}.`);
  }
  return schema;
}

function continuumSourceSchema(templateId) {
  const template = requireLafeaApplicationTemplate(templateId);
  return createTemplateParameterSchema({
    parameterSchemaId: template.parameterSchemaId,
    templateId: template.templateId,
    parameters: [
      recordParameter('applicationEvidence', 'Application geometry declaration and feature identities'),
      recordParameter('stageSource', 'Caller-supplied LAFEA.3 source with analysis mesh'),
      recordParameter('meshProvenance', 'Analysis-mesh producer and profile evidence'),
      recordParameter('featureSizing', 'Declared feature-sizing request evidence'),
      recordParameter('limitations', 'Caller-declared additional limitations', false),
    ],
    limitations: [
      'The compiler validates caller-supplied LAFEA.3 source; it does not generate an analysis mesh.',
      'Only registered planar formulations are accepted; axisymmetric input remains blocked.',
      'T3 elements are rejected for these application templates; production intake requires T6 or Q8.',
      'Application geometry class is retained as declared evidence and is not independently inferred from the mesh.',
      'No solve, recovery, convergence, utilization or code assessment is performed.',
    ],
  });
}

function recordParameter(parameterId, label, sourceRequired = true) {
  return deepFreeze({
    parameterId,
    label,
    valueKind: 'JSON_RECORD',
    required: true,
    nullable: false,
    canonicalUnit: null,
    allowedUnits: [],
    minimum: null,
    maximum: null,
    enumValues: [],
    sourceRequired,
    dependencies: [],
  });
}
