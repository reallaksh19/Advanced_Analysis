import {
  computeInputXmlModelHealthSourceEvidenceHash,
  computeInputXmlModelHealthSourceSemanticHash,
  requireInputXmlModelHealthSource,
} from '../geometry/model-health/index.js';
import { validateLinearPipingInputXmlAnalysisRequest } from './inputxml-request-validation.js';
import { parseInputXmlModelHealthSource } from './inputxml-source-binding.js';
import {
  diagnoseInputXmlModelHealthProximity,
  diagnoseInputXmlModelHealthTopology,
} from './inputxml-model-health.js';
import { diagnoseInputXmlLinearModelHealth } from './inputxml-linear-model-health.js';
import {
  INPUTXML_LINEAR_PREFEA_DIAGNOSTICS_SCHEMA,
  foldReadiness,
  makeFinding,
  requirePreFeaRecord,
  sealPreFeaRecord,
  uniqueAscii,
  validateInputXmlLinearPreFeaRequest,
} from './inputxml-linear-prefea-contract.js';

export function diagnoseInputXmlLinearPreFea(request, options = {}) {
  const accepted = validateInputXmlLinearPreFeaRequest(
    request,
    options.validateSourceRequest ?? validateLinearPipingInputXmlAnalysisRequest,
  );
  const parse = options.parseSource ?? parseInputXmlModelHealthSource;
  const sourceBundle = requireInputXmlModelHealthSource(parse(
    accepted.inputXmlSource.content,
    parseOptions(accepted),
  ));
  const sourceSemanticHash = computeInputXmlModelHealthSourceSemanticHash(sourceBundle);
  const sourceEvidenceHash = computeInputXmlModelHealthSourceEvidenceHash(sourceBundle);

  const topology = (options.diagnoseTopology ?? diagnoseInputXmlModelHealthTopology)(
    sourceBundle,
    options.topologyOptions ?? {},
  );
  const proximity = (options.diagnoseProximity ?? diagnoseInputXmlModelHealthProximity)(
    sourceBundle,
    options.proximityOptions ?? {},
  );
  const representability = (options.diagnoseRepresentability ?? diagnoseInputXmlLinearModelHealth)(
    sourceBundle,
    { ...(options.representabilityOptions ?? {}), analysisProfileId: accepted.requestedProfileId },
  );
  const findings = collectFindings({ sourceBundle, topology, proximity, representability });
  const folded = foldReadiness(findings, accepted.requestedCaseIds);
  const capabilities = normalizeCapabilities(representability.capabilities ?? []);
  const summary = summarize({
    folded,
    capabilities,
    sourceBundle,
    accepted,
  });

  return sealPreFeaRecord({
    schema: INPUTXML_LINEAR_PREFEA_DIAGNOSTICS_SCHEMA,
    diagnosticsId: `IXDIAG-${sourceSemanticHash.slice(0, 20)}-${accepted.requestedProfileId}`,
    status: folded.status,
    requestedProfileId: accepted.requestedProfileId,
    requestedCaseIds: accepted.requestedCaseIds,
    sourceAuthority: {
      sourceSemanticHash: accepted.inputXmlSource.semanticHash,
      contentHash: accepted.inputXmlSource.contentHash,
      sourceBundleSemanticHash: sourceSemanticHash,
      sourceBundleEvidenceHash: sourceEvidenceHash,
    },
    sourceBundle,
    geometryDiagnostics: normalizeDiagnosticRecord(sourceBundle.geometry),
    topologyDiagnostics: normalizeDiagnosticRecord(topology),
    proximityDiagnostics: normalizeDiagnosticRecord(proximity),
    representabilityDiagnostics: normalizeDiagnosticRecord(representability),
    capabilities,
    findings: folded.findings,
    summary,
    executionBoundary: {
      rawSourceParseCount: 1,
      materialAuthorityPrepared: false,
      sectionAuthorityPrepared: false,
      constraintsCompiled: false,
      mechanicalModelCompiled: false,
      loadCasesCompiled: false,
      stiffnessAssembled: false,
      factorizationHandle: 'NOT_CREATED',
      solverRuntime: 'NOT_CREATED',
      solveAuthorized: false,
    },
    semanticHash: '',
    evidenceHash: '',
  }, INPUTXML_LINEAR_PREFEA_DIAGNOSTICS_SCHEMA, diagnosticsIdentity, diagnosticsEvidence);
}

