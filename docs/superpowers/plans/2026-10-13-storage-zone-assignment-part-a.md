# Storage Zone Assignment Implementation Plan, Part A (SQL, server, editor model)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lab staff pick cubbies or whole shelves in the storage editor and assign them to a client; Save writes the zones through a new database function that keeps a history.

**Architecture:** Zones live on `storage_positions.company_id`. The editor keeps this session's assignments as `zone_edits` on each shelf (part of the undoable document); Save sends them by cubby code to `save_storage_zones`, which writes only real changes and logs each in `storage_zone_history`. Layout editing stays manager-only through `EditorState.canLayout`, which the reducer enforces. Part B (`2026-10-13-storage-zone-assignment-part-b.md`) builds the cubby display, the panels and the workspace wiring on top of this part.

**Tech Stack:** Next.js 15 App Router, React, TypeScript, Supabase Postgres (plpgsql, SECURITY DEFINER), Vitest 2 + jsdom + Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-13-storage-zone-assignment-design.md` (amends §5.3 of `2026-10-07-lab-storage-blueprint-design.md`).

## Global Constraints

- Never render `samples.tracking_number` (SAN) anywhere: UI, history, replies. Show certificate numbers or contract refs.
- Company names: trade name first (`companyDisplayName`, or `fantasy_name` then `name` in SQL); the clients API's `company` field already is the trade name.
- No emojis. Inter, black/white palette; corners: windows 10 px, controls 6/4 px, data (cubbies, grids) square.
- Keep every file under ~2000 lines.
- SQL is pasted for Daniel, who applies it. In pasted SQL never use `SELECT … INTO` (the Supabase editor appends `ENABLE RLS` after it); assign with `v := (SELECT …)`. Inline the profiles predicate (no `is_waqc_staff` helper). Never drop the sys RESTRICTIVE `*_deny` policies.
- Route files (`route.ts`) export only HTTP handlers; helpers live in `src/lib/storage/`.
- Commit to `main` (trunk-based). Do not push until Daniel has applied `20261013000002_storage_zone_assignment.sql`.
- Test commands: `npx vitest run <paths>`; type check `npx tsc --noEmit -p .`.

## Review Focus

1. A manager renames shelf B to C and assigns its cubbies in the same session: the zones must land on C's cubbies after the layout save (Task 3, `zoneChanges` test with a renamed shelf).
2. A manager shrinks a shelf's grid after assigning cubbies in the removed rows: those edits must not be sent (Task 3, out-of-grid test).
3. Two people edit zones at once: Save sends only the cells this session assigned, never a stale copy of the rest (Task 3, "only this session's edits" test).
4. Keys pressed while the cubby display is open (Delete, R on a focused cubby) must not change the shelf behind it (Task 5, keyboard test).
5. A user without layout rights must not be able to move, delete or rename anything by any route: keyboard, menu, drag (Task 4 reducer test, Task 5 canvas and menu tests).

---

### Task 1: Migration and scenario script

**Files:**
- Create: `database/migrations/20261013000002_storage_zone_assignment.sql`
- Create: `database/tests/storage_zone_scenarios.sql`

**Interfaces:**
- Produces (database):
  - table `public.storage_zone_history (id, laboratory_id, position_id, position_code, from_company_id, to_company_id, changed_by, changed_at)`
  - `public.save_storage_zones(p_lab uuid, p_changes jsonb) RETURNS integer`; raises `forbidden` (42501), `invalid_zone_changes` (22023), `unknown_cubby` (P0001), `unknown_company` (P0001)
  - `public.storage_zone_history_events(p_lab uuid, p_shelf uuid, p_limit integer) RETURNS TABLE (changed_at timestamptz, changed_by_name text, from_name text, to_name text, codes text[])`

- [ ] **Step 1: Write the migration**

```sql
-- Storage zones assigned by hand (spec docs/superpowers/specs/2026-10-13-storage-zone-assignment-design.md).
-- Anyone who works in a lab may set which client a cubby is for; every change
-- is logged. The caller rule is the view rule of storage_lab_occupancy
-- (20261013000000): global admins, global_* roles, or internal staff of that lab.

BEGIN;

CREATE TABLE IF NOT EXISTS public.storage_zone_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  laboratory_id uuid NOT NULL REFERENCES public.laboratories(id) ON DELETE CASCADE,
  position_id uuid REFERENCES public.storage_positions(id) ON DELETE SET NULL,
  position_code text NOT NULL,
  from_company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  to_company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  changed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS storage_zone_history_lab_at ON public.storage_zone_history (laboratory_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS storage_zone_history_position ON public.storage_zone_history (position_id);

ALTER TABLE public.storage_zone_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS storage_zone_history_staff_select ON public.storage_zone_history;
CREATE POLICY storage_zone_history_staff_select ON public.storage_zone_history FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()
    AND (p.is_global_admin = true
         OR (COALESCE(p.qc_role::text, '') NOT IN ('', 'client', 'supplier', 'buyer')
             AND (p.qc_role::text LIKE 'global\_%' OR p.laboratory_id = storage_zone_history.laboratory_id)))));
REVOKE INSERT, UPDATE, DELETE ON public.storage_zone_history FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.save_storage_zones(p_lab uuid, p_changes jsonb)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_change jsonb;
  v_code text;
  v_company uuid;
  v_position uuid;
  v_current uuid;
  v_count integer := 0;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles p WHERE p.id = auth.uid()
      AND (p.is_global_admin = true
           OR (COALESCE(p.qc_role::text, '') NOT IN ('', 'client', 'supplier', 'buyer')
               AND (p.qc_role::text LIKE 'global\_%' OR p.laboratory_id = p_lab)))
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF jsonb_typeof(p_changes) IS DISTINCT FROM 'array' OR jsonb_array_length(p_changes) > 5000 THEN
    RAISE EXCEPTION 'invalid_zone_changes' USING ERRCODE = '22023';
  END IF;

  -- One save at a time per lab, the same lock save_lab_floor_plan takes.
  PERFORM 1 FROM laboratories WHERE id = p_lab FOR UPDATE;

  FOR v_change IN SELECT e FROM jsonb_array_elements(p_changes) e LOOP
    v_code := v_change->>'code';
    IF v_code IS NULL OR length(v_code) = 0
       OR COALESCE(jsonb_typeof(v_change->'company_id'), 'missing') NOT IN ('string', 'null') THEN
      RAISE EXCEPTION 'invalid_zone_changes' USING ERRCODE = '22023';
    END IF;
    v_company := (v_change->>'company_id')::uuid;

    v_position := (SELECT sp.id FROM storage_positions sp
                   WHERE sp.laboratory_id = p_lab AND sp.position_code = v_code LIMIT 1);
    IF v_position IS NULL THEN
      RAISE EXCEPTION 'unknown_cubby' USING ERRCODE = 'P0001', DETAIL = v_code;
    END IF;
    IF v_company IS NOT NULL AND NOT EXISTS (SELECT 1 FROM companies c WHERE c.id = v_company) THEN
      RAISE EXCEPTION 'unknown_company' USING ERRCODE = 'P0001';
    END IF;

    v_current := (SELECT sp.company_id FROM storage_positions sp WHERE sp.id = v_position);
    IF v_current IS DISTINCT FROM v_company THEN
      UPDATE storage_positions SET company_id = v_company WHERE id = v_position;
      INSERT INTO storage_zone_history (laboratory_id, position_id, position_code, from_company_id, to_company_id, changed_by)
      VALUES (p_lab, v_position, v_code, v_current, v_company, auth.uid());
      v_count := v_count + 1;
    END IF;
  END LOOP;

  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.save_storage_zones(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_storage_zones(uuid, jsonb) TO authenticated;

-- One row per save and client change (a save is one transaction, so its rows share changed_at).
CREATE OR REPLACE FUNCTION public.storage_zone_history_events(p_lab uuid, p_shelf uuid DEFAULT NULL, p_limit integer DEFAULT 20)
RETURNS TABLE (changed_at timestamptz, changed_by_name text, from_name text, to_name text, codes text[])
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT h.changed_at,
         COALESCE(NULLIF(trim(pr.full_name), ''), pr.email, 'Unknown') AS changed_by_name,
         COALESCE(NULLIF(trim(fc.fantasy_name), ''), fc.name) AS from_name,
         COALESCE(NULLIF(trim(tc.fantasy_name), ''), tc.name) AS to_name,
         array_agg(h.position_code ORDER BY h.position_code) AS codes
  FROM storage_zone_history h
  LEFT JOIN profiles pr ON pr.id = h.changed_by
  LEFT JOIN companies fc ON fc.id = h.from_company_id
  LEFT JOIN companies tc ON tc.id = h.to_company_id
  WHERE h.laboratory_id = p_lab
    AND (p_shelf IS NULL OR h.position_id IN (SELECT sp.id FROM storage_positions sp WHERE sp.shelf_id = p_shelf))
    AND EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid()
      AND (p.is_global_admin = true
           OR (COALESCE(p.qc_role::text, '') NOT IN ('', 'client', 'supplier', 'buyer')
               AND (p.qc_role::text LIKE 'global\_%' OR p.laboratory_id = p_lab))))
  GROUP BY h.changed_at, h.changed_by, pr.full_name, pr.email,
           h.from_company_id, fc.fantasy_name, fc.name, h.to_company_id, tc.fantasy_name, tc.name
  ORDER BY h.changed_at DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 100)
