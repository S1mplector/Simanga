import React from "react";
import { NavLink } from "react-router-dom";
import { HomeIcon, ArrowDownTrayIcon, Cog6ToothIcon, BookmarkIcon, Bars3Icon } from "@heroicons/react/24/outline";

const iconClasses = "w-6 h-6 text-gray-400 group-hover:text-white";

const SideRail: React.FC = () => {
  return (
    <nav className="flex flex-col items-center bg-rail w-16 h-full py-4 space-y-6">
      <NavLink to="/browse" className="group">
        <HomeIcon className={iconClasses} />
      </NavLink>
      <NavLink to="/downloads" className="group">
        <ArrowDownTrayIcon className={iconClasses} />
      </NavLink>
      <NavLink to="/library" className="group">
        <BookmarkIcon className={iconClasses} />
      </NavLink>
      <NavLink to="/tracking" className="group">
        <Bars3Icon className={iconClasses} />
      </NavLink>
      <NavLink to="/settings" className="group mt-auto">
        <Cog6ToothIcon className={iconClasses} />
      </NavLink>
    </nav>
  );
};

export default SideRail; 