# Vendored: generateRadixColors

`generateRadixColors.ts` is copied verbatim (modulo extension rename and the
attribution header at the top of the file) from the radix-ui/website repo.

- Source: https://github.com/radix-ui/website/blob/main/components/generateRadixColors.tsx
- License: MIT (Radix UI authors)
- Local snapshot taken from: `/Users/boo/Documents/GitHub/website-main/components/generateRadixColors.tsx`
- File is pure TypeScript (no JSX) despite the `.tsx` extension upstream.

## Re-vendoring

To pull a fresher version:

1. Replace `generateRadixColors.ts` with the upstream file (rename `.tsx` -> `.ts`).
2. Re-add the attribution header at the top of the file.
3. Run `pnpm typecheck` and the parity tests against radix-ui.com/colors/custom.

Do not modify the algorithm in this file. All huemanize-specific behavior lives
in `index.ts`.
