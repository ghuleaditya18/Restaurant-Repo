import { Outlet } from "react-router-dom";
import Sidebar from "../components/Sidebar";
import Header from "../components/Header";

function DashboardLayout() {
  return (
    <div className="flex min-h-screen bg-[#F7F5F0]">

      <Sidebar />

      <div className="min-w-0 flex-1">

        <Header />

        <main className="mx-auto w-full max-w-[1700px] px-5 py-8 lg:px-9">

          <Outlet />

        </main>

      </div>

    </div>
  );
}

export default DashboardLayout;