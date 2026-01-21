// Strip a single problematic declaration that causes noisy console warnings
// in some browsers (e.g. Firefox) while keeping Tailwind preflight enabled.
const stripWebkitTextSizeAdjust = {
  postcssPlugin: "visio360-strip-webkit-text-size-adjust",
  Declaration(decl) {
    if (decl.prop === "-webkit-text-size-adjust") decl.remove();
  },
};

// Avoid eslint warning: import/no-anonymous-default-export
const postcssConfig = {
  // IMPORTANT: keep Tailwind as a string plugin reference so Turbopack doesn't try
  // to bundle Tailwind's native deps into ESM chunks during the build.
  plugins: [["@tailwindcss/postcss", {}], stripWebkitTextSizeAdjust],
}

export default postcssConfig
