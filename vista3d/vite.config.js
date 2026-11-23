import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import babel from "@rolldown/plugin-babel";

// babel-plugin-reactylon registra solo le classi Babylon usate nel JSX (tree shaking)
export default defineConfig({
  base: "./",
  plugins: [babel({ include: /src[\\/].*\.jsx$/, plugins: ["babel-plugin-reactylon"] }), react()],
  server: { fs: { allow: [".."] } },
  build: { outDir: "dist", chunkSizeWarningLimit: 4000 }
});
