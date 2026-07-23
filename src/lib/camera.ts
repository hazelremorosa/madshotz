import { useCallback, useEffect, useRef, useState } from "react";

let sharedStream: MediaStream | null = null;

export async function ensureCameraStream(): Promise<MediaStream> {
  if (sharedStream && sharedStream.active) return sharedStream;
  sharedStream = await navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: "user",
      width: { ideal: 1280 },
      height: { ideal: 1280 },
    },
    audio: false,
  });
  return sharedStream;
}

export function stopCameraStream() {
  sharedStream?.getTracks().forEach((t) => t.stop());
  sharedStream = null;
}

export type CameraStatus = "idle" | "starting" | "ready" | "denied" | "error";

/** Attaches the shared camera stream to a <video> and exposes capture(). */
export function useCamera() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState<CameraStatus>("idle");

  const start = useCallback(async () => {
    setStatus("starting");
    try {
      const stream = await ensureCameraStream();
      const v = videoRef.current;
      if (v) {
        v.srcObject = stream;
        await v.play().catch(() => undefined);
      }
      setStatus("ready");
    } catch (err) {
      const denied =
        err instanceof DOMException &&
        (err.name === "NotAllowedError" || err.name === "SecurityError");
      setStatus(denied ? "denied" : "error");
    }
  }, []);

  useEffect(() => {
    start();
  }, [start]);

  /** Returns a mirrored JPEG data URL matching the on-screen selfie preview. */
  const capture = useCallback((): string | null => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return null;
    const side = Math.min(v.videoWidth, v.videoHeight);
    const c = document.createElement("canvas");
    c.width = side;
    c.height = side;
    const ctx = c.getContext("2d");
    if (!ctx) return null;
    const sx = (v.videoWidth - side) / 2;
    const sy = (v.videoHeight - side) / 2;
    ctx.translate(side, 0);
    ctx.scale(-1, 1); // mirror to match preview
    ctx.drawImage(v, sx, sy, side, side, 0, 0, side, side);
    return c.toDataURL("image/jpeg", 0.92);
  }, []);

  return { videoRef, status, start, capture };
}
