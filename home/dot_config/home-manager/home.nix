{ pkgs, ... }:

{
  home.username = "well";
  home.homeDirectory = "/home/well";
  home.stateVersion = "24.11";

  home.packages = with pkgs; [
    # Runtimes — replaces mise global tools
    # Unversioned aliases: nixpkgs repoints these to the current stable/LTS
    # release, so `nix flake update && home-manager switch` tracks new majors
    # automatically (no manual attribute bump needed). Requires Node 20+ for Pi.
    nodejs     # Node.js current LTS
    go         # Go current stable
    gopls      # Go language server

    # Databases
    # Pinned deliberately: Postgres major upgrades need `pg_upgrade` /
    # a data migration step, not just a binary swap — do not switch this
    # to an unversioned alias.
    postgresql_17  # PostgreSQL for Absurd durable workflows

    devenv     # Declarative dev environments (was: standalone nix-profile install)
  ];

  systemd.user.services.absurd-postgres = {
    Unit = {
      Description = "Absurd PostgreSQL (user-level, port 5433)";
      After = [ "default.target" ];
    };
    Service = {
      Type = "simple";
      Environment = "PGDATA=/home/well/.local/share/absurd/pgdata";
      ExecStartPre = toString (pkgs.writeShellScript "absurd-pg-init" ''
        PGDATA="/home/well/.local/share/absurd/pgdata"
        if [ ! -f "$PGDATA/PG_VERSION" ]; then
          mkdir -p "$PGDATA"
          ${pkgs.postgresql_17}/bin/initdb -D "$PGDATA" --auth=trust --no-locale --encoding=UTF8
          cat >> "$PGDATA/postgresql.conf" <<EOF
listen_addresses = '127.0.0.1'
port = 5433
unix_socket_directories = '$PGDATA'
EOF
        fi
      '');
      ExecStart = "${pkgs.postgresql_17}/bin/postgres -D /home/well/.local/share/absurd/pgdata";
      Restart = "on-failure";
      RestartSec = 5;
    };
    Install = {
      WantedBy = [ "default.target" ];
    };
  };

  programs.home-manager.enable = true;
}
