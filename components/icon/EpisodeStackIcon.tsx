import Svg, { Circle, Ellipse, Path, Polygon, Rect, Text as SvgText } from 'react-native-svg';

const INK = '#111111';

function PersonMark({ x, y, color }: { x: number; y: number; color: string }) {
  const cx = x + 54;
  const widen = (localX: number) => cx + (localX - 54) * 1.2;
  const left = widen(16);
  const right = widen(92);
  return (
    <>
      <Ellipse cx={cx} cy={y + 36} rx={24 * 1.2} ry={24} fill={color} />
      <Path
        d={`M ${left} ${y + 130} L ${left} ${y + 96} Q ${left} ${y + 70} ${cx} ${y + 70} Q ${right} ${y + 70} ${right} ${y + 96} L ${right} ${y + 130} Z`}
        fill={color}
      />
    </>
  );
}

type EpisodeStackIconProps = {
  size?: number;
  /** 白地を黒、線と文字を白にする。 */
  inverted?: boolean;
};

/** アプリアイコン試作。画像の拡大ではなく、同じ絵を線で描いている。 */
export function EpisodeStackIcon({ size = 1024, inverted = false }: EpisodeStackIconProps) {
  const plate = inverted ? '#111111' : '#ffffff';
  const ink = inverted ? '#ffffff' : INK;

  return (
    <Svg width={size} height={size} viewBox="0 0 1024 1024">
      <Rect x={40} y={40} width={944} height={944} rx={84} fill={plate} />
      <SvgText x={108} y={188} fill={ink} fontSize={92} fontWeight="800">
        TITLE
      </SvgText>
      <SvgText x={400} y={188} fill={ink} fontSize={80} fontWeight="800">
        date
      </SvgText>
      <Rect
        x={108}
        y={263}
        width={640}
        height={480}
        rx={40}
        fill={plate}
        stroke={ink}
        strokeWidth={30}
      />
      <Polygon points="178,690 400,420 678,690" fill={ink} />
      <Circle cx={580} cy={380} r={48} fill={ink} />
      <PersonMark x={794} y={262} color={ink} />
      <PersonMark x={794} y={432} color={ink} />
      <PersonMark x={794} y={602} color={ink} />
      <Rect x={108} y={818} width={808} height={18} rx={9} fill={ink} />
      <Rect x={108} y={896} width={808} height={18} rx={9} fill={ink} />
    </Svg>
  );
}
