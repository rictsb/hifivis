# Independent physics review — W13 and photographed-layout revision

Reviewer: `personal_room` subagent, acting as physics critic. I authored architectural appearance only; I did not author the speaker model, suspension mechanism, UI claims or scientific equations under review.

Status: **APPROVED for the integrated artifact identified below. No unresolved substantive physics defects.**

## Sources actually inspected

- Owner photographs IMG_9193, IMG_9194 and IMG_9195, including actual rear tongue, crossbeam, silver support towers, floor discs, front driver assembly and opposed-side bass enclosure. Also the complete installation in IMG_9192/9196.
- Supplied brochure: rendered pages 36 and 37 inspected directly. These document original W13 dimensions, the 6-inch wood-cone driver with ash phase plug, 3-inch widebander, opposing bass architecture, two 350 W Class D modules, rear tweeter and included SwingBase. Page 37 corroborates the subtle front support.
- Manufacturer SwingBase sheet, both pages, including the primary steel-rope statement; page 1's platform photograph inspected. https://www.boenicke-audio.ch/SWING_BASE.pdf
- Manufacturer W13 bass manual re-opened: XLR input, four 12 dB/octave presets at 50/62/78/98 Hz, 350 W per driver, separate AC requirement. https://boenicke-audio.ch/W13BassAmplifer.pdf
- `research/w13-evidence-v2.md`, `src/w13-model.js`, `src/scene.js`, `src/content.js`, `src/app.js`, relevant template labels. The manufacturer's claimed sonic effects were treated as claims, not demonstrated mechanisms.

## Concrete defects

| ID | Severity | Defect and corrective action | Status |
|---|---|---|---|
| P2-01 | Substantive mechanical coherence | Lower fixed tower cylinders span y=0.004–0.015 m, while the suspended beam bottom is y=0.0135 m. This creates a 1.5 mm overlap and unintended rigid load path. Lower the pedestal top to 0.010 m and continue only the slotted surrounding shell to the upper tower. Keep clearance beneath the moving member. | Resolved: pedestal ends at 0.010 m; beam begins at 0.0135 m; source and integrated transparent render checked |
| P2-02 | Substantive epistemic/topology issue | Personal-room cable geometry connects both W13 bass feeds and both monoblock inputs to four assumed HD PREAMP points, although this user's rear topology is unverified and the actual main RCA/XLR choice is selective. Preserve visible connector tails but hide unknown far ends behind the credenza. Keep explicit fully connected routing in the labeled educational Complete study. | Resolved: unknown XLR far ends disappear behind the credenza; explicit full topology is confined to Complete study |

## Checks passed in source review

- The support tongue enters the low rear plane; it is not a full-depth plinth. The beam is behind the cabinet and both towers terminate on their own floor discs.
- The front sphere reaches from y=0 to y=0.009 m, meeting the cabinet bottom at y=0.009 m. The speaker-detail floor top is y=0. The front support supplies a second load path; the rear suspension is not depicted as supporting a freely floating cabinet by itself.
- Optional green suspension lines are schematic, one symbolic line per tower, with no asserted measured free length, cable count or ferrule geometry. They are static: no invented W13 resonance, displacement or isolation attenuation is computed.
- Source and inspector distinguish the manufacturer's steel-rope principle from undocumented W13 hidden construction. The exhibit does not repeat claims of zero floor transmission, guaranteed sonic gains or a mechanical diode.
- Two front radiators, two side woofers and one rear tweeter are present. The side assemblies face opposite world-space directions. Product diaphragms and the ash phase plug remain stationary; only the separate generic moving-coil insert is animated. There is no wrong in-phase world-space animation of opposed drivers.
- Passive terminals, bass XLR and mains are distinct. The Complete study retains separate full-range passive/amplified bass feeds plus optional separately low-passed subs. The ideal LR4 experiment is explicitly separate from actual W13 acoustic summation.
- Existing mathematical functions remain internally consistent on inspection: RMS/peak copper drift, matched TEM-line transit, signed aliasing, uniform quantization, RIAA time constants, LR4 vector summation, resistive amplifier load and progressive plane-wave equations. Source review is not a substitute for the pending integrated runtime checks.
- Time stepping still uses elapsed wall time; scientific magnification and slow-motion caveats remain visible in the content.

## Integrated final acceptance

Final artifact SHA-256: `33250a68d7f593bc4ea5fe018f8d3746ed55b9babf9b76ec4ec2ef83a096f6b6`.

I inspected actual integrated renders `v2-room.png`, `v2-front.png`, `v2-side.png`, `v2-rear.png`, `v2-base.png`, `v2-suspension.png`, `v2-physics.png`, and `v2-study-flow.png`. I also independently opened an isolated copy of the delivered single HTML in offline Chrome, interacted with its controls, captured and inspected `physics-v2-independent-suspension.png` and `physics-v2-independent-power.png`, and ran the 15 checks recorded in `tests/physics-v2-independent-result.json`. All passed; no JavaScript errors or external requests occurred.

The transparent support view visibly shows the fixed towers and symbolic tension members carrying the crossbeam. Its on-screen caption identifies symbolic ropes/attachments, rejects factory dimensions, and reminds the visitor that the front support also carries load. The revised beam clears the pedestal. Source geometry and the runtime front support/floor heights agree.

The complete W13 mesh remains static while playback runs, including its ash phase plug and opposed bass units. The separately labeled generic insert's coil and cap follow its cone while its frame remains fixed. At 100 Hz and 80 dB SPL, the plane-wave values are 0.2 Pa RMS, 0.484294 mm/s RMS, 1.090045 micrometres peak displacement, and 3.43 m wavelength. The 10 A RMS copper example gives 1.324 micrometres peak. Signed aliasing gives -2 kHz for a 6 kHz input sampled at 8 kHz; LR4 inverted and half-cycle-delay cases null as expected; four-bit quantization of 0.8 produces 0.75.

Measured final animation elapsed time was 1.1166 s during 1.1010 s wall time (within one display-frame interval); pause held elapsed time exactly fixed. Opening an educational component switched to Complete study. Vinyl and digital source routes remain alternatives. No unsupported isolation, resonance, proprietary construction, or sonic-performance claim was found in this revision.

This approval covers the integrated physics and evidentiary boundaries of this exact artifact. It is not a claim of factory CAD accuracy, verified user-room wiring, measured room acoustics, or independently superior visual quality. Architectural appearance belongs to the separate visual critique.


## Final material-only revision recheck

Compared the actual final embedded scripts against the previously approved `132efef7...` HTML kept in the independent temporary test directory. The differences are limited to two added embedded image samples (midcone and phase plug), their nonmetallic material maps/roughness, and the Nagra lid material. The application script and scientific content are unchanged. Suspension geometry, load paths, connector routing and animation functions are unchanged.

Inspected the latest integrated room, front and transparent-suspension renders. Then independently repeated the copied-file offline check on `33250a68d7f593bc4ea5fe018f8d3746ed55b9babf9b76ec4ec2ef83a096f6b6`; all 15 checks again passed, including static full-speaker transforms after the extra material/batching changes. `tests/physics-v2-independent-result.json` now records this final hash. Approval carries forward with no unresolved substantive physics defect.