$$;

REVOKE EXECUTE ON FUNCTION public.storage_zone_history_events(uuid, uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.storage_zone_history_events(uuid, uuid, integer) TO authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';

SELECT 'column' AS kind, column_name AS name, data_type AS detail
FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'storage_zone_history'
UNION ALL
SELECT 'function', p.proname, pg_get_function_identity_arguments(p.oid)
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname IN ('save_storage_zones', 'storage_zone_history_events')
UNION ALL
SELECT 'policy', policyname, permissive || ' ' || cmd
FROM pg_policies WHERE schemaname = 'public' AND tablename = 'storage_zone_history';
```

- [ ] **Step 2: Write the scenario script**

```sql
-- save_storage_zones and storage_zone_history_events scenarios. Runs in a
-- transaction and rolls back: nothing is kept. An error names the scenario that
-- failed; the set_config row (or "no rows") means every scenario passed.
-- Needs 20261007000001/2, 20261013000000/1 and 20261013000002 applied.
BEGIN;

SELECT set_config('request.jwt.claims', json_build_object(
  'sub', (SELECT id FROM public.profiles WHERE is_global_admin = true ORDER BY created_at LIMIT 1),
  'role', 'authenticated')::text, true);

INSERT INTO public.laboratories (id, name, code)
VALUES ('00000000-0000-4000-8000-0000000b0001', 'Zone scenario lab', 'ZZ-ZONE-TEST');

DO $$
DECLARE
  v_lab uuid := '00000000-0000-4000-8000-0000000b0001';
  v_shelf uuid;
  v_co uuid;
  v_n integer;
  v_ok boolean;
BEGIN
  PERFORM public.save_lab_floor_plan(v_lab, '{"version":1,"rooms":[],"items":[]}'::jsonb,
    '[{"shelf_letter":"A","rows":2,"columns":2,"samples_per_position":10,"x_cm":0,"y_cm":0,"width_cm":100,"depth_cm":40,"rot":0,"access_side":"front"}]'::jsonb);
  v_shelf := (SELECT id FROM public.lab_shelves WHERE laboratory_id = v_lab);
  v_co := (SELECT id FROM public.companies ORDER BY created_at LIMIT 1);
  IF v_shelf IS NULL OR v_co IS NULL THEN RAISE EXCEPTION 'setup failed'; END IF;

  -- 1. Two cubbies to a client: both written, both logged.
  v_n := public.save_storage_zones(v_lab, jsonb_build_array(
    jsonb_build_object('code', 'A-A1', 'company_id', v_co),
    jsonb_build_object('code', 'A-A2', 'company_id', v_co)));
  IF v_n <> 2 THEN RAISE EXCEPTION 'scenario 1: expected 2 changes, got %', v_n; END IF;
  IF (SELECT count(*) FROM public.storage_positions WHERE laboratory_id = v_lab AND company_id = v_co) <> 2 THEN
    RAISE EXCEPTION 'scenario 1: zones not written';
  END IF;
  IF (SELECT count(*) FROM public.storage_zone_history WHERE laboratory_id = v_lab) <> 2 THEN
    RAISE EXCEPTION 'scenario 1: changes not logged';
  END IF;

  -- 2. The same again changes and logs nothing.
  v_n := public.save_storage_zones(v_lab, jsonb_build_array(jsonb_build_object('code', 'A-A1', 'company_id', v_co)));
  IF v_n <> 0 OR (SELECT count(*) FROM public.storage_zone_history WHERE laboratory_id = v_lab) <> 2 THEN
    RAISE EXCEPTION 'scenario 2: an unchanged cubby was logged';
  END IF;

  -- 3. Back to general space, logged from the client.
  v_n := public.save_storage_zones(v_lab, '[{"code":"A-A2","company_id":null}]'::jsonb);
  IF v_n <> 1 OR NOT EXISTS (SELECT 1 FROM public.storage_zone_history WHERE laboratory_id = v_lab
      AND position_code = 'A-A2' AND from_company_id = v_co AND to_company_id IS NULL) THEN
    RAISE EXCEPTION 'scenario 3: return to general not logged';
  END IF;

  -- 4. A cubby the lab does not have.
  v_ok := false;
  BEGIN
    PERFORM public.save_storage_zones(v_lab, '[{"code":"Q-A1","company_id":null}]'::jsonb);
  EXCEPTION WHEN others THEN
    v_ok := SQLERRM = 'unknown_cubby';
  END;
  IF NOT v_ok THEN RAISE EXCEPTION 'scenario 4: unknown cubby not refused'; END IF;

  -- 5. A client that does not exist.
  v_ok := false;
  BEGIN
    PERFORM public.save_storage_zones(v_lab, '[{"code":"A-A1","company_id":"00000000-0000-4000-8000-0000000b0099"}]'::jsonb);
  EXCEPTION WHEN others THEN
    v_ok := SQLERRM = 'unknown_company';
  END;
  IF NOT v_ok THEN RAISE EXCEPTION 'scenario 5: unknown company not refused'; END IF;

  -- 6. A body that is not a list.
  v_ok := false;
  BEGIN
    PERFORM public.save_storage_zones(v_lab, '{"code":"A-A1"}'::jsonb);
  EXCEPTION WHEN others THEN
    v_ok := SQLERRM = 'invalid_zone_changes';
  END;
  IF NOT v_ok THEN RAISE EXCEPTION 'scenario 6: a non-list was accepted'; END IF;

  -- 7. History: one event per save and client change, codes sorted, also per shelf.
  IF (SELECT count(*) FROM public.storage_zone_history_events(v_lab, NULL, 20)) <> 2 THEN
    RAISE EXCEPTION 'scenario 7: expected 2 events';
  END IF;
  IF (SELECT codes FROM public.storage_zone_history_events(v_lab, NULL, 20) WHERE to_name IS NOT NULL)
     IS DISTINCT FROM ARRAY['A-A1', 'A-A2'] THEN
    RAISE EXCEPTION 'scenario 7: codes not grouped into one event';
  END IF;
  IF (SELECT count(*) FROM public.storage_zone_history_events(v_lab, v_shelf, 20)) <> 2 THEN
    RAISE EXCEPTION 'scenario 7: the shelf filter lost events';
  END IF;
END $$;

-- 8. A user of another lab can neither assign nor read (last: it changes the user).
DO $$
DECLARE
  v_lab uuid := '00000000-0000-4000-8000-0000000b0001';
  v_user uuid;
  v_ok boolean := false;
BEGIN
  v_user := (SELECT id FROM public.profiles
             WHERE qc_role::text = 'lab_personnel' AND COALESCE(is_global_admin, false) = false
               AND laboratory_id IS DISTINCT FROM v_lab LIMIT 1);
  IF v_user IS NULL THEN RETURN; END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
  BEGIN
    PERFORM public.save_storage_zones(v_lab, '[]'::jsonb);
  EXCEPTION WHEN insufficient_privilege THEN
    v_ok := true;
  END;
  IF NOT v_ok THEN RAISE EXCEPTION 'scenario 8: a user of another lab could assign zones'; END IF;
  IF (SELECT count(*) FROM public.storage_zone_history_events(v_lab, NULL, 20)) <> 0 THEN
    RAISE EXCEPTION 'scenario 8: a user of another lab could read the history';
  END IF;
END $$;

ROLLBACK;
```

- [ ] **Step 3: Commit**

```bash
git add database/migrations/20261013000002_storage_zone_assignment.sql database/tests/storage_zone_scenarios.sql
git commit -m "feat(storage): zone history table, save_storage_zones and history events (SQL, not applied)"
```

Daniel applies both after Part A is reviewed (paste the migration, then the scenario script). Nothing is pushed before he confirms.

---

### Task 2: Server: assign rule, can_assign, zones and history routes

**Files:**
- Modify: `src/lib/storage/storage-access.ts` (add `canAssignLabZones`)
- Modify: `src/lib/storage/storage-access.test.ts`
- Modify: `src/lib/storage/layout.ts:24-33` (`StorageLayout.can_assign`, `LayoutWithoutAccess`)
- Create: `src/lib/storage/zone-changes.ts`, `src/lib/storage/zone-changes.test.ts`
- Modify: `src/lib/storage/save-errors.ts` (add `zoneErrorResponse`)
- Modify: `src/app/api/laboratories/[id]/storage/route.ts` (GET and PUT return `can_assign`)
- Modify: `src/app/api/laboratories/[id]/storage/route.test.ts`
- Create: `src/app/api/laboratories/[id]/storage/zones/route.ts`, `.../zones/route.test.ts`
- Create: `src/app/api/laboratories/[id]/storage/zone-history/route.ts`, `.../zone-history/route.test.ts`

**Interfaces:**
- Consumes: the Task 1 database functions.
- Produces:
  - `canAssignLabZones(p: StorageProfile | null | undefined, labId: string): boolean`
  - `StorageLayout.can_assign: boolean`
  - `interface ZoneChange { code: string; company_id: string | null }`, `interface ZoneEvent { changed_at: string; changed_by_name: string; from_name: string | null; to_name: string | null; codes: string[] }`, `MAX_ZONE_CHANGES = 5000`, `parseZoneChanges(input: unknown): { ok: true; value: ZoneChange[] } | { ok: false; error: string }` (all in `src/lib/storage/zone-changes.ts`)
  - `PUT /api/laboratories/[id]/storage/zones` body `{ changes: ZoneChange[] }` → layout `{ …, can_edit, can_assign }`
  - `GET /api/laboratories/[id]/storage/zone-history?shelf=<uuid>&limit=<1..100>` → `{ events: ZoneEvent[] }`

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/storage/storage-access.test.ts` (and add `canAssignLabZones` to its import):

```ts
  it('lets everyone who works in the lab assign zones, and nobody outside it', () => {
    expect(canAssignLabZones({ qc_role: 'lab_personnel', laboratory_id: LAB }, LAB)).toBe(true)
    expect(canAssignLabZones({ qc_role: 'global_quality_admin', laboratory_id: null }, LAB)).toBe(true)
    expect(canAssignLabZones({ qc_role: 'lab_personnel', laboratory_id: 'other' }, LAB)).toBe(false)
    expect(canAssignLabZones({ qc_role: 'client', laboratory_id: LAB }, LAB)).toBe(false)
  })
```

Create `src/lib/storage/zone-changes.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { MAX_ZONE_CHANGES, parseZoneChanges } from './zone-changes'

const CO = '11111111-1111-4111-8111-111111111111'

describe('parseZoneChanges', () => {
  it('keeps one change per cubby, the last one winning, and accepts general space', () => {
    expect(parseZoneChanges([
      { code: 'b-a1', company_id: CO }, { code: 'B-A2', company_id: null }, { code: 'B-A1', company_id: null },
    ])).toEqual({ ok: true, value: [{ code: 'B-A1', company_id: null }, { code: 'B-A2', company_id: null }] })
  })

  it('refuses a body that is not a list, a missing code, a bad or missing client id and too many cubbies', () => {
    expect(parseZoneChanges({ code: 'B-A1' }).ok).toBe(false)
    expect(parseZoneChanges([{ company_id: null }]).ok).toBe(false)
    expect(parseZoneChanges([{ code: 'B-A1', company_id: 'ahold' }]).ok).toBe(false)
    expect(parseZoneChanges([{ code: 'B-A1' }]).ok).toBe(false)
    expect(parseZoneChanges(Array.from({ length: MAX_ZONE_CHANGES + 1 }, () => ({ code: 'B-A1', company_id: null }))).ok).toBe(false)
  })
})
```

In `src/app/api/laboratories/[id]/storage/route.test.ts`, in `'returns the layout and whether the user may edit'`, after `expect(body.can_edit).toBe(false)` add:

```ts
    expect(body.can_assign).toBe(true)
```

Create `src/app/api/laboratories/[id]/storage/zones/route.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { fakeSupabase } from '@/lib/storage/__fixtures__/fake-supabase'

const state = vi.hoisted(() => ({ db: null as any }))
vi.mock('@/lib/supabase-server', () => ({ createClient: async () => state.db }))

import { PUT } from './route'

const LAB = 'lab-santos'
const CO = '11111111-1111-4111-8111-111111111111'
const ctx = { params: Promise.resolve({ id: LAB }) }
const tables = (profile: Record<string, unknown>) => ({
  profiles: profile,
  laboratories: { id: LAB, name: 'Santos', floor_plan: null },
  lab_shelves: [],
  storage_positions: [],
  companies: [],
})
const put = (body: unknown) => ({ json: async () => body }) as any
const tech = { qc_role: 'lab_personnel', laboratory_id: LAB }

describe('PUT /api/laboratories/[id]/storage/zones', () => {
  it('lets anyone in the lab save zones through save_storage_zones', async () => {
    state.db = fakeSupabase({ tables: tables(tech) })
    const res = await PUT(put({ changes: [{ code: 'B-A1', company_id: CO }] }), ctx)
    expect(res.status).toBe(200)
    expect(state.db.rpcCalls).toContainEqual({
      fn: 'save_storage_zones', args: { p_lab: LAB, p_changes: [{ code: 'B-A1', company_id: CO }] },
    })
    const body = await res.json()
    expect([body.can_edit, body.can_assign]).toEqual([false, true])
  })

  it('refuses another lab, an anonymous request and a bad body without calling the database', async () => {
    state.db = fakeSupabase({ tables: tables({ qc_role: 'lab_personnel', laboratory_id: 'other' }) })
    expect((await PUT(put({ changes: [] }), ctx)).status).toBe(403)
    state.db = fakeSupabase({ user: null })
    expect((await PUT(put({ changes: [] }), ctx)).status).toBe(401)
    state.db = fakeSupabase({ tables: tables(tech) })
    expect((await PUT(put({ changes: 'B-A1' }), ctx)).status).toBe(400)
    expect(state.db.rpcCalls.find((c: { fn: string }) => c.fn === 'save_storage_zones')).toBeUndefined()
  })

  it('says when a cubby in the changes no longer exists', async () => {
    state.db = fakeSupabase({
      tables: tables(tech),
      rpc: { save_storage_zones: { data: null, error: { code: 'P0001', message: 'unknown_cubby' } } },
    })
    const res = await PUT(put({ changes: [{ code: 'B-A9', company_id: null }] }), ctx)
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/no longer exists/)
  })
})
```

Create `src/app/api/laboratories/[id]/storage/zone-history/route.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { fakeSupabase } from '@/lib/storage/__fixtures__/fake-supabase'

const state = vi.hoisted(() => ({ db: null as any }))
vi.mock('@/lib/supabase-server', () => ({ createClient: async () => state.db }))

import { GET } from './route'

const LAB = 'lab-santos'
const SHELF = '22222222-2222-4222-8222-222222222222'
const ctx = { params: Promise.resolve({ id: LAB }) }
const get = (query = '') => ({ nextUrl: new URL(`http://localhost/zone-history${query}`) }) as any
const tables = (profile: Record<string, unknown>) => ({ profiles: profile })
const tech = { qc_role: 'lab_personnel', laboratory_id: LAB }

describe('GET /api/laboratories/[id]/storage/zone-history', () => {
  it("reads one shelf's events, at most 100", async () => {
    const event = { changed_at: '2026-10-13T17:02:00Z', changed_by_name: 'Daniel Wolthers', from_name: null, to_name: 'Ahold', codes: ['B-A1'] }
    state.db = fakeSupabase({ tables: tables(tech), rpc: { storage_zone_history_events: { data: [event], error: null } } })
    const res = await GET(get(`?shelf=${SHELF}&limit=500`), ctx)
    expect(res.status).toBe(200)
    expect((await res.json()).events).toEqual([event])
    expect(state.db.rpcCalls).toContainEqual({
      fn: 'storage_zone_history_events', args: { p_lab: LAB, p_shelf: SHELF, p_limit: 100 },
    })
  })

  it('reads the whole lab by default, and refuses another lab and a shelf that is not an id', async () => {
    state.db = fakeSupabase({ tables: tables(tech) })
    await GET(get(), ctx)
    expect(state.db.rpcCalls).toContainEqual({ fn: 'storage_zone_history_events', args: { p_lab: LAB, p_shelf: null, p_limit: 20 } })
    state.db = fakeSupabase({ tables: tables({ qc_role: 'lab_personnel', laboratory_id: 'other' }) })
    expect((await GET(get(), ctx)).status).toBe(403)
    state.db = fakeSupabase({ tables: tables(tech) })
    expect((await GET(get('?shelf=B'), ctx)).status).toBe(400)
  })
})
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/lib/storage/storage-access.test.ts src/lib/storage/zone-changes.test.ts src/app/api/laboratories`
Expected: FAIL: `canAssignLabZones` is not exported, `./zone-changes` and both new `./route` modules cannot be resolved, `body.can_assign` is undefined.

- [ ] **Step 3: Implement**

`src/lib/storage/storage-access.ts`, after `canEditLabStorage`:

```ts
/**
 * Who may set which client a cubby is for (its zone): anyone who works in that
 * lab, the view rule. save_storage_zones() repeats it (migration 20261013000002).
 */
export function canAssignLabZones(p: StorageProfile | null | undefined, labId: string): boolean {
  return canViewLabStorage(p, labId)
}
```

`src/lib/storage/layout.ts`: in `StorageLayout` add `can_assign: boolean` after `can_edit: boolean`, and change the alias to:

```ts
export type LayoutWithoutAccess = Omit<StorageLayout, 'can_edit' | 'can_assign'>
```

Create `src/lib/storage/zone-changes.ts`:

```ts
/**
 * Zone assignment payloads (spec 2026-10-13-storage-zone-assignment-design §5–§8):
 * the changes Save sends, and the history events the panels show.
 */
export const MAX_ZONE_CHANGES = 5000

/** One cubby's new client; null is general space. */
export interface ZoneChange { code: string; company_id: string | null }

/** One save's worth of cubbies moved from one client to another. */
export interface ZoneEvent {
  changed_at: string
  changed_by_name: string
  from_name: string | null
  to_name: string | null
  codes: string[]
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** The PUT body's changes, one per cubby: the last wins when a code repeats. */
export function parseZoneChanges(input: unknown): { ok: true; value: ZoneChange[] } | { ok: false; error: string } {
  if (!Array.isArray(input)) return { ok: false, error: 'changes must be a list' }
  if (input.length > MAX_ZONE_CHANGES) return { ok: false, error: `At most ${MAX_ZONE_CHANGES} cubbies at a time` }
  const byCode = new Map<string, ZoneChange>()
  for (const raw of input) {
    const c = raw as { code?: unknown; company_id?: unknown } | null
    if (typeof c?.code !== 'string' || c.code.trim() === '' || c.code.length > 16) {
      return { ok: false, error: 'Each change needs a cubby code' }
    }
    if (c.company_id !== null && !(typeof c.company_id === 'string' && UUID.test(c.company_id))) {
      return { ok: false, error: `Cubby ${c.code}: unknown client` }
    }
    const code = c.code.trim().toUpperCase()
    byCode.set(code, { code, company_id: c.company_id as string | null })
  }
  return { ok: true, value: [...byCode.values()] }
}
```

`src/lib/storage/save-errors.ts`, append:

```ts
/** Turn a save_storage_zones() error into what the editor shows. */
export function zoneErrorResponse(error: { code?: string; message?: string }): NextResponse {
  if (error.code === '42501') {
    return NextResponse.json({ error: "You cannot change this laboratory's zones" }, { status: 403 })
  }
  if (error.message === 'unknown_cubby') {
    return NextResponse.json({ error: 'A cubby in these changes no longer exists. Reload and try again.' }, { status: 400 })
  }
  if (error.message === 'unknown_company') {
    return NextResponse.json({ error: 'A client in these changes no longer exists' }, { status: 400 })
  }
  if (error.code === '22023' || error.code === '22P02') {
    return NextResponse.json({ error: 'The zone changes are not valid' }, { status: 400 })
  }
  console.error('[storage zones]', error)
  return NextResponse.json({ error: 'Failed to save the zones' }, { status: 500 })
}
```

`src/app/api/laboratories/[id]/storage/route.ts`: import `canAssignLabZones` with the other access helpers; GET returns

```ts
    return NextResponse.json({ ...layout, can_edit: canEditLabStorage(profile, id), can_assign: canAssignLabZones(profile, id) })
```

and PUT returns `{ ...layout, can_edit: true, can_assign: true }`.

Create `src/app/api/laboratories/[id]/storage/zones/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { canAssignLabZones, canEditLabStorage, loadStorageProfile } from '@/lib/storage/storage-access'
import { loadStorageLayout } from '@/lib/storage/layout'
import { parseZoneChanges } from '@/lib/storage/zone-changes'
import { zoneErrorResponse } from '@/lib/storage/save-errors'

type Ctx = { params: Promise<{ id: string }> }

/** PUT /api/laboratories/[id]/storage/zones: which client each listed cubby is for. Anyone in the lab. */
export async function PUT(request: NextRequest, { params }: Ctx) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const profile = await loadStorageProfile(supabase, user.id)
  if (!canAssignLabZones(profile, id)) {
    return NextResponse.json({ error: "You cannot change this laboratory's zones" }, { status: 403 })
  }

  let body: { changes?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Body must be JSON' }, { status: 400 })
  }
  const changes = parseZoneChanges(body?.changes)
  if (!changes.ok) return NextResponse.json({ error: changes.error }, { status: 400 })

  const { error } = await (supabase as any).rpc('save_storage_zones', { p_lab: id, p_changes: changes.value })
  if (error) return zoneErrorResponse(error)

  try {
    const layout = await loadStorageLayout(supabase, id)
    return NextResponse.json({ ...layout, can_edit: canEditLabStorage(profile, id), can_assign: true })
  } catch (loadError) {
    console.error('[storage zones reload]', loadError)
    return NextResponse.json({ error: 'Saved, but the plan could not be reloaded' }, { status: 500 })
  }
}
```

Create `src/app/api/laboratories/[id]/storage/zone-history/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { canViewLabStorage, loadStorageProfile } from '@/lib/storage/storage-access'
import type { ZoneEvent } from '@/lib/storage/zone-changes'

type Ctx = { params: Promise<{ id: string }> }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** GET /api/laboratories/[id]/storage/zone-history?shelf=&limit=: zone changes, newest first. */
export async function GET(request: NextRequest, { params }: Ctx) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const profile = await loadStorageProfile(supabase, user.id)
  if (!canViewLabStorage(profile, id)) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })

  const shelf = request.nextUrl.searchParams.get('shelf')
  if (shelf !== null && !UUID.test(shelf)) return NextResponse.json({ error: 'shelf must be a shelf id' }, { status: 400 })
  const asked = Number(request.nextUrl.searchParams.get('limit') ?? 20)
  const limit = Number.isInteger(asked) ? Math.min(Math.max(asked, 1), 100) : 20

  const { data, error } = await (supabase as any).rpc('storage_zone_history_events', { p_lab: id, p_shelf: shelf, p_limit: limit })
  if (error) {
    console.error('[storage zone history]', error)
    return NextResponse.json({ error: 'Failed to load the zone history' }, { status: 500 })
  }
  const events: ZoneEvent[] = ((data ?? []) as ZoneEvent[]).map((e) => ({
    changed_at: e.changed_at,
    changed_by_name: e.changed_by_name,
    from_name: e.from_name ?? null,
    to_name: e.to_name ?? null,
    codes: e.codes ?? [],
  }))
  return NextResponse.json({ events })
}
```

- [ ] **Step 4: Run them to see them pass**

Run: `npx vitest run src/lib/storage src/app/api/laboratories src/app/api/route-exports.test.ts`
Expected: PASS (route-exports confirms the new route files export only handlers).

- [ ] **Step 5: Commit**

```bash
git add src/lib/storage/storage-access.ts src/lib/storage/storage-access.test.ts src/lib/storage/layout.ts src/lib/storage/zone-changes.ts src/lib/storage/zone-changes.test.ts src/lib/storage/save-errors.ts "src/app/api/laboratories/[id]/storage"
git commit -m "feat(storage): anyone in the lab may save zones; zones and zone-history routes"
```

---

### Task 3: Zone helpers

**Files:**
- Create: `src/components/storage/blueprint/zones.ts`
- Test: `src/components/storage/blueprint/zones.test.ts`

**Interfaces:**
- Consumes: `ZoneChange` (Task 2); `EditorDoc`, `EditorShelf` (types only; `zone_edits` is added in Task 4, so this task declares the field it reads through `Pick`, which compiles once Task 4 lands; run Task 3's tests with vitest, which does not type-check).
- Produces (`zones.ts`):
  - `type Cell = string` (`"row:column"`), `type PickMode = 'only' | 'toggle' | 'range'`, `interface CubbyPick { shelfKey: string; cells: Cell[]; anchor: Cell | null }`
  - `cell(row, column): Cell`, `cellParts(c): { row; column }`, `inGrid(shelf, c): boolean`, `shelfCells(shelf): Cell[]`
  - `shelfZones(shelf): Map<Cell, string | null>`, `zoneCounts(shelf): Map<string, number>`
  - `rectCells(a, b): Cell[]`, `nextPick(pick, shelfKey, c, mode): CubbyPick`
  - `zoneChanges(doc, layout: Pick<StorageLayout, 'shelves'>): ZoneChange[]`, `carryZoneEdits(next, prev): EditorDoc`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { EMPTY_FLOOR_PLAN } from '@/lib/storage/floor-plan'
import { carryZoneEdits, nextPick, rectCells, shelfZones, zoneChanges, zoneCounts } from './zones'
import type { EditorDoc, EditorShelf } from './editor-state'

const CO = 'co-ahold'
const OTHER = 'co-dunkin'
const shelf = (over: Partial<EditorShelf> = {}): EditorShelf => ({
  key: 's-b', id: 's-b', shelf_letter: 'B', rows: 2, columns: 3, samples_per_position: 42,
  x_cm: 0, y_cm: 0, width_cm: 120, depth_cm: 40, rot: 0, access_side: 'front',
  locked: false, group_id: null, company_id: null,
  cubbies: [{ id: 'p11', row: 1, column: 1, code: 'B-A1', capacity: 42, occupied: 0, company_id: OTHER }],
  ...over,
})
const doc = (...shelves: EditorShelf[]): EditorDoc => ({ plan: EMPTY_FLOOR_PLAN, shelves })
const savedCubbies = (letter: string) => [1, 2].flatMap((row) => [1, 2, 3].map((column) => ({
  id: `${letter}${row}${column}`, row, column, code: `${letter}-${'AB'[row - 1]}${column}`,
  capacity: 42, occupied: 0, company_id: null,
})))

describe('zones', () => {
  it('reads an edit over the saved zone, and the saved zone over general space', () => {
    const z = shelfZones(shelf({ zone_edits: { '1:2': CO, '1:1': null } }))
    expect([z.get('1:1'), z.get('1:2'), z.get('2:3')]).toEqual([null, CO, null])
    expect(zoneCounts(shelf({ zone_edits: { '1:2': CO, '2:2': CO } }))).toEqual(new Map([[OTHER, 1], [CO, 2]]))
  })

  it('picks one cubby, adds and removes with Cmd/Ctrl, and a block with Shift', () => {
    let p = nextPick(null, 's-b', '1:1', 'only')
    p = nextPick(p, 's-b', '2:3', 'range')
    expect(p.cells).toEqual(['1:1', '1:2', '1:3', '2:1', '2:2', '2:3'])
    p = nextPick(p, 's-b', '1:2', 'toggle')
    expect(p.cells).not.toContain('1:2')
    expect(nextPick(p, 's-c', '1:1', 'toggle')).toEqual({ shelfKey: 's-c', cells: ['1:1'], anchor: '1:1' })
    expect(rectCells('2:2', '1:1')).toEqual(['1:1', '1:2', '2:1', '2:2'])
  })

  it("sends only this session's edits, by the saved layout's cubby codes, after a letter change", () => {
    // Renamed B to C in the same session: the fresh layout has shelf C with C codes.
    const edited = shelf({ shelf_letter: 'C', zone_edits: { '1:1': CO, '2:3': null } })
    const fresh = { shelves: [{ ...shelf({ shelf_letter: 'C' }), cubbies: savedCubbies('C') }] }
    expect(zoneChanges(doc(edited), fresh)).toEqual([{ code: 'C-A1', company_id: CO }, { code: 'C-B3', company_id: null }])
    expect(zoneChanges(doc(shelf({ shelf_letter: 'C' })), fresh)).toEqual([])
  })

  it('leaves out edits in rows the shelf no longer has', () => {
    const shrunk = shelf({ rows: 1, zone_edits: { '2:1': CO, '1:3': CO } })
    const fresh = { shelves: [{ ...shelf(), cubbies: savedCubbies('B') }] }
    expect(zoneChanges(doc(shrunk), fresh)).toEqual([{ code: 'B-A3', company_id: CO }])
  })

  it('keeps pending edits on the saved shelves, matched by letter', () => {
    const prev = doc(shelf({ key: 'tmp-1', id: undefined, zone_edits: { '1:2': CO } }))
    expect(carryZoneEdits(doc(shelf()), prev).shelves[0].zone_edits).toEqual({ '1:2': CO })
  })
})
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run src/components/storage/blueprint/zones.test.ts`
Expected: FAIL: cannot resolve `./zones`.

