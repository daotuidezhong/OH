// 放映厅前排：两张躺椅 + 两只玩偶（从背后看，面朝银幕）。整张图共用一个 SVG，方便“牵脚”时脚伸到中间相碰。
// 左边粉色玩偶 = TA（上线才出现），右边戴蓝色耳罩的白玩偶 = 我。

type DollState = { visible: boolean; talking: boolean; arriving?: boolean };

const VIEW_W = 800;
const VIEW_H = 420;
/** 两张躺椅的中心（靠近观众的一端）与远端（靠近银幕的一端，向中间透视收拢）。 */
export const SEAT = {
  left: { near: 250, far: 272 },
  right: { near: 550, far: 528 },
};
/** 玩偶头顶在 SVG 中的位置（百分比），聊天气泡挂在这里。 */
export const HEAD_ANCHOR = {
  left: { x: (SEAT.left.near / VIEW_W) * 100, y: (104 / VIEW_H) * 100 },
  right: { x: (SEAT.right.near / VIEW_W) * 100, y: (104 / VIEW_H) * 100 },
};

const FOOT_Y = 84;
const FOOT_SPREAD = 27;
const MEET = 18; // 牵脚时两只脚中心离画面中线的距离

function LoungerFar({ side }: { side: "left" | "right" }) {
  const { near, far } = SEAT[side];
  const id = `lounger-${side}`;
  return (
    <g className={`lounger lounger-${side}`}>
      {/* 远端脚凳与坐垫（靠近银幕） */}
      <path d={`M${far - 78} 64 Q${far - 80} 56 ${far - 70} 55 H${far + 70} Q${far + 80} 56 ${far + 78} 64 L${near + 96} 214 H${near - 96} Z`} fill={`url(#${id}-cushion)`} stroke="#2a0d14" strokeWidth="3" strokeLinejoin="round" />
      <path d={`M${far - 66} 70 H${far + 66}`} stroke="#c25a68" strokeWidth="2" opacity=".55" />
      {[0.32, 0.62].map((t) => {
        const y = 64 + (214 - 64) * t;
        const half = 78 + (96 - 78) * t;
        const cx = far + (near - far) * t;
        return <path key={t} d={`M${cx - half + 6} ${y} Q${cx} ${y + 7} ${cx + half - 6} ${y}`} stroke="#3f121c" strokeWidth="2.4" fill="none" opacity=".55" />;
      })}
    </g>
  );
}

function LoungerBack({ side }: { side: "left" | "right" }) {
  const { near } = SEAT[side];
  const id = `lounger-${side}`;
  return (
    <g className={`lounger-back lounger-back-${side}`}>
      {/* 靠背背面（靠近观众） */}
      <path d={`M${near - 112} 278 Q${near - 112} 254 ${near - 88} 252 H${near + 88} Q${near + 112} 254 ${near + 112} 278 L${near + 120} 392 Q${near + 120} 404 ${near + 108} 404 H${near - 108} Q${near - 120} 404 ${near - 120} 392 Z`} fill={`url(#${id}-back)`} stroke="#22090f" strokeWidth="3.4" strokeLinejoin="round" />
      <path d={`M${near - 100} 264 Q${near} 256 ${near + 100} 264`} stroke="#d86b7a" strokeWidth="3" fill="none" opacity=".5" strokeLinecap="round" />
      {/* 拉扣与缝线 */}
      {[[-56, 304], [0, 298], [56, 304], [-28, 344], [28, 344], [-56, 386], [0, 380], [56, 386]].map(([dx, y]) => (
        <g key={`${dx}-${y}`}>
          <circle cx={near + dx} cy={y} r="4.2" fill="#3b0f19" />
          <circle cx={near + dx - 1.2} cy={y - 1.2} r="1.4" fill="#e7a0aa" opacity=".6" />
        </g>
      ))}
      <path d={`M${near - 56} 304 L${near} 298 L${near + 56} 304 M${near - 56} 304 L${near - 28} 344 L${near} 298 L${near + 28} 344 L${near + 56} 304 M${near - 28} 344 L${near - 56} 386 M${near - 28} 344 L${near} 380 L${near + 28} 344 L${near + 56} 386`} stroke="#3b0f19" strokeWidth="1.6" fill="none" opacity=".45" />
      {/* 扶手 */}
      {[-1, 1].map((dir) => (
        <g key={dir}>
          <path d={`M${near + dir * 104} 290 Q${near + dir * 140} 286 ${near + dir * 142} 316 L${near + dir * 140} 376 Q${near + dir * 138} 392 ${near + dir * 118} 392`} fill={`url(#${id}-arm)`} stroke="#22090f" strokeWidth="3" />
          <ellipse cx={near + dir * 124} cy="296" rx="18" ry="9" fill="#a53a4b" stroke="#22090f" strokeWidth="2.4" />
        </g>
      ))}
      {/* 黄铜脚 */}
      {[-96, 96].map((dx) => <rect key={dx} x={near + dx - 6} y="402" width="12" height="12" rx="3" fill="url(#brass)" stroke="#3b230c" strokeWidth="1.6" />)}
    </g>
  );
}

