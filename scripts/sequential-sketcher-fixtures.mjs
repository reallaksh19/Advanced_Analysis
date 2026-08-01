const point = (x, y, z) => ({ x, y, z });

const IDS = Object.freeze({
  branch: '00000000-0000-4000-8000-000000000001',
  pipe1: '00000000-0000-4000-8000-000000000002',
  elbow1: '00000000-0000-4000-8000-000000000003',
  pipe2: '00000000-0000-4000-8000-000000000004',
  elbow2: '00000000-0000-4000-8000-000000000005',
  pipe3: '00000000-0000-4000-8000-000000000006',
  support1: '00000000-0000-4000-8000-000000000007',
});

/**
 * Deterministic [SIMULATED] source package for sequential-sketcher certification.
 * It is repository-owned test evidence only and is never a production fallback.
 */
export function createSequentialSketcherCertificationFixture() {
  return [
    {
      id: IDS.branch,
      name: 'SEQ-BRANCH-001',
      type: 'BRANCH',
      attributes: {
        NAME: 'SEQ-BRANCH-001',
        HPOS: point(0, 0, 0),
        TPOS: point(2000, 1000, 0),
      },
      children: [
        routeComponent(IDS.pipe1, 'SEQ-PIPE-001', 'PIPE', point(0, 0, 0), point(1000, 0, 0)),
        eventComponent(IDS.elbow1, 'SEQ-ELBO-001', 'ELBO', point(1000, 0, 0)),
        routeComponent(IDS.pipe2, 'SEQ-PIPE-002', 'PIPE', point(1000, 0, 0), point(1000, 1000, 0)),
        eventComponent(IDS.elbow2, 'SEQ-ELBO-002', 'ELBO', point(1000, 1000, 0)),
        routeComponent(IDS.pipe3, 'SEQ-PIPE-003', 'PIPE', point(1000, 1000, 0), point(2000, 1000, 0)),
        supportComponent(IDS.support1, 'SEQ-SUPPORT-001', point(500, 0, 0)),
      ],
    },
  ];
}

export function serializeSequentialSketcherCertificationFixture() {
  return `${JSON.stringify(createSequentialSketcherCertificationFixture(), null, 2)}\n`;
}

function routeComponent(id, name, type, start, end) {
  return {
    id,
    name,
    type,
    attributes: {
      NAME: name,
      TYPE: type,
      APOS: start,
      LPOS: end,
    },
    nativeParams: {
      startPoint: start,
      endPoint: end,
    },
  };
}

function eventComponent(id, name, type, position) {
  return {
    id,
    name,
    type,
    attributes: {
      NAME: name,
      TYPE: type,
      POS: position,
    },
    nativeParams: {
      center: position,
    },
  };
}

function supportComponent(id, name, position) {
  return {
    id,
    name,
    type: 'SUPPORT',
    attributes: {
      NAME: name,
      TYPE: 'SUPPORT',
      POS: position,
    },
    sourceAttributes: {
      POS: position,
      SUPPORT_TYPE: 'ANCHOR',
    },
    nativeParams: {
      center: position,
    },
  };
}
