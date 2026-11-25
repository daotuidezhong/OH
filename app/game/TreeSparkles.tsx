"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, type CSSProperties } from "react";
import { CHRISTMAS_TREE_GLINTS, CHRISTMAS_TREE_LIGHTS, CHRISTMAS_TREE_STAR, getTreeSpan } from "./christmas";

// Particle sparkle laid over the painted tree. Nothing here redraws the tree: every effect is
// additive light on top of the art, so the tree keeps its own look. Ideas borrowed from particle
// tree demos: a glow sprite drawn with "lighter" blending, sine-phased twinkle, short glints,
// lights spiralling up a cone with fading trails, and a burst that settles back.

export type TreeSparklesHandle = { burst: (point: { x: number; y: number }) => void };

// Canvas box in room percentages, wider than the tree so the star rays and bursts are not cut off.
// Depth sorting reads its ground 94% down the box (about 70.01%), just in front of the tree layer's
// (69.98%): the sparkle draws over the tree and still behind a cat standing in front of it.
export const TREE_SPARKLE_BOX = { left: 22, top: 2, width: 34, height: 72.35 };

const BOX_STYLE: CSSProperties = {
  left: `${TREE_SPARKLE_BOX.left}%`, top: `${TREE_SPARKLE_BOX.top}%`,
  width: `${TREE_SPARKLE_BOX.width}%`, height: `${TREE_SPARKLE_BOX.height}%`,
};

const STREAM_TOP = 22;
const STREAM_BASE = 58;
const TRAIL = 12;
const TAU = Math.PI * 2;

type Rgb = readonly [number, number, number];
const GOLD: Rgb = [255, 206, 110];
const WARM_WHITE: Rgb = [255, 247, 222];

function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function glowSprite([r, g, b]: Rgb) {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) return canvas;
  const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, "rgba(255, 255, 255, 1)");
  gradient.addColorStop(.14, `rgba(${r}, ${g}, ${b}, .95)`);
  gradient.addColorStop(.38, `rgba(${r}, ${g}, ${b}, .32)`);
  gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);
  return canvas;
}

// Cone half-widths sampled once, so the spiral does not walk the outline every frame.
const SPAN_STEP = .25;
const SPANS = Array.from({ length: Math.round((STREAM_BASE - STREAM_TOP) / SPAN_STEP) + 1 }, (_, index) =>
  getTreeSpan(STREAM_TOP + index * SPAN_STEP) ?? { centre: CHRISTMAS_TREE_STAR.x, halfWidth: 0 });
function spanAt(y: number) {
  const index = Math.round((Math.min(STREAM_BASE, Math.max(STREAM_TOP, y)) - STREAM_TOP) / SPAN_STEP);
  return SPANS[index];
}

type Point = { x: number; y: number };
type Spark = Point & { vx: number; vy: number; age: number; life: number; size: number; white: boolean };

