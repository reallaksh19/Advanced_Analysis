import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const [profilePath, enrichedPath, xmlPath, outputPath = '/tmp/empirical-sjson-1885-screening-result.json'] = process.argv.slice(2);
if (!profilePath || !enrichedPath || !xmlPath) {
  throw new Error('Usage: node empirical-sjson-1885-configurable-screening-run.mjs <profile.json> <EnrichedSjson> <topology.xml> [output.json]');
}

const profile = JSON.parse(await readFile(profilePath, 'utf8'));
const enrichedText = await readFile(enrichedPath, 'utf8');
const xmlText = await readFile(xmlPath, 'utf8');
const enriched = JSON.parse(enrichedText.replace(/^\uFEFF/u, ''));

const sourceHashes = {
  enrichedSjsonSha256: sha256(enrichedText),
  topologyInputXmlSha256: sha256(xmlText),
  profileSha256: sha256(JSON.stringify(profile)),
};

const sourceIndex = indexEnrichedSource(enriched, profile);
const model = parseInputXml(xmlText);
resolveProcessValues(model.edges, profile);
const sites = consolidateSupportSites(sourceIndex.supportRecords, profile);
attachSitesToModel(sites, model);
assignSiteAxes(sites, model);
assignSiteIds(sites);

const weightResult = calculateTributaryWeight(model, sites, sourceIndex, profile);
const thermalX = calculateThermalAxis(model, sites, sourceIndex, profile, 'X');
const thermalY = calculateThermalAxis(model, sites, sourceIndex, profile, 'Y');

const rows = sites
  .sort((a, b) => a.siteId.localeCompare(b.siteId))
  .map((site) => ({
    siteId: site.siteId,
    supportTag: site.baseTag,
    sourceCoordinateMm: roundPoint(site.coordinate, 3),
    nodeId: site.nodeId,
    capabilities: [...site.capabilities].sort(),
    inferredDirections: [...site.directionByCapability.entries()]
      .map(([capability, axis]) => ({ capability, axis }))
      .sort((a, b) => a.capability.localeCompare(b.capability)),
    reactionsKn: {
      FxThermal: round(thermalX.reactionBySite.get(site.key) || 0, profile.reporting.roundingDecimals),
      FyThermal: round(thermalY.reactionBySite.get(site.key) || 0, profile.reporting.roundingDecimals),
      FzWeight: round(weightResult.reactionBySite.get(site.key) || 0, profile.reporting.roundingDecimals),
    },
    thermalMovementMm: {
      X: round(thermalX.displacementByNode.get(site.nodeId) || 0, profile.reporting.roundingDecimals),
      Y: round(thermalY.displacementByNode.get(site.nodeId) || 0, profile.reporting.roundingDecimals),
    },
  }));

const report = {
  schema: 'empirical-sjson-screening-result/v1',
  profileId: profile.profileId,
  status: 'EXPERIMENTAL_CONFIGURABLE_SCREENING',
  qualification: {
    qualifiedWp6ProfileModified: false,
    anchorSynthesized: false,
    pressureIncluded: false,
    methodStatement: 'Graph-tributary vertical weight plus independent scalar global X/Y thermal compatibility. Not beam/frame FEA and not a code stress result.',
  },
  source: {
    commit: profile.source.commit,
    enrichedSjsonPath: profile.source.enrichedSjsonPath,
    topologyInputXmlPath: profile.source.topologyInputXmlPath,
    hashes: sourceHashes,
  },
  configurableAssumptions: profile,
  sourceResolution: {
    inputXmlElements: model.edges.length,
    inputXmlNodes: model.nodes.size,
    rawSupportRecords: sourceIndex.supportRecords.length,
    physicalSupportSites: sites.length,
    componentRecords: sourceIndex.componentRecords.length,
    operatingTemperature: summarizeNumbers(model.edges.map((edge) => edge.temperatureC)),
    temperatureResolution: countBy(model.edges, (edge) => edge.temperatureAuthority),
    sourceComponentWeightPositiveCount: sourceIndex.componentRecords.filter((record) => positive(record.componentWeightKg)).length,
    sourceInsulationPositiveCount: sourceIndex.componentRecords.filter((record) => positive(record.insulationThicknessMm)).length,
  },
  verticalWeight: {
    status: weightResult.status,
    totalModelMassKg: round(weightResult.totalMassKg, 6),
    totalWeightKn: round(weightResult.totalWeightN / 1000, 6),
    reactionSumKn: round(sum([...weightResult.reactionBySite.values()]), 6),
    equilibriumErrorKn: round(sum([...weightResult.reactionBySite.values()]) - weightResult.totalWeightN / 1000, 9),
    massByTreatmentKg: mapValues(weightResult.massByTreatmentKg, (value) => round(value, 6)),
  },
  thermalX: thermalSummary(thermalX),
  thermalY: thermalSummary(thermalY),
  supportRows: rows,
  warnings: [
    'Results depend on the editable benchmark profile and are not the locked WP6 qualification profile.',
    'Anchorless admission is based on actual directional-restraint matrix rank; no arbitrary datum node is fixed.',
    'Vertical reactions use graph tributary weight, not flexural beam analysis.',
    'Guide and line-stop axes are inferred from the host route tangent because the exported TYPE 8/9 cosine fields are zero.',
    'Fluid is omitted where no inherited source density is available.',
    'Pressure load and pressure stress are excluded.',
  ],
};

