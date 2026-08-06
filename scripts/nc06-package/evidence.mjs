import { sealWithHash, semanticHash } from '../../src/core/nonlinear-shell-contact/contracts.js';
export const sealEvidence = (value) => sealWithHash(value,'evidenceHash');
export const maxRelative = (a,b) => Math.max(0,...Object.keys(a).filter((key)=>typeof a[key]==='number'&&typeof b[key]==='number').map((key) => Math.abs(a[key]-b[key]) / Math.max(Math.abs(a[key]),Math.abs(b[key]),1e-30)));
export const canonicalDifference = (a,b) => semanticHash(a) === semanticHash(b) ? 0 : 1;
