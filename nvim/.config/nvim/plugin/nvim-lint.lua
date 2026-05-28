vim.pack.add({ "https://github.com/mfussenegger/nvim-lint" })

local lint = require("lint")

lint.linters_by_ft = {
  python = { "ruff" },
  markdown = { "markdownlint" },
  yaml = { "yamllint" },
  json = { "jsonlint" },
  sh = { "shellcheck" },
  bash = { "shellcheck" },
  dockerfile = { "hadolint" },
  sql = { "sqlfluff" },
}

local sqlfluff_default = { "lint", "--format=json", "--dialect=sqlite", "-" }
local sqlfluff_project = { "lint", "--format=json", "-" }
lint.linters.sqlfluff.args = sqlfluff_default

lint.linters.yamllint.args = {
  "--format", "parsable",
  "-d", "{extends: default, rules: {line-length: disable}}",
  "-",
}

-- markdownlint reads from stdin, so it can't auto-discover configs by
-- walking up from the file. Inject --config ourselves: project config
-- if found upward, else the global ~/.markdownlint.json.
local md_global = vim.fn.expand("~/.markdownlint.json")
local md_stdin_only = { "--stdin" }
local md_default = vim.fn.filereadable(md_global) == 1
    and { "--stdin", "--config", md_global }
    or md_stdin_only
lint.linters.markdownlint.args = md_default

local lint_augroup = vim.api.nvim_create_augroup("nvim_lint", { clear = true })

local function run_lint(buf)
  if not vim.api.nvim_buf_is_valid(buf) then return end
  local ft = vim.bo[buf].filetype
  if not lint.linters_by_ft[ft] then return end

  if ft == "sql" then
    local dir = vim.fs.dirname(vim.api.nvim_buf_get_name(buf))
    if dir == "" then dir = vim.fn.getcwd() end
    local has_cfg = #vim.fs.find({ ".sqlfluff" }, { upward = true, path = dir }) > 0
    lint.linters.sqlfluff.args = has_cfg and sqlfluff_project or sqlfluff_default
  end
  if ft == "markdown" then
    local dir = vim.fs.dirname(vim.api.nvim_buf_get_name(buf))
    if dir == "" then dir = vim.fn.getcwd() end
    local found = vim.fs.find(
      { ".markdownlint.jsonc", ".markdownlint.json", ".markdownlint.yaml", ".markdownlint.yml" },
      { upward = true, path = dir }
    )
    lint.linters.markdownlint.args = #found > 0
        and { "--stdin", "--config", found[1] }
        or md_default
  end

  vim.api.nvim_buf_call(buf, function() lint.try_lint() end)
end

-- Debounce live linting so shellcheck/sqlfluff don't spawn a process
-- on every keystroke. 300ms feels responsive without thrashing.
local timer = assert(vim.uv.new_timer())
local DEBOUNCE_MS = 300

vim.api.nvim_create_autocmd({
  "BufWritePost", "BufReadPost", "BufEnter", "TextChanged", "TextChangedI",
}, {
  group = lint_augroup,
  callback = function(ev)
    local buf = ev.buf
    timer:stop()
    timer:start(DEBOUNCE_MS, 0, vim.schedule_wrap(function()
      run_lint(buf)
    end))
  end,
})

vim.api.nvim_create_user_command("Lint", function()
  run_lint(vim.api.nvim_get_current_buf())
end, { desc = "Trigger linting for current file" })