function Feet({ side, holding }: { side: "left" | "right"; holding: boolean }) {
  const { near, far } = SEAT[side];
  const inner = side === "left" ? 1 : -1;
  const feet = [-1, 1].map((dir) => far + dir * FOOT_SPREAD);
  const innerFoot = side === "left" ? feet[1] : feet[0];
  const target = 400 - inner * MEET;
  const reach = target - innerFoot;
  return (
    <g className={`feet feet-${side} ${holding ? "holding" : ""}`}>
      {feet.map((x) => {
        const isInner = x === innerFoot;
        return (
          <g key={x}>
            <path d={`M${near + (x - far) * 0.6} 190 L${x} ${FOOT_Y + 4}`} stroke="#5d3420" strokeWidth="24" strokeLinecap="round" />
            <path d={`M${near + (x - far) * 0.6} 190 L${x} ${FOOT_Y + 4}`} stroke="#7d4a2c" strokeWidth="18" strokeLinecap="round" />
            {isInner && (
              <rect className="leg-stretch" x={Math.min(x, x + reach)} y={FOOT_Y - 9} width={Math.abs(reach)} height="18" rx="9" fill="#7d4a2c" stroke="#5d3420" strokeWidth="3"
                style={{ transformOrigin: `${x}px ${FOOT_Y}px` }} />
            )}
            <g className={isInner ? "foot foot-inner" : "foot"} style={isInner ? ({ "--reach": `${reach}px` } as React.CSSProperties) : undefined}>
              <ellipse cx={x} cy={FOOT_Y} rx="17" ry="14" fill="#7d4a2c" stroke="#4a2716" strokeWidth="3" />
              <ellipse cx={x - 3} cy={FOOT_Y - 4} rx="7" ry="4.5" fill="#a8704a" opacity=".7" />
            </g>
          </g>
        );
      })}
    </g>
  );
}

function PinkDoll({ talking, holding }: { talking: boolean; holding: boolean }) {
  const cx = SEAT.left.near;
  const turned = talking || holding;
  return (
    <g className={`doll doll-pink ${talking ? "talking" : ""}`} style={{ transformOrigin: `${cx}px 260px` }}>
      {/* 两侧奶油色绒毛 */}
      <ellipse cx={cx - 80} cy="206" rx="24" ry="28" fill="url(#cream)" stroke="#c9b59a" strokeWidth="2.6" />
      <ellipse cx={cx + 80} cy="206" rx="24" ry="28" fill="url(#cream)" stroke="#c9b59a" strokeWidth="2.6" />
      <path d={`M${cx - 76} 284 Q${cx - 80} 112 ${cx} 106 Q${cx + 80} 112 ${cx + 76} 284 Z`} fill="url(#pinkBody)" stroke="#b25a72" strokeWidth="3.2" />
      <path d={`M${cx - 48} 134 Q${cx - 10} 116 ${cx + 28} 124`} stroke="#ffe0e8" strokeWidth="6" fill="none" strokeLinecap="round" opacity=".7" />
      {/* 绒毛质感 */}
      {[[-34, 160], [14, 148], [40, 190], [-12, 200], [-50, 222], [30, 230]].map(([dx, y]) => <circle key={`${dx}${y}`} cx={cx + dx} cy={y} r="2" fill="#fff0f4" opacity=".55" />)}
      {turned && (
        <g className="doll-face">
          <ellipse cx={cx + 58} cy="182" rx="4.5" ry="6" fill="#2b1a1c" />
          <ellipse cx={cx + 56} cy="200" rx="9" ry="5" fill="#ff8fa6" opacity=".7" />
        </g>
      )}
    </g>
  );
}

function WhiteDoll({ talking, holding }: { talking: boolean; holding: boolean }) {
  const cx = SEAT.right.near;
  const turned = talking || holding;
  return (
    <g className={`doll doll-white ${talking ? "talking" : ""}`} style={{ transformOrigin: `${cx}px 260px` }}>
      <path d={`M${cx - 76} 284 Q${cx - 80} 112 ${cx} 106 Q${cx + 80} 112 ${cx + 76} 284 Z`} fill="url(#whiteBody)" stroke="#a89c8c" strokeWidth="3.2" />
      <path d={`M${cx - 30} 124 Q${cx + 8} 114 ${cx + 48} 132`} stroke="#ffffff" strokeWidth="6" fill="none" strokeLinecap="round" opacity=".8" />
      {[[-34, 160], [14, 148], [40, 190], [-12, 200], [-50, 222], [30, 230]].map(([dx, y]) => <circle key={`${dx}${y}`} cx={cx + dx} cy={y} r="2" fill="#ffffff" opacity=".7" />)}
      {/* 蓝色耳罩：头带 + 两侧耳罩 */}
      <path d={`M${cx - 72} 174 Q${cx} 92 ${cx + 72} 174`} stroke="#3d6f9c" strokeWidth="11" fill="none" strokeLinecap="round" />
      <path d={`M${cx - 72} 174 Q${cx} 92 ${cx + 72} 174`} stroke="#8fc3ec" strokeWidth="6" fill="none" strokeLinecap="round" />
      {[-1, 1].map((dir) => (
        <g key={dir}>
          <ellipse cx={cx + dir * 76} cy="184" rx="22" ry="27" fill="url(#earmuff)" stroke="#3d6f9c" strokeWidth="3" />
          <ellipse cx={cx + dir * 72} cy="175" rx="7" ry="8" fill="#e4f3ff" opacity=".65" />
        </g>
      ))}
      {turned && (
        <g className="doll-face">
          <ellipse cx={cx - 50} cy="206" rx="4.5" ry="6" fill="#2b1a1c" />
          <ellipse cx={cx - 48} cy="224" rx="9" ry="5" fill="#ffa4b4" opacity=".7" />
        </g>
      )}
    </g>
  );
}

