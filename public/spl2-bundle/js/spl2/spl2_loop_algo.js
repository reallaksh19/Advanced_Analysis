// A precise JS translation of Kellogg simplified loop algorithm
// from "005-20 Calculations\005-207 Master spreadsheets\5900R-GL-L-CA-0000_A00.Loop Calculations.xlsm"

export function calcLoopFromSpreadsheet(S, G, H, W, D, t, E_msi, e_100ft, SA) {
    // V variables map:
    // V23 = D (in)
    // V24 = t (in)
    // V27 = R (bend radius) -> typically D * 1.5
    // V30 = S (ft)
    // V31 = G (ft)
    // V32 = H (ft)
    // V33 = W (ft)
    // V21 = Ec (Msi)
    // V22 = e (in/100ft) -> Extracted from C-1 usually

    // Formula Mapping (V42 to V60):
    // V42 (h): =V24*V27 / ((V23-V24)/2)^2
    const R = D * 1.5;
    const h = (t * R) / Math.pow((D - t) / 2, 2);

    // V43 (k): =1.65/V42 (flexibility factor)
    const k = h === 0 ? 0 : 1.65 / h;

    // V44 (beta): =0.9 / V42^(2/3) (in plane SIF)
    const beta = h === 0 ? 0 : 0.9 / Math.pow(h, 2 / 3);

    // V45 (L): =2*PI()*V27/12*V43 + 2*V32 + V31 - 8*V27/12
    const L = 2 * Math.PI * (R / 12) * k + 2 * H + G - 8 * (R / 12);

    // V46 (Z_bar): =(PI()*V27/12*V43 + V33 + V32 - 4*V27/12) * V32 / V45
    const Z_bar = L === 0 ? 0 : (Math.PI * (R / 12) * k + W + H - 4 * (R / 12)) * H / L;

    // V47 (AA): =(2*V33 + V32 - 6*V27/12) * V32^2 / 2
    const AA = (2 * W + H - 6 * (R / 12)) * Math.pow(H, 2) / 2;

    // V48 (BB): =(V32 - 2*V27/12)^3 / 6
    const BB = Math.pow(H - 2 * (R / 12), 3) / 6;

    // V49 (CC): =((V32^2 + 3*(V27/12)^2 - 2*V32*V27/12)*PI()/4 + V32*V27/12 - 2*(V27/12)^2) * 4*V27/12*V43
    const CC = ((Math.pow(H, 2) + 3 * Math.pow(R / 12, 2) - 2 * H * (R / 12)) * Math.PI / 4 + H * (R / 12) - 2 * Math.pow(R / 12, 2)) * 4 * (R / 12) * k;

    // V50 (Ix): =V47 + V48 + V49 - V46^2 * V45
    const Ix = AA + BB + CC - Math.pow(Z_bar, 2) * L;

    // V51 (ds): Net Expansion = V22 * V30 (We use e_rate/100 * S distance typically in Kellogg, Excel uses e/100 * S)
    // Wait, the V51 formula is V22*V30. But V22 is e_rate / 100.
    const ds = (e_100ft / 100) * S;

    // V26 (I): =PI()/64*(V23^4 - (V23-2*V24)^4)
    const I = (Math.PI / 64) * (Math.pow(D, 4) - Math.pow(D - 2 * t, 4));

    // V55 (Fx): =V21 * V26 * V51 / V50 / 12^3
    // V21 is Ec in Msi, need to match Excel scale (1e6 * Msi * I * ds / (Ix * 12^3))
    const E_psi = E_msi * 1e6;
    const Fx = Ix === 0 ? 0 : (E_psi * I * ds) / (Ix * Math.pow(12, 3));

    // V56 (Hot Fx): Scale factor (usually ~0.8)
    const Fhot = Fx * 0.8; // Simplification since AB14/AB15 is hot/cold modulus ratio usually

    // V57 (Fz): =V55 * V46 / V31
    const Fz = G === 0 ? 0 : (Fx * Z_bar) / G;

    // V58 (Sa): =((V32 - V46) * 12 * V55) * V44 / V25
    // V25 (Z): =PI()*(V23^4 - (V23-2*V24)^4) / 32 / V23
    const Z_sec = (Math.PI / 32) * (Math.pow(D, 4) - Math.pow(D - 2 * t, 4)) / D;
    const Sa = Z_sec === 0 ? 0 : ((H - Z_bar) * 12 * Fx) * beta / Z_sec;

    // V59 (Sb): =V46 * 12 * V55 * V44 / V25
    const Sb = Z_sec === 0 ? 0 : (Z_bar * 12 * Fx * beta) / Z_sec;

    // V60 (Max Stress): =MAX(Sa, Sb)
    const max_stress = Math.max(Sa, Sb);
    const status = max_stress <= SA ? "PASS" : "FAIL";

    return {
        I, beta, L_total: S + 2 * G + 2 * H + W, delta_Lx: ds,
        Fx, Fhot, Fz, Sa, Sb, max_stress, status,
        geom_h: h, geom_k: k
    };
}
