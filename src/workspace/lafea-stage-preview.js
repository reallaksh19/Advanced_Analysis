/**
 * Dedicated visual geometry assembly and preview engine for LAFEA calculation stages.
 * Converts stage documents into rich 2D/3D structural wireframes and finite element meshes
 * equipped with semantic docx-compliant entity identifiers (sceneEntityId, sourceEntityId).
 */

function isRecord(val) {
  return typeof val === 'object' && val !== null && !Array.isArray(val);
}

function validNodes(nodes, defaultZ = 0) {
  if (!Array.isArray(nodes)) return [];
  return nodes
    .filter(isRecord)
    .map((node, i) => ({
      nodeId: String(node.nodeId || node.id || `NODE-${i + 1}`),
      x: Number(node.x ?? node.position?.[0] ?? 0),
      y: Number(node.y ?? node.position?.[1] ?? 0),
      z: Number(node.z ?? node.position?.[2] ?? defaultZ),
      sceneEntityId: `SCENE-NODE-${node.nodeId || i + 1}`,
      sourceEntityId: `SOURCE-NODE-${node.nodeId || i + 1}`,
    }));
}

function validElements(elements, defaultType = 'T3_LINE') {
  if (!Array.isArray(elements)) return [];
  return elements
    .filter(isRecord)
    .map((elem, i) => {
      const nodeIds = Array.isArray(elem.nodeIds)
        ? elem.nodeIds.map(String)
        : (Array.isArray(elem.nodes) ? elem.nodes.map(String) : []);
      return {
        elementId: String(elem.elementId || elem.id || `ELEM-${i + 1}`),
        nodeIds,
        nodes: nodeIds,
        type: elem.type || defaultType,
        sceneEntityId: `SCENE-ELEM-${elem.elementId || i + 1}`,
        sourceEntityId: `SOURCE-ELEM-${elem.elementId || i + 1}`,
      };
    });
}

function pointLink(points) {
  if (points.length < 2) return [];
  const elements = [];
  for (let i = 0; i < points.length - 1; i += 1) {
    const nodeIds = [points[i].nodeId, points[i + 1].nodeId];
    elements.push({
      elementId: `LINK-${i + 1}`,
      nodeIds,
      nodes: nodeIds,
      type: 'LINE',
      sceneEntityId: `SCENE-LINK-${i + 1}`,
      sourceEntityId: `SOURCE-LINK-${i + 1}`,
    });
  }
  return elements;
}

function xyGeometry(nodesInput, elementsInput, nodePath) {
  const nodes = validNodes(nodesInput);
  const elements = validElements(elementsInput, 'T6_Q8_CONTINUUM');
  return { nodes, elements, nodePath };
}

function positionGeometry(nodesInput, elementsInput, nodePath) {
  const nodes = validNodes(nodesInput).map((node) => {
    // Apply isometric projection to render 3D cylindrical shells beautifully in 2D
    const isoX = node.x - 0.45 * node.z;
    const isoY = node.y + 0.28 * node.z;
    return { ...node, x: isoX, y: isoY };
  });
  const elements = validElements(elementsInput, 'MITC4_SHELL');
  // Disabling nodePath prevents 2D SVG drags from corrupting actual 3D kernel coordinates
  return { nodes, elements, nodePath: null };
}

