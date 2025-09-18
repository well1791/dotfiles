local wezterm = require 'wezterm'
local mux = wezterm.mux
local conf = {}

-- Keep config
if wezterm.config_builder then
  conf = wezterm.config_builder()
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

-- Font stuff
-- conf.font = wezterm.font('');
conf.font_size = 15.0
conf.line_height = 1.5
conf.adjust_window_size_when_changing_font_size = false

-- Theme and color
conf.color_scheme = scheme_for_appearance(get_appearance())
conf.force_reverse_video_cursor = true

-- UI
conf.initial_cols = 100
conf.initial_rows = 35
conf.window_padding = {
  top = 0,
  left = 0,
  right = 0,
  bottom = 0,
}
conf.window_decorations = 'RESIZE'
conf.window_background_opacity = 0.8
conf.window_close_confirmation = "NeverPrompt"
conf.hide_tab_bar_if_only_one_tab = true
conf.enable_tab_bar = false

-- Performance
conf.max_fps = 144
conf.animation_fps = 60
conf.cursor_blink_rate = 250

-- Keyboard stuff
conf.use_dead_keys = false
conf.unicode_version = 14

-- more stuff
conf.exit_behavior = 'Close'
conf.audible_bell = 'Disabled'
conf.scrollback_lines = 10000
conf.show_update_window = true
conf.skip_close_confirmation_for_processes_named = {
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

return conf
