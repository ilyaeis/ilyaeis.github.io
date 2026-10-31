#!/usr/bin/env python3
"""Camera smoothness check for the journey (dev only, not part of the site).

Runs dev/camlog.html in headless Chrome for each dt profile, saves the
per-frame log, draws graphs and prints spikes that break the thresholds.

    python3 -m http.server 8000            # in the repo root
    python3 analysis/camera_smoothness.py OUT_DIR [--label NAME] [--dt 30 60 144 jitter]
    python3 analysis/camera_smoothness.py OUT_DIR --compare before after
    python3 analysis/camera_smoothness.py OUT_DIR --label portal --params dim=1
        (extra camlog.html params: dim=S enters the first portal, stays S s, comes back)

Thresholds ("smooth" = no metric goes above its limit):
  rot speed  <= 90 deg/s   Whole camera orientation (view direction and roll),
                           panel shift included. 90 deg/s sweeps one screen
                           width (~87 deg) in about 1 s. Faster reads as a whip pan.
  rot accel  <= 400 deg/s2 A turn may not start or stop in a snap: reaching
                           90 deg/s takes at least ~0.25 s.
  cam speed  <= 30 u/s     The comet peaks near 1.5 x 9 u/s. More is a jump.
  cam accel  <= 40 u/s2    About 3x the comet's own ease-in/out peak.
  cam jerk   <= 400 u/s3   Measured over a 50 ms window, so a one-frame
                           step in acceleration counts the same at any dt.
  look speed <= 30 u/s     The look target must not jump either.
  Tunnel flights only (frames logged with tunnel=1): cam/look speed <= 120 u/s,
  cam accel <= 160 u/s2, cam jerk <= 1600 u/s3. The tunnel runs at 2x pace
  (TUNNEL_TIME_SCALE in orchestrator.js): the comet rushes down the straight
  middle of each hop at ~75 u/s, and at twice the speed over the same path
  acceleration grows 4x (v^2 x curvature, v dv/ds), so these are the
  open-space limits scaled for that. Rotation limits are the same everywhere,
  so the view never whips.
"""
import argparse, html, json, os, re, subprocess, sys
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

PHASE_NAMES = {0: 'INTRO', 1: 'ROCKET_EXIT', 2: 'TRAVEL', 3: 'VIEW', 4: 'PORTAL_IN', 5: 'DIMENSION', 6: 'PORTAL_OUT'}
LIMITS = {  # metric: (limit, unit)
    'rot_speed': (90, 'deg/s'),
    'rot_accel': (400, 'deg/s2'),
    'cam_speed': (30, 'u/s'),
    'cam_accel': (40, 'u/s2'),
    'cam_jerk': (400, 'u/s3'),
    'look_speed': (30, 'u/s'),
}
JERK_WIN = 0.05  # s
# Tunnel flights only (frames logged with tunnel=1): see the header
TUNNEL_LIMITS = {'cam_speed': 120, 'look_speed': 120, 'cam_accel': 160, 'cam_jerk': 1600}


def run_chrome(url, dt, params=''):
    out = subprocess.run(
        ['google-chrome', '--headless=new', '--disable-gpu', '--window-size=1280,800',
         '--virtual-time-budget=20000', '--dump-dom', f'{url}/dev/camlog.html?dt={dt}' + (f'&{params}' if params else '')],
        capture_output=True, text=True, timeout=600).stdout
    m = re.search(r'<pre id="out">(.*?)</pre>', out, re.S)
    if not m or not m.group(1).strip():
        sys.exit(f'no log for dt={dt} (is the server running at {url}?)')
    return json.loads(html.unescape(m.group(1)))


def window_diff(t, x, win):
    """(x(t+win/2) - x(t-win/2)) / win, by linear interpolation: dt-independent."""
    lo = np.interp(t - win / 2, t, x)
    hi = np.interp(t + win / 2, t, x)
    return (hi - lo) / win


