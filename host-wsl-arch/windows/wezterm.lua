-- Windows entry point for wezterm (wsl-arch host).
--
-- NOT stowed: GNU Stow links into the WSL/Linux $HOME, but this file belongs on
-- the Windows side. Deploy manually to %USERPROFILE%\.wezterm.lua and point
-- wezterm at it (once):
--
--   copy this file to  C:\Users\<you>\.wezterm.lua
--   setx WEZTERM_CONFIG_FILE C:\Users\<you>\.wezterm.lua
--
-- Why a stub instead of pointing WEZTERM_CONFIG_FILE straight at the WSL repo:
-- the real config lives in WSL and is reached over \\wsl$, but that share only
-- exists once the archlinux distro is running. wezterm reads its config very
-- early at startup, so a cold launch (after a reboot or `wsl --shutdown`)
-- can't see it yet (os error 3). This stub lives on the always-readable C:
-- drive, tries the shared config first, and falls back to a minimal-but-usable
-- config that still boots into WSL. Once the distro is up, reload
-- (Ctrl+Shift+R) or relaunch to pick up the full config.
local wezterm = require("wezterm")
local shared = [[\\wsl$\archlinux\home\daniel\.config\wezterm\wezterm.lua]]

local ok, cfg = pcall(dofile, shared)
if ok and cfg then
  return cfg
end

wezterm.log_error("wezterm: falling back, could not load " .. shared)
return {
  default_domain = "WSL:archlinux",
  window_decorations = "TITLE | RESIZE",
  color_scheme = "Catppuccin Mocha",
  font = wezterm.font_with_fallback({ "GeistMono Nerd Font", "JetBrainsMono Nerd Font" }),
  font_size = 13,
  enable_tab_bar = false,
  window_background_opacity = 0.95,
}
