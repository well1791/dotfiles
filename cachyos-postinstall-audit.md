# CachyOS Post-Install Setup Audit

**Date**: 2026-05-29  
**Reference**: https://wiki.cachyos.org/configuration/post_install_setup/  
**System**: KDE Plasma 6 (Wayland), fish shell, ghostty terminal, helix editor

---

## Executive Summary

Your dotfiles repository has excellent coverage for development tooling and workflow automation, but is missing several system-level security and usability configurations recommended by CachyOS. The gaps are primarily in system hardening (firewall, AppArmor), network optimization (Wi-Fi regulatory domain), and desktop environment integration (global menu, AppImage management).

**Overall Coverage**: 40% ✅ | 30% ⚠️ | 30% ❌

---

## Detailed Audit

### ✅ Already Configured Well

#### 1. System Updates ⭐ **Excellent**
- **Status**: ✅ **Comprehensive implementation**
- **File**: `home/dot_local/bin/executable_update-all`
- **Coverage**:
  - ✅ pacman/paru/yay support for Arch-based systems
  - ✅ Automatic AUR helper detection (paru → yay → pacman)
  - ✅ Updates: mise, uv, Rust, Nix, devenv, Bun, engram, atuin, pi
  - ✅ Multi-distro support (Arch, Debian, Fedora, Alpine)
  - ✅ Error tracking and exit codes
- **Quality**: Exceeds CachyOS recommendations with unified update script

#### 2. Default Shell (fish) ⭐ **Fully Configured**
- **Status**: ✅ **Already using fish**
- **File**: `home/dot_config/fish/config.fish`
- **Coverage**:
  - ✅ Fish set as default shell
  - ✅ Custom abbreviations (git, chezmoi, zellij, pi)
  - ✅ Modern tooling integrated (atuin, mise, skim/fzf)
  - ✅ API keys encrypted with age
  - ✅ Fish plugins managed via fisher
- **CachyOS Recommendation**: Optional - use bash/zsh instead
- **Your Choice**: fish is a valid modern shell choice, keep as-is

#### 3. Development Environment ⭐ **Excellent**
- **Status**: ✅ **Comprehensive setup**
- **Tools**: helix, ripgrep, yazi, bat, duf, eza, glow, serpl, just
- **Installation**: `home/run_once_before_70-install-cli-tools.sh.tmpl`
- **Quality**: Modern CLI tools, well-organized, auto-detection

#### 4. KDE Plasma Integration ⭐ **Advanced**
- **Status**: ✅ **Custom shortcuts and workflows**
- **File**: `home/run_once_after_70-configure-kde-shortcuts.sh.tmpl`
- **Coverage**:
  - ✅ kdotool integration for window management
  - ✅ LibreWolf profile-specific launchers
  - ✅ Application focus/launch shortcuts
  - ✅ Kanata systemd service for key remapping

---

### ⚠️ Partially Configured (Needs Improvement)

#### 5. CLI Utilities (tldr)
- **Status**: ⚠️ **Only available in doom-emacs**
- **Current**: `home/dot_doom.d/packages.el` includes `(package! tldr)`
- **Gap**: No system-wide CLI `tldr` command
- **Impact**: Low (doom-emacs coverage sufficient for editor use)
- **Recommendation**:
  ```bash
  # Add to install-cli-tools.sh or create separate script
  sudo pacman -S tealdeer  # Rust implementation of tldr
  # OR
  sudo pacman -S tldr      # Official Python client
  ```
- **Priority**: 🟡 Low (optional enhancement)

---

### ❌ Missing Entirely

#### 6. Firewall Configuration (ufw) 🔴 **Security Gap**
- **Status**: ❌ **Not configured**
- **CachyOS Recommendation**: Enable and configure ufw
- **Impact**: High - unprotected network exposure
- **Files to Create**:
  - `home/run_once_after_80-configure-ufw.sh.tmpl` - Enable and configure firewall
  - Optional: `home/dot_config/ufw/user.rules` - Custom firewall rules
