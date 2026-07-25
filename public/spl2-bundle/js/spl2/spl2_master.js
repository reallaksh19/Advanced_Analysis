import { SPL2_DB } from './spl2_database.js';
import { calcLoopFromSpreadsheet } from './spl2_loop_algo.js';
import { RackSectionCanvas, RackPlanCanvas } from './spl2_rack_canvas.js';
import { SimplifiedCanvas } from './spl2_simp_canvas.js';
import { LoopCanvas } from './spl2_loop_canvas.js';

// Import our calculated logic functions or implement them here
// Since we have separate logic scripts, to combine them we can just copy the functions
// here, or adapt them to the new IDs (prefixed with loop_, rack_, simp_). 
// For a fully unified master controller, we'll embed the adapted logic here.

document.addEventListener('DOMContentLoaded', () => {

    // Initialize Canvases
    window.rackSectionCanvas = new RackSectionCanvas('canvas-rack-section');
    window.rackPlanCanvas = new RackPlanCanvas('canvas-rack-plan');
    window.simpCanvas = new SimplifiedCanvas('canvas-simp-3d');
    window.loopCanvas = new LoopCanvas('canvas-loop');

    // Bi-directional Canvas Edit Binding (Double-click Canvas Dimension labels)
    document.addEventListener('canvas-edit', (e) => {
        const id = e.detail.id;
        const val = e.detail.value;
        const inputEl = document.getElementById(id);
        if (inputEl) {
            inputEl.value = val;

            // Auto-trigger appropriate calc module
            if (id.startsWith('loop')) document.getElementById('loop_btn_run').click();
            if (id.startsWith('rack')) {
                // If it's a rack matrix input, trigger a change event to kick off the dynamic recalculation
                inputEl.dispatchEvent(new Event('change', { bubbles: true }));
            }
            if (id.startsWith('simp')) document.getElementById('simp_btn_run').click();
        }
    });

    /* ============================
       TOP NAVIGATION LOGIC
    ============================ */
    const topNavBtns = document.querySelectorAll('.top-nav-btn');
    const topPanes = document.querySelectorAll('.top-pane');

    topNavBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const currentBtn = e.currentTarget;

            // Reset all
            topNavBtns.forEach(b => {
                b.classList.remove('active');
                b.style.color = '';
                b.style.borderBottom = 'none';
                b.style.opacity = '0.6';
            });
            topPanes.forEach(p => {
                p.style.display = 'none';
                p.classList.remove('active');
            });

            // Activate current
            currentBtn.classList.add('active');
            currentBtn.style.color = 'var(--amber)';
            currentBtn.style.borderBottom = '2px solid var(--amber)';
            currentBtn.style.opacity = '1';

            const targetId = currentBtn.getAttribute('data-target');
            const targetPane = document.getElementById(targetId);
            if (targetPane) {
                targetPane.style.display = targetId === 'top-tab-spl2' ? 'flex' : 'block';
                targetPane.classList.add('active');

                // Trigger canvas redraws if we switched back to the SPL2 pane
                if (targetId === 'top-tab-spl2') {
                    if (window.loopCanvas) window.loopCanvas.resize();
                    if (window.rackSectionCanvas) window.rackSectionCanvas.resize();
                    if (window.rackPlanCanvas) window.rackPlanCanvas.resize();
                    if (window.simpCanvas) window.simpCanvas.resize();
                }
            }
        });
    });

    /* ============================
       SPL2 BUNDLE NAVIGATION LOGIC
    ============================ */
    const navBtns = document.querySelectorAll('.side-btn');
    const tabPanes = document.querySelectorAll('.tab-pane');

    navBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            // Remove active from all
            navBtns.forEach(b => b.classList.remove('active'));
            tabPanes.forEach(p => p.classList.remove('active'));

            // Add active to clicked
            // Use currentTarget to ensure we click the button, not its inner div/icon
            const currentBtn = e.currentTarget;
            currentBtn.classList.add('active');

            const targetId = currentBtn.getAttribute('data-target');
            document.getElementById(targetId).classList.add('active');

            if (targetId === 'tab-db') renderDatabaseFrames();
            if (targetId === 'tab-loop' && window.loopCanvas) window.loopCanvas.resize();
            if (targetId === 'tab-rack' && window.rackSectionCanvas) {
                window.rackSectionCanvas.resize();
                window.rackPlanCanvas.resize();
            }
            if (targetId === 'tab-simp' && window.simpCanvas) window.simpCanvas.resize();
        });
    });

    const dbBtns = document.querySelectorAll('.db-tab-btn');
    const dbWrappers = document.querySelectorAll('.db-table-wrapper');
    dbBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetId = btn.getAttribute('data-dbsub');
            if (!targetId) return; // Skip canvas buttons that share class

            dbBtns.forEach(b => {
                if (b.hasAttribute('data-dbsub')) b.classList.remove('active');
            });
            dbWrappers.forEach(w => {
                if (w.parentElement.id === 'tab-db') w.style.display = 'none';
            });

            btn.classList.add('active');
            const targetEl = document.getElementById(targetId);
            if (targetEl) targetEl.style.display = 'block';
        });
    });

    /* ============================
       COMMON POPULATION
    ============================ */
    const npsList = Object.keys(SPL2_DB.pipe_schedules)
        .sort((a, b) => (parseFloat(a.replace(/[^0-9.]/g, '')) || 0) - (parseFloat(b.replace(/[^0-9.]/g, '')) || 0));

    const matList = Object.keys(SPL2_DB.modulus.values);

    function setupSelects(prefix) {
        const inpNps = document.getElementById(`${prefix}_inp_nps`);
        const inpSch = document.getElementById(`${prefix}_inp_sch`);
        const inpMat = document.getElementById(`${prefix}_inp_mat`);

        if (inpNps) {
            npsList.forEach(nps => {
                const opt = document.createElement('option');
                opt.value = nps; opt.textContent = nps;
                inpNps.appendChild(opt);
            });

            // Set Default NPS to 10
            inpNps.value = "10";

            inpNps.addEventListener('change', () => {
                const selected = inpNps.value;
                const schDict = SPL2_DB.pipe_schedules[selected]?.schedules || {};
                inpSch.innerHTML = '';
                Object.keys(schDict).forEach(sch => {
                    const opt = document.createElement('option');
                    opt.value = sch; opt.textContent = sch;
                    inpSch.appendChild(opt);
                });

                // Set Default Schedule to STD if available
                if (Array.from(inpSch.options).some(o => o.value === 'STD')) {
                    inpSch.value = 'STD';
                }
            });
            inpNps.dispatchEvent(new Event('change'));
        }

        if (inpMat) {
            matList.forEach(mat => {
                const opt = document.createElement('option');
                opt.value = mat; opt.textContent = mat.substring(0, 25);
                inpMat.appendChild(opt);
            });

            // Set Default Material
            const defMat = Array.from(inpMat.options).find(o => o.value.includes('Carbon steels, C'));
            if (defMat) inpMat.value = defMat.value;
        }
    }

    setupSelects('loop');
    setupSelects('rack');
    setupSelects('simp');

    const btnLoop = document.getElementById('loop_btn_run');
    if (btnLoop) btnLoop.addEventListener('click', calculateLoop);

    const btnRack = document.getElementById('rack_btn_run');
    if (btnRack) btnRack.addEventListener('click', calculateRackLoad);

    const btnSimp = document.getElementById('simp_btn_run');
    if (btnSimp) btnSimp.addEventListener('click', calculateSimplified);

    // Bind real-time panel updates
    const loopTab = document.getElementById('tab-loop');
    if (loopTab) {
        loopTab.addEventListener('input', calculateLoop);
        loopTab.addEventListener('change', calculateLoop);
    }

    const simpTab = document.getElementById('tab-simp');
    if (simpTab) {
        simpTab.addEventListener('input', calculateSimplified);
        simpTab.addEventListener('change', calculateSimplified);
    }

    if (window.initRackCanvas) window.initRackCanvas();
    if (window.initLoopCanvas) window.initLoopCanvas();
    if (window.initSimpCanvas) window.initSimpCanvas();

    // Unit toggle binding
    const unitToggle = document.getElementById('global_inp_units');
    if (unitToggle) {
        unitToggle.addEventListener('change', toggleUnits);
    }
});


