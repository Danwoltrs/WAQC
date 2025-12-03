/**
 * Shared styles for certificate PDF generation
 * Following the design system colors from CLAUDE.md
 */

import { StyleSheet, Font } from '@react-pdf/renderer'

// Register Inter font (using TTF format for @react-pdf compatibility)
// Note: WOFF2 format can cause "Unknown font format" errors in some environments
Font.register({
  family: 'Inter',
  fonts: [
    {
      src: 'https://fonts.gstatic.com/s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuLyfMZg.ttf',
      fontWeight: 400,
    },
    {
      src: 'https://fonts.gstatic.com/s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuGKYMZg.ttf',
      fontWeight: 600,
    },
    {
      src: 'https://fonts.gstatic.com/s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuFuYMZg.ttf',
      fontWeight: 700,
    },
  ],
})

// Design system colors
export const COLORS = {
  // Primary palette
  primary: '#556b2f', // Olive green
  secondary: '#a9a454', // Yellowish green
  accent: '#b07946', // Tan/brown
  cream: '#efe4d4', // Light beige
  dark: '#445763', // Dark slate
  black: '#151618', // Near black

  // UI colors
  white: '#FFFFFF',
  background: '#FAFAFA',
  border: '#E5E7EB',
  borderLight: '#F3F4F6',
  muted: '#6B7280',
  mutedLight: '#9CA3AF',

  // Status colors
  approved: '#22C55E', // Green for approved
  rejected: '#EF4444', // Red for rejected
  inSpec: '#22C55E', // Green for in-spec values
  outOfSpec: '#EF4444', // Red for out-of-spec values
}

// Typography
export const TYPOGRAPHY = {
  fontFamily: 'Inter',
  title: {
    fontSize: 16,
    fontWeight: 700,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: 600,
  },
  label: {
    fontSize: 9,
    fontWeight: 600,
  },
  value: {
    fontSize: 9,
    fontWeight: 400,
  },
  small: {
    fontSize: 8,
    fontWeight: 400,
  },
  tiny: {
    fontSize: 7,
    fontWeight: 400,
  },
}

// Shared styles
export const styles = StyleSheet.create({
  // Page layout
  page: {
    fontFamily: 'Inter',
    fontSize: 9,
    padding: 30,
    backgroundColor: COLORS.white,
  },

  // Section containers
  section: {
    marginBottom: 10,
    borderWidth: 0.5,
    borderColor: COLORS.border,
    borderRadius: 4,
    padding: 10,
  },
  sectionNoBorder: {
    marginBottom: 10,
    padding: 10,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: 600,
    color: COLORS.dark,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // Row layouts
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  rowWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },

  // Column layouts
  column: {
    flexDirection: 'column',
  },
  twoColumn: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  columnHalf: {
    width: '48%',
  },

  // Text styles
  title: {
    fontSize: 16,
    fontWeight: 700,
    color: COLORS.dark,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 12,
    fontWeight: 600,
    color: COLORS.muted,
    textAlign: 'center',
  },
  label: {
    fontSize: 9,
    fontWeight: 600,
    color: COLORS.dark,
  },
  value: {
    fontSize: 9,
    fontWeight: 400,
    color: COLORS.black,
  },
  muted: {
    fontSize: 9,
    color: COLORS.muted,
  },
  small: {
    fontSize: 8,
    color: COLORS.muted,
  },
  tiny: {
    fontSize: 7,
    color: COLORS.mutedLight,
  },

  // Status badges
  statusApproved: {
    fontSize: 10,
    fontWeight: 700,
    color: COLORS.approved,
    textTransform: 'uppercase',
  },
  statusRejected: {
    fontSize: 10,
    fontWeight: 700,
    color: COLORS.rejected,
    textTransform: 'uppercase',
  },

  // Data item (label + value pair)
  dataItem: {
    marginBottom: 4,
  },
  dataRow: {
    flexDirection: 'row',
    marginBottom: 3,
  },
  dataLabel: {
    fontSize: 8,
    fontWeight: 600,
    color: COLORS.muted,
    width: 80,
  },
  dataValue: {
    fontSize: 9,
    fontWeight: 400,
    color: COLORS.black,
    flex: 1,
  },

  // Divider
  divider: {
    height: 0.5,
    backgroundColor: COLORS.border,
    marginVertical: 8,
  },

  // Table styles
  table: {
    width: '100%',
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: COLORS.background,
    borderBottomWidth: 0.5,
    borderBottomColor: COLORS.border,
    paddingVertical: 5,
    paddingHorizontal: 4,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: COLORS.borderLight,
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  tableCell: {
    fontSize: 9,
    color: COLORS.black,
  },
  tableHeaderCell: {
    fontSize: 8,
    fontWeight: 600,
    color: COLORS.muted,
    textTransform: 'uppercase',
  },

  // Logo styles
  logo: {
    width: 80,
    height: 30,
    objectFit: 'contain',
  },
  logoSmall: {
    width: 60,
    height: 24,
    objectFit: 'contain',
  },
  flag: {
    width: 24,
    height: 16,
    objectFit: 'contain',
  },

  // Footer
  footer: {
    position: 'absolute',
    bottom: 20,
    left: 30,
    right: 30,
    textAlign: 'center',
  },
})

// Helper function to get status color
export function getStatusColor(status: string | null): string {
  if (status === 'approved') return COLORS.approved
  if (status === 'rejected') return COLORS.rejected
  return COLORS.muted
}

// Helper function to get status text
export function getStatusText(status: string | null): string {
  if (status === 'approved') return 'APPROVED'
  if (status === 'rejected') return 'REJECTED'
  return status?.toUpperCase() || 'PENDING'
}
