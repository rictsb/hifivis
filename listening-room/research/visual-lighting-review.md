# Independent visual review — 2700 K speaker lighting

Reviewer role: independent visual critic; no implementation authorship. This review concerns the warmer room illumination, paired W13 spotlights, dimmer, and resulting desktop/mobile presentation. Prior exact-speaker modeling decisions remain covered by `visual-v2-review.md` and `visual-v3-review.md`.

## Final decision: approve

Final artifact: `The Listening Room.html`, 3,875,158 bytes, SHA-256 `29733ee1e5d8a542cb166523dc78b879c0b2d8446589125cc83d4ac5c820a7ad`.

The reviewer independently read the delivered file's SHA-256 with `shasum` and matched it to `tests/lighting-v4-result.json`. Actually inspected all six final rendered captures: `v4-room-warm.png`, `v4-room-spots-off.png`, `v4-room-spots-full.png`, `v4-study-warm.png`, `v4-neutral-detail.png`, and `v4-mobile.png`. Approval is based on these rendered images, not source descriptions or proposed lighting parameters.

| Defect | Initial rejection | Final disposition |
| --- | --- | --- |
| L4-01 — portrait crop | Both W13s and monoblocks fell outside the narrow room crop, so the dimmer's targets could not be seen. | Closed. Both complete speakers, both monoblocks and the central equipment cabinet now fit with margin. The subsequent long-camera fog washout is also corrected: the dark cabinet, speaker baffles and room boundaries retain visible contrast. |
| L4-02 — insufficient spotlight effect | At the first candidate's base intensity of 25, on/off differences were too weak to read as a deliberate pair of accents. | Closed. The final base intensity of 65 yields clear warm front/top accents and soft localized floor spill on both speakers at the default 70%, with a stronger but controlled 100% setting. |

The final on/off comparison shows warm highlights concentrated on the W13s while the wider room light remains consistent. Pale shell grain remains legible, the reddish wooden midcones and dark side diaphragms keep their material identity, and Nagra aluminum remains neutral enough to read as silver. Soft floor pools and shadows give the speakers weight without fabricated visible beams or haze. The Complete study configuration receives the same coherent paired treatment. The neutral W13 detail retains its previously reviewed material balance and geometry.

Portrait includes the full stereo installation; individual product detail is necessarily small in this overview but remains available through the existing detail views. The dimmer, value, temperature label, tabs and playback controls remain readable without horizontal overflow in the inspected capture.

The reviewed test report records all 15 checks passing, including two independently aimed spotlights, dimmer operation with fixed ambient, study re-aiming, portrait fit, offline image loading, and no JavaScript errors or network assets. Those programmatic checks were run by the root implementation task; this critic independently inspected their report and the rendered output. The report records approximately 60 fps for its two-second measurement window; this is a measured sample, not a universal performance guarantee.

No unresolved substantive visual defects remain within this lighting revision. This approval does not assert calibrated display color, measured room illuminance, factory CAD fidelity, a blind image comparison, or superiority to product photography. The 2700 K appearance and photometry remain an illustrative rendering; technical color validation belongs to the physics review.

Initial candidate and rejection detail: `visual-v4-lighting-review.md`.
