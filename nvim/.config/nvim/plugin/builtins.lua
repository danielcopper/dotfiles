-- Optional plugins that ship inside $VIMRUNTIME but are not loaded by default.
-- They live in runtime/pack/dist/opt/, so a plain packadd is all they need --
-- no vim.pack entry, nothing to update, they follow the Nvim version.
--
--   :Undotree  visual navigation of the undo tree
--   :DiffTool  diff two files or two directories
vim.cmd.packadd("nvim.undotree")
vim.cmd.packadd("nvim.difftool")
