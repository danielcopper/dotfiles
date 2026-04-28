-- Legacy-config workflow: useFlatConfig=false forces .eslintrc lookup even on
-- ESLint 9+. Flat-config root markers (eslint.config.*) are intentionally
-- omitted — if a repo only has flat config, the legacy lookup would fail anyway.
return {
  cmd = { "vscode-eslint-language-server", "--stdio" },
  filetypes = { "javascript", "javascriptreact", "typescript", "typescriptreact", "vue", "svelte", "astro", "htmlangular" },
  root_markers = { ".eslintrc", ".eslintrc.js", ".eslintrc.json", ".eslintrc.yaml", ".eslintrc.yml" },
  workspace_required = true,
  settings = {
    useFlatConfig = false,
  },
}
