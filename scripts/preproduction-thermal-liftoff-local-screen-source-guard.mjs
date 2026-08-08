import fs from 'node:fs';

const files = [
  'src/workspace/engineering-loads/preproduction-thermal-liftoff-local-screen-intake.js',
  'src/workspace/engineering-loads/preproduction-thermal-liftoff-local-screen.js',
];
const source = files.map((file) => fs.readFileSync(file, 'utf8')).join('\n');
const imports = [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((match) => match[1]);

const historicalRuntimeImported = imports.some((value) => value.endsWith('/empirical-thermal-liftoff-local-screen.js')
  || value.endsWith('/authorized-empirical-thermal-liftoff-screen.js'));
const stagedJsonAuthorityOverlayImported = imports.some((value) => value.includes('analysis-authority-overlay'));
const formulaRegisterImported = imports.some((value) => value.includes('empirical-formula-register'));
const negativeReactionClampIntroduced = /Math\.max\s*\(\s*0\s*,/u.test(source)
  || /Math\.max\s*\([^\n]*localTrialContactReserveN/u.test(source);
const finalHotReactionFieldPublished = /\bfinalHotReactionN\b/u.test(source);
const productionRegistrationImported = imports.some((value) => value.includes('method-basis-register')
  || value.includes('formula-register'));
const gravityCalculatorImported = imports.some((value) => value.endsWith('/support-load-distribution-v3.js'));
const requiredCurrentGravityValidatorImported = imports.some((value) => value.endsWith('/authorized-empirical-load-execution-v8.js'));
const currentContactAuthorityImported = imports.some((value) => value.endsWith('/preproduction-support-contact-authority.js'));
const currentPrerequisiteAuthorityImported = imports.some((value) => value.endsWith('/preproduction-thermal-liftoff-prerequisite-authority.js'));

if (historicalRuntimeImported
    || stagedJsonAuthorityOverlayImported
    || formulaRegisterImported
    || negativeReactionClampIntroduced
    || finalHotReactionFieldPublished
    || productionRegistrationImported
    || gravityCalculatorImported
    || !requiredCurrentGravityValidatorImported
    || !currentContactAuthorityImported
    || !currentPrerequisiteAuthorityImported) {
  throw new Error('TL-03 current-head source boundary violated.');
}

console.log(JSON.stringify({
  check: 'preproduction-thermal-liftoff-local-screen-source-guard',
  status: 'PASS',
  historicalRuntimeImported,
  stagedJsonAuthorityOverlayImported,
  formulaRegisterImported,
  negativeReactionClampIntroduced,
  finalHotReactionFieldPublished,
  productionRegistrationImported,
  gravityCalculatorImported,
  requiredCurrentGravityValidatorImported,
  currentContactAuthorityImported,
  currentPrerequisiteAuthorityImported,
}, null, 2));
