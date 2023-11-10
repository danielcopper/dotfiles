-- TODO:
-- 1. Fix right status folder name
-- 2. Fix tab name

local wezterm = require("wezterm")
local act = wezterm.action

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
config.window_background_opacity = 0.9
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
config.hide_tab_bar_if_only_one_tab = true
config.status_update_interval = 1000
wezterm.on("update-right-status", function(window, pane)
    local workspace_or_leader = window:active_workspace()
    -- Change the worspace name status if leader is active
    if window:active_key_table() then workspace_or_leader = window:active_key_table() end
    if window:leader_is_active() then workspace_or_leader = "LEADER" end

    -- Current working directory
    local basename = function(s)
        return string.gsub(s, "(.*[/\\])(.*)", "%2")
    end
    local short_cwd = basename(pane:get_current_working_dir())

    -- Opther option for cwd
    local cwd_uri = pane:get_current_working_dir()
    local cwd = cwd_uri.file_path

    -- Current command
    local cmd = basename(pane:get_foreground_process_name())

    -- Time
    local time = wezterm.strftime("%H:%M")

    -- Hostname
    local hostname = " " .. wezterm.hostname() .. " ";

    window:set_right_status(wezterm.format({
        { Text = wezterm.nerdfonts.oct_table .. " " .. workspace_or_leader },
        { Text = " | " },
        { Text = wezterm.nerdfonts.md_folder .. " " .. short_cwd },
        { Text = " | " },
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

-- Panes
config.inactive_pane_hsb = {
    saturation = 0.4,
    brightness = 0.5
}

-- Keys
-- NOTE: maybe use Alt instead of space
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

    -- TODO:  Does not always prompt to confirm
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
