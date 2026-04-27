local wezterm = require("wezterm")
local act = wezterm.action

---------------------------------------------------------
--                     Functions                       --
---------------------------------------------------------
local get_last_folder_segment = function(cwd)
  if cwd == nil then
    return "N/A"
  end
  local pathStripped = cwd:match("^file:///(.+)") or cwd
  pathStripped = pathStripped:gsub("\\", "/")
  local path = {}
  for segment in string.gmatch(pathStripped, "[^/]+") do
    table.insert(path, segment)
  end
  return path[#path]
end

local function get_current_working_dir(tab)
  return get_last_folder_segment(tab.active_pane.current_working_dir or '')
end

---------------------------------------------------------
--                   Config Setup                      --
---------------------------------------------------------
local config = {}
if wezterm.config_builder then
  config = wezterm.config_builder()
end

---------------------------------------------------------
--                         UI                          --
---------------------------------------------------------
config.color_scheme = "Catppuccin Mocha"

-- Font: GeistMono Nerd Font preferred, JetBrains as fallback if Geist
-- isn't installed on a host (only Geist needs to be added per-host;
-- JetBrains is in the shared package list).
config.font = wezterm.font_with_fallback {
  "GeistMono Nerd Font",
  "JetBrainsMono Nerd Font",
}
config.font_rules = {}
config.font_size = 13

-- Window
config.window_background_opacity = 0.95
config.window_decorations = "RESIZE"
config.window_close_confirmation = "AlwaysPrompt"
config.window_padding = {
  top = 5,
  right = 5,
  bottom = 0,
  left = 5,
}

-- General
config.scrollback_lines = 10000
config.max_fps = 165
config.enable_kitty_keyboard = true

-- Tab / status bar
config.hide_tab_bar_if_only_one_tab = true
config.status_update_interval = 1000
config.tab_max_width = 60
config.tab_bar_at_bottom = false

wezterm.on('format-tab-title', function(tab, tabs, panes, cfg, hover, max_width)
  local is_zoomed = false
  for _, pane in ipairs(tab.panes) do
    if pane.is_zoomed then is_zoomed = true end
  end
  local cwd = get_current_working_dir(tab)
  local zoom_icon = is_zoomed and wezterm.nerdfonts.cod_zoom_in or ""
  local title = string.format(' %s %s ', cwd, zoom_icon)
  return wezterm.format({
    { Attribute = { Intensity = 'Bold' } },
    { Text = title },
  })
end)

wezterm.on("update-right-status", function(window, pane)
  local palette = window:effective_config().resolved_palette
  local fg = palette.foreground
  local accent = palette.ansi[4]

  local workspace_or_leader = window:active_workspace()
  if window:active_key_table() then workspace_or_leader = window:active_key_table() end
  if window:leader_is_active() then workspace_or_leader = "LEADER" end

  local time = wezterm.strftime("%H:%M")

  window:set_right_status(wezterm.format({
    { Foreground = { Color = accent } }, { Text = wezterm.nerdfonts.oct_table .. " " },
    { Foreground = { Color = fg } },     { Text = workspace_or_leader .. "  " },
    { Foreground = { Color = accent } }, { Text = wezterm.nerdfonts.md_clock .. " " },
    { Foreground = { Color = fg } },     { Text = time .. " " },
  }))
end)

config.inactive_pane_hsb = {
  saturation = 0.4,
  brightness = 0.5,
}

