/**
 * Entity renderer for Sequential Sketcher SVG Canvas.
 * Delegates Bends, Valves, Flanges, Tees, and Supports to SvgSymbolFactory
 * and attaches FEA reaction callout badges.
 * STRICT MODULE LIMIT: Maximum 300 lines.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

export function renderEntities(doc, svg, entityProjected, options = {}) {
    const {
      symbolFactory,
      supportPresenter,
      selectedEntityId,
      baseStroke = 2,
      bendRadius = 4,
      teeSize = 8,
      supportSize = 10,
      valveRadius = 4,
      loadScale = 1.0,
      onEntityClick,
    } = options;

    entityProjected.forEach(({ entity, p1, p2 }) => {
      const type = (entity.entityType || 'OBJECT').toUpperCase();
      const name = entity.name || entity.entityId;
      const isSelected = selectedEntityId === entity.entityId;

      const clickHandler = (event) => {
        event.stopPropagation();
        if (onEntityClick) onEntityClick(entity);
      };

      // 1. PIPES
      if (type === 'PIPE' && p1 && p2) {
        const symbol = symbolFactory.createPipeSymbol(doc, p1, p2, isSelected, baseStroke);
        symbol.style.cursor = 'pointer';
        symbol.addEventListener('click', clickHandler);
        const title = doc.createElementNS(SVG_NS, 'title');
        title.textContent = `PIPE: ${name}`;
        symbol.append(title);
        svg.append(symbol);
      }
      // 2. BENDS / ELBOWS (ELBO)
      else if ((type === 'ELBO' || type === 'BEND') && p1 && p2) {
        const corner = { px: (p1.px + p2.px) / 2, py: (p1.py + p2.py) / 2 };
        const symbol = symbolFactory.createBendSymbol(doc, p1, corner, p2, isSelected, baseStroke, bendRadius);
        symbol.style.cursor = 'pointer';
        symbol.addEventListener('click', clickHandler);
        const title = doc.createElementNS(SVG_NS, 'title');
        title.textContent = `BEND/ELBOW: ${name}`;
        symbol.append(title);
        svg.append(symbol);
      }
      // 3. TEES / OLETS
      else if ((type === 'TEE' || type === 'OLET') && p1 && p2) {
        const symbol = symbolFactory.createTeeSymbol ? symbolFactory.createTeeSymbol(doc, p1, p2, isSelected, baseStroke, teeSize) : symbolFactory.createValveSymbol(doc, p1, p2, isSelected, baseStroke, teeSize);
        symbol.style.cursor = 'pointer';
        symbol.addEventListener('click', clickHandler);
        const title = doc.createElementNS(SVG_NS, 'title');
        title.textContent = `TEE/JUNCTION: ${name}`;
        symbol.append(title);
        svg.append(symbol);
      }
      // 4. SUPPORTS
      else if ((type === 'SUPPORT' || entity.category === 'support') && (p1 || p2)) {
        const p = p1 || p2;
        const supportType = entity.properties?.supportType || entity.properties?.SUPPORT_TYPE || 'REST';
        const callouts = supportPresenter ? supportPresenter.getResultCallouts(entity) : [];
        const symbol = symbolFactory.createSupportSymbol(doc, p, supportType, isSelected, baseStroke, supportSize, callouts, loadScale);
        symbol.style.cursor = 'pointer';
        symbol.addEventListener('click', clickHandler);
        const title = doc.createElementNS(SVG_NS, 'title');
        title.textContent = `SUPPORT (${supportType}): ${name}`;
        symbol.append(title);
        svg.append(symbol);
      }
    // 5. VALVES / FLANGES / REDUCERS
    else if (p1 && p2 && (type === 'VALV' || type === 'FLAN')) {
      const symbol = type === 'VALV'
        ? symbolFactory.createValveSymbol(doc, p1, p2, isSelected, baseStroke, valveRadius * 2)
        : symbolFactory.createFlangePairSymbol(doc, p1, p2, isSelected, baseStroke, valveRadius * 2);
      symbol.style.cursor = 'pointer';
      symbol.addEventListener('click', clickHandler);
      const title = doc.createElementNS(SVG_NS, 'title');
      title.textContent = `${type}: ${name}`;
      symbol.append(title);
      svg.append(symbol);
    }
    // 6. DEFAULT FALLBACK DOT
    else if (p1 || p2) {
      const p = p1 || p2;
      const dot = doc.createElementNS(SVG_NS, 'circle');
      dot.setAttribute('cx', String(p.px));
      dot.setAttribute('cy', String(p.py));
      dot.setAttribute('r', String(valveRadius));
      dot.setAttribute('fill', '#64748b');
      dot.setAttribute('stroke', isSelected ? '#fbbf24' : '#475569');
      dot.setAttribute('stroke-width', isSelected ? String(baseStroke * 1.5) : String(baseStroke * 0.75));
      dot.style.cursor = 'pointer';
      dot.addEventListener('click', clickHandler);
      const title = doc.createElementNS(SVG_NS, 'title');
      title.textContent = `${type}: ${name}`;
      dot.append(title);
      svg.append(dot);
    }
  });
}