export function requireInputXmlLinearPreFeaDiagnostics(record) {
  const accepted = requirePreFeaRecord(
    record,
    INPUTXML_LINEAR_PREFEA_DIAGNOSTICS_SCHEMA,
    diagnosticsIdentity,
    diagnosticsEvidence,
  );
  if (accepted.executionBoundary.rawSourceParseCount !== 1) {
    throw new TypeError('A pre-FEA diagnostics record must prove exactly one raw-source parse.');
  }
  requireInputXmlModelHealthSource(accepted.sourceBundle);
  return accepted;
}

function collectFindings({ sourceBundle, topology, proximity, representability }) {
  const rows = [];
  for (const diagnostic of sourceBundle.geometry?.diagnostics ?? []) {
    rows.push(normalizeFinding(diagnostic, 'GEOMETRY', ['CANONICAL_GEOMETRY']));
  }
  appendReportFindings(rows, topology, 'TOPOLOGY', ['STRUCTURAL_GRAPH']);
  appendReportFindings(rows, proximity, 'GEOMETRY', ['STRUCTURAL_GRAPH']);
  appendReportFindings(rows, representability, 'COMPONENT', ['LINEAR_STRUCTURAL_MODEL']);
  for (const capability of representability.capabilities ?? []) {
    if (capability.status === 'BLOCK') {
      rows.push(makeFinding({
        code: 'REQUIRED_CAPABILITY_BLOCKED',
        category: capability.category ?? 'UNSUPPORTED_FEATURE',
        severity: 'ERROR',
        disposition: 'BLOCK',
        capabilityEffects: [capability.capabilityId],
        sourceFeatureIds: capability.sourceFeatureIds ?? [],
        sourcePaths: [],
        canonicalEntityIds: [],
        physicalCaseIds: [],
        message: `Required capability ${capability.capabilityId} is blocked.`,
        technicalBasis: 'The selected profile cannot prepare all active source features exactly or through a declared approximation.',
        evidence: {
          capabilityId: capability.capabilityId,
          findingIds: capability.findingIds ?? [],
          limitationCodes: capability.limitationCodes ?? [],
        },
        remediation: 'Provide supported source authority or select an explicitly permitted approximation profile.',
        approximationEligible: (capability.limitationCodes ?? []).length > 0,
        authorizationRequired: false,
      }));
    } else if (capability.status === 'WARN' || capability.status === 'CONDITIONAL') {
      rows.push(makeFinding({
        code: 'CAPABILITY_REQUIRES_CONDITIONAL_AUTHORIZATION',
        category: capability.category ?? 'UNSUPPORTED_FEATURE',
        severity: 'WARNING',
        disposition: 'CONDITIONAL',
        capabilityEffects: [capability.capabilityId],
        sourceFeatureIds: capability.sourceFeatureIds ?? [],
        sourcePaths: [],
        canonicalEntityIds: [],
        physicalCaseIds: [],
        message: `Capability ${capability.capabilityId} requires conditional authorization.`,
        technicalBasis: 'The mechanics are executable only with one or more visible profile-specific limitations.',
        evidence: {
          capabilityId: capability.capabilityId,
          findingIds: capability.findingIds ?? [],
          limitationCodes: capability.limitationCodes ?? [],
        },
        remediation: 'Review and explicitly accept the retained limitation set before solving.',
        approximationEligible: true,
        authorizationRequired: true,
      }));
    }
  }
  return deduplicate(rows);
}

