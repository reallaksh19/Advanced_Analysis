import { cleanNumber } from './numeric.js';

export function add(a, b) {
  return a.map((value, index) => cleanNumber(value + b[index]));
}

export function subtract(a, b) {
  return a.map((value, index) => cleanNumber(value - b[index]));
}

export function scale(vector, factor) {
  return vector.map((value) => cleanNumber(value * factor));
}

export function dot(a, b) {
  let value = 0;
  for (let index = 0; index < a.length; index += 1) value += a[index] * b[index];
  return cleanNumber(value);
}

export function cross(a, b) {
  return [
    cleanNumber(a[1] * b[2] - a[2] * b[1]),
    cleanNumber(a[2] * b[0] - a[0] * b[2]),
    cleanNumber(a[0] * b[1] - a[1] * b[0]),
  ];
}

export function norm(vector) {
  return cleanNumber(Math.hypot(...vector));
}

export function normalize(vector) {
  const length = norm(vector);
  if (!(length > 0)) throw new Error('Cannot normalize zero vector');
  return scale(vector, 1 / length);
}

export function outer(a, b) {
  return a.map((value) => b.map((other) => cleanNumber(value * other)));
}
