vim.pack.add({ "https://github.com/folke/flash.nvim" })

require("flash").setup({
  modes = {
    -- Keep native `/` and `?` search exactly vanilla (off by default, set for clarity).
    search = { enabled = false },
    -- setup() auto-hooks f/F/t/T/;/, unless disabled — keep those motions vanilla too.
    char = { enabled = false },
  },
})

local flash = require("flash")

-- Trigger via `gs`/`gS` (not `s`) so native `s` (substitute) stays intact.
vim.keymap.set({ "n", "x", "o" }, "gs", function() flash.jump() end, { desc = "Flash jump" })
vim.keymap.set({ "n", "x", "o" }, "gS", function() flash.treesitter() end, { desc = "Flash Treesitter" })
vim.keymap.set("o", "r", function() flash.remote() end, { desc = "Flash remote" })
vim.keymap.set({ "o", "x" }, "R", function() flash.treesitter_search() end, { desc = "Flash Treesitter search" })