function buildFoundationPadGeometry(document) {
  const points = Array.isArray(document?.loadReferencePoints)
    ? document.loadReferencePoints.map((row) => ({
      nodeId: row.identity,
      x: Number(row.point?.value?.[0] ?? 0),
      y: Number(row.point?.value?.[1] ?? 0),
      z: Number(row.point?.value?.[2] ?? 0),
    }))
    : [];
  const sourcePt = points.find((p) => p.nodeId === 'SOURCE') || points[0] || { x: 200, y: 300, z: 1000 };
  const targetPt = points.find((p) => p.nodeId === 'TARGET') || points[1] || { x: 200, y: 300, z: 0 };
  const center = { x: targetPt.x ?? 200, y: targetPt.y ?? 300 };

  const explicitArm = Number(document?.leverArmDistanceMm);
  const leverArm = !isNaN(explicitArm) && explicitArm > 0
    ? explicitArm
    : (Math.abs(sourcePt.z - targetPt.z) || 450);

  const padThk = Number(document?.thicknessBasis?.wearPadThickness?.value ?? 20);
  const cradleThk = Number(document?.thicknessBasis?.cradleThickness?.value ?? 30);
  const L = padThk * 20;
  const W = cradleThk * 15;
  const h = L / 2;
  const w = W / 2;
  const lh = h * 0.42;
  const lw = w * 0.28;

  const getXY = (id, defX, defY) => {
    const p = points.find((row) => row.nodeId === id);
    return p && (p.x !== 0 || p.y !== 0 || id === 'TARGET') ? { x: p.x, y: p.y } : { x: defX, y: defY };
  };

  const padNodes = [
    { nodeId: 'PLATE-NW', ...getXY('PLATE-NW', center.x - h, center.y + w) },
    { nodeId: 'PLATE-NE', ...getXY('PLATE-NE', center.x + h, center.y + w) },
    { nodeId: 'PLATE-SE', ...getXY('PLATE-SE', center.x + h, center.y - w) },
    { nodeId: 'PLATE-SW', ...getXY('PLATE-SW', center.x - h, center.y - w) },
    { nodeId: 'LUG-BASE-NW', ...getXY('LUG-BASE-NW', center.x - lh, center.y + lw) },
    { nodeId: 'LUG-BASE-NE', ...getXY('LUG-BASE-NE', center.x + lh, center.y + lw) },
    { nodeId: 'LUG-BASE-SE', ...getXY('LUG-BASE-SE', center.x + lh, center.y - lw) },
    { nodeId: 'LUG-BASE-SW', ...getXY('LUG-BASE-SW', center.x - lh, center.y - lw) },
    { nodeId: 'TARGET', x: center.x, y: center.y },
    { nodeId: 'SOURCE', x: center.x, y: center.y - leverArm },
  ];
  const padElements = [
    { elementId: 'PLATE-NORTH', nodes: ['PLATE-NW', 'PLATE-NE'], type: 'PLATE_EDGE' },
    { elementId: 'PLATE-EAST', nodes: ['PLATE-NE', 'PLATE-SE'], type: 'PLATE_EDGE' },
    { elementId: 'PLATE-SOUTH', nodes: ['PLATE-SE', 'PLATE-SW'], type: 'PLATE_EDGE' },
    { elementId: 'PLATE-WEST', nodes: ['PLATE-SW', 'PLATE-NW'], type: 'PLATE_EDGE' },
    { elementId: 'WELD-NORTH', nodes: ['LUG-BASE-NW', 'LUG-BASE-NE'], type: 'WELD_FOOTPRINT' },
    { elementId: 'WELD-EAST', nodes: ['LUG-BASE-NE', 'LUG-BASE-SE'], type: 'WELD_FOOTPRINT' },
    { elementId: 'WELD-SOUTH', nodes: ['LUG-BASE-SE', 'LUG-BASE-SW'], type: 'WELD_FOOTPRINT' },
    { elementId: 'WELD-WEST', nodes: ['LUG-BASE-SW', 'LUG-BASE-NW'], type: 'WELD_FOOTPRINT' },
    { elementId: 'LUG-CENTER-STANDOFF', nodes: ['TARGET', 'SOURCE'], type: 'LEVER_ARM' },
    { elementId: 'LUG-WEB-LEFT', nodes: ['LUG-BASE-NW', 'SOURCE'], type: 'LUG_CHEEK' },
    { elementId: 'LUG-WEB-RIGHT', nodes: ['LUG-BASE-NE', 'SOURCE'], type: 'LUG_CHEEK' },
  ];
  return { nodes: validNodes(padNodes), elements: validElements(padElements, 'LUG_BENCHMARK'), nodePath: 'loadReferencePoints' };
}

