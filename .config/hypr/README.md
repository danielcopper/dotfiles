# Hyprland Config

## Struktur

```
hyprland.conf          # Hauptdatei, sourced alles andere
colors.conf            # Von matugen generiert (nicht manuell editieren)
config/
  monitors.conf        # Monitor-Setup
  programs.conf        # $terminal, $fileManager, $menu
  autostart.conf       # Daemons beim Login
  environment.conf     # Env vars
  appearance.conf      # Gaps, borders, blur, animations
  input.conf           # Tastatur, Maus, Touchpad
  keybindings.conf     # Alle Shortcuts
  rules.conf           # Window/Layer rules
```

## Wichtige Keybindings

| Taste | Aktion |
|-------|--------|
| `Super + Space` | Walker (App Launcher) |
| `Super + Return` | Terminal |
| `Super + C` | Fenster schließen |
| `Super + V` | Clipboard History |
| `Super + Alt + B` | Bluetooth Menu (bzmenu) |
| `Super + Alt + N` | Network Menu |
| `Super + Alt + P` | Logout Menu (wlogout) |
| `Print` | Screenshot Region |

## Theming (Matugen)

Farben werden dynamisch aus Wallpaper generiert:
```bash
matugen image /pfad/zum/wallpaper.jpg
```

Matugen generiert:
- `~/.config/hypr/colors.conf`
- `~/.config/walker/themes/matugen/style.css`
- `~/.config/waybar/colors.css`
- `~/.config/rofi/colors.rasi`
- etc.

Config: `~/.config/matugen/config.toml`

## Walker + Elephant

Walker = Frontend (GUI)
Elephant = Backend (Datenquelle)

```bash
# Benötigte Pakete
paru -S walker-bin elephant elephant-desktopapplications-bin elephant-clipboard-bin
```

Beide starten automatisch via `autostart.conf`.

## Waybar

Config: `~/.config/waybar/config`
Style: `~/.config/waybar/style.css` (importiert `colors.css` von matugen)

Klick auf Bluetooth/Network öffnet bzmenu bzw. networkmanager_dmenu.
