<img src="assets/icon.svg" alt="Movement Breaks icon" width="64" height="64">

# Movement Breaks

Movement Breaks is a GNOME Shell 51 extension that counts your active computer time in the top bar and prompts a five-minute movement break after 30 or 50 active minutes.

## What it does

The panel shows an alarm icon and a countdown. When the countdown reaches zero, the extension starts a five-minute movement break. It sends a notification with a sound, and the panel icon and countdown turn orange while the break runs. A second notification and sound mark the end of the break, and a new work countdown starts.

Each break suggests one activity. The activities rotate in this order:

1. Brisk walk.
2. Chair squats or sit-to-stands, then a gentle walk.
3. Wall or sturdy-desk push-ups, then a gentle walk.
4. Marching in place with calf raises.
5. A walk with gentle shoulder rolls and upper-body stretches.

The sounds are the `alarm-clock-elapsed` and `complete` events from the freedesktop sound theme. GNOME plays them with the notifications, so they follow your notification sound setting. If your theme lacks them, the extension stays silent.

## How to use it

Click the panel item to open the menu. It shows the countdown and the current state, plus the current activity during a break. It also has these items:

- The two presets, 30 work / 5 break and 50 work / 5 break. Switching presets restarts the work countdown.
- Pause or Start.
- Reset focus, which restarts the work countdown.
- Move now, which starts a break immediately, even while paused.
- A safety note.

The extension keeps two settings, `preset` and `running`. The menu sets both, and GNOME stores them with the extension's schema.

## Presets

- Health 30 / 5 is the default. It prompts 5 minutes of movement after 30 active minutes.
- Focus 50 / 5 prompts 5 minutes of movement after 50 active minutes.

No other durations are available.

### Evidence

The 30/5 default is based on a small randomized crossover dose-response study in which five minutes of light walking every 30 minutes was the only tested interruption dose that significantly reduced the glucose response. All tested interruption doses reduced systolic blood pressure relative to uninterrupted sitting.

- [Breaking Up Prolonged Sitting to Improve Cardiometabolic Risk](https://pubmed.ncbi.nlm.nih.gov/36728338/)

The 50/5 alternate follows occupational screen-work guidance favoring short, frequent breaks. The UK Health and Safety Executive gives five to ten minutes after 50 to 60 minutes of continuous screen or keyboard work as an example; OSHA recommends five minutes away from computer tasks each hour.

- [HSE display-screen break guidance](https://www.hse.gov.uk/contact/faqs/vdubreaks.htm)
- [OSHA Computer Workstations eTool](https://www.osha.gov/etools/computer-workstations/work-process)

### Safety limits

These are behavior prompts, not medical advice or a replacement for regular exercise. Individual needs vary. Stop or modify an activity if it causes pain, dizziness, unusual shortness of breath, or instability, and follow any clinician-provided restrictions.

## Idle and lock behavior

- After 3 minutes without keyboard or pointer input, the work countdown pauses and the panel shows IDLE. It resumes on the next input.
- A movement break keeps counting while you are away.
- The work countdown does not advance when a tick arrives more than 10 seconds late, for example after a suspend.
- GNOME disables extensions while the screen is locked. The extension saves its countdown when it is disabled and restores it when it is enabled again. It restores the countdown only if the preset is unchanged and the save is less than 15 minutes old. Otherwise it starts a fresh countdown.
- On restore, work time does not advance. A break loses the time that passed while locked. If that uses up the break, a new work countdown starts without a notification.

## Install

### From extensions.gnome.org (once listed)

Install it from the extension's page on extensions.gnome.org with the browser integration or the Extension Manager app.

### From source

You need `just`, `glib-compile-schemas`, and the `gnome-extensions` tool.

```
git clone https://github.com/codebymarshall/gnome-movement-breaks
cd gnome-movement-breaks
just install
```

On Wayland, GNOME Shell only sees a new extension after a restart of the session. Log out and log back in, then run:

```
gnome-extensions enable movement-breaks@codebymarshall.github.io
```

`just uninstall` removes the installed copy.

## Testing without logging out

`just devkit` installs the extension and opens a nested GNOME Shell window with it enabled. The window uses a temporary settings directory, so your session settings stay untouched. Notifications appear inside that window. Idle detection counts only input inside the window, so the countdown pauses after 3 minutes without input there, whatever you do in the rest of your desktop.

`just devkit` needs `gnome-shell` and `dbus-run-session`.

## Development

- `just test` runs the timer unit tests with `gjs`. The timer logic in `movementTimer.js` has no GNOME imports, so the tests drive it with a fake clock.
- `just check` packs the extension and loads it in a headless GNOME Shell with throwaway settings. It checks that the extension enables, writes `saved-state` on disable, and clears it on the next enable, and that the shell logs no JavaScript errors from the extension. It does not test the menu, the notifications, or the restored countdown. It needs `gnome-shell` and `dbus-run-session`.
- `just pack` builds `dist/movement-breaks@codebymarshall.github.io.shell-extension.zip`.

## How it differs from GNOME's Wellbeing reminders

GNOME 48 and later include break reminders under Settings > Wellbeing. This extension differs in three ways. It counts only active time, it pauses when you are idle, and it rotates exercise prompts.

## License

MIT. See [LICENSE](LICENSE).