/* ============================
   SHARED UTILS
============================ */
function interpolateValue(table, matKey, targetTemp) {
    if (!table.values[matKey]) return null;
    const temps = table.temperatures;
    const vals = table.values[matKey];

    let t1 = null, t2 = null, v1 = null, v2 = null;
    for (let i = 0; i < temps.length - 1; i++) {
        if (temps[i] <= targetTemp && temps[i + 1] >= targetTemp) {
            t1 = temps[i]; t2 = temps[i + 1];
            v1 = vals[i]; v2 = vals[i + 1];
            break;
        }
    }

    if (t1 === null || v1 === null || v2 === null) {
        if (targetTemp <= temps[0]) return vals[0];
        return vals[vals.length - 1];
    }
    if (t2 === t1) return v1;
    return v1 + ((targetTemp - t1) / (t2 - t1)) * (v2 - v1);
}

/* ============================
   SI/IMPERIAL UNIT WRAPPER
============================ */
const UNIT_MAP = {
    'Imperial': {
        'unit-temp': '°F',
        'unit-len-sm': 'in',
        'unit-len-lg': 'ft',
        'unit-stress': 'psi',
        'unit-force': 'lbs',
        'unit-moment': 'ft-lb',
        'unit-dens': 'lb/ft³',
        'unit-exp': 'in/100ft',
        'unit-mod': 'ksi',
        'unit-wind': 'lb/ft²',
        'unit-weight': 'lb/ft',
        'unit-inertia': 'in⁴'
    },
    'SI': {
        'unit-temp': '°C',
        'unit-len-sm': 'mm',
        'unit-len-lg': 'm',
        'unit-stress': 'MPa',
        'unit-force': 'N',
        'unit-moment': 'N-m',
        'unit-dens': 'kg/m³',
        'unit-exp': 'mm/m',
        'unit-mod': 'MPa',
        'unit-wind': 'kg/m²',
        'unit-weight': 'kg/m',
        'unit-inertia': 'mm⁴'
    }
};

function toggleUnits() {
    const isSI = document.getElementById('global_inp_units') && document.getElementById('global_inp_units').value === 'SI';
    const sys = isSI ? 'SI' : 'Imperial';
    const map = UNIT_MAP[sys];

    Object.keys(map).forEach(cls => {
        document.querySelectorAll(`.${cls}`).forEach(el => {
            el.textContent = map[cls];
        });
    });

    const insDensEl = document.getElementById('global_inp_ins_dens');
    const ambTempEl = document.getElementById('global_inp_amb_temp');
    const windEl = document.getElementById('global_inp_wind');

    if (insDensEl) {
        let dens = parseFloat(insDensEl.value) || 0;
        insDensEl.value = isSI ? (dens * 16.0185).toFixed(0) : (dens / 16.0185).toFixed(3);
    }
    if (ambTempEl) {
        let temp = parseFloat(ambTempEl.value) || 0;
        ambTempEl.value = isSI ? ((temp - 32) * 5 / 9).toFixed(1) : ((temp * 9 / 5) + 32).toFixed(0);
    }
    if (windEl) {
        let wind = parseFloat(windEl.value) || 0;
        windEl.value = isSI ? (wind * 4.88243).toFixed(2) : (wind / 4.88243).toFixed(0);
    }

    // Convert individual module input fields dynamically based on unit system flip
    const rawFormFields = [
        { id: 'loop_inp_temp', isTemp: true },
        { id: 'loop_inp_stress', isStress: true },
        { id: 'loop_inp_s', isLenLg: true },
        { id: 'loop_inp_g', isLenLg: true },
        { id: 'loop_inp_h', isLenLg: true },
        { id: 'loop_inp_w', isLenLg: true },
        { id: 'simp_inp_temp', isTemp: true },
        { id: 'simp_inp_sa', isStress: true }
    ];

    rawFormFields.forEach(f => {
        const el = document.getElementById(f.id);
        if (el && !isNaN(parseFloat(el.value))) {
            let val = parseFloat(el.value);
            if (f.isTemp) el.value = isSI ? ((val - 32) * 5 / 9).toFixed(1) : ((val * 9 / 5) + 32).toFixed(0);
            if (f.isStress) el.value = isSI ? (val / 145.038).toFixed(1) : (val * 145.038).toFixed(0);
            if (f.isLenLg) el.value = isSI ? (val / 3.28084).toFixed(3) : (val * 3.28084).toFixed(1);
        }
    });

    document.querySelectorAll('.s-inp-len, .r-inp-len').forEach(el => {
        let val = parseFloat(el.value) || 0;
        if (val > 0) el.value = isSI ? (val / 3.28084).toFixed(3) : (val * 3.28084).toFixed(1);
    });

    // Clear diagnostics stream on toggle to avoid mismatched state logs
    const dbOut = document.getElementById('debug_out');
    if (dbOut) dbOut.textContent = "UNIT SYSTEM TOGGLED. REBUILDING DEPENDENCIES...\n";

    calculateLoop();
    calculateSimplified();
    calculateRackLoad();
}

window.logDebug = function (title, dataObj) {
    const out = document.getElementById('debug_out');
    if (!out) return;
    const time = new Date().toLocaleTimeString();

    const buildTable = (obj) => {
        let html = '<table style="width:100%; border-collapse:collapse; margin-top:5px; font-family:var(--font-ui); font-size:13px; text-align:left;">';
        for (const key in obj) {
            const val = obj[key];
            if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
                html += `<tr style="border-bottom:1px solid var(--steel);"><td style="padding:6px; font-weight:600; color:var(--amber); vertical-align:top; width:30%;">${key.replace(/([A-Z])/g, ' $1').trim()}</td><td style="padding:6px; background:rgba(0,0,0,0.1);">${buildTable(val)}</td></tr>`;
            } else if (Array.isArray(val)) {
                let arrHtml = val.map((v, i) => `<div style="margin-bottom:6px; padding-bottom:6px; border-bottom:1px dashed var(--steel);"><b>[Row ${i + 1}]</b><br> ${(typeof v === 'object' && v !== null) ? buildTable(v) : v}</div>`).join('');
                html += `<tr style="border-bottom:1px solid var(--steel);"><td style="padding:6px; font-weight:600; color:var(--amber); vertical-align:top; width:30%;">${key.replace(/([A-Z])/g, ' $1').trim()}</td><td style="padding:6px; background:rgba(0,0,0,0.1);">${arrHtml}</td></tr>`;
            } else {
                html += `<tr style="border-bottom:1px solid var(--steel);"><td style="padding:6px; font-weight:600; color:var(--amber); width:30%;">${key.replace(/([A-Z])/g, ' $1').trim()}</td><td style="padding:6px; color:#fff;">${val}</td></tr>`;
            }
        }
        html += '</table>';
        return html;
    };

    const block = document.createElement('div');
    block.style.cssText = "background:var(--bg-1); border:1px solid var(--steel); border-left:3px solid var(--amber); padding:12px; border-radius:4px;";
    block.innerHTML = `<div style="color:#aaa; font-size:12px; margin-bottom:8px; display:flex; justify-content:space-between; border-bottom:1px solid var(--steel); padding-bottom:5px;"><span><strong>${title.toUpperCase()}</strong></span> <span>${time}</span></div>` + buildTable(dataObj);

    out.appendChild(block);

    const container = out.parentElement;
    if (container) container.scrollTop = container.scrollHeight;
};