await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log('EMPIRICAL_SJSON_1885_CONFIGURABLE_RESULT_BEGIN');
console.log(JSON.stringify(report, null, 2));
console.log('EMPIRICAL_SJSON_1885_CONFIGURABLE_RESULT_END');

function indexEnrichedSource(root, config) {
  const componentRecords = [];
  const supportRecords = [];
  const byName = new Map();
  let sourceOrder = 0;

  const visit = (value, branchName = null) => {
    if (Array.isArray(value)) {
      for (const item of value) visit(item, branchName);
      return;
    }
    if (!value || typeof value !== 'object') return;
    const nextBranch = String(value.type || '').toUpperCase() === 'BRANCH'
      ? String(value.name || value.attributes?.NAME || branchName || '')
      : branchName;
    if (value.name || value.type || value.attributes) {
      const attrs = value.attributes || {};
      const enrichedAttrs = value.enrichedAttributes || {};
      const type = String(value.type || attrs.TYPE || enrichedAttrs.componentType || '').toUpperCase();
      const name = String(value.name || `${type} ${attrs.NAME || ''}`).trim();
      const rawInsulation = parseEngineeringNumber(attrs.INSU);
      const enrichedInsulation = finiteOrNull(enrichedAttrs.insulationThicknessMm);
      const record = {
        sourceOrder: sourceOrder++,
        name,
        type,
        branchName: nextBranch,
        attrs,
        enriched: enrichedAttrs,
        pipeOdMm: finiteOrNull(enrichedAttrs.pipeOdMm) ?? parseEngineeringNumber(attrs.ABORE) ?? parseEngineeringNumber(attrs.LBORE),
        wallThicknessMm: finiteOrNull(enrichedAttrs.wallThicknessMm),
        materialDensityKgM3: finiteOrNull(enrichedAttrs.materialDensityKgM3) ?? config.weight.pipeMetalDensityKgM3,
        componentWeightKg: firstPositive([
          enrichedAttrs.componentWeightKg,
          parseEngineeringNumber(attrs.NWEI),
          parseEngineeringNumber(attrs.PSIWEIGHT),
          parseEngineeringNumber(attrs.CMPWEIGHTDRY),
          parseEngineeringNumber(attrs.WEIGHT),
        ]),
        insulationThicknessMm: positive(rawInsulation) ? rawInsulation : (enrichedInsulation || 0),
        fluidDensityKgM3: finiteOrNull(enrichedAttrs.fluidDensityOpeKgM3),
        operatingTemperatureC: finiteOrNull(enrichedAttrs.operatingTemperatureC),
      };
      componentRecords.push(record);
      for (const key of nameKeys(name, attrs.NAME)) {
        if (!byName.has(key)) byName.set(key, record);
      }
      const capability = String(attrs.SUPPORT_KIND || attrs.SUPPORT_TYPE || '').toUpperCase();
      const tag = baseSupportTag(attrs.SUPPORT_TAG || name.replace(/^SUPPORT\s+/i, ''));
      const coordinate = firstPoint(attrs.LPOS, attrs.POS, attrs.APOS);
      if (tag && coordinate && ['REST', 'GUIDE', 'LINESTOP'].includes(capability)) {
        supportRecords.push({
          sourceOrder: record.sourceOrder,
          baseTag: tag,
          capability,
          coordinate,
          branchName: nextBranch,
          sourceName: name,
        });
      }
    }
    if (Array.isArray(value.children)) visit(value.children, nextBranch);
  };
  visit(root);
  return { componentRecords, supportRecords, byName };
}

