import { useEffect } from "react";
import { useTrack } from "@/lib/efb/track";

type OrientationWithPermission = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<"granted" | "denied">;
};

/** Ask for motion access. iPhone requires this from a tap. Other devices already allow it. */
export async function enableTilt(): Promise<boolean> {
  const ctor = typeof DeviceOrientationEvent === "undefined" ? null : (DeviceOrientationEvent as OrientationWithPermission);
  if (ctor?.requestPermission) {
    try {
      return (await ctor.requestPermission()) === "granted";
    } catch {
      return false;
    }
  }
  return true;
}

/** Listen for phone pitch and bank. A laptop never sends these events. */
export function AttitudeFeed() {
  useEffect(() => {
    const onOrient = (e: DeviceOrientationEvent) => {
      if (e.beta == null || e.gamma == null) return;
      useTrack.getState().setRawAttitude(e.beta, e.gamma);
    };
    window.addEventListener("deviceorientation", onOrient);
    return () => window.removeEventListener("deviceorientation", onOrient);
  }, []);
  return null;
}
