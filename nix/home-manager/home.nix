{
  config,
  pkgs,
  ...
}: {
  home = {
    homeDirectory = "/home/wmendoza";

    packages = with pkgs; [
      bat
      bottom
      coursier
      curl
      difftastic
      direnv
      dive
      docker
      docker-compose
      duf
      exa
      fd
      fx
      fzf
      gh
      git
      git-lfs
      glow
      gnu-units
      gnupg
      helix
      htop
      ipfetch
      keychain
      less
      mosh
      ncdu
      neofetch
      neovim
      ngrok
      nix-direnv
      ripgrep
      ripgrep-all
      tig
      tree
      unzip
      wget
      zellij
      zip
      zoxide
      zsh
    ];

    stateVersion = "22.11";
    username = "wmendoza";
  };

  nixpkgs.config = {
    allowUnfree = true;
    allowUnfreePredicate = _: true;
  };

  programs.home-manager.enable = true;
}
