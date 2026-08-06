import { deriveInputXmlLinearCase } from '../index.js';
import { byRole, recovered, term } from './inputxml-analysis-result-package-source.js';

const weight = byRole('WEIGHT_BASE');
const pressure = byRole('WEIGHT_PRESSURE');
const operating = byRole('WEIGHT_PRESSURE_TEMPERATURE');

export const sustained = deriveInputXmlLinearCase(recovered, {
  name: 'SUS', purpose: 'SUSTAINED', kind: 'LINEAR', terms: [term(pressure, 1)],
});
export const occasional = deriveInputXmlLinearCase(recovered, {
  name: 'OCC', purpose: 'OCCASIONAL', kind: 'LINEAR',
  terms: [term(operating, 1), term(weight, -0.25)],
});
export const expansion = deriveInputXmlLinearCase(recovered, {
  name: 'EXP', purpose: 'EXPANSION_RANGE', kind: 'RANGE',
  terms: [term(operating, 1), term(pressure, -1)],
});
export const derived = [sustained, occasional, expansion];
export { operating, pressure, weight };