export function SeatsArt({ partner, me, holding }: { partner: DollState; me: DollState; holding: boolean }) {
  return (
    <svg className="seats-art" viewBox={`0 0 ${VIEW_W} ${VIEW_H + 16}`} role="img" aria-label={partner.visible ? "两张躺椅上坐着粉色和白色两只玩偶" : "两张躺椅，白色玩偶坐在右边，左边空着"}>
      <defs>
        {(["left", "right"] as const).map((side) => (
          <g key={side}>
            <linearGradient id={`lounger-${side}-cushion`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#5e1a26" /><stop offset="1" stopColor="#8e2f3c" /></linearGradient>
            <linearGradient id={`lounger-${side}-back`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#9b3446" /><stop offset=".55" stopColor="#7a2434" /><stop offset="1" stopColor="#4c1320" /></linearGradient>
            <linearGradient id={`lounger-${side}-arm`} x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#6a1d2b" /><stop offset=".5" stopColor="#8c2c3c" /><stop offset="1" stopColor="#5a1824" /></linearGradient>
          </g>
        ))}
        <linearGradient id="brass" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ffe09a" /><stop offset=".5" stopColor="#d9a24e" /><stop offset="1" stopColor="#8f5f22" /></linearGradient>
        <radialGradient id="pinkBody" cx=".4" cy=".25" r=".9"><stop offset="0" stopColor="#ffd3dd" /><stop offset=".55" stopColor="#f5a9bb" /><stop offset="1" stopColor="#d97f97" /></radialGradient>
        <radialGradient id="whiteBody" cx=".4" cy=".25" r=".9"><stop offset="0" stopColor="#ffffff" /><stop offset=".6" stopColor="#f4efe6" /><stop offset="1" stopColor="#d9d0c2" /></radialGradient>
        <radialGradient id="cream" cx=".4" cy=".35" r=".8"><stop offset="0" stopColor="#fffaf0" /><stop offset="1" stopColor="#eadcc4" /></radialGradient>
        <radialGradient id="earmuff" cx=".4" cy=".35" r=".8"><stop offset="0" stopColor="#cfe8fb" /><stop offset=".6" stopColor="#9ccbf0" /><stop offset="1" stopColor="#6aa2d3" /></radialGradient>
        <radialGradient id="heart" cx=".4" cy=".35" r=".8"><stop offset="0" stopColor="#ffd0dc" /><stop offset="1" stopColor="#ff5f86" /></radialGradient>
      </defs>
      {/* 地面阴影 */}
      <ellipse cx={SEAT.left.near} cy="412" rx="150" ry="16" fill="#000" opacity=".45" />
      <ellipse cx={SEAT.right.near} cy="412" rx="150" ry="16" fill="#000" opacity=".45" />
      <LoungerFar side="left" />
      <LoungerFar side="right" />
      {partner.visible && <Feet side="left" holding={holding} />}
      {me.visible && <Feet side="right" holding={holding} />}
      {holding && partner.visible && me.visible && (
        <g className="feet-heart">
          <path d="M400 48 C 386 30 360 40 372 60 L400 84 L428 60 C 440 40 414 30 400 48 Z" fill="url(#heart)" stroke="#b3284f" strokeWidth="3" />
        </g>
      )}
      <g className={`doll-slot doll-slot-left ${partner.visible ? "present" : "absent"} ${partner.arriving ? "arriving" : ""}`}>
        {partner.visible && <PinkDoll talking={partner.talking} holding={holding} />}
      </g>
      <g className={`doll-slot doll-slot-right ${me.visible ? "present" : "absent"}`}>
        {me.visible && <WhiteDoll talking={me.talking} holding={holding} />}
      </g>
      {/* 靠背最后画，挡住玩偶下半身 */}
      <LoungerBack side="left" />
      <LoungerBack side="right" />
    </svg>
  );
}
