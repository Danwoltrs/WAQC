# Attribute Scales Migration Guide

## Overview

The quality template system has been refactored to support **flexible attribute scales**, allowing both numeric and custom wording-based scales for cupping attributes. This provides complete flexibility to match real-world cupping practices across different regions and clients.

## What Changed

### Before (Old System)
- Hardcoded scale types: 1-5, 1-7, or 1-10
- All attributes used the same scale type
- Simple numeric scoring only
- No support for text-based scales (e.g., "Outstanding", "Good", "Poor")

### After (New System)
- **Numeric scales** with custom ranges (any min-max, any increment)
- **Wording scales** with custom labels and assigned numeric values
- **Per-attribute configuration** - each attribute can use different scale types
- **Predefined templates** (SCA, COE, Brazil Traditional) for quick setup
- **Complete customization** - add, edit, remove scale options as needed

## Key Features

### 1. Numeric Scales
Define custom numeric ranges with configurable increments:
- **Min Value**: Starting point (e.g., 1, 0, 6)
- **Max Value**: Ending point (e.g., 5, 10, 100)
- **Increment**: Step size (e.g., 0.25, 0.5, 1.0)

**Examples:**
- SCA Standard: 1-10 by 0.25
- COE: 1-5 by 0.25
- Simple: 1-7 by 0.5

### 2. Wording Scales
Create custom text-based scales with numeric values for validation:
- **Label**: Human-readable text (e.g., "Outstanding", "Good", "Poor")
- **Value**: Numeric value for validation (e.g., 10, 7, 3)
- **Display Order**: Order in which options are shown

**Examples:**
- SCA 7-Level: Outstanding (10), Special (9), Good (7), Notable (6), Medium (5), Not Notable (3), Poor/Flat (1)
- Brazil Flavor 10-Level: Special (10), S.Soft (9), Soft (8), Softish (7), Hard (6), Hardish (5), Rioy (4), Rioy/Rio (3), Rio (2), Strong Rio (1)

### 3. Mixed Attributes
Each attribute in a template can use a different scale:
- **Fragrance/Aroma**: 7-level wording scale
- **Flavor**: 10-level Brazil Traditional wording scale
- **Body**: 1-10 numeric scale
- **Acidity**: 1-5 numeric scale

## How to Use

### Creating a New Template

1. **Navigate to Quality Templates** in the admin interface
2. **Click "Create Template"**
3. **Fill in basic information** (name, description, sample size)
4. **Configure screen size requirements**
5. **Set up cupping attributes:**
   - Click "Add New Attribute"
   - Enter attribute name (e.g., "Fragrance/Aroma")
   - Choose scale type: **Numeric** or **Wording**
   - Configure the scale:
     - For numeric: set min, max, increment
     - For wording: add options with labels and values
   - Repeat for all attributes
6. **Save the template**

### Using Predefined Scale Templates

When configuring an attribute scale, you can quickly apply a preset:

1. Click "Edit" on an attribute
2. Select a **Quick Template** from the dropdown:
   - **SCA Numeric (1-10)**: Standard 10-point numeric scale
   - **SCA 7-Level Wording**: Outstanding, Special, Good, etc.
   - **Brazil Flavor (10-Level)**: Special, S.Soft, Soft, etc.
   - **COE Numeric (1-5)**: Cup of Excellence 5-point scale
   - **Numeric (1-7)**: Simple 7-point scale
   - **Numeric (1-5)**: Simple 5-point scale
3. The scale is automatically configured
4. Customize further if needed

### Editing Existing Attributes

1. Click **"Edit"** on an attribute card
2. **Change scale type** if needed (Numeric ↔ Wording)
3. **Modify scale configuration:**
   - For numeric: adjust min, max, or increment
   - For wording: add/edit/remove options, reorder them
4. Changes are saved automatically

### Duplicating Attributes

To create similar attributes quickly:
1. Click the **"Duplicate"** icon on an attribute
2. The attribute is copied with all scale settings
3. Rename and adjust as needed

## Real-World Examples

### SCA Standard Template
```
Fragrance/Aroma: Numeric 1-10 (0.25 increments)
Flavor:          Numeric 1-10 (0.25 increments)
Aftertaste:      Numeric 1-10 (0.25 increments)
Acidity:         Numeric 1-10 (0.25 increments)
Body:            Numeric 1-10 (0.25 increments)
Balance:         Numeric 1-10 (0.25 increments)
Uniformity:      Numeric 1-10 (0.25 increments)
Clean Cup:       Numeric 1-10 (0.25 increments)
Sweetness:       Numeric 1-10 (0.25 increments)
Overall:         Numeric 1-10 (0.25 increments)
```

### Mixed Scale Template (Brazil Traditional)
```
Fragrance/Aroma: 7-Level Wording
  - Outstanding (10)
  - Special (9)
  - Good (7)
  - Notable (6)
  - Medium (5)
  - Not Notable (3)
  - Poor/Flat (1)

Flavor: 10-Level Brazil Wording
  - Special (10)
  - S.Soft (9)
  - Soft (8)
  - Softish (7)
  - Hard (6)
  - Hardish (5)
  - Rioy (4)
  - Rioy/Rio (3)
  - Rio (2)
  - Strong Rio (1)

Acidity: 7-Level Wording (same as Fragrance/Aroma)
Body:    7-Level Wording (same as Fragrance/Aroma)
Sweetness: 7-Level Wording (same as Fragrance/Aroma)
Overall: Numeric 1-10 (0.25 increments)
```

