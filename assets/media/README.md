# Generated stills

Six ambient stills were generated for the preview page with Higgsfield
(FLUX.2, 1 credit each). They are **not committed here**: this build
environment's egress policy blocks Higgsfield's result CDN, so the files
could not be downloaded. They are in the Higgsfield account and can be
saved from there.

The preview page does not depend on them. Its atmospheric layers —
`.pdcm-band-art` and `.pdcm-fins` in `assets/css/motion.css` — are built
from CSS gradients and look finished as they are. The stills are an
optional upgrade.

## Brief used

All six were prompted with no people, no text or lettering, no logos or
mark-like shapes, and no depiction of a real place, graded to Midnight
Navy / Harbor Slate / Platinum Gray with Soft Gold only as a light
source. `tulsa skyline.jpg` remains the only image on the site that
depicts Tulsa.

| Suggested filename | Subject | Ratio |
|---|---|---|
| `01-hero.png` | Architectural interior, navy, single shaft of gold light | 16:9 |
| `02-stone.png` | Polished limestone macro in cool navy shadow | 4:3 |
| `03-fins.png` | Vertical stone fins receding into shadow | 16:9 |
| `04-horizon.png` | Navy gradient field, one fine gold horizon line | 16:9 |
| `05-dusk.png` | Dusk gradient, navy to a narrow gold band | 16:9 |
| `06-paper.png` | Blank aged ledger paper macro, platinum gray | 4:3 |

## Using one

Save the file here, then add it as the first background layer on the
matching rule in `assets/css/motion.css`, keeping the gradients beneath
it as the scrim. For the transitional band:

```css
.pdcm-band-art {
  background-image:
    url("../media/05-dusk.png"),
    radial-gradient(/* ... existing layers, unchanged ... */);
  background-size: cover, auto, auto;
}
```

The parallax already targets these elements, so nothing in
`assets/js/motion.js` needs to change.
