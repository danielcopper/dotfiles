vim.pack.add({
  "https://github.com/williamboman/mason.nvim",
  "https://github.com/WhoIsSethDaniel/mason-tool-installer.nvim",
})

local icons = require("icons")
local borders = require("ui").borders

require("mason").setup({
  ui = {
    border = borders,
    icons = {
      package_installed = icons.ui.check,
      package_pending = icons.ui.spinner,
      package_uninstalled = icons.ui.close,
    },
  },
  registries = {
    "github:mason-org/mason-registry",
    "github:crashdummyy/mason-registry",
  },
})

require("mason-tool-installer").setup({
  ensure_installed = {
    -- Lua
    "lua-language-server",
    "stylua",

    -- TypeScript/JavaScript
    "typescript-language-server",
    "angular-language-server",
    "eslint-lsp",
    "prettier",

    -- HTML/CSS/Web
    "html-lsp",
    "css-lsp",
    "emmet-language-server",

    -- JSON/YAML
    "json-lsp",
    "yaml-language-server",
    "azure-pipelines-language-server",
    "jsonlint",
    "yamllint",

    -- Markdown
    "markdown-oxide",
    "markdownlint",

    -- Python
    "basedpyright",
    "ruff",
    "debugpy",

    -- Bash/Shell
    "bash-language-server",
    "shfmt",
    "shellcheck",

    -- Docker
    "dockerfile-language-server",
    "hadolint",

    -- XML
    "lemminx",

    -- PowerShell
    "powershell-editor-services",

    -- SQL
    "sqlfluff",

    -- C#
    "roslyn",

    -- Java
    "jdtls",

    -- DAP Adapters
    "netcoredbg",

    -- Code Analysis
    "sonarlint-language-server",
  },

  -- run_on_start=false: don't reach for the registry every nvim launch. Trigger
  -- explicitly via :MasonToolsInstall (or :Mason UI) after editing the list.
  auto_update = false,
  run_on_start = false,
})

vim.keymap.set("n", "<leader>tm", "<cmd>Mason<cr>", { desc = "Mason" })
