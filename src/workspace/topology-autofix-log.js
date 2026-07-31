/**
 * Topology Autofix Log Ledger UI
 * Displays a floating ledger of all applied topology merges over the WebGL canvas.
 */

export function mountAutofixLog(container, merges, onFlyToNode) {
  // Remove existing log if any
  const existing = container.querySelector('.autofix-log-ledger');
  if (existing) existing.remove();

  if (!merges || merges.length === 0) return;

  const wrapper = document.createElement('div');
  wrapper.className = 'autofix-log-ledger';
  wrapper.style.cssText = 'position: absolute; right: 20px; top: 20px; width: 320px; max-height: 80%; background: rgba(15, 23, 42, 0.95); border: 1px solid #334155; border-radius: 8px; box-shadow: 0 10px 25px rgba(0,0,0,0.5); display: flex; flex-direction: column; z-index: 100; font-family: ui-sans-serif, system-ui, sans-serif; overflow: hidden;';

  const header = document.createElement('div');
  header.style.cssText = 'padding: 12px 16px; border-bottom: 1px solid #334155; background: rgba(30, 41, 59, 0.95); flex: none; display: flex; justify-content: space-between; align-items: center;';
  
  const title = document.createElement('h4');
  title.style.cssText = 'margin: 0; color: #f8fafc; font-size: 13px; font-weight: 600; display: flex; align-items: center; gap: 8px;';
  title.innerHTML = `<span style="color: #38bdf8;">⚡</span> Proposed Fixes (${merges.length})`;
  
  const closeBtn = document.createElement('button');
  closeBtn.textContent = '✕';
  closeBtn.style.cssText = 'background: transparent; border: none; color: #94a3b8; cursor: pointer; font-size: 12px;';
  closeBtn.onclick = () => wrapper.style.display = 'none';
  
  header.appendChild(title);
  header.appendChild(closeBtn);
  wrapper.appendChild(header);

  const list = document.createElement('div');
  list.style.cssText = 'flex: 1; overflow-y: auto; padding: 8px;';

  merges.forEach((merge, idx) => {
    const item = document.createElement('div');
    item.style.cssText = 'padding: 10px; border-radius: 6px; margin-bottom: 4px; background: rgba(30, 41, 59, 0.5); border: 1px solid transparent; cursor: pointer; transition: all 0.2s;';
    
    item.onmouseenter = () => {
      item.style.background = 'rgba(56, 189, 248, 0.1)';
      item.style.borderColor = 'rgba(56, 189, 248, 0.3)';
    };
    item.onmouseleave = () => {
      item.style.background = 'rgba(30, 41, 59, 0.5)';
      item.style.borderColor = 'transparent';
    };
    
    item.onclick = () => {
      if (onFlyToNode && merge.coordinate) {
        onFlyToNode(merge.coordinate);
      }
    };

    const desc = document.createElement('div');
    desc.style.cssText = 'color: #e2e8f0; font-size: 12px; font-weight: 500; margin-bottom: 4px;';
    desc.textContent = merge.description;

    const coords = document.createElement('div');
    coords.style.cssText = 'color: #64748b; font-size: 10px; font-family: monospace;';
    coords.textContent = `[${merge.coordinate.x.toFixed(1)}, ${merge.coordinate.y.toFixed(1)}, ${merge.coordinate.z.toFixed(1)}]`;

    item.appendChild(desc);
    item.appendChild(coords);
    list.appendChild(item);
  });

  wrapper.appendChild(list);

  // Footer Actions
  const footer = document.createElement('div');
  footer.style.cssText = 'padding: 12px; border-top: 1px solid #334155; background: rgba(30, 41, 59, 0.95); flex: none; display: flex; justify-content: flex-end; gap: 8px;';
  
  const rejectBtn = document.createElement('button');
  rejectBtn.textContent = 'Reject All';
  rejectBtn.style.cssText = 'background: transparent; border: 1px solid #ef4444; color: #ef4444; border-radius: 4px; padding: 6px 12px; font-size: 12px; cursor: pointer;';
  rejectBtn.onclick = () => {
    wrapper.remove();
    container.dispatchEvent(new CustomEvent('topology:autofix-reject', { bubbles: true }));
  };
  
  const acceptBtn = document.createElement('button');
  acceptBtn.textContent = 'Accept Fixes';
  acceptBtn.style.cssText = 'background: #22c55e; border: none; color: white; font-weight: bold; border-radius: 4px; padding: 6px 12px; font-size: 12px; cursor: pointer; box-shadow: 0 2px 4px rgba(34, 197, 94, 0.3);';
  acceptBtn.onclick = () => {
    wrapper.remove();
    container.dispatchEvent(new CustomEvent('topology:autofix-accept', { bubbles: true, detail: { merges } }));
  };
  
  footer.appendChild(rejectBtn);
  footer.appendChild(acceptBtn);
  wrapper.appendChild(footer);

  container.appendChild(wrapper);
  return wrapper;
}