function parseInputXml(text) {
  const elementPattern = /<PIPINGELEMENT\b([^>]*)>([\s\S]*?)<\/PIPINGELEMENT>/g;
  const edges = [];
  const nodes = new Map();
  const restraints = [];
  let match;
  while ((match = elementPattern.exec(text))) {
    const attrs = parseAttrs(match[1]);
    const inner = match[2];
    const fromNode = cleanNode(attrs.FROM_NODE);
    const toNode = cleanNode(attrs.TO_NODE);
    const from = {
      x: number(attrs.FROM_GLOBAL_X),
      y: number(attrs.FROM_GLOBAL_Y),
      z: number(attrs.FROM_GLOBAL_Z),
    };
    const to = {
      x: number(attrs.TO_GLOBAL_X),
      y: number(attrs.TO_GLOBAL_Y),
      z: number(attrs.TO_GLOBAL_Z),
    };
    nodes.set(fromNode, from);
    nodes.set(toNode, to);
    const edge = {
      id: attrs.ID,
      fromNode,
      toNode,
      from,
      to,
      dxMm: number(attrs.DELTA_X),
      dyMm: number(attrs.DELTA_Y),
      dzMm: number(attrs.DELTA_Z),
      lengthM: distance(from, to) / 1000,
      diameterMm: number(attrs.DIAMETER),
      wallMm: number(attrs.WALL_THICK),
      rawTemperatureC: number(attrs.TEMP_EXP_C1),
      rawFluidDensity: number(attrs.FLUID_DENSITY),
      lineId: decodeXml(attrs.LINE_ID || ''),
      name: decodeXml(attrs.NAME || ''),
      sourceType: String(attrs.SOURCE_TYPE || 'PIPE').toUpperCase(),
      modulusPa: number(attrs.MODULUS) * 1000,
      inner,
    };
    edges.push(edge);
    const restraintPattern = /<RESTRAINT\b([^>]*)\/>/g;
    let restraintMatch;
    while ((restraintMatch = restraintPattern.exec(inner))) {
      const restraintAttrs = parseAttrs(restraintMatch[1]);
      restraints.push({
        id: restraintAttrs.ID,
        supportId: restraintAttrs.SUPPORT_ID,
        tag: baseSupportTag(decodeXml(restraintAttrs.TAG || '')),
        nodeId: cleanNode(restraintAttrs.NODE),
        type: Math.round(number(restraintAttrs.TYPE)),
        sourceCoordinate: {
          x: number(restraintAttrs.SOURCE_X),
          y: number(restraintAttrs.SOURCE_Y),
          z: number(restraintAttrs.SOURCE_Z),
        },
        hostEdgeId: edge.id,
      });
    }
  }
  const edgesByNode = new Map([...nodes.keys()].map((id) => [id, []]));
  for (const edge of edges) {
    edgesByNode.get(edge.fromNode)?.push(edge);
    edgesByNode.get(edge.toNode)?.push(edge);
  }
  return { edges, nodes, restraints, edgesByNode };
}

function resolveProcessValues(edges, config) {
  const groups = groupBy(edges, (edge) => edge.lineId || '__NO_LINE__');
  for (const rows of groups.values()) {
    const validTemps = rows.map((edge) => edge.rawTemperatureC).filter((value) => !isSentinel(value, config) && Number.isFinite(value));
    const firstValidTemp = validTemps[0] ?? null;
    const validFluids = rows.map((edge) => edge.rawFluidDensity).filter((value) => !isSentinel(value, config) && Number.isFinite(value) && value >= 0);
    const firstValidFluid = validFluids[0] ?? null;
    let previousTemp = null;
    let previousFluid = null;
    for (const edge of rows) {
      if (!isSentinel(edge.rawTemperatureC, config) && Number.isFinite(edge.rawTemperatureC)) {
        previousTemp = edge.rawTemperatureC;
        edge.temperatureC = edge.rawTemperatureC;
        edge.temperatureAuthority = 'SOURCE_EXPLICIT';
      } else if (previousTemp != null) {
        edge.temperatureC = previousTemp;
        edge.temperatureAuthority = 'SENTINEL_PREVIOUS_ELEMENT';
      } else if (firstValidTemp != null) {
        edge.temperatureC = firstValidTemp;
        edge.temperatureAuthority = 'INITIAL_SENTINEL_FIRST_VALID_LINE';
      } else {
        edge.temperatureC = config.material.fallbackOperatingTemperatureC;
        edge.temperatureAuthority = 'CONFIG_FALLBACK_NO_LINE_VALUE';
      }
      if (!isSentinel(edge.rawFluidDensity, config) && Number.isFinite(edge.rawFluidDensity) && edge.rawFluidDensity >= 0) {
        previousFluid = normalizeFluidDensity(edge.rawFluidDensity);
        edge.fluidDensityKgM3 = previousFluid;
      } else if (previousFluid != null) {
        edge.fluidDensityKgM3 = previousFluid;
      } else if (firstValidFluid != null) {
        edge.fluidDensityKgM3 = normalizeFluidDensity(firstValidFluid);
      } else {
        edge.fluidDensityKgM3 = 0;
      }
    }
  }
}

