// Files imported as text in tests (Vite's ?raw)
declare module "*?raw" {
  const text: string;
  export default text;
}

// Files of a folder imported as text (Vite's import.meta.glob with ?raw), by their path
interface ImportMeta {
  glob(pattern: string | readonly string[], options: { readonly query: "?raw"; readonly import: "default"; readonly eager: true }): Record<string, string>;
}
