# Client Auto-Detection Integration Testing Guide

## Test Environment
- Dev Server: http://localhost:3000
- Test Page: http://localhost:3000/test/client-auto-detection
- Sample Intake: http://localhost:3000/samples/intake

## Pre-Test Setup

1. **Verify Dev Server is Running**
   ```bash
   npm run dev
   # Should show: Local: http://localhost:3000
   ```

2. **Check Database Connection**
   - Ensure you have some clients in the database with `qc_enabled = true`
   - Ensure you have some historical samples with `client_id` populated

## Integration Tests

### Test 1: Standalone Component Test
**URL:** http://localhost:3000/test/client-auto-detection

**Steps:**
1. Navigate to the test page
2. Click on "Brazil Exporter" scenario button
3. Verify:
   - ✅ Component loads without errors
   - ✅ Detection algorithm runs automatically
   - ✅ Suggested clients appear (if matching data exists)
   - ✅ Confidence scores are displayed
   - ✅ Match reasons are shown with icons

**Expected Results:**
- Component displays "Suggested Clients" section
- Shows up to 3 matches with confidence percentages
- Each match shows match reasons (exact name, origin history, etc.)
- Clicking a match selects it and updates "Selected Client" badge

### Test 2: Manual Metadata Entry
**URL:** http://localhost:3000/test/client-auto-detection

**Steps:**
1. Clear all test scenario data
2. Manually enter:
   - Exporter: "Carmo Coffees" (or any client name from your database)
   - Origin: "Brazil"
   - Supplier: "Test Farm"
3. Verify:
   - ✅ Detection updates in real-time (debounced 300ms)
   - ✅ Confidence scores adjust as you type
   - ✅ Partial matches appear for similar names

**Expected Results:**
- Auto-detection triggers after typing at least 2 characters
- Shows "Detecting potential client matches..." loading state
- Updates results dynamically as metadata changes

### Test 3: Sample Intake Integration
**URL:** http://localhost:3000/samples/intake

**Steps:**
1. Navigate to sample intake page
2. Fill in Step 1 - Basic Information:
   - Laboratory: Select your lab
   - Origin: "Brazil"
   - Exporter: Type a known client name (e.g., "Carmo")
   - Sample Type: "PSS"
3. Scroll down to view auto-detection component
4. Verify:
   - ✅ ClientAutoDetection component appears below form fields
   - ✅ Shows suggested clients based on entered data
   - ✅ Auto-select is enabled (85%+ confidence matches auto-selected)
   - ✅ Clicking a suggestion updates the form's client_id

**Expected Results:**
- Auto-detection appears after entering exporter/buyer/roaster name
- High-confidence matches are automatically selected
- Manual override available
- Quick Selection badges still work as fallback

### Test 4: Contract Number Matching
**URL:** http://localhost:3000/test/client-auto-detection

**Steps:**
1. Load "Contract Match" scenario or manually enter:
   - Wolthers Contract: "W-2025-001" (use a real contract from your data)
2. Verify:
   - ✅ Contract number matching algorithm runs
   - ✅ High weight (35%) applied if contract found in history
   - ✅ Match reason shows "contract number(s) matched in history"

**Expected Results:**
- Contract matches get 35% confidence boost
- Shows purple icon for contract match reason

### Test 5: Historical Pattern Matching
**URL:** http://localhost:3000/test/client-auto-detection

**Steps:**
1. Enter metadata for a client with known sample history:
   - Exporter: Client with previous samples
   - Origin: Origin that matches their history
   - Supplier: Supplier they've used before
2. Verify:
   - ✅ Origin history match appears (orange icon)
   - ✅ Supplier history match appears (cyan icon)
   - ✅ Recent activity bonus appears (indigo icon)
   - ✅ Historical data shows total samples and recent count

**Expected Results:**
- Multiple match reasons combine for higher confidence
- Shows statistics like "15 total samples" and "3 recent"

### Test 6: Edge Cases

**Empty Metadata:**
1. Clear all fields
2. Verify: Component doesn't render (returns null)

**No Matches:**
1. Enter completely unknown data (e.g., "XYZ Unknown Company")
2. Verify: Component shows "No matches" or doesn't appear

**Multiple High Confidence Matches:**
1. Enter generic term that matches multiple clients
2. Verify: Shows top 3 matches sorted by confidence

## Performance Tests

### Test 7: Real-time Detection Performance
**Steps:**
1. Open browser DevTools Network tab
2. Type rapidly in exporter field
3. Verify:
   - ✅ Debouncing works (300ms delay)
   - ✅ No excessive API calls
   - ✅ Loading states appear/disappear smoothly

### Test 8: Large Dataset Performance
**Steps:**
1. Test with database containing 100+ clients and 1000+ samples
2. Verify:
   - ✅ Detection completes in < 2 seconds
   - ✅ No UI freezing
   - ✅ Results appear smoothly

## Error Handling Tests

### Test 9: Network Errors
**Steps:**
1. Open DevTools and set Network to "Offline"
2. Try auto-detection
3. Verify:
   - ✅ Graceful error handling
   - ✅ No console errors crash the app
   - ✅ Component shows appropriate state

### Test 10: Database Connection Issues
**Steps:**
1. Temporarily simulate database error (if possible)
2. Verify:
   - ✅ Component handles errors gracefully
   - ✅ User sees appropriate feedback
   - ✅ App remains functional

## Browser Console Checks

**Expected Console Output:**
- No errors in console
- Only informational logs like "Client selected: [id]"

**Red Flags:**
- TypeScript errors
- React hydration errors
- Unhandled promise rejections
- Supabase connection errors

## Test Results Documentation

### ✅ Passed Tests
- [ ] Test 1: Standalone Component Test
- [ ] Test 2: Manual Metadata Entry
- [ ] Test 3: Sample Intake Integration
- [ ] Test 4: Contract Number Matching
- [ ] Test 5: Historical Pattern Matching
- [ ] Test 6: Edge Cases
- [ ] Test 7: Real-time Detection Performance
- [ ] Test 8: Large Dataset Performance
- [ ] Test 9: Network Errors
- [ ] Test 10: Database Connection Issues

### ❌ Failed Tests
(Document any failures with screenshots and error messages)

### 🐛 Bugs Found
(List any bugs discovered during testing)

### 💡 Improvements Identified
(Note any UX or performance improvements that could be made)

## Sign-off

- Tester Name: _______________
- Date: _______________
- Build Version: _______________
- Status: ✅ Pass / ❌ Fail
- Notes: _______________________________________________
