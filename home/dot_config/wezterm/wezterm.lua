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
conf.initial_cols = 100
conf.initial_rows = 35
conf.scrollback_lines = 10000
conf.show_update_window = true
conf.use_dead_keys = false
conf.window_padding = {
  left = 0,
  bottom = 0,
}
conf.unicode_version = 14
conf.window_close_confirmation = 'NeverPrompt'
conf.window_decorations = 'RESIZE'
conf.skip_close_confirmation_for_processes_named = {
  'bash',
  'sh',
  'zsh',
  'fish',
  'tmux',
  'nu',
  'cmd.exe',
  'pwsh.exe',
  'powershell.exe',
  'zellij',
}

return conf
