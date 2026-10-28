uuid := "movement-breaks@codebymarshall.github.io"

# Run the timer tests.
test:
    gjs -m tests/movementTimer.test.js

# Build dist/{{uuid}}.shell-extension.zip.
pack:
    glib-compile-schemas --strict --dry-run schemas
    mkdir -p dist
    gnome-extensions pack --force --out-dir dist \
        --extra-source movementTimer.js \
        --extra-source LICENSE \
        --schema schemas/org.gnome.shell.extensions.movement-breaks.gschema.xml

# Install into ~/.local/share/gnome-shell/extensions. Log out and back in to load it on Wayland.
install: pack
    gnome-extensions install --force dist/{{uuid}}.shell-extension.zip

# Enable, disable, and re-enable the extension in a headless GNOME Shell with throwaway settings.
check: pack
    scripts/headless-check.sh dist/{{uuid}}.shell-extension.zip

# Open a GNOME Shell devkit window with the extension enabled. Settings live in
# a temporary directory, exported before D-Bus starts, so your session is untouched.
devkit: install
    #!/bin/bash
    set -euo pipefail
    config=$(mktemp -d)
    trap 'rm -rf "$config"' EXIT
    XDG_CONFIG_HOME=$config dbus-run-session -- bash -c \
        'gsettings set org.gnome.shell enabled-extensions "[\"{{uuid}}\"]" && gnome-shell --devkit --wayland'

# Remove the installed copy.
uninstall:
    gnome-extensions uninstall {{uuid}}
