import type { Lang } from './types'

export interface EmailCopy {
  headings: {
    sample: string; contract: string; buyerRef: string; quality: string; defects: string
    type: string; cup: string; result: string; approved: string; rejected: string; note: string
    /** A type sample is measured, never approved or rejected: its result reads one of these. */
    inRange: string; outOfRange: string
  }
  buyerSampleLine: (company: string) => string
  /** The final client's sample, for their approval (a pre-approval reads `buyerSampleLine`). */
  finalApprovalLine: (company: string) => string
  additionalSampleLine: string
  ssPerContainerLine: string
  stuffingLine: string
  greeting: (greeting: string) => string
  leadAttached: string
  leadPlain: string
  tolerance: {
    title: string
    screen: { sieve: string; sample: string; required: string; adjusted: string }
    item: { item: string; result: string; required: string; difference: string }
    adjustScreens: string
    additionalSample: string
    min: string
    max: string
    minLimit: string
    maxLimit: string
  }
  pan: 'Fundo' | 'Pan'
  sellerRef: string
  container: string
  reasonLabel: string
  defectsLong: string
  /** Closing used when the email carries no signature. */
  signOff: string
}

export const COPY: Record<Lang, EmailCopy> = {
  en: {
    headings: {
      sample: 'Sample', contract: 'Contract', buyerRef: 'Buyer Ref', quality: 'Quality', defects: 'Def.',
      type: 'Type', cup: 'Cup', result: 'Result', approved: 'APPROVED', rejected: 'REJECTED', note: 'Note',
      inRange: 'IN RANGE', outOfRange: 'OUT OF RANGE',
    },
    buyerSampleLine: (c) => `Pre-approved by Wolthers – please send 1 sample to ${c}:`,
    finalApprovalLine: (c) => `Approved by Wolthers – please send 1 sample to ${c} for their final approval:`,
    additionalSampleLine: 'Please send an additional sample to our lab.',
    ssPerContainerLine: 'Please send one shipment sample (SS) of each container to our lab.',
    stuffingLine: 'Please let us know the stuffing date, time and place so we can draw the shipment sample (SS).',
    greeting: (g) => `Dear ${g},`,
    leadAttached: 'Please find below the quality results; the certificates are attached.',
    leadPlain: 'Please find below the quality results for the samples we assessed.',
    tolerance: {
      title: 'Approved with comments',
      screen: { sieve: 'Screen', sample: 'Your sample', required: 'Required', adjusted: 'Adjusted' },
      item: { item: 'Item', result: 'Result', required: 'Required', difference: 'Difference' },
      adjustScreens: 'Please adjust the screen classification to meet the required standard.',
      additionalSample: 'Please send an additional sample.',
      min: 'min.',
      max: 'max.',
      minLimit: 'min.',
      maxLimit: 'max.',
    },
    pan: 'Pan',
    sellerRef: 'Seller Ref',
    container: 'Container',
    reasonLabel: 'Reason',
    defectsLong: 'Defects',
    signOff: 'Best regards,\nWolthers & Associates',
  },
  pt: {
    headings: {
      sample: 'Amostra', contract: 'Contrato', buyerRef: 'Ref. comprador', quality: 'Qualidade', defects: 'Def.',
      type: 'Tipo', cup: 'Bebida', result: 'Resultado', approved: 'APROVADO', rejected: 'REPROVADO', note: 'Obs.',
      inRange: 'DENTRO DO PADRÃO', outOfRange: 'FORA DO PADRÃO',
    },
    buyerSampleLine: (c) => `Pré-aprovado pela Wolthers – favor enviar 1 amostra para ${c}:`,
    finalApprovalLine: (c) => `Aprovado pela Wolthers – favor enviar 1 amostra para ${c} para aprovação final:`,
    additionalSampleLine: 'Favor enviar uma amostra adicional para o nosso laboratório.',
    ssPerContainerLine: 'Favor enviar uma amostra de embarque (SS) de cada contêiner para o nosso laboratório.',
    stuffingLine: 'Favor nos informar data, hora e local da estufagem para retirarmos a amostra de embarque (SS).',
    greeting: (g) => (g === 'all' ? 'Prezados,' : `Prezado(a) ${g},`),
    leadAttached: 'Segue abaixo o resultado de qualidade; os certificados estão anexados.',
    leadPlain: 'Segue abaixo o resultado de qualidade das amostras analisadas.',
    tolerance: {
      title: 'Aprovado com observações',
      screen: { sieve: 'Peneira', sample: 'Sua amostra', required: 'Exigido', adjusted: 'Ajustado' },
      item: { item: 'Item', result: 'Resultado', required: 'Exigido', difference: 'Diferença' },
      adjustScreens: 'Favor ajustar a classificação por peneira para atender ao padrão exigido.',
      additionalSample: 'Favor enviar uma amostra adicional.',
      // Screen requirement text ("mín. 30%") vs item-limit text ("min 8"): PT keeps both exactly as before.
      min: 'mín.',
      max: 'máx.',
      minLimit: 'min',
      maxLimit: 'max',
    },
    pan: 'Fundo',
    sellerRef: 'Ref. vendedor',
    container: 'Contêiner',
    reasonLabel: 'Motivo',
    defectsLong: 'Defeitos',
    signOff: 'Atenciosamente,\nWolthers & Associates',
  },
}
