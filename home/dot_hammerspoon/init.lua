spaces = require("hs.spaces")

--
-- Key bindings.
--

function rightClick()
	local pos = hs.mouse.absolutePosition()
	hs.eventtap.leftClick(pos)
	hs.eventtap.event.newMouseEvent()
end

function launchOrFocus(app)
	return function()
		hs.application.launchOrFocus(app)
	end
end

local bindings = {
	[{ "ctrl", "alt", "shift" }] = {
		-- qwerty left
		s = launchOrFocus("Arc"),
		a = launchOrFocus("Zen Browser"),
		d = launchOrFocus("Finder"),

		-- qwerty right
		j = launchOrFocus("Wezterm"),
		--k = launchOrFocus("Visual Studio Code"),
		k = launchOrFocus("Zed"),
		l = launchOrFocus("Microsoft Teams"),

		-- layout agnostic
		u = launchOrFocus("System Preferences"),
		p = launchOrFocus("NordPass"),
	},
}

for modifier, keyActions in pairs(bindings) do
	for key, action in pairs(keyActions) do
		hs.hotkey.bind(modifier, tostring(key), action)
	end
end

--
-- Hold left click on key press
--

hs.hotkey.bind({}, "f3", function()
	hs.eventtap.event.newMouseEvent(hs.eventtap.event.types["leftMouseDown"], hs.mouse.getAbsolutePosition()):post()
end, function()
	hs.eventtap.event.newMouseEvent(hs.eventtap.event.types["leftMouseUp"], hs.mouse.getAbsolutePosition()):post()
end)

--
-- Auto-reload config on change.
--

function reloadConfig(files)
	for _, file in pairs(files) do
		if file:sub(-4) == ".lua" then
			hs.reload()
		end
	end
end

hs.pathwatcher.new(os.getenv("HOME") .. "/.hammerspoon/", reloadConfig):start()
