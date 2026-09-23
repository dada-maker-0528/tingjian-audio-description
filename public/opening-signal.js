// Hand-built SVG geometry. The signal is resolution independent; it contains no
// raster artwork or embedded reference image.
const WAVE_SAMPLES = [
  [915,206,694,1], [922,296,625,.44], [928,315,640,.57],
  [935,245,670,.91], [941,273,618,.40], [947,314,617,.77],
  [955,322,611,.43], [963,310,646,.86], [971,352,610,.69],
  [978,324,600,.59], [985,333,551,.93], [993,371,609,.77],
  [1000,354,581,.84], [1008,388,573,.72], [1015,356,550,.43],
  [1022,291,612,.80], [1026,393,620,.86], [1033,375,548,.56],
  [1042,391,534,.82], [1049,409,546,.73], [1057,420,536,.83],
  [1064,437,514,.58], [1072,425,494,.88], [1079,452,484,.77],
  [1087,440,517,.62], [1097,390,504,.74], [1104,425,557,.65],
  [1112,446,527,.44], [1120,359,574,.65], [1126,357,543,.54],
  [1133,390,497,.37], [1141,336,597,.90], [1149,428,514,.44],
  [1156,455,487,.53], [1163,432,511,.57], [1169,439,489,.38],
  [1176,412,525,.64], [1182,426,542,.74], [1190,400,513,.66],
  [1197,445,501,.49], [1204,434,515,.40], [1211,439,531,.56],
  [1218,396,567,.73], [1225,443,522,.40], [1233,435,526,.44],
  [1244,414,516,.70], [1251,380,560,.86], [1259,442,499,.41],
  [1267,452,505,.56], [1274,466,487,.37], [1281,451,491,.47],
  [1288,431,515,.72], [1295,457,494,.57], [1301,448,532,.73],
  [1308,446,514,.40], [1314,443,510,.48], [1321,426,533,.60],
  [1327,443,515,.44], [1334,435,563,.68], [1341,443,512,.37],
  [1347,452,509,.66], [1353,373,581,.86], [1361,380,557,.81],
  [1368,447,515,.67], [1375,438,523,.47], [1382,458,540,.73],
  [1389,436,521,.58], [1399,400,515,.74], [1405,432,524,.73],
  [1413,455,494,.61], [1420,453,500,.50], [1427,462,490,.63],
  [1434,455,484,.45], [1442,440,497,.82], [1450,468,482,.48],
  [1458,468,481,.44], [1466,441,508,.74], [1473,463,484,.46],
  [1480,469,478,.62], [1488,460,478,.62],
];

const RINGS = [
  [546,1002,271,672,.030], [574,1002,280,662,.050],
  [602,1001,290,651,.080], [624,1001,299,641,.160],
  [638,1001,309,631,.200], [660,1001,319,621,.280],
  [682,1001,329,612,.380], [703,1001,339,602,.420],
  [721,1001,349,592,.530], [740,1001,359,583,.850],
  [760,1001,369,574,1], [778,1001,378,565,.950],
  [795,1000,388,556,.800], [812,992,397,547,.740],
  [828,984,406,538,.770], [844,976,413,531,.850],
  [861,966,420,524,.980],
];

function eyeContour([left,right,top,bottom]) {
  const mid = 472;
  const width = right-left;
  const crown = left+width*.57;
  const upper = mid-top;
  const lower = bottom-mid;
  return `M ${right} ${mid} C ${right-width*.17} ${mid-upper*.62} ${crown+width*.15} ${top} ${crown} ${top} C ${left+width*.21} ${top} ${left} ${mid-upper*.55} ${left} ${mid} C ${left} ${mid+lower*.55} ${left+width*.21} ${bottom} ${crown} ${bottom} C ${crown+width*.15} ${bottom} ${right-width*.17} ${mid+lower*.62} ${right} ${mid} Z`;
}

