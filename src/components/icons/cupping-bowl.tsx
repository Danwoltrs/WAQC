interface CuppingBowlProps {
  className?: string
}

export function CuppingBowl({ className }: CuppingBowlProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {/* Bowl shape - taller and more elongated */}
      <path
        d="M 4 8 Q 4 17, 12 20 Q 20 17, 20 8 L 4 8"
        fill="none"
        strokeWidth="2"
      />
      {/* Bowl rim/top */}
      <line x1="4" y1="8" x2="20" y2="8" strokeWidth="2" />
      {/* Optional: Add a slight base */}
      <ellipse cx="12" cy="20" rx="3" ry="0.5" fill="currentColor" stroke="none" opacity="0.3" />
    </svg>
  )
}
