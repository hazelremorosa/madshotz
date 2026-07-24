import { useCallback, useEffect, useRef, useState } from "react";
import { useSettings } from "@/store/settings";

/**
 * One shared camera stream for the whole booth (warmed on Welcome, reused by
 * Capture and the Admin preview). The host picks which camera in Admin →
 * Camera; changing it tears the stream down and re-opens on the new device.
 */

let sharedStream: MediaStream | null = null;
/** Which deviceId `sharedStream` was opened with (null = system default). */
let sharedDeviceId: string | null = null;

const SIZE = { width: { ideal: 1280 }, height: { ideal: 1280 } };

function constraintsFor(deviceId: string | null): MediaStreamConstraints {
  return {
    video: deviceId
      ? { deviceId: { exact: deviceId }, ...SIZE }
      : { facingMode: "user", ...SIZE },
    audio: false,
  };
}

export async function ensureCameraStream(): Promise<MediaStream> {
  const want = useSettings.getState().cameraDeviceId;
  if (sharedStream && sharedStream.active && sharedDeviceId === want)
    return sharedStream;

  stopCameraStream();
  try {
    sharedStream = await navigator.mediaDevices.getUserMedia(constraintsFor(want));
    sharedDeviceId = want;
  } catch (err) {
    if (!want) throw err;
    // The configured camera is gone (webcam unplugged, tablet flipped). Forget
    // it and fall back to the default so the booth keeps working unattended.
    console.warn("[Mad Shots] Selected camera unavailable — using default.", err);
    useSettings.getState().set("cameraDeviceId", null);
    sharedStream = await navigator.mediaDevices.getUserMedia(constraintsFor(null));
    sharedDeviceId = null;
  }
  return sharedStream;
}

export function stopCameraStream() {
  sharedStream?.getTracks().forEach((t) => t.stop());
  sharedStream = null;
  sharedDeviceId = null;
}

export interface CameraOption {
  deviceId: string;
  label: string;
}

/**
 * Video inputs available to the browser. Labels are only populated once camera
 * permission has been granted, so this warms the stream first.
 */
export async function listCameras(): Promise<CameraOption[]> {
  if (!navigator.mediaDevices?.enumerateDevices) return [];
  await ensureCameraStream().catch(() => undefined);
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices
      .filter((d) => d.kind === "videoinput")
      .map((d, i) => ({
        deviceId: d.deviceId,
        label: d.label || `Camera ${i + 1}`,
      }));
  } catch {
    return [];
  }
}

export type CameraStatus = "idle" | "starting" | "ready" | "denied" | "error";

/** Attaches the shared camera stream to a <video> and exposes capture(). */
export function useCamera() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState<CameraStatus>("idle");
  // Re-opens the stream when the host picks a different camera in Admin.
  const deviceId = useSettings((s) => s.cameraDeviceId);

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
  }, [start, deviceId]);

  /** Returns a square JPEG data URL matching the on-screen preview. */
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
    // Mirror only when the preview is mirrored, so what you see is what prints.
    if (useSettings.getState().mirrorPreview) {
      ctx.translate(side, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(v, sx, sy, side, side, 0, 0, side, side);
    return c.toDataURL("image/jpeg", 0.92);
  }, []);

  return { videoRef, status, start, capture };
}