function appendReportFindings(target, report, fallbackCategory, effects) {
  for (const row of report?.findings ?? report?.diagnostics ?? []) {
    target.push(normalizeFinding(row, fallbackCategory, effects));
  }
}

function normalizeFinding(row, fallbackCategory, effects) {
  const rawDisposition = String(row.disposition ?? row.status ?? '').toUpperCase();
  const severity = normalizeSeverity(row.severity, rawDisposition);
  const disposition = normalizeDisposition(rawDisposition, severity);
  return makeFinding({
    code: String(row.code ?? 'UNCLASSIFIED_INPUTXML_DIAGNOSTIC'),
    category: validCategory(row.category) ? row.category : fallbackCategory,
    severity,
    disposition,
    capabilityEffects: row.capabilityEffects ?? effects,
    sourceFeatureIds: row.sourceFeatureIds ?? row.featureIds ?? compact([row.sourceFeatureId]),
    sourcePaths: row.sourcePaths ?? compact([row.sourcePath]),
    canonicalEntityIds: row.canonicalEntityIds ?? compact([
      row.nodeId, row.segmentId, row.componentId, row.restraintId,
    ]),
    physicalCaseIds: row.physicalCaseIds ?? [],
    message: String(row.message ?? row.description ?? row.code ?? 'InputXML diagnostic.'),
    technicalBasis: String(row.technicalBasis ?? row.reason ?? 'Existing production diagnostic authority reported this condition.'),
    evidence: row.evidence ?? row.data ?? row.details ?? { originalCode: row.code ?? null },
    remediation: String(row.remediation ?? 'Correct the identified source authority and rerun pre-FEA diagnostics.'),
    approximationEligible: row.approximationEligible === true,
    authorizationRequired: disposition === 'CONDITIONAL' || row.authorizationRequired === true,
  });
}

function normalizeSeverity(value, disposition) {
  const text = String(value ?? '').toUpperCase();
  if (['INFO', 'WARNING', 'ERROR', 'FATAL'].includes(text)) return text;
  if (disposition === 'BLOCK' || disposition === 'BLOCKED') return 'ERROR';
  if (disposition === 'WARN' || disposition === 'CONDITIONAL' || disposition === 'ADVISORY') return 'WARNING';
  return 'INFO';
}

function normalizeDisposition(value, severity) {
  if (value === 'BLOCK' || value === 'BLOCKED' || severity === 'FATAL' || severity === 'ERROR') return 'BLOCK';
  if (value === 'WARN' || value === 'CONDITIONAL') return 'CONDITIONAL';
  if (value === 'ADVISORY' || severity === 'WARNING') return 'ADVISORY';
  return 'PASS';
}

function normalizeCapabilities(rows) {
  return Object.freeze([...rows].map((row) => Object.freeze({
    capabilityId: String(row.capabilityId),
    status: String(row.status),
    findingIds: Object.freeze(uniqueAscii(row.findingIds ?? [])),
    limitationCodes: Object.freeze(uniqueAscii(row.limitationCodes ?? [])),
  })).sort((a, b) => a.capabilityId < b.capabilityId ? -1 : a.capabilityId > b.capabilityId ? 1 : 0));
}

