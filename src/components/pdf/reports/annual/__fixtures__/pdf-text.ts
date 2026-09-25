/**
 * Walk a react-pdf element tree made of plain function components (no hooks)
 * and collect one string per <Text>, in document order. `renderPdf` renders a
 * component that returns a <Document> to a buffer without an `any` cast.
 */
import type React from 'react'
import { renderToBuffer, type DocumentProps } from '@react-pdf/renderer'

export function renderPdf(element: React.ReactElement): Promise<Buffer> {
  return renderToBuffer(element as unknown as React.ReactElement<DocumentProps>)
}

function flattenLeaves(node: unknown): string[] {
  if (node === null || node === undefined || typeof node === 'boolean') return []
  if (typeof node === 'string' || typeof node === 'number') return [String(node)]
  if (Array.isArray(node)) return node.flatMap(flattenLeaves)
  if (typeof node === 'object' && 'type' in (node as Record<string, unknown>)) {
    const { type, props } = node as { type: unknown; props?: { children?: unknown } }
    if (typeof type === 'function') return flattenLeaves((type as (p: unknown) => unknown)(props))
    return flattenLeaves(props?.children)
  }
  return []
}

export function collectTexts(node: unknown): string[] {
  if (node === null || node === undefined || typeof node === 'boolean') return []
  if (Array.isArray(node)) return node.flatMap(collectTexts)
  if (typeof node === 'object' && 'type' in (node as Record<string, unknown>)) {
    const { type, props } = node as { type: unknown; props?: { children?: unknown } }
    if (typeof type === 'function') return collectTexts((type as (p: unknown) => unknown)(props))
    if (type === 'TEXT') {
      const leaves = flattenLeaves(props?.children)
      return leaves.length > 0 ? [leaves.join('')] : []
    }
    return collectTexts(props?.children)
  }
  return []
}

export function renderTexts(element: React.ReactElement): string[] {
  return collectTexts(element)
}
