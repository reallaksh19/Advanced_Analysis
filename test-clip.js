import * as THREE from 'three';
import { clippingPlanes, setClippingBounds } from './src/utils/viewer3d.js';

console.log("Initial MaxX constant:", clippingPlanes[1].constant);
setClippingBounds(-100, 50, -100, 100, -100, 100);
console.log("Updated MaxX constant:", clippingPlanes[1].constant);