function convertInp(val, type, isSI) {
    if (!isSI || isNaN(val)) return val;
    switch (type) {
        case 'temp': return (val * 9 / 5) + 32;
        case 'lenLg': return val * 3.28084;
        case 'lenSm': return val / 25.4;
        case 'stress': return val * 145.038;
        case 'dens': return val * 0.062428;
        case 'wind': return val * 0.204816;
    }
    return val;
}

function convertOut(val, type, isSI) {
    if (isNaN(val)) return val;
    // Modulus has special handling because DB stores it natively as Msi, but we display ksi/MPa
    if (type === 'mod') {
        return isSI ? val * 6894.757 : val * 1000;
    }

    if (!isSI) return val;

    switch (type) {
        case 'temp': return (val - 32) * 5 / 9;
        case 'lenLg': return val / 3.28084;
        case 'lenSm': return val * 25.4;
        case 'stress': return val / 145.038;
        case 'force': return val * 4.44822; // lbs -> N
        case 'moment': return val * 1.35582; // ft-lb -> N-m
        case 'weight': return val / 1.48816; // lb/ft -> kg/m
        case 'exp': return val * 0.833333; // in/100ft -> mm/m
        case 'mod': return val * 6894.757; // This block handles SI (already caught above, but kept formatting)
        case 'inertia': return val * 416231.42; // in4 -> mm4
    }
    return val;
}

/* ============================
   LOOP CALCULATIONS
============================ */
function calculateLoop() {
    const isSI = !!(document.getElementById('global_inp_units') && document.getElementById('global_inp_units').value === 'SI');

    const rawTemp = parseFloat(document.getElementById('loop_inp_temp').value);
    const tempF = convertInp(rawTemp, 'temp', isSI);
    const nps = document.getElementById('loop_inp_nps').value;
    const sch = document.getElementById('loop_inp_sch').value;
    const mat = document.getElementById('loop_inp_mat').value;

    const rawSA = parseFloat(document.getElementById('loop_inp_stress').value) || 27000;
    const SA = convertInp(rawSA, 'stress', isSI);

    const ec = interpolateValue(SPL2_DB.modulus, mat, tempF);
    document.getElementById('loop_out_ec').textContent = ec ? convertOut(ec, 'mod', isSI).toFixed(2) : 'NO DATA';

    const expMatKey = Object.keys(SPL2_DB.expansion.values).find(k => k.toLowerCase().includes(mat.substring(0, 10).toLowerCase())) || "Austenitic Stainless Steels 18Cr-8Ni";
    const exp_rate = interpolateValue(SPL2_DB.expansion, expMatKey, tempF); // in/100ft
    document.getElementById('loop_out_exp').textContent = exp_rate ? convertOut(exp_rate, 'exp', isSI).toFixed(3) : 'NO DATA';

    const d_mm = SPL2_DB.pipe_schedules[nps]?.od_in || 0;
    const d_in = d_mm / 25.4;
    document.getElementById('loop_out_d').textContent = convertOut(d_in, 'lenSm', isSI).toFixed(3);

    const t_mm = SPL2_DB.pipe_schedules[nps]?.schedules[sch] || 0;
    const t_in = t_mm / 25.4;
    document.getElementById('loop_out_t').textContent = convertOut(t_in, 'lenSm', isSI).toFixed(3);

    if (!ec || !exp_rate || !d_in || !t_in) return;

    const d_inner = d_in - (2 * t_in);
    const I = (Math.PI / 64) * (Math.pow(d_in, 4) - Math.pow(d_inner, 4));
    document.getElementById('loop_out_i').textContent = convertOut(I, 'inertia', isSI).toFixed(2);

    const r_in = d_in * 1.5; // Bend radius 1.5D
    const rawS = parseFloat(document.getElementById('loop_inp_s').value) || 0;
    const rawG = parseFloat(document.getElementById('loop_inp_g').value) || 0;
    const rawH = parseFloat(document.getElementById('loop_inp_h').value) || 0;
    const rawW = parseFloat(document.getElementById('loop_inp_w').value) || 0;

    const S = convertInp(rawS, 'lenLg', isSI);
    const G = convertInp(rawG, 'lenLg', isSI);
    const H = convertInp(rawH, 'lenLg', isSI);
    const W = convertInp(rawW, 'lenLg', isSI);

    // Update canvas if exists
    if (window.loopCanvas) window.loopCanvas.updateDims(S, G, H, W, { nps, sch, tempF, mat });

    // Exact Excel Logic Integration
    const E_msi = ec || 29.0;
    const e_100ft = exp_rate || 0;
    const res = calcLoopFromSpreadsheet(S, G, H, W, d_in, t_in, E_msi, e_100ft, SA);

    document.getElementById('loop_out_beta').textContent = res.beta.toFixed(2);
    document.getElementById('loop_out_l').textContent = convertOut(res.L_total, 'lenLg', isSI).toFixed(2);
    document.getElementById('loop_out_ds').textContent = convertOut(res.delta_Lx, 'lenSm', isSI).toFixed(2);

    document.getElementById('loop_out_fx').textContent = convertOut(res.Fx, 'force', isSI).toLocaleString(undefined, { maximumFractionDigits: 0 });
    document.getElementById('loop_out_fhot').textContent = convertOut(res.Fhot, 'force', isSI).toLocaleString(undefined, { maximumFractionDigits: 0 });
    document.getElementById('loop_out_fz').textContent = convertOut(res.Fz, 'force', isSI).toLocaleString(undefined, { maximumFractionDigits: 0 });

    document.getElementById('loop_out_stress_a').textContent = convertOut(res.Sa, 'stress', isSI).toLocaleString(undefined, { maximumFractionDigits: 0 });
    document.getElementById('loop_out_stress_b').textContent = convertOut(res.Sb, 'stress', isSI).toLocaleString(undefined, { maximumFractionDigits: 0 });

    const statusEl = document.getElementById('loop_out_status');
    if (res.status === "PASS") {
        statusEl.textContent = 'PASS';
        statusEl.style.color = 'var(--green-ok)';
    } else {
        statusEl.textContent = 'FAIL';
        statusEl.style.color = 'var(--red-error)';
    }
}


/* ============================
   PIPE RACK LOAD
============================ */
let rackRowCount = 0;

