import { parseXmlCiiEnrichmentConfig } from '../../cii-standalone-port/core/config.js';
import { deriveXmlCiiServiceFromBranchName } from '../../cii-standalone-port/core/service-process-fallback.js';
import { normalizePipingClass } from '../../cii-standalone-port/core/piping-class-resolver.js';
import { DEFAULT_WEIGHT_MASTER_ROWS } from '../../cii-standalone-port/core/default-weight-master-rows.js';
import { DEFAULT_MATERIAL_MAP_ROWS } from '../../cii-standalone-port/core/default-material-map-rows.js';
import { DEFAULT_PIPING_CLASS_MATERIAL_CODE_ROWS } from '../../cii-standalone-port/core/default-piping-class-material-code-rows.js';
import { stringValue } from '../../workspaceModel.js';

// Default configuration for the engine
const config = parseXmlCiiEnrichmentConfig({
  weight: { masterRows: DEFAULT_WEIGHT_MASTER_ROWS },
  material: { mapRows: DEFAULT_MATERIAL_MAP_ROWS },
  pipingClass: { masterRows: DEFAULT_PIPING_CLASS_MATERIAL_CODE_ROWS }
});

const PHASE_LIBRARY = {
  'HC': 'G+L',
  'P': 'L',
  'A': 'G',
  'N': 'G'
};

const DENSITY_BY_PHASE = {
  'G': 100, // Gas default
  'L': 1000, // Liquid default
  'G+L': 1000 // Multi-phase default to liquid for weight
};

function getMaterialDensity(pipingClass) {
  const norm = normalizePipingClass(pipingClass);
  // Simple bucketing based on the master rules
  if (norm.includes('SS') || norm.includes('DSS')) return 7980; // Stainless/Duplex
  if (norm.includes('GRE')) return 1800; // GRE
  return 7850; // CS / Default Carbon Steel
}

export function augmentEnrichedWithFallbacks(object, enriched, source) {
  const augmented = { ...enriched };
  const branchName = stringValue(object?._branchName || source?.BRANCH_NAME || object?.name);
  
  // 1. Branch Name Parsing (Extract Service & Piping Class)
  const service = deriveXmlCiiServiceFromBranchName(branchName, config);
  
  // Extract piping class (Naive fallback logic for now; full DTXR fuzzy matcher goes in Preview UI)
  const tokens = branchName.split('-');
  let pipingClass = 'UNKNOWN';
  if (tokens.length > 4) {
    pipingClass = tokens[4]; // e.g. /ASIM-1885-6"-S8811951-91261M7-HC-01/B2
  }

  // 2. Fluid Density Fallback (Phase Logic)
  if (augmented.fluidDensityOpeKgM3 === undefined || augmented.fluidDensityOpeKgM3 === null) {
    const phase = PHASE_LIBRARY[service] || 'L'; 
    augmented.fluidDensityOpeKgM3 = DENSITY_BY_PHASE[phase] || 1000;
    augmented._deducedFluidDensity = true;
    augmented._phase = phase;
  }
  if (augmented.fluidDensityHydKgM3 === undefined || augmented.fluidDensityHydKgM3 === null) {
    augmented.fluidDensityHydKgM3 = 1000; // Hydro is always water
    augmented._deducedFluidDensityHyd = true;
  }

  // 3. Pipe Metal Density and Wall Thickness Fallback
  // If the pipeWeightKgPerM is not set, we'll ensure materialDensityKgM3 and wallThicknessMm are set so the formula calculates it.
  if (augmented.pipeWeightKgPerM === undefined || augmented.pipeWeightKgPerM === null) {
    if (augmented.materialDensityKgM3 === undefined || augmented.materialDensityKgM3 === null) {
      augmented.materialDensityKgM3 = getMaterialDensity(pipingClass);
      augmented._deducedMetalDensity = true;
    }
    if (augmented.wallThicknessMm === undefined || augmented.wallThicknessMm === null) {
      // Rough mapping for Schedule 40 equivalent if missing.
      // E.g., 6" (150mm) = ~7.11mm wall.
      const boreMm = Number(augmented.boreMm || augmented.outsideDiameterMm || 150);
      let assumedWt = 7.11; // default to 6" Sch 40
      if (boreMm <= 50) assumedWt = 3.91; // 2"
      else if (boreMm <= 100) assumedWt = 6.02; // 4"
      else if (boreMm <= 150) assumedWt = 7.11; // 6"
      else if (boreMm <= 200) assumedWt = 8.18; // 8"
      else if (boreMm <= 250) assumedWt = 9.27; // 10"
      else if (boreMm <= 300) assumedWt = 10.31; // 12"
      else assumedWt = boreMm * 0.035; // Rough heuristic

      augmented.wallThicknessMm = assumedWt;
      augmented._deducedWallThickness = true;
    }
    if (augmented.pipeOdMm === undefined || augmented.pipeOdMm === null) {
       augmented.pipeOdMm = Number(augmented.boreMm || 150) + 2 * augmented.wallThicknessMm;
    }
    if (augmented.insideDiameterMm === undefined || augmented.insideDiameterMm === null) {
       augmented.insideDiameterMm = Number(augmented.boreMm || 150);
    }
  }

  // 4. Insulation Fallback
  if (augmented.insulationThicknessMm === undefined || augmented.insulationThicknessMm === null) {
      augmented.insulationThicknessMm = 0;
  }
  if (augmented.insulationThicknessMm > 0 && (augmented.insulationDensityKgM3 === undefined || augmented.insulationDensityKgM3 === null)) {
    augmented.insulationDensityKgM3 = 210; // Project default
    augmented._deducedInsulationDensity = true;
  }

  // 5. Component Weight (DX^yy formula placeholder for missing weights)
  // If weight is missing, we use a basic DX^yy or assign 0 with a flag.
  // Full DTXR component matching happens here via weight-match-model.js
  if (augmented.componentWeightKg === null || augmented.componentWeightKg === undefined) {
    // Set to 0 and flag for UI
    augmented.componentWeightKg = 0;
    augmented._missingComponentWeight = true;
  }

  augmented._pipingClass = pipingClass;
  augmented._service = service;

  return augmented;
}