- [ ] **Step 3: Implement `zones.ts`**

```ts
/**
 * Zones on the editor's shelves (spec 2026-10-13-storage-zone-assignment-design §4).
 * A cell is a cubby's place, "row:column"; its zone is this session's edit if
 * it has one, else the saved cubby's client, else general space (null).
 */
import type { StorageLayout } from '@/lib/storage/layout'
import type { ZoneChange } from '@/lib/storage/zone-changes'
import type { EditorDoc, EditorShelf } from './editor-state'

export type Cell = string
export type PickMode = 'only' | 'toggle' | 'range'
/** Cubbies picked on one shelf in the cubby display; a Shift+click block starts at `anchor`. */
export interface CubbyPick { shelfKey: string; cells: Cell[]; anchor: Cell | null }

type Grid = Pick<EditorShelf, 'rows' | 'columns'>
type Zoned = Pick<EditorShelf, 'rows' | 'columns' | 'cubbies' | 'zone_edits'>

export const cell = (row: number, column: number): Cell => `${row}:${column}`

export function cellParts(c: Cell): { row: number; column: number } {
  const [row, column] = c.split(':').map(Number)
  return { row, column }
}

export function inGrid(shelf: Grid, c: Cell): boolean {
  const { row, column } = cellParts(c)
  return Number.isInteger(row) && Number.isInteger(column)
    && row >= 1 && column >= 1 && row <= shelf.rows && column <= shelf.columns
}

/** Every cell of the shelf, row by row. */
export function shelfCells(shelf: Grid): Cell[] {
  const out: Cell[] = []
  for (let r = 1; r <= shelf.rows; r++) for (let c = 1; c <= shelf.columns; c++) out.push(cell(r, c))
  return out
}

/** Each cell's zone: this session's edit, else the saved cubby's client, else general. */
export function shelfZones(shelf: Zoned): Map<Cell, string | null> {
  const saved = new Map(shelf.cubbies.map((c) => [cell(c.row, c.column), c.company_id]))
  const edits = shelf.zone_edits ?? {}
  return new Map(shelfCells(shelf).map((c) => [c, c in edits ? edits[c] : saved.get(c) ?? null]))
}

/** How many cubbies each client holds on the shelf. */
export function zoneCounts(shelf: Zoned): Map<string, number> {
  const out = new Map<string, number>()
  for (const z of shelfZones(shelf).values()) if (z) out.set(z, (out.get(z) ?? 0) + 1)
  return out
}

/** The block of cells between two corners, row by row. */
export function rectCells(a: Cell, b: Cell): Cell[] {
  const p = cellParts(a)
  const q = cellParts(b)
  const out: Cell[] = []
  for (let r = Math.min(p.row, q.row); r <= Math.max(p.row, q.row); r++) {
    for (let c = Math.min(p.column, q.column); c <= Math.max(p.column, q.column); c++) out.push(cell(r, c))
  }
  return out
}

/** A click on a cubby: pick only it, add or remove it, or pick the block from the anchor. */
export function nextPick(pick: CubbyPick | null, shelfKey: string, c: Cell, mode: PickMode): CubbyPick {
  const same = pick?.shelfKey === shelfKey ? pick : null
  if (mode === 'toggle' && same) {
    const cells = same.cells.includes(c) ? same.cells.filter((x) => x !== c) : [...same.cells, c]
    return { shelfKey, cells, anchor: c }
  }
  if (mode === 'range' && same?.anchor) return { shelfKey, cells: rectCells(same.anchor, c), anchor: same.anchor }
  return { shelfKey, cells: [c], anchor: c }
}

/**
 * What Save sends: this session's edits, each shelf found in the fresh layout by
 * letter and each cell by row and column. Cells outside the grid or without a
 * cubby are left out; the database skips cubbies that already have that zone.
 */
export function zoneChanges(doc: EditorDoc, layout: Pick<StorageLayout, 'shelves'>): ZoneChange[] {
  const out: ZoneChange[] = []
  for (const shelf of doc.shelves) {
    const edits = Object.entries(shelf.zone_edits ?? {})
    if (edits.length === 0) continue
    const saved = layout.shelves.find((s) => s.shelf_letter === shelf.shelf_letter)
    if (!saved) continue
    for (const [c, company_id] of edits) {
      if (!inGrid(shelf, c)) continue
      const { row, column } = cellParts(c)
      const cubby = saved.cubbies.find((x) => x.row === row && x.column === column)
      if (cubby) out.push({ code: cubby.code, company_id })
    }
  }
  return out
}

/** `next` (a just-saved layout) with `prev`'s pending edits, shelf by letter: kept when the zones failed to save. */
export function carryZoneEdits(next: EditorDoc, prev: EditorDoc): EditorDoc {
  return {
    ...next,
    shelves: next.shelves.map((s) => {
      const edits = prev.shelves.find((p) => p.shelf_letter === s.shelf_letter)?.zone_edits
      return edits && Object.keys(edits).length > 0 ? { ...s, zone_edits: { ...edits } } : s
    }),
  }
}
```

