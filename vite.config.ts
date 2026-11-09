import { defineConfig } from "vite";
export default defineConfig({
  server: { hmr: { port: Number(process.env.PORT || 3000) + 21678 } },
  build: {
    rollupOptions: {
      output: {
        manualChunks: { three: ["three"], network: ["socket.io-client"] },
      },
    },
  },
});
