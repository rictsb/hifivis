# Independent visual review — W13 and photographed room, iteration 2

Reviewer: speaker-evidence specialist acting as visual critic, not scene implementation author. 7 September 2026.

## Inspected evidence

Actual rendered files inspected: `screenshots/v2-room.png`, `v2-speaker.png`, `v2-front.png`, `v2-side.png`, `v2-rear.png`, `v2-base.png`, all at 1600 × 1000. Compared visually against the user's decoded IMG_9192–IMG_9196 PNG photographs and the previously inspected Boenicke brochure pp35–37. This was an identified reference comparison, not a blind comparison. No claim of superiority to the photographs.

## Decision: REJECT

The new room layout, explicit front/side/rear/base camera presets and expanded rear hardware are useful progress. The delivered render does not yet meet the user's requirement for a faithful W13. The most recognizable part—the wood midcone—is absent from the image. Materials remain closer to a CAD preview than a photographed object. The priority SwingBase view is clipped and appears to float over the studio floor.

Root had independently identified issues V2-01 through V2-04 and was already fixing them before receiving this report. They remain listed until the changed render is inspected.

| ID | Severity | Observed defect | Required correction / acceptance |
| --- | --- | --- | --- |
| V2-01 | Blocking | Cabinet face/backing geometry occludes the lower driver: cream solid disc replaces reddish wooden diaphragm and center phase plug in all front views. Upper driver also shows unnatural cream fill. | Correct the aperture/mesh-depth ordering. Lower cone, concavity, surround and stationary lighter phase plug must all be clearly visible in the default full speaker and straight front shots. No coplanar flicker or cabinet surface inside driver aperture. |
| V2-02 | Blocking | Upper lobe intersects lower aperture as a black crescent. The two-lobe shape is assembled as overlapping opaque circles instead of a united pierced baffle. | Union the two lobe profiles before cutting apertures, or trim overlaps properly. Preserve the actual narrow notches at the figure-eight waist without an arc crossing the wood cone. |
| V2-03 | High | Wood is nearly grain-free cream with a few broad blurred vertical bands. User photographs show fine longitudinal grain and a substantial, restrained cathedral figure on the side. | Increase real grain detail and control UV scale. Front grain vertical; broad side has natural variation; rounded edges retain continuity. Avoid zebra stripes or changing the pale finish to dark/orange wood. |
| V2-04 | High | Front, side, rear and full-speaker images hide the cabinet bottom behind the bottom control strips. Base view loses the left floor disc under UI/caption. | Frame against the actual usable viewport. Full-object presets include complete cabinet, both towers and floor contacts with clear margins. Base close-up must show both floor discs, complete beam and tongue insertion at once. |
| V2-05 | High | Side bass diaphragm is almost flat black. Rectangular-looking marks appear at 12 and 6 o'clock, unlike the actual continuous glossy dish with small circular center detail. | Remove accidental internal/backing/lighting artifacts. Model the shallow diaphragm curvature and central circular feature; supply a broad window/softbox reflection. Preserve the wide dark rubber roll and fine pale trim circumference. |
| V2-06 | Medium | Upper wood throat ring is bleached nearly to the shell's cream value, whereas IMG_9195 shows a distinct warm honey ring separating black baffle and black driver surround. | Give this ring a warmer fine-grained wood material and correct physical thickness/recess. Keep the central diaphragm silver and black-edged, not an all-white bullseye. |
| V2-07 | High | Rear terminal plate and SwingBase render dark charcoal. User's tower/beam are light textured silver, and terminal plate is brushed silver. | Improve large-source fill/environment lighting and keep appropriate silver albedo/roughness. Do not turn powder-coated towers into mirror chrome. Show a soft value gradient, top adjustment hole and thinner disc edge. |
| V2-08 | High | Crossbeam visually fuses rigidly into the cylindrical tower shells. Without a visible inspection affordance, this appears to be a solid pair of feet rather than suspension. | Provide a clearly labeled schematic suspension inspection mode or translucent shell that distinguishes fixed tower from hanging carrier and steel suspension line. Exterior still matches the photo; avoid asserting exact hidden attachment construction. |
| V2-09 | High | Both visible tower discs appear to float over the studio floor, inconsistent with the intended load path. Source inspection confirms detail floor top is -0.035 m while the speaker's ground coordinate is 0 and its former plinth is hidden. | Put the studio floor surface at the model's physical floor coordinate for this object, or compensate the model transform. Floor discs touch the floor; cabinet/beam alone have their intended clearance. Place contact shadows at the same floor surface. |
| V2-10 | High | Room lighting is washed out and produces hard, overlapping geometric shadows; metallic Nagra top panels read almost black/green-grey. User setup has warm satin silver, soft daylight, localized highlights and sufficient contrast to read fine forms. | Use coherent broad window illumination/reflection sources, softer shadows and balanced exposure. Keep Nagra silver visibly distinct from green storage cabinet. Retain enough side shading to express the deep speaker enclosure. |
| V2-11 | Medium | Oversized title occupies the top-left quarter of the room view and competes with the speakers; huge uninterrupted backdrop pushes equipment toward the bottom. | Reduce/default-hide introductory title after entry or constrain it to a compact panel; reframe system prominently while preserving room context. User arrived to inspect objects, so equipment should dominate the default rendered composition. |

