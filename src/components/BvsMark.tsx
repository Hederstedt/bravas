export function BvsMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} role="img" aria-label="BVS-märke">
      <polygon
        points="32,2 60,17 60,47 32,62 4,47 4,17"
        fill="none"
        stroke="#ff7a1a"
        strokeWidth="4"
      />
      <polygon points="32,14 49,23 49,41 32,50 15,41 15,23" fill="#ff7a1a" opacity="0.18" />
      <text
        x="32"
        y="42"
        textAnchor="middle"
        fontFamily="Rajdhani, sans-serif"
        fontWeight="700"
        fontSize="24"
        fill="#ff7a1a"
      >
        B
      </text>
    </svg>
  )
}
