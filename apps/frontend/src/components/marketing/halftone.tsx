'use client';

import { CSSProperties, ReactElement, useEffect, useRef } from 'react';

// HalftoneHeroBackground — an animated halftone dot field over a warm
// gradient, in the school of Cloudflare's hero treatment but an original
// implementation. A fixed square grid of SDF circles whose radius/opacity
// breathe with a slow low-frequency wave field (two sine bands + value
// noise) on an ~20s calm cycle. One fullscreen triangle — never one DOM
// element per dot.
//
// Production behavior: absolutely fills its parent (parent owns radius +
// overflow), pointer-events: none, aria-hidden; ResizeObserver sizing;
// DPR capped at 1.5 with a ~1.2MP pixel budget (lower on small screens);
// ~30fps frame cap (the motion is slow — half the GPU for free); pauses
// offscreen & on hidden tabs; prefers-reduced-motion renders one polished
// static frame; any WebGL failure hides the canvas so the parent's CSS
// gradient+dot-grid fallback shows. No pointer interaction by design.
//
// Optional video delivery: pass `video` and the component renders a muted
// looping <video> (webm→mp4, poster) instead of the shader — same visual,
// lower runtime GPU, per the production-video delivery pattern.

export type HalftoneHeroBackgroundProps = {
  baseColor?: string;
  secondaryColor?: string;
  dotColor?: string;
  glowColor?: string;
  /** grid spacing in CSS px (dot pitch) */
  density?: number;
  dotMinRadius?: number;
  dotMaxRadius?: number;
  /** 0..1 overall dot strength */
  intensity?: number;
  /** cycle speed multiplier; 1 ≈ 20s feel */
  speed?: number;
  className?: string;
  /** readability mask center (0..1 uv, y from top) & strength (0..1) */
  maskCenter?: [number, number];
  maskStrength?: number;
  video?: { webm?: string; mp4?: string; poster?: string };
};

