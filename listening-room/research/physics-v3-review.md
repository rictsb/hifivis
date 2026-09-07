# Independent physics review — W13 integrated bass only

Reviewer: `personal_room` subagent. I did not author this revision's source changes.

Status: **APPROVED. No unresolved substantive physics defects in the inspected final artifact.**

Final independently tested artifact SHA-256: `9a7c11df1a291d4dbb4d5a5d92bd25fcd348a617cf49e0a54616169258acc9a4` (3,871,855 bytes).

## Independently checked architecture

Manufacturer W13 bass manual (re-opened directly): https://boenicke-audio.ch/W13BassAmplifer.pdf . The original-generation brochure previously inspected at pages 36–37 confirms the two opposing 13-inch woofers, two 350 W Class D modules and programmable DSP inside each speaker. The bass manual identifies its separate XLR input, AC feed and four nominal 12 dB/oct low-pass presets: 50, 62, 78 and 98 Hz.

Nagra HD PREAMP manual (re-opened directly), pages 18–19: https://www.nagraaudio.com/wp-content/uploads/2020/04/Nagra-HD-PREAMP-User-Manual-English.pdf . Main balanced XLR and main RCA are alternatives selected by the front-panel switch. A single chosen balanced main L/R pair into an explicitly generic high-impedance buffered distribution stage is electrically plausible and avoids an invented simultaneous-output arrangement. This is a teaching topology, not proof of the owner's actual wiring.

Required final study topology:

1. Streamer → DAC OR turntable → phono stage, selected by the preamp.
2. PREAMP selected main XLR L/R → generic buffered distribution.
3. First full-range stereo pair → external Nagra monoblocks → W13 passive terminals and stock passive network.
4. Second full-range stereo pair → each W13 bass XLR → its internal DSP/amplifiers → its opposed side woofers.
5. Separate parallel AC feeds remain for the Nagra power supplies, monoblocks and W13 internal bass supplies. Both conductors of every signal/load circuit remain represented by their pair/bundle; protective earth is not an audio return.

There must be no additional subwoofer chassis, third low-pass destination branch, external-sub AC route, navigation entry or wiring-map box. The W13's built-in active bass supplies the requested subwoofer function. The retained generic crossover is bypassed/full-range for this teaching installation; its ideal LR4 complementary-filter laboratory must be explicitly separate from the stock W13 network. Room-length/mode and plane-wave experiments should live under Speakers with explicit ideal-room assumptions.

## Defect prevention communicated during implementation

- Replace the ambiguous older phrase “Two amplifier systems inside each W13” with wording distinguishing the passive path from internally powered bass; the external Nagra is not inside the cabinet.
- Remove stale extra-sub branches from geometry, component data/navigation, audio routes, AC routes, walkthrough sequence, explanatory source drawer and wiring diagram.
- Keep both W13 feeds full-range. Do not route an external high-pass to the passive section or bypass the speaker's original low-pass DSP merely to match the LR4 educational graph.

## Defects found and resolved during integrated review

| ID | Issue | Resolution and evidence |
|---|---|---|
| P3-01 | The older flow sentence could imply external Nagra amplification is inside the W13. | Final sentence explicitly separates external monoblocks from internal amplifiers for integrated bass; inspected final flow render. |
| P3-02 | The initial route-strip arrows visually placed the active-bass destination after the passive destination. | Two sibling rows now share the distribution origin, with an accessible parallel-full-range group label. Both final digital and vinyl route presentations inspected. |
| P3-04 | Visual critic identified the generic driver’s inward-moving diaphragm crossing its opaque backing disc, changing the apparent cone into black rings. | The fixed mounting plate is now a 6 mm annular extrusion with an actual aperture of radius .86R, clearing the cone's .84R outer radius. Independently inspected final outward and inward extrema screenshots: the complete cone remains visible through the aperture in both positions. Displacement, coil and time relationships remain unchanged. |
| P3-03 | The first viewpoint repair covered the inspector Physics tab but not the header Physics mode. | Both entry paths now select threequarter; independently tested both. The generic insert follows the viewing orientation so it remains legible, while local cone/coil motion remains a separate explicitly enlarged schematic. |

## Final independent checks and inspection

Opened an isolated copy of the final single HTML with Chrome in offline mode and ran `tests/physics-v3-independent.cjs`. All **26 checks passed**; `tests/physics-v3-independent-result.json` records the final hash, inventory, connections, measurements and empty JavaScript-error/external-request lists.

Runtime inspection confirms exactly nine component categories. Neither `subs` nor `subR` exists in product data or the scene's registered components, and no audio or power route addresses an external subwoofer. The distribution stage has four destination cables: left/right monoblocks and left/right W13 bass inputs. Both digital and vinyl tours terminate in these two parallel branches. The corresponding wiring map has two separate amplifier/driver branches, explicitly labels the four internal bass-amplifier channels across the stereo pair, and labels independent load return paths and parallel AC supply.

Room acoustics is retained under Speakers. Changing ideal room length to 4.0 m displays first axial modes 42.88 / 38.11 / 61.25 Hz immediately below the slider. The rigid rectangular-room assumptions and the statement that this is not the photographed room's measured response remain readable. The plane-wave example still gives 0.2 Pa RMS and 1.090045 micrometres peak particle displacement at 100 Hz, 80 dB SPL. Signed aliasing, four-bit quantization, copper drift and LR4 null checks pass unchanged.

The SwingBase beam retains 3.5 mm clearance above its lower fixed pedestal; the front support meets both floor and cabinet. The full speaker, ash phase plug and suspension remain static. Only the separate generic transducer insert moves; its coil and cap follow its cone, its frame remains fixed, and its exaggerated displacement/slow-motion assumptions remain explicit. Elapsed animation time was 1.1000 s during 1.1019 s wall time; pause froze the scientific clock.

Actual integrated images inspected include root's `v3-study.png`, `v3-flow.png` and `v3-mobile-physics.png`, plus independently captured `physics-v3-independent-suspension.png`, `physics-v3-independent-acoustics.png`, `physics-v3-independent-map.png`, `physics-v3-independent-map-bottom.png` and the settled vinyl `physics-v3-independent-flow.png`. Upper and lower map content and the mobile room-acoustics panel were inspected after the revisions. Following the final aperture correction, I independently captured and inspected `physics-v3-independent-cone-out.png` and `physics-v3-independent-cone-in.png` from the exact final hash, covering both motion extrema.

The two-branch system is technically coherent and satisfies removal of separate subwoofer boxes. The final aperture correction is verified, and the exact final artifact is independently approved with no unresolved substantive physics defects. This review does not assert a measured acoustic response, manufacturer CAD fidelity, or verified concealed wiring in the owner's actual installation.