function consolidateSupportSites(records, config) {
  const sites = [];
  for (const record of records.sort((a, b) => a.sourceOrder - b.sourceOrder)) {
    let site = sites.find((candidate) => candidate.baseTag === record.baseTag
      && distance(candidate.coordinate, record.coordinate) <= config.supportProjection.coordinateToleranceMm);
    if (!site) {
      site = {
        key: `${record.baseTag}@${round(record.coordinate.x, 3)},${round(record.coordinate.y, 3)},${round(record.coordinate.z, 3)}`,
        baseTag: record.baseTag,
        coordinate: record.coordinate,
        sourceOrder: record.sourceOrder,
        capabilities: new Set(),
        directionByCapability: new Map(),
        branchNames: new Set(),
      };
      sites.push(site);
    }
    site.capabilities.add(record.capability);
    if (record.branchName) site.branchNames.add(record.branchName);
  }
  if (sites.length !== config.supportProjection.expectedPhysicalSupportSiteCount) {
    throw new Error(`Expected ${config.supportProjection.expectedPhysicalSupportSiteCount} physical support sites, resolved ${sites.length}.`);
  }
  return sites;
}

function attachSitesToModel(sites, model) {
  for (const site of sites) {
    let nearest = null;
    for (const [nodeId, point] of model.nodes) {
      const residual = distance(site.coordinate, point);
      if (!nearest || residual < nearest.residual) nearest = { nodeId, residual };
    }
    site.nodeId = nearest.nodeId;
    site.nodeResidualMm = nearest.residual;
    const matchingRestraints = model.restraints.filter((row) => row.tag === site.baseTag
      && distance(row.sourceCoordinate, site.coordinate) <= 3);
    site.hostEdgeIds = matchingRestraints.map((row) => row.hostEdgeId);
  }
}

function assignSiteAxes(sites, model) {
  const edgeById = new Map(model.edges.map((edge) => [edge.id, edge]));
  for (const site of sites) {
    const candidateEdges = site.hostEdgeIds.map((id) => edgeById.get(id)).filter(Boolean);
    const incident = model.edgesByNode.get(site.nodeId) || [];
    const host = chooseHorizontalHost([...candidateEdges, ...incident]);
    const tangentAxis = Math.abs(host?.dxMm || 0) >= Math.abs(host?.dyMm || 0) ? 'X' : 'Y';
    for (const capability of site.capabilities) {
      if (capability === 'REST') site.directionByCapability.set(capability, 'Z');
      if (capability === 'LINESTOP') site.directionByCapability.set(capability, tangentAxis);
      if (capability === 'GUIDE') site.directionByCapability.set(capability, tangentAxis === 'X' ? 'Y' : 'X');
    }
  }
}

function assignSiteIds(sites) {
  const templates = buildAsciiTemplates();
  const unmatched = new Set(sites);
  for (const template of templates) {
    let nearest = null;
    for (const site of unmatched) {
      const x = (site.coordinate.x - 421773.221) / 1000;
      const y = (site.coordinate.y + 1163935.927) / 1000;
      const residual = Math.hypot(x - template.x, y - template.y, site.coordinate.z / 1000 - template.z);
      if (!nearest || residual < nearest.residual) nearest = { site, residual };
    }
    if (nearest) {
      nearest.site.siteId = template.id;
      unmatched.delete(nearest.site);
    }
  }
  let next = 1;
  for (const site of [...unmatched].sort((a, b) => a.sourceOrder - b.sourceOrder)) {
    while (sites.some((row) => row.siteId === `S${String(next).padStart(2, '0')}`)) next += 1;
    site.siteId = `S${String(next).padStart(2, '0')}`;
  }
}

function buildAsciiTemplates() {
  return [
    ['S01',0,22.58,1.184],['S02',0,20.95,1.184],['S03',0,22.81,1.184],
    ['S04',3,19.11,2.184],['S05',3,22.81,1.184],['S06',6,19.11,2.184],
    ['S07',6,22.81,1.184],['S08',8,22.81,1.184],['S09',9.028,22.811,1.184],
    ['S10',9,19.11,2.184],['S11',12,22.81,1.144],['S12',15,19.11,2.184],
    ['S13',18,22.81,1.144],['S14',15,18.36,2.184],['S15',15,16.31,2.184],
    ['S16',15.750,11.701,2.184],['S17',16,5.12,2.184],['S18',16,27.11,1.184],
    ['S19',16.250,23.865,1.184],['S20',18,4.01,1.157],['S21',16.915,28.861,1.184],
    ['S22',19,3.16,3.114],['S23',18.887,0,3.114],['S24',20,4.01,1.210],
    ['S25',21.2,2.85,3.210],['S26',21.2,0.226,3.210],['S27',21,28.861,1.184],
    ['S28',21.5,4.01,1.776],['S29',22.3,4.01,1.776],['S30',23,4.01,1.210],
    ['S31',23.742,32.411,1.184],['S32',23.742,29.71,1.184],['S33',23.8,3.16,3.210],
    ['S34',23.807,0,3.210],
  ].map(([id,x,y,z]) => ({ id,x,y,z }));
}