- [ ] **Step 4: Run it to see it pass**

Run: `npx vitest run src/components/storage/blueprint/zones.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/storage/blueprint/zones.ts src/components/storage/blueprint/zones.test.ts
git commit -m "feat(storage): zone helpers: cells, picks, pending edits to cubby codes"
```

---

### Task 4: Editor state: pending zones, picks, layout rights

**Files:**
- Modify: `src/components/storage/blueprint/editor-state.ts` (types at :20-75, `initialEditorState` :96-98, `add` shelf literal, `fromLayout`, `insertClip` shelves, reducer)
- Modify: `src/components/storage/blueprint/use-blueprint-editor.ts`
- Test: `src/components/storage/blueprint/editor-state.test.ts`

**Interfaces:**
- Consumes: `Cell`, `CubbyPick`, `PickMode`, `inGrid`, `nextPick`, `shelfCells`, `shelfZones` (Task 3).
- Produces:
  - `EditorShelf.zone_edits?: Record<Cell, string | null>`
  - `EditorState.canLayout: boolean`, `EditorState.cubbyPick: CubbyPick | null`
  - `initialEditorState(doc, canLayout = true)`
  - actions `{ type: 'load'; doc; canLayout?: boolean }`, `{ type: 'saved'; doc; shift?: Offset; dirty?: boolean }`, `{ type: 'pickCubby'; shelfKey: string; cell: Cell; mode: PickMode }`, `{ type: 'clearPick' }`, `{ type: 'assignZone'; companyId: string | null }`
  - hook: `load(doc, canLayout = true)`, `saved(doc, shift?, dirty = false)`, `pickCubby(shelfKey, cell, mode)`, `clearPick()`, `assignZone(companyId)`

