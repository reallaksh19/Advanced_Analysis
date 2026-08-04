export const BUCKET_B_CURRENT_MAIN_BASELINE = Object.freeze({
  schema: 'bucket-b-current-main-baseline/v1',
  integratedSharedGateMergeSha: 'b81e9f12dfe64fc9643808fc735597d0e94a42cc',
  preIntegrationMainSha: '2b563fdaf1bf3e084da1d6106260a68de1a3c477',
  bucket01InfrastructureMergeSha: 'afa4dbab9242d67a9462795b55bb47526427a11d',
  sharedGateReceiptSchema: 'bucket-b-shared-gate-qualification-receipt/v2',
  qualificationReportSchema: 'bucket-b-shared-gate-report/v2',
  applicationExecutionAuthorized: false,
  axisymmetricAuthorized: false,
  productionSwitchAuthorized: false,
});

export function requireBucketBCurrentMainBaseline(value) {
  if (value !== BUCKET_B_CURRENT_MAIN_BASELINE) {
    throw new TypeError('Bucket B current-main baseline must use the registered immutable authority record.');
  }
  return value;
}