function summarize({ folded, capabilities, sourceBundle, accepted }) {
  const blocked = capabilities.filter((row) => row.status === 'BLOCK').map((row) => row.capabilityId);
  const conditional = capabilities.filter((row) => ['WARN', 'CONDITIONAL'].includes(row.status))
    .map((row) => row.capabilityId);
  const authorized = capabilities.filter((row) => ['PASS', 'EXACT', 'QUALIFIED'].includes(row.status))
    .map((row) => row.capabilityId);
  const findings = folded.findings;
  return Object.freeze({
    status: folded.status,
    requestedProfileId: accepted.requestedProfileId,
    requestedCaseIds: accepted.requestedCaseIds,
    findingCounts: folded.findingCounts,
    blockedCapabilityIds: Object.freeze(uniqueAscii(blocked)),
    conditionalCapabilityIds: Object.freeze(uniqueAscii(conditional)),
    authorizedCapabilityIds: Object.freeze(uniqueAscii(authorized)),
    missingAuthorityCount: findings.filter((row) => /MISSING|UNRESOLVED|INCOMPLETE/u.test(row.code)).length,
    unsupportedFeatureCount: findings.filter((row) => row.category === 'UNSUPPORTED_FEATURE').length,
    affectedSourceFeatureCount: new Set(findings.flatMap((row) => row.sourceFeatureIds)).size,
    affectedComponentCount: new Set(findings.filter((row) => row.category === 'COMPONENT')
      .flatMap((row) => row.canonicalEntityIds)).size,
    affectedRestraintCount: new Set(findings.filter((row) => ['RESTRAINT', 'CONSTRAINT'].includes(row.category))
      .flatMap((row) => row.canonicalEntityIds)).size,
    affectedLoadCount: new Set(findings.filter((row) => ['LOAD', 'PRESSURE', 'THERMAL'].includes(row.category))
      .flatMap((row) => row.canonicalEntityIds)).size,
    sourceNodeCount: sourceBundle.geometry?.nodes?.length ?? 0,
    sourceElementCount: sourceBundle.geometry?.segments?.length ?? 0,
    remediationSummary: Object.freeze(uniqueAscii(findings.filter((row) => row.disposition !== 'PASS')
      .map((row) => row.remediation))),
  });
}

function diagnosticsIdentity(record) {
  return {
    schema: record.schema,
    diagnosticsId: record.diagnosticsId,
    status: record.status,
    requestedProfileId: record.requestedProfileId,
    requestedCaseIds: record.requestedCaseIds,
    sourceAuthority: record.sourceAuthority,
    geometryDiagnostics: record.geometryDiagnostics,
    topologyDiagnostics: record.topologyDiagnostics,
    proximityDiagnostics: record.proximityDiagnostics,
    representabilityDiagnostics: record.representabilityDiagnostics,
    capabilities: record.capabilities,
    findings: record.findings,
    summary: record.summary,
    executionBoundary: record.executionBoundary,
  };
}

function diagnosticsEvidence(record) {
  return {
    sourceBundle: record.sourceBundle,
    sourceBundleEvidenceHash: record.sourceAuthority.sourceBundleEvidenceHash,
    findingEvidence: record.findings.map((row) => ({ findingId: row.findingId, evidence: row.evidence })),
  };
}

function normalizeDiagnosticRecord(value) {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'object') return value;
  const clone = structuredClone(value);
  delete clone.sourceBundle;
  delete clone.matrix;
  delete clone.factorization;
  delete clone.runtime;
  return clone;
}

function parseOptions(accepted) {
  const ingestion = accepted.ingestionOptions;
  return {
    unit: ingestion.unit,
    source: ingestion.source,
    componentOrigins: ingestion.componentOrigins,
    restraintTypeCodeMap: ingestion.restraintTypeCodeMap,
    restraintTypeMutation: ingestion.restraintTypeMutation,
    bendRadiusTolerance: ingestion.bendRadiusTolerance?.value ?? ingestion.bendRadiusTolerance,
    fileName: accepted.inputXmlSource.fileName,
  };
}

function deduplicate(rows) {
  return [...new Map(rows.map((row) => [row.findingId, row])).values()];
}

function compact(values) {
  return values.filter((value) => value !== undefined && value !== null).map(String);
}

function validCategory(value) {
  return [
    'SOURCE', 'SCHEMA', 'UNIT', 'GEOMETRY', 'TOPOLOGY', 'COMPONENT', 'MATERIAL', 'SECTION',
    'RIGID', 'RESTRAINT', 'LOAD', 'PRESSURE', 'THERMAL', 'PHYSICAL_CASE', 'CONSTRAINT',
    'MECHANISM', 'STIFFNESS', 'CONDITIONING', 'AUTHORIZATION', 'STALE_EVIDENCE', 'TAMPER',
    'UNSUPPORTED_FEATURE',
  ].includes(value);
}
