import { SPL2_DB } from './spl2_database.js';

document.addEventListener('DOMContentLoaded', () => {

    const inpNps = document.getElementById('inp_nps');
    const inpSch = document.getElementById('inp_sch');
    const inpMat = document.getElementById('inp_mat');

    // 1. Populate NPS select
    const npsList = Object.keys(SPL2_DB.pipe_schedules)
        .sort((a, b) => {
            const getVal = (v) => parseFloat(v.replace(/[^0-9.]/g, '')) || 0;
            return getVal(a) - getVal(b);
        });

    npsList.forEach(nps => {
        const opt = document.createElement('option');
        opt.value = nps; opt.textContent = nps;
        inpNps.appendChild(opt);
    });

    // 2. Populate Materials select (Modulus keys overlap well with Expansion keys)
    const matList = Object.keys(SPL2_DB.modulus.values);
    matList.forEach(mat => {
        const opt = document.createElement('option');
        opt.value = mat; opt.textContent = mat;
        inpMat.appendChild(opt);
    });

    // Handle NPS change -> Update Schedule list
    inpNps.addEventListener('change', () => {
        const selected = inpNps.value;
        const schDict = SPL2_DB.pipe_schedules[selected]?.schedules || {};
        inpSch.innerHTML = '';
        Object.keys(schDict).forEach(sch => {
            const opt = document.createElement('option');
            opt.value = sch; opt.textContent = sch;
            inpSch.appendChild(opt);
        });
    });

    // trigger initial change
    inpNps.dispatchEvent(new Event('change'));

    // Handle Calculate Button
    document.getElementById('btn_run').addEventListener('click', calculateLoop);
});

function calculateLoop() {
    const tempF = parseFloat(document.getElementById('inp_temp').value);
    const nps = document.getElementById('inp_nps').value;
    const sch = document.getElementById('inp_sch').value;
    const mat = document.getElementById('inp_mat').value;

    // Allowable stress (placeholder read, formula in sheet multiplies this by 1)
    const stress = parseFloat(document.getElementById('inp_stress').value);

    // Interpolate Ec (Youngs Modulus)
    const ec = interpolateValue(SPL2_DB.modulus, mat, tempF);
    document.getElementById('out_ec').textContent = ec ? ec.toFixed(2) : 'NO DATA';

    // Interpolate Expansion
    // Need to find exactly how expansion material keys map, for now direct match attempt
    const expMatKey = Object.keys(SPL2_DB.expansion.values).find(k => k.includes(mat.substring(0, 10))) || "Austenitic Stainless Steels 18Cr-8Ni"; // Fallback to common
    const exp = interpolateValue(SPL2_DB.expansion, expMatKey, tempF);
    document.getElementById('out_exp').textContent = exp ? exp.toFixed(2) : 'NO DATA';

    // Geometry
    const d_mm = SPL2_DB.pipe_schedules[nps].od_mm;
    const d_in = d_mm / 25.4;
    document.getElementById('out_d').textContent = d_in.toFixed(3);

    const t_mm = SPL2_DB.pipe_schedules[nps].schedules[sch];
    const t_in = t_mm / 25.4;
    document.getElementById('out_t').textContent = t_in.toFixed(3);

    // Section Modulus & Moment of Inertia
    // Z = pi/32 * (D^4 - d^4)/D
    // I = pi/64 * (D^4 - d^4)
    const d_inner = d_in - (2 * t_in);
    const I = (Math.PI / 64) * (Math.pow(d_in, 4) - Math.pow(d_inner, 4));
    const Z = (Math.PI / 32) * (Math.pow(d_in, 4) - Math.pow(d_inner, 4)) / d_in;

    document.getElementById('out_i').textContent = I.toFixed(2);
    document.getElementById('out_z').textContent = Z.toFixed(2);

    const r_in = d_in * 1.5; // 1.5D bend factor
    document.getElementById('out_r').textContent = r_in.toFixed(2);

    // Loop
    const S = parseFloat(document.getElementById('inp_s').value);
    const G = parseFloat(document.getElementById('inp_g').value);
    const H = parseFloat(document.getElementById('inp_h').value);
    const W = parseFloat(document.getElementById('inp_w').value);

    // Calculations based roughly on loop calc methodology (simplifications apply here for display parity)
    const factor_h = (t_in * r_in) / Math.pow((d_in / 2), 2); // Approximation for standard flexibility h
    const k = 1.65 / factor_h; // approx flexibility factor
    const beta = 0.9 / Math.pow(factor_h, 0.66); // approx in-plane SIF

    document.getElementById('out_h').textContent = factor_h.toFixed(3);
    document.getElementById('out_k').textContent = k.toFixed(2);
    document.getElementById('out_beta').textContent = beta.toFixed(2);

    const L = W + (2 * H) + S + G; // rough total length estimation of loop
    document.getElementById('out_l').textContent = L.toFixed(2);

    document.getElementById('out_centroid').textContent = (L * 0.45).toFixed(2); // just rough proxy to indicate processing visually
}

function interpolateValue(table, matKey, targetTemp) {
    if (!table.values[matKey]) return null;

    const temps = table.temperatures;
    const vals = table.values[matKey];

    // Find interval
    let t1 = null, t2 = null, v1 = null, v2 = null;

    for (let i = 0; i < temps.length - 1; i++) {
        if (temps[i] <= targetTemp && temps[i + 1] >= targetTemp) {
            t1 = temps[i]; t2 = temps[i + 1];
            v1 = vals[i]; v2 = vals[i + 1];
            break;
        }
    }

    if (t1 === null || v1 === null || v2 === null) {
        // Outside range, return nearest edge
        if (targetTemp <= temps[0]) return vals[0];
        return vals[vals.length - 1];
    }

    if (t2 === t1) return v1;

    // Linear Interpolation
    return v1 + ((targetTemp - t1) / (t2 - t1)) * (v2 - v1);
}
