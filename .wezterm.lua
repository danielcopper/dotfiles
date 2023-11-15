local wezterm = require("wezterm")
local act = wezterm.action

-- Functions
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
  -- ['pwsh'] = wezterm.nerdfonts.cod_terminal_powershell,
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

-- This table will hold the configuration.
local config = {}

-- In newer versions of wezterm, use the config_builder which will
-- help provide clearer error messages
if wezterm.config_builder then
  config = wezterm.config_builder()
end

-- Colorscheme
config.color_scheme = "Catppuccin Mocha" -- or Macchiato, Frappe, Latte
--config.color_scheme = "Tokyo Night"

-- Font
config.font = wezterm.font_with_fallback {
  "JetBrainsMono Nerd Font",
  "VictorMono NF"
}
config.font_size = 10.0

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
config.scrollback_lines = 3000
config.default_prog = { "C:\\Program Files\\PowerShell\\7\\pwsh.exe" }
config.default_cwd = "C:/Repos"

-- Tab/Status Bar
-- disables the 'modern' look of the tab bar
config.use_fancy_tab_bar = false
config.show_new_tab_button_in_tab_bar = false
config.hide_tab_bar_if_only_one_tab = false
config.status_update_interval = 1000
config.tab_max_width = 60
config.tab_bar_at_bottom = false
wezterm.on(
  'format-tab-title',
  function(tab, tabs, panes, config, hover, max_width)
    local has_unseen_output = false
    if not tab.is_active then
      for _, pane in ipairs(tab.panes) do
        if pane.has_unseen_output then
          has_unseen_output = true
          break
        end
      end
    end

    local cwd = get_current_working_dir(tab)
    local process = get_process(tab)
    local title = string.format(' %s ~ %s  ', process, cwd)

    local formatted_title = wezterm.format({
      {Attribute = {Intensity = 'Bold'}},
      {Text = title}
    })

    if has_unseen_output then
      return {
        {Foreground = {Color = '#28719c'}},
        {Text = title}
      }
    else
      return {
        {Text = title}
      }
    end
  end
)
wezterm.on("update-right-status", function(window, pane)
  local workspace_or_leader = window:active_workspace()
  -- Change the worspace name status if leader is active
  if window:active_key_table() then workspace_or_leader = window:active_key_table() end
  if window:leader_is_active() then workspace_or_leader = "LEADER" end

  local cwd = pane:get_current_working_dir() or "N/A"
  local last_folder = get_last_folder_segment(cwd)
  local cmd = get_last_folder_segment(pane:get_foreground_process_name())
  local time = wezterm.strftime("%H:%M")
  local hostname = " " .. wezterm.hostname() .. " ";

  window:set_right_status(wezterm.format({
    { Text = wezterm.nerdfonts.oct_table .. " " .. workspace_or_leader },
    { Text = " | " },
    -- { Text = wezterm.nerdfonts.md_folder .. " " .. last_folder },
    -- { Text = " | " },
    { Foreground = { Color = "FFB86C" } },
    { Text = wezterm.nerdfonts.fa_code .. " " .. cmd },
    "ResetAttributes",
    { Text = " | " },
    { Text = wezterm.nerdfonts.oct_person .. " " .. hostname },
    { Text = " | " },
    { Text = wezterm.nerdfonts.md_clock .. " " .. time },
    { Text = " | " },
  }))
end)

-- Periodic updates on the statusline
-- NOTE: Which is not working
wezterm.on("idle", function()
  local window = wezterm.active_window()
  if window then
    window:perform_action(wezterm.action({ EmitEvent = "update-right-status" }), nil)
  end
end)

-- Panes
config.inactive_pane_hsb = {
  saturation = 0.4,
  brightness = 0.5
}

-- Keys
config.leader = { key = "Space", mods = "SHIFT", timeout_milliseconds = 1000 }
config.keys = {
  { key = "c", mods = "LEADER", action = act.ActivateCopyMode },

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
  { key = "r", mods = "LEADER", action = act.ActivateKeyTable { name = "resize_pane", one_shot = false } },

  -- Tab Keybindings
  { key = "c", mods = "LEADER", action = act.SpawnTab("CurrentPaneDomain") },
  { key = "n", mods = "LEADER", action = act.ActivateTabRelative(1) },
  { key = "p", mods = "LEADER", action = act.ActivateTabRelative(-1) },
  { key = "t", mods = "LEADER", action = act.ShowTabNavigator },
  -- Table for moving tabs around
  { key = "m", mods = "LEADER", action = act.ActivateKeyTable { name = "move_tab", one_shot = false } },

  -- Workspace
  { key = "w", mods = "LEADER", action = act.ShowLauncherArgs { flags = "FUZZY|WORKSPACES" } },

  -- Experimental section
  { key = "S", mods = "LEADER", action = wezterm.action({ EmitEvent = "trigger-save-workspace" }) },

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
