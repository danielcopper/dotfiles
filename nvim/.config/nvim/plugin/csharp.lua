vim.pack.add({
  "https://github.com/seblyng/roslyn.nvim",
  "https://github.com/khoido2003/roslyn-filewatch.nvim",
})

-- roslyn-filewatch ships an optional native Rust scanner (much faster full scans than the fd/Lua
-- fallback). vim.pack has no per-spec build step, so build it via PackChanged on install/update.
vim.api.nvim_create_autocmd("PackChanged", {
  desc = "Build roslyn-filewatch's native Rust module",
  callback = function(args)
    local d = args.data or {}
    local path = d.path or (d.spec and d.spec.path) or ""
    local is_fw = path:find("roslyn-filewatch.nvim", 1, true) ~= nil
      or (d.spec and d.spec.name == "roslyn-filewatch.nvim")
    if is_fw and (d.kind == "install" or d.kind == "update") then
      local build = path ~= "" and (path .. "/build.lua")
        or (vim.fn.stdpath("data") .. "/site/pack/core/opt/roslyn-filewatch.nvim/build.lua")
      if vim.fn.filereadable(build) == 1 then
        vim.notify("[roslyn-filewatch] building native Rust module…", vim.log.levels.INFO)
        pcall(dofile, build)
      end
    end
  end,
})

-- Worktree-aware solution chooser for roslyn.nvim
local function choose_target(targets)
  if #targets == 0 then
    return nil
  end
  if #targets == 1 then
    return targets[1]
  end

  local root = vim.fs.root(0, ".git")
  if root then
    local git_path = root .. "/.git"
    local is_worktree = vim.fn.isdirectory(git_path) == 0 and vim.fn.filereadable(git_path) == 1
    local local_targets
    if is_worktree then
      local_targets = vim.iter(targets):filter(function(t)
        return t:find(root, 1, true) ~= nil
      end):totable()
    else
      local_targets = vim.iter(targets):filter(function(t)
        return t:find("/.worktrees/", 1, true) == nil
      end):totable()
    end
    if #local_targets > 0 then
      targets = local_targets
    end
  end
  if #targets == 1 then
    return targets[1]
  end

  local slnx = vim.iter(targets):filter(function(t) return t:match("%.slnx$") end):totable()
  local sln = vim.iter(targets):filter(function(t) return t:match("%.sln$") end):totable()
  local slnf = vim.iter(targets):filter(function(t) return t:match("%.slnf$") end):totable()

  if #slnx == 1 then return slnx[1]
  elseif #slnx > 1 then return nil end

  if #sln == 1 then return sln[1]
  elseif #sln > 1 then return nil end

  if #slnf == 1 then return slnf[1] end

  return nil
end

-- Configure LSP settings for roslyn
vim.lsp.config("roslyn", {
  root_dir = function(bufnr, on_dir)
    local cfg = require("roslyn.config").get()
    if cfg.lock_target and vim.g.roslyn_nvim_selected_solution then
      on_dir(vim.fs.dirname(vim.g.roslyn_nvim_selected_solution))
      return
    end
    local root = require("roslyn.sln.utils").root_dir(bufnr)
    if root then
      on_dir(root)
    end
  end,
  handlers = {
    ["$/progress"] = function(err, result, ctx, config)
      if result and result.value and not result.token then
        result.token = "roslyn-progress"
      end
      vim.lsp.handlers["$/progress"](err, result, ctx, config)
    end,
  },
  on_attach = function(client, bufnr)
    vim.keymap.set("n", "<leader>ct", "<cmd>Roslyn target<cr>", { buffer = bufnr, desc = "Select target framework" })
  end,
  settings = {
    ["csharp|inlay_hints"] = {
      csharp_enable_inlay_hints_for_implicit_object_creation = true,
      csharp_enable_inlay_hints_for_implicit_variable_types = true,
      csharp_enable_inlay_hints_for_lambda_parameter_types = true,
      csharp_enable_inlay_hints_for_types = true,
      dotnet_enable_inlay_hints_for_indexer_parameters = true,
      dotnet_enable_inlay_hints_for_literal_parameters = true,
      dotnet_enable_inlay_hints_for_object_creation_parameters = true,
      dotnet_enable_inlay_hints_for_other_parameters = true,
      dotnet_enable_inlay_hints_for_parameters = true,
      dotnet_suppress_inlay_hints_for_parameters_that_differ_only_by_suffix = true,
      dotnet_suppress_inlay_hints_for_parameters_that_match_argument_name = true,
      dotnet_suppress_inlay_hints_for_parameters_that_match_method_intent = true,
    },
    ["csharp|code_lens"] = {
      dotnet_enable_references_code_lens = true,
    },
  },
})

require("roslyn").setup({
  -- broad_search walks the whole git tree synchronously (skipping only obj/bin/.git),
  -- so it scans all of .worktrees/ on every LSP start and blocks file open by 15+s.
  -- Upward search finds the correct solution in both the main repo and worktrees.
  broad_search = false,
  lock_target = true,
  choose_target = choose_target,
  filewatching = "off",
})

require("roslyn_filewatch").setup({
  -- Poll instead of event-watching: watchman's adapter rejects >1 root, but solution_aware yields
  -- 12 roots (our .slnx) -> endless recovery loop; libuv fs_event is non-recursive on Linux (warns
  -- every restart). The fs-poller runs under every backend anyway, so this just drops the broken
  -- event layer. Cheap now via the native Rust scanner; solution_aware stays on.
  force_polling = true,
  ignore_dirs = {
    ".worktrees",
    "node_modules",
    "obj", "Obj",
    "bin", "Bin",
    "Build", "Builds",
    "packages",
    "TestResults",
    ".git", ".idea", ".vs", ".vscode",
  },
})