const FRAG = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform vec2 u_res;
uniform float u_t;
uniform vec3 u_base;
uniform vec3 u_base2;
uniform vec3 u_dot;
uniform vec3 u_glow;
uniform float u_spacing;   /* device px */
uniform float u_rmin;      /* device px */
uniform float u_rmax;      /* device px */
uniform float u_intensity;
uniform vec2 u_mask;       /* readability mask center, uv (y up) */
uniform float u_maskk;     /* mask strength */

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
    f.y
  );
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_res;
  float aspect = u_res.x / u_res.y;

  /* 1 — base gradient, gently diagonal */
  vec3 col = mix(u_base, u_base2, clamp(uv.x * 0.55 + uv.y * 0.45, 0.0, 1.0));

  /* 2 — wide radial glow rising from bottom center (uv y-up: bottom = 0) */
  vec2 gp = vec2((uv.x - 0.5) * aspect, uv.y + 0.12);
  float glow = 1.0 - smoothstep(0.0, 0.95, length(gp));
  col = mix(col, u_glow, glow * 0.5);

  /* 3 — slow wave field: broad bands, not static */
  vec2 wp = vec2(uv.x * aspect, uv.y) * 3.1;
  float t = u_t * 0.28;
  float f = 0.5
    + 0.30 * sin(wp.x * 1.15 + t) * sin(wp.y * 0.85 - t * 0.8)
    + 0.22 * sin((wp.x + wp.y) * 0.6 - t * 0.55)
    + 0.18 * (vnoise(wp * 0.9 + vec2(t * 0.25, -t * 0.2)) - 0.5) * 2.0;
  f = clamp(f, 0.0, 1.0);

  /* 4 — SDF dot on a fixed square grid */
  vec2 cell = mod(gl_FragCoord.xy, u_spacing) - u_spacing * 0.5;
  float d = length(cell);
  float r = mix(u_rmin, u_rmax, f);
  float aa = 0.75;
  float dot_ = 1.0 - smoothstep(r - aa, r + aa, d);
  float dotAlpha = dot_ * mix(0.25, 1.0, f);

  /* 5 — edge mask: quieter near the panel edges */
  float edge = smoothstep(0.0, 0.10, uv.x) * smoothstep(0.0, 0.10, 1.0 - uv.x)
             * smoothstep(0.0, 0.14, uv.y) * smoothstep(0.0, 0.14, 1.0 - uv.y);

  /* 6 — readability mask: soft dip behind the headline, no hard rectangle */
  vec2 mp = vec2((uv.x - u_mask.x) * aspect, (uv.y - u_mask.y) * 1.35);
  float mask = 1.0 - u_maskk * (1.0 - smoothstep(0.0, 0.52, length(mp)));

  col = mix(col, u_dot, dotAlpha * u_intensity * edge * mask);
  gl_FragColor = vec4(col, 1.0);
}
`;

const VERT = `
attribute vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
`;

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const n = parseInt(
    h.length === 3 ? h.split('').map((c) => c + c).join('') : h,
    16
  );
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export function HalftoneHeroBackground({
  baseColor = '#2563EB',
  secondaryColor = '#3B82F6',
  dotColor = '#F4F8FF',
  glowColor = '#FFE9B8',
  density = 7,
  dotMinRadius = 0.4,
  dotMaxRadius = 1.25,
  intensity = 0.85,
  speed = 1,
  className,
  maskCenter = [0.5, 0.62],
  maskStrength = 0.2,
  video,
}: HalftoneHeroBackgroundProps): ReactElement {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (video) return;
    const canvas = ref.current;
    if (!canvas) return;
    const reduced = window.matchMedia(
      '(prefers-reduced-motion: reduce)'
    ).matches;
    const bail = () => {
      canvas.style.display = 'none';
    };

    const gl =
      canvas.getContext('webgl', { antialias: false, alpha: false }) ||
      canvas.getContext('experimental-webgl', {
        antialias: false,
        alpha: false,
      });
    if (!gl || !(gl instanceof WebGLRenderingContext)) return bail();

    const compile = (type: number, src: string) => {
      const s = gl.createShader(type);
      if (!s) return null;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        gl.deleteShader(s);
        return null;
      }
      return s;
    };
    const vs = compile(gl.VERTEX_SHADER, VERT);
    const fs = compile(gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return bail();
    const prog = gl.createProgram();
    if (!prog) return bail();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return bail();
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 3, -1, -1, 3]),
      gl.STATIC_DRAW
    );
    const loc = gl.getAttribLocation(prog, 'a_pos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    const u = (name: string) => gl.getUniformLocation(prog, name);
    const uRes = u('u_res');
    const uT = u('u_t');
    gl.uniform3fv(u('u_base'), hexToRgb(baseColor));
    gl.uniform3fv(u('u_base2'), hexToRgb(secondaryColor));
    gl.uniform3fv(u('u_dot'), hexToRgb(dotColor));
    gl.uniform3fv(u('u_glow'), hexToRgb(glowColor));
    gl.uniform2f(u('u_mask'), maskCenter[0], 1.0 - maskCenter[1]);
    gl.uniform1f(u('u_maskk'), maskStrength);
    gl.uniform1f(u('u_intensity'), intensity);

    let scale = 1;
    const resize = () => {
      const small = window.innerWidth < 640;
      const dprCap = small ? 1 : 1.5;
      let s = Math.min(window.devicePixelRatio || 1, dprCap);
      // pixel budget ~1.2MP: soften s until under budget
      const cw = canvas.clientWidth || 1;
      const ch = canvas.clientHeight || 1;
      while (cw * s * ch * s > 1_200_000 && s > 0.5) s *= 0.85;
      scale = s;
      const w = Math.max(2, Math.floor(cw * s));
      const h = Math.max(2, Math.floor(ch * s));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        gl.viewport(0, 0, w, h);
      }
      gl.uniform1f(u('u_spacing'), density * scale);
      gl.uniform1f(u('u_rmin'), dotMinRadius * scale);
      gl.uniform1f(u('u_rmax'), dotMaxRadius * scale);
    };
    resize();

    const CYCLE = 20 / Math.max(speed, 0.01); // ~20s feel at speed 1
    const draw = (tSec: number) => {
      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform1f(uT, (tSec / CYCLE) * 20);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };

    if (reduced) {
      // one polished static frame, mid-cycle
      draw(7.0);
      return () => {
        gl.getExtension('WEBGL_lose_context')?.loseContext();
      };
    }

    let raf = 0;
    let running = false;
    let inView = true;
    let last = 0;
    const t0 = performance.now();
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      // ~30fps cap — the motion is slow; half the GPU for free
      if (now - last < 31) return;
      last = now;
      draw((now - t0) / 1000);
    };
    const start = () => {
      if (!running && inView && !document.hidden) {
        running = true;
        raf = requestAnimationFrame(frame);
      }
    };
    const stop = () => {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    };
    draw(0);

    const io = new IntersectionObserver(
      (entries) => {
        inView = entries.some((e) => e.isIntersecting);
        if (inView) start();
        else stop();
      },
      { threshold: 0 }
    );
    io.observe(canvas);
    const onVis = () => (document.hidden ? stop() : start());
    document.addEventListener('visibilitychange', onVis);
    const ro = new ResizeObserver(() => {
      resize();
      if (!running) draw((performance.now() - t0) / 1000);
    });
    ro.observe(canvas);

    return () => {
      stop();
      io.disconnect();
      ro.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    };
    // Visual props are read once at mount by design (static marketing hero).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [video]);

  if (video) {
    return (
      <video
        className={className ? `mk-halftone ${className}` : 'mk-halftone'}
        autoPlay
        muted
        loop
        playsInline
        poster={video.poster}
        aria-hidden="true"
        style={{ objectFit: 'cover' } as CSSProperties}
      >
        {video.webm && <source src={video.webm} type="video/webm" />}
        {video.mp4 && <source src={video.mp4} type="video/mp4" />}
      </video>
    );
  }

  return (
    <canvas
      ref={ref}
      className={className ? `mk-halftone ${className}` : 'mk-halftone'}
      aria-hidden="true"
    />
  );
}
