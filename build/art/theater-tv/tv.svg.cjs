// 生成小电视 SVG（on = 开机画面）。坐标单位 = 房间背景原图像素。
module.exports = function tvSvg(on) {
  const W = 180, H = 236;
  const outline = "#3a2116";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<defs>
  <filter id="grain" x="0" y="0" width="100%" height="100%">
    <feTurbulence type="fractalNoise" baseFrequency="0.012 0.42" numOctaves="3" seed="7" result="n"/>
    <feColorMatrix in="n" type="matrix" values="0 0 0 0 0.20  0 0 0 0 0.09  0 0 0 0 0.03  0 0 0 0.9 -0.22" result="g"/>
    <feComposite in="g" in2="SourceGraphic" operator="in"/>
  </filter>
  <linearGradient id="woodFront" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#93552a"/><stop offset=".55" stop-color="#7a431b"/><stop offset="1" stop-color="#5c2f11"/>
  </linearGradient>
  <linearGradient id="woodTop" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="#a86a36"/><stop offset=".5" stop-color="#93592c"/><stop offset="1" stop-color="#7c4720"/>
  </linearGradient>
  <linearGradient id="woodDark" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#66340f"/><stop offset="1" stop-color="#47230a"/>
  </linearGradient>
  <linearGradient id="panel" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#85491d"/><stop offset="1" stop-color="#653412"/>
  </linearGradient>
  <linearGradient id="brass" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#ffe09a"/><stop offset=".45" stop-color="#d9a24e"/><stop offset="1" stop-color="#8f5f22"/>
  </linearGradient>
  <linearGradient id="bezel" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#f6e6c8"/><stop offset=".6" stop-color="#e3c9a0"/><stop offset="1" stop-color="#c4a47a"/>
  </linearGradient>
  <radialGradient id="glassOff" cx=".42" cy=".38" r=".75">
    <stop offset="0" stop-color="#4d6466"/><stop offset=".6" stop-color="#2f3f43"/><stop offset="1" stop-color="#1b2427"/>
  </radialGradient>
  <radialGradient id="glassOn" cx=".5" cy=".48" r=".72">
    <stop offset="0" stop-color="#fff1c9"/><stop offset=".45" stop-color="#ffd08c"/><stop offset=".85" stop-color="#f09a5f"/><stop offset="1" stop-color="#b8603c"/>
  </radialGradient>
  <radialGradient id="knob" cx=".35" cy=".3" r=".8">
    <stop offset="0" stop-color="#fff3d6"/><stop offset=".5" stop-color="#e2c08c"/><stop offset="1" stop-color="#9b7246"/>
  </radialGradient>
  <radialGradient id="ball" cx=".35" cy=".3" r=".8">
    <stop offset="0" stop-color="#ffd6c4"/><stop offset=".5" stop-color="#df7059"/><stop offset="1" stop-color="#8f3628"/>
  </radialGradient>
  <linearGradient id="chrome" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="#6f6a64"/><stop offset=".5" stop-color="#e9e4dc"/><stop offset="1" stop-color="#7d7770"/>
  </linearGradient>
  <pattern id="mesh" width="5" height="5" patternUnits="userSpaceOnUse">
    <rect width="5" height="5" fill="#3c1d08"/><rect width="2.4" height="2.4" fill="#8c5626"/><rect x="2.5" y="2.5" width="2.4" height="2.4" fill="#6e3d17"/>
  </pattern>
  <pattern id="scan" width="4" height="3" patternUnits="userSpaceOnUse">
    <rect width="4" height="1" fill="#000" opacity=".08"/>
  </pattern>
  <clipPath id="screenClip"><rect x="45" y="65" width="70" height="60" rx="13"/></clipPath>
  <filter id="soft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="4"/></filter>
  <filter id="softSmall" x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="2"/></filter>
  <radialGradient id="shadow" cx=".5" cy=".5" r=".5">
    <stop offset="0" stop-color="#3a1f12" stop-opacity=".42"/><stop offset="1" stop-color="#3a1f12" stop-opacity="0"/>
  </radialGradient>
</defs>

<!-- 靠墙阴影：柜子和电视背后贴着墙的一圈暗影 -->
<rect x="2" y="120" width="176" height="96" rx="10" fill="#2a1408" opacity=".28" filter="url(#soft)"/>
<rect x="26" y="34" width="128" height="110" rx="14" fill="#2a1408" opacity=".2" filter="url(#soft)"/>
<!-- 地面接触阴影：紧贴底座 -->
<rect x="8" y="207" width="164" height="12" rx="6" fill="#2a1408" opacity=".5" filter="url(#softSmall)"/>

<!-- ============ 电视柜 ============ -->
<!-- 柜腿（车削圆脚，黄铜脚套） -->
${[22, 158].map((x) => `
  <path d="M${x - 5} 210 h10 l-1.5 5 a3.5 3.5 0 0 1 -7 0 z" fill="url(#woodDark)" stroke="${outline}" stroke-width="1.4"/>
  <rect x="${x - 4}" y="214" width="8" height="2.5" rx="1" fill="url(#brass)"/>`).join("")}
<!-- 柜体 -->
<rect x="12" y="160" width="156" height="52" rx="3" fill="url(#woodFront)" stroke="${outline}" stroke-width="2"/>
<rect x="12" y="160" width="156" height="52" rx="3" filter="url(#grain)" fill="#000"/>
<!-- 顶板：露出的顶面 + 前沿倒角 -->
<path d="M8 137 Q8 133 12 133 H168 Q172 133 172 137 V156 H8 Z" fill="url(#woodTop)" stroke="${outline}" stroke-width="2"/>
<path d="M8 137 Q8 133 12 133 H168 Q172 133 172 137 V156 H8 Z" filter="url(#grain)" fill="#000"/>
<path d="M14 139 H166 M12 145 H168" stroke="#6d3b16" stroke-width=".8" opacity=".5"/>
<rect x="6" y="155" width="168" height="7" rx="2.5" fill="url(#woodDark)" stroke="${outline}" stroke-width="1.6"/>
<line x1="9" y1="156.6" x2="171" y2="156.6" stroke="#b8763e" stroke-width="1" opacity=".9"/>
<!-- 底座线脚 -->
<rect x="10" y="206" width="160" height="6" rx="2" fill="url(#woodDark)" stroke="${outline}" stroke-width="1.4"/>

<ellipse cx="90" cy="150" rx="66" ry="5" fill="#2c1407" opacity=".35"/>
<!-- 左柜门 -->
<rect x="19" y="167" width="44" height="34" rx="2" fill="url(#panel)" stroke="${outline}" stroke-width="1.4"/>
<rect x="23" y="171" width="36" height="26" rx="1.5" fill="none" stroke="#5e341d" stroke-width="1.2"/>
<path d="M23.5 171.5 H58.5" stroke="#ad6d38" stroke-width="1" opacity=".9"/>
<circle cx="55" cy="184" r="2.6" fill="url(#brass)" stroke="${outline}" stroke-width=".9"/>
<!-- 中间开放格：录像带 -->
<rect x="68" y="167" width="44" height="34" rx="1.5" fill="#3b2216" stroke="${outline}" stroke-width="1.4"/>
<rect x="69" y="168" width="42" height="5" fill="#2a170f" opacity=".7"/>
${[["#c95b48", 0], ["#e2b25e", 1], ["#5f8f88", 2], ["#e9d6b4", 3], ["#8b5a8c", 4]].map(([c, i]) => `
  <rect x="${72 + i * 7.6}" y="${176 + (i % 2)}" width="6.4" height="${24 - (i % 2)}" rx=".8" fill="${c}" stroke="#2a170f" stroke-width=".8"/>
  <rect x="${73.4 + i * 7.6}" y="${180 + (i % 2)}" width="3.6" height="7" fill="#fff6e6" opacity=".55"/>`).join("")}
<!-- 右侧喇叭网 -->
<rect x="117" y="167" width="44" height="34" rx="2" fill="url(#panel)" stroke="${outline}" stroke-width="1.4"/>
<rect x="121" y="171" width="36" height="26" rx="1.5" fill="url(#mesh)" stroke="#4a2a18" stroke-width="1.2"/>
<rect x="121" y="171" width="36" height="26" rx="1.5" fill="#ffb060" opacity=".08"/>

<g transform="translate(0 4)">
<!-- ============ 显像管电视 ============ -->
<!-- 后壳（显像管鼓包，从上方能看到一点） -->
<path d="M50 44 Q52 30 70 28 H110 Q128 30 130 44 Z" fill="url(#woodDark)" stroke="${outline}" stroke-width="1.8"/>
<path d="M58 40 Q60 33 72 32 H96" stroke="#9a5c34" stroke-width="1.4" fill="none" opacity=".8"/>
<!-- 天线 -->
<path d="M84 30 L60 4" stroke="url(#chrome)" stroke-width="2.4" stroke-linecap="round"/>
<path d="M96 30 L126 2" stroke="url(#chrome)" stroke-width="2.4" stroke-linecap="round"/>
<circle cx="59" cy="4" r="3.6" fill="url(#ball)" stroke="${outline}" stroke-width="1"/>
<circle cx="127" cy="2.6" r="3.6" fill="url(#ball)" stroke="${outline}" stroke-width="1"/>
<rect x="80" y="26" width="20" height="7" rx="3.5" fill="url(#brass)" stroke="${outline}" stroke-width="1.2"/>

<!-- 机身顶面 -->
<path d="M30 52 Q30 40 42 40 H138 Q150 40 150 52 Z" fill="url(#woodTop)" stroke="${outline}" stroke-width="2"/>
<path d="M30 52 Q30 40 42 40 H138 Q150 40 150 52 Z" filter="url(#grain)" fill="#000"/>
<path d="M40 44 H140" stroke="#c88a4e" stroke-width="1.2" opacity=".85"/>
<!-- 机身正面 -->
<rect x="28" y="50" width="124" height="94" rx="9" fill="url(#woodFront)" stroke="${outline}" stroke-width="2.2"/>
<rect x="28" y="50" width="124" height="94" rx="9" filter="url(#grain)" fill="#000"/>
<path d="M32 56 Q32 53 36 53 H146" stroke="#b77840" stroke-width="1.4" fill="none" opacity=".9"/>
<path d="M150 58 V136 Q150 141 145 141 H34" stroke="#55301b" stroke-width="1.6" fill="none" opacity=".7"/>

<!-- 屏框 -->
<rect x="37" y="58" width="86" height="75" rx="15" fill="url(#bezel)" stroke="${outline}" stroke-width="1.8"/>
<rect x="40.5" y="61.5" width="79" height="68" rx="13.5" fill="none" stroke="#fff6e4" stroke-width="1" opacity=".7"/>
<!-- 屏幕 -->
<rect x="44" y="64" width="72" height="62" rx="14" fill="#1a1412" stroke="${outline}" stroke-width="1.4"/>
<g clip-path="url(#screenClip)">
  ${on ? `
  <rect x="44" y="64" width="72" height="62" fill="url(#glassOn)"/>
  <path d="M60 124 Q72 104 86 112 T118 104 V128 H44 Z" fill="#e88b5c" opacity=".55"/>
  <circle cx="98" cy="80" r="7" fill="#fff6dc" opacity=".8"/>
  <path d="M73 82 L93 95 L73 108 Z" fill="#cf5843" stroke="#8f3628" stroke-width="1.2" stroke-linejoin="round"/>
  <path d="M75.5 87 L84 92.5" stroke="#ffb59f" stroke-width="1.6" stroke-linecap="round"/>
  <rect x="44" y="64" width="72" height="62" fill="url(#scan)"/>
  ` : `
  <rect x="44" y="64" width="72" height="62" fill="url(#glassOff)"/>
  `}
  <path d="M50 72 Q58 66 74 66" stroke="#fff" stroke-width="3" fill="none" opacity="${on ? ".35" : ".22"}" stroke-linecap="round"/>
  <path d="M52 84 L70 68" stroke="#fff" stroke-width="5" opacity="${on ? ".12" : ".1"}" stroke-linecap="round"/>
  <ellipse cx="80" cy="95" rx="40" ry="34" fill="none" stroke="#000" stroke-width="10" opacity=".18"/>
</g>
<rect x="44" y="64" width="72" height="62" rx="14" fill="none" stroke="#2a1a12" stroke-width="1.4"/>

<!-- 右侧控制区 -->
<rect x="127" y="60" width="19" height="72" rx="4" fill="url(#woodDark)" stroke="${outline}" stroke-width="1.4"/>
${[73, 92].map((y) => `
  <circle cx="136.5" cy="${y}" r="6.2" fill="#4a2a18"/>
  <circle cx="136.5" cy="${y - .6}" r="5.4" fill="url(#knob)" stroke="${outline}" stroke-width="1"/>
  <line x1="136.5" y1="${y - .6}" x2="136.5" y2="${y - 5}" stroke="#6b3a22" stroke-width="1.3" stroke-linecap="round"/>`).join("")}
<rect x="130" y="103" width="13" height="24" rx="2" fill="url(#mesh)" stroke="#2f1a10" stroke-width="1"/>
<!-- 黄铜铭牌 -->
<rect x="70" y="135.5" width="20" height="4" rx="1.5" fill="url(#brass)" stroke="${outline}" stroke-width=".8"/>
<!-- 电视底部压在柜面上的接触阴影 -->
<path d="M32 145 H148" stroke="#3a1f12" stroke-width="2" opacity=".35"/>
</g>
</svg>`;
};
