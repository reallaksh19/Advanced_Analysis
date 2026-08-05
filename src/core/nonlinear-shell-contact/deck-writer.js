import {
  canonicalJson,
  deepFreeze,
  semanticHash,
  sha256Bytes,
} from './contracts.js';
import { validateCanonicalNonlinearShellContactModel } from './canonical-model.js';
import { validateDeckProfile } from './deck-profile.js';
import {
  RIGID_SURFACE_FACETING_PROFILE,
  createDeterministicRigidSurfaceMesh,
} from './rigid-surface-mesher.js';

const RIGID_CARRIER_PROFILE = 'DIRECTLY_PRESCRIBED_SHELL_CARRIER_V1';
const RIGID_CARRIER_THICKNESS = 1;

export function writeDeterministicSolverDeck(canonicalModel, deckProfile) {
  validateCanonicalNonlinearShellContactModel(canonicalModel);
  validateDeckProfile(deckProfile);
  if (deckProfile.solverId !== 'CALCULIX_CCX_2_22_PROVISIONAL') {
    throw new TypeError('Deck profile is not bound to the provisional CalculiX 2.22 identity.');
  }

  const nodeMap = Object.fromEntries(
    canonicalModel.nodes.map((node, index) => [node.nodeId, index + 1]),
  );
  const elementMap = Object.fromEntries(
    canonicalModel.shellElements.map((element, index) => [element.elementId, index + 1]),
  );
  const surfaceMap = Object.fromEntries(
    canonicalModel.surfaceDefinitions.map((surface) => [
      surface.surfaceId,
      solverToken('SURF', surface.surfaceId),
    ]),
  );
  const contactMap = Object.fromEntries(
    canonicalModel.contactPairs.map((pair) => [
      pair.contactPairId,
      solverToken('CP', pair.contactPairId),
    ]),
  );
  const loadStepMap = Object.fromEntries(
    canonicalModel.loadSteps.map((step, index) => [step.stepId, index + 1]),
  );

  const lines = [
    '** LAFEA-NC NC-00 deterministic external-solver deck',
    `** canonicalModelHash=${canonicalModel.canonicalModelSemanticHash}`,
    `** deckProfileHash=${deckProfile.deckProfileSemanticHash}`,
    `** rigidGeometryProfile=${RIGID_SURFACE_FACETING_PROFILE.profileId}`,
    '** MECHANICS NOT QUALIFIED BY NC-00',
    '*HEADING',
    canonicalModel.modelId,
    '*NODE',
  ];

  canonicalModel.nodes.forEach((node) => {
    lines.push([
      nodeMap[node.nodeId],
      formatNumber(node.x),
      formatNumber(node.y),
      formatNumber(node.z),
    ].join(', '));
  });

  const solverElement = deckProfile.elementMappings.find(
    (mapping) => mapping.canonicalElementProfile === 'SHELL_Q4_EXTERNAL_KERNEL_V1',
  )?.solverElementIdentity;
  if (!solverElement) throw new TypeError('Missing canonical shell element mapping.');
  lines.push(`*ELEMENT, TYPE=${solverElement}, ELSET=LAFEA_SHELL_ALL`);
  canonicalModel.shellElements.forEach((element) => {
    lines.push([
      elementMap[element.elementId],
      ...element.nodeIds.map((nodeId) => nodeMap[nodeId]),
    ].join(', '));
  });

  canonicalModel.materials.forEach((material) => {
    const materialName = solverToken('MAT', material.materialId);
    lines.push(`*MATERIAL, NAME=${materialName}`);
    lines.push('*ELASTIC');
    lines.push(`${formatNumber(material.youngsModulus)}, ${formatNumber(material.poissonRatio)}`);
    if (material.density > 0) {
      lines.push('*DENSITY');
      lines.push(formatNumber(material.density));
    }
  });

  canonicalModel.shellSections.forEach((section) => {
    const material = canonicalModel.materials.find(
      (candidate) => candidate.materialId === section.materialId,
    );
    const elementIds = canonicalModel.shellElements
      .filter((element) => element.sectionId === section.sectionId)
      .map((element) => elementMap[element.elementId]);
    const setName = solverToken('SEC', section.sectionId);
    lines.push(`*ELSET, ELSET=${setName}`);
    appendCommaRows(lines, elementIds);
    lines.push(
      `*SHELL SECTION, ELSET=${setName}, MATERIAL=${solverToken('MAT', material.materialId)}`,
    );
    lines.push(formatNumber(section.thickness));
  });

  canonicalModel.constraints.forEach((constraint) => {
    lines.push(`** constraint=${constraint.constraintId}`);
    constraint.dofs.forEach((dof, index) => {
      lines.push('*BOUNDARY');
      const solverDof = dofNumber(dof);
      lines.push(
        `${nodeMap[constraint.nodeId]}, ${solverDof}, ${solverDof}, ${formatNumber(constraint.values[index])}`,
      );
    });
  });

  const rigidMaps = appendRigidSurfaceDefinitions(
    lines,
    canonicalModel,
    nodeMap,
    elementMap,
  );

  canonicalModel.surfaceDefinitions.forEach((surface) => {
    lines.push(`*SURFACE, NAME=${surfaceMap[surface.surfaceId]}, TYPE=ELEMENT`);
    surface.elementFaces.forEach((face) => {
      lines.push(`${elementMap[face.elementId]}, ${face.face}`);
    });
  });

  canonicalModel.contactPairs.forEach((pair) => {
    const interaction = `${contactMap[pair.contactPairId]}_INT`;
    lines.push(`*SURFACE INTERACTION, NAME=${interaction}`);
    lines.push('*SURFACE BEHAVIOR, PRESSURE-OVERCLOSURE=HARD');
    lines.push(`*CONTACT PAIR, INTERACTION=${interaction}, TYPE=SURFACE TO SURFACE`);
    lines.push(
      `${surfaceMap[pair.deformableSurfaceId]}, ${rigidMaps.surfaceMap[pair.rigidSurfaceId]}`,
    );
  });

  const outputRequestMap = {};
  canonicalModel.loadSteps.forEach((step) => {
    lines.push(`*STEP, NAME=${solverToken('STEP', step.stepId)}, NLGEOM`);
    lines.push('*STATIC');
    lines.push([
      formatNumber(step.initialIncrement),
      formatNumber(step.targetTime),
      formatNumber(step.minimumIncrement),
      formatNumber(step.maximumIncrement),
    ].join(', '));
    step.loads.forEach((load) => appendLoad(lines, load, nodeMap, surfaceMap));
    step.prescribedMotions.forEach((motion) => {
      appendMotion(lines, motion, nodeMap, rigidMaps.motionNodeMap);
    });
    outputRequestMap[step.stepId] = appendOutputRequests(
      lines,
      [...new Set([...canonicalModel.requestedOutputs, ...step.outputRequests])],
      canonicalModel.contactPairs,
      surfaceMap,
      rigidMaps.surfaceMap,
    );
    lines.push('*END STEP');
  });

  const deckText = `${lines.join('\n')}\n`;
  if (deckText.includes('\r') || deckText.includes('\ufeff')) {
    throw new TypeError('Deck violates UTF-8/LF deterministic profile.');
  }
  if (/\*INCLUDE/iu.test(deckText)) throw new TypeError('Include files are prohibited.');

  const maps = {
    nodeMap,
    elementMap,
    surfaceMap,
    contactMap,
    loadStepMap,
    rigidReferenceNodeMap: rigidMaps.referenceNodeMap,
    rigidMotionNodeMap: rigidMaps.motionNodeMap,
    rigidGeometryMap: rigidMaps.geometryMap,
    outputRequestMap,
  };
  const hashes = {
    deckSha256: sha256Bytes(Buffer.from(deckText, 'utf8')),
    nodeMapHash: semanticHash(nodeMap),
    elementMapHash: semanticHash(elementMap),
    surfaceMapHash: semanticHash(surfaceMap),
    contactMapHash: semanticHash(contactMap),
    loadStepMapHash: semanticHash(loadStepMap),
    rigidMotionNodeMapHash: semanticHash(rigidMaps.motionNodeMap),
    rigidGeometryMapHash: semanticHash(rigidMaps.geometryMap),
    outputRequestMapHash: semanticHash(outputRequestMap),
  };
  const deckSemanticHash = semanticHash({
    canonicalModelHash: canonicalModel.canonicalModelSemanticHash,
    deckProfileHash: deckProfile.deckProfileSemanticHash,
    rigidGeometryProfile: RIGID_SURFACE_FACETING_PROFILE,
    maps,
    hashes,
  });

  return deepFreeze({
    fileName: deckProfile.fileNames.input,
    mediaType: 'text/plain; charset=utf-8',
    deckText,
    ...hashes,
    deckSemanticHash,
    maps,
  });
}