- [ ] **Step 1: Write the failing tests**

In `editor-state.test.ts` add `type EditorAction, type EditorState` to the `./editor-state` import and `import type { PickMode } from './zones'`. Append:

```ts
describe('zones in the editor', () => {
  const pick = (s: EditorState, cell: string, mode: PickMode = 'only') =>
    editorReducer(s, { type: 'pickCubby', shelfKey: 's-a', cell, mode })

  it('assigns picked cubbies as one undo step, at once', () => {
    let s = editorReducer(start(), { type: 'select', refs: [SA] })
    s = pick(pick(s, '1:1'), '1:2', 'toggle')
    s = editorReducer(s, { type: 'assignZone', companyId: 'co-1' })
    expect(s.doc.shelves[0].zone_edits).toEqual({ '1:1': 'co-1', '1:2': 'co-1' })
    expect(s.dirty).toBe(true)
    s = editorReducer(s, { type: 'undo' })
    expect(s.doc.shelves[0].zone_edits ?? {}).toEqual({})
  })

  it('assigns every cubby of the selected shelves when none are picked, ignoring rooms', () => {
    let s = editorReducer(start(), { type: 'select', refs: [R1, SA, SB] })
    s = editorReducer(s, { type: 'assignZone', companyId: 'co-1' })
    expect(s.doc.shelves.map((x) => x.zone_edits)).toEqual([{ '1:1': 'co-1', '1:2': 'co-1' }, { '1:1': 'co-1', '1:2': 'co-1' }])
    expect(s.doc.plan.rooms).toEqual(grouped.plan.rooms)
    expect(editorReducer(s, { type: 'assignZone', companyId: 'co-1' })).toBe(s)
  })

  it('drops the pick when the selection changes', () => {
    let s = pick(editorReducer(start(), { type: 'select', refs: [SA] }), '1:1')
    expect(s.cubbyPick?.cells).toEqual(['1:1'])
    s = editorReducer(s, { type: 'select', refs: [SB] })
    expect(s.cubbyPick).toBeNull()
  })

  it('without layout rights refuses every layout change, but assigns zones and undoes', () => {
    let s = editorReducer(start(), { type: 'load', doc: grouped, canLayout: false })
    s = editorReducer(s, { type: 'select', refs: [SA] })
    const refused: EditorAction[] = [
      { type: 'nudge', dx: 10, dy: 0 }, { type: 'rotate', turn: 1 }, { type: 'delete' }, { type: 'lock', locked: true },
      { type: 'patch', ref: SA, patch: { shelf_letter: 'Z' }, record: true }, { type: 'checkpoint' },
      { type: 'add', shape: 'shelf', rect: { x: 0, y: 0, w: 100, d: 40 }, id: 'n1' }, { type: 'duplicate', seed: 'd' },
    ]
    for (const a of refused) expect(editorReducer(s, a)).toBe(s)
    s = editorReducer(s, { type: 'assignZone', companyId: 'co-1' })
    expect(s.doc.shelves[0].zone_edits).toEqual({ '1:1': 'co-1', '1:2': 'co-1' })
    expect(editorReducer(s, { type: 'undo' }).doc.shelves[0].zone_edits ?? {}).toEqual({})
  })

  it('stays dirty after a save that left zones unsaved, and keeps layout rights through saves', () => {
    let s = editorReducer(start(), { type: 'load', doc: grouped, canLayout: false })
    s = editorReducer(s, { type: 'saved', doc: grouped, dirty: true })
    expect([s.dirty, s.canLayout]).toEqual([true, false])
  })
})
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/components/storage/blueprint/editor-state.test.ts`
Expected: FAIL: `zone_edits` undefined after assignZone (unknown action falls through), `cubbyPick` undefined, layout actions not refused.