function calculateTributaryWeight(model, sites, sourceIndex, config) {
  const supportSites = sites.filter((site) => site.capabilities.has('REST'));
  const nodalWeightN = new Map([...model.nodes.keys()].map((id) => [id, 0]));
  const massByTreatmentKg = {};
  let totalMassKg = 0;
  for (const edge of model.edges) {
    const source = resolveSourceRecord(edge, sourceIndex);
    const { massKg, treatment } = elementMass(edge, source, config);
    totalMassKg += massKg;
    massByTreatmentKg[treatment] = (massByTreatmentKg[treatment] || 0) + massKg;
    const weightN = massKg * config.weight.gravityMPerS2;
    nodalWeightN.set(edge.fromNode, nodalWeightN.get(edge.fromNode) + weightN / 2);
    nodalWeightN.set(edge.toNode, nodalWeightN.get(edge.toNode) + weightN / 2);
  }
  const adjacency = buildAdjacency(model.edges);
  const distanceBySupport = new Map(supportSites.map((site) => [site.key, dijkstra(adjacency, site.nodeId)]));
  const reactionBySite = new Map(supportSites.map((site) => [site.key, 0]));
  for (const [nodeId, weightN] of nodalWeightN) {
    if (weightN === 0) continue;
    let minimum = Infinity;
    const owners = [];
    for (const site of supportSites) {
      const value = distanceBySupport.get(site.key).get(nodeId) ?? Infinity;
      if (value < minimum - 1e-9) {
        minimum = value;
        owners.length = 0;
        owners.push(site);
      } else if (Math.abs(value - minimum) <= 1e-9) owners.push(site);
    }
    if (!Number.isFinite(minimum) || owners.length === 0) throw new Error(`No connected vertical support found for node ${nodeId}.`);
    for (const owner of owners) reactionBySite.set(owner.key, reactionBySite.get(owner.key) + weightN / owners.length / 1000);
  }
  return {
    status: 'CALCULATED_CONFIGURABLE_SCREENING',
    totalMassKg,
    totalWeightN: totalMassKg * config.weight.gravityMPerS2,
    reactionBySite,
    massByTreatmentKg,
  };
}

function calculateThermalAxis(model, sites, sourceIndex, config, axis) {
  const axisKey = axis.toLowerCase();
  const constrainedSites = sites.filter((site) => [...site.directionByCapability.values()].includes(axis));
  const constrainedNodes = new Set(constrainedSites.map((site) => site.nodeId));
  const nodeIds = [...model.nodes.keys()];
  const nodeIndex = new Map(nodeIds.map((id, index) => [id, index]));
  const n = nodeIds.length;
  const K = Array.from({ length: n }, () => new Float64Array(n));
  const b = new Float64Array(n);
  const edgeEvidence = [];
  for (const edge of model.edges) {
    const i = nodeIndex.get(edge.fromNode);
    const j = nodeIndex.get(edge.toNode);
    const source = resolveSourceRecord(edge, sourceIndex);
    const section = sectionProperties(edge, source, config);
    const L = Math.max(edge.lengthM, 1e-9);
    const deltaAxisM = (edge[`${axisKey === 'x' ? 'dx' : 'dy'}Mm`] || 0) / 1000;
    const mu2 = Math.min(1, (deltaAxisM / L) ** 2);
    const multiplier = complianceMultiplier(edge.sourceType, config);
    const compliance = multiplier * (mu2 * L / (section.E * section.areaM2)
      + (1 - mu2) * L ** 3 / (config.compliance.C2E * section.E * section.inertiaM4));
    const stiffness = 1 / Math.max(compliance, 1e-18);
    const alpha = interpolateAlpha(edge.temperatureC, config.material.meanAlphaTablePerC);
    const thermalMovementM = alpha * (edge.temperatureC - config.material.referenceTemperatureC) * deltaAxisM;
    K[i][i] += stiffness;
    K[j][j] += stiffness;
    K[i][j] -= stiffness;
    K[j][i] -= stiffness;
    b[i] -= stiffness * thermalMovementM;
    b[j] += stiffness * thermalMovementM;
    edgeEvidence.push({ edgeId: edge.id, stiffness, thermalMovementM, alpha, temperatureC: edge.temperatureC });
  }
  const components = graphComponents(model.edges, nodeIds);
  const unconstrainedComponents = components.filter((component) => !component.some((nodeId) => constrainedNodes.has(nodeId)));
  if (unconstrainedComponents.length > 0) {
    return blockedThermal(axis, `Directional restraint matrix is singular: ${unconstrainedComponents.length} connected component(s) have no ${axis} restraint.`);
  }
  const free = nodeIds.filter((id) => !constrainedNodes.has(id));
  const freeIndex = new Map(free.map((id, index) => [id, index]));
  const A = Array.from({ length: free.length }, () => new Float64Array(free.length));
  const rhs = new Float64Array(free.length);
  for (const nodeId of free) {
    const row = freeIndex.get(nodeId);
    const i = nodeIndex.get(nodeId);
    rhs[row] = b[i];
    for (const otherId of free) A[row][freeIndex.get(otherId)] = K[i][nodeIndex.get(otherId)];
  }
  const solve = gaussianSolve(A, rhs);
  if (!solve.ok) return blockedThermal(axis, `Directional restraint matrix solve failed: ${solve.reason}`);
  const displacementM = new Float64Array(n);
  for (const nodeId of free) displacementM[nodeIndex.get(nodeId)] = solve.x[freeIndex.get(nodeId)];
  const reactionByNodeN = new Map();
  for (const nodeId of constrainedNodes) {
    const i = nodeIndex.get(nodeId);
    let value = -b[i];
    for (let j = 0; j < n; j += 1) value += K[i][j] * displacementM[j];
    reactionByNodeN.set(nodeId, value);
  }
  const reactionBySite = new Map();
  for (const [nodeId, reactionN] of reactionByNodeN) {
    const owners = constrainedSites.filter((site) => site.nodeId === nodeId);
    for (const owner of owners) reactionBySite.set(owner.key, (reactionBySite.get(owner.key) || 0) + reactionN / owners.length / 1000);
  }
  const displacementByNode = new Map(nodeIds.map((id) => [id, displacementM[nodeIndex.get(id)] * 1000]));
  const residual = matrixResidual(K, displacementM, b, constrainedNodes, nodeIds, nodeIndex);
  return {
    axis,
    status: 'CALCULATED_CONFIGURABLE_SCREENING',
    blockedReason: null,
    constrainedSiteCount: constrainedSites.length,
    constrainedNodeCount: constrainedNodes.size,
    reactionBySite,
    displacementByNode,
    reactionSumKn: sum([...reactionBySite.values()]),
    maxFreeResidualN: residual,
    pivotRatio: solve.pivotRatio,
    maxAbsReactionKn: Math.max(0, ...[...reactionBySite.values()].map(Math.abs)),
    maxAbsMovementMm: Math.max(0, ...[...displacementByNode.values()].map(Math.abs)),
    temperatureSummary: summarizeNumbers(edgeEvidence.map((row) => row.temperatureC)),
    alphaSummary: summarizeNumbers(edgeEvidence.map((row) => row.alpha)),
  };
}

