import { workbenchButton, workbenchElement } from '../workbench-dom.js';

const ITEMS = Object.freeze([
  ['MODEL', 'Model'],
  ['MATERIALS', 'Materials'],
  ['LOADS', 'Loads & constraints'],
  ['RESULTS', 'Results'],
  ['VERIFICATION', 'Verification'],
  ['SOURCE', 'Advanced source'],
]);

export function renderLfeaAnalysisNavigator(root, model, active, handlers) {
  const nav = workbenchElement(root, 'aside', 'lfea-shell-v2__navigator');
  nav.setAttribute('aria-label', 'LFEA analysis navigator');
  nav.append(workbenchElement(root, 'h2', null, 'Analysis'));

  const list = workbenchElement(root, 'div', 'lfea-shell-v2__navigator-list');
  for (const [id, label] of ITEMS) {
    const button = workbenchButton(root, label, () => handlers.onSelect(id));
    button.dataset.navigatorItem = id;
    button.setAttribute('aria-current', id === active ? 'page' : 'false');
    button.append(countBadge(root, countFor(id, model.navigator)));
    list.append(button);
  }

  nav.append(list, modelSummary(root, model.navigator), importCapability(root));
  const mock = workbenchButton(root, '[SIMULATED] Load Mock Data', handlers.onMock);
  mock.dataset.role = 'lfea-mock';
  mock.dataset.mockData = 'true';
  nav.append(mock);
  return nav;
}

function modelSummary(root, model) {
  const section = workbenchElement(root, 'section', 'lfea-shell-v2__navigator-summary');
  section.append(
    workbenchElement(root, 'h3', null, 'Model inventory'),
    fact(root, 'Nodes', model.nodes),
    fact(root, 'Elements', model.elements),
    fact(root, 'Regions', model.regions),
    fact(root, 'Materials', model.materials),
    fact(root, 'Loads', model.loads),
    fact(root, 'Constraints', model.constraints),
  );
  return section;
}

function importCapability(root) {
  const section = workbenchElement(root, 'section', 'lfea-shell-v2__blocked-capability');
  section.dataset.role = 'lfea-enriched-sjson-capability';
  section.dataset.status = 'BLOCKED';
  const code = 'LFEA_ENRICHED_SJSON_PIPING_ADAPTER_NOT_WIRED';
  const descriptionId = 'lfea-enriched-sjson-blocked-description';
  const option = workbenchElement(root, 'button', null, 'Import EnrichedSjson');
  option.type = 'button';
  option.disabled = true;
  option.dataset.role = 'lfea-enriched-sjson-import';
  option.setAttribute('aria-describedby', descriptionId);
  const description = workbenchElement(
    root,
    'p',
    null,
    'Workspace ingestion exists, but no EnrichedSjson-to-piping canonical-geometry adapter is wired to the linear piping FEA solver.',
  );
  description.id = descriptionId;
  section.append(
    workbenchElement(root, 'strong', null, 'EnrichedSjson → Piping FEA'),
    workbenchElement(root, 'span', null, 'Blocked'),
    option,
    workbenchElement(root, 'code', null, code),
    description,
  );
  return section;
}

function fact(root, label, value) {
  const row = workbenchElement(root, 'div', 'lfea-shell-v2__fact');
  row.append(
    workbenchElement(root, 'span', null, label),
    workbenchElement(root, 'strong', null, String(value)),
  );
  return row;
}

function countBadge(root, value) {
  const badge = workbenchElement(root, 'span', 'lfea-shell-v2__count', value);
  badge.setAttribute('aria-hidden', 'true');
  return badge;
}

function countFor(id, model) {
  if (id === 'MODEL') return String(model.nodes + model.elements);
  if (id === 'MATERIALS') return String(model.materials);
  if (id === 'LOADS') return String(model.loads + model.constraints);
  if (id === 'RESULTS') return model.hasResults ? '●' : '○';
  if (id === 'VERIFICATION') return model.hasReview ? '●' : '○';
  return '';
}
