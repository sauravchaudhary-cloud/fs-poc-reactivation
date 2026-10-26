"use client";
/*!
 * Liquid glass refraction for /dashboard-v2: the liquid-glass skill's Angular directive, ported to React.
 *
 * The refraction field is a port of the fragment shader in liquid-glass-js
 * (https://github.com/dashersw/liquid-glass-js) — Copyright (c) 2025 Armagan Amcalar, MIT. Permission is hereby
 * granted, free of charge, to any person obtaining a copy of that software to deal in it without restriction,
 * provided this notice travels with it; it is provided "as is", without warranty of any kind. Keep this header on
 * any copy or port.
 */
import { useEffect } from "react";

// Every `.liquid-glass` element bends the backdrop at its rim, the way thick glass does. A displacement map is baked
// per size into an SVG filter and used as `backdrop-filter: url(#…)`, so it samples the live page as it scrolls.
// Mount once: panels that come and go (the drawer) are picked up as they do. `data-glass-blur` thickens one
// element's frosting, for the sticky bar with the table scrolling under it.
export function Refraction() {
  useEffect(() => {
    if (!chromium()) return; // Safari parses url() backdrop filters and paints nothing; the CSS blur stays instead
    const live = new Map<HTMLElement, () => void>();
    const scan = () => {
      for (const el of document.querySelectorAll<HTMLElement>(".liquid-glass"))
        if (!live.has(el)) live.set(el, attach(el));
      for (const [el, detach] of live)
        if (!el.isConnected) {
          detach();
          live.delete(el);
        }
    };
    const added = new MutationObserver(scan);
    added.observe(document.body, { childList: true, subtree: true });
    scan();
    return () => {
      added.disconnect();
      live.forEach((detach) => detach());
    };
  }, []);
  return null;
}

// The skill's preset, fit against the library's reference render: distances are falloff rates per px in from the
// edge, intensities fractions of the viewport. Its center warp is off, so that term is left out.
const FIELD = {
  edgeIntensity: 0.015,
  rimIntensity: 0.028,
  edgeDistance: 0.5,
  rimDistance: 1.7,
  cornerBoost: 0.06,
  rippleEffect: 0.26,
};
const BLUR = 2; // the frosting, in the library's blurRadius units
const BLUR_STD_PER_RADIUS = 0.35; // feGaussianBlur stdDeviation per unit, fit to the library's 13-tap blur
const SUPERSAMPLE = 2; // the rim lives in 1–2 px, and a 1× map gets resampled into a smear
const MAX_MAP_EDGE = 1400; // big panels get a coarser map; their middle is neutral anyway
const FLAT = 40; // px in from the edge, every term is under 0.001 px: the bake skips the middle

function attach(el: HTMLElement) {
  let key = "";
  let frame = 0;
  let settle: ReturnType<typeof setTimeout> | undefined;
  const rebuild = () => {
    const w = Math.round(el.offsetWidth);
    const h = Math.round(el.offsetHeight);
    if (w < 2 || h < 2) return;
    const r = Math.min(radiusOf(getComputedStyle(el).borderTopLeftRadius, w, h), Math.min(w, h) / 2);
    const blur = Number(el.dataset.glassBlur) || BLUR;
    // Displacement scales with the viewport (the shader's page texture), so a window resize changes every map.
    const next = [w, h, r, window.innerWidth, window.innerHeight, blur].join("|");
    if (next === key) return;
    release(key);
    key = next;
    el.style.backdropFilter = `url(#${acquire(key, w, h, r, blur)})`;
  };
  const schedule = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(rebuild);
  };
  const onResize = () => {
    clearTimeout(settle);
    settle = setTimeout(schedule, 180); // let a drag-resize settle rather than rebake every map every frame
  };
  const sized = new ResizeObserver(schedule);
  sized.observe(el);
  window.addEventListener("resize", onResize, { passive: true });
  return () => {
    sized.disconnect();
    window.removeEventListener("resize", onResize);
    clearTimeout(settle);
    cancelAnimationFrame(frame);
    release(key);
    el.style.backdropFilter = "";
  };
}

// One filter per size, shared by every panel that size (the tiles), and dropped with the last of them.
const filters = new Map<string, { id: string; node: Element; refs: number }>();
let defs: Element | undefined;
let made = 0;

