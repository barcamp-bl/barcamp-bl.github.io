// BarCamp BL logo shader.
// The <h1> stays the source and the fallback: its letters are painted into an offscreen canvas (same font,
// same chrome gradient) and a WebGL fragment shader redraws them as a character grid. Each cell (1:2) is split
// into 2x3 sextant blocks, like the Unicode block-mosaic characters; cells flicker through hex glyphs as they
// appear, a pointer turns nearby cells into glyphs and binary noise, now and then a few rows glitch sideways,
// and a highlight sweeps over the letters. No WebGL, no JS, or a shader error: the plain CSS heading stays.
// With reduced motion the logo is drawn once, settled, without glitches, shimmer or pointer effects.
(() => {
  const mark = document.querySelector('.hero .mark');
  const h1 = mark && mark.querySelector('h1');
  const glc = mark && mark.querySelector('canvas');
  if (!glc) return;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const hover = matchMedia('(hover: hover)').matches;
  const GLYPHS = '0123456789ABCDEF#%&*+=<>';   // the first two double as the binary noise
  const root = getComputedStyle(document.documentElement);
  const rgb = hex => { hex = hex.trim().replace('#', ''); if (hex.length === 3) hex = [...hex].map(c => c + c).join('');
    return [0, 2, 4].map(i => (parseInt(hex.substr(i, 2), 16) / 255).toFixed(4)).join(','); };

  // ---------- the source: the heading's letters, painted where the browser laid them out ----------
  const src = document.createElement('canvas'), sctx = src.getContext('2d');
  let dpr = 1, pad = 0;
  function paintSource() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cs = getComputedStyle(h1);
    pad = Math.round(parseFloat(cs.fontSize) * .25);   // room above and below for descenders and glitches
    glc.style.inset = `${-pad}px 0`;
    const h = h1.getBoundingClientRect(), top = h.top - pad;
    src.width = Math.max(1, Math.round(h.width * dpr));
    src.height = Math.max(1, Math.round((h.height + 2 * pad) * dpr));
    sctx.setTransform(dpr, 0, 0, dpr, -h.left * dpr, -top * dpr);
    sctx.clearRect(h.left, top, h.width, h.height + 2 * pad);
    sctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    sctx.textBaseline = 'alphabetic';
    // the same gradient as the heading (--chrome in terminal.css), across the heading's box
    const g = sctx.createLinearGradient(0, h.top, 0, h.bottom);
    for (const [, c, o] of root.getPropertyValue('--chrome').matchAll(/(#[0-9a-f]{3,6})\s+([\d.]+)%/gi)) g.addColorStop(o / 100, c);
    sctx.fillStyle = g;
    // one letter at a time at its laid-out position, so letter-spacing and line breaks match exactly;
    // a text box's top is the font's ascent above the baseline
    const ascent = sctx.measureText('B').fontBoundingBoxAscent;
    const range = document.createRange(), walk = document.createTreeWalker(h1, NodeFilter.SHOW_TEXT);
    for (let n; (n = walk.nextNode());) for (let i = 0; i < n.length; i++) {
      if (!n.data[i].trim()) continue;
      range.setStart(n, i); range.setEnd(n, i + 1);
      const r = range.getBoundingClientRect();
      sctx.fillText(n.data[i], r.left, r.top + ascent);
    }
    return h;
  }

  // ---------- glyph atlas for the hex / binary characters ----------
  function paintAtlas() {
    const a = document.createElement('canvas'), gw = 48, gh = 96;
    a.width = gw * GLYPHS.length; a.height = gh;
    const x = a.getContext('2d');
    x.fillStyle = '#fff'; x.font = `700 ${gh * .62}px "JetBrains Mono", ui-monospace, monospace`;
    x.textAlign = 'center'; x.textBaseline = 'middle';
    [...GLYPHS].forEach((ch, i) => x.fillText(ch, i * gw + gw / 2, gh / 2 + gh * .03));
    return a;
  }

  // ---------- the shader ----------
  const VS = 'attribute vec2 p; void main(){ gl_Position = vec4(p, 0., 1.); }';
  const FS = `
precision highp float;
uniform sampler2D uSrc, uAtlas;
uniform vec2 uRes, uCell, uBox;   // uBox: the heading's rows (px), the dot pattern stays inside them
uniform float uGap, uCols, uTime, uShim, uBand;
uniform vec3 uPtr;
uniform vec4 uGlitch;
const float NG = ${GLYPHS.length}.0;
const vec3 DIM = vec3(${rgb('#2b3038')});
const vec3 BIN = vec3(${rgb('#41484f')});

float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
vec4 tap(vec2 px){ return texture2D(uSrc, px / uRes); }
float glyph(float g, vec2 uv){ return texture2D(uAtlas, vec2((g + uv.x) / NG, uv.y)).a; }

void main(){
  vec2 p = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
  vec2 cell = floor(p / uCell);
  vec2 f = p - cell * uCell;
  vec2 inner = uCell - vec2(uGap);
  bool inGap = f.x >= inner.x || f.y >= inner.y;
  vec2 uv = clamp(f / inner, 0.0, 0.999);

  bool gRow = uGlitch.w > 0.5 && cell.y >= uGlitch.x && cell.y <= uGlitch.y;
  vec2 sc = cell; if (gRow) sc.x += uGlitch.z;
  vec2 base = sc * uCell;

  // cell-level ink, from its six sextant centres
  float best = 0.0; vec3 inkCol = vec3(0.0);
  for (int j = 0; j < 3; j++) for (int i = 0; i < 2; i++){
    vec4 c = tap(base + inner * vec2((float(i) + .5) / 2., (float(j) + .5) / 3.));
    if (c.a > best){ best = c.a; inkCol = c.rgb; }
  }
  float ink = step(0.5, best);

  // this fragment's sextant: lit when its four taps average over half
  vec2 sd = inner / vec2(2., 3.);
  vec2 s0 = base + min(floor(uv * vec2(2., 3.)), vec2(1., 2.)) * sd;
  vec4 a1 = tap(s0 + sd * vec2(.25, .25)), a2 = tap(s0 + sd * vec2(.75, .25));
  vec4 a3 = tap(s0 + sd * vec2(.25, .75)), a4 = tap(s0 + sd * vec2(.75, .75));
  float wsum = a1.a + a2.a + a3.a + a4.a;
  float cov = wsum * .25;
  vec3 col = (a1.rgb * a1.a + a2.rgb * a2.a + a3.rgb * a3.a + a4.rgb * a4.a) / max(wsum, 1e-4);

  float frame = floor(uTime * 22.0);
  float hx = hash(cell + frame * 0.137);
  float reveal = 0.15 + (cell.x / uCols) * 0.95 + hash(cell) * 0.42;

  int mode = 0;                       // 0 empty, 1 sextant, 2 hex glyph, 3 binary noise
  if (ink > .5 || cov > .5){
    if (uTime < reveal - .38) mode = 0;
    else if (uTime < reveal) mode = 2;
    else mode = 1;
  }
  if (uPtr.z > .5){
    float R = uCols / 12.;
    float d = length(vec2(cell.x - uPtr.x, (cell.y - uPtr.y) * (uCell.y / uCell.x)));
    if (d < R){
      float e = d / R;
      if (mode == 1 && hx > e * .9) mode = 2;
      else if (mode == 0 && ink < .5 && hx > .35 + e * .6) mode = 3;
    }
  }
  if (gRow && mode == 1 && hx > .86) mode = 2;

  // transparent where there's nothing, so the page shows through
  vec4 o = vec4(0.0); float lit = 0.0;
  if (!inGap){
    if (mode == 1 && cov > .5){ o = vec4(col, 1.0); lit = 1.0; }
    else if (mode == 2){ float a = glyph(floor(hash(cell + frame) * NG), uv); o = vec4(inkCol, a); lit = a; }
    else if (mode == 3){ o = vec4(BIN, glyph(step(.5, hash(cell + frame * 1.3)), uv)); }
    else if (ink < .5 && p.y >= uBox.x && p.y < uBox.y && abs(mod(cell.x, 3.) - 1.) < .5){
      float dd = length((uv - .5) * vec2(1., uCell.y / uCell.x));
      o = vec4(DIM, 1.0 - smoothstep(.12, .2, dd));
    }
  }

  // shimmer band, only on lit ink
  float band = exp(-pow((p.x + p.y * .35 - uShim) / uBand, 2.));
  o.rgb = mix(o.rgb, vec3(1.0), band * .85 * lit);

  // glitch rows get a cold/hot split
  if (gRow) o.rgb *= mix(vec3(.82, 1.0, 1.18), vec3(1.18, .95, .85), step(.5, hash(vec2(cell.y, frame))));

  gl_FragColor = o;
}`;

  let gl, U = {}, texSrc;
  function initGL() {
    gl = glc.getContext('webgl', { antialias: false, premultipliedAlpha: false });
    if (!gl) return false;
    const sh = (type, code) => {
      const s = gl.createShader(type); gl.shaderSource(s, code); gl.compileShader(s);
      return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : (console.error(gl.getShaderInfoLog(s)), null);
    };
    const v = sh(gl.VERTEX_SHADER, VS), f = sh(gl.FRAGMENT_SHADER, FS);
    if (!v || !f) return false;
    const prog = gl.createProgram(); gl.attachShader(prog, v); gl.attachShader(prog, f); gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return false;
    gl.useProgram(prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);   // one big triangle
    const loc = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    for (const n of ['uSrc', 'uAtlas', 'uRes', 'uCell', 'uBox', 'uGap', 'uCols', 'uTime', 'uShim', 'uBand', 'uPtr', 'uGlitch'])
      U[n] = gl.getUniformLocation(prog, n);
    const tex = unit => {
      const t = gl.createTexture(); gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return t;
    };
    texSrc = tex(0);
    tex(1); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, paintAtlas());
    gl.uniform1i(U.uSrc, 0); gl.uniform1i(U.uAtlas, 1);
    return true;
  }

  // ---------- grid geometry + upload ----------
  let cols = 1, rows = 1;
  function rebuild() {
    const h = paintSource();
    const cellW = Math.max(3, Math.round(Math.min(6, Math.max(3.6, h.width / 190)) * dpr)), cellH = cellW * 2;
    glc.width = src.width; glc.height = src.height;
    cols = glc.width / cellW; rows = glc.height / cellH;
    gl.viewport(0, 0, glc.width, glc.height);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, texSrc);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
    gl.uniform2f(U.uRes, glc.width, glc.height);
    gl.uniform2f(U.uCell, cellW, cellH);
    gl.uniform2f(U.uBox, pad * dpr, glc.height - pad * dpr);
    gl.uniform1f(U.uGap, Math.max(1, Math.round(cellW * .14)));
    gl.uniform1f(U.uCols, cols);
    gl.uniform1f(U.uBand, glc.width * .045);
    draw(performance.now());
  }

  // ---------- animation: only while the logo is on screen ----------
  let start = 0, pointer = null, glitch = null, nextGlitch = 0, visible = false, raf = 0;
  const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  function draw(now) {
    const el = reduce ? 1e4 : (now - start) / 1000;
    if (!reduce && el > 1.8 && now > nextGlitch) {
      const r0 = Math.floor(Math.random() * rows);
      glitch = { r0, r1: r0 + 1 + Math.floor(Math.random() * 5), shift: (Math.random() < .5 ? -1 : 1) * (3 + Math.floor(Math.random() * 10)),
                 until: now + 90 + Math.random() * 130 };
      nextGlitch = now + 2600 + Math.random() * 3200;
    }
    if (glitch && now > glitch.until) glitch = null;
    let shim = -1e6;
    if (!reduce && el > 1.9) {
      const t = ((el - 1.9) % 6) / 6;
      if (t < .45) shim = -glc.width * .15 + ease(t / .45) * (glc.width * 1.3 + glc.height * .35);
    }
    gl.uniform1f(U.uTime, el);
    gl.uniform1f(U.uShim, shim);
    gl.uniform3f(U.uPtr, pointer ? pointer.c : 0, pointer ? pointer.r : 0, pointer ? 1 : 0);
    gl.uniform4f(U.uGlitch, glitch ? glitch.r0 : 0, glitch ? glitch.r1 : 0, glitch ? glitch.shift : 0, glitch ? 1 : 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  function loop(now) { draw(now); raf = visible && !document.hidden ? requestAnimationFrame(loop) : 0; }
  function run() { if (!reduce && !raf && visible && !document.hidden) raf = requestAnimationFrame(loop); }

  // ---------- boot: wait for the fonts (at most 2.5 s), then swap the heading for the shader ----------
  const fonts = Promise.all([document.fonts.load(`800 100px "JetBrains Mono"`), document.fonts.load('700 16px "JetBrains Mono"')]).catch(() => {});
  Promise.race([fonts, new Promise(r => setTimeout(r, 2500))]).then(() => {
    if (!initGL()) return;                    // fallback: the CSS heading stays as it is
    start = performance.now(); nextGlitch = start + 3200;
    rebuild();
    mark.classList.add('shaded');
    let lastW = mark.clientWidth;
    new ResizeObserver(() => { if (Math.abs(mark.clientWidth - lastW) > 2) { lastW = mark.clientWidth; rebuild(); } }).observe(mark);
    new IntersectionObserver(([e]) => { visible = e.isIntersecting; run(); }).observe(glc);
    document.addEventListener('visibilitychange', run);
    if (hover && !reduce) {                   // pointer effects for mice and pens only, so touch keeps scrolling
      mark.addEventListener('pointermove', e => {
        const r = glc.getBoundingClientRect();
        pointer = { c: (e.clientX - r.left) / r.width * cols, r: (e.clientY - r.top) / r.height * rows };
      });
      mark.addEventListener('pointerleave', () => { pointer = null; });
    }
  });
})();
