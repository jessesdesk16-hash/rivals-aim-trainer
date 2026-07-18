// ===== UTILITY FUNCTIONS =====
export function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
export function lerp(a, b, t) { return a + (b - a) * t; }
export function randomInRange(min, max) { return Math.random() * (max - min) + min; }
export function randomIntInRange(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
export function distance2D(x1, z1, x2, z2) { const dx = x2 - x1, dz = z2 - z1; return Math.sqrt(dx * dx + dz * dz); }
export function distance3D(a, b) { const dx = b.x-a.x, dy = b.y-a.y, dz = b.z-a.z; return Math.sqrt(dx*dx+dy*dy+dz*dz); }
export function angleBetween(x1, z1, x2, z2) { return Math.atan2(x2 - x1, z2 - z1); }

export function checkAABBCollision(a, b) {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY && a.minZ <= b.maxZ && a.maxZ >= b.minZ;
}
export function checkPointInBox(p, b) {
  return p.x >= b.minX && p.x <= b.maxX && p.y >= b.minY && p.y <= b.maxY && p.z >= b.minZ && p.z <= b.maxZ;
}
export function checkSphereBoxCollision(center, radius, box) {
  const cx = clamp(center.x, box.minX, box.maxX);
  const cy = clamp(center.y, box.minY, box.maxY);
  const cz = clamp(center.z, box.minZ, box.maxZ);
  const dx = center.x - cx, dy = center.y - cy, dz = center.z - cz;
  return (dx*dx + dy*dy + dz*dz) <= radius * radius;
}
export function resolveCollisions(pos, radius, boxes) {
  const out = { x: pos.x, y: pos.y, z: pos.z };
  for (const b of boxes) {
    const cx = clamp(out.x, b.minX, b.maxX);
    const cz = clamp(out.z, b.minZ, b.maxZ);
    const dx = out.x - cx, dz = out.z - cz;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist < radius && out.y < b.maxY && out.y > b.minY - 1.7) {
      if (dist === 0) { out.x += radius; } else {
        const push = (radius - dist) / dist;
        out.x += dx * push;
        out.z += dz * push;
      }
    }
  }
  return out;
}
export function rayAABBIntersect(origin, dir, box) {
  let tmin = (box.minX - origin.x) / (dir.x || 1e-10);
  let tmax = (box.maxX - origin.x) / (dir.x || 1e-10);
  if (tmin > tmax) [tmin, tmax] = [tmax, tmin];
  let tymin = (box.minY - origin.y) / (dir.y || 1e-10);
  let tymax = (box.maxY - origin.y) / (dir.y || 1e-10);
  if (tymin > tymax) [tymin, tymax] = [tymax, tymin];
  if (tmin > tymax || tymin > tmax) return null;
  if (tymin > tmin) tmin = tymin;
  if (tymax < tmax) tmax = tymax;
  let tzmin = (box.minZ - origin.z) / (dir.z || 1e-10);
  let tzmax = (box.maxZ - origin.z) / (dir.z || 1e-10);
  if (tzmin > tzmax) [tzmin, tzmax] = [tzmax, tzmin];
  if (tmin > tzmax || tzmin > tmax) return null;
  if (tzmin > tmin) tmin = tzmin;
  if (tmin < 0) return null;
  return tmin;
}