function blockedThermal(axis, reason) {
  return {
    axis,
    status: 'BLOCKED_SINGULAR_DIRECTIONAL_SYSTEM',
    blockedReason: reason,
    constrainedSiteCount: 0,
    constrainedNodeCount: 0,
    reactionBySite: new Map(),
    displacementByNode: new Map(),
    reactionSumKn: 0,
    maxFreeResidualN: null,
    pivotRatio: null,
    maxAbsReactionKn: null,
    maxAbsMovementMm: null,
  };
}

function elementMass(edge, source, config) {
  const type = edge.sourceType;
  if (type === 'GASK') return { massKg: 0, treatment: 'GASKET_ZERO' };
  const section = sectionProperties(edge, source, config);
  const pipeMetalMass = section.areaM2 * edge.lengthM * section.densityKgM3;
  const insulationThicknessM = (source?.insulationThicknessMm || 0) / 1000;
  const outerM = section.odM;
  const insulationArea = Math.PI / 4 * ((outerM + 2 * insulationThicknessM) ** 2 - outerM ** 2);
  const insulationMass = insulationArea * edge.lengthM * config.weight.insulationDensityKgM3;
  const fluidArea = Math.PI / 4 * section.idM ** 2;
  const fluidMass = fluidArea * edge.lengthM * (edge.fluidDensityKgM3 || source?.fluidDensityKgM3 || 0);
  const availableComponentWeight = source?.componentWeightKg || 0;
  if (['FLAN', 'VALV', 'INST'].includes(type) && availableComponentWeight > 0) {
    return { massKg: availableComponentWeight + insulationMass + fluidMass, treatment: `${type}_SOURCE_WEIGHT` };
  }
  return {
    massKg: pipeMetalMass + insulationMass + fluidMass,
    treatment: ['TEE', 'OLET'].includes(type) ? `${type}_PIPE_EQUIVALENT` : `${type}_PIPE_SPAN`,
  };
}

function sectionProperties(edge, source, config) {
  const odMm = positive(edge.diameterMm) ? edge.diameterMm : source?.pipeOdMm;
  const wallMm = positive(edge.wallMm) ? edge.wallMm : source?.wallThicknessMm;
  if (!positive(odMm) || !positive(wallMm) || odMm <= 2 * wallMm) throw new Error(`Invalid section for ${edge.id}: OD=${odMm}, wall=${wallMm}`);
  const odM = odMm / 1000;
  const idM = (odMm - 2 * wallMm) / 1000;
  return {
    odM,
    idM,
    areaM2: Math.PI / 4 * (odM ** 2 - idM ** 2),
    inertiaM4: Math.PI / 64 * (odM ** 4 - idM ** 4),
    densityKgM3: source?.materialDensityKgM3 || config.weight.pipeMetalDensityKgM3,
    E: positive(edge.modulusPa) ? edge.modulusPa : config.material.elasticModulusPa,
  };
}

