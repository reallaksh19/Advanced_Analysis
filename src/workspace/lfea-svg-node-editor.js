/**
 * Pointer and keyboard interaction for one editable LFEA SVG node.
 *
 * Movements are previews. The controller commits only after the separate Apply
 * action, so Escape and pointer cancellation cannot invalidate a solve.
 */
export const LFEA_KEYBOARD_NUDGE = 0.001;

export function bindLfeaNodeEditor(input) {
  const { svg, marker, node, transform, handlers, sourcePoint } = input;
  marker.style.cursor = 'move';
  marker.tabIndex = 0;
  marker.setAttribute('role', 'button');
  marker.setAttribute(
    'aria-label',
    `Node ${node.nodeId} at ${node.sourceX ?? node.x}, ${node.sourceY ?? node.y}`,
  );
  marker.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    marker.setPointerCapture?.(event.pointerId);
    const finish = (upEvent) => {
      clear();
      const point = sourcePoint(svg, upEvent, transform);
      handlers.onMoveNode(node.nodeId, point.x, point.y);
    };
    const cancel = () => {
      clear();
      handlers.onCancelNode();
    };
    const clear = () => {
      marker.removeEventListener('pointerup', finish);
      marker.removeEventListener('pointercancel', cancel);
    };
    marker.addEventListener('pointerup', finish);
    marker.addEventListener('pointercancel', cancel);
  });
  marker.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      handlers.onCancelNode();
      return;
    }
    const offsets = {
      ArrowLeft: [-LFEA_KEYBOARD_NUDGE, 0],
      ArrowRight: [LFEA_KEYBOARD_NUDGE, 0],
      ArrowUp: [0, LFEA_KEYBOARD_NUDGE],
      ArrowDown: [0, -LFEA_KEYBOARD_NUDGE],
    };
    const offset = offsets[event.key];
    if (!offset) return;
    event.preventDefault();
    handlers.onMoveNode(
      node.nodeId,
      node.x + offset[0],
      node.y + offset[1],
    );
  });
}