def metrics(log):
    f = log['frames']
    t = np.array([x['t'] for x in f])
    cam = np.array([x['cam'] for x in f])
    look = np.array([x['look'] for x in f])
    comet = np.array([x['comet'] for x in f])
    head = np.array([x['head'] for x in f])
    fwd = np.array([x['fwd'] for x in f])
    ray = np.array([x['ray'] for x in f])
    up = np.array([x['up'] for x in f])
    # Orientation frame from the screen-center ray (shift included) and camera up
    right = np.cross(ray, up)
    right /= np.linalg.norm(right, axis=1, keepdims=True)
    up2 = np.cross(right, ray)
    R = np.stack([right, up2, ray], axis=2)
    M = np.einsum('nki,nkj->nij', R[1:], R[:-1])          # R1^T R0
    cos = (np.trace(M, axis1=1, axis2=2) - 1) / 2
    sin = 0.5 * np.linalg.norm(np.stack([M[:, 2, 1] - M[:, 1, 2], M[:, 0, 2] - M[:, 2, 0],
                                         M[:, 1, 0] - M[:, 0, 1]], axis=1), axis=1)
    ang = np.degrees(np.arctan2(sin, cos))                  # precise at small angles
    dts = np.diff(t)
    rot = np.concatenate([[0], ang / dts])
    vel = np.gradient(cam, t, axis=0)
    speed = np.linalg.norm(vel, axis=1)
    acc = np.gradient(vel, t, axis=0)
    jerk = np.stack([window_diff(t, acc[:, i], JERK_WIN) for i in range(3)], axis=1)
    return {
        't': t,
        'phase': np.array([x['phase'] for x in f]),
        'stop': np.array([x['stop'] for x in f]),
        'rot_speed': rot,
        'rot_accel': np.abs(window_diff(t, rot, JERK_WIN)),
        'cam_speed': speed,
        'cam_accel': np.linalg.norm(acc, axis=1),
        'cam_jerk': np.linalg.norm(jerk, axis=1),
        'look_speed': np.linalg.norm(np.gradient(look, t, axis=0), axis=1),
        'cam_comet': np.linalg.norm(cam - comet, axis=1),
        # Comet head angle from the view axis (no panel shift); half the vertical FOV is 30 deg
        'head_off': np.degrees(np.arccos(np.clip(np.einsum('ij,ij->i', fwd, (head - cam) /
                    np.linalg.norm(head - cam, axis=1, keepdims=True)), -1, 1))),
        'shift': np.array([x['shift'] for x in f]),
        'tunnel': np.array([x.get('tunnel', 0) for x in f]),
    }


def spikes(m, key):
    """Runs of frames above the limit -> list of (frame, t, phase, stop, peak)."""
    lim = LIMITS[key][0]
    if key in TUNNEL_LIMITS:
        lim = np.where(m['tunnel'] > 0, TUNNEL_LIMITS[key], lim)
    over = m[key] > lim
    out, i, n = [], 0, len(over)
    while i < n:
        if over[i]:
            j = i
            while j < n and over[j]:
                j += 1
            k = i + int(np.argmax(m[key][i:j]))
            out.append((k, m['t'][k], PHASE_NAMES[m['phase'][k]], m['stop'][k], m[key][k]))
            i = j
        else:
            i += 1
    return out


def summary(name, m):
    print(f'\n== {name} ({len(m["t"])} frames, {m["t"][-1]:.1f} s)')
    total = 0
    for key, (lim, unit) in LIMITS.items():
        sp = spikes(m, key)
        total += len(sp)
        p99 = np.percentile(m[key], 99)
        print(f'  {key:10s} max {m[key].max():8.1f}  p99 {p99:7.1f}  limit {lim:5g} {unit:7s} spikes {len(sp)}')
        for k, t, ph, st, v in sorted(sp, key=lambda s: -s[4])[:5]:
            print(f'      frame {k:5d}  t {t:6.2f}s  {ph:11s} stop {st:2d}  {v:8.1f}')
    trav = m['phase'] == 2
    print(f'  head off-axis in TRAVEL: max {m["head_off"][trav].max():.1f} deg (half vertical FOV is 30)')
    print(f'  total spikes: {total}')
    return total