function resolveSourceRecord(edge, sourceIndex) {
  for (const key of nameKeys(edge.name)) {
    const record = sourceIndex.byName.get(key);
    if (record) return record;
  }
  return null;
}

function complianceMultiplier(type, config) {
  const key = String(type || 'PIPE').toLowerCase();
  return config.compliance[`${key}Multiplier`] ?? config.compliance.pipeMultiplier;
}

function interpolateAlpha(temperatureC, table) {
  const rows = [...table].sort((a, b) => a.temperatureC - b.temperatureC);
  if (temperatureC <= rows[0].temperatureC) return rows[0].alpha;
  if (temperatureC >= rows.at(-1).temperatureC) return rows.at(-1).alpha;
  for (let index = 1; index < rows.length; index += 1) {
    if (temperatureC <= rows[index].temperatureC) {
      const a = rows[index - 1];
      const b = rows[index];
      const ratio = (temperatureC - a.temperatureC) / (b.temperatureC - a.temperatureC);
      return a.alpha + ratio * (b.alpha - a.alpha);
    }
  }
  return rows.at(-1).alpha;
}

function gaussianSolve(matrix, vector) {
  const n = vector.length;
  if (n === 0) return { ok: true, x: new Float64Array(0), pivotRatio: 1 };
  const A = matrix.map((row) => Float64Array.from(row));
  const b = Float64Array.from(vector);
  let maxPivot = 0;
  let minPivot = Infinity;
  for (let column = 0; column < n; column += 1) {
    let pivotRow = column;
    let pivotAbs = Math.abs(A[column][column]);
    for (let row = column + 1; row < n; row += 1) {
      const value = Math.abs(A[row][column]);
      if (value > pivotAbs) { pivotAbs = value; pivotRow = row; }
    }
    if (!Number.isFinite(pivotAbs) || pivotAbs < 1e-12) return { ok: false, reason: `zero pivot at column ${column}` };
    if (pivotRow !== column) {
      [A[column], A[pivotRow]] = [A[pivotRow], A[column]];
      [b[column], b[pivotRow]] = [b[pivotRow], b[column]];
    }
    maxPivot = Math.max(maxPivot, pivotAbs);
    minPivot = Math.min(minPivot, pivotAbs);
    const pivot = A[column][column];
    for (let row = column + 1; row < n; row += 1) {
      const factor = A[row][column] / pivot;
      if (factor === 0) continue;
      A[row][column] = 0;
      for (let col = column + 1; col < n; col += 1) A[row][col] -= factor * A[column][col];
      b[row] -= factor * b[column];
    }
  }
  const x = new Float64Array(n);
  for (let row = n - 1; row >= 0; row -= 1) {
    let value = b[row];
    for (let col = row + 1; col < n; col += 1) value -= A[row][col] * x[col];
    x[row] = value / A[row][row];
  }
  return { ok: true, x, pivotRatio: minPivot / maxPivot };
}

function matrixResidual(K, u, b, constrainedNodes, nodeIds, nodeIndex) {
  let maximum = 0;
  for (const nodeId of nodeIds) {
    if (constrainedNodes.has(nodeId)) continue;
    const i = nodeIndex.get(nodeId);
    let residual = -b[i];
    for (let j = 0; j < u.length; j += 1) residual += K[i][j] * u[j];
    maximum = Math.max(maximum, Math.abs(residual));
  }
  return maximum;
}

function graphComponents(edges, nodeIds) {
  const adjacency = new Map(nodeIds.map((id) => [id, []]));
  for (const edge of edges) {
    adjacency.get(edge.fromNode).push(edge.toNode);
    adjacency.get(edge.toNode).push(edge.fromNode);
  }
  const remaining = new Set(nodeIds);
  const components = [];
  while (remaining.size) {
    const start = remaining.values().next().value;
    const stack = [start];
    const component = [];
    remaining.delete(start);
    while (stack.length) {
      const node = stack.pop();
      component.push(node);
      for (const neighbor of adjacency.get(node)) if (remaining.delete(neighbor)) stack.push(neighbor);
    }
    components.push(component);
  }
  return components;
}

function buildAdjacency(edges) {
  const adjacency = new Map();
  for (const edge of edges) {
    if (!adjacency.has(edge.fromNode)) adjacency.set(edge.fromNode, []);
    if (!adjacency.has(edge.toNode)) adjacency.set(edge.toNode, []);
    adjacency.get(edge.fromNode).push({ nodeId: edge.toNode, distance: edge.lengthM });
    adjacency.get(edge.toNode).push({ nodeId: edge.fromNode, distance: edge.lengthM });
  }
  return adjacency;
}

