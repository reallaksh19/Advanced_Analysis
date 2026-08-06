import {
  GIT_SHA_PATTERN,
  HASH_PATTERN,
  deepFreeze,
  semanticHash,
  verifySealedHash,
} from './contracts.js';
import {
  REQUIRED_NC04_BENCHMARKS,
  validatePlasticMaterialContract,
} from './plastic-material-contract.js';

const REQUIRED_SOLVER = Object.freeze({
  solverVersion: '2.22',
  solverSourceCommit: 'cff1bb12ec7d24ad9048a1f54ae243a18d1a0b54',
  binaryHash: 'sha256:9a33d293706a66bee86f2f0ecf996a66758f904c20d61ad8c83ddc0f92ae4b7e',
  containerDigest: 'sha256:e6a82117027ef72afbecd597b81ebd83e5b40bdcfc63a70422b799aeb79270fb',
});
const ok = (value, limit) => Number.isFinite(value) && value >= 0 && value <= limit;

export function evaluatePlasticMaterialQualification({
  contract,
  candidateExactHeadSha,
  implementationHash,
  upstreamReceipt,
  solverCustody,
  evidence,
}) {
  validatePlasticMaterialContract(contract);
  const blockers = [];
  if (!GIT_SHA_PATTERN.test(candidateExactHeadSha || '')) blockers.push('CANDIDATE_HEAD_INVALID');
  if (!HASH_PATTERN.test(implementationHash || '')) blockers.push('IMPLEMENTATION_HASH_INVALID');
  try {
    verifySealedHash(upstreamReceipt, 'semanticHash', '$upstreamReceipt');
    if (upstreamReceipt.schema !== 'nonlinear-shell-contact-nc03-upstream-binding/v1'
      || upstreamReceipt.elasticDentingProcedureQualified !== true
      || upstreamReceipt.nc04Authorized !== true) {
      throw new Error('NC-03 authority absent');
    }
  } catch (error) {
    blockers.push(`NC03_RECEIPT_MISSING_OR_UNQUALIFIED:${error.message}`);
  }
  if (!solverCustody || Object.entries(REQUIRED_SOLVER).some(([key, value]) => solverCustody[key] !== value)) {
    blockers.push('SOLVER_CUSTODY_INVALID');
  }
  const rows = Array.isArray(evidence) ? evidence : [];
  const map = new Map(rows.map((row) => [row?.id, row]));
  if (map.size !== rows.length) blockers.push('EVIDENCE_DUPLICATE');
  for (const id of REQUIRED_NC04_BENCHMARKS) {
    const row = map.get(id);
    if (!row) {
      blockers.push(`EVIDENCE_MISSING:${id}`);
      continue;
    }
    try {
      verifySealedHash(row, 'evidenceHash', `$evidence.${id}`);
      if (row.schema !== 'lafea-nc04-material-evidence/v2') throw new Error('schema');
      if (row.exactHeadSha !== candidateExactHeadSha) throw new Error('stale head');
      if (row.solverHash !== solverCustody.binaryHash) throw new Error('solver hash');
      if (row.implementationHash !== implementationHash) throw new Error('implementation hash');
      if (!Number.isInteger(row.caseCount) || row.caseCount < 1) throw new Error('case count');
      for (const field of ['deckHashes', 'rawOutputHashes']) {
        if (!Array.isArray(row[field]) || row[field].length !== row.caseCount
          || row[field].some((hash) => !HASH_PATTERN.test(hash))) throw new Error(field);
      }
      checkMetrics(id, row.metrics, contract.limits);
    } catch (error) {
      blockers.push(`EVIDENCE_INVALID:${id}:${error.message}`);
    }
  }
  for (const row of rows) if (!REQUIRED_NC04_BENCHMARKS.includes(row?.id)) blockers.push(`EVIDENCE_UNKNOWN:${row?.id ?? 'UNKNOWN'}`);
  const qualified = blockers.length === 0;
  const report = {
    schema: 'nonlinear-shell-contact-nc04-report/v2',
    status: qualified ? 'NC04_QUALIFIED' : 'NC04_BLOCKED',
    candidateExactHeadSha,
    plasticMaterialHash: contract.plasticMaterialHash,
    implementationHash,
    upstreamReceiptSemanticHash: upstreamReceipt?.semanticHash ?? null,
    evaluatedBenchmarkCount: map.size,
    blockers: [...blockers].sort(),
    authority: {
      nc04ContractQualified: true,
      shellFormulationQualified: upstreamReceipt?.shellFormulationQualified === true,
      contactProcedureQualified: upstreamReceipt?.contactProcedureQualified === true,
      elasticDentingProcedureQualified: upstreamReceipt?.elasticDentingProcedureQualified === true,
      plasticMaterialQualified: qualified,
      nc05Authorized: qualified,
      plasticDentingProcedureQualified: false,
      codeAssessmentQualified: false,
      moduleQualified: false,
      productionExecutionAuthorized: false,
      automaticAssetAcceptanceAuthorized: false,
      autonomousCaseDispositionAuthorized: false,
      fitnessForServiceQualified: false,
      remainingStrengthQualified: false,
    },
  };
  return deepFreeze({ ...report, reportSemanticHash: semanticHash(report) });
}

