import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const css = readFileSync(
  resolve(__dirname, '../../app/(marketing)/marketing.css'),
  'utf8'
);
const footerCss = readFileSync(resolve(__dirname, './chrome.css'), 'utf8');
const logoSource = readFileSync(resolve(__dirname, './logo.tsx'), 'utf8');
const footerSource = readFileSync(resolve(__dirname, './chrome.tsx'), 'utf8');

describe('marketing page-shell contract', () => {
  it('uses the full desktop canvas instead of mirrored page-edge rails', () => {
    expect(css).toContain('scrollbar-gutter: stable;');
    expect(css).not.toContain('scrollbar-gutter: stable both-edges');
    expect(css).toMatch(/\.mk-hero-bleed\s*{\s*padding:\s*0;/);
    expect(css).toMatch(
      /\.mk-hero-panel\s*{[\s\S]*?border-radius:\s*0;[\s\S]*?min-height:\s*calc\(100svh - 64px\);[\s\S]*?box-shadow:\s*none;/
    );
  });

  it('uses fluid wide-desktop rails instead of the former narrow center caps', () => {
    expect(css).toContain('--mk-container: 1920px;');
    expect(css).toContain('--mk-container-wide: 2160px;');
    expect(css).toMatch(
      /\.mk-container\s*{[\s\S]*?width:\s*100%;[\s\S]*?max-width:\s*var\(--mk-container\);[\s\S]*?padding:\s*0 clamp\(24px, 4vw, 72px\);/
    );
    expect(css).toMatch(
      /\.mk-hero-stage\s*{[\s\S]*?width:\s*min\(2080px, calc\(100% - clamp\(48px, 6vw, 144px\)\)\);[\s\S]*?grid-template-columns:\s*minmax\(0, 0\.95fr\) minmax\(560px, 1\.05fr\);/
    );
    expect(css).not.toContain('width: min(1180px, 100%);');
  });

  it('keeps a pulsing freshness cue with a reduced-motion fallback', () => {
    expect(css).toMatch(
      /\.mk-health-live i\s*{[\s\S]*?animation:\s*mk-health-live-flash 1\.65s ease-in-out infinite;/
    );
    expect(css).toContain('@keyframes mk-health-live-flash');
    expect(css).toContain('@keyframes mk-health-live-ripple');

    const reducedMotion = css.slice(
      css.indexOf('@media (prefers-reduced-motion: reduce)')
    );
    expect(reducedMotion).toMatch(
      /\.mk-health-live i,[\s\S]*?\.mk-health-live i::after\s*{\s*animation:\s*none;/
    );
    expect(reducedMotion).toMatch(
      /\.mk-health-live i::after\s*{\s*display:\s*none;/
    );
  });

  it('renders every marketing wordmark without a raster background matte', () => {
    expect(logoSource).toContain('mk-wordmark-text');
    expect(footerSource).toContain('mk-ft-mark-word');
    expect(logoSource).not.toContain('publishly-wordmark.png');
    expect(footerSource).not.toContain('publishly-wordmark.png');
    expect(css).toMatch(
      /\.mk-wordmark-text\s*{[\s\S]*?font-family:\s*var\(--mk-font-display\), sans-serif;/
    );
    expect(footerCss).toMatch(
      /\.mk-ft-mark-word\s*{[\s\S]*?color:\s*var\(--mk-blue\);/
    );
    expect(footerCss).not.toContain('mix-blend-mode');
  });
});
