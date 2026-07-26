# Round-4 audit — stage `air`

## Art-director score: **30/100** (-2 from 32)

> Two large floating monitor-like cards own the top half and the entire system is compressed to an unreadable 200 px strip along the bottom. Cyan and amber beams cross the frame as tractor beams. A sofa is sliced by the bottom edge as a grey smudge.


## Findings for this stage (5)

### 1. [MAJOR] (certain)

**Wrong:** src/stages/air.js:402 — `frameShot([-0.42, 1.22, 0.20], 0.860, { fill: 0.62, ... })` frames a 0.86 m radius centred 1.22 m up and 0.2 m in front of the seat, which means the framed sphere is mostly the two diagram cards. The entire system is compressed to an unreadable 200 px strip along the bottom of the frame. Six label cards and two cards at unrelated depths sit over it, and a sofa is sliced by the bottom edge as a grey smudge. The physics in this chapter is the strongest in the deck and the picture hides all of it.

**Fix:** air.js:402 — reframe on the listening axis, not on the cards: target the seat-to-speaker line at around [-0.30, 0.95, -1.20] with radius 1.8 and fill 0.58, fov 36, so the loudspeaker, the floor bounce and the seat are all legible objects. Then reduce to ONE card (Addendum B) — keep the direct+floor comb response, drop the parcel-oscillation card into content() as prose plus one readout — and cut the six labels to three.

### 2. [MAJOR] (likely)

**Wrong:** The two cyan beams and one amber beam crossing the frame to a glowing sphere read as sci-fi tractor beams, not as an acoustic path. They are thin, uniformly bright, unattenuated over their length, and terminate in a glowing ball with concentric rings. Nothing in the benchmark category looks like this and it undercuts the credibility of the strongest physics chapter in the deck.

**Fix:** air.js — make the direct and floor-bounce rays fall off in brightness along their length (they are carrying 1/r pressure; show it), reduce them to hairline width, and replace the glowing terminal sphere with a small flat marker plus a label. If the intent is to show arrival time, animate a short bright segment travelling the path rather than lighting the whole path at once.

### 3. [MAJOR] (certain)

**Wrong:** content() reads "A 100 W peak — 1.29 W of sound, 199 W of heat — gives 96.4 dB direct at 4.830 m". The 1.293 W and 198.7 W are W_AC and W_HEAT for the PAIR (2 × 100 W), while 96.4 dB is the single-speaker figure. As written the sentence claims 100 W in produces 1.29 W of sound plus 199 W of heat, which does not add up, and a reader checking energy conservation will stop there.

**Fix:** Rewrite as: "100 W into each — 0.65 W of sound and 99 W of heat per speaker — gives 96.4 dB direct at 4.830 m, 102.4 dB for the pair." Or keep the pair figures and say "100 W each: 1.29 W of sound and 199 W of heat between them."

### 4. [MAJOR] (likely)

**Wrong:** Three plates plus four multi-line label blocks are visible at once (parcel window, floor-bounce comb, and the At-the-seat / Floor-bounce / Below-the-rule / Air-parcels blocks, each three to five lines of mono at the same size and weight). ADDENDUM §B caps this at two cards and three plot regions. The result is that the true-scale parcel row — which correctly shows essentially no motion — is lost among the annotation rather than being the point.

**Fix:** Drop the floor-bounce comb plate into content() as a sentence (the two figures −15.3 dB at 414 Hz and +5.2 at 828 are already in a label) and keep only the parcel window. Cut every remaining label to two body lines and push the third into the panel.

### 5. [MINOR] (likely)

**Wrong:** content() reads 'A 100 W peak — 1.29 W of sound, 199 W of heat — gives 96.4 dB direct at 4.830 m'. At eta0 = 0.647%, 100 W gives 0.647 W of sound and 99.35 W of heat; 1.29 W and 199 W are the figures for the PAIR at 100 W a side. The SPL that follows (90.11 + 20 = 110.11 at 1 m, less 20log10(4.83) = 96.43 dB) is correct for one loudspeaker, so the sentence mixes a per-pair power with a per-channel SPL in one clause.

**Fix:** air.js content() — 'A 100 W peak a side — 1.29 W of sound and 199 W of heat for the pair — gives 96.4 dB direct from one at 4.830 m, 102.4 dB from both.' Everything else in this chapter recomputes exactly, including the 10.9 pm threshold displacement and the 1.00e5 speed ratio.

---

## Fixed in core by the lead since these findings — do NOT redo, do NOT edit core

The art director's headline was "there is no specular event anywhere in the
piece: every surface returns one flat value from its environment". Both named
causes are now addressed:

1. **The environment had no structure.** Eight emitters at flat single
   intensities integrate to a nearly uniform hemisphere. Each softbox now
   carries a luminance ramp along its own length, and the shell has a
   **horizon band** — the studio trick where a bright line sits where the walls
   meet the sweep, so a polished vertical surface returns a horizontal highlight
   that *bends with the surface*. That is what a reflected horizon is, and it is
   what makes a cabinet cheek read as a cheek instead of painted card.
2. **The diagram card was a UI div.** `DIAG.diagramCard` was a
   `MeshBasicMaterial` with `toneMapped:false` — it took no light, cast no
   shadow and never appeared in the floor reflection. It is now a lit dielectric
   slab with real thickness and a machined `aluTrim` bezel on all four sides. It
   catches the horizon band along its top edge, shades across its face, casts a
   shadow and shows up in the floor like everything else. **Your card will look
   different — re-look at it.**

Also: the cyclorama is widened to 34 x 9.5 m so its edges never enter frame.

Measured over the twelve frames after these fixes: mean luminance **23.2 %**
(was 8.8-14.5 % three rounds ago), pixels above 95 % **0.13 %**, mid-tone mass
**54.3 %**.

## `GEO.instrumentGlass()` exists and NOT ONE STAGE USES IT

Contract Addendum J. Several stages answered "give the meter a specular layer"
with a crowned panel at roughness 0.085, which returns essentially the whole
softbox and blooms into a lens flare — measurably the brightest thing in
`preamp`, `phono` and `dac`, and still visible in the current frames.

`GEO.instrumentGlass(w, h, opts)` is crowned (the source sweeps as a band rather
than sitting as a rectangle), `reflectivity` 0.34 (a coated cover glass returns
~1.7 % at normal incidence, not the default's uncoated 4 %) and roughness 0.15.
If your stage has a meter, a display, a lens or a card front, use it. Delete
whatever near-mirror you rolled yourself.