function checkMetrics(id, metrics, limits) {
  if (!metrics || typeof metrics !== 'object' || Array.isArray(metrics)) throw new Error('metrics');
  const requireMetric = (name, limit) => {
    if (!ok(metrics[name], limit)) throw new Error(`${name} exceeds limit`);
  };
  switch (id) {
    case REQUIRED_NC04_BENCHMARKS[0]:
      requireMetric('elasticRelativeError', limits.elasticRelativeError);
      requireMetric('poissonAbsoluteError', limits.poissonAbsoluteError);
      requireMetric('maxPeeq', 1e-12);
      break;
    case REQUIRED_NC04_BENCHMARKS[1]:
      requireMetric('yieldStressAbsoluteError', limits.yieldStressAbsoluteError);
      requireMetric('maxPeeq', 1e-10);
      break;
    case REQUIRED_NC04_BENCHMARKS[2]:
      requireMetric('maxStressAbsoluteError', limits.hardeningStressAbsoluteError);
      requireMetric('maxPlasticStrainAbsoluteError', limits.plasticStrainAbsoluteError);
      break;
    case REQUIRED_NC04_BENCHMARKS[3]:
      requireMetric('unloadedStressAbsolute', limits.unloadedStressAbsolute);
      requireMetric('residualStrainAbsoluteError', limits.residualStrainAbsoluteError);
      requireMetric('unloadModulusRelativeError', limits.unloadModulusRelativeError);
      break;
    case REQUIRED_NC04_BENCHMARKS[4]:
      requireMetric('maxDeviatoricStress', 1e-8);
      requireMetric('peeq', limits.hydrostaticPeeqAbsolute);
      requireMetric('bulkStressRelativeError', limits.elasticRelativeError);
      break;
    case REQUIRED_NC04_BENCHMARKS[5]:
    case REQUIRED_NC04_BENCHMARKS[6]:
      requireMetric('j2ConsistencyRelativeError', limits.j2ConsistencyRelativeError);
      requireMetric('offModeStressRatio', limits.offModeStressRatio);
      break;
    case REQUIRED_NC04_BENCHMARKS[7]:
      requireMetric('stressSpreadRelative', limits.incrementSpreadRelative);
      requireMetric('plasticStrainSpread', limits.plasticStrainAbsoluteError);
      break;
    case REQUIRED_NC04_BENCHMARKS[8]:
      requireMetric('tangentRelativeError', limits.tangentRelativeError);
      requireMetric('reproducibilityAbsolute', limits.reproducibilityAbsolute);
      break;
    default:
      throw new Error('unknown benchmark');
  }
}