function addRackRow() {
    rackRowCount++;
    const tbody = document.getElementById('body-rack-matrix');
    const tr = document.createElement('tr');
    tr.id = `rack_row_${rackRowCount}`;

    // Options for drops
    const npsOpts = Object.keys(SPL2_DB.pipe_schedules)
        .sort((a, b) => (parseFloat(a.replace(/[^0-9.]/g, '')) || 0) - (parseFloat(b.replace(/[^0-9.]/g, '')) || 0))
        .map(n => `<option value="${n}" ${n === '10' ? 'selected' : ''}>${n}</option>`).join('');

    const matOpts = Object.keys(SPL2_DB.modulus.values)
        .map(m => `<option value="${m}" ${m.includes('Carbon steels, C') ? 'selected' : ''}>${m.substring(0, 25)}</option>`).join('');

    tr.innerHTML = `
        <td class="sticky-col" style="text-align:center; font-weight:bold;">${rackRowCount}</td>
        <td><input type="number" class="r-inp-temp" value="220" style="width:60px"></td>
        <td><select class="r-inp-mat" style="max-width:120px">${matOpts}</select></td>
        <td><select class="r-inp-nps">${npsOpts}</select></td>
        <td><select class="r-inp-sch"></select></td>
        
        <!-- Extracted/Calculated Props -->
        <td class="r-out-allow bg2 val">-</td>
        <td class="r-out-od bg2 val">-</td>
        <td class="r-out-thk bg2 val">-</td>
        
        <!-- Wt Inputs -->
        <td><input type="number" step="0.01" class="r-inp-sg" value="1.0" style="width:50px"></td>
        <td><input type="number" step="0.5" class="r-inp-insul" value="0.0" style="width:50px"></td>
        
        <!-- Sub Weights -->
        <td class="r-out-pipewt bg2 val">-</td>
        <td class="r-out-contwt bg2 val">-</td>
        <td class="r-out-inswt bg2 val">-</td>
        <td class="r-out-hydrowt bg2 val">-</td>

        <!-- Span & Coordinates -->
        <td><input type="number" class="r-inp-start" value="0" style="width:50px"></td>
        <td><input type="number" class="r-inp-end" value="100" style="width:50px"></td>
        <td><input type="number" class="r-inp-spacing" value="20" style="width:50px"></td>
        
        <!-- Span Loads -> Moved to Output Table -->
        <td class="r-out-bents bg2 val">-</td>
        
        <!-- Thermal & Loop Data -->
        <td class="r-out-exp bg2 val">-</td>
        <td><input type="number" class="r-inp-width" value="10" style="width:50px"></td>
        <td><input type="number" class="r-inp-depth" value="15" style="width:50px"></td>
        <td><input type="number" class="r-inp-guide" value="40" style="width:50px"></td>

        <td><button class="btn-del-row" style="background:var(--red-error); color:#fff; border:none; cursor:pointer;">X</button></td>
    `;
    tbody.appendChild(tr);

    // Create synchronized output row
    const tbodyOut = document.getElementById('body-rack-output');
    const trOut = document.createElement('tr');
    trOut.id = `rack_row_out_${rackRowCount}`;
    trOut.innerHTML = `
        <td class="sticky-col" style="text-align:center; font-weight:bold;">${rackRowCount}</td>
        <td class="r-out-deadbent bg2 val">-</td>
        <td class="r-out-opbent bg2 val">-</td>
        <td class="r-out-hydrobent bg2 val">-</td>
        <td class="r-out-fricbent bg2 val">-</td>
        <td class="r-out-fricanch bg2 val">-</td>
        <td class="r-out-windbent bg2 val">-</td>
        <td class="r-out-displt bg2 val">-</td>
        <td class="r-out-force bg2 val" style="color:var(--amber)">-</td>
        <td class="r-out-stress bg2 val" style="color:var(--amber)">-</td>
        <td class="r-out-freq bg2 val">-</td>
        <td class="r-out-status bg2" style="font-weight:bold;text-align:center;">-</td>
    `;
    if (tbodyOut) tbodyOut.appendChild(trOut);

    // Bind Sch dropdown dynamics
    const selNps = tr.querySelector('.r-inp-nps');
    const selSch = tr.querySelector('.r-inp-sch');
    selNps.addEventListener('change', () => {
        const selected = selNps.value;
        const schDict = SPL2_DB.pipe_schedules[selected]?.schedules || {};
        selSch.innerHTML = '';
        Object.keys(schDict).forEach(sch => {
            selSch.innerHTML += `<option value="${sch}">${sch}</option>`;
        });

        // Default to STD if available
        if (Array.from(selSch.options).some(o => o.value === 'STD')) {
            selSch.value = 'STD';
        }
    });
    selNps.dispatchEvent(new Event('change'));

    // Bind delete row
    tr.querySelector('.btn-del-row').addEventListener('click', () => {
        tr.remove();
        if (trOut) trOut.remove();
        calculateRackLoad(); // Recalc if removing
    });
}

document.addEventListener('DOMContentLoaded', () => {
    const btnZIn = document.getElementById('rack-zoom-in');
    const btnZOut = document.getElementById('rack-zoom-out');
    const btnFIn = document.getElementById('rack-font-in');
    const btnFOut = document.getElementById('rack-font-out');

    if (btnZIn) btnZIn.addEventListener('click', () => { if (window.rackPlanCanvas) { window.rackPlanCanvas.transform.scale *= 1.1; window.rackPlanCanvas.render(); } });
    if (btnZOut) btnZOut.addEventListener('click', () => { if (window.rackPlanCanvas) { window.rackPlanCanvas.transform.scale /= 1.1; window.rackPlanCanvas.render(); } });
    if (btnFIn) btnFIn.addEventListener('click', () => { if (window.rackPlanCanvas) { window.rackPlanCanvas.fontScale = (window.rackPlanCanvas.fontScale || 1) * 1.1; window.rackPlanCanvas.render(); } });
    if (btnFOut) btnFOut.addEventListener('click', () => { if (window.rackPlanCanvas) { window.rackPlanCanvas.fontScale = (window.rackPlanCanvas.fontScale || 1) / 1.1; window.rackPlanCanvas.render(); } });

    const btnAdd = document.getElementById('rack_btn_add_row');
    if (btnAdd) btnAdd.addEventListener('click', addRackRow);

    // Add default row
    if (document.getElementById('body-rack-matrix')) {
        addRackRow();
    }

    // Bind real-time matrix updates
    const rackMatrix = document.getElementById('body-rack-matrix');
    if (rackMatrix) {
        rackMatrix.addEventListener('change', calculateRackLoad);
        rackMatrix.addEventListener('input', calculateRackLoad);
    }
});

