local wezterm = require 'wezterm'
local mux = wezterm.mux
local conf = {}

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


conf.color_scheme = scheme_for_appearance(get_appearance())
conf.adjust_window_size_when_changing_font_size = false
conf.audible_bell = 'Disabled'
conf.exit_behavior = 'Close'
conf.font_size = 20.0
conf.line_height = 1.3
conf.force_reverse_video_cursor = true
conf.hide_tab_bar_if_only_one_tab = true
conf.initial_cols = 100
conf.initial_rows = 35
conf.scrollback_lines = 10000
conf.show_update_window = true
conf.use_dead_keys = false
conf.window_padding = {
  top = 0,
  left = 0,
  right = 0,
  bottom = 0,
}
conf.unicode_version = 14
conf.window_close_confirmation = 'NeverPrompt'
conf.window_decorations = 'RESIZE'
conf.window_background_opacity = 1
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
