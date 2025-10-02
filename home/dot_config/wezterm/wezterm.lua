local wezterm = require 'wezterm'
local act = wezterm.action
local mux = wezterm.mux
local config = {}

-- Keep config
if wezterm.config_builder then
  config = wezterm.config_builder()
end

-- Font stuff
config.font_size = 15.0
config.line_height = 1.3
config.adjust_window_size_when_changing_font_size = false

-- Theme and color
config.color_scheme = 'Rydgel (terminal.sexy)'
config.force_reverse_video_cursor = true

-- UI
config.initial_cols = 145
config.initial_rows = 20
config.window_padding = {
  top = 0,
  left = 0,
  right = 0,
  bottom = 0,
}
config.window_decorations = 'RESIZE'
config.window_background_opacity = 1
config.window_close_confirmation = 'NeverPrompt'
config.hide_tab_bar_if_only_one_tab = false
config.use_fancy_tab_bar = false

-- Performance
config.max_fps = 144
config.animation_fps = 60
config.cursor_blink_rate = 250

-- Keyboard stuff
config.use_dead_keys = false
config.unicode_version = 14

-- more stuff
config.exit_behavior = 'Close'
config.audible_bell = 'Disabled'
config.scrollback_lines = 10000
config.show_update_window = true
config.skip_close_confirmation_for_processes_named = {
  'bash',
  'sh',
  'zsh',
  'fish',
  'nu',
  'zellij',
}

wezterm.on('gui-startup', function(cmd)
    local tab, pane, window = mux.spawn_window(cmd or {})
    window:gui_window():maximize()
end)

wezterm.on('update-right-status', function(window, pane)
  window:set_right_status(window:active_workspace())
end)

local tabline = wezterm.plugin.require('https://github.com/michaelbrusegard/tabline.wez')

tabline.setup({
  options = {
    icons_enabled = false,
    theme = "GruvboxDark",
    tabs_enabled = true,
    theme_overrides = {},

		section_separators = {
			left = wezterm.nerdfonts.ple_right_half_circle_thick,
			right = wezterm.nerdfonts.ple_left_half_circle_thick,
		},
		component_separators = {
			left = wezterm.nerdfonts.ple_right_half_circle_thin,
			right = wezterm.nerdfonts.ple_left_half_circle_thin,
		},
		tab_separators = {
			left = wezterm.nerdfonts.ple_right_half_circle_thick,
			right = wezterm.nerdfonts.ple_left_half_circle_thick,
		},
  },

  sections = {
    -- Left side
    tabline_a = { 'mode' },
    tabline_b = { 'workspace' },
    tabline_c = { },

    -- Middle section
    tab_active = {
      { 'index', fmt = function(str) return string.format("[%s]", str) end },
      { 'parent', padding = 0 },
      '/',
      { 'cwd', padding = { left = 0, right = 1 }, max_length = 20 },
      { 'zoomed', padding = 0 },
    },
    tab_inactive = {
      { 'index', fmt = function(str) return string.format("[%s]", str) end },
      { 'process', padding = { left = 0, right = 1 } },
      { 'cwd', padding = { left = 0, right = 1 }, max_length = 10 },
    },

    -- Right side
    tabline_x = { 'ram' },
    tabline_y = { 'cpu', throttle = 3, },
    tabline_z = { 'battery' },
  },

  extensions = { 'resurrect', 'smart_workspace_switcher'},
})

config.leader = { key = 'Space', mods = 'CTRL|SHIFT', timeout_milliseconds = 1000 }
config.keys = {
  -- Send 'ALT-Space' to the terminal when pressing: ALT-Space, ALT-Space
  {
    key = 'Space',
    mods = 'LEADER|CTRL|SHIFT',
    action = act.SendKey { key = 'Space', mods = 'CTRL|SHIFT' },
  },

  -- Pane close
  {
    key = 'o',
    mods = 'LEADER',
    action = act.CloseCurrentPane { confirm = false },
  },

  -- Pane Zoom
  {
    key = 'm',
    mods = 'LEADER',
    action = act.TogglePaneZoomState,
  },

  -- Tabs
  {
    key = 'w',
    mods = 'LEADER',
    action = act.SpawnTab('CurrentPaneDomain'),
  },
  {
    key = 'f',
    mods = 'LEADER',
    action = act.CloseCurrentTab { confirm = false },
  },
  {
    key = 's',
    mods = 'LEADER',
    action = act.ActivateLastTab,
  },
  {
    key = 'e',
    mods = 'LEADER',
    action = act.ActivateTabRelative(-1),
  },
  {
    key = 'd',
    mods = 'LEADER',
    action = act.ActivateTabRelative(1),
  },

  -- Switch to the default workspace
  {
    key = 'h',
    mods = 'LEADER',
    action = act.SwitchToWorkspace {
      name = 'default',
    },
  },

  -- All workspaces
  {
    key = 'o',
    mods = 'LEADER',
    action = act.ShowLauncherArgs {
      flags = 'FUZZY|WORKSPACES',
    },
  },

  -- Create and go to workspace.
  {
    key = 'g',
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
            act.SwitchToWorkspace { name = line, },
            pane
          )
        end
      end),
    },
  },
}

for i = 1, 9 do
  table.insert(config.keys, {
    key = tostring(i),
    mods = 'ALT',
    action = act.ActivateTab(i - 1),
  })
end

local right_nav_keys = {
  i = 'Up',
  k = 'Down',
  j = 'Left',
  l = 'Right',
}

for key, direction in pairs(right_nav_keys) do
  -- focus panes: ijkl
  table.insert(config.keys, {
    key = key,
    mods = 'LEADER',
    action = wezterm.action_callback(function(win, pane)
      win:perform_action({ ActivatePaneDirection = direction }, pane)
    end),
  })

  -- create panes: IJKL
  table.insert(config.keys, {
    key = string.upper(key),
    mods = 'LEADER',
    action = act.SplitPane {
      direction = direction,
      size = { Percent = 50 },
    },
  })
end

return config