def phase_marks(ax, m):
    ph, st, t = m['phase'], m['stop'], m['t']
    for i in range(1, len(t)):
        if ph[i] != ph[i - 1]:
            ax.axvline(t[i], color='#9a9a9a', lw=0.6, ls=':')
    # Shade TRAVEL so flights stand out
    on = None
    for i in range(len(t)):
        if ph[i] == 2 and on is None:
            on = t[i]
        if (ph[i] != 2 or i == len(t) - 1) and on is not None:
            ax.axvspan(on, t[i], color='#e8eef7', lw=0)
            on = None


PANELS = [('rot_speed', 'rotation deg/s'), ('rot_accel', 'rot. accel deg/s2'),
          ('cam_speed', 'camera speed u/s'), ('cam_accel', 'camera accel u/s2'),
          ('cam_jerk', 'camera jerk u/s3'), ('look_speed', 'look speed u/s'),
          ('cam_comet', 'camera-comet dist u'), ('head_off', 'head off-axis deg')]
COLORS = ['#2a6fdb', '#d9622b']


def plot(path, runs, title):
    """runs: list of (label, metrics). One panel per metric, one axis each."""
    fig, axes = plt.subplots(len(PANELS), 1, figsize=(14, 2.1 * len(PANELS)), sharex=True)
    m0 = runs[0][1]
    for ax, (key, label) in zip(axes, PANELS):
        phase_marks(ax, m0)
        for (name, m), c in zip(runs, COLORS):
            ax.plot(m['t'], m[key], lw=1.0, color=c, label=name)
        if key in LIMITS:
            ax.axhline(LIMITS[key][0], color='#c0392b', lw=0.8, ls='--')
            top = max(LIMITS[key][0] * 3, 1)
            ax.set_ylim(0, min(top, max(m[key].max() for _, m in runs) * 1.05 + 1e-6))
        ax.set_ylabel(label, fontsize=8)
        ax.grid(axis='y', color='#eeeeee', lw=0.6)
        for s in ('top', 'right'):
            ax.spines[s].set_visible(False)
        ax.tick_params(labelsize=7)
    # Stop labels on the top panel
    ph, st, t = m0['phase'], m0['stop'], m0['t']
    for i in range(1, len(t)):
        if ph[i] == 3 and ph[i - 1] != 3:
            axes[0].text(t[i], axes[0].get_ylim()[1], f' stop {st[i]}', fontsize=7, va='top', color='#555')
    if len(runs) > 1:
        axes[0].legend(fontsize=8, loc='upper right', frameon=False)
    axes[-1].set_xlabel('time s  (blue band = TRAVEL, dotted = phase change, red dashed = limit; clipped at 3x limit)', fontsize=8)
    fig.suptitle(title, fontsize=10)
    fig.tight_layout()
    fig.savefig(path, dpi=90)
    plt.close(fig)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('out_dir')
    ap.add_argument('--label', default='run')
    ap.add_argument('--dt', nargs='+', default=['30', '60', '144', 'jitter'])
    ap.add_argument('--url', default='http://localhost:8000')
    ap.add_argument('--params', default='', help='extra camlog.html query, e.g. dim=1')
    ap.add_argument('--compare', nargs=2, metavar=('A', 'B'), help='plot two saved labels over each other')
    a = ap.parse_args()
    os.makedirs(a.out_dir, exist_ok=True)

    def log_path(label, dt):
        return os.path.join(a.out_dir, f'camlog_{label}_{dt}.json')

    if a.compare:
        for dt in a.dt:
            runs = [(lab, metrics(json.load(open(log_path(lab, dt))))) for lab in a.compare]
            p = os.path.join(a.out_dir, f'compare_{a.compare[0]}_{a.compare[1]}_{dt}.png')
            plot(p, runs, f'{a.compare[0]} vs {a.compare[1]}, dt={dt}')
            print('wrote', p)
        return

    total = 0
    for dt in a.dt:
        log = run_chrome(a.url, dt, a.params)
        json.dump(log, open(log_path(a.label, dt), 'w'))
        m = metrics(log)
        total += summary(f'{a.label} dt={dt}', m)
        p = os.path.join(a.out_dir, f'camera_{a.label}_{dt}.png')
        plot(p, [(a.label, m)], f'{a.label}, dt={dt}')
        print('  wrote', p)
    print(f'\nALL: {total} spikes' + ('  -> SMOOTH' if total == 0 else ''))


if __name__ == '__main__':
    main()
