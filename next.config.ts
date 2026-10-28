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
  // Admin replaced Deadlines, Paperwork, How do I and the Dashboard (redesign PR 3); old links keep working.
  async redirects() {
    const tab = (from: string, panel: string) => ({
      source: "/paperwork",
      has: [{ type: "query" as const, key: "tab", value: from }],
      destination: `/admin?panel=${panel}`,
      permanent: false,
    });
    return [
      tab("superbills", "superbill"),
      tab("release", "release"),
      tab("insurance", "insurance"),
      tab("credentialing", "credentialing"),
      { source: "/paperwork", destination: "/admin?panel=gfe", permanent: false },
      { source: "/dashboard", destination: "/admin", permanent: false },
      { source: "/deadlines", destination: "/admin/deadlines", permanent: false },
      { source: "/how-do-i", destination: "/admin/how-do-i", permanent: false },
      { source: "/how-do-i/:slug", destination: "/admin/how-do-i/:slug", permanent: false },
    ];
  },
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
