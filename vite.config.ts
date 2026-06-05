import { resolve } from "path";
import { defineConfig } from "vite";

export default defineConfig({
  base: "/dream-brush/",
  build: {
    rolldownOptions: {
      input: {
        main: resolve(import.meta.dirname, "index.html"),
        nested: resolve(import.meta.dirname, "player.html"),
      },
    },
  },
});
