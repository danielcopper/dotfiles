-- WSL-arch-specific wezterm overrides. Loaded by shared wezterm.lua.
-- Applies on the Windows host that points wezterm at this config via WSL.

return function(config, wezterm, act)
  -- Launch WSL as default program when wezterm starts on Windows.
  config.default_prog = { "wsl.exe", "--cd", "~" }

  -- Convert pasted CRLF to LF (Windows-side wezterm pasting into WSL shells).
  config.canonicalize_pasted_newlines = "LineFeed"

  -- Workaround for paste flicker with win32 input mode.
  config.allow_win32_input_mode = false
end
