# Loudspeakers, subwoofers and room acoustics — specialist evidence and interface

Verified 2026-09-07 UTC. The depicted product is the original Boenicke W13 SE+ family shell, not an assertion that the user's speakers are the newly advertised MK2. Current manufacturer pages now say MK2 and list different impedance and tuning parts. The earlier manufacturer brochure saved by the user is the stronger source for original SE+ construction. No claimed benefit of proprietary tuning devices is adopted as physics.

## Required system interface

**Do not draw speaker-level sensing for W13 bass.** The original local bass manual and current official manual both specify an XLR input with 4.36 V maximum (15 dBu). The official-hosted 2021 exact W13 SE+ review explicitly requires a second preamplifier output for active bass and identifies its balanced inputs (PDF pages 9–10, zero-based). The review supplies direct contemporary connection evidence; it is manufacturer-hosted but remains a review, not a factory schematic.

Per stereo channel:

1. HD PREAMP main selected XLR output → Nagra Reference AMP line input → a complete two-conductor speaker circuit (+ and −) → W13 passive binding posts → passive crossover / front 6-inch low-mid, 3-inch widebander, rear ambient tweeter → return to amplifier.
2. HD PREAMP AUX variable RCA output → **generic high-impedance unity-gain distribution / balanced line-driver stage** → W13 balanced bass input → internal DSP low-pass and two internal 350 W Class D channels → opposed side woofers. Each internal power amplifier has its own complete local driver circuit. W13 requires mains for bass amplification.
3. Separate outputs from that generic distribution stage → **educational auxiliary active crossover** low-pass L/R → independent powered subwoofer L/R line inputs → each sub's own amplifier/driver circuit. It does not feed W13 passive drivers or replace the built-in bass DSP. W13 bass feed remains full-band at line level, then receives the internal preset filtering. Added subs supplement bass; they do not imply an exact complementary acoustic crossover with the W13. Main speakers retain their original architecture.

Preamp specialist verified that main XLR and main RCA cannot be used simultaneously; AUX follows volume and requires correct mode. A passive RCA→XLR adapter is not portrayed as balanced transmission. Buffer/load/gain/headroom and sub architecture are clearly generic educational additions, not Nagra/Boenicke features or the user's actual wiring. Route labels must state **main / alternative / auxiliary**, not imply streamer→turntable→phono are serial. Do not ground a monoblock negative terminal to protective earth.

## Documented W13 facts

- Cabinet dimensions: 105 × 18 × 39 cm (H × W × D), roughly 40 kg each. Solid-wood finish choices include walnut, ash, oak and cherry.
- Twin 13-inch long-throw bass drivers oppose one another in a sealed enclosure. A DSP module drives two internal 350 W Class D channels per speaker. The manufacturer calls the arrangement balanced-force; do not imply zero acoustic radiation or perfect mechanical cancellation at every frequency.
- Front: 6-inch wood-cone low-mid with ash phase plug and first-order electrical low-pass, **no electrical high-pass**; above it a 3-inch widebander with first-order electrical high-pass. Rear ambient tweeter.
- Presets 1–4 use bass low-pass frequencies 50 / 62 / 78 / 98 Hz, nominal 12 dB/octave. Preserve preset 1 as the initial exhibit state. The manual does not specify filter Q, exact complex transfer function, latency, or crossover acoustic sum. A plotted Butterworth curve would be an explicitly chosen teaching approximation, not the factory response.
- The original brochure calls nominal impedance 6 Ω. The current MK2 page instead says 18 Ω dropping to 2.4 Ω in treble. Do not use either as a constant resistor or label a current measurement of the user's speakers. Prefer omit impedance from prominent model cards.
- The original SE+ list names Duelund main capacitance, rear-tweeter Mundorf capacitance, resonators and other proprietary additions. Their presence is documented; claims such as quantum-noise removal, phase perfection or added naturalness have not been established here and must not drive explanatory animation.

Unknown: exact filter component values and acoustic crossover frequencies, electroacoustic sensitivity curves, Thiele/Small parameters, amplifier topology beyond Class D, delay and preset Q, user generation/finish, exact cutaway cavity geometry. Use a **generic moving-coil cutaway adjacent to the real exterior**, labeled schematic, rather than claiming an internal engineering drawing of a W13.

## Authentic photograph inspection and geometry brief

Downloaded from official product links and actually inspected with view_image:

