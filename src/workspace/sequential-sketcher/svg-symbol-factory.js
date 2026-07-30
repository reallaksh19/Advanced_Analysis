/**
 * ISO/ASME Engineering Vector Symbol Factory for Sequential Sketcher.
 * 
 * Generates precision SVG elements for Bends, Valves, Flanges, Tees, and Support Glyphs
 * complete with FEA Reaction Force load arrows and numeric engineering badges.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

export class SvgSymbolFactory {
  constructor() {
    this.ns = SVG_NS;
  }

  /**
   * Creates an ASME Pipe centerline segment.
   */
  createPipeSymbol(doc, p1, p2, isSelected, strokeWidth, color = null) {
    const group = doc.createElementNS(this.ns, 'g');
    group.setAttribute('class', 'symbol-pipe');

    const line = doc.createElementNS(this.ns, 'line');
    line.setAttribute('x1', String(p1.px));
    line.setAttribute('y1', String(p1.py));
    line.setAttribute('x2', String(p2.px));
    line.setAttribute('y2', String(p2.py));
    line.setAttribute('stroke', color || (isSelected ? '#38bdf8' : '#e2e8f0'));
    line.setAttribute('stroke-width', String(isSelected ? strokeWidth * 1.5 : strokeWidth));
    line.setAttribute('stroke-linecap', 'round');

    group.append(line);
    return group;
  }

  /**
   * Creates an ASME ELBO/BEND symbol with smooth arc and weld seams.
   */
  createBendSymbol(doc, p1, corner, p2, isSelected, strokeWidth, radius) {
    const group = doc.createElementNS(this.ns, 'g');
    group.setAttribute('class', 'symbol-bend');

    // Tangential arc through corner
    const d = `M ${p1.px} ${p1.py} Q ${corner.px} ${corner.py} ${p2.px} ${p2.py}`;
    const path = doc.createElementNS(this.ns, 'path');
    path.setAttribute('d', d);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', isSelected ? '#38bdf8' : '#f59e0b');
    path.setAttribute('stroke-width', String(isSelected ? strokeWidth * 1.8 : strokeWidth * 1.4));
    path.setAttribute('stroke-linecap', 'round');

    // ASME Weld seam ticks at p1 and p2
    const tick1 = this.createWeldTick(doc, p1, corner, strokeWidth * 1.5, '#f59e0b');
    const tick2 = this.createWeldTick(doc, p2, corner, strokeWidth * 1.5, '#f59e0b');

    // Curvature Center Node Marker
    const node = doc.createElementNS(this.ns, 'circle');
    node.setAttribute('cx', String(corner.px));
    node.setAttribute('cy', String(corner.py));
    node.setAttribute('r', String(strokeWidth * 0.9));
    node.setAttribute('fill', '#f59e0b');

    group.append(path, tick1, tick2, node);
    return group;
  }

  /**
   * Creates an ASME B31 / ISO Standard 3-Leg Tee Junction Symbol.
   */
  createTeeSymbol(doc, p1, p2, isSelected, strokeWidth, size) {
    const group = doc.createElementNS(this.ns, 'g');
    group.setAttribute('class', 'symbol-tee');

    const mx = (p1.px + p2.px) / 2;
    const my = (p1.py + p2.py) / 2;
    const angle = Math.atan2(p2.py - p1.py, p2.px - p1.px);
    const perp = angle - Math.PI / 2;

    // Main Run Pipe Line
    const run = doc.createElementNS(this.ns, 'line');
    run.setAttribute('x1', String(p1.px)); run.setAttribute('y1', String(p1.py));
    run.setAttribute('x2', String(p2.px)); run.setAttribute('y2', String(p2.py));
    run.setAttribute('stroke', isSelected ? '#38bdf8' : '#38bdf8');
    run.setAttribute('stroke-width', String(strokeWidth * 1.2));

    // Perpendicular Branch Stub
    const branchEnd = { x: mx + Math.cos(perp) * (size * 1.4), y: my + Math.sin(perp) * (size * 1.4) };
    const branch = doc.createElementNS(this.ns, 'line');
    branch.setAttribute('x1', String(mx)); branch.setAttribute('y1', String(my));
    branch.setAttribute('x2', String(branchEnd.x)); branch.setAttribute('y2', String(branchEnd.y));
    branch.setAttribute('stroke', isSelected ? '#38bdf8' : '#0ea5e9');
    branch.setAttribute('stroke-width', String(strokeWidth * 1.2));

    // Center Junction Circle Node
    const node = doc.createElementNS(this.ns, 'circle');
    node.setAttribute('cx', String(mx)); node.setAttribute('cy', String(my));
    node.setAttribute('r', String(strokeWidth * 1.2));
    node.setAttribute('fill', isSelected ? '#38bdf8' : '#0ea5e9');

    // Branch Seam Tick
    const seam = this.createWeldTick(doc, branchEnd, { px: mx, py: my }, strokeWidth * 1.2, '#0ea5e9');

    group.append(run, branch, node, seam);
    return group;
  }

  createWeldTick(doc, pt, targetPt, size, color) {
    const angle = Math.atan2(targetPt.py - pt.py, targetPt.px - pt.px);
    const perp = angle + Math.PI / 2;
    const dx = Math.cos(perp) * size;
    const dy = Math.sin(perp) * size;

    const line = doc.createElementNS(this.ns, 'line');
    line.setAttribute('x1', String(pt.px - dx));
    line.setAttribute('y1', String(pt.py - dy));
    line.setAttribute('x2', String(pt.px + dx));
    line.setAttribute('y2', String(pt.py + dy));
    line.setAttribute('stroke', color);
    line.setAttribute('stroke-width', String(size * 0.4));
    return line;
  }

  /**
   * Creates an ASME Bowtie Valve Glyph with bonnet and handwheel stem.
   */
  createValveSymbol(doc, p1, p2, isSelected, strokeWidth, size) {
    const group = doc.createElementNS(this.ns, 'g');
    group.setAttribute('class', 'symbol-valve');

    const mx = (p1.px + p2.px) / 2;
    const my = (p1.py + p2.py) / 2;
    const angle = Math.atan2(p2.py - p1.py, p2.px - p1.px);

    // Bowtie triangle pair centered at (mx, my)
    const d = size;
    const pLeft1 = { x: mx - Math.cos(angle) * d - Math.sin(angle) * (d * 0.6), y: my - Math.sin(angle) * d + Math.cos(angle) * (d * 0.6) };
    const pLeft2 = { x: mx - Math.cos(angle) * d + Math.sin(angle) * (d * 0.6), y: my - Math.sin(angle) * d - Math.cos(angle) * (d * 0.6) };
    const pRight1 = { x: mx + Math.cos(angle) * d - Math.sin(angle) * (d * 0.6), y: my + Math.sin(angle) * d + Math.cos(angle) * (d * 0.6) };
    const pRight2 = { x: mx + Math.cos(angle) * d + Math.sin(angle) * (d * 0.6), y: my + Math.sin(angle) * d - Math.cos(angle) * (d * 0.6) };

    const bowtie = doc.createElementNS(this.ns, 'polygon');
    bowtie.setAttribute('points', `${pLeft1.x},${pLeft1.y} ${pLeft2.x},${pLeft2.y} ${mx},${my} ${pRight1.x},${pRight1.y} ${pRight2.x},${pRight2.y} ${mx},${my}`);
    bowtie.setAttribute('fill', isSelected ? '#0284c7' : '#ec4899');
    bowtie.setAttribute('stroke', isSelected ? '#38bdf8' : '#ffffff');
    bowtie.setAttribute('stroke-width', String(strokeWidth * 0.8));

    const perp = angle - Math.PI / 2;
    const stemEnd = { x: mx + Math.cos(perp) * (d * 1.2), y: my + Math.sin(perp) * (d * 1.2) };
    const stem = doc.createElementNS(this.ns, 'line');
    stem.setAttribute('x1', String(mx)); stem.setAttribute('y1', String(my));
    stem.setAttribute('x2', String(stemEnd.x)); stem.setAttribute('y2', String(stemEnd.y));
    stem.setAttribute('stroke', '#ec4899'); stem.setAttribute('stroke-width', String(strokeWidth * 0.8));

    const wheel1 = { x: stemEnd.x - Math.cos(angle) * (d * 0.6), y: stemEnd.y - Math.sin(angle) * (d * 0.6) };
    const wheel2 = { x: stemEnd.x + Math.cos(angle) * (d * 0.6), y: stemEnd.y + Math.sin(angle) * (d * 0.6) };
    const handwheel = doc.createElementNS(this.ns, 'line');
    handwheel.setAttribute('x1', String(wheel1.x)); handwheel.setAttribute('y1', String(wheel1.y));
    handwheel.setAttribute('x2', String(wheel2.x)); handwheel.setAttribute('y2', String(wheel2.y));
    handwheel.setAttribute('stroke', '#ec4899'); handwheel.setAttribute('stroke-width', String(strokeWidth * 1.2));

    group.append(bowtie, stem, handwheel);
    return group;
  }

  createFlangePairSymbol(doc, p1, p2, isSelected, strokeWidth, size) {
    const group = doc.createElementNS(this.ns, 'g');
    group.setAttribute('class', 'symbol-flange-pair');

    const mx = (p1.px + p2.px) / 2, my = (p1.py + p2.py) / 2;
    const angle = Math.atan2(p2.py - p1.py, p2.px - p1.px), perp = angle + Math.PI / 2;
    const gap = size * 0.35, height = size * 1.2;

    [ -gap, gap ].forEach(gOffset => {
      const c = { x: mx + Math.cos(angle) * gOffset, y: my + Math.sin(angle) * gOffset };
      const line = doc.createElementNS(this.ns, 'line');
      line.setAttribute('x1', String(c.x - Math.cos(perp) * height)); line.setAttribute('y1', String(c.y - Math.sin(perp) * height));
      line.setAttribute('x2', String(c.x + Math.cos(perp) * height)); line.setAttribute('y2', String(c.y + Math.sin(perp) * height));
      line.setAttribute('stroke', isSelected ? '#38bdf8' : '#a855f7'); line.setAttribute('stroke-width', String(strokeWidth * 1.4));
      group.append(line);
    });
    return group;
  }

  /**
   * Creates an Engineering Support Glyph (ANC, GUIDE, SPRING, REST, SNUB)
   * with FEA Reaction Force load arrows and numeric callout badges.
   */
  createSupportSymbol(doc, pos, supportType, isSelected, strokeWidth, size, callouts = [], loadScale = 1.0) {
    const group = doc.createElementNS(this.ns, 'g');
    group.setAttribute('class', `symbol-support symbol-support-${supportType.toLowerCase()}`);
    group.setAttribute('transform', `translate(${pos.px}, ${pos.py})`);

    const color = isSelected ? '#38bdf8' : '#22c55e';
    const s = size * 1.3;
    const glyphGroup = doc.createElementNS(this.ns, 'g');

    if (supportType === 'ANC' || supportType === 'ANCHOR') {
      const rect = doc.createElementNS(this.ns, 'rect');
      rect.setAttribute('x', String(-s * 0.8)); rect.setAttribute('y', String(s * 0.4));
      rect.setAttribute('width', String(s * 1.6)); rect.setAttribute('height', String(s * 0.6));
      rect.setAttribute('fill', '#14532d'); rect.setAttribute('stroke', color); rect.setAttribute('stroke-width', String(strokeWidth));
      glyphGroup.append(rect);

      [[-0.6, 1.0, -0.2, 0.4], [-0.2, 1.0, 0.2, 0.4], [0.2, 1.0, 0.6, 0.4]].forEach(([x1, y1, x2, y2]) => {
        const h = doc.createElementNS(this.ns, 'line');
        h.setAttribute('x1', String(s * x1)); h.setAttribute('y1', String(s * y1));
        h.setAttribute('x2', String(s * x2)); h.setAttribute('y2', String(s * y2));
        h.setAttribute('stroke', color); h.setAttribute('stroke-width', String(strokeWidth * 0.6));
        glyphGroup.append(h);
      });
    } else if (supportType === 'GUIDE') {
      const armL = doc.createElementNS(this.ns, 'path');
      armL.setAttribute('d', `M ${-s * 1.2} ${-s * 0.6} L ${-s * 0.6} ${-s * 0.6} L ${-s * 0.6} ${s * 0.6} L ${-s * 1.2} ${s * 0.6}`);
      armL.setAttribute('fill', 'none'); armL.setAttribute('stroke', color); armL.setAttribute('stroke-width', String(strokeWidth * 1.2));

      const armR = doc.createElementNS(this.ns, 'path');
      armR.setAttribute('d', `M ${s * 1.2} ${-s * 0.6} L ${s * 0.6} ${-s * 0.6} L ${s * 0.6} ${s * 0.6} L ${s * 1.2} ${s * 0.6}`);
      armR.setAttribute('fill', 'none'); armR.setAttribute('stroke', color); armR.setAttribute('stroke-width', String(strokeWidth * 1.2));

      glyphGroup.append(armL, armR);
    } else if (supportType === 'SPRING') {
      const coil = doc.createElementNS(this.ns, 'path');
      coil.setAttribute('d', `M 0 0 L 0 ${-s * 0.4} L ${s * 0.4} ${-s * 0.7} L ${-s * 0.4} ${-s * 1.1} L ${s * 0.4} ${-s * 1.5} L 0 ${-s * 1.8} L 0 ${-s * 2.2}`);
      coil.setAttribute('fill', 'none'); coil.setAttribute('stroke', color); coil.setAttribute('stroke-width', String(strokeWidth * 1.2));

      const bar = doc.createElementNS(this.ns, 'line');
      bar.setAttribute('x1', String(-s * 0.8)); bar.setAttribute('y1', String(-s * 2.2));
      bar.setAttribute('x2', String(s * 0.8)); bar.setAttribute('y2', String(-s * 2.2));
      bar.setAttribute('stroke', color); bar.setAttribute('stroke-width', String(strokeWidth * 1.4));

      glyphGroup.append(coil, bar);
    } else {
      const wedge = doc.createElementNS(this.ns, 'polygon');
      wedge.setAttribute('points', `0,0 ${-s * 0.8},${s * 1.2} ${s * 0.8},${s * 1.2}`);
      wedge.setAttribute('fill', '#14532d'); wedge.setAttribute('stroke', color); wedge.setAttribute('stroke-width', String(strokeWidth));
      glyphGroup.append(wedge);
    }

    group.append(glyphGroup);

    if (Array.isArray(callouts) && callouts.length > 0) {
      callouts.forEach((callout, index) => {
        group.append(this.createLoadReactionBadge(doc, callout, index, s, strokeWidth, loadScale));
      });
    }

    return group;
  }

  createLoadReactionBadge(doc, callout, index, size, strokeWidth, loadScale = 1.0) {
    const badgeGroup = doc.createElementNS(this.ns, 'g');
    badgeGroup.setAttribute('class', 'reaction-load-badge');

    const isHorizontal = callout.direction === 'H' || callout.direction === 'A';
    const offsetX = isHorizontal ? size * 1.8 * loadScale : size * (index === 0 ? 1.4 : -2.4) * loadScale;
    const offsetY = isHorizontal ? size * (index * 0.8 - 0.4) * loadScale : -size * (0.8 + index * 0.7) * loadScale;

    badgeGroup.setAttribute('transform', `translate(${offsetX}, ${offsetY})`);

    const arrow = doc.createElementNS(this.ns, 'line');
    arrow.setAttribute('x1', String(0)); arrow.setAttribute('y1', String(0));
    arrow.setAttribute('x2', isHorizontal ? String(size * 0.8 * loadScale) : String(0));
    arrow.setAttribute('y2', isHorizontal ? String(0) : String(-size * 0.8 * loadScale));
    arrow.setAttribute('stroke', '#38bdf8');
    arrow.setAttribute('stroke-width', String(strokeWidth * 0.8 * loadScale));

    const bg = doc.createElementNS(this.ns, 'rect');
    const labelText = callout.label || 'F: 0 kN';
    const textWidth = Math.max(36 * loadScale, labelText.length * (size * 0.42 * loadScale));
    bg.setAttribute('x', String(size * 0.2 * loadScale));
    bg.setAttribute('y', String(-size * 0.6 * loadScale));
    bg.setAttribute('width', String(textWidth));
    bg.setAttribute('height', String(size * 0.9 * loadScale));
    bg.setAttribute('rx', String(3 * loadScale));
    bg.setAttribute('fill', '#0284c7');
    bg.setAttribute('stroke', '#38bdf8');
    bg.setAttribute('stroke-width', String(strokeWidth * 0.5));
    bg.style.opacity = '0.92';

    const text = doc.createElementNS(this.ns, 'text');
    text.setAttribute('x', String((size * 0.2 * loadScale) + textWidth / 2));
    text.setAttribute('y', String(-size * 0.15 * loadScale));
    text.setAttribute('fill', '#ffffff');
    text.setAttribute('font-size', String(size * 0.55 * loadScale));
    text.setAttribute('font-weight', '700');
    text.setAttribute('font-family', 'Inter, Roboto, sans-serif');
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('dominant-baseline', 'middle');
    text.style.userSelect = 'none';
    text.textContent = labelText;

    badgeGroup.append(bg, text);
    return badgeGroup;
  }
}
