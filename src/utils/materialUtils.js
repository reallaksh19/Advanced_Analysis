import { SPL2_DB } from './spl2_database.js';

export const getAvailableMaterials = () => {
    // Collect all unique material names from modulus and map it
    const mats = new Set([
        ...Object.keys(SPL2_DB.modulus?.values || {})
    ]);
    return Array.from(mats).sort();
};

export const getMaterialProperties = (materialName, tempC = 148.9, od_mm = 273.05, wt_mm = 9.27) => {
    const tempF = (tempC * 9/5) + 32;

    const getNearestIndex = (temps) => {
        if (!temps) return -1;
        let bestIdx = 0;
        let minDiff = Infinity;
        for (let i = 0; i < temps.length; i++) {
            const diff = Math.abs(temps[i] - tempF);
            if (diff < minDiff) {
                minDiff = diff;
                bestIdx = i;
            }
        }
        return bestIdx;
    };

    const expIdx = getNearestIndex(SPL2_DB.expansion?.temperatures);
    const modIdx = getNearestIndex(SPL2_DB.modulus?.temperatures);

    // Map the modulus name to expansion name. In spl2_master, the mapping is implied or manual.
    // Let's do a basic mapping for typical carbon steels
    let expMatName = materialName;
    if (materialName.includes('Carbon steel')) {
        expMatName = 'Carbon Steel Carbon-Moly-Low-Chrome (Through 3Cr-Mo)';
    }

    // Attempt to match expansion material name
    const expVals = SPL2_DB.expansion?.values?.[expMatName]
        || SPL2_DB.expansion?.values?.['Carbon Steel Carbon-Moly-Low-Chrome (Through 3Cr-Mo)']
        || [];

    const modVals = SPL2_DB.modulus?.values?.[materialName] || [];

    let exp_in_100ft = expVals[expIdx] ?? expVals.find(v => v !== null) ?? 0;
    let ec_msi = modVals[modIdx] ?? modVals.find(v => v !== null) ?? 0;

    const E_MPa = ec_msi * 6894.757;

    const deltaT_F = tempF - 70;
    let alpha_mm_mm_C = 0;
    if (deltaT_F > 0) {
        const total_strain = exp_in_100ft / 1200; // in/in
        const alpha_F = total_strain / deltaT_F; // per °F
        alpha_mm_mm_C = alpha_F * 1.8; // per °C
    }

    const od_in = od_mm / 25.4;
    const wt_in = wt_mm / 25.4;
    const id_in = od_in - (2 * wt_in);
    const I_in4 = (Math.PI / 64) * (Math.pow(od_in, 4) - Math.pow(id_in, 4));
    const I_mm4 = I_in4 * 416231.4256;

    // Hardcoded Sa for now as it's not in SPL2_DB
    // Sa in screenshot is 137.9 MPa
    const Sa_MPa = 137.9;

    return {
        E: E_MPa.toFixed(0),
        alpha: alpha_mm_mm_C.toFixed(8),
        Sa: Sa_MPa.toFixed(1),
        I: I_mm4.toFixed(0)
    };
};