### Client-Specific Custom Template
```
Fragrance: Numeric 1-5 (0.5 increments)
Flavor:    Numeric 1-5 (0.5 increments)
Body:      3-Level Wording
  - Full (5)
  - Medium (3)
  - Light (1)

Acidity:   5-Level Wording
  - Bright (5)
  - Pleasant (4)
  - Moderate (3)
  - Mild (2)
  - Flat (1)

Boozy:     Numeric 0-10 (1.0 increments)
```

## Database Storage

Attribute scales are stored in the `quality_templates` table under the `parameters` JSONB column:

```json
{
  "cupping_attributes": [
    {
      "attribute": "Fragrance/Aroma",
      "is_required": true,
      "scale": {
        "type": "numeric",
        "min": 1,
        "max": 10,
        "increment": 0.25
      }
    },
    {
      "attribute": "Flavor",
      "is_required": true,
      "scale": {
        "type": "wording",
        "options": [
          { "label": "Outstanding", "value": 10, "display_order": 0 },
          { "label": "Special", "value": 9, "display_order": 1 },
          { "label": "Good", "value": 7, "display_order": 2 },
          { "label": "Poor", "value": 3, "display_order": 3 }
        ]
      }
    }
  ]
}
```

## Backward Compatibility

The old format is still supported for existing templates:

```json
{
  "cupping": {
    "scale_type": "1-10",
    "min_score": 80,
    "attributes": [
      { "attribute": "Fragrance/Aroma", "scale": 4, "range": 1 }
    ]
  }
}
```

**Migration Strategy:**
- Existing templates continue to work
- Edit and save a template to automatically convert to the new format
- Old `cupping` field is preserved for backward compatibility
- New `cupping_attributes` field is used when present

## QC Grading Interface

During cupping sessions, the interface adapts based on scale type:

### Numeric Scale Display
- **Input**: Number input with min/max validation
- **Step**: Matches the increment setting
- **Visual**: Slider or numeric input

### Wording Scale Display
- **Input**: Dropdown or radio buttons
- **Options**: Shows human-readable labels
- **Value**: Stores the corresponding numeric value
- **Validation**: Ensures selected option is valid

### Example:
```
Attribute: Fragrance/Aroma (7-Level Wording)
Display:   [ Outstanding ▼ ]
           - Outstanding (10)
           - Special (9)
           - Good (7)
           - Notable (6)
           - Medium (5)
           - Not Notable (3)
           - Poor/Flat (1)

Stored Value: 10 (if "Outstanding" selected)
```

## Validation

The system validates scores during cupping:

### Numeric Scale Validation
- Score must be within min-max range
- Score must be a valid step from min (e.g., 1, 1.25, 1.5, ... for 0.25 increment)
- Example: 1-10 by 0.25 → valid: 7.25, invalid: 7.3

### Wording Scale Validation
- Selected label must exist in the scale options
- Corresponding value is used for min score requirements
- Example: "Good" (7) satisfies a requirement of "minimum 5"

### Template Validation
- Each attribute must have a valid scale configuration
- Wording scales require at least one option
- Numeric scales require min < max and increment > 0
- No duplicate labels or values in wording scales

## API Integration

For API clients accessing quality templates:

### Endpoint
```
GET /api/quality-templates/:id
```

### Response
```json
{
  "id": "uuid",
  "name": "Template Name",
  "parameters": {
    "cupping_attributes": [
      {
        "attribute": "Fragrance/Aroma",
        "is_required": true,
        "scale": {
          "type": "numeric" | "wording",
          // ... scale configuration
        }
      }
    ]
  }
}
```

### Submitting Scores
When submitting cupping scores, use the numeric value:

```json
{
  "cupping_session_id": "uuid",
  "scores": [
    {
      "attribute": "Fragrance/Aroma",
      "score": 7.5  // Always numeric, even for wording scales
    }
  ]
}
```

## Best Practices

1. **Use Predefined Templates** when possible for consistency
2. **Group Similar Attributes** - if multiple attributes use the same scale, consider duplicating
3. **Clear Naming** - use descriptive attribute names (e.g., "Fragrance/Aroma" not just "Frag")
4. **Logical Values** - for wording scales, assign values that reflect quality (higher = better)
5. **Consistent Ordering** - order wording options from best to worst or worst to best
6. **Document Custom Scales** - add notes in the template description explaining custom scales
7. **Test Before Production** - create test cupping sessions to verify scales work as expected

## Troubleshooting

### Problem: "Attribute is missing scale configuration"
**Solution**: Each attribute must have a scale. Click "Edit" and configure the scale.

### Problem: "Duplicate labels are not allowed"
**Solution**: In wording scales, each label must be unique. Rename duplicate labels.

### Problem: "Increment must be less than the scale range"
**Solution**: For numeric scales, ensure increment < (max - min). Example: for 1-5, increment must be < 4.

### Problem: Scale options not saving
**Solution**: Ensure each wording option has both a label and a numeric value. Empty values are not saved.

### Problem: Can't find the right scale type
**Solution**: Use the Quick Templates dropdown to start with a preset, then customize.

## Migration Checklist

If migrating from the old system:

- [ ] Review existing quality templates
- [ ] Identify templates using hardcoded 1-5, 1-7, or 1-10 scales
- [ ] For each template:
  - [ ] Open template in editor
  - [ ] Review each attribute's scale configuration
  - [ ] Decide if numeric or wording scale is appropriate
  - [ ] Configure custom scales if needed
  - [ ] Save template (automatically converts to new format)
- [ ] Test cupping sessions with updated templates
- [ ] Train staff on new scale types
- [ ] Update documentation and SOPs

## Support

For questions or issues:
- Check this migration guide
- Review the attribute-scales.ts type definitions
- Examine the scale-builder.tsx component
- Test with sample templates in a development environment

---

**Version**: 1.0
**Last Updated**: 2025-10-13
**Author**: Quality System Development Team
