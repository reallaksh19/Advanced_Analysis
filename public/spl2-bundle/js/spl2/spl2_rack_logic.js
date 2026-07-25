import { SPL2_DB } from './spl2_database.js';

document.addEventListener('DOMContentLoaded', () => {

    const inpNps = document.getElementById('inp_nps');
    const inpSch = document.getElementById('inp_sch');

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

    inpNps.dispatchEvent(new Event('change'));

    document.getElementById('btn_run').addEventListener('click', calculateRackLoad);
});

function calculateRackLoad() {
    const nps = document.getElementById('inp_nps').value;
    const sch = document.getElementById('inp_sch').value;

    const sg = parseFloat(document.getElementById('inp_sg').value) || 0;
    const insulThick = parseFloat(document.getElementById('inp_insul').value) || 0;
    const density = parseFloat(document.getElementById('inp_dens').value) || 0;

    const spacing = parseFloat(document.getElementById('inp_spacing').value) || 0;
    const bents = parseFloat(document.getElementById('inp_bents').value) || 0;
    const windLoadFt = parseFloat(document.getElementById('inp_wind').value) || 0;

    // Geometric calculations
    const d_mm = SPL2_DB.pipe_schedules[nps]?.od_mm || 0;
    const d_in = d_mm / 25.4;
    const r_out = d_in / 2;

    const t_mm = SPL2_DB.pipe_schedules[nps]?.schedules[sch] || 0;
    const t_in = t_mm / 25.4;
    const r_in = r_out - t_in;

    // Weights per foot
    // Pipe Weight = π * (ro^2 - ri^2) / 144 * density
    const areaSqIn = Math.PI * (Math.pow(r_out, 2) - Math.pow(r_in, 2));
    const w_pipe = (areaSqIn / 144) * density;

    // Content Weight = π * ri^2 / 144 * 62.4 * sg
    const waterDensityRef = 62.4;
    const w_cont = (Math.PI * Math.pow(r_in, 2) / 144) * waterDensityRef * sg;
    const w_test = (Math.PI * Math.pow(r_in, 2) / 144) * waterDensityRef * 1.0; // Water test SG=1

    // Insulation Weight (assuming density 12 lb/ft3 for typical mineral wool)
    const insulDensity = 12;
    const insulAreaSqIn = Math.PI * (Math.pow(r_out + insulThick, 2) - Math.pow(r_out, 2));
    const w_insul = (insulAreaSqIn / 144) * insulDensity;

    document.getElementById('out_w_pipe').textContent = w_pipe.toFixed(2);
    document.getElementById('out_w_cont').textContent = w_cont.toFixed(2);
    document.getElementById('out_w_test').textContent = w_test.toFixed(2);
    document.getElementById('out_w_insul').textContent = w_insul.toFixed(2);

    // Structural Load Cases
    // De = (W_pipe + W_insul) * Spacing 
    const de = (w_pipe + w_insul) * spacing;

    // Do = (W_pipe + W_insul + W_cont) * Spacing
    const do_op = (w_pipe + w_insul + w_cont) * spacing;

    // Dt = (W_pipe + W_insul + W_test) * Spacing
    const dt = (w_pipe + w_insul + w_test) * spacing;

    // Wind Load on bent = WindLoad (lbf/ft) * (d_in + 2*insul)/12 * Spacing
    const projectedDiaFt = (d_in + 2 * insulThick) / 12;
    const w_total = windLoadFt * projectedDiaFt * spacing;

    document.getElementById('out_de').textContent = de.toLocaleString(undefined, { maximumFractionDigits: 1 });
    document.getElementById('out_do').textContent = do_op.toLocaleString(undefined, { maximumFractionDigits: 1 });
    document.getElementById('out_dt').textContent = dt.toLocaleString(undefined, { maximumFractionDigits: 1 });
    document.getElementById('out_w').textContent = w_total.toLocaleString(undefined, { maximumFractionDigits: 1 });
}
