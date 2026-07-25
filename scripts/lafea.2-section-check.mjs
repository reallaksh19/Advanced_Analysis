import assert from 'node:assert/strict';
import { calculateSectionProperties } from '../src/core/local-attachment-screening/index.js';
import { screeningRequestFixture } from './lafea.2-fixtures.mjs';
const request=screeningRequestFixture(),section=calculateSectionProperties(request),ro=500,ri=490;
close(section.crossSectionArea,Math.PI*(ro**2-ri**2));close(section.secondMomentY,Math.PI/4*(ro**4-ri**4));close(section.secondMomentZ,section.secondMomentY);close(section.polarMoment,2*section.secondMomentY);
const isolated=JSON.parse(JSON.stringify(request));isolated.sourceEvidence.foundationModel.thicknessBasis.wearPadThickness.value=200;isolated.sourceEvidence.foundationModel.thicknessBasis.cradleThickness.value=300;isolated.sourceEvidence.foundationModel.thicknessBasis.effectiveAnalyticalThickness.value=400;const isolatedSection=calculateSectionProperties(isolated);assert.equal(isolatedSection.crossSectionArea,section.crossSectionArea);assert.equal(isolatedSection.polarMoment,section.polarMoment);
const solid={...request,sourceEvidence:{...request.sourceEvidence,foundationModel:{...request.sourceEvidence.foundationModel,pipeGeometry:{outsideDiameter:{value:1000,sourceRef:'D'}},thicknessBasis:{...request.sourceEvidence.foundationModel.thicknessBasis,assessmentPipeThickness:{value:500,sourceRef:'T'}}}}};
const solidSection=calculateSectionProperties(solid);close(solidSection.crossSectionArea,Math.PI*500**2);close(solidSection.polarMoment,Math.PI/2*500**4);
assert.throws(()=>calculateSectionProperties({...request,sourceEvidence:{...request.sourceEvidence,foundationModel:{...request.sourceEvidence.foundationModel,pipeGeometry:{outsideDiameter:{value:0,sourceRef:'D'}}}}}),/Invalid assessed/);
assert.throws(()=>calculateSectionProperties({...request,sourceEvidence:{...request.sourceEvidence,foundationModel:{...request.sourceEvidence.foundationModel,thicknessBasis:{...request.sourceEvidence.foundationModel.thicknessBasis,assessmentPipeThickness:{value:501,sourceRef:'T'}}}}}),/Invalid assessed/);
console.log('LAFEA.2 exact annulus properties, identities, limiting circle and wall isolation passed.');
function close(actual,expected){assert.ok(Math.abs(actual-expected)<=1e-8*Math.max(1,Math.abs(expected)));}
