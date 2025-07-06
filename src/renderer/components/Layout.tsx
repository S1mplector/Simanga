import React from "react";
import { Outlet } from "react-router-dom";
import SideRail from "./SideRail";
import Header from "./Header";

const Layout: React.FC = () => {
  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden text-gray-100 bg-gray-900">
      <Header />
      <div className="flex flex-1 overflow-hidden">
        <SideRail />
        <div className="flex-1 overflow-auto">
          <Outlet />
        </div>
      </div>
    </div>
  );
};

export default Layout; 