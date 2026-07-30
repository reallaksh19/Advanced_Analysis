/**
 * Dedicated CAD/FEA Piping Support Engine for Sequential Sketcher.
 * 
 * Computes deterministic support loads (Operating Vertical OPE_V, Lateral Guide, Line Stop),
 * ASME B31.3 temperature allowable stress ratios (Sh/Sc), and generates structured reaction
 * vector callouts for ISO/ASME drawing canvas and Property Inspector synchronization.
 */

export const SUPPORT_TYPES = Object.freeze({
  ANC: 'ANC',       // Anchor (6-DOF constraint)
  GUIDE: 'GUIDE',   // Lateral Directional Guide
  SPRING: 'SPRING', // Variable / Constant Spring Hanger
  REST: 'REST',     // Rigid Restraint / Vertical Stop
  SNUB: 'SNUB',     // Dynamic Snubber / Shock Absorber
});

// ASME B31.3 Table A-1 Carbon Steel (A106 Gr.B / A53 Gr.B) Allowable Stress Ratios (Sh/Sc * 100)
const TEMP_BREAKPOINTS = Object.freeze([
  [0, 100],
  [50, 100],
  [100, 100],
  [150, 97],
  [200, 93],
  [250, 89],
  [300, 85],
  [350, 81],
  [400, 76],
  [450, 71],
  [500, 63],
]);

export class PipingSupportEngine {
  constructor(config = {}) {
    this.gravity = config.gravity || 9.80665;
    this.verticalLoadFactor = config.verticalLoadFactor || 1.0;
    this.guideDivisor = config.guideDivisor || 1.23;
    this.lineStopDivisor = config.lineStopDivisor || 1.23;
  }

  /**
   * Evaluates ASME B31.3 hot/cold allowable stress ratio Sh/Sc at temperature C.
   * @param {number} tempC - Operating temperature in deg C
   * @returns {number} Dimensionless Sh/Sc ratio (0.63 - 1.00)
   */
  getAllowableStressRatio(tempC) {
    const t = Number.isFinite(tempC) ? tempC : 20;
    if (t <= 0) return 1.00;
    if (t >= 500) return 0.63;
    for (let i = 0; i < TEMP_BREAKPOINTS.length - 1; i++) {
      const [tLow, rLow] = TEMP_BREAKPOINTS[i];
      const [tHigh, rHigh] = TEMP_BREAKPOINTS[i + 1];
      if (t >= tLow && t <= tHigh) {
        const fraction = (t - tLow) / (tHigh - tLow);
        const ratioPercent = rLow + fraction * (rHigh - rLow);
        return Number((ratioPercent / 100).toFixed(4));
      }
    }
    return 1.00;
  }

  /**
   * Computes engineering support loads (in Newtons and kN) for a given pipe or support entity.
   * @param {Object} entity - Piping geometry or support entity
   * @returns {Object} Calculated loads: { opeVN, guideHN, lineStopN, shScRatio, opeVkN, guideHkN, lineStopkN }
   */
  calculateEntityLoads(entity) {
    if (!entity) {
      return this.emptyLoads();
    }

    const props = entity.properties || {};
    const geom = props.geometry || {};
    const identity = props.identity || {};

    // Determine pipe dimensions and span
    const odMm = Number(geom.pipeOdMm || geom.od || 114.3); // Default 4" NPS
    const wallMm = Number(geom.wallThicknessMm || geom.wall || 6.02);
    const lengthMm = Number(geom.length || geom.spanMm || 3000); // Default 3m span
    const spanM = Math.max(0.1, lengthMm / 1000);

    // Determine unit weights (kg/m)
    const pipeWtKgPerM = Number(geom.pipeWtKgPerM || odMm * wallMm * 0.02466 || 16.07);
    const fluidWtKgPerM = Number(geom.fluidWtKgPerM || ((odMm - 2 * wallMm) ** 2) * Math.PI * 0.25 * 1e-6 * 1000 || 8.2);
    const insulWtKgPerM = Number(geom.insulWtKgPerM || 2.5);

    // Operating temperature C
    const tempC = Number(geom.temperatureC || props.temperatureC || identity.tempC || 150);
    const shScRatio = this.getAllowableStressRatio(tempC);

    // 1. Operating Vertical Load (OPE_V in Newtons)
    // OPE_V = (PipeWt + FluidWt_OPE + InsulationWt) * SpanM * g * loadFactor
    const totalWtKg = (pipeWtKgPerM + fluidWtKgPerM + insulWtKgPerM) * spanM;
    const opeVN = Math.round(totalWtKg * this.gravity * this.verticalLoadFactor);

    // 2. Guide Lateral Load (Guide in Newtons)
    // Guide = max(0.1 * 0.3 * OPE_V * (Wall / 6.3) * (ShSc / 1.23), 0.3 * OPE_V)
    const termGuide = 0.1 * 0.3 * opeVN * (wallMm / 6.3) * (shScRatio / this.guideDivisor);
    const guideHN = Math.round(Math.max(termGuide, 0.3 * opeVN));

    // 3. Line Stop Axial Load (LineStop in Newtons)
    // LineStop = 1000 * 0.0209 * ((pi / 32) * (Dia^4 - (Dia - 2*Wall)^4) / Dia)^0.5079 * (ShSc / 1.23)
    const dOuter = Math.max(10, odMm);
    const dInner = Math.max(1, odMm - 2 * wallMm);
    const sectionModulus = (Math.PI / 32) * (dOuter ** 4 - dInner ** 4) / dOuter;
    const lineStopN = Math.round(1000 * 0.0209 * (sectionModulus ** 0.5079) * (shScRatio / this.lineStopDivisor));

    return {
      opeVN,
      guideHN,
      lineStopN,
      shScRatio,
      opeVkN: Number((opeVN / 1000).toFixed(2)),
      guideHkN: Number((guideHN / 1000).toFixed(2)),
      lineStopkN: Number((lineStopN / 1000).toFixed(2)),
      temperatureC: tempC,
      spanM: Number(spanM.toFixed(2)),
    };
  }