export function openingSignal() {
  const bars = WAVE_SAMPLES.map(([x,top,bottom,opacity],i) => {
    const strong = opacity >= .7;
    const dots = strong || i % 4 === 1;
    const width = strong ? .95 : .7;
    return `<g opacity="${opacity}"><path d="M${x} ${top}V${bottom}" stroke-width="${width}"/>${dots ? `<circle cx="${x}" cy="${top}" r="${strong?1.35:.8}" fill="#fff" stroke="none"/><circle cx="${x}" cy="${bottom}" r="${strong?1.35:.8}" fill="#fff" stroke="none"/>` : ''}</g>`;
  }).join('');
  const rings = RINGS.map((ring,i)=>`<path d="${eyeContour(ring)}" stroke="url(#tj-signal-ring)" stroke-width="${i>9?1.13:.86}" opacity="${ring[4]}"/>`).join('');
  const sparks = [[915,206,2.15],[915,694,2.1],[935,670,1.6],
    [963,646,1.6],[1022,291,1.7],[1026,620,1.5],[1097,390,1.6],
    [1141,336,1.45],[1141,597,1.4],[1251,380,1.65],
    [1353,581,1.85],[1361,380,1.65],[1399,400,1.55],
    [1466,508,1.3],[1503,473,1.2],[1533,473,1.1],[1559,473,1.45]];
  return `<svg class="opening-signal" viewBox="0 0 1672 941" fill="none" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="tj-signal-ring" x1="547" y1="472" x2="1001" y2="472" gradientUnits="userSpaceOnUse"><stop stop-color="#b9bdbe" stop-opacity=".38"/><stop offset=".42" stop-color="#e7e8e7" stop-opacity=".80"/><stop offset=".74" stop-color="#fffffb"/><stop offset="1" stop-color="#fff"/></linearGradient>
      <linearGradient id="tj-signal-axis" x1="978" y1="473" x2="1606" y2="473" gradientUnits="userSpaceOnUse"><stop stop-color="#fff"/><stop offset=".67" stop-color="#fff" stop-opacity=".91"/><stop offset="1" stop-color="#fff" stop-opacity=".12"/></linearGradient>
      <radialGradient id="tj-signal-core"><stop stop-color="#fff" stop-opacity=".8"/><stop offset=".20" stop-color="#fff" stop-opacity=".25"/><stop offset=".50" stop-color="#fff" stop-opacity=".08"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
      <radialGradient id="tj-signal-shadow"><stop stop-color="#25282a" stop-opacity=".82"/><stop offset=".7" stop-color="#242728" stop-opacity=".52"/><stop offset="1" stop-color="#222526" stop-opacity="0"/></radialGradient>
      <filter id="tj-signal-soft" x="-150%" y="-150%" width="400%" height="400%"><feGaussianBlur stdDeviation="4.5"/></filter>
      <filter id="tj-signal-halo" x="-150%" y="-150%" width="400%" height="400%"><feGaussianBlur stdDeviation="2"/></filter>
      <mask id="tj-signal-wave-mask"><rect width="1672" height="941" fill="#fff"/><path d="M914 419C947 423 976 450 1000 472C976 498 947 521 914 524Z" fill="#000"/></mask>
    </defs>
    <g class="opening-signal-wave" stroke="#f8faf8" stroke-linecap="round" mask="url(#tj-signal-wave-mask)">
      <g opacity=".25" filter="url(#tj-signal-halo)">${bars}</g>
      ${bars}
    </g>
    <ellipse cx="911" cy="472" rx="85" ry="73" fill="url(#tj-signal-shadow)"/>
    <g class="opening-signal-rings">${rings}<circle cx="912" cy="471" r="31.5" stroke="#fafbf8" stroke-width="1.15"/></g>
    <path d="M995 473H1605" stroke="url(#tj-signal-axis)" stroke-width="6" opacity=".28" filter="url(#tj-signal-soft)"/>
    <path d="M995 473H1598" stroke="url(#tj-signal-axis)" stroke-width="1.6"/>
    <path d="M991 465L999 472L991 480" stroke="#fff" stroke-width="2.1" opacity=".68" filter="url(#tj-signal-halo)"/>
    <ellipse cx="913" cy="471" rx="69" ry="70" fill="url(#tj-signal-core)"/>
    <circle cx="912" cy="471" r="18" fill="#fff" opacity=".48" filter="url(#tj-signal-soft)"/>
    <circle cx="912" cy="471" r="12.6" fill="#fff"/>
    <path d="M867 425Q889 411 913 419" stroke="#fff" stroke-width="4.5" opacity=".5" filter="url(#tj-signal-soft)"/>
    <g fill="#fff">${sparks.map(([x,y,r])=>`<circle cx="${x}" cy="${y}" r="${r*2.9}" opacity=".60" filter="url(#tj-signal-soft)"/><circle cx="${x}" cy="${y}" r="${r}"/>`).join('')}</g>
  </svg>`;
}
