// Run with `just test`. Exits with a non-zero status if any test fails.
import {
    ACTIVITIES,
    BREAK_FINISHED,
    BREAK_STARTED,
    BREAK_SECONDS,
    MAX_SNAPSHOT_AGE_MS,
    MovementTimer,
    PRESETS,
} from '../movementTimer.js';

let failures = 0;

function test(name, fn) {
    try {
        fn();
        print(`ok - ${name}`);
    } catch (e) {
        failures++;
        print(`not ok - ${name}\n  ${e.message}`);
    }
}

function equal(actual, expected, what) {
    if (actual !== expected)
        throw new Error(`${what}: expected ${expected}, got ${actual}`);
}

// Ticks once a second from `start` and returns the events seen.
function run(timer, start, seconds, away = false) {
    const events = [];
    for (let i = 1; i <= seconds; i++) {
        const event = timer.tick(start + i * 1000, away);
        if (event)
            events.push(event);
    }
    return events;
}

const T0 = 1_000_000;
const WORK = PRESETS['health-30'].workSeconds;
const newTimer = (running = true) => new MovementTimer('health-30', running, T0);
const restore = (snapshot, nowMs, preset = 'health-30') =>
    MovementTimer.restore(snapshot, preset, true, nowMs);

test('work leads to a break, which leads back to work', () => {
    const timer = newTimer();
    equal(run(timer, T0, WORK - 1).length, 0, 'events before the end');
    equal(timer.tick(T0 + WORK * 1000, false), BREAK_STARTED, 'work end');
    equal(timer.phase, 'break', 'phase');
    equal(timer.remainingSeconds, BREAK_SECONDS, 'break length');
    equal(timer.activityIndex, 0, 'first activity');
    equal(run(timer, T0 + WORK * 1000, BREAK_SECONDS).join(), BREAK_FINISHED, 'break end');
    equal(timer.phase, 'work', 'back to work');
    equal(timer.remainingSeconds, WORK, 'fresh work interval');
});

test('idle time pauses work but not a break', () => {
    const timer = newTimer();
    run(timer, T0, 60, true);
    equal(timer.remainingSeconds, WORK, 'work while away');
    timer.startBreak(T0);
    run(timer, T0, 60, true);
    equal(timer.remainingSeconds, BREAK_SECONDS - 60, 'break while away');
});

test('a work tick more than 10 seconds late is ignored', () => {
    const timer = newTimer();
    timer.tick(T0 + 11_000, false);
    equal(timer.remainingSeconds, WORK, 'after 11 seconds');
    timer.tick(T0 + 21_000, false);
    equal(timer.remainingSeconds, WORK - 10, 'after 10 seconds');
});

test('a paused timer does not count the pause', () => {
    const timer = newTimer();
    timer.setRunning(false, T0);
    run(timer, T0, 30);
    equal(timer.remainingSeconds, WORK, 'while paused');
    timer.setRunning(true, T0 + 30_000);
    timer.tick(T0 + 31_000, false);
    equal(timer.remainingSeconds, WORK - 1, 'after resuming');
});

test('changing the preset restarts work', () => {
    const timer = newTimer();
    timer.startBreak(T0);
    timer.setPreset('focus-50', T0);
    equal(timer.phase, 'work', 'phase');
    equal(timer.remainingSeconds, PRESETS['focus-50'].workSeconds, 'length');
});

test('move now works while paused and the activities rotate', () => {
    const timer = newTimer(false);
    const indexes = [];
    for (let i = 0; i <= ACTIVITIES.length; i++) {
        equal(timer.startBreak(T0), BREAK_STARTED, 'event');
        indexes.push(timer.activityIndex);
    }
    equal(timer.running, true, 'running');
    equal(indexes[1], 1, 'second activity');
    equal(indexes[ACTIVITIES.length], 0, 'wraps around');
});

test('restore keeps a fresh snapshot from the same preset', () => {
    const before = newTimer();
    run(before, T0, 100);
    const timer = restore(before.snapshot(T0 + 100_000), T0 + 700_000);
    equal(timer.remainingSeconds, WORK - 100, 'work did not advance');

    before.startBreak(T0);
    const resumed = restore(before.snapshot(T0), T0 + 60_000);
    equal(resumed.phase, 'break', 'phase');
    equal(resumed.remainingSeconds, BREAK_SECONDS - 60, 'break advanced');
    equal(resumed.activityIndex, 0, 'activity');
});

test('restore ignores a stale snapshot', () => {
    const saved = newTimer().snapshot(T0);
    saved.remainingSeconds = 100;
    equal(restore(saved, T0 + MAX_SNAPSHOT_AGE_MS).remainingSeconds, 100, 'at the limit');
    equal(restore(saved, T0 + MAX_SNAPSHOT_AGE_MS + 1).remainingSeconds, WORK, 'past the limit');
});

test('restore ignores a snapshot from another preset', () => {
    const timer = restore(newTimer().snapshot(T0), T0, 'focus-50');
    equal(timer.remainingSeconds, PRESETS['focus-50'].workSeconds, 'remaining');
});

test('restore starts work when the break ran out', () => {
    const before = newTimer();
    before.startBreak(T0);
    const timer = restore(before.snapshot(T0), T0 + BREAK_SECONDS * 1000 + 60_000);
    equal(timer.phase, 'work', 'phase');
    equal(timer.remainingSeconds, WORK, 'remaining');
    equal(timer.activityIndex, 0, 'activity kept');
});

test('restore ignores corrupt data', () => {
    const good = newTimer().snapshot(T0);
    const bad = [
        null,
        {},
        {...good, phase: 'nap'},
        {...good, remainingSeconds: '60'},
        {...good, remainingSeconds: NaN},
        {...good, remainingSeconds: WORK + 1},
        {...good, activityIndex: ACTIVITIES.length},
        {...good, savedMs: '1000000'},
        {...good, savedMs: T0 + 1},
    ];
    for (const snapshot of bad)
        equal(restore(snapshot, T0).remainingSeconds, WORK, JSON.stringify(snapshot));
});

if (failures > 0) {
    print(`${failures} failed`);
    imports.system.exit(1);
}