  emptyLoads() {
    return {
      opeVN: 0,
      guideHN: 0,
      lineStopN: 0,
      shScRatio: 1.0,
      opeVkN: 0,
      guideHkN: 0,
      lineStopkN: 0,
      temperatureC: 20,
      spanM: 0,
    };
  }

  /**
   * Generates reaction vector callouts for a support entity to display on the SVG canvas.
   * @param {Object} entity - Support or piping entity
   * @returns {Array<{ label: string, forceN: number, forcekN: number, direction: 'V'|'H'|'A' }>}
   */
  getReactionCallouts(entity) {
    const loads = this.calculateEntityLoads(entity);
    const type = (entity?.properties?.supportType || entity?.entityType || 'REST').toUpperCase();

    const callouts = [];
    if (type === 'ANC' || type === 'ANCHOR') {
      callouts.push({
        label: `Fv: ${loads.opeVkN} kN`,
        forceN: loads.opeVN,
        forcekN: loads.opeVkN,
        direction: 'V',
      });
      callouts.push({
        label: `Fh: ${loads.guideHkN} kN`,
        forceN: loads.guideHN,
        forcekN: loads.guideHkN,
        direction: 'H',
      });
      callouts.push({
        label: `Fa: ${loads.lineStopkN} kN`,
        forceN: loads.lineStopN,
        forcekN: loads.lineStopkN,
        direction: 'A',
      });
    } else if (type === 'GUIDE') {
      callouts.push({
        label: `Fh: ${loads.guideHkN} kN`,
        forceN: loads.guideHN,
        forcekN: loads.guideHkN,
        direction: 'H',
      });
    } else if (type === 'SPRING' || type === 'REST' || type === 'SUPPORT') {
      callouts.push({
        label: `Fv: ${loads.opeVkN} kN`,
        forceN: loads.opeVN,
        forcekN: loads.opeVkN,
        direction: 'V',
      });
    } else if (type === 'SNUB' || type === 'LINESTOP') {
      callouts.push({
        label: `Fa: ${loads.lineStopkN} kN`,
        forceN: loads.lineStopN,
        forcekN: loads.lineStopkN,
        direction: 'A',
      });
    } else {
      // Default fallback for general pipes/components
      callouts.push({
        label: `Fv: ${loads.opeVkN} kN`,
        forceN: loads.opeVN,
        forcekN: loads.opeVkN,
        direction: 'V',
      });
    }

    return callouts;
  }

  /**
   * Formats calculated loads as an object suitable for the Property Inspector.
   * @param {Object} entity
   * @returns {Object} Formatted load properties
   */
  formatLoadInspectorProperties(entity) {
    const loads = this.calculateEntityLoads(entity);
    return {
      'Operating Vertical Load (OPE_V)': `${loads.opeVN} N (${loads.opeVkN} kN)`,
      'Lateral Guide Load (Guide)': `${loads.guideHN} N (${loads.guideHkN} kN)`,
      'Axial Line Stop Load (LineStop)': `${loads.lineStopN} N (${loads.lineStopkN} kN)`,
      'Allowable Stress Ratio (Sh/Sc)': `${(loads.shScRatio * 100).toFixed(1)}% (${loads.shScRatio})`,
      'Operating Temperature': `${loads.temperatureC} °C`,
      'Span Length': `${loads.spanM} m`,
    };
  }
}