function buildPipeSectionGeometry(document) {
  const center = { x: 400, y: 400 };
  const R = 200;
  const r = 160;
  const steps = 16;
  const ringNodes = [];
  const ringElements = [];
  for (let i = 0; i < steps; i += 1) {
    const angle = (i * 2 * Math.PI) / steps;
    const nOut = `OUTER-${i}`;
    const nIn = `INNER-${i}`;
    ringNodes.push({ nodeId: nOut, x: center.x + R * Math.cos(angle), y: center.y + R * Math.sin(angle) });
    ringNodes.push({ nodeId: nIn, x: center.x + r * Math.cos(angle), y: center.y + r * Math.sin(angle) });
    const nOutNext = `OUTER-${(i + 1) % steps}`;
    const nInNext = `INNER-${(i + 1) % steps}`;
    ringElements.push({ elementId: `WALL-SEAM-${i}`, nodes: [nOut, nOutNext], type: 'OUTER_WALL' });
    ringElements.push({ elementId: `BORE-SEAM-${i}`, nodes: [nIn, nInNext], type: 'INNER_BORE' });
    ringElements.push({ elementId: `WEB-${i}`, nodes: [nOut, nIn], type: 'THICKNESS_WEB' });
  }
  ringNodes.push({ nodeId: 'VALVE-MASS', x: center.x + 450, y: center.y });
  ringNodes.push({ nodeId: 'PIPE-CENTER', x: center.x, y: center.y });
  ringElements.push({ elementId: 'CANTILEVER-ARM', nodes: ['PIPE-CENTER', 'VALVE-MASS'], type: 'ECCENTRIC_ARM' });
  return { nodes: validNodes(ringNodes), elements: validElements(ringElements, 'AXISYMMETRIC_WALL'), nodePath: 'nodes' };
}

function buildWeldProfileGeometry() {
  const center = { x: 300, y: 300 };
  const bw = 250;
  const bh = 300;
  const tw = 60;
  const tf = 60;
  const hbw = bw / 2;
  const hbh = bh / 2;
  const htw = tw / 2;
  const weldNodes = [
    { nodeId: 'W1', x: center.x - hbw, y: center.y - hbh },
    { nodeId: 'W2', x: center.x + hbw, y: center.y - hbh },
    { nodeId: 'W3', x: center.x + hbw, y: center.y - hbh + tf },
    { nodeId: 'W4', x: center.x + htw, y: center.y - hbh + tf },
    { nodeId: 'W5', x: center.x + htw, y: center.y + hbh - tf },
    { nodeId: 'W6', x: center.x + hbw, y: center.y + hbh - tf },
    { nodeId: 'W7', x: center.x + hbw, y: center.y + hbh },
    { nodeId: 'W8', x: center.x - hbw, y: center.y + hbh },
    { nodeId: 'W9', x: center.x - hbw, y: center.y + hbh - tf },
    { nodeId: 'W10', x: center.x - htw, y: center.y + hbh - tf },
    { nodeId: 'W11', x: center.x - htw, y: center.y - hbh + tf },
    { nodeId: 'W12', x: center.x - hbw, y: center.y - hbh + tf },
    { nodeId: 'CENTROID', x: center.x, y: center.y },
    { nodeId: 'LEVER-LOAD-P', x: center.x + 450, y: center.y - 200 },
  ];
  const weldElements = [];
  for (let i = 0; i < 12; i += 1) {
    weldElements.push({
      elementId: `WELD-FILLET-${i + 1}`,
      nodes: [weldNodes[i].nodeId, weldNodes[(i + 1) % 12].nodeId],
      type: 'FILLET_WELD_TOE',
    });
  }
  weldElements.push({ elementId: 'ECCENTRIC-MOMENT-ARM', nodes: ['CENTROID', 'LEVER-LOAD-P'], type: 'LEVER_ARM_X' });
  return { nodes: validNodes(weldNodes), elements: validElements(weldElements, 'WELD_GROUP'), nodePath: 'nodes' };
}