- `research/references/boenicke-w13-official-front.jpg` — https://boenicke-audio.ch/wp-content/uploads/2017/08/W13_vorne.jpg
- `research/references/boenicke-w13-official-three-quarter.jpg` — https://boenicke-audio.ch/wp-content/uploads/2017/08/W13_schraeg.jpg
- `research/references/boenicke-w13-official-rear.jpg` — https://boenicke-audio.ch/wp-content/uploads/2017/08/W13_hinten.jpg

These are official W13-family photographs linked by the manufacturer; an exterior photograph cannot independently prove invisible SE+ tuning parts. Their 2017 URLs avoid silently substituting a fresh MK2 image, although the manufacturer now reuses them on the MK2 page. The visual artifact should say **W13 SE+ · reference-informed exterior** rather than a factory CAD claim.

The shell is extremely slim from the front (.18 m) but deep (.39 m), with broad roundovers at top/bottom front-to-back transitions, restrained vertical edges and vertical wood grain. Photos show pale natural wood. Walnut is a documented finish but grain must be a procedural interpretation if used.

Front 3-inch pale cone with metallic center sits above a reddish wood 6-inch cone and small wooden phase plug. Large black mounting discs nearly touch, form a clipped figure-eight, and occupy the full narrow front width. **Do not model three conventional front woofers and a dome tweeter.** Photo-derived approximate positions for blockout: widebander center y≈.88 m; low-mid y≈.735 m; side bass centers y≈.43–.46 m. These are visual estimates, not dimensioned drawings. Side woofer diameter is nominal 13 inches (.3302 m); trim ring diameter may differ. Side woofers face opposite side walls, are centered along cabinet depth, and have black surround/cone/dustcap. Animate positive compression by both opposing diaphragms moving **outward from the cabinet simultaneously**, i.e. opposite world displacement vectors, not the same world x direction.

Rear: small black ambient tweeter high near y≈.94 m; narrow tall black amplifier plate in lower third to half, IEC and power low on that plate; separate silver binding-post plate underneath; two silver cylindrical SwingBase support towers at rear, connected by crossbar behind the cabinet, plus small front support ball. It is not a generic thick plinth. Front ring screws, silver center, subtle copper/wood detail, edge contact shadow, and proper side-bass depth are high-value fidelity details.

## Physics view: defensible quantities

Use local acoustic particle markers anchored around equilibrium positions. **Air molecules do not travel from speaker to listener with the wave.** A marked particle oscillates about its local location; compression/rarefaction phase and energy propagate. Molecular thermal motion is omitted. Keep particle oscillation visually separate from wavefronts. Light-transparent pressure shells alone cannot explain particle behavior.

Plane progressive sinusoidal wave, linear small-signal, lossless uniform air at approximately 20°C, assumptions ρ=1.204 kg/m³ and c=343 m/s:

- SPL Lp = 20 log10(p_rms / 20 µPa).
- λ = c/f; k = 2π/λ; ω = 2πf.
- p(x,t) = p_peak cos(kx−ωt).
- Particle velocity u(x,t) = p(x,t)/(ρc).
- Particle displacement ξ(x,t) = −p_peak/(ρcω) sin(kx−ωt). Its derivative at a fixed equilibrium x gives u with the chosen sign convention. Pressure and velocity are in phase for a progressive wave; displacement is in quadrature.
- Intensity I = p_rms²/(ρc), W/m². This plane-wave relation is not generally valid in the reactive near field or arbitrary standing-wave superposition.

Checked example: **80 dB SPL at 100 Hz** gives p_rms=0.200 Pa, p_peak=0.282843 Pa, u_rms=0.000484294 m/s (0.484294 mm/s), peak particle displacement=1.090045 µm, wavelength=3.43 m, intensity=9.685887×10⁻⁵ W/m². Sound flight over 3 m is 8.746 ms. At fixed pressure SPL, displacement scales as 1/f; at 50 Hz it is 2.18009 µm. These are air-particle quantities, **not cone excursion**.

Required visual label: **“Plane-wave teaching model · 20°C air · slow motion · particle displacement exaggerated ×[actual display factor]”**. Calculate display factor from displayed world displacement / computed ξ_peak instead of inventing a fixed label while amplitude changes. If world position is schematic rather than calibrated, label “particle displacement diagram, not spatial scale” and show computed physical amplitude in the readout. Time scale must be explicit: if f=100 Hz is shown at .5 visible cycles/s, label 200× slow motion. Display f independently from animation display speed.

