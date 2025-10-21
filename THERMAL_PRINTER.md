# Thermal Printer Integration Guide

This document provides instructions for integrating thermal printers with the Wolthers Coffee Quality Control System for printing sample labels and cupping QR codes.

## Overview

The system generates PDF labels that can be printed on:
- **Standard printers**: A4 paper with 3cm height labels
- **Thermal printers**: Direct thermal or thermal transfer printers

## Supported Thermal Printer Types

### 1. Label Printers (Recommended)
- **Brother QL Series** (QL-800, QL-820NWB, QL-1110NWB)
- **Zebra ZD Series** (ZD420, ZD620)
- **DYMO LabelWriter** (LW 450, LW 550)

### 2. Receipt Printers
- **Epson TM Series** (TM-T88, TM-T20)
- **Star Micronics** (TSP100, TSP650)

## Label Specifications

### Sample Labels
- **Format**: 3cm (30mm) height × A4 width
- **Content**:
  - QR code (tracking URL)
  - Tracking number (bold, 14pt)
  - Origin
  - Quality specification
  - Supplier name
  - Storage position
  - Date received

### Cupping QR Codes
- **Format**: 2-per-page on A4
- **QR Code Size**: 100pt × 100pt
- **Content**:
  - QR code (cupping session URL)
  - Sample number
  - Tracking number
  - Origin
  - Quality specification

## Browser-Based Printing

### Desktop Browsers
The system uses the standard browser print dialog, which automatically detects installed printers:

1. Click "Print" button in the label printing dialog
2. Select your thermal printer from the print dialog
3. Configure printer settings:
   - **Page size**: Match your label size (e.g., 62mm × 30mm)
   - **Orientation**: Portrait
   - **Margins**: Minimal (2mm)
   - **Scale**: Fit to page

### Recommended Browser Settings
- **Chrome/Edge**: `chrome://settings/printing`
  - Enable "Print backgrounds"
  - Set default printer
- **Firefox**: `about:preferences#general`
  - Set default printer
- **Safari**: System Preferences → Printers & Scanners

## Printer Configuration

### Brother QL Series
1. Install Brother P-touch Editor
2. Configure label size: 62mm × 30mm (or custom)
3. Set print quality to "High Quality"
4. Enable "Cut at end"

### Zebra Printers
1. Install Zebra Setup Utilities
2. Configure media:
   - Width: 62mm
   - Height: 30mm (or custom)
3. Set darkness: 15-20 (adjust for label stock)
4. Calibrate media sensor

### DYMO LabelWriter
1. Install DYMO Label Software
2. Use DYMO Framework for browser integration
3. Configure label type: Custom (62mm × 30mm)

## Direct Printer Integration (Advanced)

For kiosk or dedicated workstations, you can implement direct USB/Network printing:

### Option 1: Browser Print API
Use native browser printing with pre-configured settings.

### Option 2: Electron/Native App
Package the application as an Electron app with direct printer access:
- Use `node-printer` package
- Implement ZPL/ESC/POS commands for thermal printers
- Bypass browser print dialog

### Option 3: Print Server
Set up a dedicated print server:
- CUPS (Linux/macOS)
- Windows Print Server
- Configure default printer and settings
- Use network printing from web app

## Label Stock Recommendations

### Thermal Direct Labels
- **Material**: Thermal paper
- **Adhesive**: Permanent or removable acrylic
- **Size**: 62mm × 30mm or 3" × 1.5"
- **Core size**: 25mm or 40mm
- **Recommended brands**:
  - Brother DK-1208
  - Zebra Z-Select 4000D
  - DYMO 30336

### Thermal Transfer Labels
- **Material**: Polypropylene or polyester (for durability)
- **Ribbon**: Wax or resin
- **Size**: 62mm × 30mm
- **Temperature range**: -40°C to +150°C (coffee storage)
- **Recommended for**: Long-term storage, humid environments

## Troubleshooting

### Labels Not Printing Correctly

**Problem**: Labels cut off or misaligned
- **Solution**: Calibrate media sensor in printer settings
- **Solution**: Adjust page size in browser print settings

**Problem**: QR codes not scanning
- **Solution**: Increase print darkness
- **Solution**: Use higher quality label stock
- **Solution**: Clean printer head

**Problem**: Text too small
- **Solution**: Adjust scale setting in print dialog
- **Solution**: Check DPI settings (should be 203 or 300 DPI)

### Browser Compatibility

**Problem**: Print dialog doesn't show thermal printer
- **Solution**: Ensure printer drivers are installed
- **Solution**: Set thermal printer as default
- **Solution**: Try Chrome/Edge (best thermal printer support)

**Problem**: Automatic print doesn't work
- **Solution**: Allow pop-ups for the application domain
- **Solution**: Grant printer permissions in browser settings

## API Endpoints

### Generate Sample Labels
```
POST /api/samples/bulk/print-labels
Body: { sample_ids: string[] }
Response: PDF file
```

### Generate Cupping QR Codes
```
GET /api/cupping/sessions/[sessionId]/qr-codes
Response: PDF file
```

## Integration with Sample Tracking

The print labels dialog is available from:
1. Sample tracking page (bulk selection)
2. Individual sample detail pages
3. Storage management interface

## Future Enhancements

Planned features for thermal printer integration:
- [ ] Direct ZPL/ESC/POS command generation
- [ ] Native printer selection API
- [ ] Batch printing queue
- [ ] Print job status monitoring
- [ ] Custom label templates
- [ ] Barcode format options (Code 128, Data Matrix, etc.)

## Support

For printer-specific issues, consult:
- Printer manufacturer documentation
- Browser print documentation
- Wolthers IT support team

For software issues, create a GitHub issue with:
- Browser and version
- Printer model
- Sample PDF output
- Error messages
