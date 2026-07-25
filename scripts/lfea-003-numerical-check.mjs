import assert from 'node:assert/strict';
import { createConvergenceStudy } from '../src/core/element-fea/convergence-study.js';
import { interpretConvergenceStudy } from '../src/core/element-fea/interpretation-result.js';
import { recoverPointProbe } from '../src/core/element-fea/physical-probes.js';
import { scalarConvergenceEvidence, stressTrendEvidence } from '../src/core/element-fea/stress-trend.js';
import { createStressProjection } from '../src/core/element-fea/stress-projection.js';
import { Q4_GAUSS_POINTS, Q4_NATURAL_CORNERS } from '../src/core/element-fea/integration-points.js';
import { convergenceStudy, invariantStudy, PROFILE, projectionFixture, t3ProbeFixture, t3ProjectionFixture } from './lfea-003-fixtures.mjs';

const result = interpretConvergenceStudy(convergenceStudy());
const ux = quantity(result, 'Q_UX');
assert.equal(ux.classification, 'MONOTONIC_CONVERGING');
near(ux.observedOrder.observedOrder, 2, 1e-12);
assert.equal(ux.observedOrder.valuesUsed.length,3);assert.equal(ux.observedOrder.asymptoticCheck,'NOT_CONTRADICTED_BY_MONOTONIC_SHRINKING_DIFFERENCES');
assert.equal(ux.classificationEvidence.rulesIdentity,'LFEA_SCALAR_TREND_RULES_V1');
assert.equal(ux.richardson.label, 'ESTIMATED_ASYMPTOTIC_VALUE');
near(ux.richardson.estimatedValue, .3, 1e-12);
const fixedStress = quantity(result, 'Q_SX');
assert.equal(fixedStress.stressTrend.trend, 'BOUNDED_AND_STABILIZING');
const maximum = quantity(result, 'Q_MAX_SX');
assert.equal(maximum.classification, 'NONCONVERGENT_RISING');
assert.equal(maximum.stressTrend.trend, 'LOCATION_MIGRATING');
assert.equal(maximum.stressTrend.interpretation, 'SINGULARITY_SUSPECTED');
assert.equal(maximum.stressTrend.scalarTrend, 'RISING_WITH_REFINEMENT');
assert.equal(result.studyEvidence.refinementRatios.every((row) => Math.abs(row.ratio - 2) < 1e-14), true);
near(quantity(result,'Q_FUNC').richardson.estimatedValue,1,1e-12);
near(quantity(result,'Q_REACTION_X').richardson.estimatedValue,-1,1e-12);
near(quantity(result,'Q_ENERGY').richardson.estimatedValue,1.2666666666666666,1e-12);
assert.ok(maximum.history.every((row)=>row.location&&row.location.elementId&&row.location.integrationPointId));

const invariant = interpretConvergenceStudy(invariantStudy());
for (const id of ['Q_UX','Q_SX','Q_ENERGY']) assert.equal(quantity(invariant, id).classification, 'EXACT_OR_INVARIANT');

const oscillatory = scalarConvergenceEvidence(history([1,1.2,1.1,1.15]), PROFILE);
assert.equal(oscillatory.classification, 'OSCILLATORY_CONVERGING');
assert.equal(oscillatory.observedOrder.applicability, 'NOT_APPLICABLE');
const zeroCrossing = scalarConvergenceEvidence(history([-1,.5,-.25,.125]), PROFILE);
assert.equal(zeroCrossing.classification, 'ZERO_CROSSING_UNRESOLVED');
const rising = scalarConvergenceEvidence(history([10,20,40,80]), PROFILE);
assert.equal(rising.classification, 'NONCONVERGENT_RISING');
const risingTrend = stressTrendEvidence(rising, sameLocations(4), ['POINT_LOAD']);
assert.equal(risingTrend.trend, 'RISING_WITH_REFINEMENT');
assert.equal(risingTrend.interpretation, 'SINGULARITY_SUSPECTED');
assert.equal(risingTrend.mathematicalProof, 'NOT_CLAIMED');
const migrating = stressTrendEvidence(rising, migratingLocations(), []);
assert.equal(migrating.trend, 'LOCATION_MIGRATING');
const nonconstant = scalarConvergenceEvidence([{levelId:'A',h:1,value:1},{levelId:'B',h:.6,value:.8},{levelId:'C',h:.25,value:.75}], PROFILE);
assert.equal(nonconstant.classification, 'MONOTONIC_CONVERGING');
assert.equal(nonconstant.observedOrder.applicability, 'NOT_APPLICABLE');
assert.match(nonconstant.observedOrder.reason, /constant-ratio/);
assert.equal(scalarConvergenceEvidence(history([1,2]).slice(0,2), PROFILE).classification, 'INSUFFICIENT_LEVELS');

