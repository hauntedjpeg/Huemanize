# Huemanize

Generate a perceptual color scale from a hex color.

## How it works

1. Paste a hex color.
2. Set the anchor step to tell the plugin where your input color sits in the scale.
3. Name the color and choose a variable collection.
4. Click **Add to Variables**.

To update an existing color group, switch to **Update** mode, pick the group, and click **Update Variables**.

## Details

- Scales are built in the OKLCH color space, so lightness steps are perceptually even.
- Variables are upserted: re-running on an existing group updates values instead of creating duplicates.
