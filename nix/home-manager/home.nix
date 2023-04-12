{
  config,
  pkgs,
  ...
}: {
  home = {
    homeDirectory = "/home/wmendoza";

    packages = with pkgs; [
      nodejs
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
