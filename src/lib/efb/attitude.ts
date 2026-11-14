/** Phone tilt relative to a pilot-set level attitude. Not an attitude indicator. */

export function relativeAttitude(
  beta: number,
  gamma: number,
  levelBeta: number,
  levelGamma: number,
): { pitch: number; roll: number } {
  const pitch = clamp(beta - levelBeta, -25, 25);
  const roll = clamp(gamma - levelGamma, -45, 45);
  return { pitch, roll };
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}
