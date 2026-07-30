import { requireFrameElement } from '../linear-fea-frame-element/index.js';
import { requirePipingComponent } from '../linear-fea-piping-components/index.js';
import {
  fail,
  requireArray,
  requireExactKeys,
  requireIdentity,
} from './solver-contract.js';

const CODE = 'SOLVER_ELEMENT_CONTRIBUTION_INVALID';

export const ELEMENT_CONTRIBUTION_KEYS = Object.freeze([
  'elementId',
  'globalStiffness',
  'equivalentLoadGlobal',
  'initialStrainLoadGlobal',
]);

/**
 * Section 8 Assembly consumes exactly what B-3.1/B-3.2 already sealed —
 * global stiffness and the two global load vectors — through each package's
 * own accessor. Nothing here recomputes a matrix or a load: it re-verifies
 * the sealed record (so a tampered element is rejected by its own authority)
 * and reshapes it into the one normalized contribution shape assembly reads.
 *
 * @param {Readonly<object>} frameElement Sealed `fea-linear-frame-element/v1`.
 * @returns {Readonly<object>} One normalized element contribution.
 */
export function elementContributionFromFrameElement(frameElement) {
  const accepted = requireFrameElement(frameElement);
  return requireElementContribution({
    elementId: accepted.elementId,
    globalStiffness: [...accepted.globalStiffness],
    equivalentLoadGlobal: [...accepted.equivalentLoadVector.global],
    initialStrainLoadGlobal: [...accepted.initialStrainLoadVector.global],
  });
}

/**
 * One normalized contribution per element span a piping component generated
 * (section 8 Assembly). Each span's effective (post-flexibility-correction)
 * global stiffness is B-3.2's; the load vectors are the underlying B-3.1
 * element's, since section 4.3 components apply no load of their own.
 *
 * @param {Readonly<object>} component Sealed `fea-linear-piping-component/v1`.
 * @returns {Array<Readonly<object>>} One entry per `component.elements[]`.
 */
export function elementContributionsFromPipingComponent(component) {
  const accepted = requirePipingComponent(component);
  return accepted.elements.map((entry) => requireElementContribution({
    elementId: entry.elementId,
    globalStiffness: [...entry.effectiveGlobalStiffness],
    equivalentLoadGlobal: [...entry.frameElement.equivalentLoadVector.global],
    initialStrainLoadGlobal: [...entry.frameElement.initialStrainLoadVector.global],
  }));
}

function requireVector12(value, field) {
  requireArray(value, field, CODE);
  if (value.length !== 12) fail(`${field} must carry exactly 12 entries.`, CODE);
  value.forEach((entry) => {
    if (typeof entry !== 'number' || !Number.isFinite(entry)) fail(`${field} entries must be finite.`, CODE);
  });
  return value.map((entry) => (Object.is(entry, -0) ? 0 : entry));
}

function requireMatrix144(value, field) {
  requireArray(value, field, CODE);
  if (value.length !== 144) fail(`${field} must carry exactly 144 entries.`, CODE);
  value.forEach((entry) => {
    if (typeof entry !== 'number' || !Number.isFinite(entry)) fail(`${field} entries must be finite.`, CODE);
  });
  return value.map((entry) => (Object.is(entry, -0) ? 0 : entry));
}

export function requireElementContribution(entry) {
  requireExactKeys(entry, ELEMENT_CONTRIBUTION_KEYS, 'elementContribution', CODE);
  return Object.freeze({
    elementId: requireIdentity(entry.elementId, 'elementContribution.elementId', CODE),
    globalStiffness: requireMatrix144(entry.globalStiffness, 'elementContribution.globalStiffness'),
    equivalentLoadGlobal: requireVector12(entry.equivalentLoadGlobal, 'elementContribution.equivalentLoadGlobal'),
    initialStrainLoadGlobal: requireVector12(entry.initialStrainLoadGlobal, 'elementContribution.initialStrainLoadGlobal'),
  });
}
