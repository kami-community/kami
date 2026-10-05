# Kami launch video

A [Remotion](https://www.remotion.dev/) project for Kami's product montage. It is independent of the app: nothing in `web/` imports it, and it has its own dependencies.

```bash
cd video
npm install
npm run dev      # Remotion Studio
npm run render   # writes out/montage.mp4
```

Scenes live in `src/scenes.tsx`; shared colours and fonts in `src/theme.ts` follow the app's design tokens.
