{ pkgs, ... }:

{
  home.username = "well";
  home.homeDirectory = "/home/well";
  home.stateVersion = "24.11";

  home.packages = with pkgs; [
    # Runtimes — replaces mise global tools
    nodejs_22  # Node.js LTS (Pi requires 20+)
    go_1_26    # Go stable
    gopls      # Go language server
  ];

  programs.home-manager.enable = true;
}
