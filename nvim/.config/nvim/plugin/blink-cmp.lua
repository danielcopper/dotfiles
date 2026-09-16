vim.pack.add({
  "https://github.com/rafamadriz/friendly-snippets",
  { src = "https://github.com/L3MON4D3/LuaSnip", version = vim.version.range("2.x") },
  -- Stays on the 1.x line deliberately. main is v2, which is unreleased: no v2
  -- tag means no pre-built Rust matcher, and building it needs a cargo
  -- toolchain this host does not have. Revisit when v2 is actually tagged --
  -- it then also wants blink.lib as a separate package and LuaSnip unpinned.
  { src = "https://github.com/saghen/blink.cmp", version = vim.version.range("1.x") },
})

require("luasnip.loaders.from_vscode").lazy_load()

local icons = require("icons")
local borders = require("ui").borders

require("blink.cmp").setup({
  keymap = {
    preset = "super-tab",
    ["<CR>"] = { "accept", "fallback" },
    ["<C-y>"] = { "select_and_accept" },
    ["<C-p>"] = { "select_prev", "fallback" },
    ["<C-n>"] = { "select_next", "fallback" },
    ["<C-k>"] = { "select_prev", "fallback" },
    ["<C-j>"] = { "select_next", "fallback" },
    ["<C-b>"] = { "scroll_documentation_up", "fallback" },
    ["<C-f>"] = { "scroll_documentation_down", "fallback" },
    ["<C-Space>"] = { "show", "fallback" },
    ["<C-e>"] = { "cancel", "fallback" },
  },

  appearance = {
    nerd_font_variant = "mono",
    kind_icons = icons.lsp.kinds,
  },

  snippets = { preset = "luasnip" },

  completion = {
    list = {
      selection = { preselect = false, auto_insert = true },
    },
    accept = {
      auto_brackets = { enabled = true },
    },
    documentation = {
      auto_show = true,
      auto_show_delay_ms = 200,
      window = { border = borders },
    },
    ghost_text = { enabled = false },
    menu = {
      border = borders,
      draw = {
        columns = {
          { "label", "label_description", gap = 1 },
          { "kind_icon", "kind", gap = 1 },
        },
      },
    },
  },

  signature = {
    enabled = false, -- noice handles signature help
  },

  sources = {
    default = { "lsp", "path", "snippets", "buffer" },
  },

  fuzzy = { implementation = "prefer_rust_with_warning" },
})
