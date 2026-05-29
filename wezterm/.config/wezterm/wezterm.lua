-- One wezterm config for every host. The Windows build reads this same file
-- over \\wsl$ via WEZTERM_CONFIG_FILE; the native arch/steamdeck builds read
-- it straight from ~/.config/wezterm. Per-OS bits branch on target_triple
-- (NOT home_dir: the Windows build's home_dir is the Windows profile, not
-- this WSL home).
--
-- tmux owns multiplexing and the status line; wezterm is a lean window host.

local wezterm = require("wezterm")
local act = wezterm.action

local config = {}
if wezterm.config_builder then
  config = wezterm.config_builder()
end

---------------------------------------------------------
--                         UI                          --
---------------------------------------------------------
config.color_scheme = "Catppuccin Mocha"

-- GeistMono preferred (ligatures, on by default), JetBrains as fallback on
-- hosts without Geist (JetBrains is in the shared package list).
config.font = wezterm.font_with_fallback {
  "GeistMono Nerd Font",
  "JetBrainsMono Nerd Font",
}
config.font_size = 13

-- Native OS window decorations — a real titlebar, like every other app.
config.window_decorations = "TITLE | RESIZE"
config.window_background_opacity = 0.95
config.window_close_confirmation = "AlwaysPrompt"
config.window_padding = {
  top = 5,
  right = 5,
  bottom = 0,
  left = 5,
}

-- No wezterm tab bar — tmux draws its own status line.
config.enable_tab_bar = false

config.scrollback_lines = 10000
config.max_fps = 165
config.enable_kitty_keyboard = true

-- Start maximized.
wezterm.on("gui-startup", function(cmd)
  local _, _, window = wezterm.mux.spawn_window(cmd or {})
  window:gui_window():maximize()
end)

---------------------------------------------------------
--                     Keymaps                         --
---------------------------------------------------------
-- Multiplexing lives in tmux. wezterm keeps only clipboard essentials.
-- CTRL+V is deliberately left unbound so it passes through to the running
-- program (e.g. image paste in TUIs like Claude Code).
config.keys = {
  { key = "c", mods = "CTRL|SHIFT", action = act.CopyTo("Clipboard") },
  { key = "v", mods = "CTRL|SHIFT", action = act.PasteFrom("Clipboard") },

  -- Shift+Enter -> newline. TUIs like Claude Code treat LF (Ctrl+J) as
  -- "insert newline" and CR (Enter) as "submit". The kitty-protocol Shift+Enter
  -- doesn't survive the trip through tmux, so send LF explicitly -- the same
  -- byte Ctrl+J sends, which is known to work.
  { key = "Enter", mods = "SHIFT", action = act.SendString("\n") },
}

---------------------------------------------------------
--                   Per-OS overrides                  --
---------------------------------------------------------
if wezterm.target_triple:find("windows") then
  -- Windows host launching straight into WSL/Arch.
  config.default_domain = "WSL:archlinux"
  config.canonicalize_pasted_newlines = "LineFeed" -- CRLF -> LF into WSL shells
  config.allow_win32_input_mode = false            -- avoids paste flicker
end

return config
