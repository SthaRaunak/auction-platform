import { Armchair, Factory, Fish, LandPlot, Megaphone, Microscope, Monitor, Mountain, Package, Recycle, ScrollText, TreePine, Truck, Wheat, type LucideIcon } from 'lucide-react';

const ICONS: Record<string, LucideIcon> = {
  vehicles: Truck,
  'scrap-metal': Recycle,
  'e-waste': Monitor,
  'office-furniture': Armchair,
  machinery: Factory,
  confiscated: Package,
  'land-property': LandPlot,
  timber: TreePine,
  minerals: Mountain,
  licences: ScrollText,
  advertising: Megaphone,
  fisheries: Fish,
  'agri-produce': Wheat,
  medical: Microscope,
};

export function CategoryIcon({ slug, size = 26 }: { slug: string; size?: number }) {
  const Icon = ICONS[slug] ?? Package;
  return <Icon size={size} strokeWidth={1.4} aria-hidden />;
}
