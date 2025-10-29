# Cupping Card Custom Attributes Guide

## Overview
The cupping card system now supports dynamic quality template attributes. This means you can define custom attributes in your quality templates, and they will automatically appear on the printed cupping cards.

## How Attributes are Extracted

The system searches for attributes in the following order (first match wins):

1. **custom_parameters.cupping_attributes** - Custom attributes specific to a quality specification
2. **template.parameters.cupping_attributes** - Template-level cupping attributes
3. **custom_parameters.attributes** - General attributes array
4. **template.parameters.attributes** - Template-level attributes array
5. **template.parameters.scaa_attributes or sca_attributes** - Methodology-specific attributes
6. **Default Fallback** - ['Frag', 'Arom', 'Body', 'Acid', 'Swet', 'Bal', 'Fin']

## Example: Spanish Attributes

If you have a quality template with Spanish attributes, store them in the template's parameters:

```json
{
  "template": {
    "name": "Colombian Specialty",
    "parameters": {
      "cupping_attributes": [
        "Dolçura",
        "Cuerpo",
        "Acidez",
        "Umami",
        "Finish"
      ],
      "scale_info": "1-10, 0.5"
    }
  }
}
```

## Example: Custom Methodology

For custom methodologies or regional preferences:

```json
{
  "custom_parameters": {
    "cupping_attributes": [
      "Frag/Arom",
      "Sabor",
      "Retrogusto",
      "Acidez",
      "Cuerpo",
      "Balance",
      "Dulzura"
    ]
  }
}
```

## Technical Details

### Null Safety
The system now includes comprehensive null safety checks:
- All attribute values must be non-null, non-empty strings
- Text fields are converted to strings with proper defaults
- Empty attributes arrays fall back to standard SCA attributes

### Validation
Attributes go through a multi-stage validation process:
1. Check if array exists and has length > 0
2. Filter out null, undefined, and empty strings
3. Convert all values to strings and trim whitespace
4. Remove any strings that became empty after trimming
5. If no valid attributes remain, use default SCA attributes

### PDF Rendering
The validated attributes are rendered dynamically:
- Thermal cards: One card per page (A6 landscape)
- Letter/A4 cards: 8 cards per page (2x4 grid)
- Column width adjusts based on number of attributes

## Testing Custom Attributes

To test custom attributes:

1. Create or edit a quality template
2. Add a `cupping_attributes` array to the template's parameters
3. Assign that template to a sample
4. Generate cupping cards for that sample
5. Check the console logs to see which attributes were extracted

The system logs detailed information during card generation:
```
Processing sample XXX-YYYY:
  template_name: "Colombian Specialty"
  customParams: { ... }
  templateParams: { cupping_attributes: [...] }
Extracted attributes for XXX-YYYY: ["Dolçura", "Cuerpo", ...]
```

## Automatic Attribute Abbreviation

Since the cupping card table columns are narrow (20pt for A4, 32pt for thermal), attribute names are automatically abbreviated to fit:

### A4 Format (Letter size)
- **Max Length**: 4 characters
- **Column Width**: 20pt
- **Font Size**: 6pt

### Thermal Format
- **Max Length**: 5 characters
- **Column Width**: 32pt
- **Font Size**: 7pt

### Abbreviation Logic

The system uses a two-strategy approach:

1. **Known Coffee Terms** - Pre-defined abbreviations for common attributes:
   - "Dolçura" → "Dolç" (A4) / "Dolçu" (Thermal)
   - "Cuerpo" → "Cuer" (A4) / "Cuerp" (Thermal)
   - "Acidez" → "Acid" (both)
   - "Umami" → "Umam" (A4) / "Umami" (Thermal)
   - "Finish" → "Fin" (A4) / "Finsh" (Thermal)
   - "Fragancia" → "Frag" (both)
   - "Balance" → "Bal" (both)

2. **Smart Truncation** - For unknown terms, takes the first N characters:
   - This preserves special characters (ç, á, etc.)
   - Maintains readability
   - Capitalizes first letter if original is capitalized

### Adding Custom Abbreviations

To add your own known abbreviations, edit the `knownAbbreviations` dictionary in:
- `src/components/pdf/thermal-cupping-card-a4.tsx`
- `src/components/pdf/thermal-cupping-card.tsx`

Example:
```typescript
const knownAbbreviations: Record<string, string> = {
  'Dolçura': 'Dolç',
  'Meu Atributo': 'MAtb',  // Add your custom mapping here
  // ...
}
```

## Fixes Applied (2025-01-29)

1. **Fixed TEXT component errors** - Added comprehensive null safety for all text fields
2. **Enhanced attribute extraction** - Multiple fallback strategies for finding attributes
3. **Better validation** - Filters out invalid attribute values before PDF rendering
4. **Type safety** - Ensured all required fields have proper defaults
5. **Logging** - Added detailed console logging for debugging
6. **Automatic abbreviation** - Intelligent attribute name shortening for table fit

## Next Steps

If you need to support additional attribute structures:
1. Add a new strategy in the print dialog's attribute extraction logic
2. Follow the pattern of checking if the data exists and is an array
3. Add console logging to verify the extraction works
4. Test with sample data to ensure PDF renders correctly
