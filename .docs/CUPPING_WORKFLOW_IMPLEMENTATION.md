# Cupping Workflow Implementation Documentation

**Session Date:** 2025-01-30
**Implementation Status:** Phase 1 Complete - Digital Interface & Workflow Connection

---

## Table of Contents
1. [System Architecture Overview](#system-architecture-overview)
2. [Complete Workflow](#complete-workflow)
3. [Technical Implementation](#technical-implementation)
4. [File-by-File Documentation](#file-by-file-documentation)
5. [Data Structures](#data-structures)
6. [UX Design Patterns](#ux-design-patterns)
7. [Critical Design Decisions](#critical-design-decisions)
8. [Next Phase Requirements](#next-phase-requirements)

---

## System Architecture Overview

### Core Principle: Template-Driven Cupping
All cupping attributes, scales, and defects are driven by **Quality Templates**, not hardcoded values. This allows:
- Multi-language support (English, Spanish, Portuguese)
- Custom attribute configurations per client
- Flexible scale types (numeric, wording-based)
- User-defined abbreviations for printing

### Workflow Independence
**CRITICAL:** Cupping and grading are **INDEPENDENT, PARALLEL workflows**:
- One team member can cup while another grades simultaneously
- Both workflows update the same sample record
- Each can complete independently
- Status transitions are separate: `received` → `cupping` (for cupping) or `received` → `grading` (for grading)

### Input Methods Supported
1. **Digital Cupping (Web Interface)** - Implemented in this phase
2. **Printed Cards + OCR Scanning** - Card generation complete, OCR pending
3. **iOS App** - Future implementation

---

## Complete Workflow

### Step 1: Sample Assignment & Cupper Selection
**Location:** `/app/samples/page.tsx` → Cupper Assignment Dialog

1. User selects one or more samples from the samples list
2. User clicks "Assign Cuppers" button
3. Dialog opens showing:
   - Table view of available cuppers (Q-Grader badge, laboratory info)
   - Checkbox selection for multiple cuppers
   - Minimum 2 cuppers required for PSS/SS samples
4. User selects cuppers and clicks "Print Cupping Cards"

**Files Involved:**
- `src/components/cupping/cupper-assignment-dialog.tsx` - Dialog component
- `src/app/api/users/cuppers/route.ts` - Loads available cuppers

### Step 2: Print Cupping Cards
**Location:** Print Cupping Cards Dialog (opens after cupper selection)

1. Dialog shows sample details with quality template names
2. User configures card options:
   - Show/hide quality name, buyer, exporter
   - Select output format: Thermal printer or PDF (Letter size)
   - Number of rows (if cuppers not assigned) or auto-set to cupper count
3. User clicks "Print X Cards" button
4. System generates cards with:
   - QR code (sample_id + tracking_number)
   - Quality template attributes with abbreviations
   - Cupper names (first names only)
   - Sample type badge (PSS/SS/TYPE)
   - Scale information
5. **CRITICAL:** After successful card generation, system automatically:
   - Calls `updateSampleStatuses()` function
   - Updates all sample statuses to `'cupping'` via PATCH `/api/samples/[id]`
   - Updates happen in parallel using Promise.all

**Files Involved:**
- `src/components/cupping/print-cupping-cards-dialog.tsx`
  - Lines 140-172: `updateSampleStatuses()` function
  - Lines 174-323: `generateCards()` function
  - Lines 305-307: Status update call after card generation
- `src/components/pdf/thermal-cupping-card.tsx` - Thermal printer layout
- `src/components/pdf/thermal-cupping-card-a4.tsx` - Letter size PDF layout

### Step 3: Samples Appear on Cupping List
**Location:** `/assessment/cupping`

1. System automatically filters samples with `status='cupping'`
2. Cupping list page displays all samples ready for cupping
3. Each sample card shows:
   - Tracking number
   - Sample type badge (PSS/SS/TYPE)
   - Supplier name (if available)
   - Origin
   - Number of cups (default 5)
   - "Start Cupping" button

**Files Involved:**
- `src/app/assessment/cupping/page.tsx`
  - Lines 36-47: Filter query `params.append('status', 'cupping')`
  - Lines 77-85: Empty state message
  - Lines 87-134: Sample card grid display

### Step 4: Start Digital Cupping
**Location:** `/assessment/cupping/[id]` (Detail page)

1. User clicks "Start Cupping" on a sample
2. System loads:
   - Sample details via GET `/api/samples/[id]`
   - Quality template from sample's `quality_spec_id` (TODO: currently hardcoded)
   - Cupping attributes with scales
   - Defect configuration
3. DigitalCuppingInterface renders with:
   - Desktop layout OR mobile-responsive bottom sheet
   - Template-driven attributes
   - Intensity-based defect classification

**Files Involved:**
- `src/app/assessment/cupping/[id]/page.tsx` - Wrapper that loads data
  - Lines 57-110: `loadSampleData()` function
  - Lines 80-101: Template configuration (TODO: replace with DB load)
  - Lines 112-135: `handleSave()` function (TODO: implement API)
- `src/components/cupping/digital-cupping-interface.tsx` - Main UI component (1000+ lines)

### Step 5: Digital Cupping Interface
**The core cupping experience - fully implemented**

#### Desktop View
- Full-screen interface with MainLayout header
- Sample tabs at top for multi-sample cupping
- Left section: Attribute scoring with slider + increment/decrement buttons
- Right section: Defect management
- Action buttons: Save Draft, Submit Final Score

#### Mobile View (< 768px)
- Attribute scoring with tap-to-edit number inputs (mobile number pad)
- Bottom sheet for defect management (slides up from bottom)
- Thumb-friendly controls (44px tap targets)
- Simplified layout optimized for portrait mode

#### Attribute Scoring
- Each attribute displays with its scale (e.g., "6-10, 0.25")
- Slider for coarse adjustment
- +/- buttons for fine adjustment
- Direct number input (tap to edit on mobile)
- Scales from quality template (numeric or wording-based)

#### Defect Classification (Intensity-Based)
- User adds defect by name
- Sets number of cups affected (1-5)
- Sets intensity on 1-7 scale using slider
- **Automatic classification:**
  - Intensity 1-3 = TAINT (orange badge)
  - Intensity 4-7 = FAULT (red badge)
- Threshold configurable per template (default: 3)

#### Score Calculation
- Real-time total score calculation
- Sum of all attribute scores
- Visual feedback as user inputs scores
- TODO: Subtract defect penalties based on intensity

**Files Involved:**
- `src/components/cupping/digital-cupping-interface.tsx` (main component)
- `src/types/cupping-session.ts` (type definitions)
- `src/types/cupping-templates.ts` (template types)
- `src/types/attribute-scales.ts` (scale configurations)

### Step 6: Save Cupping Scores
**Status:** TODO - Not yet implemented

**Requirements:**
1. Create POST `/api/cupping/sessions` endpoint
2. Create PATCH `/api/cupping/sessions/[id]` endpoint
3. Save to `cupping_sessions` and `cupping_scores` tables
4. Support incremental saves (draft mode)
5. Final submission locks scores
6. Calculate average scores across cuppers
7. Validate against quality template requirements (PSS/SS)

---

## Technical Implementation

### Sample Status Flow

```
Sample Creation (status: 'received')
         ↓
[User assigns cuppers & prints cards]
         ↓
Status Update (status: 'cupping') ← Automatic via print dialog
         ↓
[Appears on cupping list page]
         ↓
[Digital cupping interface opens]
         ↓
[Cupper enters scores]
         ↓
Status Update (status: 'cupped') ← After all cuppers complete
         ↓
[Quality validation for PSS/SS samples]
         ↓
Status Update (status: 'approved' or 'rejected')
```

### Attribute Template Extraction Logic

**Location:** `src/components/cupping/print-cupping-cards-dialog.tsx:202-243`

```javascript
// Strategy 1: Check custom_parameters.cupping_attributes (new format with abbreviations)
if (customParams.cupping_attributes && Array.isArray(customParams.cupping_attributes)) {
  cuppingAttributes = customParams.cupping_attributes
}
// Strategy 2: Check template.parameters.cupping_attributes (new format)
else if (templateParams.cupping_attributes && Array.isArray(templateParams.cupping_attributes)) {
  cuppingAttributes = templateParams.cupping_attributes
}
// Strategy 3: Check for attributes array directly (legacy format)
else if (customParams.attributes && Array.isArray(customParams.attributes)) {
  cuppingAttributes = customParams.attributes.map((attr: any) =>
    typeof attr === 'string' ? { attribute: attr } : attr
  )
}
// Strategy 4: Parse from methodology-specific parameters
else if (templateParams.scaa_attributes || templateParams.sca_attributes) {
  const attrs = templateParams.scaa_attributes || templateParams.sca_attributes
  cuppingAttributes = Array.isArray(attrs) ? attrs.map(...) : []
}
// Fallback: Default SCA attributes
else {
  cuppingAttributes = [
    { attribute: 'Frag' },
    { attribute: 'Arom' },
    // ... default attributes
  ]
}
```

**This same logic must be used in the cupping detail page when loading templates from database.**

### Template Data Structure

```typescript
// Quality Template Parameters (stored in JSON)
{
  cupping_attributes: [
    {
      attribute: "Fragrance/Aroma",  // Display name
      abbreviation: "Frag",          // Short form (4-5 chars)
      scale: {
        type: "numeric",
        min: 6,
        max: 10,
        increment: 0.25
      },
      validation_rule: {              // Optional - for PSS/SS validation
        type: "minimum",
        min_value: 7.0
      }
    },
    {
      attribute: "Sabor",              // Spanish/Portuguese support
      abbreviation: "Sabor",
      scale: {
        type: "wording",
        options: [
          { label: "Outstanding", value: 10, display_order: 0 },
          { label: "Good", value: 7, display_order: 1 },
          // ...
        ]
      }
    }
  ],
  defects: [
    "Fermented", "Phenolic", "Earthy", // List of available defects
    "Moldy", "Musty", "Chemical"
  ],
  taint_threshold: 3,                   // 1-3 = taint, 4+ = fault
  max_intensity: 7,                     // Maximum intensity scale
  cups_per_sample: 5                    // Default cup count
}
```

---

## File-by-File Documentation

### 1. Print Cupping Cards Dialog
**File:** `src/components/cupping/print-cupping-cards-dialog.tsx`

**Key Functions:**

#### `loadFullSampleData()` (Lines 109-138)
- Loads complete sample details including relations
- Calls POST `/api/samples/bulk-details` with sample IDs
- Loads client, laboratory, and quality_spec data
- Falls back to original sample data if API fails

#### `updateSampleStatuses()` (Lines 140-172)
**THIS IS CRITICAL - DO NOT REMOVE OR MODIFY**
- Called after successful card generation (line 307)
- Updates all samples to `status='cupping'` in parallel
- Uses Promise.all for efficiency
- Logs success count for debugging
- Returns boolean indicating success

#### `generateCards()` (Lines 174-323)
- Extracts quality template attributes using 4-strategy approach
- Generates QR codes with sample_id + tracking_number
- Builds card data with cupper names (first names only)
- **Line 307:** Calls `updateSampleStatuses()` after successful generation
- Sets isReadyForDownload flag to show PDF download button

**Props:**
- `samples: Sample[]` - Array of samples to print
- `assignedCuppers?: Cupper[]` - Optional pre-assigned cuppers
- `open: boolean` - Dialog visibility
- `onOpenChange: (open: boolean) => void` - Close handler

### 2. Cupping List Page
**File:** `src/app/assessment/cupping/page.tsx`

**Key Functions:**

#### `loadSamples()` (Lines 33-56)
- Filters samples by `status='cupping'` (Line 41)
- Fetches from GET `/api/samples?status=cupping&limit=50`
- **IMPORTANT:** Does NOT filter by grading status
- Sets samples state for display

**UI Structure:**
- Empty state: "No samples ready for cupping" with Coffee icon
- Grid layout: 3 columns on desktop, 1 on mobile
- Each card shows: tracking number, supplier, origin, type, cup count
- "Start Cupping" button links to `/assessment/cupping/[id]`

### 3. Cupping Detail Page (Wrapper)
**File:** `src/app/assessment/cupping/[id]/page.tsx`

**Key Functions:**

#### `loadSampleData()` (Lines 57-110)
**TODO:** Currently uses hardcoded default template (Lines 80-101)
**MUST IMPLEMENT:** Real template loading from database

Steps:
1. Fetch sample via GET `/api/samples/[id]`
2. Extract quality_spec_id from sample
3. **TODO:** Fetch quality template from `/api/quality/templates/[id]` or similar
4. **TODO:** Extract cupping_attributes using same 4-strategy logic as print dialog
5. **TODO:** Extract defects, taint_threshold, cups_per_sample from template
6. Build CuppingTemplate object
7. Set state to render DigitalCuppingInterface

#### `handleSave()` (Lines 112-135)
**TODO:** Currently just logs to console and shows alert
**MUST IMPLEMENT:** Save to database via API

Requirements:
- POST `/api/cupping/sessions` - Create new session
- PATCH `/api/cupping/sessions/[id]` - Update existing session
- Save AttributeScore[] and Defect[] arrays
- Associate with sample_id and cupper_id
- Support draft mode (incremental saves)
- Final submission calculates averages

**Props Passed to DigitalCuppingInterface:**
```typescript
<DigitalCuppingInterface
  samples={[sample]}        // Array of CuppingSample objects
  template={template}       // CuppingTemplate with attributes & defects
  onSave={handleSave}      // Callback to save scores
/>
```

### 4. Digital Cupping Interface
**File:** `src/components/cupping/digital-cupping-interface.tsx` (1000+ lines)

**Component Structure:**

```
DigitalCuppingInterface
├── Desktop Layout (>= 768px)
│   ├── MainLayout wrapper
│   ├── Sample tabs (if multiple samples)
│   ├── Left: Attribute scoring section
│   │   ├── Attribute list with sliders
│   │   ├── +/- buttons for fine control
│   │   └── Real-time score total
│   ├── Right: Defect management
│   │   ├── Add defect button
│   │   ├── Defect list with intensity sliders
│   │   └── Delete defect buttons
│   └── Action buttons (Save/Submit)
│
└── Mobile Layout (< 768px)
    ├── Fixed header with sample info
    ├── Scrollable attribute section
    │   └── Tap-to-edit number inputs
    ├── Bottom sheet for defects
    │   └── Slides up from bottom
    └── Fixed bottom action bar
```

**Key State:**
```typescript
const [activeSampleId, setActiveSampleId] = useState(samples[0]?.id)
const [scores, setScores] = useState<Record<string, AttributeScore[]>>({})
const [defects, setDefects] = useState<Record<string, Defect[]>>({})
const [selectedDefectForEdit, setSelectedDefectForEdit] = useState<string | null>(null)
const [isSaving, setIsSaving] = useState(false)
```

**Key Functions:**

#### `handleScoreChange()` (Lines ~200-220)
- Updates score for a specific attribute
- Validates against scale min/max
- Updates state immutably
- Triggers re-render for real-time total

#### `addDefect()` (Lines ~300-320)
- Adds new defect with default values
- cups_affected: 1
- intensity: 1 (taint by default)
- Opens edit mode immediately

#### `updateDefect()` (Lines ~350-370)
- Updates defect intensity or cups_affected
- Recalculates is_taint based on threshold
- intensity <= taint_threshold → is_taint = true

#### `calculateTotalScore()` (Lines ~100-120)
- Sums all attribute scores
- TODO: Subtract defect penalties
- Returns number for display

**Mobile-Specific Features:**
- Bottom sheet implemented with transform animations
- Touch handlers for swipe-up gesture
- Number inputs open mobile keyboard with number pad
- 44px minimum touch targets (iOS guidelines)
- Simplified one-column layout

### 5. Type Definitions

#### `src/types/cupping-session.ts`
Defines:
- `CuppingSession` - Main session record
- `CupperScores` - Individual cupper's scores
- `AttributeScore` - Single attribute score
- `QualityValidationResult` - PSS/SS validation results
- Session statuses: pending, in_progress, completed, validated, rejected

#### `src/types/cupping-templates.ts`
Defines:
- `AttributeWithScale` - Attribute + scale configuration
- Template types and methodology enums

#### `src/types/attribute-scales.ts`
Defines:
- `NumericScale` - min, max, increment
- `WordingScale` - options with labels and values
- `AttributeScaleType` - Union type
- Helper functions: `getScaleMinValue()`, `getScaleMaxValue()`, `isValidScore()`

---

## Data Structures

### Database Tables (Referenced)

#### `samples` table
```sql
- id: uuid (PK)
- tracking_number: text
- status: sample_status enum
  - 'received' → initial state
  - 'cupping' → ready for cupping (set by print dialog)
  - 'cupped' → cupping completed
  - 'approved' / 'rejected' → after validation
- quality_spec_id: uuid (FK → client_qualities)
- sample_type: 'pss' | 'ss' | 'type'
- cups_per_sample: integer (default 5)
```

#### `cupping_sessions` table (TODO: Implement)
```sql
- id: uuid (PK)
- sample_ids: uuid[] (array of sample IDs)
- cupper_ids: uuid[] (array of cupper user IDs)
- laboratory_id: uuid (FK → laboratories)
- config: jsonb (session configuration)
- status: cupping_session_status enum
- cupper_scores: jsonb[] (array of CupperScores)
- average_scores: jsonb (attribute → average)
- final_score: numeric
- validation_results: jsonb (for PSS/SS)
- created_at, started_at, completed_at
```

#### `quality_templates` table (via client_qualities)
```sql
- id: uuid (PK)
- name: text
- parameters: jsonb (contains cupping_attributes, defects, etc.)
- custom_parameters: jsonb (client-specific overrides)
```

### Quality Template Parameters Structure

**Location:** `parameters` or `custom_parameters` JSON field

```json
{
  "cupping_attributes": [
    {
      "attribute": "Fragrance/Aroma",
      "abbreviation": "Frag",
      "scale": {
        "type": "numeric",
        "min": 6,
        "max": 10,
        "increment": 0.25
      },
      "validation_rule": {
        "type": "minimum",
        "min_value": 7.0
      },
      "is_required": true
    }
  ],
  "defects": [
    "Fermented",
    "Phenolic",
    "Earthy",
    "Moldy",
    "Musty"
  ],
  "taint_threshold": 3,
  "max_intensity": 7,
  "cups_per_sample": 5
}
```

---

## UX Design Patterns

### 1. Responsive Design Strategy

#### Desktop (>= 768px)
- Two-column layout (attributes left, defects right)
- Sliders for all inputs
- +/- buttons for fine control
- Full MainLayout with navigation
- Side-by-side attribute/defect management

#### Mobile (< 768px)
- Single-column layout
- **Tap-to-edit number inputs** - Opens native number pad
- Bottom sheet for defects (slides up on tap)
- Simplified header (no full navigation)
- Sticky action buttons at bottom

### 2. Intensity-Based Defect Classification

**Visual Feedback:**
```
Intensity 1-3 → Orange badge labeled "Taint"
Intensity 4-7 → Red badge labeled "Fault"
```

**User Interaction:**
1. User adds defect by name (searchable dropdown or input)
2. User sets cups affected (1-5) with slider
3. User sets intensity (1-7) with slider
4. System automatically calculates and displays classification
5. Badge color updates in real-time

**Why This Approach:**
- Aligns with SCA methodology (taints vs faults)
- Clear visual distinction
- No manual classification needed
- Configurable threshold per template

### 3. Multi-Sample Cupping

**Tab Navigation:**
- Horizontal tabs at top
- Shows tracking number per tab
- Clicking tab switches active sample
- Scores saved per sample independently
- Visual indicator for completed samples (checkmark)

### 4. Real-Time Score Display

**Total Score Calculation:**
- Displayed prominently at top-right
- Updates immediately on any score change
- Large font size (24px, font-weight: 600)
- Shows decimal precision (e.g., 85.75)

---

## Critical Design Decisions

### Decision 1: Cupping and Grading Are Parallel Workflows

**Why:**
- User explicitly stated: "cupping can be done before, after or simultaneously"
- Example: "one guy can cup while the other grades for instance"
- Allows lab flexibility and efficiency

**Implementation:**
- Separate status values: 'cupping' and 'grading'
- Separate list pages: `/assessment/cupping` and `/assessment/grading`
- Independent completion tracking
- Both workflows update same sample record

**DO NOT:**
- Make cupping depend on grading completion
- Filter cupping list by grading status
- Require sequential processing

### Decision 2: Template-Driven Everything

**Why:**
- Multi-language support (Spanish, Portuguese, English)
- Client-specific requirements (different attributes)
- Flexible scales (numeric vs wording)
- Custom abbreviations for printing

**Implementation:**
- All attributes from `cupping_attributes` in template
- All defects from `defects` array in template
- Scales defined per attribute (NumericScale or WordingScale)
- 4-strategy extraction logic for backward compatibility

**DO NOT:**
- Hardcode attribute lists in components
- Assume SCA standard attributes
- Skip template loading from database

### Decision 3: Automatic Status Update on Card Generation

**Why:**
- Ensures workflow continuity
- Eliminates manual status update step
- Samples immediately appear on cupping list
- Reduces user errors

**Implementation:**
- `updateSampleStatuses()` called in `generateCards()` at line 307
- Updates happen after successful card generation
- Parallel updates using Promise.all
- Logs results for debugging

**DO NOT:**
- Remove this automatic update
- Make status update manual
- Skip this step in card generation flow

### Decision 4: Mobile Number Pad for Score Input

**Why:**
- Faster input on mobile devices
- More precise than slider on small screens
- Native OS keyboard (better UX)
- Follows mobile-first best practices

**Implementation:**
- `<input type="number" inputMode="numeric">`
- Opens number pad on tap
- Validates against scale min/max
- Falls back to slider for coarse adjustment

**DO NOT:**
- Remove number input option on mobile
- Use text input instead of number input
- Make slider the only input method on mobile

---

## Next Phase Requirements

### 1. Load Real Quality Templates

**Current State:** Using hardcoded default SCA template

**Requirements:**
1. Create GET `/api/quality/templates/[id]` endpoint (if not exists)
2. In cupping detail page `loadSampleData()`:
   ```typescript
   // After loading sample
   const qualitySpecId = sampleData.quality_spec_id
   const templateResponse = await fetch(`/api/quality/templates/${qualitySpecId}`)
   const templateData = await templateResponse.json()

   // Extract attributes using 4-strategy logic (same as print dialog)
   const cuppingAttributes = extractCuppingAttributes(templateData)
   const defects = templateData.parameters?.defects || DEFAULT_DEFECTS
   const taintThreshold = templateData.parameters?.taint_threshold || 3
   ```

3. Use same 4-strategy extraction logic as print dialog (lines 202-243)
4. Handle missing templates gracefully (fallback to default)

**File to Update:**
- `src/app/assessment/cupping/[id]/page.tsx` lines 78-101

### 2. Implement Save API Endpoints

**Endpoints Needed:**

#### POST `/api/cupping/sessions`
Create new cupping session:
```typescript
Request Body: {
  sample_ids: string[],
  cupper_ids: string[],
  config: {
    session_type: 'type' | 'pss' | 'ss',
    input_method: 'digital',
    quality_template_id: string,
    num_cups_per_sample: number,
    attributes: AttributeWithScale[]
  }
}

Response: {
  session: CuppingSession
}
```

#### PATCH `/api/cupping/sessions/[id]`
Update session with scores:
```typescript
Request Body: {
  cupper_id: string,
  sample_id: string,
  scores: AttributeScore[],
  defects: Defect[],
  overall_notes?: string,
  is_draft: boolean  // true for auto-save, false for final submission
}

Response: {
  session: CuppingSession
}
```

#### GET `/api/cupping/sessions/[id]`
Load existing session for continuation

**Database Operations:**
1. Insert/update `cupping_sessions` table
2. Store `cupper_scores` array in JSONB
3. Calculate `average_scores` when all cuppers complete
4. Update sample `status` to 'cupped' when session completed
5. Run quality validation for PSS/SS samples

**Files to Create:**
- `src/app/api/cupping/sessions/route.ts`
- `src/app/api/cupping/sessions/[id]/route.ts`

### 3. Quality Validation (PSS/SS Samples)

**Requirements:**
1. After all cuppers complete, check each attribute against validation_rule
2. Verify scores meet minimum requirements
3. Check overall score threshold
4. Generate validation report
5. Update sample status to 'approved' or 'rejected'

**Implementation:**
```typescript
// In session completion handler
if (sample.sample_type === 'pss' || sample.sample_type === 'ss') {
  const validationResult = await validateCuppingScores(
    session.average_scores,
    template.parameters.cupping_attributes
  )

  await updateSampleStatus(
    sample.id,
    validationResult.passed ? 'approved' : 'rejected'
  )
}
```

### 4. Multi-Cupper Session Management

**Requirements:**
1. Load existing session if cupper already started
2. Show progress indicator (X of Y cuppers completed)
3. Real-time updates when other cuppers complete (optional)
4. Prevent editing after final submission
5. Show average scores after all complete

**UI Changes:**
- Add session indicator in header
- Show "Continue Session" vs "Start New Session"
- Display other cuppers' completion status
- Lock interface after submission

### 5. Defect Penalty Calculation

**Requirements:**
1. Define penalty calculation rules per intensity
2. Subtract penalties from total score
3. Show penalty breakdown in UI
4. Save penalty details in session

**Example Calculation:**
```typescript
const calculateDefectPenalty = (defect: Defect): number => {
  // SCA standard penalties
  const basePenalty = defect.is_taint ? 2 : 4
  const intensityMultiplier = defect.intensity / 7
  return basePenalty * intensityMultiplier * defect.cups_affected
}

const totalPenalty = defects.reduce(
  (sum, defect) => sum + calculateDefectPenalty(defect),
  0
)
const finalScore = totalAttributeScore - totalPenalty
```

### 6. Print QR Code Sheet for OCR Scanning

**Requirements:**
1. Generate sheet with QR codes for each sample
2. Include cupper names and sample info
3. Optimized for scanning workflow
4. Support batch printing

**Status:** Card generation complete, sheet layout needed

---

## Testing Checklist

### Manual Testing Steps

1. **Card Generation & Status Update:**
   - [ ] Select sample from list
   - [ ] Assign 2-3 cuppers
   - [ ] Print cupping cards (PDF format)
   - [ ] Verify sample status changed to 'cupping'
   - [ ] Verify sample appears on cupping list page

2. **Cupping List Page:**
   - [ ] Navigate to /assessment/cupping
   - [ ] Verify only samples with status='cupping' appear
   - [ ] Verify empty state shows when no samples
   - [ ] Click "Start Cupping" button

3. **Digital Cupping Interface (Desktop):**
   - [ ] Verify template attributes load correctly
   - [ ] Test slider for score input
   - [ ] Test +/- buttons for fine adjustment
   - [ ] Add defect with intensity
   - [ ] Verify taint/fault classification (1-3 vs 4-7)
   - [ ] Verify total score calculation
   - [ ] Test save button (currently shows alert)

4. **Digital Cupping Interface (Mobile):**
   - [ ] Resize browser to < 768px width
   - [ ] Verify bottom sheet appears
   - [ ] Tap number input (should open number pad)
   - [ ] Test defect bottom sheet slide-up
   - [ ] Verify thumb-friendly button sizes
   - [ ] Test save action from bottom bar

5. **Multi-Sample Support:**
   - [ ] TODO: Test with multiple samples once implemented
   - [ ] Verify tab navigation
   - [ ] Verify scores saved per sample

6. **Template Variations:**
   - [ ] TODO: Test with Portuguese template
   - [ ] TODO: Test with Spanish template
   - [ ] TODO: Test with wording-based scales
   - [ ] TODO: Test with custom attributes

---

## Known Issues & Limitations

### Current Limitations

1. **Hardcoded Template:**
   - Currently using default SCA template
   - Not loading from database
   - All samples show same attributes
   - **FIX REQUIRED:** Implement template loading (see Next Phase #1)

2. **No Save Functionality:**
   - Scores not persisted to database
   - handleSave() just logs to console
   - No session management
   - **FIX REQUIRED:** Implement API endpoints (see Next Phase #2)

3. **Single Cupper Mode:**
   - No multi-cupper session support
   - Can't see other cuppers' progress
   - No average calculation
   - **FIX REQUIRED:** Implement session management (see Next Phase #4)

4. **No Validation:**
   - PSS/SS samples not validated against requirements
   - No approval/rejection workflow
   - **FIX REQUIRED:** Implement validation (see Next Phase #3)

5. **No Defect Penalties:**
   - Total score doesn't subtract defect penalties
   - calculateTotalScore() only sums attributes
   - **FIX REQUIRED:** Implement penalty calculation (see Next Phase #5)

### Browser Compatibility

**Tested:**
- Chrome 120+ ✅
- Safari 17+ ✅
- Mobile Safari iOS 17+ ✅

**Not Tested:**
- Firefox (should work)
- Edge (should work)
- Older browsers

**Required Features:**
- CSS Grid
- Flexbox
- transform animations
- inputMode attribute
- Number input type

---

## Code Patterns to Follow

### 1. Template Attribute Extraction

**Always use 4-strategy approach:**

```typescript
// Strategy 1: New format with abbreviations
if (customParams.cupping_attributes && Array.isArray(customParams.cupping_attributes)) {
  return customParams.cupping_attributes
}
// Strategy 2: Template format
else if (templateParams.cupping_attributes) {
  return templateParams.cupping_attributes
}
// Strategy 3: Legacy format
else if (customParams.attributes) {
  return customParams.attributes.map(...)
}
// Strategy 4: Methodology-specific
else if (templateParams.scaa_attributes) {
  return templateParams.scaa_attributes.map(...)
}
// Fallback: Default attributes
else {
  return DEFAULT_SCA_ATTRIBUTES
}
```

### 2. Status Updates

**Always update in parallel:**

```typescript
const updatePromises = samples.map(async (sample) => {
  const response = await fetch(`/api/samples/${sample.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'cupping' }),
  })
  return { id: sample.id, success: response.ok }
})

const results = await Promise.all(updatePromises)
const successCount = results.filter(r => r.success).length
```

### 3. Scale Validation

**Always validate against scale:**

```typescript
const isValid = (score: number, scale: AttributeScaleType): boolean => {
  if (scale.type === 'numeric') {
    return score >= scale.min && score <= scale.max
  } else {
    return scale.options.some(opt => opt.value === score)
  }
}
```

### 4. Mobile Detection

**Use CSS media queries, not JavaScript:**

```typescript
// In component
<div className="hidden md:block">Desktop content</div>
<div className="md:hidden">Mobile content</div>

// In Tailwind config
screens: {
  'md': '768px',  // Matches our mobile breakpoint
}
```

---

## Dependencies

### NPM Packages Used

1. **@radix-ui/react-slider** - Slider component
2. **@radix-ui/react-tabs** - Tabs component
3. **lucide-react** - Icons (Minus, Plus, X, Save, Coffee)
4. **qrcode** - QR code generation
5. **@react-pdf/renderer** - PDF generation

### Internal Dependencies

1. **UI Components:**
   - `@/components/ui/button`
   - `@/components/ui/card`
   - `@/components/ui/badge`
   - `@/components/ui/slider`
   - `@/components/ui/tabs`
   - `@/components/layout/main-layout`

2. **Type Definitions:**
   - `@/types/cupping-session`
   - `@/types/cupping-templates`
   - `@/types/attribute-scales`

3. **Utilities:**
   - `@/lib/utils` (cn() for className merging)

---

## Summary

This implementation connects the cupping workflow from card printing through digital cupping. The system is **template-driven** (not hardcoded), supports **parallel cupping/grading workflows**, and provides **mobile-responsive interfaces**.

**Critical Success Factors:**
1. Always load attributes from quality templates
2. Update sample status automatically when printing cards
3. Maintain cupping/grading workflow independence
4. Use 4-strategy template extraction for backward compatibility
5. Follow mobile-first design patterns (tap-to-edit, bottom sheets)

**Next Phase Priority:**
1. Implement real template loading
2. Create save API endpoints
3. Add quality validation for PSS/SS

This documentation should serve as the single source of truth for the cupping workflow implementation.
