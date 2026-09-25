/**
 * Annual Quality Performance Review — A4 landscape throughout.
 * Order: cover · year in review · PSS by sample · PSS month by month ·
 * SS by bags · SS month by month · quality findings · supplier review ·
 * supply chain flow. A section without data is left out; section numbers
 * run over the sections actually printed.
 */
import React from 'react'
import { Document } from '@react-pdf/renderer'
import '@/components/pdf/certificate/certificate-styles'
import type { AnnualPerformanceReportData, MonthlySection } from '@/lib/reports/annual-data'
import { CoverPage } from './cover-page'
import { PerformancePage } from './performance-page'
import { MonthlyChainPage, MonthlyPage } from './monthly-page'
import { methodologyText } from './methodology'

export interface AnnualReportProps {
  data: AnnualPerformanceReportData
  wolthersLogoBase64?: string
  clientLogoBase64?: string
  flagsBase64?: string[]
}

export interface AnnualSection {
  key: string
  render: (sectionNumber: string) => React.ReactElement
}

function chainGrids(section: MonthlySection): Array<{ title: string; grid: NonNullable<MonthlySection['byImporter']> }> {
  const out: Array<{ title: string; grid: NonNullable<MonthlySection['byImporter']> }> = []
  if (section.byImporter) out.push({ title: 'By importer', grid: section.byImporter })
  if (section.byRoaster) out.push({ title: 'By roaster', grid: section.byRoaster })
  return out
}

export function annualSections(props: AnnualReportProps): AnnualSection[] {
  const { agg, client, period } = props.data
  const common = { clientName: client.name, year: period.year }
  const sections: AnnualSection[] = []

  if (agg.pss.totals.evaluated > 0) {
    sections.push({
      key: 'pss-performance',
      render: n => <PerformancePage key="pss-performance" sectionNumber={n} bucket="pss" agg={agg} {...common} />,
    })
    sections.push({
      key: 'pss-monthly',
      render: n => <MonthlyPage key="pss-monthly" sectionNumber={n} bucket="pss" section={agg.months.pss} yearContainers={null} {...common} />,
    })
    const pssChain = chainGrids(agg.months.pss)
    if (pssChain.length > 0) {
      sections.push({
        key: 'pss-monthly-chain',
        render: n => <MonthlyChainPage key="pss-monthly-chain" sectionNumber={n} bucket="pss" grids={pssChain} {...common} />,
      })
    }
  }
  if (agg.ss.totals.evaluated > 0) {
    sections.push({
      key: 'ss-performance',
      render: n => <PerformancePage key="ss-performance" sectionNumber={n} bucket="ss" agg={agg} {...common} />,
    })
    sections.push({
      key: 'ss-monthly',
      render: n => <MonthlyPage key="ss-monthly" sectionNumber={n} bucket="ss" section={agg.months.ss} yearContainers={agg.ssContainers.total} {...common} />,
    })
    const ssChain = chainGrids(agg.months.ss)
    if (ssChain.length > 0) {
      sections.push({
        key: 'ss-monthly-chain',
        render: n => <MonthlyChainPage key="ss-monthly-chain" sectionNumber={n} bucket="ss" grids={ssChain} {...common} />,
      })
    }
  }
  return sections
}

export function AnnualReport(props: AnnualReportProps) {
  const { data, wolthersLogoBase64, clientLogoBase64, flagsBase64 = [] } = props
  const sections = annualSections(props)
  return (
    <Document
      title={`${data.client.name} — Annual Quality Performance Review ${data.period.year}`}
      author="Wolthers & Associates"
    >
      <CoverPage
        clientName={data.client.name}
        year={data.period.year}
        issuedAt={data.period.issued_at}
        glance={data.agg.glance}
        labs={data.agg.labsCovered}
        wolthersLogo={wolthersLogoBase64}
        clientLogo={clientLogoBase64}
        flags={flagsBase64}
        methodology={sections.length === 0 ? methodologyText(data) : null}
      />
      {sections.map((section, i) => section.render(String(i + 1).padStart(2, '0')))}
    </Document>
  )
}
