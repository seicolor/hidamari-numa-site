// ジオメトリ操作の小道具
import * as THREE from 'three';
import { hash2, mulberry32 } from './util.js';

export function ensureAttrs(geo) {
  const n = geo.attributes.position.count;
  if (!geo.attributes.normal) geo.computeVertexNormals();
  if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  if (!geo.attributes.color) {
    const c = new Float32Array(n * 3).fill(1);
    geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
  }
  return geo;
}

// extra: [{name, size}] 追加の頂点属性（無いパーツは0で埋める）
export function mergeGeos(list, extra = []) {
  const geos = list.map((g) => ensureAttrs(g.index ? g.toNonIndexed() : g));
  let total = 0;
  for (const g of geos) total += g.attributes.position.count;
  const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), uv = new Float32Array(total * 2), col = new Float32Array(total * 3);
  const ex = extra.map((e) => ({ ...e, arr: new Float32Array(total * e.size) }));
  let o = 0;
  for (const g of geos) {
    pos.set(g.attributes.position.array, o * 3);
    nor.set(g.attributes.normal.array, o * 3);
    uv.set(g.attributes.uv.array, o * 2);
    col.set(g.attributes.color.array, o * 3);
    for (const e of ex) if (g.attributes[e.name]) e.arr.set(g.attributes[e.name].array, o * e.size);
    o += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  for (const e of ex) out.setAttribute(e.name, new THREE.BufferAttribute(e.arr, e.size));
  return out;
}

export function colorize(geo, fn) {
  const p = geo.attributes.position;
  const c = new Float32Array(p.count * 3);
  const tmp = [1, 1, 1];
  for (let i = 0; i < p.count; i++) {
    const r = fn(p.getX(i), p.getY(i), p.getZ(i), i, tmp);
    const v = r || tmp;
    c[i * 3] = v[0]; c[i * 3 + 1] = v[1]; c[i * 3 + 2] = v[2];
  }
  geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return geo;
}

export function colorFlat(geo, rgb) {
  return colorize(geo, () => rgb);
}

// 頂点位置のハッシュで一貫した変位（法線方向 or 任意）
export function displace(geo, amp, freq = 1, seed = 0) {
  const p = geo.attributes.position;
  const n = geo.attributes.normal;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const h = hash2(Math.round(x * freq * 97 + seed), Math.round((y * 53 + z * 131) * freq));
    const d = (h - 0.5) * 2 * amp;
    p.setXYZ(i, x + n.getX(i) * d, y + n.getY(i) * d, z + n.getZ(i) * d);
  }
  geo.computeVertexNormals();
  return geo;
}

export function transform(geo, matrix) {
  geo.applyMatrix4(matrix);
  return geo;
}

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
export function M(px = 0, py = 0, pz = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
  _e.set(rx, ry, rz);
  _q.setFromEuler(_e);
  return new THREE.Matrix4().compose(new THREE.Vector3(px, py, pz), _q.clone(), new THREE.Vector3(sx, sy, sz));
}

export function instancedFrom(geo, mat, matrices, colors) {
  const m = new THREE.InstancedMesh(geo, mat, matrices.length);
  for (let i = 0; i < matrices.length; i++) m.setMatrixAt(i, matrices[i]);
  if (colors) {
    for (let i = 0; i < colors.length; i++) m.setColorAt(i, colors[i]);
    m.instanceColor.needsUpdate = true;
  }
  m.instanceMatrix.needsUpdate = true;
  m.computeBoundingSphere();
  return m;
}

export { mulberry32 };
