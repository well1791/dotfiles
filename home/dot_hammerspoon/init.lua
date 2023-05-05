--
-- Key bindings.
--

function launchOrFocus(app)
  return function()
    hs.application.launchOrFocus(app)
  end
end

local bindings = {
  [{'alt', 'ctrl', 'shift'}] = {
     -- left hand
    r = launchOrFocus("Microsoft Edge"),
    t = launchOrFocus("Slack"),
    n = launchOrFocus("Wezterm"),

    -- left hand
    e = launchOrFocus("Firefox Developer Edition"),
    i = launchOrFocus("Ferdium"),
    a = launchOrFocus("Finder"),

    -- more
    k = launchOrFocus("Docker"),
    v = launchOrFocus("NordVPN"),
    p = launchOrFocus("NordPass"),
    y = launchOrFocus("System Preferences"),
    z = launchOrFocus("Zoom.us"),
    m = launchOrFocus("Microsoft Teams"),
  },
}

for modifier, keyActions in pairs(bindings) do
  for key, action in pairs(keyActions) do
    hs.hotkey.bind(modifier, tostring(key), action)
  end
end


--
-- Auto-reload config on change.
--

function reloadConfig(files)
  for _, file in pairs(files) do
    if file:sub(-4) == '.lua' then
      hs.reload()
    end
  end
end

hs.pathwatcher.new(os.getenv('HOME') .. '/.hammerspoon/', reloadConfig):start()
