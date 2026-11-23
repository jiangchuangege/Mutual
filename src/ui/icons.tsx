import {
  BookOpen,
  Clock,
  Compass,
  Film,
  Heart,
  HeartPulse,
  Headphones,
  Home,
  Leaf,
  ListMusic,
  Pause,
  Play,
  Radio,
  Search,
  Settings,
  Sparkles,
  Star,
  Tv,
  type LucideIcon,
} from 'lucide-react-native';

/**
 * 全站图标（Lucide，GitHub 开源 / ISC 授权 / 细线二次元风）。
 *
 * 为什么集中在这里：页面里只写 `<Ico name="film" />`，以后换图标库/换风格只改这一个文件，
 * 不用在十几个页面里翻 emoji。颜色和尺寸也统一定义，保证每个页面观感一致。
 */
export const ICONS = {
  home: Home,
  life: Leaf,
  care: HeartPulse,
  cinema: Film,
  live: Tv,
  tv: Tv,
  radio: Radio,
  fm: Headphones,
  music: ListMusic,
  book: BookOpen,
  play: Play,
  pause: Pause,
  heart: Heart,
  star: Star,
  sparkle: Sparkles,
  time: Clock,
  discover: Compass,
  search: Search,
  settings: Settings,
} as const;

export type IconName = keyof typeof ICONS;

export const ICON_SIZE = { sm: 14, md: 18, lg: 22, xl: 28 } as const;
export type IconSize = keyof typeof ICON_SIZE;

/** 统一图标组件：`<Ico name="film" size="lg" color="#57F8FF" />` */
export function Ico({
  name,
  size = 'md',
  color = 'currentColor',
  strokeWidth = 1.8,
}: {
  name: IconName;
  size?: IconSize | number;
  color?: string;
  strokeWidth?: number;
}) {
  const C: LucideIcon | undefined = ICONS[name];
  if (!C) return null;
  const px = typeof size === 'number' ? size : ICON_SIZE[size];
  return <C size={px} color={color} strokeWidth={strokeWidth} />;
}
