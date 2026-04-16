local wezterm = require("wezterm")
local act = wezterm.action

---------------------------------------------------------
--                      Plugins                        --
---------------------------------------------------------
-- For Keybindings check the Keymaps section

-- auto update plugins
wezterm.plugin.update_all()

---------------------------------------------------------
--                     Functions                       --
---------------------------------------------------------
local get_last_folder_segment = function(cwd)
  if cwd == nil then
    return "N/A" -- or some default value you prefer
  end

  -- Strip off 'file:///' if present
  local pathStripped = cwd:match("^file:///(.+)") or cwd
  -- Normalize backslashes to slashes for Windows paths
  pathStripped = pathStripped:gsub("\\", "/")
  -- Split the path by '/'
  local path = {}
  for segment in string.gmatch(pathStripped, "[^/]+") do
    table.insert(path, segment)
  end
  return path[#path] -- returns the last segment
end

local function get_current_working_dir(tab)
  local current_dir = tab.active_pane.current_working_dir or ''
  return get_last_folder_segment(current_dir)
end

local process_icons = {
  ['docker'] = wezterm.nerdfonts.linux_docker,
  ['docker-compose'] = wezterm.nerdfonts.linux_docker,
  ['psql'] = wezterm.nerdfonts.dev_postgresql,
  ['kuberlr'] = wezterm.nerdfonts.linux_docker,
  ['kubectl'] = wezterm.nerdfonts.linux_docker,
  ['stern'] = wezterm.nerdfonts.linux_docker,
  ['nvim'] = wezterm.nerdfonts.custom_vim,
  ['make'] = wezterm.nerdfonts.seti_makefile,
  ['vim'] = wezterm.nerdfonts.dev_vim,
  ['go'] = wezterm.nerdfonts.seti_go,
  ['zsh'] = wezterm.nerdfonts.dev_terminal,
  ['bash'] = wezterm.nerdfonts.cod_terminal_bash,
  ['btm'] = wezterm.nerdfonts.mdi_chart_donut_variant,
  ['htop'] = wezterm.nerdfonts.mdi_chart_donut_variant,
  ['cargo'] = wezterm.nerdfonts.dev_rust,
  ['sudo'] = wezterm.nerdfonts.fa_hashtag,
  ['lazydocker'] = wezterm.nerdfonts.linux_docker,
  ['git'] = wezterm.nerdfonts.dev_git,
  ['lua'] = wezterm.nerdfonts.seti_lua,
  ['wget'] = wezterm.nerdfonts.mdi_arrow_down_box,
  ['curl'] = wezterm.nerdfonts.mdi_flattr,
  ['gh'] = wezterm.nerdfonts.dev_github_badge,
  ['ruby'] = wezterm.nerdfonts.cod_ruby,
  ['pwsh'] = wezterm.nerdfonts.seti_powershell,
  ['node'] = wezterm.nerdfonts.dev_nodejs_small,
  ['dotnet'] = wezterm.nerdfonts.md_language_csharp,
}
local function get_process(tab)
  local process_name = tab.active_pane.foreground_process_name:match("([^/\\]+)%.exe$") or
      tab.active_pane.foreground_process_name:match("([^/\\]+)$")

  -- local icon = process_icons[process_name] or string.format('[%s]', process_name)
  local icon = process_icons[process_name] or wezterm.nerdfonts.seti_checkbox_unchecked

  return icon
end

local function basename(s)
  return string.gsub(s, '(.*[/\\])(.*)', '%2')
end

---------------------------------------------------------
--                   Config Setup                      --
---------------------------------------------------------
-- This table will hold the configuration.
local config = {}

-- In newer versions of wezterm, use the config_builder which will
-- help provide clearer error messages
if wezterm.config_builder then
  config = wezterm.config_builder()
end

---------------------------------------------------------
--                         UI                          --
---------------------------------------------------------
-- NOTE: Tempory only. this switches to software rendering to eliminate the nu shell bug where output
-- moves upwards on each keystroke.
-- config.front_end = "Software"

-- Colorscheme
config.color_scheme = "Catppuccin Mocha" -- or Macchiato, Frappe, Latte
--config.color_scheme = "Tokyo Night"

-- Font
-- Option 1: Monaspace Neon + Radon cursive italics
-- config.font = wezterm.font_with_fallback {
--   "Monaspace Neon NF",
--   "JetBrainsMono Nerd Font",
-- }
-- config.font_rules = {
--   { italic = true, font = wezterm.font("Monaspace Radon NF", { italic = true }) },
--   { italic = true, intensity = "Bold", font = wezterm.font("Monaspace Radon NF", { italic = true, bold = true }) },
-- }

-- Option 2: Victor Mono (has built-in cursive italics)
-- config.font = wezterm.font_with_fallback {
--   "VictorMono NF",
--   "JetBrainsMono Nerd Font",
-- }
-- config.font_rules = {}

-- Option 3: Maple Mono (has built-in cursive italics)
-- config.font = wezterm.font_with_fallback {
--   "Maple Mono NF",
--   "JetBrainsMono Nerd Font",
-- }
-- config.font_rules = {}

-- Option 4: JetBrains Mono (no cursive, clean default)
-- config.font = wezterm.font_with_fallback {
--   "JetBrainsMono Nerd Font",
-- }
-- config.font_rules = {}

-- Option 5: Hack
-- config.font = wezterm.font_with_fallback {
--   "Hack Nerd Font",
--   "JetBrainsMono Nerd Font",
-- }
-- config.font_rules = {}

-- Option 6: IBM Plex Mono
-- config.font = wezterm.font_with_fallback {
--   "BlexMono Nerd Font",
--   "JetBrainsMono Nerd Font",
-- }
-- config.font_rules = {}

-- Option 7: Geist Mono
config.font = wezterm.font_with_fallback {
  "GeistMono Nerd Font",
  "JetBrainsMono Nerd Font",
}
config.font_rules = {}

config.font_size = 13

-- Window
config.window_background_opacity = 0.95
config.window_decorations = "RESIZE" -- removes close, minimize and so on
config.window_close_confirmation = "AlwaysPrompt"
config.window_padding = {
  top = 5,
  right = 5,
  bottom = 0,
  left = 5,
}

-- General
config.scrollback_lines = 10000
config.max_fps = 90
config.enable_kitty_keyboard = true

-- Start maximized
wezterm.on("gui-startup", function(cmd)
  local _, _, window = wezterm.mux.spawn_window(cmd or {})
  window:gui_window():maximize()
end)

-- Tab/Status Bar
-- disables the 'modern' look of the tab bar
-- config.use_fancy_tab_bar = false
-- config.show_new_tab_button_in_tab_bar = false
config.hide_tab_bar_if_only_one_tab = true
config.status_update_interval = 1000
config.tab_max_width = 60
config.tab_bar_at_bottom = false
wezterm.on('format-tab-title', function(tab, tabs, panes, config, hover, max_width)
  local has_unseen_output = false
  local is_zoomed = false

  for _, pane in ipairs(tab.panes) do
    if not tab.is_active and pane.has_unseen_output then
      has_unseen_output = true
    end
    if pane.is_zoomed then
      is_zoomed = true
    end
  end

  local cwd = get_current_working_dir(tab)
  local process = get_process(tab)
  local zoom_icon = is_zoomed and wezterm.nerdfonts.cod_zoom_in or ""
  local title = string.format(' %s ~ %s %s ', process, cwd, zoom_icon) -- Add placeholder for zoom_icon

  return wezterm.format({
    { Attribute = { Intensity = 'Bold' } },
    { Text = title }
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
    { Foreground = { Color = accent } },
    { Text = wezterm.nerdfonts.oct_table .. " " },
    { Foreground = { Color = fg } },
    { Text = workspace_or_leader .. "  " },
    { Foreground = { Color = accent } },
    { Text = wezterm.nerdfonts.md_clock .. " " },
    { Foreground = { Color = fg } },
    { Text = time .. " " },
  }))
end)

