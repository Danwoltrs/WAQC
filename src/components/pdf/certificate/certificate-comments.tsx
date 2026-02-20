/**
 * Certificate comments component
 * Bottom section for cupping notes and any additional remarks
 */

import React from 'react'
import { View, Text, StyleSheet } from '@react-pdf/renderer'
import { COLORS } from './certificate-styles'

const commentsStyles = StyleSheet.create({
  container: {
    marginTop: 'auto',
    marginBottom: 16,
    padding: 8,
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
  overrideLabel: {
    fontSize: 9,
    fontWeight: 600,
    color: '#b07946',
  },
  overrideText: {
    fontSize: 9,
    color: COLORS.dark,
    lineHeight: 1.4,
  },
})

export interface CertificateCommentsProps {
  cuppingNotes: string | null
  additionalNotes?: string | null
  overrideComment?: string | null
}

export function CertificateComments({
  cuppingNotes,
  additionalNotes,
  overrideComment,
}: CertificateCommentsProps) {
  // Combine notes if both exist
  const hasNotes = cuppingNotes || additionalNotes

  // Build combined text
  const notesText = hasNotes
    ? [cuppingNotes, additionalNotes].filter(Boolean).join('\n\n')
    : null

  // ALWAYS render the box, even when empty
  return (
    <View style={commentsStyles.container}>
      <Text style={commentsStyles.title}>Comments</Text>
      {overrideComment ? (
        <View style={{ marginBottom: notesText ? 6 : 0 }}>
          <Text style={commentsStyles.overrideText}>
            <Text style={commentsStyles.overrideLabel}>Override: </Text>
            {overrideComment}
          </Text>
        </View>
      ) : null}
      {notesText ? (
        <Text style={commentsStyles.commentsText}>{notesText}</Text>
      ) : !overrideComment ? (
        <Text style={commentsStyles.emptyText}>No comments</Text>
      ) : null}
    </View>
  )
}
