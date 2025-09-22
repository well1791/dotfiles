local wezterm = require 'wezterm'
local mux = wezterm.mux
local config = {}

-- Keep config
if wezterm.config_builder then
  config = wezterm.config_builder()
end

function get_appearance()
  if wezterm.gui then
    return wezterm.gui.get_appearance()
  end
  return 'Dark'
end

function scheme_for_appearance(appearance)
  if appearance:find 'Dark' then
    return 'Rydgel (terminal.sexy)'
  else
    return 'Brewer (light) (terminal.sexy)'
  end
end

local active_theme = scheme_for_appearance(get_appearance()) 

-- Font stuff
-- config.font = wezterm.font('');
config.font_size = 14.0
config.line_height = 1.4
config.adjust_window_size_when_changing_font_size = false

-- Theme and color
config.color_scheme = active_theme
config.force_reverse_video_cursor = true

-- UI
config.initial_cols = 100
config.initial_rows = 35
config.window_padding = {
  top = 0,
  left = 0,
  right = 0,
  bottom = 0,
}
config.window_decorations = 'RESIZE'
config.window_background_opacity = 0.9
config.window_close_confirmation = "NeverPrompt"
config.hide_tab_bar_if_only_one_tab = true
-- config.enable_tab_bar = true

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

local tabline = wezterm.plugin.require("https://github.com/michaelbrusegard/tabline.wez")

tabline.setup({
  options = {
    icons_enabled = true,
    theme = active_theme,
    tabs_enabled = true,
    theme_overrides = {},
    section_separators = {
      left = wezterm.nerdfonts.pl_left_hard_divider,
      right = wezterm.nerdfonts.pl_right_hard_divider,
    },
    component_separators = {
      left = wezterm.nerdfonts.pl_left_soft_divider,
      right = wezterm.nerdfonts.pl_right_soft_divider,
    },
    tab_separators = {
      left = wezterm.nerdfonts.pl_left_hard_divider,
      right = wezterm.nerdfonts.pl_right_hard_divider,
    },
  },

  sections = {
    -- Left side
    tabline_a = { 'mode' },
    tabline_b = { 'workspace' },
    tabline_c = { ' ' },

    -- Middle side
    tab_active = {
      'parent',
      '/',
      { 'cwd', padding = { left = 0, right = 1 } },
  		{
				'zoomed',
				icon = wezterm.nerdfonts.oct_zoom_in,
				padding = { left = 0, right = 0 },
			},
    },
    tab_inactive = { 'index', { 'process', padding = { left = 0, right = 1 } } },

    -- Right side
    tabline_x = { 'ram' },
    tabline_y = { 'cpu' },
    tabline_z = { 'battery' },
  },

  extensions = {},
})


return config