## Further fidelity observations

- Overall speaker H:W:D proportions and side driver position are plausible; do not widen the front to make the baffle easier to construct.
- Rear plate has the user's vertical fins and distinct binding-post region, a significant improvement. Keep its controls legible via camera/reflection rather than enlarging them unrealistically.
- SwingBase approximate beam/tower proportion and rear-inserted central tongue are much closer to the user photo than the earlier crossbar. Preserve that architecture while fixing floor contact and making suspension inspectable.
- Room cabinet structure, separate green central fronts, paired Nagra power supplies and tower monoblocks now align recognizably with IMG_9192/9196. Materials need the most work after geometry bugs are removed.

## Required next review

Inspect newly rendered front, three-quarter, side, rear, SwingBase exterior, suspension inspection, and room screenshots. Approval must refer to those actual integrated renders, with every substantive issue above closed or explicitly rejected as inapplicable based on evidence. This report is not approval of a plan or of source code alone.

## Re-review at 09:21 EDT — hash 132efef7a93c2ab7ed8992c37e9704f7b291a114fcc323e7abae8323be7ce654

Independently inspected all seven newly rendered room, full speaker, front, side, rear, SwingBase exterior and suspension-mode screenshots. Hash was checked against both the actual HTML and `tests/render-v2-result.json`.

**Decision: further revision required on two visible material defects.**

- V2-01: geometry/occlusion closed. Lower diaphragm and center are now present, but the wood material has a remaining fidelity issue below.
- V2-02: closed; no crescent occludes lower aperture, recognizable clipped figure-eight baffle.
- V2-03: closed for cabinet; actual-photo grain maps establish fine longitudinal/cathedral structure without changing the pale finish.
- V2-04: closed; object and both base discs fit inside the usable area. Some intentional crop of cabinet top in the base close-up is appropriate.
- V2-05: closed; continuous glossy dished bass surface, rolled surround and pale trim. No rectangular artifacts remain.
- V2-06: closed; warm honey throat ring is distinct from pale cabinet.
- V2-07: closed; base/terminal metals now read silver, with restrained roughness and tonal gradients.
- V2-08: closed; explicit toggle reveals a clearly labeled symbolic steel-rope load path, keeping exterior and unknown hidden construction distinct.
- V2-09: closed; visible floor contacts no longer hover 35 mm above floor; tongue and crossbeam remain elevated.
- V2-10: partly closed; hard room shadows softened, base hardware corrected. **Nagra top lids remain very dark charcoal**, visually conflicting with IMG_9196 satin-silver tops. Fix selective material/environment reflection rather than raising already bright room exposure.
- V2-11: closed; compact title restores emphasis to the installation.

Remaining material fidelity issue V2-12: **the lower cone reads as a copper/bronze disc with broad reflective-looking bands, and the phase plug resembles a white/silver button.** IMG_9195 and brochure p37 establish a visibly reddish striped-wood diaphragm and lighter wooden phase plug. Use photo-derived cone grain or finer reddish longitudinal grain, with a more matte dielectric response. Phase plug should show lighter wood grain and remain visibly nonmetallic. Current geometry is accepted; this is a texture/material issue, not a request to replace the corrected model.

Minor polish: thin horizontal color seams occur at front top/bottom roundover transitions. These look like separate trim pieces in some views; match edge UV/color to the continuous wooden shell. This is lower priority than the two material issues.

## Final rendered review — APPROVE

Final artifact SHA-256: **33250a68d7f593bc4ea5fe018f8d3746ed55b9babf9b76ec4ec2ef83a096f6b6**.

Checked hash directly against `The Listening Room.html` and the completed `tests/render-v2-result.json`. Independently inspected the final rendered `v2-room`, `v2-front`, `v2-speaker`, `v2-side`, `v2-rear`, `v2-base`, and `v2-suspension` screenshots after the last material changes.

V2-10 is now closed: the four Nagra upper lids in the photographed-room arrangement read as satin silver, distinct from the dark-green furniture beneath them. The broad silver values agree with the user's IMG_9196 photograph and preserve the darker seams and isolation-stack details.

V2-12 is now closed: the midcone has actual photo-derived reddish wood grain, a visibly nonmetallic surface and a lighter grained phase plug; the bright smooth bronze appearance is gone. The corrected apertures, clipped figure-eight baffle and phase-plug geometry remain intact. Front and three-quarter views preserve the characteristic two-driver W13 identity.

All substantive defects V2-01 through V2-12 are closed in the integrated rendered result. The rear-inserted tongue, suspended transverse beam, silver towers, discs and separate terminal/amplifier panels are inspectable in the final exterior and explicitly schematic suspension views. The base remains recognizable against IMG_9193 without presenting its concealed terminations as measured construction.

**Approved as the photo-informed interactive reconstruction requested in this revision, with no unresolved substantive visual defects identified.** This is not a claim of factory-CAD dimensional accuracy, calibrated color reproduction or photorealistic equivalence to the user's photographs. The room remains an interpretive real-time scene. A faint front-roundover texture transition is minor polish; it does not hide the silhouette or alter the modeled support architecture. No blind comparison or superiority claim was made.
