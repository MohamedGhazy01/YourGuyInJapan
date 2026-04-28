import { Footer } from "./Footer";
import { MobileTabBar } from "./MobileTabBar";
import { Navbar } from "./Navbar";

export const Shell = ({ children }) => (
  <div className="app-shell min-h-screen">
    <Navbar />
    <main className="app-main">{children}</main>
    <Footer />
    <MobileTabBar />
  </div>
);
