import type { Metadata } from "next";

// Todo /admin (login y panel) queda fuera de los buscadores (CLAUDE.md, checklist SEO).
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: LayoutProps<"/s/[subdomain]/admin">) {
  return children;
}
