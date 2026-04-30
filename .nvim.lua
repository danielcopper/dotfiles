-- Project-local config for the dotfiles repo.
-- Loaded via 'exrc' (:h 'exrc'). First load (and any change to this
-- file) needs `:trust` followed by a restart — :trust does not
-- re-execute the file in the current session.
--
-- Stow packages here are folders whose entire content is dotfiles
-- (bash/.bashrc, git/.gitconfig, …). The default neo-tree filter hides
-- those, making the package folders look empty. Show them in this repo.
--
-- exrc runs before plugin/*.lua, so neo-tree isn't on the runtimepath
-- yet — defer the mutation until VimEnter.
vim.api.nvim_create_autocmd("VimEnter", {
  once = true,
  callback = function()
    local ok, nt = pcall(require, "neo-tree")
    if not ok then return end
    nt.ensure_config()
    nt.config.filesystem.filtered_items.visible = true
  end,
})
