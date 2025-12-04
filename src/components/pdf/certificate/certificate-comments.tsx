/**
 * Certificate comments component
 * Bottom section for cupping notes and any additional remarks
 */

import React from 'react'
import { View, Text, StyleSheet } from '@react-pdf/renderer'
import { COLORS } from './certificate-styles'

const commentsStyles = StyleSheet.create({
  container: {
    marginBottom: 8,
    padding: 10,
    borderWidth: 0.5,
    borderColor: COLORS.border,
    borderRadius: 4,
    backgroundColor: COLORS.background,
  },
  title: {
    fontSize: 9,
    fontWeight: 600,
    color: COLORS.muted,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  commentsText: {
    fontSize: 9,
    color: COLORS.dark,
    lineHeight: 1.4,
  },
  emptyText: {
    fontSize: 8,
    color: COLORS.mutedLight,
  },
})

export interface CertificateCommentsProps {
  cuppingNotes: string | null
  additionalNotes?: string | null
}

export function CertificateComments({
  cuppingNotes,
  additionalNotes,
}: CertificateCommentsProps) {
  // Combine notes if both exist
  const hasNotes = cuppingNotes || additionalNotes

  if (!hasNotes) {
    return null
  }

  // Build combined text
  const notesText = [
    cuppingNotes,
    additionalNotes,
  ].filter(Boolean).join('\n\n')

  return (
    <View style={commentsStyles.container}>
      <Text style={commentsStyles.title}>Notes</Text>
      <Text style={commentsStyles.commentsText}>{notesText}</Text>
    </View>
  )
}