-- Panes
config.inactive_pane_hsb = {
  saturation = 0.4,
  brightness = 0.5
}


---------------------------------------------------------
--                     Keymaps                         --
---------------------------------------------------------
-- Keys
config.leader = { key = "Space", mods = "SHIFT", timeout_milliseconds = 3000 }
config.keys = {
  -- Clipboard
  { key = "c", mods = "CTRL|SHIFT", action = act.CopyTo("Clipboard") },
  { key = "v", mods = "CTRL|SHIFT", action = act.PasteFrom("Clipboard") },

  -- Pane Keybindings
  { key = "-", mods = "LEADER", action = act.SplitVertical { domain = "CurrentPaneDomain" } },
  { key = "|", mods = "LEADER", action = act.SplitHorizontal { domain = "CurrentPaneDomain" } },
  { key = "h", mods = "LEADER", action = act.ActivatePaneDirection("Left") },
  { key = "j", mods = "LEADER", action = act.ActivatePaneDirection("Down") },
  { key = "k", mods = "LEADER", action = act.ActivatePaneDirection("Up") },
  { key = "l", mods = "LEADER", action = act.ActivatePaneDirection("Right") },
  { key = "x", mods = "LEADER", action = act.CloseCurrentPane { confirm = true } },
  { key = "z", mods = "LEADER", action = act.TogglePaneZoomState },
  { key = "s", mods = "LEADER", action = act.RotatePanes "Clockwise" },
  -- We could make separate keybindings for resizing panes
  -- But Wezterm offers a custom mode we will use here
  { key = "r", mods = "ALT", action = act.ActivateKeyTable { name = "resize_pane", one_shot = false } },

  -- Tab Keybindings
  { key = "c", mods = "LEADER", action = act.SpawnTab("CurrentPaneDomain") },
  { key = "n", mods = "LEADER", action = act.ActivateTabRelative(1) },
  { key = "p", mods = "LEADER", action = act.ActivateTabRelative(-1) },
  { key = "t", mods = "LEADER", action = act.ShowTabNavigator },
  -- Table for moving tabs around
  { key = "m", mods = "LEADER", action = act.ActivateKeyTable { name = "move_tab", one_shot = false } },

  -- Workspace
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
        -- line will be `nil` if they hit escape without entering anything
        -- An empty string if they just hit enter
        -- Or the actual line of text they wrote
        if line then
          window:perform_action(
            act.SwitchToWorkspace {
              name = line,
            },
            pane
          )
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
    action = act.ActivateTab(i - 1)
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
  }
}

return config