function dijkstra(adjacency, start) {
  const distances = new Map([...adjacency.keys()].map((id) => [id, Infinity]));
  distances.set(start, 0);
  const pending = new Set(adjacency.keys());
  while (pending.size) {
    let current = null;
    let currentDistance = Infinity;
    for (const nodeId of pending) {
      const distanceValue = distances.get(nodeId);
      if (distanceValue < currentDistance) { current = nodeId; currentDistance = distanceValue; }
    }
    if (current == null) break;
    pending.delete(current);
    for (const edge of adjacency.get(current) || []) {
      const candidate = currentDistance + edge.distance;
      if (candidate < distances.get(edge.nodeId)) distances.set(edge.nodeId, candidate);
    }
  }
  return distances;
}

function thermalSummary(result) {
  return {
    status: result.status,
    blockedReason: result.blockedReason,
    constrainedSiteCount: result.constrainedSiteCount,
    constrainedNodeCount: result.constrainedNodeCount,
    reactionSumKn: result.reactionSumKn == null ? null : round(result.reactionSumKn, 9),
    maxAbsReactionKn: result.maxAbsReactionKn == null ? null : round(result.maxAbsReactionKn, 6),
    maxAbsMovementMm: result.maxAbsMovementMm == null ? null : round(result.maxAbsMovementMm, 6),
    maxFreeResidualN: result.maxFreeResidualN == null ? null : round(result.maxFreeResidualN, 6),
    pivotRatio: result.pivotRatio == null ? null : result.pivotRatio,
    temperatureSummary: result.temperatureSummary,
    alphaSummary: result.alphaSummary,
  };
}

function chooseHorizontalHost(edges) {
  return edges.filter(Boolean).sort((a, b) => Math.hypot(b.dxMm, b.dyMm) - Math.hypot(a.dxMm, a.dyMm))[0] || null;
}
function parseAttrs(text) {
  const attrs = {};
  const pattern = /([A-Za-z0-9_:.-]+)="([^"]*)"/g;
  let match;
  while ((match = pattern.exec(text))) attrs[match[1]] = decodeXml(match[2]);
  return attrs;
}
function decodeXml(value) { return String(value).replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'); }
function cleanNode(value) { return String(Math.round(number(value))); }
function normalizeFluidDensity(value) { return value < 20 ? value * 1000 : value; }
function isSentinel(value, config) { return config.processResolution.sentinelValues.some((item) => Math.abs(value - item) <= config.processResolution.sentinelTolerance); }
function baseSupportTag(value) { return String(value || '').replace(/^SUPPORT\s+/i, '').replace(/\/SREF.*$/i, '').trim(); }
function nameKeys(name, alternate = '') { return [...new Set([name, alternate, String(name).replace(/^[A-Z]+\s+/i, ''), String(alternate).replace(/^[A-Z]+\s+/i, '')].filter(Boolean).map((value) => String(value).trim().toUpperCase()))]; }
function firstPoint(...values) { return values.find((value) => value && Number.isFinite(Number(value.x)) && Number.isFinite(Number(value.y)) && Number.isFinite(Number(value.z))) || null; }
function parseEngineeringNumber(value) { const match = String(value ?? '').match(/[-+]?\d+(?:\.\d+)?/); return match ? Number(match[0]) : null; }
function firstPositive(values) { for (const value of values) { const numberValue = finiteOrNull(value); if (positive(numberValue)) return numberValue; } return 0; }
function finiteOrNull(value) { const result = Number(value); return Number.isFinite(result) ? result : null; }
function positive(value) { return Number.isFinite(Number(value)) && Number(value) > 0; }
function number(value) { const result = Number(value); return Number.isFinite(result) ? result : 0; }
function distance(a, b) { return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z); }
function sha256(value) { return createHash('sha256').update(value).digest('hex'); }
function round(value, decimals = 3) { if (!Number.isFinite(value)) return value; const factor = 10 ** decimals; return Math.round((value + Number.EPSILON) * factor) / factor; }
function roundPoint(point, decimals) { return { x: round(point.x, decimals), y: round(point.y, decimals), z: round(point.z, decimals) }; }
function sum(values) { return values.reduce((total, value) => total + value, 0); }
function mapValues(object, transform) { return Object.fromEntries(Object.entries(object).map(([key, value]) => [key, transform(value)])); }
function countBy(rows, keyOf) { const result = {}; for (const row of rows) { const key = String(keyOf(row)); result[key] = (result[key] || 0) + 1; } return result; }
function groupBy(rows, keyOf) { const result = new Map(); for (const row of rows) { const key = keyOf(row); if (!result.has(key)) result.set(key, []); result.get(key).push(row); } return result; }
function summarizeNumbers(values) { const finite = values.filter(Number.isFinite); return finite.length ? { count: finite.length, min: Math.min(...finite), max: Math.max(...finite), unique: [...new Set(finite.map((value) => round(value, 9)))].sort((a, b) => a - b) } : { count: 0, min: null, max: null, unique: [] }; }
