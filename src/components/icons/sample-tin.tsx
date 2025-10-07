import React from 'react'

interface SampleTinProps {
  className?: string
}

export const SampleTin: React.FC<SampleTinProps> = ({ className }) => {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Lid ellipse (top) */}
      <ellipse cx="12" cy="6" rx="8" ry="2" />

      {/* Lid ring */}
      <path d="M 4 6 L 4 8 Q 4 9.5 12 9.5 Q 20 9.5 20 8 L 20 6" />

      {/* Main body - left side */}
      <line x1="4" y1="8" x2="4" y2="20" />

      {/* Main body - right side */}
      <line x1="20" y1="8" x2="20" y2="20" />

      {/* Bottom arc (only visible bottom portion) */}
      <path d="M 4 20 A 8 2 0 0 0 20 20" />
    </svg>
  )
}