function calculateRackLoad() {
    const rows = document.querySelectorAll('#body-rack-matrix tr');
    const outRows = document.querySelectorAll('#body-rack-output tr');
    const pipesArray = [];

    let maxStress = 0;
    let minFreq = Infinity;
    let hasFailures = false;

    rows.forEach((row, i) => {
        const outRow = outRows[i]; // Linked synchronous output row

        const isSI = !!(document.getElementById('global_inp_units') && document.getElementById('global_inp_units').value === 'SI');

        const rawTemp = parseFloat(row.querySelector('.r-inp-temp').value) || 70;
        const tempF = convertInp(rawTemp, 'temp', isSI);

        const mat = row.querySelector('.r-inp-mat').value;
        const nps = row.querySelector('.r-inp-nps').value;
        const sch = row.querySelector('.r-inp-sch').value;
        const sg = parseFloat(row.querySelector('.r-inp-sg').value) || 1.0;
        const insulThick = convertInp(parseFloat(row.querySelector('.r-inp-insul').value) || 0, 'lenSm', isSI);

        const startAnch = convertInp(parseFloat(row.querySelector('.r-inp-start').value) || 0, 'lenLg', isSI);
        const endAnch = convertInp(parseFloat(row.querySelector('.r-inp-end').value) || 100, 'lenLg', isSI);
        const spacing = convertInp(parseFloat(row.querySelector('.r-inp-spacing').value) || 20, 'lenLg', isSI);

        const guideDist = convertInp(parseFloat(row.querySelector('.r-inp-guide').value) || 40, 'lenLg', isSI);
        const loopWidth = convertInp(parseFloat(row.querySelector('.r-inp-width').value) || 10, 'lenLg', isSI);
        const loopDepth = convertInp(parseFloat(row.querySelector('.r-inp-depth').value) || 15, 'lenLg', isSI);

        // DB Fetch
        const ec = interpolateValue(SPL2_DB.modulus, mat, tempF);
        const expMatKey = Object.keys(SPL2_DB.expansion.values).find(k => k.toLowerCase().includes(mat.substring(0, 10).toLowerCase())) || "Austenitic Stainless Steels 18Cr-8Ni";
        const exp_rate = interpolateValue(SPL2_DB.expansion, expMatKey, tempF) || 0; // in/100ft
        const allowStress = 20000; // Baseline allowable placeholder

        row.querySelector('.r-out-allow').textContent = convertOut(allowStress, 'stress', isSI).toLocaleString();
        row.querySelector('.r-out-exp').textContent = convertOut(exp_rate, 'exp', isSI).toFixed(3);

        const d_mm = SPL2_DB.pipe_schedules[nps]?.od_in || 0;
        const d_in = d_mm / 25.4;
        const t_mm = SPL2_DB.pipe_schedules[nps]?.schedules[sch] || 0;
        const t_in = t_mm / 25.4;

        if (d_in === 0 || t_in === 0) return;

        row.querySelector('.r-out-od').textContent = convertOut(d_in, 'lenSm', isSI).toFixed(3);
        row.querySelector('.r-out-thk').textContent = convertOut(t_in, 'lenSm', isSI).toFixed(3);

        // Weights
        const r_out = d_in / 2;
        const r_in = r_out - t_in;
        const areaSqIn = Math.PI * (Math.pow(r_out, 2) - Math.pow(r_in, 2));

        const w_pipe = (areaSqIn / 144) * 490.0; // steel density lbs/ft3
        const w_cont = (Math.PI * Math.pow(r_in, 2) / 144) * 62.4 * sg;
        const w_insul = (Math.PI * (Math.pow(r_out + insulThick, 2) - Math.pow(r_out, 2)) / 144) * 12; // insul density 12
        const w_hydro = (Math.PI * Math.pow(r_in, 2) / 144) * 62.4 * 1.0; // Water SG=1

        row.querySelector('.r-out-pipewt').textContent = convertOut(w_pipe, 'weight', isSI).toFixed(1);
        row.querySelector('.r-out-contwt').textContent = convertOut(w_cont, 'weight', isSI).toFixed(1);
        row.querySelector('.r-out-inswt').textContent = convertOut(w_insul, 'weight', isSI).toFixed(1);
        row.querySelector('.r-out-hydrowt').textContent = convertOut(w_hydro, 'weight', isSI).toFixed(1);

        const W_dead = w_pipe + w_insul;
        const W_op = W_dead + w_cont;
        const W_test = W_dead + w_hydro;

        // Bents & Span Analysis
        const noBents = spacing > 0 ? Math.max(1, Math.ceil(Math.abs(endAnch - startAnch) / spacing)) : 1;
        row.querySelector('.r-out-bents').textContent = noBents;

        // Loads at bents (write to outRow)
        const deadBent = W_dead * spacing;
        const opBent = W_op * spacing;
        const hydroBent = W_test * spacing;

        // Fetch global configs
        const configFric = parseFloat(document.getElementById('global_inp_fric')?.value) || 0.3;
        const configWind = convertInp(parseFloat(document.getElementById('global_inp_wind')?.value) || 30, 'wind', isSI);

        const fricBent = opBent * configFric; // Dynamic friction
        const fricAnch = fricBent * noBents;
        const windBent = (d_in / 12) * spacing * configWind; // Dynamic wind

        outRow.querySelector('.r-out-deadbent').textContent = convertOut(deadBent, 'force', isSI).toFixed(0);
        outRow.querySelector('.r-out-opbent').textContent = convertOut(opBent, 'force', isSI).toFixed(0);
        outRow.querySelector('.r-out-hydrobent').textContent = convertOut(hydroBent, 'force', isSI).toFixed(0);
        outRow.querySelector('.r-out-fricbent').textContent = convertOut(fricBent, 'force', isSI).toFixed(0);
        outRow.querySelector('.r-out-fricanch').textContent = convertOut(fricAnch, 'force', isSI).toFixed(0);
        outRow.querySelector('.r-out-windbent').textContent = convertOut(windBent, 'force', isSI).toFixed(0);

        // Loop Dynamics
        const thermalDisplt = (Math.abs(endAnch - startAnch) / 100) * exp_rate;
        outRow.querySelector('.r-out-displt').textContent = convertOut(thermalDisplt, 'lenSm', isSI).toFixed(3);

        const I_in4 = (Math.PI / 64) * (Math.pow(d_in, 4) - Math.pow(d_in - 2 * t_in, 4));
        const E_psi = (ec || 29) * 1e6;

        // Use Loop Algo to evaluate the forces based on user Loop Width, Depth, and Guide Dist
        let loopForce = 0;
        let stress = 0;

        if (typeof calcLoopFromSpreadsheet === 'function') {
            const actualGuideDist = guideDist > 0 ? guideDist : (Math.abs(endAnch - startAnch) / 2);
            // S (span between guides) = Actual guide dist * 2
            const S_full = actualGuideDist * 2;
            const res = calcLoopFromSpreadsheet(S_full, actualGuideDist, loopDepth, loopWidth, d_in, t_in, E_psi / 1e6, exp_rate, allowStress);

            // Re-factor structural force utilizing standard loop methodology (Fx = structural force anchor)
            loopForce = res.Fx;
            stress = res.Sa > res.Sb ? res.Sa : res.Sb; // Max stress at elbows
        } else {
            // Simplified fallback guided loop force
            const L_loop_in = guideDist * 12;
            loopForce = L_loop_in > 0 ? (12 * E_psi * I_in4 * thermalDisplt) / Math.pow(L_loop_in, 3) : 0;
            const Z = I_in4 / r_out;
            const M_in_lbs = (W_op * spacing * spacing * 12) / 8; // wL^2/8
            stress = Z > 0 ? (M_in_lbs / Z) : 0;
        }

        outRow.querySelector('.r-out-force').textContent = convertOut(loopForce, 'force', isSI).toFixed(0);

        // Span Frequency
        const w_in = W_op / 12; // lbs/in
        const L_in = spacing * 12;
        const g = 386.4; // in/sec^2
        const configFreqC = parseFloat(document.getElementById('global_inp_freq_c')?.value) || 2.45;
        // Adjust formula with C if req, assuming classical is scaled by C
        const freq = L_in > 0 ? (configFreqC * Math.PI / 2) * Math.sqrt((E_psi * I_in4 * g) / (w_in * Math.pow(L_in, 4))) : 0;
        outRow.querySelector('.r-out-freq').textContent = freq > 0 ? freq.toFixed(2) : '-';

        outRow.querySelector('.r-out-stress').textContent = convertOut(stress, 'stress', isSI).toLocaleString(undefined, { maximumFractionDigits: 0 });

        const statusEl = outRow.querySelector('.r-out-status');
        if (freq >= 4.0 && stress < allowStress) {
            statusEl.textContent = 'PASS';
            statusEl.style.color = 'var(--green-ok)';
        } else {
            statusEl.textContent = 'FAIL';
            statusEl.style.color = 'var(--red-error)';
            hasFailures = true;
        }

        if (stress > maxStress) maxStress = stress;
        if (freq > 0 && freq < minFreq) minFreq = freq;

        pipesArray.push({
            nps: nps,
            lineNo: i + 1,
            od_in: d_in,
            insul_in: insulThick,
            spacing_ft: spacing,
            loopWidth: loopWidth,
            loopDepth: loopDepth,
            guideDist: guideDist,
            startAnch: startAnch,
            endAnch: endAnch,
            w_op: W_op,
            spanFreq: freq
        });
    });

    // Global Output Population is removed for Pipe Rack.

    const globalStatusSpan = document.getElementById('rack_out_status');
    if (rows.length === 0) {
        globalStatusSpan.textContent = '-';
        globalStatusSpan.style.color = '';
    } else if (hasFailures) {
        globalStatusSpan.textContent = 'FAIL';
        globalStatusSpan.style.color = 'var(--red-error)';
    } else {
        globalStatusSpan.textContent = 'PASS';
        globalStatusSpan.style.color = 'var(--green-ok)';
    }

    // Instantly update canvas
    if (window.rackSectionCanvas) window.rackSectionCanvas.updatePipes(pipesArray);
    if (window.rackPlanCanvas) window.rackPlanCanvas.updatePipes(pipesArray);

    window.logDebug('Pipe Rack Analysis', {
        MetricToggle: document.getElementById('global_inp_units').value,
        ActiveRows: pipesArray.length,
        MaxAnchorsSpanned: pipesArray.length > 0 ? pipesArray[0].endAnch - pipesArray[0].startAnch : 0,
        Formulas: {
            "Oper_Weight": "W_op = W_pipe + W_insul + W_hydro",
            "Friction_F": "Ff = W_op × Spacing × μ_friction",
            "NatFreq_fn": `f_n = (C × π / 2) × √[ (E × I × g) / (w × L⁴) ]`
        },
        PipeRoutes: pipesArray.map(p => ({ nps: p.nps, d_in: p.od_in.toFixed(2), w_op: p.w_op.toFixed(1), spanfreq: p.spanFreq.toFixed(2) }))
    });
}


