# The Listening Room

A self-contained, offline Three.js exhibit built around Boenicke W13 SE+ speakers and Nagra HD PREAMP, HD DAC X and Reference monoblock amplifiers.

**[Download The Listening Room.html](The%20Listening%20Room.html)** and open it in a browser with WebGL and hardware acceleration. No server or installation is required. The HTML embeds all code, textures, photographs and scientific diagrams.

![Photo-informed installation with warm speaker lighting](screenshots/v4-room-warm.png)

## Explore

- Drag to orbit; scroll to approach. Select equipment or use the component navigation.
- **Your room** recreates the photographed arrangement. **Complete study** adds the educational source, power and distribution components.
- **Speaker spots · 2700 K** dims the two warm lights together.
- **Speakers** offers front, side, rear and SwingBase views. **Reveal suspension principle** shows a clearly labeled schematic support mechanism.
- **Physics** and **Connections** explain each subsystem. Digital and vinyl are alternative source paths.
- **Sources** contains the owner photographs, original brochure excerpts and manufacturer references, available offline.

The W13s' side drivers are their integrated active subwoofers. There are no separate subwoofer cabinets. The external monoblocks feed the passive sections; the W13 internal amplifiers feed the opposed side subwoofers. The LR4 crossover experiment is a separate educational model.

## Build

Python 3 is the only build dependency:

```sh
python3 build.py
```

The builder embeds `src/`, `vendor/three.min.js`, and the selected images under `research/` into `The Listening Room.html`. No network access or dependency download is needed for the build.

The HTML may also be served by any static host. Copy it to that host's publish directory as `index.html` if required.

## Verification and limits

[Verification.md](Verification.md) records the tested artifact hash, offline checks and independent visual/physics reviews. This package includes the current lighting screenshots and machine-readable test results. Historical reviews are retained for context; not all earlier captures or machine-specific browser harnesses are included. Machine-specific paths in historical reports have been generalized for this repository. The current lighting revision was inspected at desktop and mobile viewport sizes, with the spotlights off, at the default setting and at full brightness.

Equipment geometry and the room are photo-informed reconstructions, not factory CAD or a measured acoustic survey. Fine dimensions, concealed suspension attachments, lighting placement and photometry are identified as estimates or schematics. The exhibit produces no audio and does not control equipment.

Three.js r160 is distributed under the [MIT license](vendor/THREE-LICENSE.txt). Owner photographs were supplied for this exhibit; manufacturer photographs and brochure excerpts remain copyrighted by their respective owners. This independent exhibit is not an official Boenicke or Nagra publication.
