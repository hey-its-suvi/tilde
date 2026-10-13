# Certainty Model

Every point, line and circle in a figure is drawn according to how well what the
program says pins it down. There are three cases.

## The three states

### Fixed — exactly one place

The program says enough that there is only one place it can be.

**Drawn as:** a crisp dot with a clean circle.

<TildeSketch source="
point a at 0 0
point b at 4 0
point c at 0 3
segment a b
segment b c
segment c a
" :cx="2" :cy="1.5" :zoom="1"/>

### Free — anywhere along a line, a circle, or the plane

The program leaves it room to move: it could be anywhere along a line or a
circle, or anywhere at all.

**Drawn as:** a dot with a wavy circle; segments as squiggly lines.

<TildeSketch source="
triangle t with a b c
distance between a and b is 3
distance between b and c is 4
" :cx="1.5" :cy="2" :zoom="0.8"/>

Here `c` is 4 from `b`, but nothing says in which direction — it could be
anywhere on a circle of radius 4 round `b`.

### Either — a few separate places

The program says enough to rule out sliding, but more than one separate place
still fits.

**Drawn as:** a dot with a jagged circle in amber, once for each place; segments
as jagged lines.

<TildeSketch source="
line l through (3, 0) (3, 1)
point a at 0 0
point b on l
distance between a and b is 5
" :cx="1.5" :cy="0" :zoom="0.5"/>

`b` is on `l` and 5 from `a`, and that is true in two places: above the x-axis
and below it.

## Why this matters

A fixed figure means you can trust every coordinate. A free one means the program
does not say enough yet — add something to pin it down. A figure with several
places means it says enough, but the geometry allows more than one answer; say
something that rules the others out (for instance, which side of a line a point
is on, by placing a point nearby).

## How it carries

- A point worked out from two others is only as fixed as they are: if either is
  free, so is it.
- A point with only one distance to something is always free — it can swing
  round at that distance.
