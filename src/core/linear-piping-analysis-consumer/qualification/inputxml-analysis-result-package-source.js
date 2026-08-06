import assert from 'node:assert/strict';
import {
  DISCLOSED_GENERIC_ANALYZER_APPROXIMATION_PROFILE as APPROXIMATE,
  createInputXmlLinearSolveRuntime,
  diagnoseInputXmlLinearModelHealthContext,
  preflightInputXmlLinearSolve,
  prepareInputXmlLinearSolve,
  recoverInputXmlLinearCaseResults,
  solveInputXmlLinearPhysicalCases,
} from '../index.js';

const units = '<UNITS><LENGTH LABEL="MM" FACTOR="25.4"/><FORCE LABEL="N" FACTOR="4.4482216152605"/><MOMENT-INPUT LABEL="NM" FACTOR="0.1129848290276167"/><EMOD LABEL="MPA" FACTOR="0.006894757293168"/><PRESSURE LABEL="MPA" FACTOR="0.006894757293168"/><TEMP LABEL="C" FACTOR="0.5555555555555556"/><PDENS LABEL="KG/M3" FACTOR="27679.9047102"/><IDENS LABEL="KG/M3" FACTOR="27679.9047102"/><FDENS LABEL="KG/M3" FACTOR="27679.9047102"/></UNITS>';
const xml = `<CAESARII xmlns="CODE" VERSION="14.00" XML_TYPE="Input"><PIPINGMODEL xmlns="" JOBNAME="MHPR10" NUMELT="1" NUMBEND="0" NUMRIGID="0" NUMREST="1">${units}<PIPINGELEMENT FROM_NODE="10" TO_NODE="20" DELTA_X="1000" DELTA_Y="0" DELTA_Z="0" DIAMETER="100" WALL_THICK="5" MATERIAL_NAME="A106" MATERIAL_NUM="106" MODULUS="200000" POISSONS="0.3" PIPE_DENSITY="7850" FLUID_DENSITY="0" INSUL_THICK="0" INSUL_DENSITY="0" PRESSURE1="2" TEMP_EXP_C1="100"><RESTRAINT TYPE="0" NODE="10"/></PIPINGELEMENT></PIPINGMODEL></CAESARII>`;

export const context = diagnoseInputXmlLinearModelHealthContext(xml, {});
export const solve = prepareInputXmlLinearSolve(context, APPROXIMATE, {
  modelId: 'PR10', gravityDirection: { x: 0, y: 0, z: -1 },
});
export const preflight = preflightInputXmlLinearSolve(solve);
export const runtime = createInputXmlLinearSolveRuntime(solve, preflight);
export const executions = solveInputXmlLinearPhysicalCases(runtime);
export const recovered = recoverInputXmlLinearCaseResults(runtime, executions);

export function byRole(role) {
  const row = recovered.find((candidate) => candidate.caseIdentity.caseRole === role);
  assert.ok(row, `Missing recovered case ${role}.`);
  return row;
}
export function term(row, factor) { return { recoveredCaseId: row.recoveredCaseId, factor }; }
export function approval() {
  return { source: 'MH-PR10-QUALIFICATION-APPROVAL', revision: '01',
    approver: 'MH-PR10-FIXTURE-ENGINEER',
    reason: 'Exercise disclosed InputXML approximation custody in qualification.' };
}