function acquire(key: string, w: number, h: number, r: number, blur: number) {
  const hit = filters.get(key);
  // Only while it's in the page: a detached <defs> leaves url(#id) pointing at nothing, and the panel blank.
  if (hit?.node.isConnected) {
    hit.refs++;
    return hit.id;
  }
  const { map, scale } = bake(w, h, r);
  const std = blur * BLUR_STD_PER_RADIUS;
  // Rim pixels sample up to scale/2 outside the box, plus the blur's reach. A region that stopped at the box would
  // clip the corners to transparent.
  const m = scale / 2 + 3 * std;
  const id = `liquid-glass-${made++}`;
  const filter = svg("filter", {
    id,
    x: `${(-100 * m) / w}%`,
    y: `${(-100 * m) / h}%`,
    width: `${100 + (200 * m) / w}%`,
    height: `${100 + (200 * m) / h}%`,
    "color-interpolation-filters": "sRGB",
  });
  filter.append(
    svg("feImage", {
      href: map,
      x: "0",
      y: "0",
      width: String(w),
      height: String(h),
      preserveAspectRatio: "none",
      result: "map",
    }),
    svg("feDisplacementMap", {
      in: "SourceGraphic",
      in2: "map",
      scale: String(scale),
      xChannelSelector: "R",
      yChannelSelector: "G",
      result: "bent",
    }),
    svg("feGaussianBlur", { in: "bent", stdDeviation: String(std) }),
  );
  if (!defs?.isConnected) {
    const root = svg("svg", { width: "0", height: "0", "aria-hidden": "true", style: "position: fixed" });
    defs = root.appendChild(svg("defs", {}));
    document.body.append(root);
  }
  defs.append(filter);
  filters.set(key, { id, node: filter, refs: 1 });
  return id;
}

function release(key: string) {
  const hit = filters.get(key);
  if (hit && --hit.refs <= 0) {
    filters.delete(key);
    hit.node.remove();
  }
}

// The field, baked into a map: R and G carry each pixel's x and y offset, scaled so the extremes span `scale`.
function bake(w: number, h: number, radius: number) {
  const ss = Math.max(0.25, Math.min(SUPERSAMPLE, MAX_MAP_EDGE / Math.max(w, h)));
  const bw = Math.max(1, Math.round(w * ss));
  const bh = Math.max(1, Math.round(h * ss));
  const r = radius * ss;
  const short = Math.min(w, h);
  const dx = new Float32Array(bw * bh);
  const dy = new Float32Array(bw * bh);
  let max = 0;
  for (let py = 0; py < bh; py++)
    for (let px = 0; px < bw; px++) {
      // Distance in from the rounded rect's edge, in CSS px.
      const tx = Math.abs(px + 0.5 - bw / 2) - (bw / 2 - r);
      const ty = Math.abs(py + 0.5 - bh / 2) - (bh / 2 - r);
      const d = Math.max(r - Math.hypot(Math.max(tx, 0), Math.max(ty, 0)) - Math.min(Math.max(tx, ty), 0), 0) / ss;
      if (d > FLAT) continue;
      const cx = (px + 0.5) / bw;
      const cy = (py + 0.5) / bh;
      const rim = Math.exp(-d * FIELD.rimDistance);
      const corner = Math.exp(-Math.max(Math.min(cx, 1 - cx), Math.min(cy, 1 - cy)) * short * 0.3) * FIELD.cornerBoost;
      const bend = Math.exp(-d * FIELD.edgeDistance) * FIELD.edgeIntensity + rim * FIELD.rimIntensity + corner;
      const ripple = Math.sin((d / short) * 25) * FIELD.rippleEffect * rim;
      // Along the normal (taken in texcoord space, as the shader does) and the ripple across it, in viewport px.
      const len = Math.hypot(cx - 0.5, cy - 0.5) || 1;
      const nx = (cx - 0.5) / len;
      const ny = (cy - 0.5) / len;
      const i = py * bw + px;
      dx[i] = (nx * bend - ny * ripple) * window.innerWidth;
      dy[i] = (ny * bend + nx * ripple) * window.innerHeight;
      max = Math.max(max, Math.abs(dx[i]), Math.abs(dy[i]));
    }
  const scale = Math.max(max * 2, 1e-4);
  // feDisplacementMap reads byte b as scale × (b/255 − 0.5), and 128/255 isn't 0.5. Pre-subtract that bias, or the
  // whole undistorted middle drifts by scale/510 px.
  const bias = scale * (128 / 255 - 0.5);
  const canvas = document.createElement("canvas");
  canvas.width = bw;
  canvas.height = bh;
  const ctx = canvas.getContext("2d")!;
  const img = ctx.createImageData(bw, bh);
  for (let i = 0; i < dx.length; i++) {
    img.data[i * 4] = 255 * (0.5 + (dx[i] - bias) / scale); // a Uint8ClampedArray rounds and clamps
    img.data[i * 4 + 1] = 255 * (0.5 + (dy[i] - bias) / scale);
    img.data[i * 4 + 2] = 128;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return { map: canvas.toDataURL("image/png"), scale };
}

function svg(tag: string, attrs: Record<string, string>) {
  const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}

// The computed radius in px (a % against the shorter side), so the CSS stays the one source of the shape.
const radiusOf = (v: string, w: number, h: number) =>
  v.trim().endsWith("%") ? (parseFloat(v) / 100) * Math.min(w, h) : parseFloat(v) || 0;

function chromium() {
  const brands = (navigator as Navigator & { userAgentData?: { brands: { brand: string }[] } }).userAgentData?.brands;
  return brands
    ? brands.some((b) => /Chromium|Google Chrome|Microsoft Edge/i.test(b.brand))
    : /Chrome\//.test(navigator.userAgent);
}