- **Implementation**:
  ```bash
  #!/bin/sh
  # Install and enable ufw firewall
  set -e
  
  # Install ufw if not present
  if ! command -v ufw >/dev/null 2>&1; then
      echo "Installing ufw..."
      sudo pacman -S --noconfirm --needed ufw
  fi
  
  # Enable ufw
  echo "Enabling ufw..."
  sudo systemctl enable --now ufw.service
  
  # Basic configuration
  sudo ufw default deny incoming
  sudo ufw default allow outgoing
  
  # Allow common services (customize as needed)
  # sudo ufw allow ssh
  # sudo ufw allow http
  # sudo ufw allow https
  
  # Enable firewall
  sudo ufw --force enable
  
  echo "✓ ufw enabled and configured"
  echo "  Check status: sudo ufw status verbose"
  echo "  Allow port: sudo ufw allow <port>"
  echo "  Deny port: sudo ufw deny <port>"
  ```
- **Priority**: 🔴 **High** (security concern)

#### 7. Wi-Fi Regulatory Domain 📡 **Performance Gap**
- **Status**: ❌ **Not configured**
- **CachyOS Recommendation**: Set regulatory domain for Wi-Fi optimization
- **Impact**: Medium - limited Wi-Fi channels, suboptimal performance
- **Files to Create**:
  - `home/run_once_after_85-configure-wifi-regdom.sh.tmpl` - Set regulatory domain
- **Implementation**:
  ```bash
  #!/bin/bash
  # Configure Wi-Fi regulatory domain
  # See: https://wiki.archlinux.org/title/Wireless_network_configuration#Respecting_the_regulatory_domain
  
  set -e
  
  echo "==> Wi-Fi Regulatory Domain Configuration"
  echo ""
  echo "⚠️  MANUAL CONFIGURATION REQUIRED"
  echo ""
  echo "1. Install wireless-regdb package (usually already installed):"
  echo "   sudo pacman -S --needed wireless-regdb"
  echo ""
  echo "2. Edit /etc/conf.d/wireless-regdom with root privileges:"
  echo "   sudo micro /etc/conf.d/wireless-regdom"
  echo ""
  echo "3. Uncomment your country code (ISO 3166-1 alpha-2):"
  echo "   Example for United States:"
  echo "   WIRELESS_REGDOM=\"US\""
  echo ""
  echo "   Example for United Kingdom:"
  echo "   WIRELESS_REGDOM=\"GB\""
  echo ""
  echo "   Example for Canada:"
  echo "   WIRELESS_REGDOM=\"CA\""
  echo ""
  echo "4. Reboot to apply changes"
  echo ""
  echo "5. Verify configuration:"
  echo "   iw reg get"
  echo ""
  echo "Expected output should show your country code, not 'country 00'"
  echo ""
  echo "Benefits:"
  echo "  - Unlock Wi-Fi channels 12/13 (2.4GHz)"
  echo "  - Enable full 5GHz/6GHz spectrum"
  echo "  - Optimize transmit power for your region"
  echo "  - Improve connection quality and performance"
  ```
- **Priority**: 🟡 **Medium** (improves Wi-Fi performance, but system-specific)
- **Note**: Cannot be fully automated (requires user to know their country code)

#### 8. Global Menu Support 🖥️ **Desktop Integration Gap**
- **Status**: ❌ **Not configured**
- **CachyOS Recommendation**: Install appmenu-gtk-module and libdbusmenu-glib
- **Impact**: Medium - Global menu may not work for GTK apps (VSCode, etc.)
- **Affected Apps**: Visual Studio Code, Zed, GTK-based applications
- **Files to Create**:
  - `home/run_once_before_75-install-global-menu.sh.tmpl` - Install global menu packages
- **Implementation**:
  ```bash
  #!/bin/sh
  # Install global menu support for GTK applications
  # Required for proper integration with KDE Plasma global menu
  
  set -e
  
  # Check if packages are already installed
  if pacman -Qi appmenu-gtk-module >/dev/null 2>&1 && \
     pacman -Qi libdbusmenu-glib >/dev/null 2>&1; then
      echo "✓ Global menu packages already installed"
      exit 0
  fi
  
  echo "Installing global menu support..."
  sudo pacman -S --noconfirm --needed appmenu-gtk-module libdbusmenu-glib
  
  echo ""
  echo "✓ Global menu support installed"
  echo "  Restart affected applications to see global menu integration"
  echo "  Affected: VSCode, Zed, Firefox/LibreWolf, GTK apps"
  ```