export function formatNumber(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError('Deck numbers must be finite.');
  }
  const normalized = Object.is(value, -0) ? 0 : value;
  const [mantissa, exponent] = normalized.toExponential(14).split('e');
  const exponentNumber = Number(exponent);
  if (Math.abs(exponentNumber) > 99) {
    throw new TypeError('Deck number exponent exceeds the CalculiX field-20 profile.');
  }
  const sign = exponentNumber >= 0 ? '+' : '-';
  return `${mantissa}E${sign}${String(Math.abs(exponentNumber)).padStart(2, '0')}`;
}

function appendRigidSurfaceDefinitions(lines, model, nodeMap, elementMap) {
  const surfaceMap = {};
  const referenceNodeMap = {};
  const motionNodeMap = {};
  const geometryMap = {};
  let nextNode = Math.max(0, ...Object.values(nodeMap)) + 1;
  let nextElement = Math.max(0, ...Object.values(elementMap)) + 1;
  const carrierMaterial = model.materials[0];
  if (model.rigidSurfaces.length && !carrierMaterial) {
    throw new TypeError('Rigid surface carrier elements require one governed material.');
  }

  model.rigidSurfaces.forEach((surface) => {
    const mesh = createDeterministicRigidSurfaceMesh(surface, {
      firstNodeId: nextNode,
      firstElementId: nextElement,
    });
    nextNode = mesh.nextNodeId;
    nextElement = mesh.nextElementId;
    const elementSet = solverToken('RIGEL', surface.rigidSurfaceId);
    const rigidSurfaceName = solverToken('RIGSURF', surface.rigidSurfaceId);
    const prescribedNodeIds = [
      ...mesh.nodes.map((node) => node.id),
      mesh.referenceNode.id,
    ];

    lines.push(`** generated rigid surface=${surface.rigidSurfaceId}`);
    lines.push(`** generated rigid surface type=${surface.surfaceType}`);
    lines.push(`** generated rigid geometry hash=${mesh.geometrySemanticHash}`);
    lines.push(`** generated rigid carrier profile=${RIGID_CARRIER_PROFILE}`);
    lines.push('*NODE');
    mesh.nodes.forEach((node) => {
      lines.push(`${node.id}, ${node.coordinates.map(formatNumber).join(', ')}`);
    });
    lines.push(`${mesh.referenceNode.id}, ${mesh.referenceNode.coordinates.map(formatNumber).join(', ')}`);

    ['S3', 'S4'].forEach((type) => {
      const rows = mesh.elements.filter((element) => element.type === type);
      if (!rows.length) return;
      lines.push(`*ELEMENT, TYPE=${type}, ELSET=${elementSet}`);
      rows.forEach((element) => lines.push(`${element.id}, ${element.nodeIds.join(', ')}`));
    });
    lines.push(
      `*SHELL SECTION, ELSET=${elementSet}, MATERIAL=${solverToken('MAT', carrierMaterial.materialId)}`,
    );
    lines.push(formatNumber(RIGID_CARRIER_THICKNESS));
    lines.push(`*SURFACE, NAME=${rigidSurfaceName}, TYPE=ELEMENT`);
    mesh.elements.forEach((element) => lines.push(`${element.id}, ${mesh.contactFaceLabel}`));
    lines.push('*BOUNDARY');
    prescribedNodeIds.forEach((nodeId) => {
      lines.push(`${nodeId}, 1, 3, ${formatNumber(0)}`);
    });

    surfaceMap[surface.rigidSurfaceId] = rigidSurfaceName;
    referenceNodeMap[surface.rigidSurfaceId] = mesh.referenceNode.id;
    motionNodeMap[surface.rigidSurfaceId] = prescribedNodeIds;
    geometryMap[surface.rigidSurfaceId] = {
      surfaceType: surface.surfaceType,
      geometryProfileId: mesh.geometryProfileId,
      geometrySemanticHash: mesh.geometrySemanticHash,
      geometryStatistics: mesh.geometryStatistics,
      carrierProfile: RIGID_CARRIER_PROFILE,
      carrierThickness: RIGID_CARRIER_THICKNESS,
      carrierMaterialId: carrierMaterial.materialId,
    };
  });
  return { surfaceMap, referenceNodeMap, motionNodeMap, geometryMap };
}

