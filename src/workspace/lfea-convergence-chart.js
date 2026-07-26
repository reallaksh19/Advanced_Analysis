/**
 * SVG sequence chart for kernel-published convergence histories.
 *
 * Points and optional asymptote values come verbatim from the interpretation.
 * A singular or nonconvergent sequence never receives an asymptote.
 */
const SVG_NS = 'http://www.w3.org/2000/svg';
const WIDTH = 640;
const HEIGHT = 220;
const PADDING = 34;

export function renderConvergenceChart(host, quantityResult) {
  const svg = host.ownerDocument.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${WIDTH} ${HEIGHT}`);
  svg.setAttribute('role', 'img');
  svg.setAttribute(
    'aria-label',
    `${quantityResult.quantityId} convergence sequence`,
  );
  const history = quantityResult.history ?? [];
  if (!history.length) {
    host.replaceChildren(svg);
    return;
  }
  const values = history.map((row) => row.value);
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const span = Math.max(maximum - minimum, Number.EPSILON);
  const point = (row, index) => ({
    x: PADDING + index * (WIDTH - 2 * PADDING) / Math.max(history.length - 1, 1),
    y: HEIGHT - PADDING
      - (row.value - minimum) * (HEIGHT - 2 * PADDING) / span,
  });
  const points = history.map(point);
  const line = svg.ownerDocument.createElementNS(SVG_NS, 'polyline');
  line.setAttribute(
    'points',
    points.map((row) => `${row.x},${row.y}`).join(' '),
  );
  line.setAttribute('class', 'lfea-convergence__line');
  svg.append(line);
  points.forEach((row, index) => {
    const circle = svg.ownerDocument.createElementNS(SVG_NS, 'circle');
    circle.setAttribute('cx', String(row.x));
    circle.setAttribute('cy', String(row.y));
    circle.setAttribute('r', '4');
    circle.dataset.levelId = history[index].levelId;
    circle.dataset.h = String(history[index].h);
    circle.dataset.value = String(history[index].value);
    const title = svg.ownerDocument.createElementNS(SVG_NS, 'title');
    title.textContent = `${history[index].levelId}: h=${history[index].h}, `
      + `value=${history[index].value}`;
    circle.append(title);
    svg.append(circle);
  });
  if (quantityResult.richardson?.applicability === 'APPLICABLE') {
    svg.append(asymptote(svg, quantityResult.richardson.estimatedValue));
  }
  host.replaceChildren(svg);
}

function asymptote(svg, estimatedValue) {
  const line = svg.ownerDocument.createElementNS(SVG_NS, 'text');
  line.setAttribute('x', String(WIDTH - PADDING));
  line.setAttribute('y', String(PADDING - 8));
  line.setAttribute('text-anchor', 'end');
  line.setAttribute('class', 'lfea-convergence__estimate');
  line.dataset.role = 'lfea-convergence-asymptote';
  line.textContent = `Estimated asymptote: ${estimatedValue}`;
  return line;
}
