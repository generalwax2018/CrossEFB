/** Web-mercator tile math and Terrarium elevation decoding. No network. */

export function tileOf(lat: number, lon: number, z: number): { x: number; y: number; px: number; py: number } {
  const n = 2 ** z;
  const fx = ((lon + 180) / 360) * n;
  const latRad = (lat * Math.PI) / 180;
  const fy = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;
  const x = Math.floor(fx);
  const y = Math.floor(fy);
  return {
    x,
    y,
    px: Math.min(255, Math.max(0, Math.floor((fx - x) * 256))),
    py: Math.min(255, Math.max(0, Math.floor((fy - y) * 256))),
  };
}

/** Terrarium PNG pixel to feet. */
export function terrariumFeet(r: number, g: number, b: number): number {
  return (r * 256 + g + b / 256 - 32768) * 3.28084;
}
