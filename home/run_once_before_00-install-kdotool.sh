#!/bin/bash
# Ensure kdotool is installed via system package manager

if ! command -v kdotool &> /dev/null; then
    echo "==> Installing kdotool via paru"
    paru -S kdotool --noconfirm --needed
else
    echo "==> kdotool already installed: $(kdotool --version | head -1)"
fi
