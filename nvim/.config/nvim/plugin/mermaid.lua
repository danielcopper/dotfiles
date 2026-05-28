-- View the mermaid block under the cursor by rendering it with mmdc and opening
-- the PNG in the Windows image viewer. In-terminal rendering (image.nvim/kitty,
-- diagram.nvim) is unreliable under WSL — virt_line overlap and screenpos errors
-- — so we sidestep it: mmdc renders the PNG, explorer.exe (via wslpath) opens it.
-- Needs mmdc (mermaid-cli, via mise) + chrome-headless-shell (puppeteer-config.json).
-- Dark theme on a solid dark fill so the standalone image reads well externally.
-- No terminal/graphics gate: opening externally works regardless of terminal.
vim.keymap.set("n", "<leader>md", function()
  local lines = vim.api.nvim_buf_get_lines(0, 0, -1, false)
  local cur = vim.api.nvim_win_get_cursor(0)[1]
  local s
  for i = cur, 1, -1 do
    if lines[i]:match("^%s*```mermaid") then s = i break end
    if i < cur and lines[i]:match("^%s*```") then break end
  end
  if not s then return vim.notify("No mermaid block at cursor", vim.log.levels.WARN) end
  local e
  for i = s + 1, #lines do
    if lines[i]:match("^%s*```%s*$") then e = i break end
  end
  if not e then return vim.notify("Unterminated mermaid block", vim.log.levels.WARN) end

  local mmd, png = vim.fn.tempname() .. ".mmd", vim.fn.tempname() .. ".png"
  vim.fn.writefile(vim.list_slice(lines, s + 1, e - 1), mmd)
  local cfg = vim.fn.stdpath("config") .. "/puppeteer-config.json"
  vim.notify("Rendering diagram…", vim.log.levels.INFO)
  vim.system(
    { "mmdc", "-i", mmd, "-o", png, "-t", "dark", "-b", "#1e1e2e", "-s", "3", "-p", cfg },
    { text = true },
    function(res)
      vim.schedule(function()
        if res.code ~= 0 or vim.fn.filereadable(png) == 0 then
          vim.notify("mmdc failed:\n" .. (res.stderr or res.stdout or ""), vim.log.levels.ERROR)
          return
        end
        local win = vim.trim(vim.fn.system({ "wslpath", "-w", png }))
        vim.system({ "explorer.exe", win }) -- exits non-zero even on success; ignore
      end)
    end
  )
end, { desc = "Render diagram → Windows viewer" })