/* ============================
   SIMPLIFIED METHOD
============================ */
let simpRowCount = 0;

function addSimpRow() {
    simpRowCount++;
    const tbody = document.getElementById('body-simp-matrix');
    const tr = document.createElement('tr');
    tr.id = `simp_row_${simpRowCount}`;

    tr.innerHTML = `
        <td class="sticky-col" style="text-align:center; font-weight:bold;">S${simpRowCount}</td>
        <td>
            <select class="s-inp-axis">
                <option value="X">+X (Right)</option>
                <option value="-X">-X (Left)</option>
                <option value="Y">+Y (Up)</option>
                <option value="-Y">-Y (Down)</option>
                <option value="Z">+Z (Forward)</option>
                <option value="-Z">-Z (Back)</option>
            </select>
        </td>
        <td><input type="number" class="s-inp-len" value="${simpRowCount === 1 ? 10 : 5}" style="width:70px"></td>
        <td><input type="number" class="s-out-exp" readonly style="width:80px; background:var(--bg-0); color:var(--amber)" value="0.0"></td>
        <td class="s-out-moment val">-</td>
        <td class="s-out-stress val">-</td>
        <td class="s-out-status">-</td>
        <td><button class="btn-del-row" style="background:var(--red-error); color:#fff; border:none; cursor:pointer;">X</button></td>
    `;
    tbody.appendChild(tr);

    tr.querySelector('.btn-del-row').addEventListener('click', () => {
        tr.remove();
        calculateSimplified();
    });
}

document.addEventListener('DOMContentLoaded', () => {
    const btnAddSimp = document.getElementById('simp_btn_add_seg');
    if (btnAddSimp) btnAddSimp.addEventListener('click', () => {
        addSimpRow();
        calculateSimplified();
    });

    // Default system
    if (document.getElementById('body-simp-matrix')) {
        addSimpRow(); // X
        addSimpRow(); // Y
        addSimpRow(); // Z
        document.querySelector('#simp_row_1 .s-inp-axis').value = 'X';
        document.querySelector('#simp_row_2 .s-inp-axis').value = 'Y';
        document.querySelector('#simp_row_3 .s-inp-axis').value = 'Z';
        document.querySelector('#simp_row_1 .s-inp-len').value = '10';
        document.querySelector('#simp_row_2 .s-inp-len').value = '20';
        document.querySelector('#simp_row_3 .s-inp-len').value = '5';

        // Trigger initial calculations to populate canvases on load
        calculateLoop();
        calculateSimplified();
        calculateRackLoad();
    }
});

