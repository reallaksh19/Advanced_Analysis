import { semanticHash } from '../../core/shared-piping-model/canonical-json.js';
import { deepFreeze } from '../../core/shared-piping-model/immutable.js';

export const STAGEDJSON_MATERIAL_SECTION_CATALOG_SCHEMA = 'stagedjson-material-section-catalog/v1';
export const STAGEDJSON_BASELINE_TEMPERATURE_K = 293.15;

const EXISTING_COLD_POINTS = [
  { absoluteTemperature: 293.15, elasticModulus: 2.0e11, shearModulus: 7.69e10, poissonRatio: 0.3, massDensity: 7850, thermalExpansionCoefficient: 1.17e-5 },
  { absoluteTemperature: 393.15, elasticModulus: 1.94e11, shearModulus: 7.46e10, poissonRatio: 0.3, massDensity: 7850, thermalExpansionCoefficient: 1.2e-5 },
];

/*
 * Elevated points are deliberately sparse and only bracket the real selected
 * branch's 582.15 K operating and 598.15 K design temperatures.
 *
 * Elastic modulus: public ASME B31.1-1995 carbon-steel temperature curve as
 * reproduced by Engineering ToolBox, using the low-carbon-steel row at
 * 500/600/700 F-equivalent temperatures. Shear modulus is derived from
 * G = E / (2(1 + nu)) with the already-qualified nu=0.3 convention.
 *
 * Thermal expansion: specific Group 1 carbon-steel total-expansion points
 * from public reproductions of ASME B31.3 Appendix C Table C-1, converted to
 * mean coefficient from the 70 F reference. No extrapolation is permitted by
 * the downstream B-2.2 resolver.
 */
const HOT_CARBON_STEEL_POINTS = [
  { absoluteTemperature: 533.15, elasticModulus: 188226874103.4864, shearModulus: 72394951578.26399, poissonRatio: 0.3, massDensity: 7850, thermalExpansionCoefficient: 1.2627906976744186e-5 },
  { absoluteTemperature: 589.15, elasticModulus: 184090019727.5856, shearModulus: 70803853741.37907, poissonRatio: 0.3, massDensity: 7850, thermalExpansionCoefficient: 1.3018867924528301e-5 },
  { absoluteTemperature: 644.15, elasticModulus: 175816310975.784, shearModulus: 67621658067.60923, poissonRatio: 0.3, massDensity: 7850, thermalExpansionCoefficient: 1.3404761904761906e-5 },
];

const MATERIAL_FAMILY_SOURCE = deepFreeze({
  sourceId: 'STAGEDJSON-CARBON-STEEL-BULK-PROPERTIES-2026-08',
  sourceRevision: '2026-08-07',
  coldAuthority: 'PUBLIC-CARBON-STEEL-BULK-PROPERTIES/2026-08-03',
  elasticModulusAuthority: 'ASME-B31.1-1995-CARBON-STEEL-E-T-PUBLIC-REPRODUCTION',
  thermalExpansionAuthority: 'ASME-B31.3-APPENDIX-C-TABLE-C1-GROUP1-PUBLIC-REPRODUCTION',
  poissonRatioPolicy: 'REUSE_M008_C_NU_0.3',
  densityPolicy: 'REUSE_M008_C_7850_KG_M3',
  points: [...EXISTING_COLD_POINTS, ...HOT_CARBON_STEEL_POINTS],
});

const MATERIALS = [
  material('ASTM A234-WPB', 'CS_A234_WPB'),
  material('ASTM A105', 'CS_A105'),
];

const SECTIONS = [deepFreeze({
  sectionKey: 'NPS8-SCH100',
  sectionStateId: 'SEC-NPS8-SCH100',
  nominalBoreMm: 200,
  schedule: 100,
  outerDiameter: 0.2191,
  wallThickness: 0.01509,
  source: {
    sourceId: 'ASME-B36.10-NPS8-SCH100',
    sourceRevision: '2022',
  },
})];

const CATALOG = deepFreeze({
  schema: STAGEDJSON_MATERIAL_SECTION_CATALOG_SCHEMA,
  catalogId: 'STAGEDJSON:1885S:CARBON_STEEL:R1',
  materialFamilySource: MATERIAL_FAMILY_SOURCE,
  materials: MATERIALS,
  sections: SECTIONS,
  semanticHash: semanticHash({
    schema: STAGEDJSON_MATERIAL_SECTION_CATALOG_SCHEMA,
    catalogId: 'STAGEDJSON:1885S:CARBON_STEEL:R1',
    materialFamilySource: MATERIAL_FAMILY_SOURCE,
    materials: MATERIALS,
    sections: SECTIONS,
  }),
});

export function stagedJsonMaterialSectionCatalog() {
  return CATALOG;
}

export function findStagedJsonMaterialCatalogEntry(rawMaterialSignal) {
  const signal = normalize(rawMaterialSignal);
  return CATALOG.materials.find((entry) => normalize(entry.rawMaterialSignal) === signal) || null;
}

export function findStagedJsonSectionCatalogEntry({ nominalBoreMm, schedule }) {
  return CATALOG.sections.find((entry) => entry.nominalBoreMm === nominalBoreMm && entry.schedule === schedule) || null;
}

function material(rawMaterialSignal, materialId) {
  return deepFreeze({
    rawMaterialSignal,
    materialId,
    propertyFamilyId: 'CARBON_STEEL_GROUP1_BULK',
    points: MATERIAL_FAMILY_SOURCE.points,
    source: {
      sourceId: MATERIAL_FAMILY_SOURCE.sourceId,
      sourceRevision: MATERIAL_FAMILY_SOURCE.sourceRevision,
      sourceSemanticHash: semanticHash({ materialId, rawMaterialSignal, family: MATERIAL_FAMILY_SOURCE }),
    },
  });
}

function normalize(value) {
  return typeof value === 'string' ? value.trim().toUpperCase().replace(/\s+/gu, ' ') : '';
}
