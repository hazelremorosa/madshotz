/** Global SVG clip-paths (objectBoundingBox units) referenced by photo shapes. */
export function ShapeDefs() {
  return (
    <svg width="0" height="0" className="absolute" aria-hidden>
      <defs>
        <clipPath id="heartClip" clipPathUnits="objectBoundingBox">
          <path
            d="M0.5,0.86
               C0.16,0.62 0.0,0.42 0.0,0.24
               C0.0,0.09 0.12,0.02 0.26,0.02
               C0.37,0.02 0.46,0.09 0.5,0.2
               C0.54,0.09 0.63,0.02 0.74,0.02
               C0.88,0.02 1.0,0.09 1.0,0.24
               C1.0,0.42 0.84,0.62 0.5,0.86 Z"
          />
        </clipPath>
      </defs>
    </svg>
  );
}
