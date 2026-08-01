const point = (x, y, z) => ({ x, y, z });

/**
 * Deterministic [SIMULATED] source package for sequential-sketcher certification.
 * It is repository-owned test evidence only and is never a production fallback.
 */
export function createSequentialSketcherCertificationFixture() {
  return [
    {
      id: 'SEQ-BRANCH-001',
      name: 'SEQ-BRANCH-001',
      type: 'BRANCH',
      attributes: {
        NAME: 'SEQ-BRANCH-001',
        HPOS: point(0, 0, 0),
        TPOS: point(2000, 1000, 0),
      },
      children: [
        routeComponent('SEQ-PIPE-001', 'PIPE', point(0, 0, 0), point(1000, 0, 0)),
        eventComponent('SEQ-ELBO-001', 'ELBO', point(1000, 0, 0)),
        routeComponent('SEQ-PIPE-002', 'PIPE', point(1000, 0, 0), point(1000, 1000, 0)),
        eventComponent('SEQ-ELBO-002', 'ELBO', point(1000, 1000, 0)),
        routeComponent('SEQ-PIPE-003', 'PIPE', point(1000, 1000, 0), point(2000, 1000, 0)),
        supportComponent('SEQ-SUPPORT-001', point(500, 0, 0)),
      ],
    },
  ];
}

export function serializeSequentialSketcherCertificationFixture() {
  return `${JSON.stringify(createSequentialSketcherCertificationFixture(), null, 2)}\n`;
}

function routeComponent(id, type, start, end) {
  return {
    id,
    name: id,
    type,
    attributes: {
      NAME: id,
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

function eventComponent(id, type, position) {
  return {
    id,
    name: id,
    type,
    attributes: {
      NAME: id,
      TYPE: type,
      POS: position,
    },
    nativeParams: {
      center: position,
    },
  };
}

function supportComponent(id, position) {
  return {
    id,
    name: id,
    type: 'SUPPORT',
    attributes: {
      NAME: id,
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
