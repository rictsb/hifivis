# Independent visual review — warm room and two 2700 K W13 spotlights

Scope: visual review of root's lighting implementation, not implementation authorship. Compare actual lit/off/full screenshots, study arrangement, neutral detail and portrait mobile. Preserve the previously approved speaker exterior and Nagra finishes.

## First rendered candidate — revise

Candidate SHA-256 `6337678aae498b63c96dfe89d7d4d8ffd2f3620757adda5231955acdd26a2f69`, matching `tests/lighting-v4-result.json`.

Actually inspected `v4-room-warm`, `v4-room-spots-off`, `v4-room-spots-full`, `v4-study-warm`, `v4-neutral-detail`, and `v4-mobile`.

| ID | Severity | Observation | Required correction |
| --- | --- | --- | --- |
| L4-01 | High | Mobile portrait room crop excludes both W13 speakers and both monoblocks. The new lighting dimmer is on screen, but neither target can be seen. | Recompute/preserve a fitting room camera when resizing to portrait. Include both speakers and central equipment cabinet in the visible 3D area, with reasonable margin. |
| L4-02 | Medium | On/off comparison shows only a slight warm tint on speaker fronts at full/70%; insufficient localized falloff for the requested two spotlight accents. | Raise spotlight-to-ambient contrast without increasing exposure or globally orange-tinting materials. Suggested base intensity 60–75 versus current 25, retaining soft edge and initial 70% setting, then judge actual output. Warm upper/front edges and soft localized floor spill should be immediately apparent. |

Accepted in this candidate: pale wood grain remains legible; Nagra silver remains silver; no fabricated haze cones; lighting control type and value are clear; neutral product detail remains faithful. Physical color/photometry validation is outside this visual-review scope. Display CCT is understood to be a rendering approximation, not calibrated room photometry.

The user's IMG_9192/9195 photographs support a warm top/front highlight with pale side grain and comparatively neutral silver equipment. Preserve that contrast rather than applying uniform orange grading.

Final decision awaits revised on/off, study and portrait captures.

Final re-review completed: both defects are closed and the corrected artifact is approved. See `visual-lighting-review.md` for the six-image inspection record and final SHA-256 `29733ee1e5d8a542cb166523dc78b879c0b2d8446589125cc83d4ac5c820a7ad`.