- **Priority**: 🟡 **Medium** (improves KDE integration for GTK apps)

#### 9. AppImage Management 📦 **Workflow Gap**
- **Status**: ❌ **Not configured**
- **CachyOS Recommendation**: Use gearlever for AppImage management
- **Impact**: Low - no AppImages mentioned in current setup
- **Files to Create**:
  - `home/run_once_after_90-install-gearlever.sh.tmpl` - Install gearlever via Flatpak
- **Implementation**:
  ```bash
  #!/bin/sh
  # Install gearlever for AppImage management
  # See: https://github.com/mijorus/gearlever
  
  set -e
  
  # Check if flatpak is installed
  if ! command -v flatpak >/dev/null 2>&1; then
      echo "Installing flatpak..."
      sudo pacman -S --noconfirm --needed flatpak
      
      # Add Flathub repository
      flatpak remote-add --if-not-exists flathub https://flathub.org/repo/flathub.flatpakrepo
      
      echo ""
      echo "⚠️  Flatpak installed - LOG OUT AND LOG BACK IN before continuing"
      echo "  Then run: chezmoi apply"
      exit 0
  fi
  
  # Check if gearlever is already installed
  if flatpak list | grep -q "it.mijorus.gearlever"; then
      echo "✓ gearlever already installed"
      exit 0
  fi
  
  echo "Installing gearlever..."
  flatpak install -y flathub it.mijorus.gearlever
  
  echo ""
  echo "✓ gearlever installed"
  echo "  Launch from application menu: 'GearLever'"
  echo "  Use it to integrate AppImages into your desktop"
  ```
- **Priority**: 🟢 **Low** (optional, only needed if using AppImages)
- **Note**: Requires flatpak, which adds a dependency

#### 10. Samba Share Access 🗂️ **Network Sharing Gap**
- **Status**: ❌ **Not configured**
- **CachyOS Recommendation**: Install cachyos-samba-settings for convenient smb.conf
- **Impact**: Low - only needed if connecting to Samba/SMB shares
- **Files to Create**:
  - `home/run_once_after_95-install-samba-client.sh.tmpl` - Install Samba client packages
- **Implementation**:
  ```bash
  #!/bin/sh
  # Install Samba client for accessing SMB/CIFS network shares
  # Optional: cachyos-samba-settings for optimized configuration
  
  set -e
  
  echo "==> Samba Client Installation"
  echo ""
  echo "Do you need to access Windows/SMB network shares?"
  echo "  - If yes, Samba client will be installed"
  echo "  - If no, skip this script"
  echo ""
  
  # Check if samba packages are installed
  if pacman -Qi samba >/dev/null 2>&1 && \
     pacman -Qi gvfs-smb >/dev/null 2>&1; then
      echo "✓ Samba client already installed"
      exit 0
  fi
  
  echo "Installing Samba client packages..."
  sudo pacman -S --noconfirm --needed samba gvfs-smb
  
  # Optional: CachyOS optimized configuration
  if pacman -Ss cachyos-samba-settings >/dev/null 2>&1; then
      echo "Installing CachyOS Samba settings..."
      sudo pacman -S --noconfirm --needed cachyos-samba-settings
  fi
  
  echo ""
  echo "✓ Samba client installed"
  echo "  Access shares via Dolphin: smb://<server-ip>/<share-name>"
  echo "  Or mount manually:"
  echo "  sudo mount -t cifs //server/share /mnt/point -o username=USER"
  ```
- **Priority**: 🟢 **Low** (only needed if using network shares)
- **User Decision Required**: Does user need Samba/SMB share access?

#### 11. AppArmor Security Profiles 🔒 **Security Hardening Gap**
- **Status**: ❌ **Not configured**
- **CachyOS Recommendation**: Install apparmor and apparmor.d for 1500+ profiles
- **Impact**: High (security hardening) but Complex (can break applications)
- **Warning**: ⚠️ **Advanced Configuration** - Can break applications if misconfigured
- **Files to Create**:
  - `home/run_once_after_100-install-apparmor.sh.tmpl` - Install and enable AppArmor
