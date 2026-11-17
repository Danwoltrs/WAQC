'use client'

import dynamic from 'next/dynamic'
import { AttributeWithScale } from '@/types/cupping-templates'
import { validateScoreAgainstRule } from '@/types/attribute-scales'

// Dynamic import of Plotly to avoid SSR issues
const Plot = dynamic(() => import('react-plotly.js'), { ssr: false })

interface CuppingAttribute {
  attribute: string
  value: number | null
}

interface AttributeSpiderChartProps {
  cuppingData: { attributes: CuppingAttribute[] } | undefined
  attributes: AttributeWithScale[]
  theme: 'light' | 'dark'
}

export function AttributeSpiderChart({ cuppingData, attributes, theme }: AttributeSpiderChartProps) {
  return (
    <>
      {/* Spider Chart Visualization - Outside the table, no card wrapper */}
      <div className="hidden md:block w-[420px] flex-shrink-0">
        {cuppingData && cuppingData.attributes.some(a => a.value !== null) ? (
          (() => {
            const chartAttributes = attributes.filter(a => a.scale.type !== 'boolean')

            if (chartAttributes.length === 0) return null

            const minScaleValue = Math.min(
              ...chartAttributes.map(({ scale }) =>
                scale.type === 'numeric' ? scale.min : (scale.type === 'wording' ? Math.min(...scale.options.map(o => o.value)) : 0)
              )
            )

            const maxScaleValue = Math.max(
              ...chartAttributes.map(({ scale }) =>
                scale.type === 'numeric' ? scale.max : (scale.type === 'wording' ? Math.max(...scale.options.map(o => o.value)) : 10)
              )
            )

            const scaleRange = maxScaleValue - minScaleValue
            const tickInterval = scaleRange <= 5 ? 1 : 2
            const numTicks = Math.ceil(scaleRange / tickInterval) + 1
            const tickVals = Array.from({ length: numTicks }, (_, i) => minScaleValue + i * tickInterval)

            const values = chartAttributes.map(({ attribute }) => {
              const attrScore = cuppingData.attributes.find(a => a.attribute === attribute)
              return attrScore?.value ?? 0
            })

            const formattedLabels = chartAttributes.map(({ attribute, validation_rule }, idx) => {
              const score = values[idx]
              const scoreDisplay = score > 0 ? ` ${score}` : ''

              const attrData = cuppingData.attributes.find(a => a.attribute === attribute)
              const isOutOfSpec = attrData?.value && validation_rule
                ? !validateScoreAgainstRule(attrData.value, validation_rule).valid
                : false

              const normalColor = theme === 'dark' ? '#ffffff' : '#000000'
              const outOfSpecColor = '#ef4444'
              const labelColor = isOutOfSpec ? outOfSpecColor : normalColor

              if (validation_rule && validation_rule.type === 'range' && validation_rule.max_value !== undefined) {
                const center = (validation_rule.min_value + validation_rule.max_value) / 2
                const tolerance = (validation_rule.max_value - validation_rule.min_value) / 2
                const centerStr = Number(center.toFixed(2)).toString()
                const toleranceStr = Number(tolerance.toFixed(2)).toString()
                return `<span style="color: ${labelColor}">${attribute}${scoreDisplay}<br><span style="font-size: 9px">(${centerStr} +/- ${toleranceStr})</span></span>`
              }
              return `<span style="color: ${labelColor}">${attribute}${scoreDisplay}</span>`
            })

            const closedValues = [...values, values[0]]
            const closedLabels = [...formattedLabels, formattedLabels[0]]

            const allWithinSpec = cuppingData.attributes.every(a => {
              const attr = chartAttributes.find(attr => attr.attribute === a.attribute)
              if (!a.value || !attr?.validation_rule) return true
              return validateScoreAgainstRule(a.value, attr.validation_rule).valid
            })

            const lineColor = allWithinSpec ? '#22c55e' : '#ef4444'
            const labelColor = theme === 'dark' ? '#ffffff' : '#000000'
            const tickColor = theme === 'dark' ? '#aaaaaa' : '#666666'

            return (
              // @ts-ignore - Plotly.js types are incomplete
              <Plot
                key={theme}
                data={[
                  {
                    type: 'scatterpolar',
                    r: closedValues,
                    theta: closedLabels,
                    fill: 'toself',
                    fillcolor: allWithinSpec ? 'rgba(34, 197, 94, 0.4)' : 'rgba(239, 68, 68, 0.4)',
                    line: {
                      color: lineColor,
                      width: 2
                    },
                    marker: {
                      color: lineColor,
                      size: 6
                    }
                  }
                ]}
                layout={{
                  autosize: true,
                  height: 380,
                  polar: {
                    radialaxis: {
                      visible: true,
                      range: [minScaleValue, maxScaleValue],
                      tickvals: tickVals,
                      tickfont: {
                        size: 10,
                        color: tickColor
                      },
                      gridcolor: 'rgba(128, 128, 128, 0.2)'
                    },
                    angularaxis: {
                      tickfont: {
                        size: 11,
                        color: labelColor
                      }
                    },
                    bgcolor: 'transparent'
                  },
                  plot_bgcolor: 'transparent',
                  paper_bgcolor: 'transparent',
                  font: {
                    color: labelColor
                  },
                  margin: { t: 60, r: 80, b: 60, l: 80 },
                  showlegend: false
                }}
                config={{ displayModeBar: false, responsive: true }}
                className="w-full"
              />
            )
          })()
        ) : (
          <div className="flex items-center justify-center h-[380px] text-xs text-muted-foreground">
            Start scoring to see chart
          </div>
        )}
      </div>
    </>
  )
}
