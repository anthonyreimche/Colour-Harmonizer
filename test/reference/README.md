# Reference vectors

`darktable_ref.c` is darktable's own C — the UCS conversions, the RYB ↔ UCS
lookups, node placement, the weighted pull, the fused `process()` pixel and the
rule inference from `src/iop/colorharmonizer.c` (darktable 5.6), plus the
helpers they call — kept in single precision as darktable runs it. `build.cjs`
compiles it with gcc and writes `vectors.json`; the tests read the JSON, so a
machine without gcc still runs the suite. Regenerate with
`npm run test:reference` after touching the C.

The one deliberate departure from darktable: RGB reaches XYZ D65 through the
sRGB D65 matrix (SafeLight's working space) instead of the work-profile →
XYZ D50 → CAT16 → D65 hop.
