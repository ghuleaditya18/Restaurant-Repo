import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import { readFileSync } from "node:fs";

const branding = JSON.parse(
  readFileSync(new URL("../shared/app_branding.json", import.meta.url), "utf8"),
);

const brandingPlugin = {
  name: "newaraai-html-branding",
  transformIndexHtml(html) {
    return html.replace(
      /<title>.*?<\/title>/,
      `<title>${branding.product_name} | Unified Resort Management</title>`,
    );
  },
};

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), brandingPlugin],
});
