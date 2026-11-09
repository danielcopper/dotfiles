vim.pack.add({ "https://github.com/stevearc/conform.nvim" })

require("conform").setup({
  formatters_by_ft = {
    lua = { "stylua" },
    python = { "ruff_organize_imports", "ruff_format" },
    javascript = { "prettier" },
    typescript = { "prettier" },
    javascriptreact = { "prettier" },
    typescriptreact = { "prettier" },
    css = { "prettier" },
    html = { "prettier" },
    json = { "prettier" },
    yaml = { "prettier" },
    markdown = { "deno_fmt" },
    c = { "clang-format" },
    bash = { "shfmt" },
    sh = { "shfmt" },
    sql = { "sqlfluff" },
    -- No LSP fallback: Kotlin projects gate on ktlint's format, not kotlin-lsp's.
    kotlin = { "ktlint", lsp_format = "never" },
  },
  -- Set here, not in the format() call, so a filetype's own lsp_format wins.
  default_format_opts = { lsp_format = "fallback" },
  format_on_save = nil,
  formatters = {
    stylua = {
      prepend_args = { "--indent-type", "Spaces", "--indent-width", "2" },
    },
    shfmt = {
      prepend_args = { "-i", "2" },
    },
    -- --stdin-path lets ktlint find the project's .editorconfig, whatever
    -- Neovim's cwd is.
    ktlint = {
      append_args = { "--stdin-path", "$FILENAME" },
    },
    sqlfluff = {
      require_cwd = false,
      args = function(_, ctx)
        local found = vim.fs.find({ ".sqlfluff" }, {
          upward = true,
          path = vim.fs.dirname(ctx.filename),
        })
        if #found > 0 then
          return { "format", "-" }
        end
        return { "format", "--dialect", "sqlite", "-" }
      end,
    },
  },
})

vim.keymap.set({ "n", "v" }, "<leader>cf", function()
  require("conform").format({ async = true })
end, { desc = "Format buffer" })
