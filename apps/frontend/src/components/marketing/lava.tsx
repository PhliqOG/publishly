'use client';

import { ReactElement, useEffect, useRef } from 'react';

// The lava field — a Stripe-style flowing gradient rendered with a tiny WebGL
// fragment shader (domain-warped fbm noise) in the Publishly palette. The
// parent renders a static CSS gradient behind this canvas (.mk-lava-fallback),
// which is what users see under prefers-reduced-motion, without WebGL, or
// before the first frame. Compositor cost only; pauses offscreen & on hidden
// tabs; fully cleaned up on unmount.

const FRAG = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform vec2 u_res;
uniform float u_t;

// Stripe-school mesh gradient: a handful of large, soft color fields orbiting
// slowly on a gently rotating plane, blending silkily — no turbulence.

vec2 rot(vec2 p, float a) {
  float c = cos(a);
  float s = sin(a);
  return mat2(c, -s, s, c) * p;
}
float field(vec2 p, vec2 c, float r) {
  return smoothstep(r, 0.0, length(p - c));
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_res;
  vec2 p = (uv - 0.5) * vec2(u_res.x / u_res.y, 1.0);

  // the slight spin
  p = rot(p, u_t * 0.02);

  // a soft breathing warp so edges never feel mechanical
  p += 0.05 * vec2(
    sin(p.y * 2.4 + u_t * 0.18),
    cos(p.x * 2.1 - u_t * 0.15)
  );

  float t = u_t * 0.07;
  vec2 c1 = vec2(cos(t * 0.70), sin(t * 0.90)) * 0.48;
  vec2 c2 = vec2(cos(t * 0.45 + 2.1), sin(t * 0.62 + 1.4)) * 0.58;
  vec2 c3 = vec2(cos(t * 0.80 + 4.2), sin(t * 0.38 + 3.1)) * 0.52;
  vec2 c4 = vec2(cos(t * 0.30 + 1.0), sin(t * 0.72 + 5.0)) * 0.62;

  vec3 navy  = vec3(0.075, 0.204, 0.345);
  vec3 navy2 = vec3(0.110, 0.290, 0.470);
  vec3 olive = vec3(0.514, 0.537, 0.129);
  vec3 amber = vec3(0.851, 0.608, 0.129);
  vec3 cream = vec3(0.980, 0.969, 0.733);

  // base wash: navy deepening toward the top-left, lifting bottom-right
  vec3 col = mix(navy, navy2, clamp(uv.x * 0.7 + uv.y * 0.5, 0.0, 1.0));

  col = mix(col, amber, field(p, c1, 0.85) * 0.92);
  col = mix(col, cream, field(p, c2, 0.72) * 0.88);
  col = mix(col, olive, field(p, c3, 0.88) * 0.78);
  col = mix(col, amber * 1.06, field(p, c4, 0.5) * 0.66);

  // silk: soften everything toward a gentle common luminance
  col = mix(col, (col + vec3(0.06)) * 0.98, 0.35);

  gl_FragColor = vec4(col, 1.0);
}
`;

const VERT = `
attribute vec2 a_pos;
void main() {
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

export function LavaCanvas(): ReactElement {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    // Any failure below must never leave an opaque dead canvas covering the
    // CSS fallback gradient — hide the canvas and bail instead.
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
    const uRes = gl.getUniformLocation(prog, 'u_res');
    const uT = gl.getUniformLocation(prog, 'u_t');

    // Render at a capped internal resolution — the gradient is soft, so a
    // half-res buffer upscaled by CSS is indistinguishable & much cheaper.
    const resize = () => {
      const scale = Math.min(window.devicePixelRatio || 1, 1.5) * 0.6;
      const w = Math.max(2, Math.floor(canvas.clientWidth * scale));
      const h = Math.max(2, Math.floor(canvas.clientHeight * scale));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        gl.viewport(0, 0, w, h);
      }
    };
    resize();

    let raf = 0;
    let running = false;
    let inView = true;
    const t0 = performance.now();
    const draw = () => {
      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform1f(uT, (performance.now() - t0) / 1000);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };
    // First frame synchronously — an { alpha: false } context composites as
    // opaque black until something is drawn, which would flash over the
    // fallback gradient.
    draw();

    const frame = () => {
      draw();
      raf = requestAnimationFrame(frame);
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
    const onResize = () => {
      resize();
      if (!running) draw();
    };
    window.addEventListener('resize', onResize);

    return () => {
      stop();
      io.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('resize', onResize);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    };
  }, []);

  return <canvas ref={ref} className="mk-lava" aria-hidden="true" />;
}