function appendLoad(lines, load, nodeMap, surfaceMap) {
  if (load.loadType === 'NODAL_FORCE') {
    const components = load.components.map((component) => component * load.magnitude);
    components.forEach((component, index) => {
      if (component === 0) return;
      lines.push('*CLOAD');
      lines.push(`${nodeMap[load.targetId]}, ${index + 1}, ${formatNumber(component)}`);
    });
    return;
  }
  if (load.loadType === 'PRESSURE') {
    lines.push(`** pressure load ${load.loadId} on ${surfaceMap[load.targetId]}`);
    lines.push('*DSLOAD');
    lines.push(`${surfaceMap[load.targetId]}, P, ${formatNumber(load.magnitude)}`);
    return;
  }
  throw new TypeError(`Unsupported deck load type ${load.loadType}.`);
}

function appendMotion(lines, motion, nodeMap, rigidMotionNodeMap) {
  const targets = motion.targetType === 'NODE'
    ? [nodeMap[motion.targetId]]
    : rigidMotionNodeMap[motion.targetId];
  if (!Array.isArray(targets) || targets.some((target) => !target)) {
    throw new TypeError(`Motion target ${motion.targetId} has no solver mapping.`);
  }
  const dof = dofNumber(motion.dof);
  lines.push('*BOUNDARY');
  targets.forEach((target) => {
    lines.push(`${target}, ${dof}, ${dof}, ${formatNumber(motion.value)}`);
  });
}

