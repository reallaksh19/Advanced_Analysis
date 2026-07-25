/**
 * spl2_canvas.js
 * Deep Architect Core Canvas Engine
 * Handles drawing primitives, pan/zoom, and interactive editable dimensions.
 */

export class SPL2Canvas {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) {
            console.error(`Canvas ${canvasId} not found.`);
            return;
        }
        this.ctx = this.canvas.getContext('2d');

        // Viewport matrices
        this.transform = { x: 0, y: 0, scale: 1 };
        this.isDragging = false;
        this.dragStart = { x: 0, y: 0 };

        // Interactive state
        this.labels = []; // Array of { text, x, y, id, type }

        // Colors (AutoCAD style)
        this.colors = {
            bg: '#1e1e1e',
            grid: '#333333',
            pipe: '#00ffff',     // Cyan
            center: '#ff00ff',   // Magenta (centerline)
            dim: '#cccccc',      // Light gray dimension lines
            text: '#ffffff',     // White text
            highlight: '#ffff00' // Yellow on hover
        };

        this.initEvents();
        this.resize();
        window.addEventListener('resize', () => this.resize());
    }

    /* --- Core Engine --- */
    resize() {
        const parent = this.canvas.parentElement;
        this.canvas.width = parent.clientWidth;
        // fixed height for consistent canvas footprint
        this.canvas.height = 400;
        this.render();
    }

    initEvents() {
        // Pan
        this.canvas.addEventListener('mousedown', (e) => {
            this.isDragging = true;
            this.dragStart = { x: e.offsetX - this.transform.x, y: e.offsetY - this.transform.y };
            this.canvas.style.cursor = 'grabbing';
        });

        this.canvas.addEventListener('mousemove', (e) => {
            if (this.isDragging) {
                this.transform.x = e.offsetX - this.dragStart.x;
                this.transform.y = e.offsetY - this.dragStart.y;
                this.render();
            }
        });

        const stopDrag = () => {
            this.isDragging = false;
            this.canvas.style.cursor = 'default';
        };
        this.canvas.addEventListener('mouseup', stopDrag);
        this.canvas.addEventListener('mouseleave', stopDrag);

        // Zoom
        this.canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            const mouseX = e.offsetX;
            const mouseY = e.offsetY;
            const wheel = e.deltaY < 0 ? 1 : -1;
            const zoomSpeed = 0.1;
            const zoom = Math.exp(wheel * zoomSpeed);

            this.transform.x = mouseX - (mouseX - this.transform.x) * zoom;
            this.transform.y = mouseY - (mouseY - this.transform.y) * zoom;
            this.transform.scale *= zoom;

            this.render();
        });

        // Double-click to edit labels
        this.canvas.addEventListener('dblclick', (e) => this.handleDoubleClick(e));
    }

    handleDoubleClick(e) {
        // Reverse translate coordinates
        const mouseX = (e.offsetX - this.transform.x) / this.transform.scale;
        const mouseY = (e.offsetY - this.transform.y) / this.transform.scale;

        // Check intersection with any registered label bounding box
        for (let lbl of this.labels) {
            // Rough bounding box using text metrics
            this.ctx.font = '14px Consolas, monospace';
            const metrics = this.ctx.measureText(lbl.text);
            const w = metrics.width;
            const h = 18; // approx line height

            // Center-aligned text logic
            const tx = lbl.x - w / 2;
            const ty = lbl.y - h / 2;

            if (mouseX >= tx && mouseX <= tx + w && mouseY >= ty && mouseY <= ty + h) {
                this.spawnInputOverlay(lbl, e.offsetX, e.offsetY);
                return;
            }
        }
    }

    spawnInputOverlay(lbl, screenX, screenY) {
        // Destroy existing if any
        let existing = document.getElementById('canvas-input-overlay');
        if (existing) existing.remove();

        const input = document.createElement('input');
        input.id = 'canvas-input-overlay';
        input.type = 'number';
        input.value = parseFloat(lbl.text) || 0;

        // Style overlay
        Object.assign(input.style, {
            position: 'absolute',
            left: `${screenX - 40}px`,
            top: `${screenY - 15}px`,
            width: '80px',
            background: 'var(--bg-0)',
            color: 'var(--amber)',
            border: '1px solid var(--amber)',
            outline: 'none',
            padding: '2px 4px',
            fontFamily: 'var(--font-code)',
            fontSize: '14px',
            zIndex: 100
        });

        // Append to relative parent
        this.canvas.parentElement.style.position = 'relative';
        this.canvas.parentElement.appendChild(input);
        input.focus();
        input.select();

        // Listen for save
        const save = () => {
            const newVal = parseFloat(input.value);
            if (!isNaN(newVal)) {
                // Dispatch custom event to tell the master controller a specific value changed
                this.canvas.dispatchEvent(new CustomEvent('canvas-edit', {
                    detail: { id: lbl.id, value: newVal }
                }));
            }
            input.remove();
        };

        input.addEventListener('keydown', (e) => { if (e.key === 'Enter') save(); });
        input.addEventListener('blur', save);
    }

    // Generic Coordinate Axes for visual reference
    drawAxes(type = '2D', x = 50, y = null) {
        if (!y) y = this.canvas.height - 50;
        const len = 30;

        this.ctx.lineWidth = 2;

        if (type === '2D') {
            // Y-Axis (Up)
            this.drawLine(x, y, x, y - len, '#ff00ff', 2);
            this.drawText('Y', x, y - len - 10, null, '#ff00ff', 12);
            // X-Axis (Right)
            this.drawLine(x, y, x + len, y, '#00ffff', 2);
            this.drawText('X', x + len + 10, y, null, '#00ffff', 12);
        } else if (type === '2D_ZX') {
            // Z-Axis (Up)
            this.drawLine(x, y, x, y - len, '#ffff00', 2);
            this.drawText('Z', x, y - len - 10, null, '#ffff00', 12);
            // X-Axis (Right)
            this.drawLine(x, y, x + len, y, '#00ffff', 2);
            this.drawText('X', x + len + 10, y, null, '#00ffff', 12);
        } else if (type === '3D') {
            // Z-Axis (Up in this isometric view, but let's label them per our project3D math)
            // project3D uses Y as Up, X as right-down, Z as left-down
            // Let's draw arrows explicitly

            // Y-Axis (Up)
            this.drawLine(x, y, x, y - len, '#ff00ff', 2);
            this.drawText('+Y', x, y - len - 10, null, '#ff00ff', 12);

            // X-Axis (-30 deg)
            const xx = x + len * Math.cos(Math.PI / 6);
            const xy = y + len * Math.sin(Math.PI / 6);
            this.drawLine(x, y, xx, xy, '#00ffff', 2);
            this.drawText('+X', xx + 10, xy + 5, null, '#00ffff', 12);

            // Z-Axis (150 deg, or left-down)
            const zx = x - len * Math.cos(Math.PI / 6);
            const zy = y + len * Math.sin(Math.PI / 6);
            this.drawLine(x, y, zx, zy, '#ffff00', 2);
            this.drawText('+Z', zx - 15, zy + 5, null, '#ffff00', 12);
        }

        this.drawCircle(x, y, 3, '#ffffff', true);
    }

    /* --- Drawing Primitives --- */
    clear() {
        this.ctx.fillStyle = this.colors.bg;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        this.labels = []; // clear hitboxes
    }

    drawLine(x1, y1, x2, y2, color = this.colors.pipe, width = 2, dash = []) {
        this.ctx.beginPath();
        this.ctx.strokeStyle = color;
        this.ctx.lineWidth = width / this.transform.scale; // maintain visual stroke width regardless of zoom
        this.ctx.setLineDash(dash);
        this.ctx.moveTo(x1, y1);
        this.ctx.lineTo(x2, y2);
        this.ctx.stroke();
        this.ctx.setLineDash([]);
    }

    drawCircle(x, y, radius, color = this.colors.pipe, fill = false) {
        this.ctx.beginPath();
        this.ctx.strokeStyle = color;
        this.ctx.fillStyle = color;
        this.ctx.lineWidth = 2 / this.transform.scale;
        this.ctx.arc(x, y, radius, 0, Math.PI * 2);
        fill ? this.ctx.fill() : this.ctx.stroke();
    }

    drawText(text, x, y, id = null, color = this.colors.text, size = 14) {
        this.ctx.fillStyle = color;
        // Inverse scale the font so it remains readable
        const fontMult = this.fontScale || 1;
        const fontSize = (size * fontMult) / this.transform.scale;
        this.ctx.font = `${fontSize}px Consolas, monospace`;
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';

        // Add subtle background box for readability against grid
        const metrics = this.ctx.measureText(text);
        const w = metrics.width + (8 / this.transform.scale);
        const h = (size * fontMult + 4) / this.transform.scale;

        this.ctx.fillStyle = this.colors.bg;
        this.ctx.fillRect(x - w / 2, y - h / 2, w, h);

        this.ctx.fillStyle = color;
        this.ctx.fillText(text, x, y);

        // Register interactive hitbox
        if (id) {
            this.labels.push({ text, x, y, id });
        }
    }

    drawDim(x1, y1, x2, y2, text, id = null, offset = 30, color = this.colors.dim) {
        // Calculate normal vector for offset
        const dx = x2 - x1;
        const dy = y2 - y1;
        const len = Math.sqrt(dx * dx + dy * dy);
        const nx = -dy / len;
        const ny = dx / len;

        const ox1 = x1 + nx * offset;
        const oy1 = y1 + ny * offset;
        const ox2 = x2 + nx * offset;
        const oy2 = y2 + ny * offset;

        // Leader lines
        this.drawLine(x1, y1, ox1, oy1, color, 1);
        this.drawLine(x2, y2, ox2, oy2, color, 1);

        // Dimension line
        this.drawLine(ox1, oy1, ox2, oy2, color, 1);

        // Arrows (simple ticks)
        const tickSize = 6;
        const dirX = dx / len;
        const dirY = dy / len;

        // Arrow 1
        this.drawLine(ox1, oy1, ox1 + dirX * tickSize + nx * tickSize, oy1 + dirY * tickSize + ny * tickSize, color, 1);
        this.drawLine(ox1, oy1, ox1 + dirX * tickSize - nx * tickSize, oy1 + dirY * tickSize - ny * tickSize, color, 1);

        // Arrow 2
        this.drawLine(ox2, oy2, ox2 - dirX * tickSize + nx * tickSize, oy2 - dirY * tickSize + ny * tickSize, color, 1);
        this.drawLine(ox2, oy2, ox2 - dirX * tickSize - nx * tickSize, oy2 - dirY * tickSize - ny * tickSize, color, 1);

        // Text in center
        const cx = (ox1 + ox2) / 2;
        const cy = (oy1 + oy2) / 2;
        this.drawText(text, cx, cy, id, color);
    }

    // Override this in specific modules
    drawScene() { }

    render() {
        this.ctx.save();
        this.clear();

        // Apply camera
        this.ctx.translate(this.transform.x, this.transform.y);
        this.ctx.scale(this.transform.scale, this.transform.scale);

        // Execute drawing
        this.drawScene();

        this.ctx.restore();
    }
}
