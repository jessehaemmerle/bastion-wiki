import {
  Activity, AlertTriangle, Archive, ArrowLeft, ArrowRight, BadgeCheck, Bell, Book, BookOpen, Bookmark, Boxes, Bug,
  Calendar, CalendarClock, Check, CheckCircle2, ChevronDown, ChevronRight, ChevronsLeft, ChevronsRight, CircleHelp,
  Clipboard, ClipboardCheck, Clock, Cloud, Code2, Cog, Command, Container, Copy, Cpu, Database, Download, Edit3,
  ExternalLink, Eye, EyeOff, File, FileCode2, FileText, Files, Filter, Flame, Folder, FolderTree, GitBranch, GitPullRequest,
  Globe, GripVertical, HardDrive, Hash, Heart, History, Home, Inbox, Info, KeyRound, Laptop, LayoutDashboard, LayoutGrid,
  Lightbulb, Link2, ListChecks, Lock, LogIn, LogOut, Mail, Menu, MessageSquare, Monitor, Moon, MoreHorizontal, Move, Network,
  Package, Palette, Paperclip, PenLine, Pin, PinOff, Plus, Printer, Radar, RefreshCw, Rocket, RotateCcw, Router, Save, ScrollText,
  Search, Server, ServerCog, Settings, Shield, ShieldCheck, Siren, Sparkles, Star, StarOff, Sun, Tag, Tags, Terminal, Trash2,
  Upload, User, UserCog, UserPlus, Users, Wifi, Workflow, Wrench, X, Zap, Wand2, Gauge, Layers, Key, Type, SquareTerminal,
  Brush, Briefcase, Building2, Truck, Headphones, Printer as PrinterIcon,
} from 'lucide-react';

export const ICONS = {
  activity: Activity, 'alert-triangle': AlertTriangle, archive: Archive, 'arrow-left': ArrowLeft, 'arrow-right': ArrowRight,
  'badge-check': BadgeCheck, bell: Bell, book: Book, 'book-open': BookOpen, bookmark: Bookmark, boxes: Boxes, bug: Bug,
  calendar: Calendar, 'calendar-clock': CalendarClock, check: Check, 'check-circle': CheckCircle2, 'chevron-down': ChevronDown,
  'chevron-right': ChevronRight, 'chevrons-left': ChevronsLeft, 'chevrons-right': ChevronsRight, help: CircleHelp,
  clipboard: Clipboard, 'clipboard-check': ClipboardCheck, clock: Clock, cloud: Cloud, code: Code2, cog: Cog, command: Command,
  container: Container, copy: Copy, cpu: Cpu, database: Database, download: Download, edit: Edit3, 'external-link': ExternalLink,
  eye: Eye, 'eye-off': EyeOff, file: File, 'file-code': FileCode2, 'file-text': FileText, files: Files, filter: Filter,
  flame: Flame, folder: Folder, 'folder-tree': FolderTree, 'git-branch': GitBranch, 'git-pull-request': GitPullRequest,
  globe: Globe, grip: GripVertical, 'hard-drive': HardDrive, hash: Hash, heart: Heart, history: History, home: Home,
  inbox: Inbox, info: Info, key: Key, 'key-round': KeyRound, laptop: Laptop, dashboard: LayoutDashboard, grid: LayoutGrid,
  lightbulb: Lightbulb, link: Link2, 'list-checks': ListChecks, lock: Lock, 'log-in': LogIn, 'log-out': LogOut, mail: Mail,
  menu: Menu, message: MessageSquare, monitor: Monitor, moon: Moon, more: MoreHorizontal, move: Move, network: Network,
  package: Package, palette: Palette, paperclip: Paperclip, pen: PenLine, pin: Pin, 'pin-off': PinOff, plus: Plus,
  printer: Printer, radar: Radar, refresh: RefreshCw, rocket: Rocket, undo: RotateCcw, router: Router, save: Save,
  scroll: ScrollText, search: Search, server: Server, 'server-cog': ServerCog, settings: Settings, shield: Shield,
  'shield-check': ShieldCheck, siren: Siren, sparkles: Sparkles, star: Star, 'star-off': StarOff, sun: Sun, tag: Tag,
  tags: Tags, terminal: Terminal, 'square-terminal': SquareTerminal, trash: Trash2, upload: Upload, user: User,
  'user-cog': UserCog, 'user-plus': UserPlus, users: Users, wifi: Wifi, workflow: Workflow, wrench: Wrench, x: X, zap: Zap,
  wand: Wand2, gauge: Gauge, layers: Layers, type: Type, brush: Brush, briefcase: Briefcase, building: Building2,
  truck: Truck, headphones: Headphones, 'printer-alt': PrinterIcon,
};

/** Icons offered in pickers for spaces / templates */
export const PICKER_ICONS = [
  'folder', 'server', 'server-cog', 'network', 'router', 'wifi', 'database', 'hard-drive', 'cloud', 'container', 'cpu',
  'terminal', 'square-terminal', 'code', 'git-branch', 'workflow', 'boxes', 'package', 'shield', 'shield-check', 'lock',
  'key-round', 'siren', 'flame', 'bug', 'activity', 'gauge', 'radar', 'monitor', 'laptop', 'printer', 'headphones',
  'users', 'briefcase', 'building', 'book-open', 'scroll', 'list-checks', 'lightbulb', 'rocket', 'wrench', 'globe',
  'mail', 'calendar', 'layers', 'zap', 'sparkles', 'star',
];

export default function Icon({ name, size = 16, className, strokeWidth = 1.9, ...rest }) {
  const Cmp = ICONS[name] || ICONS.file;
  return <Cmp size={size} className={className} strokeWidth={strokeWidth} aria-hidden="true" {...rest} />;
}

/** Page icons can be emoji or icon names */
export function PageIcon({ icon, fallback = 'file-text', size = 16 }) {
  if (icon && !ICONS[icon]) return <span className="emoji-icon" style={{ fontSize: size }}>{icon}</span>;
  return <Icon name={icon || fallback} size={size} />;
}