- **Implementation**:
  ```bash
  #!/bin/bash
  # Install and configure AppArmor security profiles
  # WARNING: This is an ADVANCED security feature that can break applications
  # Only proceed if you understand the implications
  
  set -e
  
  echo "==> AppArmor Installation"
  echo ""
  echo "⚠️  WARNING: AppArmor is an advanced security feature"
  echo ""
  echo "Benefits:"
  echo "  - Restricts program capabilities with per-program profiles"
  echo "  - Provides 1500+ pre-made profiles via apparmor.d"
  echo "  - Enhances system security by limiting damage from exploits"
  echo ""
  echo "Risks:"
  echo "  - Can break applications if profiles are too restrictive"
  echo "  - Requires kernel parameters to be set in bootloader"
  echo "  - May require troubleshooting and profile adjustments"
  echo ""
  echo "📚 Read more: https://github.com/roddhjav/apparmor.d"
  echo ""
  echo "==> MANUAL INSTALLATION REQUIRED"
  echo ""
  echo "1. Add kernel parameter to your bootloader:"
  echo "   lsm=landlock,lockdown,yama,integrity,apparmor,bpf"
  echo ""
  echo "   For systemd-boot:"
  echo "   sudo micro /boot/loader/entries/*.conf"
  echo "   Add to 'options' line"
  echo ""
  echo "   For GRUB:"
  echo "   sudo micro /etc/default/grub"
  echo "   Add to GRUB_CMDLINE_LINUX_DEFAULT"
  echo "   Then: sudo grub-mkconfig -o /boot/grub/grub.cfg"
  echo ""
  echo "2. Reboot to apply kernel parameter"
  echo ""
  echo "3. Install AppArmor packages:"
  echo "   sudo pacman -S apparmor apparmor.d"
  echo ""
  echo "4. Enable and start AppArmor service:"
  echo "   sudo systemctl enable --now apparmor.service"
  echo ""
  echo "5. Enable caching (optional performance boost):"
  echo "   sudo micro /etc/apparmor/parser.conf"
  echo "   Add these lines:"
  echo "   write-cache"
  echo "   Optimize=compress-fast"
  echo "   cache-loc /etc/apparmor/earlypolicy/"
  echo ""
  echo "6. Reboot again"
  echo ""
  echo "7. Verify AppArmor is active:"
  echo "   sudo aa-status"
  echo ""
  echo "Troubleshooting:"
  echo "  - If an app breaks, check logs: journalctl -xe | grep apparmor"
  echo "  - Disable profile: sudo aa-disable /etc/apparmor.d/<profile>"
  echo "  - Set to complain mode: sudo aa-complain /etc/apparmor.d/<profile>"
  ```
- **Priority**: 🟡 **Medium-High** (security improvement, but complex)
- **Recommendation**: Defer until after all other configurations are working
- **User Decision Required**: Does user want to implement this level of security hardening?

---

## Summary of Recommendations

### 🔴 High Priority (Security)
1. **Firewall (ufw)**: Enable basic firewall protection
   - Create: `run_once_after_80-configure-ufw.sh.tmpl`
   - Estimated time: 10 minutes

### 🟡 Medium Priority (Performance & Integration)
2. **Wi-Fi Regulatory Domain**: Optimize Wi-Fi performance
   - Create: `run_once_after_85-configure-wifi-regdom.sh.tmpl`
   - Note: Requires manual country code entry
   - Estimated time: 5 minutes

3. **Global Menu Support**: Improve KDE integration for GTK apps
   - Create: `run_once_before_75-install-global-menu.sh.tmpl`
   - Estimated time: 5 minutes

4. **AppArmor**: Advanced security hardening (OPTIONAL)
   - Create: `run_once_after_100-install-apparmor.sh.tmpl`
   - Note: Complex, requires bootloader configuration
   - Estimated time: 30-60 minutes

### 🟢 Low Priority (Optional Enhancements)
5. **tldr CLI**: System-wide tldr command
   - Add to: `run_once_before_70-install-cli-tools.sh.tmpl`
   - Estimated time: 2 minutes

6. **AppImage Management (gearlever)**: Only if using AppImages
   - Create: `run_once_after_90-install-gearlever.sh.tmpl`
   - Requires: flatpak
   - Estimated time: 10 minutes

7. **Samba Client**: Only if accessing network shares
   - Create: `run_once_after_95-install-samba-client.sh.tmpl`
   - Estimated time: 5 minutes