function calculateSimplified() {
    const isSI = !!(document.getElementById('global_inp_units') && document.getElementById('global_inp_units').value === 'SI');

    const rawTemp = parseFloat(document.getElementById('simp_inp_temp').value);
    const tempF = convertInp(rawTemp, 'temp', isSI);
    const nps = document.getElementById('simp_inp_nps').value;
    const sch = document.getElementById('simp_inp_sch').value;
    const mat = document.getElementById('simp_inp_mat').value;

    const rawSA = parseFloat(document.getElementById('simp_inp_sa').value);
    const sa = convertInp(rawSA, 'stress', isSI);

    const d_mm = SPL2_DB.pipe_schedules[nps]?.od_in || 0;
    const d_in = d_mm / 25.4;
    const t_mm = SPL2_DB.pipe_schedules[nps]?.schedules[sch] || 0;
    const t_in = t_mm / 25.4;

    const elD = document.getElementById('simp_out_d'); if (elD) elD.textContent = convertOut(d_in, 'lenSm', isSI).toFixed(3);
    const elT = document.getElementById('simp_out_t'); if (elT) elT.textContent = convertOut(t_in, 'lenSm', isSI).toFixed(3);

    const ec = interpolateValue(SPL2_DB.modulus, mat, tempF);
    const modUnit = isSI ? 'MPa' : 'ksi';
    const elEc = document.getElementById('simp_out_ec'); if (elEc) elEc.textContent = ec ? convertOut(ec, 'mod', isSI).toFixed(2) + ' ' + modUnit : 'NO DATA';

    const expMatKey = Object.keys(SPL2_DB.expansion.values).find(k => k.toLowerCase().includes(mat.substring(0, 10).toLowerCase())) || "Austenitic Stainless Steels 18Cr-8Ni";
    const exp_100 = interpolateValue(SPL2_DB.expansion, expMatKey, tempF);
    const expUnit = isSI ? 'mm/m' : 'in/100ft';
    const elExp = document.getElementById('simp_out_exp'); if (elExp) elExp.textContent = exp_100 ? convertOut(exp_100, 'exp', isSI).toFixed(3) + ' ' + expUnit : 'NO DATA';

    if (!exp_100 || !ec || d_in === 0) return;

    const d_inner = d_in - (2 * t_in);
    const I_in4 = (Math.PI / 64) * (Math.pow(d_in, 4) - Math.pow(d_inner, 4));
    const elI = document.getElementById('simp_out_i'); if (elI) elI.textContent = convertOut(I_in4, 'inertia', isSI).toFixed(2);

    const alpha_in_ft = exp_100 / 100;
    const Z_in3 = I_in4 / (d_in / 2);

    // Accumulate Routing
    const rows = document.querySelectorAll('#body-simp-matrix tr');
    let totalLx = 0, totalLy = 0, totalLz = 0;
    let canvasSegments = [];
    let legSteps = [];  // <<< Capture per-leg intermediate data for diagnostics

    rows.forEach((row, rowIdx) => {
        const axisRaw = row.querySelector('.s-inp-axis').value;
        const rawLen = parseFloat(row.querySelector('.s-inp-len').value) || 0;
        const len = convertInp(rawLen, 'lenLg', isSI);

        let dx = 0, dy = 0, dz = 0;
        if (axisRaw.includes('X')) { dx = len * alpha_in_ft; totalLx += len; }
        if (axisRaw.includes('Y')) { dy = len * alpha_in_ft; totalLy += len; }
        if (axisRaw.includes('Z')) { dz = len * alpha_in_ft; totalLz += len; }

        const expContrib = dx + dy + dz;
        row.querySelector('.s-out-exp').value = convertOut(expContrib, 'lenSm', isSI).toFixed(3);

        canvasSegments.push({
            axis: axisRaw.replace('-', ''),
            len: axisRaw.includes('-') ? -len : len
        });

        // Capture per-leg data for diagnostics
        legSteps.push({ axis: axisRaw, L: len, alpha: alpha_in_ft, expContrib: expContrib.toFixed(4) });
    });

    const DX = totalLx * alpha_in_ft;
    const DY = totalLy * alpha_in_ft;
    const DZ = totalLz * alpha_in_ft;

    // We pass internal native Imperial values to the canvas renderer, it applies display conversions itself
    if (window.simpCanvas) window.simpCanvas.updateRouting(canvasSegments, DX, DY, DZ, isSI);

    document.getElementById('simp_out_dx').textContent = convertOut(DX, 'lenSm', isSI).toFixed(3);
    document.getElementById('simp_out_dy').textContent = convertOut(DY, 'lenSm', isSI).toFixed(3);
    document.getElementById('simp_out_dz').textContent = convertOut(DZ, 'lenSm', isSI).toFixed(3);

    const L_total = totalLx + totalLy + totalLz;
    if (L_total <= 0) return;

    const d_total = Math.sqrt(DX * DX + DY * DY + DZ * DZ);

    // ASME B31.3 Simplified Flex Check Formula:
    // (DY) / (L^2 * U) <= 0.03
    // Here we use U as an intermediate solver
    const flex_U = L_total / d_total;
    const sysFactor = (0.016 * d_in * (d_total)) / Math.pow(L_total, 2);

    document.getElementById('simp_out_u').textContent = flex_U.toFixed(1);

    const ec_psi = ec * 1e6;

    // Global max approximations
    const MAX_STRESS = (ec_psi * sysFactor);
    const MAX_MOMENT_inlbs = MAX_STRESS * Z_in3;
    const MAX_MOMENT_ftlbs = MAX_MOMENT_inlbs / 12;
    // Approximating Force F = M / L_avg
    const MAX_FORCE_lbs = MAX_MOMENT_inlbs / ((L_total / Math.max(rows.length, 1)) * 12);

    const stressUnit = isSI ? 'MPa' : 'psi';
    const forceUnit = isSI ? 'N' : 'lbs';
    document.getElementById('simp_out_max_se').textContent = convertOut(MAX_STRESS, 'stress', isSI).toLocaleString(undefined, { maximumFractionDigits: 0 }) + ' ' + stressUnit;
    document.getElementById('simp_out_max_fr').textContent = convertOut(MAX_FORCE_lbs, 'force', isSI).toLocaleString(undefined, { maximumFractionDigits: 0 }) + ' ' + forceUnit;

    let hasFail = false;

    // Distribute proportional estimates back to rows
    rows.forEach(row => {
        const rawLen = parseFloat(row.querySelector('.s-inp-len').value) || 0;
        const len = convertInp(rawLen, 'lenLg', isSI);

        // The shorter the member relative to the net expansion, the higher the absorbed bending stress (simplified matrix logic)
        let ratio = 1.0;
        if (len > 0) {
            ratio = (L_total / rows.length) / len;
        }

        const rowStress = Math.min(MAX_STRESS * ratio, MAX_STRESS * 1.5); // cap at 1.5x max
        const rowMoment = rowStress * Z_in3 / 12;

        // Update per-leg step with final row calculations
        if (legSteps[Array.from(rows).indexOf(row)] !== undefined) {
            const li = Array.from(rows).indexOf(row);
            legSteps[li].ratio = ratio.toFixed(3);
            legSteps[li].rowStress = convertOut(rowStress, 'stress', isSI).toFixed(1);
            legSteps[li].rowMoment = convertOut(rowMoment, 'moment', isSI).toFixed(1);
            legSteps[li].status = rowStress <= sa ? 'PASS' : 'FAIL';
            legSteps[li].formula = `σ_leg = min(σ_max × r, 1.5σ_max) = min(${(MAX_STRESS).toFixed(1)} × ${ratio.toFixed(3)}, ${(MAX_STRESS * 1.5).toFixed(1)}) = ${rowStress.toFixed(1)} psi → M = σ × Z / 12 = ${rowMoment.toFixed(1)} ft-lb`;
        }

        row.querySelector('.s-out-moment').textContent = convertOut(rowMoment, 'moment', isSI).toLocaleString(undefined, { maximumFractionDigits: 0 });
        row.querySelector('.s-out-stress').textContent = convertOut(rowStress, 'stress', isSI).toLocaleString(undefined, { maximumFractionDigits: 0 });

        const statusEl = row.querySelector('.s-out-status');
        if (rowStress <= sa) {
            statusEl.textContent = 'PASS';
            statusEl.style.color = 'var(--green-ok)';
        } else {
            statusEl.textContent = 'FAIL';
            statusEl.style.color = 'var(--red-error)';
            hasFail = true;
        }
    });

    const globStatusEl = document.getElementById('simp_out_status');
    if (!hasFail && sysFactor <= 0.03 && MAX_STRESS <= sa) {
        globStatusEl.textContent = 'SYSTEM PASS - FLEXIBLE';
        globStatusEl.style.color = 'var(--green-ok)';
    } else {
        globStatusEl.textContent = 'SYSTEM FAIL - EXCEEDS LIMITS';
        globStatusEl.style.color = 'var(--red-error)';
    }

    window.logDebug('Simplified 3D Routing', {
        '1. System Pipe Data': {
            NPS: `${nps}"  OD = ${d_in.toFixed(3)} in   t = ${t_in.toFixed(3)} in`,
            Inertia_I: `I = (π / 64) × (${d_in.toFixed(3)}⁴ - ${d_inner.toFixed(3)}⁴) = ${I_in4.toFixed(3)} in⁴`,
            SectionMod_Z: `Z = I / (OD/2) = ${I_in4.toFixed(3)} / ${(d_in / 2).toFixed(3)} = ${Z_in3.toFixed(3)} in³`,
            Modulus_E: `E = ${ec.toFixed(2)} Msi = ${ec_psi.toLocaleString()} psi`,
            Expansion_α: `α = ${alpha_in_ft.toFixed(5)} in/ft  (from DB at T=${tempF.toFixed(1)}°F)`
        },
        '2. Thermal Expansion per Leg': legSteps.map((s, i) => ({
            Leg: `S${i + 1} [Axis: ${s.axis}]`,
            Length: `L = ${parseFloat(s.L).toFixed(2)} ft`,
            Equation: `Δ_leg = L × α = ${parseFloat(s.L).toFixed(2)} × ${s.alpha.toFixed(5)} = ${s.expContrib} in`
        })),
        '3. System Vectors (Total)': {
            ΔX: `Δx = Σ L_x × α = ${totalLx.toFixed(1)} × ${alpha_in_ft.toFixed(5)} = ${DX.toFixed(4)} in`,
            ΔY: `Δy = Σ L_y × α = ${totalLy.toFixed(1)} × ${alpha_in_ft.toFixed(5)} = ${DY.toFixed(4)} in`,
            ΔZ: `Δz = Σ L_z × α = ${totalLz.toFixed(1)} × ${alpha_in_ft.toFixed(5)} = ${DZ.toFixed(4)} in`,
            Δ_total: `Δ = √(Δx² + Δy² + Δz²) = √(${DX.toFixed(4)}² + ${DY.toFixed(4)}² + ${DZ.toFixed(4)}²) = ${d_total.toFixed(4)} in`
        },
        '4. Flexibility Check (ASME B31.3)': {
            L_total: `L = Σ L_i = ${totalLx.toFixed(1)} + ${totalLy.toFixed(1)} + ${totalLz.toFixed(1)} = ${L_total.toFixed(2)} ft`,
            Flex_U: `U = L / Δ = ${L_total.toFixed(2)} / ${d_total.toFixed(4)} = ${flex_U.toFixed(3)}`,
            SysFlexFactor: `Cf = 0.016 × D × Δ / L² = 0.016 × ${d_in.toFixed(3)} × ${d_total.toFixed(4)} / ${L_total.toFixed(2)}² = ${sysFactor.toFixed(5)}  [Limit ≤ 0.03]`,
            PASS: sysFactor <= 0.03 ? '✅ PASS — system is flexible' : '❌ FAIL — check routing'
        },
        '5. System Stress & Force': {
            MAX_STRESS: `σ_max = E × Cf = ${ec_psi.toLocaleString()} × ${sysFactor.toFixed(5)} = ${MAX_STRESS.toFixed(1)} psi`,
            MAX_MOMENT: `M_max = σ_max × Z = ${MAX_STRESS.toFixed(1)} × ${Z_in3.toFixed(3)} = ${MAX_MOMENT_inlbs.toFixed(1)} in-lb = ${MAX_MOMENT_ftlbs.toFixed(1)} ft-lb`,
            MAX_FORCE: `F_max = M / L_avg = ${MAX_MOMENT_inlbs.toFixed(1)} / (${L_total.toFixed(2)} / ${rows.length} × 12) = ${MAX_FORCE_lbs.toFixed(1)} lbs`
        },
        '6. Per-Leg Stress Check': legSteps.map((s, i) => ({
            Leg: `S${i + 1} [${s.axis}]`,
            Ratio: `r = L_avg / L_leg = ${s.ratio}`,
            Stress: `σ_leg = σ_max × r = ${s.rowStress} ${isSI ? 'MPa' : 'psi'}`,
            Moment: `M_leg = σ_leg × Z / 12 = ${s.rowMoment} ${isSI ? 'N-m' : 'ft-lb'}`,
            Status: s.status || '-'
        })),
        PassState: !hasFail
    });
}


