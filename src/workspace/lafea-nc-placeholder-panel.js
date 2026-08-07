/** Read-only NC lifecycle placeholders for the standalone LAFEA workbench. */
import { element } from './lafea-workbench-dom.js';

const NO_AUTHORITY = Object.freeze({
  executionAuthorized: false,
  releaseAuthorized: false,
  automaticDispositionAuthorized: false,
  productionReactivationAuthorized: false,
});

const MODULES = Object.freeze([
  freezeModule({
    id: 'NC-10',
    title: 'Production Run Receipts',
    purpose: 'Collect governed evidence that a specific production run used the authorized deployment, exact build, configuration, inputs, execution path, review, and retention chain.',
    evidencePlaceholders: [
      'NC-09 deployment authorization receipt',
      'Run registry with exact build, configuration, input, operator, and execution-window binding',
      'Raw output, parser, reconstruction, calculation-ledger, and independent-review evidence',
      'Owner disposition, retry ledger, and retention record',
    ],
  }),
  freezeModule({
    id: 'NC-11',
    title: 'Operational Surveillance',
    purpose: 'Collect governed monitoring, drift, incident, replay, expiry, and requalification evidence for continued operation after qualified run receipts exist.',
    evidencePlaceholders: [
      'Qualified NC-10 run receipt',
      'Telemetry archive and alert-threshold custody',
      'Incident, drift-detection, distribution-shift, and replay evidence',
      'Authorization expiry, revocation, requalification, periodic-review, and retention evidence',
    ],
  }),
  freezeModule({
    id: 'NC-12',
    title: 'Retirement & Preservation',
    purpose: 'Collect governed evidence for irreversible retirement, teardown, archival custody, open-case transfer, read-only recovery, and proof that no production execution path remains.',
    evidencePlaceholders: [
      'Qualified NC-11 surveillance receipt',
      'Owner retirement approval and credential/deployment revocation evidence',
      'Source, build, configuration, receipt-chain, case-ledger, and audit-ledger archives',
      'Open-case transfer, successor mapping, recovery reproduction, independent verification, and signed closeout',
    ],
  }),
]);

const PROJECTION = Object.freeze({
  schema: 'lafea-nc-ui-placeholders/v1',
  mode: 'READ_ONLY_PLACEHOLDER',
  status: 'AWAITING_GOVERNED_EVIDENCE',
  authority: NO_AUTHORITY,
  modules: MODULES,
});

export function createLafeaNcPlaceholderProjection() {
  return PROJECTION;
}

export function renderLafeaNcPlaceholderPanel(root) {
  const projection = createLafeaNcPlaceholderProjection();
  const section = element(root, 'section', 'lafea-workbench__truth');
  section.dataset.role = 'lafea-nc-placeholder';
  section.append(
    element(root, 'h3', null, 'NC governance modules'),
    element(
      root,
      'p',
      null,
      'Read-only placeholder. This surface does not authorize execution, release, automatic disposition, or production reactivation.',
    ),
  );

  const selectorLabel = element(root, 'label', null, 'Module: ');
  const selector = element(root, 'select');
  selector.dataset.role = 'lafea-nc-module-selector';
  selector.setAttribute('aria-label', 'NC module');
  projection.modules.forEach((module) => {
    const option = element(root, 'option', null, `${module.id} — ${module.title}`);
    option.value = module.id;
    selector.append(option);
  });
  selectorLabel.append(selector);

  const details = element(root, 'div', 'lafea-guided-summary');
  const renderSelected = () => {
    const module = projection.modules.find((candidate) => candidate.id === selector.value)
      ?? projection.modules[0];
    details.replaceChildren(renderModuleDetails(root, module, projection));
  };
  selector.addEventListener('change', renderSelected);
  section.append(selectorLabel, details);
  renderSelected();
  return section;
}

function renderModuleDetails(root, module, projection) {
  const details = element(root, 'section');
  details.dataset.moduleId = module.id;
  details.dataset.status = module.status;
  details.append(
    element(root, 'h4', null, `${module.id} — ${module.title}`),
    element(root, 'p', null, `Status: ${module.status}`),
    element(root, 'p', null, module.purpose),
    element(root, 'h4', null, 'Evidence placeholders'),
  );

  const evidence = element(root, 'ul');
  module.evidencePlaceholders.forEach((label) => evidence.append(
    element(root, 'li', null, `${label}: awaiting governed evidence`),
  ));
  details.append(evidence, element(root, 'h4', null, 'Authority boundary'));

  const authority = element(root, 'ul');
  Object.entries(projection.authority).forEach(([name, authorized]) => authority.append(
    element(root, 'li', null, `${name}: ${authorized ? 'AUTHORIZED' : 'NOT AUTHORIZED'}`),
  ));
  details.append(authority);
  return details;
}

function freezeModule(value) {
  return Object.freeze({
    ...value,
    status: 'AWAITING_GOVERNED_EVIDENCE',
    evidencePlaceholders: Object.freeze([...value.evidencePlaceholders]),
  });
}