const t3 = t3ProbeFixture();
near(recoverPointProbe(t3.level,t3.probe,t3.mapping,'UX',1e-12).value,.008,1e-12);
near(recoverPointProbe(t3.level,t3.probe,t3.mapping,'UY',1e-12).value,.018,1e-12);
near(recoverPointProbe(t3.level,t3.probe,t3.mapping,'GXY',1e-12).value,.05,1e-12);
near(recoverPointProbe(t3.level,t3.probe,t3.mapping,'SX',1e-12).value,2.1333333333333333,1e-12);

const study = createConvergenceStudy(convergenceStudy());
assert.equal(study.levels.every((level) => level.probeMappings[0].reconstructionResidual === 0), true);

const t3Projection=createStressProjection(t3ProjectionFixture());
assert.equal(t3Projection.elementCornerValues.length,3);
t3Projection.elementCornerValues.forEach((row)=>{near(component(row,'SX'),7,1e-12);assert.deepEqual(row.components[0].sourceIntegrationPointIds,['T1:T3_CONSTANT']);});

const constantProjection = createStressProjection(projectionFixture());
constantProjection.elementCornerValues.filter((row)=>row.elementId==='E1').forEach((row)=>near(component(row,'SX'),10,1e-12));
const shared = constantProjection.nodalValues.find((row)=>row.nodeId==='N2'&&row.stressComponent==='SX');
near(shared.weightedValue,20,1e-12); near(shared.contributorSpread,20,1e-12);
assert.deepEqual(shared.contributingElementIds,['E1','E2']);
constantProjection.elementCornerValues.filter((row)=>row.elementType==='Q4').forEach((row)=>{assert.equal(row.components[0].sourceIntegrationPointIds.length,4);assert.equal(row.components[0].coefficients.length,4);});

const linearValues = {};
for (const elementId of ['E1','E2']) linearValues[elementId]=Q4_GAUSS_POINTS.map((point)=>5+2*point.xi-3*point.eta);
const linearProjection = createStressProjection(projectionFixture({values:linearValues}));
linearProjection.elementCornerValues.filter((row)=>row.elementId==='E1').forEach((row,index)=>near(component(row,'SX'),5+2*Q4_NATURAL_CORNERS[index].xi-3*Q4_NATURAL_CORNERS[index].eta,1e-12));

for (const options of [{materialBoundary:true},{thicknessBoundary:true},{declaredDiscontinuities:[{discontinuityId:'D1',sides:[{sideId:'LEFT',elementIds:['E1']},{sideId:'RIGHT',elementIds:['E2']}]}]}]) {
  const projection=createStressProjection(projectionFixture(options));
  const rows=projection.nodalValues.filter((row)=>row.nodeId==='N2'&&row.stressComponent==='SX');
  assert.equal(rows.length,2); assert.deepEqual(rows.map((row)=>Math.round(row.weightedValue)).sort((a,b)=>a-b),[10,30]);
}
console.log('LFEA-003 mesh metrics, probes, convergence, order, Richardson, stress trends and projection benchmarks passed.');

function quantity(result,id){return result.quantityResults.find((row)=>row.quantityId===id);}
function history(values){return values.map((value,index)=>({levelId:`L${index+1}`,h:1/(2**index),value}));}
function sameLocations(count){return Array.from({length:count},()=>({locationIdentity:'SAME',globalCoordinates:{x:0,y:0}}));}
function migratingLocations(){return [{locationIdentity:'A'},{locationIdentity:'B'},{locationIdentity:'C'}];}
function component(row,name){return row.components.find((item)=>item.stressComponent===name).value;}
function near(actual,expected,tolerance){assert.ok(Math.abs(actual-expected)<=tolerance,`${actual} != ${expected}`);}