/* ============================
   DATABASE PREVIEW RENDER
============================ */
let dbRendered = false;
function renderDatabaseFrames() {
    if (dbRendered) return;

    // --- 1. Pipe Schedules ---
    // Collect all unique schedules across all NPS sizes to create the table columns
    const allSchedulesSet = new Set();
    Object.values(SPL2_DB.pipe_schedules).forEach(data => {
        if (data.schedules) {
            Object.keys(data.schedules).forEach(sch => {
                if (sch !== 'nan' && sch.trim() !== '') allSchedulesSet.add(sch);
            });
        }
    });

    // Sort schedules intelligently (numeric first, letters later)
    const allSchedules = Array.from(allSchedulesSet).sort((a, b) => {
        const numA = parseFloat(a.replace(/[^0-9.]/g, ''));
        const numB = parseFloat(b.replace(/[^0-9.]/g, ''));
        if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
        if (!isNaN(numA)) return -1;
        if (!isNaN(numB)) return 1;
        return a.localeCompare(b);
    });

    const schHead = document.getElementById('head-sch');
    const schBody = document.querySelector('#table-sch tbody');

    // Build Headers
    let schHeaderHtml = '<tr><th class="sticky-col">NPS</th><th>OD (in)</th>';
    allSchedules.forEach(sch => { schHeaderHtml += `<th>${sch}</th>`; });
    schHeaderHtml += '</tr>';
    schHead.innerHTML = schHeaderHtml;

    // Build Rows
    Object.keys(SPL2_DB.pipe_schedules).forEach(nps => {
        const data = SPL2_DB.pipe_schedules[nps];
        let rowHtml = `<tr><td class="sticky-col fw-bold">${nps}</td><td>${data.od_in || '-'}</td>`;
        allSchedules.forEach(sch => {
            const val = data.schedules[sch];
            rowHtml += `<td>${val !== undefined && val !== null ? val : ''}</td>`;
        });
        rowHtml += '</tr>';
        schBody.innerHTML += rowHtml;
    });

    // --- 2. Expansion (C-1) ---
    const hExp = document.getElementById('head-exp');
    const tbExp = document.getElementById('body-exp');
    const expMats = Object.keys(SPL2_DB.expansion.values);
    let hr = '<tr><th class="sticky-col">Temp (°F)</th>' + expMats.map(m => `<th>${m}</th>`).join('') + '</tr>';
    hExp.innerHTML = hr;

    SPL2_DB.expansion.temperatures.forEach((temp, idx) => {
        let tr = `<tr><td class="sticky-col fw-bold">${temp}</td>`;
        expMats.forEach(mat => {
            const val = SPL2_DB.expansion.values[mat][idx];
            tr += `<td>${val !== null && val !== undefined ? val : ''}</td>`;
        });
        tr += '</tr>';
        tbExp.innerHTML += tr;
    });

    // --- 3. Modulus (C-6) ---
    const hMod = document.getElementById('head-mod');
    const tbMod = document.getElementById('body-mod');
    const modMats = Object.keys(SPL2_DB.modulus.values);
    let hrm = '<tr><th class="sticky-col">Material</th>' + SPL2_DB.modulus.temperatures.map(t => `<th>${t}°F</th>`).join('') + '</tr>';
    hMod.innerHTML = hrm;

    modMats.forEach(mat => {
        let tr = `<tr><td class="sticky-col fw-bold">${mat}</td>`;
        SPL2_DB.modulus.temperatures.forEach((temp, idx) => {
            const val = SPL2_DB.modulus.values[mat][idx];
            tr += `<td>${val !== null && val !== undefined ? val : ''}</td>`;
        });
        tr += '</tr>';
        tbMod.innerHTML += tr;
    });

    dbRendered = true;
}
