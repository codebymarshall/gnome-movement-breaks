// The countdown state machine. It imports nothing from GNOME, so the tests
// can drive it with a fake clock.

export const PRESETS = {
    'health-30': {label: '30 work / 5 break', workSeconds: 30 * 60},
    'focus-50': {label: '50 work / 5 break', workSeconds: 50 * 60},
};

export const BREAK_SECONDS = 5 * 60;

export const ACTIVITIES = [
    {
        title: 'Brisk walk',
        instruction: 'Step away from the screen and walk briskly for 5 minutes.',
    },
    {
        title: 'Squats and walk',
        instruction: 'Do 8 to 12 chair squats or sit-to-stands, then walk gently for the rest of the 5 minutes.',
    },
    {
        title: 'Push-ups and walk',
        instruction: 'Do 8 to 12 wall or sturdy-desk push-ups, then walk gently for the rest of the 5 minutes.',
    },
    {
        title: 'March and calf raises',
        instruction: 'March in place for 3 minutes, do 10 to 15 calf raises, then keep moving until 5 minutes are up.',
    },
    {
        title: 'Walk and mobility',
        instruction: 'Walk for 4 minutes, then finish with gentle shoulder rolls and upper-body stretches.',
    },
];

export const IDLE_PAUSE_SECONDS = 3 * 60;

// A work tick this late means the machine suspended, so the gap was not work.
const MAX_WORK_TICK_SECONDS = 10;

// An older snapshot is left over from a crash or logout, not a lock screen.
export const MAX_SNAPSHOT_AGE_MS = 15 * 60 * 1000;

export const BREAK_STARTED = 'break-started';
export const BREAK_FINISHED = 'break-finished';

export function formatDuration(totalSeconds) {
    const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
    const seconds = String(totalSeconds % 60).padStart(2, '0');
    return `${minutes}:${seconds}`;
}

function isCount(value, max) {
    return Number.isInteger(value) && value >= 0 && value <= max;
}

export class MovementTimer {
    constructor(preset, running, nowMs) {
        this.preset = preset;
        this.running = running;
        this.phase = 'work';
        this.remainingSeconds = PRESETS[preset].workSeconds;
        // The first break advances this to 0.
        this.activityIndex = ACTIVITIES.length - 1;
        this._lastTickMs = nowMs;
    }

    // Rebuilds a timer from snapshot() output, or returns a fresh one if the
    // snapshot is unusable. Work time does not advance while the extension was
    // disabled. A break loses the elapsed wall time and, if it ran out, work
    // starts again without an event.
    static restore(snapshot, preset, running, nowMs) {
        const timer = new MovementTimer(preset, running, nowMs);
        const {phase, remainingSeconds, activityIndex, savedMs} = snapshot ?? {};
        const maxSeconds = phase === 'break' ? BREAK_SECONDS : PRESETS[preset].workSeconds;
        const ageMs = nowMs - savedMs;
        const valid = snapshot?.preset === preset &&
            (phase === 'work' || phase === 'break') &&
            isCount(remainingSeconds, maxSeconds) &&
            isCount(activityIndex, ACTIVITIES.length - 1) &&
            Number.isFinite(savedMs) && ageMs >= 0 && ageMs <= MAX_SNAPSHOT_AGE_MS;
        if (!valid)
            return timer;

        timer.phase = phase;
        timer.remainingSeconds = remainingSeconds;
        timer.activityIndex = activityIndex;
        if (phase === 'break' && running) {
            timer.remainingSeconds -= Math.floor(ageMs / 1000);
            if (timer.remainingSeconds <= 0)
                timer.startWork(nowMs);
        }
        return timer;
    }

    snapshot(nowMs) {
        return {
            preset: this.preset,
            phase: this.phase,
            remainingSeconds: this.remainingSeconds,
            activityIndex: this.activityIndex,
            savedMs: nowMs,
        };
    }

    // Returns BREAK_STARTED, BREAK_FINISHED, or null.
    tick(nowMs, away) {
        // GLib timers can fire slightly early, so always count at least a second.
        const elapsed = Math.max(1, Math.floor((nowMs - this._lastTickMs) / 1000));
        this._lastTickMs = nowMs;

        // Idle time and suspends pause work. A break keeps counting through both.
        if (!this.running || (this.phase === 'work' && (away || elapsed > MAX_WORK_TICK_SECONDS)))
            return null;

        this.remainingSeconds -= elapsed;
        if (this.remainingSeconds > 0)
            return null;

        if (this.phase === 'work')
            return this.startBreak(nowMs);
        this.startWork(nowMs);
        return BREAK_FINISHED;
    }

    startBreak(nowMs) {
        this.running = true;
        this.phase = 'break';
        this.remainingSeconds = BREAK_SECONDS;
        this.activityIndex = (this.activityIndex + 1) % ACTIVITIES.length;
        this._lastTickMs = nowMs;
        return BREAK_STARTED;
    }

    startWork(nowMs) {
        this.phase = 'work';
        this.remainingSeconds = PRESETS[this.preset].workSeconds;
        this._lastTickMs = nowMs;
    }

    setPreset(preset, nowMs) {
        if (preset === this.preset)
            return;
        this.preset = preset;
        this.startWork(nowMs);
    }

    setRunning(running, nowMs) {
        this.running = running;
        this._lastTickMs = nowMs;
    }
}
