import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import St from 'gi://St';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as MessageTray from 'resource:///org/gnome/shell/ui/messageTray.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import {
    ACTIVITIES,
    BREAK_FINISHED,
    BREAK_STARTED,
    IDLE_PAUSE_SECONDS,
    MovementTimer,
    PRESETS,
    formatDuration,
} from './movementTimer.js';

const ICON_NAME = 'alarm-symbolic';

const MovementIndicator = GObject.registerClass(
class MovementIndicator extends PanelMenu.Button {
    _init(extension) {
        super._init(0.5, 'Movement Breaks');

        const box = new St.BoxLayout({style_class: 'panel-status-menu-box'});
        box.add_child(new St.Icon({
            icon_name: ICON_NAME,
            style_class: 'system-status-icon',
        }));
        this._panelLabel = new St.Label({
            style_class: 'movement-breaks-countdown',
            y_align: Clutter.ActorAlign.CENTER,
        });
        box.add_child(this._panelLabel);
        this.add_child(box);

        this._status = this._addNote('');
        this._activity = this._addNote('');
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        this._presetItems = new Map();
        for (const [key, preset] of Object.entries(PRESETS)) {
            const item = this.menu.addAction(preset.label, () => extension.setPreset(key));
            this._presetItems.set(key, item);
        }
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        this._runningItem = this.menu.addAction('Pause', () => extension.toggleRunning());
        this.menu.addAction('Reset focus', () => extension.resetFocus());
        this.menu.addAction('Move now', () => extension.moveNow());
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        this._addNote('Stop or modify any movement that causes pain or dizziness.');
    }

    _addNote(text) {
        const item = new PopupMenu.PopupMenuItem(text, {reactive: false, can_focus: false});
        item.label.clutter_text.line_wrap = true;
        item.label.add_style_class_name('movement-breaks-note');
        this.menu.addMenuItem(item);
        return item;
    }

    update(timer, away) {
        const idle = timer.running && timer.phase === 'work' && away;
        let state = 'Active computer work';
        if (!timer.running)
            state = 'Paused';
        else if (timer.phase === 'break')
            state = 'Movement break';
        else if (away)
            state = 'Away, timer paused';

        const countdown = formatDuration(timer.remainingSeconds);
        this._panelLabel.text = idle ? 'IDLE' : countdown;
        if (timer.running && timer.phase === 'break')
            this.add_style_class_name('movement-breaks-active');
        else
            this.remove_style_class_name('movement-breaks-active');
        this._status.label.text = `${countdown}, ${state}`;

        const activity = ACTIVITIES[timer.activityIndex];
        this._activity.visible = timer.phase === 'break';
        this._activity.label.text = `${activity.title}. ${activity.instruction}`;

        for (const [key, item] of this._presetItems) {
            item.setOrnament(key === timer.preset
                ? PopupMenu.Ornament.DOT
                : PopupMenu.Ornament.NONE);
        }
        this._runningItem.label.text = timer.running ? 'Pause' : 'Start';
    }
});

export default class MovementBreaksExtension extends Extension {
    enable() {
        this._settings = this.getSettings();

        let snapshot = null;
        try {
            snapshot = JSON.parse(this._settings.get_string('saved-state'));
        } catch {
            // Nothing saved, or the text is corrupt.
        }
        // Clear it so a snapshot is only ever used by the next enable.
        this._settings.reset('saved-state');

        this._timer = MovementTimer.restore(
            snapshot,
            this._settings.get_string('preset'),
            this._settings.get_boolean('running'),
            Date.now());
        this._away = false;
        this._idleMonitor = global.backend.get_core_idle_monitor();

        this._indicator = new MovementIndicator(this);
        Main.panel.addToStatusArea(this.uuid, this._indicator);

        this._settings.connectObject(
            'changed::preset', () => {
                this._timer.setPreset(this._settings.get_string('preset'), Date.now());
                this._refresh();
            },
            'changed::running', () => {
                this._timer.setRunning(this._settings.get_boolean('running'), Date.now());
                this._refresh();
            },
            this);

        this._tickId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 1, () => {
            this._away = this._idleMonitor.get_idletime() >= IDLE_PAUSE_SECONDS * 1000;
            this._notifyEvent(this._timer.tick(Date.now(), this._away));
            this._refresh();
            return GLib.SOURCE_CONTINUE;
        });
        this._refresh();
    }

    disable() {
        // The lock screen disables extensions. Saving the countdown lets
        // enable() pick it up again after unlock.
        this._settings.set_string('saved-state', JSON.stringify(this._timer.snapshot(Date.now())));

        GLib.Source.remove(this._tickId);
        this._tickId = null;
        this._settings.disconnectObject(this);
        this._settings = null;
        this._source?.destroy();
        this._source = null;
        this._indicator.destroy();
        this._indicator = null;
        this._idleMonitor = null;
        this._timer = null;
        this._away = null;
    }

    setPreset(preset) {
        this._settings.set_string('preset', preset);
    }

    toggleRunning() {
        this._settings.set_boolean('running', !this._timer.running);
    }

    resetFocus() {
        this._timer.startWork(Date.now());
        this._refresh();
    }

    moveNow() {
        this._notifyEvent(this._timer.startBreak(Date.now()));
        this._settings.set_boolean('running', true);
        this._refresh();
    }

    _refresh() {
        this._indicator.update(this._timer, this._away);
    }

    _notifyEvent(event) {
        if (event === BREAK_STARTED) {
            this._notify('Time to move',
                ACTIVITIES[this._timer.activityIndex].instruction, 'alarm-clock-elapsed');
        } else if (event === BREAK_FINISHED) {
            this._notify('Movement break over',
                'Your next work interval starts now.', 'complete');
        }
    }

    _notify(title, body, soundName) {
        if (!this._source) {
            this._source = new MessageTray.Source({title: 'Movement Breaks', iconName: ICON_NAME});
            this._source.connect('destroy', () => (this._source = null));
            Main.messageTray.add(this._source);
        }
        this._source.addNotification(new MessageTray.Notification({
            source: this._source,
            title,
            body,
            sound: new MessageTray.Sound(null, soundName),
        }));
    }
}
