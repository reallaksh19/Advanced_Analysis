from pathlib import Path

ROOT = Path('.')

def replace_once(path, old, new):
    p = ROOT / path
    text = p.read_text()
    if old not in text:
        raise SystemExit(f'missing patch anchor in {path}: {old[:140]!r}')
    if text.count(old) != 1:
        raise SystemExit(f'non-unique patch anchor in {path}: {text.count(old)}')
    p.write_text(text.replace(old, new))

replace_once(
    'src/workspace/topology-edit/authoring/topology-edit-authoring-session.js',
    "  BRANCH: {\n    label: 'Branch',\n    targetKinds: ['straight-edge'],\n    fields: [\n      numberField('stationMm', 'Host station', 'mm', null, { positive: true }),\n      enumField('junctionType', 'Junction', ['TEE', 'OLET'], 'TEE'),\n      numberField('branchNominalSizeMm', 'Branch size', 'mm', 50, { positive: true }),\n      numberField('branchAngleDeg', 'Branch angle', 'deg', 90, { positive: true }),\n      numberField('branchLengthMm', 'Branch length', 'mm', null, { positive: true }),\n      numberField('directionX', 'Direction X', null, 0),\n      numberField('directionY', 'Direction Y', null, 1),\n      numberField('directionZ', 'Direction Z', null, 0),\n      textField('pipingClass', 'Piping class'),\n      numberField('componentMassKg', 'Junction weight', 'kg', null, { positive: true, authority: 'CATALOGUE' }),\n    ],\n  },",
    "  BRANCH: {\n    label: 'Tee / Olet branch',\n    targetKinds: ['straight-edge'],\n    fields: [\n      numberField('stationMm', 'Host station', 'mm', null, { positive: true }),\n      textField('catalogueRecordId', 'Catalogue record'),\n      numberField('clockingDeg', 'Clocking', 'deg', 0),\n      numberField('branchPipeLengthMm', 'Branch pipe length', 'mm', 400, { positive: true }),\n      enumField('branchFamily', 'Branch family', ['TEE', 'OLET'], 'TEE', { authority: 'CATALOGUE' }),\n      numberField('branchNominalSizeMm', 'Branch size', 'mm', null, { positive: true, authority: 'CATALOGUE' }),\n      numberField('branchOutsideDiameterMm', 'Branch outside diameter', 'mm', null, { positive: true, authority: 'CATALOGUE' }),\n      numberField('branchAngleDeg', 'Branch angle', 'deg', null, { positive: true, authority: 'CATALOGUE' }),\n      textField('pressureClass', 'Rating', { authority: 'CATALOGUE' }),\n      textField('materialSpecification', 'Material specification', { authority: 'CATALOGUE' }),\n      textField('branchConnection', 'Branch connection', { authority: 'CATALOGUE' }),\n      numberField('componentLengthMm', 'Component projection', 'mm', null, { positive: true, authority: 'CATALOGUE' }),\n      numberField('componentMassKg', 'Junction weight', 'kg', null, { positive: true, authority: 'CATALOGUE' }),\n      numberField('totalBranchReachMm', 'Total branch reach', 'mm', null, { positive: true, authority: 'DERIVED' }),\n    ],\n  },",
)

