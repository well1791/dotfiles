local wezterm = require 'wezterm'
local conf = {}

if wezterm.config_builder then
  conf = wezterm.config_builder()
end

conf.adjust_window_size_when_changing_font_size = false
conf.audible_bell = 'Disabled'
conf.color_scheme = 'Aura (Gogh)'
conf.exit_behavior = 'Close'
conf.font_size = 18.0
conf.force_reverse_video_cursor = true
conf.hide_tab_bar_if_only_one_tab = true
conf.scrollback_lines = 10000
conf.show_update_window = true
conf.use_dead_keys = false
conf.unicode_version = 14
conf.window_close_confirmation = 'NeverPrompt'
conf.window_padding = {
  left = '0.5cell',
  right = '0.25cell',
  top = '0.5cell',
  bottom = '0.5cell',
}

return conf

