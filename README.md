# Huemanize

A Figma plugin port of the [Radix Colors custom palette generator](https://www.radix-ui.com/colors/custom). Pick an accent or gray hex, generate a 12-step palette, and write it into a Figma variable collection with both `Light` and `Dark` modes populated.

## How it works

1. Paste a hex color.
2. Choose **Accent** or **Gray** as the scale type.
3. (Optional) Adjust the light/dark backgrounds the scale will sit on.
4. Name the color and choose a variable collection.
5. Click **Add Variables**.

To update an existing color group, switch to **Update** mode, pick the group, and click **Update Variables**.

## Details

- Step naming follows Radix Colors (`1` … `12`), not Tailwind (`50` … `950`). Step 9 is your input color.
- Each generated variable holds both a Light and a Dark value, in two Figma modes named `Light` and `Dark`. Switch the active mode in your file to see the palette flip.
- Variables are upserted: re-running on an existing group updates values instead of creating duplicates.

## Acknowledgments

Color generation is performed by `generateRadixColors`, vendored from the [radix-ui/website](https://github.com/radix-ui/website) repo (MIT, © Radix UI authors). See [`src/plugin/radix/__vendor__.md`](src/plugin/radix/__vendor__.md) for re-vendoring notes.
