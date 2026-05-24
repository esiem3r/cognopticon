import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

export default defineConfig(({ mode }) => {
  const publicStaticDemo = mode === "pages";
  return {
    plugins: [react()],
    define: {
      __COGNOPTICON_PUBLIC_DEMO__: JSON.stringify(publicStaticDemo)
    },
    resolve: {
      alias: publicStaticDemo
        ? [
            { find: /.*\/services\/daemonClient$/, replacement: fileURLToPath(new URL("./src/services/daemonClient.public.ts", import.meta.url)) },
            { find: /.*\/lib\/workspace$/, replacement: fileURLToPath(new URL("./src/lib/workspace.public.ts", import.meta.url)) }
          ]
        : []
    },
    build: {
      chunkSizeWarningLimit: 650,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes("node_modules")) return;
            if (id.includes("/three/")) return "vendor-three";
            if (id.includes("/react/") || id.includes("/react-dom/") || id.includes("/scheduler/")) return "vendor-react";
            if (id.includes("/lucide-react/")) return "vendor-icons";
            return "vendor";
          }
        }
      }
    },
    server: {
      host: "127.0.0.1",
      port: 5173
    }
  };
});