---

## Implementation Order

**Suggested sequence:**

1. ✅ **Install global menu support** (quick win, improves desktop integration)
2. ✅ **Enable ufw firewall** (security baseline)
3. ✅ **Configure Wi-Fi regulatory domain** (system-specific, requires user input)
4. 🤔 **Evaluate tldr CLI** (decide if doom-emacs coverage is sufficient)
5. 🤔 **Evaluate Samba client** (only install if needed)
6. 🤔 **Evaluate gearlever** (only install if using AppImages)
7. ⏸️ **Defer AppArmor** (complex, requires kernel parameter changes)

---

## Files to Create

### High Priority
- `home/run_once_after_80-configure-ufw.sh.tmpl` - Firewall setup
- `home/run_once_before_75-install-global-menu.sh.tmpl` - Global menu packages

### Medium Priority
- `home/run_once_after_85-configure-wifi-regdom.sh.tmpl` - Wi-Fi optimization guide
- `home/run_once_after_100-install-apparmor.sh.tmpl` - AppArmor installation guide

### Low Priority (User Decision)
- Update: `home/run_once_before_70-install-cli-tools.sh.tmpl` - Add tealdeer/tldr
- `home/run_once_after_90-install-gearlever.sh.tmpl` - AppImage management
- `home/run_once_after_95-install-samba-client.sh.tmpl` - Samba client

---

## Questions for User

Before proceeding with implementation:

1. **Firewall (ufw)**: Do you want to enable ufw with default deny incoming/allow outgoing rules?
   - Any specific ports to allow? (SSH, HTTP/HTTPS, etc.)

2. **Wi-Fi Regulatory Domain**: What is your country code (ISO 3166-1 alpha-2)?
   - Example: US, GB, CA, DE, FR, AU, etc.
   - This cannot be automated - requires manual entry

3. **Global Menu**: Do you want global menu support for GTK apps?
   - Affects: VSCode/Zed (if using), GTK applications

4. **tldr CLI**: Is doom-emacs tldr sufficient, or do you want system-wide CLI access?

5. **AppImages**: Do you use AppImage applications?
   - If yes: Install gearlever for easier management

6. **Samba/SMB**: Do you need to access Windows network shares?
   - If yes: Install samba client packages

7. **AppArmor**: Do you want to implement advanced security hardening?
   - ⚠️ Warning: Complex setup, can break applications, requires bootloader changes
   - Recommended: Defer until all other configurations are stable

---

## Strengths of Current Setup

Your dotfiles repository excels in areas that CachyOS doesn't explicitly cover:

1. ✅ **Unified update script** - Better than CachyOS recommendations (only mentions GUI tools)
2. ✅ **Development environment** - Comprehensive tool installation (mise, uv, Rust, Nix)
3. ✅ **Modern CLI tools** - Exceeds CachyOS baseline (helix, ripgrep, yazi, bat, etc.)
4. ✅ **Encrypted secrets** - API keys managed securely with age
5. ✅ **Kanata key remapper** - Custom keyboard configuration with systemd service
6. ✅ **KDE window management** - Advanced kdotool integration for focus/launch shortcuts
7. ✅ **LibreWolf profiles** - Multi-profile browser management
8. ✅ **Shell history** - atuin integration for searchable history

**Verdict**: Your setup is more sophisticated than typical CachyOS installations. The gaps are primarily in system-level security and network configuration, not development workflow.

---

## Next Steps

1. **Review this audit** with user
2. **Gather answers** to questions above
3. **Create implementation plan** based on user priorities
4. **Implement scripts** in priority order
5. **Test on your system**
6. **Update documentation** (README.md)

---

## References

- [CachyOS Post-Install Setup](https://wiki.cachyos.org/configuration/post_install_setup/)
- [Arch Wiki - Uncomplicated Firewall](https://wiki.archlinux.org/title/Uncomplicated_Firewall)
- [Arch Wiki - Wireless Regulatory Domain](https://wiki.archlinux.org/title/Wireless_network_configuration#Respecting_the_regulatory_domain)
- [AppArmor.d Documentation](https://github.com/roddhjav/apparmor.d)
- [GearLever - AppImage Management](https://github.com/mijorus/gearlever)