function enrich2DContinuum(doc) {
  if (Array.isArray(doc.nodes) && doc.nodes.length > 4) return xyGeometry(doc.nodes, doc.elements, 'nodes');
  const nodes = [];
  const elements = [];
  const cols = 5;
  const rows = 4;
  const dx = 80;
  const dy = 65;
  const startX = 120;
  const startY = 120;
  for (let r = 0; r <= rows; r += 1) {
    for (let c = 0; c <= cols; c += 1) {
      nodes.push({ nodeId: `C2D-${r}-${c}`, x: startX + c * dx, y: startY + r * dy });
    }
  }
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const n1 = `C2D-${r}-${c}`;
      const n2 = `C2D-${r}-${c + 1}`;
      const n3 = `C2D-${r + 1}-${c + 1}`;
      const n4 = `C2D-${r + 1}-${c}`;
      elements.push({ elementId: `Q8-PLATE-${r}-${c}`, nodes: [n1, n2, n3, n4], type: 'CONTINUUM_2D_Q8' });
    }
  }
  return { nodes: validNodes(nodes), elements: validElements(elements, 'CONTINUUM_2D_Q8'), nodePath: 'nodes' };
}

function enrich3DThinShell(doc) {
  if (Array.isArray(doc.nodes) && doc.nodes.length > 4) return positionGeometry(doc.nodes, doc.elements, 'nodes');
  const nodes = [];
  const elements = [];
  const steps = 12;
  const lengthSteps = 4;
  const R = 150;
  const dz = 70;
  const center = { x: 350, y: 260 };
  for (let l = 0; l <= lengthSteps; l += 1) {
    for (let s = 0; s < steps; s += 1) {
      const angle = (s * 2 * Math.PI) / steps;
      const x3 = R * Math.cos(angle);
      const y3 = R * Math.sin(angle);
      const z3 = (l - lengthSteps / 2) * dz;
      const xScreen = center.x + x3 - 0.45 * z3;
      const yScreen = center.y + y3 + 0.28 * z3;
      nodes.push({ nodeId: `SH3D-${l}-${s}`, x: xScreen, y: yScreen, z: z3 });
    }
  }
  for (let l = 0; l < lengthSteps; l += 1) {
    for (let s = 0; s < steps; s += 1) {
      const sNext = (s + 1) % steps;
      const n1 = `SH3D-${l}-${s}`;
      const n2 = `SH3D-${l}-${sNext}`;
      const n3 = `SH3D-${l + 1}-${sNext}`;
      const n4 = `SH3D-${l + 1}-${s}`;
      elements.push({ elementId: `MITC4-${l}-${s}`, nodes: [n1, n2, n3, n4], type: 'SHELL_MITC4' });
    }
  }
  return { nodes: validNodes(nodes), elements: validElements(elements, 'SHELL_MITC4'), nodePath: 'nodes' };
}

export function lafeaPreviewGeometry(stageId, input) {
  const document = isRecord(input) ? input : {};
  if (stageId === 'LAFEA.5') {
    return positionGeometry(document.shellTemplate?.nodes, document.shellTemplate?.elements, 'shellTemplate.nodes');
  }
  if (Array.isArray(document.nodes) && document.nodes.length > 0 && !document._ignoreRawNodes) {
    if (stageId === 'LAFEA.3') return xyGeometry(document.nodes, document.elements, 'nodes');
    if (stageId === 'LAFEA.4') return positionGeometry(document.nodes, document.elements, 'nodes');
    return { nodes: validNodes(document.nodes), elements: validElements(document.elements, 'STAGE_ELEMENT'), nodePath: 'nodes' };
  }
  if (stageId === 'LAFEA.3') return enrich2DContinuum(document);
  if (stageId === 'LAFEA.4') return enrich3DThinShell(document);
  if (stageId === 'LAFEA.6') return buildWeldProfileGeometry(document);
  if (stageId === 'LAFEA.2') return buildPipeSectionGeometry(document);
  return buildFoundationPadGeometry(document);
}

