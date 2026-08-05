import { semanticHash } from '../shared-piping-model/canonical-json.js';
import { deepFreeze } from '../shared-piping-model/immutable.js';

export const LBF_TO_N = 4.4482216152605;
export const INCH_TO_M = 0.0254;
export const LB_PER_IN_TO_N_PER_M = LBF_TO_N / INCH_TO_M;

export const ANVIL_VARIABLE_SPRING_CATALOG_ID = 'ANVIL-PP-11.11-VARIABLE-SPRING-2022';

const SMALL_SIZES = Object.freeze(['000', '00', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9']);
const LARGE_SIZES = Object.freeze(['10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20', '21', '22']);

// SOURCE: ASC/Anvil PP-SUB-82-C82-v01 20220309, pages 6-7.
const MIN_LOAD_LBF = Object.freeze([
  7, 19, 43, 63, 81, 105, 141, 189, 252, 336, 450, 600,
  780, 1020, 1350, 1800, 2400, 3240, 4500, 6000, 7990, 10610, 14100, 18750, 25005,
]);
const MAX_LOAD_LBF = Object.freeze([
  31, 72, 95, 137, 176, 228, 306, 410, 546, 728, 975, 1300,
  1690, 2210, 2925, 3900, 5200, 7020, 9750, 13000, 17300, 23000, 30550, 40625, 54178,
]);

const RATE_LB_PER_IN = Object.freeze({
  FIG_82: Object.freeze([
    null, null, 30, 42, 54, 70, 94, 126, 168, 224, 300, 400,
    520, 680, 900, 1200, 1600, 2160, 3000, 4000, 5320, 7080, 9400, 12500, 16670,
  ]),
  FIG_B268: Object.freeze([
    7, 15, 15, 21, 27, 35, 47, 63, 84, 112, 150, 200,
    260, 340, 450, 600, 800, 1080, 1500, 2000, 2660, 3540, 4700, 6250, 8335,
  ]),
  FIG_98: Object.freeze([
    null, null, 7, 10, 13, 17, 23, 31, 42, 56, 75, 100,
    130, 170, 225, 300, 400, 540, 750, 1000, 1330, 1770, 2350, 3125, 4167,
  ]),
  TRIPLE: Object.freeze([
    null, null, 5, 7, 9, 12, 16, 21, 28, 37, 50, 67,
    87, 113, 150, 200, 267, 360, 500, 667, 887, 1180, 1567, 2083, 2778,
  ]),
  QUADRUPLE: Object.freeze([
    null, null, 4, 5, 7, 9, 12, 16, 21, 28, 38, 50,
    65, 85, 113, 150, 200, 270, 375, 500, 665, 885, 1175, 1563, 2084,
  ]),
});

export const ANVIL_SERIES = deepFreeze([
  { seriesId: 'FIG_82', figure: '82', maximumRecommendedMovement: 0.75 * INCH_TO_M, order: 0 },
  { seriesId: 'FIG_B268', figure: 'B-268', maximumRecommendedMovement: 1 * INCH_TO_M, order: 1 },
  { seriesId: 'FIG_98', figure: '98', maximumRecommendedMovement: 2 * INCH_TO_M, order: 2 },
  { seriesId: 'TRIPLE', figure: 'Triple', maximumRecommendedMovement: 3 * INCH_TO_M, order: 3 },
  { seriesId: 'QUADRUPLE', figure: 'Quadruple', maximumRecommendedMovement: 4 * INCH_TO_M, order: 4 },
]);

export function buildAnvilVariableSpringCatalog() {
  const sizes = [...SMALL_SIZES, ...LARGE_SIZES];
  const entries = [];
  for (const series of ANVIL_SERIES) {
    for (let index = 0; index < sizes.length; index += 1) {
      const rate = RATE_LB_PER_IN[series.seriesId][index];
      if (!(rate > 0)) continue;
      entries.push({
        entryId: `${ANVIL_VARIABLE_SPRING_CATALOG_ID}:${series.seriesId}:${sizes[index]}`,
        manufacturer: 'ANVIL',
        catalogId: ANVIL_VARIABLE_SPRING_CATALOG_ID,
        seriesId: series.seriesId,
        figure: series.figure,
        seriesOrder: series.order,
        size: sizes[index],
        sizeOrder: index,
        maximumRecommendedMovement: series.maximumRecommendedMovement,
        minimumWorkingLoad: MIN_LOAD_LBF[index] * LBF_TO_N,
        maximumWorkingLoad: MAX_LOAD_LBF[index] * LBF_TO_N,
        springRate: rate * LB_PER_IN_TO_N_PER_M,
        sourceUnits: {
          minimumWorkingLoad: 'lbf',
          maximumWorkingLoad: 'lbf',
          springRate: 'lbf/in',
        },
        sourceValues: {
          minimumWorkingLoad: MIN_LOAD_LBF[index],
          maximumWorkingLoad: MAX_LOAD_LBF[index],
          springRate: rate,
        },
      });
    }
  }
  const catalog = {
    schema: 'fea-linear-variable-spring-catalog/v1',
    catalogId: ANVIL_VARIABLE_SPRING_CATALOG_ID,
    sourceIdentity: {
      manufacturer: 'ASC Engineered Solutions / Anvil',
      documentId: 'PP-SUB-82-C82-v01',
      revision: '20220309',
      table: 'Spring Hanger Size and Series Selection',
      interpretation: 'Published load-column bounds and series rates; general-rule series movement limits.',
    },
    entries,
    semanticHash: '',
  };
  catalog.semanticHash = semanticHash(catalog);
  return deepFreeze(catalog);
}
