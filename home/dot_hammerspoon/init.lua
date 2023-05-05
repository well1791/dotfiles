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
    t = launchOrFocus("Wezterm"),
    n = launchOrFocus("Visual Studio Code"),
    s = launchOrFocus("Slack"),

    -- left hand
    e = launchOrFocus("Firefox Developer Edition"),
    i = launchOrFocus("Finder"),
    a = launchOrFocus("System Preferences"),
    c = launchOrFocus("Ferdium"),

    -- more
    f = launchOrFocus("Microsoft Teams"),
    k = launchOrFocus("Docker"),
    m = launchOrFocus("Zoom.us"),
    p = launchOrFocus("NordPass"),
    v = launchOrFocus("NordVPN"),
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
