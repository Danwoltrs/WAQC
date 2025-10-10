interface CuppingSpoonProps {
  className?: string
}

export function CuppingSpoon({ className }: CuppingSpoonProps) {
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
      {/* Spoon bowl (rounded end) */}
      <ellipse cx="6" cy="12" rx="4" ry="3" fill="currentColor" stroke="none" />

      {/* Spoon handle */}
      <path
        d="M 9.5 12 Q 12 12, 14 11 T 20 8"
        fill="none"
        strokeWidth="2.5"
      />
    </svg>
  )
}
