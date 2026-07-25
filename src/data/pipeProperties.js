const source = 'Project screening master DB / ASME B36.10M reference required before final issue';
const sourceRevision = 'SCREENING-REV-001';

function makePipeRow({ nps, schedule, od_in, wall_in, weight_lb_ft = null, note = '' }) {
  const id_in = Number((od_in - 2 * wall_in).toFixed(12));
  const area_in2 = Math.PI / 4 * (od_in ** 2 - id_in ** 2);
  const I_in4 = Math.PI / 64 * (od_in ** 4 - id_in ** 4);
  const Z_in3 = I_in4 / (od_in / 2);
  return {
    nps,
    schedule,
    od_in,
    wall_in,
    id_in,
    area_in2,
    I_in4,
    Z_in3,
    weight_lb_ft,
    source,
    sourceRevision,
    dataStatus: 'VERIFIED_SCREENING',
    note
  };
}

const rows = [
  makePipeRow({ nps: 0.5, schedule: '40', od_in: 0.84, wall_in: 0.109 }),
  makePipeRow({ nps: 0.75, schedule: '40', od_in: 1.05, wall_in: 0.113 }),
  makePipeRow({ nps: 1, schedule: '40', od_in: 1.315, wall_in: 0.133 }),
  makePipeRow({ nps: 1.5, schedule: '40', od_in: 1.9, wall_in: 0.145 }),
  makePipeRow({ nps: 2, schedule: '40', od_in: 2.375, wall_in: 0.154 }),
  makePipeRow({ nps: 2, schedule: '80', od_in: 2.375, wall_in: 0.218 }),
  makePipeRow({ nps: 3, schedule: '40', od_in: 3.5, wall_in: 0.216 }),
  makePipeRow({ nps: 4, schedule: '40', od_in: 4.5, wall_in: 0.237 }),
  makePipeRow({ nps: 4, schedule: '80', od_in: 4.5, wall_in: 0.337 }),
  makePipeRow({ nps: 6, schedule: '40', od_in: 6.625, wall_in: 0.28 }),
  makePipeRow({ nps: 6, schedule: '80', od_in: 6.625, wall_in: 0.432 }),
  makePipeRow({ nps: 8, schedule: '40', od_in: 8.625, wall_in: 0.322, weight_lb_ft: 28.55 }),
  makePipeRow({ nps: 8, schedule: '80', od_in: 8.625, wall_in: 0.5 }),
  makePipeRow({ nps: 10, schedule: '40', od_in: 10.75, wall_in: 0.365 }),
  makePipeRow({ nps: 10, schedule: '80', od_in: 10.75, wall_in: 0.5 }),
  makePipeRow({ nps: 12, schedule: '40', od_in: 12.75, wall_in: 0.406 }),
  makePipeRow({ nps: 14, schedule: '40', od_in: 14, wall_in: 0.438 }),
  makePipeRow({ nps: 16, schedule: 'STD', od_in: 16, wall_in: 0.375 }),
  makePipeRow({ nps: 16, schedule: '40', od_in: 16, wall_in: 0.5, note: 'Screening row retained for legacy benchmark compatibility.' }),
  makePipeRow({ nps: 18, schedule: 'STD', od_in: 18, wall_in: 0.375 }),
  makePipeRow({ nps: 20, schedule: 'STD', od_in: 20, wall_in: 0.375 }),
  makePipeRow({ nps: 24, schedule: 'STD', od_in: 24, wall_in: 0.375 }),
  makePipeRow({ nps: 30, schedule: 'STD', od_in: 30, wall_in: 0.375 }),
  makePipeRow({ nps: 36, schedule: 'STD', od_in: 36, wall_in: 0.375 })
];

export const pipePropertyRows = rows;

export const pipePropertyTable = Object.fromEntries(
  rows.map((row) => [`${Number(row.nps)}|${String(row.schedule).toUpperCase()}`, row])
);

export function pipePropertyKey(nps, schedule) {
  return `${Number(nps)}|${String(schedule || '').toUpperCase()}`;
}

export function resolvePipeProperty({ nps, schedule, pipeTable = pipePropertyTable } = {}) {
  const key = pipePropertyKey(nps, schedule);
  const row = pipeTable[key];
  if (!row) {
    return {
      moduleId: 'engineering-data',
      methodId: 'PIPE_DATA_LOOKUP',
      formulaIds: ['PIPE_SECTION_I_HOLLOW_CIRCLE', 'PIPE_SECTION_Z_I_OVER_C'],
      status: 'MISSING_DATA',
      isQualified: false,
      value: null,
      nps: Number(nps),
      schedule: String(schedule || '').toUpperCase(),
      diagnostics: [
        {
          code: 'PIPE_DATA_MISSING',
          severity: 'ERROR',
          message: `Pipe property missing for NPS ${nps}, Schedule ${schedule}. Calculation blocked.`
        }
      ]
    };
  }

  return {
    moduleId: 'engineering-data',
    methodId: 'PIPE_DATA_LOOKUP',
    formulaIds: ['PIPE_SECTION_I_HOLLOW_CIRCLE', 'PIPE_SECTION_Z_I_OVER_C'],
    status: 'PASSED',
    isQualified: true,
    ...row,
    value: row,
    diagnostics: []
  };
}
