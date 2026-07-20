vim.pack.add({ "https://github.com/b0o/schemastore.nvim" })

local icons = require("icons")
local borders = require("ui").borders

-- Diagnostics
vim.diagnostic.config({
  signs = {
    text = {
      [vim.diagnostic.severity.ERROR] = icons.diagnostics.error,
      [vim.diagnostic.severity.WARN] = icons.diagnostics.warn,
      [vim.diagnostic.severity.INFO] = icons.diagnostics.info,
      [vim.diagnostic.severity.HINT] = icons.diagnostics.hint,
    },
  },
  float = {
    source = true,
    border = borders,
  },
  update_in_insert = true,
  underline = true,
  severity_sort = true,
  virtual_text = false,
  virtual_lines = {
    current_line = true,
  },
})

-- Hide virtual_lines while typing — they shift content around.
-- Signs + underline still update live (update_in_insert = true).
local diag_insert = vim.api.nvim_create_augroup("user_diag_insert", { clear = true })
vim.api.nvim_create_autocmd("InsertEnter", {
  group = diag_insert,
  callback = function() vim.diagnostic.config({ virtual_lines = false }) end,
})
vim.api.nvim_create_autocmd("InsertLeave", {
  group = diag_insert,
  callback = function()
    vim.diagnostic.config({ virtual_lines = { current_line = true } })
  end,
})

-- Default capabilities for all LSP servers
local capabilities = vim.lsp.protocol.make_client_capabilities()
local has_blink, blink = pcall(require, "blink.cmp")
if has_blink then
  capabilities = blink.get_lsp_capabilities(capabilities)
end
capabilities.workspace = capabilities.workspace or {}
capabilities.workspace.didChangeWatchedFiles = { dynamicRegistration = true }

vim.lsp.config("*", { capabilities = capabilities })

-- Enable LSP servers (configs auto-discovered from lsp/ directory)
vim.lsp.enable({
  "angularls",
  "azure_pipelines_ls",
  "basedpyright",
  "bashls",
  "clangd",
  "cssls",
  "dockerls",
  "emmet_language_server",
  "eslint",
  "html",
  "jsonls",
  "lemminx",
  "lua_ls",
  "markdown_oxide",
  "powershell_es",
  "ts_ls",
  "yamlls",
})

local lsp_state = require("lsp_state")

-- :LspRestart [name] — restart the active clients (or just the named one).
-- The native lsp/ config flow has no built-in restart command. Managed clients
-- (those with a vim.lsp.config entry) are bounced via the enable toggle, which
-- re-attaches them to the open buffers (same mechanism worktree.lua uses);
-- unmanaged clients (jdtls, roslyn, sonarlint) are just stopped — their own
-- plumbing restarts them on the next buffer event.
vim.api.nvim_create_user_command("LspRestart", function(opts)
  local names = {}
  for _, client in ipairs(vim.lsp.get_clients()) do
    if opts.args == "" or client.name == opts.args then
      names[client.name] = true
    end
  end
  for name in pairs(names) do
    if vim.lsp.config[name] ~= nil then
      vim.lsp.enable(name, false)
    else
      for _, client in ipairs(vim.lsp.get_clients({ name = name })) do
        client:stop()
      end
    end
  end
  vim.defer_fn(function()
    for name in pairs(names) do
      if vim.lsp.config[name] ~= nil then
        vim.lsp.enable(name)
      end
    end
  end, 100)
end, {
  nargs = "?",
  complete = function()
    local seen = {}
    for _, client in ipairs(vim.lsp.get_clients()) do
      seen[client.name] = true
    end
    return vim.tbl_keys(seen)
  end,
  desc = "Restart active LSP clients (optionally a single named one)",
})

vim.api.nvim_create_autocmd("LspProgress", {
  callback = function(ev)
    if ev.data.params.value.kind == "end" then
      lsp_state.busy[ev.data.client_id] = nil
    else
      lsp_state.busy[ev.data.client_id] = true
    end
    vim.cmd.redrawstatus()
  end,
})

-- Clear busy state if a client detaches/crashes (prevents stale spinner)
vim.api.nvim_create_autocmd("LspDetach", {
  callback = function(args)
    lsp_state.busy[args.data.client_id] = nil
    vim.cmd.redrawstatus()
  end,
})

-- LSP keymaps (buffer-local, only active after LspAttach)
vim.api.nvim_create_autocmd("LspAttach", {
  group = vim.api.nvim_create_augroup("config_lsp_attach", { clear = true }),
  callback = function(args)
    local bufnr = args.buf
    local client = vim.lsp.get_client_by_id(args.data.client_id)

    local map = function(mode, lhs, rhs, desc)
      vim.keymap.set(mode, lhs, rhs, { buffer = bufnr, desc = desc })
    end

    -- Telescope integrations (better UI for references, definitions, etc.)
    if pcall(require, "telescope.builtin") then
      map("n", "gd", "<cmd>Telescope lsp_definitions<cr>", "Go to definition")
      map("n", "gr", "<cmd>Telescope lsp_references<cr>", "Show references")
      map("n", "gi", "<cmd>Telescope lsp_implementations<cr>", "Go to implementation")
      map("n", "gD", "<cmd>Telescope lsp_type_definitions<cr>", "Go to type definition")
    end

    if client and client:supports_method("textDocument/codeAction", { bufnr = bufnr }) then
      map("n", "<leader>ca", vim.lsp.buf.code_action, "Code action")
    end
    if client and client:supports_method("textDocument/rename", { bufnr = bufnr }) then
      map("n", "<leader>cr", vim.lsp.buf.rename, "Rename symbol")
    end
    map("n", "[d", function() vim.diagnostic.jump({ count = -1 }) end, "Previous diagnostic")
    map("n", "]d", function() vim.diagnostic.jump({ count = 1 }) end, "Next diagnostic")

    -- Inlay hints (if supported)
    if client and client:supports_method("textDocument/inlayHint", { bufnr = bufnr }) then
      map("n", "<leader>uh", function()
        vim.lsp.inlay_hint.enable(not vim.lsp.inlay_hint.is_enabled({ bufnr = bufnr }))
      end, "Toggle inlay hints")
    end
  end,
})

vim.api.nvim_create_user_command("LspInfo", function()
  vim.cmd("checkhealth vim.lsp")
end, { desc = "Show LSP health (alias for :checkhealth vim.lsp)" })