---------------------------------------------------------
--                     Keymaps                         --
---------------------------------------------------------
config.leader = { key = "Space", mods = "SHIFT", timeout_milliseconds = 3000 }
config.keys = {
  -- Clipboard
  { key = "c", mods = "CTRL|SHIFT", action = act.CopyTo("Clipboard") },
  { key = "v", mods = "CTRL|SHIFT", action = act.PasteFrom("Clipboard") },

  -- Copy mode (vim-style navigation outside tmux)
  { key = "Escape", mods = "LEADER", action = act.ActivateCopyMode },

  -- Panes
  { key = "-", mods = "LEADER", action = act.SplitVertical { domain = "CurrentPaneDomain" } },
  { key = "|", mods = "LEADER", action = act.SplitHorizontal { domain = "CurrentPaneDomain" } },
  { key = "h", mods = "LEADER", action = act.ActivatePaneDirection("Left") },
  { key = "j", mods = "LEADER", action = act.ActivatePaneDirection("Down") },
  { key = "k", mods = "LEADER", action = act.ActivatePaneDirection("Up") },
  { key = "l", mods = "LEADER", action = act.ActivatePaneDirection("Right") },
  { key = "x", mods = "LEADER", action = act.CloseCurrentPane { confirm = true } },
  { key = "z", mods = "LEADER", action = act.TogglePaneZoomState },
  { key = "s", mods = "LEADER", action = act.RotatePanes "Clockwise" },
  { key = "r", mods = "ALT",    action = act.ActivateKeyTable { name = "resize_pane", one_shot = false } },

  -- Tabs
  { key = "c", mods = "LEADER", action = act.SpawnTab("CurrentPaneDomain") },
  { key = "n", mods = "LEADER", action = act.ActivateTabRelative(1) },
  { key = "p", mods = "LEADER", action = act.ActivateTabRelative(-1) },
  { key = "t", mods = "LEADER", action = act.ShowTabNavigator },
  { key = "m", mods = "LEADER", action = act.ActivateKeyTable { name = "move_tab", one_shot = false } },

  -- Workspaces
  { key = "w", mods = "LEADER", action = act.ShowLauncherArgs { flags = "FUZZY|WORKSPACES" } },
  {
    key = 'W',
    mods = 'LEADER',
    action = act.PromptInputLine {
      description = wezterm.format {
        { Attribute = { Intensity = 'Bold' } },
        { Foreground = { AnsiColor = 'Fuchsia' } },
        { Text = 'Enter name for new workspace' },
      },
      action = wezterm.action_callback(function(window, pane, line)
        if line then
          window:perform_action(act.SwitchToWorkspace { name = line }, pane)
        end
      end),
    },
  },
}

-- Quick tab movement
for i = 1, 9 do
  table.insert(config.keys, {
    key = tostring(i),
    mods = "LEADER",
    action = act.ActivateTab(i - 1),
  })
end

config.key_tables = {
  resize_pane = {
    { key = "h",      action = act.AdjustPaneSize { "Left", 1 } },
    { key = "j",      action = act.AdjustPaneSize { "Down", 1 } },
    { key = "k",      action = act.AdjustPaneSize { "Up", 1 } },
    { key = "l",      action = act.AdjustPaneSize { "Right", 1 } },
    { key = "Escape", action = "PopKeyTable" },
    { key = "Enter",  action = "PopKeyTable" },
  },
  move_tab = {
    { key = "h",      action = act.MoveTabRelative(-1) },
    { key = "j",      action = act.MoveTabRelative(-1) },
    { key = "k",      action = act.MoveTabRelative(1) },
    { key = "l",      action = act.MoveTabRelative(1) },
    { key = "Escape", action = "PopKeyTable" },
    { key = "Enter",  action = "PopKeyTable" },
  },
}

---------------------------------------------------------
--                  Per-host overrides                 --
---------------------------------------------------------
-- Loads ~/.config/wezterm/wezterm.local.lua if present. The local file
-- should return a function(config, wezterm, act) that mutates config.
-- Use it for per-host tweaks (auto-maximize on a deck, WSL paste fixes,
-- different font_size for high-DPI displays, …).
local local_path = wezterm.home_dir .. "/.config/wezterm/wezterm.local.lua"
local f = io.open(local_path)
if f then
  f:close()
  local apply = dofile(local_path)
  if type(apply) == "function" then
    apply(config, wezterm, act)
  end
end

return config
