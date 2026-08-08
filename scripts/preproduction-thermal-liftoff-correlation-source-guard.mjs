import fs from 'node:fs';

const runtime=fs.readFileSync('src/workspace/engineering-loads/preproduction-thermal-liftoff-correlation.js','utf8');
const authority=fs.readFileSync('src/workspace/engineering-loads/preproduction-thermal-liftoff-correlation-authority.js','utf8');
const oracle=fs.readFileSync('scripts/preproduction-thermal-liftoff-correlation-reference-oracle.mjs','utf8');
const check=fs.readFileSync('scripts/preproduction-thermal-liftoff-correlation-check.mjs','utf8');
const combined=`${runtime}\n${authority}\n${oracle}`;
const no=(text,re,msg)=>assert(!re.test(text),msg);
const yes=(text,re,msg)=>assert(re.test(text),msg);

no(oracle,/preproduction-thermal-liftoff-active-set\.js|calculatePreproductionThermalLiftoffActiveSet/,'independent oracle must not import/execute TL-04 candidate solver');
no(oracle,/src\/workspace\/engineering-loads/,'oracle must not import engineering-load runtime');
no(oracle,/linear-fea|lfea|analysis-authority-overlay/i,'oracle must not import LFEA or staged solver authority');
yes(oracle,/for \(let mask = 1; mask < 2 \*\* ids\.length; mask \+= 1\)/,'oracle must exhaustively enumerate contact states');
yes(oracle,/candidateOutputConsumed:false/,'oracle must explicitly reject candidate-output consumption');
yes(oracle,/iterativeActiveSetUsed:false/,'oracle must remain non-iterative');
no(runtime,/calculatePreproductionThermalLiftoffActiveSet/,'correlation runtime must not execute candidate mechanics');
yes(runtime,/requirePreproductionThermalLiftoffActiveSet/,'correlation runtime must validate candidate receipt');
yes(combined,/outputFittingPermitted:\s*false/,'output fitting must be prohibited');
yes(runtime,/generalAccuracyClaimPermitted:\s*false/,'general accuracy claim must remain prohibited');
yes(runtime,/tl06ProductionIntegrationAutomaticallyPermitted:\s*false/,'TL-06 automatic promotion must remain prohibited');
for (const token of ['productionCalculationConsumptionEnabled: false','productionMethodRegistrationPermitted: false','finalHotReactionPublicationPermitted: false']) yes(combined,new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')),`${token} boundary missing`);
no(combined,/StagedJSON|analysis-authority-overlay|authorized-empirical-thermal-liftoff|formula-register|method-basis|presenter/i,'TL-05 must not cross production/historical authority boundaries');
yes(check,/INDEPENDENT_REFERENCE_GENERATED_BEFORE_CANDIDATE/,'qualification must generate reference before candidate execution');

console.log(JSON.stringify({check:'preproduction-thermal-liftoff-controlled-correlation-source-guard',status:'PASS',independentOracleImportsCandidate:false,iterativeOracle:false,exhaustiveReferenceEnumeration:true,outputFitUsed:false,generalAccuracyClaimPermitted:false,tl06AutomaticIntegrationPermitted:false,productionConsumptionPermitted:false},null,2));
function assert(c,m){if(!c)throw new Error(m);}
