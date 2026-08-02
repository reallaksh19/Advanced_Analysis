import { deepFreeze, semanticHash, stringValue } from '../../core/shared-piping-model/index.js';
import {
  DIMENSION_STATUS,
  candidate,
  catalogEntry,
  explicitCandidates,
  finitePositive,
  resolveCandidates,
} from './dimension-authority-internal.js';

export const TOPOLOGY_EDIT_DIMENSION_AUTHORITY = 'TopologyEditDimensionAuthority.v1';
export { DIMENSION_STATUS };

const DEFAULT_TOLERANCE_MM = 1e-6;

export function createDimensionAuthority(options = {}) {
  const toleranceMm = finitePositive(options.toleranceMm) || DEFAULT_TOLERANCE_MM;
  const catalog = options.catalog && typeof options.catalog === 'object' ? options.catalog : {};
  const branchInheritance = Object.freeze({
    enabled: options.branchInheritance?.enabled === true,
    allowedComponentTypes: Object.freeze(
      [...(options.branchInheritance?.allowedComponentTypes || ['TEE', 'OLET'])]
        .map((value) => stringValue(value).toUpperCase())
        .sort(),
    ),
  });

  const versionPayload = {
    schema: TOPOLOGY_EDIT_DIMENSION_AUTHORITY,
    toleranceMm,
    catalog,
    branchInheritance,
  };

  function resolveOutsideDiameter(evidence = {}, context = {}) {
    const entry = catalogEntry(catalog, evidence);
    const rows = explicitCandidates(evidence, [
      { path: ['outsideDiameterMm'], authority: 'EXPLICIT_COMPONENT_OD', priority: 10, label: 'outsideDiameterMm' },
      { path: ['odMm'], authority: 'EXPLICIT_COMPONENT_OD', priority: 10, label: 'odMm' },
      { path: ['dimensions', 'outsideDiameterMm'], authority: 'EXPLICIT_COMPONENT_OD', priority: 10, label: 'dimensions.outsideDiameterMm' },
      { path: ['attributes', 'OUTSIDE_DIAMETER'], authority: 'EXPLICIT_COMPONENT_OD', priority: 10, label: 'attributes.OUTSIDE_DIAMETER' },
      { path: ['attributes', 'DIAMETER'], authority: 'EXPLICIT_COMPONENT_OD', priority: 10, label: 'attributes.DIAMETER' },
      { path: ['diameterMm'], authority: 'CANONICAL_DIAMETER', priority: 20, label: 'diameterMm' },
    ]);

    const catalogRow = candidate(
      entry?.outsideDiameterMm,
      'CERTIFIED_CATALOG_OD',
      evidence.catalogRef || evidence.specRef || 'catalog',
      30,
    );
    if (catalogRow) rows.push(catalogRow);

    const bore = finitePositive(evidence.boreMm ?? evidence.insideDiameterMm ?? evidence.dimensions?.boreMm);
    const wall = finitePositive(evidence.wallThicknessMm ?? evidence.dimensions?.wallThicknessMm);
    if (bore !== null && wall !== null) {
      rows.push(candidate(
        bore + (2 * wall),
        'DERIVED_BORE_PLUS_WALL',
        evidence.sourceEvidenceId || 'bore+wall',
        40,
        'OD_EQUALS_BORE_PLUS_TWO_WALLS',
      ));
    }

    return resolveCandidates('outside_diameter', rows.filter(Boolean), toleranceMm, context);
  }

  function resolveBore(evidence = {}, context = {}) {
    const entry = catalogEntry(catalog, evidence);
    const rows = explicitCandidates(evidence, [
      { path: ['boreMm'], authority: 'EXPLICIT_COMPONENT_BORE', priority: 10, label: 'boreMm' },
      { path: ['insideDiameterMm'], authority: 'EXPLICIT_COMPONENT_BORE', priority: 10, label: 'insideDiameterMm' },
      { path: ['dimensions', 'boreMm'], authority: 'EXPLICIT_COMPONENT_BORE', priority: 10, label: 'dimensions.boreMm' },
      { path: ['attributes', 'BORE'], authority: 'EXPLICIT_COMPONENT_BORE', priority: 10, label: 'attributes.BORE' },
    ]);

    const catalogRow = candidate(
      entry?.boreMm,
      'CERTIFIED_CATALOG_BORE',
      evidence.catalogRef || evidence.specRef || 'catalog',
      30,
    );
    if (catalogRow) rows.push(catalogRow);

    const outsideDiameter = finitePositive(
      evidence.outsideDiameterMm ?? evidence.odMm ?? evidence.dimensions?.outsideDiameterMm ?? evidence.diameterMm,
    );
    const wall = finitePositive(evidence.wallThicknessMm ?? evidence.dimensions?.wallThicknessMm);
    if (outsideDiameter !== null && wall !== null && outsideDiameter > (2 * wall)) {
      rows.push(candidate(
        outsideDiameter - (2 * wall),
        'DERIVED_OD_MINUS_WALL',
        evidence.sourceEvidenceId || 'od-wall',
        40,
        'BORE_EQUALS_OD_MINUS_TWO_WALLS',
      ));
    }

    return resolveCandidates('bore', rows.filter(Boolean), toleranceMm, context);
  }

  function resolveBranchOutsideDiameter(evidence = {}, context = {}) {
    const entry = catalogEntry(catalog, evidence);
    const rows = explicitCandidates(evidence, [
      { path: ['branchOutsideDiameterMm'], authority: 'EXPLICIT_BRANCH_OD', priority: 10, label: 'branchOutsideDiameterMm' },
      { path: ['branchDiameterMm'], authority: 'EXPLICIT_BRANCH_OD', priority: 10, label: 'branchDiameterMm' },
      { path: ['dimensions', 'branchOutsideDiameterMm'], authority: 'EXPLICIT_BRANCH_OD', priority: 10, label: 'dimensions.branchOutsideDiameterMm' },
      { path: ['branchPort', 'outsideDiameterMm'], authority: 'EXPLICIT_BRANCH_PORT_OD', priority: 15, label: 'branchPort.outsideDiameterMm' },
    ]);

    const catalogRow = candidate(
      entry?.branchOutsideDiameterMm,
      'CERTIFIED_CATALOG_BRANCH_OD',
      evidence.catalogRef || evidence.specRef || 'catalog',
      30,
    );
    if (catalogRow) rows.push(catalogRow);

    const componentType = stringValue(context.componentType || evidence.componentType).toUpperCase();
    const mayInherit = branchInheritance.enabled
      && branchInheritance.allowedComponentTypes.includes(componentType)
      && evidence.allowBranchSizeInheritance === true;

    if (mayInherit) {
      const inherited = finitePositive(
        evidence.runOutsideDiameterMm
        ?? evidence.runDiameterMm
        ?? evidence.outsideDiameterMm
        ?? evidence.diameterMm,
      );
      if (inherited !== null) {
        rows.push(candidate(
          inherited,
          'RULED_BRANCH_INHERITANCE',
          evidence.sourceEvidenceId || 'branch-inheritance',
          50,
          'BRANCH_INHERITS_RUN_OD',
        ));
      }
    }

    return resolveCandidates('branch_outside_diameter', rows.filter(Boolean), toleranceMm, context);
  }

  return deepFreeze({
    schema: TOPOLOGY_EDIT_DIMENSION_AUTHORITY,
    version: semanticHash(versionPayload),
    toleranceMm,
    branchInheritance,
    resolveOutsideDiameter,
    resolveBore,
    resolveBranchOutsideDiameter,
  });
}