- [ ] **Step 3: Implement**

In `editor-state.ts`:

1. Import from Task 3:

```ts
import { inGrid, nextPick, shelfCells, shelfZones, type Cell, type CubbyPick, type PickMode } from './zones'
```

2. Replace the `EditorShelf` line with:

```ts
export interface EditorShelf extends ShelfInput {
  key: string
  company_id: string | null
  cubbies: Cubby[]
  /** Zones assigned since the plan was loaded or saved, by "row:column"; Save sends only these. */
  zone_edits?: Record<Cell, string | null>
}
```

3. In `EditorState` add after `shift`:

```ts
  /** False for lab staff without layout rights: every action that changes a shape is refused. */
  canLayout: boolean
  /** Cubbies picked in the cubby display; it goes when the selection changes. */
  cubbyPick: CubbyPick | null
```

4. In `EditorAction` replace the `load` and `saved` members and add three:

```ts
  | { type: 'load'; doc: EditorDoc; canLayout?: boolean }
  | { type: 'saved'; doc: EditorDoc; shift?: Offset; dirty?: boolean }
  | { type: 'pickCubby'; shelfKey: string; cell: Cell; mode: PickMode }
  | { type: 'clearPick' }
  | { type: 'assignZone'; companyId: string | null }
```

5. `initialEditorState`:

```ts
export function initialEditorState(doc: EditorDoc, canLayout = true): EditorState {
  return {
    doc, past: [], future: [], selection: [], tool: 'select', dirty: false, notice: null, shift: { dx: 0, dy: 0 },
    canLayout, cubbyPick: null,
  }
}
```

6. `fromLayout` shelves: `({ ...s, key: s.id, locked: s.locked === true, group_id: s.group_id ?? null, zone_edits: {} })`. In the `add` case's shelf literal add `zone_edits: {}` after `cubbies: []`. In `insertClip`'s shelves literal add `zone_edits: {}` after `cubbies: []`.

7. Rename the current `export function editorReducer(s: EditorState, a: EditorAction): EditorState` to `function reduce(s: EditorState, a: EditorAction): EditorState`. Inside it, change `load` and `saved`:

```ts
    case 'load':
      return initialEditorState(a.doc, a.canLayout ?? true)
    case 'saved': {
      const shift = { dx: s.shift.dx + (a.shift?.dx ?? 0), dy: s.shift.dy + (a.shift?.dy ?? 0) }
      return {
        ...initialEditorState(a.doc, s.canLayout), selection: keepSelection(a.doc, s.selection), shift, dirty: a.dirty ?? false,
      }
    }
```

and add before the `undo` case:

```ts
    case 'pickCubby':
      return { ...s, cubbyPick: nextPick(s.cubbyPick, a.shelfKey, a.cell, a.mode) }
    case 'clearPick':
      return s.cubbyPick ? { ...s, cubbyPick: null } : s
    case 'assignZone': {
      // Picked cubbies, else every cubby of each selected shelf; rooms and furniture have none.
      const targets = new Map<string, Cell[]>()
      if (s.cubbyPick && s.cubbyPick.cells.length > 0) targets.set(s.cubbyPick.shelfKey, s.cubbyPick.cells)
      else for (const r of s.selection) {
        const shelf = r.kind === 'shelf' ? s.doc.shelves.find((x) => x.key === r.key) : undefined
        if (shelf) targets.set(shelf.key, shelfCells(shelf))
      }
      let changed = false
      const shelves = s.doc.shelves.map((shelf) => {
        const cells = (targets.get(shelf.key) ?? []).filter((c) => inGrid(shelf, c))
        const now = shelfZones(shelf)
        if (cells.every((c) => now.get(c) === a.companyId)) return shelf
        changed = true
        const zone_edits = { ...(shelf.zone_edits ?? {}) }
        for (const c of cells) zone_edits[c] = a.companyId
        return { ...shelf, zone_edits }
      })
      return changed ? recorded(s, { ...s.doc, shelves }) : s
    }
```

8. After `reduce`, add the exported wrapper:

```ts
/** What only someone with layout rights may do: everything that adds, moves, changes or removes a shape. */
const LAYOUT_ACTIONS: ReadonlySet<EditorAction['type']> = new Set<EditorAction['type']>([
  'checkpoint', 'add', 'patch', 'patchMany', 'rotate', 'nudge', 'lock', 'delete', 'group', 'ungroup',
  'renameGroup', 'align', 'distribute', 'duplicate', 'paste',
])

export function editorReducer(s: EditorState, a: EditorAction): EditorState {
  if (!s.canLayout && LAYOUT_ACTIONS.has(a.type)) return s
  const next = reduce(s, a)
  // A pick belongs to the shelf selected when it was made.
  return next.cubbyPick && next.selection !== s.selection ? { ...next, cubbyPick: null } : next
}
```

9. Update the module doc comment's last sentence to also say: "Lab staff without layout rights (`canLayout` false) may only select, assign zones and undo."

In `use-blueprint-editor.ts`: import `type Cell, type PickMode` from `./zones`, and replace `load`/`saved` and add three actions:

```ts
    load: (doc: EditorDoc, canLayout = true) => dispatch({ type: 'load', doc, canLayout }),
    saved: (doc: EditorDoc, shift?: Offset, dirty = false) => dispatch({ type: 'saved', doc, shift, dirty }),
    pickCubby: (shelfKey: string, cell: Cell, mode: PickMode) => dispatch({ type: 'pickCubby', shelfKey, cell, mode }),
    clearPick: () => dispatch({ type: 'clearPick' }),
    assignZone: (companyId: string | null) => dispatch({ type: 'assignZone', companyId }),
```

- [ ] **Step 4: Run them to see them pass, then the storage suite and the type check**

Run: `npx vitest run src/components/storage src/lib/storage && npx tsc --noEmit -p .`
Expected: PASS; tsc exits 0.

- [ ] **Step 5: Commit**

```bash
git add src/components/storage/blueprint/editor-state.ts src/components/storage/blueprint/editor-state.test.ts src/components/storage/blueprint/use-blueprint-editor.ts
git commit -m "feat(storage): editor keeps pending zones, cubby picks and layout rights"
```

---

### Task 5: Canvas, shelf tint, menu and keyboard

**Files:**
- Modify: `src/components/storage/blueprint/blueprint-canvas.tsx` (props :32-50, `onShapeDown` :196-216, `onShapeDouble` :218-220, shelf render :367-372, handles :399)
- Modify: `src/components/storage/blueprint/shapes.tsx` (`ShelfShape`)
- Modify: `src/components/storage/blueprint/canvas-context-menu.tsx` (`menuState`)
- Modify: `src/components/storage/blueprint/use-editor-keyboard.ts`
- Test: `blueprint-canvas.test.tsx`, `canvas-context-menu.test.tsx`, `use-editor-keyboard.test.tsx` (same folder)

**Interfaces:**
- Consumes: `zoneCounts` (Task 3), `EditorShelf.zone_edits` (Task 4).
- Produces:
  - `BlueprintCanvasProps.canLayout?: boolean` (default true), `BlueprintCanvasProps.onOpenShelf?: (shelfKey: string) => void`
  - `ShelfShape` prop `onClick?: () => void`
  - `menuState(doc, selection, target, mode, canPaste, canLayout = true)`
  - the keyboard ignores keys from inside `[data-cubby-display]`