replace_once(
    'src/workspace/topology-edit/authoring/topology-edit-authoring-operation-planner.js',
    "import {\n  deriveTopologyEditValveAssemblyTarget,\n  planTopologyEditValveAssemblyAuthoringOperation,\n  topologyEditValveAssemblyDefaultProperties,\n} from './topology-edit-authoring-valve-assembly.js';\n",
    "import {\n  deriveTopologyEditValveAssemblyTarget,\n  planTopologyEditValveAssemblyAuthoringOperation,\n  topologyEditValveAssemblyDefaultProperties,\n} from './topology-edit-authoring-valve-assembly.js';\nimport {\n  deriveTopologyEditBranchAuthoringTarget,\n  planTopologyEditBranchAuthoringOperation,\n  topologyEditBranchAuthoringDefaultProperties,\n} from './topology-edit-authoring-branch.js';\n",
)
replace_once(
    'src/workspace/topology-edit/authoring/topology-edit-authoring-operation-planner.js',
    "  if (session.tool === 'VALVE_ASSEMBLY') {\n    return planTopologyEditValveAssemblyAuthoringOperation({\n      topology,\n      authoringSession: session,\n      catalogue: input.catalogue,\n    });\n  }\n",
    "  if (session.tool === 'VALVE_ASSEMBLY') {\n    return planTopologyEditValveAssemblyAuthoringOperation({\n      topology,\n      authoringSession: session,\n      catalogue: input.catalogue,\n    });\n  }\n  if (session.tool === 'BRANCH') {\n    return planTopologyEditBranchAuthoringOperation({\n      topology,\n      authoringSession: session,\n      catalogue: input.catalogue,\n    });\n  }\n",
)
replace_once(
    'src/workspace/topology-edit/authoring/topology-edit-authoring-operation-planner.js',
    "  if (tool === 'VALVE_ASSEMBLY') {\n    return deriveTopologyEditValveAssemblyTarget({\n      topology,\n      edgeId: input.edgeId,\n    });\n  }\n",
    "  if (tool === 'VALVE_ASSEMBLY') {\n    return deriveTopologyEditValveAssemblyTarget({\n      topology,\n      edgeId: input.edgeId,\n    });\n  }\n  if (tool === 'BRANCH') {\n    return deriveTopologyEditBranchAuthoringTarget({\n      topology,\n      edgeId: input.edgeId,\n    });\n  }\n",
)
replace_once(
    'src/workspace/topology-edit/authoring/topology-edit-authoring-operation-planner.js',
    "  if (session.tool === 'VALVE_ASSEMBLY') {\n    return topologyEditValveAssemblyDefaultProperties({\n      topology,\n      authoringSession: session,\n      catalogue: input.catalogue,\n      valveRecordId: input.valveRecordId,\n      upstreamFlangeRecordId: input.upstreamFlangeRecordId,\n      downstreamFlangeRecordId: input.downstreamFlangeRecordId,\n      stationMm: input.stationMm,\n    });\n  }\n",
    "  if (session.tool === 'VALVE_ASSEMBLY') {\n    return topologyEditValveAssemblyDefaultProperties({\n      topology,\n      authoringSession: session,\n      catalogue: input.catalogue,\n      valveRecordId: input.valveRecordId,\n      upstreamFlangeRecordId: input.upstreamFlangeRecordId,\n      downstreamFlangeRecordId: input.downstreamFlangeRecordId,\n      stationMm: input.stationMm,\n    });\n  }\n  if (session.tool === 'BRANCH') {\n    return topologyEditBranchAuthoringDefaultProperties({\n      topology,\n      authoringSession: session,\n      catalogue: input.catalogue,\n      catalogueRecordId: input.catalogueRecordId,\n      stationMm: input.stationMm,\n      clockingDeg: input.clockingDeg,\n      branchPipeLengthMm: input.branchPipeLengthMm,\n    });\n  }\n",
)

