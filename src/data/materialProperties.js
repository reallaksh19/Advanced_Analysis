export const materialPropertyTable = {
  CS_A106B: {
    materialId: 'CS_A106B',
    displayName: 'Carbon Steel A106 Gr.B',
    aliases: ['Carbon Steel', 'CS', 'A106B'],
    group: 'Carbon Steel',
    temperatureUnit: 'F',
    validTemperatureRange_F: [-20, 800],
    elasticModulusByTemperature_psi: {
      '70': 29000000,
      '300': 28300000,
      '500': 27300000
    },
    thermalExpansionByTemperature_in_in_F: {
      '300': 0.0000065,
      '500': 0.0000067
    },
    allowableStressBasis: 'Project screening table / ASME reference required',
    source: 'Project master DB',
    sourceRevision: 'SCREENING-REV-001',
    dataStatus: 'VERIFIED_SCREENING'
  },
  SS_304: {
    materialId: 'SS_304',
    displayName: 'Stainless Steel 304',
    aliases: ['SS304', '304', 'Austenitic Stainless Steel 18 Cr 8 Ni'],
    group: 'Stainless Steel',
    temperatureUnit: 'F',
    validTemperatureRange_F: [-20, 700],
    elasticModulusByTemperature_psi: { '70': 28300000, '300': 27000000, '500': 25800000 },
    thermalExpansionByTemperature_in_in_F: { '300': 0.0000087, '500': 0.0000092 },
    allowableStressBasis: 'Project screening table / ASME reference required',
    source: 'Project master DB',
    sourceRevision: 'SCREENING-REV-001',
    dataStatus: 'VERIFIED_SCREENING'
  },
  SS_316: {
    materialId: 'SS_316',
    displayName: 'Stainless Steel 316',
    aliases: ['SS316', '316'],
    group: 'Stainless Steel',
    temperatureUnit: 'F',
    validTemperatureRange_F: [-20, 700],
    elasticModulusByTemperature_psi: { '70': 28300000, '300': 27000000, '500': 25800000 },
    thermalExpansionByTemperature_in_in_F: { '300': 0.0000088, '500': 0.0000093 },
    allowableStressBasis: 'Project screening table / ASME reference required',
    source: 'Project master DB',
    sourceRevision: 'SCREENING-REV-001',
    dataStatus: 'VERIFIED_SCREENING'
  },
  LTCS_A333_6: {
    materialId: 'LTCS_A333_6',
    displayName: 'Low Temperature Carbon Steel A333 Gr.6',
    aliases: ['LTCS', 'A333 Gr.6'],
    group: 'Low Temperature Carbon Steel',
    temperatureUnit: 'F',
    validTemperatureRange_F: [-50, 650],
    elasticModulusByTemperature_psi: { '70': 29000000, '300': 28300000, '500': 27300000 },
    thermalExpansionByTemperature_in_in_F: { '300': 0.0000064, '500': 0.0000066 },
    allowableStressBasis: 'Project screening table / ASME reference required',
    source: 'Project master DB',
    sourceRevision: 'SCREENING-REV-001',
    dataStatus: 'VERIFIED_SCREENING'
  },
  DUPLEX_2205: {
    materialId: 'DUPLEX_2205',
    displayName: 'Duplex Stainless Steel 2205',
    aliases: ['Duplex', '2205'],
    group: 'Duplex Stainless Steel',
    temperatureUnit: 'F',
    validTemperatureRange_F: [-20, 600],
    elasticModulusByTemperature_psi: { '70': 29000000, '300': 27500000, '500': 26300000 },
    thermalExpansionByTemperature_in_in_F: { '300': 0.0000072, '500': 0.0000078 },
    allowableStressBasis: 'Project screening table / ASME reference required',
    source: 'Project master DB',
    sourceRevision: 'SCREENING-REV-001',
    dataStatus: 'VERIFIED_SCREENING'
  },
  GRE_FRP_PLACEHOLDER: {
    materialId: 'GRE_FRP_PLACEHOLDER',
    displayName: 'Glass-Reinforced Epoxy (GRE)',
    aliases: ['GRE', 'FRP'],
    group: 'Non-metallic',
    temperatureUnit: 'F',
    validTemperatureRange_F: [-50, 250],
    isAnisotropic: true,
    E_axial_psi: 2000000,
    E_hoop_psi: 3000000,
    Sa_axial_psi: 15000,
    Sa_hoop_psi: 20000,
    alpha_in_in_F: 0.000012,
    density_lb_in3: 0.065,
    allowableStressBasis: 'Project screening table / ASME reference required',
    source: 'Project master DB',
    sourceRevision: 'SCREENING-REV-001',
    dataStatus: 'VERIFIED_SCREENING'
  }
};

