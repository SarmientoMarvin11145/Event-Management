import { PublicFooter, PublicMobileNav, PublicNavbar } from "@/components/public/site-chrome";

export default function PublicLayout({ children }) {
  return (
    <>
      <PublicNavbar />
      {children}
      <PublicFooter />
      <PublicMobileNav />
    </>
  );
}