replace_once(
    'src/workspace/viewport-productivity/topology-edit-component-authoring-runtime.js',
    "import {\n  topologyEditValveAssemblyCatalogueOptions,\n} from '../topology-edit/authoring/topology-edit-authoring-valve-assembly.js';\n",
    "import {\n  topologyEditValveAssemblyCatalogueOptions,\n} from '../topology-edit/authoring/topology-edit-authoring-valve-assembly.js';\nimport {\n  topologyEditBranchAuthoringCatalogueOptions,\n} from '../topology-edit/authoring/topology-edit-authoring-branch.js';\n",
)
replace_once(
    'src/workspace/viewport-productivity/topology-edit-component-authoring-runtime.js',
    "const COMPONENT_TOOLS = new Set(['FLANGE', 'REDUCER', 'VALVE_ASSEMBLY']);",
    "const COMPONENT_TOOLS = new Set(['FLANGE', 'REDUCER', 'VALVE_ASSEMBLY', 'BRANCH']);",
)
replace_once(
    'src/workspace/viewport-productivity/topology-edit-component-authoring-runtime.js',
    "  { id: 'REDUCER', label: 'Reducer' },\n]);",
    "  { id: 'REDUCER', label: 'Reducer' },\n  { id: 'BRANCH', label: 'Tee / Olet branch' },\n]);",
)
replace_once(
    'src/workspace/viewport-productivity/topology-edit-component-authoring-runtime.js',
    "  VALVE_ASSEMBLY: new Set([\n    'stationMm',\n    'valveRecordId',\n    'upstreamFlangeRecordId',\n    'downstreamFlangeRecordId',\n  ]),\n});",
    "  VALVE_ASSEMBLY: new Set([\n    'stationMm',\n    'valveRecordId',\n    'upstreamFlangeRecordId',\n    'downstreamFlangeRecordId',\n  ]),\n  BRANCH: new Set([\n    'stationMm',\n    'catalogueRecordId',\n    'clockingDeg',\n    'branchPipeLengthMm',\n  ]),\n});",
)
replace_once(
    'src/workspace/viewport-productivity/topology-edit-component-authoring-runtime.js',
    "    if (this.state.tool === 'VALVE_ASSEMBLY') this.renderAssemblySelectors();\n    else this.renderInlineCatalogueSelector();",
    "    if (this.state.tool === 'VALVE_ASSEMBLY') this.renderAssemblySelectors();\n    else if (this.state.tool === 'BRANCH') this.renderBranchCatalogueSelector();\n    else this.renderInlineCatalogueSelector();",
)
replace_once(
    'src/workspace/viewport-productivity/topology-edit-component-authoring-runtime.js',
    "        if (this.state.tool === 'VALVE_ASSEMBLY') {\n          optionCount = topologyEditValveAssemblyCatalogueOptions({\n            topology: this.controller.session?.currentTopology(),\n            authoringSession: this.state,\n            catalogue: this.catalogue(),\n          }).compatibleAssemblyCount;\n        } else {",
    "        if (this.state.tool === 'VALVE_ASSEMBLY') {\n          optionCount = topologyEditValveAssemblyCatalogueOptions({\n            topology: this.controller.session?.currentTopology(),\n            authoringSession: this.state,\n            catalogue: this.catalogue(),\n          }).compatibleAssemblyCount;\n        } else if (this.state.tool === 'BRANCH') {\n          optionCount = topologyEditBranchAuthoringCatalogueOptions({\n            topology: this.controller.session?.currentTopology(),\n            authoringSession: this.state,\n            catalogue: this.catalogue(),\n          }).length;\n        } else {",
)
replace_once(
    'src/workspace/viewport-productivity/topology-edit-component-authoring-runtime.js',
    "    host.dataset.topologyEditAuthoringAssemblyMassKg = String(this.state.properties.assemblyMassKg ?? '');\n  }",
    "    host.dataset.topologyEditAuthoringAssemblyMassKg = String(this.state.properties.assemblyMassKg ?? '');\n    host.dataset.topologyEditAuthoringBranchFamily = this.state.properties.branchFamily ?? '';\n    host.dataset.topologyEditAuthoringBranchClockingDeg = String(this.state.properties.clockingDeg ?? '');\n    host.dataset.topologyEditAuthoringBranchPipeLengthMm = String(this.state.properties.branchPipeLengthMm ?? '');\n    host.dataset.topologyEditAuthoringBranchReachMm = String(this.state.properties.totalBranchReachMm ?? '');\n  }",
)
replace_once(
    'src/workspace/viewport-productivity/topology-edit-component-authoring-runtime.js',
    "      downstreamFlangeRecordId: overrides.downstreamFlangeRecordId,\n    });",
    "      downstreamFlangeRecordId: overrides.downstreamFlangeRecordId,\n      clockingDeg: overrides.clockingDeg,\n      branchPipeLengthMm: overrides.branchPipeLengthMm,\n    });",
)
replace_once(
    'src/workspace/viewport-productivity/topology-edit-component-authoring-runtime.js',
    "  renderAssemblySelectors() {",
    "  renderBranchCatalogueSelector() {\n    const input = this.element.querySelector('[data-authoring-field=\"catalogueRecordId\"]');\n    const catalogue = this.catalogue();\n    if (!input || !catalogue || !this.state.target) return;\n    let options = [];\n    try {\n      options = topologyEditBranchAuthoringCatalogueOptions({\n        topology: this.controller.session?.currentTopology(),\n        authoringSession: this.state,\n        catalogue,\n      });\n    } catch {\n      options = [];\n    }\n    replaceWithSelect(input, options, this.state.properties.catalogueRecordId, this.pending, (row) => ({\n      value: row.recordId,\n      label: row.label,\n      selected: row.recordId === this.state.properties.catalogueRecordId,\n    }));\n  }\n\n  renderAssemblySelectors() {",
)

replace_once(
    'src/workspace/topology-edit-3d-authoring-controller.js',
    "    summary.textContent = 'Authoring tools — Move · Stretch · Route + elbow · Flange · Reducer';",
    "    summary.textContent = 'Authoring tools — Move · Stretch · Route + elbow · Valve assembly · Flange · Reducer · Tee / Olet branch';",
)
