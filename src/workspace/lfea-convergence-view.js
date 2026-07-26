/**
 * DOM presentation for supplied-level convergence evidence.
 */
import { CONVERGENCE_STANDING_CAPTION } from './lfea-convergence-model.js';
import { renderConvergenceChart } from './lfea-convergence-chart.js';
import {
  workbenchButton,
  workbenchElement,
  workbenchJsonDisclosure,
} from './workbench-dom.js';

export class LfeaConvergenceView {
  constructor(rootElement) {
    this.rootElement = rootElement;
    this.handlers = null;
  }

  init(handlers) {
    this.handlers = handlers;
  }

  render(state) {
    if (!this.rootElement || !this.handlers) return;
    const section = workbenchElement(
      this.rootElement,
      'section',
      'lfea-convergence',
    );
    section.dataset.role = 'lfea-convergence';
    section.append(
      workbenchElement(this.rootElement, 'h2', null, 'Convergence study'),
      workbenchElement(
        this.rootElement,
        'p',
        'lfea-convergence__caption',
        CONVERGENCE_STANDING_CAPTION,
      ),
      this.editor(state),
      this.results(state),
    );
    this.rootElement.replaceChildren(section);
  }

  editor(state) {
    const wrapper = workbenchElement(this.rootElement, 'div');
    const label = workbenchElement(
      this.rootElement,
      'label',
      null,
      'Solved convergence-study JSON ',
    );
    const textarea = workbenchElement(this.rootElement, 'textarea');
    textarea.dataset.role = 'lfea-convergence-json';
    textarea.value = state.source ? JSON.stringify(state.source, null, 2) : '';
    label.append(textarea);
    const apply = workbenchButton(this.rootElement, 'Import study', () => {
      try {
        this.handlers.onImport(JSON.parse(textarea.value));
      } catch (error) {
        this.handlers.onImport({
          invalidJson: error instanceof Error ? error.message : 'Invalid JSON',
        });
      }
    });
    const run = workbenchButton(
      this.rootElement,
      'Interpret supplied levels',
      this.handlers.onRun,
    );
    run.disabled = !state.source;
    wrapper.append(label, apply, run);
    return wrapper;
  }

  results(state) {
    const wrapper = workbenchElement(this.rootElement, 'div');
    const output = workbenchElement(
      this.rootElement,
      'output',
      'lfea-convergence__status',
      state.status,
    );
    output.setAttribute('aria-live', 'polite');
    wrapper.append(output);
    if (state.diagnostics.length) {
      wrapper.append(workbenchJsonDisclosure(
        this.rootElement,
        state.diagnostics,
        'lfea-convergence-diagnostics',
        'Convergence diagnostics',
      ));
    }
    for (const result of state.evidence?.interpretation?.quantityResults ?? []) {
      wrapper.append(this.quantity(result));
    }
    return wrapper;
  }

  quantity(result) {
    const section = workbenchElement(
      this.rootElement,
      'section',
      'lfea-convergence__quantity',
    );
    section.dataset.classification = result.classification;
    section.append(
      workbenchElement(this.rootElement, 'h3', null, result.quantityId),
      workbenchElement(
        this.rootElement,
        'strong',
        'lfea-convergence__classification',
        result.classification,
      ),
    );
    const chart = workbenchElement(this.rootElement, 'div');
    renderConvergenceChart(chart, result);
    section.append(chart, this.historyTable(result));
    if (result.observedOrder?.applicability === 'APPLICABLE') {
      section.append(workbenchElement(
        this.rootElement,
        'p',
        null,
        `Observed order: ${result.observedOrder.observedOrder}`,
      ));
    }
    return section;
  }

  historyTable(result) {
    const table = workbenchElement(this.rootElement, 'table');
    const header = workbenchElement(this.rootElement, 'tr');
    ['Level', 'h', 'Value', 'Probe residual'].forEach((label) =>
      header.append(workbenchElement(this.rootElement, 'th', null, label)));
    table.append(header);
    for (const row of result.history ?? []) {
      const tr = workbenchElement(this.rootElement, 'tr');
      tr.append(
        workbenchElement(this.rootElement, 'td', null, row.levelId),
        workbenchElement(this.rootElement, 'td', null, String(row.h)),
        workbenchElement(this.rootElement, 'td', null, String(row.value)),
        workbenchElement(
          this.rootElement,
          'td',
          null,
          String(row.evidence?.reconstructionResidual ?? 'N/A'),
        ),
      );
      table.append(tr);
    }
    return table;
  }

  destroy() {
    this.rootElement?.replaceChildren();
    this.handlers = null;
  }
}
