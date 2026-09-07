# Independent physics review — two 2700 K speaker lights

Reviewer: `personal_room` subagent. No lighting source code authored by this reviewer.

Status: **APPROVED. No unresolved substantive physics defects in the final lighting revision.**

Final independently tested HTML SHA-256: `29733ee1e5d8a542cb166523dc78b879c0b2d8446589125cc83d4ac5c820a7ad` (3,875,158 bytes).

## Independent color calculation

Downloaded the original [CIE 1931 2° observer functions](https://cie.co.at/datatable/cie-1931-colour-matching-functions-2-degree-observer) at 1 nm intervals. The saved data `research/CIE_xyz_1931_2deg.csv` matches CIE's published MD5 `17cca777db64b17170f06f67ce9d3ab7`. Integrated Planck spectral radiance at 2700 K using exact SI h, c and k, then converted XYZ to linear sRGB using the [W3C conversion matrix](https://www.w3.org/TR/css-color-4/#color-conversion-code).

- Chromaticity xy: `(0.4598590271, 0.4105990381)`.
- XYZ normalized to Y=1: `(1.119971029, 1, 0.315494979)`.
- Linear sRGB normalized to Y=1: `(1.935100071, 0.803553121, 0.191796324)`.
- Linear sRGB normalized by its maximum component: `(1, 0.415251456, 0.099114421)`.
- Encoded sRGB display swatch, after maximum normalization: approximately `#FFAD59`.

Normalization changes radiometric scale but preserves chromaticity. The RGB values are an approximate display/renderer representation of a Planckian illuminant. They do not reconstruct the spectrum or color-rendering properties of an unspecified real 2700 K lamp.

## Rendering criteria

[Three.js color management](https://threejs.org/manual/en/color-management.html) uses linear sRGB for lighting calculations and encoded sRGB for color textures and final display. Linear RGB light values must enter as linear values, without a second sRGB decoding step. Material appearance must remain a material-light interaction rather than a full-screen warming filter.

Verified the version-specific [r160 light shader](https://raw.githubusercontent.com/mrdoob/three.js/r160/src/renderers/shaders/ShaderChunk/lights_pars_begin.glsl.js): with legacy lights disabled and decay=2, light attenuates as inverse-square beyond the near-field denominator clamp. A nonzero distance also applies a smooth finite-range cutoff. A cone's penumbra is an angular attenuation, separate from its distance falloff. Shadow maps and artistic diffuse/reflection fill are approximations, not solved full-room spectral transport.

The user's documented inputs are two speaker-targeted lights and 2700 K CCT. Placement, beam angle, intensity and room reflection assumptions remain rendering estimates. The dimmer should change intensity at fixed CCT, make both lamps controllable together, and leave audio state and product geometry unaffected.

## Final integrated checks

Ran `tests/physics-lighting-independent.cjs` against an isolated temporary copy of the exact final HTML in offline Chrome. All **15 independent checks passed**, with zero JavaScript errors and zero external resource requests. Full results and runtime light values are recorded in `tests/physics-lighting-independent-result.json`.

The runtime contains exactly two shared SpotLights in both room installations, with one target on each W13. Their linear color `(1, .415251456, .099114421)` agrees with the independent Planck/CIE integration. Both lights have decay=2, distance=0, a half-angle of π/14, angular penumbra=.65, and 1024² shadow maps. The renderer uses nonlegacy lighting, linear material/light calculations and sRGB output. This is an approximate RGB direct-light/shadow render, with an artistic reflection environment and diffuse fill, rather than a spectral or measured photometric simulation.

The dimmer drives both lights from zero to a rendering intensity of 65, with exactly half that value at 50%; default 70% corresponds to 45.5. Chromaticity, ambient light and audio state remain unchanged by dimming. Moving between Your room and Complete study retains both lamp identities, updates their targets to the new W13 locations, and preserves the dimmer setting. The close-up studio remains neutrally lit and has no added spot pair, as the Sources note explicitly explains. Lamp placement, beam spread and brightness are identified there as visual estimates; no lamp spectrum, CRI, flux or measured illuminance is claimed.

Independently captured and inspected final images `lighting-physics-independent-off.png`, `lighting-physics-independent-full.png`, `lighting-physics-independent-default.png`, `lighting-physics-independent-study.png` and `lighting-physics-independent-detail.png`. The change is a localized warm illumination of each cabinet and the nearby floor, with cast shadows and surrounding daylight remaining coherent. Also inspected root's final `v4-mobile.png`: the 2700 K label and dimmer are legible in portrait layout.

The four-destination full-range distribution topology, nine component categories, lack of separate subwoofer boxes, 0.2 Pa RMS at 80 dB SPL and representative signed-alias arithmetic remain unchanged. Earlier detailed scientific checks are recorded in `physics-v3-review.md`; this bounded review independently verified the new lighting and representative regressions rather than claiming a fresh audit of every unchanged equation.
