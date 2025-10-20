import { createClient } from '@/lib/supabase-server'

export type NotificationPriority = 'urgent' | 'normal' | 'info'
export type NotificationType = 'info' | 'warning' | 'success' | 'error'

interface CreateNotificationParams {
  type: NotificationType
  priority?: NotificationPriority
  title: string
  message: string
  link?: string
  metadata?: Record<string, any>
  user_id?: string
  laboratory_id?: string
  client_id?: string
}

interface LogActivityParams {
  action: string
  entity_type: string
  entity_id?: string
  entity_name?: string
  metadata?: Record<string, any>
  laboratory_id?: string
  client_id?: string
}

/**
 * Create a notification in the database
 * This will trigger real-time updates to connected clients
 */
export async function createNotification(params: CreateNotificationParams) {
  try {
    const supabase = await createClient()

    // Get current user
    const { data: { user } } = await supabase.auth.getUser()

    const { data, error } = await supabase
      .from('notifications' as any)
      .insert({
        type: params.type,
        title: params.title,
        message: params.message,
        link: params.link || null,
        metadata: {
          ...params.metadata,
          priority: params.priority || 'normal'
        },
        user_id: params.user_id || null,
        laboratory_id: params.laboratory_id || null,
        client_id: params.client_id || null,
        read: false
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating notification:', error)
      return { success: false, error }
    }

    return { success: true, data }
  } catch (error) {
    console.error('Error in createNotification:', error)
    return { success: false, error }
  }
}

/**
 * Log an activity in the activity feed
 * This will trigger real-time updates to connected clients
 */
export async function logActivity(params: LogActivityParams) {
  try {
    const supabase = await createClient()

    // Get current user
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return { success: false, error: 'No authenticated user' }
    }

    const { data, error } = await supabase
      .from('activity_feed' as any)
      .insert({
        user_id: user.id,
        actor_id: user.id,
        action: params.action,
        entity_type: params.entity_type,
        entity_id: params.entity_id || null,
        entity_name: params.entity_name || null,
        metadata: params.metadata || {},
        laboratory_id: params.laboratory_id || null,
        client_id: params.client_id || null
      })
      .select()
      .single()

    if (error) {
      console.error('Error logging activity:', error)
      return { success: false, error }
    }

    return { success: true, data }
  } catch (error) {
    console.error('Error in logActivity:', error)
    return { success: false, error }
  }
}

/**
 * Helper functions for common notification scenarios
 */
export const notifications = {
  // Urgent notifications
  certificateReady: (clientId: string, certificateId: string, sampleName: string) =>
    createNotification({
      type: 'success',
      priority: 'urgent',
      title: 'Certificate Ready',
      message: `Certificate for ${sampleName} is ready for download`,
      link: `/certificates/${certificateId}`,
      client_id: clientId,
      metadata: { certificate_id: certificateId }
    }),

  specificationViolation: (clientId: string, sampleId: string, sampleName: string, violations: string[]) =>
    createNotification({
      type: 'error',
      priority: 'urgent',
      title: 'Specification Violation',
      message: `Sample ${sampleName} did not meet quality requirements: ${violations.join(', ')}`,
      link: `/samples/${sampleId}`,
      client_id: clientId,
      metadata: { sample_id: sampleId, violations }
    }),

  ocrFailed: (laboratoryId: string, sampleId: string) =>
    createNotification({
      type: 'error',
      priority: 'urgent',
      title: 'OCR Processing Failed',
      message: 'Manual entry required for sample processing',
      link: `/samples/${sampleId}`,
      laboratory_id: laboratoryId,
      metadata: { sample_id: sampleId }
    }),

  paymentDue: (clientId: string, invoiceId: string, amount: number) =>
    createNotification({
      type: 'warning',
      priority: 'urgent',
      title: 'Payment Due',
      message: `Invoice payment of $${amount.toFixed(2)} is due`,
      link: `/invoices/${invoiceId}`,
      client_id: clientId,
      metadata: { invoice_id: invoiceId, amount }
    }),

  // Normal notifications
  cuppingSessionScheduled: (laboratoryId: string, sessionId: string, date: string) =>
    createNotification({
      type: 'info',
      priority: 'normal',
      title: 'Cupping Session Scheduled',
      message: `Cupping session scheduled for ${date}`,
      link: `/cupping-sessions/${sessionId}`,
      laboratory_id: laboratoryId,
      metadata: { session_id: sessionId, date }
    }),

  samplesNearingDeadline: (laboratoryId: string, count: number) =>
    createNotification({
      type: 'warning',
      priority: 'normal',
      title: 'Samples Nearing Deadline',
      message: `${count} samples approaching processing deadline`,
      link: '/samples?filter=urgent',
      laboratory_id: laboratoryId,
      metadata: { count }
    }),

  storageNearlyFull: (laboratoryId: string, percentage: number) =>
    createNotification({
      type: 'warning',
      priority: 'normal',
      title: 'Storage Nearly Full',
      message: `Sample storage is ${percentage}% full`,
      link: '/storage',
      laboratory_id: laboratoryId,
      metadata: { percentage }
    }),

  // Info notifications
  systemUpdate: (message: string) =>
    createNotification({
      type: 'info',
      priority: 'info',
      title: 'System Update',
      message,
      metadata: { type: 'system_update' }
    })
}

