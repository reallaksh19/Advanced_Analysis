import assert from 'node:assert/strict';
import { DEFAULT_SYNTHETIC_DEPLOYMENT_REHEARSAL_CONTRACT, REQUIRED_NC09_REHEARSAL_DOMAINS, validateSyntheticDeploymentRehearsalContract } from '../src/core/nonlinear-shell-contact/synthetic-deployment-rehearsal-contract.js';
validateSyntheticDeploymentRehearsalContract(DEFAULT_SYNTHETIC_DEPLOYMENT_REHEARSAL_CONTRACT);
assert.equal(REQUIRED_NC09_REHEARSAL_DOMAINS.length,10);
assert.equal(DEFAULT_SYNTHETIC_DEPLOYMENT_REHEARSAL_CONTRACT.productionExecutionAuthorized,false);
assert.equal(DEFAULT_SYNTHETIC_DEPLOYMENT_REHEARSAL_CONTRACT.nc10Authorized,false);