- [ ] **Step 1: Write the failing tests**

`blueprint-canvas.test.tsx` (the fixture's shelf `s-a` is letter A; `I1`/`I2` are grouped items), append inside `describe('BlueprintCanvas')`:

```tsx
  it('toggles a shape on Cmd+click as on Shift+click', () => {
    const p = renderCanvas()
    fireEvent.pointerDown(screen.getByTestId('item-i2'), { button: 0, pointerId: 1, metaKey: true })
    expect(p.onToggle).toHaveBeenCalledWith(I2)
  })

  it("opens a shelf's cubbies on a click when viewing and on a double-click when editing", () => {
    const onOpenShelf = vi.fn()
    const { unmount } = render(<BlueprintCanvas {...renderProps({ mode: 'view', onOpenShelf })} />)
    fireEvent.click(screen.getByTestId('shelf-A'))
    expect(onOpenShelf).toHaveBeenLastCalledWith('s-a')
    unmount()
    const p = renderCanvas({ onOpenShelf })
    fireEvent.doubleClick(screen.getByTestId('shelf-A'))
    expect(p.onSelect).toHaveBeenLastCalledWith([{ kind: 'shelf', key: 's-a' }], true)
    expect(onOpenShelf).toHaveBeenCalledTimes(2)
  })

  it('without layout rights selects a shape but pans instead of moving it, and shows no handles', () => {
    const p = renderCanvas({ canLayout: false, selection: [I1] })
    expect(screen.queryByTestId('handle-nw')).toBeNull()
    fireEvent.pointerDown(screen.getByTestId('item-i1'), { button: 0, pointerId: 1, clientX: 10, clientY: 10 })
    fireEvent.pointerMove(screen.getByRole('application'), { pointerId: 1, clientX: 80, clientY: 10 })
    expect(p.onCheckpoint).not.toHaveBeenCalled()
    expect(p.onPatchMany).not.toHaveBeenCalled()
  })

  it('tints a shelf by the zones assigned in this session', () => {
    const zoned = { ...doc, shelves: [{ ...doc.shelves[0], zone_edits: { '1:1': 'co-1' } }] }
    renderCanvas({ doc: zoned, zones: zoneStyles(['co-1']) })
    expect(screen.getByTestId('shelf-A').querySelector('rect[fill="#556b2f"]')).not.toBeNull()
  })
```

and refactor the file's `renderCanvas` so the props can be built without rendering (add `import { zoneStyles } from './zone-colors'`):

```tsx
function renderProps(over: Partial<BlueprintCanvasProps> = {}): BlueprintCanvasProps {
  return {
    doc, mode: 'edit', tool: 'select', selection: [], zones: new Map(), fitToken: 0,
    onSelect: vi.fn(), onToggle: vi.fn(), onCheckpoint: vi.fn(), onPatchMany: vi.fn(), onAdd: vi.fn(),
    onContextTarget: vi.fn(),
    ...over,
  }
}

function renderCanvas(over: Partial<BlueprintCanvasProps> = {}) {
  const props = renderProps(over)
  render(<BlueprintCanvas {...props} />)
  return props
}
```

`canvas-context-menu.test.tsx`, append inside `describe('menuState')`:

```ts
  it('offers only View cubbies, Select all and Fit to someone without layout rights', () => {
    expect([...menuState(doc, [SA], on(SA), 'edit', true, false).show]).toEqual(['viewCubbies', 'selectAll', 'fit'])
    expect([...menuState(doc, [I1], on(I1), 'edit', true, false).show]).toEqual(['selectAll', 'fit'])
    expect([...menuState(doc, [], { kind: 'floor', at }, 'edit', true, false).show]).toEqual(['selectAll', 'fit'])
  })
```

`use-editor-keyboard.test.tsx`, append inside its `describe`:

```tsx
  it('leaves keys pressed inside the cubby display alone', () => {
    const a = setup()
    render(<div data-cubby-display=""><button type="button">B-A1</button></div>)
    const cubby = screen.getByRole('button', { name: 'B-A1' })
    fireEvent.keyDown(cubby, { key: 'Delete' })
    fireEvent.keyDown(cubby, { key: 'r' })
    expect(a.remove).not.toHaveBeenCalled()
    expect(a.rotate).not.toHaveBeenCalled()
  })
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/components/storage/blueprint/blueprint-canvas.test.tsx src/components/storage/blueprint/canvas-context-menu.test.tsx src/components/storage/blueprint/use-editor-keyboard.test.tsx`
Expected: FAIL: Cmd+click selects instead of toggling; no `onOpenShelf` calls; handles render and the drag checkpoints; no zone stripe; the menu offers layout entries; Delete in the display calls `remove`.

- [ ] **Step 3: Implement**

`blueprint-canvas.tsx`:

1. Props, after `shift?: Offset`:

```ts
  /** False: the user may assign zones but not change the layout; shapes select and pan, nothing moves. */
  canLayout?: boolean
  /** Open a shelf's cubby display: a click when viewing, a double-click when editing. */
  onOpenShelf?: (shelfKey: string) => void
```

and destructure `canLayout = true, onOpenShelf,` in the component's parameter list.

2. In `onShapeDown`, replace the Shift block and the move guard:

```ts
    if (e.shiftKey || e.metaKey || e.ctrlKey) {
      // A box may start inside a room on Shift; a click on the room toggles it on release.
      if (ref.kind === 'room' && e.shiftKey) startBox(e, ref)
      else onToggle(ref)
      return
    }
```

```ts
    if (!canLayout || !anchor || members.some((s) => s.locked)) { pan(e); return }
```

3. `onShapeDouble`:

```ts
  const onShapeDouble = (ref: ShapeRef) => () => {
    if (mode !== 'edit' || tool !== 'select') return
    onSelect([ref], true)
    if (ref.kind === 'shelf') onOpenShelf?.(ref.key)
  }
```

4. Shelf render: add `onClick={mode === 'view' ? () => onOpenShelf?.(s.key) : undefined}` to `<ShelfShape …>`.

5. Handles: `{single && mode === 'edit' && canLayout && !single.locked && HANDLES.map((h) => {`.

`shapes.tsx` `ShelfShape`: add `onClick?: () => void` to its props and `onClick={onClick}` on the `<g>`; import `zoneCounts` from `./zones` and replace the counts loop:

```tsx
  const counts = zoneCounts(shelf)
```

(`total` stays `shelf.rows * shelf.columns`; the stripes loop over `[...counts]` is unchanged.) Update its doc comment: "zone tint by share of cubbies, this session's assignments included".

`canvas-context-menu.tsx` `menuState`: add the parameter `canLayout = true` and, right after the `mode === 'view'` block:

```ts
  if (!canLayout) {
    if (target.kind === 'shape' && target.ref.kind === 'shelf') show.add('viewCubbies')
    show.add('selectAll')
    show.add('fit')
    return st
  }
```

`use-editor-keyboard.ts`: replace the menu check with

```ts
      if (e.target instanceof Element && e.target.closest('[role="menu"], [data-cubby-display]')) return
```

and extend the doc comment: "…inside an open menu or the cubby display…".

- [ ] **Step 4: Run them to see them pass, then the storage suite and the type check**

Run: `npx vitest run src/components/storage src/lib/storage && npx tsc --noEmit -p .`
Expected: PASS; tsc exits 0.

- [ ] **Step 5: Commit**

```bash
git add src/components/storage/blueprint/blueprint-canvas.tsx src/components/storage/blueprint/blueprint-canvas.test.tsx src/components/storage/blueprint/shapes.tsx src/components/storage/blueprint/canvas-context-menu.tsx src/components/storage/blueprint/canvas-context-menu.test.tsx src/components/storage/blueprint/use-editor-keyboard.ts src/components/storage/blueprint/use-editor-keyboard.test.tsx
git commit -m "feat(storage): Cmd/Ctrl+click picks shelves; open cubbies; read-only canvas and menu without layout rights"
```

Part A ends here. Continue with `2026-10-13-storage-zone-assignment-part-b.md`.
