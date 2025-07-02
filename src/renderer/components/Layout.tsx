import React from "react";
import { Outlet } from "react-router-dom";
import SideRail from "./SideRail";

const Layout: React.FC = () => {
  return (
    <div className="flex h-screen w-screen overflow-hidden text-gray-100 bg-gray-900">
      <SideRail />
      <div className="flex-1 overflow-auto">
        <Outlet />
      </div>
    </div>
  );
};

export default Layout; 