interface IconProps {
  size?: number;
  className?: string;
}

/** Instant/Polaroid camera dispensing a photo — line art. */
export function InstantCameraIcon({ size = 56, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      stroke="currentColor"
      strokeWidth={4}
      strokeLinejoin="round"
      strokeLinecap="round"
      className={className}
    >
      <rect x="14" y="30" width="72" height="48" rx="9" />
      <rect x="28" y="18" width="18" height="12" rx="3" />
      <circle cx="50" cy="54" r="14" />
      <circle cx="50" cy="54" r="5.5" />
      <rect x="36" y="78" width="28" height="13" rx="1.5" />
    </svg>
  );
}

/** Receipt printer dispensing a strip with a heart — line art. */
export function ReceiptPrinterIcon({ size = 56, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      stroke="currentColor"
      strokeWidth={4}
      strokeLinejoin="round"
      strokeLinecap="round"
      className={className}
    >
      {/* printer */}
      <rect x="20" y="24" width="46" height="30" rx="4" />
      <line x1="28" y1="33" x2="58" y2="33" />
      {/* receipt strip with zigzag bottom */}
      <path d="M34 50 L34 84 L41 79 L48 84 L55 79 L62 84 L62 50" />
      {/* heart */}
      <path
        d="M48 62 C46 59.5 42.5 60 42.5 63 C42.5 66 48 69.5 48 69.5 C48 69.5 53.5 66 53.5 63 C53.5 60 50 59.5 48 62 Z"
        fill="currentColor"
        strokeWidth={2}
      />
    </svg>
  );
}