Generic moving-coil driver force: F = Bℓi (newtons). Example assumptions Bℓ=7 N/A and instantaneous i=.50 A give F=3.50 N. Cone dynamics require moving mass, suspension compliance, losses, back EMF and acoustic loading: m ẍ + r ẋ + k_s x = Bℓi − F_acoustic. A cutaway showing force reversal and a spring is useful; it must not equate current directly with cone displacement at all frequencies. Force factor and geometry are illustrative, not measured Boenicke values. Label the motion as slow and exaggerated.

## Room and subwoofer interaction

Rectangular rigid-wall teaching room, dimensions **6.0 × 4.5 × 2.8 m**, not the user's surveyed room. Modal frequencies:

f(n_x,n_y,n_z) = c/2 · sqrt[(n_x/L_x)² + (n_y/L_y)² + (n_z/L_z)²], non-negative integers not all zero.

Fundamental axial modes: length 28.5833 Hz, width 38.1111 Hz, height 61.2500 Hz. Pressure pattern for an individual axial mode is cos(nπx/L) times its temporal oscillation; rigid-wall pressure maxima occur at walls, velocity is zero there. Do not draw one-way traveling shells and call that a standing mode. If amplitude/decay is simulated, state chosen modal damping/Q and source/listener coupling; ideal eigenfrequencies do not predict actual peak SPL.

Optional sub delay/crossover interaction can be rigorous with two equal-amplitude sinusoids measured **at one listener point**: |p_total| = 2A|cos(φ/2)|, φ=2πfΔt plus phase offsets. At 100 Hz, Δt=5 ms gives 180° and ideal cancellation; Δt=0 gives twice the pressure, +6.0206 dB relative to one source. Equal amplitudes and coherent phase are essential; decorrelated noise gives +3.0103 dB for doubled intensity. Never promise +6 dB from any real pair everywhere. “Delay” should be a scalar controlled at a virtual listening point, not a supposedly verified W13/sub alignment.

Changing sub positions changes mode excitation and phase at a given seat. A room-response drawing without measured boundaries and loudspeaker data is illustrative. The exhibit cannot report a W13 in-room response, measured decay, best preset, or promised bass improvement from this geometry.

## Concise ready-to-use UI copy

**Wood, magnets, motion.** “A coil carries alternating current through a magnetic field. The force reverses with the current; the cone and suspension respond. The moving surface compresses and rarefies the surrounding air.”

**Five drivers, two kinds of amplification.** “Your W13 combines a passive front section and rear tweeter with separately powered side bass drivers. The Nagra monoblock feeds the speaker terminals; a second preamp line feeds the internal bass amplifiers.”

**The air stays near home.** “The wave travels across the room. Each small parcel of air moves only back and forth. At 80 dB and 100 Hz, this simple plane-wave model predicts just 1.09 micrometres of peak displacement.”

**A room is part of the instrument.** “Reflections combine with direct sound. At some positions they reinforce; at others they cancel. These room modes explain why moving a speaker or a seat can change bass.”

**Two paths to the bass.** “W13's side woofers use their own DSP and amplifiers. The separate subwoofers and line crossover here are an educational addition; they supplement the main speakers and do not replace their internal filters.”

## Accessible sources

1. Boenicke product page, current MK2 caveat: https://boenicke-audio.ch/products/loudspeakers/w13/
2. Original manufacturer brochure, printed pp35–36, local PDF inspected with pdftotext; live URL too large for web text fetch: https://www.boenicke-audio.ch/BoenickeAudio_Brochure_web.pdf ; original local source `BoenickeAudio_Brochure_web.pdf`.
3. Manufacturer W13 Bass Amplifier Operation Manual, one page, live and local versions matched: https://boenicke-audio.ch/W13BassAmplifer.pdf ; local `W13BassAmplifer_2.pdf`.
4. Image hifi January 2021 W13 SE+ review hosted by manufacturer, connection text PDF pp9–10 (zero-based), original photography Rolf Winter: https://boenicke-audio.ch/image_hifi_W13.pdf . Use as visual and contemporary connection evidence; its tuning-benefit opinions are not verified scientific facts.
5. OpenStax University Physics 1 §17.3, linear sound intensity and displacement relationships: https://openstax.org/books/university-physics-volume-1/pages/17-3-sound-intensity
6. Genelec engineering setup guidance, reflections/modes/placement: https://www.genelec.com/monitor-placement
7. Room modes derive from the acoustic wave equation with stated rigid rectangular boundary conditions. Supporting research: R. Walker, “The Effects of Low-Frequency Room Modes on Source and Receiver Responses,” Proceedings of the Institute of Acoustics: https://www.ioa.org.uk/system/files/proceedings/r_walker_the_effects_of_low-frequency_room_modes_on_source_and_receiver_responses.pdf
