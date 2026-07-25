import assert from 'node:assert/strict';
import { calculateLocalAttachmentScreening } from '../src/core/local-attachment-screening/index.js';
import { mechanicalStress, wallLocation } from '../src/core/local-attachment-screening/mechanics.js';
import { calculateSectionProperties } from '../src/core/local-attachment-screening/section-properties.js';
import { screeningRequestFixture } from './lafea.2-fixtures.mjs';
const request=screeningRequestFixture(),section=calculateSectionProperties(request);
const at=(angle,radius=500)=>wallLocation({evaluationLocationId:'P',radiusBasis:'EXPLICIT_RADIUS',radius,angle,sourceReference:'P'});
const caseOf=(force,moment)=>({combinedForceLocal:force,combinedMomentLocal:moment});
let stress=mechanicalStress(caseOf([1000,0,0],[0,0,0]),at(0),section);close(stress.sigmaXMechanical,1000/section.crossSectionArea);
const my=[0,Math.PI/2,Math.PI,3*Math.PI/2].map((angle)=>mechanicalStress(caseOf([0,0,0],[0,20000,0]),at(angle),section).sigmaXMechanical);close(my[0],20000*500/section.secondMomentY);close(my[1],0);close(my[2],-my[0]);close(my[3],0);
const mz=[0,Math.PI/2,Math.PI,3*Math.PI/2].map((angle)=>mechanicalStress(caseOf([0,0,0],[0,0,10000]),at(angle),section).sigmaXMechanical);close(mz[0],0);close(mz[1],-10000*500/section.secondMomentZ);close(mz[2],0);close(mz[3],-mz[1]);
for(const radius of [490,495,500])close(mechanicalStress(caseOf([0,0,0],[5000,0,0]),at(0,radius),section).tauXThetaTorsion,5000*radius/section.polarMoment);
const positive=mechanicalStress(caseOf([1000,0,0],[5000,20000,-10000]),at(Math.PI/4),section),negative=mechanicalStress(caseOf([-1000,0,0],[-5000,-20000,10000]),at(Math.PI/4),section);close(negative.sigmaXMechanical,-positive.sigmaXMechanical);close(negative.tauXThetaTorsion,-positive.tauXThetaTorsion);
const doubled=mechanicalStress(caseOf([2000,0,0],[10000,40000,-20000]),at(Math.PI/4),section);close(doubled.sigmaXMechanical,2*positive.sigmaXMechanical);close(doubled.tauXThetaTorsion,2*positive.tauXThetaTorsion);
close(positive.sigmaXMechanical,1000/section.crossSectionArea+(20000*positivePoint().z+10000*positivePoint().y)/section.secondMomentY);
const result=calculateLocalAttachmentScreening(request);assert.equal(result.qualification.state,'ACCEPTED');assert.ok(result.screeningCases[0].transverseResultantsRetained.forceY!==0);assert.equal('tauXYTransverse' in result.pointStressStates[0].mechanicalStress,false);assert.match(result.pointStressStates[0].mechanicalStress.signConvention,/MY_Z/);
console.log('LAFEA.2 axial, biaxial bending, torsion, sign, scaling and transverse-resultant behavior passed.');
function positivePoint(){return at(Math.PI/4);}
function close(actual,expected){assert.ok(Math.abs(actual-expected)<=1e-9*Math.max(1,Math.abs(expected)),`${actual} != ${expected}`);}