export const TreeSparkles = forwardRef<TreeSparklesHandle, { dim: boolean }>(function TreeSparkles({ dim }, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dimRef = useRef(dim);
  const burstRef = useRef<(point: Point) => void>(() => undefined);
  useEffect(() => { dimRef.current = dim; }, [dim]);
  useImperativeHandle(ref, () => ({ burst: (point) => burstRef.current(point) }), []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const random = seeded(20261225);
    const gold = glowSprite(GOLD);
    const white = glowSprite(WARM_WHITE);

    const lights = CHRISTMAS_TREE_LIGHTS.map(([x, y]) => ({ x, y, phase: random() * TAU, speed: .7 + random() * 1.6, sharp: 3 + Math.round(random() * 4) }));
    const stream = Array.from({ length: 22 }, (_, index) => ({
      progress: index / 22, speed: .045 + random() * .035, turns: 2.4 + random() * 1.2, offset: random() * TAU,
      size: .28 + random() * .18, trail: [] as Point[],
    }));
    const newMote = (anywhere: boolean) => {
      const y = anywhere ? STREAM_TOP + random() * (66 - STREAM_TOP) : 64 + random() * 4;
      const span = spanAt(y);
      return { x: span.centre + (random() * 2 - 1) * (span.halfWidth + 2.5), y, rise: .9 + random() * 1.4, phase: random() * TAU, size: .16 + random() * .16 };
    };
    const motes = Array.from({ length: 18 }, () => newMote(true));
    const glints: { x: number; y: number; age: number; life: number }[] = [];
    const sparks: Spark[] = [];
    let nextGlint = .4;
    let flash = 0;

    let width = 0;
    let height = 0;
    let unit = 1;
    const resize = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      width = Math.max(1, Math.round(canvas.clientWidth * ratio));
      height = Math.max(1, Math.round(canvas.clientHeight * ratio));
      canvas.width = width;
      canvas.height = height;
      unit = width / TREE_SPARKLE_BOX.width;
    };
    const px = (x: number) => (x - TREE_SPARKLE_BOX.left) / TREE_SPARKLE_BOX.width * width;
    const py = (y: number) => (y - TREE_SPARKLE_BOX.top) / TREE_SPARKLE_BOX.height * height;
    const sprite = (image: HTMLCanvasElement, x: number, y: number, size: number, alpha: number) => {
      if (alpha <= .01) return;
      const diameter = size * unit;
      context.globalAlpha = Math.min(1, alpha);
      context.drawImage(image, px(x) - diameter / 2, py(y) - diameter / 2, diameter, diameter);
    };
    const ray = (x: number, y: number, angle: number, length: number, thickness: number, alpha: number) => {
      const cx = px(x);
      const cy = py(y);
      const dx = Math.cos(angle) * length * unit;
      const dy = Math.sin(angle) * length * unit;
      const gradient = context.createLinearGradient(cx - dx, cy - dy, cx + dx, cy + dy);
      gradient.addColorStop(0, "rgba(255, 236, 180, 0)");
      gradient.addColorStop(.5, `rgba(255, 246, 220, ${Math.min(1, alpha)})`);
      gradient.addColorStop(1, "rgba(255, 236, 180, 0)");
      context.globalAlpha = 1;
      context.strokeStyle = gradient;
      context.lineWidth = Math.max(1, thickness * unit);
      context.beginPath();
      context.moveTo(cx - dx, cy - dy);
      context.lineTo(cx + dx, cy + dy);
      context.stroke();
    };

    burstRef.current = (point) => {
      if (reduceMotion) return;
      flash = 1;
      for (let index = 0; index < 46; index += 1) {
        const angle = random() * TAU;
        const speed = 5 + random() * 13;
        sparks.push({ x: point.x, y: point.y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed * 1.4 - 4,
          age: 0, life: 1 + random() * 1.1, size: .45 + random() * .45, white: random() < .5 });
      }
    };

    const draw = (time: number, dt: number) => {
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.globalCompositeOperation = "source-over";
      context.clearRect(0, 0, width, height);
      context.globalCompositeOperation = "lighter";
      const strength = dimRef.current ? .6 : 1;
      flash = Math.max(0, flash - dt * 1.2);

      // Star: a breathing glow with slowly turning rays.
      const pulse = .55 + .45 * Math.sin(time * 1.6);
      sprite(gold, CHRISTMAS_TREE_STAR.x, CHRISTMAS_TREE_STAR.y, 7.5, (.28 + .22 * pulse + flash * .3) * strength);
      for (let index = 0; index < 8; index += 1) {
        const long = index % 2 === 0;
        ray(CHRISTMAS_TREE_STAR.x, CHRISTMAS_TREE_STAR.y, time * .12 + index * Math.PI / 8, long ? 4.2 : 2.6, .14, (long ? .42 : .26) * (.5 + .5 * pulse) * strength);
      }

      // Fairy lights painted on the tree: each brightens briefly on its own beat.
      for (const light of lights) {
        const wave = Math.max(0, Math.sin(time * light.speed + light.phase));
        const alpha = (wave ** light.sharp * .95 + flash * (.45 + .45 * Math.sin(time * 9 + light.phase))) * strength;
        sprite(light.sharp > 5 ? white : gold, light.x, light.y, .7 + wave * .5, alpha);
      }

      // Lights spiralling up around the cone, dim on the far side, with fading trails.
      for (const particle of stream) {
        particle.progress += particle.speed * dt;
        if (particle.progress >= 1) { particle.progress -= 1; particle.trail.length = 0; }
        const y = STREAM_BASE - particle.progress * (STREAM_BASE - STREAM_TOP);
        const span = spanAt(y);
        const angle = particle.progress * particle.turns * TAU + particle.offset + time * .35;
        const front = Math.sin(angle);
        const point = { x: span.centre + Math.cos(angle) * span.halfWidth * .96, y };
        particle.trail.unshift(point);
        if (particle.trail.length > TRAIL) particle.trail.pop();
        const edge = Math.min(1, particle.progress / .1, (1 - particle.progress) / .18);
        const depth = front > 0 ? .35 + .65 * front : .1;
        particle.trail.forEach((step, index) => {
          const fade = 1 - index / TRAIL;
          sprite(gold, step.x, step.y, particle.size * (.45 + .55 * fade), edge * depth * fade * (index ? .32 : .85) * strength);
        });
      }

      // Gold dust drifting up past the branches.
      motes.forEach((mote, index) => {
        mote.y -= mote.rise * dt;
        mote.x += Math.sin(time * .8 + mote.phase) * .18 * dt;
        if (mote.y < STREAM_TOP - 4) motes[index] = newMote(false);
        const twinkle = .5 + .5 * Math.sin(time * 3.2 + mote.phase);
        sprite(gold, mote.x, mote.y, mote.size * 2.2, (.18 + .5 * twinkle) * strength);
      });

      // Short star-shaped glints on the pearl baubles.
      nextGlint -= dt;
      if (nextGlint <= 0) {
        const [x, y] = CHRISTMAS_TREE_GLINTS[Math.floor(random() * CHRISTMAS_TREE_GLINTS.length)];
        glints.push({ x, y, age: 0, life: .4 + random() * .25 });
        nextGlint = .25 + random() * .7;
      }
      for (let index = glints.length - 1; index >= 0; index -= 1) {
        const glint = glints[index];
        glint.age += dt;
        if (glint.age >= glint.life) { glints.splice(index, 1); continue; }
        const envelope = Math.sin(Math.PI * glint.age / glint.life);
        sprite(white, glint.x, glint.y, 1.4 * envelope, envelope * strength);
        ray(glint.x, glint.y, 0, 1.6 * envelope, .09, envelope * .9 * strength);
        ray(glint.x, glint.y, Math.PI / 2, 1.6 * envelope, .09, envelope * .9 * strength);
      }

      // Burst after a click on the tree: sparks fly out, slow down and drift back down.
      for (let index = sparks.length - 1; index >= 0; index -= 1) {
        const spark = sparks[index];
        spark.age += dt;
        if (spark.age >= spark.life) { sparks.splice(index, 1); continue; }
        const drag = Math.exp(-2.6 * dt);
        spark.vx *= drag;
        spark.vy = spark.vy * drag + 5 * dt;
        spark.x += spark.vx * dt;
        spark.y += spark.vy * dt;
        const life = 1 - spark.age / spark.life;
        const shimmer = life * (.65 + .35 * Math.sin(spark.age * 22 + index));
        sprite(spark.white ? white : gold, spark.x, spark.y, spark.size * (.6 + .4 * life), shimmer);
        if (spark.white) {
          ray(spark.x, spark.y, 0, spark.size * .9 * life, .06, shimmer * .9);
          ray(spark.x, spark.y, Math.PI / 2, spark.size * .9 * life, .06, shimmer * .9);
        }
      }
      context.globalAlpha = 1;
    };

    resize();
    const observer = new ResizeObserver(() => {
      resize();
      if (reduceMotion) drawStill();
    });
    observer.observe(canvas);

    // Reduced motion: a still glow on the star and a light dusting of the fairy lights.
    function drawStill() {
      context!.clearRect(0, 0, width, height);
      context!.globalCompositeOperation = "lighter";
      sprite(gold, CHRISTMAS_TREE_STAR.x, CHRISTMAS_TREE_STAR.y, 7, .4);
      lights.forEach((light, index) => { if (index % 4 === 0) sprite(gold, light.x, light.y, .8, .45); });
      context!.globalAlpha = 1;
    }
    if (reduceMotion) {
      drawStill();
      return () => observer.disconnect();
    }

    let frame = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(.05, (now - last) / 1000);
      last = now;
      draw(now / 1000, dt);
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      burstRef.current = () => undefined;
    };
  }, []);

  return <canvas ref={canvasRef} className="tree-sparkles" data-scene-depth="tree-sparkle" aria-hidden="true" style={BOX_STYLE} />;
});
