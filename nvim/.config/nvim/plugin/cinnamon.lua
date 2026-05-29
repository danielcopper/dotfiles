vim.pack.add({ "https://github.com/declancm/cinnamon.nvim" })

local cinnamon = require("cinnamon")

cinnamon.setup({
  options = {
    delay = 3,
    max_delta = {
      time = 100,
    },
  },
  keymaps = {
    basic = false,
    extra = false,
  },
})

-- Centered page scrolling. We center via the post-scroll `callback` instead of
-- appending `zz` to the command string. Embedding `zz` makes centering part of
-- cinnamon's *animated target* — if the animation gets stopped early (cinnamon's
-- stop() doesn't snap to target), the centering is lost: the view strands at
-- scrolloff-top and `zz` appears to do nothing. The callback runs `zz` once the
-- scroll settles, so the final position is centered regardless of the animation.
--
-- If centering still misbehaves in practice, replace `scroll("<C-d>")` with a
-- plain native mapping `"<C-d>zz"` (one line each) — that drops the smooth
-- animation on these four keys but is bullet-proof.
local function scroll(keys)
  return function()
    cinnamon.scroll(keys, { callback = function() vim.cmd("normal! zz") end })
  end
end
vim.keymap.set("n", "<C-d>", scroll("<C-d>"), { desc = "Scroll half-page down (centered)" })
vim.keymap.set("n", "<C-u>", scroll("<C-u>"), { desc = "Scroll half-page up (centered)" })
vim.keymap.set("n", "<C-f>", scroll("<C-f>"), { desc = "Page down (centered)" })
vim.keymap.set("n", "<C-b>", scroll("<C-b>"), { desc = "Page up (centered)" })
