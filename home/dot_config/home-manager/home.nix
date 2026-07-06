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

    # Databases
    postgresql_17  # PostgreSQL for Absurd durable workflows
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
