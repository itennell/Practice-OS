import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  // Aeon reads aeon/SOUL.md at run time; the tracer can't see a file read, so name it.
  outputFileTracingIncludes: {
    "/api/chat": ["./aeon/SOUL.md"],
    "/api/conversations": ["./aeon/SOUL.md"],
    "/api/menu": ["./aeon/SOUL.md"],
    "/api/cron/reflect": ["./aeon/SOUL.md"],
    "/settings": ["./aeon/SOUL.md"],
  },
  // The Vercel copy runs on Linux: leave out other platforms' onnxruntime builds,
  // the browser build, and the local model cache (Vercel downloads it to /tmp).
  outputFileTracingExcludes: {
    "/*": [
      "./node_modules/onnxruntime-node/bin/napi-v*/darwin/**",
      "./node_modules/onnxruntime-node/bin/napi-v*/win32/**",
      "./node_modules/onnxruntime-web/**",
      "./.cache/**",
    ],
  },
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