/**
 * Helper functions for common activity logging
 */
export const activities = {
  clientCreated: (clientId: string, clientName: string, laboratoryId?: string) =>
    logActivity({
      action: 'created',
      entity_type: 'client',
      entity_id: clientId,
      entity_name: clientName,
      laboratory_id: laboratoryId
    }),

  qualityTemplateCreated: (templateId: string, templateName: string, laboratoryId?: string) =>
    logActivity({
      action: 'created',
      entity_type: 'quality_template',
      entity_id: templateId,
      entity_name: templateName,
      laboratory_id: laboratoryId
    }),

  sampleRegistered: (sampleId: string, sampleName: string, clientName: string, laboratoryId?: string) =>
    logActivity({
      action: 'registered',
      entity_type: 'sample',
      entity_id: sampleId,
      entity_name: sampleName,
      laboratory_id: laboratoryId,
      metadata: { client: clientName }
    }),

  qualityAssessmentCompleted: (sampleId: string, sampleName: string, result: string, laboratoryId?: string) =>
    logActivity({
      action: 'completed assessment',
      entity_type: 'sample',
      entity_id: sampleId,
      entity_name: sampleName,
      laboratory_id: laboratoryId,
      metadata: { result }
    }),

  cuppingSessionCompleted: (sessionId: string, sessionName: string, laboratoryId?: string) =>
    logActivity({
      action: 'completed cupping',
      entity_type: 'cupping_session',
      entity_id: sessionId,
      entity_name: sessionName,
      laboratory_id: laboratoryId
    }),

  certificateGenerated: (certificateId: string, sampleName: string, clientName: string, laboratoryId?: string) =>
    logActivity({
      action: 'generated certificate',
      entity_type: 'certificate',
      entity_id: certificateId,
      entity_name: `Certificate for ${sampleName}`,
      laboratory_id: laboratoryId,
      metadata: { client: clientName, sample: sampleName }
    }),

  sampleStored: (sampleId: string, sampleName: string, location: string, laboratoryId?: string) =>
    logActivity({
      action: 'stored',
      entity_type: 'sample',
      entity_id: sampleId,
      entity_name: sampleName,
      laboratory_id: laboratoryId,
      metadata: { location }
    }),

  specificationAssigned: (sampleId: string, sampleName: string, templateName: string, laboratoryId?: string) =>
    logActivity({
      action: 'assigned specification',
      entity_type: 'sample',
      entity_id: sampleId,
      entity_name: sampleName,
      laboratory_id: laboratoryId,
      metadata: { template: templateName }
    })
}
