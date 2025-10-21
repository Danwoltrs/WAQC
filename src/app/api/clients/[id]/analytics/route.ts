import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { subMonths, startOfMonth, endOfMonth, format, differenceInDays } from 'date-fns'

/**
 * GET /api/clients/[id]/analytics
 * Get comprehensive analytics for a client
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()

    // Check authentication
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const { searchParams } = new URL(request.url)
    const months = parseInt(searchParams.get('months') || '12')

    // Calculate date range
    const endDate = new Date()
    const startDate = subMonths(endDate, months)

    // Fetch all samples for the client within the date range
    const { data: samples, error: samplesError } = await supabase
      .from('samples')
      .select(
        `
        id,
        tracking_number,
        status,
        origin,
        created_at,
        updated_at,
        cupping_sessions (
          id,
          final_score,
          created_at
        ),
        certificates (
          id,
          created_at,
          delivered_at
        )
      `
      )
      .eq('client_id', id)
      .gte('created_at', startDate.toISOString())
      .lte('created_at', endDate.toISOString())
      .order('created_at', { ascending: true })

    if (samplesError) {
      console.error('Error fetching samples:', samplesError)
      return NextResponse.json({ error: 'Failed to fetch samples' }, { status: 500 })
    }

    // Generate monthly volume trends
    const volumeTrends = generateVolumeTrends(samples || [], startDate, endDate)

    // Generate quality trends
    const qualityTrends = generateQualityTrends(samples || [], startDate, endDate)

    // Calculate certificate statistics
    const certificateStats = calculateCertificateStats(samples || [])

    // Calculate engagement metrics
    const engagementMetrics = calculateEngagementMetrics(samples || [], months)

    // Calculate performance indicators
    const performanceIndicators = calculatePerformanceIndicators(samples || [])

    return NextResponse.json({
      volumeTrends,
      qualityTrends,
      certificateStats,
      engagementMetrics,
      performanceIndicators,
    })
  } catch (error) {
    console.error('Error in GET /api/clients/[id]/analytics:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

function generateVolumeTrends(samples: any[], startDate: Date, endDate: Date) {
  const monthlyData: Record<
    string,
    { samples: number; approved: number; rejected: number }
  > = {}

  // Initialize all months in the range
  let currentDate = startOfMonth(startDate)
  while (currentDate <= endDate) {
    const monthKey = format(currentDate, 'MMM yyyy')
    monthlyData[monthKey] = { samples: 0, approved: 0, rejected: 0 }
    currentDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1)
  }

  // Count samples by month
  samples.forEach((sample) => {
    const monthKey = format(new Date(sample.created_at), 'MMM yyyy')
    if (monthlyData[monthKey]) {
      monthlyData[monthKey].samples++
      if (sample.status === 'approved') {
        monthlyData[monthKey].approved++
      } else if (sample.status === 'rejected') {
        monthlyData[monthKey].rejected++
      }
    }
  })

  return Object.entries(monthlyData).map(([month, data]) => ({
    month,
    ...data,
  }))
}

function generateQualityTrends(samples: any[], startDate: Date, endDate: Date) {
  const monthlyScores: Record<string, number[]> = {}

  // Initialize all months
  let currentDate = startOfMonth(startDate)
  while (currentDate <= endDate) {
    const monthKey = format(currentDate, 'MMM yyyy')
    monthlyScores[monthKey] = []
    currentDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1)
  }

  // Collect scores by month
  samples.forEach((sample) => {
    if (sample.cupping_sessions && sample.cupping_sessions.length > 0) {
      const monthKey = format(new Date(sample.created_at), 'MMM yyyy')
      sample.cupping_sessions.forEach((session: any) => {
        if (session.final_score && monthlyScores[monthKey]) {
          monthlyScores[monthKey].push(session.final_score)
        }
      })
    }
  })

  return Object.entries(monthlyScores).map(([month, scores]) => {
    if (scores.length === 0) {
      return { month, avgScore: 0, minScore: 0, maxScore: 0 }
    }

    const avgScore = scores.reduce((sum, score) => sum + score, 0) / scores.length
    const minScore = Math.min(...scores)
    const maxScore = Math.max(...scores)

    return {
      month,
      avgScore: Math.round(avgScore * 10) / 10,
      minScore: Math.round(minScore * 10) / 10,
      maxScore: Math.round(maxScore * 10) / 10,
    }
  })
}

function calculateCertificateStats(samples: any[]) {
  const now = new Date()
  const thisMonthStart = startOfMonth(now)
  const lastMonthStart = startOfMonth(subMonths(now, 1))
  const lastMonthEnd = endOfMonth(subMonths(now, 1))

  let total = 0
  let thisMonth = 0
  let lastMonth = 0
  const deliveryTimes: number[] = []

  samples.forEach((sample) => {
    if (sample.certificates && sample.certificates.length > 0) {
      sample.certificates.forEach((cert: any) => {
        total++
        const certDate = new Date(cert.created_at)

        if (certDate >= thisMonthStart) {
          thisMonth++
        }

        if (certDate >= lastMonthStart && certDate <= lastMonthEnd) {
          lastMonth++
        }

        // Calculate delivery time if delivered
        if (cert.delivered_at) {
          const deliveryTime = differenceInDays(
            new Date(cert.delivered_at),
            new Date(cert.created_at)
          )
          deliveryTimes.push(deliveryTime)
        }
      })
    }
  })

  const avgDeliveryTime =
    deliveryTimes.length > 0
      ? deliveryTimes.reduce((sum, time) => sum + time, 0) / deliveryTimes.length
      : 0

  return {
    total,
    thisMonth,
    lastMonth,
    avgDeliveryTime: Math.round(avgDeliveryTime * 10) / 10,
  }
}

function calculateEngagementMetrics(samples: any[], months: number) {
  const totalSamples = samples.length
  const avgSamplesPerMonth = totalSamples / months

  // Calculate response time (sample received to first assessment)
  const responseTimes: number[] = []
  samples.forEach((sample) => {
    if (sample.updated_at && sample.created_at) {
      const responseTime = differenceInDays(
        new Date(sample.updated_at),
        new Date(sample.created_at)
      )
      if (responseTime > 0) {
        responseTimes.push(responseTime)
      }
    }
  })

  const responseTime =
    responseTimes.length > 0
      ? responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length
      : 0

  // Calculate approval rate
  const approvedCount = samples.filter((s) => s.status === 'approved').length
  const completedCount = samples.filter((s) =>
    ['approved', 'rejected'].includes(s.status)
  ).length
  const approvalRate = completedCount > 0 ? (approvedCount / completedCount) * 100 : 0

  return {
    totalSamples,
    avgSamplesPerMonth: Math.round(avgSamplesPerMonth * 10) / 10,
    responseTime: Math.round(responseTime * 10) / 10,
    approvalRate: Math.round(approvalRate * 10) / 10,
  }
}

function calculatePerformanceIndicators(samples: any[]) {
  // Calculate overall quality score from cupping sessions
  const allScores: number[] = []
  samples.forEach((sample) => {
    if (sample.cupping_sessions && sample.cupping_sessions.length > 0) {
      sample.cupping_sessions.forEach((session: any) => {
        if (session.final_score) {
          allScores.push(session.final_score)
        }
      })
    }
  })

  const qualityScore =
    allScores.length > 0
      ? (allScores.reduce((sum, score) => sum + score, 0) / allScores.length / 100) * 100
      : 0

  // Calculate on-time delivery (certificates delivered within 3 days)
  let onTimeCount = 0
  let totalDelivered = 0

  samples.forEach((sample) => {
    if (sample.certificates && sample.certificates.length > 0) {
      sample.certificates.forEach((cert: any) => {
        if (cert.delivered_at) {
          totalDelivered++
          const deliveryTime = differenceInDays(
            new Date(cert.delivered_at),
            new Date(cert.created_at)
          )
          if (deliveryTime <= 3) {
            onTimeCount++
          }
        }
      })
    }
  })

  const onTimeDelivery = totalDelivered > 0 ? (onTimeCount / totalDelivered) * 100 : 0

  // Satisfaction rating (based on approval rate)
  const approvedCount = samples.filter((s) => s.status === 'approved').length
  const completedCount = samples.filter((s) =>
    ['approved', 'rejected'].includes(s.status)
  ).length
  const satisfactionRating = completedCount > 0 ? (approvedCount / completedCount) * 100 : 0

  return {
    qualityScore: Math.round(qualityScore * 10) / 10,
    onTimeDelivery: Math.round(onTimeDelivery * 10) / 10,
    satisfactionRating: Math.round(satisfactionRating * 10) / 10,
  }
}
