# The Listening Room — warm speaker lighting

Delivered file: **The Listening Room.html**, 3,875,158 bytes. Three.js, all code, textures, scientific diagrams, five owner photographs, three brochure pages and four manufacturer reference images are embedded. No server, installation or internet connection is needed to use the exhibit. Documentary links require internet only when opened.

SHA-256: `29733ee1e5d8a542cb166523dc78b879c0b2d8446589125cc83d4ac5c820a7ad`

## Use

Open the HTML in a browser with WebGL and hardware acceleration. **Speaker spots · 2700 K**, at the upper right of the room, adjusts both speaker lights together. The default is 70%; zero turns the spots off while leaving the ambient daylight constant. The setting persists between **Your room** and **Complete study**.

Drag to orbit and scroll to approach. Select **Speakers** for Front, Side, Rear, SwingBase and Full speaker views. **Reveal suspension principle** exposes a clearly labeled symbolic steel-rope support. Close-up inspection uses neutral studio lighting. Object, Physics and Connections tabs provide the component explanations; Digital and Vinyl are alternative sources. Sources contains twelve embedded reference images that enlarge offline.

## Lighting revision

Two independently aimed spotlights illuminate the W13s with warm upper/front highlights and soft floor pools. Broad daylight was reduced and ambient fill made warmer; materials were not recolored to simulate the lights. The two light targets follow the speaker positions in each installation. Portrait resizing now reframes the complete stereo pair, and the interior remains clear when the camera pulls back.

The owner specified **two spots at 2700 K**. Their linear RGB color was independently calculated by integrating a 2700 K Planck spectrum against the CIE 1931 2° observer functions, then converting to linear sRGB. The peak-normalized values are `(1, 0.415251456, 0.099114421)`. They enter Three.js directly in linear space. The Sources drawer links the CIE data and explains the limits.

The light positions, beam spread and intensity are visual estimates. An RGB renderer does not reproduce the spectrum, CRI or beam photometry of the owner's particular lamps. The dimmer keeps color temperature constant; it is not a model of a tungsten filament changing temperature. Spotlights use inverse-square attenuation, a soft angular penumbra and shadow maps. Ambient/reflection fill is an artistic real-time approximation, not a complete spectral light-transport calculation.

## Final-file tests

The root test copied only the finished HTML into a fresh temporary directory and opened that copy in offline Chrome. All **15 checks passed**: two 2700 K spots; attenuation and shadows; one target per W13; off/full dimming; constant ambient under dimming; correct targets after installation switching; no standalone subwoofers; readable physics metrics; all twelve references loaded; both speakers inside the portrait view; mobile dimmer operation; no horizontal overflow; lighting controls within the mobile viewport; and no JavaScript errors or network asset requests.

Actual final screenshots were inspected at 1600 × 1000 and 390 × 844. Captures compare default, off and full spotlight settings, Complete study, neutral object inspection and the mobile room. Hardware-accelerated Chrome rendered the default room at approximately **60 fps** during a two-second sample on this Mac. This is a short measurement, not a performance guarantee for other devices; mobile testing used a browser viewport rather than a physical phone.

Current machine-readable result: [lighting-v4-result.json](tests/lighting-v4-result.json). Independent lighting reviews: [visual](research/visual-lighting-review.md) and [physics](research/physics-lighting-review.md). The physics reviewer independently checks the color calculation, actual isolated offline file, dimming, targets, attenuation and representative audio quantities.

Both independent critics approved the exact final hash above, with no unresolved substantive lighting defects. The physics reviewer passed 15 additional checks on an isolated offline copy; [its test record](tests/physics-lighting-independent-result.json) matches the delivered file.

## Preserved equipment and science

The W13 exterior follows the owner's five photographs and original brochure: documented 105 × 18 × 39 cm envelope, recessed front drivers, wood midcone with stationary phase plug, opposed integrated active subwoofers, rear tweeter, finned amplifier panel, separate terminals and rear-inserted SwingBase tongue. Fine geometry, room dimensions and hidden cable destinations remain photographic estimates. Concealed suspension attachments are symbolic; no isolation performance or sonic benefit is inferred.

The W13s supply the system's active subwoofer function. Separate subwoofer cabinets and their branches are removed. Complete study uses two independent full-range stereo feeds: external Nagra monoblocks drive the passive sections, while the W13 internal amplifiers drive the side subwoofers. The LR4 laboratory remains a separate ideal experiment. The personal room is a photographed layout, not a verified record of concealed wiring.

Earlier full-system and subwoofer-correction checks remain available in [visual-v3-review.md](research/visual-v3-review.md), [physics-v3-review.md](research/physics-v3-review.md), [offline-final-result.json](tests/offline-final-result.json) and [render-v3-result.json](tests/render-v3-result.json). Those records identify their earlier artifact hashes; they are not presented as fresh runs on this lighting revision. The scientific equations and equipment geometry were not changed by this revision.

The exhibit is a photo-informed real-time reconstruction, not factory CAD or a measured acoustic prediction. It generates no audio and does not control any equipment.
