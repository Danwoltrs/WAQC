import type { AttributeRail } from './types'

/**
 * The cupping profile as a spider graph.
 *
 * Hand-rolled SVG rather than Recharts: this page is server-rendered and has
 * exactly one client component (the footer). Pulling a charting library in for
 * one polygon would ship a client bundle to a page whose whole job is to answer
 * one question fast on a warehouse phone.
 *
 * The shaded ring is the spec band — the polygon between each attribute's
 * minimum and maximum. The lot's own polygon sitting inside it IS the pass, so
 * the shape carries the judgement, not just the numbers.
 */

const SIZE = 340
const CX = SIZE / 2
const CY = 132
const R = 74
/** Where the axis labels sit, clear of the outer grid ring. */
const LABEL_R = R + 11
const RINGS = 4

interface Point {
  x: number
  y: number
}

/** Angle for axis `i`, starting at twelve o'clock and going clockwise. */
function angleAt(i: number, count: number): number {
  return (Math.PI * 2 * i) / count - Math.PI / 2
}

function pointAt(angle: number, radius: number): Point {
  return { x: CX + Math.cos(angle) * radius, y: CY + Math.sin(angle) * radius }
}

function polygon(points: Point[]): string {
  return points.map(p => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ')
}

/** The same ring as a closed path, so two of them can share one `fill-rule` */
function closedPath(points: Point[]): string {
  return `${points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
    .join(' ')} Z`
}

/** A value's distance from the centre, as a fraction of its own attribute's
 *  scale. Each axis carries its own scale, so a 0–10 attribute and a 0–5 one
 *  sit correctly on the same graph. */
function radiusFor(value: number, rail: AttributeRail): number {
  const span = rail.scaleMax - rail.scaleMin
  if (span <= 0) return 0
  const t = (value - rail.scaleMin) / span
  return Math.min(1, Math.max(0, t)) * R
}

function isOutside(rail: AttributeRail): boolean {
  if (rail.min !== null && rail.score < rail.min) return true
  if (rail.max !== null && rail.score > rail.max) return true
  return false
}

/** Two decimals, matching the checklist and the rails. Mixed precision down a
 *  ring of axis labels ("3.50" beside "4") reads as sloppy data. */
function formatScore(score: number): string {
  return score.toFixed(2)
}

export function CuppingSpider({ attributes }: { attributes: AttributeRail[] }) {
  const count = attributes.length
  // A polygon needs three vertices. One or two attributes are drawn as rails by
  // the caller instead.
  if (count < 3) return null

  const geometry = attributes.map((rail, i) => {
    const angle = angleAt(i, count)
    return {
      rail,
      angle,
      score: pointAt(angle, radiusFor(rail.score, rail)),
      bandMin: pointAt(angle, rail.min !== null ? radiusFor(rail.min, rail) : 0),
      bandMax: pointAt(angle, rail.max !== null ? radiusFor(rail.max, rail) : R),
      label: pointAt(angle, LABEL_R),
      outside: isOutside(rail),
    }
  })

  const hasBand = attributes.some(a => a.min !== null || a.max !== null)

  return (
    <div className="mt-1">
      <svg
        viewBox={`0 0 ${SIZE} 250`}
        className="w-full h-auto"
        role="img"
        aria-label={`Cupping profile: ${attributes
          .map(a => `${a.attribute} ${formatScore(a.score)}`)
          .join(', ')}`}
      >
        {/* Grid rings */}
        {Array.from({ length: RINGS }, (_, ring) => {
          const radius = (R * (ring + 1)) / RINGS
          return (
            <polygon
              key={ring}
              points={polygon(geometry.map(g => pointAt(g.angle, radius)))}
              fill="none"
              stroke="#3f3f3c"
              strokeWidth="1"
            />
          )
        })}

        {/* Spokes */}
        {geometry.map(g => (
          <line
            key={`spoke-${g.rail.attribute}`}
            x1={CX}
            y1={CY}
            x2={g.bandMax.x}
            y2={g.bandMax.y}
            stroke="#3f3f3c"
            strokeWidth="1"
          />
        ))}

        {/* Spec band: the ring between every minimum and every maximum. Drawn
            with evenodd so the inner polygon punches a hole rather than
            painting over it. */}
        {hasBand && (
          <path
            d={`${closedPath(geometry.map(g => g.bandMax))} ${closedPath(
              geometry.map(g => g.bandMin),
            )}`}
            fill="#6d7f37"
            fillOpacity="0.18"
            fillRule="evenodd"
          />
        )}

        {/* This lot */}
        <polygon
          points={polygon(geometry.map(g => g.score))}
          fill="#f2efe6"
          fillOpacity="0.12"
          stroke="#f2efe6"
          strokeWidth="1.75"
          strokeLinejoin="round"
        />

        {geometry.map(g => (
          <circle
            key={`pt-${g.rail.attribute}`}
            cx={g.score.x}
            cy={g.score.y}
            r={g.outside ? 3.5 : 2.5}
            fill={g.outside ? '#d9534f' : '#f2efe6'}
          />
        ))}

        {/* Axis labels: name on one line, score under it, anchored by which
            side of the circle they sit on so long names grow outward. */}
        {geometry.map(g => {
          const cos = Math.cos(g.angle)
          const anchor = cos > 0.25 ? 'start' : cos < -0.25 ? 'end' : 'middle'
          // Nudge the top and bottom labels clear of the polygon edge.
          const dy = Math.sin(g.angle) < -0.75 ? -4 : Math.sin(g.angle) > 0.75 ? 9 : 0
          return (
            <text
              key={`label-${g.rail.attribute}`}
              x={g.label.x}
              y={g.label.y + dy}
              textAnchor={anchor}
              fontSize="9.5"
              fill="#a8a69d"
            >
              {g.rail.attribute}
              <tspan
                x={g.label.x}
                dy="11"
                fontSize="10.5"
                fontWeight="700"
                fill={g.outside ? '#d9534f' : '#f2efe6'}
              >
                {formatScore(g.rail.score)}
              </tspan>
            </text>
          )
        })}
      </svg>

      {hasBand && (
        <div className="flex items-center gap-4 mt-1 text-[11px] text-[#7c7a73]">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-2 rounded-sm bg-[#6d7f37]/30" aria-hidden="true" />
            Target range
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-[2px] bg-[#f2efe6]" aria-hidden="true" />
            This lot
          </span>
        </div>
      )}
    </div>
  )
}
