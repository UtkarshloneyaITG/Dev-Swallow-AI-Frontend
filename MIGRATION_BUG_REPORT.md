# Migration Bug Report — Swallow AI Backend

## Environment
- **Database:** MongoDB Atlas — `swallow_ai` / `migration_rows`
- **Source data:** Shopify-format CSV (Google Sheet)
- **Job:** "test 001" — 158 products, 167 migration_row documents

---

## Summary of Findings

After cross-referencing the source Google Sheet against the `migration_rows` collection:

| Metric | Google Sheet | MongoDB | Status |
|---|---|---|---|
| Unique products (handles) | 163 | 157 | ❌ 6 missing |
| Total variant rows | 529 | 555 | ⚠️ DB has 26 extra |
| Products with exact variant match | — | 142 / 157 | ✅ |
| Products with variant count mismatch | — | 15 / 157 | ⚠️ |
| Rows with `status: failed` | — | 44 | ❌ |
| Rows with `status: extracted` (stuck) | — | 9 | ❌ |

---

## Bug 1 — 2 Real Products Never Migrated (Missing from DB)

**Handles not found anywhere in `migration_rows`:**
- `greta-slingback-td-khaki-gold` — 8 variant rows in sheet
- `mini-accordion-bagtassel-sonic-gold-tutankamun` — 5 variant rows in sheet
  *(Note: DB has `mini-accordion-bag-tassel-sonic-gold-tutankamun` — possible handle normalization mismatch during CSV parsing)*

**Likely cause:** The CSV grouping step (reading rows by `Handle`) is either:
- Silently skipping products when a handle contains unusual characters or specific patterns
- Normalizing the handle slug differently than the source (removing/adding hyphens), causing the row to be stored under a different key and never matched

**Fix:** Log every handle processed during CSV ingestion. Compare the set of handles in `raw_records` against the set in the source CSV after parsing. Any handle in the source not present in `raw_records` means the grouping step dropped it.

---

## Bug 2 — AI Generating Extra Variants (Hallucination)

**Total variant rows:** Sheet has **529**, DB has **555** — the AI is producing **26 more variant rows** than exist in the source.

**Affected products (DB has more variants than source):**
- `queen-sofia-sandal-black`: sheet=2 variants, db=3 variants (+1)
- `queen-clio-sandal-rust-turquoise`: sheet=1, db=2 (+1)
- `ponza-geo-bloc-jute-orange`: sheet=0 explicit variants, db=1 (+1)
- `ponza-geo-bloc-jute-white`: sheet=1, db=2 (+1)
- `queen-bauhaus-point-suede-spicecement`: sheet=1, db=2 (+1)
- `kipling-accordion-bag-suede-spice-ochre`: sheet=1, db=2 (+1)
- `kipling-basket-large-jute-milk`: sheet=1, db=2 (+1)
- `kipling-basket-large-jute-ochre`: sheet=1, db=2 (+1)
- `kipling-bunny-bag-td-brown-yellow-ochre`: sheet=1, db=2 (+1)

**Likely cause:** When a product has only 1 variant row in the source (no size/color options), the AI prompt is generating multiple variants by inferring typical sizes (e.g. EU 36–42) instead of strictly outputting only what is present in the source data. The AI is being too creative with `variants[]` generation.

**Fix:** The AI prompt for variant extraction must include a hard constraint:
> *"Only output variants that are explicitly listed in the source data. Do NOT infer, generate, or expand variants beyond what is present. If the source has 1 variant row, output exactly 1 variant."*

---

## Bug 3 — 44 Rows Stuck in `failed` Status

**Root cause identified from `validation_errors`:**
```json
{
  "field": "title",
  "loc": "seo.title",
  "severity": "error",
  "msg": "SEO title max 70 chars",
  "got": "Meher Kakalia Bizi Ballet Champa White/Pamir White | Handmade Flat Shoes"
}
```

The brand name "Meher Kakalia" + product name + descriptor routinely exceeds 70 characters in the SEO title. The AI is constructing `seo.title` by concatenating `vendor + title + tagline`, which always overshoots the limit for this brand.

**Fix:** Add a post-processing truncation step in the AI pipeline:
```python
if len(product.seo.title) > 70:
    product.seo.title = product.seo.title[:67] + "..."
```
Or adjust the AI prompt to instruct: *"SEO title must be 70 characters or fewer. Prioritise the product name. Omit the vendor name if needed to stay within the limit."*

---

## Bug 4 — 9 Rows Stuck in `extracted` Status

These rows were extracted from the source CSV and stored in `migration_rows` but were never picked up for AI processing. They remain in `extracted` status indefinitely.

**Likely cause:**
- A worker/queue crash mid-job left these rows unprocessed
- The job marked itself as `completed` before all `extracted` rows were processed
- No retry mechanism exists for `extracted` → should have transitioned to `processing` → `correct`/`failed`

**Fix:**
1. On job completion, check if any rows remain in `extracted` status — if yes, do not mark the job as `completed`
2. Add a cleanup task: any row in `extracted` status for more than X minutes should be re-queued for processing
3. The job's `total_rows=158` but only `correct_rows=114 + failed_rows=44 = 158` — the 9 `extracted` rows are not being counted, meaning the job counters are wrong

---

## Bug 5 — Source Data Quality Issue (5 Corrupted Handles)

Five rows in the source Google Sheet have the **HTML body text** accidentally placed in the `Handle` column instead of the actual product handle. These rows will never migrate correctly regardless of backend fixes.

**Examples:**
- `<p>Pair them with flowing dresses or tailored looks—Queen Sofia Sandals bring regal elegance...`
- `<p>A sustainable and handcrafted choice (`
- `<p>The platform wedge provides a comfortable lift...`

**Fix:** Add input validation during CSV parsing — reject or flag any handle that starts with `<` or contains HTML tags. Surface these as parse warnings to the user before the migration job starts.

---

## Priority Order

| Priority | Bug | Impact |
|---|---|---|
| 🔴 High | Bug 3 — SEO title truncation | 44 failed rows (28% of all rows) |
| 🔴 High | Bug 4 — `extracted` rows never processed | 9 rows stuck forever |
| 🟠 Medium | Bug 2 — AI hallucinating extra variants | Data integrity, wrong product listings in Shopify |
| 🟠 Medium | Bug 1 — 2 products never migrated | Missing products |
| 🟡 Low | Bug 5 — Source data HTML handle validation | User-facing parse warning |