function appendOutputRequests(lines, outputs, contactPairs, surfaceMap, rigidSurfaceMap) {
  const requested = new Set(outputs);
  const emitted = new Set();
  const unmapped = new Set();
  const nodeFields = [];
  if (requested.has('NODAL_DISPLACEMENT')) {
    nodeFields.push('U'); emitted.add('NODAL_DISPLACEMENT');
  }
  if (requested.has('NODAL_REACTION')) {
    nodeFields.push('RF'); emitted.add('NODAL_REACTION');
  }
  if (nodeFields.length) {
    lines.push('*NODE FILE');
    lines.push(nodeFields.join(', '));
  }
  const elementFields = [];
  if (requested.has('SHELL_STRESS')) {
    elementFields.push('S'); emitted.add('SHELL_STRESS');
  }
  if (requested.has('SHELL_STRAIN')) {
    elementFields.push('E'); emitted.add('SHELL_STRAIN');
  }
  if (requested.has('TOTAL_STRAIN_ENERGY')) {
    elementFields.push('ENER'); emitted.add('TOTAL_STRAIN_ENERGY');
  }
  if (elementFields.length) {
    lines.push('*EL FILE');
    lines.push(elementFields.join(', '));
  }

  const contactFileRequested = ['CONTACT_PRESSURE', 'CONTACT_OPENING']
    .some((value) => requested.has(value));
  if (contactFileRequested) {
    lines.push('*CONTACT FILE');
    lines.push('CDIS, CSTR, CELS');
    if (requested.has('CONTACT_PRESSURE')) emitted.add('CONTACT_PRESSURE');
    if (requested.has('CONTACT_OPENING')) emitted.add('CONTACT_OPENING');
  }
  const integratedContactRequested = ['CONTACT_NORMAL_FORCE', 'CONTACT_AREA']
    .some((value) => requested.has(value));
  if (integratedContactRequested) {
    lines.push('*CONTACT PRINT');
    lines.push('CNUM');
    contactPairs.forEach((pair) => {
      lines.push(
        `*CONTACT PRINT, SLAVE=${surfaceMap[pair.deformableSurfaceId]}, MASTER=${rigidSurfaceMap[pair.rigidSurfaceId]}`,
      );
      lines.push('CF, CFN');
    });
    if (requested.has('CONTACT_NORMAL_FORCE')) emitted.add('CONTACT_NORMAL_FORCE');
    if (requested.has('CONTACT_AREA')) emitted.add('CONTACT_AREA');
  }

  ['SHELL_SECTION_FORCE', 'EXTERNAL_WORK'].forEach((value) => {
    if (requested.has(value)) {
      unmapped.add(value);
      lines.push(`** NC00_UNMAPPED_OUTPUT=${value}`);
    }
  });
  return {
    requested: [...requested].sort(),
    emitted: [...emitted].sort(),
    unmapped: [...unmapped].sort(),
  };
}

function solverToken(prefix, governedId) {
  const clean = governedId.toUpperCase().replace(/[^A-Z0-9_]/gu, '_').slice(0, 48);
  const suffix = semanticHash(governedId).slice(-8).toUpperCase();
  return `${prefix}_${clean}_${suffix}`;
}

function dofNumber(dof) {
  const mapping = { UX: 1, UY: 2, UZ: 3, RX: 4, RY: 5, RZ: 6 };
  if (!mapping[dof]) throw new TypeError(`Unknown DOF ${dof}.`);
  return mapping[dof];
}

function appendCommaRows(lines, ids, rowLength = 16) {
  for (let index = 0; index < ids.length; index += rowLength) {
    lines.push(ids.slice(index, index + rowLength).join(', '));
  }
}

export function canonicalDeckArtifactBytes(artifact) {
  return Buffer.from(canonicalJson({
    fileName: artifact.fileName,
    deckText: artifact.deckText,
    maps: artifact.maps,
  }), 'utf8');
}
