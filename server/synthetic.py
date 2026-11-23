"""
Synthetic skeletons - ONLY for smoke-testing the pipeline (and the unit tests) before you have real photos.

Your original train.py "fell back to synthetic simulation data" with random numbers. These are a step better:
real BlazePose-layout skeletons with plausible geometry (standing / sitting vs squat / push-up / lunge /
overhead press), random position, size and jitter. A model trained on them will separate them nicely, but it
has NEVER seen a real photo, so models trained with `train.py --synthetic` are saved under a different name
and are never loaded by the server.
"""
from __future__ import annotations

import numpy as np

from features import NUM_LANDMARKS

# name -> (x, y) in a unit box, person facing right, y grows downward. Only the 16 key joints matter.
_J = ["LS", "RS", "LE", "RE", "LW", "RW", "LH", "RH", "LK", "RK", "LA", "RA", "LHEEL", "RHEEL", "LFOOT", "RFOOT"]
_IDX = dict(zip(_J, [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32]))


def _pose(p: dict) -> np.ndarray:
    lm = np.zeros((NUM_LANDMARKS, 4), dtype=np.float32)
    lm[:, 3] = 1.0
    # body-mid defaults so unused landmarks (face etc.) are not at the origin
    lm[:, 0], lm[:, 1] = 0.5, 0.3
    for k, (x, y) in p.items():
        lm[_IDX[k], 0], lm[_IDX[k], 1] = x, y
    return lm


def _sym(l, r_dx=0.02, r_dy=0.0):
    return l, (l[0] + r_dx, l[1] + r_dy)


def standing():
    ls, rs = _sym((0.50, 0.25)); lh, rh = _sym((0.50, 0.50)); lk, rk = _sym((0.50, 0.70)); la, rA = _sym((0.50, 0.90))
    le, re = _sym((0.50, 0.38)); lw, rw = _sym((0.50, 0.50))
    return _pose(dict(LS=ls, RS=rs, LE=le, RE=re, LW=lw, RW=rw, LH=lh, RH=rh, LK=lk, RK=rk, LA=la, RA=rA,
                      LHEEL=(0.49, 0.92), RHEEL=(0.51, 0.92), LFOOT=(0.56, 0.93), RFOOT=(0.58, 0.93)))


def sitting():
    ls, rs = _sym((0.45, 0.28)); lh, rh = _sym((0.45, 0.58)); lk, rk = _sym((0.65, 0.60)); la, rA = _sym((0.65, 0.88))
    le, re = _sym((0.50, 0.42)); lw, rw = _sym((0.60, 0.52))
    return _pose(dict(LS=ls, RS=rs, LE=le, RE=re, LW=lw, RW=rw, LH=lh, RH=rh, LK=lk, RK=rk, LA=la, RA=rA,
                      LHEEL=(0.64, 0.90), RHEEL=(0.66, 0.90), LFOOT=(0.72, 0.91), RFOOT=(0.74, 0.91)))


def squat():
    ls, rs = _sym((0.42, 0.30)); lh, rh = _sym((0.36, 0.62)); lk, rk = _sym((0.58, 0.66)); la, rA = _sym((0.45, 0.90))
    le, re = _sym((0.55, 0.38)); lw, rw = _sym((0.68, 0.36))
    return _pose(dict(LS=ls, RS=rs, LE=le, RE=re, LW=lw, RW=rw, LH=lh, RH=rh, LK=lk, RK=rk, LA=la, RA=rA,
                      LHEEL=(0.43, 0.92), RHEEL=(0.45, 0.92), LFOOT=(0.55, 0.93), RFOOT=(0.57, 0.93)))


def pushup():
    ls, rs = _sym((0.30, 0.45), 0.0, 0.02); lh, rh = _sym((0.55, 0.50), 0.0, 0.02); lk, rk = _sym((0.72, 0.52), 0.0, 0.02)
    la, rA = _sym((0.88, 0.55), 0.0, 0.02); le, re = _sym((0.31, 0.60), 0.0, 0.02); lw, rw = _sym((0.30, 0.72), 0.0, 0.02)
    return _pose(dict(LS=ls, RS=rs, LE=le, RE=re, LW=lw, RW=rw, LH=lh, RH=rh, LK=lk, RK=rk, LA=la, RA=rA,
                      LHEEL=(0.90, 0.57), RHEEL=(0.90, 0.59), LFOOT=(0.93, 0.62), RFOOT=(0.93, 0.64)))


def lunge():
    ls, rs = _sym((0.50, 0.25)); lh, rh = _sym((0.50, 0.55)); lk = (0.68, 0.68); rk = (0.36, 0.78)
    la = (0.68, 0.90); rA = (0.22, 0.88); le, re = _sym((0.50, 0.40)); lw, rw = _sym((0.50, 0.52))