function interpolateTable(table = {}, temperature_F) {
  const points = Object.keys(table).map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  if (!points.length) return null;
  if (temperature_F <= points[0]) return Number(table[String(points[0])]);
  const last = points[points.length - 1];
  if (temperature_F >= last) return Number(table[String(last)]);
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i];
    const b = points[i + 1];
    if (temperature_F >= a && temperature_F <= b) {
      const ratio = (temperature_F - a) / (b - a);
      return Number(table[String(a)]) + ratio * (Number(table[String(b)]) - Number(table[String(a)]));
    }
  }
  return Number(table[String(last)]);
}

export function normalizeMaterialId(materialId) {
  if (materialPropertyTable[materialId]) return materialId;
  const needle = String(materialId || '').toLowerCase();
  const entry = Object.values(materialPropertyTable).find((row) =>
    row.aliases?.some((alias) => String(alias).toLowerCase() === needle)
  );
  return entry?.materialId || materialId;
}

export function resolveMaterial({ materialId, temperature_F, materialTable = materialPropertyTable } = {}) {
  const normalizedId = normalizeMaterialId(materialId);
  const row = materialTable[normalizedId];
  const base = {
    moduleId: 'engineering-data',
    methodId: 'MATERIAL_DATA_LOOKUP',
    formulaIds: ['MATERIAL_PROPERTY_LOOKUP'],
    materialId: normalizedId,
    temperature_F: Number(temperature_F)
  };

  if (!row) {
    return {
      ...base,
      status: 'MISSING_DATA',
      isQualified: false,
      value: null,
      diagnostics: [
        { code: 'MATERIAL_DATA_MISSING', severity: 'ERROR', message: `Material data missing for ${materialId}. Calculation blocked.` }
      ]
    };
  }

  if (row.dataStatus === 'NOT_QUALIFIED') {
    return {
      ...base,
      status: 'NOT_QUALIFIED',
      isQualified: false,
      value: row,
      diagnostics: [
        { code: 'MATERIAL_NOT_QUALIFIED', severity: 'ERROR', message: `Material ${materialId} requires a dedicated verified method.` }
      ]
    };
  }

  const [minT, maxT] = row.validTemperatureRange_F || [];
  const temp = Number(temperature_F);
  if (!Number.isFinite(temp) || temp < minT || temp > maxT) {
    return {
      ...base,
      status: 'MISSING_DATA',
      isQualified: false,
      value: null,
      diagnostics: [
        { code: 'MATERIAL_TEMPERATURE_OUT_OF_RANGE', severity: 'ERROR', message: `Material ${normalizedId} is not verified for ${temperature_F} F.` }
      ]
    };
  }

  let E_psi, alpha_in_in_F;

  if (row.isAnisotropic) {
    E_psi = row.E_axial_psi; // fallback or average if needed, though solvers should use E_axial_psi and E_hoop_psi directly
    alpha_in_in_F = row.alpha_in_in_F;
  } else {
    E_psi = interpolateTable(row.elasticModulusByTemperature_psi, temp);
    alpha_in_in_F = interpolateTable(row.thermalExpansionByTemperature_in_in_F, temp);
  }

  if (!Number.isFinite(E_psi) || !Number.isFinite(alpha_in_in_F)) {
    return {
      ...base,
      status: 'MISSING_DATA',
      isQualified: false,
      value: null,
      diagnostics: [
        { code: 'MATERIAL_PROPERTY_MISSING', severity: 'ERROR', message: `Material ${normalizedId} lacks E or alpha at ${temperature_F} F.` }
      ]
    };
  }

  return {
    ...base,
    status: 'PASSED',
    isQualified: true,
    E_psi,
    alpha_in_in_F,
    value: row,
    diagnostics: []
  };
}
